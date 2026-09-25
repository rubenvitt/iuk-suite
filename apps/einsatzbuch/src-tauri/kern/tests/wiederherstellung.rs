//! Wiederherstellung einer Sicherung (Spec §4.5, Entscheidung 6, Review Focus 3): Die Sicherung
//! muss den höchsten Anker der Suite mit gleichem Hash enthalten, jeder Block wird mit seinem CEK
//! geöffnet wie `oeffneBlock` in `block.ts`, die Nummern je Jahr werden zum Maximum
//! zusammengefasst, und `Buch::uebernehme_sicherung` übernimmt alles nur in eine leere Kette.
mod hilfe;

use std::collections::BTreeMap;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit};
use base64::Engine as _;
use chrono::{DateTime, TimeDelta, TimeZone, Utc};
use einsatzbuch_kern::buch::{Betrieb, Buch, BuchFehler};
use einsatzbuch_kern::format::{Block, Blockkopf, Einsatz, GENESIS, Umgebung, Umschlag};
use einsatzbuch_kern::kette::{self, Kettengrund};
use einsatzbuch_kern::krypto::{self, KryptoFehler};
use einsatzbuch_kern::sicherung::Sicherungsdatei;
use einsatzbuch_kern::wiederherstellung::{self, Wiederherstellungsfehler};
use hilfe::test_einrichtung;
use tempfile::TempDir;
use zeroize::{Zeroize, Zeroizing};

fn b64url(s: &str) -> Vec<u8> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).unwrap()
}

fn suite_privatschluessel() -> p256::SecretKey {
    let eingaben = hilfe::vektor("eingaben.json");
    p256::SecretKey::from_slice(&b64url(eingaben["suite"]["privat"]["d"].as_str().unwrap())).unwrap()
}

fn gepinnt() -> String {
    test_einrichtung(Umgebung::Echt).schluessel_id
}

fn beginn() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 8, 22, 1, 12, 0).unwrap()
}

/// Ein eingerichtetes Buch der gegebenen Betriebsart in einem frischen Ordner.
fn eingerichtetes_buch(betrieb: Betrieb) -> (TempDir, Buch) {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), betrieb).unwrap();
    buch.richte_ein(&test_einrichtung(betrieb.umgebung()), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    (ordner, buch)
}

/// Eine per `versiegele_ausstehend` versiegelte Kette mit `n` Blöcken, alle im Jahr 2026.
fn kette_aus(betrieb: Betrieb, n: u8) -> Vec<Block> {
    let (_ordner, mut buch) = eingerichtetes_buch(betrieb);
    for i in 0..n {
        hilfe::versiegele_einen_einsatz(&mut buch, beginn() + TimeDelta::hours(i64::from(i)), i + 1);
    }
    buch.bloecke().unwrap()
}

fn datei(bloecke: Vec<Block>) -> Sicherungsdatei {
    Sicherungsdatei::neu("2026-09-25T10:00:00+02:00".into(), bloecke)
}

/// Öffnet einen Block so, wie es die Wiederherstellung tut: CEK über den Umschlag (hier mit dem
/// privaten Vektor-Suiteschlüssel statt über die Freigabe der Suite), dann `oeffne_block`.
fn oeffne(block: &Block) -> Einsatz {
    let mut roh = hilfe::packe_aus(&block.umschlag, &block.kopf, &suite_privatschluessel()).unwrap();
    let mut cek = Zeroizing::new([0u8; 32]);
    cek.copy_from_slice(&roh);
    roh.zeroize();
    krypto::oeffne_block(block, &cek).unwrap()
}

fn nummern_im_buch(buch: &Buch) -> Vec<(i64, i64)> {
    let mut anweisung = buch.verbindung().prepare("SELECT jahr, letzte FROM nummern ORDER BY jahr").unwrap();
    anweisung.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().map(Result::unwrap).collect()
}

// ---------------------------------------------------------------------------------------------
// `pruefe`: Kette, Schlüssel, Umgebung, Anker
// ---------------------------------------------------------------------------------------------

#[test]
fn passender_anker_am_letzten_block_gilt() {
    let bloecke = kette_aus(Betrieb::Echt, 3);
    let hash = bloecke[2].hash.clone();
    assert_eq!(wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((3, &hash))), Ok(()));
}

