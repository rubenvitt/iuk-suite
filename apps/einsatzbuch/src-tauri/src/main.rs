// Ohne Konsolenfenster unter Windows im Release-Build; der Debug-Build behält die Konsole für
// `eprintln!` und die Anmelde-URL auf stdout.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    einsatzbuch_lib::run()
}
