# iuk-suite

Eine Web-Suite für die Informations- und Kommunikationsarbeit einer DRK-Bereitschaft.
**Ein Container, mehrere Domains, ein Login:** jedes Modul läuft unter einem eigenen Host
(z. B. `lagerbuch.iuk-ue.de`), alle Module teilen sich denselben Next.js-Prozess, dasselbe
Single Sign-on über Pocket ID und dieselbe Oberfläche. Die Suite hat nach und nach mehrere
eigenständige Alt-Anwendungen ersetzt; ihre Daten wurden per Import übernommen, die Domains
wurden umgeschwenkt.

## Module

| Modul (Key) | Was es tut | Zugang |
| --- | --- | --- |
| `portal` | Startseite der Suite: Kacheln der Apps, Neuigkeiten (`/neuigkeiten`), Profil, Verwaltung | Login |
| `qr` | QR-Codes erzeugen, auch offline als PWA im Einsatz | anonym, Verwaltung per Gruppe |
| `feedback` | Anonymes Feedback zu Dienstabenden per QR-Code, Auswertung für Gruppenleitungen | anonym (Teilnahme), Gruppe (Verwaltung) |
| `files` | Dateifreigaben mit Passwort/Ablauf/Limit und anonyme Upload-Inbox mit Virenscan (ClamAV) | anonym (Links), Gruppe (Verwaltung) |
| `lagerbuch` | Materialverwaltung der Bereitschaft: Artikel, Buchungen, Inventur, Helfer-Zugang per Code | Code (Helfer), Gruppe (Verwaltung) |
| `aufgaben` | Aufgabenverteilung und Zeitplanung für BuFDis mit Koordinationsrolle | Login + Gruppe |
| `radio` | Funkgeräte: Ausleihe per QR-Code, Bestand, Softwarestände | anonym (Ausleihe), Gruppe (Verwaltung) |
| `uav` | Drohnen-Trainingsbegleiter, Teilnehmer melden sich mit Dauer-Code an | Code, Gruppe (Verwaltung) |
| `zeichen` | Taktische Zeichen nachschlagen, bauen und üben (auf `@einsatzzeichen/*`) | Login |
| `alpha`, `beta`, `gamma`, `kioskdemo` | Wegwerf-Module, die den Architektur-Keystone in den E2E-Tests beweisen | – |

Die verbindliche Liste samt Shell-Variante, Gruppen und Host-Fallbacks steht in
`src/core/registry.ts`. Wer ein Modul sehen darf, entscheidet allein diese Registry.

## Stack

* **Next.js 16** (App Router, React Server Components, React Compiler, `output: standalone`)
* **Ant Design 6** mit eigenem Suite-Theme (`src/core/theme`), Hell/Dunkel über Cookie
* **Drizzle ORM + better-sqlite3**, eine SQLite-Datei **pro Modul** unter `DATA_DIR` (Standard `./.data`)
* **Auth.js v5** mit Pocket ID (OIDC), Gruppen aus dem ID-Token gaten Module und Verwaltung
* **Vitest** (jsdom) für Unit- und DOM-Tests, **Playwright** für End-to-End über mehrere Hosts
* **pnpm 11**, Node 22+, Docker-Image auf `ghcr.io/rubenvitt/iuk-suite`

## Architektur in Kürze

```
Browser ── lagerbuch.iuk-ue.de ──▶ Traefik ──▶ suite (Next.js, ein Prozess)
                                                  │
                          src/proxy.ts: Host → Modul (core/registry, core/routing)
                                                  │  Rewrite auf /m/<modul>/…
                                                  │  Login-/Gruppen-Gate
                                                  ▼
                                   src/app/m/<modul>/   (Seiten, _db, _lib, _ui)
                                                  │
                                   /data/<modul>.db     (SQLite je Modul)
```

* **`src/proxy.ts`** ist in Next.js 16 die Middleware. Sie löst den Host zum Modul auf, schreibt
  den Pfad auf `/m/<modul>/…` um und setzt `requiresAuth`/`requiredGroups` aus der Registry
  durch. Lokal gilt die Konvention `<modul>.localtest.me`.
* **`src/core/`** enthält nur, was mindestens zwei Module heute brauchen: Auth, Shell
  (Kopfzeile, App-Umschalter, Navigation), Theme, Tabellen-Bausteine, Health, Audit-Log,
  Bootstrap (Migrationen beim Start), Rate-Limit, Personenverzeichnis.
* **Jedes Modul** liegt unter `src/app/m/<modul>/` mit eigenem Schema und Migrationen (`_db/`),
  Fachlogik (`_lib/`) und Client-Inseln (`_ui/`). Modul-Interna sind kein API für andere Module.
* **Konfiguration je Instanz** läuft über Umgebungsvariablen: `SUITE_HOST_<KEY>` (Domain),
  `SUITE_ACCESS_GROUP_<KEY>` (Zugang) und `SUITE_ADMIN_GROUP_<KEY>` (Verwaltung). Ein Cutover
  oder Rollback ist damit eine Zeile in der `.env` plus `docker compose up -d`.
* **Health:** `GET /api/health/<modul>` antwortet mit Status, Commit-Revision und Versionsnummer.
  Der automatische Rollout prüft darüber, dass wirklich der neue Stand läuft.

## Lokal entwickeln

