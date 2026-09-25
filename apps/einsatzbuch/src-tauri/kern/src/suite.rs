//! Suite-Protokoll (Plan Stufe 5, Tabelle „Schnittstellen“) hinter dem `Transport`-Trait: Der
//! Kern baut Anfragen und deutet Antworten, die Hülle bringt HTTP mit (Entscheidung 8). So
//! laufen alle Tests mit einem Fake, ohne Netz.
//!
//! 401 heißt je nach Schnittstelle Verschiedenes: Auf den Schnittstellen mit Geräte-Token
//! (Stammdaten, Anker) ist dieser Rechner widerrufen (`SuiteFehler::Widerrufen`); auf denen mit
//! Sitzungstoken (Einrichten, Freigeben, Rechner löschen) ist nur die Sitzung abgelaufen — das
//! bleibt ein gewöhnliches `Abgelehnt` mit dem Code der Suite (`sitzung_ungueltig`).
use std::collections::BTreeMap;
use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use zeroize::Zeroizing;
use serde::de::DeserializeOwned;

use crate::anmeldung::{modul_url, prozent_kodiere};
use crate::buch::{Ankerabweichung, Buch, BuchFehler};
use crate::einrichtung::Stammdatenpaket;
use crate::format::{Block, Umgebung};
use crate::vertrag::{
    AnkerAnfrage, EinrichtenAnfrage, EinrichtenAntwort, Fehlerkoerper, Freigabeposten, KettenankerAntwort,
    Schluesselposten, SicherungAnfrage, TauschAnfrage, TauschAntwort,
};

/// Eine Anfrage an die Suite. `json` ist der fertige Körper; die Hülle setzt dazu
/// `Content-Type: application/json`. `Debug` schwärzt Token und Körper (darin stehen Code und
/// Verifier des Tauschs), damit ein `{:?}` im Log nichts preisgibt.
#[derive(Clone, PartialEq, Eq)]
pub struct Anfrage<'a> {
    pub methode: &'static str,
    pub url: String,
    pub bearer: Option<&'a str>,
    pub if_none_match: Option<&'a str>,
    pub json: Option<String>,
}

/// Die Antwort der Suite: Status, `ETag` (unverändert, samt Anführungszeichen) und Körper.
/// `Debug` nennt vom Körper nur die Länge: Er trägt Sitzungs- und Geräte-Token oder CEKs.
#[derive(Clone, PartialEq, Eq)]
pub struct Antwort {
    pub status: u16,
    pub etag: Option<String>,
    pub koerper: String,
}

/// Platzhalter für ein geschwärztes Geheimnis im `Debug`-Text.
pub const GESCHWAERZT: &str = "…";

/// `Some("…")` bzw. `None` — ob ein Geheimnis da ist, bleibt sichtbar, sein Wert nicht.
fn geschwaerzt<T>(wert: &Option<T>) -> Option<&'static str> {
    wert.as_ref().map(|_| GESCHWAERZT)
}

impl std::fmt::Debug for Anfrage<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Anfrage")
            .field("methode", &self.methode)
            .field("url", &self.url)
            .field("bearer", &geschwaerzt(&self.bearer))
            .field("if_none_match", &self.if_none_match)
            .field("json", &self.json.as_ref().map(|j| format!("{GESCHWAERZT} ({} Bytes)", j.len())))
            .finish()
    }
}

impl std::fmt::Debug for Antwort {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Antwort")
            .field("status", &self.status)
            .field("etag", &self.etag)
            .field("koerper", &format!("{GESCHWAERZT} ({} Bytes)", self.koerper.len()))
            .finish()
    }
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

