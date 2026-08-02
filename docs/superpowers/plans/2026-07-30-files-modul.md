# Modul `files` — Implementierungsplan (Spec 1: der ganze Bau, lokal)

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` — die Tasks
> sind auf parallele Ausführung geschnitten. **Innerhalb einer Wellenstufe dürfen alle genannten Tasks
> gleichzeitig laufen; über Stufengrenzen hinweg nicht.** Drei Wellen haben **zwei Stufen** (2a/2b,
> 6a/6b, 8a/8b), weil dort eine Abhängigkeitskante innerhalb der Welle verläuft; die Stufe ist die
> Einheit der Parallelität, nicht die Welle. Die Gates (§3) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD: erst der Test, dann der Code. **Ausgenommen sind die als „Abnahme" markierten
> Tests** (T23 Punkte 3+4, T44, T47, T48 und die in §4 genannte Abschluss-Abnahme): sie prüfen
> zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung schon gebaut ist. Sie sind von
> Anfang an grün, und das ist **kein** Mangel — wer für sie künstlich Rot herstellt, bricht dafür
> funktionierenden Code auf. Statt „Rot, weil …" nennt jeder Abnahmetest die **Mutation**, die er
> fängt; genau daran ist er zu messen.

**Spec:** `docs/superpowers/specs/2026-07-30-files-modul-design.md` (2778 Zeilen, verbindlich).
**Faktenbasis:** `docs/files-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md`. **Branch:** `feat/files-modul` (ausgecheckt).

**Ziel:** Das Modul `files` ersetzt `easy-filesharing` (Shares mit Passwort/Ablauf/Download-Limit,
Audit-Log, ZIP, Preview, QR) und `drop` (anonyme Upload-Inbox `/u/<token>`). **Ein** Modul, **zwei**
Prod-Hosts, **eine** SQLite-DB (`files.db`), Blobs auf dem Dateisystem, asynchrone Virenprüfung.

**Abgrenzung:** Spec 2 (Import, AV-Nachscan, Generalprobe, beide Cutover) ist **nicht** Gegenstand
dieses Plans. Wo ein Task etwas festlegt, das Spec 2 erbt, steht das im Task unter „Erbe für Spec 2".

---

## 0. Vorbedingungen — die SECHS Fragen aus §13.1, vollständig

Aus §13.1 der Spec — dort stehen **sechs** Fragen, und hier stehen dieselben sechs. Eine kürzere Liste
wäre eine stille Herabstufung genau an der Stelle, an der §1 den Maßstab „jede Abweichung ist benannt"
setzt. **Keine davon darf durch eine erfundene Vorbelegung ersetzt werden** — genau das ist
Analyse-Falle 22 in neuer Gestalt.

| # | Frage | Antwortet | Blockiert | Fällig vor |
|---|---|---|---|---|
| 1 | Real gesetzter `MAX_FILE_SIZE` (easy-filesharing) und `MAX_FILE_SIZE_MB` (drop) → `FILES_MAX_DATEI_BYTES` **und** `FILES_AV_MAX_BYTES` **und** `MaxFileSize`/`StreamMaxLength` in `clamd.files.conf` | Betreiber | **T8** (`_lib/grenzen.ts`), **T24** (`clamd.files.conf`) | Welle 2a |
| 2 | Real gesetzter `MAX_EXPIRY_DAYS` → `FILES_MAX_ABLAUF_TAGE` | Betreiber | **T8** | Welle 2a |
| 3 | Die wirklich eingesetzte `ALLOWED_MIME` von `drop` | Betreiber | **T12** (`_lib/mime.ts`) | Welle 2a |
| 4 | **Architektur und freies RAM des Suite-Hosts** (`clamav/clamav:1.4` hat nur ein `linux/amd64`-Manifest; clamd belegt ~1 GB RSS **zusätzlich** zum Node-Prozess) | Betreiber | **T24** — die Wahl des Image-Tags (`-debian` auf arm64) ist keine Codeentscheidung, und ohne die RAM-Zahl ist `depends_on: service_healthy` ein Startrisiko für die **ganze** Suite | Welle 4 |
| 5 | **Welche Kategorie-Verzeichnisse unter `/srv/fuekw/drop_inbox` real existieren** | Betreiber (`find -maxdepth 1 -type d`) | **T6** — die **Schreib**liste (`bilder`/`dokumente`/`sonstiges`) —, und **T43** (die Filter des Posteingangs) | Welle 1 |
| 6 | **Sind nackte `/api/download/…`- oder `/api/preview/…`-Links im Umlauf?** | Betreiber | **T13** (der Cookie-Vertrag, `_lib/passwort.ts`), **T28** (sein Setzweg) und die **drei Byte-Routen** **T33**, **T51**, **T34** | **Welle 2a** |

**Frage 6 ändert die Gestalt von fünf Tasks, nicht eine Zahl — und sie ist drei Wellen früher fällig,
als sie aussieht.** Fällt die Antwort „ja" oder „unklar", gilt statt E4 (b) die Variante (c): ein
**zweiter Annahmeweg auf allen Byte-Routen** (Cookie **oder** Bestandslink-Karenz bis `expires_at`),
mit eigener Zustandslogik, eigenen Statuscodes und eigenen Tests — gebaut in **Spec 1**, nicht in
Spec 2 (Spec §7.4, §13.1). Variante (c) ist **nicht** spezifiziert; sie wird hier deshalb auch nicht
geplant. **T13 legt den Vertrag bereits in Welle 2a fest** („es gibt genau einen Annahmeweg — das
Cookie"), und (c) ändert diesen Vertrag samt Testliste. Liegt die Antwort bis Welle 2a nicht vor, ist
**T13 zu blockieren**, nicht zu bauen; danach folgen die Byte-Routen. Der Klammer-Vorbehalt in T13
ersetzt diese Frist nicht.

**Frage 5 ist nicht „fast unblockierend".** T6 toleriert unbekannte Werte beim **Anzeigen** — das trägt
die Lese- und die Importseite. Beim **Schreiben** validiert T6 gegen die fest hinterlegte Liste, und
das Abgabeformular (T38) bietet genau diese drei Werte an. Heißen die realen Verzeichnisse anders, bietet
das Formular Werte an, die der Betreiber nicht kennt, und die Filter im Posteingang (T43) greifen ins
Leere. Bis zur Antwort sind die drei Werte eine **Vorlage**; ihre Umbenennung danach ist eine Migration
**plus** Formularänderung — kein Einzeiler.

Fragen 7–15 (§13.2) blockieren den Baubeginn **nicht**: sie hängen an Env-Variablen mit Vorbelegung
bzw. an nachträglich erhöhbaren Werten. Fragen 16–23 (§13.3) werden am Server gemessen und sind
Runbook-Einträge für Spec 2; die Tasks, die sie berühren, nennen sie namentlich. Fragen 24–29 (§13.4)
gehören Spec 2 und stehen in der Übergabe (§4 Punkt 5).

---

## 1. Acht Festlegungen dieses Plans, die die Spec offen lässt

Die Umsetzung läuft subagent-getrieben und parallel. **Fünf** Stellen der Spec würden bei wörtlicher
Umsetzung zu **einer** Datei führen, die fünf bis acht Tasks schreibend anfassen — das ist kein
Detail, sondern der Unterschied zwischen acht Wellen und dreißig (A–E). **Drei weitere** Festlegungen
(F–H) füllen Lücken, die die Spec an einer Stelle zusagt und an einer anderen nicht mitführt. Jede
Abweichung ist hier benannt, begründet und mit dem Beleg versehen, dass die Spec-Zusage dabei nicht
fällt.

**(A) `"use server"` je Route-Group-Unterordner statt einer `actions.ts`.**
§2.1 listet **eine** `(verwaltung)/actions.ts`. Der Plan legt drei an:
`(verwaltung)/actions.ts` (Freigaben), `(verwaltung)/zugangslinks/actions.ts` (Abgabelinks),
`(verwaltung)/posteingang/actions.ts` (Posteingang), dazu `(verwaltung)/ablage-actions.ts`
(Aufräumen). Keine Zusage der Spec hängt an der Dateizahl — §2.4 verlangt `requireFilesAccess()` in
**jeder** Action, §10.2 einen Einstiegspunkt je Action. Beides wird **stärker** belegt als in der
Spec: T26 legt eine Quelltext-Zusicherung an, die **jede** exportierte Funktion in **jeder**
`"use server"`-Datei unter `src/app/m/files/` daraufhin prüft, dass ihr Rumpf `requireFilesAccess`
ruft. Bei einer einzigen Datei hätte man diesen Scan nicht gebraucht und deshalb nicht gehabt.

**(B) `_lib/boot.ts` als einzige Naht zu `src/core/bootstrap.ts`.**
Die Spec hängt vier Dinge in die Boot-Kette (Host-Prüfung §3.3, Zahlen-Prüfungen §9.4, Ablage-Probe
§5.6, AV-Arbeiter §6.4, Aufräum-Timer §7.6). Alle vier gehen über **eine** Funktion
`filesBootFehler(): string[]` und **eine** Funktion `starteFilesHintergrund(): void` in
`src/app/m/files/_lib/boot.ts`. `src/core/bootstrap.ts` bekommt dadurch **genau zwei** zusätzliche
Zeilen und ist danach nie wieder Gegenstand eines Tasks. Das ist keine Ausnahme, sondern die
Voraussetzung dafür, dass §2.2 (Dreieck, Welle 1) und die Boot-Prüfungen (Welle 4) nicht dieselbe
Datei in derselben Welle schreiben.

**(C) Route-lokale `*.module.css` neben `_ui/files.css` und `_ui/files-public.css`.**
Präzedenzfall im Repo: `src/app/m/feedback/f/[slugSecret]/zettel.module.css` liegt neben
`src/app/m/feedback/_ui/feedback.css`. `files.css` trägt die modulweiten `--fi-*`-Variablen und die
**Umschaltung Tabelle/Kartenliste** (`.fi-liste .nurDesktop`, `.fi-liste .nurMobil`, §7.3);
komponentenlokale Regeln liegen bei der Komponente. **Bedingung, ohne die das eine Lücke wäre:** der
Quelltext-Scan aus §11.4 muss **jede** CSS-Datei des Moduls erfassen, nicht nur die beiden benannten
— sonst greift die 767.98px-Zusage genau dort nicht, wo neue Regeln entstehen. Aufgeteilt auf zwei
Scans mit disjunkten Globs: T18 besitzt `_ui/files.css`, T19 besitzt `_ui/files-public.css` **plus
alle `*.module.css` des Moduls**.

**(D) `src/app/m/files/_db/queries.ts` und `_db/zaehler.ts` als getrennte Dateien.**
§7.4 verlangt die Prüfkette in **einer** Ladefunktion, §7.5/§8.4 die Zähler als **atomares** SQL. Die
Spec nennt keinen Ablageort. Getrennt, weil die Zusagen auf verschiedenen Ebenen liegen: die
Ladefunktion ist gegen eine In-Memory-DB prüfbar, die Zähler brauchen **echte** Parallelität gegen
eine Datei-DB (`_db/gleichzeitigkeit.test.ts`, Analyse Falle 25). Zwei Dateien = zwei Tasks in
derselben Welle.

**(E) Kein Schema-Import und kein Seed in `src/core/bootstrap.ts`.**
§2.2 Punkt 5 nennt den „Schema-Import in `core/bootstrap.ts`" als still scheiternden Eintrag. Gemessen
am Quelltext ist er für `files` **überflüssig und wäre toter Code**: `migrateAllModules()` öffnet je
Modul eine eigene, **schema-freie** Verbindung (`src/core/bootstrap.ts:39-45`, Kommentar
„Schema-freies Migrieren"); der einzige Konsument der Schema-Importe ist `seedAllModules()`
(`:52-56`), und `files` bekommt bewusst **keinen** Seed (§12: „Ein Seed-Abgabelink wäre in einer
Generalprobe ein gültiger anonymer Schreibzugang"). T2 trägt deshalb **nur** den
`MODULE_MIGRATIONS`-Eintrag ein. `src/core/bootstrap.test.ts:37-63` bleibt grün, weil es genau diesen
Eintrag, den Ordner und die Dockerfile-Zeile koppelt — nicht den Import.

**(F) Ein zehnter Route Handler: `GET /api/inbox/zip` — die Spec sagt ihn zu und führt ihn nicht.**
§8.6 verlangt die Mehrfachauswahl „ausgewählte herunterladen (als ZIP, mit derselben Ausschlussregel
wie §7.7)", und §11.5 prüft ihn E2E („die ZIP-Zusammenstellung aus dem Posteingang → dieselbe
Ausschlussregel"). Die **Routentabelle** §2.1 und die Einstiegspunkt-Tabelle §10.2 führen ihn
**nicht** — die Spec ist an dieser Stelle die unvollständige Seite, nicht der Plan. Als Server Action
ist er kein Weg: ein Streaming-ZIP mit `Content-Disposition` ist über eine Action nicht auslieferbar
(derselbe Grund, aus dem `…/download/[id]/zip` ein Handler ist). Deshalb **T49**, ein eigener Task in
Welle 5 mit eigenem Verzeichnis. **Ripple, vollständig mitgezogen:** T43 Punkt 6 nennt ihn als Ziel
der Mehrfachauswahl, T44 Punkt 1 schleift über **dreizehn** Handler-Methoden statt neun, T47 Punkt 5
ruft ihn, und die Zählungen in §4 stimmen (siehe unten). **Erbe für Spec 2:** die Spec-Tabellen §2.1
und §10.2 bekommen die Zeile nachgetragen; ohne sie liest der nächste Leser die Spec als vollständig.

**(G) `DELETE /api/upload/[fileId]` statt einer `uploadAbbrechenAction`.**
§7.2 verlangt „ein **Abbrechen**, das die Zwischendatei löscht (`loesche`) und die Zeile entfernt";
§2.1 führt dafür keinen Endpunkt und §10.2 keinen Einstiegspunkt. Ein Knopf ohne serverseitiges
Gegenstück ist genau die Sackgasse, gegen die §10.2 gebaut ist. Der Abbruch gehört zu **T27**, weil
**dort** der Lebenszyklus der `.part`-Datei liegt (derselbe deterministische Name, dieselbe
Offset-Semantik), weil die Rollensperre und die 404-Regel für fremde/fehlende `fileId` in diesem
Handler schon aufgelöst sind, und weil der Abbruch **mitten im Upload** aus der Client-Schleife der
Upload-Insel gerufen wird — eine Server Action löst dort einen Router-Umlauf samt Revalidierung aus,
was für „lösche diese eine Zwischendatei" falsch ist. **Verworfene Alternative:** `uploadAbbrechenAction`
in `(verwaltung)/actions.ts`. Sie wäre von T26s Quelltext-Zusicherung kostenlos erfasst — das ist ihr
einziger Vorteil, und er wiegt die drei Gründe oben nicht auf. (Ein Wellenkonflikt wäre **kein**
Argument: `actions.ts` gehört in Welle 5 T26, der Eintrag hätte dort Platz.) Ripple: T35 ruft die
Route und nennt T27 als Abhängigkeit, T44 schleift sie mit, §10.2 bekommt die Zeile.

**(H) Der Fake-clamd bekommt einen zur Laufzeit umschaltbaren Modus.**
§6.8 wählt die Antwortmuster „per Argument bzw. Env" — also **beim Prozessstart**. Das ist mit dem
E2E-Aufbau nicht erfüllbar: Playwright startet den Fake **einmal** je Lauf als zweiten
`webServer`-Eintrag, `workers: 1` (`playwright.config.ts:8`), und **ein** Lauf braucht `ok` (T35s
12-MiB-Rücklesen, T38/T43 „ab `clean` herunterladbar") **und** `error` (T47). T47 Punkt 8 verlangt
sogar `clean` **und** `scanning` in **einem** Share — der Umschaltpunkt liegt damit pro
**Scan-Versuch**, nicht pro Prozess; auch ein zweiter Fake auf einem zweiten Port löst das nicht.
Deshalb: **eine Modusdatei** (Pfad aus `FAKE_CLAMD_MODUS_DATEI`, Vorbelegung `./.data/fake-clamd-modus`),
die der Fake bei **jeder** Verbindung neu liest; `FAKE_CLAMD_MODUS` bleibt der Startwert und die
Vorbelegung ist `ok`. Mit `FILES_AV_WIEDERHOLUNG_SEKUNDEN=1` in E2E (§9.3) ist das Umschalten
deterministisch beobachtbar. Es bleibt **ein** Werkzeug und **eine** Wahrheit über das Protokoll —
genau die Zusage von §6.8; nur die Wahl des Musters wandert von „beim Start" zu „je Verbindung".

Zwei Dinge, die der Plan **nicht** abweicht, obwohl es naheliegt: `_lib/av.ts` bleibt **eine** Datei
(Vertrag in Stufe 2b, Warteschlange in Welle 3 — zwei Stufen, also kein Konflikt, also kein Grund zu
teilen), und die vier E2E-Dateien aus §11.5 bleiben **vier** (die Entzerrung leistet die
Wellenzuordnung, siehe §3).

**Die drei Zählungen, einmal ausgerechnet — jede andere Stelle leitet von hier ab.** Sie ändern sich
durch (F) und (G), und drei Stellen des Plans nennen sie:

| Was | Spec | dieser Plan | steht in |
|---|---|---|---|
| Route-Handler-**Dateien** unter `api/` | 9 (§2.1) | **10** (+ `api/inbox/zip`) | §4 Punkt 3 |
| **Rollensperren**, je exportierter Handler-Methode | 9 (§11.5 zählt Dateien) | **13** | T44 Punkt 1 |
| **Einstiegspunkte** in der Oberfläche | 18 (§10.2) | **20** (+ ZIP-Auswahl im Posteingang, + Abbrechen in der Upload-Insel) | §4 Punkt 2 |

**Warum die Rollensperren dreizehn sind und nicht zehn:** die Sperre ist die **erste Anweisung eines
Handlers** (§2.1), und zwei Dateien exportieren mehr als einen Handler — `api/upload/[fileId]` hat
`PUT`, `GET` und `DELETE`, `api/u/[token]/upload` hat `PUT` und `POST`. Jede dieser Methoden hat eigenen
Code, also braucht jede ihre eigene Prüfung; eine Methode ohne eigene Prüfung ist eine Sperre, die für
sie **nicht gilt**. Die dreizehn, namentlich: `s/[id]/verify POST` · `s/[id]/qr.png GET` ·
`download/[id] GET` · `download/[id]/zip GET` · `preview/[id] GET` · `upload/[fileId] PUT` ·
`upload/[fileId] GET` · `upload/[fileId] DELETE` · `u/[token]/upload PUT` · `u/[token]/upload POST` ·
`u/[token]/qr.png GET` · `inbox/[id] GET` · `inbox/zip GET`.

Die eine benannte Ausnahme bleibt die eine benannte Ausnahme: der `POST`-Zweig von
`/api/u/<token>/upload` hat **keinen** Einstiegspunkt und darf keinen haben (§10.2, T31/T50) — er
braucht trotzdem seine Rollensperre, und deshalb steht er in der Dreizehn.

---

## 2. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei **oder Testdatei**, die **mehr als ein** Task schreibend anfasst, steht hier mit Task und
Stufe; dazu jede Datei **außerhalb** von `src/app/m/files/`, weil sie dem Rest der Suite gehört. Die
Regel „zwei Tasks an derselben Datei nie in derselben Stufe" ist damit ohne Diff über 51 Dateilisten
nachrechenbar. **Die Tabelle ist aus den Dateilisten der Tasks abgeleitet, nicht daneben gepflegt** —
wer eine Dateiliste ändert, rechnet hier nach.

**Mehr als ein schreibender Task:**

| Datei | Tasks (Stufe) |
|---|---|
| `src/core/bootstrap.ts` | T2 (1) · T22 (4) |
| `package.json`, `pnpm-lock.yaml` | T3 (1) · T11 (2b, nur `dev:av`-Skript) |
| `src/instrumentation.ts` | T11 (2b, Netzhaken) · T22 (4, Hintergrundstart) |
| `.env.example` | T14 (3) · T24 (4, die zwei `SUITE_CLAMAV_*`-Zeilen) |
| `src/app/m/files/_lib/av.ts`, `_lib/av.test.ts` | T11 (2b) · T17 (3) |
| `src/app/m/files/_lib/boot.ts` | T22 (4) · T46 (8a) |
| `src/app/m/files/_ui/SharesUebersicht.tsx` | T23 (4) · T36 (6b) · T46 (8a) |
| `src/app/m/files/_ui/PosteingangTabelle.tsx`, `PosteingangTabelle.test.tsx` | T43 (7) · T45 (8a) |
| `src/app/m/files/(verwaltung)/actions.ts`, `actions.test.ts` | T26 (5) · T37 (6a) · T45 (8a) |
| `src/app/m/files/(verwaltung)/shares/[id]/page.tsx`, `page.test.tsx` | T41 (7) · T45 (8a) |
| `src/app/m/files/api/u/[token]/upload/route.ts`, `route.test.ts` | T31 (5) · T50 (6a) |
| `e2e/files-hosts.spec.ts` | T23 (4) · T44 (8a) |
| `e2e/files-fileshare.spec.ts` | T35 (6a) · T40 (7) · T47 (8b) |
| `e2e/files-inbox.spec.ts` | T38 (6a) · T43 (7) |

**Genau ein schreibender Task, aber außerhalb des Moduls** (deshalb hier, nicht weil es einen Konflikt
gäbe):

| Datei | Task (Stufe) |
|---|---|
| `src/core/ratelimit.ts`, `ratelimit.test.ts` (neu), `src/app/m/feedback/_lib/ratelimit.*` (gelöscht), `src/app/m/feedback/actions.ts` | T1 (1) |
| `src/core/registry.ts`, `src/core/shell/switcherEntries.test.ts`, `Dockerfile` | T2 (1) |
| `src/core/bootstrap.test.ts` | T22 (4) |
| `playwright.config.ts`, `e2e/helpers/avModus.ts` | T14 (3) |
| `scripts/fake-clamd.mjs` | T11 (2b) |
| `compose.yaml`, `clamd.files.conf` | T24 (4) |
| `scripts/backup.sh` | T25 (4) |
| `e2e/files-mobil.spec.ts` | T48 (8a) |

Alle übrigen Dateien haben **genau einen** Task. Neue Dateien werden ausschließlich von dem Task
angelegt, der sie besitzt. **Die beiden CSS-Scans sind der einzige Ort, an dem sich zwei Tasks eine
Aussage über dieselbe Dateimenge teilen** — sie sind über disjunkte Globs getrennt (T18: genau
`_ui/files.css`; T19: `_ui/files-public.css` **plus** alle `*.module.css`, Festlegung C).

---

## 3. Gates am Ende jeder Wellenstufe

Nach **jeder** Stufe (1, 2a, 2b, 3, 4, 5, 6a, 6b, 7, 8a, 8b), bevor die nächste startet:

```
pnpm typecheck
pnpm lint                     # Fehler blockieren, Warnungen nicht
pnpm vitest run
pnpm build
pnpm exec playwright test     # Regel darunter
```

**Wann Playwright läuft.** Nicht nur „bei UI-Änderungen": auch dann, wenn eine Stufe
`src/core/registry.ts`, `src/core/shell/*`, `src/proxy.ts` oder ein `layout.tsx` anfasst. Grund: der
App-Switcher rendert **je Modul** einen Inline-Link in `modulzeile` (`SuiteNav.tsx:260,317-322`, und
denselben Satz Links noch einmal im Drawer, `:432`), ein
fünfter Eintrag („Dateien") kommt also in die Kopfzeile **jeder** Modulseite der Suite — und
`e2e/shell-mobil.spec.ts` hält genau die Kopfzeilen-Messungen zwischen 768 und 903 px, die den
904px-Defekt gefunden haben (`docs/design/README.md:199-212`, Messreihe im Datei-Kopf). Ob die Zeile
überläuft, ist **nicht** gemessen; die alte Regel schloss die Messung nur aus, und der Befund fiele
erst in Welle 4 auf, zusammen mit ganz anderen Änderungen. Betroffen sind damit: **Welle 1** (T2 ändert
`registry.ts`) und die Wellen 4, 6a, 6b, 7, 8a, 8b.

**Zwei Prüfspalten je Stufe, nicht eine.** Die Disjunktheitstabellen am Ende jeder Welle vergleichen
**Schreibmengen** — sie können eine Abhängigkeitskante strukturell nicht finden. Deshalb gilt je Stufe
zusätzlich: **kein Task nennt eine Abhängigkeit aus derselben Stufe.** Einmal über alle 51 Tasks
nachgerechnet; die **vier** Kanten, die es gab, sind der Grund für die Stufen:

| Kante | war | ist |
|---|---|---|
| T10 → T9 (Host für den `callbackUrl`) | beide Welle 2 | T9 in **2a**, T10 in **2b** |
| T11 → T8 (AV-Zeiten und -Adresse aus `_lib/grenzen.ts`) | beide Welle 2 | T8 in **2a**, T11 in **2b** |
| T36 → T37 (die Zeilenaktionen der Tabelle rufen die Actions) | beide Welle 6 | T37 in **6a**, T36 in **6b** |
| T47 → T45 (T47 Punkt 6 prüft T45s Wiederholen-Knopf) | beide Welle 8 | T45 in **8a**, T47 in **8b** |

Die Kanten sind **nicht** durch Umbau aufgelöst, und jeder Umbauversuch ist hier begründet abgelehnt:
T11 die Zahlen direkt aus `process.env` lesen zu lassen wäre eine **zweite Zahlenquelle** neben
`_lib/grenzen.ts` (§9.3 verlangt **eine**); T10 den `callbackUrl`-Host über eine eigene kleine
Hilfsfunktion zu beziehen wäre eine **zweite Hostauflösung** (genau der Ort, an dem zwei Auflösungen
auseinanderlaufen, T9); T36 die Zeilenaktionen weglassen zu lassen nähme `bearbeitenAction` und
`shareLoeschenAction` ihren Einstiegspunkt in der Tabelle (§10.2); und T45 nach Welle 7 zu ziehen ist
**unmöglich** — T45 hängt an T41 **und** T43, die beide in Welle 7 liegen.

**Dazu die Projektregel, die kein Gate ersetzt:** jede in der Welle angefasste Route muss vor dem
Commit **tatsächlich abgerufen** worden sein. Die antd-RSC-Compound-Falle und der `WERT`-aus-
`"use client"`-Fehler ergeben HTTP 500, das `pnpm build` **nicht** sieht und Vitest strukturell nicht
sehen **kann** (`docs/design/README.md:39-44,87-103`). Zwei Hosts in Dev:

```
http://files.localtest.me:3000/…      Rolle verwaltung
http://drop.localtest.me:3000/…       Rolle inbox
pnpm dev:av                            MUSS parallel laufen, sonst erreicht keine Datei `clean` (§6.8)
```

Die Routenliste je Welle steht am Ende der jeweiligen Welle.

---

## Welle 1 — Fundament (7 Tasks, alle parallel)

Kein Task dieser Welle liest Modul-Interna eines anderen.

### Task 1: `core`-Hebung — `RateLimiter` und `clientIpAus`

**Zusage:** `src/core/ratelimit.ts` liefert `RateLimiter` (Sliding Window, `now` injizierbar) und
`clientIpAus(headers: Headers)`; `feedback` benutzt beide von dort, und sein Verhalten ist unverändert.

**Test zuerst:** `src/core/ratelimit.test.ts` — die bestehenden Fälle aus
`src/app/m/feedback/_lib/ratelimit.test.ts` **plus drei neue** für die IP-Auflösung: `cf-connecting-ip`
hat Vorrang; ohne ihn der **erste** Wert aus `x-forwarded-for` (getrimmt); ohne beide `"unknown"`.
Rot, weil `src/core/ratelimit.ts` nicht existiert.

**Dateien:**
- Neu: `src/core/ratelimit.ts`, `src/core/ratelimit.test.ts`
- Gelöscht: `src/app/m/feedback/_lib/ratelimit.ts`, `src/app/m/feedback/_lib/ratelimit.test.ts`
- Geändert: `src/app/m/feedback/actions.ts`

**Abhängigkeiten:** keine.

**Fertig, wenn:** `pnpm vitest run src/core/ratelimit.test.ts` grün · `grep -rn "_lib/ratelimit" src`
findet nichts · `pnpm vitest run src/app/m/feedback` unverändert grün · `pnpm typecheck` grün.

**Beachten:** Die Hebung von `clientIp` ist **keine reine Importzeile.** Heute steht dort
`async function clientIp(): Promise<string>` **ohne Parameter**, die `await headers()` selbst liest
(`src/app/m/feedback/actions.ts:538-544`). Die gehobene Fassung nimmt `Headers` und ist **synchron** —
sonst wäre sie in einem Route Handler von `files` nicht benutzbar und ohne Next-Kontext nicht testbar.
Die feedback-Aufrufstelle bekommt `await headers()` vorgeschaltet. **Korrektur (30.07., am Code
nachgemessen):** es ist **eine** Stelle, nicht zwei — `:568 const ip = await clientIp()` ist der
Aufruf, `:552` verwendet `ip` nur weiter (`tokenGuard.check(ip)`). Der Task wurde entsprechend
umgesetzt; wer nach zwei Stellen sucht, sucht die zweite umsonst. Der
Vorbehalt wandert in den Kopfkommentar mit: der Zähler liegt **im Prozessspeicher**, ist nach einem
Neustart weg und bei mehreren Instanzen wirkungslos — deshalb liegt das **Mengenbudget** der Inbox in
der DB (§8.4), nicht hier.

---

### Task 2: Registrierungs-Dreieck, Drizzle-Schema, Migration

**Zusage:** `files.db` entsteht beim Boot mit **allen sechs** Tabellen aus §4, allen Indizes aus §4.9,
`CHECK` über **alle fünf** AV-Werte und Zeitstempeln in Unix-**Sekunden**; das Modul steht im Registry
und im Prod-Image.

**Test zuerst:** `src/app/m/files/_db/migrations.test.ts` — echter Migrationslauf gegen eine
temporäre Datei-DB. Prüft: die sechs Tabellen `shares`, `share_files`, `download_logs`, `inbox_files`,
`zugangslinks`, `aufraeum_laeufe`; je Tabelle Spaltennamen und `notnull`/`dflt_value` aus
`PRAGMA table_info`; `CHECK` auf `av_status` enthält `unscanned` (ein CHECK ohne diesen Wert bricht den
Spec-2-Import, Analyse E18); **kein** CHECK auf `shares.type`; alle Indizes aus §4.9 über
`PRAGMA index_list`; `uniqueIndex` auf `zugangslinks.token_hash`; und — der Faktor-1000-Wächter — ein
über Drizzle geschriebenes bekanntes Datum steht als **zehnstellige** Zahl in der Spalte, nicht als
dreizehnstellige. Rot, weil `_db/schema.ts` nicht existiert.

**Dateien:**
- Neu: `src/app/m/files/_db/schema.ts`, `_db/client.ts`, `_db/drizzle.config.ts`,
  `_db/migrations/**` (von drizzle-kit erzeugt), `_db/migrations.test.ts`
- Geändert: `src/core/registry.ts`, `src/core/bootstrap.ts`, `Dockerfile`,
  **`src/core/shell/switcherEntries.test.ts`** (zwei Erwartungsarrays, Begründung unten)

**Abhängigkeiten:** keine.

**Fertig, wenn:** `pnpm drizzle-kit generate --config=src/app/m/files/_db/drizzle.config.ts` erzeugt
`0000_*.sql` + `meta/_journal.json` · `pnpm vitest run src/app/m/files/_db/migrations.test.ts` grün ·
`pnpm vitest run src/core/bootstrap.test.ts` grün (die drei Kopplungstests aus `:37-63` sehen den
neuen Ordner, den `MODULE_MIGRATIONS`-Eintrag und die Dockerfile-Zeile) ·
`pnpm vitest run src/core/shell/switcherEntries.test.ts` grün ·
**`pnpm exec playwright test e2e/shell-mobil.spec.ts e2e/keystone.spec.ts` grün** (der fünfte
Switcher-Eintrag steht in der Kopfzeile **jeder** Modulseite, §3) · `pnpm build` grün.

**Beachten:**
- **Vier Einträge, nicht drei.** `MODULE_MIGRATIONS` in `src/core/bootstrap.ts:17-21`;
  `COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/files/_db/migrations ./src/app/m/files/_db/migrations`
  neben `Dockerfile:35-37`; **und** `Dockerfile:44` wird zu
  `RUN mkdir -p /data/files && chown nextjs:nodejs /data /data/files`. Ohne die vierte Zeile schlägt
  **jeder** Blob-Schreibvorgang fehl, sobald `files_data` als eigener Mount dazukommt (§2.2: ein leeres
  benanntes Volume auf einem Pfad, den das Image nicht kennt, wird `0 0`), und es sähe nach einem
  Rechte-Rätsel aus statt nach einer fehlenden Zeile. Kein Test erzwingt sie — sie ist deshalb hier
  ausgeschrieben.
- **Kein Seed, kein Schema-Import** (Festlegung E in §1). `mode: "timestamp"`, **nie**
  `timestamp_ms` — `qr/_db/schema.ts:19-20` benutzt Letzteres, und ein Copy-Paste von dort ist der
  wahrscheinlichste Weg in den paritätsgrünen Faktor-1000-Fehler.
- Registry-Eintrag wörtlich nach §2.3, `requiresAuth: false` (sonst schickt die Middleware jeden
  anonymen `/s/<id>`- und `/u/<token>`-Aufruf in den Login, `routing.ts:71-73`), `prodHosts: []`,
  `icon: "FolderOutlined"` — ein unbekannter Icon-Name fällt **still** auf `AppstoreOutlined` zurück
  (`SuiteNav.tsx:261`).
- **Die Einfügeposition in `MODULES` ist festgelegt: unmittelbar NACH `feedback`** (`registry.ts:65-67`),
  **vor** `alpha`. Daran hängen zwei bestehende Zusicherungen, die sonst rot werden, ohne dass ein Task
  dafür zuständig ist — sechs parallele Tasks der Welle 1 sähen einen Fehlschlag, den sie nicht
  verursacht haben:
  `src/core/shell/switcherEntries.test.ts:12` wird `["portal","qr","feedback","files","gamma"]`,
  `:33` wird `["qr","feedback","files"]`.
- **Warum `files` in Dev/Test im Switcher steht und in Prod nicht** — der Satz gehört als Kommentar an
  die geänderten Erwartungsarrays, weil die Spec-Begründung („Der App-Switcher zeigt es dann nicht",
  §2.3) **nur für Prod** gilt: `canAccess` steigt bei `requiresAuth: false` sofort mit `true` aus
  (`registry.ts:133`), also filtern die Gruppen nicht; und `moduleUrl` liefert außerhalb von
  `NODE_ENV === "production"` die Dev-URL `http://files.localtest.me:<port>` **unabhängig** von
  `prodHosts` (`moduleUrl.ts:19-26`). In Prod ohne `SUITE_HOST_FILES` ist `prodHostsFor()` leer,
  `moduleUrl` liefert `null`, und `switcherEntries` verwirft den Eintrag (`switcherEntries.ts:11-13`) —
  deshalb bleibt der Prod-Fall `["portal"]` unverändert.
- **Erbe für Spec 2:** Migrationsdateinamen werden **nicht** vorgegeben; sie kommen aus
  `_db/migrations/meta/_journal.json`. Gestrichene Spalten: `shares.limit_reached_at`,
  `shares.s3_prefix`, `share_files.s3_key`. Umbenannt: `download_logs.ip` →
  `client_ip_unbestaetigt`. Neu und nullable: `share_files.bytes_vollstaendig_at`. Dazu **fünf
  Festlegungen, die der Import braucht** und die nur hier stehen können:
  1. **`inbox_files.empfangen_at`** (Unix-**Sekunden**, `NOT NULL`): für neue Uploads die Annahmezeit;
     **für META-lose Altdateien ist die Quell-`mtime` die einzige Zeitquelle und muss hierhin**, und
     der **Ziel-Arm der Parität liest sie von dort** (§4.6, Analyse Abschnitt 5).
  2. **Der Statuswertebereich ist der Import-Eingang:** `scanning`, `clean`, `infected`, `error`,
     `unscanned` — der `CHECK` trägt **alle fünf**, und `unscanned` ist der Wert, mit dem der
     Altbestand einläuft (§6.2).
  3. **`download_logs.id` ist NICHT erhaltungspflichtig** — nichts außerhalb der Tabelle verweist
     darauf, der Mapper darf neu vergeben (§4.5).
  4. **`shares.download_count` wird 1:1 übernommen und NIE aus `download_logs` rekonstruiert**
     (1:1-Pflicht, §4.2): das Log ist lückenhaft, der Zähler ist die Wahrheit.
  5. **Der Import ist spaltenweise mit Namen**, nie positionsweise (§1.3) — die Alt-Spalte
     `limit_reached_at` ist gestrichen, jede positionsweise Abbildung verschiebt danach **alles**
     dahinter und ist paritätsgrün.
  Und für `shares.created_by`: **jede Altzeile bekommt den Platzhalter `import:easy-filesharing`**
  (E21 (c)); T36 Punkt 4 zeigt ihn nur an, gesetzt wird er im Import.

---

### Task 3: Abhängigkeiten — `bcryptjs` (cost 12, `$2b$12$`) und `archiver`

**Zusage:** `bcryptjs` erzeugt Hashes mit Präfix `$2b$12$` und Länge 60 und verifiziert
Bestands-Hashes der Alt-App; `archiver` ist installiert und streamt.

**Test zuerst:** `src/app/m/files/_lib/abhaengigkeiten.test.ts` — `hashSync("x", 12)` beginnt mit
`$2b$12$` **und** hat `length === 60`; `compareSync` gegen einen fest im Test hinterlegten
`$2b$12$`-Hash der Alt-Familie ist `true`; `archiver("zip", { zlib: { level: 1 } })` liefert einen
Stream, der auf `error` hört. Rot, weil beide Pakete fehlen.

**Dateien:**
- Neu: `src/app/m/files/_lib/abhaengigkeiten.test.ts`
- Geändert: `package.json`, `pnpm-lock.yaml`

**Abhängigkeiten:** keine.

**Fertig, wenn:** `pnpm install --frozen-lockfile` läuft durch · der Test grün · `pnpm typecheck` grün.

**Beachten:** Das ist der kleinste Test des Plans und der einzige, der eine 1:1-Pflicht schützt, deren
Bruch **jeden geschützten Bestands-Share unöffenbar** macht (§4.2). `bcryptjs`, nicht `bcrypt` —
Präfixverhalten und Typen unterscheiden sich, und die Alt-App benutzt `bcryptjs`. Eine zweite
Hash-Familie (argon2/scrypt) ist in §12 ausdrücklich verworfen.

---

### Task 4: `_lib/ip.ts` — die EINE Kürzungsstelle für Absenderadressen

**Zusage:** `ipKuerzen(roh: string | null): string | null` kürzt IPv4 auf das letzte Oktett `0` und
IPv6 auf `/48`; ein unparsbarer Wert wird `null`, **nie** der Rohwert.

**Test zuerst:** `src/app/m/files/_lib/ip.test.ts` — `93.184.216.34` → `93.184.216.0`;
`2001:db8:1234:5678::1` → `2001:db8:1234::`; `null`, `""`, `"unknown"`, `"1.2.3"`,
`"::ffff:1.2.3.4"`-Grenzfall → jeweils benanntes Ergebnis, wobei unparsbar **`null`** ist; und
**Idempotenz**: eine bereits gekürzte Adresse bleibt gleich. Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/ip.ts`, `_lib/ip.test.ts`

**Abhängigkeiten:** keine.

**Fertig, wenn:** `pnpm vitest run src/app/m/files/_lib/ip.test.ts` grün.

**Beachten:** Analyse E12 empfiehlt „(b) **und** (c)"; (b) allein wäre eine unbenannte Abweichung an
der datenschutzrelevantesten Stelle des Moduls. **Gekürzt, nicht gehasht** — der Betreiber soll „drei
Downloads aus demselben Netz" erkennen können. Die Notbremse hängt daran nicht: der `RateLimiter`
arbeitet mit der **vollen** Adresse im Prozessspeicher und schreibt sie nie (§4.5, §8.4).
**Erbe für Spec 2:** der Import führt **jede** Altzeile in `download_logs` und `inbox_files` durch
diese Funktion; ungekürzte Altadressen einzuspielen wäre die Maßnahme rückwärts.

---

### Task 5: `_lib/token.ts` — Grammatik, Hash und Normalisierung der Abgabelinks

**Zusage:** Ein erzeugtes Token ist `dz-` + 3×4 Zeichen aus `23456789abcdefghijkmnpqrstuvwxyz`
(17 Zeichen); der Hash ist `base64url_ohne_padding(SHA-256(utf8(voller Token)))`; die Normalisierung
akzeptiert Groß-/Kleinschreibung und fehlende Bindestriche, aber **kein** fremdes Zeichen.

**Test zuerst:** `src/app/m/files/_lib/token.test.ts` — 1.000 erzeugte Token erfüllen die Grammatik
und enthalten **nie** `0`, `1`, `l`, `o`; `tokenHash` gegen einen fest hinterlegten Erwartungswert
(base64url, **kein** `=`); Normalisierung: Groß-/Kleinschreibung und Leerzeichen werden getilgt, die
`dz-####-####-####`-Form akzeptiert. **Korrektur (30.07.):** das ursprüngliche Beispiel
`DZ23 4567 89AB` war in sich widersprüchlich — ohne Weißraum sind das 12 Zeichen, also 10
Körperzeichen, unvereinbar mit der ebenfalls hier zugesagten Form `dz-` + 3×4 (17 Zeichen). Der
gelieferte Test lehnt es folgerichtig als falsche Länge ab; als Annahme-Beispiel gilt eine
selbstkonsistente Eingabe wie `DZ23 4567 89AB CD` → `dz-2345-6789-abcd`. Abgelehnt bleiben
`dz-0000-…` und `dz-abc!-…` **abgelehnt**. Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/token.ts`, `_lib/token.test.ts`

**Abhängigkeiten:** keine.

**Fertig, wenn:** der Test grün · die Verteilung ist verzerrungsfrei belegt (`byte % 32` bei 256
Bytewerten, im Kommentar begründet).

**Beachten:** 1:1-Pflicht, weil Codes von Hand abgeschrieben und **vorgelesen** werden. Die
Alt-Normalisierung prüfte das Alphabet **nicht** mit (`drop/web/src/lib/utils.ts:75,96` behält
`[a-z0-9-]` und ist am Ende ein Pass-through) — das wird hier korrigiert. SHA-256 statt bcrypt ist
begründet (60 Bit Entropie, ≤ 72 h Laufzeit, bcrypt auf jedem Upload-Chunk wäre Rechenlast ohne
Gewinn, §4.7). Der **Rohtoken wird nie gespeichert**.

---

### Task 6: `_lib/kategorien.ts` — Schreib-Validierung, Anzeige-Toleranz

**Zusage:** Beim Schreiben wird gegen die Liste validiert (`bilder`, `dokumente`, `sonstiges`); beim
**Anzeigen** wird ein unbekannter Wert **toleriert** und roh ausgegeben, nicht verworfen.

**Test zuerst:** `src/app/m/files/_lib/kategorien.test.ts` — `istSchreibbareKategorie("bilder")` wahr;
`("__none__")`, `("Freitext")`, `("")` falsch; `anzeigeKategorie("unbekannt-aus-import")` liefert den
Rohwert; `anzeigeKategorie(null)` liefert den benannten Leerwert. Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/kategorien.ts`, `_lib/kategorien.test.ts`

**Abhängigkeiten:** keine.

**Fertig, wenn:** der Test grün.

**Beachten:** Die drei Vorbelegungen sind 1:1 (heute Verzeichnisnamen **und** META-Feld). Welche
Verzeichnisse real existieren, ist **§13.1 Frage 5 — und sie blockiert die Schreibliste dieses Tasks**
(§0): die Anzeige-Toleranz trägt nur die **Lese**seite. Beim Schreiben wird gegen die feste Liste
validiert, und genau diese Werte bietet das Abgabeformular (T38) an; heißen die realen Verzeichnisse
anders, bietet das Formular Unbekanntes an und die Filter im Posteingang (T43) greifen ins Leere. Bis
zur Antwort sind die drei Werte eine **Vorlage** — das gehört als Kommentar an die Konstante, mit dem
Preis: die Umbenennung danach ist eine **Migration plus Formularänderung**, kein Einzeiler. Deshalb
**kein** Verwerfen beim Lesen. Weil die Kategorie hier eine **Spalte** ist, kann sie kein Verzeichnis mehr
erzeugen; `mkdir recursive` auf Nutzereingabe entfällt, und der Sentinel `__none__`, der die
Alt-Säuberung unverändert überlebte, hat keine Wirkung mehr.

---

### Task 7: `_lib/storage.ts` — vier Operationen, ein Pfadschema, atomares Schreiben

**Zusage:** Ein Dateipfad entsteht **ausschließlich** in dieser Datei und **ausschließlich** aus
DB-IDs; `schreibeStrom` schreibt über `<pfad>.part` + `fsync` + `rename`, bricht bei `maxBytes` ab und
lässt keine Datei zurück; der chunked Weg findet seine Zwischendatei in der **nächsten** Anfrage
wieder.

**Test zuerst:** `src/app/m/files/_lib/storage.test.ts` gegen ein temporäres `DATA_DIR`:
1. jede ID, die nicht `/^[A-Za-z0-9_-]{10}$/` erfüllt, **wirft** — `..`, `../..`, `a/b`, `""`,
   11 Zeichen, ein NUL-Byte;
2. `schreibeStrom` liefert die **gemessene** Bytezahl und legt das Elternverzeichnis an;
3. Überschreitung von `maxBytes` → `GroesseUeberschritten`, **und** weder Ziel noch `.part` liegen
   danach da;
4. `lieseStrom`/`groesse` auf Fehlendes → `BlobFehlt` (nicht ENOENT durchreichen);
5. `loesche` auf Fehlendes ist **still** und räumt eine liegen gebliebene `.part` mit;
6. **die drei Zusagen des chunked Wegs:** der zweite Aufruf mit `anhaengen: true` findet die
   Zwischendatei und hängt an; der Fortschritt ist ihre **Länge**; ein zweiter Aufruf mit
   `anhaengen: false` auf dasselbe Ziel bekommt `EEXIST` statt verschränkter Bytes;
7. die Namensräume sind disjunkt: `<shareId>` hat immer 10 Zeichen, `inbox` hat 5;
8. **der Dateimodus ist explizit:** eine geschriebene Datei hat nach `rename` `mode & 0o777 === 0o640`,
   das angelegte Elternverzeichnis `0o750` — gemessen über `statSync`, nicht behauptet;
9. **die zwei Fehlerklassen aus §5.4 sind eigene Fehlertypen**, nicht durchgereichte `NodeJS.ErrnoException`:
   ein simuliertes `ENOSPC` beim Schreiben ergibt `KeinPlatz` **und** die Zwischendatei ist danach weg;
   ein simuliertes `EACCES` ergibt `AblageNichtSchreibbar` und wird **laut** geloggt. Ohne diesen Punkt
   trägt die Abbildung 507/500 in T27/T31/T49 keine Mutation.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/storage.ts`, `_lib/storage.test.ts`

**Abhängigkeiten:** keine.

**Fertig, wenn:** der Test grün · `grep -rn "path.join\|DATA_DIR" src/app/m/files --include=*.ts`
findet außerhalb von `_lib/storage.ts` **keinen** Pfadbau.

**Beachten:**
- **Kein Dateiname im Pfad** (Betreiberentscheidung E5 b): `<DATA_DIR>/files/<shareId>/<fileId>` und
  `<DATA_DIR>/files/inbox/<inboxFileId>`. Damit verschwindet die Traversal-Klasse **strukturell**
  statt per Guard — auf S3 sind `..` und `/` gewöhnliche Key-Bytes, `path.join` verlässt bei
  `..`-Segmenten die Wurzel, und kein statisches Werkzeug kennt diesen Unterschied (Analyse Falle 27).
- **Der `.part`-Name ist deterministisch, ohne Zufallsanteil.** Vier Zusagen hängen daran: der
  Fortschritt ist seine Länge, das Abbrechen und das Aufräumen finden ihn, und `--exclude='*.part'` im
  Backup trifft ihn. Mit Zufallsanteil fällt alle vier.
- Die Pfadfunktion ist **privat**. `opts.maxBytes` wird **beim Zählen** durchgesetzt, nie aus einer
  gemeldeten Größe. Fehlerbild nach §5.4 (ENOSPC → 507 mit gelöschter Zwischendatei, EACCES → 500
  laut) — und die Fehlerklassen dazu sind Testpunkt 9, nicht nur dieser Satz.
- **`schreibeStrom` setzt einen expliziten `mode: 0o640`, das Elternverzeichnis `0o750`** (§6.5).
  Ohne die Angabe gilt `0o666 & ~umask`, und der Fall „clamd darf nicht lesen" fällt erst am Zielhost
  auf — als `error` auf **jeder** Datei, also fail-closed in Produktion. Die beiden Zahlen sind
  **Konstanten in `_lib/storage.ts`**, nicht in `_lib/grenzen.ts`: dieser Task liegt in Welle 1, `grenzen.ts`
  entsteht erst in Welle 2a, und ein Dateimodus ist keine Grenze, sondern eine Ablage-Eigenschaft.
  **Die Spec lässt genau zwei Varianten zu, und nur eine gilt** (§6.5): entweder `0o640` **plus
  gemeinsame gid** — das ist die hier gebaute —, **oder** ein `user:` am clamav-Service. Welche, ist
  **§13.3 Frage 16**, am laufenden Host gemessen (`zSCAN` im Sidecar auf eine frisch geschriebene
  Datei); der Verweis gehört als Kommentar an die Konstante, damit die zweite Variante nicht
  **zusätzlich** eingebaut wird.
- **Erbe für Spec 2:** dieses Pfadschema ist das Ziel des Blob-Umzugs; der Quellpfad existiert im Ziel
  nicht mehr, der Paritäts-Schlüssel ist deshalb der Inhalts-Hash, nicht `relPath`.

---

**Disjunktheit Welle 1**

| Task | Schreibmenge (Kurzform) |
|---|---|
| T1 | `src/core/ratelimit.*`, `feedback/_lib/ratelimit.*` (gelöscht), `feedback/actions.ts` |
| T2 | `files/_db/*`, `core/registry.ts`, `core/bootstrap.ts`, `Dockerfile` |
| T3 | `files/_lib/abhaengigkeiten.test.ts`, `package.json`, `pnpm-lock.yaml` |
| T4 | `files/_lib/ip.*` |
| T5 | `files/_lib/token.*` |
| T6 | `files/_lib/kategorien.*` |
| T7 | `files/_lib/storage.*` |

**Schnittmenge: ∅.** **Kein Task nennt eine Abhängigkeit aus dieser Welle** — alle sieben haben
„Abhängigkeiten: keine". Abzurufende Routen: keine (keine Route entsteht).
**Playwright läuft trotzdem** (§3): T2 ändert `src/core/registry.ts`, und der fünfte Switcher-Eintrag
steht danach in der Kopfzeile jeder Modulseite.

---

## Welle 2 — Tragende Schicht (6 Tasks, ZWEI Stufen)

**Stufe 2a (parallel): T8, T9, T12, T13** — lesen ausschließlich Ergebnisse aus Welle 1.
**Stufe 2b (parallel): T10, T11** — jeder hängt an einem Ergebnis aus 2a (T10 an T9, T11 an T8).

Die Aufteilung ist keine Vorsicht, sondern die Kopfregel: T10 braucht `hostFuerRolle` aus T9 für den
`callbackUrl`, T11 braucht Zeitgrenzen und Scanner-Adresse aus `_lib/grenzen.ts` (T8). Beide Kanten
sind **nicht** wegkonstruierbar — T11 direkt aus `process.env` lesen zu lassen wäre eine zweite
Zahlenquelle neben §9.3.

### Task 8: `_lib/grenzen.ts` — jeder Name trägt seine Einheit

**Zusage:** Alle Zahlen des Moduls liegen an **einer** Stelle, jeder Name trägt seine Einheit, die drei
Pflichtvariablen haben **keine** Vorbelegung, und die Ketten-Prüfungen aus §9.4 liefern Fehlermeldungen,
die Name **und** Einheit nennen.

**Test zuerst:** `src/app/m/files/_lib/grenzen.test.ts` — je Pflichtvariable (`FILES_MAX_DATEI_BYTES`,
`FILES_AV_MAX_BYTES`, `FILES_MAX_ABLAUF_TAGE`): fehlt sie, enthält die Meldung den Variablennamen
**und** das Wort der Einheit („Bytes" bzw. „Tage"); Prüfung 2 `FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES`
und Prüfung 3 `FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES` greifen **in beide Richtungen** (Gleichheit
bei 3 ist erlaubt, bei 2 nicht); Prüfung 4 für die fünf Mindestwerte; nichtganzzahlige und negative
Werte werden abgewiesen; **und die Bedingtheit**: bei `prodHostsFor(getModule("files")).length === 0`
liefert die Prüfliste **leer**, auch wenn keine einzige Variable gesetzt ist. Rot, weil die Datei
nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/grenzen.ts`, `_lib/grenzen.test.ts`

**Abhängigkeiten:** T2 (Registry-Eintrag — `getModule("files")` wirft sonst).

**Fertig, wenn:** der Test grün · `grep -rn "1024 \* 1024\|500 \* 1024" src/app/m/files` findet die
Zahl nur in `_lib/grenzen.ts`.

**Beachten:**
- Die Tabelle aus §9.3 ist vollständig zu übernehmen, **inklusive** `FILES_MAX_DATEIEN_PRO_SHARE`
  (200) und `FILES_VORSCHAU_MAX_BYTES` (5 MiB, gilt für **alle** Vorschauen).
- `FILES_CHUNK_BYTES = 4 MiB` ist eine **Konstante**, keine Env-Variable: sie ist eine Untergrenze
  gegen den Next-Default `proxyClientMaxBodySize` = 10 MiB
  (`node_modules/next/dist/server/config-shared.js:260`), und `cloneBodyStream` bricht bei
  Überschreitung ab, schiebt `null` in beide Streams und gibt **nur** ein `console.warn` aus
  (`server/body-streams.js:85-101`). Das ist eine Zahl, die wir ohne Server kennen.
- **`FILES_AV_MAX_BYTES` bekommt keine Vorbelegung aus `FILES_MAX_DATEI_BYTES`** — dieselbe Zahl an
  zwei Bedeutungen macht die Kette aus §6.6 zur Tautologie und verdeckt genau die Kollision aus §9.1
  (beide „500" der Alt-Apps unterscheiden sich um den Faktor 1,048576, beide „100" um 4.857.600 Byte).
- **Vorbedingung: §13.1 Fragen 1 und 2.** Ohne die Antworten gibt es keine `.env`-Werte für Produktion;
  die Dev-/E2E-Werte stehen als **Zahlen** in §9.3 und sind hier zu übernehmen (12 MiB, weil > 4 MiB
  Chunk **und** > 10 MiB für den Proxy-Kappen-Test).

---

### Task 9: `_lib/hostRolle.ts` — sechs Funktionen, eine Aufgabe je Funktion

**Zusage:** Host → Rolle mit `resolveRole`/`rolleOderNull`/`requireRolle`; **erzeugte** Links tragen
den Host aus der **Rolle** und den Port aus dem **Request**; `validateFilesHosts` fällt die vier
Urteile aus §3.3.

**Test zuerst:** `src/app/m/files/_lib/hostRolle.test.ts` —
1. beide Hosts → ihre Rolle, mit Port (`files.localtest.me:3100`) und in Großschreibung normalisiert;
2. unbekannter Host: `resolveRole` **wirft**, `rolleOderNull` liefert `null` und wirft **nicht**;
3. `requireRolle("inbox", …)` lässt den Inbox-Host durch und wirft beim Verwaltungs-Host;
4. `hostFuerRolle` liefert `null`, wenn die Rolle keinen Host hat;
5. **„Host aus der Rolle, Port aus dem Request"** — `oeffentlicheUrl("inbox", "/u/x", headers)` auf
   dem **Verwaltungs**-Host mit `x-forwarded-proto: https` ergibt `https://drop.…/u/x`; derselbe Aufruf
   mit einem portbehafteten Request-Host ergibt `http://drop.…:3100/u/x`;
6. `validateFilesHosts`: 0 Hosts → **erlaubt**; 1 → Fehler; 2 verschieden → erlaubt; 2 **gleich** →
   Fehler; ≥ 3 → Fehler.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/hostRolle.ts`, `_lib/hostRolle.test.ts`

**Abhängigkeiten:** T2.

**Fertig, wenn:** der Test grün, **inklusive der Portregel** — ohne sie fängt Punkt 5 keine Mutation.

**Beachten:**
- `resolveHost` aus `src/core/routing.ts:36-41` wird **wiederverwendet**, nicht nachgebaut: eine zweite
  Auflösung ist genau der Ort, an dem beide auseinanderlaufen. `hostFuerRolle` liest
  `prodHostsFor(getModule("files"))`, **nie** `mod.prodHosts` direkt (`registry.ts:28-34` schreibt die
  Falle aus; genau so entstand Post-Cutover-Befund 2).
- **Die Portregel ist keine Bequemlichkeit.** `validateHostConfig` weist jeden `SUITE_HOST_*`-Wert mit
  `:` ab (`src/core/hosts.ts:78-86`), der Host aus der Rolle ist also **immer** portlos; E2E läuft auf
  3100 (`playwright.config.ts:33,35,60`), Dev auf 3000. Ohne „Port aus dem Request" lautete ein
  erzeugter Link `http://drop.localtest.me/u/<token>` und wäre lokal unerreichbar — und damit der
  ganze Zweihost-Aufbau aus §3.4 unbrauchbar. Präzedenzfall:
  `feedback/f/[slugSecret]/qr.png/route.ts` baut aus `resolveHost(req.headers)`, das den Port
  **mitbringt**.
- **Die Zwei-Gleich-Prüfung ist ein Befund der Spec, nicht der Analyse:** `validateHostConfig` sieht
  eine Doppelung **innerhalb** eines Moduls nicht, weil `claimedBy` nur meldet, wenn `other !== key`
  (`hosts.ts:87-94`) — beide Rollen zeigten still auf denselben Host.
- **Erbe für Spec 2:** `SUITE_HOST_FILES` trägt ab dem **ersten** Cutover **beide** Hosts in
  Rollenreihenfolge; ein Teil-Rollback entfernt den Host aus `SUITE_TRAEFIK_RULE` und **lässt
  `SUITE_HOST_FILES` unverändert** (ein einzelner Host bricht den Boot der ganzen Suite ab, §3.3).

---

### Task 10: `_lib/access.ts` — genau EINE Stufe, ohne Suite-Admin-Abkürzung

**Zusage:** Wer in einer Gruppe aus `adminGroupsFor(mod)` **oder** `requiredGroupsFor(mod)` ist, darf
alles; alle anderen bekommen `notFound()`; **eine leere Liste gewährt nichts**; der Suite-Admin
**ohne** `files`-Gruppe bekommt `notFound()`.

**Test zuerst:** `src/app/m/files/_lib/access.test.ts` —
1. Eingeloggter **ohne** Gruppe → `notFound()`;
2. **Suite-Admin ohne `files`-Gruppe → `notFound()`** (die Betreiberentscheidung);
3. Mitglied aus `adminGroupsFor` → Zugang; Mitglied aus `requiredGroupsFor` → Zugang;
4. **beide Listen leer → `notFound()`**, nicht Zugang;
5. keine Session → `redirect` auf `/login?callbackUrl=…`, und der `callbackUrl` zeigt auf den
   **Verwaltungs**-Host, nicht auf einen internen `/m/files`-Pfad;
6. die Env-Überschreibung wirkt: `SUITE_ADMIN_GROUP_FILES` gesetzt → nur diese Gruppe zählt;
7. **der Rückfall, wenn die Rolle keinen Host hat:** `hostFuerRolle("verwaltung") === null` (der
   Normalfall vor dem Cutover, `prodHosts: []` ohne `SUITE_HOST_FILES`) → der `callbackUrl` ist der
   **relative** Pfad `/m/files`, **kein** geratener absoluter Host.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/access.ts`, `_lib/access.test.ts`

**Abhängigkeiten:** T2 (Registry), T9 (Host für den `callbackUrl`) — **deshalb Stufe 2b.**

**Fertig, wenn:** der Test grün · `grep -n "suiteAdminGroup\|isModuleAdmin" src/app/m/files` findet
**nichts**.

**Beachten:**
- **Bewusste Abweichung von Analyse E3 (a).** `isModuleAdmin` lässt den Suite-Admin unbedingt durch
  (`src/core/groups.ts:104`: `if (groups.includes(suiteAdminGroup(env))) return true`). Die
  Betreiberentscheidung gewinnt; Vorbild ist `feedback/_lib/access.ts:31-35` mit der dort
  ausgeschriebenen Begründung „Betrieb und Einsicht sind zwei Rollen". Zugang zu `files` heißt Einblick
  in fremde Freigaben **und** in ein Postfach mit Uploads Dritter.
- **Punkt 4 ist der teuerste Fehler dieses Tasks.** Die naheliegende Vorlage ist die falsche:
  `canAccess` steigt bei leerer Liste mit `true` aus (`src/core/registry.ts:135-137`), und der
  Kommentar an `envAccessGroupsFor` (`src/core/groups.ts:44-58`) nennt das wörtlich „eine **ÖFFNUNG**".
  Richtig ist die Bauform aus `feedback/_lib/requireFeedbackAccess.ts:45-47`
  (`viewer.groups.some((g) => erlaubt.includes(g))`). Wer von `canAccess` abschreibt, öffnet `files`
  für **jeden Eingeloggten** — und der Fehler ist still: alles funktioniert, für zu viele.
- **Punkt 7 ist kein Randfall, sondern der Zustand vor dem Cutover.** `suiteRedirect` erlaubt ein
  absolutes Ziel nur, wenn `moduleForHost` den Host kennt **und** das Protokoll dem der `baseUrl`
  entspricht (`src/core/auth/redirect.ts:30-56`); ein geratener oder protokollfremder Host landet
  **stumm** auf dem Portal — genau die in `src/core/hosts.ts:55-63` ausgeschriebene Falle („der Host
  fällt in `moduleForHost` auf das Portal zurück", „ohne Fehler und ohne Meldung"). Ein relativer Pfad
  geht dagegen unverändert durch (`redirect.ts:41`).
- `notFound()`, **nicht** 403 — die Existenz der Route wird nicht verraten
  (`requireFeedbackAccess.ts:48`, `docs/design/README.md:239-242`).
- Es gibt **kein** zweites Prädikat und **keine** Ownership-Prüfung; `shares.created_by` ist reine
  Anzeige. Wer hier einen `assertGroupAccess`-Zwilling sucht: es gibt ihn nicht, und das ist Absicht.
- **Der Preis gehört in den Kopfkommentar:** Gruppen im JWT sind nur so frisch wie der letzte
  Token-Refresh, Takt ≈ eine Stunde (`CLAUDE.md:54-59`). Eine serverseitige Auflösung aus der DB ist
  hier **nicht möglich** — es gibt keine Objekt-Zugehörigkeit, an der man sie auflösen könnte. Das ist
  die Kehrseite der Ein-Stufen-Entscheidung.

---

### Task 11: `_lib/av.ts` (Scanner-Vertrag), `scripts/fake-clamd.mjs`, prozessweiter Netzhaken

**Zusage:** `scanne(ziel)` settelt **immer** und **genau einmal** und wirft **nie** asynchron; die
Auswertung baut **nicht** auf `stream:`-Präfixe; ein Fake-clamd macht denselben Transport in Dev, E2E
und Test darstellbar.

**Test zuerst:** `src/app/m/files/_lib/av.test.ts` gegen einen **echten** `net.createServer` — kein
Stub, der in einer async-Funktion wirft (genau diesen Pfad decken drops zwei Tests ab, und den
tödlichen lassen sie ungeprüft):

| Fall am echten Socket | Zusage |
|---|---|
| `stream: OK\0` / `<pfad>: OK\0` | `{art:"clean"}`, Socket geschlossen |
| `stream: Eicar-Test-Signature FOUND\0` | `{art:"infected"}` **mit** Signatur |
| `INSTREAM size limit exceeded. ERROR\0` | `{art:"error"}` — **und der Testprozess lebt danach** |
| `stream: … ERROR\0` | `{art:"error"}` (kein Freibrief für das Präfix) |
| Antwort ohne `\0`, dann Abbruch | `{art:"error"}`, Promise settelt |
| Server antwortet **nie** | nach `FILES_AV_TIMEOUT_MS` → `{art:"error"}`, Socket zerstört |
| `ECONNREFUSED` | `{art:"error"}`, Grund enthält wörtlich `ECONNREFUSED <host>:<port>` |
| Server sendet **zwei** Antworten | genau **ein** Ergebnis (Idempotenz von `abschluss`) |

Dazu eine Quelltext-Zusicherung: **kein `throw` in einem Socket-Handler** von `_lib/av.ts`
(`expect(quelle).not.toMatch(/socket\.on\([^)]*\)[\s\S]*?throw/)`) — die Bauform ist scanbar, ihre
Wirkung nicht; deshalb stehen beide Ebenen da. Rot, weil `_lib/av.ts` nicht existiert.

**Dateien:**
- Neu: `src/app/m/files/_lib/av.ts`, `_lib/av.test.ts`, `scripts/fake-clamd.mjs`
- Geändert: `src/instrumentation.ts` (Netzhaken), `package.json` (`"dev:av"`-Skript)

**Abhängigkeiten:** T7 (`BlobZiel` und der Pfad kommen aus `_lib/storage.ts`), T8 (Zeiten/Adresse) —
**deshalb Stufe 2b.**

**Fertig, wenn:** der Test grün · `node scripts/fake-clamd.mjs` lauscht auf 3310 und antwortet auf
`zPING` mit `PONG\0` · `pnpm dev:av` startet ihn · **der Modus ist zur Laufzeit umschaltbar** (Beleg im
Test: eine Verbindung nach dem Schreiben der Modusdatei liefert das andere Muster, **ohne** Neustart).

**Beachten:**
- **Der belegte Anlass:** drops `parseResponse` wirft im `socket.on('end')`-Callback
  (`antivirus.js:11-26,56-58`) — außerhalb der synchronen Ausführung des Promise-Konstruktors. Das wird
  **keine** Rejection, sondern eine uncaught exception, und das Promise settelt **nie**. Gemessen:
  Exit-Code 1. **Im Monolithen reißt das `portal`, `qr` und `feedback` mit.**
- Bauregeln: **ein** `abschluss(ergebnis)` mit `bereits`-Flag, durch den **alle** Ereignisse laufen
  (`error`, `close`, `timeout`, `end`, Parse-Ergebnis); **kein** `throw` in irgendeinem Handler (ein
  Parse-Fehler ist ein **Rückgabewert**); harte Zeitgrenze; `socket.destroy()` in **jedem** Ausgang.
- **`AV_STATUS` und `istFreigegeben` gehören in diese Datei** — **eine** Konstante für **beide**
  Tabellen, **eine** Freigabeprüfung mit zwei Aufrufern (§4.6, das ist die Gegenmaßnahme zum Preis von
  E18 (a)). `istFreigegeben` gibt **nur** bei `clean` frei; **es gibt keinen fail-open-Schalter** — er
  wäre drops toter `AV_FAIL_OPEN` in neuer Gestalt.
- **Transport `zSCAN` per Pfad**, Pfad aus `_lib/storage.ts`, `z`-Präfix (NUL-terminiert).
- **Netzhaken in `src/instrumentation.ts`** (dort läuft `register()` einmal beim Boot, `:4-13`):
  `unhandledRejection` loggt mit Markierung und beendet **nicht**; `uncaughtException` loggt und
  beendet dann mit `exit(1)`, weil `restart: unless-stopped` (`compose.yaml:4`) der ehrlichere Weg ist
  als ein Prozess in undefiniertem Zustand. Der Haken ist die **zweite** Linie — tragend ist der
  Vertrag selbst.
- **`scripts/fake-clamd.mjs` ist EIN Werkzeug für drei Zwecke** (Vitest, `pnpm dev`, Playwright):
  `net.createServer`, `zPING` → `PONG\0`, `zSCAN <pfad>` → `<pfad>: OK\0` **nachdem** der Pfad
  tatsächlich gelesen wurde; existiert die Datei nicht, `<pfad>: Can't access file ERROR\0`. Vier Modi:
  `ok|found|error|haengt`. Zwei Fakes wären zwei Wahrheiten über das Protokoll.
- **Der Modus wird bei JEDER Verbindung neu gelesen** (Festlegung H in §1), nicht beim Prozessstart:
  aus der Datei `FAKE_CLAMD_MODUS_DATEI` (Vorbelegung `./.data/fake-clamd-modus`), fehlt sie oder ist
  ihr Inhalt unbekannt, gilt `FAKE_CLAMD_MODUS` und sonst `ok`. Ein unbekannter Inhalt wird **einmal
  laut geloggt** und nicht still zu `ok` — sonst ist ein Tippfehler in einem Testhelfer ein grüner
  Testlauf mit der falschen Zusage. **Der Grund ist nicht Bequemlichkeit:** Playwright startet den Fake
  **einmal** je Lauf (`workers: 1`), und ein Lauf braucht `ok` (T35, T38/T43) **und** `error` (T47) —
  T47 Punkt 8 sogar `clean` **und** `scanning` in **einem** Share. Der Startwert allein macht T47
  unausführbar, und damit fiele die Zusage „fail-closed ist nachweislich erreichbar" genau an der
  Stelle, an der Spec §6.3 sie für **nicht verhandelbar** erklärt.

---

### Task 12: `_lib/mime.ts` — Magic Bytes, drei Richtungen

**Zusage:** Der `mime_type` in der DB ist der **festgestellte**, nicht der deklarierte; ein Inhalt, der
nicht zur Allowlist passt, wird **abgelehnt** und die Zwischendatei gelöscht.

**Test zuerst:** `src/app/m/files/_lib/mime.test.ts` —
1. HTML-Inhalt, deklariert als `image/png` → **Ablehnung** (gemessen war das in `drop` ein 200,
   gespeichert als `evil.html`);
2. ein Teil **ohne** Content-Type → Ablehnung, **nicht** stillschweigend `text/plain` (der
   busboy-Default war der Durchschlupf);
3. je Allowlist-Format echte Magic Bytes → korrekt erkannt: JPEG, PNG, GIF, WebP, HEIC/HEIF, PDF,
   ZIP-basierte Office-Formate;
4. `text/plain` nur bei **gültigem UTF-8**; ungültige Bytefolge → Ablehnung;
5. der Abgleich läuft in **drei** Richtungen (Feststellung ↔ Deklaration ↔ Endung) und die
   **Feststellung** gewinnt.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/mime.ts`, `_lib/mime.test.ts`

**Abhängigkeiten:** keine (arbeitet auf einem Byte-Präfix, nicht auf einem Pfad).

**Fertig, wenn:** der Test grün · keine neue Abhängigkeit in `package.json`.

**Beachten:** **Vorbedingung: §13.1 Frage 3** — die wirklich eingesetzte `ALLOWED_MIME` von `drop`. Ein
zu enger Wert lehnt Handyfotos ab (HEIC), ein zu weiter öffnet den Ausliefer-Weg. Bis zur Antwort ist
die Liste aus §8.5 eine **Vorlage**, und das gehört als Kommentar an die Konstante. Warum überhaupt:
heute ist `drop` ungefährlich, weil es nichts ausliefert — **im Modul `files` mit Preview und Download
wird daraus gespeicherter XSS auf einer Domain im Cookie-Scope der ganzen Suite.** Die Prüfung ist die
**zweite** Linie; die erste ist das Pfadschema plus `attachment` + `nosniff` (§7.7), und genau deshalb
hält die Maßnahme auch bei einer Fehlklassifikation.

---

### Task 13: `_lib/passwort.ts` — bcrypt-Verify und signiertes, share-gebundenes Cookie

**Zusage:** Ein Cookie ist genau dann gültig, wenn es zu **diesem** Share gehört, nicht abgelaufen ist
und sein HMAC über `AUTH_SECRET` mit der Domänentrennung `files-share-v1:` stimmt.

**Test zuerst:** `src/app/m/files/_lib/passwort.test.ts` — gültiges Cookie → wahr; **fremder**
`shareId` im Wert → falsch; abgelaufenes `gueltigBis` → falsch; um ein Bit manipuliertes HMAC →
falsch; ein Wert, der mit einem **anderen** Präfix signiert wurde → falsch (Domänentrennung);
`bcryptVerify` gegen einen Bestands-Hash `$2b$12$…` → wahr, gegen ein falsches Passwort → falsch; und
`cookieName(shareId)` ist ein **gültiger** Cookie-Name für jede `nanoid(10)`-ID. Rot, weil die Datei
nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/passwort.ts`, `_lib/passwort.test.ts`

**Abhängigkeiten:** T3 (`bcryptjs`).

**Fertig, wenn:** der Test grün · `grep -rn "AUTH_SECRET" src/app/m/files` findet den Zugriff nur hier.

**Beachten:**
- **Ein Cookie je Share** (`files_s_<shareId>`) — ein einziges Cookie würde beim zweiten geschützten
  Share den ersten überschreiben. Wert `<shareId>.<gueltigBis>.<hmac>`, `HttpOnly`, `SameSite=Lax`,
  `Secure` in Produktion, `Path=/` (weil `/api/download/…` und `/api/preview/…` es lesen),
  `Max-Age = min(4 h, Restlaufzeit des Shares)`.
- **Kein neues Geheimnis in der `.env`** — `AUTH_SECRET` ist bereits Pflicht (`compose.yaml:23`), und
  die Domänentrennung verhindert, dass ein Wert aus einem anderen Zusammenhang hier gilt.
- **bcryptjs, cost 12, `$2b$12$` — auch für NEUE Passwörter.** Die Passwörter liegen bei den
  Empfängern; ein Wechsel der Hash-Familie macht jeden geschützten Bestands-Share unöffenbar (§4.2).
- Diese Datei ist der **eine** Ort der Prüfung, mit drei Aufrufern (Download, ZIP, Vorschau). Es gibt
  **genau einen** Annahmeweg — das Cookie: kein Bestandslink-Sonderweg, keine Karenz, kein zweites
  Prädikat.
- **Vorbedingung: §13.1 Frage 6, und sie ist VOR diesem Task fällig — nicht erst vor Welle 5.** Dieser
  Task legt den Vertrag fest, an dem der Setzweg (T28) und die drei Byte-Routen (T33, T51, T34) später
  nur noch hängen.
  Fällt die Antwort „ja/unklar", gilt Variante (c) und **dieser** Vertrag samt Testliste ändert sich
  (zweiter Annahmeweg, eigene Zustandslogik, eigene Statuscodes). Dann ist T13 **zu blockieren**, bis
  die Spec-1-Ergänzung geschrieben ist — nicht zu bauen und später umzubauen (§0).

---

**Disjunktheit Welle 2**

| Task | Stufe | Schreibmenge |
|---|---|---|
| T8 | 2a | `files/_lib/grenzen.*` |
| T9 | 2a | `files/_lib/hostRolle.*` |
| T12 | 2a | `files/_lib/mime.*` |
| T13 | 2a | `files/_lib/passwort.*` |
| T10 | 2b | `files/_lib/access.*` |
| T11 | 2b | `files/_lib/av.*`, `scripts/fake-clamd.mjs`, `src/instrumentation.ts`, `package.json` |

**Schnittmenge: ∅**, je Stufe und über beide. `package.json` ist in Welle 1 von T3 angefasst worden, in
Welle 2 nur von T11 — verschiedene Wellen, kein Konflikt.
**Kein Task nennt eine Abhängigkeit aus derselben Stufe:** T8/T9/T12/T13 hängen nur an Welle 1, T10 an
T9 (2a), T11 an T7 (1) und T8 (2a). Abzurufende Routen: keine.

---

## Welle 3 — Datenzugriff, Warteschlange, Rahmen (8 Tasks, alle parallel)

Die **breiteste** Welle des Plans. Die Disjunktheitstabelle am Ende ist hier die wichtigste.

### Task 14: Dev- und E2E-Aufbau — zwei Hosts, echte Zahlen, Fake-Scanner

**Zusage:** `pnpm dev` und `pnpm exec playwright test` laufen mit **zwei** `files`-Hosts, den drei
Pflichtzahlen und einem antwortenden Scanner; damit ist die Zwei-Host-Klasse **lokal prüfbar**.

**Test zuerst:** `src/app/m/files/_lib/devAufbau.test.ts` — ein Quelltext-Scan, weil die Wirkung erst
die E2E-Tests der Wellen 4–8 zeigen: `playwright.config.ts` enthält
`SUITE_HOST_FILES=files.localtest.me,drop.localtest.me` (Index 0 **wörtlich** `files.localtest.me`),
`webServer` ist ein **Array** mit einem Eintrag, der `scripts/fake-clamd.mjs` startet und auf
**`port: 3310`** wartet (nicht `url`), und `webServer.env` des Next-Eintrags trägt **jeden Namen aus
der Liste unten**. `.env.example` trägt die kommentierten Dev-Zeilen **und** die Kommentarzeile zur
Asymmetrie (unten). Rot, weil die Werte fehlen.

**Der Scan zählt nicht, er zählt AUF.** Die E2E-Tabelle in §9.3 hat **zehn Zeilen, aber elf
Variablen** — `FILES_AV_HOST` und `FILES_AV_PORT` teilen eine Zeile —, dazu kommt `SUITE_HOST_FILES`.
Ein Scan gegen „zehn" ist um eins daneben und lässt entweder Host oder Port durch. Verbindlich ist
diese Namensliste:
`FILES_MAX_DATEI_BYTES`, `FILES_AV_MAX_BYTES`, `FILES_MAX_ABLAUF_TAGE`, `FILES_AV_HOST`,
`FILES_AV_PORT`, `FILES_AV_TIMEOUT_MS`, `FILES_AV_VERSUCHE`, `FILES_AV_WIEDERHOLUNG_SEKUNDEN`,
`FILES_AV_PARALLEL`, `FILES_LOESCH_KARENZ_STUNDEN`, `FILES_AUFRAEUMEN_TAKT_MINUTEN` — **elf** — plus
`SUITE_HOST_FILES` und `FAKE_CLAMD_MODUS_DATEI` (siehe unten).

**Dateien:**
- Neu: `src/app/m/files/_lib/devAufbau.test.ts`, `e2e/helpers/avModus.ts`
- Geändert: `.env.example`, `playwright.config.ts`

**Abhängigkeiten:** T8 (Variablennamen), T9 (Hostregel), T11 (der Fake existiert).

**Fertig, wenn:** der Scan grün · `pnpm exec playwright test e2e/portal.spec.ts` läuft weiter durch
(der zweite `webServer`-Eintrag bricht den bestehenden Aufbau nicht) · `pnpm dev` startet mit
gesetzten `files`-Hosts, ohne Boot-Abbruch.

**Beachten:**
- **Der Schluss, der das möglich macht:** `moduleForHost` prüft `${key}.localtest.me` **und**
  `prodHostsFor(m, env)` (`registry.ts:119-126`), und `prodHostsFor` liest `envHostsFor` **unabhängig
  von `NODE_ENV`** (`hosts.ts:39-46`). Wildcard-DNS löst jeden `*.localtest.me` auf 127.0.0.1 auf.
  Damit läuft **derselbe** Code-Pfad in Dev, E2E und Produktion.
- **Index 0 ist wörtlich `files.localtest.me`**, damit der Dev-Zweig von `moduleUrl`
  (`<key>.localtest.me`, `moduleUrl.ts:24-26`) und die Rolle `verwaltung` denselben Host benennen.
  Weichen sie ab, zeigt der App-Switcher lokal auf einen Host, der die Rolle nicht trägt — die nächste
  Ausprägung von Falle 17.
- **Die kleinen AV-Zahlen sind Pflicht, nicht Kosmetik:** `FILES_AV_TIMEOUT_MS` 60 000 ×
  `FILES_AV_VERSUCHE` 5 wären fünf Minuten gegen `timeout: 90_000` (`playwright.config.ts:32`) — die
  Zusage „fail-closed ist erreichbar" liefe in einen Playwright-Timeout, sobald der Fake **hängt**
  statt abzulehnen. Mit 2 × 2 000 ms + 1 s Abstand ist derselbe Weg in ≈ 5 s durchlaufen.
- **`port: 3310` und nicht `url`:** Playwrights `url`-Probe schickt eine HTTP-Anfrage, und ein roher
  clamd-Socket antwortet darauf nicht — der Lauf hinge beim Start, statt laut zu scheitern.
- `FILES_LOESCH_KARENZ_STUNDEN=0` in E2E, sonst wartet der Aufräum-Test 24 Stunden.
- **Dieser Task liefert den Umschalt-Helfer für den AV-Modus** (Festlegung H in §1):
  `e2e/helpers/avModus.ts` mit `setzeAvModus("ok"|"found"|"error"|"haengt")`, das die Modusdatei
  **synchron** schreibt, und `FAKE_CLAMD_MODUS_DATEI` steht in `webServer.env` **beider** Einträge (der
  Fake liest sie, der Helfer schreibt sie — derselbe Pfad, sonst schreibt der Test ins Leere und der
  Lauf ist rennabhängig grün). Vorbelegung im E2E-Aufbau ist `ok`; T47 setzt `error` als **erste**
  Anweisung seines Tests. Konsumenten: T35 (Welle 6a), T43 (7), T47 (8b).
- **Die `.env.example`-Kommentarzeile zur Asymmetrie gehört zu diesem Task** (Spec §2.3, letzter Punkt;
  Analyse-Falle 18) und wird im Scan mitgeprüft: **`SUITE_ACCESS_GROUP_FILES` leer gesetzt bricht den
  Boot ab** (`groups.ts:135-139` meldet „ist leer gesetzt und damit wirkungslos" als **Fehler**),
  während **`SUITE_HOST_FILES` leer eine sinnvolle Aussage ist** („bewusst keine Prod-Hosts, so lässt
  sich ein Cutover zurücknehmen, ohne die Variable zu entfernen", `hosts.ts:33-38`). Zwei
  `SUITE_*`-Variablen desselben Moduls mit **entgegengesetzter** Bedeutung des Leerwerts — das steht
  nirgends sonst.
- **`.env.example` hat in Welle 4 einen zweiten Toucher:** T24 trägt `SUITE_CLAMAV_IMAGE` und
  `SUITE_CLAMAV_START_PERIOD` nach. Verschiedene Wellen, kein Konflikt (§2).

---

### Task 15: `_db/queries.ts` — die EINE Ladefunktion mit der EINEN Prüfkette

**Zusage:** Alle Wege zu einem Share (Seite, Download, ZIP, Vorschau) laufen durch **eine**
Ladefunktion in **einer** Reihenfolge — Existenz → Ablauf → Passwort-Cookie → AV-Status → Limit
(**lesend**) — und die Projektionen lassen `password_hash` **nicht** über die RSC-Grenze.

**Test zuerst:** `src/app/m/files/_db/queries.test.ts` gegen eine echte, migrierte Temp-DB —
1. die fünf Prüfstufen in **dieser** Reihenfolge; je Stufe der benannte Zustand;
2. **`hatPasswort: boolean`** in der Projektion, und **kein** Feld, dessen Wert mit `$2b$` beginnt;
3. `if (!file || file.shareId !== id)` — eine `fileId` aus einem **fremden** Share wird abgewiesen; die
   Prüfung steht **einmal**, in der Ladefunktion (die Alt-App hatte sie dreimal in drei Routen);
4. **die Ladefunktion zählt nichts hoch:** nach n Aufrufen ist `download_count` unverändert;
5. der **gemischte** AV-Zustand: ein Share mit `clean` + `scanning` liefert je Zeile ihren Zustand,
   `mindestensEineWirdGeprueft` ist wahr, `alleUnvollstaendig` falsch;
6. `bytes_vollstaendig_at IS NULL` zählt **nicht** in die Größensumme und ist **nicht** ladbar;
7. eine Quelltext-Zusicherung: **kein `select()` ohne Argument** in `src/app/m/files/**`.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_db/queries.ts`, `_db/queries.test.ts`

**Abhängigkeiten:** T2 (Schema), T7 (`groesse` für den Blob-Abgleich).

**Fertig, wenn:** alle sieben Punkte grün · die Größensumme wird **aus den Zeilen** gerechnet, nicht
aus `shares.total_size` (heute zeigen Dashboard und Detailseite dieselbe Größe aus **zwei** Quellen und
können verschiedene Zahlen zeigen).

**Beachten:**
- **Das Limit steht hinter dem Passwort, und die Ladefunktion liest es nur.** Läge es davor und
  verbrauchend, hätte schon das Öffnen der öffentlichen Seite — und jeder anonyme
  `/api/download/<id>`-Aufruf **ohne** Passwort — einen Download verbraucht: ein Share mit
  `max_downloads = 3` wäre mit drei fremden GETs tot, und das serverseitige Gate wäre still
  ausgehebelt statt schützend (§7.4).
- Punkt 3 ist die **einzige** serverseitige Objekt-Zugehörigkeitsprüfung, die die Alt-App hatte
  (`download/[id]/route.ts:64`, `preview/route.ts:83`) — ohne sie lädt jede `fileId` über jede gültige
  `shareId`. Sie ist hier **keine** Ownership-Frage (die gibt es nicht, §2.4), sondern die
  Zusammengehörigkeit zweier IDs.
- **Laufzeitvalidierung an jeder Grenze**, und **`??` statt `||`**: `maxDownloads: maxDownloads || null`
  (Alt: `init/route.ts:59`) macht aus „0 Downloads" still einen **unbegrenzten** Share.

---

### Task 16: `_db/zaehler.ts` und `_db/gleichzeitigkeit.test.ts` — atomar, gegen echte Parallelität

**Zusage:** `max_downloads` ist eine **Obergrenze**, nicht „etwa N"; `budget_dateien`/`budget_bytes`
ebenso — beides belegt gegen eine **echte** better-sqlite3-Datei-DB mit gleichzeitigen Vorgängen. **Und
hier liegt die eine Schreibstelle des Audit-Logs:** `protokolliereDownload({ shareId, fileId, headers })`
schreibt genau **eine** `download_logs`-Zeile, mit `client_ip_unbestaetigt` aus
`ipKuerzen(clientIpAus(headers))`, `user_agent` und `downloaded_at` in Sekunden.

**Test zuerst:** `src/app/m/files/_db/gleichzeitigkeit.test.ts` —
1. N gleichzeitige Vorgänge gegen einen Share mit `max_downloads = 1`: **genau eine** Rückgabe „darf",
   N−1 mal „gesperrt", `download_count === 1`;
2. drei sequenzielle bei `max_downloads = 2` → darf, darf, gesperrt;
3. dieselbe Zusage für das Mengenbudget: N gleichzeitige Abgaben gegen `budget_dateien = 1` → **eine**
   Annahme, N−1 Ablehnungen, `verbraucht_dateien === 1`;
4. `budget_bytes`: eine Abgabe, die das Restbudget um ein Byte überschreitet, wird abgelehnt;
5. **ein ZIP zählt als genau EIN Download** — die Zählfunktion wird je ZIP **einmal** gerufen, egal wie
   viele Dateien im Archiv sind, und die Logzeile trägt `file_id = NULL`;
6. **`protokolliereDownload` schreibt genau eine Zeile**, mit `file_id = <fileId>` bei einer einzelnen
   Datei und `file_id = NULL` beim ZIP; `client_ip_unbestaetigt` ist der **gekürzte** Wert (die Zeile
   enthält **keine** vollständige Adresse — geprüft an `93.184.216.34` → `93.184.216.0`), ein
   unparsbarer Wert wird `NULL`; `user_agent` wird übernommen, `downloaded_at` ist **zehnstellig**.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_db/zaehler.ts`, `_db/gleichzeitigkeit.test.ts`

**Abhängigkeiten:** T2 (Schema), **T4 (`ipKuerzen`), T1 (`clientIpAus`)**.

**Fertig, wenn:** alle sechs Punkte grün · die Zähler sind **ein einzelnes** SQL-Statement pro Vorgang
(`UPDATE … WHERE id = ? AND (max_downloads IS NULL OR download_count < max_downloads)`), und die
Entscheidung ist die **Zahl betroffener Zeilen**, nie ein vorher gelesener Wert.

**Beachten:**
- **Analyse Falle 25 ist der Grund für die echte Parallelität:** „sequenzielle Tests sind immer grün,
  und die atomare SQL-Variante daneben lässt den JS-Teil unverdächtig aussehen." Ein Mock belegt hier
  nichts.
- Heute läuft der Zähler in `after()` auf einem **vor** der Antwort gelesenen Wert; das SQL-Inkrement
  ist atomar, die Ableitung `newCount = share.downloadCount + 1` **nicht** — und `after` läuft laut
  mitgelieferter Doku auch dann, wenn die Antwort nicht erfolgreich abgeschlossen wurde.
- **Der Wettlauf beim Budget ist benannt und behandelt:** zwei gleichzeitige Abgaben können die
  Vorprüfung beide passieren, dann liefert das `UPDATE` für die zweite **null Zeilen**, obwohl ihre
  Bytes schon liegen. Dann werden **Blob und Zeile entfernt** und es gibt 429 mit demselben benannten
  Grund. Ohne diesen Zweig blieben die Bytes als stiller Waise liegen.
- **Der Preis gehört benannt:** ein abgebrochener Download ist **verbraucht**. Das ist die
  betreiberfreundliche Richtung, und „Downloads aufstocken" ist das Gegenmittel (T37).
- **Warum die Log-Schreibstelle HIER liegt und nicht in den Handlern.** §4.5 verlangt `ipKuerzen` an
  **jeder** Schreibstelle einer Absenderadresse — `download_logs` **und** `inbox_files`. Für
  `inbox_files` hat das einen Task (T31 Punkt 6); für `download_logs` hatte es keinen: T33/T51/T34
  sagten Statuscodes und Header zu, aber niemand sagte zu, dass ein Download **überhaupt** eine Zeile
  schreibt. Die Folge wäre nicht ein fehlendes Feature, sondern eine **grüne Zusage über ein leeres
  Audit-Log** — T41 rendert eine Ansicht über eine Tabelle, die kein Task füllt: genau der
  `feedback`-Fehlermodus, gegen den §10.2 gebaut ist. Zähler und Logzeile liegen deshalb in
  **einer** Datei und in **einem** Vorgang: erst zählen, dann protokollieren, beides als letzter
  Schritt vor dem ersten Byte (§7.5). Aufrufer sind T33 (`file_id` gesetzt) und T34 (`file_id = NULL`).
  **Die Vorschau ruft es nicht** (§7.7) — sie zählt nicht und loggt nicht.

---

### Task 17: AV-Warteschlange, Nebenläufigkeit, Boot-Wiederaufnahme

**Zusage:** Zeilen mit `av_status = 'scanning'` werden in `empfangen_at`-Reihenfolge abgearbeitet, mit
fester Nebenläufigkeit, mit `FILES_AV_VERSUCHE` Versuchen im Abstand
`FILES_AV_WIEDERHOLUNG_SEKUNDEN`; nach einem Neustart wird eine mitten im Scan abgebrochene Zeile
**erneut eingereiht** statt für immer auf `scanning` zu bleiben.

**Test zuerst:** in `src/app/m/files/_lib/av.test.ts` ergänzt (zweiter Toucher, Welle 3) —
1. drei Zeilen `scanning`, Fake antwortet `OK` → alle drei `clean`, `av_geprueft_at` gesetzt;
2. `FILES_AV_PARALLEL = 1` → die Reihenfolge ist `empfangen_at` aufsteigend, deterministisch;
3. Fake verweigert die Verbindung → nach `FILES_AV_VERSUCHE` Versuchen `error` mit Grund
   `ECONNREFUSED …`, und **nicht** früher;
4. **Boot-Wiederaufnahme:** eine Zeile `scanning` mit `av_geprueft_at IS NULL` wird beim Start der
   Warteschlange erneut eingereiht;
5. **keine Rückwege:** `clean` und `infected` werden von keinem Lauf angefasst; `error → scanning`
   passiert **nur** über die Wiederholung; `unscanned` bleibt unberührt.
Rot, weil die Warteschlangenfunktionen fehlen.

**Dateien:** Geändert: `src/app/m/files/_lib/av.ts`, `_lib/av.test.ts`

**Abhängigkeiten:** T11 (Vertrag), T2 (Tabellen), T8 (Zahlen).

**Fertig, wenn:** die fünf Punkte grün · die Warteschlange braucht **keine** zweite Datenstruktur: sie
**ist** die DB.

**Beachten:**
- **5 × 60 s ist keine Kosmetik:** clamd braucht nach einem Neustart eine Größenordnung von zwei
  Minuten bis zur Bereitschaft. Fünf **unmittelbar** folgende Versuche wären nach Sekunden erschöpft
  und ließen jede in diesem Fenster hochgeladene Datei in `error` fallen — fail-closed, also nicht
  herunterladbar, obwohl der Scanner zwei Minuten später da ist. Was danach kommt, ist ein **benannter**
  Zustand mit Wiederholen-Knopf (T45), **kein** automatischer Dauerversuch.
- **Kein globaler Semaphore über den Upload-Weg.** In `drop` umschließt ein einziger Semaphore beide
  Upload-Routen **und** den Virenscan, ohne Wartezeitgrenze; gemessen ist mit hängendem Scanner nach
  1200 ms **keine** von vier Anfragen beantwortet. Weil der Scan hier hinter der Antwort liegt, kann er
  den Upload-Weg nicht mehr stauen.
- Der **Startpunkt** der Warteschlange gehört zu T22 (`_lib/boot.ts`), **nach** den Migrationen. Dieser
  Task exportiert `starteAvArbeiter()` und ruft sie **nicht** selbst — ein Arbeiter ohne Startpunkt ist
  eine Warteschlange, die niemand abarbeitet: Uploads werden quittiert, alles bleibt `scanning`, und
  **kein Test wird rot**.

---

### Task 18: `_ui/VerwaltungsRahmen.tsx`, `_lib/nav.ts`, `_ui/files.css`

**Zusage:** Shell, Modulnavigation und die modulweiten CSS-Variablen liegen an **einer** Stelle mit
zwei Importeuren; die Umschaltung Tabelle/Kartenliste trägt den Präfix-Selektor und schaltet bei
**767.98px**.

**Test zuerst:** `src/app/m/files/_ui/files-css.test.ts` — ein Quelltext-Scan über `_ui/files.css`:
jede `max-width`-Abfrage lautet **`767.98px`** (nicht 768, sonst gelten bei exakt 768px beide Seiten und
die Stylesheet-Reihenfolge entscheidet); **kein** `!important`; jede Regel, die eine `.ant-`-Klasse
überstimmt, trägt eine **vorangestellte** eigene Klasse (`.fi-liste .nurDesktop` = (0,2,0)); die
Erhöhung ist **kommentiert**; `--fi-*`-Variablen werden auf `:root` **und** unter
`:root[data-theme="dark"]` deklariert, und es gibt **keine** `prefers-color-scheme`-Abfrage. Dazu
`_ui/VerwaltungsRahmen.test.tsx`: `nav` hat **drei** Einträge, und der Rahmen rendert ohne
Compound-Zugriff auf antd. Rot, weil die Dateien nicht existieren.

**Dateien:** Neu: `src/app/m/files/_lib/nav.ts`, `_ui/VerwaltungsRahmen.tsx`,
`_ui/VerwaltungsRahmen.test.tsx`, `_ui/files.css`, `_ui/files-css.test.ts`

**Abhängigkeiten:** T2 (Modultitel aus dem Registry).

**Fertig, wenn:** beide Tests grün.

**Beachten:**
- **`_lib/nav.ts` trägt KEIN `"use client"`** — zwei **Server** Components lesen den **Wert**
  (`page.tsx` und `(verwaltung)/layout.tsx`). Läge das Array neben einer Client-Komponente in `_ui/`,
  bekäme die Server Component eine Client-Referenz statt des Wertes, HTTP 500 für die ganze Seite, und
  **weder `pnpm build` noch Vitest finden das** (`docs/design/README.md:87-103`; unter Vitest ist
  `"use client"` ein wirkungsloser String).
- **Drei Einträge, immer alle drei** („Freigaben", „Posteingang", „Abgabelinks"). Es gibt nur **eine**
  Zugriffsstufe, also kann kein Eintrag in ein `notFound()` führen. Die Ein-Eintrag-Regel aus
  `portal/layout.tsx:10-22` greift hier nie — sie ist trotzdem benannt, damit niemand später zwei
  Einträge hinter ein zweites Prädikat legt.
- `size` wird auf Bedienelementen **nicht** gesetzt: `controlHeight: 56` ist die Vorgabe, `size="large"`
  wären 72px. Rot trägt in `files` **keine** fachliche Bedeutung, aber ein roter `Tag` für „infiziert"
  bleibt verboten, weil er auf einer **Datenfläche** steht — AV-Zustände tragen **Text plus Symbol**.
- Dieser Scan besitzt **`files.css`**; alle `*.module.css` und `files-public.css` besitzt T19. Zusammen
  deckt das jede CSS-Datei des Moduls ab (Festlegung C in §1).
- **Der Scan sichert zuerst zu, dass er überhaupt etwas gelesen hat:** die gefundene Dateimenge ist
  **nicht leer** und enthält `_ui/files.css`, und die Zahl der geprüften `max-width`-Abfragen wird
  **ausgegeben**. Ein Scan über null Dateien ist grün, ohne etwas zu belegen — und ein Tippfehler im
  Pfad fällt dann nie auf.

---

### Task 19: `_ui/OeffentlicherRahmen.tsx`, `_ui/files-public.css`, Scan über alle `*.module.css`

**Zusage:** Die öffentlichen Ansichten haben **keine** Shell, **kein** antd und **keinen**
App-Switcher; ihre Anmutung ist eigenständig, ihre Trefferflächen sind 44px und ihre Eingabefelder
nie unter 16px.

**Test zuerst:** `src/app/m/files/_ui/files-public-css.test.ts` — Quelltext-Scan über
`_ui/files-public.css` **und** über **alle** `src/app/m/files/**/*.module.css` (Glob, damit später
entstehende Regeln erfasst sind). **Zuerst die Zusicherung, dass der Scan nicht ins Leere greift:** die
Dateimenge ist **nicht leer**, sie **enthält `_ui/files-public.css`**, und ihre Größe wird ausgegeben.
Der Glob `**/*.module.css` trifft im Moment der Entstehung dieses Tasks **null** Dateien (die ersten
entstehen in Welle 6) — ein Tippfehler darin wäre also für drei Wellen unsichtbar, und die
767.98px-Zusage wäre nicht belegt, sondern nur nicht widerlegt. **Gegenmaßnahme ohne späteren zweiten
Toucher:** beide Globs werden aus **einer** Konstante für das Modulverzeichnis gebildet, und der
`*.module.css`-Glob wird zusätzlich gegen eine im Test angelegte temporäre Datei geprüft — trifft er
sie nicht, ist der Glob falsch, unabhängig davon, wie viele Modul-CSS-Dateien es gerade gibt. **Die
Probedatei liegt zwangsläufig UNTER `src/app/m/files/`** (sonst träfe der Glob sie nicht) und muss
deshalb in einem `afterEach`/`finally` **auch im Fehlerfall** verschwinden — sie heißt erkennbar
`__glob-probe.module.css`, und ein liegen gebliebenes Exemplar würde beim nächsten Lauf von den
**echten** Regeln geprüft und wäre dann ein Fehlschlag ohne Anlass. Dann die
Regeln: `767.98px` in `max-width`; kein `!important`; keine
`prefers-color-scheme`-Abfrage; `input`/`textarea`-Regeln nie unter `16px`; `outline` mit
`outline-offset` und **kein** `outline: none` ohne Ersatz; `@media (prefers-reduced-motion: reduce)`
behandelt. Dazu `_ui/OeffentlicherRahmen.test.tsx`: der Baum enthält **keinen** Import aus `antd` und
**kein** Shell-Element. Rot, weil die Dateien nicht existieren.

**Dateien:** Neu: `src/app/m/files/_ui/OeffentlicherRahmen.tsx`,
`_ui/OeffentlicherRahmen.test.tsx`, `_ui/files-public.css`, `_ui/files-public-css.test.ts`

**Abhängigkeiten:** keine.

**Fertig, wenn:** beide Tests grün · `grep -rn "from \"antd\"" src/app/m/files/_ui/OeffentlicherRahmen.tsx`
findet nichts.

**Beachten:** Die öffentliche Gestaltungsklasse ist in `docs/design/README.md:15-21` festgelegt und
schließt die RSC-Compound-Falle für `/s/<id>` und `/u/<token>` **strukturell** aus. Vorbild für die
Anmutung: `docs/design/feedback-oeffentliche-ansicht.md`. **Zoom ist suiteweit gesperrt, und deshalb
fällt kein Eingabefeld unter 16px** — die beiden Regeln sind eine Einheit
(`app/layout.tsx`, `app/globals.css`, `core/theme/feldschrift.test.ts`).

---

### Task 20: `_lib/aufraeumen.ts` — Löschregeln als reine Funktionen

**Zusage:** Jede Löschregel aus §7.6 ist eine **reine** Funktion, ohne Uhr und ohne Dateisystem
prüfbar; verwaiste Blobs werden **berichtet**, nicht gelöscht.

**Test zuerst:** `src/app/m/files/_lib/aufraeumen.test.ts` — je Regel ein Fall und sein Gegenfall:
1. Share löschbar bei `expires_at < now − FILES_LOESCH_KARENZ_STUNDEN`, **nicht** eine Sekunde vorher;
2. **ein ausgeschöpfter, nicht abgelaufener Share wird NICHT gelöscht** — der Alt-Defekt, den das
   Streichen von `limit_reached_at` behebt;
3. unvollständige Uploads: `bytes_vollstaendig_at IS NULL AND created_at < now − FILES_UPLOAD_VERFALL_STUNDEN`;
4. Audit-Logzeilen nach `FILES_LOG_AUFBEWAHRUNG_TAGE`, **ohne** FK-Cascade (das Log überlebt seinen
   Share — das ist der Zweck);
5. Inbox-Dateien **nur**, wenn `FILES_INBOX_AUFBEWAHRUNG_TAGE` gesetzt ist; nicht gesetzt = **keine
   Frist** (heutiges `drop`-Verhalten);
6. verwaiste Blobs → in der Berichtsliste, **nicht** in der Löschliste;
7. **Trockenlauf:** dieselben Zahlen wie der echte Lauf, Löschliste leer.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/aufraeumen.ts`, `_lib/aufraeumen.test.ts`

**Abhängigkeiten:** T2 (Zeilenformen), T8 (Fristen).

**Fertig, wenn:** alle sieben Punkte grün · keine Funktion in dieser Datei ruft `Date.now()` selbst
oder greift auf das Dateisystem zu.

**Beachten:** **Eine** Löschregel für **alle** Shares — heute ist sie asymmetrisch (abgelaufene ohne
jede Karenz, limit-erreichte mit 24 h, `cleanup/route.ts:26-27`). Damit hat ein Wert **eine**
Bedeutung, und ein Share ist nach Ablauf überhaupt noch verlängerbar. **Preis:** ein ausgeschöpfter
Share belegt Platz bis Ablauf plus Karenz — ausdrücklich gewählt; die Gegenrichtung hat in der Alt-App
Daten gekostet. Punkt 6 ist Absicht: verwaiste Bytes automatisch zu löschen wäre in einem Modul, dessen
Bestand gerade importiert wird, der teuerste denkbare Fehler.

---

### Task 21: `_lib/zip.ts` — Eintragsnamen, Ausschlussregel, `_HINWEIS.txt`

**Zusage:** Gleichnamige Dateien bekommen im Archiv einen Zählsuffix; nicht freigegebene Dateien sind
**nicht** im Archiv **und** stehen mit Grund in einer `_HINWEIS.txt`; der Archivname trägt einen
ASCII-Fallback **und** `filename*=UTF-8''…`.

**Test zuerst:** `src/app/m/files/_lib/zip.test.ts` —
1. `bericht.pdf`, `bericht.pdf`, `bericht.pdf` → `bericht.pdf`, `bericht-1.pdf`, `bericht-2.pdf`;
2. Titel-Entschärfung **1:1** aus `zip/route.ts:125` (`replace(/[^a-zA-Z0-9_-]/g, "_")`), und ein Titel
   aus Leerzeichen ergibt **nicht** `___.zip`, weil der Titel serverseitig getrimmt und auf Nichtleere
   geprüft wurde;
3. Dateien mit `av_status ≠ clean` und mit `bytes_vollstaendig_at IS NULL` sind **nicht** in der
   Eintragsliste und **stehen** in der Hinweisliste mit ihrem Grund;
4. sind **alle** Dateien ausgeschlossen, ist das Ergebnis ein benannter Zustand, kein leeres Archiv;
5. `Content-Disposition` trägt beide Formen; ein Umlauttitel kommt **nicht** als `%C3%9C` beim
   Empfänger an (Alt-Verhalten an allen drei Stellen).
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/_lib/zip.ts`, `_lib/zip.test.ts`

**Abhängigkeiten:** T3 (`archiver` — hier nur für den Typ, das Streaming baut T34), T11
(`istFreigegeben`).

**Fertig, wenn:** alle fünf Punkte grün · diese Datei enthält **keinen** Dateisystemzugriff (sie
entscheidet über Namen und Ausschluss, nicht über Bytes).

**Beachten:** Ein **stilles** Weglassen wäre schlimmer als ein 403 — deshalb die `_HINWEIS.txt`. Die
Abbruchbehandlung der Alt-App (PassThrough, `archive.on("error")`, `req.signal`-Listener, Cleanup im
`finally`) wandert in T34 mit, auch wenn ihr S3-Anlass wegfällt: sie verhindert hier geleckte
**File-Descriptors** statt Sockets.

---

**Disjunktheit Welle 3**

| Task | Schreibmenge |
|---|---|
| T14 | `files/_lib/devAufbau.test.ts`, `.env.example`, `playwright.config.ts` |
| T15 | `files/_db/queries.*` |
| T16 | `files/_db/zaehler.ts`, `_db/gleichzeitigkeit.test.ts` |
| T17 | `files/_lib/av.ts`, `_lib/av.test.ts` |
| T18 | `files/_lib/nav.ts`, `_ui/VerwaltungsRahmen.*`, `_ui/files.css`, `_ui/files-css.test.ts` |
| T19 | `files/_ui/OeffentlicherRahmen.*`, `_ui/files-public.css`, `_ui/files-public-css.test.ts` |
| T20 | `files/_lib/aufraeumen.*` |
| T21 | `files/_lib/zip.*` |

**Schnittmenge: ∅.** **Kein Task nennt eine Abhängigkeit aus dieser Welle** — T14, T15, T16, T17, T18,
T19, T20 und T21 hängen ausschließlich an den Wellen 1 und 2.
`_lib/av.*` ist in Welle 2b von T11 angefasst worden, in Welle 3 nur von T17.
Die beiden CSS-Scans (T18, T19) sind über **disjunkte Globs** definiert: T18 genau `_ui/files.css`,
T19 `_ui/files-public.css` **plus** `**/*.module.css`. Abzurufende Routen: keine.

---

## Welle 4 — Boot-Naht, Rollen-Verteiler, Betriebsartefakte (4 Tasks, alle parallel)

### Task 22: `_lib/boot.ts` und die Naht zu `core/bootstrap.ts`

**Zusage:** Eine fehlende Pflichtzahl, ein einzelner Host, zwei gleiche Hosts und eine unbeschreibbare
Ablage brechen den Start **ab**, sobald das Modul eine Domain hat — und **nur** dann; AV-Arbeiter und
Aufräum-Timer haben einen benannten Startpunkt **nach** den Migrationen.

**Test zuerst:** `src/core/bootstrap.test.ts` erweitert (dritter Block) —
1. `SUITE_HOST_FILES` **leer**, keine `FILES_*`-Variable gesetzt → `assertHostConfig()` wirft
   **nicht** (ein Modul, das niemand erreichen kann, nimmt `portal`, `qr` und `feedback` nicht mit);
2. `SUITE_HOST_FILES` mit **zwei** Hosts, `FILES_MAX_DATEI_BYTES` fehlt → wirft, Meldung nennt Name
   **und** Einheit;
3. `SUITE_HOST_FILES` mit **einem** Host → wirft;
4. mit **zwei gleichen** Hosts → wirft;
5. `DATA_DIR` auf ein nicht beschreibbares Verzeichnis, Hosts gesetzt → wirft (Prüfung 6);
6. **Prüfung 5 greift immer**, auch bei null Hosts — sie liest nur Konfiguration und ist genau dann
   nützlich, wenn jemand die Hostliste gerade ändert.
Rot, weil `filesBootFehler` nicht existiert.

**Dateien:**
- Neu: `src/app/m/files/_lib/boot.ts`
- Geändert: `src/core/bootstrap.ts`, `src/core/bootstrap.test.ts`, `src/instrumentation.ts`

**Abhängigkeiten:** T8 (Zahlen-Prüfungen), T9 (`validateFilesHosts`), T7 (Ablage-Probe), T17
(`starteAvArbeiter`).

**Fertig, wenn:** die sechs Punkte grün · `pnpm vitest run src/core` vollständig grün · `pnpm dev`
startet mit gesetzten Hosts und den Dev-Zahlen aus T14 · `pnpm build` grün.

**Beachten:**
- `src/core/bootstrap.ts` bekommt **genau zwei** Zeilen: `filesBootFehler()` in dieselbe Fehlerliste
  wie `validateHostConfig`/`validateGroupConfig` (`:29-35`) und einen Aufruf von
  `starteFilesHintergrund()` in einer neuen, aus `src/instrumentation.ts` **nach**
  `migrateAllModules()` gerufenen Funktion. Danach ist `bootstrap.ts` nie wieder Gegenstand eines
  Tasks (Festlegung B in §1). Der Präzedenzfall für die Kopplung von Modul-Code an `bootstrap.ts` ist
  belegt: die Datei importiert schon Modul-Schemata und -Seeds (`:7-12`).
- **Warum die Zahlenpflicht bedingt ist und das keine Milderung ist:** `assertHostConfig()` läuft aus
  `src/instrumentation.ts:11` für die **ganze** Suite, **vor** den Migrationen aller Module. Eine
  unbedingte Pflicht hieße: sobald ein Image mit `files` auf dem Server landet, startet die Suite nicht
  mehr, bis die `.env` ergänzt ist — und das Modul blockierte jeden unbeteiligten Deploy im Fenster
  zwischen Merge und Cutover. Der Schalter ist `prodHostsFor(getModule("files")).length > 0`: **dieselbe**
  Variable, die das Modul einschaltet, schaltet seine Zahlenpflicht ein, und es gibt keinen zweiten,
  den jemand vergessen kann.
- **Der Startpunkt ist derselbe wie für alles Einmalige beim Boot** und liegt **nach** den Migrationen,
  weil der Arbeiter Tabellen liest. Der Timer folgt in T46 (zweiter Toucher von `_lib/boot.ts`).
- **Ein Container, ein Timer.** `compose.yaml:1-4` hat kein `deploy:`/`replicas:`. Bei mehreren
  Instanzen liefe der Timer mehrfach und bräuchte ein Lock — das gehört als Kommentar an die
  Registrierung, damit die Voraussetzung sichtbar ist.
- **Was der Boot nicht prüfen kann** (Runbook, Spec 2): die **wirksame** clamd-Kappe (`clamconf -n`),
  die Cloudflare-Grenze (Plan-Eigenschaft, nirgends im Repo) und den konfigurierten Wert von
  `proxyClientMaxBodySize`.

---

### Task 23: Rollen-Verteiler, drei Group-Layouts, Inbox-Wurzel

**Zusage:** `/` zeigt auf dem Verwaltungs-Host die (noch leere) Freigaben-Übersicht **mit** Riegel und
Navigation und auf dem Inbox-Host die öffentliche Abgabe-Hinweisseite; jeder Pfad antwortet auf dem
**fremden** Host mit 404.

**Test zuerst:** `e2e/files-hosts.spec.ts` (neu) — gegen die zwei Hosts aus T14:
1. `GET http://files.localtest.me:3100/` (angemeldet, in der Gruppe) zeigt „Freigaben" **und** die
   dreigliedrige Modulnavigation;
