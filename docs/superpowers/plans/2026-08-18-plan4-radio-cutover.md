# Plan 4 von 5 · Der Cutover selbst — Umsetzungsplan (Spec 2, Kapitel 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus Kapitel 4 von Spec 2 entsteht der ausführbare Teil des Cutover-Runbooks
`docs/runbooks/radio-cutover.md` — Vorbedingungen, `.env`, der Ablauf des Fensters in neun Schritten,
die Abnahme, der Service Worker, der Ausstellungsplan der Zugangscodes und der Rückweg —, dazu die
zwei Repo-Artefakte, ohne die dieser Ablauf am Abend ins Leere greift: die sechs Traefik-Label-Zeilen
des Alt-Host-Redirects in `compose.yaml` und der kommentierte `radio`-Block in `.env.example`.

**Architecture:** Der Plan hat **zwei Hälften mit verschiedener Gattung**, und die Reihenfolge ist
nicht tauschbar. Erst die **Repo-Artefakte** (Aufgabe 2 und 3): sie tragen einen echten Testzyklus,
sie sind rollout-wirksam, und sie müssen in einem **früheren** Rollout auf dem Server liegen —
`scripts/deploy.sh:84-105` vergleicht `compose.yaml` byteweise mit der Server-Datei und **bricht bei
Abweichung ab**, eine Compose-Änderung am Cutover-Abend ist also ein eigener Rollout und kein
Handgriff (⬜ N2). Danach der **Runbook-Text** (Aufgaben 1, 4–10): Prosa, deren Prüfbarkeit nicht aus
einem Unit-Test kommt, sondern aus einer **greifbaren Gegenlesung** je Aufgabe — eine Zählung, ein
`grep`, ein Abgleich gegen eine Nummerntabelle. Jede Aufgabe endet mit dieser Gegenlesung und einem
Commit.

**Tech Stack:** Markdown (Hausform `docs/runbooks/files-cutover.md`) · Docker Compose + Traefik ·
Vitest 4 (`scripts/deploy.test.ts` und `src/app/m/files/_lib/compose.test.ts` sind die zwei Vorbilder
für einen Test, der `compose.yaml` liest) · `.env`/`.env.example`

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`, Kapitel 4 (Zeilen 3054–4164),
Rahmen (1–561), Anhänge (4880–4914)

---

## ⚠️ Was dieser Plan NICHT ist — bitte zuerst lesen

**Spec 1 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md`) ist nicht gebaut.**
`src/app/m/radio/` existiert nicht, `scripts/import/radio.ts` existiert nicht (nachgesehen:
`scripts/import/` führt `parity.ts`, `portal.ts`, `feedback.ts`, `feedback-time.ts` plus je einen
Test und `fixtures/`). Deshalb ist dieser Plan **kein Bau-Plan des Moduls**, sondern der Plan für ein
**Runbook** plus zwei Konfigurationsartefakte.

Wo eine Runbook-Zeile auf ein Artefakt wartet, das erst der Bau oder der Betreiber liefert, steht in
diesem Plan **keine erfundene Signatur und kein erfundener Wert**, sondern:

> **Wartet auf:** Spec 1 §7.1.3 — `src/app/m/radio/sw.js/route.ts` (⬜ L12)

Die Nummern kommen aus der ⬜-Tabelle (L1–L14), der Betreiber-/Server-Tabelle (E1–E8, U4–U9) und der
C-Tabelle (C.1–C.7) im Rahmen von Spec 2. **Fünf Lücken hatten dort keine Nummer** — sie bekommen in
diesem Planteil das Präfix **N** und stehen unten begründet in der eigenen Tabelle. Die
Zusammenführung sammelt sie ein.

