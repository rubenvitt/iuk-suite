# Fix-Welle nach den zwei Abschlussreviews — Bericht

> **Nachtrag (zweiter Bearbeiter, nach `ec6ae9d`):** Dieser Bericht wurde vom Agenten der
> Fix-Welle selbst geschrieben und traf mich (einen zweiten, separat beauftragten Agenten für
> den unten unter „F0 — Nachtrag" behandelten Flackern-Fix) bereits fertig auf der Platte an —
> der Auftrag an mich lautete, ihn zu **schreiben**, weil er angeblich fehle. Er fehlte nicht.
> Ich habe ihn **nicht überschrieben**, sondern F0 als gelöst markiert und einen eigenen Abschnitt
> für den Flackern-Fix ergänzt (siehe dort und „Gates — aktualisiert"). Alle Punkte 1-10, alle
> Funde F1-F6 und alle Zahlen unterhalb dieses Nachtrags sind **unverändert vom Originalautor**;
> ich kann sie nicht besser verifizieren, als sie hier bereits belegt sind, und stelle sie nicht
> in Frage.

**Arbeitsbaum:** `/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6`, Branch
`feat/lagerbuch-abnahme`, Ausgang `fe49511`, Ende `ec6ae9d` (danach `e2ea094`, siehe Nachtrag).
**Gelesen:** `final-review-abnahme.md` und `final-review-teil6.md` vollständig, dazu
`task-176a-report.md` (Schritt 2), `entscheidungen.md` (A1, A10), `progress.md` (A15, T163 c,
T171 b, T172 d) und die betroffenen Quelldateien. Alles unten ist an der Sache nachgeprüft, nicht
aus dem Auftrag übernommen.

**Acht Commits, alle inhaltlich gruppiert:**

| SHA | Inhalt |
|---|---|
| `8023f1a` | Punkt 1 — §12.5 trägt die Messung |
| `487a6e5` | Punkt 2 — `--allow-empty`-Nachtrag zu `133e6ba` |
| `8d2961a` | Punkte 8 + 10 (Plan) — §5, §7.1, Selbstverweis |
| `14e1b24` | Punkte 9 + 10 (Runbook) — §17 neu, R30, §14, §13 |
| `7796d82` | Punkte 3 + 4 + 10 (Code) — drei Wächter, ein Fundort |
| `0d84f6b` | Punkte 5 + 7 — E2E-Schreibvorgang, vakuöse Gegenprobe |
| `1f5c1a3` | Punkt 6 — Tapmaß auf Fläche |
| `ec6ae9d` | Nachzug zu Punkt 9c — A-J2 an allen drei Fundstellen, `qrSvg`-Signatur |

---

## Punkt 1 — §12.5 trägt die Messung (CRITICAL, zuerst gemacht) · `8023f1a`

Geändert: `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`, §12.5, **nur die
Nachfolger-Spalte**. Alt-Spec- und Fate-Spalte stehen unberührt. Dazu ein ⚠️-Kopfsatz an der
Tabelle, der Befund F-1 und seine Ursache benennt (die Tabelle wurde gefüllt, **bevor** T150 seinen
Zuschnitt „nur Modulnavigation" bekam).

Anker sind **Zusicherungsnamen, keine Zeilennummern** — neue `datei:zeile`-Anker in den Plan zu
schreiben hätte die ~47er-Fundort-Klasse aus DRK-192 vermehrt, die dieselben Reviews rügen.

**Keine der sechs Zeilen blieb unbelegt; die Ersatzformel „⚠️ Träger nicht belegt" wurde nicht
gebraucht.** Die sechs Zuordnungen, wie eingetragen:

**1 · `bz-scan.spec.ts`** — ⚠️ NICHT `e2e/lagerbuch-verwaltung.spec.ts`.
`verwaltung/(arbeit)/bz/scan/BzScanner.test.tsx` „ruft ausschließlich die BZ-Action auf und gibt
deren Treffer weiter" · „bildet ok mit wert null auf null ab" (= unbekannter Barcode) · „wirft bei
einem Actionfehler, statt Unbekanntheit zu behaupten" (schärfer als die Alt-Spec: trennt „Code
unbekannt" von „Lesevorgang gescheitert"); `verwaltung/(arbeit)/bz/[id]/kontrolle/KontrolleForm.test.tsx`
„meldet bestanden und setzt alle Eingaben auf ihre sichtbaren Defaults zurück";
`verwaltung/(arbeit)/bz/[id]/BzLogbuchTabelle.test.tsx` (Spalte 6 hängt am aufgelösten Klarnamen);
`_db/quelle.test.ts` „loest oidc → users.name auf" + „faellt bei unbekannter Kennung auf die ROHE
ID zurueck".

**2 · `geraete.spec.ts`** — ⚠️ NICHT `e2e/lagerbuch-verwaltung.spec.ts` für die überlebende Hälfte.
`_lib/konstanten.test.ts` (`ZUSTAENDE` als Tripel, `ZUSTAND_DEFEKT === "Defekt"`, mit dem Grund
„Historische ergebnis-JSONs tragen sie bereits"); gerendert
`verwaltung/(arbeit)/checks/[id]/page.test.tsx` (`{ ton: "rot", zeichen: null, text: "Defekt" }`);
ausgewertet `_lib/domain/check.test.ts` „`geraeteAuffaellig` zaehlt !vorhanden ODER zustand ===
'Defekt'". Die **Eingabe**seite ist wie angekündigt gefallen und ersetzt durch
`_ui/CheckFlow.test.tsx` „die Auswahl steht NICHT allein auf der Farbe — Haken UND `aria-pressed`
tragen sie".

**3 · `inventur.spec.ts`** — ⚠️ NICHT `e2e/lagerbuch-verwaltung.spec.ts`.
`verwaltung/(arbeit)/inventur/InventurForm.test.tsx` „erlaubt 0 bis 9999 und zeigt Abweichungen mit
ASCII-Vorzeichen im Text" · „behält Werte bis zum Resolve, sperrt Doppelklicks und leert erst bei
Erfolg" · „positionenAus — Lost-Update-Riegel"; `_actions/inventur.test.ts` „bucht die Abweichung
per FEFO negativ mit typ korrektur"; `verwaltung/(arbeit)/bestellung/BestellListe.test.tsx`
„‚bestellt' (exact) trifft nur den datumslosen Chip, nie ‚bestellt seit …'".

**4 · `loeschen.spec.ts`** — `_ui/LoeschDialog.test.tsx` bleibt und trägt vollständig: „der
Loeschknopf bleibt gesperrt, solange der Name nicht exakt stimmt" · „zeigt den Grund und bietet
Deaktivieren an, wenn nicht loeschbar" · „der Loeschknopf ist bei ‚nicht loeschbar' gar nicht
vorhanden" · „ruft `pruefen` BEIM OEFFNEN, vor jeder Handlung" · „meldet den Grund NICHT als `Alert
type=error`". Der zweite genannte Nachfolger `e2e/lagerbuch-verwaltung.spec.ts` ist **durchgestrichen**
— T176-A hat gemessen, dass diese E2E-Hälfte **nicht existiert**. Das ist ein gemessenes Negativ,
kein unbelegter Rest, deshalb Streichung statt ⚠️-Platzhalter.

**5 · `verfall.spec.ts`** — ⚠️ NICHT `e2e/lagerbuch-verwaltung.spec.ts`.
`verwaltung/(arbeit)/verfall/AussondernRow.test.tsx` „bucht mit einem Kommentar, der die Charge
nennt" (= der Grund) · „fragt vor dem Aussondern per Popconfirm, nicht per Modal" (damit ist die
typografische `×`-Kopplung gefallen) · „der Knopf traegt ein `aria-label` mit der Charge" (der
Rollen-Ersatzanker); `_actions/aussondern.test.ts` „schreibt genau eine negative korrektur fuer den
Handlager-Rest" + „schliesst Bestand derselben Charge in einem Fahrzeug aus"; `_lib/journalZeile.test.ts`
„eine Entnahme ist NEGATIV und traegt ein Minus" + „das Vorzeichen ist ASCII, kein typografisches
Minus".

**6 · `verwaltung-flow.spec.ts`** — `_lib/journalZeile.test.ts` bleibt und trägt. ⚠️ NICHT
`e2e/lagerbuch-verwaltung.spec.ts` für die Flow-Hälfte. `_ui/ArtikelDrawer.test.tsx` „bindet den
DatePicker an Form und sendet bei `NEUE_CHARGE` nur `neueCharge` mit `YYYY-MM`" · „sendet bei einer
Bestandscharge nur `chargeId` und laedt den sichtbaren Bestand neu" · „sendet das ausgewaehlte
Fahrzeug mit Menge und Kommentar". Der volle Rundlauf bis ins Journal existiert im echten Browser,
auf dem Helferweg: `e2e/lagerbuch-helfer.spec.ts` „Gate → Helfer → Entnahme → Journal mit
Token-Provenienz". Die Sekundenauflösungs-Begründung ist gegenstandslos **geworden**, nicht
übergangen.

## Punkt 2 — Nachtrag zu `133e6ba` · `487a6e5`

`--allow-empty`, Historie **nicht** umgeschrieben. Nennt seinen Bezug und korrigiert drei Aussagen:
(1) „die Tabelle ist korrigiert" war bei `133e6ba` **unbelegt**, mit ausgeschriebener Begründung
(der Beleg lag im gitignorierten Bericht, `git ls-files .superpowers` = 0), und stimmt **jetzt** mit
Verweis auf `8023f1a`; (2) „das einzige **Verhalten**" → „das einzige **Anzeige**verhalten",
`seedLokal.ts:712-718` (`6326006`) hat ebenfalls Produktivcode-Ausgabe geändert; (3) „die Zahl ist
gestrichen statt ersetzt" ist durch `fe49511` überholt — richtig ist: es wurde **kein Anzahl-Gate**
gebaut, gegatet ist die Form (`actionErgebnis.test.ts:162`).

## Punkt 3 — zwei Wächter · `7796d82`

**(a) Offene Weiterleitung.** ⚠️ **Der Fundort im Auftrag und in beiden Reviews ist falsch.**
`e2e/lagerbuch-hosts.spec.ts` enthält **kein einziges `toMatch`**; die Zusicherung steht in
`e2e/lagerbuch-helfer.spec.ts` (Test „antwortet 303 mit relativem Location und setzt das Cookie ohne
Domain"). Ursache der Verwechslung: T171 ist die Helfer-Datei. Nachgeprüft, bevor geändert.
Die Lücke war offen: `//fremder-host/x` erfüllt `/^\//` **und** die Zeile darunter
(`not.toMatch(/^https?:/)`), sie deckte es also nicht ab. Fix `/^\/(?!\/)/`, mit ausgeschriebener
Begründung und Verweis auf `_lib/returnTo.ts`, das sich dieselbe Form auferlegt.

**(b) `loading.tsx`-Riegel.** `src/app/m/lagerbuch/error.test.tsx` liest jetzt zusätzlich **rekursiv**
über den Modulbaum, nach dem fertigen Muster `druck.test.ts#alleCss`. Findet heute nichts.
⚠️ **Nur `loading.tsx` rekursiv.** `not-found.tsx` und `global-error.tsx` sind bei Entscheidung
36 (b) **Wurzel**-Fragen; sie rekursiv zu verbieten hieße etwas zuzusichern, was die Entscheidung
nicht sagt. Die bestehende Wurzel-Zusicherung bleibt unverändert daneben stehen.

## Punkt 4 — `guards.test.ts`, A7-Bauform · `7796d82`

`expect(quelle.match(/^export\s+(?:type|interface)\s+\w+/gm)).toHaveLength(3)` gestrichen; der
Kopfkommentar trägt die Dreizahl nicht mehr weiter und begründet die Streichung (die 3 war kein
Grenzwert, sondern eine Abschrift des heutigen Zustands). Die tragende, differenzielle Hälfte
`actionsIn(...) === ["getDetail"]` bleibt. **`:458` „genau 3 Ausnahmen" ist unberührt** — dort
deckelt die 3 die echte Invariante 47 = 44 + 3.
Die Zusicherung stand **innerhalb** eines bestehenden `it`: die vitest-Testzahl bewegt sich nicht
(5806 vorher, 5806 nachher). Keine Zahl abgesenkt.

## Punkt 5 — undeklarierter E2E-Schreibvorgang · `0d84f6b`

Der billigere der beiden angebotenen Wege, wie empfohlen: Testwert `2026-09` → **`2090-09`**, die
Zusicherung prüft den **geschriebenen Wert** (`toContain("2090-09")`) statt der Warnwirkung.
`2090-09` ist bewusst **verschieden** von `E2E_VERFALL_FERN = "2090-01"` — sonst filterte
`checkAbschluss` den Wert als ungeändert weg (`CheckFlow.tsx:195-199`) und der Test würde still
nichts mehr messen. Begründung steht an der Füllstelle.
Die Datenwirkung steht jetzt **vollständig im Spec-Kopf**, neben den beiden, die dort schon standen:
`checks`, `tokens.last_used_at`, **`lagerort_verfall`** (`onConflictDoUpdate`, ohne Historie, ohne
Rücknahme, vom Seed nicht angefasst).
Nachgeprüft: `playwright.config.ts` fährt `rm -rf ./.data/e2e` **vor** dem Seed — es liegt also kein
vergifteter `2026-09`-Rest aus früheren Läufen in der Tabelle, der den Fix hätte maskieren können.

## Punkt 6 — Tapmaß · `1f5c1a3`

Selektormenge (`a[href], button, input, textarea, select`), Filter (`(w>0||h>0) && (w<44||h<44)`)
**und** der Radio-/Checkbox-Sonderfall (`closest("label")`) des Vorbilds `files-mobil.spec.ts`
übernommen. Die Vorbedingung liest jetzt **dieselbe** Selektormenge wie die Messung (`ZIELE` ist
eine Konstante, die beide benutzen) — vorher hätte sie Kandidaten bestätigt, die nie gemessen
werden. Testname „jede Zeilenaktion ist mindestens **44 x 44 px**".

**Der Test ist grün** — im vollen Lauf bestätigt. Kein Ausschlussfilter ergänzt, keine Zahl
gesenkt. Erklärung, warum er nicht rot wurde: `controlHeight: 56` ist die Modulvorgabe, ein
`<Button shape="circle">` misst damit 56 × 56 und liegt deutlich über 44.

## Punkt 7 — vakuöse Gegenprobe · `0d84f6b`

`e2e/lagerbuch-verwaltung.spec.ts`: die Gegenprobe hängt nicht mehr am Wort „vollständig" (das die
kaputte Zeile mitträgt), sondern an einer **benannten lesbaren** Zeile, gefunden über
`a[href$="/verwaltung/checks/e2e-check-lesbar"]` — plus `not.toContainText("unlesbar")`.
⚠️ Der Anker musste der Link sein: `checks/page.tsx` rendert je Zeile `fahrzeugName`,
`abgeschlossenText`, Chips, `positionenText` und `detailHref`. Der Artikelname aus `:180` steht auf
der **Detail**seite, nicht auf der Übersicht, und der Fahrzeugname taugt nicht — alle drei
Seed-Checks hängen an `e2e-fahrzeug`. **Nur Test, kein Produktivcode**; der grüne Chip bleibt.

## Punkt 8 — Eigentümertabelle §5 · `8d2961a`

Fünf Zeilen ergänzt: `_lib/tokenForm.ts` + Test (**A1**, T160) · `_ui/Chip.tsx` (**A15**, T171,
ERGÄNZT Teil 5 T106) · `verwaltung/(arbeit)/journal/**` mit allen vier Dateien einzeln benannt
(**A15**, T171, ERGÄNZT Teil 5 T147) · `e2e/seed-lagerbuch.ts` (**A10**, T170, ERGÄNZT Teil 3 T60).
⚠️ **Jede Zeile trägt den tragenden Grund ausgeschrieben, nicht nur das Kürzel** — die Ruling-Texte
liegen im gitignorierten Ledger; ein „A15" allein sagt nach dem Löschen der Kladde niemandem etwas.
Das ist derselbe Fehler wie bei §12.5, nur eine Ebene tiefer.
Dazu ein ⚠️-Absatz unter der Tabelle: A1 und A10 schreiben ihre §5-Zeile **ausdrücklich vor** und
sie kam nie an — und die A15-Zeile nennt, dass für `quelleTyp === "token"` `quelleId` der Code im
**Klartext** ist.

## Punkt 9 — Runbook · `14e1b24`

**Neuer §17 „Drei Abfragen gegen die Alt-Datenbank, bevor importiert wird"**, mit
§17.1 (a) · §17.2 (b) · §17.3 (d). Spaltennamen an `lagerbuch @ ca04eb1`, `src/db/schema.ts`
nachgelesen: `artikel.aktiv`, `tokens.aktiv`, `buchungen.quelle_typ`/`quelle_id`, `tokens.code`,
`checks.ergebnis` — alle vorhanden, die Abfragen laufen so.

⚠️ **Abweichung vom Auftrag, mit Grund:** Der Auftrag sagt für (a) „verweise auf den Teil-6-Review,
statt es zu wiederholen". Der Review liegt in `.superpowers/sdd/` — **gitignoriert und zur Löschung
vorgesehen**. Ein Verweis dorthin wäre exakt derselbe Fehler, den Punkt 1 gerade behebt. Deshalb
stehen die tragenden Inhalte **im Runbook**: 2.901 Byte je SVG, die Tabelle 100/300/800/2000 →
0,6/1,7/4,4/11,1 MB je Aufruf, die beiden geprüften Abhilfewege (CSS-only-Auswahl mit dem Vorbehalt
zum `.lb-etikettAbgewaehlt`-Scan; QR über eine Route als `<img src>` mit dem Preis N Anfragen +
riegelpflichtiger Handler) und der ausdrücklich ausgeschlossene **Irrweg** (Kacheln serverseitig
rendern und als `children` reichen behebt die Doppelung **nicht** — die Kopie entsteht durch das
Überqueren der Grenze). „Erst messen, dann entscheiden" steht als Handgriff oben; vierstellig
übergibt eine **Seitenteilung** als Fachentscheidung an Spec 2.

**(c) R30 — zwei Stellräder mit Rangfolge.** Gemessene Zahlen in der Zeile, Rangfolge erst `margin`
(4 → 2 → 1), dann nur falls nötig `H → Q → M` für **diesen einen** Erzeugungsweg mit
ausgeschriebenem Preis; dazu der Nachweis, warum `margin` allein nicht reicht (0,465 mm < 0,571 mm).
Damit ist A-J2s „Level H bleibt in beiden Fällen" gemessen überholt — als solches benannt, nicht
still ersetzt.
⚠️ **Diese Zeile ist in BEIDEN Fassungen zeichengleich geändert — Runbook §16.2 UND Plan §10.2.**
`133e6ba` behauptet „zeichengleich zu Plan §10.2", und das Abschlussreview hat es maschinell
verifiziert; eine einseitige Änderung hätte diese Aussage gebrochen. Nach der Änderung nachgeprüft:
die beiden R30-Zeilen sind byte-identisch.
In §15 zusätzlich: der Probebogen wird **vor den Freeze** gezogen („dann ist er gar kein
Cutover-Schritt mehr") und verweist auf §17.1 für die Bogengröße.

**(e) §14** — der Satz „sie sagen es auf der Oberfläche selbst" ist ehrlich gemacht: auf der
Detailseite stimmt er, auf der Übersicht trägt dieselbe Zeile „unlesbar" **und** einen grünen Chip
„vollständig", mit ausgeschriebenem Mechanismus (alle Zähler 0 → kein Chip → Vollständig-Chip
nachgeschoben) und Verweis auf DRK-196 als den Ort, wo Chip und offener Check zusammen geplant
werden. Dazu die Querverweis-Zeile von §14 auf §17.3.

## Punkt 10 — vier Ehrlichkeitskorrekturen · `8d2961a`, `14e1b24`, `7796d82`

- **Runbook §13**: „Gemessen bei der Abnahme (T175)" stand vor dem Handgriff — getauscht, jetzt wie
  §14 und §15.
- **Plan §7.1**: ⚠️-Satz an der Tabelle. Hinter „Verifiziert in: Teil 5, T151/2" steht **kein
  Zeilenprotokoll**, der Commit sagt nur aggregiert „23 Verwaltungsrouten liefern 200"; T175 hat die
  Zeilen deshalb selbst gefahren. Die Lehre ist sinngemäß für jede „Verifiziert in Teil N"-Spalte
  ausgeschrieben.
- **Plan-Zeile 118**: Selbstverweis „siehe §2.3" innerhalb §2.3 → **§2.2**.
- **`_lib/csvBestellung.ts`**: die BOM-Begründung zeigte auf `./csv.ts#KOPFWORTE` — den
  **Artikel**-Import mit fünf, zu `bestellvorschlag.csv` **disjunkten** Spalten, der ein BOM ohnehin
  selbst entfernt (Regex `/^﻿/` gleich zu Beginn von `parseArtikelCsv`). Das **Verbot bleibt
  richtig** (externer Abnehmer, 1:1-Pflicht 28); die Begründung ist auf diesen Grund gezogen, der
  falsche Fundort als solcher benannt. Mitgenommen: ein Rundlauf Export → Bearbeiten → Re-Import von
  `bestellvorschlag.csv` ist **nicht möglich**, der Apostroph aus der Formel-Neutralisierung kann auf
  diesem Weg nicht in einen Artikelnamen zurückwandern.

---

## Gates

| Gate | Ergebnis |
|---|---|
| `pnpm typecheck` | **grün**, 0 Fehler |
| `pnpm lint` | **0 Fehler**, 5 Warnungen — dieselben fünf wie seit T158 (`fixtures.ts` `expect`, 3× `_weg`, 1× `_now`) |
| `pnpm vitest run` | **337 Dateien, 5806 Tests, alle grün** (Log: `/tmp/fixwelle-vitest2.log`) |
| `pnpm build` | **EXIT 0** |
| `pnpm exec playwright test` (voll) | **173 Tests, 173 passed, 0 failed** (6,9 min; Log: `/tmp/fixwelle-playwright2.log`) |

Die Zahlen sind **unverändert** gegenüber `133e6ba` (337/5806, 173). Keine Testdatei angelegt, keine
`it`-Zahl bewegt, keine Zahl abgesenkt. Kein `pnpm dev` lief während der E2E-Läufe (geprüft).
`next-env.d.ts` nach Build und E2E-Lauf auf den Stand vor dem Bau zurückgenommen; Arbeitsbaum sauber.

**Zwei Flakes im jeweils ERSTEN Lauf, beide in nicht angefassten Dateien, beide im zweiten Lauf
grün** — protokolliert, weil sie sonst wie Regressionen der Welle aussähen:
- `vitest`, erster voller Lauf: 2 Fehlschläge in
  `verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx` („Nicht rechtzeitig sichtbar", Zeitschranke
  unter Last). Isoliert 31/31 grün, zweiter voller Lauf 5806/5806 grün. Datei nicht angefasst.
  → **Dieser Flake wurde separat behoben, siehe „Nachtrag — Flackernder Excel-Export-Test" unten.**
- `playwright`, erster voller Lauf: `e2e/portal.spec.ts` „admin can create a service". Isoliert 4/4
  grün, zweiter voller Lauf 173/173 grün. **Fremdes Modul**, nicht angefasst; deckt sich mit der im
  Ledger protokollierten Flakiness fremder Modul-Specs.

---

## Nachtrag — Flackernder Excel-Export-Test (separater Auftrag, zweiter Bearbeiter)

Nicht einer der zehn Fix-Welle-Punkte, sondern ein eigener, vom Koordinator getrennt vergebener
Auftrag: den oben unter „Gates" protokollierten `vitest`-Flake in
`verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx` ursächlich beheben und die restlichen Gates
fahren. Bearbeitet auf demselben Arbeitsbaum, zeitlich überlappend mit der Fix-Welle selbst (siehe
F0 oben) — Commit `e2ea094`, aufgesetzt auf `ec6ae9d`.

**Ursache, an der Sache nachgeprüft (nicht nur übernommen):** die drei betroffenen Tests im
Block „Excel-Export (§9.4)" mocken `write-excel-file/browser` per `vi.doMock`, jeweils nach
`vi.resetModules()`. Der Klick auf den Export-Knopf löst in `ArtikelTable.tsx:146` einen ECHTEN
dynamischen Import (`await import("write-excel-file/browser")`) aus, den Vitest wegen des
vorherigen `resetModules()` jedes Mal neu auflösen muss. Der hauseigene Wartehelfer `warteAuf`
pollt dafür mit einem FESTEN Budget von 30 × `setTimeout(0)`-Ticks. Im vollen Lauf (337 Dateien im
Thread-Pool) kann die Modulauflösung länger dauern als 30 Ticks — dann reißt der Test mit „Nicht
rechtzeitig sichtbar: toFile-Aufruf", obwohl der Code korrekt ist. Geprüft anhand von
`/tmp/fixwelle-vitest.log:1496-1528`: beide Fehlschläge tragen exakt diese eine, bare Meldung —
kein Alarm, keine unbehandelte Ablehnung, kein Hinweis darauf, dass statt des Mocks das echte Modul
geladen wurde (was für ein Leck im `resetModules()`/`doMock`-Zusammenspiel gesprochen hätte). Das
stützt die Zeitschranken-Hypothese und schließt die nächstliegende Alternativhypothese aus.

**Fix — deterministisch, kein größeres Budget.** Ein neuer Helfer `meldendesVersprechen()` liefert
ein Versprechen, das sich genau dann auflöst, wenn der `toFile`-Spion zum ersten Mal läuft. Die drei
betroffenen Tests (zwei der beiden gemeldeten plus ein dritter mit identischem Wartemuster, der in
dieser Sitzung nicht auffiel, aber demselben Mechanismus unterliegt) warten jetzt darauf statt auf
`toFile.mock.calls.length === 1` zu pollen. Begrenzt ist die Wartezeit jetzt durch Vitests
Test-Timeout (Default 5000 ms) statt durch 30 Ticks — rund das 1000-fache an Kopfraum. Verhalten und
Fehlerzusicherungen selbst (Blattname, fixierte Kopfzeile, datierter Dateiname, nur gefilterte
Zeilen) sind unverändert; kein `it.skip`, kein `retry`.

**Messung — ehrlich, nicht erfunden.** Der Fehlschlag ließ sich auf dieser Maschine **nicht
reproduzieren**, weder vor noch nach dem Fix: 0 von 12 Läufen vorher (5 im Leerlauf, 7 unter
künstlicher 12-Kern-CPU-Last per `yes`-Prozessen — Laufzeit dabei von ~30s auf ~40s gestiegen,
aggregierte `import`-Zeit von ~200s auf ~280s, also messbar echte Last erzeugt), 0 von 4 Läufen
danach (alle unter derselben synthetischen Last). Die Nichtreproduktion widerspricht der Diagnose
nicht — sie bestätigt nur, dass es sich um ein seltenes, lastabhängiges Timing-Fenster handelt, wie
es auch die beiden in dieser Sitzung dokumentierten Vorkommen (dieses hier + ein früheres,
unbenanntes) nahelegen. Der Fix beseitigt den im Log belegten Mechanismus strukturell — das feste
30-Tick-Budget ist komplett entfernt —, unabhängig davon, ob er sich auf dieser Maschine erneut
auslösen ließ.

**Playwright, voll, einmal, nach dem Fix:** 173 Tests, 173 passed, 0 failed (Vergleichsstand vor
der Welle: 173). Keine der **drei** von der Welle angefassten E2E-Spec-Dateien (`lagerbuch-helfer`
×2, `lagerbuch-verwaltung`, `lagerbuch-mobil` — **nicht** `lagerbuch-hosts`: F1 oben hat gemessen,
dass diese Datei kein einziges `toMatch` enthält und von der Welle nie berührt wurde, entgegen der
ursprünglichen Auftragsbeschreibung) — inklusive der in Punkt 6 geweiteten Tapmaß-Messung (Fläche
statt nur Höhe) — zeigte einen neuen Fehlschlag; insbesondere kein 44×44px-Fund bei der geweiteten
Messung.

**Gates dieses Nachtrags:** `typecheck` grün · `lint` 0 Fehler / 5 vorbestehende Warnungen (identisch
zur Fix-Welle) · `vitest` 337/5806, 4 von 4 Wiederholungen nach dem Fix grün · `build` EXIT 0 ·
`playwright` 173/173 grün, ein voller Lauf.

---

## Funde und Bedenken

**F0 · ✅ GELÖST (Nachtrag des zweiten Bearbeiters).** Die fremde Änderung stammt von einem
zweiten Agenten, separat vom Koordinator mit genau diesem Flake beauftragt — parallel zu dieser
Fix-Welle, im selben Arbeitsbaum, entgegen dem an beide Agenten ausgegebenen „Nichts läuft
parallel". Der zweite Agent hat die Änderung committet (`e2ea094`, auf `ec6ae9d` aufgesetzt,
sauberer Merge, kein Konflikt), den vollen `vitest`- und `playwright`-Lauf **mit** ihr wiederholt
(siehe „Nachtrag — Flackernder Test" unten) und dort seine eigenen Vor/Nach-Zahlen hinterlegt.
Die ursprüngliche F0-Beschreibung bleibt darunter stehen, weil sie den Zustand zum Zeitpunkt der
Entdeckung korrekt festhält:

**F0 (Original) · ⚠️ EINE FREMDE, NICHT VON MIR STAMMENDE ÄNDERUNG LIEGT UNCOMMITTED IM ARBEITSBAUM.**
Nach meinem letzten Commit (`ec6ae9d`) meldet `git status`
`M src/app/m/lagerbuch/verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx` — **+50/−6, und ich habe
diese Datei nie angefasst.** Der Inhalt: eine neue Hilfe `meldendesVersprechen()` ersetzt an drei
Excel-Export-Tests das budgetierte `warteAuf(…)`-Pollen durch ein Versprechen, das der Spion selbst
auflöst. Der neue Kopfkommentar **verweist namentlich auf `fix-welle-report.md`** und auf „zwei
flackernde Gate-Läufe in dieser Sitzung" — also auf genau den Flake, den ich unten unter „Gates"
protokolliert habe.

**Ich habe sie weder committet noch verworfen.** Committen hieße, fremde Arbeit unter meiner
Autorenschaft in die Welle zu ziehen und die Regel „nur anfassen, was im Auftrag steht" zu brechen;
Verwerfen hieße, jemandes Arbeit zu zerstören. Sie liegt unverändert im Arbeitsbaum und braucht eine
Entscheidung des Koordinators.

Was ich dazu belegen kann: die Änderung **übersetzt und läuft** — `ArtikelTable.test.tsx` isoliert
**31/31 grün**, `act` war bereits importiert. Sie ist inhaltlich eine plausible und gute Behebung
genau meines Flake-Befunds (festes 30-Tick-Budget gegen einen echten dynamischen Import unter
CPU-Last). ⚠️ **Sie ist in KEINEM meiner Gate-Läufe enthalten** — alle Zahlen unten wurden vor ihrem
Auftauchen gemessen; der volle `vitest`-Lauf und der volle Playwright-Lauf müssten mit ihr wiederholt
werden, bevor sie als gegatet gilt.

⚠️ **Der Auftrag sagt „Nichts läuft parallel."** Diese Datei widerspricht dem. Wer immer in diesem
Worktree noch schreibt, sollte das wissen, bevor der PR gestellt wird — und es erklärt rückblickend
auch die zwei „file had been modified on disk"-Hinweise, die ich während der Arbeit bekommen habe.

**F1 · Der Fundort von „T171 b" ist im Auftrag und in BEIDEN Reviews falsch.** Genannt ist
`e2e/lagerbuch-hosts.spec.ts:215`; diese Datei enthält kein `toMatch`. Die Zusicherung steht in
`e2e/lagerbuch-helfer.spec.ts`. Folge für die Buchhaltung: die Welle fasst **drei** E2E-Dateien an
(`helfer` ×2, `mobil`, `verwaltung`), nicht vier. Elfte Instanz der Fundort-Klasse (DRK-192) — und
diesmal ist sie durch drei Dokumente durchgeschrieben worden.

**F2 · Punkt 6 wurde grün, und der Grund verdient eine Zeile: die Zusage war die ganze Zeit
erfüllt, nur ungemessen.** `controlHeight: 56` macht jeden antd-Knopf 56 px, auch den
`shape="circle"`. Es gab also nie einen Verstoß — die Messung sah nur so aus, als deckte sie ihn ab.
⚠️ **Restschwäche, nicht behoben (außerhalb des Auftrags):** die Vorbedingung sichert „die Seite
trägt Bedienelemente", **nicht** „die Icon-only-Zeilenaktion ist vorhanden". Ist die Bestellliste im
Seed leer, rendert `BestellListe.tsx` die Zeilenaktion gar nicht und der Test misst sie nie —
grün, ohne die Zusage zu prüfen. Ein `expect(page.getByRole("button", { name: … })).toBeVisible()`
auf die konkrete Zeilenaktion würde das schließen. **Board, nicht diese Welle.**

**F3 · §17 steht hinter §16, obwohl er chronologisch davor gehört.** Bewusst: §16.2 wird vom Plan
(§10.2) und von `133e6ba` namentlich referenziert, und die Zeichengleichheit der Tabellen ist eine
geprüfte Aussage. Eine Umnummerierung hätte drei Dokumente gleichzeitig gebrochen. Wenn Spec 2 das
Cutover-Runbook schreibt, ist die Umsortierung dort kostenlos.

**F4 · Die A15/Klartext-Zeile liegt jetzt an zwei Stellen, aber nicht in §16.2.** Das Teil-6-Review
wollte sie „in die Runbook-Übergabe an Spec 2". Sie steht in Plan §5 (Eigentümerzeile) und in
Runbook §17.2 (⚠️-Absatz). **Nicht** in §16.2 — dieselbe Zeichengleichheitsbindung wie F3. Wer die
Übergabetabelle als einzige Quelle liest, findet den Hinweis nicht. Sollte beim Schreiben des echten
Cutover-Runbooks als R-Zeile aufgenommen werden.

**F5 · `133e6ba`s Aussage „zeichengleich zu Plan §10.2" ist jetzt eine Zusicherung ohne Wächter.**
Sie wurde zweimal von Hand geprüft (einmal vom Review, einmal von mir nach der R30-Änderung). Ein
Test, der Plan §10.2 gegen Runbook §16.2 zeilenweise vergleicht, wäre billig — die nächste einseitige
Änderung bricht sie sonst still. **Board.**

**F6 · Die Kladde ist weiterhin die einzige Heimat mehrerer Messungen.** §12.5 und §5 sind gerettet,
aber die Orte der übrigen 39 Zustände aus §11.5 stehen als `Datei#Symbol:Zeile` **nur** in
`task-176a-report.md`. `133e6ba` behauptet darüber nichts Falsches — die Aussage stimmt —, aber ihr
Beleg verschwindet mit dem Verzeichnis. Wer die 39 später prüfen will, wiederholt T176-A Schritt 3.
Das war nicht Teil dieser Welle; es ist dieselbe Klasse wie C1 und gehört benannt, bevor jemand
`.superpowers/sdd/` löscht.

**Keine Bedenken gegen die Merge-Fähigkeit.** Kein Produktivverhalten wurde geändert: die einzigen
Eingriffe in `src/` sind eine Kommentarkorrektur (`csvBestellung.ts`), eine gestrichene Zusicherung
(`guards.test.ts`) und eine ergänzte (`error.test.tsx`).

---

## Statusmeldung

**Status (Original, Fix-Welle):** DONE_WITH_CONCERNS — alle zehn Punkte behoben, alle Gates grün,
**aber eine fremde, nicht von mir stammende Änderung liegt uncommitted im Arbeitsbaum** (F0). Der
Arbeitsbaum ist deshalb nicht sauber, und der Auftrag sagt „Nichts läuft parallel". Das braucht
deine Entscheidung, nicht meine.
**Commits:** `8023f1a` · `487a6e5` · `8d2961a` · `14e1b24` · `7796d82` · `0d84f6b` · `1f5c1a3` ·
`ec6ae9d` (auf `fe49511`)

> **Status (Nachtrag, zweiter Bearbeiter):** F0 ist gelöst — die fremde Änderung ist committet
> (`e2ea094`, auf `ec6ae9d`), begründet, isoliert und im vollen Gate-Satz (vitest 4×, playwright 1×,
> nach dem Fix) grün gefahren. Damit bleibt als offener Punkt für den Koordinator nur noch die
> **Prozessfrage**: zwei Agenten liefen gleichzeitig im selben Arbeitsbaum, entgegen der an beide
> ausgegebenen Vorgabe „Nichts läuft parallel" — hier folgenlos (kein Konflikt, keine
> Testverfälschung, docs-only-Commit von Agent A betraf keine von Agent B gelesene/geänderte Datei),
> aber nicht garantiert folgenlos bei künftiger Überlappung. F1–F6 sind unverändert offen und laut
> Originalbericht **keine** Merge-Blocker.
> **Zusätzlicher Commit:** `e2ea094` (auf `ec6ae9d`).

- **1** behoben — §12.5 trägt die sechs gemessenen Träger, Datei + Zusicherungsname, keine Zeile
  unbelegt, `loeschen`s zweiter Nachfolger als gemessenes Negativ gestrichen.
- **2** behoben — `--allow-empty`-Nachtrag `487a6e5`, drei Aussagen richtiggestellt, `133e6ba` steht.
- **3** behoben — beide Wächter. ⚠️ Fundort a lag in `lagerbuch-helfer.spec.ts`, nicht `-hosts`.
- **4** behoben — `toHaveLength(3)` gestrichen, `:458` unberührt, Testzahl unverändert.
- **5** behoben — `2090-09`, Zusicherung auf den geschriebenen Wert, Datenwirkung im Spec-Kopf.
- **6** behoben — Fläche statt Höhe, ganze Vorbild-Bauform, Vorbedingung mitgezogen. **Grün.**
- **7** behoben — Gegenprobe an `e2e-check-lesbar` statt am Wort „vollständig".
- **8** behoben — fünf §5-Zeilen mit Ruling **und** ausgeschriebenem Grund.
- **9** behoben — Runbook §17 (a/b/d), R30 mit zwei Stellrädern (Plan §10.2 zeichengleich mit),
  §14 ehrlich, Probebogen vor den Freeze. Nachgezogen in `ec6ae9d`: A-J2 an allen drei Fundstellen
  (§2.3, §5, §2.4), sonst hätte der Plan den Rückfall in zwei Fassungen getragen — und `qrSvg(text)`
  nimmt heute **gar keine** Optionen, beide Stellräder sind damit ein **Suite**-Eingriff.
- **10** behoben — §13 gedreht, §7.1 ⚠️, §2.3 → §2.2, BOM-Begründung auf den richtigen Grund.

**Gates:** typecheck grün · lint 0 Fehler / 5 vorbestehende Warnungen · vitest **337 Dateien,
5806 Tests grün** · build EXIT 0 · playwright **173/173 grün** (6,9 min, voller Lauf, ohne
Parallelbetrieb). Zahlen unverändert gegenüber `133e6ba`.

**Bedenken:** ⚠️ **F0 zuerst — fremde, uncommittete Änderung an
`verwaltung/(arbeit)/artikel/ArtikelTable.test.tsx` (+50/−6), nicht von mir, verweist auf diesen
Bericht; nicht committet, nicht verworfen, in keinem Gate-Lauf enthalten. Isoliert 31/31 grün.**
Dazu F1 (falscher Fundort in beiden Reviews — drei E2E-Dateien, nicht vier) · F2 (Punkt 6
grün, weil `controlHeight: 56`; Restschwäche: die Vorbedingung sichert die Icon-only-Zeilenaktion
nicht) · F4 (A15/Klartext fehlt in §16.2, Zeichengleichheitsbindung) · F5 („zeichengleich zu §10.2"
hat keinen Wächter) · F6 (die Orte der 39 übrigen §11.5-Zustände leben weiter nur in der Kladde).
Je zwei Flakes in `ArtikelTable.test.tsx` und `portal.spec.ts` im ersten Lauf, beide nicht
angefasst, beide im zweiten Lauf grün.

**Bericht:** `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/fix-welle-report.md`

---

## Nachtrag-Statusmeldung (zweiter Bearbeiter, Flackern-Fix)

**Status:** DONE. **Commit:** `e2ea094` (auf `ec6ae9d`) — ursächlicher Fix: die drei
`toFile`-Wartestellen in `ArtikelTable.test.tsx` warten jetzt auf ein Versprechen statt auf ein
festes 30-Tick-Pollbudget hinter einem echten dynamischen Import.
**Vor/Nach:** 0 von 12 vollen `vitest`-Läufen vorher rot (5 im Leerlauf, 7 unter synthetischer
CPU-Last), 0 von 4 danach (unter derselben Last) — Flake auf dieser Maschine nicht reproduzierbar,
Diagnose beruht auf `/tmp/fixwelle-vitest.log` (Agent A) + Codeanalyse, nicht auf eigener
Reproduktion.
**Gates:** typecheck grün · lint 0/5 (identisch) · vitest 337/5806 grün (4× nach Fix) · build
EXIT 0 · playwright 173/173 grün (ein voller Lauf nach Fix).
**Funde:** keine neuen E2E-Fehlschläge, auch nicht bei der in Punkt 6 geweiteten
44×44px-Tapmaß-Messung.
**Bedenken:** siehe F0 oben — zwei Agenten liefen parallel im selben Arbeitsbaum entgegen der
Vorgabe; hier folgenlos, aber eine Prozessfrage für den Koordinator, nicht für mich lösbar.
