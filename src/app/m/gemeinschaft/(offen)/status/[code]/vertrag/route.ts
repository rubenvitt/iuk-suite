import { revalidatePath } from "next/cache";
import { auditDelivery, withAuditContext } from "@/core/audit/server";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb } from "../../../../_db/client";
import { ansichtPdf } from "../../../../_lib/dokumentErzeugen";
import { hostAbweisung } from "../../../../_lib/host";
import { istLinkCode } from "../../../../_lib/kennung";
import { Abgelehnt, dokumentFuerStatus, legeUnterschriebenAb, NichtGefunden, pruefeUnterschreibbar } from "../../../../_lib/vermietung";
import { anhangKopf, ansichtKopf, VERTRAG_MAX_BYTES } from "../../../../_lib/vermietungPdf";
import { istDokumentart, type Dokumentart } from "../../../../_lib/vermietungTypen";
import { jsonAntwort, leseDatei, NICHT_DA, pdfAntwort } from "../../../../_lib/uploadLesen";
import { scanneVertrag, scanSatz } from "../../../../_lib/vertragScan";
import { dokumentDateiname, dokumentTitel } from "../../../../_lib/vertragName";
import { fotoAlsPdf, pruefeUnterschriebeneDatei } from "../../../../_lib/vertragUnterschrift";

/**
 * `/status/<code>/vertrag?art=<art>` — ein Dokument einer Zusage für die anfragende Person, ohne Anmeldung (IDA-343,
 * IDA-354; ohne `art` der Mietvertrag). Der Code ist der Zugang, wie bei der Statusseite selbst; aufgelöst wird gegen
 * die Datenbank, nie über die Kennung.
 *
 * `GET`: die unterschriebene Fassung zum Herunterladen, sonst das freigegebene Dokument mit den Werten der Leitung
 * zum Ansehen (`inline`).
 * `POST`: eine unterschriebene PDF oder ein Foto davon (Feld `datei`) — Magic Bytes, clamd, Foto wird zur PDF.
 * Zähler je Absender gegen Massenabsenden; der Zustand wird VOR dem Lesen des Körpers geprüft, damit niemand
 * zehn MB an eine Anfrage ohne freigegebenes Dokument schicken kann.
 */

const jeAbsender = new RateLimiter({ windowMs: 60 * 60_000, max: 20 });
type Ctx = { params: Promise<{ code: string }> };

function artAus(req: Request): Dokumentart | null {
  const roh = new URL(req.url).searchParams.get("art") ?? "mietvertrag";
  return istDokumentart(roh) ? roh : null;
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const { code } = await ctx.params;
  const art = artAus(req);
  if (!istLinkCode(code) || !art) return NICHT_DA();
  return auditDelivery("gemeinschaft", "download", "vertragsdatei", { kind: "anonymous" }, async (target) => {
    const v = dokumentFuerStatus(getDb(), code, art);
    if (!v) return NICHT_DA();
    target(JSON.stringify([v.id, art]));
    if (v.art === "unterschrieben") return pdfAntwort(v.inhalt, anhangKopf(v.name));
    return pdfAntwort(await ansichtPdf(v.grundlage, art), ansichtKopf(dokumentDateiname(art, v.grundlage.anfrage.von, false)));
  });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (req.headers.get("sec-fetch-site") === "cross-site") return NICHT_DA();
  const { code } = await ctx.params;
  const art = artAus(req);
  if (!istLinkCode(code) || !art) return NICHT_DA();
  if (!jeAbsender.check(clientIpAus(req.headers))) return jsonAntwort(429, { ok: false, fehler: "Zu viele Versuche. Bitte in einer Stunde noch einmal." });

  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    let a: ReturnType<typeof pruefeUnterschreibbar>;
    try {
      a = pruefeUnterschreibbar(db, { code }, art);
    } catch (e) {
      if (e instanceof NichtGefunden) return NICHT_DA();
      if (e instanceof Abgelehnt) return jsonAntwort(409, { ok: false, fehler: e.message });
      throw e;
    }
    const d = await leseDatei(req, VERTRAG_MAX_BYTES, "Bitte eine PDF oder ein Foto wählen.");
    if (!d.ok) return jsonAntwort(d.status, { ok: false, fehler: d.fehler });
    const p = pruefeUnterschriebeneDatei(d.name, d.bytes);
    if (!p.ok) return jsonAntwort(p.status, { ok: false, fehler: p.fehler });
    const scan = await scanneVertrag(d.bytes);
    if (scan.art !== "clean") return jsonAntwort(scan.art === "infected" ? 422 : 503, { ok: false, fehler: scanSatz(scan) ?? "" });
    let inhalt: Buffer;
    try {
      inhalt = p.art === "pdf" ? d.bytes : Buffer.from(await fotoAlsPdf(d.bytes, p.art, dokumentTitel(art, a.von, true)));
    } catch {
      return jsonAntwort(415, { ok: false, fehler: "Dieses Foto lässt sich nicht lesen. Bitte als JPG oder PNG speichern." });
    }
    try {
      legeUnterschriebenAb(db, { code }, art, { inhalt, herkunft: "hochgeladen", unterschrift: null, version: null }, Date.now());
    } catch (e) {
      if (e instanceof NichtGefunden) return NICHT_DA();
      if (e instanceof Abgelehnt) return jsonAntwort(409, { ok: false, fehler: e.message });
      throw e;
    }
    revalidatePath("/m/gemeinschaft", "layout");
    return jsonAntwort(200, { ok: true });
  });
}
