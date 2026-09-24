//! Frist-Logik: Prüfung erst bei Ablauf, auch nach einem Neustart, und mit dem zuletzt
//! abgesendeten statt dem ungespeicherten Formularstand (Spec §4.3).
mod hilfe;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine as _;
use chrono::{TimeZone, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch};
use einsatzbuch_kern::erfassung::{Entwurf, PersonAuswahl};
use einsatzbuch_kern::format::{Einsatz, Umgebung};
use einsatzbuch_kern::krypto;
use hilfe::{FesterZufall, test_einrichtung};

fn entwurf() -> Entwurf {
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
        transport: 0,
        notizen: "A".into(),
    }
}

fn entschluessele_notizen(block: &einsatzbuch_kern::format::Block, suite_privat: &p256::SecretKey) -> String {
    let cek = hilfe::packe_aus(&block.umschlag, &block.kopf, suite_privat).unwrap();
    let cek_array: [u8; 32] = cek.try_into().unwrap();
    let iv: [u8; 12] = krypto::aus_b64(&block.iv).unwrap().try_into().unwrap();
    let daten = krypto::aus_b64(&block.daten).unwrap();
    let aad = block.kopf.kanonisch();
    let klartext = Aes256Gcm::new(&cek_array.into())
        .decrypt(&iv.into(), Payload { msg: &daten, aad: aad.as_bytes() })
        .expect("der ausgepackte CEK muss den Klartext öffnen");
    let einsatz: Einsatz = serde_json::from_slice(&klartext).expect("Klartext ist ein serialisierter Einsatz");
    einsatz.notizen
}

fn suite_privatschluessel() -> p256::SecretKey {
    let eingaben = hilfe::vektor("eingaben.json");
    let d = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(eingaben["suite"]["privat"]["d"].as_str().unwrap())
        .unwrap();
    p256::SecretKey::from_slice(&d).unwrap()
}

#[test]
fn frist_versiegelt_erst_bei_ablauf() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf(), t0).unwrap();

    let mut zufall = FesterZufall(1);
    let vor_ablauf = t0 + chrono::Duration::minutes(14) + chrono::Duration::seconds(59);
    assert!(buch.pruefe_frist(vor_ablauf, &mut zufall).unwrap().is_none());
    let bei_ablauf = t0 + chrono::Duration::minutes(15);
    assert!(buch.pruefe_frist(bei_ablauf, &mut zufall).unwrap().is_some());
}

#[test]
fn frist_nach_neustart() {
    let ordner = tempfile::tempdir().unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    {
        let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
        buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();
        buch.sende_ab(&entwurf(), t0).unwrap();
    }
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let mut zufall = FesterZufall(2);
    let ergebnis = buch.pruefe_frist(t0 + chrono::Duration::minutes(16), &mut zufall).unwrap();
    assert!(ergebnis.is_some());
    assert_eq!(buch.bloecke().unwrap().len(), 1);
    assert!(buch.ausstehend().unwrap().is_none());
}

#[test]
fn versiegeln_mit_ungespeichertem_formular_nimmt_den_abgesendeten_stand() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();

    let mut mit_a = entwurf();
    mit_a.notizen = "A".into();
    buch.sende_ab(&mit_a, t0).unwrap();

    let mut mit_b = entwurf();
    mit_b.notizen = "B".into();
    buch.speichere_entwurf(&mit_b, t0).unwrap();

    let mut zufall = FesterZufall(3);
    let versiegelung = buch.pruefe_frist(t0 + chrono::Duration::minutes(15), &mut zufall).unwrap().unwrap();
    assert!(versiegelung.verfallen);
    assert!(buch.entwurf().unwrap().is_none());

    let bloecke = buch.bloecke().unwrap();
    let notizen = entschluessele_notizen(&bloecke[0], &suite_privatschluessel());
    assert_eq!(notizen, "A");
}

#[test]
fn jetzt_versiegeln_ist_nicht_verfallen() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt)).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf(), t0).unwrap();
    buch.speichere_entwurf(&entwurf(), t0).unwrap();

    let mut zufall = FesterZufall(4);
    let versiegelung = buch.versiegele_ausstehend(t0, &mut zufall, false).unwrap().unwrap();
    assert!(!versiegelung.verfallen);
}
