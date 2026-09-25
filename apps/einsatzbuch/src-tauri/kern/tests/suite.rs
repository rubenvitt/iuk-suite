//! Suite-Protokoll (Plan Stufe 5, Tabelle „Schnittstellen“) gegen einen `FakeTransport`, der
//! jede Anfrage aufzeichnet und nach Skript antwortet — kein Netz. Die Ankertests laufen auf
//! einem echten Buch in einem Tempordner mit echt versiegelten Blöcken.
mod hilfe;

use std::sync::{Arc, Mutex};

use chrono::{Duration, TimeZone, Utc};
use einsatzbuch_kern::buch::{Ankerabweichung, Betrieb, Buch};
use einsatzbuch_kern::einrichtung::Stammdatenpaket;
use einsatzbuch_kern::format::{Block, Blockkopf, GENESIS, Umgebung, Umschlag};
use einsatzbuch_kern::suite::{
    self, Anfrage, AnkerErgebnis, Antwort, PAKET, StammdatenErgebnis, SuiteFehler, Transport,
};
use serde_json::{Value, json};

const SUITE: &str = "https://suite.example";

/// Eine aufgezeichnete Anfrage, mit eigenen Strings statt Leihgaben und dem Körper als JSON.
#[derive(Debug, Clone)]
struct Aufgezeichnet {
    methode: &'static str,
    url: String,
    bearer: Option<String>,
    if_none_match: Option<String>,
    json: Option<Value>,
}

type Skript = Box<dyn Fn(&Aufgezeichnet) -> Result<Antwort, String> + Send + Sync>;

/// Zeichnet jede Anfrage auf und antwortet nach `skript`. Kennt der Fake das geteilte Buch,
/// prüft er bei jeder Anfrage, dass niemand dessen Lock hält — `gleiche_anker_ab` darf ihn nie
/// über eine Anfrage hinweg halten. `try_lock` auf demselben Thread scheitert, statt zu hängen.
struct FakeTransport {
    anfragen: Mutex<Vec<Aufgezeichnet>>,
    skript: Skript,
    buch: Option<Arc<Mutex<Option<Buch>>>>,
}

impl FakeTransport {
    fn neu(skript: impl Fn(&Aufgezeichnet) -> Result<Antwort, String> + Send + Sync + 'static) -> FakeTransport {
        FakeTransport { anfragen: Mutex::new(Vec::new()), skript: Box::new(skript), buch: None }
    }

    fn mit_buch(mut self, buch: &Arc<Mutex<Option<Buch>>>) -> FakeTransport {
        self.buch = Some(buch.clone());
        self
    }

    fn anfragen(&self) -> Vec<Aufgezeichnet> {
        self.anfragen.lock().unwrap().clone()
    }
}

impl Transport for FakeTransport {
    fn sende(&self, a: Anfrage<'_>) -> Result<Antwort, String> {
        if let Some(buch) = &self.buch {
            assert!(buch.try_lock().is_ok(), "Buch-Lock während einer Anfrage gehalten: {} {}", a.methode, a.url);
        }
        let aufgezeichnet = Aufgezeichnet {
            methode: a.methode,
            url: a.url,
            bearer: a.bearer.map(str::to_string),
            if_none_match: a.if_none_match.map(str::to_string),
            json: a.json.map(|j| serde_json::from_str(&j).expect("Anfragekörper ist JSON")),
        };
        let antwort = (self.skript)(&aufgezeichnet);
        self.anfragen.lock().unwrap().push(aufgezeichnet);
        antwort
    }
}

fn antwort(status: u16, koerper: &str) -> Result<Antwort, String> {
    Ok(Antwort { status, etag: None, koerper: koerper.to_string() })
}

fn fehler(status: u16, code: &str, meldung: &str) -> Result<Antwort, String> {
    antwort(status, &json!({ "error": { "code": code, "message": meldung } }).to_string())
}

fn fixture(datei: &str) -> String {
    let pfad = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../src/app/m/einsatzbuch/_lib/anbindung/vertrag")
        .join(datei);
    std::fs::read_to_string(&pfad).unwrap_or_else(|e| panic!("{}: {e}", pfad.display()))
}

