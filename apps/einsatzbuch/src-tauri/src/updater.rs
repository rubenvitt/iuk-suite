//! Der Updater der Hülle (Spec §4.8; Stufe 7, Entscheidungen 1 und 2).
//!
//! - Nur im Release-Build: `lib.rs` registriert das Plugin und startet den Thread unter
//!   `cfg(not(debug_assertions))`. Entwicklerläufe fragen nie bei GitHub nach und brauchen keinen
//!   gültigen Schlüssel. Der Code hier kompiliert trotzdem in beiden Profilen, damit Tests und
//!   Clippy ihn sehen.
//! - Der Thread prüft kurz nach dem Start (`ERSTE_PRUEFUNG`) und danach alle 6 Stunden
//!   (`PRUEFTAKT`), nach einer gescheiterten Prüfung oder einem gescheiterten Herunterladen oder
//!   Installieren schon nach 15 Minuten (`WIEDERHOLUNG`).
//!   Eine neuere Version wird nur **vorgemerkt** (`Zustand::update`, nur die Version); der
//!   Status meldet sie der Oberfläche.
//! - Jede Minute (`REGELTAKT`) fragt er, solange etwas vorgemerkt ist, `darf_installieren`:
//!   nichts ausstehend, keine Sitzung, keine laufende Anmeldung und kein Entwurf, der in den
//!   letzten 15 Minuten (`ENTWURF_RUHE`) geändert wurde. Erst dann lädt er herunter
//!   (Entscheidung 2), fragt die Regel nach dem Herunterladen **noch einmal** und installiert nur,
//!   wenn sie weiter gilt: Das Herunterladen kann dauern, und wer in der Zeit einen Einsatz
//!   absendet oder sich anmeldet, soll nicht mitten in der Arbeit neu starten.
//! - Nach dem Installieren folgt `AppHandle::restart()` aus dem Tauri-Kern (kein
//!   `tauri-plugin-process` nötig, dessen `relaunch` ruft dasselbe), aber erst, wenn
//!   `darf_installieren` dann noch gilt; sonst wartet der Neustart minütlich darauf (`Lauf`).
//!   Unter Windows beendet `install` die App schon selbst und startet den NSIS-Installer
//!   (`installMode: "passive"`), der sie danach neu startet.
//! - Ein Fehler steht als kurzer Text in `Zustand::update_fehler` (`Updatefehler`), und der
//!   Status zeigt ihn in der Karte „Einstellungen“: Ein Release-Build schreibt kein Log, das
//!   jemand lesen könnte. Die Texte baut `PluginQuelle` aus festen Sätzen, nie aus der Meldung des
//!   Plugins (die Pfade und Adressen enthalten kann). Eine Panik fängt der Thread je Runde (wie
//!   `abgleich.rs`). Ein Fehler beim Installieren (etwa eine falsche Signatur) verwirft die
//!   Vormerkung: Die nächste Prüfung, 15 Minuten später, merkt neu vor, statt jede Minute erneut
//!   herunterzuladen.
//!
//! Sperrreihenfolge (`zustand.rs`): `update` und `update_fehler` sind Blätter, keiner wird über
//! dem anderen gehalten. `lage` nimmt das Buch kurz und gibt es vor den Blättern frei; kein Lock
//! wird über einer Anfrage an GitHub gehalten.
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use tauri::{AppHandle, Manager};
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

/// Ein gefundenes, noch nicht installiertes Update. Nur die Metadaten: Heruntergeladen wird erst
/// beim Installieren (Entscheidung 2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vorgemerkt {
    pub version: String,
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
    /// Ein abgesendeter Einsatz wartet auf seine Frist.
    pub ausstehend: bool,
    /// Eine Verwaltungssitzung ist offen (eine abgelaufene zählt nicht).
    pub sitzung: bool,
    /// Die App wartet auf den Anmelderückruf der Suite.
    pub anmeldung_laeuft: bool,
    /// Ein Entwurf wurde vor weniger als `ENTWURF_RUHE` geändert (`entwurf.geaendert_am`).
    pub entwurf_in_arbeit: bool,
}

