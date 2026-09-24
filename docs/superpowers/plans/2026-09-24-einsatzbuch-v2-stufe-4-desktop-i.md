# Einsatzbuch v2 — Stufe 4: Desktop I — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Desktop-App `apps/einsatzbuch` erfasst einen Einsatz ohne Anmeldung, hält ihn während der Frist änderbar und versiegelt ihn in Rust. Die Blöcke gleichen byte-genau denen des TypeScript-Kerns. Die Suite bleibt mit dem neuen Workspace-Mitglied in allen Toren grün, der Docker-Build eingeschlossen.

**Architecture:** Die App ist ein pnpm-Workspace-Mitglied (Vite + React 19) und nutzt den geteilten Kern per Alias `@kern`. `src-tauri/` ist ein Cargo-Workspace mit zwei Crates:
- **`einsatzbuch-kern`** (`src-tauri/kern/`) ist frei von Tauri und enthält JCS, Kryptografie, SQLite, Erfassung, Versiegeln, Frist und Einrichtung. Seine Tests laufen ohne `dist/` und ohne Webview-Pakete, auch unter Windows.
- **`einsatzbuch`** (`src-tauri/`) ist die Tauri-Hülle mit Plugins, Befehlen, Frist-Thread und Fensteraufbau.

Die Oberfläche fragt den Zustand per Polling über `status()` ab. Rust entscheidet allein über Frist und Versiegeln.

**Tech Stack:**
- Rust Edition 2024, Tauri 2 (`tauri = "2"`, nicht die 3.0-Alphas)
- Plugins `single-instance`, `autostart`, `dialog`, `opener` (je `"2"`)
- `rusqlite` (`bundled`), RustCrypto (`p256`, `hkdf`, `aes-gcm`, `sha2`), `base64`, `chrono` + `chrono-tz`, `getrandom`, `zeroize`
- TypeScript 6, React 19.2, Vite 8, Vitest 4, Playwright

**Spec:** `docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md` (§2.2, §3, §4.1–4.3, §9.1, §9.3, §11 Stufe 4, §12)

**Ticket:** DRK-471. ClickUp pflegt der Hauptlauf, nicht diese Phase.

**Arbeitskopie:** `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-desktop`, Branch `claude/einsatzbuch-v2-stufe-4`, PR-Basis `claude/einsatzbuch-v2-tauri-2471b2`. **Nur absolute Pfade.** Keine Worktrees unter `.claude/worktrees/`, kein `isolation: "worktree"`.

Im Folgenden gelten diese Abkürzungen:
- `R` = `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-desktop`
- `A` = `R/apps/einsatzbuch`
- `T` = `A/src-tauri`
- `KR` = `T/kern`
- `K` = `R/src/app/m/einsatzbuch/_lib/kern` (geteilter TS-Kern, **nicht ändern**)

## Global Constraints

- **Sprache:** Deutsche Texte mit echten Umlauten, auch in Rust-Kommentaren und Fehlermeldungen. Bezeichner, Datei- und Branchnamen bleiben ASCII.
- **Format-Vertrag ist eingefroren.** `K/testvektoren/eingaben.json` und `erwartet.json` werden nur gelesen. Nie `scripts/einsatzbuch-testvektoren.ts --neu`. Der TS-Kern wird nicht geändert. Einzige, vom Hauptlauf beauftragte Ausnahme: die **additiven** JCS-Vektoren `K/testvektoren/kanonisch-faelle.ts`, `kanonisch.json` und `kanonisch.test.ts` (Task 2, im Bericht melden).
- **Maßgeblich ist der Kern-Code auf `49b581bc`**:
  - Blockkopf-Schlüssel: `v, block, prev, versiegelt, schluesselId, umgebung`
  - Hash: SHA-256-Hex über JCS(`{kopf, iv, daten, umschlag}`)
  - AAD: UTF-8(JCS(kopf)), für Nutzdaten **und** Umschlag
  - KEK: HKDF-SHA256 mit Salt `None` (entspricht dem leeren Salt), Info `einsatzbuch/v1/umschlag`, 32 Byte; IKM ist die ECDH-x-Koordinate (32 Byte)
  - AES-256-GCM, Ausgabe ct‖tag, Umschlag-`ct` 48 Byte
  - `epk`: SEC1 unkomprimiert, 65 Byte, beginnt mit `0x04`
  - Base64: Standardalphabet mit Padding
  - `schluesselId`: erste 16 Hex-Zeichen von SHA-256(SPKI-DER)
  - Zeitpunkt nach `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$`
- **JCS in Rust mit ausdrücklicher Sortierung** der Objektschlüssel nach UTF-16-Codeeinheiten, nie über die Reihenfolge von `serde_json::Map`. Maskierung wie `JSON.stringify`:
  - `\b \f \n \r \t` als Kurzform;
  - sonst `\u00xx` mit Kleinbuchstaben, nur für Zeichen < 0x20;
  - `"` und `\\` maskiert;
  - Nicht-ASCII, U+2028 und DEL (0x7F) bleiben roh;
  - nur ganze Zahlen im Bereich ±(2^53−1).
- **Kein `ring`.** Der CI-Schritt `cargo tree -i ring` muss „nichts gefunden“ melden.
- **Stufe-4-Schalter nur in Debug-Builds** (`cfg(debug_assertions)`): Entwickler-Einrichtung, `include_str!` von `eingaben.json` (trägt einen privaten Testschlüssel) und die Anmelde-URL auf stdout.
- **Zeitzone:** Nummernjahr und `versiegelt` rechnen in der Zone aus `einrichtung.zeitzone` (Vorgabe im Entwicklerweg: `Europe/Berlin`). `versiegelt` wird als `%Y-%m-%dT%H:%M:%S%:z` geschrieben. In TypeScript nie `timeZone` als Literal auf Modulebene.
- **Testbetrieb (§12):**
  - DB-Datei `einsatzbuch-test.db`, sonst `einsatzbuch.db`, beide im `app_data_dir`;
  - Nummern `T-JJJJ-NNN`;
  - Kopf immer `umgebung: "test"`;
  - dauerhaftes gestreiftes Band „TESTBETRIEB — nichts hiervon ist ein echter Einsatz“;
  - „Testbetrieb beenden“ löscht die Datei samt `-wal`/`-shm`.
- **Kommentaranker** (`R/CLAUDE.md`): Anker ins eigene Repo nennen einen Namen, keine Zeile. Anker ins Einsatzarchiv tragen das Repo-Präfix (`einsatztagebuch/…`). `src/core/kommentaranker.test.ts` scannt per `git ls-files` auch `apps/`.
- **Commits:**
  - signiert (`git commit -S`), `git log --format='%h %G?'` zeigt `G`;
  - Kopfzeile `feat(einsatzbuch): …` für Neues, `build(einsatzbuch): …`/`ci(einsatzbuch): …`/`test(einsatzbuch): …` sonst;
  - Body enthält `DRK-471`, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Suite-Tore nach jedem Task, der Dateien unter `apps/` oder im Root anlegt:** `pnpm vitest run` vollständig, nicht nur die eigene Datei. Die Scanner `kommentaranker`, `nullbyte`, `lfs-medien` und `docker-kontext` sehen `apps/` über `git ls-files`. Vor einem Urteil über einen roten Lauf `uptime` und `pgrep -fl "playwright|next-server"` prüfen. Bei zweistelliger Last die Datei einzeln nachfahren.
- **Fremde Prozesse nie beenden.** Kein offener `pnpm dev` der Suite während Playwright.

**Entscheidungen, wo die Spec offen ist** (jede ist im Bericht zu nennen):
1. **Cargo-Workspace mit tauri-freiem Kern-Crate.** `tauri::generate_context!` bricht ohne `dist/` schon beim Kompilieren (Lehre `einsatztagebuch/.github/workflows/ci.yml`, Kopfkommentar). Die Vektor-, DB- und Frist-Tests dürfen davon nicht abhängen.
2. **Nummernjahr = Kalenderjahr des Versiegelns in der Suite-Zone**, wie in der Vorlage (`versiegeln` nimmt `d.getFullYear()` beim Versiegeln). Beispiel: 01.01.2027 00:30 Berlin (= 31.12.2026 23:30 UTC) ergibt `2027-001`.
3. **Betriebsart aus der Datei:** Liegt `einsatzbuch-test.db` im `app_data_dir`, ist Testbetrieb. Sonst gilt `einsatzbuch.db`, falls vorhanden. Liegt keine Datei vor, ist der Rechner „nicht eingerichtet“ und es wird keine DB geöffnet. Die Einrichtungsfrage beim ersten Start kommt in Stufe 5.
4. **Schnappschüsse:** Beim Absenden werden die IDs gegen die Stammdaten aufgelöst und als `schnappschuss` in `ausstehend` gespeichert.
   - Beim Versiegeln wird erneut aus den aktuellen Stammdaten aufgelöst. Eine inzwischen verschwundene ID fällt auf den gespeicherten Schnappschuss zurück.
   - Eine automatische Versiegelung darf nie an geänderten Stammdaten scheitern.
5. **`verfallen`:** Die automatische Versiegelung meldet `verfallen = true`, wenn zu diesem Zeitpunkt eine `entwurf`-Zeile existierte, also ungespeicherte Bearbeitung während der Frist.
   - Die Oberfläche ODER-verknüpft das mit ihrem eigenen „geändert, aber noch nicht gespeichert“.
   - „Jetzt versiegeln“ setzt `verfallen = false`, denn dann gibt es keinen Bearbeitungsstand.
6. **Polling statt Tauri-Events:**
   - Die Oberfläche zählt lokal herunter. Bei 0 ruft sie `frist_pruefen`, sonst `status` alle 5 s.
   - Rust entscheidet mit seiner eigenen Uhr.
   - Der Playwright-Stub braucht so kein Event-System.
7. **Fenster erst nach der Frist-Prüfung:** Das Fenster steht in `tauri.conf.json` mit `"create": false` und entsteht in `setup` per `WebviewWindowBuilder::from_config`, nachdem `pruefe_frist` gelaufen ist.
8. **Autostart:**
   - Das Plugin ist registriert, dazu die Befehle `autostart_status`/`autostart_setzen` für die Verwaltung.
   - Eingeschaltet wird per Vorgabe bei der **echten** Einrichtung (Stufe 5), nie im Testbetrieb und nie in Debug-Builds. Sonst trüge jeder Entwicklerlauf die App in den Autostart des Entwicklerrechners ein.
9. **Anmeldung:**
   - Der Knopf „Verwaltung · Anmelden“ der Willkommensseite fehlt in Stufe 4. Anmeldung und Verwaltung kommen in Stufe 5.
   - Nicht eingerichtet zeigt die App „Rechner ist noch nicht eingerichtet“. Nur in Debug-Builds gibt es darunter den Entwicklerweg.
   - `anmeldung::oeffne_anmelde_url` (opener bzw. stdout) ist gebaut und getestet, aber nicht verdrahtet.
10. **identifier** `dev.rubeen.iuksuite.einsatzbuch`. Das `app_data_dir` unter macOS ist `~/Library/Application Support/dev.rubeen.iuksuite.einsatzbuch/`.
11. **Ports:**
    - `tauri dev` nutzt Vite auf **1471** mit `strictPort`. Das ist nicht 1420 wie im Einsatzarchiv.
    - Playwright der App nutzt `E2E_PORTS.web + 4` aus `R/e2e/helpers/ports.ts`, also Platz 5 im Zehnerblock der Arbeitskopie; im Hauptcheckout 3104.
12. **Nicht anwendbare Suite-Tore:**
    - `coverage-manifest.json` und `audit/catalog.ts`: kein Route Handler, keine Server Action, keine Suite-Tabelle. Die lokalen SQLite-Tabellen gehören der App.
    - `e2e/gruppen.json`: Die App-Spec liegt unter `A/e2e/` und läuft in `einsatzbuch.yml`. `scripts/e2e-gruppen.test.ts` globbt nur `R/e2e/`; Task 9 prüft das.
    - Release-Notiz: keine, denn das Modul steht nicht im Umschalter.
13. **App-Lint:** Eigene `A/eslint.config.js` (typescript-eslint + react-hooks). Die Root-ESLint ignoriert `apps/**`.
14. **DOM-Tests der App** nutzen das Suite-Harness `R/src/app/m/qr/_lib/test-dom.tsx` über einen relativen Import. Ein zweites Harness wird nicht gebaut.
15. **CI-Installation:** `pnpm install --frozen-lockfile --ignore-scripts` über den ganzen Workspace.
    - Die Kern-Dateien unter `R/src/` lösen `react` aus dem Root-`node_modules` auf.
    - `--ignore-scripts` spart den Quellbau von `better-sqlite3` unter Windows. Die App braucht kein Install-Skript: esbuild und die Tauri-CLI kommen über optionale Plattformpakete.

## Review Focus

1. **Die Frist läuft ab, während die App geschlossen ist.** Der nächste Start versiegelt, bevor ein Fenster erscheint. Im Block steht der abgesendete Stand, nicht der Entwurf. Gepinnt in `KR/tests/frist.rs` (Task 5).
2. **Silvesternacht in Berlin** (01.01. 00:30 Ortszeit, UTC noch im alten Jahr) ergibt `2027-001`. Im Testbetrieb ergibt sie `T-2027-001`, und ein Test-Buch schreibt nie `echt`. Gepinnt in `KR/tests/versiegeln.rs` (Task 5).
3. **Notizen mit Emoji, U+2028, DEL, Tab, U+0001 und typografischen Anführungszeichen** führen in Rust zu demselben Hash wie in TypeScript. Eine Map in umgekehrter Einfügereihenfolge wird trotzdem sortiert. Gepinnt in `KR/tests/vektoren.rs` und `KR/src/jcs.rs` (Tasks 2 und 3).
4. **„Testbetrieb beenden“, während der Frist-Thread die Datei offen hält**, besonders unter Windows. Die Verbindung wird vorher geschlossen, und `-wal`/`-shm` verschwinden mit. Gepinnt in `KR/tests/buch.rs` (Task 4) und in der Windows-Matrix (Task 10).
5. **Absenden ohne Stichwort, ohne Beginn oder ohne Ort, auch unter Umgehung der Oberfläche**, lehnt Rust ab. Ein erneutes Absenden in der Frist verlängert sie nicht. Gepinnt in `KR/tests/erfassung.rs` (Task 5) und `A/src/logik/formular.test.ts` (Task 7).

---

## Dateistruktur

