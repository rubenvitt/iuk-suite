//! Lokale Datenbank (Spec §4.2): Anlage, WAL/`synchronous`, Unveränderlichkeit von `bloecke`,
//! Betriebsart aus der Datei und Einrichtung samt Testbetrieb-Ende.
mod hilfe;

use einsatzbuch_kern::buch::{
    BuchFehler, Betrieb, Buch, beende_testbetrieb, erkenne_betrieb, hat_echte_einrichtung, verwirf_unfertiges_buch,
};
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

/// Vor dieser Änderung galt „Test vor Echt“: Lagen beide Dateien vor, gewann die Testdatenbank
/// still — ein Fund aus Phase C, denn die Betriebsart folgt seit Entscheidung 10 aus der
/// Einrichtung, und beide Dateien zugleich sind ein Zustand, der so nie entstehen sollte. Wer
/// ihn trotzdem vorfindet (z. B. nach einem manuellen Eingriff im Datenordner), soll ihn
/// gemeldet bekommen statt eine der beiden Dateien ungefragt zu verwerfen.
#[test]
fn beide_dateien_sind_ein_startfehler() {
    let ordner = tempfile::tempdir().unwrap();
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), None);
    drop(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), Some(Betrieb::Echt));
    drop(Buch::oeffne(ordner.path(), Betrieb::Test).unwrap());
    let fehler = erkenne_betrieb(ordner.path()).unwrap_err();
    assert!(matches!(fehler, BuchFehler::BeideDateien), "{fehler:?}");
    assert_eq!(
        fehler.to_string(),
        "Im Datenordner liegen sowohl einsatzbuch.db als auch einsatzbuch-test.db. Welche gilt, \
         ist unklar — bitte eine der beiden Dateien entfernen (lassen)."
    );
}

#[test]
fn einrichtung_nur_mit_passender_umgebung_und_schluessel_id() {
    let ordner = tempfile::tempdir().unwrap();
    let mut test = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(matches!(
        test.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME),
        Err(BuchFehler::FalscheUmgebung { .. })
    ));
    let mut falsch = hilfe::test_einrichtung(Umgebung::Test);
    falsch.schluessel_id = "0000000000000000".into();
    assert!(matches!(test.richte_ein(&falsch, hilfe::RECHNER_ID, hilfe::RECHNER_NAME), Err(BuchFehler::SchluesselIdPasstNicht)));
    test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    assert!(matches!(
        test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME),
        Err(BuchFehler::SchonEingerichtet)
    ));
    assert_eq!(test.einrichtung().unwrap().unwrap().paket.zeitzone, "Europe/Berlin");
}

#[test]
fn testbetrieb_beenden_loescht_datei_samt_wal_und_shm_auch_bei_offener_verbindung() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
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
        buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    }
    let buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let version: i64 = buch.verbindung().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 3);
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
        conn.pragma_update(None, "user_version", 4).unwrap();
    }
    assert!(matches!(
        Buch::oeffne(ordner.path(), Betrieb::Test),
        Err(BuchFehler::UnbekannteSchemaversion { gefunden: 4, bekannt: 3 })
    ));
}

