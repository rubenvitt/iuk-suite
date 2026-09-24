/**
 * Das Datenformat des Einsatzbuchs (Spec §3). Diese Typen sind der Vertrag zwischen der
 * Desktop-App (Rust versiegelt) und der Suite (Reader, Schlüsselfreigabe). Wer hier ein
 * Feld ändert, ändert den Fingerabdruck jedes künftigen Blocks — und muss die
 * Testvektoren neu erzeugen, die Rust byte-genau nachbaut.
 */
export const GENESIS = "0".repeat(64);

export interface FahrzeugStand { id: string; typ: string; kennung: string; ruf: string; standort: string }
export interface PersonStand { id: string; name: string; quali: string; ov: string; fahrzeugId: string | null }

export interface Einsatz {
  v: 1;
  nummer: string;
  stichwort: string;
  beginnDatum: string;
  beginnZeit: string;
  endeDatum: string | null;
  endeZeit: string | null;
  strasse: string;
  ort: string;
  objekt: string;
  fahrzeuge: FahrzeugStand[];
  personal: PersonStand[];
  vorOrt: number;
  transport: number;
  notizen: string;
}

export type Umgebung = "echt" | "test";

export interface Blockkopf {
  v: 1;
  block: number;
  prev: string;
  versiegelt: string;
  schluesselId: string;
  /** Test-Rechner versiegeln immer `"test"` (Spec §12). Steht in Hash und AAD, lässt sich also nicht still entfernen. */
  umgebung: Umgebung;
}

export interface Umschlag { epk: string; iv: string; ct: string }

export interface Block {
  kopf: Blockkopf;
  iv: string;
  daten: string;
  umschlag: Umschlag;
  hash: string;
}

export interface Exportkopf {
  erstellt: string;
  umfang: "alle" | "einzeln";
  von: number;
  bis: number;
  anzahl: number;
  quelle: string;
}

export interface Exportinhalt {
  bloecke: Block[];
  /** Blocknummer (als Zeichenkette, JSON kennt keine Zahlschlüssel) → CEK in Base64. */
  schluessel: Record<string, string>;
  exportiertVon: string;
  quelle: string;
  anker: { block: number; hash: string; gemeldetAm: string } | null;
}

export interface Exportdatei {
  format: "einsatzbuch-export";
  version: 2;
  kopf: Exportkopf;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterationen: number; salt: string };
  chiffre: { name: "AES-GCM"; laenge: 256; iv: string };
  daten: string;
}