```
apps/einsatzbuch/
├── package.json                 Workspace-Mitglied "einsatzbuch"
├── index.html · vite.config.ts · vitest.config.ts · tsconfig.json · eslint.config.js
├── playwright.config.ts · e2e/erfassung.spec.ts · e2e/stub.ts
├── .gitignore
├── src/
│   ├── main.tsx                  Einstieg, Thema, Schriften
│   ├── App.tsx                   Zustandsmaschine der Erfassung
│   ├── befehle.ts                EINZIGE Naht zu Tauri (invoke), typisiert
│   ├── typen.ts                  Entwurf, Stammdaten, Status, Versiegelung … (Spiegel der Rust-DTOs)
│   ├── logik/formular.ts         Pflichtfelder, Dauer, Suche, Filter, Texte (rein, testbar)
│   ├── logik/formular.test.ts
│   ├── logik/ablauf.ts           Phasen aus Status ableiten, Restzeit (rein)
│   ├── logik/ablauf.test.ts
│   ├── stil/variablen.ts         CSS-Variablen aus @/core/theme/tokens (FARBEN)
│   ├── stil/variablen.test.ts
│   ├── stil/app.css              Vorlage-Variablen (--verw-*, --iuk-*), Dunkelmodus, Schriften
│   ├── stil/schrift/*.woff2      Barlow Condensed 600/700, Geist 400, Geist Mono 400
│   ├── bausteine/                Knopf, Karte, Feld, Hinweis, Symbol, Kopf, Testband, Bestaetigung
│   └── seiten/                   Willkommen, Formular, Frist, Versiegelt, NichtEingerichtet
└── src-tauri/
    ├── Cargo.toml                [workspace] + Paket "einsatzbuch" (Tauri-Hülle)
    ├── Cargo.lock · build.rs · tauri.conf.json · capabilities/default.json
    ├── icons/                    32x32.png 128x128.png 128x128@2x.png icon.png icon.icns icon.ico
    ├── src/main.rs · src/lib.rs · src/befehle.rs · src/zustand.rs
    └── kern/                     Crate "einsatzbuch-kern" (ohne Tauri)
        ├── Cargo.toml
        ├── src/lib.rs · jcs.rs · format.rs · krypto.rs · buch.rs · schema.sql
        ├── src/erfassung.rs · versiegeln.rs · uhr.rs · einrichtung.rs · anmeldung.rs
        ├── src/entwicklung.rs · entwicklung/stammdaten.json   (nur Debug)
        └── tests/vektoren.rs · buch.rs · erfassung.rs · versiegeln.rs · frist.rs · hilfe/mod.rs
.github/workflows/einsatzbuch.yml
```

Geändert werden:
- `R/pnpm-workspace.yaml`, `R/pnpm-lock.yaml`, `R/tsconfig.json`, `R/eslint.config.mjs`, `R/vitest.config.ts`, `R/.dockerignore`
- gegebenenfalls `R/Dockerfile` (je nach Messung in Task 1)
- `R/src/docker-kontext.test.ts`

---

### Task 1: Workspace, Werkzeug-Ausschlüsse, Docker-Build gemessen

**Files:**
- Create: `A/package.json`, `A/.gitignore`
- Modify: `R/pnpm-workspace.yaml`, `R/tsconfig.json`, `R/eslint.config.mjs`, `R/vitest.config.ts`, `R/.dockerignore`, `R/src/docker-kontext.test.ts`, `R/pnpm-lock.yaml`, gegebenenfalls `R/Dockerfile`

**Interfaces:**
- Produces: Workspace-Paket `einsatzbuch` mit den unten genannten Skripten. Alle folgenden Tasks installieren nur noch über `pnpm install` im Root.

- [ ] **Step 1: App-Manifest anlegen**

`A/package.json`. Die Versionsspezifikatoren sind absichtlich identisch zum Root, damit das Lockfile dieselben Auflösungen teilt:
```json
{
  "name": "einsatzbuch",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit -p tsconfig.json && vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json --pretty false",
    "lint": "eslint",
    "test": "vitest run",
    "e2e": "playwright test",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.11.1",
    "@tauri-apps/plugin-dialog": "^2.7.3",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@playwright/test": "^1.63.0",
    "@tauri-apps/cli": "^2.11.5",
    "@types/node": "^26.2.0",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^9.39.4",
    "eslint-plugin-react-hooks": "^7.1.1",
    "jsdom": "^30.1.0",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.70.1",
    "vite": "^8.1.5",
    "vitest": "^4.1.11"
  }
}
```
Plugin-Pakete für JS gibt es nur, wo die Oberfläche sie ruft. `dialog` wird für die Schlüsseldatei im Entwicklerweg gebraucht. `autostart` und `opener` bleiben in Stufe 4 reine Rust-Seite.

`A/.gitignore`:
```
node_modules
dist
test-results
playwright-report
src-tauri/target
src-tauri/gen/schemas
```

- [ ] **Step 2: Workspace eintragen und installieren**

`R/pnpm-workspace.yaml` bekommt als erste Zeile (vor `allowBuilds`):
```yaml
# Die Desktop-App des Einsatzbuchs ist ein eigenes Workspace-Mitglied (Spec §2.2); die Suite
# bleibt das Root-Paket. `apps` fehlt im Docker-Kontext (`.dockerignore`) — wie die deps-Stage
# damit umgeht, hält `src/docker-kontext.test.ts` fest.
packages:
  - "apps/*"
```
Run: `cd /Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-desktop && pnpm install`
Expected: Exit 0. `pnpm-lock.yaml` hat einen neuen Importer `apps/einsatzbuch`, und die Root-Importer sind unverändert (`git diff --stat pnpm-lock.yaml` prüfen, dass nur ergänzt wurde).

- [ ] **Step 3: Werkzeug-Ausschlüsse**

- `R/tsconfig.json`: `"exclude": ["node_modules", "apps/**"]`.
- `R/eslint.config.mjs`: In die `ignores` kommt `"apps/**"`. Der Kommentar bekommt einen Absatz: Die Desktop-App hat eine eigene Lint-Konfiguration (`apps/einsatzbuch/eslint.config.js`), die Next-Regeln passen dort nicht.
- `R/vitest.config.ts`: `exclude: [...configDefaults.exclude, "e2e/**", ".claude/**", "**/.next/**", "apps/**"]`. Dazu der Kommentar: Die App hat ihr eigenes Vitest mit anderer Umgebung und Aliasen.
- `R/.dockerignore`: Die Zeile `apps` kommt mit Kommentar dazu. Die Desktop-App gehört nicht ins Suite-Image, und ihr `src-tauri/target` wäre Gigabytes groß.

- [ ] **Step 4: Die deps-Stage messen, zuerst ohne Änderung am Dockerfile**

Run: `cd R && docker build --target deps -t iuk-suite-deps-test . 2>&1 | tail -30`
- **Grün:** Das Dockerfile bleibt unverändert. Weiter mit Step 5, Weg (a).
- **Rot** mit einer Lockfile-/Importer-Meldung: Ändere die Installationszeile im Dockerfile auf `RUN pnpm install --frozen-lockfile --filter iuk-suite...`, mit Kommentar und der gemessenen Fehlermeldung. Messe erneut, das ist Weg (b).
- **Weiter rot:** `.dockerignore` statt `apps` auf `apps/*/src`, `apps/*/src-tauri`, `apps/*/e2e` und `apps/*/node_modules` umstellen. Im Dockerfile nach `COPY patches ./patches` die Zeile `COPY apps/einsatzbuch/package.json ./apps/einsatzbuch/package.json` einfügen, das ist Weg (c). `!`-Ausnahmen sind verboten, der Matcher in `docker-kontext.test.ts` lehnt sie ab.

Halte den Weg und die Messung (Exit-Code, letzte Zeilen) für den Commit-Body fest.

- [ ] **Step 5: Die Zusicherung in `R/src/docker-kontext.test.ts`**

Hänge einen `describe`-Block an, der den gewählten Weg festhält. Für Weg (a) und (b):
```ts
describe("Workspace-Mitglied apps/einsatzbuch (Einsatzbuch-Desktop, Spec §2.2)", () => {
  it("apps liegt nicht im Docker-Kontext — die Desktop-App gehört nicht ins Suite-Image", () => {
    const muster = ignorierMuster();
    expect(muster.some((m) => m.test("apps/einsatzbuch/package.json"))).toBe(true);
    expect(muster.some((m) => m.test("apps/einsatzbuch/src-tauri/Cargo.toml"))).toBe(true);
  });
  it("pnpm-workspace.yaml führt apps/* als Mitglied", () => {
    expect(readFileSync(join(WURZEL, "pnpm-workspace.yaml"), "utf8")).toMatch(/^packages:\n\s+- "apps\/\*"/m);
  });
  it("die deps-Stage installiert so, wie in Stufe 4 gemessen", () => {
    const dockerfile = readFileSync(join(WURZEL, "Dockerfile"), "utf8");
    // Weg (a): unverändert `pnpm install --frozen-lockfile` — gemessen grün ohne apps/ im Kontext.
    // Weg (b): stattdessen expect(...).toContain("--filter iuk-suite...")
    expect(dockerfile).toMatch(/RUN pnpm install --frozen-lockfile/);
  });
});
```
Für Weg (c) gilt stattdessen: `apps/einsatzbuch/package.json` liegt im Kontext, `apps/einsatzbuch/src-tauri/Cargo.toml` nicht, und das Dockerfile enthält die `COPY`-Zeile. Nutze die im Test schon vorhandenen Helfer (`ignorierMuster`, `WURZEL`); lies die Datei, bevor du schreibst.

Run: `cd R && pnpm vitest run src/docker-kontext.test.ts`
Expected: PASS

- [ ] **Step 6: Voller Docker-Build**

Run: `cd R && docker build -t iuk-suite-stufe4-test . 2>&1 | tail -15; echo EXIT=$?`
Expected: `EXIT=0`. Dauer und Exit-Code notieren. Danach `docker image rm iuk-suite-stufe4-test iuk-suite-deps-test`, nur die eigenen Tags.

- [ ] **Step 7: Suite-Tore**

Run einzeln, jeweils mit `echo EXIT=$?`: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run`
Expected: alle `EXIT=0`. Bei hoher Last einzelne rote Dateien einzeln nachfahren.

- [ ] **Step 8: Commit**

```bash
cd /Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-desktop
git add apps/einsatzbuch/package.json apps/einsatzbuch/.gitignore pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json eslint.config.mjs vitest.config.ts .dockerignore src/docker-kontext.test.ts Dockerfile
git commit -S -m "build(einsatzbuch): Desktop-App als Workspace-Mitglied, Suite-Werkzeuge schließen apps/ aus" -m "<Weg (a|b|c) mit gemessener Docker-Ausgabe>

DRK-471

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kern-Crate, Formattypen und JCS

**Files:**
- Create: `T/Cargo.toml` (vorerst nur `[workspace]` mit `members = ["kern"]`, das App-Paket kommt in Task 6), `KR/Cargo.toml`, `KR/src/lib.rs`, `KR/src/jcs.rs`, `KR/src/format.rs`, `K/testvektoren/kanonisch-faelle.ts`, `K/testvektoren/kanonisch.json`
- Test: Unit-Tests in `KR/src/jcs.rs` (`#[cfg(test)] mod tests`), `KR/tests/kanonisch.rs`, `K/testvektoren/kanonisch.test.ts`

**Interfaces:**
- Produces:
  - `einsatzbuch_kern::jcs::kanonisch(wert: &serde_json::Value) -> Result<String, JcsFehler>`
  - `einsatzbuch_kern::format::{Einsatz, FahrzeugStand, PersonStand, Blockkopf, Umschlag, Block, Umgebung, GENESIS}`, alle mit `serde` und `#[serde(rename_all = "camelCase")]`, die Feldreihenfolge wie in `K/format.ts`.
  - `Umgebung` serialisiert als `"echt"`/`"test"`.
  - `Einsatz.v`, `Blockkopf.v`: `u8` mit Wert 1.
  - `Blockkopf.block`: `u64`.
  - `Einsatz.endeDatum`/`endeZeit`: `Option<String>`, serialisiert als `null`.
  - `vorOrt`/`transport`: `u32`.

- [ ] **Step 1: Cargo-Dateien**

`T/Cargo.toml`:
```toml
# Cargo-Workspace der Desktop-App. `kern` ist frei von Tauri: Vektor-, DB- und Frist-Tests
# laufen ohne `dist/` und ohne Webview-Pakete (Lehre aus einsatztagebuch/.github/workflows/ci.yml:
# `tauri::generate_context!` bricht ohne Frontend-Bau schon beim Kompilieren).
[workspace]
resolver = "3"
members = ["kern"]

[workspace.package]
edition = "2024"
rust-version = "1.85"
```
`KR/Cargo.toml`:
```toml
[package]
name = "einsatzbuch-kern"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish = false

[dependencies]
serde = { version = "1", features = ["derive"] }
# Bewusst OHNE `preserve_order` und `arbitrary_precision`. Die Kanonik sortiert trotzdem
# selbst (jcs.rs) — sie hängt nicht davon ab, welche Map-Art ein anderes Crate einschaltet.
serde_json = "1"
thiserror = "2"
```
`KR/src/lib.rs`:
```rust
//! Kern des Einsatzbuchs am Rechner: Format, Kanonik, Kryptografie, lokale Datenbank,
//! Erfassung, Frist und Versiegeln. Frei von Tauri — die Hülle liegt eine Ebene höher.
pub mod format;
pub mod jcs;
```

- [ ] **Step 2: Failing tests für JCS**

In `KR/src/jcs.rs` unten:
```rust
#[cfg(test)]
mod tests {
    use super::kanonisch;
    use serde_json::{json, Map, Value};

    #[test]
    fn sortiert_schluessel_ohne_leerraum_verschachtelt() {
        let v = json!({"b": 1, "a": [true, null, "x"], "c": {"z": "", "y": -3}});
        assert_eq!(kanonisch(&v).unwrap(), r#"{"a":[true,null,"x"],"b":1,"c":{"y":-3,"z":""}}"#);
    }

    #[test]
    fn sortiert_auch_bei_umgekehrter_einfuegereihenfolge() {
        // Mit `preserve_order` wäre die Map eine IndexMap in genau dieser Reihenfolge.
        let mut m = Map::new();
        for k in ["z", "b", "a", "10", "2", "1"] { m.insert(k.into(), json!(0)); }
        assert_eq!(kanonisch(&Value::Object(m)).unwrap(), r#"{"1":0,"10":0,"2":0,"a":0,"b":0,"z":0}"#);
    }

    #[test]
    fn maskiert_wie_json_stringify() {
        let s = "ä\n\"x\u{1}😀\t\u{8}\u{c}\r\\ \u{2028} \u{7f} \u{1f}";
        assert_eq!(
            kanonisch(&json!(s)).unwrap(),
            "\"ä\\n\\\"x\\u0001😀\\t\\b\\f\\r\\\\ \u{2028} \u{7f} \\u001f\""
        );
    }

    #[test]
    fn nur_sichere_ganze_zahlen() {
        assert_eq!(kanonisch(&json!(9007199254740991_i64)).unwrap(), "9007199254740991");
        assert_eq!(kanonisch(&json!(-9007199254740991_i64)).unwrap(), "-9007199254740991");
        assert!(kanonisch(&json!(9007199254740992_i64)).is_err());
        assert!(kanonisch(&json!(1.5)).is_err());
        assert!(kanonisch(&json!(u64::MAX)).is_err());
    }

    #[test]
    fn utf16_sortierung_nicht_bytes() {
        // U+FF61 (UTF-16 0xFF61) liegt nach U+1F600 in UTF-8-Bytes vorn, in UTF-16-Einheiten
        // (0xD83D…) aber hinten — JCS (RFC 8785 §3.2.3) sortiert nach UTF-16.
        let mut m = Map::new();
        m.insert("\u{ff61}".into(), json!(1));
        m.insert("\u{1f600}".into(), json!(2));
        assert_eq!(kanonisch(&Value::Object(m)).unwrap(), "{\"\u{1f600}\":2,\"\u{ff61}\":1}");
    }
}
```
Run: `cd T && cargo test -p einsatzbuch-kern jcs`
Expected: Kompilierfehler, `kanonisch` fehlt.