/// Wie `abgelehnt`, aber ein 5xx ohne lesbaren Fehlerkörper ist „nicht erreichbar“: Hinter einem
/// Proxy ist das der Normalfall für „die Suite läuft nicht“ (Review Focus 4). Ein 5xx der Suite
/// selbst (etwa `503 kek_fehlt`) trägt einen Fehlerkörper und behält seine Meldung.
fn abgelehnt_oder_offline(a: &Antwort) -> SuiteFehler {
    match abgelehnt(a) {
        SuiteFehler::Antwort(_) if (500..=599).contains(&a.status) => SuiteFehler::NichtErreichbar(format!("HTTP {}", a.status)),
        sonst => sonst,
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
/// `ETag` geht Byte für Byte zurück, samt Anführungszeichen: Die Suite vergleicht exakt. Ein
/// 5xx (etwa 502/503/504 eines vorgeschalteten Proxys) heißt „nicht erreichbar“, wie ein
/// Netzfehler: Der Rechner behält seine Kopie und fragt beim nächsten Abgleich wieder.
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
        500..=599 => Err(SuiteFehler::NichtErreichbar(format!("HTTP {}", a.status))),
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
    /// Während des Laufs wurde der Rechner neu eingerichtet (neue `rechner_id`). Die Antworten
    /// galten dem alten Rechner und werden verworfen; der nächste Lauf meldet für den neuen.
    Ueberholt,
}

/// Führt `f` unter dem Lock auf dem Buch aus und gibt den Lock sofort wieder frei. Ein
/// vergifteter Mutex (Panik eines anderen Threads unter dem Lock) wird übernommen wie in der
/// Hülle (`zustand.rs`): Die Datenbank sichert sich über ihre Transaktionen selbst, und ein
/// Abgleich, der bis zum Neustart scheitert, wäre schlimmer.
fn mit_buch<T>(buch: &Mutex<Option<Buch>>, f: impl FnOnce(&mut Buch) -> Result<T, BuchFehler>) -> Result<T, String> {
    let mut wache = buch.lock().unwrap_or_else(PoisonError::into_inner);
    let offen = wache.as_mut().ok_or_else(|| "Das Einsatzbuch ist nicht geöffnet.".to_string())?;
    f(offen).map_err(|e| e.to_string())
}

/// Meldet alle unbestätigten Blöcke aufsteigend; hält das Buch nur zum Lesen und Schreiben, nie
/// während einer Anfrage.
///
/// 1. Unter dem Lock die offenen Anker und die `rechner_id` lesen, dann den Lock freigeben.
/// 2. Je Block `POST /api/anker`: 204 wird unter dem Lock bestätigt, mit `gemeldet_am` als
///    Zeitpunkt (`Buch::anker_bestaetigt`, die Zone wählt die Aufruferin); 409 speichert die
///    Abweichung und bricht ab; 401 speichert den Widerruf; ein Netzfehler oder ein 5xx (Proxy
///    vor einer nicht laufenden Suite) ist `Offline`.
/// 3. War nichts offen, wird der letzte Block trotzdem erneut gemeldet — „Kette prüfen gegen den
///    Anker“: 204 bestätigt, 409 zeigt eine Abweichung.
///
/// Jeder Schreibschritt prüft unter demselben Lock, dass die `rechner_id` noch die aus Schritt 1
/// ist. Hat „Neu einrichten“ sie zwischen zwei Anfragen gewechselt, galt die Antwort dem alten
/// Rechner: Sie wird verworfen, der Lauf endet mit `Ueberholt`, und der neue Rechner bekommt
/// weder eine fremde Bestätigung noch einen fremden Widerruf.
///
/// Eine sonstige Ablehnung der Suite (etwa 400) oder ein Datenbankfehler ist `Err` und lässt
/// den gespeicherten Stand, wie er ist.
pub fn gleiche_anker_ab(
    buch: &Mutex<Option<Buch>>,
    t: &dyn Transport,
    suite: &str,
    geraet: &str,
    gemeldet_am: &str,
) -> Result<AnkerErgebnis, String> {
    let (offen, kopf, rechner) =
        mit_buch(buch, |b| Ok((b.unbestaetigte_anker()?, b.kettenkopf()?, rechner_id(b)?)))?;
    // Schreibt nur, solange derselbe Rechner eingerichtet ist; `false` heißt „überholt“.
    let schreibe = |f: &dyn Fn(&mut Buch) -> Result<(), BuchFehler>| {
        mit_buch(buch, |b| {
            if rechner_id(b)? != rechner {
                return Ok(false);
            }
            f(b)?;
            Ok(true)
        })
    };
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
            200 | 204 => {
                if !schreibe(&|b| b.anker_bestaetigt(block, gemeldet_am))? {
                    return Ok(AnkerErgebnis::Ueberholt);
                }
            }
            401 => {
                if !schreibe(&|b| b.widerrufen_setzen(true))? {
                    return Ok(AnkerErgebnis::Ueberholt);
                }
                return Ok(AnkerErgebnis::Widerrufen);
            }
            409 => {
                let erwartet = serde_json::from_str::<Fehlerkoerper>(&a.koerper)
                    .ok()
                    .and_then(|f| f.erwartet)
                    .ok_or_else(|| format!("Die Suite meldet für Block {block} eine Abweichung ohne erwarteten Hash."))?;
                let abweichung = Ankerabweichung { block, erwartet, gemeldet: hash };
                if !schreibe(&|b| b.anker_abweichung_setzen(&abweichung))? {
                    return Ok(AnkerErgebnis::Ueberholt);
                }
                return Ok(AnkerErgebnis::Abweichung(abweichung));
            }
            500..=599 => return Ok(AnkerErgebnis::Offline),
            _ => return Err(abgelehnt(&a).to_string()),
        }
    }
    let bis = mit_buch(buch, |b| Ok(b.anbindung()?.map_or(0, |a| a.anker_gemeldet_bis)))?;
    Ok(AnkerErgebnis::Bestaetigt(bis))
}

