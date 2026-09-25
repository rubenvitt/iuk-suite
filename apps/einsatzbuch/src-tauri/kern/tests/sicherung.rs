//! Sicherungsdatei (Spec §4.5): atomares Schreiben mit Rotation, die Schreibregeln aus
//! Entscheidung 2 (leere Kette, gleicher letzter Hash, längere vorhandene Kette), Lesen mit
//! Größengrenze, die Sicherungsstufe und die Sicherungsangaben im Buch. Dateisystem nur in
//! `tempfile`-Ordnern.
mod hilfe;

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use chrono::{DateTime, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch, BuchFehler};
use einsatzbuch_kern::format::{Block, Blockkopf, Umgebung, Umschlag};
use einsatzbuch_kern::sicherung::{
    self, DATEI, HOECHSTENS_BYTES, Schreibergebnis, SicherungFehler, Sicherungsangaben, Sicherungsdatei, Sicherungsstufe,
};

const ERSTELLT: &str = "2026-09-25T12:00:00+02:00";

/// Ein Block mit erfundenem Inhalt: `schreibe` prüft die Kette nicht, es vergleicht nur Länge und
/// letzten Hash. Der Hash ist die Blocknummer als Hex, also je Block verschieden.
fn block(n: u64) -> Block {
    Block {
        kopf: Blockkopf {
            v: 1,
            block: n,
            prev: format!("{:064x}", n - 1),
            versiegelt: "2026-09-25T10:00:00+02:00".into(),
            schluessel_id: "0123456789abcdef".into(),
            umgebung: Umgebung::Echt,
        },
        iv: "AAAAAAAAAAAAAAAA".into(),
        daten: "AAAA".into(),
        umschlag: Umschlag { epk: "BA==".into(), iv: "AAAAAAAAAAAAAAAA".into(), ct: "AAAA".into() },
        hash: format!("{n:064x}"),
    }
}

fn datei(n: u64) -> Sicherungsdatei {
    Sicherungsdatei::neu(ERSTELLT.into(), (1..=n).map(block).collect())
}

/// Alle Einträge des Ordners mit ihrem Inhalt — der Vorher-nachher-Vergleich für „nichts
/// geschrieben, nichts rotiert“.
fn schnappschuss(ordner: &Path) -> BTreeMap<String, Vec<u8>> {
    fs::read_dir(ordner)
        .unwrap()
        .map(|e| {
            let e = e.unwrap();
            (e.file_name().into_string().unwrap(), fs::read(e.path()).unwrap_or_default())
        })
        .collect()
}

fn keine_temp_datei(ordner: &Path) {
    for e in fs::read_dir(ordner).unwrap() {
        let name = e.unwrap().file_name().into_string().unwrap();
        assert!(!name.ends_with(".tmp"), "Temp-Datei liegen geblieben: {name}");
    }
}

fn rotiert(i: u32) -> String {
    format!("einsatzbuch-sicherung.{i}.json")
}

fn laenge(pfad: &Path) -> usize {
    sicherung::lies(pfad).unwrap().bloecke.len()
}

#[test]
fn zwoelf_schreibvorgaenge_rotieren_auf_zehn_staende() {
    let ordner = tempfile::tempdir().unwrap();
    for n in 1..=12 {
        let ergebnis = sicherung::schreibe(ordner.path(), &datei(n)).unwrap();
        assert_eq!(ergebnis, Schreibergebnis::Geschrieben, "Schreibvorgang {n}");
    }
    let mut erwartet: Vec<String> = (1..=10).map(rotiert).collect();
    erwartet.push(DATEI.to_string());
    erwartet.sort();
    let vorhanden: Vec<String> = schnappschuss(ordner.path()).into_keys().collect();
    assert_eq!(vorhanden, erwartet);

    assert_eq!(laenge(&ordner.path().join(DATEI)), 12);
    for i in 1..=10u32 {
        assert_eq!(laenge(&ordner.path().join(rotiert(i))), 12 - i as usize, ".{i} ist der Stand {i} Schritte zurück");
    }
    assert!(!ordner.path().join(rotiert(11)).exists());
    keine_temp_datei(ordner.path());
}