// ---------------------------------------------------------------------------------------------
// Freigabe
// ---------------------------------------------------------------------------------------------

/// Ein Block ohne echte Krypto — `gib_frei` reicht Kopf und Umschlag nur durch.
fn block(n: u64) -> Block {
    Block {
        kopf: Blockkopf {
            v: 1,
            block: n,
            prev: GENESIS.into(),
            versiegelt: "2026-08-22T04:43:00+02:00".into(),
            schluessel_id: "8cedd95d94246a4d".into(),
            umgebung: Umgebung::Echt,
        },
        iv: "aXY=".into(),
        daten: "ZA==".into(),
        umschlag: Umschlag { epk: format!("epk{n}"), iv: "aXY=".into(), ct: "Y3Q=".into() },
        hash: format!("{n:064x}"),
    }
}

/// Antwortet auf eine Freigabe-Anfrage mit einem CEK je angefragtem Block.
fn freigabe_echo(a: &Aufgezeichnet) -> Result<Antwort, String> {
    let posten: Vec<Value> = a.json.as_ref().unwrap().as_array().unwrap().iter()
        .map(|p| json!({ "block": p["kopf"]["block"], "cek": format!("cek{}", p["kopf"]["block"]) }))
        .collect();
    antwort(200, &Value::Array(posten).to_string())
}

#[test]
fn gib_frei_schickt_450_bloecke_in_drei_paketen_mit_bearer() {
    let t = FakeTransport::neu(freigabe_echo);
    let bloecke: Vec<Block> = (1..=450).map(block).collect();
    let schluessel = suite::gib_frei(&t, SUITE, "sitzung", &bloecke).unwrap();

    assert_eq!(PAKET, 200);
    let anfragen = t.anfragen();
    let groessen: Vec<usize> = anfragen.iter().map(|a| a.json.as_ref().unwrap().as_array().unwrap().len()).collect();
    assert_eq!(groessen, [200, 200, 50]);
    for a in &anfragen {
        assert_eq!(a.methode, "POST");
        assert_eq!(a.url, "https://suite.example/m/einsatzbuch/api/schluessel/freigeben");
        assert_eq!(a.bearer.as_deref(), Some("sitzung"));
        assert_eq!(a.if_none_match, None);
    }
    // Der Körper ist ein nacktes Array `[{kopf, umschlag}]` — nichts sonst.
    let erster = &anfragen[0].json.as_ref().unwrap()[0];
    assert_eq!(erster, &json!({ "kopf": block(1).kopf, "umschlag": block(1).umschlag }));
    assert_eq!(anfragen[2].json.as_ref().unwrap()[49]["kopf"]["block"], 450);

    assert_eq!(schluessel.len(), 450);
    assert_eq!(schluessel[0].block, 1);
    assert_eq!(schluessel[0].cek, "cek1");
    assert_eq!(schluessel[449].block, 450);
}

#[test]
fn gib_frei_ohne_bloecke_fragt_nicht() {
    let t = FakeTransport::neu(|_| panic!("keine Anfrage erwartet"));
    assert_eq!(suite::gib_frei(&t, SUITE, "sitzung", &[]).unwrap(), []);
    assert!(t.anfragen().is_empty());
}

#[test]
fn gib_frei_bricht_bei_422_ab_und_liefert_code_und_meldung_der_suite() {
    let t = FakeTransport::neu(|a| {
        if a.json.as_ref().unwrap()[0]["kopf"]["block"] == 201 {
            fehler(422, "art_passt_nicht", "Die Art des Schlüsselpaars passt nicht zum Rechner.")
        } else {
            freigabe_echo(a)
        }
    });
    let bloecke: Vec<Block> = (1..=450).map(block).collect();
    let ergebnis = suite::gib_frei(&t, SUITE, "sitzung", &bloecke);
    assert_eq!(
        ergebnis,
        Err(SuiteFehler::Abgelehnt {
            status: 422,
            code: "art_passt_nicht".into(),
            meldung: "Die Art des Schlüsselpaars passt nicht zum Rechner.".into(),
        })
    );
    assert_eq!(t.anfragen().len(), 2, "nach der Ablehnung darf kein weiteres Paket gehen");
}

