/**
 * Richtwerte für Unterkunft und Zelte von Betroffenen (IDA-322, IDA-323).
 *
 * DIE BASIS GEHÖRT LIFELINE HUB: `lifeline-hub/richtwerte_basis.json` ist eine unveränderte Kopie von
 * `src/unterkunft/richtwerte_basis.json` aus Lifeline Hub (LLH-1520), `lifeline-hub/faelle.json` die der
 * gemeinsamen Testfälle (`tests/fixtures/unterkunft/faelle.json`). Herkunft und Stand stehen in `HERKUNFT`.
 * Ein Wert wird dort geändert und hierher kopiert, nie hier allein, sonst rechnen zwei Werkzeuge derselben
 * Organisation verschieden. `richtwerte.test.ts` hält Schlüssel, Grenzen und Quellen fest.
 *
 * `herkunft` der Basis: `belegt` = mit Quelle, `annahme` = ohne Quelle, fachlich zu prüfen. Nur die Suite
 * führt dazu den Befund (W1–W9, F6) aus der Prüfung der Ausgangstabellen (`BEFUND`).
 *
 * KEIN "use client": reine Daten, von Server Components wie Client-Inseln lesbar (Falle 6).
 */
import basisDatei from "./lifeline-hub/richtwerte_basis.json";

/** Woher die beiden Kopien stammen. */
export const HERKUNFT = {
  repo: "rubenvitt/lifeline-hub",
  commit: "c78d43a3563469e8caaff288276cad094254ffdd",
  kopiert: "2026-11-03",
  dateien: {
    "lifeline-hub/richtwerte_basis.json": "src/unterkunft/richtwerte_basis.json",
    "lifeline-hub/faelle.json": "tests/fixtures/unterkunft/faelle.json",
  },
} as const;

export type RichtwertGruppe = "schlafen" | "sanitaer" | "gesundheit" | "versorgung" | "verpflegung" | "zelte";
export type RichtwertHerkunft = "belegt" | "annahme";
/** Für die Kennzeichnung im Rechner: dazu „korrigiert“ für behobene Rechenfehler der Ausgangstabellen. */
export type Herkunft = RichtwertHerkunft | "korrigiert";

export type RichtwertBasis = {
  readonly schluessel: string;
  readonly gruppe: RichtwertGruppe;
  readonly bezeichnung: string;
  readonly wert: number;
  readonly einheit: string;
  readonly min: number;
  readonly max: number;
  readonly ganzzahl: boolean;
  readonly herkunft: RichtwertHerkunft;
  readonly quelle: string;
};

export type ZeltTyp = "sg20" | "sg30" | "sg40" | "sg50";

export const RICHTWERTE_STAND: string = basisDatei.stand;
export const RICHTWERTE_BASIS: readonly RichtwertBasis[] = basisDatei.werte as RichtwertBasis[];
export const ZELTTYPEN: readonly { readonly typ: ZeltTyp; readonly bezeichnung: string }[] =
  basisDatei.zelttypen as { typ: ZeltTyp; bezeichnung: string }[];

/** Flache Karte der wirksamen Werte, Schlüssel → Zahl. */
export type Richtwerte = Record<string, number>;

const NACH_SCHLUESSEL = new Map(RICHTWERTE_BASIS.map((r) => [r.schluessel, r]));

export function richtwertBasis(schluessel: string): RichtwertBasis | undefined {
  return NACH_SCHLUESSEL.get(schluessel);
}

/** Basis mit Overrides darüber (Ebene über Ebene); unbekannte Schlüssel und `null` erben. */
export function mitOverrides(...ebenen: (Readonly<Record<string, number | null | undefined>> | undefined)[]): Richtwerte {
  const wirksam: Richtwerte = Object.fromEntries(RICHTWERTE_BASIS.map((r) => [r.schluessel, r.wert]));
  for (const ebene of ebenen) {
    if (!ebene) continue;
    for (const [k, v] of Object.entries(ebene)) {
      if (NACH_SCHLUESSEL.has(k) && typeof v === "number" && Number.isFinite(v)) wirksam[k] = v;
    }
  }
  return wirksam;
}

