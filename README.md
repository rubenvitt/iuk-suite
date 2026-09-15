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
| `zeichen` | Taktische Zeichen nachschlagen, bauen und üben (auf `@einsatzzeichen/*`). **Zurzeit pausiert** (`ZEICHEN_PAUSIERT` in `_lib/verfuegbarkeit.ts`): keine Kachel, jede Route antwortet 503 | Login (sobald wieder aktiv) |
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
  den Pfad auf `/m/<modul>/…` um und schickt bei `requiresAuth: true` Anonyme in den Login und
  Personen ohne `requiredGroups` auf 403. Lokal gilt die Konvention `<modul>.localtest.me`.
  **Module mit anonymem Teilpfad** (`feedback`, `files`, `lagerbuch`, `radio`, `uav`) stehen mit
  `requiresAuth: false` in der Registry, und dann prüft der Proxy **gar nichts**: ihre
  Verwaltung riegelt jedes dieser Module selbst ab, serverseitig in seinem `_lib/` (Vorbild
  `requireFeedbackAccess` bzw. `zugang.ts`). Ein neues Modul mit anonymem Teilpfad braucht
  denselben eigenen Riegel.
* **`src/core/`** enthält nur, was mindestens zwei Module heute brauchen: Auth, Shell
  (Kopfzeile, App-Umschalter, Navigation), Theme, Tabellen-Bausteine, Health, Audit-Log,
  Bootstrap (Migrationen beim Start), Rate-Limit, Personenverzeichnis.
* **Jedes Modul** liegt unter `src/app/m/<modul>/` mit Fachlogik (`_lib/`) und Client-Inseln
  (`_ui/`); ein Modul mit eigener Datenbank trägt dazu Schema und Migrationen in `_db/`.
  Modul-Interna sind kein API für andere Module.
* **Konfiguration je Instanz** läuft über Umgebungsvariablen: `SUITE_HOST_<KEY>` (Domain),
  `SUITE_ADMIN_GROUP_<KEY>` (Verwaltung) und, nur bei Modulen mit `requiresAuth: true`,
  `SUITE_ACCESS_GROUP_<KEY>` (Zugang). Bei `lagerbuch` und `radio` wäre die Access-Variable
  wirkungslos, und ihr Boot bricht deshalb ab, wenn sie gesetzt ist. Ein Cutover
  braucht keinen Commit und keinen CI-Lauf, aber **zwei** Zeilen in der Server-`.env`: den Host in
  `SUITE_HOST_<KEY>` **und** in `SUITE_TRAEFIK_RULE`, sonst erreicht die Domain den Container gar
  nicht erst. Dazu den Router der Alt-Anwendung abschalten, nie zwei Router gleichzeitig; das
  Muster steht in `docs/runbooks/<modul>-cutover.md`. Der Rollback ist derselbe Weg rückwärts:
  beide Zeilen zurücksetzen **und** den Alt-Router wieder einschalten, sonst bedient niemand
  mehr die Domain.
* **Health:** `GET /api/health/<modul>` antwortet mit Status, Commit-Revision und Versionsnummer.
  Der automatische Rollout prüft darüber, dass wirklich der neue Stand läuft.

## Lokal entwickeln

Voraussetzungen: Node 22 oder neuer (die CI läuft auf 22, das Image auf 26), pnpm 11
(`packageManager` in `package.json`), Build-Werkzeuge für better-sqlite3 (Python 3, make, g++).

```bash
pnpm install
printf 'AUTH_DEV_LOGIN=true\nAUTH_COOKIE_DOMAIN=.localtest.me\nAUTH_SECRET=nur-lokal\n' > .env.local
```

