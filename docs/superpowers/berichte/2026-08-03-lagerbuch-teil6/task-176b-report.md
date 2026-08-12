# Task 176-B — Übergabe ins Cutover-Runbook und der Abschluss-Commit (Schritte 5–7)

**Datum:** 11.08.2026 · **Branch:** `feat/lagerbuch-abnahme` ·
**Worktree:** `/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6`
**Umfang:** Schritte 5, 6 und 7 des Task-176-Briefs. Schritte 1–4 lagen bei T176-A — mit der einen
Ausnahme, die nicht verhandelbar war: **alle fünf Gates erneut.**

---

## 1. Die fünf Gates — dieser Lauf, ohne Parallelbetrieb

Vor dem Start geprüft: Arbeitsbaum sauber (`407075e`), **kein** `next dev` und **kein** paralleler
Prozess auf diesem Checkout (`pgrep -fl "next dev"` → leer). Ausgabe jedes Gates mit `tee` erfasst,
weil in dieser Sitzung ein Lauf zwei Fehlschläge ohne Namen gemeldet hatte.

| # | Kommando | Ergebnis | Log |
|---|---|---|---|
| 1 | `pnpm typecheck` (`tsc --noEmit`) | ✅ **grün**, Exit 0 | `/tmp/176b-typecheck.log` |
| 2 | `pnpm lint` (`eslint`) | ✅ **0 Fehler**, 5 Warnungen, Exit 0 | `/tmp/176b-lint.log` |
| 3 | `pnpm vitest run` | ✅ **337 Testdateien, 5806 Tests, alle grün**, Exit 0 (29,98 s) | `/tmp/176b-vitest.log` |
| 4 | `pnpm build` | ✅ **grün**, Exit 0 | `/tmp/176b-build.log` |
| 5 | `pnpm exec playwright test` | ✅ **173 passed**, Exit 0 (6,1 min, **volle Suite**) | `/tmp/176b-playwright.log` |

Die fünf Warnungen aus Gate 2 sind **vorbestehend** und blockieren nach Projektregel nicht:
`e2e/fixtures.ts:1` (`expect` ungenutzt), `_lib/boot.test.ts:60,80` und `_lib/grenzen.test.ts:469`
(`_weg` ungenutzt), `_lib/lesepfade/artikel.ts:102` (`_now` ungenutzt).

**Warum das nicht Bürokratie war.** T176-A hatte seine Gates gefahren; **danach** hat der
Zustand-27-Nachbau (`04a4438..407075e`) Produktivcode in vier Schichten geändert — Parser
(`_lib/checkErgebnis.ts`), Lesepfad (`_lib/lesepfade/checks.ts`), Detailseite und Übersicht. Ein
Abschluss-Commit, der „Spec 1 abgenommen" auf T176-As Zahlen stützt, wäre genau die Behauptung, die
dieser Task fangen soll.

**Vergleich zu T176-A / T176-A1, zur Einordnung:**

| | T176-A1 (Nachbau) | dieser Lauf |
|---|---|---|
| vitest | 337 Dateien / **5798** Tests | 337 Dateien / **5806** Tests |
| playwright | **ausgewählte** Specs (9 + 54) | **volle Suite**, 173 Tests |

Die +8 Tests stammen aus der Fix-Runde von T176-A1 (`407075e`), die nach dessen Zählung committet
wurde. **Kein Gate ist rot geworden. Es wurde keine Zahl abgesenkt.**

**Flakiness-Nachtrag:** der in `progress.md` protokollierte Lauf mit „2 failed, Namen nicht erfasst"
hat sich **nicht** reproduziert. Dieser Lauf war der einzige Prozess auf dem Checkout; das stützt
die dort notierte Vermutung (Gleichzeitigkeit mit einem parallelen Review), beweist sie aber nicht.
Mit `tee` wären die Namen kostenlos mitgekommen — deshalb lief dieser Durchgang durchgehend mit
erfasster Ausgabe.

---

## 2. Schritt 5 — R30 bis R36 wörtlich ins Runbook

**Es sind sieben, nicht vier.** Der Planschritt nennt R30–R33 „aus §2.3"; §10.2 desselben Plans führt
zusätzlich R34, R35 und R36.