- [ ] **Step 3: Implementierung**

`KR/src/jcs.rs` (Kopf):
```rust
//! Kanonisches JSON nach RFC 8785 (JCS) für die Werte des Einsatzbuchs — Gegenstück zu
//! `kanonisch` in `src/app/m/einsatzbuch/_lib/kern/kanonisch.ts`. Schlüssel werden HIER
//! sortiert (UTF-16-Codeeinheiten), nie über die Reihenfolge von `serde_json::Map`:
//! schaltet irgendein Crate `preserve_order` ein, wird die Map still zur IndexMap.
use serde_json::Value;
use std::fmt::Write as _;

/// Grenze von `Number.isSafeInteger` — der TS-Kern lehnt alles darüber ab.
const SICHER: i64 = 9_007_199_254_740_991;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum JcsFehler {
    #[error("Nur ganze Zahlen im sicheren Bereich erlaubt: {0}")]
    KeineGanzeZahl(String),
}

pub fn kanonisch(wert: &Value) -> Result<String, JcsFehler> {
    let mut aus = String::new();
    schreibe(wert, &mut aus)?;
    Ok(aus)
}

fn schreibe(wert: &Value, aus: &mut String) -> Result<(), JcsFehler> {
    match wert {
        Value::Null => aus.push_str("null"),
        Value::Bool(b) => aus.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => match n.as_i64() {
            Some(i) if (-SICHER..=SICHER).contains(&i) => { let _ = write!(aus, "{i}"); }
            _ => return Err(JcsFehler::KeineGanzeZahl(n.to_string())),
        },
        Value::String(s) => maskiere(s, aus),
        Value::Array(a) => {
            aus.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 { aus.push(','); }
                schreibe(x, aus)?;
            }
            aus.push(']');
        }
        Value::Object(o) => {
            let mut eintraege: Vec<(&String, &Value)> = o.iter().collect();
            eintraege.sort_by(|(a, _), (b, _)| a.encode_utf16().cmp(b.encode_utf16()));
            aus.push('{');
            for (i, (k, v)) in eintraege.into_iter().enumerate() {
                if i > 0 { aus.push(','); }
                maskiere(k, aus);
                aus.push(':');
                schreibe(v, aus)?;
            }
            aus.push('}');
        }
    }
    Ok(())
}

/// Wie `JSON.stringify` für Zeichenketten: Kurzformen, `\u00xx` (klein) nur unter 0x20,
/// alles andere roh — auch Nicht-ASCII, U+2028 und DEL.
fn maskiere(s: &str, aus: &mut String) {
    aus.push('"');
    for c in s.chars() {
        match c {
            '"' => aus.push_str("\\\""),
            '\\' => aus.push_str("\\\\"),
            '\u{8}' => aus.push_str("\\b"),
            '\u{c}' => aus.push_str("\\f"),
            '\n' => aus.push_str("\\n"),
            '\r' => aus.push_str("\\r"),
            '\t' => aus.push_str("\\t"),
            c if (c as u32) < 0x20 => { let _ = write!(aus, "\\u{:04x}", c as u32); }
            c => aus.push(c),
        }
    }
    aus.push('"');
}
```
`serde_json` weist einzelne Surrogate beim Parsen ab, und ein Rust-`String` kann keine enthalten. Die Surrogat-Prüfung des TS-Kerns ist hier also strukturell erfüllt. Das gehört als Satz in den Modulkommentar.

`KR/src/format.rs`: Serde-Strukturen nach dem Interface-Block. `GENESIS: &str` mit 64 Nullen. Zusätzlich:
```rust
impl Blockkopf { pub fn kanonisch(&self) -> String { crate::jcs::kanonisch(&serde_json::to_value(self).expect("Blockkopf ist serialisierbar")).expect("Blockkopf trägt nur sichere Zahlen") } }
impl Einsatz { pub fn kanonisch(&self) -> Result<String, crate::jcs::JcsFehler> { crate::jcs::kanonisch(&serde_json::to_value(self).expect("Einsatz ist serialisierbar")) } }
```

- [ ] **Step 4: Tests grün, dazu die Abhängigkeitsmessung**

Run: `cd T && cargo test -p einsatzbuch-kern && cargo tree -p einsatzbuch-kern -e features -i serde_json | grep -E "preserve_order|arbitrary_precision" ; echo GREP_EXIT=$?`
Expected: Tests PASS, `GREP_EXIT=1` (kein Treffer).

- [ ] **Step 5: Zusätzliche JCS-Vektoren im Kern (Auftrag des Hauptlaufs, additiv)**

Die Blockvektoren decken `umgebung: "test"` und einige Maskierungen nicht ab. Diese Dateien kommen **neu** in den Kern: `eingaben.json`, `erwartet.json` und alle bestehenden Kern-Dateien bleiben unverändert, und es gibt **kein** `--neu`.
- `K/testvektoren/kanonisch-faelle.ts` (nur relative Importe, Grenztest!):
  ```ts
  import { kanonisch } from "../kanonisch";
  import { GENESIS, type Blockkopf } from "../format";

  /**
   * JCS-Randfälle, die die Blockvektoren nicht abdecken — Format-Vertrag mit der Rust-Kanonik
   * der Desktop-App (`apps/einsatzbuch/src-tauri/kern/tests/kanonisch.rs`). Die Datei
   * `kanonisch.json` ist aus dieser Liste erzeugt; `kanonisch.test.ts` rechnet sie nach.
   */
  const TESTKOPF: Blockkopf = { v: 1, block: 7, prev: GENESIS, versiegelt: "2027-01-01T00:30:00+01:00", schluesselId: "0123456789abcdef", umgebung: "test" };
  export const KANONISCH_FAELLE: { name: string; wert: unknown }[] = [
    { name: "blockkopf-test", wert: TESTKOPF },
    { name: "steuerzeichen", wert: "\u0000\u0001\u0008\u0009\u000a\u000b\u000c\u000d\u001f " },
    { name: "rueckstrich-und-anfuehrung", wert: "a\\b\"c/d" },
    { name: "roh-bleibt-roh", wert: "ä ß „x“ 😀     \u007f \u0080 ﻿" },
    { name: "schluesselsortierung", wert: { b: 1, a: { z: [3, 2, 1], "": null, "10": true, "2": false }, "ä": "x", A: "y" } },
    { name: "zahlen", wert: [0, -0, 1, -1, 999, 9007199254740991, -9007199254740991] },
    { name: "leer", wert: { o: {}, a: [], s: "" } },
  ];
  export function erzeugeKanonisch(): { name: string; wert: unknown; kanonisch: string }[] {
    return KANONISCH_FAELLE.map((f) => ({ ...f, kanonisch: kanonisch(f.wert) }));
  }
  ```
  Achtung: `-0` wird von `JSON.stringify` als `0` geschrieben. Die Datei trägt deshalb schon im `wert` eine `0`. Das ist korrekt, und Rust sieht beim Parsen ebenfalls `0`.
- `K/testvektoren/kanonisch.json` wird einmal erzeugt:
  ```bash
  cd R && pnpm exec tsx -e 'import("./src/app/m/einsatzbuch/_lib/kern/testvektoren/kanonisch-faelle.ts").then(async (m) => (await import("node:fs")).writeFileSync("src/app/m/einsatzbuch/_lib/kern/testvektoren/kanonisch.json", JSON.stringify(m.erzeugeKanonisch(), null, 2) + "\n"))'
  ```
- `K/testvektoren/kanonisch.test.ts`: `readFileSync(path.join(__dirname, "kanonisch.json"), "utf8")` muss gleich `JSON.stringify(erzeugeKanonisch(), null, 2) + "\n"` sein. Ein zweiter Test prüft `JSON.parse(f.kanonisch)` gegen `f.wert` per `toEqual` (Rundlauf).
- `KR/tests/kanonisch.rs`: liest `kanonisch.json` über den relativen Pfad wie Task 3 und prüft für jeden Fall `jcs::kanonisch(&fall["wert"]) == fall["kanonisch"]` **byte-gleich**. Der Fall `blockkopf-test` wird zusätzlich als `format::Blockkopf` deserialisiert, und `kopf.kanonisch()` muss denselben String ergeben. Damit ist `Umgebung::Test` → `"test"` gepinnt.

Run: `cd R && pnpm vitest run src/app/m/einsatzbuch/_lib/kern` (inklusive `grenze.test.ts`) und `cd T && cargo test -p einsatzbuch-kern`
Expected: PASS

**Rust prüft in Stufe 4 keine Ketten.** Die Kettenprüfung am Rechner ist Verwaltung (Stufe 5/6) und läuft dort über den TS-Kern (`pruefeKette`). Braucht Stufe 6 sie für die Wiederherstellung in Rust, dann gegen `erwartet.json → negativ` (`ok`/`block`).

- [ ] **Step 6: Commit** — `feat(einsatzbuch): Rust-Kern mit Formattypen und kanonischem JSON, JCS-Randfälle als geteilte Vektoren` (Body mit DRK-471, Hinweis „Kern additiv: testvektoren/kanonisch*.{ts,json}“ und Co-Authored-By; `T/Cargo.lock` mit einchecken).

---

### Task 3: Kryptografie und byte-genauer Vektorvergleich

**Files:**
- Create: `KR/src/krypto.rs`, `KR/tests/vektoren.rs`
- Modify: `KR/Cargo.toml`, `KR/src/lib.rs`

**Interfaces:**
- Consumes: `jcs::kanonisch`, `format::*` (Task 2)
- Produces:
  ```rust
  pub trait Zufall { fn fuelle(&mut self, puffer: &mut [u8]); }
  pub struct SystemZufall;                                  // getrandom::fill
  pub fn schluessel_id(spki_der: &[u8]) -> String;          // 16 Hex-Zeichen
  pub fn oeffentlich_aus_spki(spki_der: &[u8]) -> Result<p256::PublicKey, KryptoFehler>;
  pub struct Blockzufall { pub cek: [u8; 32], pub iv: [u8; 12], pub ephemer: p256::SecretKey, pub umschlag_iv: [u8; 12] }
  impl Blockzufall { pub fn ziehe(z: &mut dyn Zufall) -> Blockzufall }  // Ephemerschlüssel: 32 Zufallsbytes → SecretKey::from_slice, bei ungültigem Skalar neu ziehen
  pub fn versiegele(einsatz: &Einsatz, kopf: &Blockkopf, suite: &p256::PublicKey, z: Blockzufall) -> Result<Block, KryptoFehler>;
  pub fn sha256_hex(bytes: &[u8]) -> String;
  pub fn b64(bytes: &[u8]) -> String;  pub fn aus_b64(text: &str) -> Result<Vec<u8>, KryptoFehler>;
  ```
  `versiegele` prüft `kopf.schluessel_id == schluessel_id(SPKI von suite)` wie `versiegele` in `K/block.ts` und überschreibt den CEK zum Schluss mit `zeroize`.

- [ ] **Step 1: Abhängigkeiten**

In `KR/Cargo.toml`:
```toml
p256 = { version = "0.14", features = ["ecdh", "pkcs8"] }
hkdf = "0.13"
sha2 = "0.11"
aes-gcm = "0.11"
base64 = "0.23"
getrandom = "0.4"
zeroize = "1"
```
Das ist der kohärente RustCrypto-Stand von 2026 (`hybrid-array`). Kompiliert er nicht zusammen, gilt der Rückfall auf den ebenfalls kohärenten Satz `p256 0.13`, `hkdf 0.12`, `sha2 0.10`, `aes-gcm 0.10`, `base64 0.22`, `getrandom 0.2`. Mischen ist nicht erlaubt. Halte den gewählten Satz im Commit-Body fest.

- [ ] **Step 2: Failing test gegen die Vektoren**

`KR/tests/vektoren.rs`:
```rust
//! Format-Vertrag mit dem TS-Kern: `src/app/m/einsatzbuch/_lib/kern/testvektoren/`
//! (`erzeuge.ts`, `erzeugeErwartung`). Gleiche Eingaben → byte-gleiche Blöcke.
use base64::Engine as _;
use einsatzbuch_kern::format::{Block, Blockkopf, Einsatz, Umgebung, GENESIS};
use einsatzbuch_kern::krypto::{self, Blockzufall};
use serde_json::Value;
use std::path::PathBuf;

fn vektor(datei: &str) -> Value {
    let pfad = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren")
        .join(datei);
    serde_json::from_str(&std::fs::read_to_string(&pfad).unwrap_or_else(|e| panic!("{}: {e}", pfad.display()))).unwrap()
}

fn b64url(s: &str) -> Vec<u8> { base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(s).unwrap() }
fn b64(s: &str) -> Vec<u8> { krypto::aus_b64(s).unwrap() }

#[test]
fn versiegelt_die_vektoren_byte_genau() {
    let eingaben = vektor("eingaben.json");
    let erwartet = vektor("erwartet.json");
    let spki = b64(eingaben["suite"]["oeffentlichSpki"].as_str().unwrap());
    let suite = krypto::oeffentlich_aus_spki(&spki).unwrap();
    let schluessel_id = krypto::schluessel_id(&spki);
    assert_eq!(schluessel_id, erwartet["schluesselId"].as_str().unwrap());

    let einsaetze: Vec<Einsatz> = serde_json::from_value(eingaben["einsaetze"].clone()).unwrap();
    let mut prev = GENESIS.to_string();
    for (i, einsatz) in einsaetze.iter().enumerate() {
        let z = &eingaben["bloecke"][i];
        let kopf = Blockkopf { v: 1, block: i as u64 + 1, prev: prev.clone(), versiegelt: z["versiegelt"].as_str().unwrap().into(), schluessel_id: schluessel_id.clone(), umgebung: Umgebung::Echt };
        let zufall = Blockzufall {
            cek: b64(z["cek"].as_str().unwrap()).try_into().unwrap(),
            iv: b64(z["iv"].as_str().unwrap()).try_into().unwrap(),
            ephemer: p256::SecretKey::from_slice(&b64url(z["umschlag"]["ephemer"]["d"].as_str().unwrap())).unwrap(),
            umschlag_iv: b64(z["umschlag"]["iv"].as_str().unwrap()).try_into().unwrap(),
        };
        let block: Block = krypto::versiegele(einsatz, &kopf, &suite, zufall).unwrap();
        let soll = &erwartet["bloecke"][i];
        assert_eq!(block.hash, soll["hash"].as_str().unwrap(), "Hash Block {}", i + 1);
        assert_eq!(block.daten, soll["daten"].as_str().unwrap(), "Chiffrat Block {}", i + 1);
        assert_eq!(block.iv, soll["iv"].as_str().unwrap());
        assert_eq!(serde_json::to_value(&block.umschlag).unwrap(), soll["umschlag"], "Umschlag Block {}", i + 1);
        assert_eq!(serde_json::to_value(&block).unwrap(), *soll, "ganzer Block {}", i + 1);
        prev = block.hash;
    }
}

#[test]
fn ephemerer_oeffentlicher_schluessel_passt_zum_jwk() {
    // Schützt den Test selbst: x/y des JWK gehören zum `d`, das wir benutzen.
    let eingaben = vektor("eingaben.json");
    let jwk = &eingaben["bloecke"][0]["umschlag"]["ephemer"];
    let geheim = p256::SecretKey::from_slice(&b64url(jwk["d"].as_str().unwrap())).unwrap();
    let punkt = geheim.public_key().to_encoded_point(false);
    assert_eq!(punkt.x().unwrap().as_slice(), b64url(jwk["x"].as_str().unwrap()).as_slice());
    assert_eq!(punkt.y().unwrap().as_slice(), b64url(jwk["y"].as_str().unwrap()).as_slice());
}
```
Dazu ein Längen-Test (Vertrag des Kerns, `mitLaenge` in `K/bytes.ts`): `aus_b64(iv)` und `aus_b64(umschlag.iv)` haben 12 Byte, `aus_b64(epk)` 65 Byte mit erstem Byte `0x04`, `aus_b64(umschlag.ct)` 48 Byte, und jedes Base64-Feld ist kanonisch (`b64(aus_b64(x)) == x`). Außerdem ein Rundlauf-Test mit dem privaten Vektor-Suiteschlüssel. `packe_aus` steht **nur im Test** (ECDH mit Suite-`d`, HKDF, AES-GCM-Decrypt mit AAD = JCS(kopf)):
- `SystemZufall` versiegelt einen Einsatz;
- der Umschlag packt auf 32 Byte aus;
- der CEK öffnet `daten` zu genau `einsatz.kanonisch()`;
- ein veränderter Kopf (`versiegelt` geändert) lässt das Auspacken scheitern.

