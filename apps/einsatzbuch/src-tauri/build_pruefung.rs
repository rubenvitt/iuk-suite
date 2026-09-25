//! Der Platzhalter-Riegel (Stufe 7, Review Focus 2): Ein Release-Build mit dem Platzhalter statt
//! des öffentlichen Updater-Schlüssels darf nicht entstehen, denn eine so ausgelieferte App nähme
//! nie ein Update an. `build.rs` bindet diese Datei per `#[path]` ein und bricht mit der Meldung
//! ab; `src/lib.rs` bindet sie im Test ein, damit die Regel ohne Build-Skript prüfbar ist. Sie
//! braucht deshalb nichts außer `serde_json` und `base64` (Build- und Test-Abhängigkeiten).

/// Womit der Platzhalter in `tauri.conf.json` beginnt (`plugins.updater.pubkey`). Der
/// Release-Workflow prüft auf dieselbe Kennung.
pub const PLATZHALTER: &str = "PLATZHALTER";

/// Die Meldung des Riegels, samt Weg zum Runbook.
pub const MELDUNG: &str = "Der Updater-Schlüssel in tauri.conf.json ist noch ein Platzhalter. Erzeuge ihn nach docs/runbooks/einsatzbuch-release.md (Abschnitt „Updater-Schlüssel“) und trage den öffentlichen Teil ein.";

/// Ob der Riegel greift: im Profil `release` und immer, wenn `debug_assertions` aus ist, denn
/// dann ist der Updater einkompiliert (`lib.rs`, `cfg(not(debug_assertions))`), auch in einem
/// eigenen Profil.
pub fn riegel_greift(profil: &str, debug_assertions: bool) -> bool {
    profil == "release" || !debug_assertions
}

/// Prüft `plugins.updater.pubkey` in `conf` (Inhalt von `tauri.conf.json`), wenn der Riegel
/// greift (`riegel_greift`): Durch kommt nur ein gültiger öffentlicher Minisign-Schlüssel
/// (`ist_minisign_schluessel`), alles andere scheitert mit `MELDUNG`. Debug-Builds (Entwicklung, `tauri build --debug`, CI-Rauchtest)
/// brauchen keinen Schlüssel, denn der Updater läuft nur ohne `debug_assertions`.
pub fn pruefe_updater_schluessel(conf: &str, profil: &str, debug_assertions: bool) -> Result<(), String> {
    if !riegel_greift(profil, debug_assertions) {
        return Ok(());
    }
    let wert: serde_json::Value =
        serde_json::from_str(conf).map_err(|e| format!("tauri.conf.json ist kein gültiges JSON: {e}"))?;
    match wert.pointer("/plugins/updater/pubkey").and_then(serde_json::Value::as_str) {
        // Der Platzhalter ausdrücklich, auch wenn er an der Prüfung darunter ebenso scheitert.
        Some(s) if s.starts_with(PLATZHALTER) => Err(MELDUNG.to_string()),
        Some(s) if ist_minisign_schluessel(s) => Ok(()),
        // Fehlend, leer, anders geschrieben, mit BOM oder unsichtbaren Zeichen: dieselbe Meldung.
        _ => Err(MELDUNG.to_string()),
    }
}

/// Ob `wert` ein öffentlicher Minisign-Schlüssel ist, wie ihn das Updater-Plugin liest: Base64
/// (Standard, ohne Leerraum, wie `tauri-plugin-updater` dekodiert) einer `.pub`-Datei. Deren
/// erste Zeile beginnt mit `untrusted comment:`, die zweite ist Base64 von „Ed“ + 8 Byte
/// Schlüssel-ID + 32 Byte Schlüssel und beginnt deshalb mit `RW`. Ein Platzhalter in beliebiger
/// Schreibweise, ein BOM oder ein unsichtbares Zeichen scheitert schon an der Base64-Dekodierung.
fn ist_minisign_schluessel(wert: &str) -> bool {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;

    let Ok(roh) = STANDARD.decode(wert) else { return false };
    let Ok(datei) = String::from_utf8(roh) else { return false };
    let mut zeilen = datei.lines();
    let (Some(kommentar), Some(schluessel)) = (zeilen.next(), zeilen.next()) else { return false };
    kommentar.starts_with("untrusted comment:")
        && schluessel.starts_with("RW")
        && STANDARD.decode(schluessel).is_ok_and(|k| k.len() == 42 && k.starts_with(b"Ed"))
}

