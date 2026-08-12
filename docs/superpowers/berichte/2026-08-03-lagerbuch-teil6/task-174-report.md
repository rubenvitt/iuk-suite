# Task 174 — Report

Der namentliche Abgleich der sieben Aussagen aus §12.1 — Abnahme, nicht TDD.

## Status: DONE_WITH_CONCERNS

Zwei echte Funde (kein bloßes Vertippen): ein falscher Fundort-Verweis und eine
tatsächlich verlorene E2E-Zusicherung. Beide wurden per Betreiberentscheidung W1
sofort gefixt, mit eigenen Commits, echt gelaufenen Tests und dem Fund im
Protokoll — siehe unten.

⚠️ Die Verbindung ist während der Bearbeitung einmal abgerissen (nach dem ersten
Fix-Commit `f5b41a6`, mitten in der Arbeit an `BestellListe.test.tsx`). Der
Team-Lead hat den Fortsetzungsauftrag mit dem im Worktree sichtbaren Zwischenstand
geschickt; dieser Bericht deckt die gesamte Arbeit ab, inklusive der vor dem
Abriss bereits gelaufenen Grep-Nachweise (unten erneut mit frischen Läufen belegt).

---

## Schritt 1: Die sieben Grep-Nachweise (verbatim aus dem Brief)

```bash
# 1 — Verfallsfeld im Zaehlschritt → Nutzlast
grep -rn "zaehleAblaufende\|checkNutzlast" src/app/m/lagerbuch/_lib/checkNutzlast.test.ts
grep -rn "laufen ab\|Verfall" src/app/m/lagerbuch/_ui/CheckFlow.test.tsx
grep -n "checks.ergebnis" e2e/lagerbuch-helfer.spec.ts
```
→ 25 Treffer / 7 Treffer / 2 Treffer. Alle drei Ebenen benannt vorhanden.

```bash
# 2 — clientseitiger Artikelfilter (Name, Fach UND Chargennummer)
grep -n "artikelTrifft\|chargenNr" src/app/m/lagerbuch/_lib/artikelFilter.test.ts
grep -n "Kopplung Filter" src/app/m/lagerbuch/_lib/bestandExport.test.ts
```
→ 28 Treffer / 1 Treffer (`describe("Kopplung Filter -> Export (§12.1 Punkt 2)", ...)`).

```bash
# 3 — Entprellung und der committedQ-Tanz
grep -n "committedQ\|debounce\|useFakeTimers" src/app/m/lagerbuch/_ui/filter.test.tsx
grep -n "?q=" e2e/lagerbuch-verwaltung.spec.ts
```
→ **0 Treffer** (Zeile 1) / 2 Treffer (Zeile 2, nach dem Fix — vor dem Fix ebenfalls
0). Beides sind Befunde, siehe „Funde" unten.

```bash
# 4 — negatives Journal-Delta
grep -n "journalZeile\|mengeText" src/app/m/lagerbuch/_lib/journalZeile.test.ts
grep -rn "Δ\|delta" "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/"
```
→ 18 Treffer / 22 Treffer.

