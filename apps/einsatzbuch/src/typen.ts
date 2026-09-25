/**
 * Spiegel der Rust-DTOs aus `src-tauri/kern/src/erfassung.rs` und `einrichtung.rs`, feldgleich
 * mit deren `#[serde(rename_all = "camelCase")]`-Form, und des `Status` aus `src-tauri/src/befehle.rs`.
 * Diese Datei bleibt reine Typdeklaration ohne Logik — die Prüfung, ob ein Wert dazu passt,
 * gehört dem Kern (Rust) oder `logik/`.
 */

export interface PersonAuswahl {
  id: string;
  fahrzeugId: string | null;
}

export interface Entwurf {
  stichwort: string;
  beginnDatum: string;
  beginnZeit: string;
  endeDatum: string;
  endeZeit: string;
  strasse: string;
  ort: string;
  objekt: string;
  fahrzeuge: string[];
  personal: PersonAuswahl[];
  vorOrt: number;
  transport: number;
  notizen: string;
}

export interface Fahrzeug {
  id: string;
  typ: string;
  kennung: string;
  ruf: string;
  standort: string;
}

export interface Person {
  id: string;
  name: string;
  quali: string;
  ov: string;
}

export interface Stichwortgruppe {
  name: string;
  items: string[];
}

export interface Stammdaten {
  fahrzeuge: Fahrzeug[];
  personal: Person[];
  stichworte: Stichwortgruppe[];
}

export interface Stammdatenpaket {
  version: number;
  stammdaten: Stammdaten;
  fristMinuten: number;
  besatzung: boolean;
  zeitzone: string;
  bereitschaft: string;
}

export interface Ausstehend {
  entwurf: Entwurf;
  abgesendetAm: string;
  fristBis: string;
  fristBisMs: number;
}

export interface Versiegelung {
  block: number;
  hash: string;
  prev: string;
  versiegelt: string;
  nummer: string;
  verfallen: boolean;
}

export interface Kettenglied {
  block: number;
  hash: string;
}

export interface Kettenstand {
  anzahl: number;
  letzter: Kettenglied | null;
}

export interface Status {
  betrieb: "echt" | "test" | null;
  eingerichtet: boolean;
  entwicklung: boolean;
  /** Die Datenbank ließ sich nicht öffnen; siehe `befehle.rs`, `Status.startfehler`. */
  startfehler: string | null;
  bereitschaft: string | null;
  zeitzone: string | null;
  fristMinuten: number | null;
  besatzung: boolean | null;
  jetzt: string;
  jetztMs: number;
  entwurf: Entwurf | null;
  ausstehend: Ausstehend | null;
  kette: Kettenstand;
  versiegelung: Versiegelung | null;
}
