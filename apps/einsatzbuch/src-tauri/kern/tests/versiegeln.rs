//! Versiegeln in einer Transaktion: Nummernvergabe je Kalenderjahr in der Suite-Zone,
//! Rückfall auf den Schnappschuss, und ein Fehlschlag darf nichts hinterlassen (Spec §4.3).
mod hilfe;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine as _;
use chrono::{TimeZone, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch};
use einsatzbuch_kern::erfassung::{Entwurf, ErfassungFehler, PersonAuswahl};
use einsatzbuch_kern::format::{Einsatz, GENESIS, Umgebung};
use einsatzbuch_kern::krypto;
use einsatzbuch_kern::jcs;
use hilfe::{FesterZufall, test_einrichtung};

fn b64url(s: &str) -> Vec<u8> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).unwrap()
}

fn suite_privatschluessel() -> p256::SecretKey {
    let eingaben = hilfe::vektor("eingaben.json");
    p256::SecretKey::from_slice(&b64url(eingaben["suite"]["privat"]["d"].as_str().unwrap())).unwrap()
}

/// Entschlüsselt `daten` eines Blocks mit dem privaten Vektor-Suiteschlüssel und liefert den
/// Klartext als `Einsatz` — der byte-genaue Rundlauf über `hilfe::packe_aus` und AES-GCM.
fn entschluessele(block: &einsatzbuch_kern::format::Block, suite_privat: &p256::SecretKey) -> Einsatz {
    let cek = hilfe::packe_aus(&block.umschlag, &block.kopf, suite_privat).unwrap();
    let cek_array: [u8; 32] = cek.try_into().unwrap();
    let iv: [u8; 12] = krypto::aus_b64(&block.iv).unwrap().try_into().unwrap();
    let daten = krypto::aus_b64(&block.daten).unwrap();
    let aad = block.kopf.kanonisch();
    let klartext = Aes256Gcm::new(&cek_array.into())
        .decrypt(&iv.into(), Payload { msg: &daten, aad: aad.as_bytes() })
        .expect("der ausgepackte CEK muss den Klartext öffnen");
    serde_json::from_slice(&klartext).expect("Klartext ist ein serialisierter Einsatz")
}

fn entwurf_eins() -> Entwurf {
    Entwurf {
        stichwort: "RD 2".into(),
        beginn_datum: "2026-08-22".into(),
        beginn_zeit: "03:12".into(),
        ende_datum: "2026-08-22".into(),
        ende_zeit: "04:40".into(),
        strasse: "Lindenstraße 8".into(),
        ort: "29525 Uelzen".into(),
        objekt: String::new(),
        fahrzeuge: vec!["11-83-1".into()],
        personal: vec![
            PersonAuswahl { id: "p4".into(), fahrzeug_id: Some("11-83-1".into()) },
            PersonAuswahl { id: "p8".into(), fahrzeug_id: Some("11-83-1".into()) },
        ],
        vor_ort: 0,
        transport: 1,
        notizen: String::new(),
    }
}

fn entwurf_zwei() -> Entwurf {
    Entwurf {
        stichwort: "SanD".into(),
        beginn_datum: "2026-08-29".into(),
        beginn_zeit: "13:00".into(),
        ende_datum: String::new(),
        ende_zeit: String::new(),
        strasse: String::new(),
        ort: "29549 Bad Bevensen".into(),
        objekt: "Stadtfest".into(),
        fahrzeuge: vec!["12-19-1".into()],
        personal: vec![PersonAuswahl { id: "p11".into(), fahrzeug_id: Some("12-19-1".into()) }],
        vor_ort: 11,
        transport: 2,
        notizen: String::new(),
    }
}

