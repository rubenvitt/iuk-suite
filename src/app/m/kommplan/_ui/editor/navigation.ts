import { anzeigereihenfolge } from "../../_lib/layout/gruppen";
import { baueSicht } from "../../_lib/layout/sicht";
import type { PlanInhalt, Stelle } from "../../_lib/plan/schema";
import type { Richtung } from "./tasten";

/**
 * PFEILTASTEN (Entscheidung 9): ↑ Elternstelle, ↓ erste sichtbare Unterstelle, ←/→ Nachbar in der
 * ANZEIGEREIHENFOLGE der Geschwister (Busgruppen wie im Layout), jede Stelle von ihren Seitenstellen
 * eingerahmt. Nicht über Koordinaten: Kammreihen und gestapelte Seitenstellen teilen keine
 * y-Koordinate mit ihren Nachbarn. Kein Umlauf am Ende einer Reihe.
 */
export function wandere(inhalt: PlanInhalt, eingeklappt: ReadonlySet<string>, von: string | null, richtung: Richtung): string | null {
  const sicht = baueSicht(inhalt, { eingeklappt });
  const nachId = new Map(inhalt.stellen.map((s) => [s.id, s]));
  const s = von === null ? undefined : nachId.get(von);
  if (!s || !sicht.sichtbar.some((x) => x.id === s.id)) return sicht.wurzeln[0]?.id ?? null;
  if (richtung === "hoch") return s.eltern ?? s.id;
  if (richtung === "runter") return s.lage === "unter" ? (anzeigereihenfolge(sicht.kinder(s.id))[0]?.id ?? s.id) : s.id;
  const basis: Stelle = s.lage === "unter" ? s : nachId.get(s.eltern!)!;
  const geschwister = basis.eltern === null ? sicht.wurzeln : anzeigereihenfolge(sicht.kinder(basis.eltern));
  const reihe = geschwister.flatMap((g) => { const seite = sicht.seiten(g.id); return [...seite.links, g, ...seite.rechts]; });
  const i = reihe.findIndex((x) => x.id === s.id);
  return reihe[richtung === "links" ? i - 1 : i + 1]?.id ?? s.id;
}