/// v1→v3: Eine Datei, die noch unter v1 entstand — vor der
/// Anbindung an die Suite —, öffnet weiterhin. Die Einrichtung bleibt erhalten, `user_version`
/// steht danach auf 3 (v2 und v3 in einem Zug), und `anbindung()` liefert `Some` mit `rechner_id = ""` statt an der
/// fehlenden Spalte zu scheitern (`COALESCE`, siehe `Buch::anbindung`). Dieser Fall trifft nur
/// Entwicklerdateien — eine ausgelieferte Installation kennt nur Schema v2.
#[test]
fn migration_von_v1_auf_v2_behaelt_die_einrichtung_und_liefert_leere_rechner_id() {
    let ordner = tempfile::tempdir().unwrap();
    let pfad = ordner.path().join(Betrieb::Test.datei());
    {
        // v1-Schema von Hand nachgebaut: `schema.sql` plus eine Einrichtungszeile mit genau den
        // Spalten, die es unter v1 gab (keine der Anbindungsspalten aus `schema_v2.sql`).
        let conn = rusqlite::Connection::open(&pfad).unwrap();
        conn.execute_batch(include_str!("../src/schema.sql")).unwrap();
        conn.execute(
            "INSERT INTO einrichtung (id, umgebung, suite_url, oeffentlich_spki, schluessel_id, \
             stammdaten_json, stammdaten_version, frist_minuten, besatzung, zeitzone, bereitschaft, \
             eingerichtet_am, eingerichtet_von) \
             VALUES (1, 'test', 'https://iuk-ue.example', 'AAAA', '0000000000000000', '{\"fahrzeuge\":[],\"personal\":[],\"stichworte\":[]}', \
             1, 15, 0, 'Europe/Berlin', 'Regelbereitschaft', '2026-01-01T00:00:00+01:00', 'test')",
            [],
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
    }

    let buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let version: i64 = buch.verbindung().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 3);
    let einrichtung = buch.einrichtung().unwrap().expect("die v1-Einrichtung muss erhalten bleiben");
    assert_eq!(einrichtung.suite_url, "https://iuk-ue.example");
    let anbindung = buch.anbindung().unwrap().expect("eine Einrichtung liegt vor, also auch eine Anbindung");
    assert_eq!(anbindung.rechner_id, "");
    assert_eq!(anbindung.rechner_name, "");
    assert_eq!(anbindung.anker_gemeldet_bis, 0);
    assert!(!anbindung.widerrufen);
    assert_eq!(anbindung.stammdaten_etag, None);
    assert_eq!(anbindung.anker_abweichung, None);
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
        assert!(matches!(buch.richte_ein(&e, hilfe::RECHNER_ID, hilfe::RECHNER_NAME), Err(BuchFehler::FristAusserBereich(f)) if f == frist));
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
    assert!(matches!(buch.richte_ein(&e, hilfe::RECHNER_ID, hilfe::RECHNER_NAME), Err(BuchFehler::UngueltigeZeitzone(_))));
}

/// `uebernehme_stammdaten` ist die Naht für einen späteren Stammdatenabgleich — ohne
/// vorherige Einrichtung gibt es aber keine Zeile, die sie aktualisieren könnte.
#[test]
fn stammdatenabgleich_ohne_einrichtung_scheitert() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let paket = hilfe::test_einrichtung(Umgebung::Test).paket;
    assert!(matches!(buch.uebernehme_stammdaten(&paket, Some("etag-1"), "2026-01-01T00:00:00+01:00"), Err(BuchFehler::NichtEingerichtet)));
}

/// Die Frage „gibt es hier schon eine echte Einrichtung?“ darf die Antwort nicht selbst
/// verändern: Auf einem frischen Ordner legt sie keine `einsatzbuch.db` an — sonst meldete
/// `erkenne_betrieb` danach `Echt` statt „nicht eingerichtet“ (Spec §12).
#[test]
fn echte_einrichtung_pruefen_legt_auf_frischem_ordner_keine_datei_an() {
    let ordner = tempfile::tempdir().unwrap();
    assert!(!hat_echte_einrichtung(ordner.path()).unwrap());
    assert_eq!(std::fs::read_dir(ordner.path()).unwrap().count(), 0, "der Ordner muss leer bleiben");
    assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), None);
}

/// Eine `einsatzbuch.db` ohne Zeile in `einrichtung` ist keine echte Einrichtung; mit Zeile
/// schon — auch solange das echte Buch noch offen ist und die Zeile nur in der WAL steht.
#[test]
fn echte_einrichtung_zaehlt_erst_mit_zeile_in_einrichtung() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(!hat_echte_einrichtung(ordner.path()).unwrap());
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    assert!(hat_echte_einrichtung(ordner.path()).unwrap());
    drop(buch);
    assert!(hat_echte_einrichtung(ordner.path()).unwrap());
}

/// Eine leere Datei (ohne Schema, `user_version = 0`) meldet `false`, statt an der fehlenden
/// Tabelle zu scheitern — und wird dabei nicht migriert.
#[test]
fn echte_einrichtung_auf_leerer_datei_ist_false_ohne_migration() {
    let ordner = tempfile::tempdir().unwrap();
    std::fs::write(ordner.path().join("einsatzbuch.db"), b"").unwrap();
    assert!(!hat_echte_einrichtung(ordner.path()).unwrap());
    assert_eq!(std::fs::metadata(ordner.path().join("einsatzbuch.db")).unwrap().len(), 0);
}