/// Die `rechner_id` der Einrichtung; `None` ohne Einrichtung.
fn rechner_id(b: &Buch) -> Result<Option<String>, BuchFehler> {
    Ok(b.anbindung()?.map(|a| a.rechner_id))
}

/// `GET /api/anker` mit dem Geräte-Token (Stufe 6, Entscheidung 5): der höchste Suite-Anker der
/// Kette, zu der dieser Rechner gehört — `None` bei einer leeren Kette. Anders als
/// `gleiche_anker_ab` prüft das nicht gegen eine Meldung, sondern liest den Stand für die
/// Wiederherstellung. 401 heißt Widerrufen wie bei den anderen Geräte-Schnittstellen; eine
/// mehrdeutige Kette der Suite (`409 anker_mehrdeutig`) und ein 5xx ohne lesbaren Fehlerkörper
/// laufen über `abgelehnt_oder_offline` wie bei `gib_frei`.
pub fn hole_kettenanker(t: &dyn Transport, suite: &str, geraet: &str) -> Result<Option<(u64, String)>, SuiteFehler> {
    let a = sende(
        t,
        Anfrage {
            methode: "GET",
            url: modul_url(suite, "/api/anker"),
            bearer: Some(geraet),
            if_none_match: None,
            json: None,
        },
    )?;
    match a.status {
        200 => {
            let antwort: KettenankerAntwort = lies_json(&a)?;
            Ok(antwort.anker.map(|k| (k.block, k.hash)))
        }
        401 => Err(SuiteFehler::Widerrufen),
        _ => Err(abgelehnt_oder_offline(&a)),
    }
}

/// Höchstens so viele Einträge je Freigabe-Anfrage (Tabelle „Schnittstellen“, Nr. 7).
pub const PAKET: usize = 200;

/// `POST /api/schluessel/freigeben` mit dem Sitzungstoken, in Paketen zu `PAKET`. Es gibt kein
/// Teilergebnis: Lehnt die Suite ein Paket ab, gehen keine weiteren, und der Aufruf scheitert
/// ganz (Entscheidung 3). Ohne Blöcke geht keine Anfrage — die Suite verlangt mindestens einen.
/// Ein 5xx ohne Fehlerkörper ist `NichtErreichbar` (`abgelehnt_oder_offline`).
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
        let mut a = sende(
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
            return Err(abgelehnt_oder_offline(&a));
        }
        // Der Körper trägt die CEKs im Klartext (Base64): nach dem Lesen überschreiben, auch wenn
        // er nicht zum Vertrag passt. Die Posten wischen ihre CEKs selbst (`Schluesselposten`).
        let koerper = Zeroizing::new(std::mem::take(&mut a.koerper));
        let schluessel: Vec<Schluesselposten> = serde_json::from_str(&koerper)
            .map_err(|e| SuiteFehler::Antwort(format!("Körper passt nicht zum Vertrag: {e}")))?;
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

/// `POST /api/sicherung` mit dem Geräte-Token (Tabelle „Schnittstellen“, Nr. 6): meldet den
/// Zeitpunkt der letzten gelungenen Sicherung. 204 ist der einzige Erfolg; 401 heißt Widerrufen
/// wie bei den anderen Geräte-Schnittstellen (Stammdaten, Anker), ein 5xx ohne lesbaren
/// Fehlerkörper „nicht erreichbar“.
pub fn melde_sicherung(t: &dyn Transport, suite: &str, geraet: &str, erstellt: &str) -> Result<(), SuiteFehler> {
    let koerper = SicherungAnfrage { erstellt: erstellt.to_string() };
    let a = sende(
        t,
        Anfrage {
            methode: "POST",
            url: modul_url(suite, "/api/sicherung"),
            bearer: Some(geraet),
            if_none_match: None,
            json: Some(als_json(&koerper)),
        },
    )?;
    match a.status {
        204 => Ok(()),
        401 => Err(SuiteFehler::Widerrufen),
        _ => Err(abgelehnt_oder_offline(&a)),
    }
}
