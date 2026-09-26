# Einsatzbuch v2 — Stufe 7: Auslieferung mit Updater — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Desktop-App wird aus einem Tag `einsatzbuch-vX.Y.Z` für Windows (NSIS) und macOS (DMG, universal) gebaut, signiert und als GitHub-Release veröffentlicht. Der eingebaute Updater findet neue Versionen über ein Dauer-Release `einsatzbuch-updater` und installiert sie nur in einem ruhigen Moment. Ein Runbook beschreibt Schlüssel, Release, Installation, Einrichtung, Update und Rücksetzen, und das Portal bekommt eine Release-Notiz.

**Architecture:**
- **Hülle (`T`):**
  - `tauri-plugin-updater`, registriert nur im Release-Build und nur aus Rust benutzt, ohne Capability.
  - Ein Updater-Thread prüft beim Start und alle 6 Stunden. Die Installationsregel ist eine reine, getestete Funktion.
  - Neustart über `AppHandle::restart()` (Tauri-Kern).
- **Build:**
  - Der öffentliche Minisign-Schlüssel steht als gekennzeichneter Platzhalter in `tauri.conf.json`.
  - `build.rs` bricht einen Release-Build mit Platzhalter ab. Die Prüfung ist eine getestete Funktion in einer eigenen Datei.
  - `createUpdaterArtifacts` steht nur in einem Overlay `tauri.release.conf.json`, das allein der Release-Workflow nutzt.
- **CI:** `.github/workflows/einsatzbuch.yml` bekommt den Tag-Auslöser und zwei Release-Jobs (bauen je Plattform, veröffentlichen). `latest.json` baut ein getestetes Skript.
- **Doku:** Runbook `docs/runbooks/einsatzbuch-release.md`, Release-Notiz im Portal.

**Spec:** `R/docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md`, §4.8, §11 (Stufe 7, Versionierung), §12.

**Ticket:** DRK-471. Kein ClickUp in dieser Phase.

**Arbeitskopie:** `R` = `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-auslieferung`, Branch `claude/einsatzbuch-v2-stufe-7`, abgezweigt vom Kopf von `claude/einsatzbuch-v2-stufe-6-7` (Stufe 6). Die PR-Basis ist dieser Branch. Abkürzungen wie in Stufe 6 (`M`, `K`, `A`, `T`, `KR`).

## Global Constraints

Alle Regeln aus Stufe 6 (`…-stufe-6-sicherung-export.md`, „Global Constraints“) gelten. Dazu:

- **Keine Tags pushen, keine Releases anlegen, keine Secrets setzen, keinen Schlüssel erzeugen.** Das tut der Betreiber nach Runbook. Der Workflow wird nur per `actionlint` und per Test des `latest.json`-Skripts geprüft.
- **Kein `ring`:**
  - `tauri-plugin-updater` bringt `reqwest` mit, dessen Vorgabe rustls ist. Deshalb `default-features = false` und das Merkmal für native TLS. Den Namen im `Cargo.toml` des Plugins aus `~/.cargo/registry` ablesen, nicht raten.
  - Danach `grep -nE '^name = "(ring|aws-lc-rs|aws-lc-sys|rustls)"' T/Cargo.lock` → leer.
  - Scheitert das, weil das Plugin rustls fest verdrahtet: hier anhalten und an den Koordinator melden. Nicht umgehen.
- **Die Suite-CI (`.github/workflows/ci.yml`) bleibt unberührt.**
- **`tauri build --debug` muss ohne privaten Schlüssel weiterlaufen**, ein Release-Build mit Platzhalter muss mit klarer Meldung scheitern. Einen Release-Build mit echtem Schlüssel erzwingt niemand.

## Review Focus

1. **Kein stilles Update mitten in der Arbeit:** Installiert wird nur, wenn nichts `ausstehend` ist, keine Sitzung offen ist und keine Anmeldung läuft. Sonst bleibt das Update vorgemerkt, und die Regel wird jede Minute neu geprüft (Task 1).
2. **Platzhalter kann nicht ausgeliefert werden:** `build.rs` im Release-Profil und ein Schritt im Workflow lehnen den Platzhalter ab. Die Meldung nennt das Runbook (Task 1, Task 2).
3. **„Latest“ bleibt der Suite:** Beide Releases (`einsatzbuch-vX.Y.Z` und `einsatzbuch-updater`) werden mit `--latest=false` angelegt. `latest.json` wird am Dauer-Release per `--clobber` ersetzt (Task 2).
4. **Suite-Versionierung unberührt:** `scripts/version.mjs` zählt weder `einsatzbuch-v*` noch `einsatzbuch-updater`. Belegt per Test (Task 2).
5. **Versionen stimmen überein:** Tag, `tauri.conf.json`, `A/package.json` und `T/Cargo.toml` tragen dieselbe Version. Das prüfen ein Test und der Workflow (Task 3).

