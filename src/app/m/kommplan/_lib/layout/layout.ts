import type { PlanInhalt } from "../plan/schema";
import { teileAuf } from "./papier";
import type { Layout, LayoutOptionen, Ziel } from "./typen";
import { zeichne } from "./zeichne";

/**
 * `layout(inhalt, ziel)` aus Spec §5 — rein und synchron, geteilt von Server (Druck) und Browser
 * (Betrachter). Die oberen Felder sind die ganze Zeichnung mit dem Kamm-Budget des Ziels; `seiten`
 * trägt für Papier die aufgeteilten Blätter.
 */
export function layout(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}): Layout {
  return { ...zeichne(inhalt, ziel, optionen), seiten: ziel === "bildschirm" ? [] : teileAuf(inhalt, ziel) };
}