#[test]
fn stammdaten_ueber_den_grenzen_des_readers_werden_abgelehnt() {
    // An der Grenze (UTF-16: 60 × „😀“ = 120 Einheiten) geht es noch.
    let mut an_der_grenze = hilfe::test_einrichtung(Umgebung::Test);
    an_der_grenze.paket.stammdaten.fahrzeuge[0].ruf = "😀".repeat(60);
    an_der_grenze.paket.stammdaten.stichworte[0].items.push("ä".repeat(80));
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&an_der_grenze, hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();

    // Einrichten: ein Funkrufname eine Einheit zu lang.
    let mut zu_lang = hilfe::test_einrichtung(Umgebung::Test);
    zu_lang.paket.stammdaten.fahrzeuge[0].ruf = format!("{}a", "😀".repeat(60));
    let ordner2 = tempfile::tempdir().unwrap();
    let mut buch2 = Buch::oeffne(ordner2.path(), Betrieb::Test).unwrap();
    let fehler = buch2.richte_ein(&zu_lang, hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap_err();
    assert!(
        matches!(&fehler, BuchFehler::StammdatenZuLang { feld: "Funkrufname", eintrag, laenge: 121, hoechstens: 120 } if eintrag == "11-83-1"),
        "{fehler:?}"
    );
    assert_eq!(fehler.to_string(), "Stammdaten zu lang: Funkrufname bei „11-83-1“ hat 121 Zeichen, erlaubt sind höchstens 120");
    assert!(buch2.einrichtung().unwrap().is_none(), "nichts eingerichtet");

    // Übernehmen: jedes Schnappschussfeld und jedes Stichwort einzeln.
    type Setze = fn(&mut einsatzbuch_kern::einrichtung::Stammdaten);
    let faelle: [(&str, usize, Setze); 10] = [
        ("Fahrzeug-ID", 80, |s| s.fahrzeuge[0].id = "x".repeat(81)),
        ("Fahrzeugtyp", 40, |s| s.fahrzeuge[0].typ = "x".repeat(41)),
        ("Kennung", 40, |s| s.fahrzeuge[0].kennung = "x".repeat(41)),
        ("Funkrufname", 120, |s| s.fahrzeuge[0].ruf = "x".repeat(121)),
        ("Standort", 80, |s| s.fahrzeuge[0].standort = "x".repeat(81)),
        ("Personen-ID", 80, |s| s.personal[0].id = "x".repeat(81)),
        ("Name", 120, |s| s.personal[0].name = "x".repeat(121)),
        ("Qualifikation", 40, |s| s.personal[0].quali = "x".repeat(41)),
        ("Ortsverein", 80, |s| s.personal[0].ov = "x".repeat(81)),
        ("Alarmstichwort", 80, |s| s.stichworte[1].items[0] = "x".repeat(81)),
    ];
    for (feld, grenze, setze) in faelle {
        let mut paket = an_der_grenze.paket.clone();
        setze(&mut paket.stammdaten);
        let fehler = buch.uebernehme_stammdaten(&paket, Some("etag-1"), "2026-01-01T00:00:00+01:00").unwrap_err();
        assert!(
            matches!(&fehler, BuchFehler::StammdatenZuLang { feld: f, hoechstens, .. } if *f == feld && *hoechstens == grenze),
            "{feld}: {fehler:?}"
        );
    }
    // Abgelehnt heißt: Die gespeicherten Stammdaten bleiben unverändert.
    assert_eq!(buch.einrichtung().unwrap().unwrap().paket, an_der_grenze.paket);
}

#[test]
fn stammdaten_der_entwickler_einrichtung_halten_die_grenzen_ein() {
    let json = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/entwicklung/stammdaten.json")).unwrap();
    let mut einrichtung = hilfe::test_einrichtung(Umgebung::Test);
    einrichtung.paket.stammdaten = serde_json::from_str(&json).unwrap();
    einsatzbuch_kern::grenzen::pruefe_stammdaten(&einrichtung.paket).unwrap();
}

/// `anbindung()` ohne Einrichtung ist `None`; nach `richte_ein` trägt sie genau die übergebenen
/// `rechnerId`/`rechnerName`, beginnt ohne Anker, unwiderrufen und ohne ETag.
#[test]
fn anbindung_ohne_einrichtung_ist_none_danach_traegt_sie_die_uebergebenen_werte() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert_eq!(buch.anbindung().unwrap(), None);

    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), "r7", "Wache Nord").unwrap();
    let anbindung = buch.anbindung().unwrap().unwrap();
    assert_eq!(anbindung.rechner_id, "r7");
    assert_eq!(anbindung.rechner_name, "Wache Nord");
    assert_eq!(anbindung.anker_gemeldet_bis, 0);
    assert!(!anbindung.widerrufen);
    assert_eq!(anbindung.stammdaten_etag, None);
    assert_eq!(anbindung.stammdaten_abgerufen, None);
    assert_eq!(anbindung.anker_abweichung, None);
}

