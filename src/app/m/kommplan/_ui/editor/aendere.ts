import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * Wie Flyins das Dokument ändern: sie reichen eine reine Operation (`_lib/plan/`) an die Editor-Insel.
 * `schluessel` bündelt Tippen im selben Feld zu einem Rückgängig-Schritt (`verlauf.ts`). Rückgabe:
 * `null` = angewandt, sonst die Meldung des `PlanFehler` — für den Hinweis am Formular.
 */
export type Aendere = (op: (p: PlanInhalt) => PlanInhalt, schluessel?: string) => string | null;
