/**
 * Lifeline Hub holt hier Personal mit Qualifikationen ab (LLH-1194, Adapterart „Stammdaten-Abruf“), mit einem
 * Schlüssel aus den Einstellungen als Bearer. Ohne Login erreichbar ist NUR dieser Pfad (`ABRUF_OHNE_LOGIN` in
 * `core/routing.ts`); Host und Schlüssel prüft deshalb die Route selbst. Was hinausgeht, entscheidet
 * `helferFuerLifeline` (`_lib/bereitstellung.ts`). Kein ETag: Lifeline vergleicht selbst über einen Fingerabdruck.
 */
import { getDb } from "../../_db/client";
import { abholungAbgelehnt } from "../../_lib/ablehnung";
import { helferFuerLifeline } from "../../_lib/bereitstellung";
import { istHelferHost } from "../../_lib/host";
import { bearerAus, zugangAusSchluessel } from "../../_lib/schluessel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!istHelferHost(new Headers(req.headers))) return new Response("Not found", { status: 404 });
  const db = getDb();
  if (!zugangAusSchluessel(db, bearerAus(req))) {
    abholungAbgelehnt();
    return Response.json({ error: { code: "schluessel_ungueltig", message: "Dieser Schlüssel gilt nicht (mehr)." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(helferFuerLifeline(db), { headers: { "Cache-Control": "no-store" } });
}
