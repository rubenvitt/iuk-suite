# Leitplan — der Weg zum Runbook `docs/runbooks/radio-cutover.md` (Spec 2)

> **Fortschritt und Reihenfolge des Cutover-Wegs (**C1–C41**) fuehrt**
> `docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md` — dieser Leitplan entscheidet
> die Nahtstellen, jener haelt die Checkliste.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus Spec 2 entsteht **eine** Datei — `docs/runbooks/radio-cutover.md` —, aus der heraus am
Cutover-Abend gearbeitet wird: Prüfapparat, Generalprobe, Vorbedingungen, `.env`, das Fenster in
neun Schritten, Abnahme, Service Worker, Ausstellungsplan, Rückweg, Standby, Abbau und die eine
Klammer darüber. Dieses Dokument ist **nicht** das Runbook und **nicht** ein sechster Planteil. Es ist
das Blatt, das eine Umsetzerin **zuerst** liest: es sagt, in welcher Reihenfolge die einundvierzig
Aufgaben der zugehörigen Planteile laufen, was zwischen zwei Teilen auseinanderläuft und **was
davon gilt**, welche Nummer welche Aufgabe anhält — und welche Aufgaben **heute** laufen, ohne auf
den Bau oder auf eine Betreiberauskunft zu warten.

**Architecture:** Fünf Planteile liegen fertig in
`docs/superpowers/plans/` (zusammen 12 579 Zeilen). Sie werden von
diesem Dokument **nicht** umgegossen — jede Umgießung verlöre unterwegs Text, und die Teile tragen
bereits Pflichtkopf, Global Constraints, Leerstellentabelle und je zehn bis fünfzehn ausgearbeitete
Aufgaben mit echtem Code. Dieser Leitplan trägt stattdessen die **vier Dinge, die kein Teil tragen
kann, weil kein Teil die anderen vier sieht:** eine durchgehende Aufgabennumerierung, die
Nahtstellenentscheidungen, die Sperrentafel über alle Teile und die Liste der heute ausführbaren
Arbeit. Vier Planteile decken dieses Erzeugnis ab:

| Planteil | Datei | Aufgaben, die hierher gehören |
|---|---|---|
| **Kapitel 2** — Paritaet und Vorabfragen | `2026-08-18-plan2-radio-paritaet.md` | **nur Teil B**, Aufgaben 6–11 (`:679`, `:883`, `:1280`, `:1475`, `:1661`, `:1807`). Teil A (Aufgaben 1–5, die vier Paritätssichten) ist **Code** und gehört in den Bau-Plan |
| **Kapitel 3** — Generalprobe | `2026-08-18-plan3-radio-generalprobe.md` | **alle fünfzehn** |
| **Kapitel 4** — der Cutover | `2026-08-18-plan4-radio-cutover.md` | **alle zehn** (Aufgaben 2 und 3 erzeugen zusätzlich Repo-Artefakte mit Testzyklus) |
| **Kapitel 5** — Standby und Abbau | `2026-08-18-plan5-radio-abbau.md` | **alle zehn** |

`2026-08-18-plan1-radio-import.md` (Kapitel 1, das Import-Skript) ist **kein** Bestandteil
dieses Weges: es baut `scripts/import/radio.ts` und gehört in den Bau-Plan. Der Leitplan verweist
nur dort auf es, wo das Runbook eine seiner Zusagen zitiert (die Aufrufform, die Abschlusszeile ⬜ L6,
die Zählkette).

**Tech Stack:** Markdown-Runbook nach Hausform (`docs/runbooks/files-cutover.md`,
`docs/runbooks/lagerbuch-cutover.md`) · Docker Compose + Traefik · SQLite (`sqlite3`, better-sqlite3,
WAL) · `psql` / `pg_dump` in Wegwerf-Containern · Next.js 16 standalone-Image
`ghcr.io/rubenvitt/iuk-suite` · Vitest 4 (nur Aufgaben 2 und 3) · bash, **nicht fish**

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` — Rahmen (Zeilen 1–561),
Kapitel 2 (1578–2271), Kapitel 3 (2272–3053), Kapitel 4 (3054–4164), Kapitel 5 (4165–4879),
Anhang A (4880–4897), Anhang B (4898–4914).

**Zieldatei aller einundvierzig Aufgaben:** `docs/runbooks/radio-cutover.md` — dazu in den Aufgaben
2 und 3 `compose.yaml`, `.env.example` und `scripts/compose-radio-redirect.test.ts`.

---

## ⚠️ Was hier nicht steht, und warum

**Spec 1 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md`) ist nicht gebaut.**
`src/app/m/radio/` existiert nicht, `scripts/import/radio.ts` existiert nicht. Alle vierzehn
⬜-Leerstellen der Spec 2 (L1–L14) tragen als Quelle „Bau" oder „Server". **Spec 2 ist deshalb heute
nicht als Code umsetzbar** — was entsteht, sind Umsetzungspläne und aus ihnen Runbook-Text.

