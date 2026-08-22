# Planteil 3 — Zugang und Ausleihe (`radio`, Spec 1, Kapitel 3 und 4)

> **For agentic workers**
>
> Führe diesen Plan mit `superpowers:subagent-driven-development` aus — **eine Aufgabe je Subagent**,
> und **ein Review zwischen je zwei Aufgaben**. Nicht „empfohlen": ohne den Schnitt hat der Review
> keinen Ort, und dieser Planteil legt die ersten Flächen des Moduls an — jede von ihnen ist ab der
> ersten Zeile von `riegel.test.ts` bewacht, und ein übersehener Riegelfehler ist typkorrekt,
> lint-sauber und für `pnpm build` unsichtbar.
>
> ⛔ **Kein Implementer-Subagent unter Sonnet.** (Haiku hat in diesem Repo gemessen Testzusagen
> aufgeweicht statt Code zu reparieren.)
>
> ⛔ **Lies zuerst, vollständig, in dieser Reihenfolge:**
> 1. `.superpowers/sdd/planteil3/KONTEXT.md` — Hausregeln, Werkzeugfallen, **und der Nachtrag vom
>    2026-08-22**, der den Stand nach Planteil 2 festhält.
> 2. `.superpowers/sdd/VORARBEIT-selfhop.md` — der Egress-IP-Kollaps. Er ist **Bauplan, nicht
>    gebaut**; Aufgabe **A3** hängt davon ab, dass du das weißt.
> 3. `src/app/m/radio/riegel.test.ts` — **bevor** du die erste Fläche anlegst. Er ist scharf.
>
> Die Kontextdatei bindet über diesen Plan, wo beide dasselbe sagen; wo dieser Plan mehr sagt, gilt
> dieser Plan. **Kapitel A (`:51-78`) und Kapitel B (`:79-122`) der Spec binden über jeden
> Kapiteltext, der ihnen widerspricht** — auch über jede Zeile dieses Plans.

---

## Stand

* **Repo:** `/Users/rubeen/dev/personal/drk/iuk-suite`
* **Branch:** `feat/radio-modul-planteil2` (Planteil 3 baut darauf weiter; ein eigener Branch ist
  zulässig, aber nicht nötig — Planteil 2 ist schlussgeprüft und gemergt-fähig)
* **Vorgänger:** Planteil 1 (Datenhaltung, Aufgaben M1–M6) und Planteil 2 (Zuschnitt, Aufgaben
  Z1–Z6) sind **gebaut und schlussgeprüft**.
* **Grundlinie der Testsuite:** ⚠️ **Die Zahl aus KONTEXT.md `:144-146` (446/8074) ist auf diesem
  Branch überholt.** Seit dem Proxy-Rewrite-Umbau (`92a40d0`…`156df26`, alle oberhalb der
  Planteil-2-Commits) misst der letzte protokollierte Volllauf **447 Testdateien und 8081 Tests,
  Exit 0** — `docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:21` (Zeile P5).
  ⛔ **Miss die Grundlinie einmal selbst, bevor du die erste Aufgabe fährst, und schreib die Zahl in
  den Bericht** — rate sie nicht aus einer der beiden Angaben. ⛔ **Jeder Fehlschlag, den du danach
  siehst, ist ein NEUER** — du hast ihn verursacht, bis die Beiseitelege-Gegenprobe das Gegenteil
  zeigt.

---

## Goal

Am Ende dieses Planteils **funktioniert der anonyme Ausleihweg des Moduls `radio` vollständig**: ein
`radio`-Admin stellt unter `/admin` einen 28-stelligen Zugangscode aus und kann ihn sperren; ein
gescannter QR-Code auf `/t/<code>` löst ihn ein und prägt eine signierte, host-only Sitzung; das
Gate an `/` nimmt denselben Code auch von Hand entgegen; wer eine Suite-Anmeldung hat, kommt ohne
Code herein; und hinter dem Riegel liegen die drei Ausleih-Flächen `/geraete`, `/ausleihen`,
`/rueckgabe` mit Suche, Statusfilter, Standortgruppierung, Mehrfach-Ausleihe in **einer**
Transaktion, Entleiher-Vorschlägen und Rückgabe mit Zustandsnotiz — in antd 6, ohne Shell, auf der
eigenen `radio`-Datenbank.

**Nicht** enthalten: die zehn Verwaltungsseiten, der Fall der HTTP-Grenze, die zweite Rechtestufe,
der Betrieb (Boot-Prüfung, Takt, PWA, Abräum-Worker) und die e2e-Dateien. Vollständige Liste unter
„Was Planteil 3 NICHT liefert".

---

## Architecture — zwanzig Aufgaben in zwei sichtbaren Blöcken

Kapitel 3 und 4 sind zusammen **2158 Spec-Zeilen** (Kapitel 3: `:1979-3286`, Kapitel 4:
`:3287-4136`). Zum Vergleich: Kapitel 1 waren 634 Zeilen und ergaben sechs Aufgaben. Dieser Planteil
teilt deshalb sichtbar:

### Block A — der Zugang (Kapitel 3), Aufgaben **A1–A11**

Erst die reinen Funktionen (`_lib/`), dann der Schreibpfad, dann das Zugangsprädikat, dann die
Actions, dann die zwei Route Handler, zuletzt das Gate an `/`. **Block A steht vollständig für
sich** — er braucht keine einzige Zeile aus Block B.

### Block B — die Fläche (Kapitel 4), Aufgaben **A12–A20**

Erst die reinen Funktionen (`_lib/`), dann die Datenschicht (`_db/leihen.ts`), dann der Rahmen,
dann die Actions, dann die drei Seiten mit ihren Client-Inseln. ⛔ **In dieser Reihenfolge und
keiner anderen** — die Begründung steht unter der Reihenfolge-Tabelle. **Block B hängt vollständig
an Block A** — jede seiner Flächen ruft `requireAusleihZugang` aus A7, und ohne A11 gibt es keinen
Weg auf sie.

### Die Blöcke mit EINEM gemeinsamen Tor — ausdrücklich angekündigt

Der Normalfall ist **eine Aufgabe = ein Tor = ein Commit**. **Genau ein** Block aus diesem Planteil
teilt sich ein Tor:

> ⛔ **A9 + A10 sind EIN Commit und EIN Tor.** Zwei unabhängige Gründe, jeder für sich hinreichend:
>
> 1. `riegel.test.ts` führt `HANDLER_ANZAHL` mit **`toBe`**, nicht `toBeGreaterThanOrEqual`
>    (`riegel.test.ts:100`, Begründung `:63-72`). Der Anhebe-Fahrplan im Kopf der Datei (`:77`)
>    setzt für Planteil 3 **`HANDLER_ANZAHL = 2`** — `t/[code]/route.ts` **und**
>    `abmelden/route.ts`. Landet nur einer der beiden mit der angehobenen Konstante, ist Klausel (c)
>    rot; landet er ohne sie, ist sie ebenfalls rot. **Keiner der beiden Handler kann allein grün
>    werden.**
> 2. `_lib/bauform.test.ts` (A9) trägt den Reihenfolge-Scan über **drei** Flächen —
>    `t/[code]/route.ts`, `_actions/gate.ts`, `_actions/sitzung.ts` (Spec `:3108`) — und seine
>    Existenzpflicht vergleicht die gefundene Liste gegen die Sollliste (Vorbild
>    `lagerbuch/_lib/bauform.test.ts:1450-1457`). Über zwei von drei Flächen ist er rot, nicht
>    leer-grün — genau so gebaut, damit er nicht leer-grün sein kann.
>
> Dazwischen wäre der Baum in einem Zustand, in dem ein Wächter über einer unvollständigen Menge
> steht. Deshalb **ein** Commit. Der Review zwischen A9 und A10 entfällt damit; der Review liegt
> **hinter** A10 und liest beide Aufgaben.

Alle übrigen achtzehn Aufgaben stehen einzeln, mit eigenem Tor und eigenem Commit.

---

## Tech Stack (belegt)

| Was | Version | Beleg |
|---|---|---|
| Next.js | **16.3.0** | `package.json:33` |
| React | 19.2.8 | `package.json:37` |
| Ant Design | **^6.5.3** | `package.json:25` |
| `jose` (JWT) | ^6.2.7 | `package.json:31` |
| `drizzle-orm` | ^0.45.2 | `package.json:30` |
| Vitest | ^4.1.5 (installiert 4.1.10) | `package.json:63`, KONTEXT.md `:98` |
| Node | 26 | KONTEXT.md `:98` |
| DOM-Harness | `src/app/m/qr/_lib/test-dom.tsx` | `CLAUDE.md` „Tests", **kein zweites erfinden** |

---

## Spec

* **Spec 1:** `docs/superpowers/specs/2026-08-17-radio-modul-design.md`
  * **Kapitel 3 (Der Zugang):** `:1979-3286`
  * **Kapitel 4 (Die Ausleihfläche):** `:3287-4136`
  * **Kapitel A (15 gesetzte Entscheidungen):** `:51-78`
  * **Kapitel B (19 entschiedene Widersprüche):** `:79-122`
* ⛔ **Vorrangregel:** Kapitel A und B **stechen über jeden Kapiteltext, der ihnen widerspricht**.
  Innerhalb von Kapitel 3 steht der von **B2** überholte Name `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS` an
  **zwei** Stellen — `:2042` (§3.1) und `:2502` (§3.4.2, genau der Abschnitt, den **A4** als Vorlage
  liest). Verbindlich ist an **beiden** `RADIO_AUSLEIH_SITZUNG_SECRET` (`:91`). ⚠️ **Die zweite
  Fundstelle ist die gefährlichere**, weil A4 §3.4.2 fünfmal zitiert; eine Vollzähligkeitsangabe
  „es gibt nur eine" nähme dem Ausführenden genau den Anlass, dort hinzusehen. Für Kapitel 4 gilt **B7** (`requireAusleihZugang`, nicht `requireRadioZugang`), **B12**
  (Datenfunktion `sucheEntleiher`, Action `entleiherVorschlaege`) und **B15** (Kapitel 4 ist die
  **gewinnende** Seite — der Ausfall-Puffer ist verworfen).
* **Leitplan:** `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md`, Planteil-3-Zeile `:89`.
* **Planteil 2 (Formatvorbild):** `docs/superpowers/plans/2026-08-21-radio-modul-plan2-zuschnitt.md`,
  Nahtstellen **NS-Z1…NS-Z6** (`:3634-3690`).
* **Analyse:** `docs/radio-portierung-analyse.md` — verbindlich sind **Kapitel 4** (Pflichten 11,
  14, 15, 16, 17, 18, 23) und **Kapitel 5** (Fallen № 10, 11, 12, 19, 20, 31).

---

## Elf Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

Sie gelten für **jede** Aufgabe und werden deshalb nicht in jeder Aufgabe wiederholt.

**1. `riegel.test.ts` ist scharf, und dieser Planteil ist der erste, den er wirklich trifft.**
Bis heute sind seine Klauseln (a) und (e) über `/admin/**` verankert und für alles, was dieser Plan
baut, **inert**. **Live** sind ab der ersten Zeile dieses Planteils:

| Klausel | Was sie über Planteil 3 sagt | Ab welcher Aufgabe |
|---|---|---|
| **(c)** `route.ts` | `radioHostOderNull(` **oder** `hostAbweisung(`; **nie** `requireRadioHost(`; **nie** `requireRadioAdmin(`/`requireRadioVerwaltung(`; `HANDLER_ANZAHL` **exakt** | A9+A10 |
| **Pflicht 17** (×3, **modulweit**) | kein `isModuleAdmin`/`requireModuleAdmin`/`moduleAdminPageOrNotFound`/`canAdminModule` · kein `isAdmin` · kein `.adminGroups` | **A1** |
| **`"use client"`-Scan** (`_lib`/`_db`) | keine Direktive unter `_lib/` und `_db/` | **A1** |
| **⬜ Z-L3 → neue Klausel (f)** | `page.tsx` und `layout.tsx` **außerhalb** `admin/` | **A11**, erweitert in A18/A19/A20 |

`trefferAuf(muster, dateien = quellDateien())` (`riegel.test.ts:215`) läuft mit seinem Vorgabewert
über **jede** Quelldatei des Moduls, nicht nur `admin/**` — deshalb sind die drei Pflicht-17-Scans
und der `"use client"`-Scan für jede Datei dieses Planteils scharf.

**2. Die Brute-Force-Abwehr sind die ZWEI MODULWEITEN Zähler, nicht `clientIpAus`.**
Der Bestand sagt es wörtlich (`src/app/m/lagerbuch/_lib/absender.ts:30-33`):

> „Der Per-Absender-Zaehler ist damit eine Bequemlichkeitsgrenze gegen Tippfehler und ungezieltes
> Klopfen — NICHT die Brute-Force-Abwehr. Die Abwehr sind die beiden modulweiten Zaehler in
> `gateSchranke.ts`, **weil ihr Schluessel der einzige ist, den niemand rotieren kann**."

⬜ **A-L12 — und für `radio` ist die Lage UNBESTIMMT, nicht „gemessen kollabiert".** Gemessen am
2026-08-22 lieferte `cf-connecting-ip` auf **jedem Modul-Host** bei **jeder** Anfrage die
**Egress-Adresse dieses Servers** statt der des Clients
(`docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`, zitiert in
`src/core/ratelimit.ts:98-111`); der Per-Absender-Eimer kollabierte dort auf **einen einzigen,
modulweiten Eimer**. ⚠️ **Seitdem ist auf DIESEM Branch der Umbau dagegen gebaut und gemergt** —
`92a40d0` (`src/proxy.ts:210`, `rewriteZielAufAnfrageOrigin`), begründet in
`src/core/routing.ts:59-61`: „Seit `src/proxy.ts` das Rewrite-Ziel auf die Origin der Anfrage
zurückschreibt, entfällt der zweite, externe Round-Trip". ⛔ **Belegt ist die Reparatur damit
nicht:** `docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:30-32` sagt wörtlich „**Es
ist NICHT belegt, dass der Befund behoben ist** … Belegt ist die Reparatur erst mit P6", und P1/P6
stehen dort auf ⬜ offen.

⛔ **Diese Datei setzt weder voraus, dass er kollabiert, noch, dass er repariert ist** — und sie
muss es nicht: die Abwehr sind so oder so die **zwei modulweiten Zähler**, deren Schlüssel
Modulkonstanten sind. ⛔ **A3 baut `_lib/gateSchranke.ts` mit beiden modulweiten Zählern und ihren
Zahlen aus Spec `:3006-3009`, und schreibt den Befund in dieser UNBESTIMMTEN Form in den
Kopfkommentar** — mit beiden Belegen (`ratelimit.ts:98-111` **und** `routing.ts:59-61` **und**
`proxy-rewrite-abnahme.md:30-32`), nicht nur mit dem älteren. ⚠️ Das ist schärfer als der Nachtrag
in KONTEXT.md `:186-191`, der noch den Präsens-Befund führt; wo dieser Plan mehr sagt, gilt dieser
Plan (Kopfkasten).

**3. Der Coderaum aus §3.2.1 wird NICHT verkürzt — und der Grund ist nicht Ästhetik.**
Spec §3.7.4 (`:3056-3068`), wörtlich:

> „**Und das steht hier genauso deutlich: dieses Kapitel hängt nicht daran.** Nach Rechnung B in
> 3.7.1 hält der Zugang **auch ohne jede Schranke**. Die Umstellung macht die Notbremse wirksamer;
> sie ist nicht die Mauer. … **Wer umgekehrt den Coderaum aus 3.2.1 verkürzt, macht sie zur echten
> Voraussetzung — dann gilt Rechnung A, und dann ist die Umstellung blockierend.** Die zwei
> Entscheidungen hängen aneinander und dürfen nicht getrennt geändert werden."

Konkret: **28 Zeichen Crockford-Base32 = 140 bit** (Spec `:2082-2087`) → 2,7 × 10³⁵ Jahre bei 300
Fehlversuchen/h, 2,2 × 10²⁸ Jahre **ohne jede Schranke** (Rechnung B, `:2964-2969`). Bei sechs
Ziffern (Rechnung A, `:2950-2962`) dagegen: **1.667 Stunden ≈ 69 Tage** als *obere* Schranke, und
bei zwanzig Aufstellern ~3,5 Tage. **Der Unterschied zwischen „hält ohne Schranke" und „hält
nur mit der Schranke, die für Modul-Hosts nachweislich kollabiert" ist genau diese Zahl.**

**4. Die HTTP-Grenze bleibt stehen.** Entscheidung 15 (Leitplan `:104-106`): sie fällt erst mit
**Planteil 4**. Die sechs `/v1`-Routen in `radio-admin/server/src/routes/loanApi.ts:126-187` bleiben
**unangetastet**; `radio-inventar` spricht bis Planteil 4 weiter mit seinem eigenen Backend. ⛔ **Kein
Code dieses Planteils fasst eines der beiden Alt-Repos an, und keiner geht eine Abhängigkeit von
`loanApi.ts` oder einem Ersatz dafür ein.** Der Abnahmebefehl steht in Spec `:5453`:
`rg -n "RADIO_ADMIN_|api/v1/" src/app/m/radio` liefert **nichts**.

**5. NT11 ist mit diesem Planteil fällig — und die Sonde beweist ihn mit GRÜN, nicht mit rot.**
`scripts/import/radio-paritaet.test.ts:140` prüft heute
`expect(tabellen.length).toBeGreaterThanOrEqual(SICHTEN.length)` — also **6 >= 5**, trivial wahr.
Die Lücke liegt in der **Richtung**: zöge jemand `zugangscodes` in eine eigene Schemadatei, sähe
`Object.values(schema)` nur noch fünf Tabellen, **`5 >= 5` bliebe grün**, und die Timestamp-Sonde
prüfte `zugangscodes` nicht mehr mit — ohne dass irgendeine Zeile das meldet. Die Härtung ist ein
Einzeiler (`toBe(6)`) und steht als **eigener Schritt** in **A8**, mit der Mutationssonde.

**6. antd 6, nicht Radix, nicht Tailwind, nicht lucide.** Der Alt-Kiosk bringt 6 Radix-Pakete, 14
eigene `ui/`-Primitive, Tailwind v4 und **36 distinkte lucide-Ikonen** mit — nichts davon existiert
in dieser Suite (`E3-bestand.md` §9). Die vollständige Zuordnungstabelle steht in §4.6.1
(`:3648-3665`) und in diesem Plan unter „Die antd-Zuordnung". ⛔ **Wo die Spec „geht nicht 1:1"
sagt, steht in diesem Plan eine benannte Entscheidung mit Begründung** — nie eine stille Näherung.

**7. Die vier antd/RSC-Fallen sind für diesen Planteil alle vier scharf.** `CLAUDE.md` Zeilen 11,
27, 31, 52: Compound-Zugriff in RSC → HTTP 500 · ein Wert aus einem `"use client"`-Modul kommt in
RSC nicht an → HTTP 500, **für Vitest strukturell unsichtbar** · `@ant-design/icons` in RSC → HTTP
500 **beim Import**, und `"use client"` behebt es **nicht**, es macht es still ·
`<Table columns={[{render: fn}]}>` aus RSC → Serialisierungsfehler. **Keine davon findet `pnpm
build`.**

**8. Der vernarbte Präzedenzfall: `cookies().delete()` in einer Server Component wirft.**
Die `lagerbuch`-Spec verlangte genau das, und ein Test dort hätte eine Zusage geprüft, welche die
Bauform nicht halten kann. Dieser Planteil baut **Cookies, Sitzungen, Weiterleitungen und Server
Actions** — er ist genau dafür anfällig. **Die Bauform-Zulässigkeitstafel unten prüft jede einzelne
Stelle mit Beleg.** Lies sie, bevor du eine Aufgabe beginnst, die eine Zeile daraus berührt.

**9. Zeit ist Unix-SEKUNDEN im Ziel, epoch-MILLISEKUNDEN in der Quelle.** Nie über die
Einheitengrenze vergleichen, ohne den Faktor im Ausdruck sichtbar zu lassen. Schärfste Formulierung
im Haus: `src/app/m/lagerbuch/_db/schema.ts:11-16`.

**10. Die eiserne Regel.** Wo ein Wert erst der Bau, der Server oder der Betreiber hergibt, steht
eine **benannte Leerstelle (⬜)** mit „wer liest sie wann ab" — **niemals** eine plausibel
aussehende Erfindung. Jede Zahl, jeder Pfad, jede Signatur in diesem Plan ist zitiert (mit Zeile),
gemessen (mit `datei:zeile`) oder eine Leerstelle. Jede Leerstelle bekommt außerdem eine
**Belegzeile im Quelltext selbst**, nicht nur einen Planeintrag — die Schlussprüfung liest die
Quelltextstellen nach, nicht den Plantext.

**11. Migrationen sind append-only.** Dieser Planteil legt **keine** Migration an — `zugangscodes`
und `loans.zugangscode_id` stehen seit Planteil 1 im Schema (`_db/schema.ts:160`, `:209`) und in
`migrations/0000_melodic_eternals.sql`. ⛔ Eine neu erzeugte bestehende Migrationsdatei bringt den
Container in eine Absturzschleife — das hat in `radio-admin` **einmal die Produktion lahmgelegt**.

---

## Global Constraints

* **Alle Kommandos mit `rtk` präfixt, auch in Ketten mit `&&`.**
* **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In **TypeScript-Bezeichnern,
  Testnamen und Grep-Ankern keine Umlaute** (Hausform: `paritaetsSichtGeraet`, `msZuDatum`,
  `tagInBerlin`, `vollzaehlig`, `aeussere`).
  ⚠️ **Eine benannte Ausnahme, und nur eine: Bildschirmtexte.** Ein Satz, den ein Mensch auf dem
  Bildschirm liest, trägt seine Umlaute („Höchstens 20 Geräte in einem Vorgang.") — ein deutscher
  Oberflächentext ohne Umlaute wäre schlicht falsch. Das gilt **nicht** für Grep-Anker: ein
  Quelltext-Scan, der auf einen Bildschirmtext zielt, verankert auf dem umlautfreien Teil
  (`"Hoechstens"` wäre falsch — verankere stattdessen auf `20 Ger` oder auf dem Bezeichner).
* **Belegpflicht.** Jede Behauptung in einem Kommentar nennt `datei:zeile`.
* **Kein `git add .`, kein `-A`.** Im Arbeitsbaum liegen unverfolgte Planungsdokumente und `.idea/`.
  Namentlich stagen, mit `rtk git show --stat HEAD` nachsehen.
* **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.
* **`getModuleDb()` wird in Tests NICHT benutzt** — sein Cache ist per Modulschlüssel gekeyt, nicht
  per `DATA_DIR` (`src/core/db/index.ts:31-35`). Tests bauen ihre DB selbst und migrieren sie
  (Vorbild `src/app/m/lagerbuch/_db/migrations.test.ts:29-37`).

### Verbotene Namen und Muster (modulweit, von `riegel.test.ts` durchgesetzt)

| Verboten | Warum | Beleg |
|---|---|---|
| `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound`, `canAdminModule` | tragen den Suite-Admin-Kurzschluss (`core/groups.ts:125`) | `riegel.test.ts:652-656` |
| `isAdmin` | heißt in der Suite „ist BETREIBER", nicht „darf radio verwalten" | `riegel.test.ts:658-670` |
| `.adminGroups` (Feldzugriff) | macht `SUITE_ADMIN_GROUP_RADIO` still wirkungslos | `riegel.test.ts:672-681` |
| `"use client"` unter `_lib/` oder `_db/` | Falle 6 — Wert kommt in RSC nicht an, HTTP 500 | `riegel.test.ts:684-703` |
| `@ant-design/icons` **irgendwo** unter `m/radio/` | Falle 7 — HTTP 500 beim Import, `"use client"` behebt es nicht | Spec `:3728-3752`, `src/core/shell/icons.test.ts` |
| `requireRadioHost(` in einem `route.ts` | werfende Form ist im Antwortweg eines Handlers die falsche Gestalt | `riegel.test.ts:440-455` |
| `requireRadioAdmin(`/`requireRadioVerwaltung(` in einem `route.ts` | B11 — endet in einem Login-Umweg | `riegel.test.ts:450-455` |
| `signOut` in `abmelden/route.ts` | räumt sonst die Suite-Sitzung auf **allen** Modul-Hosts | Spec `:2610-2614` |
| `AUSLEIH_COOKIE` in einer Datei unter `admin/` | Trennlinie §3.6.3 Punkt 1 | Spec `:2908-2912` |
| `RADIO_ADMIN_URL`, `api/v1/` unter `m/radio/` | Entscheidung 15 — die HTTP-Grenze steht noch | Spec `:5453` |
| `Math.random` in `erzeugeCode` | vorhersagbare Codes | Spec `:2089-2091` |
| `NextResponse.redirect(...)` in `t/[code]` oder `abmelden` | verlangt absolute URL; `req.url` trägt nach dem Rewrite den **inneren** Pfad | Spec `:2284-2296` |
| `cookies().delete(...)` überall in diesem Modul | löscht ohne `Path` am falschen Scope; in einer Server Component **wirft** es | Spec `:2596-2604` |

### Das Tor je Aufgabe — es ist NICHT „volle Suite grün"

* `rtk pnpm typecheck` — **0 Fehler**
* `rtk pnpm lint` — **0 Fehler**
* **die eigenen Testdateien der Aufgabe grün**
* **kein neuer Fehlschlag** in einer Datei, die der Diff nicht anfasst (gegen die **selbst
  gemessene** Grundlinie — ⚠️ `.superpowers/sdd/BASISLINIE-vitest.md` führt 441/7991, KONTEXT.md
  `:144-146` führt 446/8074, und der letzte protokollierte Volllauf auf diesem Branch führt
  **447/8081** (`docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:21`). ⛔ **Miss sie
  einmal selbst und schreib die Zahl in den Bericht**)

Streitfälle entscheidet die **Beiseitelege-Gegenprobe** (eigene Dateien temporär verschieben, voll
laufen lassen, zurücklegen) — nicht der Zählwert allein.

`rtk pnpm build` und Playwright laufen **einmal vor dem Merge**, nach den Tests, **nie davor**.

### Werkzeugfallen (alle gemessen)

* ⛔ **`rtk` meldet falsches Grün für `tsc`, wenn Farbe durchkommt.** `NO_COLOR=1` ist gesetzt,
  `package.json` trägt `tsc --noEmit --pretty false`. **Niemals** `grep -cE "error TS"` auf farbigem
  Output — die ANSI-Sequenz steht zwischen `error` und `TS`, `grep` zählt **0**.
* ⛔ **Kein Worktree unter `.claude/worktrees/`** — vergiftet die Tore (251 Fremdfehlschläge,
  `vitest.config.ts:8-34`).
* ⛔ **Kein `pnpm build` vor einem Testlauf, den man ernst nimmt** — `.next/standalone/src/` ist eine
  vollständige Kopie des Quellbaums **inklusive Testdateien** (52 Fehlschläge).
* ⛔ **Kein `pnpm dev` parallel zur Testsuite.**
* ⛔ **Node 26 bringt ein eigenes `localStorage` mit, das jsdoms verdeckt.** Wer eine
  jsdom-Testdatei schreibt, die `localStorage` braucht, prüft das gesondert
  (`vitest.config.ts:54-87`). **Dieser Planteil braucht `localStorage` an keiner Stelle** — die
  Sitzung liegt in einem `httpOnly`-Cookie, und der Alt-Mechanismus (`tokenStorage`,
  `radio-inventar/apps/frontend/src/lib/tokenStorage.ts:4-6`) wird **nicht** portiert.

---

## Die Bauform-Zulässigkeitstafel

⛔ **Diese Tafel ist der Kern von Punkt 8 oben und wird je Aufgabe referenziert.** Für **jede**
Stelle, an der dieser Planteil ein Cookie schreibt, eine Sitzung prüft, weiterleitet oder eine
Server Action baut, steht hier, ob die **Bauform** (Server Component / Server Action / Route Handler
/ Client) das überhaupt zulässt — mit Beleg.

| # | Was, wo | Zulässig? | Beleg / Begründung |
|---|---|---|---|
| 1 | `cookies().set(...)` in einer **Server Action** (`einloesenAmGate`, A9) | ✅ **ja** | Spec `:2364-2366`; Bestand `lagerbuch/_actions/gate.ts` setzt es dort seit dem Cutover produktiv |
| 2 | `antw.cookies.set(...)` auf der **303-Antwort eines Route Handlers** (`t/[code]`, A10) | ✅ **ja**, und es muss **dieselbe** Antwort sein, die den 303 trägt | Spec `:2298-2302`; Bestand `lagerbuch/t/[code]/route.ts:94-95` |
| 3 | `cookies().delete(...)` in einer **Server Component** | ⛔ **NEIN — wirft zur Laufzeit** | Der vernarbte Präzedenzfall. Beleg im Bestand: `lagerbuch/abmelden/route.ts:12-20`, mit Quellenverweis `next/dist/.../request-cookies.js:53/171`. **Deshalb ist `/abmelden` ein Route Handler und keine Server Action und kein Layout-Zweig.** |
| 4 | Cookie **löschen** über `cookies.delete(...)` — irgendwo | ⛔ **NEIN** | Setzt kein `Path` und löscht dadurch am falschen Scope; Attribute müssen beim Löschen **dieselben** sein wie beim Setzen, sonst bleibt das Löschen **wirkungslos, ohne dass der Browser das meldet**. ✅ Stattdessen: `ausleihCookieOptionen(0)` (Spec `:2596-2604`, Bestand `lagerbuch/abmelden/route.ts:80-91`) |
| 5 | Gleitende Verlängerung der Sitzung in einer Server Component | ⛔ **NEIN — technisch unmöglich** | `cookies()` ist dort versiegelt, `set`/`delete`/`clear` werfen (Spec `:2548-2556`). **Auch in Route Handler/Server Action wird sie nicht gebaut** — der Preis eines Ablaufs ist ein Scan von zwei Sekunden |
| 6 | `redirect(...)` aus `page.tsx` / `layout.tsx` (A11, A18–A20) | ✅ **ja** | Nexts Standardweg. ⚠️ **Nie innerhalb eines `try`/`catch`** — `redirect()` arbeitet über einen geworfenen Sentinel, ein `catch` verschluckt ihn und die Weiterleitung findet still nicht statt |
| 7 | `requireAusleihZugang` leitet um **und** räumt das Cookie | ⛔ **NEIN** | Sie wird aus `(ausleihe)/layout.tsx` gerufen, also aus einer **Server Component** — siehe Zeile 3. ✅ Stattdessen: `redirect("/abmelden?grund=…")`, und der **Route Handler** räumt (Spec `:2568-2570`, `:3277-3283`) |
| 8 | `verifyAusleihSitzung` wirft bei Müll | ⛔ **NEIN — sie wirft NIE** | Der Cookiewert ist Nutzereingabe; ein Wurf wäre HTTP 500 auf **jeder** Ausleihseite (Spec `:2508-2513`) |
| 9 | `normalisiereCode` wirft bei Müll | ⛔ **NEIN — sie wirft NIE** | Der Wert kommt aus einer URL oder einem Formularfeld; ein Wurf machte aus einem Tippfehler einen 500 im Route Handler (Spec `:2093-2098`) |
| 10 | `requireAusleihSchreibend` wirft oder leitet um | ⛔ **NEIN — sie gibt ein Ergebnis zurück** | Ein `redirect()` verwürfe die eingetragenen Werte des Formulars (Spec `:2668-2673`, `:2417-2419`). ⚠️ **Das ist zugleich die gefährlichste Eigenschaft dieses Kapitels:** `await requireAusleihSchreibend(db)` ohne Prüfung des Ergebnisses ist typkorrekt, lint-sauber und öffnet die Action für jeden (Spec `:2780-2784`) |
| 11 | `requireRadioHost` **wirft** in `einloesenAmGate` und `beenden` | ✅ **ja — die eine Ausnahme** vom Grundsatz „Actions werfen nicht" | Ein Action-POST auf falschem Host ist kein Betriebsfall, sondern ein manipulierter (Spec `:2360-2362`) |
| 12 | `requireRadioHost(` in einem `route.ts` | ⛔ **NEIN** | `notFound()` wäre eine HTML-Fehlerseite mit `Content-Type: text/html` — keine brauchbare Antwort auf einen gescannten QR-Code. `riegel.test.ts:446-449` macht es rot |
| 13 | Geheimnis auf **Modulebene** lesen (`const SCHLUESSEL = new TextEncoder().encode(...)`) | ⛔ **NEIN — bricht `pnpm build`** | `next build` läuft mit `NODE_ENV=production` und **ohne Secrets** und wertet Modulebene aus. ✅ **Thunk**: `const schluessel = () => new TextEncoder().encode(...)` (Spec `:2042-2047`, Bestand `lagerbuch/_lib/helferSitzung.ts:39-49`) |
| 14 | `grenzen()` auf **Modulebene** in `gateSchranke.ts` | ✅ **ja**, und **nur weil** alle vier Zahlen eine Vorbelegung haben | `lagerbuch/_lib/gateSchranke.ts:8-21` schreibt die Bedingung aus. **Folge, die man kennen muss:** die Grenzen sind ab dem ersten Import eingefroren — geänderte `.env` wirkt erst nach Neustart |
| 15 | `<Link href="/abmelden">` | ⛔ **NEIN** | Nexts Prefetch beendete die Sitzung ungefragt beim Darüberfahren. ✅ **Der sichtbare Abmeldeweg ist ein POST-Formular**: `<form action={beenden}>` (Spec `:2606-2609`, NS-Z3) |
| 16 | `usePathname()` im `AusleihRahmen` | ⛔ **NEIN** | Machte den Rahmen zur Client-Grenze. ✅ Aktivmarkierung als **Server-Prop** `aktiv={"uebersicht"\|"ausleihen"\|"rueckgabe"}` (Spec `:3379-3381`) |
| 17 | `columns[].render` an antds `Table` aus einer Server Component | ⛔ **NEIN** | Falle 9 — eine gewöhnliche Funktion darf die RSC-Grenze nicht überqueren. ✅ In diesem Planteil ohnehin gegenstandslos: **es gibt keine `Table`** (Spec `:3667-3670`) |
| 18 | `Input.TextArea`, `Card.Meta`, `Typography.Title` in einer Server Component | ⛔ **NEIN** | Falle 1 — Compound-Zugriff → HTTP 500. ✅ `Input.TextArea` **nur** in `RueckgabeDialog.tsx` (`"use client"`); Überschriften als nacktes `<h1>`/`<h2>` (Spec `:3336`) |
| 19 | Ein `WERT` (z. B. `AUSLEIH_COOKIE`, `GATE_GRUENDE`, `statusEtikett`) aus einem `"use client"`-Modul, gelesen von einer Server Component | ⛔ **NEIN** | Falle 6 — Client-Referenz statt Wert, HTTP 500, **und Vitest kann es strukturell nicht sehen**. ✅ Alle `_lib/*.ts` dieses Planteils tragen **kein** `"use client"`; durchgesetzt von `riegel.test.ts:684-703` |

---

## Die Sperrtafel

### Vorbedingungen

| # | Vorbedingung | Status | Beleg |
|---|---|---|---|
| V1 | Planteil 1 gebaut: `_db/schema.ts` mit `zugangscodes` (9 Spalten) und `loans.zugangscode_id`, zwei Migrationen, Registrierungsdreieck | ✅ **erfüllt** | `_db/schema.ts:160`, `:209`; gemessen `find src/app/m/radio -type f` |
| V2 | Planteil 2 gebaut: `_lib/host.ts` (vier Riegelformen), `_lib/zugang.ts`, `_lib/hostRiegel.ts`, `riegel.test.ts`, `routen.test.ts`, Registry-Zeile, drei Layouts | ✅ **erfüllt**, schlussgeprüft (0 kritische Funde) | KONTEXT.md `:144-159` |
| V3 | CWE-348-Umstellung in `src/core/ratelimit.ts` | ✅ **gebaut** (`7d71b6c`) — ⛔ **härtet aber NUR den Apex**; siehe Punkt 2 oben | `src/core/ratelimit.ts:44-116`, `.superpowers/sdd/REVIEW-ratelimit.md` |
| V3b | **Der Modul-Host-Rewrite schreibt sein Ziel auf die Anfrage-Origin zurück** — der Umbau, der den Egress-IP-Kollaps beheben soll | ✅ **gebaut und gemergt** auf diesem Branch (`92a40d0`, `282ea52`, `d9fe014`) — ⛔ **aber NICHT abgenommen**: P1 und P6 stehen offen, und kein Tor dieses Repos kann die Reparatur sehen. ⬜ **A-L12** | `src/proxy.ts:210`, `src/core/routing.ts:59-61`, `docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:17-32` |
| V4 | Entfernen des Suite-Admin-Kurzschlusses in `src/core/groups.ts` | ⏳ **offen, und das blockiert Planteil 3 NICHT** — Frist ist „vor Planteil 4" (Leitplan `:120`); `radio` löst seine Rechte modulintern selbst auf und der Scan `riegel.test.ts:652-656` sichert genau das zu | Leitplan `:120` |
| V5 | Self-Hop-Check in `clientIpAus` | ⛔ **Bauplan, nicht gebaut**, mit zwei eigenen offenen Leerstellen. ⚠️ **Ein ANDERER Posten als V3b** — wer die beiden verwechselt, hält den Egress-Befund für erledigt oder für offen, je nachdem welchen er zuletzt gelesen hat | `.superpowers/sdd/VORARBEIT-selfhop.md` |

### Leerstellen, die dieser Planteil ENTSPERRT (nicht abliest)

| ⬜ | Was offen ist | Wer liest sie wann ab | Welchen Cutover-Schritt sie befeuert |
|---|---|---|---|
| **L9** | Ob `/` oder `/t/<code>` doch eine **kamerabasierte** Fläche trägt | ⛔ **NICHT Planteil 3.** Planteil 3 **entscheidet die Zweigwahl beim Bau** (A10/A11) und baut **keine** Kamerafläche — §3.3.1/§3.3.2/§3.3.3 kennen nur Route Handler + Server-Action-Formular. Abgelesen wird das **Ergebnis** vom Cutover-Generalprobe-Prüfsatz, Stufe 3 §P.10 (`2026-08-18-plan3-radio-generalprobe.md:90`) | **C20**; ausdrücklich **Zweigwahl, nicht Blockade** (`:203`) |
| **L10** | Die Zeichenkette aus dem modul-eigenen Ausleih-Rahmen (§4.2), die im **Portal**-HTML nicht vorkommt | Der **Wert** entsteht erst mit dem tatsächlichen Markup aus **A16** (`_ui/AusleihRahmen.tsx`). ⛔ **A16 schreibt ihn in eine Belegzeile im Kopf der Datei**, damit der Cutover-Prüfsatz ihn nicht raten muss. Abgelesen von §P.9 („kopfgestützt") und §D/§E-Abnahme (`radio-cutover-leitplan.md:266,277,906`) | **C20**, plus die zweite Hälfte von **C19**, **C29**, **C30** |
| **Z-L3** | `page.tsx` und `layout.tsx` **außerhalb** von `admin/` sind unbewacht | ⛔ **Dieser Planteil schließt sie** — neue **Klausel (f)** in `riegel.test.ts`, angelegt in **A11**, erweitert in A18/A19/A20. Die Belegzeile `riegel.test.ts:27-38` wird in A11 durch die Klausel **ersetzt**, nicht gelöscht | — |

### Leerstellen, die dieser Planteil NEU benennt

| ⬜ | Die Frage | Wer liest sie wann ab |
|---|---|---|
| **A-L1** | **Die Sitzungsdauer.** Vorschlag 12 Stunden, wie `lagerbuch` (Spec §3.4.3, §3.11 Punkt 1). ⚠️ „Die Schichtlänge steht in keinem Repo." | **Der Betreiber**, vor dem Cutover. Der Code trägt die **Vorbelegung** 12 in `RADIO_AUSLEIH_SITZUNG_STUNDEN` (A1) — das ist ein `vorgabe`-Feld, keine Behauptung. Belegzeile: `_lib/grenzen.ts`, am Eintrag |
| **A-L2** | **Wird das Namensfeld für eine angemeldete Person vorbelegt?** Vorschlag der Spec: ja, vorbelegt und frei überschreibbar (§3.11 Punkt 3, §4.10). Gegengrund, genannt: wer für eine Kollegin ausleiht, bucht sonst versehentlich auf den eigenen Namen | **Der Betreiber.** ⚠️ Fällt die Antwort auf **nein**, ändert sich **genau eine Zeile** in `(ausleihe)/ausleihen/page.tsx` (der `defaultValue`) — Spec `:3963-3965`. A19 baut sie mit `defaultValue` **und** einer Belegzeile, die die Leerstelle nennt |
| **A-L3** | **Sind gedruckte Aufsteller im Umlauf, und wo?** (Spec §3.11 Punkt 2) | **Der Betreiber**, vor dem Cutover. Bestimmt die Zahl auszustellender Codes und den Nachdruck-Schritt am Cutover-Abend (Zusage 15). ⛔ **Kein Bauwert** — er beeinflusst keine Zeile dieses Planteils |
| **A-L4** | **Das `datum` der drei Release-Notizen** = der Tag des **Rollouts** | **Das Cutover-Runbook**, am Rollout-Tag. ⛔ Deshalb schreibt dieser Planteil die Notizen **nicht** — siehe „Was Planteil 3 NICHT liefert" |
| **A-L5** | **Der Wert `<N>`** im Notiztext („Nach dem Scan bist Du `<N>` Stunden angemeldet") | Folgt aus **A-L1**, ausgeschrieben („zwölf Stunden"), gesetzt am Rollout-Tag (Spec `:3189-3191`) |
| **A-L6** | **Wann und ob der Self-Hop-Check gebaut wird** — er hat selbst zwei offene Leerstellen (⬜ L1: wie die eigene Egress-IP zur Laufzeit erkannt wird; ⬜ L2: welche internen Hops es wirklich gibt) | **Der Agent, der `.superpowers/sdd/VORARBEIT-selfhop.md` ausführt** — parallel, nicht in diesem Planteil. ⛔ **A3 darf sich nicht darauf verlassen** und schreibt genau das in seinen Kopfkommentar |
| **A-L7** | **Was passiert heute, wenn `RADIO_AUSLEIH_SITZUNG_SECRET` fehlt?** Die Boot-Prüfung `radioBootFehler()` gehört Kapitel 7 und damit **Planteil 5** (Leitplan `:91`, B8) | **Planteil 5**, beim Bau von `radioBootFehler()`. ⛔ A4 schreibt in den Kopf von `_lib/ausleihSitzung.ts`, dass es hier **keine** Boot-Prüfung gibt und der Fehler heute erst beim ersten Einlösen auftritt — als Belegzeile, nicht als Vermutung über die Fehlermeldung |
| ~~**A-L8**~~ | ~~„Falle 61" in Spec `:4012`~~ — ⛔ **AUFGELÖST, keine Leerstelle mehr.** „Falle 61" ist die **lagerbuch-Zählung**, und die Spec annotiert sie selbst so: `:3092` schreibt „**Falle 61 (lagerbuch-Zählung)**" wörtlich, `:3125-3126` benutzt dieselbe Schreibweise für Falle 19 und Falle 57. Planteil 2 hat den Begriff bereits übernommen (`src/app/m/radio/_lib/routen.test.ts:190`: `describe("radio: die Luecke, gegen die _lib/host.ts gebaut ist (Falle 61)")`) | — **nichts abzulesen.** ⚠️ Die Lesehilfe `:3307-3310` gilt weiterhin für **Kapitel 4**; `:4012` ist eine Zeile, die auf Kapitel **3** zurückverweist, und dort ist die lagerbuch-Zählung die gebräuchliche |
| **A-L9** | **Ob der Riegel in `(ausleihe)/layout.tsx` bei einem echten Abruf GREIFT** — Erbe von ⬜ Z-L1 | **Planteil 5**, beim ersten e2e-Lauf. ⛔ Dieser Planteil belegt „die Zeile steht da" (Quelltext-Scan), **nicht** „der Riegel greift". Kein Test dieses Planteils darf etwas anderes behaupten |
| **A-L10** | **Die vier Chip-Hexwerte** aus `StatusBadge.tsx:23-53` des Alt-Kiosk, je in Hell- und Dunkelvariante | ⚠️ **Der Agent, der A12 baut** — nicht erst A16. Der Testfall „kein Statuston benutzt colorError" braucht in **A12** ein Prüfobjekt, also stehen die Werte als `STATUS_HEX` in `_lib/status.ts`; **A16 liest sie von dort** und schreibt sie als CSS-Variablen ins Modul-Stylesheet. Abgelesen aus `/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/src/components/features/StatusBadge.tsx:23-53`, **wörtlich übernommen, nicht aus antd-Tokens abgeleitet** (Spec `:3690-3693`). ⛔ Bis dahin steht in diesem Plan **keine** Hexzahl |
| **A-L11** | **Die Zeichengrenze der Zustandsnotiz** — `LOAN_FIELD_LIMITS.RETURN_NOTE_MAX` des Alt-Kiosk (der Zähler zeigt sie als „0 / 500", Spec `:3573`, aber die Konstante ist die Wahrheit) | **Der Agent, der A15 baut** — abgelesen aus dem Alt-Repo, dann als Eintrag in `_lib/grenzen.ts` bzw. als Konstante in `_lib/meldungen.ts`. ⛔ Die „500" in der Spec ist ein **Beispieltext**, keine zitierte Konstante |
| **A-L12** | **Trägt `cf-connecting-ip` auf einem Modul-Host heute die Adresse des Clients?** ⛔ **Unbestimmt.** Der Befund vom 2026-08-22 sagt nein (`src/core/ratelimit.ts:98-111`); der Umbau dagegen ist gebaut (`92a40d0`, `src/proxy.ts:210`, `src/core/routing.ts:59-61`); die Abnahme am Server steht aus (`docs/superpowers/berichte/2026-08-22-proxy-rewrite-abnahme.md:30-32`, P1 und P6 ⬜ offen) | **Ruben**, mit den Schritten P1/P6 aus jener Datei — **kein Bauwert**. ⛔ **Kein Bauschritt dieses Planteils hängt daran**, und keiner darf eine der beiden Antworten voraussetzen: die Abwehr sind die zwei modulweiten Zähler (A3), deren Schlüssel Modulkonstanten sind |
| **A-L13** | **Die Werte der Union `GeraeteStatus` — und was `null` bedeutet.** Gemessen: `grep -rn "GeraeteStatus" src/app/m/radio/` liefert **null Treffer**, und `_db/schema.ts:30` führt `status: text("status")` als **nullable Textspalte ohne `enum`**. `_db/schema.ts:255-264` exportiert zehn Typen, keiner davon `GeraeteStatus` | **Zwei getrennte Fragen, zwei Adressaten.** ⑴ **Die Werte** liest **der Agent, der A12 baut**, aus dem Alt-Bestand ab (`radio-admin/server/src/db/schema.ts` bzw. `radio-inventar/.../StatusBadge.tsx:23-53`) und deklariert die Union **in `_lib/status.ts`, exportiert**. ⑵ **Was `null` auf der Fläche bedeutet** — eigener Ton, Rückfall auf „frei", oder eine fünfte Union-Alternative — steht in **keinem Dokument**. ⛔ **Der Betreiber entscheidet das**; bis dahin ist es eine Leerstelle mit Belegzeile am Union-Typ, keine still gewählte Näherung |
| **A-L14** | **Landet die Inline-Erneuerung der Sitzung (§3.4.4, Zusage §3.10 Nr. 8) in Planteil 3 — oder in einem eigenen Folgeposten?** Dieser Plan **baut sie** (Entscheidung **E12**), weil die Spec sie an vier Stellen fordert und es **keinen späteren Eigentümer** gibt: Planteil 4 ist Kapitel 5, Planteil 5 ist Kapitel 7/8 | **Der Betreiber**, als **Umfangsentscheidung** — sie berührt A8, A9, A14, A17, A19 und A20 und bringt zwei neue Dateien. ⛔ Fällt die Antwort auf „eigener Posten", ist E12 zurückzunehmen **und** die Zusage §3.10 Nr. 8 braucht dann einen namentlichen Eigentümer in „Was Planteil 3 NICHT liefert" — sie darf nicht einfach entfallen |

---

## Die Entscheidungen, die dieser Plan fällt

⛔ **Dreizehn Stück, alle benannt und begründet — keine still gewählte Näherung.** **E1** und **E2** sind
strukturell und stehen hier; **E3–E10** betreffen die antd-Umsetzung und stehen im nächsten
Abschnitt; **E11** betrifft den Ort der zwei Ergebnistypen und steht am Ende jenes Abschnitts;
**E12** (die Inline-Erneuerung wird gebaut) und **E13** (`SperrGrund` wandert in die zwei
`grund`-Unions) stehen unmittelbar hinter E11 und hängen aneinander.

### Entscheidung E1 und E2 — und warum dieser Plan sie fällen muss

#### Entscheidung E1: Die Übersicht liegt an `/geraete`, das Gate an `/`

⛔ **Kapitel 4 §4.1 (`:3318-3353`) legt die Geräteübersicht auf `(ausleihe)/page.tsx` und damit auf
den äußeren Pfad `/`. Das ist nicht baubar.** Zwei unabhängige Gründe, jeder für sich hinreichend:

1. **Zwei Dateien auf demselben Pfad.** `src/app/m/radio/page.tsx` (das Gate) und
   `src/app/m/radio/(ausleihe)/page.tsx` (die Übersicht) lösen **beide** auf `/m/radio` auf — eine
   Route-Group ändert die URL nicht. Next lehnt das beim Build ab („two parallel pages resolve to
   the same path"). Und das Gate an `/` ist von Kapitel 3 **verbindlich verlangt**: §3.3.5 (`:2400-2419`)
   führt zwei Zeilen, die es voraussetzen — „Cookie fehlt ganz → `redirect("/")` unmittelbar" und
   „gesperrt, auf `page.tsx` → `null`, **Codefeld rendert**".
2. **Ein endloser Redirect.** Läge `/` unter `(ausleihe)/layout.tsx`, das `requireAusleihZugang`
   ruft, und leitete diese Funktion bei fehlendem Cookie auf `/` um, liefe die Anfrage im Kreis.

**Bindend ist damit die Routenkarte aus Kapitel 1 §1.2.1 (`:273-284`)**, die genau das schon
auflöst:

| Datei | Äußerer Pfad | Rolle |
|---|---|---|
| `page.tsx` | `/` | **Gate**: Codefeld für einen anonymen Zugang |
| `(ausleihe)/geraete/page.tsx` | `/geraete` | Bestandsliste — Alt-Kiosk `/` |
| `(ausleihe)/ausleihen/page.tsx` | `/ausleihen` | Ausleihe — Alt-Kiosk `/loan` |
| `(ausleihe)/rueckgabe/page.tsx` | `/rueckgabe` | Rückgabe — Alt-Kiosk `/return` |

**Die Bestätigung liegt im Repo, nicht im Argument:** `src/app/m/radio/_lib/routen.test.ts` (gebaut
in Planteil 2, heute grün) führt `AUSLEIHE = ["/", "/t/ABC123", "/abmelden", "/geraete",
"/ausleihen", "/rueckgabe"]` und sichert die Vollzähligkeit mit **`toBe(6)`** zu. Läge die Übersicht
an `/`, wäre `/geraete` ein 404 — **bei grünem Test**.

⛔ **Die Folgen, vollständig aufgezählt** (Kapitel 4s Text nimmt durchgehend an, `/` sei die
Übersicht):

| Spec-Stelle | Wortlaut dort | Was gebaut wird |
|---|---|---|
| `:3324` Dateiliste, `:3971-3976` | `(ausleihe)/page.tsx`, `(ausleihe)/page.test.tsx` | **`(ausleihe)/geraete/page.tsx`**, `(ausleihe)/geraete/page.test.tsx` |
| `:3429` (Fluss A, Schritt 7) | `redirect("/?gebucht=2")` | **`redirect("/geraete?gebucht=2")`** |
| `:3429`, `:3562` | `revalidatePath` auf `/` und `/rueckgabe` | **`revalidatePath("/geraete")`** und `revalidatePath("/rueckgabe")` |
| `:3377-3379` (Fußnavigation) | drei Ziele „Übersicht, Ausleihen, Zurückgeben" | „Übersicht" zeigt auf **`/geraete`**; `aktiv="uebersicht"` bleibt der Schlüsselname |
| `:3423` (Fluss A, Schritt 1) | „`/` als RSC: `requireAusleihZugang` …" | **`/geraete`** als RSC |
| §4.5.2, §4.3.3 | „Der Suchtext steht nicht in der URL; nur `?geraete=` ist URL-Zustand" | unverändert |

⚠️ **Eine zweite Stelle in derselben Kapitel-1-Zeile ist ihrerseits überholt.** `:278` sagt, „ein
radio-admin" werde vom Gate „nach `/admin`" geleitet (`:277` ist die `layout.tsx`-Zeile darüber). **§3.6.3 Punkt 3 (`:2908-2931`) sticht:** „Ein
`radio`-Admin bekommt über `weg: "suite"` Zugang zur Ausleihe — **nicht als Admin**." Ein Redirect
würfe eine Person, die gerade ein Funkgerät ausleihen will, aus der Ausleihe heraus. **Gebaut wird
ein Link, kein Redirect**, und er hängt am **Prädikat** `istRadioAdmin(await viewerOderNull())`,
nicht am werfenden Riegel (§3.6.3 Punkt 4, NS-Z6) — ein werfender Riegel schickte jeden anonymen
Scan nach `/login`.

#### Entscheidung E2: `_db/leihen.ts` entsteht in Planteil 3, mit fünf seiner sechs Funktionen

**Der Befund:** Die Ausleihfläche braucht drei Lesepfade und zwei Schreibpfade (Spec `:4082-4088`,
`:5022-5027`). **Keiner davon existiert** — gemessen mit `find src/app/m/radio -type f`: unter
`_db/` liegen nur `schema.ts`, `client.ts`, `drizzle.config.ts`, `migrations/` und zwei Testdateien.
Ihr Zuhause `src/app/m/radio/_db/leihen.ts` ist in **Kapitel 6** ausgeschrieben (`:5014-5027`) und
gehört damit nach der Leitplan-Tabelle **Planteil 4**.

**Die Entscheidung:** **Planteil 3 legt `_db/leihen.ts` an** — mit genau den **fünf** Funktionen,
die die Ausleihfläche braucht:

```ts
export function geraeteMitLeihstand(db: DB): GeraetMitLeihstand[];
export function offeneAusleihen(db: DB): OffeneAusleihe[];
export function sucheEntleiher(db: DB, suchtext: string, deckel = 10): Vorschlag[];
export function bucheAusleihe(db: DB, e: AusleihEingabe): AusleihErgebnis;
export function bucheRueckgabe(db: DB, ausleiheId: string, notiz: string | null): RueckgabeErgebnis;
```

⚠️ **`DB`, nicht `RadioDb`.** Spec `:5018-5019` (Kapitel 6) schreibt `RadioDb`; im Repo heißt der Typ
**`DB`** (`src/app/m/radio/_db/client.ts:26`: `export type DB = ReturnType<typeof getDb>;`), und ein
Alias dafür wäre ein zweiter Name für dieselbe Sache.

⚠️ **Der Vorgabewert `deckel = 10` steht an der Datenfunktion** (Spec `:4084`, §4.12 Nr. 6:
`sucheEntleiher(db, suchtext, deckel = 10)`); Kapitel 6 `:5025` führt sie ohne Vorgabe. **Beide
Stellen sind damit erfüllt**, und die Server Action `entleiherVorschlaege` (A17) setzt **keinen
eigenen** Deckel daneben — zwei Zahlen für dieselbe Grenze laufen auseinander.

⛔ **`AusleihEingabe` wird hier ausgeschrieben — der Typ existiert im Repo NICHT**
(gemessen: `grep -rn "AusleihEingabe" src/app/m/radio/` → null Treffer), und die Spec führt ihn nur
als Parameternamen. Er wird in **A15**, in `_db/leihen.ts`, deklariert und exportiert:

```ts
export type AusleihEingabe = {
  geraeteIds: string[];          // aus `auswahlLesen(...)` (A13), Deckel 20 (Spec:3466-3470)
  entleiher: string;             // der Name aus dem Formular, UNVERAENDERT (Spec:3587-3592)
  zugangscodeId: string | null;  // die HERKUNFT des Zugangs — siehe unten
};
```

⛔ **`zugangscodeId` ist kein Zierfeld, und ohne es ist eine ganze Spalte tot.** Spec `:2181-2186`,
wörtlich: „`loans` bekommt eine Spalte `zugangscode_id text NULL REFERENCES zugangscodes(id)` … **Sie
ist NULL für alle importierten Alt-Leihen und für jede Leihe über den Suite-Weg (3.5).** Sie ist …
die **Herkunft des Zugangs** … **Über sie löst die Anzeige `bezeichnung` auf.**" — „NULL für den
Suite-Weg" heißt: **gesetzt für den Code-Weg**. Und Spec `:2240-2242` (§3.2.4 Punkt 3) bindet die
zwei Hälften aneinander: „‚Nie löschen' ohne den Verweis in `loans` wäre eine Regel ohne Schaden …
**Beides oder nichts.**" Der Bau steht in **A17**, Auflage 9.

Die **sechste**, `leihhistorie(db, f)`, bleibt Planteil 4 — sie speist ausschließlich die
Verwaltungsansicht `/admin/ausleihen` (Spec `:5024`), die dieser Planteil nicht baut.

**Warum das Entscheidung 15 nicht bricht:** Entscheidung 15 sagt, **wann die HTTP-Grenze fällt** —
nämlich wenn die sechs `/v1`-Routen Drizzle-Aufrufe im selben Prozess sind und der Alt-Kiosk
umschwenkt. `_db/leihen.ts` in `iuk-suite` zu bauen **schwenkt nichts um**: `radio-admin` behält
seine sechs `/v1`-Routen unverändert, `radio-inventar` ruft sie weiter, und **dieser Planteil fasst
keines der beiden Repos an**. Der Abnahmebefehl aus Spec `:5453` bleibt erfüllt:
`rg -n "RADIO_ADMIN_|api/v1/" src/app/m/radio` liefert **nichts**.

**Warum keine zweite Datei:** Zwei Dateien mit denselben Lesepfaden liefen auseinander, und die
Fassung, die zuerst rot würde, wäre die, die jemand aufweicht. Die Spec führt **eine** Datei
(`:5014`), und Planteil 4 ergänzt sie um `leihhistorie` und um die Löschung der Alt-Routen.

**Was A12 dabei nicht verlieren darf** — die Auflagen aus Kapitel 6, alle mit Zeile:

| Auflage | Beleg |
|---|---|
| **Das Lesemodell**: `geraeteMitLeihstand` gibt **exakt** `{ id, rufname, geraetetyp, standort, status, suchschluessel, entleiher?, seit? }` — kein `Date`, **keine** Seriennummer als eigenes Feld | `:4082-4088`, `:5248-5251` |
| Der Test prüft **`Object.keys()` auf Gleichheit, nicht auf Teilmenge** — „eine Teilmengenpruefung faengt genau den Fall nicht, gegen den der Test steht" — plus: keiner der Namen `softwareVersion`, `tei`, `createdBy`, `updatedAt` ist darunter | `:5254-5258` |
| `id` und **nicht** `issi` ist der Schlüssel („issi is mutable (a device can be reprogrammed) and unsuitable as a foreign key") — **die Begründung wandert als Kommentar mit** | `:5243-5246` |
| `bucheAusleihe`: Gerät lesen → `loanable` → `mapDeviceCondition` bleiben die **ersten Anweisungen**, in dieser Reihenfolge, **je gewähltem Gerät innerhalb der Transaktion** | `:5264-5268` |
| `mapDeviceCondition` ist **Fachlogik** und wandert mit Testabdeckung mit — die einzige Stelle, an der „reserviert", „defekt" und „verfuegbar" auseinandergehalten werden | `:5268-5270` |
| Vier benannte Riegel-Fälle in `_db/leihen.test.ts`, **unterscheidbar**, auch wenn drei auf denselben `grund` laufen | `:5272-5279` |
| `Vorschlag = { name: string; zuletztText: string }` — **kein `string[]`**; das wäre „der Posten, der beim Port **still** verschwindet" | `:5029-5035`, `:4084-4085` |
| **Zwei** `openModuleDatabase`-Handles im WAL-Test, **eine Datei aus `os.tmpdir()`**, kein `:memory:`, und der Test prüft **seine eigene Voraussetzung** (`pragma("journal_mode")` = `"wal"`) | `:5420-5435`, `:6700-6710` |
| Der gestrichene Ausfall-Puffer `STALE_GRACE_MS` wird als **Zeile im Kommentarkopf** von `_db/leihen.ts` festgehalten, mit Verweis auf `radio-admin.service.ts:43-48` | `:5410-5415`, `:7104-7105` |
| Der Riegel gegen Doppelbuchen ist der **partielle Unique-Index** `loans_device_active_uidx` (`migrations/0001_loans_aktiv_uidx.sql`, dem Drizzle-Schema **unsichtbar**), **nicht** ein `SELECT` vor dem `INSERT` | `:3457-3464`, `_db/schema.ts` Kommentar bei `loans` |

---

## Die antd-Zuordnung — je Baustein, mit den vier „geht nicht 1:1"-Entscheidungen

Vollständig aus §4.6.1 (`:3648-3665`), ergänzt um die Server/Client-Spalte:

| Heute (Kiosk) | Künftig | Server/Client | Anmerkung |
|---|---|---|---|
| `ui/input.tsx` | antd `Input` | Client | `size` **nicht** setzen → erbt 56 (Falle 4). Löschkreuz: `allowClear`, nicht ein eigener 44er-Knopf |
| `ui/button.tsx` + `ui/touch-button.tsx` | antd `Button` | Client | `size` nicht setzen. `min-width` und `touch-action: manipulation` sind **Nachbau** (antd setzt Höhe, nicht Breite) |
| `ui/dialog.tsx` (Radix) | antd `Modal` | Client | bringt Escape, Klick daneben und Fokusfalle mit |
| `ui/textarea.tsx` | `Input.TextArea` mit `showCount maxLength` | **nur Client** | Compound → Falle 1. Der Zähler „0 / 500" kommt damit von antd |
| `ui/card.tsx` | antd `Card` | Server **oder** Client | `Card` ist RSC-sicher; `Card.Meta` **nicht** (Falle 1) |
| `ui/badge.tsx` + `StatusBadge.tsx` | **Nachbau** `_ui/StatusChip.tsx` | Server | siehe Entscheidung E3 unten |
| `ui/select.tsx`, `ui/label.tsx`, `ui/tooltip.tsx`, `ui/alert-dialog.tsx`, `ui/table.tsx`, `ui/skeleton.tsx` | **wandern nicht** | — | auf dieser Fläche unbenutzt |
| `BorrowerInput.tsx` (312 Zeilen) | antd `AutoComplete` + Nachbau der Nebenzeile | Client | Muster existiert: `src/app/m/feedback/_ui/Zuordnung.tsx:11`. 312 Zeilen fallen auf ~40 |
| `DeviceRow.tsx` / `DeviceGroup.tsx` | **Nachbau** im CSS-Modul | Client (Insel) | 64px-Zeile, Statuspunkt, zwei Textzeilen — **kein antd-Baustein passt** |
| `LoadingState` / `ui/skeleton.tsx` | antd `Card loading` bzw. `Spin` | Client | ⛔ **kein `Skeleton.Button`** — Compound (`m/files/_ui/SharesTabelle.tsx:274` schreibt genau das aus) |
| `ErrorState.tsx` | antd `Result` | Server | `Result` ist RSC-sicher |
| Leerzustände | antd `Empty` | Server | wie `lagerbuch/verwaltung/(arbeit)/page.tsx:130` |
| `sonner` / `toast.*` | **entfällt** | — | siehe Entscheidung E6 |
| `lucide-react` (18 Ikonen auf dieser Fläche, 36 im ganzen Alt-Kiosk) | **ein Inline-SVG-Modul** `_ui/ikonen.tsx` | Server | siehe Entscheidung E5 |
| `ThemeToggle` (localStorage, `defaultTheme="dark"`) | **entfällt** | — | siehe Entscheidung E7 |

### Entscheidung E3 — kein antd `Tag`, kein `Alert type="error"` für Status

**Grund, gemessen:** `colorError === colorPrimary === FARBEN.rot` (`src/core/theme/theme.ts:32-33`).
Rot ist in dieser Suite die **Primäraktion**; ein `Tag color="error"` für „Defekt" sähe aus wie der
Knopf, den man drücken soll (Falle 3). **Gebaut wird ein eigener Chip** mit eigenen Hexwerten in
`_lib/status.ts` (**ohne** `"use client"`, Falle 6) und **eigenen CSS-Variablen im Modul-Stylesheet,
nicht `--ant-*`** (Falle 2: antd deklariert seine Variablen auf seiner Scope-Klasse; eigenes Markup
sieht sie nicht, und der Fehler ist still). Der Statuspunkt (10px, `aria-hidden`) bleibt — **Farbe
ist nie der einzige Träger**. Die vier Hexwerte sind ⬜ **A-L10**.

### Entscheidung E4 — keine `Table`, und das ist eine vermiedene Falle, keine Stilfrage

Die Geräteliste ist schon kartenförmig; ein `columns[].render` aus einer Server Component ist HTTP
500 (Falle 9). Für ein Telefon ist die Karte ohnehin richtig (Spec `:3667-3670`).

### Entscheidung E5 — kein `@ant-design/icons` unter `m/radio/`, in keiner Datei

Der nackte Spezifizierer löst über `exports["."].node.import` auf CJS auf, das `createContext` auf
**Modulebene** ruft; in der RSC-Ebene gibt es das nicht → HTTP 500 **schon beim Import**.
`"use client"` behebt das **nicht** — es macht es still (Falle 7, `CLAUDE.md` Zeile 31-43).
`src/core/shell/icons.test.ts` riegelt es repo-weit ab. **Gebaut wird `_ui/ikonen.tsx` mit
Inline-SVG, ohne `"use client"`**, Bauform `lagerbuch/_ui/ikonen.tsx`.

⚠️ **`RefreshCw` fällt weg, obwohl der Knopf bleibt:** kein Zeichen, **Beschriftung
„Aktualisieren"** statt einer dreizehnten Inline-SVG (Spec `:3750-3752`).

### Entscheidung E6 — `sonner`-Toasts fallen ganz weg

In `src/app` gibt es **keinen** Aufruf von `message.*`, `notification.*` oder `App.useApp()` — ein
Toast-System wäre neu. Ersatz: **Erfolg** → `redirect` + Ergebnisparameter → RSC-Zeile in
`role="status" aria-live="polite"`. **Fehler einer Aktion** → am Ort der Aktion, aus dem
Ergebnis-Typ. **Fehler beim Laden** → antd `Result`. ⛔ **Nie `Alert type="error"` auf einer
Datenfläche** (Falle 3). Erfolgsfarbe **grün aus dem Chip-Satz**, nicht `colorSuccess` — ein
Farbsystem je Fläche (Spec `:3754-3776`).

### Entscheidung E7 — kein modul-eigener Hell/Dunkel-Umschalter, keine dunkle Vorgabe

Die Suite fährt Hell/Dunkel über `<html data-theme>` und **zwei** Cookies (`iuk-theme-pref`,
`iuk-theme-system`); ein zweites Umschaltmodell wären zwei Wahrheiten über dieselbe Frage. **Folge,
bemerkbar und deshalb Release-Notiz-pflichtig:** eine anonyme Besucherin ohne Cookies bekommt
**hell** statt wie bisher **dunkel**. Die vier Chipfarben tragen ihre Dunkelvariante trotzdem (Spec
`:3852-3949`, Zeile „Dunkel-Hell-Umschalter").

### Entscheidung E8 — die 64px sind ein CSS-Modul, keine zweite `ConfigProvider`-Ebene

⚠️ **Hier widersprechen sich zwei bindende Dokumente, und dieser Plan entscheidet ausdrücklich.**
NS-Z5 (Plan 2, `:3634-3690`) sagt: „**64 ist eine eigene `ConfigProvider`-Ebene** innerhalb des
Zweigs." §4.6.3 (`:3699-3726`) sagt: „Nachbau ist **44 und 64**, dazu `min-width` +
`touch-action: manipulation` — **kein antd-Token dafür**."

**§4.6.3 gewinnt**, aus einem Bauform-Grund: ein `ConfigProvider` ist eine **Client-Komponente**,
`_ui/AusleihRahmen.tsx` ist in der Dateiliste (`:4009`, Tabelle bei `:499`) aber ausdrücklich
**Server**. Eine `ConfigProvider`-Ebene im Rahmen machte den ganzen Rahmen zur Client-Grenze — genau
das, was §4.2 mit dem Server-Prop `aktiv` vermeidet. Außerdem deckt `controlHeight` nur die **Höhe**
von Bedienelementen ab; die 64px-Geräte**zeile** ist kein antd-Bedienelement, und `min-width` setzt
antd ohnehin nicht.

**Gebaut wird:** 44 und 64 als Klassen in `_ui/ausleihe.module.css`, plus `min-width` und
`touch-action: manipulation`. ⛔ **72 wird nirgends gesetzt** (das wäre `size="large"`), **56 wird
nirgends geschrieben, nur geerbt** — die Fläche läuft **ohne** `FullShell` und erbt deshalb
`controlHeight: TAP = 56` vom Wurzelprovider (`theme.ts:50-51`), nicht `ARBEITSDICHTE: 44`
(`theme.ts:207-209`). Auf einer handschuhbedienten Fläche ist 44 falsch.

### Entscheidung E9 — keine `<Shell>`, weder `full` noch `minimal` noch `kiosk`

Drei belegte Gründe (Spec `:3362-3372`): **(1)** Bediendichte, siehe E8. **(2)** `MinimalShell`
rendert `SuiteRahmen` (App-Umschalter, Benutzermenü, Seitenleiste) mit `maxWidth: 640`
(`MinimalShell.tsx:26-31`) — für eine Besucherin ohne Sitzung ist eine Suite-Kopfzeile ein Rätsel;
`KioskShell` fällt aus dem Gegengrund: `height: 100dvh; overflow: hidden` (`KioskShell.tsx:14`), und
eine Geräteliste scrollt. **(3)** Falle 8 (die 64px-Zeilenhöhe aus `.ant-layout-header`) wird gar
nicht erst berührt, weil ein eigener Kopf aus eigenem Markup keine Zeilenhöhe erbt.

### Entscheidung E10 — der Name der Gate-Insel

⚠️ **Die Spec führt für die Client-Insel des Gates keinen Namen.** Kapitel 3 sagt nur, das Codefeld
brauche „ohnehin eine `"use client"`-Insel wegen `useActionState`" (`:2929-2931`); Kapitel 4s
Dateiliste kennt sie nicht, weil das Gate nicht zu Kapitel 4 gehört. **Dieser Plan vergibt
`src/app/m/radio/_ui/GateFormular.tsx`** — zeichengleich zur Bauform der übrigen `_ui/`-Inseln, und
mit dem Präfix, unter dem die Ausleihfläche ihre Bausteine führt. Das ist eine **benannte
Planentscheidung**, keine Spec-Zitierung.

---

### Entscheidung E11 — die zwei Ergebnistypen und ihre `grund`-Unions liegen in `_lib/meldungen.ts`

⚠️ **Spec `:3446-3455` und `:3566-3573` schreiben `AusleihErgebnis` und `RueckgabeErgebnis` in
`_actions/ausleihe.ts`. Das ergibt einen Zyklus**, sobald man beide Seiten aufschreibt:
`_db/leihen.ts#bucheAusleihe` **gibt** `AusleihErgebnis` zurück (`:5026`), `_actions/ausleihe.ts`
**importiert** `bucheAusleihe` — und dieselbe Datei soll den Typ **deklarieren**. Dazu kommt: eine
`"use server"`-Datei ist ein Modulgrenzfall, aus dem eine Datenschicht keinen Typ importieren sollte.

**Entschieden: die zwei Ergebnistypen samt ihrer `grund`-Unions leben in `_lib/meldungen.ts`**
(kein `"use client"`, kein `"use server"`), **`_actions/ausleihe.ts` re-exportiert sie**, damit die
Signaturen aus der Spec wörtlich gelten. Zwei Gründe, beide belegt:

1. **Spec `:5229-5232`, wörtlich:** „die Union ist die Rueckgabeform beider Schreib-Actions, und
   **jeder** `grund` braucht dort einen Text." Union und Sätze in **einer** Datei ist genau das, was
   der Testfall „jeder `grund` hat genau einen Satz" (`:4053`) braucht — über zwei Dateien hinweg
   wäre er eine Kopplung, die niemand erzwingt.
2. **Hauspräzedenz:** `lagerbuch` führt seine geteilten Action-Typen in `_lib/actionTypen.ts` und
   teilt `SperrGrund` zwischen `_lib/helferZugang.ts:63` und dort.

⛔ **Was dabei NICHT verloren gehen darf:** `betroffen[].status` ist der Platz des heutigen
`condition`-Felds aus dem 409-Rumpf (`loanApi.ts:168`) — „das einzige, das dem Kiosk sagt, **warum**
ein Gerät nicht verfügbar ist" (Spec `:5223-5228`). **Ein `betroffen`-Eintrag ohne `status` ist
derselbe Verlust in neuer Schreibweise.**

---

### Entscheidung E12 — die Inline-Erneuerung der Sitzung WIRD gebaut, und `_actions/sitzung.ts` bekommt `erneuereSitzung`

⚠️ ⬜ **A-L14 ist die Umfangsfrage dazu; diese Entscheidung ist die Antwort, die dieser Plan gibt,
solange der Betreiber nichts anderes sagt.**

**Der Befund:** Ein erster Entwurf dieses Plans gab `_actions/sitzung.ts` genau **einen** Export,
`beenden`, und ließ die Wiedereingabe am Formular ungebaut — weder als Fläche noch als benannte
Leerstelle noch als Zeile in „Was Planteil 3 NICHT liefert". **Das ist an vier Spec-Stellen falsch,
und es ist in keinem Tor sichtbar:**

| Spec-Stelle | Wortlaut |
|---|---|
| `:2258` (§3.3.1) | „Es gibt genau **drei** Stellen, die eine Ausleih-Sitzung ausstellen. **Alle drei** tragen dieselben sechs Schritte in derselben Reihenfolge." |
| `:3108` (§3.8) | der Reihenfolge-Scan läuft über `t/[code]/route.ts`, `_actions/gate.ts` **und `_actions/sitzung.ts`** |
| `:2563-2570` (§3.4.4) | „**Was stattdessen gebaut wird, ist die Wiedereingabe am Formular.** … die Fläche bietet **inline** ein Codefeld an, das die Sitzung erneuert, **ohne die eingetragenen Werte zu verlieren**. Vorbild: `erneuereSitzung` in `src/app/m/lagerbuch/_actions/sitzung.ts:51`." |
| `:3235-3236` (§3.10 Zusage **Nr. 8**) | „**Kapitel 4:** die Inline-Erneuerung der Sitzung wird **nur** bei `grund === "sitzung"` angeboten, nie bei `"gesperrt"`." |

⛔ **Und es gibt keinen späteren Eigentümer.** Planteil 4 ist Kapitel 5 (Verwaltung), Planteil 5 ist
Kapitel 7/8 (Betrieb, Tests). Eine Zusage aus Kapitel 3 und 4 hat **hier** ihren einzigen Ort;
„später" hieße: nie, ohne einen neuen Plan.

**Entschieden: gebaut, in dieser Aufteilung.**

| Hälfte | Wo | Was |
|---|---|---|
| die Action | **A9**, `_actions/sitzung.ts` | zweiter Export `erneuereSitzung(rohCode: string): Promise<{ ok: true } \| { ok: false; text: string }>` — **dieselben sechs Schritte** wie das Gate (Host-Riegel werfend, `gateGesperrt`, `normalisiereCode` als **eigene Anweisung**, `loeseCodeEin`, bei Erfolg Cookie setzen **ohne** Redirect, bei Misserfolg `gateFehlversuchBuchen`). Vorbild **wörtlich**: `src/app/m/lagerbuch/_actions/sitzung.ts:51-101` |
| der Träger im Typ | **A14**, `_lib/meldungen.ts` | ⛔ **Entscheidung E13**, unten |
| die Weitergabe | **A17**, `_actions/ausleihe.ts` | die zwei Schreib-Actions reichen `{ ok:false, grund }` aus `requireAusleihSchreibend` **unverändert** an das Formular durch |
| die Fläche | **A19** und **A20**, `_ui/SitzungErneuern.tsx` | eine `"use client"`-Insel, gerendert **nur** bei `grund === "sitzung"`, ⛔ **nie** bei `"gesperrt"` (Zusage Nr. 8) — **im selben Formular, ohne die eingetragenen Werte zu verlieren** |

⛔ **Die Folge, die man aussprechen muss: die Ausnahmeliste des Guard-Scans wächst auf DREI.**
Spec `:6762` schreibt „**GENAU ZWEI** namentlich benannten Einträgen: `_actions/gate.ts#einloesenAmGate`
und `_actions/sitzung.ts#beenden`". Diese Zahl ist unter der Annahme geschrieben, dass es
`erneuereSitzung` nicht gibt — sie steht gegen die vier Stellen oben. **Verbindlich sind hier die
vier**, und die Liste bekommt den dritten Eintrag `_actions/sitzung.ts#erneuereSitzung`:

* **Die Begründung von `:6762` trägt ihn wörtlich mit:** „beide tragen `requireRadioHost` und
  ausdrücklich **keinen** Sitzungsriegel". `erneuereSitzung` **erzeugt** die Sitzung — ein
  Sitzungsriegel davor wäre die Tür, die sich selbst abschließt (§3.3.3, `:2359-2362`); der
  Host-Riegel steht als erste Anweisung.
* **Die Zählregel bleibt unverletzt.** Ihr Zweck ist „wächst die Liste, ist das ein **roter Test**
  und keine Zeile im Diff" — die Liste wächst hier durch eine **ausgeschriebene Entscheidung mit
  Begründung**, genau die Form, die die Regel verlangt. ⛔ **Ein VIERTER Eintrag ist weiterhin ein
  roter Test.**
* **Der Bestand tut dasselbe:** `lagerbuch/_actions/guards.test.ts` führt drei Ausnahmen, und
  `lagerbuch/_actions/sitzung.ts:19-26` schreibt für beide Einträge dieser Datei die identische
  Begründung aus.

⛔ **Und die zweite Folge: der Reihenfolge-Scan misst ab jetzt eine FUNKTION, nicht eine Datei.**
`_actions/sitzung.ts` trägt zwei Exporte, und `beenden` trägt nur den Host-Riegel. Ein Scan über den
**Dateitext** meldete für sie „Sperre fehlt ganz" — die Fehlerform, gegen die der Ausschnitt
überhaupt existiert (der Plan schreibt sie in A9 selbst aus). **Verbindlich: je Fläche wird der
Körper **einer benannten Funktion** gescannt** (`funktionsKoerper` aus `riegel.test.ts:237-252`),
und die Zuordnung steht als eigene Konstante. Details in **A9**.

---

### Entscheidung E13 — `SperrGrund` wandert in die zwei `grund`-Unions

**Der Befund:** Zusage §3.10 Nr. 8 verlangt, dass die Fläche `grund === "sitzung"` von
`"gesperrt"` unterscheidet. Die zwei Ergebnistypen der Spec (`:3449`, `:3568`) tragen diese
Unterscheidung aber **nicht** — ihre `grund`-Unions kennen nur fachliche Ausgänge
(`keine-auswahl`, `kein-name`, `nicht-verfuegbar`, `verschwunden`, `unbekannt` bzw.
`schon-zurueck`, `unbekannt-geworden`, `notiz-zu-lang`, `unbekannt`). ⛔ **Ohne einen Träger ist der
zweite Zweig von `SperrGrund` folgenlos** — typkorrekt, lint-sauber, testgrün und ohne jede Wirkung,
obwohl A7 ihn eigens deklariert (`:2407-2411` schreibt die Begründung selbst hin).

**Entschieden: die zwei Werte aus `SperrGrund` werden den zwei `grund`-Unions HINZUGEFÜGT**, in
`_lib/meldungen.ts` (E11). Nicht ein zweites Feld daneben, nicht ein `boolean`:

```ts
// _lib/meldungen.ts (A14)
export type AusleihErgebnis =
  | { ok: true; anzahl: number; entleiher: string }
  | { ok: false;
      grund: "keine-auswahl" | "kein-name" | "nicht-verfuegbar" | "verschwunden" | "unbekannt"
           | "sitzung" | "gesperrt";                       // ⬅ E13
      text: string; betroffen: { rufname: string; status: string }[] };

export type RueckgabeErgebnis =
  | { ok: true; rufname: string }
  | { ok: false;
      grund: "schon-zurueck" | "unbekannt-geworden" | "notiz-zu-lang" | "unbekannt"
           | "sitzung" | "gesperrt";                       // ⬅ E13
      text: string };
```

Drei Gründe, jeder belegt:

1. **Die Union ist bereits die Trägerform.** Spec `:5229-5232`, wörtlich: „die Union ist die
   Rueckgabeform beider Schreib-Actions, und **jeder** `grund` braucht dort einen Text." Zwei
   weitere Gründe sind zwei weitere Sätze — die Datei, die die Sätze führt, ist ohnehin
   `_lib/meldungen.ts`.
2. **Die Alternative ist schlechter.** Ein zusätzliches Feld `erneuerbar?: boolean` verdoppelte die
   Wahrheit: die Insel prüfte `erneuerbar`, der Satz käme aus `grund`, und die beiden liefen beim
   ersten Umbau auseinander — ohne dass ein Test es sähe.
3. **Die Signaturen der Spec bleiben sonst wörtlich.** Nur die zwei Unions wachsen; Parameterlisten,
   Namen und `ok`-Zweige sind unverändert (E11 hält die Signaturen bereits als Re-Export).

⛔ **`betroffen` ist bei `grund: "sitzung"` und `"gesperrt"` die leere Liste `[]`** — es gibt kein
betroffenes Gerät, der Vorgang ist am Riegel gescheitert. ⛔ **Und die Vollzähligkeitszahlen in A14
sind damit gesetzt: `AusleihErgebnis` hat SIEBEN Fehlergründe, `RueckgabeErgebnis` SECHS.** Sie
stehen dort als eigene Zusicherung außerhalb der Schleife — eine Schleife über eine geschrumpfte
Menge ist leer-grün.

---

## Was dieser Plan anlegt und ändert

### Neu (66 Dateien, in 40 Zeilen aufgeführt)

⚠️ **Gezählt sind Dateien, nicht Zeilen** — mehrere Zeilen unten führen zwei Dateien nebeneinander.

**Block A — der Zugang (26 Dateien in 17 Zeilen):**

```
src/app/m/radio/_lib/grenzen.ts              _lib/grenzen.test.ts
src/app/m/radio/_lib/code.ts                 _lib/code.test.ts
src/app/m/radio/_lib/gateSchranke.ts         _lib/gateSchranke.test.ts
src/app/m/radio/_lib/ausleihSitzung.ts       _lib/ausleihSitzung.test.ts
src/app/m/radio/_lib/gateTexte.ts            _lib/gateTexte.test.ts
src/app/m/radio/_lib/returnTo.ts             _lib/returnTo.test.ts
src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts   _lib/schreibpfade/codeEinloesung.test.ts
src/app/m/radio/_lib/ausleihZugang.ts        _lib/ausleihZugang.test.ts
src/app/m/radio/_lib/bauform.test.ts
src/app/m/radio/_actions/codes.ts
src/app/m/radio/_actions/gate.ts
src/app/m/radio/_actions/sitzung.ts
src/app/m/radio/_actions/guards.test.ts
src/app/m/radio/t/[code]/route.ts
src/app/m/radio/abmelden/route.ts
src/app/m/radio/page.tsx                     page.test.tsx
src/app/m/radio/_ui/GateFormular.tsx
```

**Block B — die Fläche (40 Dateien in 23 Zeilen):**

```
src/app/m/radio/_db/leihen.ts                _db/leihen.test.ts
src/app/m/radio/_lib/anzeige.ts              _lib/anzeige.test.ts
src/app/m/radio/_lib/status.ts               _lib/status.test.ts
src/app/m/radio/_lib/filter.ts               _lib/filter.test.ts
src/app/m/radio/_lib/auswahl.ts              _lib/auswahl.test.ts
src/app/m/radio/_lib/meldungen.ts            _lib/meldungen.test.ts
src/app/m/radio/_actions/ausleihe.ts         _actions/ausleihe.test.ts
src/app/m/radio/_ui/ikonen.tsx               _ui/ikonen.test.tsx
src/app/m/radio/_ui/StatusChip.tsx           _ui/StatusChip.test.tsx
src/app/m/radio/_ui/AusleihRahmen.tsx        _ui/AusleihRahmen.test.tsx
src/app/m/radio/_ui/Restzeit.tsx
src/app/m/radio/_ui/ausleihe.module.css      (in A11 angelegt, in A16/A18-A20 erweitert)
src/app/m/radio/(ausleihe)/layout.tsx
src/app/m/radio/(ausleihe)/geraete/page.tsx              geraete/page.test.tsx
src/app/m/radio/(ausleihe)/ausleihen/page.tsx            ausleihen/page.test.tsx
src/app/m/radio/(ausleihe)/rueckgabe/page.tsx            rueckgabe/page.test.tsx
src/app/m/radio/_ui/GeraeteListe.tsx         _ui/GeraeteListe.test.tsx
src/app/m/radio/_ui/GeraeteZeile.tsx
src/app/m/radio/_ui/AusleihVorgang.tsx       _ui/AusleihVorgang.test.tsx
src/app/m/radio/_ui/EntleiherFeld.tsx
src/app/m/radio/_ui/RueckgabeListe.tsx
src/app/m/radio/_ui/RueckgabeDialog.tsx      _ui/RueckgabeDialog.test.tsx
src/app/m/radio/_ui/SitzungErneuern.tsx      _ui/SitzungErneuern.test.tsx
```

### Geändert (4)

| Datei | Was | Aufgabe |
|---|---|---|
| `src/app/m/radio/riegel.test.ts` | neue **Klausel (f)** (Z-L3), `HANDLER_ANZAHL` 0 → 2, Kopfkommentar (Fahrplan und Z-L3-Absatz) nachgezogen | A10, A11, A18, A19, A20 |
| `scripts/import/radio-paritaet.test.ts` | Zeile 140 `toBeGreaterThanOrEqual(SICHTEN.length)` → `toBe(6)` (**NT11**), plus Korrektur des irreführenden Kommentars darüber | **A8**, eigener Schritt |
| `.env.example` | vier `RADIO_*`-Zahlen + `RADIO_AUSLEIH_SITZUNG_SECRET` (kommentiert, wie `LAGERBUCH_HELFER_SITZUNG_SECRET` in `:282`/`:314`) | A1 |
| `src/app/m/radio/_lib/seedLokal.ts` | **nur ein Kommentar**, kein Code: die Zusicherung, dass hier **niemals** eine `zugangscodes`-Zeile entsteht (Falle № 31) | A8 |

### Nicht angefasst — mit Begründung für jede Nicht-Berührung

| Datei / Bereich | Warum nicht |
|---|---|
| `radio-admin/server/src/routes/loanApi.ts` (die sechs `/v1`-Routen) | ⛔ **Entscheidung 15** — die HTTP-Grenze fällt erst mit Planteil 4. „Wird sie früher gekappt, steht der Alt-Kiosk ohne Bestand da" |
| `radio-inventar/` **vollständig** | derselbe Grund. Der Alt-Kiosk spricht bis Planteil 4 weiter mit seinem eigenen Backend; er wird **nicht** umgestellt, ersetzt oder auch nur gelesen-und-geändert (Lesen als Portierungsquelle ist erlaubt und nötig) |
| `src/app/m/radio/_lib/nav.ts` | trägt die **Verwaltungs**navigation für `FullShell` und ist bewusst leer (`nav.ts:12-15`: „Ein Eintrag, der auf 404 fuehrt, ist schlimmer als kein Eintrag"). ⬜ Planteil 4 füllt sie und stellt sie auf `radioNav(stufe)` um. **Die Fußnavigation der Ausleihe ist nicht dieselbe Sache** — sie lebt in `_ui/AusleihRahmen.tsx` und trägt drei Ziele, keine `SuiteNavItem` |
| `src/app/m/radio/_lib/zugang.ts` | ⛔ **NS-Z7/NS-Z8 gehören Planteil 4** — `merkeNutzer(getDb(), viewer)` und `requireRadioVerwaltung` werden hier **nicht** vorgebaut |
| `src/app/m/radio/admin/(arbeit)/layout.tsx`, `admin/(druck)/layout.tsx` | Planteil 4. Klausel (a) und (e) von `riegel.test.ts` bleiben unverändert auf `/admin/` verankert |
| `src/app/m/radio/_lib/boot.ts` | `radioBootFehler()` und `starteRadioHintergrund()` sind Kapitel 7 = **Planteil 5** (B8). ⬜ A-L7 |
| `src/core/ratelimit.ts` | die CWE-348-Umstellung ist gebaut; der Self-Hop-Check ist ein **eigener Posten** mit eigenen Leerstellen (⬜ A-L6). ⛔ Planteil 3 baut ihn nicht nebenbei mit |
| `src/core/groups.ts` | der Suite-Admin-Kurzschluss fällt **vor Planteil 4** (Leitplan `:120`) |
| `src/app/m/portal/_lib/neuigkeiten/` | ⬜ **A-L4** — die drei Notizen brauchen ein `datum` (den Rollout-Tag), und `register.test.ts` erzwingt das Dreieck Dateiname ↔ Feld ↔ Registerzeile. Eine Datei mit erfundenem Datum wäre genau die verbotene Erfindung |
| `src/app/m/radio/_db/schema.ts`, `_db/migrations/` | `zugangscodes` und `loans.zugangscode_id` stehen seit Planteil 1. ⛔ **Migrationen sind append-only** — eine neu erzeugte bestehende Migrationsdatei hat in `radio-admin` einmal die Produktion lahmgelegt |
| `e2e/` | die e2e-Fläche gehört **Planteil 5** (Leitplan `:91`). Die sechs Namen wandern als Zusage weiter |

---

## Reihenfolge der Aufgaben

| # | Aufgabe | Block | Tor | Hängt an |
|---|---|---|---|---|
| **A1** | `_lib/grenzen.ts` — die vier Zahlen und das Geheimnis | A | eigenes | — |
| **A2** | `_lib/code.ts` — der 28-Zeichen-Coderaum | A | eigenes | — |
| **A3** | `_lib/gateSchranke.ts` — die zwei modulweiten Zähler | A | eigenes | A1 |
| **A4** | `_lib/ausleihSitzung.ts` — das host-only Cookie und sein JWT | A | eigenes | A1 |
| **A5** | `_lib/gateTexte.ts` und `_lib/returnTo.ts` | A | eigenes | — |
| **A6** | `_lib/schreibpfade/codeEinloesung.ts` — die Einlösung | A | eigenes | A2, A4 |
| **A7** | `_lib/ausleihZugang.ts` — das Zugangsprädikat, drei Formen | A | eigenes | A4 |
| **A8** | `_actions/codes.ts`, `_actions/guards.test.ts`, **NT11**, `seedLokal`-Zusicherung | A | eigenes | A2 |
| **A9** | `_actions/gate.ts`, `_actions/sitzung.ts` (⛔ **zwei Exporte**: `beenden` **und** `erneuereSitzung`, E12), `_lib/bauform.test.ts` | A | ⛔ **gemeinsam mit A10** | A3, A5, A6, A8 |
| **A10** | `t/[code]/route.ts`, `abmelden/route.ts`, `HANDLER_ANZAHL` 0 → 2 | A | ⛔ **gemeinsam mit A9** | A9 |
| **A11** | `page.tsx` (das Gate), `_ui/GateFormular.tsx`, **`riegel.test.ts` Klausel (f)** — ⬜ Z-L3 geschlossen | A | eigenes | A7, A9, A10 |
| **A12** | `_lib/anzeige.ts` und `_lib/status.ts` | B | eigenes | — |
| **A13** | `_lib/filter.ts` und `_lib/auswahl.ts` | B | eigenes | — |
| **A14** | `_lib/meldungen.ts` — ⛔ **und die zwei Ergebnistypen mit ihren `grund`-Unions** (E11), ⛔ **einschließlich der zwei Sperr-Gründe** (E13) | B | eigenes | — |
| **A15** | `_db/leihen.ts` — die fünf Lese- und Schreibpfade | B | eigenes | **A12** (fertige Zeitzeichenketten), **A13** (`normalisiereSuchtext` fuer `suchschluessel`), **A14** (die Ergebnistypen) |
| **A16** | `_ui/ikonen.tsx`, `_ui/StatusChip.tsx`, `_ui/AusleihRahmen.tsx`, `_ui/Restzeit.tsx` — ⬜ **L10** entsteht hier | B | eigenes | A7, A12 |
| **A17** | `_actions/ausleihe.ts` — die vier Server Actions | B | eigenes | A7, A13, A14, A15 |
| **A18** | `(ausleihe)/layout.tsx`, `geraete/page.tsx`, `GeraeteListe`, `GeraeteZeile`, Klausel (f) 1 → 3 | B | eigenes | A11, A13, A15, A16, A17 |
| **A19** | `ausleihen/page.tsx`, `AusleihVorgang`, `EntleiherFeld`, **`SitzungErneuern`** (E12), Klausel (f) 3 → 4 | B | eigenes | A18, **A9** (`erneuereSitzung`) |
| **A20** | `rueckgabe/page.tsx`, `RueckgabeListe`, `RueckgabeDialog`, Klausel (f) 4 → 5 | B | eigenes | A18, **A19** (`SitzungErneuern` wird mitbenutzt, ⛔ nicht neu gebaut) |

⚠️ **A12–A14 hängen an keiner Aufgabe aus Block A** und könnten formal vorgezogen werden. **Tu das
nicht.** Block A muss zuerst stehen, weil `riegel.test.ts` Klausel (f) erst in A11 entsteht: eine
`(ausleihe)/`-Fläche vor A11 wäre **unbewacht**, und das ist genau der Zustand, gegen den dieser
ganze Weg antritt.

⛔ **Und die Reihenfolge INNERHALB von Block B ist keine Geschmacksfrage: die reinen Funktionen
stehen VOR der Datenschicht.** `_db/leihen.ts` (A15) liefert **fertige Zeichenketten** (`seit`,
`seitText` — §4.1 Punkt 1, Spec `:4082-4088`) und einen **normalisierten** `suchschluessel` (§4.5.2);
es braucht dafür `_lib/anzeige.ts` (A12) und `_lib/filter.ts` (A13). Seine zwei Schreibpfade geben
`AusleihErgebnis`/`RueckgabeErgebnis` zurück, und Spec `:5229-5232` sagt wörtlich: „die Union ist die
Rueckgabeform beider Schreib-Actions, und **jeder** `grund` braucht dort einen Text" — also
`_lib/meldungen.ts` (A14). **Wer A15 vorzieht, stubbt drei Module — und Stubs werden nicht ersetzt.**

---

# BLOCK A — DER ZUGANG (Spec-Kapitel 3, `:1979-3286`)

> Elf Aufgaben. Erst die reinen Funktionen, dann der Schreibpfad, dann das Zugangsprädikat, dann die
> Actions, dann die zwei Route Handler, zuletzt das Gate an `/`. **Block A steht vollständig für
> sich** — er braucht keine Zeile aus Block B, und am Ende von A11 ist der anonyme Zugang
> funktionsfähig, auch wenn hinter ihm noch nichts liegt.

---

## Aufgabe A1: Die Grenzen — `_lib/grenzen.ts`

**Files:**
- Create: `src/app/m/radio/_lib/grenzen.ts`
- Create: `src/app/m/radio/_lib/grenzen.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nichts.
- Produces: `grenzen()` — gelesen von **A3** (`gateSchranke.ts`, auf Modulebene) und **A4**
  (`ausleihSitzung.ts`, über `ausleihGueltigkeitSekunden()`); `ausleihSitzungGeheimnis()` — gelesen
  **nur im Thunk** von A4.

**Vorbild:** `src/app/m/lagerbuch/_lib/grenzen.ts` (die `ZAHLEN`-Tabelle mit `einheit`/`min`/`max`/
`vorgabe` je Eintrag steht dort ab `:62`).

### Die vier Zahlen, mit ihren Werten (Spec `:2032-2040`, `:3006-3009`, B18 `:118`)

| Variable | Einheit | min | max | vorgabe | Begründung der Zahl |
|---|---|---|---|---|---|
| `RADIO_AUSLEIH_SITZUNG_STUNDEN` | Stunden | 1 | 24 | **12** | wie `lagerbuch`. ⬜ **A-L1** — zu bestätigen. Obergrenze 24: eine Feldsitzung darf nie länger dauern als eine Schicht plus Puffer |
| `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | Anzahl/min | 1 | 60 | **5** | die **Bequemlichkeitsgrenze**, nicht die Abwehr |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | Anzahl/min | 1 | 600 | **30** | modulweite Burst-Kappe gegen Rotation des Absenderschlüssels; **= sechs Absender-Budgets** |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | Anzahl/h | 1 | 3600 | **300** | **DER tragende Zähler**; `= 5/min × 60`. Stellt genau die Zusage wieder her, die das Per-Absender-Limit nur unter der Annahme einer wahrhaftigen Adresse hatte |

⛔ **`RADIO_AUSLEIH_SITZUNG_SECRET`, nicht `..._GEHEIMNIS`.** Der Kapiteltext `:2042` schreibt
`GEHEIMNIS`; **B2 (`:91`) sticht** und setzt `SECRET` (englische Endung nach dem Präzedenzfall
`LAGERBUCH_HELFER_SITZUNG_SECRET`, `.env.example:282`). Es ist **Pflicht, ohne Vorgabe**, und wird
**nie auf Modulebene gelesen** (Zulässigkeitstafel Zeile 13).

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/grenzen.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DIE DOPPELFUEHRUNG (Vorbild `src/app/m/lagerbuch/_lib/grenzen.test.ts`).
 *
 * ⛔ DIESER TEST FUEHRT SEINE EIGENE TABELLE UND ZIEHT SIE NICHT AUS DER IMPLEMENTIERUNG.
 * `_lib/grenzen.ts` exportiert `ZAHLEN` deshalb ausdruecklich NICHT — nur die NAMEN.
 * Wer `ZAHLEN` exportierte, machte aus diesem Test eine Tautologie: er pruefte den Code
 * gegen sich selbst und bliebe auch bei falscher Einheit gruen
 * (`lagerbuch/_lib/grenzen.ts:88-100`, Spec 1 §10.8 Eigenschaft 2).
 *
 * ⚠️ ES SIND VIER ZAHLEN, NICHT FUENF: `RADIO_AUSLEIH_SITZUNG_SECRET` ist eine
 * PFLICHTZEICHENKETTE ohne Vorgabe und steht deshalb nicht in dieser Tabelle. Sie wird
 * im Thunk gelesen (Spec:2042-2047) und hat hier eigene Faelle.
 */
const SOLL = {
  RADIO_AUSLEIH_SITZUNG_STUNDEN: { feld: "ausleihSitzungStunden", einheit: "Stunden", min: 1, max: 24, vorgabe: 12 },
  RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: { feld: "gateProAbsenderProMin", einheit: "Anzahl/min", min: 1, max: 60, vorgabe: 5 },
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: { feld: "gateGesamtProMin", einheit: "Anzahl/min", min: 1, max: 600, vorgabe: 30 },
  RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: { feld: "gateGesamtProStunde", einheit: "Anzahl/h", min: 1, max: 3600, vorgabe: 300 },
} as const;

const UMGEBUNG = { ...process.env };
beforeEach(() => { process.env = { ...UMGEBUNG }; });
afterEach(() => { process.env = { ...UMGEBUNG }; });

/**
 * Ein frischer Modulzustand je Fall — `grenzen()` liest die Umgebung beim Aufruf, aber ein
 * spaeterer Umbau auf einen Modulebenen-Cache liefe sonst still an diesem Test vorbei.
 *
 * ⛔ `vi.resetModules()` UND NICHT `import(`./grenzen?t=${Math.random()}`)`. Der
 * Query-String-Trick loest fuer `.ts`-Dateien nicht unter jeder Vite-Aufloesung auf, und
 * DIESE Datei ist die erste, die ein Ausfuehrender ueberhaupt anfasst — ein Fehlschlag
 * hier kostet ihn eine Stunde an der falschen Stelle. Dieselbe Form benutzt A3.
 */
const frisch = async () => { vi.resetModules(); return import("./grenzen"); };

describe("radio-Grenzen: die Namensliste ist vollzaehlig", () => {
  it("genau vier Zahlen, und zwar diese vier", async () => {
    /*
     * ⛔ `toEqual` auf die SORTIERTE Liste, nicht `toContain` je Name. Ein `toContain`
     * bliebe gruen, wenn jemand eine fuenfte Variable ergaenzt, die in SOLL fehlt — und
     * genau diese Richtung ist die gefaehrliche: eine Zahl ohne Gegenprobe hier.
     *
     * ⛔ Die drei GATE-Namen sind in B18 (Spec:118) verbindlich gesetzt. Kapitel 7 nannte
     * nur das Praefix `RADIO_GATE_*`; wer sich darauf beruft, baut andere Namen, und der
     * Boot-Helfer aus Kapitel 7 (Planteil 5) prueft dann drei Variablen, die es nicht gibt.
     *
     * ⛔ `RADIO_AUSLEIH_SITZUNG_STUNDEN` und NICHT `RADIO_ZUGANG_SITZUNG_STUNDEN` — B1
     * (Spec:90): „Ausleih" ist die Rolle, „Zugang" die Mechanik.
     */
    const { ZAHL_NAMEN } = await frisch();
    expect([...ZAHL_NAMEN].sort()).toEqual(Object.keys(SOLL).sort());
  });
});

describe("radio-Grenzen: jede Zahl haelt ihre Vorgabe, ihre Unter- und ihre Obergrenze", () => {
  it.each(Object.entries(SOLL))("%s", async (name, regel) => {
    /*
     * Drei Zusicherungen je Zahl, und jede hat ihre eigene Mutation:
     *   leere Umgebung -> `vorgabe`            (Mutation: andere Vorgabe eintragen)
     *   ein Wert UNTER `min` -> Wurf           (Mutation: `min` senken oder Pruefung streichen)
     *   ein Wert UEBER `max` -> Wurf           (Mutation: `max` heben oder Pruefung streichen)
     *
     * ⚠️ EIN UNGUELTIGER WERT WIRFT, ER FAELLT NICHT AUF DIE VORGABE ZURUECK. Das ist
     * gewollt (`lagerbuch/_lib/gateSchranke.ts:12-14`): „ein Modul, das mit einer kaputten Zahl
     * gar nicht erst startet, ist richtiger als eines, das still eine andere Grenze faehrt
     * als die, die in der .env steht."
     *
     * ⛔ `regel.feld` STEHT ALS EXPLIZITE TABELLENSPALTE OBEN, NICHT ALS UMFORMUNG DES
     * NAMENS. Eine generische Umformung (`RADIO_GATE_…` -> camelCase) waere ein zweites
     * Stueck Logik neben der Implementierung; machen beide denselben Fehler, ist der Test
     * gruen und bewacht nichts.
     */
    delete process.env[name];
    expect((await frisch()).grenzen()[regel.feld]).toBe(regel.vorgabe);

    process.env[name] = String(regel.min - 1);
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow();

    process.env[name] = String(regel.max + 1);
    await expect(frisch().then((m) => m.grenzen())).rejects.toThrow();
  });
});

describe("radio-Grenzen: das Sitzungsgeheimnis", () => {
  it("heisst RADIO_AUSLEIH_SITZUNG_SECRET und wirft, wenn es fehlt", async () => {
    /*
     * ⛔ B2 (Spec:91) gegen den Kapiteltext (Spec:2042). Der Kapiteltext schreibt
     * `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS` — das ist der aeltere, ueberholte Wortlaut.
     * Bauverbindlich ist `RADIO_AUSLEIH_SITZUNG_SECRET`. Dieser Fall ist der einzige Ort,
     * an dem der Name als Zeichenkette festgehalten ist; ohne ihn liefe eine Umbenennung
     * still durch — der Leser bekaeme `undefined` und die Sitzung waere unsignierbar.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    const { ausleihSitzungGeheimnis } = await frisch();
    expect(() => ausleihSitzungGeheimnis()).toThrow(/RADIO_AUSLEIH_SITZUNG_SECRET/);
  });

  it("wird NICHT auf Modulebene gelesen — der Import gelingt ohne gesetzte Umgebung", async () => {
    /*
     * ⛔ DIE ZUSICHERUNG, DIE `pnpm build` RETTET (Spec:2042-2047, Bestand
     * `lagerbuch/_lib/helferSitzung.ts:39-49`). `next build` laeuft mit
     * NODE_ENV=production und OHNE Secrets und wertet Modulebene aus.
     *
     * ⚠️ DIESER FALL PRUEFT `grenzen.ts` SELBST, NICHT `ausleihSitzung.ts`. Die
     * Gegenprobe fuer den Thunk in `ausleihSitzung.ts` steht in A4; sie kann hier noch
     * nicht stehen, weil es die Datei noch nicht gibt.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    await expect(frisch()).resolves.toBeTruthy();
  });
});
```

- [ ] **Schritt 2: Grün sehen, dann den Fehlschlag mit einer Sonde herstellen**

Die Datei existiert beim ersten Lauf noch nicht; ein `Cannot find module` ist **kein Beweis**.
Schreibe zuerst `grenzen.ts` (Schritt 3), lass den Test grün laufen, und stelle **dann** die Sonde:

```
# Sonde S-A1: die Obergrenze von RADIO_AUSLEIH_SITZUNG_STUNDEN in grenzen.ts von 24 auf 999 heben
rtk pnpm vitest run src/app/m/radio/_lib/grenzen.test.ts
```

Erwartet: **genau ein roter Fall** (`RADIO_AUSLEIH_SITZUNG_STUNDEN`) — `max + 1 = 25` wirft nicht
mehr. Zitiere die Meldung **und die Gesamtzahl**; eine unerklärte Zusatzmenge ist der Anfang jeder
Fehlersuche in die falsche Richtung. Dann restlos zurück:

```
rtk git checkout -- src/app/m/radio/_lib/grenzen.ts
rtk git status --porcelain src/app/m/radio/_lib/grenzen.ts
```

Erwartet: **leer**.

- [ ] **Schritt 3: `_lib/grenzen.ts` schreiben und grün sehen**

Bauform 1:1 aus `lagerbuch/_lib/grenzen.ts`. Verbindlich:
1. `const ZAHLEN = { … } as const satisfies Record<string, ZahlRegel>` mit `einheit`/`min`/`max`/
   `vorgabe` je Eintrag, **jede mit ausgeschriebener Begründung als Kommentar** (die Spalte
   „Begründung der Zahl" aus der Tabelle oben, jede mit ihrer Spec-Zeile).
2. ⛔ **`ZAHLEN` wird NICHT exportiert** — nur `ZAHL_NAMEN`. Begründung als Kommentar mit Verweis
   auf `lagerbuch/_lib/grenzen.ts:88-100`.
3. `grenzen()` liest die Umgebung, prüft `min`/`max` und **wirft bei ungültigem Wert** (kein
   stiller Rückfall auf die Vorgabe).
4. `ausleihSitzungGeheimnis(): string` liest `RADIO_AUSLEIH_SITZUNG_SECRET` und wirft **mit dem
   Variablennamen in der Meldung**, wenn es fehlt oder leer ist.
5. ⛔ **Kein `"use client"`** (`riegel.test.ts:684-703`).
6. ⬜ **Belegzeile für A-L1** am Eintrag `RADIO_AUSLEIH_SITZUNG_STUNDEN`: „12 ist der **Vorschlag**
   der Spec (§3.4.3), nicht die Antwort des Betreibers — ⬜ A-L1, §3.11 Punkt 1."
7. ⬜ **Belegzeile für A-L7** am Geheimnis: „Es gibt für dieses Modul heute **keine** Boot-Prüfung
   auf das Geheimnis — `radioBootFehler()` ist Kapitel 7 und damit Planteil 5 (B8, Spec:97). Fehlt
   die Variable, fällt das erst beim ersten Einlösen auf. ⬜ A-L7."

```
rtk pnpm vitest run src/app/m/radio/_lib/grenzen.test.ts src/app/m/lagerbuch/_lib/grenzen.test.ts
```

Erwartet: **beide grün**. `lagerbuch/_lib/grenzen.test.ts` läuft mit, weil es dieselbe Bauform von
der anderen Seite festhält — eine „Vereinfachung" am gemeinsamen Muster fiele dort auf.

- [ ] **Schritt 4: `.env.example` nachziehen**

Vier Zahlen mit ihrer Vorgabe **unkommentiert** (sie haben Vorbelegungen, wie `.env.example:294-298`
für `lagerbuch`), das Geheimnis **auskommentiert mit Erklärzeile** (Muster `.env.example:282`).
⛔ **Kein erfundener Beispielwert für das Geheimnis in der Produktionssektion.** Für die
e2e-Sektion (Muster `.env.example:314`) ist ein sichtbar nicht-produktiver Wert zulässig und richtig.

- [ ] **Schritt 5: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/grenzen.ts src/app/m/radio/_lib/grenzen.test.ts .env.example
rtk git commit -m "feat(radio): die vier Gate-Grenzen und das Sitzungsgeheimnis"
rtk git show --stat HEAD
```

---

## Aufgabe A2: Der Coderaum — `_lib/code.ts`

**Files:**
- Create: `src/app/m/radio/_lib/code.ts`
- Create: `src/app/m/radio/_lib/code.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `CODE_ALPHABET`, `erzeugeCode()`, `normalisiereCode(roh)`, `istCodeForm(wert)` — gelesen
  von **A6** (`codeEinloesung.ts`), **A8** (`_actions/codes.ts`), **A9** (`_actions/gate.ts`),
  **A10** (`t/[code]/route.ts`) und **Planteil 4** (Formularvalidierung unter `/admin/zugaenge`).

⛔ **DIE ZENTRALE AUFLAGE DIESER AUFGABE: 28 ZEICHEN, UND SIE WERDEN NICHT VERKÜRZT.**
Der Grund steht in §3.7.4 (`:3056-3068`) und ist **kein** Ästhetik-Argument:

> „Wer … den Coderaum aus 3.2.1 verkürzt, macht sie [die CWE-348-Umstellung] zur **echten**
> Voraussetzung — dann gilt Rechnung A, und dann ist die Umstellung blockierend. Die zwei
> Entscheidungen hängen aneinander und dürfen nicht getrennt geändert werden."

**Und für `radio` ist Rechnung A schlechter, als die Spec sie rechnet.** Rechnung A (`:2950-2962`)
setzt den modulweiten Stundendeckel von 300 als tragend an und kommt auf 1.667 Stunden ≈ **69 Tage**
als *obere* Schranke; bei zwanzig Aufstellern sinkt das auf ~3,5 Tage. Die zusätzliche Bremse durch
den Per-Absender-Eimer trägt auf einem Modul-Host **gar nicht**, weil dort jede Anfrage denselben
Absenderschlüssel bekommt (gemessen, `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`,
zitiert in `src/core/ratelimit.ts:98-111`). Bei 28 Zeichen (Rechnung B, `:2964-2969`) dagegen:
**2,7 × 10³⁵ Jahre** bei 300 Fehlversuchen/h und **2,2 × 10²⁸ Jahre ohne jede Schranke** bei 10⁶
Versuchen/s. **Der Coderaum ist die Mauer; die Schranke ist nur die Notbremse.**

### Die Form, wörtlich (Spec `:2055-2103`)

* **Kanonisch: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`, 28 Zeichen**, sieben Vierergruppen, Bindestrich.
  Beispiel: `A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW`.
* ⛔ **Der Bindestrich ist Teil des GESPEICHERTEN Werts**, nicht der Anzeige (`:2055-2059`). Die
  Spalte `zugangscodes.code` trägt **kein** `COLLATE NOCASE` und wird nie normalisiert
  (`_db/schema.ts`, Kommentar bei `code`).
* Alphabet: `"0123456789ABCDEFGHJKMNPQRSTVWXYZ"` — 32 Zeichen, Crockford-Base32, **ohne I, L, O, U**.
* Entropie: 28 × 5 bit = **140 bit** — die kleinste Vielfache-von-vier-Länge über der 128-bit-Schwelle
  aus `docs/radio-portierung-analyse.md:476-480` (24 Zeichen wären 120 bit und rissen sie, 26 träfen
  130 bit und brächen die Vierergruppierung).
* `normalisiereCode`, Reihenfolge **verbindlich**: `trim` → `toUpperCase` → `I`/`L`→`1`, `O`→`0` →
  alles außer `[0-9A-Z]` entfernen → **bei genau 28 Zeichen** in sieben Vierergruppen setzen, sonst
  unverändert zurück.
* **QR-Nutzlast ist die vollständige äußere URL**: `https://radio.iuk-ue.de/t/A3F7-…-J4KW`. Kein
  Parameter, kein Base64, kein Token im Query-String — genau der Mechanismus, den **Entscheidung 8**
  ausschließt. Ein Pfadsegment statt eines Parameters steht **nicht** im `Referer` einer
  weiterführenden Anfrage, und der Wert wird nach der Einlösung durch den 303 aus der Adresszeile
  **entfernt** (`:2115-2123`).

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/code.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_ALPHABET, erzeugeCode, normalisiereCode, istCodeForm } from "./code";

/**
 * DER CODERAUM (Spec 1 §3.2.1, Zeilen 2053-2124; Testauftrag §3.8, Zeilen 3076-3081).
 *
 * ⛔ DIE LAENGE 28 IST HIER EINE ZUSICHERUNG, KEINE BEQUEMLICHKEIT. Spec:3056-3068:
 * „Wer den Coderaum aus 3.2.1 verkuerzt, macht sie [die CWE-348-Umstellung] zur ECHTEN
 * Voraussetzung — dann gilt Rechnung A, und dann ist die Umstellung blockierend."
 * Und Rechnung A ist fuer `radio` schlechter als die Spec sie rechnet: auf einem
 * Modul-Host bekommt JEDE Anfrage denselben Absenderschluessel
 * (`src/core/ratelimit.ts:98-111`, gemessen 2026-08-22), der Per-Absender-Eimer bremst
 * also gar nicht. Wer diese Zahl senkt, senkt die einzige tragende Massnahme.
 */
const KANONISCH = /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){6}$/;

describe("radio-Code: das Alphabet", () => {
  it("enthaelt kein I, L, O, U", () => {
    /*
     * Crockford-Base32. Die vier Zeichen fehlen KONSTRUKTIV, nicht durch eine
     * Nachbehandlung: `I`/`l` sind in Base64url beide drin, Hex braeuchte einen viel
     * laengeren String. Das ist die Verwechslungsfestigkeit eines Codes, den jemand vom
     * gedruckten Aufsteller abtippt (Spec:2073-2081).
     */
    for (const z of ["I", "L", "O", "U"]) expect(CODE_ALPHABET).not.toContain(z);
  });

  it("hat genau 32 Zeichen, alle verschieden", () => {
    // 32 = 5 bit je Zeichen; 28 x 5 = 140 bit (Spec:2082-2087). Ein doppeltes Zeichen
    // senkte die Entropie STILL, ohne die Laenge zu aendern — und keine der uebrigen
    // Zusicherungen hier saehe es.
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
  });
});

describe("radio-Code: erzeugeCode", () => {
  it("liefert 28 Zeichen aus CODE_ALPHABET, in sieben Vierergruppen", () => {
    /*
     * 1.000 Laeufe, Spec:3080. Weniger faenge einen Alphabetfehler nur mit Glueck: bei
     * einem einzelnen falschen Zeichen im Vorrat liegt die Trefferwahrscheinlichkeit je
     * Zeichen bei 1/32, ueber 28 Zeichen also bei rund 59 % je Lauf — ein einzelner Lauf
     * liesse den Fehler in zwei von fuenf Faellen durch.
     */
    for (let i = 0; i < 1000; i++) {
      const c = erzeugeCode();
      expect(c).toMatch(KANONISCH);
      expect(c.replace(/-/g, "")).toHaveLength(28);
      for (const z of c.replace(/-/g, "")) expect(CODE_ALPHABET).toContain(z);
    }
  });

  it("liefert in 1.000 Laeufen keinen doppelten Code", () => {
    // Bei 140 bit ist eine Kollision in 1.000 Laeufen astronomisch unwahrscheinlich.
    // Dieser Fall faengt den einen realen Ausfall: ein fest verdrahteter oder aus einem
    // Zaehler abgeleiteter Code.
    const gesehen = new Set<string>();
    for (let i = 0; i < 1000; i++) gesehen.add(erzeugeCode());
    expect(gesehen.size).toBe(1000);
  });

  it("nennt Math.random nicht — Quelltext-Scan", () => {
    /*
     * ⛔ QUELLTEXT-SCAN UND KEIN VERHALTENSTEST, und das ist der Punkt: `Math.random`
     * erzeugt Codes mit der richtigen LAENGE und dem richtigen ALPHABET. Jeder
     * Verhaltensfall oben bliebe gruen. Sichtbar wird der Fehler erst, wenn jemand die
     * Ausgabe vorhersagt — also nie in einem Test (Spec:2089-2091).
     *
     * ⛔ KOMMENTARE WERDEN HIER NICHT GELEERT. `code.ts` darf den Namen auch in einem
     * Kommentar nicht fuehren: ein „statt Math.random" waere die naechste Stufe der
     * Aufweichung. Ein Scan darf falsch-positiv sein und laut, nie falsch-negativ und
     * still (`riegel.test.ts:159-165`).
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/code.ts"), "utf8");
    expect(quelle, "erzeugeCode muss kryptografisch sein (Spec:2089)")
      .not.toMatch(/Math\s*\.\s*random/);
    expect(quelle, "die kryptografische Quelle muss benannt sein")
      .toMatch(/\bgetRandomValues\b|\brandomBytes\b|\brandomInt\b/);
  });

  it("verteilt gleichmaessig — kein Modulo-Bias ueber dem 32er-Alphabet", () => {
    /*
     * ⚠️ DIESER FALL IST DER GRUND, WARUM DIE ALPHABETLAENGE 32 UND NICHT 33 IST. Bei
     * einer Alphabetlaenge, die 256 nicht teilt, erzeugt `byte % laenge` einen Bias zu den
     * ersten Zeichen — der Coderaum SCHRUMPFT dann, ohne dass Laenge oder Alphabet sich
     * aendern, und keine der Zusicherungen oben saehe es. 32 teilt 256 genau achtmal.
     *
     * ⛔ DIE ZAHLEN HIER SIND EINE GROBE SCHRANKE, KEINE STATISTIK. 28.000 Zeichen ueber
     * 32 Symbole ergeben im Mittel 875 je Symbol; 500..1400 laesst reichlich Rauschen zu
     * und faellt trotzdem bei einem Bias, der eine Alphabethaelfte bevorzugt. Ein engerer
     * Rahmen machte den Test flatterhaft — die Fehlerform, die dazu fuehrt, dass jemand
     * ihn abschaltet.
     */
    const zaehler = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      for (const z of erzeugeCode().replace(/-/g, "")) zaehler.set(z, (zaehler.get(z) ?? 0) + 1);
    }
    expect(zaehler.size, "nicht alle 32 Zeichen kamen vor").toBe(32);
    for (const [z, n] of zaehler) {
      expect(n, `Zeichen ${z} kam ${n}-mal vor — Modulo-Bias?`).toBeGreaterThan(500);
      expect(n, `Zeichen ${z} kam ${n}-mal vor — Modulo-Bias?`).toBeLessThan(1400);
    }
  });
});

describe("radio-Code: normalisiereCode", () => {
  it("bildet I und L auf 1 und O auf 0 ab", () => {
    /*
     * Spec:2073-2081: `normalisiereCode` BILDET ZURUECK, statt zu verwerfen. Der Fall,
     * gegen den das steht, ist der abgetippte Code vom Ausdruck — jemand liest eine `1`
     * als `I`. Ein Verwerfen machte daraus „unbekannter Code"; ein Rueckbilden macht
     * daraus den richtigen.
     *
     * ⚠️ KLEINBUCHSTABEN SIND EINGESCHLOSSEN, WEIL `toUpperCase()` VOR DER SUCHE LAEUFT —
     * sonst bliebe `l` unbehandelt. Deshalb steht hier ein Fall mit `l`, nicht nur mit `L`.
     */
    expect(normalisiereCode("IIII-LLLL-OOOO-1111-0000-AAAA-BBBB"))
      .toBe("1111-1111-0000-1111-0000-AAAA-BBBB");
    expect(normalisiereCode("iiii-llll-oooo-1111-0000-aaaa-bbbb"))
      .toBe("1111-1111-0000-1111-0000-AAAA-BBBB");
  });

  it("setzt 28 Zeichen in sieben Vierergruppen", () => {
    /*
     * Der Bindestrich ist TEIL DES GESPEICHERTEN WERTS (Spec:2055-2059). Die
     * Gleichheitssuche im Schreibpfad (A6) vergleicht gegen die kanonische Form; ein ohne
     * Bindestriche eingegebener Code muss hier zu ihr werden, sonst findet die Suche nichts.
     */
    expect(normalisiereCode("A3F7K92MQRTV5X8YB6HN2DPZJ4KW"))
      .toBe("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW");
    expect(normalisiereCode("  a3f7 k92m/qrtv_5x8y.b6hn,2dpz;j4kw  "))
      .toBe("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW");
  });

  it("laesst eine abweichende Laenge unveraendert, statt sie zu gruppieren", () => {
    /*
     * Spec:2097: „bei GENAU 28 Zeichen in sieben Vierergruppen setzen, SONST
     * unveraendert zurueck." Wer stattdessen jede Laenge gruppiert, erzeugt aus einem
     * Tippfehler eine Zeichenkette, die AUSSIEHT wie ein Code.
     */
    expect(normalisiereCode("ABC")).toBe("ABC");
    expect(normalisiereCode("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4K"))
      .toBe("A3F7K92MQRTV5X8YB6HN2DPZJ4K");
  });

  it.each([
    ["leerer String", ""],
    ["nur Bindestriche", "---"],
    ["500 Zeichen", "x".repeat(500)],
    ["Emoji", "😀🚀"],
    ["Steuerzeichen", "A B"],
    ["Zeilenumbrueche", "A\nB\r\nC"],
    ["nur Trennzeichen", " \t \t "],
  ])("wirft nie: %s", (_name, roh) => {
    /*
     * Spec:2093-2098, woertlich: „WIRFT NIE (der Wert kommt aus einer URL oder einem
     * Formularfeld; ein Wurf machte aus einem Tippfehler einen 500 im Route Handler)."
     *
     * ⛔ DIESE TABELLE IST DIE EINZIGE ABSICHERUNG DER ZUSAGE. Der Route Handler in A10
     * ruft `normalisiereCode` mit dem rohen Pfadsegment — was dort ankommt, entscheidet
     * der Absender, nicht dieses Repo.
     */
    expect(() => normalisiereCode(roh)).not.toThrow();
    expect(typeof normalisiereCode(roh)).toBe("string");
  });
});

describe("radio-Code: istCodeForm", () => {
  it("nimmt die kanonische Form an und verwirft alles andere", () => {
    // Praedikat auf die KANONISCHE Form — also auf das ERGEBNIS von `normalisiereCode`,
    // nicht auf die Eingabe. Fuer die Formularvalidierung in Kapitel 5 (Spec:2101-2103).
    expect(istCodeForm("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW")).toBe(true);
    expect(istCodeForm("A3F7K92MQRTV5X8YB6HN2DPZJ4KW")).toBe(false);
    expect(istCodeForm("A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KI")).toBe(false); // I ist kein Alphabetzeichen
    expect(istCodeForm("")).toBe(false);
  });

  it("nimmt jeden erzeugten Code an — die Kopplung zwischen Erzeuger und Praedikat", () => {
    /*
     * ⛔ OHNE DIESEN FALL KOENNEN ERZEUGER UND PRAEDIKAT AUSEINANDERLAUFEN, und der
     * Schaden entstuende erst in der Verwaltung (Kapitel 5, Planteil 4): ein frisch
     * ausgestellter Code bestuende die Formularvalidierung nicht.
     */
    for (let i = 0; i < 200; i++) expect(istCodeForm(erzeugeCode())).toBe(true);
  });

  it("ist mit normalisiereCode gekoppelt", () => {
    // Der ganze Weg des abgetippten Codes: klein, ohne Bindestriche, wieder kanonisch.
    for (let i = 0; i < 200; i++) {
      const c = erzeugeCode();
      expect(istCodeForm(normalisiereCode(c.replace(/-/g, "").toLowerCase()))).toBe(true);
    }
  });
});
```

- [ ] **Schritt 2: Zwei Sonden, nacheinander, jede restlos zurückgenommen**

Erst Schritt 3 (grün), dann:

**Sonde S-A2a — die Länge.** Setze die Codelänge in `code.ts` von 28 auf 6 (Gruppierung
entsprechend). Erwartet: „liefert 28 Zeichen …", „setzt 28 Zeichen in sieben Vierergruppen" und
„ist mit `normalisiereCode` gekoppelt" **rot**. ⛔ **Das ist der Riegel gegen die Verkürzung** — er
muss existieren, weil eine Verkürzung sonst typkorrekt und lint-sauber durchginge.

**Sonde S-A2b — die Quelle.** Ersetze `crypto.getRandomValues` durch `Math.random`. Erwartet:
**nur** der Quelltext-Scan rot, **alle Verhaltensfälle grün**. ⛔ **Zitiere beide Zahlen** — die
grüne Menge ist hier der eigentliche Befund: sie belegt, warum der Scan nötig ist und warum ein
Verhaltenstest ihn nicht ersetzen kann.

Nach jeder Sonde:
```
rtk git checkout -- src/app/m/radio/_lib/code.ts
rtk git status --porcelain src/app/m/radio/_lib/code.ts
```

- [ ] **Schritt 3: `_lib/code.ts` schreiben und grün sehen**

⛔ **Kein `"use client"`.** Kryptografische Quelle: `crypto.getRandomValues` (Web Crypto, in Node 26
global — **kein** `node:crypto`-Import nötig, und ein solcher machte die Datei in einer künftigen
Edge-Umgebung unbrauchbar). **Kein Modulo-Bias**: 32 teilt 256 genau, `byte % 32` ist hier
zulässig — ⛔ **schreib die Begründung als Kommentar dazu**, sonst „repariert" der nächste Leser sie
zu einer Rejection-Schleife, die nichts verbessert.

```
rtk pnpm vitest run src/app/m/radio/_lib/code.test.ts
```

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/code.ts src/app/m/radio/_lib/code.test.ts
rtk git commit -m "feat(radio): der 28-Zeichen-Coderaum in Crockford-Base32"
rtk git show --stat HEAD
```

---

## Aufgabe A3: Die Gate-Schranke — `_lib/gateSchranke.ts`

**Files:**
- Create: `src/app/m/radio/_lib/gateSchranke.ts`
- Create: `src/app/m/radio/_lib/gateSchranke.test.ts`

**Interfaces:**
- Consumes: `grenzen()` aus **A1**, auf Modulebene (Zulässigkeitstafel Zeile 14).
- Produces: `gateGesperrt(absender)`, `gateFehlversuchBuchen(absender)` — gerufen von **A9**
  (`_actions/gate.ts`) und **A10** (`t/[code]/route.ts`), jeweils als **Schritt 2** bzw. **Schritt 6**
  der Reihenfolge aus §3.3.1.

**Vorbild:** `src/app/m/lagerbuch/_lib/gateSchranke.ts` — **vollständig, 158 Zeilen, Bauform 1:1**.
`RateLimiter` aus `@/core/ratelimit` (`src/core/ratelimit.ts:12-38`, `{ windowMs, max, now? }`,
`.check(key): boolean`).

### ⛔ Die eine Sache, die diese Aufgabe von ihrem Vorbild unterscheidet

`radio` benutzt **`clientIpAus(kopf)` unmittelbar** (`src/core/ratelimit.ts:113-116`, Spec
`:3033-3035` — ⚠️ die Spec nennt dort `:57`, ebenfalls überholt)
— es braucht `lagerbuch`s Zwischenschicht `_lib/absender.ts` nicht. **Aber der Wert taugt auf einem
Modul-Host nicht als Absenderschlüssel**, und das ist gemessen, nicht vermutet:

> „⛔ AUF MODUL-HOSTS (jedes Modul mit eigenem `SUITE_HOST_<KEY>` außer `portal` …) ist
> `cf-connecting-ip` bei jeder Anfrage die EGRESS-ADRESSE DIESES SERVERS, nicht die des Clients: der
> Modul-Host-Rewrite (`src/proxy.ts`) erzeugt einen zweiten, externen Round-Trip über Cloudflare
> zurück auf den Apex. **Diese Änderung ist für diese Hosts KEIN Rate-Limit-Fix** … ⛔ Planteil 3 des
> Moduls `radio` darf sich NICHT darauf verlassen, solange `radio` selbst auf einem Modul-Host läuft."
> — `src/core/ratelimit.ts:98-111`, Befund aus
> `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`

**Folge, die diese Aufgabe baut:** der Per-Absender-Eimer bleibt (er ist auf dem Apex-Weg und für
Direktzugriffe nützlich), aber er ist **erklärtermaßen nicht die Abwehr**. Die Abwehr sind die
**zwei modulweiten Zähler**, und ihr Schlüssel ist eine Modulkonstante, die niemand rotieren kann:

| Zähler | Fenster | Max | Schlüssel | Rolle |
|---|---|---|---|---|
| `proAbsender` | 60_000 ms | `g.gateProAbsenderProMin` = **5** | `clientIpAus(kopf)` | **Bequemlichkeitsgrenze** gegen Tippfehler und ungezieltes Klopfen |
| `gateMinute` | 60_000 ms | `g.gateGesamtProMin` = **30** | Konstante `"modul:minute"` | **Burst-Kappe** gegen Rotation des Absenderschlüssels; = sechs Absender-Budgets |
| `gateStunde` | 3_600_000 ms | `g.gateGesamtProStunde` = **300** | Konstante `"modul:stunde"` | ⛔ **DER tragende Zähler**; = 5/min × 60 |

⬜ **A-L6 als Belegzeile im Kopf der Datei:** „Eine Abhilfe für den Egress-IP-Kollaps ist als
Bauplan beschrieben, **nicht gebaut**: `.superpowers/sdd/VORARBEIT-selfhop.md`; sie hat selbst zwei
offene Leerstellen (⬜ L1: wie die eigene Egress-IP zur Laufzeit erkannt wird; ⬜ L2: welche internen
Hops es wirklich gibt). Diese Datei setzt **nicht** voraus, dass sie kommt."

### Vier Eigenschaften, wörtlich (Spec `:3013-3031`)

1. **`gateGesperrt` liest nur — kein DB-Zugriff — und SIE ist es, die den Datenbankzugriff schützt**,
   nicht der Absender-Eimer: wer den Absenderschlüssel rotiert, startet jeden Versuch mit leerem
   Eimer und bekäme so oder so genau einen Lookup. **Gedeckelt wird das ausschließlich durch die
   beiden modulweiten Zähler.**
2. Rückgabe `number | null`, **nie `0`** — `if (gateGesperrt(x))` wäre in der letzten Sekunde still
   falsch. Aufrufer prüfen trotzdem ausdrücklich gegen `null`.
3. Die Kette ist kurzschließend, **an JEDER Stufe gegen dieselbe FESTE Deadline** (`gesperrtBis`-Map),
   **nie** gegen den Rückgabewert von `RateLimiter.check()` allein — `check()` ist ein **gleitendes
   Fenster** und öffnet früher als die feste Deadline abläuft; ein längst gesperrter Absender
   verbrauchte sonst das nächste Budget mit (bei der Minutenbremse für eine ganze **Stunde**).
4. `grenzen()` steht auf Modulebene, die Grenzen sind ab dem ersten Import **eingefroren** —
   geänderte `.env` wirkt erst nach Neustart. Das ist inhärent: die Zähler sind Singletons und müssen
   es sein, sonst zählte jeder Aufruf in einen frischen Eimer.

**Und §3.7.3 (`:3037-3054`):** ⛔ **Nur Fehlversuche werden gebucht. Ein richtiger Code kostet
nichts**, auch nicht während laufender Sperre. Bei `radio` ist „ein Funkraum voller Personen, die
denselben Aufsteller nacheinander scannen, teilen sich einen Uplink und damit einen
Absenderschlüssel" **der Regelfall, nicht die Ausnahme**. Die Suite hat diesen Fehler bereits
produktiv gemacht — `feedback`, 15 Ehrenamtliche aus einem Vereins-WLAN
(`src/app/m/files/api/u/[token]/upload/route.ts:140-149` schreibt den Vorfall aus).

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/gateSchranke.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * DIE GATE-SCHRANKE (Spec 1 §3.7.2, Zeilen 2996-3035; Testauftrag §3.8, Zeilen 3095-3098).
 *
 * ⛔ DIE ABWEHR SIND DIE ZWEI MODULWEITEN ZAEHLER, NICHT DER ABSENDER-EIMER. Woertlich
 * aus dem Bestand (`src/app/m/lagerbuch/_lib/absender.ts:30-33`): „Der Per-Absender-
 * Zaehler ist damit eine Bequemlichkeitsgrenze gegen Tippfehler und ungezieltes Klopfen —
 * NICHT die Brute-Force-Abwehr. Die Abwehr sind die beiden modulweiten Zaehler in
 * `gateSchranke.ts`, WEIL IHR SCHLUESSEL DER EINZIGE IST, DEN NIEMAND ROTIEREN KANN."
 *
 * ⛔ FUER `radio` IST DAS SCHAERFER ALS FUER `lagerbuch`. Auf einem Modul-Host liefert
 * `clientIpAus` bei JEDER Anfrage die Egress-Adresse des Suite-Servers (gemessen
 * 2026-08-22, `src/core/ratelimit.ts:98-111`). Der Absender-Eimer kollabiert dort auf
 * einen einzigen Eimer — die zwei modulweiten Zaehler sind dann die EINZIGE Schranke.
 *
 * ⚠️ JEDER FALL IMPORTIERT DAS MODUL FRISCH. Die drei `RateLimiter` und die
 * `gesperrtBis`-Map sind Modul-Singletons; ohne frischen Import truege ein Fall die
 * Sperre des vorigen mit, und die Reihenfolge der Faelle entschiede das Ergebnis.
 *
 * ⛔ DIE EINE ZAHL, DIE JEDER FALL DIESER DATEI BRAUCHT: `RateLimiter.check` VERWEIGERT
 * ERST DEN (max+1)-TEN AUFRUF, NICHT DEN max-TEN. `src/core/ratelimit.ts:29-30` prueft
 * `if (recent.length >= this.max)`, und `recent` enthaelt den LAUFENDEN Aufruf noch
 * nicht — Aufruf Nr. N sieht `N-1`. Und `gateFehlversuchBuchen` schreibt `gesperrtBis`
 * NUR im `false`-Zweig (`lagerbuch/_lib/gateSchranke.ts:151-157`); ohne dieses eine
 * `false` bleibt die Map leer und `gateGesperrt` liefert `null`.
 *
 * ⛔ FOLGE, UND SIE IST DER GRUND FUER JEDE 6 / 31 / 301 UNTEN: eine Sperre entsteht bei
 * `max+1` Buchungen, nicht bei `max`. Das Vorbild sagt es im TESTNAMEN
 * (`lagerbuch/_lib/gateSchranke.test.ts:79`: „weist den 6. Fehlversuch desselben
 * Absenders ab" — fuenf Buchungen mit `toBeNull()`, DANN die sechste).
 *
 * ⛔ WER STATTDESSEN DIE GRENZEN IN `_lib/grenzen.ts` AUF 4/29/299 SENKT, DAMIT DIE
 * FAELLE GRUEN WERDEN, bricht Spec:3006-3009 und Eigenschaft 3 aus Spec:3022-3028. Die
 * Zahlen 5/30/300 sind gesetzt; die Buchungszahl im Test ist es, die um eins hoeher
 * liegt.
 */
const frisch = async () => {
  vi.resetModules();
  return import("./gateSchranke");
};

beforeEach(() => { vi.useRealTimers(); });

describe("radio-Gate-Schranke: der Absender-Eimer", () => {
  it("weist den 6. Fehlversuch desselben Absenders ab", async () => {
    // RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN, Vorgabe 5 (A1, Spec:3006) — und die
    // Sperre entsteht beim SECHSTEN Versuch, nicht beim fuenften (Kopfkommentar oben,
    // `src/core/ratelimit.ts:29-30`). Der Testname nennt die Zahl, wie im Vorbild
    // `lagerbuch/_lib/gateSchranke.test.ts:79`.
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) {
      expect(gateGesperrt("cf:1.2.3.4"), `nach ${i} Fehlversuchen`).toBeNull();
      gateFehlversuchBuchen("cf:1.2.3.4");
    }
    expect(gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });

  it("sperrt einen ANDEREN Absender dabei nicht mit", async () => {
    // Die Trennung ist der ganze Zweck des Absender-Eimers. ⚠️ Auf einem Modul-Host ist
    // sie heute WIRKUNGSLOS, weil dort alle denselben Schluessel bekommen — dieser Fall
    // sichert die FUNKTION zu, nicht die Wirkung im Betrieb (⬜ A-L6).
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // 6, nicht 5 — Kopfkommentar
    expect(gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    expect(gateGesperrt("cf:9.9.9.9")).toBeNull();
  });
});

describe("radio-Gate-Schranke: die zwei modulweiten Zaehler — DIE Abwehr", () => {
  it("weist die 31. Buchung modulweit ab, auch bei rotierendem Absender", async () => {
    /*
     * ⛔ DER FALL, DER DIE ABWEHR BELEGT. Sechs Absender x fuenf Fehlversuche = 30 — jeder
     * einzelne bleibt unter seinem eigenen Limit von 5, und alle 30 gehen bis in den
     * modulweiten Minutenzaehler durch. Genau das ist gemeint mit „= sechs
     * Absender-Budgets" (Spec:3007).
     *
     * ⛔ DIE 31. BUCHUNG IST DIE, DIE SPERRT, und sie kommt von einem SIEBTEN Absender:
     * `RateLimiter.check` verweigert erst den (max+1)-ten (Kopfkommentar oben). Ein
     * sechster Versuch eines der ersten sechs Absender taugt dafuer NICHT — er wuerde am
     * Absender-Eimer kurzschliessen (`gateSchranke.ts:151`) und den modulweiten Zaehler
     * gar nicht erst erreichen.
     *
     * ⛔ WER DEN ABSENDER ROTIERT, KOMMT AN DIESEM ZAEHLER NICHT VORBEI — sein Schluessel
     * ist eine Modulkonstante.
     */
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let a = 0; a < 6; a++) {
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.0.0.${a}`);
    }
    expect(gateGesperrt("cf:10.0.0.99"), "nach 30 Buchungen darf noch NICHTS gesperrt sein")
      .toBeNull();
    gateFehlversuchBuchen("cf:10.0.0.6");                 // die 31., von einem siebten Absender
    expect(gateGesperrt("cf:10.0.0.99"), "ein FRISCHER Absender muss jetzt gesperrt sein")
      .not.toBeNull();
  });

  it("der Stundenzaehler traegt ueber die Minutensperre hinaus", async () => {
    /*
     * ⛔ DER TRAGENDE ZAEHLER (Spec:3008-3009): 300 = 5/min x 60. Er stellt genau die
     * Zusage wieder her, die das Per-Absender-Limit nur unter der Annahme einer
     * wahrhaftigen Adresse je hatte.
     *
     * Bauform: die Uhr um jeweils gut eine Minute vorstellen, damit die Minutensperre
     * ablaeuft, aber die Stunde weiterlaeuft. ⚠️ `vi.setSystemTime` und NICHT ein
     * injizierter `now`-Parameter: `gateGesperrt`/`gateFehlversuchBuchen` nehmen keinen —
     * ihre Signatur ist von der Spec gesetzt (Spec:3001-3003), und ein zusaetzlicher
     * Testparameter waere eine Naht, die im Betrieb niemand benutzt.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();

    // 60 Minutenfenster x 5 Fehlversuche = 300 — der Stundendeckel ist damit ERREICHT,
    // aber noch nicht ueberschritten.
    for (let m = 0; m < 60; m++) {
      vi.setSystemTime(new Date(start.getTime() + m * 61_000));
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.1.${m}.1`);
    }
    /*
     * ⛔ DIE 301. BUCHUNG, UND DIE UHR BLEIBT DAFUER STEHEN. Zwei Gruende, beide zaehlen:
     *  (a) `RateLimiter.check` verweigert erst den (max+1)-ten Aufruf (Kopfkommentar).
     *  (b) Das Stundenfenster ist GLEITEND (3_600_000 ms). Stellte man die Uhr vor der
     *      301. Buchung weiter, fiele die erste Buchung (t=0) aus dem Fenster — `check`
     *      saehe 299 statt 300 und liesse durch. Bei t = 59*61_000 = 3_599_000 liegt der
     *      cutoff bei -1_000, alle 300 Zeitstempel sind also im Fenster.
     * Und ein FRISCHER Absenderschluessel, sonst schliesst der Absender-Eimer kurz.
     */
    gateFehlversuchBuchen("cf:10.2.0.1");
    vi.setSystemTime(new Date(start.getTime() + 61 * 61_000));
    expect(gateGesperrt("cf:10.9.9.9"), "der Stundendeckel muss greifen").not.toBeNull();
    vi.useRealTimers();
  });
});

describe("radio-Gate-Schranke: die vier Eigenschaften aus Spec:3013-3031", () => {
  it("ein Erfolg verbraucht kein Budget", async () => {
    /*
     * ⛔ DER `feedback`-VORFALL (Spec:3037-3054). Es gibt hier keine Funktion, die einen
     * Erfolg bucht — der Fall haelt genau das fest: `gateFehlversuchBuchen` ist der
     * EINZIGE Schreibweg, und die Aufrufer rufen ihn nur im Fehlerzweig (Reihenfolge-Scan
     * in A9 sichert die Stelle zu).
     *
     * ⚠️ DIESER FALL PRUEFT DIE MODULOBERFLAECHE, NICHT DIE AUFRUFSTELLE. Dass die
     * Aufrufer ihn wirklich nur im Fehlerzweig rufen, ist Sache von A9/A10 — hier steht
     * nur, dass es keinen zweiten, erfolgsbuchenden Weg gibt.
     */
    const mod = await frisch();
    expect(Object.keys(mod).sort(), "genau zwei Exporte, kein Erfolgsweg")
      .toEqual(["gateFehlversuchBuchen", "gateGesperrt"]);
  });

  it("gateGesperrt liefert nie 0", async () => {
    /*
     * Spec:3020-3022: „Rueckgabe `number | null`, NIE 0 — `if (gateGesperrt(x))` waere in
     * der letzten Sekunde still falsch." Aufgerundet und mindestens 1.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // 6, nicht 5 — Kopfkommentar
    // 59,9 Sekunden spaeter: noch gesperrt, Restzeit unter einer Sekunde.
    vi.setSystemTime(new Date(start.getTime() + 59_900));
    expect(gateGesperrt("cf:1.2.3.4")).toBe(1);
    vi.setSystemTime(new Date(start.getTime() + 60_001));
    expect(gateGesperrt("cf:1.2.3.4")).toBeNull();
    vi.useRealTimers();
  });

  it("waehrend einer Sperre wird kein weiterer Fehlversuch gebucht", async () => {
    /*
     * Die SELBSTVERLAENGERNDE SPERRE, gegen die `restMs(...) > 0 -> return` steht
     * (Vorbild `lagerbuch/_lib/gateSchranke.ts:150`). Ohne diese Zeile schoebe jeder
     * weitere Klopfer die Deadline nach vorn, und die Sperre endete nie.
     *
     * ⛔ DIE SPERRE MUSS BEI t=0 ENTSTEHEN, NICHT ERST BEIM HAEMMERN. Mit nur FUENF
     * Buchungen bei t=0 gibt es dort noch keine Sperre; die erste Buchung bei +30_000
     * waere dann die sechste, sie erzeugte die Sperre erst dort, und deren Deadline
     * laege bei +90_000 — der Fall waere bei +60_001 rot, und zwar bei RICHTIGER
     * Implementierung. Also SECHS Buchungen bei t=0 (Deadline +60_000), erst danach das
     * Haemmern.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 6; i++) gateFehlversuchBuchen("cf:1.2.3.4");   // Sperre bis +60_000
    expect(gateGesperrt("cf:1.2.3.4"), "die Sperre muss BEI t=0 stehen").not.toBeNull();
    vi.setSystemTime(new Date(start.getTime() + 30_000));
    for (let i = 0; i < 50; i++) gateFehlversuchBuchen("cf:1.2.3.4");
    vi.setSystemTime(new Date(start.getTime() + 60_001));
    expect(gateGesperrt("cf:1.2.3.4"), "die Sperre hat sich selbst verlaengert").toBeNull();
    vi.useRealTimers();
  });

  it("ein gesperrter Absender verbraucht das modulweite Budget nicht", async () => {
    /*
     * ⛔ DIE GLEITENDE-FENSTER-LUECKE (Spec:3023-3031). `RateLimiter.check()` ist ein
     * GLEITENDES Fenster und oeffnet FRUEHER, als die feste Deadline ablaeuft. Fragte der
     * Kurzschluss in dieser Luecke erneut nur `check()`, bekaeme er „erlaubt" zurueck —
     * waehrend `gateGesperrt` fuer denselben Schluessel weiterhin „gesperrt" meldet — und
     * liesse den Fehlversuch bis zur naechsten Stufe DURCHFALLEN.
     *
     * Der Schaden ist gross und still: EIN EINZELNER, LAENGST GESPERRTER KLOPFER legte
     * die Ausgabe fuer alle lahm — bei der Minutenbremse sogar fuer eine ganze STUNDE,
     * nicht nur eine Minute.
     *
     * Bauform des Falls: ein Absender klopft weit ueber sein Budget hinaus. Danach muss
     * ein ANDERER, unschuldiger Absender noch sein volles eigenes Budget haben — das
     * modulweite Minutenbudget darf nicht aufgebraucht sein.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let i = 0; i < 100; i++) gateFehlversuchBuchen("cf:1.2.3.4");
    expect(gateGesperrt("cf:9.9.9.9"), "ein Unschuldiger ist mitgesperrt worden").toBeNull();
    for (let i = 0; i < 4; i++) gateFehlversuchBuchen("cf:9.9.9.9");
    expect(gateGesperrt("cf:9.9.9.9"), "der Unschuldige hat sein Budget noch").toBeNull();
    vi.useRealTimers();
  });

  it("liefert die GROESSTE der drei Restzeiten", async () => {
    /*
     * Spec (Vorbild `lagerbuch/_lib/gateSchranke.ts:92-93`): „wer den Stundendeckel
     * gerissen hat, soll nicht ‚noch 12 Sekunden‘ lesen." Die Zahl ist das `n` aus dem
     * Text zu `grund=zuviele` (A5) — eine zu kleine Zahl macht daraus eine falsche Zusage
     * an den Menschen vor dem Aufsteller.
     */
    vi.useFakeTimers();
    const start = new Date("2026-08-22T08:00:00Z");
    vi.setSystemTime(start);
    const { gateGesperrt, gateFehlversuchBuchen } = await frisch();
    for (let m = 0; m < 60; m++) {
      vi.setSystemTime(new Date(start.getTime() + m * 61_000));
      for (let i = 0; i < 5; i++) gateFehlversuchBuchen(`cf:10.1.${m}.1`);
    }
    // Die 301. Buchung, Uhr bleibt stehen, frischer Absender — Begruendung wie im Fall
    // „der Stundenzaehler traegt ueber die Minutensperre hinaus".
    gateFehlversuchBuchen("cf:10.2.0.1");
    const rest = gateGesperrt("cf:10.9.9.9");
    expect(rest, "die Stundensperre muss die Minutensperre ueberstimmen").toBeGreaterThan(120);
    vi.useRealTimers();
  });

  it("gateGesperrt macht keinen Datenbankzugriff — Quelltext-Scan", async () => {
    /*
     * ⛔ SPEC:3013-3019, EIGENSCHAFT 1, WOERTLICH: „`gateGesperrt` liest nur, kein
     * DB-Zugriff — UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT."
     *
     * Der Scan ist DATEIWEIT und deshalb streng: diese Datei darf ueberhaupt keinen
     * Datenbankzugriff kennen. Ein Import von `_db/client` oder `getDb` waere die
     * naheliegende „Verbesserung" (etwa: die Sperre in einer Tabelle fuehren, damit sie
     * einen Neustart ueberlebt) — und sie machte aus der Vorpruefung genau den
     * Datenbankzugriff, den sie deckeln soll.
     */
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    /*
     * ⛔ DER SCAN LIEST DEN ROHTEXT, ALSO AUCH DIE KOMMENTARE — und Schritt 3 dieser
     * Aufgabe verlangt eine Begruendung IM KOPF der Datei. Schriebe jemand dort „kein
     * Import von `getDb`", faerbte er den Scan auf seiner eigenen Begruendung rot. Der
     * Bestand hat genau diese Lehre gezogen (`riegel.test.ts:152-155`).
     *
     * ⛔ AUFLAGE AN SCHRITT 3, DAMIT DER SCAN NICHT AUFGEWEICHT WERDEN MUSS: der
     * Kopfkommentar von `gateSchranke.ts` nennt die drei verbotenen Zeichenketten NICHT
     * beim Namen — er schreibt „kein Datenbankzugriff, in keiner Form". Dieselbe Form
     * wie bei `Math.random` in A2.
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/gateSchranke.ts"), "utf8");
    expect(quelle, "gateGesperrt schuetzt den DB-Zugriff, sie darf ihn nicht selbst tun")
      .not.toMatch(/\bgetDb\b|_db\/client|drizzle/);
  });
});
```

- [ ] **Schritt 2: Vier Sonden**

Nach Schritt 3 (grün), jede einzeln, jede restlos zurückgenommen:

| Sonde | Änderung in `gateSchranke.ts` | Erwartet rot |
|---|---|---|
| **S-A3a** | den `gateStunde`-Zähler ganz entfernen | „der Stundenzaehler traegt ueber die Minutensperre hinaus", „liefert die GROESSTE der drei Restzeiten" |
| **S-A3b** | den `gateMinute`-Zähler auf den **Absender** als Schlüssel umstellen (statt `MODULWEIT_MIN`) | „sperrt modulweit nach 30 Fehlversuchen …, auch bei rotierendem Absender" — ⛔ **das ist die Mutation, gegen die die ganze Aufgabe steht** |
| **S-A3c** | in `gateFehlversuchBuchen` die drei `restMs(...) > 0 → return`-Kurzschlüsse entfernen und nur noch `check()` fragen | „ein gesperrter Absender verbraucht das modulweite Budget nicht" **und** „waehrend einer Sperre wird kein weiterer Fehlversuch gebucht" |
| **S-A3d** | `Math.max(1, Math.ceil(ms / 1000))` in `gateGesperrt` durch **`Math.floor(ms / 1000)`** ersetzen | „gateGesperrt liefert nie 0" — ⚠️ ⛔ **NICHT `Math.ceil(…)` allein**: der Fall misst bei 100 ms Restzeit, und `Math.ceil(100/1000)` ist **1**, also identisch zum Original. Die Sonde faerbte dann **nichts**, und die Zusage „nie 0" bliebe ohne benannte Mutation. `Math.floor(100/1000)` ist **0** und faerbt den Fall |

⛔ **Zitiere je Sonde die Meldung UND die Gesamtzahl roter Fälle.** Färbt S-A3b mehr als den einen
Fall, hast du sie falsch gesetzt — der Absender-Eimer soll dabei unverändert bleiben.

```
rtk git checkout -- src/app/m/radio/_lib/gateSchranke.ts
rtk git status --porcelain src/app/m/radio/_lib/gateSchranke.ts
```

- [ ] **Schritt 3: `_lib/gateSchranke.ts` schreiben und grün sehen**

Bauform 1:1 aus `lagerbuch/_lib/gateSchranke.ts`. Verbindlich:
1. `const g = grenzen();` auf **Modulebene** — zulässig, weil alle vier Zahlen eine Vorbelegung
   haben; **schreib die Begründung dazu** (Zulässigkeitstafel Zeile 14).
2. Drei `RateLimiter`-Singletons, die zwei modulweiten mit den **Konstanten** `"modul:minute"` und
   `"modul:stunde"` — ⛔ **die Konstanten gehen keinen Aufrufer etwas an und stehen deshalb nicht in
   einer Signatur** (`lagerbuch/_lib/gateSchranke.ts:69-73`).
3. `const gesperrtBis = new Map<string, number>()` plus `restMs(schluessel, jetzt)` — der Speicher,
   ohne den `gateGesperrt` gar nicht geht, weil `RateLimiter.check()` **prüft und bucht in einem
   Zug** (`src/core/ratelimit.ts:26-37`; ein reines Nachsehen gibt es dort nicht).
4. `gateFehlversuchBuchen`: **drei Stufen, jede zuerst gegen ihre eigene feste Deadline**, erst dann
   gegen `check()`; jedes `false` schreibt die **Fensterlänge** als Sperrzeit fort.
5. **Nur zwei Exporte.** Kein Erfolgsweg, keine Rücksetzfunktion.
6. ⛔ **Kein `"use client"`**, ⛔ **kein Datenbankzugriff**, ⛔ **kein `absenderAus`-Zwischenmodul**
   (Spec `:3033-3035`). ⚠️ **Und der Kopfkommentar nennt die verbotenen Zeichenketten `getDb`,
   `_db/client`, `drizzle` NICHT beim Namen** — er schreibt „kein Datenbankzugriff, in keiner Form".
   Der Scan im Test liest den **Rohtext** und träfe sie sonst in der eigenen Begründung
   (`riegel.test.ts:152-155` ist der Präzedenzfall; A2 macht es für `Math.random` schon richtig).
7. ⬜ **A-L6 als Belegzeile im Kopfkommentar**, im Wortlaut oben.

```
rtk pnpm vitest run src/app/m/radio/_lib/gateSchranke.test.ts src/app/m/lagerbuch/_lib/gateSchranke.test.ts
```

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/gateSchranke.ts src/app/m/radio/_lib/gateSchranke.test.ts
rtk git commit -m "feat(radio): die Gate-Schranke — zwei modulweite Zaehler als Abwehr"
rtk git show --stat HEAD
```

---

## Aufgabe A4: Die Sitzung — `_lib/ausleihSitzung.ts`

**Files:**
- Create: `src/app/m/radio/_lib/ausleihSitzung.ts`
- Create: `src/app/m/radio/_lib/ausleihSitzung.test.ts`

**Interfaces:**
- Consumes: `grenzen()` und `ausleihSitzungGeheimnis()` aus **A1** (letzteres **nur im Thunk**).
- Produces: `AUSLEIH_COOKIE`, `AusleihPayload`, `AusleihSitzung`, `createAusleihSitzung`,
  `verifyAusleihSitzung`, `ausleihCookieOptionen`, `ausleihGueltigkeitSekunden` — gelesen von **A6**
  (Einlösung), **A7** (Zugangsprädikat), **A9**, **A10**.

**Vorbild:** `src/app/m/lagerbuch/_lib/helferSitzung.ts` (145 Zeilen), Signaturen bei `:18`, `:25`,
`:37`, `:56`, `:60`, `:93`, `:137`; der Thunk bei `:39-49`.

### Die verbindliche Form

```ts
export const AUSLEIH_COOKIE = "radio_ausleihe";

export type AusleihPayload = { codeId: string };
export type AusleihSitzung = AusleihPayload & { laeuftAb: Date };

export function ausleihGueltigkeitSekunden(): number;
export async function createAusleihSitzung(p: AusleihPayload): Promise<string>;
export async function verifyAusleihSitzung(value: string): Promise<AusleihSitzung | null>;
export function ausleihCookieOptionen(gueltigkeitSekunden: number): {
  httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean; maxAge: number;
};
```

⛔ **Sieben Auflagen, jede mit ihrem Ausfall:**

1. **Das Cookie ist host-only. KEIN `domain`. NICHT auf `.iuk-ue.de`.** (Spec `:2437-2447`) Zwei
   Begründungen: die naheliegende Vorlage `src/core/auth/cookies.ts:46-59` (`AUTH_COOKIE_DOMAIN`)
   ist für die **Suite**-Sitzung richtig, nicht hier — kopiert man sie, wird das anonyme Cookie an
   **jeden** Modul-Host geschickt; und ohne die host-only-Hälfte bliebe die
   `requiresAuth: false`-Lücke nach der Einlösung offen (§3.4.6). ⚠️ **Playwright kann diesen Fehler
   strukturell nicht sehen** — es fährt gegen **einen** Host, dort verhält sich ein domain-weites
   Cookie exakt wie ein host-only. **Die einzige Absicherung ist der Unit-Test.**
2. **Der Name ist präfigiert** (`radio_ausleihe`), anders als `lagerbuch`s unpräfigiertes
   `helfer_session`, weil bei `radio` nichts über den Cutover zu erhalten ist (`:2453-2455`).
3. **`path: "/"`** — und daran hängt eine Zusage: **KEINE Entscheidung unter `/admin` liest
   `AUSLEIH_COOKIE`.** `requireRadioAdmin` kennt den Namen nicht und importiert diese Datei nicht
   (`:2449-2451`; der Quelltext-Scan dazu steht in **A9**, `_lib/bauform.test.ts`).
4. **Das Geheimnis wird im Thunk gelesen** (Zulässigkeitstafel Zeile 13).
5. **Die Gültigkeit steht ZWEIMAL in derselben Sitzung** — als JWT-`exp` und als Cookie-`maxAge`.
   Zwei Umrechnungen wären zwei Wahrheiten, deshalb **eine** Funktion
   `ausleihGueltigkeitSekunden()` (`:2523-2530`).
6. **Die Nutzlast trägt NUR `codeId`** — `code`/`bezeichnung` kommen aus der DB-Zeile (aktuell,
   nicht zwölf Stunden eingefroren). Das ist die Voraussetzung dafür, dass eine Sperre wirkt
   (Pflicht 15, `docs/radio-portierung-analyse.md:959-971`).
7. **`verifyAusleihSitzung` WIRFT NIE** und prüft **STRIKT** — `typeof codeId === "string" &&
   codeId !== ""`, plus `exp` vorhanden; `algorithms: ["HS256"]` steht **ausdrücklich** da (sonst
   akzeptieren manche Aufrufwege `alg: none`). ⚠️ **Anders als `lagerbuch`**, das absichtlich lax
   prüft (`:2508-2517`).

⛔ **Keine Verlängerung** (§3.4.4, `:2548-2570`): weder gleitend noch bei Aktivität. Gleitend ist in
einer Server Component **technisch unmöglich** (Zulässigkeitstafel Zeile 5); auch in Route Handler
und Server Action wird sie **nicht** gebaut — der Preis eines Ablaufs ist ein Scan von zwei Sekunden.

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/ausleihSitzung.test.ts
// ⛔ `vi` GEHOERT IN DIESE ZEILE — die Datei ruft `vi.resetModules()`. Ohne den Import ist
// `rtk pnpm typecheck` rot (TS2304), und das ist das erste Torkriterium der Aufgabe.
// Vorbild: `src/app/m/lagerbuch/_lib/helferZugang.test.ts:1`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DIE AUSLEIH-SITZUNG (Spec 1 §3.4, Zeilen 2423-2629; Testauftrag §3.8, Zeilen 3084-3088).
 *
 * ⛔ DER ERSTE FALL IST DER WICHTIGSTE UND ZUGLEICH DER, DEN PLAYWRIGHT NICHT SEHEN KANN
 * (Spec:2456-2459, Analyse-Falle Nr. 19, `docs/radio-portierung-analyse.md:1498-1515`):
 * Playwright faehrt gegen EINEN Host, und dort verhaelt sich ein domain-weites Cookie
 * exakt wie ein host-only. Dieser Unit-Test ist die EINZIGE Absicherung.
 */
const GEHEIMNIS = "radio-test-geheimnis-mindestens-32-zeichen-lang";
const UMGEBUNG = { ...process.env };
beforeEach(() => {
  process.env = { ...UMGEBUNG, RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIMNIS };
});
afterEach(() => { process.env = { ...UMGEBUNG }; });

describe("radio-Ausleihsitzung: die Cookie-Attribute", () => {
  it("ausleihCookieOptionen fuehrt KEIN domain-Feld", async () => {
    /*
     * ⛔ `not.toHaveProperty("domain")` UND NICHT `toBeUndefined()`. Der Unterschied ist
     * tragend: `{ domain: undefined }` bestuende ein `toBeUndefined`, und Nexts
     * Cookie-Serialisierung liesse das Feld dann zwar weg — aber die naechste Fassung, die
     * `domain: process.env.AUTH_COOKIE_DOMAIN` schreibt, bestuende es AUCH, solange die
     * Variable im Test nicht gesetzt ist. Die Zusage lautet: das Feld existiert nicht.
     *
     * Der Schaden bei Verletzung: das ANONYME Cookie ginge an jeden Suite-Modul-Host
     * (`qr`, `feedback`, `files`, `lagerbuch`, `aufgaben`, `portal`) — Exposition, keine
     * Rechteausweitung, aber unnoetig und still. Die naheliegende Vorlage
     * `src/core/auth/cookies.ts:46-59` ist fuer die SUITE-Sitzung richtig, nicht hier.
     */
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    expect(ausleihCookieOptionen(3600)).not.toHaveProperty("domain");
  });

  it("Loeschen benutzt dieselben Attribute wie Setzen, nur maxAge 0", async () => {
    /*
     * ⛔ Spec:2596-2604. Attribute muessen beim Loeschen DIESELBEN sein wie beim Setzen,
     * sonst bleibt das Loeschen WIRKUNGSLOS — und der Browser meldet das NICHT. Deshalb
     * gibt es nur EINE Optionen-Funktion mit einem Parameter, statt zweier Objekte.
     *
     * Ein `cookies.delete(name)` setzt kein `Path` und loescht dadurch am falschen Scope
     * (`lagerbuch/_actions/sitzung.ts:140-149`) — der Quelltext-Scan dagegen steht in A9.
     */
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    const setzen = ausleihCookieOptionen(43_200);
    const loeschen = ausleihCookieOptionen(0);
    expect({ ...loeschen, maxAge: undefined }).toEqual({ ...setzen, maxAge: undefined });
    expect(loeschen.maxAge).toBe(0);
  });

  it("traegt httpOnly, sameSite lax und path /", async () => {
    // `path: "/"` traegt die Zusage aus Spec:2449-2451 („KEINE Entscheidung unter /admin
    // liest AUSLEIH_COOKIE") — der Scan dazu steht in A9. `httpOnly` haelt das Cookie aus
    // jedem Skript heraus; `lax` laesst den 303 aus `t/[code]` durch.
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    const o = ausleihCookieOptionen(3600);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
  });

  it("heisst radio_ausleihe — praefigiert, anders als lagerbuch", async () => {
    // Spec:2453-2455: bei `radio` ist ueber den Cutover nichts zu erhalten, also traegt
    // der Name das Modulpraefix. Der Name steht im Cookie-Kopf jedes Aufrufs und ist nach
    // dem ersten Rollout so wenig frei aenderbar wie `/t/<code>`.
    const { AUSLEIH_COOKIE } = await import("./ausleihSitzung");
    expect(AUSLEIH_COOKIE).toBe("radio_ausleihe");
  });
});

describe("radio-Ausleihsitzung: signieren und pruefen", () => {
  it("ein frisch erzeugtes Token wird angenommen und traegt nur codeId", async () => {
    const { createAusleihSitzung, verifyAusleihSitzung } = await import("./ausleihSitzung");
    const wert = await createAusleihSitzung({ codeId: "zc-1" });
    const s = await verifyAusleihSitzung(wert);
    expect(s?.codeId).toBe("zc-1");
    expect(s?.laeuftAb).toBeInstanceOf(Date);
    /*
     * ⛔ NUR `codeId` IN DER NUTZLAST (Spec:2503-2506). `bezeichnung` kaeme sonst aus dem
     * Cookie und waere bis zu zwoelf Stunden eingefroren — und eine Umbenennung oder
     * Sperre in der Verwaltung waere auf der Flaeche unsichtbar. Pflicht 15
     * (`docs/radio-portierung-analyse.md:959-971`): „`label` fuer die Anzeige kommt aus
     * DIESER Zeile, nicht aus der Cookie-Nutzlast."
     */
    expect(Object.keys(s ?? {}).sort()).toEqual(["codeId", "laeuftAb"]);
  });

  it.each([
    ["Muell", "kein-jwt"],
    ["leerer String", ""],
    ["nur Punkte", "..."],
    ["abgeschnittenes JWT", "eyJhbGciOiJIUzI1NiJ9.eyJjb2RlSWQiOiJ4In0"],
  ])("gibt null zurueck statt zu werfen: %s", async (_n, wert) => {
    /*
     * ⛔ Spec:2508-2513: „`verifyAusleihSitzung` WIRFT NIE." Der Cookiewert ist
     * Nutzereingabe — ein Wurf waere HTTP 500 auf JEDER Ausleihseite, und zwar fuer
     * jeden, dessen Cookie irgendwie beschaedigt ist.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    await expect(verifyAusleihSitzung(wert)).resolves.toBeNull();
  });

  it("lehnt alg none ab", async () => {
    /*
     * ⛔ `algorithms: ["HS256"]` STEHT AUSDRUECKLICH DA (Spec:2506-2508). Ohne die Angabe
     * akzeptieren manche Aufrufwege `alg: none` — ein unsigniertes Token mit beliebiger
     * `codeId`, also ein frei erfundener Zugang.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const roh = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${
      Buffer.from(JSON.stringify({ codeId: "zc-1", exp: 9_999_999_999 })).toString("base64url")}.`;
    await expect(verifyAusleihSitzung(roh)).resolves.toBeNull();
  });

  it("lehnt ein mit FREMDEM Geheimnis signiertes Token ab", async () => {
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const fremd = await new SignJWT({ codeId: "zc-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode("ein-ganz-anderes-geheimnis-32-zeichen"));
    await expect(verifyAusleihSitzung(fremd)).resolves.toBeNull();
  });

  it("ohne exp ungueltig", async () => {
    /*
     * ⛔ Spec:2508: „Fehlt `exp`, ist die Sitzung ungueltig." Ein Token ohne Ablauf ist
     * genau der Zustand, den Entscheidung 8 abschafft — „ein QR-Code, der heute fuer immer
     * gilt". Ein lax pruefender Verifizierer machte ihn still wieder her.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const ohneExp = await new SignJWT({ codeId: "zc-1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(GEHEIMNIS));
    await expect(verifyAusleihSitzung(ohneExp)).resolves.toBeNull();
  });

  it.each([
    ["codeId fehlt", {}],
    ["codeId ist leer", { codeId: "" }],
    ["codeId ist eine Zahl", { codeId: 42 }],
    ["codeId ist null", { codeId: null }],
  ])("prueft STRIKT: %s", async (_n, nutzlast) => {
    /*
     * ⛔ STRIKT, ANDERS ALS `lagerbuch` (Spec:2513-2517). `lagerbuch` prueft absichtlich
     * lax; hier steht die strikte Form, weil `codeId` in A7 unmittelbar in einen
     * Datenbank-Lookup geht. Eine `codeId` vom falschen Typ waere dort entweder ein Wurf
     * oder ein stiller Treffer auf nichts.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const t = await new SignJWT(nutzlast as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(GEHEIMNIS));
    await expect(verifyAusleihSitzung(t)).resolves.toBeNull();
  });

  it("exp und maxAge stammen aus EINER Quelle", async () => {
    /*
     * ⛔ Spec:2523-2530: „Die Gueltigkeit steht ZWEIMAL in derselben Sitzung — als JWT-
     * `exp` und als Cookie-`maxAge`. Zwei Umrechnungen waeren zwei Wahrheiten." Der
     * Ausfall bei Verletzung ist unangenehm still: das Cookie liefe (etwa) 12 Stunden, das
     * Token 12 Minuten — der Mensch saehe eine Sitzung, die es nicht mehr gibt, und
     * bekaeme auf jeder Seite eine Weiterleitung ohne erkennbaren Grund.
     *
     * Die Kopplung wird GEMESSEN, nicht behauptet: `laeuftAb` aus dem geprueften Token
     * gegen `maxAge` aus den Optionen, mit dem Faktor 1000 SICHTBAR im Ausdruck
     * (Hausregel: nie ueber die Einheitengrenze vergleichen, ohne den Faktor zu zeigen).
     */
    const { createAusleihSitzung, verifyAusleihSitzung, ausleihCookieOptionen, ausleihGueltigkeitSekunden } =
      await import("./ausleihSitzung");
    const sek = ausleihGueltigkeitSekunden();
    expect(ausleihCookieOptionen(sek).maxAge).toBe(sek);
    const vorher = Date.now();
    const s = await verifyAusleihSitzung(await createAusleihSitzung({ codeId: "zc-1" }));
    const abstandSek = (s!.laeuftAb.getTime() - vorher) / 1000;
    expect(Math.abs(abstandSek - sek), "exp und maxAge laufen auseinander").toBeLessThan(5);
  });

  it("die Gueltigkeit folgt RADIO_AUSLEIH_SITZUNG_STUNDEN", async () => {
    // ⬜ A-L1: die 12 ist die VORGABE, nicht die Antwort des Betreibers. Dieser Fall
    // prueft die KOPPLUNG an die Variable, nicht die Zahl 12 — sonst waere er rot, sobald
    // der Betreiber antwortet.
    const { ausleihGueltigkeitSekunden } = await import("./ausleihSitzung");
    expect(ausleihGueltigkeitSekunden()).toBe(grenzenStunden() * 3600);
  });
});

describe("radio-Ausleihsitzung: die Bauform", () => {
  it("liest das Geheimnis NICHT auf Modulebene — Import ohne gesetzte Umgebung gelingt", async () => {
    /*
     * ⛔ DIE ZUSICHERUNG, DIE `pnpm build` RETTET (Spec:2042-2047, Bestand
     * `lagerbuch/_lib/helferSitzung.ts:39-49`): `next build` laeuft mit
     * NODE_ENV=production und OHNE Secrets und wertet Modulebene aus.
     *
     * ⚠️ DER LAUFZEIT-IMPORT ALLEIN GENUEGT NICHT ALS NACHWEIS — vitest cached Module.
     * Deshalb steht daneben der Quelltext-Scan.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    vi.resetModules();
    await expect(import("./ausleihSitzung")).resolves.toBeTruthy();
  });

  it("Quelltext-Scan: das Geheimnis steht in einem Thunk, nicht in einem Modulebenen-const", async () => {
    /*
     * Der Scan sucht die verbotene Form: ein `const … = new TextEncoder().encode(` auf
     * Modulebene. Die erlaubte Form ist `const schluessel = () => new TextEncoder()…`.
     * ⛔ Der Unterschied ist genau das `() =>`.
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/ausleihSitzung.ts"), "utf8");
    expect(quelle, "das Geheimnis gehoert in einen Thunk (Spec:2042-2047)")
      .toMatch(/const\s+\w+\s*=\s*\(\s*\)\s*=>\s*new\s+TextEncoder\(\)/);
    expect(quelle, "kein Modulebenen-const auf das Geheimnis")
      .not.toMatch(/^\s*const\s+\w+\s*=\s*new\s+TextEncoder\(\)/m);
  });
});
```

⚠️ **`grenzenStunden()` im vorletzten Fall ist ein kleiner Testhelfer**, der `grenzen()` aus A1
importiert und `ausleihSitzungStunden` zurückgibt. Schreib ihn oben in der Datei aus. ⛔ **Nicht die
Zahl 12 fest verdrahten** — sie ist ⬜ A-L1 und wird sich ändern.

- [ ] **Schritt 2: Drei Sonden**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A4a** | `domain: ".iuk-ue.de"` in `ausleihCookieOptionen` ergänzen | „fuehrt KEIN domain-Feld" **und** „Loeschen benutzt dieselben Attribute" |
| **S-A4b** | `algorithms: ["HS256"]` aus `jwtVerify` entfernen | „lehnt alg none ab" |
| **S-A4c** | `ausleihCookieOptionen(sek).maxAge` auf `sek * 2` setzen | „exp und maxAge stammen aus EINER Quelle" |

⛔ **S-A4a ist der Kern dieser Aufgabe.** Zitiere seine Meldung wörtlich und schreib in den Bericht,
dass **Playwright diesen Fall strukturell nicht sehen kann** — das ist der Grund, warum er hier
steht und nicht in `e2e/`.

- [ ] **Schritt 3: `_lib/ausleihSitzung.ts` schreiben und grün sehen**

⛔ Kein `"use client"`. `jose`/`SignJWT`+`jwtVerify`, HS256. Die sieben Auflagen oben, jede mit
Kommentar und Spec-Zeile. ⬜ **A-L7 als Belegzeile am Thunk**: „Es gibt für dieses Modul heute keine
Boot-Prüfung auf `RADIO_AUSLEIH_SITZUNG_SECRET` — `radioBootFehler()` ist Kapitel 7 und damit
Planteil 5 (B8, Spec:97). Fehlt die Variable, fällt das erst beim ersten Einlösen auf. ⬜ A-L7."

```
rtk pnpm vitest run src/app/m/radio/_lib/ausleihSitzung.test.ts src/app/m/lagerbuch/_lib/helferSitzung.test.ts
```

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/ausleihSitzung.ts src/app/m/radio/_lib/ausleihSitzung.test.ts
rtk git commit -m "feat(radio): die Ausleihsitzung — host-only Cookie mit signiertem JWT"
rtk git show --stat HEAD
```

---

## Aufgabe A5: Die Gate-Texte und `sanitizeReturnTo`

**Files:**
- Create: `src/app/m/radio/_lib/gateTexte.ts`, `src/app/m/radio/_lib/gateTexte.test.ts`
- Create: `src/app/m/radio/_lib/returnTo.ts`, `src/app/m/radio/_lib/returnTo.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `GateGrund`, `GATE_GRUENDE`, `istGateGrund`, `gateMeldung` — gelesen von **A9**, **A10**,
  **A11**; `sanitizeReturnTo` — gelesen von **A9** und **A10**.

**Warum in einer Aufgabe:** beide sind kleine, reine Funktionen ohne IO, beide werden von denselben
drei Nachfolgern gebraucht, und beide gehören zum **Weg über die URL** — der geschlossene
Gründesatz und der geprüfte Rücksprungpfad. Sie einzeln zu commiten erzeugte zwei Tore ohne eigenen
Erkenntniswert.

### Der geschlossene Satz (Spec `:2372-2398`)

```ts
export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";
export const GATE_GRUENDE: readonly GateGrund[] = ["code", "gesperrt", "abgelaufen", "zuviele"];
export function istGateGrund(roh: string | null | undefined): roh is GateGrund;
export function gateMeldung(roh: string | null | undefined, sperrSekunden: number | null): string | null;
```

| Grund | Text (Bildschirmtext — mit Umlauten) | Wann |
|---|---|---|
| `code` | „Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung." | unbekannt **oder** gesperrt am Einlöseweg |
| `gesperrt` | „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." | DB-Recheck einer **laufenden** Sitzung schlägt an |
| `abgelaufen` | „Dein Zugang ist abgelaufen. Scanne den QR-Code erneut oder melde dich über die Suite an." | Cookie fehlt, ungültig signiert, `exp` vorbei |
| `zuviele` | „Zu viele Fehlversuche. Bitte in `n` Sekunden erneut versuchen." — bei `n = 1` „**in einer Sekunde**", **ohne** Zahl „Bitte in einer Minute erneut versuchen." | `gateGesperrt` liefert Restzeit |

⛔ **Der Grund wandert über die URL (`/?grund=zuviele`), die Zahl NICHT** (`:2394-2396`). Die
Gate-Seite fragt dieselbe Schranke mit denselben Absender-Kopfzeilen selbst.
⛔ **`istGateGrund` ist Typwächter vor jeder Verwendung** — der Wert landet in einem
`Location`-Kopf.
⛔ **Kein Rückfalltext**: ein unbekannter Grund ergibt `null`, keine Meldung. Ein Rückfalltext
machte aus jedem Tippfehler in der URL eine Fehlermeldung, die nichts bedeutet.

- [ ] **Schritt 1: Beide Tests schreiben**

```ts
// src/app/m/radio/_lib/gateTexte.test.ts
import { describe, it, expect } from "vitest";
import { GATE_GRUENDE, istGateGrund, gateMeldung, type GateGrund } from "./gateTexte";

/**
 * ⛔ DIE FESTE ERWARTUNGSTABELLE. Sie ist die Doppelfuehrung der vier von der Spec
 * gesetzten Saetze (Spec:2382-2385) — der Test zieht sie NICHT aus der Implementierung.
 *
 * ⛔ UND SIE ERSETZT DEN NAHELIEGENDEN SUBSTRING-SCAN („kein Text enthaelt einen der vier
 * `grund`-Schluessel"). Der waere gegen genau diese Saetze ROT-BY-CONSTRUCTION: drei von
 * vier tragen `code`, `gesperrt` bzw. `abgelaufen` als gewoehnliches deutsches
 * BILDSCHIRMWORT. Der billige Gruen-Fix waere, den Bildschirmtext zu verstuemmeln — die
 * stille Naeherung, gegen die dieser ganze Bauweg steht.
 *
 * ⛔ DIE TABELLE FAENGT BEIDES IN EINEM ZUG: eine Verstuemmelung des Satzes UND einen
 * eingeschmuggelten technischen Schluessel („Fehler: zuviele"), weil JEDE Abweichung vom
 * Wortlaut rot ist. ⛔ KEINEN ZWEITEN, SCHWAECHEREN SCAN DANEBEN STELLEN — er faengt
 * nichts, was die Tabelle nicht schon faengt, und laedt den naechsten Leser ein, den
 * kaputten Scan zu rekonstruieren.
 */
const ERWARTET: Record<GateGrund, string> = {
  code: "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
  gesperrt: "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.",
  abgelaufen:
    "Dein Zugang ist abgelaufen. Scanne den QR-Code erneut oder melde dich über die Suite an.",
  zuviele: "Zu viele Fehlversuche. Bitte in 30 Sekunden erneut versuchen.",
};

describe("radio-Gate-Texte: der geschlossene Satz", () => {
  it("vier Gruende, vier Texte, kein Rueckfalltext", () => {
    /*
     * Spec:2378-2398, Testauftrag Spec:3099.
     *
     * ⛔ DIE VOLLZAEHLIGKEIT STEHT ALS EIGENE ZUSICHERUNG AUSSERHALB DER SCHLEIFE. Eine
     * Schleife ueber `GATE_GRUENDE` bewacht nur, was in der Liste steht: wer einen Eintrag
     * loescht, verliert seinen Prueffall LAUTLOS — die Datei bleibt gruen, nur die Fallzahl
     * sinkt, und die liest niemand (dieselbe Form wie `_lib/routen.test.ts:87`, wo
     * `expect(AUSLEIHE.length, ...).toBe(6)` ausserhalb jeder Schleife steht; die
     * Begruendung dazu bei `:56-62`).
     */
    expect(GATE_GRUENDE.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(4);
    expect([...GATE_GRUENDE].sort()).toEqual(["abgelaufen", "code", "gesperrt", "zuviele"]);

    for (const g of GATE_GRUENDE) {
      expect(gateMeldung(g, 30), `kein Text fuer ${g}`).toBeTruthy();
    }
    /*
     * ⛔ KEIN RUECKFALLTEXT (Spec:2396-2398). Ein unbekannter Grund ergibt `null`. Ein
     * Rueckfalltext machte aus jedem Tippfehler in der URL eine Fehlermeldung, die nichts
     * bedeutet — und aus jedem kuenftigen, noch nicht implementierten Grund eine falsche.
     */
    expect(gateMeldung("erfunden", null)).toBeNull();
    expect(gateMeldung(null, null)).toBeNull();
    expect(gateMeldung(undefined, null)).toBeNull();
    expect(gateMeldung("", null)).toBeNull();
  });

  it("istGateGrund ist der Typwaechter vor der URL", () => {
    /*
     * ⛔ Spec:2394-2396: „`istGateGrund` als Typwaechter vor jeder Verwendung — der Wert
     * landet in einem `Location`-Kopf." Ohne ihn schriebe ein Route Handler einen fremden
     * Wert ungeprueft in eine Kopfzeile; das ist die Klasse Header-Injection, gegen die
     * ein geschlossener Satz die einfachste Abhilfe ist.
     */
    for (const g of GATE_GRUENDE) expect(istGateGrund(g)).toBe(true);
    expect(istGateGrund("erfunden")).toBe(false);
    expect(istGateGrund(null)).toBe(false);
    expect(istGateGrund(undefined)).toBe(false);
    expect(istGateGrund("code\r\nSet-Cookie: x=y")).toBe(false);
  });

  it("Singular bei genau einer Sekunde", () => {
    /*
     * „in 1 Sekunden" ist der Fehler, gegen den dieser Fall steht (Spec:2390-2392,
     * Testauftrag Spec:3099). Er ist klein und sichtbar — und genau deshalb faellt er auf
     * einem Aufsteller im Funkraum jedem auf.
     */
    expect(gateMeldung("zuviele", 1)).toContain("in einer Sekunde");
    expect(gateMeldung("zuviele", 1)).not.toContain("1 Sekunden");
    expect(gateMeldung("zuviele", 30)).toContain("30 Sekunden");
  });

  it("ohne Zahl faellt zuviele auf die Minutenformulierung", () => {
    /*
     * Spec:2390-2392: „ohne Zahl ‚Bitte in einer Minute erneut versuchen.‘" Der Fall
     * tritt ein, wenn der Grund ueber die URL kommt (er wandert), die Zahl aber nicht
     * (sie wandert nicht) und die Gate-Seite die Schranke gerade offen findet — etwa,
     * weil die Sperre zwischen Weiterleitung und Abruf ablief.
     */
    expect(gateMeldung("zuviele", null)).toContain("einer Minute");
  });

  it("die Erwartungstabelle ist vollzaehlig", () => {
    // Ausserhalb der Schleife, wie oben — sonst schrumpft die Menge lautlos mit.
    expect(Object.keys(ERWARTET).length, "ERWARTET und GATE_GRUENDE laufen auseinander")
      .toBe(GATE_GRUENDE.length);
  });

  it.each(GATE_GRUENDE)("der Text zu %s steht woertlich so, wie die Spec ihn setzt", (g: GateGrund) => {
    /*
     * ⚠️ DIE `grund`-WERTE SIND INTERNE SCHLUESSEL, NIE BILDSCHIRMTEXT (Spec:3532-3534,
     * dieselbe Regel wie in Kapitel 4 §4.3.5). Ein Text „Fehler: zuviele" waere
     * typkorrekt, lint-sauber und auf dem Bildschirm unbrauchbar — und genau das faengt
     * der Vergleich gegen ERWARTET, ohne die Vokabelkollision aus dem Kopfkommentar.
     */
    expect(gateMeldung(g, 30)).toBe(ERWARTET[g]);
  });
});
```

```ts
// src/app/m/radio/_lib/returnTo.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

/**
 * 1:1 aus `lagerbuch` uebernommen (Spec:2417-2419). Der Wert kommt aus einer URL und
 * landet in einem `redirect()` bzw. einem `Location`-Kopf; er darf ausschliesslich ein
 * LOKALER Pfad sein.
 */
describe("radio-returnTo: nur lokale Pfade", () => {
  it.each([
    ["/geraete", "/geraete"],
    ["/ausleihen?geraete=a,b", "/ausleihen?geraete=a,b"],
    ["/rueckgabe", "/rueckgabe"],
  ])("laesst %s durch", (roh, erwartet) => {
    expect(sanitizeReturnTo(roh)).toBe(erwartet);
  });

  it.each([
    ["absolute URL", "https://boese.example/"],
    ["protokollrelativ", "//boese.example/"],
    ["protokollrelativ mit Backslash", "/\\boese.example/"],
    ["javascript-Schema", "javascript:alert(1)"],
    ["data-Schema", "data:text/html,x"],
    ["Zeilenumbruch fuer Header-Injection", "/ok\r\nSet-Cookie: x=y"],
    ["leer", ""],
    ["null", null],
    ["undefined", undefined],
  ])("verwirft %s", (_n, roh) => {
    /*
     * ⛔ `//boese.example/` IST DER FALL, DEN EIN NAIVES `startsWith("/")` DURCHLAESST —
     * der Browser liest ihn als protokollrelative ABSOLUTE URL. Das ist die klassische
     * Open-Redirect-Luecke, und sie sieht in jedem Test gruen aus, der nur „faengt es
     * `http://` ab?" fragt.
     */
    expect(sanitizeReturnTo(roh as string | null | undefined)).toBeNull();
  });
});
```

- [ ] **Schritt 2: Zwei Sonden**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A5a** | in `gateMeldung` einen Rückfalltext für unbekannte Gründe ergänzen | „vier Gruende, vier Texte, kein Rueckfalltext" |
| **S-A5b** | `sanitizeReturnTo` auf `roh?.startsWith("/") ? roh : null` vereinfachen | „verwirft protokollrelativ" und „verwirft Zeilenumbruch" |

⛔ **S-A5b ist die lehrreiche:** die „Vereinfachung" sieht wie eine Verbesserung aus, hält alle
positiven Fälle grün und öffnet eine Open-Redirect-Lücke. Zitiere beide Zahlen.

- [ ] **Schritt 3: Beide Dateien schreiben und grün sehen**

`sanitizeReturnTo` **1:1 aus `lagerbuch`** übernehmen (nicht neu erfinden) — such die Datei mit
`rtk grep -rn "sanitizeReturnTo" src/app/m/lagerbuch/` und übernimm Bauform **und** Kommentare.
⛔ Kein `"use client"` in beiden Dateien.

```
rtk pnpm vitest run src/app/m/radio/_lib/gateTexte.test.ts src/app/m/radio/_lib/returnTo.test.ts
```

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/gateTexte.ts src/app/m/radio/_lib/gateTexte.test.ts \
            src/app/m/radio/_lib/returnTo.ts src/app/m/radio/_lib/returnTo.test.ts
rtk git commit -m "feat(radio): der geschlossene Gruende-Satz und der geprueft-lokale Rueckweg"
rtk git show --stat HEAD
```

---

> ⚠️ **Ein Namensbefund, gemessen, gültig ab hier:** die Spec schreibt den Datenbanktyp als
> `RadioDb` (`:5019-5020`). **Im Repo heißt er `DB`** — `src/app/m/radio/_db/client.ts:26`
> (`export type DB = ReturnType<typeof getDb>;`). Kapitel 3 selbst schreibt in seinen Signaturen
> ebenfalls `DB` (`:2226`, `:2420`). ⛔ **Verwende `DB`**, importiert aus `../_db/client`; ein
> `RadioDb` gibt es nicht und ein Alias dafür wäre ein zweiter Name für dieselbe Sache.

---

## Aufgabe A6: Der Schreibpfad der Einlösung — `_lib/schreibpfade/codeEinloesung.ts`

**Files:**
- Create: `src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts`
- Create: `src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts`

**Interfaces:**
- Consumes: `createAusleihSitzung` aus **A4**; `zugangscodes` aus `_db/schema.ts`; `DB` aus
  `_db/client.ts`.
- Produces: `Einloesung`, `loeseCodeEin(code, db)` — gerufen von **A9** (`_actions/gate.ts`) und
  **A10** (`t/[code]/route.ts`), in beiden als **Schritt 4** der Reihenfolge aus §3.3.1.

**Vorbild:** `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts:65` (`redeemToken`).

### Die verbindliche Form (Spec `:2309-2326`)

```ts
// src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts
export type Einloesung =
  | { ok: true; cookieValue: string; codeId: string }
  | { ok: false };

/**
 * @param code Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert NICHT.
 * @param db   PFLICHT, kein Vorgabewert.
 */
export async function loeseCodeEin(code: string, db: DB): Promise<Einloesung>;
```

⛔ **Fünf Auflagen:**

1. **Sie liegt unter `_lib/schreibpfade/`, WEIL SIE SCHREIBT** — `last_used_at`, und **nur bei
   Treffer** (`:2326-2328`).
2. **Sie normalisiert NICHT.** Das obliegt dem Aufrufer, und zwar als **eigene Anweisung** — sonst
   fängt der Reihenfolge-Scan aus A9 sie textlich falsch ab: `loeseCodeEin(normalisiereCode(x), db)`
   erschiene als „Einlösung vor Normalisieren" (`:2264-2268`, Bestand
   `lagerbuch/_lib/schreibpfade/tokenEinloesung.ts:50-55`).
3. **`db` ist Pflicht, kein Vorgabewert.** Ein Vorgabewert `db = getDb()` machte die Funktion im
   Test nicht gegen eine eigene Datei hängbar — und `getModuleDb()` wird in Tests **nicht** benutzt,
   weil sein Cache per Modulschlüssel gekeyt ist, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).
4. ⛔ **Der Code bleibt nach der Einlösung einlösbar.** Kein `eingeloestAm`, kein Verbrennen
   (`:2328-2330`). Der Grund ist physisch: der Code steht auf einem **gedruckten Aufsteller**, den
   nacheinander viele Menschen scannen.
5. ⛔ **Der Nicht-Treffer ist EINE einzige Form.** „unbekannt" und „gesperrt" sind von außen **nicht
   unterscheidbar** (`:2330-2332`) — sonst entsteht ein Orakel darüber, welche Codes je vergeben
   waren. Der Doppeltest ist `!zeile || !zeile.aktiv`.

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../../_db/schema";
import { zugangscodes } from "../../_db/schema";
import { loeseCodeEin } from "./codeEinloesung";
import { verifyAusleihSitzung } from "../ausleihSitzung";

/**
 * DER SCHREIBPFAD DER EINLOESUNG (Spec 1 §3.3.2, Zeilen 2309-2332; Testauftrag §3.8,
 * Zeilen 3100-3102).
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (KONTEXT.md:95-97): dessen Cache ist per
 * MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`) — ein Test,
 * der ihn benutzt, bekaeme die Datenbank des vorigen Tests. Vorbild:
 * `src/app/m/radio/_db/migrations.test.ts:29-37`.
 *
 * ⚠️ `foreign_keys = ON` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig
 * AUS. Ohne die Zeile waeren die FK-Zusagen dieses Schemas gruen, ohne zu gelten.
 */
const GEHEIMNIS = "radio-test-geheimnis-mindestens-32-zeichen-lang";
const UMGEBUNG = { ...process.env };

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  process.env = { ...UMGEBUNG, RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIMNIS };
  tmp = mkdtempSync(join(tmpdir(), "radio-einloesung-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  process.env = { ...UMGEBUNG };
});

const CODE = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";

async function legeCodeAn(werte: Partial<typeof zugangscodes.$inferInsert> = {}) {
  const zeile = {
    id: "zc-1",
    code: CODE,
    bezeichnung: "Aufsteller Fahrzeughalle",
    aktiv: true,
    createdAt: new Date(),
    createdBy: "sub-admin",
    ...werte,
  };
  await db.insert(zugangscodes).values(zeile);
  return zeile;
}

describe("radio-Codeeinloesung: der Treffer", () => {
  it("loest einen aktiven Code ein und liefert ein pruefbares Cookie", async () => {
    await legeCodeAn();
    const e = await loeseCodeEin(CODE, db as never);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.codeId).toBe("zc-1");
    // Das Cookie traegt DIESELBE codeId — die Sitzung zeigt auf die Zeile, nicht auf den
    // Klartext-Code (Spec:2503-2506).
    const s = await verifyAusleihSitzung(e.cookieValue);
    expect(s?.codeId).toBe("zc-1");
  });

  it("schreibt last_used_at — nur beim Treffer", async () => {
    await legeCodeAn();
    await loeseCodeEin(CODE, db as never);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt, "last_used_at wurde nicht geschrieben").toBeInstanceOf(Date);
  });

  it("bleibt nach der Einloesung einloesbar", async () => {
    /*
     * ⛔ DER FALL, DER EINEN GEDRUCKTEN AUFSTELLER RETTET (Spec:2328-2330, Testauftrag
     * Spec:3098). Es gibt kein `eingeloestAm`, kein Verbrennen. Der Grund ist physisch:
     * der Code steht auf PAPIER im Funkraum, und nacheinander scannen ihn viele Menschen.
     * Ein „einmal einloesbar"-Verhalten machte den Aufsteller nach dem ersten Scan wertlos
     * — und der Fehler faellt erst im Betrieb auf, weil er beim ersten Scan aussieht wie
     * ein Erfolg.
     *
     * ⚠️ Ausdruecklich DREI Einloesungen, nicht zwei: eine Fassung, die den Code beim
     * ZWEITEN Mal entwertet, bestuende einen Zwei-Fall-Test.
     */
    await legeCodeAn();
    for (let i = 0; i < 3; i++) {
      const e = await loeseCodeEin(CODE, db as never);
      expect(e.ok, `Einloesung ${i + 1} scheiterte`).toBe(true);
    }
  });
});

describe("radio-Codeeinloesung: der Nicht-Treffer ist EINE Form", () => {
  it("unbekannt und gesperrt liefern dieselbe Form", async () => {
    /*
     * ⛔ Spec:2330-2332: „Der Nicht-Treffer ist EINE einzige Form — ‚unbekannt‘ und
     * ‚gesperrt‘ sind von aussen nicht unterscheidbar." Sonst entsteht ein ORAKEL:
     * jemand mit einer Liste von Kandidaten koennte herausfinden, welche Codes je
     * vergeben waren, ohne einen gueltigen zu besitzen.
     *
     * ⛔ `toEqual` AUF DAS GANZE OBJEKT, nicht nur auf `ok`. Ein zusaetzliches Feld
     * (`grund: "gesperrt"`) waere genau das Orakel und bestuende ein `expect(e.ok).toBe(false)`.
     */
    await legeCodeAn({ id: "zc-gesperrt", code: CODE, aktiv: false });
    const gesperrt = await loeseCodeEin(CODE, db as never);
    const unbekannt = await loeseCodeEin("ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", db as never);
    expect(gesperrt).toEqual({ ok: false });
    expect(unbekannt).toEqual({ ok: false });
    expect(gesperrt).toEqual(unbekannt);
  });

  it("ein gesperrter Code schreibt kein last_used_at", async () => {
    /*
     * „Aktivitaet, die es nicht gibt" (Testauftrag Spec:3099). Ein `last_used_at` auf
     * einem gesperrten Code liesse die Verwaltungsliste behaupten, der gesperrte
     * Aufsteller sei gerade benutzt worden — und das ist die eine Information, an der die
     * Leitung erkennt, ob ein verschwundenes Kaertchen noch im Umlauf ist.
     */
    await legeCodeAn({ aktiv: false });
    await loeseCodeEin(CODE, db as never);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt).toBeNull();
  });

  it("normalisiert NICHT selbst — ein unnormalisierter Code trifft nicht", async () => {
    /*
     * ⛔ Spec:2318-2322: „Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert
     * NICHT." Das ist keine Bequemlichkeit, sondern die Voraussetzung des Reihenfolge-
     * Scans in A9: `loeseCodeEin(normalisiereCode(x), db)` erschiene TEXTLICH als
     * „Einloesung vor Normalisieren" (Bestand `tokenEinloesung.ts:50-55`).
     *
     * ⚠️ DIESER FALL SICHERT EINE EIGENSCHAFT ZU, DIE MAN NICHT „WILL" — er haelt eine
     * bewusste Arbeitsteilung fest. Wer ihn spaeter rot findet und `normalisiereCode` in
     * diese Funktion zieht, macht den Reihenfolge-Scan blind.
     */
    await legeCodeAn();
    const e = await loeseCodeEin(CODE.replace(/-/g, "").toLowerCase(), db as never);
    expect(e).toEqual({ ok: false });
  });

  it.each([["leer", ""], ["Muell", "?!"], ["500 Zeichen", "x".repeat(500)]])(
    "wirft nicht bei %s",
    async (_n, roh) => {
      // Der Wert kommt aus einer URL. Ein Wurf hier waere HTTP 500 im Route Handler.
      await legeCodeAn();
      await expect(loeseCodeEin(roh, db as never)).resolves.toEqual({ ok: false });
    },
  );
});
```

- [ ] **Schritt 2: Drei Sonden**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A6a** | `{ ok: false }` beim gesperrten Code um `grund: "gesperrt"` erweitern | „unbekannt und gesperrt liefern dieselbe Form" |
| **S-A6b** | `last_used_at` **vor** dem `aktiv`-Test schreiben | „ein gesperrter Code schreibt kein last_used_at" |
| **S-A6c** | den Code beim Einlösen auf `aktiv = false` setzen (das „Verbrennen") | „bleibt nach der Einloesung einloesbar" |

⛔ **S-A6c ist die lehrreiche:** sie sieht aus wie eine Härtung („ein Code wird nur einmal benutzt")
und macht in Wahrheit jeden gedruckten Aufsteller nach dem ersten Scan wertlos.

- [ ] **Schritt 3: Die Datei schreiben und grün sehen**

⛔ Kein `"use client"`. Doppeltest `!zeile || !zeile.aktiv` in **einem** Ausdruck (nicht zwei
Zweige mit zwei Rückgaben — dann läuft irgendwann einer von beiden auseinander). `last_used_at`
**nach** dem Doppeltest.

```
rtk pnpm vitest run src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts
```

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts \
            src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts
rtk git commit -m "feat(radio): die Codeeinloesung — ein Nicht-Treffer, eine Form"
rtk git show --stat HEAD
```

---

## Aufgabe A7: Das Zugangsprädikat — `_lib/ausleihZugang.ts`

**Files:**
- Create: `src/app/m/radio/_lib/ausleihZugang.ts`
- Create: `src/app/m/radio/_lib/ausleihZugang.test.ts`

**Interfaces:**
- Consumes: `requireRadioHost` aus `_lib/host.ts` (Planteil 2, `:58-60`), `viewerAusSession` aus
  `_lib/zugang.ts` (Planteil 2, `:62-72`), `AUSLEIH_COOKIE`/`verifyAusleihSitzung` aus **A4**,
  `zugangscodes` aus `_db/schema.ts`.
- Produces: `AusleihZugang`, `SperrGrund`, `ausleihZugangOderNull`, `requireAusleihZugang`,
  `requireAusleihSchreibend` — gerufen von **A11** (Gate-Seite, Prädikat), **A17** (die vier
  Actions, rückgabewertbasiert) und **A18–A20** (Layout und Seiten, werfend/umleitend).

**Vorbild:** `src/app/m/lagerbuch/_lib/helferZugang.ts` (176 Zeilen) — **die direkte Vorlage**;
`befund(db)` bei `:74-96`, die drei öffentlichen Funktionen bei `:110`, `:135`, `:170`.

⛔ **B7 (`:96`) setzt die Namen verbindlich.** Kapitel 4, 6 und 8 führten `requireRadioZugang` bzw.
`requireKioskZugang` — **überholt**. Der Guard-Scan aus A8 sucht den Namen als **Zeichenkette** und
wäre gegen die falsche Fassung rot-by-construction.

### Die verbindliche Form (Spec `:2634-2692`)

```ts
export type AusleihZugang =
  | { weg: "code"; codeId: string; bezeichnung: string; laeuftAb: Date }
  | { weg: "suite"; sub: string; name: string | null };

/** Die zwei Gruende, mit denen eine schreibende Ausleih-Action abgewiesen wird.
 *  NICHT KOSMETISCH: bei "sitzung" hilft ein erneuter Scan, bei "gesperrt" NICHT —
 *  derselbe Code scheitert genauso. Daran haengt, ob die Inline-Erneuerung aus
 *  3.4.4 ueberhaupt angeboten wird. */
export type SperrGrund = "sitzung" | "gesperrt";

export async function ausleihZugangOderNull(db: DB): Promise<AusleihZugang | null>;
export async function requireAusleihZugang(db: DB): Promise<AusleihZugang>;
export async function requireAusleihSchreibend(
  db: DB,
): Promise<{ ok: true; zugang: AusleihZugang } | { ok: false; grund: SperrGrund }>;
```

### Der gemeinsame Rumpf `befund(db)` — sechs Schritte, Reihenfolge verbindlich (`:2676-2685`)

```
1. requireRadioHost(await headers())                      — Host, VOR allem anderen
2. viewerAusSession(await auth())  -> Viewer?              — SUITE-SITZUNG, KEIN DB-Zugriff
   -> wenn Viewer: { ok: true, zugang: { weg: "suite", sub, name } }   FERTIG
3. cookies().get(AUSLEIH_COOKIE)   -> fehlt?               — { ok:false, "sitzung", hatteCookie:false }
4. verifyAusleihSitzung(roh)       -> null?                — { ok:false, "sitzung", hatteCookie:true }
5. SELECT ... FROM zugangscodes WHERE id = codeId          — DER RECHECK
   -> !zeile || !zeile.aktiv                               — { ok:false, "gesperrt", hatteCookie:true }
6. { ok: true, zugang: { weg: "code", codeId, bezeichnung, laeuftAb } }
```

⛔ **Sieben Auflagen:**

1. **Alle drei rufen `requireRadioHost(await headers())` als ERSTE Anweisung, intern** — nur so ist
   „jede Ausleih-Action ist host-gebunden" **durch Konstruktion** wahr (NS-Z1, Pflicht 16,
   `docs/radio-portierung-analyse.md:973-977`). ⛔ **Umkehrung, gleich stark:** wer sie benutzt, ruft
   den Host-Riegel **nicht noch einmal** — ein zweiter Aufruf behauptet, das Prädikat sei host-blind,
   und macht aus „hostgebunden durch Konstruktion" eine vergessliche Liste.
2. **Die Suite-Sitzung wird ZUERST geprüft** (`:2694-2708`). Ein angemeldetes Mitglied mit
   abgelaufenem oder gesperrtem Code-Cookie ist der **Regelfall**. Prüfte `befund` den Code zuerst,
   würde die Person fälschlich zum Gate geleitet — „einer hebelt den anderen aus", typkorrekt,
   lint-sauber, für `pnpm build` unsichtbar. Zudem kostet Weg 2 **keinen** DB-Zugriff.
   **Folge:** ein totes Code-Cookie einer angemeldeten Person wird **nicht** geräumt, es läuft von
   selbst ab.
3. **Schritt 5 (DB-Recheck) steht auf JEDEM Lesepfad**, nicht nur vor Schreibvorgängen — Pflicht 15,
   wörtlich: „Ein signiertes Cookie kann man nicht zurückrufen, eine Datenbankzeile schon."
   `bezeichnung` kommt aus **dieser** Zeile, nicht aus der Cookie-Nutzlast.
4. **`weg: "suite"` entsteht AUSSCHLIESSLICH aus `viewerAusSession(await auth())`;
   `weg: "code"` AUSSCHLIESSLICH aus signaturgeprüftem Cookie PLUS DB-Recheck.** Der Typ ist eine
   **unterscheidende Vereinigung**, kein Objekt mit optionalen Feldern. **Keine dritte Quelle** —
   kein Bearer-Header, kein `?token=`, kein `localStorage`; der Alt-Mechanismus wird **nicht**
   übergangsweise mitakzeptiert (`:2710-2736`).
5. **Für `weg: "suite"` wird KEINE Gruppe verlangt** — jede Suite-Sitzung genügt, weil die Ausleihe
   absichtlich anonym ist und derselbe Vorgang ohne jede Anmeldung per QR-Code erlaubt ist
   (`:2732-2736`).
6. **`requireAusleihZugang` leitet um, räumt aber NICHTS** (Zulässigkeitstafel Zeile 7): sie wird
   aus einer Server Component gerufen. Ziele: bei `grund === "sitzung"` **und** `hatteCookie: false`
   → `redirect("/")` **unmittelbar** (eine Runde statt zwei); bei `hatteCookie: true` →
   `redirect("/abmelden?grund=abgelaufen")`; bei `grund === "gesperrt"` →
   `redirect("/abmelden?grund=gesperrt")` (`:2400-2419`).
7. ⛔ **`requireAusleihSchreibend` WIRFT NICHT und LEITET NICHT UM** — „die gefährlichste
   Eigenschaft dieses Kapitels" (`:2780-2784`). `await requireAusleihSchreibend(db)` **ohne Prüfung
   des Ergebnisses** ist typkorrekt, lint-sauber und öffnet die Action für jeden. **Das einzige
   Netz: der Guard-Scan aus A8 und der e2e-Test aus Planteil 5.**

⚠️ **`viewerAusSession` heißt im Repo so und nimmt die Session** (`_lib/zugang.ts:62-72`), gibt
`RadioViewer | null`. ⛔ **Nicht `viewerOderNull()` benutzen** — die ruft `requireRadioHost`
absichtlich nicht (`_lib/zugang.ts:86-88`, Begründung im Kommentar `:74-85`) und ist die **Sichtbarkeits**form für den `/admin`-Link,
nicht die Zugangsform.

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_lib/ausleihZugang.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DAS ZUGANGSPRAEDIKAT (Spec 1 §3.5, Zeilen 2632-2784; Testauftrag §3.8, Zeilen 3089-3094).
 *
 * ⚠️ DREI NEXT-NAEHTE WERDEN GEMOCKT, UND JEDE HAT EINEN GRUND:
 *   `next/headers`   — `headers()`/`cookies()` brauchen einen Anfragekontext, den vitest
 *                      nicht hat.
 *   `next/navigation`— `redirect()` wirft in Next einen Sentinel; hier wird der Aufruf
 *                      SICHTBAR gemacht, statt ihn zu verschlucken.
 *   `@/core/auth`    — `auth()` liest das Suite-JWT.
 *
 * ⛔ WAS DIESE DATEI DAMIT NICHT BELEGT: dass die Riegel bei einem ECHTEN Abruf GREIFEN
 * (⬜ A-L9, Erbe von Z-L1, `riegel.test.ts:45-49`). Sie belegt die LOGIK des Praedikats.
 * Kein Fall hier darf etwas anderes behaupten.
 */
const hostRiegel = vi.fn();
const kopfzeilenGelesen = vi.fn();
const redirectRuf = vi.fn((ziel: string) => { throw new Error(`REDIRECT:${ziel}`); });
let sitzung: unknown = null;
let cookieWert: string | undefined;

vi.mock("next/headers", () => ({
  headers: async () => { kopfzeilenGelesen(); return new Headers({ host: "radio.localtest.me" }); },
  cookies: async () => ({ get: (n: string) => (n === "radio_ausleihe" && cookieWert ? { value: cookieWert } : undefined) }),
}));
vi.mock("next/navigation", () => ({ redirect: (z: string) => redirectRuf(z), notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("./host", async (echt) => ({
  ...(await echt<typeof import("./host")>()),
  requireRadioHost: (h: Headers) => hostRiegel(h),
}));

// ... DB-Aufbau wie in A6 (eigene Datei-DB aus os.tmpdir(), migrate, foreign_keys = ON) ...

/*
 * ⛔ DER MOCK DER SUITE-SITZUNG TRAEGT `id`, NICHT `sub`. `viewerAusSession` liest
 * `session.user.id` und gibt `null` zurueck, wenn es fehlt (`_lib/zugang.ts:62-72`);
 * `sub` ist ihr AUSGABEname, nicht ihr Eingabename. Mit `{ user: { sub: … } }` faellt
 * `befund` in den Code-Zweig, und der wichtigste Fall dieser Datei („Suite-Sitzung
 * schlaegt ein gesperrtes Code-Cookie") liefert `null` statt `{ weg: "suite", … }` —
 * bei RICHTIGER Implementierung.
 */

describe("radio-Ausleihzugang: die Reihenfolge des Befunds", () => {
  it("der Host-Riegel laeuft, BEVOR das Cookie angefasst wird", async () => {
    /*
     * ⛔ NS-Z1 UND PFLICHT 16 (`docs/radio-portierung-analyse.md:973-977`): „(iii) innen,
     * im Zugangspraedikat selbst ist die tragende — Server Actions haben kein Layout ueber
     * sich."
     *
     * ⛔ UND DER FALL PRUEFT ZUSAETZLICH, DASS DIE KOPFZEILEN GENAU EINMAL GELESEN WERDEN
     * (Testauftrag Spec:3090). Ein zweiter Aufruf des Host-Riegels aus einer Seite oder
     * Action heraus (die naheliegende „Sicherheitsverbesserung") behauptet, das Praedikat
     * sei host-blind — und macht aus „hostgebunden durch Konstruktion" eine Liste, die
     * jemand vergessen kann.
     */
    hostRiegel.mockImplementationOnce(() => { throw new Error("HOST"); });
    cookieWert = "egal";
    await expect(ausleihZugangOderNull(db as never)).rejects.toThrow("HOST");
    expect(hostRiegel).toHaveBeenCalledTimes(1);
  });

  it("liest die Kopfzeilen genau einmal je Aufruf", async () => {
    kopfzeilenGelesen.mockClear();
    sitzung = { user: { id: "s-1", name: "Anna", groups: [] } };
    await ausleihZugangOderNull(db as never);
    expect(kopfzeilenGelesen).toHaveBeenCalledTimes(1);
  });
});

describe("radio-Ausleihzugang: die zwei Wege, und wer wen schlaegt", () => {
  it("Suite-Sitzung schlaegt ein gesperrtes Code-Cookie", async () => {
    /*
     * ⛔ DER AUSHEBELUNGSFALL AUS SPEC:2694-2708, und der wichtigste dieser Datei. Ein
     * angemeldetes Mitglied mit abgelaufenem oder gesperrtem Code-Cookie ist der
     * REGELFALL — nicht die Ausnahme. Prueft `befund` den Code zuerst, wird die Person
     * faelschlich zum Gate geleitet: typkorrekt, lint-sauber, fuer `pnpm build`
     * unsichtbar, und im Betrieb ein Mensch, der sich nicht erklaeren kann, warum die
     * Suite ihn nach dem Anmelden nach einem Code fragt.
     *
     * BEIDE gleichzeitig gesetzt -> `weg: "suite"`.
     */
    await legeCodeAn({ id: "zc-gesperrt", aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-gesperrt" });
    sitzung = { user: { id: "s-1", name: "Anna", groups: [] } };   // `id`, nicht `sub` — Kommentar oben
    const z = await ausleihZugangOderNull(db as never);
    expect(z).toEqual({ weg: "suite", sub: "s-1", name: "Anna" });
  });

  it("Weg 2 kostet keinen Datenbankzugriff", async () => {
    /*
     * Spec:2704-2706. Der Fall haelt fest, WARUM die Reihenfolge so ist und nicht nur,
     * DASS sie so ist: `auth()` liest das Suite-JWT, kein `SELECT`. Ein Umbau, der auch
     * fuer angemeldete Personen in die Tabelle sieht, waere auf jeder Seite ein
     * zusaetzlicher Lookup — und wuerde diesen Fall rot faerben, statt still
     * durchzulaufen.
     */
    sitzung = { user: { id: "s-1", name: "Anna", groups: [] } };
    const vorher = zaehleAbfragen();
    await ausleihZugangOderNull(db as never);
    expect(zaehleAbfragen() - vorher).toBe(0);
  });

  it("fuer weg suite wird KEINE Gruppe verlangt", async () => {
    /*
     * Spec:2732-2736: „fuer `weg: "suite"` wird KEINE Gruppe verlangt — jede
     * Suite-Sitzung genuegt, weil die Ausleihe absichtlich anonym ist und derselbe Vorgang
     * ohne jede Anmeldung per QR-Code erlaubt ist." Wer hier eine Gruppenpruefung
     * ergaenzt, sperrt genau die Personen aus, die den bequemeren der zwei zugelassenen
     * Wege nehmen.
     */
    sitzung = { user: { id: "s-1", name: null, groups: [] } };
    await expect(ausleihZugangOderNull(db as never))
      .resolves.toEqual({ weg: "suite", sub: "s-1", name: null });
  });

  it("weg code entsteht nur aus signiertem Cookie PLUS DB-Recheck", async () => {
    await legeCodeAn();
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    const z = await ausleihZugangOderNull(db as never);
    expect(z).toMatchObject({ weg: "code", codeId: "zc-1", bezeichnung: "Aufsteller Fahrzeughalle" });
  });

  it("bezeichnung kommt aus der DB-Zeile, nicht aus dem Cookie", async () => {
    /*
     * ⛔ PFLICHT 15 (`docs/radio-portierung-analyse.md:959-971`), woertlich: „`label` fuer
     * die Anzeige kommt aus DIESER Zeile, nicht aus der Cookie-Nutzlast — deshalb kann
     * das Geheimnis aus dem Cookie verschwinden." Die Gegenprobe: die Zeile umbenennen,
     * OHNE das Cookie neu zu praegen; die Flaeche muss den neuen Namen zeigen.
     */
    await legeCodeAn();
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    await db.update(zugangscodes).set({ bezeichnung: "Umbenannt" }).where(eq(zugangscodes.id, "zc-1"));
    const z = await ausleihZugangOderNull(db as never);
    expect(z).toMatchObject({ bezeichnung: "Umbenannt" });
  });
});

describe("radio-Ausleihzugang: der DB-Recheck IST der Widerruf", () => {
  it("ohne Suite-Sitzung und mit gesperrtem Code -> grund gesperrt", async () => {
    await legeCodeAn({ aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never))
      .resolves.toEqual({ ok: false, grund: "gesperrt" });
  });

  it("manipuliertes codeId in gueltig signiertem Cookie verhaelt sich wie gesperrt", async () => {
    /*
     * Der Fall setzt voraus, dass jemand das GEHEIMNIS haette — er ist trotzdem
     * lehrreich: eine gueltige Signatur allein reicht NICHT, weil Schritt 5 die Zeile
     * nachschlaegt. Waere der Recheck nur vor Schreibvorgaengen, saehe diese Person die
     * ganze Geraeteliste samt Entleihernamen.
     */
    await legeCodeAn();
    cookieWert = await createAusleihSitzung({ codeId: "gibt-es-nicht" });
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never))
      .resolves.toEqual({ ok: false, grund: "gesperrt" });
  });

  it("der Recheck laeuft auch auf dem reinen LESEpfad", async () => {
    // Pflicht 15: „Er muss auf JEDEM Lesepfad stehen, nicht nur vor schreibenden
    // Aktionen." `ausleihZugangOderNull` ist der Lesepfad der Gate-Seite (A11).
    await legeCodeAn({ aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    await expect(ausleihZugangOderNull(db as never)).resolves.toBeNull();
  });
});

describe("radio-Ausleihzugang: die drei Formen unterscheiden sich in ihrem Ausgang", () => {
  it("fehlendes Cookie -> Redirect auf /, nicht auf /abmelden", async () => {
    /*
     * ⛔ EINE RUNDE STATT ZWEI (Spec:2409, Testauftrag Spec:3093). Wer nie ein
     * Cookie hatte, hat nichts zu raeumen; ein Umweg ueber `/abmelden` waere ein
     * zusaetzlicher 303 fuer JEDEN anonymen Erstaufruf — auf einem Telefon im Funkloch
     * sichtbar.
     */
    /*
     * ⛔ ANKER AUF DAS GANZE ZIEL, NICHT AUF EINEN PRAEFIX. `toThrow("REDIRECT:/")` ist
     * ein TEILZEICHENKETTEN-Vergleich — `REDIRECT:/abmelden?grund=abgelaufen` enthaelt
     * ihn ebenfalls. Der Fall bliebe also gruen, wenn die Implementierung genau den
     * Umweg naehme, gegen den sein Name steht.
     */
    cookieWert = undefined;
    sitzung = null;
    await expect(requireAusleihZugang(db as never)).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it("abgelaufenes Cookie -> Redirect auf /abmelden?grund=abgelaufen", async () => {
    cookieWert = "kaputt";
    sitzung = null;
    await expect(requireAusleihZugang(db as never))
      .rejects.toThrow("REDIRECT:/abmelden?grund=abgelaufen");
  });

  it("gesperrter Code -> Redirect auf /abmelden?grund=gesperrt", async () => {
    await legeCodeAn({ aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    await expect(requireAusleihZugang(db as never))
      .rejects.toThrow("REDIRECT:/abmelden?grund=gesperrt");
  });

  it("requireAusleihSchreibend wirft bei abgelaufener Sitzung nicht, sondern gibt ok false", async () => {
    /*
     * ⛔ DIE GEFAEHRLICHSTE EIGENSCHAFT DIESES KAPITELS (Spec:2780-2784), und dieser Fall
     * ist ihre einzige Zusicherung auf dieser Ebene: sie WIRFT NICHT und LEITET NICHT UM.
     * Ein `redirect()` verwuerfe die eingetragenen Werte des Formulars — der Mensch haette
     * vier Geraete und einen Namen eingegeben und faende ein leeres Formular vor.
     *
     * ⚠️ DIE KEHRSEITE STEHT IM GUARD-SCAN (A8): `await requireAusleihSchreibend(db)`
     * OHNE Pruefung des Ergebnisses ist typkorrekt, lint-sauber und oeffnet die Action fuer
     * jeden. Dieser Test kann das NICHT fangen — er prueft die Funktion, nicht ihre
     * Aufrufer.
     */
    cookieWert = "kaputt";
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never))
      .resolves.toEqual({ ok: false, grund: "sitzung" });
    expect(redirectRuf).not.toHaveBeenCalled();
  });

  it("ausleihZugangOderNull leitet NIE um und loescht NICHTS", async () => {
    // Spec:2650-2653: DAS PRAEDIKAT. Fuer `page.tsx` (die Weiche Gate-oder-Ausleihe) ist
    // „kein Zugang" der REGELFALL, nicht der Fehlerfall.
    cookieWert = undefined;
    sitzung = null;
    redirectRuf.mockClear();
    await expect(ausleihZugangOderNull(db as never)).resolves.toBeNull();
    expect(redirectRuf).not.toHaveBeenCalled();
  });
});

describe("radio-Ausleihzugang: keine dritte Quelle", () => {
  it("Quelltext-Scan: kein Bearer-Header, kein token-Parameter, kein localStorage", async () => {
    /*
     * ⛔ Spec:2726-2731, Zusicherung 4: „Keine dritte Quelle — kein Bearer-Header, kein
     * `?token=`, kein `localStorage`. Der ALT-MECHANISMUS WIRD NICHT UEBERGANGSWEISE
     * MITAKZEPTIERT."
     *
     * Der Alt-Kiosk traegt seinen Token base64-kodiert im URL-Parameter `token`
     * (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:14-25`)
     * und legt ihn in `localStorage` (`routes/__root.tsx:58-100`). Der naheliegende
     * „sanfte Uebergang" — alte Tokens noch eine Weile annehmen — waere genau der
     * Mechanismus, den Entscheidung 8 (Spec:64) ausschliesst: geteilter Token als
     * URL-Parameter, unbefristet, unwiderruflich.
     */
    /*
     * ⛔ DER SCAN LIEST DIE QUELLE OHNE KOMMENTARE, UND DAS IST KEINE FEINHEIT. Schritt 3
     * dieser Aufgabe verlangt „die sieben Auflagen oben, jede mit Kommentar und
     * Spec-Zeile" — und Auflage 4 lautet woertlich „Keine dritte Quelle: kein
     * BEARER-Header, kein `?token=`, kein `localStorage`". Wer sie als Kommentar
     * schreibt, faerbt einen Rohtext-Scan auf seiner eigenen Begruendung rot; wer den
     * Scan daraufhin „repariert", schwaecht ihn.
     *
     * ⛔ DER BESTAND HAT DIESE LEHRE SCHON GEZOGEN, woertlich (`riegel.test.ts:152-155`):
     * „OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT." Deshalb
     * laeuft dort jeder Scan ueber `ohneKommentare(...)` (`riegel.test.ts:218`).
     *
     * ⛔ `ohneKommentare` WIRD AUS `riegel.test.ts:163-183` KOPIERT, nicht importiert
     * (vitest laedt Testdateien nicht als Module fuereinander; eine geteilte Helferdatei
     * unter `_lib/` zaehlte der `"use client"`-Scan mit). A9 kopiert dieselbe Funktion
     * noch einmal — das ist gewollt und der Preis der Nicht-Importierbarkeit.
     */
    const quelle = ohneKommentare(
      readFileSync(join(process.cwd(), "src/app/m/radio/_lib/ausleihZugang.ts"), "utf8"),
    );
    expect(quelle).not.toMatch(/\bauthorization\b|\bBearer\b/i);
    expect(quelle).not.toMatch(/\blocalStorage\b/);
    expect(quelle).not.toMatch(/searchParams|["']token["']/);
  });
});
```

⚠️ **`zaehleAbfragen()` im Fall „Weg 2 kostet keinen Datenbankzugriff"** ist ein kleiner Helfer über
`sqlite.function`/einem Zähler auf `db.select` — **schreib ihn aus**. Geht das in der gewählten
Bauform nicht sauber, ersetze den Fall durch die schwächere, aber ehrliche Form: `db` als
Proxy übergeben, dessen `select` einen Zähler hochzählt, und **schreib in den Kommentar, dass es die
schwächere Form ist**. ⛔ **Streiche den Fall nicht still.**

- [ ] **Schritt 2: Vier Sonden**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A7a** | in `befund` Schritt 2 (Suite) **hinter** Schritt 5 (Recheck) schieben | „Suite-Sitzung schlaegt ein gesperrtes Code-Cookie" |
| **S-A7b** | Schritt 5 (DB-Recheck) nur noch in `requireAusleihSchreibend` ausführen, nicht im gemeinsamen Rumpf | „der Recheck laeuft auch auf dem reinen LESEpfad" |
| **S-A7c** | `requireRadioHost` aus `befund` entfernen und stattdessen in `requireAusleihZugang` rufen | „der Host-Riegel laeuft, BEVOR das Cookie angefasst wird" (die Prädikat-Form verliert ihn) |
| **S-A7d** | `requireAusleihSchreibend` bei `ok: false` `redirect("/")` rufen lassen | „requireAusleihSchreibend wirft … nicht, sondern gibt ok false" |

⛔ **S-A7a und S-A7b sind die zwei, die ohne Test unsichtbar wären.** Zitiere beide Meldungen.

- [ ] **Schritt 3: Die Datei schreiben und grün sehen**

⛔ Kein `"use client"`. Ein **einziger** gemeinsamer Rumpf `befund(db)` (nicht drei Kopien). Die
sieben Auflagen oben, jede mit Kommentar und Spec-Zeile. ⬜ **A-L9 als Belegzeile im Kopf:** „Dass
diese Riegel bei einem echten Abruf **greifen**, ist unbewiesen — ⬜ A-L9 (Erbe von Z-L1,
`riegel.test.ts:45-49`), Eigentümer Planteil 5. Was hier belegt ist: die Logik des Prädikats."

```
rtk pnpm vitest run src/app/m/radio/_lib/ausleihZugang.test.ts src/app/m/lagerbuch/_lib/helferZugang.test.ts
```

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/ausleihZugang.ts src/app/m/radio/_lib/ausleihZugang.test.ts
rtk git commit -m "feat(radio): das Zugangspraedikat der Ausleihe — drei Formen, ein Befund"
rtk git show --stat HEAD
```

---

## Aufgabe A8: Die Codeverwaltung, der Guard-Scan, NT11 und die Seed-Zusicherung

**Files:**
- Create: `src/app/m/radio/_actions/codes.ts`
- Create: `src/app/m/radio/_actions/guards.test.ts`
- Modify: `scripts/import/radio-paritaet.test.ts` (⛔ **NT11**, eigener Schritt)
- Modify: `src/app/m/radio/_lib/seedLokal.ts` (**nur ein Kommentar**)

**Interfaces:**
- Consumes: `erzeugeCode` aus **A2**, `requireRadioAdmin` aus `_lib/zugang.ts` (Planteil 2, `:319-329`).
- Produces: `erstelleCode`, `setzeCodeAktiv` — gerufen von **Planteil 4** (`/admin/zugaenge`);
  `_actions/guards.test.ts` — der **Scan**, der ab A9 jede weitere Action bewacht.

### Die zwei Actions (Spec `:2170-2239`)

```ts
"use server";                                        // ⛔ ZEILE 1 — Erlaeuterung unten
// src/app/m/radio/_actions/codes.ts
export async function erstelleCode(bezeichnung: string): Promise<{ code: string }>;
export async function setzeCodeAktiv(codeId: string, aktiv: boolean): Promise<void>;
```

⛔ **`"use server";` ist ZEILE 1 der Datei, ohne Pfadkommentar davor — und das ist eine Auflage, kein
Stil.** Der Guard-Scan liest `readFileSync(...).trimStart().split("\n")[0]` und vergleicht gegen
`/^["']use server["'];?$/`; eine Pfad-Kommentarzeile davor macht **A8s eigenes Tor rot**. ⚠️ **Die
Verwechslungsgefahr ist real und benannt:** für **Test**dateien lautet die Hausform genau umgekehrt
(`src/app/m/radio/riegel.test.ts:1` ist ein Pfadkommentar). Gemessen im Bestand: **alle 20 Dateien
unter `src/app/m/lagerbuch/_actions/` tragen `"use server";` in Zeile 1**, ausnahmslos. ⛔ **Der
Scan ist richtig; der Pfadkommentar gehört unter die Direktive oder gar nicht dahin.**

* **Erste Anweisung beider:** `const viewer = await requireRadioAdmin();` (werfend, `:2178`).
* `erstelleCode`: `erzeugeCode()`, `created_by = viewer.sub`, `aktiv = true`, `created_at = new Date()`.
  **Kollisionsbehandlung:** bei `UNIQUE`-Konflikt **einmal** neu erzeugen und erneut einfügen; beim
  **zweiten** Konflikt bricht die Action mit **benanntem** Fehler ab (`:2186-2191`).
  ⚠️ Bei 140 bit ist der erste Konflikt bereits astronomisch unwahrscheinlich — die Behandlung
  existiert, damit ein **Programmierfehler** in `erzeugeCode` (etwa ein fest verdrahteter Wert) laut
  wird statt still.
* `setzeCodeAktiv`: `UPDATE` auf `aktiv`; beim **Sperren** zusätzlich `gesperrt_am = new Date()`,
  `gesperrt_von = viewer.sub`; beim **Entsperren** beide auf `NULL`.
* ⛔ **Es gibt KEINE Löschfunktion**, mit drei ausgeschriebenen Gründen (`:2210-2227`): (1) ein
  gelöschter Code kann an ein später ausgestelltes Kärtchen zurückfallen; (2) der Code ist
  Anzeigeschlüssel der Leihhistorie — historische Zeilen erschienen unter neuem Label; (3) die zwei
  Hälften „nie löschen" + FK-Verweis `loans.zugangscode_id` tragen **nur zusammen**.
  ⛔ **`lagerbuch` ist hier ausdrücklich KEINE Präzedenz, sondern der Gegenfall** (`:2222-2227`).

### Der Guard-Scan — die Ausnahmeliste hat GENAU DREI Einträge

⚠️ **DREI Spec-Stellen nennen unterschiedliche Zahlen, und das ist hier entschieden.** §3.8
(`:3111`) schreibt „**Ausnahmeliste: `gate.ts#einloesenAmGate`** (Eintrag 1)" — **einen**. Spec
`:6762` und B7 (`:96`) sind jünger und genauer und schreiben **zwei**:

> „Jede exportierte Funktion in `src/app/m/radio/_actions/*.ts` ruft `requireRadioAdmin` oder
> `requireAusleihSchreibend` — oder steht auf einer Ausnahmeliste mit **GENAU ZWEI namentlich
> benannten Einträgen**: `_actions/gate.ts#einloesenAmGate` und `_actions/sitzung.ts#beenden`
> (§3.5.5, §3.3.3 — **beide tragen `requireRadioHost` und ausdrücklich keinen Sitzungsriegel**)."

⛔ **Und dieser Plan setzt DREI — Entscheidung E12, im Kopf ausgeschrieben.** `:6762`s Zahl ist
unter der Annahme geschrieben, dass es `erneuereSitzung` nicht gibt; Spec `:2258` („genau **drei**
Stellen, die eine Ausleih-Sitzung ausstellen"), `:3108`, `:2563-2570` und Zusage §3.10 Nr. 8
verlangen sie. **Der dritte Eintrag ist `_actions/sitzung.ts#erneuereSitzung`**, und die Begründung
von `:6762` trägt ihn wörtlich mit: sie trägt `requireRadioHost` und ausdrücklich **keinen**
Sitzungsriegel, weil sie die Sitzung **erzeugt**. ⛔ **Ein VIERTER Eintrag bleibt ein roter Test.**

**Damit ist auch der scheinbare Widerspruch aufgelöst:** die Ausnahme gilt dem **Sitzungsriegel**,
nicht dem Riegel überhaupt. `radio`s `beenden` trägt sehr wohl `requireRadioHost` (§3.5.5, `:2774`)
— anders als `lagerbuch`s gleichnamige Action, die bewusst keinen Host-Riegel hat
(`lagerbuch/_actions/sitzung.ts:128-131`). **Beide Einträge stehen trotzdem auf der Liste**, weil
der Scan nach `requireRadioAdmin`/`requireAusleihSchreibend` sucht und die beiden keinen davon
tragen dürfen.

⛔ **Zählauflagen aus `:6762`, wörtlich, jede mit ihrem Ausfall:**
* **`export type` und `export interface` werden verworfen** — sonst zählt der Scan `AusleihErgebnis`
  als Action ohne Riegel und ist rot-by-construction.
* **Gezählt wird je Datei je Deklaration, NIE über ein `Set` der Namen** — zwei gleichnamige Exporte
  in zwei Dateien fielen sonst zu einem zusammen, und einer bliebe unbewacht.
* **Die Datei überspringt sich selbst.**
* ⛔ **Der Scan zählt die Ausnahmen MIT: wächst die Liste, ist das ein ROTER TEST und keine Zeile im
  Diff.**

⛔ **B14/B19 (`:103`, `:119`): Es gibt EINEN `_actions/`-Scan, nicht zwei.** `riegel.test.ts` führt
Klausel (b) ausdrücklich **nicht** (`riegel.test.ts:363-376`). Wer sie dort nachträgt, baut genau
den Zustand, den B14 abgeräumt hat — und der naheliegende Grün-Fix (einen Sitzungsriegel in
`einloesenAmGate` einsetzen) **macht das Gate unbenutzbar und sieht wie eine Verbesserung aus**.

- [ ] **Schritt 1: `_actions/guards.test.ts` schreiben**

```ts
// src/app/m/radio/_actions/guards.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DER EINE `_actions/`-SCAN (Spec 1 §3.8 Zeile 3111, praezisiert in Spec:6762 und B7
 * Spec:96; B14 Spec:103 und B19 Spec:121: ES GIBT NUR DIESEN EINEN).
 *
 * ⛔ `riegel.test.ts` FUEHRT KLAUSEL (b) AUSDRUECKLICH NICHT (`riegel.test.ts:363-376`).
 * Zwei Scans ueber dieselbe Flaeche, von denen einer die Ausnahmen nicht kennt, sind ein
 * Scan zu viel — und der naheliegende Gruen-Fix des unwissenden Scans waere, in
 * `einloesenAmGate` einen Sitzungsriegel einzusetzen. Das macht das GATE UNBENUTZBAR
 * (die Tuer, die sich selbst abschliesst) und sieht wie eine Verbesserung aus (§3.3.3).
 *
 * ⛔ WAS ER FAENGT: die vergessene Riegelzeile. Sie ist typkorrekt, lint-sauber und fuer
 * `pnpm build` unsichtbar — und bei `requireAusleihSchreibend` ist sogar der AUFRUF ohne
 * Ergebnispruefung typkorrekt (Spec:2780-2784). Deshalb prueft dieser Scan BEIDES: dass
 * ein Riegel gerufen wird, UND dass sein Ergebnis nicht verworfen wird.
 */
const ORDNER = join(process.cwd(), "src/app/m/radio/_actions");
const SELBST = join(ORDNER, "guards.test.ts");

/**
 * ⛔ GENAU DREI EINTRAEGE — Planentscheidung E12, und die Abweichung von Spec:6762
 * („GENAU ZWEI") ist dort ausgeschrieben begruendet. Alle drei tragen `requireRadioHost`
 * und ausdruecklich KEINEN Sitzungsriegel:
 *
 *   gate.ts#einloesenAmGate    — sie ERZEUGT die Sitzung. Ein Sitzungsriegel davor waere
 *                                die Tuer, die sich selbst abschliesst (§3.3.3,
 *                                Spec:2359-2362).
 *   sitzung.ts#erneuereSitzung — sie ERZEUGT sie ebenfalls, am Formular, ohne die
 *                                eingetragenen Werte zu verlieren (§3.4.4,
 *                                Spec:2563-2570; dritte der „genau drei Stellen" aus
 *                                Spec:2258). Vorbild woertlich:
 *                                `lagerbuch/_actions/sitzung.ts:19-26` und `:51`.
 *   sitzung.ts#beenden         — sie BEENDET die Sitzung. Ein Riegel, der eine gueltige
 *                                Sitzung verlangt, machte aus einem toten Cookie ein
 *                                unloeschbares (§3.4.5, Spec:2774).
 *
 * ⛔ DIESE LISTE IST EINE BENANNTE KONSTANTE, DAMIT EIN SPAETERER EINTRAG EIN BEWUSSTER
 * AKT BLEIBT (B14, Spec:103). Ihre LAENGE wird unten mitgeprueft. ⛔ EIN VIERTER EINTRAG
 * IST EIN ROTER TEST UND KEINE ZEILE IM DIFF.
 */
const AUSNAHMEN = [
  "gate.ts#einloesenAmGate",
  "sitzung.ts#beenden",
  "sitzung.ts#erneuereSitzung",
] as const;

/** ⛔ HEUTE EINS (`codes.ts`), angehoben von A9 (3: + gate.ts, sitzung.ts) und A17
 *  (4: + ausleihe.ts). EXAKT, nicht „mindestens" — dieselbe Begruendung wie bei
 *  `HANDLER_ANZAHL` in `riegel.test.ts:63-72`: `laenge >= 0` ist fuer jede Liste wahr. */
const ACTION_DATEIEN_ANZAHL = 1;

const RIEGEL = /\brequireRadioAdmin\s*\(|\brequireAusleihSchreibend\s*\(/;
const HOST_RIEGEL = /\brequireRadioHost\s*\(/;

function actionDateien(): string[] {
  if (!existsSync(ORDNER)) return [];
  return readdirSync(ORDNER)
    .filter((d) => /\.ts$/.test(d) && !/\.(?:test|spec)\.ts$/.test(d))
    .map((d) => join(ORDNER, d))
    .filter((p) => p !== SELBST);
}

/*
 * ⛔ HIER STEHEN DIE ZWEI ECHTEN FUNKTIONEN, WOERTLICH KOPIERT AUS `riegel.test.ts:148-213`
 * (`ohneKommentare` und `ohneKommentareUndZeichenketten`, mit ihren Kommentaren).
 *
 * ⛔ KEIN `declare function`. Eine reine Typdeklaration hat keinen Rumpf: `typecheck`
 * bliebe GRUEN und der Test stuerbe zur Laufzeit an „is not a function" — die
 * verwirrendste aller Kombinationen, weil das erste Tor sie durchwinkt.
 *
 * ⛔ KEIN IMPORT AUS `riegel.test.ts` — vitest laedt Testdateien nicht als Module
 * fuereinander, und eine geteilte Helferdatei waere ein `_lib/`-Modul, das der
 * `"use client"`-Scan mitzaehlt. Die Verdoppelung ist der Preis dafuer und gewollt.
 *
 * Ohne das Leeren der Literale erfuellte ein String `"requireRadioAdmin("` als reiner
 * Text die Behauptung, OHNE dass der Riegel je liefe.
 */
function ohneKommentare(quelle: string): string { /* … riegel.test.ts:163-183 … */ }
function ohneKommentareUndZeichenketten(quelle: string): string { /* … riegel.test.ts:192-213 … */ }

/**
 * Die exportierten FUNKTIONEN einer Datei, je mit ihrem Koerperausschnitt.
 *
 * ⛔ `export type` UND `export interface` WERDEN VERWORFEN (Spec:6762). Ohne das waere
 * der Scan auf `AusleihErgebnis` und `RueckgabeErgebnis` rot-by-construction — und der
 * naheliegende Fix waere, den Scan abzuschwaechen.
 *
 * ⛔ GEZAEHLT WIRD JE DATEI JE DEKLARATION, NIE UEBER EIN `Set` DER NAMEN (Spec:6762):
 * zwei gleichnamige Exporte in zwei Dateien fielen sonst zu einem zusammen, und einer
 * bliebe unbewacht.
 */
function exportierteActions(quelle: string): { name: string; koerper: string }[] {
  const q = ohneKommentareUndZeichenketten(quelle);
  const treffer = [...q.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)\s*\(/g)];
  return treffer.map((t, i) => ({
    name: t[1]!,
    koerper: q.slice(t.index!, treffer[i + 1]?.index ?? q.length),
  }));
}

describe("radio-_actions: jede exportierte Action traegt ihren Riegel", () => {
  it("die Dateizahl steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⛔ DIE EXISTENZPFLICHT. Ohne sie liefe dieser Block ueber einer leeren Liste gruen
     * und bewachte nichts — dieselbe Fehlerklasse wie NT11 („ein Waechter, der `>= 5`
     * statt `= 6` prueft, bleibt gruen und bewacht nichts").
     *
     * DER ANHEBE-FAHRPLAN, eine Auflage an die Nachfolger:
     *   A8  legt `codes.ts` an                       -> 1
     *   A9  legt `gate.ts` und `sitzung.ts` an       -> 3
     *   A17 legt `ausleihe.ts` an                    -> 4
     */
    expect(actionDateien().length, "ACTION_DATEIEN_ANZAHL anheben — Fahrplan im Kopf dieser Datei")
      .toBe(ACTION_DATEIEN_ANZAHL);
  });

  it("die Ausnahmeliste hat GENAU DREI Eintraege", () => {
    /*
     * ⛔ Spec:6762: „Der Scan zaehlt die Ausnahmen MIT: waechst die Liste, ist das ein
     * ROTER TEST und keine Zeile im Diff." Eine WEITERE Ausnahme ist der Weg, auf dem
     * dieser Scan aufhoert, etwas zu bedeuten — und sie sieht in einem Diff aus wie eine
     * Zeile Wartung.
     *
     * ⚠️ SPEC:6762 SCHREIBT „GENAU ZWEI". Diese Zahl ist unter der Annahme geschrieben,
     * dass es `erneuereSitzung` nicht gibt; Spec:2258 („genau DREI Stellen, die eine
     * Ausleih-Sitzung ausstellen"), Spec:3108, Spec:2563-2570 und Zusage §3.10 Nr. 8
     * verlangen sie. Die Aufloesung ist Planentscheidung E12, dort ausgeschrieben.
     * ⛔ WER SIE ZURUECKDREHT, MUSS `erneuereSitzung` MIT ZURUECKDREHEN — die beiden
     * haengen aneinander.
     */
    expect(AUSNAHMEN.length, "eine vierte Ausnahme ist eine ENTSCHEIDUNG, kein Diff").toBe(3);
    expect([...AUSNAHMEN].sort()).toEqual([
      "gate.ts#einloesenAmGate",
      "sitzung.ts#beenden",
      "sitzung.ts#erneuereSitzung",
    ]);
  });

  it("keine Action ohne Riegel, keine Ausnahme ohne Host-Riegel", () => {
    const verstoesse: string[] = [];
    for (const pfad of actionDateien()) {
      const datei = relative(ORDNER, pfad);
      const quelle = readFileSync(pfad, "utf8");
      for (const { name, koerper } of exportierteActions(quelle)) {
        const schluessel = `${datei}#${name}`;
        if ((AUSNAHMEN as readonly string[]).includes(schluessel)) {
          /*
           * ⛔ EINE AUSNAHME IST KEINE FREISTELLUNG. Beide Ausnahmen tragen
           * `requireRadioHost` als erste Anweisung (Spec:6762, §3.5.5 Spec:2773-2774) —
           * die eine Ausnahme vom Grundsatz „Actions werfen nicht", weil ein Action-POST
           * auf falschem Host kein Betriebsfall ist, sondern ein manipulierter
           * (Spec:2360-2362).
           */
          if (!HOST_RIEGEL.test(koerper)) {
            verstoesse.push(`${schluessel}: Ausnahme OHNE requireRadioHost( (Spec:6762)`);
          }
          continue;
        }
        if (!RIEGEL.test(koerper)) {
          verstoesse.push(`${schluessel}: weder requireRadioAdmin( noch requireAusleihSchreibend(`);
        }
        /*
         * ⛔ DIE ZWEITE HAELFTE, UND SIE IST DIE GEFAEHRLICHERE (Spec:2780-2784):
         * `await requireAusleihSchreibend(db)` OHNE Pruefung des Ergebnisses ist
         * typkorrekt, lint-sauber und OEFFNET DIE ACTION FUER JEDEN. Ein Scan, der nur
         * fragt „steht der Aufruf da?", bestuende genau diesen Fall.
         *
         * Der Nachweis, den ein Quelltext-Scan hier fuehren kann, ist bewusst schwach und
         * benannt: das Ergebnis muss an einen NAMEN gebunden werden
         * (`const x = await requireAusleihSchreibend(...)`), und dieser Name muss danach
         * mindestens einmal vorkommen. Ein Aufruf im Ausdrucks-Kontext ohne Bindung faellt
         * damit auf. ⚠️ Was er NICHT faengt: eine Bindung, die danach nur geloggt wird.
         * Diese Restluecke traegt der e2e-Test „gesperrter Code wird an der Ausleihe
         * abgewiesen" (Planteil 5).
         */
        const bindung = /\b(?:const|let)\s+(\w+|\{[^}]*\})\s*=\s*await\s+requireAusleihSchreibend\s*\(/
          .exec(koerper);
        if (RIEGEL.test(koerper) && /requireAusleihSchreibend\s*\(/.test(koerper) && !bindung) {
          verstoesse.push(
            `${schluessel}: requireAusleihSchreibend( ohne Bindung — das Ergebnis wird verworfen (Spec:2780-2784)`,
          );
        }
        /*
         * DER RIEGEL IST DIE ERSTE ANWEISUNG (Spec:2766-2770, §4.2.1 Spec:3405-3407:
         * „vor jedem Lesen von `formData`"). Gemessen wird ueber die Textposition.
         *
         * ⛔ GEMESSEN WIRD IM RUMPF, NICHT IM `koerper`. `koerper` beginnt beim Wort
         * `export` und enthaelt damit die PARAMETERLISTE. Die bindenden Signaturen aus
         * A17 fuehren dort `formular: FormData` — ein Vergleich ueber den ganzen
         * `koerper` meldete fuer `ausleiheAnlegen` und `rueckgabeBuchen` IMMER „liest
         * formData VOR dem Riegel", bei richtiger Implementierung.
         * (`ohneKommentareUndZeichenketten` leert nur Kommentare und Literale;
         * Typannotationen bleiben stehen.)
         *
         * ⛔ ZUSAETZLICH VERENGT AUF LESEZUGRIFFE: nicht der NAME `formular` zaehlt,
         * sondern sein `.get(`. Beides zusammen, damit weder eine Annotation noch eine
         * Weitergabe als Argument faelschlich als „Lesen" gilt.
         */
        const rumpf = koerper.slice(koerper.indexOf("{"));
        const riegelPos = rumpf.search(RIEGEL);
        const formPos = rumpf.search(/\bform(?:Data|ular)\s*\.\s*get\b/);
        if (riegelPos !== -1 && formPos !== -1 && formPos < riegelPos) {
          verstoesse.push(`${schluessel}: liest formData VOR dem Riegel (§4.2.1)`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("jede Datei unter _actions/ traegt use server als erste Direktive", () => {
    /*
     * Ohne die Direktive ist eine „Server Action" eine gewoehnliche Funktion — der Import
     * aus einer Client-Insel schluege dann fehl oder, schlimmer, zoege den Servercode ins
     * Bundle. `pnpm build` meldet das nicht in jeder Form.
     *
     * ⛔ GEPRUEFT WIRD DIE ERSTE ZEILE, UND DAS IST ABSICHT. Ein Pfadkommentar davor
     * faerbt diesen Scan rot — und der naheliegende „Fix", ihn auf fuehrende Kommentare
     * aufzuweichen, ist der falsche. GEMESSEN: alle 20 Dateien unter
     * `src/app/m/lagerbuch/_actions/` tragen `"use server";` in ZEILE 1, ausnahmslos.
     * ⚠️ Fuer TESTdateien lautet die Hausform umgekehrt (`riegel.test.ts:1` ist ein
     * Pfadkommentar) — daher die Verwechslung, gegen die dieser Satz steht.
     */
    for (const pfad of actionDateien()) {
      const erste = readFileSync(pfad, "utf8").trimStart().split("\n")[0]!.trim();
      expect(erste, `${relative(ORDNER, pfad)}: keine "use server"-Direktive`)
        .toMatch(/^["']use server["'];?$/);
    }
  });
});
```

⛔ **Die zwei Helfer stehen oben als Rumpf-Platzhalter** — ⛔ **kopiere die echte Implementierung aus
`riegel.test.ts:148-213`** (beide Funktionen, `ohneKommentare` `:163-183` und
`ohneKommentareUndZeichenketten` `:192-213`, mit ihren Kommentaren), **in den Codeblock hinein, nicht
dahinter**. ⛔ **Niemals als `declare function`**: das ist eine reine Typdeklaration ohne Rumpf —
`typecheck` bleibt grün, der Test stirbt zur Laufzeit. **Kein Import aus `riegel.test.ts`** —
vitest lädt Testdateien nicht als Module füreinander, und eine geteilte Helferdatei wäre ein
`_lib/`-Modul, das der `"use client"`-Scan mitzählt.

- [ ] **Schritt 2: `_actions/codes.ts` schreiben**

Die zwei Actions oben, mit ihren Auflagen. ⛔ **Keine Löschfunktion**, und die drei Gründe stehen
als Kommentar in der Datei, nicht nur hier. ⛔ **`"use server";` als Zeile 1, ohne Pfadkommentar
davor** — der Scan in `guards.test.ts` liest `split("\n")[0]`; Bestand: `lagerbuch/_actions/*.ts`,
ausnahmslos.

- [ ] **Schritt 3: Drei Sonden am Guard-Scan**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A8a** | `requireRadioAdmin()` aus `setzeCodeAktiv` entfernen | „keine Action ohne Riegel" |
| **S-A8b** | einen **vierten** Eintrag zu `AUSNAHMEN` hinzufügen | „die Ausnahmeliste hat GENAU DREI Eintraege" |
| **S-A8c** | eine `export function` in `codes.ts` ergänzen, die keinen Riegel ruft | „keine Action ohne Riegel" **und** die Dateizahl bleibt grün — ⛔ **das ist der Befund: der Scan zählt Dateien, aber prüft Deklarationen** |

- [ ] **Schritt 4 — EIGENER SCHRITT: NT11, die Härtung von `radio-paritaet.test.ts:140`**

⛔ **Dieser Schritt hat eine ungewöhnliche Polarität, und das muss dir vorher klar sein: die Sonde
zeigt GRÜN, und genau dieses Grün ist der Beweis für die Lücke.** Wer das nicht erwartet, hält den
Lauf für einen Fehlschlag der Sonde und beginnt zu debuggen.

**Der Ist-Zustand, gemessen (2026-08-22):** `src/app/m/radio/_db/schema.ts` exportiert **sechs**
`sqliteTable(...)`-Objekte (`devices:19`, `softwareVersions:67`, `users:113`, `deviceEvents:119`,
`zugangscodes:160`, `loans:209`); `scripts/import/radio-paritaet.test.ts:71-76` deklariert `SICHTEN`
mit **fünf** Einträgen (die fünf Legacy-Tabellen mit Zielentsprechung). Zeile 140 steht damit bei
`6 >= 5` — **trivial wahr**.

**Die Lücke liegt in der Richtung `>=`:** zöge jemand `zugangscodes` in eine **eigene** Schemadatei
— ein Refactoring, das nichts an der Fachlichkeit ändert und naheliegend aussieht —, sähe
`Object.values(schema)` nur noch **fünf** Tabellen. `5 >= 5` bliebe **grün**, und die stille Folge
wäre, dass die Timestamp-Mode-Sonde `zugangscodes` **nicht mehr mitprüft**, ohne dass irgendeine
Zeile das meldet.

**Sequenz, verbindlich:**

1. **Sonde P-NT11 stellen, VOR der Härtung.** Verschiebe `zugangscodes` testweise aus
   `src/app/m/radio/_db/schema.ts` in eine neue Datei `src/app/m/radio/_db/schema-codes.ts` und
   re-exportiere sie **nicht** aus `schema.ts` (nur `loans` bekommt einen direkten Import).
   ```
   rtk pnpm vitest run scripts/import/radio-paritaet.test.ts
   ```
   ⛔ **Erwartet: GRÜN.** Zitiere die Zahl. **Das ist der Befund**, nicht das Problem.
2. **Zurücknehmen**, gegengeprüft:
   ```
   rtk git checkout -- src/app/m/radio/_db/
   rtk git status --porcelain src/app/m/radio/_db/
   ```
   Erwartet: **leer** (und `schema-codes.ts` gelöscht — `git checkout` entfernt keine unverfolgten
   Dateien, also **von Hand `rm`** und mit `rtk git status --porcelain` nachsehen).
3. **Härten** — der Einzeiler:
   ```ts
   // vorher (Zeile 140):
   expect(tabellen.length).toBeGreaterThanOrEqual(SICHTEN.length);
   // nachher:
   expect(
     tabellen.length,
     "eine Tabelle hat schema.ts verlassen — die Timestamp-Sonde prueft sie nicht mehr mit (NT11)",
   ).toBe(6);
   ```
4. **Sonde P-NT11 erneut stellen.** ⛔ **Erwartet jetzt: ROT**, mit `5` statt `6`. Zitiere die
   Meldung.
5. **Zurücknehmen und Grün bestätigen.**

⛔ **Und im selben Schritt: den irreführenden Kommentar über Zeile 140 korrigieren.** Er sagt heute
sinngemäß, `zugangscodes` habe keine Sicht, „Kapitel 3 baut sie erst" — das liest sich als Auftrag,
eine `paritaetsSichtZugangscode` nachzuliefern. **Das ist falsch, und die Spec entscheidet es:**

> „5. `zugangscodes` — **nicht Teil des Imports.** Es gibt in der Quelle nichts, was ihnen
> entspräche" (Spec `:1675`)

Eine Paritätssicht vergleicht per Definition **Quelle gegen Ziel** (`portal.ts:73-76`); ohne
Quellzeilen gäbe es nichts, wogegen sie prüfen könnte. `rg "paritaetsSichtZugangscode" scripts/import/`
liefert heute **null** Treffer, und das bleibt so. **Schreib das als Kommentar dorthin**, sonst
öffnet der nächste Durchgang die Frage erneut.

- [ ] **Schritt 5: Die Seed-Zusicherung in `_lib/seedLokal.ts`**

⛔ **Kein Code — ein Kommentar.** Falle № 31 (`docs/radio-portierung-analyse.md:1740-1749`):

> „Für `radio` heißt das: ein geseedeter Enrollment-Code wäre in der Generalprobe ein **GÜLTIGER
> anonymer Zugang** zum gesamten Bestand samt Ausleihernamen … Regel für die Spec: `seedLokal` legt
> Geräte und Stammdaten an, **niemals** eine einlösbare Zugangszeile; die Enrollment-Tabelle bleibt
> beim Seed **leer**."

Der Grund, warum das keine Lokal-Frage ist: **`SUITE_SEED=1` ist der Generalproben-Schalter**, nicht
nur der Lokalschalter (`CLAUDE.md`, „Lokale Demodaten"). Der naheliegende Griff — „ein Seed-Code,
damit das Gate lokal testbar ist" — ist genau die Falle. **Schreib den Absatz in den Kopf von
`seedLokal.ts`, mit beiden Fundstellen.**

⚠️ **Kein Test dazu in dieser Aufgabe.** `scripts/seed-lokal.test.ts` prüft bereits, dass jedes
Modul aus `MODULE_MIGRATIONS` einen Seed hat; eine Zusicherung „`seedLokal.ts` nennt `zugangscodes`
nicht" gehört sinnvoll dorthin und nicht in `m/radio/`. ⛔ **Trag sie als Zusage an Planteil 4/5
weiter** (siehe „Nahtstellen"), statt hier eine zweite Scan-Datei anzulegen — zwei Scans über
dieselbe Fläche sind ein Scan zu viel (B14).

⚠️ ⛔ **`_db/append.test.ts` LÄUFT AB JETZT ÜBER `_actions/codes.ts`.** Gemessen:
`src/app/m/radio/_db/append.test.ts:6` setzt `WURZEL = "src/app/m/radio"` und scannt **rekursiv das
ganze Modul** („kein Loeschweg auf zugangscodes", `:23-24`). `_actions/codes.ts` fällt damit in
seinen Bereich — und das ist die zweite Hälfte des Löschverbots, die `_db/schema.ts` in seinem
Kommentar bei `zugangscodes` ausdrücklich nennt: „durchgesetzt durch **Abwesenheit jedes Löschwegs
plus den Quelltext-Scan in `_db/append.test.ts` (§2.4)**". ⛔ **Nimm ihn ins Tor dieser Aufgabe auf.**

- [ ] **Schritt 6: Tor und Commit**

```
rtk pnpm vitest run src/app/m/radio/_actions/guards.test.ts \
                    src/app/m/radio/_db/append.test.ts \
                    scripts/import/radio-paritaet.test.ts
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_actions/codes.ts src/app/m/radio/_actions/guards.test.ts \
            scripts/import/radio-paritaet.test.ts src/app/m/radio/_lib/seedLokal.ts
rtk git commit -m "feat(radio): Codes ausstellen und sperren, der _actions-Scan, NT11 gehaertet"
rtk git show --stat HEAD
```

---

# ⛔ BLOCK MIT EINEM GEMEINSAMEN TOR: A9 + A10

> **Ein Commit, ein Tor, ein Review — und der Review liegt HINTER A10.**
>
> **Grund 1:** `riegel.test.ts:100` führt `HANDLER_ANZAHL` mit **`toBe`**. Der Fahrplan im Kopf der
> Datei (`:77`) setzt für Planteil 3 **`HANDLER_ANZAHL = 2`**. Landet nur einer der beiden Handler
> mit der angehobenen Konstante, ist Klausel (c) rot (`1 !== 2`); landet er ohne sie, ist sie
> ebenfalls rot (`1 !== 0`). **Keiner der beiden kann allein grün werden.**
>
> **Grund 2:** `_lib/bauform.test.ts` (A9) trägt den Reihenfolge-Scan über **drei** Flächen —
> `t/[code]/route.ts`, `_actions/gate.ts`, `_actions/sitzung.ts` (Spec `:3108`) — und seine
> Existenzpflicht vergleicht die von der Platte gelesene Liste gegen die Sollliste (Vorbild
> `lagerbuch/_lib/bauform.test.ts:1450-1457`, `toEqual(GATE_FLAECHEN)`). Über zwei von drei Flächen
> ist er **rot**, nicht leer-grün — genau so gebaut, damit er nicht leer-grün sein **kann**.
>
> Dazwischen stünde ein Wächter über einer unvollständigen Menge. **Deshalb ein Commit.**

---

## Aufgabe A9: Die zwei Gate-Actions und der Reihenfolge-Scan

**Files:**
- Create: `src/app/m/radio/_actions/gate.ts`
- Create: `src/app/m/radio/_actions/sitzung.ts`
- Create: `src/app/m/radio/_lib/bauform.test.ts`
- Modify: `src/app/m/radio/_actions/guards.test.ts` (`ACTION_DATEIEN_ANZAHL` 1 → 3)

**Interfaces:**
- Consumes: `requireRadioHost` (Planteil 2), `gateGesperrt`/`gateFehlversuchBuchen` (**A3**),
  `AUSLEIH_COOKIE`/`ausleihCookieOptionen`/`ausleihGueltigkeitSekunden` (**A4**), `normalisiereCode`
  (**A2**), `loeseCodeEin` (**A6**), `sanitizeReturnTo`/`istGateGrund` (**A5**).
- Produces: `einloesenAmGate` — gerufen von **A11** (`_ui/GateFormular.tsx`, über `useActionState`);
  `beenden` — gerufen von **A16** (`_ui/AusleihRahmen.tsx`, als `<form action={beenden}>`).

### Die sechs Schritte, gleiche Reihenfolge, drei Flächen (Spec `:2256-2272`)

```
1. Host-Riegel                     — VOR allem anderen
2. gateGesperrt(absender)          — Sperrzeit lesen, OHNE Datenbankzugriff
3. normalisiereCode(...)           — als EIGENE Anweisung, nicht inline
4. loeseCodeEin(code, db)          — Treffer und `aktiv` in einem Doppeltest
5. bei Erfolg: Cookie setzen, 303 bzw. redirect — KEIN Budgetverbrauch
6. bei Misserfolg: gateFehlversuchBuchen(absender), benannter Grund
```

⛔ **Schritt 3 ist eine eigene Anweisung, und das ist kein Stil.** Der Reihenfolge-Scan vergleicht
**Textpositionen**; `loeseCodeEin(normalisiereCode(x), db)` erschiene textlich als „Einlösung vor
Normalisieren" (Spec `:2264-2268`, Bestand `lagerbuch/t/[code]/route.ts:76-77`).

⛔ **Schritt 5 verbraucht KEIN Budget.** Bei `radio` ist „ein Funkraum voller Personen, die
denselben Aufsteller nacheinander scannen, teilen sich einen Uplink und damit einen
Absenderschlüssel" **der Regelfall**. Die Suite hat den Gegenfehler bereits produktiv gemacht
(`feedback`, 15 Ehrenamtliche aus einem Vereins-WLAN,
`src/app/m/files/api/u/[token]/upload/route.ts:140-149`).

### `_actions/gate.ts` — die Signatur ist bindend (Spec `:2338-2368`)

```ts
"use server";
export type GateZustand = { fehler?: string };

export async function einloesenAmGate(
  _vorher: GateZustand,
  formData: FormData,
): Promise<GateZustand>;
```

⚠️ ⛔ **Ohne den ersten Parameter wäre die Funktion typkorrekt kompilierbar, bekäme aber zur
Laufzeit `FormData` im falschen Parameter — die Eingabe wäre IMMER LEER, jeder Code würde als
„unbekannt" beantwortet, und `pnpm build` sieht das nicht** (`:2352-2356`). Der Aufrufer ist
`useActionState<GateZustand, FormData>(einloesenAmGate, {})`.

* **Erste Anweisung: `requireRadioHost(await headers())` — sie WIRFT hier** (Zulässigkeitstafel
  Zeile 11). Die eine Ausnahme vom Grundsatz „Actions werfen nicht".
* ⛔ **Kein Sitzungsriegel** — sie **erzeugt** die Sitzung; ein Riegel davor wäre die Tür, die sich
  selbst abschließt. Sie steht auf der Ausnahmeliste des Guard-Scans (A8).
* Bei Erfolg: `(await cookies()).set(AUSLEIH_COOKIE, e.cookieValue, ausleihCookieOptionen(...))`,
  dann `redirect(sanitizeReturnTo(returnTo) ?? "/")` (Zulässigkeitstafel Zeile 1 und 6).
  ⚠️ **`redirect()` NICHT in einem `try`/`catch`** — es arbeitet über einen geworfenen Sentinel.
* Bei Misserfolg: `gateFehlversuchBuchen(absender)` und `{ fehler: gateMeldung("code", null)! }` —
  **kein Wurf**, weil `useActionState` den Fehlertext am Formular braucht.

### `_actions/sitzung.ts` — ZWEI Exporte (Spec `:2606-2609`, `:2774`, `:2563-2570`)

```ts
"use server";                                        // ⛔ ZEILE 1, ohne Pfadkommentar
export async function beenden(): Promise<void>;
export async function erneuereSitzung(
  rohCode: string,
): Promise<{ ok: true } | { ok: false; text: string }>;
```

⛔ **`erneuereSitzung` ist die DRITTE Stelle, die eine Ausleih-Sitzung ausstellt — Entscheidung
E12.** Spec `:2258` (§3.3.1): „Es gibt genau **drei** Stellen, die eine Ausleih-Sitzung ausstellen.
**Alle drei** tragen dieselben sechs Schritte in derselben Reihenfolge." Spec `:2563-2570` (§3.4.4)
schreibt sie aus, Zusage §3.10 Nr. 8 (`:3235-3236`) bindet die Fläche daran, und Spec `:3108` führt
`_actions/sitzung.ts` im Reihenfolge-Scan. **Vorbild wörtlich: `lagerbuch/_actions/sitzung.ts:51-101`**
(Kopfkommentar `:19-49`).

**Sie trägt alle sechs Schritte, in der Reihenfolge des Gates:**

1. `requireRadioHost(await headers())` — **werfend**, erste Anweisung.
2. `gateGesperrt(absender)` — ⛔ **ohne** Datenbankzugriff, **ohne** Buchung; bei ≠ `null`
   `{ ok: false, text: gateMeldung("zuviele", n)! }`.
3. `normalisiereCode(rohCode)` — ⛔ **als eigene Anweisung, nicht inline** (Textpositionen, `:2268-2272`).
4. `loeseCodeEin(code, getDb())`.
5. **Erfolg:** Cookie über `ausleihCookieOptionen(ausleihGueltigkeitSekunden())` setzen —
   ⛔ **KEIN `redirect()`**. „Sie leitet nicht um. Das ist der ganze Punkt: die Seite bleibt stehen,
   die eingetragenen Werte bleiben stehen" (`lagerbuch/_actions/sitzung.ts:41-44`).
6. **Misserfolg:** `gateFehlversuchBuchen(absender)`, dann `{ ok: false, text: gateMeldung("code", null)! }`.

⛔ **Kein Sitzungsriegel** — sie **erzeugt** die Sitzung. Sie steht deshalb als **dritter** Eintrag
auf der Ausnahmeliste des Guard-Scans (E12; `sitzung.ts#erneuereSitzung`).

⚠️ **Der Ergebnistyp trägt bewusst KEINEN `grund`.** Der Aufrufer ist bereits das Erneuerungsfeld
selbst; ein `grund: "sitzung"` von hier baute ein zweites Feld im ersten auf. Der Bestand schreibt
genau das aus (`lagerbuch/_actions/sitzung.ts:45-49`).

⚠️ **Hier weicht `radio` von `lagerbuch` ab, und die Abweichung ist belegt.** `lagerbuch`s `beenden`
trägt **keinen** Host-Riegel (`lagerbuch/_actions/sitzung.ts:128-131`: „der schlechteste Fall ist ein
Cookie, das man nicht loswird"). **`radio`s trägt einen** — §3.5.5 (`:2774`) führt sie mit
`requireRadioHost`, werfend, und Spec `:6762` sagt für beide Ausnahmen ausdrücklich: „**beide tragen
`requireRadioHost` und ausdrücklich keinen Sitzungsriegel**". Der Guard-Scan aus A8 prüft genau das.

* Räumt **nur** `AUSLEIH_COOKIE`, über `ausleihCookieOptionen(0)` — ⛔ **nicht** `cookies().delete()`
  (Zulässigkeitstafel Zeile 4).
* ⛔ **Kein `signOut()`, kein Auth.js-Cookie** — sonst verlöre eine angemeldete Person ihre
  Suite-Sitzung auf **allen** Modul-Hosts beim Beenden des anonymen Zugangs (`:2610-2614`).
* Danach `redirect("/")`.

- [ ] **Schritt 1: `_lib/bauform.test.ts` schreiben**

Bauform **aus `src/app/m/lagerbuch/_lib/bauform.test.ts:1370-1475`** — inklusive der vier
ausgeschriebenen Warnungen dort. ⛔ **1:1 übernommen sind `riegelFuer` und der Reihenfolge-Fall
selbst; NICHT übernommen ist `einloeseAbschnitt`** — dort ist es die **Mitgliedschaftsbedingung**
(`flaechen()` behält nur Dateien, in denen es etwas findet), hier ist der Ausschnitt eine **Funktion
je Fläche** (E12, `EINLOESE_FUNKTION` unten). ⛔ **Ein Name, zwei Aufgaben wäre genau die
Verwechslung, die dieser Abschnitt vermeiden soll**; der hiesige heißt deshalb `scanAbschnitt`.
Angepasst:

```ts
// src/app/m/radio/_lib/bauform.test.ts  (Auszug — die tragenden Stellen)

/**
 * DER REIHENFOLGE-SCAN DER DREI GATE-FLAECHEN (Spec 1 §3.3.1 Zeilen 2256-2272,
 * Testauftrag §3.8 Zeile 3108). Bauform 1:1 aus
 * `src/app/m/lagerbuch/_lib/bauform.test.ts:1370-1475`.
 *
 * ⛔ WARUM DER AUSSCHNITT UND NICHT DER GANZE DATEITEXT: `muster.exec(q)` liefert das
 * ERSTE Vorkommen in der ganzen Datei. Traegt eine Flaeche mehr als eine exportierte
 * Funktion — fuer `_actions/gate.ts` der Normalfall —, koennten die vier Erst-Vorkommen
 * aus VERSCHIEDENEN Funktionen stammen. Die Reihenfolgeaussage waere dann bedeutungslos,
 * OHNE rot zu werden.
 */
const GATE_FLAECHEN = ["t/[code]/route.ts", "_actions/gate.ts", "_actions/sitzung.ts"];

/**
 * ⛔ JE FLAECHE WIRD DER KOERPER EINER BENANNTEN FUNKTION GESCANNT, NICHT DER DATEITEXT.
 * `_actions/sitzung.ts` traegt ZWEI Exporte (E12), und `beenden` traegt nur den
 * Host-Riegel. Ein Scan ueber den Dateitext meldete fuer sie „Sperre fehlt ganz" — bei
 * richtiger Implementierung. Fuer `_actions/gate.ts` gilt dasselbe aus dem Grund, den der
 * Kopfkommentar oben nennt: `muster.exec(q)` liefert das ERSTE Vorkommen in der ganzen
 * Datei, und bei mehreren Exporten koennten die vier Erst-Vorkommen aus VERSCHIEDENEN
 * Funktionen stammen.
 *
 * `funktionsKoerper(quelle, name)` wird aus `riegel.test.ts:237-252` kopiert.
 */
const EINLOESE_FUNKTION: Record<string, string> = {
  "t/[code]/route.ts": "GET",
  "_actions/gate.ts": "einloesenAmGate",
  "_actions/sitzung.ts": "erneuereSitzung",
};

/** Der Host-Riegel ist je Flaeche VERSCHIEDEN: Route Handler nicht-werfend
 *  (`riegel.test.ts:440-449` verbietet dort die werfende Form), Actions werfend
 *  (Spec:2360-2362). */
const HOST_FORM: Record<string, RegExp> = {
  "t/[code]/route.ts": /\bradioHostOderNull\s*\(/,
  "_actions/gate.ts": /\brequireRadioHost\s*\(/,
  "_actions/sitzung.ts": /\brequireRadioHost\s*\(/,
};

const riegelFuer = (schluessel: string) => [
  { name: "Host", muster: HOST_FORM[schluessel]! },
  { name: "Sperre", muster: /\bgateGesperrt\s*\(/ },
  { name: "normalisieren", muster: /\bnormalisiereCode\s*\(/ },
  { name: "Einloesung", muster: /\bloeseCodeEin\s*\(/ },
];

/** Der Ausschnitt, ueber den die vier Muster laufen — die EINE benannte Funktion je
 *  Flaeche, nicht der Dateitext. ⛔ NICHT `einloeseAbschnitt` nennen: im Vorbild
 *  (`lagerbuch/_lib/bauform.test.ts:1437-1447`) ist das die MITGLIEDSCHAFTSBEDINGUNG. */
const scanAbschnitt = (schluessel: string) =>
  funktionsKoerper(
    ohneKommentareUndZeichenketten(lies(schluessel)),
    EINLOESE_FUNKTION[schluessel]!,
  );

/**
 * ⛔ DIE EXISTENZPFLICHT FILTERT AUF DIE DATEI, NICHT AUF „loest ein". Das Vorbild
 * filtert auf „traegt `redeemToken(`" (`lagerbuch/_lib/bauform.test.ts:1437-1447`), weil
 * dort ALLE drei Dateien einloesen. Hier waere derselbe Filter zweideutig: `sitzung.ts`
 * loest zwar ein (in `erneuereSitzung`, E12), aber die Aussage, die diese Liste tragen
 * soll, ist „die drei Dateien EXISTIEREN" — sonst sind die Faelle darunter vacuously
 * true, sobald eine fehlt. Welche FUNKTION gescannt wird, sagt `EINLOESE_FUNKTION`.
 */
const vorhandeneFlaechen = () =>
  GATE_FLAECHEN.filter((f) => existsSync(join(MODUL, f)));

it("alle drei Gate-Flaechen existieren", () => {
  /*
   * ⛔ DIE VERSCHAERFUNG (Vorbild `lagerbuch/_lib/bauform.test.ts:1450-1457`). Ohne sie
   * sind die Faelle darunter „vacuously true", sobald eine Datei fehlt — und das sieht in
   * der Ausgabe wie ein bestandener Lauf aus. Verglichen wird eine aus der PLATTE gelesene
   * Liste gegen die Sollliste, IN DERSELBEN REIHENFOLGE.
   *
   * ⛔ DIESE ZEILE IST DER ZWEITE GRUND, WARUM A9 UND A10 EIN COMMIT SIND: ueber zwei von
   * drei Flaechen ist sie ROT.
   */
  expect(vorhandeneFlaechen()).toEqual(GATE_FLAECHEN);
});

it("sitzung.ts hat ZWEI Exporte, und nur erneuereSitzung loest ein", () => {
  /*
   * ⛔ DIE ARBEITSTEILUNG INNERHALB EINER DATEI, und sie ist der Grund, warum der
   * Reihenfolge-Scan eine FUNKTION misst und nicht den Dateitext (E12).
   *
   *   erneuereSitzung — die dritte Gate-Flaeche (Spec:2258, :2563-2570). Alle vier
   *                     Riegel, in der Reihenfolge des Gates.
   *   beenden         — KEIN Code einzuloesen. Nur der Host-Riegel; die drei uebrigen
   *                     Muster gaebe es dort nicht, und ein Dateitext-Scan meldete sie
   *                     faelschlich als fehlend.
   */
  const q = ohneKommentareUndZeichenketten(lies("_actions/sitzung.ts"));
  expect(q).toMatch(/\bexport\s+async\s+function\s+beenden\s*\(/);
  expect(q).toMatch(/\bexport\s+async\s+function\s+erneuereSitzung\s*\(/);

  const beendenKoerper = funktionsKoerper(q, "beenden");
  expect(beendenKoerper, "beenden traegt den Host-Riegel").toMatch(/\brequireRadioHost\s*\(/);
  expect(beendenKoerper, "beenden loest nichts ein").not.toMatch(/\bloeseCodeEin\s*\(/);

  const erneuernKoerper = funktionsKoerper(q, "erneuereSitzung");
  expect(erneuernKoerper, "erneuereSitzung loest ein").toMatch(/\bloeseCodeEin\s*\(/);
  /*
   * ⛔ UND SIE LEITET NICHT UM. Das ist ihr ganzer Zweck: die Seite bleibt stehen, die
   * eingetragenen Werte bleiben stehen (Spec:2563-2567,
   * `lagerbuch/_actions/sitzung.ts:41-44`). Ein `redirect()` hier verwuerfe genau das,
   * wogegen die Funktion gebaut ist.
   */
  expect(erneuernKoerper, "erneuereSitzung darf nicht umleiten").not.toMatch(/\bredirect\s*\(/);
});

it("abmelden/route.ts nennt signOut nicht", () => {
  /*
   * ⛔ Spec:2610-2614: „`/abmelden` raeumt AUSSCHLIESSLICH `AUSLEIH_COOKIE`. Kein
   * `signOut()`, kein Auth.js-Cookie — sonst verloere eine angemeldete Person ihre
   * Suite-Sitzung auf ALLEN Modul-Hosts beim Beenden des anonymen Zugangs."
   *
   * Der Fehler ist maximal naheliegend („abmelden heisst abmelden") und im Betrieb
   * unangenehm: wer ueber die Kachel kam und den Code-Zugang beendet, faende sich aus der
   * ganzen Suite ausgeloggt.
   */
  expect(ohneKommentareUndZeichenketten(lies("abmelden/route.ts"))).not.toMatch(/\bsignOut\b/);
});

it("keine Datei unter admin/ nennt AUSLEIH_COOKIE", () => {
  /*
   * ⛔ Spec:2449-2451 und §3.6.3 Punkt 1 (Spec:2908-2912): das Cookie traegt `path: "/"`
   * und wird damit an `/admin` MITGESCHICKT. Die Zusage, dass es dort niemand LIEST, kann
   * kein Typ und kein Riegel halten — nur dieser Scan.
   *
   * ⚠️ HEUTE UEBER ZWEI DATEIEN (`admin/(arbeit)/layout.tsx`, `admin/(druck)/layout.tsx`).
   * Die Untergrenze steht dabei, damit er nicht leer-gruen wird, wenn `admin/` einmal
   * anders heisst.
   */
  const dateien = adminDateien();
  expect(dateien.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(2);
  expect(trefferAuf(/\bAUSLEIH_COOKIE\b|radio_ausleihe/, dateien)).toEqual([]);
});

it("keine Gate-Flaeche nennt NextResponse.redirect", () => {
  /*
   * ⛔ Spec:2284-2296: `NextResponse.redirect(...)` verlangt eine ABSOLUTE URL, und
   * `req.url` traegt nach dem Modul-Host-Rewrite den INNEREN Pfad (`/m/radio/...`). Der
   * Browser landete also auf einer Adresse, die er nie gesehen hat — und bei `radio` ist
   * das teurer als bei `lagerbuch`, weil es KEIN PARALLELFENSTER gibt: der einzige
   * Rueckweg ist „Router zurueck".
   *
   * Ein RELATIVES `Location` loest der Browser gegen die URL auf, die ER sah
   * (RFC 7231 §7.1.2).
   */
  for (const f of GATE_FLAECHEN.concat(["abmelden/route.ts"])) {
    expect(ohneKommentareUndZeichenketten(lies(f)), `${f} nennt NextResponse.redirect`)
      .not.toMatch(/NextResponse\s*\.\s*redirect/);
  }
});

it("keine Datei dieses Moduls ruft cookies().delete", () => {
  /*
   * ⛔ Zwei Ausfaelle in einem (Zulaessigkeitstafel Zeilen 3 und 4): in einer Server
   * Component WIRFT es (der vernarbte Praezedenzfall aus `lagerbuch`, mit Quellenbeleg in
   * `lagerbuch/abmelden/route.ts:12-20`), und ueberall sonst setzt es KEIN `Path` und
   * loescht dadurch am falschen Scope — WIRKUNGSLOS, ohne dass der Browser das meldet.
   *
   * Die eine erlaubte Form ist `ausleihCookieOptionen(0)`: dieselbe Optionen-Funktion wie
   * beim Setzen (Spec:2596-2604).
   */
  expect(trefferAuf(/\bcookies\s*\(\s*\)[\s\S]{0,40}\.\s*delete\s*\(/)).toEqual([]);
});
```

⛔ **`quellDateien`, `ohneKommentare`, `ohneKommentareUndZeichenketten`, `trefferAuf` und
`funktionsKoerper` aus `riegel.test.ts:117-252` KOPIEREN**, nicht importieren — ⚠️ **`:117-215` wäre
zu kurz: `trefferAuf` beginnt bei `:215` und endet bei `:224`, `funktionsKoerper` steht bei
`:237-252`** (gemessen) — (vitest lädt Testdateien nicht als Module füreinander; eine geteilte
Helferdatei unter `_lib/` zählte der `"use client"`-Scan mit). ⛔ **`funktionsKoerper` ist ab E12
nicht optional**: ohne sie misst der Reihenfolge-Scan den Dateitext, und `_actions/sitzung.ts` hat
zwei Exporte. `lies(kurzPfad)` ist ein Einzeiler dieser Datei (`readFileSync` auf
`join(MODUL, kurzPfad)`).

- [ ] **Schritt 2: Die zwei Actions schreiben**

`_actions/gate.ts` und `_actions/sitzung.ts` nach den Vorgaben oben, Vorbild
`lagerbuch/_actions/gate.ts:38-100`, `lagerbuch/_actions/sitzung.ts:51-101` (`erneuereSitzung`) und
`:133-153` (`beenden`). ⛔ **`"use server";` als Zeile 1 beider Dateien, ohne Pfadkommentar davor.**
⛔ `ACTION_DATEIEN_ANZAHL` in `_actions/guards.test.ts` von **1 auf 3** anheben — der Fahrplan steht
im Kopf jener Datei. ⛔ **Und `erneuereSitzung` steht dort als dritter Eintrag auf `AUSNAHMEN`**
(E12) — sie ist bereits in der Konstante ausgeschrieben; **prüfe, dass die Längenzusicherung auf 3
steht**.

- [ ] **Schritt 3 (nach A10, weil das Tor gemeinsam ist): Vier Sonden am Reihenfolge-Scan**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A9a** | in `_actions/gate.ts` `normalisiereCode` **inline** in den `loeseCodeEin`-Aufruf ziehen | „jede Flaeche … traegt alle vier Riegel — in dieser Reihenfolge" — ⛔ **das ist der Fall, für den Schritt 3 eine eigene Anweisung ist** |
| **S-A9b** | in `t/[code]/route.ts` `gateGesperrt` **hinter** `loeseCodeEin` schieben | derselbe Fall — die Vorprüfung ohne DB-Zugriff läge dann hinter dem DB-Zugriff, den sie schützen soll |
| **S-A9c** | `signOut()` in `abmelden/route.ts` ergänzen | „abmelden/route.ts nennt signOut nicht" |
| **S-A9d** | `AUSLEIH_COOKIE` in `admin/(druck)/layout.tsx` importieren (ohne Verwendung) | „keine Datei unter admin/ nennt AUSLEIH_COOKIE" |
| **S-A9e** | in `_actions/sitzung.ts#erneuereSitzung` `gateGesperrt` **hinter** `loeseCodeEin` schieben | „jede Flaeche … traegt alle vier Riegel — in dieser Reihenfolge" — ⛔ **die Sonde, die belegt, dass der Scan die DRITTE Flaeche wirklich erreicht**; färbt sie nichts, misst der Scan `beenden` oder den Dateitext statt `erneuereSitzung` |
| **S-A9f** | `redirect("/")` ans Ende von `erneuereSitzung` hängen | „sitzung.ts hat ZWEI Exporte, und nur erneuereSitzung loest ein" (der `redirect`-Teil) — die Zusage „sie leitet nicht um" hat sonst keine benannte Mutation |

---

## Aufgabe A10: Die zwei Route Handler — `t/[code]/route.ts` und `abmelden/route.ts`

**Files:**
- Create: `src/app/m/radio/t/[code]/route.ts`
- Create: `src/app/m/radio/abmelden/route.ts`
- Modify: `src/app/m/radio/riegel.test.ts` (`HANDLER_ANZAHL` **0 → 2**, plus Kopfkommentar)

**Interfaces:**
- Consumes: alles aus A2–A6 sowie `radioHostOderNull` (Planteil 2, `_lib/host.ts:64-66`).
- Produces: die zwei äußeren Pfade `/t/<code>` und `/abmelden`.

### `t/[code]/route.ts` — GET, 303, Cookie auf derselben Antwort (Spec `:2274-2337`)

**Warum ein Route Handler und keine Server Action:** ein gescannter QR-Code ist ein **GET aus der
Adresszeile**; eine Server Action ist ein POST auf eine React-Referenz und aus einem Kamera-Scan
**nicht auslösbar** (`:2276-2280`).

⛔ **Antwortform, verbindlich:**
* **303, nicht 302** — die Antwort auf ein GET soll nach dem Folgen ein GET bleiben.
* **Relatives `Location`, in JEDEM Zweig.** ⛔ Ausdrücklich **nicht** `NextResponse.redirect(...)`
  (Zulässigkeitstafel-Nachbar, Scan in A9).
* **Cookie auf DERSELBEN Antwort**, die den 303 trägt: `antw.cookies.set(...)`
  (Zulässigkeitstafel Zeile 2). Zwei getrennte Antworten wären ein Cookie, das der Browser dem
  falschen Vorgang zuordnet.
* **Host-Riegel VOR der Einlösung, in der NICHT-werfenden Form `radioHostOderNull(kopf)`** — der
  Handler baut seine 404 **selbst** (`riegel.test.ts:440-455`; ein `notFound()` wäre eine
  HTML-Fehlerseite mit `Content-Type: text/html` und keine brauchbare Antwort auf einen gescannten
  QR-Code).

⛔ **Warum der Host-Riegel hier DATENWIRKUNG hat (§3.4.6, `:2616-2629`):** `/m/<modul>/*` antwortet
auf **jedem** Host, der auf den Suite-Container terminiert — `decideRoute` gatet nach
Modul-**Segment**, nicht nach Host (`src/core/routing.ts:56-68`), und steigt bei
`requiresAuth: false` sofort mit `true` aus. **Ohne Host-Riegel schriebe `loeseCodeEin`
`last_used_at` auf falschem Host.** Das host-only Cookie aus A4 ist die **zweite Hälfte** dieses
Riegels — es greift dort, wo die erste versagt. ⛔ **Beide Hälften, oder keine.**

### `abmelden/route.ts` — GET, 303, Cookie-Löschung (Spec `:2572-2614`)

⚠️ ⛔ **Es MUSS ein Route Handler sein.** `requireAusleihZugang` wird aus einer **Server Component**
gerufen (`(ausleihe)/layout.tsx`), und dort ist `cookies().delete(...)` ein **Laufzeitfehler**
(Zulässigkeitstafel Zeile 3). Der Riegel leitet per `redirect()` **als String** hierher; dieser
Handler räumt.

* `radioHostOderNull(kopf)`, eigene 404.
* `grund` aus `searchParams` **nur durch `istGateGrund` hindurch** — der Wert landet in einem
  `Location`-Kopf.
* `303` mit **relativem** `Location`.
* ⛔ **Gelöscht wird über `ausleihCookieOptionen(0)`, nicht über `cookies.delete(...)`.**
* ⛔ **`/abmelden` liegt NICHT unter `t/`** (NS-Z3) — statisch schlägt dynamisch, und ein
  `/t/abmelden` wäre im Aufsteller-Pfad eine Falle.
* ⛔ **Räumt AUSSCHLIESSLICH `AUSLEIH_COOKIE`.** Kein `signOut()` (Scan in A9).

⚠️ **Angenommene Restlücke, ausgesprochen statt weggeschrieben** (`:2604-2606`): ein GET-Endpunkt,
der ein Cookie räumt, ist von fremden Seiten auslösbar (`<img src=…>`). Der Schaden ist genau
„erneut scannen" — ein CSRF-Token wäre teurer als der Schaden. **Schreib den Satz in den
Kopfkommentar der Datei**, damit ein späterer Durchgang ihn nicht als Fund meldet.

⛔ **Der sichtbare Abmeldeweg ist KEIN `<Link href="/abmelden">`** (Zulässigkeitstafel Zeile 15,
NS-Z3): Nexts Prefetch beendete die Sitzung ungefragt beim Darüberfahren. Der sichtbare Weg ist
`<form action={beenden}>` (A16).

- [ ] **Schritt 1: `riegel.test.ts` anheben — EINE Zeile, plus Kopfkommentar**

```ts
// vorher (riegel.test.ts:100):
const HANDLER_ANZAHL = 0;
// nachher:
const HANDLER_ANZAHL = 2;
```

⛔ **Und den Fahrplan im Kopf nachziehen** (`riegel.test.ts:77`): die Zeile „Planteil 3 baut
`t/[code]/route.ts` und `abmelden/route.ts` → `HANDLER_ANZAHL = 2`" auf „**erledigt** (Planteil 3)"
setzen, die zwei übrigen Zeilen (Planteil 4 → 3, Planteil 5 → 4) **stehen lassen**.

- [ ] **Schritt 2: Die zwei Handler schreiben**

Vorbild `lagerbuch/t/[code]/route.ts` (129 Zeilen) und `lagerbuch/abmelden/route.ts` (93 Zeilen),
Bauform 1:1, mit den Abweichungen oben.

- [ ] **Schritt 3: Grün sehen — der gemeinsame Lauf von A9 und A10**

```
rtk pnpm vitest run \
  src/app/m/radio/riegel.test.ts \
  src/app/m/radio/_lib/bauform.test.ts \
  src/app/m/radio/_actions/guards.test.ts \
  src/app/m/radio/_lib/routen.test.ts
```

Erwartet: **alle vier grün**. `routen.test.ts` läuft mit, weil `/t/ABC123` und `/abmelden` dort als
äußere Pfade zugesichert sind (`AUSLEIH`-Liste, `toBe(6)`) — die Dateien, die diese Pfade jetzt
tragen, dürfen die Middleware-Entscheidung nicht verschieben.

- [ ] **Schritt 4: Vier Sonden an `riegel.test.ts` Klausel (c)**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A10a** | `HANDLER_ANZAHL` zurück auf `0` | „die Handlerzahl steht EXAKT auf dem Stand dieses Planteils" (`2 !== 0`) |
| **S-A10b** | in `abmelden/route.ts` `radioHostOderNull` durch `requireRadioHost` ersetzen | „keiner nennt die werfende Form, jeder nennt eine der beiden nicht-werfenden" — **zwei** Verstöße (fehlende nicht-werfende Form **und** genannte werfende) |
| **S-A10c** | in `t/[code]/route.ts` `requireRadioAdmin()` ergänzen | derselbe Fall, dritte Zeile (B11-Prüfung: Login-Umweg) |
| **S-A10d** | `radioHostOderNull` aus `t/[code]/route.ts` entfernen | derselbe Fall — ⛔ **und schreib in den Bericht, dass `loeseCodeEin` damit `last_used_at` auf JEDEM Suite-Host schriebe** (§3.4.6) |

⛔ **Zitiere je Sonde Meldung und Gesamtzahl.** Nach jeder:
```
rtk git checkout -- src/app/m/radio/
rtk git status --porcelain src/app/m/radio/
```

- [ ] **Schritt 5: Das gemeinsame Tor und der EINE Commit**

```
rtk pnpm typecheck && rtk pnpm lint
rtk pnpm vitest run src/app/m/radio/
```

Erwartet: **alle Dateien des Moduls grün**, kein neuer Fehlschlag außerhalb — gegen die **selbst
gemessene** Grundlinie, nicht gegen eine der drei umlaufenden Zahlen (siehe „Das Tor je Aufgabe").

```bash
rtk git add src/app/m/radio/_actions/gate.ts src/app/m/radio/_actions/sitzung.ts \
            src/app/m/radio/_actions/guards.test.ts \
            src/app/m/radio/_lib/bauform.test.ts \
            src/app/m/radio/t/[code]/route.ts src/app/m/radio/abmelden/route.ts \
            src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): das Gate — zwei Route Handler, zwei Actions, der Reihenfolge-Scan"
rtk git show --stat HEAD
```

⛔ **Ein Commit für A9 und A10 zusammen.** Wer sie trennt, hinterlässt einen Baum, in dem ein
Wächter über einer unvollständigen Menge steht.

---

## Aufgabe A11: Das Gate an `/` — und Klausel (f) schließt ⬜ Z-L3

**Files:**
- Create: `src/app/m/radio/page.tsx`
- Create: `src/app/m/radio/page.test.tsx`
- Create: `src/app/m/radio/_ui/GateFormular.tsx`
- Create: `src/app/m/radio/_ui/ausleihe.module.css` (der Gate-Teil; A16 erweitert sie)
- Modify: `src/app/m/radio/riegel.test.ts` (**neue Klausel (f)**, plus Kopfkommentar: ⬜ Z-L3
  ersetzt, nicht gelöscht)

**Interfaces:**
- Consumes: `requireRadioHost` (Planteil 2), `ausleihZugangOderNull` (**A7**), `gateMeldung`/
  `istGateGrund` (**A5**), `einloesenAmGate` (**A9**), `istRadioAdmin`/`viewerOderNull`
  (Planteil 2, `_lib/zugang.ts:177-181`, `:86-88`).
- Produces: den äußeren Pfad `/` und ⛔ **Klausel (f)** — den Wächter, unter dem **jede** Fläche von
  A18–A20 steht.

### Was die Seite ist (Entscheidung E1, Spec `:277`, `:2757-2778`, `:2400-2419`)

`src/app/m/radio/page.tsx` ist die **Weiche Gate-oder-Ausleihe** und liegt **außerhalb** von
`(ausleihe)/` — auf dem Gate ist „keine Sitzung" der **Regelfall** (`:286-288`).

| Befund | Was die Seite tut |
|---|---|
| `ausleihZugangOderNull(getDb())` liefert einen Zugang | `redirect("/geraete")` |
| liefert `null` | rendert das **Codefeld** — ⛔ **kein** Redirect, ⛔ **kein** Löschen (`:2407`) |
| `?grund=<g>` steht in der URL | `gateMeldung(g, sperrSekunden)` über `istGateGrund`; bei `grund === "zuviele"` fragt die Seite `gateGesperrt(clientIpAus(await headers()))` **selbst** — die Zahl wandert **nicht** über die URL (`:2394-2396`) |
| `istRadioAdmin(await viewerOderNull())` | zeigt einen **Link** nach `/admin` |

⛔ **Riegelform dieser Fläche, verbindlich (§3.5.5, `:2761`):**
`requireRadioHost(await headers())` **+** `ausleihZugangOderNull(getDb())` — ⛔ **NIEMALS
`requireAusleihZugang`**: die leitet bei fehlendem Cookie auf `/` um, und das ist diese Seite.
**Ein endloser Redirect.**

⛔ **Der `/admin`-Link hängt am PRÄDIKAT, nicht am Riegel** (§3.6.3 Punkt 4, NS-Z6):
`istRadioAdmin(await viewerOderNull())`, **nicht** `requireRadioAdmin()` — ein werfender Riegel
schickte **jeden anonymen Scan** nach `/login` statt aufs Gate. ⚠️ **Und es ist ein Link, kein
Redirect**: Kapitel 1 `:277` schreibt „ein radio-admin wird nach `/admin` geleitet"; **§3.6.3 Punkt 3
(`:2908-2931`) sticht** — „Ein `radio`-Admin bekommt über `weg: "suite"` Zugang zur Ausleihe —
**nicht als Admin**." Ein Redirect würfe eine Person, die gerade ein Funkgerät ausleihen will, aus
der Ausleihe heraus.

### Die zwei antd/RSC-Fallen auf dieser Fläche (§3.6.3, `:2927-2931`)

* **Falle 1** — die Seite ist eine **Server Component**: ⛔ kein `Typography.Title`, kein
  `Form.Item`, kein `Input.TextArea`. Überschrift als nacktes `<h1>`.
* **Falle 7** — ⛔ **kein `@ant-design/icons`**, in keiner Datei dieses Moduls (Entscheidung E5).
* Das **Codefeld braucht ohnehin eine `"use client"`-Insel** wegen `useActionState` — daher
  `_ui/GateFormular.tsx` (Entscheidung E10, **Name in diesem Plan vergeben**, nicht in der Spec).
* ⛔ **Keine `<Shell>`** (Entscheidung E9, NS-Z5). Das Gate erbt `controlHeight: TAP = 56`
  (`theme.ts:50-51`); ⛔ **`size` wird auf keinem Bedienelement gesetzt** (Falle 4: `size="large"`
  ist 72).
* ⛔ **Kein `AusleihRahmen`.** Der Rahmen trägt Sitzungsetikett und Fußnavigation — beides setzt
  eine Sitzung voraus, die am Gate gerade fehlt. Er entsteht in A16.

### ⛔ Klausel (f) — die Schließung von Z-L3

`riegel.test.ts:27-38` benennt die Lücke heute und nennt Planteil 3 als Eigentümer:

> „⬜ Z-L3 — WAS AUCH DANACH UNBEWACHT BLEIBT … `page.tsx` UND `layout.tsx` AUSSERHALB von `admin/`.
> Beide Filter unten sind auf `/admin/` verankert … gemessen … ohne jeden Riegel `12 passed`. …
> ⛔ PLANTEIL 3 SCHULDET DIE KLAUSEL ZU SEINEM EIGENEN RIEGEL; hier ist sie nicht vorwegzunehmen,
> weil sie über einer heute leeren Menge leer-grün wäre."

**Die Klausel, ausgeschrieben:**

```ts
/**
 * ⛔ HEUTE EINS (`page.tsx`, das Gate). Angehoben von A18 (3: + `(ausleihe)/layout.tsx`
 * und `(ausleihe)/geraete/page.tsx`), A19 (4) und A20 (5). EXAKT, nicht „mindestens" —
 * dieselbe Begruendung wie bei `HANDLER_ANZAHL` oben.
 */
const AUSLEIH_FLAECHEN_ANZAHL = 1;

describe("(f) jede Ausleih-Flaeche traegt die Riegelform IHRER Art", () => {
  /*
   * ⛔ DIESE KLAUSEL SCHLIESST ⬜ Z-L3 (Kopf dieser Datei, Zeilen 27-38). Sie war dort
   * ausdruecklich NICHT vorwegzunehmen, weil sie ueber einer leeren Menge leer-gruen
   * gewesen waere. Mit Planteil 3 gibt es die Menge.
   *
   * ⛔ `src/app/m/radio/layout.tsx` IST AUSGENOMMEN, UND ZWAR NAMENTLICH. Die
   * Wurzel-Huelle traegt BEWUSST keinen Riegel (Spec §1.3): sie waere Vorfahr auch des
   * Ausleih-Zweigs, und ein Riegel dort schickte jeden anonymen Scan in einen 404. Ein
   * Filter „jede layout.tsx ausserhalb admin/" waere gegen die verbindliche Bauform
   * ROT-BY-CONSTRUCTION — dieselbe Fehlerform, die B7 (Spec:96) an einem anderen Namen
   * schon einmal abgeraeumt hat. (Klausel (a) faengt diese Datei aus demselben Grund
   * nicht; siehe `riegel.test.ts:313-315` — dort steht woertlich, dass Klausel (a)
   * `src/app/m/radio/layout.tsx` NICHT faengt und ein Treffer dort rot-by-construction
   * waere. `:302-307` ist nur `inRouteGroup`.)
   *
   * ⛔ ZWEI ARTEN, ZWEI FORMEN — und die NEGATIVE Haelfte traegt hier genauso wie die
   * positive:
   *
   *   das GATE (`page.tsx` direkt unter `m/radio/`, AUSSERHALB von `(ausleihe)`):
   *       requireRadioHost(   UND   ausleihZugangOderNull(
   *       ⛔ NICHT requireAusleihZugang( — die leitet bei fehlendem Cookie auf `/` um,
   *          und das IST diese Seite: ein ENDLOSER REDIRECT (Spec:2409, §3.5.5).
   *
   *   jede Flaeche UNTER `(ausleihe)/` (layout.tsx und page.tsx):
   *       requireAusleihZugang(
   *       ⛔ NICHT requireRadioHost( — NS-Z1 und Pflicht 16
   *          (`docs/radio-portierung-analyse.md:973-977`): das Praedikat ruft ihn INTERN
   *          als erste Anweisung; ein zweiter Aufruf behauptet, es sei host-blind, und
   *          macht aus „hostgebunden durch Konstruktion" eine vergessliche Liste
   *          (Spec:2686-2691, §4.2.1 Spec:3409-3413).
   *
   * ⚠️ WAS SIE NICHT BELEGT: dass ein Riegel bei einem echten Abruf GREIFT (⬜ A-L9,
   * Erbe von Z-L1). Sie belegt, dass eine BAUFORM eingehalten ist.
   */
  const AUSLEIH_FLAECHEN = () =>
    quellDateien().filter((p) => {
      const kurz = kurzPfad(p);
      if (/\/admin\//.test(kurz)) return false;                       // (a)/(e) decken das ab
      if (kurz.endsWith("src/app/m/radio/layout.tsx")) return false;  // die Wurzel-Huelle, Spec §1.3
      return /\/(?:page|layout)\.tsx$/.test(kurz);
    });

  it("die Flaechenzahl steht EXAKT auf dem Stand dieses Planteils", () => {
    expect(
      AUSLEIH_FLAECHEN().length,
      "AUSLEIH_FLAECHEN_ANZAHL anheben — der Fahrplan steht im Kopf dieser Datei",
    ).toBe(AUSLEIH_FLAECHEN_ANZAHL);
  });

  it("das Gate traegt Host UND Praedikat, und NICHT den umleitenden Riegel", () => {
    const gate = AUSLEIH_FLAECHEN().filter((p) => !/\/\(ausleihe\)\//.test(kurzPfad(p)));
    expect(gate.length, "das Gate fehlt — der Fall waere leer-gruen").toBe(1);
    const q = ohneKommentareUndZeichenketten(readFileSync(gate[0]!, "utf8"));
    expect(q, "kein requireRadioHost( auf dem Gate").toMatch(/\brequireRadioHost\s*\(/);
    expect(q, "kein ausleihZugangOderNull( — das Gate braucht das PRAEDIKAT (§3.5.5)")
      .toMatch(/\bausleihZugangOderNull\s*\(/);
    expect(q, "requireAusleihZugang( auf dem Gate ist ein ENDLOSER REDIRECT (Spec:2409)")
      .not.toMatch(/\brequireAusleihZugang\s*\(/);
    // ERST DER HOST, DANN DAS PRAEDIKAT — zeichengleich zu Klausel (a) und (e).
    expect(q.search(/\brequireRadioHost\s*\(/))
      .toBeLessThan(q.search(/\bausleihZugangOderNull\s*\(/));
  });

  it("jede Flaeche unter (ausleihe)/ traegt requireAusleihZugang und NICHT den Host-Riegel", () => {
    const verstoesse: string[] = [];
    for (const pfad of AUSLEIH_FLAECHEN().filter((p) => /\/\(ausleihe\)\//.test(kurzPfad(p)))) {
      const kurz = kurzPfad(pfad);
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
      if (!/\brequireAusleihZugang\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: kein requireAusleihZugang( (§4.2.1, Spec:3401-3407)`);
      }
      if (/\brequireRadioHost\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: ruft requireRadioHost( ein zweites Mal (NS-Z1, Pflicht 16)`);
      }
      if (/\brequireRadioAdmin\s*\(|\brequireRadioVerwaltung\s*\(/.test(q)) {
        verstoesse.push(`${kurz}: ein Verwaltungsriegel auf der anonymen Ausleihflaeche`);
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
```

⛔ **Und der Kopfkommentar von `riegel.test.ts` wird nachgezogen, nicht gelöscht:** der Z-L3-Absatz
(`:27-38`) bekommt eine Schlusszeile „**Geschlossen in Planteil 3, Aufgabe A11, durch Klausel (f)**"
und der Klauselüberblick (`:22-25`) eine Zeile `(f)`. Die **Messung** darin (`12 passed` ohne jeden
Riegel) bleibt stehen — sie ist der Beleg, warum die Klausel existiert.

- [ ] **Schritt 1: Klausel (f) schreiben und den Fehlschlag sehen**

Die Klausel landet **vor** `page.tsx`. Erwartet: **rot** mit `0 !== 1` („die Flächenzahl steht
EXAKT…") und `0` beim Gate-Fall. ⛔ **Das ist der erwartete Zustand** und der Beweis, dass die
Klausel über einer leeren Menge nicht leer-grün ist — genau das, was `riegel.test.ts:27-38` als
Grund nennt, sie nicht vorwegzunehmen. Zitiere beide Meldungen.

- [ ] **Schritt 2: `page.tsx`, `_ui/GateFormular.tsx`, `_ui/ausleihe.module.css` schreiben**

**`page.tsx`** (Server Component):
1. `const kopf = await headers(); requireRadioHost(kopf);` — erste zwei Anweisungen.
2. `const zugang = await ausleihZugangOderNull(getDb());`
3. `if (zugang) redirect("/geraete");` ⛔ **nicht in einem `try`/`catch`.**
4. `grund` aus `searchParams` durch `istGateGrund`; bei `"zuviele"`: `gateGesperrt(clientIpAus(kopf))`
   **selbst** fragen.
5. `<h1>Funkgeräte</h1>` (nacktes Element, Falle 1), Meldung in
   `role="status" aria-live="polite"`, dann `<GateFormular fehlerText={…} />`.
6. `const viewer = await viewerOderNull(); if (istRadioAdmin(viewer)) …` → Link nach `/admin`.
7. ⛔ **`export const dynamic = "force-dynamic";`** — die Seite liest Cookies und Kopfzeilen; ein
   statisch vorgerendertes Gate zeigte allen dieselbe Antwort (§4.7 setzt dasselbe für die drei
   Ausleihseiten, `:3827`).

**`_ui/GateFormular.tsx`** (`"use client"`): `useActionState<GateZustand, FormData>(einloesenAmGate,
{})`, ein antd `Input` (⛔ **`size` nicht setzen**), ein antd `Button`, der Fehlertext aus dem
Zustand. ⛔ **Die Action wird DIREKT IMPORTIERT**, nicht als Prop durchgereicht (Falle 9:
Funktionen dürfen die RSC-Grenze nicht überqueren; Server Actions sind die einzige Ausnahme, und
auch nur direkt importiert). Vorbild einer vollständigen Client-Insel:
`src/app/m/qr/admin/preset-form.tsx` (314 Zeilen, importiert von `admin/page.tsx:5`, gerendert
`:148`, nimmt nur serialisierbare Props).

**`_ui/ausleihe.module.css`**: der Gate-Teil — Seitenbreite, Typografie, `touch-action: manipulation`
auf Bedienelementen. ⛔ **Eigene CSS-Variablen, nicht `--ant-*`** (Falle 2: antd deklariert seine
Variablen auf seiner Scope-Klasse, eigenes Markup sieht sie nicht, **und der Fehler ist still**).

- [ ] **Schritt 3: `page.test.tsx` schreiben**

⛔ **NICHT über `test-dom.tsx`, und der Grund ist die Bauform.** `page.tsx` ist eine **async Server
Component**, die `await headers()` ruft und `redirect()` wirft; `mount()` aus
`src/app/m/qr/_lib/test-dom.tsx` treibt das nicht an, und `redirect()`s geworfener Sentinel braucht
den `next/navigation`-Mock. ✅ **Wiederverwende das Mock-Gerüst aus A7** (`vi.mock("next/headers")`,
`vi.mock("next/navigation")`, `vi.mock("@/core/auth")`) und rufe die Seitenfunktion **direkt** auf.
`test-dom.tsx` bleibt richtig für die **Client-Inseln** (`GeraeteListe`, `AusleihVorgang`,
`RueckgabeDialog`) — ⛔ **und dort gilt weiterhin: kein zweites Harness erfinden** (`CLAUDE.md`).

Mindestens:

| Testname | Aussage |
|---|---|
| „ohne Zugang rendert das Codefeld und leitet NICHT um" | §3.3.5, Zeile „gesperrt, auf page.tsx" — der Regelfall der Seite |
| „mit Zugang leitet sie auf /geraete um" | Entscheidung E1 |
| „liest die Kopfzeilen genau einmal" | kein doppelter Host-Riegel (§4.2.1) |
| „zeigt den /admin-Link nur bei istRadioAdmin, und als Link, nicht als Redirect" | §3.6.3 Punkt 3 und 4, NS-Z6 |
| „ein unbekannter grund erzeugt keine Meldung" | §3.3.4, kein Rückfalltext |
| „bei grund=zuviele fragt die Seite die Schranke selbst" | §3.3.4 — die Zahl wandert nicht über die URL |

- [ ] **Schritt 4: Drei Sonden an Klausel (f)**

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A11a** | `requireRadioHost` aus `page.tsx` entfernen | „das Gate traegt Host UND Praedikat" |
| **S-A11b** | `ausleihZugangOderNull` in `page.tsx` durch `requireAusleihZugang` ersetzen | derselbe Fall, zwei Verstöße — ⛔ **und schreib in den Bericht, dass das im Betrieb ein endloser Redirect wäre** |
| **S-A11c** | eine leere `src/app/m/radio/(ausleihe)/layout.tsx` **ohne jeden Riegel** anlegen | „die Flaechenzahl steht EXAKT …" (`2 !== 1`) — ⛔ **und das ist die Gegenprobe zu Z-L3: vor dieser Aufgabe lief genau diese Datei mit `12 passed` durch** (`riegel.test.ts:27-38`). ⚠️ Danach **löschen** (`rm`), nicht nur `git checkout` |

- [ ] **Schritt 5: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
rtk pnpm vitest run src/app/m/radio/
```

⚠️ **Erwarteter Zwischenzustand, kein Mangel:** zwischen A11 und A18 landet ein berechtigter
Besucher auf `/geraete` in einer sauberen **404** — die Datei entsteht erst in A18.
`routen.test.ts` sichert den **Rewrite** zu, nicht die Existenz einer Datei (`routen.test.ts:15-17`
schreibt genau das aus). **Schreib das in den Bericht**, damit der Review es nicht als Fund meldet.

```bash
rtk git add src/app/m/radio/page.tsx src/app/m/radio/page.test.tsx \
            src/app/m/radio/_ui/GateFormular.tsx src/app/m/radio/_ui/ausleihe.module.css \
            src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): das Gate an / — und Klausel (f) schliesst Z-L3"
rtk git show --stat HEAD
```

⛔ **Ab hier ist keine Fläche dieses Moduls mehr unbewacht.** Klausel (a) deckt die
Verwaltungshüllen, (c) die Route Handler, (e) die Verwaltungsseiten, (f) das Gate und den
Ausleihzweig, `_actions/guards.test.ts` die Actions.

---

# BLOCK B — DIE FLÄCHE (Spec-Kapitel 4, `:3287-4136`)

> Neun Aufgaben. Erst die reinen Funktionen (`_lib/`), dann die Datenschicht (`_db/leihen.ts`),
> dann der Rahmen, dann die vier Actions, dann die drei Seiten mit ihren Client-Inseln.
> ⛔ **Die reinen Funktionen stehen VOR der Datenschicht** — `_db/leihen.ts` (A15) konsumiert A12,
> A13 und A14; die Begründung steht unter der Reihenfolge-Tabelle.
>
> ⛔ **Block B hängt vollständig an Block A.** Jede seiner Flächen ruft `requireAusleihZugang` aus
> **A7**, jede steht unter **Klausel (f)** aus **A11**, und ohne **A11** gibt es keinen Weg auf sie.
> A12–A15 hängen technisch an keiner Aufgabe aus Block A und könnten formal vorgezogen werden —
> **tu das nicht**: eine `(ausleihe)/`-Fläche vor A11 wäre **unbewacht**.
>
> ⛔ **WAS BLOCK B ANDERS FÜHRT ALS BLOCK A — benannt, nicht still.** Block A (A1–A11) gibt jede
> Testdatei als **vollständigen Code** aus und benennt zu **jedem** Fall die rotmachende Mutation.
> **Block B gibt Testnamen mit ihrer Aussage, aber keinen Testcode**, und die benannten Sonden
> decken nicht jeden Fall ab. Das ist eine **Auslassung mit Ansage**, keine Leerstelle:
> ⬜ **Für A12–A20 benennt der AUSFÜHRENDE die rotmachende Mutation je Testfall — im Bericht, VOR
> dem Tor der jeweiligen Aufgabe.** ⛔ Ein Fall ohne benannte Mutation gilt als ungeprüft; er ist die
> Form, gegen die dieser ganze Weg antritt („ein Wächter, der `>= 5` statt `= 6` prüft, bleibt grün
> und bewacht nichts").
>
> **Fachliche Quelle:** der heutige Kiosk `radio-inventar/apps/frontend/src` @ `f883ec4` (`:3290`).
> ⚠️ **Zitierweise in diesem Block:** „Falle N" ohne Zusatz meint immer die **zwölf Suite-Fallen aus
> `iuk-suite/CLAUDE.md`** (`:3307-3310`), nicht die lagerbuch-Zählung.

---

## Aufgabe A12: Zeit und Status — `_lib/anzeige.ts` und `_lib/status.ts`

**Files:** Create `_lib/anzeige.ts`, `_lib/anzeige.test.ts`, `_lib/status.ts`, `_lib/status.test.ts`

**Interfaces:**
- Produces: `uhrzeit()`, `datumMitUhrzeit()` — gelesen von **A15** (fertige Zeichenketten) und
  **A18–A20**; `statusTon()`, `statusEtikett()` — gelesen von `_ui/StatusChip.tsx` (**Server**,
  A16) **und** von den Client-Zeilen (**A18**).

⛔ **Beide Dateien tragen KEIN `"use client"`** (Falle 6) — `status.ts` wird von einer Server
Component **und** von einer Client-Insel gelesen (`:3336`, Dateitabelle `:515`); ein Wert aus einem
Client-Modul käme in der Server Component nicht an: HTTP 500 für die ganze Seite, **und Vitest kann
es strukturell nicht sehen**. `riegel.test.ts:684-703` setzt das durch.

### `_lib/anzeige.ts` — was an einer Uhr hängt, entsteht auf dem SERVER (§4.1 Punkt 1, `:3330-3332`)

Sonst entscheiden Server und Client an der Tagesgrenze **verschieden**, und zwar **systematisch
gegen die Zone des Endgeräts**. Zone: **Europe/Berlin**, explizit — ⛔ **nicht über `TZ`**, die
Voraussetzungstabelle des Leitplans (`:118`) führt `TZ=Europe/Berlin` ausdrücklich als **nicht
gesetzt**.

| Testname | Aussage |
|---|---|
| „formatiert 23:30 UTC als Berliner Datum des Folgetags" | Zonenrechnung, serverseitig (`:4030`) |
| „rechnet auch im Winter richtig" | Sommer-/Winterzeit — ein fester Offset von +2 wäre im Januar falsch |

### `_lib/status.ts` — der eigene Chip (Entscheidung E3, §4.6.2, `:3671-3697`)

```ts
export type GeraeteStatus = /* ⬜ A-L13 — die Union, siehe unten */;
export type StatusTon = "frei" | "vergeben" | "defekt" | "wartung";
export function statusTon(status: GeraeteStatus): StatusTon;
export function statusEtikett(status: GeraeteStatus): string; // "Verfügbar" | "Ausgeliehen" | "Defekt" | "Wartung"
export const STATUS_HEX: Record<StatusTon, { hell: string; dunkel: string }>;  // ⬜ A-L10
```

⛔ ⬜ **A-L13 — `GeraeteStatus` GIBT ES NICHT, und diese Aufgabe legt ihn an.** Gemessen:
`grep -rn "GeraeteStatus" src/app/m/radio/` → **null Treffer**; `_db/schema.ts:30` führt
`status: text("status")` als **nullable Textspalte ohne `enum`**, und `_db/schema.ts:255-264`
exportiert zehn Typen, keiner davon `GeraeteStatus`. **Er wird hier deklariert und exportiert**,
und die Signaturen in `_db/leihen.ts` (A15) importieren ihn von hier.

⛔ **Zwei getrennte Fragen, und nur die zweite ist offen:**

1. **Die Werte der Union** — abzulesen aus dem Alt-Bestand (`radio-admin/server/src/db/schema.ts`
   bzw. `radio-inventar/.../StatusBadge.tsx:23-53`, dieselbe Datei wie A-L10). ⛔ **Ablesen, nicht
   raten**, und die Belegzeile mit `datei:zeile` steht am Typ.
2. **Was `null` bedeutet** — die Spalte ist nullable, und **kein Dokument sagt, wie ein
   `status = NULL` auf der Fläche aussieht** (eigener Ton? Rückfall auf „frei"? fünfter
   Union-Zweig?). ⛔ **Betreiberentscheidung.** Bis sie fällt, steht die Frage als benannte
   Leerstelle am Typ; ⛔ **kein stiller Rückfall auf „frei"** — der ließe ein Gerät ohne Status
   als ausleihbar erscheinen. Der Testfall „jeder der vier Zustaende hat Etikett UND Ton" sagt zu
   `null` heute **nichts**; wer die Antwort einträgt, ergänzt ihn.

⬜ **A-L10:** die vier Hexwerte kommen **wörtlich** aus
`/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/src/components/features/StatusBadge.tsx:23-53`
— ⛔ **nicht aus antd-Tokens abgeleitet** (`:3690-3693`). ⚠️ **Sie stehen als `STATUS_HEX` in
DIESER Datei** (sonst hat der Farbfall in A12 kein Prüfobjekt und die Sonde kein Ziel); **A16 liest
sie von hier** und schreibt sie als **eigene CSS-Variablen** ins Modul-Stylesheet, ⛔ **nicht als
`--ant-*`** (Falle 2). **Lies sie beim Bau ab und trag sie hier ein.**

| Testname | Aussage |
|---|---|
| „kein Statuston benutzt colorError oder colorPrimary" | ⛔ **Falle 3**: `colorError === colorPrimary === FARBEN.rot` (`src/core/theme/theme.ts:32-33`). Ein `Tag color="error"` für „Defekt" sähe aus wie der Knopf, den man drücken soll. ⛔ **Der Import ist `@/core/theme/tokens`, nicht `@/core/theme`** — `FARBEN` liegt in `src/core/theme/tokens.ts` (`theme.ts:2` importiert es von dort), und ein `src/core/theme/index.ts` existiert **nicht** (gemessen). ⛔ **Und der Fall braucht ein Prüfobjekt in DIESER Aufgabe:** die vier Hexwerte werden deshalb **in `_lib/status.ts` geführt und exportiert** (`export const STATUS_HEX: Record<StatusTon, { hell: string; dunkel: string }>`), nicht erst im Stylesheet. **A16 liest sie von dort** und schreibt sie als CSS-Variablen ins Modul-Stylesheet — eine Quelle, zwei Orte, und der Test kann in A12 gegen `FARBEN.rot` vergleichen. ⚠️ Ohne das hätte der Fall in A12 **nichts** zu vergleichen und die Sonde kein Ziel |
| „jeder der vier Zustaende hat Etikett UND Ton" | Vollständigkeit über die Union — ⛔ **die Zahl 4 steht als eigene Zusicherung außerhalb der Schleife**, sonst schrumpft die Menge lautlos |
| „der Statuspunkt ist nicht der einzige Traeger" | Quelltext-Scan über `_ui/StatusChip.tsx` (A16): jeder Chip trägt ein **Etikett**, der Punkt ist `aria-hidden` und 10px (`:3694-3697`) — ⚠️ **dieser Fall wandert nach A16**, wenn `StatusChip.tsx` noch nicht existiert; **dann als Zusage dorthin schreiben, nicht streichen** |

- [ ] Schritt 1–4 wie gehabt: Tests, Sonden (**S-A12a**: einen Hexwert in `STATUS_HEX` auf
  `FARBEN.rot` setzen → „kein Statuston benutzt colorError"; **S-A12b**: einen der vier Zustände aus
  `statusEtikett` entfernen → „jeder der vier Zustaende hat Etikett UND Ton"; **S-A12c**: in
  `datumMitUhrzeit` die Zone auf `UTC` festnageln → „formatiert 23:30 UTC als Berliner Datum des
  Folgetags"), Implementierung, Tor.
  ⚠️ **Die Sonden tragen die Nummer IHRER Aufgabe** — im ersten Entwurf dieses Plans liefen A12–A15
  um eine Aufgabe versetzt (`S-A13*` in A12 usw.), und ein Bericht „S-A14a rot" war dann keiner
  Aufgabe eindeutig zuzuordnen.

```bash
rtk git add src/app/m/radio/_lib/anzeige.ts src/app/m/radio/_lib/anzeige.test.ts \
            src/app/m/radio/_lib/status.ts src/app/m/radio/_lib/status.test.ts
rtk git commit -m "feat(radio): Zonenrechnung auf dem Server und die vier Statustoene"
```

---

## Aufgabe A13: Suche und Auswahl — `_lib/filter.ts` und `_lib/auswahl.ts`

**Files:** Create `_lib/filter.ts`, `_lib/filter.test.ts`, `_lib/auswahl.ts`, `_lib/auswahl.test.ts`

**Interfaces:**
- Produces: `normalisiereSuchtext`, `filtereGeraete`, `gruppiereNachStandort` — von der **RSC-Seite**
  (zur Vorberechnung des `suchschluessel`) **und** von der Client-Insel gelesen;
  `auswahlLesen`, `auswahlSchreiben` — von der RSC-Seite **und** von der Insel (`router.replace`).

⛔ **Beide ohne `"use client"`** (Falle 6, Dateitabelle `:513`, `:519`).

### `_lib/filter.ts` (§4.5, `:3596-3637`)

**Bestandsverhalten, das wörtlich mitwandert** (`:3600-3617`, Alt-Quelle
`radio-inventar/apps/frontend/src/lib/device-filter.ts`):

* `normalizeSearchText`: klein, **NFD**, Diakritika weg, **`ß` → `ss`** (`:24-31`).
* **„alle Begriffe müssen treffen"** (`terms.every`, `:40`).
* Vier Statusfilter: `ALL` / `AVAILABLE` / `ON_LOAN` / `UNAVAILABLE` — ⛔ **der letzte fasst
  `DEFECT` + `MAINTENANCE` als „Defekt·Wartung" zusammen**.
* Sortierung nach Statuspriorität `AVAILABLE → ON_LOAN → DEFECT → MAINTENANCE`.
* Gruppierung: benannte Standorte **de-alphabetisch** (`:87`), **„Ohne Standort" zuletzt**
  (`:90-92`); **eine einzige Gruppe flach ohne Kopfzeile**; bei aktivem Suchtext **alle Gruppen
  offen, Köpfe unklickbar**.

⛔ **Die Suche läuft im CLIENT, die Grundmenge kommt vom Server — Ausnahme Seriennummer**
(§4.5.2, `:3620-3637`). Begründung: unter hundert Geräten ist Client-Filterung sofort und netzlos;
ein Server-Roundtrip je Tastendruck wäre auf dem Telefon spürbar. Die Seriennummer **wandert nicht
in den Client** (§4.1 Punkt 2) — deshalb liegt die Normalisierung **serverseitig als
`suchschluessel`-Vorberechnung**, nicht als Suchendpunkt. ⛔ **Der Suchtext steht NICHT in der
URL** — flüchtig, weil ein Rufname oder Entleihername im geteilten-Telefon-Verlauf eine unnötige
Spur wäre. **Nur `?geraete=` ist URL-Zustand.**

⚠️ **Falle № 10 der Analyse** (`docs/radio-portierung-analyse.md:1360-1373`): „in der **Rückgabe**
wird über `callSign` UND `borrowerName` gesucht … in der **Übersicht** über `callSign`,
`deviceType`, `serialNumber`, `location` — dort kommt der Entleiher **nicht** vor." *Kein Gate:*
„ohne Umlaut-Testdaten sieht das kein Test." ⛔ **Die Testdaten dieser Aufgabe tragen Umlaute und ein
`ß`.**

| Testname | Aussage |
|---|---|
| „findet Mueller ueber muller und Strasse ueber strasse" | `normalisiereSuchtext` 1:1 aus `device-filter.ts:24-31` (`:4045`) — ⛔ **die Testdaten selbst tragen „Müller" und „Straße" mit Umlauten**; nur der **Testname** ist umlautfrei |
| „verlangt, dass ALLE Begriffe treffen" | `terms.every` (`:40`) |
| „legt Geraete ohne Standort in die letzte Gruppe" | `:90-92` |
| „sortiert benannte Standorte nach de-Kollation" | `:87` |
| „der Statusfilter UNAVAILABLE fasst DEFECT und MAINTENANCE zusammen" | `:3612-3614` |
| „findet ueber den Suchschluessel, was nicht als Feld mitreist" | §4.5.2 — die Seriennummer |

### `_lib/auswahl.ts` (§4.3.3, `:3466-3488`)

```ts
export function auswahlLesen(rohwert: string | string[] | undefined): string[]; // dedupliziert, max 20
export function auswahlSchreiben(ids: string[]): string;                        // stabile Reihenfolge
```

⛔ **EIN Parameter `geraete`, kommagetrennt** (`/ausleihen?geraete=abc,def`), **nicht wiederholt** —
Typ statt drei Fällen, URL bleibt QR-tauglich kurz, stabile Reihenfolge für einen billigen Vergleich
in `router.replace`. Heute (Alt-Kiosk) ist es `deviceIds`, im Client normalisiert
(`routes/loan.tsx:12-31`); **Next liefert dieselbe Zweideutigkeit** `string | string[] | undefined`.

⛔ **Deckel 20, neu und sichtbar:** „Höchstens 20 Geräte in einem Vorgang." (heute kein Deckel — 200
IDs wären 200 POSTs).

| Testname | Aussage |
|---|---|
| „dedupliziert, haelt die Reihenfolge und deckelt bei 20" | §4.3.3 (`:4028`) |
| „liest ein Array aus searchParams ohne zu werfen" | die `string \| string[]`-Falle |
| „auswahlSchreiben und auswahlLesen sind zueinander invers" | die Kopplung — sonst laufen Seite und Insel auseinander |

- [ ] Schritt 1–4. Sonden: **S-A13a** `ß → ss` aus `normalisiereSuchtext` entfernen → „findet
  Mueller ueber muller und Strasse ueber strasse"; **S-A13b** `terms.every` durch `terms.some`
  ersetzen → „verlangt, dass ALLE Begriffe treffen"; **S-A13c** den 20er-Deckel entfernen →
  „dedupliziert, haelt die Reihenfolge und deckelt bei 20".

```bash
rtk git add src/app/m/radio/_lib/filter.ts src/app/m/radio/_lib/filter.test.ts \
            src/app/m/radio/_lib/auswahl.ts src/app/m/radio/_lib/auswahl.test.ts
rtk git commit -m "feat(radio): die akzenttolerante Suche und die Auswahl in der URL"
```

---

## Aufgabe A14: Die Konfliktsprache — `_lib/meldungen.ts`

**Files:** Create `_lib/meldungen.ts`, `_lib/meldungen.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: ⛔ **die zwei Ergebnistypen `AusleihErgebnis` und `RueckgabeErgebnis` MIT ihren
  `grund`-Unions (Entscheidung E11)** und die Sätze dazu — gelesen von **A15** (`bucheAusleihe`/
  `bucheRueckgabe` geben sie zurück), **A17** (die Actions re-exportieren sie) **und** von den
  Flächen. ⛔ **Kein `"use client"`, kein `"use server"`** (Falle 6, `:517`): „Aktion und Fläche
  müssen dieselbe Wahrheit lesen." Hauspräzedenz: `lagerbuch/_lib/actionTypen.ts`.

⛔ **Lies Entscheidung E11 im Kopf dieses Plans, bevor du beginnst.** Sie begründet, warum die Typen
hier liegen und nicht — wie Spec `:3446-3455` schreibt — in `_actions/ausleihe.ts`: dort entstünde
ein Zyklus mit `_db/leihen.ts`. ⛔ **`betroffen[].status` darf dabei nicht verloren gehen**
(Spec `:5223-5228`).

### Der Befund und die Entscheidung (§4.3.5, `:3518-3552`)

**Bestand:** sechs fachliche Ausgänge am Master (`loanApi.ts:158-198`: `device_not_found` 404,
`device_not_loanable` 409, `device_not_available` 409, `device_already_on_loan` 409,
`loan_already_returned` 409, `loan_not_found` 404) werden zu vier, dann zu **zwei** Sätzen gefaltet
(`loans.repository.ts:98-107`, `lib/error-messages.ts:24-26`, `:65-67`): „Dieses Gerät ist bereits
ausgeliehen oder nicht verfügbar." — **ohne Rufname, ohne Unterscheidung**.

**Entscheidung: keine HTTP-Codes mehr, sondern typisierte `grund`-Werte, jeder mit eigenem Satz,
Rufname im Satz.**

| Fachlicher Ausgang | künftig (Bildschirmtext) |
|---|---|
| Gerät inzwischen vergeben | „41/12 ist inzwischen an Anna Beispiel ausgeliehen. Es wurde nichts gebucht." |
| Gerät auf Defekt/Wartung | „41/12 steht auf Defekt und kann nicht ausgeliehen werden." |
| Gerät nicht mehr ausleihbar gestellt | „41/12 ist zurzeit nicht zum Ausleihen freigegeben." |
| Gerät existiert nicht mehr | „41/12 steht nicht mehr in der Liste. Die Liste wurde aktualisiert." |
| Ausleihe existiert nicht mehr | „Diese Ausleihe gibt es nicht mehr. Die Liste wurde aktualisiert." |
| Ausleihe war schon zurückgegeben | „41/12 wurde zwischenzeitlich von jemand anderem zurückgegeben." |
| Verbindung / Server | wörtlich übernommen, **ergänzt um** „Es wurde **nichts** gebucht." (§4.7) |

⛔ **Zwei Regeln (`:3547-3552`):**
1. **Der Rufname steht IM SATZ** — bei mehreren Geräten ist der Satz sonst unbrauchbar.
2. ⛔ **Keine technische Kennung erscheint** — `grund` ist **interner Schlüssel, nie
   Bildschirmtext** (`api/loans.ts:8-12`).

Dazu die drei Störungssätze aus §4.7 (`:3798-3806`):

| Störung | Bildschirmtext |
|---|---|
| Browser offline (Funkloch) | „Keine Verbindung. Die Ausleihe ist **nicht** gespeichert. Bitte erneut versuchen." |
| Schreibsperre auf SQLite | „Gerade ist zu viel gleichzeitig los. Bitte in einem Moment erneut versuchen." |
| Leerzustand ohne Geräte | „Es sind noch keine Geräte erfasst. Das erledigt die Verwaltung." (§4.9.6 — ⛔ **Satz ohne Verweis**, kein Knopf auf `/admin`: er verletzte die Gegenprobe `docs/design/README.md:420`) |

⛔ **Und zwei Gründe mehr, als die Spec-Unions führen — Entscheidung E13.** `SperrGrund` aus **A7**
(`"sitzung" | "gesperrt"`) wandert in **beide** `grund`-Unions, weil Zusage §3.10 Nr. 8
(`:3235-3236`) verlangt, dass die Fläche die zwei unterscheidet, und die Unions der Spec (`:3449`,
`:3568`) keinen Träger dafür haben. **Lies E13 im Kopf dieses Plans.** Die zwei Sätze:

| `grund` | Bildschirmtext |
|---|---|
| `sitzung` | „Dein Zugang ist abgelaufen. Gib den Code erneut ein — deine Eingaben bleiben stehen." |
| `gesperrt` | „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." |

⚠️ **Der Satz zu `sitzung` sagt ausdrücklich, dass die Eingaben stehen bleiben** — er steht neben
dem Erneuerungsfeld, und ohne diesen Halbsatz tippt der Mensch vorsichtshalber alles neu. ⚠️ **Der
Satz zu `gesperrt` ist derselbe wie in `gateTexte.ts`** und ⛔ **bietet keine Erneuerung an**:
derselbe Code scheitert genauso (Zusage Nr. 8). ⛔ **`betroffen` ist bei beiden `[]`.**

⬜ **A-L11:** die Zeichengrenze der Zustandsnotiz — `LOAN_FIELD_LIMITS.RETURN_NOTE_MAX` des
Alt-Kiosk. Die „500" in Spec `:3573` ist ein **Beispieltext** („0 / 500"), keine zitierte Konstante.
**Lies sie beim Bau aus dem Alt-Repo ab** und trag sie als Eintrag in `_lib/grenzen.ts` oder als
Konstante hier ein — mit Belegzeile.

| Testname | Aussage |
|---|---|
| „jeder grund hat genau einen Satz, und keiner nennt einen Schluessel" | §4.3.5, Vollständigkeit über die Union (`:4031`) — ⛔ **die Zahlen stehen als eigene Zusicherung außerhalb der Schleife, und sie sind ab E13 gesetzt: `AusleihErgebnis` hat SIEBEN Fehlergründe, `RueckgabeErgebnis` SECHS.** Eine Schleife über eine geschrumpfte Menge ist leer-grün |
| „der Satz zum vergebenen Geraet enthaelt den Rufnamen" | §4.3.5, erste Regel (`:4032`) |
| „der Satz zu grund sitzung sagt, dass die Eingaben stehen bleiben" | E13, Zusage §3.10 Nr. 8 — ⛔ **der Halbsatz ist der Grund, warum die Inline-Erneuerung überhaupt hilft** |
| „der Leerzustandssatz nennt keinen Weg in die Verwaltung" | §4.9.6, Gegenprobe `docs/design/README.md:420` |

- [ ] Schritt 1–4. Sonde **S-A14a**: einen Satz durch `Fehler: ${grund}` ersetzen → „keiner nennt
  einen Schluessel". Sonde **S-A14b**: den Rufnamen aus dem Vergabesatz entfernen → „enthaelt den
  Rufnamen". Sonde **S-A14c**: `"sitzung"` aus der `AusleihErgebnis`-Union streichen (E13) →
  „`AusleihErgebnis` hat SIEBEN Fehlergruende, und jeder hat einen Satz".

```bash
rtk git add src/app/m/radio/_lib/meldungen.ts src/app/m/radio/_lib/meldungen.test.ts
rtk git commit -m "feat(radio): die Konfliktsprache — ein Satz je Ausgang, mit Rufname"
```

---

## Aufgabe A15: Die Lese- und Schreibpfade — `_db/leihen.ts`

**Files:**
- Create: `src/app/m/radio/_db/leihen.ts`
- Create: `src/app/m/radio/_db/leihen.test.ts`

**Interfaces:**
- Consumes: `_db/schema.ts` (Planteil 1), `DB` aus `_db/client.ts:26` — **und drei Module aus Block B,
  die deshalb VOR dieser Aufgabe stehen**: `uhrzeit()`/`datumMitUhrzeit()` aus **A12** (die Felder
  `seit` und `seitText` sind **fertige Zeichenketten**, §4.1 Punkt 1), `normalisiereSuchtext` aus
  **A13** (der `suchschluessel` ist eine **normalisierte** Verkettung, §4.5.2) und die zwei
  Ergebnistypen aus **A14** (Spec `:5229-5232`: „**jeder** `grund` braucht dort einen Text").
  ⛔ **Stubbe keines der drei** — Stubs werden nicht ersetzt.
- Produces: `geraeteMitLeihstand`, `offeneAusleihen`, `sucheEntleiher`, `bucheAusleihe`,
  `bucheRueckgabe` — gelesen von **A17** (die vier Actions) und **A18–A20** (die drei Seiten). ⛔ Die
  **sechste** Funktion `leihhistorie` bleibt **Planteil 4**.

⛔ **Lies Entscheidung E2 im Kopf dieses Plans, vollständig, bevor du beginnst.** Sie begründet,
warum diese Datei hier entsteht, obwohl sie in Kapitel 6 ausgeschrieben ist, und sie führt die zehn
Auflagen aus Kapitel 6, die diese Aufgabe nicht verlieren darf. **Die Tabelle dort ist Teil dieser
Aufgabe.**

### Die Signaturen (Spec `:5022-5027`, Feldform `:4082-4088`)

```ts
// src/app/m/radio/_db/leihen.ts
// KEIN "use client", KEIN "use server" — reine Datenzugriffe.
// ALLE nehmen `db` als ERSTEN Parameter (Spec:5015-5019): die Funktion holt sich die
// Verbindung nicht selbst, sonst ist sie im Test nicht gegen eine eigene Datei zu haengen.

export type GeraetMitLeihstand = {
  id: string; rufname: string; geraetetyp: string | null; standort: string | null;
  status: GeraeteStatus; suchschluessel: string;
  entleiher?: string; seit?: string;      // FERTIGE Zeichenketten, KEIN Date
};
export type OffeneAusleihe = { id: string; rufname: string; entleiher: string; seitText: string };
export type Vorschlag = { name: string; zuletztText: string };

/**
 * ⛔ DIE EINGABE DES SCHREIBPFADS — sie existiert im Repo NICHT und wird HIER deklariert
 * (gemessen: `grep -rn "AusleihEingabe" src/app/m/radio/` → null Treffer; die Spec fuehrt
 * den Namen nur als Parameternamen, Spec:5026).
 */
export type AusleihEingabe = {
  geraeteIds: string[];          // aus `auswahlLesen(...)` (A13), Deckel 20
  entleiher: string;             // UNVERAENDERT, ohne `sanitizeForDisplay` (Spec:3587-3592)
  zugangscodeId: string | null;  // ⛔ die HERKUNFT: `zugang.codeId` bei weg "code", `null`
                                 //    bei weg "suite" (Spec:2181-2186). A17 Auflage 9.
};

// `GeraeteStatus` kommt aus `_lib/status.ts` (A12) — ⬜ A-L13, dort deklariert und
// exportiert; ⛔ hier NICHT ein zweites Mal definieren.

export function geraeteMitLeihstand(db: DB): GeraetMitLeihstand[];
export function offeneAusleihen(db: DB): OffeneAusleihe[];
export function sucheEntleiher(db: DB, suchtext: string, deckel = 10): Vorschlag[];
export function bucheAusleihe(db: DB, e: AusleihEingabe): AusleihErgebnis;
export function bucheRueckgabe(db: DB, ausleiheId: string, notiz: string | null): RueckgabeErgebnis;
```

⛔ **Sechs Auflagen, die still verloren gehen, wenn man sie nicht aufschreibt:**

1. **„Höchstens die elf", nicht „genau die elf" (`:5248-5251`).** Das Alt-Lesemodell
   (`loanApi.ts:34-44`) ist die **Obergrenze**; Kapitel 4 schneidet **enger**: die **Seriennummer
   steht nicht in der Zeile**, sondern geht nur in `suchschluessel` ein. Jede Spalte, die weder in
   `loanApi.ts:34-44` noch im Feldsatz oben steht, ist ein Regelbruch. Der Ausfall bei Verletzung
   ist konkret: „wer `geraeteMitLeihstand` als ‚alle Spalten aus `devices`' baut, bekommt eine
   Ausleihe-Fläche, auf der plötzlich Software-Version, Audit-Spalten und `tei` stehen" — die
   Quelltabelle hat **25 Spalten**.
2. **`id` und nicht `issi` ist der Schlüssel**, und **die Begründung wandert als Kommentar mit**
   (`:5243-5246`): „issi is mutable (a device can be reprogrammed) and unsuitable as a foreign key".
   Ohne den Kommentar ist der nächste naheliegende Umbau ein Join auf `issi`.
3. **`bucheAusleihe`: Gerät lesen → `loanable` → `mapDeviceCondition` bleiben die ersten
   Anweisungen, in dieser Reihenfolge, JE GEWÄHLTEM GERÄT INNERHALB der Transaktion** (`:5264-5268`).
   ⚠️ **Es ist verführerisch, das nach dem Wegfall der Grenze als „jetzt ist der Aufrufer ja wir
   selbst" zu lesen — falsch:** der **anonyme Ausleiher** und sein Formular sind unverändert
   unvertraut, und mit Entscheidung 4/10 ist die Fläche sogar **breiter erreichbar** als vorher.
4. **`mapDeviceCondition` ist Fachlogik und wandert MIT TESTABDECKUNG mit** (`:5268-5270`) — die
   einzige Stelle, an der „reserviert", „defekt" und „verfügbar" auseinandergehalten werden.
5. **Der Riegel gegen Doppelbuchen ist der partielle Unique-Index**
   `loans_device_active_uidx` (`_db/migrations/0001_loans_aktiv_uidx.sql`, dem Drizzle-Schema
   **unsichtbar**), **nicht** ein `SELECT` vor dem `INSERT` (`:3457-3464`).
6. **Der gestrichene Ausfall-Puffer `STALE_GRACE_MS` wird als Zeile im Kommentarkopf festgehalten**,
   mit Verweis auf `radio-admin.service.ts:43-48` (`:5410-5415`, `:7104-7105`) — „damit die
   Streichung eine **dokumentierte Entscheidung** bleibt und nicht eine Auslassung, die beim
   nächsten Blick in die Alt-App als ‚vergessen' wiederentdeckt wird". **B15 (`:104`) ist die
   Grundlage: Kapitel 4 und 6 tragen, Kapitel 2/8 sind überholt.** Ersatz sind **WAL und
   `busy_timeout = 5000`** (`src/core/db/index.ts:18`, `:20`) — ⛔ **kein modul-eigener Cache, kein
   modul-eigener Retry.**

### Die Testfälle, mit Namen (Spec `:5254-5258`, `:5272-5279`, `:5420-5435`, `:6700-6710`)

| Testname | Aussage |
|---|---|
| „reicht keine Audit- und keine Software-Spalte an die Ausleihe durch" | ⛔ **`Object.keys()` auf GLEICHHEIT, nicht auf Teilmenge** — „eine Teilmengenpruefung faengt genau den Fall nicht, gegen den der Test steht" (`:5254-5258`). **Zusätzlich**: keiner der Namen `softwareVersion`, `tei`, `createdBy`, `updatedAt` ist darunter |
| „lehnt ein unbekanntes Geraet ab" | `:5272-5279` |
| „lehnt ein nicht verleihbares Geraet ab" | `:5272-5279` |
| „lehnt ein Geraet in nicht verleihbarem Zustand ab und nennt den Zustand in betroffen" | `:5272-5279` |
| „lehnt den zweiten gleichzeitigen Verleih ueber den Unique-Index ab" | `:5272-5279` — ⛔ **über den Index, nicht über ein `SELECT`** |
| „bucht vier Geraete in EINER Transaktion" | §4.3.2 |
| „bucht KEIN Geraet, wenn eines inzwischen vergeben ist" | Alles-oder-nichts |
| „liefert hoechstens `deckel` Vorschlaege und nichts unter zwei Zeichen" | §4.3.4 |
| „eine ueber den Code gebuchte Leihe traegt die Herkunft, eine ueber die Suite gebuchte nicht" | ⛔ **der einzige Test, der `loans.zugangscode_id` überhaupt berührt.** `bucheAusleihe` mit `zugangscodeId: "zc-1"` → die Zeile trägt sie; mit `null` → sie ist `NULL` (Spec `:2181-2186`). **Ohne diesen Fall ist die Spalte tot**, und das Löschverbot aus §3.2.4 (`:2240-2242`, „**Beides oder nichts**") verlöre die Hälfte, die ihm Wirkung gibt |
| „ein Vorschlag traegt name UND zuletztText" | ⛔ **`Vorschlag` ist kein `string`** (`:5029-5035`) — „eine Signatur `string[]` wäre genau der Posten, der beim Port **still** verschwindet" |
| „liest die Geraeteliste waehrend eines offenen Schreibvorgangs" | die WAL-Zusage |
| „wartet auf eine belegte Datenbank, statt sofort zu scheitern" | die `busy_timeout`-Hälfte |

⛔ **Die zwei WAL-Fälle haben eine VERBINDLICHE dreipunktige Bauform (`:5420-5435`, `:6700-6710`),
und die naheliegende Form kann die Zusage nicht halten und ist trotzdem grün:**

1. ⛔ **ZWEI getrennte Verbindungen, nicht eine.** `better-sqlite3` ist synchron und
   verbindungsgebunden: ein Lesen auf **demselben** Handle innerhalb der eigenen offenen Transaktion
   sieht deren eigenen Zustand und kann gar nicht in Konkurrenz geraten. **Ein Test, der eine
   Transaktion öffnet und danach auf derselben Verbindung liest, KANN NICHT ROT WERDEN — er prüft
   nichts.** Also: `const schreiber = openModuleDatabase(pfad)` und
   `const leser = openModuleDatabase(pfad)`; auf dem Schreiber `BEGIN IMMEDIATE` plus ein `INSERT`
   in `loans`, und **auf dem Leser** `geraeteMitLeihstand(leser)`.
2. ⛔ **EINE Datei, kein `:memory:`.** Zwei `:memory:`-Handles sind zwei **verschiedene**
   Datenbanken; der Test liefe an der Frage vorbei. Pfad aus `os.tmpdir()`, im `afterEach` entfernt.
3. ⛔ **Der Test prüft seine eigene Voraussetzung.** Erste Zusicherung:
   `expect(leser.pragma("journal_mode", { simple: true })).toBe("wal")`. Damit hängt die Aussage
   nicht an einer Behauptung über `openModuleDatabase`, sondern **misst** sie — und wenn ein
   späterer Umbau von `src/core/db/index.ts:18` WAL entfernt, fällt **genau dieser Test**, statt
   still weiterzulaufen.

- [ ] **Schritt 1:** `_db/leihen.test.ts` schreiben, mit allen elf Fällen oben und den drei
  Bauform-Auflagen als Kommentar.
- [ ] **Schritt 2:** Vier Sonden:

| Sonde | Änderung | Erwartet rot |
|---|---|---|
| **S-A15a** | `geraeteMitLeihstand` um ein Feld `seriennummer` erweitern | „reicht keine Audit- und keine Software-Spalte durch" — ⛔ **und nur, weil der Test auf Gleichheit prüft; mit einer Teilmengenprüfung bliebe er grün. Zitiere beide Läufe** |
| **S-A15b** | die WAL-Fälle auf **ein** Handle zusammenziehen | ⛔ **erwartet: GRÜN** — das ist der Befund aus `:5420-5424`: „ein Test, der eine Transaktion öffnet und danach auf derselben Verbindung liest, kann nicht rot werden". Zurücknehmen und im Bericht festhalten |
| **S-A15c** | in `bucheAusleihe` den `mapDeviceCondition`-Test entfernen | „lehnt ein Geraet in nicht verleihbarem Zustand ab" |
| **S-A15d** | den `INSERT` je Gerät aus der Transaktion herausziehen | „bucht KEIN Geraet, wenn eines inzwischen vergeben ist" |

- [ ] **Schritt 3:** `_db/leihen.ts` schreiben. ⛔ Kein `"use client"`, kein `"use server"`.
  ⛔ **Kein `RADIO_ADMIN_URL`, kein `api/v1/`** — Abnahmebefehl **wörtlich wie in Spec `:5453`**:
  `rg -n "RADIO_ADMIN_|api/v1/" src/app/m/radio` liefert **nichts**.
  ⛔ **NICHT `grep` ohne `-E`.** Gemessen: `grep` ohne `-E` ist BRE, dort ist `|` ein **literales
  Zeichen** und keine Alternation — der Befehl findet nie etwas, auch wenn beide Zeichenketten
  dastehen, und „liefert nichts" wäre dann **kein Nachweis**. ⚠️ Und **nicht** auf `rtk grep -rnE`
  ausweichen: `CLAUDE.md` führt als roh durchlaufende Formatflags nur `-c, -l, -L, -o, -Z`, `-E`
  ist nicht darunter. `rtk` hat keinen `rg`-Filter; `rg` läuft unverändert durch.
- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
rtk pnpm vitest run src/app/m/radio/_db/
```

```bash
rtk git add src/app/m/radio/_db/leihen.ts src/app/m/radio/_db/leihen.test.ts
rtk git commit -m "feat(radio): die fuenf Lese- und Schreibpfade der Ausleihe"
rtk git show --stat HEAD
```

---

## Aufgabe A16: Der Rahmen — `_ui/ikonen.tsx`, `StatusChip.tsx`, `AusleihRahmen.tsx`, `Restzeit.tsx`

**Files:** Create `_ui/ikonen.tsx`, `_ui/StatusChip.tsx`, `_ui/AusleihRahmen.tsx`,
`_ui/Restzeit.tsx`; Modify `_ui/ausleihe.module.css` (aus A11 erweitern)

**Interfaces:**
- Consumes: `statusTon`/`statusEtikett` (**A12**), `beenden` (**A9**), `AusleihZugang` (**A7**).
- Produces: den Rahmen für **A18–A20** — und ⬜ **L10** entsteht hier.

### Was der Rahmen trägt (§4.2, `:3374-3384`)

* **Wortmarke „Funkgeräte" + Sitzungsetikett** — bei Code-Zugang „Zugang: Code `<bezeichnung>`", bei
  Suite-Sitzung der Anzeigename. **Die Zeichenkette kommt vom Riegel** (A7), nicht aus dem Cookie.
* **Restzeit der Sitzung** als Client-Insel `_ui/Restzeit.tsx`, **gefüttert mit einem
  Server-Zeitstempel**. ⛔ **Die einzige `"use client"`-Datei des Rahmens** — der Rahmen selbst ist
  **Server** (Dateitabelle `:499`).
  ⛔ **Und die erste Darstellung nimmt den SERVERWERT unverändert; der Takt beginnt erst in einem
  Effekt.** Eine Client-Komponente, die `ablauf − Date.now()` **beim Rendern** rechnet, liefert
  serverseitig eine andere Zahl als clientseitig → **Hydrations-Fehlanpassung**. ⚠️ **Kein Tor
  dieses Plans findet das:** `pnpm build` rechnet nicht, und `mount()` in jsdom hat **überhaupt
  keinen Hydrationsschritt** — nur ein echter Abruf zeigt die Warnung. Dieselbe Familie wie
  Suite-Falle 6 und 9: der Fehler entsteht an der RSC-Grenze, und die Testebene sieht sie nicht.
* **Fußnavigation mit DREI Zielen** (Übersicht → `/geraete`, Ausleihen → `/ausleihen`, Zurückgeben →
  `/rueckgabe`), Tap-Maß **64**, Aktivmarkierung als **Server-Prop**
  `aktiv={"uebersicht" | "ausleihen" | "rueckgabe"}` — ⛔ **nicht `usePathname`**
  (Zulässigkeitstafel Zeile 16).
* **Rückweg in die Suite nur MIT Sitzung** — `next/link` aufs Portal für die, die über die Kachel
  kamen; ⛔ **kein Link für QR-Zugänge** (Gegenprobe `docs/design/README.md:420`).
* ⛔ **Kein `signOut`-Formular.** Der sichtbare Abmeldeweg ist `<form action={beenden}>`
  (Zulässigkeitstafel Zeile 15, NS-Z3, Zusage §3.10 Nr. 7) — ⛔ **kein `<Link href="/abmelden">`**:
  Nexts Prefetch beendete die Sitzung beim Darüberfahren.
* ⛔ **Kein `viewport`-Export, kein `manifest.webmanifest`** (§4.9.4, `:3385`).

### ⛔ Die vier Entscheidungen, die hier zusammenkommen

* **E9 — keine `<Shell>`.** Der Rahmen erbt `controlHeight: TAP = 56` (`theme.ts:50-51`);
  ⛔ **`size` wird auf keinem Element gesetzt** (Falle 4: `size="large"` ist 72).
* **E8 — die 64 sind CSS, keine zweite `ConfigProvider`-Ebene.** ⛔ Ein `ConfigProvider` ist eine
  **Client**-Komponente und machte den Server-Rahmen zur Client-Grenze. 44 und 64 als Klassen in
  `_ui/ausleihe.module.css`, plus `min-width` und `touch-action: manipulation`.
  ⛔ **72 wird nirgends gesetzt, 56 wird nirgends geschrieben, nur geerbt.** Die Vererbung von
  `controlHeight: TAP = 56` gilt, weil `AntdProvider` in der **Wurzel**-Hülle sitzt
  (`src/app/layout.tsx:165`, oberhalb jedes Moduls) und `radio` **keine** `FullShell` fährt, die
  `ARBEITSDICHTE: 44` darüberlegte (`src/core/theme/theme.ts:207-209`) — gemessen, nicht angenommen.
  ⚠️ ⛔ **`min-width` gegen antd ist Falle 5, und die ist STILL:** „eigenes CSS gegen antd-CSS
  entscheidet die Spezifität, meist gegen dich … die Regel steht richtig da und greift nur nicht"
  (`docs/design/README.md`). Ein CSS-Modul verengt den **Selektor**, nicht den Spezifitätswettstreit
  gegen antds zur Laufzeit über cssinjs eingespritzte Regeln — **die stehen in keiner Datei dieses
  Repos**. ⛔ **Das wird in einem echten Browser GEMESSEN, nicht behauptet** (Hauslehre
  „UI-Abnahme: messen, nicht schauen", und **immer beide Farbmodi**). Dasselbe gilt für die 44er-
  und 64er-Klassen in A18, A19 und A20.
* **E5 — kein `@ant-design/icons`.** `_ui/ikonen.tsx` mit **Inline-SVG, ohne `"use client"`**,
  Bauform `lagerbuch/_ui/ikonen.tsx`. Von den 18 lucide-Ikonen der Fläche überleben **12**;
  ⛔ **`RefreshCw` fällt weg, obwohl der Knopf bleibt: kein Zeichen, Beschriftung „Aktualisieren"**
  (`:3750-3752`).
* **E3 — der eigene Chip.** `_ui/StatusChip.tsx` ist **Server** (reine Ableitung aus `status.ts`,
  keine Interaktion). Punkt 10px, `aria-hidden`; ⛔ **Farbe ist nie der einzige Träger** — jeder Chip
  trägt sein Etikett.

### ⬜ L10 entsteht hier — und A16 schreibt den Wert selbst hin

> **L10** (`2026-08-18-plan3-radio-generalprobe.md:91`): „Die Zeichenkette aus dem modul-eigenen
> Ausleih-Rahmen (Spec 1 §4.2), die im **Portal**-HTML nicht vorkommt."

Der Cutover-Prüfsatz fährt `curl` gegen den Portal-Host und prüft per `grep -c`, dass diese
Zeichenkette dort **fehlt** — der Beweis, dass der Host-Riegel/Fallback korrekt auf Login fällt
statt auf die Ausleihfläche (`radio-cutover-leitplan.md:266,277,906`).

⛔ **A16 trägt den tatsächlichen Wert als Belegzeile in den Kopf von `_ui/AusleihRahmen.tsx` ein**,
z. B.:

```tsx
/**
 * ⬜ L10 — DIE ZEICHENKETTE FUER DEN CUTOVER-PRUEFSATZ.
 * Der Generalprobe-Prüfsatz (§P.9, `radio-cutover-leitplan.md:266`) prüft per
 * `curl … | grep -c "<WERT>"`, dass diese Zeichenkette im PORTAL-HTML NICHT vorkommt.
 * Der Wert ist: "<hier den tatsaechlich gerenderten Wert eintragen>"
 * ⛔ Wer ihn aendert, aendert einen Cutover-Schritt mit. Dann hier UND im Runbook.
 */
```

⚠️ ⛔ **Trag ihn erst ein, wenn du das Markup gebaut hast — und lies ihn aus dem tatsächlich
gerenderten Ergebnis ab, nicht aus dem Quelltext.** Eine Zeichenkette, die im JSX steht, aber nach
dem Rendern anders aussieht (Whitespace, Entities), macht den Cutover-Schritt still wertlos.

### Die Tests

| Datei | Testname | Aussage |
|---|---|---|
| `_ui/AusleihRahmen.test.tsx` | „traegt kein use client und keinen ant-design-icons-Import" | Quelltext-Scan; Falle 6 und Falle 7 |
| | „die Fussnavigation bekommt aktiv als Prop, nicht ueber usePathname" | Quelltext-Scan: kein `usePathname` in der Datei |
| | „der Abmeldeweg ist ein form action, kein Link auf /abmelden" | Quelltext-Scan: kein `href="/abmelden"`; `<form action={beenden}>` vorhanden |
| | „ein Code-Zugang bekommt keinen Link ins Portal" | `docs/design/README.md:420` |
| | „zeigt bei weg code die bezeichnung, bei weg suite den Namen" | §4.2 |
| `_ui/StatusChip.test.tsx` | „jeder Chip traegt sein Etikett, der Punkt ist aria-hidden" | Farbe ist nie der einzige Träger |
| `_ui/ikonen.test.tsx` | „nennt @ant-design/icons nicht, in keiner Form" | Falle 7 — ⛔ **der Scan läuft über `_ui/` UND `_lib/`, modulweit** |

⚠️ **`src/core/shell/icons.test.ts` riegelt `@ant-design/icons` bereits repo-weit ab.** ⛔ **Lass ihn
im Tor mitlaufen** — geht er rot, liegt die Ursache fast nie in `core/shell`, sondern in der Datei,
die die Fehlermeldung nennt (`CLAUDE.md`, Falle 7).

- [ ] Schritt 1–4. Sonden: **S-A16a** `@ant-design/icons` in `StatusChip.tsx` importieren →
  `icons.test.ts` **und** der eigene Scan rot; **S-A16b** `usePathname` im Rahmen benutzen →
  „bekommt aktiv als Prop"; **S-A16c** `<Link href="/abmelden">` ergänzen → „der Abmeldeweg ist ein
  form action".

```
rtk pnpm typecheck && rtk pnpm lint
rtk pnpm vitest run src/app/m/radio/ src/core/shell/icons.test.ts
```

```bash
rtk git add src/app/m/radio/_ui/ikonen.tsx src/app/m/radio/_ui/StatusChip.tsx \
            src/app/m/radio/_ui/AusleihRahmen.tsx src/app/m/radio/_ui/Restzeit.tsx \
            src/app/m/radio/_ui/ausleihe.module.css \
            src/app/m/radio/_ui/AusleihRahmen.test.tsx src/app/m/radio/_ui/StatusChip.test.tsx \
            src/app/m/radio/_ui/ikonen.test.tsx
rtk git commit -m "feat(radio): der modul-eigene Ausleih-Rahmen ohne Shell, mit Inline-SVG"
```

---

## Aufgabe A17: Die vier Server Actions — `_actions/ausleihe.ts`

**Files:** Create `_actions/ausleihe.ts`, `_actions/ausleihe.test.ts`;
Modify `_actions/guards.test.ts` (`ACTION_DATEIEN_ANZAHL` **3 → 4**)

**Interfaces:**
- Consumes: `requireAusleihSchreibend` (**A7**), `bucheAusleihe`/`bucheRueckgabe`/`sucheEntleiher`
  (**A15**), `auswahlLesen` (**A13**), die Sätze aus `_lib/meldungen.ts` (**A14**).
- Produces: `ausleiheAnlegen`, `rueckgabeBuchen`, `entleiherVorschlaege`, `listeAktualisieren` —
  gerufen von **A18–A20**, **direkt importiert** (Falle 9).

### Die vier Signaturen (Spec `:3446-3455`, `:3566-3573`, `:3826-3829`)

⛔ **Die zwei Ergebnistypen werden RE-EXPORTIERT, nicht hier deklariert** (Entscheidung E11): sie
leben in `_lib/meldungen.ts` (A14), weil `_db/leihen.ts` sie zurückgibt und diese Datei
`_db/leihen.ts` importiert — eine Deklaration hier wäre ein Zyklus. Die Signaturen unten stehen
wörtlich wie in Spec `:3446-3455`/`:3566-3573` und gelten unverändert.

```ts
"use server";                                        // ⛔ ZEILE 1, ohne Pfadkommentar davor
// src/app/m/radio/_actions/ausleihe.ts
import type { Vorschlag } from "../_db/leihen";
import type { AusleihErgebnis, RueckgabeErgebnis } from "../_lib/meldungen";
export type { AusleihErgebnis, RueckgabeErgebnis };   // E11 — re-exportiert, nicht deklariert

export async function ausleiheAnlegen(_vorher: AusleihErgebnis | null, formular: FormData): Promise<AusleihErgebnis>;
export async function rueckgabeBuchen(_vorher: RueckgabeErgebnis | null, formular: FormData): Promise<RueckgabeErgebnis>;
export async function entleiherVorschlaege(suchtext: string): Promise<Vorschlag[]>;
export async function listeAktualisieren(): Promise<void>;
```

⛔ **In dieser Datei stehen die zwei Typen NUR als Re-Export.** Ein erster Entwurf dieses Plans
führte darunter noch einmal `export type AusleihErgebnis = …` „zur Erinnerung" — das ist
`TS2323 Cannot redeclare exported variable` / `TS2300 Duplicate identifier`, und ein
`//`-Kommentar über einem Codeblock kommentiert die folgenden Zeilen **nicht** aus. **Wer den Block
kopierte, kopierte einen roten `typecheck`.** ⛔ **Der Wortlaut der zwei Unions steht in A14** (dort,
wo sie deklariert werden), **einmal**.

⛔ **`"use server";` ist ZEILE 1** — der Guard-Scan aus A8 liest `split("\n")[0]`; ein Pfadkommentar
davor macht A17s eigenes Tor rot. Gemessen: alle 20 Dateien unter `lagerbuch/_actions/` tragen sie
in Zeile 1, ausnahmslos.

⛔ **B12 (`:101`): die Datenfunktion heißt `sucheEntleiher`, die Server Action
`entleiherVorschlaege`.** `_actions/ausleihe.ts` **importiert** die eine und **exportiert** die
andere — **gleiche Namen kollidieren in derselben Datei**.

⛔ **Acht Auflagen:**

1. **`requireAusleihSchreibend(getDb())` ist die ERSTE Anweisung jeder der vier Actions**, ⛔ **vor
   jedem Lesen von `formData`** (§4.2.1, `:3405-3407`), und ⛔ **das Ergebnis wird geprüft** — der
   Aufruf ohne Prüfung ist typkorrekt, lint-sauber und öffnet die Action für jeden
   (Zulässigkeitstafel Zeile 10). Der Guard-Scan aus **A8** prüft **beides**.
   ⚠️ **Auch die zwei LESENDEN Actions** (`entleiherVorschlaege`, `listeAktualisieren`) rufen ihn —
   die Ausnahmeliste hat **genau drei** Einträge (Spec `:6762` plus Entscheidung **E12**), und ein
   **vierter** wäre ein **roter Test**. Bei `{ ok: false }` liefert `entleiherVorschlaege` eine
   **leere Liste** und `listeAktualisieren` tut **nichts**.
   ⛔ **Die zwei SCHREIBENDEN Actions reichen den `grund` unverändert an das Formular durch**
   (Entscheidung **E13**): aus `{ ok: false, grund: "sitzung" }` wird
   `{ ok: false, grund: "sitzung", text: …, betroffen: [] }`, aus `"gesperrt"` entsprechend.
   ⛔ **Nicht auf `"unbekannt"` einfalten** — dann verlöre die Fläche genau die Unterscheidung, an
   der Zusage §3.10 Nr. 8 hängt, und die Inline-Erneuerung würde nie oder immer angeboten.
2. ⛔ **Der Host-Riegel wird NICHT zusätzlich gerufen** — `requireAusleihSchreibend` ruft ihn intern
   als erste Anweisung (NS-Z1, §4.2.1 `:3409-3413`). Ein zweiter Aufruf behauptete, das Prädikat sei
   host-blind.
3. ⛔ **`ausleiheAnlegen` bucht in EINER Drizzle-Transaktion, alles oder nichts** (§4.3.2,
   `:3435-3464`). Heute: **N unabhängige POSTs** (`Promise.all(deviceIds.map(...))`,
   `ConfirmLoanButton.tsx:55-59`) — scheitert der dritte von vier, sind drei gebucht, eines nicht,
   und es gibt einen Fehlertoast **ohne Angabe welches**.
4. ⛔ **Rückgabewert statt Wurf.** „Ein Wurf in einer Server Action verliert genau die Information,
   die der Mensch braucht" (`:3457-3460`). Beispielsatz: „Rufname 41/12 ist inzwischen an Anna
   Beispiel ausgeliehen. Es wurde nichts gebucht."
5. ⛔ **Die `useActionState`-Signatur ist bindend** — der erste Parameter ist der vorherige Zustand.
   Ohne ihn bekäme die Funktion zur Laufzeit `FormData` im falschen Parameter; **`pnpm build` sieht
   das nicht** (dieselbe Falle wie bei `einloesenAmGate`, `:2352-2356`).
6. ⛔ **`sanitizeForDisplay` wandert NICHT mit** (`:3587-3592`, Alt-Quellen `ReturnDialog.tsx:58`,
   `ConfirmLoanButton.tsx:52`): React escaped beim Rendern; eine Bereinigung **vor dem Schreiben**
   verändert dauerhaft die gespeicherte Zeichenkette und ist bei „Müller & Sohn" ein **Datenschaden,
   kein Schutz**. Prüfung beim Schreiben: **Länge und Nichtleere**, nicht Umschreiben. — **Zusage an
   das Test-/Cutover-Kapitel** (Feldabgleich).
7. ⛔ **Die Zeichengrenze der Notiz wird SERVERSEITIG erneut geprüft** (`:3583-3585`) — `maxLength`
   am Feld ist eine Bequemlichkeit, keine Zusage. ⬜ **A-L11** für die Zahl.
8. ⛔ **`entleiherVorschlaege`: ab zwei Zeichen, keine Auflistung ohne Suchtext, Antwort trägt nur
   `{ name, zuletztText }`** — kein Gerät, keine Millisekunden, keine ID (§4.3.4, `:3506-3512`).
   ⚠️ **`zuletztText`, nicht `zuletzt`:** Spec `:3511` schreibt `zuletzt`, wird aber im selben
   Kapitel überholt — `:4084-4085` (§4.12 Nr. 6) und `:5035` setzen `Vorschlag =
   `{ name: string; zuletztText: string }`, eine **fertige Zeichenkette**, kein Zeitstempel. A15
   führt es bereits richtig.
   ⚠️ **Den Deckel setzt die Datenfunktion, nicht diese Action:** `sucheEntleiher(db, suchtext,
   deckel = 10)` trägt die 10 als Vorgabewert (Spec `:4084`), und **`entleiherVorschlaege` setzt
   keinen eigenen daneben** — zwei Zahlen für dieselbe Grenze laufen auseinander.
   **Die Vorschläge kommen über eine Server Action, nicht einen Route Handler:** ein zweiter
   anonymer GET bräuchte eigene Ratenbegrenzung, und der Suchtext stünde in **jeder
   Proxy-Zugriffszeile**.
   ⛔ **Damit ist die Ratenbegrenzung dieser vier Actions NICHT gebaut** — Zusage §4.12 Nr. 4
   (`:4074-4076`) nennt sie als **Voraussetzung** und setzt sie nicht um. Sie steht mit Eigentümer
   in „Was Planteil 3 NICHT liefert"; ⛔ **behaupte in keinem Kommentar dieser Datei, sie sei da.**
9. ⛔ **`ausleiheAnlegen` reicht die HERKUNFT des Zugangs an `bucheAusleihe` durch** — bei
   `zugang.weg === "code"` das `zugang.codeId` als `zugangscodeId`, bei `weg === "suite"` **`null`**.
   Spec `:2181-2186`: die Spalte „ist NULL für alle importierten Alt-Leihen und für jede Leihe über
   den Suite-Weg (3.5)" und ist „die **Herkunft des Zugangs** … **über sie löst die Anzeige
   `bezeichnung` auf**". ⛔ **Ohne diese eine Zeile schreibt NIEMAND die Spalte** — sie bliebe
   dauerhaft leer, und Planteil 4 entdeckte beim Bau der Historienanzeige eine tote Spalte, deren
   Existenz das Löschverbot aus §3.2.4 (`:2240-2242`: „**Beides oder nichts.**") überhaupt erst
   begründet. A7 liefert `codeId` (`:2404`), A15 nimmt es in `AusleihEingabe` entgegen.

⚠️ **Die Datenschutz-Entscheidung ist ausgeschrieben und bleibt so** (`:3500-3506`): Vorschläge
bleiben. „Wer den Code hat, sieht auf der Übersicht ohnehin **jeden aktiven Entleihernamen** samt
Uhrzeit — die Vorschläge erweitern das um vergangene Namen, keine neue Klasse."

⛔ **`revalidatePath` und `redirect` nach Entscheidung E1:**
`revalidatePath("/geraete")` und `revalidatePath("/rueckgabe")`, `redirect("/geraete?gebucht=<n>")`
— ⛔ **nicht `"/"`**, denn `/` ist das Gate.

### Die Tests (Spec `:4033-4038`)

| Testname | Aussage |
|---|---|
| „bucht vier Geraete in EINER Transaktion" | §4.3.2 |
| „bucht KEIN Geraet, wenn eines inzwischen vergeben ist, und nennt seinen Rufnamen" | Alles-oder-nichts + §4.3.5 Regel 1 |
| „ruft den Zugangsriegel als erste Anweisung, vor dem Lesen von formData" | Entscheidung 10 |
| „verweigert eine Zustandsnotiz ueber der Zeichengrenze serverseitig" | §4.4 Punkt 2 |
| „schreibt den Entleihernamen unveraendert, ohne Umschreiben" | §4.4, Ende — ⛔ **Testdaten: „Müller & Sohn"** |
| „liefert hoechstens zehn Vorschlaege und nichts unter zwei Zeichen" | §4.3.4 |
| „eine abgelaufene Sitzung liefert ok false, ohne umzuleiten" | Zulässigkeitstafel Zeile 10 |
| „auch die lesenden Actions rufen den Riegel" | die Ausnahmeliste hat genau **drei** Einträge (E12) |
| „reicht bei einer abgelaufenen Sitzung grund sitzung durch, nicht unbekannt" | E13 — ⛔ **die Unterscheidung, an der Zusage §3.10 Nr. 8 hängt** |
| „eine ueber den Code gebuchte Leihe traegt die Herkunft, eine ueber die Suite gebuchte nicht" | ⛔ **Auflage 9** — der einzige Test, der `loans.zugangscode_id` überhaupt berührt (Spec `:2181-2186`). **Er gehört zusätzlich als Fall in `_db/leihen.test.ts` (A15)**, auf der Ebene, die schreibt |

- [ ] Schritt 1–5. Sonden: **S-A17a** `requireAusleihSchreibend` in `ausleiheAnlegen` **hinter** das
  erste `formular.get(...)` schieben → „ruft den Zugangsriegel als erste Anweisung" **und** der
  Guard-Scan aus A8; **S-A17b** die Transaktion durch `Promise.all` ersetzen → „bucht KEIN Geraet,
  wenn eines inzwischen vergeben ist"; **S-A17c** `sanitizeForDisplay` vor dem Schreiben einfügen →
  „schreibt den Entleihernamen unveraendert"; **S-A17d** den ersten Parameter aus `ausleiheAnlegen`
  entfernen → ⛔ **erwartet: `typecheck` grün, Test rot** — zitiere beide.

```bash
rtk git add src/app/m/radio/_actions/ausleihe.ts src/app/m/radio/_actions/ausleihe.test.ts \
            src/app/m/radio/_actions/guards.test.ts
rtk git commit -m "feat(radio): die vier Ausleih-Actions — eine Transaktion, Ergebnis statt Wurf"
```

---

## Aufgabe A18: Die Übersicht — `(ausleihe)/layout.tsx` und `geraete/page.tsx`

**Files:** Create `(ausleihe)/layout.tsx`, `(ausleihe)/geraete/page.tsx`,
`(ausleihe)/geraete/page.test.tsx`, `_ui/GeraeteListe.tsx`, `_ui/GeraeteListe.test.tsx`,
`_ui/GeraeteZeile.tsx`; Modify `riegel.test.ts` (`AUSLEIH_FLAECHEN_ANZAHL` **1 → 3**),
`_ui/ausleihe.module.css`

⛔ **Warum Layout und erste Seite in EINER Aufgabe:** Klausel (f) zählt **exakt**; ein Layout ohne
Seite darunter hätte außerdem ⬜ **A-L9** als offene Frage (ob Next ein Group-Layout ohne `page.tsx`
überhaupt ausführt, ist unbewiesen — `riegel.test.ts:45-49`). Ein Layout, das eine Sicherheit
behauptet, die niemand ausführt, ist eine Hülle (Plan 2, „Was Planteil 2 NICHT liefert").

### `(ausleihe)/layout.tsx` — ein Aufruf, sonst nichts (§4.2.1, `:3399-3415`)

```tsx
// EIN Aufruf: requireAusleihZugang(getDb()). Sonst traegt diese Datei NICHTS
// (Vorbild lagerbuch/helfer/layout.tsx:41-45).
```

⛔ **Bequemlichkeit, keine Sicherheitsgrenze.** Route-Group-Grenzen sind **keine**, und ein Layout
kann einer Seite **keine Props reichen**. Deshalb ruft **jede** der drei Seiten den Riegel **selbst
noch einmal** (sie braucht Etikett und Ablaufzeit für den Rahmen). ⛔ **Der Host-Riegel wird NICHT
zusätzlich gerufen** — Klausel (f) macht das rot.

### `(ausleihe)/geraete/page.tsx` — die Übersicht (Entscheidung E1)

1. `const zugang = await requireAusleihZugang(getDb());` — **erste Anweisung**.
2. `const geraete = geraeteMitLeihstand(getDb());` — die **fertigen Zeilen**.
3. `suchschluessel` ist **schon vom Lesepfad vorberechnet** (A15, mit `normalisiereSuchtext` aus
   **A13** — ⛔ nicht A12, die liefert `uhrzeit()`/`datumMitUhrzeit()` und die Statustöne) — ⛔ **die
   Seriennummer reist nicht als eigenes Feld mit** (§4.1 Punkt 2, §4.5.2).
4. `<AusleihRahmen zugang={zugang} aktiv="uebersicht">` + `<GeraeteListe geraete={…} />`.
5. `?gebucht=<n>` → grüne Zeile in `role="status" aria-live="polite"` (Entscheidung E6: **kein
   Toast**).
6. Leerzustand: antd `Empty` mit dem Satz aus **A14** — ⛔ **ohne Verweis auf die Verwaltung**.
7. ⛔ **`export const dynamic = "force-dynamic";`** — Ersatz für `staleTime: 30_000` und
   `keepPreviousData` des Alt-Kiosk (§4.7, `:3827`).
8. **Aktualisieren-Knopf:** `<form action={listeAktualisieren}>` mit `useFormStatus` für den
   sperrenden Zustand — ⛔ **kein selbstschließender `useState`-Fehlerkasten mehr**, und ⛔ **kein
   Zeichen, Beschriftung „Aktualisieren"** (E5).

### `_ui/GeraeteListe.tsx` und `_ui/GeraeteZeile.tsx` — `"use client"` (§4.5, §4.6.3)

* Suche, Statusfilter, Gruppierung, Zeilen — reagieren auf Tastatureingabe **ohne
  Server-Roundtrip**.
* ⛔ **Die Insel bekommt nur serialisierbare Props** (Falle 9). Vorbild einer vollständigen Insel:
  `src/app/m/qr/admin/preset-form.tsx`.
* antd `Input` mit **`allowClear`** statt eigenem 44er-Knopf (`DeviceFilterBar.tsx:54-63`);
  ⛔ **`size` nicht setzen**.
* **Trefferzeile „7 von 23 Geräten"** in `role="status" aria-live="polite"`
  (`DeviceFilterBar.tsx:88-90`).
* **64px-Zeile**, Statuspunkt, zwei Textzeilen — ⛔ **Nachbau im CSS-Modul, kein antd-Baustein
  passt** (E8, `:3712-3717`).
* ⛔ **Ein vergebenes Gerät ist nicht antippbar**: 60 % Deckkraft, `aria-disabled`
  (`DeviceRow.tsx:47`, `:49-50`).
* Tap auf ein freies Gerät → `<Link href="/ausleihen?geraete=<id>">`, ⛔ **kein Client-Handler**
  (`:3427`).
* ⛔ **Keine `Table`** (E4).

| Testname | Aussage |
|---|---|
| `page.test.tsx` „rendert OHNE Layout auf fremdem Host nicht" | die Seite ruft den Riegel selbst (`:4046`) |
| `page.test.tsx` „liest die Kopfzeilen genau einmal" | kein doppelter Host-Riegel (§4.2.1, `:4047`) |
| `GeraeteListe.test.tsx` „zeigt 7 von 23 Geraeten in der Trefferzeile" | `DeviceFilterBar.tsx:88-90` |
| „rendert eine einzelne Gruppe flach ohne Kopfzeile" | `DeviceGroupedList.tsx:34-36` |
| „haelt bei aktivem Suchtext alle Gruppen offen und die Koepfe unklickbar" | `:31`, `DeviceGroup.tsx:22` |
| „macht ein vergebenes Geraet nicht antippbar" | `DeviceRow.tsx:47`, `:49-50` |
| „reicht die Seriennummer nicht in die Zeile, findet sie aber ueber den Suchschluessel" | §4.5.2 — ⛔ **der Fall, der die Datenschutz-Zusage trägt** |

⛔ **Zwei Testebenen, zwei Werkzeuge, und das Vertauschen kostet eine Stunde:** die zwei
`page.test.tsx`-Fälle laufen über das **Mock-Gerüst aus A7** (async Server Component, `await
headers()`, geworfener `redirect()`-Sentinel — `mount()` treibt das nicht an); die
`GeraeteListe.test.tsx`-Fälle laufen über `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`fill`/`click`/`query`/`submitForm`) — ⛔ **kein zweites Harness erfinden** (`CLAUDE.md`).
Dasselbe gilt für A19 und A20.

⛔ **JEDE Testdatei, die `test-dom.tsx` benutzt, trägt `// @vitest-environment jsdom` als ERSTE
Zeile.** `vitest.config.ts:7` setzt `environment: "node"` **global**, und die Datei kennt **kein**
`environmentMatchGlobs`; ohne die Zeile stirbt jeder `mount()` an `document is not defined`. Der
Bestand opt-in't je Datei: `src/app/m/portal/_ui/DiensteRaster.test.tsx:1`,
`src/app/m/aufgaben/page.test.tsx:1`. ⚠️ **Betroffen sind in Block B sieben Dateien:**
`_ui/ikonen.test.tsx`, `_ui/StatusChip.test.tsx`, `_ui/AusleihRahmen.test.tsx`,
`_ui/GeraeteListe.test.tsx`, `_ui/AusleihVorgang.test.tsx`, `_ui/RueckgabeDialog.test.tsx` und
`_ui/SitzungErneuern.test.tsx` — ⛔ **nicht** die drei `page.test.tsx` (die laufen im
Node-Gerüst) und ⛔ **nicht** die `_lib/`-Tests. ⚠️ **Und wer eine jsdom-Datei schreibt, die
`localStorage` braucht, prüft das gesondert** — Node 26 bringt ein eigenes mit, das jsdoms
verdeckt (KONTEXT.md `:98-99`, Abhilfe `vitest.config.ts:54-87`).

- [ ] Schritt 1–5. Sonden: **S-A18a** `requireAusleihZugang` aus `geraete/page.tsx` entfernen →
  Klausel (f); **S-A18b** `requireRadioHost` in `(ausleihe)/layout.tsx` ergänzen → Klausel (f), „ruft
  requireRadioHost( ein zweites Mal"; **S-A18c** `seriennummer` als Prop in `GeraeteZeile` reichen →
  „reicht die Seriennummer nicht in die Zeile".

```bash
rtk git add "src/app/m/radio/(ausleihe)/layout.tsx" "src/app/m/radio/(ausleihe)/geraete/page.tsx" \
            "src/app/m/radio/(ausleihe)/geraete/page.test.tsx" \
            src/app/m/radio/_ui/GeraeteListe.tsx src/app/m/radio/_ui/GeraeteListe.test.tsx \
            src/app/m/radio/_ui/GeraeteZeile.tsx src/app/m/radio/_ui/ausleihe.module.css \
            src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): die Geraeteuebersicht an /geraete, mit Suche und Standortgruppen"
```

---

## Aufgabe A19: Die Ausleihe — `(ausleihe)/ausleihen/page.tsx`

**Files:** Create `(ausleihe)/ausleihen/page.tsx`, `ausleihen/page.test.tsx`,
`_ui/AusleihVorgang.tsx`, `_ui/AusleihVorgang.test.tsx`, `_ui/EntleiherFeld.tsx`,
`_ui/SitzungErneuern.tsx`, `_ui/SitzungErneuern.test.tsx`;
Modify `riegel.test.ts` (`AUSLEIH_FLAECHEN_ANZAHL` **3 → 4**), `_ui/ausleihe.module.css`

### Die Seite (RSC)

1. `requireAusleihZugang(getDb())` — erste Anweisung.
2. `auswahlLesen(searchParams.geraete)` (**A13**), dann ⛔ **serverseitig Existenz UND Verfügbarkeit
   jeder ID prüfen** und ungültige IDs **aussortieren** (`:3425`, `:3484-3488`).
3. ⛔ **Der Verlust wird ANGEZEIGT**: „Ein vorgewähltes Gerät ist nicht mehr frei und wurde aus der
   Auswahl entfernt." — **heute prüft die Seite gar nichts** (`:3486-3488`).
4. `<AusleihVorgang …>` mit serialisierbaren Props.
5. ⬜ **A-L2 — die Vorbelegung des Namens.** Bei `weg === "suite"` `defaultValue={zugang.name}`,
   ⛔ **überschreibbar, kein `readOnly`** (§3.5.4, `:2738-2756`). ⚠️ **Fällt die Betreiberantwort auf
   „nein", ändert sich GENAU DIESE EINE ZEILE** (`:3963-3965`). **Schreib die Belegzeile direkt
   daneben**, nicht nur in den Plan.
6. ⛔ **`sub` wird NICHT in die Leihzeile geschrieben** — kein `entliehen_von_sub`, kein `created_by`
   auf `loans`; der Vorgang bleibt anonym (§3.5.4). Das Schema führt die Spalte gar nicht erst
   (Zusage §3.10 Nr. 3).
7. `export const dynamic = "force-dynamic";`

### `_ui/AusleihVorgang.tsx` (`"use client"`)

* Auswahl an/ab; ⛔ **die Insel schreibt die Auswahl per `router.replace` nach `?geraete=` zurück** —
  reload- und zurück-fest (`:3427`).
* `useActionState` auf `ausleiheAnlegen`, ⛔ **direkt importiert** (Falle 9).
* ⛔ **Sofortige Sperre und Beschriftungswechsel bleiben wörtlich erhalten**
  (`ConfirmLoanButton.tsx:42-66`, Beschriftung `:68` je nach Anzahl) — nur wird aus `useState` ein
  `useActionState` (`:3433-3435`).
* Deckel 20, ⛔ **sichtbar**: „Höchstens 20 Geräte in einem Vorgang."
* antd `Button`, ⛔ **`size` nicht setzen**; `min-width` und `touch-action: manipulation` sind
  **Nachbau** (E8).

### `_ui/EntleiherFeld.tsx` (`"use client"`, §4.3.4, `:3490-3516`)

⛔ **antd `AutoComplete` statt der 312 Zeilen des Bestands** (`BorrowerInput.tsx`, vollständiges
ARIA-Combobox-Muster, Tastaturnavigation, `useDeferredValue`, 200 ms Blur-Verzögerung, Lade-/
Fehler-/Leerzustand). Das Muster existiert bereits: `src/app/m/feedback/_ui/Zuordnung.tsx:11`. antd
bringt ARIA, Tastatur, Fokusring und Tap mit; **312 Zeilen fallen auf ~40**.

⛔ **Drei Dinge trägt antd NICHT und sind Nachbau** (`:3496-3500`):
1. die **Zwei-Zeichen-Schwelle**,
2. die **Nebenzeile „zuletzt am 14.06."** (`options[].label` als eigenes Markup),
3. das **Tap-Maß 44 je Zeile**.

Datenquelle: die Server Action `entleiherVorschlaege` (**A17**), ⛔ **kein Route Handler**.

### `_ui/SitzungErneuern.tsx` (`"use client"`) — die Inline-Erneuerung, Entscheidung E12

⛔ **Das ist die Fläche zu Zusage §3.10 Nr. 8** (`:3235-3236`) und zu §3.4.4 (`:2563-2570`):
„die Fläche bietet **inline** ein Codefeld an, das die Sitzung erneuert, **ohne die eingetragenen
Werte zu verlieren**."

* **Ein Codefeld plus ein Knopf**, gerendert **innerhalb** des Ausleihformulars, unterhalb des
  Fehlersatzes — ⛔ **kein Modal, kein Redirect, kein Neuaufbau der Seite**. Der ganze Zweck ist,
  dass Auswahl und Name stehen bleiben.
* ⛔ **Sie erscheint NUR bei `grund === "sitzung"`, NIE bei `"gesperrt"`** (Zusage Nr. 8): bei einem
  gesperrten Code scheitert dieselbe Eingabe genauso, und „ein Feld, das nicht helfen kann, ist
  schlimmer als eine klare Absage" (`:2568-2570`).
* Ruft `erneuereSitzung` aus `_actions/sitzung.ts` (**A9**), ⛔ **direkt importiert** (Falle 9).
  Bei `{ ok: true }` verschwindet das Feld und der Mensch drückt erneut „Ausleihen"; bei
  `{ ok: false }` steht der Text am Feld.
* ⛔ **Kein eigenes Absenden des Ausleihformulars.** Ein Automatismus „erneuern und gleich buchen"
  wäre ein zweiter Schreibweg, den kein Test dieses Planteils bewacht.
* antd `Input` + `Button`, ⛔ **`size` nicht setzen**; Tap-Maß aus dem CSS-Modul (E8).
* ⛔ **`// @vitest-environment jsdom` als erste Zeile** von `_ui/SitzungErneuern.test.tsx`.

| Testname | Aussage |
|---|---|
| „erscheint bei grund sitzung" | Zusage §3.10 Nr. 8, positive Hälfte |
| „erscheint NICHT bei grund gesperrt" | ⛔ **die negative Hälfte, und sie ist die wichtigere** — ein Feld, das nicht helfen kann |
| „behaelt Auswahl und Name, wenn die Erneuerung gelingt" | §3.4.4 — ⛔ **der Fall, der den ganzen Bau begründet**; er ist zugleich der Unit-Träger des e2e-Namens „abgelaufene Sitzung verliert die eingetragenen Werte nicht" (NS-A12) |
| „zeigt den Fehlertext am Feld, wenn der Code nicht stimmt" | `erneuereSitzung` liefert `{ ok:false, text }`, ⛔ **kein Wurf, kein Redirect** |

⛔ **A20 benutzt dieselbe Insel** im `RueckgabeDialog` — ⛔ **keine zweite bauen.** Dort ist der
Verlust die getippte Zustandsnotiz.

| Testname | Aussage |
|---|---|
| „sortiert ungueltige Vorwahlen aus und sagt es" | §4.3.3 |
| „schreibt die Auswahl nach ?geraete= zurueck" | reload- und zurück-fest |
| „sperrt den Knopf sofort und wechselt die Beschriftung" | `ConfirmLoanButton.tsx:42-68` |
| „fragt erst ab zwei Zeichen" | §4.3.4 |
| „zeigt die Nebenzeile mit dem letzten Ausleihdatum" | der Posten, der beim Port still verschwände |
| „der vorbelegte Name ist ueberschreibbar" | §3.5.4 — ⬜ A-L2 |

- [ ] Schritt 1–5. Sonden: **S-A19a** `requireAusleihZugang` aus `ausleihen/page.tsx` entfernen →
  Klausel (f); **S-A19b** die Zwei-Zeichen-Schwelle im `EntleiherFeld` entfernen → „fragt erst ab
  zwei Zeichen"; **S-A19c** die Bedingung `grund === "sitzung"` in `SitzungErneuern` auf
  `grund !== "unbekannt"` aufweichen → „erscheint NICHT bei grund gesperrt"; **S-A19d** die
  Vorauswahl beim Erneuern zurücksetzen → „behaelt Auswahl und Name, wenn die Erneuerung gelingt".
  ⚠️ **Im ersten Entwurf hatte A19 keine einzige Sonde** — eine Aufgabe ohne benannte Mutation ist
  eine Aufgabe ohne Beweis.

```bash
rtk git add "src/app/m/radio/(ausleihe)/ausleihen/page.tsx" \
            "src/app/m/radio/(ausleihe)/ausleihen/page.test.tsx" \
            src/app/m/radio/_ui/AusleihVorgang.tsx src/app/m/radio/_ui/AusleihVorgang.test.tsx \
            src/app/m/radio/_ui/EntleiherFeld.tsx \
            src/app/m/radio/_ui/SitzungErneuern.tsx src/app/m/radio/_ui/SitzungErneuern.test.tsx \
            src/app/m/radio/_ui/ausleihe.module.css \
            src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): der Ausleihvorgang — Auswahl in der URL, Name mit Vorschlaegen"
```

---

## Aufgabe A20: Die Rückgabe — `(ausleihe)/rueckgabe/page.tsx`

**Files:** Create `(ausleihe)/rueckgabe/page.tsx`, `rueckgabe/page.test.tsx`,
`_ui/RueckgabeListe.tsx`, `_ui/RueckgabeDialog.tsx`, `_ui/RueckgabeDialog.test.tsx`;
Modify `riegel.test.ts` (`AUSLEIH_FLAECHEN_ANZAHL` **4 → 5**), `_ui/ausleihe.module.css`

### Die Seite (RSC, §4.4, `:3554-3594`)

1. `requireAusleihZugang(getDb())` — erste Anweisung.
2. `offeneAusleihen(getDb())` → **fertige Zeichenketten** (`{ id, rufname, entleiher, seitText }`) —
   ⛔ **kein `Date` in den Client** (§4.1 Punkt 1).
3. Karten: Rufname **fett**, darunter „Ausgeliehen am 14.06.2026, 09:12 Uhr".
4. Suchzeile „Rufname oder Name…" ⛔ **erscheint nur bei `loans.length > 0`**
   (`routes/return.tsx:60`) — **bleibt so**.
5. Leerzustand: antd `Empty`, „Keine Geräte ausgeliehen" (`LoanedDeviceList.tsx:54-63`, **wörtlich**).
6. `export const dynamic = "force-dynamic";`
7. ⛔ **Keine Seitenblätterung** (§4.9.6): die Alt-API kennt `take`/`skip`, die Oberfläche benutzt
   sie nicht; unter hundert Leihen wäre Blätterwerk Mechanik ohne Anlass.
8. ⛔ **Keine Mehrfach-Rückgabe** (§4.9.6): existiert heute nicht — eine Karte, ein Dialog, eine
   Ausleihe. Die Fläche verspricht sie nirgends.

### `_ui/RueckgabeListe.tsx` und `_ui/RueckgabeDialog.tsx` (`"use client"`)

* Suche über **Rufname UND Entleihername** (`lib/loan-filter.ts:8`-Äquivalent) — ⛔ **dieselbe
  `normalisiereSuchtext` wie die Übersicht** (**A13**, nicht A14), aber **andere Felder**
  (Falle № 10 der Analyse).
* antd `Modal` (E-Tabelle: bringt Escape, Klick daneben und Fokusfalle mit — `ReturnDialog.tsx:23`
  beschreibt genau das als Radix-Leistung).
* `Input.TextArea` mit `showCount maxLength` — ⛔ **nur hier, in einer `"use client"`-Datei**
  (Falle 1: Compound-Zugriff in einer Server Component ist HTTP 500). Der Zähler „0 / 500" kommt
  damit von antd. ⬜ **A-L11** für die Zahl.

⛔ **Drei Feinheiten des Bestands, die beim naiven Port sterben** (`:3576-3587`):

1. ⛔ **Die Notiz wird beim WECHSEL der Ausleihe zurückgesetzt, aber NICHT beim Fehlerschluss**
   (`ReturnDialog.tsx:45-47`, `:66-73`, Kommentar „H3 + M1"). **Übernommen: der Dialog bleibt bei
   `ok: false` OFFEN, MIT der Notiz.** Ein naiver Port schließt bei jedem Ergebnis und der Mensch
   tippt die Notiz erneut.
2. **`maxLength` am Feld UND Prüfung beim Bestätigen** (`:53-55`, `:93`) — und der **Server prüft
   erneut** (A17 Auflage 7).
3. **Der Zeichenzähler bleibt** (`:98-100`) — die **einzige** Stelle, an der die Grenze überhaupt
   genannt wird.

| Testname | Aussage |
|---|---|
| „behaelt die Notiz, wenn die Rueckgabe an einem Konflikt scheitert" | `ReturnDialog.tsx:66-73` — ⛔ **der wichtigste Fall dieser Aufgabe** |
| „leert die Notiz beim Wechsel auf eine andere Ausleihe" | `:45-47` |
| „sucht ueber Rufname UND Entleihername" | Falle № 10 |
| „zeigt die Suchzeile nicht bei leerer Liste" | `routes/return.tsx:60` |

⛔ **Und bei `grund === "sitzung"` rendert der Dialog `_ui/SitzungErneuern.tsx` aus A19** — ⛔ **keine
zweite Insel bauen** (E12, Zusage §3.10 Nr. 8). Der Verlust, gegen den sie hier steht, ist die
getippte Zustandsnotiz; sie fällt unter dieselbe Regel wie Feinheit 1 („der Dialog bleibt bei
`ok: false` OFFEN, MIT der Notiz").

- [ ] Sonden: **S-A20a** den Dialog bei `ok: false` schließen lassen → „behaelt die Notiz";
  **S-A20b** die Notiz beim Wechsel stehen lassen → „leert die Notiz beim Wechsel";
  **S-A20c** `SitzungErneuern` im Dialog auch bei `grund === "gesperrt"` rendern → „erscheint NICHT
  bei grund gesperrt".

```bash
rtk git add "src/app/m/radio/(ausleihe)/rueckgabe/page.tsx" \
            "src/app/m/radio/(ausleihe)/rueckgabe/page.test.tsx" \
            src/app/m/radio/_ui/RueckgabeListe.tsx src/app/m/radio/_ui/RueckgabeDialog.tsx \
            src/app/m/radio/_ui/RueckgabeDialog.test.tsx src/app/m/radio/_ui/ausleihe.module.css \
            src/app/m/radio/riegel.test.ts
rtk git commit -m "feat(radio): die Rueckgabe mit Zustandsnotiz, Dialog bleibt bei Konflikt offen"
```

---

## Der Abschluss von Block B — vor dem Merge, EINMAL

⛔ **Nicht vor jedem Tor, sondern einmal, nach A20, nach den Tests** (KONTEXT.md `:82`):

```
rtk pnpm vitest run
rtk pnpm build
rtk pnpm exec playwright test
rg -n "RADIO_ADMIN_|api/v1/" src/app/m/radio
```

⛔ **`rg`, nicht `grep`** — Spec `:5453` schreibt `rg`, und `grep` ohne `-E` behandelt `|` als
literales Zeichen: der Befehl fände nie etwas und wäre still immer „grün".

Erwartet: Testsuite **grün gegen die neue Grundlinie**, Build grün, Playwright grün, und der letzte
Befehl liefert **nichts** (Spec `:5453`, Entscheidung 15).

⚠️ **Der `grep`-Befehl ist ein Abnahmekriterium, kein Test** — er steht in keiner Datei und wird
deshalb hier ausgeschrieben. ⬜ Ihn als Testfall zu verankern, gehört zu **Planteil 4** (dort fällt
die HTTP-Grenze, dort wird er zur laufenden Zusage).

---

## Nachträge

*(Nach dem Bau zu füllen: gemessene Zahlen, Sondenergebnisse, Abweichungen vom Plan mit Begründung,
und die Werte für ⬜ L10, ⬜ A-L10, ⬜ A-L11.)*

---

## Was Planteil 3 NICHT liefert

| Was | Eigentümer | Begründung |
|---|---|---|
| **Die zehn Verwaltungsseiten** unter `/admin` — Übersicht, Geräte, Gerät, Ereignisse, Ausleihen, Import, Software, Versionen, Zugänge, Druckblatt | **Planteil 4** (Kapitel 5) | Leitplan `:90`. `riegel.test.ts` führt bereits den Anhebe-Fahrplan (`ADMIN_SEITEN_ANZAHL` 0 → 10) |
| **Die Codeliste unter `/admin/zugaenge`** und das Druckblatt `/admin/zugaenge/blatt` | **Planteil 4** | Planteil 3 baut die **Actions** (`erstelleCode`, `setzeCodeAktiv`, A8), nicht die Fläche. ⛔ Zusage §3.10 Nr. 11: Klartext-`code`, `bezeichnung`, `aktiv`, `created_at`, `last_used_at`, Umschalter — **kein Löschknopf**; Tabelle als eigene `"use client"`-Komponente (Falle 9) |
| **Der Fall der HTTP-Grenze** — die sechs `/v1`-Routen als Drizzle-Aufrufe, `radio-inventar` umgeschwenkt | **Planteil 4** | ⛔ Entscheidung 15, Leitplan `:104-106`: „Beide Domains ziehen im selben Fenster um." Planteil 3 fasst **keines** der beiden Alt-Repos an |
| **`leihhistorie(db, f)`** — die sechste Funktion aus `_db/leihen.ts` | **Planteil 4** | Sie speist ausschließlich `/admin/ausleihen` (Spec `:5024`) |
| **Die zweite Rechtestufe** (`requireRadioVerwaltung`, `SUITE_UPDATER_GROUP_RADIO`, `radioNav(stufe)`, `merkeNutzer`) | **Planteil 4** | NS-Z7…NS-Z10; Planteil 2 hat die Naht gelegt. ⛔ **Der Ausleihweg kennt beide Stufen nicht** — er ist anonym und codegeprägt |
| **`radioBootFehler()` und `starteRadioHintergrund()`** — inklusive einer Boot-Prüfung auf `RADIO_AUSLEIH_SITZUNG_SECRET` | **Planteil 5** (Kapitel 7) | B8 (Spec `:97`). ⬜ **A-L7** |
| **`/api/health/radio`, PWA, Abräum-Worker, `sw.js/route.ts`** | **Planteil 5** | Leitplan `:91`. ⛔ **§4.9.4: kein `manifest.webmanifest`, kein `viewport`-Export, kein Service Worker auf dieser Fläche** — der **Abräum**-Worker gehört zum **ersten Deploy** (Leitplan-Auflage 2), nicht hierher |
| **Die e2e-Dateien** `e2e/radio-gate.spec.ts` und `e2e/radio-ausleihe.spec.ts` mit ihren sechs Namen | **Planteil 5** | Leitplan `:91` („die e2e-Fläche"). Die sechs Namen wandern als Zusage weiter (unten) |
| **Die drei Release-Notizen** unter `src/app/m/portal/_lib/neuigkeiten/notizen/radio/` | **Das Cutover-Runbook** (Planteil 5 / Spec 3) | ⬜ **A-L4**: `datum` ist der **Rollout-Tag**, und `register.test.ts` erzwingt das Dreieck Dateiname ↔ Feld ↔ Registerzeile. Eine Datei mit erfundenem Datum wäre genau die verbotene Erfindung. **Die Texte stehen fertig in der Spec** und werden unten als Zusage weitergereicht |
| **Ein Beweis, dass die Riegel bei einem echten Abruf GREIFEN** | **Planteil 5** | ⬜ **A-L9** (Erbe von Z-L1). Was Planteil 3 belegt, ist „die Zeile steht da" und „die Logik stimmt" — nicht „der Riegel greift" |
| **Eine Ratenbegrenzung der vier anonymen Ausleih-Actions** (`ausleiheAnlegen`, `rueckgabeBuchen`, `entleiherVorschlaege`, `listeAktualisieren`) | **der Suite-Posten CWE-348 / Self-Hop** — ⬜ **A-L6**, mit ⬜ **A-L12** als offener Vorfrage | ⛔ **Zusage §4.12 Nr. 4 (`:4074-4076`), wörtlich:** „**Die anonymen Server Actions dieses Kapitels brauchen eine Ratenbegrenzung.** Sie ist **nicht** Teil dieser Spec … Dieses Kapitel nennt sie als **Voraussetzung** und setzt sie nicht um." ⚠️ **Verschärfend:** die einzige Schranke, die es gäbe, hinge an `clientIpAus`, und deren Wert auf einem Modul-Host ist ⬜ A-L12 — unbestimmt. `entleiherVorschlaege` ist dabei ein **anonymer Namenslesepfad**. ⛔ **A17 behauptet in keinem Kommentar, sie sei da** |
| **Der Self-Hop-Check in `clientIpAus`** | **ein eigener Suite-Posten** | ⬜ **A-L6**; `.superpowers/sdd/VORARBEIT-selfhop.md` mit seinen zwei eigenen Leerstellen. ⚠️ **Nicht dasselbe wie V3b** (der Rewrite-Umbau, gebaut aber nicht abgenommen) |
| **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts`** | **eigene Vorarbeit vor Planteil 4** | Leitplan `:120`. `radio` löst seine Rechte modulintern selbst auf; `riegel.test.ts:652-656` sichert das zu |
| **Eine kamerabasierte Scan-Fläche** in der App | ⬜ **L9 — Zweigwahl, hier entschieden: NEIN** | §3.3.1/§3.3.2/§3.3.3 bauen Route Handler + Server-Action-Formular; eine In-App-Kamera steht in keiner Zeile von Kapitel 3. Abgelesen wird das **Ergebnis** vom Cutover-Prüfsatz (§P.10) |
| **Eine `paritaetsSichtZugangscode`** in `scripts/import/` | **niemand — die Frage ist hier entschieden** | Spec `:1675`: „`zugangscodes` — **nicht Teil des Imports.** Es gibt in der Quelle nichts, was ihnen entspräche." Eine Paritätssicht vergleicht Quelle gegen Ziel; ohne Quellzeilen gäbe es nichts zu prüfen. **A8 korrigiert den irreführenden Kommentar** |

---

## Nahtstellen zu Planteil 4 (Kapitel 6 und 5)

| # | Nahtstelle | Auflage |
|---|---|---|
| **NS-A1** | **`_db/leihen.ts` ist angelegt, mit fünf von sechs Funktionen.** | Planteil 4 **ergänzt** `leihhistorie(db, f)` in **derselben** Datei — ⛔ keine zweite. Die sechs Alt-Routen werden **dort** gelöscht (Spec `:5019-5027`, Löschliste `:5300-5310`) |
| **NS-A2** | **`HANDLER_ANZAHL = 2`.** | Planteil 4 baut `admin/(arbeit)/geraete/export/route.ts` → ⛔ **`HANDLER_ANZAHL = 3`**, `toBe`, nicht `>=`. Der Handler riegelt mit `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())` und baut seine **404** selbst (B10, B11, B17) — ⛔ **nie 403, nie `requireRadioAdmin`** |
| **NS-A3** | **`ADMIN_SEITEN_ANZAHL` steht weiterhin auf 0.** | Planteil 4 hebt sie auf **10** (Spec `:4369-4378`: neun unter `(arbeit)`, eine unter `(druck)`) |
| **NS-A4** | **`AUSLEIH_FLAECHEN_ANZAHL = 5`, Klausel (f) steht.** | Planteil 4 legt **keine** Fläche außerhalb `admin/` an. Legt er doch eine an, ist Klausel (f) rot — und das ist gewollt |
| **NS-A5** | **`ACTION_DATEIEN_ANZAHL = 4`, Ausnahmeliste GENAU DREI.** ⚠️ ⛔ **Das ist eine Abweichung von Spec `:6762` („GENAU ZWEI") — Planentscheidung E12, dort ausgeschrieben begründet.** Die drei: `gate.ts#einloesenAmGate`, `sitzung.ts#beenden`, `sitzung.ts#erneuereSitzung` | Jede neue Verwaltungs-Action ruft `requireRadioAdmin()` als erste Anweisung. ⛔ **Eine VIERTE Ausnahme ist ein roter Test, keine Zeile im Diff.** ⛔ **Und wer die Zahl auf zwei zurückdreht, muss `erneuereSitzung` mit zurückdrehen** — dann fällt Zusage §3.10 Nr. 8 ersatzlos, und Spec `:2258` („genau drei Stellen") ist gebrochen |
| **NS-A6** | **`erstelleCode` und `setzeCodeAktiv` existieren.** | `/admin/zugaenge` ruft sie. ⛔ **Es gibt keine Löschfunktion und es wird keine gebaut** — drei ausgeschriebene Gründe in `_actions/codes.ts` |
| **NS-A7** | **Klausel (d) Fall 2 prüft nur `requireRadioAdmin`.** | ⛔ Wer `requireRadioVerwaltung` baut, **schuldet ihm dieselben Körper-Zusicherungen** (`riegel.test.ts:507-510`) — sonst wird aus der ODER-Aussage in Klausel (e) ein echtes Loch |
| **NS-A8** | **`_lib/nav.ts` ist noch leer und eine Konstante.** | Planteil 4 füllt sie mit den sieben Einträgen und stellt sie auf `radioNav(stufe: RadioRolle)` um — **Datei UND Aufrufstelle** in `admin/(arbeit)/layout.tsx` (`nav.ts:29-46`) |
| **NS-A8b** | **`_ui/ikonen.tsx`, `_lib/status.ts` und `_lib/filter.ts` sind für BEIDE Flächen gebaut.** | ⛔ **Zusage §4.12 Nr. 11 (`:4102-4104`), wörtlich:** „Die Verwaltung darf sie mitbenutzen; **sie darf ihre Statusfarben nicht ein zweites Mal definieren.**" Die Wahrheit über die vier Statustöne ist `STATUS_HEX` in `_lib/status.ts` (⬜ A-L10) — ⛔ **kein zweiter Hexsatz in `admin/`**, und ⛔ **kein zweites Ikonenmodul** |
| **NS-A9** | **Die Ausleihfläche zeigt nie einen Verwaltungsweg an eine Person ohne `istRadioAdmin`.** | ⛔ Der `/admin`-Link hängt am **Prädikat**, nicht am Riegel (NS-Z6, §3.6.3 Punkt 4). Wer ihn in Planteil 4 anfasst, hält das |
| **NS-A10** | **⬜ A-L9 bleibt offen.** | Der erste echte Abruf einer Verwaltungsseite liest Z-L1 ab: führt Next das Layout einer Route-Group aus? |

---

## Nahtstellen zu Planteil 5 (Kapitel 7 und 8)

| # | Nahtstelle | Auflage |
|---|---|---|
| **NS-A11** | **Es gibt keine Boot-Prüfung auf `RADIO_AUSLEIH_SITZUNG_SECRET`.** ⬜ A-L7 | `radioBootFehler()` prüft es — ⛔ und **die drei `RADIO_GATE_*`-Namen aus B18** (`:118`), zeichengleich zu `.env.example`. ⛔ **Kein Host-Schalter vor dem Retention-Timer** (B5) |
| **NS-A12** | **Die sechs e2e-Namen sind gesetzt** (§3.8 `:3113-3121`, §4.11.1 `:4048`). | `radio-gate.spec.ts`: „gescannter QR-Code führt in die Ausleihe" · „gesperrter Code wird an der Ausleihe abgewiesen" · „abgelaufene Sitzung verliert die eingetragenen Werte nicht" · „angemeldet über die Suite, ohne Code, direkt in der Ausleihe" · „`/admin` ist für eine angemeldete Person ohne Gruppe ein 404, nicht ein 403". `radio-ausleihe.spec.ts`: „Code einlösen → Gerät ausleihen → in der Übersicht gelb → zurückgeben" |
| **NS-A13** | ⛔ **Drei Auflagen für jeden dieser e2e-Tests** (`:4050-4054`, §3.8). | **(1)** Warmlauf-**GET** auf jede Route **vor** der ersten Aktion (Suite-Falle 10). **(2)** Jede ausgelöste Anfrage wird über ihre **Antwort** geprüft (`page.waitForResponse`), nie über eine spätere Zustandsänderung. **(3)** Jeder Klick auf einen Anker läuft über `klickeWennRuhig` aus `e2e/fixtures.ts` (Suite-Falle 12) — **diese Fläche wechselt beim Eintreffen der Sitzung genau die Kopfzeile, die den Umbruch auslöst** |
| **NS-A14** | ⛔ **Was Playwright strukturell NICHT sehen kann.** | Das fehlende `domain` (Falle 19 der Analyse) und der Host-Riegel: Playwright fährt gegen **einen** `baseURL`. **Beides liegt im Unit-Test** (A4, A7) und **darf dort nicht gestrichen werden**, weil „es doch e2e gibt" |
| **NS-A15** | **⬜ L10 ist eingetragen** — die Zeichenkette im Kopf von `_ui/AusleihRahmen.tsx`. | Der Cutover-Prüfsatz liest sie dort ab (§P.9, `radio-cutover-leitplan.md:266,277,906`). ⛔ Wer das Markup ändert, ändert einen Cutover-Schritt mit |
| **NS-A16** | **⬜ L9 ist entschieden: keine Kamerafläche.** | Der Prüfsatz Stufe 3 §P.10 liest das Ergebnis ab (`2026-08-18-plan3-radio-generalprobe.md:90`) |
| **NS-A17** | **Die drei Release-Notizen sind NICHT geschrieben.** ⬜ A-L4, ⬜ A-L5 | Am Rollout-Tag: je eine Datei unter `.../notizen/radio/<YYYY-MM-DD>-<slug>.ts` **plus je eine Zeile in `register.ts`**. Slugs: `zugang-ueber-code` (§3.9 — ⛔ **§3.9 gewinnt über §4.9.6s `zugang-per-code`**, weil §3.9 den vollständigen Text, den Titel und die `<N>`-Regel führt), `funkgeraete-neue-adresse`, `geraeteliste-als-pdf-in-der-verwaltung`. **Der volle Text der ersten steht wörtlich in Spec `:3172-3187`**; `<N>` ist der einzige Platzhalter und wird ausgeschrieben eingesetzt („zwölf Stunden"). Titel: `Zugang über QR-Code oder Anmeldung` — ⛔ wiederholt den Registry-`title` nicht |
| **NS-A17b** | **Der Feldabgleich am Cutover hat ZWEI Hälften, und dieser Planteil reicht beide weiter.** | ⛔ **Zusage §4.12 Nr. 14 (`:4112-4113`), wörtlich:** „Der Feldabgleich muss die **Anzeige einer echten Ausleihe** (Rufname, Entleiher, Uhrzeit) gegen die Alt-Anwendung stellen." **(a)** die Schreibhälfte: `sanitizeForDisplay` wandert **nicht** mit, der Name steht unverändert in der Spalte (A17 Auflage 6, `:3587-3592`) — eine Verhaltensänderung **an den Daten**. **(b)** die Anzeigehälfte: Rufname, Entleiher und Uhrzeit auf `/geraete` und `/rueckgabe` gegen die Alt-Anwendung, **feldweise**. ⛔ **Paritätsgrün beweist die Anzeige nicht** (`CLAUDE.md`: „Ein konsistenter Mapping-Fehler ist paritätsgrün") |
| **NS-A18** | **Cutover-Schritte, die aus diesem Planteil folgen.** | **(a)** Zusage §3.10 Nr. 13: „Alt-Cookie `radio-inventar.sid` je Gerät löschen bzw. beim Abbau serverseitig invalidieren." **(b)** Zusage §3.10 Nr. 15: **kein Parallelfenster** + Ausstellen hinter `/admin`/Suite-SSO → **die ersten Codes entstehen erst in den Minuten nach dem Umschwenk**. Das Runbook braucht eine **namentlich benannte Person mit `SUITE_ADMIN_GROUP_RADIO` vor Ort am Cutover-Abend** und den Schritt „Aufsteller neu bedrucken/bekleben". Milderung: wer eine Suite-Anmeldung hat, leiht über Weg 2 sofort aus. **(c)** ⬜ A-L3 — wie viele Aufsteller im Umlauf sind, bestimmt beide Schritte. **(d)** Falle № 18 der Analyse: das **Admin**-Sitzungscookie des Alt-Kiosk liegt auf `.iuk-ue.de` und trifft nach der Zusammenlegung auf Suite-Cookies desselben Scopes — Namenskollisionen sind nicht ausgeschlossen. **Für den Bau ohne Wirkung** (`radio`s Cookie trägt **kein** `domain`), aber eine Zeile fürs Runbook wert |
| **NS-A19** | **`seedLokal.ts` legt niemals eine `zugangscodes`-Zeile an** — als Kommentar festgehalten (A8). | ⛔ **`SUITE_SEED=1` ist der Generalproben-Schalter**, nicht nur der Lokalschalter. Ein geseedeter Code wäre in der Generalprobe ein **gültiger anonymer Zugang** zum gesamten Bestand samt Ausleihernamen (Falle № 31). ⬜ Eine Scan-Zusicherung dazu gehört in `scripts/seed-lokal.test.ts`, nicht in ein zweites Modul-Scan-File (B14) |

---

## Zusagen dieses Planteils an die anderen

1. **An Planteil 4 und 5: `riegel.test.ts` ist ab A11 lückenlos** — (a) Verwaltungshüllen, (c) Route
   Handler, (e) Verwaltungsseiten, **(f) Gate und Ausleihzweig**, plus die drei modulweiten
   Pflicht-17-Scans und der `"use client"`-Scan. ⬜ **Z-L3 ist geschlossen.** Die einzige verbleibende
   deklarierte Lücke der Riegelfamilie ist **Klausel (d) Fall 2** (nur `requireRadioAdmin`,
   `riegel.test.ts:507-510`) — Eigentümer Planteil 4.
2. **An Planteil 4: `_actions/guards.test.ts` ist der EINE `_actions/`-Scan** (B14/B19). ⛔ Wer eine
   Klausel (b) in `riegel.test.ts` nachträgt, baut genau den Zustand, den B14 abgeräumt hat.
3. **An Planteil 4: die Ausnahmeliste hat GENAU DREI Einträge** und ihre Länge wird geprüft.
   ⚠️ ⛔ **Abweichung von Spec `:6762` („GENAU ZWEI"), als Entscheidung E12 ausgeschrieben:** der
   dritte ist `sitzung.ts#erneuereSitzung`, die dritte der „genau drei Stellen, die eine
   Ausleih-Sitzung ausstellen" (Spec `:2258`). **Ein VIERTER Eintrag ist ein roter Test.**
4. **An Planteil 4: `_db/leihen.ts` hält das Lesemodell** — `geraeteMitLeihstand` gibt **exakt** die
   acht Felder, geprüft auf **Gleichheit**, nicht Teilmenge (`:5254-5258`).
5. **An Planteil 4: die HTTP-Grenze steht unangetastet.** `rg -n "RADIO_ADMIN_|api/v1/"
   src/app/m/radio` liefert nichts (`:5453`).
6. **An Planteil 5: NT11 ist erledigt** — `scripts/import/radio-paritaet.test.ts:140` steht auf
   `toBe(6)`, mit Sonde belegt (A8, Schritt 4). ⛔ Wer eine siebte Tabelle in `schema.ts` anlegt,
   hebt die Zahl **bewusst** an; wer eine herauszieht, bekommt einen roten Test.
7. **An Planteil 5: die sechs e2e-Namen und ihre drei Auflagen** stehen in NS-A12/NS-A13.
8. **An Planteil 5: der Text der Release-Notiz steht fertig in Spec `:3172-3187`**, mit genau einem
   Platzhalter `<N>`. ⛔ Er nennt **keine Codelänge und kein Sperrverfahren**.
9. **An das Cutover-Runbook: ⬜ L10 steht im Kopf von `_ui/AusleihRahmen.tsx`**, ⬜ **L9 ist mit
   „keine Kamerafläche" entschieden**.
10. **An alle: die zwei modulweiten Zähler sind die Abwehr, nicht `clientIpAus`.** Wer den
    Coderaum aus §3.2.1 verkürzt, macht die CWE-348-Umstellung zur **echten** Voraussetzung
    (§3.7.4). ⛔ **Die zwei Entscheidungen hängen aneinander und dürfen nicht getrennt geändert
    werden.**
11. **An alle: `/t/<code>` ist nach dem ersten Druck nicht mehr umbenennbar** (NS-Z3,
    `routen.test.ts` `toBe(6)`). `/abmelden` ist frei wählbar, darf aber **nicht** unter `t/` liegen.
12. **An alle: `RADIO_AUSLEIH_SITZUNG_SECRET`** (B2, `:91`) — ⛔ nicht `..._GEHEIMNIS`, nicht
    `RADIO_ZUGANG_SITZUNG_SECRET`.

---

## Selbstprüfung gegen den Entwurf

| Auflage aus dem Auftrag | Wo sie eingelöst ist |
|---|---|
| `riegel.test.ts` bewacht ab der ersten Zeile; **je Fläche steht, welche Riegelform** | „Elf Dinge" Punkt 1 (Tabelle der lebenden Klauseln) · Klausel (f) in **A11**, mit **positiver und negativer** Hälfte je Art · die Riegelform je Fläche in der Bauform-Zulässigkeitstafel und in A11/A18 |
| **Z-L3 wird geschlossen, und der Plan sagt WIE der Scan erweitert wird** | **A11**, Klausel (f) vollständig ausgeschrieben — mit der namentlichen Ausnahme für `src/app/m/radio/layout.tsx` (sonst rot-by-construction, Spec §1.3) und mit `AUSLEIH_FLAECHEN_ANZAHL` als exaktem Anhebe-Fahrplan (1 → 3 → 4 → 5) |
| **Die Brute-Force-Abwehr sind die ZWEI MODULWEITEN Zähler**, mit den Zahlen aus der Spec | **A3**, mit Zähler-Tabelle (5 / 30 / 300), den vier Eigenschaften, dem wörtlichen Zitat aus `absender.ts:30-33` und dem Egress-Befund **in seiner unbestimmten Form**
als Belegzeile (⬜ A-L6, ⬜ A-L12) |
| **Der Coderaum wird nicht verkürzt, mit Begründung** | „Elf Dinge" Punkt 3 und **A2** — beide Rechnungen mit Zahlen, plus der Grund, warum Rechnung A für `radio` **schlechter** ist als in der Spec (Egress-Kollaps) · Sonde S-A2a ist der Riegel |
| **Die HTTP-Grenze bleibt stehen; `/v1`-Berührungen sind benannt** | „Elf Dinge" Punkt 4 · Entscheidung E2 · „Nicht angefasst" · Abnahmebefehl `rg -n "RADIO_ADMIN_\|api/v1/"` in **A15** (Schritt 3) und im Abschluss von Block B — ⛔ **`rg`, nicht `grep`** |
| **NT11 als eigener Schritt, mit Mutationssonde** | **A8, Schritt 4** — inklusive der **umgekehrten Polarität** (die Sonde zeigt grün, und **das** ist der Befund) und der Auflösung des offenen Kommentar-Widerspruchs |
| **antd 6; „geht nicht 1:1" steht als eigene Entscheidung** | Die antd-Zuordnungstabelle · **E3** (kein Tag/Alert), **E4** (keine Table), **E5** (keine Icons), **E6** (keine Toasts), **E7** (kein Theme-Umschalter), **E8** (64 als CSS, gegen NS-Z5), **E9** (keine Shell) — jede mit Beleg |
| **Die vier antd/RSC-Fallen beachtet** | „Elf Dinge" Punkt 7 · Zulässigkeitstafel Zeilen 17–19 · je Aufgabe in Block B benannt |
| **Für JEDE Cookie-/Sitzungs-/Redirect-/Action-Stelle geprüft, ob die Bauform es zulässt** | **Die Bauform-Zulässigkeitstafel**, 19 Zeilen, jede mit Beleg — inklusive des vernarbten `cookies().delete()`-Falls (Zeile 3) und der zwei Fälle, in denen dieser Plan „NEIN, technisch unmöglich" sagt (Zeilen 3 und 5) |
| **Blöcke mit einem gemeinsamen Tor, ausdrücklich hin gesagt** | Architecture-Abschnitt (vorweg) · der eigene Kasten vor **A9** · beide Gründe einzeln hinreichend |
| **Benannte Leerstellen statt Erfindungen** | ⬜ L9, L10, Z-L3 (entsperrt) · ⬜ **A-L1…A-L14** (neu benannt), jede mit „wer liest sie wann ab" und einer **Belegzeile im Quelltext**. ⚠️ **A-L8 ist aufgelöst** (Spec `:3092` annotiert „Falle 61 (lagerbuch-Zählung)" selbst) — die Zeile bleibt durchgestrichen stehen, damit die Nummerierung hält |
| **Die Zusagen aus §3.10 und §4.12 sind eingelöst oder mit Eigentümer weitergereicht** | §3.10 Nr. 8 (Inline-Erneuerung) → **E12/E13**, gebaut in A9/A14/A17/A19/A20 · §3.10 Nr. 2 (`loans.zugangscode_id`) → **A17 Auflage 9** und ein eigener Testfall in A15 · §4.12 Nr. 4 (Ratenbegrenzung der anonymen Actions) → „Was Planteil 3 NICHT liefert", Eigentümer ⬜ A-L6 · §4.12 Nr. 11 (kein zweiter Statusfarbsatz) → **NS-A8b** · §4.12 Nr. 14 (Feldabgleich, **beide** Hälften) → **NS-A17b** |
| **Kopf und Schluss wie Planteil 2** | For-agentic-workers-Kasten · Stand · Goal · Architecture · Tech Stack · Spec · Leitplan · „Elf Dinge" · Global Constraints · Sperrtafel · „Was dieser Plan anlegt und ändert" · Reihenfolge-Tabelle · Aufgaben · Nachträge · „Was Planteil 3 NICHT liefert" · Nahtstellen zu 4 · Nahtstellen zu 5 · Zusagen · Selbstprüfung |

⚠️ **Fünf Stellen, an denen dieser Plan von einem Spec-Kapiteltext abweicht** — jede als benannte
Entscheidung mit Begründung, keine still gewählte Näherung:

1. **E1** — die Übersicht liegt an `/geraete`, nicht an `/`. Zwei Dateien auf demselben Pfad sind
   nicht baubar, und ein Gate unter dem umleitenden Layout wäre ein endloser Redirect. Kapitel 1
   §1.2.1 und das im Repo grüne `routen.test.ts` sind die Bestätigung.
2. **E8** — die 64px sind ein CSS-Modul, keine `ConfigProvider`-Ebene. §4.6.3 ist der speziellere
   Text und die baubare Form; NS-Z5 kollidierte mit der Server-Natur von `AusleihRahmen.tsx`.
3. **E11** — die zwei Ergebnistypen liegen in `_lib/meldungen.ts`, nicht in `_actions/ausleihe.ts`.
   Die Spec-Fassung ergibt einen Importzyklus mit `_db/leihen.ts`; die Signaturen selbst bleiben
   **wörtlich** und werden re-exportiert. Hauspräzedenz: `lagerbuch/_lib/actionTypen.ts`.
4. **E12** — die Ausnahmeliste des Guard-Scans hat **drei** Einträge, nicht die von Spec `:6762`
   gesetzten **zwei**. Grund: `erneuereSitzung` wird gebaut, weil Spec `:2258`, `:3108`,
   `:2563-2570` und Zusage §3.10 Nr. 8 sie an **vier** Stellen verlangen — und es keinen späteren
   Eigentümer gibt. ⬜ **A-L14** ist die Umfangsfrage an den Betreiber.
5. **E13** — die zwei `grund`-Unions tragen zusätzlich `"sitzung"` und `"gesperrt"`. Die
   Spec-Unions (`:3449`, `:3568`) haben keinen Träger für die Unterscheidung, die Zusage §3.10
   Nr. 8 verlangt; ohne sie ist der zweite Zweig von `SperrGrund` folgenlos.

⚠️ **Und eine Reihenfolge-Korrektur gegenüber dem ersten Entwurf dieses Plans, benannt statt still:**
`_db/leihen.ts` stand zunächst als erste Aufgabe von Block B. Das war falsch — sie **konsumiert**
A12, A13 und A14. Die heutige Reihenfolge (reine Funktionen → Datenschicht → Rahmen → Actions →
Seiten) ist die einzige, in der keine Aufgabe stubben muss.
