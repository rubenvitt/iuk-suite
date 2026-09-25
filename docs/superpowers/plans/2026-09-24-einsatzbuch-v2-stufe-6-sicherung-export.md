# Einsatzbuch v2 — Stufe 6: Sicherung, Export, Bericht, Härtung — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Rechner sichert seine Kette nach jedem Versiegeln und beim Start atomar in einen Ordner, stellt eine leere Kette nur nach Abgleich mit dem Anker der Suite wieder her, exportiert Einsätze als `.einsatzbuch`-Datei, die der Reader der Suite öffnet, und druckt das Berichtsblatt. Dazu kommt die Härtung der Funde aus den Phasen C und D.

**Architecture:**
- **Rust-Kern (`KR`):** rein und ohne Tauri testbar.
  - `kette.rs` (neu): Kettenprüfung in Rust.
  - `sicherung.rs` (neu): Sicherungsdatei, atomarer Schreiber mit Rotation, Sicherungsstufe.
  - `wiederherstellung.rs` (neu): Prüfung und Übernahme einer Sicherung.
  - Schema v3: persistente, noch nicht quittierte Versiegelung, Zeitpunkt des bestätigten Ankers, Sicherungsfehler.
- **Hülle (`T`):**
  - Die Sicherung läuft im Abgleich-Thread.
  - Dialoge (Ordner, Datei öffnen, Speichern) liegen nur in den `#[tauri::command]`-Hüllen. Der gewählte Pfad geht als Argument in `fn(&Zustand, …)`.
  - Drucken über `WebviewWindow::print()`.
- **Oberfläche (`A`):** Export-Dialog und Berichtsblatt nach der Vorlage, dazu eine Karte „Einstellungen“ mit Sicherung, Wiederherstellen und Autostart. Außerdem eine Fehlergrenze um die Verwaltung und eine Sequenznummer für Statusantworten.
- **Suite (`M`):** Neue Route `GET /api/anker` (Kettenanker lesen, Geräte-Token). Dazu die Härtung: widerrufene echte Rechner sichtbar, Aufräumen von `einmalcode`/`sitzung`, `packeAusFuer` entschlüsselt einmal je Anfrage, „Kein Zugang“ als Überschrift.

**Tech Stack:** Rust Edition 2024, Tauri 2 (`tauri-plugin-dialog` aus Rust), `rusqlite`, RustCrypto; Vite + React 19; Next.js 16, Drizzle, zod 4, Vitest, Playwright.

**Spec:** `R/docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md`, §3.3, §4.2, §4.5, §4.7, §7, §8, §12. Vorbild für Planform: Stufe 5 (`…-stufe-5-anbindung.md`).

**Ticket:** DRK-471. Kein ClickUp in dieser Phase.

