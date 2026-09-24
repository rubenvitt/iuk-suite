//! Erfassung eines Einsatzes: der Formularstand vor dem Absenden (`entwurf`) und das Absenden
//! selbst, das gegen die Stammdaten prüft und den Stand als „ausstehend" hinterlegt (Spec §4.3).
//! Versiegeln und die Frist-Prüfung stehen in `versiegeln.rs`.
use chrono::{DateTime, Utc};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::buch::{Buch, BuchFehler};
use crate::einrichtung::Stammdatenpaket;
use crate::format::{FahrzeugStand, PersonStand};
use crate::krypto::KryptoFehler;

/// Eine gewählte Person: ihre Stammdaten-ID und, sofern die Einrichtung `besatzung` führt, das
/// gewählte Fahrzeug. Ist `besatzung` aus, normalisiert `pruefe_entwurf` jede `fahrzeug_id` zu
/// `None`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonAuswahl {
    pub id: String,
    pub fahrzeug_id: Option<String>,
}

/// Formularstand der Oberfläche — vor der Auflösung gegen die Stammdaten. `ende_datum`/
/// `ende_zeit` leer heißt „noch offen".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entwurf {
    pub stichwort: String,
    pub beginn_datum: String,
    pub beginn_zeit: String,
    pub ende_datum: String,
    pub ende_zeit: String,
    pub strasse: String,
    pub ort: String,
    pub objekt: String,
    pub fahrzeuge: Vec<String>,
    pub personal: Vec<PersonAuswahl>,
    pub vor_ort: u32,
    pub transport: u32,
    pub notizen: String,
}

/// Der zuletzt abgesendete Einsatz, solange die Frist läuft.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ausstehend {
    pub entwurf: Entwurf,
    pub abgesendet_am: String,
    pub frist_bis: String,
    pub frist_bis_ms: i64,
}

