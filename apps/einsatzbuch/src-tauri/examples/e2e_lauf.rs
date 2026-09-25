//! Ende-zu-Ende-Treiber der Anbindung Desktop-App ↔ Suite (Stufe 5, Task 12) — NUR im Debug-Build.
//!
//! Computer-Use ist nicht freigegeben, und für WKWebView gibt es keinen WebDriver (Entscheidung
//! 16). Deshalb treibt dieses Beispielprogramm DIESELBEN Funktionen `fn(&Zustand, …)` aus
//! `befehle.rs`, die die Tauri-Befehle aufrufen — mit dem echten Transport (`NetzTransport`,
//! `ureq`), dem echten Schlüsselbund (`schluesselbund::system_tresor`), dem echten
//! Loopback-Listener und der Systemuhr. Den Browserteil übernimmt
//! `scripts/einsatzbuch-e2e-anmeldung.ts` (Dev-Login statt Pocket ID), das Entschlüsseln
//! `scripts/einsatzbuch-e2e-oeffnen.ts` mit demselben Kernaufruf wie die Verwaltung.
//!
//! Aufruf (im Repo-Root vorher `pnpm --filter einsatzbuch build`):
//!
//! ```text
//! cd apps/einsatzbuch/src-tauri
//! E2E_SUITE_URL=http://einsatzbuch.localtest.me:<port> mise exec -- cargo run --example e2e_lauf
//! ```
//!
//! Umgebung:
//! - `E2E_SUITE_URL` (Pflicht): die laufende Suite, Frist dort auf 1 Minute.
//! - `E2E_FREIGABE_DATEI`: wohin Schritt 5 Blöcke und CEKs für das Entschlüssel-Skript schreibt;
//!   Vorgabe `<TMPDIR>/einsatzbuch-e2e-steuerung/freigabe.json`. Die Datei wird danach gelöscht.
//! - `E2E_RECHNER_NAME`: Name des Test-Rechners, Vorgabe „E2E-Lauf“.
//!
//! Jeder Schritt schreibt Zeilen `E2E <schritt>: …`. Nach Schritt 4 und nach Schritt 6 wartet der
//! Treiber auf eine Markendatei im Steuerordner (`touch …`, die Zeile nennt den Pfad), damit der
//! Controller die Datenbank der Suite abfragen kann. Scheitert ein Schritt nach der Einrichtung,
//! beendet der Treiber den Testbetrieb trotzdem, damit kein Eintrag im Schlüsselbund bleibt.
//!
//! Geheimnisse: Die Anmelde-URL (nur `state` und `challenge`) geht wie im Debug-Schalter der App
//! auf stdout; Tokens nie. Die CEKs aus Schritt 5 stehen nur in der Freigabedatei.

#[cfg(not(debug_assertions))]
compile_error!("Der E2E-Treiber `e2e_lauf` existiert nur im Debug-Build: Er schreibt Inhaltsschlüssel in eine Datei.");

/// Nur, damit der Release-Build allein am `compile_error!` scheitert statt zusätzlich an
/// „`main` function not found“.
#[cfg(not(debug_assertions))]
fn main() {}

#[cfg(debug_assertions)]
fn main() {
    if let Err(fehler) = lauf::haupt() {
        println!("E2E FEHLER: {fehler}");
        std::process::exit(1);
    }
}

