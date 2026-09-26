//! Die Tauri-Befehle, die Schnittstelle der Oberfläche. Argumente kommen camelCase über
//! `invoke` (Tauri übersetzt `spkiPfad` in `spki_pfad`), Rückgaben serialisieren camelCase.
//! Fehler gehen als deutscher `String` hinaus.
//!
//! Jeder Befehl ist eine dünne Hülle um eine Funktion auf `&Zustand`. Die Funktionen kennen
//! kein Tauri und lassen sich deshalb ohne Fenster testen (unten); was ein `AppHandle` braucht
//! (Browser öffnen, Fokus, Autostart), kommt als Rückruf hinein oder als Rückgabewert heraus.
//! Die Befehle, die das Buch sperren oder die Suite fragen, laufen per `spawn_blocking` auf
//! einem Thread für blockierende Arbeit: Sie warten auf den Buch-Mutex, auf das Netz oder bis
//! zu fünf Minuten auf den Anmelderückruf und schließen beim Versiegeln ein `VACUUM` ein. Das
//! soll weder das Fenster noch die Worker der asynchronen Laufzeit aufhalten.
//!
//! Anbindung an die Suite (Plan Stufe 5): Einrichten, Anmelden und Neu einrichten laufen über
//! den Loopback-Rückruf mit PKCE (`kern/loopback.rs`, `kern/anmeldung.rs`), das Protokoll steht
//! in `kern/suite.rs`. Kein Lock wird über eine Anfrage oder das Warten gehalten.
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use einsatzbuch_kern::anmeldung::{self, anmelde_url};
use einsatzbuch_kern::buch::{self, Ankerabweichung, Betrieb, Buch, BuchFehler, Exportanker};
use einsatzbuch_kern::einrichtung::Stammdatenpaket;
use einsatzbuch_kern::erfassung::{Ausstehend, Entwurf, ErfassungFehler, Versiegelung, formatiere_zeitpunkt};
use einsatzbuch_kern::format::{Block, Umgebung};
use einsatzbuch_kern::krypto::SystemZufall;
use einsatzbuch_kern::loopback::{self, Listener, Rueckruf};
use einsatzbuch_kern::suite::{self, AnkerErgebnis, StammdatenErgebnis, SuiteFehler};
use einsatzbuch_kern::tresor::konto_fuer;
use einsatzbuch_kern::vertrag::{EinrichtenAntwort, Schluesselposten, TauschAntwort};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;
use zeroize::Zeroizing;

use crate::abgleich::Anstoss;
use crate::sicherung::{Sicherungsstand, sicherungsstand};
use crate::zustand::{Zustand, oeffne_buch, startfehler_text};

pub(crate) const NICHT_EINGERICHTET: &str = "Dieser Rechner ist noch nicht eingerichtet.";
const NICHTS_AUSSTEHEND: &str = "Es gibt keinen abgesendeten Einsatz, der versiegelt werden könnte.";
const SCHON_EINGERICHTET: &str = "Dieser Rechner ist schon eingerichtet.";
const TESTBETRIEB_ERST_BEENDEN: &str = "Testbetrieb erst beenden.";
const ECHT_VORHANDEN: &str =
    "Auf diesem Rechner liegt schon eine echte Einrichtung. Eine echte Installation wird nie zum Testrechner.";
const NAME_UNGUELTIG: &str = "Der Name des Rechners muss 1 bis 60 Zeichen lang sein.";
const ADRESSE_UNGUELTIG: &str = "Die Suite-Adresse muss mit https:// oder http:// beginnen.";
const ANMELDUNG_LAEUFT: &str = "Es läuft schon eine Anmeldung.";
const KEIN_ZUGANG: &str = "Kein Zugang zum Einsatzbuch — dir fehlt die Gruppe in der Suite.";
const ANMELDUNG_ABGEBROCHEN: &str = "Anmeldung abgebrochen.";
pub(crate) const SITZUNG_ABGELAUFEN: &str = "Die Sitzung ist abgelaufen. Bitte neu anmelden.";
const LESEN_BRAUCHT_VERBINDUNG: &str = "Lesen braucht Verbindung zur Suite.";
pub(crate) const KEIN_GERAETETOKEN: &str =
    "Für diesen Rechner liegt kein Geräte-Token im Schlüsselbund. Der Abgleich mit der Suite ist so nicht möglich.";
const NEU_NUR_ECHT: &str =
    "Neu einrichten gibt es nur für den echten Rechner. Einen Testrechner beendest du und richtest ihn neu ein.";
const NEU_NUR_NACH_WIDERRUF: &str = "Neu einrichten ist nur nach einem Widerruf nötig.";
const NEU_EINRICHTUNG_GEAENDERT: &str =
    "Die Einrichtung dieses Rechners hat sich während des Neu-Einrichtens geändert. Nichts übernommen.";

/// Übersetzt einen Fehler aus Erfassung und Versiegeln in die Meldung für die Oberfläche.
/// `Fehlt` wird zur Liste der fehlenden Felder („Fehlt: Alarmstichwort, Beginn“), die übrigen
/// Varianten tragen ihre deutsche Meldung schon selbst.
pub fn fehler_text(e: ErfassungFehler) -> String {
    match e {
        ErfassungFehler::Fehlt(felder) => format!("Fehlt: {}", felder.join(", ")),
        ErfassungFehler::NichtEingerichtet => NICHT_EINGERICHTET.into(),
        sonst => sonst.to_string(),
    }
}

pub(crate) fn buch_fehler_text(e: BuchFehler) -> String {
    match e {
        BuchFehler::NichtEingerichtet => NICHT_EINGERICHTET.into(),
        sonst => sonst.to_string(),
    }
}

/// Der letzte Block der Kette.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Kettenglied {
    pub block: u64,
    pub hash: String,
}

/// Stand der lokalen Kette. `anzahl` ist die Nummer des letzten Blocks: Die Blöcke sind ab 1
/// lückenlos nummeriert, so muss der Status nicht bei jeder Abfrage alle Blöcke lesen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Kettenstand {
    pub anzahl: u64,
    pub letzter: Option<Kettenglied>,
}

/// Alles, was die Oberfläche zum Zeichnen braucht, in einer Abfrage. Sie fragt ihn alle paar
/// Sekunden ab; die Frist entscheidet trotzdem Rust mit seiner eigenen Uhr.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub betrieb: Option<Betrieb>,
    pub eingerichtet: bool,
    /// `true` nur in Debug-Builds: Dann bietet die Oberfläche den Entwicklerweg an.
    pub entwicklung: bool,
    /// Die Datenbank ließ sich nicht öffnen. Die Oberfläche zeigt den Text, jeder schreibende
    /// Befehl lehnt ab.
    pub startfehler: Option<String>,
    pub bereitschaft: Option<String>,
    pub zeitzone: Option<String>,
    pub frist_minuten: Option<u32>,
    pub besatzung: Option<bool>,
    /// In der Zone der Einrichtung, ohne Einrichtung in UTC.
    pub jetzt: String,
    pub jetzt_ms: i64,
    pub entwurf: Option<Entwurf>,
    pub ausstehend: Option<Ausstehend>,
    pub kette: Kettenstand,
    /// Die noch nicht quittierte Versiegelung, aus der Frist-Uhr oder „Jetzt versiegeln“. Steht
    /// im Buch (`Buch::unquittiert`) und übersteht so einen Neustart.
    pub versiegelung: Option<Versiegelung>,
    /// Suite-Adresse der Einrichtung.
    pub suite_url: Option<String>,
    /// Suite-Adresse eines echten Rechners — Vorbelegung der Einrichtungsfrage.
    pub suite_vorgabe: String,
    pub rechner_name: Option<String>,
    pub eingerichtet_am: Option<String>,
    pub eingerichtet_von: Option<String>,
    pub schluessel_id: Option<String>,
    /// Zeitpunkt des letzten Stammdatenabrufs; bis zum ersten Abgleich der Zeitpunkt der
    /// Einrichtung, denn von dort stammt das Paket.
    pub stammdaten_vom: Option<String>,
    pub anker_bestaetigt_bis: u64,
    pub anker_abweichung: Option<Ankerabweichung>,
    /// Der letzte bestätigte Anker samt Zeitpunkt (`Buch::bestaetigter_anker`) — geht so in
    /// `Exportinhalt.anker`.
    pub anker: Option<Exportanker>,
    /// Sicherungsordner, letzte Sicherung, letzter Fehler und Ampel (`sicherung::stufe`); `None`
    /// ohne Einrichtung. Ob die Kette leer ist, steht in `kette.anzahl`.
    pub sicherung: Option<Sicherungsstand>,
    pub widerrufen: bool,
    /// Die Verwaltungssitzung, ohne Token. Eine abgelaufene erscheint als `None`.
    pub sitzung: Option<SitzungInfo>,
    /// Die App wartet auf den Anmelderückruf der Suite.
    pub anmeldung_laeuft: bool,
}

/// Die Verwaltungssitzung in Rust (Spec §4.4). Das Token wird beim Verwerfen überschrieben
/// (`Zeroizing`), und `Debug` schwärzt es.
pub struct Sitzung {
    pub token: Zeroizing<String>,
    pub name: String,
    pub ablauf_ms: i64,
    /// Der Rechner, an den die Suite die Sitzung gebunden hat (Entscheidung 2); `None` heißt:
    /// Die Sitzung kann nichts freigeben.
    pub rechner_id: Option<String>,
}

impl std::fmt::Debug for Sitzung {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Sitzung")
            .field("token", &suite::GESCHWAERZT)
            .field("name", &self.name)
            .field("ablauf_ms", &self.ablauf_ms)
            .field("rechner_id", &self.rechner_id)
            .finish()
    }
}

/// Was die Oberfläche von der Sitzung sieht: wer und bis wann, nie das Token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SitzungInfo {
    pub name: String,
    pub ablauf_ms: i64,
}

/// Die Anmelde-URL eines Versuchs — geht an den Systembrowser bzw. im Debug-Build auf stdout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Anmeldestart {
    pub url: String,
}

/// Ergebnis der Einrichtung. Die Hülle schaltet danach den Autostart ein, wenn
/// `autostart_einschalten` es sagt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Einrichtungsergebnis {
    pub echt: bool,
}

/// Autostart nur für einen echten Rechner und nie in einem Debug-Build: Sonst trüge jeder
/// Entwicklerlauf die App in den Autostart des Entwicklerrechners ein.
pub fn autostart_einschalten(e: &Einrichtungsergebnis) -> bool {
    e.echt && !cfg!(debug_assertions)
}

/// Stand des Ankerabgleichs nach „Kette prüfen“ (Plan Stufe 5, Task 8: `gleiche_anker_jetzt`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ankerstand {
    /// Bis zu diesem Block kennt die Suite die Kette (0: noch nichts bestätigt).
    pub bestaetigt_bis: u64,
    /// Hash des Blocks `bestaetigt_bis`.
    pub hash: Option<String>,
    /// Wann dieser Lauf die Bestätigung bekam, in der Zone der Einrichtung; `None`, wenn er
    /// keine bekam (offline, Abweichung, widerrufen, leere Kette).
    pub gemeldet_am: Option<String>,
    pub abweichung: Option<Ankerabweichung>,
    /// Die Suite war nicht erreichbar; der nächste Lauf meldet nach.
    pub offline: bool,
    pub widerrufen: bool,
}

/// Liest den Status. `startfehler` und alles aus dem Buch (auch `versiegelung`) werden unter
/// dem Buch-Lock gelesen, damit Kette, Ausstehendes und Versiegelung zum selben Stand gehören. Sitzung und laufende
/// Anmeldung kommen danach, ohne Buch-Lock (Blätter der Sperrreihenfolge, `zustand.rs`).
pub fn lies_status(z: &Zustand) -> Result<Status, String> {
    let jetzt = z.uhr.jetzt();
    let buch = z.buch();
    let startfehler = z.startfehler().clone();
    let mut status = match buch.as_ref() {
        None => Status {
            betrieb: None,
            eingerichtet: false,
            entwicklung: cfg!(debug_assertions),
            startfehler,
            bereitschaft: None,
            zeitzone: None,
            frist_minuten: None,
            besatzung: None,
            jetzt: formatiere_zeitpunkt(jetzt, "UTC"),
            jetzt_ms: jetzt.timestamp_millis(),
            entwurf: None,
            ausstehend: None,
            kette: Kettenstand { anzahl: 0, letzter: None },
            versiegelung: None,
            suite_url: None,
            suite_vorgabe: z.suite_vorgabe.clone(),
            rechner_name: None,
            eingerichtet_am: None,
            eingerichtet_von: None,
            schluessel_id: None,
            stammdaten_vom: None,
            anker_bestaetigt_bis: 0,
            anker_abweichung: None,
            anker: None,
            sicherung: None,
            widerrufen: false,
            sitzung: None,
            anmeldung_laeuft: false,
        },
        Some(buch) => {
            let einrichtung = buch.einrichtung().map_err(buch_fehler_text)?;
            let anbindung = buch.anbindung().map_err(buch_fehler_text)?;
            let zone = einrichtung.as_ref().map_or("UTC", |e| e.paket.zeitzone.as_str());
            let kopf = buch.kettenkopf().map_err(buch_fehler_text)?;
            Status {
                betrieb: Some(buch.betrieb()),
                eingerichtet: einrichtung.is_some(),
                entwicklung: cfg!(debug_assertions),
                startfehler,
                jetzt: formatiere_zeitpunkt(jetzt, zone),
                jetzt_ms: jetzt.timestamp_millis(),
                bereitschaft: einrichtung.as_ref().map(|e| e.paket.bereitschaft.clone()),
                zeitzone: einrichtung.as_ref().map(|e| e.paket.zeitzone.clone()),
                frist_minuten: einrichtung.as_ref().map(|e| e.paket.frist_minuten),
                besatzung: einrichtung.as_ref().map(|e| e.paket.besatzung),
                entwurf: buch.entwurf().map_err(fehler_text)?,
                ausstehend: buch.ausstehend().map_err(fehler_text)?,
                kette: Kettenstand {
                    anzahl: kopf.as_ref().map_or(0, |(block, _)| *block),
                    letzter: kopf.map(|(block, hash)| Kettenglied { block, hash }),
                },
                versiegelung: buch.unquittiert().map_err(buch_fehler_text)?,
                suite_url: einrichtung.as_ref().map(|e| e.suite_url.clone()),
                suite_vorgabe: z.suite_vorgabe.clone(),
                rechner_name: anbindung.as_ref().map(|a| a.rechner_name.clone()).filter(|n| !n.is_empty()),
                eingerichtet_am: einrichtung.as_ref().map(|e| e.eingerichtet_am.clone()),
                eingerichtet_von: einrichtung.as_ref().map(|e| e.eingerichtet_von.clone()),
                schluessel_id: einrichtung.as_ref().map(|e| e.schluessel_id.clone()),
                stammdaten_vom: anbindung
                    .as_ref()
                    .and_then(|a| a.stammdaten_abgerufen.clone())
                    .or_else(|| einrichtung.as_ref().map(|e| e.eingerichtet_am.clone())),
                anker_bestaetigt_bis: anbindung.as_ref().map_or(0, |a| a.anker_gemeldet_bis),
                anker_abweichung: anbindung.as_ref().and_then(|a| a.anker_abweichung.clone()),
                anker: buch.bestaetigter_anker().map_err(buch_fehler_text)?,
                sicherung: sicherungsstand(buch, jetzt).map_err(buch_fehler_text)?,
                widerrufen: anbindung.as_ref().is_some_and(|a| a.widerrufen),
                sitzung: None,
                anmeldung_laeuft: false,
            }
        }
    };
    drop(buch);
    status.sitzung = sitzung_info(z);
    status.anmeldung_laeuft = z.anmeldung().is_some();
    Ok(status)
}

