# Planteil 2 von 5 · Zuschnitt, Registry, Routing und die zwei Riegel — Umsetzungsplan (Spec 1, Kapitel 1)

> **For agentic workers:** Führe diesen Plan mit `superpowers:subagent-driven-development` aus — ein
> frischer Subagent je Aufgabe, Review dazwischen (Leitplan
> `2026-08-21-radio-modul-leitplan.md:430-433`; `:393-396` war falsch, dort steht
> `loans_device_active_uidx` — Vorabscan-Fund F7, korrigiert am 2026-08-22 in Aufgabe Z2).
> ⚠️ Der Leitplan schreibt dort **„(empfohlen)"**; dieser Plan schaerft das bewusst zu
> **„Fuehre … aus"**, weil Z5 und Z6 EIN Tor und EINEN Commit teilen und ein Review
> dazwischen sonst keinen Ort haette.
> `superpowers:executing-plans` ist die Alternative, wenn kein Subagent zur Verfügung steht.
> Jeder Schritt trägt `- [ ]`-Syntax und ist ohne Rückfrage ausführbar.
> ⛔ **Lies zuerst `.superpowers/sdd/KONTEXT-radio-planteil2.md`** — Hausregeln, Werkzeugfallen,
> Betreiberentscheidungen und die Tor-Definition stehen dort und werden hier nicht wiederholt.

**Stand:** 2026-08-21. Branch `feat/radio-modul-planteil2`.

**Goal:** Am Ende dieses Planteils existiert das Suite-Modul `radio` als Eintrag in
`src/core/registry.ts`, sein Icon ist in `src/core/shell/icons.ts` eingetragen, seine äußeren Pfade
sind gegen `PASSTHROUGH` geprüft und als Test festgehalten, und **beide Riegel stehen**: der
Host-Riegel `_lib/host.ts` (drei Formen) plus `_lib/hostRiegel.ts` (vierte Form) und der
Zugriffsriegel `_lib/zugang.ts`. Darüber liegen das Modul-Layout (das bewusst nichts tut) und die
**zwei Verwaltungs-Hüllen** `admin/(arbeit)` und `admin/(druck)`. Der Quelltext-Scan aus Planteil 1,
der Fläche verbot, wird durch einen **schärferen** ersetzt: `riegel.test.ts` prüft ab jetzt je
Flächenart die richtige Riegelform. Damit ist ⬜ **L7** und ⬜ **L8** **entsperrt** — der Code, den
**C19**, **C29** und **C30** befragen, existiert; abgelesen werden die Werte dort, nicht hier.

**Architecture:** Sechs Aufgaben, **Z1** bis **Z6**, in zwei ungleichen Hälften. **Z1–Z4 sind
Einzelaufgaben** mit je eigenem Tor und eigenem Commit: Registry (Z1), Routenkarte (Z2), Host-Riegel
(Z3), Zugriffsriegel (Z4). Jede baut ein in sich abgeschlossenes Stück, jede beginnt mit ihrem Test
und dem gesehenen roten Zustand. **Z5 und Z6 bilden EINEN Block mit EINEM Tor und EINEM Commit** —
Z5 schreibt den schärferen Scan (`riegel.test.ts`), der auf einer leeren Fläche **rot** ist, Z6 baut
die drei Layouts und **löscht** im selben Commit den alten Scan aus Planteil 1. Dazwischen wäre der
Baum unbewacht; deshalb ein Commit.

**Tech Stack:** Next.js 16.3.0 (App Router, RSC) · React 19.2.8 · Ant Design ^6.5.3 · Vitest ^4.1.5
(installiert 4.1.10) · Node v26.7.0 · TypeScript über `tsc --noEmit --pretty false`
(`package.json:13`).

**Spec:** `docs/superpowers/specs/2026-08-17-radio-modul-design.md`, **Kapitel 1** (Zeilen 144–777).
⛔ **Kapitel A (51–78) und Kapitel B (79–122) stechen über jeden Kapiteltext, der ihnen
widerspricht.** Für diesen Planteil einschlägig: **B9** (`/admin/einstellungen` → `/admin/versionen`),
**B13** (vier Riegelformen, zwei Dateien, vier Handler), **B14** (der `_actions/`-Scan gehört
**nicht** in `riegel.test.ts`). §3.6 (2788–2933) sagt dieselben Signaturen noch einmal — wo es
abweicht, gilt Kapitel 1 (begründet unter Warnung 3).

**Leitplan:** `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md`. Die Nahtstellen NS-M1…NS-M8
sind alle Planteil-1-intern oder zeigen an Spec 2 — **keine** zielt auf Planteil 2. Was bindet, ist
die Gegenauflage der Abweichung (`:70-79`) und die Planteil-Zeile (`:88`).

---

## ⚠️ Sechs Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

1. **Der Host-Riegel steht VOR jeder Fläche — und dieser Planteil legt bewusst KEINE Fläche an, die
   ein Browser erreichen kann.** Spec-Stufe 1 begründet die Reihenfolge: „Ohne ihn ist jede spätere
   **Fläche** von jedem Suite-Host erreichbar (Falle 61)" (Leitplan:47). Planteil 2 baut drei
   `layout.tsx` und **null** `page.tsx`, **null** `route.ts`, **null** `_actions/*.ts`. Ein Layout
   ohne Seite darunter rendert nichts. Die erste Aufgabe eines Nachfolgers, die eine `page.tsx` oder
   `route.ts` anlegt (Planteil 3), findet den Riegel damit **vor**.

2. **Aufgabe M4 aus Planteil 1 hat einen Löschtermin, und der ist Z6.** Der zweite `describe`-Block
   in `src/app/m/radio/_db/append.test.ts` verbietet jede `page.tsx`, `layout.tsx`, `route.ts` und
   jedes `_actions/` unter `src/app/m/radio/`. Er ist **zum Löschen bestimmt, nicht zum
   Aufweichen** — der Test sagt es selbst (`append.test.ts:59-61`). ⛔ Wer ihn stattdessen
   abschwächt, damit er grün wird, baut genau die Fehlerklasse, gegen die dieser Weg antritt (NT11:
   ein Wächter, der `>= 5` statt `= 6` prüft, bleibt grün und bewacht nichts). Der genaue Wortlaut
   und die Zeilennummern stehen in Aufgabe **Z6, Schritt 3**.

3. **Der Typname weicht zwischen Kapitel 1 und §3.6.1 ab — Kapitel 1 gewinnt, und es ist gemessen.**
   Spec:648 schreibt `export type RadioViewer = { sub: string; name: string | null; groups: string[] }`
   (drei Felder). Spec:2794 schreibt `export type Viewer = { sub; groups; name; email }` (vier
   Felder; `Spec:2793` ist der Dateikommentar darüber). Die Spec löst den Widerspruch an keiner Stelle auf; kein A- oder B-Punkt behandelt ihn.
   **Entschieden zugunsten von Kapitel 1**, aus einem messbaren Grund und nicht aus Rangfolge:
   `lagerbuch`s vierfeldriger `Viewer` existiert, weil `merkeNutzer` `name` **und** `email` in
   `users` schreibt (`lagerbuch/_lib/zugang.ts:32-38`). Die `users`-Tabelle von `radio` hat **drei
   Spalten und keine E-Mail** (`src/app/m/radio/_db/schema.ts:113-117`: `sub`, `name`,
   `lastSeenAt`). Ein `email`-Feld hätte in diesem Modul heute **keinen Konsumenten**. Der Name ist
   `RadioViewer`, die Felder sind drei. ⚠️ Nachtrag `NT-Z3` hält das fest, falls Planteil 4 eine
   E-Mail braucht.

4. **`_lib/hostRiegel.ts` steht in diesem Planteil, obwohl die Spec es Kapitel 7 zuschreibt.**
   Spec:546-547 sagt wörtlich: „Dieses Kapitel legt `host.ts` an; `hostRiegel.ts` legt Kapitel 7 an
   und benutzt `istRadioHost` von hier." Der **Leitplan:88** und der Auftrag an diesen Planteil
   führen `_lib/hostRiegel.ts` dagegen **in der Erzeugt-Liste von Planteil 2**. Zwei von drei
   Dokumenten sagen „hier". ⛔ **Entschieden: hier.** Die Datei ist neun Zeilen, ihr einziger
   heutiger Konsument (`sw.js/route.ts`) kommt mit Planteil 5, und `riegel.test.ts` (Klausel c)
   braucht sie als **erlaubte Alternative**, sonst ist die Klausel gegen den `sw.js`-Handler von
   vornherein falsch gebaut (genau der Fehler, den B13 korrigiert hat). Ihre Testfälle liegen in
   `_lib/host.test.ts` und **nicht** in einer sechsten Testdatei — Spec 1.6 führt fünf, und B5s Regel
   „eine Datei, drei beschreibende Orte, keine Zeile doppelt" gilt hier genauso.

