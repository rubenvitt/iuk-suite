# Design: Modul `feedback` (Phase 3 der Konsolidierung)

> Portierung der Alt-App `da-feedback/` (Go/`net/http`, server-rendered, SQLite) in ein neues
> Suite-Modul `src/app/m/feedback/`. Zielstack: Next.js 16 · Drizzle · SQLite · Auth.js/Pocket ID ·
> Ant Design 6 · Recharts. Anspruch: **bereinigter Port** — Außenverhalten und Daten 1:1 erhalten,
> wo sie nach außen wirken (QR-Token, URLs, Auswertungsergebnisse), aber Altlasten weglassen und
> die groupleader-Zugriffslücke schließen.
>
> Stand-der-Wahrheit: [../../../../KONSOLIDIERUNG-PROGRESS.md](../../../../KONSOLIDIERUNG-PROGRESS.md).
> Referenz Suite-Modul-Muster: `docs/qr-portierung-analyse.md`, Modul `qr` als Vorbild.

## Domäne (Kurzfassung)

Anonymes Feedback zu **Dienstabenden** von DRK-Gruppen per QR-Code. Kette:
**Gruppe → Dienstabend → genau eine Umfrage → anonyme Antworten**. Verwaltung durch
`admin` (alle Gruppen) und `groupleader` (nur eigene Gruppen). Auswertungen: Ø je Frage,
Gruppen-Trend über Zeit, Gruppen-Vergleich, CSV-Export, KI-Prompt-Generator.

## Getroffene Entscheidungen (2026-07-24)

| # | Entscheidung | Wahl |
|---|---|---|
| 1 | Anspruch | **Bereinigter Port** (Außenverhalten/Daten 1:1, Altlasten weg, IDOR schließen) |
| 2 | Rollenmodell | **Zwei Ebenen, sauber gescoped** (admin + groupleader, durchgängige Ownership-Guard) |
| 3 | Auto-Close (Zeit) | **Lazy bei Zugriff** — zustandslos, reine Funktion, kein Scheduler |
| 4 | Charts | **Recharts**, dünne Wrapper geteilt in `src/core/` |
| 5 | Zusatzfeatures | CSV-Export ✓ · KI-Prompt-Generator ✓ · globaler „alle-"-QR ✗ (fällt weg) |

## Architektur — Modul-Anatomie

Folgt exakt dem Suite-Muster (`src/app/m/feedback/`). Konvention: `_`-Ordner sind Private Folders (keine Routen).

```
src/app/m/feedback/
  _db/
    schema.ts            Drizzle-Tabellen (§ Datenmodell)
    client.ts            export const getDb = () => getModuleDb("feedback", schema)
    drizzle.config.ts    repo-root-relative Pfade, dbCredentials.url "./.data/feedback.db"
    migrations/          generiert (drizzle-kit) + meta/_journal.json
    migrations.test.ts   echter Migrationslauf gegen SQLite, prüft Spalten/CHECK/Index/Typen
  _lib/
    questions.ts         StandardQuestions-Katalog + Typen (schulnote|text|stars-read)
    token.ts             slug-secret Parsing/Bau (positionsbasiert) — reine Funktion
    lifecycle.ts         Status-Übergänge + isExpired()/closeIfExpired() — reine Funktion
    aggregation.ts       Ø je Frage, Gesamt-Ø, Trend, Vergleich (reine Funktionen)
    csv.ts               CSV-Export (Doppel-JSON-Kodierung geradegezogen)
    prompt.ts            KI-Prompt-Text-Generator
    ratelimit.ts         In-Memory-Rate-Limiter (öffentliche Routen)
    seed.ts              seedFeedback()
    <je *.test.ts daneben>
  (Verwaltung, full-Shell)
    layout.tsx           <Shell variant="full" moduleKey="feedback">
    page.tsx             Dashboard (gescopte Gruppenliste)
    ...Verwaltungsrouten (Gruppen, Dienstabende, Umfragen, Auswertungen)
    actions.ts           guarded Server Actions (jede mit assertGroupAccess)
  f/                     (öffentliche Teilnahme, chrome-los)
    layout.tsx           minimales Layout OHNE Shell/App-Switcher
    [slugSecret]/page.tsx        Umfrage anzeigen (lazy-close + Cookie-Check)
    [slugSecret]/thanks/page.tsx Danke-Seite
    (Submit über Server Action mit Rate-Limit + closes_at-Prüfung)
```

**Kein PWA/Offline.** Anonyme Teilnahme braucht ohnehin Netz zum Absenden — Offline-Formulare
ergeben keinen Sinn (YAGNI). Damit keine `sw.js`/`manifest`-Route-Handler, kein `sw-source.ts`.

## Datenmodell (Drizzle/SQLite)

