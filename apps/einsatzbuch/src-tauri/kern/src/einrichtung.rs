//! Stammdaten und Einrichtung des Rechners (Spec §4.2, §12). `Einrichtung` ist die lokale Form
//! der Suite-Antwort auf `POST einrichten` (Drahtform: `vertrag::EinrichtenAntwort`, deren
//! Methode `einrichtung` sie baut), die der Rechner an `Buch::richte_ein` reicht. `Stammdatenpaket` ist ihr wiederkehrender Teil — derselbe Typ
//! kommt bei jedem späteren Stammdatenabgleich über `Buch::uebernehme_stammdaten` zurück.
//! Beide serialisieren camelCase, wie der geteilte TS-Kern (`src/app/m/einsatzbuch/_lib/kern`).
//! Das Paket und seine Teile sind `deny_unknown_fields`, denn sie kommen unverändert über den
//! Draht (`vertrag.rs`) — wie `.strict()` in `stammdatenpaketSchema` auf der Suite-Seite.
use serde::{Deserialize, Serialize};

use crate::format::Umgebung;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fahrzeug {
    pub id: String,
    pub typ: String,
    pub kennung: String,
    pub ruf: String,
    pub standort: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Person {
    pub id: String,
    pub name: String,
    pub quali: String,
    pub ov: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stichwortgruppe {
    pub name: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stammdaten {
    pub fahrzeuge: Vec<Fahrzeug>,
    pub personal: Vec<Person>,
    pub stichworte: Vec<Stichwortgruppe>,
}

/// Der bei jedem Stammdatenabgleich wiederkehrende Teil der Einrichtung. `version` ist die
/// Fassung der Suite-Stammdaten (steigt bei jeder Änderung dort), nicht die Schemaversion der
/// lokalen Datenbank.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stammdatenpaket {
    pub version: i64,
    pub stammdaten: Stammdaten,
    pub frist_minuten: u32,
    pub besatzung: bool,
    pub zeitzone: String,
    pub bereitschaft: String,
}

/// Antwort von `POST einrichten` gegen die Suite. `Buch::richte_ein` prüft sie und schreibt
/// sie einmalig fest (siehe dort); ein Schlüsselwechsel gehört nicht zu v2.0.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Einrichtung {
    pub umgebung: Umgebung,
    pub suite_url: String,
    pub oeffentlich_spki: String,
    pub schluessel_id: String,
    pub paket: Stammdatenpaket,
    pub eingerichtet_am: String,
    pub eingerichtet_von: String,
}
