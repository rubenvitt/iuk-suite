//! Die Tauri-Hülle des Einsatzbuchs: Plugins, Zustand, Frist-Uhr und Fenster. Die Fachlogik
//! steht im Crate `einsatzbuch-kern` (`kern/`), die Befehle der Oberfläche in `befehle.rs`.
//!
//! Reihenfolge beim Start (Spec §4.1, §4.3):
//! 1. Einzelinstanz als erstes Plugin, damit ein zweiter Start sofort beim ersten landet.
//! 2. `setup`: Buch öffnen, **eine überfällige Frist versiegeln**, Zustand ablegen, Frist-Uhr
//!    starten, und erst dann das Fenster bauen. Es steht deshalb in `tauri.conf.json` mit
//!    `"create": false`: Die Oberfläche sieht einen überfälligen Einsatz nie als ausstehend.
pub mod befehle;
pub mod zustand;

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::time::Duration;

use einsatzbuch_kern::anmeldung::{self, Ziel};
use einsatzbuch_kern::buch::{Buch, erkenne_betrieb};
use einsatzbuch_kern::krypto::SystemZufall;
use einsatzbuch_kern::uhr::{SystemUhr, Uhr};
use tauri::{AppHandle, Manager, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use crate::zustand::Zustand;

/// Takt der Frist-Uhr (Spec §4.3: Prüfung beim Start und alle 15 Sekunden).
const FRIST_TAKT: Duration = Duration::from_secs(15);

/// Öffnet die Anmelde-URL im Systembrowser oder schreibt sie, nur in Debug-Builds mit
/// `EINSATZBUCH_ANMELDUNG_STDOUT=1`, als eine Zeile auf stdout (`anmeldung::ziel`).
#[allow(dead_code)] // verdrahtet in Stufe 5
pub fn oeffne_anmelde_url(app: &AppHandle, url: &str) -> Result<(), String> {
    let schalter = std::env::var(anmeldung::STDOUT_SCHALTER).ok();
    match anmeldung::ziel(url, schalter.as_deref()) {
        Ziel::Stdout(zeile) => {
            println!("{zeile}");
            Ok(())
        }
        Ziel::Browser => app
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|e| format!("Der Browser ließ sich nicht öffnen: {e}")),
    }
}

/// Startet die Frist-Uhr als eigenen Thread. Sie teilt sich das Buch mit den Befehlen und
/// sperrt es nur für die Dauer einer Prüfung. Ein Fehler oder eine Panik in einer Runde wird
/// gemeldet, beendet den Thread aber nicht: Die nächste Runde prüft wieder.
fn starte_frist_uhr(app: AppHandle) -> std::io::Result<()> {
    std::thread::Builder::new().name("frist-uhr".into()).spawn(move || {
        loop {
            std::thread::sleep(FRIST_TAKT);
            let zustand = app.state::<Zustand>();
            match catch_unwind(AssertUnwindSafe(|| zustand.pruefe_frist())) {
                Ok(Ok(_)) => {}
                Ok(Err(fehler)) => eprintln!("Frist-Prüfung fehlgeschlagen: {fehler}"),
                Err(_) => eprintln!("Frist-Prüfung abgebrochen (Panik), die nächste Runde prüft erneut"),
            }
        }
    })?;
    Ok(())
}

fn richte_ein(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let ordner = app.path().app_data_dir()?;
    std::fs::create_dir_all(&ordner)?;
    let uhr: Box<dyn Uhr> = Box::new(SystemUhr);

    let mut unquittiert = None;
    let buch = match erkenne_betrieb(&ordner)? {
        Some(betrieb) => {
            let mut buch = Buch::oeffne(&ordner, betrieb)?;
            // Nach einem Absturz oder Beenden während der Frist: versiegeln, bevor die
            // Oberfläche erscheint. Ein Fehler hier hält den Start nicht auf; die Frist-Uhr
            // versucht es in 15 Sekunden erneut.
            match buch.pruefe_frist(uhr.jetzt(), &mut SystemZufall) {
                Ok(v) => unquittiert = v,
                Err(fehler) => eprintln!("Frist-Prüfung beim Start fehlgeschlagen: {fehler}"),
            }
            Some(buch)
        }
        None => None,
    };

    app.manage(Zustand::neu(ordner, buch, unquittiert, uhr));
    starte_frist_uhr(app.handle().clone())?;

    let fenster = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .ok_or("tauri.conf.json nennt kein Fenster „main“")?
        .clone();
    WebviewWindowBuilder::from_config(app.handle(), &fenster)?.build()?;
    Ok(())
}

pub fn run() {
    // `generate_handler!` kennt kein `cfg` je Eintrag, deshalb zwei Listen. Der Entwicklerweg
    // existiert nur im Debug-Build. Der Typ steht ausdrücklich da: Ohne ihn kann der Compiler
    // die Laufzeit (`Wry`) des Handlers nicht ableiten.
    #[cfg(debug_assertions)]
    let befehle: fn(tauri::ipc::Invoke) -> bool = tauri::generate_handler![
        befehle::status,
        befehle::stammdaten,
        befehle::entwurf_speichern,
        befehle::entwurf_verwerfen,
        befehle::absenden,
        befehle::jetzt_versiegeln,
        befehle::frist_pruefen,
        befehle::versiegelung_quittieren,
        befehle::testbetrieb_beenden,
        befehle::autostart_status,
        befehle::autostart_setzen,
        befehle::entwicklung_einrichten,
    ];
    #[cfg(not(debug_assertions))]
    let befehle: fn(tauri::ipc::Invoke) -> bool = tauri::generate_handler![
        befehle::status,
        befehle::stammdaten,
        befehle::entwurf_speichern,
        befehle::entwurf_verwerfen,
        befehle::absenden,
        befehle::jetzt_versiegeln,
        befehle::frist_pruefen,
        befehle::versiegelung_quittieren,
        befehle::testbetrieb_beenden,
        befehle::autostart_status,
        befehle::autostart_setzen,
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argumente, _ordner| {
            if let Some(fenster) = app.get_webview_window("main") {
                let _ = fenster.unminimize();
                let _ = fenster.show();
                let _ = fenster.set_focus();
            }
        }))
        // Nur registriert, nicht eingeschaltet: Das geschieht bei der echten Einrichtung, nie
        // im Testbetrieb und nie in Debug-Builds (sonst trüge jeder Entwicklerlauf die App in
        // den Autostart des Entwicklerrechners ein).
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(richte_ein)
        .invoke_handler(befehle)
        .run(tauri::generate_context!())
        .expect("die Einsatzbuch-App ließ sich nicht starten");
}
