import { auditActor, auditDenied, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { speichereLogo } from "../_lib/briefkopf";
import { gleicheHerkunft } from "../_lib/herkunft";
import { LOGO_FEHLER, LOGO_MAX_BYTES } from "../_lib/logo/logoTyp";
import { scanneLogo } from "../_lib/logoScan";
import { bearbeiterAus, requireKommplanBearbeitenAktion, type Viewer } from "../_lib/zugang";

/**
 * `POST /logo` — LOGO HOCHLADEN ODER ERSETZEN (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 3). Ein Route
 * Handler statt einer Server Action, weil Actions höchstens 1 MB annehmen und `serverActions.bodySizeLimit`
 * suiteweit ist (Vorbild `aufgaben/a/[id]/nachweis/hochladen/route.ts`).
 *
 * DER RIEGEL STEHT HIER (Route Handler haben kein Layout darüber; `riegel.test.ts` hält ihn): Host,
 * Anmeldung und Bearbeitungsrecht über `requireKommplanBearbeitenAktion` — ihr Wurf wird ein 404, damit
 * die Route sich nicht verrät —, dann die gleiche Herkunft (Nexts CSRF-Prüfung gilt nur für Actions), dann
 * früh die `content-length`: ohne den 1-MB-Deckel der Actions ist sie die einzige Bremse gegen eine Anfrage,
 * die absichtlich Gigabytes puffern lässt. Fehlt die Angabe (HTTP/2, ein Proxy mit chunked body), wird gelesen —
 * wie in `aufgaben` (`inhaltZuGross`); die maßgebliche Größenprüfung bleibt `pruefeLogoDatei` an den tatsächlich
 * gelesenen Bytes. `MULTIPART_RAND` ist keine zweite Grenze, nur Platz für den Rahmen.
 */
const KOPF = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;
const MULTIPART_RAND = 16 * 1024;
const antwort = (status: number, koerper: unknown) => new Response(JSON.stringify(koerper), { status, headers: KOPF });

export async function POST(request: Request): Promise<Response> {
  let viewer: Viewer;
  try { viewer = await requireKommplanBearbeitenAktion(); } catch { return antwort(404, { ok: false, fehler: "Nicht gefunden." }); }
  if (!gleicheHerkunft(request.headers)) {
    // Lokale Abweisung ohne Wurf → access_denied (Suite-Regel für Route Handler, Manifest-Eintrag `denial`).
    auditDenied("kommplan", auditActor(viewer));
    return antwort(403, { ok: false, fehler: "Hochladen geht nur aus der Seite „Einstellungen“." });
  }
  const roh = request.headers.get("content-length");
  if (roh !== null && Number.isFinite(Number(roh)) && Number(roh) > LOGO_MAX_BYTES + MULTIPART_RAND) {
    return antwort(413, { ok: false, fehler: LOGO_FEHLER.gross });
  }
  let datei: FormDataEntryValue | null;
  try { datei = (await request.formData()).get("logo"); } catch { return antwort(400, { ok: false, fehler: "Die Anfrage ließ sich nicht lesen." }); }
  if (!(datei instanceof File)) return antwort(400, { ok: false, fehler: "Keine Datei erhalten." });
  const bytes = new Uint8Array(await datei.arrayBuffer());
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = await speichereLogo(getDb(), bytes, bearbeiterAus(viewer), Date.now(), (b) => scanneLogo(b));
    return antwort(r.ok ? 200 : 422, r);
  });
}
