# Radio-Import — die zurückgestellten Kleinfunde (Plan 1)

**Stand 2026-08-21.** Plan 1 (`scripts/import/radio.ts`) ist abgeschlossen und schlussgeprüft:
118 Tests grün im berührten Bereich, `typecheck`, `lint` und `pnpm build` je Exit 0, elf signierte
Commits (`2fd9337..0f056c8`).

Diese Seite führt die **14 Kleinfunde**, die während des Baus von B14–B17 und in der Schlussprüfung
gefunden und **bewusst zurückgestellt** wurden. Die Schlussprüfung hat 13 davon einzeln triagiert;
**keiner muss vor den Merge.** Der Maßstab war jeweils: *ändert er, was am Cutover-Abend passiert,
oder was ein künftiger Bearbeiter dieser Datei still kaputtmachen kann?*

> **Warum diese Seite existiert.** Die Funde standen bis hierher nur im Arbeitsverzeichnis
> `.superpowers/sdd/`, und das ist **git-ignoriert**. Ein Messwert oder ein Restposten, der nur in
> der Kladde steht, ist beim nächsten Griff in die Datei nicht mehr da. Dieselbe Überlegung hat
> schon ⬜ L6 in ein verfolgtes Artefakt gebracht
> (`2026-08-21-radio-import-abnahme.md`) — sie gilt hier genauso.

⚠️ **Was hier NICHT steht:** die vier Nachträge **NT8–NT11**. Sie sind keine Kleinfunde, sondern
binden den weiteren Weg und stehen deshalb in der Nachtragstafel des Ausführungsplans
(`../plans/2026-08-18-radio-ausfuehrungsplan.md`). Drei davon treffen Runbook-Schritte, die sonst am
Cutover-Abend scheitern würden.

---

## Die 14 Posten

