/**
 * Kurztexte der Marken „Annahme“ und „korrigiert“ (IDA-390). Sie standen nur im Maus-Tooltip und dort
 * als Befundkürzel; am Telefon und auf Papier gab es gar keine Erklärung. Der Text sagt in ein paar
 * Wörtern, WAS angenommen oder korrigiert ist, mit dem wirksamen Wert aus der Basis.
 *
 * KEIN "use client": das Druckblatt liest es als Server Component (Falle 6).
 */
import { RICHTWERTE, richtwertBasis } from "./richtwerte";

export type Markierung = { herkunft: "annahme" | "korrigiert"; text: string };

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const w = (k: string) => ZAHL.format(RICHTWERTE[k]);

/** Was angenommen ist, je Richtwert ohne Quelle; ohne Eintrag gilt Bezeichnung und Wert der Basis. */
const ANNAHME: Readonly<Record<string, () => string>> = {
  decken_je_person: () => `${w("decken_je_person")} je Person`,
  krankenbett_je_personen: () => `1 je ${w("krankenbett_je_personen")} Personen + ${w("krankenbett_zuschlag")}`,
  krankenbett_zuschlag: () => `${w("krankenbett_zuschlag")} Bett Zuschlag`,
  krankenflaeche_je_bett_m2: () => `${w("krankenflaeche_je_bett_m2")} m² je Bett`,
  isolierstation_ab_personen: () => `ab ${w("isolierstation_ab_personen")} Personen`,
  zweite_ausgabestelle_ab_personen: () => `zweite ab ${w("zweite_ausgabestelle_ab_personen")} Personen`,
  maenneranteil_ohne_trennung_prozent: () => `${w("maenneranteil_ohne_trennung_prozent")} % Männer`,
};

/** Behobene Rechenfehler der Ausgangstabellen, so wie der Rechner heute rechnet. */
const KORREKTUR = {
  urinale: () => `1 je ${w("urinal_je_maenner")} Männer`,
  aufenthaltszelte: () => "nach Sitzplätzen",
} as const;

/** Die Marke eines Richtwerts: nur für Annahmen, belegte Werte bleiben still. */
export function markeFuer(schluessel: string): Markierung | null {
  const basis = richtwertBasis(schluessel);
  if (!basis || basis.herkunft !== "annahme") return null;
  const text = ANNAHME[schluessel]?.() ?? `${basis.bezeichnung} ${ZAHL.format(basis.wert)}${basis.einheit ? ` ${basis.einheit}` : ""}`;
  return { herkunft: "annahme", text: `Annahme: ${text}` };
}

export function korrektur(fall: keyof typeof KORREKTUR): Markierung {
  return { herkunft: "korrigiert", text: `korrigiert: ${KORREKTUR[fall]()}` };
}
