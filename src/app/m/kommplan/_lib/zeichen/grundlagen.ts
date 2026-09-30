import roh from "./grundlagen.generiert.json";

/**
 * Das kleine, geteilte Generat: Arimo-Metriken und Piktogramme. Server UND Browser laden es
 * (der Betrachter rechnet das Layout selbst). Das große Rezept-Generat liegt in `zeichen.ts`
 * und gehört allein dem Server (`grenze.test.ts`).
 */
export interface Schnitt {
  readonly vorschub: Readonly<Record<string, number>>;
  readonly unterschneidung: Readonly<Record<string, Readonly<Record<string, number>>>>;
}
export interface Metrik {
  readonly einheitenProEm: number;
  readonly aufstieg: number;
  readonly abstieg: number;
  readonly ersatz: number;
  readonly normal: Schnitt;
  readonly fett: Schnitt;
}
export interface Symbolquelle { readonly viewBox: string; readonly inhalt: string }

export const METRIK: Metrik = roh.metrik as Metrik;
export const PIKTOGRAMME: Readonly<Record<string, Symbolquelle>> = roh.piktogramme as Record<string, Symbolquelle>;

/** Kontaktart → Piktogramm (Spec §7). Reihenfolge der Arten: `plan/kontakte.ts`. */
export const KONTAKT_PIKTOGRAMM = {
  funkrufname: "kontakt.funkrufname",
  digitalfunk: "comms.handheld-radio-terminal",
  telefon: "kontakt.telefon",
  mobil: "kontakt.mobil",
  fax: "comms.fax-transmission",
  email: "kontakt.email",
  sonstiges: "kontakt.sonstiges",
} as const satisfies Record<string, string>;

/** Verbindungsart → Piktogramm im Sechseck. */
export const VERBINDUNG_PIKTOGRAMM = {
  tmo: "comms.voice-radio-tmo",
  dmo: "comms.voice-radio-dmo",
  analogfunk: "comms.voice-radio",
  draht: "comms.cable-construction",
  telefon: "comms.telephone-exchange",
  mobil: "kontakt.mobil",
  fax: "comms.fax-transmission",
  daten: "comms.data-transmission",
} as const satisfies Record<string, string>;
