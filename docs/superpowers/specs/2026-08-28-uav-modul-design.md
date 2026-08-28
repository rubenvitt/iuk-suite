# Modul `uav` — Drohnen-Trainingsbegleiter in der Suite (Design)

Datum: 2026-08-28 · Status: entworfen, vom Betreiber in vier Fragen + einer Nachricht abgenommen
(Domain, Sessions, Admin-Gruppe, Umfang) · Alt-Anwendung: `../uav-praxis` @ `cd973b0`

## 0. Ziel und Nicht-Ziel

**Ziel.** Die Alt-Anwendung `uav-praxis` (React/Vite-PWA + Hono + `node:sqlite`, 7,4k LOC) wird
als Suite-Modul `uav` nachgebaut, ihre Daten werden importiert, die Domain
**`uav-training.iuk-ue.de`** schwenkt auf die Suite. **Alle bereits verteilten Zugänge
funktionieren danach unverändert** — das ist die harte Anforderung, und sie besteht aus vier
Teilen (§3).

**Nicht-Ziel.** `uav-checklists` (mit dem `uav-signatures`-Backend) bleibt außerhalb der Suite
(Betreiberentscheidung 28.08.2026). Keine neuen Features; kein Feature fällt weg. Das
Admin-Modell der Suite (Suite-Admin vs. App-Admin, Entscheidung 03.08.) wird hier nicht
angefasst — `uav` folgt dem vorwärtskompatiblen `feedback`-Muster.

**Gewählter Ansatz.** Vollportierung (Ansatz A): Drizzle-Schema in `uav.db`, API als Route
Handler, Oberfläche in antd, Offline-PWA nach dem `qr`-Muster. Verworfen: die Vite-SPA als
statischer Build unter dem Modul (zweites UI-System im Container, kennt die Shell nicht) und
reine Container-Konsolidierung (löst kein Suite-Ziel).

## 1. Registry und Zuschnitt

```ts
{ key: "uav", title: "Drohnentraining", icon: "RocketOutlined", shell: "minimal",
  requiresAuth: false, requiredGroups: [], adminGroups: ["uav-training-admin"],
  prodHosts: [], showInSwitcher: true, switcherGroupSources: ["admin"] }
```

- `requiresAuth: false`, weil Teilnehmer keine SSO-Nutzer sind. Folge (wie bei `feedback`,
  `registry.ts:66-73`): die generische Middleware gated die Verwaltung **nicht** — das
  übernimmt ein Backstop-Guard `_lib/requireUavAdmin.ts` im `(admin)/`-Layout **und** in jedem
  Route Handler unter `api/admin/` (Handler haben kein Layout; Lehre aus `files/_lib/hostRolle.ts`).
- Admin-Gruppe **`uav-training-admin`** (Betreiber, 28.08.2026), überschreibbar per
  `SUITE_ADMIN_GROUP_UAV`. Das bisherige `ADMIN_ALLOWLIST` (leer = jeder Pocket-ID-Nutzer war
  Admin) entfällt ersatzlos.
- Shell: Teilnehmer sehen die **Minimal-Shell** (Token-Zugang, kein App-Switcher). Die
  Verwaltung unter `(admin)/` bekommt die Voll-Shell über das Group-Layout — das Muster ist bei
  `feedback` gebaut.
- Domain `uav-training.iuk-ue.de` über `SUITE_HOST_UAV` (Prod-`.env`, nicht im Repo).
- Illustrationen (`public/illustrations/<taskId>.webp`, 1:1 committet) wandern nach
  `public/m/uav/illustrations/`; das Feld `tasks.bild` bleibt ein relativer Pfad, der Import
  schreibt das Präfix um und der Paritätscheck vergleicht den **Dateinamen**, nicht den Pfad.

## 2. Daten

`uav.db` über `getModuleDb("uav")`. Drizzle-Schema 1:1 aus `server/db/schema.sql`:

| Alt-Tabelle | Neu | Bemerkung |
|---|---|---|
| `participants` | ✅ 1:1 | `login_code` UNIQUE, 8 Zeichen Crockford-Base32 |
| `tasks` | ✅ 1:1 | JSON-Spalten bleiben TEXT (`schritte`, `durchfuehrungshinweise`, `sicherheitshinweise`) |
| `executions` | ✅ 1:1 | `id` ist die **Client-UUID** (Idempotenz), `deleted_at` = Tombstone |
| `task_status` | ✅ 1:1 | PK `(participant_id, task_id)`, last-write-wins über `updated_at` |
| `sessions` | ✅ nur `kind='participant'` | Spalte `token` = SHA-256-Hex des Roh-Tokens (`sessions.ts:39`) |
| `admins` | ✗ entfällt | Admins kommen aus dem Suite-SSO (`token.groups`); Alt-Admin-Sessions verfallen bewusst |
| `oidc_states` | ✗ entfällt | Auth.js hält den PKCE-State selbst |

Der Aufgabenkatalog-Seed (`server/db/seed.ts`, Quelle `src/data/tasks.ts`, 17,9 KB) wird
**nicht** mitportiert: die Prod-DB hat den Katalog inklusive Admin-Änderungen; der Import ist
die Quelle. Ein Seed existiert nur für `scripts/seed-lokal.ts` (Dev/E2E).

**Import** `scripts/import/uav.ts`: SQLite→SQLite wie `qr.ts`, ID-erhaltend, idempotenter Upsert,
Sessions mit abgelaufenem `expires_at` werden übersprungen. **Paritätscheck** über
`scripts/import/parity.ts`: Zeilenzahlen aller fünf Tabellen, Stichprobe voller Zeilen,
`login_code`-Menge alt = neu (Mengengleichheit, nicht nur Anzahl). Das Muster der
qr-Import-Lehre gilt: der Idempotenztest muss zwischen zwei Läufen eine Zeile **ändern**,
sonst wäre er auch mit `onConflictDoNothing` grün.

## 3. Die vier verteilten Zugänge — und wie jeder überlebt

