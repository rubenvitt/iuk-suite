//! Der Abgleich-Thread (Plan Stufe 5, Task 8; Stufe 6, Entscheidung 1): hält Sicherung,
//! Stammdaten und Anker mit Ordner und Suite in Gang, ohne die Oberfläche zu fragen.
//!
//! - Beim Start läuft er sofort einmal: erst die Sicherung, dann die Stammdaten, dann die Anker.
//! - Danach wartet er bis zu einer Stunde auf einen `Anstoss` (`Zustand::stosse_an`):
//!   `NeuerBlock` (Versiegeln, Frist-Uhr, Einrichten, Neu einrichten, Wiederherstellen): erst
//!   die Sicherung, dann der Ankerabgleich. Die Wahl des Sicherungsordners stößt ihn nicht an,
//!   sie sichert selbst (`sicherung::setze_sicherungsordner`, Review I2).
//! - Läuft die Stunde ab, folgt dieselbe volle Runde wie beim Start: erst die Sicherung, dann
//!   Stammdaten und Anker (Fix-Runde 1 zu Task 5, ändert Entscheidung 1). Bei unveränderter Kette
//!   ergibt die Sicherung `Unveraendert`: kein Schreiben, keine Rotation, aber „letzte Sicherung“
//!   heißt dann „zuletzt als aktuell im Ordner bestätigt“. So holt die Stunde einen
//!   fehlgeschlagenen Versuch nach, und ein Rechner ohne neue Blöcke wird nach 7 Tagen nicht rot.
//! - Die Sicherung läuft vor jeder Anfrage an die Suite in dieser Runde und unabhängig von
//!   Geräte-Token und Widerruf (`sicherung::sichere_jetzt`). Mit der Wahl des Ordners teilt er
//!   sich den Mutex `Zustand::sicherung`, also schreiben nie zwei gleichzeitig; weder `buch` noch
//!   ein Blatt bleibt über der Datei-I/O im Sicherungsordner (etwa einem Netzlaufwerk) gehalten.
//! - Fehler landen im Log (ohne Körper und ohne Token), nie als Panik; eine Panik in der
//!   Sicherung oder im Abgleich fängt der Thread je Teil und macht mit dem nächsten weiter.
//! - Er hält den Buch-Lock nie während einer Anfrage: Er ruft dieselben Funktionen wie die
//!   Befehle „Stammdaten abgleichen“ und „Kette prüfen“ (`befehle.rs`).
//! - Ohne Einrichtung, ohne Geräte-Token oder bei einem widerrufenen Rechner fragt er die Suite
//!   für Stammdaten und Anker nicht: Dort gibt es nichts abzugleichen, bzw. die Antwort wäre
//!   wieder 401.
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use einsatzbuch_kern::tresor::konto_fuer;
use tauri::{AppHandle, Manager};

use crate::befehle::{gleiche_anker_jetzt, hole_stammdaten_jetzt};
use crate::sicherung::sichere_jetzt;
use crate::zustand::Zustand;

/// Abstand der vollen Runden (Stammdaten und Anker).
pub const TAKT: Duration = Duration::from_secs(60 * 60);

/// Was den Abgleich-Thread weckt (Entscheidung 1). Den früheren Anstoß `Sicherung` (Ordner
/// gewählt) gibt es nicht mehr: Die Wahl sichert selbst, damit die Oberfläche das Ergebnis gleich
/// sieht (Review I2).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Anstoss {
    /// Es gibt einen neuen Block (oder eine ganz neue Kette): sichern, dann Anker melden.
    NeuerBlock,
}

/// Der Suite-Teil einer Runde.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Runde {
    /// Stammdaten, dann Anker — beim Start und nach Ablauf des Takts.
    Voll,
    /// Nur Anker — nach einem neuen Block.
    NurAnker,
}

/// Eine Runde des Threads: ob zuerst gesichert wird, und was danach mit der Suite abzugleichen ist.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Lauf {
    pub sichern: bool,
    pub runde: Runde,
}

impl Lauf {
    /// Beim Start: sichern, dann voll abgleichen.
    pub const START: Lauf = Lauf { sichern: true, runde: Runde::Voll };
    /// Nach Ablauf des Takts ohne Anstoß: wie der Start sichern (bestätigt die Datei oder holt
    /// einen Fehlschlag nach), dann voll abgleichen.
    pub const STUENDLICH: Lauf = Lauf { sichern: true, runde: Runde::Voll };
    /// Nach `Anstoss::NeuerBlock`: sichern, dann Anker melden.
    pub const NEUER_BLOCK: Lauf = Lauf { sichern: true, runde: Runde::NurAnker };

    /// Der Lauf nach einem Anstoß (mehrere in Folge zusammengefasst): sichern und Anker melden.
    /// Ist die volle Runde fällig, wird es gleich eine volle.
    fn nach(volle_faellig: bool) -> Lauf {
        if volle_faellig { Lauf { sichern: true, runde: Runde::Voll } } else { Lauf::NEUER_BLOCK }
    }
}

