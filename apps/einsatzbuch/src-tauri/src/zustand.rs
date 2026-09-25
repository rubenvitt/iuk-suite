//! Der geteilte Zustand der Hülle: der App-Datenordner, das offene Buch, ein Startfehler und
//! die Anbindung an die Suite (Sitzung, laufende Anmeldung, Transport, Tresor, Signal an den
//! Abgleich-Thread). Befehle, Frist-Uhr und Abgleich-Thread teilen sich **eine**
//! Datenbankverbindung hinter einem Mutex. Die noch nicht quittierte Versiegelung steht seit
//! Schema v3 im Buch selbst (`Buch::unquittiert`), nicht hier. Die Sicherung schreiben der
//! Abgleich-Thread und der Befehl „Sicherungsordner wählen“ (`sicherung::sichere_jetzt`); der
//! Mutex `sicherung` reiht die beiden ein.
//!
//! Sperrreihenfolge: `sicherung` (falls gebraucht) vor allem anderen, dann `buch`, dann höchstens
//! ein Blatt, nie umgekehrt. `sicherung` nimmt nur `sichere_jetzt`, und niemand ruft es unter
//! einem anderen Lock; es darf über der Datei-I/O im Sicherungsordner gehalten werden, denn es
//! sperrt nur den zweiten Schreiber, und unter ihm wird `buch` nur kurz genommen. Über der
//! Meldung an die Suite ist es schon wieder frei. `startfehler`, `sitzung`, `anmeldung`,
//! `abgleich` und `update` sind Blätter: Wer einen von ihnen hält, nimmt keinen weiteren Mutex.
//! Kein anderer Lock wird über eine Anfrage an die Suite oder den Update-Endpunkt, das Warten auf
//! den Anmelderückruf, einen Dialog oder das Schreiben und Prüfen einer Datei außerhalb des
//! App-Datenordners (Sicherungsordner) gehalten. Den Versiegelungshinweis schreibt der Kern in
//! derselben Transaktion wie den Block, und `lies_status` liest ihn unter dem Buch-Lock. So
//! sieht die Oberfläche nie einen halben Stand, etwa einen schon versiegelten Block ohne die
//! zugehörige Versiegelung. Ein vergifteter Mutex (Panik in einem
//! anderen Thread, während er gehalten wurde) wird übernommen statt weiterzupaniken: Die
//! Datenbank sichert sich über ihre Transaktionen selbst, und eine stehengebliebene App wäre
//! schlimmer.
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use einsatzbuch_kern::anmeldung::SUITE_VORGABE;
use einsatzbuch_kern::buch::{Buch, BuchFehler, erkenne_betrieb};
use einsatzbuch_kern::erfassung::Versiegelung;
use einsatzbuch_kern::krypto::SystemZufall;
use einsatzbuch_kern::suite::Transport;
use einsatzbuch_kern::tresor::Tresor;
use einsatzbuch_kern::uhr::Uhr;

use crate::abgleich::Anstoss;
use crate::befehle::Sitzung;
use crate::updater::Vorgemerkt;

pub struct Zustand {
    /// `app_data_dir`, dort liegen `einsatzbuch.db` bzw. `einsatzbuch-test.db`.
    pub ordner: PathBuf,
    /// EINE Verbindung, geteilt mit der Frist-Uhr. `None`, solange der Rechner nicht
    /// eingerichtet ist (keine Datenbankdatei im Ordner) oder die Datei sich nicht öffnen ließ.
    pub buch: Mutex<Option<Buch>>,
    /// Gesetzt, wenn die Datenbank beim Start (oder beim Wiederöffnen nach einem
    /// gescheiterten „Testbetrieb beenden“) nicht zu öffnen war. Dann bleibt das Buch `None`,
    /// und jeder schreibende Befehl lehnt mit diesem Text ab: Nichts darf die Datei
    /// überschreiben oder löschen, solange unklar ist, was darin steht.
    pub startfehler: Mutex<Option<String>>,
    pub uhr: Box<dyn Uhr>,
    /// Die Verwaltungssitzung (Spec §4.4). `None` nach dem Sperren, nach Ablauf und nach
    /// einer 401 der Suite; das Token wird beim Verwerfen überschrieben.
    pub sitzung: Mutex<Option<Sitzung>>,
    /// Abbruch-Flag der laufenden Anmeldung; `Some`, solange die App auf den Rückruf wartet.
    pub anmeldung: Mutex<Option<Arc<AtomicBool>>>,
    /// HTTP zur Suite: `NetzTransport` im Betrieb, ein Fake in Tests.
    pub transport: Box<dyn Transport>,
    /// Geräte-Token: Schlüsselbund des Betriebssystems im Betrieb, `Speichertresor` in Tests.
    pub tresor: Box<dyn Tresor>,
    /// Signal an den Abgleich-Thread (`abgleich.rs`): „es gibt einen neuen Block“ (sichern und
    /// Anker melden).
    pub abgleich: Mutex<Option<Sender<Anstoss>>>,
    /// Reiht die Schreiber der Sicherung ein (`sicherung::sichere_jetzt`): Abgleich-Thread und
    /// „Sicherungsordner wählen“. Ohne ihn rotierten zwei Läufe gleichzeitig, oder ein älterer
    /// Stand schriebe nach einem neueren und meldete eine längere Kette im Ordner.
    pub sicherung: Mutex<()>,
    /// Suite-Adresse eines echten Rechners (`anmeldung::SUITE_VORGABE`); ein echter Rechner
    /// verbindet sich mit keiner anderen.
    pub suite_vorgabe: String,
    /// Ein gefundenes, noch nicht installiertes Update (`updater.rs`). Nur im Release-Build je
    /// gesetzt.
    pub update: Mutex<Option<Vorgemerkt>>,
}

