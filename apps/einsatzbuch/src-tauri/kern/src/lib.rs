//! Kern des Einsatzbuchs am Rechner: Format, Kanonik, Kryptografie, lokale Datenbank,
//! Erfassung, Frist und Versiegeln. Frei von Tauri — die Hülle liegt eine Ebene höher.
pub mod buch;
pub mod einrichtung;
pub mod erfassung;
pub mod format;
pub mod jcs;
pub mod krypto;
pub mod uhr;
pub mod versiegeln;
