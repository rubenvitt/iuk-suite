//! Erfassung: Entwurf speichern/verwerfen und Absenden mit Prüfung (Spec §4.3).
mod hilfe;

use chrono::{TimeZone, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch};
use einsatzbuch_kern::erfassung::{Entwurf, ErfassungFehler, PersonAuswahl};
use einsatzbuch_kern::format::Umgebung;

fn leerer_entwurf() -> Entwurf {
    Entwurf {
        stichwort: String::new(),
        beginn_datum: String::new(),
        beginn_zeit: String::new(),
        ende_datum: String::new(),
        ende_zeit: String::new(),
        strasse: String::new(),
        ort: String::new(),
        objekt: String::new(),
        fahrzeuge: Vec::new(),
        personal: Vec::new(),
        vor_ort: 0,
        transport: 0,
        notizen: String::new(),
    }
}

fn gueltiger_entwurf() -> Entwurf {
    Entwurf {
        stichwort: "RD 2".into(),
        beginn_datum: "2026-08-22".into(),
        beginn_zeit: "03:12".into(),
        ende_datum: String::new(),
        ende_zeit: String::new(),
        strasse: String::new(),
        ort: "29525 Uelzen".into(),
        objekt: String::new(),
        fahrzeuge: vec!["11-83-1".into()],
        personal: vec![PersonAuswahl { id: "p4".into(), fahrzeug_id: Some("11-83-1".into()) }],
        vor_ort: 0,
        transport: 1,
        notizen: "erste Fassung".into(),
    }
}

#[test]
fn absenden_verlangt_stichwort_beginn_und_ort() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    let ergebnis = buch.sende_ab(&leerer_entwurf(), Utc::now(), false);
    assert!(
        matches!(&ergebnis, Err(ErfassungFehler::Fehlt(f)) if f == &vec!["Alarmstichwort", "Beginn", "Einsatzort"]),
        "{ergebnis:?}"
    );

    // Nur `ort` gesetzt, kein `strasse`, wird akzeptiert.
    let mut mit_ort = gueltiger_entwurf();
    mit_ort.strasse = String::new();
    assert!(buch.sende_ab(&mit_ort, Utc::now(), false).is_ok());
}

