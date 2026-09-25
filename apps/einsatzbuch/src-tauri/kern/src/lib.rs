//! Kern des Einsatzbuchs am Rechner: Format, Kanonik, Kryptografie, lokale Datenbank,
//! Erfassung, Frist und Versiegeln, dazu Anmeldung und Protokoll der Suite-Anbindung (Stufe 5)
//! hinter den Traits `suite::Transport` und `tresor::Tresor`. Frei von Tauri und ohne Netz-Crate —
//! die Hülle liegt eine Ebene höher und bringt HTTP und Schlüsselbund mit.
pub mod anmeldung;
pub mod buch;
pub mod einrichtung;
#[cfg(debug_assertions)]
pub mod entwicklung;
pub mod erfassung;
pub mod format;
pub mod grenzen;
pub mod jcs;
pub mod kette;
pub mod krypto;
pub mod loopback;
pub mod sicherung;
pub mod suite;
pub mod tresor;
pub mod uhr;
pub mod versiegeln;
pub mod vertrag;
pub mod wiederherstellung;
