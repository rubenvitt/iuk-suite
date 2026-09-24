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

const EINSATZ_SCHLUESSEL = [
  "v", "nummer", "stichwort", "beginnDatum", "beginnZeit", "endeDatum", "endeZeit",
  "strasse", "ort", "objekt", "fahrzeuge", "personal", "vorOrt", "transport", "notizen",
] as const;
const FAHRZEUG_SCHLUESSEL = ["id", "typ", "kennung", "ruf", "standort"] as const;
const PERSON_SCHLUESSEL = ["id", "name", "quali", "ov", "fahrzeugId"] as const;

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function hatGenauSchluessel(x: Record<string, unknown>, schluessel: readonly string[]): boolean {
  const keys = Object.keys(x);
  return keys.length === schluessel.length && schluessel.every((k) => keys.includes(k));
}

function istFahrzeugStand(x: unknown): x is FahrzeugStand {
  return istObjekt(x) && hatGenauSchluessel(x, FAHRZEUG_SCHLUESSEL) && FAHRZEUG_SCHLUESSEL.every((k) => typeof x[k] === "string");
}

function istPersonStand(x: unknown): x is PersonStand {
  if (!istObjekt(x) || !hatGenauSchluessel(x, PERSON_SCHLUESSEL)) return false;
  if (!(["id", "name", "quali", "ov"] as const).every((k) => typeof x[k] === "string")) return false;
  return typeof x.fahrzeugId === "string" || x.fahrzeugId === null;
}

/**
 * Formprüfung für einen entschlüsselten Klartext. Ein GCM-Rundlauf beweist nur, dass jemand
 * mit dem CEK diesen Klartext erzeugt hat — nicht, dass er wohlgeformt ist: Der öffentliche
 * Suite-Schlüssel ist öffentlich, und in einer Exportdatei reisen die CEKs mit. Deshalb prüft
 * `oeffneBlock` jeden Klartext gegen diese Form, bevor er als `Einsatz` gilt.
 */
export function istEinsatz(x: unknown): x is Einsatz {
  if (!istObjekt(x) || !hatGenauSchluessel(x, EINSATZ_SCHLUESSEL)) return false;
  if (x.v !== 1) return false;
  for (const feld of ["nummer", "stichwort", "beginnDatum", "beginnZeit", "strasse", "ort", "objekt", "notizen"] as const) {
    if (typeof x[feld] !== "string") return false;
  }
  for (const feld of ["endeDatum", "endeZeit"] as const) {
    if (typeof x[feld] !== "string" && x[feld] !== null) return false;
  }
  for (const feld of ["vorOrt", "transport"] as const) {
    const wert = x[feld];
    if (typeof wert !== "number" || !Number.isSafeInteger(wert) || wert < 0) return false;
  }
  if (!Array.isArray(x.fahrzeuge) || !x.fahrzeuge.every(istFahrzeugStand)) return false;
  if (!Array.isArray(x.personal) || !x.personal.every(istPersonStand)) return false;
  return true;
}
