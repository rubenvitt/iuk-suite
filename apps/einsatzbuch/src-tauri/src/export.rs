//! Export speichern, Drucken und den Reader der Suite öffnen (Spec §3.3, §10, Stufe 6, Task 6).
//! Zusammengebaut wird der Export in TS (`verschluesseleExport` aus `K`, ein reines App-Modul
//! `A/src/logik/export.ts`, Entscheidung 7) — die Hülle prüft hier nur die äußere Kennung
//! (`format`/`version`) und schreibt atomar ohne Rotation (`kern::sicherung::schreibe_atomar`).
//! Speichern-Dialog, Drucken und der Opener bleiben in der Hülle: Kein Lock wird über einem
//! Dialog, dem Schreiben außerhalb des App-Datenordners (Exportziel) oder dem Öffnen des
//! Browsers gehalten (Sperrreihenfolge, `zustand.rs`).
use std::path::Path;

use einsatzbuch_kern::anmeldung;
use einsatzbuch_kern::sicherung as kern_sicherung;
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::befehle::{NICHT_EINGERICHTET, blockierend, buch_fehler_text};
use crate::zustand::Zustand;

/// Wert von `format` in einer Exportdatei (`K/_lib/kern/export.ts`, `istExportdatei`).
pub(crate) const FORMAT: &str = "einsatzbuch-export";
/// Wert von `version` in einer Exportdatei.
pub(crate) const VERSION: u64 = 2;
/// Dateiendung des Speichern-Dialogs und der Vorschlagsnamen (Vorlage `exportieren`).
const ENDUNG: &str = "einsatzbuch";
const FREMDES_FORMAT: &str = "Das ist keine Einsatzbuch-Exportdatei.";
/// Pfad des Readers unterhalb von `/m/einsatzbuch` (Entscheidung 7: „Im Reader öffnen“).
const READER_PFAD: &str = "/reader";

/// Prüft `inhalt` und schreibt ihn atomar (ohne Rotation, Entscheidung 7) nach `ziel`; gibt den
/// Dateinamen des Ziels zurück. Ein vorhandenes Ziel wird vollständig ersetzt — hängt
/// `export_speichern` die Endung erst hinter dem Dialog an, fragt kein Dialog mehr nach, ob eine
/// so entstandene, schon vorhandene Datei ersetzt werden darf.
///
/// Geprüft wird nur die äußere Kennung (`format`/`version`), über `serde_json::Value` und nicht
/// über ein `#[derive(Deserialize)]`-Struct: Serdes Structs nehmen aus einem JSON-Array auch
/// positionale Felder an (`["einsatzbuch-export", 2]` würde sonst als gültige Kennung
/// durchgehen), ein `Value` dagegen nur aus einem Objekt mit diesen Schlüsseln. Die volle Form
/// (Schlüssel, KDF, Chiffre) prüft `istExportdatei` in TS (`K`, eingefroren) — hier geht es nur
/// darum, ob überhaupt eine Exportdatei geschrieben wird.
pub fn speichere_export(ziel: &Path, inhalt: &str) -> Result<String, String> {
    let kennung: Value = serde_json::from_str(inhalt).map_err(|_| FREMDES_FORMAT.to_string())?;
    let passt = kennung.get("format").and_then(Value::as_str) == Some(FORMAT) && kennung.get("version").and_then(Value::as_u64) == Some(VERSION);
    if !passt {
        return Err(FREMDES_FORMAT.into());
    }
    kern_sicherung::schreibe_atomar(ziel, inhalt.as_bytes()).map_err(|e| format!("Der Export ließ sich nicht speichern: {e}"))?;
    Ok(ziel.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string())
}

/// Hängt `.einsatzbuch` an, wenn `name` noch nicht darauf endet.
fn mit_endung(name: &str) -> String {
    let endung = format!(".{ENDUNG}");
    if name.ends_with(&endung) { name.to_string() } else { format!("{name}{endung}") }
}

