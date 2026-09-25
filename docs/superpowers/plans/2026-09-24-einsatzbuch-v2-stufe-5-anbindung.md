# Einsatzbuch v2 — Stufe 5: Anbindung von Desktop-App und Suite — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Desktop-App meldet sich per Loopback und PKCE an der Suite an, richtet sich als echter Rechner oder als Test-Rechner ein, holt Stammdaten mit ETag, meldet Kettenanker und liest die versiegelten Einsätze nach der Schlüsselfreigabe in der Verwaltung. Die Suite führt Rechner, Anker, Einmalcodes und Sitzungen, zeigt sie auf der Seite „Rechner“ und löscht Test-Rechner samt Schlüssel und Ankern.

**Architecture:**
- **Suite:** Migration `0002` in der Modul-DB. Fachlogik als reine Funktionen unter `M/_lib/anbindung/`, der Drahtvertrag als zod-Schemas in `M/_lib/anbindung/vertrag.ts` samt JSON-Fixtures. Dünne Route Handler unter `M/api/…` (Host-Riegel, dann Token, dann zod). Anmeldeseite ohne Chrome unter `M/anmelden`, die Seite „Rechner“ im Verwaltungs-Layout.
- **Rust-Kern:** `loopback.rs` (Listener, `state`, PKCE, Timeout, Abbruch) und `suite.rs` (Protokoll gegen einen `Transport`-Trait, Anker- und Stammdatenabgleich, Freigabe in Paketen zu 200). Beides ist ohne Netz und ohne Webview testbar. Der Schlüsselbund steht hinter dem Trait `Tresor`.
- **Hülle:** Die echten Implementierungen (`ureq` mit `native-tls`, `keyring`) und die Befehle als dünne Hüllen um `fn(&Zustand, …)`. Dazu ein Abgleich-Thread für Stammdaten und Anker.
- **Oberfläche:** Einrichtungsfrage, Anmeldung und die Verwaltung mit den geteilten Ansichten des Kerns. Entschlüsselt wird nur im Speicher der Webview (`oeffneBlock`).

**Tech Stack:** Next.js 16, Drizzle + better-sqlite3, zod 4, Vitest, Playwright; Rust Edition 2024, Tauri 2, `rusqlite`, `ureq` (native-tls), `keyring`; Vite + React 19.

**Spec:** `docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md`, §4.4, §4.6, §4.7, §5.1–§5.3, §8, §12. Vorbild für Planform und Stil ist Stufe 1: `docs/superpowers/plans/2026-09-24-einsatzbuch-v2-stufe-1-kern-und-modul.md`.

**Ticket:** DRK-471. ClickUp pflegt der Hauptlauf, nicht diese Phase.

**Arbeitskopie:** `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-anbindung`, Branch `claude/einsatzbuch-v2-stufe-5`, PR-Basis `main`. **Nur absolute Pfade.** Keine Worktrees unter `.claude/worktrees/`, kein `isolation: "worktree"`.

Abkürzungen:
- `R` = `/Users/rubeen/dev/personal/drk/iuk-suite-einsatzbuch-anbindung`
- `M` = `R/src/app/m/einsatzbuch`
- `K` = `M/_lib/kern` (geteilter TS-Kern, **nicht ändern**)
- `A` = `R/apps/einsatzbuch`
- `T` = `A/src-tauri`
- `KR` = `T/kern`

## Global Constraints

- **Sprache:** Deutsche Texte mit echten Umlauten, auch in Rust-Kommentaren, Fehlermeldungen und UI-Texten. Bezeichner, Datei- und Branchnamen bleiben ASCII.
- **Format-Vertrag ist eingefroren.** Der TS-Kern `K` wird nicht geändert, und `K/testvektoren/*` wird nur gelesen. Nie `scripts/einsatzbuch-testvektoren.ts --neu`. Blockkopf, Hash, Umschlag und Export bleiben byte-gleich.
- **Fallen 1–20 aus `R/CLAUDE.md`** gelten. Für diese Stufe besonders wichtig:
  - 1: kein antd-Compound-Zugriff in Server Components;
  - 3: Rot ist in der Suite auch die Primärfarbe;
  - 6: keine Werte aus `"use client"`-Modulen in Server Components;
  - 7: keine `@ant-design/icons` in Server Components;
  - 9: `columns[].render` nur in Client-Komponenten;
  - 10: Warmlauf-GET vor einem POST im e2e;
  - 12: `klickeWennRuhig`.
  Vor Oberflächenarbeit an der Suite `R/docs/design/README.md` und `R/docs/design/feedback-admin.md` lesen.
- **Zugriffsschutz:**
  - Jede Modulseite ruft `requireEinsatzbuchHost` und danach einen Gruppenriegel.
  - Jeder Route Handler prüft zuerst `hostAbweisung(req)`, dann das Token (Bearer, SHA-256-Hash, Vergleich per `timingSafeEqual`), dann zod.
  - Objekt-Zugehörigkeit (welcher Rechner, welche Sitzung) wird immer aus der DB aufgelöst, nie aus einer URL-ID allein.
- **Audit:**
  - Jede neue Tabelle braucht eine Entscheidung in `R/src/core/audit/catalog.ts`. Auditierte Tabellen bekommen Trigger in der Migration (Vorbild `M/_db/migrations/0001_stammdaten_schluessel.sql`).
  - Jeder neue Route Handler und jede Server Action bekommt einen Eintrag in `R/src/core/audit/coverage-manifest.json`.
- **Kein `ring`, kein `aws-lc`.** Nach jeder Änderung an `Cargo.toml`: `grep -nE '^name = "(ring|aws-lc-rs|aws-lc-sys)"' T/Cargo.lock` findet nichts. Die CI prüft das Lockfile über alle Zielplattformen (`.github/workflows/einsatzbuch.yml`, Schritt „Kein ring“).
- **Keine echten Schlüsselbund- oder Netzzugriffe in `cargo test`.** Tresor und Transport stehen hinter Traits im Kern. Alle Tests nutzen Fakes oder einen lokalen `TcpListener` auf `127.0.0.1:0`.
- **Dünne Tauri-Befehle.** Jeder `#[tauri::command]` ruft genau eine Funktion `fn(&Zustand, …)` in `T/src/befehle.rs`. Alles, was `AppHandle` braucht (Opener, Fokus, Autostart), liegt außerhalb dieser Funktion und kommt als Rückruf oder Rückgabewert hinein bzw. heraus. Nur so beweist der E2E-Treiber (Task 12) denselben Pfad.
- **Debug-Schalter nur in Debug-Builds** (`cfg(debug_assertions)`): Entwickler-Einrichtung, Anmelde-URL auf stdout (`EINSATZBUCH_ANMELDUNG_STDOUT=1`), E2E-Treiber.
- **Zeitzone:** Zeitpunkte der Suite rechnen in der Suite-Zone (`zeitzone()` aus `@/core/zeit`, je Aufruf). Nie `timeZone` als Literal oder auf Modulebene.
- **Kommentaranker** nennen einen Namen, keine Zeile (`R/CLAUDE.md`, Abschnitt Kommentaranker).
- **Commits:**
  - signiert (`git commit -S`), `git log --format='%h %G?'` zeigt `G`;
  - Kopfzeile `feat(einsatzbuch): …` für Neues, sonst `fix`, `test`, `docs`, `build` oder `ci`;
  - Body enthält `DRK-471`, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - Botschaften vor dem Push fertig haben, denn Force-Push ist blockiert.
- **Tore je Task:** die Tests der Task. Dazu nach jeder Suite-Task `pnpm typecheck`, `pnpm lint` und `pnpm vitest run` vollständig, nach jeder App-Task `pnpm --filter einsatzbuch typecheck|lint|test` und `cargo test --workspace` in `T` (vorher `pnpm --filter einsatzbuch build`). Rust und Cargo kommen über mise (`mise exec -- cargo …`).
  - Vor jedem Urteil über einen roten Lauf `uptime` und `pgrep -fl "playwright|next-server"` prüfen. Bei zweistelliger Last die Datei einzeln nachfahren.
  - Fremde Prozesse nie beenden. Kein offener `pnpm dev` während Playwright.

## Review Focus

1. **Zweites Einlösen und Wettlauf:** Zwei parallele `tausch` mit demselben Code geben genau eine Sitzung aus. `loeseEin` markiert `eingeloest` per bedingtem `UPDATE … WHERE eingeloest_am IS NULL` und prüft `changes === 1`. Test in Task 2.
2. **Ein widerrufener oder gelöschter Rechner behält keine Hintertür:** Sitzungen, die an ihn gebunden sind, geben nach Widerruf bzw. Löschen nichts mehr frei (401/403), und sein Geräte-Token liefert 401. Tests in Task 3.
3. **Die App verliert beim Abbruch mitten in der Einrichtung nichts:** Scheitern Suite, Tresor oder DB, bleibt weder eine halbe DB-Datei noch ein verwaister Tresor-Eintrag zurück. Die Einrichtungsfrage erscheint wieder. Test in Task 8.
4. **Offline ist normal:** Ohne Netz bleiben Erfassen und Versiegeln unberührt, Anker werden beim nächsten Start nachgemeldet, und die Verwaltung zeigt „Lesen braucht Verbindung zur Suite.“ Tests in Tasks 7, 8 und 10.
5. **Sperren verwirft wirklich:** Nach „Sitzung sperren“, nach 10 min ohne Eingabe oder nach Ablauf des Tokens liegt weder Klartext noch ein CEK im React-Zustand, und Rust hält kein Sitzungstoken mehr. Tests in Tasks 8, 10 und 11.

---

## Entscheidungen, wo die Spec offen ist

Jede Entscheidung gehört in den Abschlussbericht.

1. **Die Einrichtungsart wird in der App gewählt und über die Anmelde-URL gereicht** (`&art=echt|test&name=…`). Einmalcode und Sitzung tragen sie, und `POST einrichten {art, name}` muss mit der Sitzung übereinstimmen („wird dort bestätigt“).
   - Ersetzt die Einrichtung einen aktiven echten Rechner, zeigt die Anmeldeseite vorher die Frage „Es gibt bereits einen echten Rechner, eingerichtet am … von … — ersetzen?“. Erst die Bestätigung, eine Server Action, erzeugt einen Code mit `ersetzen = 1`.
   - Ohne diese Markierung antwortet `einrichten` mit `409 echt_vorhanden`.
2. **Die Sitzung ist an einen Rechner gebunden.** Nach `einrichten` ist das der neu angelegte Rechner. Bei der Verwaltungsanmeldung schickt die App ihr Geräte-Token im `tausch` mit (`Authorization: Bearer`). Ist das Token ungültig oder widerrufen, entsteht eine Sitzung ohne Rechner (`rechnerId: null`); sie kann einrichten, aber nichts freigeben.
3. **Freigaberegeln (§12, verschärft):**
   - Alle Köpfe einer Anfrage tragen dieselbe `umgebung`, sonst `422 umgebung_gemischt`.
   - Die Art des Paars muss der Art des Sitzungsrechners gleichen, sonst `422 art_passt_nicht`.
   - Ein Test-Paar muss zum Sitzungsrechner gehören, sonst `422 fremder_rechner`.
   - `packeAusFuer` (Stufe 2) prüft außerdem Umgebung gegen Paar.
   - Es gibt kein Teilergebnis: Eine Ablehnung verwirft die ganze Anfrage.
4. **Audit der Freigabe über eine Protokolltabelle `freigabe`** mit Audit-Trigger. Das Audit-Modell (`AuditEventInput`) kennt kein Detailfeld, und `objectRef` wird gehasht.
   - Die Zeile trägt Person (`sub`, `name`), Art, Rechner-ID, Rechnername (denormalisiert), Blocknummern als Bereichstext und die Anzahl.
   - Sie hat keinen Fremdschlüssel und überlebt das Löschen eines Test-Rechners.
   - Die Seite „Rechner“ zeigt die letzten 20 Freigaben lesbar an.
5. **`schluesselpaar.rechner_id` bekommt eine Konsistenzregel per Trigger** statt einer echten FK-Spalte. Ein Neuaufbau der Tabelle müsste alle Audit-Trigger neu anlegen und scheiterte an verwaisten Test-Paaren aus Stufe 2.
   - `BEFORE INSERT/UPDATE` verlangt für `rechner_id IS NOT NULL` einen Rechner mit `art = 'test'`.
   - `AFTER DELETE ON rechner` löscht die Paare des Rechners.
   - Die neuen Tabellen `anker`, `anker_abweichung` und `sitzung` hängen per echtem FK `ON DELETE CASCADE` an `rechner`.
6. **Anker je Rechner** (§12: PK `rechnerId, block`). Ein neu eingerichteter echter Rechner beginnt ohne Anker. Die App setzt `anker_gemeldet_bis = 0` und meldet ihre ganze Kette neu. Die Anker des widerrufenen Vorgängers bleiben an dessen Zeile; die Wiederherstellung in Stufe 6 kann sie lesen.
7. **ETag** `"<version>/<zeitzone>"`: Die Suite-Zone gehört zum Paket, steigt aber nicht mit `stammdatenstand.version`.
8. **HTTP und Schlüsselbund:**
   - `ureq` mit `native-tls`, ohne Default-Features, liegt nur in der Hülle, denn rustls brächte `ring` oder `aws-lc` mit.
   - `keyring` liegt nur in der Hülle, zielplattformspezifisch (`apple-native` bzw. `windows-native`). Unter Linux gibt es einen Speicher-Tresor mit Warnung, denn die App wird nur für Windows und macOS gebaut.
   - Der Kern definiert die Traits `Transport` und `Tresor`.