#[cfg(test)]
mod tests {
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;

    use super::*;

    /// Die echte Konfiguration, relativ zu dieser Datei.
    const ECHTE_CONF: &str = include_str!("tauri.conf.json");
    const OVERLAY: &str = include_str!("tauri.release.conf.json");

    fn conf(pubkey: Option<&str>) -> String {
        let mut updater = serde_json::json!({ "endpoints": ["https://example.org/latest.json"] });
        if let Some(k) = pubkey {
            updater["pubkey"] = k.into();
        }
        serde_json::json!({ "productName": "Einsatzbuch", "plugins": { "updater": updater } }).to_string()
    }

    fn release(pubkey: Option<&str>) -> Result<(), String> {
        pruefe_updater_schluessel(&conf(pubkey), "release", false)
    }

    const PLATZHALTER_TEXT: &str =
        "PLATZHALTER — öffentlichen Minisign-Schlüssel nach docs/runbooks/einsatzbuch-release.md eintragen";

    /// Ein syntaktisch gültiger öffentlicher Minisign-Schlüssel, wie ihn `tauri signer generate`
    /// in `tauri.conf.json` erwartet: Base64 der `.pub`-Datei, deren zweite Zeile Base64 von „Ed“,
    /// 8 Byte Schlüssel-ID und 32 Byte Schlüssel ist. Nullen, also zu keinem echten Schlüssel.
    fn minisign_schluessel() -> String {
        let mut roh = b"Ed".to_vec();
        roh.extend([0u8; 40]);
        let datei = format!("untrusted comment: minisign public key: 0000000000000000\n{}\n", STANDARD.encode(roh));
        STANDARD.encode(datei)
    }

    #[test]
    fn platzhalter_im_release_scheitert_mit_runbook() {
        let fehler = release(Some(PLATZHALTER_TEXT)).unwrap_err();
        assert_eq!(fehler, MELDUNG);
        assert!(fehler.contains("docs/runbooks/einsatzbuch-release.md"), "{fehler}");
    }

    #[test]
    fn platzhalter_im_debug_ist_erlaubt() {
        assert_eq!(pruefe_updater_schluessel(&conf(Some(PLATZHALTER_TEXT)), "debug", true), Ok(()));
    }

    #[test]
    fn gueltiger_minisign_schluessel_im_release_ist_erlaubt() {
        let schluessel = minisign_schluessel();
        assert!(STANDARD.decode(&schluessel).is_ok());
        assert_eq!(release(Some(&schluessel)), Ok(()));
    }

