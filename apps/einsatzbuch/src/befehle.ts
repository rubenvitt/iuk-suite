/**
 * Die Tauri-Befehlsnaht — einzige Stelle mit `invoke()` in dieser App. Befehlsnamen sind
 * snake_case (`src-tauri/src/befehle.rs`, `#[tauri::command]`); Tauri übersetzt die camelCase-
 * Argumente selbst nach snake_case, deshalb kommen sie hier so an, wie Rust sie nennt
 * (`{ entwurf, bearbeitung }`, `{ spkiPfad, fristMinuten }`).
 */
import { invoke } from "@tauri-apps/api/core";

import type { Ausstehend, Entwurf, Stammdatenpaket, Status, Versiegelung } from "./typen";

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
};