IDs 1:1 aus der Alt-DB. INTEGER-AUTOINCREMENT-PKs bleiben Integer; keine TEXT-PKs (users/sessions entfallen).

**Übernommene Tabellen:** `groups`, `evenings`, `surveys`, `responses`, `user_groups`.
**Weggelassen:** `config` (im Go-Code nie gelesen, 48h-Default ist hartkodiert), `users` + `sessions`
(→ Suite-SSO), `sessions.data` (nie beschrieben).

- `groups`: `id` PK · `name` · `slug` (UNIQUE) · `secret` (5× `[a-z0-9]`) · `close_after_hours` (nullable) · `created_at`
- `evenings`: `id` PK · `group_id` FK→groups ON DELETE CASCADE · `date` · `topic?` · `notes?` · `participant_count?` · `created_at` · Index `(group_id, date)`
- `surveys`: `id` PK · `evening_id` FK→evenings **UNIQUE** (1:1) · `status` **CHECK ∈ {draft,active,closed,archived}** · `questions` (JSON-TEXT, Snapshot) · `close_after_hours?` · `activated_at?` · `closes_at?` · `closed_at?` · `created_at` · Index `(status)`
- `responses`: `id` PK · `survey_id` FK→surveys ON DELETE CASCADE · `answers` (JSON-TEXT `{questionId: value}`) · `submitted_at` · Index `(survey_id)`
- `user_groups`: `user_id` (TEXT = OIDC-`sub`) · `group_id` FK→groups · **Composite PK** `(user_id, group_id)`

**Zeitstempel:** Zieltyp durchgängig `integer(mode:"timestamp")` (wie `portal`). Der Paritäts-View
rundet beim Import auf Sekunden (Sub-Sekunden gehen im Timestamp-Mode verloren).

**JSON-Felder:** `surveys.questions` und `responses.answers` sind **einfach** JSON-kodiert (kein
Double-Encoding beim Speichern — verifiziert an der Live-DB). Ratings als JSON-Number, Text als
String; Antwort-Objekte mischen Typen pro Objekt.

## Rollen & Zugriff — eine wiederverwendbare Ownership-Guard

**Registry-Eintrag** (`src/core/registry.ts`, `MODULES`):
```
key: "feedback", requiresAuth: false,
requiredGroups: ["da-feedback-gl", "da-feedback-admin"],   // Verwaltungs-Zugang
adminGroups:   ["da-feedback-admin"],                       // Voll-Admin (alle Gruppen)
shell: "full", prodHosts: [...], showInSwitcher: true
```
Live-Werte über Env-Overrides (`SUITE_HOST_FEEDBACK`, `SUITE_ADMIN_GROUP_FEEDBACK`) und die Helfer
`prodHostsFor()` / `isModuleAdmin()` — nie direkt aus der Registry lesen.

**Zugriffslogik — genau EINE Guard,** `assertGroupAccess(user, groupId)` in `_lib`:
- `admin` (in `adminGroups`) → immer erlaubt.
- `groupleader` → nur wenn `(user.sub, groupId)` in `user_groups`.
- **Angewandt auf JEDE Route und JEDE Server Action**, die eine `groupId`/`eveningId`/`surveyId`
  entgegennimmt (evening/survey werden zuerst auf ihre `group_id` aufgelöst, dann geprüft).

Damit wird die alte IDOR-Lücke geschlossen: im Original war die Beschränkung nur im Dashboard-Listing
umgesetzt (`admin.go:53-63`), `RequireGroupAccess` war definiert (`middleware.go`), aber **nicht verdrahtet**
— Detail-/Survey-Routen waren für jeden groupleader offen. Ein-Punkt-Guard statt per-Route-Ad-hoc.

## Öffentliche Teilnahme & Layout

**Zwei Route-Groups, getrennte Layouts** (Registry-`shell` ist nur Default; das Layout entscheidet je Group):
- `/f/*` (Teilnahme): **chrome-los** — Vollbild-Formular, keine Suite-Shell, kein App-Switcher.
- Verwaltung: **`full`**-Shell (App-Switcher, Navigation).

**QR-Token 1:1 (kritisch — gedruckte QR-Codes im Umlauf):**
- Format `{baseURL}/f/{slug}-{secret}`, Secret genau **5 Zeichen** `[a-z0-9]`, crypto-random.
- **Parsing positionsbasiert**, nicht per `split("-")`: `secret = s.slice(-5)`, `slug = s.slice(0, -6)`
  (Trennzeichen an Position `len-6` verworfen), Mindestlänge 7. **Der Slug darf selbst Bindestriche
  enthalten** — deshalb kein Split. Als reine Funktion in `token.ts` mit Property-Tests (Slugs mit
  Bindestrichen, Grenzlängen).