pub fn lies_stammdaten(z: &Zustand) -> Result<Stammdatenpaket, String> {
    let buch = z.buch_zum_schreiben()?;
    let buch = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
    let einrichtung = buch.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
    Ok(einrichtung.paket)
}

/// `bearbeitung`: Der Entwurf ist die Bearbeitung eines ausstehenden Einsatzes. Nach Fristende
/// lehnt der Kern sie ab (`ErfassungFehler::FristAbgelaufen`), die Oberfläche fragt dann
/// `frist_pruefen` und zeigt die Versiegelung.
pub fn speichere_entwurf(z: &Zustand, entwurf: &Entwurf, bearbeitung: bool) -> Result<(), String> {
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch_zum_schreiben()?;
    let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    buch.speichere_entwurf(entwurf, jetzt, bearbeitung).map_err(fehler_text)
}

pub fn verwirf_entwurf(z: &Zustand) -> Result<(), String> {
    let mut buch = z.buch_zum_schreiben()?;
    let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    buch.verwerfe_entwurf().map_err(fehler_text)
}

/// `bearbeitung` wie bei `speichere_entwurf`: „Änderungen übernehmen“ statt der ersten Absendung.
pub fn sende_ab(z: &Zustand, entwurf: &Entwurf, bearbeitung: bool) -> Result<Ausstehend, String> {
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch_zum_schreiben()?;
    let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    buch.sende_ab(entwurf, jetzt, bearbeitung).map_err(fehler_text)
}

/// „Jetzt versiegeln“: versiegelt den ausstehenden Einsatz sofort, mit `verfallen = false`,
/// denn es gibt dann keinen Bearbeitungsstand, der verloren gehen könnte. Der Kern merkt die
/// Versiegelung in derselben Transaktion als unquittiert vor. Liegt nichts mehr aus, weil die
/// Frist-Uhr gerade zuvorgekommen ist, kommt deren noch nicht quittierte Versiegelung aus dem
/// Buch zurück statt eines Fehlers: Der Klick war dann nicht vergeblich, der Einsatz ist
/// versiegelt.
pub fn versiegele_jetzt(z: &Zustand) -> Result<Versiegelung, String> {
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch_zum_schreiben()?;
    let offen = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    let (v, neu) = match offen.versiegele_ausstehend(jetzt, &mut SystemZufall, false).map_err(fehler_text)? {
        Some(v) => (v, true),
        None => (offen.unquittiert().map_err(buch_fehler_text)?.ok_or(NICHTS_AUSSTEHEND)?, false),
    };
    drop(buch);
    if neu {
        z.stosse_an(Anstoss::NeuerBlock);
    }
    Ok(v)
}

/// Prüft die Frist sofort und gibt die unquittierte Versiegelung zurück. Das ist entweder die
/// eben entstandene oder eine, die die Frist-Uhr kurz vorher (oder ein früherer Lauf der App)
/// geschrieben hat: Zählt die Oberfläche auf 0 herunter, kann die Uhr im Hintergrund schon
/// zugeschlagen haben. Prüfung und Lesen laufen unter demselben Buch-Lock.
pub fn pruefe_frist_jetzt(z: &Zustand) -> Result<Option<Versiegelung>, String> {
    let mut buch = z.buch_zum_schreiben()?;
    let Some(offen) = buch.as_mut() else { return Ok(None) };
    let neu = offen.pruefe_frist(z.uhr.jetzt(), &mut SystemZufall).map_err(fehler_text)?.is_some();
    let v = offen.unquittiert().map_err(buch_fehler_text)?;
    drop(buch);
    if neu {
        z.stosse_an(Anstoss::NeuerBlock);
    }
    Ok(v)
}

/// Die Oberfläche hat die Versiegelung gesehen: Der Hinweis im Buch entfällt. Ohne Buch gibt
/// es keinen Hinweis und nichts zu tun.
pub fn quittiere(z: &Zustand) -> Result<(), String> {
    let mut buch = z.buch_zum_schreiben()?;
    match buch.as_mut() {
        Some(offen) => offen.quittiere().map_err(buch_fehler_text),
        None => Ok(()),
    }
}

// ---------------------------------------------------------------------------------------------
// Anmeldung an der Suite (Loopback mit PKCE)
// ---------------------------------------------------------------------------------------------

fn art_text(art: Umgebung) -> &'static str {
    match art {
        Umgebung::Echt => "echt",
        Umgebung::Test => "test",
    }
}

fn betrieb_zu(art: Umgebung) -> Betrieb {
    match art {
        Umgebung::Echt => Betrieb::Echt,
        Umgebung::Test => Betrieb::Test,
    }
}

/// Hält das Abbruch-Flag der laufenden Anmeldung im Zustand und räumt es auf jedem Weg hinaus
/// wieder ab — sonst bliebe `anmeldungLaeuft` stehen und jede weitere Anmeldung abgelehnt.
struct LaufendeAnmeldung<'a> {
    z: &'a Zustand,
    abbruch: Arc<AtomicBool>,
}

impl<'a> LaufendeAnmeldung<'a> {
    fn beginne(z: &'a Zustand) -> Result<LaufendeAnmeldung<'a>, String> {
        let mut anmeldung = z.anmeldung();
        if anmeldung.is_some() {
            return Err(ANMELDUNG_LAEUFT.into());
        }
        let abbruch = Arc::new(AtomicBool::new(false));
        *anmeldung = Some(Arc::clone(&abbruch));
        Ok(LaufendeAnmeldung { z, abbruch })
    }
}

impl Drop for LaufendeAnmeldung<'_> {
    fn drop(&mut self) {
        let mut anmeldung = self.z.anmeldung();
        if anmeldung.as_ref().is_some_and(|f| Arc::ptr_eq(f, &self.abbruch)) {
            *anmeldung = None;
        }
    }
}

/// Eine Anmeldung bis zum Tausch: Listener auf `127.0.0.1`, PKCE und `state`, die Anmelde-URL
/// an `oeffne`, Warten auf den Rückruf (höchstens 5 Minuten, abbrechbar), dann der Tausch. Kein
/// Lock wird dabei gehalten. `einrichtung` steht nur bei Einrichten und Neu einrichten in der URL
/// (Entscheidung 1); `geraet` geht nur bei der Verwaltungsanmeldung mit (Entscheidung 2).
fn melde_an_der_suite(
    z: &Zustand,
    suite_url: &str,
    einrichtung: Option<(Umgebung, &str)>,
    geraet: Option<&str>,
    oeffne: &dyn Fn(&str) -> Result<(), String>,
) -> Result<Sitzung, String> {
    let laufend = LaufendeAnmeldung::beginne(z)?;
    let listener =
        Listener::oeffne().map_err(|e| format!("Der lokale Rückruf der Anmeldung ließ sich nicht öffnen: {e}"))?;
    let pkce = anmeldung::pkce(&mut SystemZufall);
    let state = anmeldung::neuer_state(&mut SystemZufall);
    let start = Anmeldestart {
        url: anmelde_url(suite_url, listener.port(), &state, &pkce.challenge, einrichtung.map(|(art, name)| (art_text(art), name))),
    };
    oeffne(&start.url)?;
    let code = match listener.warte(&state, loopback::ZEITLIMIT, &laufend.abbruch).map_err(|e| e.to_string())? {
        Rueckruf::Code(code) => code,
        Rueckruf::KeinZugang => return Err(KEIN_ZUGANG.into()),
        Rueckruf::Abgebrochen => return Err(ANMELDUNG_ABGEBROCHEN.into()),
    };
    drop(laufend);
    let tausch = suite::tausche(&*z.transport, suite_url, &code, &pkce.verifier, geraet).map_err(|e| e.to_string())?;
    sitzung_aus(tausch)
}

/// Die Sitzung aus der Antwort des Tauschs; das Token wandert ohne Kopie in `Zeroizing`.
fn sitzung_aus(t: TauschAntwort) -> Result<Sitzung, String> {
    let ablauf = chrono::DateTime::parse_from_rfc3339(&t.ablauf)
        .map_err(|_| format!("Unerwartete Antwort der Suite: „{}“ ist kein Zeitpunkt.", t.ablauf))?;
    Ok(Sitzung { token: Zeroizing::new(t.sitzungstoken), name: t.name, ablauf_ms: ablauf.timestamp_millis(), rechner_id: t.rechner_id })
}

fn pruefe_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if (1..=60).contains(&name.chars().count()) { Ok(name.to_string()) } else { Err(NAME_UNGUELTIG.into()) }
}

/// Ein echter Rechner verbindet sich nur mit der Vorgabe; ein Testrechner mit jeder http(s)-Adresse.
fn pruefe_suite_url(z: &Zustand, art: Umgebung, url: &str) -> Result<String, String> {
    let url = url.trim().trim_end_matches('/');
    match art {
        Umgebung::Echt if url != z.suite_vorgabe.trim_end_matches('/') => {
            Err(format!("Ein echter Rechner verbindet sich nur mit {}.", z.suite_vorgabe))
        }
        Umgebung::Test
            if !["https://", "http://"].iter().any(|p| url.strip_prefix(p).is_some_and(|rest| !rest.is_empty())) =>
        {
            Err(ADRESSE_UNGUELTIG.into())
        }
        _ => Ok(url.to_string()),
    }
}

/// Darf dieser Rechner in `betrieb` eingerichtet werden? Eine echte Einrichtung verlangt, dass
/// kein Testbetrieb läuft; ein Testrechner, dass keine echte Einrichtung liegt (Spec §12).
fn pruefe_einrichtbar(z: &Zustand, buch: &Option<Buch>, betrieb: Betrieb) -> Result<(), String> {
    match betrieb {
        Betrieb::Echt if z.ordner.join(Betrieb::Test.datei()).try_exists().map_err(|e| e.to_string())? => {
            return Err(TESTBETRIEB_ERST_BEENDEN.into());
        }
        Betrieb::Test if buch::hat_echte_einrichtung(&z.ordner).map_err(buch_fehler_text)? => {
            return Err(ECHT_VORHANDEN.into());
        }
        _ => {}
    }
    if let Some(offen) = buch {
        if offen.einrichtung().map_err(buch_fehler_text)?.is_some() {
            return Err(SCHON_EINGERICHTET.into());
        }
        if offen.betrieb() != betrieb {
            return Err(match betrieb {
                Betrieb::Echt => TESTBETRIEB_ERST_BEENDEN.into(),
                Betrieb::Test => ECHT_VORHANDEN.into(),
            });
        }
    }
    Ok(())
}

/// Einrichtung über die Suite (Spec §4.4, Entscheidungen 1 und 10): Adresse und Name prüfen,
/// anmelden, `POST einrichten`, dann erst Tresor und Datenbank. Scheitert ein Schritt nach der
/// Antwort der Suite, bleibt weder eine Datei noch ein Tresor-Eintrag zurück (Review Focus 3);
/// einen dabei schon angelegten Test-Rechner löscht die App in der Suite wieder, soweit sie
/// kann. Die Sitzung dieser Einrichtung bleibt danach bestehen, gebunden an den neuen Rechner
/// (Entscheidung 2) — wer eingerichtet hat, ist angemeldet, bis er sperrt.
pub fn richte_ein_ueber_suite(
    z: &Zustand,
    art: Umgebung,
    name: &str,
    suite_url: &str,
    oeffne: &dyn Fn(&str) -> Result<(), String>,
) -> Result<Einrichtungsergebnis, String> {
    let name = pruefe_name(name)?;
    let suite_url = pruefe_suite_url(z, art, suite_url)?;
    let betrieb = betrieb_zu(art);
    {
        let buch = z.buch_zum_schreiben()?;
        pruefe_einrichtbar(z, &buch, betrieb)?;
    }

    let mut sitzung = melde_an_der_suite(z, &suite_url, Some((art, &name)), None, oeffne)?;
    let antwort = suite::richte_ein(&*z.transport, &suite_url, &sitzung.token, art, &name).map_err(|e| e.to_string())?;
    if let Err(fehler) = lege_lokal_an(z, betrieb, &suite_url, &name, &antwort) {
        if art == Umgebung::Test {
            if let Err(e) = suite::loesche_rechner(&*z.transport, &suite_url, &sitzung.token, &antwort.rechner_id) {
                eprintln!("Der halb eingerichtete Test-Rechner ließ sich in der Suite nicht löschen: {e}");
            }
        }
        return Err(fehler);
    }
    sitzung.rechner_id = Some(antwort.rechner_id.clone());
    *z.sitzung() = Some(sitzung);
    z.stosse_an(Anstoss::NeuerBlock);
    Ok(Einrichtungsergebnis { echt: art == Umgebung::Echt })
}

/// Legt Tresor-Eintrag und Datenbank an. Reihenfolge: Datei öffnen, Token in den Tresor, zuletzt
/// `richte_ein` — erst diese Zeile macht das Buch „eingerichtet“. Scheitert etwas, wird der
/// Tresor-Eintrag gelöscht und eine hier neu angelegte Datei verworfen
/// (`verwirf_unfertiges_buch`); ein schon vorher offenes, unfertiges Buch bleibt liegen.
fn lege_lokal_an(z: &Zustand, betrieb: Betrieb, suite_url: &str, name: &str, antwort: &EinrichtenAntwort) -> Result<(), String> {
    let mut buch = z.buch_zum_schreiben()?;
    pruefe_einrichtbar(z, &buch, betrieb)?;
    let konto = konto_fuer(betrieb);
    let (mut neu, frisch) = match buch.take() {
        Some(offen) => (offen, false),
        None => {
            let datei = z.ordner.join(betrieb.datei());
            let schon_da = datei.try_exists().map_err(|e| e.to_string())?;
            std::fs::create_dir_all(&z.ordner).map_err(|e| format!("Der Datenordner ließ sich nicht anlegen: {e}"))?;
            match Buch::oeffne(&z.ordner, betrieb) {
                Ok(offen) => (offen, !schon_da),
                Err(fehler) => {
                    // SQLite legt die Datei schon beim Öffnen an; scheitert danach ein Pragma
                    // oder das Schema, bliebe sie halb liegen.
                    if !schon_da {
                        entferne_reste(&datei);
                    }
                    return Err(buch_fehler_text(fehler));
                }
            }
        }
    };
    let ergebnis = z
        .tresor
        .schreibe(konto, &antwort.geraete_token)
        .and_then(|()| neu.richte_ein(&antwort.einrichtung(suite_url), &antwort.rechner_id, name).map_err(buch_fehler_text));
    if let Err(fehler) = ergebnis {
        if let Err(e) = z.tresor.loesche(konto) {
            eprintln!("Das Geräte-Token der gescheiterten Einrichtung ließ sich nicht löschen: {e}");
        }
        if frisch {
            if let Err(e) = buch::verwirf_unfertiges_buch(neu) {
                eprintln!("Die halb angelegte Datenbank ließ sich nicht löschen: {e}");
            }
        } else {
            *buch = Some(neu);
        }
        return Err(fehler);
    }
    *buch = Some(neu);
    Ok(())
}