Die Namen der Encoded-Point-Methoden hängen an der p256-Version (`to_encoded_point`/`to_sec1_point`). Nimm die der gewählten Fassung.

Run: `cd T && cargo test -p einsatzbuch-kern --test vektoren`
Expected: Kompilierfehler, `krypto` fehlt.

- [ ] **Step 3: `krypto.rs` implementieren**

Kernablauf, 1:1 zu `K/block.ts` und `K/umschlag.ts`:
```rust
pub fn versiegele(einsatz: &Einsatz, kopf: &Blockkopf, suite: &PublicKey, mut z: Blockzufall) -> Result<Block, KryptoFehler> {
    let spki = suite.to_public_key_der()?;            // pkcs8::EncodePublicKey
    if kopf.schluessel_id != schluessel_id(spki.as_bytes()) { return Err(KryptoFehler::SchluesselIdPasstNicht); }
    let aad = kopf.kanonisch();
    let klar = einsatz.kanonisch()?;
    let daten = Aes256Gcm::new(&z.cek.into()).encrypt(&z.iv.into(), Payload { msg: klar.as_bytes(), aad: aad.as_bytes() })?;
    // ECDH-ES: geteiltes Geheimnis = x-Koordinate (32 Byte) → HKDF-SHA256, Salt None, feste Info.
    let geteilt = p256::ecdh::diffie_hellman(z.ephemer.to_nonzero_scalar(), suite.as_affine());
    let mut kek = [0u8; 32];
    Hkdf::<Sha256>::new(None, geteilt.raw_secret_bytes()).expand(b"einsatzbuch/v1/umschlag", &mut kek)?;
    let ct = Aes256Gcm::new(&kek.into()).encrypt(&z.umschlag_iv.into(), Payload { msg: &z.cek, aad: aad.as_bytes() })?;
    let epk = z.ephemer.public_key().to_encoded_point(false);   // 65 Byte, 0x04‖x‖y
    kek.zeroize(); z.cek.zeroize();
    let umschlag = Umschlag { epk: b64(epk.as_bytes()), iv: b64(&z.umschlag_iv), ct: b64(&ct) };
    let ohne_hash = serde_json::json!({ "kopf": kopf, "iv": b64(&z.iv), "daten": b64(&daten), "umschlag": umschlag });
    let hash = sha256_hex(crate::jcs::kanonisch(&ohne_hash)?.as_bytes());
    Ok(Block { kopf: kopf.clone(), iv: b64(&z.iv), daten: b64(&daten), umschlag, hash })
}
```
Weitere Regeln:
- `aus_b64` verlangt kanonisches Base64 wie `ausBase64` in `K/bytes.ts`: Standardalphabet, Padding, Rundlauf-Gleichheit.
- `KryptoFehler` ist ein `thiserror`-Enum mit deutschen Meldungen.
- `SecretKey` implementiert `ZeroizeOnDrop`, deshalb braucht `ephemer` nichts Eigenes.

- [ ] **Step 4: Grün und frei von `ring`**

Run: `cd T && cargo test -p einsatzbuch-kern && cargo tree -p einsatzbuch-kern -i ring; echo TREE_EXIT=$?`
Expected: Alle Tests PASS. `cargo tree` meldet, dass das Paket `ring` nicht gefunden wurde (Exit ≠ 0).

- [ ] **Step 5: Commit** — `feat(einsatzbuch): Versiegeln in Rust trifft die Testvektoren byte-genau` (Body: gewählter RustCrypto-Satz, DRK-471, Co-Authored-By).

---

### Task 4: Lokale Datenbank, Einrichtung, Betriebsart, Testbetrieb beenden

**Files:**
- Create: `KR/src/schema.sql`, `KR/src/buch.rs`, `KR/src/einrichtung.rs`, `KR/src/uhr.rs`, `KR/tests/buch.rs`, `KR/tests/hilfe/mod.rs`
- Modify: `KR/Cargo.toml` (`rusqlite = { version = "0.40", features = ["bundled"] }`, `chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }`, `chrono-tz = "0.10"`, dev: `tempfile = "3"`), `KR/src/lib.rs`

**Interfaces:**
- Produces:
  ```rust
  // uhr.rs
  pub trait Uhr: Send + Sync { fn jetzt(&self) -> chrono::DateTime<chrono::Utc>; }
  pub struct SystemUhr;
  // einrichtung.rs  (serde camelCase; Drahtform für Stufe 5 = Antwort von POST einrichten)
  pub struct Fahrzeug { pub id: String, pub typ: String, pub kennung: String, pub ruf: String, pub standort: String }
  pub struct Person { pub id: String, pub name: String, pub quali: String, pub ov: String }
  pub struct Stichwortgruppe { pub name: String, pub items: Vec<String> }
  pub struct Stammdaten { pub fahrzeuge: Vec<Fahrzeug>, pub personal: Vec<Person>, pub stichworte: Vec<Stichwortgruppe> }
  pub struct Stammdatenpaket { pub version: i64, pub stammdaten: Stammdaten, pub frist_minuten: u32, pub besatzung: bool, pub zeitzone: String, pub bereitschaft: String }
  pub struct Einrichtung { pub umgebung: Umgebung, pub suite_url: String, pub oeffentlich_spki: String, pub schluessel_id: String, pub paket: Stammdatenpaket, pub eingerichtet_am: String, pub eingerichtet_von: String }
  // buch.rs
  #[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)] #[serde(rename_all = "lowercase")]
  pub enum Betrieb { Echt, Test }
  impl Betrieb { pub fn datei(self) -> &'static str /* "einsatzbuch.db" | "einsatzbuch-test.db" */; pub fn umgebung(self) -> Umgebung }
  pub fn erkenne_betrieb(ordner: &Path) -> Option<Betrieb>;      // Test-Datei vor echter Datei
  pub struct Buch { /* conn: rusqlite::Connection, betrieb: Betrieb, pfad: PathBuf */ }
  impl Buch {
      pub fn oeffne(ordner: &Path, betrieb: Betrieb) -> Result<Buch, BuchFehler>;   // legt an, migriert, WAL, synchronous=FULL
      pub fn betrieb(&self) -> Betrieb;
      pub fn einrichtung(&self) -> Result<Option<Einrichtung>, BuchFehler>;
      pub fn richte_ein(&mut self, e: &Einrichtung) -> Result<(), BuchFehler>;      // Naht für Stufe 5
      pub fn uebernehme_stammdaten(&mut self, p: &Stammdatenpaket) -> Result<(), BuchFehler>; // Naht für Stufe 5
      pub fn kettenkopf(&self) -> Result<Option<(u64, String)>, BuchFehler>;       // (letzter Block, Hash)
      pub fn bloecke(&self) -> Result<Vec<Block>, BuchFehler>;
      pub fn verbindung(&self) -> &rusqlite::Connection;                           // nur für Tests (Trigger)
  }
  pub fn beende_testbetrieb(ordner: &Path, buch: Buch) -> Result<(), BuchFehler>;  // schließt die Verbindung (drop), löscht .db, -wal, -shm; verweigert bei Betrieb::Echt
  ```

`richte_ein` prüft:
- `umgebung == betrieb.umgebung()`, sonst `BuchFehler::FalscheUmgebung`;
- `schluessel_id == krypto::schluessel_id(aus_b64(spki))` und SPKI als P-256 lesbar;
- `frist_minuten` in 1..=120;
- `zeitzone` als `chrono_tz::Tz` lesbar;
- noch keine Einrichtung vorhanden, sonst `BuchFehler::SchonEingerichtet`. Schlüsselwechsel gehört nicht zu v2.0; das Neu-Einrichten nach Widerruf klärt Stufe 5.

- [ ] **Step 1: Schema**

`KR/src/schema.sql` (per `include_str!` geladen, unter `PRAGMA user_version = 1` ausgeführt, in einer Transaktion):
```sql
-- Lokale Datenbank des Einsatzbuch-Rechners (Spec §4.2). Unveränderlich ist NUR `bloecke`;
-- die übrigen Tabellen ändert die App im Betrieb ganz normal.
CREATE TABLE bloecke (
  block      INTEGER PRIMARY KEY CHECK (block >= 1),
  json       TEXT    NOT NULL,
  hash       TEXT    NOT NULL UNIQUE CHECK (length(hash) = 64),
  versiegelt TEXT    NOT NULL
);
CREATE TRIGGER bloecke_kein_update BEFORE UPDATE ON bloecke
BEGIN SELECT RAISE(ABORT, 'Versiegelte Blöcke sind unveränderlich'); END;
CREATE TRIGGER bloecke_kein_delete BEFORE DELETE ON bloecke
BEGIN SELECT RAISE(ABORT, 'Versiegelte Blöcke sind unveränderlich'); END;

CREATE TABLE ausstehend (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  json          TEXT    NOT NULL,   -- Entwurf, zuletzt abgesendet
  schnappschuss TEXT    NOT NULL,   -- {fahrzeuge: FahrzeugStand[], personal: PersonStand[]} beim Absenden
  abgesendet_am TEXT    NOT NULL,
  frist_bis_ms  INTEGER NOT NULL
);
CREATE TABLE entwurf (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  json         TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);
CREATE TABLE nummern (
  jahr   INTEGER PRIMARY KEY,
  letzte INTEGER NOT NULL CHECK (letzte >= 1)
);
CREATE TABLE einrichtung (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  umgebung           TEXT    NOT NULL CHECK (umgebung IN ('echt', 'test')),
  suite_url          TEXT    NOT NULL,
  oeffentlich_spki   TEXT    NOT NULL,
  schluessel_id      TEXT    NOT NULL CHECK (length(schluessel_id) = 16),
  stammdaten_json    TEXT    NOT NULL,
  stammdaten_version INTEGER NOT NULL,
  frist_minuten      INTEGER NOT NULL CHECK (frist_minuten BETWEEN 1 AND 120),
  besatzung          INTEGER NOT NULL CHECK (besatzung IN (0, 1)),
  zeitzone           TEXT    NOT NULL,
  bereitschaft       TEXT    NOT NULL,
  sicherungsordner   TEXT,
  letzte_sicherung   TEXT,
  anker_gemeldet_bis INTEGER NOT NULL DEFAULT 0,
  eingerichtet_am    TEXT    NOT NULL,
  eingerichtet_von   TEXT    NOT NULL
);
```
`Buch::oeffne` setzt `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = FULL` und `PRAGMA foreign_keys = ON`. Sie migriert nur bei `user_version = 0` und verweigert eine unbekannte höhere Version.

- [ ] **Step 2: Failing tests**

`KR/tests/hilfe/mod.rs` stellt bereit:
- `pub fn test_einrichtung(umgebung: Umgebung) -> Einrichtung`, mit dem Vektor-SPKI aus `eingaben.json` (Pfad wie in Task 3), Zone `Europe/Berlin`, Frist 15, Besatzung an und kleinen Stammdaten: 3 Fahrzeuge, 3 Personen, 2 Stichwortgruppen, die IDs aus `K/testvektoren/einsaetze.ts` (`11-83-1`, `p4` …);
- `pub struct FesteUhr(pub std::sync::Mutex<DateTime<Utc>>)` mit `stelle(&self, t)` und `impl Uhr`;
- `pub struct FesterZufall(u8)` mit einer deterministischen Byte-Folge.

`KR/tests/buch.rs`:
```rust
mod hilfe;
use einsatzbuch_kern::buch::{beende_testbetrieb, erkenne_betrieb, Betrieb, Buch};
use einsatzbuch_kern::format::Umgebung;

#[test]
fn legt_an_wal_und_synchronous_full() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    let c = buch.verbindung();
    assert_eq!(c.query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0)).unwrap(), "wal");
    assert_eq!(c.query_row("PRAGMA synchronous", [], |r| r.get::<_, i64>(0)).unwrap(), 2); // FULL
    assert!(ordner.path().join("einsatzbuch.db").exists());
}

#[test]
fn trigger_verbieten_update_und_delete_nur_auf_bloecke() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    let c = buch.verbindung();
    c.execute("INSERT INTO bloecke (block, json, hash, versiegelt) VALUES (1, '{}', ?1, 'x')", [&"a".repeat(64)]).unwrap();
    let upd = c.execute("UPDATE bloecke SET json = '[]' WHERE block = 1", []).unwrap_err().to_string();
    assert!(upd.contains("unveränderlich"), "{upd}");
    let del = c.execute("DELETE FROM bloecke WHERE block = 1", []).unwrap_err().to_string();
    assert!(del.contains("unveränderlich"), "{del}");
    // Die übrigen Tabellen sind normal änderbar.
    c.execute("INSERT INTO entwurf (id, json, geaendert_am) VALUES (1, '{}', 'x')", []).unwrap();
    c.execute("UPDATE entwurf SET json = '[]'", []).unwrap();
    c.execute("DELETE FROM entwurf", []).unwrap();
    c.execute("INSERT INTO nummern (jahr, letzte) VALUES (2026, 1)", []).unwrap();
    c.execute("UPDATE nummern SET letzte = 2", []).unwrap();
}

#[test]
fn betriebsart_aus_der_datei_test_vor_echt() {
    let ordner = tempfile::tempdir().unwrap();
    assert_eq!(erkenne_betrieb(ordner.path()), None);
    drop(Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()), Some(Betrieb::Echt));
    drop(Buch::oeffne(ordner.path(), Betrieb::Test).unwrap());
    assert_eq!(erkenne_betrieb(ordner.path()), Some(Betrieb::Test));
}

#[test]
fn einrichtung_nur_mit_passender_umgebung_und_schluessel_id() {
    let ordner = tempfile::tempdir().unwrap();
    let mut test = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    assert!(test.richte_ein(&hilfe::test_einrichtung(Umgebung::Echt)).is_err());
    let mut falsch = hilfe::test_einrichtung(Umgebung::Test);
    falsch.schluessel_id = "0000000000000000".into();
    assert!(test.richte_ein(&falsch).is_err());
    test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    assert!(test.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).is_err()); // schon eingerichtet
    assert_eq!(test.einrichtung().unwrap().unwrap().paket.zeitzone, "Europe/Berlin");
}

#[test]
fn testbetrieb_beenden_loescht_datei_samt_wal_und_shm_auch_bei_offener_verbindung() {
    let ordner = tempfile::tempdir().unwrap();
    let mut buch = Buch::oeffne(ordner.path(), Betrieb::Test).unwrap();
    buch.richte_ein(&hilfe::test_einrichtung(Umgebung::Test)).unwrap();
    assert!(ordner.path().join("einsatzbuch-test.db-wal").exists());
    beende_testbetrieb(ordner.path(), buch).unwrap();
    for f in ["einsatzbuch-test.db", "einsatzbuch-test.db-wal", "einsatzbuch-test.db-shm"] {
        assert!(!ordner.path().join(f).exists(), "{f} liegt noch da");
    }
    assert_eq!(erkenne_betrieb(ordner.path()), None);
}

#[test]
fn testbetrieb_beenden_verweigert_ein_echtes_buch() {
    let ordner = tempfile::tempdir().unwrap();
    let buch = Buch::oeffne(ordner.path(), Betrieb::Echt).unwrap();
    assert!(beende_testbetrieb(ordner.path(), buch).is_err());
    assert!(ordner.path().join("einsatzbuch.db").exists());
}
```
Run: `cd T && cargo test -p einsatzbuch-kern --test buch`
Expected: Kompilierfehler, `buch` fehlt.