9. **Sperren heißt abmelden.** Sperren verwirft Klartext und CEKs in der Oberfläche und das Sitzungstoken in Rust. „Entsperren“ ist eine neue Anmeldung. Spec §4.4: „Die Verwaltungssitzung … endet … beim Sperren“.
10. **Die Betriebsart folgt aus der Einrichtung.** Die DB-Datei entsteht erst nach einer erfolgreichen Antwort von `einrichten`. Liegen `einsatzbuch.db` und `einsatzbuch-test.db` beide vor, ist das ein Startfehler: „Im Datenordner liegen sowohl einsatzbuch.db als auch einsatzbuch-test.db. Welche gilt, ist unklar — bitte eine der beiden Dateien entfernen (lassen).“
11. **Anmeldung abgebrochen:**
    - Nach 5 min ohne Rückruf zeigt die App „Anmeldung nicht abgeschlossen. Nach 5 Minuten ohne Rückmeldung der Suite abgebrochen.“ Das deckt „abgebrochen“ und „Gruppe fehlt“ aus §8 ab, denn beides sieht die App gleich.
    - Die Seite „Kein Zugang“ bietet zusätzlich den Rückweg `http://127.0.0.1:<port>/rueckruf?state=…&fehler=kein_zugang`. Die App zeigt dann sofort „Kein Zugang zum Einsatzbuch — dir fehlt die Gruppe in der Suite.“
    - „Abbrechen“ in der App zeigt „Anmeldung abgebrochen.“
12. **Neu einrichten nach Widerruf** gibt es nur für den echten Rechner. Die Kette bleibt, der Schlüssel ist gepinnt: Eine andere `schluesselId` wird mit rotem Hinweis und beiden IDs abgelehnt. Ein widerrufener Test-Rechner zeigt „Testbetrieb beenden und neu einrichten“.
13. **Die Stammdaten-Ausgabe prüft die Grenzen des Readers** (Fund aus Phase C). Ein Verstoß antwortet `422 stammdaten_zu_lang` mit Feld und Eintrag, die App behält ihre Kopie. Die Eingabe-Schemas der Pflege sind heute schon strenger; ein Test hält das fest.
14. **Die Route `sicherung` ist gebaut, die App meldet aber erst in Stufe 6.** Sicherungsordner, Export und PDF gehören zu Stufe 6.
15. **Keine Release-Notiz.** Die Seite „Rechner“ nützt erst mit der ausgelieferten App, die Notiz kommt mit Stufe 7.
16. **Ende-zu-Ende ohne Klicks.** Computer-Use ist nicht freigegeben, und für WKWebView gibt es keinen WebDriver (Spec §9.3). Die Abnahme treibt deshalb ein Debug-Beispielprogramm `T/examples/e2e_lauf.rs`. Es ruft dieselben `fn(&Zustand, …)` wie die Tauri-Befehle, mit echtem Transport (`ureq`) und echtem Schlüsselbund.
    - „Verwaltung zeigt entschlüsselt“ wird mit demselben Kernaufruf (`oeffneBlock` mit den freigegebenen CEKs) belegt.
    - Die Oberfläche der Verwaltung prüft Playwright mit gestubbtem `invoke`.
    - Das ist eine Abweichung vom Wortlaut der Abnahme und wird gemeldet.
17. **Ratenbegrenzung `tausch`:** 10 pro Minute und `clientIpAus(req.headers)`. Auf Modul-Hosts ist das die Egress-Adresse der Suite (Kopfkommentar `clientIpAus`), die Bremse wirkt dort also global. Die e2e-Specs tauschen höchstens 6-mal je Lauf.

---

## Schnittstellen (Drahtvertrag)

Maßgeblich sind die zod-Schemas in `M/_lib/anbindung/vertrag.ts`. Die Fixtures unter `M/_lib/anbindung/vertrag/*.json` sind Beispielantworten. Vitest prüft sie gegen die Schemas, Rust deserialisiert sie mit `deny_unknown_fields`. Alle Pfade stehen unter `<suiteUrl>/m/einsatzbuch`. Fehlerkörper haben immer die Form `{ "error": { "code": string, "message": string } }`, bei Bedarf mit Zusatzfeldern auf oberster Ebene. Zeitpunkte sind ISO mit Offset in der Suite-Zone, z. B. `2026-09-25T10:00:00+02:00`. Tokens und Codes sind 32 Zufallsbytes in base64url ohne Padding (43 Zeichen).

| Nr. | Methode, Pfad | Auth | Anfrage | Erfolg | Fehler |
|---|---|---|---|---|---|
| 1 | `GET /anmelden?port&state&challenge[&art&name]` | Suite-Sitzung + Gruppe | `port` 1024–65535; `state` `^[A-Za-z0-9_-]{16,128}$`; `challenge` `^[A-Za-z0-9_-]{43}$`; `art` `echt\|test`; `name` 1–60 Zeichen getrimmt (Pflicht mit `art`) | 307 auf `http://127.0.0.1:<port>/rueckruf?code=<code>&state=<state>` | ungültige Parameter: Seite „Anmeldung nicht möglich“; ohne Sitzung: `/login?callbackUrl=…`; ohne Gruppe: Seite „Kein Zugang zum Einsatzbuch“; `art=echt` bei aktivem echtem Rechner: Ersetzen-Frage |
| 2 | `POST /api/anmelden/tausch` | Code + `verifier`; optional `Bearer <geraeteToken>` | `{code, verifier}`, `verifier` `^[A-Za-z0-9._~-]{43,128}$` | 200 `{sitzungstoken, name, ablauf, rechnerId: string\|null, einrichtung: {art, name, ersetzen: boolean}\|null}` | 400 `validation_error`, 400 `code_ungueltig` (unbekannt, abgelaufen, eingelöst), 400 `verifier_falsch` (Code danach verbraucht), 429 `rate_limited` |
| 3 | `POST /api/einrichten` | `Bearer <sitzungstoken>` | `{art, name}` | 200 `{rechnerId, art, name, geraeteToken, oeffentlichSpki, schluesselId, paket, eingerichtetAm, eingerichtetVon}` | 401 `sitzung_ungueltig`, 409 `einrichtung_passt_nicht`, 409 `schon_eingerichtet`, 409 `echt_vorhanden` + `{eingerichtetAm, eingerichtetVon}`, 422 `stammdaten_zu_lang`, 503 `kek_fehlt`/`kek_ungueltig`/`kein_echtes_paar` |
| 4 | `GET /api/stammdaten` | `Bearer <geraeteToken>`, `If-None-Match` | – | 200 `Stammdatenpaket` + `ETag`; 304 bei gleichem ETag; beide setzen `letzter_kontakt` | 401 `geraet_ungueltig`, 422 `stammdaten_zu_lang` + `{feld, eintrag}` |
| 5 | `POST /api/anker` | `Bearer <geraeteToken>` | `{block: 1…10000, hash: hex64}` | 204 (neu oder gleich) | 401, 400, 409 `anker_abweichung` + `{erwartet}` |
| 6 | `POST /api/sicherung` | `Bearer <geraeteToken>` | `{erstellt: Zeitpunkt}` | 204 | 401, 400 |
| 7 | `POST /api/schluessel/freigeben` | `Bearer <sitzungstoken>` | `[{kopf, umschlag}]`, 1–200 Einträge, Kopf und Umschlag streng wie `exportinhaltSchema` | 200 `[{block, cek}]` | 400, 401, 403 `sitzung_ohne_rechner`, 413 `zu_viele` (>200), 422 `umgebung_gemischt`/`art_passt_nicht`/`fremder_rechner`/`schluessel_unbekannt`/`schluessel_passt_nicht`/`umgebung_passt_nicht`/`umschlag_ungueltig` (Meldung nennt beide IDs), 503 `kek_*`/`privat_unlesbar` |
| 8 | `DELETE /api/rechner/<id>` | `Bearer <sitzungstoken>` | – | 204 | 401, 403 `nur_test`, 403 `fremder_rechner`, 404 `unbekannt` |

`Stammdatenpaket` (gleich `Stammdatenpaket` in `KR/src/einrichtung.rs`):

```json
{ "version": 7,
  "stammdaten": { "fahrzeuge": [{"id":"…","typ":"RTW","kennung":"11-83-1","ruf":"…","standort":"Uelzen"}],
                  "personal":  [{"id":"…","name":"Albers, Jana","quali":"SanH","ov":"Uelzen"}],
                  "stichworte":[{"name":"Rettungsdienst","items":["RD 1","RD 2"]}] },
  "fristMinuten": 15, "besatzung": true, "zeitzone": "Europe/Berlin", "bereitschaft": "DRK-Bereitschaft Uelzen" }
```

Das Paket enthält nur aktive Einträge. Stichworte sind nach `gruppe` gruppiert. Die Gruppen folgen ihrer kleinsten `reihenfolge`, danach dem Namen; die Items folgen `reihenfolge`, danach dem Namen.

Loopback-Rückruf (App): `GET /rueckruf?code=…&state=…` oder `GET /rueckruf?state=…&fehler=kein_zugang|abgebrochen`.
- Passt `state` nicht: 400 „Diese Anmeldung gehört nicht zu diesem Rechner.“ Der Listener wartet weiter.
- Andere Pfade: 404.
- Erfolg: 200 `text/html; charset=utf-8` mit „Du kannst dieses Fenster schließen.“

---

## Dateistruktur

**Suite (neu):**
- `M/_db/migrations/0002_anbindung.sql`: Tabellen, Trigger, Konsistenzregel. Dazu `meta/_journal.json`, `schema.ts` und `schema.test.ts`.
- `M/_lib/anbindung/`:
  - `token.ts`: Token und Code erzeugen, Hash, S256, Bearer lesen, Vergleich in konstanter Zeit;
  - `vertrag.ts`: zod-Schemas für Anfrage und Antwort, `fehler()`;
  - `vertrag/*.json`: Fixtures;
  - `einmalcode.ts`, `sitzung.ts`, `geraet.ts`, `rechner.ts`, `anker.ts`;
  - `stammdatenpaket.ts`: Paket bauen, Reader-Grenzen prüfen, ETag;
  - `freigabe.ts`: Regeln, `packeAusFuer`, Protokollzeile;
  - `anmeldeseite.ts`: Parameter prüfen, Rückruf-URL bauen, Zugang ohne `notFound`;
  - `status.ts`: Daten für die Seiten „Rechner“ und „Übersicht“;
  - je Datei eine `*.test.ts`.
- `M/_lib/reader/grenzen-abgleich.test.ts`: Abgleich von `grenzen.rs`, `formular.ts`, Stub und Pflege-Schemas gegen `einsatzSchema`.
- `M/api/anmelden/tausch/route.ts`, `M/api/einrichten/route.ts`, `M/api/stammdaten/route.ts`, `M/api/anker/route.ts`, `M/api/sicherung/route.ts`, `M/api/schluessel/freigeben/route.ts`, `M/api/rechner/[id]/route.ts`, je mit `route.test.ts`.
- `M/anmelden/page.tsx`, `M/anmelden/anmelden.module.css`, `M/_actions/anmelden.ts` (Ersetzen bestätigen).
- `M/(verwaltung)/rechner/page.tsx`, `M/_ui/rechner/*.tsx` (Client-Inseln), `M/_actions/rechner.ts` (widerrufen, Test-Rechner löschen).
- `R/e2e/einsatzbuch-anbindung.spec.ts`.

**Suite (geändert):**
- `M/(verwaltung)/page.tsx` (Übersicht: Rechnerstatus, Abweichungen)
- `M/_lib/nav.ts` + `nav.test.ts`, `R/src/core/shell/types.ts`, `R/src/core/shell/navIkonen.tsx` (+Test): Nav-Eintrag „Rechner“
- `R/src/core/audit/catalog.ts`, `R/src/core/audit/coverage-manifest.json`, ggf. `page-coverage-manifest.json`
- `R/e2e/gruppen.json`, `R/playwright.config.ts` (additiv `EINSATZBUCH_SCHLUESSEL_KEK`)

**Rust-Kern `KR/src`:**
- `format.rs`: `Blockkopf::kanonisch` gibt `Result` zurück
- `buch.rs`: Startfehler „beide Dateien“, Schema v2, neue Methoden
- `schema.sql` + `schema_v2.sql`
- `loopback.rs` (neu), `suite.rs` (neu), `tresor.rs` (neu, Trait + Speicher-Tresor)
- `anmeldung.rs`: URL bauen
- `vertrag.rs` (neu): Drahttypen

**Hülle `T/src`:**
- `zustand.rs`, `befehle.rs`, `lib.rs`
- `netz.rs` (neu): `ureq`-Transport
- `schluesselbund.rs` (neu): `keyring`-Tresor
- `abgleich.rs` (neu): Thread
- `T/examples/e2e_lauf.rs`, `T/Cargo.toml`

**Oberfläche `A/src`:**
- `typen.ts`, `befehle.ts`, `App.tsx`
- `seiten/Einrichtungsfrage.tsx` (ersetzt `NichtEingerichtet.tsx`), `seiten/Anmelden.tsx`, `seiten/Verwaltung.tsx`
- `verwaltung/*` (Modell, Freigabe, Sperre)
- `bausteine/Kopf.tsx`
- `A/e2e/stub.ts`, `A/e2e/verwaltung.spec.ts`

---

### Task 1: Suite-Tabellen, Konsistenzregel und Audit-Katalog

**Files:**
- Create: `M/_db/migrations/0002_anbindung.sql`
- Modify: `M/_db/migrations/meta/_journal.json` (Eintrag idx 2, Tag `0002_anbindung`, kein neuer Snapshot, wie Stufe 2), `M/_db/schema.ts`, `R/src/core/audit/catalog.ts`
- Test: `M/_db/schema.test.ts` (erweitern)