---

## Entscheidungen, wo die Spec offen ist

1. **Updater nur im Release-Build** (`cfg(not(debug_assertions))`). Entwicklerläufe fragen nie bei GitHub nach und brauchen keinen gültigen Schlüssel. Die Oberfläche braucht keinen Updater-Befehl; der Status meldet ein vorgemerktes Update.
2. **Herunterladen erst beim Installieren** (`download_and_install`). Ein vorgemerktes Update hält nur die Metadaten.
   - Nach dem Installieren folgt `AppHandle::restart()`. Unter Windows beendet der NSIS-Installer die App selbst (`installMode: "passive"`).
   - Ein Fehler beim Prüfen oder Installieren geht ins Log, und die nächste Runde versucht es erneut.
3. **Plattformen:**
   - Windows x64 mit NSIS; MSI entfällt, denn WiX brauchte eigene Versionsregeln und brächte nichts dazu.
   - macOS als ein universelles Bundle (`--target universal-apple-darwin`), DMG für die Erstinstallation, `.app.tar.gz` für den Updater.
   - `latest.json` führt `darwin-aarch64`, `darwin-x86_64` (beide auf das universelle Archiv) und `windows-x86_64`.
4. **Ablauf des Workflows bei einem Tag:**
   - Die bestehenden Jobs laufen mit, denn GitHub wertet `paths` bei Tag-Pushes nicht aus. **Das ist in der GitHub-Doku zu belegen und im Kommentar zu zitieren.**
   - Die Release-Jobs hängen per `needs` an `oberflaeche`, `rust-kern` und `desktop`.
   - `concurrency` nimmt bei Tags den Ref in den Schlüssel, damit ein Main-Push und ein Tag derselben SHA sich nicht gegenseitig verdrängen.
5. **Suite-Adresse im Release-Build:** `EINSATZBUCH_SUITE_URL` kommt aus der Repository-Variable `vars.EINSATZBUCH_SUITE_URL`, Rückfall `https://einsatzbuch.iuk-ue.de`, die Vorgabe in `KR/src/anmeldung.rs` (`SUITE_VORGABE`). Der Workflow lehnt einen leeren Wert ab.
6. **Version bleibt `0.1.0`.** Die erste Release-Version setzt der Betreiber nach Runbook. Die Stufe erhöht keine Version ohne Release.
7. **Release-Notiz:** Das Modul steht im Umschalter (`showInSwitcher: true`, `R/src/core/registry.ts`), die gemeinsame Regel verbietet die Notiz also nicht. Eine Notiz unter `einsatzbuch/`, Datum `2026-09-25`, beschreibt App und Seite „Rechner“ für die Verwaltung.

---

## Dateistruktur

- `T/Cargo.toml`, `T/Cargo.lock`: `tauri-plugin-updater` (ohne rustls); `version` gleich `tauri.conf.json`.
- `T/src/updater.rs` (neu): Regel, Thread, Vormerkung. `T/src/lib.rs`, `T/src/zustand.rs` (Vormerkung als Blatt-Mutex), `T/src/befehle.rs` (`Status.update`).
- `T/build.rs` + `T/build_pruefung.rs` (neu, reine Funktion, in `build.rs` per `#[path]` eingebunden und in `T/src/updater.rs` bzw. einem Testmodul mitgetestet).
- `T/tauri.conf.json`: `plugins.updater` (Platzhalter, Endpunkt, `windows.installMode`). `T/tauri.release.conf.json` (neu): `bundle.createUpdaterArtifacts: true`.
- `A/src/typen.ts`, `A/src/seiten/Verwaltung.tsx` oder `A/src/verwaltung/Einstellungen.tsx`: Hinweis „Update auf X vorgemerkt …“.
- `.github/workflows/einsatzbuch.yml`.
- `R/scripts/einsatzbuch-updater-json.mjs` + `R/scripts/einsatzbuch-updater-json.test.ts` (neu); `R/scripts/version.test.ts` (erweitert).
- `A/src/version.test.ts` (neu) oder gleichwertig: Versionsgleichheit.
- `R/docs/runbooks/einsatzbuch-release.md` (neu).
- `M/../portal/_lib/neuigkeiten/notizen/einsatzbuch/2026-09-25-einsatzbuch-rechner.ts` (neu) + Zeile in `register.ts`.