| # | Stelle | Fund | Urteil der Schlussprüfung |
|---|---|---|---|
| 1 | `scripts/import/radio.ts`, durchgehend | Prosa-Kommentare tragen `ae/oe/ue` statt echter Umlaute | **bleibt** — Bestandsform der ganzen Datei; ein Halbumbau wäre schlechter als beides konsequent. Frage an den Plan, nicht an die Datei |
| 2 | `fixtures/radio-quelle.ts` | Das Feld `name` von `ALLE_QUELLZEILEN` wird nirgends gelesen | **bleibt** — verifiziert: `radio.test.ts:182` destrukturiert nur `{ tabelle, zeile }`. Das Feld ist Beschriftung für den Menschen, der die Liste liest |
| 3 | `radio.ts`, `tagInBerlin` | Nicht gegen den Faktor-1000-Fehler geprüft | ✅ **bereits erledigt** — `radio.test.ts:295` prüft es heute (`ALT_GERAET.last_updated_at / 1000` wirft). **Der Ledger-Eintrag war veraltet** |
| 4 | `radio.ts`, `msZuDatum` | `isFinite` neben `isInteger` redundant | **bleibt** — stimmt (`isInteger` impliziert `isFinite`), ist aber ein *Riegel*. Wer ihn entfernt, gewinnt nichts und riskiert einen Tippfehler an der teuersten Funktion der Datei |
| 5 | `radio.test.ts`, Test 2 | Der Docstring behauptet mehr Trennschärfe, als der Test hat | **bleibt** — Kommentarpräzision, kein Verhaltensunterschied |
| 6 | `radio.test.ts:66` | Dateiebenes `afterEach` läuft für alle Tests, auch die ~38 ohne Ziel-DB | **bleibt** — wörtlich so vom Plan vorgegeben; `rmSync(…, { force: true })` auf ein nicht existentes Verzeichnis ist folgenlos |
| 7 | `radio.test.ts:57-64` | `frischeZielDb()` schließt das Handle nie — vier offene Verbindungen bis Prozessende, und `rmSync` löscht unter offenem Handle | **bleibt** — auf POSIX folgenlos. Relevant nur auf Windows; die CI läuft nicht dort |
| 8 | `radio.ts:401` | Die fünfte Konfliktstrategie (`users`, `onConflictDoUpdate` auf `sub`) ist von keinem Idempotenzfall gesondet | **bleibt** — `name` und `lastSeenAt` werden beim nächsten OIDC-Login ohnehin überschrieben, ein plattgewalzter Suite-Wert heilt sich selbst. Bei `devices.update_note` (Fall A) und `software_versions.is_target` (Fall D) gilt das **nicht** — genau darum ist die Auswahl der vier Fälle richtig getroffen |
| 9 | `radio.test.ts:816` | Fall B ist der einzige der vier ohne Zusicherung nach dem **ersten** Import | **bleibt** — die tragende Zusicherung von Fall B ist der Rollback, und der ist seit `14cbf11` beweiskräftig über `devices.g-1.updateNote` gemessen |
| 10 | `radio.test.ts`, Fall-B-Block | Der Kommentarblock mischt ASCII-Umschreibung und echte Umlaute | **bleibt** — siehe #1 |
| 11 | `radio.ts:620` vor `:622` | `migrateAllModules()` läuft **vor** jeder Prüfung des Quellpfads: ein Tippfehler migriert erst alle Modul-DBs und stirbt dann mit einer Meldung, die **den Pfad nicht nennt** | **bleibt — aber ins Runbook.** Kostet Minuten, keine Daten (Migrationen sind idempotent). Geerbte Hausform (`portal.ts:101`, `feedback.ts:265`) — hier zu brechen machte `radio` zum Sonderfall. **Gehört als Satz in die Fehlerbehandlung des Cutover-Runbooks** |
| 12 | `radio.ts:657`, `:666-667` | Der `import.meta.url`-Vergleich bricht **still** bei einem Repo-Pfad mit Leer- oder Sonderzeichen: der CLI-Block läuft nicht, **Exit 0, keine Ausgabe**. `process.exit(1)` kann bei umgeleitetem stderr die Fehlerausgabe abschneiden | **bleibt — aber als *still* benannt.** Der **einzige** der 14 aus der stillen Familie. Heute unschädlich (Repo-Pfad ohne Sonderzeichen, und der Trockenlauf hat den CLI-Weg tatsächlich gezündet). Der Schutz am Cutover-Abend ist ohnehin die Prüfung der **Abschlusszeile**, nicht des Exit-Codes allein — und genau das schreiben die Runbook-Planteile schon vor |
| 13 | Messmethode des Trockenlaufs | Der Plan schreibt den Exit-Code-Fang über `tee` + `PIPESTATUS` vor; `zsh` kennt `PIPESTATUS` nicht (dort `pipestatus`, klein und 1-indiziert) | **bleibt** — betrifft das Messen, nicht das Gemessene. Für künftige Trockenläufe: **Redirect ohne Pipe und `STATUS=$?`** |
| 14 | `2026-08-21-radio-import-abnahme.md`, Abschnitte 1–2 | Die Kommandos sind dort nicht inline wiederholt — die Werte sind belegt, aber der Leser muss den Arbeitsbericht danebenlegen | ⚠️ **nicht triagiert** — der Fund kam aus dem Review von B17, **nachdem** die Schlussprüfung schon lief. Er ist von derselben Art wie #5: Darstellung, kein Verhalten |

---

## Zwei Posten, die nicht in den Code gehören

**#11 gehört ins Cutover-Runbook**, nicht in `radio.ts`: ein Satz in der Fehlerbehandlung, der sagt,
dass eine Meldung ohne Pfadangabe auf einen Tippfehler im Quellpfad hindeutet und dass die bereits
gelaufenen Migrationen harmlos sind.

**#12 gehört benannt, nicht gefixt.** Er ist der einzige stille Ast der Liste, und der Schutz gegen
ihn existiert bereits an anderer Stelle — die Runbook-Planteile prüfen die **Abschlusszeile**
(⬜ L6, byteweise in `2026-08-21-radio-import-abnahme.md`), nicht nur den Exit-Code. Solange das so
bleibt, kann dieser Fund nicht still durchgehen.

---

## Was die Schlussprüfung ausdrücklich NICHT als Fund geführt hat

* **`DATA_DIR` vergessen → Import nach `./.data/radio.db`, Parität grün.** Der Plan benennt diesen
  stillen Ast wörtlich und weist ihm einen **eigenen Runbook-Schritt** zu. Steht als **NT10** im
  Ausführungsplan.
* **Schema↔SQL-Drift zwischen `schema.ts` und `0000_*.sql`.** Transitiv gedeckt: der
  Integrationstest schreibt jede Spalte, eine fehlende Spalte würfe `no such column`.