- [ ] **Step 3: Implementierung**

Implementiere `buch.rs`, `einrichtung.rs` und `uhr.rs` nach dem Interface-Block. Zu `beende_testbetrieb`:
- Nimm `Buch` **by value**. `drop(buch)` schließt die Verbindung. Vorher `PRAGMA wal_checkpoint(TRUNCATE)`, damit unter Windows kein Handle auf `-wal` bleibt.
- Danach löschen, und zwar `NotFound` tolerieren, jeden anderen Fehler melden.
- Kommentar dazu: Windows löscht keine offene Datei. Deshalb nimmt die Hülle das Buch vorher aus dem geteilten Zustand (Task 6).

- [ ] **Step 4: Grün**

Run: `cd T && cargo test -p einsatzbuch-kern`
Expected: PASS

- [ ] **Step 5: Commit** — `feat(einsatzbuch): lokale Datenbank mit unveränderlichen Blöcken und getrennter Testdatei`

---

### Task 5: Erfassung, Versiegeln, Nummern, Frist

**Files:**
- Create: `KR/src/erfassung.rs`, `KR/src/versiegeln.rs`, `KR/tests/erfassung.rs`, `KR/tests/versiegeln.rs`, `KR/tests/frist.rs`
- Modify: `KR/src/lib.rs`

**Interfaces:**
- Consumes: `Buch`, `Einrichtung`, `Uhr`, `krypto::{versiegele, Blockzufall, Zufall}`
- Produces (alle `serde` camelCase, das sind die DTOs der Oberfläche):
  ```rust
  pub struct PersonAuswahl { pub id: String, pub fahrzeug_id: Option<String> }
  pub struct Entwurf {
      pub stichwort: String, pub beginn_datum: String, pub beginn_zeit: String,
      pub ende_datum: String, pub ende_zeit: String,          // "" = offen
      pub strasse: String, pub ort: String, pub objekt: String,
      pub fahrzeuge: Vec<String>, pub personal: Vec<PersonAuswahl>,
      pub vor_ort: u32, pub transport: u32, pub notizen: String,
  }
  pub struct Ausstehend { pub entwurf: Entwurf, pub abgesendet_am: String, pub frist_bis: String, pub frist_bis_ms: i64 }
  pub struct Versiegelung { pub block: u64, pub hash: String, pub prev: String, pub versiegelt: String, pub nummer: String, pub verfallen: bool }
  #[derive(thiserror::Error)] pub enum ErfassungFehler { NichtEingerichtet, Fehlt(Vec<&'static str>) /* "Alarmstichwort" | "Beginn" | "Einsatzort" */, Ungueltig(String), Buch(BuchFehler), Krypto(KryptoFehler) }
  impl Buch {
      pub fn entwurf(&self) -> Result<Option<Entwurf>, ErfassungFehler>;
      pub fn speichere_entwurf(&mut self, e: &Entwurf, jetzt: DateTime<Utc>) -> Result<(), ErfassungFehler>;
      pub fn verwerfe_entwurf(&mut self) -> Result<(), ErfassungFehler>;
      pub fn ausstehend(&self) -> Result<Option<Ausstehend>, ErfassungFehler>;
      pub fn sende_ab(&mut self, e: &Entwurf, jetzt: DateTime<Utc>) -> Result<Ausstehend, ErfassungFehler>;
      pub fn versiegele_ausstehend(&mut self, jetzt: DateTime<Utc>, z: &mut dyn Zufall, verfallen_wenn_entwurf: bool) -> Result<Option<Versiegelung>, ErfassungFehler>;
      pub fn pruefe_frist(&mut self, jetzt: DateTime<Utc>, z: &mut dyn Zufall) -> Result<Option<Versiegelung>, ErfassungFehler>;
  }
  ```

**Regeln:**
- **`sende_ab`:**
  - Pflicht sind `stichwort` (getrimmt nicht leer), `beginn_datum` + `beginn_zeit` sowie `strasse` oder `ort`. Fehlt etwas: `Fehlt([...])` in der Reihenfolge Alarmstichwort, Beginn, Einsatzort.
  - Formate: Datum `JJJJ-MM-TT` als gültiger Kalendertag, Uhrzeit `HH:MM` im Bereich 00:00–23:59. `ende_*` ist entweder leer oder gültig. `vor_ort`, `transport` ≤ 999.
  - Fahrzeug- und Personen-IDs müssen eindeutig und in den Stammdaten bekannt sein. Eine `fahrzeug_id` muss unter den gewählten Fahrzeugen sein. Ist `besatzung` aus, wird jede `fahrzeug_id` zu `None`.
  - Die erste Absendung setzt `frist_bis_ms = jetzt + frist_minuten`. Jede weitere überschreibt `json` und `schnappschuss`, **nicht** `frist_bis_ms` und nicht `abgesendet_am`.
  - Löscht `entwurf`.
- **`versiegele_ausstehend`:** Ohne ausstehenden Einsatz gibt es `Ok(None)`. Sonst läuft **eine Transaktion** (`conn.transaction()`):
  1. Jahr = `jetzt` in `Tz(einrichtung.zeitzone)`. Die Nummer vergibt `INSERT INTO nummern(jahr, letzte) VALUES (?1, 1) ON CONFLICT(jahr) DO UPDATE SET letzte = letzte + 1 RETURNING letzte`, im Format `format!("{präfix}{jahr}-{:03}")` mit Präfix `"T-"` im Testbetrieb.
  2. Schnappschüsse aus den aktuellen Stammdaten. Fehlende IDs kommen aus `ausstehend.schnappschuss`.
  3. `Einsatz` bauen: `ende_*` leer → `None`, `v: 1`. Den Kopf bauen: `block = letzter + 1`, `prev = letzter Hash` oder `GENESIS`, `versiegelt = jetzt.with_timezone(&tz).format("%Y-%m-%dT%H:%M:%S%:z")`, `schluessel_id` aus der Einrichtung, `umgebung = betrieb.umgebung()`. Dann `krypto::versiegele` mit `Blockzufall::ziehe(z)`.
  4. `INSERT INTO bloecke`.
  5. `DELETE FROM ausstehend`, `DELETE FROM entwurf`.

  `verfallen = verfallen_wenn_entwurf && entwurf existierte`. Nach dem Commit läuft `VACUUM` außerhalb der Transaktion; ein Fehler dort wird nur geloggt (`eprintln!`), denn der Block ist geschrieben.
- **`pruefe_frist`:** Liegt ein ausstehender Einsatz vor und gilt `frist_bis_ms <= jetzt`, ruft sie `versiegele_ausstehend(jetzt, z, true)`, sonst `Ok(None)`.
- **„Jetzt versiegeln“** ruft `versiegele_ausstehend(jetzt, z, false)`.

- [ ] **Step 1: Failing tests**

`KR/tests/erfassung.rs`:
- `absenden_verlangt_stichwort_beginn_und_ort`: Leerer Entwurf ergibt `Fehlt(["Alarmstichwort","Beginn","Einsatzort"])`. Nur `ort` gesetzt, aber kein `strasse`, wird akzeptiert.
- `absenden_prueft_formate_und_ids`: `beginn_zeit = "24:00"`, `beginn_datum = "2026-02-31"`, unbekanntes Fahrzeug `"xx"`, `fahrzeug_id` eines nicht gewählten Fahrzeugs und `vor_ort = 1000` ergeben jeweils `Ungueltig`.
- `erneutes_absenden_verlaengert_die_frist_nicht`: absenden bei t0; absenden bei t0 + 10 min mit geänderter Notiz. `frist_bis_ms` bleibt t0 + 15 min, `entwurf.notizen` ist die neue Notiz.
- `ohne_einrichtung_kein_absenden`: `NichtEingerichtet`.
- `entwurf_speichern_und_verwerfen`.

`KR/tests/versiegeln.rs`:
- `versiegelt_in_einer_transaktion_und_haengt_an`: Zwei Einsätze nacheinander versiegeln.
  - Block 1 hat `prev == GENESIS`, Block 2 `prev == hash(1)`.
  - `ausstehend` und `entwurf` sind leer.
  - `bloecke()[i].hash` ist gleich dem neu berechneten `sha256(kanonisch({kopf,iv,daten,umschlag}))`.
  - Der Umschlag lässt sich mit dem privaten Vektor-Suiteschlüssel auspacken (Test-Helfer `packe_aus` aus `hilfe`). Der Klartext ist ein `Einsatz` mit Schnappschüssen, z. B. `fahrzeuge[0].ruf == "Rotkreuz Uelzen 11-83-1"`.
- `nummern_ueber_den_jahreswechsel_in_der_suite_zone`: Einsätze versiegeln bei
  - 2026-12-31T22:00Z (= 23:00 Berlin): `2026-001`
  - 2026-12-31T23:30Z (= 01.01.2027 00:30 Berlin): `2027-001`
  - 2027-01-01T08:00Z: `2027-002`
  Außerdem endet `versiegelt` des zweiten mit `+01:00` und beginnt mit `2027-01-01T00:30:00`.
- `testbetrieb_versiegelt_test_mit_praefix`: Test-Buch ergibt `nummer == "T-2026-001"` und `kopf.umgebung == Umgebung::Test`. Ein echtes Buch mit Einrichtung `echt` ergibt `"2026-001"` und `Echt`.
- `fehlende_stammdaten_id_faellt_auf_den_schnappschuss_zurueck`: Absenden mit `p4`, danach `uebernehme_stammdaten` ohne `p4`, dann versiegeln. `personal[0].name == "Dierks, Malte"`.
- `ein_fehlschlag_in_der_transaktion_hinterlaesst_nichts`: Vorher einen Block mit genau dem Hash einfügen, den der nächste bekommen würde, ist nicht praktikabel. Stattdessen `einrichtung.oeffentlich_spki` per SQL auf einen anderen gültigen Schlüssel setzen, sodass `schluessel_id` nicht passt und `krypto::versiegele` scheitert. Danach gilt: `nummern` ist unverändert (Rollback), `ausstehend` ist noch da, `bloecke` ist leer.

`KR/tests/frist.rs`:
- `frist_versiegelt_erst_bei_ablauf`: absenden bei t0; `pruefe_frist(t0 + 14:59)` ergibt `None`; `pruefe_frist(t0 + 15:00)` ergibt `Some`.
- `frist_nach_neustart`: absenden bei t0 und `drop(buch)`. `Buch::oeffne` erneut, dann `pruefe_frist(t0 + 16 min)` ergibt `Some(Versiegelung)`. Genau 1 Block, `ausstehend` leer.
- `versiegeln_mit_ungespeichertem_formular_nimmt_den_abgesendeten_stand`: absenden mit Notiz „A“; `speichere_entwurf` mit Notiz „B“; `pruefe_frist(nach Ablauf)`. Der entschlüsselte Einsatz hat Notiz „A“, `verfallen == true`, und `entwurf()` ist `None`.
- `jetzt_versiegeln_ist_nicht_verfallen`: `versiegele_ausstehend(.., false)` bei vorhandenem Entwurf ergibt `verfallen == false`.

Run: `cd T && cargo test -p einsatzbuch-kern`
Expected: Kompilierfehler, weil die neuen Methoden fehlen.

- [ ] **Step 2: Implementierung** nach den Regeln oben. Die Validierung liegt in einer eigenen Funktion `pruefe_entwurf(e, &Stammdatenpaket) -> Result<(Entwurf normalisiert, Schnappschuss), ErfassungFehler>`.

- [ ] **Step 3: Grün**

Run: `cd T && cargo test -p einsatzbuch-kern`
Expected: PASS, alle Dateien.

- [ ] **Step 4: Commit** — `feat(einsatzbuch): Erfassung, Frist und Versiegeln in einer Transaktion`

---

### Task 6: Tauri-Hülle, Plugins, Icons, Befehle, Entwicklerweg

**Files:**
- Create:
  - `T/build.rs`, `T/tauri.conf.json`, `T/capabilities/default.json`, `T/src/main.rs`, `T/src/lib.rs`, `T/src/befehle.rs`, `T/src/zustand.rs`
  - `T/icons/*`, dazu `T/icons/quelle.svg` als Ausgangsbild
  - `KR/src/entwicklung.rs`, `KR/entwicklung/stammdaten.json`, `KR/src/anmeldung.rs`
  - für den Rauchtest ein minimales `A/index.html` + `A/src/main.tsx` (Platzhalter „Einsatzbuch“; Task 8 ersetzt es) und `A/vite.config.ts`
- Modify: `T/Cargo.toml` (App-Paket dazu)

**Interfaces:**
- Consumes: alles aus `einsatzbuch_kern`
- Produces: Tauri-Befehle. Sie sind die Schnittstelle für `A/src/befehle.ts`; Argumente kommen camelCase über `invoke`:

  | Befehl | Argumente | Rückgabe |
  |---|---|---|
  | `status` | – | `Status` |
  | `stammdaten` | – | `Stammdatenpaket` (Fehler, wenn nicht eingerichtet) |
  | `entwurf_speichern` | `{ entwurf: Entwurf }` | `()` |
  | `entwurf_verwerfen` | – | `()` |
  | `absenden` | `{ entwurf: Entwurf }` | `Ausstehend` |
  | `jetzt_versiegeln` | – | `Versiegelung` |
  | `frist_pruefen` | – | `Versiegelung \| null` |
  | `versiegelung_quittieren` | – | `()` |
  | `testbetrieb_beenden` | – | `()` (nur Betrieb Test) |
  | `autostart_status` / `autostart_setzen` | – / `{ an: bool }` | `bool` / `()` |
  | **nur Debug:** `entwicklung_einrichten` | `{ spkiPfad: string \| null, fristMinuten: number \| null }` | `()` |

  ```rust
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct Status {
      pub betrieb: Option<Betrieb>, pub eingerichtet: bool, pub entwicklung: bool,   // cfg!(debug_assertions)
      pub bereitschaft: Option<String>, pub zeitzone: Option<String>, pub frist_minuten: Option<u32>, pub besatzung: Option<bool>,
      pub jetzt: String, pub jetzt_ms: i64,
      pub entwurf: Option<Entwurf>, pub ausstehend: Option<Ausstehend>,
      pub kette: Kettenstand /* { anzahl: u64, letzter: Option<{ block, hash }> } */,
      pub versiegelung: Option<Versiegelung>,   // unquittiert, aus Frist-Uhr oder „Jetzt versiegeln"
  }
  ```
  Fehler gehen als `String` an die Oberfläche. Die Meldung ist deutsch; `Fehlt([...])` wird zu `"Fehlt: Alarmstichwort, Beginn"`.

