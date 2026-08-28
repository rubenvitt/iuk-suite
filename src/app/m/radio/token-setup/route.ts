import { hostAbweisung } from "../_lib/hostRiegel";
import { aliasAntwort, aliasZiel } from "../_lib/aliasse";

/**
 * ALIAS-ROUTE FUER DEN ALT-PFAD `/token-setup` — Betreiberentscheidung vom 2026-08-27
 * (`.superpowers/sdd/adminlink/KONTEXT.md`). Die erste Flaeche eines frischen Tablets im Alt-Kiosk; das Ziel ist das Gate, nicht der Bestand.
 *
 * ⛔ DAS ZIEL STEHT NICHT HIER, SONDERN IN `_lib/aliasse.ts` — dort mit der Begruendung, die
 * es traegt. Stuende es an beiden Orten, bliebe eine Aenderung an einem davon still.
 *
 * ⛔ EIN ROUTE HANDLER UND KEINE `page.tsx`, und das ist gemessen: eine `page.tsx` fiele in
 * `riegel.test.ts` Klausel (e)/(f) und muesste den PERSONEN-Riegel ihrer Stufe als erste
 * Anweisung tragen — die Weiterleitung laege dann hinter dem Recht ihres Ziels. Die
 * Begruendung im Langen steht im Kopf von `_lib/aliasse.test.ts`.
 *
 * ⛔ DER `??` MACHT „ALS ERSTE ANWEISUNG" STRUKTURELL WAHR (`_lib/hostRiegel.ts:17-22`): der
 * rechte Zweig wird erst ausgewertet, wenn der linke `null` ist. Ohne Host-Riegel waere diese
 * Route ueber JEDEN Suite-Host erreichbar (Falle 61, `_lib/host.ts:7-20`).
 */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  return hostAbweisung(req) ?? aliasAntwort(aliasZiel("/token-setup"));
}
