/**
 * Die Tauri-Befehlsnaht — einzige Stelle mit `invoke()` in dieser App. Befehlsnamen sind
 * snake_case (`src-tauri/src/befehle.rs`, `#[tauri::command]`); Tauri übersetzt die camelCase-
 * Argumente selbst nach snake_case, deshalb kommen sie hier so an, wie Rust sie nennt
 * (`{ entwurf }`, `{ spkiPfad, fristMinuten }`).
 */
import { invoke } from "@tauri-apps/api/core";

import type { Ausstehend, Entwurf, Stammdatenpaket, Status, Versiegelung } from "./typen";

export const befehle = {
  status: () => invoke<Status>("status"),
  stammdaten: () => invoke<Stammdatenpaket>("stammdaten"),
  entwurfSpeichern: (entwurf: Entwurf) => invoke<void>("entwurf_speichern", { entwurf }),
  entwurfVerwerfen: () => invoke<void>("entwurf_verwerfen"),
  absenden: (entwurf: Entwurf) => invoke<Ausstehend>("absenden", { entwurf }),
  jetztVersiegeln: () => invoke<Versiegelung>("jetzt_versiegeln"),
  fristPruefen: () => invoke<Versiegelung | null>("frist_pruefen"),
  versiegelungQuittieren: () => invoke<void>("versiegelung_quittieren"),
  testbetriebBeenden: () => invoke<void>("testbetrieb_beenden"),
  entwicklungEinrichten: (a: { spkiPfad: string | null; fristMinuten: number | null }) =>
    invoke<void>("entwicklung_einrichten", a),
};
