//! Formatprobe gegen die Vorversion (DRK-488): Was eine Version der App schreibt, muss die
//! Version davor lesen, und umgekehrt. Der Job `vorgaenger` in `.github/workflows/einsatzbuch.yml`
//! fährt diese Datei zweimal, einmal in diesem Stand und einmal im letzten Release
//! `einsatzbuch-vX.Y.Z`, und reicht die Probe über ein Verzeichnis hin und her:
//!
//! - Dieser Stand schreibt (`EINSATZBUCH_FORMATPROBE_SCHREIBEN`), das Release liest
//!   (`EINSATZBUCH_FORMATPROBE_LESEN`): Eine Sicherung der neuen App lässt sich auf einem Rechner
//!   mit der alten App wiederherstellen, und die alte App versiegelt darauf weiter.
//! - Das Release schreibt, dieser Stand liest, zusätzlich mit `EINSATZBUCH_FORMATPROBE_BUCH=1`:
//!   Die neue App übernimmt die Datenbank der alten, so wie nach einem Update, und versiegelt darauf
//!   weiter. Die Gegenrichtung (alte App auf neuer Datenbank) prüft die Probe nicht, denn der
//!   Updater stuft nie herab.
//!
//! **Die Schnittstelle bleibt stabil.** Das Release fährt seine eigene Fassung dieser Datei. Die
//! drei Umgebungsvariablen, die Namen `probe_schreiben`/`probe_lesen` und der Aufbau des
//! Probeordners (`einsatzbuch-sicherung.json` und `buch/`) sind deshalb ein Vertrag mit
//! künftigen Versionen. Was sich ändern darf, ist, was die Probe *enthält*. Ein Release ohne
//! diese Datei (`einsatzbuch-v1.0.0`) bekommt sie aus diesem Stand, der Job kopiert sie hinein.
//!
//! Ohne Umgebungsvariable schreibt und liest `probe_rundlauf` die Probe im selben Stand. Das ist
//! derselbe Weg und hält die Probe grün, bevor der Job sie gegen das Release fährt.
mod hilfe;

use std::fs;
use std::path::Path;

use chrono::{DateTime, TimeDelta, TimeZone, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch};
use einsatzbuch_kern::format::{Block, Einsatz, Umgebung};
use einsatzbuch_kern::kette;
use einsatzbuch_kern::krypto;
use einsatzbuch_kern::sicherung::{self, Sicherungsdatei};
use einsatzbuch_kern::wiederherstellung;
use hilfe::test_einrichtung;
use zeroize::{Zeroize, Zeroizing};

const SCHREIBEN: &str = "EINSATZBUCH_FORMATPROBE_SCHREIBEN";
const LESEN: &str = "EINSATZBUCH_FORMATPROBE_LESEN";
const BUCH: &str = "EINSATZBUCH_FORMATPROBE_BUCH";
/// Unterordner der Probe mit der Datenbank der schreibenden Version.
const BUCHORDNER: &str = "buch";
/// So viele Einsätze versiegelt die schreibende Version.
const EINSAETZE: u8 = 3;

fn suite_privatschluessel() -> p256::SecretKey {
    use base64::Engine as _;
    let d = hilfe::vektor("eingaben.json")["suite"]["privat"]["d"].as_str().unwrap().to_string();
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(d).unwrap();
    p256::SecretKey::from_slice(&bytes).unwrap()
}

fn beginn() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 8, 22, 1, 12, 0).unwrap()
}

/// Öffnet einen Block wie die Wiederherstellung: CEK aus dem Umschlag (hier mit dem privaten
/// Vektor-Suiteschlüssel statt über die Freigabe der Suite), dann `oeffne_block`.
fn oeffne(block: &Block) -> Einsatz {
    let mut roh = hilfe::packe_aus(&block.umschlag, &block.kopf, &suite_privatschluessel())
        .unwrap_or_else(|e| panic!("Umschlag von Block {} nicht zu öffnen: {e}", block.kopf.block));
    let mut cek = Zeroizing::new([0u8; 32]);
    cek.copy_from_slice(&roh);
    roh.zeroize();
    krypto::oeffne_block(block, &cek).unwrap_or_else(|e| panic!("Block {} nicht zu öffnen: {e}", block.kopf.block))
}

