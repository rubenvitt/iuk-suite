# Review-Verdikt: Task 176a (Abnahme Schritte 1–4)

Base `7cea8e4` · Head `04a4438`. Prüfmaterial: Task-Brief, Bericht (413 Zeilen), Commit-Rumpf
`04a4438`, Diff-Datei, plus gezielte Nachlese im Arbeitsbaum (nur lesend) für die im Auftrag
benannten Ankerstellen.

## Spec-Treue

✅ **spec-treu** — keine Critical-Funde. Ein Important-Fund (Prozess, nicht Substanz), siehe unten.

## ⚠️ Aus dem Material nicht prüfbar

- Die 23×200-Antworten und die 36 echten Routen-Abrufe sind Übernahmen aus T175 (derselbe Plan-Teil,
  andere Sitzung dieser Sitzungsfolge) — ich habe sie nicht selbst abgerufen (Auftrag verbietet einen
  eigenen Playwright-Lauf). Der Bericht deklariert das offen als Übernahme, nicht als „abgehakt in
  Teil N" einer anderen Instanz; das ist der vom Auftrag verlangte Unterschied und wird eingehalten.
- Die `Dockerfile`-COPY-Gegenprobe und das Schema-Diff-Protokoll aus Teil 1 (B-3) — beide würden eine
  Mutation bzw. ein externes Dokument erfordern, die ich nicht nachvollziehen kann.
- Die vollständige `_actions/guards.test.ts`-Zählmechanik (Regex-Scan über alle 18 Dateien) habe ich
  nicht Zeile für Zeile nachgerechnet, nur die Summen (47/44/3/18/19/43/15) — die stimmen bei
  unabhängiger Gegenrechnung aus der `SOLL`-Tabelle.

## Stärken

- **Schritt 2 exakt nach der Verschärfung gearbeitet:** Statt Existenz zu prüfen, wurde je Alt-Spec-
  Zeile die *Aussage* verglichen und ein tragender Befund (F-1) gefunden — `e2e/lagerbuch-verwaltung.spec.ts`
  (115 Zeilen, zwei `describe`-Blöcke) trägt nur eine halbe von sieben ihr zugeschriebenen Zeilen.
  Selbst nachgezählt: `wc -l` → 115, `grep describe` → genau zwei Blöcke. Stimmt.
- **F-8 trifft Ruling A7 wortgenau.** Der alte Zusicherungsname „`guards.test.ts` ist die 19. Datei
  des Ordners" ist exakt das im Brief zitierte Negativbeispiel. Verifiziert: `_actions/` hat 37
  Einträge (`ls | wc -l` → 37), der Ordner-Vergleich war also tatsächlich falsch. Der Fix entfernt die
  Ordinalzahl aus Testname **und** Fehlermeldung (`${SELBST} liegt daneben.`), ohne die geprüfte
  Aussage (Existenz von `guards.test.ts`) zu verändern.
- **Die vier Fixes in `guards.test.ts` sind line-count-neutral, wie behauptet.** Beide Hunks im Diff
  sind `@@ -259,28 +259,28 @@` und `@@ -398,28 +398,28@@` — alter und neuer Block je exakt 28
  Zeilen. Die drei fremden Datei-Anker auf `guards.test.ts`-Zeilennummern (aus F-9, s.u.) bleiben damit
  gültig, soweit sie noch numerisch ankern.
- **F-9 auf die Zeile genau nachvollzogen.** Base-Commit `7cea8e4` zeigt: der Satz „EIN `export const
  FOO = 5` WIRD MITGEMELDET…" steht dort auf Zeile 272–274, nicht auf den zitierten `:265-267` — exakt
  die vom Bericht behauptete ~7-Zeilen-Drift. Ebenso bestätigt: `_lib/bauform.test.ts` trägt den Satz
  „Ein Scan darf falsch-positiv sein… nie falsch-negativ und still" bei Base auf `:95-96`, nicht auf
  dem zitierten `:66-78`.
- **D1 (zurückgezogener Fund) ist an der Sache korrekt begründet.** `_actions/buchung.ts:99-101`
  dokumentiert wörtlich „DER WURF IST HIER RICHTIG (§7.3, Riegelfall): er rollt die Transaktion
  zurueck; der `catch` unten macht daraus den Rueckgabewert." Gelesen: `:105` und `:187` werfen
  tatsächlich deutsche Sätze *innerhalb* der Transaktion (`"Charge gehört nicht zu diesem Artikel"`,
  `"Ziel ist kein gültiges, aktives Fahrzeug"`), und die beiden `catch`-Blöcke (`:127-132`, `:208-213`)
  sind der einzige Weg, wie diese Sätze zum `ActionErgebnis` werden. Ein Fix, der `e.message` hier
  durch einen festen Text ersetzt hätte, hätte diese spezifischen Fehlertexte zerstört — genau das
  meldete der Umsetzende als vier rot gewordene Tests. Der Rückzug war richtig, und das benannte
  Restrisiko (B-6: derselbe `catch` kann auch rohen SQLite-Text durchreichen) ist real und sauber als
  Fachentscheidung ausgelagert, nicht verschwiegen.