**Mehrfach-Absende-Schutz:** Cookie `feedback-{surveyID}=submitted`, MaxAge 86400s — **1:1 erhalten**.
Bewusst **kein** serverseitiges Dedup (Anonymität; Cookie löschen/anderes Gerät erlaubt erneutes Absenden).

**Rate-Limiting** (`_lib/ratelimit.ts`): In-Memory-Limiter auf `GET /f/*` und die Submit-Action —
schützt den anonymen Write-Pfad gegen Spam/Ballot-Stuffing (im Original in `router.go:30-93`).
Als reine, testbare Einheit (Token-Bucket o. ä.), pro Prozess.

## Umfrage-Lebenszyklus — zwei getrennte Close-Mechanismen

Status: `draft → active → closed → archived` (`survey/model.go:12-17`).

**(a) Zeitbasiert, lazy** (Entscheidung 3): reine Funktion `closeIfExpired(survey, now)`. Aufgerufen
- beim Öffnen der `/f/`-Ansicht,
- **auf dem Submit-Pfad** (nicht nur GET — sonst kann ein vor Ablauf geöffnetes Formular danach noch absenden),
- beim Laden der Admin-Ansicht.
Bei überschrittenem `closes_at` wird sofort auf `closed` gesetzt. Kein Scheduler, kein Hintergrund-State.