/// Löscht eine eben erst angelegte Datenbankdatei samt `-wal`/`-shm`, deren Öffnen scheiterte.
fn entferne_reste(datei: &Path) {
    for zusatz in ["", "-wal", "-shm"] {
        let mut name = datei.as_os_str().to_os_string();
        name.push(zusatz);
        match std::fs::remove_file(&name) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => eprintln!("Die halb angelegte Datei {} ließ sich nicht löschen: {e}", Path::new(&name).display()),
        }
    }
}

/// Verwaltungsanmeldung (Spec §4.4): wie die Einrichtung, aber ohne `art` in der URL und mit
/// dem Geräte-Token im Tausch, damit die Suite die Sitzung an diesen Rechner bindet
/// (Entscheidung 2). Fehlt das Token, entsteht eine Sitzung ohne Rechner.
pub fn melde_an(z: &Zustand, oeffne: &dyn Fn(&str) -> Result<(), String>) -> Result<SitzungInfo, String> {
    let (suite_url, betrieb) = {
        let buch = z.buch_zum_schreiben()?;
        let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
        let e = offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        (e.suite_url, offen.betrieb())
    };
    let geraet = z.tresor.lies(konto_fuer(betrieb))?.map(Zeroizing::new);
    if geraet.is_none() {
        eprintln!("Kein Geräte-Token im Schlüsselbund: Die Sitzung wird an keinen Rechner gebunden.");
    }
    let sitzung = melde_an_der_suite(z, &suite_url, None, geraet.as_deref().map(String::as_str), oeffne)?;
    let info = SitzungInfo { name: sitzung.name.clone(), ablauf_ms: sitzung.ablauf_ms };
    *z.sitzung() = Some(sitzung);
    Ok(info)
}

/// Neu einrichten nach Widerruf (Entscheidung 12), nur für den echten Rechner: gleiche Art,
/// gleicher Name, gleiche Suite. Die Kette bleibt, der Schlüssel ist gepinnt — eine andere
/// `schluesselId` lehnt `Buch::richte_neu_ein` mit beiden IDs ab, und das alte Geräte-Token
/// kommt zurück in den Tresor. Die Suite hat den neuen Rechner dann schon angelegt; das lässt
/// sich von hier nicht zurücknehmen (die Meldung schickt zur Verwaltung).
///
/// Der Schlüsselbund kann auf einen Dialog des Betriebssystems warten, deshalb läuft er nie unter
/// dem Buch-Lock (Sperrreihenfolge in `zustand.rs`):
/// 1. unter Lock prüfen und die Einrichtung lesen;
/// 2. Anmeldung und `POST einrichten` ohne Lock;
/// 3. ohne Lock das alte Token lesen und das neue schreiben;
/// 4. unter Lock erneut prüfen, dass Betrieb und `schluesselId` unverändert sind, dann
///    `Buch::richte_neu_ein`;
/// 5. scheitert Schritt 4 auf irgendeinem Weg: ohne Lock das alte Token zurücklegen.
pub fn richte_neu_ein(z: &Zustand, oeffne: &dyn Fn(&str) -> Result<(), String>) -> Result<(), String> {
    let (suite_url, name, schluessel_id) = {
        let buch = z.buch_zum_schreiben()?;
        let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
        if offen.betrieb() != Betrieb::Echt {
            return Err(NEU_NUR_ECHT.into());
        }
        let e = offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        let a = offen.anbindung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        if !a.widerrufen {
            return Err(NEU_NUR_NACH_WIDERRUF.into());
        }
        let name = if a.rechner_name.trim().is_empty() { "Einsatzbuch-Rechner".to_string() } else { a.rechner_name };
        (e.suite_url, name, e.schluessel_id)
    };
    let mut sitzung = melde_an_der_suite(z, &suite_url, Some((Umgebung::Echt, &name)), None, oeffne)?;
    let antwort = suite::richte_ein(&*z.transport, &suite_url, &sitzung.token, Umgebung::Echt, &name).map_err(|e| e.to_string())?;

    let konto = konto_fuer(Betrieb::Echt);
    let altes_token = z.tresor.lies(konto)?.map(Zeroizing::new);
    z.tresor.schreibe(konto, &antwort.geraete_token)?;

    // Jeder Fehler in diesem Block — auch ein `?` — landet unten beim Zurücklegen des Tokens.
    let uebernommen = (|| {
        let mut buch = z.buch_zum_schreiben()?;
        let offen = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
        let jetzt = offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        if offen.betrieb() != Betrieb::Echt || jetzt.schluessel_id != schluessel_id {
            return Err(NEU_EINRICHTUNG_GEAENDERT.to_string());
        }
        offen.richte_neu_ein(&antwort.einrichtung(&suite_url), &antwort.rechner_id, &name).map_err(buch_fehler_text)
    })();
    if let Err(fehler) = uebernommen {
        let zurueck = match altes_token.as_deref() {
            Some(alt) => z.tresor.schreibe(konto, alt),
            None => z.tresor.loesche(konto),
        };
        if let Err(e) = zurueck {
            eprintln!("Das bisherige Geräte-Token ließ sich nicht zurücklegen: {e}");
        }
        return Err(fehler);
    }
    sitzung.rechner_id = Some(antwort.rechner_id.clone());
    *z.sitzung() = Some(sitzung);
    z.stosse_an(Anstoss::NeuerBlock);
    Ok(())
}

/// „Abbrechen“ während des Wartens auf den Rückruf: setzt nur das Flag, der wartende Befehl
/// endet binnen eines Takts mit „Anmeldung abgebrochen.“. Ohne laufende Anmeldung ein No-op.
pub fn brich_anmeldung_ab(z: &Zustand) {
    if let Some(abbruch) = z.anmeldung().as_ref() {
        abbruch.store(true, Ordering::SeqCst);
    }
}

/// „Sitzung sperren“ (Entscheidung 9): Das Token wird verworfen und dabei überschrieben.
pub fn melde_ab(z: &Zustand) {
    *z.sitzung() = None;
}

/// Das Sitzungstoken, solange die Sitzung gilt. Eine abgelaufene Sitzung wird dabei verworfen.
fn gueltiges_token(z: &Zustand) -> Result<Zeroizing<String>, String> {
    gueltige_sitzung(z).map(|(token, _)| token)
}

/// Token und gebundener Rechner der Sitzung, solange sie gilt; eine abgelaufene wird dabei
/// verworfen. Nimmt nur den Sitzungs-Mutex (ein Blatt, `zustand.rs`), also nie unter dem Buch-Lock
/// aufrufen und danach das Buch sperren wollen — erst das eine, dann das andere.
pub(crate) fn gueltige_sitzung(z: &Zustand) -> Result<(Zeroizing<String>, Option<String>), String> {
    let jetzt = z.uhr.jetzt().timestamp_millis();
    let mut sitzung = z.sitzung();
    match sitzung.as_ref() {
        Some(s) if s.ablauf_ms > jetzt => Ok((s.token.clone(), s.rechner_id.clone())),
        Some(_) => {
            *sitzung = None;
            Err(SITZUNG_ABGELAUFEN.into())
        }
        None => Err(SITZUNG_ABGELAUFEN.into()),
    }
}

/// Name und Ablauf der gültigen Sitzung für den Status; eine abgelaufene wird dabei verworfen.
fn sitzung_info(z: &Zustand) -> Option<SitzungInfo> {
    let jetzt = z.uhr.jetzt().timestamp_millis();
    let mut sitzung = z.sitzung();
    match sitzung.as_ref() {
        Some(s) if s.ablauf_ms > jetzt => Some(SitzungInfo { name: s.name.clone(), ablauf_ms: s.ablauf_ms }),
        Some(_) => {
            *sitzung = None;
            None
        }
        None => None,
    }
}

/// Verwirft die Sitzung nur, wenn es noch dieselbe ist — eine inzwischen neue Anmeldung bleibt.
fn verwirf_sitzung_mit(z: &Zustand, token: &str) {
    let mut sitzung = z.sitzung();
    if sitzung.as_ref().is_some_and(|s| s.token.as_str() == token) {
        *sitzung = None;
    }
}

// ---------------------------------------------------------------------------------------------
// Verwaltung: Blöcke, Freigabe, Anker, Stammdaten
// ---------------------------------------------------------------------------------------------

/// Alle versiegelten Blöcke — verschlüsselt, deshalb ohne Sitzung lesbar.
pub fn lies_bloecke(z: &Zustand) -> Result<Vec<Block>, String> {
    let buch = z.buch_zum_schreiben()?;
    let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
    offen.bloecke().map_err(buch_fehler_text)
}

/// Lässt die Suite die Inhaltsschlüssel freigeben (200er-Pakete, `suite::gib_frei`): mit
/// `bloecke` nur die genannten Nummern (Stufe 6, Entscheidung 9 — „einzeln“ beim Export), `None`
/// wie bisher alle. Eine unbekannte Nummer wird schon gegen die lokale Kette geprüft, bevor
/// überhaupt eine Anfrage entsteht — die Audit-Zeile der Suite nennt dann nur die angefragten
/// Blöcke. Ohne gültige Sitzung, und wenn die Suite die Sitzung nicht mehr kennt (401), heißt es
/// neu anmelden; ohne Netz „Lesen braucht Verbindung zur Suite.“ (Spec §8).
pub fn gib_schluessel_frei(z: &Zustand, bloecke: Option<&[u64]>) -> Result<Vec<Schluesselposten>, String> {
    let token = gueltiges_token(z)?;
    let (suite_url, alle) = {
        let buch = z.buch_zum_schreiben()?;
        let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
        let e = offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        (e.suite_url, offen.bloecke().map_err(buch_fehler_text)?)
    };
    let ausgewaehlt = match bloecke {
        None => alle,
        // `BTreeSet`: doppelte Nummern (etwa aus der Oberfläche verdoppelt) landen nur einmal in
        // der Anfrage — sonst nennt `suite::gib_frei` „andere Blöcke als angefragt“, weil die
        // Suite dieselbe Nummer nicht zweimal freigibt.
        Some(nummern) => nummern
            .iter()
            .copied()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .map(|n| alle.iter().find(|b| b.kopf.block == n).cloned().ok_or_else(|| format!("Block {n} gibt es auf diesem Rechner nicht.")))
            .collect::<Result<Vec<_>, String>>()?,
    };
    suite::gib_frei(&*z.transport, &suite_url, &token, &ausgewaehlt)
        .map_err(|e| freigabe_fehler(z, &token, e, LESEN_BRAUCHT_VERBINDUNG))
}

/// Die Meldung zu einer gescheiterten Freigabe (`suite::gib_frei`), geteilt von „Lesen“ und
/// Wiederherstellen: Ohne Netz `offline`, bei 401 kennt die Suite die Sitzung nicht mehr — sie
/// wird verworfen (nur, wenn es noch dieselbe ist), und es heißt neu anmelden.
pub(crate) fn freigabe_fehler(z: &Zustand, token: &str, e: SuiteFehler, offline: &str) -> String {
    match e {
        SuiteFehler::NichtErreichbar(_) => offline.into(),
        SuiteFehler::Abgelehnt { status: 401, .. } => {
            verwirf_sitzung_mit(z, token);
            SITZUNG_ABGELAUFEN.into()
        }
        e => e.to_string(),
    }
}

/// Was ein Abgleich mit dem Geräte-Token braucht, gelesen unter einem kurzen Lock.
struct Abgleichsgrundlage {
    suite_url: String,
    zeitzone: String,
    rechner_id: String,
    etag: Option<String>,
    geraet: Zeroizing<String>,
}

fn abgleichsgrundlage(z: &Zustand) -> Result<Abgleichsgrundlage, String> {
    let (suite_url, zeitzone, rechner_id, etag, betrieb) = {
        let buch = z.buch_zum_schreiben()?;
        let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
        let e = offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        let a = offen.anbindung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        (e.suite_url, e.paket.zeitzone, a.rechner_id, a.stammdaten_etag, offen.betrieb())
    };
    let geraet = z.tresor.lies(konto_fuer(betrieb))?.map(Zeroizing::new).ok_or(KEIN_GERAETETOKEN)?;
    Ok(Abgleichsgrundlage { suite_url, zeitzone, rechner_id, etag, geraet })
}

/// „Kette prüfen“ gegen die Suite und der Ankerlauf des Abgleich-Threads (`suite::gleiche_anker_ab`):
/// meldet offene Blöcke nach bzw. den letzten erneut und liefert den Stand danach.
///
/// Der Bestätigungszeitpunkt steht in der Zone der Einrichtung, gelesen vor dem Lauf. Derselbe
/// Text geht ins Buch (`anker_gemeldet_am`, später `Exportinhalt.anker.gemeldetAm`) und in
/// `Ankerstand.gemeldet_am`.
pub fn gleiche_anker_jetzt(z: &Zustand) -> Result<Ankerstand, String> {
    let g = abgleichsgrundlage(z)?;
    let gemeldet_am = formatiere_zeitpunkt(z.uhr.jetzt(), &g.zeitzone);
    let ergebnis = suite::gleiche_anker_ab(&z.buch, &*z.transport, &g.suite_url, &g.geraet, &gemeldet_am)?;
    let buch = z.buch_zum_schreiben()?;
    let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
    let a = offen.anbindung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
    let bis = a.anker_gemeldet_bis;
    Ok(Ankerstand {
        bestaetigt_bis: bis,
        hash: if bis > 0 { offen.hash_von(bis).map_err(buch_fehler_text)? } else { None },
        gemeldet_am: matches!(ergebnis, AnkerErgebnis::Bestaetigt(n) if n > 0).then_some(gemeldet_am),
        abweichung: a.anker_abweichung,
        offline: ergebnis == AnkerErgebnis::Offline,
        widerrufen: a.widerrufen,
    })
}

