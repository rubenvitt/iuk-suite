//! Der Updater der Hülle (Spec §4.8; Stufe 7, Entscheidungen 1 und 2).
//!
//! - Nur im Release-Build: `lib.rs` registriert das Plugin und startet den Thread unter
//!   `cfg(not(debug_assertions))`. Entwicklerläufe fragen nie bei GitHub nach und brauchen keinen
//!   gültigen Schlüssel. Der Code hier kompiliert trotzdem in beiden Profilen, damit Tests und
//!   Clippy ihn sehen.
//! - Der Thread prüft kurz nach dem Start (`ERSTE_PRUEFUNG`) und danach alle 6 Stunden
//!   (`PRUEFTAKT`), nach einer gescheiterten Prüfung oder einem gescheiterten Herunterladen oder
//!   Installieren schon nach 15 Minuten (`WIEDERHOLUNG`).
//!   Eine neuere Version wird **vorgemerkt** (`Zustand::update`); der Status meldet sie der
//!   Oberfläche.
//! - Eine Vormerkung lädt der Thread gleich herunter, auf jeder Seite (`ladrunde`): Herunterladen
//!   und Signatur prüfen reißen nichts ab. Das Paket liegt danach im Speicher (`Ablage`), die
//!   Vormerkung gilt als `geladen`, der Status meldet `Updatelauf::Bereit`.
//! - Installiert und neu gestartet wird nur, wenn `darf_installieren` gilt (`installationsrunde`,
//!   jede Minute, `REGELTAKT`): Die Oberfläche zeigt den **Startbildschirm** ohne offenen Dialog
//!   (`Zustand::startbildschirm`, gemeldet von `App.tsx`), nichts steht aus, keine Sitzung, keine
//!   laufende Anmeldung und kein Entwurf, der in den letzten 15 Minuten (`ENTWURF_RUHE`) geändert
//!   wurde. Ein offenes Formular, die Verwaltung (das Tagebuch) oder die Einrichtung halten das
//!   Update also auf, so lange sie offen sind (Anlass 04.11.2026: Ein Neustart darf nie Eingaben
//!   verwerfen).
//! - Nach dem Installieren folgt `AppHandle::restart()` aus dem Tauri-Kern (kein
//!   `tauri-plugin-process` nötig, dessen `relaunch` ruft dasselbe), aber erst, wenn
//!   `darf_installieren` dann noch gilt; sonst wartet der Neustart minütlich darauf (`Lauf`).
//!   Unter Windows beendet `install` die App schon selbst und startet den NSIS-Installer
//!   (`installMode: "passive"`), der sie danach neu startet.
//! - Beendet jemand die App mit einem geladenen, noch nicht installierten Paket, installiert
//!   `beim_beenden` es (`RunEvent::Exit` in `lib.rs`), ohne Neustart. Nicht unter Windows: Dort
//!   startet der Installer die App danach wieder (`/R` im Passivmodus), sie käme also nach dem
//!   Beenden zurück. Unter Windows installiert deshalb der nächste Start, sobald der
//!   Startbildschirm steht.
//! - Ein Fehler steht als kurzer Text in `Zustand::update_fehler` (`Updatefehler`), und der
//!   Status zeigt ihn in der Karte „Einstellungen“: Ein Release-Build schreibt kein Log, das
//!   jemand lesen könnte. Die Texte baut `PluginQuelle` aus festen Sätzen, nie aus der Meldung des
//!   Plugins (die Pfade und Adressen enthalten kann). Eine Panik fängt der Thread je Runde (wie
//!   `abgleich.rs`). Ein Fehler beim Herunterladen oder Installieren (etwa eine falsche Signatur)
//!   verwirft die Vormerkung: Die nächste Prüfung, 15 Minuten später, merkt neu vor, statt jede
//!   Minute erneut herunterzuladen.
//! - „Nach Updates suchen“ (Befehl `update_suchen`) ruft dieselbe `pruefrunde` sofort, außerhalb
//!   des Takts. Sie merkt nur vor; geladen und installiert wird weiter nur hier im Thread.
//! - Ändert eine Runde, was der Status über das Update meldet (`Stand`), sendet der Thread das
//!   Ereignis `STAND_EREIGNIS`, und die Oberfläche liest den Status neu. Sonst sähe niemand das
//!   Ergebnis der ersten Prüfung, der die App vorher geöffnet hat.
//! - Herunterladen und Bereitschaft sind sichtbar (`Updatelauf`, `Laufanzeige`): Die Oberfläche
//!   zeigt unten rechts einen Spinner, danach „Update bereit“. Das Ereignis geht dafür schon zu
//!   Beginn einer Runde hinaus, nicht erst nach dem ganzen Schritt.
//!
//! Sperrreihenfolge (`zustand.rs`): `update`, `update_fehler`, `update_geprueft` und `update_lauf` sind Blätter,
//! keiner wird über einem anderen gehalten. `lage` nimmt das Buch kurz und gibt es vor den Blättern frei; kein Lock
//! wird über einer Anfrage an GitHub gehalten. Der Lock der `Ablage` wird nur zum Ablegen und Herausnehmen genommen,
//! nie über dem Herunterladen oder Installieren.
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::Ordering;
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::zustand::Zustand;

/// Erste Prüfung nach dem Start: kurz danach, nicht mitten im Aufbau des Fensters.
pub const ERSTE_PRUEFUNG: Duration = Duration::from_secs(30);
/// Abstand der Prüfungen beim Update-Endpunkt (Spec §4.8).
pub const PRUEFTAKT: Duration = Duration::from_secs(6 * 60 * 60);
/// Abstand, in dem eine Vormerkung gegen `darf_installieren` geprüft wird.
pub const REGELTAKT: Duration = Duration::from_secs(60);
/// Nächster Versuch nach einer gescheiterten Prüfung (etwa offline beim Start) oder einem
/// gescheiterten Herunterladen oder Installieren, statt 6 Stunden.
pub const WIEDERHOLUNG: Duration = Duration::from_secs(15 * 60);
/// So lange nach der letzten Änderung eines Entwurfs gilt: Hier schreibt gerade jemand.
pub const ENTWURF_RUHE: Duration = Duration::from_secs(15 * 60);

/// Ereignis an die Oberfläche: Der Update-Teil des Status hat sich geändert (`Stand`).
pub const STAND_EREIGNIS: &str = "update-stand";

/// Ein gefundenes, noch nicht installiertes Update: die Version und ob das Paket schon
/// heruntergeladen und geprüft in der `Ablage` liegt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vorgemerkt {
    pub version: String,
    pub geladen: bool,
}

