# Nachprüfung der Fix-Welle — Verdikt

Geprüft: `fe49511..23143f7` (10 Commits) gegen die beiden Abschlussreviews, den Fix-Welle-Bericht,
`task-176a-report.md` und den Arbeitsbaum. Lesend, kein Testlauf.

## Fund-Verdikte

1. **§12.5-Tabelle trägt jetzt die Messung.** ADDRESSED — `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md:7330-7341` (§12.5) trägt sechs nachgezogene Zeilen mit Datei **und** Zusicherungsname; Alt-Spec-/Fate-Spalte unangetastet (`8023f1a`).
2. **`--allow-empty`-Nachtrag zu `133e6ba`.** ADDRESSED — Commit `487a6e5`, Historie nicht umgeschrieben (`133e6ba` unverändert im Log), korrigiert genau die drei benannten Aussagen (C1, M3, M4).
3. **Zwei Wächter (offene Weiterleitung, `loading.tsx`-Riegel).** ADDRESSED — `e2e/lagerbuch-helfer.spec.ts:214` `toMatch(/^\/(?!\/)/)`; `src/app/m/lagerbuch/error.test.tsx:912-921` rekursiver Scan (`7796d82`).
4. **`guards.test.ts:487` A7-Bauform gestrichen, `:458` unberührt.** ADDRESSED — `_actions/guards.test.ts:458` trägt weiterhin `toHaveLength(3)` für „genau 3 Ausnahmen" (Invariante 47=44+3, unverändert); die Typ-Export-Zählung auf `detail.ts` ist entfernt.
5. **Undeklarierter E2E-Schreibvorgang nach `lagerort_verfall`.** ADDRESSED — Testwert `2090-09` statt `2026-09` (`e2e/lagerbuch-helfer.spec.ts:583`, außerhalb `LAGERBUCH_VERFALL_GELB_TAGE=56` und verschieden von `E2E_VERFALL_FERN="2090-01"`), Datenwirkung im Spec-Kopf deklariert (`:489-499`).
6. **Tapmaß-Messung geweitet.** ADDRESSED — Selektormenge `a[href], button, input, textarea, select`, Filter `(w>0||h>0)&&(w<44||h<44)`, Radio/Checkbox-`label`-Sonderfall übernommen, Vorbedingung liest dieselbe Menge (`e2e/lagerbuch-mobil.spec.ts:647-701`).
7. **Vakuöse Gegenprobe.** ADDRESSED — Gegenprobe hängt jetzt an `a[href$="/verwaltung/checks/e2e-check-lesbar"]` statt am Wort „vollständig" (`e2e/lagerbuch-verwaltung.spec.ts:753-757`); `e2e-check-lesbar` existiert im Seed (`e2e/seed-lagerbuch.ts:220`).
8. **Eigentümertabelle §5.** ADDRESSED — fünf Zeilen ergänzt (`_lib/tokenForm.ts`+Test/A1, `_ui/Chip.tsx`/A15, `journal/**` (4 Dateien einzeln)/A15, `e2e/seed-lagerbuch.ts`/A10), je mit ausgeschriebenem Grund, nicht nur Kürzel (`8d2961a`, Plan `:475-483`).
9. **Fünf Runbook-Zeilen.** ADDRESSED — neuer Runbook-§17 (a/b/d als §17.1–17.3), R30 zweistufig mit Rangfolge und gemessenen Werten, §14 ehrlich gemacht, §13 Handgriff-vor-Begründung. Form (Handgriff-Begründung-Herkunft) eingehalten.
10. **Vier Ehrlichkeitskorrekturen.** ADDRESSED — Runbook §13 Reihenfolge getauscht; Plan §7.1 trägt ⚠️-Satz zur dünnen Belegkette; Plan-Selbstverweis „§2.3"→„§2.2" (`:297`, `:355`); `csvBestellung.ts:16-24` BOM-Begründung auf `parseArtikelCsv`/disjunkte Spaltenmengen gezogen, Verbot selbst unverändert.
11. **Flackernder Excel-Export-Test.** ADDRESSED — `meldendesVersprechen()`-Helfer, alle drei betroffenen Tests warten auf das Versprechen statt auf 30-Tick-Budget (`ArtikelTable.test.tsx`, `e2ea094`); kein `skip`/`retry`, Excel-Vertrag (Blattname, Kopfzeile, Dateiname, gefilterte Zeilen) unverändert geprüft. Nicht-Reproduktion ist im Commit und im Bericht ausdrücklich als Nicht-Reproduktion benannt, nicht als Beweis verkauft.

## Punkt 1 im Detail — die sechs Zuordnungen gegen `task-176a-report.md`

Alle sechs wörtlich mit Schritt 2 der Kladde abgeglichen, dazu drei davon stichprobenartig gegen die
genannten Testdateien selbst (nicht nur gegen den Bericht):