#[test]
fn die_datei_traegt_format_version_erstellt_und_bloecke() {
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(2)).unwrap();
    let json: serde_json::Value = serde_json::from_slice(&fs::read(ordner.path().join(DATEI)).unwrap()).unwrap();
    let mut schluessel: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
    schluessel.sort();
    assert_eq!(schluessel, ["bloecke", "erstellt", "format", "version"]);
    assert_eq!(json["format"], "einsatzbuch-sicherung");
    assert_eq!(json["version"], 1);
    assert_eq!(json["erstellt"], ERSTELLT);
    assert_eq!(json["bloecke"], serde_json::to_value(datei(2).bloecke).unwrap());
}

#[test]
fn gleicher_letzter_hash_schreibt_und_rotiert_nicht() {
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(3)).unwrap();
    let ziel = ordner.path().join(DATEI);
    let mtime = fs::metadata(&ziel).unwrap().modified().unwrap();
    let vorher = schnappschuss(ordner.path());

    // Anderer `erstellt`: Würde doch geschrieben, änderte sich der Inhalt.
    let spaeter = Sicherungsdatei::neu("2026-09-26T08:00:00+02:00".into(), datei(3).bloecke);
    assert_eq!(sicherung::schreibe(ordner.path(), &spaeter).unwrap(), Schreibergebnis::Unveraendert);
    assert_eq!(schnappschuss(ordner.path()), vorher);
    assert_eq!(fs::metadata(&ziel).unwrap().modified().unwrap(), mtime);
}

#[test]
fn leere_kette_schreibt_nichts() {
    let ordner = tempfile::tempdir().unwrap();
    assert_eq!(sicherung::schreibe(ordner.path(), &datei(0)).unwrap(), Schreibergebnis::LeereKette);
    assert!(schnappschuss(ordner.path()).is_empty());

    sicherung::schreibe(ordner.path(), &datei(3)).unwrap();
    let vorher = schnappschuss(ordner.path());
    assert_eq!(sicherung::schreibe(ordner.path(), &datei(0)).unwrap(), Schreibergebnis::LeereKette);
    assert_eq!(schnappschuss(ordner.path()), vorher);
}

#[test]
fn vorhandene_laengere_kette_wird_nicht_ueberschrieben() {
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(3)).unwrap();
    let vorher = schnappschuss(ordner.path());
    let fehler = sicherung::schreibe(ordner.path(), &datei(1)).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::VorhandeneLaenger { vorhanden: 3, lokal: 1 }), "{fehler:?}");
    assert_eq!(
        fehler.to_string(),
        "Im Sicherungsordner liegt eine längere Kette (3 Blöcke) als auf diesem Rechner (1). Nichts überschrieben."
    );
    assert_eq!(schnappschuss(ordner.path()), vorher);
}

/// Review Focus 1: Eine Sicherung über 3 Blöcke übersteht elf Starts mit leerer und mit kürzerer
/// Kette byte-gleich, ohne dass etwas rotiert.
#[test]
fn elf_starts_mit_leerer_oder_kuerzerer_kette_lassen_die_sicherung_stehen() {
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(3)).unwrap();
    let vorher = schnappschuss(ordner.path());
    for _ in 0..11 {
        assert_eq!(sicherung::schreibe(ordner.path(), &datei(0)).unwrap(), Schreibergebnis::LeereKette);
    }
    assert_eq!(schnappschuss(ordner.path()), vorher);
    for _ in 0..11 {
        assert!(matches!(sicherung::schreibe(ordner.path(), &datei(1)), Err(SicherungFehler::VorhandeneLaenger { .. })));
    }
    assert_eq!(schnappschuss(ordner.path()), vorher);
}

/// Entscheidung 2: Eine unlesbare vorhandene Datei wird normal nach `.1` rotiert.
#[test]
fn unlesbare_vorhandene_datei_wird_rotiert() {
    let ordner = tempfile::tempdir().unwrap();
    fs::write(ordner.path().join(DATEI), b"kein json").unwrap();
    assert_eq!(sicherung::schreibe(ordner.path(), &datei(1)).unwrap(), Schreibergebnis::Geschrieben);
    assert_eq!(fs::read(ordner.path().join(rotiert(1))).unwrap(), b"kein json");
    assert_eq!(laenge(&ordner.path().join(DATEI)), 1);
}

#[test]
fn fehlender_ordner_ist_ein_io_fehler() {
    let ordner = tempfile::tempdir().unwrap();
    let fehlt = ordner.path().join("fehlt");
    let fehler = sicherung::schreibe(&fehlt, &datei(1)).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::Io(_)), "{fehler:?}");
    assert!(!fehlt.exists());
    assert!(schnappschuss(ordner.path()).is_empty());
}