- [ ] **Step 1: Cargo, Build, Konfiguration**

In `T/Cargo.toml` wird `members = [".", "kern"]` gesetzt, dazu:
```toml
[package]
name = "einsatzbuch"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish = false

[lib]
name = "einsatzbuch_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
einsatzbuch-kern = { path = "kern" }
tauri = { version = "2", features = [] }
tauri-plugin-single-instance = "2"
tauri-plugin-autostart = "2"
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
```
Der Updater folgt in Stufe 7.

`T/tauri.conf.json`:
```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "Einsatzbuch",
  "version": "0.1.0",
  "identifier": "dev.rubeen.iuksuite.einsatzbuch",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1471",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "label": "main", "title": "Einsatzbuch", "width": 1280, "height": 860, "minWidth": 1024, "minHeight": 700,
        "resizable": true, "fullscreen": false, "alwaysOnTop": false, "create": false }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```
`T/capabilities/default.json`: `windows: ["main"]` mit den Rechten `core:default`, `dialog:allow-open` und `dialog:allow-ask`. Die App-Befehle brauchen ohne App-Manifest in `build.rs` keine Einträge. `build.rs` enthält `fn main() { tauri_build::build() }`.

- [ ] **Step 2: Icons**

`T/icons/quelle.svg`, 1024×1024: rote Fläche `#c8000f` mit Radius 180, weißer Balken 52×5 wie auf der Willkommensseite, darunter „EB“ in weißer Schrift, Stil Barlow Condensed 600. Keine Fremdschrift nötig: Die Buchstaben werden als Pfade gezeichnet oder als schlichte Formen. Danach:

Run:
```bash
cd A && node -e "require('sharp')('src-tauri/icons/quelle.svg').resize(1024,1024).png().toFile('/private/tmp/claude-501/eb-icon-1024.png')" \
  && pnpm tauri icon /private/tmp/claude-501/eb-icon-1024.png -o src-tauri/icons \
  && cd src-tauri/icons && rm -rf android ios Square*.png StoreLogo.png 64x64.png && ls
```
`sharp` kommt aus dem Root-Workspace (`R/node_modules`). Gegebenenfalls `NODE_PATH=R/node_modules` setzen.

Expected: Danach liegen dort genau `32x32.png 128x128.png 128x128@2x.png icon.png icon.icns icon.ico quelle.svg`. Nach dem Commit prüfen: `git lfs ls-files | grep src-tauri/icons` listet die 4 PNGs. `icon.ico` ist Pflicht für `tauri-build` unter Windows (Lehre `einsatztagebuch` Commit `e70efae`).

- [ ] **Step 3: Kern-Ergänzungen für Entwicklerweg und Anmelde-URL, test-first**

`KR/src/anmeldung.rs`:
```rust
//! Öffnen der Anmelde-URL (Spec §4.4). Den Loopback-Listener baut Stufe 5; hier steht nur
//! die Weiche, damit Playwright die Anmeldung später übernehmen kann: In Debug-Builds mit
//! `EINSATZBUCH_ANMELDUNG_STDOUT=1` geht die URL auf stdout statt in den Systembrowser.
pub const STDOUT_SCHALTER: &str = "EINSATZBUCH_ANMELDUNG_STDOUT";
pub const STDOUT_PRAEFIX: &str = "EINSATZBUCH_ANMELDE_URL=";

pub enum Ziel { Stdout(String), Browser }

/// Reine Entscheidung (testbar); `schalter` ist der Wert der Umgebungsvariable.
pub fn ziel(url: &str, schalter: Option<&str>) -> Ziel {
    if cfg!(debug_assertions) && schalter == Some("1") { Ziel::Stdout(format!("{STDOUT_PRAEFIX}{url}")) } else { Ziel::Browser }
}
```
Dazu Tests:
- `ziel("u", Some("1"))` ergibt `Stdout("EINSATZBUCH_ANMELDE_URL=u")` (Tests laufen im Debug-Profil);
- `ziel("u", None)` und `Some("0")` ergeben `Browser`.

Die Hülle ruft `ziel`: bei `Stdout` ein `println!`, sonst `tauri_plugin_opener::OpenerExt::opener().open_url`. Das gehört in `T/src/lib.rs` als `pub fn oeffne_anmelde_url(app, url)`, mit `#[allow(dead_code)]` und dem Kommentar „verdrahtet in Stufe 5“.

`KR/src/entwicklung.rs` wird in `lib.rs` nur unter `#[cfg(debug_assertions)] pub mod entwicklung;` eingebunden:
- `pub fn vektor_spki() -> String` liest per `include_str!("../../../../../src/app/m/einsatzbuch/_lib/kern/testvektoren/eingaben.json")` das Feld `suite.oeffentlichSpki`.
- `pub fn lies_spki_datei(pfad: &Path) -> Result<String, String>` akzeptiert eine Datei mit Base64-DER oder PEM (`-----BEGIN PUBLIC KEY-----`) und prüft, dass es ein P-256-SPKI ist.
- `pub fn richte_testbetrieb_ein(ordner: &Path, spki: String, frist_minuten: u32, jetzt: DateTime<Utc>) -> Result<Buch, String>` verweigert, wenn `einsatzbuch.db` eine Einrichtung hat (eine echte Installation wird nie zum Testrechner, §12). Es öffnet `Betrieb::Test` und richtet ein mit:
  - `umgebung: Test`, `suite_url: "http://einsatzbuch.localtest.me:3000"`
  - `eingerichtet_von: "Entwickler-Einrichtung"`
  - Stammdaten aus `include_str!("../entwicklung/stammdaten.json")`
  - Zone `Europe/Berlin`, `bereitschaft: "DRK-Bereitschaft Uelzen"`, `besatzung: true`

`KR/entwicklung/stammdaten.json` wird **einmal** aus der Vorlage erzeugt und eingecheckt. Grundlage ist `docs/design/einsatzbuch-v2/vorlage/Einsatzbuch v2.dc.html` mit `Component.GRUPPEN`, `Component.FZ` und `Component.PERSONAL`: den Code der drei statischen Felder in ein Node-Skript im Scratchpad kopieren und ausgeben. Form: `Stammdatenpaket.stammdaten` (`{fahrzeuge, personal, stichworte:[{name, items}]}`). Es sind 112 Personen; `localeCompare('de')` sortiert.

Tests in `entwicklung.rs`:
- `vektor_spki()` ergibt die `schluesselId` aus `erwartet.json`;
- PEM und Base64 werden gelesen;
- Müll wird abgelehnt;
- `richte_testbetrieb_ein` verweigert bei vorhandener echter Einrichtung.

- [ ] **Step 4: Hülle**

`T/src/zustand.rs`:
```rust
pub struct Zustand {
    pub ordner: PathBuf,                                   // app_data_dir
    pub buch: Mutex<Option<Buch>>,                         // EINE Verbindung, geteilt mit der Frist-Uhr
    pub unquittiert: Mutex<Option<Versiegelung>>,
    pub uhr: Box<dyn Uhr>,
}
```

`T/src/lib.rs`, Aufbau in dieser Reihenfolge:
1. `tauri::Builder::default()`
2. `.plugin(tauri_plugin_single_instance::init(|app, _, _| { if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); } }))` — **als erstes Plugin**
3. `.plugin(tauri_plugin_autostart::Builder::new().build())` bzw. `init(MacosLauncher::LaunchAgent, None)`, je nach Plugin-Version
4. `.plugin(tauri_plugin_dialog::init())`, `.plugin(tauri_plugin_opener::init())`
5. `.setup(|app| { … })`:
   - `ordner = app.path().app_data_dir()?`, `create_dir_all`;
   - `erkenne_betrieb(ordner)` → falls `Some`, `Buch::oeffne`, dann **`pruefe_frist(jetzt, SystemZufall)`**; ein Ergebnis kommt nach `unquittiert`;
   - `manage(Zustand)`;
   - Frist-Thread starten: `std::thread::spawn` mit Schleife aus `sleep(15 s)`, Lock und `pruefe_frist`; Fehler per `eprintln!`, der Thread lebt weiter;
   - **erst dann** `WebviewWindowBuilder::from_config(app.handle(), &app.config().app.windows[0])?.build()?`.
6. `.invoke_handler(...)`: Zwei Listen, weil `generate_handler!` kein `cfg` je Eintrag kennt:
   ```rust
   #[cfg(debug_assertions)]
   let handler = tauri::generate_handler![befehle::status, …, befehle::entwicklung_einrichten];
   #[cfg(not(debug_assertions))]
   let handler = tauri::generate_handler![befehle::status, …];
   ```

`testbetrieb_beenden` nimmt das Buch per `buch.lock().take()` aus dem Zustand (der Frist-Thread sieht danach `None`), ruft `beende_testbetrieb` und leert `unquittiert`.

`entwicklung_einrichten`:
- setzt `buch = Some(richte_testbetrieb_ein(...))`;
- die Frist ist `fristMinuten.unwrap_or(15)`, geklemmt auf 1..=120.

`T/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { einsatzbuch_lib::run() }
```

- [ ] **Step 5: Bauen**

Run: `cd A && pnpm build && cd src-tauri && cargo build && cargo test --workspace && cargo tree -i ring; echo TREE_EXIT=$?`
Expected:
- Bau grün;
- alle Tests grün (Kern und Hülle);
- `ring` nicht gefunden.

Dann `cd A && pnpm tauri build --debug --bundles app`. Expected: Ergebnis unter `T/target/debug/bundle/macos/Einsatzbuch.app`. Größe mit `du -sh` notieren.

- [ ] **Step 6: Suite-Tore**

`cd R && pnpm vitest run` (Scanner über die neuen Dateien) und `pnpm lint`. Expected: grün.

- [ ] **Step 7: Commit** — `feat(einsatzbuch): Tauri-Hülle mit Einzelinstanz, Frist-Uhr vor dem Fenster und Entwickler-Einrichtung`

---

### Task 7: Oberflächen-Grundlage — Befehlsnaht, Typen, Formular- und Ablauflogik

**Files:**
- Create: `A/tsconfig.json`, `A/vitest.config.ts`, `A/eslint.config.js`, `A/src/typen.ts`, `A/src/befehle.ts`, `A/src/logik/formular.ts`, `A/src/logik/formular.test.ts`, `A/src/logik/ablauf.ts`, `A/src/logik/ablauf.test.ts`
- Modify: `A/vite.config.ts`

**Interfaces:**
- Consumes: Tauri-Befehle (Task 6), `@kern/zeit` (`dauerMinuten`, `datumText`, `zeitpunktText`), `@kern/format` (Typen)
- Produces:
  ```ts
  // typen.ts — Spiegel der Rust-DTOs (camelCase)
  export interface PersonAuswahl { id: string; fahrzeugId: string | null }
  export interface Entwurf { stichwort: string; beginnDatum: string; beginnZeit: string; endeDatum: string; endeZeit: string; strasse: string; ort: string; objekt: string; fahrzeuge: string[]; personal: PersonAuswahl[]; vorOrt: number; transport: number; notizen: string }
  export interface Fahrzeug { id: string; typ: string; kennung: string; ruf: string; standort: string }
  export interface Person { id: string; name: string; quali: string; ov: string }
  export interface Stammdatenpaket { version: number; stammdaten: { fahrzeuge: Fahrzeug[]; personal: Person[]; stichworte: { name: string; items: string[] }[] }; fristMinuten: number; besatzung: boolean; zeitzone: string; bereitschaft: string }
  export interface Ausstehend { entwurf: Entwurf; abgesendetAm: string; fristBis: string; fristBisMs: number }
  export interface Versiegelung { block: number; hash: string; prev: string; versiegelt: string; nummer: string; verfallen: boolean }
  export interface Status { betrieb: "echt" | "test" | null; eingerichtet: boolean; entwicklung: boolean; bereitschaft: string | null; zeitzone: string | null; fristMinuten: number | null; besatzung: boolean | null; jetzt: string; jetztMs: number; entwurf: Entwurf | null; ausstehend: Ausstehend | null; kette: { anzahl: number; letzter: { block: number; hash: string } | null }; versiegelung: Versiegelung | null }
  // befehle.ts — EINZIGE Stelle mit invoke()
  export const befehle: {
    status(): Promise<Status>; stammdaten(): Promise<Stammdatenpaket>;
    entwurfSpeichern(e: Entwurf): Promise<void>; entwurfVerwerfen(): Promise<void>;
    absenden(e: Entwurf): Promise<Ausstehend>; jetztVersiegeln(): Promise<Versiegelung>;
    fristPruefen(): Promise<Versiegelung | null>; versiegelungQuittieren(): Promise<void>;
    testbetriebBeenden(): Promise<void>;
    entwicklungEinrichten(a: { spkiPfad: string | null; fristMinuten: number | null }): Promise<void>;
  };
  // formular.ts (rein)
  export function leererEntwurf(jetzt: Date, zeitzone: string): Entwurf;   // Beginn = heute/jetzt in der Zone (Intl im Aufruf)
  export function fehlendeAngaben(e: Entwurf): ("Alarmstichwort" | "Beginn" | "Einsatzort")[];
  export function bereitText(e: Entwurf): string;                         // Texte wörtlich wie Vorlage
  export function dauerHinweis(e: Entwurf, zeitzone: string): string;     // „Ende noch offen — …" | „Einsatzdauer 2 h 23 min" | „Ende liegt vor dem Beginn — bitte prüfen."
  export function fristSatz(minuten: number): string;                     // „Nach dem Absenden 15 Minuten änderbar, danach nicht mehr einsehbar" (1 → „1 Minute")
  export function fahrzeugTreffer(alle: Fahrzeug[], suche: string, filter: string): Fahrzeug[];  // filter "Alle" | Standort
  export function personTreffer(alle: Person[], suche: string, filter: string): Person[];         // filter "Alle" | Quali
  export function fahrzeugFilter(alle: Fahrzeug[]): string[];  export function personFilter(alle: Person[]): string[]; // ["Alle", …distinct in Reihenfolge]
  export function waehleErstenTreffer<T extends { id: string }>(treffer: T[], gewaehlt: string[]): string[] | null; // Enter: fügt ersten Treffer hinzu (nie abwählen), null wenn keiner
  export function schalteFahrzeug(e: Entwurf, id: string): Entwurf;       // Abwählen setzt fahrzeugId der Personen auf null
  export function schaltePerson(e: Entwurf, id: string): Entwurf;
  export function setzeZaehler(wert: string): number;                     // Ziffern, 0..999
  export function zusammenfassung(e: Entwurf, s: Stammdatenpaket): { k: string; v: string }[];
  // ablauf.ts (rein)
  export type Phase = "nicht-eingerichtet" | "start" | "form" | "frist" | "versiegelt";
  export function phaseAus(status: Status, lokal: { phase: Phase; bearbeiten: boolean }): { phase: Phase; bearbeiten: boolean };
  export function restSekunden(fristBisMs: number, jetztMs: number): number;   // ≥ 0, aufgerundet
  export function restText(sek: number): string;                             // „14:05"
  ```