#[test]
fn gib_frei_mit_401_ist_eine_abgelehnte_sitzung_kein_widerruf() {
    let t = FakeTransport::neu(|_| fehler(401, "sitzung_ungueltig", "Die Sitzung gilt nicht mehr."));
    let ergebnis = suite::gib_frei(&t, SUITE, "sitzung", &[block(1)]);
    assert!(matches!(ergebnis, Err(SuiteFehler::Abgelehnt { status: 401, ref code, .. }) if code == "sitzung_ungueltig"), "{ergebnis:?}");
}

#[test]
fn gib_frei_lehnt_eine_antwort_mit_anderen_bloecken_ab() {
    let t = FakeTransport::neu(|_| antwort(200, r#"[{"block":7,"cek":"k"}]"#));
    let ergebnis = suite::gib_frei(&t, SUITE, "sitzung", &[block(1)]);
    assert!(matches!(ergebnis, Err(SuiteFehler::Antwort(_))), "{ergebnis:?}");
}

#[test]
fn ein_unlesbarer_fehlerkoerper_wird_zu_antwort_statt_panik() {
    let t = FakeTransport::neu(|_| antwort(502, "<html>Bad Gateway</html>"));
    let ergebnis = suite::gib_frei(&t, SUITE, "sitzung", &[block(1)]);
    assert!(matches!(ergebnis, Err(SuiteFehler::Antwort(ref m)) if m.contains("502")), "{ergebnis:?}");
}

#[test]
fn netzfehler_ist_nicht_erreichbar() {
    let t = FakeTransport::neu(|_| Err("Verbindung verweigert".into()));
    assert_eq!(
        suite::gib_frei(&t, SUITE, "sitzung", &[block(1)]),
        Err(SuiteFehler::NichtErreichbar("Verbindung verweigert".into()))
    );
}

// ---------------------------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------------------------

const ETAG: &str = "\"7/Europe/Berlin\"";

#[test]
fn hole_stammdaten_schickt_if_none_match_und_304_ist_unveraendert() {
    let t = FakeTransport::neu(|_| antwort(304, ""));
    let ergebnis = suite::hole_stammdaten(&t, SUITE, "geraet", Some(ETAG)).unwrap();
    assert_eq!(ergebnis, StammdatenErgebnis::Unveraendert);
    let a = &t.anfragen()[0];
    assert_eq!(a.methode, "GET");
    assert_eq!(a.url, "https://suite.example/m/einsatzbuch/api/stammdaten");
    assert_eq!(a.bearer.as_deref(), Some("geraet"));
    // Byte für Byte samt Anführungszeichen: Die Suite vergleicht `if-none-match === etag`.
    assert_eq!(a.if_none_match.as_deref(), Some(ETAG));
    assert_eq!(a.json, None);
}

#[test]
fn hole_stammdaten_200_liefert_paket_und_etag() {
    let t = FakeTransport::neu(|_| Ok(Antwort { status: 200, etag: Some(ETAG.into()), koerper: fixture("stammdaten.json") }));
    let ergebnis = suite::hole_stammdaten(&t, SUITE, "geraet", None).unwrap();
    let erwartet: Stammdatenpaket = serde_json::from_str(&fixture("stammdaten.json")).unwrap();
    assert_eq!(ergebnis, StammdatenErgebnis::Neu { paket: erwartet, etag: Some(ETAG.into()) });
    assert_eq!(t.anfragen()[0].if_none_match, None);
}

#[test]
fn hole_stammdaten_401_ist_widerrufen() {
    let t = FakeTransport::neu(|_| fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr."));
    assert_eq!(suite::hole_stammdaten(&t, SUITE, "geraet", Some(ETAG)), Err(SuiteFehler::Widerrufen));
}

#[test]
fn hole_stammdaten_netzfehler_ist_nicht_erreichbar() {
    let t = FakeTransport::neu(|_| Err("Zeitüberschreitung".into()));
    assert_eq!(
        suite::hole_stammdaten(&t, SUITE, "geraet", None),
        Err(SuiteFehler::NichtErreichbar("Zeitüberschreitung".into()))
    );
}

#[test]
fn hole_stammdaten_422_nennt_die_meldung_der_suite() {
    let t = FakeTransport::neu(|_| {
        antwort(
            422,
            r#"{"error":{"code":"stammdaten_zu_lang","message":"ruf bei „11-83-1“ ist zu lang."},"feld":"ruf","eintrag":"11-83-1"}"#,
        )
    });
    assert_eq!(
        suite::hole_stammdaten(&t, SUITE, "geraet", None),
        Err(SuiteFehler::Abgelehnt {
            status: 422,
            code: "stammdaten_zu_lang".into(),
            meldung: "ruf bei „11-83-1“ ist zu lang.".into()
        })
    );
}

// ---------------------------------------------------------------------------------------------
// Tausch, Einrichten, Rechner löschen
// ---------------------------------------------------------------------------------------------

#[test]
fn tausche_schickt_code_und_verifier_und_optional_das_geraete_token() {
    let t = FakeTransport::neu(|_| antwort(200, &fixture("tausch.json")));
    let a = suite::tausche(&t, SUITE, "code", "verifier", Some("geraet")).unwrap();
    assert_eq!(a.sitzungstoken, "SsR_pWfukpmnu7lamRqzBCfs1-3YeHOJCBy7pH8hkAk");
    assert_eq!(a.rechner_id, None);
    suite::tausche(&t, SUITE, "code", "verifier", None).unwrap();

    let anfragen = t.anfragen();
    assert_eq!(anfragen[0].methode, "POST");
    assert_eq!(anfragen[0].url, "https://suite.example/m/einsatzbuch/api/anmelden/tausch");
    assert_eq!(anfragen[0].json, Some(json!({ "code": "code", "verifier": "verifier" })));
    assert_eq!(anfragen[0].bearer.as_deref(), Some("geraet"));
    assert_eq!(anfragen[1].bearer, None);
}

#[test]
fn tausche_mit_verbrauchtem_code_ist_abgelehnt() {
    let t = FakeTransport::neu(|_| fehler(400, "code_ungueltig", "Der Anmeldecode gilt nicht (mehr)."));
    assert_eq!(
        suite::tausche(&t, SUITE, "code", "verifier", None).unwrap_err(),
        SuiteFehler::Abgelehnt { status: 400, code: "code_ungueltig".into(), meldung: "Der Anmeldecode gilt nicht (mehr).".into() }
    );
}

#[test]
fn richte_ein_schickt_art_und_name_mit_dem_sitzungstoken() {
    let t = FakeTransport::neu(|_| antwort(200, &fixture("einrichten.json")));
    let e = suite::richte_ein(&t, SUITE, "sitzung", Umgebung::Echt, "Einsatzleitung").unwrap();
    assert_eq!(e.rechner_id, "V1StGXR8_Z5jdHi6B-myT");
    assert_eq!(e.geraete_token, "50jJwkkyYKdHhEjO0BD8jmcYo6ooSzN5HHQcyzIvLII");
    let a = &t.anfragen()[0];
    assert_eq!(a.methode, "POST");
    assert_eq!(a.url, "https://suite.example/m/einsatzbuch/api/einrichten");
    assert_eq!(a.bearer.as_deref(), Some("sitzung"));
    assert_eq!(a.json, Some(json!({ "art": "echt", "name": "Einsatzleitung" })));
}

#[test]
fn richte_ein_lehnt_eine_antwort_mit_anderer_art_ab() {
    let t = FakeTransport::neu(|_| antwort(200, &fixture("einrichten.json")));
    let ergebnis = suite::richte_ein(&t, SUITE, "sitzung", Umgebung::Test, "Laptop");
    assert!(matches!(ergebnis, Err(SuiteFehler::Antwort(_))), "{ergebnis:?}");
}

#[test]
fn richte_ein_echt_vorhanden_und_401_sind_abgelehnt() {
    let t = FakeTransport::neu(|_| antwort(409, &fixture("fehler-echt-vorhanden.json")));
    let ergebnis = suite::richte_ein(&t, SUITE, "sitzung", Umgebung::Echt, "Einsatzleitung");
    assert!(
        matches!(ergebnis, Err(SuiteFehler::Abgelehnt { status: 409, ref code, ref meldung })
            if code == "echt_vorhanden" && meldung.contains("Ole Brandt")),
        "{ergebnis:?}"
    );

    let t = FakeTransport::neu(|_| fehler(401, "sitzung_ungueltig", "Die Sitzung gilt nicht mehr."));
    let ergebnis = suite::richte_ein(&t, SUITE, "sitzung", Umgebung::Echt, "Einsatzleitung");
    assert!(matches!(ergebnis, Err(SuiteFehler::Abgelehnt { status: 401, .. })), "{ergebnis:?}");
}

#[test]
fn loesche_rechner_kodiert_die_id_im_pfad() {
    let t = FakeTransport::neu(|_| antwort(204, ""));
    suite::loesche_rechner(&t, SUITE, "sitzung", "a/b c").unwrap();
    let a = &t.anfragen()[0];
    assert_eq!(a.methode, "DELETE");
    assert_eq!(a.url, "https://suite.example/m/einsatzbuch/api/rechner/a%2Fb%20c");
    assert_eq!(a.bearer.as_deref(), Some("sitzung"));
    assert_eq!(a.json, None);

    let t = FakeTransport::neu(|_| fehler(403, "nur_test", "Ein echter Rechner wird nie gelöscht, nur widerrufen."));
    assert!(matches!(
        suite::loesche_rechner(&t, SUITE, "sitzung", "r1"),
        Err(SuiteFehler::Abgelehnt { status: 403, .. })
    ));
}

#[test]
fn suite_url_mit_schraegstrich_am_ende_ergibt_keinen_doppelten() {
    let t = FakeTransport::neu(|_| antwort(204, ""));
    suite::loesche_rechner(&t, "https://suite.example/", "sitzung", "r1").unwrap();
    assert_eq!(t.anfragen()[0].url, "https://suite.example/m/einsatzbuch/api/rechner/r1");
}

// ---------------------------------------------------------------------------------------------
// Anker
// ---------------------------------------------------------------------------------------------

fn geteiltes_buch(ordner: &std::path::Path, bloecke: u8) -> Arc<Mutex<Option<Buch>>> {
    let mut buch = Buch::oeffne(ordner, Betrieb::Echt).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt), hilfe::RECHNER_ID, hilfe::RECHNER_NAME).unwrap();
    let t0 = Utc.with_ymd_and_hms(2026, 8, 22, 3, 12, 0).unwrap();
    for i in 0..bloecke {
        hilfe::versiegele_einen_einsatz(&mut buch, t0 + Duration::hours(i64::from(i)), i + 1);
    }
    Arc::new(Mutex::new(Some(buch)))
}

fn anbindung(buch: &Mutex<Option<Buch>>) -> einsatzbuch_kern::buch::Anbindung {
    buch.lock().unwrap().as_ref().unwrap().anbindung().unwrap().unwrap()
}

fn hashes(buch: &Mutex<Option<Buch>>) -> Vec<String> {
    buch.lock().unwrap().as_ref().unwrap().bloecke().unwrap().into_iter().map(|b| b.hash).collect()
}

fn gemeldete_bloecke(t: &FakeTransport) -> Vec<u64> {
    t.anfragen().iter().map(|a| a.json.as_ref().unwrap()["block"].as_u64().unwrap()).collect()
}

/// Review Focus 4 „Offline ist normal“: Offline bleibt nichts gemeldet; nach einem Neustart mit
/// Netz werden alle drei Blöcke aufsteigend nachgemeldet — genau drei Anfragen, denn die
/// Nachmeldung des letzten Blocks (Schritt 3) gilt nur, wenn nichts offen war.
#[test]
fn anker_werden_nach_neustart_nachgemeldet() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = geteiltes_buch(ordner.path(), 3);
    let hash = hashes(&buch);

    let offline = FakeTransport::neu(|_| Err("keine Verbindung".into())).mit_buch(&buch);
    assert_eq!(suite::gleiche_anker_ab(&buch, &offline, SUITE, "geraet").unwrap(), AnkerErgebnis::Offline);
    assert_eq!(anbindung(&buch).anker_gemeldet_bis, 0);

    // Neustart: Buch schließen und neu öffnen.
    *buch.lock().unwrap() = None;
    *buch.lock().unwrap() = Some(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap());

    let online = FakeTransport::neu(|_| antwort(204, "")).mit_buch(&buch);
    assert_eq!(suite::gleiche_anker_ab(&buch, &online, SUITE, "geraet").unwrap(), AnkerErgebnis::Bestaetigt(3));
    assert_eq!(anbindung(&buch).anker_gemeldet_bis, 3);

    let anfragen = online.anfragen();
    assert_eq!(anfragen.len(), 3);
    for (i, a) in anfragen.iter().enumerate() {
        assert_eq!(a.methode, "POST");
        assert_eq!(a.url, "https://suite.example/m/einsatzbuch/api/anker");
        assert_eq!(a.bearer.as_deref(), Some("geraet"));
        assert_eq!(a.json, Some(json!({ "block": i + 1, "hash": hash[i] })));
    }
}