Wo eine Zahl, ein Name, ein Pfad oder eine Ausgabe erst der Bau oder der Server hergibt, steht in
diesem Dokument eine **benannte Leerstelle** (⬜ L·E·U·C·N) und **niemals** eine plausibel aussehende
Erfindung. Der Präzedenzfall ist vernarbt und steht in Spec 2 selbst (`:167-171`): die
`lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft** — ein
Playwright-Test hätte dort eine Zusage geprüft, welche die Bauform nicht halten kann.

---

## Globale Randbedingungen

Projektweite Vorgaben, je eine Zeile. Die Werte stehen **wörtlich** im Rahmen von Spec 2
(`docs/superpowers/specs/2026-08-18-radio-cutover-design.md:1-561`); die Zeilennummer daneben ist die
Fundstelle.

### Die neun harten Randbedingungen (Spec 2:52-146)

1. ⚠️ **Es gibt kein Parallelfenster.** Der Alt-Kiosk (`radio-inventar`) läuft **schon heute** unter
   `radio.iuk-ue.de`; der Origin bleibt zeichengleich. „Nie zwei Router gleichzeitig auf derselben
   Domain" ist hier keine Vorsichtsregel, sondern eine **physische Grenze**. Daraus folgt: die
   Verifikation gegen einen **ephemeren Container ohne Traefik-Labels** ist der **einzige** Weg, vor
   dem Umschwenk überhaupt etwas zu prüfen. **Der Rückweg ist „Router zurück", nichts sonst** — und
   er kostet Daten, sobald einmal fachlich geschrieben wurde. (Spec 2:56-66)
2. ⚠️ **Beide Domains ziehen im SELBEN Fenster um.** Der Kiosk spricht über **sechs `/v1`-Routen**
   mit `radio-admin`; schwenkt die Verwaltung zuerst, verliert der Alt-Kiosk seine Datenquelle.
   Deshalb ist der Umschwenk **ein** Schritt und nicht zwei. (Spec 2:68-73)
3. ⚠️ **Der Faktor-1000-Fehler ist paritätsgrün UND löscht die Leihhistorie.** Quelle ist epoch-
   **Millisekunden**, Ziel ist Drizzle `mode: "timestamp"` = Unix-**Sekunden**. Paritaet vergleicht
   Zeilen-Hashes aus **derselben** Mapping-Funktion auf **beiden** Armen — ein konsistenter Fehler
   hasht beidseitig gleich. Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr **1970**;
   der **nächste Boot** löscht die komplette abgeschlossene Leihhistorie. **Der Import-Test bleibt
   grün.** (Spec 2:75-86)
4. **Die 2-Monats-Retention wird übernommen**, aber **nicht** als Sofort-Purge beim Boot (B5:
   Erstlauf 1440 Minuten). Betroffen sind „< 100" Zeilen — das ist eine **Schätzung**, keine
   Zählung. **Die Zählung ist ein Runbook-Schritt** (A8 in §V, Abfrage R in §5.2). (Spec 2:88-92)
5. **Kein externer API-Konsument.** Daraus folgt B16: **`api_tokens` existiert im Ziel nicht.**
   (Spec 2:94-97)
6. **`AdminUser` aus `radio-inventar` wandert nicht.** Eine **Zählung** vor dem Abbau belegt es
   (`select count(*) from "AdminUser";`, P3) — die Zählung dokumentiert, **was verworfen wird**.
   (Spec 2:99-104)
7. ⚠️ **Der Service Worker des Alt-Kiosk überlebt den Umschwenk**, weil der Origin zeichengleich
   bleibt: Root-Scope, Cache-Name `radio-inventar-v1`, `skipWaiting()` + `clients.claim()`. Der
   Abräum-Worker gehört in den **ersten Deploy**, nicht in den Cutover. (Spec 2:106-111)
8. ⚠️ **Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar** — leer und
   vorbaselinig, `loans`, `api_tokens` und `users` **fehlen ganz**. **Alles Bestandsbezogene ist ein
   Runbook-Schritt gegen den echten Dump, nie eine Zahl aus dieser Datei.** (Spec 2:113-118)
9. ⚠️ **Das `lagerbuch`-Import-Skript ist NICHT im Repo.** „Das ist kein Vorbild, dem zu folgen
   wäre." Die fünf Stellen, an denen diese Spec stattdessen ableitet, stehen in Spec 2:129-138 mit
   je einer Zeile *woraus* und *was unbelegt bleibt*. **Wer das Skript findet, prüft diese fünf
   Zeilen gegen es.** (Spec 2:120-140)

### Die Vorgaben, die jede der einundvierzig Aufgaben binden

* **Betriebswerte werden nicht erfunden** (`docs/runbooks/files-cutover.md:57-58`): „Ein Platzhalter
  aus einer anderen Maschine ist kein Wert." Ein leeres Feld ist eine gültige Zeile, eine erfundene
  Zahl nicht. In der Eingabentabelle bleibt die Spalte *Eingetragen* **leer**.
* **Jede Behauptung mit `datei:zeile`** (`docs/runbooks/lagerbuch-cutover.md:5-6`): „wer hier etwas
  hinzufügt, schreibt eine **gemessene** Tatsache auf, keine Vermutung."
* ⚠️ **Platzhalter in einem Runbook-Befehl sind Pflicht, Platzhalter in der Planprosa sind
  verboten.** `<port>`, `<E1>`, `⬜ L13` in einer `curl`-Zeile sind die Hausform und **richtig**,
  solange sie ihre Nummer tragen. „TBD", „analog zu Aufgabe N", „siehe oben" in einem Plandokument
  sind es nicht — die Umsetzerin sieht immer nur ihre eigene Aufgabe.
* **Ein `§` ohne Präfix meint im PLAN immer Spec 2, im RUNBOOK immer das Runbook.** Jeder Verweis
  nach Spec 1 trägt ausnahmslos `Spec 1 §…`. (Re-Kritik RK-A5: elf blanke Verweise, sechs davon
  kollidieren mit Spec 2s eigener Nummerierung.)
* **Alle Blöcke sind `bash`.** Die Shell des Betreibers ist `fish` und kennt weder `for … do … done`
  noch die `$( )`-Verschachtelungen. Der erste Satz unter der Ablaufüberschrift lautet: **vorher
  einmal `bash` starten.** (Spec 2 §3.1.2)
* **Zeitangaben:** `<freeze_iso>` ist ISO-8601 in **UTC**, protokolliert in §C Schritt 1. Er ist der
  Cutoff **jeder** Vergleichsrechnung. `'now'` ist in jedem **Vergleich** verboten und bleibt allein
  der **Vorhersage** A8 vorbehalten. (W3, Spec 2:376-402)
* **ZEIT IST UNIX-SEKUNDEN.** Jede Zeitspalte des Ziels trägt `{ mode: "timestamp" }`, **niemals**
  `timestamp_ms`. Der Fehler wäre **paritätsgrün** (Randbedingung 3).
* **Zahlenregel:** Wo eine Prüfliste eine Anzahl im Kopf nennt, wird die Anzahl im selben Commit
  **gezählt**, nicht abgeschrieben. Die Gegenprobe steht als letzter Schritt der Aufgabe. (W8: eine
  Prüfliste, deren Kopf eine andere Zahl nennt als ihr Rumpf, wird unter Zeitdruck gekürzt.)
* **Verbindliche Zahlen, die in den Teilen falsch stehen können** (W4, W8, W11, Spec 2:404-561):
  **fünf** Tabellen im Zielarm und sechs im Quellarm · **zehn** Quellspalten in epoch-Millisekunden
  (neun Zeitstempel + `devices.last_updated_at`) · **fünf** Verwechslungspaare · **dreizehn**
  Vorabfragen A1–A13, davon **acht** blockierend (A2·A3·A4·A5·A6·A7·A10·A11).
* **`.backup`, nie `cp`**, gegen die **laufende** Datenbank, in Generalprobe **und** Fenster — und
  daraus: **der Alt-Stack wird für einen Generalproben-Snapshot NICHT angehalten**, weil jeder Start
  von `radio-admin` sofort purgt. (W1, Spec 2:317-374)
* **`grep -i 'radio:'` ohne `^`.** `docker compose logs` präfigiert jede Zeile mit dem Servicenamen;
  `^radio:` liefert dann **leere Ausgabe**, und leere Ausgabe liest sich als grün. (W6,
  Spec 2:498-513)
* **Kommandos:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · alle mit `rtk`
  präfixt. Nach jeder Aufgabe grün, dann committen. **Commits müssen signiert sein** (main-Ruleset).
* **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore (`vitest.config.ts:8-34`: 251 Fremdfehlschläge gemessen). Und **kein `pnpm build` vor
  einem Testlauf, den man ernst nimmt** (52 Fehlschläge, ebenda).
* **`pnpm test` sammelt `scripts/**` mit.** `vitest.config.ts:35` setzt nur `exclude`; der Kommentar
  `vitest.config.ts:4-5` behauptet das Gegenteil und ist widerlegt. Ein neuer Test unter `scripts/`
  läuft **ohne** Konfigurationsänderung mit.
* **`compose.yaml` ist rollout-wirksam.** `scripts/deploy.sh:84-105` vergleicht sie byteweise mit
  der Server-Datei und **bricht bei Abweichung ab**. Eine Compose-Änderung am Cutover-Abend ist ein
  eigener Rollout und kein Handgriff.
* **Der Service heißt `suite`, nicht `app`** (`compose.yaml:2`). Spec 2 §4.4.4 schreibt „am selben
  Service `app`"; das ist eine Fehlbezeichnung und wird in Aufgabe 2 berichtigt.
* **Deutsch, mit echten Umlauten**, in Prosa und in Runbook-Zeilen. Nur in Quelltext-Kommentaren,
  die in `.sh`/`.yaml`/`.ts` landen, wird transliteriert, wo die umgebende Datei es bereits tut.
* **Arbeitsverzeichnis:** `/Users/rubeen/dev/personal/drk/iuk-suite`. ⚠️ **Die zwei Alt-Repos liegen
  NICHT darin, sondern daneben** (`…/radio-admin`, `…/radio-inventar`). Jedes
  `docker compose -f radio-inventar/docker-compose.yml …` setzt ein **anderes** Arbeitsverzeichnis
  voraus — **wo die zwei Checkouts auf dem Server liegen, ist ⬜ N10.** Aus dem falschen Verzeichnis
  gefahren antwortet jeder dieser Befehle `no configuration file provided`.
* **Die Freeze-SHAs der zwei Alt-Repos** sind die Belegquelle **jeder** `datei:zeile`-Angabe über die
  Alt-Anwendungen: `radio-admin` = **`265abd5`**, `radio-inventar` = **`f883ec4`**. Die Repos werden
  **archiviert, nicht gelöscht** — ein gelöschtes Repo macht beide Specs unnachprüfbar.
  (Spec 2:25-33, §5.5 Posten 12)

---

## Was heute schon läuft

**Diese Liste steht vorn und nicht in einer Fußnote**, damit die Reihenfolge niemanden anhält, der
arbeiten könnte.

### Die Auflösung eines Widerspruchs, der sonst jede Aufgabe blockiert

Zwei Sätze im selben Planteil widersprechen sich. Teil 3 sagt in seiner Leerstellentabelle: „Die
Spalte ‚blockiert' nennt die Aufgabe dieses Plans, die **ohne den Wert nicht ausführbar** ist"
(`2026-08-18-plan3-radio-generalprobe.md:80`). Und Teil 3 sagt in seinen Global Constraints: „**Platzhalter in einem
Runbook-Befehl sind Pflicht**" (`2026-08-18-plan3-radio-generalprobe.md:43`).

**Es gilt der zweite Satz, und daraus folgt die Regel dieses Leitplans:**

> **Der Runbook-TEXT ist für alle einundvierzig Aufgaben heute schreibbar. Was wartet, ist die
> Ablesung, die das leere Feld füllt — nicht der Satz, der es anlegt.**

Eine Aufgabe, deren einzige offene Stelle ein **Wert** ist, wird heute geschrieben, mit der
benannten Leerstelle an der Stelle des Werts. Das ist die Hausform (`files-cutover.md:57-58`:
„Betriebswerte werden nicht erfunden. … Ein Platzhalter aus einer anderen Maschine ist kein Wert.")
und kein Kompromiss: eine Zeile mit `⬜ L13` ist prüfbar, eine Zeile mit einer geratenen Portnummer
ist es nicht.

⚠️ **Die zwei Bänder, die hier vorher standen, belegen die Regel nicht** und sind deshalb ersetzt:
`files-cutover.md:75-78` ist die Bestandsprobe §A (eine Tabelle mit `sqlite3`-Zählungen),
`lagerbuch-cutover.md:197` steht im Abschnitt über den stillen 404 bei falscher Hostzuordnung. Der
tragende Beleg ist `files-cutover.md:39-58`, dort `:57-58`.

### Die vier Stellen, an denen nicht ein Wert, sondern die STRUKTUR wartet

Nur hier hält eine offene Nummer die Arbeit tatsächlich an — weil sie nicht ein Feld füllt, sondern
entscheidet, **welcher Text überhaupt geschrieben wird**:

| Aufgabe | Was strukturell offen ist | Was trotzdem heute geht |
|---|---|---|
| **Nr. 31** (§F, Ausstellungsplan) | ⛔ **C.3 / E5** — sind gedruckte Aufsteller im Umlauf? Die **Zweigwahl** in §F | **Beide Zweige** werden ausgeschrieben (`2026-08-18-plan4-radio-cutover.md:2292-2293`: „die Entscheidung am Cutover-Abend kommt zu spät"). Was am Abend fehlt, ist nur noch die Wahl |
| **Nr. 20** (§P.10, browsergestützter Prüfsatz) | ⬜ **L9** — trägt `/` oder `/t/<code>` eine kamerabasierte Fläche? | Zweigwahl, **keine** Blockade (`2026-08-18-plan3-radio-generalprobe.md:91`). Stufe 3 wird in beiden Fassungen beschrieben |
| **Nr. 3 und Nr. 26** (`.env.example`, §B) | ⛔ **C.6 / B4** — zwei Rollen oder eine? | **Genau eine zusätzliche Zeile** hängt daran. Der Cutover ist ohne Antwort durchführbar (eine Rolle ist der engere Zuschnitt); die `.env` wäre dann nachträglich zu erweitern |
| **Nr. 27** (§C Schritt 1, Freeze) | ⛔ **U4 / C.5** — wer liefert das `radio-inventar`-Frontend aus? | Die Stopp-Befehl-**Tabelle** wird angelegt, Zeile 1 und 2 ausgeschrieben, **Zeile 3 als benannte Lücke**. Ausgeführt wird der Freeze ohne U4 nicht |

### Die Aufgaben, die ohne jede offene Nummer laufen

Diese sieben tragen in ihrem Planteil wörtlich **„Wartet auf: nichts"**:

| Nr. | Aufgabe | Beleg |
|---|---|---|
| **1** | Runbook anlegen — Kopf, ⚠️-Kopfabschnitt, §0, Abschnittsanker | `2026-08-18-plan4-radio-cutover.md:173` („Verbraucht: nichts") |
| **2** | `compose.yaml` — die sechs Redirect-Labels mit Regressionstest | `2026-08-18-plan4-radio-cutover.md:349` („nichts. Diese Aufgabe ist **ohne** Spec 1 ausführbar") |
| **4** | §L — der Leseapparat auf beiden Armen | `2026-08-18-plan2-radio-paritaet.md:687` („nichts aus dem Bau") |
| **5** | §V — die dreizehn Vorabfragen A1–A13 | `2026-08-18-plan2-radio-paritaet.md:885` |
| **6** | §S.1/§S.2 — Zeilenauswahl und die drei symmetrischen Abfragen | `2026-08-18-plan2-radio-paritaet.md:1286` |
| **7** | §S.3 — die Zeitstempel-Stichprobe | `2026-08-18-plan2-radio-paritaet.md:1480` |
| **8** | §S.4 — `devices.last_updated_at` | `2026-08-18-plan2-radio-paritaet.md:1667` |

**Dazu die zehn Aufgaben des Planteils 5 (Nr. 32–41).** Sein Kopf stellt es ausdrücklich fest: „Er
ist **heute vollständig abarbeitbar** — mit einer Ausnahme, die je Aufgabe benannt ist"
(`2026-08-18-plan5-radio-abbau.md:35-36`). Der Abbau läuft frühestens vierzehn Tage nach dem Umschwenk, „in einer
Sitzung, in der niemand mehr den Kontext dieses Abends hat. **Genau deshalb wird jeder Befehl
ausgeschrieben und nicht beschrieben**" (heute `2026-08-18-plan5-radio-abbau.md:46-49`).

**Empfohlener Einstieg:** Nr. 1 zuerst (die Datei muss existieren, alle anderen hängen an), dann
Nr. 2 und 3 (rollout-wirksam, sie müssen in einem **früheren** Rollout auf dem Server liegen), dann
Nr. 4–9 (der Prüfapparat, den Generalprobe **und** Fenster beide zitieren).

---

## Die Reihenfolge

Einundvierzig Aufgaben, durchgehend numeriert. **Die Schritte selbst bleiben im Teil** — hier steht,
in welcher Reihenfolge sie laufen und was jede von der vorigen braucht. Basisverzeichnis der Spalte
*Teil und Ankerüberschrift*: `docs/superpowers/plans/`.

Die §-Marken sind die **nach Nahtstelle NS2 verbindlichen**, nicht durchgehend die des Teiltextes.

| Nr. | Aufgabe | Teil und Ankerüberschrift | Wartet auf | Liefert |
|---|---|---|---|---|
| **1** | Runbook anlegen: Kopf, ⚠️-Kopfabschnitt, §0, Abschnittsanker | `2026-08-18-plan4-radio-cutover.md:166` → `## §0` | — | die Datei · die §0-Tabelle (E1–E8 · U4·U4a·U4b·U6–U9 · **N1–N10**) · die Überschriftenfolge (**24** Zeilen, NS2) |
| **2** | `compose.yaml`: sechs Redirect-Labels des Alt-Hosts + Regressionstest | `2026-08-18-plan4-radio-cutover.md:347` → `compose.yaml`, `scripts/compose-radio-redirect.test.ts` | — | die Labelgruppe `radio-admin-alt` · den grünen Test · ⬜ **N2** als Vorbedingung §A Nr. 14 |
| **3** | `.env.example`: `radio`-Block, Prod-Domain-Zeile, Rollback-Handgriff | `2026-08-18-plan4-radio-cutover.md:565` → `.env.example` | ⛔ C.6/B4 (**eine** Zeile) | `SUITE_REDIRECT_RULE_RADIO_ADMIN` und die Variablennamen für §B |
| **4** | §L — der Leseapparat auf beiden Armen, mit lauf-abhängiger Lesart | `2026-08-18-plan2-radio-paritaet.md:679` → `## §L` | — | Quellarm-Befehl · Zielarm-Befehl (`docker run … -v "$VOL_SUITE":/data`) · die Lauf-Tabelle mit **je Zeile ihrem Mount** · die Protokollzeile **E2**. ⚠️ **`VOL_SUITE=` wird hier NICHT gesetzt** — §L zeigt die Leseform mit **bereits gesetzter** Variablen und nennt §C Schritt 4 Handgriff 1 als ihren Ursprung (NS7a) |
| **5** | §V — die dreizehn Vorabfragen A1–A13 mit Ergebnisspalte | `2026-08-18-plan2-radio-paritaet.md:883` → `## §V` | — | A1–A13 (Befehl · Erwartet · Ergebnis) · die **sechs** Sollwerte aus A1 (fünf Tabellen + `api_tokens`) · **A9 beantwortet U7** |
| **6** | §S.1/§S.2 — Zeilenauswahl und die drei symmetrischen Abfragen | `2026-08-18-plan2-radio-paritaet.md:1280` → `## §S` | — | vier Auswahlregeln · **fünf** Paar-Auswahl-SQLs · drei symmetrische Stichproben |
| **7** | §S.3 — die Zeitstempel-Stichprobe, mit berichtigter Lesart | `2026-08-18-plan2-radio-paritaet.md:1475` → `### §S.3` | — | jüngste und älteste abgeschlossene Leihe · die vier Angaben der Retention-Kontrollgruppe |
| **8** | §S.4 — `devices.last_updated_at`, der Sonderfall | `2026-08-18-plan2-radio-paritaet.md:1661` → `### §S.4` | — | den **ausgeschriebenen** Sollwert (Berliner Kalendertag) samt Umschaltregel |
| **9** | §Z — die Gegenzählungen nach dem Import | `2026-08-18-plan2-radio-paritaet.md:1807` → `## §Z` | ⬜ L4 · ⬜ L5 | fünf Zielzählungen · drei Ziel-Invarianten · Nullprobe `zugangscodes` · der partielle Index · die zwei Bau-/Server-Ablesungen |
| **10** | §P.0 — Eingaben und Ablesungen der Generalprobe | `2026-08-18-plan3-radio-generalprobe.md:129` → `## §P.0` | — | `$IMG` · `$GP` · `$UID_APP`/`$GID_APP` · **E2** · ⬜ **N3** als Protokollzeilen |
| **11** | §P.1 — Was vor der Generalprobe grün sein muss | `2026-08-18-plan3-radio-generalprobe.md:269` → `## §P.1` | die Mapping-Unit-Tests (Kapitel 1) | die Protokollzeile **„Retention neutralisiert oder Volume kopiert, am ____"** — ⚠️ **vor dem ERSTEN Generalproben-Snapshot** (W1) |
| **12** | §P.2 — Der Schnappschuss der Alt-Datenbank | `2026-08-18-plan3-radio-generalprobe.md:405` → `## §P.2` | **E2** | `./radio-admin-snapshot.sqlite` · die **Hälfte von U8** (Dump-Dauer, Dateigröße `radio-admin`) |
| **13** | §P.3 — Die dreizehn Abfragen gegen die Kopie, vor dem Import | `2026-08-18-plan3-radio-generalprobe.md:538` → `## §P.3` | Nr. 5 (§V) | die **fünf** Sollwerte an Nr. 15 · die **A8-Vorhersage** an Nr. 17 · Haken **G1** |
| **14** | §P.4 — Wegwerf-Aufbau und Import | `2026-08-18-plan3-radio-generalprobe.md:652` → `## §P.4` | ⬜ L6 · ⬜ N3 | `$GP/data/radio.db` · die **Zählzeile des Importers** · die Lese-Regel für alle folgenden Abfragen · Haken **G2** |
| **15** | §P.5 — Die Gegenzählungen im Ziel | `2026-08-18-plan3-radio-generalprobe.md:872` → `## §P.5` | ⬜ L4 · Nr. 13 · Nr. 14 | Haken **G3** („fünf Zeilenzahlen im Ziel entsprechen den Sollwerten der Quelle") |
| **16** | §P.6 — Die fünf Verwechslungspaare, feldweise | `2026-08-18-plan3-radio-generalprobe.md:1041` → `## §P.6` | Nr. 6 (die fünf Auswahl-SQLs) · Nr. 12 · Nr. 14 | Haken **G4** („die fünf Verwechslungspaare stimmen **zeilengenau**") |
| **17** | §P.7 — Die Gegenprobe gegen den Faktor 1000 | `2026-08-18-plan3-radio-generalprobe.md:1245` → `## §P.7` | Nr. 13 (A8) · Nr. 14 | Haken **G5** („die Zeitstempel-Gegenprobe zeigt keinen 1970er-Stand") |
| **18** | §P.8 — Der ephemere Prüfcontainer | `2026-08-18-plan3-radio-generalprobe.md:1419` → `## §P.8` | ⬜ N3 · Nr. 10 · Nr. 14 | den Container **`radio-gp`** auf `127.0.0.1:3999` · die Basis-Variablen `B`/`H` |
| **19** | §P.9 — Der kopfgestützte Prüfsatz (Stufe 1) | `2026-08-18-plan3-radio-generalprobe.md:1740` → `## §P.9` | ⬜ L5 · ⬜ L7 · ⬜ L8 · ⬜ L10 · ⬜ N4 · Nr. 18 | V1–V8 an Haken **G6** · **die Vorlage für §C Schritt 8** |
| **20** | §P.10 — Der browsergestützte Prüfsatz (Stufe 3) | `2026-08-18-plan3-radio-generalprobe.md:1970` → `## §P.10` | ⬜ L9 (**Zweigwahl**) · Nr. 18 | V9–V16 an **G6** · die Zusage „der erste Code der Produktion entsteht NACH dem Umschwenk" |
| **21** | §P.11 — Das Log der Probe | `2026-08-18-plan3-radio-generalprobe.md:2146` → `## §P.11` | Nr. 18 | **die erste Rohzeile des Logs, ungefiltert** — sie macht die Präfixform aktenkundig (W6) |
| **22** | §P.12 — Aufräumen, und die zwei Messungen für das Fenster | `2026-08-18-plan3-radio-generalprobe.md:2238` → `## §P.12` | Nr. 12 · Nr. 18 | **U8** (Volumengröße und Dump-Dauer **beider** Stacks) an Nr. 25 · `radio-gp` entfernt, `$GP` gelöscht |
| **23** | §P.13 — Der Abbruchpunkt: was rot macht und was rot bedeutet | `2026-08-18-plan3-radio-generalprobe.md:2348` → `## §P.13` | Haken **G1–G6** (Nr. 13–20) | die Zusage **„es gibt keinen Cutover auf einer roten Generalprobe"** an Nr. 25 |
| **24** | §P.14 — Was am ephemeren Container nicht prüfbar ist | `2026-08-18-plan3-radio-generalprobe.md:2486` → `## §P.14` | Nr. 19 (V5, V6) · Nr. 20 (V13) | die **benannte** Restliste — statt einer stillen Lücke |
| **25** | §A — Was vor dem Fenster fertig sein muss (**vierzehn** Punkte) | `2026-08-18-plan4-radio-cutover.md:755` → `## §A` | ⬜ N2 (aus Nr. 2) · ⬜ N6 · **U8** (aus Nr. 22) · Nr. 23 | vierzehn Punkte, jeder mit Befehl und Ausgabefeld · ⛔ Nr. 13 (Router-Regel **beider** Hosts wörtlich) |
| **26** | §B — Die `.env`, mit genau **drei** ⏸-Zeilen | `2026-08-18-plan4-radio-cutover.md:972` → `## §B` | **E1** · **E4/C.2** · ⛔ C.6/B4 (eine Zeile) · Nr. 3 | den Env-Block · die Folgen-Tabelle · §B.1 Abbruch gegen still · §B.2 Rollback ist die **leere** Zeile · §B.3 der Redirect |
| **27** | §C Schritt 1–3 — Freeze, echter Snapshot, Volume sichern | `2026-08-18-plan4-radio-cutover.md:1200` → `## §C` | ⛔ **U4/C.5** · **E2** · **E3** · ⬜ N10 | **`<freeze_iso>`** (UTC) · die **drei** wörtlichen Stopp-Befehle (mit `--profile full-app`) · `radio-admin-snapshot.sqlite` · `radio-inventar-final-<stamp>.dump` |
| **28** | §C Schritt 4–5 — Import, Paritaet, Feldstichproben, Abfrage R und Abfrage Z | `2026-08-18-plan4-radio-cutover.md:1400` → `## §C` | ⬜ N3 · ⬜ N1 · Nr. 4 (§L.2) · Nr. 6–8 (§S) · Nr. 9 (§Z) · Nr. 27 | die `$VOL_SUITE`-Protokollzeile **des Fensters** (§5.2 liest ihren Namen vierzehn Tage später ein zweites Mal ab, NS7a) · fünf Zählungen · fünf Feldstichproben · **Abfrage R** und **Abfrage Z**, beide mit `<freeze_iso>` |
| **29** | §C Schritt 6–9 — `.env` scharf, `up -d`, Prüfcontainer, Router | `2026-08-18-plan4-radio-cutover.md:1718` → `## §C` | ⬜ L13 · ⬜ L14 · ⬜ L7 · ⬜ L8 · ⬜ L10 · ⛔ U4 · Nr. 19 · Nr. 26 · Nr. 28 | **`<umschwenk_iso>`** und **`<umschwenk_epoch_sekunden>`** · der Umschwenk als **EIN** Schritt |
| **30** | §D + §E — die Abnahme (**sechzehn** Punkte) und der Service Worker | `2026-08-18-plan4-radio-cutover.md:1965` → `## §D`, `## §E` | ⬜ L5 · ⬜ L7 · ⬜ L10 · ⬜ L11 · ⬜ L12 · **E6** · **E7** · ⬜ N5 · Nr. 29 | sechzehn Punkte mit Schreiblinie · §E.1/§E.2 (Abräum-Worker) · ⚠️ Nr. 14 (`RADIO_HISTORIE_PURGE=0` entfernen) **erst nach** Nr. 33 (W10) |
| **31** | §F + §G — Ausstellungsplan und Rückweg | `2026-08-18-plan4-radio-cutover.md:2271` → `## §F`, `## §G` | ⛔ **C.3/E5** · **E8** · **E4/C.2** · ⛔ **U4** · ⬜ **N7** (Zulässigkeit des Rückwegs 3a — **vor dem Fenster**, der Text geht heute) · Nr. 27 (Stopp-Tabelle) · Nr. 29 | beide C.3-Zweige · die drei Rückweg-Handgriffe **mit `--profile full-app`** · §F.4 (Ankündigung) · **sechs Zulieferungen an §H** (NS1) |
| **32** | §5.1 — Standby: drei Fristen und das Protokollformular | `2026-08-18-plan5-radio-abbau.md:151` → `## §5.1` | `<umschwenk_iso>` + `<umschwenk_epoch_sekunden>` (aus Nr. 29) | **Stunde 1** / **14 Tage** / **4 Wochen** als drei benannte Fristen · das Protokollformular in **beiden** Formaten · ⚠️ die **Umschlüsselungstabelle Runbook↔Spec** im Kopf von §5 (NS2) — §5.1 ist der erste §5-Abschnitt der Datei und trägt sie deshalb |
| **33** | §5.2 — Die Zählungen gegen radio-admin: A, T, R, Z und Abfrage 8 | `2026-08-18-plan5-radio-abbau.md:291` → `## §5.2` | Nr. 27 (Snapshot, `<freeze_iso>`) · Nr. 28 (`$VOL_SUITE`, R und Z) · Nr. 5 (A1-Sollwerte) · **E2** | die vier Sperren **A · T · R · Z** je mit *Erwartung · Abweichung bedeutet · Folge* · **Abfrage 8 = A9, beantwortet U7** |
| **34** | §5.3 — Die Zählungen gegen radio-inventar: P1 bis P6 | `2026-08-18-plan5-radio-abbau.md:615` → `## §5.3` | **E3** · ⬜ N10 · Nr. 27 (der Dump) | **P1–P6** · die Feststellung „**P6** ist die **einzige** Sicherung, die das Postgres-Volume je hatte" |
| **35** | §5.4 — Die Archivprobe: beide Dateien werden geöffnet | `2026-08-18-plan5-radio-abbau.md:834` → `## §5.4` | Nr. 27 (beide Archivdateien) · ⬜ N8 | die zwei Archivproben (a) und (b), **beide ⛔** · `.tables` = sechs · `integrity_check` = `ok` · `pg_restore --list` |
| **36** | §5.5 — Die Abbauliste und der Sperrenkasten | `2026-08-18-plan5-radio-abbau.md:933` → `## §5.5` | Nr. 33 · Nr. 34 · Nr. 35 · ⛔ **U4/C.5** · **U6** · ⬜ N9 | den ⛔-Sperrenkasten **„A, T, R, Z, P1–P4, P6 und beide Archivproben"** · vierzehn Posten mit Frist und Bedingung · den Abschnitt „Die benannte Lücke (U4/C.5)" |
| **37** | §5.6 — Die Geheimnisse: der Posten, der liegen bleibt | `2026-08-18-plan5-radio-abbau.md:1060` → `## §5.6` | **U4a** · **U6** · Nr. 36 (Posten 7) | zwei Wertetabellen · fünf Handgriffe · die Reihenfolge „Geheimnisse **mit** dem Volume, nicht davor" |
| **38** | §5.7 — Der alte Purge ist kein Cron | `2026-08-18-plan5-radio-abbau.md:1156` → `## §5.7` | **U4b** · ⬜ **N7** | „es gibt nichts abzuschalten — es gibt etwas **nicht zu starten**" · den `StartedAt`-Nachweis statt eines leeren Logs |
| **39** | §5.8 + §5.9 — Der Redirect und sein Ende · was der Abbau nicht anfasst | `2026-08-18-plan5-radio-abbau.md:1325` → `## §5.8`, `## §5.9` | ⬜ **N9** · **E7** · Nr. 2 (die sechs Labels) | die Reihenfolge **Labels → `.env` → DNS zuletzt** · Schritt 1 über den **Deploy-Pfad** |
| **40** | §H — Die Erfüllungspunkte: die Klammer, die um 23 Uhr gelesen wird | `2026-08-18-plan5-radio-abbau.md:1470` → `## §H` — **letzter Abschnitt der Datei** | **alle** vorigen · die Haken G1–G6 (Nr. 23) · §A und §D (Nr. 25, 30) · die **sechs Zulieferungen** aus Nr. 31 (NS1) | **achtunddreißig** Punkte, lückenlos 1–38, vier gegenüber Spec 2 berichtigt (3 · 9 · 17 · 29), Punkt 38 neu |
| **41** | Der datierte Nachtrag in Spec 2 — sieben Stellen und zwei Anhangszeilen | `2026-08-18-plan5-radio-abbau.md:1806` → `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` | Nr. 33 · Nr. 36 · Nr. 38 · Nr. 40 | eine Spec, deren Zahlen mit dem Runbook übereinstimmen · den berichtigten **Anhang A-3** |

⚠️ **Nr. 40 wird zuletzt geschrieben** — nicht aus Höflichkeit, sondern weil sie die Zahlen der
vorher geschriebenen Abschnitte **zählt** statt sie zu behaupten (`2026-08-18-plan5-radio-abbau.md:1472-1473`, Gegenprobe
`2026-08-18-plan5-radio-abbau.md:1656-1666`).

⚠️ **Die Reihenfolge ist eine Arbeitsordnung, keine Zwangsordnung.** Jede Aufgabe nennt in ihrem
Teil unter „Schnittstellen" vollständig, was sie voraussetzt; wer Nr. 32–39 vor Nr. 25–31 schreibt,
schreibt gültigen Text und füllt die Verweise später. **Was nicht tauschbar ist:** Nr. 1 vor allem
anderen (die Datei muss existieren), Nr. 2 und 3 vor dem Cutover-Abend (rollout-wirksam,
`scripts/deploy.sh:84-105`) und Nr. 40 zuletzt.

---

## Nahtstellen — was zwischen zwei Teilen auseinanderläuft, und was gilt

**Das ist der Zweck dieses Dokuments.** **Sechzehn Fälle in vierzehn Nummern** — `NS7a` und `NS11a`
sind Unterfälle von NS7 und NS11 und tragen deshalb keine eigene Zahl. Je Fall: was Teil X sagt, was Teil Y sagt,
**was gilt** — und warum. Wo ein Fall geprüft ist und **hält**, steht er trotzdem hier: eine Liste,
die nur Konflikte führt, wirft den Beleg weg, dass der Rest zusammenpasst.

### NS1 — Zwei Erfüllungslisten unter der Marke `## §H` ⛔ blockierend

**Teil 4** legt `## §H — Wann das Fenster erfüllt ist` als Abschnittsanker an
(`2026-08-18-plan4-radio-cutover.md:180`, `:323`) und füllt ihn in Aufgabe 10 Schritt 3 mit **zweiundzwanzig** Punkten
(`2026-08-18-plan4-radio-cutover.md:2497-2557`). Sein Modell: drei Listen — „Sie deckt **das Fenster** — Generalprobe
(§P) und Abbau (§S) führen ihre eigenen Punkte" (`2026-08-18-plan4-radio-cutover.md:2503-2504`).

**Teil 5** beansprucht `## §H` **allein** (`2026-08-18-plan5-radio-abbau.md:100-102`, `:1820-1821`) und füllt ihn mit
**achtunddreißig** Punkten, wörtlich aus Spec 2:4793–4846 übernommen, gruppiert in *Vor der
Generalprobe · Generalprobe · Vor dem Fenster · Im Fenster · Nach dem Umschwenk · Standby und
Abbau*.

**Es gilt Teil 5: `## §H` gehört Kapitel 5 allein und steht als letzter Abschnitt der Datei.
Teil 4 schreibt keinen zweiten `## §H`.**

**Warum — und der Grund ist mechanisch, nicht ästhetisch.** Teil 5s Gegenprobe lautet
`sed -n '/^## §H /,$p' docs/runbooks/radio-cutover.md | grep -oE '^- \[ \] [0-9]+\.'`, Erwartung
„1 2 … 38, jede Zahl **genau einmal**" (`2026-08-18-plan5-radio-abbau.md:1656-1661`). Ein zweiter `## §H` **vor** dem
echten lässt die `sed`-Spanne dort beginnen und beide Listen einschließen: die Gegenprobe wird **rot
bei richtiger Arbeit** und meldet Dubletten, die keine sind. Eine Prüfung, die beim korrekten
Zustand rot wird, wird beim zweiten Mal ignoriert.

**Und der inhaltliche Grund:** Spec 2 führt **einen** Erfüllungsblock (4784–4876), und Teil 5s
Punkte 13–26 decken **dasselbe Feld** wie Teil 4s Punkte 7–22 — es ist kein Komplement, sondern
dieselbe Fläche zweimal. Zwei Listen mit verschiedenen Zahlen im Kopf sind genau der W8-Fehler
(Spec 2:520-529). Die Hausform hat **eine** Klammer am Ende (`files-cutover.md:360-370`).

⚠️ **Teil 4s Text geht dabei nicht verloren — er ist an sechs Stellen schärfer, und diese sechs sind
Zulieferungen an §H** (Aufgabe Nr. 31 liefert sie, Aufgabe Nr. 40 nimmt sie auf):

| # | Was Teil 4 hat und Teil 5 fehlt | Ziel in §H |
|---|---|---|
| 1 | „**§A Nr. 1–14**" statt „§4.2 Nr. 1–13" — Nr. 14 ist der ausgerollte `compose.yaml`-Stand (⬜ N2) | Punkt 9 |
| 2 | „**Die drei Stopp-Befehle stehen wörtlich im Protokoll**, Zeile 3 (U4) ausgefüllt" | Punkt **14** (er trägt bereits `.backup` und die Zählkette) |
| 3 | „**Die Container-ID hat sich geändert**: vorher ____ / nachher ____ — **gleich ist ein Stopp-Punkt**" | Punkt **19** (er trägt bereits Schritt 9) |
| 4 | „samt der **`localtest.me`-Probe** auf der angemeldeten Verwaltungsfläche" | Punkt 20 |
| 5 | „Das Backup ist einmal von Hand gelaufen — **mit der Env aus ⬜ N5**" | Punkt 24 |
| 6 | „**N1–N10 ausgefüllt**" statt „die vier N-Leerstellen dieses Kapitels" (NS6) | Punkt 38 |

⛔ **Alle sechs werden als NEBENSATZ eines bestehenden Punktes aufgenommen, nie als neue Nummer.**
Sonst hätte §H vierzig Punkte, Teil 5s Gegenprobe (`2026-08-18-plan5-radio-abbau.md:1656-1666`: „1 2 … 38, jede Zahl
**genau einmal**", zweite Zählung Erwartung 37) würde **rot bei richtiger Arbeit**, und der Kopfsatz
„achtunddreißig Punkte, nicht siebenunddreißig" wäre falsch. **Die Zahl bleibt achtunddreißig.**
Das ist derselbe Mechanismus, mit dem diese Nahtstelle oben entschieden wurde — er gilt auch gegen
die eigene Nacharbeit.

⛔ **Eine Gegenlesung wandert NICHT mit — sie entfällt, weil sie am Ziel schon steht.**
`2026-08-18-plan4-radio-cutover.md` (heute `:2649`, Wortlaut `rtk grep -n '§A Nr. 1–14 vollständig'`) prüft (Erwartung: 1 Treffer — ⚠️ die
Suchform ist am 2026-08-19 um „vollständig" erweitert worden, weil die nackte Zeichenkette im
zusammengeführten Runbook **zweimal** steht: Erfüllungspunkt und §H-Kopfregel) innerhalb der
§H-Gegenlesung von Teil 4. Nachgemessen 2026-08-19: **`2026-08-18-plan5-radio-abbau.md:1749` prüft genau dasselbe**
— `grep -c '§A Nr. 1–14 vollständig' docs/runbooks/radio-cutover.md   # Erwartung: 1` — und steht
**bereits** in der Gegenprobe von Aufgabe **Nr. 40**, in Block „(b) die vier berichtigten Punkte
stehen berichtigt da", mit demselben „vollständig" und derselben Begründung in den Zeilen darunter
(`:1750-1757`).

**Entschieden: dieses Tor in `2026-08-18-plan4-radio-cutover.md` (heute `:2649`) entfällt ersatzlos**, zusammen mit dem `## §H`-Block, der sie
beherbergt. `2026-08-18-plan5-radio-abbau.md:1749` **bleibt und bleibt unverändert** — sie ist die schärfere Form
(`grep -c` mit `# Erwartung: 1` prüft „genau einer", `grep -n` mit „1 Treffer" nur, dass einer
dasteht) und sie zielt bereits auf Punkt 9, also auf Zulieferung 1. ⛔ **Nicht beide aufnehmen:** zwei
deckungsgleiche Prüfungen in derselben Gegenprobe sind der W8-Fehler, gegen den NS1 oben entschieden
hat.

**Zu ändern:** `2026-08-18-plan4-radio-cutover.md` Aufgabe 1 Schritt 4 (Ankerliste, Zeile 323) und Aufgabe 10 Schritt 3
(`:2497-2557`, die `## §H`-Überschrift entfällt, die sechs Zeilen werden Zulieferung); `2026-08-18-plan5-radio-abbau.md`
Aufgabe 5.9 nimmt die sechs auf. **Betroffen: 20 `§H`-Stellen in Teil 4, 17 in Teil 5** — roh
gezählt (`grep -o '§H\b' | wc -l`). ⚠️ **Drei davon werden leicht übersehen**, weil sie nicht im
Aufgabentext stehen, sondern in der Leerstellentabelle des Teils: `2026-08-18-plan5-radio-abbau.md:116` („§H Punkt 3"),
`:117` („§H Punkt 30"), `:118` („§H Punkt 35") — es sind echte `§H`-Verweise, und sie sind es, die
die N-Leerstellen an ihre Erfüllungspunkte binden.

### NS2 — Die Abschnittsmarken des Runbooks: vier Teile, vier Namensräume ⛔ blockierend

Vier Teile vergeben Marken in **derselben Datei**, und keiner sieht die anderen drei:

| Teil | beansprucht | Beleg |
|---|---|---|
| 2 | `§L` · `§V` · `§S` · `§Z` | `2026-08-18-plan2-radio-paritaet.md:2007` |
| 3 | `§G0`–`§G14`, ausdrücklich **vorläufig** | `2026-08-18-plan3-radio-generalprobe.md:62-65` |
| 4 | `§0` · `§P` · `§A`–`§H` · `§S`, Erwartung „exakt **12** Zeilen" | `2026-08-18-plan4-radio-cutover.md:313-334` |
| 5 | `§5.1`–`§5.9` · `§H` | `2026-08-18-plan5-radio-abbau.md:88-102` |

**Drei Kollisionen und eine Lücke:** `§S` = Feldstichproben (Teil 2) **gegen** Standby und Abbau
(Teil 4) · `§G0`–`§G14` (Teil 3) **neben** `§G` = Rückweg (Teil 4) · `§H` (NS1) · und Teil 2s vier
Marken haben in Teil 4s Überschriftenfolge **überhaupt keinen Platz**.

**Verbindlich ist ab hier diese Folge — vierundzwanzig `##`-Überschriften:**

| # | Marke | Inhalt | Aufgabe |
|---|---|---|---|
| 1 | (⚠️-Kopfabschnitt) | „Was dieses Runbook nicht ist" | 1 |
| 2 | `## §0` | Eingaben: E · U · C · N | 1 |
| 3 | `## §L` | Der Leseapparat auf beiden Armen | 4 |
| 4 | `## §V` | Die dreizehn Vorabfragen A1–A13 | 5 |
| 5 | `## §S` | Die Feldstichproben (§S.1–§S.4) | 6–8 |
| 6 | `## §Z` | Die Gegenzählungen nach dem Import (§Z.1–§Z.7) | 9 |
| 7 | `## §P` | Generalprobe (**§P.0–§P.14**) | 10–24 |
| 8–14 | `## §A` … `## §G` | Vorbedingungen · `.env` · das Fenster · Abnahme · Service Worker · Ausstellungsplan · Rückweg | 25–31 |
| 15–23 | `## §5.1` … `## §5.9` | Standby und Abbau | 32–39 |
| 24 | `## §H` | Wann dieser Cutover erfüllt ist | 40 |

**Die drei Entscheidungen und ihre Begründung:**

1. **`§S` gehört Teil 2** (Feldstichproben), und **`## §S — Standby und Abbau` entfällt aus Teil 4s
   Ankerliste.** Teil 5 schreibt direkt `## §5.1`–`## §5.9`. **Der Grund ist allein der Preis:**
   **157** `§5.x`-Stellen in Teil 5 gegen **46** `§S`-Stellen in Teil 2 gegen **9** `§S`-Verweise in
   Teil 4. Es werden die neun geändert.

   ⚠️ **Der Grund, den Teil 5 selbst angibt, trägt NICHT** — und diese Zeile stand hier vorher
   falsch. Teil 5 begründet seine Marken mit „damit ein Sprung vom Runbook in die Spec auf derselben
   Zahl landet" (`2026-08-18-plan5-radio-abbau.md:90-91`), setzt also voraus, sie seien **zeichengleich die Nummern der
   Spec**. Seine eigene Zuordnungstabelle unmittelbar darunter (`2026-08-18-plan5-radio-abbau.md:89-100`) sagt das
   Gegenteil: nur `§5.1` trifft, `§5.2` trifft halb (Spec `§5.2.1`–`§5.2.2`), **ab `§5.3` ist das
   Runbook gegenüber der Spec um zwei verschoben** (Runbook `§5.3` = Spec `§5.2.3` · `§5.4` =
   `§5.2.4` · `§5.5` = `§5.3` · `§5.6` = `§5.4` · `§5.7` = `§5.5` · `§5.8` = `§5.6` · `§5.9` =
   `§5.7`), und `§5.8`/`§5.9` haben in der Spec **überhaupt keine Entsprechung** — Kapitel 5 endet
   bei `§5.7` (Spec 2:4763). Der Schaden ist nicht theoretisch: „siehe §5.5" heißt im Runbook die
   Abbauliste und in der Spec „Der alte Purge ist kein Cron"; „§5.3" heißt im Runbook P1–P6 und in
   der Spec die Abbauliste. Beide Dokumente liegen am Abbautag nebeneinander, und in Teil 5 ist die
   Verwechslung schon einmal passiert (`2026-08-18-plan5-radio-abbau.md:1747` „§5.3 Posten 6" gegen `:1531`/`:1844` „§5.5
   Posten 6" — beide je in ihrem Kontext richtig, aber der Leser muss den Kontext kennen).

   ⛔ **Daraus folgt eine Auflage, die die Entscheidung erst tragfähig macht: in den Kopf von `§5`
   des Runbooks gehört eine Umschlüsselungstabelle Runbook↔Spec** — genau die Form, die Spec 2 für
   ihre eigenen Kapitelnummern führt (Spec 2:130-146). Sie wird von Aufgabe **Nr. 32** geschrieben
   (`2026-08-18-plan5-radio-abbau.md:151`, `## §5.1` ist der erste `§5`-Abschnitt der Datei).
2. **`§G0`–`§G14` werden zu `§P.0`–`§P.14`.** Teil 4 hat den Anker `## §P — Generalprobe` bereits
   reserviert (`2026-08-18-plan4-radio-cutover.md:313`), und `§G7` **neben** `§G` (Rückweg) ist genau die Verwechslung,
   die um 23 Uhr passiert. **269** Stellen in Teil 3 — mechanisch ersetzbar, weil Teil 3 die Marken
   selbst als **vorläufig** führt und **jeder** Querverweis zusätzlich die Aufgabennummer trägt
   (`§G7 / Aufgabe 8`, `2026-08-18-plan3-radio-generalprobe.md:62-65`). Die Verweiskette überlebt die Umnummerierung.
3. **`§H` gehört Teil 5** (NS1).

⚠️ **Folge für die Gegenprobe:** `2026-08-18-plan4-radio-cutover.md:334` erwartet „exakt … **12** Zeilen". Die neue
Erwartung ist **24**, und die Liste im Befehl ist gegen die Tabelle oben auszutauschen.

### NS3 — `§A` meint in Teil 3 etwas anderes als in Teil 4 ⛔ blockierend

**Teil 3** nennt den Abschnitt mit den dreizehn Vorabfragen durchgehend `§A`: „Zwei Abschnitte
gehören anderen Planteilen … `§A` (die dreizehn Vorabfragen A1–A13, Kapitel 2)"
(`2026-08-18-plan3-radio-generalprobe.md:67`), und danach vierzehnmal im Text — „Der vollständige Wortlaut aller
dreizehn Abfragen steht in §A" (`:560`), `<das SQL aus §A>` (`:569`), `<id aus der Auswahl in §A>`
(`:1118`, `:1122`, `:1127`, `:1156`).

**Teil 2** nennt denselben Abschnitt `§V` (`2026-08-18-plan2-radio-paritaet.md:883`, `:899`, `:2007`).
**Teil 4** belegt `§A` mit **„Was vor dem Fenster fertig sein muss"** (`2026-08-18-plan4-radio-cutover.md:776`).

**Es gilt `§V` für die Vorabfragen und `§A` für die Vorbedingungen.** Teil 2 ist der Eigentümer des
Abschnitts und benennt ihn; Teil 4 ist der Eigentümer der Überschriftenfolge und hat `§A` zuerst
belegt. Teil 3 hat beides nicht gesehen und die Zahl geschätzt, die es nicht kennen konnte — derselbe
Vorgang wie die Kapitelnummern-Umschlüsselung in Spec 2:148-180, und deshalb **keine inhaltliche
Divergenz, sondern eine Normalisierung.**

**Zu ändern:** die **14** `§A`-Stellen in `2026-08-18-plan3-radio-generalprobe.md` werden `§V`. ⚠️ **Die
`<id aus der Auswahl in §A>`-Platzhalter behalten ihre Form** — sie benennen Herkunft **und**
Fundort und sind genau deshalb richtig (`2026-08-18-plan3-radio-generalprobe.md:1232`); nur die Marke wechselt.

### NS4 — `§I` hat keinen Eigentümer

**Teil 3** verweist viermal auf einen Runbook-Abschnitt `§I`: „`§I` (der Importer und seine
Aufrufform, Kapitel 1)" (`:67`), „Ziel gesteuert über `DATA_DIR` (§1.5.3, Abschnitt §I dieses
Runbooks)" (`:666`), „(§I / Kapitel 1, §1.5.3)" (`:768`), und in der Zusagenliste (`:2615`).

**Niemand schreibt ihn.** Teil 2 schließt ihn ausdrücklich aus („Der Snapshot-**Befehl** und der
Freeze … erzeugt wird er anderswo", `2026-08-18-plan2-radio-paritaet.md:2019`), Teil 4s Überschriftenfolge kennt kein
`§I`, und **Kapitel 1 ist ein Code-Plan** — er erzeugt `scripts/import/radio.ts`, keinen
Runbook-Abschnitt.

**Es gilt: es gibt keinen `§I`.** Die Aufrufform ist **eine Zeile**, und sie steht bereits zweimal
ausgeschrieben da, wo sie gebraucht wird: `DATA_DIR="$GP/data" pnpm exec tsx scripts/import/radio.ts
./radio-admin-snapshot.sqlite` in §P.4 (`2026-08-18-plan3-radio-generalprobe.md:759`) und in §C Schritt 4
(`2026-08-18-plan4-radio-cutover.md`, Aufgabe 7). Ein eigener Abschnitt für eine Zeile erzeugt eine **zweite Fassung** —
und der Hausgrund dagegen steht in `lagerbuch-cutover.md:365-366`: „dort und nur dort, damit es eine
Fassung gibt und nicht zwei."

**Zu ändern:** die **4** `§I`-Stellen in `2026-08-18-plan3-radio-generalprobe.md` werden zu „**Spec 2 §1.5.3**; die
Aufrufform steht ausgeschrieben in §P.4".

### NS5 — `§Z` (Abschnitt) gegen „Abfrage Z" (die zehnzeilige Grenzprobe)

**Teil 2** belegt `## §Z` mit den **Gegenzählungen nach dem Import** — §Z.1 bis §Z.7, fünf
Zeilenzahlen, drei Invarianten, Nullprobe, Index, Retention-Kontrollgruppe
(`2026-08-18-plan2-radio-paritaet.md:1826-1975`).
**Teil 4 und Teil 5** nennen die **zehnzeilige Zeitstempel-Grenzprobe** „Z" — teils als „Abfrage Z"
(`2026-08-18-plan5-radio-abbau.md:499`), teils bloß als „Z": „R und Z grün" (`2026-08-18-plan4-radio-cutover.md:2530`), „Z: alle zehn Zeilen
`0`".

**Es gilt: der Abschnitt bleibt `§Z`, die Probe heißt IMMER „Abfrage Z" — nie bloß „Z".** Kein
Zeichen wird umbenannt (33 `§Z`-Stellen in Teil 2 bleiben); geändert wird eine Schreibweise. Der
Grund: in **einer** Datei bedeutet „siehe Z" dann zweierlei, und der Fehlfall ist stumm — wer in §H
Punkt 17 „Z" als Abschnittsverweis liest, hakt die Gegenzählungen ab und lässt die zehn
Grenzproben ungelesen. Dieselbe Regel gilt für **Abfrage R**, **Abfrage A**, **Abfrage T** und
**Abfrage 8**: mit dem Wort davor, ausnahmslos.

### NS6 — Die N-Nummern: dreizehn Marken, zehn Fragen, vier Kollisionen ⛔ blockierend

Vier Planteile haben je eigene N-Nummern vergeben, weil die ⬜/E/U/C-Tabellen des Rahmens die Lücke
nicht führen. **Jeder hat bei `N1` angefangen.**

| Marke | Teil 2 | Teil 3 | Teil 4 | Teil 5 |
|---|---|---|---|---|
| `N1` | `radio.db` dauerhaft offen? | Pfad der `sw.js`-Route | `compose.yaml` ausgerollt? | `HISTORY_RETENTION_MONTHS` konfigurierbar? |
| `N2` | Exportnamen der Tabellenobjekte | Kennung des Suite-Prozesses | Kennung des Suite-Prozesses | Ziel der Archivdateien |
| `N3` | — | — | Env des Backup-Cron | Traefik-Zugriffsprotokoll |
| `N4` | — | — | `radio.db` dauerhaft offen? | Ort der Alt-Checkouts |
| `N5` | — | — | Edge-Proxy | — |

**Vier Marken, ein Wort, vier verschiedene Fragen** — und zugleich **zwei Fragen unter zwei Marken**
(Teil 2 `N1` = Teil 4 `N4`; Teil 3 `N2` = Teil 4 `N2`). Teil 4 vermerkt für die erste selbst, die
Re-Kritik habe sie `L15` genannt: „**eine** Nummer, nicht zwei" (`2026-08-18-plan4-radio-cutover.md:139`, `:2692`).

**Verbindlich ist ab hier eine flache Numerierung N1–N10:**

| neu | Was genau abzulesen ist | Quelle | alt |
|---|---|---|---|
| **N1** | Hält der reguläre Stack `radio.db` **nach dem Boot dauerhaft offen**? Zwei der drei Wege schließen nachweislich (`src/core/bootstrap.ts:99-105`, `src/core/health/index.ts:13-15`), der dritte ist ungebaut | Bau / Abruf | Teil 2 `N1` = Teil 4 `N4` (Re-Kritik: `L15`) |
| **N2** | Ist die `compose.yaml` **mit** der `radio-admin-alt`-Labelgruppe auf dem Server ausgerollt? | Server | Teil 4 `N1` |
| **N3** | Die **tatsächliche** numerische Kennung des laufenden Suite-Prozesses (`SUITE_USER` bzw. `docker inspect`) — **nicht** die des Images | Server | Teil 3 `N2` = Teil 4 `N2` |
| **N4** | Der Pfad der `sw.js`-Route unter `src/app/m/radio/`, und damit die interne URL-Form | Bau (Spec 1 §7.1.3) | Teil 3 `N1` |
| **N5** | Mit welcher Env läuft der Host-Cron `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`), und wo landet das Tarball? | Server / Betreiber | Teil 4 `N3` |
| **N6** | Der Edge-Proxy: (a) setzt er `X-Forwarded-Host` oder reicht er ihn durch, (b) welche Entrypoints gibt er an Traefik weiter, (c) ist `radio-admin.iuk-ue.de` dort bekannt | Server | Teil 4 `N5` |
| **N7** | Ist die Zwei-Monats-Frist im **produktiv laufenden** `radio-admin` konfigurierbar? Gemessen an `265abd5` ist sie es **nicht** | Server (Image-Herkunft) | Teil 5 `N1` |
| **N8** | **Wohin gehen die zwei Archivdateien?** Zielsystem, Zugriffsweg, Person — und der Beleg, dass es **nicht** der Suite-Server ist | Betreiber | Teil 5 `N2` |
| **N9** | Gibt es ein Traefik-Zugriffsprotokoll, wo liegt es, wie lange wird es vorgehalten? | Server (E7 nennt den Container) | Teil 5 `N3` |
| **N10** | Wo liegen die zwei **Alt-Checkouts** auf dem Server — das Arbeitsverzeichnis der `docker compose -f …`-Befehle? | Server | Teil 5 `N4` |

⛔ **Eine Marke wird nicht umgeschlüsselt, sondern gestrichen: Teil 2 `N2` — „die Exportnamen der
fünf Tabellenobjekte in `src/app/m/radio/_db/schema.ts"" — ist keine Leerstelle.** Spec 1 schreibt
alle fünf als `export const` aus:
`docs/superpowers/specs/2026-08-17-radio-modul-design.md:1206` (`devices`), `:1254`
(`softwareVersions`), `:1298` (`users`), `:1311` (`deviceEvents`), `:1349` (`loans`) — dazu `:1394`
(`zugangscodes`) als sechstes. Der Bau-Leitplan hat das unabhängig gemessen und die Frage in seiner
Nahtstelle **NS6** für aufgelöst erklärt (dort heute noch `N6` geschrieben — seine Nahtstellen werden
auf `NS1`–`NS11` umgestellt, damit der Buchstabe `N` allein den Leerstellen gehört, wie hier);
dieser Leitplan hat sie danach als neue `N1` **wieder eröffnet**,
und das war der Fehler. Eine Leerstelle, die eine belegte Frage stellt, kostet dreifach: eine Zeile
in §0, einen offenen Haken in §H Punkt 38 und eine Ablesung, die an einen Plan geht, der sie
abgelehnt hat. **Sie entfällt ersatzlos; die Numerierung rückt auf.**

⚠️ **Folge für die Übergabe aus dem Bau-Leitplan, und sie ist günstig:** dessen Zeilen `:378` und
`:475` übergeben „⬜ N1" an diesen Leitplan und meinen damit „hält der Stack `radio.db` offen?".
Nach der Tabelle oben heißt diese Frage **N1** — die Übergabe trifft ab jetzt in **beiden**
Dokumenten dieselbe Nummer, wo sie vorher auf `N2` zielte und auf einer beantworteten Frage landete.

⚠️ **Warum flach und nicht teilweise geprefixt:** die Liste wird in §0 **einmal** geführt und in §H
Punkt 38 **einmal** abgehakt. `N4.2` neben `N5.1` neben `N2` ist um 23 Uhr keine Liste, sondern eine
Tabelle mit Fußnoten. Und die Zusammenführung war ohnehin angekündigt: „Die Zusammenführung sammelt
sie ein" (`2026-08-18-plan4-radio-cutover.md:43`).

**Zu ändern:** `2026-08-18-plan4-radio-cutover.md` §H Punkt 4 („N1–N5") und die N-Tabelle (`:135-143`); `2026-08-18-plan5-radio-abbau.md` §H
Punkt 38 („die vier N-Leerstellen") und die N-Tabelle (`:113-121`); die N-Zeilen in
`2026-08-18-plan2-radio-paritaet.md:80`, `:84` und `2026-08-18-plan3-radio-generalprobe.md:94`, `:95`.

⛔ **Und zwei Stellen, die bisher niemand geführt hat — sie stehen im RUNBOOK-Text, nicht in einer
planinternen Tabelle, und ohne sie wird ein Tor rot bei richtiger Arbeit:**

* **`2026-08-18-plan4-radio-cutover.md:287-291`** — die §0-Eingabentabelle des Runbooks trägt heute fünf N-Zeilen (`N1`
  compose ausgerollt · `N2` Kennung · `N3` Backup-Env · `N4` `radio.db` offen · `N5` Edge-Proxy).
  Sie sind **umzubenennen** (→ `N2` · `N3` · `N5` · `N1` · `N6`), und **fünf neue kommen hinzu**:
  `N4` (Pfad der `sw.js`-Route), `N7` (Zwei-Monats-Frist konfigurierbar), `N8` (Ziel der
  Archivdateien), `N9` (Traefik-Zugriffsprotokoll), `N10` (Ort der Alt-Checkouts).
* **`2026-08-18-plan4-radio-cutover.md:337`** — das Tor darauf lautet `rtk grep -c '^| [EUN][0-9]'
  docs/runbooks/radio-cutover.md` mit **Erwartung: 20** (E1–E8 = 8 · U4·U4a·U4b·U6–U9 = 7 · N1–N5 =
  5). Mit zehn N-Zeilen ist die **neue Erwartung 25**. Wer nur die Tabelle ändert und das Tor stehen
  lässt, hat eine Prüfung, die den korrekten Zustand meldet — und die beim zweiten Lesen abgehakt
  wird.

### NS7 — `$VOL` gegen `$VOL_ADMIN` für dieselbe Eingabe E2

**Teil 2** (`2026-08-18-plan2-radio-paritaet.md:730`) und **Teil 4** (`2026-08-18-plan4-radio-cutover.md:1310`) setzen
`VOL=<die Zeile aus dem Befehl oben>` für den Volume-Namen von `radio-admin`.
**Teil 3** (`2026-08-18-plan3-radio-generalprobe.md:453`) setzt `VOL_ADMIN=…` — für **denselben** Wert **E2**.

**Es gilt `$VOL_ADMIN`, in allen Abschnitten.** Der Grund ist der Nachbar: dieselbe Datei führt
`$VOL_SUITE` für das **Ziel**volume, an sieben Stellen von §L, §C und §5.2. `$VOL` neben
`$VOL_SUITE` ist ein Zeichen Unterschied zwischen Quelle und Ziel — und die scharfe Warnung dazu
steht schon im Text: ein erfundener oder verwechselter Volume-Name „legt ein **neues, leeres**
Volume an, und der Befehl darunter meldet dann Erfolg über eine leere Datenbank"
(`2026-08-18-plan3-radio-generalprobe.md:447-449`).

**Zu ändern: 2 Stellen in `2026-08-18-plan2-radio-paritaet.md`, 5 in `2026-08-18-plan4-radio-cutover.md`.** Die günstigste Nahtstelle dieser
Liste — sieben Zeichen gegen einen Befehl, der Erfolg über eine leere Datenbank meldet.

⚠️ **E2 ist ausdrücklich NICHT derselbe Fall.** Teil 2, 3 und 4 setzen ihn je einmal, und das ist
**erlaubt**: das Dreier-Tor verlangt, dass eine Variable „im Abschnitt selbst noch einmal gesetzt
oder namentlich als Voraussetzung genannt" wird (`2026-08-18-plan3-radio-generalprobe.md:36-40`) — die drei Abschnitte
laufen an drei verschiedenen Abenden. Hier wechselt nur der **Name**, nicht die Anzahl.

### NS7a — `VOL_SUITE=` wird dreimal gesetzt, und ein Tor zählt eins ⛔ blockierend

`VOL_SUITE=<die Zeile aus dem Befehl oben>` steht an **drei** Stellen: **Teil 2** in §L.2
(`2026-08-18-plan2-radio-paritaet.md:766`), **Teil 4** in §C Schritt 4 Handgriff 1 (`2026-08-18-plan4-radio-cutover.md:1472`) und **Teil 5**
in §5.2, im Zielarm der Abfrage A (`2026-08-18-plan5-radio-abbau.md:441`). Teil 4 prüft danach mit einem Tor:
`rtk grep -n 'VOL_SUITE=' docs/runbooks/radio-cutover.md`, ursprünglich mit dem Kommentar
„`$VOL_SUITE` wird an genau **einer** Stelle **GESETZT** und sonst nur benutzt" und **Erwartung: 1
Treffer**. Nach der Zusammenführung läse das Tor **3** — **rot bei richtiger Arbeit**, derselbe
Mechanismus wie in NS1. ✅ **Nachgeprüft 2026-08-19: das Tor trägt die Berichtigung bereits** —
`2026-08-18-plan4-radio-cutover.md:1743` „`$VOL_SUITE` wird an genau ZWEI Stellen GESETZT, beide namentlich", Befehl
`:1746`.

**Es gilt: `VOL_SUITE=` wird ZWEIMAL gesetzt — in §C Schritt 4 Handgriff 1 und in §5.2 —, und das
Tor wird auf `Erwartung: 2 Treffer — §C Schritt 4 Handgriff 1 und §5.2, beide namentlich` gesetzt.
§L.2 gibt seine Zuweisung ab: es zeigt die Leseform mit bereits gesetzter Variablen und nennt §C
Schritt 4 als ihren Ursprung.**

**Warum §L.2 abgibt und §5.2 behält** — es sind zwei verschiedene Fälle, und nur einer ist eine
Dublette. §L.2 steht **im selben Lauf** wie §C: dieselbe Sitzung, dieselbe Shell, dieselbe halbe
Stunde. Eine zweite Zuweisung dort ist eine zweite Ablesung desselben Werts wenige Zeilen neben der
ersten — genau die Dublette, die Teil 5s Verbrauchstabelle ausschließt, wenn sie `$VOL_SUITE` mit
„Entsteht in: **§4.5 Schritt 4 Handgriff 1**" führt (`2026-08-18-plan5-radio-abbau.md:146`). **§5.2 dagegen läuft
frühestens vierzehn Tage nach dem Umschwenk**, in einer neuen Shell, in der die Zuweisung aus §C
längst weg ist (`2026-08-18-plan5-radio-abbau.md:46-49`: „in einer Sitzung, in der niemand mehr den Kontext dieses Abends
hat"). Wird ihr die Ablesung gestrichen, erbt die Abbau-Sitzung eine **ungesetzte** Variable — und
jede der acht Abbau-Sperren liest dann ein leeres Volume, dessen Nullen wie ein Datenbefund aussehen.
Teil 5 schreibt seine Ablesung deshalb mit voller Begründung und mit der `ls -ln`-Gegenprobe darunter
(`2026-08-18-plan5-radio-abbau.md:425-450`: „Steht dort NUR `radio.db`, ist der Volume-Name falsch … JEDE folgende 0 ist
ein Volume-Fehler, kein Datenbefund", die Sätze selbst `:448-450`).

⚠️ **Teil 2s eigene Zusage bleibt gültig, aber enger gefasst:** „⛔ **`$VOL_SUITE` wird einmal
abgelesen und mehrfach gelesen.** Wer in §5.2.2 eine zweite Ablesung anlegt …" (heute
`2026-08-18-plan2-radio-paritaet.md:1985`, Tabellenzeile dazu `:1982`; die alte Angabe `:1973` ist veraltet)
richtet sich gegen eine Ablesung **im selben Lauf** und trifft §5.2 nicht, das in einer anderen
Sitzung liest. Die Zeile ist im Zuge dieser Nahtstelle nachzuziehen, sonst argumentiert Teil 2 gegen
eine Entscheidung, die dieses Dokument getroffen hat.

⛔ **Was den zweiten Wert absichert — ohne das wäre die Doppelablesung wirklich gefährlich:** die zwei
Ablesungen könnten **verschiedene** Volumes treffen (Tippfehler, ein Präfix, ein zweiter Stack), und
die Folge wäre stumm. **Die Bedingung lautet: die zwei Ablesungen müssen DENSELBEN Namen ergeben,
und der Wert aus §5.2 ist gegen das Fenster-Protokoll (§C Schritt 4 Handgriff 1) gegenzulesen, bevor
eine einzige Zahl gezählt wird; ein abweichender Name ist ein Stopp-Punkt und kein Tippfehler.**

⚠️ **Nachgeprüft, und das Ergebnis spart eine Nacharbeit: Teil 5 trägt diese Bedingung bereits
ausgeschrieben** — `2026-08-18-plan5-radio-abbau.md:433-439`: „⛔ BEIDE Ablesungen MUESSEN denselben Namen ergeben. Der
hier abgelesene Wert wird gegen die Protokollzeile aus §4.5 Schritt 4 Handgriff 1 GEGENGELESEN, bevor
eine einzige Zahl gezaehlt wird. … Stopp-Punkt, kein Datenbefund", darüber (`:426-432`) die
Begründung, warum der Wert hier **nicht geerbt** wird (neue Shell, vierzehn Tage später), und **ein
zweites Mal** im Protokollformular bei `:392-395` („⛔ gegengelesen gegen die Protokollzeile aus §4.5
Schritt 4 Handgriff 1 … ☐ **abweichend → Stopp**"). **Es ist
nichts zu ergänzen; die Zeile ist zu erhalten.** Wer diese Nahtstelle abarbeitet, streicht sie also
**nicht** mit der Zuweisung aus §L.2 zusammen — es sind zwei verschiedene Fälle.

**Zu ändern: `2026-08-18-plan2-radio-paritaet.md:766`** (Zeile `VOL_SUITE=<die Zeile aus dem Befehl oben>` entfernen, dazu
der Satz, der §C Schritt 4 als Ursprung nennt) **und das Tor `rtk grep -n 'VOL_SUITE='` in
`2026-08-18-plan4-radio-cutover.md`** (heute `:1743-1746`, auf 2 Treffer, beide namentlich — ✅ **dort bereits ausgeführt**).
Dazu `2026-08-18-plan2-radio-paritaet.md` (heute `:1985`), dessen ⛔-Zusage den Geltungsbereich „im selben Lauf" bekommt.
`2026-08-18-plan5-radio-abbau.md` §5.2 bleibt **unberührt**.

### NS8 — ⬜ L5 ist in drei Teilen verkleinert, im Rahmen nicht

**Der Rahmen** (Spec 2:185) verlangt: „Die Ausgabe von `/api/health/radio` samt der Angabe, **welches
Feld** darin den Modulnamen und **welches** den DB-Zugriff belegt", Quelle „Bau".

**Teil 2** (`2026-08-18-plan2-radio-paritaet.md:82`), **Teil 3** (`2026-08-18-plan3-radio-generalprobe.md:106-114`) und **Teil 4**
(`2026-08-18-plan4-radio-cutover.md:126-133`) haben unabhängig voneinander dasselbe gemessen: die Route ist **generisch**
und heute im Repo lesbar — `src/core/health/index.ts:4-15` (`module` = Modulname; `status: "ok"`
entsteht **erst nach** `openModuleDatabase()` plus `db.prepare("SELECT 1").get()`, also der
DB-Zugriff) und `src/app/api/health/[modul]/route.ts:23-26` (`revision`). Alle drei melden zusätzlich,
dass der im Rahmen zitierte Beleg `route.ts:11-18` **nicht** auf die Antwortform zeigt, sondern in
einen Kommentarblock.

**Es gilt die Verkleinerung, und sie ist keine stille Streichung:** `module` = Modulname ·
`status:"ok"` = DB-Zugriff über `SELECT 1` · `revision` = Commit. **Offen bleibt allein der WERT von
`revision`**, und den liefert **§A Nr. 1 als Protokollzeile des ersten Deploys**, nicht der Bau. Die
Runbook-Stellen tragen `⬜ L5` nur noch dort, wo der **Wert** gemeint ist.

⚠️ **Und der Rahmen wird nachgezogen, nicht ignoriert:** Aufgabe **Nr. 41** (`2026-08-18-plan5-radio-abbau.md:1695`)
schreibt den datierten Nachtrag in Spec 2 — **die L5-Zeile der ⬜-Tabelle (Spec 2:185) gehört
dort hinein**, samt der Berichtigung des Belegs. Drei Teile haben die Reduktion ausdrücklich als
Vorschlag **an die Zusammenführung gemeldet** statt sie eigenmächtig zu vollziehen
(`2026-08-18-plan3-radio-generalprobe.md:113-115`); dieser Leitplan vollzieht sie und weist den Nachtrag zu.

### NS9 — Der Snapshot heißt überall gleich — der Platzhalter der Aufrufzeile nicht

**Geprüft, hält.** `radio-admin-snapshot.sqlite` steht zeichengleich in **allen fünf** Planteilen:
1× in `2026-08-18-plan1-radio-import.md`, 6× in `2026-08-18-plan2-radio-paritaet.md`, 20× in `2026-08-18-plan3-radio-generalprobe.md`, 8× in `2026-08-18-plan4-radio-cutover.md`, 12× in
`2026-08-18-plan5-radio-abbau.md`. Es gibt **keinen** abweichenden Snapshot-Namen.

⚠️ **Eine Stelle sieht wie eine Abweichung aus und ist keine:** die Verwendungszeile des Importers
lautet `tsx scripts/import/radio.ts <radio-snapshot.db>` (`2026-08-18-plan1-radio-import.md:2683`, `:2687`,
`2026-08-18-plan3-radio-generalprobe.md:665`). Das ist der **generische Platzhalter der CLI-Fehlermeldung**, kein zweiter
Dateiname — der tatsächliche Aufruf im Runbook lautet
`… scripts/import/radio.ts ./radio-admin-snapshot.sqlite` (`2026-08-18-plan3-radio-generalprobe.md:759`).

**Es gilt:** die CLI-Meldung bleibt generisch (sie gehört Kapitel 1), **jede Runbook-Zeile schreibt
den konkreten Namen aus.** Ein Runbook-Befehl mit `<radio-snapshot.db>` wäre ein Platzhalter ohne
Nummer — und genau das verbietet die Hausregel.

### NS10 — W1: `.backup` und der nicht angehaltene Alt-Stack

**Geprüft, hält — in beiden Teilen zeichengleich.**

**Teil 3** (`2026-08-18-plan3-radio-generalprobe.md:460-464`) und **Teil 4** (`2026-08-18-plan4-radio-cutover.md:1309-1313`) fahren **denselben
Befehl**, bis auf den Variablennamen (NS7):
`docker run --rm -v "$VOL_ADMIN":/d -v "$PWD":/out alpine sh -c 'apk add --no-cache sqlite …;
sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'`.

Die **scharfe Folge** aus W1 — der Alt-Stack wird für den Generalproben-Snapshot **NICHT** angehalten
— steht in **beiden**: Teil 3 sagt „Das `docker compose … stop app` gehört **ausschließlich** zum
Freeze … und steht in diesem Abschnitt nicht" (`2026-08-18-plan3-radio-generalprobe.md:440-441`), Teil 4 sagt „Daraus
folgt für die Generalprobe (§P): der Alt-Stack wird für einen Generalproben-Snapshot **NICHT**
angehalten" (`2026-08-18-plan4-radio-cutover.md:1325-1328`). Teil 3 verbietet zusätzlich die „gleichwertige"
`VACUUM INTO`-Variante als Falle (`:472-484`) — eine Verschärfung ohne Widerspruch.

**Es gilt beides unverändert**, samt der Fristverschärfung: der Nachweis „Retention neutralisiert
**oder** Volume kopiert" ist **vor dem ERSTEN Generalproben-Snapshot** zu erbringen (Aufgabe Nr. 11),
nicht „vor dem Cutover-Abend" — denn ab da kann jemand den Alt-Stack anhalten, und **der nächste
Start ist der Schaden**.

### NS11 — W5: Bind-Pfad gegen benanntes Volume, und der dritte Unterschied

**Geprüft, hält — mit einer deklarierten Erweiterung.** ⚠️ **Der Inhalt der §L.3-Lauf-Tabelle hält;
was nicht hält, sind drei Tore in den Teilen 4 und 5, die eine ihrer Zeilen verbieten — das steht als
eigene Nahtstelle in NS11a und war hier vorher nicht gesehen.**

Der Rahmen (W5, Spec 2:432-476) entscheidet: der Fenster-Prüfcontainer ist **dieselbe** `docker
run`-Form wie §P.8, mit **zwei** benannten Unterschieden — `-v suite_data:/data` statt
`-v "$GP/data":/data`, und ⛔ **`AUTH_DEV_LOGIN` wird NICHT gesetzt**.

**Teil 3** hält den Riegel: „die `docker run`-Zeile **DER GENERALPROBE** enthält die Zeichenkette
`suite_data` nicht", mit Gegenprobe `docker inspect radio-gp … | grep -c suite_data # MUSS 0 sein`
(`2026-08-18-plan3-radio-generalprobe.md:839-848`) — und sagt im selben Atemzug: „**Für den Fenster-Prüfcontainer (§4.5
Schritt 8) gilt dieser Riegel NICHT** — dort ist `suite_data` das Prüfobjekt" (`:842`).
**Teil 4** zitiert den Riegel **mit seinem Geltungsbereich** und setzt `-v "$VOL_SUITE":/data` sowie
ausdrücklich **kein** `AUTH_DEV_LOGIN` (`2026-08-18-plan4-radio-cutover.md:1814-1854`), mit Gegenprobe
`rtk grep -n 'AUTH_DEV_LOGIN' …` (`:1948`).
**Teil 2** trägt dieselbe Trennung in §L.3 als **Lauf-Tabelle mit je Zeile ihrem Mount**
(`2026-08-18-plan2-radio-paritaet.md:805-820`): Generalprobe im Bind-Pfad `$GP/data`, `immutable=1` **zulässig** · Fenster
im Volume `$VOL_SUITE`, Mount **ohne** `:ro`, `sqlite3 -readonly`, ⛔ **kein** `immutable=1`.

⚠️ **Eine Erweiterung, die Teil 4 selbst benennt:** es führt **drei** Unterschiede zu `radio-gp`, nicht
zwei — hinzu kommt `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` (zwei Werte, `2026-08-18-plan4-radio-cutover.md:2678-2679`).
**Das gilt**, weil es deklariert ist und die Fenster-Prüfungen es brauchen (`curl` mit
vorgetäuschtem `Host` auf **beide** Namen). Es ist eine Ergänzung zu W5, kein Widerspruch zu ihm —
und sie gehört mit in den Nachtrag von Aufgabe Nr. 41.

### NS11a — Drei Tore verbieten die Zeile, die §L.3 vorschreibt ✅ erledigt 2026-08-19 — nur nachzuprüfen

**Teil 2** spricht in §L **zweimal** über `sqlite3 -readonly "$DATA_DIR/radio.db"` — aber in **zwei
verschiedenen Formen**, und darauf kommt alles an. Einmal im ⛔-Absatz von §L.2, der die Form **auf
dem Host** verbietet und sie dabei im **Fließtext** nennt („`sqlite3` auf dem HOST gegen
`"$DATA_DIR/radio.db"`", `2026-08-18-plan2-radio-paritaet.md:788`, im Runbook-Zaun). Und einmal in der Lauf-Tabelle §L.3
als die für die **Generalprobe** erlaubte **Befehlsform** („oder schlicht ohne Container … wie §1.8
Glied (4)", §L.3-Lauf-Tabelle). Teil 2 prüft es selbst — und fährt seit dem 2026-08-19
**dieselbe enge Befehlsform** wie Teil 4 und Teil 5 (`rtk grep -n 'sqlite3 -readonly "\$DATA_DIR' …`)
mit der ausgeschriebenen Erwartung „**genau EIN Treffer, und er ist namentlich bekannt**", samt dem
Satz „ein ZWEITER Treffer ist der Fund, den dieser Schritt sucht". ✅ **Vier Tore, eine Suchform,
eine Erwartung.** Die frühere **breite** Form (`rtk grep -n 'DATA_DIR/radio.db'`, Erwartung zwei)
ist ersetzt und nicht mehr im Bestand: sie zählte die Warntexte mit, die den verbotenen Pfad
zitieren, und maß damit die Zahl der **Warnhinweise** statt der Zahl der **ausführbaren Zeilen**.

**Teil 4 und Teil 5** prüfen dieselbe Datei mit der **engeren** Suchform und ursprünglich der
**gegenteiligen** Erwartung: `rtk grep -n 'sqlite3 -readonly "\$DATA_DIR' … # Erwartung: leer`
(`2026-08-18-plan4-radio-cutover.md`, Wortlaut `rtk grep -n 'sqlite3 -readonly "\$DATA_DIR'`, heute `:1739` und noch einmal
`:2630`) und `grep -n 'sqlite3 -readonly "\$DATA_DIR/radio.db"' … # Erwartung: keine Ausgabe. Ein
Treffer ist ein Stopp-Punkt` (`2026-08-18-plan5-radio-abbau.md`, heute `:663`). Mit „leer" wären nach der Zusammenführung
alle drei **rot bei richtiger Arbeit** — derselbe Mechanismus wie in NS1 und NS7a.

**Es gilt: die zwei Stellen in §L bleiben, und die drei Tore werden auf „genau EIN Treffer"
gesetzt.** Der Kommentar am Tor nennt **die eine Fundstelle beim Namen** — die Zeile „Generalprobe"
der Lauf-Tabelle §L.3, wo `DATA_DIR` ein **Bind-Pfad** (`$GP/data`, §3.1.2) und die Form deshalb
erlaubt und ausdrücklich vorgeschrieben ist — und sagt in einem Halbsatz, warum der ⛔-Absatz von
§L.2 **nicht mitzählt**. ⛔ **Nicht „zwei".**

⚠️ **Die MESSUNG, damit die nächste Lesung sie nicht zurückdreht.** Nachgemessen 2026-08-19 mit einem
Skript, das die Zäune der Planteile parst — **nur was in einem markdown-Zaun steht, erreicht das
Runbook**. Die Befehlsform
`sqlite3 -readonly "$DATA_DIR` trägt im **Runbook-Text** genau **eine** Stelle: `2026-08-18-plan2-radio-paritaet.md:814`,
die Zeile „Generalprobe" der §L.3-Lauf-Tabelle. Die drei Stellen, die man dafür hält, tragen sie
**nicht**:

1. **`2026-08-18-plan2-radio-paritaet.md:788`** — der ⛔-Absatz von §L.2 steht **im** Runbook-Zaun, formuliert das Verbot
   aber im **Fließtext** („`sqlite3` auf dem HOST gegen `"$DATA_DIR/radio.db"`"). Die engere
   Suchform trifft ihn **nicht** — auch nicht bei Teil 2, das seit dem 2026-08-19 dieselbe enge
   Form fährt. **Nur eine Suche auf die bloße Zeichenkette `DATA_DIR/radio.db` träfe ihn, und
   genau deshalb wird sie nicht mehr benutzt.**
2. **`2026-08-18-plan2-radio-paritaet.md:800`** — **Planprosa außerhalb** der Zäune (sie begründet die §2.2.2-Korrektur).
   Sie erreicht das Runbook **nie**.
3. **`2026-08-18-plan5-radio-abbau.md:1827`** — trifft die Suchform, steht aber in einem Zaun, der **Spec 2 §5.2.2**
   schreibt (der Nachtrag zu Abfrage A), **nicht** das Runbook.

⛔ **„Genau zwei Treffer, beide in §L" war die Vorgabe dieses Leitplans bis zum 2026-08-19 und ist
gemessen falsch.** Sie stammte aus der Annahme, die drei Tore suchten dieselbe Zeichenkette wie
Teil 2. Wer sie zurückschreibt, macht alle drei Tore **rot bei richtiger Arbeit**.

⚠️ **Warum NICHT die naheliegende Ausschluss-Pipeline.** Der Bericht bietet als erste Möglichkeit
`… | grep -v '§L'` oder eine `sed`-Spanne an. Beides ist hier **unzuverlässiger als die Zählung**:
der §L-Marker steht **nicht in derselben Zeile** wie der Treffer, sondern in der Überschrift darüber
— ein zeilenweises `grep -v` sieht ihn also nie, und eine `sed`-Spanne über §L hält nur so lange,
wie niemand einen Abschnitt dazwischenschiebt. **Die namentlich benannte Zählung** ist die
robustere Form und im Haus an allen vier Toren benutzt — Teil 2, zweimal Teil 4, Teil 5 —, jedes
mit derselben Zahl **eins** und derselben namentlich benannten Fundstelle.

⛔ **Warum es blockiert.** Das Tor in `2026-08-18-plan5-radio-abbau.md` (heute `:663`, Wortlaut „**(d) KEIN Zielarm liest
mehr auf dem Host:**") steht in der Gegenlesung der vier Abbau-Sperren
A/T/R/Z und ist als **„Stopp-Punkt"** beschriftet. Es wird Wochen nach dem Fenster gelesen, von
jemandem ohne den Kontext dieses Abends, und meldet einen Defekt, wo keiner ist. Eine Prüfung, die
beim korrekten Zustand rot wird, wird beim zweiten Mal ignoriert — und dann ignoriert man sie auch,
wenn die Zeile wirklich einmal an einer dritten Stelle auftaucht.

**Zu ändern: die drei Tore mit dem Wortlaut `sqlite3 -readonly "\$DATA_DIR`** — in `2026-08-18-plan4-radio-cutover.md`
zweimal (heute `:1739` und `:2630`), in `2026-08-18-plan5-radio-abbau.md` einmal (heute `:663`). Dreimal dieselbe neue
Erwartung **„genau EIN Treffer"**, dreimal derselbe Kommentar mit **der einen** Fundstelle.

✅ **Nachgeprüft 2026-08-19: alle drei tragen die berichtigte Erwartung bereits** — `2026-08-18-plan4-radio-cutover.md:1740`
(„Erwartung: genau EIN Treffer (§L.3, Zeile Generalprobe)"), `:2631` (gleicher Wortlaut) und
`2026-08-18-plan5-radio-abbau.md:664` („Erwartung: GENAU EIN Treffer"). Alle drei nennen den ⛔-Absatz und begründen, warum
er nicht mitzählt. **Für die Zusammenführung bleibt hier nur die Nachprüfung**, nicht die Ersetzung.
⚠️ **Ein vierter Treffer der Suchform ist KEIN Tor dieser Gruppe:** `2026-08-18-plan5-radio-abbau.md:1928` zählt in der
**Spec** (Bereich `4165,4879`) und erwartet dort `0`.

### NS12 — RK-A3: `--profile full-app` im Rückweg

**Geprüft, eingearbeitet.** Die Re-Kritik meldete blockierend, dass §4.9 Handgriff 3b den Alt-Kiosk
ohne `--profile full-app` startet — `backend` steht hinter `profiles: ["full-app"]`
(`radio-inventar@f883ec4:docker-compose.yml:27`, unabhängig nachgelesen), `postgres` nicht. Ohne das
Profil kann der Start ein No-op sein, **und ein No-op sieht wie ein Erfolg aus.**

**Teil 4 hat den Fund eingearbeitet**, an drei Stellen: der Stopp-Befehl in §C Schritt 1
(`2026-08-18-plan4-radio-cutover.md:1260`, `:1285`) mit der ausgeschriebenen Regel „der Stopp-Befehl ist die Vorlage —
Wort für Wort, nur `stop` gegen `start` getauscht. Insbesondere wandert `--profile full-app` **mit**"
(`:1290`), der Start-Befehl im Rückweg (`:2404`,
`docker compose -f radio-inventar/docker-compose.yml --profile full-app start postgres backend`),
und zwei Gegenproben (`:1387` „Erwartung: >= 2", `:2585` „Erwartung: >= 1"). **Teil 5** bestätigt es
mit eigenem Repo-Beleg und schreibt Anhang A-3 auf „teilweise bestätigt" um (`2026-08-18-plan5-radio-abbau.md:1779`,
`:1902`).

**Es gilt: der Rückweg ist zeichengleich die Umkehrung des Freeze.** Der Fund ist geschlossen; was
noch aussteht, ist die **Spec**-Seite — Anhang A-3 (`Spec 2:4891`) legitimiert den Befehl ohne
Profil heute noch, und Aufgabe **Nr. 41** schreibt ihn um.

### NS13 — Die Abbau-Sperren zeigen auf Zählungen, die es gibt

**Geprüft, hält.** Der Sperrenkasten aus Aufgabe Nr. 36 lautet **„A, T, R, Z (§5.2) · P1, P2, P3,
P4, P6 (§5.3) · beide Archivproben (§5.4)"** (`2026-08-18-plan5-radio-abbau.md:966-969`). Jede dieser Sperren hat einen
Erzeuger:

| Sperre | Erzeugt in | Beleg |
|---|---|---|
| **A** (fünf Paare) | Sollwerte in Aufgabe **5** (§V/A1), Zielarm-Form in Aufgabe **4** (§L.2), ausgeführt in **27**/**28** | `2026-08-18-plan5-radio-abbau.md:302`, `2026-08-18-plan2-radio-paritaet.md:1970` |
| **T** (`api_tokens`-Archivzeile) | die **sechste** A1-Zählung, **Quellarm allein** — W4: die Tabelle existiert im Ziel nicht | `2026-08-18-plan5-radio-abbau.md:433`, Spec 2:404-430 |
| **R** (Retention-Gegenprobe) | Aufgabe **28** (§C Schritt 5 d), mit `<freeze_iso>` in **beiden** Armen | `2026-08-18-plan4-radio-cutover.md:1694`, W3 |
| **Z** (zehnzeilige Grenzprobe) | Aufgabe **28**, dieselbe Protokollzeile | `2026-08-18-plan4-radio-cutover.md:1418`, `2026-08-18-plan5-radio-abbau.md:499-556` |
| **P1–P6** | Aufgabe **34** selbst, gegen den Dump aus Aufgabe **27** | `2026-08-18-plan5-radio-abbau.md:622` |
| **Archivproben (a)/(b)** | Aufgabe **35**, gegen Snapshot und Dump aus Aufgabe **27** | `2026-08-18-plan5-radio-abbau.md:847` |