`phaseAus` entscheidet in dieser Reihenfolge:
1. nicht eingerichtet → `nicht-eingerichtet`;
2. `versiegelung` → `versiegelt`;
3. `ausstehend` und lokal `form` + `bearbeiten` → so lassen;
4. `ausstehend` → `frist`;
5. lokal `form` → `form`;
6. sonst `start`.

Beim Neustart mit `ausstehend` + `entwurf` gilt `form` mit `bearbeiten: true`. Das erledigt die App beim ersten Status.

- [ ] **Step 1: Konfiguration**

`A/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const WURZEL = path.resolve(__dirname, "../..");
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kern": path.join(WURZEL, "src/app/m/einsatzbuch/_lib/kern"),
      "@/core/theme/tokens": path.join(WURZEL, "src/core/theme/tokens.ts"),
    },
    // Kern-Dateien liegen unter src/ der Suite; React muss trotzdem EINE Instanz sein.
    dedupe: ["react", "react-dom"],
  },
  server: { port: 1471, strictPort: true, fs: { allow: [WURZEL] } },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
```
`A/tsconfig.json`:
- `strict`, `jsx: react-jsx`, `moduleResolution: bundler`, `lib: ["dom","dom.iterable","esnext"]`, `types: ["vite/client"]`;
- `paths: {"@kern/*": ["../../src/app/m/einsatzbuch/_lib/kern/*"], "@/core/theme/tokens": ["../../src/core/theme/tokens.ts"]}`;
- `include: ["src", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]`.

`A/vitest.config.ts`:
- `mergeConfig` mit der Vite-Konfiguration;
- `test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"], execArgv: ["--no-experimental-webstorage"] }`. Begründung und Messung dazu stehen in `R/vitest.config.ts`; per Kommentar darauf verweisen.

`A/eslint.config.js`: `tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended /* bzw. recommended-latest je nach Version */, { ignores: ["dist", "src-tauri", "node_modules"] })`.

- [ ] **Step 2: Failing tests** in `A/src/logik/formular.test.ts`. Die Stammdaten-Fixture ist klein und eigen: 4 Fahrzeuge in 2 Standorten, 4 Personen, 2 Stichwortgruppen.

```ts
import { describe, expect, it } from "vitest";
import { bereitText, dauerHinweis, fehlendeAngaben, fristSatz, fahrzeugTreffer, leererEntwurf, schalteFahrzeug, setzeZaehler, waehleErstenTreffer, zusammenfassung } from "./formular";
// … Fixture STAMM, Entwurf-Helfer mit(e: Partial<Entwurf>)

describe("Pflichtfelder (Spec §4.3)", () => {
  it("leer: Stichwort, Beginn und Ort fehlen, Text wie die Vorlage", () => {
    const e = mit({ beginnDatum: "", beginnZeit: "" });
    expect(fehlendeAngaben(e)).toEqual(["Alarmstichwort", "Beginn", "Einsatzort"]);
    expect(bereitText(e)).toBe("Ohne Alarmstichwort, Beginn und Einsatzort wird nicht abgesendet.");
  });
  it("Ort ODER Straße genügt", () => {
    expect(fehlendeAngaben(mit({ stichwort: "RD 2", ort: "29525 Uelzen" }))).toEqual([]);
    expect(fehlendeAngaben(mit({ stichwort: "RD 2", strasse: "Lindenstraße 8" }))).toEqual([]);
  });
  it("bereit: Zusammenfassung in einer Zeile", () => {
    expect(bereitText(mit({ stichwort: "RD 2", ort: "Uelzen", fahrzeuge: ["11-83-1"], personal: [{ id: "p4", fahrzeugId: null }], vorOrt: 1, transport: 2 })))
      .toBe("Bereit · RD 2, 1 Fahrzeuge, 1 Kräfte, 3 Patienten");
  });
});

describe("Dauer in der Suite-Zone", () => {
  it("über die Zeitumstellung (25.10.) zählt 180 statt 120 Minuten", () => {
    expect(dauerHinweis(mit({ beginnDatum: "2026-10-25", beginnZeit: "01:30", endeDatum: "2026-10-25", endeZeit: "03:30" }), "Europe/Berlin")).toBe("Einsatzdauer 3 h 00 min");
  });
  it("Ende vor Beginn blockiert nicht, erzeugt aber den Hinweis", () => {
    const e = mit({ stichwort: "RD 2", ort: "U", beginnDatum: "2026-09-23", beginnZeit: "18:00", endeDatum: "2026-09-23", endeZeit: "17:00" });
    expect(dauerHinweis(e, "Europe/Berlin")).toBe("Ende liegt vor dem Beginn — bitte prüfen.");
    expect(fehlendeAngaben(e)).toEqual([]);
  });
  it("offenes Ende", () => {
    expect(dauerHinweis(mit({ endeDatum: "", endeZeit: "" }), "Europe/Berlin")).toBe("Ende noch offen — kannst du auch später in der Frist nachtragen.");
  });
});

describe("Suche mit Enter", () => {
  it("wählt den ersten Treffer, wählt aber nie ab", () => {
    const treffer = fahrzeugTreffer(STAMM.fahrzeuge, "83-1", "Alle");
    expect(waehleErstenTreffer(treffer, [])).toEqual([treffer[0].id]);
    expect(waehleErstenTreffer(treffer, [treffer[0].id])).toEqual([treffer[0].id]);
    expect(waehleErstenTreffer([], [])).toBeNull();
  });
  it("sucht über Typ und Funkrufname, filtert nach Standort", () => { /* … */ });
});

it("Fahrzeug abwählen löst die Besatzungszuordnung", () => {
  const e = schalteFahrzeug(mit({ fahrzeuge: ["11-83-1"], personal: [{ id: "p4", fahrzeugId: "11-83-1" }] }), "11-83-1");
  expect(e.personal).toEqual([{ id: "p4", fahrzeugId: null }]);
});
it("Zähler: nur Ziffern, höchstens 999", () => { expect(setzeZaehler("12a3")).toBe(123); expect(setzeZaehler("5000")).toBe(999); expect(setzeZaehler("")).toBe(0); });
it("Fristsatz", () => { expect(fristSatz(15)).toBe("Nach dem Absenden 15 Minuten änderbar, danach nicht mehr einsehbar"); expect(fristSatz(1)).toBe("Nach dem Absenden 1 Minute änderbar, danach nicht mehr einsehbar"); });
it("leerer Entwurf nimmt heute und jetzt in der Suite-Zone, nicht in der Rechnerzone", () => {
  expect(leererEntwurf(new Date("2026-12-31T23:30:00Z"), "Europe/Berlin")).toMatchObject({ beginnDatum: "2027-01-01", beginnZeit: "00:30" });
});
```
Die Kommentar-Platzhalter `/* … */` in dieser Skizze füllt der Implementierer mit echten Erwartungen. Beim Test „sucht über Typ und Funkrufname“ gilt: `"rtw"` findet alle RTW, und der Filter `"Bad Bevensen"` schränkt ein. `zusammenfassung` wird gegen die Vorlage-Zeilen „Alarmstichwort“, „Beginn“, „Ende“ (`offen`), „Einsatzort“, „Fahrzeuge“, „Personal“ und „Patienten“ geprüft.

`A/src/logik/ablauf.test.ts` prüft `phaseAus` für jede Regel, `restSekunden` (aufrunden, nie negativ) und `restText(845) === "14:05"`.

Run: `cd A && pnpm vitest run`
Expected: FAIL, Module fehlen.

- [ ] **Step 3: Implementieren**

Implementiere `formular.ts`, `ablauf.ts`, `typen.ts` und `befehle.ts`. `befehle.ts` ruft `invoke` aus `@tauri-apps/api/core` mit den Befehlsnamen aus Task 6 in snake_case und den Argumenten in camelCase, z. B. `invoke("entwurf_speichern", { entwurf: e })`. Die Dauer rechnet über `dauerMinuten`/`dauerText` aus `@kern/zeit`.

- [ ] **Step 4: Tore der App**

