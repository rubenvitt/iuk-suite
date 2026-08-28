import { hostAbweisung } from "../../../_lib/hostRiegel";
import { aliasAntwort, aliasZiel, einsetzen } from "../../../_lib/aliasse";

/**
 * ALIAS-ROUTE FUER DEN ALT-PFAD `/devices/:id` VON `radio-admin` — Betreiberentscheidung vom
 * 2026-08-27 (`.superpowers/sdd/adminlink/KONTEXT.md`). Der einzige Alt-Pfad mit einem
 * Parameter (`radio-admin/client/src/routes/router.tsx:26`).
 *
 * ⚠️ ER GREIFT ERST MIT C2: `radio-admin.iuk-ue.de` verschwindet, und ohne den
 * pfaderhaltenden Traefik-Redirect loest der Host gar nicht mehr auf. C2 ist unabgehakt
 * (Bericht §1.6). Kommt er, trifft `/devices/<id>` das Modul als `/admin/devices/<id>`.
 *
 * ✅ UND ER TRAEGT, WEIL DIE KENNUNGEN ZEICHENGLEICH WANDERN — `_db/schema.ts:11-12`. Waeren
 * sie beim Import neu vergeben, zeigte dieser Alias auf eine Zeile, die es nicht gibt, und
 * die Geraeteliste waere das ehrlichere Ziel.
 *
 * ⛔ DER TYP STEHT ALS EIGENE DEKLARATION UND NICHT INLINE IN DER SIGNATUR — dieselbe Auflage
 * wie in `t/[code]/route.ts:52-60`: inline liest ein Rumpf-Scan `{ params: Promise<{ id:
 * string }> }` als Funktionskoerper und misst still die falsche Spanne.
 *
 * ⛔ `einsetzen` KODIERT DEN WERT (`_lib/aliasse.ts`): `id` kommt aus der URL und landet in
 * einem `Location`-Kopf, wo keine React-Entkommung schuetzt.
 */
type RouteKontext = { params: Promise<{ id: string }> };

const ALT = "/admin/devices/:id";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteKontext): Promise<Response> {
  /*
   * ⛔ DER `??` HAELT DEN RIEGEL AUCH HIER VORN (`_lib/hostRiegel.ts:17-22`): der rechte
   * Zweig — samt `await ctx.params` — wird erst ausgewertet, wenn der linke `null` ist.
   */
  return hostAbweisung(req) ?? aliasAntwort(einsetzen(aliasZiel(ALT), (await ctx.params).id));
}