Diese drei Zeilen reichen für den Anfang. Der Dev-Login ersetzt Pocket ID durch ein Formular, in
das man E-Mail und Gruppen frei einträgt. Die Cookie-Domain `.localtest.me` lässt die Sitzung über
alle Modul-Hosts gelten, sonst meldet man sich auf jedem Host neu an (Playwright setzt denselben
Wert). Das `AUTH_SECRET` braucht der Dev-Login selbst nicht, wohl aber `files` beim Entsperren
eines passwortgeschützten Links, und genau so einen legt der Seed unten an. `.env.example`
ist die Vorlage für die **Produktions**-`.env` und trägt Werte wie `AUTH_COOKIE_DOMAIN=.iuk-ue.de`,
mit denen der Browser auf `*.localtest.me` das Sitzungscookie verwirft. Also nicht blind kopieren,
sondern nur die Zeilen übernehmen, die ein Modul lokal braucht (z. B. `SUITE_HOST_FILES` mit
`localtest.me`-Hosts; die Kommentare dort sagen, welche).

Dann:

```bash
pnpm seed:lokal      # Demodaten für alle Module, idempotent; nennt Links, Codes und Passwörter
pnpm dev             # http://portal.localtest.me:3000, http://lagerbuch.localtest.me:3000, …
pnpm dev:av          # in einem ZWEITEN Terminal: Fake-clamd auf 127.0.0.1:3310, siehe unten
```

`pnpm dev` und `pnpm dev:av` laufen beide im Vordergrund; wer Uploads braucht, startet sie in
zwei Terminals.

`*.localtest.me` löst per Wildcard-DNS auf `127.0.0.1` auf. Alle Modul-Hosts laufen gegen
denselben Dev-Server; `next.config.ts` erlaubt die Origins ausdrücklich.

**Uploads brauchen den Scanner.** `files` und `aufgaben` schicken jede hochgeladene Datei an
ClamAV und sperren sie, solange kein Befund vorliegt (fail-closed). Beide erwarten den Scanner
ohne weitere Konfiguration unter dem Hostnamen `clamav`, dem Sidecar aus `compose.yaml`; der
Fake aus `pnpm dev:av` lauscht dagegen auf `127.0.0.1`. Wer lokal hochladen will, ergänzt in
`.env.local`:

```bash
AUFGABEN_AV_HOST=127.0.0.1
# files braucht mehr: die zwei Hosts (Verwaltung/Shares und Inbox, Reihenfolge trägt die
# Rolle) schalten das Modul ein, und mit ihnen werden die drei Grenzen zur Pflicht.
SUITE_HOST_FILES=files.localtest.me,drop.localtest.me
FILES_MAX_DATEI_BYTES=12582912
FILES_AV_MAX_BYTES=12582912
FILES_MAX_ABLAUF_TAGE=7
FILES_AV_HOST=127.0.0.1
```

Der vollständige `files`-Block mit allen Grenzen und ihrer Begründung steht in `.env.example`.

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
* **Backup:** `scripts/backup.sh` sichert je Modul eine konsistente SQLite-Kopie und die Blobs
  des Moduls `files` (`BLOB_DIR`), rotiert lokal. ⚠️ Die Bildnachweise des Moduls `aufgaben`
  liegen im eigenen Volume `aufgaben_data` (`/data/aufgaben`) und werden vom Skript heute
  **nicht** mitgesichert; ein Restore enthält dann `aufgaben.db` mit Verweisen auf Bilder, die
  fehlen. Wer das Volume nutzt, sichert es daneben, bis das Skript nachgezogen ist.
* **Runbooks** in `docs/runbooks/`: automatischer Rollout, Versionierung, Inbetriebnahme und
  Cutover je Modul, Sitzungswiderruf, WebFinger.

## Ein neues Modul anlegen

Jedes Modul braucht einen Eintrag in `MODULES` (`src/core/registry.ts`) und sein Icon in
`src/core/shell/icons.ts`, sonst fällt es still auf das Portal-Icon zurück. Ein zustandsloses
Modul wie `alpha` oder `kioskdemo` ist damit fertig.

Ein Modul **mit eigener Datenbank** braucht zusätzlich das Dreieck, sonst schlägt der Start fehl:

1. Verzeichnis `src/app/m/<key>/_db/` mit `schema.ts` und `migrations/`
2. Eintrag in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts`)
3. `COPY`-Zeile für das Migrationsverzeichnis im `Dockerfile`, sonst läuft es lokal und bricht im Container

Dazu `_lib/seedLokal.ts` für `pnpm seed:lokal` und eine Playwright-Spec in einer E2E-Gruppe.
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