---

### Task 1: Updater in der Hülle, Platzhalter-Riegel, Release-Overlay

**Interfaces:**
- `updater::Lage { ausstehend: bool, sitzung: bool, anmeldung_laeuft: bool }`, `updater::darf_installieren(&Lage) -> bool`.
- `updater::lage(z: &Zustand) -> Lage`: Buch unter kurzem Lock, danach die Blätter.
- `Zustand.update: Mutex<Option<Vorgemerkt { version: String }>>` (Blatt). `Status.update: Option<String>` (Version).
- `build_pruefung::pruefe_updater_schluessel(conf: &str, profil: &str) -> Result<(), String>`: Im Profil `release` scheitert sie, wenn `plugins.updater.pubkey` fehlt oder mit `PLATZHALTER` beginnt. Die Meldung: „Der Updater-Schlüssel in tauri.conf.json ist noch ein Platzhalter. Erzeuge ihn nach docs/runbooks/einsatzbuch-release.md (Abschnitt „Updater-Schlüssel“) und trage den öffentlichen Teil ein.“
- Platzhalter in `tauri.conf.json`: `"pubkey": "PLATZHALTER — öffentlichen Minisign-Schlüssel nach docs/runbooks/einsatzbuch-release.md eintragen"`, `"endpoints": ["https://github.com/rubenvitt/iuk-suite/releases/download/einsatzbuch-updater/latest.json"]`, `"windows": { "installMode": "passive" }`.

- [ ] **Step 1: Failing tests:**
  - `darf_installieren`: alle acht Kombinationen, wahr nur bei `false/false/false`.
  - `pruefe_updater_schluessel`:
    - Platzhalter plus `release` → Fehler mit Runbook-Pfad;
    - Platzhalter plus `debug` → ok;
    - echter Base64-Wert plus `release` → ok;
    - fehlender Schlüssel plus `release` → Fehler.
  - `lies_status` meldet ein vorgemerktes Update.
  - Ein Test liest die echte `T/tauri.conf.json` und stellt fest, dass sie heute den Platzhalter trägt: Er schlägt an, sobald jemand den Platzhalter ohne Runbook entfernt.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Umsetzen:**
  - Der Thread läuft nur im Release-Build: erste Prüfung kurz nach dem Start, danach alle 6 h (`Duration::from_secs(6 * 60 * 60)`). Dazwischen jede Minute `darf_installieren`, solange etwas vorgemerkt ist.
  - `tauri::async_runtime::block_on` bzw. `spawn` für die asynchrone Updater-API, im Stil von `abgleich.rs`, mit gefangener Panik.
  - `build.rs` liest `tauri.conf.json`, ruft die Prüfung mit `std::env::var("PROFILE")` und `panic!`t mit der Meldung. `cargo:rerun-if-changed=tauri.conf.json` setzen.
  - `tauri.release.conf.json` anlegen.
  - Oberfläche: Hinweis in der Karte „Einstellungen“, etwa „Update auf 0.2.0 ist vorgemerkt. Es wird installiert, sobald kein Einsatz aussteht und niemand angemeldet ist.“
- [ ] **Step 4: Belege** (in `<scratchpad>/stufe7-belege.md`):
  - `pnpm --filter einsatzbuch tauri build --debug --bundles app` → Exit 0.
  - `mise exec -- cargo build --release -p einsatzbuch` in `T` → Exit ≠ 0 mit der Meldung im Log.
  - Dazu `cargo test --workspace` und `clippy`, die App-Tore und `grep` auf `ring`/`rustls` im Lockfile.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Updater prüft beim Start und alle 6 Stunden`.

### Task 2: Workflow, `latest.json`, Suite-Versionierung

**Interfaces:**
- `scripts/einsatzbuch-updater-json.mjs`:
  - `baueLatestJson({ version, notes, pubDate, repo, tag, assets: { mac: { datei, signatur }, windows: { datei, signatur } } })` gibt ein Objekt im Tauri-2-Format zurück: `version`, `notes`, `pub_date`, `platforms` mit `signature`/`url`.
  - URLs: `https://github.com/<repo>/releases/download/<tag>/<datei>`, Dateinamen URL-kodiert.
  - CLI: `node scripts/einsatzbuch-updater-json.mjs --version … --tag … --mac-archiv … --mac-sig … --win-installer … --win-sig … > latest.json`.