/** Die Basis als flache Karte; die Suite kennt keine Organisations- oder Einsatzwerte. */
export const RICHTWERTE: Readonly<Richtwerte> = mitOverrides();

/** Anzeigename eines Zelttyps (`sg30` → `SG 30`). */
export function zeltName(typ: string): string {
  return ZELTTYPEN.find((t) => t.typ === typ)?.bezeichnung ?? typ;
}

/** Befund aus der Prüfung der Ausgangstabellen, den ein Richtwert betrifft. */
export const BEFUND: Readonly<Record<string, string>> = {
  flaeche_je_person_m2: "W1",
  toilette_je_personen_maenner: "W2",
  toilette_je_personen_frauen: "W2",
  toilette_je_personen_gemischt: "W2",
  urinal_je_maenner: "W3",
  maenneranteil_ohne_trennung_prozent: "W3",
  waschplatz_je_personen: "W7",
  dusche_je_personen: "W7",
  krankenbett_je_personen: "W4",
  krankenbett_zuschlag: "W4",
  krankenflaeche_je_bett_m2: "W4",
  isolierstation_ab_personen: "W4",
  wasser_je_person_l: "W6",
  trinkwasser_je_person_l: "W6",
  faekalien_je_person_l: "W6",
  abfall_je_person_l: "W6",
  zweite_ausgabestelle_ab_personen: "W8",
  personen_je_sitzplatz: "W8",
  plaetze_je_garnitur: "W8",
  feldbett_je_person: "F6",
  decken_je_person: "F6",
  zelt_abstand_m: "F6",
};

/** Wo und warum der Rechner von den Ausgangstabellen abweicht (Befund, Tabelle, Rechner). */
export const ABWEICHUNGEN: readonly (readonly [string, string, string])[] = [
  ["W1", "4 m² (Zelte-Tabelle) und 3 m² (Unterkunft Neu) je Person", "4 m² für alle Wege (DRK-RLP, THW); 3 m² liegt an der Untergrenze (Nds. 3–4 m²)"],
  ["W2", "1 Toilette je 20 und je 15 Betten", "1 je 20, getrennt nach Geschlecht; „1 je 15“ ist nur für Männer in Langzeit-Unterkünften belegt"],
  ["W3", "Blatt „nach Zelten“: Bewohner ÷ 0,5 ÷ 15", "Männer ÷ 15 (Rechenfehler behoben, Wert belegt)"],
  ["W4", "Krankenstation n ÷ 25 + 1 Betten, 7,5 m² je Bett, Isolierstation ab 200", "unverändert übernommen, ohne Quelle; Fachprüfung offen"],
  ["W5", "Plätze aus Fläche aufgerundet", "Plätze abgerundet, Bedarf aufgerundet"],
  ["W6", "Wasser 15 l, Abfall 10 l je Person und Tag; feste Abzüge im Blatt „nach Wohnfläche“", "Wasser 25 l (DRK-RLP, Minimum 15 l), davon 3 l Trinkwasser; Abfall 3 l (Sphere); keine Abzüge"],
  ["W7", "je Gruppe aufgerundet, Summe ≠ Gesamt; keine Duschen", "bei Trennung zählt die Summe der Gruppen; Duschen 1 je 20"],
  ["W8", "Räume mit Bruchteilen summiert; Biergarnitur 10 Plätze für alle", "je Raum abgerundet; Garnitur 8 Plätze (THW) für ein Drittel"],
  ["W9", "Aufenthaltszelte aus allen Garnituren; SG 40 = 9 Garnituren", "aus den Garnituren für die Sitzplätze; SG 40 = 8"],
  ["F6", "Schlafzelte 8 / 10 / 14 / 18 Personen, keine Maße", "6 / 10 / 12 / 14 Feldbetten (THW), Maße nach Hersteller, 2 m Abstand"],
];