5. **Zwei der drei Scan-Klauseln in `riegel.test.ts` haben heute NICHTS zu scannen — und genau das
   ist die gefährlichste Stelle dieses Plans.** Am Ende von Planteil 2 gibt es **zwei**
   `admin/**/layout.tsx` und **null** `route.ts`. Eine Klausel über eine leere Menge ist
   **leer-grün** und bewacht nichts (dieselbe Fehlerklasse wie NT11). Deshalb: Klausel (a) trägt
   eine **Existenzpflicht mit der Untergrenze 2**, und Klausel (c) zählt ihre Handler **exakt**
   (`toBe(HANDLER_ANZAHL)`, nicht `toBeGreaterThanOrEqual`) — nur so wird sie rot, wenn ein
   Nachfolger einen Handler baut und die Zahl oben stehen lässt. Der Fahrplan im Testkopf ist
   namentlich: Planteil 3 hebt sie auf **2**, Planteil 4 auf **3**, Planteil 5 auf **4**. ⛔ **`>=`
   wäre hier genau die NT11-Form** („ein Wächter, der `>= 5` statt `= 6` prüft, bleibt grün"), und
   über einer heute leeren Liste ist `>= 0` für jede Menge wahr — es gäbe **keine** Mutation, die
   den Fall rot macht. Das Vorbild für beide Formen und für den Unterschied steht in
   `src/app/m/lagerbuch/_lib/bauform.test.ts:13-37`.

6. **Am Ende dieses Planteils ist die Wirksamkeit der zwei Hüllen UNBEWIESEN, und kein Test hier darf
   etwas anderes behaupten.** Beide Verwaltungs-Layouts sind **inert**: es gibt keine `page.tsx`
   unter ihnen, also rendert Next sie nicht. Ob `admin/(arbeit)/layout.tsx` seinen Riegel bei einem
   echten Abruf tatsächlich ausführt, ist eine Eigenschaft von Next 16.3.0, die dieser Planteil
   **nicht misst** — sie steht als ⬜ **Z-L1** und wird in Planteil 4 abgelesen. ⛔ Der einzige
   Nachweis, den Planteil 2 liefert, ist ein **Quelltext**-Scan („die Zeile steht da"), nicht ein
   Verhaltensnachweis („der Riegel greift"). Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec
   verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft** — ein Test hätte
   dort eine Zusage geprüft, welche die Bauform nicht halten kann.

---

## Global Constraints

* **Alle Kommandos mit `rtk` präfixt, auch in Ketten mit `&&`.** (`CLAUDE.md`, Golden Rule.)
* **Das Tor je Aufgabe ist NICHT „volle Suite grün"** — es ist: `rtk pnpm typecheck` **0 Fehler** ·
  `rtk pnpm lint` **0 Fehler** · **die eigenen Testdateien der Aufgabe grün** · **kein neuer
  Fehlschlag** in einer Datei, die der Diff nicht anfasst. Streitfälle entscheidet die
  **Beiseitelege-Gegenprobe**, nicht der Zählwert. Die vollständige Fassung steht in
  `.superpowers/sdd/KONTEXT-radio-planteil2.md:52-82` (am 2026-08-22 nachgemessen; der Plan
  nannte `:37-52`, dort steht der ratelimit-Nachtrag — Vorabscan-Fund F5).
* ⚠️ **Die Grundlinie ist seit 2026-08-21 VOLLSTÄNDIG GRÜN** — `441 passed (441)`, `7991 passed
  (7991)`, Exit 0 (`.superpowers/sdd/BASISLINIE-vitest.md`). Die „170 Fehlschläge" aus älteren Plänen
  sind überholt. **Folge: jeder Fehlschlag, den du siehst, ist ein NEUER Fehlschlag — du hast ihn
  verursacht, bis die Gegenprobe das Gegenteil zeigt.**
* ⛔ **`rtk` meldet falsches Grün für `tsc`, wenn Farbe durchkommt** (NT7). `NO_COLOR=1` ist in der
  Umgebung gesetzt, `package.json:13` trägt `--pretty false`. **Niemals** `grep -cE "error TS"` auf
  farbigem Output — die ANSI-Sequenz steht zwischen `error` und `TS` und `grep` zählt **0**. Außerhalb
  dieser Umgebung: **den Exit-Code prüfen**, nicht die Meldung.
* ⛔ **Kein Worktree unter `.claude/worktrees/`** (251 Fremdfehlschläge, `vitest.config.ts:8-34`).
* ⛔ **Kein `pnpm build` vor einem Testlauf, den man ernst nimmt** — `.next/standalone/src/` ist eine
  vollständige Kopie des Quellbaums **inklusive Testdateien** (52 Fehlschläge, `vitest.config.ts:21-34`).
  `rtk pnpm build` und Playwright laufen **einmal vor dem Merge**, nach den Tests, **nie davor**.
* ⛔ **Kein `pnpm dev` parallel zur Testsuite.**
* ⛔ **`--reporter=basic` gibt es in vitest 4 nicht** — es wirft einen `Startup Error`, der wie ein
  Suitefehler aussieht (`BASISLINIE-vitest.md`).
* **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In TypeScript-Bezeichnern und in
  Testnamen **keine** Umlaute. Und **niemals** ein Umlaut in einem zitierten Wert oder einem
  Grep-Anker. ⚠️ Der Registry-Titel `"Funkgeräte"` ist ein **Wert**, kein Bezeichner — er trägt sein
  `ä` (Spec:177), und `registry.test.ts` vergleicht ihn nicht per Regex.
* **Belegpflicht.** Jede Behauptung in einem Kommentar oder Plan nennt `datei:zeile`. Wo ein Wert erst
  der Bau oder der Server hergibt, steht eine **benannte Leerstelle**, **nie** eine plausibel
  aussehende Erfindung.
* **Kein `"use client"` unter `_lib/` und `_db/`** — Server Components **und** Route Handler lesen
  dort (Spec:455-456, Falle 6). `riegel.test.ts` hält das ab Z5 fest.
* ⛔ **Kein `isModuleAdmin`, kein `requireModuleAdmin`, kein `moduleAdminPageOrNotFound`, kein
  `canAdminModule`, kein `session.user.isAdmin` im Modul** — alle vier tragen den
  Suite-Admin-Kurzschluss (`src/core/groups.ts:125`: `if (groups.includes(suiteAdminGroup(env)))
  return true;`). Kapitel-4-Pflicht 17 (`docs/radio-portierung-analyse.md:979-997`) stellt `radio`
  ausdrücklich zu `feedback` und `lagerbuch`: `adminGroupsFor(mod)` **+** `.some()` selbst gebaut,
  **nie** `mod.adminGroups` direkt, **nie** `canAccess`.
* ⛔ **Die HTTP-Grenze bleibt stehen.** Entscheidung 15: sie fällt erst mit Planteil 4. Planteil 2
  berührt **keine** `/v1`-Route — weder die sechs in `radio-admin/server/src/routes/loanApi.ts:126-187`
  noch einen Ersatz in der Suite. Es entsteht **kein** Route Handler unter `src/app/m/radio/api/`
  (Spec:747-750). Beide Domains ziehen im selben Fenster um (Leitplan:104-106).
* **Migrationen sind append-only** — Planteil 2 fasst `_db/` nicht an, aber die Regel gilt weiter.
* **Kein `git add .` und kein `-A`.** Im Arbeitsbaum liegen unverfolgte Planungsdokumente und
  `.idea/`. Namentlich stagen, mit `rtk git show --stat HEAD` nachsehen.
* **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.
* **antd 6 ist das Design-System der Suite.** Planteil 2 rendert genau **eine** antd-Berührung: den
  `<Shell>` im `RadioVerwaltungsRahmen` (Z6). Kein `@ant-design/icons`-Import in einer Server
  Component (Falle 7, `src/core/shell/icons.ts:29`).

---

## Die Sperrtafel

**Keine Sperre.** Alle Vorbedingungen sind erfüllt und gemessen.

| Vorbedingung | Stand |
|---|---|
| Planteil 1 (M1–M6) gebaut | ✅ `src/app/m/radio/_db/{schema,client,drizzle.config}.ts`, zwei Migrationen, `_lib/boot.ts`, `_lib/seedLokal.ts` liegen |
| Das Registrierungs-Dreieck **vollständig** | ✅ **alle drei Ecken stehen seit Planteil 1** (Leitplan:87 führt es in dessen Erzeugt-Spalte): `src/app/m/radio/_db/migrations/` (gemessen: zwei `.sql` plus `meta/`), `src/core/bootstrap.ts:56` (`MODULE_MIGRATIONS`; `:57` ist das schließende `];`) und `Dockerfile:57` (`COPY`). ⚠️ Der **Registry-Eintrag ist KEINE Ecke** des Dreiecks (`CLAUDE.md`, „Ein neues Modul registrieren") — Z1 legt ihn an, schließt damit aber nichts, was offen war. `Spec:745-746` sagt es selbst: Kapitel 1 „benennt das Dreieck ausdrücklich, **baut es aber nicht**" |
| `SUITE_HOST_RADIO` ist als Zeile vorbereitet | ✅ `.env.example:112` (`# SUITE_HOST_RADIO=`, auskommentiert = „kein Prod-Host", korrekt vor dem Cutover) |
| Testgrundlinie | ✅ vollständig grün, `441/441` Dateien, `7991/7991` Tests, Exit 0 (`.superpowers/sdd/BASISLINIE-vitest.md`) |
| Der zu löschende M4-Scan liegt, wo der Plan ihn sucht | ✅ `src/app/m/radio/_db/append.test.ts:50-77`, gelesen am 2026-08-21 |
| `WifiOutlined` fehlt in der Icon-Map | ✅ **gemessen**: `src/core/shell/icons.ts:1-12` und `:136-147` führen zehn Namen, `WifiOutlined` ist **nicht** darunter — das ist der rote Zustand, den Z1 herstellt und behebt |

**Leerstellen, die dieser Planteil ENTSPERRT (nicht abliest):**

| ⬜ | Was | Wo abgelesen |
|---|---|---|
| **L7** | Der vollständige `Location`-Kopf der `/admin`-Weiterleitung: **Statuscode** (307 oder 302) sowie Protokoll und Host, die `verwaltungsZiel(headers)` in die `callbackUrl` schreibt | ⛔ **NICHT in diesem Planteil.** `docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md:2091` — „erwartet: 3xx + location: …/login?… (Seite) — Code und voller Wert: ⬜ L7". Cut **C19/C29/C30** |
| **L8** | Was `GET /m/radio` mit `Host: iuk-ue.de` liefert — 404 aus dem Host-Riegel oder eine gerenderte Fläche | ⛔ **NICHT in diesem Planteil.** `2026-08-18-plan4-radio-cutover.md:1910` — `curl -si -H 'Host: iuk-ue.de' "$B/m/radio" \| head -3 # ⬜ L8` |

⚠️ **„Entsperrt" heißt: der Code, den jene Aufrufe befragen, existiert danach.** Planteil 2 stellt
**keinen** Server bereit und misst **keinen** Kopf. Ein hier vorweggenommener Statuscode wäre eine
Erfindung; `redirect()` wählt ihn zur Laufzeit, und die Spec legt ihn ausdrücklich nicht fest
(`2026-08-18-plan3-radio-generalprobe.md:201`).

**Leerstellen, die dieser Planteil NEU benennt:**

| ⬜ | Was | Wer liest sie wann ab |
|---|---|---|
| **Z-L1** | Führt Next 16.3.0 das Layout einer Route-Group aus, unter der **keine** `page.tsx` liegt? Solange keine Seite existiert, ist der Riegel in `admin/(arbeit)/layout.tsx` **nicht verhaltensbelegt** | **Planteil 4**, erste Aufgabe — beim ersten echten Abruf gegen `/admin`, nachdem die erste Verwaltungsseite steht. **Nicht** durch einen Vitest-Fall in Planteil 2 |
| **Z-L2** | Der genaue Wortlaut des roten Zustands von `src/core/shell/AppUmschalter.test.tsx:227-231`, nachdem die Registry-Zeile steht und `WifiOutlined` noch fehlt | **Z1, Schritt 3** — wörtlich zitieren, dann beheben |

**Leerstellen des Betreibers, die diesen Planteil berühren, ihn aber nicht sperren:**

| ⬜ | Frage | Fällig |
|---|---|---|
| **E1** | Wie heißt die Gruppe für `SUITE_ADMIN_GROUP_RADIO`, zeichengleich wie im `groups`-Claim? Vorschlag `iuk-radio-admin` (Spec:766) | vor **Cut 26**, nicht vor der Generalprobe (`docs/superpowers/plans/SPERREN-radio-spec2.md:112`) |
| **E1b** | Wie heißt die Gruppe für `SUITE_UPDATER_GROUP_RADIO`? — **neu entstanden mit der Entscheidung zu C.6/B4 am 2026-08-21** | vor **Cut 26** (`docs/superpowers/plans/SPERREN-radio-spec2.md:110`). Planteil 2 baut die Stufe **nicht**, hält aber die Naht offen (Z4) und sieht sie in seiner Riegelform vor (Z5, Klausel a) |

⚠️ **Der Pfad gehört jedes Mal dazu, auch im Quelltext.** `SPERREN-radio-spec2.md` liegt unter
`docs/superpowers/plans/` und ist **git-verfolgt**; `.superpowers/sdd/` ist es **nicht**
(`.superpowers/sdd/.gitignore` = `*`). Eine `datei:zeile`-Angabe ohne Pfad liest sich wie ein
Verweis in die Kladde — und ein Verweis aus **ausgeliefertem** Quelltext in ein ignoriertes
Verzeichnis ist genau die vernarbte Lehre „Beleg nicht in der Kladde". Beide Zeilenangaben sind
nachgeprüft und **exakt** (`:110` = E1b, `:112` = E1).
| **1.8.2** | Sind Aufsteller, Wandkärtchen oder Lesezeichen mit einem **anderen** Pfad als `/` im Umlauf? | Wenn ja, wird daraus eine Redirect-Zeile im Runbook, **kein Code im Repo** (Spec:769-771) |

⚠️ **Falle 23, und sie ist still:** `SUITE_ADMIN_GROUP_RADIO` **leer** gesetzt ist eine gültige
Aussage („keine modul-eigenen Admins") und wird **nicht** gemeldet — die Leer-Prüfung greift nur für
`SUITE_ACCESS_GROUP_*` (`src/core/groups.ts:156`, ausdrücklich begründet in `:136-140`: „Bei den
Admin-Gruppen ist leer dagegen eine gültige Aussage und wird nicht gemeldet"). In Verbindung mit
Pflicht 17 (`.some()` auf leerer Liste gewährt nichts) sperrt das die Verwaltung für **alle** aus,
inklusive Betreiber (`docs/radio-portierung-analyse.md:1547-1576`).

⛔ **Die andere Hälfte ist LAUT, und der Plan hatte sie zuerst vertauscht:** ein Tippfehler im
**Variablennamen** (`SUITE_ADMIN_GROUP_RADI0`) ist ein **Startabbruch** — `validateGroupConfig`
meldet jeden Suffix, der zu keinem Modul-Key passt (`src/core/groups.ts:141-153`),
`assertHostConfig` nimmt die Meldung auf (`src/core/bootstrap.ts:94`) und wirft
(`:100-102`). Dieselbe Aussage steht in `Spec:197-200` und, vier Zeilen über der Einfügestelle von
Z1, in `.env.example:70` („Ein Tippfehler im Variablennamen bricht den Boot ab").

**Ein Test kann den stillen Zustand nicht verhindern** — er ist gültige Konfiguration. **Sichtbar**
macht ihn die Protokollzeile im Riegel: `meldeFehlendeGruppe` (Z4), von `Spec:206-210` ausdrücklich
verlangt und dort „die einzige Stelle, an der dieser Zustand überhaupt sichtbar wird" genannt. Z1
trägt zusätzlich die Warnung in `.env.example` nach — mit der **richtigen** Polarität.

---

## Was dieser Plan anlegt und ändert

**Neu:**

```
src/app/m/radio/registry.test.ts                  Z1  — die Feldwerte der Registry-Zeile, einzeln
src/app/m/radio/_lib/routen.test.ts               Z2  — die PASSTHROUGH-Pruefung als Test
src/app/m/radio/_lib/host.ts                      Z3  — istRadioHost, requireRadioHost, radioHostOderNull
src/app/m/radio/_lib/hostRiegel.ts                Z3  — hostAbweisung (die vierte Form, B13)
src/app/m/radio/_lib/host.test.ts                 Z3  — alle vier Formen, plus zwei Quelltext-Zusicherungen
src/app/m/radio/_lib/zugang.ts                    Z4  — RadioViewer, viewerAusSession, viewerOderNull,
                                                       istRadioAdmin, verwaltungsZiel, requireRadioAdmin
src/app/m/radio/_lib/zugang.test.ts               Z4  — die reinen Faelle, ohne auth()-Mock
src/app/m/radio/riegel.test.ts                    Z5  — der Scan ueber den Baum (a), (c), (d) + Pflicht 17
src/app/m/radio/_lib/nav.ts                       Z6  — RADIO_NAV, heute leer, Planteil 4 fuellt sie
src/app/m/radio/_ui/RadioVerwaltungsRahmen.tsx    Z6  — Shell-Weitergabe, 1:1 nach lagerbuch
src/app/m/radio/layout.tsx                        Z6  — das Modul-Layout, das NICHTS tut
src/app/m/radio/admin/(arbeit)/layout.tsx         Z6  — Huelle 1: zwei Riegel + Rahmen
src/app/m/radio/admin/(druck)/layout.tsx          Z6  — Huelle 2: dieselben zwei Riegel, kein Rahmen
```

**Geändert:**

```
src/core/registry.ts                              Z1  — die radio-Zeile, direkt nach `aufgaben`
src/core/shell/icons.ts                           Z1  — WifiOutlined in Import UND Map
.env.example                                      Z1  — SUITE_ADMIN_GROUP_RADIO mit der Falle-23-Warnung
src/core/registry.test.ts                         Z1  — :97 die Anonym-Liste: ["qr"] -> ["qr","radio"]
src/core/shell/launcherEintraege.test.ts          Z1  — :59 dieselbe Liste; :38-45 "radio" zwischen
                                                        "lagerbuch" und "gamma" einsetzen
src/app/m/radio/_db/append.test.ts                Z6  — der ZWEITE describe-Block (Z. 50-77) wird GELOESCHT
```

⚠️ **Diese zwei Listen sind ABSICHTLICH exakt (`toEqual`, nicht `toContain`) — sie halten fest,
WELCHE Module eine anonyme Person sieht.** `radio` gehört nach Betreiberentscheidung 5 dort hinein
(`requiresAuth: false` + `switcherGroupSources: []`, Spec:194-195): `canAccess` steigt bei
`!requiresAuth` sofort mit `true` aus (`registry.ts:260`), und `visibleSwitcherModules` lässt eine
leere `switcherGroupSources` unmittelbar durch (`registry.ts:273`). ⛔ **Die Zeilen werden
ERWEITERT, nie auf `toContain` aufgeweicht** — eine Aufweichung machte genau die Zusicherung
wertlos, die den anonymen Kachelbestand bewacht. Beide Fundstellen sind gemessen, nicht gerechnet.

⛔ **Nicht angefasst:**

* **Keine `page.tsx`, kein `route.ts`, kein `_actions/*.ts`** — Planteil 3 (Gate, Ausleihe) und
  Planteil 4 (die zehn `/admin`-Seiten, der Export-Handler) bauen sie.
* **`(ausleihe)/layout.tsx`** — es trägt das Zugangsprädikat der Ausleihe (`_lib/ausleihZugang.ts`),
  und das ist Planteil 3 (Leitplan:89). Siehe „Nahtstellen zu Planteil 3".
* **`src/core/ratelimit.ts`** (CWE-348) — eigene kleine Vorarbeit **vor Planteil 3**, eigener Commit
  (`KONTEXT-radio-planteil2.md:32-35`).
* **`src/core/groups.ts`** (Suite-Admin-Kurzschluss) — eigene kleine Vorarbeit **vor Planteil 4**.
  Planteil 2 **umgeht** ihn modulintern (Pflicht 17), entfernt ihn aber nicht.
* **`src/core/bootstrap.ts`, `Dockerfile`, `src/app/m/radio/_db/**`** — Planteil 1 hat sie gelegt.
  ⚠️ **Die zwei Bestands-Testdateien aus der Liste oben sind hiervon ausgenommen**: `registry.test.ts`
  und `launcherEintraege.test.ts` **müssen** in Z1 mitgeändert werden, weil sie exakte Kachellisten
  führen. Das ist keine Aufweichung von „`src/core` nicht anfassen", sondern deren Preis.
* **`radio-admin/**`, `radio-inventar/**`** — die Alt-Anwendungen laufen weiter, die `/v1`-Grenze
  bleibt stehen.

---

## Reihenfolge der Aufgaben

| # | Aufgabe | Erzeugt | Tor & Commit |
|---|---|---|---|
| **Z1** | Die Registry-Zeile, ihr Icon und `registry.test.ts` | `registry.test.ts`; ändert `registry.ts`, `icons.ts`, `.env.example`, `core/registry.test.ts`, `core/shell/launcherEintraege.test.ts` | eigenes Tor, eigener Commit |
| **Z2** | Die Routenkarte als Test — `_lib/routen.test.ts` | `_lib/routen.test.ts` | eigenes Tor, eigener Commit |
| **Z3** | Der Host-Riegel — vier Formen, zwei Dateien | `_lib/host.ts`, `_lib/hostRiegel.ts`, `_lib/host.test.ts` | eigenes Tor, eigener Commit |
| **Z4** | Der Zugriffsriegel — und die Naht für die zweite Rechtestufe | `_lib/zugang.ts`, `_lib/zugang.test.ts` | eigenes Tor, eigener Commit |
| **Z5** | ⚠️ **Beginn des Blocks Z5–Z6.** Der schärfere Scan | `riegel.test.ts` (**rot**, absichtlich) | ⛔ **kein Commit** |
| **Z6** | ⚠️ **Ende des Blocks Z5–Z6.** Die drei Layouts, der Rahmen, die Navigation — und die Löschung des M4-Falls | `layout.tsx`, zwei `admin/**/layout.tsx`, `_ui/RadioVerwaltungsRahmen.tsx`, `_lib/nav.ts`; löscht `append.test.ts:50-77` | **ein** Tor, **ein** Commit über Z5 **und** Z6 |

---

## Aufgabe Z1: Die Registry-Zeile, ihr Icon und der Test, der beide zusammenhält

**Files:**
- Create: `src/app/m/radio/registry.test.ts`
- Modify: `src/core/registry.ts`
- Modify: `src/core/shell/icons.ts`
- Modify: `.env.example`
- Modify: `src/core/registry.test.ts` — `:97` die Anonym-Liste: `["qr"]` → `["qr","radio"]`
- Modify: `src/core/shell/launcherEintraege.test.ts` — `:59` dieselbe Liste; `:38-45` `"radio"`
  zwischen `"lagerbuch"` und `"gamma"`

**Interfaces:**
- Consumes: nichts aus vorigen Aufgaben. **Das Registrierungs-Dreieck ist NICHT Gegenstand dieser
  Aufgabe** — es steht vollständig seit Planteil 1 (`_db/migrations/`, `src/core/bootstrap.ts:56`,
  `Dockerfile:57`; Leitplan:87), und `Spec:745-746` sagt ausdrücklich, dass Kapitel 1 es „benennt …,
  aber nicht baut". Der Registry-Eintrag ist eine **vierte, unabhängige** Registrierung, keine Ecke.
- Produces: `getModule("radio")` ist ab hier auflösbar; `moduleForHost("radio.localtest.me")` liefert
  das Modul. **Z2, Z3, Z4 und Z6 hängen alle daran.**

- [ ] **Schritt 1: Den Test schreiben — Feld für Feld, mit der Begründung im Testnamen**

Spec:711 verlangt genau das: „Je Feld eine Behauptung mit der Begründung im Testnamen, damit ein
späteres Umsetzen ein bewusster Akt ist."

```ts
// src/app/m/radio/registry.test.ts
import { describe, it, expect } from "vitest";
import { findModule, getModule, moduleForHost, prodHostsFor, requiredGroupsFor } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";
import { ICONS } from "@/core/shell/icons";

/**
 * DIE FELDWERTE DER REGISTRY-ZEILE, EINZELN (Spec 1 §1.1, Zeilen 158-180).
 *
 * Praezedenzfall im Repo: `src/app/m/aufgaben/registry.test.ts` — dort steht auch die
 * Begruendung, warum der Import von `ICONS` in einer TESTdatei erlaubt ist, obwohl die
 * Map client-only ist (`aufgaben/registry.test.ts:10-13`): `icons.test.ts` nimmt
 * `*.test.ts`/`*.test.tsx` aus seinem Quelltext-Scan aus („Tests laufen nie in RSC").
 * ⛔ Wer diese Zeile in eine NICHT-Testdatei kopiert, faerbt `src/core/shell/icons.test.ts`
 * rot — zu Recht. Der TIEFERE Grund, warum es dort ueberhaupt gutgeht, steht in
 * `CLAUDE.md`, Falle 7: Vitest laedt `react` ueber die `default`-Bedingung, es gibt keine
 * RSC-Ebene und damit keinen Falle-7-Wurf.
 *
 * `{}` STATT `process.env` UEBERALL, WO ES GEHT — dieselbe Entscheidung wie in
 * `src/core/auth/devGroups.test.ts:13-18`: der Test soll die REGISTRY pruefen, nicht die
 * `.env.local` der Maschine, auf der er gerade laeuft. Ein dort gesetztes
 * SUITE_HOST_RADIO machte den Test sonst auf einem Rechner rot und auf dem naechsten
 * gruen.
 */
const OHNE_ENV = {};

describe("radio: der Registry-Eintrag", () => {
  it("existiert unter dem Schluessel radio", () => {
    // Der Existenzfall steht vorn, damit die Ursache EINMAL namentlich in der Ausgabe
    // steht statt achtmal — `getModule` wirft `Unknown module: radio`
    // (`registry.ts:191-195`), es gibt also kein `null`, ueber das die folgenden Faelle
    // stolperten. Und weil dies die einzige Aussage ueber `findModule` (`:198-200`) ist.
    expect(findModule("radio")).not.toBeNull();
  });

  it("heisst Funkgeraete — der Titel steht in der Registry, nicht in der Release-Notiz", () => {
    // Spec:772-774: eine andere Betreiber-Wortwahl kostet EINE Zeile hier und keinen Code.
    // `CLAUDE.md`, Abschnitt „Release Notes", verbietet, den Modultitel in einer
    // Neuigkeitennotiz zu wiederholen — er steht hier und nur hier.
    expect(getModule("radio").title).toBe("Funkgeräte");
  });

  it("traegt requiresAuth: false — sonst schickt decideRoute JEDEN anonymen Aufruf in den Login", () => {
    /*
     * Spec:163-167. `/t/<code>` ist der Weg, den ein GESCANNTER QR-Code nimmt, und das
     * Gate auf `/` ist der Einstieg der anonymen Ausleihe. Mit `requiresAuth: true`
     * schickte `decideRoute` (routing.ts:71-73) jeden anonymen Aufruf in den Login — und
     * zwar sofort beim Umschwenk des Routers, OHNE Parallelfenster.
     */
    expect(getModule("radio").requiresAuth).toBe(false);
  });

  it("hat requiredGroups leer — unter requiresAuth: false waere jeder andere Wert eine Luege", () => {
    /*
     * Spec:191. Der Wert ist unter `requiresAuth: false` fuer das Gating WIRKUNGSLOS:
     * `canAccess` steigt vorher mit `true` aus (registry.ts:260). Eine gefuellte Liste
     * behauptete eine Wirkung, die es nicht gibt.
     *
     * Gelesen ueber `requiredGroupsFor`, NICHT ueber `mod.requiredGroups`: nur so faellt
     * ein gesetztes SUITE_ACCESS_GROUP_RADIO auf (registry.ts:242-244).
     */
    expect(requiredGroupsFor(getModule("radio"), OHNE_ENV)).toEqual([]);
  });

  it("hat prodHosts leer — die Domain steht AUSSCHLIESSLICH in SUITE_HOST_RADIO", () => {
    /*
     * Spec:159-161, dieselbe Betreiberauflage wie bei `lagerbuch` (registry.ts:106-108).
     * ⚠️ Der einzige Kollisionsfall im Repo ist `portal`, das `iuk-ue.de` DIREKT im Code
     * fuehrt (registry.ts:59) — und `validateHostConfig` sieht genau diese Kollision
     * NICHT, weil es seine Karte ausschliesslich aus `envHostsFor` fuellt
     * (lagerbuch/_lib/host.ts:98-104). Deshalb steht hier eine Behauptung ueber `radio`
     * und darunter eine ueber `portal`.
     */
    expect(prodHostsFor(getModule("radio"), OHNE_ENV)).toEqual([]);
  });

  it("beansprucht iuk-ue.de nicht — das fuehrt portal per prodHosts, und der Boot merkt es nicht", () => {
    expect(moduleForHost("iuk-ue.de", OHNE_ENV)?.key).toBe("portal");
  });

  it("ist ohne jede Env unter radio.localtest.me erreichbar", () => {
    // `moduleForHost` trifft `<key>.localtest.me` VOR und UNABHAENGIG von prodHostsFor
    // (registry.ts:246-253). Genau das macht in Z3 den „kein Prod-Host konfiguriert →
    // durchlassen"-Zweig ueberfluessig.
    expect(moduleForHost("radio.localtest.me", OHNE_ENV)?.key).toBe("radio");
  });

  it("traegt shell: full — der Wert gilt fuer die Verwaltung, nicht fuer den Ausleih-Zweig", () => {
    /*
     * Falle 23 (docs/radio-portierung-analyse.md:1547-1576): „Das Feld, das der Entwurf
     * zuerst vergass, ist `shell`" — `radio` braucht auf DEMSELBEN Host zwei Regime, und
     * ein einzelnes Registry-Feld kann das nicht ausdruecken. `registry.shell` packt
     * NICHTS ein; das Modul-Layout entscheidet (Pflicht 23). Deshalb rendert nur der
     * `RadioVerwaltungsRahmen` (Z6) eine Shell mit diesem Wert.
     *
     * Nebenwirkung, die hier festgehalten gehoert: `shell: "full"` erlaubt der
     * Verwaltungsnavigation `abschnitt:` (Spec:732-733) — `core/shell/navAbschnitte.test.ts:56-70`
     * verbietet es nur fuer `minimal`- und `kiosk`-Module.
     */
    expect(getModule("radio").shell).toBe("full");
  });

  it("zeigt die Kachel im Umschalter fuer JEDEN — switcherGroupSources ist leer, nicht [admin]", () => {
    /*
     * Spec:173-176, Betreiberentscheidung 5: die Kachel IST der zweite Zugangsweg zur
     * Ausleihe, auch fuer Personen ohne Verwaltungsgruppe. Ein `["admin"]` wie bei
     * `lagerbuch` verbaute genau diesen Weg (visibleSwitcherModules, registry.ts:271-279).
     *
     * Und: `showInSwitcher: true` entscheidet mit, WER die Release-Notizen zum Modul sieht
     * (portal/_lib/neuigkeiten/auswahl.ts:48).
     */
    expect(getModule("radio").showInSwitcher).toBe(true);
    expect(getModule("radio").switcherGroupSources).toEqual([]);
  });

  it("hat sein Icon in der ICONS-Map — sonst traegt es STILL das Portal-Icon", () => {
    /*
     * DIE FALLE, DIE SCHON EINMAL ZUGESCHLAGEN HAT (icons.ts:21-27,
     * AppUmschalter.test.tsx:203-215): beim Registry-Eintrag von `files` (2026-07-30)
     * stand `FolderOutlined` nicht in der Map — der Eintrag trug daraufhin still das
     * Portal-Icon. Kein Fehler, kein Log, nur ein falsches Bild in JEDER Kopfzeile und in
     * JEDEM Portal-Raster.
     *
     * `icon` muss ein Schluessel DIESER Map sein, nicht bloss ein existierender
     * @ant-design/icons-Name.
     */
    expect(Object.keys(ICONS)).toContain(getModule("radio").icon);
  });
});

describe("radio: der Verwaltungszugang wird ueber die Gruppe aufgeloest, nie ueber das Feld", () => {
  const alterWert = process.env.SUITE_ADMIN_GROUP_RADIO;
  const zuruecksetzen = () => {
    if (alterWert === undefined) delete process.env.SUITE_ADMIN_GROUP_RADIO;
    else process.env.SUITE_ADMIN_GROUP_RADIO = alterWert;
  };

  it("schlaegt ohne Env auf den Registry-Vorschlag zurueck", () => {
    // ⬜ E1: ob die Gruppe in Pocket ID wirklich so heisst, weiss nur der Betreiber
    // (Spec:766-768). Der Registry-Wert ist ein VORSCHLAG, kein bestaetigter Name.
    expect(adminGroupsFor(getModule("radio"), OHNE_ENV)).toEqual(["iuk-radio-admin"]);
  });

  it("laesst SUITE_ADMIN_GROUP_RADIO gewinnen", () => {
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "eine-andere-gruppe";
      expect(adminGroupsFor(getModule("radio"))).toEqual(["eine-andere-gruppe"]);
    } finally {
      zuruecksetzen();
    }
  });

  it("nimmt einen LEEREN Wert als gueltige Aussage an — und genau das ist Falle 23", () => {
    /*
     * ⚠️ HIER STEHT KEINE SICHERHEITSZUSAGE, SONDERN IHRE ABWESENHEIT.
     * `SUITE_ADMIN_GROUP_RADIO=` (leer) ist eine GUELTIGE Aussage („keine modul-eigenen
     * Admins") und wird NICHT gemeldet — kein Boot-Abbruch, keine Logzeile
     * (docs/radio-portierung-analyse.md:1547-1576). In Verbindung mit Pflicht 17
     * (`.some()` auf leerer Liste gewaehrt nichts, Z4) sperrt das die Verwaltung fuer
     * ALLE aus, den Betreiber eingeschlossen.
     *
     * Dieser Fall kann den Zustand deshalb nicht VERHINDERN. Er haelt fest, dass er
     * eintritt — damit die naechste Person, die ihn erlebt, ihn hier wiederfindet statt
     * ihn zu suchen. Die Abhilfe ist eine Runbook-Zeile (Spec:751-757, Punkt 2), kein Code.
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "";
      expect(adminGroupsFor(getModule("radio"))).toEqual([]);
    } finally {
      zuruecksetzen();
    }
  });
});
```

- [ ] **Schritt 2: Den Fehlschlag sehen — bevor die Registry-Zeile steht**

```
rtk pnpm vitest run src/app/m/radio/registry.test.ts
```

Erwartet: **alle Fälle rot**, der erste mit einer Meldung, die auf `findModule("radio") === null`
hinausläuft. Zitiere die erste Zeile der Ausgabe im Bericht.

- [ ] **Schritt 3: Die Registry-Zeile setzen — und den ZWEITEN roten Zustand messen**

Füge in `src/core/registry.ts` **direkt nach dem `aufgaben`-Eintrag** (heute `registry.ts:170-173`)
und **vor** `alpha` (`:174`) ein — wörtlich aus Spec:158-179, Zeichen für Zeichen:

```ts
  // radio: EIN Prod-Host (radio.iuk-ue.de), und er steht AUSSCHLIESSLICH in
  // SUITE_HOST_RADIO — dieselbe Auflage wie bei lagerbuch (registry.ts:106-108).
  // prodHosts bleibt deshalb leer, wie bei qr, feedback, files und lagerbuch.
  //
  // requiresAuth MUSS false bleiben: /t/<code> ist der Weg, den ein gescannter
  // QR-Code nimmt, und das Gate auf / ist der Einstieg der anonymen Ausleihe.
  // Mit requiresAuth: true schickte decideRoute (routing.ts:71-73) JEDEN anonymen
  // Aufruf in den Login — und zwar sofort beim Umschwenk des Routers, ohne
  // Parallelfenster.
  // Dadurch liest canAccess() requiredGroups hier NIE (frueher Ausstieg,
  // registry.ts:260), und /m/radio/admin/... erbt KEIN Middleware-Gating.
  // Durchgesetzt wird der Verwaltungszugang modulintern in _lib/zugang.ts, der
  // Host in _lib/host.ts.
  //
  // switcherGroupSources: [] und NICHT ["admin"] wie lagerbuch — die Kachel im
  // App-Umschalter IST der zweite Zugangsweg zur Ausleihe (Betreiberentscheidung
  // 5), auch fuer Personen ohne Verwaltungsgruppe. Ein ["admin"] hier verbaute
  // genau diesen Weg (visibleSwitcherModules, registry.ts:271-279).
  { key: "radio", title: "Funkgeräte", icon: "WifiOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-radio-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
```

⚠️ **Die Position ist für die Auflösung ohne Bedeutung, solange `prodHosts` leer ist** (Spec:155-156).
Sie steht trotzdem dort, weil die echten Module zusammenbleiben und die Wegwerf-Module
`alpha`/`gamma`/`beta`/`kioskdemo` (`:174-186`) hinten.

Dann **beide** betroffenen Testdateien fahren:

```
rtk pnpm vitest run src/app/m/radio/registry.test.ts src/core/shell/AppUmschalter.test.tsx
```

Erwartet: `registry.test.ts` grün **bis auf** den Icon-Fall, und `AppUmschalter.test.tsx` **rot** in
`Modul-Icons > jedes Modul der Registry hat einen Eintrag in ICONS`
(`AppUmschalter.test.tsx:227-231`), mit `Modul radio` als Zusatzmeldung.

⬜ **Z-L2 ablesen und im Bericht protokollieren:** den **wörtlichen** roten Zustand beider Dateien.
Das ist die gemessene Kopplung Registry ↔ Icon-Map und der Beleg, dass der Wächter aus
`AppUmschalter.test.tsx` tatsächlich greift — nicht die Behauptung, er täte es.

⛔ **Nicht** `AppUmschalter.test.tsx` anfassen. Spec:716 sagt es ausdrücklich: „keine Änderung nötig,
nur zu kennen."

- [ ] **Schritt 4: `WifiOutlined` in die Icon-Map eintragen — an BEIDEN Stellen**

Die Map ist zweiteilig: ein Import oben (`src/core/shell/icons.ts:1-12`, alphabetisch) und der
Map-Körper unten (`:136-147`). Ein Eintrag ohne den anderen ist ein Typfehler bzw. ein stiller
Rückfall.

```ts
// src/core/shell/icons.ts:1-12 — der Import, alphabetisch einsortiert
import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  CommentOutlined,
  ContainerOutlined,
  DesktopOutlined,
  FolderOutlined,
  GlobalOutlined,
  QrcodeOutlined,
  ScheduleOutlined,
  WifiOutlined,
} from "@ant-design/icons";
```

```ts
// src/core/shell/icons.ts:136-147 — die Map, in der Reihenfolge der Registry
export const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
  CommentOutlined,
  FolderOutlined,
  ContainerOutlined,
  ScheduleOutlined,
  WifiOutlined,
};
```

⚠️ `AppUmschalter.test.tsx:233-243` prüft auch die **Gegenrichtung**: „die Map trägt keine Namen, die
kein Modul verlangt." Ein `WifiOutlined` ohne die Registry-Zeile wäre also ebenfalls rot. Beide
Änderungen gehören in **denselben** Commit.

- [ ] **Schritt 5: `.env.example` — die Zeile, die Falle 23 benennt**

`.env.example:112` trägt bereits `# SUITE_HOST_RADIO=` (auskommentiert; das ist vor dem Cutover der
richtige Zustand — die Variable ist **nicht gesetzt**, damit der Registry-Default gilt,
`core/hosts.ts:35-38`). Was fehlt, ist die Admin-Gruppe. Trage sie im Block der
`SUITE_ADMIN_GROUP_*`-Zeilen nach (heute `.env.example:71-72`):

```
# radio: der Verwaltungszugang zu /admin. Vorschlag `iuk-radio-admin`; der
# tatsaechliche Name in Pocket ID ist ⬜ E1 und nur dem Betreiber bekannt.
#
# ⚠️ ZWEI VERSCHIEDENE FEHLER, UND NUR EINER IST LAUT:
#   SUITE_ADMIN_GROUP_RADI0=…  (Tippfehler im NAMEN) → LAUTER Startabbruch.
#     validateGroupConfig meldet jeden Suffix, der zu keinem Modul-Key passt
#     (core/groups.ts:141-153), und assertHostConfig wirft darauf
#     (core/bootstrap.ts:94 ueber :100-102). Der Container startet nicht.
#     Vgl. die Zeile 70 weiter oben, die dasselbe schon sagt.
#   SUITE_ADMIN_GROUP_RADIO=   (LEER gesetzt) → eine GUELTIGE Aussage
#     („keine modul-eigenen Admins"), die NICHT gemeldet wird: die Leer-Pruefung
#     greift nur fuer ACCESS-Variablen (core/groups.ts:156, begruendet :136-140).
#     Zusammen mit dem modulinternen `.some()` (_lib/zugang.ts) sperrt sie die
#     Verwaltung fuer JEDEN, den Betreiber eingeschlossen. Falle 23 der
#     Portierungsanalyse (docs/radio-portierung-analyse.md:1547-1576).
#     Sichtbar wird dieser Zustand nur ueber `meldeFehlendeGruppe` im Riegel
#     (_lib/zugang.ts, Spec:206-210).
# Rollback ist deshalb das ZURUECKSETZEN auf den Vorschlag, nicht das Leeren.
# SUITE_ADMIN_GROUP_RADIO=iuk-radio-admin
```

⛔ **Die Polarität ist die tragende Zeile dieses Schrittes, und sie stand im ersten Entwurf dieses
Plans verkehrt herum.** Wer sie beim Abschreiben wieder dreht, schreibt eine nachweislich falsche
Aussage in eine **ausgelieferte** Datei, vier Zeilen unter die richtige — genau in die Datei, die der
Betreiber am Cutover-Abend liest. Vier Quellen sagen dasselbe: `core/groups.ts:141-153`,
`core/bootstrap.ts:94`/`:100-102`, `Spec:197-200` und `.env.example:70`.

⛔ **Auskommentiert lassen.** Ein gesetzter Wert in `.env.example` ist eine Vorgabe für jede frische
Instanz, und der Name ist ⬜ E1 — unbestätigt.

⚠️ **`SUITE_UPDATER_GROUP_RADIO` kommt hier NICHT hinein.** Die zweite Rechtestufe baut **Planteil
4**; ihr Gruppenname ist ⬜ E1b. Eine Zeile für eine Variable, die kein Code liest, ist eine Zusage
ohne Träger.

- [ ] **Schritt 6: Die zwei exakten Kachellisten nachziehen — und grün sehen**

⛔ **Zuerst die zwei Bestandstests ändern, sonst ist Schritt 7 ein Commit auf einen roten Baum.**
Beide führen die Kachelliste als **exakte** Liste, und `radio` gehört hinein:

```
src/core/registry.test.ts:97               expect(anon).toEqual(["qr"]);
                                        -> expect(anon).toEqual(["qr", "radio"]);

src/core/shell/launcherEintraege.test.ts:59   expect(modulEintraege(null).map((e) => e.key)).toEqual(["qr"]);
                                           -> ... .toEqual(["qr", "radio"]);

src/core/shell/launcherEintraege.test.ts:38-45   "radio" zwischen "lagerbuch" und "gamma" einsetzen
                                                 (die Reihenfolge ist die der MODULES-Liste)
```

⚠️ **Erweitern, NIE auf `toContain` aufweichen** — die Exaktheit ist die Zusicherung. Der
Ursachenweg steht im Bestand und ist gemessen: `canAccess(radio, null)` ist `true`, weil
`registry.ts:260` bei `!requiresAuth` sofort aussteigt, und `visibleSwitcherModules` lässt eine leere
`switcherGroupSources` bei `registry.ts:273` durch. `modulEintraege` reicht das unverändert weiter
und filtert nur auf `moduleUrl(mod.key)` (`launcherEintraege.ts:26-28`), das außerhalb von
`NODE_ENV=production` **immer** `http://<key>.localtest.me:3000` liefert (`moduleUrl.ts:19-26`).
⚠️ Der Prod-Fall (`launcherEintraege.test.ts:50-55`) bleibt **unverändert grün**: dort greift
`prodHosts: []` ohne `SUITE_HOST_RADIO`, `moduleUrl` liefert `null`, `radio` fällt heraus.

```
rtk pnpm vitest run src/app/m/radio/registry.test.ts src/core/registry.test.ts \
  src/core/shell/AppUmschalter.test.tsx src/core/shell/launcherEintraege.test.ts \
  src/core/shell/SuiteHeader.test.tsx src/core/auth/devGroups.test.ts \
  src/core/shell/navAbschnitte.test.ts
```

Erwartet: **alle grün**.

⛔ **Warum diese sechs Nachbarn — und warum ein `grep` auf `MODULES` sie NICHT findet.** Fünf
Testdateien im Repo importieren `MODULES` (gemessen:
`grep -rln "MODULES" src --include="*.test.ts" --include="*.test.tsx"`). **Die zwei gefährlichen
sind nicht darunter.** Weder `src/core/registry.test.ts` (es importiert `getModule`,
`moduleForHost`, `canAccess`, `visibleSwitcherModules`, `requiredGroupsFor`, `:2-4`) noch
`src/core/shell/launcherEintraege.test.ts` (es erreicht die Registry nur über `modulEintraege`)
nennt `MODULES` je. **Das Merkmal ist nicht „importiert `MODULES`", sondern „befragt die
ABLEITUNGEN der Registry".** Wer diese Liste später erweitert, sucht nach
`visibleSwitcherModules`, `moduleUrl`, `adminGroupsFor` und `requiredGroupsFor`.

| Datei | was sie bemerkt | Stand nach Z1 |
|---|---|---|
| `src/core/registry.test.ts:97` | die **exakte** Anonym-Kachelliste | ⛔ **rot bis geändert** |
| `src/core/shell/launcherEintraege.test.ts:38-45`, `:59` | dieselben Listen über `modulEintraege` | ⛔ **rot bis geändert** |
| `AppUmschalter.test.tsx:227-243` | Icon-Map, beide Richtungen | rot bis Schritt 4, dann grün |
| `SuiteHeader.test.tsx:52-54`, `:79`, `:89` | leitet `MIT_CHROME` aus `MODULES` ab; `radio` trägt `shell: "full"` | grün ohne Zutun — aber **zwei Fälle mehr**, und eine unerklärte Mehrmenge ist der Anfang jeder Fehlersuche in die falsche Richtung |
| `devGroups.test.ts:21-28` | jede Registry-Gruppe im Dev-Login | grün ohne Zutun (`devGroups.ts:39-46` leitet ab) |
| `navAbschnitte.test.ts:56-70` | nur `minimal`/`kiosk` | nicht einschlägig |

⚠️ **`src/app/m/portal/_lib/neuigkeiten/register.test.ts` importiert `MODULES` ebenfalls** (`:5`,
`:77`), prüft aber nur, dass der `modul`-Schlüssel einer Notiz existiert. Planteil 2 schreibt keine
Notiz — nicht einschlägig, und deshalb nicht im Kommando.

- [ ] **Schritt 7: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

⚠️ **Exit-Code prüfen, nicht die Meldung** (NT7).

```bash
rtk git add src/app/m/radio/registry.test.ts src/core/registry.ts src/core/shell/icons.ts \
  .env.example src/core/registry.test.ts src/core/shell/launcherEintraege.test.ts
rtk git commit -m "feat(radio): Registry-Zeile, Icon und die Feldwert-Zusicherungen"
rtk git show --stat HEAD
```

---

## Aufgabe Z2: Die Routenkarte als Test — `_lib/routen.test.ts`

**Files:**
- Create: `src/app/m/radio/_lib/routen.test.ts`

**Interfaces:**
- Consumes: die Registry-Zeile aus **Z1** (ohne sie fällt `moduleForHost` auf `portal` zurück und
  jeder Rewrite zeigte `/m/portal…`).
- Produces: keinen Code — einen Riegel. Ab hier fällt jede Pfad-Umbenennung auf, die in die
  `PASSTHROUGH`-Liste läuft.

⚠️ **Diese Aufgabe legt KEINE der geprüften Dateien an.** Sie prüft, was `core/routing.ts` mit den
äußeren Pfaden **tun würde** — die Dateien dahinter entstehen in Planteil 3, 4 und 5. Das ist Absicht:
Spec:367-374 begründet, warum die Prüfung **vor** dem Bau steht. Bei `lagerbuch` hat genau sie die
gedruckten Etiketten gerettet; für `radio` gilt es für **`/t/<code>`** — der Pfad, den ein
ausgedruckter QR-Code trägt, und der **nach dem ersten Druck nicht mehr umbenennbar** ist.

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/routen.test.ts
import { describe, it, expect } from "vitest";
import { decideRoute } from "@/core/routing";

/**
 * DIE `PASSTHROUGH`-PRUEFUNG ALS TEST, NICHT ALS ABSATZ (Spec 1 §1.2.3, Zeilen 345-365,
 * Testauftrag Spec:715). Ohne Vorbild im Repo — neu.
 *
 * WAS SIE FAENGT: eine spaetere Pfad-Umbenennung, die in die Passthrough-Liste faellt.
 * `core/routing.ts:12` fuehrt PASSTHROUGH = ["/api/auth", "/api/health", "/login",
 * "/_next", "/favicon.ico", "/.well-known"], geprueft als `pathname === p ||
 * pathname.startsWith(p + "/")` (`:50-52`). Ein Treffer ergibt `next` — der Pfad erreicht
 * das Modul NIE, auf keinem Host, und zwar OHNE Fehlermeldung.
 *
 * ⚠️ SIE PRUEFT DIE MIDDLEWARE-ENTSCHEIDUNG, NICHT DIE EXISTENZ EINER DATEI. Die meisten
 * Pfade unten haben heute keine Datei; sie entstehen in Planteil 3 (Gate, Ausleihe),
 * Planteil 4 (die zehn Verwaltungspfade, der Export-Handler) und Planteil 5 (`/sw.js`).
 * Ein Rewrite auf einen Pfad ohne Datei ist eine saubere 404 — das ist der erwartete
 * Zustand und kein Mangel.
 *
 * ⚠️ DIE RUECKGABE HAT DREI FELDER, NICHT ZWEI. `core/routing.ts:79` liefert
 * `{ action, target, moduleKey }`. Spec:715 beschreibt die Zusicherung verkuerzt als
 * `{ action: "rewrite", target: "/m/radio…" }` — ein `toEqual` auf DIESE Form waere rot.
 * Hier steht deshalb das vollstaendige Dreifeld-Literal: es ist die staerkere Aussage
 * (ein falscher `moduleKey` faellt mit auf) und die einzige, die gruen werden kann.
 */
const HOST = "radio.localtest.me";
const fahre = (pathname: string) => decideRoute({ host: HOST, pathname, groups: null });

/** `rest` ist bei `/` der LEERE String (routing.ts:78) — das Ziel ist `/m/radio`, nicht `/m/radio/`. */
const ziel = (pfad: string) => `/m/radio${pfad === "/" ? "" : pfad}`;

/** Der Ausleih-Zweig, Spec 1.2.1 (Zeilen 275-284). */
const AUSLEIHE = ["/", "/t/ABC123", "/abmelden", "/geraete", "/ausleihen", "/rueckgabe"];

/**
 * Der Verwaltungszweig: die ZEHN Seiten aus Spec 1.2.2 (Zeilen 301-314) plus den EINEN
 * Route Handler. ⚠️ Der Handler steht NICHT in 301-314 — er steht in Spec:563 (§1.4.3)
 * und wird erst durch B9 (Spec:98) mitgezaehlt: „Gezaehlt wird jetzt einheitlich: zehn
 * Seiten-Pfade plus ein Route Handler."
 */
const VERWALTUNG = [
  "/admin",
  "/admin/geraete",
  "/admin/geraete/g-1",
  "/admin/geraete/g-1/ereignisse",
  "/admin/ausleihen",
  "/admin/import",
  "/admin/software",
  "/admin/versionen",
  "/admin/zugaenge",
  "/admin/zugaenge/blatt",
  "/admin/geraete/export",
];

describe("radio: jeder aeussere Pfad wird ins Modul umgeschrieben", () => {
  /*
   * ⛔ DIE ZWEI VOLLZAEHLIGKEITS-FAELLE STEHEN AUSSERHALB DER `it.each`-KOERPER, UND
   * DAS IST DER GANZE PUNKT. `it.each` bewacht nur, was in der Liste steht: wer einen
   * Eintrag loescht, verliert seinen Prueffall LAUTLOS — die Datei bleibt gruen, nur
   * die Fallzahl sinkt, und die liest niemand. Gemessen am 2026-08-22 an dieser Datei:
   * `"/t/ABC123"` aus AUSLEIHE entfernt -> `Tests 24 passed (24)`, gruen (und das ist
   * der Pfad, den ein GEDRUCKTER QR-Code traegt); `const VERWALTUNG: string[] = []`
   * -> `Tests 14 passed (14)`, gruen und ohne jede Warnung, weil `it.each([])` in
   * vitest 4.1.10 still NULL Faelle erzeugt.
   *
   * ⛔ Eine Zusicherung IM `it.each`-Koerper faenge den zweiten Fall nie: ueber der
   * leeren Liste liefe sie kein einziges Mal. Wer diese zwei Faelle spaeter „hinein
   * vereinfacht", stellt genau die Luecke wieder her.
   *
   * ⛔ Und sie stehen als ZWEI Faelle, nicht als zwei Zeilen in einem: ein geworfenes
   * `expect` beendet seinen Fall, die zweite Zeile liefe nie — eine Sonde auf AUSLEIHE
   * liesse die VERWALTUNG-Zusicherung unbewiesen (die „0 rot"-Form).
   */
  it("die Ausleihliste ist vollzaehlig — sechs aeussere Pfade", () => {
    /*
     * Sechs, Spec:275-284 (Tabelle 1.2.1): `/`, `/t/<code>`, `/abmelden`, `/geraete`,
     * `/ausleihen`, `/rueckgabe`. Die zwei uebrigen Tabellenzeilen (`layout.tsx` und
     * `(ausleihe)/layout.tsx`) tragen keinen aeusseren Pfad.
     *
     * ⛔ `toBe` und NICHT `toBeGreaterThanOrEqual`. Das Vorbild
     * `src/app/m/lagerbuch/_lib/bauform.test.ts:1188` benutzt `>=`, weil seine Menge aus
     * `readdirSync` entsteht und mit dem Baum WAECHST — die Untergrenze schuetzt dort nur
     * gegen die leere Menge. Diese Liste ist dagegen vollstaendig und stabil; `>=` waere
     * hier genau die NT11-Form („ein Waechter, der `>= 5` statt `= 6` prueft, bleibt
     * gruen und bewacht nichts").
     */
    expect(AUSLEIHE.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(6);
  });

  it("die Verwaltungsliste ist vollzaehlig — zehn Seiten plus EIN Route Handler", () => {
    /*
     * Elf, gezaehlt nach B9 (Spec:98, woertlich: „Gezaehlt wird jetzt einheitlich: zehn
     * Seiten-Pfade plus ein Route Handler"). Die zehn Seiten stehen in Tabelle 1.2.2
     * (Spec:303-314; `:303` und `:313` sind die zwei Layouts ohne aeusseren Pfad), der
     * Route Handler in Spec:563.
     *
     * ⛔ Die Zahl ist NICHT aus Spec:353 genommen. Dort steht „`/admin` und alle acht
     * Unterpfade — frei.", und das ist einer zu wenig: Tabelle 1.2.2 fuehrt `/admin`
     * plus NEUN Unterpfade (ausgezaehlt am 2026-08-22). Kapitel B sticht ueber jeden
     * Kapiteltext, der ihm widerspricht — und hier ist der Kapiteltext nachweislich
     * verzaehlt.
     */
    expect(VERWALTUNG.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(11);
  });

  it.each(AUSLEIHE)("Ausleihe: %s", (pfad) => {
    expect(fahre(pfad)).toEqual({ action: "rewrite", target: ziel(pfad), moduleKey: "radio" });
  });

  it.each(VERWALTUNG)("Verwaltung: %s", (pfad) => {
    /*
     * ⚠️ `/admin/versionen` UND NICHT `/admin/einstellungen` — entschieden in B9
     * (Spec:98, Kapiteltext Spec:326-331): die Alt-Seite ist eine Tab-Leiste mit genau
     * zwei Reitern, der zweite („API-Zugriff") faellt mit Entscheidung 13, und ein
     * Reiterpaar mit einer Haelfte ist keine Reiterleiste.
     *
     * ⚠️ `/admin/kein-zugriff` steht NICHT in der Liste, und /403 auch nicht. Der
     * Verwaltungsriegel antwortet mit `notFound()`, nicht mit 403 (Spec:691-694, §1.5) —
     * was nicht freigegeben ist, sieht in dieser Suite aus wie etwas, das es nicht gibt.
     */
    expect(fahre(pfad)).toEqual({ action: "rewrite", target: ziel(pfad), moduleKey: "radio" });
  });

  it("/sw.js — Root-Scope trotz Modulpfad", () => {
    /*
     * Spec:715 verlangt `/sw.js` AUSDRUECKLICH in dieser Liste (Kapitel 7 §7.1.4). Der
     * Alt-Kiosk registriert seinen Service Worker mit `scope: '/'`
     * (radio-inventar/apps/frontend/src/hooks/usePWA.ts:73); der Abraeum-Worker der
     * Suite muss denselben Pfad bedienen, sonst erreicht er die bereits installierten
     * Kopien nicht. Der Handler entsteht in Planteil 5; die WEGENTSCHEIDUNG faellt hier.
     */
    expect(fahre("/sw.js")).toEqual({ action: "rewrite", target: "/m/radio/sw.js", moduleKey: "radio" });
  });

  it("/admin/login ergibt einen Rewrite und danach 404 — hingenommen, mit Runbook-Zeile", () => {
    /*
     * Spec:399-405: der Alt-Verwaltungshost `radio-admin.iuk-ue.de` bekommt einen
     * pfaderhaltenden Traefik-`redirectRegex`. Ein Lesezeichen auf
     * `radio-admin.iuk-ue.de/login` wird damit zu `radio.iuk-ue.de/admin/login` — und das
     * ist KEIN Passthrough, weil `/admin/login` nicht mit `/login` beginnt. Es wird also
     * ins Modul umgeschrieben und ergibt 404.
     *
     * Dieser Fall haelt die Kette fest, damit niemand spaeter aus dem 404 auf einen
     * Routing-Fehler schliesst. Die Abhilfe ist eine Runbook-Zeile, KEIN Code im Repo.
     */
    expect(fahre("/admin/login")).toEqual({
      action: "rewrite", target: "/m/radio/admin/login", moduleKey: "radio",
    });
  });
});

describe("radio: die Passthrough-Pfade erreichen das Modul NIE", () => {
  it("/login — deshalb gibt es kein radio/login/page.tsx, und es kann keines geben", () => {
    /*
     * Spec:354-358. Der Verwaltungsriegel leitet auf die SUITE-Anmeldung um:
     * `redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`)`.
     * Wer hier eine modul-eigene Anmeldeseite vorsieht, baut eine Datei, die nie
     * gerendert wird — typkorrekt, lint-sauber, still.
     */
    expect(fahre("/login")).toEqual({ action: "next" });
    expect(fahre("/login/irgendwas")).toEqual({ action: "next" });
  });

  it("/api/health/radio — den beantwortet core, nicht das Modul", () => {
    // Spec:359-360: es entsteht KEIN src/app/m/radio/api/health/…
    expect(fahre("/api/health/radio")).toEqual({ action: "next" });
  });

  it("/api/auth/*, /_next/*, /favicon.ico, /.well-known/* — kein Modulpfad traegt diese Namen", () => {
    expect(fahre("/api/auth/session")).toEqual({ action: "next" });
    expect(fahre("/_next/static/chunk.js")).toEqual({ action: "next" });
    expect(fahre("/favicon.ico")).toEqual({ action: "next" });
    expect(fahre("/.well-known/openid-configuration")).toEqual({ action: "next" });
  });

  it("aber JEDER andere Pfad unter /api/* landet im Modul", () => {
    /*
     * Spec:363-365. Route Handler unter `src/app/m/radio/api/…` funktionieren also —
     * solange sie nicht `api/auth/**` oder `api/health/**` heissen. ⛔ Kapitel 1 legt
     * keinen an; diese Zeile ist die ZUSAGE nach hinten, kein Bauauftrag.
     */
    expect(fahre("/api/irgendwas")).toEqual({
      action: "rewrite", target: "/m/radio/api/irgendwas", moduleKey: "radio",
    });
  });
});

describe("radio: die Luecke, gegen die _lib/host.ts gebaut ist (Falle 61)", () => {
  it("ein FREMDER Suite-Host darf /m/radio passieren — die Middleware haelt ihn NICHT auf", () => {
    /*
     * ⚠️ DIESER FALL SICHERT KEINE EIGENSCHAFT ZU, DIE MAN WILL — er haelt die LUECKE
     * fest, die den Host-Riegel ueberhaupt noetig macht (Spec:460-471, Falle 61 der
     * lagerbuch-Zaehlung).
     *
     * `decideRoute` gatet einen internen Pfad `/m/<key>/...` NACH DEM MODUL AUS DEM
     * SEGMENT, ohne jeden Hostbezug (routing.ts:58-66), und `canAccess` steigt fuer ein
     * Modul ohne Auth-Pflicht sofort mit `true` aus (registry.ts:260). JEDER Host, der auf
     * den Suite-Container terminiert, antwortet damit auf /m/radio/*.
     *
     * ⚠️ Kein Gate faengt das: `src/core/routing.test.ts:62-65` schreibt dieses Verhalten
     * ausdruecklich FEST, und Playwright faehrt gegen genau EINEN baseURL — ein zweiter
     * Host existiert im Lauf nicht (Spec:717). Deshalb steht die Absicherung in
     * `_lib/host.test.ts` und `riegel.test.ts` und nirgends sonst.
     *
     * Wird dieser Fall eines Tages rot, ist das KEIN Fehler dieses Moduls, sondern eine
     * Aenderung an `core/routing.ts` — und dann gehoert der Host-Riegel neu bewertet.
     */
    expect(decideRoute({ host: "iuk-ue.de", pathname: "/m/radio", groups: null }))
      .toEqual({ action: "next" });
    expect(decideRoute({ host: "iuk-ue.de", pathname: "/m/radio/admin", groups: null }))
      .toEqual({ action: "next" });
  });

  it("und /m/radio/admin ist von /m/radio nicht zu unterscheiden — Falle 22", () => {
    /*
     * docs/radio-portierung-analyse.md:1542-1545, woertlich: „eine vergessene Riegelzeile
     * in einer Action ist typkorrekt und lint-sauber; `iuk-suite/src/core/routing.ts:58-66`
     * gatet nach dem Modul aus dem Segment und unterscheidet /m/radio/ und
     * /m/radio/admin/... NICHT."
     *
     * Mit `requiresAuth: false` hat `/admin` damit NULL Middleware-Gating. Der einzige
     * Traeger ist `requireRadioAdmin` (Z4) und der Scan in `riegel.test.ts` (Z5).
     *
     * ⚠️ IM ERWARTUNGSWERT SUBSUMIERT VON FALL 1 — gehalten wegen des HOSTUNTERSCHIEDS.
     * Fall 1 prueft `/m/radio/admin` unter dem FREMDEN Host `iuk-ue.de`, dieser Fall
     * denselben Pfadast unter dem RICHTIGEN (`HOST`); beide erwarten `{ action: "next" }`.
     *
     * ⛔ IN DER MUTATIONSDECKUNG IST ER NICHT SUBSUMIERT. Die erste Fassung dieses
     * Kommentars behauptete das Gegenteil — „eine Mutation, die nur diesen trifft, gibt
     * es nicht" —, und das ist GEMESSEN FALSCH (Sonde P13, 2026-08-22): eine
     * host-abhaengige Sperre im internen Zweig von `core/routing.ts:58-66` — `host` steht
     * dort ueber die Destrukturierung in `core/routing.ts:48` in Reichweite — faerbt
     * GENAU diesen Fall rot (`1 failed | 26 passed (27)`, Fehlschlag auf seiner eigenen
     * `expect`-Zeile), waehrend Fall 1 unter `iuk-ue.de` gruen bleibt. Ein Gegenbeispiel
     * belegt nur die EXISTENZ einer solchen Mutation; es macht diesen Fall nicht zu einem
     * eigenstaendigen Riegel. Die naheliegenden Mutationen — an `PASSTHROUGH` oder am
     * Modul-Lookup — faerben weiterhin beide Faelle zugleich. Erst recht ist das NICHT
     * die NT11-Form: der Fall hat eine eigene Mutation, sie ist nur nicht die naechste,
     * die jemandem einfaellt.
     */
    const anonym = decideRoute({ host: HOST, pathname: "/m/radio/admin/zugaenge", groups: null });
    // EINE Behauptung, nicht zwei: `toEqual({ action: "next" })` schliesst
    // `{ action: "login", callbackUrl: "/m/radio/admin/zugaenge" }` bereits aus. Ein
    // zusaetzliches `not.toEqual` darauf haette keine eigene Mutation — es kann nur rot
    // werden, wenn die Zeile darueber schon rot ist, und ein Prueffall ohne eigene
    // Mutation ist ein Prueffall, der nichts bewacht.
    expect(anonym).toEqual({ action: "next" });
  });
});
```

- [ ] **Schritt 2: Den Fehlschlag sehen — mit einer Sonde, die zurückgenommen wird**

Der Test ist nach Z1 **sofort grün**, und ein Test, der gegen einen fertigen Baum sofort grün ist,
ist unbewiesen. Stelle den Fehlschlag her, indem du in `src/core/registry.ts` beim `radio`-Eintrag
`showInSwitcher` unverändert lässt, aber testweise `requiresAuth` auf `true` setzt:

```
rtk pnpm vitest run src/app/m/radio/_lib/routen.test.ts
```

Erwartet mit der Sonde: **jeder Rewrite-Fall rot** mit `{ action: "login", callbackUrl: … }` statt
`rewrite` — genau der Ausfall, den Spec:163-167 beschreibt („schickte JEDEN anonymen Aufruf in den
Login … sofort beim Umschwenk des Routers, ohne Parallelfenster").

⚠️ **Rot wird zusätzlich der ganze Block „die Lücke, gegen die `_lib/host.ts` gebaut ist"** — und
das ist kein zweiter, unerklärter Fehler, sondern dieselbe Ursache von der anderen Seite: mit
`requiresAuth: true` nimmt `decideRoute` im internen Zweig den Login-Ausgang
(`routing.ts:62-64`) und liefert für `/m/radio` `{ action: "login", callbackUrl: "/m/radio" }` statt
`{ action: "next" }`. **Erwarte also mehr rote Fälle als nur die Rewrites**, und zähle sie im
Bericht — eine unerklärte Zusatzmenge ist der Anfang jeder Fehlersuche in die falsche Richtung.

Zitiere eine der Meldungen. Dann **restlos** zurück:

```
rtk git checkout -- src/core/registry.ts
rtk git status --porcelain src/core/registry.ts
```

Erwartet: **leer**.

- [ ] **Schritt 3: Grün sehen**

```
rtk pnpm vitest run src/app/m/radio/_lib/routen.test.ts src/core/routing.test.ts
```

Erwartet: **beide grün**. `core/routing.test.ts` läuft mit, weil es dasselbe Verhalten von der
anderen Seite festschreibt (namentlich `:62-65`, „gated interne Pfade nach dem Modul aus dem
Segment, nicht nach dem Host") — ein neuer Registry-Eintrag darf es nicht verschieben.

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/routen.test.ts
rtk git commit -m "test(radio): die Routenkarte gegen PASSTHROUGH, inklusive der Falle-61-Luecke"
rtk git show --stat HEAD
```

---

## Aufgabe Z3: Der Host-Riegel — vier Formen, zwei Dateien

**Files:**
- Create: `src/app/m/radio/_lib/host.ts`
- Create: `src/app/m/radio/_lib/hostRiegel.ts`
- Create: `src/app/m/radio/_lib/host.test.ts`

**Interfaces:**
- Consumes: die Registry-Zeile aus **Z1** (`moduleForHost` muss `radio` kennen).
- Produces: `istRadioHost`, `requireRadioHost`, `radioHostOderNull` (`_lib/host.ts`) und
  `hostAbweisung` (`_lib/hostRiegel.ts`). **Z4 ruft `requireRadioHost`**, **Z5** scannt auf alle
  vier, **Planteil 3** verankert sie in `t/[code]/route.ts` und `abmelden/route.ts`, **Planteil 4**
  im Export-Handler, **Planteil 5** in `sw.js/route.ts`.

⚠️ **Vier Formen, nicht drei — nachgetragen in B13** (Spec:102, Kapiteltext Spec:530-547). Die
ursprüngliche Bestandsaufnahme („drei Signaturen, eine Datei, genau zwei Route Handler") war falsch;
die Bauform ist im Repo echt (`src/app/m/lagerbuch/_lib/hostRiegel.ts`).

⛔ **Die Schritte dieser Aufgabe werden NICHT in der abgedruckten Nummernfolge gefahren.** Zuerst
Schritt 3 (die Testdatei), dann Schritt 4 Teil A (der rote Importzustand), dann Schritt 1 und 2 (der
Bau), dann Schritt 4 Teil B (die Sonde). Die Begründung steht bei Schritt 4.

⚠️ **DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht angenommen.**
(Fund W2 der Prüfung zu Z2, eingearbeitet am 2026-08-22.) In diesem Repo lädt vitest **keine**
`.env`-Datei: `grep -rn "dotenv" vitest.config.ts vitest.setup.ts package.json` hat **keinen**
Treffer, und eine Sonde las `SUITE_HOST_FILES`/`SUITE_HOST_LAGERBUCH` im Lauf als `undefined`,
obwohl `.env.local:41` und `:58` beide setzen. **Folge für diese Aufgabe:** ein lokal in
`.env.local` gesetztes `SUITE_HOST_RADIO` verfälscht **kein** Tor — ein in der Shell oder in der CI
**exportierter** Wert dagegen schon (gemessen: `env SUITE_HOST_PORTAL=radio.localtest.me rtk pnpm
vitest run src/app/m/radio/_lib/routen.test.ts` → `20 failed | 5 passed`; `moduleForHost` läuft
`MODULES` der Reihe nach ab, `registry.ts:246-253`, und `portal` `:57` steht vor `radio` `:192`).
⛔ Wo ein Prüffall die Umgebung braucht, gehört sie wie in `src/core/registry.test.ts` als
**Parameter** hinein (`OHNE_ENV = {}`), **nicht** aus `process.env` gelesen.

- [ ] **Schritt 1: `_lib/host.ts` schreiben — mit der Verankerungstabelle als Kommentarblock**

Spec:551-552 verlangt die Aufruftabelle **in dieser Datei**, nach dem Vorbild
`lagerbuch/_lib/host.ts:58-96`. Sie ist kein Beiwerk: eine Tabelle, die zwei von vier Handlern nicht
führt, ist die Liste, die die nächste Datei vergisst (Spec:577-579).

```ts
// src/app/m/radio/_lib/host.ts
import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * DER MODUL-EIGENE HOST-RIEGEL (Spec 1 §1.4, Zeilen 453-635).
 *
 * KEIN "use client": Server Components UND Route Handler lesen hier (Spec:455-456).
 *
 * WARUM ES IHN GIBT — Falle 61 der lagerbuch-Zaehlung (Spec:458-471). `decideRoute` gatet
 * einen internen Pfad `/m/<key>/...` NACH DEM MODUL AUS DEM SEGMENT, ohne jeden
 * Hostbezug (core/routing.ts:58-66), und `canAccess` steigt fuer ein Modul ohne
 * Auth-Pflicht sofort mit `true` aus (core/registry.ts:260). JEDER Host, der auf den
 * Suite-Container terminiert, antwortet damit auf /m/radio/*.
 *
 * ⚠️ BEI `radio` HAT DAS DATENWIRKUNG, nicht nur Sichtwirkung: das Einloesen unter
 * /t/<code> praegt eine Sitzung und ruehrt die Codezeile an. Das Sitzungscookie laege
 * host-only auf dem FREMDEN Host, und `radio` liefe dort vollstaendig — eine zweite
 * Herkunft, die in keinem Runbook steht und aus der echte Leihvorgaenge in die Datenbank
 * laufen.
 *
 * ⚠️ VERSCHAERFEND GEGENUEBER `lagerbuch` (Spec:473-476): der Alt-Kiosk legte seinen
 * Zugang im `localStorage` ab (radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13),
 * also origin-gebunden — die Fehlerrichtung war ein STILLER AUSFALL. Die Suite-Fassung
 * nimmt ein Cookie.
 *
 * ⚠️ KEIN GATE FAENGT DAS: `src/core/routing.test.ts:62-65` schreibt das Middleware-Verhalten
 * ausdruecklich FEST, und Playwright faehrt gegen genau einen baseURL — ein zweiter Host
 * existiert im Lauf nicht (Spec:717, Falle 12 der Portierungsanalyse,
 * docs/radio-portierung-analyse.md:1384-1387).
 */

/**
 * Ist das der Radio-Host? `moduleForHost(resolveHost(headers))?.key` und NICHT ein
 * direkter Vergleich gegen `prodHostsFor`:
 *
 * - `moduleForHost` (registry.ts:246-253) trifft `radio.localtest.me` VOR und UNABHAENGIG
 *   von `prodHostsFor`. Damit laeuft derselbe Code-Pfad in Dev, E2E und Produktion, OHNE
 *   dass SUITE_HOST_RADIO lokal gesetzt sein muss.
 * - `resolveHost` (routing.ts:36-41) wird WIEDERVERWENDET, nicht nachgebaut: seine
 *   Vorrangregel `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware die
 *   einzig richtige. Eine zweite Aufloesung waere der Ort, an dem beide auseinanderlaufen.
 *
 * ES GIBT KEINEN „kein Prod-Host konfiguriert -> durchlassen"-ZWEIG (Spec §1.4.5,
 * Zeilen 609-635). Er waere die Sperre, die sich selbst abschaltet: solange
 * SUITE_HOST_RADIO fehlt — und vor dem Cutover fehlt sie —, waere genau der Zustand
 * offen, gegen den diese Datei gebaut ist. Die Praedikatsform oben macht ihn
 * ueberfluessig, weil sie den Dev-Host ohne jede Env deckt.
 */
export function istRadioHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "radio";
}

/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft notFound(). Kein 403: die Existenz
 *  eines Pfades auf dem falschen Host wird nicht verraten (Spec:691-694, §1.5). */
export function requireRadioHost(headers: Headers): void {
  if (!istRadioHost(headers)) notFound();
}

/** Fuer ROUTE HANDLER. Wirft NIE — ein notFound() ist keine brauchbare Antwort auf einen
 *  gescannten QR-Code; der Handler baut seine 404 selbst (Spec:500/525-527). */
export function radioHostOderNull(headers: Headers): "radio" | null {
  return istRadioHost(headers) ? "radio" : null;
}

/**
 * WO DIESE FUNKTIONEN GERUFEN WERDEN — verbindlich (Spec §1.4.3, Zeilen 549-593).
 * Route Handler haben KEIN Layout ueber sich; die Sperre erreicht sie ueber kein
 * Group-Layout.
 *
 *   page.tsx (Gate)                        requireRadioHost      Planteil 3
 *   (ausleihe)/layout.tsx                  KEINER — das Zugangspraedikat ruft ihn intern
 *   (ausleihe)/geraete|ausleihen|rueckgabe KEINER — dito
 *   admin/(arbeit)/layout.tsx              requireRadioHost, dann requireRadioAdmin   Z6
 *                                          ⬜ AB PLANTEIL 4 requireRadioVerwaltung STATT
 *                                          requireRadioAdmin — Betreiberentscheidung C.6/B4,
 *                                          zwei Rechtestufen wie im Bestand. Spec:4367
 *                                          schreibt es fuer genau diese Zeile fest; Spec:4368
 *                                          laesst (druck) auf requireRadioAdmin. Die Tabelle
 *                                          hier gibt §1.4.3 wieder, also den Stand VOR B4.
 *                                          ⛔ KEIN TOR FAENGT DIE UMSTELLUNG: riegel.test.ts
 *                                          Klausel (a) nimmt im Arbeits-Zweig BEIDE Namen an,
 *                                          ein ODER; typecheck, lint und build sehen nichts.
 *                                          Bleibt die Zeile stehen, sperrt der Layout-Riegel
 *                                          jede Updater-Person mit 404, bevor eine Seite laeuft
 *   admin/(druck)/layout.tsx               requireRadioHost, dann requireRadioAdmin   Z6
 *   t/[code]/route.ts                      radioHostOderNull     Planteil 3  <- Tuer mit Datenwirkung
 *   abmelden/route.ts                      radioHostOderNull     Planteil 3
 *   admin/(arbeit)/geraete/export/route.ts radioHostOderNull + istRadioAdmin(await viewerOderNull())
 *                                          Planteil 4 — B11 (Spec:100, ausgeschrieben Spec:4379,
 *                                          bestaetigt B17 Spec:117): BEIDE nicht-werfend, der
 *                                          Handler baut seine Antwort selbst, und sie ist 404,
 *                                          nicht 403 (B10). ⛔ NIE requireRadioAdmin() hier — das
 *                                          endet in redirect('/login?…') bzw. notFound(), und ein
 *                                          anonymer GET landete im Login-Umweg
 *   sw.js/route.ts                         hostAbweisung (Response | null)  Planteil 5
 *   requireRadioAdmin                      requireRadioHost als ERSTE Anweisung  (zugang.ts)
 *   Zugangspraedikat der Ausleihe          requireRadioHost als ERSTE Anweisung  Planteil 3
 *   viewerOderNull                         ABSICHTLICH KEINER — Gegenregel, Spec §1.4.4
 *
 * (i) LAYOUTS UND SEITEN SIND BEQUEMLICHKEIT, KEINE SICHERHEITSGRENZE (Spec:569-571).
 * Route-Group-Grenzen sind keine Grenzen; eine Seite kann jederzeit aus einer Group
 * herauswachsen, und ein Layout schuetzt nichts, was es nicht umschliesst.
 *
 * (ii) JEDER ROUTE HANDLER BRAUCHT SEINE EIGENE ZEILE. Bei `radio` sind das VIER
 * (korrigiert, B13, Spec:573-579). Bei `requiresAuth: false` ist eine vergessene Zeile ein
 * offener Endpunkt auf JEDEM Suite-Host, typkorrekt und lint-sauber.
 *
 * (iii) DIE TRAGENDE SCHICHT IST DIE INNERSTE (Spec:581-593, Kapitel-4-Pflicht 16,
 * docs/radio-portierung-analyse.md:973-977). Server Actions haben KEIN Layout ueber sich.
 * Weil der Host-Riegel INNEN sitzt — in `requireRadioAdmin` und im Zugangspraedikat der
 * Ausleihe —, ist die Zusage „jede Action ist host-gebunden" durch KONSTRUKTION wahr,
 * nicht durch eine Liste, die die naechste Action vergisst.
 *
 * ⚠️ UND DIE UMKEHRUNG, sie ist die haeufigere Fehlerquelle: WER DAS ZUGANGSPRAEDIKAT
 * BENUTZT, RUFT DEN HOST-RIEGEL NICHT NOCH EINMAL (Pflicht 16). Ein zweiter Aufruf ist
 * die Behauptung, das Praedikat sei host-blind — und die naechste Person entfernt dann
 * den falschen der beiden. Vorbild fuer denselben Schluss:
 * `lagerbuch/_lib/bauform.test.ts:1597-1614`.
 *
 * ⚠️ ES GIBT KEIN `validateRadioHosts` (Spec §1.4.5, Falle 21 der Portierungsanalyse,
 * docs/radio-portierung-analyse.md:1536-1540). Eine Boot-Pruefung nach `files`-Vorbild
 * wuerde den Zustand VOR dem Cutover (0 Hosts) und den Zustand „abgeloeste Domain laeuft
 * mit" (>= 2 Hosts) faelschlich abbrechen — beide sind bei `radio` erlaubt, und der
 * Fehler zeigte sich als Startabbruch am schlechtesten Tag, den kein Test vorher
 * herstellt. Tippfehler im VARIABLENNAMEN, Protokoll/Port im Wert und doppelt vergebene
 * ENV-Hosts faengt bereits `validateHostConfig` (core/hosts.ts:65-99).
 *
 * ⚠️ WAS `validateHostConfig` NICHT SIEHT: einen Host, den ein ANDERES Modul ueber
 * `prodHosts` in der Registry fuehrt — heute `portal`s "iuk-ue.de" (registry.ts:59). Die
 * Kollisions-Karte wird ausschliesslich aus `envHostsFor` gefuellt; ein
 * Registry-`prodHosts`-Eintrag erreicht sie nie. Das ist Handarbeit im Runbook.
 */
```

- [ ] **Schritt 2: `_lib/hostRiegel.ts` schreiben — die vierte Form**

⚠️ **Diese Datei steht hier, obwohl Spec:546-547 sie Kapitel 7 zuschreibt** — Begründung in
Warnung 4 des Kopfes. Ihr Konsument kommt mit Planteil 5.

```ts
// src/app/m/radio/_lib/hostRiegel.ts
import { radioHostOderNull } from "./host";

/**
 * DIE VIERTE RIEGELFORM (Spec:530-547, nachgetragen in B13). Fuer Route Handler, deren
 * FEHLantwort einen bestimmten `Content-Type` braucht — einziger heutiger Fall
 * `sw.js/route.ts` (Kapitel 7 §7.1.3, Planteil 5).
 *
 * ⚠️ `radioHostOderNull` UND NICHT DIE WERFENDE FORM `requireRadioHost`. Ein `notFound()`
 * waere eine HTML-Fehlerseite mit `Content-Type: text/html`, und der Browser meldete
 * „manifest fetch failed" statt einer sauberen Abweisung (Spec:544-546).
 *
 * ⛔ DER NAME OBEN STEHT OHNE KLAMMER, UND DAS IST KEINE NACHLAESSIGKEIT: `host.test.ts`
 * prueft `not.toMatch(/\brequireRadioHost\s*\(/)` auf dem ROHTEXT dieser Datei. Ein `(`
 * hinter dem Namen — auch in diesem Kommentar — macht den Test in dem Moment rot, in dem
 * er geschrieben wird.
 *
 * ⚠️ DIE RUECKGABE IST `Response | null`, DAMIT DER AUFRUFER SIE MIT `??` KURZSCHLIESSEN
 * KANN: `return hostAbweisung(req) ?? <Antwort>`. Genau das macht „als erste Anweisung"
 * STRUKTURELL wahr statt konventionell — im rechten Zweig kann nichts vor dem Riegel
 * laufen, weil er erst ausgewertet wird, wenn der linke `null` ist (Spec:538-540). Ein
 * Riegel, der als ZWEITE Anweisung stuende, antwortete auf fremdem Host genauso mit 404,
 * und kein Verhaltenstest saehe den Unterschied.
 *
 * WARUM EINE EIGENE DATEI UND KEINE ZEILE IN JEDEM HANDLER: der Riegel ist keine Route,
 * sondern eine GETEILTE ZUSAGE. Bei `lagerbuch` standen fuenf Kopien, und fuenf Kopien
 * heissen fuenf Orte fuer dieselbe Aenderung (lagerbuch/_lib/hostRiegel.ts:6-13,
 * Befund 43). `radio` hat heute EINEN kuenftigen Konsumenten — die Datei existiert
 * trotzdem, weil `riegel.test.ts` (Z5) sie als erlaubte Alternative fuehren muss.
 *
 * KEIN "use client" (Falle 6): der Konsument ist eine Server-Datei; ein WERT aus einem
 * Client-Modul kaeme dort als Client-Referenz an.
 */
export function hostAbweisung(req: Request): Response | null {
  return radioHostOderNull(new Headers(req.headers))
    ? null
    : new Response("Not found", { status: 404 });
}
```

⚠️ **`new Headers(req.headers)`, nicht `req.headers` direkt** — zeichengleich zu
`lagerbuch/_lib/hostRiegel.ts:33`. Die Antwortform `new Response("Not found", { status: 404 })` ist
wörtlich aus Spec:528.

- [ ] **Schritt 3: `_lib/host.test.ts` schreiben — alle vier Formen und zwei Quelltext-Zusicherungen**

⚠️ **Alle vier Formen in EINER Datei, keine sechste Testdatei.** Spec 1.6 (`:709-717`) führt fünf
Testdateien; B5s Regel „eine Datei, drei beschreibende Orte, keine Zeile doppelt"
(`radio/_lib/boot.test.ts:13-19`) gilt hier genauso.

```ts
// src/app/m/radio/_lib/host.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

// `notFound()` wirft in der echten Laufzeit einen Next-internen Fehler. Fuer die
// Unit-Aussage genuegt ein erkennbarer Wurf — geprueft wird, DASS geworfen wird.
// Zeichengleich zu `lagerbuch/_lib/host.test.ts:3-7`.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { istRadioHost, requireRadioHost, radioHostOderNull } from "./host";
import { hostAbweisung } from "./hostRiegel";

const kopf = (h: Record<string, string>) => new Headers(h);
const anfrage = (h: Record<string, string>) => new Request("https://beliebig.example/x", { headers: h });

/**
 * ⚠️ DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht
 * angenommen: in diesem Repo laedt vitest KEINE `.env`-Datei (kein `dotenv` in
 * `vitest.config.ts`, `vitest.setup.ts` oder `package.json`). Ein lokal in `.env.local`
 * gesetztes `SUITE_HOST_RADIO` verfaelscht damit kein Tor — ein in der Shell oder in der
 * CI EXPORTIERTER Wert dagegen schon.
 *
 * Deshalb loescht `beforeEach` die Variable VOR jedem Fall, statt sich darauf zu
 * verlassen, dass der vorige Fall aufgeraeumt hat: sonst laufen die Faelle, die keinen
 * Prod-Host setzen, unter dem Wert, den die aufrufende Shell zufaellig exportiert hat.
 * `afterEach` stellt den Ausgangszustand des Prozesses wieder her.
 */
const alterWert = process.env.SUITE_HOST_RADIO;
beforeEach(() => {
  delete process.env.SUITE_HOST_RADIO;
});
afterEach(() => {
  if (alterWert === undefined) delete process.env.SUITE_HOST_RADIO;
  else process.env.SUITE_HOST_RADIO = alterWert;
});

describe("istRadioHost", () => {
  it("trifft den Dev-Host OHNE jede Env", () => {
    // Genau dieser Fall macht den „kein Prod-Host konfiguriert -> durchlassen"-Zweig
    // ueberfluessig: moduleForHost trifft <key>.localtest.me VOR und UNABHAENGIG von
    // prodHostsFor. Damit laeuft in Dev, E2E und Produktion derselbe Code-Pfad.
    //
    // ⚠️ IN DER MUTATIONSDECKUNG TRAEGT IHN HEUTE FALL 6 MIT („ignoriert einen Port"): kein
    // gefahrener Eingriff faerbt diesen Fall ALLEIN rot, waehrend Fall 6 einen eigenen hat
    // (Rumpf -> Vergleich gegen die Zeichenkette radio.localtest.me). Er bleibt trotzdem
    // stehen — Spec:712 verlangt „trifft radio.localtest.me OHNE gesetzte Env" namentlich als
    // Mindestzusicherung, und ein Gegenbeispiel macht ihn nicht zum eigenstaendigen Riegel.
    // Das Env-Loeschen leistet das beforeEach oben (kein zweites hier, es waere tot).
    expect(istRadioHost(kopf({ host: "radio.localtest.me" }))).toBe(true);
  });

  it("trifft den konfigurierten Prod-Host", () => {
    process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
    expect(istRadioHost(kopf({ host: "radio.iuk-ue.de" }))).toBe(true);
  });

  it("weist einen FREMDEN Suite-Host ab — auch den, der iuk-ue.de per prodHosts fuehrt", () => {
    // `iuk-ue.de` ist der einzige Host, der im REGISTRY-CODE steht (portal,
    // registry.ts:59) — und damit der einzige, den validateHostConfig als Kollision NICHT
    // sehen wuerde. Er gehoert deshalb namentlich in diesen Fall.
    expect(istRadioHost(kopf({ host: "lagerbuch.localtest.me" }))).toBe(false);
    expect(istRadioHost(kopf({ host: "iuk-ue.de" }))).toBe(false);
  });

  it("bevorzugt x-forwarded-host vor host — die Vorrangregel aus core/routing", () => {
    // Nach dem Rewrite der Middleware ist das die einzig richtige Reihenfolge. Eine
    // zweite Aufloesung waere der Ort, an dem beide auseinanderlaufen; deshalb wird
    // `resolveHost` wiederverwendet, nicht nachgebaut (routing.ts:14-35).
    expect(istRadioHost(kopf({
      "x-forwarded-host": "radio.localtest.me", host: "lagerbuch.localtest.me",
    }))).toBe(true);
    expect(istRadioHost(kopf({
      "x-forwarded-host": "lagerbuch.localtest.me", host: "radio.localtest.me",
    }))).toBe(false);
  });

  it("nimmt aus einer Kommaliste den ERSTEN Wert", () => {
    // routing.ts:25-27: der erste Wert ist der urspruengliche Client-Host, der Rest sind
    // Zwischenstationen. Ein Proxy, der anhaengt, darf den Riegel nicht kippen.
    expect(istRadioHost(kopf({ "x-forwarded-host": "radio.localtest.me, proxy.intern" }))).toBe(true);
    expect(istRadioHost(kopf({ "x-forwarded-host": "proxy.intern, radio.localtest.me" }))).toBe(false);
  });

  it("ignoriert einen Port", () => {
    expect(istRadioHost(kopf({ host: "radio.localtest.me:3000" }))).toBe(true);
  });

  it("hat KEINEN 'kein Prod-Host konfiguriert -> durchlassen'-Zweig", () => {
    // Er waere die Sperre, die sich selbst abschaltet: solange SUITE_HOST_RADIO fehlt —
    // und VOR DEM CUTOVER FEHLT SIE —, waere genau der Zustand offen, gegen den die Datei
    // gebaut ist (Spec §1.4.5). Das Env-Loeschen leistet das beforeEach oben.
    expect(istRadioHost(kopf({ host: "irgendwas.example.org" }))).toBe(false);
    expect(istRadioHost(kopf({}))).toBe(false);
  });
});

describe("requireRadioHost — fuer LAYOUTS UND SEITEN, erste Anweisung", () => {
  it("laesst den eigenen Host durch", () => {
    expect(() => requireRadioHost(kopf({ host: "radio.localtest.me" }))).not.toThrow();
  });

  it("wirft auf fremdem Host — notFound(), KEIN 403", () => {
    // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten. `radio` hat
    // dafuer einen eigenen Anlass: hinter /admin liegen Klarnamen samt Bewegungshistorie
    // und die Enrollment-Codes (docs/radio-portierung-analyse.md:979-997).
    expect(() => requireRadioHost(kopf({ host: "lagerbuch.localtest.me" })))
      .toThrow("NEXT_NOT_FOUND");
  });
});

describe("radioHostOderNull — fuer ROUTE HANDLER", () => {
  it("wirft NIE", () => {
    // Ein notFound() ist keine brauchbare Antwort auf einen GESCANNTEN QR-Code; der
    // Handler baut seine 404 selbst (Spec:500/525-527).
    expect(radioHostOderNull(kopf({ host: "radio.localtest.me" }))).toBe("radio");
    expect(radioHostOderNull(kopf({ host: "lagerbuch.localtest.me" }))).toBeNull();
    expect(radioHostOderNull(kopf({}))).toBeNull();
  });
});

describe("hostAbweisung — die vierte Form (B13), fuer Handler mit eigenem Content-Type", () => {
  it("gibt auf dem eigenen Host null zurueck — damit `??` den rechten Zweig nimmt", () => {
    expect(hostAbweisung(anfrage({ host: "radio.localtest.me" }))).toBeNull();
  });

  it("gibt auf fremdem Host eine FERTIGE 404 zurueck, statt zu werfen", async () => {
    const antwort = hostAbweisung(anfrage({ host: "iuk-ue.de" }));
    expect(antwort).not.toBeNull();
    expect(antwort!.status).toBe(404);
    // Koerper UND Content-Type sind bewusst Text: eine HTML-Fehlerseite meldete dem Browser
    // „manifest fetch failed" statt einer sauberen Abweisung (Spec:544-546). Genau diese
    // Eigenschaft ist der Daseinsgrund der vierten Riegelform (hostRiegel.ts, Kopf) — sie
    // gehoert deshalb zugesichert, nicht nur begruendet.
    //
    // ⛔ POSITIV formuliert, nicht als `not.toContain("text/html")`: die positive Form hat die
    // echt kleinere Gruen-Menge — ueber `application/json` haelt die verneinende, die positive
    // faellt. Ueber einem FEHLENDEN Header vergleicht KEINE der beiden: chai weist die
    // Kombination zurueck, `toMatch` verlangt eine Zeichenkette (vitest 4.1.10, im Laeufer
    // gemessen). Der Wert kommt von undici (`text/plain;charset=UTF-8`), daher bindet das Muster vorn.
    expect(antwort!.headers.get("content-type"), "keine HTML-Fehlerseite auf /sw.js")
      .toMatch(/^text\/plain/);
    await expect(antwort!.text()).resolves.toBe("Not found");
  });

  it("wirft in keinem Fall", () => {
    expect(() => hostAbweisung(anfrage({ host: "iuk-ue.de" }))).not.toThrow();
    expect(() => hostAbweisung(anfrage({}))).not.toThrow();
  });
});

describe("die zwei Quelltext-Zusicherungen ueber die Riegeldateien", () => {
  /*
   * WARUM QUELLTEXT UND NICHT VERHALTEN: beide Aussagen unten sind ueber die ABWESENHEIT
   * eines Zweigs bzw. einer Aufrufform. Ein Verhaltenstest kann eine Abwesenheit nicht
   * belegen — er faende nur den Zweig, den er zufaellig trifft. Vorbild:
   * `lagerbuch/_lib/bauform.test.ts:8-11` („Sie belegen NICHT, dass etwas wirkt, sondern
   * dass eine BAUFORM eingehalten ist").
   */
  it("host.ts enthaelt keinen Zweig, der bei leerem prodHostsFor durchlaesst", () => {
    /*
     * Spec:712 verlangt genau diese Zusicherung. Der Zweig saehe wie eine Erleichterung
     * aus („lokal ist ja nichts konfiguriert") und waere die Sperre, die sich selbst
     * abschaltet. Der Test bindet an den FUNKTIONSNAMEN, nicht an eine Formulierung:
     * `host.ts` darf `prodHostsFor` ueberhaupt nicht rufen, weil es die Frage gar nicht
     * stellt — es fragt `moduleForHost`.
     */
    const quelle = readFileSync("src/app/m/radio/_lib/host.ts", "utf8");
    expect(quelle, "host.ts fragt moduleForHost, nie prodHostsFor (Spec §1.4.5)")
      .not.toMatch(/\bprodHostsFor\s*\(/);
  });

  it("hostAbweisung loest auf die NICHT-werfende Form auf", () => {
    /*
     * DIE KETTE SCHLIESSEN (Vorbild lagerbuch/_lib/bauform.test.ts:1584-1595). Sobald
     * Planteil 5 den `sw.js`-Handler baut, ist DIES die eine Datei, in der die Form fuer
     * ihn umkippen koennte — und ein Scan ueber den Handler liesse `hostAbweisung(`
     * weiter durchgehen, ohne etwas zu merken.
     */
    const riegel = readFileSync("src/app/m/radio/_lib/hostRiegel.ts", "utf8");
    expect(riegel, "hostAbweisung ruft die nicht-werfende Form").toMatch(/\bradioHostOderNull\s*\(/);
    expect(riegel, "hostAbweisung wuerfe sonst fuer den Handler, der sie kurzschliesst")
      .not.toMatch(/\brequireRadioHost\s*\(/);
    // Und die Wurzel derselben Aussage, ohne Umweg ueber einen Aufrufnamen: wer nicht
    // aus `next/navigation` importiert, kann `notFound()` gar nicht rufen. Diese Form
    // bindet an eine IMPORT-Zeile und ist damit gegen jede Umbenennung robust — und sie
    // trifft den Kommentarkopf nicht, der `notFound()` erklaerenderweise nennt.
    expect(riegel, "hostRiegel.ts importiert nichts aus next/navigation")
      .not.toMatch(/from\s+["']next\/navigation["']/);
  });
});
```

⛔ **Diese zwei Fälle tragen zusammen VIER Muster, davon drei verneinende — und alle vier lesen den
ROHTEXT, ohne Kommentar-Entfernung. Deshalb bindet JEDES Muster an einen Aufruf `(` oder an eine
Import-Zeile, nie an die bloße Nennung eines Namens.** (Die Tabelle unten prüft die drei
verneinenden; das vierte, `toMatch(/\bradioHostOderNull\s*\(/)`, ist der eine positive Nachweis und
steht darunter eigens begründet.)
Das ist die Stelle, an der ein Scan „auf seiner eigenen Begründung rot" wird — genau die Falle, die
`lagerbuch/_lib/bauform.test.ts:124-141` benennt und gegen die dort `ohneKommentare` steht. Hier
trägt stattdessen die Musterform, und sie muss beim Schreiben gegengeprüft werden:

| Muster | Was der Kommentarkopf der geprüften Datei enthält | Trifft es? |
|---|---|---|
| `\bprodHostsFor\s*\(` | `host.ts` schreibt „trifft `radio.localtest.me` VOR und UNABHAENGIG von `prodHostsFor`" — **ohne** `(` | nein |
| `\brequireRadioHost\s*\(` | `hostRiegel.ts` schreibt „`radioHostOderNull` UND NICHT DIE WERFENDE FORM `requireRadioHost`." — der Name steht dort, aber **ohne** `(`, und der Kommentar sagt das ausdrücklich dazu | nein |
| `from ["']next/navigation["']` | `hostRiegel.ts` schreibt „Ein `notFound()` waere eine HTML-Fehlerseite" — das ist ein **Aufruf** im Fließtext, und genau deshalb steht hier die **Import**-Zeile statt `\bnotFound\s*\(` | nein |

⛔ **Wer einen dieser Kommentare umformuliert und dabei ein `(` hinter den Namen setzt, macht den
Test rot — dann ist der KOMMENTAR zu ändern, nicht der Test.** Der Grün-Fix, der naheliegt und
falsch ist, wäre das Löschen der Begründung in `host.ts`: das sind die vierzig Zeilen, die erklären,
warum es keinen Durchlass-Zweig gibt.

⚠️ **Der eine POSITIVE Nachweis (`toMatch(/\bradioHostOderNull\s*\(/)`) ist die still-grüne
Richtung** und wird hier bewusst ungefiltert gefahren: `hostRiegel.ts` ist neun Zeilen lang, das
Muster bindet an `(`, und ein Zeichenkettenliteral `"radioHostOderNull("` gäbe es in dieser Datei
nur mutwillig. Die vollständige Absicherung derselben Aussage über den **ganzen** Modulbaum leistet
`riegel.test.ts` (Z5), Klausel (c) — dort läuft sie durch `ohneKommentareUndZeichenketten`.

- [ ] **Schritt 4: Den Fehlschlag sehen — zweimal, und der erste Teil läuft VOR Schritt 1**

⛔ **Dieser Schritt hat zwei Teile, und der erste gehört ausgeführt, BEVOR `_lib/host.ts` existiert.**
Der Plankopf sagt „jede Aufgabe beginnt mit ihrem Test und dem gesehenen roten Zustand" (`:23-25`) —
wer die Aufgabe in der abgedruckten Nummernfolge fährt, hat `./host` längst, und die Meldung ist
**nicht mehr herstellbar**. **Fahre die Aufgabe deshalb so:**

```
Schritt 3 (die Testdatei schreiben)  →  Teil A hier  →  Schritt 1 und 2 (der Bau)  →  Teil B hier
```

Die Nummern bleiben stehen, damit die Verweise aus den Nachbarplänen weiter treffen.

**Teil A — vor dem Bau, gegen die noch fehlende Datei:**

```
rtk pnpm vitest run src/app/m/radio/_lib/host.test.ts
```

Erwartet: `Failed to resolve import "./host"`. Zitiere die Meldung.

**Teil B — nach dem Bau.** Die Datei ist jetzt grün, und ein Test, der gegen einen fertigen Baum
sofort grün ist, ist unbewiesen. Stelle den Fehlschlag **zusätzlich** her. Trage in `_lib/host.ts`
testweise den verbotenen Durchlass-Zweig ein:

```ts
// SONDE in istRadioHost — wird zurueckgenommen
import { moduleForHost, prodHostsFor, getModule } from "@/core/registry";
…
export function istRadioHost(headers: Headers): boolean {
  if (prodHostsFor(getModule("radio")).length === 0) return true;   // SONDE
  return moduleForHost(resolveHost(headers))?.key === "radio";
}
```

⛔ **Ein bloßer `import { prodHostsFor } …` genügt NICHT, und das ist der Kern dieses Schrittes.**
Die Zusicherung lautet `not.toMatch(/\bprodHostsFor\s*\(/)` und bindet an einen **Aufruf**; eine
Importzeile trägt hinter dem Namen ` }`, kein `(`. Der Lauf bliebe **grün**, und die zwei Ausgänge,
die dann naheliegen, sind beide falsch: die Zusicherung aufweichen — oder sie als „bewiesen" ins
Protokoll schreiben, ohne dass sie je ausgelöst hat. Das zweite ist eine erfundene Messung in einem
Abnahmebericht. Die Sonde oben trägt den Aufruf **und** ist zugleich der Zweig, den §1.4.5 verbietet
— sie führt also das *Warum* mit vor.

```
rtk pnpm vitest run src/app/m/radio/_lib/host.test.ts
```

Erwartet: **1 failed**, „host.ts fragt moduleForHost, nie prodHostsFor". Zitiere sie. Dann restlos
zurück:

```
rtk git checkout -- src/app/m/radio/_lib/host.ts 2>/dev/null || true
rtk git status --porcelain src/app/m/radio/_lib
```

⚠️ Die Datei ist in diesem Moment noch **unverfolgt** — `git checkout` greift dann nicht. Nimm die
Sondenzeilen in dem Fall **von Hand** wieder heraus und prüfe mit `rtk git diff` bzw. einem
erneuten Testlauf, dass alles grün ist.

- [ ] **Schritt 5: Grün sehen**

```
rtk pnpm vitest run src/app/m/radio/_lib/host.test.ts
```

Erwartet: **alle grün**, davon vier `describe`-Blöcke plus der Quelltext-Block.

- [ ] **Schritt 6: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/host.ts src/app/m/radio/_lib/hostRiegel.ts src/app/m/radio/_lib/host.test.ts
rtk git commit -m "feat(radio): der Host-Riegel — vier Formen, zwei Dateien (B13)"
rtk git show --stat HEAD
```

---

## Aufgabe Z4: Der Zugriffsriegel — und die Naht für die zweite Rechtestufe

**Files:**
- Create: `src/app/m/radio/_lib/zugang.ts`
- Create: `src/app/m/radio/_lib/zugang.test.ts`

**Interfaces:**
- Consumes: `requireRadioHost` aus **Z3**, die Registry-Zeile aus **Z1**.
- Produces: `RadioViewer`, `viewerAusSession`, `viewerOderNull`, `istRadioAdmin`,
  `verwaltungsZiel`, `requireRadioAdmin`. **Z6** ruft `requireRadioAdmin` in beiden Hüllen;
  **Planteil 4** ruft ihn in **jeder** Verwaltungs-Action; **Planteil 3** ruft
  `istRadioAdmin(await viewerOderNull())` für den `/admin`-Link auf der Ausleihfläche
  (Spec:2919-2920) — **nicht** `requireRadioAdmin()`. ⬜ **L7** hängt an `verwaltungsZiel` +
  dem `redirect()` in `requireRadioAdmin`.

⛔ **Zwei Rechtestufen sind entschieden (C.6 / B4, Ruben, 2026-08-21), aber Planteil 2 baut nur
EINE.** Diese Aufgabe muss die zweite **vorsehen**, ohne sie zu bauen — und der Unterschied ist
kein Wortspiel: Spec:191 sagt ausdrücklich, wer `radio` später eine Updater-Stufe gibt, „baut sie
modulintern — **das ist nicht Sache dieses Kapitels**", und Spec:4421 legt sie in eine eigene Datei
`_lib/rollen.ts` mit eigenem Test. **Vorsehen heißt hier: die Naht offenhalten und den einen Weg
verriegeln, auf dem Planteil 4 sie versehentlich in `istRadioAdmin` hineinbauen könnte.**
Siehe Schritt 3.

⚠️ **DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht angenommen.**
(Fund W2 der Prüfung zu Z2, eingearbeitet am 2026-08-22.) In diesem Repo lädt vitest **keine**
`.env`-Datei: `grep -rn "dotenv" vitest.config.ts vitest.setup.ts package.json` hat **keinen**
Treffer, und eine Sonde las `SUITE_HOST_FILES`/`SUITE_HOST_LAGERBUCH` im Lauf als `undefined`,
obwohl `.env.local:41` und `:58` beide setzen. **Folge für diese Aufgabe:** ein lokal in
`.env.local` gesetztes `SUITE_ADMIN_GROUP_RADIO` verfälscht **kein** Tor — ein in der Shell oder in der CI
**exportierter** Wert dagegen schon (gemessen: `env SUITE_HOST_PORTAL=radio.localtest.me rtk pnpm
vitest run src/app/m/radio/_lib/routen.test.ts` → `20 failed | 5 passed`; `moduleForHost` läuft
`MODULES` der Reihe nach ab, `registry.ts:246-253`, und `portal` `:57` steht vor `radio` `:192`).
⛔ Wo ein Prüffall die Umgebung braucht, gehört sie wie in `src/core/registry.test.ts` als
**Parameter** hinein (`OHNE_ENV = {}`), **nicht** aus `process.env` gelesen.

- [ ] **Schritt 1: `_lib/zugang.ts` schreiben**

```ts
// src/app/m/radio/_lib/zugang.ts
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { adminGroupsFor } from "@/core/groups";
import { getModule, prodHostsFor } from "@/core/registry";
import { resolveHost } from "@/core/routing";
import { istRadioHost, requireRadioHost } from "./host";

/**
 * DER ZUGANG ZUR VERWALTUNG (Spec 1 §1.5, Zeilen 637-701). KEIN "use client" (Falle 6).
 *
 * ZWEI FORMEN, EINE REGEL: der werfende Riegel `requireRadioAdmin` gehoert in die beiden
 * Verwaltungs-Layouts und in JEDE Verwaltungs-Action; das nicht-werfende Paar
 * `viewerOderNull` + `istRadioAdmin` gehoert dorthin, wo „keine Sitzung" ein DRITTER
 * gueltiger Fall ist und kein Fehlerfall — namentlich an den /admin-Link auf der
 * Ausleihflaeche (Spec:2919-2920, Planteil 3).
 *
 * ⚠️ DIE GRENZE GEHOERT ZUR REGEL: „Praedikat in Weichen" gilt NICHT fuer `_actions/`.
 * Eine Action hat keine Weiche — sie hat einen Aufrufer, der schon entschieden hat. Der
 * Guard-Scan dafuer liegt in `_actions/guards.test.ts` (Kapitel 3 §3.8, Planteil 3) und
 * ausdruecklich NICHT in `riegel.test.ts` (korrigiert, B14, Spec:103/714).
 */

/**
 * DREI FELDER, NICHT VIER — und der Name ist `RadioViewer`, nicht `Viewer`.
 *
 * ⚠️ DIE SPEC WIDERSPRICHT SICH HIER UND LOEST ES NICHT AUF. Spec:648 schreibt
 * `RadioViewer` mit `{ sub, name, groups }`; Spec:2794 schreibt `Viewer` mit
 * `{ sub, groups, name, email }` (Spec:2793 ist der Dateikommentar darueber). Kein A-
 * oder B-Punkt behandelt den Unterschied.
 *
 * ENTSCHIEDEN ZUGUNSTEN VON KAPITEL 1, aus einem GEMESSENEN Grund und nicht aus
 * Rangfolge: `lagerbuch`s vierfeldriger `Viewer` existiert, weil `merkeNutzer` `name` UND
 * `email` in `users` schreibt (src/app/m/lagerbuch/_lib/zugang.ts:32-38). Die
 * `users`-Tabelle von `radio` hat DREI Spalten und KEINE E-Mail
 * (`src/app/m/radio/_db/schema.ts:113-117`: `sub`, `name`, `lastSeenAt`). Ein
 * `email`-Feld haette in diesem Modul heute keinen Konsumenten — und ein Feld ohne
 * Konsument ist eine Zusage ohne Traeger.
 *
 * ⬜ Braucht Planteil 4 spaeter eine E-Mail, ist das eine Schema-Aenderung (neue Spalte,
 * neue Migration) UND eine Erweiterung hier — nicht nur hier.
 *
 * ⬜ UND EINE ZWEITE, HEUTE SCHON MESSBARE KOLLISION, die Planteil 4 aufloesen muss:
 * `name` ist hier `string | null`, `radio`s Spalte ist `.notNull()`
 * (`src/app/m/radio/_db/schema.ts:115`). `lagerbuch` traegt denselben Fall, weil seine
 * Spalte nullable ist (`src/app/m/lagerbuch/_db/schema.ts:438`: `name: text("name")`) —
 * `radio` traegt ihn NICHT. Wer in Planteil 4 `merkeNutzer(getDb(), viewer)` nachtraegt
 * (Spec:4349, Begruendung Spec:4358-4360), braucht deshalb einen BENANNTEN Rueckfall fuer
 * `name === null` ODER eine Migration, die die Spalte nullable macht. Die Wahl gehoert
 * Planteil 4, die Kollision nicht: sie steht heute schon da.
 */
export type RadioViewer = { sub: string; name: string | null; groups: string[] };

/**
 * Sitzung -> Viewer, OHNE Wurf und OHNE IO — damit der Test sie ohne `auth()`-Mock fahren
 * kann (Spec:650).
 *
 * Ohne `user.id` gibt es keinen Viewer; ein fehlender `groups`-Claim ist die LEERE MENGE
 * und laeuft damit in den 404 des Riegels, nicht in einen 500 — sonst haenge die
 * Fehlerform an der Token-Version (src/app/m/lagerbuch/_lib/zugang.ts:40-42).
 */
export function viewerAusSession(
  session: { user?: { id?: string; groups?: string[]; name?: string | null } } | null,
): RadioViewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return {
    sub: id,
    name: session.user?.name ?? null,
    groups: session.user?.groups ?? [],
  };
}

/**
 * DIE NICHT-WERFENDE FORM — fuer das Gate und fuer den /admin-Link der Ausleihflaeche.
 *
 * ⛔ SIE RUFT `requireRadioHost` ABSICHTLICH NICHT (Spec §1.4.4, Gegenregel, Zeilen
 * 595-607). Das Gate ist die Flaeche, die eine ANONYME Person zuerst sieht;
 * `requireRadioAdmin()` an ihrer Weiche schickte jeden anonymen Aufruf nach /login statt
 * aufs Gate — genau der Ausfall, den `requiresAuth: false` verhindern soll. Und ein
 * Host-Riegel HIER machte aus der Sichtbarkeitsfrage eine Sperre.
 *
 * ⚠️ `riegel.test.ts` (Klausel d) haelt diese Abwesenheit als Quelltext-Zusicherung fest —
 * sie ist die einzige Aussage dieser Datei, die man nicht durch Aufrufen beweisen kann.
 */
export async function viewerOderNull(): Promise<RadioViewer | null> {
  return viewerAusSession(await auth());
}

/**
 * DAS PRAEDIKAT — `adminGroupsFor(getModule("radio"))` + `.some()`, selbst gebaut.
 *
 * ⛔ BEWUSST NICHT `isModuleAdmin` AUS `core/groups` und keiner seiner drei Verwandten
 * (Kapitel-4-Pflicht 17, docs/radio-portierung-analyse.md:979-997). Alle vier tragen den
 * Suite-Admin-Kurzschluss — `src/core/groups.ts:125` steigt woertlich mit
 * `if (groups.includes(suiteAdminGroup(env))) return true;` aus. Ein Import saehe wie
 * Wiederverwendung aus.
 *
 * DER ANLASS IST MODULEIGEN: hinter /admin liegen Klarnamen samt Bewegungshistorie und
 * die Enrollment-Codes. Betrieb und Einsicht sind zwei Rollen; wer den Server betreibt,
 * hat damit noch keinen Anlass, die Bewegungen einer Bereitschaft zu lesen oder
 * Zugangscodes zu drucken. Wer `radio` verwalten soll, gehoert in das, was
 * SUITE_ADMIN_GROUP_RADIO benennt — auch der Betreiber selbst (Entscheidung 9).
 *
 * `canAdminModule` ist dabei der teuerste der vier: es ist die hausuebliche
 * SICHTBARKEITSfrage und zeigte dem Suite-Admin einen Verwaltungs-Eintrag, dessen Ziel
 * `requireRadioAdmin` mit 404 beantwortet — genau der Zustand, den
 * `docs/design/README.md:420` ausschliesst („fuehrt KEIN Weg dorthin, wo die aufrufende
 * Person nicht hindarf?").
 *
 * `adminGroupsFor(mod)`, NIE `mod.adminGroups` — der direkte Feldzugriff macht
 * SUITE_ADMIN_GROUP_RADIO an genau dieser Stelle wirkungslos (src/core/registry.ts:29-35
 * schreibt dieselbe Falle fuer prodHosts aus). Und NIE `canAccess`: das gewaehrt bei
 * leerer Liste `true` (`src/core/registry.ts:263`) und steigt unter `requiresAuth: false`
 * ohnehin sofort aus (`:260`).
 *
 * ⚠️ `.some()` AUF LEERER LISTE GEWAEHRT NICHTS — das ist richtig und es ist Falle 23:
 * ein LEER gesetztes SUITE_ADMIN_GROUP_RADIO sperrt damit JEDEN aus, den Betreiber
 * eingeschlossen, und wird NICHT gemeldet (docs/radio-portierung-analyse.md:1547-1576).
 * Die Abhilfe ist eine Runbook-Zeile, kein Zweig hier: ein „leer bedeutet alle"-Zweig
 * waere die Sperre, die sich selbst abschaltet.
 *
 * ⬜ DIE ZWEITE RECHTESTUFE (Updater) WIRD HIER NICHT GEBAUT — ABER SIE IST VORGESEHEN.
 * Entschieden ist sie (C.6 / B4, 2026-08-21: zwei Rollen wie im Bestand); gebaut wird sie
 * in PLANTEIL 4. Spec:191 sagt es ausdruecklich: wer `radio` eine zweite Rolle gibt,
 * „baut sie modulintern — das ist nicht Sache dieses Kapitels".
 * ⚠️ DAS ZITAT TRAEGT NUR SO WEIT WIE SEINE FUNDSTELLE (REVIEW-Z4, Fund K5): Spec:191 ist
 * die `requiredGroups`-Zeile der Registry-Tabelle, der Satz gilt dort EINEM Weg — dem
 * Zweckentfremden von `SUITE_ACCESS_GROUP_RADIO` —, nicht der Updater-Stufe allgemein. Die
 * tragende Fundstelle fuer „nicht hier, sondern Planteil 4" ist Spec:4420-4422 — sie steht
 * in diesem Kommentar wenige Zeilen tiefer, an der GRUPPENQUELLE.
 *
 * ⚠️ ZWEI DINGE, DIE MAN LEICHT VERWECHSELT, UND DIE SPEC TRENNT SIE:
 *   - die GRUPPENQUELLE `SUITE_UPDATER_GROUP_RADIO` samt Feld-Allowlist liegt in einer
 *     EIGENEN Datei mit eigenem Test — `_lib/rollen.ts` / `_lib/rollen.test.ts`
 *     (Spec:4420-4422). Das ist Planteil 4.
 *   - der ZUGRIFFSRIEGEL beider Stufen liegt in DIESER Datei: Spec:4287-4288 fuehrt
 *     `requireRadioAdmin` UND `requireRadioVerwaltung` (werfend) sowie `istRadioAdmin`
 *     UND `istRadioUpdater` (Praedikate) unter `zugang.ts`. Planteil 4 traegt sie HIER
 *     nach — die Naht ist also hier, nicht woanders.
 *
 * ⛔ AUFLAGE AN PLANTEIL 4, DAMIT DIE NAHT NICHT ZUR AUFWEICHUNG WIRD: die zweite Stufe
 * kommt als ZWEITE FUNKTION dazu (`requireRadioVerwaltung`, `istRadioUpdater`), NICHT als
 * `||` in `istRadioAdmin`. Spec:4367 setzt `admin/(arbeit)/layout.tsx` auf
 * `requireRadioVerwaltung()`, Spec:4368 laesst `admin/(druck)/layout.tsx` bei
 * `requireRadioAdmin()`, und Spec:4369-4378 verteilt die zehn Seiten einzeln.
 * ⛔ DABEI BLEIBEN DREI DER ZEHN AUF `requireRadioAdmin()` — `admin/(arbeit)/versionen`
 * (Spec:4376), `admin/(arbeit)/zugaenge` (Spec:4377) und `admin/(druck)/zugaenge/blatt`
 * (Spec:4378); sie tragen die Zugangscodes. Wer nur `Spec:4369-4375` liest, setzt
 * `requireRadioVerwaltung()` auf ALLE zehn und senkt genau die drei Flaechen ab,
 * derentwegen `riegel.test.ts` (Klausel a) ueberhaupt pfadsensitiv gebaut ist. Klausel (a)
 * laesst im Arbeits-Zweig beide Namen zu; die Aufweichung dagegen faengt `zugang.test.ts`
 * ab. ⚠️ Auf der ACTION-Achse gilt dasselbe: Spec:4380 sagt „`requireRadioVerwaltung()`
 * BZW. `requireRadioAdmin()`", nicht „immer der eine".
 *
 * Der Gruppenname ist ⬜ E1b
 * (docs/superpowers/plans/SPERREN-radio-spec2.md:110), der Bestand nennt als Default
 * `personal` (radio-admin/.env.example:15) — beides ist HIER kein Wert, sondern ein
 * Verweis.
 *
 * ⛔ UND DIE RICHTUNG, IN DER DIESE FUNKTION NICHT WACHSEN DARF: `istRadioAdmin` bleibt
 * die ADMIN-Stufe. Im Bestand gewinnt `admin` bei Ueberschneidung, und `updater` ist
 * STRIKT WENIGER: `mapGroupsToRole` gibt `admin` vor `updater`
 * (radio-admin/shared/src/role.ts:3-10, Faelle in role.test.ts:4-33); ELF Routen sind
 * hart admin-only ueber `requireRole('admin')` — radio-admin/server/src/routes/
 * devices.ts:99,188, softwareVersions.ts:30,40,48,56, loans.ts:28, tokens.ts:22,44,47,
 * export.ts:71 —, und der Rest wird ueber die FELD-Allowlist in
 * shared/src/editable-fields.ts:1-18 gefiltert, nicht ueber eine zweite Routensperre.
 * ⚠️ Ein `grep` auf `requireRole('admin')` unter `radio-admin/server/src/routes/` liefert
 * ZWOELF Zeilen; die zwoelfte (export.ts:66) steht in einem Kommentar und ist keine Route.
 * ⚠️ In `role.ts`/`role.test.ts` steht nur die Rangfolge; `requireRole` kommt dort NICHT
 * vor. Wer die Updater-Gruppe hier mit `||` danebenstellt, macht aus einer Verfeinerung
 * eine AUFWEICHUNG: jeder Updater kaeme dann durch jeden Admin-Riegel, und
 * `pnpm typecheck`, `pnpm lint` und `pnpm build` blieben gruen. `zugang.test.ts` haelt
 * diese eine Richtung fest.
 */
export function istRadioAdmin(viewer: RadioViewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("radio"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * DIE EINZIGE STELLE, AN DER FALLE 23 UEBERHAUPT SICHTBAR WIRD.
 *
 * Spec:206-210 verlangt sie ausdruecklich und nennt sie so: „Das gehoert als Zeile in die
 * `.env.example` und ins Runbook — UND ALS PROTOKOLLZEILE IN DEN RIEGEL SELBST:
 * `meldeFehlendeGruppe` aus 1.5 ist die einzige Stelle, an der dieser Zustand ueberhaupt
 * sichtbar wird." Die Bauform steht ausgeschrieben in Spec:4348.
 *
 * ⚠️ DER ZUSTAND, DEN SIE SICHTBAR MACHT, IST GUELTIGE KONFIGURATION: ein leer gesetztes
 * SUITE_ADMIN_GROUP_RADIO wird von `validateGroupConfig` NICHT gemeldet
 * (src/core/groups.ts:156, begruendet :136-140), und `.some()` auf leerer Liste gewaehrt
 * nichts. Kein Test kann das verhindern; ohne diese Zeile gibt es aber auch KEIN Signal —
 * die Verwaltung antwortet dann stumm mit 404, fuer jeden, den Betreiber eingeschlossen.
 *
 * Form 1:1 aus `src/app/m/lagerbuch/_lib/zugang.ts:135-151` (Begruendung dort
 * :118-134): dedupliziert ueber einen prozess-lokalen Set, damit ein Abweisungssturm das
 * Protokoll nicht flutet. ⛔ KEINE Kennung, keine E-Mail, kein Name in der Zeile — der
 * `sub` dient AUSSCHLIESSLICH als Dedup-Schluessel im Speicher und steht nicht in der
 * Ausgabe.
 *
 * ⚠️ ANNAHME, wie dort: der Set waechst mit der Zahl abgewiesener PERSONEN, nicht mit der
 * Zahl der Anfragen — bei einer Organisation dieser Groesse eine dreistellige Obergrenze
 * ohne Verdraengungsbedarf.
 */
const bereitsGemeldet = new Set<string>();

function meldeFehlendeGruppe(sub: string, gruppen: string[]): void {
  if (bereitsGemeldet.has(sub)) return;
  bereitsGemeldet.add(sub);
  console.warn(
    `[radio] Zugriff auf /admin abgelehnt: keine der Gruppen ` +
      `${JSON.stringify(adminGroupsFor(getModule("radio")))} in den Token-Gruppen ` +
      `${JSON.stringify(gruppen)}. Pruefe SUITE_ADMIN_GROUP_RADIO und ob Pocket ID ` +
      `einen "groups"-Claim mit dieser Gruppe ausliefert.`,
  );
}

/**
 * Nur fuer Tests: den prozess-lokalen Dedup-Speicher leeren (Vorbild
 * `src/app/m/lagerbuch/_lib/zugang.ts:148-151`).
 *
 * ⬜ HEUTE OHNE AUFRUFER, UND DAS STEHT HIER BENANNT STATT BEHAUPTET (REVIEW-Z4, Fund K1).
 * In Planteil 2 faehrt KEIN Fall `requireRadioAdmin` — die Auslassung ist angeordnet und in
 * `src/app/m/radio/_lib/zugang.test.ts:7-11` ausgeschrieben. Der Konsument kommt mit
 * PLANTEIL 4, wo die erste Verwaltungsseite steht und die Verhaltensfaelle nach
 * `lagerbuch`-Vorbild dazukommen: dort braucht der erste Fall ihn ZWISCHEN zwei
 * Abweisungen, sonst schluckt der Dedup-Speicher die zweite Protokollzeile und der Fall
 * saehe null statt einem Aufruf. Der Weg ist im Vorbild vorgefuehrt —
 * `src/app/m/lagerbuch/_lib/zugang.test.ts:41` (Import), `:72` (Aufruf), Begruendung
 * `:60-71`; dort hat genau dieser Weg einen ECHTEN Fehlschlag gefunden.
 */
export function _resetGemeldeteGruppen(): void {
  bereitsGemeldet.clear();
}

/**
 * ABSOLUTES ZIEL FUER DIE `callbackUrl` DER SUITE-ANMELDUNG: `<proto>://<host>/admin`.
 *
 * Warum absolut und nicht `/admin`: die Anmeldung laeuft ueber den SUITE-Pfad `/login`
 * (Passthrough, Spec:354-358), und ein relatives Ziel loeste sich dort gegen den
 * Anmelde-Host auf, nicht gegen den Radio-Host.
 *
 * Reihenfolge der Herleitung, 1:1 aus `src/app/m/lagerbuch/_lib/zugang.ts:205-214`: der
 * konfigurierte Prod-Host gewinnt; fehlt er (vor dem Cutover der Normalfall), gilt der
 * ANGEFRAGTE Host — aber nur, wenn er der Radio-Host ist; sonst bleibt der interne Pfad.
 *
 * ⛔ `istRadioHost` IST HIER RICHTIG, `requireRadioHost` WAERE FALSCH. Die Funktion
 * beantwortet die Frage „darf ich den angefragten Host in eine absolute URL schreiben?",
 * wirft nicht, und ist deshalb kein Verstoss gegen die Gegenregel aus §1.4.4. Wer hier die
 * werfende Form einsetzt, macht aus der callbackUrl-Berechnung eine zweite Sperre — und
 * `requireRadioAdmin` hat seinen Host-Riegel schon eine Zeile vorher. Und wer stattdessen
 * `resolveHost` ein zweites Mal auswertet, baut die zweite Host-Aufloesung, vor der
 * `./host.ts` in seinem Kopf warnt.
 *
 * EXPORTIERT, obwohl ausser dem Test und `requireRadioAdmin` niemand sie ruft: nur so ist
 * der Zweig „Prod-Host vs. angefragter Host" pruefbar, ohne einen `redirect()`-Wurf zu
 * zerlegen.
 *
 * ⬜ L7 haengt an dieser Funktion UND am `redirect()` unten: der vollstaendige
 * `Location`-Kopf — Statuscode (307 oder 302) sowie Protokoll und Host — wird beim
 * Cutover abgelesen (docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md:2091),
 * NICHT hier. `redirect()` waehlt den Code zur Laufzeit; ein hier festgeschriebenes „302"
 * waere eine Zusage ueber eine Bauform, die Spec 1 nicht festlegt.
 */
export function verwaltungsZiel(headersEingang: Headers): string {
  const angefragt = resolveHost(headersEingang);
  const host =
    prodHostsFor(getModule("radio"))[0] ??
    (istRadioHost(headersEingang) ? angefragt.split(":")[0] : undefined);
  if (!host) return "/m/radio/admin";
  const proto = headersEingang.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  const port = angefragt.split(":")[1];
  return `${proto}://${host}${port ? `:${port}` : ""}/admin`;
}

/**
 * DER AUTH-BACKSTOP DES MODULS — eine Stelle, zwei Aufrufergruppen: die beiden
 * Verwaltungs-Layouts (Z6) und JEDE Verwaltungs-Action (Planteil 4).
 *
 * ⚠️ DIE HOST-ZEILE STEHT HIER ZUSAETZLICH, NICHT ERSATZWEISE (Spec:669-673, Schicht iii).
 * Die Layouts rufen `requireRadioHost` ohnehin, aber diese Funktion wird auch aus SERVER
 * ACTIONS gerufen, und die haben KEIN Layout ueber sich. Der doppelte Aufruf kostet einen
 * Header-Lookup. FUER DIE VERWALTUNG IST DAS KEIN AUTORISIERUNGSGEWINN (das Praedikat ist
 * host-blind und vollstaendig: eine Admin-Action auf fremdem Host verlangt dieselbe
 * Gruppe wie auf der eigenen Domain), sondern die Vermeidung einer ZWEITEN
 * FUNKTIONIERENDEN HERKUNFT des Moduls. ⛔ Wer sie fuer doppelt haelt und entfernt,
 * oeffnet genau diese Luecke (Kapitel-4-Pflicht 16,
 * docs/radio-portierung-analyse.md:973-977).
 *
 * ERST DER HOST, DANN DIE PERSON. So verraet ein anonymer Aufruf auf einem fremden Host
 * die Verwaltungsroute nicht ueber einen vorgeschalteten Login-Umweg.
 *
 * `notFound()` STATT 403 (Spec:691-694, §1.5): was nicht freigegeben ist, sieht in dieser
 * Suite genauso aus wie etwas, das es nicht gibt. `/admin/kein-zugriff` gibt es NICHT
 * (Spec:694/2838), und `/403` aus dem Alt-Bestand (radio-admin/server/src/auth/routes.ts:76)
 * wandert NICHT mit — es ist kein Muster dieser Suite.
 *
 * ⛔ DIE PROTOKOLLZEILE VOR DEM `notFound()` IST PFLICHT, NICHT KUER (Spec:206-210,
 * Bauform ausgeschrieben in Spec:4348). Sie ist die einzige Stelle, an der ein LEER
 * gesetztes SUITE_ADMIN_GROUP_RADIO ueberhaupt sichtbar wird — ohne sie antwortet die
 * Verwaltung stumm mit 404, und die naechste Person sucht den Fehler im Modul statt in
 * der `.env`.
 *
 * ⚠️ FRISCHE: BIS ZU EINE STUNDE VERZUG. Gruppen im JWT sind nur so frisch wie der letzte
 * erfolgreiche Token-Refresh; der Takt ist die Access-Token-Lebensdauer von Pocket ID,
 * nicht die Sitzungsdauer von 30 Tagen (`CLAUDE.md:151-156`, von Spec:698 dafuer zitiert).
 * Der Verzug wird HINGENOMMEN.
 *
 * ⬜ `merkeNutzer` STEHT HIER BEWUSST NICHT (Nachtrag NT-Z5, Nahtstelle NS-Z7). Kapitel 1
 * §1.5 (Spec:669-673) fuehrt `requireRadioAdmin` in FUENF Schritten ohne den Schreiber,
 * Kapitel 5 (Spec:4349) in SECHS mit ihm; kein A-/B-Punkt loest das auf. Planteil 2 baut
 * die Kapitel-1-Fassung, WEIL ES IN DIESEM PLANTEIL KEINEN LESER VON `users` GIBT.
 * ⛔ Planteil 4 traegt `merkeNutzer(getDb(), viewer)` NACH dem Riegel nach, sonst rendert
 * jede Ereigniszeile eine nackte UUID (Spec:4358-4360) — und stolpert dabei ueber die
 * `notNull()`-Kollision, die oben bei `RadioViewer` benannt ist.
 */
export async function requireRadioAdmin(): Promise<RadioViewer> {
  const kopf = await headers();
  requireRadioHost(kopf);                       // erst der Host, dann die Person
  const viewer = viewerAusSession(await auth());
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`);
  if (!istRadioAdmin(viewer)) {
    meldeFehlendeGruppe(viewer.sub, viewer.groups);   // Spec:206-210 — die einzige Sicht
    notFound();                                       // NICHT 403
  }
  return viewer;
}
```

⚠️ **`merkeNutzer` steht hier bewusst NICHT**, und die Abweichung ist jetzt deklariert: **NT-Z5** in
der Nachtragstabelle und die Nahtstelle **NS-Z7** an Planteil 4. Kapitel 1 §1.5 (Spec:669-673) führt
`requireRadioAdmin` in fünf Schritten **ohne** den Schreiber, Kapitel 5 (Spec:4349) in sechs **mit**;
kein A-/B-Punkt löst das auf. Planteil 2 baut die Kapitel-1-Fassung, **weil es in diesem Planteil
keinen Leser von `users` gibt**. ⛔ **Planteil 4 trägt `merkeNutzer(getDb(), viewer)` NACH dem Riegel
nach**, sonst rendert jede Ereigniszeile eine nackte UUID (Spec:4358-4360).

⚠️ **Gegen die Z5-Scans gegengeprüft, damit dieser Rumpf sie nicht auf ihrer eigenen Begründung rot
macht** — `trefferAuf` leert Kommentare, **nicht** Zeichenketten, der Wortlaut der Meldung zählt also
mit: `meldeFehlendeGruppe` ruft `adminGroupsFor(` ohne führenden Punkt (kein Treffer auf
`/\.adminGroups\b/`), und weder Code noch Meldungstext enthält die Zeichenfolge `isAdmin` an einer
Wortgrenze (`SUITE_ADMIN_GROUP_RADIO` und `istRadioAdmin` lösen `/\bisAdmin\b/` nicht aus).

⛔ **`verwaltungsZiel` ruft `istRadioHost` — die PRÄDIKATS-Form, nicht `requireRadioHost`.** Das ist
kein Riegel: die Funktion beantwortet die Frage „darf ich den angefragten Host in eine absolute URL
schreiben?", wirft nicht, und ist deshalb auch kein Verstoß gegen die Gegenregel aus §1.4.4. ⚠️ Wer
hier die werfende Form einsetzt, macht aus der `callbackUrl`-Berechnung eine zweite Sperre — und
`requireRadioAdmin` hat seinen Host-Riegel schon eine Zeile vorher. **Und wer stattdessen
`resolveHost` ein zweites Mal auswertet, baut die zweite Host-Auflösung, vor der `_lib/host.ts` in
seinem Kopf warnt.**

- [ ] **Schritt 2: `_lib/zugang.test.ts` schreiben — die reinen Fälle, ohne `auth()`-Mock**

```ts
// src/app/m/radio/_lib/zugang.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { viewerAusSession, istRadioAdmin, verwaltungsZiel, type RadioViewer } from "./zugang";

/**
 * NUR DIE REINEN FUNKTIONEN — kein `auth()`-Mock, kein `headers()`-Mock (Spec:650).
 *
 * `requireRadioAdmin` und `viewerOderNull` sind hier ABSICHTLICH nicht geprueft: beide
 * brauchen den Next-Anfragekontext, und ein Mock davon prueft den Mock. Was an ihnen
 * pruefbar IST, ist ihre BAUFORM — und die haelt `riegel.test.ts` (Z5) als
 * Quelltext-Zusicherung: die Reihenfolge Host-vor-Person und die Abwesenheit des
 * Host-Riegels in `viewerOderNull`.
 *
 * ⬜ Ihre WIRKUNG (Statuscode und Location-Kopf) ist ⬜ L7 und wird beim Cutover
 * abgelesen (docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md:2091), nicht hier.
 */
const viewer = (groups: string[]): RadioViewer => ({ sub: "u-1", name: "Test Person", groups });
const kopf = (h: Record<string, string>) => new Headers(h);

/**
 * ⛔ DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht
 * angenommen: in diesem Repo laedt vitest KEINE `.env`-Datei (kein `dotenv` in
 * `vitest.config.ts`, `vitest.setup.ts` oder `package.json`). Ein lokal gesetztes
 * SUITE_ADMIN_GROUP_RADIO verfaelscht damit kein Tor — ein in der Shell oder in der CI
 * EXPORTIERTER Wert dagegen schon.
 *
 * Deshalb loescht `beforeEach` alle drei Variablen VOR jedem Fall, statt sich darauf zu
 * verlassen, dass der Prozess sie nicht mitbringt. `zuruecksetzen()` in `finally` stellt
 * den Ausgangszustand des Prozesses wieder her; die Form ist `try/finally` und nicht
 * `afterEach`, weil hier drei Variablen nebeneinanderstehen und ein Fall, der eine davon
 * setzt, die anderen nicht in einem Zwischenzustand hinterlassen darf. Vitest faehrt
 * Dateien parallel, Faelle INNERHALB einer Datei aber seriell.
 *
 * (Dieselbe Bauform wie `src/app/m/radio/_lib/host.test.ts:29-36`, dort fuer eine
 * Variable.)
 */
const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const alterHost = process.env.SUITE_HOST_RADIO;
const zuruecksetzen = () => {
  for (const [name, wert] of [
    ["SUITE_ADMIN_GROUP_RADIO", alterAdmin],
    ["SUITE_UPDATER_GROUP_RADIO", alterUpdater],
    ["SUITE_HOST_RADIO", alterHost],
  ] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
};
beforeEach(() => {
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_UPDATER_GROUP_RADIO;
  delete process.env.SUITE_HOST_RADIO;
});

describe("viewerAusSession — reine Abbildung, ohne IO", () => {
  it("ohne user.id gibt es keinen Viewer", () => {
    expect(viewerAusSession(null)).toBeNull();
    expect(viewerAusSession({})).toBeNull();
    expect(viewerAusSession({ user: {} })).toBeNull();
  });

  it("ein fehlender groups-Claim ist die LEERE MENGE, kein Absturz", () => {
    // Sonst haenge die Fehlerform an der Token-Version: ein alter Token ohne `groups`
    // ergaebe 500 statt 404 (src/app/m/lagerbuch/_lib/zugang.ts:40-42).
    expect(viewerAusSession({ user: { id: "u-1" } })).toEqual({ sub: "u-1", name: null, groups: [] });
  });

  it("uebernimmt name, aber KEINE E-Mail — die users-Tabelle hat keine Spalte dafuer", () => {
    // `src/app/m/radio/_db/schema.ts:113-117`: sub, name, last_seen_at. Drei Felder,
    // drei Spalten.
    const v = viewerAusSession({ user: { id: "u-1", name: "A. Person", groups: ["g"] } });
    expect(v).toEqual({ sub: "u-1", name: "A. Person", groups: ["g"] });
    expect(Object.keys(v!).sort()).toEqual(["groups", "name", "sub"]);
  });
});

describe("istRadioAdmin — das Praedikat", () => {
  it("ohne Viewer: false", () => {
    expect(istRadioAdmin(null)).toBe(false);
  });

  it("mit der Registry-Vorgabegruppe: true", () => {
    // Das Env-Loeschen leistet das beforeEach oben (kein zweites hier, es waere tot).
    // Die Vorgabe steht in `src/core/registry.ts:193` (`adminGroups: ["iuk-radio-admin"]`).
    try {
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(true);
    } finally { zuruecksetzen(); }
  });

  it("SUITE_ADMIN_GROUP_RADIO greift — das Registry-Feld allein entscheidet NICHT", () => {
    /*
     * Der direkte Feldzugriff `mod.adminGroups` machte die Variable an genau dieser
     * Stelle wirkungslos, und der Fehler waere still: eine Instanz mit anders benannten
     * SSO-Gruppen liefe mit einem Riegel, der niemanden durchlaesst.
     * (`src/core/registry.ts:29-35` schreibt dieselbe Falle fuer `prodHosts` aus.)
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "leitung";
      expect(istRadioAdmin(viewer(["leitung"]))).toBe(true);
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("mit LEERER Admin-Liste: false — das .some()-Argument, und es ist Falle 23", () => {
    /*
     * `.some()` auf leerer Liste gewaehrt nichts. Das ist die richtige Richtung und
     * zugleich die stille Aussperrung: SUITE_ADMIN_GROUP_RADIO= (leer) ist eine GUELTIGE
     * Aussage und wird nicht gemeldet (docs/radio-portierung-analyse.md:1547-1576).
     * ⛔ Ein „leer bedeutet alle"-Zweig waere die Sperre, die sich selbst abschaltet.
     *
     * ⚠️ DER PRUEFGEGENSTAND IST EINE ABWESENHEIT — dieser Zweig existiert nicht. Die
     * Mutationssonde dazu ist deshalb eine EINFUEGUNG, keine Entfernung (V-Z2-1).
     */
    try {
      process.env.SUITE_ADMIN_GROUP_RADIO = "";
      expect(istRadioAdmin(viewer(["iuk-radio-admin"]))).toBe(false);
      expect(istRadioAdmin(viewer([]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("ein Viewer mit NUR dashboard-admins: false — der Suite-Admin bekommt keine Radio-Rechte", () => {
    /*
     * Entscheidung 9 und Kapitel-4-Pflicht 17. `src/core/groups.ts:125` liesse ihn durch
     * (`if (groups.includes(suiteAdminGroup(env))) return true;`) — deshalb ist
     * `isModuleAdmin` hier NICHT die Quelle. `dashboard-admins` ist der Default von
     * ADMIN_GROUP (src/core/groups.ts:96-97).
     *
     * ⚠️ OHNE DIESEN FALL waere ein Umbau auf `isModuleAdmin` GRUEN — er sieht wie
     * Wiederverwendung aus und oeffnet /admin fuer jeden Suite-Betreiber. Genau das haelt
     * `src/app/m/lagerbuch/_lib/bauform.test.ts:230-249` mit einem Quelltext-Scan fest;
     * hier steht zusaetzlich die VERHALTENSaussage.
     *
     * Das Env-Loeschen leistet das beforeEach oben.
     */
    try {
      expect(istRadioAdmin(viewer(["dashboard-admins"]))).toBe(false);
    } finally { zuruecksetzen(); }
  });

  it("ein Viewer mit NUR der Updater-Gruppe: false — die zweite Stufe weicht die erste NICHT auf", () => {
    /*
     * ⛔ DIE NAHT FUER PLANTEIL 4, ALS RIEGEL FORMULIERT (Betreiberentscheidung C.6 / B4,
     * 2026-08-21: zwei Rollen wie im Bestand).
     *
     * Planteil 4 baut die Updater-Stufe in `_lib/rollen.ts` (Spec:4420-4422), lesend aus
     * SUITE_UPDATER_GROUP_RADIO. Der naheliegende, falsche Weg dorthin ist, die Gruppe
     * HIER mit `||` danebenzustellen — das saehe nach „zwei Rollen" aus und waere eine
     * AUFWEICHUNG: jeder Updater kaeme durch jeden Admin-Riegel, und typecheck, lint und
     * build blieben alle drei gruen.
     *
     * Im Bestand ist die Rangfolge eindeutig: `mapGroupsToRole` gibt `admin` VOR
     * `updater` und `null` bei keinem Treffer (radio-admin/shared/src/role.ts:3-10);
     * `requireRole('admin')` sperrt ELF Routen hart — radio-admin/server/src/routes/
     * devices.ts:99,188, softwareVersions.ts:30,40,48,56, loans.ts:28, tokens.ts:22,44,47,
     * export.ts:71 —, und die eigentliche Differenzierung sitzt im FELD-Filter
     * `filterEditableFields`, nicht im Routing
     * (radio-admin/shared/src/editable-fields.ts:1-18). ⚠️ `role.ts` und `role.test.ts`
     * belegen NUR die Rangfolge; `requireRole` kommt dort nicht vor. ⚠️ Ein `grep` auf
     * `requireRole('admin')` liefert ZWOELF Zeilen — die zwoelfte, export.ts:66, ist ein
     * Kommentar, keine Route.
     *
     * ⬜ E1b: wie die Gruppe wirklich heisst, weiss nur der Betreiber
     * (docs/superpowers/plans/SPERREN-radio-spec2.md:110 — verfolgtes Dokument, nicht die
     * git-ignorierte Kladde unter `.superpowers/sdd/`). Dieser Fall setzt deshalb einen
     * FREI GEWAEHLTEN Wert und prueft die Richtung, nicht den Namen.
     *
     * ⚠️ DER PRUEFGEGENSTAND IST EINE ABWESENHEIT — das `||` existiert nicht. Die
     * Mutationssonde dazu ist deshalb eine EINFUEGUNG, keine Entfernung (V-Z2-1).
     * Das Env-Loeschen von SUITE_ADMIN_GROUP_RADIO leistet das beforeEach oben.
     */
    try {
      process.env.SUITE_UPDATER_GROUP_RADIO = "eine-updater-gruppe";
      expect(istRadioAdmin(viewer(["eine-updater-gruppe"]))).toBe(false);
      // Und die Gegenrichtung: wer BEIDES hat, ist Admin — „admin gewinnt bei
      // Ueberschneidung" (radio-admin/shared/src/role.test.ts:15-17).
      expect(istRadioAdmin(viewer(["eine-updater-gruppe", "iuk-radio-admin"]))).toBe(true);
    } finally { zuruecksetzen(); }
  });
});

describe("verwaltungsZiel — absolutes Ziel fuer die callbackUrl", () => {
  it("nimmt den konfigurierten Prod-Host, auch wenn die Anfrage anders kam", () => {
    /*
     * ⛔ DIE ERSTE ZUSICHERUNG FRAGT EINEN FREMDEN HOST AN, UND DAS IST DER GANZE FALL.
     * Der Plan hatte hier zweimal denselben Host stehen — angefragt wie konfiguriert. Dann
     * liefern BEIDE Zweige der `??`-Kette dieselbe Zeichenkette, und die Zusicherung ist
     * gegen den Vorrang des Prod-Hosts blind. GEMESSEN (Sonde P11a, 2026-08-22): mit
     * entfernter Zeile `prodHostsFor(getModule("radio"))[0] ??` lief die Brieffassung
     * `13 passed` — 0 rot. Die NT11-Form, nur an einer anderen Stelle.
     *
     * `iuk-ue.de` gehoert `portal` (`src/core/registry.ts:59`), ist also ein FREMDER
     * Suite-Host: `istRadioHost` ist dort falsch, und ohne den Prod-Host-Vorrang fiele die
     * Funktion auf den internen Pfad zurueck. Die zweite Zusicherung haelt zusaetzlich den
     * Normalfall fest, in dem angefragter und konfigurierter Host uebereinstimmen.
     */
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "iuk-ue.de", "x-forwarded-proto": "https" })))
        .toBe("https://radio.iuk-ue.de/admin");
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": "https" })))
        .toBe("https://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });

  it("der konfigurierte Prod-Host gewinnt AUCH ueber einen echten Radio-Host", () => {
    /*
     * ⛔ DER VORRANG, NICHT DIE ANWESENHEIT — und der Unterschied ist gemessen.
     *
     * Fall 1 darueber faengt nur, dass der Prod-Host-Zweig EXISTIERT: sein angefragter Host
     * (`iuk-ue.de`) ist ein FREMDER, `istRadioHost` ist dort falsch, und ein TAUSCH der
     * beiden Zweige der `??`-Kette laesst ihn deshalb gruen. GEMESSEN (Sonde P17,
     * 2026-08-22, REVIEW-Z4 Fund W1): mit vertauschten Zweigen — `istRadioHost` zuerst,
     * `prodHostsFor` als Rueckfall — lief die ganze Datei `13 passed`, 0 rot. Dieselbe
     * Familie wie P11a, nur eine Ebene tiefer.
     *
     * Dieser Fall fragt einen ECHTEN Radio-Host an, der ein ANDERER ist als der
     * konfigurierte. Nur so liefern die zwei Zweige verschiedene Zeichenketten, und nur so
     * ist die Reihenfolge ueberhaupt pruefbar. Ohne den Vorrang schriebe die Anmeldung eine
     * `callbackUrl` auf den FALSCHEN Host — und typecheck, lint und die uebrigen zwoelf
     * Faelle blieben alle gruen.
     *
     * `radio.localtest.me` trifft `moduleForHost` ueber den Zweig `${m.key}.localtest.me`
     * (`src/core/registry.ts:249`), also OHNE jede SUITE_HOST_*-Variable: ein in der Shell
     * oder in der CI exportierter Fremdwert kann diesen Fall nicht kippen.
     */
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "radio.localtest.me" })))
        .toBe("http://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });

  it("bildet die URL aus x-forwarded-host, nicht aus host", () => {
    /*
     * `resolveHost` nimmt `x-forwarded-host` vor `host` und behaelt den Port
     * (`src/core/routing.ts:36-41`). Nach dem Rewrite der Middleware ist das die einzig
     * richtige Reihenfolge, und `radio`s Verkehr kommt durch genau diesen Rewrite.
     *
     * ⚠️ FUER DAS PRAEDIKAT IST SIE BELEGT (`src/app/m/radio/_lib/host.test.ts:68-77`), FUER
     * DIE URL-BILDUNG WAR SIE ES NICHT: aus `angefragt` entstehen Host UND Port der
     * absoluten URL. GEMESSEN (Sonde P18, 2026-08-22, REVIEW-Z4 Fund K2): `resolveHost`
     * durch `headersEingang.get("host") ?? ""` ersetzt lief `13 passed`, 0 rot.
     *
     * Das Env-Loeschen leistet das beforeEach oben — der Fall laeuft OHNE Prod-Host, damit
     * er den angefragten Zweig misst und nicht den konfigurierten.
     */
    try {
      expect(
        verwaltungsZiel(
          kopf({ "x-forwarded-host": "radio.localtest.me:3000", host: "interner.dienst" }),
        ),
      ).toBe("http://radio.localtest.me:3000/admin");
    } finally { zuruecksetzen(); }
  });

  it("faellt ohne Prod-Host auf den ANGEFRAGTEN Host zurueck — aber nur, wenn er radio ist", () => {
    // Das Env-Loeschen leistet das beforeEach oben.
    try {
      expect(verwaltungsZiel(kopf({ host: "radio.localtest.me:3000" })))
        .toBe("http://radio.localtest.me:3000/admin");
    } finally { zuruecksetzen(); }
  });

  it("faellt auf den internen Pfad zurueck, wenn weder Prod-Host noch Radio-Host vorliegen", () => {
    /*
     * Das ist der Zustand VOR dem Cutover auf einem fremden Host. Ein absolutes Ziel waere
     * hier eine erfundene Domain; der interne Pfad ist die einzige ehrliche Antwort.
     * ⚠️ Er ist `/m/radio/admin` und NICHT `/admin` — die callbackUrl wird von der
     * Suite-Anmeldung aufgeloest, und die kennt nur interne Pfade.
     * `iuk-ue.de` gehoert `portal` (`src/core/registry.ts:59`), ist also ein FREMDER
     * Suite-Host. Das Env-Loeschen leistet das beforeEach oben.
     */
    try {
      expect(verwaltungsZiel(kopf({ host: "iuk-ue.de" }))).toBe("/m/radio/admin");
      expect(verwaltungsZiel(kopf({}))).toBe("/m/radio/admin");
    } finally { zuruecksetzen(); }
  });

  it("liest das Protokoll aus x-forwarded-proto und nimmt bei Kommaliste den ersten Wert", () => {
    try {
      process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": "https,http" })))
        .toBe("https://radio.iuk-ue.de/admin");
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de" })))
        .toBe("http://radio.iuk-ue.de/admin");
      /*
       * ⚠️ UND DAS `.trim()`, DAS SONST UNTESTBAR-GRUEN BLEIBT: Leerzeichen um das Komma
       * herum ergeben dasselbe Protokoll. GEMESSEN (Sonde P19, 2026-08-22, REVIEW-Z4 Fund
       * K3): `.split(",")[0].trim()` zu `.split(",")[0]` verkuerzt lief `13 passed`, 0 rot —
       * das Ziel hiesse dann " https://radio.iuk-ue.de/admin", mit fuehrendem Leerzeichen.
       * Diese Zusicherung steht ZULETZT, weil ein geworfenes `expect` seinen Fall beendet.
       */
      expect(verwaltungsZiel(kopf({ host: "radio.iuk-ue.de", "x-forwarded-proto": " https , http" })))
        .toBe("https://radio.iuk-ue.de/admin");
    } finally { zuruecksetzen(); }
  });
});
```

⚠️ **Diese zwei Blöcke tragen seit dem 2026-08-22 (Fix-Runde 1 zu Z4) den AUSGELIEFERTEN Stand,
byte-gleich zu `src/app/m/radio/_lib/zugang.ts` und `…/zugang.test.ts`.** Sie sind es vorher **nicht**
gewesen: der Bau hatte fünf deklarierte Abweichungen (u. a. ein `beforeEach`, das alle drei
`SUITE_*`-Variablen vor jedem Fall löscht, und die dadurch toten inline-`delete`s), und der
Nachbesserungs-Commit `aa68c4c` hatte Fall 1 von `verwaltungsZiel` bereits gerichtet, ohne den Plan
mitzuziehen. ⛔ **Der Planstand war damit eine Bauanleitung für einen gemessenen `0 rot`** — wer ihn
für Planteil 4 abgeschrieben hätte, hätte Fall 1 in der Fassung wiederaufgebaut, die den Vorrang des
Prod-Hosts nicht prüft (Sonde P11a). Dazu kommen die drei Zusicherungen aus dieser Fix-Runde (W1,
K2, K3) und die berichtigte Routenzahl **elf** statt „neun" (K6). ⚠️ **Teil A unten zitiert weiter
`Failed to resolve import "./zugang"`; gemessen liefert vitest 4.1.10 `Cannot find module './zugang'
imported from …`.** Das ist ein Werkzeugbefund, kein Bau-Posten — er bleibt hier stehen, damit die
nächste Person die Abweichung erwartet statt sie für einen Fehler zu halten.

⚠️ **`process.env`-Fälle laufen mit `try/finally`, nicht mit `afterEach`** — hier stehen drei
Variablen nebeneinander, und ein Fall, der eine davon setzt, darf die anderen nicht in einen
Zwischenzustand hinterlassen. Vitest führt Dateien parallel, aber Fälle **innerhalb** einer Datei
seriell; `try/finally` ist die Form, die auch bei einer geworfenen Erwartung zurücksetzt.

- [ ] **Schritt 3: Den Fehlschlag sehen — und die Aufweichung von Hand herstellen**

```
rtk pnpm vitest run src/app/m/radio/_lib/zugang.test.ts
```

⛔ **Auch hier hat der Schritt zwei Teile, und Teil A gehört ausgeführt, BEVOR `_lib/zugang.ts`
existiert** — sonst ist die Importmeldung nicht mehr herstellbar und der Architektursatz aus `:23-25`
gebrochen, ohne dass es jemand merkt. **Reihenfolge:**

```
Schritt 2 (die Testdatei schreiben)  →  Teil A hier  →  Schritt 1 (der Bau)  →  Teil B hier
```

**Teil A — vor dem Bau:** erwartet `Failed to resolve import "./zugang"`. Zitiere die Meldung.

**Teil B — nach dem Bau:** die Aufweichungs-Gegenprobe unten.

Danach die **entscheidende** Gegenprobe für Auflage 3 — baue die Aufweichung testweise ein, die
Planteil 4 versehentlich bauen könnte:

```ts
// SONDE in istRadioAdmin — wird zurueckgenommen
const erlaubt = [
  ...adminGroupsFor(getModule("radio")),
  ...(process.env.SUITE_UPDATER_GROUP_RADIO ? [process.env.SUITE_UPDATER_GROUP_RADIO] : []),
];
```

```
rtk pnpm vitest run src/app/m/radio/_lib/zugang.test.ts
```

Erwartet: **1 failed** — „ein Viewer mit NUR der Updater-Gruppe: false". Zitiere die Meldung
wörtlich; sie ist der Beleg, dass die Naht hält. Dann die Sondenzeilen **von Hand** zurücknehmen und
erneut fahren.

⛔ **Ohne diese Gegenprobe ist die Zusage aus Auflage 3 unbewiesen** — der Fall wäre auch grün, wenn
er gar nichts prüfte.

- [ ] **Schritt 4: Grün sehen**

```
rtk pnpm vitest run src/app/m/radio/_lib/zugang.test.ts src/app/m/radio/_lib/host.test.ts
```

Erwartet: **beide grün**.

- [ ] **Schritt 5: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/zugang.ts src/app/m/radio/_lib/zugang.test.ts
rtk git commit -m "feat(radio): der Zugriffsriegel fuer /admin, mit der Naht fuer die Updater-Stufe"
rtk git show --stat HEAD
```

---

## Aufgabe Z5: Der schärfere Scan — `riegel.test.ts`

⚠️ **Beginn des Blocks Z5–Z6.** Nach dieser Aufgabe ist `rtk pnpm vitest run
src/app/m/radio/riegel.test.ts` **rot** — das ist ihr Zweck, nicht ihr Fehler: die Untergrenze der
Klausel (a) verlangt zwei `admin/**/layout.tsx`, und die gibt es erst mit **Z6**. ⛔ **Kein Commit
vor Z6.**

Der Grund für den Block ist nicht Bequemlichkeit: **Z6 löscht den alten Wächter aus Planteil 1**
(`_db/append.test.ts:50-77`) und **Z5 stellt den neuen**. Lägen sie in zwei Commits, wäre der Baum
zwischen ihnen genau eine Umdrehung lang unbewacht — und ein abgebrochener Lauf hinterließe ihn so.

**Files:**
- Create: `src/app/m/radio/riegel.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts`, `_lib/hostRiegel.ts` (Z3) und `_lib/zugang.ts` (Z4) — der Scan liest
  ihren Quelltext.
- Produces: keinen Code. **Er ist der Ersatz für den zweiten `describe`-Block aus M4** und die
  einzige mechanische Zusicherung, die Planteil 3, 4 und 5 dabei hält, je Flächenart die richtige
  Riegelform zu nehmen.

- [ ] **Schritt 1: Den Scan schreiben**

```ts
// src/app/m/radio/riegel.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DIE MODULWEITEN QUELLTEXT-ZUSICHERUNGEN (Spec 1 §1.6, Zeile 714).
 *
 * ⛔ ER IST DER NACHFOLGER DES ZWEITEN `describe`-BLOCKS AUS `_db/append.test.ts`
 * (Planteil 1, Aufgabe M4). Jener verbot JEDE Flaeche unter `src/app/m/radio/`, weil der
 * Host-Riegel noch nicht stand; er wird in Z6 GELOESCHT, nicht aufgeweicht. Diese Datei
 * ist die SCHAERFERE Fassung derselben Sorge: nicht mehr „keine Flaeche", sondern „jede
 * Flaeche traegt die Riegelform ihrer Art".
 *
 * SIE BELEGT NICHT, DASS ETWAS WIRKT, sondern dass eine BAUFORM eingehalten ist. Genau
 * dafuer ist sie die richtige Ebene — jede Zeile hier faengt einen Fehler, der typkorrekt,
 * lint-sauber und fuer `pnpm build` unsichtbar waere (Vorbild:
 * `lagerbuch/_lib/bauform.test.ts:6-11`, `src/core/shell/icons.test.ts`).
 *
 * ⚠️ WAS SIE AUSDRUECKLICH NICHT BELEGT: dass ein Riegel bei einem echten Abruf GREIFT.
 * Am Ende von Planteil 2 liegt unter den beiden Verwaltungs-Huellen KEINE `page.tsx`;
 * Next rendert sie also nicht. Ob das Layout einer Route-Group ohne Seite darunter
 * ueberhaupt ausgefuehrt wird, ist ⬜ Z-L1 und wird in Planteil 4 beim ersten echten
 * Abruf abgelesen. ⛔ Kein Fall in dieser Datei darf etwas anderes behaupten.
 *
 * ⚠️ ZWEI FORMEN, UND DER UNTERSCHIED IST TRAGEND (Vorbild `bauform.test.ts:13-37`):
 *
 *   EXISTENZPFLICHT — der Scan behauptet, dass es die Dateien GIBT, und nennt eine
 *   Untergrenze. Heute nur Klausel (a): ZWEI `admin/**​/layout.tsx` (Z6).
 *
 *   EIGENSCHAFTSFORM — der Scan toleriert, dass es die Dateien noch nicht gibt, und sagt
 *   nur etwas ueber die, die da sind. Heute Klausel (c): es gibt NULL Route Handler.
 *
 * ⛔ EINE KLAUSEL OHNE UNTERGRENZE UEBER EINER LEEREN MENGE IST LEER-GRUEN UND BEWACHT
 * NICHTS. Das ist dieselbe Fehlerklasse wie NT11 („ein Waechter, der `>= 5` statt `= 6`
 * prueft, bleibt gruen").
 *
 * ⛔ UND HIER GENUEGT DIE UNTERGRENZE NICHT — SIE WAERE SELBST DER FEHLER. `laenge >= 0`
 * ist fuer JEDE Liste wahr; es gaebe keine Mutation, die den Fall rot macht. Schlimmer
 * ist die Fortsetzung: mit `>=` bliebe der Waechter auch dann gruen, wenn Planteil 3 zwei
 * Handler baut und die Zahl hier stehen laesst — genau der Ausfall, den der Fahrplan
 * verhindern soll. DESHALB ZAEHLT KLAUSEL (c) EXAKT (`toBe`), und die Konstante heisst
 * `HANDLER_ANZAHL` und nicht `HANDLER_MINDESTENS`: bei `toBe` waere „mindestens" eine
 * Luege, und der naechste Leser „repariert" den Namen zurueck auf `>=`.
 *
 * DER NAMENTLICHE ANHEBE-FAHRPLAN — eine Auflage an die Nachfolger, keine Notiz. Mit
 * `toBe` hat er jetzt einen TRAEGER: wer den Handler baut, bekommt den Fall rot und muss
 * die Zahl bewusst anheben.
 *
 *   Planteil 3 baut `t/[code]/route.ts` und `abmelden/route.ts`  -> HANDLER_ANZAHL = 2
 *   Planteil 4 baut `admin/(arbeit)/geraete/export/route.ts`     -> HANDLER_ANZAHL = 3
 *   Planteil 5 baut `sw.js/route.ts`                             -> HANDLER_ANZAHL = 4
 *
 * ⚠️ Die Klausel (a) darunter bleibt bei `toBeGreaterThanOrEqual` — dort ist die
 * Untergrenze richtig: sie wird bei 0 oder 1 Layout rot, und eine DRITTE Verwaltungs-Huelle
 * waere kein Fehler. Der Einwand gilt genau der Handler-Zahl, nicht dem `>=` als solchem.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");
const SELBST = join(MODUL, "riegel.test.ts");

/**
 * ⛔ HEUTE NULL — EXAKT, nicht „mindestens". Angehoben von Planteil 3 (2), Planteil 4 (3),
 * Planteil 5 (4). Die Konstante steht hier oben und nicht im Testkoerper, damit die
 * Aenderung EINE Zeile ist und im Diff auffaellt.
 */
const HANDLER_ANZAHL = 0;

/** Zwei Verwaltungs-Huellen: `admin/(arbeit)/layout.tsx` und `admin/(druck)/layout.tsx` (Z6). */
const ADMIN_LAYOUTS_MINDESTENS = 2;

/**
 * Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv, OHNE Testdateien.
 *
 * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit
 * (`bauform.test.ts:100-117`): `zugang.test.ts` MUSS „auf isModuleAdmin umstellen" als
 * Mutation benennen duerfen, und diese Datei hier nennt jeden verbotenen Namen in ihren
 * eigenen Mustern. Ein Scan, der Testdateien mitliest, macht genau die Tests rot, die die
 * Zusicherung TRAGEN — und wird dann abgeschaltet statt repariert.
 *
 * Der Verlust ist klein und benannt: eine Verletzung, die AUSSCHLIESSLICH in einer
 * Testdatei steht, bleibt unentdeckt. Testdateien werden nicht ausgeliefert.
 */
function quellDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue; // erzeugtes SQL/JSON, kein TypeScript
      treffer.push(...quellDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (pfad === SELBST) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * ⚠️ OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT. `_lib/zugang.ts`
 * schreibt in seinem Kopfkommentar „BEWUSST NICHT `isModuleAdmin`" und nennt
 * `canAdminModule` beim Namen — genau die Saetze, die den Scan erklaeren, und sie duerfen
 * ihn nicht ausloesen (`bauform.test.ts:124-141`).
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 * damit eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale geleert. Nur fuer die
 * POSITIVEN Nachweise noetig: `toMatch` behauptet, dass ein Muster VORKOMMT, und ein
 * String `"requireRadioAdmin("` als reiner Text erfuellte diese Behauptung sonst, OHNE
 * dass der Riegel je liefe — ein Scan, der still nichts faengt, und das ist die
 * gefaehrliche Richtung (`bauform.test.ts:164-176`).
 */
function ohneKommentareUndZeichenketten(quelle: string): string {
  const bereinigt = ohneKommentare(quelle);
  let ergebnis = "";
  let i = 0;
  while (i < bereinigt.length) {
    const z = bereinigt[i]!;
    if (z === '"' || z === "'" || z === "`") {
      ergebnis += " ";
      i++;
      while (i < bereinigt.length && bereinigt[i] !== z) {
        if (bereinigt[i] === "\\") i++;
        else if (bereinigt[i] === "\n") ergebnis += "\n";
        i++;
      }
      if (i < bereinigt.length) { ergebnis += " "; i++; }
      continue;
    }
    ergebnis += z;
    i++;
  }
  return ergebnis;
}

function trefferAuf(muster: RegExp, dateien = quellDateien()): string[] {
  const funde: string[] = [];
  for (const pfad of dateien) {
    const zeilen = ohneKommentare(readFileSync(pfad, "utf8")).split("\n");
    zeilen.forEach((zeile, i) => {
      if (muster.test(zeile)) funde.push(`${relative(process.cwd(), pfad)}:${i + 1}: ${zeile.trim()}`);
    });
  }
  return funde;
}

/**
 * Schneidet den KOERPER einer Funktion heraus — von ihrer Deklaration bis zur schliessenden
 * Klammer, ueber eine Klammerzaehlung.
 *
 * ⛔ WARUM DAS NOETIG IST UND EIN DATEIWEITES `not.toMatch` HIER FALSCH WAERE: Klausel (d)
 * sagt „`viewerOderNull` ruft `requireRadioHost` NICHT". Die DATEI `_lib/zugang.ts`
 * enthaelt `requireRadioHost` aber sehr wohl — als erste Anweisung von
 * `requireRadioAdmin` (Spec:670, Schicht iii). Ein `not.toMatch` ueber die ganze Datei
 * waere also entweder dauerhaft rot oder zwaenge dazu, die tragende Zeile zu entfernen.
 * Der Scan muss auf den FUNKTIONSKOERPER zielen.
 */
function funktionsKoerper(quelle: string, name: string): string {
  const bereinigt = ohneKommentareUndZeichenketten(quelle);
  const start = bereinigt.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const auf = bereinigt.indexOf("{", start);
  if (auf === -1) return "";
  let tiefe = 0;
  for (let i = auf; i < bereinigt.length; i++) {
    if (bereinigt[i] === "{") tiefe++;
    else if (bereinigt[i] === "}") {
      tiefe--;
      if (tiefe === 0) return bereinigt.slice(auf, i + 1);
    }
  }
  return "";
}

describe("(a) jede Verwaltungs-Huelle traegt BEIDE Riegel, in dieser Reihenfolge", () => {
  const ADMIN_LAYOUTS = () =>
    quellDateien().filter((p) => /\/admin\/.*\/layout\.tsx$/.test(p.replace(/\\/g, "/")));

  it("es gibt mindestens zwei — sonst pruefte dieser Block null Zusicherungen", () => {
    /*
     * DIE EXISTENZPFLICHT. Ohne sie waere der Block ueber einer leeren Liste gruen und
     * bewachte nichts — dieselbe Fehlerklasse wie NT11. Heute sind es genau zwei:
     * `admin/(arbeit)/layout.tsx` (mit Rahmen) und `admin/(druck)/layout.tsx` (ohne),
     * Spec:429-441 und Spec:731.
     */
    expect(ADMIN_LAYOUTS().length, "leere Layoutliste — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(ADMIN_LAYOUTS_MINDESTENS);
  });

  it("jede nennt requireRadioHost UND den Personen-Riegel ihres Zweigs", () => {
    /*
     * Spec:429-441. ⚠️ DER DRUCK-ZWEIG IST NICHT WENIGER STRENG, SONDERN GLEICH STRENG —
     * nur die Huelle fehlt. Der Praezedenzfall steht im Repo und war ein echter Ausfall:
     * „Der Praezedenzfall `feedback` hat sie als eigene Route mit eigenem Layout — und
     * genau dort fiel sie aus dem Zugriffsriegel heraus, weil der Riegel im anderen
     * Layout hing" (zitiert in lagerbuch/verwaltung/(druck)/layout.tsx:30-34).
     *
     * ⛔ DIE KLAUSEL IST PFADSENSITIV, UND DAS IST DIE STELLE, AN DER PLANTEIL 2 DIE
     * ZWEITE RECHTESTUFE VORSIEHT (Betreiberentscheidung C.6/B4, 2026-08-21).
     *
     *   admin/(druck)/**\/layout.tsx   -> requireRadioAdmin(                    Spec:4368
     *   admin/(arbeit)/**\/layout.tsx  -> requireRadioAdmin( ODER
     *                                     requireRadioVerwaltung(               Spec:4367, Spec:714
     *   beide                          -> requireRadioHost( ZUERST
     *
     * WARUM NICHT „nur requireRadioAdmin", so wie es urspruenglich hier stand: Spec:4367
     * setzt `admin/(arbeit)/layout.tsx` verbindlich auf `requireRadioVerwaltung()`. Ein
     * Scan, der nur den ersten Namen kennt, waere gegen die verbindliche Bauform
     * ROT-BY-CONSTRUCTION, sobald Planteil 4 sie herstellt — zeichengleich die Fehlerform,
     * die B7 (Spec:96) an einem anderen Namen schon einmal abgeraeumt hat. Und der
     * naheliegende Gruen-Fix waere der schaedliche: das Layout zurueck auf
     * `requireRadioAdmin` — dann sperrt der LAYOUT-Riegel jede Updater-Person mit 404,
     * bevor irgendeine Seite laeuft, und typecheck, lint und build bleiben gruen.
     *
     * WARUM NICHT „oder" ueber ALLE Admin-Layouts: das waere die offene Tuer, durch die
     * der Druckzweig — das Blatt mit den ZUGANGSCODES IM KLARTEXT — auf die schwaechere
     * Stufe rutschen koennte, ohne dass der Scan es merkt. Die Aufteilung nach Group
     * schliesst sie, ohne rot-by-construction zu sein.
     *
     * ⛔ Braucht ein Nachfolger eine DRITTE Group, ist das eine bewusste Aenderung AN
     * DIESER TABELLE — kein vorgeoeffnetes Tor. Eine unbekannte Group faellt unten in den
     * strengsten Zweig.
     */
    const verstoesse: string[] = [];
    for (const pfad of ADMIN_LAYOUTS()) {
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
      const kurz = relative(process.cwd(), pfad).replace(/\\/g, "/");
      // Nur der ARBEITS-Zweig darf die Verwaltungs-Stufe nennen; alles andere — auch eine
      // kuenftige, hier unbekannte Group — wird wie der Druckzweig behandelt.
      const istArbeit = /\/admin\/\(arbeit\)\//.test(kurz);
      const person = istArbeit
        ? /\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/
        : /\brequireRadioAdmin\s*\(/;

      if (!/\brequireRadioHost\s*\(/.test(q)) verstoesse.push(`${kurz}: kein requireRadioHost(`);
      if (!person.test(q)) {
        verstoesse.push(
          istArbeit
            ? `${kurz}: weder requireRadioAdmin( noch requireRadioVerwaltung( (Spec:4367)`
            : `${kurz}: kein requireRadioAdmin( — der Druckzweig bleibt auf der Admin-Stufe (Spec:4368)`,
        );
      }
      // ERST DER HOST, DANN DIE PERSON (Spec:429-437): so verraet ein anonymer Aufruf auf
      // einem fremden Host die Verwaltungsroute nicht ueber einen vorgeschalteten
      // Login-Umweg. Die Reihenfolge ist eine Aussage, keine Formsache.
      const host = q.search(/\brequireRadioHost\s*\(/);
      const nachPerson = q.search(person);
      if (host !== -1 && nachPerson !== -1 && host > nachPerson) {
        verstoesse.push(`${kurz}: der Personen-Riegel steht VOR requireRadioHost`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

/*
 * (b) ⛔ ENTFAELLT HIER — korrigiert in B14 (Spec:103, Kapiteltext Spec:714).
 *
 * Der `_actions/`-Scan liegt in `src/app/m/radio/_actions/guards.test.ts` (Kapitel 3
 * §3.8, Planteil 3). Jene Fassung ist die vollstaendigere — sie prueft JEDE EXPORTIERTE
 * ACTION, nicht nur die Datei — und sie fuehrt die AUSNAHMELISTE, ohne die der Scan auf
 * `gate.ts#einloesenAmGate` und `sitzung.ts#beenden` am ersten Tag rot waere. Der
 * naheliegende Gruen-Fix — dort einen Sitzungsriegel einsetzen — macht das Gate
 * unbenutzbar und sieht wie eine Verbesserung aus (§3.3.3).
 *
 * Zwei Scans ueber dieselbe Flaeche, von denen einer die Ausnahmen nicht kennt, sind ein
 * Scan zu viel. ⛔ Wer ihn hier nachtraegt, baut genau den Zustand, den B14 abgeraeumt hat.
 */

describe("(c) jeder Route Handler nimmt die NICHT-werfende Form", () => {
  const ROUTE_HANDLER = () => quellDateien().filter((p) => /\/route\.ts$/.test(p.replace(/\\/g, "/")));

  it("die Handlerzahl steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⚠️ HEUTE NULL, UND DAS IST EIN ZUSTAND, KEIN ZIEL. Planteil 2 baut keinen Route
     * Handler.
     *
     * ⛔ `toBe`, NICHT `toBeGreaterThanOrEqual`. `laenge >= 0` ist fuer jede Liste wahr —
     * es gaebe KEINE Mutation, die diesen Fall rot macht, und der Fall waere genau die
     * NT11-Form, die der Kopf dieser Datei drei Absaetze weiter oben verurteilt. Mit `toBe`
     * wird er rot, sobald ein Nachfolger einen Handler baut und `HANDLER_ANZAHL` oben
     * stehen laesst — das ist der TRAEGER des Anhebe-Fahrplans, den ein Kommentar allein
     * nicht hat.
     */
    expect(
      ROUTE_HANDLER().length,
      "HANDLER_ANZAHL anheben — der Fahrplan steht im Kopf dieser Datei",
    ).toBe(HANDLER_ANZAHL);
  });

  it("keiner nennt die werfende Form, jeder nennt eine der beiden nicht-werfenden", () => {
    /*
     * Spec:714 Klausel (c), Spec:542-547. Route Handler bekommen `radioHostOderNull`
     * ODER `hostAbweisung`; Layouts, Seiten und Server Actions die werfende Form.
     *
     * ⚠️ DIE ZWEITE ALTERNATIVE IST NICHT OPTIONAL — sie ist der Grund, warum B13 diese
     * Klausel korrigiert hat. `sw.js/route.ts` (Planteil 5) ruft `hostAbweisung`, und die
     * alte Fassung ohne diese Alternative war gegen ihn rot, OBWOHL die Datei korrekt
     * geriegelt ist.
     *
     * Ein `notFound()` waere keine brauchbare Antwort auf einen GESCANNTEN QR-Code und
     * auch keine auf eine Service-Worker-Anfrage: es waere eine HTML-Fehlerseite mit
     * `Content-Type: text/html`, und der Browser meldete „manifest fetch failed" statt
     * eines sauberen 404. Route Handler haben ausserdem KEIN Layout ueber sich.
     *
     * ⛔ UND DIE DRITTE PRUEFUNG, SIE IST B11 (Spec:100, ausgeschrieben Spec:4379,
     * bestaetigt B17 Spec:117): EIN ROUTE HANDLER RUFT AUCH `requireRadioAdmin` NICHT.
     * Der Verwaltungs-Handler `admin/(arbeit)/geraete/export/route.ts` (Planteil 4)
     * riegelt mit `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())` und baut
     * seine 404 selbst. `requireRadioAdmin` endet in `redirect('/login?…')` bzw.
     * `notFound()`; woertlich umgesetzt landete ein anonymer GET auf
     * `/admin/geraete/export` in einem LOGIN-UMWEG — typkorrekt, lint-sauber, und genau
     * das, was B11 abgeschafft hat.
     *
     * ⚠️ Ohne diese dritte Zeile bestuende ein Handler mit `radioHostOderNull(` UND
     * `requireRadioAdmin()` den Scan GRUEN. Sie ist heute ueber null Handlern leer-gruen
     * und laeuft im Anhebe-Fahrplan darueber mit.
     */
    const verstoesse: string[] = [];
    for (const pfad of ROUTE_HANDLER()) {
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
      const kurz = relative(process.cwd(), pfad);
      if (!/\bradioHostOderNull\s*\(|\bhostAbweisung\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: weder radioHostOderNull( noch hostAbweisung(`);
      }
      if (/\brequireRadioHost\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: nennt die werfende Form (Spec §1.4.3, Schicht ii)`);
      }
      if (/\brequireRadioAdmin\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: nennt requireRadioAdmin( — Login-Umweg (B11, Spec:100/4379)`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});

describe("(d) die Gegenregel — viewerOderNull ruft den Host-Riegel NICHT", () => {
  it("der Koerper von viewerOderNull nennt requireRadioHost nicht", () => {
    /*
     * Spec §1.4.4 (Zeilen 595-607), Spec:714 Klausel (d), Spec:723.
     *
     * `viewerOderNull` ist die SICHTBARKEITSfrage — sie beantwortet „ist da jemand, und
     * darf er den /admin-Link sehen?". Ein Host-Riegel darin machte aus einer Frage eine
     * Sperre und schickte jeden anonymen Aufruf des Gates in einen 404.
     *
     * ⚠️ DER SCAN ZIELT AUF DEN FUNKTIONSKOERPER, NICHT AUF DIE DATEI. `_lib/zugang.ts`
     * ENTHAELT `requireRadioHost` — als erste Anweisung von `requireRadioAdmin`, und
     * genau dort MUSS es stehen (Schicht iii). Ein dateiweites `not.toMatch` waere
     * entweder dauerhaft rot oder zwaenge dazu, die tragende Zeile zu entfernen.
     */
    const quelle = readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8");
    const koerper = funktionsKoerper(quelle, "viewerOderNull");
    expect(koerper, "viewerOderNull nicht gefunden — der Scan waere leer-gruen").not.toBe("");
    expect(koerper, "Gegenregel §1.4.4: viewerOderNull ruft requireRadioHost NICHT")
      .not.toMatch(/\brequireRadioHost\b/);
  });

  it("requireRadioAdmin ruft ihn dagegen sehr wohl, und als ERSTE Anweisung", () => {
    /*
     * DIE GEGENPROBE ZUR GEGENREGEL, und sie gehoert unmittelbar daneben: ohne sie liesse
     * sich Klausel (d) erfuellen, indem man den Riegel aus BEIDEN Funktionen entfernt.
     * Server Actions haben kein Layout ueber sich (Spec:669-673, Kapitel-4-Pflicht 16).
     */
    const koerper = funktionsKoerper(
      readFileSync(join(MODUL, "_lib/zugang.ts"), "utf8"),
      "requireRadioAdmin",
    );
    expect(koerper).not.toBe("");
    expect(koerper).toMatch(/\brequireRadioHost\s*\(/);
    /*
     * ⛔ UND DER GANZE KOERPER, NICHT NUR SEINE ERSTE ZEILE (REVIEW-Z4, Fund W2 — gemessen).
     * Bis hierher sicherte diese Klausel nur zu, dass `requireRadioHost(` VORKOMMT und VOR
     * `viewerAusSession(` steht. GEMESSEN (Messung 4 des Reviews, 2026-08-22): der ganze
     * Koerper durch `const viewer = viewerAusSession(await auth()); return viewer as
     * RadioViewer;` ersetzt liess `zugang.test.ts` mit `13 passed` durchlaufen — 0 rot.
     * Ausgerechnet die Zeile, die `_lib/zugang.ts` selbst „PFLICHT, NICHT KUER" nennt (die
     * Protokollzeile aus Spec:206-210), hatte damit in ganz Planteil 2 keinen Waechter.
     *
     * ⚠️ DAS IST EINE QUELLTEXT-ZUSICHERUNG, KEIN VERHALTENSNACHWEIS. Sie haelt fest, DASS
     * die vier tragenden Aufrufe im Koerper stehen — nicht, dass sie wirken. Die
     * VERHALTENSfaelle nach `lagerbuch`-Vorbild (`src/app/m/lagerbuch/_lib/zugang.test.ts:41`
     * Import, `:72` Aufruf, Begruendung `:60-71`) gehoeren an PLANTEIL 4, wo die erste
     * Verwaltungsseite steht und der Next-Anfragekontext echt ist.
     *
     * Warum genau diese vier: ohne `istRadioAdmin(` prueft der Riegel keine Gruppe, ohne
     * `notFound(` weist er nicht ab (403 waere die falsche Form, Spec:691-694), ohne
     * `meldeFehlendeGruppe(` ist Falle 23 unsichtbar (Spec:206-210, „die einzige Stelle, an
     * der dieser Zustand ueberhaupt sichtbar wird"), und ohne `redirect(` landet eine
     * ANONYME Person im 404 statt in der Anmeldung — `viewerAusSession` gibt dort `null`,
     * und `istRadioAdmin(null)` ist `false`.
     */
    expect(koerper, "ohne istRadioAdmin( prueft der Riegel keine Gruppe")
      .toMatch(/\bistRadioAdmin\s*\(/);
    expect(koerper, "ohne meldeFehlendeGruppe( ist Falle 23 unsichtbar (Spec:206-210)")
      .toMatch(/\bmeldeFehlendeGruppe\s*\(/);
    expect(koerper, "ohne notFound( weist der Riegel nicht ab (Spec:691-694)")
      .toMatch(/\bnotFound\s*\(/);
    expect(koerper, "ohne redirect( landet die anonyme Person im 404 statt in der Anmeldung")
      .toMatch(/\bredirect\s*\(/);
    const host = koerper.search(/\brequireRadioHost\s*\(/);
    const person = koerper.search(/\bviewerAusSession\s*\(/);
    expect(host, "erst der Host, dann die Person (Spec:669-671)").toBeLessThan(person);
  });
});

describe("Pflicht 17 — dieses Modul nimmt von der Suite-Admin-Abkuerzung Abstand", () => {
  it("findet keinen der vier core-Riegel", () => {
    /*
     * docs/radio-portierung-analyse.md:979-997. `isModuleAdmin`, `requireModuleAdmin`,
     * `moduleAdminPageOrNotFound` und `canAdminModule` sind fertig, gut und die FALSCHEN
     * fuer dieses Modul: alle vier tragen die Suite-Admin-Abkuerzung — `core/groups.ts:125`
     * steigt woertlich mit `if (groups.includes(suiteAdminGroup(env))) return true;` aus.
     * Ein Import saehe wie Wiederverwendung aus.
     *
     * `canAdminModule` ist der teuerste: es ist die hausuebliche SICHTBARKEITSfrage und
     * zeigte dem Suite-Admin einen Verwaltungs-Eintrag, dessen Ziel `requireRadioAdmin`
     * mit 404 beantwortet.
     *
     * ⚠️ DER KURZSCHLUSS SELBST WIRD SPAETER ENTFERNT — als eigene kleine Vorarbeit vor
     * Planteil 4 (KONTEXT-radio-planteil2.md:32-35). Dieser Scan bleibt trotzdem: er
     * sagt, dass `radio` seine Rechte SELBST aufloest, unabhaengig davon, was `core` tut.
     */
    expect(
      trefferAuf(/\b(?:isModuleAdmin|requireModuleAdmin|moduleAdminPageOrNotFound|canAdminModule)\b/),
      "Navigation UND Riegel lesen istRadioAdmin auf demselben Viewer (Pflicht 17)",
    ).toEqual([]);
  });

  it("findet keinen Treffer auf isAdmin", () => {
    /*
     * `isAdmin` heisst in der Suite „ist BETREIBER" (core/auth/config.ts:204-205), nicht „darf
     * radio verwalten". Ein 1:1-Port aus dem Alt-Bestand waere TYPKORREKT und liefe durch
     * `pnpm build` — und BEIDE Dev-Logins der Suite setzen `isAdmin = true`. Die E2E
     * blieben also gruen, waehrend die gesamte Radio-Verwaltung fuer jeden Suite-Betreiber
     * offen stuende (Vorbild `lagerbuch/_lib/bauform.test.ts:211-227`).
     *
     * Hinter /admin liegen Klarnamen samt Bewegungshistorie und die Enrollment-Codes.
     */
    expect(trefferAuf(/\bisAdmin\b/), "session.user.isAdmin ist fuer dieses Modul verboten (Entscheidung 9)")
      .toEqual([]);
  });

  it("liest die Admin-Gruppe ueber adminGroupsFor, nie ueber das Registry-Feld", () => {
    /*
     * `mod.adminGroups` direkt gelesen macht SUITE_ADMIN_GROUP_RADIO an genau dieser
     * Stelle wirkungslos, und der Fehler ist still: eine Instanz mit anders benannten
     * SSO-Gruppen liefe mit einem Riegel, der niemanden durchlaesst (registry.ts:29-35
     * schreibt dieselbe Falle fuer prodHosts aus).
     */
    expect(trefferAuf(/\.adminGroups\b/), "adminGroupsFor(mod) statt mod.adminGroups (Pflicht 17)")
      .toEqual([]);
  });
});

describe('kein "use client" unter _lib/ und _db/', () => {
  it("findet keine Direktive", () => {
    /*
     * Falle 6 (`CLAUDE.md`): ein WERT aus einem `"use client"`-Modul kommt in einer Server
     * Component nicht an — sie bekommt eine Client-Referenz statt des Wertes, HTTP 500 fuer
     * die ganze Seite. TypeScript ist zufrieden, `build` findet nichts, und VITEST KANN ES
     * STRUKTURELL NICHT FINDEN (dort ist `"use client"` ein wirkungsloser String). Genau
     * deshalb steht hier ein Quelltext-Scan und kein Verhaltenstest.
     *
     * `_lib/host.ts` wird von Server Components UND Route Handlern gelesen (Spec:455-456);
     * `_lib/zugang.ts` von Layouts und Server Actions.
     */
    const dateien = quellDateien().filter((p) => /\/(?:_lib|_db)\//.test(p.replace(/\\/g, "/")));
    expect(dateien.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(4);
    expect(
      trefferAuf(/^\s*["']use client["']/, dateien),
      'Werte fuer Server Components gehoeren in ein Modul OHNE "use client" (Falle 6)',
    ).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Den roten Zustand sehen — er ist der Zweck dieser Aufgabe**

```
rtk pnpm vitest run src/app/m/radio/riegel.test.ts
```

Erwartet: **mindestens 1 failed** — „es gibt mindestens zwei — sonst prüfte dieser Block null
Zusicherungen", weil `admin/(arbeit)/layout.tsx` und `admin/(druck)/layout.tsx` erst mit Z6
entstehen. Zitiere die Meldung wörtlich. Alle übrigen Fälle sind grün.

⚠️ Sollte auch der `"use client"`-Fall rot sein („leere Dateiliste"), zähle nach: `_lib/` trägt nach
Z4 fünf Nicht-Test-Dateien (`boot.ts`, `seedLokal.ts`, `host.ts`, `hostRiegel.ts`, `zugang.ts`),
`_db/` drei (`schema.ts`, `client.ts`, `drizzle.config.ts`). Die Untergrenze 4 ist mit Reserve
gesetzt.

- [ ] **Schritt 3: ⛔ Kein Commit. Weiter mit Z6.**

Der Baum ist in diesem Moment **rot**, und das ist der beabsichtigte Zwischenzustand des Blocks.
⛔ **Kein `git add`, kein `git commit`, und schon gar keine Absenkung von
`ADMIN_LAYOUTS_MINDESTENS`,** um den Lauf grün zu bekommen.

---

## Aufgabe Z6: Die drei Layouts, der Rahmen, die Navigation — und der Löschtermin des M4-Falls

⚠️ **Ende des Blocks Z5–Z6.** Hier läuft das Tor, und hier fällt **ein** Commit über alle Dateien
von Z5 **und** Z6.

**Files:**
- Create: `src/app/m/radio/_lib/nav.ts`
- Create: `src/app/m/radio/_ui/RadioVerwaltungsRahmen.tsx`
- Create: `src/app/m/radio/layout.tsx`
- Create: `src/app/m/radio/admin/(arbeit)/layout.tsx`
- Create: `src/app/m/radio/admin/(druck)/layout.tsx`
- Modify: `src/app/m/radio/_db/append.test.ts` — **der zweite `describe`-Block wird GELÖSCHT**

**Interfaces:**
- Consumes: `requireRadioHost` (Z3), `requireRadioAdmin` (Z4), die Registry-Zeile (Z1), den Scan aus
  **Z5**, der hier grün wird.
- Produces: `RADIO_NAV` (heute leer, **Planteil 4** füllt sie), `RadioVerwaltungsRahmen`, und die
  beiden Verwaltungs-Hüllen, unter die **Planteil 4** seine zehn Seiten hängt.

⚠️ **Diese Aufgabe legt drei `layout.tsx` an und NULL `page.tsx`.** Ein Layout ohne Seite darunter
rendert nichts; am Ende von Planteil 2 ist von außen **keine** Fläche des Moduls erreichbar. Das ist
Absicht: Auflage 1 verlangt, dass die erste Aufgabe, die eine `page.tsx` oder `route.ts` anlegt
(Planteil 3), den Riegel **vorfindet**.

- [ ] **Schritt 1: `_lib/nav.ts` — die Datei, die es gibt, damit sie den richtigen Ort hat**

```ts
// src/app/m/radio/_lib/nav.ts
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG (Spec:732-733).
 *
 * Dieser Wert wird von einer Server Component gelesen und liegt deshalb bewusst in
 * `_lib/` OHNE "use client" (Falle 6). Die hrefs tragen die AEUSSERE Pfadform, damit
 * `aktiverEintrag` sie sowohl gegen aeussere als auch gegen umgeschriebene Pfade per
 * Suffix aufloesen kann (Vorbild `lagerbuch/_lib/nav.ts:1-20`).
 *
 * ⛔ HEUTE LEER, UND DAS IST DIE RICHTIGE FORM — kein Platzhalter, keine Vorwegnahme.
 * Planteil 2 baut keine einzige Verwaltungsseite; jeder Eintrag hier fuehrte auf 404.
 * `qr/layout.tsx:16-18` schreibt die Regel aus: „Ein Eintrag, der auf 404 fuehrt, ist
 * schlimmer als kein Eintrag."
 *
 * ⬜ PLANTEIL 4 FUELLT SIE mit den SIEBEN Eintraegen aus Spec:4199-4203: Uebersicht ·
 * Geraete · Ausleihen · Update-Modus · Import · Softwareversionen · Zugaenge — DREI davon
 * (Import, Softwareversionen, Zugaenge) nur fuer die ADMIN-Stufe sichtbar (§5.5).
 *
 * ⛔ NICHT die zehn Seitenpfade aus §1.2.2. Die Routenkarte ist die Liste der SEITEN,
 * nicht die der Menuepunkte, und drei der zehn gehoeren nicht in ein Menue:
 * `/admin/geraete/<id>` und `/admin/geraete/<id>/ereignisse` haben keine feste ID, und
 * `/admin/zugaenge/blatt` ist das DRUCKBLATT — ein Menuepunkt darauf schoebe ein Blatt
 * mit Zugangscodes im Klartext in die Navigationsleiste (Spec:316-324).
 * ⚠️ `/admin/einstellungen` steht ebenfalls nicht darunter — entfaellt mit B9 (Spec:98,
 * Kapiteltext Spec:326-331).
 *
 * ⛔ UND DIE FORM IST NICHT ENDGUELTIG. Spec:4289 und Spec:4203-4210 verlangen
 * `radioNav(stufe: RadioRolle)` — eine FUNKTION mit der Rechtestufe als Parameter, keine
 * feste Liste: „Ohne diesen Parameter sieht eine Person der Updater-Stufe drei
 * Menuepunkte, die sie in ein `notFound()` fuehren." Die Konstantenform hier ist der
 * Zustand von Planteil 2, weil `RadioRolle` erst mit `_lib/rollen.ts` entsteht
 * (Spec:4420-4422, Planteil 4) und eine Signatur auf einen Typ, den es nicht gibt, nicht
 * typprueft. ⬜ PLANTEIL 4 STELLT DATEI UND AUFRUFSTELLE UM — die Datei auf
 * `radioNav(stufe)` UND die `nav`-Weitergabe in `admin/(arbeit)/layout.tsx`. Der
 * Bestand belegt die Notwendigkeit: `/einstellungen` traegt dort schon heute
 * `adminOnly: true` (radio-admin/client/src/layout/AppLayout.tsx:36).
 *
 * `abschnitt:` DARF vergeben werden, weil `shell: "full"` gilt (Spec:732-733);
 * `core/shell/navAbschnitte.test.ts:56-70` verbietet es nur fuer `minimal`- und
 * `kiosk`-Module.
 *
 * ⚠️ ES GIBT HIER KEINEN TEST, DER hrefs GEGEN DIE ROUTENKARTE KOPPELT. Ueber einer
 * leeren Liste waere er leer-gruen — dieselbe Fehlerklasse, gegen die `riegel.test.ts`
 * seine Untergrenzen setzt. Er gehoert zu Planteil 4, MIT den Eintraegen.
 */
export const RADIO_NAV: SuiteNavItem[] = [];
```

- [ ] **Schritt 2: `_ui/RadioVerwaltungsRahmen.tsx` — die eine antd-Berührung dieses Planteils**

```tsx
// src/app/m/radio/_ui/RadioVerwaltungsRahmen.tsx
import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE HUELLE DES VERWALTUNGSZWEIGS (Spec:429-437). Form 1:1 aus
 * `lagerbuch/_ui/VerwaltungsRahmen.tsx:13-21` — MINUS dem CSS-Modul-Wrapper: `lagerbuch`
 * vererbt darueber seine `--lb-*`-Variablen, `radio` hat keine.
 *
 * ⚠️ DER SHELL-WERT KOMMT AUS DER REGISTRY, NICHT AUS EINEM LITERAL. `registry.shell`
 * packt VON SICH AUS nichts ein — das Modul-Layout entscheidet (Kapitel-4-Pflicht 23,
 * docs/radio-portierung-analyse.md:1116-1127). Genau deshalb steht die Shell HIER und
 * nicht in `layout.tsx`: `radio` braucht auf demselben Host ZWEI Regime, und ein
 * einzelnes Registry-Feld kann das nicht ausdruecken (Falle 23,
 * docs/radio-portierung-analyse.md:1547-1576).
 *
 * ⚠️ WAS DIESER RAHMEN NICHT UMSCHLIESST: den Ausleih-Zweig. Der rendert KEINE Shell,
 * damit 56/72 erhalten bleibt — mit Shell erbte er `controlHeight: 44`
 * (ARBEITSDICHTE, core/theme/theme.ts:207; Falle 4, `CLAUDE.md`), und `pnpm build` findet
 * das nicht (Spec:442-447, Spec:734-736).
 *
 * KEIN "use client" und KEIN `@ant-design/icons`-Import: dies ist eine Server Component
 * (Falle 7). `Shell` selbst ist ein reiner Weichensteller ueber `variant`
 * (core/shell/Shell.tsx:7-33) und ueber die RSC-Grenze erprobt.
 */
export function RadioVerwaltungsRahmen({
  nav,
  children,
}: {
  nav: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mod = getModule("radio");

  return (
    <Shell variant={mod.shell} moduleKey="radio" nav={nav}>
      {children}
    </Shell>
  );
}
```

- [ ] **Schritt 3: Das Modul-Layout — die Datei, die bewusst NICHTS tut**

```tsx
// src/app/m/radio/layout.tsx

/**
 * DAS MODUL-LAYOUT RENDERT `children` UND SONST NICHTS (Spec §1.3, Zeilen 407-425).
 *
 * DIE DATEI EXISTIERT, DAMIT DIE NAECHSTE PERSON KEINE HUELLE HINEINSCHREIBT. Vorbild und
 * Begruendung stehen woertlich in `lagerbuch/layout.tsx:3-22`.
 *
 * KEINE SHELL. Ein Layout ohne Group-Klammer ist Vorfahr ALLER Kinder, also auch des
 * Ausleih-Zweigs. Der erbte damit `controlHeight: 44` statt 56/72 (Falle 4), und
 * `pnpm build` findet das nicht.
 *
 * KEIN RIEGEL. Er umschloesse weder `t/[code]/route.ts` noch `abmelden/route.ts` —
 * ROUTE HANDLER HABEN KEIN LAYOUT UEBER SICH —, und er koennte zwischen Ausleih- und
 * Verwaltungsklasse nicht unterscheiden. Der Riegel liegt deshalb dreifach: in den
 * Group-Layouts, in jeder Server Action und in jedem Route Handler (Pflicht 23).
 *
 * KEIN `viewport`-EXPORT.
 *
 * UND, ANDERS ALS BEI `lagerbuch`: KEIN `metadata.manifest` UND KEINE ICON-HANDLER
 * (Spec:420-425). `lagerbuch` traegt hier den Manifest-Verweis, weil sein Helferzweig
 * eine PWA ist. `radio` hat nach Entscheidung 5 KEIN Geraet und KEIN Tablet; es gibt
 * nichts zu installieren. Die fuenf Handler von `lagerbuch` (`manifest.webmanifest`,
 * `pwa-icon.svg`, drei Icon-Routen) wandern NICHT mit. Wer sie aus Analogie mitnimmt,
 * bewirbt eine PWA, die niemand braucht — und ein Manifest im Root-Layout bewuerbe sie
 * auf JEDEM Suite-Host (Falle 56 der lagerbuch-Zaehlung).
 *
 * ⚠️ DER ALT-KIOSK HAT EINEN SERVICE WORKER, UND DER UEBERLEBT DEN UMSCHWENK. Er ist
 * unter `scope: '/'` registriert (radio-inventar/apps/frontend/src/hooks/usePWA.ts:73)
 * und liegt auf DEMSELBEN Origin. Das ist KEIN Manifest-Thema und gehoert nicht in diese
 * Datei: der Abraeum-Worker unter `/sw.js` ist Kapitel 7 und PLANTEIL 5, und er gehoert
 * zum ERSTEN Deploy, nicht zum Cutover (Leitplan:107-109). Die Wegentscheidung dafuer
 * steht bereits in `_lib/routen.test.ts` (Z2).
 */
export default function RadioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Schritt 4: Die zwei Verwaltungs-Hüllen**

```tsx
// src/app/m/radio/admin/(arbeit)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { RADIO_NAV } from "../../_lib/nav";
import { requireRadioAdmin } from "../../_lib/zugang";
import { RadioVerwaltungsRahmen } from "../../_ui/RadioVerwaltungsRahmen";

/**
 * HUELLE 1 — die Arbeitsflaechen der Verwaltung (Spec:429-437).
 *
 * DER AEUSSERE HOST-RIEGEL LAEUFT VOR DEM PERSONEN-RIEGEL. So verraet ein anonymer Aufruf
 * auf einem fremden Host die Verwaltungsroute nicht ueber einen vorgeschalteten
 * Login-Umweg (1:1 aus `lagerbuch/verwaltung/(arbeit)/layout.tsx:7-10`).
 *
 * `requireRadioAdmin` BEHAELT SEINEN EIGENEN HOST-RIEGEL: Server Actions rufen die
 * Funktion OHNE dieses Layout auf und brauchen denselben Backstop (Pflicht 16). ⛔ Die
 * Zeile dort ist KEINE Redundanz zu dieser hier — wer sie fuer doppelt haelt und
 * entfernt, oeffnet die Luecke fuer jede kuenftige Verwaltungs-Action.
 *
 * ⚠️ MIT `requiresAuth: false` HAT `/admin` NULL MIDDLEWARE-GATING (Falle 22,
 * docs/radio-portierung-analyse.md:1542-1545): `core/routing.ts:58-66` gatet nach dem
 * Modul aus dem Segment und unterscheidet `/m/radio/` und `/m/radio/admin/...` NICHT.
 * Diese zwei Zeilen sind der einzige Traeger. `riegel.test.ts` (Klausel a) haelt sie
 * fest, INKLUSIVE ihrer Reihenfolge.
 *
 * ⬜ Z-L1: solange unter dieser Group KEINE `page.tsx` liegt, rendert Next dieses Layout
 * nicht — die Wirksamkeit der zwei Zeilen ist damit in Planteil 2 UNBEWIESEN. Abgelesen
 * wird sie in Planteil 4, beim ersten echten Abruf gegen `/admin`.
 *
 * ⬜ RADIO_NAV IST HEUTE LEER. Planteil 4 fuellt sie mit den SIEBEN Eintraegen aus
 * Spec:4199-4203; bis dahin rendert die Shell eine Verwaltung ohne Modulnavigation —
 * richtig, weil es noch kein Ziel gibt (`_lib/nav.ts`). ⛔ Planteil 4 stellt dabei auch
 * die WEITERGABE um: `nav={radioNav(stufe)}` statt `nav={RADIO_NAV}` (Spec:4289).
 *
 * ⛔ AUFLAGE AN PLANTEIL 4 — DER PERSONEN-RIEGEL DIESER HUELLE WECHSELT.
 * Spec:4367 setzt `admin/(arbeit)/layout.tsx` verbindlich auf
 * `await requireRadioVerwaltung()`; hier steht heute `requireRadioAdmin()`, weil die
 * zweite Stufe erst mit `_lib/rollen.ts` und `requireRadioVerwaltung` in Planteil 4
 * entsteht (Spec:191, Spec:4420-4422). Solange das so bleibt, sperrt DIESES LAYOUT jede
 * Updater-Person mit 404, BEVOR irgendeine Seite laeuft — und typecheck, lint und build
 * bleiben dabei gruen. Der Wechsel ist deshalb kein Feinschliff, sondern die Bedingung
 * dafuer, dass die Betreiberentscheidung C.6/B4 (zwei Rollen) ueberhaupt wirkt.
 * `riegel.test.ts` (Klausel a) ist bereits pfadsensitiv gebaut und laesst BEIDE Namen in
 * diesem Zweig zu — der Wechsel macht den Scan also nicht rot. ⚠️ `admin/(druck)`
 * bleibt bei `requireRadioAdmin()` (Spec:4368).
 */
export default async function RadioArbeitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireRadioHost(kopf);
  await requireRadioAdmin();     // ⬜ Planteil 4: -> await requireRadioVerwaltung() (Spec:4367)

  return <RadioVerwaltungsRahmen nav={RADIO_NAV}>{children}</RadioVerwaltungsRahmen>;
}
```

```tsx
// src/app/m/radio/admin/(druck)/layout.tsx
import { headers } from "next/headers";
import { requireRadioHost } from "../../_lib/host";
import { requireRadioAdmin } from "../../_lib/zugang";

/**
 * HUELLE 2 — der Druckzweig (Spec:438-441). Heute liegt darunter genau ein kuenftiger
 * Pfad: `/admin/zugaenge/blatt`, das Blatt mit den Zugangscodes (Planteil 4).
 *
 * EIGENE ROUTE-GROUP OHNE SHELL: laege das Blatt unter `(arbeit)`, druckte die Shell
 * Kopfzeile und App-Umschalter mit, und ihr `minHeight: 100vh` erzeugte leere
 * Folgeseiten hinter dem Bogen (`lagerbuch/verwaltung/(druck)/layout.tsx:10-12`).
 *
 * ⛔ DER PREIS UND SEINE BEZAHLUNG — und das ist die sicherheitsrelevante Zeile dieser
 * Datei: mit dem `(arbeit)`-Layout faellt auch dessen Zugriffsriegel weg, und die Seite
 * darunter zeigt die ZUGANGSCODES IM KLARTEXT. Deshalb ruft dieses Layout DIESELBEN zwei
 * Riegel in DERSELBEN Reihenfolge — dieselben Funktionen, nicht zwei Abschriften. Die
 * beiden Zeilen unten stehen ZEICHENGLEICH zu `(arbeit)/layout.tsx`.
 *
 * DER PRAEZEDENZFALL STEHT IM REPO UND WAR EIN ECHTER AUSFALL: „Der Praezedenzfall
 * `feedback` hat sie als eigene Route mit eigenem Layout — und genau dort fiel sie aus
 * dem Zugriffsriegel heraus, weil der Riegel im anderen Layout hing"
 * (zitiert in `lagerbuch/verwaltung/(druck)/layout.tsx:30-34`).
 *
 * ⚠️ DER RIEGEL IST HIER NICHT WENIGER STRENG, SONDERN GLEICH STRENG; nur die Huelle
 * fehlt, weil das Blatt in den Drucker geht und nicht in ein Browserfenster.
 * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (Spec:569-571).
 *
 * ⚠️ ZWEI LINIEN SIND PFLICHT, sobald die Seite steht: der Riegel in diesem Layout UND
 * derselbe Riegel in der Seite. Die zweite Linie ist Sache von PLANTEIL 4 — sie steht
 * hier als Auflage, nicht als erledigt.
 *
 * KEIN Stylesheet-Import: `lagerbuch` zieht hier `./druck.css`. Das Druckbild von `radio`
 * gehoert zu Planteil 4, MIT dem Blatt.
 */
export default async function RadioDruckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireRadioHost(kopf);
  await requireRadioAdmin();

  return <>{children}</>;
}
```

- [ ] **Schritt 5: ⛔ Den M4-Testfall LÖSCHEN — namentlich, wörtlich, vollständig**

Dieser Schritt ist der Grund, warum die Kontextdatei ihn eigens ausschreibt
(`KONTEXT-radio-planteil2.md:123-136`). **Lies ihn ganz, bevor du etwas anfasst.**

**Zu löschen ist der ZWEITE `describe`-Block in `src/app/m/radio/_db/append.test.ts`, Zeilen
50–77**, wörtlich:

```ts
describe("radio: vor dem Host-Riegel entsteht keine Flaeche", () => {
  it("kein page/layout/route/_actions unter src/app/m/radio", () => {
    /*
     * DER HOST-RIEGEL STEHT ERST IN PLANTEIL 2 (Spec 1 Kapitel 1, `_lib/host.ts`). Bis
     * dahin waere JEDE Flaeche dieses Moduls von JEDEM Suite-Host erreichbar — Falle 61,
     * und `pnpm typecheck`, `pnpm lint` und `pnpm build` sind dabei alle drei gruen. Das
     * ist die Gegenauflage zu der Entscheidung, Kapitel 2 VOR Kapitel 1 zu bauen
     * (2026-08-21-radio-modul-leitplan.md, Abschnitt "Die Abweichung").
     *
     * ⚠️ DIESER FALL IST ZUM LOESCHEN BESTIMMT. Planteil 2 legt Seiten an; wer ihn dann
     * rot findet, entfernt ihn MIT der Aufgabe, die den Riegel baut — nicht vorher, und
     * nicht "weil er stoert". Er ist ein Termin, kein Verbot.
     */
    const flaechen = sammleQuellen(WURZEL).filter((p) => {
      const name = p.split("/").pop() ?? "";
      return (
        name === "page.tsx" ||
        name === "layout.tsx" ||
        name === "route.ts" ||
        p.includes("/_actions/")
      );
    });
    expect(
      flaechen,
      `Flaeche vor dem Host-Riegel: ${flaechen.join(", ")} — siehe Planteil 2`,
    ).toEqual([]);
  });
});
```

⛔ **GELÖSCHT, NICHT AUFGEWEICHT.** Die drei Wege, die naheliegen und alle drei falsch sind:

* `name === "layout.tsx"` aus der Filterliste nehmen — der Fall bliebe grün und **bewachte nichts**;
* eine Ausnahmeliste für `admin/(arbeit)` und `admin/(druck)` einziehen — dann ist der nächste, der
  eine Fläche anlegt, ebenfalls eine Ausnahme, und die Liste wächst, bis sie alles enthält;
* `.toEqual([])` durch eine Obergrenze ersetzen — genau die NT11-Fehlerform („ein Wächter, der
  `>= 5` statt `= 6` prüft, bleibt grün und bewacht nichts").

**Der Fall hat einen Nachfolger, und der ist schärfer:** `src/app/m/radio/riegel.test.ts` (Z5) sagt
nicht mehr „keine Fläche", sondern **„jede Fläche trägt die Riegelform ihrer Art"** — Klausel (a) mit
Existenzpflicht, Klausel (c) mit Anhebe-Fahrplan, Klausel (d) mit der Gegenregel. Deshalb liegen
Löschung und Ersatz in **einem** Commit.

⚠️ **Was NICHT angefasst wird:** der **erste** `describe`-Block derselben Datei
(`append.test.ts:23-48`, „radio: zugangscodes sind nicht loeschbar") **bleibt unverändert**, ebenso
die Hilfsfunktion `sammleQuellen` (`:8-21`) und alle Importe (`:2-4`) — beide werden vom ersten Block
weiterhin gebraucht. Nach der Löschung endet die Datei mit Zeile 48 plus abschließendem Zeilenumbruch.

Prüfe unmittelbar danach, dass nichts Verwaistes stehen bleibt:

```
rtk pnpm vitest run src/app/m/radio/_db/append.test.ts
rtk pnpm lint
```

Erwartet: **1 passed** (nur noch der Löschweg-Scan) und **0 Lint-Fehler** (kein ungenutzter Import).

- [ ] **Schritt 6: Grün sehen — der ganze Modulbaum plus die gekoppelten Nachbarn**

```
rtk pnpm vitest run src/app/m/radio src/core/registry.test.ts \
  src/core/shell/AppUmschalter.test.tsx src/core/shell/launcherEintraege.test.ts \
  src/core/shell/SuiteHeader.test.tsx src/core/routing.test.ts \
  src/core/auth/devGroups.test.ts src/core/shell/navAbschnitte.test.ts \
  scripts/seed-lokal.test.ts src/core/bootstrap.test.ts
```

Erwartet: **alle grün.** `riegel.test.ts` ist jetzt grün, weil die zwei Verwaltungs-Hüllen die
Untergrenze der Klausel (a) erfüllen.

⚠️ **Warum `seed-lokal.test.ts` und `bootstrap.test.ts` mitlaufen:** beide iterieren
`MODULE_MIGRATIONS` und sind seit Planteil 1 an `radio` gekoppelt. Sie sollten **unverändert grün**
sein — Planteil 2 fasst weder `_db/` noch `bootstrap.ts` an. Ein Fehlschlag dort ist ein Signal, kein
Rauschen.

- [ ] **Schritt 7: Das eine Tor des Blocks**

```
rtk pnpm typecheck && rtk pnpm lint
```

⚠️ **Exit-Code prüfen, nicht die Meldung** (NT7). `NO_COLOR=1` ist gesetzt, `--pretty false` steht in
`package.json:13`.

Dann der **volle** Lauf, gegen die Grundlinie:

```
rtk pnpm vitest run
```

Erwartet: **keine Fehlschläge**, gemessen gegen `441 passed (441)` / `7991 passed (7991)`
(`.superpowers/sdd/BASISLINIE-vitest.md`). Die Zahl der Dateien und Tests ist **höher** als in der
Grundlinie — Planteil 2 hat fünf Testdateien hinzugefügt. **Höher ist richtig; rot ist es nie.**

⚠️ Bei einem Fehlschlag in einer Datei, die der Diff **nicht** anfasst: **Beiseitelege-Gegenprobe**
(die eigenen Dateien temporär verschieben, voll laufen lassen, zurücklegen), nicht der Zählwert
allein.

- [ ] **Schritt 8: Der eine Commit des Blocks**

```bash
rtk git add \
  src/app/m/radio/riegel.test.ts \
  src/app/m/radio/_lib/nav.ts \
  src/app/m/radio/_ui/RadioVerwaltungsRahmen.tsx \
  src/app/m/radio/layout.tsx \
  "src/app/m/radio/admin/(arbeit)/layout.tsx" \
  "src/app/m/radio/admin/(druck)/layout.tsx" \
  src/app/m/radio/_db/append.test.ts
rtk git commit -m "feat(radio): die zwei Verwaltungs-Huellen, und der schaerfere Riegel-Scan statt des M4-Verbots"
rtk git show --stat HEAD
```

⚠️ **Die Pfade mit Klammern gehören in Anführungszeichen** — `(arbeit)` und `(druck)` sind in der
Shell sonst Subshell-Syntax. ⛔ **Kein `git add .` und kein `-A`**: im Arbeitsbaum liegen unverfolgte
Planungsdokumente und `.idea/`.

Erwartet in `git show --stat`: **sieben** Dateien, davon sechs neu und `append.test.ts` mit
**29 gelöschten Zeilen** und null hinzugefügten — die 28 Zeilen des `describe`-Blocks (50–77) **plus
die Leerzeile 49**, die ihn vom ersten Block trennte. ⚠️ Bleibt sie stehen, endet die Datei mit einer
Leerzeile vor `EOF`; `pnpm lint` meldet das nicht, aber die Datei soll nach Zeile 48 enden.

⚠️ **Der Commit muss signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.

- [ ] **Schritt 9: Das Vor-Merge-Tor — einmal, nach den Tests, nie davor**

⛔ **Dieser Schritt ist nicht optional, und er ist der einzige, der die eine Datei dieses Planteils
prüft, die kein anderes Tor sehen kann.** `_ui/RadioVerwaltungsRahmen.tsx` ist die **einzige
antd-Berührung** von Planteil 2 (Global Constraints, `:154-156`), und `CLAUDE.md` sagt für genau
diese Klasse, dass weder `typecheck` noch `lint` noch Vitest sie strukturell findet — Falle 1
(Compound-Zugriff → HTTP 500), Falle 6 (Wert aus `"use client"` in RSC), Falle 7
(`@ant-design/icons` in einer Server Component), Falle 9 (`render`-Funktion über die RSC-Grenze).
Der Plan übernimmt diesen Satz selbst weiter oben; ein Planteil, der die eine Datei baut, die nur
`build` und ein echter Abruf sehen, darf nicht ohne diesen Lauf enden.

⚠️ **Planteil 1 durfte ihn auslassen und hat es begründet** (`2026-08-21-radio-modul-plan1-datenhaltung.md:104`:
„`pnpm build` und Playwright werden von diesem Plan nicht berührt — er legt keine Route und …").
Planteil 2 legt **drei `layout.tsx`** an. Die Begründung trägt hier nicht mehr.

```
rtk pnpm build
rtk pnpm exec playwright test
```

⛔ **Danach entweder `rm -rf .next` ODER kein weiterer Vitest-Lauf.** `.next/standalone/src/` ist
eine vollständige Kopie des Quellbaums **inklusive Testdateien** (52 Fehlschläge,
`vitest.config.ts:21-34`). Deshalb steht dieser Schritt **hinter** Schritt 6, 7 und 8 und nirgends
sonst.

⚠️ **Playwright fährt gegen genau einen `baseURL`** — er kann den Host-Riegel nicht prüfen
(Spec:717). Was er hier prüft, ist, dass die drei neuen Layouts die **bestehenden** e2e-Wege nicht
gebrochen haben.

---

## Nachträge — was der Bau von Z1–Z6 an den Dokumenten gefunden hat

⬜ **Diese Tabelle wird NACH dem Bau gefüllt**, nach dem Vorbild von Planteil 1. Sie unterscheidet
scharf zwischen „Nachtrag am Plan" (der Text war falsch, der Bau war richtig) und „Entscheidung an
Ruben" (offen). Drei Einträge stehen schon vor dem Bau fest, weil sie beim Schreiben des Plans
gefunden wurden:

| # | Fund | Wo er hingehört |
|---|---|---|
| **NT-Z1** | **Spec:546-547 und Leitplan:88 widersprechen sich bei `_lib/hostRiegel.ts`** — die Spec schreibt die Datei Kapitel 7 zu, der Leitplan Planteil 2. Entschieden zugunsten des Leitplans (Warnung 4) | Nachtrag am **Spec-Text §1.4.2**, nicht am Plan. Der Bau ist richtig |
| **NT-Z2** | **Spec:714 nennt in Klausel (a) `requireRadioAdmin` „bzw. `requireRadioVerwaltung`" — und das ist KEIN Redaktionsfehler, sondern die Vorwegnahme von Spec:4367.** Die Aufruftabelle in Kapitel 5 setzt `admin/(arbeit)/layout.tsx` auf `requireRadioVerwaltung()` (`Spec:4367`) und `admin/(druck)/layout.tsx` auf `requireRadioAdmin()` (`Spec:4368`); die zwei Hüllen tragen also **verschiedene** Riegel. Ein Scan, der nur den ersten Namen kennt, wäre gegen die verbindliche Bauform **rot-by-construction** — dieselbe Fehlerform, die **B7** (`Spec:96`) an einem anderen Namen schon abgeräumt hat | **Kein Nachtrag an der Spec — der Plan war falsch.** Klausel (a) in `riegel.test.ts` ist **pfadsensitiv** gebaut: `(druck)` verlangt `requireRadioAdmin(`, `(arbeit)` erlaubt `requireRadioAdmin(` **oder** `requireRadioVerwaltung(`, jede unbekannte Group fällt in den strengen Zweig. ⛔ Ein blankes „oder" über **alle** Admin-Layouts wäre die offene Tür — durch sie könnte das **Druckblatt mit den Zugangscodes im Klartext** auf die schwächere Stufe rutschen |
| **NT-Z3** | **Der Typ heißt `RadioViewer` und hat drei Felder** (Spec:648), nicht `Viewer` mit vier (Spec:2794). Die Spec löst den Widerspruch nicht auf; entschieden anhand von `_db/schema.ts:113-117` — die `users`-Tabelle hat keine E-Mail-Spalte | Nachtrag am **Spec-Text §3.6.1**. ⬜ Braucht Planteil 4 eine E-Mail, ist das eine **Schema**-Änderung plus eine Erweiterung hier — nicht nur hier |
| **NT-Z4** | **Spec:534 und Spec:547 nennen `istRadioHost` als Aufrufziel von `hostAbweisung`**; gebaut wird `radioHostOderNull`, zeichengleich zum Präzedenzfall `lagerbuch/_lib/hostRiegel.ts:33`. Die Prädikatsform gäbe kein `null`, das mit `??` kurzschließbar wäre — und genau das macht „als erste Anweisung" strukturell wahr statt konventionell (Spec:538-540) | Nachtrag am **Spec-Text §1.4.2**. **Der Bau ist richtig.** ⛔ `host.test.ts` und `riegel.test.ts` Klausel (c) binden beide an den gebauten Namen; wer später `Spec:534` wörtlich umsetzt, macht sie rot für eine Datei, die korrekt geriegelt ist |
| **NT-Z5** | **`merkeNutzer` fehlt in Kapitel 1 und steht in Kapitel 5.** Spec:669-673 führt `requireRadioAdmin` in fünf Schritten **ohne**, Spec:4349 in sechs **mit** — und Spec:4358-4360 nennt die Zeile ausdrücklich „keine Kür": sechs Audit-Spalten speichern den `sub` und werden über `users` in einen Namen aufgelöst; ohne sie rendert jede Ereigniszeile eine **nackte UUID**. Kein A-/B-Punkt löst den Widerspruch auf | **Planteil 2 baut die Kapitel-1-Fassung**, weil es in diesem Planteil **keinen Leser von `users`** gibt — die Tabelle steht seit Planteil 1 (`_db/schema.ts:113-117`), die Ereignisflächen kommen mit Planteil 4. ⛔ **Auflage an Planteil 4:** `merkeNutzer(getDb(), viewer)` **nach** dem Riegel nachtragen. Als Nahtstelle **NS-Z7** geführt |
| **NT-Z6** | **`Spec:353` verzählt die Unterpfade von `/admin`.** Dort steht wörtlich „`/admin` und alle **acht** Unterpfade — frei."; Tabelle 1.2.2 (`Spec:303-314`) führt `/admin` plus **neun** (ausgezählt am 2026-08-22 in Aufgabe Z2, Fix-Runde 1, Fund K3). Gefunden beim Bau von `_lib/routen.test.ts` | Nachtrag am **Spec-Text §1.2.2**. **Der Bau ist richtig, und die Zahl stammt nicht von dort:** `VERWALTUNG` in `src/app/m/radio/_lib/routen.test.ts` zählt nach **B9** (`Spec:98`, „zehn Seiten-Pfade plus ein Route Handler"), und der ausgelieferte Kommentar über `expect(VERWALTUNG.length).toBe(11)` schließt den Weg, auf dem die Acht einwandern könnte, namentlich aus. ⛔ **Die Spec wird hier NICHT angefasst** — sie ist ein datiertes Belegdokument, ein Teildurchgang verstieße gegen R3; diese Zeile IST die Meldung an den Verfasser |
| **NT-Z7** | **Der Port des ANGEFRAGTEN Hosts wird an den KONFIGURIERTEN Prod-Host geklebt** (`verwaltungsZiel` in `src/app/m/radio/_lib/zugang.ts`). Steht `SUITE_HOST_RADIO=radio.iuk-ue.de` und kommt die Anfrage lokal auf `radio.localtest.me:3000`, lautet das Ziel `http://radio.iuk-ue.de:3000/admin` — eine Adresse, die es nicht gibt. **Gemessen** am 2026-08-22 (Fix-Runde 1 zu Z4, Fund K4) | **Kein Bau-Posten, und der Grund ist messbar:** die Bauform ist 1:1 aus `src/app/m/lagerbuch/_lib/zugang.ts:205-214`, **vor** dem Cutover ist `prodHostsFor` leer und **nach** ihm kommt kein Port. Die einzige Mischlage, die ein totes Ziel erzeugt, ist **Prod-Host gesetzt UND lokaler Port**. ⛔ Der Satz gehört ins **Cutover-Runbook** (`docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md`) — und **nicht** als Einfügung oberhalb von dessen `:2091`: auf genau diese Zeile zeigt **ausgelieferter** Quelltext (`_lib/zugang.ts` an ⬜ L7 und `_lib/zugang.test.ts`), eine Einfügung darüber verschöbe einen Anker, der in `src/` lebt (R2). Diese Zeile IST die Meldung an den Runbook-Verfasser |

---

## Was Planteil 2 NICHT liefert

⛔ **Dieser Abschnitt ist kein Mangelbericht, sondern eine Abgrenzung.** Wer hier etwas vermisst und
es „schnell mitnimmt", baut außerhalb der Reihenfolge, die die Spec mit ihren Stufen sichert.

| Was | Wo es hingehört | Warum nicht hier |
|---|---|---|
| **Jede `page.tsx`** — Gate, Ausleihflächen, die zehn Verwaltungsseiten | Planteil 3 (Gate + `/`), Planteil 4 (die zehn) | Auflage 1: die erste Aufgabe, die eine Fläche anlegt, muss den Riegel **vorfinden**. Planteil 2 **ist** der Riegel |
| **Jeder `route.ts`** — `t/[code]`, `abmelden`, der CSV-Export, `sw.js` | Planteil 3, 4, 5 | dito. `riegel.test.ts` führt bereits den Anhebe-Fahrplan ihrer Untergrenze |
| **Jede Server Action und `_actions/guards.test.ts`** | Planteil 3, §3.8 | ⛔ **B14**: zwei Scans über dieselbe Fläche, von denen einer die Ausnahmeliste nicht kennt, sind ein Scan zu viel. `riegel.test.ts` führt Klausel (b) **ausdrücklich nicht** |
| **`(ausleihe)/layout.tsx`** | Planteil 3 | Es trägt das Zugangsprädikat der Ausleihe (`_lib/ausleihZugang.ts`), und das gibt es noch nicht. Ein Layout mit leerem Riegel wäre eine Hülle, die Sicherheit behauptet |
| **Die zweite Rechtestufe (Updater)** — `_lib/rollen.ts`, `SUITE_UPDATER_GROUP_RADIO`, die Feld-Allowlist | Planteil 4 | Entschieden (C.6/B4, 2026-08-21), aber Spec:191 sagt: „das ist nicht Sache dieses Kapitels", und Spec:4421 legt sie in eine eigene Datei. Planteil 2 hält die **Naht** offen und verriegelt die eine Richtung, in der sie zur Aufweichung würde (`zugang.test.ts`) |
| **Der Fall der HTTP-Grenze** — die sechs `/v1`-Routen als Drizzle-Aufrufe | Planteil 4 | ⛔ Entscheidung 15: sie fällt erst mit Planteil 4. Wird sie früher gekappt, steht der Alt-Kiosk ohne Bestand da; schwenkt die Verwaltung zuerst, verliert er seine Datenquelle. **Beide Domains ziehen im selben Fenster um** (Leitplan:104-106). `radio-admin/server/src/routes/loanApi.ts:126-187` bleibt **unverändert stehen** |
| **Die CWE-348-Umstellung in `src/core/ratelimit.ts`** | eigene kleine Vorarbeit **vor Planteil 3**, eigener Commit | `clientIpAus` (`ratelimit.ts:80-81`) übernimmt `cf-connecting-ip` ungeprüft. Betrifft heute schon `feedback` und `files` — deshalb eine eigene Arbeit, nicht ein Anhängsel an ein Modul |
| **Das Entfernen des Suite-Admin-Kurzschlusses in `src/core/groups.ts:125`** | eigene kleine Vorarbeit **vor Planteil 4**, eigener Commit | Planteil 2 **umgeht** ihn modulintern (Pflicht 17) und hält das per Scan fest. Ihn zu entfernen ist eine Änderung an **allen** Modulen |
| **`radioBootFehler()`, `/api/health/radio`, der Abräum-Worker, die PWA-Frage** | Planteil 5 | ⚠️ `/api/health/*` ist **Passthrough** und wird von `core` beantwortet; es entsteht **kein** `src/app/m/radio/api/health/…` (Spec:359-360). Der Abräum-Worker gehört zum **ersten Deploy**, nicht zum Cutover (Leitplan:107-109) |
| **Eine Release-Notiz** | Planteil 5 / Cutover | `CLAUDE.md`, Abschnitt „Release Notes — für Anwender, nur im Portal", verlangt eine Notiz für alles, was jemand **bemerkt**. Planteil 2 liefert nichts Bemerkbares: keine Fläche, kein Knopf, kein Wort auf dem Bildschirm. ⚠️ Die Kachel im App-Umschalter erscheint zwar (`showInSwitcher: true`) — sie führt aber auf 404, solange keine Seite steht. **Das ist der Grund, warum Planteil 2 nicht ausgeliefert wird, bevor Planteil 3 steht** |
| **Ein e2e-Fall für den Host-Riegel** | ⛔ **nirgends** | Spec:717: Playwright fährt gegen genau **einen** `baseURL`; ein zweiter Host existiert im Lauf nicht. Deshalb steht die Absicherung in `host.test.ts` und `riegel.test.ts` — und ein e2e-Fall, der so täte, als prüfte er den Riegel, wäre schlimmer als keiner |
| **Ein Beweis, dass die Riegel bei einem echten Abruf GREIFEN** | ⬜ **Z-L1**, Planteil 4 | ⛔ **Der wichtigste Eintrag dieser Tabelle.** Unter beiden Verwaltungs-Hüllen liegt keine `page.tsx`; Next rendert sie nicht. Was Planteil 2 belegt, ist **„die Zeile steht da"** — nicht **„der Riegel greift"**. Kein Test dieses Planteils darf etwas anderes behaupten. Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft** |
| **Die Werte von ⬜ L7 und ⬜ L8** | Cutover-Runbook, **C19/C29/C30** | „Entsperrt" heißt: der Code, den jene Aufrufe befragen, existiert. Abgelesen wird per echtem Abruf (`2026-08-18-plan4-radio-cutover.md:2091` und `:1910`). Ein hier vorweggenommener Statuscode wäre eine Erfindung |

---

## Nahtstellen zu Planteil 3

Planteil 3 baut **Kapitel 3 und 4**: `zugangscodes`-Ausstellung und -Sperrung, das Gate (Route
Handler + Server Action), die Sitzung, `_lib/ausleihZugang.ts` und die Ausleihfläche an `/`
(Leitplan:89). Sechs Nahtstellen, jede mit ihrer Auflage.

**NS-Z1 — `requireRadioHost` als ERSTE Anweisung jedes Zugangsprädikats.**
`_lib/ausleihZugang.ts` bekommt den Host-Riegel **innen**, lesend wie schreibend (Spec:721-723,
Kapitel-4-Pflicht 16). ⛔ **Und die Umkehrung ist die häufigere Fehlerquelle:** wer das Prädikat
benutzt, ruft den Host-Riegel **nicht noch einmal**. Ein zweiter Aufruf ist die Behauptung, das
Prädikat sei host-blind — und die nächste Person entfernt dann den falschen der beiden. Vorbild für
denselben Schluss: `lagerbuch/_lib/bauform.test.ts:1597-1614`.

**NS-Z2 — die Handlerzahl in `riegel.test.ts` steigt auf 2.**
Planteil 3 baut `t/[code]/route.ts` und `abmelden/route.ts`. ⛔ **Mit dem ersten Handler wird
`HANDLER_ANZAHL` von `0` auf `2` gesetzt** — eine Zeile, ganz oben in `riegel.test.ts`. ⚠️ **Die
Konstante heißt `HANDLER_ANZAHL`, nicht `HANDLER_MINDESTENS`, und Klausel (c) prüft sie mit `toBe`,
nicht mit `toBeGreaterThanOrEqual`** — der Fall wird also **rot**, sobald der erste Handler steht.
Das ist Absicht: mit `>=` bliebe der Scan grün und bewachte weniger, als sein Name sagt (NT11). Beide
Handler nehmen `radioHostOderNull`, **nie** die werfende Form, **und nie `requireRadioAdmin`** (B11,
dritte Prüfung der Klausel c).

**NS-Z3 — `/t/<code>` ist nach dem ersten Druck nicht mehr umbenennbar.**
Der Pfad ist gegen `PASSTHROUGH` geprüft und steht fest (`_lib/routen.test.ts`, Z2; Spec:367-374).
`/abmelden` steht auf keinem Gegenstand und ist frei wählbar, darf aber **nicht** unter `t/` liegen:
ein `t/abmelden/route.ts` gewänne zwar gegen das dynamische Segment (statisch schlägt dynamisch),
legte aber eine Falle in einen **gedruckten** Pfad. ⚠️ **Auf `/abmelden` gehört kein `<Link>`** —
Nexts Prefetch fordert das Ziel beim bloßen Darüberfahren an und beendete die Sitzung ungefragt
(Spec:376-378). Der sichtbare Abmelden-Weg ist ein POST-Formular auf eine Server Action.

**NS-Z4 — der `_actions/`-Scan gehört Planteil 3, nicht `riegel.test.ts`.**
`src/app/m/radio/_actions/guards.test.ts` (Kapitel 3 §3.8) prüft **jede exportierte Action** und
führt die **Ausnahmeliste** (`gate.ts#einloesenAmGate`, `sitzung.ts#beenden`). ⛔ Der naheliegende
Grün-Fix — dort einen Sitzungsriegel einsetzen — macht das Gate unbenutzbar und **sieht wie eine
Verbesserung aus** (§3.3.3). Das ist B14; `riegel.test.ts` führt Klausel (b) ausdrücklich nicht.

**NS-Z5 — `(ausleihe)/layout.tsx` und das Gate rendern KEINE Shell.**
56/72 wird geerbt, 44/48 sind Token-gedeckt, **64 ist eine eigene `ConfigProvider`-Ebene** innerhalb
des Zweigs (Spec:442-447, 734-736). Mit Shell erbte der Zweig `controlHeight: 44` (Falle 4), und
`pnpm build` findet das nicht. ⚠️ **Kein `@ant-design/icons`-Import in einer Server Component dieses
Zweigs** (Falle 7) — der Import wirft, nicht der Render, und `"use client"` behebt das nicht,
sondern macht es still.

**NS-Z6 — der `/admin`-Link auf der Ausleihfläche hängt am PRÄDIKAT, nicht am Riegel.**
`istRadioAdmin(await viewerOderNull())`, **nicht** `requireRadioAdmin()` (Spec:2919-2920). Der Riegel
schickte jeden anonymen Aufruf des Gates nach `/login` statt aufs Gate — genau der Ausfall, den
`requiresAuth: false` verhindern soll. ⚠️ Die Gate-/Ausleihfläche ist eine **Server Component**: dort
gelten Falle 1 (Compound-Zugriff auf antd → HTTP 500) und Falle 7 (Spec:2926-2930).

**Und eine Naht, die keine Auflage ist, sondern eine Warnung:** das Ausleih-Cookie trägt **kein
`domain`**, und gelöscht wird über **dieselbe** Optionen-Funktion mit `maxAge: 0` (Spec:724-725). Der
Alt-Kiosk legte seinen Zugang im `localStorage` ab (`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13`),
also origin-gebunden — die Fehlerrichtung war ein **stiller Ausfall**. Mit einem Cookie kehrt sie sich
um: ein Cookie, das über einen fremden Suite-Host entstanden ist, wäre dort ein **vollgültiger
Ausweis**. Deshalb steht der Host-Riegel **innen**.

---

## Nahtstellen zu Planteil 4 — was dort NACHGETRAGEN werden muss

⛔ **Drei Zeilen dieses Planteils sind bewusst unfertig, und Planteil 4 ist der Termin.** Sie stehen
hier zusammen, damit sie nicht einzeln in Kommentarköpfen verloren gehen.

**NS-Z7 — `merkeNutzer(getDb(), viewer)` NACH dem Riegel in `requireRadioAdmin`.**
Kapitel 1 §1.5 (Spec:669-673) führt fünf Schritte, Kapitel 5 (Spec:4349) sechs; Planteil 2 baut die
Kapitel-1-Fassung, weil `users` hier keinen Leser hat (NT-Z5). ⛔ Ohne die Zeile rendert **jede
Ereigniszeile eine nackte UUID** — sechs Audit-Spalten speichern nur den `sub` und werden über
`users` in einen Namen aufgelöst (Spec:4358-4360). Der Termin ist die erste Fläche, die
`geraete_ereignisse` liest. ⚠️ `riegel.test.ts` Klausel (d) liest denselben Funktionskörper mit —
die neue Zeile steht **nach** `istRadioAdmin`, nicht davor.

**NS-Z8 — `requireRadioVerwaltung` in `_lib/zugang.ts` und der Wechsel in `admin/(arbeit)/layout.tsx`.**
Spec:4287-4288 legt `requireRadioVerwaltung` und `istRadioUpdater` in **diese** Datei, Spec:4420-4422
legt die Gruppenquelle `SUITE_UPDATER_GROUP_RADIO` und die Feld-Allowlist in `_lib/rollen.ts` mit
eigenem Test. Spec:4367 setzt `admin/(arbeit)/layout.tsx` auf `requireRadioVerwaltung()`, Spec:4368
lässt `admin/(druck)/layout.tsx` bei `requireRadioAdmin()`, Spec:4369-4375 verteilt die zehn Seiten
einzeln. ⛔ **Bis dahin sperrt das `(arbeit)`-Layout jede Updater-Person mit 404, bevor irgendeine
Seite läuft** — und typecheck, lint und build bleiben grün. `riegel.test.ts` Klausel (a) ist bereits
pfadsensitiv gebaut und lässt beide Namen im Arbeitszweig zu; der Wechsel macht den Scan **nicht**
rot. ⛔ Die zweite Stufe kommt als **zweite Funktion**, nie als `||` in `istRadioAdmin` —
`zugang.test.ts` hält diese eine Richtung fest. ⬜ **E1b** (der Gruppenname) ist vorher fällig,
`docs/superpowers/plans/SPERREN-radio-spec2.md:110`.

**NS-Z9 — `_lib/nav.ts` wird zu `radioNav(stufe: RadioRolle)`.**
Spec:4289 und Spec:4203-4210: **sieben** Einträge, **drei davon nur für die Admin-Stufe** (Import,
Softwareversionen, Zugänge). ⛔ Umzustellen sind **beide** Seiten — die Datei **und** die
`nav`-Weitergabe in `admin/(arbeit)/layout.tsx`. Ohne den Parameter sieht eine Person der
Updater-Stufe drei Menüpunkte, die sie in ein `notFound()` führen. ⚠️ Der Test, der `hrefs` gegen die
Routenkarte koppelt, gehört ebenfalls dorthin — über einer leeren Liste wäre er leer-grün.

**NS-Z10 — der Export-Handler riegelt nicht-werfend (B11).**
`admin/(arbeit)/geraete/export/route.ts` nimmt `radioHostOderNull` **plus**
`istRadioAdmin(await viewerOderNull())` und baut seine Antwort selbst — **404, nicht 403** (B10),
Spec:100/2778/4379, bestätigt in B17 (Spec:117). ⛔ **Kein `requireRadioAdmin()` in diesem Handler**:
es endet in `redirect('/login?…')` bzw. `notFound()`, und ein anonymer `GET` landete im Login-Umweg.
`riegel.test.ts` Klausel (c) prüft alle drei Hälften — die geforderte Form, die verbotene werfende
Host-Form und den verbotenen `requireRadioAdmin`.

---

## Zusagen dieses Planteils an die anderen

| # | Zusage | an |
|---|---|---|
| 1 | `getModule("radio")` ist auflösbar, `moduleForHost("radio.localtest.me")` liefert das Modul **ohne jede Env**, und `ICONS[mod.icon]` ist definiert | **alle** Planteile |
| 2 | `requireRadioHost` (wirft) · `radioHostOderNull` (wirft nie) · `hostAbweisung` (`Response \| null`) stehen mit den Signaturen aus Spec §1.4.2, und die Verankerungstabelle steht als Kommentarblock **in `_lib/host.ts`** | **3, 4, 5** |
| 3 | `requireRadioAdmin` aus `_lib/zugang.ts` ist der einzige Verwaltungsriegel **für Seiten, Layouts und Server Actions**. Jede Server Action ruft ihn als **erste** Anweisung; er ruft `requireRadioHost` **intern**, ebenfalls als erste. ⛔ **Verwaltungs-Route-Handler unter `admin/` NICHT** — sie riegeln mit `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())` und bauen ihre 404 selbst (**B11**, Spec:100/2778/4379, bestätigt B17 Spec:117); ein `requireRadioAdmin` dort erzeugt den Login-Umweg, den B11 abgeschafft hat. `riegel.test.ts` Klausel (c) prüft es | **4** |
| 4 | `istRadioAdmin` bleibt die **Admin**-Stufe und wird durch die Updater-Stufe **nicht** aufgeweicht — `zugang.test.ts` hält die Richtung fest | **4** (C.6/B4) |
| 5 | Die zehn Verwaltungspfade aus §1.2.2 sind **vergeben**, verteilt auf `admin/(arbeit)` (mit Rahmen) und `admin/(druck)` (ohne). Beide Hüllen stehen. ⚠️ **Aber Planteil 4 hängt NICHT nur Seiten hinein:** `admin/(arbeit)/layout.tsx` wechselt seinen Personen-Riegel von `requireRadioAdmin()` auf `requireRadioVerwaltung()` (Spec:4367; `(druck)` bleibt, Spec:4368), und die `nav`-Weitergabe wird umgestellt. Siehe **NS-Z8** und **NS-Z9** | **4** |
| 6 | `_lib/nav.ts` existiert und ist der Ort der Verwaltungsnavigation. Sie darf `abschnitt:` vergeben (`shell: "full"`). ⛔ **Die FORM ist nicht endgültig:** Spec:4289/4203-4210 verlangt `radioNav(stufe: RadioRolle)` mit **sieben** Einträgen, drei davon nur für die Admin-Stufe. Planteil 4 stellt **Datei UND Aufrufstelle** um (**NS-Z9**) — die Konstante hier ist der Zustand von Planteil 2, weil `RadioRolle` erst mit `_lib/rollen.ts` entsteht | **4** |
| 7 | Jeder äußere Pfad aus §1.2.1/§1.2.2 **plus `/sw.js`** ist gegen `PASSTHROUGH` geprüft und als Test festgehalten. `/login` und `/api/health/radio` erreichen das Modul **nie** | **3, 4, 5** |
| 8 | Kapitel 1 legt **keinen** Route Handler unter `api/` an. Erlaubt ist jeder Name unter `src/app/m/radio/api/` außer `auth/**` und `health/**` | **4, 5** |
| 9 | `riegel.test.ts` führt einen **namentlichen Anhebe-Fahrplan** für `HANDLER_ANZAHL`: Planteil 3 → 2, Planteil 4 → 3, Planteil 5 → 4 — **und er hat einen Träger, nicht nur einen Kommentar**: Klausel (c) prüft `toBe(HANDLER_ANZAHL)`, nicht `toBeGreaterThanOrEqual`. Wer einen Handler baut und die Zahl stehen lässt, bekommt den Fall **rot** | **3, 4, 5** |
| 10 | Vier Zeilen ans Runbook: (1) `SUITE_HOST_RADIO=radio.iuk-ue.de` **vor** dem Umschwenk setzen — vorher liefert Produktion 404, ein Parallelfenster gibt es nicht. (2) `SUITE_ADMIN_GROUP_RADIO` gesetzt **und nicht leer**, Gruppe in Pocket ID vorhanden. (3) Der pfaderhaltende `redirectRegex` von `radio-admin.iuk-ue.de` lebt auf dem Server; diese Domain darf **nicht** in `SUITE_TRAEFIK_RULE` stehen. (4) Nach dem Umschwenk gilt von den alten Kiosk-Pfaden nur `/` | **Spec 2 / Runbook** |
| 11 | ⚠️ Die Doppelvergabe-Prüfung von `validateHostConfig` sieht **nur** Env-Hosts, **nicht** die `prodHosts` anderer Module im Registry-Code (heute `portal`s `iuk-ue.de`, `registry.ts:59`). Das ist **Handarbeit im Runbook** | **Spec 2 / Runbook** |
| 12 | `showInSwitcher: true` entscheidet mit, **wer** die Release-Notizen zum Modul sieht (`portal/_lib/neuigkeiten/auswahl.ts:48`). Die Notiz braucht eine Zeile in `register.ts`, sonst ist der Cutover ein roter Test | **5 / Cutover** |

---

## Selbstprüfung gegen den Entwurf

| Frage | Antwort |
|---|---|
| **Deckt jede Sektion von Spec-Kapitel 1 eine Aufgabe ab?** | §1.1 → **Z1** · §1.2 → **Z2** (und die Pfadnamen in Z6) · §1.3 → **Z6** · §1.4 → **Z3** · §1.5 → **Z4** · §1.6 → alle fünf Testdateien (Z1, Z2, Z3, Z4, Z5) · §1.7 → „Zusagen dieses Planteils" · §1.8 → Sperrtafel, ⬜ E1 / ⬜ E1b / 1.8.2 |
| **Steht irgendwo ein erfundener Wert?** | Nein. Jede Zahl, jeder Pfad und jede Signatur ist aus der Spec zitiert (mit Zeile), aus dem Bestand gemessen (mit `datei:zeile`) oder eine ⬜. Der Statuscode der `/admin`-Weiterleitung ist ⬜ **L7** und wird **nicht** vorweggenommen; die Updater-Gruppe ist ⬜ **E1b** und steht in keinem Wert, nur in einem Verweis; `Z-L1` (Layout-Ausführung ohne Seite) ist als **unbekannt** ausgewiesen statt als „greift schon" |
| **Passen Typen und Namen über die Aufgaben hinweg zusammen?** | `RadioViewer` (drei Felder, NT-Z3) wird in Z4 definiert und in Z5 nur per Quelltext gelesen. `requireRadioHost`/`radioHostOderNull` (Z3) werden in Z4 und Z6 aufgerufen, in Z5 gescannt. `RADIO_NAV` (Z6) und `RadioVerwaltungsRahmen` (Z6) liegen in derselben Aufgabe wie ihr Aufrufer — keine Aufgabe importiert etwas, das eine spätere baut |
| **Hat jede Aufgabe einen eigenen Torlauf?** | Z1–Z4 ja. Z5 und Z6 teilen sich **ein** Tor und **einen** Commit — begründet: Z6 löscht den alten Wächter, Z5 stellt den neuen, und zwischen zwei Commits wäre der Baum unbewacht |
| **Läuft `build` und Playwright, und genau einmal?** | Ja — **Z6, Schritt 9**, nach den Tests und nach dem Commit. Das ist neu und nicht kosmetisch: `_ui/RadioVerwaltungsRahmen.tsx` ist die einzige antd-Berührung dieses Planteils, und `CLAUDE.md` sagt für die Fallen 1, 6, 7 und 9, dass weder `typecheck` noch `lint` noch Vitest sie strukturell sehen kann. Planteil 1 durfte das Tor auslassen und hat es begründet (`plan1-datenhaltung.md:104`: „legt keine Route"); Planteil 2 legt **drei `layout.tsx`** an, die Begründung trägt hier nicht mehr. ⛔ Danach `rm -rf .next` oder kein weiterer Vitest-Lauf |
| **Wird irgendwo eine Zusicherung gebaut, die die Bauform nicht halten kann?** | Geprüft und bewusst vermieden. Die drei Stellen, an denen es nahelag: (1) ein Test, der behauptet, der Layout-Riegel **greife** — steht nicht drin, es ist ⬜ Z-L1; (2) ein Test, der ⬜ L7/L8 vorwegnimmt — steht nicht drin, der Ablesepunkt ist das Cutover-Runbook; (3) ein Scan über eine leere Menge, der leer-grün wäre — abgewendet durch Untergrenzen in Klausel (a) und im `"use client"`-Block und, in Klausel (c), durch die **exakte** Zählung `toBe(HANDLER_ANZAHL)`. ⚠️ Der Anhebe-Fahrplan allein reichte **nicht**: ein Fahrplan im Kommentar ist keine Mechanik, und `>= 0` ist über jeder Menge wahr — die erste Fassung dieses Plans hatte hier genau die NT11-Form, die ihr eigener Testkopf verurteilt |
| **Wird der M4-Fall gelöscht oder aufgeweicht?** | **Gelöscht**, namentlich und wörtlich zitiert (Z6, Schritt 5: `_db/append.test.ts:50-77`). Die drei naheliegenden Aufweichungen sind einzeln benannt und verboten. Der erste `describe`-Block (`:23-48`) bleibt unverändert |
| **Sieht der Plan den Host-Riegel VOR jeder Fläche vor?** | Ja, und schärfer als verlangt: Planteil 2 legt **null** `page.tsx` und **null** `route.ts` an. Die Riegel stehen ab Z3/Z4, die Hüllen ab Z6, und die erste Fläche entsteht in Planteil 3 |
| **Ist die zweite Rechtestufe vorgesehen, ohne gebaut zu werden?** | Ja, und die **Riegelform** sieht sie vor, nicht nur die Prosa — das ist die Auflage aus `KONTEXT-radio-planteil2.md:30-31`. **Vier Träger:** (1) `riegel.test.ts` Klausel (a) ist **pfadsensitiv** — `(arbeit)` lässt `requireRadioAdmin(` **oder** `requireRadioVerwaltung(` zu (Spec:4367), `(druck)` nur den ersten (Spec:4368); ohne das wäre der Scan gegen die verbindliche Bauform rot-by-construction. (2) `_lib/zugang.ts` benennt die Trennung, die die Spec macht: der **Riegel** beider Stufen gehört in **diese** Datei (Spec:4287-4288), die **Gruppenquelle** und die Feld-Allowlist in `_lib/rollen.ts` mit eigenem Test (Spec:4420-4422). (3) `zugang.test.ts` verriegelt die eine Richtung, in der Planteil 4 sie versehentlich zur **Aufweichung** machen würde — mit einer Gegenprobe, die den roten Zustand herstellt (Z4, Schritt 3). (4) **NS-Z8** nennt den Wechsel in `admin/(arbeit)/layout.tsx` als ⛔-Auflage samt Preis: bis dahin sperrt das Layout jede Updater-Person mit 404, still |
| **Bleibt die HTTP-Grenze stehen?** | Ja. Planteil 2 berührt keine `/v1`-Route und legt keinen Handler unter `api/` an. Der Punkt steht in den Global Constraints, in „Was Planteil 2 NICHT liefert" und in der Abgrenzung der Dateiliste |
| **Was ist nach diesem Planteil messbar besser?** | Vorher: `radio` war eine Datenbank ohne Modul — kein Registry-Eintrag, keine Route, kein Riegel, und der einzige Schutz war ein Verbot („keine Fläche"). Nachher: das Modul ist registriert und im Umschalter sichtbar, jeder seiner **achtzehn** äußeren Pfade ist gegen `PASSTHROUGH` geprüft, **vier** Riegelformen stehen mit Tests, der Verwaltungszugang löst seine Gruppe **ohne** den Suite-Admin-Kurzschluss auf, und aus dem Verbot ist eine **Bauform-Zusicherung** geworden, die mit jedem weiteren Planteil schärfer wird statt zu verfallen |