/// Schritt 3: Ist alles bestätigt, wird trotzdem der letzte Block erneut gemeldet — „Kette
/// prüfen gegen den Anker“.
#[test]
fn ohne_offene_anker_wird_der_letzte_block_erneut_gemeldet() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = geteiltes_buch(ordner.path(), 2);
    let t = FakeTransport::neu(|_| antwort(204, "")).mit_buch(&buch);
    suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap();
    assert_eq!(gemeldete_bloecke(&t), [1, 2]);

    let t = FakeTransport::neu(|_| antwort(204, "")).mit_buch(&buch);
    assert_eq!(suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap(), AnkerErgebnis::Bestaetigt(2));
    assert_eq!(gemeldete_bloecke(&t), [2]);

    let erwartet = "f".repeat(64);
    let t = FakeTransport::neu(move |_| {
        antwort(409, &json!({ "error": { "code": "anker_abweichung", "message": "m" }, "erwartet": erwartet }).to_string())
    })
    .mit_buch(&buch);
    let ergebnis = suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap();
    let hash = hashes(&buch);
    let abweichung = Ankerabweichung { block: 2, erwartet: "f".repeat(64), gemeldet: hash[1].clone() };
    assert_eq!(ergebnis, AnkerErgebnis::Abweichung(abweichung.clone()));
    assert_eq!(anbindung(&buch).anker_abweichung, Some(abweichung));
}

