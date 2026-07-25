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
