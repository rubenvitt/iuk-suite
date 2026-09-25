// Erzeugt aus `tauri.conf.json` und `capabilities/` die Kontext- und ACL-Beiwerke, die
// `tauri::generate_context!` in `src/lib.rs` einliest. Ohne eigenes App-Manifest: Die Befehle
// aus `generate_handler!` brauchen dann keinen Eintrag in den Capabilities.
fn main() {
    tauri_build::build()
}