#[test]
fn abweichung_bei_block_2_wird_gespeichert_und_block_3_nicht_gesendet() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = geteiltes_buch(ordner.path(), 3);
    let hash = hashes(&buch);
    let erwartet = "a".repeat(64);
    let erwartet_im_skript = erwartet.clone();
    let t = FakeTransport::neu(move |a| {
        if a.json.as_ref().unwrap()["block"] == 2 {
            antwort(
                409,
                &json!({ "error": { "code": "anker_abweichung", "message": "Der gemeldete Hash weicht vom bekannten Anker ab." },
                         "erwartet": erwartet_im_skript })
                .to_string(),
            )
        } else {
            antwort(204, "")
        }
    })
    .mit_buch(&buch);

    let ergebnis = suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap();
    let abweichung = Ankerabweichung { block: 2, erwartet, gemeldet: hash[1].clone() };
    assert_eq!(ergebnis, AnkerErgebnis::Abweichung(abweichung.clone()));
    assert_eq!(gemeldete_bloecke(&t), [1, 2]);
    let stand = anbindung(&buch);
    assert_eq!(stand.anker_gemeldet_bis, 1);
    assert_eq!(stand.anker_abweichung, Some(abweichung));
}

#[test]
fn anker_401_setzt_widerrufen() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = geteiltes_buch(ordner.path(), 2);
    let t = FakeTransport::neu(|_| fehler(401, "geraet_ungueltig", "Das Geräte-Token gilt nicht mehr.")).mit_buch(&buch);
    assert_eq!(suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap(), AnkerErgebnis::Widerrufen);
    let stand = anbindung(&buch);
    assert!(stand.widerrufen);
    assert_eq!(stand.anker_gemeldet_bis, 0);
    assert_eq!(gemeldete_bloecke(&t), [1]);
}