/// Die Sicherung darf über den Anker hinausgehen: Blöcke danach hängen per Kette an ihm.
#[test]
fn anker_am_vorletzten_block_gilt_wenn_die_sicherung_laenger_ist() {
    let bloecke = kette_aus(Betrieb::Echt, 3);
    let hash = bloecke[1].hash.clone();
    assert_eq!(wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((2, &hash))), Ok(()));
}

#[test]
fn anker_ueber_dem_letzten_block_heisst_veraltet() {
    let bloecke = kette_aus(Betrieb::Echt, 3);
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((4, &"a".repeat(64)))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::Veraltet { ende: 3, anker: 4 });
    assert_eq!(
        fehler.to_string(),
        "Die Sicherung endet bei Block 3, die Suite kennt die Kette bis Block 4. Diese Sicherung ist veraltet."
    );
}

#[test]
fn anderer_hash_am_ankerblock_wird_abgelehnt() {
    let bloecke = kette_aus(Betrieb::Echt, 3);
    let sicherung = bloecke[1].hash.clone();
    let suite = "b".repeat(64);
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((2, &suite))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::AnkerPasstNicht { block: 2, sicherung: sicherung.clone(), suite: suite.clone() });
    assert_eq!(
        fehler.to_string(),
        format!("Block 2 der Sicherung passt nicht zum Anker der Suite (Sicherung {sicherung}, Suite {suite}).")
    );
}

#[test]
fn ohne_anker_der_suite_wird_abgelehnt() {
    let bloecke = kette_aus(Betrieb::Echt, 2);
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), None).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::KeinAnker);
    assert_eq!(
        fehler.to_string(),
        "Die Suite kennt noch keinen Anker dieser Kette. Ohne Anker lässt sich die Sicherung nicht prüfen."
    );
}

/// Block 0 gibt es nicht; die Prüfung darf daran weder vorbeirechnen noch überlaufen.
#[test]
fn anker_bei_block_null_wird_abgelehnt() {
    let bloecke = kette_aus(Betrieb::Echt, 2);
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((0, GENESIS))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::UngueltigerAnker);
}

#[test]
fn bloecke_aus_dem_testbetrieb_werden_abgelehnt() {
    let bloecke = kette_aus(Betrieb::Test, 2);
    let hash = bloecke[1].hash.clone();
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((2, &hash))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::Testbetrieb { block: 1 });
}

#[test]
fn fremde_schluessel_id_wird_abgelehnt() {
    let bloecke = kette_aus(Betrieb::Echt, 2);
    let hash = bloecke[1].hash.clone();
    let fremd = "ffffffffffffffff";
    let fehler = wiederherstellung::pruefe(&datei(bloecke), fremd, Some((2, &hash))).unwrap_err();
    assert_eq!(
        fehler,
        Wiederherstellungsfehler::AndererSchluessel { block: 1, gefunden: gepinnt(), gepinnt: fremd.into() }
    );
    assert_eq!(
        fehler.to_string(),
        format!("Die Sicherung gehört zu einem anderen Schlüssel ({} in Block 1, gepinnt ist {fremd}).", gepinnt())
    );
}

#[test]
fn gebrochene_kette_nennt_block_und_grund() {
    let mut bloecke = kette_aus(Betrieb::Echt, 3);
    let hash = bloecke[2].hash.clone();
    bloecke.remove(1);
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((3, &hash))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::KetteGebrochen { block: 3, grund: Kettengrund::Vorgaenger });
    assert_eq!(fehler.to_string(), "Die Kette in der Sicherung ist gebrochen bei Block 3: Vorgänger fehlt oder wurde verändert");
}

#[test]
fn veraenderter_inhalt_bricht_die_kette_am_fingerabdruck() {
    let mut bloecke = kette_aus(Betrieb::Echt, 2);
    let hash = bloecke[1].hash.clone();
    bloecke[1].kopf.versiegelt = "2099-01-01T00:00:00+01:00".into();
    let fehler = wiederherstellung::pruefe(&datei(bloecke), &gepinnt(), Some((2, &hash))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::KetteGebrochen { block: 2, grund: Kettengrund::Hash });
}

#[test]
fn leere_sicherung_wird_abgelehnt() {
    let fehler = wiederherstellung::pruefe(&datei(Vec::new()), &gepinnt(), Some((1, GENESIS))).unwrap_err();
    assert_eq!(fehler, Wiederherstellungsfehler::Leer);
}

// ---------------------------------------------------------------------------------------------
// `krypto::oeffne_block`
// ---------------------------------------------------------------------------------------------