/// Was der Updater gerade tut; die Oberfläche zeigt es unten rechts (`bausteine/UpdateAnzeige.tsx`).
/// Nicht gesetzt heißt: Er tut nichts Sichtbares, ein vorgemerktes Update wartet höchstens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Updatelauf {
    /// Das Herunterladen läuft.
    Laedt,
    /// Heruntergeladen und geprüft; installiert wird auf dem Startbildschirm oder beim Beenden.
    Bereit,
    /// Installiert; der Neustart wartet auf einen ruhigen Moment (`Lauf::neustart_faellig`).
    Neustart,
}

/// Hält `Zustand::update_lauf` für die Dauer einer Runde auf `waehrend` und setzt ihn beim
/// Verlassen auf `danach`, auch nach einem Fehler oder einer Panik (`Drop`). Beide Male meldet
/// `melde` es der Oberfläche: Sonst stünde der Spinner nach einer Panik für immer da, oder er
/// erschiene gar nicht, weil der Thread `STAND_EREIGNIS` erst nach dem Schritt sendet.
struct Laufanzeige<'a> {
    z: &'a Zustand,
    melde: &'a dyn Fn(),
    danach: Option<Updatelauf>,
}

impl<'a> Laufanzeige<'a> {
    fn beginne(z: &'a Zustand, melde: &'a dyn Fn(), waehrend: Updatelauf) -> Laufanzeige<'a> {
        *z.update_lauf() = Some(waehrend);
        melde();
        Laufanzeige { z, melde, danach: None }
    }
}

impl Drop for Laufanzeige<'_> {
    fn drop(&mut self) {
        *self.z.update_lauf() = self.danach;
        (self.melde)();
    }
}

/// Die letzten Fehler des Updaters, getrennt nach Schritt. Getrennt, weil die Karte
/// „Einstellungen“ nur mit Sitzung zu sehen ist und eine Sitzung jede Installation aufhält: Ließe
/// eine gelungene Prüfung auch den Installationsfehler verschwinden, wäre etwa eine Signatur, die
/// nicht zum Schlüssel passt, 15 Minuten später unsichtbar, lange bevor sich jemand anmeldet.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Updatefehler {
    /// Die letzte Prüfung ist gescheitert; die nächste gelungene löscht das.
    pub pruefung: Option<String>,
    /// Das letzte Herunterladen oder Installieren ist gescheitert. Das löscht nur eine gelungene
    /// Installation oder ein Endpunkt, der keine neuere Version mehr nennt.
    pub installation: Option<String>,
}

impl Updatefehler {
    /// Was der Status zeigt (`Status::update_fehler`): der Installationsfehler vor dem der Prüfung.
    pub fn anzeige(&self) -> Option<String> {
        self.installation.clone().or_else(|| self.pruefung.clone())
    }
}

/// Was einer Installation im Weg stehen kann.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Lage {
    /// Die Oberfläche zeigt den Startbildschirm ohne offenen Dialog (`Zustand::startbildschirm`).
    pub startbildschirm: bool,
    /// Ein abgesendeter Einsatz wartet auf seine Frist.
    pub ausstehend: bool,
    /// Eine Verwaltungssitzung ist offen (eine abgelaufene zählt nicht).
    pub sitzung: bool,
    /// Die App wartet auf den Anmelderückruf der Suite.
    pub anmeldung_laeuft: bool,
    /// Ein Entwurf wurde vor weniger als `ENTWURF_RUHE` geändert (`entwurf.geaendert_am`).
    pub entwurf_in_arbeit: bool,
}

/// Installiert und neu gestartet wird nur in einem ruhigen Moment: auf dem Startbildschirm,
/// nichts ausstehend, niemand angemeldet, keine Anmeldung im Gang (Spec §4.8, Review Focus 1) und
/// kein Entwurf, an dem in den letzten 15 Minuten jemand geschrieben hat. Der Startbildschirm ist
/// die eigentliche Bedingung: Jede andere Seite kann Eingaben halten, die ein Neustart abreißt.
/// Die übrigen bleiben als zweite Sicherung stehen.
pub fn darf_installieren(l: &Lage) -> bool {
    l.startbildschirm && !l.ausstehend && !l.sitzung && !l.anmeldung_laeuft && !l.entwurf_in_arbeit
}

/// Wurde der Entwurf vor weniger als `ENTWURF_RUHE` geändert? Gemessen in beide Richtungen: Eine
/// Änderungszeit, die nach einer Uhrkorrektur weit in der Zukunft liegt, hielte das Update sonst
/// bis dahin auf.
fn entwurf_frisch(geaendert_am: DateTime<Utc>, jetzt: DateTime<Utc>) -> bool {
    let abstand_ms = (jetzt - geaendert_am).num_milliseconds().unsigned_abs();
    u128::from(abstand_ms) < ENTWURF_RUHE.as_millis()
}

/// Liest die Lage: erst das Buch unter einem kurzen Lock, danach die Blätter einzeln. Lässt
/// sich das Ausstehende oder die Änderungszeit des Entwurfs nicht lesen, gilt es als ausstehend
/// bzw. als in Arbeit: im Zweifel nicht installieren.
pub fn lage(z: &Zustand) -> Lage {
    let jetzt = z.uhr.jetzt();
    let (ausstehend, entwurf_in_arbeit) = {
        let buch = z.buch();
        match buch.as_ref() {
            Some(offen) => (
                offen.ausstehend().map_or(true, |a| a.is_some()),
                offen.entwurf_geaendert_am().map_or(true, |g| g.is_some_and(|g| entwurf_frisch(g, jetzt))),
            ),
            None => (false, false),
        }
    };
    let jetzt_ms = jetzt.timestamp_millis();
    let sitzung = z.sitzung().as_ref().is_some_and(|s| s.ablauf_ms > jetzt_ms);
    let anmeldung_laeuft = z.anmeldung().is_some();
    let startbildschirm = z.startbildschirm.load(Ordering::SeqCst);
    Lage { startbildschirm, ausstehend, sitzung, anmeldung_laeuft, entwurf_in_arbeit }
}

/// Der Weg zum Update-Endpunkt: im Betrieb das Tauri-Plugin (`PluginQuelle`), in Tests ein Fake.
pub trait Quelle {
    /// Fragt den Endpunkt. `Some(version)`, wenn es eine neuere Version gibt.
    fn pruefe(&self) -> Result<Option<String>, String>;
    /// Fragt den Endpunkt erneut, lädt herunter, prüft die Signatur und legt das Paket ab.
    /// `Some(version)` des abgelegten Pakets; `None`, wenn der Endpunkt keine neuere Version mehr
    /// nennt (etwa nach einem Rücksetzen nach Runbook).
    fn lade(&self) -> Result<Option<String>, String>;
    /// Installiert das abgelegte Paket und nimmt es dabei aus der Ablage.
    fn installiere(&self) -> Result<(), String>;
    /// Verwirft ein abgelegtes Paket.
    fn verwirf(&self);
}

