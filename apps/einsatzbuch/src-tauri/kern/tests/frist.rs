//! Frist-Logik: Prüfung erst bei Ablauf, auch nach einem Neustart, und mit dem zuletzt
//! abgesendeten statt dem ungespeicherten Formularstand (Spec §4.3).
mod hilfe;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine as _;
use chrono::{TimeZone, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch};
use einsatzbuch_kern::erfassung::{Entwurf, ErfassungFehler, PersonAuswahl};
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
    let aad = block.kopf.kanonisch().unwrap();
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
    buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf(), t0, false).unwrap();

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
        buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
        buch.sende_ab(&entwurf(), t0, false).unwrap();
    }
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let mut zufall = FesterZufall(2);
    let ergebnis = buch.pruefe_frist(t0 + chrono::Duration::minutes(16), &mut zufall).unwrap();
    assert!(ergebnis.is_some());
    assert_eq!(buch.bloecke().unwrap().len(), 1);
    assert!(buch.ausstehend().unwrap().is_none());
}

/// Härtung aus Phase C: Der Hinweis „Deine letzten Änderungen wurden nicht übernommen …“ übersteht
/// einen Neustart. Nach Versiegeln per Frist mit ungespeichertem Entwurf, Schließen und Neuöffnen
/// liefert `unquittiert()` dieselbe Versiegelung mit `verfallen = true`, bis sie quittiert ist.
#[test]
fn versiegelungshinweis_uebersteht_den_neustart_bis_zum_quittieren() {
    let ordner = tempfile::tempdir().unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    let versiegelung = {
        let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
        buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
        buch.sende_ab(&entwurf(), t0, false).unwrap();
        buch.speichere_entwurf(&entwurf(), t0, true).unwrap();
        let v = buch.pruefe_frist(t0 + chrono::Duration::minutes(15), &mut FesterZufall(8)).unwrap().unwrap();
        assert!(v.verfallen);
        v
    };

    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let nach_neustart = buch.unquittiert().unwrap().expect("der Hinweis muss den Neustart überstehen");
    assert_eq!(nach_neustart, versiegelung);
    assert!(nach_neustart.verfallen);

    buch.quittiere().unwrap();
    assert_eq!(buch.unquittiert().unwrap(), None);
    drop(buch);
    assert_eq!(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap().unquittiert().unwrap(), None, "quittiert bleibt quittiert");
}

#[test]
fn versiegeln_mit_ungespeichertem_formular_nimmt_den_abgesendeten_stand() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();

    let mut mit_a = entwurf();
    mit_a.notizen = "A".into();
    buch.sende_ab(&mit_a, t0, false).unwrap();

    let mut mit_b = entwurf();
    mit_b.notizen = "B".into();
    buch.speichere_entwurf(&mit_b, t0, true).unwrap();

    let mut zufall = FesterZufall(3);
    let versiegelung = buch.pruefe_frist(t0 + chrono::Duration::minutes(15), &mut zufall).unwrap().unwrap();
    assert!(versiegelung.verfallen);
    assert!(buch.entwurf().unwrap().is_none());

    let bloecke = buch.bloecke().unwrap();
    let notizen = entschluessele_notizen(&bloecke[0], &suite_privatschluessel());
    assert_eq!(notizen, "A");
}

/// Läuft die Frist ab, ohne dass je ein ungespeicherter Formularstand existierte (kein
/// `speichere_entwurf`-Aufruf), ist `verfallen` auch bei der automatischen, fristausgelösten
/// Versiegelung `false` — `verfallen_wenn_entwurf` allein reicht nicht, es muss auch wirklich
/// einen `entwurf` gegeben haben.
#[test]
fn pruefe_frist_ohne_entwurf_ergibt_verfallen_false() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf(), t0, false).unwrap();

    let mut zufall = FesterZufall(9);
    let versiegelung = buch.pruefe_frist(t0 + chrono::Duration::minutes(15), &mut zufall).unwrap().unwrap();
    assert!(!versiegelung.verfallen);
}

#[test]
fn jetzt_versiegeln_ist_nicht_verfallen() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&entwurf(), t0, false).unwrap();
    buch.speichere_entwurf(&entwurf(), t0, true).unwrap();

    let mut zufall = FesterZufall(4);
    let versiegelung = buch.versiegele_ausstehend(t0, &mut zufall, false).unwrap().unwrap();
    assert!(!versiegelung.verfallen);
}

