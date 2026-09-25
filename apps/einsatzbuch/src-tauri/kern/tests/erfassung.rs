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

/// Absenden mit einem geänderten Entwurf; `Ok` oder die Meldung von `Ungueltig`.
fn sende(teil: impl FnOnce(&mut Entwurf)) -> Result<(), String> {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    let mut e = gueltiger_entwurf();
    teil(&mut e);
    match buch.sende_ab(&e, Utc::now(), false) {
        Ok(_) => Ok(()),
        Err(ErfassungFehler::Ungueltig(meldung)) => Err(meldung),
        Err(sonst) => panic!("unerwarteter Fehler: {sonst:?}"),
    }
}

#[test]
fn textfelder_zaehlen_utf16_codeeinheiten_wie_der_reader() {
    // 80 × „ä“ sind 80 Codeeinheiten (aber 160 Byte), 40 × „😀“ sind 80 Codeeinheiten (aber nur
    // 40 Zeichen): Beides passt genau, eine Einheit mehr nicht.
    assert_eq!(sende(|e| e.stichwort = "ä".repeat(80)), Ok(()));
    assert_eq!(sende(|e| e.stichwort = "😀".repeat(40)), Ok(()));
    let meldung = sende(|e| e.stichwort = format!("{}a", "😀".repeat(40))).unwrap_err();
    assert_eq!(meldung, "Alarmstichwort darf höchstens 80 Zeichen lang sein, hat 81");

    for (feld, grenze, setze) in [
        ("Straße", 200, (|e: &mut Entwurf, s: String| e.strasse = s) as fn(&mut Entwurf, String)),
        ("Ort", 200, |e, s| e.ort = s),
        ("Objekt", 500, |e, s| e.objekt = s),
        ("Notizen", 20_000, |e, s| e.notizen = s),
    ] {
        assert_eq!(sende(|e| setze(e, "ä".repeat(grenze))), Ok(()), "{feld} an der Grenze");
        let meldung = sende(|e| setze(e, "😀".repeat(grenze / 2 + 1))).unwrap_err();
        assert_eq!(meldung, format!("{feld} darf höchstens {grenze} Zeichen lang sein, hat {}", grenze + 2));
    }
}

#[test]
fn laenge_zaehlt_nach_dem_trimmen() {
    // Versiegelt wird der getrimmte Wert, also zählt auch nur der.
    assert_eq!(sende(|e| e.stichwort = format!("  {}  ", "a".repeat(80))), Ok(()));
    assert_eq!(sende(|e| e.ort = format!(" {} ", "a".repeat(200))), Ok(()));
}

#[test]
fn hoechstens_200_fahrzeuge_und_1000_kraefte_je_einsatz() {
    use einsatzbuch_kern::einrichtung::{Fahrzeug, Person};

    let mut einrichtung = hilfe::test_einrichtung(Umgebung::Test);
    einrichtung.paket.stammdaten.fahrzeuge = (0..201)
        .map(|i| Fahrzeug { id: format!("f{i}"), typ: "RTW".into(), kennung: format!("f{i}"), ruf: format!("Ruf {i}"), standort: "Uelzen".into() })
        .collect();
    einrichtung.paket.stammdaten.personal =
        (0..1001).map(|i| Person { id: format!("p{i}"), name: format!("Person {i}"), quali: "RS".into(), ov: "Uelzen".into() }).collect();

    let versuche = |fahrzeuge: usize, personen: usize| {
        let ordner = tempfile::tempdir().unwrap();
        let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
        // Die Stammdaten dürfen mehr führen, als ein Einsatz nennen darf.
        buch.richte_ein(&einrichtung).unwrap();
        let mut e = gueltiger_entwurf();
        e.fahrzeuge = (0..fahrzeuge).map(|i| format!("f{i}")).collect();
        e.personal = (0..personen).map(|i| PersonAuswahl { id: format!("p{i}"), fahrzeug_id: None }).collect();
        buch.sende_ab(&e, Utc::now(), false)
    };

    assert!(versuche(200, 1000).is_ok());
    assert!(
        matches!(versuche(201, 0), Err(ErfassungFehler::Ungueltig(m)) if m == "höchstens 200 Fahrzeuge je Einsatz, gewählt sind 201")
    );
    assert!(
        matches!(versuche(0, 1001), Err(ErfassungFehler::Ungueltig(m)) if m == "höchstens 1000 Kräfte je Einsatz, gewählt sind 1001")
    );
}

