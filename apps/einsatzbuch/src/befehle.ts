/**
 * Die Tauri-Befehlsnaht — einzige Stelle mit `invoke()` in dieser App. Befehlsnamen sind
 * snake_case (`src-tauri/src/befehle.rs`, `#[tauri::command]`); Tauri übersetzt die camelCase-
 * Argumente selbst nach snake_case, deshalb kommen sie hier so an, wie Rust sie nennt
 * (`{ entwurf, bearbeitung }`, `{ spkiPfad, fristMinuten }`).
 */
import { invoke } from "@tauri-apps/api/core";

import type { Block } from "@kern/format";

import type {
  Ankerstand,
  Ausstehend,
  Entwurf,
  Schluesselposten,
  SitzungInfo,
  Stammdatenpaket,
  Status,
  Versiegelung,
  Wiederhergestellt,
} from "./typen";

export const befehle = {
  status: () => invoke<Status>("status"),
  stammdaten: () => invoke<Stammdatenpaket>("stammdaten"),
  /** `bearbeitung`: Bearbeitung eines ausstehenden Einsatzes; nach Fristende lehnt Rust sie ab. */
  entwurfSpeichern: (entwurf: Entwurf, bearbeitung: boolean) => invoke<void>("entwurf_speichern", { entwurf, bearbeitung }),
  entwurfVerwerfen: () => invoke<void>("entwurf_verwerfen"),
  /** `bearbeitung`: „Änderungen übernehmen“ statt der ersten Absendung, sonst wie bei `entwurfSpeichern`. */
  absenden: (entwurf: Entwurf, bearbeitung: boolean) => invoke<Ausstehend>("absenden", { entwurf, bearbeitung }),
  jetztVersiegeln: () => invoke<Versiegelung>("jetzt_versiegeln"),
  fristPruefen: () => invoke<Versiegelung | null>("frist_pruefen"),
  versiegelungQuittieren: () => invoke<void>("versiegelung_quittieren"),
  testbetriebBeenden: () => invoke<void>("testbetrieb_beenden"),
  entwicklungEinrichten: (a: { spkiPfad: string | null; fristMinuten: number | null }) =>
    invoke<void>("entwicklung_einrichten", a),
  /** Wartet bis zu 5 min auf den Anmelderückruf der Suite (`anmeldung_abbrechen` bricht ab). */
  einrichten: (a: { art: "echt" | "test"; name: string; suiteUrl: string }) => invoke<void>("einrichten", a),
  anmelden: () => invoke<SitzungInfo>("anmelden"),
  neuEinrichten: () => invoke<void>("neu_einrichten"),
  /** Synchron: Der laufende `einrichten`/`anmelden`/`neu_einrichten` endet danach mit „Anmeldung abgebrochen.“ */
  anmeldungAbbrechen: () => invoke<void>("anmeldung_abbrechen"),
  /** Synchron: verwirft das Sitzungstoken. */
  abmelden: () => invoke<void>("abmelden"),
  bloecke: () => invoke<Block[]>("bloecke"),
  /** Ohne `bloecke` (bzw. `undefined`) gibt die Suite wie bisher alle Inhaltsschlüssel frei; mit
   * einer Liste nur die genannten Blocknummern (Export „einzeln“). */
  schluesselFreigeben: (bloecke?: number[]) => invoke<Schluesselposten[]>("schluessel_freigeben", { bloecke: bloecke ?? null }),
  ankerAbgleichen: () => invoke<Ankerstand>("anker_abgleichen"),
  stammdatenAbgleichen: () => invoke<void>("stammdaten_abgleichen"),
  /** Ob die App beim Anmelden am Betriebssystem startet (`autostart_status`); synchron in Rust. */
  autostartStatus: () => invoke<boolean>("autostart_status"),
  /** Schaltet den Autostart (`autostart_setzen`); die Verwaltung bietet das nur im Echtbetrieb an. */
  autostartSetzen: (an: boolean) => invoke<void>("autostart_setzen", { an }),
  /** Öffnet den Ordnerdialog des Systems; `null` heißt abgebrochen, sonst der gewählte Pfad. Nur im Echtbetrieb. */
  sicherungsordnerWaehlen: () => invoke<string | null>("sicherungsordner_waehlen"),
  /** Öffnet den Dateidialog (`.json`) und stellt die Sicherung wieder her; `null` heißt abgebrochen. */
  wiederherstellen: () => invoke<Wiederhergestellt | null>("wiederherstellen"),
  /** Speichern-Dialog des Systems (Vorschlagsname, Filter `.einsatzbuch`), dann atomar
   * geschrieben; `null` heißt im Dialog abgebrochen, sonst der Dateiname des Ziels. */
  exportSpeichern: (inhalt: string, dateiname: string) => invoke<string | null>("export_speichern", { inhalt, dateiname }),
  /** `WebviewWindow::print()` der Hülle — kein `window.print()` im Webview. */
  drucken: () => invoke<void>("drucken"),
  /** „Im Reader öffnen“: `<suiteUrl>/m/einsatzbuch/reader` im Systembrowser. */
  readerOeffnen: () => invoke<void>("reader_oeffnen"),
};