/// Entscheidung 12: `richte_neu_ein` mit einer anderen `schluesselId` als der gepinnten wird
/// abgelehnt (`AndererSchluessel`, beide IDs in der Meldung), und nichts an der Einrichtung
/// ändert sich — geprüft an einer echten, nicht leeren Kette: Ein bloßer Längenvergleich wäre bei
/// zwei leeren Ketten vakuum-wahr.
#[test]
fn richte_neu_ein_lehnt_einen_anderen_schluessel_ab_und_aendert_nichts() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), "r1", "Wache Alt").unwrap();
    let jetzt = chrono::Utc::now();
    hilfe::versiegele_einen_einsatz(&mut buch, jetzt, 1);
    let vorher = buch.einrichtung().unwrap().unwrap();
    let vorher_anbindung = buch.anbindung().unwrap().unwrap();
    let bloecke_vorher = buch.bloecke().unwrap();
    assert_eq!(bloecke_vorher.len(), 1, "die Kette muss vor dem Versuch einen echten Block tragen");

    let anderer_geheim = p256::SecretKey::from_slice(&[9u8; 32]).unwrap();
    let anderes_spki = einsatzbuch_kern::krypto::b64(
        p256::pkcs8::EncodePublicKey::to_public_key_der(&anderer_geheim.public_key()).unwrap().as_bytes(),
    );
    let mut neue_einrichtung = hilfe::test_einrichtung(Umgebung::Echt);
    neue_einrichtung.oeffentlich_spki = anderes_spki.clone();
    neue_einrichtung.schluessel_id =
        einsatzbuch_kern::krypto::schluessel_id(&einsatzbuch_kern::krypto::aus_b64(&anderes_spki).unwrap());

    let fehler = buch.richte_neu_ein(&neue_einrichtung, "r2", "Wache Neu").unwrap_err();
    assert!(
        matches!(&fehler, BuchFehler::AndererSchluessel { gepinnt, neu } if gepinnt == &vorher.schluessel_id && neu == &neue_einrichtung.schluessel_id),
        "{fehler:?}"
    );
    assert_eq!(buch.einrichtung().unwrap().unwrap(), vorher, "die Einrichtung darf sich nicht geändert haben");
    assert_eq!(buch.anbindung().unwrap().unwrap(), vorher_anbindung, "die Anbindung darf sich nicht geändert haben");
    assert_eq!(buch.bloecke().unwrap(), bloecke_vorher, "die Kette darf sich nicht geändert haben");
}

/// Gleicher Schlüssel: `richte_neu_ein` übernimmt die neue `rechnerId`, setzt die Anbindung
/// zurück (`ankerGemeldetBis = 0`, unwiderrufen, keine Abweichung), lässt aber eine echte Kette
/// (mindestens ein Block) und `eingerichtetAm` unangetastet — es ist dieselbe Installation.
#[test]
fn richte_neu_ein_mit_gleichem_schluessel_setzt_die_anbindung_zurueck() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), "r1", "Wache Alt").unwrap();
    let jetzt = chrono::Utc::now();
    hilfe::versiegele_einen_einsatz(&mut buch, jetzt, 2);
    buch.anker_bestaetigt(1, "2026-09-24T10:00:00+02:00").unwrap();
    assert!(buch.bestaetigter_anker().unwrap().is_some());
    buch.widerrufen_setzen(true).unwrap();
    let vorher = buch.einrichtung().unwrap().unwrap();
    let bloecke_vorher = buch.bloecke().unwrap();
    assert_eq!(bloecke_vorher.len(), 1, "die Kette muss vor dem Neu-Einrichten einen echten Block tragen");

    buch.richte_neu_ein(&hilfe::test_einrichtung(Umgebung::Echt), "r2", "Wache Neu").unwrap();

    let nachher = buch.einrichtung().unwrap().unwrap();
    assert_eq!(nachher.eingerichtet_am, vorher.eingerichtet_am, "eingerichtetAm bleibt unverändert");
    assert_eq!(buch.bloecke().unwrap(), bloecke_vorher, "die Kette darf sich nicht geändert haben");
    let anbindung = buch.anbindung().unwrap().unwrap();
    assert_eq!(anbindung.rechner_id, "r2");
    assert_eq!(anbindung.rechner_name, "Wache Neu");
    assert_eq!(anbindung.anker_gemeldet_bis, 0);
    assert!(!anbindung.widerrufen);
    assert_eq!(anbindung.anker_abweichung, None);
    assert_eq!(buch.bestaetigter_anker().unwrap(), None, "richte_neu_ein setzt auch den Ankerzeitpunkt zurück");
    let am: Option<String> =
        buch.verbindung().query_row("SELECT anker_gemeldet_am FROM einrichtung WHERE id = 1", [], |r| r.get(0)).unwrap();
    assert_eq!(am, None);
}

