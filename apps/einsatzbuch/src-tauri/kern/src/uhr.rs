//! Uhrabstraktion des Kerns. Frist- und Versiegelungslogik lesen die Zeit nie direkt von
//! `chrono::Utc::now()`, sondern über dieses Trait — Tests laufen so deterministisch gegen
//! eine feste Zeit (`tests/hilfe/mod.rs`, `FesteUhr`), statt die Systemzeit im Testlauf zu
//! spiegeln oder Fristen künstlich zu verkürzen.
use chrono::{DateTime, Utc};

/// Eine Uhrquelle. `Send + Sync`, weil der geteilte Rechnerzustand sie über Thread-Grenzen
/// hinweg hält (Tauri-Kommandos und der Polling-Hintergrundlauf der Frist-Prüfung greifen
/// beide darauf zu).
pub trait Uhr: Send + Sync {
    fn jetzt(&self) -> DateTime<Utc>;
}

/// Die im Betrieb tatsächlich benutzte Uhr — echte Systemzeit.
pub struct SystemUhr;

impl Uhr for SystemUhr {
    fn jetzt(&self) -> DateTime<Utc> {
        Utc::now()
    }
}