/// „Export speichern“ (Entscheidung 7): der Speichern-Dialog des Systems mit Vorschlagsname und
/// Filter `einsatzbuch`, danach `speichere_export`. `None` heißt: im Dialog abgebrochen. Der
/// Dialog läuft nur innerhalb von `blockierend`, auf dem Thread für blockierende Arbeit.
#[tauri::command]
pub async fn export_speichern(app: AppHandle, inhalt: String, dateiname: String) -> Result<Option<String>, String> {
    let dialog = app.clone();
    blockierend(app, move |_z| {
        let Some(gewaehlt) = dialog
            .dialog()
            .file()
            .set_title("Export speichern")
            .set_file_name(mit_endung(&dateiname))
            .add_filter("Einsatzbuch-Export", &[ENDUNG])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let pfad = gewaehlt.into_path().map_err(|_| "Das gewählte Ziel ist kein lokaler Pfad.".to_string())?;
        let name = pfad.file_name().and_then(|n| n.to_str()).ok_or_else(|| "Der gewählte Dateiname ist kein gültiger Text.".to_string())?;
        // `mit_endung` ist idempotent, also immer anwenden statt die Endung erst zu prüfen:
        // eine Regel, die der Test auch tatsächlich durchläuft.
        let pfad = pfad.with_file_name(mit_endung(name));
        speichere_export(&pfad, &inhalt).map(Some)
    })
    .await
}

/// `WebviewWindow::print()` — WKWebView kennt kein zuverlässiges `window.print()` (Entscheidung 8).
/// Synchron und ohne Zustand wie `autostart_status`/`autostart_setzen`: Es gibt hier nichts, was
/// sich ohne ein echtes Fenster testen ließe.
#[tauri::command]
pub fn drucken(app: AppHandle) -> Result<(), String> {
    use tauri::Manager;
    app.get_webview_window("main")
        .ok_or_else(|| "Das Hauptfenster ist nicht offen.".to_string())?
        .print()
        .map_err(|e| format!("Drucken ließ sich nicht starten: {e}"))
}

/// Baut die Reader-URL aus der Einrichtung (nie aus der Oberfläche, Entscheidung 7) und öffnet
/// sie über `oeffne` — im echten Befehl der Systembrowser, im Test ein Aufzeichner.
pub fn oeffne_reader(z: &Zustand, oeffne: &dyn Fn(&str) -> Result<(), String>) -> Result<(), String> {
    let suite_url = {
        let buch = z.buch_zum_schreiben()?;
        let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
        offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?.suite_url
    };
    oeffne(&anmeldung::modul_url(&suite_url, READER_PFAD))
}

