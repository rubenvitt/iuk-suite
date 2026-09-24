//! Öffnen der Anmelde-URL (Spec §4.4). Den Loopback-Listener baut Stufe 5; hier steht nur die
//! Weiche, damit Playwright die Anmeldung später übernehmen kann: In Debug-Builds mit
//! `EINSATZBUCH_ANMELDUNG_STDOUT=1` geht die URL auf stdout statt in den Systembrowser.
pub const STDOUT_SCHALTER: &str = "EINSATZBUCH_ANMELDUNG_STDOUT";
pub const STDOUT_PRAEFIX: &str = "EINSATZBUCH_ANMELDE_URL=";

/// Wohin die Anmelde-URL geht: als fertige Zeile auf stdout oder in den Systembrowser.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ziel {
    Stdout(String),
    Browser,
}

/// Reine Entscheidung (testbar); `schalter` ist der Wert der Umgebungsvariable
/// `STDOUT_SCHALTER`. Nur genau `"1"` schaltet um, und nur in Debug-Builds — ein Release-Build
/// öffnet immer den Systembrowser, gleich was in der Umgebung steht.
pub fn ziel(url: &str, schalter: Option<&str>) -> Ziel {
    if cfg!(debug_assertions) && schalter == Some("1") {
        Ziel::Stdout(format!("{STDOUT_PRAEFIX}{url}"))
    } else {
        Ziel::Browser
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Die Tests laufen im Debug-Profil, `cfg!(debug_assertions)` ist hier also wahr.
    #[test]
    fn schalter_eins_schickt_die_url_mit_praefix_auf_stdout() {
        assert_eq!(ziel("u", Some("1")), Ziel::Stdout("EINSATZBUCH_ANMELDE_URL=u".into()));
    }

    #[test]
    fn ohne_schalter_oder_mit_anderem_wert_geht_es_in_den_browser() {
        assert_eq!(ziel("u", None), Ziel::Browser);
        assert_eq!(ziel("u", Some("0")), Ziel::Browser);
        assert_eq!(ziel("u", Some("")), Ziel::Browser);
        assert_eq!(ziel("u", Some("true")), Ziel::Browser);
    }
}