**Interfaces:**
- Produces (Drizzle, `M/_db/schema.ts`):
  - `rechner`: `id` text PK, `art` text enum echt/test, `name`, `tokenHash` (`token_hash`, unique), `eingerichtetAm` (timestamp), `eingerichtetVon`, `eingerichtetVonSub`, `letzterKontakt` (timestamp, null), `letzteSicherung` (text ISO, null), `widerrufenAm` (timestamp, null)
  - `anker`: `rechnerId` (FK cascade), `block` int, `hash`, `gemeldetAm` timestamp; PK (`rechner_id`, `block`)
  - `ankerAbweichung`: `id` PK, `rechnerId` (FK cascade), `block`, `erwartet`, `gemeldet`, `zeitpunkt`
  - `einmalcode`: `codeHash` PK, `challenge`, `sub`, `name`, `ablauf` timestamp, `eingeloestAm` (null), `einrichtungArt` (null), `rechnerName` (null), `ersetzen` bool default false
  - `sitzung`: `tokenHash` PK, `sub`, `name`, `ablauf`, `rechnerId` (FK cascade, null), `einrichtungArt`, `rechnerName`, `ersetzen`, `eingerichtet` bool default false
  - `freigabe`: `id` PK, `zeitpunkt`, `sub`, `name`, `art`, `rechnerId` (ohne FK), `rechnerName`, `bloecke` text, `anzahl` int

- [ ] **Step 1: Failing tests** in `schema.test.ts`, auf `testDb()` aus `M/_lib/testDb.ts`:
  - Ein zweiter aktiver echter Rechner scheitert am eindeutigen Teilindex `rechner_echt_aktiv` (`WHERE art='echt' AND widerrufen_am IS NULL`). Mit gesetztem `widerrufen_am` am ersten gelingt er.
  - Ein Test-Paar ohne existierenden Rechner scheitert: `INSERT` in `schluesselpaar` mit `art='test'` und unbekannter `rechner_id` wirft die Meldung `schluesselpaar.rechner_id: kein Test-Rechner`. Dasselbe gilt für einen Verweis auf einen echten Rechner.
  - Das `DELETE` eines Test-Rechners entfernt sein Paar, seine Anker, Abweichungen und Sitzungen; das echte Paar bleibt.
  - `audit_outbox` bekommt Zeilen für `rechner` create/update/delete, `anker_abweichung` create und `freigabe` create.
  - Ein `UPDATE rechner SET letzter_kontakt=…` oder `letzte_sicherung=…` allein erzeugt **keine** Audit-Zeile.
  - `anker`, `einmalcode` und `sitzung` erzeugen keine Audit-Zeilen.
- [ ] **Step 2:** `pnpm vitest run M/_db/schema.test.ts` → FAIL.
- [ ] **Step 3: Migration** von Hand, Stil wie `0001`:
  - Tabellen mit `CHECK (art IN ('echt','test'))`, FKs `REFERENCES rechner(id) ON DELETE CASCADE` auf `anker`, `anker_abweichung` und `sitzung`, Teilindex `rechner_echt_aktiv`.
  - Konsistenzregel:

```sql
CREATE TRIGGER schluesselpaar_rechner_insert BEFORE INSERT ON schluesselpaar
WHEN NEW.rechner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rechner WHERE id = NEW.rechner_id AND art = 'test')
BEGIN SELECT RAISE(ABORT, 'schluesselpaar.rechner_id: kein Test-Rechner'); END;
--> statement-breakpoint
CREATE TRIGGER schluesselpaar_rechner_update BEFORE UPDATE OF rechner_id ON schluesselpaar
WHEN NEW.rechner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rechner WHERE id = NEW.rechner_id AND art = 'test')
BEGIN SELECT RAISE(ABORT, 'schluesselpaar.rechner_id: kein Test-Rechner'); END;
--> statement-breakpoint
CREATE TRIGGER rechner_paar_loeschen AFTER DELETE ON rechner
BEGIN DELETE FROM schluesselpaar WHERE rechner_id = OLD.id; END;
```

  - Audit-Trigger `audit_rechner_create|update|delete`. Das `WHEN` des Update-Triggers vergleicht alle Spalten **außer** `letzter_kontakt` und `letzte_sicherung`.
  - `audit_anker_abweichung_create`, `audit_freigabe_create`. Die Referenz ist jeweils `NEW.id` bzw. `OLD.id`.
  - Verwaiste Test-Paare aus Stufe 2 (`art='test'` ohne Rechner) löscht die Migration vor dem Anlegen der Trigger per `DELETE FROM schluesselpaar WHERE art = 'test'`. Grund steht als SQL-Kommentar: Vor Stufe 5 gab es keine Test-Rechner, also ist jedes Test-Paar verwaist.
- [ ] **Step 4: Katalog** in `catalog.ts`, Block `einsatzbuch`:
  - `rechner` audited `["id"]`
  - `anker` excluded: „Hash-Meldungen des Rechners, keine Inhalte; Abweichungen stehen auditiert in anker_abweichung.“
  - `anker_abweichung` audited `["id"]`
  - `einmalcode` excluded: „Kurzlebige Einmalcodes der Anmeldung; die Anmeldung selbst ist als Sitzung nachvollziehbar, die Freigabe auditiert.“
  - `sitzung` excluded: „Technische Sitzungen des Rechners (30 min); jede Schlüsselfreigabe steht auditiert in freigabe.“
  - `freigabe` audited `["id"]`
- [ ] **Step 5:** Tests grün, dazu `pnpm vitest run src/core/audit src/core/bootstrap.test.ts`.
- [ ] **Step 6:** Commit `feat(einsatzbuch): Tabellen für Rechner, Anker, Einmalcodes und Sitzungen`.

### Task 2: Anbindungslogik der Suite und Drahtvertrag

**Files:** Create everything under `M/_lib/anbindung/` (see Dateistruktur, except `anmeldeseite.ts` → Task 4 and `status.ts` → Task 5) plus `M/_lib/reader/grenzen-abgleich.test.ts`.

**Interfaces (Produces, exakt so benennen):**

```ts
// token.ts — Node-crypto erlaubt (nicht Teil des Kerns)
export function neuesGeheimnis(): string;                       // 32 Byte base64url
export function hashVon(geheimnis: string): string;              // sha256 hex
export function s256(verifier: string): string;                  // base64url(sha256(ascii))
export function gleich(a: string, b: string): boolean;           // timingSafeEqual, Länge zuerst
export function bearerAus(req: Request): string | null;          // "Bearer <43 Zeichen base64url>" sonst null
// einmalcode.ts
export const CODE_GUELTIG_MS = 60_000;
export function erzeugeCode(db: Db, o: { challenge: string; sub: string; name: string; jetzt: Date;
  einrichtung: { art: "echt" | "test"; name: string; ersetzen: boolean } | null }): string;   // Klartext-Code
export type Einloesung = { ok: true; sub: string; name: string; einrichtung: {...} | null }
  | { ok: false; code: "code_ungueltig" | "verifier_falsch" };
export function loeseEin(db: Db, code: string, verifier: string, jetzt: Date): Einloesung;
// sitzung.ts
export const SITZUNG_GUELTIG_MS = 30 * 60_000;
export function erzeugeSitzung(db: Db, o: { sub: string; name: string; rechnerId: string | null; einrichtung: {...} | null; jetzt: Date }): { token: string; ablauf: Date };
export type SitzungZeile = typeof sitzung.$inferSelect;
export function sitzungAus(db: Db, token: string | null, jetzt: Date): SitzungZeile | null;  // abgelaufen → null; gebundener Rechner widerrufen → null
// geraet.ts
export function rechnerAusToken(db: Db, token: string | null): RechnerZeile | null;           // nur widerrufen_am IS NULL
export function kontakt(db: Db, rechnerId: string, jetzt: Date): void;
// rechner.ts
export type Einrichtungsergebnis = { ok: true; antwort: EinrichtenAntwort } | { ok: false; status: 409 | 422 | 503; code: string; message: string; extra?: Record<string, unknown> };
export async function richteEin(db: Db, s: SitzungZeile, anfrage: { art: "echt" | "test"; name: string }, o: { jetzt: Date; env?: Record<string,string|undefined> }): Promise<Einrichtungsergebnis>;
export function aktiverEchterRechner(db: Db): RechnerZeile | null;
export function widerrufe(db: Db, id: string, jetzt: Date): boolean;
export function loescheTestRechner(db: Db, id: string): "geloescht" | "unbekannt" | "nur_test";
// anker.ts
export function meldeAnker(db: Db, rechnerId: string, block: number, hash: string, jetzt: Date): { ok: true } | { ok: false; erwartet: string };
// stammdatenpaket.ts
export function baueStammdatenpaket(db: Db): Stammdatenpaket;                        // nur aktive, Zone = zeitzone()
export function etagVon(p: Stammdatenpaket): string;                                  // `"${version}/${zeitzone}"`
export function pruefeLesergrenzen(p: Stammdatenpaket): { ok: true } | { ok: false; feld: string; eintrag: string; laenge: number; hoechstens: number };
// freigabe.ts
export type FreigabeAnfrage = { kopf: Blockkopf; umschlag: Umschlag }[];
export type Freigabeergebnis = { ok: true; schluessel: { block: number; cek: string }[] } | { ok: false; status: 403 | 413 | 422 | 503; code: string; message: string };
export async function gibFrei(db: Db, s: SitzungZeile, anfrage: FreigabeAnfrage, o: { jetzt: Date; env?: Record<string,string|undefined> }): Promise<Freigabeergebnis>;
export function bereichsText(bloecke: number[]): string;  // [1,2,3,5,7,8] → "1–3, 5, 7–8"
// vertrag.ts
export const tauschAnfrage, tauschAntwort, einrichtenAnfrage, einrichtenAntwort, stammdatenpaketSchema, ankerAnfrage, sicherungAnfrage, freigabeAnfrage, freigabeAntwort; // zod
export function fehler(status: number, code: string, message: string, extra?: Record<string, unknown>): Response;
```

`Db` ist der Typ aus `M/_lib/stammdaten/daten.ts`. `Stammdatenpaket` ist `z.infer<typeof stammdatenpaketSchema>`. `freigabeAnfrage` übernimmt Kopf und Umschlag aus der Struktur von `exportinhaltSchema` in `M/_lib/reader/pruefung.ts`: dazu das `block`-Schema dort exportieren oder die Teilschemas `kopfSchema` und `umschlagSchema` herausziehen. Das ist eine Änderung an `pruefung.ts`, nicht am Kern, und ist erlaubt.

