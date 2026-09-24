//! Die Tauri-Befehle, die Schnittstelle der Oberfläche. Argumente kommen camelCase über
//! `invoke` (Tauri übersetzt `spkiPfad` in `spki_pfad`), Rückgaben serialisieren camelCase.
//! Fehler gehen als deutscher `String` hinaus.
//!
//! Jeder Befehl ist eine dünne Hülle um eine Funktion auf `&Zustand`. Die Funktionen kennen
//! kein Tauri und lassen sich deshalb ohne Fenster testen (unten). Die Befehle, die das Buch
//! sperren, laufen per `spawn_blocking` auf einem Thread für blockierende Arbeit: Sie warten
//! auf den Buch-Mutex und schließen beim Versiegeln ein `VACUUM` ein. Das soll weder das
//! Fenster noch die Worker der asynchronen Laufzeit aufhalten.
#[cfg(debug_assertions)]
use std::path::Path;

use einsatzbuch_kern::buch::{self, Betrieb, BuchFehler};
use einsatzbuch_kern::einrichtung::Stammdatenpaket;
use einsatzbuch_kern::erfassung::{Ausstehend, Entwurf, ErfassungFehler, Versiegelung, formatiere_zeitpunkt};
use einsatzbuch_kern::krypto::SystemZufall;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::zustand::{Zustand, oeffne_buch, startfehler_text};

const NICHT_EINGERICHTET: &str = "Dieser Rechner ist noch nicht eingerichtet.";
const NICHTS_AUSSTEHEND: &str = "Es gibt keinen abgesendeten Einsatz, der versiegelt werden könnte.";

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
    /// Die noch nicht quittierte Versiegelung, aus der Frist-Uhr oder „Jetzt versiegeln“.
    pub versiegelung: Option<Versiegelung>,
}

/// Liest den Status. `startfehler` und `versiegelung` werden unter dem Buch-Lock gelesen,
/// damit Kette, Ausstehendes und Versiegelung zum selben Stand gehören.
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
        },
        Some(buch) => {
            let einrichtung = buch.einrichtung().map_err(buch_fehler_text)?;
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
                versiegelung: None,
            }
        }
    };
    status.versiegelung = z.unquittiert().clone();
    drop(buch);
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
/// denn es gibt dann keinen Bearbeitungsstand, der verloren gehen könnte. Liegt nichts mehr
/// aus, weil die Frist-Uhr gerade zuvorgekommen ist, kommt deren noch nicht quittierte
/// Versiegelung zurück statt eines Fehlers: Der Klick war dann nicht vergeblich, der Einsatz
/// ist versiegelt.
pub fn versiegele_jetzt(z: &Zustand) -> Result<Versiegelung, String> {
    let jetzt = z.uhr.jetzt();
    let mut buch = z.buch_zum_schreiben()?;
    let offen = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
    let v = match offen.versiegele_ausstehend(jetzt, &mut SystemZufall, false).map_err(fehler_text)? {
        Some(v) => {
            *z.unquittiert() = Some(v.clone());
            v
        }
        None => z.unquittiert().clone().ok_or(NICHTS_AUSSTEHEND)?,
    };
    drop(buch);
    Ok(v)
}

/// Prüft die Frist sofort und gibt die unquittierte Versiegelung zurück. Das ist entweder die
/// eben entstandene oder eine, die die Frist-Uhr kurz vorher geschrieben hat: Zählt die
/// Oberfläche auf 0 herunter, kann die Uhr im Hintergrund schon zugeschlagen haben. Prüfung
/// und Lesen laufen unter demselben Buch-Lock.
pub fn pruefe_frist_jetzt(z: &Zustand) -> Result<Option<Versiegelung>, String> {
    let mut buch = z.buch_zum_schreiben()?;
    if let Some(offen) = buch.as_mut() {
        if let Some(v) = offen.pruefe_frist(z.uhr.jetzt(), &mut SystemZufall).map_err(fehler_text)? {
            *z.unquittiert() = Some(v);
        }
    }
    let v = z.unquittiert().clone();
    drop(buch);
    Ok(v)
}

pub fn quittiere(z: &Zustand) {
    let buch = z.buch();
    *z.unquittiert() = None;
    drop(buch);
}

/// Beendet den Testbetrieb. Das Buch wird nur im Testbetrieb aus dem Zustand genommen: Der
/// Kern verbraucht es auch im Fehlerfall, bei `Echt` wäre es sonst weg, obwohl nichts gelöscht
/// wurde. Danach sieht die Frist-Uhr `None`, und die App steht wieder bei „nicht eingerichtet“.
///
/// Scheitert das Löschen, ist das Buch trotzdem verbraucht. Dann wird die Datei neu geöffnet
/// und zurückgelegt, damit die App weiterläuft und die Frist-Uhr weiterprüft. Lässt sie sich
/// nicht mehr öffnen (etwa weil das Löschen halb durch ist), wird das ein Startfehler: Die
/// Oberfläche meldet es, und kein Befehl fasst die Datei mehr an.
pub fn beende_testbetrieb(z: &Zustand) -> Result<(), String> {
    let mut buch = z.buch_zum_schreiben()?;
    match buch.as_ref().map(|b| b.betrieb()) {
        Some(Betrieb::Test) => {}
        Some(Betrieb::Echt) => return Err("Testbetrieb beenden geht nur im Testbetrieb.".into()),
        None => return Err(NICHT_EINGERICHTET.into()),
    }
    let test = buch.take().expect("oben auf Some geprüft");
    if let Err(fehler) = buch::beende_testbetrieb(&z.ordner, test) {
        match oeffne_buch(&z.ordner) {
            Ok(wieder) => *buch = wieder,
            Err(oeffnen) => *z.startfehler() = Some(startfehler_text(oeffnen)),
        }
        return Err(buch_fehler_text(fehler));
    }
    *z.unquittiert() = None;
    drop(buch);
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
async fn blockierend<T, F>(app: AppHandle, f: F) -> Result<T, String>
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
    blockierend(app, |z| {
        quittiere(z);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn testbetrieb_beenden(app: AppHandle) -> Result<(), String> {
    blockierend(app, beende_testbetrieb).await
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
        Zustand::beim_start(ordner.to_path_buf(), Box::new(uhr.clone()))
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
        quittiere(&z);
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
}