/// Was die Anbindung an die Suite mitbringt — im Betrieb Netz und Schlüsselbund, in Tests Fakes.
pub struct Anbindungsteile {
    pub transport: Box<dyn Transport>,
    pub tresor: Box<dyn Tresor>,
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
    pub fn neu(ordner: PathBuf, buch: Option<Buch>, uhr: Box<dyn Uhr>, teile: Anbindungsteile) -> Zustand {
        Zustand {
            ordner,
            buch: Mutex::new(buch),
            startfehler: Mutex::new(None),
            uhr,
            sitzung: Mutex::new(None),
            anmeldung: Mutex::new(None),
            transport: teile.transport,
            tresor: teile.tresor,
            abgleich: Mutex::new(None),
            sicherung: Mutex::new(()),
            suite_vorgabe: SUITE_VORGABE.to_string(),
            update: Mutex::new(None),
        }
    }

    /// Baut den Zustand beim Start: Ordner anlegen, Buch öffnen und eine überfällige Frist
    /// versiegeln (Spec §4.3), bevor die Oberfläche erscheint; der Hinweis darauf steht danach
    /// im Buch, wie jeder aus einem früheren Lauf. Lässt sich die Datenbank nicht
    /// öffnen, bricht der Start nicht ab: Das Buch bleibt `None`, der Fehler steht in
    /// `startfehler` und erreicht die Oberfläche über den Status. Unter Windows hat ein
    /// Release-Build keine Konsole, ein Abbruch wäre dort stumm. Scheitert nur die
    /// Frist-Prüfung, wird das geloggt; die Frist-Uhr versucht es in 15 Sekunden erneut.
    pub fn beim_start(ordner: PathBuf, uhr: Box<dyn Uhr>, teile: Anbindungsteile) -> Zustand {
        let geoeffnet = std::fs::create_dir_all(&ordner).map_err(BuchFehler::from).and_then(|()| oeffne_buch(&ordner));
        let (mut buch, startfehler) = match geoeffnet {
            Ok(buch) => (buch, None),
            Err(fehler) => {
                let text = startfehler_text(fehler);
                eprintln!("{text}");
                (None, Some(text))
            }
        };
        if let Some(buch) = buch.as_mut() {
            if let Err(fehler) = buch.pruefe_frist(uhr.jetzt(), &mut SystemZufall) {
                eprintln!("Frist-Prüfung beim Start fehlgeschlagen: {fehler}");
            }
        }
        let zustand = Zustand::neu(ordner, buch, uhr, teile);
        *zustand.startfehler() = startfehler;
        zustand
    }

    pub fn buch(&self) -> MutexGuard<'_, Option<Buch>> {
        self.buch.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn startfehler(&self) -> MutexGuard<'_, Option<String>> {
        self.startfehler.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn sitzung(&self) -> MutexGuard<'_, Option<Sitzung>> {
        self.sitzung.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn anmeldung(&self) -> MutexGuard<'_, Option<Arc<AtomicBool>>> {
        self.anmeldung.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn abgleich(&self) -> MutexGuard<'_, Option<Sender<Anstoss>>> {
        self.abgleich.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn update(&self) -> MutexGuard<'_, Option<Vorgemerkt>> {
        self.update.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Sperrt die Sicherung für einen Schreiber (Sperrreihenfolge oben: vor `buch`).
    pub fn sicherung(&self) -> MutexGuard<'_, ()> {
        self.sicherung.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Weckt den Abgleich-Thread. `NeuerBlock` rufen Versiegeln, Frist-Uhr, Einrichten, Neu
    /// einrichten und Wiederherstellen. Ohne laufenden Thread (Tests, oder der Thread ist
    /// beendet) geschieht nichts.
    pub fn stosse_an(&self, anstoss: Anstoss) {
        if let Some(signal) = self.abgleich().as_ref() {
            let _ = signal.send(anstoss);
        }
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

    /// Prüft die Frist mit der Uhr des Zustands (Spec §4.3). Ohne Buch ist nichts zu tun. Eine
    /// neue Versiegelung merkt der Kern in derselben Transaktion als unquittiert vor.
    pub fn pruefe_frist(&self) -> Result<Option<Versiegelung>, String> {
        let mut buch = self.buch();
        let Some(offen) = buch.as_mut() else { return Ok(None) };
        let ergebnis = offen.pruefe_frist(self.uhr.jetzt(), &mut SystemZufall).map_err(crate::befehle::fehler_text)?;
        drop(buch);
        if ergebnis.is_some() {
            self.stosse_an(Anstoss::NeuerBlock);
        }
        Ok(ergebnis)
    }
}