fn vektor_bloecke_und_ceks() -> (Vec<Block>, Vec<Zeroizing<[u8; 32]>>, Vec<Einsatz>) {
    let eingaben = hilfe::vektor("eingaben.json");
    let erwartet = hilfe::vektor("erwartet.json");
    let bloecke: Vec<Block> = serde_json::from_value(erwartet["bloecke"].clone()).unwrap();
    let einsaetze: Vec<Einsatz> = serde_json::from_value(eingaben["einsaetze"].clone()).unwrap();
    let ceks = eingaben["bloecke"]
        .as_array()
        .unwrap()
        .iter()
        .map(|z| {
            let mut cek = Zeroizing::new([0u8; 32]);
            cek.copy_from_slice(&krypto::aus_b64(z["cek"].as_str().unwrap()).unwrap());
            cek
        })
        .collect::<Vec<_>>();
    assert!(!bloecke.is_empty());
    assert_eq!(bloecke.len(), ceks.len());
    assert_eq!(bloecke.len(), einsaetze.len());
    (bloecke, ceks, einsaetze)
}

#[test]
fn oeffne_block_oeffnet_die_vektorbloecke_mit_den_vektor_ceks() {
    let (bloecke, ceks, einsaetze) = vektor_bloecke_und_ceks();
    for ((block, cek), einsatz) in bloecke.iter().zip(&ceks).zip(&einsaetze) {
        assert_eq!(&krypto::oeffne_block(block, cek).unwrap(), einsatz, "Block {}", block.kopf.block);
    }
}

/// Der Kopf steht in der AAD: Ein Block mit dem Kopf eines anderen lässt sich nicht öffnen.
#[test]
fn oeffne_block_lehnt_einen_vertauschten_kopf_ab() {
    let (bloecke, ceks, _) = vektor_bloecke_und_ceks();
    let mut vertauscht = bloecke[0].clone();
    vertauscht.kopf = bloecke[1].kopf.clone();
    assert!(matches!(krypto::oeffne_block(&vertauscht, &ceks[0]), Err(KryptoFehler::Entschluesselung)));
}

#[test]
fn oeffne_block_lehnt_einen_falschen_cek_ab() {
    let (bloecke, ceks, _) = vektor_bloecke_und_ceks();
    assert!(matches!(krypto::oeffne_block(&bloecke[0], &ceks[1]), Err(KryptoFehler::Entschluesselung)));
}

/// Verschlüsselt einen beliebigen Klartext zu einem Block, damit sich die Formprüfung nach dem
/// Entschlüsseln testen lässt (ein erfolgreicher GCM-Rundlauf allein beweist keinen Einsatz).
fn block_mit_klartext(klartext: &str) -> (Block, [u8; 32]) {
    let cek = [7u8; 32];
    let iv = [1u8; 12];
    let kopf = Blockkopf {
        v: 1,
        block: 1,
        prev: GENESIS.into(),
        versiegelt: "2026-08-22T03:12:00+02:00".into(),
        schluessel_id: gepinnt(),
        umgebung: Umgebung::Echt,
    };
    let aad = kopf.kanonisch().unwrap();
    let daten = Aes256Gcm::new(&cek.into())
        .encrypt(&iv.into(), Payload { msg: klartext.as_bytes(), aad: aad.as_bytes() })
        .unwrap();
    let umschlag = Umschlag { epk: String::new(), iv: String::new(), ct: String::new() };
    (Block { kopf, iv: krypto::b64(&iv), daten: krypto::b64(&daten), umschlag, hash: String::new() }, cek)
}

fn vektor_klartext() -> serde_json::Value {
    hilfe::vektor("eingaben.json")["einsaetze"][0].clone()
}

#[test]
fn oeffne_block_nimmt_den_kanonischen_klartext_an() {
    let wert = vektor_klartext();
    let (block, cek) = block_mit_klartext(&einsatzbuch_kern::jcs::kanonisch(&wert).unwrap());
    assert_eq!(krypto::oeffne_block(&block, &cek).unwrap(), serde_json::from_value::<Einsatz>(wert).unwrap());
}

