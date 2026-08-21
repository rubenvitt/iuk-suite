# Leitplan für den Bau des Moduls — `radio` (Spec 1)

> **For agentic workers:** Dieser Leitplan baut **nichts**. Er entscheidet die Reihenfolge und die
> Nahtstellen der fünf Planteile, die Spec 1 umsetzen. Wer bauen will, nimmt den Planteil, nicht
> diese Seite.

**Stand 2026-08-21.** Grundlage: `docs/superpowers/specs/2026-08-17-radio-modul-design.md` (Spec 1 —
das Modul, 7865 Zeilen, neun Kapitel). Verbindlich sind seine Kapitel **A** (15 gesetzte
Entscheidungen) und **B** (B1–B19, entschiedene Widersprüche) — **auch dort, wo ein Kapiteltext
abweicht.**

⚠️ **Nicht zu verwechseln mit `2026-08-18-radio-bau-leitplan.md`.** Der führt den Bau des
**Import-Skripts** (Spec 2, Kapitel 1 und 2 Teil A) und zählt **B1–B17**. Diese Seite führt den Bau
des **Moduls** (Spec 1) und zählt **M**, **Z**, **A**, **V**, **G**, **T**. Beide Wege treffen sich
an genau einer Stelle: Stufe **M** dieser Seite ist die Zäsur, hinter der `B5` des anderen Wegs
ausführbar wird.

---

## Warum diese Seite jetzt entsteht

Am 2026-08-20 sind **B1–B4** gebaut — die gesamte Quellseite des Importers (Fixture, Rohzeilen,
Zeitachse, `lieseQuelle`), fünf signierte Commits bis `07b5f41`, 17 Tests grün. Danach steht der Weg
`radio` an **einer** Stelle still, und `2026-08-18-radio-ausfuehrungsplan.md` benennt sie als
**Zäsur 1**:

> „**Spec 1 ist nicht gebaut.** `src/app/m/radio/` existiert nicht — kein Zielschema, keine
> Typaliase, kein Migrationsverzeichnis, kein `/api/health/radio`. … ein eigener Bauweg aus Spec 1,
> nicht Teil dieser Pläne."

Dieser eigene Bauweg hatte bis heute **kein Dokument**. Nur die Spec. Das ist die Lücke, die diese
Seite und ihre Planteile schließen.

**Was heute wartet, in Zahlen:** 13 Bauaufgaben (B5–B17) und 8 Cutover-Aufgaben (C9, C14, C15, C19,
C20, C28, C29, C30) hängen an Artefakten, die erst hier entstehen. Sie hängen **nicht alle an
demselben** Artefakt — und genau das entscheidet die Reihenfolge unten.

---

## Die Stufen der Spec, und die eine Abweichung

Spec 1 führt im Anhang „Abhängigkeiten und Baureihenfolge" **sieben Stufen**, mechanisch aus 35
„Zusage an Kapitel N"-Stellen abgeleitet:

| Stufe der Spec | Kapitel | Begründung der Spec |
|---|---|---|
| 1 | **1 Zuschnitt** | „Alles andere setzt voraus, dass das Modul existiert und der Riegel steht. Ohne ihn ist jede spätere **Fläche** von jedem Suite-Host erreichbar (Falle 61)" |
| 2 | **2 Datenmodell** | „Schema, Migrationen, Zeitstempel-Mapping, Retention-Takt. Kapitel 3, 4, 5 und 6 schreiben alle dagegen" |
| 3 | **3 Zugang** | Code, Gate, Sitzung. Kapitel 4 hängt vollständig daran |
| 4 | **6 Grenze** | Die sechs `/v1`-Routen werden Drizzle-Aufrufe. „baulich unabhängig von den Oberflächen, deshalb parallel zu Stufe 5 möglich" |
| 5 | **4 Ausleihe** und **5 Verwaltung** | Die zwei Oberflächen, parallel zueinander |
| 6 | **7 Betrieb** | Boot-Prüfungen, Health, Konfiguration, Abräum-Worker |
| 7 | **8 Tests** | „nur die e2e-Fläche und die Mutationsproben; die Unit-Tests entstehen **mit** ihrem Kapitel" |

### ⚠️ Die Abweichung: Kapitel 2 wird **vor** Kapitel 1 gebaut

**Entschieden, mit Grund — nicht aus Bequemlichkeit.**