- [ ] **Step 1: Failing tests:**
  - `einsatzbuch-updater-json.test.ts`: Form, drei Plattformen, URL-Kodierung, eine fehlende Signatur ist ein Fehler, `version` ohne `v`-Präfix.
  - `version.test.ts`: Die Tags `einsatzbuch-v1.0.0` und `einsatzbuch-updater` auf der First-Parent-Kette ändern die berechnete Suite-Version nicht (vorhandenen Test-Aufbau mit Temp-Repo nutzen), und `parseTag` lehnt beide ab.
- [ ] **Step 2:** FAIL. **Step 3:** Skript umsetzen.
- [ ] **Step 4: Workflow erweitern:**
  - `on.push.tags: ["einsatzbuch-v*"]` neben `branches: [main]`. Kopfkommentar nachziehen.
  - `concurrency.group`: bei Tags `github.ref`, sonst wie bisher.
  - Job `release-bauen` (Matrix `macos-latest`/`windows-latest`, `if: startsWith(github.ref, 'refs/tags/einsatzbuch-v')`, `needs: [oberflaeche, rust-kern, desktop]`, `permissions: contents: read`):
    1. Checkout mit LFS und Icon-Prüfung.
    2. Versionsprüfung: Tag ohne Präfix gleich `tauri.conf.json`, `package.json` und `Cargo.toml`.
    3. Platzhalter-Prüfung mit `::error::` und Runbook-Verweis.
    4. pnpm, Node und gepinnte Rust-Toolchain; auf macOS `targets: aarch64-apple-darwin,x86_64-apple-darwin`.
    5. `pnpm --filter einsatzbuch tauri build --config src-tauri/tauri.release.conf.json` mit `--target universal-apple-darwin --bundles app,dmg` bzw. `--bundles nsis`.
    6. `env`: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` aus Secrets, `EINSATZBUCH_SUITE_URL`; eine leere Variable scheitert.
    7. Artefakte hochladen: DMG, `.app.tar.gz` + `.sig`, `*-setup.exe` + `.sig`.
  - Job `release-veroeffentlichen` (`needs: release-bauen`, `permissions: contents: write`, ubuntu):
    1. Artefakte laden und `latest.json` per Skript bauen.
    2. `gh release create "$GITHUB_REF_NAME" --verify-tag --latest=false --title "Einsatzbuch $VERSION" --notes …` mit allen Dateien plus `latest.json`.
    3. Dauer-Release: `gh release view einsatzbuch-updater` oder beim ersten Mal `gh release create einsatzbuch-updater --latest=false --title "Einsatzbuch-Updater" --notes "Dauer-Release für den Updater der Desktop-App. Nicht löschen."`.
    4. `gh release upload einsatzbuch-updater latest.json --clobber`.
- [ ] **Step 5:** `actionlint` (per `mise exec actionlint@latest -- actionlint` oder `go run github.com/rhysd/actionlint/cmd/actionlint@latest`) auf die Workflow-Datei → Exit 0; Ausgabe in die Belege. Dazu `pnpm vitest run scripts/einsatzbuch-updater-json.test.ts scripts/version.test.ts`.
- [ ] **Step 6:** Commit `ci(einsatzbuch): Release-Build und Updater-Manifest aus einsatzbuch-v*-Tags`.

### Task 3: Versionsgleichheit, Runbook, Release-Notiz

- [ ] **Step 1: Failing tests:**
  - Versionsgleichheit `tauri.conf.json` = `A/package.json` = `T/Cargo.toml` (Vitest in `A`, liest die drei Dateien).
  - Die Release-Notiz besteht `register.test.ts` (Stil, Grenzen, Modul in der Registry).
- [ ] **Step 2: Runbook** `docs/runbooks/einsatzbuch-release.md` mit den Abschnitten:
  1. Überblick: Welche Releases es gibt und warum `einsatzbuch-updater` nie gelöscht wird.
  2. Updater-Schlüssel: `pnpm --filter einsatzbuch tauri signer generate -w ~/.tauri/einsatzbuch.key`. Den öffentlichen Teil in `tauri.conf.json` eintragen (PR). Privaten Schlüssel und Kennwort als Secrets `TAURI_SIGNING_PRIVATE_KEY` und `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ablegen (`gh secret set …`). Den Schlüssel im Tresor aufbewahren, und was bei Verlust passiert: Installierte Apps nehmen keine Updates mehr an, eine Neuinstallation ist nötig.
  3. Suite-Adresse: Repository-Variable `EINSATZBUCH_SUITE_URL`.
  4. Release taggen: Version in drei Dateien erhöhen (PR), nach dem Merge `git tag einsatzbuch-vX.Y.Z <sha> && git push origin einsatzbuch-vX.Y.Z`, den Lauf beobachten und prüfen, dass „Latest“ weiterhin das Suite-Release ist.
  5. Installation Windows: SmartScreen „Der Computer wurde durch Windows geschützt“ → „Weitere Informationen“ → „Trotzdem ausführen“.
  6. Installation macOS: Gatekeeper → DMG öffnen, App nach „Programme“ ziehen. Beim ersten Öffnen erscheint die Warnung; dann Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“ (ab macOS 15 nicht mehr per Rechtsklick).
  7. Einrichtung als echter Rechner bzw. Testrechner: Einrichtungsfrage, Anmeldung in der Suite, Ersetzen-Frage, Autostart, Sicherungsordner wählen.
  8. Update: automatisch beim Start und alle 6 h, installiert erst ohne ausstehenden Einsatz und ohne Anmeldung; manuell durch Neustart erzwingen.
  9. Rücksetzen: ein älteres Release über den Installer installieren (der Updater springt dann wieder auf das neueste); `latest.json` des Dauer-Release auf eine ältere Version zurücksetzen (`gh release upload … --clobber`); Testbetrieb beenden; echte Einrichtung nach Widerruf; Wiederherstellen aus der Sicherung (Verweis auf die Verwaltung).