/// `richte_neu_ein` ohne bestehende Einrichtung verlangt eine — es gibt sonst keinen gepinnten
/// Schlüssel, gegen den sie prüfen könnte.
#[test]
fn richte_neu_ein_ohne_einrichtung_scheitert() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(matches!(
        buch.richte_neu_ein(&hilfe::test_einrichtung(Umgebung::Echt), "r1", "Wache"),
        Err(BuchFehler::NichtEingerichtet)
    ));
}

/// `stammdaten_bestaetigt` (304 der Suite) schreibt nur den Abrufzeitpunkt fest und lässt Paket
/// und ETag unangetastet.
#[test]
fn stammdaten_bestaetigt_aendert_nur_den_abrufzeitpunkt() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    let paket = hilfe::test_einrichtung(Umgebung::Test).paket;
    buch.uebernehme_stammdaten(&paket, Some("etag-1"), "2026-01-01T00:00:00+01:00").unwrap();

    buch.stammdaten_bestaetigt("2026-01-02T00:00:00+01:00").unwrap();
    let anbindung = buch.anbindung().unwrap().unwrap();
    assert_eq!(anbindung.stammdaten_etag.as_deref(), Some("etag-1"), "das ETag bleibt unverändert");
    assert_eq!(anbindung.stammdaten_abgerufen.as_deref(), Some("2026-01-02T00:00:00+01:00"));
    assert_eq!(buch.einrichtung().unwrap().unwrap().paket, paket, "das Paket bleibt unverändert");
}

#[test]
fn stammdaten_bestaetigt_ohne_einrichtung_scheitert() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(matches!(buch.stammdaten_bestaetigt("2026-01-01T00:00:00+01:00"), Err(BuchFehler::NichtEingerichtet)));
}

/// `anker_abweichung_setzen` merkt die gemeldete Abweichung vor, lesbar über `anbindung()`.
#[test]
fn anker_abweichung_setzen_und_lesen() {
    use einsatzbuch_kern::buch::Ankerabweichung;

    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();

    let abweichung = Ankerabweichung { block: 3, erwartet: "a".repeat(64), gemeldet: "b".repeat(64) };
    buch.anker_abweichung_setzen(&abweichung).unwrap();
    assert_eq!(buch.anbindung().unwrap().unwrap().anker_abweichung, Some(abweichung));
}

#[test]
fn anker_abweichung_setzen_ohne_einrichtung_scheitert() {
    use einsatzbuch_kern::buch::Ankerabweichung;

    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let abweichung = Ankerabweichung { block: 1, erwartet: "a".repeat(64), gemeldet: "b".repeat(64) };
    assert!(matches!(buch.anker_abweichung_setzen(&abweichung), Err(BuchFehler::NichtEingerichtet)));
}

/// `widerrufen_setzen` schaltet den Widerruf in beide Richtungen.
#[test]
fn widerrufen_setzen_schaltet_in_beide_richtungen() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    assert!(!buch.anbindung().unwrap().unwrap().widerrufen);

    buch.widerrufen_setzen(true).unwrap();
    assert!(buch.anbindung().unwrap().unwrap().widerrufen);

    buch.widerrufen_setzen(false).unwrap();
    assert!(!buch.anbindung().unwrap().unwrap().widerrufen);
}

#[test]
fn widerrufen_setzen_ohne_einrichtung_scheitert() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(matches!(buch.widerrufen_setzen(true), Err(BuchFehler::NichtEingerichtet)));
}

