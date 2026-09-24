//! Der geteilte Zustand der Hülle: der App-Datenordner, das offene Buch und eine noch nicht
//! quittierte Versiegelung. Befehle und Frist-Uhr teilen sich **eine** Datenbankverbindung
//! hinter einem Mutex.
//!
//! Die beiden Mutexe werden nie gleichzeitig gehalten: erst das Buch sperren, das Ergebnis
//! nehmen, das Buch freigeben, dann `unquittiert` sperren. So kann es keine Verklemmung
//! zwischen Befehl und Frist-Uhr geben. Ein vergifteter Mutex (Panik in einem anderen Thread,
//! während er gehalten wurde) wird übernommen statt weiterzupaniken: Die Datenbank sichert
//! sich über ihre Transaktionen selbst, und eine stehengebliebene App wäre schlimmer.
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};

use einsatzbuch_kern::buch::Buch;
use einsatzbuch_kern::erfassung::Versiegelung;
use einsatzbuch_kern::krypto::SystemZufall;
use einsatzbuch_kern::uhr::Uhr;

pub struct Zustand {
    /// `app_data_dir`, dort liegen `einsatzbuch.db` bzw. `einsatzbuch-test.db`.
    pub ordner: PathBuf,
    /// EINE Verbindung, geteilt mit der Frist-Uhr. `None`, solange der Rechner nicht
    /// eingerichtet ist (keine Datenbankdatei im Ordner).
    pub buch: Mutex<Option<Buch>>,
    /// Die letzte Versiegelung, die die Oberfläche noch nicht quittiert hat, gleich ob sie aus
    /// der Frist-Uhr oder aus „Jetzt versiegeln“ stammt.
    pub unquittiert: Mutex<Option<Versiegelung>>,
    pub uhr: Box<dyn Uhr>,
}

impl Zustand {
    pub fn neu(ordner: PathBuf, buch: Option<Buch>, unquittiert: Option<Versiegelung>, uhr: Box<dyn Uhr>) -> Zustand {
        Zustand { ordner, buch: Mutex::new(buch), unquittiert: Mutex::new(unquittiert), uhr }
    }

    pub fn buch(&self) -> MutexGuard<'_, Option<Buch>> {
        self.buch.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn unquittiert(&self) -> MutexGuard<'_, Option<Versiegelung>> {
        self.unquittiert.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Merkt sich eine neue Versiegelung für die Oberfläche. Nur aufrufen, nachdem der
    /// Buch-Mutex freigegeben ist.
    pub fn merke_versiegelung(&self, v: Versiegelung) {
        *self.unquittiert() = Some(v);
    }

    /// Prüft die Frist mit der Uhr des Zustands (Spec §4.3). Ohne Buch ist nichts zu tun.
    /// Eine neue Versiegelung landet in `unquittiert`. Der Buch-Mutex ist nur für die Dauer der
    /// Prüfung gesperrt.
    pub fn pruefe_frist(&self) -> Result<Option<Versiegelung>, String> {
        let ergebnis = {
            let mut buch = self.buch();
            match buch.as_mut() {
                Some(buch) => buch.pruefe_frist(self.uhr.jetzt(), &mut SystemZufall).map_err(crate::befehle::fehler_text)?,
                None => None,
            }
        };
        if let Some(v) = &ergebnis {
            self.merke_versiegelung(v.clone());
        }
        Ok(ergebnis)
    }
}