/// Installiert und neu gestartet wird nur in einem ruhigen Moment: nichts ausstehend, niemand
/// angemeldet, keine Anmeldung im Gang (Spec §4.8, Review Focus 1) und kein Entwurf, an dem in
/// den letzten 15 Minuten jemand geschrieben hat. Ein Entwurf übersteht den Neustart zwar, aber
/// ein Neustart mitten im Tippen reißt die Eingabe ab. Ein liegengelassener Entwurf hält das
/// Update dagegen nicht auf: Nach 15 Minuten ohne Änderung zählt er nicht mehr.
pub fn darf_installieren(l: &Lage) -> bool {
    !l.ausstehend && !l.sitzung && !l.anmeldung_laeuft && !l.entwurf_in_arbeit
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
    Lage { ausstehend, sitzung, anmeldung_laeuft, entwurf_in_arbeit }
}

/// Ausgang eines Installationsversuchs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Installation {
    /// Installiert; unter macOS folgt der Neustart.
    Installiert,
    /// Heruntergeladen, aber die Lage kippte inzwischen: nicht installiert, bleibt vorgemerkt.
    Verschoben,
    /// Der Endpunkt nennt keine neuere Version mehr (etwa nach einem Rücksetzen nach Runbook).
    KeinUpdate,
}

/// Der Weg zum Update-Endpunkt: im Betrieb das Tauri-Plugin (`PluginQuelle`), in Tests ein Fake.
pub trait Quelle {
    /// Fragt den Endpunkt. `Some(version)`, wenn es eine neuere Version gibt.
    fn pruefe(&self) -> Result<Option<String>, String>;
    /// Fragt den Endpunkt erneut, lädt herunter und prüft die Signatur. Danach fragt sie `darf`
    /// und installiert nur bei `true`.
    fn installiere(&self, darf: &dyn Fn() -> bool) -> Result<Installation, String>;
}

/// Eine Prüfrunde: merkt die neuere Version vor oder verwirft die Vormerkung, wenn der Endpunkt
/// keine mehr nennt. Ein Fehler lässt die Vormerkung stehen, steht danach in
/// `Updatefehler::pruefung` und geht an den Aufrufer. Nennt der Endpunkt keine neuere Version,
/// ist auch ein alter Installationsfehler erledigt.
pub fn pruefrunde(z: &Zustand, q: &dyn Quelle) -> Result<(), String> {
    let neu = match q.pruefe() {
        Ok(neu) => neu,
        Err(e) => {
            z.update_fehler().pruefung = Some(format!("Suche nach Updates gescheitert: {e}"));
            return Err(e);
        }
    };
    {
        let mut fehler = z.update_fehler();
        fehler.pruefung = None;
        if neu.is_none() {
            fehler.installation = None;
        }
    }
    *z.update() = neu.map(|version| Vorgemerkt { version });
    Ok(())
}