#[test]
fn leere_kette_ist_ohne_anfrage_bestaetigt() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = geteiltes_buch(ordner.path(), 0);
    let t = FakeTransport::neu(|_| panic!("keine Anfrage erwartet")).mit_buch(&buch);
    assert_eq!(suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap(), AnkerErgebnis::Bestaetigt(0));
    assert!(t.anfragen().is_empty());
}

#[test]
fn anker_ohne_offenes_buch_ist_ein_fehler() {
    let buch: Mutex<Option<Buch>> = Mutex::new(None);
    let t = FakeTransport::neu(|_| panic!("keine Anfrage erwartet"));
    assert!(suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").is_err());
}

#[test]
fn anker_mit_unerwartetem_status_ist_ein_fehler_und_haelt_den_stand() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = geteiltes_buch(ordner.path(), 2);
    let t = FakeTransport::neu(|_| fehler(400, "validation_error", "kaputt")).mit_buch(&buch);
    let ergebnis = suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet");
    assert!(matches!(ergebnis, Err(ref m) if m.contains("kaputt")), "{ergebnis:?}");
    assert_eq!(anbindung(&buch).anker_gemeldet_bis, 0);
}

// ---------------------------------------------------------------------------------------------
// 5xx eines Proxys ist Offline (Nachtrag aus dem Review von Task 7)
// ---------------------------------------------------------------------------------------------

