//! Der Platzhalter-Riegel (Stufe 7, Review Focus 2): Ein Release-Build mit dem Platzhalter statt
//! des öffentlichen Updater-Schlüssels darf nicht entstehen, denn eine so ausgelieferte App nähme
//! nie ein Update an. `build.rs` bindet diese Datei per `#[path]` ein und bricht mit der Meldung
//! ab; `src/lib.rs` bindet sie im Test ein, damit die Regel ohne Build-Skript prüfbar ist. Sie
//! braucht deshalb nichts außer `serde_json` (Build- und normale Abhängigkeit).

/// Womit der Platzhalter in `tauri.conf.json` beginnt (`plugins.updater.pubkey`). Der
/// Release-Workflow prüft auf dieselbe Kennung.
pub const PLATZHALTER: &str = "PLATZHALTER";

/// Die Meldung des Riegels, samt Weg zum Runbook.
pub const MELDUNG: &str = "Der Updater-Schlüssel in tauri.conf.json ist noch ein Platzhalter. Erzeuge ihn nach docs/runbooks/einsatzbuch-release.md (Abschnitt „Updater-Schlüssel“) und trage den öffentlichen Teil ein.";

/// Prüft `plugins.updater.pubkey` in `conf` (Inhalt von `tauri.conf.json`). Nur im Profil
/// `release` scheitert sie, wenn der Schlüssel fehlt, leer ist oder mit `PLATZHALTER` beginnt:
/// Debug-Builds (Entwicklung, `tauri build --debug`, CI-Rauchtest) brauchen keinen Schlüssel,
/// denn der Updater läuft nur im Release-Build.
pub fn pruefe_updater_schluessel(conf: &str, profil: &str) -> Result<(), String> {
    if profil != "release" {
        return Ok(());
    }
    let wert: serde_json::Value =
        serde_json::from_str(conf).map_err(|e| format!("tauri.conf.json ist kein gültiges JSON: {e}"))?;
    let schluessel = wert.pointer("/plugins/updater/pubkey").and_then(serde_json::Value::as_str).map(str::trim);
    match schluessel {
        Some(s) if !s.is_empty() && !s.starts_with(PLATZHALTER) => Ok(()),
        _ => Err(MELDUNG.to_string()),
    }
}

#[cfg(test)]
mod tests {
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

    const PLATZHALTER_TEXT: &str =
        "PLATZHALTER — öffentlichen Minisign-Schlüssel nach docs/runbooks/einsatzbuch-release.md eintragen";
    /// So sieht ein öffentlicher Minisign-Schlüssel in `tauri.conf.json` aus (Base64 der
    /// `.pub`-Datei); dieser ist nur ein Beispiel und gehört zu keinem Schlüssel.
    const ECHT_WIRKEND: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDAwMDAwMDAwMDAwMDAwMDAKUldRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBCg==";

    #[test]
    fn platzhalter_im_release_scheitert_mit_runbook() {
        let fehler = pruefe_updater_schluessel(&conf(Some(PLATZHALTER_TEXT)), "release").unwrap_err();
        assert_eq!(fehler, MELDUNG);
        assert!(fehler.contains("docs/runbooks/einsatzbuch-release.md"), "{fehler}");
    }

    #[test]
    fn platzhalter_im_debug_ist_erlaubt() {
        assert_eq!(pruefe_updater_schluessel(&conf(Some(PLATZHALTER_TEXT)), "debug"), Ok(()));
    }

    #[test]
    fn echter_schluessel_im_release_ist_erlaubt() {
        assert_eq!(pruefe_updater_schluessel(&conf(Some(ECHT_WIRKEND)), "release"), Ok(()));
    }

    #[test]
    fn fehlender_oder_leerer_schluessel_im_release_scheitert() {
        assert_eq!(pruefe_updater_schluessel(&conf(None), "release"), Err(MELDUNG.to_string()));
        assert_eq!(pruefe_updater_schluessel(&conf(Some("  ")), "release"), Err(MELDUNG.to_string()));
        assert_eq!(pruefe_updater_schluessel(r#"{"productName":"Einsatzbuch"}"#, "release"), Err(MELDUNG.to_string()));
    }

    /// Schlägt an, sobald jemand den Platzhalter ohne Runbook entfernt: Der echte Schlüssel kommt
    /// nur über `docs/runbooks/einsatzbuch-release.md` hinein, und mit ihm wird dieser Test angepasst.
    #[test]
    fn echte_konfiguration_traegt_heute_den_platzhalter() {
        let wert: serde_json::Value = serde_json::from_str(ECHTE_CONF).unwrap();
        assert_eq!(wert.pointer("/plugins/updater/pubkey").and_then(|v| v.as_str()), Some(PLATZHALTER_TEXT));
        assert_eq!(pruefe_updater_schluessel(ECHTE_CONF, "release"), Err(MELDUNG.to_string()));
        assert_eq!(pruefe_updater_schluessel(ECHTE_CONF, "debug"), Ok(()));
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
}