/// Eine Installationsrunde: nur mit Vormerkung und nur, wenn `darf_installieren` gilt, vor und
/// nach dem Herunterladen. `Ok(true)` heißt installiert, der Aufrufer startet neu. Ein Fehler
/// verwirft die Vormerkung (die nächste Prüfung merkt neu vor), steht danach in
/// `Updatefehler::installation` und geht an den Aufrufer.
pub fn installationsrunde(z: &Zustand, q: &dyn Quelle) -> Result<bool, String> {
    // Eigene Anweisung: Der Guard von `update` darf nicht über `lage` (Buch) gehalten werden.
    let vorgemerkt = z.update().as_ref().map(|v| v.version.clone());
    let Some(version) = vorgemerkt else {
        return Ok(false);
    };
    if !darf_installieren(&lage(z)) {
        return Ok(false);
    }
    match q.installiere(&|| darf_installieren(&lage(z))) {
        Ok(Installation::Installiert) => {
            z.update_fehler().installation = None;
            Ok(true)
        }
        Ok(Installation::Verschoben) => Ok(false),
        Ok(Installation::KeinUpdate) => {
            *z.update() = None;
            z.update_fehler().installation = None;
            Ok(false)
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

/// Die echte Quelle: `tauri-plugin-updater` mit Endpunkt und Schlüssel aus `tauri.conf.json`.
/// Die asynchrone API läuft per `block_on` auf dem Updater-Thread. Die volle Meldung des Plugins
/// geht nur nach stderr (sichtbar nur, wenn die App aus einem Terminal läuft), an die Oberfläche
/// der `kurztext`.
pub struct PluginQuelle {
    pub app: AppHandle,
}

fn kurz(e: tauri_plugin_updater::Error) -> String {
    eprintln!("Updater: {e}");
    kurztext(&e)
}

impl Quelle for PluginQuelle {
    fn pruefe(&self) -> Result<Option<String>, String> {
        tauri::async_runtime::block_on(async {
            let updater = self.app.updater().map_err(kurz)?;
            let update = updater.check().await.map_err(kurz)?;
            Ok(update.map(|u| u.version))
        })
    }

    fn installiere(&self, darf: &dyn Fn() -> bool) -> Result<Installation, String> {
        tauri::async_runtime::block_on(async {
            let updater = self.app.updater().map_err(kurz)?;
            let Some(update) = updater.check().await.map_err(kurz)? else {
                return Ok(Installation::KeinUpdate);
            };
            let paket = update.download(|_, _| {}, || {}).await.map_err(kurz)?;
            if !darf() {
                return Ok(Installation::Verschoben);
            }
            update.install(paket).map_err(kurz)?;
            Ok(Installation::Installiert)
        })
    }
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

    /// Eine Minute der Schleife. `true` heißt: jetzt neu starten.
    ///
    /// - Wartet ein installiertes Update auf den Neustart, wird nur `darf_installieren` gefragt:
    ///   Unter macOS ist das Bundle dann schon ersetzt, und zwischen Installation und Neustart kann
    ///   sich jemand angemeldet oder einen Einsatz abgesendet haben. Weder Prüfung noch
    ///   Installation laufen dann erneut.
    /// - Sonst ist die Prüfung fällig: nach einem Erfolg die nächste in 6 Stunden, nach einem
    ///   Fehlschlag (etwa offline beim Start) in 15 Minuten.
    /// - Danach die Installationsrunde; nach einer Installation gleich die Frage nach dem Neustart.
    ///   Scheitert sie (Herunterladen, Signatur, Installieren), ist die Vormerkung verworfen, und
    ///   die nächste Prüfung kommt spätestens in 15 Minuten statt erst nach 6 Stunden. Ein
    ///   verschobenes Update (die Lage kippte) zieht die Prüfung nicht vor.
    pub fn schritt(&mut self, z: &Zustand, q: &dyn Quelle, jetzt: Instant) -> bool {
        if !self.neustart_faellig {
            if jetzt >= self.naechste_pruefung {
                let gelungen = fange("Update-Prüfung", || pruefrunde(z, q)).is_some();
                self.naechste_pruefung = jetzt + if gelungen { PRUEFTAKT } else { WIEDERHOLUNG };
            }
            match fange("Update-Installation", || installationsrunde(z, q)) {
                Some(installiert) => self.neustart_faellig = installiert,
                None => self.naechste_pruefung = self.naechste_pruefung.min(jetzt + WIEDERHOLUNG),
            }
        }
        self.neustart_faellig && fange("Neustart-Prüfung", || Ok(darf_installieren(&lage(z)))) == Some(true)
    }
}

/// Startet den Updater-Thread. `lib.rs` ruft das nur im Release-Build.
pub fn starte(app: AppHandle) -> std::io::Result<()> {
    std::thread::Builder::new().name("updater".into()).spawn(move || {
        let quelle = PluginQuelle { app: app.clone() };
        std::thread::sleep(ERSTE_PRUEFUNG);
        let mut lauf = Lauf::neu(Instant::now());
        loop {
            if lauf.schritt(&app.state::<Zustand>(), &quelle, Instant::now()) {
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
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    use chrono::Duration as Dauer;
    use einsatzbuch_kern::uhr::Uhr;
    use zeroize::Zeroizing;

    use super::*;
    use crate::befehle::Sitzung;
    use crate::befehle::tests::{Stelluhr, eingerichteter_echter_rechner, entwurf_suite};
    use crate::befehle::{lies_status, sende_ab, speichere_entwurf, verwirf_entwurf, versiegele_jetzt};

    #[test]
    fn darf_installieren_nur_ohne_ausstehendes_sitzung_anmeldung_und_frischen_entwurf() {
        for bits in 0..16u8 {
            let l = Lage {
                ausstehend: bits & 1 != 0,
                sitzung: bits & 2 != 0,
                anmeldung_laeuft: bits & 4 != 0,
                entwurf_in_arbeit: bits & 8 != 0,
            };
            assert_eq!(darf_installieren(&l), bits == 0, "{l:?}");
        }
    }

    /// Eine Quelle, die der Test steuert. Sie zählt die Aufrufe und hält fest, was `darf` nach
    /// dem „Herunterladen“ sagte.
    struct FakeQuelle {
        version: RefCell<Result<Option<String>, String>>,
        installation: RefCell<Result<Installation, String>>,
        /// Läuft zwischen „heruntergeladen“ und der zweiten Frage an `darf` (Lage kippt).
        waehrend_download: RefCell<Option<Box<dyn Fn()>>>,
        /// Läuft nach einer gelungenen Installation, vor der Frage nach dem Neustart.
        nach_installation: RefCell<Option<Box<dyn Fn()>>>,
        installiert: Cell<u32>,
        geprueft: Cell<u32>,
    }

    impl FakeQuelle {
        fn mit(version: Option<&str>) -> FakeQuelle {
            FakeQuelle {
                version: RefCell::new(Ok(version.map(String::from))),
                installation: RefCell::new(Ok(Installation::Installiert)),
                waehrend_download: RefCell::new(None),
                nach_installation: RefCell::new(None),
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
        fn installiere(&self, darf: &dyn Fn() -> bool) -> Result<Installation, String> {
            if let Some(f) = self.waehrend_download.borrow().as_ref() {
                f();
            }
            let ergebnis = self.installation.borrow().clone();
            if ergebnis == Ok(Installation::Installiert) && !darf() {
                return Ok(Installation::Verschoben);
            }
            if ergebnis == Ok(Installation::Installiert) {
                self.installiert.set(self.installiert.get() + 1);
                if let Some(f) = self.nach_installation.borrow().as_ref() {
                    f();
                }
            }
            ergebnis
        }
    }

    fn vorgemerkt(z: &Zustand) -> Option<String> {
        z.update().as_ref().map(|v| v.version.clone())
    }

    fn sitzung_bis(ablauf_ms: i64) -> Sitzung {
        Sitzung { token: Zeroizing::new("t".into()), name: "Erika".into(), ablauf_ms, rechner_id: None }
    }

    #[test]
    fn lage_liest_ausstehendes_sitzung_und_anmeldung() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = None;
        assert_eq!(lage(&z), Lage { ausstehend: false, sitzung: false, anmeldung_laeuft: false, entwurf_in_arbeit: false });

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
        assert_eq!(vorgemerkt(&z).as_deref(), Some("0.2.0"));

        *q.version.borrow_mut() = Err("offline".into());
        assert!(pruefrunde(&z, &q).is_err());
        assert_eq!(vorgemerkt(&z).as_deref(), Some("0.2.0"), "ein Fehler lässt die Vormerkung stehen");

        *q.version.borrow_mut() = Ok(None);
        pruefrunde(&z, &q).unwrap();
        assert_eq!(vorgemerkt(&z), None, "zurückgesetzt nach Runbook");
    }

    #[test]
    fn installationsrunde_wartet_auf_einen_ruhigen_moment() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = None;
        let q = FakeQuelle::mit(Some("0.2.0"));

        // Ohne Vormerkung geschieht nichts.
        assert_eq!(installationsrunde(&z, &q), Ok(false));
        assert_eq!(q.installiert.get(), 0);

        pruefrunde(&z, &q).unwrap();
        sende_ab(&z, &entwurf_suite(), false).unwrap();
        assert_eq!(installationsrunde(&z, &q), Ok(false), "ein Einsatz steht aus");
        assert_eq!(q.installiert.get(), 0);
        assert_eq!(vorgemerkt(&z).as_deref(), Some("0.2.0"), "bleibt vorgemerkt");

        versiegele_jetzt(&z).unwrap();
        *z.sitzung() = Some(sitzung_bis(uhr.jetzt().timestamp_millis() + 60_000));
        assert_eq!(installationsrunde(&z, &q), Ok(false), "jemand ist angemeldet");
        assert_eq!(q.installiert.get(), 0);

        *z.sitzung() = None;
        *z.anmeldung() = Some(Arc::new(AtomicBool::new(false)));
        assert_eq!(installationsrunde(&z, &q), Ok(false), "eine Anmeldung läuft");
        assert_eq!(q.installiert.get(), 0);

        *z.anmeldung() = None;
        assert_eq!(installationsrunde(&z, &q), Ok(true));
        assert_eq!(q.installiert.get(), 1);
    }

    #[test]
    fn kippt_die_lage_waehrend_des_herunterladens_wird_nicht_installiert() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = None;
        let z = Arc::new(z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        pruefrunde(&z, &q).unwrap();
        let z2 = Arc::clone(&z);
        *q.waehrend_download.borrow_mut() = Some(Box::new(move || {
            sende_ab(&z2, &entwurf_suite(), false).unwrap();
        }));
        assert_eq!(installationsrunde(&z, &q), Ok(false));
        assert_eq!(q.installiert.get(), 0);
        assert_eq!(vorgemerkt(&z).as_deref(), Some("0.2.0"));
    }

    #[test]
    fn fehler_oder_kein_update_verwirft_die_vormerkung() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        *z.sitzung() = None;
        let q = FakeQuelle::mit(Some("0.2.0"));

        pruefrunde(&z, &q).unwrap();
        *q.installation.borrow_mut() = Err("Signatur passt nicht".into());
        assert_eq!(installationsrunde(&z, &q), Err("Signatur passt nicht".into()));
        assert_eq!(vorgemerkt(&z), None, "kein erneuter Download jede Minute");

        pruefrunde(&z, &q).unwrap();
        *q.installation.borrow_mut() = Ok(Installation::KeinUpdate);
        assert_eq!(installationsrunde(&z, &q), Ok(false));
        assert_eq!(vorgemerkt(&z), None);
    }

    /// Kippt die Lage zwischen Installation und Neustart (macOS: das Bundle ist schon ersetzt),
    /// wartet der Neustart, bis es wieder ruhig ist, ohne erneut zu installieren oder zu prüfen.
    #[test]
    fn neustart_wartet_nach_der_installation_auf_einen_ruhigen_moment() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        *z.sitzung() = None;
        let z = Arc::new(z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        let z2 = Arc::clone(&z);
        *q.nach_installation.borrow_mut() = Some(Box::new(move || {
            *z2.anmeldung() = Some(Arc::new(AtomicBool::new(false)));
        }));
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);

        assert!(!lauf.schritt(&z, &q, start), "installiert, aber eine Anmeldung läuft inzwischen");
        assert_eq!(q.installiert.get(), 1);
        assert!(lauf.neustart_faellig);
        assert!(!lauf.schritt(&z, &q, start + REGELTAKT));
        assert!(!lauf.schritt(&z, &q, start + PRUEFTAKT), "auch nach 6 Stunden noch nicht ruhig");
        assert_eq!((q.installiert.get(), q.geprueft.get()), (1, 1), "weder neu installiert noch neu geprüft");

        *z.anmeldung() = None;
        assert!(lauf.schritt(&z, &q, start + PRUEFTAKT + REGELTAKT), "jetzt ruhig: neu starten");
        assert_eq!(q.installiert.get(), 1);
    }

    #[test]
    fn neustart_sofort_wenn_es_nach_der_installation_ruhig_bleibt() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        *z.sitzung() = None;
        let q = FakeQuelle::mit(Some("0.2.0"));
        let start = Instant::now();
        assert!(Lauf::neu(start).schritt(&z, &q, start));
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

        lauf.schritt(&z, &q, start);
        assert_eq!(q.geprueft.get(), 1);
        lauf.schritt(&z, &q, start + WIEDERHOLUNG - REGELTAKT);
        assert_eq!(q.geprueft.get(), 1);
        lauf.schritt(&z, &q, start + WIEDERHOLUNG);
        assert_eq!(q.geprueft.get(), 2, "15 Minuten nach dem Fehlschlag");

        *q.version.borrow_mut() = Ok(None);
        lauf.schritt(&z, &q, start + 2 * WIEDERHOLUNG);
        assert_eq!(q.geprueft.get(), 3);
        lauf.schritt(&z, &q, start + 2 * WIEDERHOLUNG + PRUEFTAKT - REGELTAKT);
        assert_eq!(q.geprueft.get(), 3, "nach einem Erfolg erst nach 6 Stunden");
        lauf.schritt(&z, &q, start + 2 * WIEDERHOLUNG + PRUEFTAKT);
        assert_eq!(q.geprueft.get(), 4);
    }

    /// Ein Entwurf, der vor 5 Minuten geändert wurde, hält Installation und Neustart auf; einer,
    /// der seit 20 Minuten liegt, nicht mehr.
    #[test]
    fn ein_frisch_geaenderter_entwurf_haelt_das_update_auf() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = None;
        assert!(!lage(&z).entwurf_in_arbeit, "ohne Entwurf");

        speichere_entwurf(&z, &entwurf_suite(), false).unwrap();
        uhr.vor(Dauer::minutes(5));
        assert!(lage(&z).entwurf_in_arbeit, "vor 5 Minuten geändert");
        assert!(!darf_installieren(&lage(&z)));

        let q = FakeQuelle::mit(Some("0.2.0"));
        pruefrunde(&z, &q).unwrap();
        assert_eq!(installationsrunde(&z, &q), Ok(false), "jemand schreibt gerade");
        assert_eq!(q.installiert.get(), 0);
        assert_eq!(vorgemerkt(&z).as_deref(), Some("0.2.0"));

        uhr.vor(Dauer::minutes(15));
        assert!(!lage(&z).entwurf_in_arbeit, "seit 20 Minuten unverändert");
        assert_eq!(installationsrunde(&z, &q), Ok(true));
        assert_eq!(q.installiert.get(), 1);

        // Jedes Speichern setzt die Ruhezeit neu; ein verworfener Entwurf zählt nicht mehr.
        speichere_entwurf(&z, &entwurf_suite(), false).unwrap();
        assert!(lage(&z).entwurf_in_arbeit);
        verwirf_entwurf(&z).unwrap();
        assert!(!lage(&z).entwurf_in_arbeit);
    }

    /// Kippt die Lage nach der Installation, weil jemand zu tippen beginnt, wartet auch der
    /// Neustart die 15 Minuten ab.
    #[test]
    fn neustart_wartet_auf_einen_ruhenden_entwurf() {
        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        *z.sitzung() = None;
        let z = Arc::new(z);
        let q = FakeQuelle::mit(Some("0.2.0"));
        let z2 = Arc::clone(&z);
        *q.nach_installation.borrow_mut() = Some(Box::new(move || {
            speichere_entwurf(&z2, &entwurf_suite(), false).unwrap();
        }));
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);
        assert!(!lauf.schritt(&z, &q, start), "installiert, aber jemand schreibt");
        uhr.vor(Dauer::minutes(5));
        assert!(!lauf.schritt(&z, &q, start + REGELTAKT));
        uhr.vor(Dauer::minutes(15));
        assert!(lauf.schritt(&z, &q, start + 2 * REGELTAKT), "20 Minuten ohne Änderung");
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
        *z.sitzung() = None;
        let q = FakeQuelle::mit(Some("0.2.0"));
        const TEXT: &str = "Update auf 0.2.0 nicht installiert: Die Signatur des Updates passt nicht zum Schlüssel dieser App.";

        pruefrunde(&z, &q).unwrap();
        *q.installation.borrow_mut() = Err("Die Signatur des Updates passt nicht zum Schlüssel dieser App.".into());
        assert!(installationsrunde(&z, &q).is_err());
        assert_eq!(lies_status(&z).unwrap().update_fehler.as_deref(), Some(TEXT));

        pruefrunde(&z, &q).unwrap();
        assert_eq!(lies_status(&z).unwrap().update_fehler.as_deref(), Some(TEXT), "gelungene Prüfung löscht ihn nicht");
        *q.version.borrow_mut() = Err("offline".into());
        assert!(pruefrunde(&z, &q).is_err());
        assert_eq!(
            lies_status(&z).unwrap().update_fehler.as_deref(),
            Some(TEXT),
            "der Installationsfehler geht dem der Prüfung vor"
        );

        *q.version.borrow_mut() = Ok(Some("0.2.0".into()));
        pruefrunde(&z, &q).unwrap();
        *q.installation.borrow_mut() = Ok(Installation::Installiert);
        assert_eq!(installationsrunde(&z, &q), Ok(true));
        assert_eq!(lies_status(&z).unwrap().update_fehler, None);

        // Nennt der Endpunkt keine neuere Version mehr, ist ein alter Fehler ebenfalls erledigt.
        *q.installation.borrow_mut() = Err("x".into());
        pruefrunde(&z, &q).unwrap();
        assert!(installationsrunde(&z, &q).is_err());
        assert!(lies_status(&z).unwrap().update_fehler.is_some());
        *q.version.borrow_mut() = Ok(None);
        pruefrunde(&z, &q).unwrap();
        assert_eq!(lies_status(&z).unwrap().update_fehler, None);
    }

    /// Scheitert Herunterladen oder Installieren, folgt die nächste Prüfung nach 15 Minuten, nicht
    /// erst nach 6 Stunden. Ein verschobenes Update zieht die Prüfung nicht vor.
    #[test]
    fn nach_einer_gescheiterten_installation_nach_15_minuten_erneut() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        *z.sitzung() = None;
        let q = FakeQuelle::mit(Some("0.2.0"));
        *q.installation.borrow_mut() = Err("Download abgebrochen".into());
        let start = Instant::now();
        let mut lauf = Lauf::neu(start);

        assert!(!lauf.schritt(&z, &q, start));
        assert_eq!(q.geprueft.get(), 1);
        assert_eq!(lauf.naechste_pruefung, start + WIEDERHOLUNG);
        lauf.schritt(&z, &q, start + WIEDERHOLUNG - REGELTAKT);
        assert_eq!(q.geprueft.get(), 1);
        *q.installation.borrow_mut() = Ok(Installation::Installiert);
        assert!(lauf.schritt(&z, &q, start + WIEDERHOLUNG), "neu vorgemerkt und installiert");
        assert_eq!((q.geprueft.get(), q.installiert.get()), (2, 1));

        // Verschoben (die Lage kippt beim Herunterladen): die Prüfung bleibt bei 6 Stunden.
        let q = FakeQuelle::mit(Some("0.3.0"));
        let z = Arc::new(z);
        let z2 = Arc::clone(&z);
        *q.waehrend_download.borrow_mut() = Some(Box::new(move || {
            *z2.anmeldung() = Some(Arc::new(AtomicBool::new(false)));
        }));
        let mut lauf = Lauf::neu(start);
        assert!(!lauf.schritt(&z, &q, start));
        assert_eq!(lauf.naechste_pruefung, start + PRUEFTAKT);
    }

    #[test]
    fn status_meldet_ein_vorgemerktes_update() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        assert_eq!(lies_status(&z).unwrap().update, None);
        *z.update() = Some(Vorgemerkt { version: "0.2.0".into() });
        let s = lies_status(&z).unwrap();
        assert_eq!(s.update.as_deref(), Some("0.2.0"));
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json.get("update"), Some(&serde_json::json!("0.2.0")));
        assert_eq!(json.get("updateFehler"), Some(&serde_json::Value::Null));
        z.update_fehler().pruefung = Some("Suche nach Updates gescheitert".into());
        let json = serde_json::to_value(lies_status(&z).unwrap()).unwrap();
        assert_eq!(json.get("updateFehler"), Some(&serde_json::json!("Suche nach Updates gescheitert")));
    }
}