/// Stellt die Rechte beim Verlassen wieder her, damit `TempDir` auch nach einem gescheiterten
/// Assert aufräumen kann.
#[cfg(unix)]
struct RechteZurueck<'a>(&'a Path);

#[cfg(unix)]
impl Drop for RechteZurueck<'_> {
    fn drop(&mut self) {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(self.0, fs::Permissions::from_mode(0o755));
    }
}

#[cfg(unix)]
#[test]
fn schreibgeschuetzter_ordner_laesst_die_alte_datei_stehen() {
    use std::os::unix::fs::PermissionsExt;
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(1)).unwrap();
    let vorher = schnappschuss(ordner.path());
    fs::set_permissions(ordner.path(), fs::Permissions::from_mode(0o555)).unwrap();
    let _zurueck = RechteZurueck(ordner.path());

    let fehler = sicherung::schreibe(ordner.path(), &datei(2)).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::Io(_)), "{fehler:?}");
    assert_eq!(schnappschuss(ordner.path()), vorher);
    keine_temp_datei(ordner.path());
}

/// Ein Lesefehler ist kein Beleg für eine kaputte Datei: Eine gültige, aber gerade nicht lesbare
/// Sicherung (Rechte, gestörtes Netzlaufwerk) darf nicht nach `.1` wandern und von einer
/// kürzeren Kette ersetzt werden. `schreibe` meldet `Io` und lässt den Ordner stehen.
#[cfg(unix)]
#[test]
fn nicht_lesbare_vorhandene_datei_wird_nicht_rotiert() {
    use std::os::unix::fs::PermissionsExt;
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(3)).unwrap();
    let vorher = schnappschuss(ordner.path());
    let ziel = ordner.path().join(DATEI);
    fs::set_permissions(&ziel, fs::Permissions::from_mode(0o000)).unwrap();
    if fs::read(&ziel).is_ok() {
        // Als root greifen die Rechte nicht, der Fall lässt sich so nicht herstellen.
        fs::set_permissions(&ziel, fs::Permissions::from_mode(0o644)).unwrap();
        return;
    }
    let ergebnis = sicherung::schreibe(ordner.path(), &datei(1));
    fs::set_permissions(&ziel, fs::Permissions::from_mode(0o644)).unwrap();
    assert!(matches!(ergebnis, Err(SicherungFehler::Io(_))), "{ergebnis:?}");
    assert_eq!(schnappschuss(ordner.path()), vorher);
    keine_temp_datei(ordner.path());
}

/// Scheitert die Rotation, nachdem die Temp-Datei schon geschrieben ist, räumt die Wache sie weg,
/// und die aktuelle Datei bleibt, wie sie war. Hier ist `.10` ein nicht leerer Ordner, auf den
/// sich `.9` nicht umbenennen lässt.
#[test]
fn scheiternde_rotation_hinterlaesst_keine_temp_datei() {
    let ordner = tempfile::tempdir().unwrap();
    for n in 1..=10 {
        sicherung::schreibe(ordner.path(), &datei(n)).unwrap();
    }
    fs::remove_file(ordner.path().join(rotiert(9))).unwrap();
    fs::write(ordner.path().join(rotiert(9)), b"neun").unwrap();
    let sperre = ordner.path().join(rotiert(10));
    let _ = fs::remove_file(&sperre);
    fs::create_dir(&sperre).unwrap();
    fs::write(sperre.join("inhalt"), b"x").unwrap();
    let aktuell = fs::read(ordner.path().join(DATEI)).unwrap();

    let fehler = sicherung::schreibe(ordner.path(), &datei(11)).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::Io(_)), "{fehler:?}");
    assert_eq!(fs::read(ordner.path().join(DATEI)).unwrap(), aktuell);
    keine_temp_datei(ordner.path());
}

#[test]
fn schreibe_atomar_ersetzt_ein_bestehendes_ziel_vollstaendig() {
    let ordner = tempfile::tempdir().unwrap();
    let ziel = ordner.path().join("einsatz_2026-001.einsatzbuch");
    fs::write(&ziel, "ein alter, deutlich längerer Inhalt als der neue").unwrap();
    sicherung::schreibe_atomar(&ziel, b"neu").unwrap();
    assert_eq!(fs::read(&ziel).unwrap(), b"neu");
    let namen: Vec<String> = schnappschuss(ordner.path()).into_keys().collect();
    assert_eq!(namen, ["einsatz_2026-001.einsatzbuch"]);
}

