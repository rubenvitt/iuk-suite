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

/** Die Verwaltungssitzung im Status, ohne Token (`src-tauri/src/befehle.rs`, `SitzungInfo`). */
export interface SitzungInfo {
  name: string;
  ablaufMs: number;
}

/** Anker der Suite weicht vom lokalen Wert ab (Spec §8), aus `Status.ankerAbweichung` oder `Ankerstand.abweichung`. */
export interface Ankerabweichung {
  block: number;
  erwartet: string;
  gemeldet: string;
}

/** Rückgabe von `anker_abgleichen` (`src-tauri/src/befehle.rs`, `Ankerstand`). */
export interface Ankerstand {
  bestaetigtBis: number;
  hash: string | null;
  gemeldetAm: string | null;
  abweichung: Ankerabweichung | null;
  offline: boolean;
  widerrufen: boolean;
}

/** Ein Posten der Schlüsselfreigabe (`src-tauri/kern/src/vertrag.rs`, `Schluesselposten`). */
export interface Schluesselposten {
  block: number;
  cek: string;
}

/** Der letzte von der Suite bestätigte Anker samt Zeitpunkt (`src-tauri/kern/src/buch.rs`,
 *  `Exportanker`) — genau die Form von `Exportinhalt.anker` im geteilten Kern (`format.ts`). */
export interface Exportanker {
  block: number;
  hash: string;
  gemeldetAm: string;
}

/** Ampel der Sicherung (`src-tauri/kern/src/sicherung.rs`, `Sicherungsstufe`): `aus` im Testbetrieb,
 *  `rot` ab 7 Tagen ohne gelungene Sicherung, `gelb` ohne Ordner oder nach einem Fehlschlag. */
export type Sicherungsstufe = "aus" | "ok" | "gelb" | "rot";

/** Stand der Sicherung im Status (`src-tauri/src/sicherung.rs`, `Sicherungsstand`). */
export interface Sicherungsstand {
  ordner: string | null;
  /** Letzte gelungene Sicherung, in der Zone der Einrichtung. */
  letzte: string | null;
  /** Text des letzten gescheiterten Versuchs; `null` nach einem Erfolg. */
  fehler: string | null;
  stufe: Sicherungsstufe;
}

/** Rückgabe von `wiederherstellen` (`src-tauri/src/sicherung.rs`, `Wiederhergestellt`). */
export interface Wiederhergestellt {
  bloecke: number;
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
  /** Suite-Adresse der Einrichtung; `null` ohne Einrichtung. */
  suiteUrl: string | null;
  /** Suite-Adresse eines echten Rechners — Vorbelegung der Einrichtungsfrage. */
  suiteVorgabe: string;
  rechnerName: string | null;
  eingerichtetAm: string | null;
  eingerichtetVon: string | null;
  schluesselId: string | null;
  /** Letzter Stammdatenabruf; bis zum ersten Abgleich der Zeitpunkt der Einrichtung. */
  stammdatenVom: string | null;
  ankerBestaetigtBis: number;
  ankerAbweichung: Ankerabweichung | null;
  /** Der letzte bestätigte Anker mit Zeitpunkt; `null`, solange die Suite nichts bestätigt hat. */
  anker: Exportanker | null;
  /** Sicherungsordner, letzte Sicherung, letzter Fehler und Ampel; `null` ohne Einrichtung. Ob
   *  die Kette leer ist, steht in `kette.anzahl`. */
  sicherung: Sicherungsstand | null;
  widerrufen: boolean;
  /** Die Verwaltungssitzung; eine abgelaufene erscheint als `null`. */
  sitzung: SitzungInfo | null;
  /** Die App wartet auf den Anmelderückruf der Suite. Wird schon vor dem Ausgang des laufenden
   *  Befehls `false` — die Oberfläche sperrt ihre Knöpfe deshalb am eigenen Zustand, nicht daran. */
  anmeldungLaeuft: boolean;
  /** Version eines vorgemerkten, noch nicht installierten Updates (`src-tauri/src/updater.rs`);
   *  `null` ohne Vormerkung und immer im Debug-Build. */
  update: string | null;
  /** Der letzte Fehler des Updaters als kurzer Text (`Updatefehler::anzeige` in
   *  `src-tauri/src/updater.rs`); `null`, solange nichts scheiterte, und immer im Debug-Build. */
  updateFehler: string | null;
}
