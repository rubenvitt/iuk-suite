//! Der Updater der Hülle (Spec §4.8; Stufe 7, Entscheidungen 1 und 2).
//!
//! - Nur im Release-Build: `lib.rs` registriert das Plugin und startet den Thread unter
//!   `cfg(not(debug_assertions))`. Entwicklerläufe fragen nie bei GitHub nach und brauchen keinen
//!   gültigen Schlüssel. Der Code hier kompiliert trotzdem in beiden Profilen, damit Tests und
//!   Clippy ihn sehen.
//! - Der Thread prüft kurz nach dem Start (`ERSTE_PRUEFUNG`) und danach alle 6 Stunden
//!   (`PRUEFTAKT`). Eine neuere Version wird nur **vorgemerkt** (`Zustand::update`, nur die
//!   Version); der Status meldet sie der Oberfläche.
//! - Jede Minute (`REGELTAKT`) fragt er, solange etwas vorgemerkt ist, `darf_installieren`:
//!   nichts ausstehend, keine Sitzung, keine laufende Anmeldung. Erst dann lädt er herunter
//!   (Entscheidung 2), fragt die Regel nach dem Herunterladen **noch einmal** und installiert nur,
//!   wenn sie weiter gilt: Das Herunterladen kann dauern, und wer in der Zeit einen Einsatz
//!   absendet oder sich anmeldet, soll nicht mitten in der Arbeit neu starten.
//! - Nach dem Installieren folgt `AppHandle::restart()` aus dem Tauri-Kern (kein
//!   `tauri-plugin-process` nötig, dessen `relaunch` ruft dasselbe). Unter Windows beendet
//!   `install` die App schon selbst und startet den NSIS-Installer (`installMode: "passive"`),
//!   der sie danach neu startet.
//! - Fehler gehen ins Log, eine Panik fängt der Thread je Runde (wie `abgleich.rs`). Ein Fehler
//!   beim Installieren (etwa eine falsche Signatur) verwirft die Vormerkung: Die nächste Prüfung
//!   merkt neu vor, statt jede Minute erneut herunterzuladen.
//!
//! Sperrreihenfolge (`zustand.rs`): `update` ist ein Blatt. `lage` nimmt das Buch kurz und gibt
//! es vor den Blättern frei; kein Lock wird über einer Anfrage an GitHub gehalten.
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::zustand::Zustand;

/// Erste Prüfung nach dem Start: kurz danach, nicht mitten im Aufbau des Fensters.
pub const ERSTE_PRUEFUNG: Duration = Duration::from_secs(30);
/// Abstand der Prüfungen beim Update-Endpunkt (Spec §4.8).
pub const PRUEFTAKT: Duration = Duration::from_secs(6 * 60 * 60);
/// Abstand, in dem eine Vormerkung gegen `darf_installieren` geprüft wird.
pub const REGELTAKT: Duration = Duration::from_secs(60);

/// Ein gefundenes, noch nicht installiertes Update. Nur die Metadaten: Heruntergeladen wird erst
/// beim Installieren (Entscheidung 2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vorgemerkt {
    pub version: String,
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
}

/// Installiert wird nur in einem ruhigen Moment: nichts ausstehend, niemand angemeldet, keine
/// Anmeldung im Gang (Spec §4.8, Review Focus 1). Ein Entwurf zählt bewusst nicht: Er steht im
/// Buch und übersteht den Neustart, und ein liegengelassener Entwurf endet anders als die drei
/// Fälle hier nie von selbst; er hielte jedes Update auf.
pub fn darf_installieren(l: &Lage) -> bool {
    !l.ausstehend && !l.sitzung && !l.anmeldung_laeuft
}