- [ ] **Step 1: Failing tests** je Datei, mit `testDb()` und fester `jetzt`:
  - `token.test.ts`:
    - `s256` des RFC-7636-Beispiels: Verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.
    - `bearerAus` lehnt fehlende, kleingeschriebene („bearer“) und zu kurze Werte ab.
    - `gleich` ist bei ungleicher Länge `false`, ohne zu werfen.
  - `einmalcode.test.ts`:
    - Einlösen mit dem richtigen Verifier gelingt einmal. Das zweite Einlösen liefert `code_ungueltig`.
    - Nach 60 001 ms: `code_ungueltig`.
    - Ein falscher Verifier liefert `verifier_falsch`, und danach ist auch der richtige `code_ungueltig`.
    - Zwei `loeseEin` hintereinander auf denselben Code, wobei das erste das bedingte `UPDATE` gewinnt, ergeben genau ein `ok`.
    - In der DB steht nur der Hash, nie der Klartext.
  - `sitzung.test.ts`:
    - Nach 30 min gilt die Sitzung nicht mehr (`null`).
    - Es gibt keine Verlängerung: Ein erneutes `sitzungAus` ändert `ablauf` nicht.
    - Ist der gebundene Rechner widerrufen, ergibt `sitzungAus` `null`.
  - `rechner.test.ts`:
    - `test` legt einen Rechner und ein eigenes Test-Paar an (`schluesselpaar.art='test'`, `rechner_id`). Der Rückgabeschlüssel ist dessen SPKI, das Token steht nur als Hash in der DB.
    - `echt` ohne aktiven echten Rechner legt ihn an und liefert das echte Paar.
    - `echt` bei vorhandenem aktivem echtem Rechner liefert ohne `ersetzen` `409 echt_vorhanden` mit `eingerichtetAm`/`eingerichtetVon`, **und nichts ist geändert** (Zeilenzahl und `widerrufen_am` gleich).
    - Mit `ersetzen` wird der alte widerrufen und der neue angelegt, in einer Transaktion.
    - Art oder Name weichen von der Sitzung ab: `409 einrichtung_passt_nicht`. Sitzung ohne `einrichtungArt`: ebenfalls.
    - Ein zweites `richteEin` mit derselben Sitzung liefert `409 schon_eingerichtet`.
    - Ohne KEK: `503 kek_fehlt`. `echt` ohne echtes Paar: `503 kein_echtes_paar`.
    - Nach dem Einrichten ist die Sitzung an den neuen Rechner gebunden.
    - `loescheTestRechner` auf `echt` liefert `nur_test`.
  - `anker.test.ts`:
    - Neu → `ok`, gleich → `ok`.
    - Anders → `{ok:false, erwartet}` plus eine Zeile in `anker_abweichung` mit beiden Hashes.
    - Anker zweier Rechner stören sich nicht.
  - `stammdatenpaket.test.ts`:
    - Inaktive Einträge fehlen, die Stichwortgruppen sind sortiert, `zeitzone` kommt aus `zeitzone()`.
    - `etagVon` ändert sich mit der Version und mit der Zone.
    - `pruefeLesergrenzen` meldet ein 41 Zeichen langes `typ` (Reader: 40) mit Feld „Fahrzeugtyp“ und dem Eintrag.
    - Das Paket passt zu `stammdatenpaketSchema` und zur Fixture-Form.
  - `freigabe.test.ts`: Umschläge mit `packeEin` aus `K/umschlag.ts` über die Paare der Test-DB erzeugen (`legePaarAn` mit KEK = `ENTWICKLUNGS_KEK`). Fälle:
    - Test-Sitzung + eigene Test-Köpfe → CEKs gleich den eingepackten.
    - Fremdes Test-Paar → `422 fremder_rechner`.
    - `umgebung` gemischt → `422 umgebung_gemischt`.
    - Echter Kopf auf Test-Sitzung → `422 art_passt_nicht`.
    - Fremde `schluesselId` → `422 schluessel_unbekannt`, die Meldung nennt die ID.
    - 201 Einträge → `413 zu_viele`, 200 gehen.
    - Sitzung ohne Rechner → `403 sitzung_ohne_rechner`.
    - Ohne KEK → 503.
    - Erfolg schreibt genau eine `freigabe`-Zeile (Person, Art, Rechner-ID, Rechnername, `bloecke` „1–3“, `anzahl` 3) und eine Audit-Zeile mit dem Akteur der Person.
    - Bei Ablehnung gibt es keine Zeile.
    - `bereichsText` liefert Bereiche.
  - `vertrag.test.ts`: Jede Datei unter `vertrag/` parst mit ihrem Schema (`tausch.json`, `einrichten.json`, `stammdaten.json`, `freigeben-anfrage.json`, `freigeben.json`, `fehler-echt-vorhanden.json`).
  - `grenzen-abgleich.test.ts`:
    - Liest `R/apps/einsatzbuch/src-tauri/kern/src/grenzen.rs`, `R/apps/einsatzbuch/src/logik/formular.ts` und `R/apps/einsatzbuch/e2e/stub.ts` **als Text** (`readFileSync`). Nicht importieren, denn `apps/**` liegt außerhalb der Suite-tsconfig.
    - Zieht die Zahlen per Regex heraus (`pub const STRASSE: usize = 200;`, `HOECHSTLAENGE = { strasse: 200, … }`, `["Straße", e.strasse.trim(), 200]`, `e.fahrzeuge.length > 200`).
    - Vergleicht jede mit `einsatzSchema.shape.<feld>` (zod 4: `.maxLength`) bzw. den Array-`max` bei Fahrzeugen und Personal. Für die Schnappschussfelder kommen die Werte aus `.shape.fahrzeuge.element.shape.*`.
    - Prüft außerdem, dass jede `max`-Grenze der Pflege-Schemas (`fahrzeugEingabe`, `personEingabe`, `stichwortEingabe` in `M/_lib/stammdaten/schemas.ts`) höchstens die Reader-Grenze erreicht.
    - Fehlt ein Regex-Treffer, ist der Test rot („Grenze X nicht gefunden — Datei umgebaut?“).
- [ ] **Step 2:** `pnpm vitest run M/_lib/anbindung M/_lib/reader/grenzen-abgleich.test.ts` → FAIL.
- [ ] **Step 3: Implementieren.** Hinweise:
  - `loeseEin` wertet den Verifier **vor** dem Verbrauch aus, verbraucht den Code aber in beiden Fällen per `UPDATE einmalcode SET eingeloest_am=? WHERE code_hash=? AND eingeloest_am IS NULL AND ablauf > ?`. Bei `changes !== 1` folgt `code_ungueltig`, erst danach der Vergleich `gleich(s256(verifier), challenge)`.
  - `richteEin` erzeugt das Schlüsselmaterial eines Test-Paars async **vor** der synchronen Transaktion. Dafür bekommt `M/_lib/schluessel/paar.ts` einen Helfer `bereitePaarVor(o: { art, rechnerId, kek, jetzt })`, der die `schluesselpaar`-Zeile ohne Insert liefert; `legePaarAn` nutzt ihn.
  - In einer Transaktion: Rechner einfügen, Paar einfügen, Sitzung auf `eingerichtet = 1` und `rechnerId` setzen, bei Ersetzen den alten echten widerrufen.
  - `eingerichtetAm` wird in der Suite-Zone mit Offset formatiert. Vorbild ist der Zeitpunkt-Helfer `mitOffset` in `M/_lib/schluessel/verwaltung.ts`, aber mit `zeitzone()` statt der Prozesszone: `Intl.DateTimeFormat("sv-SE", { timeZone: zeitzone(), … })` plus Offset aus `timeZoneName: "longOffset"`. Als eigener Helfer `zeitpunktInZone(d)` in `stammdatenpaket.ts`, mit Test für Sommer- und Winterzeit.
  - Die Audit-Zeile der Freigabe entsteht per Trigger. Der Insert läuft in `withAuditContext({ actor: auditActor({ sub, name }) }, …)`, der Akteur kommt aus der Sitzung.
  - Fixtures von Hand anlegen, mit realistischen Werten: Tokens mit 43 Zeichen, `schluesselId` mit 16 Hex-Zeichen, Zeitpunkte mit Offset.