#[test]
fn oeffne_block_lehnt_unkanonisches_json_ab() {
    let wert = vektor_klartext();
    let (block, cek) = block_mit_klartext(&serde_json::to_string_pretty(&wert).unwrap());
    assert!(matches!(krypto::oeffne_block(&block, &cek), Err(KryptoFehler::KeinKanonischesJson)));
    let (block, cek) = block_mit_klartext("kein json");
    assert!(matches!(krypto::oeffne_block(&block, &cek), Err(KryptoFehler::KeinKanonischesJson)));
}

/// Ein fehlendes `endeDatum` füllte serde still mit `None` — der TS-Kern lehnt es ab.
#[test]
fn oeffne_block_lehnt_einen_klartext_ohne_optionales_feld_ab() {
    let mut wert = vektor_klartext();
    wert.as_object_mut().unwrap().remove("endeDatum");
    let (block, cek) = block_mit_klartext(&einsatzbuch_kern::jcs::kanonisch(&wert).unwrap());
    assert!(matches!(krypto::oeffne_block(&block, &cek), Err(KryptoFehler::KeinEinsatz)));
}

#[test]
fn oeffne_block_lehnt_ein_anderes_format_ab() {
    let mut wert = vektor_klartext();
    wert["v"] = 2.into();
    let (block, cek) = block_mit_klartext(&einsatzbuch_kern::jcs::kanonisch(&wert).unwrap());
    assert!(matches!(krypto::oeffne_block(&block, &cek), Err(KryptoFehler::KeinEinsatz)));
    let mut wert = vektor_klartext();
    wert["unbekannt"] = "x".into();
    let (block, cek) = block_mit_klartext(&einsatzbuch_kern::jcs::kanonisch(&wert).unwrap());
    assert!(matches!(krypto::oeffne_block(&block, &cek), Err(KryptoFehler::KeinEinsatz)));
}

// ---------------------------------------------------------------------------------------------
// `nummern`
// ---------------------------------------------------------------------------------------------

fn einsatz_mit(nummer: &str) -> Einsatz {
    let mut einsatz: Einsatz = serde_json::from_value(vektor_klartext()).unwrap();
    einsatz.nummer = nummer.into();
    einsatz
}

#[test]
fn nummern_ueber_zwei_jahre_zum_maximum() {
    let einsaetze: Vec<Einsatz> =
        ["2025-007", "2026-001", "2026-003", "2025-002", "2026-002"].into_iter().map(einsatz_mit).collect();
    assert_eq!(wiederherstellung::nummern(&einsaetze), Ok(BTreeMap::from([(2025, 7), (2026, 3)])));
}

/// `versiegele_ausstehend` schreibt ab 1000 vierstellig (`{letzte:03}`).
#[test]
fn nummern_nimmt_auch_vierstellige_laufnummern() {
    let einsaetze: Vec<Einsatz> = ["2026-999", "2026-1000"].into_iter().map(einsatz_mit).collect();
    assert_eq!(wiederherstellung::nummern(&einsaetze), Ok(BTreeMap::from([(2026, 1000)])));
}

#[test]
fn nummern_ohne_einsaetze_sind_leer() {
    assert_eq!(wiederherstellung::nummern(&[]), Ok(BTreeMap::new()));
}

#[test]
fn eine_unlesbare_nummer_ist_ein_fehler() {
    for nummer in ["T-2026-001", "2026-1", "2026-01", "2026-000", "0999-001", "+2026-001", "2026-001x", "2026", ""] {
        let einsaetze = vec![einsatz_mit("2026-001"), einsatz_mit(nummer)];
        let fehler = wiederherstellung::nummern(&einsaetze).unwrap_err();
        assert_eq!(fehler, Wiederherstellungsfehler::UnlesbareNummer { nummer: nummer.into() }, "{nummer:?}");
    }
    assert_eq!(
        Wiederherstellungsfehler::UnlesbareNummer { nummer: "2026-1".into() }.to_string(),
        "Die Einsatznummer „2026-1“ in der Sicherung ist nicht lesbar, erwartet ist JJJJ-NNN."
    );
}

// ---------------------------------------------------------------------------------------------
// `Buch::uebernehme_sicherung`
// ---------------------------------------------------------------------------------------------

#[test]
fn uebernehmen_verweigert_eine_kette_mit_bloecken_und_aendert_nichts() {
    let fremd = kette_aus(Betrieb::Echt, 2);
    let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Echt);
    hilfe::versiegele_einen_einsatz(&mut buch, beginn(), 9);
    let vorher = (buch.bloecke().unwrap(), nummern_im_buch(&buch));

    let fehler = buch.uebernehme_sicherung(&fremd, &BTreeMap::from([(2026, 2)])).unwrap_err();
    assert!(matches!(fehler, BuchFehler::KetteNichtLeer), "{fehler:?}");
    assert_eq!((buch.bloecke().unwrap(), nummern_im_buch(&buch)), vorher);
}