Die Spec setzt Zuschnitt auf Stufe 1, und ihr Argument steht wörtlich oben: **ohne den Host-Riegel
ist jede spätere Fläche von jedem Suite-Host erreichbar.** Das Argument trägt — für **Flächen**.
Kapitel 2 baut keine. Es baut eine Schemadatei, ein Migrationsverzeichnis, drei reine Funktionen und
ein Seed-Skript; es entsteht **keine Seite, keine Server Action, kein Route Handler**, also nichts,
das ein Host erreichen könnte. Falle 61 kann an Stufe **M** nicht zuschlagen.

Was der Tausch kauft: Stufe **M** allein macht **⬜ L1, ⬜ L3 und ⬜ L4 ablesbar** und damit
**B5–B17 ausführbar** — 13 Aufgaben, die seit dem 2026-08-19 stehen, darunter die **drei Tests, ohne
die Kapitel 1 von Spec 2 keinen Schutz hat** (§1.10). Gebaut in der Spec-Reihenfolge wären sie einen
ganzen Planteil länger blockiert, ohne dass irgendetwas daran sicherer wäre.

**Die Gegenauflage, und sie ist hart:**

> ⛔ **Vor Stufe Z entsteht keine Fläche.** Keine `page.tsx`, keine `_actions/*.ts`, kein
> `route.ts`, keine `layout.tsx` unter `src/app/m/radio/`. Wer in Stufe M eine Seite anlegt „damit
> man mal was sieht", hat genau die Falle geöffnet, die die Spec mit ihrer Reihenfolge zumacht — und
> **kein Tor sieht es**: `pnpm typecheck`, `pnpm lint` und `pnpm build` sind bei einer von jedem Host
> erreichbaren Seite grün.

Der Riegel dagegen ist mechanisch und steht im Planteil 1 als eigener Testfall (Aufgabe **M4**, der
Quelltext-Scan über `src/app/m/radio/`).

---

## Die fünf Planteile

| Planteil | Kapitel der Spec | Erzeugt | Entsperrt |
|---|---|---|---|
| **1 — Datenhaltung** `2026-08-21-radio-modul-plan1-datenhaltung.md` | **2** (ohne §2.8 — der Importer ist Spec 2) | `_db/schema.ts` · `_db/client.ts` · `_db/drizzle.config.ts` · `migrations/0000_*` + `0001_loans_aktiv_uidx.sql` · `migrations.test.ts` · `append.test.ts` · `_lib/boot.ts` (nur Retention-Rechnung) · `_lib/seedLokal.ts` · das Registrierungs-Dreieck | ⬜ **L1**, ⬜ **L3**, ⬜ **L4** → **B5–B17** · **C9**, **C15** |
| **2 — Zuschnitt** (zu schreiben) | **1** | Registry-Zeile · Routenkarte · zwei Hüllen · `_lib/host.ts` (vier Riegelformen) · `_lib/hostRiegel.ts` · `_lib/zugang.ts` · `riegel.test.ts` · `routen.test.ts` | ⬜ **L7**, ⬜ **L8** → **C19**, **C29**, **C30** |
| **3 — Zugang und Ausleihe** (zu schreiben) | **3** und **4** | `zugangscodes`-Ausstellung und -Sperrung · Gate (Route Handler + Server Action) · Sitzung · `_lib/ausleihZugang.ts` · die Ausleihfläche an `/` | ⬜ **L9**, ⬜ **L10** → **C20**, und die zweite Hälfte von **C19**, **C29**, **C30** |
| **4 — Grenze und Verwaltung** (zu schreiben) | **6** und **5** | die sechs `/v1`-Routen als Drizzle-Aufrufe · die zehn `/admin`-Seiten · der CSV-Export-Handler · die fünf `"use client"`-Tabelleninseln | — (⛔ Kapitel 5 ist durch **C.6** gesperrt, siehe unten) |
| **5 — Betrieb** (zu schreiben) | **7** und **8** | `radioBootFehler()` + Einhängung · `starteRadioHintergrund()` (Takt, Abschalter, Erstlauf) · `/api/health/radio` · PWA und Abräum-Worker · die e2e-Fläche | ⬜ **L11**, ⬜ **L12**, ⬜ **N4** → die dritte Hälfte von **C30**, **C19** |

