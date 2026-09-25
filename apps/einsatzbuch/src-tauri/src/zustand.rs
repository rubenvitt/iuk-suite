//! Der geteilte Zustand der Hülle: der App-Datenordner, das offene Buch, eine noch nicht
//! quittierte Versiegelung und ein Startfehler. Befehle und Frist-Uhr teilen sich **eine**
//! Datenbankverbindung hinter einem Mutex.
//!
//! Sperrreihenfolge: immer zuerst `buch`, dann höchstens einer der beiden anderen Mutexe
//! (`unquittiert` oder `startfehler`), nie umgekehrt und nie beide zugleich. Wer versiegelt,
//! schreibt `unquittiert` noch unter dem Buch-Lock, und `lies_status` liest es ebenfalls unter
//! dem Buch-Lock. So sieht die Oberfläche nie einen halben Stand, etwa einen schon
//! versiegelten Block ohne die zugehörige Versiegelung. Ein vergifteter Mutex (Panik in einem
//! anderen Thread, während er gehalten wurde) wird übernommen statt weiterzupaniken: Die
//! Datenbank sichert sich über ihre Transaktionen selbst, und eine stehengebliebene App wäre
//! schlimmer.
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use einsatzbuch_kern::buch::{Buch, BuchFehler, erkenne_betrieb};
use einsatzbuch_kern::erfassung::Versiegelung;
use einsatzbuch_kern::krypto::SystemZufall;
use einsatzbuch_kern::uhr::Uhr;

pub struct Zustand {
    /// `app_data_dir`, dort liegen `einsatzbuch.db` bzw. `einsatzbuch-test.db`.
    pub ordner: PathBuf,
    /// EINE Verbindung, geteilt mit der Frist-Uhr. `None`, solange der Rechner nicht
    /// eingerichtet ist (keine Datenbankdatei im Ordner) oder die Datei sich nicht öffnen ließ.
    pub buch: Mutex<Option<Buch>>,
    /// Die letzte Versiegelung, die die Oberfläche noch nicht quittiert hat, gleich ob sie aus
    /// der Frist-Uhr oder aus „Jetzt versiegeln“ stammt.
    pub unquittiert: Mutex<Option<Versiegelung>>,
    /// Gesetzt, wenn die Datenbank beim Start (oder beim Wiederöffnen nach einem
    /// gescheiterten „Testbetrieb beenden“) nicht zu öffnen war. Dann bleibt das Buch `None`,
    /// und jeder schreibende Befehl lehnt mit diesem Text ab: Nichts darf die Datei
    /// überschreiben oder löschen, solange unklar ist, was darin steht.
    pub startfehler: Mutex<Option<String>>,
    pub uhr: Box<dyn Uhr>,
}

/// Öffnet das Buch der Betriebsart, die im Ordner liegt, oder `None` ohne Datenbankdatei.
pub fn oeffne_buch(ordner: &Path) -> Result<Option<Buch>, BuchFehler> {
    match erkenne_betrieb(ordner)? {
        Some(betrieb) => Ok(Some(Buch::oeffne(ordner, betrieb)?)),
        None => Ok(None),
    }
}

pub fn startfehler_text(e: impl std::fmt::Display) -> String {
    format!("Die Datenbank dieses Rechners ließ sich nicht öffnen: {e}")
}

impl Zustand {
    pub fn neu(ordner: PathBuf, buch: Option<Buch>, unquittiert: Option<Versiegelung>, uhr: Box<dyn Uhr>) -> Zustand {
        Zustand {
            ordner,
            buch: Mutex::new(buch),
            unquittiert: Mutex::new(unquittiert),
            startfehler: Mutex::new(None),
            uhr,
        }
    }

    /// Baut den Zustand beim Start: Ordner anlegen, Buch öffnen und eine überfällige Frist
    /// versiegeln (Spec §4.3), bevor die Oberfläche erscheint. Lässt sich die Datenbank nicht
    /// öffnen, bricht der Start nicht ab: Das Buch bleibt `None`, der Fehler steht in
    /// `startfehler` und erreicht die Oberfläche über den Status. Unter Windows hat ein
    /// Release-Build keine Konsole, ein Abbruch wäre dort stumm. Scheitert nur die
    /// Frist-Prüfung, wird das geloggt; die Frist-Uhr versucht es in 15 Sekunden erneut.
    pub fn beim_start(ordner: PathBuf, uhr: Box<dyn Uhr>) -> Zustand {
        let geoeffnet = std::fs::create_dir_all(&ordner).map_err(BuchFehler::from).and_then(|()| oeffne_buch(&ordner));
        let (mut buch, startfehler) = match geoeffnet {
            Ok(buch) => (buch, None),
            Err(fehler) => {
                let text = startfehler_text(fehler);
                eprintln!("{text}");
                (None, Some(text))
            }
        };
        let mut unquittiert = None;
        if let Some(buch) = buch.as_mut() {
            match buch.pruefe_frist(uhr.jetzt(), &mut SystemZufall) {
                Ok(v) => unquittiert = v,
                Err(fehler) => eprintln!("Frist-Prüfung beim Start fehlgeschlagen: {fehler}"),
            }
        }
        let zustand = Zustand::neu(ordner, buch, unquittiert, uhr);
        *zustand.startfehler() = startfehler;
        zustand
    }

    pub fn buch(&self) -> MutexGuard<'_, Option<Buch>> {
        self.buch.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn unquittiert(&self) -> MutexGuard<'_, Option<Versiegelung>> {
        self.unquittiert.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn startfehler(&self) -> MutexGuard<'_, Option<String>> {
        self.startfehler.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Sperrt das Buch für einen schreibenden Befehl. Liegt ein Startfehler vor, wird mit ihm
    /// abgelehnt. Die Prüfung läuft unter dem Buch-Lock, damit kein Befehl zwischen Prüfung
    /// und Schreiben einen neu gesetzten Startfehler übersieht.
    pub fn buch_zum_schreiben(&self) -> Result<MutexGuard<'_, Option<Buch>>, String> {
        let buch = self.buch();
        if let Some(fehler) = self.startfehler().clone() {
            return Err(fehler);
        }
        Ok(buch)
    }

    /// Prüft die Frist mit der Uhr des Zustands (Spec §4.3). Ohne Buch ist nichts zu tun.
    /// Eine neue Versiegelung landet noch unter dem Buch-Lock in `unquittiert`.
    pub fn pruefe_frist(&self) -> Result<Option<Versiegelung>, String> {
        let mut buch = self.buch();
        let Some(offen) = buch.as_mut() else { return Ok(None) };
        let ergebnis = offen.pruefe_frist(self.uhr.jetzt(), &mut SystemZufall).map_err(crate::befehle::fehler_text)?;
        if let Some(v) = &ergebnis {
            *self.unquittiert() = Some(v.clone());
        }
        drop(buch);
        Ok(ergebnis)
    }
}
