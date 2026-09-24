//! Die Tauri-Befehle, die Schnittstelle der Oberfläche. Argumente kommen camelCase über
//! `invoke` (Tauri übersetzt `spkiPfad` in `spki_pfad`), Rückgaben serialisieren camelCase.
//! Fehler gehen als deutscher `String` hinaus.
//!
//! Jeder Befehl ist eine dünne Hülle um eine Funktion auf `&Zustand`. Die Funktionen kennen
//! kein Tauri und lassen sich deshalb ohne Fenster testen (unten). Alle Befehle laufen mit
//! `async` im Thread-Pool statt auf dem Hauptthread: Versiegeln schließt ein `VACUUM` ein,
//! und das soll das Fenster nicht einfrieren.
#[cfg(debug_assertions)]
use std::path::Path;

use einsatzbuch_kern::buch::{self, Betrieb, BuchFehler};
use einsatzbuch_kern::einrichtung::Stammdatenpaket;
use einsatzbuch_kern::erfassung::{Ausstehend, Entwurf, ErfassungFehler, Versiegelung, formatiere_zeitpunkt};
use einsatzbuch_kern::krypto::SystemZufall;
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt;

use crate::zustand::Zustand;

const NICHT_EINGERICHTET: &str = "Dieser Rechner ist noch nicht eingerichtet.";

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

fn buch_fehler_text(e: BuchFehler) -> String {
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
    /// Die noch nicht quittierte Versiegelung, aus der Frist-Uhr oder „Jetzt versiegeln“.
    pub versiegelung: Option<Versiegelung>,
}

pub fn lies_status(z: &Zustand) -> Result<Status, String> {
    let jetzt = z.uhr.jetzt();
    let mut status = {
        let buch = z.buch();
        match buch.as_ref() {
            None => Status {
                betrieb: None,
                eingerichtet: false,
                entwicklung: cfg!(debug_assertions),
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
            },
            Some(buch) => {
                let einrichtung = buch.einrichtung().map_err(buch_fehler_text)?;
                let zone = einrichtung.as_ref().map_or("UTC", |e| e.paket.zeitzone.as_str());
                let kopf = buch.kettenkopf().map_err(buch_fehler_text)?;
                Status {
                    betrieb: Some(buch.betrieb()),
                    eingerichtet: einrichtung.is_some(),
                    entwicklung: cfg!(debug_assertions),
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
                    versiegelung: None,
                }
            }
        }
    };
    status.versiegelung = z.unquittiert().clone();
    Ok(status)
}

pub fn lies_stammdaten(z: &Zustand) -> Result<Stammdatenpaket, String> {
    let buch = z.buch();
    let buch = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
    let einrichtung = buch.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
    Ok(einrichtung.paket)
}

pub fn speichere_entwurf(z: &Zustand, entwurf: &Entwurf) -> Result<(), String> {
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch();
    let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    buch.speichere_entwurf(entwurf, jetzt).map_err(fehler_text)
}

pub fn verwirf_entwurf(z: &Zustand) -> Result<(), String> {
    let mut buch = z.buch();
    let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    buch.verwerfe_entwurf().map_err(fehler_text)
}

pub fn sende_ab(z: &Zustand, entwurf: &Entwurf) -> Result<Ausstehend, String> {
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch();
    let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    buch.sende_ab(entwurf, jetzt).map_err(fehler_text)
}

/// „Jetzt versiegeln“: versiegelt den ausstehenden Einsatz sofort, mit `verfallen = false`,
/// denn es gibt dann keinen Bearbeitungsstand, der verloren gehen könnte.
pub fn versiegele_jetzt(z: &Zustand) -> Result<Versiegelung, String> {
    let jetzt = z.uhr.jetzt();
    let ergebnis = {
        let mut buch = z.buch();
        let buch = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
        buch.versiegele_ausstehend(jetzt, &mut SystemZufall, false).map_err(fehler_text)?
    };
    let v = ergebnis.ok_or("Es gibt keinen abgesendeten Einsatz, der versiegelt werden könnte.")?;
    z.merke_versiegelung(v.clone());
    Ok(v)
}

/// Prüft die Frist sofort und gibt die unquittierte Versiegelung zurück. Das ist entweder die
/// eben entstandene oder eine, die die Frist-Uhr kurz vorher geschrieben hat: Zählt die
/// Oberfläche auf 0 herunter, kann die Uhr im Hintergrund schon zugeschlagen haben.
pub fn pruefe_frist_jetzt(z: &Zustand) -> Result<Option<Versiegelung>, String> {
    z.pruefe_frist()?;
    Ok(z.unquittiert().clone())
}

pub fn quittiere(z: &Zustand) {
    *z.unquittiert() = None;
}

