# Re-Review: Fix-Runde zu Review 176-B (`133e6ba..fe49511`)

### Fund-Verdikte

1. **Important — §16 nicht als übernahmepflichtig markiert.** ADDRESSED —
   `docs/runbooks/lagerbuch-cutover.md:374-380`. Direkt unter der `## 16.`-Überschrift steht jetzt ein
   eigener Warnblock: „Diese Sektion muss vollständig und wörtlich in das echte Cutover-Runbook
   übernommen werden — nicht zusammenfassen, nicht nur verlinken", mit Begründung, warum §16 anders
   ist als §1–§15 (verbindliche Übergabeliste statt gemessener Einzeltatsache). Zusätzlich ist der
   irreführende Satz entschärft (`:383-385`): „das **künftige** Cutover-Runbook (nicht dieses
   Vorlauf-Dokument) wird unter Zeitdruck gelesen" statt der alten Formulierung, die klang, als sei
   dieses Dokument bereits das Runbook.

2. **Minor — gemessene Zahl gehört in die Zelle.** ADDRESSED —
   `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md:7346`. Zeile 11 der §11.5-Tabelle trägt
   jetzt „gemessen: **35** Stellen in **14** Action-Dateien" direkt in der Zelle, mit dem Vermerk
   „gegatet ist die Form, nicht die Anzahl" und Verweis auf die Begründung darunter. Die Fußnote
   (`:7348-7349`) ist konsistent mitgezogen: „ist durch die gemessene Zahl ersetzt" statt „gestrichen,
   nicht ersetzt".

3. **Minor — §11 verweist nicht vorwärts auf §13.** ADDRESSED —
   `docs/runbooks/lagerbuch-cutover.md:262-263`. Neuer Satz am Ende von §11: „Gehört mit §13 zusammen
   abgearbeitet: Schritt 3 (Systemkamera-Scan) setzt einen sicheren Kontext voraus … siehe §13." Die
   Verlinkung ist jetzt beidseitig (§13 → §11 bestand schon, `:308`).

4. **Minor — Plan-§2.3 trägt ältere R30/R31-Fassung ohne Vermerk.** ADDRESSED, aber an korrigierter
   Stelle — `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md:136-141`. Der neue Absatz sitzt
   in **§2.4** (nicht §2.3, siehe unten), markiert §10.2 als maßgeblich, nennt den Unterschied
   (fehlender `margin`-Rückfall bei R30, fehlender Betreiberfrage-9-Vorbehalt bei R31) und die
   Zielstelle §16.2. Die ältere Tabelle selbst (R30–R33) ist unangetastet.

### Neue Schäden im Fix-Diff

Keine. Beide Diff-Dateien wurden vollständig gelesen; keine Testdatei, keine `e2e/`- oder
`_actions/`-Datei berührt; keine Zahl abgesenkt; die alten R30–R33-Zeilen in §2.4 sind zeichengleich
stehen geblieben.

### Der eigene Fund des Umsetzenden (§2.4 statt §2.3)

**Bestätigt.** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md:111` trägt die Überschrift
„### 2.3 Die offenen Betreiberfragen dieses Teils" (die Fragentabelle inkl. Betreiberfrage 7/9), und
erst `:127` trägt „### 2.4 Was dieser Plan dem Runbook schuldet" — genau dort steht die R30–R33-Tabelle
(`:131-134`), auf die sich Review-Fund 4, der ursprüngliche Fix-Auftrag und das Ursprungsreview
(`review-176b-verdikt.md:113`, Minor 3) tatsächlich bezogen. Die beiden korrigierten Rückverweise im
Schritt-5-Abschnitt (`:7459` „aus §2.4 werden …", `:7466` „nicht die aus §2.4: §2.4 trägt eine ältere,
kürzere Fassung") zeigen jetzt auf die richtige Sektion — verifiziert durch Gegenlesen der Tabellen:
§2.4 enthält tatsächlich nur vier Zeilen ohne `margin`-Rückfall/Betreiberfrage-9-Vorbehalt, §10.2 (an
anderer Stelle im Plan, von diesem Fix nicht berührt) die reichere Siebenzeilen-Fassung. Kein
Falschverweis-durch-Falschverweis-Ersatz — die Korrektur ist stimmig.

**Vermutung zu Zeile 118 (§2.2 statt §2.3): geteilt.** `:118` steht in der Betreiberfrage-Tabelle
innerhalb §2.3 selbst und schreibt „…wird hier ausdrücklich nicht nebenbei vollzogen — siehe §2.3" —
ein Selbstverweis auf die Sektion, in der der Satz steht. Die tatsächliche Diskussion des Themas
(„„Excel als Standard für alle Reports" ist NICHT Teil dieses Plans") steht in **§2.2**
(`:87`). Das ist derselbe Fehlertyp wie Fund 4, nur mit umgekehrtem Vorzeichen (Verweis zeigt auf die
eigene Sektion statt auf die Zielsektion), und plausibel ein Artefakt derselben Nummerierungsverschiebung.
Der Umsetzende hat es zu Recht nicht angefasst — es liegt außerhalb des Fix-Auftrags (der sich auf
Fund 4 = §2.3/§2.4-Verwechslung bei R30–R33 beschränkte), und eine Korrektur „im Vorbeigehen" hätte das
Risiko getragen, das jetzt bewusst vermiedene Muster („ein Falschverweis durch einen anderen ersetzt")
zu wiederholen.

### Beobachtungen außerhalb des Umfangs

- Der neue §16-Warnblock (`lagerbuch-cutover.md:376-377`) verallgemeinert „§1–§15" pauschal als
  „gemessene Einzeltatsache aus dem Bau". Mindestens §6 („Handgriffe aus dem Entscheidungsprotokoll")
  und §15 selbst („Die sieben Übergaben aus Teil 6 als Handgriffe") sind eher Handlungslisten als
  Baubefunde. Schwächt die Kernaussage (§16 hat Übernahmepflicht, die anderen nicht) nicht ab, ist aber
  nicht ganz präzise — nicht blockierend.
- Zeile 118 im Plan (siehe oben) bleibt ein offener, unadressierter Verweisfehler; nicht Teil dieses
  Fix-Auftrags, aber ein Kandidat für eine künftige Nachbesserungsrunde.

### Verdikt

**Fix-Runde:** Alle Funde behoben, keine neuen Schäden.