2. `GET http://drop.localtest.me:3100/` zeigt die Abgabe-Hinweisseite, **ohne** Shell und **ohne**
   App-Switcher — zwei **verschiedene** Ansichten unter demselben Pfad;
3. `GET http://drop.localtest.me:3100/shares/neu` → **404**;
4. `GET http://files.localtest.me:3100/u/dz-2345-6789-abcd` → **404**;
5. `GET http://files.localtest.me:3100/` **ohne** Gruppe → 404 (nicht 403);
6. `GET http://files.localtest.me:3100/u` → 404, `GET http://drop.localtest.me:3100/u` → 200.
Rot, weil weder `page.tsx` noch die Layouts existieren — **für die Punkte 1, 2, 5 und 6.**

**Punkte 3 und 4 sind in dieser Welle Abnahme, nicht Zusage** (Kopfregel: Abnahmetests sind von der
TDD-Regel ausgenommen). Sie sind hier grün **aus Abwesenheit**: `/shares/neu` entsteht erst in Welle 6a
(T35), `/u/<token>` erst in Welle 6a (T38) — ein 404 über eine Route, die es nicht gibt, prüft die
Rollensperre nicht. **Tragend werden sie ab Welle 6a**, und die Mutation, die sie dann fangen, ist „die
Rollenzusicherung aus einem `(oeffentlich-*)`- bzw. `(verwaltung)`-Layout entfernen". Bis dahin sind sie
Platzhalter mit richtigem Ergebnis — deshalb steht dieselbe Prüfung in T44 (Welle 8a) noch einmal, dort
über **alle** Endpunkte und mit vorhandenen Routen.