/// Ein vorgeschalteter Proxy antwortet mit 502/503/504, solange die Suite nicht läuft. Für den
/// Anker- und den Stammdatenabgleich heißt das „nicht erreichbar“, nicht „Fehler“: Der nächste
/// Lauf meldet nach, der Stand bleibt.
#[test]
fn anker_mit_5xx_ist_offline_und_haelt_den_stand() {
    for status in [500, 502, 503, 504] {
        let ordner = tempfile::tempdir().unwrap();
        let buch = geteiltes_buch(ordner.path(), 2);
        let t = FakeTransport::neu(move |_| antwort(status, "<html>Bad Gateway</html>")).mit_buch(&buch);
        assert_eq!(suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap(), AnkerErgebnis::Offline, "HTTP {status}");
        let stand = anbindung(&buch);
        assert_eq!(stand.anker_gemeldet_bis, 0);
        assert!(!stand.widerrufen);
        assert_eq!(gemeldete_bloecke(&t), [1], "nach dem ersten 5xx geht keine weitere Anfrage");
    }
}

#[test]
fn stammdaten_mit_5xx_sind_nicht_erreichbar() {
    for status in [502, 503, 504] {
        let t = FakeTransport::neu(move |_| antwort(status, "<html>Service Unavailable</html>"));
        let ergebnis = suite::hole_stammdaten(&t, SUITE, "geraet", Some(ETAG));
        assert!(matches!(ergebnis, Err(SuiteFehler::NichtErreichbar(ref m)) if m.contains(&status.to_string())), "{ergebnis:?}");
    }
    // Auch ein 503 mit lesbarem Fehlerkörper der Suite ist für den Abgleich nur „nicht erreichbar“.
    let t = FakeTransport::neu(|_| fehler(503, "wartung", "Die Suite wird gewartet."));
    assert!(matches!(suite::hole_stammdaten(&t, SUITE, "geraet", None), Err(SuiteFehler::NichtErreichbar(_))));
}

