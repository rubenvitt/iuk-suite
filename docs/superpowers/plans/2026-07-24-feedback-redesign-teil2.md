# Redesign Modul `feedback` — Implementierungsplan, Teil 2: Öffentliche Ansicht („Der Abendzettel")

> **Für agentische Umsetzung:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development`.

**Ziel:** Die Route `/f/**` von einer 14-fach-Endlosliste mit grauen Sternen in den verbindlich
entworfenen „Abendzettel" verwandeln — und dabei drei echte Defekte schließen, die dabei aufgefallen
sind (Rate-Limit sperrt die eigene Gruppe aus, keine Pflichtprüfung, Antwortreihenfolge verrät die
Person).

**Verbindlicher Entwurf:** `docs/design/feedback-oeffentliche-ansicht.md`. Dort stehen alle exakten
Werte (Farben, Typo-Stufen, Abstände, Bewegung, Wortlaute). **Dieser Plan wiederholt sie nicht** —
jede Aufgabe nennt den Abschnitt, der sie bindet. Die Abschnittsnummern sind verbindlich zu lesen,
nicht zu erraten.

**Spec:** `docs/superpowers/specs/2026-07-24-feedback-redesign-design.md`.

## Globale Randbedingungen

- **Kein antd auf der Route `/f/**`** — auch nicht in Client Components. Damit ist die
  Compound-Falle strukturell ausgeschlossen. Keine Animationsbibliothek, keine Icons, keine Bilder.
- **Schulnote 1–6, invertiert.** 1 = sehr gut (grün), 6 = ungenügend (rot). Keine „mehr = besser"-Metapher.
- **DRK-Rot `#c8000f` nur zweimal:** 3px-Fahne oben, Wortzeichen „DRK". Nie als Knopffüllung, nie als
  Fehlerfarbe, nie als Fokusring. Außer diesen zwei Stellen darf `#c8000f` auf dieser Route nicht
  vorkommen.
- **Anrede durchgehend „Du".**
- **Ohne JavaScript vollständig bedienbar.** Es gibt **eine** Client Component, die serverseitig
  mitgerendert wird — **kein** Austausch der Oberfläche nach der Hydration.
- **Kein `<input>`/`<textarea>` unter 16px** (sonst zoomt iOS beim Fokus).
- Test-Harness für DOM-Verhalten: das etablierte Muster des qr-Moduls
  (`src/app/m/qr/_lib/test-dom.tsx` — `mount`/`fill`/`click`/`query`/`submitForm`). Nutze es, statt
  ein zweites Harness zu erfinden.
- Commit-Trailer an jedem Commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` und
  `Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX`

---

### Task 7: Rate-Limit entkoppeln — die eigene Gruppe nicht aussperren

**Der Defekt:** `actions.ts` nutzt einen Limiter mit `windowMs: 60_000, max: 10`, Schlüssel = Client-IP.
Fünfzehn Ehrenamtliche scannen um 21:30 aus **einem** Vereins-WLAN — sie teilen eine NAT-IP. Ab der
elften Abgabe pro Minute antwortet das Werkzeug „Zu viele Anfragen". Der Kernfall ist damit tot.
Gleichzeitig darf der Brute-Force-Schutz gegen geratene Secrets **nicht** verloren gehen — er war das
Ergebnis eines früheren Reviews.

**Bindend:** `docs/design/feedback-oeffentliche-ansicht.md` Abschnitt 3.8, Unterabschnitt „Ratelimit".

**Files:**
- Modify: `src/app/m/feedback/actions.ts`
- Test: `src/app/m/feedback/actions.test.ts`

**Interfaces:**
- Produces: zwei Limiter statt einem —
  `tokenGuard` (`windowMs: 60_000, max: 10`, Schlüssel = IP) zählt **nur ungültige Token/Secrets**;
  `submitLimiter` (`windowMs: 600_000, max: 60`, Schlüssel = `` `${ip}|${surveyId}` ``) zählt echte Abgaben.
- Reihenfolge: Token parsen → ungültig ⇒ `tokenGuard` + `invalid` · Secret falsch ⇒ dito · dann
  `submitLimiter`.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- **Der Kernfall:** 15 Abgaben derselben IP für dieselbe Umfrage innerhalb einer Minute → **alle**
  gehen durch. (Dieser Test schlägt heute fehl — er ist der Beweis des Defekts.)
- **Brute-Force bleibt:** 11 Anfragen derselben IP mit **ungültigem** Token in einer Minute → die 11.
  wird gebremst.
- Ungültige Token einer IP verbrauchen **kein** Budget für gültige Abgaben (die Limiter sind getrennt).
- Zwei verschiedene Umfragen derselben IP haben getrennte Budgets.
- Die Obergrenze greift trotzdem: 61 Abgaben derselben IP für dieselbe Umfrage in 10 Minuten → die 61.
  wird gebremst.

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/actions.test.ts` — erwartet: FAIL beim Kernfall.

- [ ] **Schritt 3: Umsetzen**

Beide Limiter anlegen, Reihenfolge wie oben. Die bestehende `clientIp()`-Ermittlung
(`cf-connecting-ip` → `x-forwarded-for[0]` → `"unknown"`) bleibt unverändert.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`fix(feedback): getrennte Limiter — 15 Abgaben aus einem WLAN sperren die Gruppe nicht mehr aus`

---

### Task 8: Anonymität einlösen — Zeitstempel und Reihenfolge

**Der Defekt:** `submitted_at` wird sekundengenau gespeichert, und Antworten werden **ohne `ORDER BY`**
gelesen, also in Eingangsreihenfolge. Bei rund 15 Personen, die über ihren eigenen Gruppenleiter
urteilen, ist die Reihenfolge allein ein Deanonymisierungskanal — wer als Erster ging, steht oben. Der
Siegeltext des Entwurfs sagt „keine Uhrzeit" und „in zufälliger Reihenfolge"; **diese Zusage darf nicht
ausgeliefert werden, solange sie nicht wahr ist.**

Geprüft: `submittedAt` wird außerhalb von Tests nur an **einer** Stelle gelesen
(`…/export.csv/route.ts`, eine ISO-Spalte). Aggregation und Lebenszyklus nutzen die Spalte nicht.

**Bindend:** Abschnitt 3.9.

**Files:**
- Modify: `src/app/m/feedback/_db/queries.ts`, `src/app/m/feedback/_lib/aggregation.ts`
- Test: `src/app/m/feedback/_db/queries.test.ts`, `src/app/m/feedback/_lib/aggregation.test.ts`

**Interfaces:**
- `insertResponse(db, surveyId, answers, at)` — der Aufrufer übergibt künftig **Mitternacht UTC des
  Abenddatums** statt `now`. Die Signatur bleibt, die Bedeutung des Arguments ändert sich.
- Produces: `shuffleStable<T>(items: T[], keyOf: (t: T) => string): T[]` — deterministische
  Durchmischung über FNV-1a-Hash. Gleiche Eingabe → gleiche Ausgabe (testbar), aber entkoppelt von der
  Eingangsreihenfolge.
- Die CSV-Route nutzt **dieselbe** Ordnung wie die Auswertung.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Zwei Antworten, im Abstand von Sekunden abgegeben → **identischer** `submittedAt` (das Abenddatum).
- `shuffleStable` ist deterministisch: zweimal dieselbe Eingabe → identische Reihenfolge.
- `shuffleStable` ist **nicht** die Identität: für eine Menge von 15 verschiedenen Antworten
  unterscheidet sich die Ausgabereihenfolge von der Eingabereihenfolge. (Ohne diesen Test wäre eine
  Implementierung, die einfach nichts tut, „grün".)
- Alle Elemente bleiben erhalten (keins verloren, keins doppelt).
- Die Aggregation liefert **dieselben** Durchschnitte wie vorher — die Durchmischung darf die
  Auswertung nicht verändern. (Regressionssicherung: `aggregation` ist getesteter Bestand.)
- Altbestand: bereits importierte Antworten mit sekundengenauem Zeitstempel bleiben unverändert
  lesbar — der Import wird **nicht** angefasst (er muss die Parität halten).

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/_db src/app/m/feedback/_lib/aggregation.test.ts` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Aufrufer von `insertResponse` auf das Abenddatum umstellen. `shuffleStable` implementieren und in der
Leseordnung von Freitexten/Antwortlisten anwenden — sowohl in der Auswertung als auch in der
CSV-Route.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback` — erwartet: PASS, inklusive der Alt-Tests von `aggregation` und
`csv`.

- [ ] **Schritt 5: Commit**

`feat(feedback): Zeitstempel auf den Abend gerundet, stabile Durchmischung der Freitexte`

---

### Task 9: Pflichtprüfung und Zeichengrenze serverseitig

**Der Defekt:** Eine vollständig leere Absendung wird heute als vollwertige Rückmeldung gespeichert und
verfälscht Rücklaufquote und Durchschnitte. Die Oberfläche verhindert das künftig auf zwei Wegen (mit
JS: Lückenspringer; ohne JS: `required`) — der Server ist die **letzte** Linie und muss unabhängig
davon prüfen.

**Bindend:** Abschnitt 3.6 („Pflicht ohne Prüfungsgefühl", letzter Punkt) und 3.7 („500 Zeichen").

**Files:**
- Modify: `src/app/m/feedback/actions.ts`, `src/app/m/feedback/_lib/questions.ts`
- Test: `src/app/m/feedback/actions.test.ts`, `src/app/m/feedback/_lib/questions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type SubmitResult =
    | { ok: true }
    | { ok: false; code: "invalid" | "none" | "closed" | "ratelimit" | "incomplete"; missing?: string[] };
  ```
  `submitResponseAction` **gibt zurück statt zu werfen** (bei Erfolg `redirect`). Das ist die
  Voraussetzung dafür, dass die Oberfläche Fehler am Ort zeigen kann statt auf einer technischen
  Fehlerseite zu landen.
- `coerceAnswer` schneidet Freitexte serverseitig auf 500 Zeichen (`slice(0, 500)`).

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Absendung ohne jede Note → `{ ok: false, code: "incomplete" }`, `missing` nennt alle acht Fragen-Ids,
  **kein** Datensatz in der Datenbank.
- Absendung mit sieben von acht Noten → `incomplete`, `missing` nennt genau die fehlende.
- Absendung mit allen acht Noten und **ohne** Freitext → `{ ok: true }` (Freitexte sind freiwillig).
- Freitext mit 600 Zeichen → gespeichert werden genau 500.
- Note außerhalb 1–6 → wird verworfen und zählt als fehlend (bestehendes `coerceAnswer`-Verhalten,
  jetzt mit Konsequenz).
- Geschlossene Umfrage → `{ ok: false, code: "closed" }`, kein Datensatz. Auch auf dem Submit-Pfad,
  nicht nur beim Anzeigen (das war bereits Anforderung der Port-Spec und muss erhalten bleiben).

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/actions.test.ts` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Rückgabetyp einführen, alle `throw`-Pfade der Action auf Rückgaben umstellen. Achtung: `redirect()` in
Next wirft intern — der Erfolgspfad bleibt `redirect`, und der darf **nicht** von einem `try/catch`
verschluckt werden.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback` + `pnpm typecheck` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`feat(feedback): Pflichtnoten und Zeichengrenze serverseitig, Action gibt Ergebnis zurück`

---

### Task 10: Fundament der Oberfläche — Theme-Signal, Hülle, Notenpalette

Drei Voraussetzungen in einer Aufgabe, weil alle drei von Task 11 an gebraucht werden.

**(a) Theme-Signal.** CSS kann heute nicht auf den Hell/Dunkel-Modus selektieren, weil `<html>` nur
`style={{ colorScheme }}` trägt. Auf `prefers-color-scheme` zu selektieren wäre **falsch** — die Suite
hat einen **Umschalter** (Cookie `iuk-theme`, serverseitig gelesen), und dann bricht der Fall „System
dunkel, Umschalter hell". Zusätzlich: `AntdProvider.setMode` wechselt den Modus **ohne Reload** und
muss `document.documentElement.dataset.theme` mitschreiben — sonst bleiben eigene CSS-Variablen bis zur
nächsten Navigation auf dem alten Modus stehen.

**(b) Hülle.** Die `/f/`-Hülle verliert `maxWidth`/`padding` — die 3px-Fahne muss randlos laufen.

**(c) Notenpalette als gemeinsame Grundlage.** Die Schulnoten-Palette wird von **beiden** Routen
gebraucht (`/f/**` und `(admin)`) — „eine Definition, zwei Verwendungen". Sie liegt **beim Modul**,
nicht in `core/theme/tokens.ts`: die Palette trägt die Bedeutung eines Fachbereichs, nicht den
Farbeindruck der Suite, und beide Nutznießer sind Routen desselben Moduls. Weil `tokens.ts` im
Docstring beansprucht, „die einzige Datei mit Hex-Codes" zu sein, wird dieser Anspruch dort präzisiert
statt stillschweigend verletzt.

**Bindend:** `docs/design/feedback-oeffentliche-ansicht.md` Abschnitt 3.4 (Notenfarben hell/dunkel,
Tonwertkeil, Dunkelmodus-Signal) und 3.11 (Hülle) · `docs/design/feedback-admin.md` Abschnitt 4.11
(Ampel-Schwellen), 4.12 (`stars`), 5.1 Punkt 2 und 3.

**Files:**
- Create: `src/app/m/feedback/_lib/noten.ts` + Test
- Modify: `src/app/layout.tsx`, `src/core/theme/AntdProvider.tsx`, `src/core/theme/tokens.ts`
  (nur Docstring), `src/app/m/feedback/f/layout.tsx`
- Test: Ergänzung im bestehenden Layout-Test

**Interfaces:**
- Produces:
  - `<html data-theme="light" | "dark">` — verbindlicher Selektor für alle künftigen CSS-Module der
    Suite. `style={{ colorScheme }}` bleibt zusätzlich erhalten.
  - `NOTEN_HELL: readonly string[]` / `NOTEN_DUNKEL: readonly string[]` — je sechs Werte, Index 0 = Note 1.
    **Wortgenau** die Werte aus Abschnitt 3.4.
  - `NOTEN_WORT: readonly string[]` — „sehr gut" … „ungenügend".
  - `notenFarbe(note: number, mode: "light" | "dark"): string`
  - `ampelStufe(durchschnitt: number): 1 | 2 | 3 | 4 | 5 | 6` — Einfärbung eines Mittelwerts nach den
    Schwellen aus Abschnitt 4.11.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Bei Modus hell trägt `<html>` `data-theme="light"`, bei dunkel `"dark"`; `colorScheme` bleibt
  zusätzlich gesetzt (keine Regression).
- `setMode` schreibt `dataset.theme` auf dem Wurzelelement mit — ohne Navigation.
- Die `/f/`-Hülle setzt **keine** Maximalbreite und **kein** Innenabstand mehr.
- Die `/f/`-Hülle importiert **kein** antd (Quelltext-Assertion — der Entwurf verlangt antd-Freiheit
  auf dieser Route, und ein späterer „schneller Import" würde sie unbemerkt brechen).
- `NOTEN_HELL`/`NOTEN_DUNKEL` haben je sechs Einträge und entsprechen **wortgenau** Abschnitt 3.4 —
  diese Werte sind auf Kontrast geprüft (AA belegt), eigene Werte brechen die Zusicherung.
- **Luminanz fällt monoton** von Note 1 zu Note 6 (hell) bzw. steigt monoton (dunkel). Das ist der
  Kanal, der Rot-Grün-Blindheit und Graustufen übersteht — ein Test darauf verhindert, dass ein
  späterer „schöner" Farbtausch ihn unbemerkt zerstört.
- `ampelStufe` an jeder Schwellengrenze geprüft (Randwerte, nicht nur Mittelwerte).

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app src/core` — erwartet: PASS. Zusätzlich `pnpm build`, um zu prüfen, dass die
übrigen Module unverändert bauen.

- [ ] **Schritt 5: Commit**

`feat(core): data-theme auf html, Notenpalette als gemeinsame Grundlage, Hülle randlos`

---

### Task 11: Der Zettel — Notenmatrix, Legende, CSS-Fundament

Das Herzstück. Ersetzt acht Reihen graue Sterne durch die Zeugnis-Matrix.

**Bindend:** Abschnitte 3.1 (Schnitt), 3.2 Punkt 1–4 (Fahne, Kopf, Legende, Matrix), 3.3 (Typografie),
3.4 (Farbe, Tonwertkeil, Notenfarben), 3.5 (Maße, Bewegung), 3.6 (Skalen-Interaktion, Markup-Vorlage),
3.10 (Barrierefreiheit).

**Files:**
- Create: `src/app/m/feedback/f/[slugSecret]/Zettel.tsx` (`"use client"`),
  `src/app/m/feedback/f/[slugSecret]/zettel.module.css`
- Modify: `src/app/m/feedback/f/[slugSecret]/page.tsx` (Kopf, Kontext, rendert `Zettel`),
  Löschen von `SurveyForm.tsx` erst in Task 13 (bis dahin bleibt es unberührt)
- Test: `src/app/m/feedback/f/[slugSecret]/Zettel.test.tsx`

**Interfaces:**
- Produces:
  `Zettel(props: { questions: Question[]; scale: number; action: (fd: FormData) => Promise<SubmitResult | void>; tokenHash: string })`
- Consumes: `Question` und `ratingScale` aus `_lib/questions.ts` (unverändert), `SubmitResult` (Task 9)

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Für jede der acht Bewertungsfragen existiert eine **echte Radiogruppe** mit sechs Optionen und
  gleichem `name` → ein Tabstop pro Frage, Pfeiltasten wählen nativ.
- Jede Option trägt `required` (das No-JS-Netz).
- Jede Option hat ein `aria-label` der Form „Note 2 – gut" — die Bedeutung steht als **Text** zur
  Verfügung, nicht nur als Farbe.
- Die Frage wird für Screenreader **genau einmal** angekündigt: `legend` ist visuell versteckt (per
  `clip-path`, **nicht** `display:none`), der sichtbare Fragetext trägt `aria-hidden`.
- Die Ziffer ist im Feld sichtbar, **auch im gewählten Zustand** (Farbe ist die verzichtbare vierte
  Schicht).
- Nach einer Wahl erscheint die Fußnote mit Ziffer **und** Notenwort („3 · befriedigend").
- Die Legende erscheint **genau einmal** auf der Seite, nicht je Frage.
- Bei `scale === 5` (importierte Alt-Umfragen, Typ `stars`) werden **fünf** Optionen gerendert und die
  Anker lauten „1 sehr gut" / „5 mangelhaft" — `switch` auf den Fragetyp, kein Improvisieren.
- Quelltext-Assertion: in `zettel.module.css` kommt `#c8000f` **höchstens zweimal** vor (Fahne,
  Wortzeichen).

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/f` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Markup nach der Vorlage in Abschnitt 3.6. Alle Farb-, Typo- und Abstandswerte **wortgenau** aus
Abschnitt 3.3–3.5 übernehmen — sie sind auf Kontrast geprüft (AA belegt), eigene Werte brechen das.
`@media (prefers-reduced-motion: reduce)` nicht vergessen.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback` + `pnpm typecheck` + `pnpm lint` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`feat(feedback): Notenmatrix mit Schulnote 1-6 statt sechs grauer Sterne`

---

### Task 12: Der Zettel — Freitexte

Sechs gleich aussehende leere Kästen werden zu linierten Zeilen: ~300px statt ~540px Kastenfläche, ohne
eine Frage zu verstecken oder umzubenennen.

**Bindend:** Abschnitt 3.2 Punkt 6, Abschnitt 3.7 vollständig.

**Files:**
- Modify: `Zettel.tsx`, `zettel.module.css`
- Test: `Zettel.test.tsx`

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Alle sechs Freitextfragen sind vorhanden, jede mit ihrem **vollständigen Originaltext** als Label —
  **keine** Kurzlabels, **keine** Frage hinter einem Aufklapper.
- Kein Feld trägt „(optional)" — die Freiwilligkeit steht **einmal** im Einleitungssatz der Sektion.
- `maxLength` ist 500.
- Der Zeichenzähler ist unter 420 Zeichen **nicht** vorhanden, ab 420 zeigt er die Restzahl, bei 500
  „Zeile ist voll". Kein Rot, kein Icon (Warnfarbe außerhalb der Skala ist verboten).
- Kein Erledigt-Häkchen an gefüllten Feldern (bei freiwilligen Feldern wäre es eine stille Beschämung
  der leeren).
- Reihenfolge: q9 zuerst, dann q10–q14.
- Entwurf: Eingaben werden in `sessionStorage` gehalten (nicht `localStorage`), Schlüssel aus dem
  Token-Hash, Wiederherstellung im Effekt (**nicht** beim ersten Rendern — sonst
  Hydration-Konflikt), Verfall nach 30 Minuten, Löschung bei Erfolg.
- `enterkeyhint`/`autocapitalize`/`spellcheck` wie spezifiziert; Enter erzeugt einen Absatz, **kein**
  Absenden.

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app/m/feedback/f` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`feat(feedback): linierte Freitextzeilen mit Entwurfsspeicher statt sechs leerer Kästen`

---

### Task 13: Der Zettel — Abschluss-Block, Lückenspringer, Navigator

Der Angelpunkt des Entwurfs: nach der achten Note kommt der Abschluss mit Anonymitätssiegel und
Absenden-Knopf; die Freitexte liegen **darunter**. Wer um 21:31 gehen will, ist nach acht Tipps fertig
— und es können **niemals** Pflichtnoten verloren gehen.

**Bindend:** Abschnitte 3.2 Punkt 5 und 7–8, 3.6 („Pflicht ohne Prüfungsgefühl"), 3.9 (Wortlaut A —
verbindlich, weil Task 8 die Zusage wahr macht), 3.10.

**Files:**
- Modify: `Zettel.tsx`, `zettel.module.css`, `page.tsx` (Siegeltext)
- Delete: `src/app/m/feedback/f/[slugSecret]/SurveyForm.tsx` (durch `Zettel` ersetzt)
- Test: `Zettel.test.tsx`

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Zwei Absenden-Knöpfe, **identisch beschriftet** („Rückmeldung absenden"), beide `type="submit"`
  desselben Formulars.
- Notenübersicht: acht Kacheln; beantwortete zeigen die **Ziffer**, offene eine gestrichelte Kontur mit
  Fragennummer. Ein Tipp springt zur Frage.
- Unvollständig **mit JS**: der Knopf trägt den Zustand als **Text** („Noch 3 Noten offen") und ist
  `type="button"` — ein Tipp **navigiert** zur ersten Lücke, setzt den Fokus auf ihr erstes Feld und
  sendet **nicht** ab.
- Vollständig: Knopf ist `type="submit"` mit dem regulären Label.
- Das Wort „Fehler" kommt nicht vor; keine rote Farbe im Lückenpfad; `aria-live="polite"` meldet
  „Noch 3 Noten offen — Frage 4."
- `noValidate` wird beim Mounten gesetzt (mit JS übernimmt der gestaltete Lückenspringer), ohne JS
  bleibt `required` wirksam.
- Der Anonymitätstext entspricht **wortgenau** Fassung A aus Abschnitt 3.9 und enthält den Satz
  „Schreib nichts, woran man dich erkennt."
- Navigator: erscheint erst nach der ersten Note, trägt **keine** Ampelfarbe und **keinen**
  Absende-Knopf.

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app/m/feedback` + `pnpm typecheck` + `pnpm lint`.

- [ ] **Schritt 5: Commit**

`feat(feedback): Abschluss-Block mit Anonymitätssiegel und Lückenspringer statt Sammelfehler`

---

### Task 14: Die fünf übrigen Zustände derselben Route

Heute ist jeder Nicht-Formular-Zustand ein nacktes `<p>` — und das ist die **erste** Seite, die jemand
nach dem QR-Scan sieht. Dazu: die stumme Weiterleitung bei vorhandenem Cookie sperrt die zweite Person
am geteilten Handy aus.

**Bindend:** Abschnitt 3.2 B–F, Abschnitt 3.8 (`releaseDeviceAction`, Fehlerpfade).

**Files:**
- Modify: `page.tsx`, `thanks/page.tsx`, `actions.ts`
- Test: `src/app/m/feedback/f/[slugSecret]/page.test.tsx`, `actions.test.ts`

**Interfaces:**
- Produces: `releaseDeviceAction(slugSecret: string, surveyId: number)` — setzt das Cookie mit
  `maxAge: 0` **und** `path: "/"` (nicht `delete`, damit der Löschbefehl garantiert mit korrektem Pfad
  ausgeliefert wird) und leitet aufs Formular.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- **Zustand C** („keine Umfrage aktiv"): gestaltete Seite mit Gruppennamen, Hinweis dass der QR-Code
  gültig bleibt, „Neu laden" als `<a href>` (funktioniert ohne JS). Kein Rot, kein Warndreieck.
- **Zustand D** („beendet"): Thema und Datum des Abends sichtbar (der richtige Zettel, zu spät),
  Schließzeitpunkt genannt.
- **Zustand E** („von diesem Gerät schon abgestimmt"): **keine** stumme Weiterleitung mehr; Seite mit
  Knopf „Leeren Bogen öffnen".
- `releaseDeviceAction` löscht das Cookie und leitet aufs Formular; danach ist eine neue Abgabe
  möglich. Das Formular ist ein natives `<form action={…}>` — **ohne JS bedienbar**.
- **Zustand F** („Link stimmt nicht"): gestaltete Seite statt nacktem 404 — und sie verrät **nicht**,
  ob die Gruppe existiert (kein Orakel für geratene Slugs).
- **Danke-Seite:** keine Antworten mehr auf dem Schirm, Weitergabe-Abschnitt vorhanden.
- Alle Zustände teilen Fahne und Kopfrhythmus (gemeinsame Hülle, nicht kopierte Markup-Blöcke).

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app/m/feedback` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`feat(feedback): gestaltete Endzustände und Handy-Weitergabe statt stummer Weiterleitung`

---

### Task 15: E2E der öffentlichen Strecke

**Files:**
- Modify: `e2e/feedback.spec.ts` (**umschreiben**, nicht ergänzen — der Bestand kodiert den alten
  draft→active-Ablauf und die Sterne-Oberfläche)

- [ ] **Schritt 1: Szenarien schreiben**

- Vollständige Abgabe auf **mobilem** Viewport (390×844): acht Noten antippen, absenden, Danke-Seite.
- Unvollständige Abgabe: Knopf zeigt „Noch N Noten offen", Tipp springt zur Lücke, sendet nicht.
- Freitext über 500 Zeichen wird an der Grenze gestoppt.
- Geschlossene Umfrage: Zustand D statt Formular.
- Geteiltes Gerät: nach Abgabe „Leeren Bogen öffnen" → neue Abgabe möglich.
- **Ohne JavaScript** (`browser.newContext({ javaScriptEnabled: false })`): acht Noten wählbar,
  Absenden funktioniert, `required` greift bei Lücken. Das ist die Kernzusage des Entwurfs und muss
  automatisiert belegt sein.
- Dunkelmodus: Umschalter auf dunkel → die Notenfelder tragen die Dunkel-Palette.

- [ ] **Schritt 2: Laufen lassen**

`pnpm exec playwright test e2e/feedback.spec.ts` — erwartet: alle grün.

- [ ] **Schritt 3: Commit**

`test(feedback): E2E der öffentlichen Strecke inkl. ohne JavaScript und mobil`

---

**Teil 3** (Admin: Cockpit, Einstieg, Verlauf, Einstellungen, Aushang, Navigation, aggregierter
CSV-Export, Trend/Vergleich-Anbindung) folgt in `2026-07-24-feedback-redesign-teil3.md` und setzt die
Signaturen aus Teil 1 und 2 voraus.