/// Review Focus 3: Scheitert eine Einrichtung, nachdem die Datei schon angelegt ist, räumt die
/// Hülle sie mit `verwirf_unfertiges_buch` wieder ab — auch im Echtbetrieb, den
/// `beende_testbetrieb` zu Recht verweigert. Samt `-wal` und `-shm`.
#[test]
fn unfertiges_buch_wird_samt_wal_und_shm_verworfen_auch_echt() {
    for betrieb in [Betrieb::Echt, Betrieb::Test] {
        let ordner = tempfile::tempdir().unwrap();
        let buch = Buch::oeffne(ordner.path(), betrieb).unwrap();
        assert!(ordner.path().join(betrieb.datei()).exists());
        verwirf_unfertiges_buch(buch).unwrap();
        for zusatz in ["", "-wal", "-shm"] {
            let datei = format!("{}{zusatz}", betrieb.datei());
            assert!(!ordner.path().join(&datei).exists(), "{datei} liegt noch da");
        }
        assert_eq!(erkenne_betrieb(ordner.path()).unwrap(), None);
    }
}

/// Ein eingerichtetes Buch ist nie „unfertig“: Der Weg löscht kein echtes Einsatzbuch.
#[test]
fn eingerichtetes_buch_wird_nicht_verworfen() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    assert!(matches!(verwirf_unfertiges_buch(buch), Err(BuchFehler::SchonEingerichtet)));
    assert!(ordner.path().join("einsatzbuch.db").exists());
    assert!(hat_echte_einrichtung(ordner.path()).unwrap());
}

#[test]
fn hash_eines_blocks_nach_nummer() {
    use chrono::{TimeZone, Utc};
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    assert_eq!(buch.hash_von(1).unwrap(), None);
    hilfe::versiegele_einen_einsatz(&mut buch, Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap(), 1);
    hilfe::versiegele_einen_einsatz(&mut buch, Utc.with_ymd_and_hms(2026, 8, 22, 4, 12, 0).unwrap(), 2);
    let bloecke = buch.bloecke().unwrap();
    assert_eq!(buch.hash_von(1).unwrap().as_deref(), Some(bloecke[0].hash.as_str()));
    assert_eq!(buch.hash_von(2).unwrap().as_deref(), Some(bloecke[1].hash.as_str()));
    assert_eq!(buch.hash_von(3).unwrap(), None);
}

/// Eine frische Datei landet unmittelbar bei Schema v3 — samt Tabelle `unquittiert` und den
/// Spalten `anker_gemeldet_am` und `sicherung_fehler`.
#[test]
fn frische_datei_landet_direkt_bei_schema_v3() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let c = buch.verbindung();
    assert_eq!(c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)).unwrap(), 3);
    assert_eq!(c.query_row("SELECT COUNT(*) FROM unquittiert", [], |r| r.get::<_, i64>(0)).unwrap(), 0);
    c.prepare("SELECT anker_gemeldet_am, sicherung_fehler FROM einrichtung").unwrap();
    assert_eq!(buch.unquittiert().unwrap(), None);
    assert_eq!(buch.bestaetigter_anker().unwrap(), None);
}