#[test]
fn versiegelt_in_einer_transaktion_und_haengt_an() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();

    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf_eins(), t0).unwrap();
    let mut zufall = FesterZufall(7);
    let erster = buch.versiegele_ausstehend(t0, &mut zufall, false).unwrap().unwrap();
    assert_eq!(erster.prev, GENESIS);
    assert_eq!(erster.block, 1);

    let t1 = Utc.with_ymd_and_hms(2026, 8, 29, 13, 0, 0).unwrap();
    buch.sende_ab(&entwurf_zwei(), t1).unwrap();
    let mut zufall2 = FesterZufall(9);
    let zweiter = buch.versiegele_ausstehend(t1, &mut zufall2, false).unwrap().unwrap();
    assert_eq!(zweiter.block, 2);
    assert_eq!(zweiter.prev, erster.hash);

    assert!(buch.ausstehend().unwrap().is_none());
    assert!(buch.entwurf().unwrap().is_none());

    let bloecke = buch.bloecke().unwrap();
    assert_eq!(bloecke.len(), 2);
    for block in &bloecke {
        let ohne_hash = serde_json::json!({
            "kopf": block.kopf, "iv": block.iv, "daten": block.daten, "umschlag": block.umschlag,
        });
        let neu = krypto::sha256_hex(jcs::kanonisch(&ohne_hash).unwrap().as_bytes());
        assert_eq!(block.hash, neu);
    }

    let einsatz = entschluessele(&bloecke[0], &suite_privatschluessel());
    assert_eq!(einsatz.fahrzeuge[0].ruf, "Rotkreuz Uelzen 11-83-1");
}

#[test]
fn nummern_ueber_den_jahreswechsel_in_der_suite_zone() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();

    let zeitpunkte = [
        Utc.with_ymd_and_hms(2026, 12, 31, 22, 0, 0).unwrap(),
        Utc.with_ymd_and_hms(2026, 12, 31, 23, 30, 0).unwrap(),
        Utc.with_ymd_and_hms(2027, 1, 1, 8, 0, 0).unwrap(),
    ];
    let erwartete_nummern = ["2026-001", "2027-001", "2027-002"];
    let mut versiegelungen = Vec::new();
    for (i, jetzt) in zeitpunkte.iter().enumerate() {
        buch.sende_ab(&entwurf_eins(), *jetzt).unwrap();
        let mut zufall = FesterZufall(i as u8 + 1);
        versiegelungen.push(buch.versiegele_ausstehend(*jetzt, &mut zufall, false).unwrap().unwrap());
    }
    for (v, erwartet) in versiegelungen.iter().zip(erwartete_nummern) {
        assert_eq!(v.nummer, erwartet);
    }
    assert!(versiegelungen[1].versiegelt.starts_with("2027-01-01T00:30:00"), "{}", versiegelungen[1].versiegelt);
    assert!(versiegelungen[1].versiegelt.ends_with("+01:00"), "{}", versiegelungen[1].versiegelt);
}

#[test]
fn testbetrieb_versiegelt_test_mit_praefix() {
    let ordner_test = tempfile::tempdir().unwrap();
    let mut test = Buch::oeffne(ordner_test.path(), Betrieb::Test).unwrap();
    test.richte_ein(&test_einrichtung(Umgebung::Test)).unwrap();
    let jetzt = Utc.with_ymd_and_hms(2026, 1, 10, 12, 0, 0).unwrap();
    test.sende_ab(&entwurf_eins(), jetzt).unwrap();
    let mut zufall = FesterZufall(3);
    let versiegelung = test.versiegele_ausstehend(jetzt, &mut zufall, false).unwrap().unwrap();
    assert_eq!(versiegelung.nummer, "T-2026-001");
    assert_eq!(test.bloecke().unwrap()[0].kopf.umgebung, Umgebung::Test);

    let ordner_echt = tempfile::tempdir().unwrap();
    let mut echt = Buch::oeffne(ordner_echt.path(), Betrieb::Echt).unwrap();
    echt.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();
    echt.sende_ab(&entwurf_eins(), jetzt).unwrap();
    let mut zufall2 = FesterZufall(4);
    let versiegelung2 = echt.versiegele_ausstehend(jetzt, &mut zufall2, false).unwrap().unwrap();
    assert_eq!(versiegelung2.nummer, "2026-001");
    assert_eq!(echt.bloecke().unwrap()[0].kopf.umgebung, Umgebung::Echt);
}