#[test]
fn uebernehmen_verweigert_bei_ausstehendem_einsatz() {
    let fremd = kette_aus(Betrieb::Echt, 2);
    let (_ordner, mut leer) = eingerichtetes_buch(Betrieb::Echt);
    // Ein abgesendeter, noch nicht versiegelter Einsatz: kein Block, keine Nummer.
    leer.sende_ab(&hilfe::gueltiger_entwurf(), beginn(), false).unwrap();

    let fehler = leer.uebernehme_sicherung(&fremd, &BTreeMap::from([(2026, 2)])).unwrap_err();
    assert!(matches!(fehler, BuchFehler::KetteNichtLeer), "{fehler:?}");
    assert!(leer.bloecke().unwrap().is_empty());
    assert!(nummern_im_buch(&leer).is_empty());
}

#[test]
fn uebernehmen_verweigert_bei_vergebenen_nummern() {
    let fremd = kette_aus(Betrieb::Echt, 2);
    let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Echt);
    buch.verbindung().execute("INSERT INTO nummern (jahr, letzte) VALUES (2025, 4)", []).unwrap();

    let fehler = buch.uebernehme_sicherung(&fremd, &BTreeMap::from([(2026, 2)])).unwrap_err();
    assert!(matches!(fehler, BuchFehler::KetteNichtLeer), "{fehler:?}");
    assert!(buch.bloecke().unwrap().is_empty());
    assert_eq!(nummern_im_buch(&buch), vec![(2025, 4)]);
}

#[test]
fn uebernehmen_verweigert_im_testbetrieb() {
    let fremd = kette_aus(Betrieb::Test, 1);
    let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Test);
    let fehler = buch.uebernehme_sicherung(&fremd, &BTreeMap::from([(2026, 1)])).unwrap_err();
    assert!(matches!(fehler, BuchFehler::NurImEchtbetrieb), "{fehler:?}");
    assert!(buch.bloecke().unwrap().is_empty());
}

#[test]
fn uebernehmen_verlangt_eine_einrichtung() {
    let fremd = kette_aus(Betrieb::Echt, 1);
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let fehler = buch.uebernehme_sicherung(&fremd, &BTreeMap::from([(2026, 1)])).unwrap_err();
    assert!(matches!(fehler, BuchFehler::NichtEingerichtet), "{fehler:?}");
    assert!(buch.bloecke().unwrap().is_empty());
}

/// Scheitert ein `INSERT` nach den ersten Blöcken (hier die Nummer am `CHECK (letzte >= 1)`),
/// bleibt nichts zurück: Blöcke und Nummern gehen nur zusammen in die Kette.
#[test]
fn ein_fehler_beim_uebernehmen_hinterlaesst_nichts() {
    let fremd = kette_aus(Betrieb::Echt, 2);
    let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Echt);
    let fehler = buch.uebernehme_sicherung(&fremd, &BTreeMap::from([(2026, 0)])).unwrap_err();
    assert!(matches!(fehler, BuchFehler::Datenbank(_)), "{fehler:?}");
    assert!(buch.bloecke().unwrap().is_empty());
    assert!(nummern_im_buch(&buch).is_empty());
}

