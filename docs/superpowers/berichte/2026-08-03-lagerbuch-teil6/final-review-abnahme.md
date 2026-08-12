# Abschlussreview „Abnahme" — `f668007..fe49511` (21 Commits)

Gelesen: das Review-Paket (`review-f668007..fe49511.diff`, vollständig), `CLAUDE.md`,
Plan-Tasks T174/T175/T176 und §9, `review-z27-verdikt.md`, `progress.md`, die fünf
`--allow-empty`-Protokoll-Commits (`9acea7e`, `652b157`, `7cea8e4`, `04a4438`, `133e6ba`).
Gegengeprüft am Arbeitsbaum, ohne ihn zu verändern: kein Testlauf, kein Schreibzugriff außer
dieser Datei.

---

## Stärken

**Die Abgrenzung von Zustand 27 sitzt an der Sache, und ich habe jeden der fünf Wege einzeln
nachgelesen.** `checkErgebnis.ts:200` (`roh === null || roh === undefined` → `leer()`), `:201`
(`""` → `unlesbar()`), `:205` (`catch` → `unlesbar()`), `:207-209` (Array → V1, unberührt),
`:211` (Nicht-Objekt → `unlesbar()`). Genau drei Fehlerwege tragen das Flag, und **kein
gültiger Zustand** erreicht sie: `ergebnis IS NULL` (§4.4, offener Check) und `altFormat` (V1)
haben je eine namentliche Gegenzusicherung (`checkErgebnis.test.ts` „`null` ist NICHT
unlesbar", `lesepfade/checks.test.ts` „meldet NICHT unlesbar fuer einen OFFENEN Check", „…fuer
das ALTE Format"). Die Frage aus dem Auftrag — kann die Warnung auf einem gültigen Zustand
erscheinen? — ist **nein**, dreischichtig belegt.

**Das Flag quert die RSC-Naht nirgends.** Detailseite: `checkDetailInhalt` entscheidet
serverseitig und reicht an die Client-Insel `CheckDetailTabellen` nur den fertigen **String**
`unlesbarLeertext` (`checks/[id]/page.tsx:207-209`). Übersicht: `anzeigeZeile`
(`checks/page.tsx:81-105`) übersetzt feldweise, `positionenText` ist Text, und
`checks/page.test.tsx` sichert das mit `istRekursivJsonSicher` **plus**
`not.toHaveProperty("unlesbar")` ab. Der `Alert` ist `antd`s einfacher `Alert` — kein
Compound-Zugriff, `showIcon={false}`, kein Import aus dem Icon-Paket, `type="warning"` nie
`"error"` (Fallen 1, 3 und 7 aus `CLAUDE.md` alle drei aktiv vermieden **und** in `page.tsx`
im Kommentar begründet). Der bestehende Quelltext-Riegel in `page.test.tsx` scannt genau diese
Datei weiter.

**Kein gebrochener Aufrufer, und ich habe nicht auf den grünen Balken vertraut.**
`parseCheckErgebnis` hat vier Konsumenten; `_actions/loeschen.ts:181` liest nur `.geraete`,
`domain/check.ts:100` zählt Listen, `lesepfade/checks.ts:130`/`:131` lesen Felder. **Kein
Round-Trip:** `_actions/check.ts:322` baut das `ergebnis` frisch aus Einzelwerten — ein
`unlesbar: true` kann nicht versehentlich persistiert werden. `checkHistorie()` hat
repo-weit **genau einen** Aufrufer (`checks/page.tsx:130`), es gibt also keine zweite Fläche,
die eine kaputte Zeile weiterhin still als `0` zeigte.

**Im Normalfall ist der Diff byte-neutral, und das ist konstruktiv erzwungen, nicht
zugesichert.** `leertext(vorgabe) = unlesbarLeertext ?? vorgabe`
(`CheckDetailTabellen.tsx:230`) — die vier Originalliterale stehen unverändert als Argument im
Quelltext; `unlesbarLeertext` ist nur bei `check.unlesbar` gesetzt. `positionenText` ist für
jede lesbare Zeile weiterhin `String(zeile.positionen)`.

**Die Gate-Zahlen des Abnahme-Commits sind vom Diff arithmetisch erzwungen, nicht bloß
protokolliert.** Ich habe sie nicht geglaubt, sondern nachgerechnet: `vitest` 337 Dateien
bleibt, weil **keine** neue Testdatei entsteht; 5781 → 5806 ist +25, und der Diff fügt genau
25 neue `it(` hinzu (checkErgebnis 9 · domain/check 1 · lesepfade/checks 6 · checks/[id]/page 4
· CheckDetailTabellen 1 · checks/page 4). Playwright 169 → 173 ist +4, und der Diff fügt genau
die vier z27-E2E-Tests hinzu. Die zwei Doku-Commits nach `133e6ba` (`fe49511`) fassen
ausschließlich `docs/` an — die Gates stehen also auch für den Endstand.

**§16 ist nachprüfbar wörtlich.** Ich habe die Tabellenzeilen maschinell verglichen:
Plan §10 (`:7518-7574`) gegen Runbook §16 (`:372-…`) — **32 Tabellenzeilen, zeichengleich**,
Abweichungen ausschließlich in Überschriften und dem ausgeschriebenen Zeitdruck-Satz, und beide
sind im Runbook selbst als die einzigen zwei bewussten Abweichungen benannt. Die Behauptung
„zeichengleich zu Plan §10.2" hält.

**F3 und F4/J5 halten an der Sache.** Beide Group-Layouts rufen wirklich beide Riegel
(`verwaltung/(arbeit)/layout.tsx:21-22`, `verwaltung/(druck)/layout.tsx:50-51`); die `SOLL`-Liste
in `guards.test.ts` trägt 18 Dateien mit Summe **47**.

**Der Seed ist gegen seine Nachbarn durchdacht** (`e2e/seed-lagerbuch.ts:186-239`): die drei
Check-Zeilen hängen am vorhandenen `e2e-fahrzeug` statt an einem neuen (kein neues Fahrzeug in
Flottenliste und Helfer-Wähler) und tragen `completedAt` in der Vergangenheit, damit
`lagerbuch-helfer.spec.ts` seinen „jüngster Check"-Vergleich behält. Die Begründung steht im
Code, nicht im Bericht.

**Runbook §14 ist die beste neue Seite des Dokuments.** Handgriff zuerst, **eine** maßgebliche
Abfrage, ausdrücklicher Abbruch („Ist die Zahl 0, ist dieser Abschnitt erledigt"), die zweite
Abfrage ausdrücklich zum Einordnen statt zum Abhaken, und `offen = 0` als eigener Datenbefund
markiert. Der Anker `checkErgebnis.ts:200` zeigt **auf die richtige Zeile** — ich habe
nachgezählt. Das ist unter Zeitdruck brauchbar.

---

## Funde

### Critical (muss behoben werden)

**C1 — Der Abnahme-Commit behauptet eine Korrektur, die im Repository nicht existiert.**

`133e6ba`, Absatz „Was die Abnahme GEFUNDEN hat":

> „§12.5: … ACHT der 13 Zeilen nannten den FALSCHEN Nachfolger. Alle 13 Aussagen sind
> getragen, nur von ungenannten Dateien; **die Tabelle ist korrigiert.**"

Sie ist es nicht. In `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`, §12.5-Tabelle
(`:7318-7332`), ist **genau eine** Zeile nachgezogen worden — `:7329` (`suche-filter.spec.ts`).
Die übrigen stehen unverändert:

| Zeile | Alt-Spec | genannter Nachfolger im Plan (HEAD) |
|---|---|---|
| `:7321` | `bz-scan.spec.ts` | `e2e/lagerbuch-verwaltung.spec.ts` (T150) — **einziger** |
| `:7325` | `geraete.spec.ts` | `e2e/lagerbuch-verwaltung.spec.ts` (T150) — **einziger** |
| `:7327` | `inventur.spec.ts` | `e2e/lagerbuch-verwaltung.spec.ts` (T150) — **einziger** |
| `:7328` | `loeschen.spec.ts` | `LoeschDialog.test.tsx` + `e2e/lagerbuch-verwaltung.spec.ts` |
| `:7330` | `verfall.spec.ts` | `e2e/lagerbuch-verwaltung.spec.ts` (T150) — **einziger** |
| `:7331` | `verwaltung-flow.spec.ts` | `journalZeile.test.ts` + `e2e/lagerbuch-verwaltung.spec.ts` |

`e2e/lagerbuch-verwaltung.spec.ts` trägt am HEAD **11 Tests**, nachgezählt: sechs
Modulnavigation (`:19-90`), die `?q=`-Zeile von T174 (`:105`), die vier z27-Tests (`:144-201`).
**Kein einziger** davon ist Nachfolger von bz-scan, geraete, inventur, loeschen, verfall oder
verwaltung-flow. Genau das hat T176-A gemessen (`04a4438`: „Gemessen traegt die Datei … davon
EINE HALBE").

Die korrigierte Zuordnung existiert ausschließlich in
`.superpowers/sdd/…/task-176a-report.md`. Dieses Verzeichnis ist **gitignoriert**
(`.superpowers/sdd/.gitignore:1`, `git ls-files .superpowers` = **0 Dateien**), und der Ledger
bezeichnet die Berichte ausdrücklich als „Kladde, wird am Ende geloescht". Ich habe `docs/`
zusätzlich durchsucht: kein anderes verfolgtes Dokument trägt die gemessene Zuordnung.

**Warum das zählt.** Der Fehler, den diese Abnahme als ihren Vorzeigefund führt — eine Tabelle,
die einen Nachfolger nennt, der die Aussage nicht trägt —, überlebt die Abnahme im verfolgten
Bestand, und der Abnahme-Commit sagt, er sei behoben. Wer nach dem Cutover fragt „wo lebt die
Zusicherung aus `verfall.spec.ts`?", bekommt vom Plan dieselbe falsche Antwort wie vorher, und
vom Abnahme-Commit die Auskunft, das sei geklärt. Sobald `task-176a-report.md` gelöscht ist,
ist die Messung **verloren** — die Behebung ist damit zeitkritisch.

Die Wurzel steht schon in `04a4438`: „Die Plantabelle ist deshalb in Richtung der MESSUNG
nachgezogen (W1): **der Bericht** nennt je Zeile den gemessenen Traeger" — ein Satz, der sich
selbst widerspricht (nachgezogen wurde die Tabelle oder der Bericht, nicht beides), und
`133e6ba` hat die günstigere Hälfte davon geerbt.

**Behebung** (eine von beiden, die erste ist billiger und ist das, was W1 verlangt hat):
1. Die sechs Zeilen im Plan mit dem gemessenen Träger belegen — die Werte stehen in
   `task-176a-report.md`, **bevor** er gelöscht wird —, danach steht die Commit-Aussage.
2. Oder den Satz im Abnahme-Commit ersetzen durch: „…die gemessene Zuordnung steht je Zeile im
   Rumpf von `04a4438`" — was heute nicht stimmt, der Rumpf nennt keine Einzelzeile. Praktisch
   heißt Variante 2: die sechs Zuordnungen in einen `--allow-empty`-Nachtrag schreiben.

---

### Important (sollte behoben werden)

**I2 — Die Check-Übersicht zeigt für einen unlesbaren Datensatz weiterhin einen grünen Chip
„vollständig", und die E2E-Gegenprobe kann das nicht sehen.**

`src/app/m/lagerbuch/verwaltung/(arbeit)/checks/page.tsx:28-79` (`ergebnisChips`): ein
zerstörtes `ergebnis` liefert alle Zähler `0`, `altFormat: false` → kein einziger Chip wird
gepusht → `chips.length === 0` → `page.tsx:70-77` pusht **`{ text: "vollständig", ton: "ok" }`**.
Dieselbe Tabellenzeile trägt seit `407075e` in der Positionen-Spalte das Wort `unlesbar`. Die
Zeile sagt also gleichzeitig „unlesbar" und **grün „vollständig"** — auf genau der Fläche, die
`133e6ba` und der Nachbau als „die Fläche, auf der jemand nach Auffälligkeiten sucht"
bezeichnen. Ein „200, das lügt", ist damit auf der Übersicht nicht beseitigt, sondern
halbiert.

Ich stufe das **Important, nicht Critical**: das Verhalten ist **vorbestehend** (der Chip fiel
schon vor dieser Sitzung so aus) und der Abnahme-Commit behauptet an keiner Stelle, die
Ergebnis-Spalte sei angefasst worden. Es ist keine unbelegte Zeile, sondern eine Lücke, an der
der Nachbau vorbeigegangen ist — das z27-Verdikt Minor 2 war auf die **Positionen**-Spalte
zugeschnitten, und die Fix-Runde hat genau diesen Zuschnitt umgesetzt.

**Zwei Folgen, ein Fund:**

- `e2e/lagerbuch-verwaltung.spec.ts:199-203` — die Gegenprobe ist **vakuös**, und zwar aus dem
  Grund, den ihr eigener Kommentar bestreitet:
  ```
  await expect(page.getByRole("row").filter({ hasText: "vollständig" }).first()).toBeVisible();
  // Kommentar: „sonst wäre ‚genau eine' auch bei einer leeren Tabelle erfüllbar."
  ```
  Die **kaputte** Zeile trägt beide Wörter. Die Zusicherung wäre auch dann grün, wenn
  `e2e-check-unlesbar` die einzige Zeile der Tabelle wäre — sie belegt nicht, was sie
  behauptet.
- `docs/runbooks/lagerbuch-cutover.md:186-187` — „**Diese Zeilen fängt die Abfrage oben
  nicht** … sie sagen es auf der Oberfläche selbst." Auf der Detailseite stimmt das; auf der
  Übersicht sagt die Zeile es und widerspricht sich im selben Atemzug. Wer beim Cutover eine
  Importmenge sichtet, liest die grüne Spalte zuerst.

**Behebung, verhältnismäßig zu „Tage vor einem Cutover":**
- **Mindestens** (Doku, null Risiko): einen Board-Posten anlegen und den Satz in §14 ehrlich
  machen — „auf der Detailseite; in der Übersicht steht das Wort in der Positionen-Spalte, der
  Ergebnis-Chip zeigt dort weiterhin ‚vollständig'".
- Die Gegenprobe im E2E an eine **benannte lesbare Zeile** hängen statt an „vollständig" (z. B.
  den Artikelnamen aus `e2e-check-lesbar`, der in `:180` ohnehin schon benutzt wird). Reine
  Testkorrektur, kein Produktivcode.
- **Optional, zwei Zeilen Produktivcode** (Betreiberentscheidung): in `ergebnisChips` bei
  `zeile.unlesbar` den Vollständig-Chip unterdrücken bzw. durch `{ ton: "gelb", text:
  "Ergebnis unlesbar" }` ersetzen — Gelb, nicht Rot (§6.6.5). Ich empfehle das **nicht** vor
  dem Cutover zu ziehen, sondern es zusammen mit DRK-196 zu planen.

---

### Minor (nice to have)

**M3 — `133e6ba`: „Das ist das einzige Verhalten, das diese Abnahme geaendert hat" ist knapp
zu weit gefasst.** `src/app/m/lagerbuch/_lib/seedLokal.ts:712-718` (Commit `6326006`, T175)
ändert ebenfalls Produktivcode-**Ausgabe**: drei neue Protokollzeilen und ein ersetzter
Warnsatz. Das ist der Fund, auf den die Abnahme zu Recht stolz ist, und der Commit erwähnt ihn
nirgends. Vorschlag: „das einzige **Anzeige**verhalten des Moduls" — oder T175s Seed-Fund in
einem Halbsatz mitnennen (er ist der zweite Fund derselben Klasse wie T174s).

**M4 — `133e6ba`: „Die Zahl ist gestrichen statt ersetzt" trifft den Text nicht.**
Plan §11.5 Zeile 11 trägt heute in der Zelle „gemessen: **35** Stellen in **14**
Action-Dateien" — die 22 **ist** durch eine andere Zahl ersetzt worden. Wahr (und im
Klammerzusatz auch gesagt) ist das Eigentliche: es wurde **kein Gate auf die Anzahl** gebaut,
gegatet ist die Form (`actionErgebnis.test.ts:162`). Eine Zeile umformulieren.

**M5 — Runbook §13:138 stellt die Herkunft vor den Handgriff.** „**Gemessen bei der Abnahme
(T175).** Handgriff: die Generalprobe über einen echten HTTPS-Namen fahren…" — §14 und §15
machen es richtig herum. Zwei Satzteile tauschen.

**M6 — Plan §7.1 trägt weiterhin „Verifiziert in: Teil 5, T151/2" für rund 20 Zeilen.**
Die T175-Lehre im Ledger sagt ausdrücklich: „die Belegkette dort ist duenner als die Tabelle
nahelegt. Gilt sinngemaess fuer jede ‚verifiziert in Teil N'-Spalte, die T176 abhakt." Die
Lehre wurde protokolliert und nicht angewandt. Keine falsche Commit-Aussage — T176-A hat die
Zeilen selbst gemessen —, aber der Plan trägt die dünne Herkunft weiter. Ein ⚠️-Satz an der
Tabelle genügt.

**M7 — `_actions/guards.test.ts:487` ist noch die von A7 verbotene Bauform.**
`expect(quelle.match(/^export\s+(?:type|interface)\s+\w+/gm)).toHaveLength(3)` nagelt die
Anzahl der Typ-Exporte von `detail.ts` fest; ein legitimer vierter Typ färbt sie rot. Das ist
T172-Minor **d**, noch offen — und es ist genau die Klasse, die `133e6ba` für §11.5 Zeile 11
ausdrücklich als verboten zitiert (Ruling A7). Die Inkonsistenz ist es wert, benannt zu
werden; der Fix ist differenziell statt zählend. (Zeile `:458`, „genau 3 Ausnahmen", ist eine
**andere** und legitime — dort deckelt die 3 eine echte Invariante, 47 = 44 + 3.)

---

## Der Abnahme-Commit `133e6ba`, Satz für Satz

| # | Aussage | Urteil | Beleg / Fehlstelle |
|---|---|---|---|
| 1 | „Abnahme ueber alle sechs Plaene (T1-T14, T15-T27, T28-T61, T62-T87, T100-T152, T153-T176)" | **belegt** | `grep -c '^### Task'` je Plan: 14 · 13 · 34 · 26 · 53 · 24. Teil 6 läuft nachgeprüft von T153 bis T176 |
| 2 | „**164 Tasks**" (Betreff) | **belegt** | 14+13+34+26+53+24 = 164. Der Plan-Entwurf sagte „100" — die Korrektur ist echt |
| 3 | „T176 lief in ZWEI Dispatches: A = Schritte 1-4, B = Schritte 5-7" | **belegt** | Ledger + Commits `04a4438` (A) und `133e6ba` (B) |
| 4 | „deshalb sind die Gate-Zahlen unten die von B, nicht die von A" | **belegt** | A: 5781/169; B: 5806/173 — die Zahlen unterscheiden sich, es ist also wirklich B |
| 5 | „typecheck gruen · lint 0 Fehler, 5 vorbestehende Warnungen" | **belegt, soweit ohne Lauf prüfbar** | Nicht nachfahrbar (Laufverbot). Die 5 Warnungen sind seit T158 im Ledger dieselben |
| 6 | „vitest 337 Dateien, 5806 Tests" | **belegt — arithmetisch erzwungen** | Keine neue Testdatei im Diff → 337 bleibt. 5781 + **25** neue `it(` = 5806, und der Diff trägt genau 25 (9+1+6+4+1+4) |
| 7 | „playwright 173 Tests (volle Suite, 6,1 min)" | **belegt — arithmetisch erzwungen** | 169 (T176-A, per `--list` verifiziert) + die vier neuen z27-E2E-Tests = 173 |
| 8 | „Der Zustand-27-Nachbau hat Produktivcode … geaendert, NACHDEM T176-A seine Gates gefahren hatte. Keine Zahl abgesenkt." | **belegt** | Commit-Reihenfolge im Diff; jede Zahl ist gegenüber A gestiegen oder gleich |
| 9 | „F3: beide Group-Layouts rufen beide Riegel" | **belegt** | `verwaltung/(arbeit)/layout.tsx:21-22` und `verwaltung/(druck)/layout.tsx:50-51`, beide `requireLagerbuchHost` + `requireLagerbuchAdmin` |
| 10 | „F4/J5: 47 = 44 + 3 in 18 Dateien" | **belegt** | `guards.test.ts` `SOLL`: 18 Einträge, Summe 47; `:458` trennt die 3 Ausnahmen namentlich |
| 11 | „§12.1: sieben Aussagen ohne Netz, sieben benannte Nachfolger, vier bewusste Verschiebungen protokolliert" | **belegt** | Plan §8 (`:646-652`) trägt sieben Zeilen mit je benanntem Eigentümer; die vier Verschiebungen (Punkte 2, 4, 5, 7) sind **im Commit `9acea7e` selbst** einzeln ausgeschrieben, nicht nur im Bericht |
| 12 | „§12.5: die Bilanz stimmt (eine uebernommen, elf umgeschrieben, eine geteilt)" | **belegt** | 13 Zeilen: 1× Übernehmen, 1× Teilen, 11× umschreiben/ersetzen/teilübertragen |
| 13 | „ACHT der 13 Zeilen nannten den FALSCHEN Nachfolger. Alle 13 Aussagen sind getragen, nur von ungenannten Dateien" | **belegt** | T176-A hat die Datei vollständig gelesen; ich habe die Messung an `e2e/lagerbuch-verwaltung.spec.ts` (11 Tests) bestätigt |
| 14 | „**die Tabelle ist korrigiert**" | ❌ **unbelegt — siehe C1** | 1 von 8 Zeilen nachgezogen (`:7329`). Sechs Zeilen nennen weiterhin `e2e/lagerbuch-verwaltung.spec.ts`. Die Korrektur existiert nur in einem gitignorierten, zur Löschung vorgesehenen Bericht |
| 15 | „T174: die literale ?q=-URL … hatte in KEINER e2e/*.spec.ts einen Nachfolger … Sie fiel zwischen Teil 5 und Teil 6 und wurde nachgetragen" | **belegt** | `e2e/lagerbuch-verwaltung.spec.ts:104-108` neu; `9acea7e` und `494cc69` protokollieren Fund und Fix |
| 16 | „§11.5: jeder der 40 Zustaende hat einen Ort — Zustand 27 hatte ihn nur zur Haelfte und hat ihn, weil er in DIESER Sitzung GEBAUT wurde" | **belegt** | Zustand 27 an vier Schichten nachgelesen. ⚠️ Die Orte der übrigen 39 stehen als `Datei#Symbol:Zeile` **nur** in `task-176a-report.md` (gitignoriert); `04a4438` fasst sie zusammen, zählt sie nicht auf. Die Aussage stimmt, ihr Beleg ist nicht dauerhaft — dieselbe Schwäche wie C1, aber ohne falsche Behauptung über einen Artefaktzustand |
| 17 | „Das ist das einzige Verhalten, das diese Abnahme geaendert hat." | ⚠️ **teilweise belegt — M3** | `seedLokal.ts:712-718` (T175) ändert die Protokollausgabe von Produktivcode |
| 18 | „§11.5 Zeile 11 nannte ‚22 deutsche Meldungstexte': eine Alt-App-Zahl. Gemessen sind es 35 … in 14 Produktiv-Action-Dateien" | **belegt** | Plan-Zeile trägt die Messung samt Ausschluss-Hinweis (89/25 mit Tests) — der nächste Nachmesser bekommt keine dritte Zahl |
| 19 | „Die Zahl ist gestrichen statt ersetzt — gegatet ist die FORM (actionErgebnis.test.ts:162), nicht die Anzahl (Ruling A7)" | ⚠️ **teilweise belegt — M4** | Kein Anzahl-Gate: ✅. „gestrichen statt ersetzt": die Zelle trägt heute 35 statt 22 |
| 20 | „Der Commit-Entwurf des Plans nannte ‚100 Tasks' und ‚T62-T85'. Gezaehlt: 164 Tasks, und Teil 4 traegt T62-T87. Beides korrigiert." | **belegt** | Teil-4-Plan: 26 Tasks; Betreff trägt 164 |
| 21 | „die SIEBEN Runbook-Zeilen R30-R36 woertlich (§16.2, zeichengleich zu Plan §10.2)" | **belegt — maschinell** | 32 Tabellenzeilen Plan §10 vs. Runbook §16 zeichengleich verglichen; nur zwei benannte Abweichungen (Nummerierung, „künftiges" Runbook) |
| 22 | „plus dieselben sieben als Handgriffe in Ablaufreihenfolge (§15)" | **belegt** | Runbook §15, sieben Zeilen R30–R36, Spalte „Wann" trägt die Ablaufordnung |
| 23 | „§10 des Plans als eigener Abschnitt mit allen drei Untertabellen (§16.1-16.3) — als Inhalt, nicht als Verweis" | **belegt** | Runbook `:393`, `:414`, `:426` |
| 24 | „die Generalprobe MUSS ueber HTTPS laufen … (§13)" | **belegt** | Runbook §13; die Aussage steht im Code (`_ui/BarcodeScanner.tsx`) und §3.5.2 |
| 25 | „ein offener Check zeigt weiterhin ‚0 Positionen' und der Import kann solche Zeilen mitbringen (§14, DRK-196)" | **belegt** | `checkErgebnis.ts:200`; Runbook §14 mit maßgeblicher Abfrage und Board-Posten |
| 26 | „sechs neue Board-Posten in ‚Offene Posten'" | **belegt** | Runbook „Offene Posten": 8 Zeilen, davon 6 neu (DRK-192, DRK-193, 86cb3y7db, 86cb3y7h0, DRK-196, 86cb403u5) |
| 27 | „Gestrichen aus dem Entwurf: ‚⚠️ Offen, solange Teil 4 keine Tasks traegt' … Teil 4 ist gebaut und als PR #29 gemergt." | **belegt** | Plan-Diff `:7492-7496`; die Zeile steht im Commit nicht |
| 28 | „Teil 6: alle 24 Tasks eingecheckt." | **belegt** | Teil-6-Plan trägt 24 `### Task`; T176-B ist der letzte, und der Zwei-Dispatch-Vermerk steht im Kopf des Commits |

**Zusammenfassung: 24 belegt · 3 teilweise belegt (16, 17, 19) · 1 unbelegt (14).**

---

## Triage der aufgeschobenen und geparkten Funde

| Ledger-Posten | Triage | Begründung |
|---|---|---|
| **T156** — „vor dem PR 223100c + e3d1e9d quetschen" | **gegenstandslos** | Beide Commits liegen im Teil-6-Bereich, der als **PR #39 bereits in `main`** ist (`47d4b7a` ist Vorfahr). Ein Squash hieße jetzt Umschreiben gemergter Historie. Der Bisect-Punkt bleibt eine historische Eigenschaft von `main`; wer dort bisectet, findet ihn und liest die Commit-Nachricht |
| **T159** — `_db/etiketten.test.ts:181`, Name verspricht mehr als der Körper prüft | **aufs Board** | Testhygiene, keine Deckungslücke (`:169` deckt die Aussage). Kein Merge-Blocker |
| **T160 a–d** — Testname, Doppeldeckung, drei Rohtext-Scans ohne Begründung, `<Flex>` mit einem Kind | **aufs Board** | Alle vier kosmetisch. **c** (Rohtext-Scans ohne Halbsatz) ist der wertvollste: ohne Begründung stellt der nächste Leser sie „vereinheitlichend" auf `ohneKommentare` um und schwächt sie |
| **T161** — Commit-Nachricht `ede793c` sagt „drei", es waren zwei | **gegenstandslos** | Historie, gemergt, nicht korrigierbar; der Ledger hält die Richtigstellung |
| **T162 ×2** — Kommentar `EtikettenBogen.test.tsx:249-251`; Weg-zurück-Link per Quelltext-Scan gepinnt | **aufs Board** | Der zweite ist der interessantere (Scan statt Verhalten), aber kein Cutover-Risiko |
| **T163 ×4** (drei aus dem Brief geerbt) | **aufs Board** | Geerbte Brief-Mängel, kein Umsetzerfehler |
| **T164** — Benutzung von `SeitenKopf` von keinem Test gepinnt | **aufs Board** | Anzeigerand |
| **T166** — `BestellListe.test.tsx:281-294` | **aufs Board** | Testhygiene |
| **T169** — Zeilenzitat `tokenEinloesung.ts:70` in einem neuen Kommentar | **aufs Board, in DRK-192 einsortieren** | Es ist derselbe Fundort-Klassenfehler; ein eigener Posten zersplittert die Klasse |
| **T171 ×2** | **aufs Board** | |
| **T172 a, b, c** | **erledigt** | `a479606` + `3203484`; im Diff nachgelesen (`guards.test.ts:269`, `:276`, `:205` → Namensform, line-count-neutral) |
| **T172 d** — `toHaveLength(3)` auf die Typ-Exporte von `detail.ts` | **aufs Board, mit Vorrang** | Siehe **M7**: der Abnahme-Commit zitiert Ruling A7 als Begründung, in §11.5 keine Anzahl festzunageln — und lässt genau diese Bauform in `guards.test.ts:487` stehen. Kein Merge-Blocker, aber die Inkonsistenz gehört benannt |
| **T173** — `g/[code]/page.test.tsx:292` zeigt ins Leere | **aufs Board, in DRK-192** | Prosa, Deckung ist heute stärker als der Verweis behauptet |
| **T174** — Bericht zitiert `devLogin` aus der falschen Datei | **gegenstandslos** | Nur Berichtstext. ⚠️ Siehe C1: dass Berichte „Kladde" sind, ist genau der Grund, warum §12.5 jetzt ein Problem ist |
| **T175 a/b/c** — §7.1-Drift (307 statt 303; `/a/<unbekannt>`-Wortlaut; „Verfallsmonat" vs. „Kompressen-Verfall") | **erledigt** | `129f0cc`; alle drei Zeilen tragen im Plan den Vermerk „aus T175 nachgezogen", die Richtung ist die richtige (Tabelle folgt Messung) |
| **T175** — Brief-Schritt 5, `curl \| grep` findet die `error.tsx`-Texte nie | **aufs Board / Plan-Fund** | ⚠️ **Fund im Plan, nicht in der Umsetzung.** Wer den Befehl unbesehen fährt und „nicht gefunden" liest, zieht den falschen Schluss — dieselbe Klasse wie der `localhost`-404-Irrtum, den T175 in §7 richtiggestellt hat. Ein ⚠️-Satz an der Brief-/Planstelle würde reichen |
| **T176-A parked** — W1 „jeder Fix ein eigener Commit", `a479606` bündelt F-6+F-7+F-8 | **Ruling bestätigt, kein Widerspruch** | Ich habe die drei Hunks gelesen: alle in **derselben** Datei, alle reine Kommentar-/Namensänderungen, alle line-count-neutral (`@@ -259,28 +259,28 @@`, `@@ -398,28 +398,28 @@`), alle drei in der Nachricht einzeln benannt. Der einzige Vorteil dreier Commits — ein gezielter Revert von F-8 — ist bei einer Kommentaränderung praktisch wertlos; die Behebung wäre ein Rewrite bereits gereviewter Historie. W1s Zweck ist Nachvollziehbarkeit, und die ist gegeben |
| **T176-A minor** — Bericht sagt 116 Zeilen, gemessen 115 | **gegenstandslos** | Berichtstext |
| **T176-B a** — Plan-Zeile 118: Selbstverweis „siehe §2.3" innerhalb §2.3, gemeint §2.2 | **vor dem Merge beheben — zusammen mit C1** | Der Umsetzende hat ihn bewusst liegen lassen, um kein Vorbeigehen-Risiko einzugehen. Das Argument entfällt, sobald C1 ohnehin eine Plan-Änderung erzwingt: dann kostet die Zeile eine Ziffer |
| **T176-B b** — §16-Warnblock verallgemeinert „§1–§15" pauschal | **gegenstandslos** | Schwächt die Kernaussage nicht ab; §6 und §15 als Handlungslisten zu bezeichnen ändert nichts an der Übernahmepflicht von §16 |

### Die zwei Fehlanweisungen des Koordinators

**Nr. 1 (T175) — „übernimm das Protokoll der 23 Arbeitsseiten aus `190707b` / Runbook §12".**
**Vollständig durchgezogen, mit einem offenen Rest.** Der Umsetzende hat die Rückfrage gestellt,
alle 31 Zeilen und die vier Farbmodus-Abrufe selbst gefahren, und die Korrektur ist im Protokoll
(`652b157`) und im Plan (§7, „Korrektur aus T175 (gemessen)") verankert — inklusive der
tragenden Richtigstellung, dass `localhost:3000` **307 → /login** antwortet und nicht 404, und
dass `requireLagerbuchHost` auf diesem Weg nie erreicht wird. Der Riegel ist stattdessen an
einem inneren Pfad auf fremdem Suite-Host belegt und dauerhaft von
`e2e/lagerbuch-hosts.spec.ts` gehalten. **Rest:** die daraus abgeleitete Lehre („die Belegkette
hinter ‚Verifiziert in: Teil 5, T151/2' ist dünner als die Tabelle nahelegt") ist protokolliert
und **nicht angewandt** — siehe **M6**.

**Nr. 2 (T176a1) — „unlesbar = jeder Lesefehler, den `parseCheckErgebnis` heute mit `leer()`
beantwortet".** **Vollständig durchgezogen, an drei Schichten geprüft.** Die wörtliche Umsetzung
hätte `ergebnis IS NULL` eingeschlossen und damit **jedem** von §4.4 vorgesehenen offenen Check
„Ergebnis unlesbar" angeheftet. Durchgezogen ist: (1) im Parser — `checkErgebnis.ts:200`
trennt `null`/`undefined` ausdrücklich ab; (2) in den Zusicherungen — je eine benannte
Gegenprobe in `checkErgebnis.test.ts`, `lesepfade/checks.test.ts` und `page.test.tsx`, und eine
Rückkehr zu `!roh` würde an **zwei** Stellen rot; (3) im Betrieb — der verbleibende Rand
(offener Check zeigt weiterhin „0 Positionen") ist nicht verschwiegen, sondern als Runbook-§14
mit maßgeblicher SQL-Abfrage und Board-Posten DRK-196 ausgeschrieben. Das ist die
vorbildlichste Stelle des ganzen Bereichs.

---

## Empfehlungen

1. **C1 vor dem Merge beheben**, und zwar in der Reihenfolge: erst die sechs gemessenen Träger
   aus `task-176a-report.md` in die §12.5-Tabelle des Plans schreiben, **dann** den Bericht
   löschen. Solange der Bericht existiert, kostet das Minuten; danach kostet es eine
   Wiederholung von T176-A, Schritt 2.
2. **Bei derselben Plan-Änderung** T176-B a (Selbstverweis §2.3 → §2.2) mitnehmen und den
   ⚠️-Satz aus M6 an §7.1 setzen.
3. **I2**: Board-Posten anlegen, den Satz in Runbook §14 ehrlich machen, und die E2E-Gegenprobe
   von „vollständig" auf eine benannte lesbare Zeile umhängen. Den Chip selbst **nicht** vor
   dem Cutover ändern — mit DRK-196 zusammen planen.
4. **Grundsätzlich, über diesen Branch hinaus:** die Abnahme hat zweimal an derselben Stelle
   geblutet — der Beleg lebt im gitignorierten Bericht, die Behauptung im Commit. Wenn eine
   Abnahme Messungen erzeugt, auf die sich später jemand berufen soll, gehören sie in ein
   **verfolgtes** Artefakt (Plan, Runbook oder ein `--allow-empty`-Rumpf, der die Zeilen
   wirklich aufzählt), nicht in eine Kladde. Das ist die Lehre, die ich diesem Lauf am ehesten
   mitgeben würde — er hat sonst außergewöhnlich sauber gearbeitet.
5. Kein Handlungsbedarf bei M3/M4/M5/M7 vor dem Merge; M7 aufs Board mit dem Vermerk „A7,
   dieselbe Klasse wie §11.5 Zeile 11".

---

## Bewertung

**Merge-fähig?** **Mit Korrekturen**

**Begründung:** Der einzige Produktivcode-Eingriff ist sicher — die Warnung kann auf keinem
gültigen Zustand erscheinen (drei Fehlerwege, drei Gegenproben, `null`/`altFormat` je
namentlich abgegrenzt), kein Aufrufer bricht, kein Flag quert die RSC-Naht, und der Normalfall
ist byte-identisch. Was fehlt, ist eine Zeile: der Abnahme-Commit sagt „die Tabelle ist
korrigiert", und im verfolgten Bestand ist sie es für sechs von acht Zeilen nicht — genau die
Fehlerklasse, die diese Abnahme als ihren Vorzeigefund führt, überlebt sie in dem Dokument, auf
das sich künftig jeder beruft. Das ist in Minuten behoben, solange der Bericht noch existiert;
danach nicht mehr.