#[test]
fn schreibe_atomar_legt_ein_neues_ziel_an() {
    let ordner = tempfile::tempdir().unwrap();
    let ziel = ordner.path().join("neu.einsatzbuch");
    sicherung::schreibe_atomar(&ziel, b"inhalt").unwrap();
    assert_eq!(fs::read(&ziel).unwrap(), b"inhalt");
    keine_temp_datei(ordner.path());
}

#[test]
fn lies_liest_was_schreibe_geschrieben_hat() {
    let ordner = tempfile::tempdir().unwrap();
    sicherung::schreibe(ordner.path(), &datei(2)).unwrap();
    assert_eq!(sicherung::lies(&ordner.path().join(DATEI)).unwrap(), datei(2));
}

fn mit_feld(feld: &str, wert: serde_json::Value) -> serde_json::Value {
    let mut json = serde_json::to_value(datei(1)).unwrap();
    json[feld] = wert;
    json
}

#[test]
fn lies_lehnt_fremdes_format_ab() {
    let ordner = tempfile::tempdir().unwrap();
    let pfad = ordner.path().join(DATEI);
    fs::write(&pfad, serde_json::to_vec(&mit_feld("format", "einsatzbuch-export".into())).unwrap()).unwrap();
    let fehler = sicherung::lies(&pfad).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::FremdesFormat), "{fehler:?}");
    assert_eq!(fehler.to_string(), "Die Datei ist keine Einsatzbuch-Sicherung (Format oder Version unbekannt).");
}

#[test]
fn lies_lehnt_fremde_version_ab() {
    let ordner = tempfile::tempdir().unwrap();
    let pfad = ordner.path().join(DATEI);
    fs::write(&pfad, serde_json::to_vec(&mit_feld("version", 2.into())).unwrap()).unwrap();
    assert!(matches!(sicherung::lies(&pfad), Err(SicherungFehler::FremdesFormat)));
}

#[test]
fn lies_lehnt_ein_unbekanntes_feld_ab() {
    let ordner = tempfile::tempdir().unwrap();
    let pfad = ordner.path().join(DATEI);
    fs::write(&pfad, serde_json::to_vec(&mit_feld("schluessel", "geheim".into())).unwrap()).unwrap();
    let fehler = sicherung::lies(&pfad).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::Json(_)), "{fehler:?}");
}

/// Die Grenze greift vor dem Lesen: Die Datei ist dünn angelegt, belegt also keine 256 MiB.
#[test]
fn lies_lehnt_eine_uebergrosse_datei_ab() {
    let ordner = tempfile::tempdir().unwrap();
    let pfad = ordner.path().join(DATEI);
    fs::File::create(&pfad).unwrap().set_len(HOECHSTENS_BYTES + 1).unwrap();
    let fehler = sicherung::lies(&pfad).unwrap_err();
    assert!(matches!(fehler, SicherungFehler::ZuGross { bytes } if bytes == HOECHSTENS_BYTES + 1), "{fehler:?}");
    assert_eq!(HOECHSTENS_BYTES, 256 * 1024 * 1024);
}

// ---- Sicherungsstufe (Entscheidung 3) ----

fn jetzt() -> DateTime<Utc> {
    "2026-09-25T12:00:00Z".parse().unwrap()
}

fn angaben(ordner: Option<&str>, letzte: Option<&str>, fehler: Option<&str>, eingerichtet_am: &str) -> Sicherungsangaben {
    Sicherungsangaben {
        ordner: ordner.map(Into::into),
        letzte: letzte.map(Into::into),
        fehler: fehler.map(Into::into),
        eingerichtet_am: eingerichtet_am.into(),
    }
}

const LANGE_HER: &str = "2026-01-01T00:00:00+01:00";

#[test]
fn stufe_ist_im_testbetrieb_aus() {
    let a = angaben(None, None, Some("kaputt"), LANGE_HER);
    assert_eq!(sicherung::stufe(Betrieb::Test, &a, jetzt()), Sicherungsstufe::Aus);
}