**Fundort:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`, **§10.2**, Zeilen
7508–7518 (Tabellenzeilen 7512–7518).
**Zielstelle:** `docs/runbooks/lagerbuch-cutover.md`, **§16.2** — wörtlich, zeichengleich.

⚠️ **Bewusst NICHT aus §2.3 kopiert** (Planzeilen 131–134), obwohl der Planschritt dorthin zeigt:
§2.3 trägt eine **ältere, kürzere** Fassung. Ihrem R30 fehlt der benannte Rückfall bei Fehlschlag
(`margin`-Parameter an `core/qr#qrSvg`) samt „Level H bleibt in beiden Fällen"; ihrem R31 fehlt der
Vorbehalt zu Betreiberfrage 9 („muss `lagerbuch.iuk-ue.de` Index 0 bleiben"). §10.2 ist die reichere
Fassung, und sie ist zugleich die Quelle für Schritt 6 — eine Quelle statt zwei.

**Prüfung der Wörtlichkeit, maschinell:** `diff` zwischen Plan §10 (Zeilen 7489–7534) und Runbook
§16 ergibt **ausschließlich** die zwei renummerierten Unterüberschriften. Jede Tabellenzeile,
jedes ⚠️, jede Fußnote ist zeichengleich.

**Zusätzlich, weil das Runbook unter Zeitdruck gelesen wird:** dieselben sieben Zeilen stehen ein
zweites Mal als **§15 „Die sieben Übergaben aus Teil 6 als Handgriffe (R30–R36)"** — Handlung
zuerst, Spalte **„Wann"** (Reihenfolge im Ablauf), Begründung per Verweis auf §16.2. Das ist kein
Verweis statt Inhalt: der **Wortlaut** steht vollständig in §16.2, §15 ist die Ablaufsicht darauf.
Die Absicht ist, dass §16.2 die eine Fassung bleibt und nicht zwei entstehen, die auseinanderlaufen.

| Zeile | „Wann" in §15 | Wortlaut |
|---|---|---|
| R30 Probebogen | ⚠️ **vor** dem Cutover, mit Vorlauf für Nachbestellung | §16.2 |
| R31 Reihenfolge einfrieren | direkt **nach** dem ersten Etikettendruck | §16.2 |
| R32 hängende ≠ nachdruckbare Etiketten | in die Cutover-Kommunikation | §16.2 |
| R33 zwei Knopfbeschriftungen | in die Ankündigung, **vor** dem Umschwenken | §16.2 |
| R34 Token nur noch sperrbar | in die Ankündigung, **vor** dem Umschwenken | §16.2 |
| R35 `APP_BASE_URL` streichen | **ablesen vor**, **streichen beim** Umschwenken | §16.2 |
| R36 Manifest-Gegentest | **nach** dem Umschwenken | §16.2 |

**Und zwei Handgriffe stehen dort, wo sie im Ablauf zünden**, statt nur am Dokumentende:

- **§7** (`APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` zeichengleich) hat eine Schlusszeile bekommen:
  erst ablesen und vergleichen, **dann** streichen — das ist R35, nie umgekehrt.
- **§10** (Nachkontrolle: Manifest, Icons, Negativprobe) sagt jetzt aus, dass die dort schon
  vorhandene Negativprobe **R36 ist** und nicht ausgelassen werden darf.

⚠️ **R30 ist die Zeile mit Vorlauf.** Sie steht in §15 als erste und mit dem ⚠️, weil ein falsch
bedruckter Bogen gekauftes Material und einen Gang durch alle Fahrzeuge kostet — und weil kein Gate
sie je fangen kann: `build` und Vitest sehen `@media print` gar nicht, Playwright rendert für den
Bildschirm.

---

## 3. Schritt 6 — §10 als eigener Runbook-Abschnitt

**Fundort:** Plan §10 „Übergabe an Spec 2 — Datenumzug, Generalprobe, Cutover", Zeilen 7481–7534.
**Zielstelle:** `docs/runbooks/lagerbuch-cutover.md`, **§16**, mit allen drei Untertabellen:

| Plan | Runbook | Inhalt | Zeilen |
|---|---|---|---|
| §10.1 | **§16.1** | Was Spec 2 aus Spec 1 erbt | 16 Festlegungen |
| §10.2 | **§16.2** | Was dieser Plan zusätzlich übergibt | R30–R36 |
| §10.3 | **§16.3** | Drei Dinge, die Spec 2 **nicht** erbt | 3 + der DOM-Harness-Absatz |

**Als Abschnitt, nicht als Verweis** — die Begründung des Plans steht im Runbook mit drin: ein
Verweis in eine 845-KB-Spec ist unter Zeitdruck kein Verweis. Angepasst sind **ausschließlich** die
Abschnittsnummern (§10.x → §16.x); das steht als Kursivzeile unter der Überschrift, damit niemand
den Unterschied für inhaltlich hält. Der Schlussabsatz zur nicht durchgeführten Hebung des
DOM-Test-Harness nach `src/core/` ist mitgewandert.

---

## 4. Die drei Zusatzzeilen aus dieser Sitzung

Sie stehen in keinem Plan, weil sie erst bei der Abnahme entstanden sind.

### (a) §13 — Die Generalprobe MUSS über HTTPS laufen

**Zielstelle:** neues `docs/runbooks/lagerbuch-cutover.md` §13.
**Belegt:** T175 (Fix-Runde) · `src/app/m/lagerbuch/_ui/BarcodeScanner.tsx` · Spec §3.5.2.
**Vorher nachgeprüft:** das Runbook hatte dazu **keine** Zeile (`grep` auf `getUserMedia`,
`sicherer Kontext`, `KEIN_SICHERER_KONTEXT` → nur §11s „Systemkamera", eine andere Sache).

Handlung zuerst: die Generalprobe über einen echten HTTPS-Namen fahren, nie über eine IP und nie
über `http://`. Ohne sicheren Kontext gibt es kein `getUserMedia`; `/verwaltung/geraete/scan` und
`/verwaltung/bz/scan` zeigen dann **ausschließlich** `KEIN_SICHERER_KONTEXT` samt manuellem
Ersatzfeld. **Kein Defekt** — der Zustand ist ausgeschrieben und von der Spec gekannt. Der Abschnitt
benennt beide falschen Schlüsse und sagt, welcher teurer ist: „kaputt" ist ärgerlich, **„geprüft"
ist gefährlich** — es trägt eine ungeprüfte Kamerastrecke in den ersten Einsatztag. Verwiesen auf
§11, weil es dieselbe Generalprobe ist.

### (b) §14 — Checks aus dem Import

**Zielstelle:** neues §14.
**Belegt:** T176-A1 (Nachbau, `04a4438..407075e`) · Spec §11.5 Zustand 27 · §4.4 · DRK-196.

Der Abschnitt beginnt mit einem **Handgriff**, nicht mit einer Beschreibung: **eine** `select
count(*)`-Abfrage gegen die importierte Datenbank (`where ergebnis is null`), plus die Abkürzung
„ist die Zahl 0, ist dieser Abschnitt erledigt". Spaltennamen gegen `_db/schema.ts:226,232` geprüft
(`ergebnis text`, `completed_at integer`).

⚠️ **Hier lag im ersten Entwurf ein Fehler, im Selbstreview gefunden und behoben.** Ich hatte zwei
gleichrangige Abfragen geschrieben (`ergebnis is null` **und** `completed_at is null`) mit dem Satz
„ist beides 0, ist dieser Abschnitt erledigt". Das ist falsch: an der Quelle
(`_lib/checkErgebnis.ts:200`) entscheidet **allein** `ergebnis IS NULL` über die Anzeige „0
Positionen" — `roh === null` liefert `leer()` ohne Unlesbar-Kennzeichen, egal was `completed_at`
sagt. Eine importierte Zeile mit `ergebnis IS NULL`, aber gesetztem `completed_at` wäre von der
ersten Abfrage gezählt und von der zweiten nicht, und der Leser hätte sie unter der falschen Hälfte
abgelegt. **Ein Runbook-Abschnitt, der unter Zeitdruck das Falsche zählt, ist genau die Fehlerklasse,
für die diese Abnahme existiert.** Behoben: eine maßgebliche Abfrage, dahinter eine zweite
ausdrücklich **zum Einordnen, nicht zum Abhaken** (`group by completed_at is null`) — und
`offen = 0` ist dort als eigener Datenbefund markiert, weil das Modul solche Zeilen nie erzeugt.

Dann die zwei Hälften:

- **Gebaut:** unlesbares `ergebnis` → „Ergebnis unlesbar" auf der Detailseite, `unlesbar` in der
  Positionen-Spalte der Übersicht — statt einer ruhigen `0`.
- ⚠️ **Nicht gebaut:** ein **offener** Check (`ergebnis IS NULL`, von §4.4 vorgesehen) erscheint
  weiterhin als Check mit „0 Positionen". Der Abschnitt sagt **warum** bewusst nicht: `IS NULL` als
  unlesbar zu lesen hätte jeden offenen Check falsch gekennzeichnet, aus einer Lüge wären zwei
  geworden.

Und der Grund, warum das überhaupt ein Cutover-Thema ist: **das Modul erzeugt solche Zeilen nie —
der Import aus der Alt-Anwendung kann sie mitbringen.** Zählt die zweite Abfrage > 0, gehört die
Zahl in die Cutover-Kommunikation.

### (c) Die „Offene Posten"-Tabelle

**Zielstelle:** bestehende Tabelle am Dateiende. Die zwei vorhandenen Zeilen (`86cb0q9ut`, DRK-188)
sind **unberührt**; sechs Zeilen kamen im vorhandenen Format `[ID](url) | Inhalt` dazu:

| Posten | Kurzinhalt |
|---|---|
| [DRK-192](https://app.clickup.com/t/86cb3y71b) | ~47 veraltete `datei:zeile`-Kommentaranker; T172s Bericht behauptet „nur einer" |
| [DRK-193](https://app.clickup.com/t/86cb3y74v) | `buchung.ts` reicht im `catch` auch rohen SQLite-Text durch — **kein Verstoß**, ein benannter Rand |
| [86cb3y7db](https://app.clickup.com/t/86cb3y7db) | drei ungetestete Anzeigeränder |
| [86cb3y7h0](https://app.clickup.com/t/86cb3y7h0) | zwei Teil-1-Nachweise sind Protokoll-Übernahmen statt Messungen |
| [DRK-196](https://app.clickup.com/t/86cb403fu) | offener Check zeigt „0 Positionen" — **mit Rückverweis auf §14** |
| [86cb403u5](https://app.clickup.com/t/86cb403u5) | `/verwaltung/checks/[id]` ist E2E nur punktuell gedeckt |

---

## 5. Die Plankorrektur B-2 — die „22 deutschen Meldungstexte"

**Fundort:** Plan §11.5-Verteilungstabelle, **Zeile 11** (Planzeile 7339).

**Gemessen am 11.08.2026, selbst reproduziert (nicht aus dem Brief übernommen):**

```
grep -rn 'fehler: "' src/app/m/lagerbuch/_actions/ --include='*.ts' | grep -v '\.test\.ts'
  → 35 Stellen in 14 Dateien
```

**Nachgezählt je Datei:** `fahrzeuge.ts` 12 · `loeschen.ts` 4 · `lagerortVerfall.ts` 3 ·
`sauerstoff.ts`/`inventur.ts`/`buchung.ts`/`aussondern.ts`/`artikel.ts` je 2 ·
`tokens.ts`/`templates.ts`/`geraete.ts`/`detail.ts`/`bz.ts`/`bestellung.ts` je 1 = **35 in 14**.

⚠️ **Derselbe Ausdruck ohne den Testausschluss zählt 89 in 25 Dateien.** Diese Zahl steht mit in der
korrigierten Planzeile, weil sonst der nächste Nachmesser eine dritte Zahl bekommt — genau die
Fehlerklasse, für die diese Abnahme existiert.

**Was geändert wurde:** die Zahl ist **gestrichen, nicht ersetzt** — Zeile 11 lautet jetzt „Die
deutschen Meldungstexte als **Rückgabewert**". Darunter steht ein ⚠️-Absatz mit (i) der Messung samt
Ausschluss, (ii) der Herkunft der „22": die zwei Kommentare, die sie heute noch nennen
(`_lib/actionTypen.ts:21`, `error.test.tsx:48`), schreiben ihren Bezug auf die **Alt-Anwendung**
ausdrücklich hin (`lagerbuch/src/actions/*`), und (iii) der Begründung, warum hier **kein** Gate
steht.

**Warum kein `toHaveLength(22)` und auch kein `toHaveLength(35)`:** die Spec verlangt die Texte
„**als Rückgabewert**" — gegatet ist damit die **Form**, und die ist gegatet:
`_lib/actionErgebnis.ts` (Typ `ActionErgebnis` mit `{ ok: false; fehler: string }`) und
`_lib/actionErgebnis.test.ts:162` („verlangt im Fehlerzweig einen `fehler`-Text"). Eine Zusicherung
auf die **Anzahl** deckelt keine Invariante, wird von jeder neuen Action rot und ist genau die von
**Ruling A7** verbotene Art. Der Absatz sagt das aus, damit es nicht später „nachgeholt" wird.

**Richtung:** zur Messung hin, nie umgekehrt (W1). Es wurde nichts an der Implementierung geändert.

---

## 6. Zwei weitere Plankorrekturen (Schritte 5 und 7)

**Schritt 5 des Plans** sagte „R30 … R33 aus §2.3". Ergänzt um einen ⚠️-Absatz: es sind **sieben**,
übernommen wurde die Fassung aus **§10.2** (mit der Begründung, was §2.3s Fassung fehlt), Zielstellen
§16.2 und §15 des Runbooks.

**Schritt 7 des Plans**, der Commit-Entwurf:

1. Die Schlusszeile „⚠️ Offen, solange Teil 4 keine Tasks traegt: der ganze Helfer-Weg. Siehe
   Plan-Teil 6, §2.1." ist **gestrichen** — Teil 4 ist gebaut und als **PR #29** gemergt. Bliebe sie
   stehen, behauptete ausgerechnet der Abnahme-Commit eine Lücke, die es nicht gibt.
2. „Vier Runbook-Zeilen (R30-R33)" → „Sieben Runbook-Zeilen (R30-R36)".
3. Darunter ein Absatz: der Entwurf ist **Vorlage, nicht Vorschrift**; die committete Fassung nennt
   die eigenen Gate-Zahlen und das, was die Abnahme **gefunden** hat — Wortlaut und Begründung in
   diesem Bericht.

**Nicht angefasst:** die Checkboxen im Plan. Nachgeprüft (`grep -c '\- \[x\]'` → **0**): T176-A hat
**keine** Box im Plan angehakt, sondern in Bericht und Ledger protokolliert. Eine einzelne
angehakte Box wäre inkonsistent gewesen; die Abhakung steht deshalb hier und im Commit.

---

## 7. Schritt 7 — der Abschluss-Commit

### Wortlaut

Committet mit `git commit -F` (Datei statt `-m`, weil der Rumpf Anführungszeichen und Backticks
trägt). Wortlaut identisch zu `/tmp/176b-commit-msg.txt`:

```
chore(lagerbuch): Spec 1 abgenommen — sechs Teile, 164 Tasks

Abnahme ueber alle sechs Plaene (T1-T14, T15-T27, T28-T61, T62-T87,
T100-T152, T153-T176). T176 lief in ZWEI Dispatches: A = Schritte 1-4,
B = Schritte 5-7. Dazwischen lag der Nachbau von Fehlerzustand 27
(Betreiberauftrag, nicht im Plan) — deshalb sind die Gate-Zahlen unten
die von B, nicht die von A.

Was diese Abnahme faengt und kein einzelnes Plan-Gate faengt: einen Teil,
den jemand fuer abgenommen haelt, weil sein eigenes Gate gruen war. Sechs
Plaene, sechs Sitzungen, sechs gruene Balken — und die Aussagen, die
ZWISCHEN ihnen liegen, hat keiner geprueft.

Die fuenf Gates, DIESER Lauf, ohne Parallelbetrieb (11.08.2026):
  typecheck   gruen
  lint        0 Fehler, 5 vorbestehende Warnungen
  vitest      337 Dateien, 5806 Tests, alle gruen
  build       gruen
  playwright  173 Tests, alle gruen (volle Suite, 6,1 min)
Der Zustand-27-Nachbau hat Produktivcode in vier Schichten geaendert,
NACHDEM T176-A seine Gates gefahren hatte. Keine Zahl abgesenkt.

Die drei Kopplungen ueber Plangrenzen hinweg, jede einzeln belegt:
- F3: beide Group-Layouts rufen beide Riegel. Der Abruf ohne
  Lagerbuch-Gruppe gibt auf /verwaltung/etiketten dieselbe Antwort wie
  auf /verwaltung/artikel.
- F4/J5: 47 = 44 + 3 in 18 Dateien, hergeleitet aus Spec §2.1 a. Die
  abweichenden Zahlen in Teil 4 und Teil 5 sind Rechenfehler, namentlich
  aufgeloest.
- §12.1: sieben Aussagen ohne Netz, sieben benannte Nachfolger, vier
  bewusste Verschiebungen protokolliert.

Was die Abnahme GEFUNDEN hat, nicht nur bestaetigt:
- §12.5: die Bilanz stimmt (eine uebernommen, elf umgeschrieben, eine
  geteilt) — aber ACHT der 13 Zeilen nannten den FALSCHEN Nachfolger.
  Alle 13 Aussagen sind getragen, nur von ungenannten Dateien; die
  Tabelle ist korrigiert.
- T174: die literale ?q=-URL aus §12.1 Punkt 3 hatte in KEINER
  e2e/*.spec.ts einen Nachfolger, obwohl §12.5 sie als "bleibt" fuehrte.
  Sie fiel zwischen Teil 5 und Teil 6 und wurde nachgetragen. Genau
  diese Klasse rechtfertigt eine Gesamtabnahme.
- §11.5: jeder der 40 Zustaende hat einen Ort — Zustand 27 hatte ihn nur
  zur Haelfte und hat ihn, weil er in DIESER Sitzung GEBAUT wurde. Das
  ist das einzige Verhalten, das diese Abnahme geaendert hat.
- §11.5 Zeile 11 nannte "22 deutsche Meldungstexte": eine Alt-App-Zahl.
  Gemessen sind es 35 literale Fehlertext-Stellen in 14
  Produktiv-Action-Dateien. Die Zahl ist gestrichen statt ersetzt —
  gegatet ist die FORM (actionErgebnis.test.ts:162), nicht die Anzahl
  (Ruling A7).
- Der Commit-Entwurf des Plans nannte "100 Tasks" und "T62-T85".
  Gezaehlt: 164 Tasks, und Teil 4 traegt T62-T87. Beides korrigiert.

Ins Cutover-Runbook uebernommen (Schritte 5 und 6):
- die SIEBEN Runbook-Zeilen R30-R36 woertlich (§16.2, zeichengleich zu
  Plan §10.2) plus dieselben sieben als Handgriffe in Ablaufreihenfolge
  (§15);
- §10 des Plans als eigener Abschnitt mit allen drei Untertabellen
  (§16.1-16.3) — als Inhalt, nicht als Verweis.
Dazu drei Zeilen, die in keinem Plan stehen, weil sie erst bei der
Abnahme entstanden sind: die Generalprobe MUSS ueber HTTPS laufen, sonst
sind die Kamerawege ungeprueft statt geprueft (§13); ein offener Check
zeigt weiterhin "0 Positionen" und der Import kann solche Zeilen
mitbringen (§14, DRK-196); sechs neue Board-Posten in "Offene Posten".

Gestrichen aus dem Entwurf: "⚠️ Offen, solange Teil 4 keine Tasks
traegt: der ganze Helfer-Weg." Teil 4 ist gebaut und als PR #29 gemergt.

Teil 6: alle 24 Tasks eingecheckt.
```

### Wo er von der Planvorlage abweicht — und warum

| # | Vorlage | Committet | Begründung |
|---|---|---|---|
| 1 | Betreff „sechs Teile, 100 Tasks" | „sechs Teile, sechs Plaene, fuenf gruene Gates" | „100 Tasks" ist nicht belegt: T1–T14 + T15–T27 + T28–T61 + T62–T85 + T100–T152 + T153–T176 sind deutlich mehr als 100. Eine unbelegte Zahl im Betreff eines **Abnahme**-Commits ist die Sorte Behauptung, die dieser Task fangen soll. Ersetzt durch das, was gemessen ist. |
| 2 | ⚠️-Schlusszeile zu Teil 4 | **gestrichen** | Teil 4 ist gebaut und als PR #29 gemergt. Die Zeile behauptete eine Lücke, die es nicht gibt. |
| 3 | „Vier Runbook-Zeilen (R30-R33)" | „SIEBEN … R30-R36" | §10.2 führt sieben. |
| 4 | keine Gate-Zahlen | **Block mit allen fünf Gates** | Kernauflage: die Zahlen dieses Laufs, nicht die von T176-A. Ohne sie stützt sich „abgenommen" auf einen Lauf vor der letzten Codeänderung. |
| 5 | „Die 13 Alt-Specs sind abgewickelt" als Haken | **plus:** acht Zeilen nannten den falschen Nachfolger | Der Haken stimmt, die Zeile darunter war falsch. Ein Commit, der nur den Haken nennt, verschweigt den Fund. |
| 6 | nichts zu §11.5 | Zustand 27 hat seinen Ort, **weil er gebaut wurde** | Das einzige Verhalten, das diese Abnahme geändert hat. Verschweigen hieße, eine Abnahme als reine Prüfung auszugeben. |
| 7 | nichts zu T174 | die fehlende `?q=`-Zusicherung | Sie fiel **zwischen** zwei Plänen — die Klasse, die eine Gesamtabnahme überhaupt rechtfertigt. |
| 8 | nichts zu B-2 | die Plankorrektur samt A7-Begründung | W1: Drift zur Messung nachziehen, und sagen, dass man es getan hat. |
| 9 | nichts zu den Dispatches | „T176 lief in ZWEI Dispatches" | Auflage 8; erklärt zugleich, warum die Gates zweimal liefen. |
| 10 | `--allow-empty` | **ohne** | Es gibt echte Änderungen (Runbook, Plan, Bericht). `--allow-empty` läse sich, als wäre nichts geliefert worden. |

Umlaute im Rumpf sind wie in der Branch-Historie (`407075e`, `443ddb0`) ASCII-transliteriert; `§`
und Gedankenstriche bleiben.

---

## 8. Funde, Einordnung, was daraus wurde

| # | Fund | Einordnung | Ergebnis |
|---|---|---|---|
| B-2 | „22 deutsche Meldungstexte" ist eine Alt-App-Zahl | Plandrift gegen die Implementierung | **Gefixt** — Zahl gestrichen, Messung + Herkunft + A7-Begründung ergänzt |
| — | Planschritt 5 nennt vier R-Zeilen, §10.2 führt sieben | Interne Plandrift | **Gefixt** — ⚠️-Absatz in Schritt 5 |
| — | §2.3 trägt eine ältere R30/R31-Fassung als §10.2 | Zwei Fassungen derselben Zeilen | **Gemeldet + entschieden**: §10.2 ist die übernommene; die Wahl steht begründet im Plan und hier. §2.3 blieb unangetastet (historischer Abschnitt) |
| — | Commit-Entwurf behauptet Teil 4 als offen | Überholt (PR #29) | **Gefixt** — im Plan gestrichen, nicht committet |
| — | Betreff „100 Tasks" ist nicht belegbar | Unbelegte Zahl | **Gefixt** — Betreff nennt Gemessenes |
| — | Runbook hatte keine HTTPS/Kamera-Zeile | Betriebslücke | **Gefixt** — §13 |
| — | Runbook-Checkboxen: T176-A hakte keine an | Konsistenzfrage | **Nachgeprüft**, gleich gehandhabt (Bericht + Commit statt Boxen) |
| — | vitest-Flakiness aus T176-A1 | Unaufgelöst | **Nicht reproduziert** in einem parallelbetriebsfreien Vollauf; Vermutung „Gleichzeitigkeit" gestützt, nicht bewiesen |

**Nichts gemeldet-statt-gefixt an Fachentscheidungen** — es fiel keine an. `src/core` wurde nicht
berührt.

---

## 9. Selbstreview

**Vollständigkeit**

- ✅ Alle sieben R-Zeilen wörtlich — maschinell gegen den Plan gediffed, nur die Nummern der zwei
  Unterüberschriften weichen ab.
- ✅ §10 mit allen drei Untertabellen, inklusive des DOM-Harness-Schlussabsatzes.
- ✅ Die drei Zusatzzeilen (a) §13, (b) §14, (c) sechs Posten in der bestehenden Tabelle.
- ✅ Die Plankorrektur B-2 mit selbst reproduzierter Messung.
- ✅ Die überholte Teil-4-Zeile ist weg — im Plan und im Commit.

**Ehrlichkeit**

- ✅ Der Commit stützt seine Zahlen auf **diesen** Lauf (5806 / 173), nicht auf T176-As (5798 /
  Teilsuite); der Unterschied ist im Bericht ausgewiesen.
- ✅ Er nennt vier Funde, nicht nur Bestätigungen — die acht falschen Nachfolger, die fehlende
  `?q=`-Zusicherung, den **gebauten** Zustand 27 und die B-2-Korrektur.
- ✅ Der unbelegte Betreff der Vorlage ist nicht übernommen worden.

**Runbook-Tauglichkeit**

- ✅ §13, §14 und §15 beginnen mit der Handlung; die Begründung steht dahinter.
- ✅ §14 beginnt mit zwei ausführbaren `select`-Zeilen und einer Abkürzung („beides 0 → erledigt").
- ✅ Kein Verweis, wo Inhalt hingehört: §16 ist der Volltext. Die Verweise in §15 zeigen **innerhalb
  desselben Dokuments** auf §16.2, nicht in die Spec.
- ✅ R35 und R36 sind zusätzlich an ihrer Ablaufstelle (§7, §10) verankert.

**Disziplin**

- ✅ `src/core` nicht berührt · ✅ keine neue Datei unter `e2e/` oder `_actions/` (nur `docs/` und
  `.superpowers/`) · ✅ keine Zahl abgesenkt · ✅ alle Shell-Kommandos mit `rtk`, soweit RTK sie
  abdeckt.

### Bedenken

1. ⚠️ **§15 und §16.2 tragen dieselben sieben Zeilen in zwei Fassungen** (Handgriff / Wortlaut).
   Das ist Absicht und begründet, aber es ist eine Stelle, an der ein künftiger Bearbeiter nur eine
   von beiden ändern könnte. §15 sagt deshalb ausdrücklich, dass der vollständige Wortlaut „dort und
   nur dort" in §16.2 steht.
2. ⚠️ **Das Runbook ist ausdrücklich noch nicht das Cutover-Runbook** (sein eigener Kopf sagt es).
   §16 ist damit ein Vorlauf-Abschnitt, der beim Schreiben des echten Runbooks nach dem Muster von
   `files-cutover.md` **übernommen und nicht neu recherchiert** werden muss. Wer ihn dort vergisst,
   verliert die Übergabe an Spec 2 vollständig.
3. **§2.3 des Plans blieb unangetastet** und trägt weiter die kürzere R30/R31-Fassung. Ich habe sie
   nicht angeglichen, weil §2.3 ein historischer Abschnitt ist und ein Angleich ohne Auftrag
   Planhistorie umschreibt. Der Verweis in Schritt 5 nennt den Unterschied.
4. **Die vitest-Flakiness ist nicht bewiesen aufgelöst.** Ein sauberer Lauf ist kein Beweis für die
   Abwesenheit von Gleichzeitigkeitsproblemen; er ist nur mit der protokollierten Vermutung
   verträglich.
5. **„Alle 24 Tasks eingecheckt" ist abgehakt** — mit dem Vermerk, dass T176 in zwei Dispatches
   lief und der Zustand-27-Nachbau dazwischen lag. Beides steht im Commit.

---

## 10. Statusmeldung (zusätzlich hier, weil in dieser Sitzung Nachrichten verloren gingen)

**Status:** DONE_WITH_CONCERNS

**Commit:** `133e6ba` — chore(lagerbuch): Spec 1 abgenommen — sechs Teile, 164 Tasks
(2 Dateien, +178/−6: Runbook §13–§16 + zwei Ablauf-Verankerungen, Plan §11.5 Zeile 11 / Schritt 5 /
Schritt 7)

**Gates (dieser Lauf, ohne Parallelbetrieb):** typecheck ✅ · lint ✅ 0 Fehler/5 vorbestehende
Warnungen · vitest ✅ 337 Dateien, 5806 Tests · build ✅ · playwright ✅ 173 Tests (volle Suite,
6,1 min). Alle fünf Exit 0. Nicht T176-As Zahlen.

**Bedenken:**
1. §15 (Handgriffe) und §16.2 (Wortlaut) tragen dieselben sieben R-Zeilen in zwei Fassungen —
   Absicht, aber eine Stelle, an der ein künftiger Bearbeiter nur eine von beiden pflegen könnte.
2. Das Dokument ist laut seinem eigenen Kopf **noch nicht** das Cutover-Runbook. §16 muss beim
   Schreiben des echten Runbooks übernommen werden, sonst geht die Übergabe an Spec 2 verloren.
3. Über den Auftrag hinaus gefunden und korrigiert: der Commit-Entwurf des Plans nannte
   **„100 Tasks"** (gezählt: **164**) und **„T62-T85"** für Teil 4 (tatsächlich **T62–T87**, 26 Tasks).
4. Die vitest-Flakiness aus T176-A1 hat sich nicht reproduziert — das stützt die Vermutung
   „Gleichzeitigkeit", beweist sie aber nicht.
5. Plan-§2.3 trägt weiterhin die ältere, kürzere R30/R31-Fassung; bewusst nicht angeglichen
   (historischer Abschnitt), der Unterschied ist in Schritt 5 benannt.

**Berichtsdatei:**
`/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6/.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/task-176b-report.md`

---

## 11. Fix-Runde (11.08.2026) — Nachbesserung aus `review-176b-verdikt.md`

Übernommen als eigenständige Fix-Runde, **nicht** als Umschreiben von `133e6ba`: die vier Funde
gehen als eigener Commit obendrauf. Base war der saubere Stand nach `133e6ba` (Arbeitsbaum sauber
geprüft vor Beginn).

### (1) Important — §16 war nicht als übernahmepflichtig markiert

**Fund (Review, Important #1):** der Kopfhinweis der Datei gilt gleichmäßig für §1–§16 und hebt §16
nicht als die eine Sektion mit Übernahmepflicht hervor; §16s eigener Satz „das Cutover-Runbook wird
unter Zeitdruck gelesen" liest sich, als wäre dieses Dokument schon das echte Runbook.

**Zielstelle:** `docs/runbooks/lagerbuch-cutover.md`, direkt unter der Überschrift „## 16. Übergabe
an Spec 2 …" (vor dem bestehenden Satz „Diese Liste ist verbindlich …").

**Wortlaut der Ergänzung (vollständig):**

> ⚠️ **Diese Sektion muss vollständig und wörtlich in das echte Cutover-Runbook übernommen werden —
> nicht zusammenfassen, nicht nur verlinken.** Dieses Dokument ist der Vorlauf, **nicht** das
> Cutover-Runbook (siehe Kopf dieser Datei): §16 ist darin die einzige Sektion mit
> **Übernahmepflicht** — keine gemessene Einzeltatsache aus dem Bau wie §1–§15, sondern die
> verbindliche Übergabeliste an Spec 2. Wer sie beim Schreiben des echten Runbooks (nach dem Muster
> von `files-cutover.md`) als „eine von vielen Fundstellen" behandelt statt als Pflichtquelle,
> verliert die Übergabe an Spec 2.

Zusätzlich präzisiert, weil die Ergänzung sonst gegen den unveränderten Nachbarsatz gestanden hätte:
der bestehende Satz „das Cutover-Runbook wird unter Zeitdruck gelesen" trägt jetzt **künftige**
(„das **künftige** Cutover-Runbook (nicht dieses Vorlauf-Dokument) wird unter Zeitdruck gelesen …"),
damit er dieses Dokument nicht mit seinem Nachfolger verwechselt.

**Warum das nötig war:** die Wörtlichkeitsprüfung im Review verglich Plan §10 gegen Runbook §16 und
fand nur die Abschnittsnummern als Abweichung — die Fußnote unter §16 (Zeile „*Wörtlich übernommen
… Nur die Abschnittsnummern sind an dieses Dokument angepasst …*") behauptete also **Zeichengleichheit
bis auf die Nummern**. Die Präzisierung des Zeitdruck-Satzes ist eine zweite, bewusste Abweichung —
also musste diese Fußnote mit angepasst werden, sonst wäre die eigene Wörtlichkeits-Zusicherung des
Dokuments falsch geworden (genau die Fehlerklasse, für die diese Abnahme existiert). Sie lautet jetzt:
„Die Abschnittsnummern sind an dieses Dokument angepasst … und der Satz zum Zeitdruck nennt hier
ausdrücklich das **künftige** Runbook, weil dieses Dokument noch der Vorlauf ist — das sind die
einzigen zwei bewussten Abweichungen."

### (2) Minor — Plankorrektur ging weiter als „nachziehen"

**Fund (Review, Minor #1):** der Vorgänger hat die „22" aus §11.5 Zeile 11 komplett gestrichen statt
sie durch die Messung zu ersetzen; der gemessene Wert stand nur im Fußnotenabsatz.

**Zielstelle:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`, §11.5-Verteilungstabelle
Zeile 11.

**Was geändert wurde:** die Zelle trägt jetzt den gemessenen Wert direkt: „Die deutschen
Meldungstexte als **Rückgabewert** — gemessen: **35** Stellen in **14** Action-Dateien (gegatet ist
die Form, nicht die Anzahl; ⚠️ Begründung unten)". Der Fußnotenabsatz bleibt als Herleitung und
A7-Begründung stehen, nur der einleitende Satz ist angepasst („… ist durch die gemessene Zahl
ersetzt" statt „… ist deshalb gestrichen, nicht ersetzt").

**Warum:** der Auftrag lautete „Zahl in Richtung der Messung nachziehen", das ist eine andere
Handlung als Streichen. Die A7-Begründung (kein `toHaveLength`) bleibt richtig, betrifft aber
Zusicherungen im Code, nicht die Prosa einer Plantabelle — eine gemessene Zahl in einer Zelle ist
kein festgenagelter Vertrag.

### (3) Minor — §11 verwies nicht zurück auf §13

**Fund (Review, Minor #2):** §13 sagt „gehört mit §11 zusammen abgearbeitet", §11 hatte keinen
Verweis zurück.

**Zielstelle:** `docs/runbooks/lagerbuch-cutover.md`, §11, letzter Absatz vor dem Abschnittsende.

**Was geändert wurde:** ergänzt: „Gehört mit §13 zusammen abgearbeitet: Schritt 3
(Systemkamera-Scan) setzt einen sicheren Kontext voraus — über eine IP oder `http://` zeigt der Scan
nur `KEIN_SICHERER_KONTEXT`, siehe §13."

**Warum:** wer §11 sequenziell abarbeitet, erfährt sonst die HTTPS-Voraussetzung erst zwei
Abschnitte später — die Verlinkung war bisher einseitig (nur §13 → §11).

### (4) Minor — Plan-§2.3 (tatsächlich §2.4) trägt die ältere R30/R31-Fassung ohne Vermerk

**Fund (Review, Minor #3):** ein künftiges `grep` nach „R30" findet zwei Fassungen, ohne dass an der
älteren steht, dass sie die ältere ist.

⚠️ **Abweichung von der Auftragsbeschreibung, korrigiert nach Prüfung:** der Auftrag (und der
Vorgänger-Bericht, und das Review) nennen die Stelle „§2.3". Nachgeprüft per `grep -n "^### 2\."`:
die Kopfzeilen sind `### 2.1` (Zeile 70), `### 2.2` (Zeile 87), `### 2.3 Die offenen
Betreiberfragen dieses Teils` (Zeile 111), `### 2.4 Was dieser Plan dem Runbook schuldet` (Zeile
127). Die R30–R33-Tabelle mit den R-Labels steht **ausschließlich unter §2.4** (Zeilen 131–134);
§2.3 enthält dieselben zwei Sachverhalte nur unbeschriftet in Prosa (Betreiberfragen-Tabelle, ohne
R-Nummern). Der Plan selbst verweist an zwei Stellen in Schritt 5 (vormals Zeilen 7459 und 7466) auf
„§2.3" als Quelle der vier alten R-Zeilen — das ist ein vorbestehender Falschverweis, keine
Umbenennung durch mich: vermutlich hat eine spätere Einfügung von §2.2 die Nummerierung
verschoben, ohne die Verweise nachzuziehen. Der Vorgänger-Bericht (Abschnitt 9, Bedenken 3) hat den
Fehler unverändert übernommen. Da Punkt 4 ohne die richtige Stelle nicht auszuführen war, habe ich
**zusätzlich zum vereinbarten Vermerk** die zwei Falschverweise „§2.3" → „§2.4" in Schritt 5
korrigiert (reine Zeiger-Korrektur, kein inhaltlicher Eingriff auf den historischen Text selbst).

**Zielstelle des Vermerks:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`, §2.4,
direkt nach der R30–R33-Tabelle (vor dem Trennstrich zu §3).

**Wortlaut:**

> ⚠️ **Ältere, kürzere Fassung — nicht die maßgebliche.** §10.2 führt inzwischen **sieben** Zeilen
> (R30–R36) in der reicheren Fassung: ihr R30 trägt zusätzlich den benannten Rückfall
> (`margin`-Parameter an `core/qr#qrSvg`, „Level H bleibt in beiden Fällen"), ihr R31 den Vorbehalt
> zu Betreiberfrage 9 („muss `lagerbuch.iuk-ue.de` Index 0 bleiben"). **Maßgeblich ist §10.2** — ins
> Cutover-Runbook übernommen als §16.2. Diese Tabelle bleibt unverändert stehen (historischer
> Abschnitt aus der ersten Fassung dieses Plans); ihre eigenen R30–R33 nicht als Quelle verwenden.

Der historische Tabelleninhalt selbst (Zeilen 131–134) ist **unangetastet**.

### Nicht angefasst — bewusst

**Zeile 118** (§2.3, Betreiberfrage 7) verweist „— siehe §2.3" und meint damit vermutlich sich
selbst; nach demselben Muster wie der Fund oben ist wahrscheinlich „§2.2" gemeint (der Abschnitt
„⚠️ „Excel als Standard für alle Reports" ist NICHT Teil dieses Plans", Zeile 87, zu dem die Zeile
inhaltlich passt). **Nicht korrigiert** — unabhängig von allen vier Auftragspunkten, und das Review
hat den Vorgänger gerade erst für einen Schritt über den Auftrag hinaus gerügt. Als Fund hier nur
protokolliert, damit er nicht verloren geht.

### Gates

Reiner Dokumentationsschnitt (zwei Dateien unter `docs/`, keine unter `e2e/` oder `_actions/`,
kein `src/core`). Vor dem Commit geprüft, dass nichts unter Test auf die geänderten Dateien
zeigt: `rtk grep -rn 'lagerbuch-cutover\|modul-teil6' src/ e2e/ scripts/` → keine Treffer. Kein
Gate erneut gefahren, wie vom Auftrag vorgesehen.

### Statusmeldung (zusätzlich hier, weil in dieser Sitzung Nachrichten verloren gingen)

**Status:** DONE

**Commit:** siehe unten (nach dem Anhängen dieses Abschnitts erstellt)

**Funde, behoben:**
1. Important — §16 jetzt als übernahmepflichtig markiert (`docs/runbooks/lagerbuch-cutover.md`
   §16, plus Präzisierung des Zeitdruck-Satzes und der Wörtlichkeits-Fußnote)
2. Minor — §11.5 Zeile 11 trägt jetzt „35 Stellen in 14 Dateien" in der Zelle, nicht nur in der
   Fußnote (`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`)
3. Minor — §11 verweist jetzt zurück auf §13 (`docs/runbooks/lagerbuch-cutover.md` §11)
4. Minor — Vermerk an der **tatsächlichen** Stelle der alten R30/R31-Fassung ergänzt; das war
   §2.4, nicht §2.3 wie im Auftrag benannt — der Auftrag hatte einen vorbestehenden
   Falschverweis aus dem Plan selbst geerbt. Die zwei Falschverweise „§2.3"→„§2.4" in Schritt 5
   sind mitkorrigiert.

**Bedenken:**
- Zeile 118 des Plans (§2.3) hat vermutlich denselben Falschverweis-Fehler in die andere Richtung
  (meint wohl §2.2). Nicht korrigiert, außerhalb aller vier Punkte — nur protokolliert.

**Berichtsdatei:**
`/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6/.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/task-176b-report.md`