fn eingerichtet(ordner: &std::path::Path) -> Buch {
    let mut buch = Buch::oeffne(ordner, Betrieb::Echt).unwrap();
    buch.richte_ein(&test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    buch
}

fn mit_notiz(notiz: &str) -> Entwurf {
    let mut e = entwurf();
    e.notizen = notiz.into();
    e
}

/// Hat die Frist-Uhr schon versiegelt, darf „Änderungen übernehmen“ keinen neuen Einsatz mit
/// neuer Frist anlegen: Versiegelt bleibt der zuletzt abgesendete Stand.
#[test]
fn bearbeitung_nach_versiegeln_durch_die_frist_legt_keinen_neuen_einsatz_an() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = eingerichtet(ordner.path());
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&mit_notiz("A"), t0, false).unwrap();
    let ablauf = t0 + chrono::Duration::minutes(15);
    assert!(buch.pruefe_frist(ablauf, &mut FesterZufall(5)).unwrap().is_some());

    let ergebnis = buch.sende_ab(&mit_notiz("B"), ablauf + chrono::Duration::seconds(1), true);
    assert!(matches!(ergebnis, Err(ErfassungFehler::FristAbgelaufen)), "{ergebnis:?}");
    assert!(buch.ausstehend().unwrap().is_none(), "kein neuer ausstehender Einsatz");
    assert!(buch.entwurf().unwrap().is_none());
    assert_eq!(buch.bloecke().unwrap().len(), 1);
}

/// Nach Fristende, aber bevor die Frist-Uhr versiegelt hat: Die Bearbeitung wird ebenfalls
/// abgelehnt, und der abgesendete Stand bleibt unberührt, bis versiegelt wird.
#[test]
fn bearbeitung_nach_fristende_vor_dem_versiegeln_wird_abgelehnt() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = eingerichtet(ordner.path());
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    let erste = buch.sende_ab(&mit_notiz("A"), t0, false).unwrap();
    let ablauf = t0 + chrono::Duration::minutes(15);

    let ergebnis = buch.sende_ab(&mit_notiz("B"), ablauf, true);
    assert!(matches!(ergebnis, Err(ErfassungFehler::FristAbgelaufen)), "{ergebnis:?}");
    let gespeichert = buch.speichere_entwurf(&mit_notiz("B"), ablauf, true);
    assert!(matches!(gespeichert, Err(ErfassungFehler::FristAbgelaufen)), "{gespeichert:?}");

    let ausstehend = buch.ausstehend().unwrap().unwrap();
    assert_eq!(ausstehend.entwurf.notizen, "A");
    assert_eq!(ausstehend.frist_bis_ms, erste.frist_bis_ms);
    assert!(buch.entwurf().unwrap().is_none());

    let versiegelung = buch.pruefe_frist(ablauf, &mut FesterZufall(6)).unwrap().unwrap();
    assert!(!versiegelung.verfallen);
    assert_eq!(entschluessele_notizen(&buch.bloecke().unwrap()[0], &suite_privatschluessel()), "A");

    // Eine Sekunde vor Ablauf ging die Bearbeitung noch durch — die Grenze ist `frist_bis_ms`.
    let ordner2 = tempfile::tempdir().unwrap();
    let mut buch2 = eingerichtet(ordner2.path());
    buch2.sende_ab(&mit_notiz("A"), t0, false).unwrap();
    buch2.sende_ab(&mit_notiz("B"), ablauf - chrono::Duration::seconds(1), true).unwrap();
    assert_eq!(buch2.ausstehend().unwrap().unwrap().entwurf.notizen, "B");
}

/// Ein verspätetes Speichern der Bearbeitung, wenn nichts mehr aussteht, schreibt nichts: Sonst
/// käme der versiegelte Klartext als nächster Entwurf zurück.
#[test]
fn bearbeitung_speichern_ohne_ausstehend_wird_abgelehnt() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = eingerichtet(ordner.path());
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();

    let ergebnis = buch.speichere_entwurf(&mit_notiz("B"), t0, true);
    assert!(matches!(ergebnis, Err(ErfassungFehler::FristAbgelaufen)), "{ergebnis:?}");
    assert_eq!(buch.entwurf().unwrap(), None);

    buch.sende_ab(&mit_notiz("A"), t0, false).unwrap();
    buch.versiegele_ausstehend(t0, &mut FesterZufall(7), false).unwrap().unwrap();
    let danach = buch.speichere_entwurf(&mit_notiz("B"), t0, true);
    assert!(matches!(danach, Err(ErfassungFehler::FristAbgelaufen)), "{danach:?}");
    assert_eq!(buch.entwurf().unwrap(), None);
}

/// Ein neuer Einsatz (keine Bearbeitung), solange einer aussteht, wird abgelehnt — Absenden wie
/// Speichern — und lässt den ausstehenden unberührt.
#[test]
fn neuer_einsatz_bei_ausstehendem_wird_abgelehnt() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = eingerichtet(ordner.path());
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    buch.sende_ab(&mit_notiz("A"), t0, false).unwrap();

    let ergebnis = buch.sende_ab(&mit_notiz("B"), t0 + chrono::Duration::minutes(1), false);
    assert!(matches!(ergebnis, Err(ErfassungFehler::SchonAbgesendet)), "{ergebnis:?}");
    let gespeichert = buch.speichere_entwurf(&mit_notiz("B"), t0, false);
    assert!(matches!(gespeichert, Err(ErfassungFehler::SchonAbgesendet)), "{gespeichert:?}");
    assert_eq!(buch.ausstehend().unwrap().unwrap().entwurf.notizen, "A");
    assert_eq!(buch.entwurf().unwrap(), None);
}
