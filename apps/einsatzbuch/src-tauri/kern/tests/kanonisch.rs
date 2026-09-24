//! Liest die additiven JCS-Randfälle aus dem geteilten TS-Kern (`kanonisch.json`, erzeugt
//! aus `kanonisch-faelle.ts`) und prüft sie byte-genau gegen `jcs::kanonisch`. Der Pfad ist
//! relativ zu `CARGO_MANIFEST_DIR` (Kompilierzeit-Konstante dieses Crates) und wird zur
//! Laufzeit gelesen, nicht per `include_str!` eingebettet — so bleibt die Datei bei jedem
//! Testlauf frisch, auch wenn sie sich zwischen zwei Kompilierläufen ändert.
use einsatzbuch_kern::format::Blockkopf;
use einsatzbuch_kern::jcs;
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
    assert_eq!(kopf.kanonisch(), fall.kanonisch);
}
