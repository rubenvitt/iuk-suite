# Redesign Modul `feedback` — Nacharbeit zu Teil 2

> **Für agentische Umsetzung:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development`.

**Ziel:** Die vier offenen Punkte aus der Umsetzung von Teil 2 schließen — ein Produktions-Blocker, eine
CI-Zeitbombe, ein wertloser Test und die gesammelten Detailfunde der Reviews. Danach die E2E-Strecke
nachholen, die am Produktions-Blocker gescheitert ist.

**Verbindlicher Entwurf:** `docs/design/feedback-oeffentliche-ansicht.md`.

**Globale Randbedingungen:** wie in Teil 2 (Schulnote invertiert, kein antd auf `/f/**`, `#c8000f` dort
nur zweimal, Farb-Klausel, RSC-Falle, Commit-Trailer).

---

### Task N1: Der Host-Header nach `redirect()` — öffentliche Strecke endet auf der Login-Seite

**Produktions-Blocker, gefunden durch E2E** (Task 15 ist daran gescheitert; Unit-Tests können ihn
nicht sehen).

**Diagnose, belegt durch Instrumentierung von `src/proxy.ts`:** Nach einem `redirect()` in einer Server
Action rendert Next das Ziel über eine **interne** Anfrage. Diese trägt `host: localhost:<port>`; der
echte Host steht nur in `x-forwarded-host` (`origin`/`referer` ebenfalls korrekt). `src/proxy.ts` liest
ausschließlich `req.headers.get("host")` → `moduleForHost` findet kein Modul → `decideRoute` fällt auf
`portal` zurück → `portal` verlangt Auth → die anonyme Teilnehmerin wird auf die **Login-Seite**
geleitet.

**Wirkung:** Wer das Feedback-Formular absendet, landet nicht auf „Danke", sondern im Login. Der
gesamte öffentliche Ablauf ist damit in Produktion tot, sobald die Suite hinter einem Reverse-Proxy
läuft — und das tut sie.

**Files:**
- Modify: `src/proxy.ts`
- Test: `src/core/routing.test.ts` bzw. `src/proxy.test.ts` (dort, wo die Host-Auflösung heute getestet
  wird)

**Interfaces:**
- Die Host-Auflösung wird eine benannte Funktion mit Vorrangregel:
  `x-forwarded-host` (erster Wert bei Kommaliste) → `host`. Ein leerer oder fehlender
  `x-forwarded-host` fällt auf `host` zurück.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- `x-forwarded-host: feedback.localtest.me:3100` bei `host: localhost:3100` → das Modul `feedback`
  wird aufgelöst, **nicht** `portal`.
- Kein `x-forwarded-host` → Verhalten unverändert wie heute (Regressionssicherung für alle anderen
  Module).
- `x-forwarded-host` als Kommaliste (`a.example, b.example`) → der **erste** Wert gewinnt (das ist der
  ursprüngliche Client-Host; der Rest sind Zwischenstationen).
- `x-forwarded-host` leer → Rückfall auf `host`, nicht „kein Modul".
- Port im Header wird wie bisher behandelt (die bestehende Host-Normalisierung bleibt gültig).
- **Sicherheitsgrenze, ausdrücklich:** Ein gefälschter `x-forwarded-host` verschiebt nur die
  **Modulauswahl**, nicht die Berechtigung. Test: mit gefälschtem Header auf ein Modul mit
  `requiredGroups` → weiterhin `forbidden`/`login`, **kein** Zugang. Das ist die Zusicherung, die
  diesen Fix unbedenklich macht, und sie muss automatisiert belegt sein.

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/core src/proxy.test.ts` + `pnpm typecheck` + `pnpm build`.

- [ ] **Schritt 5: Commit**

`fix(core): x-forwarded-host bei der Modulauflösung — Danke-Seite statt Login nach dem Absenden`

---

### Task N2: Zeitbombe und wertloser Test aus Task 14

Beide Punkte stammen aus dem Review von Task 14, das mit `NEEDS_FIXES` endete.

**Files:**
- Modify: `src/app/m/feedback/f/[slugSecret]/page.test.tsx`,
  `src/app/m/feedback/actions.test.ts`

- [ ] **Schritt 1: Die beiden Defekte beheben**

**(a) CRITICAL — Zeitbombe.** `page.test.tsx` („nennt bei manuell geschlossener Umfrage den früheren
der beiden Zeitpunkte") setzt `closedAt` auf ein **absolutes** Datum, während die Prüfung
`jetzt - min(closesAt, closedAt) < 48 h` gegen die Wanduhr läuft. Der Abstand wächst stündlich; der
Test kippt ab dem 25.07.2026 07:00 UTC und bleibt danach rot. **Fix:** Zeit im Test einfrieren
(`vi.setSystemTime`) oder alle Zeitpunkte **relativ** zu `jetzt` bilden. Zusätzlich prüfen, ob weitere
Tests derselben Datei absolute Daten gegen ein Zeitfenster stellen — dieselbe Klasse, dieselbe
Behebung.

**(b) IMPORTANT — Test beweist nichts.** `actions.test.ts` („die nächste Abgabe derselben IP landet als
eigene Zeile") behauptet, der Kernfall des geteilten Geräts sei belegt. `submitResponseAction` **liest**
das Dedup-Cookie aber nie (es wird nur gesetzt; gelesen wird es in `page.tsx`). Zwei aufeinanderfolgende
Abgaben ergeben deshalb **immer** zwei Zeilen — mit oder ohne `releaseDeviceAction`. **Fix:** Entweder
den Test dorthin verlegen, wo das Cookie tatsächlich gelesen wird (`page.tsx`-Ebene, sodass er
fehlschlagen **kann**), oder ihn ersatzlos entfernen und die Zusage „geteiltes Gerät" allein im
E2E-Szenario (Task N4) belegen. **Nicht** stehen lassen — ein Test, der nicht fehlschlagen kann, ist
eine falsche Zusicherung.

- [ ] **Schritt 2: Mutationsprobe** — bei beiden Tests: Implementierungszeile umdrehen, Fehlschlag
      bestätigen, zurücksetzen. Ein Test, der das nicht überlebt, gehört nicht in die Suite.

- [ ] **Schritt 3: Tests laufen lassen** · [ ] **Schritt 4: Commit**

`fix(feedback): Zeitbombe im Zustandstest entschärft, wertlosen Dedup-Test ersetzt`

---

### Task N3: Politur der öffentlichen Ansicht — die gesammelten Detailfunde

Zwölf Funde aus den Reviews der Tasks 11–14. Einzeln „Minor", zusammen genau der Unterschied zwischen
„funktioniert" und „ist schön". **Bindend:** `docs/design/feedback-oeffentliche-ansicht.md` Abschnitte
3.2, 3.5, 3.6, 3.7, 3.8, 3.10.

**Files:** `Zettel.tsx`, `zettel.module.css`, `page.tsx`, `Zustaende.tsx`, `thanks/page.tsx`,
`Zettel.test.tsx`

- [ ] **Schritt 1: Je Fund ein Test (wo testbar), dann beheben**

1. **Legendenstreifen zeigt neben die Chips.** `.streifen` hat **kein** `gap`, `.chips` und `.woerter`
   haben `gap: 6px`. Die Farbstopps liegen damit bis ~5px neben der Spalte, auf die sie zeigen. Abschnitt
   3.2 Punkt 3 verlangt das „identische 6-Spalten-Raster", und Abschnitt 3.6 nennt die Spaltengleichheit
   **Träger 1** der Richtungserkennung. Fix: dasselbe Raster mit `gap` (Test: die Segmentgrenzen
   entsprechen den Chipgrenzen, nicht nur die Containerbreite).
2. **Hover fehlt genau dort, wo er hilft.** `.chips:has(input:checked) .chip` hat Spezifität (0,3,1) und
   überschreibt `.chip:hover` (0,2,0) — in jeder **schon beantworteten** Zeile gibt es keine
   Hover-Rückmeldung mehr, also beim Ändern einer Note. Fix: Spezifität angleichen.
3. **Layout springt bei jeder Notenwahl.** Die Fußnote („3 · befriedigend") belegt vorher keinen Platz
   und verlängert die Zeile um ~27px, während der Finger zur nächsten Zeile wandert. Fix: Platz
   reservieren (Höhe vorhalten, Sichtbarkeit umschalten), damit die Auswahl nichts verschiebt.
4. **Entwurf wird bei jedem Absende*versuch* gelöscht**, nicht erst bei Erfolg (Abschnitt 3.7 verlangt
   „bei erfolgreichem Absenden"). Nach einem abgelehnten Absenden und einem Reload sind die Freitexte
   weg. Fix: erst löschen, wenn das Ergebnis `ok` ist.
5. **„Beantwortet"-Signal lügt bei Leerzeichen.** `data-gefuellt` wird schon bei einer Zeile gesetzt, die
   nur Leerraum enthält — der Server verwirft genau diesen Wert. Da die kräftigere Grundlinie
   ausdrücklich das verbotene Erledigt-Häkchen ersetzt, trägt sie hier eine Falschaussage. Fix: gegen
   den getrimmten Wert prüfen.
6. **Zeichenzähler ist für Screenreader unsichtbar.** Abschnitt 3.10 verlangt `aria-live="polite"`
   (gedrosselt) ab 420 Zeichen; der Zähler hat weder Live-Region noch `aria-describedby`.
7. **`aria-live` schweigt beim zweiten Tipp.** Wird zweimal mit derselben Lückenlage getippt, setzt der
   Zustand denselben String, React rendert nicht neu, die Ansage bleibt stumm. Fix: Ansage so führen,
   dass Wiederholungen angekündigt werden.
8. **Doppelte Ankündigung.** Die Meldung trägt `role="alert"` **und** wird programmatisch fokussiert —
   Screenreader kündigen sie dadurch möglicherweise zweimal an. Eines von beidem.
9. **Der Lückenspringer sendet mit veraltetem Label.** Sagt der DOM-Abgleich „nichts fehlt", wird
   `requestSubmit()` gerufen — in diesem Zweig trägt der Knopf noch „Noch 8 Noten offen" und die
   Übersicht acht gestrichelte Kacheln. Fix: Zustand vor dem Absenden angleichen.
10. **Pending-Zustand fehlt.** Abschnitt 3.8 verlangt beim Absenden `aria-busy`, Label „Wird gesendet…",
    `disabled` — ohne Spinner, ohne Layoutverschiebung. `grep` findet nichts davon.
11. **Weitergabe-Abschnitt ist bedingt statt unbedingt.** Auf der Danke-Seite hängt er an einer
    Bedingung, obwohl Entwurf und Kommentar ihn unbedingt vorsehen — genau dieser Weg löst das
    geteilte-Handy-Problem.
12. **Leeres Thema ergibt leere Überschrift.** `topic ?? "Dienstabend am …"` fängt nur `null`, nicht den
    leeren String; der **Import** normalisiert nicht (der Admin-Pfad tut es). Fix: auf leer prüfen, nicht
    auf `null`. Dieselbe Klasse steht in zwei Admin-Seiten — dort mitziehen.
13. **`color-mix` ohne Rückfall.** Im `stars`-Zweig ist `--note-hell` ein `color-mix(...)`; kennt ein
    Browser es nicht, ist `background` ungültig → **transparent**, und die weiße Ziffer steht unsichtbar
    auf dem hellen Blatt. Fix: Vollfarbe als Rückfall vor der `color-mix`-Deklaration.

- [ ] **Schritt 2: Tests laufen lassen** — `pnpm vitest run src/app/m/feedback` + `pnpm lint`
- [ ] **Schritt 3: Commit**

`fix(feedback): Politur des Abendzettels — Raster, Hover, Layoutsprung, Entwurf, Barrierefreiheit`

---

### Task N4: E2E der öffentlichen Strecke (Nachholung von Task 15)

Setzt Task N1 voraus — vorher scheitert das Szenario am Produktions-Blocker, nicht am Test.

**Files:** `e2e/feedback.spec.ts` (umschreiben — der Bestand kodiert den alten
draft→active-Ablauf und die Sterne-Oberfläche)

- [ ] **Schritt 1: Szenarien**

- Vollständige Abgabe auf **mobilem** Viewport (390×844): acht Noten, absenden, **Danke-Seite** (nicht
  Login — das ist der Regressionstest für N1).
- Unvollständig: Knopf zeigt „Noch N Noten offen", Tipp springt zur Lücke, sendet **nicht**.
- Freitext über 500 Zeichen wird an der Grenze gestoppt.
- Geschlossene Umfrage → Zustand D; **zwischen zwei Abenden** → Zustand C („keine Umfrage"), nicht D.
- Geteiltes Gerät: nach Abgabe „Leeren Bogen öffnen" → neue Abgabe möglich (die Zusage, die N2 aus den
  Unit-Tests entfernt hat, wird **hier** belegt).
- **Ohne JavaScript** (`javaScriptEnabled: false`): acht Noten wählbar, Absenden funktioniert,
  `required` greift. Kernzusage des Entwurfs — automatisiert belegt, nicht behauptet.
- Dunkelmodus: Umschalter auf dunkel → die Notenfelder tragen die Dunkel-Palette.

- [ ] **Schritt 2: Laufen lassen** — `pnpm exec playwright test e2e/feedback.spec.ts`
- [ ] **Schritt 3: Commit**

`test(feedback): E2E der öffentlichen Strecke inkl. ohne JavaScript, mobil und geteiltem Gerät`

---

# Nacharbeit zu Teil 3 (Admin)

### Task N5: Druck-Aushang im Dunkelmodus — weiß auf weiß

**CRITICAL.** `(print)/druck.css` setzt `color: var(--fb-ink)` bzw. `var(--fb-muted)`; bei
`data-theme="dark"` sind das `rgba(255,255,255,.88)` / `.55`. Auf Papier ist das **unlesbar** — und am
Bildschirm fällt es nicht auf, weil das Root-Layout `colorScheme` setzt und die Leinwand mit
einfärbt. Wer im Dunkelmodus auf „Aushang drucken" tippt, bekommt ein weißes Blatt.

**Files:** `src/app/m/feedback/(print)/druck.css` (+ Test)

- [ ] **Schritt 1: Test** — im Druckstylesheet sind die Textfarben **modusunabhängig** (Quelltext-
  Assertion: im `@media print`-Block keine Variable, die vom Theme abhängt; stattdessen feste dunkle
  Werte auf weißem Grund). Zusätzlich: `-webkit-print-color-adjust: exact` dort, wo Farbe tragend ist.
- [ ] **Schritt 2: Umsetzen** — Druck erzwingt Schwarz auf Weiß, unabhängig von `data-theme`.
- [ ] **Schritt 3: Commit** — `fix(feedback): Aushang druckt schwarz auf weiss, auch im Dunkelmodus`

---

### Task N6: Lagekarte vervollständigen — Zwischenstand, Aktualisierer, QR-Handgriff

Vier Anforderungen der bindenden Abschnitte sind nicht umgesetzt; eine davon hat mein Plan selbst
übersehen. **Bindend:** `docs/design/feedback-admin.md` §2.1, §2.3, §2.4, §4.2, §4.5, §2.7.

**Files:** `_ui/Lagekarte.tsx`, `_ui/Aktualisierer.tsx` (neu), `(admin)/groups/[groupId]/page.tsx`,
`_ui/Teilnahme.tsx`, `_ui/feedback.css` (+ Tests)

**NICHT in dieser Aufgabe:** `_lib/aggregation.ts`. Die Datei ist von der globalen Randbedingung
„aggregation nicht antasten" geschützt; die **einzige** erlaubte Ausnahme ist **Task 22** in
`2026-07-24-feedback-redesign-teil3.md` (Zeilen 360–378), die `verteilungJeFrage` dort als „rein
additiv" ausweist. Siehe die Abgrenzung unter Anforderung 1.

- [ ] **Schritt 1: Je Anforderung ein Test, dann umsetzen**

1. **Der Block ZWISCHENSTAND fehlt vollständig** (§2.3) — das ist die Live-Auswertung, deren Fehlen der
   Auftraggeber ausdrücklich beanstandet hat („während des Dienstabends sieht der Gruppenleiter null
   Rückmeldungen"). Verlangt **hier**: Kicker „ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG", bei 1–2 Antworten
   der Hinweis „Erst 2 Rückmeldungen — die Zahlen schwanken noch stark.", und die **gezählten**
   Freitexte („5 Freitexte — in der Auswertung nachlesen").

   **Abgrenzung — Notenlegende und die acht kompakten Notenspuren gehören NICHT in diese Aufgabe.**
   Dieser Absatz hat §2.3 zunächst vollständig zitiert und dabei die Abgrenzung übersehen, die im
   Vorgängerplan schon steht: `2026-07-24-feedback-redesign-teil3.md`, Task 18 („**Notenlegende und die
   acht kompakten Notenspuren nicht**: sie brauchen eine Verteilung je Frage, die `computeDAStats` nicht
   liefert. Diese Funktion (`verteilungJeFrage`) ist **Task 22** zugeordnet, weil §3.2 dieselbe
   Datenlage für die Auswertungsseite braucht") und Task 22 selbst, der `_lib/aggregation.ts` als
   „ausdrücklich erlaubte Ausnahme" führt und die beiden Bauteile der Lagekarte dort fertigstellt.
   `NotenspurProps.verteilung` verlangt laut `_ui/Noten.tsx:161-171` eine ECHTE Verteilung („ein
   Mittelwert hat hier nichts zu suchen"); `DAStats` liefert nur `avg`/`overallAvg`/`avgSchulnote`. Ohne
   `verteilungJeFrage` ist der Abschnitt hier nicht baubar, und die Funktion in dieser Aufgabe zu
   ergänzen hieße, Task 22 halb zu erledigen (§3.2-Verdrahtung, `prompt/page.tsx`, FullShell-Link
   blieben offen) und die Randbedingung ohne Auftrag zu brechen. Der Merkposten steht als Kommentar am
   Zwischenstand-Block in `_ui/Lagekarte.tsx` und fällt mit Task 22.
2. **`_ui/Aktualisierer.tsx` fehlt** (§4.5): alle 30 s `router.refresh()`, **nur** bei laufender Umfrage
   **und** `document.visibilityState === "visible"`; unter dem Zähler „Stand: 21:47" plus einen
   „Aktualisieren"-Textknopf. (Mein Plan nennt die Insel nirgends — das ist eine Planlücke, nicht ein
   Fehler der Umsetzung.)
3. **„QR-Code groß zeigen" fehlt als Handgriff** (§2.3/§2.4): Primäraktion in den Belegungen C und D,
   Sekundäraktion in A und B. §2.4 nennt ihn „den zeitkritischen Handgriff im Gruppenraum … in jedem
   Zustand ein Tipp weit oben". In `LaufendeKarte` gibt es derzeit **keine** Primäraktion.
4. **Mobile Werte und zwei Textstellen:** `body.padding: 16` auf 390px (§2.1, gebaut ist fest 20) — §2.1
   ist mit „Kartenstil (**alle** Zonen)" überschrieben, das gilt also auch für Zone a
   (`_ui/Teilnahme.tsx`) und „Letzter Abend"; ein Polster nur in der Lagekarte erzeugt auf 390px eine
   Ungleichheit, die vorher nicht existierte · der
   Ø-Halbsatz der Kontextzeile („… · Ø der letzten sechs: 2,1 gut", §4.2) · „Letzter Abend" als
   `Button` in `default` statt als nackter Link (§2.7 sagt ausdrücklich „bewusst kein Primärknopf",
   meint aber einen Knopf).
5. **iOS-Zoom-Riegel** (§4.14, wörtlich vorgegeben und bislang nicht in `feedback.css`):
   unter 600px `font-size: 16px` für `input`/`textarea`/`.ant-select-selector` — `token.fontSize` ist
   14, darunter zoomt iOS beim Fokus.

- [ ] **Schritt 2: Tests laufen lassen** · [ ] **Schritt 3: Commit**

`feat(feedback): Zwischenstand in der Lagekarte, Auto-Aktualisierung, QR-Handgriff`

---

### Task N7: `avgSchulnote` in der Anzeige ankommen lassen

Der stille Rechenfehler ist **berechnet, aber nicht beseitigt**: `avgSchulnote` hat keinen einzigen
Leser. `computeGroupTrend`, `(admin)/vergleich/page.tsx` und die Auswertungsseite lesen weiterhin
`overallAvg` — obwohl §4.12 sagt, dass **jede** Ampeldarstellung (Pille, Plakette, Funke, Trendlinie,
Vergleich) `avgSchulnote` liest. Belegt: die `computeGroupTrend`-Tests bleiben identisch grün, wenn im
Fixture `avgSchulnote: null` stünde.

**Files:** `_lib/aggregation.ts`, `(admin)/vergleich/page.tsx`,
`…/evenings/[eveningId]/auswertung/page.tsx`, `…/export.csv/route.ts` (+ Tests)

- [ ] **Schritt 1: Tests**

- Ein Fragebogen mit gemischten Skalen: die **Ampelfarbe** richtet sich nach `avgSchulnote`, nicht nach
  `overallAvg`. Mutationsprobe: `avgSchulnote` im Fixture auf `null` → der Test **muss** fehlschlagen
  (genau das tut er heute nicht).
- `computeGroupTrend` gewichtet mit `avgSchulnote`; Abende ohne Schulnotenfrage fallen aus der Kurve
  statt sie zu verfälschen.
- Zeilen mit `hasLegacyScale` tragen die Fußnote aus §4.12.
- **CSV-Spaltenname:** Die Spalte heißt „Zeitstempel", enthält nach der Normalisierung aber nur einen
  Kalendertag — und in jeder Zeile denselben, der schon in der Metadatenzeile „Datum" steht. Umbenennen
  (oder streichen), damit der Name nicht eine Genauigkeit verspricht, die die Ausgabe bewusst nicht mehr
  hat.
- **Farb-Klausel-Riegel rekursiv machen:** der Test liest `_ui/` mit `readdirSync` **ohne** Rekursion und
  verwirft Unterverzeichnisse still. Eine spätere Datei `_ui/charts/Foo.tsx` entzieht sich damit sowohl
  der Farb-Klausel als auch der `--ant-*`-Sperre — und „still" ist der einzige Grund, aus dem diese
  Assertionen existieren.

- [ ] **Schritt 2: Tests laufen lassen** · [ ] **Schritt 3: Commit**

`fix(feedback): Ampel und Trend lesen den Schulnoten-Mittelwert statt des gemischten`
