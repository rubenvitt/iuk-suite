//! Drahtvertrag mit der Suite (Plan Stufe 5, Tabelle „Schnittstellen“) — Rust-Gegenstück zu
//! `src/app/m/einsatzbuch/_lib/anbindung/vertrag.ts`. Maßgeblich sind die zod-Schemas dort; die
//! Beispiele unter `vertrag/*.json` liest `tests/vertrag.rs` mit genau diesen Typen. Jeder Typ ist
//! `deny_unknown_fields` wie `.strict()` in zod: Ein Feld, das nur eine Seite kennt, fällt hier wie
//! dort auf, statt still verloren zu gehen. Kein `#[serde(flatten)]` — das hebelt
//! `deny_unknown_fields` aus.
//!
//! Typen mit einem Geheimnis (Code, Verifier, Sitzungs- und Geräte-Token, CEK) leiten `Debug`
//! nicht ab, sondern schwärzen es (`suite::GESCHWAERZT`): Ein `{:?}` im Log darf nichts preisgeben.
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::einrichtung::{Einrichtung, Stammdatenpaket};
use crate::format::{Blockkopf, Umgebung, Umschlag};
use crate::suite::GESCHWAERZT;

/// Anfrage an `POST /api/anmelden/tausch`.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TauschAnfrage {
    pub code: String,
    pub verifier: String,
}

/// Antwort von `POST /api/anmelden/tausch`. `rechner_id` und `einrichtung` sind im Vertrag
/// Pflichtfelder, die `null` sein dürfen — sie werden deshalb als `null` geschrieben, nie
/// weggelassen.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TauschAntwort {
    pub sitzungstoken: String,
    pub name: String,
    pub ablauf: String,
    pub rechner_id: Option<String>,
    pub einrichtung: Option<Einrichtungswunsch>,
}

/// Was die Anmeldeseite der Suite über die Einrichtung bestätigt hat (Entscheidung 1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Einrichtungswunsch {
    pub art: Umgebung,
    pub name: String,
    pub ersetzen: bool,
}

/// Anfrage an `POST /api/einrichten`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EinrichtenAnfrage {
    pub art: Umgebung,
    pub name: String,
}

/// Antwort von `POST /api/einrichten`.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EinrichtenAntwort {
    pub rechner_id: String,
    pub art: Umgebung,
    pub name: String,
    pub geraete_token: String,
    pub oeffentlich_spki: String,
    pub schluessel_id: String,
    pub paket: Stammdatenpaket,
    pub eingerichtet_am: String,
    pub eingerichtet_von: String,
}

impl EinrichtenAntwort {
    /// Die lokale Einrichtung, die `Buch::richte_ein` aus dieser Antwort festschreibt. Die
    /// Suite-Adresse kennt nur der Rechner selbst (sie steht nicht in der Antwort); Rechnerkennung,
    /// -name und Geräte-Token reicht die Aufruferin getrennt weiter.
    pub fn einrichtung(&self, suite_url: &str) -> Einrichtung {
        Einrichtung {
            umgebung: self.art,
            suite_url: suite_url.to_string(),
            oeffentlich_spki: self.oeffentlich_spki.clone(),
            schluessel_id: self.schluessel_id.clone(),
            paket: self.paket.clone(),
            eingerichtet_am: self.eingerichtet_am.clone(),
            eingerichtet_von: self.eingerichtet_von.clone(),
        }
    }
}

/// Anfrage an `POST /api/anker`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnkerAnfrage {
    pub block: u64,
    pub hash: String,
}

/// Antwort von `GET /api/anker` (Stufe 6, Entscheidung 5): der höchste Suite-Anker der Kette, zu
/// der der anfragende Rechner gehört, oder `null` ohne einen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KettenankerAntwort {
    pub anker: Option<Kettenanker>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Kettenanker {
    pub block: u64,
    pub hash: String,
}

/// Anfrage an `POST /api/sicherung`: der Zeitpunkt der letzten gelungenen Sicherung.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SicherungAnfrage {
    pub erstellt: String,
}

/// Ein Eintrag der Anfrage an `POST /api/schluessel/freigeben` — der Körper ist ein nacktes
/// Array dieser Einträge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Freigabeposten {
    pub kopf: Blockkopf,
    pub umschlag: Umschlag,
}

/// Ein Eintrag der Antwort von `POST /api/schluessel/freigeben` (nacktes Array): der
/// Inhaltsschlüssel eines Blocks in Base64.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schluesselposten {
    pub block: u64,
    pub cek: String,
}

/// Fehlerkörper jeder Schnittstelle: `{ error: { code, message } }`, dazu die optionalen
/// Zusatzfelder, die `fehlerKoerper` in `vertrag.ts` kennt (Plan Stufe 5, „Schnittstellen“):
/// `erwartet` bei `409 anker_abweichung`, `eingerichtetAm`/`eingerichtetVon` bei
/// `409 echt_vorhanden`, `feld`/`eintrag` bei `422 stammdaten_zu_lang`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fehlerkoerper {
    pub error: FehlerInhalt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub erwartet: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eingerichtet_am: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eingerichtet_von: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub feld: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eintrag: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FehlerInhalt {
    pub code: String,
    pub message: String,
}

impl fmt::Debug for TauschAnfrage {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TauschAnfrage").field("code", &GESCHWAERZT).field("verifier", &GESCHWAERZT).finish()
    }
}

impl fmt::Debug for TauschAntwort {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TauschAntwort")
            .field("sitzungstoken", &GESCHWAERZT)
            .field("name", &self.name)
            .field("ablauf", &self.ablauf)
            .field("rechner_id", &self.rechner_id)
            .field("einrichtung", &self.einrichtung)
            .finish()
    }
}

impl fmt::Debug for EinrichtenAntwort {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("EinrichtenAntwort")
            .field("rechner_id", &self.rechner_id)
            .field("art", &self.art)
            .field("name", &self.name)
            .field("geraete_token", &GESCHWAERZT)
            .field("oeffentlich_spki", &self.oeffentlich_spki)
            .field("schluessel_id", &self.schluessel_id)
            .field("paket", &self.paket)
            .field("eingerichtet_am", &self.eingerichtet_am)
            .field("eingerichtet_von", &self.eingerichtet_von)
            .finish()
    }
}

impl fmt::Debug for Schluesselposten {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Schluesselposten").field("block", &self.block).field("cek", &GESCHWAERZT).finish()
    }
}
