//! Sicherung und Wiederherstellen am Rechner (Spec §4.5, Stufe 6, Entscheidungen 1, 2, 3 und 6).
//! Die Regeln der Datei stehen im Kern (`einsatzbuch_kern::sicherung`, `wiederherstellung`), hier
//! nur, wann gesichert wird, was mit dem Ergebnis geschieht und wie die Wiederherstellung Datei,
//! Suite und Buch zusammenbringt.
//!
//! - `sichere_jetzt` rufen der Abgleich-Thread (`abgleich.rs`, Entscheidung 1) und die Wahl des
//!   Sicherungsordners (`setze_sicherungsordner`), damit die Oberfläche das Ergebnis gleich sieht.
//!   Versiegeln und die übrigen Befehle stoßen den Thread an (`Zustand::stosse_an`), statt selbst
//!   zu schreiben: Das Versiegeln hängt an keinem Sicherungsordner (Review Focus 6). Die beiden
//!   Schreiber reiht der Mutex `Zustand::sicherung` ein.
//! - Weder `buch` noch ein Blatt wird über dem Prüfen oder Schreiben im Sicherungsordner, über
//!   einer Anfrage an die Suite oder über einem Dialog gehalten (`zustand.rs`, Sperrreihenfolge).
//! - Die Tauri-Befehle `sicherungsordner_waehlen` und `wiederherstellen` öffnen den Dialog im
//!   Thread für blockierende Arbeit und rufen danach genau eine Funktion auf `&Zustand`.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch, BuchFehler};
use einsatzbuch_kern::erfassung::formatiere_zeitpunkt;
use einsatzbuch_kern::format::Einsatz;
use einsatzbuch_kern::krypto;
use einsatzbuch_kern::sicherung::{self as kern_sicherung, Schreibergebnis, SicherungFehler, Sicherungsdatei, Sicherungsstufe};
use einsatzbuch_kern::suite::{self, SuiteFehler};
use einsatzbuch_kern::tresor::konto_fuer;
use einsatzbuch_kern::vertrag::Schluesselposten;
use einsatzbuch_kern::wiederherstellung;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use zeroize::{Zeroize, Zeroizing};

use crate::abgleich::Anstoss;
use crate::befehle::{KEIN_GERAETETOKEN, NICHT_EINGERICHTET, blockierend, buch_fehler_text, freigabe_fehler, gueltige_sitzung};
use crate::zustand::Zustand;

pub(crate) const NUR_IM_ECHTBETRIEB: &str = "Im Testbetrieb gibt es keine Sicherung.";
pub(crate) const ORDNER_UNGUELTIG: &str = "Der Sicherungsordner muss ein vorhandenes Verzeichnis sein.";
pub(crate) const SITZUNG_FREMD: &str =
    "Die Sitzung gehört nicht zu diesem Rechner. Bitte melde dich an diesem Rechner neu an.";
const WIEDERHERSTELLEN_BRAUCHT_VERBINDUNG: &str = "Wiederherstellen braucht Verbindung zur Suite.";

/// Der Stand der Sicherung im Status (Entscheidung 3). Die Oberfläche formuliert daraus „Letzte
/// Sicherung: … — Ordner nicht erreichbar“ bzw. „Noch kein Sicherungsordner gewählt“.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sicherungsstand {
    pub ordner: Option<String>,
    /// Zeitpunkt der letzten gelungenen Sicherung, in der Zone der Einrichtung.
    pub letzte: Option<String>,
    /// Text des letzten gescheiterten Versuchs; `None` nach einem Erfolg.
    pub fehler: Option<String>,
    pub stufe: Sicherungsstufe,
}

/// Ergebnis von „Wiederherstellen“.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wiederhergestellt {
    pub bloecke: u64,
}

/// Der Sicherungsstand für den Status, gelesen unter dem Buch-Lock der Aufruferin; `None` ohne
/// Einrichtung.
pub fn sicherungsstand(buch: &Buch, jetzt: DateTime<Utc>) -> Result<Option<Sicherungsstand>, BuchFehler> {
    Ok(buch.sicherungsangaben()?.map(|a| Sicherungsstand {
        stufe: kern_sicherung::stufe(buch.betrieb(), &a, jetzt),
        ordner: a.ordner,
        letzte: a.letzte,
        fehler: a.fehler,
    }))
}

/// Was eine Sicherung braucht, gelesen unter einem kurzen Buch-Lock.
struct Sicherungsgrundlage {
    ordner: String,
    suite_url: String,
    zeitzone: String,
    bloecke: Vec<einsatzbuch_kern::format::Block>,
    widerrufen: bool,
}

/// Liest die Grundlage; `None` heißt: nichts zu sichern (kein Buch, nicht eingerichtet,
/// Testbetrieb oder kein Ordner).
fn sicherungsgrundlage(z: &Zustand) -> Result<Option<Sicherungsgrundlage>, String> {
    let buch = z.buch();
    let Some(offen) = buch.as_ref() else { return Ok(None) };
    if offen.betrieb() != Betrieb::Echt {
        return Ok(None);
    }
    let Some(e) = offen.einrichtung().map_err(buch_fehler_text)? else { return Ok(None) };
    let Some(ordner) = offen.sicherungsangaben().map_err(buch_fehler_text)?.and_then(|a| a.ordner) else {
        return Ok(None);
    };
    Ok(Some(Sicherungsgrundlage {
        ordner,
        suite_url: e.suite_url,
        zeitzone: e.paket.zeitzone,
        bloecke: offen.bloecke().map_err(buch_fehler_text)?,
        widerrufen: offen.anbindung().map_err(buch_fehler_text)?.is_some_and(|a| a.widerrufen),
    }))
}

/// Vermerkt das Ergebnis im Buch, aber nur, wenn noch derselbe Ordner gewählt ist: Wurde er
/// während des Schreibens gewechselt, gilt das Ergebnis dem alten, und der Anstoß der neuen Wahl
/// sichert gleich danach in den neuen.
fn vermerke(z: &Zustand, ordner: &str, f: impl FnOnce(&mut Buch) -> Result<(), BuchFehler>) -> Result<(), String> {
    let mut buch = z.buch();
    let Some(offen) = buch.as_mut() else { return Ok(()) };
    if offen.sicherungsangaben().map_err(buch_fehler_text)?.and_then(|a| a.ordner).as_deref() != Some(ordner) {
        return Ok(());
    }
    f(offen).map_err(buch_fehler_text)
}