```bash
# 5 — Chip `bestellt` als Zeilenzustand, von der Fussnote getrennt
grep -rn "bestellt seit" "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/"
```
→ 6 Treffer (nach dem Fix; vor dem Fix bereits ≥2, da `bestellt seit 01.08.2026`
schon in `BestellListe.test.tsx` als Fixture-Literal stand — die eigentliche
Lücke lag woanders, siehe „Funde").

```bash
# 6 — „Endgueltig loeschen" bleibt gesperrt, bis der Name exakt getippt ist
grep -n "disabled" src/app/m/lagerbuch/_ui/LoeschDialog.test.tsx
```
→ 4 Treffer.

```bash
# 7 — der QR-Traeger
grep -n "lb-etikettQr" "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenBogen.test.tsx"
```
→ 4 Treffer.

**Ergebnis Schritt 1:** Sechs der sieben Grep-Paare lieferten sofort Treffer.
Aussage 3 lieferte für ihre DOM-Zeile **0 Treffer** — der Ausgangspunkt der
beiden Funde unten.

---

## Schritt 2: Alt vs. Neu, je Aussage mit benanntem Unterschied

### 1 — Verfallsfeld im Zählschritt → Nutzlast

- **Alt** (`lagerbuch/src/app/helfer/check/CheckFlow.tsx:281,306`, gelesen):
  `aria-label={'Verfall ' + p.artikelName}` als Inline-Input je Positionszeile;
  die Zusammenfassung zählt `verfallAuffaellig > 0` inline in JSX
  (`${verfallAuffaellig} laufen ab · `).
- **Neu**: `checkNutzlast(args)` + `zaehleAblaufende(...)` als reine Funktionen
  (`_lib/checkNutzlast.ts`, Teil 3) — `zaehleAblaufende — die Live-Vorschau
  '{n} laufen ab'` als eigener `describe`-Block. DOM: `CheckFlow.test.tsx:280`
  „das Verfallsfeld erscheint NUR in der ERSTEN Zeile je Artikel", `:336`/`:826`
  prüfen den Text „N laufen ab". E2E: `lagerbuch-helfer.spec.ts:395` „ein im
  Check gemeldeter Verfall steht danach in checks.ergebnis".
- **Unterschied**: die Zählung ist aus der Komponente in eine reine, isoliert
  testbare Funktion gewandert (Unit-Ebene neu, vorher nur inline+DOM möglich).
  Fachlich unverändert — kein Verschiebungs-Fund.

### 2 — Clientseitiger Artikelfilter (Name, Fach, Chargennummer)

- **Alt-Code** (`lagerbuch/src/app/verwaltung/(admin)/artikel/ArtikelTable.tsx:119`,
  gelesen): `` `${r.name} ${r.fach} ${r.naechsteCharge?.chargenNr ?? ""}`.toLowerCase().includes(q) ``
  — das Prädikat durchsuchte **bereits alle drei Felder**.
- **Alt-Spec**: testete nachweislich nur den Namen (daher die Verschiebung in
  §8 der Plandatei — geprüft, nicht nur übernommen).
- **Neu**: `artikelTrifft`/`artikelFiltern` (`_lib/artikelFilter.ts`, Teil 3);
  `artikelFilter.test.ts` hat einen eigenen `describe`-Block „artikelTrifft —
  der Freitext sucht ueber DREI Felder" mit expliziten Fällen für Name
  (`"verband"`), Fach (`"a1"`) UND Chargennummer (`"4711"`).
  **Kopplung** (T156, Schritt 6): `bestandExport.test.ts:109-131` — gelesen,
  Testkörper geprüft (nicht nur der `describe`-Titel): `bestandExportZeilen(gefiltert)`
  bekommt exakt das Ergebnis von `artikelFiltern(...)`, mit Gegenprobe „ohne
  Filter die volle Liste".
- **Unterschied**: entspricht exakt der in §8 dokumentierten Verschiebung
  („die alte Fassung war unvollständig, nicht der Neubau großzügig"). Bestätigt,
  kein neuer Fund.

### 3 — Entprellung + committedQ-Tanz ⚠️ zwei Funde, siehe unten

- **Alt** (`lagerbuch/src/app/verwaltung/(admin)/journal/JournalFilter.tsx:29,44-52`,
  gelesen): `committedQ = useRef(q)`, ein `useEffect` mit `setTimeout(..., 300)`
  schreibt `q` debounced in die URL; Kommentarblock erklärt exakt den Tanz.
- **Neu**: `verwaltung/(arbeit)/journal/JournalFilter.tsx:36` — **wortgleiches**
  `committedQ = useRef(q)`-Muster, 300-ms-Timeout unverändert. DOM-Test:
  `JournalFilter.test.tsx` — „debounced 300 ms ab der letzten Eingabe und ist
  kein Throttle" (Millisekunden-genau: 299 ms nichts, 300 ms genau ein Aufruf),
  „zieht externe q-Aenderungen nach", „erkennt die eigene q-Schreibung".
- **Unterschied**: keiner in der Sache — **aber** der Nachfolger stand unter
  einem falschen Namen im Plan (Fund #1) und die E2E-Hälfte fehlte komplett
  (Fund #2).

### 4 — negatives Journal-Delta

- **Alt** (`lagerbuch/e2e/verwaltung-flow.spec.ts:60-68`, gelesen):
  `entnahmeRow.locator(".jdelta.minus")).toHaveText("-1")` — eine **CSS-Klasse**
  trägt die Aussage.
- **Neu**: `_lib/journalZeile.ts` (Teil 3) — `journalZeile({typ, menge})` liefert
  `mengeText` ("-3", "+5", "0") + `zustand` ("negativ"/"positiv"/"neutral").
  `journalZeile.test.ts` hat einen eigenen Block „journalZeile — die Zusicherung
  nennt KEINEN Hexwert" (Zeile 37). DOM: `JournalTable.test.tsx:109,120` prüft
  weiterhin `.jdelta.jminus`/`.jdelta.jplus` als **Klasse** (die alte Prüfung
  überlebt, umbenannt von `.minus`/`.plus` auf `.jminus`/`.jplus`), zusätzlich
  jetzt **auch** das Vorzeichen im Text (`mengeText`).
- **Unterschied** (Verschiebung 4 aus dem Plan, geprüft): die Zusicherung wurde
  NICHT ersetzt, sondern **verdoppelt** — Klassen-Check bleibt (jetzt unter
  neuem Namen), Text-Vorzeichen kommt als Unit-Test hinzu. Hex-Check: `.jminus`
  benutzt `color: var(--lb-ampel-rot-text)` (`verwaltung.module.css:64`) — ein
  **Token**, kein Literal. Grep über den gesamten `journal`-Ordner nach
  `#c8000f|#8c0d16` → 0 Treffer. Entscheidung 30 wird von keinem Test
  vorweggenommen. Bestätigt, kein Fund.

### 5 — Chip „bestellt" als Zeilenzustand ⚠️ ein Fund, siehe unten

- **Alt** (`lagerbuch/e2e/inventur.spec.ts:22-30`, gelesen):
  `page.getByText("bestellt", { exact: true }).first()` — Kommentar im Alt-Spec:
  „exact:true trifft NUR den Zeilen-Chip `<span>bestellt</span>`, nicht die
  Fussnote „Bestellt …"".
- **Neu**: `statusChip()` (`BestellListe.tsx:31-45`) liefert bei
  `bestelltSeitText` gesetzt `"bestellt seit <Datum>"`, sonst (Rückfall) `"bestellt"`.
  `BestellListe.test.tsx` prüfte vor dem Fix nur die drei Fälle mit gesetztem
  Datum/offen/gedeckt — der datumslose Rückfall war ungetestet, und es gab
  keine Zeile im Bestand, deren Chip-Text tatsächlich bloß „bestellt" lautet.
  `bestellt seit 01.08.2026` stand nur als Fixture-Erwartung, nie gegen eine
  zweite Zeile mit exaktem Text abgegrenzt.
- **Unterschied**: die neue Oberfläche hat **keine separate Fußnote** mehr — der
  Wortlaut wanderte in den Chip-Text (Verschiebung 5, bestätigt). Die
  verbleibende Kollisionsgefahr ist eine andere: `"bestellt"` ist Teilstring von
  `"bestellt seit …"`. Diese Trennung war ungetestet → Fund, gefixt (siehe unten).

### 6 — „Endgültig löschen" bleibt gesperrt

- **Alt** (`lagerbuch/e2e/loeschen.spec.ts:41-54`, gelesen): Modal, Button
  `toBeDisabled()`, `fill("falsch")` → weiterhin disabled, `fill(frei)` (exakter
  Name) → `toBeEnabled()`, klicken.
- **Neu**: `LoeschDialog.test.tsx:195-217` — identisches Muster:
  initial disabled (`:208`), Teilname „Kompressen" weiterhin disabled (`:210`),
  falsche Groß-/Kleinschreibung „kompressen steril" weiterhin disabled (`:212`),
  exakter Name „Kompressen steril" → enabled (`:214`), Klick löst `onLoeschen`
  genau einmal aus.
- **Unterschied**: keiner — 1:1-Portierung, sogar um einen zusätzlichen
  Negativfall (Groß-/Kleinschreibung) erweitert. Bestätigt.

### 7 — Der QR-Träger

- **Alt** (`lagerbuch/e2e/etiketten.spec.ts:11-13`, gelesen):
  `.etikett img` mit `src` matching `/^data:image\/png/` — reine
  Attribut-Existenzprüfung, **nie der Inhalt**.
- **Neu**: `EtikettenBogen.test.tsx` — `.lb-etikettQr > svg` (n Zeilen → n
  SVG-Knoten), zusätzlich `viewBox="0 0 45 45"` und Pfad-Daten. **Und**
  `_db/etiketten.test.ts:94-104` (gelesen, vollständig) — `decodeQr(e.qr)`
  dekodiert die echten SVG-Pixel und vergleicht den **Inhalt**
  (`https://lagerbuch.iuk-ue.de/a/${A_ID}`), inklusive Regressionsschutz für
  Basis-URL-Reihenfolge, abschließenden Schrägstrich, fehlende Basis
  (`EtikettenBasisFehlt`).
- **Unterschied** (Verschiebung 7 aus dem Plan, geprüft): Träger wechselt
  `<img>` → `<svg>`, UND der Inhalt wird jetzt erstmals geprüft (die alte
  Fassung konnte das strukturell nicht). Bestätigt, kein Fund — eher ein
  Gewinn gegenüber der alten Abdeckung.

---

## Schritt 3: Die Ebenen abgehakt

- [x] **1** Unit ✅ `_lib/checkNutzlast.test.ts` · DOM ⚠️ Teil 4 (Wert aus dem Brief
      übernommen, nicht neu geprüft) · E2E ✅ T171
- [x] **2** Unit ✅ `_lib/artikelFilter.test.ts` · Kopplung ✅ T156, Schritt 6
      (Testkörper gelesen, prüft dieselbe abgeleitete Liste — kein Fund)
- [x] **3** DOM ✅ `journal/JournalFilter.test.tsx` (T147, **nicht** `_ui/filter.test.tsx`/T109
      — Fund #1) · E2E ✅ (Fund #2, gefixt in `e2e/lagerbuch-verwaltung.spec.ts`)
- [x] **4** Unit ✅ Teil 3 · DOM ✅ Teil 5, T147 (Klassen-Check überlebt umbenannt,
      Text-Vorzeichen kommt hinzu, kein Hexwert)
- [x] **5** DOM ✅ Teil 5, T145 — **mit Nachtrag** (Fund #3, gefixt): exakte
      Text-Trennung war ungetestet, jetzt ergänzt
- [x] **6** DOM ✅ Teil 5, T110
- [x] **7** DOM ✅ T162, Schritt 5 — Inhalt zusätzlich durch `_db/etiketten.test.ts` (T159)

---

## Funde

### Fund 1 — Falscher Fundort-Verweis (Aussage 3, DOM)

**Befund:** `grep -n "committedQ\|debounce\|useFakeTimers" src/app/m/lagerbuch/_ui/filter.test.tsx`
lieferte 0 Treffer. `_ui/filter.test.tsx` testet `Trefferanzeige`, `Suchfeld`,
`useUrlFilter` und den `usePathname`-Scan (T109) — keinen Debounce, kein
`committedQ`. Der echte Nachfolger ist
`verwaltung/(arbeit)/journal/JournalFilter.test.tsx` (T147, per Teil-5-Plan
Zeile 16925-17037 nachgewiesen: „Files: Create … Test .../JournalFilter.test.tsx").
Der Fehler stand **doppelt** im Plan: §8-Tabelle (Zeile 617) und die
13-Alt-Specs-Tabelle (Zeile 7298) — beide zitierten `_ui/filter.test.tsx` statt
`journal/JournalFilter.test.tsx`, und beide nannten fälschlich T109 statt T147.

**Einordnung:** falscher Fundort-Verweis, kein Testverlust — der Nachfolger
existiert und prüft korrekt (300-ms-Grenze, committedQ-Verhalten, geprüft in
`JournalFilter.test.tsx:97-182`, gelesen).

**Fix (Commit `f5b41a6`):** §8-Zeile und die 13-Alt-Specs-Zeile in
`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md` korrigiert:
DOM zeigt jetzt auf `journal/JournalFilter.test.tsx` (T147), mit Hinweis, dass
`_ui/filter.test.tsx` (T109) weiterhin die `useUrlFilter`-Schreibmechanik trägt,
aber weder Debounce noch `committedQ` prüft. Reiner Doku-Fix, kein Testlauf nötig.

⚠️ **Nicht angefasst:** `task-176-brief.md:39` trägt denselben falschen Verweis
(„`_ui/filter.test.tsx` + `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5)"). Laut
Auftrag sind Briefs nicht meine zu editierenden Dokumente — nur die Plandatei
wurde korrigiert. T176 sollte das beim Abhaken der 13-Alt-Specs-Tabelle
berücksichtigen (die Plandatei ist jetzt korrekt, der eigene Brief noch nicht).

### Fund 2 — Verlorene Zusicherung: die literale `?q=`-URL hat keinen E2E-Nachfolger (Aussage 3, E2E)

**Befund:** `grep -n "?q=" e2e/lagerbuch-verwaltung.spec.ts` lieferte vor dem
Fix 0 Treffer. Erschöpfende Suche (alle `e2e/*.spec.ts`, alle Schreibweisen von
`q=`, `toHaveURL`, `searchParams`, `waitForURL`) ergab: **keine** Datei im
`e2e/`-Verzeichnis prüft, dass die Journalsuche die eingetippte Zeichenkette
als `?q=…` in die Browser-Adresse schreibt. `e2e/lagerbuch-verwaltung.spec.ts`
enthielt bis zu diesem Fix ausschließlich die vier Modulnavigations-Zusicherungen
(einziger Commit in der Historie der Datei: „Modulnavigation im echten Browser
abnehmen"). T150s eigener Scope laut Teil-5-Plan (Zeile 18040-18060, gelesen):
„seine vier Subjekte (`_lib/nav.ts` aus T102, `.modulnav` aus T105)" — die
Journalsuche gehörte nie dazu; die Plandatei selbst hält fest: „Teil 6 schreibt
die ÜBRIGEN E2E-Dateien … sowie die umgeschriebenen Alt-Specs. Es entsteht keine
zweite Navigations-Spec" (Festlegung H14). Die alte
`lagerbuch/e2e/suche-filter.spec.ts:20-33` (gelesen) hatte genau diese
Zusicherung: `await expect(page).toHaveURL(/[?&]q=Verband/)`. Die §12.5-Tabelle
des Plans (Zeile 7298 vor dem Fix) behauptete ausdrücklich, sie „bleibt — sie
ist der einzige Beleg für den URL-Vertrag" — kein Task in Teil 6 hat sie gebaut.

**Einordnung:** echte verlorene Zusicherung, kein Fundort-Irrtum — der
DOM-Nachfolger (`JournalFilter.test.tsx`) mockt `next/navigation` und kann
strukturell nicht beweisen, dass die echte Browser-Adresszeile den Parameter
trägt (genau die Lücke, die §12.1 mit einer eigenen E2E-Ebene schließen will).

**Fix (Commit `494cc69`, plus Doku-Nachtrag `7c05014`):** neuer Test in
`e2e/lagerbuch-verwaltung.spec.ts` (Eigentum bleibt Teil 5/T150 — keine zweite
Datei angelegt, wie von T150s eigenem Plan-Constraint verlangt):

```ts
test.describe("lagerbuch — Journalsuche schreibt die literale URL (§12.1 Punkt 3)", () => {
  test("Debounce schreibt den Suchbegriff als ?q=… in die Adresse", async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/journal",
    });
    await page.getByRole("searchbox", { name: "Suche" }).fill("Verband");
    await expect(page).toHaveURL(/[?&]q=Verband/);
  });
});
```

Sucht nach „Verband" — derselbe Begriff wie die Alt-Spec, gedeckt durch die
Boot-Seed-Artikel „E2E Verbandpäckchen" (`e2e/seed-lagerbuch.ts:85`). Benutzt
`devLogin` aus `e2e/helpers/lagerbuch.ts` wie die übrigen Lagerbuch-Specs, keine
eigene Login-Mechanik. `aria-label="Suche"` auf dem `Input type="search"`
(`JournalFilter.tsx:104-112`) ergibt die ARIA-Rolle `searchbox`.

**Echt gelaufen:**
```
$ pnpm build
✓ Compiled successfully

$ pnpm exec playwright test e2e/lagerbuch-verwaltung.spec.ts
Running 7 tests using 1 worker
  ✓ 1-6 … Modulnavigation (unverändert)
  ✓ 7 lagerbuch — Journalsuche schreibt die literale URL (§12.1 Punkt 3) › Debounce schreibt den Suchbegriff als ?q=… in die Adresse (2.5s)
  7 passed (23.9s)
```

Die Plandatei (§8 und die 13-Alt-Specs-Tabelle) wurde in einem eigenen
Nachtrags-Commit (`7c05014`) auf den behobenen Zustand aktualisiert.

### Fund 3 — Grüner Nachfolger, der die Trennungs-Zusicherung nicht führte (Aussage 5)

**Befund:** die Plan-Zeile für Verschiebung 5 behauptet: „`exact: true` trennt
weiterhin den Zeilenzustand von der Fußnote". `BestellListe.test.tsx` enthielt
vor dem Fix **keine** Verwendung von `exact` (0 Treffer, geprüft), und keine
Fixture erzeugte den datumslosen Rückfalltext `"bestellt"`
(`BestellListe.tsx:42`) — alle drei existierenden Fixtures (`OFFEN`, `BESTELLT`,
`DA`) lösen entweder `"offen"`, `"bestellt seit 01.08.2026"` oder
`"Ware offenbar eingetroffen"` aus. Die neue Oberfläche hat keine separate
Fußnote mehr (geprüft: `BestellListe.tsx`, `page.tsx`, keine „Bestellt …"-Zeile
außerhalb des Chips) — die alte Kollisionsgefahr (Chip vs. Fußnote) existiert
so nicht mehr, aber eine neue ist ungeprüft geblieben: `"bestellt"` ist
Teilstring von `"bestellt seit …"`, eine naive Textsuche würde beide Zeilen treffen.

**Einordnung:** grüner Nachfolgetest (`statusChip`-Block lief grün), der die
konkrete Trennungs-Zusicherung aus §12.1 Punkt 5 nicht führte — genau die
Mutation, die T174 fangen soll. Mechanischer Fix (Testfall in einer
existierenden Datei ergänzt), keine Fachentscheidung — nicht eskaliert.

**Fix (Commit `ac81f8f`):** in `BestellListe.test.tsx`:
1. `BESTELLT_OHNE_DATUM`-Fixture ergänzt (`bestelltSeitText: null`).
2. Unit-Test für den bislang ungetesteten Rückfall-Zweig:
   `statusChip(BESTELLT_OHNE_DATUM) → { ton: "ok", text: "bestellt" }`.
3. DOM-Test, der beide Zeilen zusammen mountet und über `.chip`-Textinhalte
   prüft, dass eine exakte Suche nach `"bestellt"` nur den datumslosen Chip
   trifft, nie `"bestellt seit 01.08.2026"`.

**Echt gelaufen:**
```
$ pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bestellung/BestellListe.test.tsx"
 Test Files  1 passed (1)
      Tests  21 passed (21)
```
(vorher 19 Tests — zwei neue, alle grün.)

### Kein Fund — geprüft und bestätigt

- **Aussage 2, Kopplung** (`bestandExport.test.ts:109-131`): Testkörper
  gelesen (nicht nur der `describe`-Titel) — `bestandExportZeilen(gefiltert)`
  bekommt exakt die gefilterte Liste, mit Gegenprobe. Kein Fund.
- **Aussage 4, Hexwert-Verbot**: `journal`-Ordner exhaustiv nach `#c8000f`/`#8c0d16`
  durchsucht (0 Treffer), CSS-Modul benutzt den Token `--lb-ampel-rot-text`.
  Kein Fund.
- **Aussage 7, Dekodierung**: `_db/etiketten.test.ts` vollständig gelesen — 12
  Testfälle inklusive echter QR-Dekodierung (`decodeQr`), Basis-URL-Reihenfolge,
  Fehlerzustand 38. Kein Fund.
- **Aussagen 1 und 6**: Alt-Fassungen gelesen und mit den Nachfolgern
  gegenübergestellt (siehe Schritt 2), keine Abweichung von der Plan-Behauptung
  gefunden.

---

## Geänderte Dateien und Commits (chronologisch)

1. `f5b41a6` — `docs(lagerbuch): §8-Tabelle korrigiert — Aussage 3 zeigt auf JournalFilter.test.tsx`
   (Fund 1, reiner Doku-Fix, kein Testlauf)
2. `ac81f8f` — `test(lagerbuch): §12.1 Punkt 5 — Chip 'bestellt' exakt von 'bestellt seit …' getrennt`
   (Fund 3, `BestellListe.test.tsx`, 21/21 grün)
3. `494cc69` — `test(lagerbuch): §12.1 Punkt 3 — die literale ?q=-URL bekommt ihren E2E-Nachfolger`
   (Fund 2, `e2e/lagerbuch-verwaltung.spec.ts`, 7/7 Playwright grün nach `pnpm build`)
4. `7c05014` — `docs(lagerbuch): §8/§12.5-Tabellen — E2E-Nachfolger fuer Aussage 3 nachgetragen`
   (Doku-Nachtrag zu Fund 2)
5. Protokoll-Commit (Schritt 4 des Briefs, verbatim + Nachtrag) — siehe unten.

**Vor dem Protokoll-Commit gefahren:**
```
$ pnpm typecheck
TypeScript: No errors found

$ pnpm lint
✖ 5 problems (0 errors, 5 warnings)
```
Alle fünf Warnungen sind vorbestehend, in Dateien außerhalb dieses Tasks
(`e2e/fixtures.ts`, `_lib/boot.test.ts`, `_lib/grenzen.test.ts`,
`_lib/lesepfade/artikel.ts`) — 0 Fehler, keine neuen Warnungen.

T174 hat **keinen** vollen `pnpm vitest run` und **keinen** vollen
`pnpm exec playwright test`-Lauf gefahren (nicht verlangt — das ist T176s
Aufgabe); nur die vom Fix betroffenen Dateien wurden gezielt gefahren.

---

## Selbstreview

- **Vollständigkeit:** alle sieben Aussagen mit Schritt 1 (Grep), Schritt 2
  (Alt/Neu-Gegenüberstellung mit Primärquellen aus der eingefrorenen
  Alt-Anwendung) und Schritt 3 (Ebenen) abgedeckt. Ja.
- **Ehrlichkeit:** jeder Fund steht im Protokoll, auch die gefixten (3 Stück).
  Beim ersten Durchlauf hatte ich `bestandExport.test.ts:109` und
  `BestellListe.test.tsx:130` zunächst nur über den `describe`-Titel bzw. den
  Fixture-Literal „gesehen" — der Advisor-Zwischenstopp hat das aufgedeckt, und
  ich habe beide Testkörper danach vollständig gelesen (einer bestätigte sich,
  einer wurde zum Fund 3). `_db/etiketten.test.ts` wurde vollständig gelesen,
  nicht nur auf Existenz geprüft.
- **Disziplin:** die beiden Test-Fixes (Fund 2, Fund 3) sind gezielte
  Ergänzungen an bestehenden Zusicherungslücken aus §12.1, keine Umbauten und
  keine verbreiterte Abdeckung ohne Bezug zu den sieben Aussagen. Für Fund 2
  wurde bewusst **keine** zweite E2E-Datei angelegt (T150s Plan-Constraint:
  „Es entsteht keine zweite Navigations-Spec" — die neue Zusicherung hat aber
  fachlich nichts mit Navigation zu tun, sondern mit der Journalsuche; sie
  wurde trotzdem in derselben Datei ergänzt, wie vom Team-Lead ausdrücklich
  verlangt, statt eine neue Datei zu eröffnen).
- **Testausgabe:** alle drei Testläufe (BestellListe.test.tsx, Playwright,
  typecheck/lint) oben mit tatsächlicher Ausgabe belegt, kein Rauschen entfernt
  außer den fünf bekannten vorbestehenden Lint-Warnungen.

## Bedenken

1. **`task-176-brief.md:39`** trägt denselben falschen Fundort-Verweis wie die
   (jetzt korrigierte) Plandatei. Nicht editiert (Briefs sind laut Auftrag nicht
   meine zu ändernden Dokumente) — T176 sollte das beim Abhaken bemerken, jetzt
   dass die Plandatei selbst korrekt ist.
2. **Fund 2 war eine echte Lücke im Plan, nicht nur in der Umsetzung**: T150s
   eigener Scope (Teil-5-Plan) schloss die Journalsuche ausdrücklich aus, und
   kein Task in Teil 6 hat sie je gebaut, obwohl die §12.5-Tabelle sie seit
   Planerstellung als „bleibt" führte. Das ist ein Planungs-Blindspot, nicht
   nur ein T174-Fund — falls das Muster (Zusicherung im Plan versprochen, aber
   keinem Task zugeordnet) noch öfter vorkommt, wäre eine Stichprobe über die
   restlichen 13-Alt-Specs-Zeilen sinnvoll, bevor T176 sie abhakt.
3. Die Verbindung ist einmal mitten in der Arbeit abgerissen; der Team-Lead hat
   den Fortsetzungsauftrag mit korrekt erkanntem Zwischenstand geschickt, und
   dieser Bericht deckt beide Sitzungshälften lückenlos ab — trotzdem als
   Transparenzhinweis vermerkt.
