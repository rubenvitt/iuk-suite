import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import type { ActionErgebnis } from "../../_lib/actionErgebnis";
import { DATEI_HOECHSTENS_BYTES } from "../../_lib/datei/lesen";
import { istHelferHost } from "../../_lib/host";
import { planeLauf, uebernehmeLauf } from "../../_lib/lauf";
import { helferVerwaltenZugang } from "../../_lib/zugang";

export const dynamic = "force-dynamic";

/**
 * Der Abgleich mit einer hochgeladenen Excel-Datei (IDA-281): `schritt=vorschau` plant und schreibt
 * nichts, `schritt=uebernehmen` gleicht ab — beides mit der Datei im selben Formular, denn sie wird
 * nirgends zwischengespeichert. Die Antwort hat die Form der Server Actions (`ActionErgebnis`).
 *
 * WARUM EIN ROUTE HANDLER UND KEINE SERVER ACTION: eine Server Action nimmt höchstens 1 MB
 * (`serverActions.bodySizeLimit`), und eine Anhebung gälte für jede Action der Suite. Dieselbe
 * Entscheidung wie beim Hochladen in `radio` und `aufgaben`.
 *
 * Erst der Host, dann die Person (404 statt 403, die Existenz der Route bleibt verborgen). Wer am
 * Filter scheitert, verlässt den Server auch hier nur als Zahl.
 */
export async function POST(req: Request): Promise<Response> {
  if (!istHelferHost(new Headers(req.headers))) return new Response("Not found", { status: 404 });
  const z = await helferVerwaltenZugang();
  if (!z.ok) return z.response;
  return withAuditContext({ actor: auditActor(z.viewer) }, async (): Promise<Response> => {
    const groesse = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(groesse) && groesse > DATEI_HOECHSTENS_BYTES + 64 * 1024) {
      return antwort({ ok: false, fehler: "Die Datei ist größer als 5 MB." });
    }
    const felder = await req.formData().catch(() => null);
    const datei = felder?.get("datei");
    if (!(datei instanceof File)) return antwort({ ok: false, fehler: "Bitte zuerst eine Excel-Datei wählen." });
    let filter: unknown;
    try {
      filter = JSON.parse(String(felder?.get("filter") ?? ""));
    } catch {
      return antwort({ ok: false, fehler: "Bitte den Filter prüfen." });
    }
    const bytes = new Uint8Array(await datei.arrayBuffer());
    const schritt = felder?.get("schritt");
    if (schritt === "vorschau") return antwort(await planeLauf(filter, bytes));
    if (schritt === "uebernehmen") {
      const ergebnis = await uebernehmeLauf(z.viewer, filter, bytes);
      if (ergebnis.ok) revalidatePath("/m/helfer", "layout");
      return antwort(ergebnis);
    }
    return antwort({ ok: false, fehler: "Unbekannter Schritt." });
  });
}

function antwort<T>(rumpf: ActionErgebnis<T>): Response {
  return Response.json(rumpf, { headers: { "cache-control": "no-store" } });
}
