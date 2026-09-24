//! Lokale Datenbank (Spec §4.2): Anlage, WAL/`synchronous`, Unveränderlichkeit von `bloecke`,
//! Betriebsart aus der Datei und Einrichtung samt Testbetrieb-Ende.
mod hilfe;

use einsatzbuch_kern::buch::{BuchFehler, Betrieb, Buch, beende_testbetrieb, erkenne_betrieb};
use einsatzbuch_kern::format::Umgebung;

#[test]
fn legt_an_wal_und_synchronous_full() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let c = buch.verbindung();
    assert_eq!(c.query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0)).unwrap(), "wal");
    assert_eq!(c.query_row("PRAGMA synchronous", [], |r| r.get::<_, i64>(0)).unwrap(), 2); // FULL
    assert!(ordner.path().join("einsatzbuch.db").exists());
}

#[test]
fn trigger_verbieten_update_und_delete_nur_auf_bloecke() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let c = buch.verbindung();
    c.execute("INSERT INTO bloecke (block, json, hash, versiegelt) VALUES (1, '{}', ?1, 'x')", [&"a".repeat(64)]).unwrap();
    let upd = c.execute("UPDATE bloecke SET json = '[]' WHERE block = 1", []).unwrap_err().to_string();
    assert!(upd.contains("unveränderlich"), "{upd}");
    let del = c.execute("DELETE FROM bloecke WHERE block = 1", []).unwrap_err().to_string();
    assert!(del.contains("unveränderlich"), "{del}");
    // Die übrigen Tabellen sind normal änderbar.
    c.execute("INSERT INTO entwurf (id, json, geaendert_am) VALUES (1, '{}', 'x')", []).unwrap();
    c.execute("UPDATE entwurf SET json = '[]'", []).unwrap();
    c.execute("DELETE FROM entwurf", []).unwrap();
    c.execute("INSERT INTO nummern (jahr, letzte) VALUES (2026, 1)", []).unwrap();
    c.execute("UPDATE nummern SET letzte = 2", []).unwrap();
}

#[test]
fn betriebsart_aus_der_datei_test_vor_echt() {
    let ordner = tempfile::tempdir().unwrap();
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), None);
    drop(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), Some(Betrieb::Echt));
    drop(Buch::oeffne(ordner.path(), Betrieb::Test).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), Some(Betrieb::Test));
}

#[test]
fn einrichtung_nur_mit_passender_umgebung_und_schluessel_id() {
    let ordner = tempfile::tempdir().unwrap();
    let mut test = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(matches!(
        test.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt)),
        Err(BuchFehler::FalscheUmgebung { .. })
    ));
    let mut falsch = hilfe::test_einrichtung(Umgebung::Test);
    falsch.schluessel_id = "0000000000000000".into();
    assert!(matches!(test.richte_ein(&falsch), Err(BuchFehler::SchluesselIdPasstNicht)));
    test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    assert!(matches!(
        test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)),
        Err(BuchFehler::SchonEingerichtet)
    ));
    assert_eq!(test.einrichtung().unwrap().unwrap().paket.zeitzone, "Europe/Berlin");
}

#[test]
fn testbetrieb_beenden_loescht_datei_samt_wal_und_shm_auch_bei_offener_verbindung() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    assert!(ordner.path().join("einsatzbuch-test.db-wal").exists());
    beende_testbetrieb(ordner.path(), buch).unwrap();
    for f in ["einsatzbuch-test.db", "einsatzbuch-test.db-wal", "einsatzbuch-test.db-shm"] {
        assert!(!ordner.path().join(f).exists(), "{f} liegt noch da");
    }
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), None);
}

#[test]
fn testbetrieb_beenden_verweigert_ein_echtes_buch() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(matches!(beende_testbetrieb(ordner.path(), buch), Err(BuchFehler::NichtImTestbetrieb)));
    assert!(ordner.path().join("einsatzbuch.db").exists());
}

/// Dasselbe Verzeichnis ein zweites Mal geöffnet muss `user_version` unverändert lassen
/// (kein erneutes `richte_schema_ein`, keine zweite Migration) und die schon geschriebene
/// Einrichtung unangetastet zurückgeben.
#[test]
fn erneutes_oeffnen_derselben_datei_behaelt_schemaversion_und_einrichtung() {
    let ordner = tempfile::tempdir().unwrap();
    {
        let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
        buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    }
    let buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let version: i64 = buch.verbindung().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 1);
    let einrichtung = buch.einrichtung().unwrap();
    assert!(einrichtung.is_some());
    assert_eq!(einrichtung.unwrap().paket.zeitzone, "Europe/Berlin");
}

/// Eine höhere, diesem Rechner unbekannte Schemaversion darf nicht kommentarlos weiterlaufen
/// — dieser Rechner kennt kein Rückwärtsschema und muss das Öffnen verweigern.
#[test]
fn unbekannte_hoehere_schemaversion_wird_beim_oeffnen_verweigert() {
    let ordner = tempfile::tempdir().unwrap();
    drop(Buch::oeffne(ordner.path(), Betrieb::Test).unwrap());
    {
        let conn = rusqlite::Connection::open(ordner.path().join(Betrieb::Test.datei())).unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
    }
    assert!(matches!(
        Buch::oeffne(ordner.path(), Betrieb::Test),
        Err(BuchFehler::UnbekannteSchemaversion { gefunden: 2, bekannt: 1 })
    ));
}

/// `frist_minuten` außerhalb von 1..=120 ist keine sinnvolle Frist und muss `richte_ein`
/// scheitern lassen — sowohl an der unteren als auch an der oberen Grenze.
#[test]
fn frist_ausserhalb_von_1_bis_120_wird_abgelehnt() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    for frist in [0u32, 121u32] {
        let mut e = hilfe::test_einrichtung(Umgebung::Test);
        e.paket.frist_minuten = frist;
        // Beide Fälle scheitern schon an der Feldregel, bevor irgendetwas geschrieben wird —
        // dieselbe Verbindung kann also für beide Grenzwerte wiederverwendet werden.
        assert!(matches!(buch.richte_ein(&e), Err(BuchFehler::FristAusserBereich(f)) if f == frist));
    }
}

/// Eine Zeitzone, die `chrono_tz` nicht kennt, ist keine gültige IANA-Zeitzone und muss
/// `richte_ein` ebenso scheitern lassen wie eine Frist außerhalb des erlaubten Bereichs.
#[test]
fn ungueltige_zeitzone_wird_abgelehnt() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let mut e = hilfe::test_einrichtung(Umgebung::Test);
    e.paket.zeitzone = "Nirgendwo/Erfunden".into();
    assert!(matches!(buch.richte_ein(&e), Err(BuchFehler::UngueltigeZeitzone(_))));
}

/// `uebernehme_stammdaten` ist die Naht für einen späteren Stammdatenabgleich — ohne
/// vorherige Einrichtung gibt es aber keine Zeile, die sie aktualisieren könnte.
#[test]
fn stammdatenabgleich_ohne_einrichtung_scheitert() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let paket = hilfe::test_einrichtung(Umgebung::Test).paket;
    assert!(matches!(buch.uebernehme_stammdaten(&paket), Err(BuchFehler::NichtEingerichtet)));
}