#[cfg(debug_assertions)]
mod lauf {
    use std::collections::BTreeMap;
    use std::io::Write;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::path::{Path, PathBuf};
    use std::process::{Command, ExitStatus};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, PoisonError};
    use std::thread::{self, JoinHandle};
    use std::time::{Duration, Instant};

    use einsatzbuch_kern::anmeldung::{self, Ziel};
    use einsatzbuch_kern::buch::Betrieb;
    use einsatzbuch_kern::erfassung::{Entwurf, PersonAuswahl, Versiegelung};
    use einsatzbuch_kern::format::Umgebung;
    use einsatzbuch_kern::tresor::konto_fuer;
    use einsatzbuch_kern::uhr::SystemUhr;
    use einsatzbuch_lib::befehle::{
        beende_testbetrieb, brich_anmeldung_ab, gib_schluessel_frei, gleiche_anker_jetzt, lies_bloecke, lies_stammdaten,
        lies_status, melde_an, pruefe_frist_jetzt, quittiere, richte_ein_ueber_suite, sende_ab,
    };
    use einsatzbuch_lib::netz::NetzTransport;
    use einsatzbuch_lib::schluesselbund;
    use einsatzbuch_lib::zustand::{Anbindungsteile, Zustand};
    use zeroize::Zeroizing;

    /// Takt der Frist-Uhr, wie `FRIST_TAKT` in `lib.rs` (Spec §4.3).
    const FRIST_TAKT: Duration = Duration::from_secs(15);
    /// So lange nach Fristende darf die Frist-Uhr brauchen, bevor der Treiber hilfsweise selbst prüft.
    const FRIST_NACHLAUF_MS: i64 = 35_000;
    /// Höchstens so lange wartet eine Pause auf ihre Markendatei.
    const PAUSE_HOECHSTENS: Duration = Duration::from_secs(15 * 60);
    /// Die Meldung, die nur der 401-Pfad von `gib_schluessel_frei` zusammen mit einer verworfenen
    /// Sitzung liefert (eine lokal abgelaufene Sitzung schließt Schritt 6 vorher aus).
    const SITZUNG_ABGELAUFEN: &str = "Die Sitzung ist abgelaufen. Bitte neu anmelden.";

    macro_rules! e2e {
        ($schritt:expr, $($arg:tt)*) => {{
            println!("E2E {}: {}", $schritt, format!($($arg)*));
            let _ = std::io::stdout().flush();
        }};
    }

    fn pruefe(bedingung: bool, text: impl FnOnce() -> String) -> Result<(), String> {
        if bedingung { Ok(()) } else { Err(text()) }
    }

    /// Wurzel des Repos (dort liegen `scripts/` und `node_modules`): drei Ebenen über `src-tauri`.
    fn repo_wurzel() -> Result<PathBuf, String> {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../..")
            .canonicalize()
            .map_err(|e| format!("Repo-Wurzel nicht gefunden: {e}"))
    }

    fn tsx(repo: &Path, argumente: &[&str]) -> Command {
        let mut befehl = Command::new("pnpm");
        befehl.args(["exec", "tsx"]).args(argumente).current_dir(repo);
        befehl
    }

    /// Das `oeffne` der Anmeldung: dieselbe Weiche wie `oeffne_anmelde_url` in `lib.rs`
    /// (`anmeldung::ziel`), dann das Playwright-Skript im Hintergrund. `oeffne` darf nicht
    /// blockieren: Die App wartet erst danach auf den Rückruf. Scheitert das Skript, bricht ein
    /// Wächterfaden die Anmeldung ab (`brich_anmeldung_ab`), statt fünf Minuten zu warten.
    struct Browser {
        z: Arc<Zustand>,
        repo: PathBuf,
        faden: Mutex<Option<JoinHandle<std::io::Result<ExitStatus>>>>,
    }

    impl Browser {
        fn oeffne(&self, url: &str) -> Result<(), String> {
            let schalter = std::env::var(anmeldung::STDOUT_SCHALTER).ok();
            match anmeldung::ziel(url, schalter.as_deref()) {
                Ziel::Stdout(zeile) => {
                    println!("{zeile}");
                    let _ = std::io::stdout().flush();
                }
                Ziel::Browser => return Err(format!("{} ist nicht gesetzt — der Treiber öffnet keinen Systembrowser.", anmeldung::STDOUT_SCHALTER)),
            }
            let mut kind = tsx(&self.repo, &["scripts/einsatzbuch-e2e-anmeldung.ts", url])
                .spawn()
                .map_err(|e| format!("Das Anmeldeskript ließ sich nicht starten: {e}"))?;
            let z = Arc::clone(&self.z);
            let faden = thread::spawn(move || {
                let status = kind.wait();
                if !matches!(&status, Ok(s) if s.success()) {
                    brich_anmeldung_ab(&z);
                }
                status
            });
            *self.faden.lock().unwrap_or_else(PoisonError::into_inner) = Some(faden);
            Ok(())
        }

        /// Wartet auf das Anmeldeskript des letzten `oeffne` und verlangt Erfolg.
        fn warte(&self) -> Result<(), String> {
            let faden = self.faden.lock().unwrap_or_else(PoisonError::into_inner).take().ok_or("Das Anmeldeskript wurde nie gestartet.")?;
            match faden.join() {
                Ok(Ok(status)) if status.success() => Ok(()),
                Ok(Ok(status)) => Err(format!("Das Anmeldeskript endete mit {status}.")),
                Ok(Err(e)) => Err(format!("Auf das Anmeldeskript ließ sich nicht warten: {e}")),
                Err(_) => Err("Der Wächter des Anmeldeskripts ist abgestürzt.".into()),
            }
        }

        /// Führt eine Anmeldung (`arbeit` ruft `oeffne`) samt Skript aus; beide müssen gelingen.
        fn mit<T>(&self, arbeit: impl FnOnce(&dyn Fn(&str) -> Result<(), String>) -> Result<T, String>) -> Result<T, String> {
            let ergebnis = arbeit(&|url| self.oeffne(url));
            let skript = self.warte();
            match (ergebnis, skript) {
                (Ok(wert), Ok(())) => Ok(wert),
                (Ok(_), Err(s)) => Err(s),
                (Err(e), Ok(())) => Err(e),
                (Err(e), Err(s)) => Err(format!("{e} ({s})")),
            }
        }
    }

    /// Wartet, bis der Controller `touch <marke>` ausführt (Datenbankabfragen der Suite).
    fn pause(steuerung: &Path, schritt: u8, wozu: &str) -> Result<(), String> {
        let marke = steuerung.join(format!("weiter-{schritt}"));
        e2e!(schritt, "Pause ({wozu}) — weiter mit: touch {}", marke.display());
        let ende = Instant::now() + PAUSE_HOECHSTENS;
        while !marke.exists() {
            pruefe(Instant::now() < ende, || format!("Pause nach Schritt {schritt}: keine Marke binnen {} min", PAUSE_HOECHSTENS.as_secs() / 60))?;
            thread::sleep(Duration::from_millis(500));
        }
        let _ = std::fs::remove_file(&marke);
        e2e!(schritt, "weiter");
        Ok(())
    }

    /// Die Frist-Uhr der App (`starte_frist_uhr` in `lib.rs`) ohne `AppHandle`: alle 15 s
    /// `Zustand::pruefe_frist`, Fehler und Panik beenden den Faden nicht.
    fn starte_frist_uhr(z: Arc<Zustand>, halt: Arc<AtomicBool>) -> JoinHandle<()> {
        thread::spawn(move || {
            while !halt.load(Ordering::SeqCst) {
                let takt_ende = Instant::now() + FRIST_TAKT;
                while Instant::now() < takt_ende {
                    if halt.load(Ordering::SeqCst) {
                        return;
                    }
                    thread::sleep(Duration::from_millis(200));
                }
                match catch_unwind(AssertUnwindSafe(|| z.pruefe_frist())) {
                    Ok(Ok(Some(v))) => e2e!(3, "Frist-Uhr hat Block {} versiegelt ({})", v.block, v.nummer),
                    Ok(Ok(None)) => {}
                    Ok(Err(fehler)) => e2e!(3, "Frist-Prüfung fehlgeschlagen: {fehler}"),
                    Err(_) => e2e!(3, "Frist-Prüfung abgebrochen (Panik), die nächste Runde prüft erneut"),
                }
            }
        })
    }

    fn rechner_id(z: &Zustand) -> Result<String, String> {
        let buch = z.buch();
        let offen = buch.as_ref().ok_or("Kein Buch offen.")?;
        let anbindung = offen.anbindung().map_err(|e| e.to_string())?.ok_or("Keine Anbindung im Buch.")?;
        Ok(anbindung.rechner_id)
    }

    pub fn haupt() -> Result<(), String> {
        // Schritt 1 ---------------------------------------------------------------------------
        let suite = std::env::var("E2E_SUITE_URL").map_err(|_| "E2E_SUITE_URL fehlt (z. B. http://einsatzbuch.localtest.me:4230).")?;
        let name = std::env::var("E2E_RECHNER_NAME").unwrap_or_else(|_| "E2E-Lauf".into());
        let ordner = std::env::temp_dir().join("einsatzbuch-e2e");
        let steuerung = std::env::temp_dir().join("einsatzbuch-e2e-steuerung");
        let freigabe_datei =
            std::env::var_os("E2E_FREIGABE_DATEI").map(PathBuf::from).unwrap_or_else(|| steuerung.join("freigabe.json"));
        let repo = repo_wurzel()?;

        // SAFETY: Noch läuft kein weiterer Faden dieses Prozesses (Zustand, Frist-Uhr und
        // Wächter entstehen erst danach), niemand liest die Umgebung gleichzeitig.
        unsafe { std::env::set_var(anmeldung::STDOUT_SCHALTER, "1") };

        for d in [&ordner, &steuerung] {
            if d.exists() {
                std::fs::remove_dir_all(d).map_err(|e| format!("{} ließ sich nicht leeren: {e}", d.display()))?;
            }
            std::fs::create_dir_all(d).map_err(|e| format!("{} ließ sich nicht anlegen: {e}", d.display()))?;
        }

        let teile = Anbindungsteile { transport: Box::new(NetzTransport::neu()), tresor: schluesselbund::system_tresor() };
        let z = Arc::new(Zustand::beim_start(ordner.clone(), Box::new(SystemUhr), teile));
        let konto = konto_fuer(Betrieb::Test);
        // Nie einen fremden Eintrag überschreiben und später löschen: Ein Testbetrieb eines
        // installierten oder Entwickler-Einsatzbuchs nutzt dasselbe Konto.
        pruefe(z.tresor.lies(konto)?.is_none(), || {
            format!("Im Schlüsselbund liegt schon „{konto}“ unter {} — Lauf abgebrochen, nichts verändert.", schluesselbund::DIENST)
        })?;
        let s = lies_status(&z)?;
        pruefe(!s.eingerichtet && s.startfehler.is_none(), || format!("Ordner nicht leer: {s:?}"))?;
        e2e!(
            1,
            "Zustand angelegt — Ordner {}, NetzTransport (ureq), Schlüsselbund {} (Konto {konto} leer), SystemUhr, {}=1, Suite {suite}",
            ordner.display(),
            schluesselbund::DIENST,
            anmeldung::STDOUT_SCHALTER
        );

        let browser = Browser { z: Arc::clone(&z), repo: repo.clone(), faden: Mutex::new(None) };
        let halt = Arc::new(AtomicBool::new(false));
        let ergebnis = schritte(&z, &browser, &halt, &Lauf { suite: &suite, name: &name, steuerung: &steuerung, freigabe_datei: &freigabe_datei, repo: &repo });
        halt.store(true, Ordering::SeqCst);
        let _ = std::fs::remove_file(&freigabe_datei);

        if let Err(fehler) = &ergebnis {
            e2e!("Aufräumen", "Lauf gescheitert ({fehler}) — beende den Testbetrieb trotzdem");
            if z.buch().is_some() {
                if let Err(e) = beende_testbetrieb(&z) {
                    e2e!("Aufräumen", "beende_testbetrieb: {e}");
                }
            }
            if let Err(e) = z.tresor.loesche(konto) {
                e2e!("Aufräumen", "Schlüsselbund: {e}");
            }
        }
        let rest = z.tresor.lies(konto)?.is_some();
        e2e!("Ende", "Schlüsselbund-Eintrag „{konto}“ {}", if rest { "LIEGT NOCH DA" } else { "ist weg" });
        ergebnis?;
        pruefe(!rest, || format!("Nach dem Lauf liegt „{konto}“ noch im Schlüsselbund."))?;
        e2e!("Ende", "alle Schritte bestanden");
        Ok(())
    }

    struct Lauf<'a> {
        suite: &'a str,
        name: &'a str,
        steuerung: &'a Path,
        freigabe_datei: &'a Path,
        repo: &'a Path,
    }

    fn schritte(z: &Arc<Zustand>, browser: &Browser, halt: &Arc<AtomicBool>, l: &Lauf<'_>) -> Result<(), String> {
        // Schritt 2: Einrichtung über die Suite ---------------------------------------------------
        e2e!(2, "richte_ein_ueber_suite(Test, „{}“, {})", l.name, l.suite);
        let start = Instant::now();
        let ergebnis = browser.mit(|oeffne| richte_ein_ueber_suite(z, Umgebung::Test, l.name, l.suite, oeffne))?;
        let s = lies_status(z)?;
        pruefe(s.betrieb == Some(Betrieb::Test) && s.eingerichtet, || format!("nicht im Testbetrieb eingerichtet: {:?}", s.betrieb))?;
        pruefe(s.rechner_name.as_deref() == Some(l.name), || format!("Rechnername {:?}", s.rechner_name))?;
        pruefe(s.sitzung.is_some(), || "nach der Einrichtung keine Sitzung".into())?;
        pruefe(s.frist_minuten == Some(1), || format!("Frist steht auf {:?} min, erwartet 1 — in der Suite vorher setzen", s.frist_minuten))?;
        pruefe(z.tresor.lies(konto_fuer(Betrieb::Test))?.is_some(), || "kein Geräte-Token im Schlüsselbund".into())?;
        e2e!(
            2,
            "eingerichtet in {:.1} s (echt: {}) — Rechner {}, Schlüssel {}, Frist {} min, Bereitschaft {:?}, Sitzung für {:?}; Geräte-Token im Schlüsselbund",
            start.elapsed().as_secs_f32(),
            ergebnis.echt,
            rechner_id(z)?,
            s.schluessel_id.as_deref().unwrap_or("?"),
            s.frist_minuten.unwrap_or(0),
            s.bereitschaft.as_deref().unwrap_or(""),
            s.sitzung.as_ref().map(|i| i.name.as_str()).unwrap_or("")
        );

        // Schritt 3: ein Einsatz, versiegelt von der Frist-Uhr --------------------------------------
        let paket = lies_stammdaten(z)?;
        let fahrzeug = paket.stammdaten.fahrzeuge.first().ok_or("Das Paket hat keine Fahrzeuge (Seed fehlt?).")?;
        let person = paket.stammdaten.personal.first().ok_or("Das Paket hat kein Personal (Seed fehlt?).")?;
        let stichwort =
            paket.stammdaten.stichworte.iter().flat_map(|g| g.items.iter()).next().cloned().unwrap_or_else(|| "E2E".into());
        let jetzt = chrono::Local::now();
        let entwurf = Entwurf {
            stichwort: stichwort.clone(),
            beginn_datum: jetzt.format("%Y-%m-%d").to_string(),
            beginn_zeit: jetzt.format("%H:%M").to_string(),
            ende_datum: String::new(),
            ende_zeit: String::new(),
            strasse: String::new(),
            ort: if fahrzeug.standort.trim().is_empty() { "Uelzen".into() } else { fahrzeug.standort.clone() },
            objekt: String::new(),
            fahrzeuge: vec![fahrzeug.id.clone()],
            personal: vec![PersonAuswahl { id: person.id.clone(), fahrzeug_id: Some(fahrzeug.id.clone()) }],
            vor_ort: 1,
            transport: 0,
            notizen: "Ende-zu-Ende-Lauf Stufe 5".into(),
        };
        let aus = sende_ab(z, &entwurf, false)?;
        e2e!(
            3,
            "sende_ab: Stichwort „{stichwort}“, Fahrzeug {} ({}), Person {} — abgesendet {}, Frist bis {}",
            fahrzeug.kennung,
            fahrzeug.id,
            person.id,
            aus.abgesendet_am,
            aus.frist_bis
        );
        let uhr = starte_frist_uhr(Arc::clone(z), Arc::clone(halt));
        let frist_ende = aus.frist_bis_ms + FRIST_NACHLAUF_MS;
        while z.unquittiert().is_none() && chrono::Utc::now().timestamp_millis() < frist_ende {
            thread::sleep(Duration::from_millis(500));
        }
        // Erst in eine Variable: Im `match` lebte der Guard bis zum Ende, und `pruefe_frist_jetzt`
        // nimmt denselben Mutex (`unquittiert`) — das wäre ein Selbst-Deadlock.
        let gesehen = z.unquittiert().clone();
        let versiegelung: Versiegelung = match gesehen {
            Some(v) => v,
            None => {
                e2e!(3, "Frist-Uhr hat bis Fristende + {} s nicht versiegelt — hilfsweise pruefe_frist_jetzt", FRIST_NACHLAUF_MS / 1000);
                pruefe_frist_jetzt(z)?.ok_or("Auch pruefe_frist_jetzt hat nichts versiegelt.")?
            }
        };
        quittiere(z);
        halt.store(true, Ordering::SeqCst);
        let _ = uhr.join();
        pruefe(versiegelung.block == 1 && !versiegelung.verfallen, || format!("unerwartete Versiegelung: {versiegelung:?}"))?;
        e2e!(
            3,
            "versiegelt: Block {}, Nummer {}, versiegelt {}, Hash {}",
            versiegelung.block,
            versiegelung.nummer,
            versiegelung.versiegelt,
            versiegelung.hash
        );

        // Schritt 4: Anker ------------------------------------------------------------------------
        let stand = gleiche_anker_jetzt(z)?;
        pruefe(
            stand.bestaetigt_bis == 1 && !stand.offline && !stand.widerrufen && stand.abweichung.is_none(),
            || format!("Ankerstand {stand:?}"),
        )?;
        pruefe(stand.hash.as_deref() == Some(versiegelung.hash.as_str()), || format!("Anker-Hash {:?} ≠ {}", stand.hash, versiegelung.hash))?;
        e2e!(4, "Anker bestätigt bis Block {} (Hash {}, gemeldet {})", stand.bestaetigt_bis, versiegelung.hash, stand.gemeldet_am.as_deref().unwrap_or("?"));
        pause(l.steuerung, 4, "Suite-DB: anker, schluesselpaar")?;

        // Schritt 5: Verwaltungsanmeldung, Freigabe, Entschlüsseln ---------------------------------
        melde_ab_vor_neuer_anmeldung(z);
        let info = browser.mit(|oeffne| melde_an(z, oeffne))?;
        let gebunden = z.sitzung().as_ref().and_then(|s| s.rechner_id.clone());
        let eigene = rechner_id(z)?;
        pruefe(gebunden.as_deref() == Some(eigene.as_str()), || format!("Sitzung gebunden an {gebunden:?}, Rechner ist {eigene}"))?;
        e2e!(5, "melde_an: Sitzung für „{}“, gebunden an Rechner {eigene} (Geräte-Token im Tausch)", info.name);

        let posten = gib_schluessel_frei(z)?;
        let bloecke = lies_bloecke(z)?;
        pruefe(posten.len() == 1 && posten[0].block == 1 && bloecke.len() == 1, || {
            format!("{} Schlüsselposten für {} Blöcke", posten.len(), bloecke.len())
        })?;
        e2e!(5, "gib_schluessel_frei: {} CEK(s) für Block(e) {:?}", posten.len(), posten.iter().map(|p| p.block).collect::<Vec<_>>());
        let schluessel: BTreeMap<String, &str> = posten.iter().map(|p| (p.block.to_string(), p.cek.as_str())).collect();
        let json = Zeroizing::new(
            serde_json::to_string(&serde_json::json!({ "bloecke": bloecke, "schluessel": schluessel }))
                .map_err(|e| e.to_string())?,
        );
        drop(posten);
        std::fs::write(l.freigabe_datei, json.as_bytes()).map_err(|e| format!("Freigabedatei: {e}"))?;
        drop(json);
        let freigabe = l.freigabe_datei.to_str().ok_or("Pfad der Freigabedatei ist kein UTF-8")?;
        let ausgabe = tsx(l.repo, &["scripts/einsatzbuch-e2e-oeffnen.ts", freigabe]).output();
        let _ = std::fs::remove_file(l.freigabe_datei);
        let ausgabe = ausgabe.map_err(|e| format!("Entschlüssel-Skript: {e}"))?;
        let text = String::from_utf8_lossy(&ausgabe.stdout);
        for zeile in text.lines().chain(String::from_utf8_lossy(&ausgabe.stderr).lines()) {
            e2e!(5, "oeffnen │ {zeile}");
        }
        pruefe(ausgabe.status.success(), || format!("Entschlüssel-Skript endete mit {}", ausgabe.status))?;
        let erwartet = format!("nummer={} stichwort={stichwort}", versiegelung.nummer);
        pruefe(text.contains(&erwartet), || format!("Ausgabe enthält nicht „{erwartet}“"))?;
        e2e!(5, "entschlüsselt mit oeffneBlock: {erwartet}; Freigabedatei gelöscht");

        // Schritt 6: Test-Rechner in der Suite löschen, Freigabe muss scheitern ---------------------
        let jetzt_ms = chrono::Utc::now().timestamp_millis();
        pruefe(z.sitzung().as_ref().is_some_and(|s| s.ablauf_ms > jetzt_ms), || "vor Schritt 6 keine gültige Sitzung".into())?;
        let status = tsx(l.repo, &["scripts/einsatzbuch-e2e-anmeldung.ts", "--loeschen", l.suite, l.name])
            .status()
            .map_err(|e| format!("Löschskript: {e}"))?;
        pruefe(status.success(), || format!("Löschskript endete mit {status}"))?;
        match gib_schluessel_frei(z) {
            Ok(p) => return Err(format!("gib_schluessel_frei nach dem Löschen gab {} Schlüssel frei", p.len())),
            Err(text) => {
                pruefe(text == SITZUNG_ABGELAUFEN, || format!("unerwartete Meldung: {text}"))?;
                pruefe(z.sitzung().is_none(), || "die Sitzung wurde nach der 401 nicht verworfen".into())?;
                e2e!(6, "gib_schluessel_frei scheitert: „{text}“ — die Suite kennt die Sitzung nicht mehr (401), Rust hat sie verworfen");
            }
        }
        pause(l.steuerung, 6, "Suite-DB: anker, sitzung, schluesselpaar leer für diesen Rechner")?;

        // Schritt 7: Testbetrieb beenden -------------------------------------------------------------
        beende_testbetrieb(z)?;
        let datei = z.ordner.join(Betrieb::Test.datei());
        pruefe(!datei.exists(), || format!("{} liegt noch", datei.display()))?;
        pruefe(z.tresor.lies(konto_fuer(Betrieb::Test))?.is_none(), || "Geräte-Token liegt noch im Schlüsselbund".into())?;
        pruefe(!lies_status(z)?.eingerichtet, || "nach dem Beenden noch eingerichtet".into())?;
        e2e!(7, "beende_testbetrieb: {} gelöscht, Geräte-Token aus dem Schlüsselbund entfernt, Rechner nicht eingerichtet", datei.display());
        Ok(())
    }

    /// Die Sitzung der Einrichtung besteht nach Schritt 2 fort (Entscheidung 2). Schritt 5 prüft
    /// die Verwaltungsanmeldung mit dem Geräte-Token, deshalb erst sperren — wie „Sitzung sperren“
    /// in der Oberfläche (`melde_ab`, Entscheidung 9).
    fn melde_ab_vor_neuer_anmeldung(z: &Zustand) {
        einsatzbuch_lib::befehle::melde_ab(z);
        e2e!(5, "melde_ab: Sitzung der Einrichtung gesperrt, neue Anmeldung als Verwaltung");
    }
}