/// Sichert die Kette in den Sicherungsordner (Entscheidungen 1 und 2). Es rufen der
/// Abgleich-Thread und `setze_sicherungsordner`, nie unter einem anderen Lock.
/// 0. `Zustand::sicherung` nehmen und bis nach dem Vermerk halten: So rotieren zwei Läufe nie
///    gleichzeitig, und kein älterer Stand schreibt nach einem neueren. Buch-Locks darunter
///    bleiben kurz, und über der Meldung an die Suite ist der Mutex schon frei.
/// 1. Unter einem kurzen Lock Betrieb, Einrichtung, Ordner und Blöcke lesen, dann freigeben.
/// 2. Testbetrieb, keine Einrichtung oder kein Ordner: `Ok(None)`, nichts geschieht.
/// 3. `sicherung::schreibe` ohne Lock. Danach unter einem kurzen Lock `sicherung_gelungen` (auch
///    bei `Unveraendert`) bzw. `sicherung_gescheitert` mit dem Text, der dann auch `Err` ist.
///    Eine leere Kette (`LeereKette`) schreibt nie (`leere_kette`): Liegt im Ordner eine lesbare
///    Sicherung mit Blöcken, ist das eine längere Kette als die lokale, vermerkt wie
///    `VorhandeneLaenger`, also gelb (Review Focus 1, etwa vor einer Wiederherstellung). Ist der
///    Ordner nicht lesbar, ist das ein Fehlschlag. Sonst gilt die Sicherung als gelungen, denn es
///    gibt nichts zu sichern; gemeldet wird der Suite dann nichts.
/// 4. Nach einem Erfolg, mit Geräte-Token und ohne Widerruf: `suite::melde_sicherung`. Ein
///    Fehler dort geht nur ins Log.
///
/// `Ok(Some(erstellt))` nennt den Zeitpunkt der gelungenen Sicherung.
pub fn sichere_jetzt(z: &Zustand) -> Result<Option<String>, String> {
    let schreiber = z.sicherung();
    let jetzt = z.uhr.jetzt();
    let Some(g) = sicherungsgrundlage(z)? else { return Ok(None) };
    let erstellt = formatiere_zeitpunkt(jetzt, &g.zeitzone);
    let datei = Sicherungsdatei::neu(erstellt.clone(), g.bloecke);
    match kern_sicherung::schreibe(Path::new(&g.ordner), &datei) {
        Ok(Schreibergebnis::LeereKette) => {
            if let Err(text) = leere_kette(Path::new(&g.ordner)) {
                vermerke(z, &g.ordner, |b| b.sicherung_gescheitert(&text))?;
                return Err(text);
            }
            vermerke(z, &g.ordner, |b| b.sicherung_gelungen(&erstellt))?;
            return Ok(Some(erstellt));
        }
        Ok(Schreibergebnis::Geschrieben | Schreibergebnis::Unveraendert) => {
            vermerke(z, &g.ordner, |b| b.sicherung_gelungen(&erstellt))?;
        }
        Err(fehler) => {
            let text = fehler.to_string();
            vermerke(z, &g.ordner, |b| b.sicherung_gescheitert(&text))?;
            return Err(text);
        }
    }
    drop(schreiber);

    if !g.widerrufen {
        match z.tresor.lies(konto_fuer(Betrieb::Echt)).map(|t| t.map(Zeroizing::new)) {
            Ok(Some(geraet)) => {
                if let Err(e) = suite::melde_sicherung(&*z.transport, &g.suite_url, &geraet, &erstellt) {
                    eprintln!("Sicherung an die Suite melden: {e}");
                }
            }
            Ok(None) => {}
            Err(e) => eprintln!("Sicherung an die Suite melden: {e}"),
        }
    }
    Ok(Some(erstellt))
}