/// v2→v3: Eine Datei aus Stufe 5 (`schema.sql` + `schema_v2.sql`, `user_version = 2`) wird beim
/// Öffnen auf v3 gehoben. Einrichtung, Anbindung und Blöcke bleiben erhalten; es gibt noch keine
/// unquittierte Versiegelung und keinen bestätigten Anker mit Zeitpunkt.
#[test]
fn migration_von_v2_auf_v3_behaelt_einrichtung_und_bloecke() {
    let ordner = tempfile::tempdir().unwrap();
    let pfad = ordner.path().join(Betrieb::Echt.datei());
    let hash = "a".repeat(64);
    {
        let conn = rusqlite::Connection::open(&pfad).unwrap();
        conn.execute_batch(include_str!("../src/schema.sql")).unwrap();
        conn.execute_batch(include_str!("../src/schema_v2.sql")).unwrap();
        conn.execute(
            "INSERT INTO einrichtung (id, umgebung, suite_url, oeffentlich_spki, schluessel_id, \
             stammdaten_json, stammdaten_version, frist_minuten, besatzung, zeitzone, bereitschaft, \
             eingerichtet_am, eingerichtet_von, rechner_id, rechner_name, anker_gemeldet_bis) \
             VALUES (1, 'echt', 'https://iuk-ue.example', 'AAAA', '0000000000000000', '{\"fahrzeuge\":[],\"personal\":[],\"stichworte\":[]}', \
             1, 15, 0, 'Europe/Berlin', 'Regelbereitschaft', '2026-01-01T00:00:00+01:00', 'test', 'r1', 'Wache', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO bloecke (block, json, hash, versiegelt) VALUES (1, '{}', ?1, '2026-01-01T00:05:00+01:00')",
            [&hash],
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
    }

    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let version: i64 = buch.verbindung().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 3);
    let einrichtung = buch.einrichtung().unwrap().expect("die v2-Einrichtung muss erhalten bleiben");
    assert_eq!(einrichtung.suite_url, "https://iuk-ue.example");
    let anbindung = buch.anbindung().unwrap().unwrap();
    assert_eq!(anbindung.rechner_id, "r1");
    assert_eq!(anbindung.anker_gemeldet_bis, 1);
    assert_eq!(buch.kettenkopf().unwrap(), Some((1, hash)));
    assert_eq!(buch.unquittiert().unwrap(), None);
    // Bestätigt bis 1, aber ohne Zeitpunkt (den kannte v2 nicht): kein Exportanker.
    assert_eq!(buch.bestaetigter_anker().unwrap(), None);
}

/// Ankerzeitpunkt: `anker_bestaetigt(3, t)` setzt Stand und Zeitpunkt; eine verspätete Bestätigung
/// eines kleineren Blocks ändert keins von beiden; dieselbe Blocknummer erneut (der stündliche
/// Lauf meldet den letzten Block noch einmal) frischt den Zeitpunkt auf.
#[test]
fn anker_bestaetigt_setzt_zeitpunkt_nur_bei_gleichem_oder_hoeherem_block() {
    use chrono::{TimeZone, Utc};
    use einsatzbuch_kern::buch::Exportanker;
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    for i in 1..=3u8 {
        hilfe::versiegele_einen_einsatz(&mut buch, Utc.with_ymd_and_hms(2026, 8, 22, 3, 12 + u32::from(i), 0).unwrap(), i);
    }
    let hash3 = buch.hash_von(3).unwrap().unwrap();
    assert_eq!(buch.bestaetigter_anker().unwrap(), None, "vor der ersten Bestätigung gibt es keinen Anker");

    buch.anker_bestaetigt(3, "2026-09-24T10:00:00+02:00").unwrap();
    let erwartet = Exportanker { block: 3, hash: hash3.clone(), gemeldet_am: "2026-09-24T10:00:00+02:00".into() };
    assert_eq!(buch.bestaetigter_anker().unwrap(), Some(erwartet.clone()));
    assert_eq!(buch.anbindung().unwrap().unwrap().anker_gemeldet_bis, 3);

    buch.anker_bestaetigt(2, "2026-09-24T11:00:00+02:00").unwrap();
    assert_eq!(buch.bestaetigter_anker().unwrap(), Some(erwartet), "eine überholte Bestätigung ändert nichts");
    assert_eq!(buch.anbindung().unwrap().unwrap().anker_gemeldet_bis, 3);

    buch.anker_bestaetigt(3, "2026-09-24T12:00:00+02:00").unwrap();
    assert_eq!(
        buch.bestaetigter_anker().unwrap(),
        Some(Exportanker { block: 3, hash: hash3, gemeldet_am: "2026-09-24T12:00:00+02:00".into() })
    );
}

/// `Exportanker` geht 1:1 in `Exportinhalt.anker` des TS-Kerns (`format.ts`): camelCase.
#[test]
fn exportanker_ist_camel_case() {
    use einsatzbuch_kern::buch::Exportanker;
    let a = Exportanker { block: 3, hash: "h".into(), gemeldet_am: "2026-09-24T10:00:00+02:00".into() };
    assert_eq!(
        serde_json::to_value(&a).unwrap(),
        serde_json::json!({ "block": 3, "hash": "h", "gemeldetAm": "2026-09-24T10:00:00+02:00" })
    );
}

#[test]
fn anker_bestaetigt_ohne_einrichtung_scheitert() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(matches!(buch.anker_bestaetigt(1, "2026-09-24T10:00:00+02:00"), Err(BuchFehler::NichtEingerichtet)));
    assert_eq!(buch.bestaetigter_anker().unwrap(), None);
}
