/**
 * Rohfarben der Suite als CSS-Variablen auf `:root`. Die Werte kommen aus `FARBEN`
 * (`src/core/theme/tokens.ts`) und werden nicht abgeschrieben: Ändert die Suite ein Rot, zieht die
 * App beim nächsten Build mit. Die Namen folgen `tokens/colors.css` der Vorlage
 * (`docs/design/einsatzbuch-v2/vorlage/_ds/…/tokens/colors.css`), Abschnitt „Rohwerte (FARBEN)“.
 *
 * Die abgeleiteten Rollen (`--iuk-marke`, `--verw-*`, `--brand-fill`, Ampel) stehen mit Hell- und
 * Dunkelzweig in `app.css` und verweisen, wo es geht, auf diese Rohwerte.
 */
import { FARBEN } from "@/core/theme/tokens";

/**
 * `linie` heißt in colors.css `--iuk-linie-roh`, weil `--iuk-linie` dort die Rolle mit
 * Dunkelzweig ist. Alle anderen Schlüssel werden aus camelCase zu kebab-case.
 */
const AUSNAHMEN: Record<string, string> = { linie: "--iuk-linie-roh" };

export function variablenName(schluessel: string): string {
  return AUSNAHMEN[schluessel] ?? `--iuk-${schluessel.replace(/[A-Z]/g, (b) => `-${b.toLowerCase()}`)}`;
}

/** Name → Wert für jede Farbe aus `FARBEN`. */
export function farbVariablen(): Record<string, string> {
  return Object.fromEntries(Object.entries(FARBEN).map(([schluessel, wert]) => [variablenName(schluessel), wert]));
}

/** Schreibt die Rohfarben als Inline-Variablen an `ziel`, gedacht für `document.documentElement`. */
export function schreibeFarbVariablen(ziel: HTMLElement): void {
  for (const [name, wert] of Object.entries(farbVariablen())) ziel.style.setProperty(name, wert);
}