| # | Zuordnung in §12.5 | Stimmt gegen `task-176a-report.md`? | Stichprobe gegen Quelldatei |
|---|---|---|---|
| 1 | `bz-scan` → `BzScanner.test.tsx` (3 Namen) + `KontrolleForm.test.tsx` + `BzLogbuchTabelle.test.tsx` + `_db/quelle.test.ts` (2) | **Ja**, wortgleich | `BzScanner.test.tsx:105,118,132` — alle drei Testnamen exakt vorhanden |
| 2 | `geraete` → `_lib/konstanten.test.ts` + `checks/[id]/page.test.tsx` + `_lib/domain/check.test.ts`; Eingabeseite ersetzt durch `CheckFlow.test.tsx` | **Ja**, wortgleich | nicht separat nachgelesen (Bericht-Deckung ausreichend, Klasse identisch zu 1/3) |
| 3 | `inventur` → `InventurForm.test.tsx` (3) + `_actions/inventur.test.ts` + `BestellListe.test.tsx` | **Ja**, wortgleich | nicht separat nachgelesen |
| 4 | `loeschen` → `LoeschDialog.test.tsx` (5 Namen), E2E-Hälfte **gestrichen** (gemessenes Negativ) | **Ja**, wortgleich, inkl. der Streichungs-Begründung | `LoeschDialog.test.tsx:80,98,118,195` — vier der fünf Testnamen exakt vorhanden (fünfter, `:154`, im aktuellen Code als „…und traegt die fachliche Warnbox" erweitert, aber die zitierte Kernaussage „meldet den Grund NICHT als Alert type=error" steht wortgleich am Anfang) |
| 5 | `verfall` → `AussondernRow.test.tsx` (3) + `_actions/aussondern.test.ts` (2) + `_lib/journalZeile.test.ts` (2) | **Ja**, wortgleich | `AussondernRow.test.tsx:86,96,109` — alle drei Testnamen exakt vorhanden |
| 6 | `verwaltung-flow` → `_lib/journalZeile.test.ts` (bleibt) + `ArtikelDrawer.test.tsx` (3); voller Rundlauf in `lagerbuch-helfer.spec.ts` | **Ja**, wortgleich | nicht separat nachgelesen |

Keine der sechs Zuordnungen ist falsch eingetragen. Kein „⚠️ Träger nicht belegt"-Fall im Bericht, der in der Tabelle stillschweigend als belegt ausgegeben worden wäre. Die drei stichprobenartig gegen den Quelltext geprüften Zeilen (1, 4, 5) tragen die zitierten Testnamen an exakt den im Bericht genannten Stellen — kein Diskrepanzfall gefunden.

Zusätzlich geprüft: `loeschen.spec.ts` — die Streichung des zweiten Nachfolgers `e2e/lagerbuch-verwaltung.spec.ts` (statt eines ⚠️-Platzhalters) ist gerechtfertigt, weil es sich um ein **gemessenes Negativ** handelt (die Datei trägt diese Hälfte nachweislich nicht — 11 Tests der Datei sind vollständig anderweitig geprüft, siehe `task-176a-report.md` Schritt 2), nicht um eine unbelegte Lücke.

## Neue Schäden im Fix-Diff

**Keine.** Insbesondere:
- Keine falsch eingetragene Zuordnung in §12.5 (siehe oben).
- Keine geschwächte Zusicherung: die einzige gestrichene Assertion (`guards.test.ts` `toHaveLength(3)` auf Typ-Exporte) war laut beiden Reviews selbst die zu entfernende Fehlform (Ruling A7), und die tragende differenzielle Zusicherung (`actionsIn(...) === ["getDetail"]`) bleibt. Die benachbarte, legitime `toHaveLength(3)`-Zeile (`:458`) ist unberührt.
- Keine stille Verhaltensänderung: `src/`-Produktivcode ist nur an zwei Stellen berührt — `csvBestellung.ts` (Kommentar, kein Verhalten) und implizit keine weiteren; alle übrigen Änderungen sind Tests/Docs. Bestätigt durch den Diff-Files-Changed-Block (9 Dateien, davon nur `csvBestellung.ts` außerhalb von Test-/E2E-/Doku-Dateien).
- R30 ist byte-identisch in Runbook §16.2 und Plan §10.2 nachgeprüft (direkter Diff der beiden Zeilen: identisch).
- A-J2 ist an allen drei genannten Fundstellen (§2.2/2.3, §5-Schlussnotiz, §2.4-historische-Fassung) konsistent nachgezogen (`ec6ae9d`), ohne die Annahme selbst umzuschreiben.

## Schaden aus dem Parallelbetrieb

**Nicht gefunden.** `ec6ae9d` (Agent A, docs-only: `docs/runbooks/lagerbuch-cutover.md` + `docs/superpowers/plans/...md`) und `e2ea094` (Agent B, Flackern-Fix: ausschließlich `ArtikelTable.test.tsx`) ändern disjunkte Dateien. `git log --graph` zeigt eine lineare, konfliktfreie Historie zwischen beiden Commits. Kein halber Fix, keine zwei Fassungen derselben Stelle, keine verlorene Änderung. Der Fix-Welle-Bericht dokumentiert das selbst korrekt (F0 „gelöst", saubere Merge-Situation) — die Prüfung bestätigt es unabhängig am Diff.

## Beobachtungen außerhalb des Umfangs

- `task-176a-report.md` bleibt weiterhin die einzige Heimat der Orte der übrigen 39 §11.5-Zustände (nur §12.5 und §5 wurden aus der Kladde gerettet) — von der Welle selbst als F6 benannt, kein neuer Fund.
- Das dritte, im Bericht erwähnte, „in dieser Sitzung nicht auffiel"-Excel-Test-Wartemuster wurde tatsächlich mitgezogen: der Diff zeigt drei geänderte Tests im Block „Excel-Export (§9.4)", nicht nur zwei — Bericht-Zahl stimmt.
- I2 (grüner „vollständig"-Chip auf der kaputten Zeile), F2 (Tapmaß-Vorbedingung sichert nicht spezifisch die Icon-only-Aktion), F5 (keine Wächter-Zusicherung für „zeichengleich §10.2") sind laut beiden Reviews/Bericht bewusst nicht in dieser Welle behoben und stehen auf dem Board — außerhalb des Prüfauftrags dieser Runde.

## Verdikt

**Fix-Welle:** Alle Funde behoben, keine neuen Critical/Important-Schäden.
**PR-fähig?** Ja.