Voraussetzungen: Node 22 oder neuer (die CI läuft auf 22, das Image auf 26), pnpm 11
(`packageManager` in `package.json`), Build-Werkzeuge für better-sqlite3 (Python 3, make, g++).

```bash
pnpm install
cp .env.example .env.local
```

In `.env.local` reicht für den Anfang eine Zeile. Der Dev-Login ersetzt Pocket ID durch ein
Formular, in das man E-Mail und Gruppen frei einträgt; ein `AUTH_SECRET` ist dann optional:

```bash
AUTH_DEV_LOGIN=true
```

Dann:

```bash
pnpm seed:lokal      # Demodaten für alle Module, idempotent; nennt Links, Codes und Passwörter
pnpm dev             # http://portal.localtest.me:3000, http://lagerbuch.localtest.me:3000, …
pnpm dev:av          # optional: Fake-clamd für das Modul files
```

`*.localtest.me` löst per Wildcard-DNS auf `127.0.0.1` auf. Alle Modul-Hosts laufen gegen
denselben Dev-Server; `next.config.ts` erlaubt die Origins ausdrücklich.

## Tests und Tore

```bash
pnpm lint            # ESLint, Fehler blockieren die CI
pnpm typecheck       # tsc --noEmit --pretty false, Exit-Code prüfen
pnpm test            # Vitest
pnpm build           # next build
pnpm e2e             # Playwright, startet eigenen Dev-Server auf Port 3100 mit DATA_DIR ./.data/e2e
pnpm e2e:pwa         # PWA-Tests mit eigener Konfiguration
```

Die E2E-Suite läuft in der CI in Gruppen je Modul (`e2e/gruppen.json`); jede Spec muss dort
genau einer Gruppe zugeordnet sein, sonst schlägt `scripts/e2e-gruppen.test.ts` fehl.

Eine Reihe von Fehlern findet **kein** Tor, weil sie erst in einem echten Browser oder bei einem
echten Request sichtbar werden. Sie sind in `CLAUDE.md` und `docs/design/README.md` aufgelistet
und kosten je einen halben Tag, wenn man sie nicht kennt. Vor Oberflächenarbeit dort lesen.

## Betrieb

* **CI/CD:** `.github/workflows/ci.yml` prüft Lint, Typen, Unit- und E2E-Tests, baut ein
  Multi-Arch-Image, vergibt aus der Commit-Historie eine Versionsnummer (`scripts/version.mjs`,
  Conventional-Commit-Präfixe entscheiden über Major/Minor/Patch), erstellt Tag und Release und
  rollt nach Freigabe über einen selbst gehosteten Runner aus (`scripts/deploy.sh`).
* **Stack:** `compose.yaml` mit den Diensten `suite` und `clamav` hinter Traefik. Der Rollout
  prüft `compose.yaml` und `clamd.files.conf` auf Gleichstand mit dem Repo und bricht bei
  Abweichung ab, statt sie zu überschreiben.
* **Datenbanken** liegen im Volume `/data`; Migrationen laufen beim Start des Containers nach
  vorn (`src/core/bootstrap.ts`). Ein Image-Rollback rollt Migrationen nicht zurück.
* **Backup:** `scripts/backup.sh` sichert je Modul eine konsistente SQLite-Kopie und die
  Datei-Blobs, rotiert lokal.
* **Runbooks** in `docs/runbooks/`: automatischer Rollout, Versionierung, Inbetriebnahme und
  Cutover je Modul, Sitzungswiderruf, WebFinger.

## Ein neues Modul anlegen

1. Verzeichnis `src/app/m/<key>/` mit `_db/schema.ts` und `_db/migrations/`
2. Eintrag in `MODULES` (`src/core/registry.ts`) und in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts`)
3. `COPY`-Zeile für das Migrationsverzeichnis im `Dockerfile`
4. Icon in `src/core/shell/icons.ts` eintragen, sonst fällt es still auf das Portal-Icon zurück
5. `_lib/seedLokal.ts` für `pnpm seed:lokal`, Health-Check, Playwright-Spec in einer E2E-Gruppe

`src/core/bootstrap.test.ts` und `scripts/seed-lokal.test.ts` prüfen, dass alle Teile zusammenpassen.

## Dokumentation

| Ort | Inhalt |
| --- | --- |
| `CLAUDE.md` / `AGENTS.md` | Projektregeln, Fallen, Konventionen für Commits, Release Notes und Ticket-Board |
| `docs/design/` | Querschnittsregeln für die Oberfläche und Referenzentwürfe |
| `docs/superpowers/specs/` | Entwurfsdokumente je Modul und Querschnittsthema, mit Begründungen |
| `docs/superpowers/plans/` | Umsetzungspläne dazu |
| `docs/*-portierung-analyse.md` | Analysen der Alt-Anwendungen vor der Portierung (Entscheidungen, Pflichten, Fallen) |
| `docs/runbooks/` | Betriebsanleitungen |
| `docs/spikes/`, `docs/abnahme/` | Technische Vorversuche und Abnahmeprotokolle |

Aufgaben werden auf dem ClickUp-Board „I&K Suite" als `DRK-<n>` geführt; die Nummer steht im
Commit-Body. Release Notes für Anwender liegen als Code unter
`src/app/m/portal/_lib/neuigkeiten/` und erscheinen im Portal.