**Der Präzedenzfall, warum das so streng gehandhabt wird**, steht in Spec 2 selbst (Zeilen 167–171):
die `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft** —
ein Playwright-Test hätte dort eine Zusage geprüft, die die Bauform nicht halten kann.

---

## Global Constraints

- **Kommandos:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
  `pnpm exec playwright test`. Alle mit `rtk` präfixen (`rtk pnpm vitest run`).
- **Nach jeder Aufgabe:** `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` grün, dann
  committen. Bei den reinen Textaufgaben (1, 4–10) genügt `rtk pnpm vitest run`, weil kein
  TypeScript entsteht — der Lauf bleibt trotzdem Pflicht, weil `scripts/compose-radio-redirect.test.ts`
  aus Aufgabe 2 ab dann mitläuft.
- **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore (`vitest.config.ts:8-34`: 251 Fremdfehlschläge gemessen).
- **`pnpm test` sammelt `scripts/**` mit.** `vitest.config.ts:35` setzt nur `exclude`, kein
  `include`-Override; der Kommentar `vitest.config.ts:4-5` behauptet das Gegenteil und ist widerlegt
  (`pnpm vitest list scripts/import/` listet alle 25 Fälle). Ein neuer Test unter `scripts/` läuft
  also **ohne** Konfigurationsänderung mit.
- **Umlaute korrekt setzen.** Der Hausstil der Runbooks ist deutsch mit echten Umlauten; nur in
  Code-Kommentaren, die in `.sh`/`.yaml` landen, wird transliteriert, wo die umgebende Datei es
  bereits tut.
- **Jede Behauptung mit `datei:zeile`.** Das ist die Vorlauf-Regel aus
  `docs/runbooks/lagerbuch-cutover.md:5-6`: „wer hier etwas hinzufügt, schreibt eine **gemessene**
  Tatsache auf, keine Vermutung; jede Zeile unten nennt, woher sie stammt."
- **Betriebswerte werden nicht erfunden** (`docs/runbooks/files-cutover.md:57-58`). Ein Platzhalter
  aus einer anderen Maschine ist kein Wert. In der Eingabentabelle bleibt die Spalte `Eingetragen`
  **leer**.
- **Ein `§` ohne Präfix meint IMMER Spec 2.** Jeder Verweis nach Spec 1 trägt das Präfix `Spec 1 §…`.
  Diese Regel ist neu und wird in Aufgabe 1 in den Runbook-Kopf geschrieben; sie behebt die elf
  blanken Verweise, die die Re-Kritik gemeldet hat (in Kapitel 4 betroffen: Zeile 3257 und
  Zeile 4020).
- **`compose.yaml` ist rollout-wirksam.** `scripts/deploy.sh:84-105` diffed sie gegen die
  Server-Datei und bricht bei Abweichung ab („Stack-Dateien weichen ab. Sie werden BEWUSST nicht
  automatisch übernommen"). Aufgabe 2 ist damit **nicht** Teil des Cutover-Fensters, sondern
  Vorbedingung ⬜ N2.
- **Die Blöcke werden UNINDENTIERT in das Runbook übernommen.** In diesem Plan stehen sie um zwei
  Zeichen eingerückt, weil sie in einem Kästchen liegen; im Runbook beginnt **jede** Zeile in
  Spalte 0 — Überschriften, Tabellen, Kästchen, Fenced Blocks. Die Gegenlesungen der Aufgaben
  greifen auf Spalte 0, und eine übernommene Einrückung macht sie **rot bei richtiger Arbeit**.
- **Der Service heißt `suite`, nicht `app`.** `compose.yaml:2` — Spec 2 §4.4.4 (Zeile 3328) schreibt
  „am selben Service `app`"; das ist eine Fehlbezeichnung und wird in Aufgabe 2 berichtigt.

---

## Die Leerstellen dieses Planteils

**Aus dem Rahmen von Spec 2 übernommen** (Nummern unverändert):

| Nr. | Was offen ist | Blockiert in diesem Plan |
|---|---|---|
| ⬜ L5 | **verkleinert, siehe unten** — offen bleibt allein der **Sollwert** von `revision` | Aufgabe 4 (§A Nr. 1), Aufgabe 8, Aufgabe 9 |
| ⬜ L7 | Statuscode und vollständiger `Location`-Wert der `/admin`-Weiterleitung | Aufgabe 8 (Schritt 8), Aufgabe 9 (Nr. 5) |
| ⬜ L8 | Was `GET /m/radio` mit `Host: iuk-ue.de` liefern **soll** | Aufgabe 8 (Schritt 8) |
| ⬜ L10 | Die Zeichenkette aus dem Ausleih-Rahmen, die im Portal-HTML **nicht** vorkommt | Aufgabe 8 (Schritt 8, Portal-Fallback-Probe), Aufgabe 9 (Nr. 1) |
| ⬜ L11 | Was `radio.iuk-ue.de/manifest.webmanifest` tatsächlich liefert | Aufgabe 9 (Nr. 6) |
| ⬜ L12 | Der Ablesepunkt in den Entwicklerwerkzeugen nach dem Reload | Aufgabe 9 (§E) |
| ⬜ L13 | Name des regulären Suite-Containers und Loopback-Port des Prüfcontainers | Aufgabe 7, Aufgabe 8 (Schritt 8) |
| ⬜ L14 | Darf der Prüfcontainer **parallel** zum Schritt-7-Stack booten? | Aufgabe 8 (Schritt 8) |
| E1–E8 | Gruppenname · Volume-Namen · Sitzungsdauer · Aufsteller · Alt-Token-Geräte · Traefik-Container · anwesende Person | Aufgabe 1 (§0), Aufgabe 5, 6, 9, 10 |
| U4 / C.5 | ⛔ Wo läuft das `radio-inventar`-Frontend produktiv | Aufgabe 4 (§A Nr. 13), Aufgabe 6 (Schritt 1), Aufgabe 10 (§G 3c/3d) |
| U9 | Repo- gegen Server-`compose.yaml` am 19.07. | Aufgabe 2 (nur als Notiz, blockiert nichts) |
| C.2 | Sitzungsdauer 12 h | Aufgabe 5 (`RADIO_AUSLEIH_SITZUNG_STUNDEN`), Aufgabe 10 (Notiz-`<N>`) |
| C.3 | Sind gedruckte Aufsteller im Umlauf | ⛔ Aufgabe 10 (die Zweigwahl in §F) |
| C.6 / B4 | Zwei Rollen oder eine (Updater-Rechtestufe) | Aufgabe 5 — fachlich geparkt, **der Cutover läuft ohne Antwort**, die `.env` wäre dann nachträglich zu erweitern |

**⬜ L5 ist in diesem Planteil verkleinert, und das ist eine Änderung an der Rahmen-Tabelle.** L5
verlangte „welches Feld den Modulnamen und welches den DB-Zugriff belegt" und nannte als Quelle
„Bau". Beides ist heute im Repo lesbar und hängt an keiner `radio`-Bauform, weil die Route generisch
ist:

* `src/core/health/index.ts:4-15` — `checkModuleHealth(key)` liefert
  `{ status: "ok" | "error"; module: string; error?: string }`. `module` trägt den **Modulnamen**
  (`:10`), und `status: "ok"` entsteht erst **nach** `openModuleDatabase(moduleDbPath(key))` plus
  `db.prepare("SELECT 1").get()` (`:8-9`) — das ist der **DB-Zugriff**.
* `src/app/api/health/[modul]/route.ts:23-26` — hängt `revision: laufendeRevision()` an und setzt
  200 bzw. 503.

**Verbindlich ab hier:** `module` = Modulname · `status:"ok"` = DB-Zugriff über `SELECT 1` ·
`revision` = Commit. **Offen bleibt allein der Sollwert von `revision`** — und den liefert §A Nr. 1
als Protokollzeile, nicht der Bau. Die Runbook-Stellen tragen deshalb nur noch dort ein ⬜ L5, wo der
**Wert** gemeint ist.

**Neue Nummern dieses Planteils** (Präfix N, weil die ⬜/E/U/C-Tabellen sie nicht führen):

| Nr. | Was abzulesen / zu entscheiden ist | Quelle | Begründung, warum sie fehlt | Blockiert |
|---|---|---|---|---|
| **N2** | Ist die `compose.yaml` **mit** der `radio-admin-alt`-Labelgruppe bereits auf dem Server ausgerollt? Beleg: `docker compose config \| grep -A2 radio-admin-alt` **am Server, vor dem Fenster** | Server | Spec 2 §4.4.4 sagt „die Labels gehören in die Repo-`compose.yaml`", §4.2 beschreibt den früheren Deploy — die **Verbindung** steht nirgends. `scripts/deploy.sh:84-105` diffed `compose.yaml` byteweise und bricht bei Abweichung ab; eine Compose-Änderung am Cutover-Abend ist ein eigener Rollout | ⛔ §C Schritt 9 Nr. 3 (`docker compose config \| grep -A2 radio-admin-alt` trifft sonst nichts, und `SUITE_REDIRECT_RULE_RADIO_ADMIN` hat nichts zu parametrisieren) |
| **N3** | Die **tatsächliche** numerische Kennung, unter der der Suite-Prozess läuft: `docker inspect <L13> --format '{{.Config.User}}'` bzw. die Zeile `SUITE_USER` der Server-`.env` | Server | Spec 2 §4.5 Schritt 4 Handgriff 0 liest sie aus dem **Image** (`docker run --entrypoint sh "$IMG" -c 'id -u'`). Maßgeblich ist aber `compose.yaml:62` (`user: ${SUITE_USER:-1001:1001}`), und Image und Service weichen dokumentiert ab: `Dockerfile:42-43` legt `nextjs` **ohne** `-G nodejs` an, `USER nextjs` (`Dockerfile:88`) läuft also als 1001:65533(nogroup) — so steht es wörtlich im Docblock `compose.yaml:47-61`, und `.env.example:252` verlangt auf arm64 sogar `SUITE_USER=1001:1000` | ⛔ §C Schritt 4 Handgriff 0/3 und Schritt 7 (die Erwartung „dieselbe Kennung wie die übrigen Modul-DBs" ist mit dem Image-Wert auf einem Standardhost **zwangsläufig rot**) |
| **N5** | Mit welcher Env läuft der Host-Cron `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`), und wo landet das Tarball? Abzulesen aus Crontab bzw. Timer-Unit | Betreiber/Server, gleiche Klasse wie U4b | `scripts/backup.sh:7` fällt ohne Env auf `DATA_DIR=/data` zurück — ein Pfad, den es auf dem Host nach der Argumentation dieser Spec gerade **nicht** gibt; `:32-35` bricht dann hart ab (`no *.db in $DATA_DIR — aborting`). §4.6 Nr. 13 ruft das Skript bar auf und nennt den Fundort des Tarballs nicht | §D Nr. 13 |
| **N1** | Hält der reguläre Stack `radio.db` **nach dem Boot dauerhaft offen**? (Die Re-Kritik hat für dieselbe Lücke die Bezeichnung **L15** vorgeschlagen — es ist **eine** Nummer, hier N1.) | Bau / Abruf | W5 Residuum 2 begründet das Verbot von `immutable=1` im Fenster mit „der reguläre Stack hält `radio.db` offen (Migrationen, Health, Boot-Haken)". Zwei der drei Wege schließen ihr Handle nachweislich wieder — `src/core/bootstrap.ts:99-105` ruft `sqlite.close()`, `src/core/health/index.ts:13-15` schließt im `finally`; der dritte Weg ist ungebaut. L14 fragt nach zwei **bootenden** Prozessen, **nicht** nach Löschen und Ersetzen unter einem laufenden | §C Schritt 4 Handgriff 3 (dort mit der Zwischenlösung aus Aufgabe 7), §C Schritt 5 (a) |
| **N6** | Der Edge-Proxy: (a) **setzt** er `X-Forwarded-Host` oder reicht er ihn durch, (b) welche **Entrypoints** gibt er an Traefik weiter, (c) ist `radio-admin.iuk-ue.de` dort überhaupt bekannt | Server | §4.2 Nr. 8 und §4.4.4 Punkt 6 verlangen beide eine Server-Ablesung und verweisen auf „die U-Tabelle im Kopf" — dort gibt es **keine passende Zeile**. Ohne (b)/(c) laufen die drei `curl` aus §D Nr. 7 in einen Verbindungs- oder TLS-Fehler, **statt rot zu werden** | §A Nr. 8, §D Nr. 7 |

⚠️ **U4 bleibt der teuerste offene Punkt**, und er ist der einzige, den **kein Befehl** beantwortet
(Spec 2:230-232). Er blockiert **vier** Stellen dieses Planteils: den Freeze (§C Schritt 1), den
Umschwenk (§C Schritt 9 Nr. 1), den Rückweg (§G 3c/3d) und die Vollständigkeit der Abbauliste
(Kapitel 5).

---

## Die Aufgaben im Überblick

| # | Aufgabe | Gattung | Liefert |
|---|---|---|---|
| 1 | Runbook anlegen: Kopf, ⚠️-Kopfabschnitt, §0 Eingaben, Abschnittsanker | Text | `docs/runbooks/radio-cutover.md` mit fester Überschriftenfolge |
| 2 | `compose.yaml`: die sechs Redirect-Labels + Regressionstest | **Code (TDD)** | `scripts/compose-radio-redirect.test.ts` grün |
| 3 | `.env.example`: der `radio`-Block und der Rollback-Handgriff | **Code (TDD)** | derselbe Test, um die `.env.example`-Fälle erweitert |
| 4 | §A — Vorbedingungen (§4.2 Nr. 1–13 plus N2 als Nr. 14) | Text | 14 Punkte, jeder mit Befehl und Ausgabefeld |
| 5 | §B — die `.env` (§4.4.1–§4.4.4) | Text | Block mit **genau drei** ⏸-Zeilen + Folgen-Tabelle |
| 6 | §C Schritt 1–3 — Freeze, Snapshot, Volume sichern | Text | `<freeze_iso>`, die drei wörtlichen Stopp-Befehle |
| 7 | §C Schritt 4–5 — Import, Parität, Stichproben, R und Z | Text | vier Handgriffe, fünf Zählungen, R und Z mit `<freeze_iso>` |
| 8 | §C Schritt 6–9 — `.env` scharf, `up -d`, Prüfcontainer, Router | Text | `<umschwenk_iso>`, `<umschwenk_epoch_sekunden>` |
| 9 | §D + §E — Abnahme Nr. 1–16 und der Service Worker | Text | 16 Punkte mit Schreiblinie |
| 10 | §F + §G + §H — Ausstellungsplan, Rückweg, Erfüllung | Text | C.3-Zweigwahl, drei Rückweg-Handgriffe, Teil-Erfüllungsliste |

---

### Aufgabe 1: Das Runbook anlegen — Kopf, ⚠️-Kopfabschnitt, §0 Eingaben, Abschnittsanker

**Dateien:**
- Anlegen: `docs/runbooks/radio-cutover.md`
- Test: keiner — diese Aufgabe erzeugt Prosa. Die Gegenlesung steht in Schritt 5.

**Schnittstellen:**
- Verbraucht: nichts (erste Aufgabe).
- Liefert:
  - die Datei `docs/runbooks/radio-cutover.md`
  - die **verbindliche Überschriftenfolge**: `## §0 — Eingaben: was nur der Betreiber oder der
    Server hergibt` · `## §A — Was vor dem Fenster fertig sein muss` · `## §B — Die \`.env\`` ·
    `## §C — Im Fenster: neun Schritte` · `## §D — Abnahme nach dem Umschwenk` ·
    `## §E — Der Service Worker des Alt-Kiosk` · `## §F — Der Ausstellungsplan für die Zugangscodes` ·
    `## §G — Der Rückweg` · `## §H — Wann das Fenster erfüllt ist`
  - die Eingaben-Numerierung **E1–E8** und die Server-/Betreiberzeilen **U4, U4a, U4b, U6, U7, U8,
    U9** sowie **N1–N10** in **einer** Tabelle
  - die Regel „ein `§` ohne Präfix meint dieses Runbook; jeder Verweis in eine Spec trägt den Namen
    der Spec"

⚠️ **Zwei Abschnitte gehören ausdrücklich NICHT zu diesem Planteil** und werden hier nur als
Platzhalterzeile angelegt, damit die Nachbarteile eine Anschlussstelle haben:
`## §P — Generalprobe` (Kapitel 3) steht **vor** §A, `## §S — Standby und Abbau` (Kapitel 5) steht
**nach** §H.

- [ ] **Schritt 1: Die Datei mit Kopf und Grundlagenzeile anlegen**

  Form wörtlich nach `docs/runbooks/files-cutover.md:1-7`.

  ````markdown
  # Runbook — Radio-Cutover (`radio-admin` + `radio-inventar` → iuk-suite)

  Ziel: Die Domains `radio.iuk-ue.de` **und** `radio-admin.iuk-ue.de` im selben Fenster von den
  zwei Alt-Anwendungen auf die Suite umschwenken, mit Import der Alt-Daten in `radio.db`.
  Rückweg ist „Router zurück" plus der Neustart von **drei** Prozessen — und er kostet Daten,
  sobald einmal fachlich geschrieben wurde.

  Grundlage: `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` (Spec 2) und
  `docs/superpowers/specs/2026-08-17-radio-modul-design.md` (Spec 1). Die Paragraphen dieses
  Runbooks verweisen dorthin — wer eine Begründung sucht, findet sie an der genannten Stelle.

  ⚠️ **Zur Zitierweise:** ein `§` ohne Präfix meint einen Paragraphen **dieses Runbooks**. Jeder
  Verweis in eine Spec trägt ihren Namen: `Spec 1 §7.1.3`, `Spec 2 §4.5`. Die Freeze-SHAs der
  zwei Alt-Repos, gegen die jede `datei:zeile`-Angabe über die Alt-Anwendungen gelesen wird:
  `radio-admin` = **`265abd5`**, `radio-inventar` = **`f883ec4`**. Beide Repos werden
  **archiviert, nicht gelöscht**.
  ````

- [ ] **Schritt 2: Der ⚠️-Kopfabschnitt „Fünf Dinge, die diesen Cutover von den vorigen unterscheiden"**

  Bauteil aus `files-cutover.md:11-35` und `feedback-cutover.md:7-21`: nummerierte Fettabsätze, je
  eine Behauptung als Fettsatz und die Begründung dahinter. Fünf Absätze, wörtlich so:

  ````markdown
  ## ⚠️ Fünf Dinge, die diesen Cutover von den vorigen unterscheiden

  **1. Es gibt kein Parallelfenster.** Der Alt-Kiosk (`radio-inventar`) läuft **schon heute** unter
  `radio.iuk-ue.de`. Alt und Neu können denselben Host nicht gleichzeitig bedienen — „nie zwei
  Router gleichzeitig auf derselben Domain" (`CLAUDE.md`, Abschnitt Cutover) ist hier keine
  Vorsichtsregel, sondern eine **physische Grenze**. Daraus folgt: die Verifikation gegen einen
  **ephemeren Container ohne Traefik-Labels** ist nicht Kür, sondern der **einzige** Weg, vor dem
  Umschwenk überhaupt etwas zu prüfen (§C Schritt 8).

  **2. Beide Domains ziehen im SELBEN Fenster um.** Der Kiosk spricht nie mit der Oberfläche von
  `radio-admin`, sondern über **sechs `/v1`-Routen**. Schwenkt die Verwaltung zuerst, verliert der
  Alt-Kiosk seine Datenquelle. Deshalb ist der Umschwenk **ein** Schritt und nicht zwei (§C
  Schritt 9).

  **3. Der Faktor-1000-Fehler ist paritätsgrün UND löscht die Leihhistorie.** Quelle ist
  epoch-**Millisekunden**, Ziel ist Drizzle `mode: "timestamp"` = Unix-**Sekunden**. Parität
  vergleicht Zeilen-Hashes aus **derselben** Mapping-Funktion auf **beiden** Armen
  (`scripts/import/parity.ts:43-56`; `scripts/import/portal.ts:73-76` schreibt es selbst hin) — ein
  konsistenter Fehler hasht beidseitig gleich. Sekunden statt Millisekunden legt jedes
  `returned_at` ins Jahr **1970**, und der Retention-Purge des Alt-Stacks löscht dann die komplette
  abgeschlossene Leihhistorie. **Der Import-Test bleibt grün.** Die zwei Abfragen, an denen der
  Fehler **nicht** grün bleibt, heißen **R** und **Z** (§C Schritt 5 d).

  **4. Der Service Worker des Alt-Kiosk überlebt den Umschwenk**, weil der Origin zeichengleich
  bleibt: Root-Scope, Cache-Name `radio-inventar-v1`, `skipWaiting()` + `clients.claim()`. *Kein
  Gate sieht davon etwas:* HTTP 200 mit veraltetem Inhalt. Der Abräum-Worker gehört deshalb in den
  **früheren** Deploy (§A Nr. 2), nicht in dieses Fenster (§E).

  **5. Der wichtigste Einzelpunkt der Abnahme ist ein 404, kein 200 — und daneben steht ein 3xx,
  das kein 404 sein darf.** Ein anonymer `GET` auf `/admin/geraete/export` (**Route Handler**) muss
  **404** liefern, nie 403 und nie einen Login-Umweg; ein anonymer `GET` auf `/admin` (**Seite**)
  muss eine **Weiterleitung in den Login** liefern, und ein 404 dort hieße: die Seite ruft den
  Riegel gar nicht. **Wer beiden denselben Sollwert gibt, hat eine der zwei Bauformen
  kaputtgeprüft** (§D Nr. 5).
  ````

- [ ] **Schritt 3: §0 — die Eingabentabelle, Spalte `Eingetragen` leer**

  Bauteil aus `files-cutover.md:39-58`. Der Vorspann wörtlich, dann **eine** Tabelle mit
  **fünfundzwanzig** Zeilen (E1–E8 · U4, U4a, U4b, U6, U7, U8, U9 · N1–N10).

  ````markdown
  ## §0 — Eingaben: was nur der Betreiber oder der Server hergibt

  **Vor dem Fenster ausfüllen.** Jede Zeile ist ein Wert, keine Frage — solange hier ein Feld leer
  ist, beginnt das Fenster nicht. Die späteren Schritte verweisen auf diese Nummern.

  ⚠️ **Betriebswerte werden nicht erfunden** (`files-cutover.md:57-58`). Ein Platzhalter aus einer
  anderen Maschine ist kein Wert.

  | # | Wert | Eingetragen | Ohne ihn |
  |---|---|---|---|
  | E1 | **Gruppenname** für `SUITE_ADMIN_GROUP_RADIO`, exakt wie im `groups`-Claim | | Startabbruch der **ganzen Suite**, und ohne Startabbruch: stummes 404 für jede Verwaltungsseite |
  | E2 | **Echter Volume-Name** von `radio-admin` (`docker volume ls \| grep -i radio-data`) | | §C Schritt 2 legt ein **neues, leeres** Volume an und der Snapshot ist ein paar Kilobyte groß |
  | E3 | **Echter Volume-Name und `POSTGRES_USER`** von `radio-inventar` | | `pg_dump` bricht mit `FATAL: role "radio" does not exist` ab; der Dump ist der **einzige**, den dieses Volume je hatte |
  | E4 | **Sitzungsdauer** `RADIO_AUSLEIH_SITZUNG_STUNDEN` (Vorschlag 12, C.2) | | Vorbelegung 12 gilt — aber `<N>` in der Neuigkeitennotiz behauptete dann eine unbestätigte Zahl |
  | E5 | **Gedruckte Aufsteller: Anzahl, Ort, wer sie ersetzen kann** (C.3) — Begehung, kein `SELECT` | | ⛔ die Zweigwahl in §F ist nicht treffbar |
  | E6 | **Wie viele Geräte tragen den Alt-Token im `localStorage`** — Begehung, kein `SELECT`: der Token liegt im `localStorage`, es gibt keine Tabelle | | Der Umfang des Handgriffs aus §E ist unbekannt |
  | E7 | **Traefik-Containername** | | §D Nr. 8 (Access-Log) und §A Nr. 13 (Labels ablesen) haben kein Ziel |
  | E8 | **Wer ist am Cutover-Abend namentlich anwesend** und stellt den ersten Code aus | | §D Nr. 10 (Login-Rückweg, Handarbeit) und §F fallen aus — und §D Nr. 10 ist die einzige Prüfung, deren Fehlfall **vollständig stumm** ist |
  | U4 | **Wo läuft das `radio-inventar`-Frontend produktiv** (Prozess, Container, statische Auslieferung, Reverse-Proxy-Eintrag; auf welchem Host, mit welcher Konfiguration) | | ⛔ der **Freeze** (§C Schritt 1) · ⛔ der **Umschwenk** (§C Schritt 9 Nr. 1) · ⛔ der **Rückweg** (§G 3c/3d) |
  | U4a | **Wo setzt die Produktion `API_TOKEN`?** Pflichtwert mit `min(32)`, ohne Default, in der eingecheckten Compose-Datei **nicht** enthalten | | Kapitel 5 §5.4 — hier nur mitgeführt, damit die Auskunft **einmal** eingeholt wird |
  | U4b | **Gibt es auf Host-Ebene einen Cron, systemd-Timer oder Backup-Job** zu einem der Alt-Stacks? | | Kapitel 5 §5.5 |
  | U6 | Werden die **zwei OIDC-Client-Registrierungen** in Pocket ID gelöscht oder aufbewahrt? | | Kapitel 5 |
  | U7 | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | | Lesbarkeit der Audit-Spalten; nach dem gelöschten Volume nicht mehr beantwortbar |
  | U8 | **Volumengröße und Dump-Dauer** beider Stacks — Messung **in der Generalprobe** | | Das Fenster ist unbemessen (§A Nr. 7) |
  | U9 | Sind Repo- und Server-`compose.yaml` am 19.07. auseinandergelaufen? **Im Repo nicht nachweisbar, deshalb Frage und nicht Tatsache** | | nichts — die Aufschreibpflicht aus §B hängt nicht daran |
  | N1 | Hält der reguläre Stack `radio.db` **nach dem Boot dauerhaft offen**? | | §C Schritt 4 Handgriff 3 (Dateitausch unter einem laufenden Prozess) und §C Schritt 5 (a) |
  | N2 | Ist die `compose.yaml` **mit** der `radio-admin-alt`-Labelgruppe bereits **auf dem Server** ausgerollt? | | ⛔ §C Schritt 9 Nr. 3 greift ins Leere: `SUITE_REDIRECT_RULE_RADIO_ADMIN` hat nichts zu parametrisieren |
  | N3 | Die **tatsächliche** Kennung des Suite-Prozesses: `docker inspect <L13> --format '{{.Config.User}}'` bzw. `SUITE_USER` aus der Server-`.env` | | ⛔ §C Schritt 4 Handgriff 3 setzt die **falsche** Kennung, und die Erwartung in Schritt 4 ist auf einem Standardhost zwangsläufig rot |
  | N4 | Der Pfad der `sw.js`-Route unter `src/app/m/radio/`, und damit die interne Form der URL | | Kapitel 3, Fremdhost-Probe **V6** der Generalprobe — hier nur mitgeführt, damit die Auskunft **einmal** eingeholt wird |
  | N5 | Env des Host-Cron für `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`) und der Ablageort des Tarballs | | §D Nr. 13 bricht mit `no *.db in $DATA_DIR — aborting` ab, oder sichert gegen die falsche Konfiguration |
  | N6 | Edge-Proxy: (a) **setzt** er `X-Forwarded-Host`, (b) welche **Entrypoints** gibt er weiter, (c) ist `radio-admin.iuk-ue.de` dort bekannt | | §A Nr. 8; und §D Nr. 7 läuft sonst in einen Verbindungs- oder TLS-Fehler **statt rot zu werden** |
  | N7 | Ist die **Zwei-Monats-Frist** im produktiv laufenden `radio-admin` überhaupt konfigurierbar? | | Kapitel 5 §5.7 — hier nur mitgeführt, damit die Auskunft **einmal** eingeholt wird |
  | N8 | **Wohin gehen die zwei Archivdateien?** Zielsystem, Zugriffsweg, Person — und der Beleg, dass es **nicht** der Suite-Server ist | | Kapitel 5 §5.4 (Protokollzeile) und Abbauliste Posten 11 |
  | N9 | Gibt es ein **Traefik-Zugriffsprotokoll**, wo liegt es, wie lange wird es vorgehalten? | | Kapitel 5 §5.8 und Abbauliste Posten 10 — ohne Protokollquelle ist die Abbaubedingung „vier Wochen ohne Treffer" nie erfüllbar |
  | N10 | Wo liegen die zwei **Alt-Checkouts** auf dem Server — das Arbeitsverzeichnis der `docker compose -f …`-Befehle? | | ⛔ die drei Stopp-Befehle (§C Schritt 1) und der Rückweg (§G) laufen aus einem unbekannten Verzeichnis; dazu Kapitel 5 §5.3 und §5.7 |
  ````

  ⚠️ **Zu E1 gehört ein Nachsatz unter die Tabelle**, weil er im Fenster teuer ist:

  ````markdown
  Zu **E1**: Gruppen im JWT werden nur beim Login und beim Token-Refresh nachgezogen — eine frisch
  angelegte Gruppe wirkt mit bis zu **einer Stunde** Verzug (`CLAUDE.md`, Abschnitt
  Zugriffsschutz). Wer die Gruppe am Cutover-Abend anlegt, prüft die Verwaltung **nach einer neuen
  Anmeldung**, nicht mit der offenen Sitzung.

  Zu **U4**: solange offen ist, wer das `radio-inventar`-Frontend ausliefert, **blockiert es den
  Freeze** — nicht erst den Abbau. Ein unbekannter Auslieferungsweg ist ein Schreibweg, den
  niemand gestoppt hat, und der Verlust ist stumm.
  ````

- [ ] **Schritt 4: Die Abschnittsanker setzen**

  Elf Überschriften in dieser Reihenfolge, jede mit einem einzeiligen Platzhalter darunter, damit die
  Datei von Anfang an vollständig gegliedert ist:

  ````markdown
  ## §P — Generalprobe
  *(Kapitel 3 dieser Spec — nicht Teil dieses Planteils.)*

  ## §A — Was vor dem Fenster fertig sein muss
  ## §B — Die `.env`
  ## §C — Im Fenster: neun Schritte
  ## §D — Abnahme nach dem Umschwenk
  ## §E — Der Service Worker des Alt-Kiosk
  ## §F — Der Ausstellungsplan für die Zugangscodes
  ## §G — Der Rückweg
  ## §H — Wann das Fenster erfüllt ist

  ## §S — Standby und Abbau
  *(Kapitel 5 dieser Spec — nicht Teil dieses Planteils.)*
  ````

- [ ] **Schritt 5: Gegenlesung und Commit**

  ```bash
  # Die Überschriftenfolge steht vollständig und in dieser Reihenfolge:
  rtk grep -n '^## ' docs/runbooks/radio-cutover.md
  # Erwartung, exakt: ⚠️-Kopf, §0, §P, §A, §B, §C, §D, §E, §F, §G, §H, §S  (12 Zeilen)

  # Die Eingabentabelle hat fünfundzwanzig Wertzeilen und KEINE ausgefüllte Zelle:
  rtk grep -c '^| [EUN][0-9]' docs/runbooks/radio-cutover.md     # Erwartung: 25
  rtk grep -n '^| [EUN][0-9].*| .\+ |.*|' docs/runbooks/radio-cutover.md   # Erwartung: keine Zeile

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Cutover-Runbook anlegen — Kopf, Eingaben (E/U/N), Abschnittsanker"
  ```

---

### Aufgabe 2: `compose.yaml` — die sechs Redirect-Labels des Alt-Hosts, mit Regressionstest

**Wartet auf:** nichts. Diese Aufgabe ist **ohne** Spec 1 ausführbar — die Labels hängen an keiner
`radio`-Bauform, sie hängen an einer Env-Variablen mit unschädlicher Vorbelegung.

⛔ **Diese Aufgabe ist ein eigener Rollout, kein Cutover-Handgriff** (⬜ N2). `scripts/deploy.sh:84-105`
vergleicht `compose.yaml` mit der Server-Datei (`diff -u`) und bricht bei Abweichung ab:
„Stack-Dateien weichen ab. Sie werden BEWUSST nicht automatisch übernommen — eine Änderung an
compose.yaml oder clamd.files.conf ist Runbook-Arbeit." Die Labels müssen also **vor** dem
Cutover-Abend auf dem Server sein, im selben Deploy wie §A Nr. 1.

**Dateien:**
- Anlegen: `scripts/compose-radio-redirect.test.ts`
- Ändern: `compose.yaml` (Labelblock des Service `suite`, `:146-155` — die neuen Zeilen **hinter**
  `:155`)
- Test: `scripts/compose-radio-redirect.test.ts`

**Schnittstellen:**
- Verbraucht: nichts.
- Liefert:
  - die Env-Variable **`SUITE_REDIRECT_RULE_RADIO_ADMIN`** mit der Vorbelegung
    ``Host(`radio-admin.invalid`)`` — der Name ist bewusst **nicht** `SUITE_HOST_`-präfigiert
  - den Router-Namen **`radio-admin-alt`** und den Middleware-Namen
    **`radio-admin-alt-redirect`** (beide zeichengleich in §B, §C Schritt 9 und §G)
  - den Testnamen `scripts/compose-radio-redirect.test.ts`, den Aufgabe 3 erweitert

⚠️ **Berichtigung gegenüber Spec 2 §4.4.4 (Zeile 3328):** dort steht „am selben Service `app`". Der
Service heißt **`suite`** (`compose.yaml:2`); es gibt in dieser Datei keinen Service `app`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

  Vorbild wörtlich: `scripts/deploy.test.ts:29-31` (Wurzelauflösung und `lies()`) und
  `src/app/m/files/_lib/compose.test.ts:25-35` (Zeilenzerlegung statt YAML-Paket — „ein `yaml`-Paket
  steht als DIREKTE Abhängigkeit nicht zur Verfügung"). Nicht neu erfinden.

  ```ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "node:fs";
  import path from "node:path";

  /**
   * Der Redirect vom Alt-Host `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` lebt in SECHS
   * Traefik-Labels, und kein anderes Tor sieht sie an: `pnpm build` liest keine `compose.yaml`,
   * `docker compose config` prueft nur die Syntax, und E2E benutzt kein Compose. Faellt eine der
   * sechs Zeilen weg oder verrutscht ein `$`, ist der Fehlfall STILL:
   *
   *   * Middleware am SERVICE statt am ROUTER  -> der Redirect trifft die Suite selbst.
   *   * `permanent=true` (301)                 -> die Weiterleitung liegt im Cache jedes Telefons,
   *                                               das den Alt-Host je besucht hat, und der Rueckweg
   *                                               ist praktisch unmoeglich.
   *   * `${1}` statt `$${1}`                    -> Compose verschluckt das eine `$`, die Ersetzung
   *                                               liefert `/admin/` fuer JEDEN Pfad. Der Redirect
   *                                               funktioniert und ist nicht mehr pfaderhaltend —
   *                                               der stille Fehlfall dieses Blocks.
   *   * fehlende Vorbelegung                    -> `docker compose config` scheitert, sobald die
   *                                               Variable nicht gesetzt ist.
   *   * `entrypoints` abweichend vom Suite-Router -> `https://radio-admin.iuk-ue.de/` antwortet gar
   *                                               nicht oder mit einem Zertifikatsfehler, und die
   *                                               drei curl aus dem Runbook laufen ins Leere,
   *                                               STATT rot zu werden.
   *
   * Belege: Spec 2 §4.4.4; `compose.yaml:2` (der Service heisst `suite`, nicht `app`),
   * `compose.yaml:153-155` (der bestehende Suite-Router und seine Entrypoints).
   * Vorgehen (Zeilenzerlegung statt YAML-Paket) uebernommen aus
   * `src/app/m/files/_lib/compose.test.ts:14-21`.
   */

  const WURZEL = path.resolve(__dirname, "..");
  const compose = readFileSync(path.join(WURZEL, "compose.yaml"), "utf8");
  const composeZeilen = compose.split("\n");

  /** Alle Label-Zeilen des Service `suite` — also die `- `-Eintraege unter `    labels:`. */
  function suiteLabels(): string[] {
    const start = composeZeilen.findIndex((z) => z === "    labels:");
    expect(start, "Labelblock des Service `suite` nicht gefunden").toBeGreaterThan(-1);
    const raus: string[] = [];
    for (let i = start + 1; i < composeZeilen.length; i++) {
      const z = composeZeilen[i];
      if (z.trim() === "") continue;
      if (!z.startsWith("      ")) break;
      if (z.trim().startsWith("#")) continue;
      raus.push(z.trim().replace(/^- /, ""));
    }
    return raus;
  }

  describe("compose.yaml — der Redirect vom Alt-Host radio-admin.iuk-ue.de", () => {
    const labels = suiteLabels();

    it("der Router traegt die Regel aus SUITE_REDIRECT_RULE_RADIO_ADMIN mit unschaedlicher Vorbelegung", () => {
      expect(labels).toContain(
        "traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}",
      );
    });

    it("der Redirect-Router fuehrt DIESELBEN Entrypoints wie der Suite-Router", () => {
      const suite = labels.find((l) => l.startsWith("traefik.http.routers.iuk-suite.entrypoints="));
      const alt = labels.find((l) => l.startsWith("traefik.http.routers.radio-admin-alt.entrypoints="));
      expect(suite, "Suite-Router hat keine entrypoints-Zeile").toBeTruthy();
      expect(alt?.split("=")[1]).toBe(suite?.split("=")[1]);
    });

    it("die Middleware haengt am ROUTER, nicht am Service", () => {
      expect(labels).toContain(
        "traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect",
      );
      expect(labels.some((l) => l.startsWith("traefik.http.services.radio-admin-alt"))).toBe(false);
    });

    it("die Ersetzung ist pfaderhaltend und traegt das doppelte Dollarzeichen", () => {
      const rep = labels.find((l) =>
        l.startsWith("traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement="),
      );
      expect(rep).toBe(
        "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}",
      );
      // Das eine `$` waere genau der stille Fehlfall: Redirect funktioniert, Pfad geht verloren.
      expect(rep).not.toMatch(/[^$]\$\{1\}/);
    });

    it("die Regex trifft beide Protokolle und den Alt-Host", () => {
      expect(labels).toContain(
        "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\\.iuk-ue\\.de/(.*)",
      );
    });

    it("permanent=false — ein 301 laege im Cache jedes Telefons", () => {
      expect(labels).toContain(
        "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false",
      );
    });

    it("radio-admin.iuk-ue.de steht NICHT in der Vorbelegung von SUITE_TRAEFIK_RULE", () => {
      // Sonst erreicht der Alt-Host den Container und faellt STILL auf portal zurueck
      // (`src/core/routing.ts:69`), statt umgeleitet zu werden.
      const rule = labels.find((l) => l.startsWith("traefik.http.routers.iuk-suite.rule="));
      expect(rule).toBeTruthy();
      expect(rule).not.toContain("radio-admin");
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/compose-radio-redirect.test.ts
  ```

  Erwartung: **sieben** Fälle, davon **sechs rot** (die Labels fehlen noch); grün ist allein
  „radio-admin.iuk-ue.de steht NICHT in der Vorbelegung von `SUITE_TRAEFIK_RULE`" — er prüft eine
  Abwesenheit, die heute schon gilt (`compose.yaml:153`).

- [ ] **Schritt 3: Die sechs Label-Zeilen in `compose.yaml` ergänzen**

  Einfügen **hinter** `compose.yaml:155`
  (`- traefik.http.services.iuk-suite.loadbalancer.server.port=3000`), im selben Labelblock des
  Service `suite`:

  ```yaml
      # ── Redirect des Alt-Hosts radio-admin.iuk-ue.de → radio.iuk-ue.de/admin ──
      # ZWEITER, EIGENER Router. `radio-admin.iuk-ue.de` gehoert AUSDRUECKLICH NICHT in
      # SUITE_TRAEFIK_RULE oben: der Host erreichte dann den Container, kein SUITE_HOST_*
      # beansprucht ihn, und `decideRoute` schreibt auf portal um
      # (`const mod = moduleForHost(host) ?? getModule("portal")`, src/core/routing.ts:69).
      # Der Alt-Host zeigte dann das PORTAL — ein funktionierender Abruf mit falschem Inhalt.
      #
      # Der Variablenname ist bewusst NICHT `SUITE_HOST_`-praefigiert: `const PREFIX =
      # "SUITE_HOST_"` (src/core/hosts.ts:20), und `validateHostConfig` bricht bei jedem
      # Namen mit diesem Praefix ab, der zu keinem Modul-Key passt. So ist die Zeile
      # boot-neutral.
      #
      # Die Vorbelegung `radio-admin.invalid` loest niemand auf; ohne sie scheitert
      # `docker compose config`, sobald die Variable fehlt.
      - traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}
      # DIESELBEN Entrypoints wie der Suite-Router eine Zeile hoeher. TLS endet VOR Traefik,
      # an einem Edge-Proxy — im ganzen Compose gibt es kein `tls`- und kein
      # `certresolver`-Label. Fuehrt dieser Router einen anderen Entrypoint, antwortet
      # https://radio-admin.iuk-ue.de/ gar nicht oder mit einem Zertifikatsfehler, und die
      # Abnahme laeuft ins Leere STATT rot zu werden (⬜ N6).
      - traefik.http.routers.radio-admin-alt.entrypoints=web
      # Middleware am ROUTER, nicht am Service: am Service traefe der Redirect die Suite selbst.
      - traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect
      - traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\.iuk-ue\.de/(.*)
      # `$${1}` erreicht Traefik als `${1}`. Ein einfaches `$` verschluckt Compose, und die
      # Ersetzung liefert `/admin/` fuer JEDEN Pfad — der Redirect funktioniert dann, ist aber
      # nicht mehr pfaderhaltend. Das ist der stille Fehlfall dieses Blocks.
      - traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}
      # 302, nie 301: ein 301 liegt im Cache jedes Telefons, das den Alt-Host je besucht hat,
      # und macht den Rueckweg praktisch unmoeglich.
      - traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false
  ```

- [ ] **Schritt 4: Tests grün, und die Syntax gegen Docker selbst prüfen**

  ```bash
  rtk pnpm vitest run scripts/compose-radio-redirect.test.ts     # Erwartung: 7 grün
  AUTH_SECRET=x docker compose config | grep -A2 radio-admin-alt
  # ⚠️ `AUTH_SECRET=x` davor, weil `compose.yaml:81` die einzige `:?`-Zeile der Datei ist
  # und `docker compose config` sonst abbricht, bevor es irgendetwas ausgibt.
  #
  # Erwartung: die Regel steht mit der Vorbelegung `Host(`radio-admin.invalid`)` da,
  # und `replacement` endet auf `/admin/$${1}` — mit ZWEI Dollarzeichen.
  #
  # ⛔ KORRIGIERT AM 2026-08-28 (L5), GEMESSEN AUF DOCKER COMPOSE v5.1.2. Diese Zeile
  #   verlangte vorher EIN Dollarzeichen. Das ist falsch und haette am Cutover-Abend
  #   einen FALSCHEN ABBRUCH ueber einer richtigen Konfiguration ausgeloest: Compose
  #   loest `$${1}` intern zwar auf, RE-ESCAPET den Wert aber beim Serialisieren, damit
  #   seine Ausgabe selbst wieder eine gueltige Compose-Datei ist — in `config` wie in
  #   `config --format json`. Gegenprobe im selben Lauf: ein `${FOO:-vorbelegt}` wird zu
  #   `vorbelegt` aufgeloest, die Interpolation laeuft also.
  #
  # Was Traefik wirklich sieht, ist der Wert AM CONTAINER, und der ist einfach:
  docker inspect "$(docker compose ps -q suite)" \
    --format '{{ index .Config.Labels "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement" }}'
  # Erwartung: https://radio.iuk-ue.de/admin/${1}   — hier EIN Dollarzeichen.
  #
  # Der stille Fehlfall (ein einfaches `$` in der compose.yaml) ist auf v5.1.2 uebrigens
  # nicht mehr still: `docker compose config` bricht mit „invalid interpolation format"
  # ab. Auf aelteren Fassungen verschluckte Compose das `$`. Der Regressionstest
  # `scripts/compose-radio-redirect.test.ts` deckt beide Faelle ab.
  ```

  ⚠️ Diese Ausgabe **gehört ins Protokoll des Rollouts** — sie ist die Vorlage, gegen die §C
  Schritt 9 Nr. 3 am Cutover-Abend vergleicht.

- [ ] **Schritt 5: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add compose.yaml scripts/compose-radio-redirect.test.ts
  rtk git commit -m "feat(radio): Traefik-Redirect vom Alt-Host radio-admin.iuk-ue.de, mit Regressionstest"
  ```

  ⚠️ **Nach dem Merge ein eigener Rollout** (`scripts/deploy.sh`), **bevor** das Cutover-Fenster
  geplant wird — das ist ⬜ N2, und §A Nr. 14 hakt es ab.

---

### Aufgabe 3: `.env.example` — der `radio`-Block, die Prod-Domain-Zeile und der Rollback-Handgriff

**Wartet auf:** ⬜ **C.6 / B4** für **eine einzige** zusätzliche Zeile. Fällt C.6 auf „zwei Rollen",
kommt `SUITE_UPDATER_GROUP_RADIO` hinzu, und mit ihr eine sechste Boot-Prüfung und eine sechste
Eingabe neben E1. **Der Block wird trotzdem jetzt geschrieben** — der Cutover ist ohne Antwort
durchführbar (eine Rolle ist der engere Zuschnitt); die Erweiterung wäre eine spätere Zeile, keine
Umarbeitung.

**Dateien:**
- Ändern: `.env.example` (`:112` — die vorhandene auskommentierte Zeile `# SUITE_HOST_RADIO=`
  bekommt einen Nachsatz; neuer Block `── Modul radio ──` **hinter** dem `lagerbuch`-Block, vor
  `:309`; Nachsatz neben `SUITE_TRAEFIK_RULE`, `:366-369`)
- Ändern: `scripts/compose-radio-redirect.test.ts` (neue `describe`-Gruppe)
- Test: `scripts/compose-radio-redirect.test.ts`

**Schnittstellen:**
- Verbraucht: `SUITE_REDIRECT_RULE_RADIO_ADMIN` und die Vorbelegung
  ``Host(`radio-admin.invalid`)`` aus Aufgabe 2.
- Liefert die **verbindlichen Variablennamen**, die §B, §C Schritt 6 und §G zeichengleich benutzen:
  `SUITE_HOST_RADIO` · `SUITE_ADMIN_GROUP_RADIO` · `RADIO_AUSLEIH_SITZUNG_SECRET` ·
  `RADIO_AUSLEIH_SITZUNG_STUNDEN` · `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` ·
  `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` · `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` ·
  `RADIO_HISTORIE_PURGE` · `RADIO_HISTORIE_MONATE` · `RADIO_HISTORIE_ERSTLAUF_MINUTEN` ·
  `SUITE_TRAEFIK_RULE` · `SUITE_REDIRECT_RULE_RADIO_ADMIN`.
  ⚠️ **`SUITE_ACCESS_GROUP_RADIO` ist der Name, der NICHT vorkommen darf** — er wird nur in einem
  Kommentar genannt, nie als Zeile.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

  Ans Ende von `scripts/compose-radio-redirect.test.ts` anfügen, und oben die Datei mit einlesen:

  ```ts
  const envBeispiel = readFileSync(path.join(WURZEL, ".env.example"), "utf8");

  describe(".env.example — der radio-Block", () => {
    it("nennt die Redirect-Variable neben SUITE_TRAEFIK_RULE, mit Rollback-Handgriff", () => {
      expect(envBeispiel).toContain("SUITE_REDIRECT_RULE_RADIO_ADMIN");
      // Der Rollback ist die GELEERTE Zeile, nicht die geloeschte — und bei radio ist
      // das gegenlaeufig zu SUITE_ACCESS_GROUP_RADIO. Beides steht als Handgriff da.
      expect(envBeispiel).toMatch(/SUITE_HOST_RADIO=\s*$/m);
    });

    it("fuehrt SUITE_ACCESS_GROUP_RADIO NUR als Warnung, NIE als Zeile", () => {
      // `!== undefined` ist die Boot-Pruefung: ein `SUITE_ACCESS_GROUP_RADIO=` kaeme per
      // env_file als LEERER STRING, also als *definiert*, im Prozess an -> Boot-Abbruch
      // der GANZEN Suite. Eine auskommentierte Beispielzeile waere die Vorlage dafuer.
      const alsZeile = envBeispiel
        .split("\n")
        .filter((z) => /^\s*#?\s*SUITE_ACCESS_GROUP_RADIO\s*=/.test(z));
      expect(alsZeile).toEqual([]);
      expect(envBeispiel).toContain("SUITE_ACCESS_GROUP_RADIO");   // als Prosa-Warnung
    });

    it("fuehrt alle acht RADIO_-Variablen des Cutovers", () => {
      for (const name of [
        "RADIO_AUSLEIH_SITZUNG_SECRET",
        "RADIO_AUSLEIH_SITZUNG_STUNDEN",
        "RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN",
        "RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN",
        "RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE",
        "RADIO_HISTORIE_PURGE",
        "RADIO_HISTORIE_MONATE",
        "RADIO_HISTORIE_ERSTLAUF_MINUTEN",
      ]) {
        expect(envBeispiel, `${name} fehlt in .env.example`).toContain(name);
      }
    });

    it("nennt KEIN RADIO_ADMIN_URL und KEIN RADIO_ADMIN_API_TOKEN", () => {
      // `api_tokens` trug produktiv genau einen Konsumenten, und der verschwindet mit dem
      // Port. Eine Variable dafuer waere ein Angebot an einen Konsumenten, den es nicht gibt.
      expect(envBeispiel).not.toContain("RADIO_ADMIN_URL");
      expect(envBeispiel).not.toContain("RADIO_ADMIN_API_TOKEN");
    });
  });
  ```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

  ```bash
  rtk pnpm vitest run scripts/compose-radio-redirect.test.ts
  ```

  Erwartung: die sieben Fälle aus Aufgabe 2 bleiben grün; von den vier neuen sind **drei rot**
  (`SUITE_REDIRECT_RULE_RADIO_ADMIN` und die acht `RADIO_*`-Namen fehlen, `SUITE_HOST_RADIO=` steht
  auskommentiert). Grün ist „nennt KEIN `RADIO_ADMIN_URL`" — eine Abwesenheit, die heute gilt.

- [ ] **Schritt 3: Die Prod-Domain-Zeile ergänzen**

  `.env.example:154` trägt heute `# SUITE_HOST_RADIO=`. Die Zeile bleibt auskommentiert (sie wird
  erst im Fenster gesetzt) und bekommt **darüber** den Nachsatz:

  ```dotenv
  # radio: ZWEI Zeilen mit ENTGEGENGESETZTER Leerwert-Bedeutung — dieselbe Falle wie bei
  # `files`, nur mit anderen Namen:
  #   SUITE_HOST_RADIO=          -> LEER, Zeile BLEIBT stehen. Das ist der Rueckweg
  #                                 (`envHostsFor` liefert dann [], src/core/hosts.ts:33-46).
  #   SUITE_ACCESS_GROUP_RADIO   -> Zeile WEG. Ein leerer Wert ist hier der STARTABBRUCH.
  # SUITE_HOST_RADIO=
  ```

- [ ] **Schritt 4: Den `── Modul radio ──`-Block anlegen**

  Hinter den `lagerbuch`-Block, vor `.env.example:351` (`─── Modul aufgaben ───`). Form nach dem
  Vorbild `.env.example:273-281`:

  ```dotenv
  # ── Modul radio ───────────────────────────────────────────────────────────────
  # SUITE_HOST_RADIO steht NICHT hier, sondern oben im Block „Prod-Domains der
  # Module" — und SUITE_TRAEFIK_RULE unten muss mit erweitert werden, sonst
  # erreicht die Domain den Container gar nicht erst.
  #
  # ⚠️ SUITE_ACCESS_GROUP_RADIO DARF ES NICHT GEBEN. Die Boot-Pruefung ist
  # `!== undefined`: ein `SUITE_ACCESS_GROUP_RADIO=` kommt per env_file als LEERER
  # STRING, also als *definiert*, im Prozess an — und bricht den Start der GANZEN
  # Suite ab. Gemeint ist: die Zeile ersatzlos entfernen. Waere sie gesetzt und
  # wuerde nicht geprueft, waere sie STILL WIRKUNGSLOS (`canAccess` steigt fuer
  # `requiresAuth: false` sofort mit `true` aus, src/core/registry.ts:239).
  #
  # Muss gesetzt und nicht leer sein: `radio` ignoriert den
  # isModuleAdmin-Kurzschluss modulintern, es gibt keine Suite-Admin-Rueckfallebene.
  # Leer oder fehlend = Startabbruch — die Alternative waere ein stummes 404 fuer
  # JEDE Verwaltungsseite und alle Verwaltenden auf einmal.
  # SUITE_ADMIN_GROUP_RADIO=
  #
  # Frisch erzeugen (`openssl rand -base64 32`), >= 32 Zeichen, und NICHT gleich
  # AUTH_SECRET — alle drei Faelle sind ein Startabbruch. ⚠️ HIER GIBT ES NICHTS ZU
  # ERBEN: anders als bei `lagerbuch`, wo HELFER_SESSION_SECRET wertgleich aus der
  # Prod-Umgebung uebernommen wurde, damit laufende Sitzungen den Cutover
  # ueberleben. Der heutige Zugang des Alt-Kiosk ist ein base64-Bearer-Token im
  # localStorage, kein signiertes Cookie. Wer nach einem zu uebernehmenden Wert
  # sucht, sucht vergeblich.
  # RADIO_AUSLEIH_SITZUNG_SECRET=
  # Ganze Zahl 1..168; ausserhalb -> Startabbruch. Ohne die Zeile gilt 12.
  # RADIO_AUSLEIH_SITZUNG_STUNDEN=12
  #
  # Die drei Schranken sind ab dem ersten Import EINGEFROREN: eine geaenderte .env
  # wirkt erst nach einem Neustart. ⚠️ Solange die CWE-348-Umstellung in
  # src/core/ratelimit.ts aussteht, ist die Absenderkennung faelschbar und diese
  # Schranke eine BREMSE, KEIN RIEGEL — das steht hier, damit sie niemand fuer mehr
  # haelt.
  # RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
  # RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
  # RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
  #
  # NUR IM CUTOVER-FENSTER, danach ENTFERNEN — und zwar erst, wenn die Abfragen R
  # und Z gruen protokolliert sind. Ein vergessenes RADIO_HISTORIE_PURGE=0 ist ein
  # STILLER Verlust der Loeschrichtlinie, die der DSGVO-Grund fuer `borrower_name`
  # ist; die info-Zeile bei JEDEM Start ist das einzige, was ihn findbar haelt.
  # RADIO_HISTORIE_PURGE=0
  # Vorbelegungen, im Fenster NICHT setzen. `RADIO_HISTORIE_MONATE=0` wird
  # ausdruecklich abgewiesen und nicht als „aus" gelesen.
  # RADIO_HISTORIE_MONATE=2
  # RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440
  ```

- [ ] **Schritt 5: Den Nachsatz neben `SUITE_TRAEFIK_RULE` ergänzen**

  Unter `.env.example:458` (`SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`)`):

  ```dotenv
  # ⚠️ radio-admin.iuk-ue.de gehoert AUSDRUECKLICH NICHT in SUITE_TRAEFIK_RULE. Wer ihn
  # dort mit aufnimmt, bekommt NICHT den Redirect, sondern den stillen Portal-Fallback:
  # der Host erreicht den Container, kein SUITE_HOST_* beansprucht ihn, und `decideRoute`
  # schreibt auf portal um (src/core/routing.ts:69). Der Alt-Host zeigt dann das Portal —
  # ein funktionierender Abruf mit falschem Inhalt, und kein Test des Repos sieht
  # Traefik-Labels an.
  #
  # Der Alt-Host bekommt stattdessen einen ZWEITEN, eigenen Router (compose.yaml, Labels
  # `radio-admin-alt`). Nur der Wert lebt hier:
  # SUITE_REDIRECT_RULE_RADIO_ADMIN=Host(`radio-admin.iuk-ue.de`)
  #
  # ROLLBACK des Redirects: die Zeile LEEREN, nicht entfernen —
  # `${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}` greift bei leer UND
  # bei ungesetzt. Reihenfolge des endgueltigen Abbaus: Labels aus compose.yaml, dann
  # diese Zeile, DNS ZULETZT — der DNS-Eintrag ist die Abhaengigkeit des Redirects,
  # kein Abbau-Posten.
  ```

- [ ] **Schritt 6: Tests grün, Tore und Commit**

  ```bash
  rtk pnpm vitest run scripts/compose-radio-redirect.test.ts    # Erwartung: 11 grün
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add .env.example scripts/compose-radio-redirect.test.ts
  rtk git commit -m "docs(radio): .env.example um den radio-Block und den Redirect-Wert erweitern"
  ```

---

### Aufgabe 4: §A — Was vor dem Fenster fertig sein muss (vierzehn Punkte)

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitt `## §A`, aus Aufgabe 1)
- Test: keiner. Gegenlesung in Schritt 4.

**Schnittstellen:**
- Verbraucht: die Abschnittsanker und die Eingaben-Numerierung aus Aufgabe 1; ⬜ N2 aus Aufgabe 2.
- Liefert:
  - die Numerierung **§A Nr. 1–14** (dreizehn Punkte aus Spec 2 §4.2 plus **Nr. 14 = ⬜ N2**)
  - die Protokollzeilen `<revision_soll>`, `<image_digest_soll>` und `<router_regel_heute>`, auf
    die §C Schritt 7, §C Schritt 9 und §D Nr. 3 zeichengleich verweisen

⚠️ **Die Numerierung ist tragend.** Die Erfüllungsliste von Spec 2 hakt heute „§4.2 Nr. 1–12" ab,
während §4.2 **dreizehn** Punkte führt — Nr. 13 (die wörtlich protokollierte Router-Konfiguration)
fiel aus der Klammer, obwohl sie selbst ein ⛔ trägt. In diesem Runbook heißt die Klammer
**„§A Nr. 1–14 vollständig"**, und §H schreibt sie so.

- [ ] **Schritt 1: Der Vorspann und die Punkte 1–7**

  ````markdown
  ## §A — Was vor dem Fenster fertig sein muss

  Keine Wiederholung der Generalprobe (§P), sondern die Menge der Dinge, deren Fehlen das Fenster
  **verbrennt**. **Jeder Punkt mit Ausgabe, nicht mit Erwartung** — eine abgehakte Zeile ohne
  protokollierte Ausgabe ist keine abgehakte Zeile (`files-cutover.md:192-196`).

  - [ ] **1. Der Deploy mit dem Registry-Eintrag und dem Abräum-Worker ist gelaufen — in einem
        FRÜHEREN Fenster.** Beweis gegen den **laufenden** Container:
        ```bash
        curl -s -o /dev/null -w '%{http_code}\n' https://iuk-ue.de/api/health/radio
        #   200 = das Modul ist im Image
        #   503 = falsches Image: getModule(key) wirft bei unbekanntem Key
        ```
        **Und im selben Handgriff die zwei Ablesungen, ohne die §D Nr. 3 und §C Schritt 8 keine
        linke Seite haben:**
        ```bash
        curl -s https://iuk-ue.de/api/health/radio    # das Feld `revision` des LAUFENDEN Stands
        git rev-parse --short HEAD                    # im Checkout, aus dem gebaut wurde
        docker compose images suite                   # der Image-Digest, der gerade laeuft
        ```
        `revision` = `<revision_soll>` → ____________________
        Digest = `<image_digest_soll>` → ____________________
        **Warum das hier steht und nicht am Abend:** §D Nr. 3 und §C Schritt 8 machen `revision` zum
        „einzigen Beleg, dass wirklich der neue Stand antwortet". **Der Sollwert dieser Erwartung
        entsteht nur hier.** Welches Feld was belegt, ist **nicht** offen:
        `src/core/health/index.ts:4-15` liefert `{ status, module, error? }` — `module` trägt den
        Modulnamen (`:10`), `status:"ok"` entsteht erst nach `openModuleDatabase` plus
        `SELECT 1` (`:8-9`) —, und `src/app/api/health/[modul]/route.ts:23-26` hängt `revision` an.
        Offen ist allein der **Wert**, und den trägt die Zeile oben.
        ⛔ **Abbruch:** 503 → der Cutover wird **abgesagt, nicht angepasst.** Ohne den
        Registry-Eintrag hat der Import kein Zielschema, und `SUITE_HOST_RADIO` in der `.env`
        bricht den Start der **ganzen** Suite ab.

  - [ ] **2. Der Abräum-Worker liegt in diesem ersten Deploy, nicht im Cutover.** Begründung
        in §E. → ____________________
        **Wartet auf:** Spec 1 §7.1.3 — `src/app/m/radio/sw.js/route.ts` und
        `_lib/sw-quelle.ts`.

  - [ ] **3. ⛔ Die Retention der Standby-Umgebung ist neutralisiert oder das Volume ist kopiert —
        vor dem ERSTEN Generalproben-Snapshot**, nicht erst „vor dem Cutover-Abend".
        `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
        `retentionService.ts:47` purgt **sofort**, erst `:48` startet den Tagestimer; der Cutoff
        hängt an der **Wanduhr** (`:9`, `:19`) — **jeder weitere Start löscht mehr als der vorige.**
        Handgriff: `HISTORY_RETENTION_MONTHS` neutralisieren **oder** das Volume kopieren.
        **Wie man es merkt, wenn es fehlt:** ein **erfolgreicher** Start mit der Protokollzeile
        `[retention] purged N expired loan(s)` (`retentionService.ts:41`) — kein Fehler, kein roter
        Test. Nachgewiesen am ______ durch ____________________

  - [ ] **4. `SUITE_SEED` ist nicht `1`.** Bei `radio` schärfer als bei jedem bisherigen Modul: ein
        geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum gesamten Bestand samt
        Ausleihernamen. → ____________________

  - [ ] **5. Abgelesen und protokolliert ist, was die zwei Hosts HEUTE liefern:**
        ```bash
        curl -si https://radio.iuk-ue.de/admin  | head -10   # heute: Alt-Verwaltungsoberflaeche
        curl -si https://radio-admin.iuk-ue.de/ | head -10   # heute: der Alt-Verwaltungshost
        ```
        Beide Ausgaben ins Protokoll → ____________________
        ⚠️ **Was hier ausdrücklich NICHT verlangt wird, ist ein aufgelöster Zustand.** Bis zum
        Umschwenk liegt unter `radio.iuk-ue.de/admin` die eigene Verwaltungsoberfläche des
        Alt-Kiosk; die Kollision **endet definitionsgemäß mit dem Umschwenk**. Ein Haken
        „Kollision aufgelöst" wäre vor dem Fenster nicht setzbar. Der Haken hier heißt „abgelesen
        und im Protokoll"; die Auflösung prüft §D Nr. 7.

  - [ ] **6. Der Registry-Code-Default-Abgleich, den kein Boot sehen kann:**
        ```bash
        rtk grep -n 'prodHosts' src/core/registry.ts
        ```
        und die Code-Defaults **von Hand** gegen die gesetzten `SUITE_HOST_*` vergleichen. Grund:
        die Kollisions-Map in `validateHostConfig` wird **ausschließlich** aus `envHostsFor`
        gefüllt (`src/core/hosts.ts:78-95`) — ein Host, den ein anderes Modul per
        Registry-`prodHosts` im **Code-Default** führt, erreicht sie **nie** und kollidiert ohne
        jede Meldung. `moduleForHost` entscheidet dann nach **Registry-Reihenfolge**
        (`src/core/registry.ts:225-232`), nicht nach Env. → ____________________

  - [ ] **7. Zwei Messungen aus der Generalprobe liegen vor (U8):** Größe der Prod-Volumes und
        Dauer von `pg_dump` bzw. `sqlite3 .backup`. Sie bemessen das Fenster.
        Größe ________ / Dump-Dauer ________
  ````

- [ ] **Schritt 2: Die Punkte 8–14**

  ````markdown
  - [ ] **8. ⬜ N6 (a): belegen, dass der Edge-Proxy `X-Forwarded-Host` SETZT statt durchreicht.**
        Der Host-Riegel löst den Host über `resolveHost` auf, und das liest `x-forwarded-host` mit
        **Vorrang** vor `host` (`src/core/routing.ts:37`). Nach dem Rewrite der Middleware ist das
        die einzig richtige Reihenfolge, aber der Header ist client-fälschbar. Der Docblock in
        `core/routing.ts` begründet die Ungefährlichkeit mit `requiresAuth`/`canAccess` als
        Auffangriegel — **und `requiresAuth: false` entfernt genau diesen Auffangriegel.**
        **Deployment-Invariante, im Repo nicht belegbar** (dieselbe Lage wie
        `lagerbuch-cutover.md:102-118`) — also **am Server** belegen und ins Protokoll schreiben.
        → ____________________
        **Im selben Handgriff ⬜ N6 (b) und (c):** welche **Entrypoints** gibt der Edge-Proxy an
        Traefik weiter, und ist `radio-admin.iuk-ue.de` dort überhaupt bekannt? Ohne beides
        antwortet `https://radio-admin.iuk-ue.de/` in §D Nr. 7 mit einem Verbindungs- oder
        TLS-Fehler **statt rot zu werden**. → ____________________

  - [ ] **9. Die Cloudflare-Zonenregeln für `radio.iuk-ue.de` sind gelesen und protokolliert:**
        trägt der Host heute Regeln, die der Alt-Kiosk brauchte — Bot Fight Mode, Cache-Regeln,
        Page Rules? Bekannter Bestandsfall im Haus: `iuk-ue.de`/`qr.iuk-ue.de` zeigten
        Bot-Challenges. → ____________________

  - [ ] **10. Die Wahl zwischen Weg A und Weg B für den Login-Rückweg ist getroffen** (§P).
        Gewählt: ☐ A ☐ B → ____________________

  - [ ] **11. `TZ=Europe/Berlin` ist als Voraussetzung benannt, aber in diesem Fenster NICHT
        gesetzt.** Es ist ein eigener Suite-Posten mit eigener Prüfung gegen **alle** laufenden
        Module; ein nachträgliches `TZ` verschöbe jede Datumsgrenze, die portal, qr, feedback,
        files, lagerbuch und aufgaben bisher in UTC gezogen haben. `radio` hängt bewusst nicht
        daran — die Zone steht in `tagInBerlin`. **Wer es doch am Cutover-Abend setzt, ändert
        sechs fremde Module mit.**

  - [ ] **12. ⬜ L13 und ⬜ L14 sind abgelesen** — ohne Containername, Loopback-Port und die
        Antwort auf „darf ein zweiter bootender Container auf `suite_data`?" ist §C Schritt 8 nicht
        ausführbar.
        L13 Container ________ / Port ________ · L14 ☐ ja ☐ nein → ____________________
        **Im selben Handgriff ⬜ N3**, weil es dieselbe Ablesung am selben Container ist:
        ```bash
        docker inspect <L13-Containername> --format '{{.Config.User}}'
        rtk grep -n '^SUITE_USER=' <Pfad der Server-.env>
        ```
        Kennung des laufenden Prozesses = `<uid_gid_prozess>` → ____________________
        ⚠️ **Nicht aus dem Image ableiten.** `Dockerfile:42-43` legt `nextjs` **ohne** `-G nodejs`
        an, `USER nextjs` (`Dockerfile:88`) läuft also als 1001:65533(nogroup) — der Service
        startet dagegen als `user: ${SUITE_USER:-1001:1001}` (`compose.yaml:62`), und auf arm64
        verlangt `.env.example:252` sogar `SUITE_USER=1001:1000`. Wer die Image-Zahl nimmt, setzt
        in §C Schritt 4 eine Kennung, die von der der übrigen Modul-Datenbanken **abweicht** —
        und die Erwartung dort ist dann zwangsläufig rot, ohne dass ein Fehler vorläge.

  - [ ] **13. ⛔ Die heutige Router-Konfiguration von `radio.iuk-ue.de` UND
        `radio-admin.iuk-ue.de` ist abgelesen und WÖRTLICH im Protokoll — und der Handgriff, der
        sie zurückstellt, steht daneben.**
        ```bash
        # label-basierte Regeln (E7 = Traefik-Containername):
        docker inspect <E7> --format '{{json .Config.Labels}}'
        # sonst: die Datei des File-Providers bzw. die Konfiguration des Edge-Proxy —
        # WO sie liegt, ist U4 und wird beim Betreiber eingeholt, nicht geraten.
        ```
        `<router_regel_heute>` → ____________________
        Rückstell-Handgriff, wörtlich → ____________________
        **Warum das eine eigene Vorbedingung ist und keine Fußnote:** in **beiden** eingecheckten
        Alt-Compose-Dateien kommt die Zeichenkette `traefik` **nicht vor** — sie veröffentlichen
        nur `ports:` (`radio-inventar/docker-compose.yml:13`, `:40`;
        `radio-admin/docker-compose.yml:6`). Es gibt also **keine Labels zu entfernen** und keine
        Datei im Repo, in der man sie sucht. Daran hängen **drei** Schritte: §C Schritt 9 Nr. 1
        („Alt-Router zuerst weg") hat ohne diese Zeile **kein ausführbares Ziel**, und §G 3c/3d
        hat **nichts zurückzustellen**. ⛔ **Fehlt die Zeile, wird das Fenster nicht eröffnet** —
        um 21 Uhr ist das Rekonstruktionsarbeit an einer fremden Proxy-Konfiguration.
        Quelle: **U4**.

  - [ ] **14. ⛔ ⬜ N2: Die `compose.yaml` MIT der `radio-admin-alt`-Labelgruppe ist auf dem Server
        ausgerollt** — in einem **eigenen, früheren** Rollout, nicht am Cutover-Abend.
        ```bash
        docker compose config | grep -A2 radio-admin-alt
        ```
        **Erwartung:** die Regel steht mit der Vorbelegung ``Host(`radio-admin.invalid`)`` da, und
        `replacement` endet auf `/admin/${1}` — mit **einem** Dollarzeichen, weil Compose das
        doppelte hier auflöst. Steht dort `/admin/` **ohne** `${1}`, ist das `$$` verloren und der
        Redirect wäre nicht mehr pfaderhaltend. → ____________________
        **Warum das nicht ins Fenster passt:** `scripts/deploy.sh:84-105` vergleicht `compose.yaml`
        per `diff -u` mit der Server-Datei und **bricht bei Abweichung ab** („Stack-Dateien weichen
        ab. Sie werden BEWUSST nicht automatisch übernommen — eine Änderung an compose.yaml oder
        clamd.files.conf ist Runbook-Arbeit"). Ohne diesen Rollout greift §C Schritt 9 Nr. 3 ins
        Leere: `SUITE_REDIRECT_RULE_RADIO_ADMIN` hat nichts zu parametrisieren, und der Alt-Host
        liefert nach dem Umschwenk **das Portal** statt einer Weiterleitung.
  ````

- [ ] **Schritt 3: Der Abschluss-Kasten von §A**

  ````markdown
  ⛔ **Vier der vierzehn Punkte eröffnen das Fenster nicht, wenn sie fehlen:** Nr. 1 (503 statt
  200), Nr. 3 (Retention nicht neutralisiert — dann ist auch der **Rückweg** gesperrt, §G), Nr. 13
  (Router-Regel nicht abgelesen) und Nr. 14 (Compose nicht ausgerollt). Dazu, außerhalb dieser
  Liste: **U4/C.5** — sie blockiert den **Freeze**, nicht erst den Abbau.
  ````

- [ ] **Schritt 4: Gegenlesung und Commit**

  ```bash
  # Vierzehn Punkte, lückenlos numeriert:
  rtk grep -c '^- \[ \] \*\*[0-9]' docs/runbooks/radio-cutover.md       # Erwartung: 14
  # Jede Nummer kommt genau einmal vor:
  rtk grep -o '^- \[ \] \*\*[0-9]*\.' docs/runbooks/radio-cutover.md | sort -V | uniq -d
  # Erwartung: keine Ausgabe

  # Jede in §A genannte Leerstelle — und wo sie geführt wird:
  rtk grep -o '⬜ \*\{0,2\}[LN][0-9]*' docs/runbooks/radio-cutover.md | sed 's/\*//g' | sort -u
  # Erwartung: L13, L14, N2, N3, N6. ⚠️ Nur N2, N3 und N6 haben eine Zeile in der §0-Tabelle —
  # §0 führt allein E, U und N. ⬜ L13 und ⬜ L14 stammen aus der ⬜-Tabelle von Spec 2 und werden
  # im Kopf dieses Planteils geführt (Tabelle „Aus dem Rahmen von Spec 2 übernommen").

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §A — vierzehn Vorbedingungen, jede mit Ausgabe"
  ```

---

### Aufgabe 5: §B — Die `.env`, mit genau drei ⏸-Zeilen

**Wartet auf:** **E1** (Gruppenname) und **E4** (Sitzungsdauer) als Werte; ⬜ **C.6 / B4** für eine
mögliche sechste Zeile. Der Abschnitt wird trotzdem vollständig geschrieben — die zwei Werte stehen
als `<E1>`/`<E4>`, nicht als erfundene Beispiele.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitt `## §B`)
- Test: keiner. Gegenlesung in Schritt 5.

**Schnittstellen:**
- Verbraucht: die Variablennamen aus Aufgabe 3, den Router-/Middleware-Namen `radio-admin-alt`
  aus Aufgabe 2.
- Liefert:
  - den **⏸-Block** — genau **drei** auskommentierte Zeilen (`SUITE_HOST_RADIO`, die
    `SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`), auf die §C Schritt 6 und
    Schritt 9 zeichengleich verweisen
  - die Bezeichnung **„die drei ⏸-Zeilen"** als feststehenden Begriff des Runbooks

- [ ] **Schritt 1: Der Vorspann und der `.env`-Block**

  ````markdown
  ## §B — Die `.env`

  Alle Zeilen in **einer** Änderung, aber die drei mit ⏸ markierten bleiben bis §C Schritt 9
  **ungesetzt**.

  ⚠️ **Der eine Punkt, an dem die naive Lesart den Cutover bricht:** `SUITE_TRAEFIK_RULE` wirkt über
  Traefik-Labels, die **beim Containerstart** gelesen werden (`compose.yaml:153`). Wer die Regel in
  derselben Änderung setzt, in der er `up -d` ruft, **hat den Router damit schon umgeschwenkt** —
  die Verifikation liefe dann **nach** dem Umschwenk, nicht davor. Genau so macht es
  `docs/runbooks/files-cutover.md:115-116`: „`.env` vorbereiten — alle Zeilen aus der Tabelle unten
  in EINER Änderung, aber noch nicht aktiv". **Der Router ist ein eigener, letzter Schritt.**

  ⚠️ **Die drei Zeilen stehen ABSICHTLICH auskommentiert im Block** — wer ihn unter Zeitdruck
  kopiert, bekommt damit den richtigen Zustand *vor* dem Umschwenk. Sie werden in §C Schritt 9
  **einkommentiert, nicht neu getippt.**

  ```dotenv
  # ── im Block „Prod-Domains der Module" (.env.example:154) ──
  # ⏸ SUITE_HOST_RADIO=radio.iuk-ue.de        # erst in §C Schritt 9

  # ── Block „── Modul radio ──" (neu, nach dem lagerbuch-Block, vor .env.example:351) ──
  SUITE_ADMIN_GROUP_RADIO=<E1>
  # SUITE_ACCESS_GROUP_RADIO  — DIESE ZEILE DARF NICHT EXISTIEREN. Siehe Tabelle unten.
  RADIO_AUSLEIH_SITZUNG_SECRET=<openssl rand -base64 32, frisch, NICHT gleich AUTH_SECRET>
  RADIO_AUSLEIH_SITZUNG_STUNDEN=<E4, Vorschlag 12>
  RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
  RADIO_HISTORIE_PURGE=0          # Cutover-Schalter, wird nach dem Fenster ENTFERNT (§D Nr. 14)
  # RADIO_HISTORIE_MONATE=2                 # Vorbelegung, im Fenster nicht setzen
  # RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440    # Vorbelegung, im Fenster nicht setzen

  # ── neben der SUITE_TRAEFIK_RULE-Zeile (.env.example:455-458) ──
  # ⏸ SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || … || Host(`radio.iuk-ue.de`)   # erst in §C Schritt 9
  # ⏸ SUITE_REDIRECT_RULE_RADIO_ADMIN=Host(`radio-admin.iuk-ue.de`)          # erst in §C Schritt 9
  ```

  ⚠️ **`SUITE_TRAEFIK_RULE` ist bis Schritt 9 nicht „weg", sondern trägt ihren bisherigen Wert
  weiter** — sie führt heute schon die Hosts der sechs laufenden Module. Auskommentiert wird nur die
  **erweiterte** Fassung; die bestehende Zeile bleibt unverändert stehen, bis sie in Schritt 9
  ersetzt wird. **Wer sie versehentlich auskommentiert, nimmt mit einem Handgriff sechs fremde
  Module vom Netz** (Vorbelegung ``Host(`iuk-ue.de`)``, `compose.yaml:153`).
  ````

- [ ] **Schritt 2: Die Folgen-Tabelle**

  Bauteil aus `files-cutover.md:118-132` (`| Variable | Wert | Folge, wenn sie fehlt oder falsch
  ist |`). Die Folgenspalte trägt die eigentliche Aussage.

  ````markdown
  | Variable | Wert | Was passiert, wenn sie fehlt oder falsch ist |
  |---|---|---|
  | `SUITE_HOST_RADIO` | `radio.iuk-ue.de` | Fehlt sie: `moduleForHost` fällt auf **portal** zurück (`src/core/hosts.ts:52-57`), der Rewrite auf `/m/radio<rest>` greift nicht, `/sw.js` landet im Portal-Modul, und der Login-Rückweg wirft auf das Portal (`:59-63`). **Alles davon still.** ⚠️ Bei `radio` schärfer als sonst: der Portal-Fallback überdeckt die **Ausleihe** — die anonyme Fläche, die **kein Anmeldefenster zeigt, an dem jemand den Fehler bemerkt** |
  | `SUITE_ADMIN_GROUP_RADIO` | `<E1>`, **nicht leer** | Leer oder fehlend = **Startabbruch** der ganzen Suite. Der Boot-Riegel existiert genau deshalb: die Alternative wäre ein **stummes 404 für JEDE Verwaltungsseite und alle Verwaltenden auf einmal** — `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern, es gibt keine Suite-Admin-Rückfallebene |
  | `SUITE_ACCESS_GROUP_RADIO` | ⚠️ **Zeile gar nicht vorhanden** | ⚠️ **Diese Variable invertiert `SUITE_HOST_RADIO`, und die naheliegende Zeile ist der Startabbruch.** Die Prüfung ist `!== undefined`, und ein `SUITE_ACCESS_GROUP_RADIO=` kommt per `env_file` als **leerer String**, also als *definiert*, im Prozess an → **Boot-Abbruch**. Gemeint ist: die Zeile **ersatzlos entfernen**. Wäre sie gesetzt und würde nicht geprüft, wäre sie **still wirkungslos** (`src/core/registry.ts:239`) |
  | `RADIO_AUSLEIH_SITZUNG_SECRET` | frisch, ≥ 32 Zeichen | Fehlt, zu kurz **oder gleich `AUTH_SECRET`** → **Startabbruch**. ⚠️ **Hier gibt es nichts zu erben** — anders als bei `lagerbuch`, wo `HELFER_SESSION_SECRET` wertgleich aus der Prod-Umgebung übernommen wurde, damit laufende Sitzungen den Cutover überleben (`.env.example:294-300`). Der heutige Zugang des Kiosk ist ein base64-Bearer-Token im `localStorage`, kein signiertes Cookie. **Wer nach einem zu übernehmenden Wert sucht, sucht vergeblich** |
  | `RADIO_AUSLEIH_SITZUNG_STUNDEN` | `<E4>`, ganze Zahl `1..168` | Außerhalb des Bereichs → **Startabbruch**. Ohne die Zeile gilt die Vorbelegung 12 |
  | `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | `5` | Je Absender, **nur Fehlversuche**. Keine ganze Zahl im Bereich → Startabbruch |
  | `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | `30` | Modulweite Burst-Kappe gegen Rotation des Absenderschlüssels (= sechs Absender-Budgets) |
  | `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | `300` | Der tragende Zähler (= 5/min × 60). ⚠️ Die drei Grenzen sind ab dem ersten Import **eingefroren**; eine geänderte `.env` wirkt erst nach einem Neustart. ⚠️ Solange die CWE-348-Umstellung in `src/core/ratelimit.ts` aussteht, ist die Absenderkennung fälschbar und diese Schranke eine **Bremse, kein Riegel** — das steht hier, damit sie niemand für mehr hält |
  | `RADIO_HISTORIE_PURGE` | `0` **im Fenster** | Die zweite Hälfte der Faktor-1000-Absicherung. Wird nach dem Fenster entfernt — **erst wenn R und Z grün protokolliert sind** (§D Nr. 14) |
  | `SUITE_TRAEFIK_RULE` | bestehende Hosts **plus** ``\|\| Host(`radio.iuk-ue.de`)`` | Ohne die Erweiterung erreicht die Domain den Container gar nicht erst (`compose.yaml:149-153`). Bestehende Hosts **übernehmen**, nicht ersetzen. ⚠️ **`radio-admin.iuk-ue.de` gehört dort ausdrücklich NICHT hinein** |
  | `SUITE_REDIRECT_RULE_RADIO_ADMIN` | ``Host(`radio-admin.iuk-ue.de`)`` | Solange ungesetzt, existiert der Redirect-Router und trifft nichts (Vorbelegung `radio-admin.invalid`). Wird in **derselben** Änderung gesetzt wie `SUITE_HOST_RADIO` |

  **Was ausdrücklich nicht entsteht:** kein `RADIO_ADMIN_URL`, kein `RADIO_ADMIN_API_TOKEN`, kein
  `POCKET_ID_*` für `radio`. `api_tokens` trug produktiv genau **einen** Konsumenten, und der
  verschwindet mit dem Port. **Eine Variable dafür wäre ein Angebot an einen Konsumenten, den es
  nicht gibt.**

  ⬜ **C.6 / B4 (geparkt, blockiert dieses Fenster nicht):** fällt die Entscheidung auf „zwei
  Rollen", kommt `SUITE_UPDATER_GROUP_RADIO` hinzu — mit ihr eine sechste Boot-Prüfung und eine
  sechste Eingabe neben E1. **Der Cutover ist ohne Antwort durchführbar** (eine Rolle ist der engere
  Zuschnitt); die `.env` wäre dann nachträglich zu erweitern.
  ````

- [ ] **Schritt 3: Was den Boot abbricht — und was STILL zurückfällt**

  ````markdown
  ### §B.1 — Abbruch gegen still

  **Abbruch: drei Dinge, und nur diese drei, aus `validateHostConfig` (`src/core/hosts.ts:65-99`):**

  1. Ein `SUITE_HOST_*`, dessen Suffix zu **keinem** Modul-Key passt (`:69-76`). ⚠️ **Daraus folgt
     die einzige Reihenfolge, die ein Cutover selbst verletzen kann: erst der Registry-Eintrag im
     Image, dann die `.env`.** Solange `key: "radio"` in `src/core/registry.ts` fehlt, bricht
     `SUITE_HOST_RADIO` **oder** `SUITE_ADMIN_GROUP_RADIO` den Start der **ganzen** Suite ab —
     nachweisbar vermeidbar über §A Nr. 1 (200 statt 503).
  2. Ein Wert mit `/` oder `:` (`:81-85`) — reiner Hostname, ohne Protokoll, ohne Port.
  3. Ein Host, den **zwei per Env gesetzte** Module beanspruchen (`:87-93`).

  Dazu die fünf modul-eigenen Abbrüche aus `radioBootFehler()`: leere Admin-Gruppe · gesetztes
  `SUITE_ACCESS_GROUP_RADIO` · fehlendes/zu kurzes/gleiches Sitzungsgeheimnis ·
  `RADIO_HISTORIE_MONATE` keine ganze Zahl ≥ 1 · `RADIO_AUSLEIH_SITZUNG_STUNDEN` außerhalb `1..168`.
  Jeder zurückgegebene String **ist** ein Startabbruch: `assertHostConfig` wirft bei `length > 0`
  (`src/core/bootstrap.ts:92`).
  **Wartet auf:** Spec 1 §7.3.3 — `radioBootFehler()`.

  **Still: drei Ausprägungen, jede mit ihrem eigenen Handgriff.**

  | Stiller Fall | Beleg | Handgriff, und wo er steht |
  |---|---|---|
  | **Richtig geschriebener, falscher Hostname.** `SUITE_HOST_RADIO=falsch.example.com` ist von einem Tippfehler nicht zu unterscheiden; `moduleForHost` fällt auf **portal** zurück, `radio.iuk-ue.de` zeigt stillschweigend das Portal | `src/core/hosts.ts:52-57`, wörtlich: „der Host fällt dann in `moduleForHost` auf das Portal zurück und die QR-Domain zeigt stillschweigend das Portal" | **Eigener Verifikationsschritt** §D Nr. 1 + Nr. 3 + Nr. 5 |
  | **Der Login-Rückweg, den kein `curl` sieht.** Fehlt die Variable, wirft Auth.js den Nutzer nach dem Login **aufs Portal**, ohne Fehler und ohne Meldung | `src/core/hosts.ts:59-63`, wörtlich: „Ein curl sieht davon nichts" | **Handarbeit**, §D Nr. 10 — und dieselbe Person stellt den ersten Zugangscode aus (§F), damit der Schritt nicht vergessen wird |
  | **Die Kollision, die `validateHostConfig` strukturell nicht sehen kann** — ein Host im Registry-**Code-Default** eines anderen Moduls erreicht die Kollisions-Map nie | `src/core/hosts.ts:78-95` | **Vor** dem Fenster, §A Nr. 6 |

  ⚠️ **Und der stille Fall, den nur eine Protokollzeile findet:** `SUITE_HOST_RADIO` gesetzt, aber
  in `SUITE_TRAEFIK_RULE` nicht enthalten — **die Domain ist tot, ohne dass etwas kaputt aussieht.**
  Das **meldet** (`console.warn`), es wirft nicht: die Labels leben in der `.env` auf dem Server,
  und ein Abbruch träfe genau in dem Moment, in dem der Betreiber die `.env` gerade umstellt.
  Deshalb §D Nr. 9: **`warn` = Stopp, `info` = Zustand.**

  ### §B.2 — Rollback ist die leere Zeile, nicht die gelöschte

  `SUITE_HOST_RADIO=` ergibt `[]` (bewusst **keine** Prod-Hosts). Das **Entfernen** der Variable
  ergibt `null` und damit den Code-Default aus der Registry (`src/core/hosts.ts:33-46`). Mit
  `prodHosts: []` ist der Unterschied heute wirkungsgleich — aber nur heute, und die leere Zeile
  ist die Form, die sagt, was gemeint ist.

  ⚠️ **Die beiden Formen sind bei `radio` gegenläufig, und das ist die Zeile, die man am
  leichtesten verkehrt schreibt:**

  * `SUITE_HOST_RADIO=` → **leer, Zeile bleibt stehen.** Das ist der Rückweg.
  * `SUITE_ACCESS_GROUP_RADIO` → **Zeile weg.** Ein leerer Wert ist hier der **Startabbruch**.
  ````

- [ ] **Schritt 4: §B.3 — Der Redirect vom Alt-Host**

  ````markdown
  ### §B.3 — Der Redirect vom Alt-Host, und warum er einen eigenen Router hat

  **Muss `radio-admin.iuk-ue.de` in `SUITE_TRAEFIK_RULE` stehen? Nein — ausdrücklich nicht.** Wer
  ihn dort mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback: der
  Host erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, und `decideRoute` schreibt auf
  portal um (`const mod = moduleForHost(host) ?? getModule("portal")`, `src/core/routing.ts:69`).
  Der Alt-Host zeigt dann das **Portal** — ein funktionierender Abruf mit falschem Inhalt, und
  **kein Test des Repos sieht Traefik-Labels an**.

  Die sechs Label-Zeilen stehen deshalb **im Repo**, am Service `suite` (`compose.yaml:2`; Spec 2
  §4.4.4 schreibt dort „Service `app`" — den gibt es nicht). Sie sind **vor** dem Fenster
  ausgerollt (§A Nr. 14, ⬜ N2). Sechs Punkte, jeder mit seinem Preis:

  1. **Middleware am Router, nicht am Service.** Am Service träfe der Redirect auch die Suite selbst.
  2. **`permanent=false` → 302, nie 301.** Ein 301 liegt im Cache jedes Telefons, das den Alt-Host
     je besucht hat, und macht den Rückweg praktisch unmöglich.
  3. **`$$` gegen die Compose-Interpolation.** `$${1}` erreicht Traefik als `${1}`; ein einfaches
     `$` verschluckt Compose, und die Ersetzung liefert `/admin/` für **jeden** Pfad. Der Redirect
     funktioniert dann, ist aber nicht mehr pfaderhaltend — **der stille Fehlfall dieses Blocks.**
  4. **Pfaderhaltend heißt:** `radio-admin.iuk-ue.de/geraete` → `radio.iuk-ue.de/admin/geraete`.
     Die Alt-Verwaltung bediente ihre Oberfläche ab `/`; das neue Präfix ist `/admin`.
  5. **Eigene Variable mit unschädlicher Vorbelegung.** `radio-admin.invalid` löst niemand auf;
     ohne Vorbelegung scheitert `docker compose config`, sobald die Variable fehlt. ⚠️ Der Name ist
     bewusst **nicht** `SUITE_HOST_`-präfigiert: `const PREFIX = "SUITE_HOST_"`
     (`src/core/hosts.ts:20`), und `validateHostConfig` bricht bei jedem Namen mit diesem Präfix
     ab, der zu keinem Modul-Key passt. `SUITE_REDIRECT_RULE_RADIO_ADMIN` ist damit boot-neutral.
  6. ⚠️ **`entrypoints=web` ist richtig, und der Grund gehört hierher, weil er sonst wie ein Fehler
     aussieht.** Der bestehende Suite-Router trägt genau dieselbe Zeile
     (`compose.yaml:154`), und **im ganzen Compose gibt es kein `tls`- und kein
     `certresolver`-Label.** TLS endet also **vor** Traefik, an einem Edge-Proxy. Führt der
     Redirect-Router einen anderen Entrypoint, oder kennt der Edge-Proxy den Alt-Host nicht,
     antwortet `https://radio-admin.iuk-ue.de/` über HTTPS **gar nicht** oder mit einem
     Zertifikatsfehler — also **keine** 302-Zeile, sondern ein Verbindungs- oder TLS-Fehler, und
     die drei `curl` aus §D Nr. 7 **laufen ins Leere, statt rot zu werden**. Das ist ⬜ **N6**.

  ⚠️ **Der Redirect wird im selben Fenster wie der Umschwenk scharf, nie davor** (§A Nr. 5).

  ⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange der Redirect steht.** Er ist
  die Abhängigkeit des Redirects, kein Abbau-Posten. Der Redirect fällt, sobald im
  Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer mehr erscheint — und
  dann in dieser Reihenfolge: Labels aus `compose.yaml`, `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der
  `.env`, **DNS zuletzt** (§S).

  **Der Preis: die Regel lebt auf dem Server, nicht im Repo.** Die Labels sind **Struktur** und
  gehören als per Env parametrisierte Labels in die Repo-`compose.yaml`. Die zwei **Werte** leben in
  der `.env` auf dem Server und sind in keinem Repo nachlesbar. Damit die nächste Sitzung sie kennt,
  gehören sie an **drei** Orte: (1) `compose.yaml` im Repo · (2) `.env.example` neben der
  `SUITE_TRAEFIK_RULE`-Zeile · (3) **ins Cutover-Protokoll, wörtlich, beide gesetzten Werte**, plus
  nach dem Deploy `docker compose config | grep -A2 radio-admin-alt`.
  → ____________________
  ````

- [ ] **Schritt 5: Gegenlesung und Commit**

  ```bash
  # Genau drei ⏸-Zeilen im .env-Block, keine mehr und keine weniger:
  rtk grep -c '^# ⏸' docs/runbooks/radio-cutover.md   # Erwartung: 3

  # SUITE_ACCESS_GROUP_RADIO kommt NIE als setzbare Zeile vor:
  rtk grep -n '^SUITE_ACCESS_GROUP_RADIO' docs/runbooks/radio-cutover.md   # Erwartung: leer

  # Die zwölf Variablennamen aus §B stehen zeichengleich in .env.example:
  for v in SUITE_HOST_RADIO SUITE_ADMIN_GROUP_RADIO RADIO_AUSLEIH_SITZUNG_SECRET \
           RADIO_AUSLEIH_SITZUNG_STUNDEN RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN \
           RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE \
           RADIO_HISTORIE_PURGE RADIO_HISTORIE_MONATE RADIO_HISTORIE_ERSTLAUF_MINUTEN \
           SUITE_TRAEFIK_RULE SUITE_REDIRECT_RULE_RADIO_ADMIN; do
    rtk grep -q "$v" .env.example || echo "FEHLT in .env.example: $v"
  done
  # Erwartung: keine Ausgabe

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §B — die .env, die drei ⏸-Zeilen und der Alt-Host-Redirect"
  ```

---

### Aufgabe 6: §C Schritt 1–3 — Freeze, echter Snapshot, Volume sichern

**Wartet auf:** ⛔ **U4 / C.5** — ohne die Auskunft, wer das `radio-inventar`-Frontend ausliefert,
ist Schritt 1 **nicht ausführbar**: es bliebe ein Schreibweg offen, den niemand gestoppt hat, und
der Verlust wäre **stumm**. Dazu **E2** und **E3** als Werte.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitt `## §C`, Schritte 1–3)
- Test: keiner. Gegenlesung in Schritt 5.

**Schnittstellen:**
- Verbraucht: §0 (E2, E3, U4), §A Nr. 3 (Retention neutralisiert).
- Liefert die Protokoll-Namen, die alle folgenden Aufgaben zeichengleich benutzen:
  - **`<freeze_iso>`** — der ISO-Zeitstempel in UTC aus Schritt 1; ab dann der Cutoff **jeder**
    Vergleichsrechnung dieses Runbooks
  - **`radio-admin-snapshot.sqlite`** — der **eine** Name der Snapshot-Kopie, im
    Arbeitsverzeichnis des Hosts
  - **`$VOL`** (Alt-Volume von `radio-admin`, = E2)
  - **die drei wörtlichen Stopp-Befehle** — sie sind die Vorlage der Start-Befehle in §G

- [ ] **Schritt 1: Der Vorspann von §C und die Reihenfolge-Tabelle**

  ````markdown
  ## §C — Im Fenster: neun Schritte

  **Freeze → Snapshot → Volume sichern → Import → Parität + Stichproben → `.env` → `up -d` →
  Verifikation → Router.**

  Jeder Schritt: Befehl · Erwartung · **was ihn scheitern lässt und wie man es merkt.** Ergebnis
  danebenschreiben, nicht nur abhaken (`files-cutover.md:192-196`).

  | # | Schritt | Warum nicht früher | Warum nicht später |
  |---|---|---|---|
  | 1 | **Freeze** beider Alt-Apps (Schreibwege aus) | — | Jede Ausleihe oder Rückgabe **nach** dem Snapshot steht in einer Datei, die niemand mehr importiert. Der Verlust ist **stumm**: Parität, Zählungen und Health sind grün, die Zeile fehlt einfach |
  | 2 | **Echter Snapshot** per `.backup` | Ohne Freeze ist die Kopie ein Zwischenstand mitten in einem Schreibvorgang | Der Import darf **nie** gegen einen laufenden Alt-Stack laufen |
  | 3 | **Volume sichern** (SQLite-Kopie + `pg_dump` des Kiosk-Postgres) | Der Dump gehört zum eingefrorenen Stand, nicht zu einem späteren | ⚠️ Der Kiosk-Postgres hängt an **keiner** Sicherung, die dieses Repo kennt (`scripts/backup.sh:15-21` kennt `*.db` und `BLOB_DIR`). Fällt das Volume ohne Dump, ist die `AdminUser`-Zählung für immer weg |
  | 4 | **Import** in `radio.db` | Ohne Snapshot keine stabile Quelle; ohne den früheren Deploy (§A Nr. 1) kein Schema, in das geschrieben werden könnte | Der Import ist der langsamste Schritt; nach ihm folgen nur noch Prüfungen |
  | 5 | **Parität + feldweise Stichproben + R und Z** | Ohne Import nichts zu vergleichen | ⚠️ **Die Parität allein gibt die Freigabe nicht her** |
  | 6 | **`.env` scharf schalten** — ohne die drei ⏸-Zeilen | Vor dem Import stünden Boot-Prüfungen auf einer Datenlage, die es nicht gibt; und `SUITE_HOST_RADIO` **vor** dem Registry-Eintrag bricht den Start der **ganzen** Suite ab (§B.1) | — |
  | 7 | **`docker compose up -d --force-recreate suite`** | — | — |
  | 8 | **Verifikation** gegen den **Prüfcontainer** mit vorgetäuschtem `Host`-Kopf | — | Nach dem Umschwenk ist die Prüfung keine Vorprüfung mehr, sondern eine Nachricht über einen bereits sichtbaren Zustand |
  | 9 | **Router umschwenken:** Alt-Router zuerst weg, **dann** die drei ⏸-Zeilen, `up -d` | Nie zwei Router gleichzeitig; der Alt-Kiosk muss **zuerst** weg, sonst ist nicht deterministisch, wer gewinnt (`files-cutover.md:167-170`) | Ab hier läuft die Uhr für den Rückweg (§G) |

  **Was zwischen 8 und 9 ausdrücklich nicht passieren darf:** die HTTP-Grenze fällt **mit** dem
  Umschwenk, nicht davor. Deshalb ist Schritt 9 **ein** Schritt und nicht zwei.
  ````

- [ ] **Schritt 2: Schritt 1 — Freeze, mit Rücklesung und den drei wörtlichen Stopp-Befehlen**

  ````markdown
  ### Schritt 1 — Freeze

  ```bash
  date -u +%Y-%m-%dT%H:%M:%SZ            # → <freeze_iso>, ins Protokoll
  docker compose -f radio-admin/docker-compose.yml stop app
  # und im selben Handgriff der Kiosk. ⚠️ `--profile full-app` gehoert IN den stop-Befehl:
  # `backend` steht hinter `profiles: ["full-app"]` (radio-inventar/docker-compose.yml:26-27),
  # und ob eine Compose-Version das Profil beim namentlichen Aufruf selbst aktiviert, ist
  # versionsabhaengig. Ohne das Profil kann der Stopp ein No-op sein — und ein No-op sieht
  # wie ein Erfolg aus.
  docker compose -f radio-inventar/docker-compose.yml --profile full-app stop backend

  # ---- RUECKLESUNG. Der Freeze ist der einzige Schritt, dessen Wirkung man SOFORT
  #      pruefen kann und muss — sonst faellt sein Fehlfall erst in Schritt 5 auf.
  docker compose -f radio-admin/docker-compose.yml ps
  docker compose -f radio-inventar/docker-compose.yml --profile full-app ps
  # Erwartung: `app` und `backend` mit Status `exited`; `postgres` weiter `running`
  # — Schritt 3 braucht ihn fuer den pg_dump.

  # ---- Und der dritte Handgriff, der die U4-Luecke sichtbar macht:
  curl -si https://radio.iuk-ue.de/ | head -3
  # Erwartung: Verbindungsfehler oder 5xx. Eine BEDIENBARE Alt-Oberflaeche heisst:
  # der Auslieferungsweg aus U4 laeuft noch. Dann wird das Fenster ANGEHALTEN,
  # nicht fortgesetzt.
  ```

  `<freeze_iso>` → ____________________

  ⛔ **DIE DREI GESTOPPTEN DINGE SIND DIE LISTE, DIE §G WIEDER STARTET** — `radio-admin/app`,
  `radio-inventar/backend` **und** der Auslieferungsweg des Frontends (U4). **Der Stopp-Befehl
  jedes dieser drei gehört WÖRTLICH ins Protokoll**, und zwar hier:

  | # | Was | Stopp-Befehl, wörtlich |
  |---|---|---|
  | 1 | `radio-admin/app` | `docker compose -f radio-admin/docker-compose.yml stop app` |
  | 2 | `radio-inventar/backend` | `docker compose -f radio-inventar/docker-compose.yml --profile full-app stop backend` |
  | 3 | Auslieferungsweg des Frontends (**U4**) | ____________________ |

  ⛔ **Die Regel, die daraus folgt und die in §G noch einmal steht:** *der Stopp-Befehl aus dieser
  Tabelle ist die Vorlage des Start-Befehls in §G — Wort für Wort, nur `stop` gegen `start`
  getauscht.* Insbesondere wandert `--profile full-app` **mit**. Ein `start` ohne das Profil kann
  ein No-op sein, und ein No-op sieht im Rollback genauso aus wie ein Erfolg.

  **Erwartung:** beide Schreibwege sind zu. `radio.iuk-ue.de` ist ab hier nicht bedienbar — das ist
  der Beginn der angekündigten Auszeit, nicht ein Fehler.
  **Der ISO-Zeitstempel ist ab hier der Cutoff jeder Vergleichsrechnung** (Abfrage R, Abfrage Z).
  **Scheitert an:** einem noch laufenden zweiten Frontend-Prozess. ⚠️
  `radio-inventar/docker-compose.yml` führt nur `postgres` und `backend` (letzteres hinter einem
  Profil) — **wer das Frontend ausliefert, ist U4/C.5** und muss **vor** dem Freeze bekannt sein.
  **Wie man es merkt: an der Rücklesung oben, im selben Schritt.** ⚠️ **Ohne die Rücklesung fällt es
  erst in Schritt 5 auf**, also **nach** dem Import — und der Verlust selbst bleibt stumm.
  ````

- [ ] **Schritt 3: Schritt 2 — Echter Snapshot**

  ````markdown
  ### Schritt 2 — Echter Snapshot

  ```bash
  docker volume ls | grep -i radio-data            # → E2, ins Protokoll
  VOL=<die Zeile aus dem Befehl oben>
  docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
           sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
  ```

  `$VOL` (E2) → ____________________

  ⚠️ **`.backup`, nicht `cp`.** `radio-admin` läuft im WAL-Modus; eine WAL-Datenbank besteht aus
  **drei** Dateien, und ein `cp` verliert den Schwanz aller committeten Transaktionen —
  **paritätsgrün**, weil eine abgeschnittene Quelle mit sich selbst vollkommen einig ist.
  `.backup` ist die Hausform: `scripts/backup.sh:41-43` sichert **jede** `*.db` unter `DATA_DIR` mit
  genau diesem Befehl. **Diese eine Form gilt, in der Generalprobe wie im Fenster** — es gibt keine
  angebotene Alternative, die jemand von Hand nachbauen müsste.
  ⚠️ **`.backup` arbeitet gegen die LAUFENDE Datenbank** — genau dafür ist es da. Daraus folgt für
  die Generalprobe (§P): der Alt-Stack wird für einen Generalproben-Snapshot **NICHT** angehalten.
  Wer für einen Snapshot stoppt und danach wieder startet, hat die Alt-Anwendung um zwei Monate
  Historie gekürzt, mit einer **Erfolgszeile** im Log.

  **Erwartung:** eine Datei `radio-admin-snapshot.sqlite` mit plausibler Größe. Größe → ________
  **Scheitert an:** dem **deklarierten** statt dem echten Volume-Namen. Compose präfixt deklarierte
  Volumes mit dem Projektnamen (`radio-admin_radio-data`); ein `-v radio-data:/d` legt ein **neues,
  leeres** Volume an — laut, aber ein verbrannter Schritt im Fenster.
  **Wie man es merkt:** `unable to open database file` bzw. eine Snapshot-Datei von wenigen Kilobyte.

  ⚠️ **Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar:** leer und vorbaselinig
  — `.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`, `software_versions`;
  `loans`, `api_tokens` und `users` **fehlen ganz**. **Jede** Zahl kommt aus dem Snapshot, nie aus
  dieser Datei.

  **Und im selben Schritt die Zählungen gegen die Kopie**, die die Sollwerte setzen: **A1–A13
  vollständig** (§P) plus **Glied (1) und (2) der Zählkette**. Reihenfolge zwingend
  **Freeze → Zählung (1) → `.backup` → Zählung (2)**, weil nur (1)→(2) einen abgeschnittenen
  Snapshot findet. Zwei Abfragen sind **Abbruchbedingungen des Fensters**: **A6** (zehnstellig →
  **abgesagt, nicht angepasst**) und **A10/A11**.
  ````

- [ ] **Schritt 4: Schritt 3 — Volume sichern**

  ````markdown
  ### Schritt 3 — Volume sichern (Archiv)

  ```bash
  # radio-inventar: Werte ZUERST ablesen, dann dumpen (E3)
  docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
  docker volume ls | grep -i postgres_data

  docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
    pg_dump -U "<echter POSTGRES_USER>" -d radio_inventar --format=custom \
    > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
  ```

  `POSTGRES_USER` (E3) → ________ · Volume (E3) → ________ · Dump-Datei → ____________________

  **Erwartung:** ein Dump mit plausibler Größe, in der Archivablage.
  **Scheitert an:** übernommenen **Vorbelegungen** statt gelesenen Werten. `POSTGRES_USER` trägt nur
  einen `:-radio`-Default (`radio-inventar/docker-compose.yml:7`); nur `POSTGRES_DB:
  radio_inventar` ist hart gesetzt (`:10`).
  **Wie man es merkt:** `FATAL: role "radio" does not exist`.

  ⚠️ **Der Kiosk-Postgres fällt aus jeder Sicherung heraus, die dieses Repo kennt.** **Dieser Dump
  ist der einzige.** Er ist zugleich die Voraussetzung dafür, dass die `AdminUser`-Zählung überhaupt
  noch möglich ist — **ein gelöschtes Volume nimmt die Antwort mit**. Die **sechs**
  Postgres-Zählungen (P1–P6) sind **Abbau**-Schritte (§S), brauchen aber dieses Volume.
  ⚠️ **Sechs, nicht fünf.** P6 ist der Archiv-Dump selbst („Erst danach darf das Volume fallen");
  Spec 2 §4.5 Schritt 3 nennt an dieser Stelle „fünf (P1–P5)" und ist damit gegen §5.2.1, §5.2.3 und
  Erfüllungspunkt 29 falsch gezählt.

  **Dazu die Archivprobe:** beide Archivdateien werden **geöffnet** (§S) — der Schritt, den Spec 1
  nicht führt. Geöffnet am ______ durch ____________
  ````

- [ ] **Schritt 5: Gegenlesung und Commit**

  ```bash
  # Die drei Stopp-Befehle stehen als Tabelle, und U4 ist als Leerzeile markiert:
  rtk grep -n 'Stopp-Befehl, wörtlich' docs/runbooks/radio-cutover.md   # Erwartung: 1 Treffer
  rtk grep -c 'full-app stop backend' docs/runbooks/radio-cutover.md    # Erwartung: >= 2

  # <freeze_iso> wird in Schritt 1 erzeugt und danach nur noch benutzt:
  rtk grep -n 'freeze_iso' docs/runbooks/radio-cutover.md
  # Erwartung: der erste Treffer steht in Schritt 1 neben `date -u`

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §C Schritt 1-3 — Freeze mit Ruecklesung, .backup-Snapshot, Archiv"
  ```

---

### Aufgabe 7: §C Schritt 4–5 — Import, Parität, Feldstichproben, R und Z

**Wartet auf:**
- Spec 1 §2.8 / Spec 2 §1.5.3 — `scripts/import/radio.ts` (**committet, mit Test**; heute nicht
  vorhanden). Die Aufrufform ist gesetzt: **ein** positionales Argument, das Ziel steuert `DATA_DIR`.
- ⬜ **L6** — die genaue **Abschlusszeile** des Importers. Das Runbook prüft **Zeichenkette und
  Exit-Code**, nicht nur einen von beiden (Vorbild `portal-cutover.md:20`, `:33`: `parity green`).
- ⬜ **N3** — die tatsächliche Kennung des Suite-Prozesses (aus §A Nr. 12).
- ⬜ **N1** — hält der reguläre Stack `radio.db` dauerhaft offen?
- ⬜ **L13** — Containername (für die Container-ID-Protokollzeile).

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitt `## §C`, Schritte 4–5)
- Test: keiner. Gegenlesung in Schritt 5.

**Schnittstellen:**
- Verbraucht: `radio-admin-snapshot.sqlite` und `<freeze_iso>` aus Aufgabe 6; `<uid_gid_prozess>`
  aus Aufgabe 4 (§A Nr. 12).
- Liefert:
  - **`$VOL_SUITE`** — **eine** Protokollzeile für den Suite-Volume-Namen, die Schritt 4 Handgriff 3,
    Schritt 5 (a), Schritt 5 (d) und §D Nr. 4 **zeichengleich** benutzen
  - **`$IMP`** — das Wegwerf-`DATA_DIR` auf dem Host
  - **`<container_id_vorher>`** / **`<container_id_nachher>`** — die zwei Container-IDs, deren
    Gleichheit ein Stopp-Punkt ist
  - die Namen **Abfrage R** und **Abfrage Z**, deren Zahlen **einmal ermittelt und zweimal gelesen**
    werden (hier als Freigabe, in §S als Abbau-Sperre)

- [ ] **Schritt 1: Schritt 4 — der Vorspann und die vier Handgriffe**

  ````markdown
  ### Schritt 4 — Import

  Der Importer ist `scripts/import/radio.ts`, **committet, mit Test** — kein Handgriff am Server und
  kein nicht committetes Skript. Die Aufrufform ist die der Generalprobe: dasselbe Skript, dasselbe
  positionale Argument, ein **anderes `DATA_DIR` je Lauf.**
  **Wartet auf:** Spec 1 §2.8 — `scripts/import/radio.ts` (⬜ L6 für die Abschlusszeile).

  ⚠️ **`$DATA_DIR/radio.db` gibt es auf dem HOST nicht.** `DATA_DIR=/data` ist ein Wert **im
  Container** (`compose.yaml:79`); dort mountet `compose.yaml:99` das **benannte Volume**
  `suite_data` (`compose.yaml:252-254`), und ein benanntes Volume hat keinen vereinbarten Host-Pfad.
  Der Import dagegen läuft zwingend aus einem **Repo-Checkout auf dem Host** — das standalone-Image
  führt weder `scripts/` noch `tsx` (`portal-cutover.md:23-25`). Deshalb sind es **vier Handgriffe**
  und nicht zwei.

  ⛔ **Nicht `DATA_DIR=/data` auf dem Host.** Unprivilegiert scheitert `mkdirSync` auf `/` mit
  `EACCES` (laut, ein verbrannter Schritt); als `root` entsteht `/data/radio.db` **auf dem Host**,
  der Import läuft durch, und die Abschlusszeile meldet **Parität grün** — Parität vergleicht beide
  Arme durch **dasselbe** Handle und ist grün, egal wo die Datei liegt. Schritt 5 (a) läse dann
  dieselbe falsche Datei und bestätigte sie; alle vier Freigabeprüfungen wären grün, während
  Schritt 7 im Container eine **nagelneue leere** `radio.db` bekommt.

  ```bash
  # --- 0) Die Kennung, unter der der Prozess LAEUFT — aus §A Nr. 12 (⬜ N3), nicht aus
  #        dem Image. Massgeblich ist der `user:`-Schluessel des Compose-Service
  #        (compose.yaml:62, `user: ${SUITE_USER:-1001:1001}`), NICHT `USER nextjs`:
  #        `adduser --system --uid 1001 nextjs` setzt kein `-G nodejs` (Dockerfile:42-43),
  #        `USER nextjs` laeuft also als 1001:65533(nogroup) — so steht es woertlich im
  #        Docblock compose.yaml:47-61, und auf arm64 verlangt .env.example:252 sogar
  #        SUITE_USER=1001:1000. Wer die Image-Zahl nimmt, setzt eine Kennung, die von der
  #        der uebrigen Modul-Datenbanken ABWEICHT — und die Erwartung unten ist dann
  #        zwangslaeufig rot, ohne dass ein Fehler vorlaege.
  UID_APP=<uid aus §A Nr. 12>
  GID_APP=<gid aus §A Nr. 12>

  # --- 1) Volume-Namen ABLESEN, nicht raten. Ins Protokoll — DIESE EINE ZEILE gilt fuer
  #        Handgriff 3, Schritt 5 (a), Schritt 5 (d) und §D Nr. 4.
  docker volume ls | grep -i suite
  VOL_SUITE=<die Zeile aus dem Befehl oben>        # in Prod: suite_data

  # --- 1b) Die Container-ID VOR dem Dateitausch. Sie ist die linke Seite der Gegenprobe
  #         in Schritt 7 — eine UNVERAENDERTE ID dort ist ein Stopp-Punkt.
  docker compose ps -q suite      # → <container_id_vorher>. `-q` statt `--format`: eine
                                  # Go-Vorlage in `--format` nimmt nicht jede Compose-Version an,
                                  # und ein stiller Formatfehler koestet genau diese Gegenprobe.

  # --- 2) Import auf dem HOST, in ein WEGWERF-DATA_DIR.
  #        `data/files` mit anlegen: ein BIND-Mount erbt die Verzeichnisstruktur des
  #        Images NICHT — nur ein LEERES benanntes Volume tut das (Dockerfile:64-71
  #        schreibt die Regel aus). Deshalb der mkdir, nicht wegen einer Boot-Pruefung.
  IMP="$HOME/cutover-radio"
  rm -rf "$IMP" && mkdir -p "$IMP/data/files"
  DATA_DIR="$IMP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite
  echo "exit=$?"      # ⬜ L6: Zeichenkette UND Exit-Code, nicht nur einer von beiden

  # --- 3) Erst NACH gruener Paritaet ins Volume. Pfade ausgeschrieben, Loeschung und
  #        Eigentumsuebergabe IM Container. Keine Variable, die nirgends gesetzt ist.
  docker run --rm -v "$VOL_SUITE":/data -v "$IMP/data":/neu \
    -e UID_APP="$UID_APP" -e GID_APP="$GID_APP" alpine sh -c '
      rm -f /data/radio.db /data/radio.db-wal /data/radio.db-shm
      cp /neu/radio.db* /data/
      chown "$UID_APP:$GID_APP" /data/radio.db*
      ls -ln /data'
  ```

  `$VOL_SUITE` → ____________________ · `<container_id_vorher>` → ____________________
  Zählzeile des Importers (`Quelle: users=… software_versions=… devices=… device_events=… loans=…`)
  → ____________________
  Abschlusszeile des Importers → ____________________ · Exit-Code → ______
  ````

- [ ] **Schritt 2: Die Erwartungen, Fehlfälle und die N1-Zwischenlösung zu Schritt 4**

  ````markdown
  **Erwartung Handgriff 3:** `ls -ln /data` zeigt `radio.db` mit **derselben numerischen Kennung**
  wie die übrigen Modul-Datenbanken im Volume. Ausgabe → ____________________

  **Scheitert an:** einem **erfundenen** Volume-Namen — dann legt `docker run` ein neues, leeres
  Volume an, `ls -ln /data` zeigt **nur** `radio.db` und keine der sechs anderen
  Modul-Datenbanken. ⚠️ **Das ist das Erkennungsmerkmal**, und es ist der einzige billige: eine
  Zählung `0` in Schritt 5 (a) ist danach ein **Volume-Fehler, kein Datenbefund.**

  ⚠️ **Das `radio.db` im Volume MUSS vorher da sein und MUSS weg:** §A Nr. 1 hat
  `/api/health/radio` mit 200 beantwortet, und das heißt, `openModuleDatabase` hat die Datei bereits
  angelegt (`src/core/db/index.ts:12-22`). Die Löschung ist notwendig, nicht zeremoniell.

  ⚠️ **⬜ N1 — und der Handgriff, der ihn im Fenster überbrückt.** Handgriff 3 löscht `radio.db`
  samt `-wal`/`-shm` **im produktiven Volume**, während der reguläre Suite-Container läuft. Ob er
  die Datei zu diesem Zeitpunkt offen hält, ist **nicht belegt**: `migrateAllModules()` schließt ihr
  Handle (`src/core/bootstrap.ts:99-105`, `sqlite.close()` in `:103`), `checkModuleHealth` schließt
  im `finally` (`src/core/health/index.ts:13-15`) — der dritte Weg, die radio-Boot-Haken, ist
  ungebaut und damit nicht prüfbar. **Solange N1 offen ist, gilt die konservative Form:**

  ```bash
  docker compose stop suite      # VOR Handgriff 3
  # … Handgriff 3 …
  # danach weiter mit Schritt 6/7 (`up -d --force-recreate suite`)
  ```
  ⚠️ **Der Preis dieses Stopps gehört ins Protokoll:** der Container bedient für `radio` noch keine
  Domain, **aber er bedient sechs andere Module** — der Umschwenk ist damit für die Dauer dieses
  Handgriffs kein reiner radio-Vorgang mehr. **Das ist dieselbe Abwägung wie ⬜ L14 und gehört in
  dieselbe Ablesung.** Ist N1 mit „nein, kein dauerhaftes Handle" beantwortet, entfällt der Stopp.

  ⚠️ **Der `chown` ist keine Kür:** `Dockerfile:88` startet den Prozess als `USER nextjs`,
  `Dockerfile:72` übereignet den Mountpunkt (`RUN mkdir -p /data/files && chown nextjs:nodejs /data
  /data/files`). Eine root-eigene `radio.db` lässt die **Migrationen beim Boot** mit
  `SQLITE_CANTOPEN` scheitern — laut, im Container-Log, aber ein verbrannter Durchlauf.

  **Der Rückweg bei roter Parität ist die LEERE Ziel-DB** — hier stärker: bei rot wird Handgriff 3
  **gar nicht gefahren**, das Volume bleibt unangetastet, und der Rückweg ist `rm -rf "$IMP"`.

  ⚠️ **Die Zahlen aus Schritt 5 (a) gelten nur, wenn `VOL_SUITE` aus derselben Protokollzeile
  stammt, gegen die Handgriff 3 und Schritt 8 gefahren sind.** Drei verschiedene Ablesungen
  desselben Namens sind drei Gelegenheiten für drei verschiedene Volumes.

  Einfügereihenfolge `users`, `software_versions` → `devices` → `device_events` → `loans`, Spalten
  **namentlich**, `api_tokens` wandert **nicht** (die Tabelle existiert im Ziel nicht),
  `zugangscodes` ist **nicht Teil des Imports**.
  **Scheitert an:** der FK-Kante (A3) oder einem `device_events.source`, den das TS-Enum nicht kennt
  (A5). **Wie man es merkt:** harter Abbruch mit SQLITE-Constraint-Fehler. **Das ist der gute Fall.**
  ````

- [ ] **Schritt 3: Schritt 5 (a)–(c) — Zählungen und Feldstichproben**

  ````markdown
  ### Schritt 5 — Parität, Stichproben, Retention-Gegenprobe

  ⚠️ **Dieser Schritt ist der Grund, warum dieses Kapitel überhaupt lang ist. Die Parität allein
  gibt die Freigabe nicht her** (`CLAUDE.md`: „Paritätscheck beweist den Datenbank-Rundlauf, nicht
  die Richtigkeit der Feldzuordnung"). **Vier Prüfungen, alle vier Pflicht.**

  **(a) Die FÜNF Zählungen, paarweise gegen die Sollwerte aus Schritt 2 — nicht in der Summe.**
  ⚠️ **Zwei linke Seiten, nicht eine:** die Sollwerte aus Schritt 2 (die Snapshot-Kopie) **und** die
  **Zählzeile des Importers** aus Schritt 4 — Glied (3) der Zählkette aus §1.8:
  `Quelle: users=… software_versions=… devices=… device_events=… loans=…`. Ein Importer, der
  **weniger** Zeilen liest, als der Snapshot führt, schreibt dieselbe kleinere Zahl paritätsgrün ins
  Ziel; nur der Vergleich mit dieser Zeile fängt ihn.
  ⚠️ **Gelesen wird die Datei IM VOLUME** — `sqlite3` auf dem Host gegen `"$DATA_DIR/radio.db"`
  liest einen Pfad, den es auf dem Host **nicht gibt**. `$VOL_SUITE` ist **dieselbe
  Protokollzeile** wie in Schritt 4 Handgriff 1:

  ```bash
  for t in devices software_versions users device_events loans; do
    printf '%s\t' "$t"
    echo "select count(*) from $t;" | docker run --rm -i -v "$VOL_SUITE":/data alpine \
      sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  done
  # dazu, nur fuers Protokoll — Tabelle ohne Quellgegenstueck:
  echo "select 'zugangscodes', count(*) from zugangscodes;" | docker run --rm -i \
    -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'   # MUSS 0

  # Gegenprobe im selben Handgriff — eine `0` oben ist ZUERST ein Volume-Fehler:
  docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data
  # muss ALLE Modul-Datenbanken zeigen, nicht nur radio.db
  ```

  | Tabelle | Quelle (Schritt 2) | Ziel | gleich? |
  |---|---|---|---|
  | `devices` | ________ | ________ | ☐ |
  | `software_versions` | ________ | ________ | ☐ |
  | `users` | ________ | ________ | ☐ |
  | `device_events` | ________ | ________ | ☐ |
  | `loans` | ________ | ________ | ☐ |
  | `zugangscodes` | — (keine Quelle) | ________ | MUSS 0 |
  | `api_tokens` | ________ (nur Protokollzeile) | — (existiert im Ziel nicht) | — |

  ⚠️ **Mount OHNE `:ro`, `sqlite3 -readonly`, ⛔ kein `immutable=1`.** SQLite im WAL-Modus braucht
  zum **Lesen** eine beschreibbare `-shm`-Datei; auf einem `:ro`-Mount scheitert der Befehl dann mit
  „unable to open database file", **obwohl die Datenbank in Ordnung ist**. `immutable=1` bleibt der
  **Generalprobe** vorbehalten (dort hängt kein anderer Prozess an der Datei).
  ⛔ **Nicht die Sechser-Schleife** — `api_tokens` existiert im Ziel nicht, die Schleife ist **by
  construction rot** (`Error: no such table: api_tokens`). Dazu die Invarianten, der Index-Check und
  `zugangscode_id` im Ziel: die vollständige Liste steht in §P.

  **(b) Die feldweisen Stichproben** — **fünf** Paare bzw. Tripel, je eine Zeile, zeilengenau gegen
  die Snapshot-Kopie: `issi`↔`tei` · `created_at`↔`updated_at`↔`last_updated_at` ·
  `snapshot_call_sign`↔`borrower_name` · `alamos_integrated`↔`loanable` ·
  `serial_number`↔`hiorg_id`↔`opta`. Die `id`s werden **hier neu abgelesen**, nicht aus der
  Generalprobe übernommen. → ____________________

  **(c) Die Zeitstempel-Stichprobe:** der diskriminierende Wert (jüngste abgeschlossene Leihe) und
  der doppeldeutige (älteste), plus die vier Angaben der Retention-Kontrollgruppe.
  → ____________________
  ````

- [ ] **Schritt 4: Schritt 5 (d) — Abfrage R und Abfrage Z, beide ausgeschrieben**

  ````markdown
  **(d) Die Retention-Gegenprobe R und die Zeitstempel-Grenzprobe Z**, mit `<freeze_iso>` in
  **beiden** Armen.

  ⚠️ **`'now'` gehört hier NICHT hin.** Schritt 2 und Schritt 5 liegen Minuten auseinander, und eine
  Leihe auf der Zwei-Monats-Grenze wechselt in diesen Minuten die Seite — **ein falsches Rot mitten
  im Fenster**, dessen vorgeschriebener Handgriff „Import verwerfen" lautet. `<freeze_iso>` macht
  die Grenze unbeweglich.

  **Abfrage R:**
  ```bash
  # Quelle, Millisekunden — der Faktor 1000 steht absichtlich im SQL.
  sqlite3 radio-admin-snapshot.sqlite "
  select count(*) from loans
   where returned_at is not null
     and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

  # Ziel, Sekunden — derselbe Cutoff, ohne Faktor, gegen DIESELBE $VOL_SUITE-Protokollzeile.
  echo "select count(*) from loans
   where returned_at is not null
     and returned_at < strftime('%s','<freeze_iso>','-2 months');" \
  | docker run --rm -i -v "$VOL_SUITE":/data alpine \
      sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  ```
  > **Abfrage R** — Quelle: ________ · Ziel: ________ · gleich? ☐ ja ☐ nein

  * ⚠️ **Der Faktor 1000 steht im Quellarm absichtlich im SQL und NICHT im Zielarm.** Wer ihn im
    Quellarm weglässt, zählt **alle** zurückgegebenen Leihen und hält das für eine bestätigte
    Schätzung. Wer ihn im Zielarm hinzufügt, zählt null und hält das für „nichts betroffen".
  * **Abweichung bedeutet:** Ziel deutlich **höher** → der Faktor-1000-Fehler hat zugeschlagen, die
    Zeitstempel liegen im Jahr 1970, und der nächste Retention-Lauf löscht die komplette
    abgeschlossene Leihhistorie. Ziel **niedriger** → der Import hat Zeilen verloren.
  * ⛔ **Abbruchbedingung: Abweichung → kein Umschwenk.** Der Import wird verworfen, `radio.db`
    gelöscht, der Mapper korrigiert, der Import läuft neu gegen dieselbe Snapshot-Kopie.

  ⚠️ **Dies ist die LEITFASSUNG von Abfrage Z.** Dieselbe Abfrage steht dreimal im Runbook —
  hier (§C Schritt 5 (d)), in der Generalprobe (§P.7) und beim Abbau (§5.2). Die zehn Glieder sind
  in allen dreien **zeichengleich**; abweichen darf **allein** die Zugriffsform (Generalprobe:
  Bind-Pfad `$GP/data/radio.db`; Fenster und Abbau: `docker run … -v "$VOL_SUITE":/data`). **Wer
  hier eine Zeile ändert, ändert sie in allen dreien** — sonst probt die Generalprobe eine andere
  Abfrage, als die zwei ⛔-Sperren im Fenster und beim Abbau fahren.

  **Abfrage Z — zehn Zeilen, und alle zehn müssen `0` sein:**
  ```bash
  echo "
  select 'loans.returned_at',        count(*) from loans
     where returned_at is not null and (returned_at < 946684800 or returned_at > 4000000000)
  union all
  select 'loans.borrowed_at',        count(*) from loans
     where borrowed_at  < 946684800 or borrowed_at  > 4000000000
  union all
  select 'loans.created_at',         count(*) from loans
     where created_at   < 946684800 or created_at   > 4000000000
  union all
  select 'loans.updated_at',         count(*) from loans
     where updated_at   < 946684800 or updated_at   > 4000000000
  union all
  select 'devices.created_at',       count(*) from devices
     where created_at   < 946684800 or created_at   > 4000000000
  union all
  select 'devices.updated_at',       count(*) from devices
     where updated_at   < 946684800 or updated_at   > 4000000000
  union all
  select 'software_versions.created_at', count(*) from software_versions
     where created_at   < 946684800 or created_at   > 4000000000
  union all
  select 'users.last_seen_at',       count(*) from users
     where last_seen_at < 946684800 or last_seen_at > 4000000000
  union all
  select 'device_events.changed_at', count(*) from device_events
     where changed_at   < 946684800 or changed_at   > 4000000000
  union all
  select 'devices.last_updated_at (Formatprobe)', count(*) from devices
     where last_updated_at is not null
       and last_updated_at not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';" \
  | docker run --rm -i -v "$VOL_SUITE":/data alpine \
      sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  ```
  > Z — zehn Zeilen, jede einzeln eintragen (nicht „alles 0"):
  > loans.returned_at ____ · loans.borrowed_at ____ · loans.created_at ____ ·
  > loans.updated_at ____ · devices.created_at ____ · devices.updated_at ____ ·
  > software_versions.created_at ____ · users.last_seen_at ____ ·
  > device_events.changed_at ____ · devices.last_updated_at (Formatprobe) ____

  * `946684800` = 2000-01-01T00:00:00Z, `4000000000` = 2096-10-02T07:06:40Z.
  * ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
    Millisekunden-Quelle (Jahr 1970), `> 4000000000` fängt die **Gegenrichtung** — rohe
    Millisekunden, die ungeteilt in einer Sekundenspalte landen (Jahr 57000).
  * ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
    Spalte mit Typwechsel (`integer` ms → `text YYYY-MM-DD`); für sie ist die Grenzprobe eine
    **Formatprobe** und sagt nichts über die **Zone**.
    ⚠️ **„Alle zehn", nicht „alle drei"** — die Erfüllungsliste von Spec 2 nennt an dieser Stelle
    drei, das SQL führt zehn Glieder. Eine Prüfliste, deren Kopf eine andere Zahl nennt als ihr
    Rumpf, wird unter Zeitdruck gekürzt.

  **Die Zahlen aus R und Z werden EINMAL ermittelt und ZWEIMAL gelesen:** hier als Freigabe, in §S
  als Abbau-Sperre. **Dieselbe Protokollzeile.**
  ````

- [ ] **Schritt 5: Gegenlesung und Commit**

  ```bash
  # Abfrage Z hat zehn `union all`-Glieder — gezählt NUR in DIESER Fassung (§C Schritt 5 (d)).
  # Über die ganze Datei ist die Zahl ohne Aussage: Z steht dreimal im Runbook (§P.7, §C, §5.2),
  # und A1, A11, §Z.1 sowie §5.2 Abfrage A führen `union all` ebenfalls:
  sed -n '/^\*\*Abfrage Z — zehn Zeilen/,/^> Z — zehn Zeilen/p' docs/runbooks/radio-cutover.md \
    | grep -c 'union all'                                  # Erwartung: 9 (zehn Glieder)
  # Der Kopf nennt dieselbe Zahl wie der Rumpf — nur die Fassung in §C, deshalb der volle Wortlaut:
  rtk grep -c 'und alle zehn müssen' docs/runbooks/radio-cutover.md   # Erwartung: 1 (§C)

  # Nacktes sqlite3 gegen $DATA_DIR/radio.db: genau EIN Treffer, und er ist namentlich
  # bekannt — die Zeile „Generalprobe" der Lauf-Tabelle in §L.3. Dort ist `DATA_DIR` ein
  # BIND-Pfad ($GP/data, §3.1.2, wie §1.8 Glied (4)), die Form ist deshalb erlaubt und
  # ausdrücklich vorgeschrieben.
  # ⚠️ §L.2 VERBIETET dieselbe Form für den Host — aber im Fließtext („`sqlite3` auf dem
  # HOST gegen `"$DATA_DIR/radio.db"`"), NICHT in der Befehlsform. Das ⛔ zählt hier deshalb
  # nicht mit, obwohl §L zwei Stellen über diese Form spricht:
  rtk grep -n 'sqlite3 -readonly "\$DATA_DIR' docs/runbooks/radio-cutover.md
  # Erwartung: genau EIN Treffer (§L.3, Zeile Generalprobe). Ein ZWEITER Treffer ist der Fund,
  # den diese Zeile sucht; „keine Ausgabe" wäre die falsche Erwartung.

  # $VOL_SUITE wird an genau ZWEI Stellen GESETZT, beide namentlich: §C Schritt 4 Handgriff 1
  # (im Fenster) und §5.2 (die Abbau-Sitzung Wochen später, neue Shell — dort MUSS derselbe
  # Name herauskommen):
  rtk grep -n 'VOL_SUITE=' docs/runbooks/radio-cutover.md
  # Erwartung: 2 Treffer — §C Schritt 4 Handgriff 1 und §5.2, beide namentlich

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §C Schritt 4-5 — Import in vier Handgriffen, Paritaet, R und Z"
  ```

---

### Aufgabe 8: §C Schritt 6–9 — `.env` scharf, `up -d`, Prüfcontainer, Router

**Wartet auf:**
- ⬜ **L13** (Containername + Loopback-Port) und ⬜ **L14** (darf der Prüfcontainer parallel booten)
  — ⛔ **ohne beides ist Schritt 8 nicht ausführbar.**
- ⬜ **L7** (Statuscode und `Location` der `/admin`-Weiterleitung), ⬜ **L8** (Sollwert von
  `GET /m/radio` auf dem Portal-Host), ⬜ **L10** (die Zeichenkette der Ausleih-Fläche),
  ⬜ **L5** (nur der **Wert** von `revision`, aus §A Nr. 1).
- ⬜ **N2** (Compose ausgerollt) und **U4** (die Router-Regel aus §A Nr. 13).

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitt `## §C`, Schritte 6–9)
- Test: keiner. Gegenlesung in Schritt 5.

**Schnittstellen:**
- Verbraucht: die drei ⏸-Zeilen aus Aufgabe 5; `$VOL_SUITE` und `<container_id_vorher>` aus
  Aufgabe 7; `<revision_soll>`, `<image_digest_soll>`, `<router_regel_heute>` aus Aufgabe 4.
- Liefert:
  - **`<umschwenk_iso>`** und **`<umschwenk_epoch_sekunden>`** — der Nullpunkt der Ein-Stunden-Frist
    **und** das Filterargument des Nachtrags in §G
  - **`<container_id_nachher>`**
  - den Prüfcontainer-Namen **`radio-fenster`** und die Env-Zeile
    **`SUITE_HOST_RADIO=localhost,radio.iuk-ue.de`**

- [ ] **Schritt 1: Schritt 6 und Schritt 7**

  ````markdown
  ### Schritt 6 — `.env` scharf schalten, ohne die drei Router-Zeilen

  Alle Zeilen aus §B **außer** den drei mit ⏸.

  **Scheitert an:** `SUITE_ACCESS_GROUP_RADIO=` (leer statt entfernt) → **Startabbruch** in
  Schritt 7.
  **Wie man es merkt:** `up -d` läuft, der Container startet nicht, und die Meldung ist
  selbsterklärend. → ____________________

  ### Schritt 7 — `up -d`

  ```bash
  docker compose pull && docker compose up -d --force-recreate suite
  docker compose ps -q suite      # → <container_id_nachher>, gegen <container_id_vorher>
  docker compose images suite                              # Digest ins Protokoll — GEGEN §A Nr. 1
  docker compose logs --since 2m suite | head -1           # die ROHZEILE ins Protokoll
  docker compose logs --since 2m suite | grep -i 'radio:'
  ```

  `<container_id_nachher>` → ____________________ · Digest → ____________________
  Rohzeile des Logs, ungefiltert → ____________________

  ⛔ **`--force-recreate suite`, und die Container-ID wird verglichen.** Schritt 4 Handgriff 3 hat
  die Datei im Volume **ersetzt**; läuft danach derselbe Prozess weiter, bedient er den gelöschten
  Inode. Der Fehlfall ist vollständig grün: `/api/health/radio` antwortet 200 (Nr. 3), die fünf
  Zählungen **gegen das Volume** stimmen (Nr. 4) — und die Oberfläche zeigt **null Geräte**.
  **`<container_id_nachher>` gleich `<container_id_vorher>` ist ein Stopp-Punkt**, kein Hinweis.

  ⚠️ **`docker compose pull` holt, was in der Registry gerade unter dem verwendeten Tag steht** —
  das kann ein **anderes** Image sein als das, gegen das die Generalprobe lief und das §A Nr. 1
  geprüft hat. Deshalb der Digest, und er wird **verglichen**: gleich `<image_digest_soll>` →
  weiter; **abweichend → Stopp-Punkt, kein Hinweis.** Wer den Vergleich nicht führen will, fährt
  Schritt 7 mit **festgenageltem** Digest statt mit dem Tag.

  ⚠️ **Das Muster steht OHNE `^`.** Unter `docker compose logs` trägt jede Zeile den Servicenamen
  als Präfix (`suite  | radio: …`), `^radio:` trifft dann **nichts**, und **leere Ausgabe liest sich
  als „keine Warnung", also grün.** Eine Stopp-Bedingung, die bei falschem Muster still bestanden
  wird, ist keine. Deshalb steht die erste **Rohzeile ungefiltert** im Protokoll — damit die
  Präfixform aktenkundig ist und der nächste Cutover sie nicht wieder raten muss.

  **Erwartung:** genau **eine** `radio:`-Zeile, und sie ist eine **`info`**: „Retention
  abgeschaltet" (die Folge von `RADIO_HISTORIE_PURGE=0`). **Keine** `radio:`-**Warnung**.
  **Warum die Unterscheidung trägt:** `warn` = **Stopp**, `info` = **Zustand**. Wäre die
  Retention-Zeile ein `warn`, träte der vorgeschriebene Cutover-Zustand seine eigene
  Stopp-Bedingung aus.

  **Erwartete Warnungen, die hier trotzdem erscheinen können und protokolliert werden:** „`devices`
  ist leer" (nach dem Import darf sie **nicht** kommen — kommt sie doch, ist `DATA_DIR` vertippt
  oder das Volume nicht gemountet) und „`radio.db` wurde neu angelegt" (dieselbe Familie, eine Stufe
  früher — nach dem Import ein **Stopp**).

  ⚠️ **Das dritte erwartete Fehlbild: der Container kommt gar nicht hoch, mit `SQLITE_CANTOPEN` beim
  Migrationslauf.** **Das ist ein Eigentumsfehler aus Schritt 4 Handgriff 3, keine `.env`-Frage.**
  **Wie man es merkt und behebt:** `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data` —
  trägt `radio.db` eine andere numerische Kennung als die übrigen Modul-Datenbanken, wird
  Handgriff 3 mit dem `chown` nachgeholt, **und zwar gegen die Kennung aus §A Nr. 12 (⬜ N3), nicht
  gegen die aus dem Image.** Die `.env` wird dafür **nicht** durchsucht.
  ````

- [ ] **Schritt 2: Schritt 8 — der Prüfcontainer, mit ZWEI Hosts in `SUITE_HOST_RADIO`**

  ````markdown
  ### Schritt 8 — Verifikation gegen den Prüfcontainer

  ⚠️ **Ohne Traefik-Labels, und der Host muss vorgetäuscht werden.** Der Container hängt an keinem
  Router; erreicht wird er über Loopback und Port. **Ohne den `Host`-Kopf läuft jede Anfrage auf den
  Portal-Fallback und prüft `radio` überhaupt nicht.**

  ```bash
  docker run --rm -d --name radio-fenster \
    --user "<uid_gid_prozess aus §A Nr. 12>" \
    -p 127.0.0.1:<L13-Port>:3000 \
    -v "$VOL_SUITE":/data \
    -e DATA_DIR=/data \
    -e SUITE_HOST_RADIO=localhost,radio.iuk-ue.de \
    -e SUITE_ADMIN_GROUP_RADIO=<E1> \
    -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
    -e RADIO_HISTORIE_PURGE=0 \
    -e AUTH_SECRET="$(openssl rand -hex 32)" \
    -e AUTH_URL=http://localhost:<L13-Port> \
    -e AUTH_TRUST_HOST=true \
    "$IMG"
  sleep 15
  docker logs radio-fenster 2>&1 | tail -30
  ```

  ⛔ **`SUITE_HOST_RADIO` trägt hier ZWEI Werte, durch Komma getrennt — und das ist keine
  Bequemlichkeit, sondern die Bedingung dafür, dass dieser Schritt überhaupt `radio` misst.**
  `moduleForHost` vergleicht **exakt** gegen `prodHostsFor(m, env)`
  (`src/core/registry.ts:225-232`). Mit `SUITE_HOST_RADIO=localhost` allein beansprucht `radio`
  genau den Host `localhost` — der Kopf `Host: radio.iuk-ue.de` trifft **kein Modul** und fällt auf
  das **Portal** zurück (`src/core/routing.ts:69-73`, `const mod = moduleForHost(host) ??
  getModule("portal")`). Die kopfgestützten Zeilen unten prüften dann den **Portal-Login**, nicht
  `radio` — und zwei davon (der 3xx auf `/admin`, das Nicht-Ausliefern von `/sw.js` auf fremdem
  Host) wären **grün, ohne geprüft worden zu sein.**
  **Belegt, dass zwei Werte zulässig sind:** `envHostsFor` splittet auf `,`
  (`src/core/hosts.ts:39-46`), und `validateHostConfig` hat gegen beide Werte nichts — kein `/`,
  kein `:`, keine Doppelvergabe (`src/core/hosts.ts:65-99`). **Wer diese Zeile auf einen Wert
  „vereinfacht", macht sechs der sieben Prüfungen unten bedeutungslos.**
  *Alternative, gleichwertig und ausdrücklich zulässig:* zwei getrennte `docker run` mit je einem
  Wert — Stufe 1 (`Host:`-Kopf) und Stufe 3 (`localhost` im Browser) getrennt fahren.

  ⛔ **`AUTH_DEV_LOGIN` wird hier NICHT gesetzt.** In der Generalprobe hängt der Dev-Login an einem
  **Wegwerf**-Bestand, hier am **produktiven** Volume — ein Container mit `AUTH_DEV_LOGIN=true` und
  einem echten Bestand samt Ausleihernamen. Alle Prüfungen dieses Schrittes sind kopfgestützt; der
  eine Zweig, der eine echte Anmeldung bräuchte, ist die angemeldete Negativprobe der Generalprobe.
  **`AUTH_SECRET` wird frisch erzeugt, nie der Prod-Wert.**

  ⚠️ **Der Textriegel „die `docker run`-Zeile enthält die Zeichenkette `suite_data` nicht" gilt für
  die GENERALPROBE, nicht hier** — hier ist `suite_data` das **Prüfobjekt**. Wer den Riegel ohne
  seinen Geltungsbereich zitiert, macht diesen Schritt unausführbar.
  ⚠️ **⬜ L14:** ob dieser Container **parallel** zum Schritt-7-Stack booten darf. Ist die Antwort
  nein, wird der Schritt-7-Stack für die Dauer von Schritt 8 gestoppt — zulässig, weil er für
  `radio` noch keine Domain bedient, **aber er bedient sechs andere Module**. **Deshalb ist L14 vor
  der Fensterplanung abzulesen, nicht darin.**

  ```bash
  B=http://127.0.0.1:<L13-Port>
  H='Host: radio.iuk-ue.de'
  curl -si -H "$H" "$B/"                        | head -5   # Ausleihe, 200
  curl -s  -H "$H" "$B/" | grep -c '<L10-Zeichenkette>'      # MUSS >= 1 — Portal-Fallback-Probe
  curl -si -H "$H" "$B/admin"                   | grep -iE '^HTTP/|^location:'   # Seite: 3xx → Login
  curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"     # Handler: 404
  curl -s  -H "$H" "$B/api/health/radio"
  curl -si -H "$H" "$B/sw.js"                   | head -5
  curl -si -H 'Host: iuk-ue.de' "$B/m/radio"    | head -3   # ⬜ L8
  docker stop radio-fenster                                  # --rm entfernt ihn dabei
  ```

  ⚠️ **Die zweite Zeile ist neu und sie ist die wichtigste.** Der Portal-Fallback ist genau dort
  still, wo er am teuersten ist: Portal und Ausleihe antworten **beide** 200. Nur der **Body**
  unterscheidet sie. **⬜ L10** liefert die Zeichenkette aus dem Ausleih-Rahmen, die im Portal-HTML
  **nicht** vorkommt — eine erfundene Zeichenkette wäre ein Test, der grün ist, weil er nichts
  trifft.

  **Erwartung:** Ausleihe **200** und die L10-Zeichenkette **≥ 1** · Health **200** mit
  `"module":"radio"` **und** `revision` = `<revision_soll>` aus §A Nr. 1 · `/sw.js` mit
  `content-type: text/javascript` · `/admin/geraete/export` **404**.
  Ausgaben → ____________________

  ⚠️ **Der `/admin`-Riegel hat ZWEI Ausgänge, und sie zu verwechseln ist die Regression, die dieses
  Runbook gerade verhindern soll:**

  * **Seiten und Server Actions** rufen `requireRadioAdmin()`; das endet für einen **anonymen**
    Abruf in einer **Weiterleitung (3xx) mit `location:` auf den Login** — der genaue Code ist
    **⬜ L7**, protokolliert wird der **vollständige** Wert. Ein **404** hier hieße: die Seite ruft
    den Riegel gar nicht.
  * **Route Handler unter `admin/`** bauen ihre Antwort selbst → **404, nie 403 und nie ein
    Login-Umweg.** Ein 403 machte den Bestand an Verwaltungspfaden aufzählbar.
  * **Der „angemeldet, aber nicht in der Gruppe"-Zweig ist mit `curl` gar nicht erreichbar** — er
    braucht eine echte Sitzung und ist die angemeldete Negativprobe der Generalprobe.

  **Was hier strukturell NICHT prüfbar ist** und deshalb in §D wandert: der Redirect vom Alt-Host ·
  der **Login-Rückweg** · der alte Service Worker · die gescannten QR-Wege · Cloudflare · TLS.
  ````

- [ ] **Schritt 3: Schritt 9 — Router umschwenken, mit den zwei Zeitstempeln**

  ````markdown
  ### Schritt 9 — Router umschwenken

  **In dieser Reihenfolge, und beide Domains im selben Handgriff:**

  1. **Alt-Router zuerst weg — gegen `<router_regel_heute>` aus §A Nr. 13, nicht gegen „die
     Labels".** `radio.iuk-ue.de` verliert seine heutige Router-Regel; **welcher Handgriff das ist,
     steht wörtlich in dieser Protokollzeile** (samt dem Handgriff, der sie zurückstellt).
     ⚠️ **In den eingecheckten Alt-Compose-Dateien gibt es keine Traefik-Labels** — beide
     veröffentlichen nur `ports:`; wer hier „Labels entfernen" liest und danach sucht, sucht in der
     falschen Datei. Nie zwei Router gleichzeitig auf derselben Domain — welcher gewinnt, ist nicht
     deterministisch (`files-cutover.md:167-170`).
  2. **Die drei ⏸-Zeilen setzen — in EINER Änderung:** `SUITE_HOST_RADIO`, die
     `SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`. **Einkommentieren, nicht
     neu tippen.**
  3. ```bash
     docker compose up -d
     date -u +%Y-%m-%dT%H:%M:%SZ    # → <umschwenk_iso>, ins Protokoll
     date -u +%s                    # → <umschwenk_epoch_sekunden>, ins Protokoll
     docker compose config | grep -A2 radio-admin-alt   # ins Protokoll, GEGEN §A Nr. 14
     ```

  `<umschwenk_iso>` → ____________________ · `<umschwenk_epoch_sekunden>` → ____________________

  ⛔ **Die zwei Zeitstempel sind Pflicht, nicht Zierrat**, und sie werden hier erzeugt, weil es
  später keine Gelegenheit mehr gibt: `<umschwenk_iso>` ist der **Nullpunkt der Ein-Stunden-Frist**
  aus §G, und `<umschwenk_epoch_sekunden>` ist das **Filterargument** des Bergungsbefehls in §G. Ohne
  sie ist der Nachtrag im Rollback nicht ausführbar — man trägt dann entweder gar nichts oder alles
  nach. Sie spiegeln `<freeze_iso>` aus Schritt 1.

  ⚠️ **Die dritte Zeile vergleicht gegen §A Nr. 14.** Trifft `grep -A2 radio-admin-alt` **nichts**,
  ist die `compose.yaml` auf dem Server nicht die aus dem Repo — dann hat
  `SUITE_REDIRECT_RULE_RADIO_ADMIN` nichts zu parametrisieren, und `radio-admin.iuk-ue.de`
  antwortet nach dem Umschwenk mit **gar nichts**. Das ist ⬜ N2, und es ist **kein** Handgriff für
  dieses Fenster: `scripts/deploy.sh:84-105` diffed `compose.yaml` byteweise und bricht ab.

  **Ab hier läuft die Uhr:** der Rückweg ist ab dem **ersten fachlichen Schreibvorgang** in
  `radio.db` kein Routing-Vorgang mehr (§G).
  ````

- [ ] **Schritt 4: Gegenlesung und Commit**

  ```bash
  # Der Prüfcontainer trägt beide Hosts, und AUTH_DEV_LOGIN kommt nicht vor:
  rtk grep -n 'SUITE_HOST_RADIO=localhost,radio.iuk-ue.de' docs/runbooks/radio-cutover.md
  rtk grep -n 'AUTH_DEV_LOGIN' docs/runbooks/radio-cutover.md
  # Erwartung: nur in der Begründung "wird hier NICHT gesetzt", nie als `-e`-Zeile

  # Die zwei Zeitstempel werden in Schritt 9 erzeugt:
  rtk grep -c 'umschwenk_iso\|umschwenk_epoch_sekunden' docs/runbooks/radio-cutover.md
  # Erwartung: >= 4 (je zweimal: Erzeugung und Protokollzeile)

  # Kein `^radio:` im ganzen Runbook:
  rtk grep -n "grep -i '\^radio:'" docs/runbooks/radio-cutover.md    # Erwartung: leer

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §C Schritt 6-9 — Pruefcontainer mit beiden Hosts, Umschwenk mit Zeitstempel"
  ```

---

### Aufgabe 9: §D + §E — die Abnahme (sechzehn Punkte) und der Service Worker

**Wartet auf:** ⬜ **L5** (Wert von `revision`, aus §A Nr. 1) · ⬜ **L7** · ⬜ **L10** ·
⬜ **L11** · ⬜ **L12** · ⬜ **N5** (Env des Backup-Cron) · ⬜ **N6** (Edge-Proxy/Entrypoints) ·
**E7** (Traefik-Containername) · **E8** (die namentlich benannte Person) · **E6** (Umfang des
SW-Handgriffs).

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitte `## §D` und `## §E`)
- Test: keiner. Gegenlesung in Schritt 5.

**Schnittstellen:**
- Verbraucht: `$VOL_SUITE` (Aufgabe 7), `<revision_soll>` (Aufgabe 4), die Zahlen aus R und Z
  (Aufgabe 7).
- Liefert:
  - die Numerierung **§D Nr. 1–16**, auf die §H und §F zeichengleich verweisen
  - **§D Nr. 14** als der eine Punkt, der `RADIO_HISTORIE_PURGE=0` entfernt — **erst nach** R und Z

- [ ] **Schritt 1: §D Nr. 1–6**

  ````markdown
  ## §D — Abnahme nach dem Umschwenk

  **Kein Punkt ist durch einen Statuscode allein erfüllt, und keiner durch eine Erwartung.** Ergebnis
  danebenschreiben, nicht nur abhaken (`files-cutover.md:192-196`).

  **Die Domain antwortet — und es ist nicht das Portal**

  - [ ] **1. Die Ausleihe antwortet, und es ist nicht das Portal.**
        ```bash
        curl -si https://radio.iuk-ue.de/ | head -20
        curl -s  https://radio.iuk-ue.de/ | grep -c '<L10-Zeichenkette>'   # MUSS >= 1
        ```
        **Erwartung:** HTTP 200 **und** im Body eine Zeichenkette, die es nur auf der
        Ausleih-Fläche gibt (**⬜ L10**).
        ⚠️ **`-si`, nicht `-sI`** — ein HEAD hat keinen Body und prüft damit nichts
        (`docs/runbooks/suite-update-webfinger.md:220`). Portal und Ausleihe antworten **beide**
        200; nur der Body unterscheidet sie. → ____________________

  - [ ] **2. Keine toten `localtest.me`-Links.**
        ```bash
        curl -si https://radio.iuk-ue.de/ | grep localtest.me       # muss LEER sein
        ```
        ⚠️ **Für `/admin` ist diese Zeile NICHT verwendbar**, und das ist der Grund: anonym
        antwortet `/admin` mit einer **Weiterleitung in den Login** (Nr. 5), also mit einem 3xx
        **ohne verwertbaren Rumpf**. Ein `grep` darauf ist **strukturell leer** und liest sich als
        grün — unabhängig davon, ob irgendwo ein `localtest.me`-Link steht. **Und die
        Verwaltungsfläche ist die einzige, die Navigationslinks in Menge trägt.** Deshalb wandert
        die zweite Hälfte dieser Probe nach **Nr. 10**: dieselbe Person, dieselbe **angemeldete**
        Sitzung, Seitenquelltext aus dem Browser gespeichert, dann `grep localtest.me`.
        `/` → ____________________ · `/admin` (aus Nr. 10) → ____________________

  - [ ] **3. Health nennt das Modul und die Revision.**
        ```bash
        curl -s https://radio.iuk-ue.de/api/health/radio
        ```
        **Erwartung:** 200, `"module":"radio"`, `revision` = `<revision_soll>` aus §A Nr. 1.
        Die Feldbedeutungen sind belegt, nicht offen: `src/core/health/index.ts:4-15` (`module` =
        Modulname `:10`, `status:"ok"` erst nach `openModuleDatabase` + `SELECT 1` `:8-9`) und
        `src/app/api/health/[modul]/route.ts:23-26` (`revision`). → ____________________
        ⚠️ **Nie `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}`
        ohne Modul und ohne Datenbank; `radio.iuk-ue.de/api/health` antwortet nach dem Cutover
        weiter `ok`, **ohne etwas über radio zu sagen**.
        ⚠️ **Und Health beweist weniger als der Name:** `openModuleDatabase` legt Verzeichnis und
        Datei stumm an (`src/core/db/index.ts:12-22`) — ein vertipptes `DATA_DIR` oder ein nicht
        gemountetes Volume ergibt eine **nagelneue, leere** `radio.db`: Health grün, null Geräte.
        **Deshalb Nr. 4.**

  - [ ] **4. Der zählende Check ersetzt `status:"ok"`.** Die **fünf** Zählungen aus §C Schritt 5 (a)
        **noch einmal**, paarweise gegen die Sollwerte aus Schritt 2 — dieselbe Zahl vorher und
        nachher (`lagerbuch-cutover.md:452`, `:544`). Gelesen wird mit der `docker run`-Form gegen
        **dieselbe** `$VOL_SUITE`-Protokollzeile, **nicht** mit nacktem
        `sqlite3 "$DATA_DIR/radio.db"`: diesen Pfad gibt es auf dem Host nicht. Eine `0` heißt hier
        **zuerst „falsches Volume"**, nicht „keine Daten". → ____________________
        ⚠️ **Was diese Zählung beweist, ist die Datei im Volume — nicht die Sicht des laufenden
        Containers.** Ist `DATA_DIR` im **Container** vertippt, zeigt das Volume weiter die
        importierten Zahlen, während der Container eine leere `radio.db` an einem anderen Pfad
        bedient. Was **die Sicht des Containers** beweist, sind **vier** andere Dinge: die zwei
        Log-Zeilen aus §C Schritt 7 („`devices` ist leer" / „`radio.db` wurde neu angelegt" — nach
        dem Import **beide** ein Stopp), das `revision`-Feld aus Nr. 3, der Body aus Nr. 1 — **und
        die geänderte Container-ID aus §C Schritt 7.**

  - [ ] **5. `/admin` riegelt ab — mit ZWEI verschiedenen Ausgängen — und `/sw.js` liefert den
        Abräum-Worker.**
        ```bash
        curl -si https://radio.iuk-ue.de/admin | head -5
        #   erwartet: 3xx + location: …/login?…   (Seite) — Code und voller Wert: ⬜ L7
        #   ein 404 hier heisst: die Seite ruft den Riegel nicht.
        curl -si https://radio.iuk-ue.de/admin/geraete/export | head -5
        #   erwartet: 404. Nie 403 (macht Verwaltungspfade aufzaehlbar),
        #   nie ein Login-Umweg (Route Handler bauen ihre Antwort selbst).
        curl -si https://radio.iuk-ue.de/sw.js | head -5
        ```
        **Erwartung `/sw.js`:** `content-type: text/javascript; charset=utf-8`,
        `cache-control: no-cache`, im Body `self.registration.unregister()`.
        **Kommt hier HTML oder Portal-Inhalt, greift der Rewrite nicht** — also ist
        `SUITE_HOST_RADIO` falsch gesetzt. Derselbe stille Fall wie Nr. 1, nur mit schärferer
        Ausgabe. → ____________________
        **Wartet auf:** Spec 1 §7.1.3 — `src/app/m/radio/sw.js/route.ts`.

  - [ ] **6. Kein radio-Manifest auf einem fremden Host.**
        ```bash
        curl -si https://iuk-ue.de/manifest.webmanifest | head -20
        ```
        **Erwartung: kein radio-Manifest.** Die Prüfzeile ist zeichengleich aus
        `lagerbuch-cutover.md:432` übernommen (der ausführbare Befehl in `:236`). Der Fehlfall, den
        sie fängt: ein Manifest oder Icon an der **Wurzel** statt unter `src/app/m/radio/` bewürbe
        **jeden** Suite-Host als radio-PWA — alle Suite-Hosts hängen an **einem** Traefik-Router auf
        **einem** Container (`compose.yaml:146-155`).
        ⚠️ **`radio` baut ausdrücklich KEINE PWA** — es gibt gar kein radio-Manifest, das hier
        auftauchen dürfte. Die Prüfung bleibt trotzdem Pflicht: **sie prüft nicht eine Zusage,
        sondern deren Verletzung.** Was `radio.iuk-ue.de/manifest.webmanifest` liefert: **⬜ L11**,
        abgelesen und protokolliert in jedem Fall. → ____________________
  ````

- [ ] **Schritt 2: §D Nr. 7–12**

  ````markdown
  **Der Alt-Host, die Ränder und die Logs**

  - [ ] **7. Der Redirect vom Alt-Host trifft** (alle drei, protokollpflichtig):
        ```bash
        curl -si https://radio-admin.iuk-ue.de/geraete | head -5
        #   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/geraete
        curl -si https://radio-admin.iuk-ue.de/       | head -5
        #   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/
        curl -si https://radio.iuk-ue.de/             | head -5
        #   erwartet: HTTP/2 200 — der Ziel-Host darf NICHT redirecten.
        ```
        **Ein 302 in der dritten Zeile heißt: die Middleware hängt am Service statt am Router.**
        **Ein `location: …/admin/` für JEDEN Pfad in der ersten Zeile heißt: `$$` wurde von Compose
        verschluckt** — der Redirect funktioniert, ist aber nicht mehr pfaderhaltend.
        **Ein Verbindungs- oder TLS-Fehler statt einer 302-Zeile heißt: die Entrypoints stimmen
        nicht oder der Edge-Proxy kennt den Alt-Host nicht** (⬜ N6, §A Nr. 8). ⚠️ Das ist der eine
        Fehlfall dieses Punktes, der **nicht rot aussieht, sondern leer** — er wird deshalb
        ausdrücklich protokolliert, nicht wiederholt. → ____________________

  - [ ] **8. Das Traefik-Access-Log zeigt keine wachsende `/m/<key>`-Kette.**
        ```bash
        docker logs --tail 200 <E7> | grep -o '/m/[^ "]*' | sort -u | head
        ```
        **Erwartung:** kein `/m/radio/m/radio/…`. Jede weitere Ebene ist ein RSC-/Prefetch-Request,
        der eine Ebene akkumuliert. → ____________________

  - [ ] **9. Ein Blick in das Suite-Log, mit der scharfen Trennung.**
        ```bash
        docker compose logs --since 2m suite | grep -i 'radio:'
        ```
        **Erwartung:** genau eine Zeile, `info`, „Retention abgeschaltet". **Jede `radio:`-Warnung
        ist ein Stopp-Punkt, kein Hinweis.** Muster **ohne `^`** — unter `docker compose logs` trägt
        jede Zeile den Servicenamen als Präfix, `^radio:` trifft dann nichts, und leere Ausgabe
        liest sich als grün. → ____________________

  - [ ] **10. Der Login-Rückweg — Handarbeit, nicht automatisierbar.** Einmal von
        `https://radio.iuk-ue.de/admin` aus anmelden und prüfen, dass man **dort** wieder landet,
        nicht auf dem Portal.
        **Wie der Fehlfall aussieht:** man landet auf `iuk-ue.de`, ohne Fehler und ohne Meldung
        (`src/core/hosts.ts:59-63`: „Ein curl sieht davon nichts"). **Diese Prüfung ist die einzige,
        deren Fehlfall vollständig stumm ist** — deshalb macht sie eine namentlich benannte Person
        (**E8**), und deshalb ist es dieselbe Person, die in §F den ersten Zugangscode ausstellt.
        ⚠️ **Nach einer NEUEN Anmeldung prüfen**, wenn die Gruppe am selben Abend angelegt wurde
        (bis zu eine Stunde Verzug).
        **Im selben Handgriff die Nachholung aus Nr. 2:** Seitenquelltext der Verwaltungsfläche aus
        dem Browser speichern, dann `grep localtest.me` — **muss leer sein**, und **hier** bedeutet
        die Leere etwas, weil ein Rumpf da ist.
        Person (E8) ____________ · Landung ☐ radio ☐ Portal · `localtest.me` → ____________

  - [ ] **11. Der erste Zugangscode wird ausgestellt** — §F, durch dieselbe Person, **vor** der
        Freigabe an die Nutzer. → ____________________

  - [ ] **12. Ein Telefon, das den Alt-Kiosk kannte, einmal neu laden.** Siehe §E.
        → ____________________
  ````

- [ ] **Schritt 3: §D Nr. 13–16**

  ````markdown
  **Betrieb — die Messungen, die kein Gate belegen kann**

  - [ ] **13. Das Backup einmal von Hand — der Glob ist bewiesen, wenn er gelaufen ist.**
        ⚠️ **Nicht bar aufrufen.** `scripts/backup.sh:3` sagt es selbst („Läuft als Host-Cron"), und
        `:7` fällt ohne Env auf `DATA_DIR=/data` zurück — ein Pfad, den es auf dem **Host** nicht
        gibt; `:32-35` bricht dann hart ab (`backup: no *.db in $DATA_DIR — aborting`). Das ist der
        **gute** Fall; der schlechtere ist die naheliegende Reparatur, ein von Hand exportiertes
        `DATA_DIR`, gegen das dann etwas **anderes** gesichert wird als vom Cron.
        **Deshalb ⬜ N5: die zwei Werte VOR dem Fenster aus der Crontab bzw. der Timer-Unit
        ablesen** und hier einsetzen:
        ```bash
        DATA_DIR=<N5> BLOB_DIR=<N5> scripts/backup.sh
        # Fundort des Archivs: $BACKUP_DIR/<stamp>.tar.gz  (backup.sh:8, :38-39, :100);
        # ohne gesetztes BACKUP_DIR ist das $DATA_DIR/backups.
        tar -tzf <das erzeugte Tarball> | grep radio.db
        ```
        **Erwartung:** `radio.db` ist im Tarball. `scripts/backup.sh:24-26` sammelt
        `"$DATA_DIR"/*.db` per `nullglob` und sichert jede Datei per `sqlite3 .backup` (`:41-43`) —
        **ohne jede Skriptänderung**. `BACKUP_KEEP` bleibt unverändert.
        `DATA_DIR` → ________ · `BLOB_DIR` → ________ · Tarball → ____________________

  - [ ] **14. Die Retention wieder einschalten — und der zweite Log-Blick, in dem die Zeile FEHLT.**
        ⛔ **Vorbedingung: R und Z sind grün protokolliert** (§C Schritt 5 d) — **R** beide Zahlen
        gleich, **Z alle zehn Zeilen `0`** (neun Zahlgrenzproben plus die **Formatprobe** auf
        `devices.last_updated_at`). Sind sie es nicht, bleibt `RADIO_HISTORIE_PURGE=0` stehen, die
        `info`-Zeile bleibt im Log, **und das Standby-Fenster beginnt nicht** (§S).
        Danach: `RADIO_HISTORIE_PURGE=0` **aus der `.env` entfernen**, `up -d`, dann
        ```bash
        docker compose logs --since 2m suite | grep -i 'radio:'
        ```
        **Erwartung: keine Zeile mehr.** → ____________________
        ⚠️ Ein nach dem Fenster **vergessenes** `RADIO_HISTORIE_PURGE=0` ist ein **stiller** Verlust
        der Löschrichtlinie, die der DSGVO-Grund für `borrower_name` ist — die Info-Zeile bei
        **jedem** Start ist das einzige, was ihn findbar hält. Der erste Purge läuft danach nach
        `RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **1440**) — bewusst so lang, dass
        Verifikation, Stichprobe und „Router zurück" noch ins Fenster passen.

  - [ ] **15. Der Monitor zeigt auf `/api/health/radio`**, nicht auf `/api/health`;
        `docs/deployment.md` mit umstellen. (Vorbild für den Fehlfall: `lagerbuch-cutover.md:122` —
        „Der Monitor zeigt auf den falschen Endpunkt".) → ____________________

  - [ ] **16. Die Neuigkeitennotiz ist eingetragen** — §F.3. → ____________________
  ````

- [ ] **Schritt 4: §E — der Service Worker des Alt-Kiosk**

  ````markdown
  ## §E — Der Service Worker des Alt-Kiosk

  ⚠️ **Er überlebt den Umschwenk, weil der Origin zeichengleich bleibt.** Gemessen: Registrierung
  mit **Root-Scope** (`radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73`), Cache-Name
  `radio-inventar-v1` (`public/sw.js:2`), `skipWaiting()` + `clients.claim()` (`:24`, `:40`), also
  **aktiv ohne Reload**.

  * **Kein dauerhaft veraltetes HTML.** Navigationen sind **network-first** (`sw.js:78-96`);
    solange Netz da ist, kommt die Suite-Antwort durch.
  * **Aber ohne Netz** liefert der alte Worker `/` aus seinem Cache — die **Alt-Oberfläche**, gegen
    ein Backend, das es nicht mehr gibt.
  * **Und `cache-first` gilt dauerhaft** für `/manifest.json`, `/favicon.svg`,
    `/apple-touch-icon.svg` und drei Icons (`sw.js:100-127`): eine installierte Alt-PWA bewirbt sich
    nach dem Cutover **weiter mit dem alten Manifest**.
  * **Dazu die zwischengespeicherten `/api`-Antworten:** Bestands- und Ausleihdaten samt
    Ausleihernamen liegen im Cache eines fremden Telefons.

  *Kein Gate sieht davon etwas:* **HTTP 200 mit veraltetem Inhalt.** Kein Build, kein Test, kein
  Healthcheck.

  ### §E.1 — Der Abräum-Worker gehört in den ERSTEN Deploy

  **Er muss VORHER deployt sein — im Deploy aus §A Nr. 1, nicht in diesem Fenster.** Grund:
  **nichts in der Suite ruft `navigator.serviceWorker.register()`.** Die Route wird ausschließlich
  von der **Update-Prüfung eines schon registrierten Workers** abgeholt — der Browser holt das
  Worker-Skript bei einer Navigation im Scope neu und vergleicht die Bytes. **Kommt der
  Abräum-Worker erst mit dem Cutover, gibt es im entscheidenden Fenster nichts, was sich vom Alten
  unterscheidet.** Auf einem Gerät, das den Alt-Kiosk **nie** geöffnet hat, wird die Route nie
  abgerufen — das ist richtig und kein Fehler.
  **Wartet auf:** Spec 1 §7.1.3 — `src/app/m/radio/sw.js/route.ts` und `_lib/sw-quelle.ts`
  (kein `fetch`-Handler, `caches.keys()`, `skipWaiting()` + `clients.claim()` **vor**
  `unregister()`).

  ### §E.2 — Wie man am Cutover-Abend prüft, dass er greift

  **Zwei Hälften, und die erste beweist die zweite nicht.**

  **Hälfte 1 — die Route liefert das Richtige** (`curl`, §D Nr. 5): `content-type: text/javascript`,
  im Body `self.registration.unregister()`.
  **Was man sieht, wenn nicht:** HTML oder Portal-Inhalt → der Rewrite greift nicht,
  `SUITE_HOST_RADIO` ist falsch.

  **Hälfte 2 — ein echtes Gerät, und das kann kein `curl`.** ⚠️ **`curl` hat keinen Service
  Worker.** Ein Telefon, das den Alt-Kiosk kannte, wird **einmal** neu geladen.
  **Erwartung:** im **schlechtesten** Fall **eine** veraltete Seitenansicht, danach die
  Suite-Oberfläche; die Registrierung ist weg und die Cache Storage leer.
  **Was man sieht, wenn er nicht greift:** HTTP 200 mit der **Alt-Oberfläche**, `radio-inventar-v1`
  steht weiter in der Cache Storage, und im Flugmodus erscheint die alte `offline.html`.
  **Der genaue Ablesepunkt in den Entwicklerwerkzeugen: ⬜ L12** — welche Einträge unter
  *Application → Service Workers* und *Application → Cache Storage* leer sein müssen, und ob ein
  „redundant"-Eintrag stehen bleibt. → ____________________

  **Umfang des Handgriffs: E6** — wie viele Geräte den Alt-Token im `localStorage` tragen, ist im
  Repo **nicht abzählbar** (es gibt keine Tabelle). Die Antwort ist eine **Begehung, kein
  `SELECT`**. Für Geräte, die den Kiosk **installiert** haben, kommt „einmal Speicher löschen"
  dazu — ein Handgriff pro Gerät, kein Serverbefehl. **Und das gehört in die Ankündigung:** der
  Worst Case ist **eine** veraltete Seitenansicht je Gerät.
  Geräte (E6) → ________ · davon installiert → ________
  ````

- [ ] **Schritt 5: Gegenlesung und Commit**

  ```bash
  # Sechzehn Abnahmepunkte, lückenlos:
  rtk grep -c '^- \[ \] \*\*[0-9]*\.' docs/runbooks/radio-cutover.md    # §A 14 + §D 16 = 30
  # Jeder Punkt trägt eine Schreiblinie oder ein Kästchen:
  rtk grep -c '____________' docs/runbooks/radio-cutover.md              # Erwartung: >= 30

  # Nr. 2 prüft /admin NICHT per anonymem grep:
  rtk grep -n 'radio.iuk-ue.de/admin | grep localtest.me' docs/runbooks/radio-cutover.md
  # Erwartung: leer — die Probe steht in Nr. 10, angemeldet

  # Nr. 13 ruft backup.sh nicht bar auf:
  rtk grep -n '^        scripts/backup.sh' docs/runbooks/radio-cutover.md    # Erwartung: leer

  rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §D/§E — sechzehn Abnahmepunkte mit Ausgabe, Service Worker"
  ```

---

### Aufgabe 10: §F + §G + §H — Ausstellungsplan, Rückweg, Erfüllung des Fensters

**Wartet auf:** ⛔ **C.3 / E5** (sind gedruckte Aufsteller im Umlauf, wo, und wer kann sie
ersetzen) — **die Zweigwahl in §F**. **E8** (die Person), **E4/C.2** (`<N>` in der Notiz), ⛔ **U4**
(§G 3c/3d), Spec 1 §3.9 (Text und Datei der Neuigkeitennotiz), Spec 1 §3.2.3 (`erstelleCode`).

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (Abschnitte `## §F`, `## §G`, `## §H`)
- Test: keiner. Gegenlesung in Schritt 5.

**Schnittstellen:**
- Verbraucht: die Stopp-Befehl-Tabelle aus Aufgabe 6; `<umschwenk_iso>` und
  `<umschwenk_epoch_sekunden>` aus Aufgabe 8; `$VOL_SUITE` aus Aufgabe 7; §D Nr. 1–16.
- Liefert: die **Teil-Erfüllungsliste des Fensters** (§H), die die Zusammenführung mit den
  Erfüllungspunkten der Kapitel 3 und 5 zu **einer** Liste zusammenzieht.

- [ ] **Schritt 1: §F — der Ausstellungsplan, beide Zweige**

  ````markdown
  ## §F — Der Ausstellungsplan für die Zugangscodes

  **C.3 ist offen** (E5). **Beide Zweige stehen hier, weil die Entscheidung am Cutover-Abend zu spät
  kommt.**

  **Die gemeinsame Lage:** `zugangscodes` ist **nicht Teil des Imports**. Der heutige QR-Code trägt
  den **einen geteilten API-Token base64-kodiert als URL-Parameter**, ohne Ablauf und ohne Widerruf.
  Und `seedLokal` legt **niemals** eine einlösbare Zugangszeile an.
  **Daraus folgt der Zustand, den niemand plant und den man sonst um 22 Uhr entdeckt:** unmittelbar
  nach dem Umschwenk steht eine **anonym erreichbare Ausleih-Fläche** ohne **einen einzigen
  einlösbaren Code**.

  ⛔ **Und der erste Code kann erst NACH dem Umschwenk entstehen.** `erstelleCode` verlangt
  `requireRadioAdmin()` als erste Anweisung (Spec 1 §3.2.3), also eine Anmeldung **auf dem
  radio-Host** — und bis zum Umschwenk bedient dieser Host den Alt-Kiosk. Der Fenster-Prüfcontainer
  hat keine Adresse, unter der sich jemand anmelden könnte, und der reguläre Stack trägt für `radio`
  bis Schritt 9 keinen Router. **Es gibt vor dem Umschwenk keinen Weg, einen Code auszustellen.**

  ### §F.1 — Zweig „ja, es sind gedruckte Aufsteller im Umlauf" (C.3 = ja)

  ⚠️ **„Bestandscodes zeichengleich übernehmen" ist hier NICHT möglich.** Ein Aufsteller trägt heute
  einen base64-Token in einer URL, kein 28-Zeichen-Crockford-Base32 in sieben Gruppen. **Es gibt
  keine Zeichenkette zu übernehmen.** Der Zweig ist **kein Datenvorgang, sondern ein Austausch von
  Papier**:

  1. **Zählen und verorten (E5):** Anzahl, Ort, wer sie ersetzen kann. **Papier ist für jedes Tor
     unsichtbar.** → ____________________
  2. **Je Aufsteller ein Code**, ausgestellt in der Suite mit einer `bezeichnung`, die den **Ort**
     nennt — nur so ist später ein einzelner Aufsteller sperrbar, ohne die anderen mitzunehmen. Der
     Code wird **einmal** zurückgegeben und danach in der Verwaltungsliste im Klartext angezeigt und
     gedruckt: er ist kein Einmalgeheimnis, sondern ein **Dauerausweis**.
  3. **Drucken** über `admin/(druck)/zugaenge/blatt` — die eigene Route-Group ist der Grund, warum
     das Druckblatt Kopfzeile, Navigation und `controlHeight: 44` **nicht** auf Papier erbt.
     **Wartet auf:** Spec 1 §3.9 / B9 — die Druckroute.
  4. **Austauschen, mit Datum je Ort ins Protokoll.** → ____________________
  5. **Solange ein Aufsteller nicht ersetzt ist, ist die Handeingabe der Ausweichweg:** der Code
     wird der betroffenen Person **außerhalb** des Aufstellers mitgeteilt und in das Feld auf der
     Startseite getippt (Groß-/Kleinschreibung gleichgültig).
     **Was schiefgeht, wenn man diesen Ausweichweg nicht plant:** der alte QR-Code hört mit dem Port
     auf zu funktionieren, und wer vor dem Aufsteller steht, hat **keinen** Weg herein.
  6. ⛔ **Abbruchbedingung für den Umschwenk:** Punkt 5 ist nicht abgedeckt **und** es ist niemand
     erreichbar, der Codes ausstellen kann → **der Umschwenk wird verschoben, nicht durchgeführt.**

  ### §F.2 — Zweig „nein, keine im Umlauf" (C.3 = nein) — und die Festlegung, die für beide gilt

  1. **Wer:** die namentlich benannte Person aus **E8** — dieselbe, die §D Nr. 10 durchführt. Das
     ist kein Zufall: `erstelleCode` verlangt `requireRadioAdmin()` auf dem **umgeschwenkten** Host,
     also eine Anmeldung genau auf dem Weg, dessen Fehlfall stumm ist. **Der Schritt beweist beides
     in einem.**
  2. **Wann:** **unmittelbar nach** §D Nr. 3 (Health grün, Modul antwortet) und **vor** der Freigabe
     an die Nutzer. **Nicht vorher** — auf dem Alt-Host gibt es die Fläche nicht.
  3. **Auf welchem Host:** `https://radio.iuk-ue.de/admin/zugaenge`. Nicht über den Portal-Host,
     nicht über den internen `/m/radio`-Pfad.
  4. **Wie viele:** mindestens einer je Ort, an dem geliehen wird, mit ortsnennender `bezeichnung`.
     Ein einziger Code für alles ist technisch gültig und betrieblich der Rückfall in genau das
     Modell, das dieser Port abschafft: **ein Code, den man sperren muss, sperrt dann alle.**
  5. ⛔ **Abbruchbedingung:** die benannte Person kann sich nicht anmelden oder landet nach dem Login
     auf dem Portal → **Stopp**, und der Fall ist §D Nr. 10, nicht ein Codeproblem. Rückweg §G.

  **Der benannte Restposten, der nicht behebbar ist:** zwischen Umschwenk und erstem Code steht eine
  anonym erreichbare Ausleihfläche ohne einlösbaren Code. **Er ist begrenzt durch die Reihenfolge
  oben, nicht beseitigt** — und er steht im Protokoll, damit ihn niemand als Defekt liest.
  → ____________________

  ### §F.3 — Die Neuigkeitennotiz ist ein Schritt am Rollout-Tag, kein Vorab-Commit

  **Drei Dinge werden am Cutover-Tag gesetzt:**

  * **`datum`** = der Tag des **Rollouts**, nicht des Commits.
  * **die Registerzeile** in `src/app/m/portal/_lib/neuigkeiten/notizen/register.ts` — das Dreieck
    ist Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile, und `register.test.ts` hält
    alle drei zusammen.
  * **`<N>`** = der tatsächlich gesetzte Wert von `RADIO_AUSLEIH_SITZUNG_STUNDEN` (**E4**),
    **ausgeschrieben** („zwölf Stunden", nicht „12"). Er ist der einzige Platzhalter der Notiz, und
    er ist einer mit Grund: **eine Anwendernotiz, die eine unbestätigte Zahl behauptet, ist eine
    falsche Auskunft, die niemand mehr korrigiert.**

  **Kein Markdown im Text** — er wird als Textknoten gerendert, `**fett**` käme mit Sternchen auf
  dem Bildschirm an, und `register.test.ts` prüft es. **Und der Satz aus §E gehört hinein:** im
  schlechtesten Fall **eine** veraltete Seitenansicht je Gerät nach dem Umschwenk.
  **Wartet auf:** Spec 1 §3.9 — Datei, Titel und Text der Notiz.
  ````

- [ ] **Schritt 2: §G — der Rückweg, mit Profil, Rücklesung und ausführbarem Nachtrag**

  ````markdown
  ## §G — Der Rückweg

  **Er ist ein Routing-Vorgang, und er hat drei Handgriffe — nicht zwei.**

  ```dotenv
  SUITE_HOST_RADIO=                       # LEEREN, die Zeile NICHT entfernen
  SUITE_TRAEFIK_RULE=...                  # radio.iuk-ue.de herausnehmen
  SUITE_REDIRECT_RULE_RADIO_ADMIN=        # leeren; `${…:-radio-admin.invalid}` greift bei leer UND ungesetzt
  ```
  ```bash
  docker compose up -d
  ```

  **Und dann der dritte Handgriff, der bei `lagerbuch` fehlte — zweiteilig, weil der Freeze zwei
  Stacks angehalten hat:**

  ⛔ **Die Regel, nach der die vier Befehle unten entstehen:** *der Stopp-Befehl aus der Tabelle in
  §C Schritt 1 ist die Vorlage des Start-Befehls hier — **Wort für Wort**, nur `stop` gegen `start`
  getauscht.* Insbesondere wandert `--profile full-app` **mit**: `backend` steht hinter
  `profiles: ["full-app"]` (`radio-inventar/docker-compose.yml:26-27`), und ob eine Compose-Version
  das Profil beim namentlichen Aufruf selbst aktiviert, ist versionsabhängig. **Ohne das Profil kann
  der Start ein No-op sein — und ein No-op sieht wie ein Erfolg aus.** Dasselbe Argument, das §C
  Schritt 1 für den Stopp führt; es ist richtungsunabhängig.

  ```bash
  # 3a) radio-admin zuerst: er ist die Datenquelle des Kiosk.
  docker compose -f radio-admin/docker-compose.yml start app
  # 3b) dann der Kiosk selbst, samt seinem Postgres — MIT dem Profil, zeichengleich zum Stopp.
  docker compose -f radio-inventar/docker-compose.yml --profile full-app start postgres backend
  # 3c) beide Hosts wieder an ihren Router: radio.iuk-ue.de auf radio-inventar,
  #     radio-admin.iuk-ue.de auf radio-admin. ⚠️ NICHT "die Labels, die der Cutover
  #     entfernt hat" — es gibt keine: beide Alt-Compose-Dateien fuehren `traefik`
  #     nirgends. Der Handgriff ist der, der WOERTLICH neben <router_regel_heute>
  #     in §A Nr. 13 steht (U4).
  # 3d) den Auslieferungsweg des FRONTENDS wieder starten — Befehl aus Zeile 3 der
  #     Stopp-Tabelle in §C Schritt 1. Reihenfolge wie 3a vor 3b: erst Daten, dann Oberflaeche.

  # ---- RUECKLESUNG. Der Freeze hat eine, der Rueckweg braucht dieselbe — sonst meldet
  #      der Rollback Erfolg und laesst die Domain tot.
  docker compose -f radio-admin/docker-compose.yml ps
  docker compose -f radio-inventar/docker-compose.yml --profile full-app ps
  # Erwartung: `app`, `backend` und `postgres` mit Status `running` — umgekehrt zu Schritt 1.
  curl -si https://radio.iuk-ue.de/       | head -3
  # Erwartung: die Alt-Oberflaeche, VERGLICHEN mit der Ablesung aus §A Nr. 5.
  curl -si https://radio-admin.iuk-ue.de/ | head -3
  # Erwartung: der Alt-Verwaltungshost, ebenfalls gegen §A Nr. 5.
  ```

  `ps` → ____________________ · `radio.iuk-ue.de` → ____________________ ·
  `radio-admin.iuk-ue.de` → ____________________

  ⚠️ **Der Rückweg startet genau die Prozesse, die §C Schritt 1 angehalten hat — DREI, nicht zwei.**
  Die Stopp-Tabelle **ist** die Liste. Ohne 3d bleibt die Domain nach dem Rollback ebenso tot wie
  ohne 3a–3c: der Kiosk ist eine **Oberfläche** vor sechs `/v1`-Routen, nicht das Backend allein.
  ⚠️ **In der Rückweg-Frist von einer Stunde ist „welcher Prozess lieferte eigentlich das Frontend
  aus" keine Frage, die man noch klären kann.**

  ⚠️ **Die Reihenfolge 3a vor 3b ist keine Kosmetik.** Der Kiosk ist Konsument der sechs
  `/v1`-Routen von `radio-admin`. Allein zurückgeholt, startet er und zeigt **keinen Bestand** — ein
  Rollback, der aussieht wie ein zweiter Ausfall. Und `radio-inventar`s Backend hängt per
  `depends_on: postgres: condition: service_healthy`
  (`radio-inventar/docker-compose.yml:42-44`): ohne Postgres startet er gar nicht.
  ⚠️ **`radio-admin.iuk-ue.de` braucht seinen eigenen Router zurück**, sobald
  `SUITE_REDIRECT_RULE_RADIO_ADMIN` geleert ist — sonst ist der Alt-Verwaltungshost nach dem
  Rollback tot. Der DNS-Eintrag bleibt in beiden Richtungen unangetastet.

  ⚠️ **Bei `radio` bedeutet der Rückweg etwas anderes als bei `lagerbuch`.** Dort nahm er die Domain
  **vom Netz** (`lagerbuch-cutover.md:420`). Hier ist der **Alt-Kiosk der Rückfall**, weil er
  `radio.iuk-ue.de` bis zum Umschwenk bedient hat. **Ohne 3a–3d ist die Domain nach dem „Rollback"
  tot.**

  ⛔ **Und der Start von `radio-admin` in 3a ist selbst gefährlich: er löscht Historie**
  (`index.ts:35` → `retentionService.ts:47`, Cutoff an der Wanduhr `:9`, `:19`). Der Kiosk purgt
  nichts — **die Gefahr sitzt allein in 3a.** Ein Rollback ist deshalb **nur zulässig, wenn §A Nr. 3
  als erfüllt nachgewiesen ist.** Sonst wird der Start abgesagt — auch der Rollback.
  **Wie man den Schaden merkt, wenn man es doch tut:** ein **erfolgreicher** Start mit der Zeile
  `[retention] purged N expired loan(s)`. Kein Fehler, kein roter Test.

  **Was der Rückweg NICHT zurückholt:**

  1. **Jede Ausleihe und jede Rückgabe, die nach dem Umschwenk in `radio.db` gelandet ist.** Es gibt
     **keinen** Rückweg-Importer (Suite → radio-admin) und kein Vorbild dafür.
  2. **Die Historie, die ein Start des Alt-Stacks bereits gelöscht hat.** Der Cutoff hängt an der
     Wanduhr — **jeder weitere Start löscht mehr als der vorige.**
  3. **Die ausgestellten Zugangscodes** (§F). `zugangscodes` existiert in der Alt-App nicht; ein
     gedruckter Suite-Code ist nach dem Rollback wertlos, und der alte QR-Weg gilt wieder.
  4. **Die Cache Storage der Telefone, auf denen der Abräum-Worker schon gelaufen ist.** Kein
     Schaden — der Kiosk registriert bei der nächsten Navigation neu —, aber die erste Ansicht kommt
     dann aus dem Netz, nicht aus dem Cache.
  5. **Nichts an einem 301** — deshalb ist der Redirect ein **302**.

  **Die zwei Fristen, ausgeschrieben, damit sie nicht um 22 Uhr entschieden werden:**

  * **Point of no return:** der **erste fachliche Schreibvorgang** in `radio.db` — die erste
    Ausleihe oder Rückgabe nach dem Umschwenk. Ab da ist der Rollback ein **Datenverlust mit
    bekanntem Umfang**, keine Routing-Rücknahme.
  * **Frist:** Rollback **ohne Nachtrag** nur innerhalb der **ersten Stunde** nach
    `<umschwenk_iso>` (§C Schritt 9), und in dieser Stunde bleibt der Kiosk unter Beobachtung.
    Danach nur noch vorwärts.

  **Der Nachtrag, wenn in der Frist zurückgezogen wird — ausgeschrieben, nicht improvisiert:**
  ```bash
  echo "select id, device_id, borrower_name, borrowed_at, returned_at, return_note
     from loans where created_at >= <umschwenk_epoch_sekunden> order by created_at;" \
  | docker run --rm -i -v "$VOL_SUITE":/data alpine \
      sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  ```
  ⚠️ **Die `docker run`-Form gegen `$VOL_SUITE`, nicht `sqlite3` auf dem Host.**
  `"$DATA_DIR/radio.db"` gibt es auf dem **Host** nicht (`compose.yaml:79`, `:99`, `:221-223`), und
  `DATA_DIR` ist in **keiner** Fenster-Shell dieses Runbooks gesetzt. Mount **ohne** `:ro`,
  `sqlite3 -readonly`, **kein** `immutable=1` — dieselbe Zeile wie Abfrage Z.
  ⚠️ **`<umschwenk_epoch_sekunden>` stammt aus §C Schritt 9** und aus nichts sonst. Fehlt er, trägt
  man entweder gar nichts oder alles nach.
  ⚠️ **Die Zeitstempel stehen hier in Sekunden, die Alt-App erwartet Millisekunden — beim
  Nachtragen mit 1000 multiplizieren.** Derselbe Faktor, andere Richtung.

  **Was der Rückweg nicht ist:** ein Rückzug auf ein älteres **Image**. Die Rollback-Körnung ist
  **grob** — ein älteres Image nimmt portal, qr, feedback, files, lagerbuch und aufgaben mit. **Der
  Teilrückzug ist die `.env`, nicht das Image.**
  ````

- [ ] **Schritt 3: §H — die Teil-Erfüllungsliste des Fensters**

  ````markdown
  ## §H — Wann das Fenster erfüllt ist

  **Jeder Punkt mit Ausgabe, nicht mit Erwartung.** Diese Liste ist die **Klammer** über §A–§G; die
  kleinteiligen Prüfungen stehen dort. Sie deckt **das Fenster** — Generalprobe (§P) und Abbau (§S)
  führen ihre eigenen Punkte.

  **Vor dem Fenster**
  - [ ] 1. **§A Nr. 1–14 vollständig**, insbesondere: `/api/health/radio` antwortet **200** (nicht
        503) · Abräum-Worker deployt · Cloudflare-Zonenregeln gelesen · `X-Forwarded-Host` am Server
        belegt · Weg A/B entschieden · ⛔ **Nr. 13** (heutige Router-Regel **beider** Hosts wörtlich
        protokolliert, samt Rückstell-Befehl) · ⛔ **Nr. 14** (`compose.yaml` mit den
        `radio-admin-alt`-Labels **ausgerollt**, ⬜ N2)
  - [ ] 2. ⛔ **U4 / C.5 ist beantwortet** — sie blockiert den **Freeze**, nicht erst den Abbau
  - [ ] 3. **E1–E8 ausgefüllt und im Protokoll**, `<E1>` exakt wie im `groups`-Claim
  - [ ] 4. **N1–N10 ausgefüllt** — insbesondere ⬜ N3 (die Kennung des laufenden Prozesses, **nicht**
        die des Images) und ⬜ N5 (die Env des Backup-Cron)
  - [ ] 5. **⬜ L13 und ⬜ L14 abgelesen** — ohne sie ist §C Schritt 8 nicht ausführbar
  - [ ] 6. **Der Ausstellungsplan steht** (§F), Zweig nach C.3 gewählt, Person aus E8 benannt

  **Im Fenster**
  - [ ] 7. **`<freeze_iso>` protokolliert** (§C Schritt 1) — er ist der Cutoff jeder
        Vergleichsrechnung: ____________
  - [ ] 8. **Die drei Stopp-Befehle stehen wörtlich im Protokoll**, Zeile 3 (U4) ausgefüllt
  - [ ] 9. **Der Snapshot entstand mit `.backup`, nicht mit `cp`**, und **alle vier Glieder der
        Zählkette** schließen
  - [ ] 10. **A1–A13 gelaufen**, die **acht** blockierenden erfüllt, jede Bereinigung **wiederholt
        und protokolliert**
  - [ ] 11. **Fünf Paare gleich** (§C Schritt 5 a), **fünf** Feldstichproben zeilengenau (b), die
        Zeitstempel-Stichprobe (c)
  - [ ] 12. **R und Z grün**, mit `<freeze_iso>` in **beiden** Armen:
        R Quelle ______ / Ziel ______ · **Z: alle zehn Zeilen `0`** — neun Zahlgrenzproben **plus
        die Formatprobe** auf `devices.last_updated_at`
  - [ ] 13. **`loans_device_active_uidx` existiert im Ziel** und `zugangscode_id` ist überall NULL
  - [ ] 14. **Die Container-ID hat sich geändert** (§C Schritt 7): vorher ________ / nachher
        ________ — **gleich ist ein Stopp-Punkt**
  - [ ] 15. **Schritt 9 war EIN Schritt:** Alt-Router zuerst weg, dann die drei ⏸-Zeilen, dann
        `up -d` — und `<umschwenk_iso>` ______ / `<umschwenk_epoch_sekunden>` ______ stehen im
        Protokoll

  **Nach dem Umschwenk**
  - [ ] 16. **§D Nr. 1–16 vollständig, mit Ausgabe** — insbesondere Nr. 1 (Body, nicht nur 200),
        Nr. 5 (**zwei** Ausgänge), Nr. 7 (alle drei `curl`), Nr. 10 (Login-Rückweg, Handarbeit, E8,
        **samt der `localtest.me`-Probe auf der angemeldeten Verwaltungsfläche**)
  - [ ] 17. **Der erste Zugangscode ist ausgestellt** — auf dem umgeschwenkten Host, durch E8,
        **vor** der Freigabe an die Nutzer. Der Restposten „Fläche ohne Code" ist protokolliert
  - [ ] 18. **`RADIO_HISTORIE_PURGE=0` entfernt** — **erst nach** Punkt 12, und der zweite Log-Blick
        zeigt **keine** `radio:`-Zeile mehr
  - [ ] 19. **Ein Telefon, das den Alt-Kiosk kannte, wurde einmal neu geladen** (§E.2)
  - [ ] 20. **Das Backup ist einmal von Hand gelaufen** — mit der Env aus ⬜ N5 — und `radio.db`
        liegt im Tarball: ____________________
  - [ ] 21. **Monitor und `docs/deployment.md` zeigen auf `/api/health/radio`**, nie auf
        `/api/health`
  - [ ] 22. **Die Neuigkeitennotiz ist eingetragen**, `datum` = Rollout-Tag, `<N>` = der gesetzte
        Wert, ausgeschrieben

  ⚠️ **Punkt 2 ist der einzige Punkt dieser Liste, den kein Befehl beantwortet.** Alle anderen haben
  eine Ausgabe. Dieser eine ist eine **Auskunft**, und er ist **vor** dem Cutover einzuholen — nach
  dem Abbau ist er nur noch durch Ausprobieren zu beantworten, und das Ausprobieren heißt dann:
  „was ist kaputtgegangen?"
  ````

- [ ] **Schritt 4: Die Ankündigung — „was sich für die Nutzer sichtbar ändert"**

  Bauteil aus `files-cutover.md:374-382` und `feedback-cutover.md:207-221`, ans Ende von §F.3
  angehängt:

  ````markdown
  ### §F.4 — Was sich für die Nutzer sichtbar ändert (für die Ankündigung)

  * **Der alte QR-Code hört mit dem Umschwenk auf zu funktionieren.** An seine Stelle tritt ein
    gedruckter Zugangscode je Ort; wer vor einem noch nicht ersetzten Aufsteller steht, bekommt den
    Code außerhalb des Aufstellers mitgeteilt und tippt ihn ein (§F.1 Nr. 5).
  * **`radio-admin.iuk-ue.de` leitet weiter** auf `radio.iuk-ue.de/admin`, pfaderhaltend. Adressen
    und Lesezeichen funktionieren also weiter — sie landen nur eine Ebene tiefer.
  * **Wer den Kiosk als App installiert hat, sieht beim ersten Öffnen im schlechtesten Fall EINE
    veraltete Seitenansicht.** Danach ist die neue Oberfläche da. Für installierte Geräte kommt
    einmal „Speicher löschen" dazu (§E.2).
  * **Die Ausleihe verlangt keinen Login** — sie verlangt den Zugangscode. Die **Verwaltung**
    verlangt eine Anmeldung mit der Gruppe aus E1.
  ````

- [ ] **Schritt 5: Gegenlesung, Vollprüfung des ganzen Runbooks, Commit**

  ```bash
  # §G startet DREI Dinge und liest sie zurück:
  rtk grep -c 'full-app start' docs/runbooks/radio-cutover.md          # Erwartung: >= 1
  rtk grep -n '3d)' docs/runbooks/radio-cutover.md                     # Erwartung: 1 Treffer
  rtk grep -n 'RUECKLESUNG' docs/runbooks/radio-cutover.md             # Erwartung: 2 (Schritt 1 und §G)

  # Der Nachtrag ist ausführbar: die nackte sqlite3-Zeile gegen DATA_DIR steht nur in §L —
  # §L.3 erlaubt sie der Generalprobe (dort Bind-Pfad $GP/data). §L.2 verbietet sie für den
  # Host, aber im Fließtext statt in der Befehlsform, und zählt hier deshalb nicht mit:
  rtk grep -n 'sqlite3 -readonly "\$DATA_DIR' docs/runbooks/radio-cutover.md
  # Erwartung: genau EIN Treffer (§L.3, Zeile Generalprobe)

  # Jede im Runbook genannte E-, U- und N-Marke hat eine Zeile in §0. ⚠️ NICHT die L-Marken:
  # §0 führt allein E, U und N. Die ⬜-L-Marken stammen aus der ⬜-Tabelle von Spec 2 und werden
  # im Kopf dieses Planteils geführt (Tabelle „Aus dem Rahmen von Spec 2 übernommen") — im
  # Runbook-Text stehen heute zehn von ihnen (L4, L6–L14), und keine hat eine §0-Zeile.
  # ⚠️ Die Klammer `\*\{0,2\}` ist nicht Zierrat: der Runbook-Text schreibt dieselbe Marke
  # mal `⬜ N1`, mal `⬜ **N1**`. Ohne sie meldet die Schleife „keine Ausgabe" und ist blind.
  for n in $(rtk grep -o '⬜ \*\{0,2\}[EUN][0-9]*' docs/runbooks/radio-cutover.md \
               | sed 's/⬜ //; s/\*//g' | sort -u); do
    rtk grep -q "^| $n |" docs/runbooks/radio-cutover.md || echo "OHNE §0-ZEILE: $n"
  done
  # Erwartung: keine Ausgabe

  # §H Punkt 1 nennt vierzehn, nicht zwölf. ⚠️ Bewusst MIT „vollständig" gesucht, zeichengleich
  # zu 2026-08-18-plan5-radio-abbau.md: die nackte Zeichenkette `§A Nr. 1–14` steht im zusammengeführten Runbook
  # ZWEIMAL — einmal als Erfüllungspunkt, einmal in der Kopfregel von §H, die die
  # kleinteiligen Prüflisten aufzählt. Nur die Fassung als ERFÜLLUNGSPUNKT ist hier gemeint:
  rtk grep -n '§A Nr. 1–14 vollständig' docs/runbooks/radio-cutover.md  # Erwartung: 1 Treffer

  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §F/§G/§H — Ausstellungsplan, Rueckweg mit Ruecklesung, Erfuellung"
  ```

---

## Selbstprüfung gegen den Entwurf

| Abschnitt von Spec 2, Kapitel 4 | Zeilen | Aufgabe |
|---|---|---|
| §4.1 — Die Reihenfolge | 3060–3088 | 6 (Schritt 1) |
| §4.2 — Was vor dem Fenster fertig sein muss | 3091–3191 | 4 |
| §4.3 — Die Eingaben | 3195–3207 | 1 (§0) |
| §4.4.1 — Die `.env`-Zeilen | 3213–3267 | 5, und die Artefakte in 3 |
| §4.4.2 — Abbruch gegen still | 3269–3300 | 5 (§B.1) |
| §4.4.3 — Rollback ist die leere Zeile | 3302–3313 | 5 (§B.2) |
| §4.4.4 — Der Redirect vom Alt-Host | 3315–3392 | 2 (die Labels) + 5 (§B.3) |
| §4.5 Schritt 1–3 | 3401–3496 | 6 |
| §4.5 Schritt 4–5 | 3498–3650 | 7 |
| §4.5 Schritt 6–9 | 3652–3772 | 8 |
| §4.6 Nr. 1–16 | 3776–3922 | 9 (§D) |
| §4.7 — Service Worker | 3926–3983 | 9 (§E) |
| §4.8 — Ausstellungsplan | 3987–4063 | 10 (§F) |
| §4.9 — Der Rückweg | 4067–4161 | 10 (§G) |
| Erfüllungspunkte, Fenster-Anteil | 4808–4846 | 10 (§H) |

**Nicht abgedeckt und bewusst so:**

* **Die Generalprobe (§P) und der Abbau (§S)** — Kapitel 3 und 5 dieser Spec. Dieser Planteil legt
  nur die zwei Anker an, damit die Nachbarteile eine Anschlussstelle haben.
* **Der Bau des Moduls** — Spec 1. Jede Stelle, die darauf wartet, trägt „**Wartet auf:** Spec 1
  §…" und eine ⬜-Nummer.
* **Die Vorabfragen A1–A13** — sie stehen vollständig in Kapitel 2; §C Schritt 2 verweist auf sie
  und wiederholt sie nicht. Der Grund ist der Hausgrundsatz aus `lagerbuch-cutover.md:365-366`:
  „Der vollständige Wortlaut jeder Zeile steht in §16.2 — dort und nur dort, damit es eine Fassung
  gibt und nicht zwei."
* **`C.6 / B4`** (Updater-Rechtestufe) — fachlich blockierend und bewusst geparkt. Der Cutover ist
  ohne Antwort durchführbar; die `.env` wäre dann um **eine** Zeile zu erweitern.
* **`TZ=Europe/Berlin`** — eigener Suite-Posten. §A Nr. 11 sagt ausdrücklich, dass es in diesem
  Fenster **nicht** gesetzt wird.

**Namensgleichheit** — diese Bezeichner sind über alle zehn Aufgaben **zeichengleich** geschrieben:
`<freeze_iso>` · `<umschwenk_iso>` · `<umschwenk_epoch_sekunden>` · `$VOL` · `$VOL_SUITE` · `$IMP` ·
`radio-admin-snapshot.sqlite` · `<container_id_vorher>` / `<container_id_nachher>` ·
`<revision_soll>` · `<image_digest_soll>` · `<router_regel_heute>` · `<uid_gid_prozess>` ·
`radio-admin-alt` · `radio-admin-alt-redirect` · `SUITE_REDIRECT_RULE_RADIO_ADMIN` ·
`radio-fenster` · „die drei ⏸-Zeilen" · „Abfrage R" · „Abfrage Z".

---

## Was dieser Planteil den Nachbarteilen zusagt

**An alle Teile — das gemeinsame Zieldokument und seine Gliederung:**
`docs/runbooks/radio-cutover.md` mit den Abschnitten `⚠️-Kopf` · `§0` · **`§P` (Kapitel 3)** ·
`§A` · `§B` · `§C` · `§D` · `§E` · `§F` · `§G` · `§H` · **`§S` (Kapitel 5)**. Dieser Planteil
besetzt `§0` und `§A`–`§H`; `§P` und `§S` sind als leere Anker angelegt.

**An Kapitel 1 (Import):**
- Der Importer wird mit **einem** positionalen Argument gegen `./radio-admin-snapshot.sqlite`
  aufgerufen, das Ziel steuert `DATA_DIR`; im Fenster ist das ein **Wegwerf-Verzeichnis auf dem
  Host** (`$IMP="$HOME/cutover-radio"`, `DATA_DIR="$IMP/data"`), **nie** `/data`.
- Das Runbook prüft **Zeichenkette und Exit-Code** der Abschlusszeile (⬜ L6).
- Der Transport ins Volume ist **nicht** Sache des Importers: er schreibt auf den Host, ein eigener
  `docker run` legt die Datei ins Volume (§C Schritt 4 Handgriff 3).

**An Kapitel 2 (Parität und Stichproben):**
- `$VOL_SUITE` ist **eine** Protokollzeile, gesetzt in §C Schritt 4 Handgriff 1. Schritt 5 (a),
  Schritt 5 (d), §D Nr. 4 und der Nachtrag in §G benutzen **dieselbe**.
- Im **Fenster** gilt: Mount **ohne** `:ro`, `sqlite3 -readonly`, **kein** `immutable=1`.
- `<freeze_iso>` steht in **beiden** Armen von R und Z; `'now'` bleibt der Vorhersage (A8)
  vorbehalten.
- **Abfrage Z hat zehn Zeilen**, und alle zehn müssen `0` sein — neun Zahlgrenzproben plus die
  **Formatprobe** auf `devices.last_updated_at`.

**An Kapitel 3 (Generalprobe):**
- Der **Fenster**-Prüfcontainer heißt `radio-fenster` und unterscheidet sich vom
  Generalproben-Container (`radio-gp`) in **drei** Punkten, nicht zwei: `-v "$VOL_SUITE":/data` ·
  **kein** `AUTH_DEV_LOGIN` · **`SUITE_HOST_RADIO=localhost,radio.iuk-ue.de`** (zwei Werte).
- ⛔ **Der dritte Punkt betrifft die Generalprobe mit:** §3.2.2 setzt heute
  `SUITE_HOST_RADIO=localhost` und fährt danach `curl -H 'Host: radio.iuk-ue.de'`. Diese Kombination
  misst **den Portal-Login, nicht `radio`** — `moduleForHost` vergleicht exakt
  (`src/core/registry.ts:225-232`), und ohne Treffer greift `?? getModule("portal")`
  (`src/core/routing.ts:69-73`). **Kapitel 3 muss dieselbe Korrektur einarbeiten**, sonst sind sechs
  der acht V-Zeilen bedeutungslos und zwei davon (V2, V6) sogar **grün ohne geprüft worden zu
  sein**. Belegt zulässig: `envHostsFor` splittet auf `,` (`src/core/hosts.ts:39-46`),
  `validateHostConfig` hat gegen beide Werte nichts (`:65-99`).
- Der Snapshot entsteht **ohne** `docker compose stop` des Alt-Stacks (`.backup` arbeitet gegen die
  laufende Datenbank), und die im Rahmen als „gleichwertig" angebotene `VACUUM INTO`-Zeile wird
  **nicht** in ein `sh -c '…'` übernommen.
- ⬜ **N1** (hält der Stack `radio.db` offen?) ist **dieselbe** Frage wie die, die Kapitel 3 für
  `immutable=1` beantwortet haben will — die Re-Kritik nannte sie **L15**. **Eine Nummer, nicht
  zwei.**

**An Kapitel 5 (Standby und Abbau):**
- **Die Zahlen aus R und Z werden EINMAL ermittelt und ZWEIMAL gelesen** — hier als Freigabe (§D
  Nr. 14 hängt daran), in §S als Abbau-Sperre. **Dieselbe Protokollzeile.**
- `RADIO_HISTORIE_PURGE=0` wird **erst nach** grünem R und Z entfernt; sonst beginnt das
  Standby-Fenster nicht.
- Die Postgres-Zählungen sind **sechs** (P1–P6), nicht fünf — §C Schritt 3 sagt es so, weil P6 der
  Archiv-Dump ist („Erst danach darf das Volume fallen"). Die Sperrenliste in §5.3 führt P6 heute
  nicht.
- Der Redirect fällt in dieser Reihenfolge: **Labels → `.env` → DNS zuletzt**; der DNS-Eintrag
  `radio-admin.iuk-ue.de` ist die **Abhängigkeit** des Redirects, kein Abbau-Posten.
- Die drei **Stopp-Befehle** aus §C Schritt 1 stehen wörtlich im Protokoll und sind zugleich die
  Liste dessen, was im Abbau endgültig verschwindet.

**An die Zusammenführung:**
- **Fünf neue Nummern** (in der dokumentweiten Zählung): ⬜ N2 (Compose vor dem Fenster
  ausgerollt) · ⬜ N3 (Kennung des laufenden Prozesses statt der des Images) · ⬜ N5 (Env des
  Backup-Cron und Fundort des Tarballs) · ⬜ N1 (dauerhaftes `radio.db`-Handle; = der
  Re-Kritik-Vorschlag L15) · ⬜ N6 (Edge-Proxy: `X-Forwarded-Host`, Entrypoints, Bekanntheit des
  Alt-Hosts).
- **⬜ L5 ist verkleinert:** die Feldnamen sind belegt (`src/core/health/index.ts:4-15`,
  `src/app/api/health/[modul]/route.ts:23-26`); offen bleibt allein der **Sollwert** von `revision`,
  und der entsteht in §A Nr. 1. Die Rahmen-Tabelle und die vier weiteren Verwendungsstellen (§2.6,
  §3.2.6 V3, §4.6 Nr. 3, §4.5 Schritt 8) sind darauf nachzuziehen.
- **Erfüllungspunkt 9 heißt „§4.2 Nr. 1–13", nicht „1–12"** — plus N2 als Nr. 14; in diesem Runbook
  steht „§A Nr. 1–14".
- **Erfüllungspunkt 17 heißt „Z alle zehn `0`", nicht „alle drei"**; ebenso ist die Nebenbemerkung
  in Anhang A-5 („drei Spalten") auf zehn zu korrigieren.
- **§4.5 Schritt 3 nennt „fünf Postgres-Zählungen (P1–P5)"** — es sind sechs.
- **§4.4.4 nennt „Service `app`"** — der Service heißt `suite` (`compose.yaml:2`).
- **§4.1 belegt die `.env`-Regel mit `files-cutover.md:107-109`** — dort steht die Pflege der
  Pocket-ID-Gruppen. Die tragende Stelle ist `files-cutover.md:115-116`.
- **Zwei blanke §-Verweise in Kapitel 4** zeigen nach Spec 1 und tragen kein Präfix: Zeile 3257
  (`§3.7.2`) und Zeile 4020 (`§3.9`).

---

## Bericht zur Re-Kritik: was eingearbeitet ist und was verworfen wurde

**Eingearbeitet (elf Funde, die dieses Kapitel betreffen):**

| Fund | Wo er in diesem Plan landet |
|---|---|
| **RK-A1** — beide Prüfcontainer setzen `SUITE_HOST_RADIO=localhost` und fahren danach `curl -H 'Host: radio.iuk-ue.de'` | **Aufgabe 8, Schritt 2**: `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de`, mit der Begründung **in der Zeile daneben**, damit sie niemand „vereinfacht", plus die neue Portal-Fallback-Probe (`grep -c '<L10>'`). Belegt nachgemessen: `envHostsFor` splittet auf `,` (`src/core/hosts.ts:39-46`), `validateHostConfig` hat gegen beide Werte nichts (`:65-99`). Die Alternative „zwei getrennte `docker run`" steht als gleichwertig daneben. **An Kapitel 3 weitergereicht**, weil §3.2.2 dieselbe Zeile führt |
| **RK-A2** — der Bergungsbefehl in §4.9 ist doppelt nicht ausführbar | **Aufgabe 8, Schritt 3** erzeugt `<umschwenk_iso>` **und** `<umschwenk_epoch_sekunden>`; **Aufgabe 10, Schritt 2** schreibt den Nachtrag in der `docker run`/`$VOL_SUITE`-Form, zeichengleich zu Abfrage Z |
| **RK-A3** — `--profile full-app` fehlt in §4.9 3b | **Aufgabe 10, Schritt 2**: das Profil steht im Start-Befehl, und die Regel ist ausgeschrieben („der Stopp-Befehl aus §C Schritt 1 ist die Vorlage — Wort für Wort"). Zusätzlich in **Aufgabe 6** als Stopp-Befehl-**Tabelle** angelegt, damit die Vorlage eine Fundstelle hat |
| **RK-A5** — der Rückweg hat keine Rücklesung | **Aufgabe 10, Schritt 2**: dieselben drei Zeilen wie im Freeze, mit umgekehrter Erwartung (`ps` = `running`, beide `curl` gegen die Ablesung aus §A Nr. 5) |
| **RK-A6** — die Kennung wird aus dem Image gelesen statt vom Service | **Aufgabe 4 (§A Nr. 12)** liest sie am Server (`docker inspect … {{.Config.User}}` bzw. `SUITE_USER`), **Aufgabe 7** benutzt sie. Neue Nummer ⬜ **N3**. Beleg im Repo nachgeprüft: `Dockerfile:42-43` ohne `-G nodejs`, `compose.yaml:62`, Docblock `compose.yaml:47-61`, `.env.example:252` |
| **RK-A7** — Dateitausch unter einem laufenden Prozess, und Schritt 7 belegt den Neustart nicht | **Aufgabe 7**: Container-ID vor Handgriff 3 ins Protokoll, ⬜ **N1** als benannte Lücke plus die konservative Zwischenlösung (`docker compose stop suite`) samt ihrem Preis. **Aufgabe 8**: `up -d --force-recreate suite` und die zweite ID — Gleichheit ist ein Stopp-Punkt, auch in §H Punkt 14 |
| **RK-A8 / RK-A1 (2. Durchgang)** — Erfüllungspunkt 9 sagt „Nr. 1–12", §4.2 hat dreizehn | **Aufgabe 10 (§H Punkt 1)**: „§A Nr. 1–14 vollständig", Nr. 13 **namentlich** in der insbesondere-Aufzählung, mit ⛔ — und die Korrektur an Spec 2 in den Zusagen an die Zusammenführung |
| **RK-A9 / RK-A6 (2. Durchgang)** — „Z alle drei `0`" gegen zehn Glieder | **Aufgabe 7, Schritt 4** schreibt Z vollständig mit zehn Gliedern aus und beschriftet sie „alle zehn"; **Aufgabe 9 (§D Nr. 14)** und **§H Punkt 12** nennen die Formatprobe eigens |
| **RK-A10** — `grep localtest.me` auf anonymem `/admin` ist strukturell leer | **Aufgabe 9 (§D Nr. 2)**: die zweite Zeile entfällt dort mit ausgeschriebener Begründung und wandert nach **Nr. 10** — angemeldet, Seitenquelltext aus dem Browser, „hier bedeutet die Leere etwas, weil ein Rumpf da ist" |
| **RK-A12** — `scripts/backup.sh` bar aufgerufen | **Aufgabe 9 (§D Nr. 13)**: Aufruf mit `DATA_DIR=<N5> BLOB_DIR=<N5>`, die zwei Werte vorher aus Crontab/Timer abgelesen (neue Nummer ⬜ **N5**), Fundort ausgeschrieben: `$BACKUP_DIR/<stamp>.tar.gz` (`backup.sh:8`, `:100`) |
| **RK-A5 (2. Durchgang)** — blanke §-Verweise | **Global Constraints** und **Aufgabe 1, Schritt 1**: die Regel steht im Runbook-Kopf; die zwei Fundstellen dieses Kapitels (Zeile 3257, Zeile 4020) sind in den Zusagen benannt |
| **RK-A11 (2. Durchgang)** — §4.5 Schritt 3 zählt „fünf (P1–P5)" | **Aufgabe 6, Schritt 4**: „sechs (P1–P6)", mit dem Grund (P6 = der Archiv-Dump, „Erst danach darf das Volume fallen"); der fehlende P6 in der §5.3-Sperrenliste ist an Kapitel 5 weitergereicht |
| **RK-A9 (2. Durchgang)** — `files-cutover.md:107-109` belegt die `.env`-Regel nicht | **Aufgabe 5, Schritt 1**: der Beleg lautet `files-cutover.md:115-116`, im Repo nachgelesen |
| **RK-A4 (2. Durchgang)** — ⬜ L5 ist zu groß | **„Die Leerstellen dieses Planteils"**: die Feldnamen sind mit `src/core/health/index.ts:4-15` und `src/app/api/health/[modul]/route.ts:23-26` ausgeschrieben; offen bleibt allein der **Sollwert** von `revision`. Der falsche Zeilenverweis `route.ts:11-18` (er zeigt in einen Kommentarblock) ist nicht übernommen |
| **RK-A10 (2. Durchgang)** — die `files/boot.ts:425`-Begründung für `mkdir -p data/files` ist falsch | **Aufgabe 7, Schritt 1**: der Kommentar begründet den `mkdir` mit dem Bind-Mount, der die Verzeichnisstruktur des Images **nicht** erbt (`Dockerfile:64-71`) — nicht mit einer Boot-Prüfung |

**Verworfen, mit Gegenbeleg:**

* **RK-A11 (1. Durchgang) — die kaputte `VACUUM INTO`-Alternative im Snapshot-Befehl.** Der Fund ist
  **richtig**, betrifft aber **nicht** dieses Kapitel: der Snapshot-Befehl in §4.5 Schritt 2
  (Zeilen 3450–3452) führt **ausschließlich** die `.backup`-Form und bietet keine Alternative an;
  die Quoting-Falle steht im Rahmen (W1, Zeile 279) und in §1.1 (Zeile 617). **Aufgabe 6, Schritt 3**
  schreibt die `.backup`-Form deshalb ohne Alternative aus und sagt ausdrücklich: „es gibt keine
  angebotene Alternative, die jemand von Hand nachbauen müsste." Die Streichung im Rahmen und in
  Kapitel 1 gehört zu jenen Teilen, nicht hierher.
* **RK-A4 (1. Durchgang) und RK-A2 (2. Durchgang) — Abfrage A liest auf dem Host.** Betrifft §5.2.2,
  also Kapitel 5. In **diesem** Kapitel liest **keine** Zählung mehr auf dem Host: §4.5 Schritt 5 (a)
  (Zeilen 3590–3600), §4.5 Schritt 5 (d) (Zeilen 3630–3638) und §4.6 Nr. 4 (Zeilen 3812–3815)
  führen bereits die `docker run`/`$VOL_SUITE`-Form. Übernommen ist nur die **Gegenprobe**
  `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data` („eine `0` ist zuerst ein
  Volume-Fehler"), weil sie den Fehlfall dieses Kapitels genauso trifft.
* **RK-A3 (2. Durchgang) — W5 Residuum 2 ist als Messung formuliert, ist aber keine.** Die
  **Entscheidung** (kein `immutable=1` im Fenster) wird **übernommen**, die **Begründung** nicht:
  belegbar ist nur, dass Migrationen (`src/core/bootstrap.ts:103`) und Health
  (`src/core/health/index.ts:13-15`) ihr Handle schließen; ob ein radio-Boot-Haken eines hält, ist
  Bau. Deshalb steht in **Aufgabe 7** ⬜ **N1** als benannte Lücke **statt** der behaupteten
  Tatsache — und, anders als der Vorschlag der Re-Kritik, mit einem **ausführbaren Zwischenweg**
  (`docker compose stop suite` vor Handgriff 3, mit ausgeschriebenem Preis), damit das Fenster nicht
  an einer offenen Frage steht.
* **RK-A8 (2. Durchgang) — „§3.6 Zusage 12" gibt es nicht.** Rahmen-Fund (Zeile 299), betrifft W1
  und Kapitel 3. Kein Anlass zu einer Änderung in Kapitel 4; hier nicht eingearbeitet und auch nicht
  weitergereicht, weil der Zusammenführung ohnehin der Rahmen gehört.
* **Sämtliche Funde des Kapitel-1/2-Durchgangs** (`gelesen_als_s`, `devices.last_updated_at`, der
  ARRANGE-Riegel, die Lauf-Tabelle in §2.2.2, die Fixture-Zählung, `portal.ts:46-48`,
  `feedback.test.ts`, `software_versions` als Fall D, ⬜ L1) betreffen den **Importer** und die
  **Feldstichproben**, nicht den Ablauf des Fensters. Sie sind hier **nicht** eingearbeitet und
  gehören in die Planteile zu Kapitel 1 und 2. Berührungspunkt: die Zählung „zehn Zeitstempelspalten"
  ist in **Aufgabe 7** korrekt übernommen (neun Zahlen plus die Formatprobe).
