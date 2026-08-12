# Review-Verdikt: Task 176, Hälfte B (Schritte 5–7)

Base `407075e` · Head `133e6ba` · geprüft: Diff, Commit-Text (`git show -s --format=%B 133e6ba`),
Bericht `task-176b-report.md`, Plan-Auszüge §10.2/§11.5 aus `task-176-brief.md`, Runbook-Header und
Sektionsliste von `docs/runbooks/lagerbuch-cutover.md`.

## Spec-Treue

✅ **spec-treu** — alle acht Auftragspunkte sind umgesetzt und stichprobenartig gegen den Diff
verifiziert. Keine fehlenden, keine missverstandenen Punkte gefunden.

- **Punkt 1** (fünf Gates, dieser Lauf): Commit-Zahlen (`typecheck grün · lint 0/5 · vitest 337/5806 ·
  build grün · playwright 173, 6,1 min`) sind zeichengleich mit dem Bericht
  (`task-176b-report.md:18-22`). `git show` bestätigt denselben Wortlaut im tatsächlichen Commit.
- **Punkt 2** (sieben R-Zeilen wörtlich): `review-407075e..133e6ba.diff:193-199` (Runbook §16.2, R30–R36)
  gegen `task-176-brief.md:229-235` (Plan §10.2) zeilenweise verglichen — **zeichengleich**, inklusive
  des benannten Rückfalls in R30 (`margin`-Parameter an `core/qr#qrSvg`, „Level H bleibt in beiden
  Fällen") und des Betreiberfrage-9-Vorbehalts in R31. Kein Wort gekürzt oder umformuliert.
- **Punkt 3** (§10 vollständig, drei Untertabellen): `diff:168-215` (Runbook §16.1–§16.3) gegen
  `task-176-brief.md:206-251` — alle drei Untertabellen vorhanden, inklusive des DOM-Harness-Schlussabsatzes
  nach §16.3. §16.3 („was Spec 2 nicht erbt") ist **nicht** unter den Tisch gefallen.
- **Punkt 4a** (HTTPS-Zeile): `diff:76-94` (Runbook §13). Beide Scan-Pfade (`/verwaltung/geraete/scan`,
  `/verwaltung/bz/scan`), `KEIN_SICHERER_KONTEXT`, das manuelle Feld und die „kaputt vs. geprüft,
  beides falsch"-Unterscheidung sind wörtlich enthalten.
- **Punkt 4b** (Zustand 27, offener Check): `diff:98-137` (Runbook §14). Beide Hälften korrekt: „Ergebnis
  unlesbar" auf der Detailseite + `unlesbar` in der Positionen-Spalte ist **gebaut**; offener Check
  (`ergebnis IS NULL`) bleibt bewusst „0 Positionen", mit DRK-196-Verweis.
- **Punkt 4c** (sechs Board-Posten): `diff:225-230` — DRK-192, DRK-193, 86cb3y7db, 86cb3y7h0, DRK-196,
  86cb403u5 alle sechs vorhanden, im bestehenden Format, die zwei alten Zeilen unangetastet.
- **Punkt 5** (Plankorrektur „22" → gemessen): `diff:246-278` (Plan §11.5 Zeile 11). 35 Stellen/14
  Dateien gemessen und dokumentiert, kein `toHaveLength` eingeführt (verifiziert: der Diff ändert
  keine Testdatei). ⚠️ Siehe Minor-Fund unten zur Umsetzungsart.
- **Punkt 6** (überholte Teil-4-Zeile weg): bestätigt per `git show -s --format=%B 133e6ba` — die Zeile
  „⚠️ Offen, solange Teil 4 keine Tasks traegt…" ist im tatsächlichen Commit **nicht** vorhanden.
- **Punkt 7** (drei Fundstellen im Commit): alle drei im Commit-Text nachgewiesen — (i) „ACHT der 13
  Zeilen nannten den FALSCHEN Nachfolger", (ii) „§11.5: jeder der 40 Zustaende hat einen Ort … weil er
  in DIESER Sitzung GEBAUT wurde", (iii) „T174: die literale ?q=-URL … hatte in KEINER e2e/*.spec.ts
  einen Nachfolger … Sie fiel zwischen Teil 5 und Teil 6".
- **Punkt 8** (24 Tasks, zwei Dispatches): Commit nennt „Teil 6: alle 24 Tasks eingecheckt." und im
  Vorspann „T176 lief in ZWEI Dispatches: A = Schritte 1-4, B = Schritte 5-7. Dazwischen lag der
  Nachbau von Fehlerzustand 27".

**Zahl 164 im Betreff (Auftrag: prüfen):** rechnerisch bestätigt aus den im selben Commit genannten
Bereichen: T1–T14 (14) + T15–T27 (13) + T28–T61 (34) + T62–T87 (26) + T100–T152 (53) + T153–T176 (24)
= **164**. Stimmt exakt, inklusive der korrigierten Teil-4-Spanne T62–T87 (vorher fälschlich „T62-T85"
im Entwurf).

**Global Constraints:** keine neue Datei unter `e2e/` oder `_actions/` (Diff berührt ausschließlich
zwei Dateien unter `docs/`) · kein `src/core` berührt · keine Zahl abgesenkt (5798→5806 vitest, volle
Playwright-Suite statt Teilsuite) · Plantabellen-Drift (§11.5 Zeile 11) in Richtung der Messung
nachgezogen.

## ⚠️ Aus dem Material nicht prüfbar

- **Playwright-Plausibilität 169 → 173:** der Bericht vergleicht nur gegen T176-A1s Teilsuite
  (9+54 Specs), nicht gegen Hälfte As vollen Lauf (169, laut Koordinator). Die Differenz (+4) ist mit
  „Nachbau hat E2E-Zusicherungen ergänzt" plausibel, aber nicht Zeile für Zeile belegt — dafür fehlt
  hier Hälfte As Rohbericht.
- **§12.5-Korrektur („acht falsche Nachfolger") selbst:** liegt materiell in Hälfte As Commits vor
  `407075e`, nicht in diesem Diff. Der Commit-Text referenziert sie korrekt, die zugrunde liegende
  Korrektur selbst ist nicht mein Prüfgegenstand.

## Stärken

- Die Wörtlichkeitsprüfung ist selbst nachvollziehbar dokumentiert (Bericht nennt Zeilenbereiche in
  Plan und Runbook) und hält der eigenen Stichprobe stand.
- §13–§16 sind im Runbook **fortlaufend nummeriert** in den bestehenden Ablauf eingehängt (`## 13.` bis
  `## 16.` folgen direkt auf `## 12.`), nicht hinten an die „Offene Posten"-Tabelle drangehängt — die
  Reihenfolge im Dokument bleibt die Lesereihenfolge.
- Ehrliche Selbstkorrektur im Bericht selbst dokumentiert (Abschnitt „Hier lag im ersten Entwurf ein
  Fehler": zwei gleichrangige `NULL`-Abfragen zu einer maßgeblichen + einer Diagnose-Abfrage korrigiert,
  bevor es ins Runbook ging).
- Die überholte Teil-4-Zeile wurde nicht nur aus dem Commit, sondern auch aus dem **Plan-Entwurf**
  gestrichen (`diff:330-336`) — konsistent an beiden Stellen.
- Zahlenehrlichkeit im Betreff: „100 Tasks" (unbelegt) durch die gezählte, jetzt verifizierte 164
  ersetzt, statt eine runde Zahl stehen zu lassen.

## Funde

#### Critical (muss behoben werden)

Keine.

#### Important (sollte behoben werden)

1. **§16 ist im Dokument nicht als „muss ins echte Runbook übernommen werden" markiert** — die einzige
   Warnung dieser Art steht im Bericht, nicht im Dokument. Der generische Kopfhinweis
   (`docs/runbooks/lagerbuch-cutover.md:3-6`: „Dies ist noch nicht das Cutover-Runbook … geschrieben
   wird dieses mit Spec 2") gilt gleichermaßen für §1–§16 und hebt §16 nicht als die eine Sektion mit
   **Übernahmepflicht** (im Unterschied zu den übrigen, die „nur" gemessene Befunde sind) hervor. §16s
   eigener Text (`diff:160-162`) verstärkt das sogar unabsichtlich: er spricht von „das Cutover-Runbook
   wird unter Zeitdruck gelesen", als wäre dieses Dokument schon jenes — im Widerspruch zum Kopf der
   Datei. Wer das echte Runbook nach dem Muster von `files-cutover.md` schreibt und diesen
   Vorlauf-Sammelort als „eine von vielen Fundstellen" behandelt statt als Pflichtquelle, kann §16
   glatt übersehen oder zusammenfassen — exakt das Szenario, vor dem Bedenken 2 warnt. Siehe Bewertung
   unten.

#### Minor (nice to have)

1. **§11.5 Zeile 11: Zahl gestrichen statt „in Richtung der Messung nachgezogen".** Der Auftrag sagte
   wörtlich „Zahl in Richtung der Messung nachziehen" (`task-176-brief.md`, Koordinator-Text). Die
   Umsetzung entfernt die Zahl aus der Zelle ganz und platziert „35 Stellen in 14 Dateien" nur in einem
   Fußnotenabsatz darunter (`diff:246-278`). Die Begründung (kein `toHaveLength`, Ruling A7) ist
   inhaltlich richtig und gut dokumentiert — aber es ist eine andere Handlung als „nachziehen", und ein
   künftiger Leser der Tabellenzeile selbst sieht dort keine Zahl mehr, nur im Fließtext danach.
   Vertretbare Auslegung, aber eine engere Lesart des Auftrags hätte „35" in die Zelle geschrieben (mit
   demselben Fußnoten-Vorbehalt gegen ein Gate darauf).
2. **§11 verweist nicht vorwärts auf §13.** §13 sagt „Gehört mit §11 zusammen abgearbeitet"
   (`diff:94`), aber §11 (`lagerbuch-cutover.md:248-260`) hat keinen Rückwärts/Vorwärts-Verweis auf §13.
   Ein Leser, der §11 sequenziell abarbeitet (PWA installieren, Kärtchen einlösen, **mit Systemkamera
   scannen**), erfährt die HTTPS-Voraussetzung erst zwei Sektionen später. Die Verlinkung ist nur
   einseitig (§13 → §11).
3. **§2.3 des Plans bleibt mit der älteren, kürzeren R30/R31-Fassung stehen**, bewusst unangetastet
   (historischer Abschnitt) und im Schritt-5-Zusatz benannt. Nachvollziehbar, aber ein zukünftiges
   `grep` nach „R30" im Plan findet weiterhin zwei unterschiedliche Fassungen ohne Warnung an der
   älteren Stelle selbst.

## Bewertung der zwei Bedenken

**Bedenken 1 (Doppelung §15/§16.2):** Gerechtfertigt, kein Nachbesserungsbedarf. Ich habe die beiden
Fassungen zeilenweise verglichen (`diff:141-155` vs. `diff:193-199`): §15 ist **keine** zweite
wörtliche Kopie, sondern eine verdichtete Ablaufsicht (Spalte „Wann" + Kurzfassung der Handlung), die
für Details ausdrücklich auf §16.2 verweist („dort und nur dort", `diff:143-144`). Das erfüllt genau
die im Auftrag verlangte doppelte Form (wörtlich **und** als Abschnitt) ohne echte Wartungsgabel: nur
§16.2 trägt den vollständigen Wortlaut inklusive Begründung, §15 trägt nur, was für die
Ablaufreihenfolge nötig ist. Ein künftiger Bearbeiter, der §15 ändert, ändert eine Zusammenfassung,
keine zweite Quelle der Wahrheit — solange der Hinweis „dort und nur dort" stehen bleibt. Kein Fund.

**Bedenken 2 (Vorlauf statt Runbook):** Berechtigtes Bedenken, **Nachbesserung sinnvoll** (siehe
Important-Fund oben). Die Ablage im Vorlauf-Dokument selbst ist richtig — es gibt aktuell keinen
anderen Ort, und `files-cutover.md` als Vorbild existiert für lagerbuch noch nicht. Die Warnung „§16
muss übernommen werden" ist aber **nicht im Dokument verankert**, sondern nur im Bericht, den laut
Auftragstext „niemand mehr liest". Der generische Kopfhinweis der Datei behandelt §16 nicht anders als
§1–§15, obwohl §16 kategorial verschieden ist: es ist keine „gemessene Einzeltatsache aus dem Bau",
sondern die **verbindliche Übergabeliste an Spec 2** (§16 sagt das sogar selbst: „Diese Liste ist
verbindlich"). Eine ein- bis zweizeilige Markierung direkt über oder in §16 („Diese Sektion **muss**
vollständig in das echte Cutover-Runbook übernommen werden, nicht zusammenfassen/referenzieren") wäre
die naheliegende, minimale Ergänzung und fehlt.

## Bewertung

**Task-Qualität:** Nachbesserung nötig
**Begründung:** Kein einziger Critical-Fund; alle acht Auftragspunkte sind vollständig und größtenteils
wörtlich umgesetzt, die Zahl 164 stimmt nachrechenbar, die überholte Teil-4-Zeile ist weg. Die
Nachbesserung betrifft nur den einen Important-Punkt aus Bedenken 2 (eine fehlende Verankerung im
Dokument selbst, kein Inhaltsfehler) — leicht behebbar durch eine ein- bis zweizeilige Ergänzung direkt
in oder über §16, ohne den Inhalt anzufassen.