/// Ob es etwas abzugleichen gibt: eingerichtet, nicht widerrufen, Geräte-Token vorhanden. Liest
/// unter einem kurzen Buch-Lock und gibt ihn vor dem Tresor wieder frei.
fn abgleichbar(z: &Zustand) -> bool {
    let betrieb = {
        let buch = z.buch();
        let Some(offen) = buch.as_ref() else { return false };
        match offen.anbindung() {
            Ok(Some(a)) if !a.widerrufen => offen.betrieb(),
            _ => return false,
        }
    };
    matches!(z.tresor.lies(konto_fuer(betrieb)), Ok(Some(_)))
}

/// Der Suite-Teil einer Runde. Fehler gehen ins Log.
fn gleiche_ab(z: &Zustand, r: Runde) {
    if !abgleichbar(z) {
        return;
    }
    if r == Runde::Voll {
        if let Err(e) = hole_stammdaten_jetzt(z) {
            eprintln!("Stammdatenabgleich: {e}");
        }
    }
    match gleiche_anker_jetzt(z) {
        Ok(stand) if stand.offline => eprintln!("Ankerabgleich: Die Suite ist nicht erreichbar; der nächste Lauf meldet nach."),
        Ok(_) => {}
        Err(e) => eprintln!("Ankerabgleich: {e}"),
    }
}

/// Eine Runde: erst die Sicherung (wenn `l.sichern`), dann der Abgleich mit der Suite. Jeder Teil
/// fängt seine eigene Panik, damit eine Panik in der Sicherung den Ankerabgleich nicht mitnimmt
/// und umgekehrt. Fehler gehen ins Log.
pub fn runde(z: &Zustand, l: Lauf) {
    if l.sichern {
        match catch_unwind(AssertUnwindSafe(|| sichere_jetzt(z))) {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => eprintln!("Sicherung: {e}"),
            Err(_) => eprintln!("Sicherung abgebrochen (Panik), der nächste Anstoß versucht es erneut"),
        }
    }
    if catch_unwind(AssertUnwindSafe(|| gleiche_ab(z, l.runde))).is_err() {
        eprintln!("Abgleich abgebrochen (Panik), die nächste Runde versucht es erneut");
    }
}

/// Die Schleife des Threads: der Startlauf sofort, danach je Anstoß ein Lauf (`Lauf::nach`) und
/// je abgelaufenem `takt` ein stündlicher. Mehrere Anstöße in Folge ergeben einen Lauf, der
/// sichert und die Anker abgleicht. Der Takt zählt ab der letzten vollen
/// Runde, nicht ab dem letzten Anstoß — sonst verdrängten Versiegelungen, die öfter als
/// stündlich kommen, den Stammdatenabgleich ganz. Ist die Frist nach einem Anstoß schon um,
/// wird die Runde gleich zur vollen. Endet, wenn niemand mehr senden kann.
pub fn schleife(z: &Zustand, signal: &Receiver<Anstoss>, takt: Duration) {
    runde(z, Lauf::START);
    let mut naechste_volle = Instant::now() + takt;
    loop {
        let lauf = match signal.recv_timeout(naechste_volle.saturating_duration_since(Instant::now())) {
            Ok(Anstoss::NeuerBlock) => {
                while signal.try_recv().is_ok() {}
                Lauf::nach(Instant::now() >= naechste_volle)
            }
            Err(RecvTimeoutError::Timeout) => Lauf::STUENDLICH,
            Err(RecvTimeoutError::Disconnected) => return,
        };
        runde(z, lauf);
        if lauf.runde == Runde::Voll {
            naechste_volle = Instant::now() + takt;
        }
    }
}

