// Erzeugt aus `tauri.conf.json` und `capabilities/` die Kontext- und ACL-Beiwerke, die
// `tauri::generate_context!` in `src/lib.rs` einliest. Ohne eigenes App-Manifest: Die Befehle
// aus `generate_handler!` brauchen dann keinen Eintrag in den Capabilities.
//
// Vorher der Platzhalter-Riegel (Stufe 7, `build_pruefung.rs`): Ein Release-Build mit dem
// Platzhalter statt des öffentlichen Updater-Schlüssels bricht hier ab.
#[path = "build_pruefung.rs"]
mod build_pruefung;

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=build_pruefung.rs");
    let conf = std::fs::read_to_string("tauri.conf.json").expect("tauri.conf.json ließ sich nicht lesen");
    let profil = std::env::var("PROFILE").unwrap_or_default();
    if let Err(meldung) = build_pruefung::pruefe_updater_schluessel(&conf, &profil) {
        panic!("{meldung}");
    }
    tauri_build::build()
}
