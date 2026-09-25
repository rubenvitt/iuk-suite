//! Suite-Protokoll (Plan Stufe 5, Tabelle „Schnittstellen“) hinter dem `Transport`-Trait: Der
//! Kern baut Anfragen und deutet Antworten, die Hülle bringt HTTP mit (Entscheidung 8). So
//! laufen alle Tests mit einem Fake, ohne Netz.
//!
//! 401 heißt je nach Schnittstelle Verschiedenes: Auf den Schnittstellen mit Geräte-Token
//! (Stammdaten, Anker) ist dieser Rechner widerrufen (`SuiteFehler::Widerrufen`); auf denen mit
//! Sitzungstoken (Einrichten, Freigeben, Rechner löschen) ist nur die Sitzung abgelaufen — das
//! bleibt ein gewöhnliches `Abgelehnt` mit dem Code der Suite (`sitzung_ungueltig`).
use std::collections::BTreeMap;
use std::sync::Mutex;

use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::anmeldung::{modul_url, prozent_kodiere};
use crate::buch::{Ankerabweichung, Buch, BuchFehler};
use crate::einrichtung::Stammdatenpaket;
use crate::format::{Block, Umgebung};
use crate::vertrag::{
    AnkerAnfrage, EinrichtenAnfrage, EinrichtenAntwort, Fehlerkoerper, Freigabeposten, Schluesselposten, TauschAnfrage,
    TauschAntwort,
};

/// Eine Anfrage an die Suite. `json` ist der fertige Körper; die Hülle setzt dazu
/// `Content-Type: application/json`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Anfrage<'a> {
    pub methode: &'static str,
    pub url: String,
    pub bearer: Option<&'a str>,
    pub if_none_match: Option<&'a str>,
    pub json: Option<String>,
}

/// Die Antwort der Suite: Status, `ETag` (unverändert, samt Anführungszeichen) und Körper.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Antwort {
    pub status: u16,
    pub etag: Option<String>,
    pub koerper: String,
}