/// Ergebnis eines Versiegelns — das, was die Oberfläche danach anzeigt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Versiegelung {
    pub block: u64,
    pub hash: String,
    pub prev: String,
    pub versiegelt: String,
    pub nummer: String,
    pub verfallen: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ErfassungFehler {
    #[error("dieses Buch ist noch nicht eingerichtet")]
    NichtEingerichtet,
    #[error("Pflichtfelder fehlen: {0:?}")]
    Fehlt(Vec<&'static str>),
    #[error("Eingabe ungültig: {0}")]
    Ungueltig(String),
    #[error(transparent)]
    Buch(#[from] BuchFehler),
    /// Eigene Variante statt `Buch(BuchFehler::UngueltigerSchluessel(..))`: Letztere behauptet
    /// „Schlüssel der Einrichtung ungültig", während ein `KryptoFehler` beim Versiegeln eines
    /// einzelnen Blocks entsteht (z. B. eine nicht mehr passende `schluesselId`) und nichts über
    /// die Einrichtung selbst aussagt.
    #[error(transparent)]
    Krypto(#[from] KryptoFehler),
}

/// `rusqlite::Error` und `serde_json::Error` erreichen `ErfassungFehler` immer über
/// `BuchFehler` — so bleibt es bei genau einer Übersetzung eines Datenbank- bzw.
/// JSON-Fehlers in diesem Modul, statt zwei parallelen `#[from]`-Pfaden.
impl From<rusqlite::Error> for ErfassungFehler {
    fn from(e: rusqlite::Error) -> Self {
        ErfassungFehler::Buch(BuchFehler::from(e))
    }
}

impl From<serde_json::Error> for ErfassungFehler {
    fn from(e: serde_json::Error) -> Self {
        ErfassungFehler::Buch(BuchFehler::from(e))
    }
}

/// Stammdaten-Ausschnitt zum Zeitpunkt des Absendens, gespeichert unter `ausstehend.schnappschuss`
/// — die Rückfallebene für `versiegele_ausstehend` (in `versiegeln.rs`), falls eine gewählte ID
/// bis zum Versiegeln aus den aktuellen Stammdaten verschwunden ist.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Schnappschuss {
    pub fahrzeuge: Vec<FahrzeugStand>,
    pub personal: Vec<PersonStand>,
}

fn ist_datumsform(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn ist_zeitform(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 5 && b[2] == b':' && b.iter().enumerate().all(|(i, c)| i == 2 || c.is_ascii_digit())
}

/// Prüft `JJJJ-MM-TT` auf Form und gültigen Kalendertag. `NaiveDate::parse_from_str` lehnt einen
/// Tag wie den 31. Februar mit einem Fehler ab, statt ihn wie `Date.UTC` in den nächsten Monat
/// zu rollen — anders als die Rundlauf-Prüfung im TS-Kern (`zeit.ts`) braucht Rust dafür keinen
/// eigenen Vergleich.
fn pruefe_datum(s: &str) -> Result<(), ErfassungFehler> {
    if !ist_datumsform(s) {
        return Err(ErfassungFehler::Ungueltig(format!("kein Datum im Format JJJJ-MM-TT: {s}")));
    }
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|_| ErfassungFehler::Ungueltig(format!("kein gültiger Kalendertag: {s}")))?;
    Ok(())
}

/// Prüft `HH:MM` auf Form und den Bereich 00:00–23:59 (z. B. lehnt sie `24:00` ab).
fn pruefe_zeit(s: &str) -> Result<(), ErfassungFehler> {
    if !ist_zeitform(s) {
        return Err(ErfassungFehler::Ungueltig(format!("keine Uhrzeit im Format HH:MM: {s}")));
    }
    let stunde: u32 = s[0..2].parse().expect("Form oben geprüft");
    let minute: u32 = s[3..5].parse().expect("Form oben geprüft");
    if stunde > 23 || minute > 59 {
        return Err(ErfassungFehler::Ungueltig(format!("keine gültige Uhrzeit: {s}")));
    }
    Ok(())
}

/// Prüft einen Entwurf gegen die Stammdaten und liefert die normalisierte Fassung (getrimmt,
/// `ende_*` konsistent leer oder gültig, `fahrzeugId` gelöscht wenn `besatzung` aus ist) samt dem
/// Schnappschuss der dabei aufgelösten Fahrzeuge und Personen.
pub(crate) fn pruefe_entwurf(e: &Entwurf, paket: &Stammdatenpaket) -> Result<(Entwurf, Schnappschuss), ErfassungFehler> {
    let stichwort = e.stichwort.trim().to_string();
    let beginn_datum = e.beginn_datum.trim().to_string();
    let beginn_zeit = e.beginn_zeit.trim().to_string();
    let strasse = e.strasse.trim().to_string();
    let ort = e.ort.trim().to_string();
    let ende_datum = e.ende_datum.trim().to_string();
    let ende_zeit = e.ende_zeit.trim().to_string();

    // `stichwort` wird nur auf „nicht leer" geprüft, nicht gegen `paket.stammdaten.stichworte`:
    // Die Stammdaten-Stichworte sind Vorschläge für die Oberfläche, keine abschließende Liste —
    // genau wie im TS-Kern, der dieselbe Prüfung ebenfalls nicht kennt. Ein Versiegeln darf nie an
    // inzwischen geänderten oder gelöschten Stammdaten scheitern (siehe `loese_schnappschuss` in
    // `versiegeln.rs`), also erst recht nicht am Wortlaut eines freien Textfelds.
    let mut fehlt = Vec::new();
    if stichwort.is_empty() {
        fehlt.push("Alarmstichwort");
    }
    if beginn_datum.is_empty() || beginn_zeit.is_empty() {
        fehlt.push("Beginn");
    }
    if strasse.is_empty() && ort.is_empty() {
        fehlt.push("Einsatzort");
    }
    if !fehlt.is_empty() {
        return Err(ErfassungFehler::Fehlt(fehlt));
    }

    pruefe_datum(&beginn_datum)?;
    pruefe_zeit(&beginn_zeit)?;
    match (ende_datum.is_empty(), ende_zeit.is_empty()) {
        (true, true) => {}
        (false, false) => {
            pruefe_datum(&ende_datum)?;
            pruefe_zeit(&ende_zeit)?;
        }
        _ => return Err(ErfassungFehler::Ungueltig("Ende braucht Datum und Uhrzeit zusammen oder keins von beiden".into())),
    }
    if e.vor_ort > 999 {
        return Err(ErfassungFehler::Ungueltig(format!("vor Ort muss höchstens 999 sein, war {}", e.vor_ort)));
    }
    if e.transport > 999 {
        return Err(ErfassungFehler::Ungueltig(format!("Transport muss höchstens 999 sein, war {}", e.transport)));
    }

    let mut gesehene_fahrzeuge = std::collections::HashSet::new();
    for id in &e.fahrzeuge {
        if !gesehene_fahrzeuge.insert(id.as_str()) {
            return Err(ErfassungFehler::Ungueltig(format!("Fahrzeug {id} ist mehrfach gewählt")));
        }
        if !paket.stammdaten.fahrzeuge.iter().any(|f| &f.id == id) {
            return Err(ErfassungFehler::Ungueltig(format!("unbekanntes Fahrzeug: {id}")));
        }
    }

    let mut gesehene_personen = std::collections::HashSet::new();
    for p in &e.personal {
        if !gesehene_personen.insert(p.id.as_str()) {
            return Err(ErfassungFehler::Ungueltig(format!("Person {} ist mehrfach gewählt", p.id)));
        }
        if !paket.stammdaten.personal.iter().any(|s| s.id == p.id) {
            return Err(ErfassungFehler::Ungueltig(format!("unbekannte Person: {}", p.id)));
        }
        if paket.besatzung {
            if let Some(fahrzeug_id) = &p.fahrzeug_id {
                if !e.fahrzeuge.contains(fahrzeug_id) {
                    return Err(ErfassungFehler::Ungueltig(format!(
                        "Fahrzeug {fahrzeug_id} von Person {} ist nicht unter den gewählten Fahrzeugen",
                        p.id
                    )));
                }
            }
        }
    }

    let personal: Vec<PersonAuswahl> = e
        .personal
        .iter()
        .map(|p| PersonAuswahl { id: p.id.clone(), fahrzeug_id: if paket.besatzung { p.fahrzeug_id.clone() } else { None } })
        .collect();

    let normalisiert = Entwurf {
        stichwort,
        beginn_datum,
        beginn_zeit,
        ende_datum,
        ende_zeit,
        strasse,
        ort,
        objekt: e.objekt.trim().to_string(),
        fahrzeuge: e.fahrzeuge.clone(),
        personal,
        vor_ort: e.vor_ort,
        transport: e.transport,
        notizen: e.notizen.clone(),
    };

    let schnappschuss = Schnappschuss {
        fahrzeuge: normalisiert
            .fahrzeuge
            .iter()
            .map(|id| paket.stammdaten.fahrzeuge.iter().find(|f| &f.id == id).expect("oben geprüft"))
            .map(|f| FahrzeugStand { id: f.id.clone(), typ: f.typ.clone(), kennung: f.kennung.clone(), ruf: f.ruf.clone(), standort: f.standort.clone() })
            .collect(),
        personal: normalisiert
            .personal
            .iter()
            .map(|auswahl| {
                let p = paket.stammdaten.personal.iter().find(|s| s.id == auswahl.id).expect("oben geprüft");
                PersonStand { id: p.id.clone(), name: p.name.clone(), quali: p.quali.clone(), ov: p.ov.clone(), fahrzeug_id: auswahl.fahrzeug_id.clone() }
            })
            .collect(),
    };

    Ok((normalisiert, schnappschuss))
}

/// Formatiert einen Zeitpunkt in der gegebenen Zone wie `versiegelt` (Spec §3):
/// `%Y-%m-%dT%H:%M:%S%:z`. Gemeinsam für `versiegelt` (in `versiegeln.rs`), `frist_bis` und
/// `abgesendet_am`, damit jeder Zeitpunkt, den dieses Crate nach außen gibt, dieselbe
/// Schreibweise trägt.
pub(crate) fn formatiere_zeitpunkt(zeitpunkt: DateTime<Utc>, zeitzone: &str) -> String {
    let tz: chrono_tz::Tz = zeitzone.parse().expect("Zeitzone wurde bei der Einrichtung geprüft");
    zeitpunkt.with_timezone(&tz).format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

impl Buch {
    /// Der zwischengespeicherte Formularstand vor dem Absenden, sofern einer vorliegt.
    pub fn entwurf(&self) -> Result<Option<Entwurf>, ErfassungFehler> {
        let json: Option<String> = self.conn().query_row("SELECT json FROM entwurf WHERE id = 1", [], |r| r.get(0)).optional()?;
        Ok(match json {
            Some(json) => Some(serde_json::from_str(&json)?),
            None => None,
        })
    }

    /// Speichert den Formularstand, ohne ihn zu prüfen — er ist noch nicht abgesendet.
    pub fn speichere_entwurf(&mut self, e: &Entwurf, jetzt: DateTime<Utc>) -> Result<(), ErfassungFehler> {
        let json = serde_json::to_string(e)?;
        self.conn().execute(
            "INSERT INTO entwurf (id, json, geaendert_am) VALUES (1, ?1, ?2) \
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, geaendert_am = excluded.geaendert_am",
            params![json, jetzt.to_rfc3339()],
        )?;
        Ok(())
    }

    /// Verwirft den Formularstand. Ohne einen vorhandenen Entwurf ist das ein No-op.
    pub fn verwerfe_entwurf(&mut self) -> Result<(), ErfassungFehler> {
        self.conn().execute("DELETE FROM entwurf", [])?;
        Ok(())
    }

    /// Der zuletzt abgesendete Einsatz, solange die Frist läuft — `None` ohne ausstehenden
    /// Einsatz.
    pub fn ausstehend(&self) -> Result<Option<Ausstehend>, ErfassungFehler> {
        let zeile: Option<(String, String, i64)> = self
            .conn()
            .query_row("SELECT json, abgesendet_am, frist_bis_ms FROM ausstehend WHERE id = 1", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .optional()?;
        let Some((json, abgesendet_am, frist_bis_ms)) = zeile else { return Ok(None) };
        let entwurf: Entwurf = serde_json::from_str(&json)?;
        let zeitzone = self.einrichtung()?.map(|e| e.paket.zeitzone).unwrap_or_else(|| "UTC".to_string());
        let zeitpunkt = DateTime::<Utc>::from_timestamp_millis(frist_bis_ms).expect("frist_bis_ms liegt im gültigen Bereich");
        let frist_bis = formatiere_zeitpunkt(zeitpunkt, &zeitzone);
        Ok(Some(Ausstehend { entwurf, abgesendet_am, frist_bis, frist_bis_ms }))
    }

    /// Prüft den Entwurf, hinterlegt ihn als ausstehend und löscht den Formularstand — beides in
    /// einer Transaktion (`self.transaktion()`), damit nie ein `entwurf` verschwindet, ohne dass
    /// `ausstehend` den Stand übernommen hat, und umgekehrt. Die erste Absendung setzt
    /// `frist_bis_ms = jetzt + frist_minuten`; jede weitere überschreibt nur Inhalt und
    /// Schnappschuss, nie die schon gesetzte Frist oder `abgesendet_am` — das erledigt
    /// `ON CONFLICT … DO UPDATE`, indem es beide Spalten aus dem `SET` ausspart.
    pub fn sende_ab(&mut self, e: &Entwurf, jetzt: DateTime<Utc>) -> Result<Ausstehend, ErfassungFehler> {
        let einrichtung = self.einrichtung()?.ok_or(ErfassungFehler::NichtEingerichtet)?;
        let (normalisiert, schnappschuss) = pruefe_entwurf(e, &einrichtung.paket)?;

        let entwurf_json = serde_json::to_string(&normalisiert)?;
        let schnappschuss_json = serde_json::to_string(&schnappschuss)?;
        let neue_frist_bis_ms = jetzt.timestamp_millis() + i64::from(einrichtung.paket.frist_minuten) * 60_000;
        let neu_abgesendet_am = formatiere_zeitpunkt(jetzt, &einrichtung.paket.zeitzone);

        let tx = self.transaktion()?;
        let (abgesendet_am, frist_bis_ms): (String, i64) = tx.query_row(
            "INSERT INTO ausstehend (id, json, schnappschuss, abgesendet_am, frist_bis_ms) \
             VALUES (1, ?1, ?2, ?3, ?4) \
             ON CONFLICT(id) DO UPDATE SET json = excluded.json, schnappschuss = excluded.schnappschuss \
             RETURNING abgesendet_am, frist_bis_ms",
            params![entwurf_json, schnappschuss_json, neu_abgesendet_am, neue_frist_bis_ms],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        tx.execute("DELETE FROM entwurf", [])?;
        tx.commit()?;

        let zeitpunkt = DateTime::<Utc>::from_timestamp_millis(frist_bis_ms).expect("frist_bis_ms liegt im gültigen Bereich");
        let frist_bis = formatiere_zeitpunkt(zeitpunkt, &einrichtung.paket.zeitzone);
        Ok(Ausstehend { entwurf: normalisiert, abgesendet_am, frist_bis, frist_bis_ms })
    }
}