/// Eine Prüfrunde: merkt die neuere Version vor oder verwirft die Vormerkung, wenn der Endpunkt
/// keine mehr nennt. Nennt er dieselbe Version wie vorgemerkt, bleibt ein geladenes Paket liegen;
/// eine andere verwirft es, die nächste `ladrunde` holt die neue. Ein Fehler lässt die Vormerkung
/// stehen, steht danach in `Updatefehler::pruefung` und geht an den Aufrufer. Nennt der Endpunkt
/// keine neuere Version, ist auch ein alter Installationsfehler erledigt.
pub fn pruefrunde(z: &Zustand, q: &dyn Quelle) -> Result<(), String> {
    let neu = match q.pruefe() {
        Ok(neu) => neu,
        Err(e) => {
            z.update_fehler().pruefung = Some(format!("Suche nach Updates gescheitert: {e}"));
            return Err(e);
        }
    };
    *z.update_geprueft() = Some(z.uhr.jetzt());
    {
        let mut fehler = z.update_fehler();
        fehler.pruefung = None;
        if neu.is_none() {
            fehler.installation = None;
        }
    }
    // Eigene Anweisung: Der Guard von `update` darf nicht über `update_lauf` gehalten werden.
    let bisher = z.update().clone();
    if bisher.as_ref().map(|v| &v.version) == neu.as_ref() {
        return Ok(());
    }
    if bisher.is_some_and(|v| v.geladen) {
        q.verwirf();
        let mut lauf = z.update_lauf();
        if *lauf == Some(Updatelauf::Bereit) {
            *lauf = None;
        }
    }
    *z.update() = neu.map(|version| Vorgemerkt { version, geladen: false });
    Ok(())
}

/// Eine Laderunde: nur mit Vormerkung, die noch nicht geladen ist, und auf jeder Seite.
/// `Ok(true)` heißt geladen (`Updatelauf::Bereit`). Ein Fehler verwirft die Vormerkung (die
/// nächste Prüfung merkt neu vor), steht danach in `Updatefehler::installation` und geht an den
/// Aufrufer. Solange sie läuft, steht `Updatelauf::Laedt` im Status (`Laufanzeige`); `melde` sagt
/// es der Oberfläche.
pub fn ladrunde(z: &Zustand, q: &dyn Quelle, melde: &dyn Fn()) -> Result<bool, String> {
    let offen = z.update().as_ref().filter(|v| !v.geladen).map(|v| v.version.clone());
    let Some(version) = offen else {
        return Ok(false);
    };
    let mut anzeige = Laufanzeige::beginne(z, melde, Updatelauf::Laedt);
    match q.lade() {
        Ok(Some(geladen)) => {
            *z.update() = Some(Vorgemerkt { version: geladen, geladen: true });
            anzeige.danach = Some(Updatelauf::Bereit);
            Ok(true)
        }
        Ok(None) => {
            *z.update() = None;
            z.update_fehler().installation = None;
            Ok(false)
        }
        Err(e) => {
            *z.update() = None;
            z.update_fehler().installation = Some(format!("Update auf {version} nicht geladen: {e}"));
            Err(e)
        }
    }
}

/// Eine Installationsrunde: nur mit geladenem Paket und nur, wenn `darf_installieren` gilt.
/// `Ok(true)` heißt installiert, der Aufrufer startet neu (`Updatelauf::Neustart`). Ein Fehler
/// verwirft die Vormerkung (die nächste Prüfung merkt neu vor), steht danach in
/// `Updatefehler::installation` und geht an den Aufrufer.
pub fn installationsrunde(z: &Zustand, q: &dyn Quelle, melde: &dyn Fn()) -> Result<bool, String> {
    let geladen = z.update().as_ref().filter(|v| v.geladen).map(|v| v.version.clone());
    let Some(version) = geladen else {
        return Ok(false);
    };
    if !darf_installieren(&lage(z)) {
        return Ok(false);
    }
    let mut anzeige = Laufanzeige::beginne(z, melde, Updatelauf::Bereit);
    match q.installiere() {
        Ok(()) => {
            z.update_fehler().installation = None;
            anzeige.danach = Some(Updatelauf::Neustart);
            Ok(true)
        }
        Err(e) => {
            *z.update() = None;
            z.update_fehler().installation = Some(format!("Update auf {version} nicht installiert: {e}"));
            Err(e)
        }
    }
}

/// Der kurze Text zu einem Fehler des Plugins, aus festen Sätzen: Die Meldung des Plugins selbst
/// kann Pfade und Adressen enthalten und geht nicht an die Oberfläche. `Error` ist
/// `#[non_exhaustive]`, deshalb der Rückfall.
fn kurztext(e: &tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error as E;
    match e {
        E::Minisign(_) | E::Base64(_) | E::SignatureUtf8(_) | E::SignedVersionMismatch { .. } | E::MissingSignedVersion => {
            "Die Signatur des Updates passt nicht zum Schlüssel dieser App."
        }
        E::Reqwest(_) | E::Network(_) | E::ReleaseNotFound => "Der Update-Server war nicht erreichbar oder lieferte kein Update-Verzeichnis.",
        E::Serialization(_) | E::Semver(_) | E::TargetNotFound(_) | E::TargetsNotFound(_) => {
            "Das Update-Verzeichnis ist unvollständig oder nicht lesbar."
        }
        E::Io(_) | E::TempDirNotFound | E::FailedToDetermineExtractPath | E::PackageInstallFailed | E::InvalidUpdaterFormat => {
            "Das Update ließ sich auf diesem Rechner nicht auspacken oder installieren."
        }
        _ => "Unerwarteter Fehler des Updaters.",
    }
    .to_string()
}

/// Ein heruntergeladenes, geprüftes Paket, bereit zum Installieren.
struct Paket {
    update: tauri_plugin_updater::Update,
    bytes: Vec<u8>,
}

/// Wo das geladene Paket bis zur Installation liegt: im Speicher, verwaltet von Tauri (`starte`),
/// damit Updater-Thread, „Nach Updates suchen“ und `beim_beenden` dasselbe sehen. Nur im
/// Release-Build vorhanden.
#[derive(Default)]
pub struct Ablage(Mutex<Option<Paket>>);

impl Ablage {
    fn nimm(&self) -> Option<Paket> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
    fn lege(&self, paket: Paket) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(paket);
    }
}

/// Die echte Quelle: `tauri-plugin-updater` mit Endpunkt und Schlüssel aus `tauri.conf.json`.
/// Die asynchrone API läuft per `block_on` auf dem aufrufenden Thread. Die volle Meldung des
/// Plugins geht nur nach stderr (sichtbar nur, wenn die App aus einem Terminal läuft), an die
/// Oberfläche der `kurztext`.
pub struct PluginQuelle {
    pub app: AppHandle,
}

fn kurz(e: tauri_plugin_updater::Error) -> String {
    eprintln!("Updater: {e}");
    kurztext(&e)
}

impl PluginQuelle {
    fn ablage(&self) -> Result<tauri::State<'_, Ablage>, String> {
        self.app.try_state::<Ablage>().ok_or_else(|| "Unerwarteter Fehler des Updaters.".to_string())
    }
}