#[test]
fn fehlende_stammdaten_id_faellt_auf_den_schnappschuss_zurueck() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();

    let jetzt = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf_eins(), jetzt).unwrap(); // enthält p4

    let mut paket = test_einrichtung(Umgebung::Echt).paket;
    paket.stammdaten.personal.retain(|p| p.id != "p4");
    paket.version = 2;
    buch.uebernehme_stammdaten(&paket).unwrap();

    let mut zufall = FesterZufall(5);
    buch.versiegele_ausstehend(jetzt, &mut zufall, false).unwrap();

    let bloecke = buch.bloecke().unwrap();
    let einsatz = entschluessele(&bloecke[0], &suite_privatschluessel());
    assert_eq!(einsatz.personal[0].name, "Dierks, Malte");
}

/// `true`, wenn `nadel` irgendwo in `heuhaufen` als zusammenhängende Bytefolge vorkommt — die
/// rohe Suche, mit der die folgenden Tests eine Rohdatei auf Klartext abklopfen.
fn enthaelt(heuhaufen: &[u8], nadel: &[u8]) -> bool {
    !nadel.is_empty() && heuhaufen.windows(nadel.len()).any(|fenster| fenster == nadel)
}

/// Regressionstest zum WAL-Leck: `VACUUM` allein schreibt bei offener Verbindung im WAL-Modus
/// nur in die `-wal`-Datei, die alten Frames mit dem Klartext aus `ausstehend`/`entwurf` blieben
/// sonst bis zum nächsten, unkontrollierten Checkpoint liegen — auch über einen Absturz hinweg.
/// Geprüft bei **offenem** `Buch`, absichtlich vor jedem `drop`, denn genau das ist der Fall, den
/// ein bloßes „am Ende schließt SQLite ja doch auf" nicht abdeckt.
#[test]
fn versiegeln_entfernt_klartext_auch_aus_der_wal() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();

    let marker = "KLARTEXT-MARKER-7f3a";
    let mut mit_marker = entwurf_eins();
    mit_marker.notizen = marker.into();
    let jetzt = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&mit_marker, jetzt).unwrap();

    let mut zufall = FesterZufall(8);
    buch.versiegele_ausstehend(jetzt, &mut zufall, false).unwrap().unwrap();

    let db_bytes = std::fs::read(ordner.path().join("einsatzbuch.db")).unwrap();
    assert!(!enthaelt(&db_bytes, marker.as_bytes()), "Marker steckt noch in der Hauptdatei");

    let wal_pfad = ordner.path().join("einsatzbuch.db-wal");
    match std::fs::read(&wal_pfad) {
        Ok(wal_bytes) => assert!(!enthaelt(&wal_bytes, marker.as_bytes()), "Marker steckt noch in der WAL"),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {} // keine WAL-Datei ist ebenfalls in Ordnung
        Err(e) => panic!("WAL-Datei nicht lesbar: {e}"),
    }
}

/// Ein umbenanntes Fahrzeug und eine umbenannte Person übernehmen beim Versiegeln den NEUEN
/// Stammdaten-Wert, nicht den Schnappschuss vom Absenden — der Rückfall greift nur, wenn eine ID
/// ganz verschwunden ist (siehe `fehlende_stammdaten_id_faellt_auf_den_schnappschuss_zurueck`),
/// nicht schon bei einer bloßen Namensänderung.
#[test]
fn neuaufloesung_beim_versiegeln_uebernimmt_umbenannte_stammdaten() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();

    let jetzt = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf_eins(), jetzt).unwrap(); // enthält Fahrzeug 11-83-1 und Person p4

    let mut paket = test_einrichtung(Umgebung::Echt).paket;
    paket.stammdaten.fahrzeuge.iter_mut().find(|f| f.id == "11-83-1").unwrap().ruf = "Neuer Rufname".into();
    paket.stammdaten.personal.iter_mut().find(|p| p.id == "p4").unwrap().name = "Dierks, Malte-Neu".into();
    paket.version = 2;
    buch.uebernehme_stammdaten(&paket).unwrap();

    let mut zufall = FesterZufall(5);
    buch.versiegele_ausstehend(jetzt, &mut zufall, false).unwrap();

    let bloecke = buch.bloecke().unwrap();
    let einsatz = entschluessele(&bloecke[0], &suite_privatschluessel());
    assert_eq!(einsatz.fahrzeuge[0].ruf, "Neuer Rufname");
    assert_eq!(einsatz.personal[0].name, "Dierks, Malte-Neu");
}

