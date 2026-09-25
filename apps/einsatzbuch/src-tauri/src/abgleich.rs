//! Der Abgleich-Thread (Plan Stufe 5, Task 8): hält Stammdaten und Anker mit der Suite in Gang,
//! ohne die Oberfläche zu fragen.
//!
//! - Beim Start läuft er sofort einmal: erst die Stammdaten, dann die Anker.
//! - Danach wartet er bis zu einer Stunde auf ein Signal. Ein Signal sendet jede Versiegelung
//!   (`Zustand::stosse_abgleich_an`); darauf folgt nur der Ankerabgleich. Läuft die Stunde ab,
//!   folgen Stammdaten und Anker.
//! - Fehler landen im Log (ohne Körper und ohne Token), nie als Panik; eine Panik in einer
//!   Runde fängt der Thread und macht mit der nächsten weiter.
//! - Er hält den Buch-Lock nie während einer Anfrage: Er ruft dieselben Funktionen wie die
//!   Befehle „Stammdaten abgleichen“ und „Kette prüfen“ (`befehle.rs`).
//! - Ohne Einrichtung, ohne Geräte-Token oder bei einem widerrufenen Rechner fragt er die Suite
//!   nicht: Dort gibt es nichts abzugleichen, bzw. die Antwort wäre wieder 401.
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::Duration;

use einsatzbuch_kern::tresor::konto_fuer;
use tauri::{AppHandle, Manager};

use crate::befehle::{gleiche_anker_jetzt, hole_stammdaten_jetzt};
use crate::zustand::Zustand;

/// Abstand der vollen Runden (Stammdaten und Anker).
pub const TAKT: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Runde {
    /// Stammdaten, dann Anker — beim Start und nach Ablauf des Takts.
    Voll,
    /// Nur Anker — nach einer Versiegelung.
    NurAnker,
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

/// Eine Runde. Fehler gehen ins Log.
pub fn runde(z: &Zustand, r: Runde) {
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

/// Eine Runde, die eine Panik fängt, statt den Thread zu beenden.
fn sichere_runde(z: &Zustand, r: Runde) {
    if catch_unwind(AssertUnwindSafe(|| runde(z, r))).is_err() {
        eprintln!("Abgleich abgebrochen (Panik), die nächste Runde versucht es erneut");
    }
}

/// Die Schleife des Threads: eine volle Runde sofort, danach je Signal eine Ankerrunde und je
/// abgelaufenem `takt` eine volle. Mehrere Signale in Folge ergeben eine Runde. Endet, wenn
/// niemand mehr senden kann.
pub fn schleife(z: &Zustand, signal: &Receiver<()>, takt: Duration) {
    sichere_runde(z, Runde::Voll);
    loop {
        match signal.recv_timeout(takt) {
            Ok(()) => {
                while signal.try_recv().is_ok() {}
                sichere_runde(z, Runde::NurAnker);
            }
            Err(RecvTimeoutError::Timeout) => sichere_runde(z, Runde::Voll),
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// Startet den Thread. Er holt sich den Zustand einmal aus dem `AppHandle`; `manage` ist dann
/// schon gelaufen (`lib.rs`, `richte_ein`).
pub fn starte(app: AppHandle, signal: Receiver<()>) -> std::io::Result<()> {
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
    use crate::befehle::tests::{FakeSuite, Stelluhr, eingerichteter_testrechner, gesunde_suite, versiegele_einen, warte_bis};

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
        tx.send(()).unwrap();
        warte_bis(|| !suite.anfragen().is_empty());
        std::thread::sleep(Duration::from_millis(300));
        assert_eq!(pfade(&suite), ["POST /api/anker"], "nach einer Versiegelung nur die Anker");

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
        let (tx, rx) = mpsc::channel::<()>();
        let z2 = Arc::clone(&z);
        let faden = std::thread::spawn(move || schleife(&z2, &rx, Duration::from_millis(200)));
        warte_bis(|| pfade(&suite).iter().filter(|p| *p == "GET /api/stammdaten").count() >= 2);
        drop(tx);
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
        tx.send(()).unwrap();
        warte_bis(|| suite.anfragen().len() >= 2);

        suite.setze(gesunde_suite);
        tx.send(()).unwrap();
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
        runde(&z, Runde::Voll);
        crate::befehle::richte_entwicklung_ein(&z, None, None).unwrap();
        runde(&z, Runde::Voll);
        runde(&z, Runde::NurAnker);
        assert!(suite.anfragen().is_empty());
    }

    /// Ein widerrufener Rechner bekäme nur wieder 401 — der Thread lässt ihn in Ruhe.
    #[test]
    fn widerrufen_keine_anfrage() {
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        z.buch().as_mut().unwrap().widerrufen_setzen(true).unwrap();
        runde(&z, Runde::Voll);
        assert!(suite.anfragen().is_empty());
    }
}
