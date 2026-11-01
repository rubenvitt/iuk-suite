/**
 * Richtwerte für Unterkunft und Zelte von Betroffenen (IDA-322).
 *
 * DIESELBEN WERTE WIE IN LIFELINE HUB: übernommen aus dem POC LLH-1519 (Rechenkern `rechner.js`), dessen
 * Umsetzung dort LLH-1520 ist. Die Suite trägt den Rechner nur vorübergehend; wer hier einen Wert ändert,
 * ändert ihn auch dort, sonst rechnen zwei Werkzeuge derselben Organisation verschieden.
 *
 * Grundlage sind die Ausgangstabellen, korrigiert durch eine Recherche mit Quellen. `herkunft` sagt, wie
 * belastbar ein Wert ist: `recherche` = mit Quelle belegt, `tabelle` = aus den Ausgangstabellen,
 * `annahme` = ohne Quelle, Fachprüfung offen. `bezug` ist der Befund (W1–W9, F6), der den Wert betrifft.
 *
 * KEIN "use client": reine Daten, von Server Components wie Client-Inseln lesbar (Falle 6).
 */

export type Herkunft = "tabelle" | "korrigiert" | "annahme" | "recherche";

export type Richtwert = {
  readonly wert: number;
  readonly einheit: string;
  readonly herkunft: Herkunft;
  readonly bezug: string;
  readonly quelle?: string;
};

export type Zelttyp = {
  readonly typ: string;
  readonly schlafplaetze: number;
  readonly garnituren: number;
  readonly laenge_m: number;
  readonly breite_m: number;
};

const Q = {
  nds: "Nds. RdErl. Aufnahmeplanung 15.11.2023 (aufgehoben 01.09.2024)",
  drk: "DRK-LV RLP, Taschenkarte Betreuungsdienst 2024",
  thw: "THW, Taschenkarten Logistikdaten / Flächenbedarf Zelt",
  sphere: "Sphere Handbook 2018",
  lander: "VwV Unterbringung Sachsen 2015, Mindestbedingungen Brandenburg 2016",
  lanco: "LANCO/Cladis, Datenblätter SG",
  ohne: "keine Quelle gefunden, Wert aus der Ausgangstabelle",
} as const;