**Arbeitskopie:** `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-auslieferung`, Branch `claude/einsatzbuch-v2-stufe-6-7`, PR-Basis `claude/einsatzbuch-v2-stufe-5` (PR #300). Stufe 7 folgt als eigener, gestapelter PR (`…-stufe-7-auslieferung.md`). **Nur absolute Pfade.** Keine Worktrees unter `.claude/worktrees/`.

Abkürzungen:
- `R` = `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-auslieferung`
- `M` = `R/src/app/m/einsatzbuch`
- `K` = `M/_lib/kern` (geteilter TS-Kern, **nicht ändern**)
- `A` = `R/apps/einsatzbuch`
- `T` = `A/src-tauri`
- `KR` = `T/kern`

## Global Constraints

- **Sprache:** Deutsche Texte mit echten Umlauten, auch in Rust-Kommentaren, Fehlermeldungen und UI-Texten. Bezeichner, Datei- und Branchnamen bleiben ASCII.
- **Format-Vertrag ist eingefroren.** `K` wird nicht geändert, `K/testvektoren/*` nur gelesen, nie `scripts/einsatzbuch-testvektoren.ts --neu`. Blockkopf, Hash, Umschlag und Export bleiben byte-gleich. `KR/tests/vektoren.rs` bleibt grün und unverändert in seinen Erwartungen.
- **Fallen 1–20 aus `R/CLAUDE.md`** gelten, besonders 1, 6, 7, 9 (Suite-Seiten), 10 und 12 (e2e) sowie 18 (Druck: benannte `@page`, Portale treffen Druckregeln nicht).
- **Zugriffsschutz Suite:** Jeder Route Handler prüft zuerst `hostAbweisung(req)`, dann das Token, dann zod. Objekt-Zugehörigkeit kommt aus der DB. Jeder neue Handler bekommt einen Eintrag in `R/src/core/audit/coverage-manifest.json`.
- **Kein `ring`, kein `aws-lc`:** Nach jeder `Cargo.toml`-Änderung findet `grep -nE '^name = "(ring|aws-lc-rs|aws-lc-sys)"' T/Cargo.lock` nichts.
- **Keine echten Schlüsselbund-, Dialog- oder Netzzugriffe in `cargo test`.** Tresor und Transport bleiben Traits mit Fakes. Dateisystem nur in `tempfile`-Ordnern.
- **Dünne Tauri-Befehle:** Jeder `#[tauri::command]` ruft genau eine `fn(&Zustand, …)` in `T/src`. Dialoge, Opener und Drucken bleiben in der Hülle. Nur so kann der E2E-Treiber denselben Pfad gehen.
- **Sperrreihenfolge (`T/src/zustand.rs`):** zuerst `buch`, dann höchstens ein Blatt. Kein Lock über einer Anfrage, einem Dialog oder dem Schreiben einer Datei außerhalb des App-Datenordners (Sicherungsordner, Exportziel). Der Kommentar in `zustand.rs` wird nachgezogen, wenn sich die Menge der Mutexe ändert.
- **Kommentaranker** nennen Namen, keine Zeilen.
- **Commits:** signiert (`git commit -S`, `git log --format='%h %G?'` zeigt `G`), Conventional Commits (`feat(einsatzbuch): …` für Neues), Body mit `DRK-471`, Schlusszeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Botschaft vor dem Push fertig, denn Force-Push ist blockiert.
- **Tore je Task:** die Tests der Task. Danach:
  - nach jeder Suite-Task `pnpm typecheck`, `pnpm lint` und `pnpm vitest run` vollständig;
  - nach jeder App- oder Rust-Task `pnpm --filter einsatzbuch typecheck|lint|test` sowie in `T` `mise exec -- cargo test --workspace` (vorher `pnpm --filter einsatzbuch build`) und `mise exec -- cargo clippy --workspace --all-targets -- -D warnings`.
  - Vor jedem Urteil über einen roten Lauf `uptime` und `pgrep -fl "playwright|next-server"`. Bei zweistelliger Last die Datei einzeln nachfahren. Fremde Prozesse nie beenden. `scripts/backup-sidecar.test.ts` ist auf macOS schon vorher rot, das ist kein Befund.
- **E2E-Port dieser Arbeitskopie:** Web-Port **4520** (`worktreeBlock` aus `R/e2e/helpers/ports.ts`; 4230 gehört der Arbeitskopie von Phase D). In Specs nie ein Portliteral.

## Review Focus

1. **Keine Sicherung zerstört eine bessere:** Eine leere Kette wird nie gesichert. Gleicher letzter Hash heißt: nicht schreiben, nicht rotieren. Hat die vorhandene Datei mehr Blöcke als die lokale Kette, wird nicht geschrieben, und der Status wird gelb. Test: Ordner mit Sicherung über 3 Blöcke, leeres Buch, Ordner setzen, 11 Starts → die Datei ist byte-gleich (Task 2, Task 5).
2. **Atomar heißt atomar:**
   - Temp-Datei im selben Ordner vollständig schreiben und `sync_all` über das Schreib-Handle.
   - Erst danach rotieren, dann umbenennen.
   - Unter Unix danach fsync auf das Verzeichnis, unter Windows nicht.
   - Scheitert ein Schritt, bleibt keine Temp-Datei liegen, und die alte Datei ist unverändert.
3. **Wiederherstellung nur bei passendem Anker:**
   - Die Sicherung muss den höchsten Suite-Anker der echten Kette mit gleichem Hash enthalten. Sie darf darüber hinausgehen, denn solche Blöcke hängen per Kette daran.
   - Kennt die Suite keinen Anker, endet die Sicherung davor oder weicht der Hash ab: abgelehnt, nichts übernommen.
   - Die Leer-Prüfung auf `bloecke`, `ausstehend` und `nummern` läuft in derselben Transaktion wie das Einfügen (Task 4).
4. **Export trägt nur, was er soll:** Originalblöcke byte-gleich, CEKs nur für die exportierten Blöcke, der letzte **bestätigte** Anker mit Zeitpunkt. Der Reader der Suite öffnet die Datei (Task 11).
5. **Kein CEK und kein Klartext überlebt:**
   - CEKs aus Freigaben für Export und Wiederherstellung werden nach Gebrauch überschrieben (`zeroize` in Rust, `fill(0)` in TS).
   - Der CEK in `Blockzufall` ist privat und nicht kopierbar.
   - Der HKDF/HMAC-Zustand wird beim Drop gewischt.
   - Belegt wird das am Quelltext der Crates, nicht behauptet (Task 8).
6. **Das Versiegeln hängt an nichts davon:** Ein fehlender Sicherungsordner, ein voller Datenträger oder eine nicht erreichbare Suite ändern am Versiegeln nichts (Task 5).

---

## Entscheidungen, wo die Spec offen ist

Jede Entscheidung gehört in den Abschlussbericht.

1. **Die Sicherung läuft im Abgleich-Thread (`T/src/abgleich.rs`), nicht im Versiegeln selbst.**
   - Der Kanal trägt statt `()` ein `Anstoss`: `NeuerBlock` (Versiegeln, Wiederherstellen, Einrichten) sichert und gleicht die Anker ab, `Sicherung` (Ordner gewählt) sichert nur.
   - Die erste Runde nach dem Start sichert zuerst und macht danach den vollen Abgleich. Die stündliche Runde sichert **nicht**.
   - Die Sicherung läuft vor jeder Suite-Anfrage der Runde, unabhängig von Geräte-Token und Widerruf.
   - Grund: Ein Thread serialisiert alle Schreiber auf dieselbe Datei. Kein Lock bleibt über der Datei-I/O im Sicherungsordner (Netzlaufwerk) gehalten. Und „nach jedem Versiegeln“ ist nach dem Commit der Transaktion erfüllt, wie Spec §4.3 es verlangt („danach, außerhalb der Transaktion“).
2. **Schreibregeln der Sicherung** (Review Focus 1):
   - leere Kette → nicht schreiben;
   - vorhandene Datei mit gleichem letzten Hash → nicht schreiben, Zeitpunkt trotzdem als gelungen vermerken;
   - vorhandene lesbare Datei mit mehr Blöcken → nicht schreiben, Fehler „Im Sicherungsordner liegt eine längere Kette (n Blöcke) als auf diesem Rechner (m). Nichts überschrieben.“ (gelb);
   - eine unlesbare vorhandene Datei wird normal nach `.1` rotiert.
3. **Sicherungsstufe** (`sicherung::stufe`), in Rust berechnet und im Status geliefert:
   - `aus`: Testbetrieb.
   - `rot`: Die letzte gelungene Sicherung ist 7 Tage oder älter. Ohne je eine gelungene Sicherung zählt `eingerichtet_am`.
   - `gelb`: kein Ordner gewählt oder der letzte Versuch gescheitert.
   - `ok`: sonst.
   - Die Oberfläche formuliert „Letzte Sicherung: … — Ordner nicht erreichbar“ (Spec §4.5) bzw. „Noch kein Sicherungsordner gewählt“.
4. **Schema v3 der lokalen DB** (`KR/src/schema_v3.sql`):
   - Tabelle `unquittiert` (höchstens eine Zeile: Versiegelung als JSON). Sie wird in **derselben Transaktion** wie das Block-`INSERT` geschrieben. Damit übersteht der Hinweis „Deine letzten Änderungen wurden nicht übernommen …“ einen Neustart (Härtung aus Phase C). Der Mutex `Zustand.unquittiert` entfällt.
   - `einrichtung.anker_gemeldet_am` (Zeitpunkt der letzten Bestätigung). Wird mit `anker_gemeldet_bis` gesetzt und von `richte_neu_ein` zurückgesetzt.
   - `einrichtung.sicherung_fehler` (Text des letzten gescheiterten Versuchs, `NULL` nach Erfolg). `sicherungsordner` und `letzte_sicherung` gibt es schon seit v1.
5. **Neue Suite-Route `GET /m/einsatzbuch/api/anker`** (Geräte-Token). Sie liefert den höchsten Anker **der Kette**, zu der der Rechner gehört:
   - für einen echten Rechner über alle Rechner mit `art = 'echt'`, auch widerrufene (Stufe 5, Entscheidung 6: „die Wiederherstellung in Stufe 6 kann sie lesen“);
   - für einen Test-Rechner nur seine eigenen.
   - Antwort `200 { "anker": { "block": n, "hash": "…" } | null }`.
   - Tragen zwei echte Rechner für diesen höchsten Block verschiedene Hashes: `409 anker_mehrdeutig`, keine Wiederherstellung.
   - Grund: Ein frisch eingerichteter echter Rechner hat noch keine eigenen Anker. `POST anker` würde einen unbekannten Block einfach annehmen, taugt also nicht als Prüfung.
6. **Wiederherstellen** (Spec §4.5):
   - nur im Echtbetrieb (im Testbetrieb ist die Sicherung aus);
   - nur mit gültiger, an diesen Rechner gebundener Sitzung;
   - nur, wenn `bloecke`, `ausstehend` und `nummern` leer sind.
   - Ablauf:
     1. Datei lesen, höchstens 256 MiB.
     2. Format prüfen und die Kette mit `kette::pruefe` prüfen.
     3. Jeder Kopf trägt die gepinnte `schluesselId` und `umgebung: "echt"`.
     4. `GET anker` holen und die Regel aus Review Focus 3 anwenden.
     5. Alle Blöcke über `schluessel/freigeben` freigeben lassen (dieselbe Sitzung; die Suite prüft beim echten Paar nur die Art, `M/_lib/anbindung/freigabe.ts`, `gibFrei`).
     6. Jeden Block in Rust entschlüsseln und die Nummern `YYYY-NNN` je Jahr zum Maximum zusammenfassen. Scheitert ein Block, bricht alles ab.
     7. Blöcke und `nummern` in einer Transaktion übernehmen.
     8. `NeuerBlock` anstoßen: sichern und alle Anker für den neuen Rechner melden (`anker_gemeldet_bis` bleibt 0).
   - Die CEKs werden danach überschrieben.
7. **Export** (Spec §3.3), zusammengebaut in TS mit `verschluesseleExport` aus `K`, in einem reinen App-Modul `A/src/logik/export.ts`:
   - Umfang „alle“ bzw. „einzeln“ (der gewählte Block, ohne Wahl der neueste offene; Vorlage `exportieren`).
   - CEKs frisch über `schluessel_freigeben` mit **optionaler Blockliste**. „Einzeln“ gibt nur einen Block frei, und die Audit-Zeile der Suite nennt nur ihn.
   - `anker` = der letzte bestätigte Anker aus dem Status (`{block, hash, gemeldetAm}`) oder `null`.
   - `exportiertVon` = Name der Sitzung, `quelle` = Bereitschaftsname (wie die Vorlage).
   - `kopf.erstellt` = `status.jetzt` (ISO mit Offset der Einrichtungszone, Spec §3).
   - Dateiname wie die Vorlage: `einsatzbuch_<YYYY-MM-DD>_block-<von>-<bis>.einsatzbuch` bzw. `einsatz_<nummer>.einsatzbuch`. Das Datum gilt in der Einrichtungszone.
   - Gespeichert wird über den Speichern-Dialog des Systems, aus Rust geöffnet, und `sicherung::schreibe_atomar` (ohne Rotation).
   - Der Text im Dialog nennt „PBKDF2, 600.000 Runden“ (Spec §10).
   - „Im Reader öffnen“ öffnet `<suiteUrl>/m/einsatzbuch/reader` im Systembrowser.
8. **Berichtsblatt am Rechner:** die geteilte `Berichtsblatt` aus `K/ansichten` in einer Überlagerung nach der Vorlage („PDF erzeugen“ → „Als PDF speichern“).
   - `unveraendert` ist wahr, wenn die letzte Kettenprüfung „intakt“ ergab und der Block offen ist, wie im Reader (`gewaehlt.knoten === "geprueft"`).
   - Gedruckt wird über einen Befehl `drucken`, der `WebviewWindow::print()` ruft. WKWebView kennt kein zuverlässiges `window.print()`.
   - `quelle` und `erzeugt` wie im Reader, `erzeugt` = `status.jetzt`.
9. **Freigabe mit Blockliste:** `schluessel_freigeben` nimmt `bloecke: Option<Vec<u64>>`. `None` heißt alle, wie bisher. Unbekannte Nummern → Fehler „Block n gibt es auf diesem Rechner nicht.“
10. **Aufräumen in der Suite:**
    - `raeumeAnbindungAuf(db, jetzt)` löscht Einmalcodes mit `ablauf < jetzt` (eingelöst oder nicht) und Sitzungen mit `ablauf < jetzt`.
    - Aufgerufen beim Zugriff (`erzeugeCode`, `tausch`) und periodisch alle 10 Minuten über `startBackgroundWork` (`R/src/core/bootstrap.ts`), Vorbild `starteRadioHintergrund` mit `globalThis`-Wache und `unref`.
    - Beide Tabellen sind laut `catalog.ts` `excluded`, das Löschen erzeugt also keine Audit-Zeile.
11. **Widerrufene echte Rechner auf der Seite „Rechner“:**
    - `rechnerStatus` liefert zusätzlich `widerrufeneEcht` (neueste zuerst) mit eingerichtet am/von, widerrufen am, Anker bis Block n und Abweichungen.
    - Die Seite zeigt sie unter der Karte des aktiven Rechners, Abweichungen rot.
    - Die Übersicht zählt Abweichungen über alle echten Rechner.
12. **Autostart-Schalter** in der Karte „Einstellungen“ der Verwaltung (Spec §4.7), nur im Echtbetrieb. Die Befehle `autostart_status`/`autostart_setzen` gibt es seit Stufe 5.

---

## Dateistruktur

**Rust-Kern `KR/src` (neu):** `kette.rs`, `sicherung.rs`, `wiederherstellung.rs`, `schema_v3.sql`; Tests `KR/tests/sicherung.rs`, `KR/tests/wiederherstellung.rs`, `KR/tests/kette.rs`.
**Rust-Kern (geändert):** `buch.rs`, `versiegeln.rs`, `krypto.rs` (`oeffne_block`, `Blockzufall` privat), `suite.rs` (`hole_kettenanker`, `melde_sicherung`, `gleiche_anker_ab` mit Zeitpunkt), `vertrag.rs`, `loopback.rs`, `lib.rs`, `Cargo.toml`.
**Hülle `T/src`:** `zustand.rs`, `befehle.rs`, `abgleich.rs`, `lib.rs`; neu `sicherung.rs` (Hüllenfunktionen Sicherung/Wiederherstellen), `export.rs` (Export speichern, Reader öffnen, Drucken); `T/examples/e2e_lauf.rs`; `T/capabilities/default.json` (unverändert, Dialoge laufen über Rust).
**Oberfläche `A/src`:** `typen.ts`, `befehle.ts`, `App.tsx`, `seiten/Verwaltung.tsx`; neu `logik/export.ts`, `logik/sicherung.ts`, `verwaltung/ExportDialog.tsx`, `verwaltung/BerichtUeberlagerung.tsx`, `verwaltung/Einstellungen.tsx`, `bausteine/Fehlergrenze.tsx`; `stil/app.css`; `A/e2e/stub.ts`, `A/e2e/verwaltung.spec.ts`.
**Suite:** neu `M/api/anker/route.ts` (GET neben dem bestehenden POST), `M/_lib/anbindung/aufraeumen.ts`, `M/_lib/anbindung/vertrag/anker-lesen.json`; geändert `M/_lib/anbindung/{vertrag.ts,anker.ts,status.ts,einmalcode.ts,freigabe.ts}`, `M/_lib/schluessel/freigabe.ts`, `M/_ui/rechner/EchterRechner.tsx` (+ neue Liste), `M/(verwaltung)/page.tsx`, `M/anmelden/page.tsx`, `R/src/core/bootstrap.ts`, `R/src/core/audit/coverage-manifest.json`, `R/e2e/einsatzbuch-anbindung.spec.ts`.
**Skripte:** neu `R/scripts/einsatzbuch-e2e-export.ts`, `R/scripts/einsatzbuch-e2e-reader.ts` (beide unter dem vorhandenen `.dockerignore`-Muster `scripts/einsatzbuch-e2e-*.ts`).

---

### Task 1: Schema v3, persistente Versiegelung, Ankerzeitpunkt

**Files:**
- Create: `KR/src/schema_v3.sql`
- Modify: `KR/src/buch.rs`, `KR/src/versiegeln.rs`, `KR/src/suite.rs` (`gleiche_anker_ab` bekommt `gemeldet_am: &str`), `T/src/zustand.rs`, `T/src/befehle.rs`, `T/src/abgleich.rs` (Aufrufer), `T/examples/e2e_lauf.rs`, `A/src/typen.ts`
- Test: `KR/tests/buch.rs`, `KR/tests/versiegeln.rs`, `KR/tests/frist.rs`, `KR/tests/suite.rs`, Tests in `T/src/befehle.rs`

**Interfaces:**
- `Buch::unquittiert(&self) -> Result<Option<Versiegelung>, BuchFehler>`, `Buch::quittiere(&mut self) -> Result<(), BuchFehler>`
- `Buch::anker_bestaetigt(&mut self, block: u64, gemeldet_am: &str)`: `anker_gemeldet_am` wird gesetzt, wenn `block >= anker_gemeldet_bis`.
- `Buch::bestaetigter_anker(&self) -> Result<Option<Exportanker>, BuchFehler>`. `Exportanker { block, hash, gemeldet_am }` ist camelCase und entspricht `Exportinhalt.anker` in `K/format.ts`. `None`, solange `anker_gemeldet_bis = 0` oder `anker_gemeldet_am` fehlt.
- `Status` bekommt `anker: Option<Exportanker>`.

- [ ] **Step 1: Failing tests:**
  - Eine v2-Datei (per `schema.sql` + `schema_v2.sql` + `user_version = 2` angelegt) wird beim Öffnen auf v3 gehoben, und Einrichtung und Blöcke bleiben erhalten. Eine frische Datei landet direkt bei 3.
  - Versiegeln per Frist mit ungespeichertem Entwurf, dann Buch schließen und neu öffnen: `unquittiert()` liefert dieselbe Versiegelung mit `verfallen = true`. Nach `quittiere()` liefert es `None`.
  - Scheitert das Versiegeln (z. B. unbekannte Umgebung), entsteht weder ein Block noch eine `unquittiert`-Zeile.
  - `anker_bestaetigt(3, t)` setzt Zeitpunkt und Stand. Ein späteres `anker_bestaetigt(2, t2)` ändert keins von beiden. `richte_neu_ein` setzt beide zurück.
  - Hülle: `lies_status` nach einem Neustart des Zustands (neuer `Zustand::beim_start` auf demselben Ordner) zeigt `versiegelung` samt `verfallen`.
- [ ] **Step 2:** `mise exec -- cargo test -p einsatzbuch-kern` → FAIL.
- [ ] **Step 3: Umsetzen:**
  - `schema_v3.sql` und `richte_schema_ein`: 0 → v1+v2+v3, 1 → v2+v3, 2 → v3, `SCHEMA_VERSION = 3`.
  - `versiegele_ausstehend` schreibt `INSERT OR REPLACE INTO unquittiert` in `tx`.
  - Die Hülle ersetzt jede Nutzung von `Zustand::unquittiert()` durch die Buch-Methoden: `lies_status`, `versiegele_jetzt`, `pruefe_frist_jetzt`, `quittiere`, `beende_testbetrieb`, `Zustand::pruefe_frist`, `beim_start`, dazu der Treiber `e2e_lauf.rs`, der heute `z.unquittiert()` pollt.
  - Den Mutex entfernen und den Kommentar zur Sperrreihenfolge in `zustand.rs` nachziehen.
  - `gleiche_anker_jetzt` gibt den Zeitpunkt (`formatiere_zeitpunkt(jetzt, zone)`) an `gleiche_anker_ab` weiter.
- [ ] **Step 4:** Tore (Rust und App). `typen.ts`: `Status.anker`.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Versiegelungshinweis und Ankerzeitpunkt überstehen den Neustart`.

### Task 2: Kettenprüfung und Sicherungsdatei im Kern

**Files:**
- Create: `KR/src/kette.rs`, `KR/src/sicherung.rs`, `KR/tests/kette.rs`, `KR/tests/sicherung.rs`
- Modify: `KR/src/lib.rs`, `KR/src/buch.rs`

**Interfaces:**
- `kette::pruefe(bloecke: &[Block]) -> Result<(), Kettenfehler>`, `Kettenfehler { block: u64, grund: Kettengrund }`.
  - Gründe: `Anfang` (erster Block ≠ 1 oder `prev` ≠ `GENESIS`), `Luecke`, `Vorgaenger`, `Hash`.
  - Eine vollständige Kette ab Block 1. Der Hash wird wie in `krypto::versiegele` über `jcs::kanonisch({kopf, iv, daten, umschlag})` neu gebildet.
- `sicherung::DATEI = "einsatzbuch-sicherung.json"`.
- `Sicherungsdatei { format: "einsatzbuch-sicherung", version: 1, erstellt: String, bloecke: Vec<Block> }` mit `deny_unknown_fields`, Spec §4.5.
- `sicherung::schreibe(ordner: &Path, datei: &Sicherungsdatei) -> Result<Schreibergebnis, SicherungFehler>`, `Schreibergebnis::{Geschrieben, Unveraendert, LeereKette}`, `SicherungFehler::{Io(io::Error), VorhandeneLaenger { vorhanden: usize, lokal: usize }}` mit deutschen Meldungen.
- `sicherung::schreibe_atomar(ziel: &Path, bytes: &[u8]) -> io::Result<()>` (ohne Rotation, auch für den Export).
- `sicherung::lies(pfad: &Path) -> Result<Sicherungsdatei, SicherungFehler>`, Grenze `HOECHSTENS_BYTES = 256 MiB` vor dem Lesen per `metadata().len()`.
- `sicherung::stufe(betrieb, angaben: &Sicherungsangaben, jetzt: DateTime<Utc>) -> Sicherungsstufe` (`aus|ok|gelb|rot`, serde lowercase).
- `Buch::sicherungsangaben() -> Result<Option<Sicherungsangaben>>` mit `ordner`, `letzte`, `fehler`, `eingerichtet_am`.
- `Buch::sicherungsordner_setzen(Option<&str>)`, `Buch::sicherung_gelungen(zeitpunkt: &str)` (setzt `letzte_sicherung`, löscht `sicherung_fehler`), `Buch::sicherung_gescheitert(text: &str)`.

- [ ] **Step 1: Failing tests** (`tempfile`):
  - `kette`: die drei Vektorblöcke aus `K/testvektoren/erwartet.json` sind gültig. Jeder Negativfall aus den Vektoren (veränderter Kopf, vertauschter Umschlag, Lücke, falscher Anfang) liefert Block und Grund.
  - Rotation: 12 Schreibvorgänge mit je einem Block mehr ergeben genau `einsatzbuch-sicherung.json` plus `.1.json` bis `.10.json`. `.1` ist der vorletzte Stand, keine Temp-Datei bleibt.
  - Unveränderter letzter Hash: kein Schreiben, keine Rotation (mtime und Inhalt gleich), Ergebnis `Unveraendert`.
  - Leere Kette: `LeereKette`, der Ordner bleibt byte-gleich (auch mit vorhandener Datei).
  - Vorhandene Datei mit 3 Blöcken, lokal 1: `VorhandeneLaenger`, nichts rotiert.
  - Ordner fehlt bzw. ist schreibgeschützt (`set_permissions` 0o555, nur `cfg(unix)`): `Err(Io)`, alte Datei byte-gleich, keine Temp-Datei.
  - `schreibe_atomar` überschreibt ein bestehendes Ziel vollständig.
  - `lies`: fremdes Format, unbekanntes Feld und Übergröße werden abgelehnt.
  - `stufe`: Testbetrieb → aus; 6 Tage 23 h → ok; 7 Tage → rot; Fehler gesetzt → gelb; kein Ordner, 2 Tage nach Einrichtung → gelb; kein Ordner, 8 Tage → rot.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Umsetzen:**
  - Temp-Name `.einsatzbuch-sicherung.<16 hex Zufall>.tmp` im Zielordner.
  - Ablauf: `File::create_new`, `write_all`, `sync_all`, schließen; dann rotieren von `.9` nach `.10` herunter bis aktuell nach `.1`, dann `rename(temp, ziel)`.
  - Unter Windows vor jedem `rename` auf ein bestehendes Ziel dieses Ziel entfernen, denn `std::fs::rename` ersetzt dort nur Dateien und scheitert an manchen Freigaben. Ein Kommentar nennt die Windows-Lehre aus Spec §4.2.
  - `#[cfg(unix)]` fsync auf das Verzeichnis, unter Windows ausdrücklich nicht.
  - Jeder Fehler nach dem Anlegen entfernt die Temp-Datei (Drop-Wache).
- [ ] **Step 4:** Tore (Rust).
- [ ] **Step 5:** Commit `feat(einsatzbuch): Kettenprüfung und atomare Sicherung mit Rotation im Kern`.

### Task 3: Suite-Route `GET /api/anker` samt Vertrag in Rust

**Files:**
- Modify: `M/api/anker/route.ts` (neben `POST` ein `GET`), `M/api/anker/route.test.ts`, `M/_lib/anbindung/anker.ts` (`kettenanker(db, rechner)`), `M/_lib/anbindung/anker.test.ts`, `M/_lib/anbindung/vertrag.ts` (`kettenankerAntwort`), `M/_lib/anbindung/vertrag.test.ts`, `R/src/core/audit/coverage-manifest.json`
- Create: `M/_lib/anbindung/vertrag/anker-lesen.json`
- Modify (Rust): `KR/src/vertrag.rs` (`KettenankerAntwort`, `deny_unknown_fields`), `KR/src/suite.rs` (`hole_kettenanker`, `melde_sicherung`), `KR/tests/vertrag.rs`, `KR/tests/suite.rs`

**Interfaces:**
- `GET /m/einsatzbuch/api/anker`, `Authorization: Bearer <geraeteToken>`.
  - `200 {"anker": {"block": 7, "hash": "<hex64>"} | null}`
  - 401 `geraet_ungueltig` (wie `POST`, mit `auditDenied`), 404 fremder Host, 409 `anker_mehrdeutig`.
  - Setzt `letzter_kontakt` wie `POST anker`. **Vorher im Code prüfen**, ob `POST anker` das tut, und das Gleiche tun.
- `suite::hole_kettenanker(t, suite, geraet) -> Result<Option<(u64, String)>, SuiteFehler>`: 401 → `Widerrufen`, 5xx ohne Körper → `NichtErreichbar`.
- `suite::melde_sicherung(t, suite, geraet, erstellt: &str) -> Result<(), SuiteFehler>`: `POST /api/sicherung {erstellt}`, 204.

- [ ] **Step 1: Failing tests:**
  - `anker.test.ts`: Anker zweier echter Rechner (der erste widerrufen, Blöcke 1–5; der zweite aktiv, ohne Anker) → der zweite liest `{block: 5, …}`.
  - Ein Test-Rechner sieht nur eigene Anker, nie die echten.
  - Gleicher Block, verschiedene Hashes bei zwei echten Rechnern → mehrdeutig.
  - Ohne Anker → `null`.
  - `route.test.ts`: 404, 401, 200 null, 200 Wert, 409.
  - Die Fixture passt zum zod-Schema.
  - Rust liest die Fixture mit `deny_unknown_fields`. `hole_kettenanker` deutet 200/401/5xx.
  - `melde_sicherung` schickt den Körper `{"erstellt": …}` mit Bearer.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Umsetzen. Das Manifest bekommt den `GET`-Eintrag im Stil der vorhandenen Einsatzbuch-Einträge.
- [ ] **Step 4:** Suite-Tore und Rust-Tore. `.github/workflows/einsatzbuch.yml` filtert `vertrag/**` schon.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Suite liefert den Kettenanker für die Wiederherstellung`.

### Task 4: Wiederherstellung im Kern

**Files:**
- Create: `KR/src/wiederherstellung.rs`, `KR/tests/wiederherstellung.rs`
- Modify: `KR/src/krypto.rs` (`oeffne_block`), `KR/src/buch.rs` (`uebernehme_sicherung`), `KR/src/lib.rs`

**Interfaces:**
- `krypto::oeffne_block(block: &Block, cek: &[u8; 32]) -> Result<Einsatz, KryptoFehler>`: AES-256-GCM mit AAD = `JCS(kopf)`, wie `oeffneBlock` in `K/block.ts`.
- `wiederherstellung::pruefe(datei: &Sicherungsdatei, gepinnt: &str, anker: Option<(u64, &str)>) -> Result<(), Wiederherstellungsfehler>`. Prüft:
  - Kette (`kette::pruefe`), nicht leer;
  - jeder Kopf mit `schluessel_id == gepinnt` und `umgebung == Echt`;
  - Anker vorhanden, `anker.block <= letzter Block` und Hash gleich.
- `wiederherstellung::nummern(einsaetze: &[Einsatz]) -> Result<BTreeMap<i64, i64>, Wiederherstellungsfehler>`: parst `YYYY-NNN` (ohne `T-`), Maximum je Jahr. Eine unlesbare Nummer ist ein Fehler.
- `Buch::uebernehme_sicherung(&mut self, bloecke: &[Block], nummern: &BTreeMap<i64, i64>) -> Result<(), BuchFehler>`:
  - eine Transaktion;
  - verlangt Einrichtung, Echtbetrieb und leere `bloecke`, `ausstehend` und `nummern`, sonst `BuchFehler::KetteNichtLeer`;
  - fügt Blöcke (JSON, Hash, `versiegelt`) und Nummern ein;
  - `anker_gemeldet_bis` bleibt 0.
- Deutsche Meldungen in `Wiederherstellungsfehler`, u. a.:
  - „Die Suite kennt noch keinen Anker dieser Kette. Ohne Anker lässt sich die Sicherung nicht prüfen.“
  - „Die Sicherung endet bei Block m, die Suite kennt die Kette bis Block n. Diese Sicherung ist veraltet.“
  - „Block n der Sicherung passt nicht zum Anker der Suite (Sicherung …, Suite …).“
  - „Die Sicherung gehört zu einem anderen Schlüssel (…).“
  - „Die Kette in der Sicherung ist gebrochen bei Block n: …“

- [ ] **Step 1: Failing tests** (Blöcke per `versiegeln` im Test erzeugt; Vorbild `KR/tests/hilfe/mod.rs`):
  - Passender Anker am letzten Block → ok.
  - Anker am vorletzten Block, Sicherung länger → ok.
  - Anker über dem letzten Block → veraltet.
  - Hash anders → abgelehnt.
  - Anker `None` → abgelehnt.
  - Test-Umgebung und fremde `schluesselId` → abgelehnt.
  - Gebrochene Kette → Block und Grund.
  - `oeffne_block` öffnet die Vektorblöcke mit den Vektor-CEKs und lehnt einen vertauschten Kopf ab.
  - `nummern` über zwei Jahre.
  - `uebernehme_sicherung` auf nicht leerer Kette → `KetteNichtLeer`, nichts geändert.
  - Danach vergibt ein Versiegeln die nächste Nummer im selben Jahr (`2026-004` nach `2026-003`) und hängt Block n+1 mit richtigem `prev` an.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** Tore (Rust).
- [ ] **Step 5:** Commit `feat(einsatzbuch): Wiederherstellung einer Sicherung nur bei passendem Anker`.

### Task 5: Hülle — Sicherung im Abgleich-Thread, Ordnerwahl, Wiederherstellen

**Files:**
- Create: `T/src/sicherung.rs`
- Modify: `T/src/abgleich.rs`, `T/src/zustand.rs` (Kanaltyp `Sender<Anstoss>`, `stosse_an(Anstoss)`), `T/src/befehle.rs` (Status-Felder, Aufrufer von `stosse_abgleich_an`), `T/src/lib.rs` (Befehle registrieren), `A/src/typen.ts`, `A/src/befehle.ts`

**Interfaces:**
- `pub enum Anstoss { NeuerBlock, Sicherung }`.
- `sichere_jetzt(z: &Zustand) -> Result<Option<String>, String>`:
  1. Unter kurzem Lock Betrieb, Einrichtung, Ordner, Blöcke und Zone lesen, dann freigeben.
  2. Test → `Ok(None)`; kein Ordner → `Ok(None)`.
  3. `sicherung::schreibe`, danach unter kurzem Lock `sicherung_gelungen`/`sicherung_gescheitert`.
  4. Bei Erfolg (auch `Unveraendert`), mit Geräte-Token und ohne Widerruf: `suite::melde_sicherung`. Ein Fehler dort geht nur ins Log.
- `setze_sicherungsordner(z, ordner: Option<PathBuf>) -> Result<(), String>`: Echtbetrieb; der Ordner existiert und ist ein Verzeichnis; danach `Anstoss::Sicherung`.
- `stelle_wieder_her(z, datei: &Path) -> Result<Wiederhergestellt { bloecke: u64 }, String>`: Entscheidung 6. Die Sitzung wird geprüft wie in `gib_schluessel_frei`, samt 401-Verwerfen.
- Tauri-Befehle (Dialog nur hier, im Blocking-Thread):
  - `sicherungsordner_waehlen(app) -> Result<Option<String>, String>` mit `app.dialog().file().blocking_pick_folder()`;
  - `wiederherstellen(app) -> Result<Option<Wiederhergestellt>, String>` mit `blocking_pick_file`, Filter `json`.
  - `None` heißt: im Dialog abgebrochen.
- `Status` bekommt `sicherung: Option<Sicherungsstand { ordner, letzte, fehler, stufe }>` (camelCase) und `kette_leer` (aus `kette.anzahl` ableitbar, kein eigenes Feld nötig).

- [ ] **Step 1: Failing tests** in `T/src/sicherung.rs` bzw. `abgleich.rs` (Fakes aus `befehle::tests`):
  - Echter Rechner mit Ordner: nach `versiegele_einen` und einer Abgleichsrunde liegt die Sicherung im Ordner. Die Suite bekam `POST /api/sicherung`, und der Status zeigt `stufe: ok`.
  - Ordner gelöscht: Versiegeln gelingt trotzdem, der Status zeigt `gelb` samt Fehlertext.
  - Test-Rechner: keine Datei, `stufe: aus`.
  - Suite offline: Sicherung trotzdem geschrieben.
  - Stündliche Runde (`Runde::Voll` ohne Anstoß) schreibt nicht.
  - Szenario aus Review Focus 1: Ordner mit Sicherung über 3 Blöcke, Rechner mit leerer Kette, Ordner setzen, 11 Starts → Datei byte-gleich.
  - `stelle_wieder_her`, jeweils mit `FakeSuite`:
    - ohne Sitzung → „Die Sitzung ist abgelaufen. Bitte neu anmelden.“;
    - Kette nicht leer → Fehler;
    - Anker passt → Blöcke übernommen, Nummern gesetzt, danach Anker für alle Blöcke gemeldet;
    - Anker veraltet → nichts übernommen;
    - 401 bei der Freigabe → Sitzung verworfen.
- [ ] **Step 2:** FAIL. **Step 3:** umsetzen. **Step 4:** Tore (Rust und App).
- [ ] **Step 5:** Commit `feat(einsatzbuch): automatische Sicherung und Wiederherstellen am Rechner`.

### Task 6: Hülle — Export speichern, Freigabe mit Blockliste, Drucken, Reader öffnen

**Files:**
- Create: `T/src/export.rs`
- Modify: `T/src/befehle.rs` (`gib_schluessel_frei(z, bloecke: Option<&[u64]>)`), `T/src/lib.rs`, `T/examples/e2e_lauf.rs` (Aufruf mit `None`), `A/src/befehle.ts`, `A/e2e/stub.ts`

**Interfaces:**
- `speichere_export(ziel: &Path, inhalt: &str) -> Result<String, String>`:
  - prüft, dass `inhalt` JSON mit `format == "einsatzbuch-export"` und `version == 2` ist;
  - schreibt per `sicherung::schreibe_atomar`;
  - gibt den Dateinamen zurück.
- Tauri: `export_speichern(app, inhalt: String, dateiname: String) -> Result<Option<String>, String>`: Speichern-Dialog aus Rust (`blocking_save_file`), Vorschlagsname, Filter `einsatzbuch`. Endet der Name nicht auf `.einsatzbuch`, wird die Endung ergänzt.
- `drucken(app) -> Result<(), String>`: `get_webview_window("main")?.print()`.
- `reader_oeffnen(app) -> Result<(), String>`: Opener mit `anmeldung::modul_url(suite_url, "/reader")` aus der Einrichtung, nie mit einer URL aus der Oberfläche.
- `schluessel_freigeben(app, bloecke: Option<Vec<u64>>)`.

- [ ] **Step 1: Failing tests:**
  - `gib_schluessel_frei(Some(&[2]))` schickt nur Block 2 (FakeSuite zeichnet auf).
  - Eine unbekannte Nummer → Fehler ohne Anfrage.
  - `speichere_export` lehnt fremdes JSON ab, schreibt atomar und überschreibt vorhandene Dateien.
- [ ] **Step 2–4:** FAIL, umsetzen, Tore.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Export speichern und Drucken aus der Hülle`.

### Task 7: Suite-Härtung aus Phase D

**Files:**
- Create: `M/_lib/anbindung/aufraeumen.ts` (+ Test)
- Modify: `M/_lib/anbindung/einmalcode.ts`, `M/api/anmelden/tausch/route.ts`, `R/src/core/bootstrap.ts` (`starteEinsatzbuchHintergrund`), `M/_lib/anbindung/status.ts` (+ Test), `M/_ui/rechner/EchterRechner.tsx` bzw. neue Client-Komponente `WiderrufeneRechner.tsx`, `M/(verwaltung)/rechner/page.tsx`, `M/(verwaltung)/page.tsx`, `M/_lib/anbindung/freigabe.ts`, `M/_lib/schluessel/freigabe.ts` (+ Tests), `M/anmelden/page.tsx`, `R/e2e/einsatzbuch-anbindung.spec.ts`

- [ ] **Step 1: Failing tests:**
  - `aufraeumen.test.ts`: abgelaufene Codes (eingelöst und nicht eingelöst) und abgelaufene Sitzungen verschwinden, gültige bleiben. Der Hintergrund-Start ist idempotent (zweiter Aufruf registriert keinen zweiten Takt) und `unref`t. Das Vorbild für den Test steht in `R/src/app/m/radio/_lib/boot.test.ts`.
  - `status.test.ts`: Die heutige Erwartung „ein widerrufener echter Rechner erscheint nicht als aktiv“ bleibt für `echt`. Neu erscheint er in `widerrufeneEcht` samt Abweichungen. Die Übersicht zählt Abweichungen über alle echten Rechner.
  - `freigabe.test.ts`: Für 200 Einträge mit demselben Schlüssel läuft `entschluesselePrivat` genau einmal (Spy). Zwei verschiedene Schlüssel in einer Anfrage laufen je einmal.
  - Playwright (`einsatzbuch-anbindung.spec.ts`): „Kein Zugang“ ist `getByRole("heading", { name: "Kein Zugang zum Einsatzbuch" })`. Ein widerrufener echter Rechner steht mit Abweichung auf `/rechner` (anlegen über die vorhandenen Helfer der Spec, widerrufen über die Server Action).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Umsetzen:**
  - `packeAusFuer` bekommt eine Variante mit schon geöffnetem Privatschlüssel. `gibFrei` hält je `schluesselId` einen Cache für die Dauer der Anfrage und verwirft ihn am Ende.
  - Der `Result`-Titel wird ein `<h1>` mit Klassenname aus `anmelden.module.css`, ohne antd-Compound (Falle 1). „Anmeldung nicht möglich“ wird gleich behandelt.
- [ ] **Step 4:** Suite-Tore, dazu `pnpm exec playwright test e2e/einsatzbuch-anbindung.spec.ts` mit `E2E_PORT` aus `ports.ts`.
- [ ] **Step 5:** Commit `fix(einsatzbuch): Suite räumt Anmeldereste auf und zeigt widerrufene Rechner`.

### Task 8: Rust-Härtung aus den Phasen C und D

**Files:**
- Modify: `KR/src/krypto.rs`, `KR/Cargo.toml`, `KR/tests/vektoren.rs` (nur Konstruktion von `Blockzufall`), `KR/tests/hilfe/mod.rs`, `KR/src/loopback.rs`, `KR/tests/loopback.rs`, `T/src/befehle.rs` (`richte_neu_ein`)

- [ ] **Step 1: Failing tests:**
  - `loopback`: Liste voll mit gelesenen Verbindungen, von denen eine einen halben Rückruf (`GET /rueckruf?code=…` ohne Kopfende) trägt, dazu eine Flut neuer Verbindungen. Danach kommt der Rest des halben Rückrufs → `Rueckruf::Code`. Heute verdrängt die Flut ihn, weil „gelesen“ auch „halb gelesen“ heißt.
  - `richte_neu_ein`: Ein Tresor-Fake, der beim Schreiben blockiert, bis der Test ihn freigibt, darf `lies_status` in einem zweiten Thread nicht blockieren. Heute läuft der Tresor-Zugriff unter dem Buch-Lock.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Umsetzen:**
  - `nimm_an` verdrängt bei voller Liste zuerst die älteste gelesene Verbindung **ohne** empfangene Bytes, danach die älteste, deren Puffer kein Präfix von `GET /rueckruf` ist. Sonst wird die neue abgewiesen.
  - `richte_neu_ein` liest und schreibt den Tresor ohne Buch-Lock:
    1. Unter Lock prüfen und die Einrichtung lesen.
    2. Ohne Lock das alte Token lesen und das neue schreiben.
    3. Unter Lock `Buch::richte_neu_ein`, dabei vorher erneut prüfen, dass Betrieb und `schluesselId` unverändert sind.
    4. Scheitert das: ohne Lock das alte Token zurücklegen.
  - `Blockzufall`: Felder privat, kein `Clone`/`Copy`, Zugriff nur über `versiegele`. Für Vektoren und Tests einen Konstruktor `Blockzufall::fest(cek, iv, ephemer, umschlag_iv)` hinter einem Cargo-Feature `testhilfe`. `KR/Cargo.toml` aktiviert es für die eigenen Integrationstests über `[dev-dependencies] einsatzbuch-kern = { path = ".", features = ["testhilfe"] }` oder den gleichwertigen, in der Cargo-Doku belegten Weg. Die Hülle aktiviert es nicht, nachzuprüfen per `cargo tree -e features -p einsatzbuch`.
  - HKDF: `hmac` und `sha2` mit Feature `zeroize` als direkte Abhängigkeiten, damit HMAC- und Hash-Zustand beim Drop gewischt werden. **Vorher im Quelltext** von `hmac` 0.13 / `digest` 0.11 (`~/.cargo/registry/src/*/`) belegen, dass das Feature `ZeroizeOnDrop` für den von `Hkdf` gehaltenen Zustand liefert, und die Stelle im Kommentar nennen. Liefert es das nicht: den PRK selbst über `Hkdf::extract` + `Zeroizing` halten und das im Bericht als Grenze nennen.
- [ ] **Step 4:** Tore (Rust). `cargo tree -i ring` weiterhin leer.
- [ ] **Step 5:** Commit `fix(einsatzbuch): Loopback, Neu einrichten und Schlüsselmaterial gehärtet`.

### Task 9: Oberfläche — Export-Dialog, Berichtsblatt, Reader-Link

**Files:**
- Create: `A/src/logik/export.ts` (+ Test), `A/src/verwaltung/ExportDialog.tsx` (+ Test), `A/src/verwaltung/BerichtUeberlagerung.tsx` (+ Test)
- Modify: `A/src/seiten/Verwaltung.tsx`, `A/src/App.tsx`, `A/src/stil/app.css`, `A/e2e/verwaltung.spec.ts`, `A/e2e/stub.ts`

**Interfaces:**
- `baueExport(e: { bloecke: Block[]; umfang: "alle" | "einzeln"; gewaehlt: number | null; ceks: ReadonlyMap<number, Uint8Array>; anker: Exportanker | null; exportiertVon: string; quelle: string; erstellt: string; zeitzone: string; nummer: string | null }, kennwort: string): Promise<{ datei: Exportdatei; dateiname: string }>`.
  - Rein, ohne `invoke`: die Blockauswahl, `schluessel` nur für die ausgewählten Blöcke (als `zuBase64`), der Kopf `{erstellt, umfang, von, bis, anzahl, quelle}` und der Dateiname.
  - Das E2E-Skript (Task 11) importiert **dieses** Modul.
- `ExportDialog` nach der Vorlage:
  - zwei Umfang-Knöpfe;
  - „Kennwort für die Datei“ und „Kennwort wiederholen“, Fehler bei unter 10 Zeichen oder ungleich;
  - Hinweiszeilen mit „PBKDF2, 600.000 Runden“;
  - „Gespeichert als …“ mit „Im Reader öffnen“;
  - Knopf gesperrt, solange es läuft.
  - Ablauf: `schluesselFreigeben(bloecke)`, dann `baueExport`, dann `exportSpeichern`. Danach die CEK-Bytes mit `fill(0)` überschreiben und die Kennwortfelder leeren.
- `BerichtUeberlagerung`: `Berichtsblatt` aus `@kern/ansichten/Berichtsblatt` mit `bericht(block, einsatz, {pruefung, quelle, erzeugt, zeitzone})` aus `@kern/bericht`, „Schließen“ und „Als PDF speichern“ (→ `befehle.drucken()`). Die Druckregeln hängen am eigenen Rahmen: Beim Druck ist nur die Überlagerung sichtbar, `@page` ist benannt (Falle 18).
- In `Verwaltung.tsx`:
  - „Herunterladen“ im Kopf, gesperrt ohne offene Blöcke;
  - „PDF erzeugen“ im Detail.

- [ ] **Step 1: Failing tests:**
  - `export.test.ts`: `entschluesseleExport` aus `K` öffnet das Ergebnis. „einzeln“ trägt genau einen Block und einen Schlüssel; der Anker wird übernommen; Dateinamen für beide Umfänge. Kennwort unter 10 Zeichen → Fehler.
  - Dialog-Tests mit dem DOM-Harness `R/src/app/m/qr/_lib/test-dom.tsx`.
  - Playwright gegen den Vite-Stub: Anmelden → Detail → Herunterladen → Kennwort zweimal → „Gespeichert als einsatzbuch_…“. Der Stub prüft, dass `export_speichern` eine Exportdatei der Version 2 erhielt.
- [ ] **Step 2–4:** FAIL, umsetzen, App-Tore.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Export und Berichtsblatt am Rechner`.

### Task 10: Oberfläche — Einstellungen (Sicherung, Wiederherstellen, Autostart), Fehlergrenze, Statusreihenfolge

**Files:**
- Create: `A/src/verwaltung/Einstellungen.tsx` (+ Test), `A/src/logik/sicherung.ts` (+ Test), `A/src/bausteine/Fehlergrenze.tsx` (+ Test)
- Modify: `A/src/App.tsx`, `A/src/seiten/Verwaltung.tsx`, `A/src/App.test.tsx`, `A/src/stil/app.css`, `A/e2e/verwaltung.spec.ts`, `A/e2e/stub.ts`

- [ ] **Step 1: Failing tests:**
  - `sicherung.test.ts`: Texte je Stufe. Beispiele: „Letzte Sicherung: 24.09.2026, 18:42 Uhr — Ordner nicht erreichbar“ (gelb), „Noch kein Sicherungsordner gewählt“ (gelb), Rot ab 7 Tagen, „Im Testbetrieb ist die automatische Sicherung aus.“
  - `Einstellungen`:
    - „Ordner wählen“ ruft `sicherungsordnerWaehlen`, danach wird der Status neu gelesen.
    - „Aus Sicherung wiederherstellen“ erscheint nur im Echtbetrieb, bei leerer Kette und mit Sitzung, erst nach einer Bestätigung. Das Ergebnis „n Blöcke wiederhergestellt“ bzw. der Fehlertext wörtlich.
    - Autostart-Schalter nur im Echtbetrieb.
  - `Fehlergrenze`: Wirft ein Kind (etwa ungültiges Datum im Klartext), steht statt einer weißen Seite ein Hinweis mit „Sitzung sperren“. Der Rest der App (Kopf, Erfassung) bleibt bedienbar.
  - Statusreihenfolge (`App.test.tsx`): Zwei `status`-Antworten kommen in umgekehrter Reihenfolge an (die ältere zuletzt). Übernommen wird nur die jüngere, belegt an einem Feld, das sich unterscheidet.
  - Neustart-Hinweis: Ein Status mit `versiegelung.verfallen = true` beim ersten Laden zeigt „Deine letzten Änderungen wurden nicht übernommen …“ (Text wörtlich aus `seiten/Versiegelt.tsx`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Umsetzen.** Sequenznummer in `laden()` und in jedem anderen `befehle.status()`-Aufruf von `App.tsx`: Eine Antwort wird nur übernommen, wenn keine jüngere Anfrage schon übernommen wurde.
- [ ] **Step 4:** App-Tore.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Einstellungen mit Sicherung und Wiederherstellen in der Verwaltung`.

### Task 11: Ende-zu-Ende-Lauf erweitert und Abnahme

**Files:**
- Modify: `T/examples/e2e_lauf.rs`
- Create: `R/scripts/einsatzbuch-e2e-export.ts`, `R/scripts/einsatzbuch-e2e-reader.ts`

**Ablauf des Treibers** (Stufe-5-Schritte bleiben, neu sind 5b und 5c):
1. Zustand.
2. Einrichten als Testrechner.
3. Erfassen, Frist 1 min, Versiegeln durch die Frist-Uhr.
4. Anker.
5. Anmelden, Freigabe, Lesen.
   - **5b Export:** `gib_schluessel_frei(z, None)` und `lies_bloecke`. Blöcke, CEKs und Anker (`lies_status(z)?.anker`) gehen per Datei an `scripts/einsatzbuch-e2e-export.ts`. Das Skript ruft `baueExport` aus `A/src/logik/export.ts` mit einem festen Kennwort aus der Umgebung (`E2E_EXPORT_KENNWORT`, Vorgabe ein Testwert ≥ 10 Zeichen) und gibt das Exportdatei-JSON auf stdout aus. Der Treiber schreibt es mit `export::speichere_export` (derselbe Code wie der Speichern-Befehl) nach `<steuerung>/e2e.einsatzbuch`. Die CEK-Datei wird danach gelöscht.
   - **5c Reader:** `scripts/einsatzbuch-e2e-reader.ts <suite> <datei> <kennwort>` startet Chromium über die Playwright-API. Dabei gelten `channel: "chromium"` und `--unsafely-treat-insecure-origin-as-secure=<suite>` wie `R/e2e/einsatzbuch-reader.spec.ts`, `devLogin` mit Gruppe `einsatzbuch-verwaltung`, danach `/reader`, `setInputFiles`, Kennwort und „Entschlüsseln“. Das Skript prüft „Kette intakt“, das Testband und Nummer und Stichwort im Detail und gibt je Prüfung eine Zeile aus.
6. Test-Rechner löschen.
7. Testbetrieb beenden.

- [ ] **Step 1:** Prüfen, ob `tsx` den Alias `@kern` aus `A/tsconfig.json` auflöst, wenn das Skript `A/src/logik/export.ts` importiert. Wenn nicht: `tsx --tsconfig A/tsconfig.json` oder ein relativer Import im Skript. Die Entscheidung festhalten.
- [ ] **Step 2:** Treiber und Skripte umsetzen.
- [ ] **Step 3: Abnahmelauf gegen die lokale Suite auf Port 4520,** Vorgehen wie `stufe5-abnahme.md` im Scratchpad:
  - `DATA_DIR=./.data/e2e-auslieferung`, Seed, Frist 1 min per `tsx`;
  - `next dev -p 4520` mit `AUTH_DEV_LOGIN=true` und dem Entwicklungs-KEK;
  - Treiber `E2E_SUITE_URL=http://einsatzbuch.localtest.me:4520`.
  - Belege in `<scratchpad>/stufe6-abnahme.md`: Treiberlog, Dev-Log-Zeilen (inkl. `GET /reader`), DB-Abfragen vorher/nach Schritt 4/nach Schritt 6 (`rechner`, `anker`, `sitzung`, `freigabe` mit den Blocknummern des Exports), Ausgabe des Reader-Skripts, Schlüsselbund vorher und nachher.
  - Danach eigenen Server beenden (nur den eigenen, per PID), `next-env.d.ts` zurücksetzen.
- [ ] **Step 4:** Commit `test(einsatzbuch): Ende-zu-Ende-Lauf bis zum Reader der Suite`.

### Task 12: Schluss — Tore, Gesamtreview, PR

- [ ] Volle Tore mit gemessenem Exit-Code:
  - Suite: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build`, Playwright `e2e/einsatzbuch-*.spec.ts`;
  - App: `pnpm --filter einsatzbuch typecheck|lint|test|e2e`;
  - Rust: `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`, `pnpm --filter einsatzbuch tauri build --debug --bundles app`.
- [ ] Review über den gesamten Diff der Stufe, Befunde in einer Fix-Runde.
- [ ] Push, PR gegen `claude/einsatzbuch-v2-stufe-5` (oder `main`, falls #300 inzwischen gemergt ist: dann `origin/main` einmergen). Deutsche Beschreibung, Schlusszeile `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Danach `gh pr view --json autoMergeRequest` → `null`.
- [ ] **Keine Release-Notiz in Stufe 6.** Die Notiz für App und Rechner-Teil kommt mit der Auslieferung (Stufe 7), denn vorher gibt es keine installierbare App.

---

## Nachträge aus der Umsetzung (Rulings)

- **Zu Entscheidung 1:** Auch die stündliche Runde sichert. Ein unveränderter letzter Hash ergibt `Unveraendert` ohne Schreiben und ohne Rotation und frischt `letzte_sicherung` auf. So wird eine gescheiterte Sicherung binnen einer Stunde wiederholt, und ein untätiger Rechner wird nicht nach 7 Tagen rot. „Ordner wählen“ sichert sofort im Befehl, der Anstoß `Sicherung` entfällt.
- **Zu Entscheidung 2:** Eine leere Kette mit erreichbarem Ordner ohne längere Datei gilt als gesichert (nichts zu sichern).
- **Zu Entscheidung 5:** `GET /api/anker` verlangt `?erster=<Hash von Block 1>` und wertet nur Rechner dieser Kette aus. Sonst verdrängten die Anker eines ausgefallenen Vorgängers mit anderer Kette eine gültige Sicherung.
- **Sperrreihenfolge, Ausnahme:** Ein Mutex `Zustand::sicherung` reiht die Sicherungsschreiber ein. Er steht vor `buch` (`sicherung` → `buch` → Blatt) und liegt vom Lesen der Blöcke bis zum Vermerk, auch über der Datei-I/O im Sicherungsordner. Die Suite-Meldung liegt außerhalb. Kein Pfad der Oberfläche außer „Ordner wählen“ wartet auf ihn.
- **Windows:** `std::fs::rename` ersetzt vorhandene Dateien schon; das Ziel wird nur nach einem verweigerten Umbenennen entfernt und dann einmal neu versucht.
- **Aufräumtakt der Suite:** Modul-`let`-Wache wie das Vorbild `starteRadioHintergrund`, keine `globalThis`-Wache.
- **E2E:** Die Root-`tsconfig.json` kennt den Alias `@kern/*`, weil das Export-Skript das App-Modul `logik/export.ts` importiert.
