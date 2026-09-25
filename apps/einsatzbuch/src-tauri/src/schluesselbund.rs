//! Das Geräte-Token im Schlüsselbund des Betriebssystems (Entscheidung 8): unter macOS der
//! Schlüsselbund (`keyring`, `apple-native`), unter Windows die Anmeldeinformationsverwaltung
//! (`windows-native`). Auf anderen Zielen — die App wird dort nicht ausgeliefert — hält ein
//! `Speichertresor` das Token nur bis zum Beenden, mit einer Warnung beim Start.
//!
//! Tests fassen den echten Schlüsselbund nie an: Sie arbeiten mit dem `Speichertresor` des Kerns.
use einsatzbuch_kern::tresor::Tresor;

/// Dienstname der Einträge im Schlüsselbund, gleich dem `identifier` in `tauri.conf.json`.
pub const DIENST: &str = "dev.rubeen.iuksuite.einsatzbuch";

/// Der Tresor dieses Betriebssystems.
pub fn system_tresor() -> Box<dyn Tresor> {
    #[cfg(any(target_os = "macos", windows))]
    {
        Box::new(Schluesselbund)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        eprintln!(
            "Warnung: Auf diesem Betriebssystem gibt es keinen angebundenen Schlüsselbund. Das \
             Geräte-Token liegt nur im Speicher und ist nach dem Beenden weg."
        );
        Box::new(einsatzbuch_kern::tresor::Speichertresor::default())
    }
}

/// Der Schlüsselbund des Betriebssystems, je Konto (`tresor::konto_fuer`) ein Eintrag unter
/// `DIENST`.
#[cfg(any(target_os = "macos", windows))]
pub struct Schluesselbund;

#[cfg(any(target_os = "macos", windows))]
fn eintrag(konto: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(DIENST, konto).map_err(|e| format!("Der Schlüsselbund ist nicht erreichbar: {e}"))
}

#[cfg(any(target_os = "macos", windows))]
impl Tresor for Schluesselbund {
    fn lies(&self, konto: &str) -> Result<Option<String>, String> {
        match eintrag(konto)?.get_password() {
            Ok(wert) => Ok(Some(wert)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Das Geräte-Token ließ sich nicht aus dem Schlüsselbund lesen: {e}")),
        }
    }

    fn schreibe(&self, konto: &str, wert: &str) -> Result<(), String> {
        eintrag(konto)?
            .set_password(wert)
            .map_err(|e| format!("Das Geräte-Token ließ sich nicht im Schlüsselbund ablegen: {e}"))
    }

    fn loesche(&self, konto: &str) -> Result<(), String> {
        match eintrag(konto)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Das Geräte-Token ließ sich nicht aus dem Schlüsselbund löschen: {e}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Der Dienstname folgt dem App-Bezeichner; wer ihn ändert, verliert sonst still die
    /// gespeicherten Geräte-Tokens aller Rechner.
    #[test]
    fn dienst_ist_der_app_bezeichner() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json ist JSON");
        assert_eq!(conf["identifier"], DIENST);
    }
}