**Heute geschrieben ist Planteil 1.** Die vier übrigen entstehen je einzeln, wenn ihr Vorgänger
gebaut ist — aus demselben Grund, aus dem Spec 2 fünf Planteile hat und nicht einen: ein Plan über
7865 Spec-Zeilen wäre nicht gegenlesbar, und die Werte der späteren Teile hängen an dem, was die
früheren tatsächlich hergeben.

---

## Die harten Reihenfolge-Auflagen

Drei Auflagen, die **keine Stufe** sind und die jede Stufe binden:

1. ⛔ **Die HTTP-Grenze darf erst fallen, wenn Planteil 4 fertig ist** (Entscheidung 15, wörtlich in
   der Spec). „Wird sie früher gekappt, steht der Alt-Kiosk ohne Bestand da; schwenkt die Verwaltung
   zuerst, verliert er seine Datenquelle. Beide Domains ziehen im selben Fenster um."
2. ⛔ **Der Abräum-Worker aus Kapitel 7 gehört zum ERSTEN Deploy**, nicht zum Cutover. „Weil der
   Alt-Kiosk denselben Origin hält, überlebt sein Service Worker den Umschwenk — ohne Abräumen
   liefert er gecachte Alt-Oberfläche an Geräte aus, die nie neu geladen haben."
3. ⛔ **Vor Planteil 2 entsteht keine Fläche** (oben begründet).

---

## Voraussetzungen außerhalb dieses Wegs

Spec 1 nennt sie ausdrücklich als **eigene Suite-Posten**, nicht als Teil ihrer selbst. Sie stehen
hier, damit niemand rätselt, was fehlt:

| Posten | Wofür er gebraucht wird | Frist |
|---|---|---|
| **Die CWE-348-Umstellung in `core/ratelimit.ts`** | ⛔ der Einlöse-Endpunkt des Gates (Kapitel 3, Planteil 3). „Ohne Ratenbegrenzung ist ein sechsstelliger Code ratbar" | **vor** Planteil 3 |
| `TZ=Europe/Berlin` | nichts in diesem Weg — `tagInBerlin` rechnet ausdrücklich **ohne** sie (§2.2.3), und das ist der Grund, warum die Spalte TEXT ist | — |
| Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts` | Entscheidung 9 (`radio` ignoriert `isModuleAdmin` **modulintern**) — ohne den Posten trägt Planteil 2 die Umgehung selbst | vor Planteil 4 |
| Das suiteweite Gating von `/m/*` | nichts hier zwingend; Entscheidung 10 baut den Riegel ohnehin in jede Seite, Action und jeden Handler | — |

---

## Die Sperren dieses Wegs

### ⛔ Zwei Betreiberfragen, ohne die gebaut würde

| # | Frage | Was ohne Antwort passiert | Blockiert |
|---|---|---|---|
| **C.6 / B4** | **Zwei Rollen oder eine?** `SUITE_UPDATER_GROUP_RADIO` und eine Updater-Stufe stehen in Kapitel 5; **kein anderes Kapitel kennt sie.** Im Bestand ist die Trennung echt (`radio-admin/shared/src/role.test.ts:4`), im Ziel hat sie keinen Träger | Kapitel 5 baut eine Rechtestufe, die kein anderes Kapitel kennt — und niemand merkt es, weil sie in sich konsistent ist | ⛔ **Planteil 4** (Verwaltung). Die `/v1`-Routen desselben Planteils sind **nicht** betroffen |
| **C.1** | **Bauform des Ausleih-Codes:** dauerhaft und sperrbar (Vorschlag), rotierend, oder Sitzung je Scan? | ⚠️ **Vorentschieden, nicht vom Betreiber** — „dauerhaft + sperrbar ist die am wenigsten festlegende Wahl". Ein Wechsel auf „Sitzung je Scan" ändert **eine** Stelle im Schema und **eine** im Gate | nichts formal — aber die Schemazeile entsteht in **Planteil 1**. Wird C.1 nach Planteil 1 anders entschieden, ist das eine additive Migration `0002`, kein Umbau |

Die übrigen fünf (C.2 Sitzungsdauer 12 h · C.3 gedruckte Aufsteller · C.4 Namensvorbelegung ·
C.5 Auslieferung des Alt-Frontends · C.7 Offline-Schreiben) blockieren **keinen** Planteil dieses
Wegs. C.5 blockiert den **Cutover** und steht in `SPERREN-radio-spec2.md`.

### ⬜ Was dieser Weg selbst nicht wissen kann

| ⬜ | Was | Wann ablesbar |
|---|---|---|
| **M-L1** | Der von `drizzle-kit` **gewürfelte** Name der generierten `0000_<name>.sql` | nach dem `generate`-Lauf in Aufgabe M2. Er wird **nicht** umbenannt (§2.9.1) |
| **M-L2** | Die Zahl der Migrationszeilen in `__drizzle_migrations` nach dem ersten Lauf (= ⬜ **L4** der Cutover-Sperrtafel) | nach Aufgabe M6 |

**Keine weitere.** Alle Werte, die Planteil 1 braucht, stehen in Spec 1 als Code — Schema,
Migrationstext, Retentionsrechnung und Seed-Inhalt sind dort ausgeschrieben, nicht beschrieben.

---

## Globale Randbedingungen

Sie gelten für **jeden** Planteil dieses Wegs. Wo Spec 1 und der bestehende Bau-Leitplan verschieden
formuliert haben, gilt die **Vereinigung**.

* **Kommandos, alle mit `rtk` präfixt, auch in Ketten mit `&&`:** `rtk pnpm typecheck` ·
  `rtk pnpm lint` · `rtk pnpm vitest run` · `rtk pnpm build` · `rtk pnpm exec playwright test` ·
  `rtk pnpm exec drizzle-kit generate --config <pfad>` · `rtk pnpm seed:lokal`.

* ⚠️ **Das Tor ist gemessen und es ist nicht das, was die älteren Pläne verlangen.** Der volle
  `rtk pnpm vitest run` ist in diesem Repo **vorbestehend rot**: gemessen am 2026-08-20
  **170 Fehlschläge in 9 Dateien** (`m/feedback`, `m/files`, `m/qr`, `components/providers`).
  Gegenprobe mit zwei vollen Läufen, einmal mit und einmal **ohne** die vier B1–B4-Dateien: ohne sie
  sind es **171 in 10 Dateien**, also einer **mehr**. Leitbild ist
  `TypeError: Cannot read properties of undefined (reading 'clear')` auf `localStorage.clear()` in
  `src/app/m/feedback/f/[slugSecret]/Zettel.test.tsx` — diese Tests laufen in der `node`-Umgebung
  statt in jsdom. Ein Verdacht, **nicht** geprüft: `pnpm-lock.yaml` führt `vitest@4.1.10`, die
  radio-Pläne haben gegen `4.1.5` gemessen.
  **Deshalb gilt als Tor je Aufgabe:** `rtk pnpm typecheck` **grün** (0 Fehler) ·
  `rtk pnpm lint` **0 Fehler** · **die eigenen Testdateien der Aufgabe grün** · und **kein neuer
  Fehlschlag** in einer Datei, die der Diff nicht anfasst. Wer behauptet, seine Änderung habe die
  Suite rot gemacht, entscheidet das mit der **Beiseitelege-Gegenprobe** (die eigenen Dateien
  temporär verschieben, voll laufen lassen, zurücklegen), nicht mit dem Zählwert allein.
  ⚠️ Die 170 zu richten ist ein **eigener Auftrag** an `m/feedback` und `m/files` plus die
  vitest-Frage — und §3.6 Nr. 1 von Spec 2 verlangt drei grüne Tests vor der ersten Generalprobe,
  weshalb dieser Posten vor dem Cutover fällig ist, aber nicht hier.

* **`pnpm build` und Playwright** werden von Planteil 1 nicht berührt (er fasst kein `src/app/**`
  außer `src/app/m/radio/_db/` und `_lib/` an, und legt dort keine Route an). Von Planteil 2 an
  laufen sie **einmal vor dem Merge**.

* **Zeit ist Unix-SEKUNDEN im Ziel und epoch-MILLISEKUNDEN in der Quelle.** Nie über die
  Einheitengrenze vergleichen, ohne den Faktor im Ausdruck sichtbar zu lassen. Die schärfste
  Formulierung im Haus: `src/app/m/lagerbuch/_db/schema.ts:11-16`. **Keine Zeitspalte des Ziels
  trägt `mode: "timestamp_ms"`.** Die eine Ausnahme ist `devices.last_updated_at` — sie ist
  **TEXT** `YYYY-MM-DD` und keine Zeitspalte (§2.2.3).

* **Kein `"use client"` in einer Datei unter `_db/`** — Falle 6. Auch nicht in `_lib/boot.ts`.

* **Migrationen sind append-only.** Der Hash jeder Datei steht in `__drizzle_migrations`; wird eine
  bestehende Datei neu erzeugt, versucht Drizzle sie auf bereits migrierten Datenbanken erneut
  anzuwenden und der Container läuft in eine **Absturzschleife**. Das hat in radio-admin **einmal
  die Produktion lahmgelegt** (`radio-admin/CLAUDE.md`, Abschnitt „Datenbank-Migrationen —
  APPEND-ONLY (kritisch)").

* **Die SQL-Spaltennamen der fünf Alt-Tabellen bleiben zeichengleich zur Quelle** (`issi`,
  `loanable`, `snapshot_call_sign`), und die TypeScript-Bezeichner ebenfalls (`snapshotCallSign`),
  obwohl die jüngeren Suite-Module deutsch benennen: 61 zuzuordnende Spalten, jede Umbenennung eine
  Verwechslungsgelegenheit, die kein Gate sieht. **Die neue Tabelle `zugangscodes` ist deutsch
  benannt** — sie hat keine Quelle, die sie binden würde.

* **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In TypeScript-Bezeichnern und in
  Testnamen **keine** Umlaute (Hausform: `paritaetsSichtGeraet`, `msZuDatum`, `tagInBerlin`).
  ⚠️ Und **niemals in einem zitierten Wert oder einem Grep-Anker.**

* **Belegpflicht.** Jede Behauptung in einem Kommentar nennt `datei:zeile`. Wo ein Wert erst der Bau
  oder der Server hergibt, steht eine **benannte Leerstelle** (⬜), nie eine plausibel aussehende
  Erfindung. Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein `cookies().delete()`
  in einer Server Component, wo es **wirft**.

* **`getModuleDb()` wird in Tests NICHT benutzt.** Sein Cache ist per Modulschlüssel gekeyt, nicht
  per `DATA_DIR` (`src/core/db/index.ts:31-35`). Tests bauen ihre DB selbst und migrieren sie
  (`src/app/m/lagerbuch/_db/migrations.test.ts:29-37`).

* **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore (`vitest.config.ts:8-34`: 251 Fremdfehlschläge, gemessen). Und **kein `pnpm build`
  vor einem Testlauf, den man ernst nimmt**: `.next/standalone/src/` ist eine vollständige Kopie des
  Quellbaums **inklusive Testdateien** (52 Fehlschläge, ebenda). Und **kein `pnpm dev` parallel zur
  Testsuite**.

* **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.

* ⚠️ **Nicht `git add .` und nicht `-A`.** Im Arbeitsbaum liegen die 13 unverfolgten
  Planungsdokumente dieses Wegs und `.idea/`. Namentlich stagen, mit `rtk git show --stat HEAD`
  nachsehen.

---

## Nahtstellen

### NS-M1 — Kapitel 2 baut die Retention-**Rechnung**, nicht den **Takt** ⛔ tragend

**Entschieden in Spec 1 B5.** `_lib/boot.ts` trägt am Ende **zwei** Exportgruppen von **zwei**
Planteilen:

| Wer | Was | Planteil |
|---|---|---|
| Kapitel 2 §2.7.1 | `RETENTION_MONATE_VORGABE`, `retentionGrenze(jetzt, monate): Date`, `raeumeLeihhistorie(db, jetzt?, monate?): number` | **1** |
| Kapitel 7 §7.3.5 | `starteRadioHintergrund()`, `stoppeRadioHintergrund()`, `RADIO_HISTORIE_MONATE/_PURGE/_ERSTLAUF_MINUTEN`, der Timer | **5** |
| Kapitel 7 §7.3.1 | `radioBootFehler()` | **5** |

**Warum das eine Naht ist und keine Aufteilung nach Geschmack:** beide Kapitel schreiben denselben
`startBackgroundWork()`-Rumpf aus. Gebaut wären **zwei Timer in einer Datei** und zwei Läufe je
Takt. Und: `retentionGrenze` rechnet mit `Date`, **nicht** mit `number` — B16 sagt warum, und es ist
derselbe Grund, der `sekundenAusMs` in Spec 1 gestrichen hat: „eine Zahl ist in eine
`mode: \"timestamp\"`-Spalte nicht einfügbar — das hätte erst der erste echte Insert gezeigt, nie der
Mapper-Test."

**Folge für Planteil 1:** die **fünf Takt-Fälle** aus §2.7.2 (`starteRadioHintergrund loescht beim
Start NICHTS`, Erstlauf, `RADIO_HISTORIE_PURGE=0`, HMR-Idempotenz, kein Wurf) gehören **nicht** in
Planteil 1. Sie brauchen den Timer. Planteil 1 baut die **fünf reinen Fälle** aus §8.2.5/§2.7.3.
⚠️ Darunter ist `starteRadioHintergrund loescht beim Start NICHTS` — **einer der drei Tests, ohne
die Kapitel 2 keinen Schutz hat.** Er entsteht in **Planteil 5**, und bis dahin ist die
Regressionssperre gegen den zurückgebauten Sofort-Purge **nicht gebaut**. Das ist bewusst und steht
hier, damit es niemand für vergessen hält.

**Und die Reihenfolge der zwei Exporte ist Pflicht** (B8): `radioBootFehler()` läuft **vor** den
Migrationen und liest **keine** Tabelle; `starteRadioHintergrund()` läuft **danach** und braucht sie.

### NS-M2 — Kapitel 2 baut den Importer **nicht** ⛔ tragend

§2.2.4, §2.2.5, §2.8 und die Fixture-Zeilen von Spec 1 beschreiben `scripts/import/radio.ts` — und
**dieselbe** Datei ist der Gegenstand von Spec 2, Kapitel 1, umgesetzt in
`2026-08-18-plan1-radio-import.md` als **B1–B17**. Davon sind **B1–B4 gebaut**
(Commits `a309f12`, `5fbcd72`, `6e710bf`, `38c5d77`, `07b5f41`).

> ⛔ **Planteil 1 fasst `scripts/import/` nicht an.** Kein Mapper, keine Paritätssicht, keine
> Fixture-Zeile. Wer §2.2.4 als Bauauftrag liest, baut B5–B7 zum zweiten Mal und in einer zweiten
> Form. Spec 1s Fassung dieser Funktionen **gilt** (B16) — sie ist bereits in
> `scripts/import/radio.ts` gebaut.

Die Richtung ist umgekehrt: Planteil 1 **liefert**, was B5 braucht. Siehe NS-M3.

### NS-M3 — Was Planteil 1 an Spec 2 liefert: ⬜ L1, ⬜ L3, ⬜ L4

Die drei Leerstellen, die `2026-08-18-plan1-radio-import.md` und
`2026-08-18-plan2-radio-paritaet.md` namentlich blockieren, werden von **Aufgabe M6** dieses
Planteils **abgelesen und protokolliert** — nicht erfunden:

| ⬜ | Was abzulesen ist | Blockiert heute |
|---|---|---|
| **L1** | Die **zehn Typaliase**, die `_db/schema.ts` exportiert: `NeuesGeraet`/`Geraet`, `NeueSoftwareVersion`/`SoftwareVersion`, `NeuerBenutzer`/`Benutzer`, `NeuesGeraeteEreignis`/`GeraeteEreignis`, `NeueLeihe`/`Leihe` | **B5 · B6 · B7 · B9 · B14 · B15 · B16** — „keine Mapper-Signatur kompiliert" |
| **L3** | Namen und **vollständige** Spaltenlisten der vier übrigen Paritätssichten (`software_versions` 6, `users` 3, `device_events` 8, `loans` **12**) | **B9–B13** — „fehlt eine Spalte in einer Sicht, ist die Parität für sie blind, und das sieht kein Test" |
| **L4** | `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Einträge in `_journal.json` | **C9 · C15** |

⚠️ **`loans` hat im Ziel 12 Spalten, nicht 11** — die zwölfte ist `zugangscode_id` (B6). Der
Ausführungsplan schreibt bei **B13** dasselbe: „12 Spalten (11 aus der Quelle, eine neu)". Wer das
Schema mit 11 baut, macht B13 unerfüllbar.

### NS-M4 — Das Registrierungs-Dreieck ist ein Block mit **einem** Tor ⛔ tragend

Drei Tests im Bestand koppeln vier Stellen aneinander, und sie werden **rot, sobald
`src/app/m/radio/_db/` existiert**:

| Test | Bedingung | Datei |
|---|---|---|
| `jedes Modul mit _db/ steht in MODULE_MIGRATIONS` | Verzeichnis-Scan über `src/app/m` | `src/core/bootstrap.test.ts:90-97` |
| `jeder Migrations-Ordner existiert und hat ein Journal` | `migrations/meta/_journal.json` | `:99-104` |
| `jeder Migrations-Ordner wird ins Prod-Image kopiert` | `COPY`-Zeile im `Dockerfile` | `:106-113` |
| `deckt jedes Modul mit eigener Datenbank ab` | `SEED_MODULE`-Schlüssel **gleich** `MODULE_MIGRATIONS`-Schlüssel | `scripts/seed-lokal.test.ts:38-45` |

**Folge:** zwischen „Schemadatei angelegt" und „Seed verdrahtet" kann **kein Tor grün sein**. Der
Block **M1 → M2 → M3** hat deshalb **genau ein Tor**, nach M3, und **einen gemeinsamen Commit**.
Das ist dieselbe Bauart wie B8–B13 im anderen Weg — dort ist der Grund `tsconfig.json`, hier sind es
diese vier Zeilen. **Rot dazwischen ist der Zweck, nicht der Fehler.**

### NS-M5 — `bezeichnung`, nicht `label`; und `zugangscode_id` **kommt** ⛔ tragend

Spec 1 §2.4 ist an **zwei** Stellen von B6 überholt, und die Prosa ist dort **nicht** nachgezogen:

| §2.4 sagt | B6 entscheidet | Warum es zählt |
|---|---|---|
| „**`label` ist das Anzeigefeld**" | **`bezeichnung`** | Der Name trägt in Kapitel 3 Schema, Action-Signatur `erstelleCode(bezeichnung)`, Laufzeittyp `AusleihZugang` und die Zusage an Kapitel 5. `label` stand an **einer** Stelle |
| „**`loans` bekommt KEINE Spalte für den Zugangsweg.** Weder `zugangscode_id` noch ein `quelle`-Feld" (mit drei ausgeschriebenen Gründen) | **`loans.zugangscode_id` kommt** — nullable, `REFERENCES zugangscodes(id)`, **ohne** `ON DELETE`, **ohne** Index | Sie ist „die zweite Hälfte des Löschverbots — beides oder nichts" (§3.2.4 Punkt 3). Und §2.11 Nr. 7 trägt die Korrektur schon: „⚠️ **Korrigiert (B6)**" |

> **Wer §2.4 liest und baut, was dort steht, baut das Schema falsch** — mit `label` statt
> `bezeichnung` und mit 11 statt 12 `loans`-Spalten. Beides ist gültiges Drizzle, gültiges SQL und
> **paritätsgrün**. Verbindlich ist Kapitel **B**, nicht der Kapiteltext.

### NS-M6 — Der Tabellenname trägt einen Test, der bei Abweichung **still grün** ist

`zugangscodes` heißt in Kapitel 2 Schema, Index, Seed, `bootstrap.ts`-Kommentar **und** den
Quelltext-Scan `delete(zugangscodes)` aus §2.4 (Aufgabe **M4**). B6 schreibt die Folge selbst hin:
**bei abweichendem Tabellennamen wäre der Scan still grün.** Ein Scan, der nach der falschen
Zeichenkette sucht, findet nie etwas und meldet nie etwas.

### NS-M7 — `seedAllModules()` bekommt **keine** `radio`-Zeile

Und `src/core/bootstrap.ts` bekommt **keinen** `radio`-Schema-Import. Der Grund ist hart und steht
in §2.9.2 als Kommentar, der **mitgeschrieben** wird: `shouldSeed()` ist bei `SUITE_SEED=1` auch in
der **Generalprobe** wahr, und eine geseedete Zeile in `zugangscodes` ist ein gültiger **anonymer
Schreibzugang** — jemand kann damit ohne Anmeldung Geräte ausleihen und zurückgeben. Gehalten wird
das zusätzlich von `scripts/seed-lokal.test.ts:56` (Quelltext-Scan gegen die Namen
`seedLokal`/`seed-lokal` in `bootstrap.ts` und `instrumentation.ts`) — er fängt „die naheliegende
Verdrahtung, nicht jede denkbare".

### NS-M8 — Der partielle Index ist gateblind, in **beide** Richtungen

`loans_device_active_uidx` ist der **einzige** Riegel für „höchstens eine aktive Ausleihe je Gerät",
er ist **partiell**, und `drizzle-kit` kann partielle Indizes nicht emittieren. Zwei Folgen, die
Spec 1 §2.6 ausschreibt und die den Testsatz von M2 begründen:

* **(a) Wird er vergessen, ist der Riegel weg — und der Import ist grün.** Die Altdaten erfüllen die
  Invariante, es fällt nichts auf. Sichtbar wird es erst beim zweiten Ausleihen desselben Geräts.
  `pnpm typecheck` und `pnpm build` fassen Migrationen nicht an.
* **(b) Ein Upsert kann ihn nicht als Konfliktziel treffen.** `onConflictDoUpdate({ target:
  loans.deviceId })` trifft ihn **nie** — bei einem partiellen Index muss das Ziel dieselbe
  `WHERE`-Klausel tragen. Historie im Bulk ist gefahrlos (dort ist `returned_at NOT NULL`); **zwei
  aktive Leihen für dasselbe Gerät schlagen hart fehl.** Das ist der Grund für Abfrage 4 aus §2.8.3
  **vor** dem Import — ein Runbook-Schritt in Spec 2, nicht hier.

⚠️ **Und die Textsuche auf ihn schlägt fehl, nicht der Index.** Gemessen für B1–B4: die Quell-DDL
schreibt den Index mit **Backticks**, `instr(sql,'WHERE returned_at IS NULL')` auf
`sqlite_master.sql` ergibt **`0`**. Die **Strukturprobe** trägt:
`select name, partial, "unique" from pragma_index_list('loans')` liefert
`loans_device_active_uidx|1|1`. M2 fährt die Strukturprobe.

---

## Selbstprüfung dieses Leitplans

| Frage | Antwort |
|---|---|
| Deckt die Stufenfolge alle neun Kapitel der Spec ohne Lücke? | Ja: Planteil 1 = K2 · 2 = K1 · 3 = K3+K4 · 4 = K6+K5 · 5 = K7+K8. **K9 ist kein Bauschritt** („die verbindliche Liste an Spec 2") |
| Wartet ein früher numerierter Planteil auf einen späteren? | Eine benannte Ausnahme, oben ausgeschrieben und begründet: **Planteil 1 (K2) vor Planteil 2 (K1)**, abweichend von der Stufenfolge der Spec. Die Gegenauflage „vor Stufe Z keine Fläche" ist als Testfall in M4 verankert |
| Ist jede ⬜-Leerstelle einer Aufgabe zugeordnet, die sie abliest? | Ja: M-L1 → M2, M-L2 → M6, L1/L3/L4 → M6. L7–L12, N1, N4 liegen in den Planteilen 2, 3 und 5; L13, L14, E2–E7, N2, N3, N5–N10 sind **Server**- und **Betreiber**auskünfte und stehen in `SPERREN-radio-spec2.md` |
| Steht irgendwo ein erfundener Wert? | Nein. Schema, Migrationstext, Retentionsrechnung und Seed-Inhalt sind in Spec 1 **als Code** ausgeschrieben; das Tor ist am 2026-08-20 **gemessen**; die vier Kopplungstests sind mit `datei:zeile` belegt |
| Sind die Widersprüche der Spec gegen ihre eigene Prosa aufgelöst? | Drei, alle in Nahtstellen: **NS-M1** (Retention-Eigentum, B5) · **NS-M5** (`bezeichnung`, `zugangscode_id`, B6) · **NS-M2** (der Importer gehört Spec 2, B16) |
| Was ist die schärfste Folge dieses Wegs für den Kalender? | **Planteil 5** trägt `starteRadioHintergrund loescht beim Start NICHTS` — einen der drei Tests, ohne die Kapitel 2 keinen Schutz hat (§1.10). Bis Planteil 5 gebaut ist, existiert die Regressionssperre gegen den Sofort-Purge nicht. Und §3.6 Nr. 1 verlangt alle drei **grün** vor der ersten Generalprobe: **ohne Planteil 5 gibt es keine Generalprobe** |

---

## Ausführungsart

Die Planteile tragen die Auflage `superpowers:subagent-driven-development` (empfohlen) oder
`superpowers:executing-plans`. Bei sechs Aufgaben je Planteil, einem Block mit einem Tor und einer
Reihenfolge, die hier geprüft ist, trägt der **subagentgetriebene** Weg besser: ein frischer
Subagent je Aufgabe, Review dazwischen.