export const RICHTWERTE = {
  stand: "2026-11-01",
  flaecheJePerson: { wert: 4, einheit: "m²", herkunft: "recherche", bezug: "W1", quelle: `${Q.drk}; THW; Nds. 3–4 m²; Sphere 3,5 m²` },
  toiletteJeMaenner: { wert: 20, einheit: "Personen", herkunft: "recherche", bezug: "W2", quelle: `${Q.nds}; ${Q.drk}; Sphere` },
  toiletteJeFrauen: { wert: 20, einheit: "Personen", herkunft: "recherche", bezug: "W2", quelle: `${Q.nds}; ${Q.drk}; Sphere` },
  toiletteJeGemischt: { wert: 20, einheit: "Personen", herkunft: "recherche", bezug: "W2", quelle: `${Q.drk} (5 %)` },
  urinalJeMaenner: { wert: 15, einheit: "Männer", herkunft: "recherche", bezug: "W3", quelle: `${Q.lander}; Nds. 15–20` },
  anteilMaennerOhneTrennung: { wert: 0.5, einheit: "", herkunft: "tabelle", bezug: "W3" },
  waschJe: { wert: 5, einheit: "Personen", herkunft: "recherche", bezug: "W7", quelle: `${Q.nds}; ${Q.drk}` },
  duscheJe: { wert: 20, einheit: "Personen", herkunft: "recherche", bezug: "W7", quelle: `${Q.nds}; ${Q.drk} (kurzfristig)` },
  krankenBettJe: { wert: 25, einheit: "Personen", herkunft: "annahme", bezug: "W4", quelle: Q.ohne },
  krankenBettZuschlag: { wert: 1, einheit: "Bett", herkunft: "annahme", bezug: "W4", quelle: Q.ohne },
  krankenFlaecheJeBett: { wert: 7.5, einheit: "m²", herkunft: "annahme", bezug: "W4", quelle: Q.ohne },
  isolierAbPersonen: { wert: 201, einheit: "Personen", herkunft: "annahme", bezug: "W4", quelle: `${Q.ohne}; Nds. empfiehlt Isolationszimmer ohne Schwelle` },
  wasserJeTag: { wert: 25, einheit: "l", herkunft: "recherche", bezug: "W6", quelle: `${Q.drk}; Minimum 15 l (Sphere, 1. WasSV)` },
  trinkwasserJeTag: { wert: 3, einheit: "l", herkunft: "recherche", bezug: "W6", quelle: `${Q.sphere} (2,5–3 l)` },
  faekalienJeTag: { wert: 1.5, einheit: "l", herkunft: "recherche", bezug: "W6", quelle: `${Q.sphere} (1–2 l)` },
  abfallJeTag: { wert: 3, einheit: "l", herkunft: "recherche", bezug: "W6", quelle: `${Q.sphere} (0,5 kg ≈ 1–3 l)` },
  ausgabeZweiteAb: { wert: 301, einheit: "Personen", herkunft: "annahme", bezug: "W8", quelle: Q.ohne },
  sitzAnteil: { wert: 1 / 3, einheit: "", herkunft: "recherche", bezug: "W8", quelle: `${Q.nds}; DRK-RLP 30–50 %` },
  plaetzeJeGarnitur: { wert: 8, einheit: "Plätze", herkunft: "recherche", bezug: "W8", quelle: Q.thw },
  feldbettJePerson: { wert: 1, einheit: "Stück", herkunft: "recherche", bezug: "F6", quelle: `${Q.nds} (Einzelbelegung)` },
  deckenJePerson: { wert: 2, einheit: "Stück", herkunft: "annahme", bezug: "F6", quelle: "Sphere: mind. 1, bei Kälte mehr; 2 ist Annahme" },
  zeltAbstand: { wert: 2, einheit: "m", herkunft: "recherche", bezug: "F6", quelle: `${Q.sphere}; UNHCR 2016` },
  zelte: {
    herkunft: "recherche",
    bezug: "F6",
    quelle: `${Q.lanco}; ${Q.thw}; ${Q.drk}`,
    typen: [
      { typ: "SG 20", schlafplaetze: 6, garnituren: 4, laenge_m: 5.0, breite_m: 4.7 },
      { typ: "SG 30", schlafplaetze: 10, garnituren: 6, laenge_m: 6.0, breite_m: 5.6 },
      { typ: "SG 40", schlafplaetze: 12, garnituren: 8, laenge_m: 8.0, breite_m: 5.64 },
      { typ: "SG 50", schlafplaetze: 14, garnituren: 12, laenge_m: 10.0, breite_m: 5.64 },
    ] as readonly Zelttyp[],
  },
} as const satisfies {
  stand: string;
  zelte: { herkunft: Herkunft; bezug: string; quelle: string; typen: readonly Zelttyp[] };
  [k: string]: unknown;
};

export type Richtwerte = typeof RICHTWERTE;

/** Die Schlüssel mit einem einzelnen Zahlenwert (alles außer `stand` und `zelte`). */
export type RichtwertSchluessel = Exclude<keyof Richtwerte, "stand" | "zelte">;

/** Reihenfolge und Beschriftung der Richtwerte-Tabelle. */
export const RICHTWERT_ZEILEN: readonly (readonly [string, RichtwertSchluessel])[] = [
  ["Schlaffläche je Person", "flaecheJePerson"],
  ["Toilette je Männer", "toiletteJeMaenner"],
  ["Toilette je Frauen", "toiletteJeFrauen"],
  ["Toilette ohne Trennung je", "toiletteJeGemischt"],
  ["Urinal je Männer", "urinalJeMaenner"],
  ["Anteil Männer ohne Trennung", "anteilMaennerOhneTrennung"],
  ["Waschgelegenheit je", "waschJe"],
  ["Dusche je", "duscheJe"],
  ["Krankenbett je", "krankenBettJe"],
  ["Krankenbetten Zuschlag", "krankenBettZuschlag"],
  ["Fläche je Krankenbett", "krankenFlaecheJeBett"],
  ["Isolierstation ab", "isolierAbPersonen"],
  ["Wasser je Person und Tag", "wasserJeTag"],
  ["Trinkwasser je Person und Tag", "trinkwasserJeTag"],
  ["Fäkalien je Person und Tag", "faekalienJeTag"],
  ["Abfall je Person und Tag", "abfallJeTag"],
  ["Zweite Ausgabestelle ab", "ausgabeZweiteAb"],
  ["Sitzplätze, Anteil der Personen", "sitzAnteil"],
  ["Plätze je Biergarnitur", "plaetzeJeGarnitur"],
  ["Feldbetten je Person", "feldbettJePerson"],
  ["Decken je Person", "deckenJePerson"],
  ["Abstand zwischen Zelten", "zeltAbstand"],
];

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