Run: `cd A && pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: alles Exit 0.

- [ ] **Step 5: Suite-Tore** — `cd R && pnpm vitest run && pnpm typecheck && pnpm lint`. Die Suite darf nichts von `apps/` sehen.

- [ ] **Step 6: Commit** — `feat(einsatzbuch): Formular- und Ablauflogik der Desktop-App mit Tauri-Befehlsnaht`

---

### Task 8: Oberfläche nach der Vorlage

**Files:**
- Create:
  - `A/index.html`, `A/src/main.tsx`, `A/src/App.tsx`
  - `A/src/stil/app.css`, `A/src/stil/variablen.ts`, `A/src/stil/variablen.test.ts`, `A/src/stil/schrift/`
  - `A/src/bausteine/{Knopf,Karte,Feld,Hinweis,Symbol,Kopf,Testband,Bestaetigung}.tsx`
  - `A/src/seiten/{Willkommen,Formular,Frist,Versiegelt,NichtEingerichtet}.tsx`
  - `A/src/App.test.tsx`

**Interfaces:**
- Consumes: `befehle`, `typen`, `logik/*` (Task 7), `FARBEN` aus `@/core/theme/tokens`
- Produces: die sichtbare App. Die Playwright-Spec (Task 9) sucht per Rolle und Text:
  - Knöpfe „Einsatz öffnen“, „Einsatz absenden“, „Angaben ändern“, „Änderungen übernehmen“, „Änderungen verwerfen“, „Jetzt versiegeln“, „Neuen Einsatz erfassen“, „Testbetrieb beenden“;
  - Überschriften „Neuer Einsatz“, „Angaben ändern“, „Einsatz versiegelt“;
  - Band-Text „TESTBETRIEB — nichts hiervon ist ein echter Einsatz“;
  - Frist-Kicker „Abgesendet · noch änderbar“;
  - Stichwort-Knöpfe mit `aria-pressed`;
  - Suchfelder mit `aria-label` „Fahrzeug suchen“ und „Person suchen“;
  - Zählerfelder mit `aria-label` „Vor Ort behandelt“ und „Behandelt mit Transport“;
  - Datumsfelder mit Label „Beginn · Datum“ usw.

**Vorgaben:**
- **Markup und Texte** kommen aus `R/docs/design/einsatzbuch-v2/vorlage/Einsatzbuch v2.dc.html`, Abschnitte `Willkommen`, `Erfassung`, `Frist`, `Versiegelt` (Zeilen der `sc-if`-Blöcke `istStart`, `istForm`, `istFrist`, `istVersiegelt`, Logik in `renderVals`). Die Inline-Styles werden als CSS-Klassen in `app.css` übernommen oder als `style`-Objekte. Texte bleiben **wörtlich**, wo die Funktion gleich bleibt (Spec §10).
- **Abweichungen, bewusst:**
  - Frist in Minuten statt Sekunden (`fristSatz`).
  - Kein „Verwaltung · Anmelden“ (Entscheidung 9).
  - Die Willkommensseite zeigt `bereitschaft` aus der Einrichtung.
  - Die Vorlage-Komponenten `Card`/`Button`/`TextField`/`Hinweis`/`Icon`/`SuiteKopf` werden als eigene `bausteine` nachgebaut.
  - Icons: die SVG-Pfade der benutzten Symbole (`pfeil-rechts`, `pfeil-links`, `schluessel`, `verketten`, `info`, `haken`, `kreuz`, `minus-kraeftig`, `plus-kraeftig`, `stift`, `plus`) aus `…/_ds/ida-design-system-18c4cab1-da75-445d-bba4-9538ec01b8cd/_ds_bundle.js` als Inline-SVG.
  - Der Kopf zeigt die Wortmarke `EINSATZ`+`BUCH` (BUCH in `--iuk-marke`) und einen Umschalter Hell/Dunkel/Auto.
- **Bediendichte wie in der Vorlage:** 44 px Knöpfe und Felder, 72 px Startknopf. Eingabefelder nie unter 16 px Schrift.
- **Farben:** `variablen.ts` schreibt die Rohwerte aus `FARBEN` als `--iuk-*`-Variablen auf `:root`, im Namensschema von `vorlage/_ds/…/tokens/colors.css`, z. B. `--iuk-rot`, `--iuk-tinte`, `--iuk-kontur`.
  - `app.css` definiert die abgeleiteten Rollen (`--verw-*`, `--iuk-marke`, `--brand-fill`, `--border-control`, Ampel) für hell und für `:root[data-theme="dark"]`, mit den Werten aus derselben `colors.css`.
  - `variablen.test.ts` sichert, dass jede `FARBEN`-Farbe als Variable ankommt und `--iuk-rot` gleich `FARBEN.rot` ist.
- **Hell/Dunkel:** `data-theme` auf `<html>` ist `light` oder `dark`. Der Wert `auto` folgt `matchMedia("(prefers-color-scheme: dark)")` mit Listener (Spec §4.1). Die Wahl steht in `localStorage` (`einsatzbuch-thema`), mit `try/catch`.
- **Schriften lokal:** `barlow-condensed-600/700.woff2`, `geist-400.woff2` und `geist-mono-400.woff2` aus `…/_ds/…/assets/fonts/` nach `A/src/stil/schrift/` kopieren und per `@font-face` einbinden. `--font-display`, `--font-body` und `--font-mono` wie in `typography.css`. Kein Netzabruf, die CSP erlaubt keinen.
- **Testband:** Bei `status.betrieb === "test"` erscheint über allen Seiten ein Band `role="status"`: diagonal gestreift (`repeating-linear-gradient(-45deg, gelb, gelb 12px, tinte 12px, tinte 24px)`) mit einem Textfeld auf kontrastreichem Grund und dem Text „TESTBETRIEB — nichts hiervon ist ein echter Einsatz“. Es ist nicht schließbar.
- **„Testbetrieb beenden“:**
  - Ein Knopf im Fuß der Willkommensseite, nur im Testbetrieb, dort wo die Vorlage „Verwaltung · Anmelden“ hat.
  - Er öffnet `Bestaetigung` (eigenes Modal, `role="dialog"`) mit dem Text „Die lokale Testdatenbank mit allen Testeinsätzen wird gelöscht. Das lässt sich nicht rückgängig machen.“ und den Knöpfen „Abbrechen“ / „Testdatenbank löschen“.
  - Danach `status()` neu, die App steht bei „nicht eingerichtet“.
- **Nicht eingerichtet:** Überschrift „Rechner ist noch nicht eingerichtet“, Text „Die Einrichtung übernimmt die Verwaltung über die Anmeldung an der Suite.“
  - Nur wenn `status.entwicklung`: eine Karte „Entwickler-Einrichtung (nur Debug-Build)“ mit den Knöpfen „Mit Testvektor-Schlüssel einrichten“ und „Schlüssel aus Datei …“ (`open()` aus `@tauri-apps/plugin-dialog`, Filter `pem`/`txt`/`der`/`b64`) sowie dem Zahlenfeld „Frist in Minuten“ (Vorgabe 15).
  - Beide Wege richten im Testbetrieb ein.
- **Ablauf in `App.tsx`:**
  - Beim Start `status()` und bei `eingerichtet` einmal `stammdaten()`. Ohne ausstehenden Einsatz wird der Entwurf aus `status.entwurf` übernommen, sonst `leererEntwurf`.
  - Taste Enter oder Leertaste auf der Startseite öffnet das Formular.
  - Formularänderungen speichern **mit 500 ms Verzögerung** per `entwurfSpeichern`, und zwar vor dem ersten Absenden und im Bearbeiten-Modus. Lokal hält die App `ungespeichert`.
  - Absenden ruft `absenden(e)`, dann Phase `frist`.
  - „Angaben ändern“ führt nach `form` mit `bearbeiten` und dem Entwurf aus `ausstehend.entwurf`.
  - „Änderungen verwerfen“ und „Zurück zur Frist“ rufen `entwurfVerwerfen()`, dann `frist`.
  - „Jetzt versiegeln“ ruft `jetztVersiegeln()`.
  - Frist: lokaler Takt alle 250 ms für `restText` und Balken. Bei Rest 0 `fristPruefen()`, sonst alle 5 s `status()`.
  - Liegt `status.versiegelung` vor, wechselt die App zu `versiegelt`. Dort gilt `verfallen = v.verfallen || (bearbeiten && ungespeichert)`. Die Ansicht zeigt „Block n-1 → Block n · neu“ mit den ersten 8 Hex-Zeichen und „Versiegelt am …“ über `zeitpunktText(v.versiegelt, zeitzone)`.
  - „Neuen Einsatz erfassen“ ruft `versiegelungQuittieren()`, dann `start` mit leerem Entwurf.
  - Fehler aus `invoke` landen in einem `Hinweis ton="warn"` über dem Inhalt, nicht als `alert`.
- **`App.test.tsx`:** Er nutzt das Suite-Harness über `import { mount, unmount } from "../../../src/app/m/qr/_lib/test-dom";`. Lies die Datei vorher und nutze nur die dort exportierten Helfer. `befehle` wird per `vi.mock("./befehle")` ersetzt. Geprüft wird:
  - a) Im Testbetrieb steht das Band auf der Startseite.
  - b) Nicht eingerichtet und `entwicklung: false`: kein Entwicklerweg.
  - c) Ein Status mit `ausstehend` öffnet direkt die Frist-Seite.
  - d) Ein Status mit `versiegelung.verfallen` zeigt den Hinweis „Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand.“

- [ ] **Step 1:** Zuerst die Tests `variablen.test.ts` und `App.test.tsx` schreiben. Run `cd A && pnpm vitest run`, Expected: FAIL.
- [ ] **Step 2:** Bausteine, Seiten und App bauen. Die Vorlage liegt beim Bauen offen daneben.
- [ ] **Step 3:** `cd A && pnpm vitest run && pnpm typecheck && pnpm lint && pnpm build`. Expected: Exit 0.
- [ ] **Step 4:** Keine Stub-Weiche im App-Code (kein `?stub`, kein Testmodus im Bundle). Die Sichtprüfung im Browser folgt in Task 9 mit dem Playwright-Stub; hier genügen die Vitest-Prüfungen.
- [ ] **Step 5: Suite-Tore** — `cd R && pnpm vitest run` (die `nullbyte`/`lfs`-Scanner sehen die neuen woff2-Dateien).
- [ ] **Step 6: Commit** — `feat(einsatzbuch): Erfassung, Frist und Versiegelt nach der Vorlage, mit Testband`

---

### Task 9: Playwright gegen den Vite-Dev-Server mit gestubbtem `invoke`

**Files:**
- Create: `A/playwright.config.ts`, `A/e2e/stub.ts`, `A/e2e/erfassung.spec.ts`

**Interfaces:**
- Consumes: Befehlsnamen und DTOs (Tasks 6 und 7), sichtbare Texte (Task 8)
- Produces: `installiereStub(page, optionen: { betrieb?: "test" | "echt" | null; fristSekunden?: number; entwicklung?: boolean })`

**Vorgaben:**
- `A/playwright.config.ts`:
  - `import { E2E_PORTS } from "../../e2e/helpers/ports";`, dann `const PORT = E2E_PORTS.web + 4;` mit Kommentar: fünfter Platz im Zehnerblock der Arbeitskopie; die Suite belegt +0 bis +3.
  - `webServer: { command: \`pnpm vite --port ${PORT} --strictPort\`, url: \`http://localhost:${PORT}\`, reuseExistingServer: false }`
  - `use.baseURL` passend, nur Projekt `chromium`, `testDir: "e2e"`.
- `A/e2e/stub.ts` spielt per `page.addInitScript` eine **Stub-Schicht für `invoke`** ein:
  - `window.__TAURI_INTERNALS__ = { invoke: async (cmd, args) => …, transformCallback: (cb) => { const id = Math.random(); window["_" + id] = cb; return id; }, metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } } }`
  - Das Fake-Backend im Browser bildet die Rust-Regeln nach: Pflichtfelder, Frist ohne Verlängerung, Versiegeln mit `verfallen` bei vorhandenem Entwurf, Nummer `T-JJJJ-001`, Hash als 64 Hex-Zeichen aus `crypto.subtle.digest` über den Entwurf.
  - `fristSekunden` (Vorgabe 4) ersetzt die 15 Minuten, damit der Ablauf im Test abläuft.
  - Stammdaten: 3 Fahrzeuge, 3 Personen und die 5 Stichwortgruppen der Vorlage.
  - Der Stub zeichnet jeden Aufruf in `window.__aufrufe` auf, damit die Spec Argumente prüfen kann.
- Vor Step 2 prüfen, dass `R/scripts/e2e-gruppen.test.ts` nur `R/e2e/*.spec.ts` sammelt (Datei lesen). Tut es mehr, meldet der Bericht das, und die Spec wird dort eingetragen.

`A/e2e/erfassung.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { installiereStub } from "./stub";

test("erfassen → Frist → Angaben ändern → Jetzt versiegeln", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 60 });
  await page.goto("/");
  await expect(page.getByText("TESTBETRIEB — nichts hiervon ist ein echter Einsatz")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Neuer Einsatz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einsatz absenden" })).toBeDisabled();
  await page.getByRole("button", { name: "RD 2" }).click();
  await page.getByLabel("PLZ, Ort").fill("29525 Uelzen");
  await page.getByLabel("Fahrzeug suchen").fill("83-1");
  await page.getByLabel("Fahrzeug suchen").press("Enter");
  await page.getByLabel("Person suchen").fill("Dierks");
  await page.getByLabel("Person suchen").press("Enter");
  await page.getByRole("button", { name: "Einsatz absenden" }).click();
  await expect(page.getByText("Abgesendet · noch änderbar")).toBeVisible();
  await page.getByRole("button", { name: "Angaben ändern" }).click();
  await page.getByLabel("Vor Ort behandelt").fill("2");
  await page.getByRole("button", { name: "Änderungen übernehmen" }).click();
  await page.getByRole("button", { name: "Jetzt versiegeln" }).click();
  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible();
  await expect(page.getByText("Block 1 · neu")).toBeVisible();
  await expect(page.getByText(/Deine letzten Änderungen/)).toHaveCount(0);
  const absendungen = await page.evaluate(() => (window as unknown as { __aufrufe: { cmd: string; args: { entwurf?: { vorOrt: number } } }[] }).__aufrufe.filter((a) => a.cmd === "absenden"));
  expect(absendungen.map((a) => a.args.entwurf?.vorOrt)).toEqual([0, 2]);
});

test("Frist läuft ab, während ungespeichert bearbeitet wird → abgesendeter Stand, Hinweis", async ({ page }) => {
  await installiereStub(page, { betrieb: "test", fristSekunden: 4 });
  // … erfassen und absenden wie oben, dann „Angaben ändern", Notiz tippen, NICHT übernehmen …
  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand.")).toBeVisible();
});

test("nicht eingerichtet: Hinweis, Entwicklerweg nur im Debug-Build", async ({ page }) => {
  await installiereStub(page, { betrieb: null, entwicklung: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Rechner ist noch nicht eingerichtet" })).toBeVisible();
  await expect(page.getByText("Entwickler-Einrichtung (nur Debug-Build)")).toHaveCount(0);
});
```
Den Teil „… erfassen und absenden wie oben …“ schreibt der Implementierer als Hilfsfunktion `erfasseUndSendeAb(page)` aus, damit beide Tests sie nutzen.

- [ ] **Step 1:** `pnpm exec playwright install chromium` falls nötig. Vorher `pgrep -fl "playwright|vite"` und `uptime`.
- [ ] **Step 2:** Spec und Stub schreiben. Run: `cd A && pnpm e2e`. Expected: 3 passed.
- [ ] **Step 3: Sichtprüfung.** Zu jedem der Zustände Willkommen, Formular, Frist und Versiegelt einen Screenshot per `page.screenshot` ins Scratchpad `/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-360-a6f5ba/104ae649-8023-4e35-823f-d9fbf700bcad/scratchpad/`, einmal hell und einmal dunkel. Vergleiche mit der Vorlage: Abstände, Kartentitel, Schriften, Band. Abweichungen im selben Task beheben.
- [ ] **Step 4:** `cd A && pnpm typecheck && pnpm lint` grün, `cd R && pnpm vitest run` grün.
- [ ] **Step 5: Commit** — `test(einsatzbuch): Erfassung bis Versiegeln im Browser mit gestubbtem invoke`

---

### Task 10: CI-Workflow `einsatzbuch.yml`

**Files:**
- Create: `R/.github/workflows/einsatzbuch.yml`
- Nicht anfassen: `R/.github/workflows/ci.yml`

**Vorgaben:**
- Auslöser: `pull_request` und `push` auf `main`. Pfadfilter `apps/einsatzbuch/**`, `src/app/m/einsatzbuch/_lib/kern/**`, `src/core/theme/tokens.ts` und `.github/workflows/einsatzbuch.yml`. Die beiden letzten sind begründet: Die App liest `tokens.ts`, und eine Workflow-Änderung soll sich selbst prüfen.
- `concurrency` wie im Einsatzarchiv, `permissions: contents: read`.
- Actions gepinnt wie in `R/.github/workflows/ci.yml`: dieselben `actions/checkout`-, `pnpm/action-setup`- und `actions/setup-node`-Referenzen übernehmen (Datei lesen).
- Checkout **`lfs: true`**, denn die Icons sind LFS-PNGs. Nach dem Checkout prüft ein Schritt, dass `apps/einsatzbuch/src-tauri/icons/icon.png` keine Zeigerdatei ist (`head -c 40` enthält nicht `version https://git-lfs`).
- Installation: `pnpm install --frozen-lockfile --ignore-scripts` (Entscheidung 15).

**Jobs:**
1. `oberflaeche` (ubuntu-latest): `pnpm --filter einsatzbuch typecheck`, `lint`, `test`, dann `pnpm --filter einsatzbuch exec playwright install --with-deps chromium` und `pnpm --filter einsatzbuch e2e`.
2. `rust-kern` (ubuntu-latest):
   - `cd apps/einsatzbuch/src-tauri && cargo test -p einsatzbuch-kern --locked`
   - `cargo tree --locked -i ring` muss scheitern. Der Schritt dreht den Exit-Code um und prüft die Meldung auf „did not match any packages“ bzw. „nothing to print“ (Wortlaut lokal messen).
   - `cargo tree --locked -e features -i serde_json` darf `preserve_order` nicht enthalten.
3. `desktop` (Matrix `windows-latest`, `macos-latest`, `fail-fast: false`):
   - Rust via `dtolnay/rust-toolchain@stable` (gepinnter SHA), `Swatinem/rust-cache` mit `workspaces: apps/einsatzbuch/src-tauri`
   - Install, dann `cargo test --locked --workspace` in `src-tauri`. Das läuft die Kern-Tests auch unter Windows, inklusive „Testbetrieb beenden“. Vorher `pnpm --filter einsatzbuch build`, weil der Hüllen-Crate `dist/` braucht.
   - Danach `pnpm --filter einsatzbuch tauri build --debug`. Unter macOS `--bundles app`, falls dmg sich als anfällig erweist; lokal messen.
   - Die Bundle-Größe ins Job-Summary schreiben: `du -sh` bzw. PowerShell `Get-ChildItem … | Measure-Object -Sum Length`.

- [ ] **Step 1:** Workflow schreiben. Lokale Syntaxprüfung: `actionlint`, falls vorhanden (`which actionlint`), sonst `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/einsatzbuch.yml`.
- [ ] **Step 2:** Lokal jeden `run`-Befehl einmal ausführen, der ohne Windows geht (Job 1, Job 2 und Job 3 für macOS). Expected: grün.
- [ ] **Step 3: Commit** — `ci(einsatzbuch): Rust-Tests, App-Tore und tauri build --debug für Windows und macOS`

---

### Task 11: Abnahme, Review, PR

- [ ] **Step 1: Gesamt-Review.** Ein Review-Subagent prüft den gesamten Diff `git diff claude/einsatzbuch-v2-tauri-2471b2...HEAD` gegen Spec, Plan und Review Focus. Fix-Runden folgen, bis er sauber ist.
- [ ] **Step 2: Suite-Tore mit Exit-Code**, einzeln: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build`. Playwright der Suite nur, wenn eine Suite-Datei außerhalb der Werkzeugkonfiguration geändert wurde. Sonst begründet entfallen lassen und im Bericht nennen.
- [ ] **Step 3: App-Tore**
  - `cd A && pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`
  - `cd T && cargo test --workspace`
  - `cd A && pnpm tauri build --debug`, Bundle-Größen: `du -sh T/target/debug/bundle/macos/Einsatzbuch.app`, dazu dmg, falls gebaut.
- [ ] **Step 4: Durchspiel im echten Fenster.**
  - `cd A && pnpm tauri dev` im Hintergrund.
  - Computer-Use: `request_access` für das Dev-Binary `einsatzbuch`. Entwickler-Einrichtung mit Testvektor-Schlüssel und Frist 1, dann ein Testeinsatz bis „versiegelt“. Screenshot sichern.
  - DB-Beleg:
    ```bash
    sqlite3 "$HOME/Library/Application Support/dev.rubeen.iuksuite.einsatzbuch/einsatzbuch-test.db" "SELECT block, hash, versiegelt, json_extract(json,'$.kopf.umgebung') FROM bloecke;"
    ```
  - Danach „Testbetrieb beenden“ in der App und prüfen, dass die Datei weg ist. Den eigenen `tauri dev` beenden.
- [ ] **Step 5: Push und PR.**
  - `git push -u origin claude/einsatzbuch-v2-stufe-4`
  - `gh pr create --base claude/einsatzbuch-v2-tauri-2471b2 --title "feat(einsatzbuch): Stufe 4 — Desktop-App I" --body …`: deutsch, mit Abnahmezahlen, Entscheidungen, Abweichungen; am Ende `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - Danach `gh pr view --json autoMergeRequest`, Erwartung `null`.
- [ ] **Step 6: CI beobachten.** `gh pr checks` so lange abfragen, bis der Lauf endet (Memory: `--watch` endet still, deshalb die letzte Tabelle nicht als Endstand nehmen). Rot unter Windows: Fehler beheben, neu pushen, ohne Force.
- [ ] **Step 7:** Hat die Basis `claude/einsatzbuch-v2-tauri-2471b2` inzwischen neue Commits, wird sie per `git merge` hereingeholt, **nicht** per Rebase.