- [ ] **Step 4:** Tests grün, danach `pnpm typecheck && pnpm lint && pnpm vitest run`.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Einmalcode, Sitzung, Einrichtung, Anker und Freigabe in der Suite`.

### Task 3: Route Handler der Rechner-Schnittstelle

**Files:** Create die acht `route.ts` unter `M/api/` (Tabelle Schnittstellen, Nr. 2–8) mit je einer `route.test.ts`. Modify `R/src/core/audit/coverage-manifest.json`.

**Interfaces:** Consumes Task 2. Jede Route: `export const dynamic = "force-dynamic"`.

Ablauf je Handler:
1. `const ab = hostAbweisung(req); if (ab) return ab;`
2. Token: `sitzungAus(db, bearerAus(req), jetzt)` bzw. `rechnerAusToken(db, bearerAus(req))`. Ohne Treffer folgt 401 mit `auditDenied("einsatzbuch")`. Beim Tausch zählt zuerst die Ratenbremse, dann der Code.
3. Körper begrenzt lesen: 8 KiB, bei `freigeben` 256 KiB. Vorbild `begrenztesJson` in `R/src/app/m/uav/_lib/begrenztesJson.ts`; der Helfer darf nach `M/_lib/anbindung/koerper.ts` kopiert werden (kein zweites Modul in `core`). Danach `schema.safeParse`.
4. Fachfunktion aufrufen und die Antwort bauen.

`tausch` nutzt `new RateLimiter({ windowMs: 60_000, max: 10 })` mit dem Schlüssel `clientIpAus(req.headers)`. `stammdaten` antwortet mit `ETag` und `Cache-Control: no-store`, bei passendem `If-None-Match` mit 304 ohne Körper. Beides ruft `kontakt()` auf. Handler mit Geräte-Token laufen unter `withAuditContext({ actor: { kind: "access", id: \`einsatzbuch:rechner:${r.id}\`, name: r.name } }, …)`.

Manifest:
- `tausch#POST`: `explicit-only`, Begründung „Anmeldung des Rechners; die Sitzung selbst ist technisch, jede Freigabe wird auditiert.“
- `einrichten#POST`, `anker#POST`, `schluessel/freigeben#POST`, `rechner/[id]#DELETE`: `context` via Methode.
- `sicherung#POST`: `context`.
- `stammdaten#GET`: `excluded` mit Standardbegründung „Read-only lookup …“.

- [ ] **Step 1: Failing tests** nach dem Muster `R/src/app/m/uav/api/anmeldung/route.test.ts`:
  - `vi.resetModules()`, `DATA_DIR` je Datei unter `./.data/einsatzbuch-api-<name>-test`, `migrateAllModules()`.
  - `vi.mock("@/core/auth")` ist hier nicht nötig. `SUITE_HOST_EINSATZBUCH` bleibt ungesetzt, Host `einsatzbuch.localtest.me`.
  - `EINSATZBUCH_SCHLUESSEL_KEK = ENTWICKLUNGS_KEK`, das echte Paar per `erzeugeEchtesPaar`.

  Pflichtfälle (Brief und Spec §9.2):
  - [ ] fremder Host → 404 für jede Route
  - [ ] Einmalcode abgelaufen → 400 `code_ungueltig`; zweites Einlösen → 400 `code_ungueltig`
  - [ ] falscher `verifier` → 400 `verifier_falsch`
  - [ ] ohne Gruppe kein Code: in Task 4 auf der Seite geprüft; hier zeigt `tausch` mit einem nie ausgegebenen Code → 400
  - [ ] 11. Tausch in einer Minute → 429
  - [ ] `tausch` mit gültigem Geräte-Token bindet die Sitzung an den Rechner, mit widerrufenem Token → `rechnerId: null`
  - [ ] Sitzungstoken abgelaufen (Uhr per `vi.setSystemTime` + 30 min) → `einrichten` 401, `freigeben` 401
  - [ ] Geräte-Token widerrufen → `stammdaten` 401, `anker` 401, `sicherung` 401
  - [ ] Anker-Abweichung → 409 `{erwartet}` und eine Zeile in `anker_abweichung`
  - [ ] `stammdaten`: 200 mit ETag, danach 304 mit `If-None-Match`, `letzter_kontakt` gesetzt; überlanges Feld per direktem DB-Insert → 422 `stammdaten_zu_lang`
  - [ ] fremde `schluesselId` → 422; Umgebung gemischt → 422; Test-Paar eines fremden Rechners → 422; Art des Sitzungsrechners ≠ Paar → 422
  - [ ] Paketgrenze: 200 → 200, 201 → 413
  - [ ] Audit-Zeile geschrieben: `freigabe` create mit Akteur der Person
  - [ ] `echt` ersetzt nicht ohne Bestätigung → 409 `echt_vorhanden`, der alte Rechner bleibt aktiv
  - [ ] `DELETE rechner/<id>`: echter Rechner → 403 `nur_test`; fremder Test-Rechner → 403 `fremder_rechner`; eigener → 204, danach sind Paar und Anker weg, das Geräte-Token liefert 401, und die Sitzung gibt nichts mehr frei
  - [ ] Antworten von `tausch`, `einrichten`, `stammdaten` und `freigeben` parsen mit ihren Antwortschemas aus `vertrag.ts`
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implementieren** und das Manifest ergänzen.
- [ ] **Step 4:** Grün, danach `pnpm vitest run src/core/audit` (Manifest-Abdeckung), `pnpm typecheck && pnpm lint && pnpm vitest run`.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Schnittstelle für Anmeldung, Einrichtung, Stammdaten, Anker und Freigabe`.

### Task 4: Anmeldeseite ohne Chrome, „Kein Zugang“, Ersetzen-Frage

**Files:**
- Create: `M/anmelden/page.tsx`, `M/anmelden/anmelden.module.css`, `M/_lib/anbindung/anmeldeseite.ts` (+Test), `M/_actions/anmelden.ts` (+Test), `R/e2e/einsatzbuch-anbindung.spec.ts` (Anmelde-Teil)
- Modify: `R/src/core/audit/coverage-manifest.json`, `R/e2e/gruppen.json` (neue Spec in die Gruppe mit den übrigen `einsatzbuch*`), `R/playwright.config.ts` (additiv `EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK` in das `env` des Web-Servers; `ENTWICKLUNGS_KEK` nicht importieren, das Literal mit Kommentar-Anker auf `M/_lib/schluessel/kek.ts`, Name `ENTWICKLUNGS_KEK`)

**Interfaces:**

```ts
// anmeldeseite.ts (kein "use client", kein notFound)
export type Anmeldeparameter = { port: number; state: string; challenge: string; einrichtung: { art: "echt" | "test"; name: string } | null };
export function leseAnmeldeparameter(sp: Record<string, string | string[] | undefined>): Anmeldeparameter | null;
export function rueckrufUrl(p: { port: number; state: string }, q: { code: string } | { fehler: "kein_zugang" | "abgebrochen" }): string; // immer http://127.0.0.1:<port>/rueckruf?...
export type Anmeldezugang = { art: "anmelden"; loginUrl: string } | { art: "kein_zugang" } | { art: "ok"; viewer: Viewer };
export async function anmeldezugang(pfadMitQuery: string): Promise<Anmeldezugang>;  // auditLoginRequired bzw. auditDenied selbst
```

Seitenlogik in `page.tsx`:
1. `requireEinsatzbuchHost(await headers())`.
2. Parameter lesen. Sind sie ungültig, zeigt die Seite „Anmeldung nicht möglich. Die Adresse ist unvollständig. Starte die Anmeldung erneut am Einsatzbuch-Rechner.“
3. `anmeldezugang()`:
   - `anmelden`: `redirect(loginUrl)` mit `callbackUrl` = voller Pfad samt Query, `encodeURIComponent`.
   - `kein_zugang`: Seite „Kein Zugang zum Einsatzbuch“, Text „Dein Konto ist nicht in der Gruppe für das Einsatzbuch. Bitte wende dich an die Leitung.“, Knopf-Link „Zurück zum Einsatzbuch-Rechner“ auf `rueckrufUrl(p, {fehler:"kein_zugang"})`. Kein Code.
4. Bei `einrichtung.art === "echt"` und `aktiverEchterRechner(db)` erscheint die Frage „Es gibt bereits einen echten Rechner, eingerichtet am {Datum} von {Name} — ersetzen?“.
   - Hinweis: „Der bisherige Rechner wird widerrufen und kann danach weder Stammdaten holen noch Anker melden.“
   - Formular mit Server Action `ersetzenBestaetigenAction` (versteckte Felder port, state, challenge, name) und Knopf „Ersetzen“.
   - Link „Abbrechen“ auf `rueckrufUrl(p, {fehler:"abgebrochen"})`.
5. Sonst: `erzeugeCode(...)` und `redirect(rueckrufUrl(p, {code}))`.

Die Seite hat kein `Shell` und liegt außerhalb von `(verwaltung)`. Sie nutzt nur `Card`/`Result` und eigenes Markup mit eigenen CSS-Variablen (Fallen 1 und 2).

`ersetzenBestaetigenAction(formData)`:
- `"use server"` als erstes Zeichen der Datei.
- Prüft Host, Sitzung und Gruppe wie `requireEinsatzbuchAktion`, liest die Parameter neu über `leseAnmeldeparameter` und erzeugt den Code mit `ersetzen: true`.
- Endet mit `redirect(rueckrufUrl(...))`.
- Manifest `context` via `ersetzenBestaetigenAction`.

- [ ] **Step 1: Erste Probe** (Advisor-Punkt, vor allem anderen): eine Playwright-Minimalspec.
  - Ablauf: devLogin mit Gruppe, dann `page.route("http://127.0.0.1:*/rueckruf**", r => r.fulfill({ body: "ok" }))`, dann `page.goto(url("/anmelden?port=54321&state=<22 Zeichen>&challenge=<43>"))`. Erwartet wird, dass die Anfrage mit `code` und `state` auf 127.0.0.1 ankommt.
  - Zweite Probe: **ohne** Login. Das Ziel landet auf `/login`, und nach devLogin geht es mit erhaltener Query zurück, bis zur Weiterleitung auf 127.0.0.1.
  - Scheitert eine der beiden Proben an der Suite (Query gekappt, externe Weiterleitung abgewiesen), stoppen und dem Controller melden: möglicher Fall c.
- [ ] **Step 2: Failing tests (Vitest)** `anmeldeseite.test.ts`:
  - Port 1023 und 65536 werden abgewiesen, `port=08080` ebenfalls (nur Ziffern ohne führende Null).
  - `state` mit „/“ wird abgewiesen, `challenge` mit 42 Zeichen ebenfalls.
  - `art` ohne `name` wird abgewiesen.
  - `rueckrufUrl` beginnt immer mit `http://127.0.0.1:` und kodiert `state`.
  - `anmeldezugang` ohne Sitzung liefert die `loginUrl` mit kodierter Query, ohne Gruppe `kein_zugang` samt Audit-Zeile `access_denied`.
  - `anmelden.test.ts` (Action): ohne Gruppe `Forbidden`; mit Gruppe steht ein Code mit `ersetzen = 1` in der DB, und `redirect` wird mit der 127.0.0.1-URL gerufen (`next/navigation` mocken).
- [ ] **Step 3: Implementieren.** Das `page-coverage-manifest` betrifft nur direkte `notFound`/`redirect`-Aufrufe in `page.tsx`. Die Login-Weiterleitung kommt deshalb als Wert aus `_lib` (`loginUrl`), und die Seite ruft `redirect(z.loginUrl)`. Prüfen, ob `src/core/audit/page-denials.test.tsx` bzw. der Manifest-Scanner diesen Aufruf als Eintrag verlangt. Wenn ja, Eintrag `excluded` mit Begründung „Anmeldeumweg ohne Sitzung; Audit per auditLoginRequired in _lib“.
- [ ] **Step 4: Playwright** in `R/e2e/einsatzbuch-anbindung.spec.ts`. `HOST = "einsatzbuch.localtest.me"`, Ports über `E2E_PORT`, jede Weiterleitung mit `page.waitForRequest` abgefangen:
  - „Anmeldeseite leitet mit Code und state auf 127.0.0.1“
  - „ohne Gruppe: Kein Zugang zum Einsatzbuch, keine Weiterleitung“: Überschrift sichtbar, und `page.route` auf 127.0.0.1 hat **keine** Anfrage gesehen
  - „ohne Login: zurück zur Anmeldeseite nach devLogin“
  - „echt bei vorhandenem echtem Rechner fragt nach und leitet erst nach Ersetzen“. Den vorhandenen echten Rechner legt die Spec über die API an: Seite mit `art=echt` → Code → `request.post(tausch)` → `einrichten`. Dafür muss vorher ein echtes Paar existieren, das `e2e/seed-einsatzbuch.ts` anlegt: `stelleEchtesPaarWiederHer` bzw. `erzeugeEchtesPaar` mit dem Entwicklungs-KEK, idempotent. Das Skript wird in `playwright.config.ts` vor `next dev` eingereiht (`pnpm exec tsx e2e/seed-einsatzbuch.ts`), Vorbild `e2e/seed-lagerbuch.ts`.
  - Ein Helfer `rechnerAnlegen(page, request, { art, name })` in der Spec übernimmt PKCE (Node `crypto`), die Anmeldeseite, `tausch` und `einrichten` und gibt `{ geraeteToken, sitzungstoken, rechnerId }` zurück. Task 5 nutzt ihn weiter. Er wärmt jede Route vor dem ersten POST mit einem GET auf (Falle 10); ein GET auf einen POST-Handler antwortet 405, genügt aber.
- [ ] **Step 5:** `pnpm exec playwright test e2e/einsatzbuch-anbindung.spec.ts e2e/einsatzbuch.spec.ts e2e/einsatzbuch-reader.spec.ts` grün, `pnpm build` grün (Fallen, die nur der Build sieht).
- [ ] **Step 6:** Commit `feat(einsatzbuch): Anmeldeseite für den Rechner mit Einmalcode und Ersetzen-Frage`.

### Task 5: Seite „Rechner“, Übersicht, Widerrufen und Test-Rechner löschen

**Files:**
- Create: `M/(verwaltung)/rechner/page.tsx`, `M/_lib/anbindung/status.ts` (+Test), `M/_ui/rechner/EchterRechner.tsx`, `M/_ui/rechner/TestRechnerListe.tsx`, `M/_ui/rechner/Freigaben.tsx` (Client-Inseln mit serialisierbaren Props), `M/_actions/rechner.ts` (+Test)
- Modify: `M/(verwaltung)/page.tsx`, `M/_lib/nav.ts` (+Test), `R/src/core/shell/types.ts` + `navIkonen.tsx` (+Test; neuer Name `rechner`, Inline-SVG wie die übrigen), `coverage-manifest.json`, `R/e2e/einsatzbuch-anbindung.spec.ts`

**Interfaces:**

```ts
// status.ts
export interface EchterRechnerStatus { id: string; name: string; eingerichtetAm: string; eingerichtetVon: string; letzterKontakt: string | null; letzteSicherung: string | null; ankerBis: number | null; abweichungen: { block: number; erwartet: string; gemeldet: string; zeitpunkt: string }[]; schluesselId: string | null }
export interface TestRechnerZeile { id: string; name: string; eingerichtetAm: string; eingerichtetVon: string; letzterKontakt: string | null; ankerBis: number | null; abweichungen: number }
export interface FreigabeZeile { zeitpunkt: string; name: string; art: "echt" | "test"; rechnerName: string; bloecke: string; anzahl: number }
export function rechnerStatus(db: Db): { echt: EchterRechnerStatus | null; test: TestRechnerZeile[]; freigaben: FreigabeZeile[] }; // Zeiten als Text in Suite-Zone (zeitFormat)
// _actions/rechner.ts ("use server")
export async function rechnerWiderrufenAction(id: string): Promise<ActionErgebnis<null>>;   // nur aktiver echter Rechner; Test-Rechner werden gelöscht, nicht widerrufen
export async function testRechnerLoeschenAction(id: string): Promise<ActionErgebnis<null>>; // nur art=test
```

`ActionErgebnis` kommt aus `M/_lib/actionErgebnis.ts`. Beide Actions laufen über `requireEinsatzbuchAktion()` und `withAuditContext({ actor: auditActor(viewer) }, …)` und rufen `revalidatePath`.

Seite „Rechner“ (Spec §5.2, Brief):
- **Karte „Echter Einsatzbuch-Rechner“:** eingerichtet am/von, letzter Kontakt, letzte Sicherung, „Anker bis Block n“, Schlüssel-Fingerabdruck (`schluesselId`) und der Knopf „Rechner widerrufen“ mit Bestätigung: „Der Rechner kann danach weder Stammdaten holen noch Anker melden. Er versiegelt weiter, bis er neu eingerichtet ist.“
  - Abweichungen stehen als rote Liste: Block, erwartet, gemeldet, Zeitpunkt. Falle 3: Rot erscheint als Text- und Randfarbe der Abweichungsliste, nicht als rote Fläche, und kein `Alert type="error"`. Vor der Umsetzung `docs/design/README.md` zu Status- und Fehlerfarben lesen.
  - Ohne echten Rechner: „Noch kein echter Rechner eingerichtet. Die Einrichtung startet am Rechner selbst.“
- **Test-Rechner:** `Datentabelle` bzw. `Kartentabelle` wie in `M/_ui/stammdaten/StammdatenTabelle.tsx`, mit Name, eingerichtet am/von, letztem Kontakt, „Anker bis“ und Aktion „Test-Rechner löschen“.
  - Bestätigung: „Test-Rechner „{Name}“ löschen? Rechner, Token, Schlüsselpaar und Anker werden unwiderruflich entfernt. Testeinsätze dieses Rechners lassen sich danach nicht mehr öffnen.“ Knopf „Endgültig löschen“.
  - Leer: „Keine Test-Rechner.“
- **Letzte Schlüsselfreigaben:** Liste Zeitpunkt, Person, Art, Rechner, Blöcke, Anzahl.

Übersicht, `(verwaltung)/page.tsx`: zusätzliche Karten „Echter Rechner“ (eingerichtet ja/nein, letzter Kontakt, Anker bis Block n) und „Anker-Abweichungen“ (Zahl, bei > 0 rot beschriftet), dazu ein Link auf `/rechner`.

- [ ] **Step 1: Failing tests:**
  - `status.test.ts`: `ankerBis` ist der höchste Block; Abweichungen stehen nur am betroffenen Rechner; ein widerrufener echter Rechner erscheint nicht als aktiv; Freigaben sind absteigend sortiert und auf 20 begrenzt.
  - `rechner.test.ts` (Actions):
    - ohne Gruppe → `Forbidden`
    - `testRechnerLoeschenAction` auf einen echten Rechner → `ok:false` mit Meldung, nichts gelöscht
    - auf einen Test-Rechner → Paar und Anker weg, Audit-Zeile `delete rechner` mit Akteur
    - `rechnerWiderrufenAction` setzt `widerrufen_am`, und `rechnerAusToken` liefert danach `null`
  - `nav.test.ts`: Eintrag `rechner` mit href `/rechner`.
- [ ] **Step 2:** FAIL → **Step 3:** implementieren → Vitest grün.
- [ ] **Step 4: Playwright** (dieselbe Spec):
  - „Rechner-Seite listet einen Test-Rechner und löscht ihn nach Bestätigung“. Der Rechner kommt über den Helfer aus Task 4 mit einem Anker per `request.post(anker)`. Nach dem Löschen ist er aus der Liste verschwunden, und `GET stammdaten` mit seinem Geräte-Token liefert 401.
  - „Übersicht zeigt Rechnerstatus“.
  - Klicks über `klickeWennRuhig` (Falle 12).
- [ ] **Step 5:** `pnpm build`, dann die Einsatzbuch-Specs, `pnpm typecheck && pnpm lint && pnpm vitest run`.
- [ ] **Step 6:** Commit `feat(einsatzbuch): Seite Rechner mit Widerruf, Test-Rechnern und Freigabeliste`.

### Task 6: Rust-Kern — Startfehler, Blocknummerngrenze, Schema v2

**Files:** Modify `KR/src/format.rs`, `KR/src/buch.rs`, `KR/src/versiegeln.rs` (Aufrufer von `kanonisch`), `KR/src/einrichtung.rs`. Create `KR/src/schema_v2.sql`. Tests in `KR/tests/buch.rs` und `KR/tests/versiegeln.rs`.

**Interfaces (Produces):**

```rust
// format.rs
impl Blockkopf { pub fn kanonisch(&self) -> Result<String, crate::jcs::JcsFehler>; }
// buch.rs
pub enum BuchFehler { …, BeideDateien, AndererSchluessel { gepinnt: String, neu: String }, … }
pub fn erkenne_betrieb(ordner: &Path) -> Result<Option<Betrieb>, BuchFehler>; // beide vorhanden → Err(BeideDateien)
pub struct Anbindung { pub rechner_id: String, pub rechner_name: String, pub stammdaten_etag: Option<String>,
  pub stammdaten_abgerufen: Option<String>, pub anker_gemeldet_bis: u64,
  pub anker_abweichung: Option<Ankerabweichung>, pub widerrufen: bool }
#[derive(Serialize, Deserialize)] #[serde(rename_all = "camelCase")]
pub struct Ankerabweichung { pub block: u64, pub erwartet: String, pub gemeldet: String }
impl Buch {
  pub fn richte_ein(&mut self, e: &Einrichtung, rechner_id: &str, rechner_name: &str) -> Result<(), BuchFehler>;
  pub fn richte_neu_ein(&mut self, e: &Einrichtung, rechner_id: &str, rechner_name: &str) -> Result<(), BuchFehler>; // AndererSchluessel bei anderer schluessel_id; setzt anker_gemeldet_bis=0, widerrufen=0, abweichung=NULL
  pub fn anbindung(&self) -> Result<Option<Anbindung>, BuchFehler>;
  pub fn uebernehme_stammdaten(&mut self, p: &Stammdatenpaket, etag: Option<&str>, abgerufen: &str) -> Result<(), BuchFehler>;
  pub fn stammdaten_bestaetigt(&mut self, abgerufen: &str) -> Result<(), BuchFehler>;   // 304
  pub fn unbestaetigte_anker(&self) -> Result<Vec<(u64, String)>, BuchFehler>;          // block > anker_gemeldet_bis, aufsteigend
  pub fn anker_bestaetigt(&mut self, block: u64) -> Result<(), BuchFehler>;             // nur erhöhen (MAX)
  pub fn anker_abweichung_setzen(&mut self, a: &Ankerabweichung) -> Result<(), BuchFehler>;
  pub fn widerrufen_setzen(&mut self, widerrufen: bool) -> Result<(), BuchFehler>;
}
```

Schema v2 in `schema_v2.sql`:

```sql
ALTER TABLE einrichtung ADD COLUMN rechner_id TEXT;
ALTER TABLE einrichtung ADD COLUMN rechner_name TEXT;
ALTER TABLE einrichtung ADD COLUMN stammdaten_etag TEXT;
ALTER TABLE einrichtung ADD COLUMN stammdaten_abgerufen TEXT;
ALTER TABLE einrichtung ADD COLUMN anker_abweichung TEXT;
ALTER TABLE einrichtung ADD COLUMN widerrufen INTEGER NOT NULL DEFAULT 0 CHECK (widerrufen IN (0, 1));
```

`richte_schema_ein`:
- Version 0 legt `schema.sql` und danach `schema_v2.sql` in einer Transaktion an und setzt `user_version = 2`.
- Version 1 wendet `schema_v2.sql` in einer Transaktion an und setzt 2.
- Version 2 bleibt unverändert, höhere Versionen gelten als unbekannt.
- Der Entwicklerweg (`entwicklung.rs`) setzt `rechner_id = "entwicklung"` und `rechner_name = "Entwicklung"`.

- [ ] **Step 1: Failing tests:**
  - `Blockkopf { block: 2^53, … }.kanonisch()` ist `Err(JcsFehler::…)` und löst keinen Panic aus.
  - `versiegele_ausstehend` mit einer manipulierten Kette, deren letzter Block 2^53 − 1 ist (per `verbindung()` eine Zeile einfügen), liefert einen Fehler statt eines Panics. Kommt dieser Fall wegen `kette_hat_platz` gar nicht an, testet der Fall den direkten Kanonik-Aufruf mit einem großen Wert.
  - Liegen beide Dateien im Ordner, liefert `erkenne_betrieb` `Err(BeideDateien)`. Der Display-Text lautet wie in Entscheidung 10.
  - Der bisherige Test „Test vor Echt“ wird **bewusst umgeschrieben**: ausdrücklicher Kommentar im Test, Name `beide_dateien_sind_ein_startfehler`.
  - v1→v2: Eine Datei mit dem v1-Schema (`schema.sql` + `PRAGMA user_version=1` von Hand) und einer Einrichtungszeile öffnet mit `Buch::oeffne`, die Einrichtung ist erhalten, `user_version` ist 2 und `anbindung()` liefert `Some` mit `rechner_id = ""`. Dafür `rechner_id` beim Lesen per `COALESCE(rechner_id, '')` lesen. Der Fall trifft nur Entwicklerdateien.
  - `richte_neu_ein` mit anderer `schluessel_id` liefert `AndererSchluessel`, und nichts ändert sich.
  - Gleicher Schlüssel: `rechner_id` ist neu, `anker_gemeldet_bis` ist 0, Kette und `eingerichtet_am` sind unverändert.
  - `unbestaetigte_anker` nach 3 versiegelten Blöcken und `anker_bestaetigt(2)` liefert `[(3, h3)]`.
  - `anker_bestaetigt(1)` nach 2 senkt nicht.
- [ ] **Step 2:** `mise exec -- cargo test -p einsatzbuch-kern` → FAIL.
- [ ] **Step 3:** Implementieren. Alle Aufrufer von `kanonisch()` reichen den Fehler weiter (`ErfassungFehler` bekommt eine Variante `Kanonik(JcsFehler)`). Die Vektortests bleiben byte-gleich.
- [ ] **Step 4:** Grün, dazu `cargo test --workspace` (Hülle kompiliert mit neuer `richte_ein`-Signatur; `befehle.rs` minimal nachziehen).
- [ ] **Step 5:** Commit `fix(einsatzbuch): Kern meldet große Blocknummern und doppelte Datenbanken als Fehler` (Body nennt dazu Schema v2).

### Task 7: Rust-Kern — Loopback mit PKCE und Suite-Protokoll

**Files:** Create `KR/src/loopback.rs`, `KR/src/suite.rs`, `KR/src/vertrag.rs`, `KR/src/tresor.rs`. Modify `KR/src/lib.rs`, `KR/src/anmeldung.rs`, `KR/Cargo.toml` (nur falls nötig: `sha2`/`base64`/`getrandom` sind vorhanden, kein neues Netz-Crate im Kern). Tests: `KR/tests/loopback.rs`, `KR/tests/suite.rs`, `KR/tests/vertrag.rs`.

**Interfaces (Produces):**

```rust
// anmeldung.rs (ergänzt)
pub struct Pkce { pub verifier: String, pub challenge: String }     // verifier: 32 Zufallsbytes base64url (43), challenge = base64url(sha256)
pub fn pkce(z: &mut dyn crate::krypto::Zufall) -> Pkce;
pub fn neuer_state(z: &mut dyn crate::krypto::Zufall) -> String;   // 32 Byte base64url
pub fn anmelde_url(suite_url: &str, port: u16, state: &str, challenge: &str, einrichtung: Option<(&str /*art*/, &str /*name*/)>) -> String; // <suite>/m/einsatzbuch/anmelden?…, Werte percent-kodiert
// loopback.rs — nur std::net
pub const ZEITLIMIT: Duration = Duration::from_secs(300);
pub enum Rueckruf { Code(String), KeinZugang, Abgebrochen }
#[derive(thiserror::Error)] pub enum LoopbackFehler { #[error("Anmeldung nicht abgeschlossen. Nach 5 Minuten ohne Rückmeldung der Suite abgebrochen.")] Zeitlimit, #[error("Anmeldung abgebrochen.")] Abbruch, #[error("…")] Io(#[from] std::io::Error) }
pub struct Listener { /* TcpListener auf 127.0.0.1:0, nonblocking */ }
impl Listener {
  pub fn oeffne() -> std::io::Result<Listener>;
  pub fn port(&self) -> u16;
  /// Wartet auf GET /rueckruf mit passendem state. Pollt alle 50 ms `abbruch`. Falscher state → 400 an den Browser, weiter warten.
  pub fn warte(self, state: &str, zeitlimit: Duration, abbruch: &AtomicBool) -> Result<Rueckruf, LoopbackFehler>;
}
// vertrag.rs — serde, camelCase, deny_unknown_fields, gleich der Tabelle „Schnittstellen“
pub struct TauschAntwort { pub sitzungstoken: String, pub name: String, pub ablauf: String, pub rechner_id: Option<String>, pub einrichtung: Option<Einrichtungswunsch> }
pub struct Einrichtungswunsch { pub art: Umgebung, pub name: String, pub ersetzen: bool }
pub struct EinrichtenAntwort { pub rechner_id: String, pub art: Umgebung, pub name: String, pub geraete_token: String, pub oeffentlich_spki: String, pub schluessel_id: String, pub paket: Stammdatenpaket, pub eingerichtet_am: String, pub eingerichtet_von: String }
pub struct Freigabeposten { pub kopf: Blockkopf, pub umschlag: Umschlag }
pub struct Schluesselposten { pub block: u64, pub cek: String }
pub struct Fehlerkoerper { pub error: FehlerInhalt, #[serde(default)] pub erwartet: Option<String>, … }  // Zusatzfelder optional
// tresor.rs
pub trait Tresor: Send + Sync { fn lies(&self, konto: &str) -> Result<Option<String>, String>; fn schreibe(&self, konto: &str, wert: &str) -> Result<(), String>; fn loesche(&self, konto: &str) -> Result<(), String>; }
pub struct Speichertresor(Mutex<HashMap<String,String>>); // Tests + Linux
pub fn konto_fuer(betrieb: Betrieb) -> &'static str;      // "geraetetoken-echt" | "geraetetoken-test"
// suite.rs
pub struct Anfrage<'a> { pub methode: &'static str, pub url: String, pub bearer: Option<&'a str>, pub if_none_match: Option<&'a str>, pub json: Option<String> }
pub struct Antwort { pub status: u16, pub etag: Option<String>, pub koerper: String }
pub trait Transport: Send + Sync { fn sende(&self, a: Anfrage<'_>) -> Result<Antwort, String>; } // Err = Netz nicht erreichbar
pub enum SuiteFehler { NichtErreichbar(String), Abgelehnt { status: u16, code: String, meldung: String }, Widerrufen, Antwort(String) }
pub fn tausche(t: &dyn Transport, suite: &str, code: &str, verifier: &str, geraet: Option<&str>) -> Result<TauschAntwort, SuiteFehler>;
pub fn richte_ein(t: &dyn Transport, suite: &str, sitzung: &str, art: Umgebung, name: &str) -> Result<EinrichtenAntwort, SuiteFehler>;
pub enum StammdatenErgebnis { Neu { paket: Stammdatenpaket, etag: Option<String> }, Unveraendert }
pub fn hole_stammdaten(t: &dyn Transport, suite: &str, geraet: &str, etag: Option<&str>) -> Result<StammdatenErgebnis, SuiteFehler>; // 401 → Widerrufen
pub enum AnkerErgebnis { Bestaetigt(u64), Abweichung(Ankerabweichung), Offline, Widerrufen }
/// Meldet alle unbestätigten Blöcke aufsteigend; hält das Buch nur zum Lesen und Schreiben, nie während einer Anfrage.
pub fn gleiche_anker_ab(buch: &Mutex<Option<Buch>>, t: &dyn Transport, suite: &str, geraet: &str) -> Result<AnkerErgebnis, String>;
pub const PAKET: usize = 200;
pub fn gib_frei(t: &dyn Transport, suite: &str, sitzung: &str, bloecke: &[Block]) -> Result<Vec<Schluesselposten>, SuiteFehler>; // in Paketen zu 200
pub fn loesche_rechner(t: &dyn Transport, suite: &str, sitzung: &str, rechner_id: &str) -> Result<(), SuiteFehler>;
```

`gleiche_anker_ab` verhält sich so:
1. Unter dem Lock `unbestaetigte_anker()` lesen, dann den Lock freigeben.
2. Je Block `POST anker` senden:
   - 204 → unter dem Lock `anker_bestaetigt(block)`.
   - 409 → `anker_abweichung_setzen`, Abbruch mit `Abweichung`.
   - 401 → `widerrufen_setzen(true)`, `Widerrufen`.
   - Netzfehler → `Offline`.
3. Sind alle bestätigt und lag keiner an, wird trotzdem der **letzte** Block erneut gemeldet. Das ist „Kette prüfen gegen den Anker“: 204 bestätigt, 409 zeigt eine Abweichung.

- [ ] **Step 1: Failing tests:**
  - `loopback.rs`:
    - Rückruf mit passendem `state` → `Code`, und der Browser bekommt 200 mit „Du kannst dieses Fenster schließen.“ (per `TcpStream` einen rohen GET senden und die Antwort lesen).
    - Falscher `state` → 400, der Listener wartet weiter, und ein anschließender richtiger Rückruf gelingt.
    - `/favicon.ico` → 404.
    - `fehler=kein_zugang` → `KeinZugang`.
    - Zeitlimit 200 ms → `Zeitlimit`.
    - `abbruch.store(true)` → `Abbruch` binnen 200 ms.
    - Ein Code mit `%`-Kodierung wird dekodiert.
    - Der Port ist ≥ 1024, und der Listener bindet an 127.0.0.1, nicht an 0.0.0.0 (`local_addr().ip().is_loopback()`).
  - `anmeldung.rs`: `pkce` mit Skript-Zufall ergibt eine Challenge gleich der RFC-7636-Rechnung, dazu ein fester Vektor wie in Task 2 (`dBjftJeZ…` → `E9Melhoa…`). `anmelde_url` kodiert `name` mit Leerzeichen und Umlaut.
  - `vertrag.rs`: Jede Fixture unter `R/src/app/m/einsatzbuch/_lib/anbindung/vertrag/` deserialisiert (relativer Pfad wie `tests/vektoren.rs`), und ein unbekanntes Feld wird abgelehnt.
  - `suite.rs` mit einem `FakeTransport`, der Anfragen aufzeichnet und Antworten nach Skript liefert:
    - `gib_frei` mit 450 Blöcken schickt 3 Pakete (200, 200, 50) mit Bearer.
    - Ein 422 bricht ab und liefert `Abgelehnt` mit `code` und `meldung` der Suite.
    - `hole_stammdaten` schickt `If-None-Match` mit. 304 → `Unveraendert`, 401 → `Widerrufen`, Netzfehler → `NichtErreichbar`.
    - **Anker-Nachmeldung nach Neustart:** Ein Buch in einem Tempordner, 3 Blöcke versiegelt (Hilfen aus `KR/tests/hilfe`), der Transport offline → `Offline`, `anker_gemeldet_bis` bleibt 0. Das Buch wird geschlossen und neu geöffnet, der Transport ist online → alle 3 gemeldet, `anker_gemeldet_bis = 3`.
    - 409 bei Block 2 → Abweichung gespeichert, Block 3 nicht gesendet.
    - 401 → `widerrufen = true`.
- [ ] **Step 2:** FAIL → **Step 3:** implementieren. HTTP-Parsing minimal: nur die Anfragezeile lesen, `Connection: close`, Antwort mit `Content-Length`. Kein Crate.
- [ ] **Step 4:** `cargo test -p einsatzbuch-kern` grün, der Lockfile-Grep auf ring und aws-lc ist leer.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Loopback-Anmeldung mit PKCE und Suite-Protokoll im Kern`.

### Task 8: Tauri-Hülle — Transport, Schlüsselbund, Befehle, Abgleich-Thread

**Files:** Create `T/src/netz.rs`, `T/src/schluesselbund.rs`, `T/src/abgleich.rs`. Modify `T/src/zustand.rs`, `T/src/befehle.rs`, `T/src/lib.rs`, `T/Cargo.toml`, `T/capabilities/default.json` (nur falls ein Plugin-Recht fehlt).

**Abhängigkeiten:**
- `ureq = { version = "3", default-features = false, features = ["native-tls", "json"] }`. Stimmen die Feature-Namen der aktuellen Version nicht, gilt der Name aus deren `Cargo.toml`, ohne rustls.
- `keyring` nur unter `cfg(target_os = "macos")` mit `apple-native` bzw. `cfg(windows)` mit `windows-native`. Unter anderen Plattformen gibt es den `Speichertresor` mit `eprintln!`-Warnung.
- Danach der Lockfile-Grep auf `ring`/`aws-lc`.

**Interfaces (Produces, `befehle.rs`, alle ohne Tauri testbar):**

```rust
pub struct Sitzung { pub token: zeroize::Zeroizing<String>, pub name: String, pub ablauf_ms: i64, pub rechner_id: Option<String> }
// Zustand bekommt: sitzung: Mutex<Option<Sitzung>>, anmeldung: Mutex<Option<Arc<AtomicBool>>>, transport: Box<dyn Transport>, tresor: Box<dyn Tresor>, abgleich: Mutex<Option<std::sync::mpsc::Sender<()>>>, suite_vorgabe: String
pub struct Anmeldestart { pub url: String }   // für Opener bzw. stdout
/// Einrichtung: öffnet Listener, meldet die URL über `oeffne(url)`, wartet, tauscht, richtet ein, legt DB und Tresor an.
pub fn richte_ein_ueber_suite(z: &Zustand, art: Umgebung, name: &str, suite_url: &str, oeffne: &dyn Fn(&str) -> Result<(), String>) -> Result<Einrichtungsergebnis, String>;
pub struct Einrichtungsergebnis { pub echt: bool }    // Hülle schaltet danach Autostart, wenn echt && !debug
pub fn melde_an(z: &Zustand, oeffne: &dyn Fn(&str) -> Result<(), String>) -> Result<SitzungInfo, String>;  // Verwaltungsanmeldung
pub fn richte_neu_ein(z: &Zustand, oeffne: &dyn Fn(&str) -> Result<(), String>) -> Result<(), String>;   // nur echt, nach Widerruf
pub fn brich_anmeldung_ab(z: &Zustand);
pub fn melde_ab(z: &Zustand);                                    // Sitzung verwerfen (Sperren)
pub fn lies_bloecke(z: &Zustand) -> Result<Vec<Block>, String>;
pub fn gib_schluessel_frei(z: &Zustand) -> Result<Vec<Schluesselposten>, String>;   // alle Blöcke, 200er-Pakete; ohne Sitzung/abgelaufen → "Die Sitzung ist abgelaufen. Bitte neu anmelden."; Netz → "Lesen braucht Verbindung zur Suite."
pub fn gleiche_anker_jetzt(z: &Zustand) -> Result<Ankerstand, String>;              // für „Kette prüfen“
pub fn hole_stammdaten_jetzt(z: &Zustand) -> Result<(), String>;
pub fn beende_testbetrieb(z: &Zustand) -> Result<(), String>;  // + bei Sitzung: DELETE rechner/<id> (Fehler dabei melden, aber lokal trotzdem löschen), Tresor-Eintrag löschen
```

`Status` bekommt weitere Felder, die `typen.ts` in Task 9 spiegelt:
- `suiteUrl: Option<String>`, `suiteVorgabe: String`
- `rechnerName: Option<String>`, `eingerichtetAm: Option<String>`, `eingerichtetVon: Option<String>`
- `schluesselId: Option<String>`
- `stammdatenVom: Option<String>`
- `ankerBestaetigtBis: u64`, `ankerAbweichung: Option<Ankerabweichung>`
- `widerrufen: bool`
- `sitzung: Option<SitzungInfo { name, ablaufMs }>`
- `anmeldungLaeuft: bool`
- `beideDateien` braucht kein eigenes Feld, es kommt als `startfehler`.

Tauri-Befehle, dünn:
- `einrichten(art, name, suiteUrl)`: `oeffne` = `oeffne_anmelde_url(app, url)` mit stdout-Schalter. Nach Erfolg holt die App den Fokus; `echt && !cfg!(debug_assertions)` schaltet den Autostart ein.
- `anmelden`: danach ebenfalls Fokus.
- `neu_einrichten`, `anmeldung_abbrechen`, `abmelden`, `bloecke`, `schluessel_freigeben`, `anker_abgleichen`, `stammdaten_abgleichen`, `testbetrieb_beenden` (geändert).
- `entwicklung_einrichten` bleibt nur im Debug-Build.
- `#[allow(dead_code)]` an `oeffne_anmelde_url` entfällt.

Abgleich-Thread (`abgleich.rs`): Er startet in `setup` nach `manage` und läuft sofort einmal: Stammdaten, dann Anker. Danach wartet er per `recv_timeout(1 h)` auf ein Signal. Ein Signal sendet jede Versiegelung (`versiegele_jetzt`, Frist-Uhr, Frist-Prüfung) über `abgleich`, dann folgt nur der Ankerabgleich. Nach Ablauf der Stunde folgen Stammdaten und Anker. Fehler landen im Log, nie als Panik. Er hält den Buch-Lock nie während einer Anfrage.

- [ ] **Step 1: Failing tests** in `befehle.rs` (Modul `tests`, mit `FakeTransport` und `Speichertresor`). Der Fake-Browser ist ein Thread, der die URL aus `oeffne` liest, `port` und `state` parst und selbst einen GET auf `127.0.0.1:<port>/rueckruf?code=c&state=…` schickt.
  - Einrichten als Testrechner:
    - `einsatzbuch-test.db` existiert, die Einrichtung ist `Test`, und `rechner_id` stammt aus der Antwort.
    - Der Tresor hält das Geräte-Token unter `geraetetoken-test`.
    - Die Tausch-Anfrage enthielt `verifier`, und `sha256(verifier)` passt zur `challenge` aus der URL.
  - Scheitert `einrichten` in der Suite (422), gibt es keine DB-Datei und keinen Tresor-Eintrag (Review Focus 3). Dasselbe gilt, wenn der Tresor beim Schreiben scheitert.
  - `echt` bei vorhandener `einsatzbuch-test.db` wird abgelehnt: „Testbetrieb erst beenden.“ Umgekehrt ist Test bei echter Einrichtung verboten, wie bei `hat_echte_einrichtung`.
  - Die Suite-URL für `echt` ist fest die Vorgabe; eine abweichende URL wird abgelehnt. Für `test` ist sie frei wählbar.
  - `melde_an` bindet das Geräte-Token im Tausch (Bearer).
  - `gib_schluessel_frei` ohne Sitzung wird abgelehnt. Mit abgelaufener Sitzung (Stelluhr) wird ebenfalls abgelehnt, und die Sitzung ist danach `None`.
  - `melde_ab` → `sitzung` ist `None`.
  - Ein offline-Transport bei `gib_schluessel_frei` → „Lesen braucht Verbindung zur Suite.“
  - `beende_testbetrieb` mit Sitzung sendet `DELETE …/rechner/<id>` mit Sitzungstoken und löscht den Tresor-Eintrag. Ohne Sitzung gibt es kein DELETE.
  - `neu_einrichten` mit anderer `schluesselId` → Fehlertext mit beiden IDs.
  - Stammdaten-Abgleich: 200 übernimmt das Paket und `stammdatenVom`, 304 aktualisiert nur `stammdatenVom`, 401 setzt `widerrufen`, und der Status zeigt es.
  - Versiegeln geht bei `widerrufen = true` weiter (Spec §8).
- [ ] **Step 2:** FAIL → **Step 3:** implementieren (`netz.rs`: `ureq`-Agent mit 15 s Timeout, `Transport` implementieren; `schluesselbund.rs`: `keyring::Entry::new("dev.rubeen.iuksuite.einsatzbuch", konto)`).
- [ ] **Step 4:**
  - `pnpm --filter einsatzbuch build`, danach `cargo test --workspace` grün.
  - `cargo build` der Hülle grün.
  - Die Hülle kompiliert im Release-Profil (`cargo check --release`), damit die `cfg`-Zweige stimmen.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Anmeldung, Einrichtung und Abgleich in der Desktop-Hülle`.

### Task 9: Oberfläche — Einrichtungsfrage, Anmeldung, Kopf, Fehlerbilder

**Files:**
- Create: `A/src/seiten/Einrichtungsfrage.tsx`, `A/src/seiten/Anmelden.tsx`, `A/src/logik/verbindung.ts` (+Test: Texte der Fehlerbilder, „Stammdaten vom …“)
- Modify: `A/src/typen.ts`, `A/src/befehle.ts`, `A/src/App.tsx`, `A/src/logik/ablauf.ts` (+Test), `A/src/bausteine/Kopf.tsx`, `A/src/App.test.tsx`, `A/src/stil/app.css`
- Delete: `A/src/seiten/NichtEingerichtet.tsx`. Der Entwicklerweg zieht als Debug-Karte in die Einrichtungsfrage.

**Interfaces:** `befehle.ts` bekommt:
- `einrichten({art, name, suiteUrl})`, `anmelden()`, `neuEinrichten()`, `anmeldungAbbrechen()`, `abmelden()`
- `bloecke(): Promise<Block[]>` (Typ `Block` aus `@kern/format`)
- `schluesselFreigeben(): Promise<{block:number; cek:string}[]>`
- `ankerAbgleichen(): Promise<Ankerstand>`, `stammdatenAbgleichen()`

`Lokal.phase` bekommt `"anmelden"` (Anmeldebildschirm bzw. Warten) und `"verwaltung"`; `"nicht-eingerichtet"` heißt jetzt `"einrichtung"`.

Texte (Vorlage wörtlich, wo gleich):
- Kopf: Knopf „Verwaltung · Anmelden“ (Vorlage Zeile 45), nur wenn eingerichtet und ohne Sitzung. Mit Sitzung zeigt der Kopf den Namen und „Sitzung sperren“.
- Einrichtungsfrage:
  - Überschrift „Diesen Rechner einrichten“.
  - Auswahl als Radio-Karten: „Echter Einsatzbuch-Rechner“ (Hilfe: „Genau ein Rechner führt die echte Einsatzkette. Eine neue Einrichtung ersetzt den bisherigen.“) und „Testrechner“ (Hilfe: „Zum Ausprobieren. Eigene Testdatenbank, eigener Schlüssel, nichts hiervon ist ein echter Einsatz.“).
  - Feld „Name des Rechners“ (1–60), Feld „Suite-Adresse“ (vorbelegt mit `status.suiteVorgabe`, nur bei Testrechner änderbar), Knopf „Mit Pocket ID anmelden und einrichten“.
  - Danach folgt der Wartebildschirm.
- Anmelden (Vorlage „Anmeldung“): Karte „Anmelden, um Einsätze zu lesen“ mit Text und den Knöpfen „Mit Pocket ID anmelden“ und „Zurück zur Erfassung“. Während des Wartens: „Anmeldung läuft — der Browser ist geöffnet. Melde dich dort an; danach geht es hier weiter.“ und Knopf „Abbrechen“.
- Fehlerbilder (§8), als `Hinweis` bzw. roter Hinweis:
  - Suite nicht erreichbar bei der Freigabe: „Lesen braucht Verbindung zur Suite.“
  - Anmeldung abgebrochen bzw. nicht abgeschlossen: Text aus Rust.
  - Kein Zugang: „Kein Zugang zum Einsatzbuch — dir fehlt die Gruppe in der Suite.“
  - Widerrufen, auf Start- und Verwaltungsseite: „Rechner muss neu eingerichtet werden.“, bei echt mit Knopf „Neu einrichten“, bei test mit „Testbetrieb beenden und neu einrichten“.
  - `schluesselId` passt nicht: rot, mit beiden IDs aus der Meldung der Suite bzw. von Rust.
  - Anker-Abweichung: rot, „Anker weicht ab bei Block n: erwartet #…, hier #…“.

- [ ] **Step 1: Failing tests** (Vitest, DOM, Tauri-`invoke` gemockt wie in `App.test.tsx`):
  - Ohne Einrichtung erscheint die Einrichtungsfrage; die Suite-Adresse ist bei „Echter Einsatzbuch-Rechner“ schreibgeschützt und bei „Testrechner“ änderbar.
  - Der Knopf sendet `einrichten` mit Art, Name und URL.
  - Der Kopf zeigt „Verwaltung · Anmelden“ nur eingerichtet.
  - Ein Klick zeigt die Anmeldekarte; „Mit Pocket ID anmelden“ ruft `anmelden` und zeigt den Wartetext; „Abbrechen“ ruft `anmeldung_abbrechen`.
  - `widerrufen: true` zeigt „Rechner muss neu eingerichtet werden.“
  - `stammdatenVom` wird als „Stammdaten vom 25.9.2026, 10:00“ in der Zone des Status formatiert (`logik/verbindung.ts`, `zeitzone` als Parameter).
- [ ] **Step 2:** FAIL → **Step 3:** implementieren → **Step 4:** `pnpm --filter einsatzbuch typecheck && pnpm --filter einsatzbuch lint && pnpm --filter einsatzbuch test` grün.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Einrichtungsfrage und Anmeldung am Rechner`.

### Task 10: Oberfläche — Verwaltung am Rechner

**Files:**
- Create: `A/src/seiten/Verwaltung.tsx`, `A/src/verwaltung/modell.ts` (+Test), `A/src/verwaltung/useVerwaltung.ts` (+Test), `A/src/verwaltung/useSperre.ts` (+Test)
- Modify: `A/src/App.tsx`, `A/src/stil/app.css`, `A/vite.config.ts` und `A/tsconfig.json` nur falls ein Kern-Import fehlt

**Interfaces:**

```ts
// verwaltung/modell.ts
export interface Offen { block: Block; einsatz: Einsatz }                       // Kern-Typen
export function kennzahlen(offen: Offen[]): { zahl: string; label: string }[];   // wie `kpis` der Vorlage, Zeilen um 750–800 in „Einsatzbuch v2.dc.html“
export function stichwortVerteilung(offen: Offen[]): { name: string; anz: number; breite: string }[];
// verwaltung/useVerwaltung.ts
export type Verwaltungszustand =
  | { art: "laedt" }
  | { art: "offen"; offen: Offen[]; zu: Block[]; fehler: string | null; pruefung: Kettenzustand | null; anker: Ankerangabe | null }
  | { art: "fehler"; meldung: string; zu: Block[] };
export function useVerwaltung(aktiv: boolean): { zustand: Verwaltungszustand; kettePruefen: () => Promise<void>; verwerfen: () => void };
// verwaltung/useSperre.ts
export const SPERRE_NACH_MS = 10 * 60_000;
export function useSperre(o: { aktiv: boolean; ablaufMs: number | null; jetztVersatz: number; sperre: () => void }): void; // Eingaben: keydown, pointerdown, pointermove, wheel
```

`useVerwaltung` läuft so:
1. `befehle.bloecke()`, dann `pruefeKette` lokal (`K/kette.ts`).
2. `befehle.schluesselFreigeben()`, dann `oeffneBlock(block, ausBase64(cek))` je Block, im Speicher (`K/block.ts`, `K/bytes.ts`).
3. Ein Block, der sich nicht öffnen lässt, landet in `zu` mit der Meldung „Block n lässt sich nicht öffnen“.
4. Schlägt die Freigabe fehl, gilt `fehler` mit dem Text aus Rust, und alle Blöcke stehen als `zu` (Chiffre-Zeile wie in der Vorlage).

`verwerfen()` setzt den Zustand auf `laedt` und löscht alle Referenzen. `kettePruefen` = `pruefeKette` + `befehle.ankerAbgleichen()` → `Kettenpruefung` mit `anker`.

Ansicht (Vorlage „Verwaltung“, Zeilen um 308–480):
- Kopfzeile „Verwaltung / Versiegelte Einsätze“ mit den Knöpfen „Kette prüfen“ und „Sitzung sperren“. „Herunterladen“ fehlt bis Stufe 6.
- Karte mit „Verschlüsselt“ (Text: Sitzung von {Name}, endet {Uhrzeit}), „Nur auf diesem Rechner“ und „Lückenlose Kette“ mit Chip aus `Kettenpruefung`.
- Kennzahl-Kacheln, `Kettenliste` (neueste oben, Block-0-Zeile mit `eingerichtetAm`/`eingerichtetVon` aus dem Status), `Einsatzdetail` des gewählten Blocks, Alarmstichwort-Verteilung.
- „Stammdaten vom …“, „Anker bestätigt bis Block n“, gegebenenfalls die rote Abweichung.
- Die geteilten Ansichten stehen in `K/ansichten/`. `Berichtsblatt` wird in dieser Stufe nicht gezeigt (PDF ist Stufe 6); wer es doch einbindet, übergibt `unveraendert`.
- Sperren (Knopf, 10 min ohne Eingabe, Tokenablauf): `verwerfen()` → `befehle.abmelden()` → Phase `start` mit dem Hinweis „Sitzung gesperrt. Die Einsätze liegen nur noch verschlüsselt vor.“ Die gesperrte Karte der Vorlage zeigt „Entsperren“, das zur Anmeldung führt.

- [ ] **Step 1: Failing tests:**
  - `modell.test.ts`: Kennzahlen und Verteilung über die drei Einsätze der Testvektoren (`K/testvektoren/eingaben.json`).
  - `useVerwaltung.test.ts` (renderHook, `befehle` gemockt), Blöcke und CEKs aus den Testvektoren (`erwartet.json`/`eingaben.json`):
    - Alle drei sind offen.
    - Eine falsche CEK für Block 2 ergibt „Block 2 lässt sich nicht öffnen“, die anderen bleiben offen.
    - Scheitert die Freigabe mit „Lesen braucht Verbindung zur Suite.“, sind alle `zu` und `fehler` ist gesetzt.
    - `verwerfen()` → `laedt`, und nichts vom Klartext ist mehr erreichbar (Zustand geprüft).
  - `useSperre.test.ts` (Fake-Timer):
    - Nach 10 min ohne Eingabe wird `sperre` gerufen.
    - Eine Eingabe nach 9 min verschiebt die Sperre.
    - `ablaufMs` in der Vergangenheit sperrt sofort.
  - `App.test.tsx`: Nach `anmelden` erscheint die Verwaltung. „Sitzung sperren“ ruft `abmelden`, und der Stichworttext des Einsatzes ist aus dem DOM verschwunden.
- [ ] **Step 2:** FAIL → **Step 3:** implementieren → **Step 4:** App-Tore grün.
- [ ] **Step 5:** Commit `feat(einsatzbuch): Verwaltung am Rechner mit Schlüsselfreigabe und Sperre`.

### Task 11: Playwright der App mit gestubbtem `invoke`

**Files:** Modify `A/e2e/stub.ts`. Create `A/e2e/verwaltung.spec.ts`. Modify `A/e2e/erfassung.spec.ts` nur, wenn die Einrichtungsfrage den bisherigen Ablauf ändert.

Der Stub bekommt die neuen Befehle:
- `einrichten`, `anmelden` (lösen nach 100 ms auf und setzen `sitzung`), `anmeldung_abbrechen`, `abmelden`.
- `bloecke` liefert die Blöcke aus `K/testvektoren/erwartet.json`, `schluessel_freigeben` deren CEKs aus `eingaben.json`. Beide kommen über `einstellungen` in den Init-Script, gelesen per `readFileSync` in der Spec-Datei.
- `anker_abgleichen`, `stammdaten_abgleichen`.
- Optionen `freigabeFehler?: string` und `sitzungAblaufMs?: number`.

- [ ] **Step 1: Specs:**
  - „Verwaltung nach der Anmeldung“: „Verwaltung · Anmelden“ → „Mit Pocket ID anmelden“. Danach sind die Kettenliste mit 3 Blöcken und das Detail des neuesten Einsatzes (Stichwort aus den Vektoren) sichtbar; „Kette prüfen“ zeigt „Kette intakt“ und „Anker bestätigt bis Block 3“.
  - „Sitzung sperren verwirft den Klartext“: Klick auf „Sitzung sperren“, danach ist das Stichwort nicht mehr im DOM und `abmelden` wurde gerufen (Aufrufliste des Stubs).
  - „Automatische Sperre“: Die Spec setzt `page.clock.install()` vor dem Laden, nach der Anmeldung `page.clock.fastForward("10:01")`, danach ist der Klartext weg.
  - „Ohne Verbindung“: Mit `freigabeFehler: "Lesen braucht Verbindung zur Suite."` erscheint der Hinweis, und die Blöcke zeigen die Chiffre-Zeile.
  - „Einrichtungsfrage“: Ohne Betrieb erscheint die Frage; „Testrechner“ plus Name ruft `einrichten` mit `art: "test"`.
- [ ] **Step 2:** `pnpm --filter einsatzbuch e2e` grün, auch die bestehende `erfassung.spec.ts`.
- [ ] **Step 3:** Commit `test(einsatzbuch): Playwright für Einrichtung, Verwaltung und Sperre am Rechner`.

### Task 12: E2E-Treiber und Abnahme gegen die lokale Suite

**Files:** Create `T/examples/e2e_lauf.rs` (nur Debug; `#![cfg(debug_assertions)]` bzw. `compile_error!` im Release), `R/scripts/einsatzbuch-e2e-anmeldung.ts` (Playwright-Skript für den Browserteil), `R/scripts/einsatzbuch-e2e-oeffnen.ts` (entschlüsselt mit dem TS-Kern). Keine Änderung an Suite-Code.

Der Treiber läuft in Schritten, jeder mit einer Logzeile `E2E <schritt>: …`:
1. Zustand mit dem echten Ordner `$TMPDIR/einsatzbuch-e2e/`, `NetzTransport`, echtem Schlüsselbund und `SystemUhr` anlegen, `EINSATZBUCH_ANMELDUNG_STDOUT=1` setzen.
2. `richte_ein_ueber_suite(z, Test, "E2E-Lauf", suite, oeffne)`. `oeffne` gibt die URL auf stdout aus (Präfix `EINSATZBUCH_ANMELDE_URL=`) und startet `pnpm exec tsx scripts/einsatzbuch-e2e-anmeldung.ts <url>`.
   - Das Skript startet Chromium (Playwright-API), macht `devLogin` gegen den Einsatzbuch-Host mit Gruppe `einsatzbuch-verwaltung` und öffnet die URL. Den Rückruf empfängt der **echte** Listener.
3. Ein Einsatz: `sende_ab` mit Stammdaten aus dem Paket, dann Warten auf die Frist-Uhr. Die Frist in der Suite steht auf 1 min (vorher per DB oder Seite „Einstellungen“). Hilfsweise nach 61 s `pruefe_frist_jetzt`.
4. `gleiche_anker_jetzt` → „Anker bestätigt bis Block 1“.
5. `melde_an` (Browserteil wie 2), dann `gib_schluessel_frei`. Blöcke und CEKs gehen **nur im Debug-Treiber** als JSON auf stdout, dann folgt `scripts/einsatzbuch-e2e-oeffnen.ts`. Es liest das JSON, ruft `oeffneBlock` aus dem Kern und gibt `nummer` und `stichwort` aus (Nummer `T-2026-001`).
6. Pause: Der Controller löscht den Test-Rechner in der Suite über die Seite „Rechner“ (Playwright-Skript oder `request` mit devLogin). Danach meldet `gib_schluessel_frei` einen Fehler: 401, weil die an den gelöschten Rechner gebundene Sitzung per Cascade weg ist.
7. `beende_testbetrieb`.

- [ ] **Step 1:** Treiber und Skripte schreiben. `cargo build --example e2e_lauf` grün, Release bricht mit `compile_error!` ab.
- [ ] **Step 2: Lauf** (der Controller begleitet):
  - Eigenen Port wählen (`E2E_PORT` der Arbeitskopie aus `e2e/helpers/ports.ts` bzw. einen freien, nie einen fremden).
  - Eigenes `DATA_DIR=./.data/e2e-anbindung`, `AUTH_DEV_LOGIN=true`, `AUTH_SECRET=test-secret`, `AUTH_COOKIE_DOMAIN=.localtest.me`, `EINSATZBUCH_SCHLUESSEL_KEK=<Entwicklungs-KEK>`.
  - `pnpm seed:lokal einsatzbuch` mit demselben `DATA_DIR`, dann `pnpm dev` im Hintergrund.
  - Vorher `sqlite3 .data/e2e-anbindung/einsatzbuch.db "select id, art, widerrufen_am from rechner"`. Die echten Zeilen gehören ins Protokoll; der Lauf darf sie nicht ändern.
- [ ] **Step 3: Belege** in `scratchpad/stufe5-abnahme.md`, nicht im Repo:
  - Logauszüge der Schritte 1–7.
  - DB-Abfragen: `select rechner_id, block, hash from anker` nach Schritt 4 (Zeile vorhanden) und nach Schritt 6 (leer); `select count(*) from schluesselpaar where art='test'` vorher und nachher; die echten Rechnerzeilen unverändert.
  - Ausgabe von `einsatzbuch-e2e-oeffnen.ts`.
- [ ] **Step 4:** Commit `test(einsatzbuch): Ende-zu-Ende-Treiber für die Anbindung (nur Debug)`.

### Task 13: Schluss — Gesamtreview, Tore, PR

- [ ] Review über den gesamten Diff `origin/main..HEAD`. Fix-Runden bis sauber.
- [ ] Alle Tore mit Exit-Code:
  - Suite: `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build`, die Einsatzbuch-Specs (`einsatzbuch*.spec.ts`).
  - App: `pnpm --filter einsatzbuch typecheck|lint|test|e2e`, `cargo test --workspace`, Lockfile-Grep.
- [ ] `.github/workflows/einsatzbuch.yml`: Pfadfilter decken die neuen Dateien ab (`M/_lib/anbindung/vertrag/**` betrifft Rust-Tests).
- [ ] Push, PR gegen `main` mit deutscher Beschreibung (Entscheidungen, Abweichungen, Abnahme) und `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Danach `gh pr view --json autoMergeRequest` prüfen: `null`.
