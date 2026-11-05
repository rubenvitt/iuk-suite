import { revalidatePath } from "next/cache";
import { auditActor, auditDelivery, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/host";
import { Abgelehnt, ladeVertragsdatei, legeVertragAb, NichtGefunden } from "../../../../_lib/vermietung";
import { idSchema } from "../../../../_lib/vermietungEingabe";
import { istDokumentart, type Dokumentart } from "../../../../_lib/vermietungTypen";
import { anhangKopf, pruefePdf, VERTRAG_MAX_BYTES } from "../../../../_lib/vermietungPdf";
import { leitungImHandler } from "../../../../_lib/vermietungZugang";
import { scanneVertrag, scanSatz } from "../../../../_lib/vertragScan";

/**
 * `GET /vermietung/vertrag/<id>?art=<art>` lädt die unterschriebene Fassung eines Dokuments einer Zusage herunter,
 * `POST` legt sie ab (Formularfeld `datei`; clamd prüft vor dem Speichern, IDA-343). Ohne `art` der Mietvertrag. Ein Route Handler statt einer Server Action, weil `serverActions.bodySizeLimit` (1 MB) suiteweit gilt
 * und für eine einzelne PDF nicht angehoben wird (Vorbild `aufgaben/a/[id]/nachweis/hochladen/route.ts`).
 *
 * Riegel in dieser Datei, weil ein Handler kein Layout über sich hat: Host → Leitung → Kennung → Zeile. Alles,
 * was nicht passt, ist ein 404 ohne Rumpf; die Kennung wird gegen die Datenbank aufgelöst, nie geglaubt.
 */

const NICHT_DA = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" } });

function json(status: number, rumpf: { ok: true } | { ok: false; fehler: string }): Response {
  return new Response(JSON.stringify(rumpf), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

type Ctx = { params: Promise<{ id: string }> };

function artAus(req: Request): Dokumentart | null {
  const roh = new URL(req.url).searchParams.get("art") ?? "mietvertrag";
  return istDokumentart(roh) ? roh : null;
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const viewer = await leitungImHandler();
  if (!viewer) return NICHT_DA();
  return auditDelivery("gemeinschaft", "download", "vertragsdatei", auditActor(viewer), async (target) => {
    const { id } = await ctx.params;
    const art = artAus(req);
    if (!idSchema.safeParse(id).success || !art) return NICHT_DA();
    const datei = ladeVertragsdatei(getDb(), id, art);
    if (!datei) return NICHT_DA();
    target(JSON.stringify([id, art]));
    return new Response(new Uint8Array(datei.inhalt), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": anhangKopf(datei.name),
        "content-length": String(datei.inhalt.length),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  });
}

/** Rand für Multipart-Grenzen und Feldnamen — keine zweite Größengrenze, nur ein früher Verzicht aufs Puffern. */
const MULTIPART_UEBERHANG = 64 * 1024;

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  // Ein Formular einer fremden Seite: Browser schicken `sec-fetch-site`; fehlt der Kopf, entscheidet die Sitzung.
  if (req.headers.get("sec-fetch-site") === "cross-site") return NICHT_DA();
  const viewer = await leitungImHandler();
  if (!viewer) return NICHT_DA();
  const { id } = await ctx.params;
  const art = artAus(req);
  if (!idSchema.safeParse(id).success || !art) return NICHT_DA();

  const laenge = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(laenge) && laenge > VERTRAG_MAX_BYTES + MULTIPART_UEBERHANG) return json(413, { ok: false, fehler: "Die Datei ist größer als 10 MB." });

  let datei: FormDataEntryValue | null;
  try {
    datei = (await req.formData()).get("datei");
  } catch {
    return json(400, { ok: false, fehler: "Die Datei kam nicht vollständig an. Bitte noch einmal versuchen." });
  }
  if (!(datei instanceof File)) return json(400, { ok: false, fehler: "Bitte eine PDF-Datei wählen." });
  if (datei.size > VERTRAG_MAX_BYTES) return json(413, { ok: false, fehler: "Die Datei ist größer als 10 MB." });
  const bytes = Buffer.from(await datei.arrayBuffer());
  const pruefung = pruefePdf(datei.name, datei.type, bytes);
  if (!pruefung.ok) return json(pruefung.status, { ok: false, fehler: pruefung.fehler });
  const scan = await scanneVertrag(bytes);
  if (scan.art !== "clean") return json(scan.art === "infected" ? 422 : 503, { ok: false, fehler: scanSatz(scan) ?? "" });

  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    try {
      legeVertragAb(getDb(), id, art, pruefung.name, bytes, Date.now());
    } catch (e) {
      if (e instanceof NichtGefunden) return NICHT_DA();
      if (e instanceof Abgelehnt) return json(409, { ok: false, fehler: e.message });
      throw e;
    }
    revalidatePath("/m/gemeinschaft", "layout");
    return json(200, { ok: true });
  });
}