/// Derselbe Rückfall wie bei einer verschwundenen Person, hier für ein verschwundenes Fahrzeug:
/// Der Klartext trägt den beim Absenden gespeicherten Schnappschuss.
#[test]
fn fehlendes_fahrzeug_faellt_auf_den_schnappschuss_zurueck() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();

    let jetzt = Utc.with_ymd_and_hms(2026, 8, 29, 13, 0, 0).unwrap();
    buch.sende_ab(&entwurf_zwei(), jetzt).unwrap(); // enthält Fahrzeug 12-19-1

    let mut paket = test_einrichtung(Umgebung::Echt).paket;
    paket.stammdaten.fahrzeuge.retain(|f| f.id != "12-19-1");
    paket.version = 2;
    buch.uebernehme_stammdaten(&paket).unwrap();

    let mut zufall = FesterZufall(6);
    buch.versiegele_ausstehend(jetzt, &mut zufall, false).unwrap();

    let bloecke = buch.bloecke().unwrap();
    let einsatz = entschluessele(&bloecke[0], &suite_privatschluessel());
    assert_eq!(einsatz.fahrzeuge[0].ruf, "Rotkreuz Bad Bevensen 12-19-1");
}

/// Ist `besatzung` aus, trägt der Klartext für jede Person `fahrzeugId: null` — unabhängig
/// davon, welches Fahrzeug im Entwurf gewählt war (`pruefe_entwurf` normalisiert das schon beim
/// Absenden weg, siehe `erfassung.rs`).
#[test]
fn besatzung_aus_ergibt_fahrzeug_id_none_im_klartext() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let mut einrichtung = test_einrichtung(Umgebung::Echt);
    einrichtung.paket.besatzung = false;
    buch.richte_ein(&einrichtung).unwrap();

    let jetzt = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf_eins(), jetzt).unwrap();
    let mut zufall = FesterZufall(7);
    buch.versiegele_ausstehend(jetzt, &mut zufall, false).unwrap();

    let bloecke = buch.bloecke().unwrap();
    let einsatz = entschluessele(&bloecke[0], &suite_privatschluessel());
    assert!(einsatz.personal.iter().all(|p| p.fahrzeug_id.is_none()), "{:?}", einsatz.personal);
}

#[test]
fn ein_fehlschlag_in_der_transaktion_hinterlaesst_nichts() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();
    let jetzt = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf_eins(), jetzt).unwrap();

    // Ein anderer, aber gültiger Schlüssel: die `schluesselId` in der Einrichtung bleibt
    // unverändert, sodass `krypto::versiegele` mit einem Passungsfehler scheitert.
    let anderer_geheim = p256::SecretKey::from_slice(&[7u8; 32]).unwrap();
    let anderes_dokument =
        p256::pkcs8::EncodePublicKey::to_public_key_der(&anderer_geheim.public_key()).unwrap();
    let anderes_spki = krypto::b64(anderes_dokument.as_bytes());
    buch.verbindung().execute("UPDATE einrichtung SET oeffentlich_spki = ?1 WHERE id = 1", [&anderes_spki]).unwrap();

    let mut zufall = FesterZufall(6);
    let ergebnis = buch.versiegele_ausstehend(jetzt, &mut zufall, false);
    assert!(matches!(ergebnis, Err(ErfassungFehler::Krypto(_))), "{ergebnis:?}");

    let nummern: i64 = buch.verbindung().query_row("SELECT COUNT(*) FROM nummern", [], |r| r.get(0)).unwrap();
    assert_eq!(nummern, 0, "die Nummernvergabe darf nicht hängen geblieben sein");
    assert!(buch.ausstehend().unwrap().is_some(), "der ausstehende Einsatz muss erhalten bleiben");
    assert!(buch.bloecke().unwrap().is_empty());
}