/// Liest die Lage: erst das Buch unter einem kurzen Lock, danach die Blätter einzeln. Lässt
/// sich das Ausstehende nicht lesen, gilt es als ausstehend: im Zweifel nicht installieren.
pub fn lage(z: &Zustand) -> Lage {
    let ausstehend = {
        let buch = z.buch();
        match buch.as_ref() {
            Some(offen) => offen.ausstehend().map_or(true, |a| a.is_some()),
            None => false,
        }
    };
    let jetzt = z.uhr.jetzt().timestamp_millis();
    let sitzung = z.sitzung().as_ref().is_some_and(|s| s.ablauf_ms > jetzt);
    let anmeldung_laeuft = z.anmeldung().is_some();
    Lage { ausstehend, sitzung, anmeldung_laeuft }
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
/// keine mehr nennt. Ein Fehler lässt die Vormerkung stehen und geht an den Aufrufer (Log).
pub fn pruefrunde(z: &Zustand, q: &dyn Quelle) -> Result<(), String> {
    let neu = q.pruefe()?;
    *z.update() = neu.map(|version| Vorgemerkt { version });
    Ok(())
}

/// Eine Installationsrunde: nur mit Vormerkung und nur, wenn `darf_installieren` gilt, vor und
/// nach dem Herunterladen. `Ok(true)` heißt installiert, der Aufrufer startet neu. Ein Fehler
/// verwirft die Vormerkung (die nächste Prüfung merkt neu vor) und geht an den Aufrufer.
pub fn installationsrunde(z: &Zustand, q: &dyn Quelle) -> Result<bool, String> {
    // Eigene Anweisung: Der Guard von `update` darf nicht über `lage` (Buch) gehalten werden.
    let vorgemerkt = z.update().is_some();
    if !vorgemerkt || !darf_installieren(&lage(z)) {
        return Ok(false);
    }
    match q.installiere(&|| darf_installieren(&lage(z))) {
        Ok(Installation::Installiert) => Ok(true),
        Ok(Installation::Verschoben) => Ok(false),
        Ok(Installation::KeinUpdate) => {
            *z.update() = None;
            Ok(false)
        }
        Err(e) => {
            *z.update() = None;
            Err(e)
        }
    }
}

/// Die echte Quelle: `tauri-plugin-updater` mit Endpunkt und Schlüssel aus `tauri.conf.json`.
/// Die asynchrone API läuft per `block_on` auf dem Updater-Thread.
pub struct PluginQuelle {
    pub app: AppHandle,
}

impl Quelle for PluginQuelle {
    fn pruefe(&self) -> Result<Option<String>, String> {
        tauri::async_runtime::block_on(async {
            let updater = self.app.updater().map_err(|e| e.to_string())?;
            let update = updater.check().await.map_err(|e| e.to_string())?;
            Ok(update.map(|u| u.version))
        })
    }

    fn installiere(&self, darf: &dyn Fn() -> bool) -> Result<Installation, String> {
        tauri::async_runtime::block_on(async {
            let updater = self.app.updater().map_err(|e| e.to_string())?;
            let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
                return Ok(Installation::KeinUpdate);
            };
            let paket = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
            if !darf() {
                return Ok(Installation::Verschoben);
            }
            update.install(paket).map_err(|e| e.to_string())?;
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

/// Startet den Updater-Thread. `lib.rs` ruft das nur im Release-Build.
pub fn starte(app: AppHandle) -> std::io::Result<()> {
    std::thread::Builder::new().name("updater".into()).spawn(move || {
        let quelle = PluginQuelle { app: app.clone() };
        std::thread::sleep(ERSTE_PRUEFUNG);
        let mut naechste_pruefung = Instant::now();
        loop {
            let zustand = app.state::<Zustand>();
            if Instant::now() >= naechste_pruefung {
                fange("Update-Prüfung", || pruefrunde(&zustand, &quelle));
                naechste_pruefung = Instant::now() + PRUEFTAKT;
            }
            if fange("Update-Installation", || installationsrunde(&zustand, &quelle)) == Some(true) {
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
    use crate::befehle::{lies_status, sende_ab, versiegele_jetzt};

    #[test]
    fn darf_installieren_nur_ohne_ausstehendes_sitzung_und_anmeldung() {
        for bits in 0..8u8 {
            let l = Lage { ausstehend: bits & 1 != 0, sitzung: bits & 2 != 0, anmeldung_laeuft: bits & 4 != 0 };
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
        installiert: Cell<u32>,
    }

    impl FakeQuelle {
        fn mit(version: Option<&str>) -> FakeQuelle {
            FakeQuelle {
                version: RefCell::new(Ok(version.map(String::from))),
                installation: RefCell::new(Ok(Installation::Installiert)),
                waehrend_download: RefCell::new(None),
                installiert: Cell::new(0),
            }
        }
    }

    impl Quelle for FakeQuelle {
        fn pruefe(&self) -> Result<Option<String>, String> {
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
        assert_eq!(lage(&z), Lage { ausstehend: false, sitzung: false, anmeldung_laeuft: false });

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
    }
}