impl Quelle for PluginQuelle {
    fn pruefe(&self) -> Result<Option<String>, String> {
        tauri::async_runtime::block_on(async {
            let updater = self.app.updater().map_err(kurz)?;
            let update = updater.check().await.map_err(kurz)?;
            Ok(update.map(|u| u.version))
        })
    }

    fn lade(&self) -> Result<Option<String>, String> {
        let ablage = self.ablage()?;
        tauri::async_runtime::block_on(async {
            let updater = self.app.updater().map_err(kurz)?;
            let Some(update) = updater.check().await.map_err(kurz)? else {
                ablage.nimm();
                return Ok(None);
            };
            let bytes = update.download(|_, _| {}, || {}).await.map_err(kurz)?;
            let version = update.version.clone();
            ablage.lege(Paket { update, bytes });
            Ok(Some(version))
        })
    }

    fn installiere(&self) -> Result<(), String> {
        let paket = self.ablage()?.nimm().ok_or_else(|| "Unerwarteter Fehler des Updaters.".to_string())?;
        paket.update.install(&paket.bytes).map_err(kurz)
    }

    fn verwirf(&self) {
        if let Ok(ablage) = self.ablage() {
            ablage.nimm();
        }
    }
}

/// Die App wird beendet (`RunEvent::Exit` in `lib.rs`): Liegt ein geladenes Paket bereit, wird es
/// jetzt installiert, ohne Neustart. Nicht unter Windows (siehe Modulkopf). Nach einem Neustart
/// des Updaters ist die Ablage schon leer, und es geschieht nichts.
pub fn beim_beenden(app: &AppHandle) {
    #[cfg(not(target_os = "windows"))]
    if let Some(paket) = app.try_state::<Ablage>().and_then(|a| a.nimm()) {
        if let Err(e) = paket.update.install(&paket.bytes) {
            eprintln!("Update beim Beenden nicht installiert: {e}");
        }
    }
    #[cfg(target_os = "windows")]
    let _ = app;
}

/// Führt eine Runde aus und fängt Fehler und Panik; `None` nach beidem.
fn fange<T>(was: &str, f: impl FnOnce() -> Result<T, String>) -> Option<T> {
    match catch_unwind(AssertUnwindSafe(f)) {
        Ok(Ok(wert)) => Some(wert),
        Ok(Err(fehler)) => {
            eprintln!("{was}: {fehler}");
            None
        }
        Err(_) => {
            eprintln!("{was} abgebrochen (Panik), die nächste Runde versucht es erneut");
            None
        }
    }
}

/// Was der Status über das Update meldet: Vormerkung, Fehler und letzte Prüfung. Ändert es sich
/// in einer Runde des Threads, sendet er `STAND_EREIGNIS`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stand {
    pub update: Option<String>,
    pub fehler: Option<String>,
    pub geprueft: Option<DateTime<Utc>>,
    pub lauf: Option<Updatelauf>,
}

/// Liest die Blätter einzeln, keines über dem anderen (Sperrreihenfolge, `zustand.rs`).
pub fn stand(z: &Zustand) -> Stand {
    let update = z.update().as_ref().map(|v| v.version.clone());
    let fehler = z.update_fehler().anzeige();
    let geprueft = *z.update_geprueft();
    let lauf = *z.update_lauf();
    Stand { update, fehler, geprueft, lauf }
}

/// Der Zustand der Thread-Schleife: wann die nächste Prüfung fällig ist und ob ein installiertes
/// Update noch auf den Neustart wartet. `schritt` ist eine Minute der Schleife, mit der Zeit von
/// außen, damit sich der Ablauf ohne Warten testen lässt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Lauf {
    pub naechste_pruefung: Instant,
    pub neustart_faellig: bool,
}

impl Lauf {
    /// Die erste Prüfung ist beim ersten Schritt fällig.
    pub fn neu(jetzt: Instant) -> Lauf {
        Lauf { naechste_pruefung: jetzt, neustart_faellig: false }
    }

    /// Eine Minute der Schleife. `true` heißt: jetzt neu starten. `melde` geht an Lade- und
    /// Installationsrunde (`Laufanzeige`).
    ///
    /// - Wartet ein installiertes Update auf den Neustart, wird nur `darf_installieren` gefragt:
    ///   Unter macOS ist das Bundle dann schon ersetzt, und zwischen Installation und Neustart kann
    ///   jemand den Startbildschirm verlassen haben. Weder Prüfung noch Installation laufen dann
    ///   erneut.
    /// - Sonst ist die Prüfung fällig: nach einem Erfolg die nächste in 6 Stunden, nach einem
    ///   Fehlschlag (etwa offline beim Start) in 15 Minuten.
    /// - Danach die Laderunde, auf jeder Seite, dann die Installationsrunde; nach einer
    ///   Installation gleich die Frage nach dem Neustart. Scheitert eine von beiden, ist die
    ///   Vormerkung verworfen, und die nächste Prüfung kommt spätestens in 15 Minuten statt erst
    ///   nach 6 Stunden. Ein Update, das nur auf den Startbildschirm wartet, zieht die Prüfung
    ///   nicht vor.
    pub fn schritt(&mut self, z: &Zustand, q: &dyn Quelle, jetzt: Instant, melde: &dyn Fn()) -> bool {
        if !self.neustart_faellig {
            if jetzt >= self.naechste_pruefung {
                let gelungen = fange("Update-Prüfung", || pruefrunde(z, q)).is_some();
                self.naechste_pruefung = jetzt + if gelungen { PRUEFTAKT } else { WIEDERHOLUNG };
            }
            if fange("Update-Download", || ladrunde(z, q, melde)).is_none() {
                self.naechste_pruefung = self.naechste_pruefung.min(jetzt + WIEDERHOLUNG);
            }
            match fange("Update-Installation", || installationsrunde(z, q, melde)) {
                Some(installiert) => self.neustart_faellig = installiert,
                None => self.naechste_pruefung = self.naechste_pruefung.min(jetzt + WIEDERHOLUNG),
            }
        }
        self.neustart_faellig && fange("Neustart-Prüfung", || Ok(darf_installieren(&lage(z)))) == Some(true)
    }
}