⚠️ **Zwei Feststellungen daraus, die im Runbook stehen müssen:**
**R und Z werden EINMAL ermittelt und ZWEIMAL gelesen** — in §D als Freigabe, in §5.2 als
Abbau-Sperre, **dieselbe** Protokollzeile (W10, `2026-08-18-plan4-radio-cutover.md:1694`). Und **P6 ist eine Sperre, keine
Protokollzeile**: der Kasten in Spec 2:4610 zählt „A, T, R, Z, P1, P2, P3, P4 und beide
Archivproben" und **P6 fehlt dort**, obwohl §5.2.3 ihn mit „Erst danach darf das Volume fallen"
überschreibt (`2026-08-18-plan5-radio-abbau.md:951-956`). **Es gilt der Kasten MIT P6**, und Aufgabe Nr. 41 zieht die
Spec nach.

### NS14 — Zwei Übergaben, die nach Sperren aussehen und keine sind

**`U8`** steht in der Betreiber-/Server-Tabelle des Rahmens (Spec 2:238), gehört dort aber nicht hin:
Teil 3 merkt an, U8 „**entsteht HIER**" (`2026-08-18-plan3-radio-generalprobe.md:93`) — es ist die Messung aus §P.2 und
§P.12 (Aufgaben 12 und 22) und wird von §A Nr. 7 (Aufgabe 25) **verbraucht**. **Es gilt: U8 ist eine
interne Übergabe, keine Betreiberauskunft**, und steht in §0 als solche beschriftet. Wer es als
Sperre führt, wartet auf eine Antwort, die aus der eigenen Generalprobe kommt.