/// Startet den Thread. Er holt sich den Zustand einmal aus dem `AppHandle`; `manage` ist dann
/// schon gelaufen (`lib.rs`, `richte_ein`).
pub fn starte(app: AppHandle, signal: Receiver<Anstoss>) -> std::io::Result<()> {
    std::thread::Builder::new().name("abgleich".into()).spawn(move || {
        let zustand = app.state::<Zustand>();
        schleife(&zustand, &signal, TAKT);
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::mpsc;

    use super::*;
    use crate::befehle::tests::{
        FakeSuite, Stelluhr, eingerichteter_echter_rechner, eingerichteter_testrechner, gesunde_suite, versiegele_einen, warte_bis,
    };

    fn pfade(suite: &FakeSuite) -> Vec<String> {
        suite.anfragen().iter().map(|a| format!("{} {}", a.methode, a.pfad())).collect()
    }

    /// Start: Stammdaten, dann Anker. Signal: nur Anker. Ablauf des Takts: beides.
    #[test]
    fn start_signal_und_takt() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        suite.leere();
        let z = Arc::new(z);
        let (tx, rx) = mpsc::channel();

        let z2 = Arc::clone(&z);
        let faden = std::thread::spawn(move || schleife(&z2, &rx, Duration::from_secs(3600)));
        warte_bis(|| suite.anfragen().len() >= 2);
        assert_eq!(pfade(&suite), ["GET /api/stammdaten", "POST /api/anker"]);

        suite.leere();
        tx.send(Anstoss::NeuerBlock).unwrap();
        warte_bis(|| !suite.anfragen().is_empty());
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(pfade(&suite), ["POST /api/anker"], "nach einer Versiegelung nur die Anker");

        drop(tx);
        faden.join().unwrap();
    }

    /// Entscheidung 1: Der Start sichert vor jeder Anfrage an die Suite.
    #[test]
    fn start_sichert_vor_jeder_anfrage_an_die_suite() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        crate::sicherung::setze_sicherungsordner(&z, Some(ziel.path().to_path_buf())).unwrap();
        versiegele_einen(&z);
        suite.leere();
        let z = Arc::new(z);
        let (tx, rx) = mpsc::channel();

        let z2 = Arc::clone(&z);
        let faden = std::thread::spawn(move || schleife(&z2, &rx, Duration::from_secs(3600)));
        warte_bis(|| suite.anfragen().len() >= 3);
        assert_eq!(pfade(&suite), ["POST /api/sicherung", "GET /api/stammdaten", "POST /api/anker"]);
        assert!(ziel.path().join(einsatzbuch_kern::sicherung::DATEI).exists());

        drop(tx);
        faden.join().unwrap();
    }

    #[test]
    fn nach_dem_takt_folgt_eine_volle_runde() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        suite.leere();
        let z = Arc::new(z);
        let (tx, rx) = mpsc::channel::<Anstoss>();
        let z2 = Arc::clone(&z);
        let faden = std::thread::spawn(move || schleife(&z2, &rx, Duration::from_millis(200)));
        warte_bis(|| pfade(&suite).iter().filter(|p| *p == "GET /api/stammdaten").count() >= 2);
        drop(tx);
        faden.join().unwrap();
    }

    /// Kommen Versiegelungen öfter als der Takt, fällt die volle Runde trotzdem nicht aus: Die
    /// Frist zählt ab der letzten vollen Runde, nicht ab dem letzten Signal.
    #[test]
    fn haeufige_signale_verdraengen_die_volle_runde_nicht() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        suite.leere();
        let z = Arc::new(z);
        let (tx, rx) = mpsc::channel::<Anstoss>();
        let z2 = Arc::clone(&z);
        let faden = std::thread::spawn(move || schleife(&z2, &rx, Duration::from_millis(300)));
        let laeuft = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let laeuft2 = Arc::clone(&laeuft);
        let sender = std::thread::spawn(move || {
            while laeuft2.load(std::sync::atomic::Ordering::SeqCst) {
                if tx.send(Anstoss::NeuerBlock).is_err() {
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        });
        warte_bis(|| pfade(&suite).iter().filter(|p| *p == "GET /api/stammdaten").count() >= 3);
        laeuft.store(false, std::sync::atomic::Ordering::SeqCst);
        sender.join().unwrap();
        faden.join().unwrap();
    }

    /// Offline, 5xx, eine Panik im Transport: Der Thread läuft weiter, das Buch bleibt heil.
    #[test]
    fn fehler_und_panik_beenden_den_thread_nicht() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        suite.setze(|_| panic!("absichtlich"));
        let z = Arc::new(z);
        let (tx, rx) = mpsc::channel();
        let z2 = Arc::clone(&z);
        let faden = std::thread::spawn(move || schleife(&z2, &rx, Duration::from_secs(3600)));
        warte_bis(|| !suite.anfragen().is_empty());

        suite.setze(|_| Err("keine Verbindung".into()));
        tx.send(Anstoss::NeuerBlock).unwrap();
        warte_bis(|| suite.anfragen().len() >= 2);

        suite.setze(gesunde_suite);
        tx.send(Anstoss::NeuerBlock).unwrap();
        warte_bis(|| z.buch().as_ref().unwrap().anbindung().unwrap().unwrap().anker_gemeldet_bis == 1);
        drop(tx);
        faden.join().unwrap();
    }

    /// Ohne Einrichtung (und ohne Geräte-Token) fragt der Thread die Suite nie.
    #[test]
    fn ohne_einrichtung_keine_anfrage() {
        let ordner = tempfile::tempdir().unwrap();
        let suite = FakeSuite::neu(|a| panic!("keine Anfrage erwartet: {} {}", a.methode, a.url));
        let z = crate::befehle::tests::zustand_mit(
            ordner.path(),
            &Stelluhr::neu(),
            &suite,
            Box::new(einsatzbuch_kern::tresor::Speichertresor::default()),
        );
        runde(&z, Lauf::STUENDLICH);
        crate::befehle::richte_entwicklung_ein(&z, None, None).unwrap();
        runde(&z, Lauf::STUENDLICH);
        runde(&z, Lauf::NEUER_BLOCK);
        assert!(suite.anfragen().is_empty());
    }

    /// Ein widerrufener Rechner bekäme nur wieder 401 — der Thread lässt ihn in Ruhe.
    #[test]
    fn widerrufen_keine_anfrage() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        z.buch().as_mut().unwrap().widerrufen_setzen(true).unwrap();
        runde(&z, Lauf::STUENDLICH);
        assert!(suite.anfragen().is_empty());
    }
}