| # | Zugang | Wo er liegt | Übernahme |
|---|---|---|---|
| 1 | **Dauer-Code** | Kopf/Zettel | `ALPHABET` und `codeNormalisieren` (`server/auth/codes.ts`) werden **abgeschrieben**, nicht nachempfunden: trim → upper → `[\s-]` weg → I/L→1, O→0, U→V. Test mit Fixture-Paaren aus der Alt-Datei |
| 2 | **Magic-Link** `https://uav-training.iuk-ue.de/login?code=XXXX` | WhatsApp/Mail | ⚠️ `/login` ist Suite-PASSTHROUGH (`core/routing.ts:12`) → landet heute im SSO-Login. `decideRoute` bekommt eine **hostgebundene Brücke**: Host ∈ `prodHostsFor("uav")` **und** Pfad `/login` **und** `code`-Parameter vorhanden → `rewrite` auf `/m/uav/login`. Ohne `code` bleibt `/login` der SSO-Login (Admins). Das Muster ist die Alt-QR-Brücke von radio (PR #84) |
| 3 | **Session-Cookie** `sid` (180 Tage) | Browser | Cookie-Name `sid`, `path=/`, `httpOnly`, `SameSite=Lax`, host-only (kein `domain`), Roh-Token im Cookie, **SHA-256-Hex** in der DB — alles identisch, damit importierte Zeilen greifen. Vergleich zeitkonstant (`timingSafeEqual` über den Hash). Test: ein echtes Alt-Paar (Roh-Token, Hash) als Fixture |
| 4 | **Offline-Zustand + ungesyncte Queue** (`localStorage` `drk-drohnen-fortschritt`, `-katalog`, `-sync-queue`, `-last-sync`, `-uebernommen`, `localStore.ts:21-26`) und der Workbox-Worker | Browser, an den Origin gebunden | Keys **und** Datenformat der Queue werden übernommen (`localStore.ts` wird portiert, nicht neu geschrieben); die Sync-Engine liest beim ersten Start die vorhandene Queue und schiebt sie. Der alte `autoUpdate`-Workbox-Worker wird durch einen **Abräum-Worker unter `/sw.js`** ersetzt (radio-Muster `_lib/sw-quelle.ts`: löscht `caches.keys()`, unregistriert sich, lädt Clients neu) |

**Warum die Brücke (#2) in `decideRoute` und nicht im Login-Page-Code liegt:** die Suite-Login-
Seite ist modulneutral und soll es bleiben; die Ausnahme ist an Host **und** Parameter gebunden
und wird in `routing.test.ts` mit drei Fällen festgehalten (uav-Host mit code → rewrite;
uav-Host ohne code → passthrough; fremder Host mit code → passthrough).

**Alt-API-Pfade.** Die Alt-SPA spricht `/api/{tasks,me,progress,sync,auth/*,admin/*}`. Auf dem
uav-Host schreibt die generische Weiche `/api/*` ohnehin nach `/m/uav/api/*` um — **außer**
`/api/auth/*` und `/api/health` (PASSTHROUGH). Deshalb: Modul-API unter `/m/uav/api/` mit
**denselben Pfaden** für `tasks`, `me`, `progress`, `sync`, `admin/*`; der Teilnehmer-Login liegt
neu unter `api/anmeldung` (`POST`, Body `{code}`) und `api/abmeldung`. Folge: ein Gerät mit noch
gecachter Alt-Oberfläche kann **eingeloggt** weiter syncen, aber nicht neu einloggen — bis der
Abräum-Worker greift. Das ist der Zustand während des Standby, kein Dauerzustand.

## 4. API (Route Handler)

| Pfad (unter `/m/uav/api/`) | Wer | Verhalten |
|---|---|---|
| `POST anmeldung` | anon | Code normalisieren → Teilnehmer aktiv? → Session (180 d) + Cookie; Rate-Limit über `core/ratelimit` ⚠️ hinter Cloudflare zählt IP-Limit gegen einen Sammel-Eimer ([[client-ip-hinter-cloudflare]]) → Limit **pro Code**, nicht pro IP |
| `POST abmeldung` | Session | Session löschen, Cookie löschen |
| `GET me` | alle | `Identity` (`anon` / `participant` / `admin`) — Admin aus dem Suite-SSO |
| `GET tasks` | Teilnehmer **oder** Admin | aktiver Katalog |
| `GET progress` | Teilnehmer | `ProgressSnapshot` |
| `POST sync` | Teilnehmer | idempotenter Batch (`repo.sync`, `repo.ts:357-400`): Executions Upsert per Client-UUID, Tombstones, TaskStatus LWW; `participantId` **aus der Session, nie aus dem Body** |
| `admin/participants` CRUD, `…/export` CSV, `…/:id/export` | Admin | Spalten der CSV 1:1 (`admin.ts:53`); **Formula-Neutralisierung** wie bei feedback (Namen sind Freitext) |
| `admin/tasks` CRUD, `admin/tasks/reorder` | Admin | wie Alt |

Zod-Schemas aus `shared/types.ts` und `server/routes/sync.ts` übernehmen. Für die eigene
Oberfläche nutzt das Modul Server Actions; die HTTP-API existiert für die Sync-Engine (Client
offline-fähig) und für Alt-Clients im Standby.

## 5. Oberfläche

**Teilnehmer (Minimal-Shell, offline-fähig):** `/` Fortschritt nach Teil 1–3 · `/aufgabe?id=<taskId>`
Lernziel, Schritte, Hinweise, Illustration, Erfassung (Datum, Steuerer, Beobachter),
Zielanzahl/„nicht anwendbar" (der Alt-Pfad `/aufgabe/<id>` wird per 308 umgeleitet; der
Query-Pfad hält die Offline-Shell auf **eine** cachebare Seite — das qr-Muster) · `/login`
(Modul-Route; die Brücke aus §3 landet hier) mit Code-Eingabe und Auto-Einlösung bei `?code=`.
Das ist eine **öffentliche Ansicht** im Sinn von `docs/design/README.md`: eigene CSS-Module
(portiert aus `src/styles.css`), **kein antd**, Client-Insel wie die Alt-SPA. Tap-Höhen aus dem
Design-System (Handschuh).

**Offline:** eigener Allowlist-Worker nach dem `qr`-Muster (`qr/_lib/sw-source.ts`): precacht
`/`, `/aufgabe/*`-Shell, Illustrationen, Manifest; **nie** `/api/`, nie `/m/uav/admin`. Die
Sync-Engine (`syncEngine.ts`, portiert) läuft bei Start, `online`, nach Mutation (debounced) und
alle 60 s. **Reihenfolge der Worker:** Deploy 1 liefert den Abräum-Worker unter `/sw.js`;
erst nach dem Cutover-Standby wird `/sw.js` zum Allowlist-Worker (sonst räumt er sich selbst).
Beides über **eine** Route mit Umschalter `UAV_SW_MODUS=abraeumen|cachen` (Boot-Validierung
wie bei `RADIO_ALT_TOKEN_BIS`).

**Admin (Voll-Shell, `(admin)/`):** Teilnehmerliste (Quote, letzte Aktivität, Status, CSV) ·
Teilnehmer-Detail (Fortschritt je Aufgabe, Code anzeigen, **Magic-Link erzeugen** mit dem
Prod-Host aus `prodHostsFor("uav")` — nicht aus `AUTH_URL`, Lehre aus dem feedback-QR-Befund) ·
Katalog (CRUD, Reorder, aktiv/inaktiv). Nicht nachgebaut: die TanStack-Loader-Struktur — RSC
und Server Actions übernehmen das.

## 6. Cutover und Betrieb

Runbook `docs/runbooks/uav-cutover.md` nach dem Muster `qr-cutover.md` (kein ClamAV, kein
Blob-Umzug):

- **§A Betreiber vorab:** Gruppe `uav-training-admin` in Pocket ID anlegen und Mitglieder
  eintragen · Snapshot der Alt-DB per `sqlite3 ".backup"` (WAL — `cp` ist inkonsistent, `data/`
  zeigt `app.db-wal` mit 398 KB) · `SUITE_HOST_UAV`, `SUITE_ADMIN_GROUP_UAV`, `UAV_SW_MODUS` in
  die Prod-`.env`, Host in `SUITE_TRAEFIK_RULE`.
- **Deploy 1 (vor dem Cutover):** Modul auf `main` → automatischer Rollout. ⛔ Ab dann liegt
  `/sw.js` als Abräum-Worker bereit; sichtbar wird er erst mit dem Host-Schwenk.
- **§P Generalprobe:** Import gegen den Snapshot, Paritätscheck, ein Magic-Link aus dem Snapshot
  gegen die Probe-Instanz einlösen.
- **§C Cutover:** Freeze uav-praxis (Container stoppen = Freeze, Alt-DB ist dann konsistent) →
  Import → Paritätscheck → Router → **Verify:** `curl` auf Host, `/api/health/uav` mit
  `revision`, **ein echter Magic-Link von einem Teilnehmergerät**, ein Gerät mit alter
  Installation neu laden (Abräum-Worker greift).
- **Standby 14 Tage**, Rollback = Router zurück + `docker start`. Danach: Abbau, Repo
  archivieren, alten OIDC-Client in Pocket ID löschen, `UAV_SW_MODUS=cachen` setzen.
- Health `/api/health/uav` (Muster `[modul]/route.ts`), Backup: `backup.sh` nimmt `*.db` — keine
  Änderung nötig.

**Nebenbefund für den Abbau:** `uav-praxis/.env` enthält einen `FAL_KEY` im Klartext
(gitignored). Beim Archivieren des Repos: Datei löschen, Key in fal.ai rotieren.

## 7. Tests

- **Vitest:** `codeNormalisieren` gegen Fixture-Paare · Session-Hash gegen ein Alt-Paar ·
  `decideRoute`-Brücke (3 Fälle) · `repo.sync` per **Mutation** (Guard „participantId aus
  Session" entfernen → Test muss rot werden; Tombstone-Spalte ignorieren → rot) · Import
  Idempotenz mit Änderung zwischen den Läufen · Paritätscheck erkennt fehlende `login_code` ·
  SW-Allowlist enthält kein `/api/` · Admin-Handler ohne Gruppe → 403 · CSV-Neutralisierung.
- **Playwright:** Magic-Link-Einlösung auf dem uav-Host · Offline-Erfassung → online → Sync
  sichtbar in der Verwaltung · Admin-Gating (ohne Gruppe 403, mit Gruppe Liste) · `/login` ohne
  `code` auf dem uav-Host zeigt den SSO-Login.
- **Tore vor dem Merge:** typecheck 0 · lint 0 Fehler · alle Vitest · Playwright grün · build.

## 8. Offene Betreiberzeilen

| | Zeile | Fällig |
|---|---|---|
| ⬜ | Gruppe `uav-training-admin` in Pocket ID angelegt, Mitglieder drin | vor §P |
| ⬜ | Snapshot der Alt-DB (`.backup`) auf dem Server erzeugt | vor §P |
| ⬜ | Traefik-Regel / `SUITE_HOST_UAV` gesetzt | §C |
| ⬜ | Ein Teilnehmergerät für den Verify verfügbar (Magic-Link + alte Installation) | §C |