**`<umschwenk_iso>` / `<umschwenk_epoch_sekunden>`** meldet Teil 5 als ⛔ „**entsteht heute in keinem
Schritt** — Zusage an den Planteil zu Kapitel 4, §4.5 Schritt 9" (`2026-08-18-plan5-radio-abbau.md:138`). **Die Zusage ist
eingelöst:** Teil 4 Aufgabe 8 liefert beide Formate (`2026-08-18-plan4-radio-cutover.md:1735`), und Teil 4 §H Punkt 15
verlangt sie im Protokoll. **Es gilt: die Lücke ist geschlossen**; Aufgabe Nr. 32 kann ihr
Standby-Formular in beiden Formaten führen.

**Dieselbe Klasse, ebenfalls geschlossen:** Teil 2 gibt als Zusage nach außen, die
`docker run`/`$VOL_SUITE`-Form aus §L.2 sei „die **verbindliche** Form für **jede** SQLite-Ablesung
am Ziel im Fenster — auch für §5.2.2 Abfrage **A**, die sie heute nicht benutzt"
(heute `2026-08-18-plan2-radio-paritaet.md:2050`). **Teil 5 hat sie übernommen**, mit `ls -ln`-Gegenprobe und dem Satz „eine `0`
ist zuerst ein Volume-Fehler" (`2026-08-18-plan5-radio-abbau.md:406-451`, `:1897`). **Die Form ist übernommen — und die
Variable darin ebenfalls richtig:** §5.2 liest `VOL_SUITE=` selbst ab (heute `2026-08-18-plan5-radio-abbau.md:441`), und das
**bleibt so** (NS7a), weil die Abbau-Sitzung vierzehn Tage später in einer neuen Shell läuft; den
absichernden ⛔-Satz („BEIDE Ablesungen MUESSEN denselben Namen ergeben … GEGENGELESEN … Stopp-Punkt")
trägt Teil 5 bereits ausgeschrieben (heute `:433-439`, dazu `:392-395`). **Keine Nacharbeit in Teil 5** — die Nacharbeit
dieser Nahtstelle liegt in `2026-08-18-plan2-radio-paritaet.md` und `2026-08-18-plan4-radio-cutover.md` (NS7a).

---

## Sperren

Was welche Aufgabe anhält. **Jede Zeile ist eine Ablesung oder eine Auskunft, keine Entscheidung —
mit genau einer benannten Ausnahme: die zweite Hälfte von ⬜ L13 wird GEWÄHLT** (siehe dort).
Die Spalte *Welche Aufgaben warten* nennt die Nummern aus der Reihenfolge — die Aufgabe, die den
Wert **braucht**, nicht die, in der er nur erwähnt wird.

### ⬜ Der Bau (Spec 1 ist nicht gebaut)

| Nr. | Was abzulesen ist | Quelle | Welche Aufgaben warten |
|---|---|---|---|
| **L4** | `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Einträge in `_journal.json` | Bau | **9**, **15** |
| **L5** | **verkleinert (NS8):** allein der **Sollwert** von `revision` | §A Nr. 1 (Protokollzeile des ersten Deploys) | **9**, **19**, **30** |
| **L6** | Die genaue **Abschlusszeile** von `scripts/import/radio.ts` samt Exit-Code | Bau | **14** |
| **L7** | Der vollständige `Location`-Kopf der `/admin`-Weiterleitung (**307 oder 302**, Protokoll, Host) | Bau / Abruf | **19**, **29**, **30** |
| **L8** | Was `GET /m/radio` mit `Host: iuk-ue.de` liefern **soll** — 404 oder Fläche | Bau (Spec 1 §1.2) | **19**, **29** — ⚠️ **abgelesen und protokolliert wird es in jedem Fall** |
| **L9** | Ob `/` oder `/t/<code>` eine **kamerabasierte** Fläche trägt | Bau | **20** — **Zweigwahl**, keine Blockade |
| **L10** | Die Zeichenkette aus dem Ausleih-Rahmen, die im **Portal**-HTML **nicht** vorkommt | Bau | **19**, **29**, **30** — eine erfundene Zeichenkette wäre ein Test, der grün ist, weil er nichts trifft |
| **L11** | Was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` **tatsächlich** liefert | Bau / Abruf | **30** |
| **L12** | Der Ablesepunkt in den Entwicklerwerkzeugen nach dem Reload (Service Workers, Cache Storage) | Bau / Browser | **30** |
| **L13** | Name des regulären Suite-Containers **und** der Loopback-Port des Fenster-Prüfcontainers | Server (Name) · ⚠️ **Wahl** (Port) | **28**, **29** — ⛔ **ohne beides ist §C Schritt 8 nicht ausführbar.** ⚠️ **Die zweite Hälfte ist keine Ablesung:** kein Befehl gibt den Fensterport her — die Generalprobe fährt `-p 127.0.0.1:3999:3000`, das ist ihr eigener frei gewählter Wert. Der Fensterport wird **gesetzt** und protokolliert. Eine „Ablesung", die in Wahrheit eine Entscheidung ist, ist genau die Zeile, die unter Zeitdruck mit einer plausibel aussehenden Zahl gefüllt wird |
| **L14** | Darf der Fenster-Prüfcontainer **parallel** zum Schritt-7-Stack auf `suite_data` booten? | Bau / Abruf | **29** — ⚠️ **abzulesen, BEVOR das Fenster geplant wird** (der Ausweichweg stoppt sechs andere Module) |
| **N1** | Hält der reguläre Stack `radio.db` nach dem Boot dauerhaft offen? | Bau / Abruf | **4**, **28** — die **Entscheidung** (kein `immutable=1` im Fenster) steht; offen ist, wie fest ihr Grund ist |
| **N4** | Der Pfad der `sw.js`-Route unter `src/app/m/radio/` | Bau (Spec 1 §7.1.3) | **19** (Fremdhost-Probe V6) |

⚠️ **L1, L2 und L3** (Typaliase · Treiberverpackung · die vier Paritätssichten) blockieren
ausschließlich Aufgaben des **Bau-Plans** (Kapitel 1 und Teil A von Kapitel 2) und stehen deshalb
nicht in dieser Tabelle.

⚠️ **Hier stand bis zuletzt eine Zeile „Exportnamen der fünf Tabellenobjekte in `_db/schema.ts`",
die auf den Bau-Plan zeigte. Sie ist aufgelöst und ersatzlos gestrichen** — Spec 1 schreibt alle
fünf als `export const` aus (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:1206`, `:1254`,
`:1298`, `:1311`, `:1349`, dazu `:1394` `zugangscodes`), und der Bau-Leitplan hat sie in seiner
Nahtstelle **NS6** bereits für aufgelöst erklärt. Die N-Numerierung ist dadurch **N1–N10** (NS6).

### Der Server

| Nr. | Was abzulesen ist | Quelle | Welche Aufgaben warten |
|---|---|---|---|
| **E2** | Echter Volume-Name von `radio-admin` (compose präfixt mit dem Projektnamen) | `docker volume ls \| grep -i radio-data` | **4**, **12**, **27**, **33** |
| **E3** | Echter Volume-Name **und** `POSTGRES_USER` von `radio-inventar` | Server | **27**, **34** |
| **E7** | Traefik-Containername | Server | **30**, **39** |
| **N2** | Ist die `compose.yaml` mit `radio-admin-alt` **ausgerollt**? | `docker compose config \| grep -A2 radio-admin-alt` **am Server** | **25** (§A Nr. 14) — ⛔ **29** Nr. 3 trifft sonst nichts |
| **N3** | Die **tatsächliche** Kennung des laufenden Suite-Prozesses (nicht die des Images) | `docker inspect <L13> --format '{{.Config.User}}'` bzw. `SUITE_USER` | **10**, **14**, **18**, **28** — ⛔ die Erwartung „dieselbe Kennung wie die übrigen Modul-DBs" ist mit dem **Image**-Wert auf einem Standardhost **zwangsläufig rot** |
| **N5** | Env des Host-Cron `scripts/backup.sh` (`DATA_DIR`, `BLOB_DIR`) und der Ablageort des Tarballs | Crontab / Timer-Unit | **30** (§D Nr. 13) |
| **N6** | Edge-Proxy: `X-Forwarded-Host` · die weitergegebenen Entrypoints · ist `radio-admin.iuk-ue.de` dort bekannt | Server | **25** (§A Nr. 8), **30** (§D Nr. 7) — ohne (b)/(c) laufen drei `curl` in einen TLS-Fehler, **statt rot zu werden** |
| **N7** | Ist `HISTORY_RETENTION_MONTHS` im produktiv laufenden `radio-admin` konfigurierbar? | Image-Herkunft | ⛔ **31** (die Zulässigkeitsbedingung des Rückwegs 3a) · **38**, **40** (§H Punkt 3 und 31) — ⚠️ **Frist: vor dem Fenster**, nicht erst vor dem Abbau. Der Rückweg ist Aufgabe **31** und wird am Cutover-Abend gefahren, mit einer Frist von **einer Stunde**; wer die Antwort erst zum Abbau einholt, entscheidet sie in dieser Stunde |
| **N9** | Gibt es ein Traefik-Zugriffsprotokoll, wo, und wie lange? | Server | ⛔ **39**, **36** (Posten 10), **40** (Punkt 35) — **ohne Protokoll ist die Abbaubedingung nie erfüllbar, und der Redirect lebt für immer** |
| **N10** | Wo liegen die zwei Alt-Checkouts auf dem Server? | Server | **27**, **34**, **38** — aus dem falschen Verzeichnis antwortet jeder Befehl `no configuration file provided` |

### Der Betreiber

| Nr. | Was zu entscheiden oder zu erheben ist | Quelle | Welche Aufgaben warten |
|---|---|---|---|
| **E1** | **Gruppenname** für `SUITE_ADMIN_GROUP_RADIO`, exakt wie im `groups`-Claim | Betreiber | **26** — jede Verwaltungsseite. ⚠️ **Nicht** die Generalprobe: sie setzt einen frei erfundenen Wert, und das ist richtig |
| **E4 / C.2** | **Sitzungsdauer** `RADIO_AUSLEIH_SITZUNG_STUNDEN` (Vorschlag **12**) | Betreiber | **26**, **31** — ohne Antwort gilt 12; der Cutover läuft, aber die **Notiz** behauptete sonst eine unbestätigte Zahl |
| **E5 / C.3** | **Gedruckte Aufsteller: Anzahl, Ort, wer sie ersetzen kann** | **Begehung, kein `SELECT`** | ⛔ **31** — im Zweig „ja" ist der Umschwenk **abzubrechen**, wenn Handeingabe-Ausweichweg und ausstellende Person nicht abgedeckt sind |
| **E6** | Wie viele Geräte tragen den Alt-Token im `localStorage` | **Begehung, kein `SELECT`** — der Token liegt im `localStorage`, es gibt keine Tabelle | **30** (Umfang des SW-Handgriffs) |
| **E8** | **Wer ist am Cutover-Abend namentlich anwesend** und stellt den ersten Code aus | Betreiber | **31** — der erste einlösbare Zugang, **und** zugleich der Beweis des stummen Login-Rückwegs |
| **U4 / C.5** | ⛔ **Wo läuft das `radio-inventar`-Frontend produktiv** (Prozess, Container, statische Auslieferung, Reverse-Proxy-Eintrag; auf welchem Host, mit welcher Konfiguration) | **Betreiber — kein Befehl beantwortet ihn** | ⛔ **27** (der Freeze) · ⛔ **29** (der Umschwenk hat ohne U4 kein ausführbares Ziel) · ⛔ **31** (der Rückweg 3c/3d) · **36** (die Vollständigkeit der Abbauliste) |
| **U4a** | Wo setzt die Produktion `API_TOKEN`? Pflichtwert mit `min(32)`, ohne Default, **nicht** in der eingecheckten Compose-Datei | Betreiber | **37** |
| **U4b** | Gibt es auf Host-Ebene einen Cron, systemd-Timer oder Backup-Job zu einem der Alt-Stacks? | Betreiber | **38** |
| **U6** | Werden die zwei **OIDC-Client-Registrierungen** in Pocket ID gelöscht oder aufbewahrt? | Betreiber | **36** (Posten 13), **37** |
| **U7** | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | **Abfrage A9** (Aufgabe 5), Wiederholung als Abfrage 8 (Aufgabe 33) | **5**, **33** — ⚠️ **nach dem gelöschten Volume nicht mehr beantwortbar** |
| **U9** | Sind Repo- und Server-`compose.yaml` am 19.07. auseinandergelaufen? | Betreiber — im Repo nicht nachweisbar | **2**, nur als Notiz — blockiert nichts |
| **N8** | Wohin gehen die zwei Archivdateien? Zielsystem, Zugriffsweg, Person — **und der Beleg, dass es nicht der Suite-Server ist** | Betreiber | ⛔ **35**, **36** (Posten 11), **40** (Punkt 30) |
| **C.1** | Bauform des Ausleih-Codes (dauerhaft + sperrbar, rotierend, Sitzung je Scan) | von Spec 1 **vorentschieden**, nicht vom Betreiber | **kein** Cutover-Schritt — aber **der Druck des ersten Codesatzes ist die Frist**: danach ist ein Wechsel ein Papieraustausch |
| **C.4** | Benutzername beim Ausleihen vorausfüllen? | Betreiber | **kein** Cutover-Schritt. Nur **20** (V14) sieht es |
| **C.6 / B4** | ⛔ **Zwei Rollen oder eine (Updater-Rechtestufe)** | **fachlich blockierend, in Spec 1 bewusst geparkt** | **3**, **26** — **genau eine `.env`-Zeile.** Der Cutover ist ohne Antwort durchführbar (eine Rolle ist der engere Zuschnitt); fällt sie auf „zwei Rollen", kommt eine sechste Boot-Prüfung und eine sechste Eingabe neben E1 hinzu, und die `.env` wäre nachträglich zu erweitern |
| **C.7** | Muss offline geschrieben werden können? | Betreiber | **kein** Cutover-Schritt — aber die **Begründung** des Abräum-Workers hängt daran: er hat **keinen `fetch`-Handler**. Wäre Offline-Schreiben Pflicht, wäre das eine Moduländerung und keine Runbook-Zeile |

⚠️ **U4 ist der teuerste offene Punkt dieses Weges**, und er ist der einzige, den **kein Befehl**
beantwortet (Spec 2:230-232). Er ist **vor** dem Cutover einzuholen: nach dem Abbau ist er nur noch
durch Ausprobieren zu beantworten, und das Ausprobieren heißt dann „was ist kaputtgegangen?".

⚠️ **`U8` ist keine Sperre** und steht deshalb in keiner dieser drei Tabellen — sie entsteht in den
Aufgaben 12 und 22 und wird von Aufgabe 25 verbraucht (NS14).

---

## Was die Zusammenführung zu tun hat, bevor Aufgabe 1 beginnt

Zehn Änderungen an den Planteilen, alle aus den Nahtstellen. **Die Spalte *Art* ist tragend:** fünf
davon sind reine Textersetzungen mit gezähltem Umfang, fünf sind es **nicht** — dort trifft ein
pauschales `sed` das Falsche, **und nichts wird rot dabei**.

⛔ **Die Zeilennummern in dieser Tabelle sind ein Anhalt, nicht die Adresse. Gesucht wird über den
WORTLAUT.** Jede Bearbeitung an einem Planteil verschiebt alles darunter, und keine Prüfung dieser
Dokumente merkt es — die Nummer zeigt dann stumm auf eine fremde Zeile. **Vor jedem Handgriff die
Stelle mit `grep -n '<Wortlaut>'` neu bestimmen und die Nummer hier nachziehen.** Am 2026-08-19 waren
so **Eintrag 8**, **Eintrag 10**, NS1, NS7a und NS8 veraltet, ⚠️ und stichprobenweise auch **Eintrag 4** (`:334`, `:1163`, `:1373`, `:2167`, `:2630`, `:2697` zeigen heute sämtlich auf fremden Inhalt — die zehn §S-Unternummern sind vor dem Handgriff neu zu bestimmen) und **Eintrag 9** (`:334` → heute `:342`) — kein Tor hatte es gemeldet, und in
einem Fall zeigte die alte Nummer bereits auf **fremden Inhalt** (`2026-08-18-plan4-radio-cutover.md:2631` meinte die
§A-Gegenlesung und trägt heute die Erwartungszeile eines anderen Tores). ⚠️ **Die Nummern in diesem
Dokument sind am 2026-08-19 gemessen worden, WÄHREND an den Planteilen gearbeitet wurde**: allein
`2026-08-18-plan4-radio-cutover.md` ist im Lauf dieser Runde um +12 bis +18 Zeilen gewandert. Sie sind ein **Anhalt für
denselben Tag**, keine Adresse für nächste Woche.

| # | Änderung | Datei(en) | Stellen | Art | Nahtstelle |
|---|---|---|---|---|---|
| 1 | `§G0`–`§G14` → `§P.0`–`§P.14` | `2026-08-18-plan3-radio-generalprobe.md` | 269 | Ersetzung | NS2 |
| 2 | `§A` (Vorabfragen) → `§V` | `2026-08-18-plan3-radio-generalprobe.md` | 14 | Ersetzung | NS3 |
| 3 | `§I` → Prosa | `2026-08-18-plan3-radio-generalprobe.md` | 4 | ⚠️ **je Stelle einzeln** — `:666` und `:768` brauchen „Spec 2 §1.5.3", `:67` und `:2615` den Zeiger auf §P.4 | NS4 |
| 4 | `## §S — Standby und Abbau` streichen; `§S`-Verweise → `§5.x` | `2026-08-18-plan4-radio-cutover.md` | 13 (davon 3 Ankerzeilen: `:188`, `:325`, `:334`) | ⚠️ **je Stelle einzeln** — jede braucht die **richtige** Unternummer: `:1163`→§5.8 · `:1373`→§5.3 · `:1378`→§5.4 · `:1425`, `:1694`, `:2697`→§5.2 · `:2167`→§5.1 · `:2503`, `:2630`, `:2656-2657`→§5 gesamt. Ein pauschales `s/§S/§5.x/` erzeugt zehn falsche Querverweise, **und nichts wird dabei rot** | NS2 |
| 5 | `## §H` in Teil 4 streichen, **sechs Zulieferungen** an Teil 5 | `2026-08-18-plan4-radio-cutover.md`, `2026-08-18-plan5-radio-abbau.md` | 20 + **17** | ⚠️ **je Stelle einzeln** — jede Zulieferung wird **Nebensatz** eines bestehenden Punktes; die Zahl bleibt 38. Dazu **entfällt** die Gegenlesung `rtk grep -n '§A Nr. 1–14 vollständig'` in `2026-08-18-plan4-radio-cutover.md` (heute `:2649`) ersatzlos — `2026-08-18-plan5-radio-abbau.md:1749` prüft in Aufgabe Nr. 40 bereits dasselbe, und zwar in der **schärferen** Form (`grep -c … # Erwartung: 1`), NS1. **Drei der siebzehn stehen nicht im Aufgabentext**, sondern in der Leerstellentabelle (`2026-08-18-plan5-radio-abbau.md:116`, `:117`, `:118`) | NS1 |
| 6 | N-Nummern auf **N1–N10** umschlüsseln (Teil 2 `N2`, die Exportnamen, **entfällt** — aufgelöst durch Spec 1) | alle vier Teile, **dazu der Runbook-Text** | **13 MARKEN → 10 Nummern** · Textvorkommen: **weit mehr** | ⚠️ **je Stelle einzeln** — Zuordnung strikt nach Tabelle NS6 (zwei Marken fallen zusammen, eine entfällt). ⚠️ **Die Spalte *Stellen* zählt hier ZWEIERLEI, und beides ist nötig.** (a) **13 alte teil-lokale Marken** (T2: 2 · T3: 2 · T4: 5 · T5: 4) werden zu **10** Nummern — zwei Paare fallen zusammen (T2 `N1` und T4 `N4` → `N1`; T3 `N2` und T4 `N2` → `N3`), eine entfällt (T2 `N2`, die Exportnamen). Das ist die Zahl aus NS6 und die Zahl, an der die Vollständigkeit gemessen wird. (b) **Textvorkommen** sind erheblich mehr: allein der Runbook-Text von Teil 4 trägt die alten Marken in **sechzehn** Zeilen (unten aufgezählt), dazu Planprosa, Platzhalternamen und Bereichsmarken. **Wer „13" für die Zahl der zu bearbeitenden Zeilen hält, hört zu früh auf.** ✅ **Zwei Stellen außerhalb der planinternen Tabellen sind BEREITS ausgeführt** (Nachprüfung 2026-08-19): die §0-Eingabentabelle des Runbooks trägt die neue Numerierung als zehn Zeilen (`2026-08-18-plan4-radio-cutover.md:287-296`), ihr Tor die **Erwartung 25** (heute `2026-08-18-plan4-radio-cutover.md:342`, Wortlaut `rtk grep -c '^| [EUN][0-9]'`). ⛔ **Nicht ein zweites Mal umschlüsseln** — sonst verschiebt die Zusammenführung dieselbe Tabelle ein zweites Mal. Offen bleibt der **übrige** Runbook-Text von Teil 4, der die alten Marken weiterführt — gemessen sechzehn Zeilen: `:864`, `:873`, `:897`, `:931`, `:1138`, `:1160`, `:1457`, `:1520`, `:1826`, `:1962`, `:2124`, `:2176`, `:2537`, `:2540`, `:2541`, `:2574` (darunter §H Punkt 4 „**N1–N5** ausgefüllt", `:2540`). ⛔ **Solange sie stehen, meint `⬜ N1` im Fließtext etwas anderes als `N1` in §0** — **und ebenso der Runbook-Text der Nachbarteile**: `2026-08-18-plan3-radio-generalprobe.md:196`, `:205`, `:225`, `:232`, `:698`, `:701`, `:705`, `:716`, `:791`, `:1476`, `:1531`, `:1922`, `:1927` (dort `⬜ N1` = `sw.js`-Pfad → neu **N4**, `⬜ N2` = Kennung → neu **N3**) und `2026-08-18-plan5-radio-abbau.md:1296` (`⬜ N1` = Zwei-Monats-Frist → neu **N7**). Allein `2026-08-18-plan2-radio-paritaet.md:822`/`:833` trifft zufällig schon zu (lokal `N1` = neu `N1`). **Kein Tor sieht die Vertauschung**: die Schleife `2026-08-18-plan4-radio-cutover.md:2621` fragt nur, **ob** eine §0-Zeile existiert, nicht ob es die richtige ist. ⚠️ Dieselbe Schleife ist aus einem **anderen** Grund rot: die zehn ⬜-**L**-Marken des Runbook-Textes (`L4`, `L6`–`L14`) haben in §0 überhaupt keine Zeile — §0 führt nur `E`, `U` und `N`. Gemessen 2026-08-19, **kein Fund dieser Gegenprüfung, sondern Altbestand** | NS6 |
| 7 | `$VOL` → `$VOL_ADMIN` | `2026-08-18-plan2-radio-paritaet.md`, `2026-08-18-plan4-radio-cutover.md` | 2 + 5 | Ersetzung | NS7 |
| 8 | `VOL_SUITE=`-Zuweisung aus §L.2 entfernen **und** das Tor auf **2 Treffer** setzen | `2026-08-18-plan2-radio-paritaet.md:766` (Zeile `VOL_SUITE=<die Zeile aus dem Befehl oben>`) · `2026-08-18-plan4-radio-cutover.md:1746` (Tor `rtk grep -n 'VOL_SUITE='`, Kommentar darüber `:1743`) | 2 | ⚠️ **je Stelle einzeln, zwei verschiedene Handgriffe** — §L.2 gibt die Zuweisung ab und nennt §C Schritt 4 Handgriff 1 als Ursprung; das Tor erwartet danach `2 Treffer — §C Schritt 4 Handgriff 1 und §5.2, beide namentlich`. **§5.2 behält seine Ablesung** samt ihren ⛔-Gegenlesesätzen — **dort ist nichts zu tun**; `2026-08-18-plan2-radio-paritaet.md` bekommt den Geltungsbereich „im selben Lauf" an der ⛔-Zeile „`$VOL_SUITE` wird einmal abgelesen und mehrfach gelesen" (heute `:1985`, Tabellenzeile dazu `:1982`). ⚠️ **Die Anker dieses Eintrags waren am 2026-08-19 veraltet und sind nachgemessen:** `2026-08-18-plan5-radio-abbau.md:438` → heute **`:441`** (`VOL_SUITE=<die Zeile aus dem Befehl oben>`); der ⛔-Gegenlesesatz `:430-437` → heute **`:433-439`** („⛔ BEIDE Ablesungen MUESSEN denselben Namen ergeben", im `bash`-Zaun), **und** die zweite, gleichrangige Gegenlesestelle steht im Protokollformular bei **`:392-395`** („⛔ gegengelesen gegen die Protokollzeile aus §4.5 Schritt 4 Handgriff 1"). **Beide bleiben unangetastet**; `2026-08-18-plan2-radio-paritaet.md:1973` hieß dieselbe Stelle wie heute `:1985` | NS7a |
| 9 | Gegenprobe „exakt 12 Zeilen" → **24**, Liste austauschen | `2026-08-18-plan4-radio-cutover.md:334` | 1 | Ersetzung | NS2 |
| 10 | Die drei Tore mit dem Wortlaut `sqlite3 -readonly "\$DATA_DIR` auf **„genau EIN Treffer"** setzen | `2026-08-18-plan4-radio-cutover.md:1739`, `:2630` · `2026-08-18-plan5-radio-abbau.md:663` | 3 | Ersetzung — dreimal dieselbe Erwartung, dazu je der Kommentar, der **die eine** Fundstelle benennt: `2026-08-18-plan2-radio-paritaet.md:814`, die Zeile „Generalprobe" der §L.3-Lauf-Tabelle, wo `DATA_DIR` ein **Bind-Pfad** (`$GP/data`) ist. ⛔ **NICHT „zwei", und NICHT zeichengleich zu `2026-08-18-plan2-radio-paritaet.md:862-868`** — jenes Tor sucht die **breite** Form `DATA_DIR/radio.db` und trifft damit zu Recht zwei Stellen; diese drei suchen die **engere Befehlsform** und treffen eine. **Gemessen 2026-08-19** über die markdown-Zäune: der ⛔-Absatz `2026-08-18-plan2-radio-paritaet.md:788` formuliert das Verbot im **Fließtext** und wird von der engeren Form nicht getroffen · `2026-08-18-plan2-radio-paritaet.md:800` ist Planprosa **außerhalb** der Zäune und erreicht das Runbook nie · `2026-08-18-plan5-radio-abbau.md:1827` trifft, steht aber in einem Zaun, der **Spec 2** schreibt, nicht das Runbook. ✅ **Alle drei Tore tragen die berichtigte Erwartung bereits** (`2026-08-18-plan4-radio-cutover.md:1740`, `:2631`, `2026-08-18-plan5-radio-abbau.md:664`) — **nur nachzuprüfen** | NS11a |

**Und vier Nachträge in die Spec**, die Aufgabe **Nr. 41** ausführt (`2026-08-18-plan5-radio-abbau.md:1695`):

1. die **L5-Verkleinerung** samt berichtigtem Beleg (NS8),
2. der **dritte Unterschied** des Fenster-Prüfcontainers (NS11),
3. **Anhang A-3** (NS12),
4. der Sperrenkasten **mit P6** (NS13).

⛔ **Zwei davon trägt die Aufgabe heute nicht — ihre Dateienliste ist zu erweitern.** Die Liste von
Aufgabe 5.10 (`2026-08-18-plan5-radio-abbau.md:1703-1709`) führt §5.2.2 Abfrage A (`:4293-4299`), den Sperrenkasten §5.3
(`:4609-4610`), die Erfüllungspunkte 3 (`:4797-4798`), 9 (`:4810`) und 17 (`:4828-4829`) sowie Anhang
A-3 (`:4891`) und A-5 (`:4893`) — **die L5-Zeile und der dritte Unterschied kommen darin nicht vor**,
und die vier Schritte der Aufgabe (`:1721`, `:1747`, `:1771`, `:1785`) fassen sie ebenfalls nicht an.
Kein anderer der einundvierzig Aufträge beansprucht sie. Ohne die Erweiterung bleibt nach Abschluss
**aller** Aufgaben in Spec 2:185 die Leerstelle stehen, die NS8 für verkleinert erklärt, und in
Spec 2 §3.2.2 der eine Hostwert, den NS11 für geheilt hält. **Aufzunehmen sind:**

* **Spec 2:185** — die L5-Zeile der ⬜-Tabelle, samt Berichtigung des Belegs auf
  `src/core/health/index.ts:4-15` statt `route.ts:11-18`,
* **Spec 2 §3.2.2** — `SUITE_HOST_RADIO` als **Kommaliste**, der dritte Unterschied zu W5,

jeweils **mit einem eigenen Schritt** und **je einer Zeile in Schritt 4s Gegenprobe** — sonst zählt
die Gegenprobe der Aufgabe eine Zahl, die ihr Rumpf nicht deckt (W8).

⚠️ **Die Zahl im Kopf dieses Absatzes hieß bis zuletzt „zwei" und der Rumpf zählte vier auf.** Das
ist genau der W8-Fehler, den dieses Dokument als tragend führt (oben, Zahlenregel): eine Prüfliste,
deren Kopf eine andere Zahl nennt als ihr Rumpf, wird unter Zeitdruck gekürzt.

---

## Selbstprüfung dieses Leitplans

| Was der Auftrag verlangt | Wo es steht |
|---|---|
| Pflichtkopf für den **Gesamtweg** | Kopf, oben — Goal/Architecture/Tech Stack/Spec beziehen sich auf alle 41 Aufgaben, nicht auf ein Kapitel |
| Globale Randbedingungen, Werte **wörtlich** aus dem Rahmen | „Globale Randbedingungen", die neun harten mit `Spec 2:<zeile>` je Zeile |
| Reihenfolge: **eine** Tabelle, durchgehend numeriert, Nr · Aufgabe · Teil und Anker · wartet auf · liefert | „Die Reihenfolge", 41 Zeilen |
| Nahtstellen: was Teil X sagt · was Teil Y sagt · **was gilt** · warum | „Nahtstellen", NS1–NS14 |
| Sperren: Nummer · was abzulesen ist · Quelle · welche Aufgaben warten | „Sperren", drei Tabellen (Bau · Server · Betreiber) |
| Was heute schon läuft, **vorn** und nicht in einer Fußnote | dritter Abschnitt, vor der Reihenfolge |
| Keine Erfindung — jede offene Stelle als benannte Nummer | die drei Sperrentabellen; **kein** Wert in diesem Dokument, den nicht ein Beleg trägt |