**Dateien:** Neu: `src/app/m/files/page.tsx`, `(verwaltung)/layout.tsx`,
`(oeffentlich-share)/layout.tsx`, `(oeffentlich-inbox)/layout.tsx`, `(oeffentlich-inbox)/u/page.tsx`,
`_ui/InboxStart.tsx`, `_ui/SharesUebersicht.tsx` (Gerüst mit Leerzustand), `e2e/files-hosts.spec.ts`

**Abhängigkeiten:** T9, T10, T18, T19, T14.

**Fertig, wenn:** `pnpm exec playwright test e2e/files-hosts.spec.ts` grün · `pnpm build` grün ·
**und die sechs Adressen aus dem Test in Dev tatsächlich abgerufen** (auf 3000), weil ein
Compound-Zugriff oder ein Wert aus einem Client-Modul HTTP 500 ergibt, das der Build nicht sieht.

**Beachten:**
- **`page.tsx` ist die EINZIGE Datei, die auf `/m/files` auflöst.** Es gibt **keine**
  `(verwaltung)/page.tsx` — beide lösten auf denselben Pfad auf, Route-Groups erscheinen in keinem
  URL-Pfad, und `next build` bricht mit „You cannot have two parallel pages that resolve to the same
  path" ab. Derselbe Grund, warum `feedback` kein `src/app/m/feedback/page.tsx` neben
  `(admin)/page.tsx` hat — gemessen am Repo: die Datei existiert dort nicht.