#[test]
fn ende_nur_mit_datum_und_uhrzeit() {
    assert_eq!(
        sende(|e| e.ende_datum = "2026-08-22".into()),
        Err("Ende braucht Datum und Uhrzeit zusammen oder keins von beiden".into())
    );
    assert_eq!(sende(|e| e.ende_zeit = "04:00".into()), Err("Ende braucht Datum und Uhrzeit zusammen oder keins von beiden".into()));
    assert_eq!(
        sende(|e| {
            e.ende_datum = "2026-08-22".into();
            e.ende_zeit = "04:00".into();
        }),
        Ok(())
    );
}

#[test]
fn uhrzeit_und_kalendertag_wie_der_reader() {
    for zeit in ["24:00", "23:60", "7:05", "07:5", "07-05", " 0:00"] {
        assert!(sende(|e| e.beginn_zeit = zeit.into()).is_err(), "{zeit}");
    }
    assert_eq!(sende(|e| e.beginn_zeit = "23:59".into()), Ok(()));
    for datum in ["2026-02-29", "2026-13-01", "2026-8-22", "0099-12-31", "0000-01-01"] {
        assert!(sende(|e| e.beginn_datum = datum.into()).is_err(), "{datum}");
    }
    assert_eq!(sende(|e| e.beginn_datum = "2028-02-29".into()), Ok(()));
    // `Date.UTC` im Reader legt 0–99 auf 1900–1999; ab 100 stimmt der Rundlauf.
    assert_eq!(sende(|e| e.beginn_datum = "0100-01-01".into()), Ok(()));
    assert!(sende(|e| {
        e.ende_datum = "0099-12-31".into();
        e.ende_zeit = "04:00".into();
    })
    .is_err());
}

#[test]
fn volle_kette_nimmt_keinen_neuen_einsatz_an() {
    use einsatzbuch_kern::grenzen;

    assert!(grenzen::kette_hat_platz(None));
    assert!(grenzen::kette_hat_platz(Some(9_999)));
    assert!(!grenzen::kette_hat_platz(Some(10_000)));

    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    // 10 000 echte Blöcke wären zu teuer. Die Trigger verbieten nur UPDATE und DELETE, und
    // `sende_ab` sieht nur MAX(block) — also genügt eine Zeile mit Block 10 000.
    buch.verbindung()
        .execute("INSERT INTO bloecke (block, json, hash, versiegelt) VALUES (9999, '{}', ?1, 'x')", [&"a".repeat(64)])
        .unwrap();
    assert!(buch.sende_ab(&gueltiger_entwurf(), Utc::now(), false).is_ok(), "9 999 Blöcke: einer passt noch");
    buch.versiegele_ausstehend(Utc::now(), &mut hilfe::FesterZufall(7), false).unwrap().unwrap();
    assert_eq!(buch.kettenkopf().unwrap().unwrap().0, 10_000);

    let ergebnis = buch.sende_ab(&gueltiger_entwurf(), Utc::now(), false);
    assert!(matches!(ergebnis, Err(ErfassungFehler::KetteVoll)), "{ergebnis:?}");
    assert_eq!(
        ErfassungFehler::KetteVoll.to_string(),
        "Das Einsatzbuch ist voll: Mehr als 10 000 Einsätze nimmt dieser Rechner nicht auf. Bitte wende dich an die Verwaltung."
    );
    assert!(buch.ausstehend().unwrap().is_none(), "nichts wurde hinterlegt");
}
