//! Das Datenformat des Einsatzbuchs (Spec §3) — Rust-Gegenstück zu
//! `src/app/m/einsatzbuch/_lib/kern/format.ts`. Feldreihenfolge und Schlüssel sind mit der
//! TS-Seite abgestimmt: Wer hier ein Feld ändert, ändert den Fingerabdruck jedes künftigen
//! Blocks. `deny_unknown_fields` auf den Deserialisierungstypen spiegelt `hatGenauSchluessel`
//! im TS-Kern — ein unbekannter Schlüssel ist dort wie hier ein Fehler, keine Toleranz.
use serde::{Deserialize, Serialize};

/// Vorgänger-Hash des ersten Blocks — 64 Nullen (SHA-256-Hex-Länge).
pub const GENESIS: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FahrzeugStand {
    pub id: String,
    pub typ: String,
    pub kennung: String,
    pub ruf: String,
    pub standort: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersonStand {
    pub id: String,
    pub name: String,
    pub quali: String,
    pub ov: String,
    pub fahrzeug_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Einsatz {
    pub v: u8,
    pub nummer: String,
    pub stichwort: String,
    pub beginn_datum: String,
    pub beginn_zeit: String,
    pub ende_datum: Option<String>,
    pub ende_zeit: Option<String>,
    pub strasse: String,
    pub ort: String,
    pub objekt: String,
    pub fahrzeuge: Vec<FahrzeugStand>,
    pub personal: Vec<PersonStand>,
    pub vor_ort: u32,
    pub transport: u32,
    pub notizen: String,
}

/// Test-Rechner versiegeln immer `Test` (Spec §12). Steht in Hash und AAD, lässt sich also
/// nicht still entfernen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Umgebung {
    Echt,
    Test,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Blockkopf {
    pub v: u8,
    pub block: u64,
    pub prev: String,
    pub versiegelt: String,
    pub schluessel_id: String,
    pub umgebung: Umgebung,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Umschlag {
    pub epk: String,
    pub iv: String,
    pub ct: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Block {
    pub kopf: Blockkopf,
    pub iv: String,
    pub daten: String,
    pub umschlag: Umschlag,
    pub hash: String,
}

impl Blockkopf {
    pub fn kanonisch(&self) -> String {
        crate::jcs::kanonisch(&serde_json::to_value(self).expect("Blockkopf ist serialisierbar"))
            .expect("Blockkopf trägt nur sichere Zahlen")
    }
}

impl Einsatz {
    pub fn kanonisch(&self) -> Result<String, crate::jcs::JcsFehler> {
        crate::jcs::kanonisch(&serde_json::to_value(self).expect("Einsatz ist serialisierbar"))
    }
}
