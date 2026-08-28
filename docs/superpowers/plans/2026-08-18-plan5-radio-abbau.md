# Plan 5 von 5 · Radio-Cutover, Standby und Abbau — Umsetzungsplan (Spec 2, Kapitel 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Abschnitt **Standby und Abbau** von `docs/runbooks/radio-cutover.md` steht ausgeschrieben
da: welche Frist was schützt, welche sechs Zählblöcke vor dem Abbau laufen, welches Ergebnis ihn
stoppt, was Posten für Posten abgebaut wird — und die Klammer darüber, die sagt, wann dieser Cutover
erfüllt ist. Der Abbau ist die **einzige unumkehrbare Handlung** dieses Cutovers; ab dem gelöschten
Volume gibt es keine Quelle mehr, gegen die man nachschlagen könnte.

**Architecture:** Dieser Planteil baut **keinen Code**. Sein Erzeugnis ist Runbook-Text in
`docs/runbooks/radio-cutover.md`, und die Prüfbarkeit jeder Aufgabe hängt an zwei Dingen: (1) jeder
Handgriff nennt **die Zählung, die ihm vorausgeht, und was diese Zählung dokumentiert** — ein Posten
ohne grün protokollierte Zählung bekommt kein Häkchen; (2) jede Aufgabe schließt mit einer
**ausführbaren Gegenprobe** (`grep`/`sed` über den geschriebenen Abschnitt), die belegt, dass die Zahl
im Kopf einer Prüfliste dieselbe ist wie die Zahl in ihrem Rumpf. Der zweite Punkt ist kein
Formalismus: **W8** der Spec stuft genau diesen Fehlertyp als tragend ein („eine Prüfliste, deren Kopf
eine andere Zahl nennt als ihr Rumpf, wird unter Zeitdruck gekürzt"), und die Re-Kritik hat ihn im
Abbau-Kapitel **dreimal** gefunden.

**Tech Stack:** Markdown-Runbook nach Hausform (`docs/runbooks/files-cutover.md`,
`docs/runbooks/lagerbuch-cutover.md`) · `sqlite3` und `psql` in Wegwerf-Containern · Docker Compose ·
Traefik-Labels in `compose.yaml` · keine Repo-Quelldatei unter `src/`

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`, **Kapitel 5** (Zeilen
4165–4782) und der Block **Erfüllungspunkte** (Zeilen 4784–4876) sowie **Anhang A** (Zeilen 4880–4895).
Dazu **zwei datierte Nachträge außerhalb dieses Bereichs**, die der Cutover-Leitplan dieser Aufgabe
ausdrücklich zuweist (NS8, NS11): die ⬜-Zeile **L5** (Zeile 185) und **§3.2.2** (Zeilen 2571–2611) —
**nur** je eine Nachtragszeile, **kein** Zugriff auf die Abschnitte selbst

---

## Was dieser Planteil ist — und was er nicht ist

⚠️ **Spec 1 ist nicht gebaut.** `src/app/m/radio/` existiert nicht, `scripts/import/radio.ts`
existiert nicht (geprüft am 2026-08-18; deckt sich mit Spec 2, Randbedingung 9). Dieser Plan ist
deshalb **kein Bauplan**, sondern der Plan, der den Abbau-Teil des Runbooks **ausführbar
niederschreibt**. Er ist heute vollständig abarbeitbar — mit einer Ausnahme, die je Aufgabe benannt
ist: wo eine Zeile erst der Bau, der Server oder der Betreiber hergibt, steht

> **Wartet auf:** ⬜ L-Nummer / E-Nummer / U-Nummer / C-Nummer / N-Nummer

und **nie** eine plausibel aussehende Erfindung. Der Präzedenzfall ist vernarbt: die
`lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft**.

**Der Unterschied zwischen „Text schreiben" und „ausführen":** Aufgaben 5.1 bis 5.10 schreiben den
Text und sind **heute** abnehmbar. Die Handgriffe darin laufen **frühestens vierzehn Tage nach dem
Umschwenk** — also nach dem Bau, nach dem Fenster, in einer Sitzung, in der niemand mehr den Kontext
dieses Abends hat. Genau deshalb wird jeder Befehl **ausgeschrieben** und nicht beschrieben.

---

## Global Constraints

- **Kommandos:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
  `pnpm exec playwright test`. Alle mit `rtk` präfixen (`rtk pnpm vitest run`). Für einen reinen
  Dokument-Commit trägt das Tor nichts bei — es läuft trotzdem, weil Aufgabe 5.8 `compose.yaml`
  berührt und ein grünes Tor über dem gemeinsamen Commit die Hausregel ist.
- **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore (`vitest.config.ts:8-34`: 251 Fremdfehlschläge gemessen).
- **Arbeitsverzeichnis dieses Plans:** `/Users/rubeen/dev/personal/drk/iuk-suite`.
  ⚠️ **Die zwei Alt-Repos liegen NICHT darin, sondern daneben:** `/Users/rubeen/dev/personal/drk/
  radio-admin` und `…/radio-inventar` (geprüft am 2026-08-18). Jedes
  `docker compose -f radio-inventar/docker-compose.yml …` dieser Spec setzt also ein **anderes**
  Arbeitsverzeichnis voraus als das Suite-Repo — und **wo die zwei Checkouts auf dem Server liegen,
  ist eine offene Auskunft (N10).** Aus dem falschen Verzeichnis gefahren antwortet jeder dieser
  Befehle `no configuration file provided`.
- **Ein `§` ohne Präfix meint IMMER Spec 2.** Jeder Verweis in Spec 1 trägt das Präfix `Spec 1 §…`
  (Re-Kritik RK-A5, dritter Durchgang). Kapitel 5 der Spec verletzt das an zwölf Stellen (`§9.2.4`,
  `§9.3.4`, `§9.4.1`, `§9.4.2`, `§9.5.1`, `§9.5.2`, `§2.10`, `§7.1.3`, `§7.3.4` u. a. — alle meinen
  Spec 1); **im Runbook wird jede dieser Stellen mit Präfix geschrieben.**
- **Zeitangaben:** Der Freeze-Zeitpunkt ist `<freeze_iso>` (ISO-8601, **UTC**), protokolliert in
  §4.5 Schritt 1. Er ist der Cutoff **jeder** Vergleichsrechnung dieser Spec (W3). `'now'` ist in
  jedem Vergleich verboten.
- **Zahlenregel:** Wo eine Prüfliste eine Anzahl im Kopf nennt, wird die Anzahl im selben Commit
  **gezählt**, nicht abgeschrieben. Die Gegenprobe steht als letzter Schritt der Aufgabe.
- **Betriebswerte werden nicht erfunden** (`docs/runbooks/files-cutover.md:57-58`): „Ein Platzhalter
  aus einer anderen Maschine ist kein Wert." Ein leeres Feld ist eine gültige Zeile, eine erfundene
  Zahl nicht.
- **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.
- Nach jeder Aufgabe: `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` grün, dann
  committen.

---

## Der Namensraum dieses Planteils

Damit die fünf Planteile beim Zusammenführen nicht übereinander schreiben, belegt Kapitel 5 im
Runbook **ausschließlich** diese Abschnittsmarken. ⚠️ **Die Marken sind NICHT zeichengleich mit den
Nummern der Spec** — nur `§5.1` trifft, `§5.2` trifft halb (Spec §5.2.1–§5.2.2), und **ab `§5.3` ist
das Runbook gegenüber der Spec um zwei verschoben**; `§5.8` und `§5.9` haben in der Spec überhaupt
kein Gegenstück (Kapitel 5 der Spec endet mit §5.7, `:4763-4780`). Wer „siehe §5.5" ohne Angabe des
Dokuments liest, landet im Runbook auf der Abbauliste und in der Spec auf „Der alte Purge ist kein
Cron" — **beide Dokumente liegen am Abbautag nebeneinander.** Deshalb schreibt Aufgabe 5.1 dieselbe
Zuordnung als **Umschlüsselungstabelle in den Kopf von §5 des Runbooks** (Hausform: Spec 2:130-146,
die für ihre eigenen Kapitelnummern genau das tut):

| Runbook-Abschnitt | Quelle in Spec 2 | Aufgabe |
|---|---|---|
| `## §5.1 — Standby: drei Fristen, weil drei Dinge geschützt werden` | §5.1 (4183–4234) | 5.1 |
| `## §5.2 — Die Zählungen vor dem Abbau: radio-admin` | §5.2.1–§5.2.2 (4238–4435) | 5.2 |
| `## §5.3 — Die Zählungen vor dem Abbau: radio-inventar` | §5.2.3 (4437–4567) | 5.3 |
| `## §5.4 — Die Archivprobe: beide Dateien werden geöffnet` | §5.2.4 (4569–4601) | 5.4 |
| `## §5.5 — Die Abbauliste` | §5.3, §5.3.1 (4605–4651) | 5.5 |
| `## §5.6 — Die Geheimnisse` | §5.4 (4655–4698) | 5.6 |
| `## §5.7 — Der alte Purge ist kein Cron` | §5.5 (4702–4729) | 5.7 |
| `## §5.8 — Der Redirect und sein Ende` | §5.6 (4733–4759) | 5.8 |
| `## §5.9 — Was der Abbau ausdrücklich nicht anfasst` | §5.7 (4763–4780) | 5.8 |
| `## §H — Wann dieser Cutover erfüllt ist` | Erfüllungspunkte (4784–4876) | 5.9 |

**Kein anderer Planteil benutzt `## §5.` oder `## §H`.** `§H` folgt der Hausform
(`files-cutover.md:360-370`) und ist der Schluss des Runbooks; er wird deshalb **zuletzt**
geschrieben (Aufgabe 5.9), damit er die Zahlen der vorher geschriebenen Abschnitte zählen kann statt
sie zu behaupten.

---

## Die neuen Leerstellen dieses Planteils (N7–N10)

Vier Ablesungen, für die die ⬜/E/U/C-Tabellen des Rahmens keine Nummer führen. Sie sind **keine
Entscheidungen**; jede ist eine Auskunft, die genau eine Zeile dieses Kapitels ausführbar macht.

| N | Was genau abzulesen ist | Quelle | Wo es gebraucht wird | Warum es heute keine Nummer hat |
|---|---|---|---|---|
| **N7** | **Ist die Zwei-Monats-Frist im PRODUKTIV laufenden `radio-admin` überhaupt konfigurierbar?** Gemessen an `265abd5` ist sie es **nicht**: `export const HISTORY_RETENTION_MONTHS = 2;` (`server/src/services/retentionService.ts:9`), und die Zeichenkette kommt weder in `.env.example` noch in `docker-compose.yml` vor (`git grep -n RETENTION 265abd5` liefert genau zwei Treffer, beide in derselben Datei). Abzulesen ist, ob das produktiv laufende Image `radio-admin:local` von genau diesem Stand gebaut wurde | Server (Image-Herkunft) / Betreiber | ⛔ §5.7 Kasten 1 · ⛔ §H Punkt 3 · ⛔ §H Punkt 31 · die Zulässigkeitsbedingung von §4.9 3a | §4.2 Nr. 3 formuliert „`HISTORY_RETENTION_MONTHS` in der Standby-Umgebung **neutralisieren** oder das Volume kopieren" und behandelt den ersten Zweig wie eine Env-Zeile. **Er ist keine.** Siehe Aufgabe 5.7 |
| **N8** | **Wohin gehen die zwei Archivdateien?** Zielsystem, Zugriffsweg, verantwortliche Person — und der Beleg, dass es **nicht** der Suite-Server ist | Betreiber | ⛔ §5.4 Protokollzeile · Abbauliste Posten 11 · §H Punkt 30 | Spec §5.2.4 (4599–4601) führt die Forderung („nicht auf demselben Server") und eine Leerzeile, aber keine Nummer — der Punkt fällt beim Abarbeiten der ⬜-Liste durchs Raster |
| **N9** | **Gibt es ein Traefik-Zugriffsprotokoll, wo liegt es, und wie lange wird es vorgehalten?** Traefik schreibt ein Access-Log nur bei gesetzter `accessLog`-Konfiguration; im Repo gibt es keinen Traefik-Dienst (`compose.yaml` führt `suite` und `clamav`, der Router hängt an fremden Labels) | Server (E7 nennt den Container) | ⛔ §5.8 Bedingung · Abbauliste Posten 10 · §H Punkt 35 | §5.6 setzt „vier zusammenhängende Wochen ohne Treffer" als **die** Abbaubedingung und führt eine Leerzeile „Protokollquelle: ____". Ohne Protokoll ist die Bedingung nie erfüllbar — und der Redirect lebt für immer, also genau der Zustand, den §5.6 verhindern soll |
| **N10** | **Wo liegen die zwei Alt-Checkouts auf dem Server?** Das Arbeitsverzeichnis, aus dem `docker compose -f radio-admin/docker-compose.yml …` und `… -f radio-inventar/docker-compose.yml …` laufen | Server, gleiche Wurzel wie U4 | jeder Befehl in §5.3 · §5.7 · §4.5 Schritt 1 und 3 · §4.9 3a/3b | U4 fragt, **was** das Frontend ausliefert; N10 fragt, **von wo** die Compose-Befehle laufen. Beide Alt-Repos liegen im Entwicklungsstand **neben** `iuk-suite`, nicht darin — die Spec schreibt die Pfade relativ und sagt nirgends, gegen welches Verzeichnis |

⚠️ **N7 ist der schärfste dieser vier**, und er ist kein Formalismus: fällt N7 auf „nicht
konfigurierbar", hat §4.2 Nr. 3 nur noch **einen** ausführbaren Zweig (Volume kopieren), und der
Rollback nach §4.9 3a wird von einer Bedingung abhängig, die niemand mehr erfüllen kann, wenn er
sie erst im Rollback liest.

---

## Was dieser Teil von anderen Teilen verbraucht

Die Umsetzerin sieht nur ihre eigene Aufgabe. Diese Tabelle ist deshalb die vollständige Liste der
Werte, die aus **anderen** Kapiteln kommen — mit dem exakten Namen, unter dem sie dort entstehen.

| Marke | Was es ist | Entsteht in | Ohne sie |
|---|---|---|---|
| `<freeze_iso>` | ISO-8601 **UTC**, der Freeze-Zeitpunkt | §4.5 Schritt 1 (`date -u +%Y-%m-%dT%H:%M:%SZ`) | Abfrage R hat in beiden Armen keinen Cutoff (W3) |
| `<umschwenk_iso>` / `<umschwenk_epoch_sekunden>` | ISO **und** Sekunden, der Umschwenk-Zeitpunkt | ⛔ **entsteht heute in keinem Schritt** — Zusage an den Planteil zu Kapitel 4, §4.5 Schritt 9 | §5.1 kann Standby-Ende und Ein-Stunden-Frist nicht datieren; §4.9s Nachtrag hat kein Filterargument |
| `$VOL_SUITE` | der **abgelesene** Name des Suite-Volumes (in Prod `suite_data`, `compose.yaml:252-254`) | §4.5 Schritt 4 Handgriff 1 (`docker volume ls \| grep -i suite`) | jede Zielarm-Abfrage liest ein anderes Volume; eine `0` sieht aus wie ein Datenbefund |
| Sollwerte A1 (fünf Zählungen + `api_tokens`) | die Zahlen gegen die Snapshot-Kopie | §4.5 Schritt 2 (§2.4) | Abfrage A hat keine linke Seite |
| Zahlen **R** und **Z** | einmal ermittelt, **zweimal gelesen** | §4.5 Schritt 5 (d) — dort als Freigabe | §5.2 hat keine Abbau-Sperre, und §4.6 Nr. 14 keinen Grund, `RADIO_HISTORIE_PURGE=0` zu entfernen (W10) |
| `radio-admin-snapshot.sqlite` | die `.backup`-Kopie, **nie** ein `cp` (W1) | §4.5 Schritt 2 | jede Quellarm-Abfrage liest eine abgeschnittene Datei — paritätsgrün |
| `radio-inventar-final-<stamp>.dump` | der `pg_dump` im Custom-Format | §4.5 Schritt 3, in §5.3 P6 wiederholt | das Postgres-Volume hat **keine** andere Sicherung |
| E2 / E3 / E7 / E8 | Volumenamen, `POSTGRES_USER`, Traefik-Container, ausstellende Person | §4.3 | siehe dort |
| U4 / U4a / U4b / U6 / U7 | Frontend-Auslieferung · `API_TOKEN`-Fundort · Host-Cron · OIDC-Clients · `AUTH_DEV_BYPASS` | Betreiber, **vor** dem Fenster | §5.5 Posten 14 · §5.6 · §5.7 · §5.6 Posten 13 · §5.2 Abfrage 8 |

---

# Aufgaben

---

### Aufgabe 5.1: Der Standby-Abschnitt — drei Fristen und das Protokollformular

Die Frist ist der einzige Teil dieses Kapitels, der **vor** dem Abbau gelesen wird. Sie muss deshalb
zuerst stehen und die Fehllesart, die diesen Cutover teuer macht, beim Namen nennen.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.1` **anfügen**, hinter dem letzten
  Abschnitt, den der Planteil zu Kapitel 4 geschrieben hat. Existiert die Datei noch nicht, wird sie
  mit Kopf nach Hausform angelegt (`files-cutover.md:1-7`: Titel, **Ziel**, **Grundlage** mit
  Spec-Pfad und Rückverweisregel).
- Test: keine Testdatei — die Abnahme ist die Gegenprobe in Schritt 5.

**Schnittstellen:**
- Verbraucht: `<umschwenk_iso>` und `<umschwenk_epoch_sekunden>` (⛔ Planteil Kapitel 4, §4.5
  Schritt 9) · die Zahlen **R** und **Z** (§4.5 Schritt 5 d)
- Liefert: die Abschnittsmarke `## §5.1` · die **Umschlüsselungstabelle Runbook↔Spec** im Kopf von
  §5 (zehn Zeilen, §5.1 … §5.9 und §H) · die drei benannten Fristen **Stunde 1** /
  **14 Tage** / **dauerhaft, off-server** · das Protokollformular mit den vier Feldern
  `<umschwenk_iso>`, `<umschwenk_epoch_sekunden>`, `Standby-Ende`, `Abbau verantwortet` · die
  Bedingung „die 14 Tage beginnen erst, wenn R grün protokolliert ist"

- [ ] **Schritt 1: Den Abschnittskopf, die Umschlüsselung und die Fristentabelle schreiben**

  ⚠️ **Die Umschlüsselungstabelle ist kein Beiwerk.** Runbook und Spec liegen am Abbautag
  nebeneinander, und ihre §5-Nummern stimmen ab §5.3 **nicht** überein (siehe „Der Namensraum
  dieses Planteils"). Die Tabelle steht deshalb **im Kopf von §5**, vor der ersten Frist — ein
  Verweis, den man erst nachschlagen muss, wenn er schon falsch verstanden wurde, kommt zu spät.
  Hausform: Spec 2 führt für ihre eigenen Kapitelnummern genau so eine Tabelle
  (`…2026-08-18-radio-cutover-design.md:130-146`).

  ````markdown
  ## §5.1 — Standby: drei Fristen, weil drei verschiedene Dinge geschützt werden

  Grundlage: Spec 2 §5.1 (`docs/superpowers/specs/2026-08-18-radio-cutover-design.md:4183-4234`).

  ⚠️ **Kapitel 5 dieses Runbooks und Kapitel 5 der Spec tragen NICHT dieselben Nummern.** Nur `§5.1`
  trifft, `§5.2` trifft halb; **ab `§5.3` ist dieses Runbook gegenüber der Spec um zwei verschoben**.
  Jeder Verweis in Kapitel 5 nennt deshalb **das Dokument dazu**. Die Umschlüsselung:

  | Abschnitt in DIESEM Runbook | Stelle in Spec 2 (`…2026-08-18-radio-cutover-design.md`) |
  |---|---|
  | **§5.1** Standby: drei Fristen | §5.1 (`:4183-4234`) |
  | **§5.2** Zählungen gegen radio-admin (A, T, R, Z, 8) | §5.2.1–§5.2.2 (`:4238-4435`) |
  | **§5.3** Zählungen gegen radio-inventar (P1–P6) | §5.2.3 (`:4437-4567`) |
  | **§5.4** Die Archivprobe | §5.2.4 (`:4569-4601`) |
  | **§5.5** Die Abbauliste | §5.3, §5.3.1 (`:4605-4651`) |
  | **§5.6** Die Geheimnisse | §5.4 (`:4655-4698`) |
  | **§5.7** Der alte Purge ist kein Cron | §5.5 (`:4702-4729`) |
  | **§5.8** Der Redirect und sein Ende | §5.6 (`:4733-4759`) |
  | **§5.9** Was der Abbau nicht anfasst | §5.7 (`:4763-4780`) |
  | **§H** Wann dieser Cutover erfüllt ist | Erfüllungspunkte (`:4784-4876`) |

  ⚠️ **Die zwei gefährlichsten Kollisionen, ausgeschrieben:** „§5.5" heißt **hier** die Abbauliste
  und **in der Spec** „Der alte Purge ist kein Cron"; „§5.3" heißt **hier** P1–P6 und **in der Spec**
  die Abbauliste. Und **`§5.8`/`§5.9` haben in der Spec gar kein Gegenstück** — Kapitel 5 der Spec
  endet mit §5.7.

  **Der Abbau ist die einzige unumkehrbare Handlung dieses Cutovers.** Alles davor ist ein
  Routing-Vorgang oder ein wiederholbarer Import; ab dem gelöschten Volume gibt es keine Quelle
  mehr, gegen die man nachschlagen könnte.

  | Frist | Was sie schützt | Woran sie hängt |
  |---|---|---|
  | **Stunde 1 nach dem Umschwenk** | Den **Rückweg**: `SUITE_HOST_RADIO=` leeren, `radio.iuk-ue.de` aus `SUITE_TRAEFIK_RULE` nehmen, beide Alt-Stacks in der Reihenfolge 3a–3d zurückholen (§4.9) | Ab dem **ersten fachlichen Schreibvorgang** in `radio.db` ist Rollback ein **Datenverlust mit bekanntem Umfang**. In dieser Stunde bleibt der Kiosk unter Beobachtung; danach nur noch vorwärts |
  | **14 Tage** | Die **Datenquelle** für feldweise Nachprüfung und Re-Import: das radio-admin-Volume bzw. seine Snapshot-Kopie, das radio-inventar-Postgres-Volume, beide Images | ⚠️ **Nicht** der Rückweg — der ist nach Stunde 1 vorbei. Die 14 Tage sind die Zeit, in der ein **Zuordnungsfehler** auffällt, den kein Tor sieht |
  | **Dauerhaft, off-server** | Das **Archiv**: `radio-admin-snapshot.sqlite` und der `pg_dump` im Custom-Format, **nicht** auf demselben Server wie die Suite (Spec 1 §9.5.1) | Es ist der Rest, der die Volumes überlebt. Ablageort: **N8** |

  ⚠️ **Die Fehllesart, die diesen Cutover teuer macht:** die 14 Tage als „Rollback-Fenster" zu
  lesen. Wer das tut, entspannt die Abnahme („wir können ja zurück") — und genau das kann er nach
  Stunde 1 nicht mehr. **Die Abnahme (§4.6) ist die einzige Stelle, an der noch etwas billig ist.**
  ````

- [ ] **Schritt 2: Die Rechnung hinter den 14 Tagen ausschreiben — sie wird sonst gekürzt**

  ````markdown
  ### Warum 14 Tage und nicht sieben

  Die Frist folgt aus dem **Erstlauf der übernommenen Retention** (Vorbelegung **1440 Minuten**,
  also ein Tag, B5):

  1. Ein **Faktor-1000-Fehler ist paritätsgrün** — beide Paritätsarme laufen durch **dieselbe**
     Mapping-Funktion (`scripts/import/parity.ts:43-56`, ausgeschrieben in
     `scripts/import/portal.ts:73-76`).
  2. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr **1970**. Der Schaden entsteht
     nicht beim Import, sondern beim **ersten Retention-Lauf** — frühestens **einen Tag nach dem
     Umschwenk**, und dann still: die abgeschlossene Leihhistorie ist weg, aktive Leihen leben
     weiter, die Oberfläche sieht funktionsfähig aus.
  3. Die **einzige** Quelle, aus der diese Historie zurückkommt, ist das radio-admin-Volume bzw.
     seine Snapshot-Kopie.
  4. „Einen Tag nach dem Umschwenk" ist der **frühestmögliche** Zeitpunkt der Sichtbarkeit, nicht
     der wahrscheinliche: bemerkt wird eine fehlende Historie, wenn jemand sie braucht — bei einer
     Nachfrage, einer Auswertung, einem Monatsabschluss. **14 Tage decken einen vollen
     Dienstzyklus ab** und lassen nach dem verdächtigen Tag noch dreizehn Tage zum Nachschlagen.
  ````

- [ ] **Schritt 3: Das Protokollformular schreiben — mit BEIDEN Umschwenk-Formaten**

  ⚠️ Das ist der Punkt, an dem dieser Abschnitt eine Zusage von Kapitel 4 einfordert. `<umschwenk_
  epoch_sekunden>` ist zugleich das Filterargument des Nachtrags in §4.9 (dort steht es heute als
  Platzhalter, den **kein Schritt erzeugt**) und der Nullpunkt der Ein-Stunden-Frist. Ein Datum
  allein („Umschwenk am: ____") trägt keines von beidem.

  ````markdown
  ### Das Standby-Protokoll

  **Ohne Datum und Namen endet ein Standby nie** — dann steht in einem Jahr ein gestoppter Stack,
  den niemand mehr erklären kann, und niemand traut sich, ihn zu löschen.

  > Umschwenk (ISO, UTC) `<umschwenk_iso>`: ____________________
  > Umschwenk (Epoch-Sekunden) `<umschwenk_epoch_sekunden>`: ____________
  >   — beide aus §4.5 Schritt 9, **eine** Ablesung, zwei Schreibweisen.
  >   Die Sekundenzahl ist das Filterargument des Nachtrags in §4.9 und der Nullpunkt
  >   der Ein-Stunden-Frist; das Datum allein ist für beides zu grob.
  > Standby-Ende (Umschwenk + 14 Tage): ____________
  > Abbau verantwortet (Name): ____________________

  ⚠️ **Verlängerungsgrund, benannt:** ist die Retention-Gegenprobe **Abfrage R** (§5.2) **nicht**
  grün protokolliert, **beginnen die 14 Tage erst, wenn sie es ist.** Eine offene Gegenprobe heißt:
  es ist unbekannt, ob die Historie im Ziel angekommen ist — und dann ist das Volume nicht Standby,
  sondern die **einzige Kopie**.
  **Dasselbe Kriterium hängt am Entfernen von `RADIO_HISTORIE_PURGE=0`** (§4.6 Nr. 14, W10):
  **R und Z werden einmal ermittelt und zweimal gelesen** — dort als Freigabe, hier als
  Abbau-Sperre. Dieselbe Protokollzeile.

  > Abfrage R grün protokolliert am: ____________ · Abfrage Z grün protokolliert am: ____________
  > → Beginn der 14 Tage: ____________
  ````

- [ ] **Schritt 4: Die zwei Sätze schreiben, die dieses Kapitel von den fünf vorherigen trennen**

  ````markdown
  ### Zwei Sätze, die diesen Abbau von den fünf vorherigen des Hauses trennen

  * ⚠️ **Der billige Rückweg endet früher als das Standby-Fenster.** Bei `files` und `lagerbuch`
    war „Router zurück" bis zum Abbau möglich (`files-cutover.md:299-301`). Hier stirbt der
    Rückweg nach **einer Stunde** (§4.9), weil der erste fachliche Schreibvorgang in `radio.db`
    der Point of no return ist **und es keinen Rückweg-Importer gibt**
    (`docs/radio-portierung-analyse.md:626-628`).
  * ⚠️ **„Beide parken und in Ruhe schauen" ist hier nicht möglich, und Nachschlagen ist aktiv
    zerstörend.** Der Alt-Kiosk hielt `radio.iuk-ue.de` selbst (gesetzte Entscheidung 3) — es gibt
    keinen Zustand, in dem beide bedienen. Und **jeder Start von `radio-admin` löscht Historie**
    (Spec 1 §9.3.4; Mechanik in §5.7 dieses Runbooks).
  ````

- [ ] **Schritt 5: Gegenprobe — die drei Fristen sind drei, die Umschlüsselung ist vollzählig, und
      beide Umschwenk-Formate stehen da**

  ```bash
  # (a) genau drei Fristenzeilen in der Tabelle:
  sed -n '/^## §5.1 /,/^### Warum 14 Tage/p' docs/runbooks/radio-cutover.md \
    | grep -cE '^\| \*\*(Stunde 1|14 Tage|Dauerhaft)'
  # Erwartung: 3

  # (a2) die Umschluesselung fuehrt jede Marke dieses Kapitels — zehn Zeilen:
  sed -n '/^## §5.1 /,/^### Warum 14 Tage/p' docs/runbooks/radio-cutover.md \
    | grep -cE '^\| \*\*(§5\.[1-9]|§H)\*\*'
  # Erwartung: 10   (§5.1 … §5.9 und §H, jede genau einmal)
  # ⚠️ Eine fehlende Zeile ist kein Schoenheitsfehler: sie ist genau der Verweis,
  #    den am Abbautag jemand im falschen Dokument nachschlaegt.

  # (b) beide Umschwenk-Marken stehen im Formular:
  grep -c 'umschwenk_iso\|umschwenk_epoch_sekunden' docs/runbooks/radio-cutover.md
  # Erwartung: >= 3 (zwei Formularzeilen + der Verweis auf §4.9)
  ```

  ⚠️ Liefert (b) `0`, ist die Zusage an Kapitel 4 nicht gestellt und §4.9s Nachtrag bleibt
  unausführbar. **Das ist ein Stopp-Punkt für diese Aufgabe, kein Hinweis.**

- [ ] **Schritt 6: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): Standby-Fristen, die Rechnung dahinter und das Protokollformular"
  ```

---

### Aufgabe 5.2: Die Zählungen gegen radio-admin — A, T, R, Z und die U7-Frage

Der Kern des Kapitels. **Jede Zahl hier ist ein Schritt, keine Angabe.** „Bestand annehmen statt
zählen" ist der beim Namen genannte Fehler der Phase 4
(`docs/radio-portierung-analyse.md:1777`).

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.2` anfügen
- Test: keine Testdatei — die Abnahme ist die Gegenprobe in Schritt 7

**Schnittstellen:**
- Verbraucht: `radio-admin-snapshot.sqlite` (§4.5 Schritt 2) · `$VOL_SUITE` (§4.5 Schritt 4
  Handgriff 1) · `<freeze_iso>` (§4.5 Schritt 1) · die Sollwerte aus A1 (§2.4) · **E2**
- Liefert: die vier benannten Abfrageblöcke **A**, **T**, **R**, **Z** und den Block
  **Abfrage 8 (= A9, beantwortet U7)** · je Block eine Zeile *Erwartung · Abweichung bedeutet ·
  Folge* · die Feststellung „**fünf** Paare, nicht sechs" · die Feststellung „**alle zehn** Zahlen
  von Z müssen `0` sein"

- [ ] **Schritt 1: Kopf, Geltungsbereich und die Abgrenzung gegen A1–A13**

  ⚠️ **Die Abgrenzung ist tragend:** A1–A13 hier vollständig zu wiederholen verwässert genau die
  Liste, die unter Zeitdruck gelesen wird.

  ````markdown
  ## §5.2 — Die Zählungen vor dem Abbau: radio-admin

  Grundlage: Spec 2 §5.2.1–§5.2.2 (`…2026-08-18-radio-cutover-design.md:4238-4435`).

  ⚠️ **Keine Zahl in diesem Abschnitt ist ein Wert; jede ist ein Schritt.** Insbesondere ist
  `radio-admin/data/data.sqlite` als Beleg **unbrauchbar** (Randbedingung 8: leer und vorbaselinig,
  `.tables` zeigt weder `loans` noch `users` noch `api_tokens`). Wer eine Zahl aus dieser Datei ins
  Protokoll schreibt, protokolliert einen Stand **vor** der Loan-Migration.

  **Alle SQLite-Abfragen gegen die Quelle laufen gegen die Snapshot-Kopie, niemals gegen einen
  gebooteten Alt-Stack** (Spec 1 §9.3.4 Zeile 2). Der Grund steht in §5.7: **der Start selbst
  löscht.**

  **Was hier NICHT noch einmal läuft** — und warum nicht:

  | Abfrage | Gehört zu | Warum nicht hier |
  |---|---|---|
  | A2 `is_target = 1` | vor dem Import | Ein Import-Tor. Vor dem Abbau beweist eine Wiederholung nichts — die Kopie hat sich nicht geändert |
  | A3 Waisen in `device_events` | vor dem Import | FK-Kante; der Import bricht hart ab, wenn sie verletzt ist — das ist laut, nicht still |
  | A4 doppelte aktive Leihen | vor dem Import | Sonst lässt sich der partielle Aktiv-Index im Ziel nicht anlegen |
  | A5 `source` außerhalb des Enums | vor dem Import | TS-Enum ohne DB-CHECK |
  | A6 Zeitstempel-Größenordnung | vor dem Import | Zehnstellig → Cutover **abgesagt**, nicht angepasst |
  | A7 `sqlite_master` auf Trigger/Views | vor dem Import | Fachlogik, die kein Repo kennt |
  | **A1 / Retention-Zahl** | ⚠️ **beides** — hier als **Abfrage A** und **Abfrage R** | R ist die **einzige** Zahl, die der Faktor-1000-Fehler nicht paritätsgrün überlebt |
  | **A9 `dev-user`** | **hier**, falls nicht vor dem Import protokolliert | Sie beantwortet **U7** und ist nach dem gelöschten Volume nicht mehr beantwortbar |

  > Echter radio-admin-Volumename (**E2**): ____________________
  > Snapshot-Kopie liegt unter: ____________________
  > Freeze-Zeitpunkt `<freeze_iso>` (ISO, UTC): ____________
  > Suite-Volumename `$VOL_SUITE`, hier neu abgelesen: ____________________
  >   ⛔ gegengelesen gegen die Protokollzeile aus §4.5 Schritt 4 Handgriff 1 (Fenster-Protokoll):
  >   ☐ derselbe Name · ☐ **abweichend → Stopp**. Zwei Ablesungen, **ein** Name — die zweite ist
  >   nötig, weil diese Sitzung vierzehn Tage später in einer neuen Shell läuft, **nicht** weil es
  >   zwei Volumes gäbe.
  ````

- [ ] **Schritt 2: Abfrage A schreiben — und den Zielarm auf die Containerform ziehen**

  ⚠️ **Das ist die Korrektur, die die Re-Kritik dreimal gemeldet hat** (RK-A4 erster Durchgang,
  RK-A4 zweiter, RK-A2 dritter — **derselbe** Fund). Der Zielarm stand als
  `sqlite3 -readonly "$DATA_DIR/radio.db"` **auf dem Host**. Diesen Pfad gibt es dort nicht:
  `DATA_DIR=/data` ist ein Wert **im Container** (`compose.yaml:79`), gemountet wird das **benannte
  Volume** `suite_data` (`compose.yaml:99`, `:221-223`), und ein benanntes Volume hat keinen
  vereinbarten Host-Pfad. Die Nachbarblöcke R und Z verbieten die Form zwanzig Zeilen weiter
  ausdrücklich; A war der eine von dreien, an dem sie stehen blieb.

  ````markdown
  ### Abfrage A — die Zählungen, paarweise ⛔

  **Quelle** (sechs Zahlen, gegen die Kopie):

  ```bash
  sqlite3 radio-admin-snapshot.sqlite "
  select 'devices',           count(*) from devices
  union all select 'software_versions', count(*) from software_versions
  union all select 'api_tokens',        count(*) from api_tokens
  union all select 'users',             count(*) from users
  union all select 'device_events',     count(*) from device_events
  union all select 'loans',             count(*) from loans;"
  ```

  **Ziel** (**fünf** Zahlen, gegen `radio.db` **im Volume**):

  ```bash
  # ⚠️ ZUERST den ECHTEN Volume-Namen ablesen. Das ist die ZWEITE Ablesung
  #    desselben Namens — die erste steht in §4.5 Schritt 4 Handgriff 1, im
  #    Fenster-Protokoll. Sie wird hier NICHT geerbt, und das ist Absicht:
  #    dieser Abschnitt laeuft fruehestens vierzehn Tage spaeter in einer NEUEN
  #    Shell, in der die Zuweisung von damals laengst weg ist. Eine ungesetzte
  #    Variable liest ein leeres Volume, und dessen Nullen sehen aus wie ein
  #    Datenbefund.
  # ⛔ BEIDE Ablesungen MUESSEN denselben Namen ergeben. Der hier abgelesene Wert
  #    wird gegen die Protokollzeile aus §4.5 Schritt 4 Handgriff 1 GEGENGELESEN,
  #    bevor eine einzige Zahl gezaehlt wird. Zwei verschiedene Namen heissen:
  #    hier wird ein anderes Volume gezaehlt als im Fenster befuellt wurde —
  #    Stopp-Punkt, kein Datenbefund. Zwei Ablesungen desselben Namens sind zwei
  #    Gelegenheiten fuer zwei verschiedene Volumes; genau dagegen steht das
  #    Gegenlesen.
  docker volume ls | grep -i suite
  VOL_SUITE=<die Zeile aus dem Befehl oben>     # in Prod: suite_data (compose.yaml:252-254)

  # Gegenprobe VOR der ersten Zaehlung — sie entscheidet, ob eine 0 ein Befund ist:
  docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data
  #   Erwartet: portal.db, qr.db, feedback.db, files.db, lagerbuch.db, aufgaben.db,
  #   konto.db UND radio.db (die sieben aus MODULE_MIGRATIONS + CORE_MIGRATIONS,
  #   src/core/bootstrap.ts:20-49, :67-69, plus radio.db aus dem Import).
  #   Steht dort NUR radio.db, ist der Volume-Name falsch: `docker run` hat ein
  #   neues, leeres Volume angelegt, und JEDE folgende 0 ist ein Volume-Fehler,
  #   kein Datenbefund.

  for t in devices software_versions users device_events loans; do
    printf '%s\t' "$t"
    echo "select count(*) from $t;" | docker run --rm -i -v "$VOL_SUITE":/data alpine \
      sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  done

  # zusaetzlich, nur fuers Protokoll — Tabelle ohne Quellgegenstueck:
  echo "select 'zugangscodes', count(*) from zugangscodes;" | docker run --rm -i \
    -v "$VOL_SUITE":/data alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  ```

  ⚠️ **Mount OHNE `:ro`, `sqlite3 -readonly`, ⛔ kein `immutable=1`.** SQLite im WAL-Modus braucht
  zum **Lesen** eine beschreibbare `-shm`-Datei; auf einem `:ro`-Mount scheitert der Befehl mit
  „unable to open database file", **obwohl die Datenbank in Ordnung ist**. Und `immutable=1` ist
  hier **nicht** zulässig: zum Abbau-Zeitpunkt bedient der reguläre Stack `radio.iuk-ue.de` seit
  vierzehn Tagen, das Modul hält sein Handle über die Prozesslebensdauer
  (`src/core/db/index.ts:31-35`, `globalThis.__suiteDb`). Zurückbleibende `-wal`/`-shm` sind
  harmlos und gehören ins Protokoll.

  ⚠️ **Es sind fünf Paare, nicht sechs** (W4). Die Sechser-Schleife aus Spec 1 §9.4.3 scheitert im
  Zielarm an `no such table: api_tokens` — laut, aber ein verbrannter Schritt im Abbau-Protokoll.

  * **Erwartung:** fünf Paare gleich, **paarweise, nicht in der Summe**.
  * **Abweichung bedeutet:** entweder ist der Import unvollständig, oder `radio.db` ist eine frisch
    angelegte, leere Datei — `openModuleDatabase` legt Verzeichnis und Datei bei Bedarf an
    (`src/core/db/index.ts:12-22`), `/api/health/radio` wäre dabei **grün**.
  * **Folge:** ⛔ **blockiert den Abbau.** Ohne fünf gleiche Paare wird kein Volume gelöscht.
  * `zugangscodes` hat kein Quellgegenstück und ist **nur Protokoll**. ⚠️ **Zeitindex beachten:**
    in §4.5 Schritt 5 (a) — **vor** der ersten Codeausstellung — MUSS diese Zahl `0` sein; **hier**,
    vierzehn Tage nach §4.8.2, ist eine Zahl **> 0 richtig und erwartet**. Wer die Zeile aus
    Schritt 5 hierher kopiert, erzeugt ein falsches Rot auf einer ⛔-Sperre.

  > A — Quelle: devices ____ · software_versions ____ · api_tokens ____ · users ____ ·
  > device_events ____ · loans ____
  > A — Ziel: devices ____ · software_versions ____ · users ____ · device_events ____ ·
  > loans ____ · zugangscodes ____ (Protokoll, > 0 erwartet)
  > Fünf Paare gleich? ☐ ja ☐ nein · geprüft am ____________
  ````

- [ ] **Schritt 3: Abfrage T — die `api_tokens`-Archivzeile**

  ````markdown
  ### Abfrage T — die `api_tokens`-Archivzeile ⛔

  Sie ersetzt die Migration und ist eine ausdrückliche Zusage von Spec 1 §2.10 Nr. 1 an Spec 2.

  ```bash
  sqlite3 -header -column radio-admin-snapshot.sqlite \
    "select id, name, prefix, created_at, last_used_at, revoked_at from api_tokens;"
  ```

  * **Erwartung:** produktiv wenige Zeilen, davon **höchstens eine** mit `revoked_at IS NULL` — der
    Alt-Kiosk (Randbedingung 5: **kein externer Konsument**).
  * **Abweichung bedeutet:** mehr als eine lebende Zeile heißt, es gab mehr als einen Konsumenten —
    dann ist Betreiberantwort 3 überholt und **es gibt einen Abnehmer, den niemand angekündigt hat**.
  * **Folge:** ⛔ **blockiert den Abbau**, bis geklärt ist, wer die zweite lebende Zeile benutzt hat.
    Der Klartext ist nie gespeichert — eine mitgenommene Zeile wäre nicht einlösbar. Die Frage ist
    also keine **Migrations**frage, sondern eine **Konsumenten**frage.
  * Die Ausgabe geht **wörtlich** ins Protokoll, **ohne `token_hash`**: `last_used_at` ist nach dem
    gelöschten Volume nicht mehr abfragbar.

  > T — Zeilen gesamt: ____ · davon `revoked_at IS NULL`: ____ · Ausgabe im Protokoll ☐
  ````

- [ ] **Schritt 4: Abfrage R — die Retention-Gegenprobe, mit `<freeze_iso>` in BEIDEN Armen**

  ````markdown
  ### Abfrage R — die Retention-Gegenprobe ⛔

  Die eine Stelle, an der der Faktor-1000-Fehler **nicht** paritätsgrün bleibt.

  ```bash
  # Quelle, Millisekunden. <freeze_iso> ist der in §4.5 Schritt 1 protokollierte
  # Freeze-Zeitpunkt, NICHT 'now': 'now' wandert zwischen Import und Abbau und liefert
  # zwei Zahlen, die sich nicht vergleichen lassen (W3).
  sqlite3 radio-admin-snapshot.sqlite "
  select count(*) from loans
   where returned_at is not null
     and returned_at < (strftime('%s','<freeze_iso>','-2 months') * 1000);"

  # Ziel, Sekunden — derselbe Cutoff, ohne Faktor. Gelesen wird die Datei IM VOLUME,
  # gegen dieselbe $VOL_SUITE-Protokollzeile wie oben: `$DATA_DIR/radio.db` gibt es
  # auf dem HOST nicht (compose.yaml:79, :99, :221-223).
  echo "select count(*) from loans
   where returned_at is not null
     and returned_at < strftime('%s','<freeze_iso>','-2 months');" \
  | docker run --rm -i -v "$VOL_SUITE":/data alpine \
      sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly /data/radio.db'
  ```

  * ⚠️ **Der Faktor 1000 steht im Quellarm absichtlich im SQL** und **nicht** im Zielarm. Wer ihn im
    Quellarm weglässt, zählt **alle** zurückgegebenen Leihen und hält das für eine bestätigte
    Schätzung. Wer ihn im Zielarm hinzufügt, zählt null und hält das für „nichts betroffen".
  * **Erwartung:** beide Zahlen gleich. Diese Zahl ersetzt die Betreiber-**Schätzung** „< 100" durch
    eine **Zählung** — die Schätzung war nie eine Zählung.
  * **Abweichung bedeutet:** Zielarm deutlich **höher** → der Faktor-1000-Fehler hat zugeschlagen,
    die Zeitstempel liegen im Jahr 1970, und der **nächste Retention-Lauf löscht die komplette
    abgeschlossene Leihhistorie**. Zielarm **niedriger** → der Import hat Zeilen verloren, die
    Abfrage A nicht gesehen hat (A zählt, sie datiert nicht).
  * **Folge:** ⛔ **blockiert den Abbau** und, wenn sie vor dem Erstlauf der Retention auffällt,
    **auch den Weiterbetrieb**: `RADIO_HISTORIE_PURGE=0` setzen, dann neu importieren.

  > R — Quelle: ________ · Ziel: ________ · gleich? ☐ ja ☐ nein · geprüft am ____________
  ````

- [ ] **Schritt 5: Abfrage Z — zehn Zeilen, und das Wort „zehn" steht über zehn Zeilen**

  ⚠️ **Diese Fassung FOLGT, sie führt nicht.** Die Leitfassung von Abfrage Z steht in
  **§C Schritt 5 (d)** (Teil 4); dieselbe Abfrage steht ein drittes Mal in der Generalprobe
  (§P.7). Die zehn Glieder sind in allen dreien **zeichengleich**; abweichen darf **allein** die
  Zugriffsform (Generalprobe: Bind-Pfad `$GP/data/radio.db`; Fenster und Abbau:
  `docker run … -v "$VOL_SUITE":/data`). **Wer hier eine Zeile ändert, ändert sie in allen
  dreien** — sonst prüft die Abbau-Sperre eine andere Abfrage, als das Fenster gefahren hat, und
  das Protokoll, aus dem sie Wochen später abliest, gehört zu einer anderen Frage.

  ````markdown
  ### Abfrage Z — die Zeitstempel-Grenzprobe ⛔

  Billiger als R, findet denselben Fehler ohne einen Cutoff — **und sie sagt, WELCHE Spalte
  betroffen ist.**

  ⚠️ Gelesen wird die Datei **im Volume**, Mount **ohne** `:ro`, `sqlite3 -readonly`, ⛔ **kein**
  `immutable=1` — Begründung bei Abfrage A.

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

  * `946684800` = 2000-01-01T00:00:00Z, `4000000000` = 2096-10-02T07:06:40Z.
    **Alle ZEHN Zahlen MÜSSEN `0` sein** — neun Zahlgrenzproben **plus** die Formatprobe auf
    `devices.last_updated_at`.
  * ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
    Millisekunden-Quelle (Jahr 1970), `> 4000000000` fängt die **Gegenrichtung** — rohe
    Millisekunden, die ungeteilt in einer Sekundenspalte landen (Jahr 57000).
  * ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
    Spalte mit Typwechsel (`integer` ms → `text YYYY-MM-DD`); für sie ist die Grenzprobe eine
    **Formatprobe**. Sie sagt nichts über die **Zone**.
  * **Abweichung bedeutet:** genau der Faktor-1000-Fehler; der Mapper hat je Feld eine eigene Zeile,
    also ist die Fehlerstelle benannt.
  * **Folge:** ⛔ **blockiert den Abbau.**

  > Z — zehn Zeilen, jede einzeln eintragen (nicht „alles 0"):
  > loans.returned_at ____ · loans.borrowed_at ____ · loans.created_at ____ ·
  > loans.updated_at ____ · devices.created_at ____ · devices.updated_at ____ ·
  > software_versions.created_at ____ · users.last_seen_at ____ ·
  > device_events.changed_at ____ · devices.last_updated_at (Formatprobe) ____
  ````

- [ ] **Schritt 6: Abfrage 8 — `dev-user`, die Antwort auf U7**

  ````markdown
  ### Abfrage 8 — `dev-user` in den Audit-Spalten (= A9, beantwortet **U7**)

  Nur nötig, falls nicht schon vor dem Import protokolliert.

  ```bash
  sqlite3 radio-admin-snapshot.sqlite "select sub from users;"
  sqlite3 radio-admin-snapshot.sqlite "select distinct created_by from devices;"
  ```

  * **Abweichung bedeutet:** ein `dev-user` unter den Audit-Spalten heißt, `AUTH_DEV_BYPASS` war
    irgendwann aktiv, und die Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.
  * **Folge:** **nur Protokoll** — aber nach dem gelöschten Volume ist die Frage **nicht mehr
    stellbar**. Deshalb steht sie hier und nicht „irgendwann".

  > U7 beantwortet: ☐ kein `dev-user` gefunden ☐ `dev-user` gefunden in: ____________________
  ````

- [ ] **Schritt 7: Gegenprobe — die Zahl im Kopf gegen die Zahl im Rumpf**

  ```bash
  # (a) Z fuehrt genau zehn Glieder — gemessen, nicht behauptet:
  sed -n '/^### Abfrage Z/,/^### /p' docs/runbooks/radio-cutover.md | grep -cE "^select '"
  # Erwartung: 10   (dieselbe Zaehlung gegen die Spec liefert ebenfalls 10:
  #   (NACHTRAG 2026-08-28: wortlaut-verankert, vorher der feste Bereich '4376,4410p'.
  #    ⚠️ Der Anker ist die ERSTE Z-ZEILE, nicht der Abschnitt: die Spec hat keine
  #    '### Abfrage Z'-Ueberschrift, und '/^### 5.2.2 /,/^### 5.2.3 /p' liefert ELF —
  #    das erste Glied von Abfrage A beginnt ebenfalls mit "select '". Beides gemessen.)
  #   sed -n "/^select 'loans.returned_at',        count/,/^\`\`\`$/p" \
  #         docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
  #     | grep -cE "^select '")

  # (b) das Wort ueber der Liste nennt dieselbe Zahl:
  grep -c 'Alle ZEHN Zahlen MÜSSEN' docs/runbooks/radio-cutover.md      # Erwartung: 1
  grep -c 'Alle drei\|alle drei `0`' docs/runbooks/radio-cutover.md     # Erwartung: 0

  # (c) das Protokollformular fuehrt zehn Eintragefelder — §5.2-LOKAL gezaehlt, wie (a):
  # ⚠️ Dieselbe Anfangszeile traegt auch die LEITFASSUNG in §C Schritt 5 (d). Ohne den
  #   Abfrage-Z-Rahmen trifft der Bereich im zusammengefuehrten Runbook ZWEIMAL und die
  #   Zaehlung liest 20 — ein Defekt, wo keiner ist.
  sed -n '/^### Abfrage Z/,/^### /p' docs/runbooks/radio-cutover.md \
    | sed -n '/^> Z — zehn Zeilen/,/^$/p' | grep -o '____' | wc -l
  # Erwartung: 10

  # (d) KEIN Zielarm liest mehr auf dem Host:
  grep -n 'sqlite3 -readonly "\$DATA_DIR/radio.db"' docs/runbooks/radio-cutover.md
  # Erwartung: GENAU EIN Treffer, und er ist namentlich bekannt — die Zeile
  #   "Generalprobe" der Lauf-Tabelle in §L.3. Dort ist DATA_DIR ein BIND-PFAD
  #   ($GP/data, §3.1.2, wie §1.8 Glied (4)), die Form ist deshalb erlaubt und
  #   ausdruecklich vorgeschrieben.
  # ⛔ Ein ZWEITER Treffer ist der Fund, den dieser Schritt sucht: eine
  #   Fenster- oder Abbau-Zeile auf dem Host-Pfad. Das ist ein Stopp-Punkt
  #   (compose.yaml:79, :99, :221-223).
  # ⚠️ "Keine Ausgabe" waere die FALSCHE Erwartung und wuerde beim ersten Lauf
  #   als Defekt gelesen — dieselbe Feststellung, die §L Schritt 4 fuer seine
  #   eigene, weitere Suchform 'DATA_DIR/radio.db' trifft (2026-08-18-plan2-radio-paritaet.md:860-870:
  #   dort zwei Treffer, §L.2 und §L.3). Die weitere Form traegt hier nicht mehr:
  #   ab §C zitieren mehrere Runbook-Absaetze den verbotenen Pfad im WARNTEXT
  #   (u. a. §C Schritt 4 und Schritt 5 (a)); gezaehlt wird deshalb die
  #   BEFEHLSFORM, nicht die Zeichenkette.
  ```

- [ ] **Schritt 8: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): die vier Abbau-Sperren A, T, R, Z gegen radio-admin — Zielarm im Volume, Z mit zehn Zeilen"
  ```

---

### Aufgabe 5.3: Die Zählungen gegen radio-inventar — P1 bis P6

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.3` anfügen
- Test: keine Testdatei — Gegenprobe in Schritt 6

**Schnittstellen:**
- Verbraucht: **E3** (echter `POSTGRES_USER`, echter Volumename) · **N10** (Arbeitsverzeichnis der
  Alt-Checkouts) · `radio-inventar-final-<stamp>.dump` aus §4.5 Schritt 3
- Liefert: die sechs Blöcke **P1**–**P6** · die Feststellung „**P6** ist die **einzige** Sicherung,
  die dieses Volume je hatte" · die Einstufung: P1–P4 und P6 sind ⛔, **P5 ist Protokoll**

- [ ] **Schritt 1: Kopf, Arbeitsverzeichnis und die zwei Vorbelegungen**

  ⚠️ **Der Kopf muss das Arbeitsverzeichnis nennen.** Jeder Befehl dieses Abschnitts beginnt mit
  `docker compose -f radio-inventar/docker-compose.yml …`; aus dem Suite-Repo gefahren antwortet er
  `no configuration file provided`. Wo die Checkouts auf dem Server liegen, ist **N10**.

  ````markdown
  ## §5.3 — Die Zählungen vor dem Abbau: radio-inventar (der Postgres, bevor er stirbt)

  Grundlage: Spec 2 §5.2.3 (`…2026-08-18-radio-cutover-design.md:4437-4567`).

  ⚠️ **Arbeitsverzeichnis:** jeder Befehl unten läuft aus dem Verzeichnis, das die zwei
  Alt-Checkouts enthält — **nicht** aus dem Suite-Repo. Im Entwicklungsstand liegen `radio-admin/`
  und `radio-inventar/` **neben** `iuk-suite/`; wo sie auf dem Server liegen, ist **N10**.
  > Arbeitsverzeichnis auf dem Server: ____________________

  ⚠️ **Zwei Zugangswerte sind Vorbelegungen, keine Tatsachen** — beide **vor** dem ersten Befehl
  ablesen und ins Protokoll schreiben (**E3**). `POSTGRES_USER` trägt nur `${POSTGRES_USER:-radio}`
  (`radio-inventar/docker-compose.yml:7`), der Volumename bekommt das Projektpräfix
  (`postgres_data`, `:12`). Hart gesetzt ist nur `POSTGRES_DB: radio_inventar` (`:10`).

  ```bash
  docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
  docker volume ls | grep -i postgres_data
  ```

  > Echter POSTGRES_USER: ____________ · echter Volumename: ____________________

  ⚠️ **Die Anführungszeichen sind tragend.** Prisma legt die Tabellen in gemischter
  Groß-/Kleinschreibung an; Postgres braucht dafür doppelte Anführungszeichen im SQL. Deshalb steht
  das SQL in **einfachen** Anführungszeichen — ein `-c "…"` mit doppelten außen zerstört die
  inneren, und die Abfrage scheitert an einer nicht existierenden Relation `adminuser`.

  ```bash
  PG="docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
      psql -U <echter POSTGRES_USER> -d radio_inventar -c"
  ```
  ````

- [ ] **Schritt 2: P1 und P2 schreiben — Grundwahrheit und Bestandsfrage**

  ````markdown
  ### P1 — welche Tabellen existieren wirklich? ⛔

  ```bash
  $PG 'select tablename from pg_tables where schemaname = '"'"'public'"'"' order by 1;'
  ```

  * **Erwartung (abgeleitet, nicht gezählt):** `AdminUser`, `_prisma_migrations`, evtl. `session`.
    ⚠️ Der Tabellenbestand war bisher aus fünf Migrationsdateien plus einer handgepflegten
    `create-session-table.sql` **abgeleitet**; **aus einem Repository lässt sich der
    Prod-Tabellenbestand grundsätzlich nicht ableiten** (Spec 1 §2.10 Nr. 3).
  * **Abweichung bedeutet:** liefert `pg_tables` **mehr**, liegt dort Bestand, den niemand
    eingeplant hat. Jede zusätzliche Tabelle ist per `select count(*)` zu zählen.
  * **Folge:** ⛔ **blockiert den Abbau**, bis jede zusätzliche Tabelle gezählt **und die Abbauliste
    (§5.5) um sie erweitert** ist.

  > P1 — Tabellenliste wörtlich: ____________________________________________

  ### P2 — liegt noch Bestand? `Loan` und `Device` ⛔

  ```bash
  $PG 'select to_regclass('"'"'public."Loan"'"'"') as loan,
              to_regclass('"'"'public."Device"'"'"') as device;'
  $PG 'select count(*) from "_prisma_migrations" where finished_at is not null;'
  ```

  * **Erwartung:** `NULL, NULL` und **5** abgeschlossene Migrationen.
  * **Abweichung bedeutet:** ein **Nicht-NULL** heißt, die Drop-Migrationen sind in Prod nie
    gelaufen — dann liegt im Kiosk-Postgres Geräte- und Leihbestand, den Kapitel 1 nicht kennt, und
    der Import braucht einen zweiten Zweig. Eine Zahl **unter 5** heißt, Prod hängt hinter dem
    eingefrorenen Stand `f883ec4`; dann ist jede `datei:zeile`-Aussage über den Kiosk unsicher.
  * **Folge:** ⛔ **blockiert den Abbau, hart.** Bei Nicht-NULL wird kein Volume angefasst, sondern
    Kapitel 1 wieder aufgemacht. Das ist der Fall, in dem der Abbau am Standby-Ende **abgesagt** und
    nicht verschoben wird.

  > P2 — loan: ______ · device: ______ · abgeschlossene Migrationen: ______
  ````

- [ ] **Schritt 3: P3 und P4 schreiben — was verworfen wird, wird gezählt**

  ````markdown
  ### P3 — `AdminUser`: wandert nicht, wird aber gezählt ⛔

  ```bash
  $PG 'select count(*) from "AdminUser";'
  $PG 'select username, "createdAt", "updatedAt" from "AdminUser";'
  ```

  * Die Zeile „`AdminUser` wandert **nicht**" (gesetzte Entscheidung 14) ist eine **Entscheidung,
    keine Messung**; diese Zählung dokumentiert, **was verworfen wird**. Der Beleg für die
    Entscheidung ist `radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`:
    im Pocket-ID-Betrieb baut der OIDC-Weg die Kennung synthetisch als `pocketid:${sub}` und
    schreibt gar nicht in die Tabelle. Die Suite führt den **rohen** `sub`.
  * **Erwartung:** `0`.
  * **Abweichung bedeutet:** ein Ergebnis **> 0** heißt, es gab lokale Passwort-Identitäten, und ihr
    Verlust ist **vor** dem Löschen des Volumes zur Kenntnis zu nehmen — nicht danach zu entdecken.
    `updatedAt > createdAt` beantwortet ohne Konfigurationszugriff, ob die Zugangsdaten je geändert
    wurden, also ob der Nutzer in Benutzung war.
  * **Folge:** ⛔ **blockiert den Abbau**, bis die betroffene Person namentlich benannt und
    benachrichtigt ist. Die **Entscheidung** kippt dadurch nicht — der Port streicht den lokalen
    Passwort-Login ersatzlos —, aber sie wird dann **angekündigt statt bemerkt**.

  > P3 — `count(*)`: ______ · Personen benannt und benachrichtigt: ____________________

  ### P4 — existiert `session` überhaupt, und liegen dort Zeilen? ⛔

  ```bash
  $PG 'select count(*) from "session";'
  $PG 'select count(*) from "session" where expire > now();'
  $PG 'select sess from "session" where expire > now() limit 5;'
  ```

  * **Erwartung:** die Tabelle existiert **nicht** (Fehler `relation "session" does not exist`) —
    `prisma/create-session-table.sql` wird von nichts ausgeführt (Spec 1 §2.10 Nr. 3).
  * **Abweichung bedeutet:** existiert sie doch, zeigt `sess`, ob dort `provider: 'local'` oder
    `'pocketid'` steht. Ein `'local'` mit **lebenden** Sitzungen heißt: jemand arbeitet **heute** mit
    einem Passwort-Login, den der Port ersatzlos streicht.
  * **Folge:** ⛔ **blockiert den Abbau** — und es ist eine Ankündigung an eine namentlich bekannte
    Person, kein technischer Posten.

  > P4 — Tabelle existiert: ☐ nein ☐ ja · Zeilen gesamt: ______ · lebende: ______ ·
  > `provider` der lebenden: ____________
  ````

- [ ] **Schritt 4: P5 schreiben — gezählt, nicht geschätzt**

  ````markdown
  ### P5 — Zeilenzahlen aller Tabellen, fürs Protokoll (**nur Protokoll**, keine Sperre)

  ⚠️ **`n_live_tup` ist ein Schätzwert des Statistik-Sammlers** — er veraltet ohne `ANALYZE`- bzw.
  Autovacuum-Lauf und steht nach einem Postgres-Neustart auf `0`. Genau diese Zeile ist die
  **letzte Aufnahme eines Bestands, der in §5.5 fällt** und dessen einzige Sicherung der `pg_dump`
  aus P6 ist. Eine Schätzung ist dafür der falsche Datentyp — und P1 verlangt für jede unerwartet
  gefundene Tabelle ausdrücklich ein exaktes `select count(*)`. **Dasselbe Idiom hier:**

  ```bash
  # Die Tabellenliste ist die AUSGABE von P1 — nicht abgeleitet, nicht erfunden.
  for t in <die Tabellennamen aus P1, einer je Wort>; do
    $PG "select '$t' as tabelle, count(*) from \"$t\";"
  done

  # Zusaetzlich, und im Protokoll ausdruecklich als SCHAETZWERT beschriftet:
  $PG 'select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;'
  ```

  * ⚠️ **Die Anführungszeichen um `"$t"` sind Pflicht:** `AdminUser` ist in Postgres nur als
    **quoted identifier** ansprechbar; ohne sie sucht der Server nach `adminuser` und meldet
    `relation "adminuser" does not exist` — ein Fehlbild, das wie eine fehlende Tabelle aussieht.
  * **Folge:** **nur Protokoll** — aber **exakt**, und für **jede** Tabelle aus P1. Die
    `pg_stat_user_tables`-Zeile läuft mit, trägt im Protokoll das Wort **Schätzwert**, und
    Abweichungen zwischen ihr und den Zählungen sind **kein** Befund.

  > P5 — exakte Zählungen je Tabelle: ____________________________________________
  > P5 — `pg_stat_user_tables` (**Schätzwert**): ____________________________________
  ````

- [ ] **Schritt 5: P6 schreiben — und die Reihenfolge festnageln**

  ````markdown
  ### P6 — der Archiv-Dump. **Erst danach darf das Volume fallen.** ⛔

  ```bash
  docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
    pg_dump -U <echter POSTGRES_USER> -d radio_inventar --format=custom \
    > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
  ```

  ⚠️ Der Kiosk-Postgres fiel aus jeder Sicherung, die dieses Repo kennt, **automatisch heraus**:
  `scripts/backup.sh` kennt nur `"$DATA_DIR"/*.db` (`:25-27`) und `BLOB_DIR` (`:19-21`). **Dieser
  `pg_dump` ist die einzige Sicherung, die dieses Volume je hatte** (Spec 1 §9.5.3). Er ist in
  §4.5 Schritt 3 schon einmal gelaufen; **hier läuft er erneut**, falls der Standby-Stack
  zwischenzeitlich gestartet wurde — beides ins Protokoll, mit Zeitstempel.

  * **Folge:** ⛔ **blockiert den Abbau des Volumes** (Abbauliste Posten 3). **P6 ist eine
    Abbau-Sperre, nicht eine Protokollzeile** — es ist der einzige Block dieses Abschnitts, dessen
    Ausbleiben den Bestand ersatzlos vernichtet.

  > P6 — Dump aus §4.5 Schritt 3: ____________________ (Zeitstempel ______)
  > P6 — Dump vor dem Abbau: ____________________ (Zeitstempel ______)
  > Stack war im Standby gestartet? ☐ nein ☐ ja, am ____________ (dann §5.7 lesen)
  ````

- [ ] **Schritt 6: Gegenprobe — sechs Blöcke, und die Sperren stimmen**

  ```bash
  # (a) genau sechs P-Bloecke:
  grep -cE '^### P[1-6] ' docs/runbooks/radio-cutover.md      # Erwartung: 6

  # (b) fuenf davon tragen ein ⛔, P5 nicht:
  grep -E '^### P[1-6] ' docs/runbooks/radio-cutover.md | grep -c '⛔'   # Erwartung: 5
  grep -E '^### P5 ' docs/runbooks/radio-cutover.md | grep -c '⛔'       # Erwartung: 0

  # (c) das Arbeitsverzeichnis ist genannt:
  grep -c 'Arbeitsverzeichnis auf dem Server' docs/runbooks/radio-cutover.md   # Erwartung: 1
  ```

- [ ] **Schritt 7: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): P1-P6 gegen den Kiosk-Postgres, P6 als Abbau-Sperre statt Protokollzeile"
  ```

---

### Aufgabe 5.4: Die Archivprobe — beide Dateien werden geöffnet

⚠️ **Der Schritt, den Spec 1 nicht führt, und der die Lücke schließt.** Spec 1 §9.4.1 verlangt die
Snapshot-Kopie, §9.4.2 Nr. 6 den `pg_dump` — **kein Schritt öffnet je eine der beiden Dateien.**
Ohne diesen Block ruht die einzige unumkehrbare Handlung dieses Cutovers auf zwei Dateien, die
niemand gelesen hat. Der Präzedenzfall steht im Haus: `files-cutover.md:368` — „Ein Backup-Tarball
wurde **geöffnet** und enthielt `files.db` **und** Blobs."

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.4` anfügen
- Test: keine Testdatei — Gegenprobe in Schritt 3

**Schnittstellen:**
- Verbraucht: `radio-admin-snapshot.sqlite` · `radio-inventar-final-<stamp>.dump` · die
  Freeze-Aufnahme aus §4.5 Schritt 2 · **N8** (Ablageort)
- Liefert: die zwei Archivproben **(a)** und **(b)**, beide ⛔ · die Zusicherung „`.tables` zeigt
  **alle sechs**" · die Zusicherung „`pragma integrity_check` = `ok`" · die Protokollzeile
  Ablageort

- [ ] **Schritt 1: Beide Proben ausschreiben**

  ````markdown
  ## §5.4 — Die Archivprobe: beide Archivdateien werden geöffnet ⛔

  Grundlage: Spec 2 §5.2.4 (`…2026-08-18-radio-cutover-design.md:4569-4601`).

  ```bash
  # (a) Die SQLite-Snapshot-Kopie: Tabellen vorhanden, Zahlen gleich der Freeze-Aufnahme.
  sqlite3 radio-admin-snapshot.sqlite '.tables'
  #   MUSS alle SECHS fuehren: devices, device_events, software_versions,
  #   users, loans, api_tokens. Fehlt eine, ist die Kopie vorbaselinig —
  #   dasselbe Bild wie radio-admin/data/data.sqlite im Repo (Randbedingung 8),
  #   und die Kopie ist wertlos.
  sqlite3 radio-admin-snapshot.sqlite 'pragma integrity_check;'
  #   MUSS 'ok' liefern.

  # (b) Der Postgres-Dump: lesbar und nicht leer. pg_restore liegt im Alt-Image.
  docker run --rm -v "$PWD":/a postgres:16-alpine \
    pg_restore --list /a/radio-inventar-final-<stamp>.dump | head -30
  #   Das Image ist radio-inventar/docker-compose.yml:4 entnommen.
  #   Erwartet: eine Objektliste mit "AdminUser" und "_prisma_migrations".
  #   Ein leerer oder abgebrochener Kopf heisst: der Dump ist unbrauchbar,
  #   und er ist die EINZIGE Sicherung dieses Volumes.
  ```

  * **Folge:** ⛔ **beide blockieren den Abbau.** Die Zahlen aus (a) gehören **neben die
    Freeze-Aufnahme** ins Protokoll; ein Unterschied heißt, in das Volume wurde nach dem Freeze
    geschrieben — **dann war der Freeze keiner**, und der ganze Import steht auf einer Quelle, die
    sich unter ihm bewegt hat.

  > (a) `.tables` — sechs gefunden? ☐ ja ☐ nein, fehlt: ____________
  > (a) `integrity_check`: ____________
  > (a) Zeilenzahlen gegen die Freeze-Aufnahme aus §4.5 Schritt 2: gleich? ☐ ja ☐ nein
  > (b) `pg_restore --list` — Objektliste mit `AdminUser`? ☐ ja ☐ nein
  ````

- [ ] **Schritt 2: Den Ablageort als eigene, nummerierte Zeile führen (N8)**

  ````markdown
  ⚠️ **Und die Archivdateien liegen nicht auf demselben Server wie die Suite** (Spec 1 §9.5.1).
  **Ein Archiv auf dem Rechner, dessen Ausfall es abdecken soll, ist kein Archiv.**

  Das ist **N8** und keine Formalie: solange der Ablageort nicht als Wert dasteht, ist „im Archiv"
  eine Absichtserklärung. Drei Angaben, alle drei:

  > Zielsystem (nicht der Suite-Server): ____________________
  > Zugriffsweg (wie kommt man in zwei Jahren an die Datei?): ____________________
  > Verantwortlich: ____________________  · abgelegt am: ____________

  ⛔ **Solange eine der drei Zeilen leer ist, fällt kein Volume** — die zwei Dateien sind der Rest,
  der die Volumes überlebt (Abbauliste Posten 11).
  ````

- [ ] **Schritt 3: Gegenprobe**

  ```bash
  # (a) beide Proben stehen da und beide tragen ein ⛔:
  grep -c 'beide blockieren den Abbau' docs/runbooks/radio-cutover.md      # Erwartung: 1

  # (b) die Sechser-Erwartung steht ausgeschrieben, nicht als "alle":
  grep -c 'devices, device_events, software_versions' docs/runbooks/radio-cutover.md
  # Erwartung: 1

  # (c) N8 hat drei Zeilen, nicht eine:
  sed -n '/^> Zielsystem (nicht der Suite-Server)/,/^$/p' docs/runbooks/radio-cutover.md \
    | grep -c '____'
  # Erwartung: 3
  ```

- [ ] **Schritt 4: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): die Archivprobe — beide Dateien werden geoeffnet, Ablageort als N8"
  ```

---

### Aufgabe 5.5: Die Abbauliste und der Sperrenkasten

Die Liste, an der abgehakt wird. **Kein Häkchen, solange ein Block aus §5.2–§5.4 offen oder rot
ist.**

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.5` anfügen
- Test: keine Testdatei — Gegenprobe in Schritt 4

**Schnittstellen:**
- Verbraucht: die Ergebnisse von **A, T, R, Z** (§5.2), **P1–P6** (§5.3), **beide Archivproben**
  (§5.4) · **U4 / C.5** (Posten 14) · **U6** (Posten 13) · **N9** (Posten 10)
- Liefert: den ⛔-Sperrenkasten in der Fassung **„A, T, R, Z, P1–P4, P6 und beide Archivproben"**
  (P5 bleibt Protokoll) · die vierzehn Posten mit Frist und Bedingung · den Abschnitt
  „Die benannte Lücke (U4/C.5)"

- [ ] **Schritt 1: Den Sperrenkasten schreiben — mit P6**

  ⚠️ **Das ist die zweite Korrektur der Re-Kritik** (RK-A11, dritter Durchgang). Der Kasten in der
  Spec (Zeile 4610) zählt „A, T, R, Z, P1, P2, P3, P4 und beide Archivproben" — **P6 fehlt**,
  obwohl §5.2.3 P6 mit „Erst danach darf das Volume fallen" überschreibt und Posten 3 den Abbau
  ausdrücklich „erst nach P6" bindet. Wer den Kasten als abschließend liest — er ist als ⛔-Kasten
  genau dafür gebaut —, kann alle acht genannten Sperren grün haben und das Volume löschen, während
  der **einzige Dump dieses Volumes** nicht gelaufen ist.

  ````markdown
  ## §5.5 — Die Abbauliste

  Grundlage: Spec 2 §5.3 und §5.3.1 (`…2026-08-18-radio-cutover-design.md:4605-4651`).

  Jede Zeile einzeln abhaken, und **keine, bevor ihre Bedingung grün protokolliert ist.**

  > ⛔ **Kein Häkchen in dieser Liste, solange ein Block aus §5.2, §5.3 oder §5.4 offen oder rot
  > ist.** Die Abbau-Sperren sind: **A, T, R, Z** (§5.2) · **P1, P2, P3, P4, P6** (§5.3) · **beide
  > Archivproben** (§5.4).
  > **P5 ist Protokoll, keine Sperre** — und **P6 ist Sperre, kein Protokoll**: er ist die einzige
  > Sicherung, die das Postgres-Volume je hatte.
  ````

- [ ] **Schritt 2: Die vierzehn Posten schreiben**

  ````markdown
  | # | Posten | Frist | Bedingung |
  |---|---|---|---|
  | 1 | **Traefik-Anbindung radio-inventar** (der Router auf `radio.iuk-ue.de`) | **sofort** beim Umschwenk | Muss weg, sonst halten **zwei** Router denselben Host. Das ist kein Abbau-, sondern ein **Cutover**-Schritt (§4.5 Schritt 9.1) und steht hier nur der Vollständigkeit halber |
  | 2 | **Container `radio-inventar-backend`** (Image `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend`, `radio-inventar/docker-compose.yml:28`) | Standby **14 Tage** | Gestoppt, Image behalten. Er ist bis Stunde 1 der Rückweg für `radio.iuk-ue.de` |
  | 3 | **Container `radio-inventar-db` + Volume `postgres_data`** (⚠️ **deklarierter** Name, `:12`; der echte trägt das Projektpräfix) | Standby **14 Tage** | Gestoppt, Volume erhalten — das Backend hängt per `depends_on: condition: service_healthy` (`:42-44`) daran, ein Rollback ohne ihn startet nicht. Abbau **erst nach P6** und **erst**, wenn P1–P5 protokolliert sind |
  | 4 | **Container `app` des radio-admin-Stacks** (Image `radio-admin:local`, `radio-admin/docker-compose.yml:4`) | Standby **14 Tage** | Gestoppt. ⚠️ **Nicht starten** — §5.7 |
  | 5 | **Volume `radio-data` von radio-admin** (⚠️ **deklarierter** Name, `radio-admin/docker-compose.yml:14`, `:17`; der echte trägt das Projektpräfix) | Standby **14 Tage** | Einzige Quelle für Re-Import und feldweise Nachprüfung. Abbau erst, wenn **A, T, R, Z** und die Archivprobe (a) grün sind |
  | 6 | **Images** `radio-admin:local` und `…/radio-inventar-backend` | Standby **14 Tage** | Ohne Image ist der Rollback kein Handgriff, sondern ein Build. ⚠️ Das gilt auch gegen einen Neubau zur Retention-Neutralisierung — siehe §5.7 und **N7** |
  | 7 | **Alte `.env`-Dateien beider Stacks** | **mit** dem Volume, nicht davor | §5.6 — der Posten, der liegen bleibt |
  | 8 | **DNS `radio.iuk-ue.de`** | **bleibt**, unverändert | Zeigt vor und nach dem Cutover auf denselben Edge; nichts zu tun. **Genau das ist der Grund, warum es kein Parallelfenster gibt** |
  | 9 | **DNS `radio-admin.iuk-ue.de`** | **bleibt**, solange der Redirect steht | **Kein** Abbau-Posten — er ist die Abhängigkeit des Redirects. Ende in §5.8 |
  | 10 | **Redirect-Router `radio-admin-alt` + `SUITE_REDIRECT_RULE_RADIO_ADMIN`** | nach der Bedingung aus §5.8 | Vier zusammenhängende Wochen ohne Treffer auf `radio-admin.iuk-ue.de` im Traefik-Zugriffsprotokoll. ⚠️ **Ob es ein solches Protokoll gibt, ist N9** |
  | 11 | **Snapshot-Kopie + Postgres-Dump** | **Archiv, dauerhaft** | Nicht auf demselben Server wie die Suite (**N8**). Sie sind der Rest, der die Volumes überlebt |
  | 12 | **Repos `radio-admin` und `radio-inventar`** | **archivieren, nicht löschen** | GitHub-Archivierung (read-only) mit den Freeze-SHAs **`265abd5`** bzw. **`f883ec4`** im Archivierungshinweis. Sie sind die Belegquelle **jeder** `datei:zeile` aus Spec 1 und Spec 2; **ein gelöschtes Repo macht beide Specs unnachprüfbar** |
  | 13 | **Zwei OIDC-Client-Registrierungen in Pocket ID** | Betreiberentscheidung (**U6**) | §5.6 |
  | 14 | ⬜ **`radio-inventar`-Frontend-Auslieferung** | ⚠️ **unbekannt — siehe unten** | Solange **U4 / C.5** offen ist, ist **diese Liste unvollständig** |
  ````

- [ ] **Schritt 3: Die benannte Lücke schreiben — sie ist der Grund, warum die Liste nicht abschließt**

  ````markdown
  ### Die benannte Lücke: wer liefert das radio-inventar-Frontend aus? (U4 / C.5)

  **Diese Liste ist nachweislich unvollständig, und das steht hier als Lücke, nicht als Vermutung.**

  Gemessen an `f883ec4`: `radio-inventar/docker-compose.yml` führt **zwei** Services, `postgres`
  (`:3`) und `backend` (`:26`, hinter `profiles: ["full-app"]`, `:27`). **Es gibt keinen
  Frontend-Service.** Die Datei sagt es in ihrer ersten Zeile selbst:
  `# docker-compose.yml (Development + Full-App Profile)` (`:1`). Zweiter Beleg derselben Klasse:
  `API_TOKEN` ist Pflichtwert mit mindestens 32 Zeichen und **ohne Default**
  (`radio-inventar/apps/backend/src/config/env.config.ts:11`), kommt im Env-Block des
  `backend`-Service (`:33-39`) aber **nicht vor**. Dritter: `POSTGRES_PASSWORD:
  ${POSTGRES_PASSWORD:-secret}` (`:9`) mit dem Kommentar „WICHTIG: In Production
  POSTGRES_PASSWORD setzen!" (`:8`).

  **Schlussfolgerung, belegt:** die eingecheckte Compose-Datei ist **nicht der Produktionsweg**.
  Daraus folgt, was hier fehlt — **U4, U4a und U4b**. Jede gefundene Komponente wird eine **eigene
  Zeile in der Tabelle oben**, mit derselben Standby-Frist wie Posten 2: **sie ist Teil des
  Rückwegs.**

  ⚠️ **Der Abbau ist nicht abgeschlossen, solange diese drei Auskünfte fehlen.** „Abgebaut" heißt
  sonst „die Teile abgebaut, die im Repo standen" — und die eine Komponente, die den Host bedient
  hat, läuft weiter. **Die Auskunft ist vor dem Cutover einzuholen, nicht danach**, weil U4
  zusätzlich den **Freeze** blockiert (§4.5 Schritt 1) und der Rückweg (§4.9 3c/3d) ohne sie
  nichts zurückzustellen hat.

  > Gefundene Komponenten (je eine neue Zeile in der Tabelle oben): ____________________
  > U4 beantwortet am ____________ durch ____________________
  ````

- [ ] **Schritt 4: Gegenprobe — vierzehn Posten, und der Sperrenkasten deckt sich mit den Blöcken**

  ```bash
  # (a) genau vierzehn Posten, jeder mit einer Bedingung (vier Spalten, kein leeres Feld):
  sed -n '/^| # | Posten | Frist | Bedingung |/,/^$/p' docs/runbooks/radio-cutover.md \
    | grep -cE '^\| [0-9]+ \|'
  # Erwartung: 14
  sed -n '/^| # | Posten | Frist | Bedingung |/,/^$/p' docs/runbooks/radio-cutover.md \
    | grep -cE '^\| [0-9]+ \|[^|]*\|[^|]*\| *\|'
  # Erwartung: 0   (kein Posten ohne Bedingung)

  # (b) der Sperrenkasten nennt P6 und nennt P5 NICHT als Sperre:
  sed -n '/Die Abbau-Sperren sind/,/^$/p' docs/runbooks/radio-cutover.md | grep -c 'P6'
  # Erwartung: 1
  sed -n '/Die Abbau-Sperren sind/,/^$/p' docs/runbooks/radio-cutover.md \
    | grep -c 'P5 ist Protokoll, keine Sperre'
  # Erwartung: 1

  # (c) jede Sperre des Kastens hat einen Block, der sie fuehrt:
  for s in 'Abfrage A' 'Abfrage T' 'Abfrage R' 'Abfrage Z' 'P1' 'P2' 'P3' 'P4' 'P6'; do
    printf '%s: ' "$s"; grep -c "^### $s" docs/runbooks/radio-cutover.md
  done
  # Erwartung: jede Zeile endet auf 1
  ```

- [ ] **Schritt 5: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): die Abbauliste, der Sperrenkasten mit P6 und die benannte U4-Luecke"
  ```

---

### Aufgabe 5.6: Die Geheimnisse — der Posten, der liegen bleibt

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.6` anfügen
- Test: keine Testdatei — Gegenprobe in Schritt 3

**Schnittstellen:**
- Verbraucht: **U4a** (Fundort von `API_TOKEN`) · **U6** (OIDC-Clients) · Abbauliste Posten 7
  und 13
- Liefert: die zwei Wertetabellen (radio-admin `.env` · radio-inventar Produktionsumgebung) · fünf
  Häkchenzeilen mit Protokollfeldern · die **Reihenfolgezusage** „`.env` fällt **mit** dem Volume,
  nicht davor"

- [ ] **Schritt 1: Den Befund schreiben — er ist stärker, nicht schwächer als bei `lagerbuch`**

  ````markdown
  ## §5.6 — Die Geheimnisse: der Posten, der liegen bleibt

  Grundlage: Spec 2 §5.4 (`…2026-08-18-radio-cutover-design.md:4655-4698`).

  ⚠️ **Hier gilt Spec 1 §9.5.2, nicht die Analyse.** `docs/radio-portierung-analyse.md:839-843`
  schreibt, die übernommenen Geheimnisse lebten nach dem Cutover „doppelt auf demselben Server".
  Für `radio` trifft das **nicht** zu, weil **nichts** wertgleich übernommen wird: es gibt genau
  **einen** neuen Wert, `RADIO_AUSLEIH_SITZUNG_SECRET`, **frisch erzeugt** und ⚠️ **nicht gleich
  `AUTH_SECRET`**. Radio invertiert damit das `lagerbuch`-Muster, wo `HELFER_SESSION_SECRET`
  wertgleich aus der produktiven `stack.env` übernommen wurde, damit laufende Sitzungen den Cutover
  überleben (`lagerbuch-cutover.md:413`).

  **Der Befund wird dadurch nicht schwächer, sondern stärker:** die alten Werte bleiben **gültig**
  in Dateien, die niemand mehr pflegt und die kein Repo kennt. **Ein verwaister, aber
  funktionierender Vollzugriffs-Token braucht kein Duplikat, um gefährlich zu sein.** Deshalb steht
  das Löschen als **Zeile**, nicht als Absicht.

  | Datei / Ort | Werte |
  |---|---|
  | radio-admin `.env` | `SESSION_SECRET` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_ISSUER` · `OIDC_REDIRECT_URI` · `OIDC_ADMIN_GROUP` · `OIDC_UPDATER_GROUP` · `LOAN_API_EXPECTED_AUDIENCE` · `LOAN_API_EXPECTED_SUBJECT` · `AUTH_DEV_BYPASS` / `DEV_USER_*` |
  | radio-inventar Produktionsumgebung | `API_TOKEN` (der geteilte Kiosk-Token) · `SESSION_SECRET` · `POSTGRES_PASSWORD` · `POCKET_ID_CLIENT_SECRET` und die drei übrigen `POCKET_ID_*` |

  Nachgeschlagen an `f883ec4`: `env.config.ts:11` führt `API_TOKEN` als **Pflichtwert ohne Default**
  mit `min(32)`, `:12-15` die vier `POCKET_ID_*` als `optional().default('')`, und
  `SESSION_SECRET` kommt aus `radio-inventar/docker-compose.yml:37` mit der Vorbelegung
  `change-me-in-production`.
  ````

- [ ] **Schritt 2: Die fünf Häkchenzeilen und die Reihenfolgezusage**

  ````markdown
  - [ ] radio-admin `.env` gelöscht, **mit** dem Volume (Abbauliste Posten 7) — am ____________
  - [ ] ⚠️ **`API_TOKEN` — eigene Zeile.** Er ist Pflichtwert (`env.config.ts:11`), steht aber
        **nicht** in der eingecheckten Compose-Datei. Der Handgriff lautet **„finden, wo Produktion
        ihn setzt — dann dort löschen"**, nicht „aus der Compose-Datei entfernen" (**U4a**).
        Solange er irgendwo lebt, lebt ein Vollzugriff auf den alten Bestand.
        Fundort: ____________________ · gelöscht am ____________
  - [ ] `SESSION_SECRET` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung
        `change-me-in-production` benutzt hat (`radio-inventar/docker-compose.yml:37`).
        Vorbelegung benutzt? ☐ ja ☐ nein
  - [ ] `POSTGRES_PASSWORD` gelöscht — ⚠️ und geprüft, ob Produktion je die Vorbelegung `secret`
        benutzt hat (`:9`). Wenn ja, ist es kein Geheimnis, sondern war nie eines; **die Zeile
        bleibt trotzdem**. Vorbelegung benutzt? ☐ ja ☐ nein
  - [ ] ⚠️ **Die zwei OIDC-Client-Registrierungen in Pocket ID** (Abbauliste Posten 13, **U6**).
        radio-admin ist ein eigener Client (`radio-admin/server/src/auth/auth-service.ts:26-48`),
        radio-inventar ein zweiter. Beide tragen lebende Secrets und `redirect_uri`s auf Hosts, die
        verschwinden. Ob sie gelöscht oder aufbewahrt werden, entscheidet der Betreiber — **die
        Zeile muss existieren**, sonst bleiben zwei gültige Clients mit toten Rückadressen stehen.
        Entscheidung: ☐ gelöscht ☐ aufbewahrt, begründet: ____________________

  ⚠️ **Reihenfolge:** die `.env`-Dateien fallen **mit** dem Volume, nicht davor. Solange ein
  Standby-Rückweg existiert (bis Stunde 1) bzw. ein Re-Import denkbar ist (14 Tage), braucht der
  Stack seine Konfiguration. **Eine früh gelöschte `.env` macht den Rückweg zu einem Ratespiel.**
  ````

- [ ] **Schritt 3: Gegenprobe**

  ```bash
  # (a) fuenf Haekchenzeilen im Abschnitt:
  sed -n '/^## §5.6 /,/^## §5.7 /p' docs/runbooks/radio-cutover.md | grep -c '^- \[ \]'
  # Erwartung: 5

  # (b) U4a und U6 sind namentlich genannt:
  sed -n '/^## §5.6 /,/^## §5.7 /p' docs/runbooks/radio-cutover.md | grep -c 'U4a'  # 1
  sed -n '/^## §5.6 /,/^## §5.7 /p' docs/runbooks/radio-cutover.md | grep -c 'U6'   # 1

  # (c) die Reihenfolgezusage steht da:
  grep -c 'fallen \*\*mit\*\* dem Volume, nicht davor' docs/runbooks/radio-cutover.md  # 1
  ```

- [ ] **Schritt 4: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): die Geheimnisse — API_TOKEN mit Fundort, OIDC-Clients als Entscheidungszeile"
  ```

---

### Aufgabe 5.7: Der alte Purge ist kein Cron — und `HISTORY_RETENTION_MONTHS` ist keine Env-Zeile

⚠️ **Diese Aufgabe trägt den einzigen neuen Messbefund dieses Planteils.** Sie ändert die
Zulässigkeitsbedingung des Rollbacks (§4.9 3a) und zwei Erfüllungspunkte.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §5.7` anfügen
- Test: keine Testdatei — Gegenprobe in Schritt 5

**Schnittstellen:**
- Verbraucht: **U4b** (Host-Cron radio-inventar) · **N7** (ist die Frist konfigurierbar?) ·
  `<freeze_iso>` (§4.5 Schritt 1)
- Liefert: die Feststellung „es gibt nichts abzuschalten — es gibt etwas **nicht zu starten**" · den
  N7-Befund samt seiner Folge für §4.2 Nr. 3 · **die ausführbare Beweiszeile für „nie gestartet"**
  (`docker inspect … .State.StartedAt`) · die U4b-Zeile ohne erfundenen Cron

- [ ] **Schritt 1: Den gemessenen Mechanismus schreiben**

  ````markdown
  ## §5.7 — Der alte Purge ist **kein Cron** — und deshalb lautet die Zeile anders

  Grundlage: Spec 2 §5.5 (`…2026-08-18-radio-cutover-design.md:4702-4729`).

  Bei `files` war „**den alten Cleanup-Cron abschalten**" ein eigener Abbau-Punkt, weil er sonst
  „ins Leere oder, schlimmer, in ein wiederverwendetes Verzeichnis" löscht
  (`files-cutover.md:309-310`). Der Punkt gilt hier auch — **aber nicht in dieser Form**, und ihn
  falsch zu übernehmen sucht etwas, was es nicht gibt.

  **Gemessen an `radio-admin@265abd5`: es gibt keinen externen Cron.** Der Purge fährt **im
  Anwendungsprozess** mit: `server/src/index.ts:35` ruft `startRetentionSchedule(db)` aus
  `startServer()`, `services/retentionService.ts:47` purgt **sofort** (`purge()`), erst `:48` setzt
  den Tagestimer (`setInterval(purge, DAY_MS)`). Der Cutoff hängt an der **Wanduhr**
  (`getRetentionCutoffMs(referenceMs = Date.now())`, `:17-21`).

  **Es gibt also nichts abzuschalten — es gibt etwas nicht zu starten.**
  ````

- [ ] **Schritt 2: Den N7-Befund schreiben — die Env-Neutralisierung ist keine**

  ⚠️ **Gemessen, nicht hergeleitet:** `git grep -n RETENTION 265abd5` liefert im ganzen Repo genau
  zwei Treffer, beide in `server/src/services/retentionService.ts` (`:9` und `:19`). Die Zeile
  lautet `export const HISTORY_RETENTION_MONTHS = 2;` — **eine Konstante im Quelltext**, kein
  Env-Wert. Weder `.env.example` noch `docker-compose.yml` kennen den Namen.

  ````markdown
  ### ⚠️ `HISTORY_RETENTION_MONTHS` ist **keine** Umgebungsvariable (**N7**)

  §4.2 Nr. 3 und die Rollback-Bedingung in §4.9 3a lauten: „`HISTORY_RETENTION_MONTHS` in der
  Standby-Umgebung **neutralisieren** **oder** das Volume kopieren." **Der erste Zweig ist so nicht
  ausführbar.**

  **Gemessen an `radio-admin@265abd5`:**
  * `server/src/services/retentionService.ts:9` — `export const HISTORY_RETENTION_MONTHS = 2;`
  * `git grep -n RETENTION 265abd5` liefert **genau zwei** Treffer, beide in derselben Datei
    (`:9`, `:19`). Weder `.env.example` noch `docker-compose.yml` führen den Namen.

  **Folge, ausgeschrieben:** „neutralisieren" hieße den Quelltext ändern und `radio-admin:local`
  **neu bauen** (`radio-admin/docker-compose.yml:3-4`: `build: .`, `image: radio-admin:local`) — und
  das kollidiert mit **Abbauliste Posten 6** („Image behalten"): der Neubau ersetzt genau das
  Image-Tag, an dem der Rollback hängt.

  **Damit bleiben zwei ausführbare Wege, und beide stehen hier:**
  1. **Das Volume kopieren** (der Zweig aus §4.2 Nr. 3, der ohne Codeänderung auskommt), **oder**
  2. **den Stack nicht starten** — die Vorgabe dieses Abschnitts.

  ⬜ **N7 ist abzulesen, bevor ein Rollback erwogen wird:** ob das produktiv laufende Image von
  genau diesem Stand gebaut wurde, oder ob die Produktion eine abweichende Bauform fährt, in der die
  Zahl konfigurierbar ist.
  > N7 beantwortet am ____________ durch ____________________ ·
  > Ergebnis: ☐ nicht konfigurierbar (nur Weg 1 oder 2) ☐ konfigurierbar über: ____________
  ````

- [ ] **Schritt 3: Die zwei Häkchenzeilen und die ausführbare Beweiszeile**

  ⚠️ **Hier wird die Spec präzisiert, nicht abgeschrieben.** Sie sagt: „ein Start ist ein
  **erfolgreicher** Start mit einer Protokollzeile (`retentionService.ts:41`)". Gemessen an
  `265abd5` steht diese Zeile hinter `if (deleted > 0)` (`:40-41`) — **hat der Purge nichts
  gelöscht, hinterlässt der Start überhaupt keine Spur im Log.** Das Log ist damit **kein**
  Detektor für „wurde gestartet". Der Detektor ist der Container-Zustand:

  ````markdown
  - [ ] Der radio-admin-Stack wird im Standby **nicht gestartet.** Muss er doch (Rollback,
        Oberflächenvergleich), gilt **vorher** als nachgewiesen erfüllt: **das Volume ist kopiert**
        (§4.2 Nr. 3) — die Env-Neutralisierung ist **kein** verfügbarer Zweig, siehe **N7**.
        Nachgewiesen am ____________ durch ____________________
  - [ ] Jede feldweise Nachprüfung läuft per `sqlite3` gegen die **Snapshot-Kopie**, nie gegen einen
        gebooteten Alt-Stack (Spec 1 §9.3.4 Zeile 2)

  **Die Beweiszeile für „nie gestartet" — sie steht im Container, nicht im Log:**

  ```bash
  # --- 1) Den Containernamen ABLESEN, nicht raten. `radio-admin/docker-compose.yml`
  #        setzt fuer den Service `app` KEIN `container_name` (:2-14) — der echte Name
  #        traegt das Projektpraefix, dieselbe Klasse Falle wie bei E2/E3 und $VOL_SUITE.
  docker compose -f radio-admin/docker-compose.yml ps -a --format '{{.Name}} {{.State}}'
  C_RADIO_ADMIN=<die Zeile aus dem Befehl oben>       # ins Protokoll

  # --- 2) Der Nachweis selbst:
  docker inspect "$C_RADIO_ADMIN" \
    --format '{{.State.Status}} | StartedAt={{.State.StartedAt}} | FinishedAt={{.State.FinishedAt}}'
  ```

  **Gemessen** (Docker auf dem Entwicklungsrechner, 2026-08-18): ein **gestoppter** Container
  liefert beide Zeitstempel in RFC3339-UTC, z. B.
  `exited | StartedAt=2026-08-14T11:38:56Z | FinishedAt=2026-08-14T12:50:59Z`.

  * **Erwartung:** `StartedAt` liegt **vor** `<freeze_iso>`. Dann gab es seit dem Freeze keinen
    Start, und die Historie in der Quelle ist die, die am Freeze da war.
  * **Abweichung bedeutet:** `StartedAt` **nach** `<freeze_iso>` ist der positive Nachweis eines
    Starts im Standby — und damit eines Purges gegen die **Wanduhr dieses Starts**.
  * ⚠️ **Grenze der Zeile, benannt:** `StartedAt` trägt nur den **letzten** Start. Zwei Starts sehen
    aus wie einer, und ein **entfernter** Container antwortet gar nicht (`No such object`). Sie
    beweist „es gab einen Start", nicht „es gab genau einen".

  > `StartedAt`: ____________________ · `<freeze_iso>`: ____________ ·
  > Start im Standby? ☐ nein ☐ ja, am ____________ — dann P6 erneut (§5.3) und R erneut (§5.2)

  *Kein Gate:* ein Start ist ein **erfolgreicher** Start. `retentionService.ts:40-41` schreibt
  `[retention] purged N expired loan(s)` **nur, wenn `deleted > 0`** — kein Fehler, kein roter
  Test, kein Healthcheck, und bei einem Purge ohne Treffer **keine Zeile**. **Wer den Stack in
  Woche zwei hochfährt, um gegen die Historie zu prüfen, verliert zwei weitere Wochen genau dieser
  Historie.**
  ````

- [ ] **Schritt 4: U4b schreiben — ohne einen Cron zu erfinden**

  ````markdown
  ### Für radio-inventar bleibt die Frage offen: **U4b**

  Host-Cron, systemd-Timer, Backup-Job. Aus dem eingefrorenen Repo ist das **nicht ableitbar** — die
  eingecheckte Compose-Datei ist nicht der Produktionsweg (§5.5, Die benannte Lücke), und ein
  Host-Cron erscheint darin ohnehin nie.

  **Hier wird nichts erfunden**: ein behaupteter Cron, den es nicht gibt, macht aus einem
  Abbau-Schritt eine Suche ohne Ende; ein verschwiegener, den es gibt, schreibt nach dem Abbau in
  ein wiederverwendetes Verzeichnis.

  > U4b beantwortet am ____________ durch ____________________
  > ☐ kein Host-Cron / Timer / Backup-Job  ☐ gefunden: ____________________ → eigene Zeile in §5.5
  ````

- [ ] **Schritt 5: Gegenprobe**

  ```bash
  # (a) der N7-Befund steht mit seinen zwei Belegen da:
  grep -c 'export const HISTORY_RETENTION_MONTHS = 2' docs/runbooks/radio-cutover.md   # 1
  grep -c 'image: radio-admin:local' docs/runbooks/radio-cutover.md                    # 1

  # (b) die Env-Neutralisierung wird NICHT mehr als Zweig angeboten:
  sed -n '/^## §5.7 /,/^## §5.8 /p' docs/runbooks/radio-cutover.md \
    | grep -c 'HISTORY_RETENTION_MONTHS in der Standby-Umgebung neutralisier'
  # Erwartung: 0 (nur der zitierte Wortlaut von §4.2 Nr. 3 darf vorkommen, und der steht
  #               in Anfuehrungszeichen mit dem Zusatz "Der erste Zweig ist so nicht ausfuehrbar")

  # (c) die Beweiszeile ist da und das Log ist als Nicht-Detektor benannt:
  grep -c 'State.StartedAt' docs/runbooks/radio-cutover.md                             # 1
  grep -c 'nur, wenn `deleted > 0`' docs/runbooks/radio-cutover.md                     # 1
  ```

- [ ] **Schritt 6: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): der Purge ist kein Cron, HISTORY_RETENTION_MONTHS ist keine Env-Zeile (N7), und der Start-Nachweis steht im Container"
  ```

---

### Aufgabe 5.8: Der Redirect und sein Ende — und was der Abbau nicht anfasst

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitte `## §5.8` und `## §5.9` anfügen
- Test: keine Testdatei — Gegenprobe in Schritt 4

**Schnittstellen:**
- Verbraucht: **N9** (Zugriffsprotokoll) · **E7** (Traefik-Containername) · die sechs
  `radio-admin-alt`-Labels aus `compose.yaml` (Planteil Kapitel 4, §4.4.4) ·
  `SUITE_REDIRECT_RULE_RADIO_ADMIN`
- Liefert: die dreischrittige Abbaufolge **Labels → `.env` → DNS zuletzt** · den Hinweis, dass
  Schritt 1 **über den Deploy-Pfad** läuft · den Abschnitt „Was der Abbau nicht anfasst" mit vier
  Punkten

- [ ] **Schritt 1: Bedingung statt Datum — und N9 als ihre Voraussetzung**

  ````markdown
  ## §5.8 — Der Redirect und sein Ende: die einzige Frist mit Bedingung statt Datum

  Grundlage: Spec 2 §5.6 (`…2026-08-18-radio-cutover-design.md:4733-4759`).

  Der Redirect vom Alt-Verwaltungshost (`radio-admin.iuk-ue.de` → **302** auf
  `radio.iuk-ue.de/admin`, pfaderhaltend) hat **kein Ablaufdatum, sondern eine Bedingung**:

  * Er steht **mindestens** bis zum Ende des Standby-Fensters (§5.1).
  * Er fällt, sobald im Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer
    mehr auf `radio-admin.iuk-ue.de` erscheint. **Ohne benannte Bedingung lebt ein Redirect für
    immer**, und mit ihm ein DNS-Eintrag, den niemand mehr erklären kann.

  ⚠️ **Die Bedingung setzt ein Zugriffsprotokoll voraus, und dass es eines gibt, ist nicht belegt
  (N9).** Traefik schreibt ein Access-Log nur bei gesetzter `accessLog`-Konfiguration; im Repo gibt
  es keinen Traefik-Dienst — der Router hängt an Labels eines Proxys, der außerhalb dieses
  Repositoriums läuft (**E7** nennt seinen Container). **Gibt es kein Protokoll, oder wird es kürzer
  als vier Wochen vorgehalten, ist diese Bedingung nie erfüllbar** — und der Redirect lebt genau so
  lange weiter, wie die Bedingung ihn verhindern sollte.
  ⛔ **Dann wird die Ersatzbedingung vom Betreiber entschieden und hier eingetragen — nicht
  erfunden.**

  > N9 — Zugriffsprotokoll vorhanden? ☐ ja, Quelle: ____________________ ☐ nein
  > Aufbewahrungsdauer: ____________ (muss ≥ 4 Wochen sein)
  > Ersatzbedingung (nur falls „nein"), vom Betreiber entschieden am ____________:
  > ____________________
  ````

- [ ] **Schritt 2: Die drei Zeilen des Abbaus — mit dem Deploy-Pfad als eigener Warnung**

  ⚠️ **Der Punkt, den die Spec nicht schreibt und der den Schritt sonst verbrennt:**
  `scripts/deploy.sh` vergleicht `compose.yaml` **byteweise** mit der Datei auf dem Server und
  bricht bei Abweichung ab (`compose.yaml:42-46`). Wer die sechs Labels vier Wochen nach dem
  Cutover von Hand auf dem Server löscht, hat danach eine Serverdatei, die von der Repodatei
  abweicht — und der **nächste Rollout** bricht ab, an einer Stelle, die mit `radio` nichts mehr
  zu tun hat.

  ````markdown
  **Der Abbau ist drei Zeilen, in dieser Reihenfolge** — der DNS-Eintrag fällt **zuletzt**, weil er
  die Abhängigkeit des Redirects ist:

  - [ ] 1. Die sechs `radio-admin-alt`-Labels **im Repo** aus `compose.yaml` entfernen, committen,
        und über den regulären Deploy-Pfad ausrollen.
        ⚠️ **Nicht von Hand auf dem Server editieren:** `scripts/deploy.sh` vergleicht
        `compose.yaml` **byteweise** mit der Serverdatei und bricht bei Abweichung ab
        (`compose.yaml:42-46`). Eine handgeänderte Serverdatei bricht den **nächsten** Rollout, und
        zwar mit einer Meldung, die von `radio` nichts mehr weiß.
        Entfernt und ausgerollt am ____________ · Commit: ____________
  - [ ] 2. `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env` auf dem Server entfernen — am ______
  - [ ] 3. DNS-Eintrag `radio-admin.iuk-ue.de` löschen — am ____________

  **Gegenprobe nach Schritt 1 und 2**, ins Protokoll:
  ```bash
  docker compose config | grep -A2 radio-admin-alt
  # Erwartung nach dem Abbau: KEINE Ausgabe.
  ```

  > Vier-Wochen-Fenster ohne Treffer: von ____________ bis ____________ ·
  > Protokollquelle (**N9**): ____________________ · Redirect abgebaut am ____________
  ````

- [ ] **Schritt 3: „Was der Abbau nicht anfasst" als eigener Abschnitt**

  ````markdown
  ## §5.9 — Was der Abbau ausdrücklich nicht anfasst

  Grundlage: Spec 2 §5.7 (`…2026-08-18-radio-cutover-design.md:4763-4780`).

  * ⚠️ **`radio.iuk-ue.de` bleibt in `SUITE_TRAEFIK_RULE`, und `SUITE_HOST_RADIO` bleibt gesetzt.**
    Das ist ab dem Umschwenk der produktive Zustand, kein Übergangsposten.
    **Und `radio-admin.iuk-ue.de` gehört zu keinem Zeitpunkt in `SUITE_TRAEFIK_RULE`** (§4.4.4):
    dort aufgenommen bekäme der Host nicht den Redirect, sondern den stillen **Portal-Fallback** —
    `const mod = moduleForHost(host) ?? getModule("portal")` (`src/core/routing.ts:69`), Kommentar
    zum Fehlfall in `src/core/hosts.ts:52-57`. Ein funktionierender Ausdruck mit falschem Inhalt,
    und **kein Test des Repos sieht Traefik-Labels an.**
  * **`scripts/backup.sh` braucht keine Änderung.** Es sammelt `"$DATA_DIR"/*.db` per `nullglob`
    (`:25-27`) und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — `radio.db` fällt
    **automatisch** hinein. Es gibt hier **keinen** Abbau-Handgriff, und das ist der Vorteil der
    Ein-Datei-je-Modul-Regel.
    ⚠️ Das sagt nichts darüber, mit **welcher** Umgebung der Host-Cron das Skript ruft
    (`DATA_DIR`, `BLOB_DIR`) — das ist die Abnahme im Fenster (§4.6 Nr. 13), nicht dieser Abschnitt.
  * **Der Monitor auf `/api/health/radio` bleibt** — er ist ab dem Umschwenk der produktive Posten.
    ⚠️ **Nie `/api/health`**: `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne
    Modul und ohne Datenbank und antwortet nach dem Cutover auf `radio.iuk-ue.de` weiter `ok`,
    **ohne etwas über radio zu sagen**.
    Die Feldbedeutung ist heute lesbar und keine Leerstelle: `module` trägt den Modulschlüssel und
    `status:"ok"` belegt den **Datenbankzugriff** (`openModuleDatabase(...)` plus
    `db.prepare("SELECT 1").get()`, `src/core/health/index.ts:4-15`), `revision` hängt
    `src/app/api/health/[modul]/route.ts:24` an. Offen ist allein der **Sollwert** von `revision` —
    und der steht in der Protokollzeile aus §4.2 Nr. 1.
    Das Umstellen von Monitor und `docs/deployment.md` gehört ins **Cutover-Fenster** (§4.6 Nr. 15),
    nicht in den Abbau.
  * **`SUITE_ADMIN_GROUP_RADIO` bleibt gesetzt und nicht leer.** Eine leere Liste gewährt
    **nichts**, und weil `radio` den `isModuleAdmin`-Kurzschluss modulintern ignoriert (gesetzte
    Entscheidung 9), fängt der Suite-Admin niemanden auf: die Folge ist ein **stummes 404 für jede
    Verwaltungsseite**. Das ist keine Abbau-Zeile, aber es ist die Zeile, die beim Aufräumen am
    ehesten versehentlich geleert wird.
  * **Der Abräum-Service-Worker unter `/sw.js` bleibt.** Er gehört in den **ersten Deploy**, nicht
    in den Cutover (§4.7.1) — und er bleibt danach stehen: der Origin ist zeichengleich, und ein
    Gerät, das den Alt-Kiosk installiert hat und erst in sechs Monaten wieder aufgeschlagen wird,
    braucht ihn dann noch. **Er ist kein Abbau-Posten** und hat kein Ablaufdatum, das diese Spec
    setzen könnte.
  ````

- [ ] **Schritt 4: Gegenprobe**

  ```bash
  # (a) die drei Redirect-Zeilen stehen in der richtigen Reihenfolge (Labels, .env, DNS):
  sed -n '/^## §5.8 /,/^## §5.9 /p' docs/runbooks/radio-cutover.md | grep -n '^- \[ \] [123]\.'
  # Erwartung: drei Zeilen, in dieser Reihenfolge: Labels — SUITE_REDIRECT_RULE — DNS

  # (b) die Deploy-Pfad-Warnung steht am Label-Schritt:
  grep -c 'byteweise' docs/runbooks/radio-cutover.md            # Erwartung: 1

  # (c) §5.9 fuehrt fuenf Punkte:
  sed -n '/^## §5.9 /,/^## /p' docs/runbooks/radio-cutover.md | grep -c '^\* '
  # Erwartung: 5
  ```

- [ ] **Schritt 5: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): das Ende des Redirects (Bedingung statt Datum, N9) und was der Abbau nicht anfasst"
  ```

---

### Aufgabe 5.9: Die Erfüllungspunkte — die Klammer, die um 23 Uhr gelesen wird

**Zuletzt**, weil dieser Abschnitt die Zahlen der vorher geschriebenen Abschnitte **zählt** statt
sie zu behaupten. **Vier** Zahlen bzw. Zusagen dieser Liste waren in der Spec falsch, und jede davon
hing an einer ⛔-Sperre.

⚠️ **Diese Liste wird VOLLSTÄNDIG geschrieben, alle achtunddreißig Punkte.** Kapitel 5 beansprucht
`## §H` allein (Namensraum-Tabelle oben) — also kann kein anderer Planteil die Punkte 1–8, 10–16 und
18–26 nachliefern. Sie werden hier **wörtlich aus Spec-Zeilen 4793–4846 übernommen**; ihre
**Inhalte** gehören weiter den Kapiteln 1–4, ihre **Zeile** gehört dieser Klammer. Eine Klammer mit
Löchern ist genau der W8-Fehler, gegen den dieses Kapitel gebaut ist.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` — Abschnitt `## §H` anfügen (Hausform
  `files-cutover.md:360-370`)
- Test: keine Testdatei — die Gegenprobe in Schritt 6 **ist** die Abnahme dieser Aufgabe

**Schnittstellen:**
- Verbraucht: alle Abschnitte aus den Aufgaben 5.1–5.8 · die Prüflisten G1–G6 (Planteil Kapitel 3),
  §4.2 und §4.6 (Planteil Kapitel 4) · Spec-Zeilen 4793–4846 als Vorlage der Punkte 1–26
- Liefert: die **vollständige** Erfüllungsliste mit **achtunddreißig** Punkten, davon **vier
  berichtigt** — Punkt 3 (die Retention-Neutralisierung ist **kein** verfügbarer Zweig, N7), Punkt 9
  („**§A Nr. 1–14**" — der Runbook-Abschnitt und seine vierzehn Punkte, nicht die §4.2-Numerierung
  der Spec), Punkt 17 („**Z: alle zehn Zeilen `0`**"), Punkt 29 („**P1–P6**, P6 als
  Sperre") — **und einen neuen** Punkt 38 (die vier N-Leerstellen) · Punkt 37 mit einer
  **gezählten** statt einer geschriebenen ⬜-Anzahl

- [ ] **Schritt 1: Kopf und Regel — samt der Erklärung, warum es achtunddreißig sind**

  ````markdown
  ## §H — Wann dieser Cutover erfüllt ist

  Nach dem Muster `docs/runbooks/files-cutover.md:360-370`. **Jeder Punkt mit Ausgabe, nicht mit
  Erwartung** — eine abgehakte Zeile ohne protokollierte Zahl ist keine abgehakte Zeile. Die
  kleinteiligen Prüflisten stehen in **G1–G6**, **§A Nr. 1–14**, **§D Nr. 1–16** und **§5.2–§5.4**;
  diese Liste ist die Klammer darüber. ⚠️ **Genannt sind hier die Marken DIESES Runbooks, nicht die
  Kapitelnummern der Spec** — §A ist dort §4.2, §D ist dort §4.6.

  ⚠️ **Achtunddreißig Punkte, nicht siebenunddreißig.** Spec 2 führt 1–37. **Punkt 38 ist neu** und
  sammelt die vier Leerstellen ein, die beim Schreiben des Abbau-Kapitels entstanden sind (N7–N10);
  ohne ihn fielen sie durch das Raster von Punkt 37, das nur die ⬜-Tabelle des Rahmens abdeckt.
  **Vier Punkte weichen inhaltlich von Spec 2 ab** — 3, 9, 17 und 29 —, und jeder trägt den Grund
  neben sich.
  ````

- [ ] **Schritt 2: Punkte 1–8 (vor der Generalprobe, Generalprobe) — Punkt 3 berichtigt**

  ````markdown
  **Vor der Generalprobe**

  - [ ] 1. **Die drei Import-Tests sind grün** (§1.10): Faktor 1000 mit je Feld verschiedenen
        Fixture-Werten · asymmetrische Idempotenz Fall A und B (Zusicherung = **Fehlschlag**) ·
        Spaltenposition gegen die echte Alt-DDL
  - [ ] 2. **Die Quelltext-Zusicherung zur Cookie-Domain** (Spec 1 §3.8) und **R36** (§3.2.6 V8)
        sind grün
  - [ ] 3. ⛔ **Der Standby-Stack kann keine Historie mehr löschen — und der Nachweis ist das
        KOPIERTE VOLUME**, **vor dem ERSTEN Generalproben-Snapshot** (W1):
        nachgewiesen am ______ durch ____________
        ⚠️ **Berichtigt gegenüber Spec 2.** §4.2 Nr. 3 bietet „`HISTORY_RETENTION_MONTHS`
        neutralisieren **oder** Volume kopieren" an. **Der erste Zweig ist keine Env-Zeile:**
        `export const HISTORY_RETENTION_MONTHS = 2;` (`radio-admin@265abd5:server/src/services/
        retentionService.ts:9`), und der Name kommt weder in `.env.example` noch in
        `docker-compose.yml` vor. „Neutralisieren" hieße Quelltext ändern und `radio-admin:local`
        neu bauen — was §5.5 Posten 6 („Image behalten") bricht. **Verfügbar sind nur: Volume
        kopieren, oder nicht starten** (§5.7, **N7**)
  - [ ] 4. **⬜ L13 und ⬜ L14 abgelesen** — ohne sie ist §4.5 Schritt 8 nicht ausführbar

  **Generalprobe**

  - [ ] 5. **G1–G6 vollständig grün** (§3.1.5). Es gibt keine teilweise grüne Generalprobe
  - [ ] 6. **Der absichtliche Startabbruch wurde einmal gesehen** (§3.2.3)
  - [ ] 7. **U8 gemessen:** Volumengröße und Dump-Dauer beider Stacks — sie bemessen das Fenster
  - [ ] 8. **Der Prüfcontainer ist entfernt und `$GP` gelöscht** (§3.2.7)
  ````

- [ ] **Schritt 3: Punkte 9–19 (vor dem Fenster, im Fenster) — Punkte 9 und 17 berichtigt**

  ````markdown
  **Vor dem Fenster**

  - [ ] 9. **§A Nr. 1–14 vollständig**, insbesondere: `/api/health/radio` antwortet **200** (nicht
        503) · Abräum-Worker deployt · Cloudflare-Zonenregeln gelesen · `X-Forwarded-Host` am Server
        belegt · Weg A/B entschieden · ⛔ **Nr. 13: die heutige Router-Regel BEIDER Hosts wörtlich
        protokolliert, samt dem Handgriff, der sie zurückstellt** · **Nr. 14: der ausgerollte
        `compose.yaml`-Stand** (⬜ **N2**) — abgelesen **am Server**, nicht am Repo.
        ⚠️ **§A, nicht §4.2 — und vierzehn, nicht zwölf.** Dieses Runbook hat keinen Abschnitt
        „§4.2"; die Liste, um die es geht, steht hier als **§A** („Was vor dem Fenster fertig sein
        muss"). Nr. 13 ist die Vorbedingung, ohne die §4.5 Schritt 9 Nr. 1 („Alt-Router zuerst weg")
        **kein ausführbares Ziel** und §4.9 3c/3d **nichts zurückzustellen** hat — in beiden
        eingecheckten Alt-Compose-Dateien kommt `traefik` **nicht ein einziges Mal** vor, beide
        veröffentlichen nur `ports:`. **Fehlt die Zeile, wird das Fenster nicht eröffnet.** Nr. 14
        kommt in Spec 2 §4.2 gar nicht vor und ist eine Ablesung am Server, keine Zeile im Repo.
  - [ ] 10. ⛔ **U4 / C.5 ist beantwortet** — sie blockiert den **Freeze**, nicht erst den Abbau
  - [ ] 11. **E1–E8 ausgefüllt und im Protokoll**, `<E1>` exakt wie im `groups`-Claim
  - [ ] 12. **Der Ausstellungsplan für die Zugangscodes steht** (§4.8), Zweig nach C.3 gewählt,
        Person aus E8 benannt

  **Im Fenster**

  - [ ] 13. **`<freeze_iso>` protokolliert** (§4.5 Schritt 1) — er ist der Cutoff jeder
        Vergleichsrechnung
  - [ ] 14. **Der Snapshot entstand mit `.backup`, nicht mit `cp`** (W1), und **alle vier Glieder
        der Zählkette** schließen (§1.8)
  - [ ] 15. **A1–A13 gelaufen**, die **acht** blockierenden erfüllt, jede 🧹-Bereinigung
        **wiederholt und protokolliert** (§3.5 Klasse B)
  - [ ] 16. **Fünf Paare gleich** (§4.5 Schritt 5 a), **fünf** Feldstichproben zeilengenau (b), die
        Zeitstempel-Stichprobe aus `returned_at IS NOT NULL` (c)
  - [ ] 17. **R und Z grün**, mit `<freeze_iso>` in **beiden** Armen:
        R Quelle ______ / Ziel ______ · **Z: alle zehn Zeilen `0`** — neun Zahlgrenzproben **plus**
        die Formatprobe auf `devices.last_updated_at`, jede einzeln eingetragen (§5.2).
        ⚠️ **Zehn, nicht drei.** Z ist die einzige Probe, die sagt, **welche** Spalte vom
        Faktor-1000-Fehler betroffen ist; wer drei Zahlen abhakt und sieben ungelesen lässt, gibt
        ein Volume frei, dessen Zeitstempelspalten zu sieben Zehnteln ungeprüft sind.
  - [ ] 18. **`loans_device_active_uidx` existiert im Ziel** (§2.6) und `zugangscode_id` ist überall
        NULL
  - [ ] 19. **Schritt 9 war EIN Schritt:** Alt-Router zuerst weg, dann die drei ⏸-Zeilen, dann
        `up -d` — **und `<umschwenk_iso>` samt `<umschwenk_epoch_sekunden>` steht im Protokoll**
        (§5.1; ohne sie ist §4.9s Nachtrag unausführbar)
  ````

- [ ] **Schritt 4: Punkte 20–26 (nach dem Umschwenk)**

  ````markdown
  **Nach dem Umschwenk**

  - [ ] 20. **§4.6 Nr. 1–16 vollständig, mit Ausgabe** — insbesondere Nr. 1 (Body, nicht nur 200),
        Nr. 5 (**zwei** Ausgänge), Nr. 7 (alle drei `curl`), Nr. 10 (Login-Rückweg, Handarbeit, E8)
  - [ ] 21. **Der erste Zugangscode ist ausgestellt** — auf dem umgeschwenkten Host, durch E8,
        **vor** der Freigabe an die Nutzer (§4.8.2). Der Restposten „Fläche ohne Code" ist
        protokolliert
  - [ ] 22. **`RADIO_HISTORIE_PURGE=0` entfernt** — **erst nach** Punkt 17, und der zweite Log-Blick
        zeigt **keine** `radio:`-Zeile mehr (W10)
  - [ ] 23. **Ein Telefon, das den Alt-Kiosk kannte, wurde einmal neu geladen** (§4.7.2)
  - [ ] 24. **Das Backup ist einmal von Hand gelaufen** und `radio.db` liegt im Tarball
  - [ ] 25. **Monitor und `docs/deployment.md` zeigen auf `/api/health/radio`**, nie auf
        `/api/health`
  - [ ] 26. **Die Neuigkeitennotiz ist eingetragen**, `datum` = Rollout-Tag, `<N>` = der gesetzte
        Wert, ausgeschrieben
  ````

- [ ] **Schritt 5: Punkte 27–38 (Standby und Abbau) — Punkt 29 berichtigt, Punkt 38 neu**

  ````markdown
  **Standby und Abbau**

  - [ ] 27. **Standby-Ende als Datum und mit Namen** im Protokoll (§5.1): ______ / ____________ —
        und `<umschwenk_iso>` **samt** `<umschwenk_epoch_sekunden>` eingetragen
  - [ ] 28. **A und T** protokolliert; A mit **fünf** gleichen Paaren, T mit **höchstens einer**
        lebenden Zeile
  - [ ] 29. **P1–P6 vollständig als Ausgabe**: `pg_tables` (jede unerwartete Tabelle gezählt) ·
        `Loan`/`Device` **NULL, NULL** und **5** Migrationen · `count(*) from "AdminUser"` = ______ ·
        `session` · `pg_stat_user_tables` (als **Schätzwert** beschriftet) · **P6-Dump existiert und
        wurde geöffnet**.
        ⚠️ **Sechs, nicht fünf** — und **P6 ist eine Sperre, keine Protokollzeile** (§5.3, §5.5).
  - [ ] 30. **Beide Archivdateien wurden geöffnet** (§5.4): `.tables` zeigt alle **sechs**,
        `pragma integrity_check` = `ok`, `pg_restore --list` liefert eine Objektliste — und die
        Archivdateien liegen **nicht** auf dem Suite-Server (**N8**, drei Zeilen):
        ____________________
  - [ ] 31. **Der radio-admin-Stack wurde im Standby nie gestartet** — belegt mit
        `docker inspect … .State.StartedAt` **vor** `<freeze_iso>` (§5.7), **nicht** mit einem
        leeren Log: die Purge-Zeile erscheint nur bei `deleted > 0`. ⚠️ Ist er doch gestartet
        worden, ist der Nachweis aus §5.7 protokolliert **und** die Env-Neutralisierung war **kein**
        verfügbarer Zweig (**N7**)
  - [ ] 32. **Beide Alt-Stacks abgebaut** (§5.5 Posten 2–6), **Geheimnisse gelöscht** (§5.6) mit
        `API_TOKEN` und **Fundort**, **U6 entschieden und begründet**
  - [ ] 33. **Beide Repos archiviert, nicht gelöscht**, mit `265abd5` und `f883ec4` im
        Archivierungshinweis
  - [ ] 34. ⛔ **Punkt 10 bleibt offen, solange U4 offen ist:** „abgebaut" heißt sonst nur „die
        Teile, die im Repo standen"
  - [ ] 35. **Der Redirect ist abgebaut** (§5.8, Reihenfolge **Labels → `.env` → DNS zuletzt**, und
        Schritt 1 über den **Deploy-Pfad**) **oder seine Bedingung läuft nachweislich weiter**:
        Vier-Wochen-Fenster begonnen am ______, Protokollquelle (**N9**) ____________
  - [ ] 36. **`radio-admin.iuk-ue.de` steht in `SUITE_TRAEFIK_RULE` nicht** — geprüft mit
        `docker compose config | grep -A2 radio-admin-alt`, Ausgabe im Protokoll
  - [ ] 37. **Die ⬜-Liste ist abgearbeitet** — **jede** Zeile trägt eine Ablesung, und die
        Runbook-Stellen sind darauf nachgezogen. ⚠️ **Die Anzahl wird gezählt, nicht abgeschrieben**
        (Befehl unten): sie steht in der ⬜-Tabelle des Rahmens und kann sich mit einem Nachtrag
        ändern. Gezählt: ______ · davon abgelesen: ______
  - [ ] 38. **Die vier N-Leerstellen dieses Kapitels sind beantwortet:** N7 (Retention
        konfigurierbar?) · N8 (Archiv-Ablageort, drei Zeilen) · N9 (Zugriffsprotokoll und seine
        Aufbewahrungsdauer) · N10 (Arbeitsverzeichnis der Alt-Checkouts)

  ⚠️ **Die Punkte 10, 34 und 38 sind die einzigen dieser Liste, die kein Befehl beantwortet.** Alle
  anderen haben eine Ausgabe. Diese sind **Auskünfte**, und sie sind **vor** dem Cutover einzuholen
  — nach dem Abbau sind sie nur noch durch Ausprobieren zu beantworten, und das Ausprobieren heißt
  dann: „was ist kaputtgegangen?"
  ````

- [ ] **Schritt 6: Gegenprobe — die Klammer ist vollständig, und sie zählt statt zu behaupten**

  ```bash
  # (a) VOLLSTAENDIGKEIT: achtunddreissig Punkte, lueckenlos von 1 bis 38.
  sed -n '/^## §H /,$p' docs/runbooks/radio-cutover.md \
    | grep -oE '^- \[ \] [0-9]+\.' | grep -oE '[0-9]+' | sort -n | tr '\n' ' '
  # Erwartung: 1 2 3 ... 38, jede Zahl GENAU EINMAL. Eine Luecke ist ein Stopp-Punkt:
  # kein anderer Planteil darf in §H schreiben (Namensraum-Tabelle).
  sed -n '/^## §H /,$p' docs/runbooks/radio-cutover.md | grep -cE '^- \[ \] [0-9]+\.'
  # Erwartung: 38
  # Gegenzaehlung an der Spec (dort 37):
  # ⛔ NACHTRAG 2026-08-28: wortlaut-verankert statt ueber Zeilennummern — C41 hat die Spec
  #    um 79 Zeilen verlaengert, `sed -n '4784,4876p'` liest seitdem 3 statt 37.
  sed -n '/^# Erfüllungspunkte/,/^# Anhang A/p' \
        docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
    | grep -cE '^- \[ \] [0-9]+\.'
  # Erwartung: 37 — die Differenz ist Punkt 38 und im Kopf von §H begruendet.

  # (b) die vier berichtigten Punkte stehen berichtigt da:
  grep -c '§A Nr. 1–14 vollständig'   docs/runbooks/radio-cutover.md   # Erwartung: 1
  # ⚠️ §A, NICHT §4.2: dieses Runbook hat keinen Abschnitt "§4.2" — die Liste heisst
  #    hier §A, und sie fuehrt vierzehn Punkte (Nr. 14 = der ausgerollte
  #    compose.yaml-Stand, den Spec 2 §4.2 gar nicht kennt). Die Fassung "§4.2
  #    Nr. 1–13" ist allein in der SPEC richtig und wird dort geprueft (Aufgabe 5.10).
  grep -n '§4.2 Nr. 1–13 vollständig' docs/runbooks/radio-cutover.md
  # Erwartung: keine Ausgabe. Ein Treffer heisst, Punkt 9 traegt noch die Spec-Numerierung.
  # ⚠️ Bewusst mit "vollständig" gesucht: ein §A-Absatz DARF auf "§4.2 Nr. 1–13 der
  #    Spec" verweisen — verboten ist allein diese Fassung als ERFUELLUNGSPUNKT.
  # ⚠️ §H-LOKAL ankern, nicht ueber die ganze Datei. Die Zeichenkette steht ausserdem in
  #    der Erfuellungstabelle G5 (§G13, aus der Generalprobe) — dort zu Recht, sie ist
  #    kein Erfuellungspunkt. Ueber die ganze Datei gemessen liest der Zaehler DREI, nach
  #    Ausfuehrung von NS1 (Teil 4 schreibt kein zweites §H) ZWEI. Gemeint ist aber
  #    „genau EIN Erfuellungspunkt traegt diesen Wortlaut":
  # ⚠️ Der Anker traegt den VOLLEN Wortlaut, nicht nur "## §H". Teil 4 schreibt heute
  #    zweimal "## §H — Wann das FENSTER erfuellt ist"; nach NS1 (§H gehoert Kapitel 5
  #    allein) entfaellt beides, aber solange es steht, faengt ein blosses '/^## §H/'
  #    mehrere Bereiche und der Zaehler liest zwei statt eins.
  sed -n '/^## §H — Wann dieser Cutover erfüllt ist/,/^## /p' \
        docs/runbooks/radio-cutover.md \
    | grep -c 'Z: alle zehn Zeilen'                                     # Erwartung: 1
  grep -c 'P1–P6 vollständig'         docs/runbooks/radio-cutover.md   # Erwartung: 1
  grep -c 'Der Standby-Stack kann keine Historie mehr löschen' docs/runbooks/radio-cutover.md  # 1

  # (c) und die vier FALSCHEN Fassungen kommen nirgends mehr vor:
  grep -n '§4.2 Nr. 1–12\|alle drei `0`\|(P1–P5)' docs/runbooks/radio-cutover.md
  grep -n 'HISTORY_RETENTION_MONTHS neutralisiert oder Volume kopiert' docs/runbooks/radio-cutover.md
  # Erwartung beider Befehle: keine Ausgabe. Jeder Treffer ist ein Stopp-Punkt.

  # (d) die ⬜-Anzahl fuer Punkt 37 wird GEZAEHLT (heute: 14) und eingetragen:
  sed -n '/^| ⬜ | Was genau abzulesen ist/,/^$/p' \
    docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
    | grep -cE '^\| \*\*L[0-9]+\*\* \|'
  ```

- [ ] **Schritt 7: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio-cutover): die Erfuellungsklammer vollstaendig — 38 Punkte, davon 3, 9, 17 und 29 berichtigt"
  ```

---

### Aufgabe 5.10: Der datierte Nachtrag in Spec 2 — sieben Stellen und zwei Anhangszeilen

**Kein stilles Überschreiben** (Hausform: `docs/superpowers/plans/2026-08-15-aufgaben-koordination-
aus-gruppe.md:533-534` — „bekommt einen **datierten Nachtrag**"). **Sieben Stellen**, und sie zerfallen
in zwei Klassen: **fünf** widersprechen dem Runbook, das die Aufgaben 5.2, 5.5 und 5.9 geschrieben
haben; **zwei** ziehen den **Rahmen** nach, den zwei Nahtstellen des Cutover-Leitplans entschieden
haben (NS8 zur ⬜-Tabelle, NS11 zum Fenster-Prüfcontainer). Jede der sieben bekommt eine
Nachtragszeile mit Datum und Grund. ⚠️ **Die zwei aus der zweiten Klasse sind kein Beiwerk:** ohne sie
bleibt in der Spec eine Leerstelle stehen, die der Leitplan für **verkleinert** erklärt hat, und ein
Hostwert, den er für **geheilt** hält — „der Rahmen wird nachgezogen, nicht ignoriert"
(Cutover-Leitplan NS8).

**Dateien:**
- Ändern: `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`
  - §5.2.2 Abfrage A, Zielarm (`:4293-4299`) — auf die `docker run`-Form gegen `$VOL_SUITE`
  - §5.3 Sperrenkasten (`:4609-4610`) — P6 ergänzen, P5 als Protokoll benennen
  - Erfüllungspunkt **3** (`:4797-4798`) — die Env-Neutralisierung ist kein verfügbarer Zweig (N7)
  - Erfüllungspunkte **9** (`:4810`) und **17** (`:4828-4829`) — 1–13 bzw. zehn
  - Anhang **A-3** (`:4891`) und **A-5** (`:4893`)
  - **⬜-Tabelle, Zeile `L5` (`:185`)** — die Verkleinerung nach **NS8**, samt **berichtigtem Beleg**:
    `src/core/health/index.ts:4-15` statt `src/app/api/health/[modul]/route.ts:11-18`
  - **§3.2.2, die `docker run`-Form (`:2571-2611`)** — der **dritte** Unterschied des
    Fenster-Prüfcontainers zu W5 nach **NS11**: `SUITE_HOST_RADIO` als **Kommaliste**
- Test: keine Testdatei — Gegenprobe in Schritt 6

**Schnittstellen:**
- Verbraucht: die Befunde aus Aufgabe 5.2 (Zielarm), 5.5 (P6), 5.7 (N7), 5.9 (die vier Zahlen) · die
  Entscheidungen **NS8** und **NS11** des Cutover-Leitplans
- Liefert: eine Spec, deren Zahlen mit dem Runbook übereinstimmen · den korrigierten Anhang A-3
  (**Zusage an den Planteil zu Kapitel 4**) · den korrigierten Anhang A-5 · die **verkleinerte
  L5-Zeile** mit richtigem Beleg · den **dritten** Unterschied in §3.2.2

⚠️ **Was diese Aufgabe NICHT anfasst:** §4.2 Nr. 3 selbst (der Ursprung des N7-Befundes) gehört dem
Planteil zu **Kapitel 4**. Hier wird nur der **Erfüllungspunkt 3** nachgezogen, der in meinem
Bereich liegt — und die Zusage an Kapitel 4 steht unten in der Zusagenliste.

- [ ] **Schritt 1: §5.2.2 Abfrage A, Zielarm — auf die Containerform ziehen**

  Der Block bei `:4293-4299` wird **zeichengleich** durch die Fassung aus Aufgabe 5.2 Schritt 2
  ersetzt (Volume-Ablesung, `ls -ln`-Gegenprobe, `docker run`-Schleife, `zugangscodes`-Zeile mit
  Zeitindex). Darüber die Nachtragszeile:

  ````markdown
  ⚠️ **Nachtrag 2026-08-18 (Re-Kritik, dreifach gemeldet):** der Zielarm las mit
  `sqlite3 -readonly "$DATA_DIR/radio.db"` **auf dem Host**. Diesen Pfad gibt es dort nicht —
  `DATA_DIR=/data` ist ein Wert **im Container** (`compose.yaml:79`), gemountet wird das benannte
  Volume `suite_data` (`compose.yaml:99`, `:221-223`). Die Nachbarblöcke R und Z verbieten die Form
  zwanzig Zeilen weiter ausdrücklich; A war der eine von dreien, an dem sie stehen blieb. Ersetzt
  durch die §2.2.2-Form gegen `$VOL_SUITE`, **einschließlich** der Gegenprobe
  `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data`.
  ````

- [ ] **Schritt 2: Sperrenkasten und die drei Erfüllungspunkte**

  ````markdown
  # Erfuellungspunkt 3, Zeilen 4797-4798 — neu:
  - [ ] 3. ⛔ **Der Standby-Stack kann keine Historie mehr löschen — Nachweis ist das KOPIERTE
        VOLUME**, **vor dem ersten Generalproben-Snapshot** (W1): nachgewiesen am ______ durch ____
        *Nachtrag 2026-08-18 (**N7**): „`HISTORY_RETENTION_MONTHS` neutralisiert" ist kein
        ausführbarer Zweig. `export const HISTORY_RETENTION_MONTHS = 2;`
        (`radio-admin@265abd5:server/src/services/retentionService.ts:9`); der Name kommt weder in
        `.env.example` noch in `docker-compose.yml` vor (`git grep -n RETENTION 265abd5` = zwei
        Treffer, beide in dieser Datei). „Neutralisieren" hieße Quelltext ändern und
        `radio-admin:local` neu bauen — was §5.3 Posten 6 („Image behalten") bricht.*

  # §5.3, Zeile 4610 — neu:
  > ⛔ **Kein Häkchen in dieser Liste, solange ein Block aus §5.2 offen oder rot ist.** Die
  > Abbau-Sperren sind: **A, T, R, Z, P1, P2, P3, P4, P6** und **beide Archivproben** aus §5.2.4.
  > **P5 ist Protokoll, keine Sperre** — **P6 ist Sperre, kein Protokoll.**
  >
  > ⚠️ *Nachtrag 2026-08-18:* P6 fehlte in diesem Kasten, obwohl §5.2.3 ihn mit „Erst danach darf
  > das Volume fallen" überschreibt und Posten 3 den Abbau ausdrücklich „erst nach P6" bindet — der
  > `pg_dump` ist die **einzige** Sicherung, die dieses Volume je hatte.

  # Erfüllungspunkt 9, Zeile 4810 — neu:
  - [ ] 9. **§4.2 Nr. 1–13 vollständig**, insbesondere: … · ⛔ **Nr. 13** (heutige Router-Regel
        beider Hosts wörtlich protokolliert, samt Rückstell-Befehl)
        *Nachtrag 2026-08-18: „Nr. 1–12" ließ genau den Posten aus, der ausweislich des Kopfes
        (Zeile 47) das Ergebnis des vorigen Kritikdurchgangs ist und selbst ein ⛔ trägt.*

  # Erfüllungspunkt 17, Zeile 4829 — neu:
        … · **Z: alle zehn Zeilen `0`** (neun Zahlgrenzproben + die Formatprobe
        `devices.last_updated_at`)
        *Nachtrag 2026-08-18: „alle drei" gegen zehn `union all`-Glieder und gegen §5.2.2 Zeile
        4412, die „alle zehn" schon sagt.*
  ````

- [ ] **Schritt 3: Anhang A-3 und A-5 berichtigen**

  ⚠️ **A-3 ist der wichtigere der beiden**, weil er heute einen **blockierenden** Fund
  *legitimiert*: er erklärt es für „harmlos", dass §4.9 3b `start postgres backend` **ohne**
  `--profile full-app` fährt. Das ist es nicht — und jetzt gibt es den Repo-Beleg.

  ````markdown
  # Anhang A, Zeile 4891 — A-3 neu:
  | A-3 | **Postgres im Freeze nicht gestoppt, im Rückweg gestartet** — §4.5 Schritt 1 stoppt nur `backend`, §4.9 3b startet `postgres backend` | **Teilweise bestätigt, Nachtrag 2026-08-18.** Was **harmlos bleibt**: der Postgres hat keinen eigenen Schreiber, das Stoppen von `backend` schließt den Schreibweg, und `start postgres backend` ist auf einen laufenden Postgres idempotent. Was **nicht harmlos ist und hier berichtigt wird**: §4.9 3b fehlt `--profile full-app`. `backend` steht hinter `profiles: ["full-app"]` (`radio-inventar/docker-compose.yml:27` @ `f883ec4`, unabhängig nachgelesen), `postgres` nicht — und §4.5 Schritt 1 begründet für den **Stopp** ausdrücklich, warum das Profil in den Befehl gehört („ohne das Profil kann der Stopp ein No-op sein, und ein No-op sieht wie ein Erfolg aus"). **Das Argument ist richtungsunabhängig.** Verbindlich: der Stopp-Befehl aus Schritt 1 ist die Vorlage des Start-Befehls in §4.9, Wort für Wort, nur `stop` gegen `start` getauscht |

  # Anhang A, Zeile 4893 — A-5 neu:
  | A-5 | **Zwei Zeitstempelproben** — §3.1.5.3 (b) `min/max(returned_at)` gegen Abfrage Z (**zehn** Spalten, feste Epoche) | **Komplementär, nicht doppelt.** (b) ist die eine eindeutige Zeile für die Generalprobe, Z benennt zusätzlich **welche** Spalte. Beide bleiben; Z ist die Abbau-Sperre. *Nachtrag 2026-08-18: die Nebenbemerkung „drei Spalten" war derselbe Zählfehler wie in Erfüllungspunkt 17 — es sind zehn. Die Entscheidung von A-5 ist davon unberührt.* |
  ````

- [ ] **Schritt 4: Die ⬜-Zeile `L5` verkleinern — und den Beleg berichtigen, der ins Leere zeigt**

  ⚠️ **Das ist der Nachzug des Rahmens, den NS8 angeordnet hat**, und er hat zwei Hälften: die
  Leerstelle wird **kleiner** (offen bleibt allein der **Wert** von `revision`), und ihr **Beleg**
  wird richtig. Der heutige Beleg `src/app/api/health/[modul]/route.ts:11-18` zeigt **nicht** auf die
  Antwortform, sondern in einen Kommentarblock — drei Planteile haben das unabhängig voneinander
  gemessen und ausdrücklich **an die Zusammenführung gemeldet**, statt es eigenmächtig zu ändern.
  ⚠️ **Nicht die ganze Zeile streichen:** die Ablesung bleibt, sie wird nur auf das eingekürzt, was
  heute wirklich niemand wissen kann.

  ````markdown
  # ⬜-Tabelle, Zeile 185 — L5 neu:
  | **L5** | **Verkleinert, Nachtrag 2026-08-18 (Cutover-Leitplan NS8).** Aus dem Repo heute lesbar: `module` = der **Modulname**, `status: "ok"` = der **DB-Zugriff** (er entsteht **erst nach** `openModuleDatabase()` plus `db.prepare("SELECT 1").get()`), `revision` = der **Commit** — `src/core/health/index.ts:4-15` und `src/app/api/health/[modul]/route.ts:23-26`. **Offen bleibt allein der WERT von `revision`.** ⚠️ Der bisher zitierte Beleg `route.ts:11-18` zeigt **nicht** auf die Antwortform, sondern in einen Kommentarblock | **§4.2 Nr. 1** — die Protokollzeile des ersten Deploys, **nicht** der Bau (im Runbook ist das **§A Nr. 1**) | §2.6, §3.2.6 V3, §4.6 Nr. 3 |
  ````

- [ ] **Schritt 5: §3.2.2 — der DRITTE Unterschied des Fenster-Prüfcontainers**

  ⚠️ **Auch das ist Rahmen-Nachzug, angeordnet von NS11**, und der Grund ist eine Prüfung, die sonst
  etwas anderes misst, als ihr Name sagt: die Fenster-Prüfungen fahren `curl` mit vorgetäuschtem
  `Host` auf **beide** Namen. Der Nachtrag steht **unmittelbar unter der `docker run`-Form**, damit
  ihn niemand „vereinfacht" — dieselbe Stelle, an der auch die zwei bekannten Unterschiede stehen.

  ````markdown
  # §3.2.2, direkt unter der `docker run`-Form (Zeilen 2571-2611) — neu:
  ⚠️ **Nachtrag 2026-08-18 (Cutover-Leitplan NS11): der FENSTER-Prüfcontainer (§4.5 Schritt 8) hat
  DREI Unterschiede zu `radio-gp`, nicht zwei.** W5 (`:432-476`) nennt zwei — das **produktive
  Volume** statt des Bind-Pfads `$GP/data` (W5 schreibt es als `-v suite_data:/data`; verbindlich ist
  die **Protokollzeile `$VOL_SUITE`** aus §4.5 Schritt 4 Handgriff 1, weil der echte Name das
  Projektpräfix trägt), und ⛔ **kein** `AUTH_DEV_LOGIN`. Der dritte:
  **`SUITE_HOST_RADIO=localhost,radio.iuk-ue.de`** statt `SUITE_HOST_RADIO=localhost` — eine
  **Kommaliste mit zwei Werten**. Ohne den zweiten Wert fällt `moduleForHost` für
  `radio.iuk-ue.de` auf das **Portal** zurück (`src/core/hosts.ts:52-57`), und die Fenster-Probe mit
  vorgetäuschtem `Host` misst still das Portal statt `radio`. Belegt nachgemessen: `envHostsFor`
  splittet auf `,` (`src/core/hosts.ts:39-46`), `validateHostConfig` hat gegen beide Werte nichts
  (`:65-99`).
  **Eine Ergänzung zu W5, kein Widerspruch zu ihm** — für die **Generalprobe** bleibt es bei dem
  einen Wert `localhost`.
  ````

- [ ] **Schritt 6: Gegenprobe gegen die Spec**

  ```bash
  # (a) der Host-Lesebefehl wird in Kapitel 5 der Spec nicht mehr AUSGEFUEHRT:
  sed -n '/^## 5.1 /,/^# Erfüllungspunkte/p' \
        docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
    | grep -c 'sqlite3 -readonly "\$DATA_DIR/radio.db"'
  # Erwartung: 1 — und der eine Treffer ist namentlich bekannt: die Nachtragszeile, die
  # Schritt 1 dieser Aufgabe UEBER den ersetzten Block schreibt und die die Zeichenkette
  # ZITIERT, um sie zu verbieten. ⛔ „0" waere die falsche Erwartung und wuerde bei
  # korrekter Arbeit rot — vor der Aenderung stand die Form hier zweimal als
  # ausfuehrbarer Zielarm (§5.2.2 Abfrage A, Spec-Zeilen 4295 und 4298).
  # Gegenprobe, dass es wirklich die Nachtragszeile ist und kein Zielarm-Rest:
  sed -n '/^## 5.1 /,/^# Erfüllungspunkte/p' \
        docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
    | grep -n 'sqlite3 -readonly "\$DATA_DIR/radio.db"'
  # Erwartung: der Treffer steht in einem Satz, der die Form VERBIETET — nicht in einer
  # Zeile, die sie ausfuehrt.

  # (b) Sperrenkasten und Erfuellungspunkte tragen die neuen Zahlen:
  grep -c 'P1, P2, P3, P4, P6' docs/superpowers/specs/2026-08-18-radio-cutover-design.md   # 1
  grep -c '§4.2 Nr. 1–13'      docs/superpowers/specs/2026-08-18-radio-cutover-design.md   # 1
  grep -c 'Z: alle zehn Zeilen' docs/superpowers/specs/2026-08-18-radio-cutover-design.md  # 1
  grep -n '§4.2 Nr. 1–12\|Z\s*$\|alle drei `0`' \
    docs/superpowers/specs/2026-08-18-radio-cutover-design.md | grep 'alle drei'
  # Erwartung: keine Ausgabe

  # (c) A-3 legitimiert das fehlende Profil nicht mehr:
  grep -c 'profiles: \["full-app"\]' docs/superpowers/specs/2026-08-18-radio-cutover-design.md
  # Erwartung: >= 2 (§4.5 Schritt 1 und Anhang A-3)

  # (d) die L5-Zeile ist verkleinert UND ihr Beleg ist berichtigt (NS8):
  grep -c 'src/core/health/index.ts:4-15' docs/superpowers/specs/2026-08-18-radio-cutover-design.md
  # Erwartung: >= 1
  grep -n '^| \*\*L5\*\* |' docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
    | grep -c 'route.ts:11-18'
  # Erwartung: 0 — der Beleg, der in einen Kommentarblock zeigte, steht nicht mehr
  #   als Nachweis da. ⚠️ Die ZEILE selbst bleibt: L5 ist verkleinert, nicht gestrichen.
  grep -c '^| \*\*L5\*\* |' docs/superpowers/specs/2026-08-18-radio-cutover-design.md
  # Erwartung: 1

  # (e) §3.2.2 fuehrt den DRITTEN Unterschied des Fenster-Pruefcontainers (NS11):
  sed -n '/^### 3.2.2 /,/^### 3.2.3 /p' docs/superpowers/specs/2026-08-18-radio-cutover-design.md \
    | grep -c 'SUITE_HOST_RADIO=localhost,radio.iuk-ue.de'
  # Erwartung: >= 1
  # ⚠️ Und die GENERALPROBE behaelt ihren einen Wert — die `docker run`-Zeile selbst
  #    bleibt `-e SUITE_HOST_RADIO=localhost`; der Nachtrag steht DARUNTER, nicht darin.
  ```

- [ ] **Schritt 7: Tore und Commit**

  ```bash
  rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
  rtk git add docs/superpowers/specs/2026-08-18-radio-cutover-design.md
  rtk git commit -m "docs(spec2): datierter Nachtrag — Abfrage A im Volume, P6 als Sperre, Nr. 1-13, Z mit zehn Zeilen, A-3 und A-5 berichtigt, L5 verkleinert, dritter Unterschied in 3.2.2"
  ```

---

## Was dieser Teil anderen Planteilen zusagt

Diese sechs Zusagen sind **Namen und Formen**, die andere Teile zeichengleich benutzen müssen.

1. **Runbook-Abschnittsmarken:** Kapitel 5 belegt `## §5.1` … `## §5.9` und `## §H` in
   `docs/runbooks/radio-cutover.md`. **Kein anderer Planteil benutzt `## §5.` oder `## §H`.**
2. **`<umschwenk_iso>` und `<umschwenk_epoch_sekunden>`** — der Planteil zu **Kapitel 4** erzeugt sie
   in §4.5 Schritt 9, unmittelbar nach `docker compose up -d`, mit
   `date -u +%Y-%m-%dT%H:%M:%SZ` und `date -u +%s`. §5.1 trägt beide ins Protokollformular; §4.9s
   Nachtrag benutzt die Sekundenzahl als Filterargument. **Ohne sie ist weder das Standby-Ende
   datierbar noch der Nachtrag ausführbar.**
3. **`--profile full-app` im Start-Befehl** — der Planteil zu **Kapitel 4** schreibt §4.9 3b als
   `docker compose -f radio-inventar/docker-compose.yml --profile full-app start postgres backend`,
   zeichengleich zum Stopp aus §4.5 Schritt 1. Beleg: `radio-inventar/docker-compose.yml:27`
   (`profiles: ["full-app"]` am `backend`, keines am `postgres`), gelesen an `f883ec4`. Anhang A-3
   ist in Aufgabe 5.10 entsprechend berichtigt.
4. **`$VOL_SUITE` ist EIN Name — aber ZWEI Ablesungen**, und beide bleiben stehen: die erste in
   §4.5 Schritt 4 Handgriff 1 (Fenster), die zweite in §5.2. Die zweite ist **keine zweite
   Protokollzeile, sondern eine Gegenlesung**: §5.2 läuft frühestens vierzehn Tage später in einer
   neuen Shell, in der die Zuweisung aus dem Fenster nicht mehr existiert — würde sie dort fehlen,
   liest jede der acht Abbau-Sperren ein leeres Volume, dessen Nullen wie ein Datenbefund aussehen.
   ⛔ **Beide Ablesungen müssen denselben Namen ergeben**, und §5.2 liest den Wert ausdrücklich
   gegen das Fenster-Protokoll gegen, bevor die erste Zahl gezählt wird. Jeder Zielarm-Befehl fährt
   `docker run --rm -i -v "$VOL_SUITE":/data
   alpine sh -c 'apk add --no-cache sqlite …; sqlite3 /data/radio.db'`, Mount **ohne**
   `:ro`, ⛔ **kein** `immutable=1`.
   ⛔ **Nachtrag 2026-08-28 (NT8, gemessen am 2026-08-21): OHNE `-readonly`.** Diese Zusage schrieb
   die Form bis heute **mit** vor — und weil eine Zusage laut der Überschrift dieses Abschnitts
   „zeichengleich" zu benutzen ist, hat Kapitel 4 sie zeichengleich übernommen: die drei
   `sqlite3 -readonly /data/radio.db` in Spec 2 §4.5 sind **diese Zeile**, nicht ein eigener Fehler
   jenes Planteils. Gegen eine frisch importierte, im WAL-Modus liegende `radio.db` ohne `-shm`
   scheitert ein Readonly-Handle mit `unable to open database file (14)` — eine Meldung, die wie
   ein Importfehler aussieht und keiner ist. Für die **Quelle** (`radio-admin-snapshot.sqlite`)
   bleibt `-readonly` Pflicht, solange `pragma journal_mode` dort `delete` liefert (Runbook §L.1).
5. **P1–P6, nicht P1–P5** — der Planteil zu **Kapitel 4** korrigiert §4.5 Schritt 3 („Die fünf
   Postgres-Zählungen (P1–P5)") auf **sechs**, und P6 ist dort wie hier eine **Sperre**.
6. **§4.2 Nr. 3 hat nur EINEN ausführbaren Zweig** — der Planteil zu **Kapitel 4** streicht dort
   „`HISTORY_RETENTION_MONTHS` in der Standby-Umgebung neutralisieren **oder**" und lässt „**das
   Volume kopieren**" stehen, mit der N7-Zeile als Begründung; dieselbe Änderung gilt für die
   Zulässigkeitsbedingung des Rollbacks in §4.9 3a. **Beleg:**
   `radio-admin@265abd5:server/src/services/retentionService.ts:9` ist eine Quelltextkonstante, kein
   Env-Wert; `git grep -n RETENTION 265abd5` liefert zwei Treffer, beide in dieser Datei. Ein Neubau
   von `radio-admin:local` (`radio-admin/docker-compose.yml:3-4`) bräche §5.5 Posten 6. Der
   Erfüllungspunkt 3 ist in Aufgabe 5.10 bereits nachgezogen.

---

## Selbstprüfung gegen den Entwurf

| Abschnitt des Entwurfs | Aufgabe |
|---|---|
| §5.1 · §5.1.1 · §5.1.2 (Fristen, Rechnung, Protokollformular) | 5.1 |
| §5.2.1 · §5.2.2 (A, T, R, Z, Abfrage 8) | 5.2 |
| §5.2.3 (P1–P6) | 5.3 |
| §5.2.4 (Archivprobe) | 5.4 |
| §5.3 · §5.3.1 (Abbauliste, Sperrenkasten, U4-Lücke) | 5.5 |
| §5.4 (Geheimnisse) | 5.6 |
| §5.5 (kein Cron) | 5.7 |
| §5.6 (Redirect) · §5.7 (nicht angefasst) | 5.8 |
| Erfüllungspunkte 1–37 (die Klammer) | 5.9 |
| Anhang A-3, A-5 und die vier Spec-Zahlen | 5.10 |
| ⬜-Tabelle Zeile **L5** (`:185`) und **§3.2.2** (`:2571-2611`) — **nur** die zwei datierten Rahmen-Nachzüge aus NS8 und NS11, **nicht** die Abschnitte selbst (die gehören Kapitel 3) | 5.10 |

**Nicht abgedeckt und bewusst so:**

* **Die Erfüllungspunkte 1–8, 10–16 und 18–26 werden als ZEILE vollständig geschrieben** (Aufgabe
  5.9), ihre **Inhalte** aber nicht: die Prüflisten dahinter — G1–G6, §A Nr. 1–14, §D Nr. 1–16 —
  gehören den Planteilen zu Kapitel 1–4 und werden hier **nicht zweitgeschrieben**. Eine zweite
  Fassung derselben Prüfliste ist die Fehlerquelle, die `lagerbuch-cutover.md:365-366` ausdrücklich
  ausschließt („dort und nur dort, damit es eine Fassung gibt und nicht zwei"). **Die Zeile selbst
  darf aber nicht fehlen**, weil Kapitel 5 `## §H` allein beansprucht — eine Klammer mit Löchern
  wäre genau der W8-Fehler, gegen den dieses Kapitel gebaut ist.
* **Der Rückweg §4.9** wird hier nur **zitiert** (Stunde 1). Seine drei gemeldeten Mängel — fehlendes
  `--profile full-app`, fehlende Rücklesung, der Nachtrag auf einem Host-Pfad — gehören dem Planteil
  zu Kapitel 4; zwei davon stehen oben als Zusage.
* **Kein neues Skript.** Es wäre naheliegend, die sechs Zählblöcke in ein
  `scripts/cutover/radio-abbau.sh` zu gießen. Dagegen sprechen zwei Dinge: die Spec macht sie
  ausdrücklich zu **Runbook-Schritten**, und ein neues Artefakt ist ein neues Ding, das getestet
  werden will, ohne dass ein Abschnitt danach fragt.

**Namensgleichheit** (in allen Aufgaben zeichengleich geschrieben): `<freeze_iso>` ·
`<umschwenk_iso>` · `<umschwenk_epoch_sekunden>` · `$VOL_SUITE` · `radio-admin-snapshot.sqlite` ·
`radio-inventar-final-<stamp>.dump` · **Abfrage A / T / R / Z / 8** · **P1**–**P6** ·
`RADIO_HISTORIE_PURGE` · `SUITE_REDIRECT_RULE_RADIO_ADMIN` · `HISTORY_RETENTION_MONTHS`.

---

## Behandlung der Re-Kritik

**Vollständig, auch die verworfenen und die weitergereichten.** Das Fehlen dieses Protokolls war der
benannte Mangel des Vorgängerdurchgangs.

### In diesem Planteil eingearbeitet

| Fund | Wo er in meinem Bereich sitzt | Behandlung |
|---|---|---|
| **RK-A4** (1.), **RK-A4** (2.), **RK-A2** (3.) — Abfrage A liest auf dem Host | §5.2.2, Zielarm (`:4295`, `:4298`) | **Übernommen, einmal.** Drei Meldungen, **ein** Fund. Aufgabe 5.2 Schritt 2 schreibt den Zielarm in der `docker run`-Form gegen `$VOL_SUITE`, **mit** der `ls -ln`-Gegenprobe und dem Satz „eine `0` ist zuerst ein Volume-Fehler". Aufgabe 5.10 zieht die Spec nach |
| **RK-A9** (1.), **RK-A6** (3.) — „Z alle drei `0`" | Erfüllungspunkt 17 (`:4828-4829`) | **Übernommen.** Aufgabe 5.9 schreibt „alle zehn Zeilen", die Formatprobe eigens genannt; Aufgabe 5.2 Schritt 7 zählt die Glieder mit `grep -cE "^select '"` (**gemessen: 10**, gegen Spec-Zeilen 4376–4410) |
| **RK-A8** (1.), **RK-A1** (3.) — „§4.2 Nr. 1–12" | Erfüllungspunkt 9 (`:4810`) | **Übernommen.** Aufgabe 5.9 schreibt den Punkt im RUNBOOK als „**§A Nr. 1–14**" und nennt Nr. 13 in der „insbesondere"-Aufzählung mit eigenem ⛔; in der SPEC bleibt es „§4.2 Nr. 1–13" (Aufgabe 5.10), weil dort die §4.2-Numerierung richtig ist |
| **RK-A11** (3.) — Sperrenkasten ohne P6 | §5.3 (`:4609-4610`) | **Übernommen** (meine Hälfte). Der Kasten lautet jetzt „A, T, R, Z, P1–P4, **P6** und beide Archivproben", P5 ausdrücklich als Protokoll. Die andere Hälfte (§4.5 Schritt 3 „fünf (P1–P5)") ist **Zusage 5** an Kapitel 4 |
| **RK-A9** (3.) — Anhang A-5 „drei Spalten" | Anhang A (`:4893`) | **Übernommen** in Aufgabe 5.10; die Entscheidung von A-5 („komplementär, nicht doppelt") bleibt unberührt |
| **RK-A3** (1.) — `--profile full-app` fehlt in §4.9 3b | Anhang A-3 (`:4891`) **legitimiert** ihn | **Übernommen, mit neuem Beleg.** Die Re-Kritik schrieb „kein Repo-Beleg möglich"; ich habe `radio-inventar@f883ec4:docker-compose.yml` gelesen: `profiles: ["full-app"]` steht in `:27` am `backend`, `postgres` trägt keines. A-3 wird in Aufgabe 5.10 auf „teilweise bestätigt" umgeschrieben; der Befehl selbst ist **Zusage 3** an Kapitel 4 |
| **RK-A2** (1.), **RK-A7** (3.) — der Nachtrag in §4.9 hat kein `<umschwenk_epoch_sekunden>` | §5.1.1 führt nur „Umschwenk am: ____" (`:4226`) | **Übernommen** (meine Hälfte): das Formular trägt **beide** Formate. Die andere Hälfte (§4.5 Schritt 9 muss sie erzeugen; der Nachtrag muss auf `$VOL_SUITE` umgestellt werden) ist **Zusage 2** und steht in `sperren` |
| **RK-A4** (3.) — ⬜ L5 ist überzogen | §5.7 „Monitor auf `/api/health/radio`" | **Übernommen** für meine Fundstelle. Aufgabe 5.8 Schritt 3 schreibt die Feldbedeutung mit Beleg aus (`src/core/health/index.ts:4-15`, `src/app/api/health/[modul]/route.ts:24`) und lässt nur den **Sollwert** von `revision` offen. **Nachgezogen:** seit NS8 zieht **Aufgabe 5.10 Schritt 4** auch den **Rahmen** nach — die ⬜-Zeile `L5` in Spec 2:185, samt Berichtigung des Belegs `route.ts:11-18`, der in einen Kommentarblock zeigt |
| **RK-A5** (3.) — blanke §-Verweise | Kapitel 5 verweist zwölfmal ohne Präfix in Spec 1 | **Übernommen als Regel** in den Global Constraints; jeder Verweis dieses Planteils trägt `Spec 1 §…` |
| **RK-A12** (1.) — `scripts/backup.sh` ohne Env | berührt §5.7 („braucht keine Änderung") | **Geprüft, Aussage bestätigt, mit Randbemerkung.** Der Glob `"$DATA_DIR"/*.db` (`:25-27`) nimmt `radio.db` ohne Änderung mit — das ist unabhängig davon, mit welcher Env der Cron das Skript ruft. Aufgabe 5.8 Schritt 3 verweist für diese Frage auf §4.6 Nr. 13 statt sie zweitzuschreiben |

### Mit Gegenbeleg verworfen

| Fund | Verwerfung |
|---|---|
| **RK-A3** (3.) — W5 Residuum 2, Vorschlag einer neuen ⬜ **L15** („hält der reguläre Stack `radio.db` nach dem Boot dauerhaft offen?") | **Für Kapitel 5 verworfen; die Leerstelle wäre hier keine.** Die Re-Kritik hat recht, dass die Behauptung im Zeitindex *Fenster* nicht gemessen ist (Migrationen schließen ihr Handle, `src/core/bootstrap.ts:99-105`; Health ebenso, `src/core/health/index.ts:13-15`). Im Zeitindex **Abbau** ist die Frage aber entschieden und keine Ablesung: die Zählungen aus §5.2 laufen **vierzehn Tage nach dem Umschwenk**, der Stack bedient `radio.iuk-ue.de` seitdem, und jeder Modulzugriff legt das Handle in `globalThis.__suiteDb` ab, wo es die Prozesslebensdauer überdauert (`src/core/db/index.ts:31-35`). **`immutable=1` ist hier also nicht „konservativ ausgeschlossen", sondern nachweislich falsch** — Aufgabe 5.2 schreibt genau diese Begründung an die Stelle. L15 bleibt eine offene Frage für §2.2.2 und §4.5, nicht für dieses Kapitel |
| **Die Spec-Formulierung in §5.5**, „ein Start ist ein erfolgreicher Start **mit einer Protokollzeile** (`retentionService.ts:41`)" — als Detektor gelesen | **Verworfen, gemessen.** `retentionService.ts:40-41` schreibt die Zeile **nur bei `deleted > 0`**. Ein Standby-Start, der nichts zu purgen fand, hinterlässt **gar keine** Spur im Log — das Log ist also kein Nachweis für „nie gestartet", und Erfüllungspunkt 31 stünde ohne Beleg da. Aufgabe 5.7 Schritt 3 setzt an die Stelle eine **gemessene** Beweiszeile (`docker inspect … .State.StartedAt`, an einem gestoppten Container geprüft: liefert RFC3339-UTC) samt ihrer benannten Grenze (nur der **letzte** Start) |

### Weitergereicht — außerhalb meines Kapitels

**RK-A1** (1.: `SUITE_HOST_RADIO=localhost` gegen den `Host`-Kopf) · **RK-A5** (1.: §4.9 ohne
Rücklesung) · **RK-A6** (1.: die Kennung aus dem Image statt vom Compose-Service) · **RK-A7** (1.:
Dateitausch unter offenem Handle) · **RK-A10** (1.: `/admin | grep localtest.me` ist strukturell
leer) · **RK-A11** (1.: die Quoting-Ebene im Snapshot-Ersatzbefehl) · **RK-A8, A9, A10, A12** (3.:
„§3.6 Zusage 12", `files-cutover.md:107-109`, der `mkdir`-Kommentar, L1 ohne Anker) — **Kapitel 1,
3 und 4.**

**Der gesamte zweite Kritikdurchgang** (`gelesen_als_s` · der Sollwert von `devices.last_updated_at`
· der ARRANGE-Riegel gegen Backticks · die Lauf-Tabelle in §2.2.2 · „Der Zielarm braucht keine
eigene Abfrage" · „sieben" Fixture-Konstanten · `portal.ts:46-48` · die `feedback`-Fußnote · Fall D
für `software_versions`) betrifft **Kapitel 1 und 2**. Er ist gelesen und hier ausdrücklich **nicht**
eingearbeitet — mit einer Ausnahme: **RK-A4** dieses Durchgangs ist derselbe Abfrage-A-Fund wie oben
und **ist** eingearbeitet.
