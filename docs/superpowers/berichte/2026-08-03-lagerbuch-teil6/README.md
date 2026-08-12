# Archiv: Abnahme von Lagerbuch Teil 6

Belege aus dem Bau und der nachgeholten Abnahme von **Teil 6** des Lagerbuch-Moduls
(`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`), zusammengetragen für **PR #40**.

## Anlass

PR #39 hat Teil 6 gemergt, ohne dass ein Abschlussreview über die 35 Commits gelaufen ist. Dieser
Zweig hat das Review nachgeholt (`final-review-teil6.md`) und zusätzlich die eigentliche
Abnahme-Arbeit noch einmal reviewt (`final-review-abnahme.md`). Alles davon ist im Bau unter
`.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/` entstanden — einem Verzeichnis, das
`.superpowers/sdd/.gitignore` (Inhalt `*`) vollständig ausschließt. Nach Abschluss der Abnahme wird
dieses Arbeitsverzeichnis gelöscht; ohne dieses Archiv wären die Belege damit weg, obwohl der Plan
und mehrere Commits (u. a. der 40-Fundorte-Commit `b2a7db4`) sich inhaltlich auf sie stützen. Das
Muster folgt `docs/superpowers/berichte/2026-08-03-lagerbuch-teil4/`, dem Archiv von Teil 4.

## Die zwei Funde, die vor den Cutover gehören

`final-review-teil6.md` triagiert alle aufgeschobenen Funde und stuft zwei davon ausdrücklich vor
den Cutover, nicht aufs Board (Empfehlung 4, „Die zwei Einzeiler mitnehmen, die auf dem Board nur
verrotten"):

- **T163 c** — der `loading.tsx`-Riegel in `error.test.tsx` liest sein Verzeichnis nicht rekursiv,
  obwohl die Vorgabe „keine `loading.tsx`, in keiner Route" lautet. Herleitung samt Messung:
  `final-review-teil6.md`, Zeile „T163 c" in der Triage-Tabelle.
- **T171 b** — `toMatch(/^\//)` lässt `//fremder-host/pfad` als „relativ" durch, eine offene
  Weiterleitung. Herleitung samt Messung: `final-review-teil6.md`, Zeile „T171 b" in der
  Triage-Tabelle. ⚠️ Die dort **und** im Auftrag genannte Datei ist falsch (`e2e/lagerbuch-hosts.spec.ts`) —
  richtig ist `e2e/lagerbuch-helfer.spec.ts`, siehe `fix-welle-report.md`, Fund F1.

(Beide Fixes sind laut `fix-welle-report.md` inzwischen als Teil der Fix-Welle committet — die
Verweise oben zeigen auf die Herleitung des Fundes, nicht auf einen offenen Zustand.)

## Inhalt

| Datei | Was sie ist |
|---|---|
| `final-review-teil6.md` | Das nachgeholte Abschlussreview über die 35 Commits von Teil 6 (`9bf928d..47d4b7a`) — der wichtigste Beleg, trägt die beiden Funde oben samt Messung und geprüften Abhilfewegen. |
| `final-review-abnahme.md` | Abschlussreview über die Abnahme-Arbeit selbst (`f668007..fe49511`), mit Satz-für-Satz-Prüfung des Abnahme-Commits `133e6ba`. |
| `BAUPROTOKOLL.md` | Der Ledger: alle Task-Ergebnisse, Rulings, aufgeschobene Funde, drei dokumentierte Koordinatorfehler. **Umbenannt** aus `progress.md` (Quelldateiname im Arbeitsverzeichnis), nach dem Muster von Teil 4. |
| `entscheidungen.md` | Die 15 Entscheidungen des Baus, mit Begründung. |
| `preflight-scan.md` | Der Vorab-Scan, der 11 bau-anhaltende Widersprüche vor dem ersten Task auflöste. **Umbenannt** aus `vorab-scan.md`, nach dem Muster von Teil 4. |
| `task-174-report.md`, `task-175-report.md`, `task-176a-report.md`, `task-176a1-report.md`, `task-176b-report.md`, `fix-welle-report.md` | Task- und Fix-Welle-Belege der letzten Bauphase. |
| `review-175-verdikt.md`, `review-176a-verdikt.md`, `review-176b-verdikt.md`, `review-z27-verdikt.md` | Review-Verdikte zu den jeweiligen Tasks. |
| `rereview-175-verdikt.md`, `rereview-176b-verdikt.md`, `rereview-final-verdikt.md`, `rereview-z27-verdikt.md` | Nachreview-Verdikte, wo ein erster Verdikt zurückgewiesen oder nachgebessert wurde. |
| `fix-welle-KOLLISION-befund.md` | Befund einer Sitzung, die während der Fix-Welle auf denselben Arbeitsbaum traf wie eine zweite, bereits laufende Sitzung — dokumentiert die Kollision, macht aber selbst keine Änderung (0 Commits). Eigenständiger, vierter Koordinationsvorfall neben den drei in `BAUPROTOKOLL.md`. |

**Nicht übernommen:** die `review-<sha>..<sha>.diff`-Pakete (Rohdiffs, aus git jederzeit
wiederherstellbar) sowie Task-Briefs und die Reports der Tasks vor 174 — reiner Zwischenstand, in
`BAUPROTOKOLL.md` und den beiden Abschlussreviews bereits verdichtet.