- **Riegel und Chrome stehen im Verteiler, nicht nur im Layout.** Der Verteiler liegt außerhalb aller
  Route-Groups, also greift `(verwaltung)/layout.tsx` für ihn nicht; hingen Guard und Shell allein dort,
  stünde die Übersicht auf der Modulwurzel **ungegatet** und ohne Navigation. `requireFilesAccess()`
  wird deshalb von **zwei** Stellen gerufen — das ist das erprobte Muster „EINE Stelle, zwei Layouts"
  (`feedback/_lib/requireFeedbackAccess.ts:10,17-23`), dort fiel die Druckansicht heraus, hier die
  Wurzelseite.
- **Drei Groups, nicht zwei.** Ein Layout bekommt `children` und `params`, aber **keinen** pathname —
  eine gemeinsame Group `(oeffentlich)` könnte ihre Rolle nicht „je Pfad" prüfen, und `/s/<id>` gegen
  `/u/<token>` sind **verschiedene** Rollen. Je Layout genau **eine** Rollenzusicherung.
- **Der Verteiler redirected nicht.** Ein Hüpfer auf `/u` bzw. `/shares` ersetzte die Erwartung „die
  Domain-Wurzel zeigt sofort etwas" und wäre auf der Inbox-Domain eine zusätzliche Runde für ein Handy
  im Funkloch. `InboxStart` wird von `/` **und** von `/u` gerendert.
- Die Inbox-Wurzel hat **kein Eingabefeld** für den Token: es gäbe nichts zu prüfen, was der Link nicht
  besser prüft, und ein Feld wäre ein Rateweg.