- [ ] **Step 3: Release-Notiz** (ein Absatz, Du-Form, Wörter vom Bildschirm, ohne Datei-, Funktions- oder Ticketnamen, ohne Markdown). Etwa: Die Desktop-App des Einsatzbuchs gibt es jetzt zum Installieren für Windows und macOS; sie aktualisiert sich selbst. Unter „Rechner“ siehst du, wann der Rechner zuletzt gesichert und Kontakt hatte, und kannst Test-Rechner löschen. Den genauen Text prüft `register.test.ts`.
- [ ] **Step 4:** Suite-Tore und App-Tore.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Runbook für Release und Installation, Notiz im Portal`. `feat`, weil dieser Commit die Auslieferung für Anwender abschließt und die Notiz laut `CLAUDE.md` im selben Commit wie das Feature steht.

### Task 4: Schluss — Tore, Gesamtreview, PR

- [ ] Volle Tore wie Stufe 6, Task 12, dazu `actionlint`.
- [ ] Review über den Diff der Stufe, eine Fix-Runde.
- [ ] Push, PR gegen `claude/einsatzbuch-v2-stufe-6-7`, danach `gh pr view --json autoMergeRequest` → `null`.

---

## Nachträge aus der Umsetzung (Rulings)

- **Öffentlicher Updater-Schlüssel:** bleibt in diesem Stand ein Platzhalter. Der Betreiber trägt ihn per PR in `tauri.conf.json` ein und passt dabei den Test ein, der den Platzhalter festhält (Runbook, Abschnitt „Updater-Schlüssel“).
- **Riegel:** Er prüft die Minisign-Form, nicht nur ein Präfix. Er greift im Profil `release` und immer, wenn `debug_assertions` aus sind, also dort, wo der Updater mitkompiliert wird.
- **Installationsregel:** Zu „nichts ausstehend, niemand angemeldet, keine Anmeldung läuft“ kommt „kein Entwurf in den letzten 15 Minuten geändert“ (Autostart-Szenario). Die Regel wird vor dem Herunterladen, vor dem Installieren und vor dem Neustart geprüft.
- **Wiederholung:** 15 Minuten nach einer gescheiterten Prüfung oder Installation, sonst 6 Stunden. Der letzte Fehler steht in der Karte „Einstellungen“.
- **Workflow:**
  - Der Tag muss auf `main` liegen.
  - Jede `.sig` wird vor dem Ersetzen von `latest.json` gegen den `pubkey` geprüft.
  - macOS wird ad hoc signiert, nur im Release-Overlay.
  - Die Manifest-Veröffentlichung läuft in einer eigenen Concurrency-Gruppe, und ein älterer Tag setzt `latest.json` nicht zurück.
- **Release-Notiz:** so formuliert, dass sie am Rollout-Tag stimmt („sobald die erste Version erschienen ist“).