/// „Im Reader öffnen“: `<suiteUrl>/m/einsatzbuch/reader` im Systembrowser.
#[tauri::command]
pub async fn reader_oeffnen(app: AppHandle) -> Result<(), String> {
    let oeffner = app.clone();
    blockierend(app, move |z| {
        oeffne_reader(z, &|url| oeffner.opener().open_url(url, None::<&str>).map_err(|e| format!("Der Browser ließ sich nicht öffnen: {e}")))
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use einsatzbuch_kern::tresor::Speichertresor;

    use super::*;
    use crate::befehle::tests::{FakeSuite, Stelluhr, eingerichteter_echter_rechner, zustand_mit};

    fn exportdatei(inhalt: &serde_json::Value) -> String {
        inhalt.to_string()
    }

    #[test]
    fn speichere_export_lehnt_fremdes_json_ab() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = ordner.path().join("einsatz.einsatzbuch");

        assert_eq!(speichere_export(&ziel, "kein json").unwrap_err(), FREMDES_FORMAT);
        assert!(!ziel.exists());

        let falsches_format = exportdatei(&serde_json::json!({ "format": "etwas-anderes", "version": 2 }));
        assert_eq!(speichere_export(&ziel, &falsches_format).unwrap_err(), FREMDES_FORMAT);
        assert!(!ziel.exists());

        let falsche_version = exportdatei(&serde_json::json!({ "format": FORMAT, "version": 1 }));
        assert_eq!(speichere_export(&ziel, &falsche_version).unwrap_err(), FREMDES_FORMAT);
        assert!(!ziel.exists());

        let ohne_kennung = exportdatei(&serde_json::json!({ "kopf": {} }));
        assert_eq!(speichere_export(&ziel, &ohne_kennung).unwrap_err(), FREMDES_FORMAT);
        assert!(!ziel.exists());

        // Kein Objekt: Ein `#[derive(Deserialize)]`-Struct nähme aus einem Array auch
        // positionale Felder an (`format = "einsatzbuch-export"`, `version = 2`); das wäre keine
        // Prüfung mehr. `serde_json::Value` verlangt hier ein Objekt mit diesen Schlüsseln.
        let array = exportdatei(&serde_json::json!([FORMAT, VERSION]));
        assert_eq!(speichere_export(&ziel, &array).unwrap_err(), FREMDES_FORMAT);
        assert!(!ziel.exists());
    }

    #[test]
    fn speichere_export_schreibt_atomar_und_ueberschreibt_vorhandene_dateien() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = ordner.path().join("einsatz_2026-001.einsatzbuch");
        let inhalt = exportdatei(&serde_json::json!({ "format": FORMAT, "version": VERSION, "daten": "eins" }));

        let name = speichere_export(&ziel, &inhalt).unwrap();
        assert_eq!(name, "einsatz_2026-001.einsatzbuch");
        assert_eq!(std::fs::read_to_string(&ziel).unwrap(), inhalt);
        // Keine Temp-Datei bleibt liegen (Review Focus 2: „atomar heißt atomar“).
        assert_eq!(std::fs::read_dir(ordner.path()).unwrap().count(), 1);

        let neuer_inhalt = exportdatei(&serde_json::json!({ "format": FORMAT, "version": VERSION, "daten": "zwei" }));
        let name = speichere_export(&ziel, &neuer_inhalt).unwrap();
        assert_eq!(name, "einsatz_2026-001.einsatzbuch");
        assert_eq!(std::fs::read_to_string(&ziel).unwrap(), neuer_inhalt, "eine vorhandene Datei wird ersetzt");
        assert_eq!(std::fs::read_dir(ordner.path()).unwrap().count(), 1, "keine Rotation beim Export");
    }

    #[test]
    fn mit_endung_ergaenzt_nur_wenn_sie_fehlt() {
        assert_eq!(mit_endung("einsatz_2026-001"), "einsatz_2026-001.einsatzbuch");
        assert_eq!(mit_endung("einsatz_2026-001.einsatzbuch"), "einsatz_2026-001.einsatzbuch");
        assert_eq!(mit_endung("mit.punkt.einsatzbuch"), "mit.punkt.einsatzbuch");
    }

    /// Zeichnet jede geöffnete URL auf, ohne den Loopback-Rückruf der Anmeldung nachzubilden
    /// (`oeffne_reader` wartet auf keinen Rückruf).
    #[derive(Default)]
    struct Aufzeichner(Arc<Mutex<Vec<String>>>);

    impl Aufzeichner {
        fn oeffne(&self, u: &str) -> Result<(), String> {
            self.0.lock().unwrap().push(u.to_string());
            Ok(())
        }

        fn urls(&self) -> Vec<String> {
            self.0.lock().unwrap().clone()
        }
    }

    #[test]
    fn oeffne_reader_baut_die_url_aus_der_einrichtung_nie_aus_der_oberflaeche() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let aufzeichner = Aufzeichner::default();
        oeffne_reader(&z, &|u| aufzeichner.oeffne(u)).unwrap();
        assert_eq!(aufzeichner.urls(), ["https://suite.example/m/einsatzbuch/reader"]);
    }

    #[test]
    fn oeffne_reader_ohne_einrichtung_scheitert_ohne_url_zu_oeffnen() {
        let ordner = tempfile::tempdir().unwrap();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &FakeSuite::gesund(), Box::new(Speichertresor::default()));
        let aufzeichner = Aufzeichner::default();
        assert_eq!(oeffne_reader(&z, &|u| aufzeichner.oeffne(u)).unwrap_err(), NICHT_EINGERICHTET);
        assert!(aufzeichner.urls().is_empty());
    }
}