fn eingerichtetes_buch(ordner: &Path) -> Buch {
    let mut buch = Buch::oeffne(ordner, Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    buch
}

/// Versiegelt einen weiteren Einsatz und prüft, dass er die Kette und die Nummernfolge fortsetzt.
fn setze_fort(buch: &mut Buch, vorher: &[Block], wo: &str) {
    let jetzt = beginn() + TimeDelta::days(30);
    hilfe::versiegele_einen_einsatz(buch, jetzt, 42);
    let bloecke = buch.bloecke().unwrap();
    assert_eq!(bloecke.len(), vorher.len() + 1, "{wo}: kein neuer Block");
    assert_eq!(&bloecke[..vorher.len()], vorher, "{wo}: vorhandene Blöcke verändert");
    kette::pruefe(&bloecke).unwrap_or_else(|e| panic!("{wo}: Kette nach dem Weiterschreiben gebrochen: {e:?}"));
    let nummern: Vec<String> = bloecke.iter().map(|b| oeffne(b).nummer).collect();
    let mut sortiert = nummern.clone();
    sortiert.sort();
    sortiert.dedup();
    assert_eq!(sortiert.len(), nummern.len(), "{wo}: Einsatznummer doppelt vergeben: {nummern:?}");
}

/// Schreibt die Probe nach `ordner`: eine echte Kette aus `EINSAETZE` Blöcken als Sicherungsdatei
/// und die Datenbank, in der sie entstanden ist.
fn schreibe_probe(ordner: &Path) {
    let buchordner = ordner.join(BUCHORDNER);
    fs::create_dir_all(&buchordner).unwrap();
    let bloecke = {
        let mut buch = eingerichtetes_buch(&buchordner);
        for i in 0..EINSAETZE {
            hilfe::versiegele_einen_einsatz(&mut buch, beginn() + TimeDelta::hours(i64::from(i)), i + 1);
        }
        buch.bloecke().unwrap()
        // `buch` schließt hier: Die Datenbank ist vollständig auf der Platte, bevor jemand sie kopiert.
    };
    let datei = Sicherungsdatei::neu("2026-09-25T10:00:00+02:00".into(), bloecke);
    sicherung::schreibe(ordner, &datei).unwrap();
}

/// Liest die Probe aus `ordner` so, wie es die App mit fremden Dateien tut, und schreibt darauf weiter.
fn lies_probe(ordner: &Path, buch_uebernehmen: bool) {
    let datei = sicherung::lies(&ordner.join(sicherung::DATEI))
        .unwrap_or_else(|e| panic!("Sicherungsdatei der anderen Version nicht lesbar: {e:?}"));
    assert!(!datei.bloecke.is_empty(), "Probe ohne Blöcke");
    let letzter = datei.bloecke.last().unwrap();
    let gepinnt = test_einrichtung(Umgebung::Echt).schluessel_id;
    wiederherstellung::pruefe(&datei, &gepinnt, Some((letzter.kopf.block, &letzter.hash)))
        .unwrap_or_else(|e| panic!("Sicherung der anderen Version abgelehnt: {e}"));
    let einsaetze: Vec<Einsatz> = datei.bloecke.iter().map(oeffne).collect();
    let nummern = wiederherstellung::nummern(&einsaetze).unwrap();

    // Wiederherstellen auf einem frischen Rechner, dann weiter versiegeln.
    let frisch = tempfile::tempdir().unwrap();
    let mut buch = eingerichtetes_buch(frisch.path());
    buch.uebernehme_sicherung(&datei.bloecke, &nummern).unwrap();
    setze_fort(&mut buch, &datei.bloecke, "nach der Wiederherstellung");

    if buch_uebernehmen {
        // Die Datenbank der anderen Version, wie nach einem Update. Kopie, damit die Probe bleibt.
        let kopie = tempfile::tempdir().unwrap();
        for eintrag in fs::read_dir(ordner.join(BUCHORDNER)).unwrap() {
            let eintrag = eintrag.unwrap();
            fs::copy(eintrag.path(), kopie.path().join(eintrag.file_name())).unwrap();
        }
        let mut buch = Buch::oeffne(kopie.path(), Betrieb::Echt)
            .unwrap_or_else(|e| panic!("Datenbank der anderen Version nicht zu öffnen: {e:?}"));
        assert!(buch.einrichtung().unwrap().is_some(), "Einrichtung ging beim Übernehmen verloren");
        assert_eq!(buch.bloecke().unwrap(), datei.bloecke, "Datenbank und Sicherung der Probe weichen ab");
        setze_fort(&mut buch, &datei.bloecke, "in der übernommenen Datenbank");
    }
}

#[test]
fn probe_rundlauf() {
    let ordner = tempfile::tempdir().unwrap();
    schreibe_probe(ordner.path());
    lies_probe(ordner.path(), true);
}

#[test]
fn probe_schreiben() {
    let Some(ziel) = std::env::var_os(SCHREIBEN) else { return };
    let ziel = Path::new(&ziel);
    fs::create_dir_all(ziel).unwrap();
    assert!(fs::read_dir(ziel).unwrap().next().is_none(), "{} ist nicht leer", ziel.display());
    schreibe_probe(ziel);
    println!("Formatprobe geschrieben nach {}", ziel.display());
}

#[test]
fn probe_lesen() {
    let Some(quelle) = std::env::var_os(LESEN) else { return };
    let buch_uebernehmen = std::env::var(BUCH).is_ok_and(|w| w == "1");
    lies_probe(Path::new(&quelle), buch_uebernehmen);
    println!("Formatprobe gelesen aus {} (Datenbank übernommen: {buch_uebernehmen})", Path::new(&quelle).display());
}