/// Beendet den Testbetrieb. Das Buch wird nur im Testbetrieb aus dem Zustand genommen: Der
/// Kern verbraucht es auch im Fehlerfall, bei `Echt` wäre es sonst weg, obwohl nichts gelöscht
/// wurde. Danach sieht die Frist-Uhr `None`, und die App steht wieder bei „nicht eingerichtet“.
pub fn beende_testbetrieb(z: &Zustand) -> Result<(), String> {
    {
        let mut buch = z.buch();
        match buch.as_ref().map(|b| b.betrieb()) {
            Some(Betrieb::Test) => {}
            Some(Betrieb::Echt) => return Err("Testbetrieb beenden geht nur im Testbetrieb.".into()),
            None => return Err(NICHT_EINGERICHTET.into()),
        }
        let test = buch.take().expect("oben auf Some geprüft");
        buch::beende_testbetrieb(&z.ordner, test).map_err(buch_fehler_text)?;
    }
    quittiere(z);
    Ok(())
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
    let mut buch = z.buch();
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

#[tauri::command(async)]
pub fn status(z: State<'_, Zustand>) -> Result<Status, String> {
    lies_status(&z)
}

#[tauri::command(async)]
pub fn stammdaten(z: State<'_, Zustand>) -> Result<Stammdatenpaket, String> {
    lies_stammdaten(&z)
}

#[tauri::command(async)]
pub fn entwurf_speichern(z: State<'_, Zustand>, entwurf: Entwurf) -> Result<(), String> {
    speichere_entwurf(&z, &entwurf)
}

#[tauri::command(async)]
pub fn entwurf_verwerfen(z: State<'_, Zustand>) -> Result<(), String> {
    verwirf_entwurf(&z)
}

#[tauri::command(async)]
pub fn absenden(z: State<'_, Zustand>, entwurf: Entwurf) -> Result<Ausstehend, String> {
    sende_ab(&z, &entwurf)
}

#[tauri::command(async)]
pub fn jetzt_versiegeln(z: State<'_, Zustand>) -> Result<Versiegelung, String> {
    versiegele_jetzt(&z)
}

#[tauri::command(async)]
pub fn frist_pruefen(z: State<'_, Zustand>) -> Result<Option<Versiegelung>, String> {
    pruefe_frist_jetzt(&z)
}

#[tauri::command(async)]
pub fn versiegelung_quittieren(z: State<'_, Zustand>) -> Result<(), String> {
    quittiere(&z);
    Ok(())
}

#[tauri::command(async)]
pub fn testbetrieb_beenden(z: State<'_, Zustand>) -> Result<(), String> {
    beende_testbetrieb(&z)
}

/// Ob die App beim Anmelden am Betriebssystem startet. Eingeschaltet wird das bei der echten
/// Einrichtung, nie im Testbetrieb und nie in Debug-Builds; hier nur Lesen und Schalten für
/// die Verwaltung.
#[tauri::command(async)]
pub fn autostart_status(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| format!("Autostart ist nicht lesbar: {e}"))
}

#[tauri::command(async)]
pub fn autostart_setzen(app: AppHandle, an: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    let ergebnis = if an { autostart.enable() } else { autostart.disable() };
    ergebnis.map_err(|e| format!("Autostart ließ sich nicht umschalten: {e}"))
}

#[cfg(debug_assertions)]
#[tauri::command(async)]
pub fn entwicklung_einrichten(z: State<'_, Zustand>, spki_pfad: Option<String>, frist_minuten: Option<u32>) -> Result<(), String> {
    richte_entwicklung_ein(&z, spki_pfad.as_deref().map(Path::new), frist_minuten)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use chrono::{DateTime, Duration, Utc};
    use einsatzbuch_kern::buch::Buch;
    use einsatzbuch_kern::erfassung::PersonAuswahl;
    use einsatzbuch_kern::uhr::Uhr;

    use super::*;

    /// Eine Uhr, die der Test von außen stellt, während der Zustand sie besitzt.
    #[derive(Clone)]
    struct Stelluhr(Arc<Mutex<DateTime<Utc>>>);

    impl Stelluhr {
        fn neu() -> Stelluhr {
            Stelluhr(Arc::new(Mutex::new("2026-09-24T08:00:00Z".parse().unwrap())))
        }
        fn vor(&self, d: Duration) {
            *self.0.lock().unwrap() += d;
        }
    }

    impl Uhr for Stelluhr {
        fn jetzt(&self) -> DateTime<Utc> {
            *self.0.lock().unwrap()
        }
    }

    fn zustand(ordner: &Path, uhr: &Stelluhr) -> Zustand {
        let buch = buch::erkenne_betrieb(ordner).unwrap().map(|b| Buch::oeffne(ordner, b).unwrap());
        Zustand::neu(ordner.to_path_buf(), buch, None, Box::new(uhr.clone()))
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

        assert_eq!(versiegele_jetzt(&z).unwrap_err(), "Es gibt keinen abgesendeten Einsatz, der versiegelt werden könnte.");
        let mut unvollstaendig = entwurf();
        unvollstaendig.stichwort.clear();
        assert_eq!(sende_ab(&z, &unvollstaendig).unwrap_err(), "Fehlt: Alarmstichwort");

        sende_ab(&z, &entwurf()).unwrap();
        let v = versiegele_jetzt(&z).unwrap();
        assert_eq!(v.nummer, "T-2026-001");
        assert!(!v.verfallen);
        let s = lies_status(&z).unwrap();
        assert_eq!(s.versiegelung, Some(v.clone()));
        assert_eq!(s.kette, Kettenstand { anzahl: 1, letzter: Some(Kettenglied { block: 1, hash: v.hash.clone() }) });
        assert!(s.ausstehend.is_none());

        quittiere(&z);
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
        sende_ab(&z, &entwurf()).unwrap();
        speichere_entwurf(&z, &entwurf()).unwrap();

        uhr.vor(Duration::minutes(14));
        assert_eq!(pruefe_frist_jetzt(&z).unwrap(), None);
        uhr.vor(Duration::minutes(1));
        let v = pruefe_frist_jetzt(&z).unwrap().expect("Frist erreicht");
        assert!(v.verfallen, "ein ungespeicherter Formularstand verfällt");
        // Ein zweiter Aufruf liefert dieselbe, noch nicht quittierte Versiegelung.
        assert_eq!(pruefe_frist_jetzt(&z).unwrap(), Some(v));
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
}