- **F-2/B-1 (Zustand 27) an der Quelle nachvollzogen und korrekt.** `_lib/checkErgebnis.ts:149/154/161`
  geben bei *jedem* Lesefehler `leer()` zurück, ohne Diskriminator. Volltextsuche im gesamten
  Nicht-Test-Quellbaum nach „unlesbar"/„Ergebnis unlesbar" findet **keinen** Treffer außerhalb von zwei
  thematisch unabhängigen Kommentaren (bz.ts, BarcodeScanner.tsx). `checks/[id]/page.tsx` unterscheidet
  nur `check.altFormat` (V1), nicht „Lesefehler vs. legitim leer" — ein unlesbares `checks.ergebnis`
  zeigt also tatsächlich `0 geprüfte Positionen` ohne jeden Hinweis. Die Feststellung ist korrekt, die
  Nicht-Fix-Entscheidung (Fachentscheidung, W1-Ausnahme) korrekt eingeordnet.
- **Alle sieben Fundorte von Zustand 16 exakt verifiziert** (`grep notFound` in allen sieben
  genannten Dateien, Zeilennummern 180/18/35/17/39/71/95) — treffen alle zeichengleich zu.
- **Globale Zahlen unabhängig nachgezählt und bestätigt:** 37 `_actions/`-Einträge, 23 `page.tsx`
  unter `verwaltung/(arbeit)`, 36 in `ikonen.test.ts` (`toHaveLength(36)`), `SOLL`-Summe in
  `guards.test.ts` = 47 (nachgerechnet), 43 = 47 − (gate.ts 1 + sitzung.ts 2 + check.ts 1), 15 = 18 − 3
  Dateien. Keine Zahl abgesenkt — Global Constraint gehalten.
- Der Bericht verdünnt sich über die Länge **nicht**: Schritt 4 (Teil 1–6) trägt weiterhin
  `datei:zeile`/Testname-Belege bis zur letzten Zeile; „abgehakt in Teil N" kommt im ganzen Dokument
  nur einmal vor — als Zitat der *verbotenen* Formulierung, nicht als eigener Beleg.
- Ehrliches Offenlassen: Teil 6 „alle 24 Tasks eingecheckt" bewusst nicht grün gehakt (T176 läuft
  noch selbst) — kein Häkchen ohne Sache.
- Die Entscheidung, Playwright nach den vier Fixes nicht erneut zu fahren, ist bei Diff-Prüfung
  gerechtfertigt: alle vier Änderungen sind ausschließlich Kommentare bzw. eine Assertion-Fehlermeldung
  (kein Export, keine Laufzeitlogik, kein gerendertes Markup betroffen) — verifiziert am Diff selbst.

## Funde

### Critical (muss behoben werden)
Keine.

### Important (sollte behoben werden)

1. **`plan-mandated` — Betreiberentscheidung W1 verletzt: nicht jeder Fund ist ein eigener Commit.**
   W1 lautet wörtlich: „Funde werden sofort gefixt, jeder als eigener Commit." Der Bericht selbst
   führt vier gefixte, einzeln nummerierte Funde (F-6, F-7, F-8, F-9), erzeugt aber nur **zwei**
   Commits: `a479606` bündelt F-6, F-7 **und** F-8 als „drei T172-Minor" in einem Commit; `3203484`
   trägt F-9 allein (dort vertretbar, weil F-9 selbst ein einzelner Fund mit drei Anker-Stellen ist).
   Für F-6/F-7/F-8 gilt das nicht — das sind drei getrennt beschriebene, unabhängig entstandene Funde
   (verschiedene veraltete Verweise, verschiedene Ursachen), die dieselbe Regel einzeln verlangt hätte.
   Das ist keine Frage der Spec-Treue der Abnahme-*Aussagen* — die sind korrekt —, sondern eine
   verifizierbare Abweichung von einer Global Constraint, die diesen Task ausdrücklich bindet. Folge:
   ein späterer `git revert` von z. B. nur F-8 (falls sich der A7-Fix als falsch herausstellte) ist ohne
   manuelles Aufsplitten nicht möglich.
   Beleg: Commit-Liste im Bericht (Zeilen „Commits:" im Statusblock) gegen `Geänderte Dateien`-Tabelle
   (vier Dateien, vier Funde F-6/F-7/F-8/F-9) und den Diff (zwei Commits `a479606`, `3203484`).

### Minor (nice to have)

1. Der Bericht beziffert `e2e/lagerbuch-verwaltung.spec.ts` mit „116 Zeilen, vollständig gelesen";
   gemessen sind es 115 (`wc -l`). Ändert nichts an F-1s Kernaussage (zwei `describe`-Blöcke, sechs plus
   einem Test), reine Off-by-one-Ungenauigkeit in der Beleg-Prosa.

## Bewertung

**Task-Qualität:** Angenommen
**Begründung:** Die Substanz der Abnahme (Schritte 1–4, alle drei Verschärfungen, alle Global
Constraints) ist an jeder gezielt nachgeprüften Stelle korrekt und mit Datei:Zeile belegt; der einzige
tragende Fund (F-1) und der einzige echte Lückenfund (F-2/B-1) sind beide bei eigener Nachlese
bestätigt, und der zurückgezogene Fund D1 war zu Recht zurückgezogen. Der einzige Makel ist
prozessual (W1-Commit-Granularität bei F-6/F-7/F-8), nicht inhaltlich — er sollte vor der zweiten
Hälfte nachgezogen werden (z. B. durch eine kurze Notiz im Übergabeprotokoll oder nachträgliches
Aufsplitten), blockiert aber die Kernaussage der Abnahme nicht.