// ---------------------------------------------------------------------------------------------
// Wettlauf gegen „Neu einrichten“ (Nachtrag aus dem Review von Task 7)
// ---------------------------------------------------------------------------------------------

/// Schreibt mitten in der Anfrage — der Lock ist dann frei — eine Neu-Einrichtung mit neuer
/// Rechnerkennung ins Buch, so wie `richte_neu_ein` der Hülle es zwischen zwei Ankeranfragen
/// tun kann.
fn richte_waehrend_der_anfrage_neu_ein(buch: &Mutex<Option<Buch>>) {
    let mut wache = buch.lock().unwrap();
    let offen = wache.as_mut().unwrap();
    offen.richte_neu_ein(&hilfe::test_einrichtung(Umgebung::Echt), "r2", "Neuer Rechner").unwrap();
}

/// Eine späte Antwort an den alten Rechner darf den Stand des neuen nicht verändern: weder eine
/// Bestätigung noch einen Widerruf noch eine Abweichung.
#[test]
fn spaete_antwort_nach_neu_einrichten_wird_verworfen() {
    let faelle: [(u16, String); 3] = [
        (204, String::new()),
        (401, json!({ "error": { "code": "geraet_ungueltig", "message": "m" } }).to_string()),
        (409, json!({ "error": { "code": "anker_abweichung", "message": "m" }, "erwartet": "e".repeat(64) }).to_string()),
    ];
    for (status, koerper) in faelle {
        let ordner = tempfile::tempdir().unwrap();
        let buch = geteiltes_buch(ordner.path(), 2);
        let im_skript = buch.clone();
        let t = FakeTransport::neu(move |_| {
            richte_waehrend_der_anfrage_neu_ein(&im_skript);
            antwort(status, &koerper)
        })
        .mit_buch(&buch);

        assert_eq!(suite::gleiche_anker_ab(&buch, &t, SUITE, "geraet").unwrap(), AnkerErgebnis::Ueberholt, "HTTP {status}");
        let stand = anbindung(&buch);
        assert_eq!(stand.rechner_id, "r2");
        assert_eq!(stand.anker_gemeldet_bis, 0, "HTTP {status}: keine Bestätigung für den neuen Rechner");
        assert!(!stand.widerrufen, "HTTP {status}: kein Widerruf des neuen Rechners");
        assert_eq!(stand.anker_abweichung, None, "HTTP {status}: keine Abweichung am neuen Rechner");
        assert_eq!(gemeldete_bloecke(&t), [1], "HTTP {status}: nach dem Wechsel geht nichts mehr hinaus");
    }
}

// ---------------------------------------------------------------------------------------------
// Keine Geheimnisse im Debug-Text (Nachtrag aus dem Review von Task 7)
// ---------------------------------------------------------------------------------------------

#[test]
fn anfrage_und_antwort_schwaerzen_token_und_koerper_im_debug() {
    let anfrage = Anfrage {
        methode: "POST",
        url: "https://suite.example/m/einsatzbuch/api/anmelden/tausch".into(),
        bearer: Some("GEHEIMES-GERAETETOKEN"),
        if_none_match: Some("\"7/Europe/Berlin\""),
        json: Some(r#"{"code":"GEHEIMER-CODE","verifier":"GEHEIMER-VERIFIER"}"#.into()),
    };
    let text = format!("{anfrage:?}");
    for geheim in ["GEHEIMES-GERAETETOKEN", "GEHEIMER-CODE", "GEHEIMER-VERIFIER"] {
        assert!(!text.contains(geheim), "{text}");
    }
    assert!(text.contains("api/anmelden/tausch") && text.contains("POST"), "Methode und Adresse bleiben lesbar: {text}");

    let antwort = Antwort { status: 200, etag: None, koerper: r#"{"sitzungstoken":"GEHEIMES-SITZUNGSTOKEN"}"#.into() };
    let text = format!("{antwort:?}");
    assert!(!text.contains("GEHEIMES-SITZUNGSTOKEN"), "{text}");
    assert!(text.contains("200"), "{text}");
}