/// Stammdatenabgleich (Entscheidung 7): 200 übernimmt das Paket samt `ETag`, 304 bestätigt nur
/// den Abrufzeitpunkt, 401 speichert den Widerruf. Wie beim Ankerabgleich gilt die Antwort nur,
/// solange derselbe Rechner eingerichtet ist — hat „Neu einrichten“ inzwischen gewechselt, wird
/// sie verworfen, sonst bekäme der neue Rechner den Widerruf des alten. Der Abrufzeitpunkt steht
/// in der Zone der bisherigen Einrichtung (die neue ist erst nach der Übernahme geprüft).
pub fn hole_stammdaten_jetzt(z: &Zustand) -> Result<(), String> {
    let g = abgleichsgrundlage(z)?;
    let ergebnis = suite::hole_stammdaten(&*z.transport, &g.suite_url, &g.geraet, g.etag.as_deref());
    let abgerufen = formatiere_zeitpunkt(z.uhr.jetzt(), &g.zeitzone);
    let mut buch = z.buch_zum_schreiben()?;
    let offen = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    if offen.anbindung().map_err(buch_fehler_text)?.map(|a| a.rechner_id) != Some(g.rechner_id) {
        return Ok(());
    }
    match ergebnis {
        Ok(StammdatenErgebnis::Neu { paket, etag }) => {
            offen.uebernehme_stammdaten(&paket, etag.as_deref(), &abgerufen).map_err(buch_fehler_text)
        }
        Ok(StammdatenErgebnis::Unveraendert) => offen.stammdaten_bestaetigt(&abgerufen).map_err(buch_fehler_text),
        Err(SuiteFehler::Widerrufen) => {
            offen.widerrufen_setzen(true).map_err(buch_fehler_text)?;
            Err(SuiteFehler::Widerrufen.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Beendet den Testbetrieb. Das Buch wird nur im Testbetrieb aus dem Zustand genommen: Der
/// Kern verbraucht es auch im Fehlerfall, bei `Echt` wäre es sonst weg, obwohl nichts gelöscht
/// wurde. Danach sieht die Frist-Uhr `None`, und die App steht wieder bei „nicht eingerichtet“.
///
/// Scheitert das Löschen, ist das Buch trotzdem verbraucht. Dann wird die Datei neu geöffnet
/// und zurückgelegt, damit die App weiterläuft und die Frist-Uhr weiterprüft. Lässt sie sich
/// nicht mehr öffnen (etwa weil das Löschen halb durch ist), wird das ein Startfehler: Die
/// Oberfläche meldet es, und kein Befehl fasst die Datei mehr an.
///
/// Ist die Datei weg, folgen das Geräte-Token im Tresor und — nur mit gültiger Sitzung — der
/// Test-Rechner in der Suite (`DELETE rechner/<id>`, ohne Buch-Lock). Lehnt die Suite ab oder
/// ist sie nicht erreichbar, ist der Testbetrieb trotzdem beendet; die Meldung sagt beides. Die
/// Sitzung endet in jedem Fall: Sie war an den gelöschten Rechner gebunden.
pub fn beende_testbetrieb(z: &Zustand) -> Result<(), String> {
    let mut buch = z.buch_zum_schreiben()?;
    match buch.as_ref().map(|b| b.betrieb()) {
        Some(Betrieb::Test) => {}
        Some(Betrieb::Echt) => return Err("Testbetrieb beenden geht nur im Testbetrieb.".into()),
        None => return Err(NICHT_EINGERICHTET.into()),
    }
    let offen = buch.as_ref().expect("oben auf Some geprüft");
    let suite_url = offen.einrichtung().map_err(buch_fehler_text)?.map(|e| e.suite_url);
    let rechner_id = offen.anbindung().map_err(buch_fehler_text)?.map(|a| a.rechner_id).filter(|id| !id.is_empty());
    let test = buch.take().expect("oben auf Some geprüft");
    if let Err(fehler) = buch::beende_testbetrieb(&z.ordner, test) {
        match oeffne_buch(&z.ordner) {
            Ok(wieder) => *buch = wieder,
            Err(oeffnen) => *z.startfehler() = Some(startfehler_text(oeffnen)),
        }
        return Err(buch_fehler_text(fehler));
    }
    drop(buch);

    if let Err(e) = z.tresor.loesche(konto_fuer(Betrieb::Test)) {
        eprintln!("Das Geräte-Token des Testbetriebs ließ sich nicht löschen: {e}");
    }
    let suite_fehler = match (gueltiges_token(z).ok(), suite_url, rechner_id) {
        (Some(token), Some(suite_url), Some(id)) => suite::loesche_rechner(&*z.transport, &suite_url, &token, &id).err(),
        _ => None,
    };
    melde_ab(z);
    match suite_fehler {
        Some(e) => Err(format!("Der Testbetrieb ist beendet. Die Suite hat den Test-Rechner aber nicht gelöscht: {e}")),
        None => Ok(()),
    }
}

/// Entwicklerweg (nur Debug-Builds): richtet einen Testbetrieb mit dem Schlüssel aus
/// `spki_pfad` ein (Base64-DER oder PEM), ohne Pfad mit dem Schlüssel der Testvektoren. Die
/// Frist ist in Minuten, Vorgabe 15, geklemmt auf 1 bis 120.
#[cfg(debug_assertions)]
pub fn richte_entwicklung_ein(z: &Zustand, spki_pfad: Option<&Path>, frist_minuten: Option<u32>) -> Result<(), String> {
    use einsatzbuch_kern::entwicklung;

    let spki = match spki_pfad {
        Some(pfad) => entwicklung::lies_spki_datei(pfad)?,
        None => entwicklung::vektor_spki(),
    };
    let frist = frist_minuten.unwrap_or(15).clamp(1, 120);
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch_zum_schreiben()?;
    if let Some(offen) = buch.as_ref() {
        if offen.einrichtung().map_err(buch_fehler_text)?.is_some() {
            return Err("Dieser Rechner ist schon eingerichtet.".into());
        }
    }
    // Ein offenes Buch ohne Einrichtung (etwa nach einem abgebrochenen Versuch) wird vorher
    // geschlossen, damit nicht zwei Verbindungen auf derselben Datei liegen.
    *buch = None;
    *buch = Some(entwicklung::richte_testbetrieb_ein(&z.ordner, spki, frist, jetzt)?);
    Ok(())
}

/// Führt `f` auf dem Zustand in einem Thread für blockierende Arbeit aus.
pub(crate) async fn blockierend<T, F>(app: AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Zustand) -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || f(&app.state::<Zustand>()))
        .await
        .map_err(|e| format!("Der Befehl wurde abgebrochen: {e}"))?
}

#[tauri::command]
pub async fn status(app: AppHandle) -> Result<Status, String> {
    blockierend(app, lies_status).await
}

#[tauri::command]
pub async fn stammdaten(app: AppHandle) -> Result<Stammdatenpaket, String> {
    blockierend(app, lies_stammdaten).await
}

#[tauri::command]
pub async fn entwurf_speichern(app: AppHandle, entwurf: Entwurf, bearbeitung: bool) -> Result<(), String> {
    blockierend(app, move |z| speichere_entwurf(z, &entwurf, bearbeitung)).await
}

#[tauri::command]
pub async fn entwurf_verwerfen(app: AppHandle) -> Result<(), String> {
    blockierend(app, verwirf_entwurf).await
}

#[tauri::command]
pub async fn absenden(app: AppHandle, entwurf: Entwurf, bearbeitung: bool) -> Result<Ausstehend, String> {
    blockierend(app, move |z| sende_ab(z, &entwurf, bearbeitung)).await
}

#[tauri::command]
pub async fn jetzt_versiegeln(app: AppHandle) -> Result<Versiegelung, String> {
    blockierend(app, versiegele_jetzt).await
}

#[tauri::command]
pub async fn frist_pruefen(app: AppHandle) -> Result<Option<Versiegelung>, String> {
    blockierend(app, pruefe_frist_jetzt).await
}

#[tauri::command]
pub async fn versiegelung_quittieren(app: AppHandle) -> Result<(), String> {
    blockierend(app, quittiere).await
}

#[tauri::command]
pub async fn testbetrieb_beenden(app: AppHandle) -> Result<(), String> {
    blockierend(app, beende_testbetrieb).await
}

/// Einrichtung über die Suite. Der Browser öffnet sich über `oeffne_anmelde_url` (im Debug-Build
/// mit `EINSATZBUCH_ANMELDUNG_STDOUT=1` stattdessen stdout). Danach holt die App den Fokus —
/// auch nach einem Fehler, denn die Meldung steht in der App, nicht im Browser — und schaltet
/// den Autostart ein, wenn `autostart_einschalten` es sagt.
#[tauri::command]
pub async fn einrichten(app: AppHandle, art: Umgebung, name: String, suite_url: String) -> Result<(), String> {
    let oeffner = app.clone();
    let ergebnis = blockierend(app.clone(), move |z| {
        richte_ein_ueber_suite(z, art, &name, &suite_url, &|url| crate::oeffne_anmelde_url(&oeffner, url))
    })
    .await;
    crate::hole_fokus(&app);
    if autostart_einschalten(&ergebnis?) {
        if let Err(e) = app.autolaunch().enable() {
            eprintln!("Der Autostart ließ sich nicht einschalten: {e}");
        }
    }
    Ok(())
}

/// Verwaltungsanmeldung; danach holt die App den Fokus.
#[tauri::command]
pub async fn anmelden(app: AppHandle) -> Result<SitzungInfo, String> {
    let oeffner = app.clone();
    let ergebnis = blockierend(app.clone(), move |z| melde_an(z, &|url| crate::oeffne_anmelde_url(&oeffner, url))).await;
    crate::hole_fokus(&app);
    ergebnis
}

/// Neu einrichten nach Widerruf (nur echt); danach holt die App den Fokus.
#[tauri::command]
pub async fn neu_einrichten(app: AppHandle) -> Result<(), String> {
    let oeffner = app.clone();
    let ergebnis = blockierend(app.clone(), move |z| richte_neu_ein(z, &|url| crate::oeffne_anmelde_url(&oeffner, url))).await;
    crate::hole_fokus(&app);
    ergebnis
}

/// Synchron und ohne Buch-Lock: Es setzt nur das Abbruch-Flag der wartenden Anmeldung.
#[tauri::command]
pub fn anmeldung_abbrechen(app: AppHandle) {
    brich_anmeldung_ab(&app.state::<Zustand>());
}

/// „Sitzung sperren“: verwirft das Sitzungstoken.
#[tauri::command]
pub fn abmelden(app: AppHandle) {
    melde_ab(&app.state::<Zustand>());
}

#[tauri::command]
pub async fn bloecke(app: AppHandle) -> Result<Vec<Block>, String> {
    blockierend(app, lies_bloecke).await
}

/// `bloecke`: `None` (bzw. kein Argument aus TS) gibt wie bisher alle frei; `Some` nur die
/// genannten Nummern (Export „einzeln“, Stufe 6 Entscheidung 9).
#[tauri::command]
pub async fn schluessel_freigeben(app: AppHandle, bloecke: Option<Vec<u64>>) -> Result<Vec<Schluesselposten>, String> {
    blockierend(app, move |z| gib_schluessel_frei(z, bloecke.as_deref())).await
}

#[tauri::command]
pub async fn anker_abgleichen(app: AppHandle) -> Result<Ankerstand, String> {
    blockierend(app, gleiche_anker_jetzt).await
}

#[tauri::command]
pub async fn stammdaten_abgleichen(app: AppHandle) -> Result<(), String> {
    blockierend(app, hole_stammdaten_jetzt).await
}

/// Ob die App beim Anmelden am Betriebssystem startet. Eingeschaltet wird das bei der echten
/// Einrichtung, nie im Testbetrieb und nie in Debug-Builds; hier nur Lesen und Schalten für
/// die Verwaltung. Beide Befehle sperren das Buch nicht und laufen synchron.
#[tauri::command]
pub fn autostart_status(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| format!("Autostart ist nicht lesbar: {e}"))
}

#[tauri::command]
pub fn autostart_setzen(app: AppHandle, an: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    let ergebnis = if an { autostart.enable() } else { autostart.disable() };
    ergebnis.map_err(|e| format!("Autostart ließ sich nicht umschalten: {e}"))
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn entwicklung_einrichten(app: AppHandle, spki_pfad: Option<String>, frist_minuten: Option<u32>) -> Result<(), String> {
    blockierend(app, move |z| richte_entwicklung_ein(z, spki_pfad.as_deref().map(Path::new), frist_minuten)).await
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    use chrono::{DateTime, Duration, Utc};
    use einsatzbuch_kern::anmeldung::challenge_zu;
    use einsatzbuch_kern::buch::Buch;
    use einsatzbuch_kern::erfassung::PersonAuswahl;
    use einsatzbuch_kern::krypto;
    use einsatzbuch_kern::suite::{Anfrage, Antwort, Transport};
    use einsatzbuch_kern::tresor::{Speichertresor, Tresor};
    use einsatzbuch_kern::uhr::Uhr;
    use serde_json::{Value, json};

    use super::*;
    use crate::zustand::Anbindungsteile;

    /// Eine Uhr, die der Test von außen stellt, während der Zustand sie besitzt.
    #[derive(Clone)]
    pub(crate) struct Stelluhr(Arc<Mutex<DateTime<Utc>>>);

    impl Stelluhr {
        pub(crate) fn neu() -> Stelluhr {
            Stelluhr(Arc::new(Mutex::new("2026-09-24T08:00:00Z".parse().unwrap())))
        }
        pub(crate) fn vor(&self, d: Duration) {
            *self.0.lock().unwrap() += d;
        }
    }

    impl Uhr for Stelluhr {
        fn jetzt(&self) -> DateTime<Utc> {
            *self.0.lock().unwrap()
        }
    }

    /// Zustand ohne Netz: Jede Anfrage scheitert wie ohne Verbindung.
    fn zustand(ordner: &Path, uhr: &Stelluhr) -> Zustand {
        zustand_mit(ordner, uhr, &FakeSuite::offline(), Box::new(Speichertresor::default()))
    }

    pub(crate) fn zustand_mit(ordner: &Path, uhr: &Stelluhr, suite: &FakeSuite, tresor: Box<dyn Tresor>) -> Zustand {
        let teile = Anbindungsteile { transport: Box::new(suite.clone()), tresor };
        let mut z = Zustand::beim_start(ordner.to_path_buf(), Box::new(uhr.clone()), teile);
        z.suite_vorgabe = SUITE.into();
        z
    }

    // -----------------------------------------------------------------------------------------
    // Fakes: Suite, Browser, Tresor
    // -----------------------------------------------------------------------------------------

    pub(crate) const SUITE: &str = "https://suite.example";
    /// Suite eines Testrechners — frei wählbar, hier bewusst nicht die Vorgabe.
    pub(crate) const TEST_SUITE: &str = "http://einsatzbuch.localtest.me:3000";
    const ETAG: &str = "\"7/Europe/Berlin\"";
    /// Ein zweiter, gültiger P-256-Schlüssel (nur öffentlich) für „anderer Schlüssel“.
    const ANDERES_SPKI: &str = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE0BXL1murjdWkhY6MzCkpMdo5/V6FKP2WoWn12CikLSWCRq8+D7a+DWq+/dRDrmeNwgzY2OeentWzmfy0eqOUdQ==";

    /// Eine aufgezeichnete Anfrage, mit eigenen Strings und dem Körper als JSON.
    #[derive(Debug, Clone)]
    pub(crate) struct Aufgezeichnet {
        pub(crate) methode: &'static str,
        pub(crate) url: String,
        pub(crate) bearer: Option<String>,
        pub(crate) if_none_match: Option<String>,
        pub(crate) json: Option<Value>,
    }

    impl Aufgezeichnet {
        /// Der Pfad unterhalb von `/m/einsatzbuch`, gleich auf welchem Host, ohne Abfrage
        /// (`?erster=…` bei `GET /api/anker`).
        pub(crate) fn pfad(&self) -> &str {
            let pfad = self.url.split_once("/m/einsatzbuch").map_or("", |(_, pfad)| pfad);
            pfad.split_once('?').map_or(pfad, |(ohne, _)| ohne)
        }
    }

    type Skript = Arc<dyn Fn(&Aufgezeichnet) -> Result<Antwort, String> + Send + Sync>;

    /// Die Suite als Fake: zeichnet jede Anfrage auf und antwortet nach einem austauschbaren
    /// Skript. Klone teilen Aufzeichnung und Skript — einer steckt im Zustand, einer im Test.
    #[derive(Clone)]
    pub(crate) struct FakeSuite {
        anfragen: Arc<Mutex<Vec<Aufgezeichnet>>>,
        skript: Arc<Mutex<Skript>>,
    }

    impl FakeSuite {
        pub(crate) fn neu(skript: impl Fn(&Aufgezeichnet) -> Result<Antwort, String> + Send + Sync + 'static) -> FakeSuite {
            FakeSuite { anfragen: Arc::default(), skript: Arc::new(Mutex::new(Arc::new(skript))) }
        }

        /// Antwortet wie eine gesunde Suite.
        pub(crate) fn gesund() -> FakeSuite {
            FakeSuite::neu(gesunde_suite)
        }

        fn offline() -> FakeSuite {
            FakeSuite::neu(|_| Err("keine Verbindung".into()))
        }

        pub(crate) fn setze(&self, skript: impl Fn(&Aufgezeichnet) -> Result<Antwort, String> + Send + Sync + 'static) {
            *self.skript.lock().unwrap() = Arc::new(skript);
        }

        pub(crate) fn anfragen(&self) -> Vec<Aufgezeichnet> {
            self.anfragen.lock().unwrap().clone()
        }

        pub(crate) fn leere(&self) {
            self.anfragen.lock().unwrap().clear();
        }

        fn nach_pfad(&self, pfad: &str) -> Vec<Aufgezeichnet> {
            self.anfragen().into_iter().filter(|a| a.pfad() == pfad).collect()
        }
    }

    impl Transport for FakeSuite {
        fn sende(&self, a: Anfrage<'_>) -> Result<Antwort, String> {
            let aufgezeichnet = Aufgezeichnet {
                methode: a.methode,
                url: a.url,
                bearer: a.bearer.map(str::to_string),
                if_none_match: a.if_none_match.map(str::to_string),
                json: a.json.map(|j| serde_json::from_str(&j).expect("Anfragekörper ist JSON")),
            };
            let skript = self.skript.lock().unwrap().clone();
            self.anfragen.lock().unwrap().push(aufgezeichnet.clone());
            skript(&aufgezeichnet)
        }
    }

    pub(crate) fn antwort(status: u16, koerper: &str) -> Result<Antwort, String> {
        Ok(Antwort { status, etag: None, koerper: koerper.to_string() })
    }

    pub(crate) fn fehler(status: u16, code: &str, meldung: &str) -> Result<Antwort, String> {
        antwort(status, &json!({ "error": { "code": code, "message": meldung } }).to_string())
    }

    fn fixture(datei: &str) -> Value {
        let pfad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../src/app/m/einsatzbuch/_lib/anbindung/vertrag")
            .join(datei);
        serde_json::from_str(&std::fs::read_to_string(&pfad).unwrap_or_else(|e| panic!("{}: {e}", pfad.display()))).unwrap()
    }

    /// Antwort auf `einrichten` aus der Fixture, mit Art und Name der Anfrage.
    fn einrichten_antwort(a: &Aufgezeichnet, rechner_id: &str, token: &str) -> Value {
        let mut e = fixture("einrichten.json");
        let anfrage = a.json.as_ref().unwrap();
        e["art"] = anfrage["art"].clone();
        e["name"] = anfrage["name"].clone();
        e["rechnerId"] = json!(rechner_id);
        e["geraeteToken"] = json!(token);
        e
    }

    /// Eine Suite, die jede Anfrage wie vorgesehen beantwortet. Der Tausch bindet die Sitzung an
    /// `r-alt`, wenn ein Geräte-Token mitkommt (Entscheidung 2).
    pub(crate) fn gesunde_suite(a: &Aufgezeichnet) -> Result<Antwort, String> {
        match (a.methode, a.pfad()) {
            ("POST", "/api/anmelden/tausch") => antwort(
                200,
                &json!({
                    "sitzungstoken": "sitzung-1",
                    "name": "Jana Albers",
                    "ablauf": "2026-09-24T12:00:00+02:00",
                    "rechnerId": a.bearer.as_ref().map(|_| "r-alt"),
                    "einrichtung": null,
                })
                .to_string(),
            ),
            ("POST", "/api/einrichten") => antwort(200, &einrichten_antwort(a, "r-neu", "geraet-neu").to_string()),
            ("GET", "/api/stammdaten") => antwort(304, ""),
            ("POST", "/api/anker") => antwort(204, ""),
            ("POST", "/api/sicherung") => antwort(204, ""),
            ("POST", "/api/schluessel/freigeben") => {
                let posten: Vec<Value> = a.json.as_ref().unwrap().as_array().unwrap().iter()
                    .map(|p| json!({ "block": p["kopf"]["block"], "cek": format!("cek{}", p["kopf"]["block"]) }))
                    .collect();
                antwort(200, &Value::Array(posten).to_string())
            }
            ("DELETE", _) => antwort(204, ""),
            (m, p) => panic!("unerwartete Anfrage {m} {p}"),
        }
    }

    /// Liest `port` und `state` aus der Anmelde-URL.
    fn port_und_state(url: &str) -> (u16, String) {
        let abfrage = url.split_once('?').expect("Anmelde-URL mit Abfrage").1;
        let wert = |schluessel: &str| {
            abfrage.split('&').find_map(|p| p.strip_prefix(&format!("{schluessel}="))).map(str::to_string)
        };
        (wert("port").unwrap().parse().unwrap(), wert("state").unwrap())
    }

    pub(crate) fn abfragewert(url: &str, schluessel: &str) -> Option<String> {
        url.split_once('?')?.1.split('&').find_map(|p| p.strip_prefix(&format!("{schluessel}="))).map(str::to_string)
    }

    /// Ein Browser als Thread: liest Port und `state` aus der URL und ruft selbst
    /// `GET 127.0.0.1:<port>/rueckruf?<rueckgabe>&state=…` auf. Merkt sich jede URL.
    pub(crate) struct Browser {
        pub(crate) urls: Arc<Mutex<Vec<String>>>,
        rueckgabe: Option<&'static str>,
    }

    impl Browser {
        /// Meldet `code=c` zurück.
        pub(crate) fn neu() -> Browser {
            Browser { urls: Arc::default(), rueckgabe: Some("code=c") }
        }
        fn mit(rueckgabe: &'static str) -> Browser {
            Browser { urls: Arc::default(), rueckgabe: Some(rueckgabe) }
        }
        /// Öffnet die Seite und kommt nie zurück.
        fn stumm() -> Browser {
            Browser { urls: Arc::default(), rueckgabe: None }
        }

        pub(crate) fn oeffne(&self, url: &str) -> Result<(), String> {
            self.urls.lock().unwrap().push(url.to_string());
            let Some(rueckgabe) = self.rueckgabe else { return Ok(()) };
            let (port, state) = port_und_state(url);
            std::thread::spawn(move || {
                let mut strom = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(strom, "GET /rueckruf?{rueckgabe}&state={state} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
                let mut antwort = String::new();
                let _ = strom.read_to_string(&mut antwort);
            });
            Ok(())
        }

        pub(crate) fn letzte_url(&self) -> String {
            self.urls.lock().unwrap().last().cloned().expect("eine URL wurde geöffnet")
        }
    }

    /// Ein Tresor, der das Schreiben verweigert — etwa ein gesperrter Schlüsselbund.
    #[derive(Default)]
    struct GesperrterTresor(Speichertresor);

    impl Tresor for GesperrterTresor {
        fn lies(&self, konto: &str) -> Result<Option<String>, String> {
            self.0.lies(konto)
        }
        fn schreibe(&self, _konto: &str, _wert: &str) -> Result<(), String> {
            Err("Der Schlüsselbund ist gesperrt.".into())
        }
        fn loesche(&self, konto: &str) -> Result<(), String> {
            self.0.loesche(konto)
        }
    }

    fn keine_datei(ordner: &Path) {
        for datei in ["einsatzbuch.db", "einsatzbuch-test.db", "einsatzbuch.db-wal", "einsatzbuch-test.db-wal"] {
            assert!(!ordner.join(datei).exists(), "{datei} darf nicht liegen bleiben");
        }
    }

    fn kein_token(z: &Zustand) {
        assert_eq!(z.tresor.lies("geraetetoken-test").unwrap(), None);
        assert_eq!(z.tresor.lies("geraetetoken-echt").unwrap(), None);
    }

    /// Richtet einen Testrechner über die gesunde Fake-Suite ein.
    pub(crate) fn eingerichteter_testrechner(ordner: &Path, uhr: &Stelluhr) -> (Zustand, FakeSuite) {
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner, uhr, &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();
        richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop Küche", TEST_SUITE, &|u| browser.oeffne(u)).unwrap();
        suite.leere();
        (z, suite)
    }

    pub(crate) fn eingerichteter_echter_rechner(ordner: &Path, uhr: &Stelluhr) -> (Zustand, FakeSuite) {
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner, uhr, &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();
        richte_ein_ueber_suite(&z, Umgebung::Echt, "Einsatzleitung", SUITE, &|u| browser.oeffne(u)).unwrap();
        suite.leere();
        (z, suite)
    }

    /// Ein Entwurf mit den IDs aus `vertrag/einrichten.json`.
    fn entwurf_suite() -> Entwurf {
        Entwurf {
            fahrzeuge: vec!["S30b2bswU8FPOqS6jgF5B".into()],
            personal: vec![PersonAuswahl { id: "_gH6Ga_FOiqlRTSmEoT1c".into(), fahrzeug_id: Some("S30b2bswU8FPOqS6jgF5B".into()) }],
            ..entwurf()
        }
    }

    pub(crate) fn versiegele_einen(z: &Zustand) -> Versiegelung {
        sende_ab(z, &entwurf_suite(), false).unwrap();
        let v = versiegele_jetzt(z).unwrap();
        quittiere(z).unwrap();
        v
    }

    /// Wartet großzügig, bis `bedingung` gilt — die Maschine kann stark belastet sein.
    pub(crate) fn warte_bis(mut bedingung: impl FnMut() -> bool) {
        let ende = Instant::now() + std::time::Duration::from_secs(30);
        while !bedingung() {
            assert!(Instant::now() < ende, "Bedingung trat binnen 30 s nicht ein");
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    }

    fn entwurf() -> Entwurf {
        Entwurf {
            stichwort: "RD 1".into(),
            beginn_datum: "2026-09-24".into(),
            beginn_zeit: "10:00".into(),
            ende_datum: String::new(),
            ende_zeit: String::new(),
            strasse: String::new(),
            ort: "Uelzen".into(),
            objekt: String::new(),
            fahrzeuge: vec!["11-83-1".into()],
            personal: vec![PersonAuswahl { id: "p4".into(), fahrzeug_id: Some("11-83-1".into()) }],
            vor_ort: 1,
            transport: 0,
            notizen: String::new(),
        }
    }

    #[test]
    fn fehlende_felder_werden_als_liste_gemeldet() {
        let e = ErfassungFehler::Fehlt(vec!["Alarmstichwort", "Beginn"]);
        assert_eq!(fehler_text(e), "Fehlt: Alarmstichwort, Beginn");
    }

    /// Review M6: Eine unlesbare unquittierte Versiegelung blockiert den Status nicht, auch nicht
    /// beim zweiten Lesen.
    #[test]
    fn status_trotz_unlesbarer_unquittierter_versiegelung() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        z.buch().as_ref().unwrap().verbindung().execute("INSERT INTO unquittiert (id, json) VALUES (1, '{kaputt')", []).unwrap();
        assert_eq!(lies_status(&z).unwrap().versiegelung, None);
        assert_eq!(lies_status(&z).unwrap().versiegelung, None);
    }

    #[test]
    fn status_ohne_buch_ist_nicht_eingerichtet() {
        let ordner = tempfile::tempdir().unwrap();
        let z = zustand(ordner.path(), &Stelluhr::neu());
        let s = lies_status(&z).unwrap();
        assert_eq!(s.betrieb, None);
        assert!(!s.eingerichtet);
        assert!(s.entwicklung);
        assert_eq!(s.jetzt, "2026-09-24T08:00:00+00:00");
        assert_eq!(s.kette, Kettenstand { anzahl: 0, letzter: None });
        assert_eq!(lies_stammdaten(&z).unwrap_err(), NICHT_EINGERICHTET);
        let json = serde_json::to_value(&s).unwrap();
        assert!(json.get("fristMinuten").is_some() && json.get("jetztMs").is_some(), "{json}");
    }

    #[test]
    fn testbetrieb_beenden_laesst_ein_echtes_buch_im_zustand() {
        let ordner = tempfile::tempdir().unwrap();
        drop(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap());
        let z = zustand(ordner.path(), &Stelluhr::neu());
        assert!(beende_testbetrieb(&z).is_err());
        assert!(z.buch().is_some(), "das echte Buch darf nicht aus dem Zustand verschwinden");
        assert!(ordner.path().join("einsatzbuch.db").exists());

        let leer = tempfile::tempdir().unwrap();
        assert_eq!(beende_testbetrieb(&zustand(leer.path(), &Stelluhr::neu())).unwrap_err(), NICHT_EINGERICHTET);
    }

    #[test]
    fn entwicklerweg_absenden_versiegeln_quittieren_beenden() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let z = zustand(ordner.path(), &uhr);
        richte_entwicklung_ein(&z, None, Some(500)).unwrap();
        assert!(richte_entwicklung_ein(&z, None, None).is_err(), "zweimal einrichten geht nicht");

        let s = lies_status(&z).unwrap();
        assert_eq!(s.betrieb, Some(Betrieb::Test));
        assert!(s.eingerichtet);
        assert_eq!(s.frist_minuten, Some(120), "die Frist wird auf 120 geklemmt");
        assert_eq!(s.jetzt, "2026-09-24T10:00:00+02:00");
        assert_eq!(lies_stammdaten(&z).unwrap().stammdaten.personal.len(), 112);

        assert_eq!(versiegele_jetzt(&z).unwrap_err(), NICHTS_AUSSTEHEND);
        let mut unvollstaendig = entwurf();
        unvollstaendig.stichwort.clear();
        assert_eq!(sende_ab(&z, &unvollstaendig, false).unwrap_err(), "Fehlt: Alarmstichwort");

        sende_ab(&z, &entwurf(), false).unwrap();
        let v = versiegele_jetzt(&z).unwrap();
        assert_eq!(v.nummer, "T-2026-001");
        assert!(!v.verfallen);
        let s = lies_status(&z).unwrap();
        assert_eq!(s.versiegelung, Some(v.clone()));
        assert_eq!(s.kette, Kettenstand { anzahl: 1, letzter: Some(Kettenglied { block: 1, hash: v.hash.clone() }) });
        assert!(s.ausstehend.is_none());

        quittiere(&z).unwrap();
        assert_eq!(lies_status(&z).unwrap().versiegelung, None);

        beende_testbetrieb(&z).unwrap();
        assert!(z.buch().is_none());
        assert_eq!(buch::erkenne_betrieb(ordner.path()).unwrap(), None);
        assert!(!ordner.path().join("einsatzbuch.db").exists(), "keine echte Datei als Nebenwirkung");
    }

    #[test]
    fn frist_versiegelt_ueber_den_zustand_und_meldet_verfallen() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let z = zustand(ordner.path(), &uhr);
        richte_entwicklung_ein(&z, None, Some(15)).unwrap();
        sende_ab(&z, &entwurf(), false).unwrap();
        speichere_entwurf(&z, &entwurf(), true).unwrap();

        uhr.vor(Duration::minutes(14));
        assert_eq!(pruefe_frist_jetzt(&z).unwrap(), None);
        uhr.vor(Duration::minutes(1));
        let v = pruefe_frist_jetzt(&z).unwrap().expect("Frist erreicht");
        assert!(v.verfallen, "ein ungespeicherter Formularstand verfällt");
        // Ein zweiter Aufruf liefert dieselbe, noch nicht quittierte Versiegelung.
        assert_eq!(pruefe_frist_jetzt(&z).unwrap(), Some(v));
    }

    #[test]
    fn bearbeitung_nach_fristende_meldet_frist_abgelaufen() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let z = zustand(ordner.path(), &uhr);
        richte_entwicklung_ein(&z, None, Some(15)).unwrap();
        sende_ab(&z, &entwurf(), false).unwrap();
        uhr.vor(Duration::minutes(15));

        let meldung = "Die Frist ist abgelaufen. Versiegelt wird der zuletzt abgesendete Stand.";
        assert_eq!(sende_ab(&z, &entwurf(), true).unwrap_err(), meldung);
        assert_eq!(speichere_entwurf(&z, &entwurf(), true).unwrap_err(), meldung);
        let v = pruefe_frist_jetzt(&z).unwrap().expect("Frist erreicht");
        assert!(!v.verfallen, "abgelehnte Bearbeitungen hinterlassen keinen Entwurf");
        assert!(lies_status(&z).unwrap().ausstehend.is_none());
    }

    #[test]
    fn ein_vergifteter_mutex_haelt_die_app_nicht_an() {
        let ordner = tempfile::tempdir().unwrap();
        let z = Arc::new(zustand(ordner.path(), &Stelluhr::neu()));
        let z2 = Arc::clone(&z);
        let _ = std::thread::spawn(move || {
            let _halten = z2.buch();
            panic!("absichtlich, um den Mutex zu vergiften");
        })
        .join();
        assert!(z.buch.is_poisoned());
        assert!(lies_status(&z).is_ok());
        assert_eq!(z.pruefe_frist().unwrap(), None);
    }

    #[test]
    fn kaputte_datei_wird_startfehler_und_bleibt_unberuehrt() {
        let ordner = tempfile::tempdir().unwrap();
        let datei = ordner.path().join("einsatzbuch-test.db");
        let muell: Vec<u8> = (0..4096u32).map(|i| (i * 37 % 251) as u8).collect();
        std::fs::write(&datei, &muell).unwrap();

        let z = zustand(ordner.path(), &Stelluhr::neu());
        let fehler = z.startfehler().clone().expect("kaputte Datei muss ein Startfehler sein");
        assert!(fehler.starts_with("Die Datenbank dieses Rechners ließ sich nicht öffnen"), "{fehler}");
        assert!(z.buch().is_none());

        let s = lies_status(&z).unwrap();
        assert_eq!(s.startfehler.as_deref(), Some(fehler.as_str()));
        assert!(!s.eingerichtet);
        assert_eq!(serde_json::to_value(&s).unwrap()["startfehler"], fehler.as_str());

        assert_eq!(lies_stammdaten(&z).unwrap_err(), fehler);
        assert_eq!(speichere_entwurf(&z, &entwurf(), false).unwrap_err(), fehler);
        assert_eq!(verwirf_entwurf(&z).unwrap_err(), fehler);
        assert_eq!(sende_ab(&z, &entwurf(), false).unwrap_err(), fehler);
        assert_eq!(versiegele_jetzt(&z).unwrap_err(), fehler);
        assert_eq!(pruefe_frist_jetzt(&z).unwrap_err(), fehler);
        assert_eq!(beende_testbetrieb(&z).unwrap_err(), fehler);
        assert_eq!(richte_entwicklung_ein(&z, None, None).unwrap_err(), fehler);
        assert_eq!(z.pruefe_frist().unwrap(), None, "die Frist-Uhr fasst ohne Buch nichts an");

        assert_eq!(std::fs::read(&datei).unwrap(), muell, "die kaputte Datei muss byte-gleich bleiben");
    }

    #[test]
    fn jetzt_versiegeln_nach_der_frist_uhr_liefert_deren_versiegelung() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let z = zustand(ordner.path(), &uhr);
        richte_entwicklung_ein(&z, None, Some(15)).unwrap();
        sende_ab(&z, &entwurf(), false).unwrap();
        uhr.vor(Duration::minutes(15));
        let aus_der_uhr = z.pruefe_frist().unwrap().expect("Frist erreicht");
        assert_eq!(versiegele_jetzt(&z).unwrap(), aus_der_uhr);
        quittiere(&z).unwrap();
        assert_eq!(versiegele_jetzt(&z).unwrap_err(), NICHTS_AUSSTEHEND);
    }

    #[test]
    fn gescheitertes_testbetrieb_beenden_legt_das_buch_zurueck() {
        let ordner = tempfile::tempdir().unwrap();
        let z = zustand(ordner.path(), &Stelluhr::neu());
        richte_entwicklung_ein(&z, None, None).unwrap();
        // Eine zweite Verbindung mit offener Lesetransaktion lässt den WAL-Checkpoint in
        // `beende_testbetrieb` scheitern.
        let fremd = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
        fremd.verbindung().execute_batch("BEGIN; SELECT count(*) FROM bloecke;").unwrap();

        assert!(beende_testbetrieb(&z).is_err());
        assert_eq!(z.buch().as_ref().map(|b| b.betrieb()), Some(Betrieb::Test), "das Buch muss zurückliegen");
        assert_eq!(*z.startfehler(), None);
        assert!(lies_status(&z).unwrap().eingerichtet);

        fremd.verbindung().execute_batch("COMMIT;").unwrap();
        drop(fremd);
        beende_testbetrieb(&z).unwrap();
        assert!(z.buch().is_none());
    }

    // -----------------------------------------------------------------------------------------
    // Einrichtung über die Suite
    // -----------------------------------------------------------------------------------------

    #[test]
    fn einrichten_als_testrechner_legt_buch_und_token_an() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();

        let ergebnis =
            richte_ein_ueber_suite(&z, Umgebung::Test, "  Laptop Küche ", &format!("{TEST_SUITE}/"), &|u| browser.oeffne(u)).unwrap();
        assert_eq!(ergebnis, Einrichtungsergebnis { echt: false });
        assert!(!autostart_einschalten(&ergebnis));

        assert!(ordner.path().join("einsatzbuch-test.db").exists());
        assert!(!ordner.path().join("einsatzbuch.db").exists());
        let anbindung = z.buch().as_ref().unwrap().anbindung().unwrap().unwrap();
        assert_eq!(anbindung.rechner_id, "r-neu", "die Rechnerkennung stammt aus der Antwort");
        assert_eq!(anbindung.rechner_name, "Laptop Küche");
        assert_eq!(z.tresor.lies("geraetetoken-test").unwrap().as_deref(), Some("geraet-neu"));
        assert_eq!(z.tresor.lies("geraetetoken-echt").unwrap(), None);

        // Die Anmelde-URL trägt Art und getrimmten Namen; die Suite-Adresse ohne Schrägstrich.
        let url = browser.letzte_url();
        assert!(url.starts_with("http://einsatzbuch.localtest.me:3000/m/einsatzbuch/anmelden?port="), "{url}");
        assert_eq!(abfragewert(&url, "art").as_deref(), Some("test"));
        assert_eq!(abfragewert(&url, "name").as_deref(), Some("Laptop%20K%C3%BCche"));

        // PKCE: Der Tausch schickt den Verifier, dessen SHA-256 die Challenge der URL ist; bei der
        // Einrichtung geht kein Geräte-Token mit.
        let tausch = &suite.nach_pfad("/api/anmelden/tausch")[0];
        assert_eq!(tausch.bearer, None);
        let koerper = tausch.json.as_ref().unwrap();
        assert_eq!(koerper["code"], "c");
        let verifier = koerper["verifier"].as_str().unwrap();
        assert_eq!(Some(challenge_zu(verifier)), abfragewert(&url, "challenge"));

        let einrichten = &suite.nach_pfad("/api/einrichten")[0];
        assert_eq!(einrichten.bearer.as_deref(), Some("sitzung-1"));
        assert_eq!(einrichten.json, Some(json!({ "art": "test", "name": "Laptop Küche" })));

        let s = lies_status(&z).unwrap();
        assert_eq!(s.betrieb, Some(Betrieb::Test));
        assert!(s.eingerichtet);
        assert_eq!(s.suite_url.as_deref(), Some(TEST_SUITE));
        assert_eq!(s.rechner_name.as_deref(), Some("Laptop Küche"));
        assert_eq!(s.schluessel_id.as_deref(), Some("8cedd95d94246a4d"));
        assert_eq!(s.eingerichtet_von.as_deref(), fixture("einrichten.json")["eingerichtetVon"].as_str());
        assert_eq!(s.stammdaten_vom, s.eingerichtet_am, "bis zum ersten Abgleich stammt das Paket von der Einrichtung");
        assert_eq!(s.sitzung, Some(SitzungInfo { name: "Jana Albers".into(), ablauf_ms: 1_790_244_000_000 }));
        assert!(!s.anmeldung_laeuft);
        assert!(!s.widerrufen);
    }

    #[test]
    fn echter_rechner_nur_mit_der_vorgabe_und_mit_autostart_nur_im_release() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();

        let fehler = richte_ein_ueber_suite(&z, Umgebung::Echt, "Einsatzleitung", "https://andere.example", &|u| browser.oeffne(u))
            .unwrap_err();
        assert!(fehler.contains(SUITE), "{fehler}");
        assert!(browser.urls.lock().unwrap().is_empty(), "ohne passende Adresse öffnet sich kein Browser");
        assert!(suite.anfragen().is_empty());

        let ergebnis =
            richte_ein_ueber_suite(&z, Umgebung::Echt, "Einsatzleitung", &format!("{SUITE}/"), &|u| browser.oeffne(u)).unwrap();
        assert_eq!(ergebnis, Einrichtungsergebnis { echt: true });
        assert_eq!(autostart_einschalten(&ergebnis), !cfg!(debug_assertions));
        assert!(!autostart_einschalten(&ergebnis), "Tests laufen im Debug-Profil: nie Autostart");
        assert!(!autostart_einschalten(&Einrichtungsergebnis { echt: false }));
        assert!(ordner.path().join("einsatzbuch.db").exists());
        assert_eq!(z.tresor.lies("geraetetoken-echt").unwrap().as_deref(), Some("geraet-neu"));
        assert!(browser.letzte_url().starts_with("https://suite.example/m/einsatzbuch/anmelden?"));
        assert_eq!(abfragewert(&browser.letzte_url(), "art").as_deref(), Some("echt"));
    }

    #[test]
    fn test_adresse_ist_frei_aber_muss_http_sein_und_der_name_1_bis_60_zeichen() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();
        let oeffne = |u: &str| browser.oeffne(u);
        assert_eq!(richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", "ftp://x", &oeffne).unwrap_err(), ADRESSE_UNGUELTIG);
        assert_eq!(richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", "", &oeffne).unwrap_err(), ADRESSE_UNGUELTIG);
        assert_eq!(richte_ein_ueber_suite(&z, Umgebung::Test, "   ", TEST_SUITE, &oeffne).unwrap_err(), NAME_UNGUELTIG);
        assert_eq!(richte_ein_ueber_suite(&z, Umgebung::Test, &"ä".repeat(61), TEST_SUITE, &oeffne).unwrap_err(), NAME_UNGUELTIG);
        assert!(suite.anfragen().is_empty());
        richte_ein_ueber_suite(&z, Umgebung::Test, &"ä".repeat(60), "https://irgendeine.example", &oeffne).unwrap();
        assert_eq!(lies_status(&z).unwrap().suite_url.as_deref(), Some("https://irgendeine.example"));
        assert_eq!(richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &oeffne).unwrap_err(), SCHON_EINGERICHTET);
    }

    /// Review Focus 3: Scheitert die Suite, bleibt weder Datei noch Tresor-Eintrag zurück, und die
    /// Einrichtungsfrage erscheint wieder — ein zweiter Versuch gelingt.
    #[test]
    fn scheitert_die_suite_bleibt_nichts_zurueck() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::neu(|a| match a.pfad() {
            "/api/einrichten" => fehler(422, "stammdaten_zu_lang", "ruf bei „11-83-1“ ist zu lang."),
            _ => gesunde_suite(a),
        });
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();

        let fehler = richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert_eq!(fehler, "ruf bei „11-83-1“ ist zu lang.");
        keine_datei(ordner.path());
        kein_token(&z);
        let s = lies_status(&z).unwrap();
        assert!(!s.eingerichtet && s.betrieb.is_none() && !s.anmeldung_laeuft && s.sitzung.is_none(), "{s:?}");

        suite.setze(gesunde_suite);
        richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap();
        assert!(lies_status(&z).unwrap().eingerichtet);
    }

    #[test]
    fn scheitert_der_tresor_bleibt_nichts_zurueck_und_der_testrechner_wird_geloescht() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(GesperrterTresor::default()));
        let browser = Browser::neu();

        let fehler = richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert_eq!(fehler, "Der Schlüsselbund ist gesperrt.");
        keine_datei(ordner.path());
        kein_token(&z);
        assert!(!lies_status(&z).unwrap().eingerichtet);
        assert!(lies_status(&z).unwrap().sitzung.is_none());
        // Die Suite hat den Test-Rechner schon angelegt; die App räumt ihn nach Kräften ab.
        let geloescht = suite.anfragen().into_iter().find(|a| a.methode == "DELETE").expect("DELETE des halben Test-Rechners");
        assert_eq!(geloescht.pfad(), "/api/rechner/r-neu");
        assert_eq!(geloescht.bearer.as_deref(), Some("sitzung-1"));
    }

    #[test]
    fn scheitert_die_datenbank_bleibt_nichts_zurueck() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::neu(|a| match a.pfad() {
            "/api/einrichten" => {
                let mut e = einrichten_antwort(a, "r-neu", "geraet-neu");
                e["schluesselId"] = json!("0000000000000000");
                antwort(200, &e.to_string())
            }
            _ => gesunde_suite(a),
        });
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();

        let fehler = richte_ein_ueber_suite(&z, Umgebung::Echt, "Einsatzleitung", SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert!(fehler.contains("schluesselId"), "{fehler}");
        keine_datei(ordner.path());
        kein_token(&z);
        let s = lies_status(&z).unwrap();
        assert!(!s.eingerichtet && s.betrieb.is_none() && s.sitzung.is_none(), "{s:?}");
    }

    /// Scheitert schon das Öffnen der frisch angelegten Datei (hier: ein Verzeichnis, wo SQLite
    /// seine `-wal`-Datei anlegen will), bleibt die Datei nicht halb liegen.
    #[test]
    fn scheitert_das_oeffnen_bleibt_keine_datei_zurueck() {
        let ordner = tempfile::tempdir().unwrap();
        std::fs::create_dir(ordner.path().join("einsatzbuch-test.db-wal")).unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();
        assert!(richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).is_err());
        assert!(!ordner.path().join("einsatzbuch-test.db").exists(), "die halb angelegte Datei muss weg sein");
        kein_token(&z);
        assert!(!lies_status(&z).unwrap().eingerichtet);
    }

    #[test]
    fn echt_bei_testdatenbank_und_test_bei_echter_einrichtung_werden_abgelehnt() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::neu();
        richte_entwicklung_ein(&z, None, None).unwrap();
        let fehler = richte_ein_ueber_suite(&z, Umgebung::Echt, "Einsatzleitung", SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert_eq!(fehler, TESTBETRIEB_ERST_BEENDEN);
        assert!(browser.urls.lock().unwrap().is_empty() && suite.anfragen().is_empty());

        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let fehler = richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert_eq!(fehler, ECHT_VORHANDEN);
        assert!(suite.anfragen().is_empty());
        assert!(!ordner.path().join("einsatzbuch-test.db").exists());
    }

    #[test]
    fn kein_zugang_und_abbruch_in_der_suite() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default()));
        let browser = Browser::mit("fehler=kein_zugang");
        let fehler = richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert_eq!(fehler, KEIN_ZUGANG);
        let browser = Browser::mit("fehler=abgebrochen");
        let fehler = richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap_err();
        assert_eq!(fehler, ANMELDUNG_ABGEBROCHEN);
        assert!(suite.anfragen().is_empty(), "ohne Code kein Tausch");
        keine_datei(ordner.path());
        assert!(!lies_status(&z).unwrap().anmeldung_laeuft);
    }

    /// „Abbrechen“ in der App, während der Browser nie zurückkommt: Die Anmeldung läuft sichtbar,
    /// eine zweite wird abgelehnt, und nach dem Abbruch ist nichts angelegt. Kein Lock wird
    /// während des Wartens gehalten — sonst hinge `lies_status` hier.
    #[test]
    fn abbruch_waehrend_des_wartens() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::gesund();
        let z = Arc::new(zustand_mit(ordner.path(), &Stelluhr::neu(), &suite, Box::new(Speichertresor::default())));
        let z2 = Arc::clone(&z);
        let einrichtung = std::thread::spawn(move || {
            let browser = Browser::stumm();
            richte_ein_ueber_suite(&z2, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u))
        });
        warte_bis(|| lies_status(&z).unwrap().anmeldung_laeuft);
        let browser = Browser::neu();
        assert_eq!(melde_an(&z, &|u| browser.oeffne(u)).unwrap_err(), NICHT_EINGERICHTET);
        assert_eq!(
            richte_ein_ueber_suite(&z, Umgebung::Test, "Laptop", TEST_SUITE, &|u| browser.oeffne(u)).unwrap_err(),
            ANMELDUNG_LAEUFT
        );

        brich_anmeldung_ab(&z);
        assert_eq!(einrichtung.join().unwrap().unwrap_err(), ANMELDUNG_ABGEBROCHEN);
        assert!(!lies_status(&z).unwrap().anmeldung_laeuft);
        assert!(suite.anfragen().is_empty());
        keine_datei(ordner.path());
        kein_token(&z);
        brich_anmeldung_ab(&z); // ohne laufende Anmeldung ein No-op
    }

    // -----------------------------------------------------------------------------------------
    // Verwaltungsanmeldung, Sitzung, Freigabe
    // -----------------------------------------------------------------------------------------

    #[test]
    fn melde_an_bindet_das_geraetetoken_und_melde_ab_verwirft_die_sitzung() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        assert!(lies_status(&z).unwrap().sitzung.is_some());
        melde_ab(&z);
        assert!(z.sitzung().is_none());
        assert_eq!(lies_status(&z).unwrap().sitzung, None);

        let browser = Browser::neu();
        let info = melde_an(&z, &|u| browser.oeffne(u)).unwrap();
        assert_eq!(info.name, "Jana Albers");
        let url = browser.letzte_url();
        assert!(url.starts_with("http://einsatzbuch.localtest.me:3000/m/einsatzbuch/anmelden?"), "{url}");
        assert_eq!(abfragewert(&url, "art"), None, "die Verwaltungsanmeldung richtet nichts ein");
        let tausch = &suite.nach_pfad("/api/anmelden/tausch")[0];
        assert_eq!(tausch.bearer.as_deref(), Some("geraet-neu"), "das Geräte-Token bindet die Sitzung an den Rechner");
        assert_eq!(z.sitzung().as_ref().unwrap().rechner_id.as_deref(), Some("r-alt"));
        assert_eq!(lies_status(&z).unwrap().sitzung, Some(info));

        melde_ab(&z);
        assert!(z.sitzung().is_none());
    }

    #[test]
    fn freigabe_ohne_oder_mit_abgelaufener_sitzung_wird_abgelehnt() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &uhr);
        versiegele_einen(&z);
        melde_ab(&z);
        assert_eq!(gib_schluessel_frei(&z, None).unwrap_err(), SITZUNG_ABGELAUFEN);

        let browser = Browser::neu();
        melde_an(&z, &|u| browser.oeffne(u)).unwrap();
        suite.leere();
        uhr.vor(Duration::hours(2)); // Ablauf 10:00 UTC erreicht
        assert_eq!(gib_schluessel_frei(&z, None).unwrap_err(), SITZUNG_ABGELAUFEN);
        assert!(z.sitzung().is_none(), "eine abgelaufene Sitzung wird verworfen");
        assert!(suite.anfragen().is_empty());
    }

    #[test]
    fn freigabe_liefert_schluessel_und_offline_braucht_verbindung() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        versiegele_einen(&z);
        let schluessel = gib_schluessel_frei(&z, None).unwrap();
        assert_eq!(schluessel.iter().map(|s| s.block).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(schluessel[0].cek, "cek1");
        let freigabe = &suite.nach_pfad("/api/schluessel/freigeben")[0];
        assert_eq!(freigabe.bearer.as_deref(), Some("sitzung-1"));
        assert_eq!(freigabe.url, "http://einsatzbuch.localtest.me:3000/m/einsatzbuch/api/schluessel/freigeben");
        assert_eq!(lies_bloecke(&z).unwrap().len(), 2);

        suite.setze(|_| Err("keine Verbindung".into()));
        assert_eq!(gib_schluessel_frei(&z, None).unwrap_err(), LESEN_BRAUCHT_VERBINDUNG);
        assert!(z.sitzung().is_some(), "offline bleibt die Sitzung");

        // Die Suite kennt die Sitzung nicht mehr (etwa nach Widerruf): verwerfen, neu anmelden.
        suite.setze(|_| fehler(401, "sitzung_ungueltig", "Die Sitzung ist ungültig."));
        assert_eq!(gib_schluessel_frei(&z, None).unwrap_err(), SITZUNG_ABGELAUFEN);
        assert!(z.sitzung().is_none());
    }

    /// Stufe 6, Entscheidung 9: „einzeln“ beim Export gibt nur den gewählten Block frei, und die
    /// Audit-Zeile der Suite nennt nur ihn.
    #[test]
    fn freigabe_mit_blockliste_fragt_nur_die_genannten_bloecke_an() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        versiegele_einen(&z);
        versiegele_einen(&z);
        let schluessel = gib_schluessel_frei(&z, Some(&[2])).unwrap();
        assert_eq!(schluessel.iter().map(|s| s.block).collect::<Vec<_>>(), [2]);
        assert_eq!(schluessel[0].cek, "cek2");
        let freigabe = &suite.nach_pfad("/api/schluessel/freigeben")[0];
        let angefragt = freigabe.json.as_ref().unwrap().as_array().unwrap();
        assert_eq!(angefragt.len(), 1, "nur Block 2 geht in die Anfrage, {angefragt:?}");
        assert_eq!(angefragt[0]["kopf"]["block"], 2);
    }

    /// Eine doppelt genannte Blocknummer geht nur einmal in die Anfrage — sonst nennt die Suite
    /// „andere Blöcke als angefragt“, weil sie dieselbe Nummer nicht zweimal freigibt.
    #[test]
    fn freigabe_mit_doppelter_blocknummer_fragt_nur_einmal_an() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        versiegele_einen(&z);
        let schluessel = gib_schluessel_frei(&z, Some(&[2, 2])).unwrap();
        assert_eq!(schluessel.iter().map(|s| s.block).collect::<Vec<_>>(), [2]);
        let freigabe = &suite.nach_pfad("/api/schluessel/freigeben")[0];
        assert_eq!(freigabe.json.as_ref().unwrap().as_array().unwrap().len(), 1);
    }

    /// Eine unbekannte Blocknummer wird gegen die lokale Kette geprüft, bevor überhaupt eine
    /// Anfrage entsteht.
    #[test]
    fn freigabe_mit_unbekannter_blocknummer_scheitert_ohne_anfrage() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        assert_eq!(gib_schluessel_frei(&z, Some(&[7])).unwrap_err(), "Block 7 gibt es auf diesem Rechner nicht.");
        assert!(suite.anfragen().is_empty(), "eine unbekannte Nummer darf keine Anfrage auslösen");
    }

    /// Review Focus 4: Hinter einem Proxy ist ein 5xx ohne lesbaren Körper „die Suite läuft
    /// nicht“ — das ist fehlende Verbindung. Ein 503 der Suite selbst behält seine Meldung.
    #[test]
    fn freigabe_bei_5xx_eines_proxys_braucht_verbindung_bei_5xx_der_suite_ihre_meldung() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        for status in [500, 502, 503, 504] {
            suite.setze(move |_| antwort(status, "<html>Bad Gateway</html>"));
            assert_eq!(gib_schluessel_frei(&z, None).unwrap_err(), LESEN_BRAUCHT_VERBINDUNG, "HTTP {status}");
            assert!(z.sitzung().is_some(), "HTTP {status}: die Sitzung bleibt");
        }
        suite.setze(|_| fehler(503, "kek_fehlt", "Der Schlüssel der Suite fehlt. Bitte wende dich an die Verwaltung."));
        assert_eq!(gib_schluessel_frei(&z, None).unwrap_err(), "Der Schlüssel der Suite fehlt. Bitte wende dich an die Verwaltung.");
    }

    #[test]
    fn sitzung_schwaerzt_das_token_im_debug() {
        let s = Sitzung { token: Zeroizing::new("GEHEIMES-TOKEN".into()), name: "Jana".into(), ablauf_ms: 1, rechner_id: None };
        let text = format!("{s:?}");
        assert!(!text.contains("GEHEIMES-TOKEN") && text.contains("Jana"), "{text}");
    }

    // -----------------------------------------------------------------------------------------
    // Testbetrieb beenden, neu einrichten
    // -----------------------------------------------------------------------------------------

    #[test]
    fn testbetrieb_beenden_mit_sitzung_loescht_den_rechner_in_der_suite() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        beende_testbetrieb(&z).unwrap();
        let geloescht: Vec<_> = suite.anfragen().into_iter().filter(|a| a.methode == "DELETE").collect();
        assert_eq!(geloescht.len(), 1);
        assert_eq!(geloescht[0].url, "http://einsatzbuch.localtest.me:3000/m/einsatzbuch/api/rechner/r-neu");
        assert_eq!(geloescht[0].bearer.as_deref(), Some("sitzung-1"));
        kein_token(&z);
        keine_datei(ordner.path());
        assert!(z.sitzung().is_none());
        assert!(!lies_status(&z).unwrap().eingerichtet);
    }

    #[test]
    fn testbetrieb_beenden_ohne_sitzung_schickt_kein_delete() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        melde_ab(&z);
        beende_testbetrieb(&z).unwrap();
        assert!(suite.anfragen().is_empty());
        kein_token(&z);
        keine_datei(ordner.path());
    }

    #[test]
    fn testbetrieb_beenden_meldet_den_fehler_der_suite_und_loescht_trotzdem() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        suite.setze(|_| fehler(403, "fremder_rechner", "Dieser Rechner gehört zu einer anderen Sitzung."));
        let meldung = beende_testbetrieb(&z).unwrap_err();
        assert!(meldung.contains("Dieser Rechner gehört zu einer anderen Sitzung."), "{meldung}");
        keine_datei(ordner.path());
        kein_token(&z);
        assert!(!lies_status(&z).unwrap().eingerichtet);
    }

    #[test]
    fn neu_einrichten_nach_widerruf_mit_gleichem_schluessel() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let browser = Browser::neu();
        assert_eq!(richte_neu_ein(&z, &|u| browser.oeffne(u)).unwrap_err(), NEU_NUR_NACH_WIDERRUF);

        z.buch().as_mut().unwrap().widerrufen_setzen(true).unwrap();
        suite.setze(|a| match a.pfad() {
            "/api/einrichten" => antwort(200, &einrichten_antwort(a, "r-neu-2", "geraet-neu-2").to_string()),
            _ => gesunde_suite(a),
        });
        richte_neu_ein(&z, &|u| browser.oeffne(u)).unwrap();
        let url = browser.letzte_url();
        assert_eq!(abfragewert(&url, "art").as_deref(), Some("echt"));
        assert_eq!(abfragewert(&url, "name").as_deref(), Some("Einsatzleitung"));
        let anbindung = z.buch().as_ref().unwrap().anbindung().unwrap().unwrap();
        assert_eq!(anbindung.rechner_id, "r-neu-2");
        assert!(!anbindung.widerrufen);
        assert_eq!(z.tresor.lies("geraetetoken-echt").unwrap().as_deref(), Some("geraet-neu-2"));
        assert!(!lies_status(&z).unwrap().widerrufen);
    }

    #[test]
    fn neu_einrichten_mit_anderem_schluessel_nennt_beide_ids_und_aendert_nichts() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        z.buch().as_mut().unwrap().widerrufen_setzen(true).unwrap();
        let anderer = krypto::schluessel_id(&krypto::aus_b64(ANDERES_SPKI).unwrap());
        let anderer_im_skript = anderer.clone();
        suite.setze(move |a| match a.pfad() {
            "/api/einrichten" => {
                let mut e = einrichten_antwort(a, "r-neu-2", "geraet-neu-2");
                e["oeffentlichSpki"] = json!(ANDERES_SPKI);
                e["schluesselId"] = json!(anderer_im_skript);
                antwort(200, &e.to_string())
            }
            _ => gesunde_suite(a),
        });
        let browser = Browser::neu();
        let fehler = richte_neu_ein(&z, &|u| browser.oeffne(u)).unwrap_err();
        assert!(fehler.contains("8cedd95d94246a4d") && fehler.contains(&anderer), "{fehler}");
        let anbindung = z.buch().as_ref().unwrap().anbindung().unwrap().unwrap();
        assert_eq!(anbindung.rechner_id, "r-neu");
        assert!(anbindung.widerrufen);
        assert_eq!(z.tresor.lies("geraetetoken-echt").unwrap().as_deref(), Some("geraet-neu"), "das alte Token bleibt");
    }

    /// Ein Tresor, dessen Schreiben hängt, solange er scharf ist — wie ein Schlüsselbund, der auf
    /// einen Dialog des Betriebssystems wartet. Lesen und Löschen hängen nie.
    #[derive(Clone, Default)]
    struct HaengenderTresor(Arc<HaengeLage>);

    #[derive(Default)]
    struct HaengeLage {
        werte: Speichertresor,
        /// (scharf, hängt gerade)
        lage: Mutex<(bool, bool)>,
        signal: std::sync::Condvar,
    }

    impl HaengenderTresor {
        fn schaerfe(&self) {
            self.0.lage.lock().unwrap().0 = true;
        }
        fn warte_bis_es_haengt(&self) {
            let lage = self.0.lage.lock().unwrap();
            let (lage, _) =
                self.0.signal.wait_timeout_while(lage, std::time::Duration::from_secs(10), |(_, haengt)| !*haengt).unwrap();
            assert!(lage.1, "der Tresor wurde nie beschrieben");
        }
        fn gib_frei(&self) {
            self.0.lage.lock().unwrap().0 = false;
            self.0.signal.notify_all();
        }
    }

    impl Tresor for HaengenderTresor {
        fn lies(&self, konto: &str) -> Result<Option<String>, String> {
            self.0.werte.lies(konto)
        }
        fn schreibe(&self, konto: &str, wert: &str) -> Result<(), String> {
            let mut lage = self.0.lage.lock().unwrap();
            if lage.0 {
                lage.1 = true;
                self.0.signal.notify_all();
                lage = self.0.signal.wait_while(lage, |(scharf, _)| *scharf).unwrap();
                lage.1 = false;
            }
            drop(lage);
            self.0.werte.schreibe(konto, wert)
        }
        fn loesche(&self, konto: &str) -> Result<(), String> {
            self.0.werte.loesche(konto)
        }
    }

    /// Richtet einen widerrufenen echten Rechner neu ein, während der Tresor beim Schreiben des
    /// neuen Tokens hängt. `waehrenddessen` läuft in dieser Zeit in einem zweiten Faden; sein
    /// Ergebnis kommt nur zurück, wenn er binnen 2 Sekunden fertig wird.
    fn neu_einrichten_waehrend_der_tresor_haengt<T: Send>(
        ordner: &Path,
        waehrenddessen: impl FnOnce(&Zustand) -> T + Send,
    ) -> (Zustand, HaengenderTresor, Result<(), String>, Option<T>) {
        let suite = FakeSuite::gesund();
        let tresor = HaengenderTresor::default();
        let z = zustand_mit(ordner, &Stelluhr::neu(), &suite, Box::new(tresor.clone()));
        let browser = Browser::neu();
        richte_ein_ueber_suite(&z, Umgebung::Echt, "Einsatzleitung", SUITE, &|u| browser.oeffne(u)).unwrap();
        z.buch().as_mut().unwrap().widerrufen_setzen(true).unwrap();
        suite.setze(|a| match a.pfad() {
            "/api/einrichten" => antwort(200, &einrichten_antwort(a, "r-neu-2", "geraet-neu-2").to_string()),
            _ => gesunde_suite(a),
        });
        tresor.schaerfe();
        let zr = &z;
        let (ergebnis, zweiter) = std::thread::scope(|s| {
            let neu = s.spawn(|| richte_neu_ein(zr, &|u| browser.oeffne(u)));
            tresor.warte_bis_es_haengt();
            let (tx, rx) = std::sync::mpsc::channel();
            let faden = s.spawn(move || {
                let _ = tx.send(waehrenddessen(zr));
            });
            let zweiter = rx.recv_timeout(std::time::Duration::from_secs(2)).ok();
            // Erst freigeben, dann auf beide Fäden warten — ein Assert vorher ließe den Test hängen.
            tresor.gib_frei();
            let ergebnis = neu.join().unwrap();
            faden.join().unwrap();
            (ergebnis, zweiter)
        });
        (z, tresor, ergebnis, zweiter)
    }

    #[test]
    fn neu_einrichten_haelt_den_buch_lock_nicht_ueber_dem_schluesselbund() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, tresor, ergebnis, status) =
            neu_einrichten_waehrend_der_tresor_haengt(ordner.path(), |z| lies_status(z).map(|s| s.widerrufen));
        assert_eq!(status, Some(Ok(true)), "lies_status darf nicht auf den Schlüsselbund warten");
        ergebnis.unwrap();
        assert_eq!(tresor.lies("geraetetoken-echt").unwrap().as_deref(), Some("geraet-neu-2"));
        assert_eq!(z.buch().as_ref().unwrap().anbindung().unwrap().unwrap().rechner_id, "r-neu-2");
    }

    #[test]
    fn neu_einrichten_legt_das_alte_token_zurueck_wenn_das_buch_danach_nicht_mehr_passt() {
        // Ein Startfehler, gesetzt während der Tresor hängt: Das Buch wird nicht angefasst, und das
        // bisherige Token liegt wieder im Tresor.
        let ordner = tempfile::tempdir().unwrap();
        let (z, tresor, ergebnis, _) = neu_einrichten_waehrend_der_tresor_haengt(ordner.path(), |z| {
            *z.startfehler() = Some("Die Datenbank ist weg.".into());
        });
        assert_eq!(ergebnis.unwrap_err(), "Die Datenbank ist weg.");
        assert_eq!(tresor.lies("geraetetoken-echt").unwrap().as_deref(), Some("geraet-neu"));
        let anbindung = z.buch().as_ref().unwrap().anbindung().unwrap().unwrap();
        assert_eq!(anbindung.rechner_id, "r-neu");
        assert!(anbindung.widerrufen);

        // Das Buch ist inzwischen zu: ebenso.
        let ordner = tempfile::tempdir().unwrap();
        let (z, tresor, ergebnis, _) = neu_einrichten_waehrend_der_tresor_haengt(ordner.path(), |z| {
            *z.buch() = None;
        });
        assert_eq!(ergebnis.unwrap_err(), NICHT_EINGERICHTET);
        assert_eq!(tresor.lies("geraetetoken-echt").unwrap().as_deref(), Some("geraet-neu"));
        assert!(z.buch().is_none());
    }

    #[test]
    fn neu_einrichten_gibt_es_nur_fuer_den_echten_rechner() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        z.buch().as_mut().unwrap().widerrufen_setzen(true).unwrap();
        let browser = Browser::neu();
        assert_eq!(richte_neu_ein(&z, &|u| browser.oeffne(u)).unwrap_err(), NEU_NUR_ECHT);
    }

    // -----------------------------------------------------------------------------------------
    // Stammdaten und Anker
    // -----------------------------------------------------------------------------------------

    #[test]
    fn stammdaten_200_uebernimmt_304_bestaetigt_401_widerruft() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &uhr);
        let mut paket = fixture("stammdaten.json");
        paket["bereitschaft"] = json!("Neue Bereitschaft");
        paket["version"] = json!(8);
        let koerper = paket.to_string();
        suite.setze(move |_| Ok(Antwort { status: 200, etag: Some(ETAG.into()), koerper: koerper.clone() }));
        hole_stammdaten_jetzt(&z).unwrap();
        let abruf = &suite.anfragen()[0];
        assert_eq!((abruf.methode, abruf.pfad()), ("GET", "/api/stammdaten"));
        assert_eq!(abruf.bearer.as_deref(), Some("geraet-neu"));
        assert_eq!(abruf.if_none_match, None);
        let s = lies_status(&z).unwrap();
        assert_eq!(s.bereitschaft.as_deref(), Some("Neue Bereitschaft"));
        assert_eq!(s.stammdaten_vom.as_deref(), Some("2026-09-24T10:00:00+02:00"));
        assert_eq!(lies_stammdaten(&z).unwrap().version, 8);

        uhr.vor(Duration::hours(1));
        suite.leere();
        suite.setze(|_| antwort(304, ""));
        hole_stammdaten_jetzt(&z).unwrap();
        assert_eq!(suite.anfragen()[0].if_none_match.as_deref(), Some(ETAG));
        let s = lies_status(&z).unwrap();
        assert_eq!(s.stammdaten_vom.as_deref(), Some("2026-09-24T11:00:00+02:00"));
        assert_eq!(s.bereitschaft.as_deref(), Some("Neue Bereitschaft"), "304 lässt das Paket, wie es ist");

        suite.setze(|_| fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr."));
        assert!(hole_stammdaten_jetzt(&z).is_err());
        let s = lies_status(&z).unwrap();
        assert!(s.widerrufen);
        assert_eq!(serde_json::to_value(&s).unwrap()["widerrufen"], true);
    }

    /// Spec §8: Ein widerrufener Rechner erfasst und versiegelt weiter — nur die Anbindung ruht.
    #[test]
    fn versiegeln_geht_bei_widerruf_weiter() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        suite.setze(|_| fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr."));
        assert!(hole_stammdaten_jetzt(&z).is_err());
        assert!(lies_status(&z).unwrap().widerrufen);
        let v = versiegele_einen(&z);
        assert_eq!(v.block, 1);
        assert_eq!(lies_status(&z).unwrap().kette.anzahl, 1);
    }

    #[test]
    fn anker_jetzt_liefert_den_ankerstand() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &uhr);
        let leer = gleiche_anker_jetzt(&z).unwrap();
        assert_eq!(leer, Ankerstand { bestaetigt_bis: 0, hash: None, gemeldet_am: None, abweichung: None, offline: false, widerrufen: false });

        let v = versiegele_einen(&z);
        let stand = gleiche_anker_jetzt(&z).unwrap();
        assert_eq!(stand.bestaetigt_bis, 1);
        assert_eq!(stand.hash.as_deref(), Some(v.hash.as_str()));
        assert_eq!(stand.gemeldet_am.as_deref(), Some("2026-09-24T10:00:00+02:00"));
        assert!(!stand.offline);
        let anker = suite.nach_pfad("/api/anker");
        assert_eq!(anker[0].bearer.as_deref(), Some("geraet-neu"));
        assert_eq!(anker[0].json, Some(json!({ "block": 1, "hash": v.hash })));
        let json = serde_json::to_value(&stand).unwrap();
        for feld in ["bestaetigtBis", "hash", "gemeldetAm", "abweichung", "offline", "widerrufen"] {
            assert!(json.get(feld).is_some(), "{feld} fehlt: {json}");
        }
        assert_eq!(lies_status(&z).unwrap().anker_bestaetigt_bis, 1);
        // Der bestätigte Anker samt Zeitpunkt in der Zone der Einrichtung (nicht UTC) — für den Export.
        let exportanker = Exportanker { block: 1, hash: v.hash.clone(), gemeldet_am: "2026-09-24T10:00:00+02:00".into() };
        assert_eq!(lies_status(&z).unwrap().anker, Some(exportanker.clone()));

        uhr.vor(Duration::hours(1));
        suite.setze(|_| antwort(503, "<html>Service Unavailable</html>"));
        let offline = gleiche_anker_jetzt(&z).unwrap();
        assert!(offline.offline);
        assert_eq!(offline.bestaetigt_bis, 1, "offline bleibt der Stand");
        assert_eq!(offline.gemeldet_am, None);
        assert_eq!(lies_status(&z).unwrap().anker, Some(exportanker), "offline bleibt auch der Zeitpunkt");

        // Die erneute Meldung des letzten Blocks frischt den Zeitpunkt auf.
        suite.setze(gesunde_suite);
        let wieder = gleiche_anker_jetzt(&z).unwrap();
        assert_eq!(wieder.gemeldet_am.as_deref(), Some("2026-09-24T11:00:00+02:00"));
        assert_eq!(
            lies_status(&z).unwrap().anker,
            Some(Exportanker { block: 1, hash: v.hash, gemeldet_am: "2026-09-24T11:00:00+02:00".into() })
        );
    }

    /// Härtung aus Phase C: Der Versiegelungshinweis steht im Buch, nicht im Speicher der Hülle.
    /// Ein neuer Zustand auf demselben Ordner (Neustart der App) zeigt ihn samt `verfallen`, bis
    /// er quittiert ist — und danach auch nach einem weiteren Neustart nicht mehr.
    #[test]
    fn versiegelungshinweis_uebersteht_den_neustart_des_zustands() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let v = {
            let z = zustand(ordner.path(), &uhr);
            richte_entwicklung_ein(&z, None, Some(15)).unwrap();
            sende_ab(&z, &entwurf(), false).unwrap();
            speichere_entwurf(&z, &entwurf(), true).unwrap();
            uhr.vor(Duration::minutes(15));
            let v = z.pruefe_frist().unwrap().expect("Frist erreicht");
            assert!(v.verfallen);
            v
        };

        let z = zustand(ordner.path(), &uhr);
        let s = lies_status(&z).unwrap();
        assert_eq!(s.versiegelung, Some(v.clone()), "der Hinweis muss den Neustart überstehen");
        assert!(s.versiegelung.as_ref().is_some_and(|v| v.verfallen));
        assert_eq!(serde_json::to_value(&s).unwrap()["versiegelung"]["verfallen"], true);
        assert_eq!(pruefe_frist_jetzt(&z).unwrap(), Some(v.clone()), "auch frist_pruefen liefert ihn");
        assert_eq!(versiegele_jetzt(&z).unwrap(), v, "„Jetzt versiegeln“ liefert ihn statt eines Fehlers");

        quittiere(&z).unwrap();
        assert_eq!(lies_status(&z).unwrap().versiegelung, None);
        drop(z);
        assert_eq!(lies_status(&zustand(ordner.path(), &uhr)).unwrap().versiegelung, None, "quittiert bleibt quittiert");
    }

    /// Versiegelt die Frist schon beim Start (`beim_start`), steht der Hinweis im Status.
    #[test]
    fn frist_beim_start_versiegelt_und_zeigt_den_hinweis() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        {
            let z = zustand(ordner.path(), &uhr);
            richte_entwicklung_ein(&z, None, Some(15)).unwrap();
            sende_ab(&z, &entwurf(), false).unwrap();
        }
        uhr.vor(Duration::minutes(20));
        let z = zustand(ordner.path(), &uhr);
        let s = lies_status(&z).unwrap();
        assert_eq!(s.kette.anzahl, 1, "beim_start versiegelt die überfällige Frist");
        assert!(s.versiegelung.as_ref().is_some_and(|v| v.block == 1 && !v.verfallen), "{:?}", s.versiegelung);
    }

    #[test]
    fn ohne_geraetetoken_kein_abgleich() {
        let ordner = tempfile::tempdir().unwrap();
        let z = zustand(ordner.path(), &Stelluhr::neu());
        richte_entwicklung_ein(&z, None, None).unwrap();
        assert_eq!(gleiche_anker_jetzt(&z).unwrap_err(), KEIN_GERAETETOKEN);
        assert_eq!(hole_stammdaten_jetzt(&z).unwrap_err(), KEIN_GERAETETOKEN);
    }

    /// Jede Versiegelung weckt den Abgleich-Thread — aus „Jetzt versiegeln“, aus der Frist-Prüfung
    /// der Oberfläche und aus der Frist-Uhr.
    #[test]
    fn jede_versiegelung_stoesst_den_abgleich_an() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_testrechner(ordner.path(), &uhr);
        let (tx, rx) = std::sync::mpsc::channel();
        *z.abgleich() = Some(tx);

        versiegele_einen(&z);
        assert_eq!(rx.try_recv(), Ok(Anstoss::NeuerBlock), "jetzt_versiegeln");

        sende_ab(&z, &entwurf_suite(), false).unwrap();
        uhr.vor(Duration::minutes(15));
        pruefe_frist_jetzt(&z).unwrap().expect("Frist erreicht");
        assert_eq!(rx.try_recv(), Ok(Anstoss::NeuerBlock), "frist_pruefen");
        quittiere(&z).unwrap();

        sende_ab(&z, &entwurf_suite(), false).unwrap();
        uhr.vor(Duration::minutes(15));
        z.pruefe_frist().unwrap().expect("Frist erreicht");
        assert_eq!(rx.try_recv(), Ok(Anstoss::NeuerBlock), "Frist-Uhr");
        assert!(rx.try_recv().is_err(), "genau ein Signal je Versiegelung");
    }

    #[test]
    fn status_traegt_die_felder_der_anbindung_in_camel_case() {
        let ordner = tempfile::tempdir().unwrap();
        let z = zustand(ordner.path(), &Stelluhr::neu());
        let json = serde_json::to_value(lies_status(&z).unwrap()).unwrap();
        for feld in [
            "suiteUrl", "suiteVorgabe", "rechnerName", "eingerichtetAm", "eingerichtetVon", "schluesselId", "stammdatenVom",
            "ankerBestaetigtBis", "ankerAbweichung", "anker", "sicherung", "widerrufen", "sitzung", "anmeldungLaeuft",
        ] {
            assert!(json.get(feld).is_some(), "{feld} fehlt: {json}");
        }
        assert_eq!(json["suiteVorgabe"], SUITE);
    }
}