- `_ui/SharesUebersicht.tsx` entsteht hier als Gerüst mit dem Leerzustand („Noch keine Freigabe
  angelegt" + Knopf) und wird von T36 zur Tabelle ausgebaut.
- **`SharesUebersicht` ist eine `async` Server Component, die ihre Zeilen SELBST über `_db/queries.ts`
  lädt** — `page.tsx` übergibt ihr **nur die Rolle** und sonst nichts. Damit ist festgelegt, wo geladen
  wird, und `page.tsx` bleibt in den Wellen 6b und 8a **unangetastet**: T36 baut die Tabelle aus und T46
  hängt die Ablage-Kachel hinein, beide ohne neue Props durch `page.tsx` zu ziehen. Würde `page.tsx`
  laden, hätte es in jeder dieser Wellen einen zweiten Toucher, und die Disjunktheit von Welle 6b/8a
  hinge an einer Datei, die drei Tasks gehört.

---

### Task 24: `compose.yaml` und `clamd.files.conf` — der Sidecar als Stack-Änderung

**Zusage:** clamd läuft in einem **eigenen internen** Netz, sieht die Modul-Datenbanken **nicht**,
behält seine Signaturen über ein Recreate und kappt Übergrößen als **Fund** statt als `OK` — **und die
beiden tragenden Zeilen auf der Suite-Seite stehen mit: clamd sieht die Blobs, und die Suite erreicht
clamd.**

**Test zuerst:** `src/app/m/files/_lib/compose.test.ts` — Quelltext-Scan über `compose.yaml` und
`clamd.files.conf`:
1. der `clamav`-Service hängt **nur** am Netz `av`, und `av` trägt `internal: true`;
2. `clamav` hat **kein** `ports:`;
3. `files_data` ist im Sidecar mit `:ro` gemountet, `suite_data` **gar nicht**;
4. `clamav_db:/var/lib/clamav` existiert;
5. `suite` hat `depends_on: clamav: condition: service_healthy`;
6. `start_period` und der Image-Tag sind **Variablen mit Vorbelegung** (`:-`), wörtlich
   `${SUITE_CLAMAV_IMAGE:-clamav/clamav:1.4}` und `${SUITE_CLAMAV_START_PERIOD:-120s}` (§6.5) — ohne
   `:-` setzt Compose eine nicht gesetzte Variable auf den **leeren String**, und ein leerer `image:`-Wert
   lässt `docker compose config` scheitern: genau das Kriterium in „Fertig, wenn";
7. `clamd.files.conf` trägt `AlertExceedsMax yes`, und `MaxFileSize` **==** `StreamMaxLength`, mit dem
   Namen `FILES_AV_MAX_BYTES` als Kommentar daneben;
8. **`suite.networks` enthält `proxy` UND `av`** (§6.5-Schnipsel: `networks: [proxy, av]`);
9. **`suite.volumes` enthält `files_data:/data/files`**, und der Sidecar-Mount zeigt auf **dasselbe**
   benannte Volume mit `:ro`.
Rot, weil `clamd.files.conf` nicht existiert und `compose.yaml` einen Service hat.

**Punkte 8 und 9 sind der Unterschied zwischen „grün" und „funktioniert".** Eine `compose.yaml`, die
die Punkte 1–7 erfüllt und diese zwei Zeilen weglässt, ist **grün** — und dann erreicht die Suite clamd
nicht (jeder Scan `ECONNREFUSED` → nach `FILES_AV_VERSUCHE` `error`) bzw. clamd sieht ein leeres
`:ro`-Volume und antwortet auf **jeden** `zSCAN` mit „Can't access file ERROR". Beides ist fail-closed
**in Produktion**, beides sieht wie ein kaputtes Modul aus, und **kein anderes Gate berührt es**, weil
E2E kein Compose benutzt.

**Dateien:** Neu: `clamd.files.conf`, `src/app/m/files/_lib/compose.test.ts` ·
Geändert: `compose.yaml`, **`.env.example`** (zweiter Toucher nach T14, Welle 3: die beiden
`SUITE_CLAMAV_*`-Zeilen mit ihren Vorbelegungen)

**Abhängigkeiten:** T8 (der Name `FILES_AV_MAX_BYTES`). **Vorbedingungen: §13.1 Frage 1** liefert die
Zahl; ohne sie steht in der Datei kein Wert, sondern der Task ist blockiert. **Und §13.1 Frage 4**
(Architektur und freies RAM des Hosts) entscheidet die **Vorbelegung des Image-Tags**: `clamav/clamav:1.4`
hat nur ein `linux/amd64`-Manifest, auf arm64 muss es eine `-debian`-Variante sein, sonst bricht
`docker compose up` mit „no matching manifest" ab — am Zielhost, nicht im Gate.

**Fertig, wenn:** der Scan grün · `docker compose config` läuft fehlerfrei durch.

**Beachten:**
- **`internal: true`, weil clamd unauthentifiziert ist** und im Container auf `0.0.0.0:3310` lauscht: so
  sind die Messungen der Analyse entstanden — ein fremder Container im selben Netz spricht ohne
  Zugangsdaten `zPING`, `zINSTREAM`, `zSCAN`, und `zSCAN` nimmt einen **Pfad im clamav-Container**.
  `drop`s `dropnet` ist übrigens **nicht** `internal: true`; die Abschottung dort entsteht allein daraus,
  dass der Service kein `ports:` hat — auf `proxy` nicht übertragbar, weil das Netz von außen bestückt
  wird.
- **`AlertExceedsMax yes` ist der Grund für die eigene Konfigurationsdatei:** gemessen meldet `zSCAN`
  per Pfad eine Übergröße als **`OK`** („AlertExceedsMax heuristic detection disabled") — wer von
  INSTREAM auf Pfad wechselt, tauscht einen lauten Fehler gegen ein **stilles fail-open**.
- **Die Grenzen werden nicht „angehoben", sondern gleichgesetzt**: `MaxFileSize` und `StreamMaxLength`
  tragen **denselben** Wert wie `FILES_AV_MAX_BYTES`. Damit ist die dritte Zahl der Kette aus §6.6 ein
  **Repo-Artefakt** aus einer Quelle, und `clamconf -n` wird zur **Verifikation** statt zur Quelle.
- **Die Kehrseite von `depends_on` gehört in eine Runbook-Zeile:** wird clamav nicht healthy
  (fehlgeschlagener freshclam-Erststart, zu knappe `start_period`, RAM-Mangel), **startet die Suite gar
  nicht — mit allen vier Modulen**. Deshalb: „kommt die Suite nach `up -d` nicht hoch, ist
  `docker compose ps clamav` der erste Blick, nicht das Suite-Log."
- **Was der eigene Mount NICHT leistet:** zwei benannte Volumes ohne `driver_opts` liegen auf
  **demselben** Host-Dateisystem; ein volles `files_data` erzeugt ENOSPC genau dort, wo auch
  `portal.db`, `qr.db`, `feedback.db` und `files.db` liegen. Getragen wird der Restplatz von der
  Ablage-Kachel (T46), der ENOSPC-Behandlung (T7) und einer **Quota am Blob-Ort** — Letztere ist
  §13.2 Frage 14 und eine Vorbedingung an den Betreiber, keine Codeentscheidung.
- **Runbook-Einträge für Spec 2** (kein Gate kann sie belegen, §11.7): Fragen 16 (kann clamd uid-1001-
  Dateien lesen — entscheidet zwischen `0o640` + gemeinsamer gid und einem `user:` am Service), 17
  (`AlertExceedsMax` wirkt), 18 (`start_period` am Zielhost — **doppelt wichtig wegen `depends_on`**),
  21 (`clamconf -n`), 22 (verschachtelter Mount: `ls -ldn /data/files` + `touch` als uid 1001), 23
  (Scandauer und RSS für die größte zugelassene Datei), sowie §13.1 Frage 4 (Architektur und freies
  RAM: der Tag `clamav/clamav:1.4` hat nur ein `linux/amd64`-Manifest, clamd belegt ~1 GB RSS
  **zusätzlich** zum Node-Prozess).

---

### Task 25: `scripts/backup.sh` — sonst ist das Backup ab jetzt unvollständig und meldet Erfolg

**Zusage:** Das Tarball enthält die Modul-Datenbanken **und** die Blobs, **keine** `*.part`; ein leerer
Blob-Ort bei vorhandenen vollständigen Zeilen **bricht ab** statt Erfolg zu melden.

**Test zuerst:** `src/app/m/files/_lib/backup.test.ts` — Quelltext-Scan über `scripts/backup.sh`:
1. `BLOB_DIR` ist eine **eigene** Variable mit Rückfall `${BLOB_DIR:-$DATA_DIR/files}`;
2. das `rsync -a --exclude='*.part' "$BLOB_DIR/" "$work/files/"` steht **nach** der
   `sqlite3 .backup`-Schleife (`:29-31`) und **vor** dem `tar` (`:33`);
3. das bestehende `tar -czf` und die Rotation sind **unverändert**;
4. die Abbruchprüfung liest die **Kopie** in `$work`, ist auf `-f "$work/files.db"` bedingt und trägt
   `|| echo 0`;
5. `cp -al` kommt **nicht** vor.
Rot, weil das Skript nichts davon enthält.

**Dateien:** Neu: `src/app/m/files/_lib/backup.test.ts` · Geändert: `scripts/backup.sh`

**Abhängigkeiten:** T7 (Pfadschema), T2 (`files.db`, `share_files`).

**Fertig, wenn:** der Scan grün · `bash -n scripts/backup.sh` ohne Syntaxfehler.

**Beachten:**
- **Beide naheliegenden Wege scheitern still.** `tar -rf` an ein **gzip**-Archiv ist unmöglich
  (gemessen: „Cannot append to compressed archive"), und unter `set -euo pipefail` (`:5`) bräche der
  **ganze** Backup-Lauf ab — auch für `portal`, `qr` und `feedback`. Und `$DATA_DIR/files` ist
  host-seitig ein **leerer Mountpunkt**, wenn die Blobs im eigenen Volume `files_data` liegen: das
  `tar` sicherte nichts und meldete Erfolg. Deshalb `rsync` in das Arbeitsverzeichnis **vor** dem einen
  `tar`, und deshalb eine eigene Variable.
- **`rsync` und nicht `cp -al`:** Hardlinks scheitern über eine Dateisystemgrenze, und `BLOB_DIR` liegt
  je nach §13.2 Frage 11 in einem anderen Volume-Root als `$DATA_DIR` — unter `pipefail` wäre das ein
  abgebrochenes Backup **aller** Module.
- **Die Bedingung auf `-f` und das `|| echo 0` sind Pflicht, nicht Vorsicht:** **vor** dem ersten
  files-Deploy gibt es weder die Datei noch die Tabelle, und eine nackte Abfrage unter `pipefail` nähme
  das Backup der anderen drei Module mit.
- **Konsistenz ohne Freeze ist hier zulässig, und der Grund gehört in den Kommentar:** eine Blob-Datei
  entsteht ausschließlich per atomarem `rename` und wird danach **nie** verändert; das `rsync` kann nur
  Dateien **verpassen**, die während des Laufs entstehen — derselbe Vorbehalt wie bei jedem
  inkrementellen Backup.
- **Runbook-Einträge (Spec 2):** „Das Backup enthält die Blobs **und** die DBs, **keine** `*.part`"
  (erstes Tarball öffnen) und §13.2 Frage 12 (`BACKUP_KEEP`, heute 7, multipliziert die Blob-Menge).
  Ein Testlauf des Skripts gegen ein echtes `DATA_DIR` verlangt `sqlite3`, `tar` und `rsync` auf dem
  Läufer und ist deshalb **kein** Gate, sondern genau dieser Runbook-Schritt.

---

**Disjunktheit Welle 4**

| Task | Schreibmenge |
|---|---|
| T22 | `files/_lib/boot.ts`, `core/bootstrap.ts`, `core/bootstrap.test.ts`, `src/instrumentation.ts` |
| T23 | `files/page.tsx`, drei `layout.tsx`, `(oeffentlich-inbox)/u/page.tsx`, `_ui/InboxStart.tsx`, `_ui/SharesUebersicht.tsx`, `e2e/files-hosts.spec.ts` |
| T24 | `compose.yaml`, `clamd.files.conf`, `files/_lib/compose.test.ts` |
| T25 | `scripts/backup.sh`, `files/_lib/backup.test.ts` |

**Schnittmenge: ∅.** **Kein Task nennt eine Abhängigkeit aus dieser Welle** — T22, T23, T24 und T25
hängen ausschließlich an den Wellen 1–3.
`core/bootstrap.ts` war in Welle 1 (T2) dran, `src/instrumentation.ts` in Welle 2b
(T11) — beide hier nur von T22. `.env.example` war in Welle 3 (T14) dran, hier nur von T24.
**Abzurufende Routen (Dev, 3000):** `files.…/`, `drop.…/`, `drop.…/u`, plus die vier 404-Fälle.

---

## Welle 5 — Byte-Wege und Actions (11 Tasks, alle parallel)

Ab hier laufen die Zweige **F** (Fileshare) und **G** (Inbox) getrennt; sie teilen ausschließlich die
Wellen 1–4.

> **Vorbedingung für T28, T33, T51, T34: §13.1 Frage 6 muss beantwortet sein — spätestens vor Welle 2a
> (T13), siehe §0.** Bei „ja/unklar" ist eine Spec-1-Ergänzung für den **zweiten Annahmeweg** auf allen
> drei Byte-Routen (T33, T51, T34) zu schreiben; alle vier Tasks haben dann eine andere Zusage und
> andere Tests. Variante (c) ist heute **nicht** spezifiziert und wird hier deshalb nicht geplant.

### Task 26: F — `anlegenAction` und die Quelltext-Zusicherung über alle Server Actions

**Zusage:** Ein Share entsteht mit getrimmtem, nichtleerem Titel, gedeckeltem Ablauf, `NULL`-Semantik
für „unbegrenzt" und höchstens `FILES_MAX_DATEIEN_PRO_SHARE` gemeldeten Dateien — und **jede** Server
Action des Moduls ruft `requireFilesAccess()`.

**Test zuerst:** `src/app/m/files/(verwaltung)/actions.test.ts` —
1. Titel aus Leerzeichen → Feldfehler, **keine** Zeile;
2. `expiryDays` = `0`, `-1`, `1.5`, `FILES_MAX_ABLAUF_TAGE + 1` → je Ablehnung, **keine** Zeile;
3. `maxDownloads` leer → `NULL`; `maxDownloads = "0"` → **Ablehnung** (nie „0 wird unbegrenzt");
4. **`FILES_MAX_DATEIEN_PRO_SHARE + 1` gemeldete Dateien → Ablehnung, und es entsteht keine einzige
   Zeile** — die Ablehnung liegt **vor** dem ersten `INSERT`;
5. Erfolgsfall: `shares` + n × `share_files` mit `bytes_vollstaendig_at = NULL`,
   `av_status = 'scanning'`, `size = 0`, `mime_type = 'application/octet-stream'`, **und
   `shares.type` abgeleitet: eine gemeldete Datei → `"file"`, zwei → `"folder"`** (kleingeschrieben,
   1:1-Pflicht §4.2 — T2 prüft nur, dass **kein** CHECK die Werte erzwingt; die **setzende** Seite ist
   diese hier, und ohne sie wäre der Wert nirgends belegt). **Wo `type` NICHT neu gerechnet wird und
   warum:** `bearbeitenAction` (T37) kann die Dateizahl nicht ändern — sie steht mit dem Anlegen fest —,
   also lässt sie `type` unangetastet. Die **einzige** Stelle, an der die Zahl danach noch sinkt, ist der
   Abbruch `DELETE /api/upload/<fileId>` (T27 Punkt 8), und **dort** wird `type` mit derselben Regel neu
   abgeleitet; sonst zeigte ein Share nach einem abgebrochenen zweiten Upload dauerhaft „Ordner" bei
   einer Datei;
6. `created_by` = `session.user.id` (OIDC-`sub`) `?? "unbekannt"`;
7. **die Quelltext-Zusicherung:** jede exportierte Funktion in jeder Datei unter
   `src/app/m/files/**`, die `"use server"` **in den ersten Zeilen oder in einem Funktionsrumpf**
   trägt, enthält in ihrem Rumpf `requireFilesAccess`; **und die Zahl der gefundenen Dateien wird
   ausgegeben und gegen einen Mindestwert geprüft** (in Welle 5: zwei — `(verwaltung)/actions.ts` und
   `(verwaltung)/zugangslinks/actions.ts`).
Rot, weil `actions.ts` nicht existiert.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/actions.ts`, `(verwaltung)/actions.test.ts`

**Abhängigkeiten:** T2, T8, T10, T15.

**Fertig, wenn:** alle sieben Punkte grün.

**Beachten:**
- **Punkt 7 ist der Preis der Festlegung A** (mehrere `"use server"`-Dateien) und gleichzeitig ihr
  Gewinn: die Zusicherung ist **stärker** als das, was die Spec verlangt. Eine Seiten-Prüfung erstreckt
  sich **nicht** auf die Actions darunter (mitgelieferte Next-Doku, `data-security.md:282,329`); in der
  Alt-App fehlte `auth()` in **allen drei** Actions (`dashboard/actions.ts`).
- **Zwei Lücken dieses Scans sind ausdrücklich geschlossen, weil sie ihn wertlos machen würden.**
  (a) `"use server"` **nur in Zeile 1** zu suchen lässt jede Datei mit vorangestelltem Kommentar und
  jede **funktionslokale** Direktive in einer Komponente durchrutschen — beides ist gültiges Next und
  beides ergibt eine erreichbare Action. Deshalb: erste Zeilen **oder** Funktionsrumpf.
  (b) Ein Scan über **null** Dateien ist grün; deshalb wird die gefundene Zahl ausgegeben und gegen
  einen Mindestwert geprüft. Ein Glob-Tippfehler ist damit ein Fehlschlag, keine stille Zusage.
- **Punkt 4 ist neu gegenüber beiden Alt-Apps.** Die Dateiliste kommt vom Client; ein Aufruf mit 50.000
  gemeldeten Dateien legte 50.000 Zeilen an, ohne dass ein Byte fließt, und der Aufräum-Timer holt sie
  erst nach `FILES_UPLOAD_VERFALL_STUNDEN`. `drop` hatte `files: 25`/`parts: 60`, der **Verwaltungs**weg
  hatte keine Grenze.
- **Punkt 2 gilt bei JEDEM Speichern**, nicht nur beim Anlegen: `updateShare` schreibt heute
  `now + expiryDays*86400` ohne Deckelung, und das Formular initialisiert `expiryDays` mit
  `useState(1)` → wer nur den Titel korrigiert, verkürzt den Share auf 24 h.
- `id` ist `nanoid(10)` über das 64-Zeichen-`urlAlphabet` (enthält `-` und `_`, **case-sensitive**) —
  1:1-Pflicht; ein Validator `/^[a-z0-9]+$/` gäbe für ~jeden 32. Zeichenplatz ein stilles 404.
- Nutzlast ist reiner Text; die 1-MB-Grenze für Server Actions ist unerreichbar.

---

### Task 27: F — `PUT`/`GET`/`DELETE /api/upload/[fileId]` (Chunk, Fortschritt, Abbruch)

**Zusage:** Der Zielpfad kommt **aus der Datenbank**, nie vom Browser; `?ab=` ist ein **Byte-Offset**,
der genau der Länge der Zwischendatei entsprechen muss; der letzte Chunk stellt den MIME-Typ fest,
benennt atomar um, setzt `size`/`bytes_vollstaendig_at`, summiert `total_size` neu und reiht den Scan
ein; **ein `DELETE` bricht ab: Zwischendatei weg, unvollständige Zeile weg.**

**Test zuerst:** `src/app/m/files/api/upload/[fileId]/route.test.ts` —
1. ohne Zugang → `notFound()`-Verhalten bzw. 404, **kein** 403;
2. `ab` ≠ aktuelle Länge → **409** mit dem erwarteten Offset im Body;
3. zwei Chunks hintereinander ergeben die vollständige Datei; `GET` liefert nach dem ersten genau
   dessen Bytezahl (**der Zustand ist die Länge der Zwischendatei** — kein zweiter Mechanismus);
4. Überschreitung von `FILES_MAX_DATEI_BYTES` beim **Zählen** → **413** mit Grenze und Einheit,
   Zwischendatei gelöscht;
5. letzter Chunk mit `?ende=1`: Magic-Byte-Prüfung, Umbenennung, `size` = **gemessene** Bytezahl,
   `mime_type` = **festgestellter** Typ, `bytes_vollstaendig_at` gesetzt, `total_size` neu summiert,
   `av_status` bleibt `scanning` und die Zeile ist eingereiht;
6. Inhalt, der die MIME-Prüfung nicht passiert → Ablehnung **und** gelöschte Zwischendatei, Zeile
   bleibt unvollständig;
7. Rollensperre: `rolleOderNull(headers) !== "verwaltung"` → **404** (nicht `notFound()`, der Handler
   baut seine Antwort selbst) — **für alle drei Methoden**;
8. **`DELETE`:** löscht die `.part`-Zwischendatei über `loesche` **und** die unvollständige
   `share_files`-Zeile, antwortet 204; `requireFilesAccess()` und Rollensperre gelten; eine **fremde
   oder unbekannte** `fileId` → **404**; eine Zeile mit gesetztem `bytes_vollstaendig_at` wird
   **nicht** gelöscht (der Abbruch ist kein Löschweg für fertige Dateien — der heißt
   `shareLoeschenAction`, T37) → benannter Fehler; ein zweites `DELETE` auf dieselbe ID ist **still**
   204 (idempotent, weil der Browser bei einem Abbruch während des Verbindungsverlusts wiederholt);
   **und `shares.type` wird nach dem Löschen der Zeile neu abgeleitet** (eine verbleibende Datei →
   `"file"`, mehrere → `"folder"`, T26 Punkt 5 — dieselbe Regel, nicht eine zweite);
9. **der AV-Grenzfall aus §6.6:** eine Datei **oberhalb** von `FILES_AV_MAX_BYTES` wird **abgelehnt**,
   mit der benannten Meldung „Datei zu groß für die Virenprüfung" — **nicht** angenommen und dauerhaft
   `unscanned` gesetzt;
10. **die Fehlerabbildung aus §5.4:** `KeinPlatz` aus `_lib/storage.ts` → **507** mit gelöschter
    Zwischendatei, `AblageNichtSchreibbar` → **500** und laute Logzeile.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/upload/[fileId]/route.ts`, `route.test.ts`

**Abhängigkeiten:** T2, T7, T8, T9, T10, T12, T17.

**Fertig, wenn:** alle zehn Punkte grün.

**Beachten:**
- **Was hier strukturell verschwindet:** der Zielschlüssel kommt nicht mehr vom Browser. In der Alt-App
  nimmt `/api/upload/chunk` ihn als freien Request-Header und gibt ihn ungeprüft weiter
  (`chunk/route.ts:11,23`), `complete` liest ihn aus dem JSON-Body (`complete/route.ts:12,25`) — kein
  Abgleich, keine Präfix-Prüfung. Auf einem Dateisystem heißt das „schreibe an jede Stelle, die der
  Prozess erreicht" (Analyse Falle 28). Ebenso weg: `uploadId`, `ETag`, `PartNumber` und
  `abortMultipartUpload` (das ohnehin keinen Aufrufer hatte).
- **Ein Byte-Offset, keine Chunk-Nummer.** Eine Nummer stimmt nur, solange jeder Chunk außer dem
  letzten exakt `FILES_CHUNK_BYTES` groß ist — eine unausgesprochene Invariante, die der erste
  abweichende Client still bricht.
- **Der Abbruchweg ist Festlegung G in §1** und dort begründet (kurz: `.part`-Lebenszyklus,
  Rollensperre und 404-Regel liegen schon in diesem Handler; der Aufruf kommt **mitten im Upload** aus
  der Client-Schleife, wo ein Server-Action-Umlauf mit Revalidierung falsch wäre). Die verworfene
  Alternative `uploadAbbrechenAction` steht dort mit ihrem einzigen Vorteil. **Ripple:** T35 ruft
  `DELETE`, T44 schleift es als eigene Methode mit (elf Rollensperren, §1), §10.2 bekommt die Zeile.
- **Punkt 9 ist der Zweig, den die Boot-Prüfung im Normalbetrieb unerreichbar macht — und genau deshalb
  existiert er.** Prüfung 3 aus §9.4 erzwingt `FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES`, also greift
  Punkt 4 (413) vorher. Fällt die Boot-Prüfung eines Tages weg oder wird `FILES_AV_MAX_BYTES` zur
  Laufzeit gesenkt, ist dies die **zweite** Linie: eine benannte Ablehnung statt einer Datei, die
  dauerhaft nicht scanbar und damit fail-closed nicht ladbar ist.
- **Die Route liegt unter `src/app/m/files/api/…`, nicht unter `src/app/api/…`.** Beide Orte sind
  gültige Next-Routen und bauen fehlerfrei; am falschen Ort zielt der Host-Rewrite (`/<pfad>` →
  `/m/files/<pfad>`, `routing.ts:78-79`) auf einen Pfad, an dem nichts liegt — 404 auf jedem
  Upload-Versuch (Analyse Falle 16). Und **kein** Modul-Endpunkt unter `/api/health/*` oder `/login*`:
  `PASSTHROUGH` wird als erstes geprüft (`routing.ts:12,50-52`), eine Route darunter wäre tot — kein
  Fehler, kein Log.

---

### Task 28: F — `POST /api/s/[id]/verify` (Cookie, Rate-Limit, geschlossenes Orakel)

**Zusage:** Ein richtiges Passwort setzt ein signiertes, **share-gebundenes** HttpOnly-Cookie; ein
falsches, ein unbekannter Share und ein passwortfreier Share antworten **ununterscheidbar** 401; der
11. Versuch in 10 Minuten antwortet 429 **ohne** bcrypt-Aufruf.

**Test zuerst:** `src/app/m/files/api/s/[id]/verify/route.test.ts` —
1. richtiges Passwort → 200 **und** `Set-Cookie` mit `HttpOnly`, `SameSite=Lax`, `Path=/`,
   `Max-Age ≤ 4 h` und `≤` Restlaufzeit des Shares;
2. falsches Passwort → 401, **kein** Cookie;
3. **unbekannte ID → 401**, passwortfreier Share → **401** — dreimal dieselbe Antwort, keine
   Existenzaussage;
4. 11 Versuche auf denselben `${shareId}|${ip}` mit injizierter Uhr → der 11. ist **429**, und der
   bcrypt-Zähler steht bei 10 (der Limiter greift **vor** dem Hash);
5. das Cookie eines **anderen** Shares gilt hier nicht;
6. Rollensperre → 404 auf dem Inbox-Host.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/s/[id]/verify/route.ts`, `route.test.ts`

**Abhängigkeiten:** T1 (`RateLimiter`, `clientIpAus`), T13, T15, T9. **Vorbedingung: §13.1 Frage 6.**

**Fertig, wenn:** alle sechs Punkte grün.

**Beachten:**
- **Heute ist der Schutz Dekoration:** `verify` prüft korrekt gegen bcrypt und antwortet dann
  `{ ok: true }` (`verify/route.ts:29`) — kein Cookie, kein Token; der Client merkt sich das in
  React-State; und die drei Endpunkte, die Bytes ausliefern, lesen `passwordHash` **nirgends**. Wer die
  Share-ID kennt — sie steht in seiner eigenen URL — lädt ohne Passwort.
- **Punkt 4 ist mehr als Höflichkeit:** `verify` ist heute unbegrenzt aufrufbar und der einzige Ort, an
  dem pro Anfrage bcrypt mit cost 12 gerechnet wird — ein Rechenlast-Verstärker mit einer Zeichenfolge
  als Eintrittskarte.
- **Punkt 3 schließt ein Orakel:** heute antwortet `verify` 404 für „existiert nicht" **und** „existiert
  ohne Passwort".
- `verify` prüft **weder** Ablauf **noch** Limit und zählt **nichts** hoch — die Prüfkette liegt in
  `_db/queries.ts` (T15), das Inkrement ausschließlich in `download` und `zip` (T33, T34).

---

### Task 29: QR-Routen beider Rollen

**Zusage:** Beide PNG-Routen tragen die Nutzlast aus `oeffentlicheUrl(<rolle>, …)` — **Host aus der
Rolle**, nicht aus dem Request — mit geklemmtem `?w=`, und die Inbox-Route ist **gegatet**.

**Test zuerst:** `src/app/m/files/api/s/[id]/qr.png/route.test.ts` und
`api/u/[token]/qr.png/route.test.ts` —
1. die Nutzlast des Share-QR trägt den **Verwaltungs**-Host, auch wenn der Request vom Inbox-Host kommt;
2. die Nutzlast des Inbox-QR trägt den **Inbox**-Host, auch wenn der Request vom Verwaltungs-Host kommt;
3. `?w=100000` wird auf 2048 geklemmt, `?w=` fehlt → 512, `?w=abc` → 512;
4. `Content-Type: image/png` und ein dekodierbares PNG;
5. `/api/u/<token>/qr.png` **ohne** Zugang → 404 (die Route wäre sonst ein Orakel „existiert dieses
   Token?");
6. Rollensperre je Route → 404 auf dem fremden Host.
Rot, weil die Routen nicht existieren.

**Dateien:** Neu: `src/app/m/files/api/s/[id]/qr.png/route.ts` + Test,
`api/u/[token]/qr.png/route.ts` + Test

**Abhängigkeiten:** T9, T10, T5 (nur die **Normalisierung**). **Die Inbox-Route löst das Token NICHT
auf** — sie normalisiert es, baut die Nutzlast und verlässt sich auf `requireFilesAccess()`. Eine
Existenzprüfung wäre genau das Orakel „existiert dieses Token?“, das der Riegel verhindern soll
(§8.7); deshalb braucht dieser Task **kein** T2 und **keine** Tabellenabfrage.

**Fertig, wenn:** alle sechs Punkte grün · beide Routen benutzen `qrPng` aus `src/core/qr`.

**Beachten:**
- **`assertQrCapacity` ist NICHT exportiert.** `src/core/qr/index.ts` exportiert `QR_MAX_LENGTH`,
  `exceedsQrCapacity`, `QR_OPTIONS`, `qrSvg`, `qrPng`; die Prüfung passiert **innerhalb** von `qrPng`
  und **wirft**. §7.9 beschreibt damit das Verhalten richtig, aber der Name ist nicht importierbar —
  wer ihn sucht, sucht umsonst. Für Share- und Inbox-URLs ist die Grenze unerreichbar (36–42 Zeichen
  gegen 1273 Byte), also wird der Wurf **nicht** abgefangen: er ist die richtige Antwort auf einen
  Programmierfehler.
- **Die eine verbindliche Konfiguration** kommt aus `QR_OPTIONS` (`errorCorrectionLevel: "H"`,
  `margin: 4`, Schwarz auf Weiß, `core/qr/index.ts:24-28`). **Neu erzeugte Codes sehen anders aus als
  die alten:** `L`/`M` ergaben Version 3 mit 29×29 Modulen, `H` ergibt Version 5 mit 37×37 — bei
  gleicher Druckgröße wird jedes Modul kleiner, die Robustheit steigt, der **Inhalt** bleibt gleich und
  Bestandsdrucke bleiben gültig. Ob die Druckgröße der Aushänge mitwachsen muss, ist §13.2 Frage 10.
- Das Klemmen ist 1:1 die Bauform aus `feedback/f/[slugSecret]/qr.png/route.ts:26-31`: die Route ist
  öffentlich und `cache-control: public` schlüsselt auf die **ganze URL** — ein ungeprüftes
  `?w=100000` wäre Rechenlast- **und** Cache-Verstärkung.
- **Der ganze Punkt von Punkt 1 und 2:** ein auf der Inbox-Domain erzeugter Share-QR trüge sonst
  `drop.iuk-ue.de`, funktionierte **sofort**, sähe richtig aus und würde beim Abschalten eines Hosts
  ungültig — auf Papier, das dann längst verteilt ist. **Gedruckt ist gedruckt.**

---

### Task 30: G — `zugangslinks/actions.ts`: anlegen, Kontingent aufstocken, widerrufen

**Zusage:** Ein Abgabelink entsteht mit 1–72 **ganzen** Stunden Laufzeit, Budget und `token_start` im
Klartext; der Rohtoken wird **einmal** zurückgegeben und **nie** gespeichert; Widerrufen setzt
`revoked_at` und löscht die Zeile **nicht**; das Kontingent ist nachträglich erhöhbar.

**Test zuerst:** `src/app/m/files/(verwaltung)/zugangslinks/actions.test.ts` —
1. Laufzeit `0`, `73`, `1.5` → Ablehnung; `1` und `72` → Annahme;
2. der Rückgabewert enthält den **vollen** Token **einmal**; in der DB steht nur `token_hash` und
   `token_start` (die ersten 8 Zeichen), und `grep` über die Zeile findet den Rest **nicht**;
3. `token_hash` ist `UNIQUE` — ein zweiter Eintrag mit demselben Hash schlägt fehl;
4. `kontingentAufstockenAction` erhöht `budget_dateien`/`budget_bytes` **derselben** Zeile und ist auf
   gültige, nicht widerrufene Links beschränkt;
5. `zugangslinkWiderrufenAction` setzt `revoked_at`, die Zeile bleibt, und `token_id`-Bezüge der
   Uploads bleiben erhalten;
6. ohne Zugang → alle drei Actions abweisend.
Rot, weil die Datei nicht existiert.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/zugangslinks/actions.ts`, `actions.test.ts`

**Abhängigkeiten:** T2, T5, T8, T10.

**Fertig, wenn:** alle sechs Punkte grün · die Quelltext-Zusicherung aus T26 (Punkt 7) erfasst auch
diese Datei.

**Beachten:**
- **Das Kontingent MUSS aufstockbar sein, und das ist Teil der Entscheidung, kein Komfort.** Der
  Abgabelink ist **gedruckt**, und der Rohtoken existiert danach nirgends. Ein mitten im Einsatz
  erschöpftes `budget_dateien` wäre ohne diesen Weg keine Grenze, sondern eine **Sackgasse**: neuer
  Link, neuer Ausdruck, neu verteilen.
- **Widerrufen statt Löschen:** `drop` löscht die Zeile — es gibt dort keine Historie zum Importieren,
  obwohl die Plugin-Spalte `enabled` existiert und beim Verify geprüft wird.
- Die 72 Stunden sind 1:1 (an zwei unabhängigen Stellen der Alt-App korrekt erzwungen); sie zu erhöhen
  ist §13.2 Frage 9 — eine Beauftragung, nicht eine Nebenwirkung des Ports.
- **Erbe für Spec 2:** das better-auth-`apikey`-Schema wird **nicht** nachgebaut; Voraussetzung ist der
  72-Stunden-Token-Freeze zum Cutover-Termin, nach dem kein Alt-Token mehr gültig ist.

---

### Task 31: G — `PUT /api/u/[token]/upload`, Teil 1: Guard, Chunk-Weg, MIME, Zeile

**Zusage:** Eine anonyme Abgabe ist **sofort** quittiert; der Zugangs-Guard steht **vor** allem anderen,
und ein Fremder ohne Zugangsdaten kann den nächsten **gültigen** Melder nicht aussperren.

**Test zuerst:** `src/app/m/files/api/u/[token]/upload/route.test.ts` —
1. Reihenfolge: **Zugangs-Guard zuerst** — ungültiges/abgelaufenes/widerrufenes Token → 401 **und**
   Fehlversuchszähler; fünf 401 **ohne** gültiges Token sperren die **nächste** gültige Abgabe
   **nicht**;
2. der Chunk-Weg wie in T27 (`?ab=` als Byte-Offset, 409 mit erwartetem Offset, `?ende=1` benennt um),
   **ohne** eigene zweite Bauform;
3. Überschreitung von `FILES_MAX_DATEI_BYTES` beim **Zählen** → **413** mit Grenze und Einheit,
   Zwischendatei gelöscht; oberhalb von `FILES_AV_MAX_BYTES` → Ablehnung mit „Datei zu groß für die
   Virenprüfung" (§6.6, dieselbe zweite Linie wie T27 Punkt 9);
4. Erfolgsfall: eine Zeile in `inbox_files` mit `av_status = 'scanning'`, `client_ip_unbestaetigt`
   **durch `ipKuerzen`**, `kategorie` gegen die Liste validiert, `hinweis` ≤ 500 **Code Points**,
   `mime_type` = **festgestellter** Typ, `token_id` gesetzt, `empfangen_at` in Sekunden — **und
   `dateiname` als Anzeigename**: Umlaute, Leerzeichen und Groß-/Kleinschreibung bleiben **erhalten**,
   entfernt werden nur Steuerzeichen und Pfadtrenner (`\0`, `\n`, `\r`, `/`, `\`), **kein**
   Transliterieren, **kein** verlustbehaftetes Sanitizing (§4.6, §12: `Übung_Größe.pdf` darf **nicht**
   mehr zu `ubung_groe.pdf` werden — der Name steckt in keinem Pfad mehr, also braucht er es nicht);
5. die Fehlerabbildung aus §5.4: `KeinPlatz` → **507** mit gelöschter Zwischendatei,
   `AblageNichtSchreibbar` → **500** und laute Logzeile;
6. Rollensperre → 404 auf dem **Verwaltungs**-Host.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/u/[token]/upload/route.ts`, `route.test.ts`

**Abhängigkeiten:** T2, T4, T5, T6, T7, T8, T9, T12, T17, T1.

**Fertig, wenn:** alle sechs Punkte grün.

**Beachten:**
- **Die Teilung in T31 und T50 ist Reviewbarkeit, keine Bequemlichkeit.** In einem Stück trug dieser
  Task sieben Zusagen und **elf** Abhängigkeiten — kein Umsetzer und kein Review erfasst das in einem
  Durchgang. T50 (Welle 6a) hängt an T31 und ergänzt Budget, Wettlauf-Rückabwicklung, IP-Notbremse und
  den POST-Altweg **in derselben Datei**, eine Welle später (§2 führt die Datei mit beiden Tasks).
- **Punkt 1 ist die Umkehrung eines gemessenen Ausfalls:** in `drop` zählt der `onRequest`-Hook **vor**
  jedem preHandler-Guard hoch — gemessen sperren fünf Uploads **ohne** Session den nächsten Upload
  **mit** gültiger Session. Ein Fremder ohne jede Zugangsdaten kann das Postfach lahmlegen.
- **Der Schlüssel ist das Token, nicht die IP** (E8 d), und der Grund steht in der eigenen Suite: im
  Modul `feedback` hat ein einziger IP-Limiter mit 10/min den Kernfall getötet — **15 Ehrenamtliche
  scannen um 21:30 aus einem Vereins-WLAN, teilen also eine NAT-IP, und ab der 11. Abgabe kam „Zu viele
  Anfragen"** (`feedback/actions.ts:99-109`). Der IP-Zähler zählt hier nur **Fehlversuche**.
- **Ein Hinweis und eine Kategorie gelten für den ganzen Vorgang.** In `drop` sind sie
  **positionsgebunden**: gemessen landet eine Datei ohne Notiz im Wurzelverzeichnis, wenn die Felder
  **nach** ihr kommen (Analyse Falle 24).
- **Kein Token im Log.** `drop` läuft mit `logger: true`, und die `incoming request`-Zeilen enthalten
  die vollständige URL mit Token. Wo `files` selbst loggt, erscheint höchstens `token_start`.
- **Kein 207 Multi-Status:** eine Datei = eine Anfrage = ein Ergebnis, und der letzte Chunk antwortet
  erst, wenn die Zeile steht. Heute kann ein Upload erfolgreich sein, obwohl der Status nicht 200 ist,
  und umgekehrt 207 mit leerer `uploaded`-Liste kommen, während die Datei liegt — der Client verlangt
  `uploaded.length > 0`, zeigt „Upload abgelehnt", der Melder lädt erneut hoch und erzeugt eine
  **Dublette**.

---

### Task 32: G — `GET /api/inbox/[id]` (gegateter Posteingang-Download)

**Zusage:** Eine Inbox-Datei ist **nur** mit Zugang und **nur** ab `clean` herunterladbar, immer als
`attachment` mit `nosniff`, und ein fehlender `mime_type` (Altbestand) wird
`application/octet-stream` — nicht geraten.

**Test zuerst:** `src/app/m/files/api/inbox/[id]/route.test.ts` —
1. ohne Zugang → 404;
2. `av_status` `scanning`/`error`/`infected`/`unscanned` → **403** mit benanntem Zustand;
3. `clean` → 200, `Content-Disposition: attachment` mit ASCII-Fallback **und**
   `filename*=UTF-8''…`, `X-Content-Type-Options: nosniff`, `Content-Length` aus der **gemessenen**
   Größe;
4. `mime_type IS NULL` → `application/octet-stream`;
5. Blob fehlt → **404**, nicht 500;
6. Rollensperre → 404 auf dem Inbox-Host.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/inbox/[id]/route.ts`, `route.test.ts`

**Abhängigkeiten:** T2, T7, T9, T10, T11 (`istFreigegeben`).

**Fertig, wenn:** alle sechs Punkte grün.

**Beachten:** Punkt 5 ist eine Verhaltensänderung gegenüber der Alt-App, die dort 500 liefert — eine
fehlende Datei ist ein belegter **Regel**zustand (Waisen in beide Richtungen, Analyse Falle 9). Kein
Rateweg über die ID: sie ist `nanoid(10)` und die Route ist gegatet. `drop` hatte **keinen** Endpunkt,
der Uploads listet oder ausliefert (`fastifyStatic` wurzelt auf `web/dist`) — das hier ist Neubau, keine
Portierung.

---

### Task 33: F — `GET /api/download/[id]` (eine Datei)

**Zusage:** Der Weg läuft durch die **eine** Prüfkette; der Zähler läuft als **letzter** Schritt vor dem
ersten Byte; ein 401 und ein 403 erhöhen `download_count` **nicht**; jeder Erfolg schreibt **genau eine**
Audit-Zeile.

**Test zuerst:** `src/app/m/files/api/download/[id]/route.test.ts` —
1. abgelaufen / Limit erreicht → **410**; AV nicht `clean` → **403**; Passwort fehlt/falsch → **401**;
   Blob fehlt → **404**;
2. **ein 401 und ein 403 erhöhen `download_count` nicht** — geprüft über den Spaltenwert vor und nach
   dem Aufruf;
3. Erfolgsfall: `Content-Type` aus `mime_type` (nie geraten, nie aus einer Storage-Angabe),
   `Content-Disposition: attachment` **immer**, beide `filename`-Formen, `nosniff`, `Content-Length`
   aus der gemessenen Größe; weicht die tatsächliche Größe von `size` ab, wird die **tatsächliche**
   ausgeliefert und die Abweichung geloggt;
4. **kein `Accept-Ranges`, kein 206** — bewusst nicht ergänzt;
5. **der Parametervertrag:** `[id]` ist die **`shareId`**, `?file=<fileId>` wählt die Datei. Fehlt
   `?file=` bei **mehr als einer** Datei → **benannter Fehler (400)**, ausdrücklich **nicht** „die
   erste"; bei genau einer Datei ist `?file=` optional; eine `fileId` aus einem **fremden** Share → 404
   über die Zusammengehörigkeitsprüfung aus T15 Punkt 3 (die genau an diesem Vertrag hängt);
6. **der Erfolgsfall schreibt genau eine `download_logs`-Zeile** über `protokolliereDownload` (T16),
   mit `file_id = <fileId>` und `client_ip_unbestaetigt` aus `ipKuerzen(clientIpAus(headers))`; ein 401
   und ein 403 schreiben **keine**;
7. Rollensperre → 404 auf dem Inbox-Host.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/download/[id]/route.ts` + Test

**Abhängigkeiten:** T7, T9, T13, T15, T16, **T4** (`ipKuerzen` über T16), **T1** (`clientIpAus`).
**Vorbedingung: §13.1 Frage 6.**

**Fertig, wenn:** alle sieben Punkte grün.

**Beachten:**
- **Punkt 2 ist die Zusage, die das serverseitige Gate erst schützend macht.** Liefe das Inkrement vor
  der Cookie-Prüfung, wäre ein Share mit `max_downloads = 3` mit **drei fremden GETs** tot. §11.2 weist
  dieser Zeile die Ebene **„Handler-Test + E2E"** zu; die E2E-Hälfte liegt in T40 (`download_count` vor
  und nach einem 401 **und** einem 403 über echte Requests).
- **Punkt 6 ist die einzige Schreibstelle des Audit-Logs neben T34** — ohne sie rendert T41 eine Ansicht
  über eine leere Tabelle und ist grün (§4.5, Begründung in T16).
- Alt setzt `contentType ?? "application/octet-stream"` **ohne** DB-Fallback, und beim Upload wurde
  `ContentType` nie gesetzt; die Vorschau prüfte den DB-Wert und lieferte den Storage-Wert im Header —
  eine Route, **zwei** Quellen für denselben Wert.
- **Kein Range-Support** (verworfen in §12): neue Funktionalität, kollidiert mit dem atomaren Zähler
  (drei Range-Anfragen = drei Downloads), niemand hat sie beauftragt.

---

### Task 51: F — `GET /api/preview/[id]` (Inline-Vorschau)

**Zusage:** Die Vorschau läuft durch **dieselbe** Prüfkette wie der Download, zählt **nicht** und loggt
**nicht**; `image/svg+xml` ist **nicht** inline-fähig; oberhalb der Grenze wird **abgelehnt**, nicht
halb geliefert.

**Test zuerst:** `src/app/m/files/api/preview/[id]/route.test.ts` —
1. Prüfkette wie T33: abgelaufen / Limit erreicht → 410; AV nicht `clean` → 403; Passwort fehlt/falsch
   → 401; Blob fehlt → 404; derselbe Parametervertrag (`[id]` = `shareId`, `?file=<fileId>`, fehlender
   `?file=` bei mehreren Dateien → 400);
2. Typ-Allowlist gegen den **festgestellten** `mime_type` **aus der DB**, nie aus einer Storage-Angabe;
3. **`image/svg+xml` wird abgelehnt**;
4. jede Antwort trägt `nosniff` **und** `Content-Security-Policy: sandbox`;
5. `FILES_VORSCHAU_MAX_BYTES` gilt für **alle** Vorschauen: **Text** wird serverseitig gekappt und mit
   „gekürzt angezeigt" ausgeliefert, **alles andere** oberhalb der Grenze bekommt **keine** Vorschau
   (benannter Zustand, den T40 in der Oberfläche zeigt: „Zu groß für die Vorschau" plus Download-Knopf);
6. **die Vorschau zählt nicht und wird nicht geloggt** — `download_count` und `download_logs` sind vor
   und nach dem Aufruf identisch;
7. Rollensperre → 404 auf dem Inbox-Host.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/preview/[id]/route.ts` + Test

**Abhängigkeiten:** T7, T9, T13, T15. **Vorbedingung: §13.1 Frage 6.**

**Fertig, wenn:** alle sieben Punkte grün.

**Beachten:**
- **Die Teilung von T33 ist Reviewbarkeit:** zwei Handler mit acht Zusagen in einem Task, davon die
  komplette Vorschau-Regelung (Allowlist, SVG-Ablehnung, CSP sandbox, Textkappung gegen Ablehnung), sind
  in einem Durchgang nicht erfassbar. Geteilt bleibt die Disjunktheit trivial: getrennte Verzeichnisse
  (`api/download/[id]/` gegen `api/preview/[id]/`). Geteilt wird **nur** die Prüfkette, und die liegt
  ohnehin in `_db/queries.ts` (T15) — genau **eine** Stelle, wie §7.4 verlangt.
- **`image/svg+xml` ist ein ausführbares Dokument im Origin der Fileshare-Domain**; heute steht es in
  `PREVIEWABLE_TYPES` und wird `inline` ausgeliefert, ohne `nosniff` und ohne CSP. Der **Download**
  bleibt möglich. Der Radius hängt am Cookie-Scope (beide Hosts unter `.iuk-ue.de`), die **Maßnahme**
  hängt nicht daran.
- **Punkt 5 hat einen Grund, der ohne ihn kippt:** eine 400-MB-JPEG-Vorschau wäre ein **ungezählter,
  beliebig oft wiederholbarer Vollabruf**, und die Begründung „begrenzt wird das durch Typ-Allowlist
  und Bytekappe" hielte nicht. Ein halbes Bild ist keine Vorschau — also nicht kappen, sondern ablehnen.
- **Punkt 6 ist 1:1, und der Preis ist benannt:** solange ein Download frei ist, ist eine vorschaufähige
  Datei beliebig oft vollständig lesbar. Ein Mitzählen würde einen Share mit `max_downloads = 1` durch
  das **Öffnen** der Vorschau verbrauchen — eine Verhaltensänderung für bereits verteilte Links.

---

### Task 34: F — `GET /api/download/[id]/zip`

**Zusage:** Das Archiv streamt ohne Temp-Datei, zählt als **genau ein** Download, enthält **keine**
nicht freigegebene Datei und sagt in einer `_HINWEIS.txt`, welche fehlen und warum.

**Test zuerst:** `src/app/m/files/api/download/[id]/zip/route.test.ts` —
1. drei `clean`-Dateien → drei Einträge, `download_count` **+1**, **genau eine** Logzeile über
   `protokolliereDownload` (T16) mit **`file_id = NULL`** und `client_ip_unbestaetigt` aus
   `ipKuerzen(clientIpAus(headers))` — nicht drei Zeilen, nicht null;
2. eine Datei `scanning` oder `error` dabei → sie fehlt, und `_HINWEIS.txt` nennt Namen **und** Grund;
3. **alle** Dateien ausgeschlossen → benannter Zustand statt eines leeren Archivs;
4. Prüfkette wie T33: 410 / 403 / 401 / 404, und ein 401/403 zählt **nicht**;
5. Abbruch der Anfrage (`req.signal`) → Streams geschlossen, **keine** offenen Descriptoren, kein
   halbes Tarball;
6. Archivname: entschärfter ASCII-Fallback **plus** `filename*=UTF-8''…`;
7. Rollensperre → 404 auf dem Inbox-Host.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/download/[id]/zip/route.ts`, `route.test.ts`

**Abhängigkeiten:** T3 (`archiver`), T7, T9, T13, T15, T16, T21, **T4** (`ipKuerzen` über T16), **T1**
(`clientIpAus`). **Vorbedingung: §13.1 Frage 6.**

**Fertig, wenn:** alle sieben Punkte grün · `zlib: { level: 1 }`, sequenziell, ohne Temp-Datei.

**Beachten:** Die hart erarbeitete Abbruchbehandlung der Alt-App **wandert mit** (PassThrough,
`archive.on("error")`, `req.signal`-Listener, Cleanup im `finally`), auch wenn ihr S3-Anlass wegfällt:
sie verhindert hier geleckte **File-Descriptors** statt Sockets. Der ganze Socket-Pool-Apparat
(maxSockets 128, Timeouts, autoheal-Sidecar) wandert **nicht** mit — er adressiert einen Fehlermodus,
den es auf einem Dateisystem nicht gibt. Die **Namens- und Ausschlussentscheidungen** kommen aus
`_lib/zip.ts` (T21); dieser Task streamt nur.

---

### Task 49: G — `GET /api/inbox/zip` (die ZIP-Zusammenstellung des Posteingangs)

**Zusage:** Eine Auswahl aus dem Posteingang kommt als **ein** Archiv, gegatet wie alles andere, mit
**derselben** Ausschlussregel und `_HINWEIS.txt` wie der Share-ZIP — und der Endpunkt existiert
überhaupt, bevor ein Knopf ihn ruft.

**Test zuerst:** `src/app/m/files/api/inbox/zip/route.test.ts` —
1. ohne Zugang → **404** (`requireFilesAccess`, wie T32);
2. Rollensperre → 404 auf dem **Inbox**-Host (der Endpunkt gehört der Rolle `verwaltung`);
3. `?ids=a,b,c`: drei `clean`-Zeilen → drei Einträge mit den Namens- und Entschärfungsregeln aus
   `_lib/zip.ts` (T21), gleichnamige Dateien bekommen den Zählsuffix;
4. eine Zeile mit `av_status ≠ clean` oder `bytes_vollstaendig_at IS NULL` in der Auswahl → sie fehlt im
   Archiv **und** steht mit Grund in `_HINWEIS.txt` (`istFreigegeben`, T11);
5. **alle** ausgewählten Zeilen ausgeschlossen → benannter Zustand, **kein** leeres Archiv;
6. eine unbekannte oder fremde `id` in `?ids=` → sie wird **übergangen** und in `_HINWEIS.txt` benannt,
   der Rest wird ausgeliefert (eine 404 für das ganze Archiv wäre in einer Mehrfachauswahl eine
   Sackgasse); eine **leere** Auswahl → 400 mit benanntem Grund;
7. Archivname: entschärfter ASCII-Fallback **plus** `filename*=UTF-8''…`; Abbruch der Anfrage
   (`req.signal`) → Streams geschlossen, keine offenen Descriptoren (dieselbe Abbruchbehandlung wie
   T34);
8. **der Posteingang-ZIP zählt nichts und schreibt keine `download_logs`-Zeile** — das Audit-Log gehört
   den öffentlichen Share-Wegen; hier gibt es keinen Zähler und keinen anonymen Abrufer.
Rot, weil die Route nicht existiert.

**Dateien:** Neu: `src/app/m/files/api/inbox/zip/route.ts`, `route.test.ts`

**Abhängigkeiten:** T2, T3 (`archiver`), T7, T9, T10, T11 (`istFreigegeben`), T21.

**Fertig, wenn:** alle acht Punkte grün · `zlib: { level: 1 }`, sequenziell, ohne Temp-Datei (wie T34).

**Beachten:**
- **Dieser Task ist Festlegung F in §1:** §8.6 sagt die Mehrfachauswahl „ausgewählte herunterladen"
  zu und §11.5 prüft sie E2E, aber die Routentabelle §2.1 und die Einstiegspunkt-Tabelle §10.2 führen
  keinen Inbox-ZIP-Endpunkt. Ohne diesen Task stünde ein Knopf in der Oberfläche (T43 Punkt 6) vor einer
  Route, die niemand baut, und T47 Punkt 5 wäre nicht ausführbar. Als Server Action ist es kein Weg:
  Streaming und `Content-Disposition` gehen dort nicht.
- **`api/inbox/zip` neben `api/inbox/[id]` ist kein Konflikt, und der Grund gehört hierher:** Next
  bevorzugt das **statische** Segment vor dem dynamischen, `/api/inbox/zip` erreicht also immer diesen
  Handler. Die Folge — `GET /api/inbox/[id]` mit `id === "zip"` ist unerreichbar — ist unschädlich, weil
  `inbox_files.id` ein `nanoid(10)` ist und niemals `"zip"` lautet. Der Satz steht hier, damit niemand
  das in ein `api/inbox-zip` „reparieren" muss.
- **Die Ausschlussregel wird nicht nachgebaut**, sie kommt aus `_lib/zip.ts` (T21) — dieselbe Funktion
  wie beim Share-ZIP. Eine zweite Regel wäre eine zweite Wahrheit darüber, was „freigegeben" heißt.

---

**Disjunktheit Welle 5**

| Task | Schreibmenge |
|---|---|
| T26 | `(verwaltung)/actions.ts`, `(verwaltung)/actions.test.ts` |
| T27 | `api/upload/[fileId]/route.ts` + Test |
| T28 | `api/s/[id]/verify/route.ts` + Test |
| T29 | `api/s/[id]/qr.png/route.ts` + Test, `api/u/[token]/qr.png/route.ts` + Test |
| T30 | `(verwaltung)/zugangslinks/actions.ts` + Test |
| T31 | `api/u/[token]/upload/route.ts` + Test |
| T32 | `api/inbox/[id]/route.ts` + Test |
| T33 | `api/download/[id]/route.ts` + Test |
| T51 | `api/preview/[id]/route.ts` + Test |
| T34 | `api/download/[id]/zip/route.ts` + Test |
| T49 | `api/inbox/zip/route.ts` + Test |

**Schnittmenge: ∅** — jeder Task besitzt **genau ein** Route-Verzeichnis bzw. genau eine `actions.ts`:
T33 gegen T51 gegen T34 gegen T49 sind vier verschiedene Verzeichnisse (`download/[id]/`,
`preview/[id]/`, `download/[id]/zip/`, `inbox/zip/`), T32 gegen T49 ebenso (`inbox/[id]/` gegen
`inbox/zip/`).
**Kein Task nennt eine Abhängigkeit aus dieser Welle** — alle elf hängen ausschließlich an den Wellen
1–4.
**Abzurufende Routen (Dev):** je Handler mindestens ein echter Aufruf gegen den richtigen **und** den
falschen Host.

---

## Welle 6 — Oberflächen I (6 Tasks, ZWEI Stufen)

**Stufe 6a (parallel): T35, T37, T50, T38, T39.**
**Stufe 6b: T36** — die Zeilenaktionen der Freigaben-Tabelle rufen die Actions aus T37, und T37 schreibt
`(verwaltung)/actions.ts` in 6a. Eine Tabelle, die Knöpfe für Actions rendert, die es noch nicht gibt,
ist kein baubarer Task; die Kante ist echt und wird gestuft, nicht weggeredet.

### Task 35: F — `/shares/neu`, `UploadInsel`, und der Beweis gegen die stille Proxy-Kappe

**Zusage:** Eine Datei **über 10 MiB** kommt vollständig an und ist danach vollständig zurücklesbar;
Fortschritt, Wiederholen und Abbrechen funktionieren **je Datei**.

**Test zuerst:** zwei Ebenen.
`src/app/m/files/_ui/UploadInsel.test.tsx` mit dem etablierten Harness
`src/app/m/qr/_lib/test-dom.tsx` (`mount`/`fill`/`click`/`query`/`submitForm`) — **kein zweites
Harness erfinden** (`CLAUDE.md:92-93`): Chunk-Aufteilung bei einer Datei > `FILES_CHUNK_BYTES`;
Fortschritt steigt **monoton**; **Abbrechen ruft `DELETE /api/upload/<fileId>`** (T27 Punkt 8) und
entfernt den Eintrag aus der Liste — geprüft über den beobachteten Request, nicht über das
Verschwinden allein; Wiederholen setzt **nur** die fehlgeschlagene Datei fort.
`e2e/files-fileshare.spec.ts` (neu): eine Datei von **12 MiB** über die Oberfläche hochladen, danach
über `/api/download/<shareId>?file=<fileId>` **byteweise identisch** zurücklesen — **und** derselbe
Inhalt in **einem** PUT wird still gekappt. Genau diese Differenz ist die Zusage.
Rot, weil Seite und Insel nicht existieren.

**Der `?ende=1`-Chunk MUSS `datei.type` als `Content-Type` mitschicken** (nachgetragen nach Welle 5).
T27 nimmt die Client-Deklaration des MIME-Typs von dort entgegen — die Spec benennt keinen Träger,
T27 hat den idiomatischen gewählt (`api/upload/[fileId]/route.ts`, `DEKLARATION_KOPF`). Fehlt der
Kopf, werden **`.txt` und die drei Office-Formate abgelehnt**: für `text/plain` gibt es keine
Signatur, die Deklaration ist dort das einzige Positivsignal (§8.5 verlangt beide), und für
ZIP-Container ist sie die Verfeinerung. **Alle Signaturformate (PNG/JPEG/PDF) gehen auch ohne durch**
— die Lücke fällt also genau bei den vier Typen auf, die niemand zuerst probiert. Ein Test der Insel
muss den gesetzten Kopf des letzten Chunks zusichern, nicht nur den Upload-Erfolg.

**Die Statuscodes, auf die die Insel antworten muss** (von T27/T31 gewählt, vom Plan nicht
festgelegt): **415** MIME-Prüfung gescheitert · **409** Zeile bereits vollständig, mit
`erwartetesOffsetBytes` als Wiederaufsetzpunkt · **400** `ab` ist kein Byte-Offset · **413**
AV-Grenze · **507** kein Platz (Inbox-Weg; die Zeile bleibt zur Wiederaufnahme stehen).

**Der E2E-Teil wartet auf `clean`, und zwar auf den Zustand, nicht auf eine Zeitspanne.**
`/api/download` antwortet vor `clean` **403** (T33 Punkt 1), das Zurücklesen ist also ohne laufende
AV-Kette unerreichbar: nötig sind der Fake-Scanner (T14), die Warteschlange (T17) und ihr Startpunkt in
`_lib/boot.ts` (T22). Der Test setzt zuerst `setzeAvModus("ok")` (`e2e/helpers/avModus.ts`, T14) und
**pollt** dann den **Zustand**: `/api/download/<shareId>?file=<fileId>` antwortet zuerst **403** und
nach dem Scan **200** — gepollt mit Obergrenze an Versuchen, **nie** mit einer festen Wartezeit. Auf
eine Seite kann dieser Task nicht pollen: `/s/<id>` (T40) und `/shares/<id>` (T41) entstehen erst in
Welle 7. Ein Test, der nach dem Upload sofort lädt, ist rennabhängig grün.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/shares/neu/page.tsx`, `_ui/UploadInsel.tsx`,
`_ui/uploadInsel.module.css`, `_ui/UploadInsel.test.tsx`, `e2e/files-fileshare.spec.ts`

**Abhängigkeiten:** T26, T27 (`PUT`/`GET` **und** `DELETE`), T18, T33 (für das Zurücklesen), **T14**
(Fake-Scanner + `avModus`-Helfer), **T17** (Warteschlange), **T22** (ihr Startpunkt).

**Fertig, wenn:** beide Ebenen grün · `http://files.localtest.me:3000/shares/neu` **abgerufen** · der
E2E-Lauf läuft mit `pnpm dev:av` bzw. dem zweiten `webServer`-Eintrag (ohne ihn erreicht keine Datei
`clean`, §6.8).

**Beachten:**
- **Keine Konstante wird aus der Insel in eine Server Component importiert.** `FILES_CHUNK_BYTES`, die
  MIME-Allowlist und jede Grenze liegen in `_lib/grenzen.ts` bzw. `_lib/mime.ts` — Module **ohne**
  `"use client"`. Bei einem Upload-Modul ist genau die Chunk-Größe der naheliegende Kandidat (Analyse
  Falle 13), und der Fehler ist HTTP 500 für die ganze Seite, das **weder `pnpm build` noch Vitest**
  finden.
- **Kein antd-Compound-Zugriff in der Server Component** — `Form.Item`, `Descriptions.Item`,
  `List.Item`, `Upload` sind bei einer Datei-Verwaltung die erste Wahl und in RSC **verboten** (Analyse
  Falle 14). Interaktive Teile sind Client-Kinder, die Seite bleibt RSC.
- Fehler kommen **am Feld** an (`useActionState`), Byte-Fehler am Datei-Eintrag mit Wiederholen —
  nicht auf einer technischen Fehlerseite mit Datenverlust.

---

### Task 36: F — Freigaben-Übersicht: Tabelle, Kartenliste, QR-Dialog

**Zusage:** Die Übersicht zeigt Status, Menge und Datum je Zeile (nicht nur einen Link), scrollt auf
schmalen Geräten nicht, sondern zeigt dort eine **Kartenliste**, und `password_hash` überquert die
RSC-Grenze **nicht**.

**Test zuerst:** `src/app/m/files/_ui/SharesTabelle.test.tsx` und `_ui/SharesUebersicht.test.tsx` —
1. die Projektion enthält `hatPasswort: boolean` und **kein** Feld, dessen Wert mit `$2b$` beginnt;
2. **beide** Darstellungen sind im Markup (Tabelle **und** Kartenliste); die Umschaltung ist **CSS**,
   nie JavaScript;
3. `scroll={{ x: "max-content" }}` ist gesetzt, und **keine** Spalte trägt `fixed`, `ellipsis` oder
   `scroll.y`;
4. Downloads stehen als `n / m` bzw. `n / ∞`; der AV-Sammelwert trägt **Text**, nicht nur Farbe; „Erstellt
   von" zeigt bei `import:easy-filesharing` „Altbestand — nicht zuordenbar";
5. Leerzustand: „Noch keine Freigabe angelegt" **plus** Knopf;
6. an die Server Component werden nur **serialisierbare** Zeilen übergeben — keine Drizzle-Rows, keine
   `Date`-Objekte, keine Funktionen;
7. **die Zeilenaktionen sind vorhanden und rufen die Actions aus T37**: „Bearbeiten" (führt auf
   `/shares/<id>/bearbeiten`, T42), „Löschen" **mit Bestätigung, die Dateizahl UND Größe nennt**
   (§7.3), „QR" (öffnet `QrDialog`). Ohne diesen Punkt hätten `bearbeitenAction` und
   `shareLoeschenAction` in der Tabelle keinen Einstiegspunkt — §10.2 fordert für **beide** „Knopf in
   Tabelle **und** Detailseite";
8. **`QrDialog` bietet einen PNG-Download** mit Dateiname `<entschärfter-titel>-qr.png`, Entschärfung
   **1:1** aus `_lib/zip.ts` (T21, `replace(/[^a-zA-Z0-9_-]/g, "_")`) — `drop` hatte den Download, und
   §7.9 hält ausdrücklich fest, dass er nicht unbemerkt wegfallen darf;
9. **Warte- und Fehlerzustand der Übersicht** (§10.1-Matrix): Warten → **Skeleton der Tabelle**;
   Fehler → `Alert type="warning"` **plus** Wiederholen — und die Zusicherung, dass **kein**
   `Alert type="error"` auf dieser Datenfläche steht (`colorError === colorPrimary === #c8000f`, ein
   `type="error"` sieht aus wie eine Primäraktion; `docs/design/README.md`, Falle 3).
Rot, weil die Tabelle nicht existiert.

**Dateien:** Neu: `src/app/m/files/_ui/SharesTabelle.tsx`, `_ui/SharesTabelle.test.tsx`,
`_ui/QrDialog.tsx`, `_ui/QrDialog.test.tsx`, `_ui/SharesUebersicht.test.tsx` ·
Geändert: `src/app/m/files/_ui/SharesUebersicht.tsx`

**Abhängigkeiten:** T15, T18, T23, T29, **T37** (die Zeilenaktionen rufen `bearbeitenAction` und
`shareLoeschenAction`) — **deshalb Stufe 6b.**

**Fertig, wenn:** die neun Punkte grün · `http://files.localtest.me:3000/` **abgerufen**.

**Beachten:**
- **`SharesTabelle.tsx` trägt `"use client"`, und „die Seite bleibt RSC" gilt für die Seite, nicht für
  die Tabelle.** Eine antd-`Table` ist in RSC nur gegen **Falle 1** sicher; `columns` mit
  `render`-Funktionen, Zeilenaktionen und Bestätigungsdialogen reicht **Funktionen** über die
  RSC-Grenze, und das scheitert unabhängig davon. Präzedenzfall im Repo:
  `feedback/_ui/Verlauf.tsx:1` trägt `"use client"`, obwohl es als Vorbild für die CSS-Umschaltung
  zitiert wird.
- **`max-content` ist die einzige ehrliche Angabe**, weil die Spalten keine `width` tragen; und
  `fixed`/`ellipsis`/`scroll.y` schalten rc-table auf `table-layout: fixed`, wodurch sich das
  **Desktop-Bild** ändert, ohne dass irgendwo etwas überläuft (`lib/Table.js:426-442`).
- Die Umschaltklassen kommen aus `_ui/files.css` (T18) und tragen dort schon den Präfix-Selektor. Dieser
  Task **schreibt keine Regel** in `files.css`; komponentenlokales CSS geht in ein `*.module.css`.
- **`select()` ohne Argument ist im Modul nicht erlaubt** — die Alt-App selektierte alle Spalten
  inklusive `password_hash`, spreadete sie und übergab sie an die Client-Komponente (Analyse Falle 11).
- Die Größensumme kommt **aus den Zeilen**, nicht aus `total_size`.

---

### Task 37: F — Shares-Actions: bearbeiten, Downloads aufstocken, löschen

**Zusage:** Wer nur den Titel korrigiert, **verkürzt den Share nicht**; der Ablauf ist **in der Action**
gedeckelt; Löschen entfernt Zeilen **und** alle Blobs, das Audit-Log **bleibt**.

**Test zuerst:** `src/app/m/files/(verwaltung)/actions.test.ts` erweitert (zweiter Toucher) —
1. `bearbeitenAction` nur mit geändertem Titel → `expires_at` **unverändert** (der Alt-Defekt:
   `useState(1)` plus bedingungsloses Senden verkürzte auf 24 h);
2. direkter Action-Aufruf mit `0`, `-1`, `99999` → Ablehnung, `expires_at` **unverändert** (in der
   Alt-App waren über einen direkten Aufruf beliebige Werte möglich, die Deckelung stand nur als
   HTML-Attribut);
3. `downloadsAufstockenAction` erhöht `max_downloads` und setzt **keinen** Zeitstempel zurück (die
   Spalte `limit_reached_at` existiert nicht mehr — genau deshalb);
4. `shareLoeschenAction` löscht `shares`, `share_files`, **alle** Blobs (je Datei `loesche`, danach das
   Verzeichnis) und Zwischendateien; `download_logs` bleibt **erhalten**;
5. Passwort setzen/entfernen: setzen erzeugt `$2b$12$…`, entfernen setzt `NULL`;
6. ohne Zugang → alle drei abweisend.
Rot, weil die Actions fehlen.

**Dateien:** Geändert: `src/app/m/files/(verwaltung)/actions.ts`, `(verwaltung)/actions.test.ts`

**Abhängigkeiten:** T26, T7, T8, T15.

**Fertig, wenn:** die sechs Punkte grün.

**Beachten:** Punkt 3 ist der Grund, warum `limit_reached_at` gestrichen wurde: `updateShare` setzt sie
heute nur im Zweig `maxDownloads === null` zurück (`actions.ts:61-66`), also hinterlässt das **Anheben**
eines Limits einen gesetzten Wert — 24 h später antworten drei Auslieferungsrouten mit 410, obwohl die
Limitprüfung passieren würde, und der Aufräumjob **löscht** den Share samt Dateien
(`cleanup/route.ts:27,33-38`). Der Admin wollte gerade das Gegenteil.

---

### Task 38: G — `/u/<token>`: Abgabe auf einem fremden Handy

**Zusage:** Eine anonyme Abgabe von zwei Dateien mit Hinweis und Kategorie ist **quittiert, je Datei
einzeln**; ein ungültiges Token bekommt eine **Korrekturaufforderung am Ort** (HTTP 200), keinen
Redirect und keine 401-Seite.

**Test zuerst:** `src/app/m/files/_ui/AbgabeFormular.test.tsx` (Harness aus `qr/_lib/test-dom.tsx`) —
Hinweis über 500 **Code Points** wird **im Feld gemeldet**, nicht abgeschnitten; die Kategorie-Auswahl
ist eine **echte Radiogruppe** (ein Tabstop, Pfeiltasten wählen nativ); je Datei ein eigener
Fortschritt und eine eigene Quittung; ein `<noscript>`-Block nennt den Weg.
**Dazu die vier Fehlerzustände der §10.1-Matrix, je Datei einzeln benannt** — ein Sammelfehler über dem
Formular wäre bei mehreren Dateien nicht zuzuordnen: (a) **zu groß** (413 aus T31), (b) **Typ nicht
erlaubt** (MIME-Ablehnung aus T31/T12), (c) **Kontingent erschöpft** (429 aus T50), (d)
**Netzfehler/Abbruch** mit Wiederholen an genau dieser Datei. Je Fall steht der Text **am
Dateieintrag**, die übrigen Dateien laufen weiter, und der Melder sieht **keine** technische
Fehlerseite. Der DOM-Test stellt die vier Antworten **selbst** her (gestubbtes `fetch`); dass T50 den
429-Weg in **derselben** Stufe baut, erzeugt deshalb **keine** Abhängigkeitskante — das Formular bildet
auf **Statuscodes** ab, nicht auf T50s Code.
`e2e/files-inbox.spec.ts` (neu): zwei Dateien mit Hinweis und Kategorie über
`drop.localtest.me:3100/u/<token>` abgeben → zwei Quittungen; und `/u/<ungültig>` → **200** mit
„Dieser Abgabelink ist nicht (mehr) gültig", **kein** Redirect, **kein** Token in der Adresse.
Rot, weil Seite und Formular nicht existieren.

**Dateien:** Neu: `src/app/m/files/(oeffentlich-inbox)/u/[token]/page.tsx`,
`u/[token]/abgabe.module.css`, `_ui/AbgabeFormular.tsx`, `_ui/AbgabeFormular.test.tsx`,
`e2e/files-inbox.spec.ts`

**Abhängigkeiten:** T31, T19, T5, T6, T30 (zum Erzeugen eines Tokens im Test — der Test stellt seinen
Zustand **selbst** her).

**Fertig, wenn:** beide Ebenen grün · `http://drop.localtest.me:3000/u/<token>` **abgerufen**.

**Beachten:**
- **Öffentliche Gestaltungsklasse: kein antd**, eigenes CSS-Modul, mobile-first, Eingabefelder nie unter
  16px, Trefferflächen 44px.
- **Der Token-Parameter wird nicht übernommen.** `drop` antwortet heute `302` auf
  `/?error=invalid_token&token=<eingabe>`; ein gültiges Token landete damit in Browser-History und
  Referer — ein Zugangsdatum. Die 1:1-Pflicht ist die **Korrekturaufforderung**, nicht der Parameter.
- **JavaScript ist erforderlich, und das ist keine Regression:** `/u/:token` liefert heute schon die
  `index.html` einer React-SPA — die Inbox war **nie** ohne JS bedienbar. Die feedback-Zusage „ohne JS
  vollständig bedienbar" gilt dort und wird hier **ausdrücklich nicht** ausgedehnt.
- **Ein Hinweis, eine Kategorie, ein Vorgang** — pro Anfrage mitgeschickt, nicht positionsgebunden.
- Der Test legt sein Token über `zugangslinkAnlegenAction` selbst an: die Playwright-DB wird einmal je
  Lauf gelöscht, alle Dateien teilen sie sich, `workers: 1`, in Pfadreihenfolge — ein Test, der Zustand
  **voraussetzt**, ist entweder allein grün oder in der Suite grün, nie beides.

---

### Task 39: G — `/zugangslinks`: anlegen, einmalig ausgeben, aufstocken, widerrufen

**Zusage:** Die Liste zeigt Zustand und **Restbudget** je Zeile; nach dem Anlegen erscheint der volle
Token **einmal** mit Link, QR, PNG-Download und Druckansicht; hat die Rolle `inbox` **keinen Host**,
gibt es **keinen** Link und **keinen** QR, sondern einen benannten Zustand.

**Test zuerst:** `src/app/m/files/_ui/ZugangslinksListe.test.tsx` —
1. Zeile zeigt Name, `token_start…`, Laufzeit, **Restbudget**, Zustand (gültig / abgelaufen /
   widerrufen), Uploads-Zähler;
2. nach dem Anlegen: voller Token **einmal** sichtbar, danach nicht mehr im Markup;
3. **`hostFuerRolle("inbox") === null`** → benannter Zustand „Die Abgabe-Domain ist noch nicht auf die
   Suite umgestellt …", Anlegen-Knopf **deaktiviert**, **kein** QR, **kein** Link;
4. „Kontingent aufstocken" ist am **Restbudget-Feld** erreichbar und nur bei gültigen, nicht
   widerrufenen Links;
5. „Widerrufen" mit Bestätigung; die Zeile bleibt in der Liste;
6. `size="small"` **nur** innerhalb der Tabellenzeilen; Handlungsknöpfe unter 768px volle Breite,
   untereinander;
7. **Leerzustand** (§10.1-Matrix): „Kein Abgabelink vorhanden" **plus** Anlegen-Knopf — und im
   Host-losen Zustand aus Punkt 3 bleibt der Knopf **deaktiviert** (die beiden Zustände treffen sich, und
   nur einer von ihnen erlaubt das Anlegen);
8. **die einmalige Ausgabe trägt PNG-Download und Druckansicht**, und die Druckansicht ist ein
   `@media print`-Block in `_ui/zugangslinks.module.css` — **keine** eigene Route. Geprüft wird der
   Block im CSS-Scan (T19 erfasst jede `*.module.css`) und die Anwesenheit des Druck-Knopfes im
   DOM-Test.
Rot, weil Seite und Liste nicht existieren.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/zugangslinks/page.tsx`, `_ui/ZugangslinksListe.tsx`,
`_ui/ZugangslinksListe.test.tsx`, `_ui/zugangslinks.module.css`

**Abhängigkeiten:** T30, T29, T18, T9.

**Fertig, wenn:** die acht Punkte grün · `http://files.localtest.me:3000/zugangslinks` **abgerufen** ·
die Druckvorschau des Browsers zeigt Token, Link und QR **ohne** Shell und ohne Navigationselemente.

**Warum `@media print` und nicht eine eigene Route** (die Spec lässt es offen, §8.6/§10.2): der
Präzedenzfall `feedback` hat die Druckansicht als eigene Route mit eigenem Layout — und genau dort
**fiel sie aus dem Zugriffsriegel heraus**, weil der Riegel im anderen Layout hing
(`feedback/_lib/requireFeedbackAccess.ts:10,17-23`, in T23 zitiert). Hier trägt der Token die
Vertraulichkeit: eine zweite Route wäre eine zweite Stelle, an der er ausgegeben wird, mit eigenem
Layout und eigener Riegelfrage. Der `@media print`-Block hat keine URL, keine zweite Riegelstelle und
hält die Dateiliste dieses Tasks vollständig.

**Beachten:** Punkt 3 ist der Zustand, der ohne die Host-Rollen-Festlegung **unbemerkt Altpapier
produziert hätte**. Punkt 2 macht den `localStorage`-Umweg der Alt-App überflüssig, an dem die
QR-Historie beim Domainwechsel verloren ging (origin-gebunden) — wer den Zettel verliert, legt einen
neuen Link an; bei ≤ 72 h Laufzeit ist das der Normalfall.

---

### Task 50: G — `PUT`/`POST /api/u/[token]/upload`, Teil 2: Budget, Wettlauf, Notbremse, Altweg

**Zusage:** Das Mengenbudget hält **atomar**; ein Wettlauf lässt **keinen** stillen Waisen zurück; die
IP-Notbremse greift erst **nach** Guard und Budget; ein alter offener Tab bekommt 409 **mit Text** statt
eines stummen 405.

**Test zuerst:** `src/app/m/files/api/u/[token]/upload/route.test.ts` erweitert (zweiter Toucher) —
1. Budget: `verbraucht_dateien < budget_dateien` und `verbraucht_bytes + n ≤ budget_bytes`, sonst
   **429** mit benanntem Grund; der laufende Chunk-Upload prüft **vorab** gegen das Restbudget und
   bricht früh ab;
2. **Wettlauf:** liefert das `UPDATE` null Zeilen, obwohl die Bytes schon liegen → **Blob und Zeile
   entfernt**, 429 mit demselben Grund, **kein** stiller Waise;
3. IP-Notbremse greift **nach** Guard und Budget, bei `FILES_IP_ANFRAGEN_PRO_10MIN`, und sie zählt
   **nicht** die Fehlversuche mit (die liegen in T31 Punkt 1);
4. `POST` auf dieselbe Route → **409** mit dem Text „Diese Seite ist veraltet — bitte neu laden und die
   Abgabe wiederholen.", die Datei ist **nicht** gespeichert, und `hint`/`category`/`files` werden
   **nicht** gelesen;
5. die Reihenfolge insgesamt ist unverändert **Guard → Budget → Notbremse** und wird als Reihenfolge
   geprüft, nicht nur je Stufe;
6. **Rollensperre der `POST`-Methode: auf dem Verwaltungs-Host → 404.** Der `POST`-Zweig ist ein
   **eigener** Export mit eigenem Code, also braucht er seine **eigene** erste Anweisung
   `rolleOderNull(headers) !== "inbox"` — die Prüfung in T31 Punkt 6 deckt nur `PUT`. Ohne diesen Punkt
   prüft T44 (Punkt 1, dreizehn Methoden) eine Sperre, die kein Task zugesagt hat, und genau dieser
   Zweig ist der, der im Fenster zwischen den beiden Cutovern noch Alt-Clients bedient (E15 d).
Rot, weil Budget, Wettlauf-Zweig und POST-Zweig fehlen.

**Dateien:** Geändert: `src/app/m/files/api/u/[token]/upload/route.ts`, `route.test.ts`

**Abhängigkeiten:** T31 (dieselbe Datei, Welle 5), T16 (atomares Budget), T7 (`loesche` für die
Rückabwicklung), T8, T1 (`RateLimiter`).

**Fertig, wenn:** alle sechs Punkte grün · das Budget ist **ein einzelnes** SQL-Statement pro Vorgang und
die Entscheidung ist die **Zahl betroffener Zeilen** (T16).

**Beachten:**
- **Das Budget gehört in `files.db`, nicht in eine `Map`:** dort wäre es nach jedem Neustart weg und bei
  mehreren Instanzen wirkungslos.
- **Die Notbremse liegt bei 600/10 min ≈ 2,3 GiB über EINE Adresse. Wer den Wert senkt, reproduziert
  den feedback-Ausfall** (15 Ehrenamtliche hinter einer NAT-IP, ab der 11. Abgabe „Zu viele Anfragen",
  `feedback/actions.ts:99-109`).
- **Nicht reproduziert wird `drop`s Umgehbarkeit:** gemessen acht `POST /u/<token>/upload` → fünf 200,
  drei 429; danach acht `…?x=n` → **acht 200**; zwölf Uploads mit rotierendem `X-Forwarded-For` → zwölf
  200. Die Suite-Fassung schlüsselt gar nicht auf Pfade — der Guard sitzt im Handler.
- **Der POST-Zweig ist die einzige Zeile im Modul mit einem Ablaufdatum** — nach dem Standby-Ende darf
  er entfallen. Er hat **keinen** Einstiegspunkt in der Oberfläche, und das ist Absicht (§10.2).
- **Warum das ein eigener Task in der nächsten Welle ist:** derselbe Handler, aber die vier Zusagen hier
  hängen an T16 und am Wettlauf-Verhalten, nicht am Guard. Getrennt ist jede Hälfte reviewbar; in
  **derselben** Welle wäre es ein Dateikonflikt mit T31 (§2 führt die Datei mit beiden Tasks).

---

**Disjunktheit Welle 6**

| Task | Stufe | Schreibmenge |
|---|---|---|
| T35 | 6a | `(verwaltung)/shares/neu/page.tsx`, `_ui/UploadInsel.*`, `_ui/uploadInsel.module.css`, `e2e/files-fileshare.spec.ts` |
| T37 | 6a | `(verwaltung)/actions.ts`, `(verwaltung)/actions.test.ts` |
| T38 | 6a | `(oeffentlich-inbox)/u/[token]/*`, `_ui/AbgabeFormular.*`, `e2e/files-inbox.spec.ts` |
| T39 | 6a | `(verwaltung)/zugangslinks/page.tsx`, `_ui/ZugangslinksListe.*`, `_ui/zugangslinks.module.css` |
| T50 | 6a | `api/u/[token]/upload/route.ts` + Test |
| T36 | 6b | `_ui/SharesTabelle.*`, `_ui/QrDialog.*`, `_ui/SharesUebersicht.tsx` + Test |

**Schnittmenge: ∅**, je Stufe und über beide. `_ui/SharesUebersicht.tsx` war in Welle 4 (T23) dran,
`(verwaltung)/actions.ts` in Welle 5 (T26), `api/u/[token]/upload/route.ts` in Welle 5 (T31),
`e2e/files-fileshare.spec.ts` und `e2e/files-inbox.spec.ts` entstehen hier.
**Kein Task nennt eine Abhängigkeit aus derselben Stufe:** T35/T37/T38/T39/T50 hängen nur an den Wellen
1–5, T36 an T37 (6a).
**Abzurufende Routen:** `/shares/neu`, `/`, `/zugangslinks` (Verwaltungs-Host), `/u/<token>`
(Inbox-Host).

---

## Welle 7 — Oberflächen II (4 Tasks, alle parallel)

### Task 40: F — `/s/<id>`: öffentliche Ansicht und das serverseitige Passwort-Gate

**Zusage:** Vor dem Entsperren enthält der **rohe HTTP-Body** keinen Dateinamen, keine ID, keine Größe
und keine Beschreibung; nach dem Entsperren ist der Download möglich, ohne Cookie nicht;
`<meta refresh>` steht **genau dann** im Markup, wenn mindestens eine Datei `scanning` ist.

**Test zuerst:** `src/app/m/files/(oeffentlich-share)/s/[id]/page.test.tsx` — die Zustandsmatrix aus
§10.1: unbekannte ID → `notFound()`; abgelaufen und Limit erreicht → **HTTP 200** mit eindeutiger
Zustandsseite; alle Dateien unvollständig → benannter Zustand; Blob fehlt → Zeile trägt „Datei nicht
auffindbar" statt einer Größe; `error`/`infected` sind **Endzustände ohne Refresh**; ganzseitiges
Warten **nur**, wenn keine Datei freigegeben und mindestens eine `scanning` ist; **und der Zustand
„Zu groß für die Vorschau"**: liegt eine vorschaufähige Datei über `FILES_VORSCHAU_MAX_BYTES`, steht an
der Stelle des Vorschau-Knopfes dieser benannte Text **plus** der Download-Knopf (§7.7 — T51 Punkt 5 hat
die Server-Hälfte, dies ist die Oberflächen-Hälfte, und ohne sie ist der Zustand nirgends sichtbar).
`e2e/files-fileshare.spec.ts` erweitert (zweiter Toucher):
1. geschützter Share, **roher Body** der ersten Antwort enthält keinen der hinterlegten Dateinamen und
   kein `$2b$` — das ist im **RSC-Payload** zu prüfen, nicht im sichtbaren DOM (Analyse Falle 12;
   Vitest kann es strukturell nicht sehen, weil `"use client"` dort ein wirkungsloser String ist);
2. `POST /api/s/<id>/verify` mit richtigem Passwort → danach ist `/api/download/…` möglich; mit
   gelöschtem Cookie → **401**. **Voraussetzung ist ein `clean`-Zustand:** der Test setzt
   `setzeAvModus("ok")` (T14) und **pollt** auf 200 des Byte-Wegs, bevor er den Cookie-Vergleich zieht —
   vor `clean` antwortet der Download 403, und die Zusage wäre rennabhängig grün;
3. **das geschlossene Orakel über echte Requests.** §11.2 weist dieser Zeile die Ebene
   **„E2E (Statuscode über den echten Request)"** zu; T28 liefert nur die Handler-Hälfte. Also:
   `verify` gegen eine **unbekannte** ID, gegen einen **passwortfreien** Share und mit **falschem**
   Passwort → **dreimal 401**, ununterscheidbar in Status **und** Body;
4. **kein Zählen ohne Berechtigung, E2E.** §11.2 verlangt „Handler-Test **+ E2E**", T33 liefert nur den
   Handler-Teil: `download_count` vor und nach einem **401** (kein Cookie) und einem **403** (AV nicht
   `clean`) vergleichen — beide Male unverändert;
5. **der beobachtete Übergang `scanning → clean` im echten Browser.** §11.5 weist ihn ausdrücklich E2E
   zu („`<meta refresh>` und Statuswechsel im echten Browser"), und T47 läuft in `error`, erreicht
   `clean` also nie: mit `setzeAvModus("ok")` (T14) hochladen → `/s/<id>` trägt den **Wartezustand mit
   `<meta http-equiv="refresh">`** und `/api/download/…` antwortet **403**; nach dem Statuswechsel ist
   der `<meta refresh>` **weg** und derselbe Abruf **200**. Der Vitest-Teil oben belegt nur die
   **Anwesenheit** des Tags, nicht seine Wirkung.
Rot, weil die Seite nicht existiert.

**Dateien:** Neu: `src/app/m/files/(oeffentlich-share)/s/[id]/page.tsx`,
`s/[id]/page.test.tsx`, `s/[id]/share.module.css`, `_ui/PasswortMaske.tsx`,
`_ui/PasswortMaske.test.tsx` · Geändert: `e2e/files-fileshare.spec.ts`

**Abhängigkeiten:** T13, T15, T19, T28, T33, **T51** (der Vorschau-Weg, den die Seite verlinkt), T34,
**T14** (Fake-Scanner und `avModus`-Helfer), **T17** (Warteschlange), **T22** (ihr Startpunkt).

**Fertig, wenn:** beide Ebenen grün · `http://files.localtest.me:3000/s/<id>` in **allen** vier
Zuständen (offen, passwortgeschützt, abgelaufen, wartend) **abgerufen**.

**Beachten:**
- **`PasswordGate` ist eine SERVER-Komponente.** Die Alt-Seite lädt die Dateien **bevor** sie das
  Passwort prüft und übergibt die fertigen Ansichten als `children` an eine Client-Komponente —
  Dateinamen, Größen, Beschreibung und die fertigen Download-URLs stecken damit im RSC-Payload
  **derselben** Antwort, die die Passwortmaske zeigt. Hier entsteht das Markup **erst nach** dem
  Entsperren.
- **Der gemischte AV-Zustand ist ein Zeilenzustand, kein Seitenzustand.** Ein Share mit drei `clean`-
  und einer `scanning`-Datei ist der Normalfall; freigegebene Zeilen sind **sofort** ladbar, sonst
  blockierte eine hängende Datei einen fertigen Share.
- **Ohne die Refresh-Regel lädt eine Seite mit einer dauerhaft fehlgeschlagenen Datei alle 5 Sekunden
  nach — für immer, auf einem fremden Handy.** Die Selbstaktualisierung ist **JS-frei**
  (`<meta http-equiv="refresh" content="5">`) und auf genau diesen Zustand begrenzt.
- **Eine Next-Seite kann keinen 410 setzen** — nur ein Route Handler. Deshalb 200 mit Zustandsseite auf
  `/s/<id>` und 410 auf den Byte-Wegen; das ist eine **Festlegung**, damit niemand es „repariert" und
  die Seite in einen Route Handler umbaut.
- Die öffentliche Ansicht verlinkt **nie** in die Verwaltung und hat kein „Zurück" — sie ist bewusst
  eine Sackgasse.

---

### Task 41: F — `/shares/[id]`: Detailseite mit Audit-Log

**Zusage:** Die Detailseite zeigt Metadaten, die Dateiliste **mit AV-Zustand je Datei**, den
öffentlichen Link mit Kopieren, den QR mit PNG-Download und das Audit-Log — und der Log-Kopf sagt, was
die Adresse ist.

**Test zuerst:** `src/app/m/files/(verwaltung)/shares/[id]/page.test.tsx` —
1. `notFound()` bei unbekannter ID;
2. je Datei ein Zustand als **Text plus Symbol** (freigegeben / wird geprüft / gesperrt / nicht
   auffindbar), **nie** Farbe allein, und **kein** roter `Tag` für „infiziert";
3. die Größensumme kommt **aus den Zeilen**; `total_size` wird **nicht** daneben angezeigt;
4. Audit-Log: bis 100 Einträge mit „mehr laden"; Spalte „Was" zeigt `Datei <name>` bzw. **`ZIP`** bei
   `file_id = NULL`; die Spaltenüberschrift lautet **„IP (unbestätigt, gekürzt)"**, und die
   Spaltenbreite rechnet mit `0` am Ende. **Der Nachladeweg ist festgelegt: „mehr laden" ist ein Link
   auf `?logs=<n>`**, einen **Suchparameter der Server Component** (Vorgabe 100, geklemmt auf ein
   Vielfaches und eine Obergrenze). **Keine** Server Action und **kein** Route Handler: eine Action
   landete in `(verwaltung)/actions.ts` — einer Datei, die dieser Task nicht besitzt, die T26s
   Quelltext-Zusicherung zusätzlich erfassen müsste und die in Welle 7 einen zweiten Toucher bekäme.
   Und ohne benannten Weg wäre die stille Alternative, **alle** Zeilen an den Client zu liefern und dort
   aufzuklappen;
5. „Downloads aufstocken" erscheint **nur**, wenn `max_downloads` gesetzt ist;
6. Zurück-Weg zur Liste vorhanden (keine Sackgasse);
7. **die Detailseiten-Aktionen sind vorhanden und rufen die Actions aus T37**: „Bearbeiten",
   „Löschen" **mit Bestätigung, die Dateizahl UND Größe nennt** (§7.3), „Downloads aufstocken", QR mit
   PNG-Download (`QrDialog` aus T36). §10.2 verlangt für `bearbeitenAction` und `shareLoeschenAction`
   ausdrücklich „Knopf in Tabelle **und** Detailseite" — die Tabellenhälfte liegt in T36 Punkt 7;
8. **Leerzustand** (§10.1-Matrix): ist **keine** Datei vollständig übertragen, steht „Keine Datei
   vollständig übertragen" **plus** die beiden Wege „Löschen" und „Erneut hochladen" — nicht eine leere
   Dateiliste ohne Handlung.
Rot, weil die Seite nicht existiert.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/shares/[id]/page.tsx`, `page.test.tsx`,
`_ui/AuditLog.tsx`, `_ui/AuditLog.test.tsx`

**Abhängigkeiten:** T15, T18, T29, T36 (`QrDialog`, Welle 6b), T37 (Actions, Welle 6a), T16 (die
Logzeilen, die diese Ansicht zeigt — geschrieben von T33/T34).

**Fertig, wenn:** die acht Punkte grün · `http://files.localtest.me:3000/shares/<id>` **abgerufen** ·
**das Audit-Log ist im Abruf nicht leer** (ein echter Download vorher, sonst belegt die Ansicht nichts —
die Zeilen schreibt T33/T34 über `protokolliereDownload`, T16).

**Beachten:** Die Alt-Route `GET /api/shares/[id]/logs` wird **nicht** portiert: sie prüft nur
`if (!session)`, nicht `isAdmin` und nicht `createdBy`, liefert bis zu 100 Einträge mit IP, User-Agent
und Zeitstempel zu **jeder** shareId aus der URL, die Middleware gatet den Pfad nicht (`/api/shares`
beginnt nicht mit `/shares`), und die UI ruft sie nirgends auf — toter, ungegateter Code. Die
Detailseite liest **direkt** aus der DB, wie die Alt-Detailseite es auch schon tat. **Vorschauen werden
nicht geloggt** (§7.7).

---

### Task 42: F — `/shares/[id]/bearbeiten`

**Zusage:** Das Formular ist mit den **tatsächlichen** Werten der Zeile vorbelegt; wer nur den Titel
korrigiert, ändert den Ablauf nicht.

**Test zuerst:** `src/app/m/files/(verwaltung)/shares/[id]/bearbeiten/page.test.tsx` — der Ablauf ist
mit dem **Wert der Zeile** vorbelegt (nicht mit `1`); Titel, Beschreibung, Limit und
Passwort-setzen/-entfernen sind bedienbar; Feldfehler erscheinen **am Feld**; Absenden ohne Änderung
am Ablauf sendet ihn **nicht**. Rot, weil die Seite nicht existiert.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/shares/[id]/bearbeiten/page.tsx`, `page.test.tsx`

**Abhängigkeiten:** T15, T18, T37.

**Fertig, wenn:** der Test grün · `http://files.localtest.me:3000/shares/<id>/bearbeiten` **abgerufen**.

**Beachten:** Die serverseitige Deckelung liegt in der **Action** (T37) und ist hier **nicht** noch
einmal implementiert — sie steht an einer Stelle. Das HTML-Attribut ist Komfort, keine Grenze.

---

### Task 43: G — `/posteingang` mit Filtern, Mehrfachauswahl und Löschen

**Zusage:** Der Betreiber sieht jede Abgabe mit Zeit, Name, Größe, Kategorie, Hinweis, AV-Status und
Abgabelink, kann filtern, herunterladen und **löschen — Zeile und Bytes**; damit ist der
Dateisystem-Abholweg samt Sidecar-`.txt` überflüssig.

**Test zuerst:** `src/app/m/files/_ui/PosteingangTabelle.test.tsx` —
1. die acht Spalten aus §8.6, neueste zuerst;
2. Filter für Kategorie, AV-Status, Zeitraum, Abgabelink; eine **unbekannte** Kategorie aus dem Import
   wird **roh angezeigt**, nicht verworfen;
3. `token_id IS NULL` → „Altbestand";
4. `scanning`-Zeilen mit Uhr-Symbol **und** Text; `error` → „Prüfung nicht möglich";
5. Leerzustand „Noch keine Abgabe eingegangen" **plus** Verweis auf Abgabelinks;
6. Löschen mit Bestätigung **und** Angabe der Größe; Mehrfachauswahl für „löschen" und für
   „**ausgewählte herunterladen**" — Letztere ruft `GET /api/inbox/zip?ids=…` (**T49**), also **denselben**
   Endpunkt mit **derselben** Ausschlussregel und `_HINWEIS.txt` (§8.6). Der Knopf baut die Adresse aus
   den ausgewählten IDs und ist bei leerer Auswahl **deaktiviert**;
7. Kartenliste unter 768px, `scroll={{ x: "max-content" }}`, `size="small"` in den Zeilen.
`src/app/m/files/(verwaltung)/posteingang/actions.test.ts`: `inboxLoeschenAction` entfernt Zeile
**und** Bytes (einzeln **und** über die Mehrfachauswahl); ohne Zugang abweisend.
`e2e/files-inbox.spec.ts` erweitert (zweiter Toucher): die anonyme Abgabe aus T38 **erscheint** im
Posteingang des **anderen** Hosts mit Hinweis und Kategorie und ist ab `clean` herunterladbar; ein
**widerrufener** Abgabelink lehnt ab, **ohne** 404.
Rot, weil Seite und Actions nicht existieren.

**Auch hier wird auf den Zustand gewartet, nicht auf eine Zeitspanne.** „ab `clean` herunterladbar"
setzt die laufende AV-Kette voraus: Fake-Scanner (T14), Warteschlange (T17), Startpunkt in `_lib/boot.ts`
(T22). Der Test setzt `setzeAvModus("ok")` und **pollt den Zeilenzustand im Posteingang** („wird
geprüft" → „freigegeben"), bevor er `GET /api/inbox/<id>` zieht. Vor `clean` antwortet die Route 403
(T32 Punkt 2) — ein Test, der sofort lädt, ist rennabhängig grün.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/posteingang/page.tsx`,
`posteingang/actions.ts`, `posteingang/actions.test.ts`, `_ui/PosteingangTabelle.tsx`,
`_ui/PosteingangTabelle.test.tsx`, `_ui/posteingang.module.css` ·
Geändert: `e2e/files-inbox.spec.ts`

**Abhängigkeiten:** T32, **T49** (der ZIP-Endpunkt der Mehrfachauswahl), T18, T15, T6, T30, T38,
**T14** (Fake-Scanner und `avModus`-Helfer), **T17** (Warteschlange), **T22** (ihr Startpunkt).

**Fertig, wenn:** alle Ebenen grün · `http://files.localtest.me:3000/posteingang` **abgerufen**.

**Beachten:**
- **Neubau, keine Portierung** — und die fachliche Zusage, die `drop` nicht hatte („Löschen entfernt
  Zeile und Bytes"), ist der **Grund**, warum die Sidecar entfallen darf.
- **Der gemessene Grund gegen die Sidecar:** `writeFile(notePath, …)` läuft ohne `flag: 'wx'`,
  `sanitizeFilename('foto.jpg.txt')` ergibt `foto.jpg.txt`, und `text/plain` steht in der
  `ALLOWED_MIME`-Vorlage — liegt eine echte Datei `foto.jpg.txt` im Verzeichnis und wird danach
  `foto.jpg` **mit Hinweis** hochgeladen, ist ihr Inhalt durch den Hinweistext ersetzt: HTTP 200, kein
  Log.
- **Vorbedingung, die auch hier hängt: §13.1 Frage 5** (§0). Die Filter aus Punkt 2 filtern auf
  **Kategorien**; heißen die realen Verzeichnisse anders als `bilder`/`dokumente`/`sonstiges`, greifen
  sie ins Leere — angezeigt wird der Rohwert (Anzeige-Toleranz, T6), gefiltert aber gegen die
  Schreibliste. Der Filter ist deshalb aus **derselben** Liste zu bauen wie die Validierung in T6, nie
  aus einer zweiten Aufzählung.
- **Offene Frage, die hier hängt: §13.2 Frage 8.** Braucht der Betreiber den Dateisystem-Abholweg
  weiter, gilt E14 (c) statt (a): ein **separates** Metadatenverzeichnis neben der Inbox, und §4.6/§8.6
  ändern sich. Die Ansicht ist dann gebaut, die Sidecar käme **zusätzlich** — sie blockiert diesen Task
  nicht. Ebenso §13.2 Frage 7 (`FILES_INBOX_AUFBEWAHRUNG_TAGE`): nicht gesetzt = keine Frist = heutiges
  Verhalten.

---

**Disjunktheit Welle 7**

| Task | Schreibmenge |
|---|---|
| T40 | `(oeffentlich-share)/s/[id]/*`, `_ui/PasswortMaske.*`, `e2e/files-fileshare.spec.ts` |
| T41 | `(verwaltung)/shares/[id]/page.tsx` + Test, `_ui/AuditLog.*` |
| T42 | `(verwaltung)/shares/[id]/bearbeiten/page.tsx` + Test |
| T43 | `(verwaltung)/posteingang/*`, `_ui/PosteingangTabelle.*`, `_ui/posteingang.module.css`, `e2e/files-inbox.spec.ts` |

**Schnittmenge: ∅.** T41 und T42 liegen in verschiedenen Verzeichnissen (`[id]/page.tsx` gegen
`[id]/bearbeiten/page.tsx`). Die beiden E2E-Dateien haben in dieser Welle **je einen** Schreiber.
**Kein Task nennt eine Abhängigkeit aus dieser Welle** — T40, T41, T42 und T43 hängen ausschließlich an
den Wellen 1–6.
**Abzurufende Routen:** `/s/<id>` (vier Zustände), `/shares/<id>`, `/shares/<id>/bearbeiten`,
`/posteingang`.

---

## Welle 8 — Wiederholen, Aufräumen, Abnahme (5 Tasks, ZWEI Stufen)

**Stufe 8a (parallel): T44, T45, T46, T48.**
**Stufe 8b: T47** — T47 Punkt 6 prüft „Prüfung nicht möglich **mit** Wiederholen-Knopf" auf Detailseite
**und** im Posteingang, also genau die Oberfläche, die T45 in `(verwaltung)/shares/[id]/page.tsx` und
`_ui/PosteingangTabelle.tsx` erst baut. **T48 bleibt in 8a**, obwohl T45 dieselbe Tabelle umschreibt: T48
misst Viewport-Layout (Kartenliste gegen Tabelle, Knopfbreiten, Überlauf) und **nicht** den
Wiederholen-Knopf; ein zusätzlicher Knopf in einer Zeile ändert keine der fünf Messungen, und
Dateikonflikt gibt es keinen (T48 schreibt nur `e2e/files-mobil.spec.ts`).

### Task 44: Host-Abnahme — die Rollensperre über ALLE Endpunkte

**Zusage:** **Jeder** Endpunkt antwortet auf dem **fremden** Host mit 404; ein auf dem Verwaltungs-Host
erzeugter Abgabelink trägt `drop.localtest.me:3100` **und der Test folgt ihm**; keine Verwaltungsseite
enthält einen **relativen** `/u/`-Link.

**Das ist ein ABNAHME-Test, kein TDD-Test** (Kopfregel). In Welle 8a existieren alle Endpunkte, und die
Zusage von T27–T34, T49 und T51 ist erfüllt — er ist von Anfang an grün, und das ist richtig. Die
**Mutation, an der er gemessen wird:** den `rolleOderNull`-Abgleich in **einer** `api`-Route entfernen —
danach muss genau dieser Test rot werden. Wer stattdessen künstlich Rot herstellt, bricht funktionierenden
Code auf.

**Test:** `e2e/files-hosts.spec.ts` erweitert (zweiter Toucher) —
1. eine **Schleife** über **dreizehn** Handler-Methoden, je gegen den fremden Host → **dreizehnmal 404**
   (keine zwei Stichproben): die zehn Route-Dateien — die neun aus §2.1 plus `api/inbox/zip` (T49,
   Festlegung F) —, und weil `api/upload/[fileId]` **drei** Methoden exportiert (`PUT`, `GET`,
   `DELETE`) und `api/u/[token]/upload` **zwei** (`PUT`, `POST`), sind es dreizehn Prüfungen. Die
   namentliche Liste und die Rechnung stehen in §1. Eine Methode ohne eigene Prüfung ist eine Sperre,
   die für sie **nicht gilt**;
2. auf `files.localtest.me:3100/zugangslinks` einen Abgabelink anlegen → Link **und** QR-Nutzlast
   tragen `drop.localtest.me:3100` **mit Port**; dem Link **folgen**, anonym abgeben, und die Datei
   erscheint im Posteingang;
3. `GET files.localtest.me:3100/shares/neu` unter `drop.…` → 404 (die Gegenrichtung ist damit
   **strukturell** unmöglich, und dass sie es ist, prüft dieser Punkt);
4. DOM-Scan über **jede** Verwaltungsseite: kein `href` beginnt mit `/u/` — alle Inbox-Links sind
   **absolut** und aus `oeffentlicheUrl("inbox", …)` gebaut.

**Dateien:** Geändert: `e2e/files-hosts.spec.ts`

**Abhängigkeiten:** T27–T34, **T49**, **T50** (die `POST`-Methode), **T51** (alle dreizehn
Handler-Methoden), T39, T43.

**Fertig, wenn:** alle vier Punkte grün.

**Beachten:**
- **Ohne Punkt 1 bliebe die Mutation „den `rolleOderNull`-Abgleich in allen api-Routen weglassen"
  grün.** Route Handler haben **kein** Layout; die Sperre wäre für die dreizehn Methoden nirgends
  verankert. `core/routing.ts:57-67` lässt den internen `/m/<key>`-Pfad bei `requiresAuth: false`
  **ungegatet** durch (`if (target.requiresAuth && groups === null)` greift nicht, `canAccess` steigt
  mit `true` aus) — `PUT /m/files/api/u/<token>/upload` wäre also über **jeden** Host erreichbar, dessen
  `moduleForHost` auf `files` zeigt. Genau diese Sperre verlangt E15 (d) für das Fenster zwischen den
  beiden Cutovern, in dem das Alt-Pendant noch live ist.
- **Punkt 2 ist die nicht-triviale Richtung** und der Test, der Falle 17 schließt: die Erzeugung sitzt
  auf dem **einen** Host, die Nutzlast muss den **anderen** tragen. Ein Stringvergleich auf den
  Hostnamen allein wäre die schwächere Hälfte — der Test muss dem Link **folgen**, und dafür braucht er
  den **Port** aus dem Request (T9).
- **Punkt 4 ist die Gegenprobe der Prüffrage** „führt kein Weg dorthin, wo die aufrufende Person nicht
  hindarf?": ein relativer `/u/`-Link wäre auf dem Verwaltungs-Host eine 404-Sackgasse.

---

### Task 45: `avWiederholenAction` und der Wiederholen-Knopf an beiden Stellen

**Zusage:** Eine Zeile in `av_status = 'error'` ist über einen **Knopf** erneut einzureihen — auf der
Share-Detailseite **und** im Posteingang; `clean` und `infected` sind von diesem Weg unerreichbar.

**Test zuerst:** `src/app/m/files/(verwaltung)/actions.test.ts` erweitert (dritter Toucher) —
`avWiederholenAction` setzt **nur** `error → scanning` und reiht ein; auf `clean`, `infected`,
`unscanned` und `scanning` angewandt → **keine** Änderung; ohne Zugang abweisend; wirkt auf **beide**
Tabellen (`share_files` und `inbox_files`) über **eine** Action.
Dazu in `_ui/PosteingangTabelle.test.tsx` und `(verwaltung)/shares/[id]/page.test.tsx` (je zweiter
Toucher): der Knopf steht an **jeder** Zeile mit `av_status = 'error'` und an keiner anderen.
Rot, weil die Action fehlt.

**Dateien:** Geändert: `src/app/m/files/(verwaltung)/actions.ts`, `(verwaltung)/actions.test.ts`,
`(verwaltung)/shares/[id]/page.tsx`, `(verwaltung)/shares/[id]/page.test.tsx`,
`_ui/PosteingangTabelle.tsx`, `_ui/PosteingangTabelle.test.tsx`

**Abhängigkeiten:** T17, T37, T41, T43.

**Fertig, wenn:** alle Zusagen grün · `/shares/<id>` und `/posteingang` **abgerufen**.

**Beachten:** `unscanned → scanning` läuft **ausschließlich** über den Nachscan-Lauf aus Spec 2, nicht
über diesen Knopf — der Wertebereich der Übergänge steht in §6.2 und wird hier durchgesetzt. Der Knopf
ist die Antwort auf den Zustand, in dem `FILES_AV_VERSUCHE × FILES_AV_WIEDERHOLUNG_SEKUNDEN` erschöpft
sind: **kein** automatischer Dauerversuch.

---

### Task 46: Aufräum-Timer, manueller Auslöser, Ablage-Kachel

**Zusage:** Der Timer läuft im Takt `FILES_AUFRAEUMEN_TAKT_MINUTEN`, schreibt **je Lauf** eine
Protokollzeile in `aufraeum_laeufe`, löscht im **Trockenlauf** nichts und zählt dieselben Zahlen — und
der Betreiber sieht Restplatz, Zeilen ohne Blob, `scanning`/`error`-Zahlen und `.part`-Reste auf einer
Kachel, mit einem Knopf samt Trockenlauf-Vorschau.

**Test zuerst:** `src/app/m/files/_lib/boot.test.ts` und `_ui/AblageKachel.test.tsx` —
1. der Timer wird beim Boot registriert, mit **verzögertem** erstem Lauf, und **einmal** (nicht je
   Request);
2. ein Lauf schreibt eine Zeile mit `gestartet_at`, `beendet_at`, `trockenlauf` und **allen sieben
   Zählspalten** aus §4.8; ein abgebrochener Lauf lässt `beendet_at` NULL — genau daran ist ein
   Absturz mitten im Lauf erkennbar;
3. `FILES_AUFRAEUMEN_TROCKENLAUF=1`: dieselben Zahlen, **keine** gelöschte Zeile, **kein** gelöschter
   Blob;
4. `verwaiste_blobs_gemeldet` wird gefüllt und **nichts** davon gelöscht;
5. die Kachel zeigt belegten und **freien** Platz (`statfsSync`), Zeilen ohne Blob, `scanning`- und
   `error`-Zahlen, `.part`-Reste — dort sieht sie der Mensch, der handeln kann;
6. `aufraeumenAction` ist nur mit Zugang aufrufbar und hat eine **Trockenlauf-Vorschau** vor dem echten
   Lauf.
Rot, weil Timer, Action und Kachel fehlen.

**Dateien:** Neu: `src/app/m/files/(verwaltung)/ablage-actions.ts`, `_ui/AblageKachel.tsx`,
`_ui/AblageKachel.test.tsx`, `_lib/boot.test.ts` · Geändert: `src/app/m/files/_lib/boot.ts`,
`_ui/SharesUebersicht.tsx`

**Abhängigkeiten:** T20, T22, T36.

**Fertig, wenn:** alle sechs Punkte grün · `http://files.localtest.me:3000/` **abgerufen** (die Kachel
steht dort).

**Beachten:**
- **Kein `/api/cleanup`-Endpunkt** — ein Secret weniger, und der Alt-Endpunkt hatte eine Falle, die man
  nicht erbt: `replace("Bearer ", "")` ist **keine** Prüfung, das nackte Secret passiert ebenfalls.
  Dazu: ein Cron, der einen Host aufruft, den `moduleForHost` nicht kennt, bekommt **302 auf `/login`**
  und meldet Erfolg, wenn er nur auf HTTP-Fehler prüft. Der manuelle Auslöser ist ein **Knopf** — er
  hat eine Session, also kein Secret.
- **Die Spaltenliste steht in §4.8 und nur dort.** Eine zweite Aufzählung wäre eine zweite Wahrheit,
  und eine Migration nach der kürzeren Liste fehlte eine Spalte.
- **Der Trockenlauf ist für den ERSTEN Lauf nach dem Cutover da:** falls auf dem Server kein
  Cleanup-Cron läuft (§13.4 Frage 25), enthält die Produktions-DB abgelaufene Shares vollständig, und
  der erste Lauf im neuen System ist ein **Löschereignis**, keine Hintergrundaufgabe. Der Ablauf gehört
  ins Spec-2-Runbook.
- **Die Ablage kann NICHT in `/api/health/files` mitgeprüft werden:** `/api/health` ist PASSTHROUGH
  (`routing.ts:12`), eine Modul-Route darunter wäre tot, und `core/health` für **einen** Nutznießer zu
  erweitern verstößt gegen die `core`-Regel. Der Docker-Healthcheck bleibt `/api/health/portal`
  (`compose.yaml:45`): im Repo reagiert auf `unhealthy` **nichts**, und ein files-eigener Fehler, der
  den **gesamten** Container als krank markiert, nähme bei einem später eingeführten Automatismus die
  anderen drei Module mit.
- **Runbook-Schritt (Spec 2):** Restplatz und `.part`-Reste **vor und nach** dem Cutover ablesen.

---

### Task 47: fail-closed-Abnahme über ALLE fünf Lesewege

**Zusage:** Mit einem Scanner, der Fehler meldet, ist **kein** Byte erreichbar — auf allen fünf
Lesewegen, und die Verwaltung sagt, was los ist.

**Test:** `e2e/files-fileshare.spec.ts` erweitert (dritter Toucher). **Abnahme-Test, kein TDD-Test**
(Kopfregel): in Stufe 8b existiert alles, was er prüft. Die **Mutation, an der er gemessen wird:**
`istFreigegeben` so ändern, dass es auch bei `error` oder `scanning` freigibt — danach muss er auf
mindestens vier der fünf Lesewege rot werden.

**Der Zustand wird hergestellt, und zwar Schritt für Schritt umgeschaltet** (Festlegung H in §1) — der
Startwert allein genügt nicht, weil derselbe Lauf vorher `clean` gebraucht hat und Punkt 8 `clean`
**und** `scanning` in **einem** Share verlangt. Reihenfolge, verbindlich:
1. `setzeAvModus("ok")` → Datei A hochladen → auf „freigegeben" **pollen** (Zustand, keine Wartezeit);
2. `setzeAvModus("error")` → Datei B in **denselben** Share hochladen → auf „Prüfung nicht möglich"
   pollen; damit steht der **gemischte** Zustand aus Punkt 8;
3. `setzeAvModus("haengt")` → Datei C hochladen; sie bleibt `scanning`, solange der Fake nicht antwortet —
   das ist die Zeile in `scanning` für die Punkte 1–5.
Mit `FILES_AV_TIMEOUT_MS=2000`, `FILES_AV_VERSUCHE=2` und `FILES_AV_WIEDERHOLUNG_SEKUNDEN=1` (§9.3) ist
jeder dieser Übergänge in wenigen Sekunden durchlaufen — gegen `timeout: 90_000` reicht das dreifach.
Geprüft wird dann je **einer** Zeile in `error` **und** einer in `scanning`:
1. `GET /api/download/<id>` → **403**;
2. `GET /api/download/<id>/zip` → Archiv **ohne** die Datei **plus** `_HINWEIS.txt` (bzw. 403, wenn
   keine Datei übrig bleibt);
3. `GET /api/preview/<id>` → **403**;
4. `GET /api/inbox/<id>` → **403**;
5. die **ZIP-Zusammenstellung aus dem Posteingang** (`GET /api/inbox/zip?ids=…`, T49) → dieselbe
   Ausschlussregel: die nicht freigegebene Zeile fehlt im Archiv und steht mit Grund in `_HINWEIS.txt`;
6. die Verwaltung zeigt „Prüfung nicht möglich" **mit** Wiederholen-Knopf — auf der Detailseite **und**
   im Posteingang;
7. der Upload war die **ganze Zeit quittiert**, und der Melder sah **keinen** technischen Fehler;
8. ein Share mit **`clean` UND `scanning`** liefert die freigegebene Datei aus und zeigt die andere als
   Zeilenzustand; ein Share mit einer **`error`**-Datei trägt **keinen** `<meta refresh>` mehr.

**Dateien:** Geändert: `e2e/files-fileshare.spec.ts`

**Abhängigkeiten:** T31, T50, T32, T33, T51, T34, **T49** (der fünfte Leseweg), T40, T41, T43,
**T45 (Stufe 8a — deshalb liegt dieser Task in 8b)**, T14 (Fake-Modusdatei und `avModus`-Helfer), T17,
T22.

**Fertig, wenn:** alle acht Punkte grün · der Lauf **stellt jeden** seiner Zustände selbst her (kein
Punkt setzt einen Zustand aus einem anderen Spec-File voraus).

**Beachten:** Das ist die Zusage, die §6.3 Punkt 2 für **nicht verhandelbar** erklärt, und der Grund
ist ein gemessener Alt-Befund: in `drop` werden der `catch`-Block und damit der **komplette**
`AV_FAIL_OPEN`-Schalter für Protokollfehler **nie erreicht** — end-to-end in beiden
Schalterstellungen identisch gemessen. „fail-closed" ist deshalb nur eine Zusage, wenn `error`
**erreichbar** und der Weg dorthin **ausführbar** ist; die Herstellung über den Fake-Modus gehört
zur Zusage, sonst wäre „mit abgeschaltetem Scanner" eine Aufgabe, die niemand ausführen kann.
**Es gibt keinen fail-open-Schalter, auch nicht „nur für Dev"** — er wäre drops toter `AV_FAIL_OPEN`
in neuer Gestalt. Dev bekommt stattdessen einen Scanner, der antwortet.

---

### Task 48: Mobil-Abnahme bei 390, 834 und 1280

**Zusage:** Die mobilen Zusagen halten an **beiden Enden und in der Mitte** — und die Desktop-Hälfte
ist kein Zugabe-Test, sondern die einzige, die eine `display:none`-Regel widerlegen kann.

**Abnahme-Test, kein TDD-Test** (Kopfregel): in Stufe 8a existieren alle Ansichten, und die Zusagen von
T18/T19 (Media Queries im Quelltext) sind erfüllt — dieser Test ist von Anfang an grün, und das ist
richtig. Die **Mutation, an der er gemessen wird:** eine Media Query von `767.98px` auf `600px`
verschieben (oder eine `display:none`-Regel umdrehen) — danach muss er in **mindestens einem** der drei
Viewports rot werden, und zwar in der **Mitte**, wo die Enden schweigen.

**Test:** `e2e/files-mobil.spec.ts` (neu), je Viewport 390×844, **834×1112** und 1280×720:
1. Freigaben-Übersicht: bei 390 die **Kartenliste** sichtbar und die Tabelle **nicht**; bei 1280
   umgekehrt; bei 834 genau **eine** von beiden;
2. dasselbe für den Posteingang;
3. Handlungsknöpfe unter 768px: **volle Breite, untereinander** — bei 1280 nebeneinander;
4. `/s/<id>` und `/u/<token>`: kein horizontaler Überlauf (`documentElement.scrollWidth` ≤
   `clientWidth`), Trefferflächen ≥ 44px, Eingabefelder ≥ 16px;
5. bei 834 keine Kopfzeile mit einer Mindestbreite über der Viewportbreite.

**Dateien:** Neu: `e2e/files-mobil.spec.ts`

**Abhängigkeiten:** T36, T38, T39, T40, T43.

**Fertig, wenn:** alle fünf Punkte in **allen drei** Viewports grün.

**Beachten:**
- **jsdom wertet Media Queries nicht aus.** Ein Vitest, der „auf 390px ist X unsichtbar" behauptet und
  dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne Balken ist eine Lüge. Die
  Quelltext-Scans aus T18/T19 besitzen „die Klasse trägt die richtige Media Query"; **dieser** Task
  besitzt „man sieht es".
- **Die Mitte ist jedes Tablet im Hochformat**, und zwei Defekte auf Teilprojekt C waren genau von
  dieser Art: die Knopfregel bei 600 statt 768 (unsichtbar bei 390 **und** 1280) und die Kopfzeile mit
  Mindestbreite 904px zwischen 768 und 903px. **Wer nur die Enden misst, prüft die Mitte nicht.**
- **Ein Quelltext-Scan findet eine Kaskadenkollision strukturell nicht** — er kennt Reihenfolge und
  Fremd-Stylesheets nicht. Genau so ist Falle 5 durchgekommen: die Media-Query-Regel war da, der Scan
  war grün, und der Knopf stand trotzdem auf dem Desktop.

---

**Disjunktheit Welle 8**

| Task | Stufe | Schreibmenge |
|---|---|---|
| T44 | 8a | `e2e/files-hosts.spec.ts` |
| T45 | 8a | `(verwaltung)/actions.*`, `(verwaltung)/shares/[id]/page.*`, `_ui/PosteingangTabelle.*` |
| T46 | 8a | `(verwaltung)/ablage-actions.ts`, `_ui/AblageKachel.*`, `_lib/boot.ts`, `_lib/boot.test.ts`, `_ui/SharesUebersicht.tsx` |
| T48 | 8a | `e2e/files-mobil.spec.ts` |
| T47 | 8b | `e2e/files-fileshare.spec.ts` |

**Schnittmenge: ∅**, je Stufe und über beide. `_lib/boot.ts` war in Welle 4 (T22) dran,
`(verwaltung)/actions.ts` in den Wellen 5 und 6, `_ui/SharesUebersicht.tsx` in den Wellen 4 und 6,
`_ui/PosteingangTabelle.tsx` und `shares/[id]/page.tsx` in Welle 7, `e2e/files-hosts.spec.ts` in Welle 4,
`e2e/files-fileshare.spec.ts` in den Wellen 6a und 7.
**Kein Task nennt eine Abhängigkeit aus derselben Stufe:** T44, T45, T46, T48 hängen nur an den Wellen
1–7; T47 hängt an T45 (8a) und liegt deshalb in 8b.
**Abzurufende Routen:** `/`, `/shares/<id>`, `/posteingang`.

---

## 4. Abschluss-Abnahme (nach Welle 8, kein eigener Task)

Vor dem Merge, in dieser Reihenfolge:

1. `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test`
   (vollständig, nicht nur die `files-*`-Dateien — die Suite teilt eine DB und läuft in
   Pfadreihenfolge).
2. **Die Tabelle aus §10.2 abhaken, nicht behaupten.** **Zwanzig** Einstiegspunkte: die achtzehn Zeilen
   der Spec **plus** die zwei Ergänzungen dieses Plans — `GET /api/inbox/zip` (ZIP-Auswahl im
   Posteingang, T43 Punkt 6) und `DELETE /api/upload/<fileId>` (Abbrechen in der Upload-Insel, T35).
   Die Rechnung steht in §1. Mit **einer** benannten Ausnahme: der `POST`-Zweig von
   `/api/u/<token>/upload` hat **keinen** und darf keinen haben (er bedient ausschließlich Alt-Clients im
   Cutover-Fenster). Der Anlass für diese Tabelle ist die Fehleranalyse des `feedback`-Ports: das Modul
   war nicht schlecht gestaltet, es war **unfertig** — sechs von acht Server-Actions und drei Seiten
   hatten keinen Einstiegspunkt.
3. **Jede Route in Dev auf dem richtigen Host abrufen**, mit laufendem `pnpm dev:av`. Elf Seiten und
   **zehn** Handler-Dateien (neun aus §2.1 plus `api/inbox/zip`), darin **dreizehn** rollengesperrte
   Handler-Methoden; die antd-RSC-Falle und der Wert-aus-Client-Modul-Fehler sind HTTP 500, das kein Gate
   sieht.
4. **§11.6 gegenlesen:** was `build`, `typecheck` und `lint` hier **nicht** finden — Compound-Zugriff in
   RSC, ein **Wert** aus einem `"use client"`-Modul, eine Route auf einem PASSTHROUGH-Pfad, API-Routen
   am falschen Ort, die Kaskadenkollision, der Faktor 1000, `MAX_FILE_SIZE` gegen `MAX_FILE_SIZE_MB`,
   der `null`-Zielschlüssel beim gekappten Proxy-Body. Für jede Zeile ist im Plan benannt, wer die
   Aussage besitzt.
5. **Die zehn Runbook-Einträge aus §11.7, die Fragen 16–23 aus §13.3 UND die Fragen 24–29 aus §13.4 an
   Spec 2 übergeben**, mit den in T24 und T25 benannten Prüfwegen. §13.4 gehört ausdrücklich dazu —
   `metaDir`-Ort und Eigentümer (26), MinIO-Objektzahl gegen `share_files` (27), Zahl und Gestalt der
   `created_by`-Werte (28), die Reihenfolge der beiden Cutover (29), der Nachscan-Entscheid (24) und der
   Cleanup-Cron (25). Ohne sie übergibt Spec 1 die Hälfte der Fragen, die den Import überhaupt planbar
   machen. Sie sind **nicht** Teil der Definition of Done von Spec 1, aber sie sind Teil der Übergabe.
6. **Die drei Zeilen, die die Spec-Tabellen ergänzen müssen, an Spec 2 mitgeben** (Festlegungen F und G):
   §2.1 bekommt `api/inbox/zip/route.ts` und die `DELETE`-Methode auf `api/upload/[fileId]/route.ts`,
   §10.2 die beiden zugehörigen Einstiegspunkte. Sonst liest der nächste Leser die Spec als vollständig.

---

## 5. Umfang

**51 Tasks in 8 Wellen mit 11 Stufen.** Innerhalb jeder **Stufe** laufen **alle** genannten Tasks
parallel; die Schnittmenge der Schreibmengen ist je Welle ausgewiesen und leer, und **je Stufe** ist
ausgewiesen, dass kein Task eine Abhängigkeit aus derselben Stufe nennt.

**Die Tasknummer trägt keine Wellenaussage mehr.** T49, T50 und T51 sind bei der Einarbeitung der
Prüfbefunde entstanden und **angehängt** statt eingefügt — eine Neunummerierung hätte rund sechzig
Querverweise anfassen müssen, ohne eine einzige Zusage zu verbessern. **Verbindlich ist diese Tabelle**,
nicht die Reihenfolge der Nummern.

| Welle | Stufe | Titel | Tasks | Anzahl |
|---|---|---|---|---|
| 1 | 1 | Fundament | T1–T7 | 7 |
| 2 | 2a | Tragende Schicht I | T8, T9, T12, T13 | 4 |
| 2 | 2b | Tragende Schicht II (hängt an 2a) | T10, T11 | 2 |
| 3 | 3 | Datenzugriff, Warteschlange, Rahmen | T14–T21 | 8 |
| 4 | 4 | Boot-Naht, Rollen-Verteiler, Betriebsartefakte | T22–T25 | 4 |
| 5 | 5 | Byte-Wege und Actions (Zweige F und G) | T26–T34, **T49**, **T51** | 11 |
| 6 | 6a | Oberflächen I | T35, T37, T38, T39, **T50** | 5 |
| 6 | 6b | Freigaben-Tabelle (hängt an T37) | T36 | 1 |
| 7 | 7 | Oberflächen II | T40–T43 | 4 |
| 8 | 8a | Wiederholen, Aufräumen, Abnahme I | T44, T45, T46, T48 | 4 |
| 8 | 8b | fail-closed-Abnahme (hängt an T45) | T47 | 1 |

**Die breiteste Stufe ist 5 (elf Tasks), danach 3 (acht).** Für Stufe 5 ist die Disjunktheit trivial
nachrechenbar — jeder Task besitzt genau ein Route-Verzeichnis bzw. genau eine `actions.ts`. Für Welle 3
hängt sie an **einer** Feinheit, die deshalb ausgeschrieben ist: die beiden CSS-Scans (T18, T19) sind
über **disjunkte Globs** definiert, und zusammen decken sie jede CSS-Datei des Moduls ab.

**Die tragende Schicht liegt in den Wellen 1–4** (Modul-Dreieck, Host-Rollen, Storage, AV-Vertrag,
Boot-Naht); ab Welle 5 laufen **F** (Fileshare, 14 Tasks: T26–T29, T33, T34, T35, T36, T37, T40–T42,
T51) und **G** (Inbox, 8 Tasks: T30–T32, T38, T39, T43, T49, T50) getrennt und teilen ausschließlich die
Wellen 1–4 sowie die `core`-Hebung aus T1. Die fünf Tasks der Welle 8 sind Querschnitt — sie schließen
die Zusagen, die erst über **beide** Zweige belegbar sind.

**Rechnerisch gebundene Reihenfolge, wenn nur ein Umsetzer arbeitet:** 51 Tasks sequenziell. Mit vier
parallelen Umsetzern ist die kritische Kette 11 Stufen lang, und die längste Stufe bestimmt die Dauer —
deshalb sind die kleinen Tasks der Wellen 1 und 2 nicht zusammengelegt: sie füllen die Breite, statt
die Kette zu verlängern. Die drei nachgezogenen Stufen (2b, 6b, 8b) kosten Zeit und kaufen dafür die
Zusage, die den ganzen Plan trägt: **innerhalb einer Stufe wartet kein Task auf einen anderen.**