    #[test]
    fn fehlender_oder_leerer_schluessel_im_release_scheitert() {
        assert_eq!(release(None), Err(MELDUNG.to_string()));
        assert_eq!(release(Some("")), Err(MELDUNG.to_string()));
        assert_eq!(release(Some("  ")), Err(MELDUNG.to_string()));
        assert_eq!(pruefe_updater_schluessel(r#"{"productName":"Einsatzbuch"}"#, "release", false), Err(MELDUNG.to_string()));
    }

    /// Nur ein gültiger Minisign-Schlüssel kommt durch, nicht bloß alles ohne „PLATZHALTER“ vorn.
    #[test]
    fn andere_platzhalter_und_tricks_scheitern() {
        let gueltig = minisign_schluessel();
        let faelle = [
            PLATZHALTER_TEXT.to_lowercase(),
            "Platzhalter".to_string(),
            "TODO".to_string(),
            format!("\u{feff}{PLATZHALTER_TEXT}"),
            format!("\u{200b}{PLATZHALTER_TEXT}"),
            // Gültiger Schlüssel mit BOM oder unsichtbarem Zeichen davor oder darin.
            format!("\u{feff}{gueltig}"),
            format!("\u{200b}{gueltig}"),
            format!("{}\u{200b}{}", &gueltig[..10], &gueltig[10..]),
            // Base64, aber kein Minisign-Schlüssel.
            STANDARD.encode("hallo"),
            STANDARD.encode("untrusted comment: minisign public key\nKEINSCHLUESSEL\n"),
            STANDARD.encode("untrusted comment: minisign public key\nRWkurz\n"),
            STANDARD.encode(format!("kein kommentar\n{}\n", STANDARD.encode([b"Ed".as_slice(), &[0u8; 40]].concat()))),
        ];
        for fall in faelle {
            assert_eq!(release(Some(&fall)), Err(MELDUNG.to_string()), "{fall:?}");
        }
    }

    /// Ohne `debug_assertions` ist der Updater einkompiliert, also greift der Riegel auch in einem
    /// anderen Profil als `release`.
    #[test]
    fn riegel_folgt_dem_schalter_des_updaters() {
        assert!(riegel_greift("release", false));
        assert!(riegel_greift("release", true));
        assert!(riegel_greift("debug", false));
        assert!(!riegel_greift("debug", true));
        let platzhalter = conf(Some(PLATZHALTER_TEXT));
        assert_eq!(pruefe_updater_schluessel(&platzhalter, "debug", false), Err(MELDUNG.to_string()));
        assert_eq!(pruefe_updater_schluessel(&platzhalter, "debug", true), Ok(()));
    }

    /// Schlägt an, sobald jemand den Platzhalter ohne Runbook entfernt: Der echte Schlüssel kommt
    /// nur über `docs/runbooks/einsatzbuch-release.md` hinein, und mit ihm wird dieser Test angepasst.
    #[test]
    fn echte_konfiguration_traegt_heute_den_platzhalter() {
        let wert: serde_json::Value = serde_json::from_str(ECHTE_CONF).unwrap();
        assert_eq!(wert.pointer("/plugins/updater/pubkey").and_then(|v| v.as_str()), Some(PLATZHALTER_TEXT));
        assert_eq!(pruefe_updater_schluessel(ECHTE_CONF, "release", false), Err(MELDUNG.to_string()));
        assert_eq!(pruefe_updater_schluessel(ECHTE_CONF, "debug", true), Ok(()));
        assert_eq!(
            wert.pointer("/plugins/updater/endpoints"),
            Some(&serde_json::json!(["https://github.com/rubenvitt/iuk-suite/releases/download/einsatzbuch-updater/latest.json"]))
        );
        assert_eq!(wert.pointer("/plugins/updater/windows/installMode").and_then(|v| v.as_str()), Some("passive"));
    }

    /// `createUpdaterArtifacts` verlangt beim Bündeln den privaten Schlüssel. Es steht deshalb nur
    /// im Overlay des Release-Workflows, damit `tauri build --debug` ohne Schlüssel weiterläuft.
    #[test]
    fn updater_artefakte_nur_im_release_overlay() {
        let basis: serde_json::Value = serde_json::from_str(ECHTE_CONF).unwrap();
        let overlay: serde_json::Value = serde_json::from_str(OVERLAY).unwrap();
        assert_eq!(basis.pointer("/bundle/createUpdaterArtifacts"), None);
        assert_eq!(overlay.pointer("/bundle/createUpdaterArtifacts"), Some(&serde_json::Value::Bool(true)));
    }

    /// Das Release-Bundle für macOS ist ad hoc signiert (`"-"` reicht der Bundler als
    /// `codesign --sign -` durch): Ohne jede Signatur nennt macOS auf Apple Silicon eine
    /// heruntergeladene App „beschädigt“. Der Debug-Rauchtest bleibt ohne.
    #[test]
    fn adhoc_signatur_nur_im_release_overlay() {
        let basis: serde_json::Value = serde_json::from_str(ECHTE_CONF).unwrap();
        let overlay: serde_json::Value = serde_json::from_str(OVERLAY).unwrap();
        assert_eq!(basis.pointer("/bundle/macOS/signingIdentity"), None);
        assert_eq!(overlay.pointer("/bundle/macOS/signingIdentity"), Some(&serde_json::json!("-")));
    }
}
