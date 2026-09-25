//! Tresor für das Geräte-Token (Entscheidung 8): Der Kern kennt nur den Trait; die Hülle bringt
//! den Schlüsselbund des Betriebssystems (macOS, Windows) mit. `Speichertresor` hält die Werte nur
//! im Speicher — für Tests und für Linux, wo die App nicht ausgeliefert wird. Fehler kommen als
//! deutscher Text, denn die Hülle reicht sie unverändert an die Oberfläche.
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

use crate::buch::Betrieb;

pub trait Tresor: Send + Sync {
    /// Liest den Wert eines Kontos; `None`, wenn es keinen gibt.
    fn lies(&self, konto: &str) -> Result<Option<String>, String>;
    /// Schreibt (oder ersetzt) den Wert eines Kontos.
    fn schreibe(&self, konto: &str, wert: &str) -> Result<(), String>;
    /// Löscht den Wert eines Kontos. Kein Fehler, wenn es keinen gab — das Aufräumen nach einer
    /// abgebrochenen Einrichtung darf ohne Vorbedingung laufen.
    fn loesche(&self, konto: &str) -> Result<(), String>;
}

#[derive(Default)]
pub struct Speichertresor(Mutex<HashMap<String, String>>);

impl Speichertresor {
    fn karte(&self) -> Result<MutexGuard<'_, HashMap<String, String>>, String> {
        self.0.lock().map_err(|_| "Der Speichertresor ist nach einem Absturz gesperrt.".to_string())
    }
}

impl Tresor for Speichertresor {
    fn lies(&self, konto: &str) -> Result<Option<String>, String> {
        Ok(self.karte()?.get(konto).cloned())
    }

    fn schreibe(&self, konto: &str, wert: &str) -> Result<(), String> {
        self.karte()?.insert(konto.to_string(), wert.to_string());
        Ok(())
    }

    fn loesche(&self, konto: &str) -> Result<(), String> {
        self.karte()?.remove(konto);
        Ok(())
    }
}

/// Konto des Geräte-Tokens je Betriebsart: Echt- und Testbetrieb halten getrennte Tokens, damit
/// das Beenden des Testbetriebs das echte nie berührt.
pub fn konto_fuer(betrieb: Betrieb) -> &'static str {
    match betrieb {
        Betrieb::Echt => "geraetetoken-echt",
        Betrieb::Test => "geraetetoken-test",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn speichertresor_schreibt_liest_und_loescht() {
        let t = Speichertresor::default();
        assert_eq!(t.lies("k").unwrap(), None);
        t.schreibe("k", "w1").unwrap();
        assert_eq!(t.lies("k").unwrap().as_deref(), Some("w1"));
        t.schreibe("k", "w2").unwrap();
        assert_eq!(t.lies("k").unwrap().as_deref(), Some("w2"));
        assert_eq!(t.lies("anderes").unwrap(), None);
        t.loesche("k").unwrap();
        assert_eq!(t.lies("k").unwrap(), None);
        // Löschen ohne Eintrag ist kein Fehler: Aufräumen nach einem Abbruch darf zweimal laufen.
        t.loesche("k").unwrap();
    }

    #[test]
    fn konto_je_betriebsart() {
        assert_eq!(konto_fuer(Betrieb::Echt), "geraetetoken-echt");
        assert_eq!(konto_fuer(Betrieb::Test), "geraetetoken-test");
    }

    #[test]
    fn tresor_ist_als_trait_objekt_teilbar() {
        fn teilbar<T: Send + Sync + ?Sized>(_: &T) {}
        let t: Box<dyn Tresor> = Box::new(Speichertresor::default());
        teilbar(&*t);
    }
}
