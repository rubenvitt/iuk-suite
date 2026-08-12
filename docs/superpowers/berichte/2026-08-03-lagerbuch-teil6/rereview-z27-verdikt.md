# Nachprüfung Fix-Runde T176a1 — 443ddb0..407075e

### Fund-Verdikte

1. **E2E-Gegenprobentest-Name widersprach seinem Fixture** — ADDRESSED.
   `e2e/seed-lagerbuch.ts:107-114` legt die dritte Seed-Zeile `e2e-check-leer` an (gültiges, leeres V2,
   an `e2e-fahrzeug` gehängt, `completedAt` 4h in der Vergangenheit). `e2e/lagerbuch-verwaltung.spec.ts:39`
   trägt jetzt den Test „ein legitim LEERER Check bekommt KEINE solche Warnung" gegen genau diese Zeile,
   der alte Test ist auf `:55` zu „ein gefüllter lesbarer Check …" umbenannt — Name und Fixture stimmen
   jetzt in beiden Fällen überein. Bevorzugter Weg genommen (dritte Zeile statt Umbenennung), wie im
   Auftrag gewünscht.

2. **Übersicht zeigte weiter die ruhige Null** — ADDRESSED.
   `verwaltung/(arbeit)/checks/page.tsx:80-92` liefert `positionenText: zeile.unlesbar ? "unlesbar" :
   String(zeile.positionen)`; `ChecksTabelle.tsx:69-70` rendert die Spalte unverändert als
   `<span style={SCHRIFT.mono}>{text}</span>` — kein Chip, kein Rot, kein Symbol, diese Datei ist vom
   Fix nicht berührt. Gegenprobe vorhanden und real: `checks/page.test.tsx:729-769` (echte migrierte
   SQLite-Test-DB, keine Mocks) prüft „unlesbar" für kaputt, „0" für legitim leer, „1" fürs Altformat,
   und dass `CheckAnzeigeZeile` weiterhin `not.toHaveProperty("unlesbar")` ist (`istRekursivJsonSicher`)
   — die Entscheidung bleibt serverseitig, über die RSC/Client-Naht (`ChecksTabelle` ist `"use client"`)
   geht nur Text. E2E gegengeprüft: `e2e/lagerbuch-verwaltung.spec.ts:66-81`, `toHaveCount(1)` auf einem
   nach „unlesbar" gefilterten `getByRole("row")` (schlägt bei 0 Treffern fehl, nicht vakuos) plus
   Gegenprobe auf eine sichtbare „vollständig"-Zeile.

3. **Vier Leertexte widersprachen weiter der Warnung** — ADDRESSED, und die „ein Prop statt vier"
   -Refaktorierung lässt den lesbaren Fall unverändert. `CheckDetailTabellen.tsx:504-506`:
   `const leertext = (vorgabe) => unlesbarLeertext ?? vorgabe`; alle fünf `emptyText`-Stellen
   (`:517,529,541,553,565`) tragen weiter wortgleich die vier alten Literal-Texte
   („Keine Positionen erfasst.", „Keine Geräte in diesem Check.", „Keine Flaschen in diesem Check.",
   „Keine Verfallsangabe in diesem Check.") als `vorgabe`-Argument im Quelltext — `unlesbarLeertext` ist
   für lesbare Checks `null` (`page.tsx:694-696`: nur bei `check.unlesbar` gesetzt), `??` fällt dann auf
   `vorgabe` zurück, der Text bleibt byte-identisch. Bestehender Basistest (`CheckDetailTabellen.test.tsx`
   bis `:192`, unverändert) sichert das weiterhin ab; neuer Test `:426-454` zählt den Ersatzsatz fünffach
   im DOM und schließt alle fünf Originaltexte einzeln aus. `page.test.tsx:621-643` sichert zusätzlich
   die Gegenprobe „lesbar → `unlesbarLeertext` falsy" und „Altformat behält seinen eigenen
   `nachfuellLeertext`".

4. **Zählfehler im Bericht** — ADDRESSED. Bericht nennt jetzt „8 Parser" / „17 Tests neu"
   (`task-176a1-report.md:118-120,334`). Nachgezählt: `checkErgebnis.test.ts`, describe „unlesbar ist von
   legitim leer unterscheidbar" hat real 9 `it(`-Blöcke (8 aus der Ausgangsrunde + 1 neuer für
   `undefined`, Minor 5) — deckt sich mit Abschnitt 10 des Berichts („der Parser-`describe` hat damit
   jetzt 9 Tests"). Die Gesamtsumme der neuen Tests in diesem Fix-Diff (1 Parser + 1 Domain + 1
   CheckDetailTabellen + 1 Detailseite + 4 Übersicht = 8) deckt sich mit dem gemeldeten Delta
   5798 → 5806.

5. **Laufzeit-`undefined` verhielt sich anders als `null`** — ADDRESSED.
   `checkErgebnis.ts:189`: `if (roh === null || roh === undefined) return leer();` (zwei explizite
   `===`, kein `==`/`eqeqeq`-Konflikt). Test `checkErgebnis.test.ts:141-155` sichert es benannt zu, mit
   Kommentar, warum der Pfad heute unerreichbar ist (Signatur `string | null`) und trotzdem geschützt
   werden soll.

### Neue Schäden im Fix-Diff

Keine. Insbesondere geprüft:
- **Kein zweiter Herleitungsweg für `unlesbar`.** `CheckSummen.unlesbar` (`domain/check.ts:327`) ist die
  einzige Quelle; `checkDetail` bezieht es jetzt aus `summe.unlesbar` (`lesepfade/checks.ts:400`) statt
  wie vorher direkt aus `e.unlesbar`, und `checkHistorie` bekommt es automatisch über
  `...summiereCheckErgebnis(...)` (`checks.ts:34,63`, `CheckHistorieZeile = CheckSummen & {...}`) — repo-
  weit ist `summiereCheckErgebnis`/`CheckSummen` nur in dieser einen Datei verbraucht (nachgegrept), kein
  zweiter Konsument, der stillschweigend eine andere Bedeutung bekäme.
- **`checkHistorie` hat nur einen Aufrufer** (`checks/page.tsx`), und der reicht `unlesbar` nicht
  ungefiltert weiter — `anzeigeZeile()` baut `CheckAnzeigeZeile` feldweise, kein Spread, das Flag
  überquert die Client-Grenze nicht (durch Test belegt, s. o.).
- **V1/V2-Trennung bleibt scharf**: `domain/check.ts:349-351` setzt für V1 explizit `unlesbar: false`
  (kommentiert „V1 ist LESBAR"), Mutual-Exclusion zu `altFormat` bleibt durch den unveränderten Test
  „haelt Altformat und unlesbar auseinander" abgesichert.
- **Playwright-Zahlen strukturell nicht vakuos**: die vier im Bericht genannten Fälle (kaputt · leer ·
  gefüllt · Übersichtszeile) sind vier tatsächliche `test()`-Blöcke im Diff, jeweils mit
  `toHaveCount`/`toBeVisible`-Zusicherungen, die bei 0 Treffern fehlschlagen — keine reine
  Statusprüfung ohne Inhaltsbezug.

### Beobachtungen außerhalb des Umfangs

Keine.

### Verdikt

**Fix-Runde:** Alle fünf Funde behoben, keine neuen Critical/Important-Schäden.
