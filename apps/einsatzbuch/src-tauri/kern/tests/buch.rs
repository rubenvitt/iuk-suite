//! Lokale Datenbank (Spec §4.2): Anlage, WAL/`synchronous`, Unveränderlichkeit von `bloecke`,
//! Betriebsart aus der Datei und Einrichtung samt Testbetrieb-Ende.
mod hilfe;

use einsatzbuch_kern::buch::{Betrieb, Buch, beende_testbetrieb, erkenne_betrieb};
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
    assert_eq!(erkenne_betrieb(ordner.path()), None);
    drop(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()), Some(Betrieb::Echt));
    drop(Buch::oeffne(ordner.path(), Betrieb::Test).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()), Some(Betrieb::Test));
}

#[test]
fn einrichtung_nur_mit_passender_umgebung_und_schluessel_id() {
    let ordner = tempfile::tempdir().unwrap();
    let mut test = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(test.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt)).is_err());
    let mut falsch = hilfe::test_einrichtung(Umgebung::Test);
    falsch.schluessel_id = "0000000000000000".into();
    assert!(test.richte_ein(&falsch).is_err());
    test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    assert!(test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).is_err()); // schon eingerichtet
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
    assert_eq!(erkenne_betrieb(ordner.path()), None);
}

#[test]
fn testbetrieb_beenden_verweigert_ein_echtes_buch() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(beende_testbetrieb(ordner.path(), buch).is_err());
    assert!(ordner.path().join("einsatzbuch.db").exists());
}
