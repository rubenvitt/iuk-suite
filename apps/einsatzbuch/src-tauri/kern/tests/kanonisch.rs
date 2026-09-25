//! Liest die additiven JCS-Randfälle aus dem geteilten TS-Kern (`kanonisch.json`, erzeugt
//! aus `kanonisch-faelle.ts`) und prüft sie byte-genau gegen `jcs::kanonisch`. Der Pfad ist
//! relativ zu `CARGO_MANIFEST_DIR` (Kompilierzeit-Konstante dieses Crates) und wird zur
//! Laufzeit gelesen, nicht per `include_str!` eingebettet — so bleibt die Datei bei jedem
//! Testlauf frisch, auch wenn sie sich zwischen zwei Kompilierläufen ändert.
use einsatzbuch_kern::format::{Blockkopf, GENESIS, Umgebung};
use einsatzbuch_kern::jcs::{self, JcsFehler};
use serde::Deserialize;
use serde_json::Value;

const KANONISCH_JSON: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren/kanonisch.json"
);

#[derive(Deserialize)]
struct Fall {
    name: String,
    wert: Value,
    kanonisch: String,
}

fn lies_faelle() -> Vec<Fall> {
    let text = std::fs::read_to_string(KANONISCH_JSON)
        .unwrap_or_else(|e| panic!("kanonisch.json nicht lesbar unter {KANONISCH_JSON}: {e}"));
    serde_json::from_str(&text).expect("kanonisch.json ist gültiges JSON")
}

#[test]
fn jeder_randfall_ist_byte_gleich_kanonisch() {
    let faelle = lies_faelle();
    assert!(faelle.len() >= 7, "erwarte mindestens 7 Randfälle, gefunden: {}", faelle.len());
    for fall in &faelle {
        let ergebnis = jcs::kanonisch(&fall.wert).unwrap_or_else(|e| panic!("Fall {}: {e}", fall.name));
        assert_eq!(ergebnis, fall.kanonisch, "Fall {} weicht von der Erwartung ab", fall.name);
    }
}

/// Pinnt `Umgebung::Test` → `"test"`: Der Fall `blockkopf-test` wird als `Blockkopf`
/// deserialisiert, und dessen eigene `kanonisch()`-Methode muss denselben String ergeben
/// wie die direkte JCS-Kanonisierung des rohen Werts.
#[test]
fn blockkopf_test_stimmt_mit_der_eigenen_kanonik_ueberein() {
    let faelle = lies_faelle();
    let fall = faelle.iter().find(|f| f.name == "blockkopf-test").expect("Fall blockkopf-test fehlt in kanonisch.json");
    let kopf: Blockkopf = serde_json::from_value(fall.wert.clone()).expect("blockkopf-test deserialisiert als Blockkopf");
    assert_eq!(kopf.kanonisch().unwrap(), fall.kanonisch);
}

/// Fund aus Phase C: Eine Blocknummer über der Grenze sicherer Ganzzahlen (`jcs::SICHER`,
/// `Number.isSafeInteger`) ließ `Blockkopf::kanonisch` früher mit `.expect(..)` abstürzen. Seit
/// dieser Änderung meldet sie einen Fehler statt eines Panics — geprüft direkt hier, denn
/// `grenzen::kette_hat_platz` verhindert eine so hohe Blocknummer im normalen Betrieb ohnehin
/// weit vorher (siehe `versiegele_ausstehend_mit_zu_grosser_blocknummer_scheitert_ohne_panic` in
/// `tests/versiegeln.rs` für den Fall über eine manipulierte Kette).
#[test]
fn blockkopf_mit_zu_grosser_blocknummer_scheitert_statt_zu_paniken() {
    let kopf = Blockkopf {
        v: 1,
        block: 1u64 << 53, // 2^53, eine Einheit über `jcs::SICHER`
        prev: GENESIS.to_string(),
        versiegelt: "2026-01-01T00:00:00+01:00".to_string(),
        schluessel_id: "0000000000000000".to_string(),
        umgebung: Umgebung::Echt,
    };
    assert!(matches!(kopf.kanonisch(), Err(JcsFehler::KeineGanzeZahl(_))));
}