#[test]
fn absenden_prueft_formate_und_ids() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    let mut zeit_ungueltig = gueltiger_entwurf();
    zeit_ungueltig.beginn_zeit = "24:00".into();
    assert!(matches!(buch.sende_ab(&zeit_ungueltig, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));

    let mut datum_ungueltig = gueltiger_entwurf();
    datum_ungueltig.beginn_datum = "2026-02-31".into();
    assert!(matches!(buch.sende_ab(&datum_ungueltig, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));

    let mut unbekanntes_fahrzeug = gueltiger_entwurf();
    unbekanntes_fahrzeug.fahrzeuge = vec!["xx".into()];
    unbekanntes_fahrzeug.personal = vec![];
    assert!(matches!(buch.sende_ab(&unbekanntes_fahrzeug, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));

    let mut nicht_gewaehltes_fahrzeug = gueltiger_entwurf();
    nicht_gewaehltes_fahrzeug.fahrzeuge = vec!["11-83-1".into(), "12-19-1".into()];
    nicht_gewaehltes_fahrzeug.personal = vec![PersonAuswahl { id: "p4".into(), fahrzeug_id: Some("11-11-1".into()) }];
    assert!(matches!(buch.sende_ab(&nicht_gewaehltes_fahrzeug, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));

    let mut zu_viele = gueltiger_entwurf();
    zu_viele.vor_ort = 1000;
    assert!(matches!(buch.sende_ab(&zu_viele, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));
}

#[test]
fn erneutes_absenden_verlaengert_die_frist_nicht() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    let erste = buch.sende_ab(&gueltiger_entwurf(), t0, false).unwrap();
    assert_eq!(erste.frist_bis_ms, t0.timestamp_millis() + 15 * 60_000);

    let mut geaendert = gueltiger_entwurf();
    geaendert.notizen = "neue Notiz".into();
    let zehn_minuten_spaeter = t0 + chrono::Duration::minutes(10);
    let zweite = buch.sende_ab(&geaendert, zehn_minuten_spaeter, true).unwrap();
    assert_eq!(zweite.frist_bis_ms, erste.frist_bis_ms);
    assert_eq!(zweite.abgesendet_am, erste.abgesendet_am);
    assert_eq!(zweite.entwurf.notizen, "neue Notiz");
}

#[test]
fn doppelte_id_ergibt_ungueltig() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    let mut doppeltes_fahrzeug = gueltiger_entwurf();
    doppeltes_fahrzeug.fahrzeuge = vec!["11-83-1".into(), "11-83-1".into()];
    assert!(matches!(buch.sende_ab(&doppeltes_fahrzeug, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));

    let mut doppelte_person = gueltiger_entwurf();
    doppelte_person.personal =
        vec![PersonAuswahl { id: "p4".into(), fahrzeug_id: None }, PersonAuswahl { id: "p4".into(), fahrzeug_id: None }];
    assert!(matches!(buch.sende_ab(&doppelte_person, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));
}

#[test]
fn neunhundertneunundneunzig_geht_tausend_nicht() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    let mut an_der_grenze = gueltiger_entwurf();
    an_der_grenze.vor_ort = 999;
    an_der_grenze.transport = 999;
    assert!(buch.sende_ab(&an_der_grenze, Utc::now(), false).is_ok());

    let mut ueber_der_grenze = gueltiger_entwurf();
    ueber_der_grenze.vor_ort = 1000;
    assert!(matches!(buch.sende_ab(&ueber_der_grenze, Utc::now(), false), Err(ErfassungFehler::Ungueltig(_))));
}

#[test]
fn ausstehend_bestaetigt_nach_erneutem_absenden_den_neuen_stand_und_die_alte_frist() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    let erste = buch.sende_ab(&gueltiger_entwurf(), t0, false).unwrap();

    let mut geaendert = gueltiger_entwurf();
    geaendert.notizen = "zweite Fassung".into();
    buch.sende_ab(&geaendert, t0 + chrono::Duration::minutes(10), true).unwrap();

    let ausstehend = buch.ausstehend().unwrap().unwrap();
    assert_eq!(ausstehend.entwurf.notizen, "zweite Fassung");
    assert_eq!(ausstehend.frist_bis_ms, erste.frist_bis_ms);
    assert_eq!(ausstehend.frist_bis, erste.frist_bis);
}

#[test]
fn absenden_formatiert_abgesendet_am_und_frist_bis_in_der_suite_zone() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();

    // 2026-08-22T03:12:00Z ist Sommerzeit in Europe/Berlin (+02:00) → 05:12/05:27 Ortszeit.
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    let ausstehend = buch.sende_ab(&gueltiger_entwurf(), t0, false).unwrap();
    assert_eq!(ausstehend.abgesendet_am, "2026-08-22T05:12:00+02:00");
    assert_eq!(ausstehend.frist_bis, "2026-08-22T05:27:00+02:00");
}

#[test]
fn ohne_einrichtung_kein_absenden() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(matches!(buch.sende_ab(&gueltiger_entwurf(), Utc::now(), false), Err(ErfassungFehler::NichtEingerichtet)));
}

#[test]
fn entwurf_speichern_und_verwerfen() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert_eq!(buch.entwurf().unwrap(), None);

    buch.speichere_entwurf(&gueltiger_entwurf(), Utc::now(), false).unwrap();
    assert_eq!(buch.entwurf().unwrap().unwrap().stichwort, "RD 2");

    buch.verwerfe_entwurf().unwrap();
    assert_eq!(buch.entwurf().unwrap(), None);
}