/// Der ganze Weg im Kern: Sicherung prüfen, jeden Block öffnen, Nummern zusammenfassen,
/// übernehmen — danach setzt das nächste Versiegeln Nummer und Kette nahtlos fort.
#[test]
fn nach_der_uebernahme_setzt_das_versiegeln_nummer_und_kette_fort() {
    let quelle = kette_aus(Betrieb::Echt, 3);
    let anker = quelle[2].hash.clone();
    let sicherung = datei(quelle.clone());
    wiederherstellung::pruefe(&sicherung, &gepinnt(), Some((3, &anker))).unwrap();
    let einsaetze: Vec<Einsatz> = sicherung.bloecke.iter().map(oeffne).collect();
    let nummern = wiederherstellung::nummern(&einsaetze).unwrap();
    assert_eq!(nummern, BTreeMap::from([(2026, 3)]));

    let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Echt);
    buch.uebernehme_sicherung(&sicherung.bloecke, &nummern).unwrap();
    assert_eq!(buch.bloecke().unwrap(), quelle, "Blöcke byte-gleich übernommen");
    assert_eq!(nummern_im_buch(&buch), vec![(2026, 3)]);
    assert_eq!(buch.kettenkopf().unwrap(), Some((3, anker.clone())));
    // Die übernommenen Blöcke gelten der Suite gegenüber als noch nicht gemeldet.
    assert_eq!(buch.anbindung().unwrap().unwrap().anker_gemeldet_bis, 0);
    assert_eq!(buch.unbestaetigte_anker().unwrap().len(), 3);
    let versiegelt: Vec<String> = {
        let mut a = buch.verbindung().prepare("SELECT versiegelt FROM bloecke ORDER BY block").unwrap();
        a.query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
    };
    assert_eq!(versiegelt, quelle.iter().map(|b| b.kopf.versiegelt.clone()).collect::<Vec<_>>());

    hilfe::versiegele_einen_einsatz(&mut buch, beginn() + TimeDelta::days(1), 42);
    let alle = buch.bloecke().unwrap();
    assert_eq!(alle.len(), 4);
    let neu = &alle[3];
    assert_eq!(neu.kopf.block, 4);
    assert_eq!(neu.kopf.prev, anker);
    assert_eq!(oeffne(neu).nummer, "2026-004");
    assert_eq!(kette::pruefe(&alle), Ok(()));
    assert_eq!(buch.unbestaetigte_anker().unwrap().len(), 4);
}

/// `uebernehme_sicherung` verlässt sich nicht auf die Aufruferin: In der Transaktion prüft es die
/// Blöcke selbst wie `wiederherstellung::pruefe_bloecke` (Kette ab Block 1, gepinnter Schlüssel der
/// Einrichtung, nur `echt`). Eine leere, gebrochene, fremde oder Test-Kette schreibt keine Zeile.
#[test]
fn uebernehmen_prueft_die_bloecke_selbst_und_schreibt_bei_fehlern_nichts() {
    let echt = kette_aus(Betrieb::Echt, 3);
    let mut gebrochen = echt.clone();
    gebrochen.remove(1);
    let mut veraendert = echt.clone();
    veraendert[2].kopf.versiegelt = "2099-01-01T00:00:00+01:00".into();
    let faelle: Vec<(&str, Vec<Block>, Wiederherstellungsfehler)> = vec![
        ("leer", Vec::new(), Wiederherstellungsfehler::Leer),
        ("Lücke", gebrochen, Wiederherstellungsfehler::KetteGebrochen { block: 3, grund: Kettengrund::Vorgaenger }),
        ("Fingerabdruck", veraendert, Wiederherstellungsfehler::KetteGebrochen { block: 3, grund: Kettengrund::Hash }),
        ("Testbetrieb", kette_aus(Betrieb::Test, 2), Wiederherstellungsfehler::Testbetrieb { block: 1 }),
    ];
    for (fall, bloecke, erwartet) in faelle {
        let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Echt);
        let fehler = buch.uebernehme_sicherung(&bloecke, &BTreeMap::from([(2026, 3)])).unwrap_err();
        assert!(matches!(&fehler, BuchFehler::Sicherung(f) if *f == erwartet), "{fall}: {fehler:?}");
        assert!(buch.bloecke().unwrap().is_empty(), "{fall}");
        assert!(nummern_im_buch(&buch).is_empty(), "{fall}");
    }

    // Anderer gepinnter Schlüssel in der Einrichtung: dieselbe, sonst gültige Kette gilt nicht.
    let (_ordner, mut buch) = eingerichtetes_buch(Betrieb::Echt);
    buch.verbindung().execute("UPDATE einrichtung SET schluessel_id = 'ffffffffffffffff' WHERE id = 1", []).unwrap();
    let fehler = buch.uebernehme_sicherung(&echt, &BTreeMap::from([(2026, 3)])).unwrap_err();
    let erwartet =
        Wiederherstellungsfehler::AndererSchluessel { block: 1, gefunden: gepinnt(), gepinnt: "ffffffffffffffff".into() };
    assert!(matches!(&fehler, BuchFehler::Sicherung(f) if *f == erwartet), "{fehler:?}");
    assert!(buch.bloecke().unwrap().is_empty());
    assert!(nummern_im_buch(&buch).is_empty());
}