/// Bei leerer lokaler Kette: Ist der Ordner lesbar und liegt dort keine längere Kette, ist nichts
/// zu tun (`Ok`). `Err` mit dem Text für den Status, wenn der Ordner nicht lesbar ist, eine
/// vorhandene Datei sich wegen eines Ein-/Ausgabefehlers nicht lesen lässt oder sie Blöcke trägt.
/// Eine fremde oder kaputte Datei trägt keine lesbare Kette und gilt wie keine (so rotiert sie
/// auch `schreibe` beim ersten echten Block weg).
fn leere_kette(ordner: &Path) -> Result<(), String> {
    std::fs::read_dir(ordner).map_err(|e| SicherungFehler::Io(e).to_string())?;
    match kern_sicherung::lies(&ordner.join(kern_sicherung::DATEI)) {
        Ok(d) if d.bloecke.is_empty() => Ok(()),
        Ok(d) => Err(SicherungFehler::VorhandeneLaenger { vorhanden: d.bloecke.len(), lokal: 0 }.to_string()),
        Err(SicherungFehler::Io(e)) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(SicherungFehler::Json(_) | SicherungFehler::FremdesFormat | SicherungFehler::ZuGross { .. }) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Setzt den Sicherungsordner (`None` löscht ihn) und sichert gleich hinein (`sichere_jetzt`),
/// ohne Lock über der Datei-I/O. So nennt der Status direkt nach der Wahl das Ergebnis, auch einen
/// Ordner, in den sich nicht schreiben lässt (gelb); `Ok` heißt „gewählt“, das Scheitern der
/// Sicherung steht im Status. Nur im Echtbetrieb; der Ordner muss ein vorhandenes Verzeichnis mit
/// absolutem Pfad sein. Geprüft wird das ohne Lock, denn der Ordner kann auf einem Netzlaufwerk
/// liegen.
pub fn setze_sicherungsordner(z: &Zustand, ordner: Option<PathBuf>) -> Result<(), String> {
    pruefe_echtbetrieb(z, NUR_IM_ECHTBETRIEB)?;
    let text = match ordner {
        Some(pfad) => {
            if !pfad.is_absolute() || !pfad.is_dir() {
                return Err(ORDNER_UNGUELTIG.into());
            }
            Some(pfad.into_os_string().into_string().map_err(|_| ORDNER_UNGUELTIG.to_string())?)
        }
        None => None,
    };
    {
        let mut buch = z.buch_zum_schreiben()?;
        let offen = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
        if offen.betrieb() != Betrieb::Echt {
            return Err(NUR_IM_ECHTBETRIEB.into());
        }
        offen.sicherungsordner_setzen(text.as_deref()).map_err(buch_fehler_text)?;
    }
    if text.is_some() {
        if let Err(e) = sichere_jetzt(z) {
            eprintln!("Sicherung nach der Wahl des Ordners: {e}");
        }
    }
    Ok(())
}

/// Lehnt ohne eingerichtetes echtes Buch ab, mit `test` als Meldung im Testbetrieb.
fn pruefe_echtbetrieb(z: &Zustand, test: &str) -> Result<(), String> {
    let buch = z.buch_zum_schreiben()?;
    let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
    offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
    if offen.betrieb() != Betrieb::Echt {
        return Err(test.into());
    }
    Ok(())
}

/// Was die Wiederherstellung aus dem Buch braucht, gelesen unter einem kurzen Lock.
struct Wiederherstellungsgrundlage {
    suite_url: String,
    gepinnt: String,
    rechner_id: String,
}

/// Stellt eine Sicherung auf diesem Rechner wieder her (Spec §4.5, Entscheidung 6). Die Datei
/// wird **einmal** gelesen; Prüfung, Freigabe, Öffnen und Übernahme arbeiten auf demselben Wert.
/// 1. Die Sitzung gilt (wie bei `gib_schluessel_frei`) und ist an diesen Rechner gebunden.
/// 2. Echtbetrieb, eingerichtet, keine Blöcke und nichts Ausstehendes — die endgültige Prüfung
///    samt `nummern` läuft in der Transaktion von `Buch::uebernehme_sicherung`.
/// 3. Datei lesen (höchstens 256 MiB) und ohne Netz prüfen: Kette ab Block 1, gepinnte
///    `schluesselId`, nur `echt` (`wiederherstellung::pruefe_bloecke`).
/// 4. `GET anker` mit dem Geräte-Token für die Kette dieser Sicherung (`erster` = Hash ihres
///    Blocks 1, Entscheidung 5), dann die Ankerregel (`wiederherstellung::pruefe`).
/// 5. Alle Blöcke mit der Sitzung freigeben lassen; eine 401 verwirft die Sitzung.
/// 6. Jeden Block öffnen und die Nummern je Jahr zusammenfassen. Scheitert ein Block, bricht
///    alles ab. CEKs und Klartexte werden danach sofort verworfen, die CEKs (`Cek`, auf dem
///    Heap) überschrieben.
/// 7. Blöcke und Nummern in einer Transaktion übernehmen, die die Blöcke noch einmal prüft.
/// 8. `NeuerBlock` anstoßen: sichern und alle Anker für diesen Rechner melden.
pub fn stelle_wieder_her(z: &Zustand, datei: &Path) -> Result<Wiederhergestellt, String> {
    let (token, sitzung_rechner) = gueltige_sitzung(z)?;
    let g = {
        let buch = z.buch_zum_schreiben()?;
        let offen = buch.as_ref().ok_or(NICHT_EINGERICHTET)?;
        let e = offen.einrichtung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        if offen.betrieb() != Betrieb::Echt {
            return Err(BuchFehler::NurImEchtbetrieb.to_string());
        }
        let a = offen.anbindung().map_err(buch_fehler_text)?.ok_or(NICHT_EINGERICHTET)?;
        let ausstehend = offen.ausstehend().map_err(crate::befehle::fehler_text)?;
        if offen.kettenkopf().map_err(buch_fehler_text)?.is_some() || ausstehend.is_some() {
            return Err(BuchFehler::KetteNichtLeer.to_string());
        }
        Wiederherstellungsgrundlage { suite_url: e.suite_url, gepinnt: e.schluessel_id, rechner_id: a.rechner_id }
    };
    if sitzung_rechner.as_deref() != Some(g.rechner_id.as_str()) {
        return Err(SITZUNG_FREMD.into());
    }

    let sicherung = kern_sicherung::lies(datei).map_err(|e| e.to_string())?;
    wiederherstellung::pruefe_bloecke(&sicherung.bloecke, &g.gepinnt).map_err(|e| e.to_string())?;

    // `pruefe_bloecke` lehnt eine leere Kette schon ab; `first` statt Index, damit hier nie eine
    // Panik entstehen kann.
    let erster = sicherung.bloecke.first().map(|b| b.hash.as_str());
    let erster = erster.ok_or_else(|| wiederherstellung::Wiederherstellungsfehler::Leer.to_string())?;
    let geraet = z.tresor.lies(konto_fuer(Betrieb::Echt))?.map(Zeroizing::new).ok_or(KEIN_GERAETETOKEN)?;
    let anker = suite::hole_kettenanker(&*z.transport, &g.suite_url, &geraet, erster).map_err(|e| match e {
        SuiteFehler::NichtErreichbar(_) => WIEDERHERSTELLEN_BRAUCHT_VERBINDUNG.to_string(),
        e => e.to_string(),
    })?;
    wiederherstellung::pruefe(&sicherung, &g.gepinnt, anker.as_ref().map(|(block, hash)| (*block, hash.as_str())))
        .map_err(|e| e.to_string())?;

    let schluessel = suite::gib_frei(&*z.transport, &g.suite_url, &token, &sicherung.bloecke)
        .map_err(|e| freigabe_fehler(z, &token, e, WIEDERHERSTELLEN_BRAUCHT_VERBINDUNG))?;
    let nummern = {
        let ceks = entpacke(schluessel)?;
        let einsaetze = oeffne_alle(&sicherung, &ceks)?;
        wiederherstellung::nummern(&einsaetze).map_err(|e| e.to_string())?
        // `einsaetze` und `ceks` enden hier; die CEKs überschreibt `Zeroizing` beim Drop.
    };

    {
        let mut buch = z.buch_zum_schreiben()?;
        let offen = buch.as_mut().ok_or(NICHT_EINGERICHTET)?;
        offen.uebernehme_sicherung(&sicherung.bloecke, &nummern).map_err(buch_fehler_text)?;
    }
    z.stosse_an(Anstoss::NeuerBlock);
    Ok(Wiederhergestellt { bloecke: sicherung.bloecke.len() as u64 })
}

/// Die CEKs der Freigabe als Bytes je Block. Jeder Base64-Text wird gleich nach dem Lesen
/// überschrieben, auch wenn ein anderer Posten scheitert: Die Posten werden verbraucht, und was
/// übrig ist, wischt die Schleife bzw. `Zeroizing` beim Verlassen.
fn entpacke(mut posten: Vec<Schluesselposten>) -> Result<BTreeMap<u64, Cek>, String> {
    let mut ceks = BTreeMap::new();
    let mut fehler = None;
    for p in &mut posten {
        if fehler.is_none() {
            match cek_aus(&p.cek) {
                Ok(cek) => {
                    ceks.insert(p.block, cek);
                }
                Err(e) => fehler = Some(format!("Die Suite hat für Block {} keinen gültigen Schlüssel geliefert: {e}", p.block)),
            }
        }
        p.cek.zeroize();
    }
    match fehler {
        Some(text) => Err(text),
        None => Ok(ceks),
    }
}

/// Ein CEK auf dem Heap: Die Bytes werden erst nach dem Anlegen der Box hineinkopiert und danach
/// nie als Wert bewegt (nur die Box), also bleibt keine ungewischte Kopie auf dem Stack. Beim Drop
/// überschreibt `Zeroizing` sie.
type Cek = Box<Zeroizing<[u8; 32]>>;

/// Ein CEK aus Base64, genau 32 Byte. Der dekodierte Puffer liegt nur in `Zeroizing`.
fn cek_aus(text: &str) -> Result<Cek, String> {
    let roh = Zeroizing::new(krypto::aus_b64(text).map_err(|e| e.to_string())?);
    let mut cek: Cek = Box::new(Zeroizing::new([0u8; 32]));
    if roh.len() != cek.len() {
        return Err(format!("{} statt 32 Byte", roh.len()));
    }
    cek.copy_from_slice(&roh);
    Ok(cek)
}

/// Öffnet jeden Block der Sicherung mit seinem CEK; der erste, der scheitert, bricht alles ab.
fn oeffne_alle(sicherung: &Sicherungsdatei, ceks: &BTreeMap<u64, Cek>) -> Result<Vec<Einsatz>, String> {
    sicherung
        .bloecke
        .iter()
        .map(|b| {
            let block = b.kopf.block;
            let cek = ceks.get(&block).ok_or_else(|| format!("Die Suite hat Block {block} nicht freigegeben."))?;
            krypto::oeffne_block(b, cek).map_err(|e| format!("Block {block} der Sicherung ließ sich nicht öffnen: {e}"))
        })
        .collect()
}

/// „Sicherungsordner wählen“: der Ordnerdialog des Systems, dann `setze_sicherungsordner`.
/// `None` heißt: im Dialog abgebrochen.
#[tauri::command]
pub async fn sicherungsordner_waehlen(app: AppHandle) -> Result<Option<String>, String> {
    let dialog = app.clone();
    blockierend(app, move |z| {
        let Some(gewaehlt) = dialog.dialog().file().set_title("Sicherungsordner wählen").blocking_pick_folder() else {
            return Ok(None);
        };
        let pfad = gewaehlt.into_path().map_err(|_| ORDNER_UNGUELTIG.to_string())?;
        let text = pfad.display().to_string();
        setze_sicherungsordner(z, Some(pfad))?;
        Ok(Some(text))
    })
    .await
}

/// „Wiederherstellen“: der Dateidialog des Systems (nur `.json`), dann `stelle_wieder_her`.
/// `None` heißt: im Dialog abgebrochen.
#[tauri::command]
pub async fn wiederherstellen(app: AppHandle) -> Result<Option<Wiederhergestellt>, String> {
    let dialog = app.clone();
    blockierend(app, move |z| {
        let Some(gewaehlt) = dialog
            .dialog()
            .file()
            .set_title("Sicherung wiederherstellen")
            .add_filter("Einsatzbuch-Sicherung", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let pfad = gewaehlt.into_path().map_err(|_| "Die gewählte Datei ist keine lokale Datei.".to_string())?;
        stelle_wieder_her(z, &pfad).map(Some)
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;

    use aes_gcm::aead::{Aead, Payload};
    use aes_gcm::{Aes256Gcm, KeyInit};
    use base64::Engine as _;
    use chrono::Duration as TimeDelta;
    use einsatzbuch_kern::format::{Block, Blockkopf, Umschlag};
    use einsatzbuch_kern::krypto;
    use einsatzbuch_kern::sicherung::{self as kern_sicherung, Sicherungsdatei};
    use einsatzbuch_kern::suite::Antwort;
    use einsatzbuch_kern::tresor::Speichertresor;
    use hkdf::Hkdf;
    use p256::{PublicKey, SecretKey, ecdh};
    use serde_json::{Value, json};
    use sha2::Sha256;

    use super::*;
    use crate::abgleich::{Anstoss, Lauf, runde};
    use crate::befehle::tests::{
        Aufgezeichnet, Browser, FakeSuite, Stelluhr, antwort, eingerichteter_echter_rechner, eingerichteter_testrechner, fehler,
        gesunde_suite, versiegele_einen, warte_bis, zustand_mit,
    };
    use crate::befehle::{SITZUNG_ABGELAUFEN, lies_bloecke, lies_status, melde_ab, melde_an};

    fn pfade(suite: &FakeSuite) -> Vec<String> {
        suite.anfragen().iter().map(|a| format!("{} {}", a.methode, a.pfad())).collect()
    }

    fn stand(z: &Zustand) -> Sicherungsstand {
        lies_status(z).unwrap().sicherung.expect("eingerichtet, also mit Sicherungsstand")
    }

    fn datei_in(ordner: &Path) -> PathBuf {
        ordner.join(kern_sicherung::DATEI)
    }

    /// Ein echter Rechner mit gewähltem Sicherungsordner.
    fn echter_rechner_mit_ordner(ordner: &Path, ziel: &Path) -> (Zustand, FakeSuite) {
        echter_rechner_mit_ordner_und_uhr(ordner, ziel, &Stelluhr::neu())
    }

    fn echter_rechner_mit_ordner_und_uhr(ordner: &Path, ziel: &Path, uhr: &Stelluhr) -> (Zustand, FakeSuite) {
        let (z, suite) = eingerichteter_echter_rechner(ordner, uhr);
        setze_sicherungsordner(&z, Some(ziel.to_path_buf())).unwrap();
        (z, suite)
    }

    // -----------------------------------------------------------------------------------------
    // Sicherung im Abgleich-Thread
    // -----------------------------------------------------------------------------------------

    #[test]
    fn nach_einem_neuen_block_liegt_die_sicherung_im_ordner_und_die_suite_erfaehrt_es() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = echter_rechner_mit_ordner(ordner.path(), ziel.path());
        versiegele_einen(&z);
        suite.leere();

        runde(&z, Lauf::NEUER_BLOCK);

        let gesichert = kern_sicherung::lies(&datei_in(ziel.path())).unwrap();
        assert_eq!(gesichert.bloecke, lies_bloecke(&z).unwrap());
        assert_eq!(pfade(&suite), ["POST /api/sicherung", "POST /api/anker"], "erst sichern, dann Anker");
        let meldung = &suite.anfragen()[0];
        assert_eq!(meldung.bearer.as_deref(), Some("geraet-neu"), "mit dem Geräte-Token");
        let s = stand(&z);
        assert_eq!(s.stufe, Sicherungsstufe::Ok);
        assert_eq!(s.fehler, None);
        assert_eq!(s.ordner.as_deref(), ziel.path().to_str());
        assert_eq!(s.letzte.as_deref(), Some(gesichert.erstellt.as_str()));
        assert_eq!(meldung.json.as_ref().unwrap()["erstellt"], gesichert.erstellt.as_str());
        assert_eq!(serde_json::to_value(&s).unwrap()["stufe"], "ok");
    }

    /// Review Focus 6: Ein verschwundener Ordner ändert am Versiegeln nichts; der Stand wird gelb,
    /// mit dem Fehlertext und der letzten gelungenen Sicherung.
    #[test]
    fn ordner_geloescht_versiegeln_gelingt_und_der_stand_wird_gelb() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = echter_rechner_mit_ordner(ordner.path(), ziel.path());
        versiegele_einen(&z);
        runde(&z, Lauf::NEUER_BLOCK);
        let zuletzt = stand(&z).letzte.expect("die erste Sicherung ist gelungen");

        let weg = ziel.path().to_path_buf();
        drop(ziel);
        assert!(!weg.exists());
        suite.leere();
        let v = versiegele_einen(&z);
        assert_eq!(v.block, 2, "versiegelt wird trotzdem");
        runde(&z, Lauf::NEUER_BLOCK);

        let s = stand(&z);
        assert_eq!(s.stufe, Sicherungsstufe::Gelb);
        let text = s.fehler.expect("der Fehler steht im Status");
        assert!(text.starts_with("Die Sicherungsdatei ließ sich nicht lesen oder schreiben"), "{text}");
        assert_eq!(s.letzte.as_deref(), Some(zuletzt.as_str()), "die letzte gelungene bleibt stehen");
        assert_eq!(pfade(&suite), ["POST /api/anker"], "keine Meldung einer Sicherung, die nicht gelang");
        assert_eq!(lies_status(&z).unwrap().kette.anzahl, 2);
    }

    #[test]
    fn test_rechner_sichert_nicht_und_zeigt_aus() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        assert_eq!(setze_sicherungsordner(&z, Some(ziel.path().to_path_buf())).unwrap_err(), NUR_IM_ECHTBETRIEB);
        // Selbst mit einem Ordner in der Datenbank (etwa von Hand gesetzt) schreibt er nichts.
        z.buch().as_mut().unwrap().sicherungsordner_setzen(ziel.path().to_str()).unwrap();
        versiegele_einen(&z);
        suite.leere();

        assert_eq!(sichere_jetzt(&z), Ok(None));
        runde(&z, Lauf::START);
        assert!(!datei_in(ziel.path()).exists());
        assert!(!pfade(&suite).contains(&"POST /api/sicherung".to_string()), "{:?}", pfade(&suite));
        let s = stand(&z);
        assert_eq!(s.stufe, Sicherungsstufe::Aus);
        assert_eq!(serde_json::to_value(&s).unwrap()["stufe"], "aus");
    }

    #[test]
    fn suite_offline_die_sicherung_wird_trotzdem_geschrieben() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = echter_rechner_mit_ordner(ordner.path(), ziel.path());
        versiegele_einen(&z);
        suite.setze(|_| Err("keine Verbindung".into()));

        runde(&z, Lauf::NEUER_BLOCK);
        assert_eq!(kern_sicherung::lies(&datei_in(ziel.path())).unwrap().bloecke.len(), 1);
        let s = stand(&z);
        assert_eq!(s.stufe, Sicherungsstufe::Ok);
        assert!(s.letzte.is_some());
    }

    fn namen_in(ordner: &Path) -> Vec<String> {
        let mut namen: Vec<String> =
            std::fs::read_dir(ordner).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        namen.sort();
        namen
    }

    /// Fix-Runde 1, A (ändert Entscheidung 1): Auch die stündliche Runde sichert zuerst. Bei
    /// unveränderter Kette heißt das `Unveraendert`: kein Schreiben, keine Rotation, aber
    /// `letzte` wird aufgefrischt und der Suite gemeldet.
    #[test]
    fn stuendliche_runde_bestaetigt_die_sicherung_ohne_zu_rotieren() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, suite) = echter_rechner_mit_ordner_und_uhr(ordner.path(), ziel.path(), &uhr);
        versiegele_einen(&z);
        runde(&z, Lauf::NEUER_BLOCK);
        let vorher = std::fs::read(datei_in(ziel.path())).unwrap();
        let erste = stand(&z).letzte.expect("gesichert");
        suite.leere();

        uhr.vor(TimeDelta::hours(1));
        runde(&z, Lauf::STUENDLICH);
        assert_eq!(std::fs::read(datei_in(ziel.path())).unwrap(), vorher, "nicht neu geschrieben");
        assert_eq!(namen_in(ziel.path()), [kern_sicherung::DATEI], "nicht rotiert");
        assert_eq!(pfade(&suite), ["POST /api/sicherung", "GET /api/stammdaten", "POST /api/anker"]);
        let s = stand(&z);
        assert_ne!(s.letzte.as_deref(), Some(erste.as_str()), "letzte aufgefrischt");
        assert_eq!(s.stufe, Sicherungsstufe::Ok);
    }

    /// Fix-Runde 1, D: in der echten Schleife mit kurzem Takt. Die stündliche Runde frischt
    /// `letzte` auf, ohne zu rotieren; nach einem Fehlschlag (Ordner weg, dann wieder da) schreibt
    /// die nächste stündliche Runde die Sicherung und löscht den Fehler.
    #[test]
    fn schleife_frischt_auf_und_holt_einen_fehlschlag_nach() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, _suite) = echter_rechner_mit_ordner_und_uhr(ordner.path(), ziel.path(), &uhr);
        versiegele_einen(&z);
        let z = std::sync::Arc::new(z);
        let (tx, rx) = mpsc::channel::<Anstoss>();
        let z2 = std::sync::Arc::clone(&z);
        let faden = std::thread::spawn(move || crate::abgleich::schleife(&z2, &rx, std::time::Duration::from_millis(200)));

        // `letzte` steht schon seit der Wahl des Ordners (leere Kette); gewartet wird auf die Datei.
        warte_bis(|| datei_in(ziel.path()).exists() && stand(&z).letzte.is_some());
        let vorher = std::fs::read(datei_in(ziel.path())).unwrap();
        let erste = stand(&z).letzte.unwrap();
        uhr.vor(TimeDelta::hours(1));
        warte_bis(|| stand(&z).letzte.as_deref() != Some(erste.as_str()));
        assert_eq!(std::fs::read(datei_in(ziel.path())).unwrap(), vorher);
        assert_eq!(namen_in(ziel.path()), [kern_sicherung::DATEI]);

        std::fs::remove_dir_all(ziel.path()).unwrap();
        warte_bis(|| stand(&z).fehler.is_some());
        assert_eq!(stand(&z).stufe, Sicherungsstufe::Gelb);

        std::fs::create_dir(ziel.path()).unwrap();
        warte_bis(|| stand(&z).fehler.is_none());
        assert_eq!(kern_sicherung::lies(&datei_in(ziel.path())).unwrap().bloecke.len(), 1);
        assert_eq!(stand(&z).stufe, Sicherungsstufe::Ok);

        drop(tx);
        faden.join().unwrap();
    }

    /// Fix-Runde 1, B: Ein echter Rechner ohne Blöcke mit erreichbarem Ordner gilt als gesichert
    /// (nichts zu sichern, keine längere Kette dort) und wird nicht rot. Ohne Meldung an die
    /// Suite und ohne Datei. Ein unerreichbarer Ordner ist ein Fehlschlag, und der Fehler bleibt
    /// nach dem Wechsel auf einen erreichbaren Ordner nicht stehen.
    #[test]
    fn leere_kette_mit_erreichbarem_ordner_gilt_als_gesichert() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, suite) = echter_rechner_mit_ordner_und_uhr(ordner.path(), ziel.path(), &uhr);
        suite.leere();

        let _ = sichere_jetzt(&z);
        let s = stand(&z);
        assert!(s.letzte.is_some() && s.fehler.is_none(), "{s:?}");
        assert_eq!(s.stufe, Sicherungsstufe::Ok);
        assert!(namen_in(ziel.path()).is_empty(), "eine leere Kette wird nie geschrieben");

        uhr.vor(TimeDelta::days(8));
        runde(&z, Lauf::STUENDLICH);
        assert_eq!(stand(&z).stufe, Sicherungsstufe::Ok, "nach 8 Tagen ohne Einsatz nicht rot");
        assert!(!pfade(&suite).contains(&"POST /api/sicherung".to_string()), "{:?}", pfade(&suite));

        std::fs::remove_dir_all(ziel.path()).unwrap();
        let _ = sichere_jetzt(&z);
        let s = stand(&z);
        assert_eq!(s.stufe, Sicherungsstufe::Gelb);
        assert!(s.fehler.is_some());

        let neu = tempfile::tempdir().unwrap();
        setze_sicherungsordner(&z, Some(neu.path().to_path_buf())).unwrap();
        let _ = sichere_jetzt(&z);
        let s = stand(&z);
        assert_eq!((s.stufe, s.fehler), (Sicherungsstufe::Ok, None), "kein alter Fehler nach dem Wechsel");
    }

    /// Review I2: Die Wahl des Ordners sichert sofort im Befehl, nicht erst im Abgleich-Thread.
    /// Der Status gleich danach nennt das Ergebnis — ohne Ankerabgleich und ohne Anstoß.
    #[test]
    fn ordner_waehlen_sichert_sofort_ohne_ankerabgleich() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        let (tx, rx) = mpsc::channel();
        *z.abgleich() = Some(tx);
        suite.leere();

        setze_sicherungsordner(&z, Some(ziel.path().to_path_buf())).unwrap();
        assert!(datei_in(ziel.path()).exists(), "gleich im Befehl geschrieben");
        let s = stand(&z);
        assert!(s.letzte.is_some() && s.fehler.is_none(), "{s:?}");
        assert_eq!(s.stufe, Sicherungsstufe::Ok);
        assert_eq!(pfade(&suite), ["POST /api/sicherung"]);
        assert!(rx.try_recv().is_err(), "kein Anstoß an den Abgleich-Thread");
    }

    /// Review I2: Ein Ordner, in den sich nicht schreiben lässt, ist gleich nach der Wahl gelb mit
    /// dem Fehler — nicht erst nach dem nächsten Anstoß.
    #[cfg(unix)]
    #[test]
    fn ein_nicht_beschreibbarer_ordner_ist_gleich_nach_der_wahl_gelb() {
        use std::os::unix::fs::PermissionsExt;
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        versiegele_einen(&z);
        suite.leere();
        std::fs::set_permissions(ziel.path(), std::fs::Permissions::from_mode(0o555)).unwrap();

        let ergebnis = setze_sicherungsordner(&z, Some(ziel.path().to_path_buf()));
        let s = stand(&z);
        std::fs::set_permissions(ziel.path(), std::fs::Permissions::from_mode(0o755)).unwrap();

        assert_eq!(ergebnis, Ok(()), "gewählt ist der Ordner; das Scheitern steht im Status");
        assert_eq!(s.ordner.as_deref(), ziel.path().to_str());
        assert_eq!(s.stufe, Sicherungsstufe::Gelb, "{s:?}");
        assert!(s.fehler.is_some(), "{s:?}");
        assert!(!pfade(&suite).contains(&"POST /api/sicherung".to_string()), "eine gescheiterte Sicherung meldet nichts");
    }

    /// Review I2: Befehl und Abgleich-Thread können gleichzeitig sichern. Der Sicherungs-Mutex
    /// reiht sie ein: Kein Lauf scheitert an einer halben Rotation oder an einem älteren Stand,
    /// der nach einem neueren schreibt.
    #[test]
    fn zwei_gleichzeitige_sicherungen_stoeren_sich_nicht() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, _suite) = echter_rechner_mit_ordner(ordner.path(), ziel.path());
        let z = std::sync::Arc::new(z);
        // Einer versiegelt und sichert wie der Abgleich-Thread, der andere sichert nur, wie die
        // Wahl des Ordners.
        let z2 = std::sync::Arc::clone(&z);
        let thread = std::thread::spawn(move || {
            for _ in 0..15 {
                versiegele_einen(&z2);
                sichere_jetzt(&z2).unwrap();
            }
        });
        for _ in 0..30 {
            sichere_jetzt(&z).unwrap();
        }
        thread.join().unwrap();
        sichere_jetzt(&z).unwrap();
        let s = stand(&z);
        assert_eq!((s.stufe, s.fehler), (Sicherungsstufe::Ok, None));
        assert_eq!(kern_sicherung::lies(&datei_in(ziel.path())).unwrap().bloecke.len(), 15);
    }

    #[test]
    fn der_ordner_muss_ein_vorhandenes_verzeichnis_sein() {
        let ordner = tempfile::tempdir().unwrap();
        let ziel = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        let datei = ziel.path().join("eine-datei.txt");
        std::fs::write(&datei, "x").unwrap();
        for falsch in [ziel.path().join("gibt-es-nicht"), datei, PathBuf::from("relativ")] {
            assert_eq!(setze_sicherungsordner(&z, Some(falsch.clone())).unwrap_err(), ORDNER_UNGUELTIG, "{}", falsch.display());
        }
        assert_eq!(stand(&z).ordner, None);

        setze_sicherungsordner(&z, Some(ziel.path().to_path_buf())).unwrap();
        assert_eq!(stand(&z).ordner.as_deref(), ziel.path().to_str());
        setze_sicherungsordner(&z, None).unwrap();
        assert_eq!(stand(&z).ordner, None);
        assert_eq!(stand(&z).stufe, Sicherungsstufe::Gelb, "ohne Ordner gelb");
    }

    /// Review Focus 1: Im Ordner liegt eine Sicherung über drei Blöcke, der Rechner hat eine leere
    /// Kette. Weder die Wahl des Ordners noch elf Starts überschreiben oder rotieren sie.
    #[test]
    fn eine_laengere_sicherung_bleibt_ueber_elf_starts_byte_gleich() {
        let ziel = tempfile::tempdir().unwrap();
        let (datei, _) = sicherung_von_a(ziel.path());
        let vorher = std::fs::read(&datei).unwrap();

        let ordner = tempfile::tempdir().unwrap();
        let uhr = Stelluhr::neu();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &uhr);
        setze_sicherungsordner(&z, Some(ziel.path().to_path_buf())).unwrap();
        let _ = sichere_jetzt(&z);
        drop(z);
        let mut letzter = None;
        for _ in 0..11 {
            drop(letzter.take());
            let z = zustand_mit(ordner.path(), &uhr, &suite, Box::new(Speichertresor::default()));
            runde(&z, Lauf::START);
            assert_eq!(std::fs::read(&datei).unwrap(), vorher);
            letzter = Some(z);
        }
        let s = stand(letzter.as_ref().unwrap());
        assert_eq!(s.stufe, Sicherungsstufe::Gelb, "eine längere Kette im Ordner ist ein Hinweis wert");
        assert_eq!(
            s.fehler.as_deref(),
            Some("Im Sicherungsordner liegt eine längere Kette (3 Blöcke) als auf diesem Rechner (0). Nichts überschrieben.")
        );
        let namen: Vec<String> =
            std::fs::read_dir(ziel.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(namen, [kern_sicherung::DATEI], "keine Rotation, keine Temp-Datei");
        assert!(!pfade(&suite).contains(&"POST /api/sicherung".to_string()), "eine leere Kette meldet nichts");
    }

    // -----------------------------------------------------------------------------------------
    // Wiederherstellen
    // -----------------------------------------------------------------------------------------

    /// Rechner A (echt, derselbe Vektor-Schlüssel wie B) sichert drei Blöcke nach `ziel`.
    fn sicherung_von_a(ziel: &Path) -> (PathBuf, Vec<Block>) {
        let ordner = tempfile::tempdir().unwrap();
        let (a, _suite) = echter_rechner_mit_ordner(ordner.path(), ziel);
        for _ in 0..3 {
            versiegele_einen(&a);
        }
        assert!(sichere_jetzt(&a).unwrap().is_some());
        (datei_in(ziel), lies_bloecke(&a).unwrap())
    }

    fn b64url(s: &str) -> Vec<u8> {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).unwrap()
    }

    /// Packt den CEK eines Umschlags mit dem privaten Schlüssel der Testvektoren aus — das tut die
    /// echte Suite bei der Freigabe (`packeAus` in `umschlag.ts`).
    fn packe_aus(umschlag: &Umschlag, kopf: &Blockkopf) -> Vec<u8> {
        let pfad = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../src/app/m/einsatzbuch/_lib/kern/testvektoren/eingaben.json");
        let eingaben: Value = serde_json::from_str(&std::fs::read_to_string(pfad).unwrap()).unwrap();
        let privat = SecretKey::from_slice(&b64url(eingaben["suite"]["privat"]["d"].as_str().unwrap())).unwrap();
        let epk = PublicKey::from_sec1_bytes(&krypto::aus_b64(&umschlag.epk).unwrap()).unwrap();
        let geteilt = ecdh::diffie_hellman(privat.to_nonzero_scalar(), epk.as_affine());
        let mut kek = [0u8; 32];
        Hkdf::<Sha256>::new(None, geteilt.raw_secret_bytes()).expand(krypto::UMSCHLAG_INFO, &mut kek).unwrap();
        let iv: [u8; 12] = krypto::aus_b64(&umschlag.iv).unwrap().try_into().unwrap();
        let aad = kopf.kanonisch().unwrap();
        Aes256Gcm::new(&kek.into())
            .decrypt(&iv.into(), Payload { msg: &krypto::aus_b64(&umschlag.ct).unwrap(), aad: aad.as_bytes() })
            .unwrap()
    }

    /// Die Freigabe der Suite mit echten CEKs.
    fn echte_freigabe(a: &Aufgezeichnet) -> Result<Antwort, String> {
        let posten: Vec<Value> = a.json.as_ref().unwrap().as_array().unwrap().iter()
            .map(|p| {
                let kopf: Blockkopf = serde_json::from_value(p["kopf"].clone()).unwrap();
                let umschlag: Umschlag = serde_json::from_value(p["umschlag"].clone()).unwrap();
                json!({ "block": kopf.block, "cek": krypto::b64(&packe_aus(&umschlag, &kopf)) })
            })
            .collect();
        antwort(200, &Value::Array(posten).to_string())
    }

    /// Eine Suite, die den Anker `anker` kennt und mit echten CEKs freigibt.
    fn suite_mit_anker(anker: Option<(u64, String)>) -> impl Fn(&Aufgezeichnet) -> Result<Antwort, String> + Send + Sync + 'static {
        move |a| match (a.methode, a.pfad()) {
            ("GET", "/api/anker") => {
                antwort(200, &json!({ "anker": anker.as_ref().map(|(block, hash)| json!({ "block": block, "hash": hash })) }).to_string())
            }
            ("POST", "/api/schluessel/freigeben") => echte_freigabe(a),
            _ => gesunde_suite(a),
        }
    }

    /// Ein frisch eingerichteter echter Rechner B — seine Sitzung ist an ihn gebunden — und eine
    /// Sicherung von A über drei Blöcke.
    fn b_und_sicherung() -> (tempfile::TempDir, tempfile::TempDir, Zustand, FakeSuite, PathBuf, Vec<Block>) {
        let ziel = tempfile::tempdir().unwrap();
        let (datei, bloecke) = sicherung_von_a(ziel.path());
        let ordner = tempfile::tempdir().unwrap();
        let (z, suite) = eingerichteter_echter_rechner(ordner.path(), &Stelluhr::neu());
        (ordner, ziel, z, suite, datei, bloecke)
    }

    #[test]
    fn wiederherstellen_mit_passendem_anker_uebernimmt_setzt_nummern_und_meldet_alle_anker() {
        let (_o, _z, z, suite, datei, bloecke) = b_und_sicherung();
        suite.setze(suite_mit_anker(Some((3, bloecke[2].hash.clone()))));
        let (tx, rx) = mpsc::channel();
        *z.abgleich() = Some(tx);

        assert_eq!(stelle_wieder_her(&z, &datei), Ok(Wiederhergestellt { bloecke: 3 }));
        assert_eq!(lies_bloecke(&z).unwrap(), bloecke, "byte-gleich übernommen");
        assert_eq!(pfade(&suite), ["GET /api/anker", "POST /api/schluessel/freigeben"]);
        assert_eq!(suite.anfragen()[0].bearer.as_deref(), Some("geraet-neu"), "Anker mit dem Geräte-Token");
        assert_eq!(suite.anfragen()[1].bearer.as_deref(), Some("sitzung-1"), "Freigabe mit der Sitzung");
        assert_eq!(rx.try_recv(), Ok(Anstoss::NeuerBlock));

        suite.leere();
        runde(&z, Lauf::NEUER_BLOCK);
        let gemeldet: Vec<u64> = suite
            .anfragen()
            .iter()
            .filter(|a| a.pfad() == "/api/anker")
            .map(|a| a.json.as_ref().unwrap()["block"].as_u64().unwrap())
            .collect();
        assert_eq!(gemeldet, [1, 2, 3], "der neue Rechner meldet die ganze Kette als seine Anker");
        assert_eq!(lies_status(&z).unwrap().anker_bestaetigt_bis, 3);

        let v = versiegele_einen(&z);
        assert_eq!((v.block, v.nummer.as_str()), (4, "2026-004"), "Nummer und Kette laufen weiter");
    }

    /// Entscheidung 5 mit Kettenidentität: Die Suite kennt eine ältere, verlorene Kette bis Block
    /// 10 (Rechner A ohne Sicherung) und die Kette dieser Sicherung bis Block 3. Gefragt wird nach
    /// der Kette der Sicherung (`erster` = Hash ihres Blocks 1), also passt der Anker, und die
    /// Anker der alten Kette stören nicht.
    #[test]
    fn wiederherstellen_fragt_nach_der_kette_der_sicherung_und_eine_fremde_kette_stoert_nicht() {
        let (_o, _z, z, suite, datei, bloecke) = b_und_sicherung();
        let erster = bloecke[0].hash.clone();
        let eigene = suite_mit_anker(Some((3, bloecke[2].hash.clone())));
        let fremde = suite_mit_anker(Some((10, "f".repeat(64))));
        let gesucht = format!("erster={erster}");
        suite.setze(move |a| if a.url.ends_with(&gesucht) { eigene(a) } else { fremde(a) });

        assert_eq!(stelle_wieder_her(&z, &datei), Ok(Wiederhergestellt { bloecke: 3 }));
        let anfrage = &suite.anfragen()[0];
        assert_eq!(anfrage.pfad(), "/api/anker");
        assert!(anfrage.url.ends_with(&format!("/m/einsatzbuch/api/anker?erster={erster}")), "{}", anfrage.url);
        assert_eq!(lies_bloecke(&z).unwrap(), bloecke);
    }

    #[test]
    fn wiederherstellen_ohne_sitzung_heisst_neu_anmelden() {
        let (_o, _z, z, suite, datei, _) = b_und_sicherung();
        melde_ab(&z);
        suite.leere();
        assert_eq!(stelle_wieder_her(&z, &datei).unwrap_err(), SITZUNG_ABGELAUFEN);
        assert!(suite.anfragen().is_empty());
        assert!(lies_bloecke(&z).unwrap().is_empty());
    }

    #[test]
    fn wiederherstellen_nur_mit_einer_an_diesen_rechner_gebundenen_sitzung() {
        let (_o, _z, z, suite, datei, _) = b_und_sicherung();
        let browser = Browser::neu();
        melde_an(&z, &|u| browser.oeffne(u)).unwrap(); // die Fake-Suite bindet an „r-alt“
        suite.leere();
        assert_eq!(stelle_wieder_her(&z, &datei).unwrap_err(), SITZUNG_FREMD);
        assert!(suite.anfragen().is_empty());
    }

    #[test]
    fn wiederherstellen_auf_eine_nicht_leere_kette_wird_abgelehnt() {
        let (_o, _z, z, suite, datei, bloecke) = b_und_sicherung();
        suite.setze(suite_mit_anker(Some((3, bloecke[2].hash.clone()))));
        versiegele_einen(&z);
        suite.leere();
        assert_eq!(stelle_wieder_her(&z, &datei).unwrap_err(), BuchFehler::KetteNichtLeer.to_string());
        assert!(suite.anfragen().is_empty());
        assert_eq!(lies_bloecke(&z).unwrap().len(), 1);
    }

    #[test]
    fn wiederherstellen_mit_veraltetem_anker_uebernimmt_nichts() {
        let (_o, _z, z, suite, datei, _) = b_und_sicherung();
        suite.setze(suite_mit_anker(Some((4, "a".repeat(64)))));
        let fehler = stelle_wieder_her(&z, &datei).unwrap_err();
        assert_eq!(fehler, "Die Sicherung endet bei Block 3, die Suite kennt die Kette bis Block 4. Diese Sicherung ist veraltet.");
        assert_eq!(pfade(&suite), ["GET /api/anker"], "ohne passenden Anker keine Freigabe");
        assert!(lies_bloecke(&z).unwrap().is_empty());
    }

    #[test]
    fn eine_401_bei_der_freigabe_verwirft_die_sitzung() {
        let (_o, _z, z, suite, datei, bloecke) = b_und_sicherung();
        let anker = suite_mit_anker(Some((3, bloecke[2].hash.clone())));
        suite.setze(move |a| match a.pfad() {
            "/api/schluessel/freigeben" => fehler(401, "sitzung_ungueltig", "Die Sitzung ist ungültig."),
            _ => anker(a),
        });
        assert_eq!(stelle_wieder_her(&z, &datei).unwrap_err(), SITZUNG_ABGELAUFEN);
        assert!(z.sitzung().is_none());
        assert!(lies_bloecke(&z).unwrap().is_empty());
    }

    /// Scheitert das Öffnen eines Blocks (hier ein falscher CEK), bricht alles ab.
    #[test]
    fn ein_block_der_sich_nicht_oeffnen_laesst_bricht_alles_ab() {
        let (_o, _z, z, suite, datei, bloecke) = b_und_sicherung();
        let anker = suite_mit_anker(Some((3, bloecke[2].hash.clone())));
        suite.setze(move |a| match a.pfad() {
            "/api/schluessel/freigeben" => {
                let echt: Vec<Value> = serde_json::from_str(&echte_freigabe(a)?.koerper).unwrap();
                let verdorben: Vec<Value> = echt
                    .into_iter()
                    .map(|mut p| {
                        if p["block"] == 2 {
                            p["cek"] = json!(krypto::b64(&[0u8; 32]));
                        }
                        p
                    })
                    .collect();
                antwort(200, &Value::Array(verdorben).to_string())
            }
            _ => anker(a),
        });
        let fehler = stelle_wieder_her(&z, &datei).unwrap_err();
        assert!(fehler.starts_with("Block 2 der Sicherung ließ sich nicht öffnen"), "{fehler}");
        assert!(lies_bloecke(&z).unwrap().is_empty());
    }

    /// Eine kaputte Datei fällt ohne Netz auf: Kette und Schlüssel prüft die App vor dem Anker.
    #[test]
    fn eine_gebrochene_kette_faellt_schon_ohne_verbindung_auf() {
        let (_o, _z, z, suite, datei, _) = b_und_sicherung();
        let mut inhalt: Sicherungsdatei = kern_sicherung::lies(&datei).unwrap();
        inhalt.bloecke.remove(1);
        std::fs::write(&datei, serde_json::to_vec(&inhalt).unwrap()).unwrap();
        suite.setze(|_| Err("keine Verbindung".into()));
        suite.leere();
        let fehler = stelle_wieder_her(&z, &datei).unwrap_err();
        assert_eq!(fehler, "Die Kette in der Sicherung ist gebrochen bei Block 3: Vorgänger fehlt oder wurde verändert");
        assert!(suite.anfragen().is_empty());
    }

    #[test]
    fn wiederherstellen_nur_im_echtbetrieb() {
        let ziel = tempfile::tempdir().unwrap();
        let (datei, _) = sicherung_von_a(ziel.path());
        let ordner = tempfile::tempdir().unwrap();
        let (z, _suite) = eingerichteter_testrechner(ordner.path(), &Stelluhr::neu());
        assert_eq!(stelle_wieder_her(&z, &datei).unwrap_err(), BuchFehler::NurImEchtbetrieb.to_string());
    }
}