**(b) Beim Aktivieren** (Invariante „max. 1 aktive Umfrage pro Gruppe", `store.go:99-108`): Aktiviert
man eine Umfrage, werden **alle anderen aktiven Umfragen derselben Gruppe geschlossen**. Lebt auf der
`activate`-Action, unabhängig von (a). Setzt `activated_at` + `closes_at` (aus `close_after_hours`
der Gruppe/Umfrage, Fallback 48 h).

## Fragen-Modell

- **Neue Umfragen:** fester Katalog aus dem Code — 14 StandardQuestions (8× `schulnote` q1–q8,
  6× `text` q9–q14; `questions.go:3-21`). Snapshot pro Umfrage bleibt als JSON in `surveys.questions`.
- **`single_choice` / `multi_choice` entfallen** — echter toter Code (keine UI, keine Aggregation,
  `aggregation.go:90-96` kennt sie nicht).
- **`stars` bleibt im Read-Pfad** (Schema-Typ, Rendering, Aggregation) — **importierte Alt-Umfragen
  nutzen `stars`** (Live-DB verifiziert), und die Aggregation behandelt `schulnote|stars|text`. Nur der
  *Erzeugungspfad* bietet `stars` nicht mehr an. **Nicht** mit single/multi_choice in einen Topf werfen —
  sonst brechen alte Auswertungen still.
- Auswertung darf **nicht** von einem festen Fragenkatalog ausgehen: Fragen kommen aus dem Snapshot der
  jeweiligen Umfrage; fehlt er, Fallback auf StandardQuestions (`aggregation.go:83-85`).

## Auswertungen & Charts

Features (alle mit `assertGroupAccess` gescoped, Vergleich nur admin):
- **Pro Dienstabend** (`GetDAStats`, `aggregation.go:67-168`): Ø je Bewertungsfrage, Gesamt-Ø,
  gesammelte Freitexte, Response-Count.
- **Gruppen-Trend** über Zeit (`GetGroupTrend`, Default letzte 12 Monate).
- **Gruppen-Vergleich** (`GetGroupComparisons`, nur admin).
- **CSV-Export** pro Gruppe — die heutige **Doppel-JSON-Kodierung im CSV-Feld** (`export.go:92-102`,
  `joinStrings` marshalt ein String-Array in ein CSV-Feld) wird **geradegezogen**, nicht byte-genau nachgebaut.
- **KI-Prompt-Generator** (`prompt.go`): baut aus Stats + Rohantworten einen fertigen deutschen
  Analyse-Prompt zum Kopieren; **gesperrt solange die Umfrage `active`** ist. Keine LLM-Anbindung im Modul.

**Charts:** Recharts als dünne Wrapper in `src/core/` (Bar für Ø/Vergleich, Line für Trend) — einmal
gebaut, auch für die radio-Auswertungen in Phase 6 nutzbar. `use client`, aber isoliert in den Wrappern.

⚠️ **Trend-Query neu bauen:** Das Original filtert Dienstabend-Daten per **lexikografischem
`YYYY-MM-DD`-Präfix-Vergleich** auf der rohen Go-Zeitstempel-Zeichenkette (`aggregation.go:178-179`).
Dieser Trick stirbt mit der Zeitstempel-Normalisierung auf `integer`. Die Datums-Range-Query wird
gegen `integer`-Timestamps neu gebaut, mit Test gegen off-by-one / leeren Trend (Monatsgrenzen, TZ).

## Import & Paritätscheck

`scripts/import/feedback.ts` auf Basis der generischen Harness `scripts/import/parity.ts`
(unverändert wiederverwenden). Muster wie `scripts/import/portal.ts`:
1. Quelltyp je Tabelle definieren, Alt-DB als Quelle lesen.
2. Mapping Alt→Drizzle (reine `toNew*`-Funktionen, ID 1:1).
3. Idempotenter Upsert per PK (`onConflictDoUpdate`).
4. `parityView` normalisiert beide Seiten identisch (Timestamps auf Sekunden).
5. `checkParity` (Multiset) → `assertParity` (Abbruch bei Mismatch, „no cutover").

**Import-Scope:** `groups`, `evenings`, `surveys`, `responses`, `user_groups` — IDs 1:1.
`users`/`sessions` **nicht** (SSO). Die eigenen DB-Sessions der Alt-App werden abgelöst; admin/gl
melden sich beim Cutover einmal neu an (wie bei qr).

**Zeitstempel-Normalisierung** — eigener, mutations-falsifizierter Test. Die Alt-DB enthält **zwei
gemischte Formate**:
1. Go-`time.Time`-Werte (`activated_at`, `closes_at`, `closed_at`, `evenings.date`, …):
   `2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293` — lokale TZ **plus Monotonic-Suffix `m=+…`**.
   Standard-Parser scheitern am `m=+…`.
2. SQLite-`CURRENT_TIMESTAMP`-Defaults (`created_at`, `responses.submitted_at`): `YYYY-MM-DD HH:MM:SS`, **UTC**.
Die Normalisierungsfunktion parst beide → Unix-Sekunden (Monotonic-Suffix abschneiden, TZ berücksichtigen,
UTC-Fall separat). Tests mit echten Beispielwerten beider Formate.

## Registrierungs-Kopplung (sonst Boot-Fehler)

`core/bootstrap.test.ts` erzwingt das Dreieck **laut**; Registry + Seed scheitern **still** — beide auf die Checkliste:
1. **Registry-Eintrag** in `src/core/registry.ts` `MODULES` (still, aber ohne ihn kein Routing).
2. **`_db/`-Ordner** unter `src/app/m/feedback/`.
3. **`MODULE_MIGRATIONS`-Eintrag** in `src/core/bootstrap.ts` (`{ key: "feedback", migrationsFolder: "src/app/m/feedback/_db/migrations" }`).
4. **Dockerfile-COPY-Zeile** für `src/app/m/feedback/_db/migrations`.
5. **bootstrap.ts:** Schema-Import + Seed-Import (`seedFeedback`) + Aufruf in `seedAllModules()` (still).

## Tests & Gates

- `_db/migrations.test.ts` — echter Migrationslauf, prüft Spalten/CHECK/Index/Typen/Timestamp-Mode (qr-Vorbild).
- `_lib/*.test.ts` — Token-Parsing (Property-Tests), Lifecycle (beide Close-Mechanismen), Aggregation
  (inkl. `stars`-Alt-Daten + Trend-Range/off-by-one), CSV, Prompt, Rate-Limit, Zeitstempel-Normalisierung.
- Komponenten-Tests (Vitest) für Formular/Admin-Ansichten.
- `e2e/feedback.spec.ts` (Playwright) — anonyme Teilnahme (`/f/{slug}-{secret}` → absenden → thanks,
  Dedup-Cookie) + Admin-Flow (Gruppe → Dienstabend → Umfrage → aktivieren → schließen → Auswertung).
- `scripts/import/feedback.test.ts` — Mapping + Paritäts-Round-Trip, mutations-falsifiziert.
- `core/bootstrap.test.ts` deckt die Registrierungs-Kopplung automatisch mit ab.

**Cutover** außerhalb aktiver Umfragen legen (sonst brechen laufende Teilnahmen).

## Bewusst weggelassen / Risiken

**Weggelassen:** `single_choice`/`multi_choice`, `config`-Tabelle, `sessions.data`, toter htmx-Zweig,
globaler „alle-"-QR (`/f/alle-<secret>` mit Gruppenauswahl), ECharts/CDN.

**Risiken:**
- ⚠️ **Globaler „alle-"-QR fällt weg.** Falls davon **gedruckte Exemplare** im Umlauf sind, brechen sie.
  Annahme: nicht im Einsatz. Vor Cutover verifizieren.
- Der `admin`-erfüllt-jede-Rollenprüfung-Sonderfall (`middleware.go:44-46`) wird durch die explizite
  `assertGroupAccess`-Guard ersetzt — Verhalten für admin bleibt gleich (immer erlaubt).
- Prod-Domain (`SUITE_HOST_FEEDBACK`) kommt beim Cutover aus der Server-`.env`, nicht aus dem Repo —
  blockiert den Bau nicht.