/// Startet den Updater-Thread und legt die `Ablage` an. `lib.rs` ruft das nur im Release-Build.
pub fn starte(app: AppHandle) -> std::io::Result<()> {
    app.manage(Ablage::default());
    std::thread::Builder::new().name("updater".into()).spawn(move || {
        let quelle = PluginQuelle { app: app.clone() };
        // Scheitert das Senden, zeigt die Oberfläche den Stand beim nächsten Neulesen.
        let melde = || {
            let _ = app.emit(STAND_EREIGNIS, ());
        };
        std::thread::sleep(ERSTE_PRUEFUNG);
        let mut lauf = Lauf::neu(Instant::now());
        loop {
            let zustand = app.state::<Zustand>();
            let vorher = stand(&zustand);
            let neustart = lauf.schritt(&zustand, &quelle, Instant::now(), &melde);
            if stand(&zustand) != vorher {
                melde();
            }
            if neustart {
                app.restart();
            }
            std::thread::sleep(REGELTAKT);
        }
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    use chrono::Duration as Dauer;
    use einsatzbuch_kern::erfassung::formatiere_zeitpunkt;
    use einsatzbuch_kern::uhr::Uhr;
    use zeroize::Zeroizing;

    use super::*;
    use crate::befehle::Sitzung;
    use crate::befehle::tests::{Stelluhr, eingerichteter_echter_rechner, entwurf_suite};
    use crate::befehle::{lies_status, sende_ab, speichere_entwurf, verwirf_entwurf, versiegele_jetzt};

    #[test]
    fn darf_installieren_nur_auf_dem_startbildschirm_und_in_ruhe() {
        for bits in 0..32u8 {
            let l = Lage {
                startbildschirm: bits & 16 == 0,
                ausstehend: bits & 1 != 0,
                sitzung: bits & 2 != 0,
                anmeldung_laeuft: bits & 4 != 0,
                entwurf_in_arbeit: bits & 8 != 0,
            };
            assert_eq!(darf_installieren(&l), bits == 0, "{l:?}");
        }
    }

    /// Eine Quelle, die der Test steuert. Sie zählt die Aufrufe und hält fest, ob ein Paket
    /// „abgelegt“ ist.
    struct FakeQuelle {
        version: RefCell<Result<Option<String>, String>>,
        /// Was `lade` liefert; `Ok(Some(_))` legt ein Paket ab.
        ladung: RefCell<Result<Option<String>, String>>,
        installation: RefCell<Result<(), String>>,
        /// Läuft mitten in `lade`.
        waehrend_download: RefCell<Option<Box<dyn Fn()>>>,
        /// Läuft nach einer gelungenen Installation, vor der Frage nach dem Neustart.
        nach_installation: RefCell<Option<Box<dyn Fn()>>>,
        abgelegt: Cell<bool>,
        geladen: Cell<u32>,
        installiert: Cell<u32>,
        geprueft: Cell<u32>,
    }

    impl FakeQuelle {
        fn mit(version: Option<&str>) -> FakeQuelle {
            FakeQuelle {
                version: RefCell::new(Ok(version.map(String::from))),
                ladung: RefCell::new(Ok(version.map(String::from))),
                installation: RefCell::new(Ok(())),
                waehrend_download: RefCell::new(None),
                nach_installation: RefCell::new(None),
                abgelegt: Cell::new(false),
                geladen: Cell::new(0),
                installiert: Cell::new(0),
                geprueft: Cell::new(0),
            }
        }
    }

    impl Quelle for FakeQuelle {
        fn pruefe(&self) -> Result<Option<String>, String> {
            self.geprueft.set(self.geprueft.get() + 1);
            self.version.borrow().clone()
        }
        fn lade(&self) -> Result<Option<String>, String> {
            if let Some(f) = self.waehrend_download.borrow().as_ref() {
                f();
            }
            let ergebnis = self.ladung.borrow().clone();
            if let Ok(Some(_)) = ergebnis {
                self.geladen.set(self.geladen.get() + 1);
                self.abgelegt.set(true);
            }
            ergebnis
        }
        fn installiere(&self) -> Result<(), String> {
            assert!(self.abgelegt.replace(false), "installiert nur ein abgelegtes Paket");
            let ergebnis = self.installation.borrow().clone();
            if ergebnis.is_ok() {
                self.installiert.set(self.installiert.get() + 1);
                if let Some(f) = self.nach_installation.borrow().as_ref() {
                    f();
                }
            }
            ergebnis
        }
        fn verwirf(&self) {
            self.abgelegt.set(false);
        }
    }

    /// `melde` für Tests, die die Meldung an die Oberfläche nicht prüfen.
    fn still() {}

    fn vorgemerkt(z: &Zustand) -> Option<String> {
        z.update().as_ref().map(|v| v.version.clone())
    }

    fn ist_geladen(z: &Zustand) -> bool {
        z.update().as_ref().is_some_and(|v| v.geladen)
    }

    fn zeige_start(z: &Zustand, angezeigt: bool) {
        z.startbildschirm.store(angezeigt, Ordering::SeqCst);
    }

    fn sitzung_bis(ablauf_ms: i64) -> Sitzung {
        Sitzung { token: Zeroizing::new("t".into()), name: "Erika".into(), ablauf_ms, rechner_id: None }
    }

    /// Ein ruhiger Rechner auf dem Startbildschirm: ohne Sitzung, Ausstehendes und Entwurf.
    fn ruhig(z: &Zustand) {
        *z.sitzung() = None;
        zeige_start(z, true);
    }

    #[test]
    fn lage_liest_startbildschirm_ausstehendes_sitzung_und_anmeldung() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = None;
        assert_eq!(
            lage(&z),
            Lage { startbildschirm: false, ausstehend: false, sitzung: false, anmeldung_laeuft: false, entwurf_in_arbeit: false },
            "bis die Oberfläche den Startbildschirm meldet, gilt er als nicht angezeigt"
        );
        zeige_start(&z, true);
        assert!(lage(&z).startbildschirm);
        zeige_start(&z, false);
        assert!(!lage(&z).startbildschirm);

        sende_ab(&z, &entwurf_suite(), false).unwrap();
        assert!(lage(&z).ausstehend);
        versiegele_jetzt(&z).unwrap();
        assert!(!lage(&z).ausstehend);

        let jetzt = uhr.jetzt().timestamp_millis();
        *z.sitzung() = Some(sitzung_bis(jetzt + 60_000));
        assert!(lage(&z).sitzung);
        uhr.vor(Dauer::minutes(2));
        assert!(!lage(&z).sitzung, "eine abgelaufene Sitzung zählt nicht");

        *z.anmeldung() = Some(Arc::new(AtomicBool::new(false)));
        assert!(lage(&z).anmeldung_laeuft);
    }

    #[test]
    fn pruefrunde_merkt_vor_und_verwirft() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let q = FakeQuelle::mit(Some("0.2.0"));
        pruefrunde(&z, &q).unwrap();
        assert_eq!(*z.update(), Some(Vorgemerkt { version: "0.2.0".into(), geladen: false }));

        *q.version.borrow_mut() = Err("offline".into());
        assert!(pruefrunde(&z, &q).is_err());
        assert_eq!(vorgemerkt(&z).as_deref(), Some("0.2.0"), "ein Fehler lässt die Vormerkung stehen");

        *q.version.borrow_mut() = Ok(None);
        pruefrunde(&z, &q).unwrap();
        assert_eq!(vorgemerkt(&z), None, "zurückgesetzt nach Runbook");
    }

    /// Dieselbe Version lässt ein geladenes Paket liegen; eine andere oder keine verwirft es.
    #[test]
    fn pruefrunde_behaelt_das_paket_nur_fuer_dieselbe_version() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let q = FakeQuelle::mit(Some("0.2.0"));
        pruefrunde(&z, &q).unwrap();
        assert_eq!(ladrunde(&z, &q, &still), Ok(true));
        assert!(ist_geladen(&z) && q.abgelegt.get());
        assert_eq!(*z.update_lauf(), Some(Updatelauf::Bereit));

        pruefrunde(&z, &q).unwrap();
        assert!(ist_geladen(&z) && q.abgelegt.get(), "dieselbe Version: nicht neu laden");
        assert_eq!(ladrunde(&z, &q, &still), Ok(false));
        assert_eq!(q.geladen.get(), 1);

        *q.version.borrow_mut() = Ok(Some("0.3.0".into()));
        pruefrunde(&z, &q).unwrap();
        assert_eq!(*z.update(), Some(Vorgemerkt { version: "0.3.0".into(), geladen: false }));
        assert!(!q.abgelegt.get(), "das alte Paket ist verworfen");
        assert_eq!(*z.update_lauf(), None);

        *q.ladung.borrow_mut() = Ok(Some("0.3.0".into()));
        assert_eq!(ladrunde(&z, &q, &still), Ok(true));
        *q.version.borrow_mut() = Ok(None);
        pruefrunde(&z, &q).unwrap();
        assert_eq!(vorgemerkt(&z), None);
        assert!(!q.abgelegt.get());
        assert_eq!(*z.update_lauf(), None);
    }

    /// Die letzte gelungene Prüfung steht mit Zeitpunkt im Status und im `Stand`; eine
    /// gescheiterte lässt ihn stehen.
    #[test]
    fn pruefrunde_haelt_die_letzte_gelungene_pruefung_fest() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        assert_eq!(stand(&z), Stand { update: None, fehler: None, geprueft: None, lauf: None });
        assert_eq!(lies_status(&z).unwrap().update_geprueft, None);

        let q = FakeQuelle::mit(None);
        pruefrunde(&z, &q).unwrap();
        let erste = uhr.jetzt();
        assert_eq!(stand(&z), Stand { update: None, fehler: None, geprueft: Some(erste), lauf: None });
        let s = lies_status(&z).unwrap();
        let zone = s.zeitzone.clone().unwrap();
        assert_eq!(s.update_geprueft, Some(formatiere_zeitpunkt(erste, &zone)));
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json.get("updateGeprueft"), Some(&serde_json::json!(formatiere_zeitpunkt(erste, &zone))));

        uhr.vor(Dauer::minutes(5));
        *q.version.borrow_mut() = Err("offline".into());
        assert!(pruefrunde(&z, &q).is_err());
        assert_eq!(stand(&z).geprueft, Some(erste), "eine gescheiterte Prüfung zählt nicht");
        assert!(stand(&z).fehler.is_some());

        *q.version.borrow_mut() = Ok(Some("0.2.0".into()));
        pruefrunde(&z, &q).unwrap();
        assert_eq!(stand(&z), Stand { update: Some("0.2.0".into()), fehler: None, geprueft: Some(uhr.jetzt()), lauf: None });
    }

    /// Geladen wird auf jeder Seite, auch mitten in einem Einsatz oder einer Sitzung; installiert
    /// erst in Ruhe auf dem Startbildschirm.
    #[test]
    fn laedt_ueberall_und_installiert_nur_auf_dem_startbildschirm() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = Some(sitzung_bis(uhr.jetzt().timestamp_millis() + 3_600_000));
        let q = FakeQuelle::mit(Some("0.2.0"));

        // Ohne Vormerkung geschieht nichts.
        assert_eq!(ladrunde(&z, &q, &still), Ok(false));
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false));

        pruefrunde(&z, &q).unwrap();
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false), "noch nicht geladen");
        assert_eq!(ladrunde(&z, &q, &still), Ok(true), "geladen, obwohl jemand angemeldet ist");
        assert_eq!(q.geladen.get(), 1);

        *z.sitzung() = None;
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false), "das Formular oder die Verwaltung ist offen");
        assert_eq!(q.installiert.get(), 0);
        assert!(ist_geladen(&z), "bleibt geladen");

        zeige_start(&z, true);
        sende_ab(&z, &entwurf_suite(), false).unwrap();
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false), "ein Einsatz steht aus");
        versiegele_jetzt(&z).unwrap();
        *z.sitzung() = Some(sitzung_bis(uhr.jetzt().timestamp_millis() + 60_000));
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false), "jemand ist angemeldet");
        *z.sitzung() = None;
        *z.anmeldung() = Some(Arc::new(AtomicBool::new(false)));
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false), "eine Anmeldung läuft");
        assert_eq!(q.installiert.get(), 0);

        *z.anmeldung() = None;
        assert_eq!(installationsrunde(&z, &q, &still), Ok(true));
        assert_eq!((q.geladen.get(), q.installiert.get()), (1, 1));
        assert_eq!(*z.update_lauf(), Some(Updatelauf::Neustart));
    }

    /// Während des Herunterladens steht `Laedt` im Status, danach `Bereit` oder nichts; die
    /// Oberfläche erfährt beides sofort (`melde`), nicht erst nach dem Schritt.
    #[test]
    fn ladrunde_zeigt_den_lauf_und_meldet_ihn() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let z = Arc::new(z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        let beim_herunterladen = Rc::new(Cell::new(None));
        let (z2, gesehen) = (Arc::clone(&z), Rc::clone(&beim_herunterladen));
        *q.waehrend_download.borrow_mut() = Some(Box::new(move || gesehen.set(Some(*z2.update_lauf()))));
        let meldungen = Cell::new(0);
        let melde = || meldungen.set(meldungen.get() + 1);

        pruefrunde(&z, &q).unwrap();
        assert_eq!(*z.update_lauf(), None, "vorgemerkt ist noch kein Lauf");
        assert_eq!(ladrunde(&z, &q, &melde), Ok(true));
        assert_eq!(beim_herunterladen.get(), Some(Some(Updatelauf::Laedt)));
        assert_eq!(*z.update_lauf(), Some(Updatelauf::Bereit));
        assert_eq!(stand(&z).lauf, Some(Updatelauf::Bereit));
        assert_eq!(meldungen.get(), 2, "zu Beginn und am Ende der Runde");

        // Schon geladen: kein neuer Lauf, nichts gemeldet.
        assert_eq!(ladrunde(&z, &q, &melde), Ok(false));
        assert_eq!(meldungen.get(), 2);

        *z.update() = None;
        *z.update_lauf() = None;
        pruefrunde(&z, &q).unwrap();
        *q.ladung.borrow_mut() = Err("Download abgebrochen".into());
        assert!(ladrunde(&z, &q, &melde).is_err());
        assert_eq!(*z.update_lauf(), None, "nach einem Fehler kein Spinner mehr");
        assert_eq!(vorgemerkt(&z), None, "kein erneuter Download jede Minute");
        assert_eq!(meldungen.get(), 4);

        pruefrunde(&z, &q).unwrap();
        *q.ladung.borrow_mut() = Ok(None);
        assert_eq!(ladrunde(&z, &q, &melde), Ok(false));
        assert_eq!(*z.update_lauf(), None);
        assert_eq!(vorgemerkt(&z), None, "der Endpunkt nennt keine neuere Version mehr");
    }

    /// Eine Panik mitten im Herunterladen lässt keinen Spinner stehen.
    #[test]
    fn nach_einer_panik_steht_kein_lauf_mehr() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let q = FakeQuelle::mit(Some("0.2.0"));
        *q.waehrend_download.borrow_mut() = Some(Box::new(|| panic!("Netz weg")));
        let meldungen = Cell::new(0);
        let melde = || meldungen.set(meldungen.get() + 1);
        pruefrunde(&z, &q).unwrap();
        assert!(fange("Update-Download", || ladrunde(&z, &q, &melde)).is_none());
        assert_eq!(*z.update_lauf(), None);
        assert_eq!(meldungen.get(), 2);
    }

    #[test]
    fn fehler_beim_installieren_verwirft_die_vormerkung() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        ruhig(&z);
        let q = FakeQuelle::mit(Some("0.2.0"));

        pruefrunde(&z, &q).unwrap();
        ladrunde(&z, &q, &still).unwrap();
        *q.installation.borrow_mut() = Err("Signatur passt nicht".into());
        assert_eq!(installationsrunde(&z, &q, &still), Err("Signatur passt nicht".into()));
        assert_eq!(vorgemerkt(&z), None, "kein erneuter Download jede Minute");
        assert_eq!(*z.update_lauf(), None);
    }

    /// Verlässt jemand den Startbildschirm, während installiert wird (macOS: das Bundle ist dann
    /// schon ersetzt), wartet der Neustart, bis er zurück ist, ohne erneut zu installieren oder zu
    /// prüfen.
    #[test]
    fn neustart_wartet_auf_die_rueckkehr_zum_startbildschirm() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        ruhig(&z);
        let z = Arc::new(z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        let z2 = Arc::clone(&z);
        *q.nach_installation.borrow_mut() = Some(Box::new(move || zeige_start(&z2, false)));
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);

        assert!(!lauf.schritt(&z, &q, start, &still), "installiert, aber das Formular ist inzwischen offen");
        assert_eq!(q.installiert.get(), 1);
        assert!(lauf.neustart_faellig);
        assert!(!lauf.schritt(&z, &q, start + REGELTAKT, &still));
        assert!(!lauf.schritt(&z, &q, start + PRUEFTAKT, &still), "auch nach 6 Stunden noch offen");
        assert_eq!((q.geladen.get(), q.installiert.get(), q.geprueft.get()), (1, 1, 1), "weder neu geladen, installiert noch geprüft");

        zeige_start(&z, true);
        assert!(lauf.schritt(&z, &q, start + PRUEFTAKT + REGELTAKT, &still), "zurück auf dem Startbildschirm: neu starten");
        assert_eq!(q.installiert.get(), 1);
    }

    /// Ein Schritt auf dem Startbildschirm prüft, lädt, installiert und startet neu.
    #[test]
    fn neustart_sofort_auf_dem_startbildschirm() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        ruhig(&z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        let start = Instant::now();
        assert!(Lauf::neu(start).schritt(&z, &q, start, &still));
    }

    /// Ein Formular ist offen: Der Schritt lädt herunter und wartet. Erst die Rückkehr zum
    /// Startbildschirm installiert und startet neu. Die Prüfung bleibt bei 6 Stunden.
    #[test]
    fn im_formular_laden_und_warten() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        ruhig(&z);
        zeige_start(&z, false);
        let q = FakeQuelle::mit(Some("0.2.0"));
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);

        assert!(!lauf.schritt(&z, &q, start, &still));
        assert_eq!((q.geladen.get(), q.installiert.get()), (1, 0));
        assert_eq!(*z.update_lauf(), Some(Updatelauf::Bereit));
        assert_eq!(lauf.naechste_pruefung, start + PRUEFTAKT);
        for minute in 1..=30 {
            assert!(!lauf.schritt(&z, &q, start + minute * REGELTAKT, &still));
        }
        assert_eq!((q.geladen.get(), q.installiert.get()), (1, 0), "einmal geladen, nie installiert");

        zeige_start(&z, true);
        assert!(lauf.schritt(&z, &q, start + 31 * REGELTAKT, &still));
        assert_eq!((q.geladen.get(), q.installiert.get()), (1, 1));
    }

    /// Scheitert eine Prüfung (etwa offline beim Start), folgt die nächste nach 15 Minuten; nach
    /// einer gelungenen wieder nach 6 Stunden.
    #[test]
    fn nach_einer_gescheiterten_pruefung_nach_15_minuten_erneut() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let q = FakeQuelle::mit(None);
        *q.version.borrow_mut() = Err("offline".into());
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);

        lauf.schritt(&z, &q, start, &still);
        assert_eq!(q.geprueft.get(), 1);
        lauf.schritt(&z, &q, start + WIEDERHOLUNG - REGELTAKT, &still);
        assert_eq!(q.geprueft.get(), 1);
        lauf.schritt(&z, &q, start + WIEDERHOLUNG, &still);
        assert_eq!(q.geprueft.get(), 2, "15 Minuten nach dem Fehlschlag");

        *q.version.borrow_mut() = Ok(None);
        lauf.schritt(&z, &q, start + 2 * WIEDERHOLUNG, &still);
        assert_eq!(q.geprueft.get(), 3);
        lauf.schritt(&z, &q, start + 2 * WIEDERHOLUNG + PRUEFTAKT - REGELTAKT, &still);
        assert_eq!(q.geprueft.get(), 3, "nach einem Erfolg erst nach 6 Stunden");
        lauf.schritt(&z, &q, start + 2 * WIEDERHOLUNG + PRUEFTAKT, &still);
        assert_eq!(q.geprueft.get(), 4);
    }

    /// Ein Entwurf, der vor 5 Minuten geändert wurde, hält die Installation auch auf dem
    /// Startbildschirm auf; einer, der seit 20 Minuten liegt, nicht mehr.
    #[test]
    fn ein_frisch_geaenderter_entwurf_haelt_das_update_auf() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        ruhig(&z);
        assert!(!lage(&z).entwurf_in_arbeit, "ohne Entwurf");

        speichere_entwurf(&z, &entwurf_suite(), false).unwrap();
        uhr.vor(Dauer::minutes(5));
        assert!(lage(&z).entwurf_in_arbeit, "vor 5 Minuten geändert");
        assert!(!darf_installieren(&lage(&z)));

        let q = FakeQuelle::mit(Some("0.2.0"));
        pruefrunde(&z, &q).unwrap();
        ladrunde(&z, &q, &still).unwrap();
        assert_eq!(installationsrunde(&z, &q, &still), Ok(false), "jemand schreibt gerade");
        assert_eq!(q.installiert.get(), 0);

        uhr.vor(Dauer::minutes(15));
        assert!(!lage(&z).entwurf_in_arbeit, "seit 20 Minuten unverändert");
        assert_eq!(installationsrunde(&z, &q, &still), Ok(true));
        assert_eq!(q.installiert.get(), 1);

        // Jedes Speichern setzt die Ruhezeit neu; ein verworfener Entwurf zählt nicht mehr.
        speichere_entwurf(&z, &entwurf_suite(), false).unwrap();
        assert!(lage(&z).entwurf_in_arbeit);
        verwirf_entwurf(&z).unwrap();
        assert!(!lage(&z).entwurf_in_arbeit);
    }

    #[test]
    fn fehler_der_pruefung_steht_im_status_bis_zur_naechsten_gelungenen() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let q = FakeQuelle::mit(None);
        *q.version.borrow_mut() = Err("Der Update-Server war nicht erreichbar.".into());
        assert!(pruefrunde(&z, &q).is_err());
        assert_eq!(
            lies_status(&z).unwrap().update_fehler.as_deref(),
            Some("Suche nach Updates gescheitert: Der Update-Server war nicht erreichbar.")
        );

        *q.version.borrow_mut() = Ok(None);
        pruefrunde(&z, &q).unwrap();
        assert_eq!(lies_status(&z).unwrap().update_fehler, None);
    }

    /// Ein Installationsfehler bleibt stehen, auch wenn die nächste Prüfung gelingt: Die Karte
    /// „Einstellungen“ ist nur mit Sitzung zu sehen, und die hält jede Installation auf.
    #[test]
    fn fehler_der_installation_bleibt_bis_zur_gelungenen_installation() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        ruhig(&z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        const SIGNATUR: &str = "Die Signatur des Updates passt nicht zum Schlüssel dieser App.";
        let text = format!("Update auf 0.2.0 nicht geladen: {SIGNATUR}");

        pruefrunde(&z, &q).unwrap();
        *q.ladung.borrow_mut() = Err(SIGNATUR.into());
        assert!(ladrunde(&z, &q, &still).is_err());
        assert_eq!(lies_status(&z).unwrap().update_fehler.as_deref(), Some(text.as_str()));

        pruefrunde(&z, &q).unwrap();
        assert_eq!(lies_status(&z).unwrap().update_fehler.as_deref(), Some(text.as_str()), "gelungene Prüfung löscht ihn nicht");
        *q.version.borrow_mut() = Err("offline".into());
        assert!(pruefrunde(&z, &q).is_err());
        assert_eq!(
            lies_status(&z).unwrap().update_fehler.as_deref(),
            Some(text.as_str()),
            "der Installationsfehler geht dem der Prüfung vor"
        );

        *q.version.borrow_mut() = Ok(Some("0.2.0".into()));
        pruefrunde(&z, &q).unwrap();
        *q.ladung.borrow_mut() = Ok(Some("0.2.0".into()));
        ladrunde(&z, &q, &still).unwrap();
        *q.installation.borrow_mut() = Err(SIGNATUR.into());
        assert!(installationsrunde(&z, &q, &still).is_err());
        assert_eq!(
            lies_status(&z).unwrap().update_fehler.as_deref(),
            Some(format!("Update auf 0.2.0 nicht installiert: {SIGNATUR}").as_str())
        );

        pruefrunde(&z, &q).unwrap();
        ladrunde(&z, &q, &still).unwrap();
        *q.installation.borrow_mut() = Ok(());
        assert_eq!(installationsrunde(&z, &q, &still), Ok(true));
        assert_eq!(lies_status(&z).unwrap().update_fehler, None);

        // Nennt der Endpunkt keine neuere Version mehr, ist ein alter Fehler ebenfalls erledigt.
        *z.update() = None;
        pruefrunde(&z, &q).unwrap();
        *q.ladung.borrow_mut() = Err("x".into());
        assert!(ladrunde(&z, &q, &still).is_err());
        assert!(lies_status(&z).unwrap().update_fehler.is_some());
        *q.version.borrow_mut() = Ok(None);
        pruefrunde(&z, &q).unwrap();
        assert_eq!(lies_status(&z).unwrap().update_fehler, None);
    }

    /// Scheitert das Herunterladen, folgt die nächste Prüfung nach 15 Minuten, nicht erst nach
    /// 6 Stunden.
    #[test]
    fn nach_einem_gescheiterten_download_nach_15_minuten_erneut() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        ruhig(&z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        *q.ladung.borrow_mut() = Err("Download abgebrochen".into());
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);

        assert!(!lauf.schritt(&z, &q, start, &still));
        assert_eq!(q.geprueft.get(), 1);
        assert_eq!(lauf.naechste_pruefung, start + WIEDERHOLUNG);
        lauf.schritt(&z, &q, start + WIEDERHOLUNG - REGELTAKT, &still);
        assert_eq!(q.geprueft.get(), 1);
        *q.ladung.borrow_mut() = Ok(Some("0.2.0".into()));
        assert!(lauf.schritt(&z, &q, start + WIEDERHOLUNG, &still), "neu vorgemerkt, geladen und installiert");
        assert_eq!((q.geprueft.get(), q.geladen.get(), q.installiert.get()), (2, 1, 1));
    }

    #[test]
    fn status_meldet_ein_vorgemerktes_update() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        assert_eq!(lies_status(&z).unwrap().update, None);
        *z.update() = Some(Vorgemerkt { version: "0.2.0".into(), geladen: false });
        let s = lies_status(&z).unwrap();
        assert_eq!(s.update.as_deref(), Some("0.2.0"));
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json.get("update"), Some(&serde_json::json!("0.2.0")));
        assert_eq!(json.get("updateFehler"), Some(&serde_json::Value::Null));
        assert_eq!(json.get("updateLauf"), Some(&serde_json::Value::Null));
        for (lauf, text) in [(Updatelauf::Laedt, "laedt"), (Updatelauf::Bereit, "bereit"), (Updatelauf::Neustart, "neustart")] {
            *z.update_lauf() = Some(lauf);
            assert_eq!(serde_json::to_value(lies_status(&z).unwrap()).unwrap().get("updateLauf"), Some(&serde_json::json!(text)));
        }
        z.update_fehler().pruefung = Some("Suche nach Updates gescheitert".into());
        let json = serde_json::to_value(lies_status(&z).unwrap()).unwrap();
        assert_eq!(json.get("updateFehler"), Some(&serde_json::json!("Suche nach Updates gescheitert")));
    }
}