pub trait Transport: Send + Sync {
    /// `Err` heißt: Die Suite war nicht erreichbar (kein Netz, Zeitüberschreitung, TLS). Jede
    /// HTTP-Antwort, auch 4xx und 5xx, ist `Ok`.
    fn sende(&self, a: Anfrage<'_>) -> Result<Antwort, String>;
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SuiteFehler {
    #[error("Die Suite ist nicht erreichbar: {0}")]
    NichtErreichbar(String),
    /// Die Suite hat mit einem Fehlerkörper abgelehnt; `meldung` ist ihr Text für Menschen.
    #[error("{meldung}")]
    Abgelehnt { status: u16, code: String, meldung: String },
    #[error("Dieser Rechner ist in der Suite widerrufen.")]
    Widerrufen,
    /// Die Antwort passt nicht zum Vertrag (unlesbarer Körper, falscher Status, fremde Werte).
    #[error("Unerwartete Antwort der Suite: {0}")]
    Antwort(String),
}

fn sende(t: &dyn Transport, a: Anfrage<'_>) -> Result<Antwort, SuiteFehler> {
    t.sende(a).map_err(SuiteFehler::NichtErreichbar)
}

fn als_json<T: Serialize + ?Sized>(wert: &T) -> String {
    serde_json::to_string(wert).expect("Vertragstypen sind serialisierbar")
}

fn lies_json<T: DeserializeOwned>(a: &Antwort) -> Result<T, SuiteFehler> {
    serde_json::from_str(&a.koerper).map_err(|e| SuiteFehler::Antwort(format!("Körper passt nicht zum Vertrag: {e}")))
}

/// Deutet eine Fehlerantwort. Ohne lesbaren Fehlerkörper — etwa eine HTML-Seite eines
/// vorgeschalteten Proxys bei 502 — wird daraus `Antwort` statt einer Panik.
fn abgelehnt(a: &Antwort) -> SuiteFehler {
    match serde_json::from_str::<Fehlerkoerper>(&a.koerper) {
        Ok(f) => SuiteFehler::Abgelehnt { status: a.status, code: f.error.code, meldung: f.error.message },
        Err(_) => SuiteFehler::Antwort(format!("HTTP {} ohne lesbaren Fehlerkörper", a.status)),
    }
}

/// `POST /api/anmelden/tausch`: löst den Einmalcode aus dem Rückruf mit dem PKCE-Verifier ein.
/// Bei der Verwaltungsanmeldung geht das Geräte-Token mit (Entscheidung 2), bei der Einrichtung
/// nicht.
pub fn tausche(
    t: &dyn Transport,
    suite: &str,
    code: &str,
    verifier: &str,
    geraet: Option<&str>,
) -> Result<TauschAntwort, SuiteFehler> {
    let koerper = TauschAnfrage { code: code.to_string(), verifier: verifier.to_string() };
    let a = sende(
        t,
        Anfrage {
            methode: "POST",
            url: modul_url(suite, "/api/anmelden/tausch"),
            bearer: geraet,
            if_none_match: None,
            json: Some(als_json(&koerper)),
        },
    )?;
    match a.status {
        200 => lies_json(&a),
        _ => Err(abgelehnt(&a)),
    }
}

/// `POST /api/einrichten` mit dem Sitzungstoken. Eine Antwort mit einer anderen Art als der
/// angefragten wird abgelehnt — sonst entstünde ein Buch der falschen Betriebsart.
pub fn richte_ein(
    t: &dyn Transport,
    suite: &str,
    sitzung: &str,
    art: Umgebung,
    name: &str,
) -> Result<EinrichtenAntwort, SuiteFehler> {
    let koerper = EinrichtenAnfrage { art, name: name.to_string() };
    let a = sende(
        t,
        Anfrage {
            methode: "POST",
            url: modul_url(suite, "/api/einrichten"),
            bearer: Some(sitzung),
            if_none_match: None,
            json: Some(als_json(&koerper)),
        },
    )?;
    if a.status != 200 {
        return Err(abgelehnt(&a));
    }
    let antwort: EinrichtenAntwort = lies_json(&a)?;
    if antwort.art != art {
        return Err(SuiteFehler::Antwort(format!(
            "eingerichtet als {:?}, angefragt war {art:?}",
            antwort.art
        )));
    }
    Ok(antwort)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StammdatenErgebnis {
    /// Neues Paket samt `ETag` für den nächsten Abruf.
    Neu { paket: Stammdatenpaket, etag: Option<String> },
    /// 304: Das Paket zum mitgeschickten `ETag` gilt weiter.
    Unveraendert,
}

/// `GET /api/stammdaten` mit dem Geräte-Token und dem letzten `ETag` (Entscheidung 7). Der
/// `ETag` geht Byte für Byte zurück, samt Anführungszeichen: Die Suite vergleicht exakt.
pub fn hole_stammdaten(
    t: &dyn Transport,
    suite: &str,
    geraet: &str,
    etag: Option<&str>,
) -> Result<StammdatenErgebnis, SuiteFehler> {
    let a = sende(
        t,
        Anfrage {
            methode: "GET",
            url: modul_url(suite, "/api/stammdaten"),
            bearer: Some(geraet),
            if_none_match: etag,
            json: None,
        },
    )?;
    match a.status {
        200 => Ok(StammdatenErgebnis::Neu { paket: lies_json(&a)?, etag: a.etag.clone() }),
        304 => Ok(StammdatenErgebnis::Unveraendert),
        401 => Err(SuiteFehler::Widerrufen),
        _ => Err(abgelehnt(&a)),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnkerErgebnis {
    /// Die Suite kennt die Kette bis zu diesem Block (0 bei leerer Kette).
    Bestaetigt(u64),
    /// Die Suite hält für einen Block einen anderen Hash (gespeichert, Lauf abgebrochen).
    Abweichung(Ankerabweichung),
    /// Die Suite war nicht erreichbar; der nächste Lauf meldet nach.
    Offline,
    /// Das Geräte-Token gilt nicht mehr (gespeichert).
    Widerrufen,
}

/// Führt `f` unter dem Lock auf dem Buch aus und gibt den Lock sofort wieder frei.
fn mit_buch<T>(buch: &Mutex<Option<Buch>>, f: impl FnOnce(&mut Buch) -> Result<T, BuchFehler>) -> Result<T, String> {
    let mut wache = buch.lock().map_err(|_| "Das Einsatzbuch ist nach einem Absturz gesperrt.".to_string())?;
    let offen = wache.as_mut().ok_or_else(|| "Das Einsatzbuch ist nicht geöffnet.".to_string())?;
    f(offen).map_err(|e| e.to_string())
}

/// Meldet alle unbestätigten Blöcke aufsteigend; hält das Buch nur zum Lesen und Schreiben, nie
/// während einer Anfrage.
///
/// 1. Unter dem Lock die offenen Anker lesen, dann den Lock freigeben.
/// 2. Je Block `POST /api/anker`: 204 wird unter dem Lock bestätigt; 409 speichert die
///    Abweichung und bricht ab; 401 speichert den Widerruf; ein Netzfehler ist `Offline`.
/// 3. War nichts offen, wird der letzte Block trotzdem erneut gemeldet — „Kette prüfen gegen den
///    Anker“: 204 bestätigt, 409 zeigt eine Abweichung.
///
/// Eine sonstige Ablehnung der Suite (400, 5xx) oder ein Datenbankfehler ist `Err` und lässt
/// den gespeicherten Stand, wie er ist.
pub fn gleiche_anker_ab(
    buch: &Mutex<Option<Buch>>,
    t: &dyn Transport,
    suite: &str,
    geraet: &str,
) -> Result<AnkerErgebnis, String> {
    let (offen, kopf) = mit_buch(buch, |b| Ok((b.unbestaetigte_anker()?, b.kettenkopf()?)))?;
    let arbeit = match (offen.is_empty(), kopf) {
        (false, _) => offen,
        (true, Some(letzter)) => vec![letzter],
        (true, None) => return Ok(AnkerErgebnis::Bestaetigt(0)),
    };

    for (block, hash) in arbeit {
        let koerper = AnkerAnfrage { block, hash: hash.clone() };
        let anfrage = Anfrage {
            methode: "POST",
            url: modul_url(suite, "/api/anker"),
            bearer: Some(geraet),
            if_none_match: None,
            json: Some(als_json(&koerper)),
        };
        let Ok(a) = t.sende(anfrage) else {
            return Ok(AnkerErgebnis::Offline);
        };
        match a.status {
            200 | 204 => mit_buch(buch, |b| b.anker_bestaetigt(block))?,
            401 => {
                mit_buch(buch, |b| b.widerrufen_setzen(true))?;
                return Ok(AnkerErgebnis::Widerrufen);
            }
            409 => {
                let erwartet = serde_json::from_str::<Fehlerkoerper>(&a.koerper)
                    .ok()
                    .and_then(|f| f.erwartet)
                    .ok_or_else(|| format!("Die Suite meldet für Block {block} eine Abweichung ohne erwarteten Hash."))?;
                let abweichung = Ankerabweichung { block, erwartet, gemeldet: hash };
                mit_buch(buch, |b| b.anker_abweichung_setzen(&abweichung))?;
                return Ok(AnkerErgebnis::Abweichung(abweichung));
            }
            _ => return Err(abgelehnt(&a).to_string()),
        }
    }
    let bis = mit_buch(buch, |b| Ok(b.anbindung()?.map_or(0, |a| a.anker_gemeldet_bis)))?;
    Ok(AnkerErgebnis::Bestaetigt(bis))
}

/// Höchstens so viele Einträge je Freigabe-Anfrage (Tabelle „Schnittstellen“, Nr. 7).
pub const PAKET: usize = 200;

/// `POST /api/schluessel/freigeben` mit dem Sitzungstoken, in Paketen zu `PAKET`. Es gibt kein
/// Teilergebnis: Lehnt die Suite ein Paket ab, gehen keine weiteren, und der Aufruf scheitert
/// ganz (Entscheidung 3). Ohne Blöcke geht keine Anfrage — die Suite verlangt mindestens einen.
pub fn gib_frei(
    t: &dyn Transport,
    suite: &str,
    sitzung: &str,
    bloecke: &[Block],
) -> Result<Vec<Schluesselposten>, SuiteFehler> {
    let mut alle = Vec::with_capacity(bloecke.len());
    for paket in bloecke.chunks(PAKET) {
        let posten: Vec<Freigabeposten> =
            paket.iter().map(|b| Freigabeposten { kopf: b.kopf.clone(), umschlag: b.umschlag.clone() }).collect();
        let a = sende(
            t,
            Anfrage {
                methode: "POST",
                url: modul_url(suite, "/api/schluessel/freigeben"),
                bearer: Some(sitzung),
                if_none_match: None,
                json: Some(als_json(&posten)),
            },
        )?;
        if a.status != 200 {
            return Err(abgelehnt(&a));
        }
        let schluessel: Vec<Schluesselposten> = lies_json(&a)?;
        if zaehle(schluessel.iter().map(|s| s.block)) != zaehle(paket.iter().map(|b| b.kopf.block)) {
            return Err(SuiteFehler::Antwort("die Freigabe nennt andere Blöcke als angefragt".into()));
        }
        alle.extend(schluessel);
    }
    Ok(alle)
}

/// Blocknummern mit ihrer Häufigkeit — Vergleich unabhängig von der Reihenfolge.
fn zaehle(bloecke: impl Iterator<Item = u64>) -> BTreeMap<u64, usize> {
    let mut zaehlung = BTreeMap::new();
    for block in bloecke {
        *zaehlung.entry(block).or_insert(0) += 1;
    }
    zaehlung
}

/// `DELETE /api/rechner/<id>` mit dem Sitzungstoken; die ID steht percent-kodiert im Pfad.
pub fn loesche_rechner(t: &dyn Transport, suite: &str, sitzung: &str, rechner_id: &str) -> Result<(), SuiteFehler> {
    let a = sende(
        t,
        Anfrage {
            methode: "DELETE",
            url: modul_url(suite, &format!("/api/rechner/{}", prozent_kodiere(rechner_id))),
            bearer: Some(sitzung),
            if_none_match: None,
            json: None,
        },
    )?;
    match a.status {
        200 | 204 => Ok(()),
        _ => Err(abgelehnt(&a)),
    }
}