#[test]
fn stufe_nach_6_tagen_23_stunden_ok() {
    // 2026-09-18T13:00Z, mit Offset der Einrichtungszone geschrieben.
    let a = angaben(Some("/sicherung"), Some("2026-09-18T15:00:00+02:00"), None, LANGE_HER);
    assert_eq!(sicherung::stufe(Betrieb::Echt, &a, jetzt()), Sicherungsstufe::Ok);
}

#[test]
fn stufe_nach_7_tagen_rot() {
    let a = angaben(Some("/sicherung"), Some("2026-09-18T14:00:00+02:00"), None, LANGE_HER);
    assert_eq!(sicherung::stufe(Betrieb::Echt, &a, jetzt()), Sicherungsstufe::Rot);
}

#[test]
fn stufe_mit_fehler_gelb() {
    let a = angaben(Some("/sicherung"), Some("2026-09-25T13:00:00+02:00"), Some("Ordner nicht erreichbar"), LANGE_HER);
    assert_eq!(sicherung::stufe(Betrieb::Echt, &a, jetzt()), Sicherungsstufe::Gelb);
}

#[test]
fn stufe_ohne_ordner_2_tage_nach_einrichtung_gelb() {
    let a = angaben(None, None, None, "2026-09-23T14:00:00+02:00");
    assert_eq!(sicherung::stufe(Betrieb::Echt, &a, jetzt()), Sicherungsstufe::Gelb);
}

#[test]
fn stufe_ohne_ordner_8_tage_nach_einrichtung_rot() {
    let a = angaben(None, None, None, "2026-09-17T14:00:00+02:00");
    assert_eq!(sicherung::stufe(Betrieb::Echt, &a, jetzt()), Sicherungsstufe::Rot);
}

/// Ein Zeitpunkt, den niemand lesen kann, ist kein Beleg für eine Sicherung.
#[test]
fn stufe_mit_unlesbarem_zeitpunkt_rot() {
    let a = angaben(Some("/sicherung"), Some("gestern"), None, LANGE_HER);
    assert_eq!(sicherung::stufe(Betrieb::Echt, &a, jetzt()), Sicherungsstufe::Rot);
}

#[test]
fn stufe_wird_klein_geschrieben_serialisiert() {
    let json: Vec<String> = [Sicherungsstufe::Aus, Sicherungsstufe::Ok, Sicherungsstufe::Gelb, Sicherungsstufe::Rot]
        .iter()
        .map(|s| serde_json::to_string(s).unwrap())
        .collect();
    assert_eq!(json, ["\"aus\"", "\"ok\"", "\"gelb\"", "\"rot\""]);
}

// ---- Sicherungsangaben im Buch ----

#[test]
fn sicherungsangaben_folgen_ordner_erfolg_und_fehler() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert_eq!(buch.sicherungsangaben().unwrap(), None);
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    assert_eq!(buch.sicherungsangaben().unwrap(), Some(angaben(None, None, None, "2026-01-01T00:00:00+01:00")));

    buch.sicherungsordner_setzen(Some("/Volumes/Sicherung")).unwrap();
    buch.sicherung_gescheitert("Ordner nicht erreichbar").unwrap();
    assert_eq!(
        buch.sicherungsangaben().unwrap(),
        Some(angaben(Some("/Volumes/Sicherung"), None, Some("Ordner nicht erreichbar"), "2026-01-01T00:00:00+01:00"))
    );

    buch.sicherung_gelungen("2026-09-25T12:00:00+02:00").unwrap();
    assert_eq!(
        buch.sicherungsangaben().unwrap(),
        Some(angaben(Some("/Volumes/Sicherung"), Some("2026-09-25T12:00:00+02:00"), None, "2026-01-01T00:00:00+01:00"))
    );

    buch.sicherungsordner_setzen(None).unwrap();
    assert_eq!(
        buch.sicherungsangaben().unwrap(),
        Some(angaben(None, Some("2026-09-25T12:00:00+02:00"), None, "2026-01-01T00:00:00+01:00"))
    );
}

#[test]
fn sicherungsangaben_setzen_verlangt_eine_einrichtung() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(matches!(buch.sicherungsordner_setzen(Some("/x")), Err(BuchFehler::NichtEingerichtet)));
    assert!(matches!(buch.sicherung_gelungen("2026-09-25T12:00:00+02:00"), Err(BuchFehler::NichtEingerichtet)));
    assert!(matches!(buch.sicherung_gescheitert("x"), Err(BuchFehler::NichtEingerichtet)));
}
