# Abschluss-Review Teil 4 — Kohärenz, tote Enden, Nähte zu den Nachbarplänen

Branch `feat/lagerbuch-modul-teil4`, 44 Commits, `b1254e5..49a77c6`.
Blickrichtung: ausdrücklich **nicht** die Task-Ebene (die ist reviewt), sondern das, was ein
task-enges Review strukturell nicht sehen konnte.

Alle Prüfungen read-only. Kein `pnpm build` (N-6: schriebe `next-env.d.ts` und `.next/`), kein
Schreibzugriff auf Arbeitsbaum, Index oder HEAD.

---

## 1. Was gut gemacht ist

Das gehört vor die Mängelliste, weil es die Grundlage dafür ist, dass die Restliste so kurz ist.

**Die Bauqualität ist überdurchschnittlich.** 63 Dateien, ~16.000 Zeilen, jede Welle mit grünem Gate
(zuletzt 247 Dateien / 4343 Tests), jeder der 27 Tasks reviewt, neun davon mit Fix-Runde. Die
Mutationsbelege sind unüblich gründlich — die Regel „belege es durch eine gefahrene Mutation"
(Regel 2) ist nicht erzählt, sondern protokolliert.

**Sechs Stellen, die ich gezielt gesucht und sauber gelöst vorgefunden habe:**

1. **Die 30-Minuten-Schwelle steht bewusst doppelt und ist an der Doppelung erklärt.**
   `_ui/Restzeit.tsx:35` (`WARNSCHWELLE_MS`) und `_ui/HelferRahmen.tsx:96` (inline). Der Kommentar
   `HelferRahmen.tsx:88-94` nennt Falle 6 als Grund („`Restzeit.tsx` traegt `use client`; ein WERT von
   dort kaeme in dieser Server Component als Client-Referenz an, HTTP 500") **und** den Ausweg
   („Wandert die Schwelle, gehoert sie in ein Modul ohne `use client` (`_lib/`)"). Das ist genau der
   Fall, den ich als Drift-Kandidat erwartet hatte — er ist vorweggenommen.

2. **`Cache-Control` steht zweimal und ist von *einem* Test gebunden.**
   `_lib/pwaIcons.ts:78` und `pwa-icon.svg/route.ts:16` tragen beide
   `"public, max-age=604800, immutable"`. `pwa.route.test.ts:246-255` läuft über alle vier
   Symbol-Antworten, mit `expect(symbole.length).toBe(4)` als Vakuum-Riegel davor. Drift wird laut,
   nicht still.

3. **`ohneKommentare()` ist in 24 Dateien kopiert — und alle 24 sind semantisch identisch.**
   Automatisch nachgemessen (Whitespace-normalisierter Rumpfvergleich): eine einzige Variante über
   alle 24 lagerbuch-Kopien inklusive der Vorlage `_lib/bauform.test.ts`. Die von sechs Task-Reviews
   gemeldete „nicht zeichengleich"-Abweichung ist reine Prettier-Umbruchdifferenz ohne
   Verhaltensfolge.

4. **T87s Verschärfung sitzt an der richtigen Stelle.** Die Existenzpflicht des Reihenfolge-Scans
   hängt an `flaechen()` und nicht an `existsSync` allein (`_lib/bauform.test.ts:876-882`) — mit
   gemessener Begründung („eine Flaeche, die ihr `redeemToken(` verliert, faellt still aus ALLEN DREI
   Tests heraus"). Und der Block sagt ausdrücklich, was er **nicht** deckt (Bedingtheit vs. Position)
   und wem die Lücke gehört. Ebenso richtig: das Host-Muster wird je Fläche geführt statt global
   geweitet (`HOST_FORM`, `f3a7eea`) — mit der Messung, dass das geweitete Muster eine echte Mutation
   31/31 grün ließ.

5. **Die Abrufprobe wurde wirklich gefahren.** Sieben Aufrufe, protokolliert in
   `task-87-report.md:106-185`, inklusive der Kontrolle, dass der 404 aus der *richtigen Schicht*
   kommt. Zahlreiche Tasks hatten Falle 6/7 dorthin vertagt; die Schuld ist eingelöst.

6. **T83 wurde korrekt blockiert statt übertüncht** (`progress.md:268-271`), und die
   Vorzieh-Entscheidung ist mit Begründung protokolliert, statt still zu passieren.

**Alle relativen Importe des Branches lösen auf** (63 Dateien maschinell geprüft, 0 Fehlstellen) —
kein Import greift in eine Datei, die einem Nachbarplan gehört und noch nicht existiert.

**B4 ist vollständig gelandet.** `HelferGrund` hat den fünften Wert (`_lib/actionTypen.ts:56`),
`check.ts:114` gibt ihn im `safeParse`-Zweig zurück statt `"netz"` (Global Constraint 12 damit
eingehalten), `darfErneuern` bleibt `grund === "sitzung"` (`actionTypen.ts:112`) und ist für
`"eingabe"` korrekt `false`. Die von mir befürchtete Drift zum Inline-Duplikat
`Entnahme.tsx:167` (`=== "sitzung"`) ist **nicht** eingetreten: beide liefern für den neuen Wert
dasselbe.

---

## 2. Befunde

### Important 1 — Teil 4 hinterlässt als einziger Teil keine Übergabe-Datei; R1 ist cutover-kritisch

**Fundstelle:** fehlende `docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md`, gegen die
vorhandenen `docs/superpowers/plans/UEBERGABE-lagerbuch-teil2.md` und `-teil3.md`; die betroffenen
Inhalte stehen in `task-87-report.md:295-330`.

**Befund.** Teil 2 und Teil 3 haben je eine *getrackte* Übergabe-Datei unter
`docs/superpowers/plans/` hinterlassen — das ist die etablierte Form, in der ein Plan seine Auflagen
an die Nachfolger weitergibt. Teil 4 hat **keine einzige Datei unter `docs/`** angefasst
(`git diff --stat b1254e5..HEAD -- docs/` ist leer), obwohl er mehr planübergreifende Schuld trägt
als beide Vorgänger: zwei vorgezogene Teil-5-Dateien, B4 in T63s Datei, `_lib/hostRiegel.ts` ohne
Eigentümer, dazu die vier T6-Auflagen und die drei Runbook-Eingaben.

Diese Auflagen existieren heute ausschließlich in `task-87-report.md:295-330` — und das ist kein
Ersatz: `.superpowers/sdd/` ist per `.superpowers/sdd/.gitignore:1` (`*`) Scratch-Verzeichnis
(`git ls-files .superpowers/` → 0 Dateien). Das ist workflow-konform und soll so bleiben; genau
deshalb ist die Übergabe-Datei der vorgesehene Weg, und genau der fehlt.

**Der teuerste Einzelposten — R1, cutover-kritisch und nirgends sonst dokumentiert.**
`APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` müssen zeichengleich derselbe Host sein, weil
`helferCookieOptionen()` `path:"/"` **ohne** `domain` setzt. Weicht der Host beim Umschwenken ab,
endet **jede laufende Feld-Sitzung**, und kein Test sieht das — die Cutover-Kommunikation müsste dann
„alle Helfer müssen ihr Kärtchen einmal neu scannen" enthalten. Gegrept über die 200 Zeilen von
`docs/runbooks/lagerbuch-cutover.md`: **kein** Treffer für `APP_BASE_URL`, `helferCookie`,
`Kärtchen`, `neu scannen` oder `manifest`; §7 dort behandelt nur die Boot-Prüfung von
`SUITE_HOST_LAGERBUCH`. Ebenfalls nicht im Runbook: R2 (Nachkontrolle von `/manifest.webmanifest` und
`/icon-192.png` nach dem Umschwenken, plus die Negativprobe gegen den Portal-Host) und R3
(Generalprobe auf einem Gerät, iOS-Speicherpartition).

**Was es sichtbar macht.** Teil 5 oder der Cutover wird in einer frischen Sitzung auf einem sauberen
Arbeitsbaum begonnen — der gewöhnliche Fall. Dann ist von R1–R3 und den T5/T6-Auflagen nichts mehr
auffindbar, weil sie nie an einem getrackten Ort standen.

**Weiter betroffen:** **T6-4** — die Routenzahl **14** in Teil 6 §2.1 ist unbelegt, gemessen sind
**11**; und **T5-1**, siehe Important 2.

**Ausdrücklich gut gelöst und deshalb *nicht* betroffen:** T87 hat die Zuständigkeit für T6-1 und
T6-3 in den **Quelltextkommentar an der Stelle selbst** geschrieben (`_lib/bauform.test.ts`, siehe
`task-87-report.md:298` — „Die Zuständigkeit steht jetzt im Kommentar an der Stelle selbst, nicht nur
im Plan"). Genau dieser Reflex ist der richtige; er wurde nur nicht auf alles angewandt, was ihn
braucht.

**Fix.** `docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md` anlegen (getrackt, Muster von
Teil 2/3): die Auflagen T5-1…T5-5 und T6-1…T6-4 wörtlich aus `task-87-report.md:295-317`, dazu die
Vorzieh-Entscheidung und B4. R1–R3 gehören zusätzlich nach `docs/runbooks/lagerbuch-cutover.md` —
R1 vor den Umschwenk-Schritt.

---

### Important 2 — Teil 5 legt `_lib/actionErgebnis.ts` weiterhin als „Create" an, ohne Vorzieh-Vermerk

**Fundstelle:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil5.md:5217`
(`- Create: src/app/m/lagerbuch/_lib/actionErgebnis.ts`), dazu `:5384` (Schritt 3 druckt die Datei
aus) und `:5576` (der Commit-Block staged sie) — gegen die bereits eingecheckte
`src/app/m/lagerbuch/_lib/actionErgebnis.ts` (Commit `6b48c8e`).

**Befund.** Beide Teil-5-Dateien wurden vorgezogen, aber nur **eine** ist im Plan darauf vorbereitet:

| Datei | Teil-5-Task | Vorzieh-Vermerk im Plan? |
|---|---|---|
| `_actions/buchung.ts` | T114 | **ja** — `teil5.md:5630-5633`: „dieser Task darf **vorgezogen** werden … **Es gibt genau eine `_actions/buchung.ts`** (H7)" |
| `_lib/actionErgebnis.ts` | T113 | **nein** |

T113 ist im Plan ein Bündel aus `_lib/actionErgebnis.ts` + `_actions/artikel.ts` +
`_actions/artikel.test.ts` in **einem** Task mit **einem** Commit. Dieser Branch hat das Bündel
aufgetrennt und nur die Typdatei gezogen — sachlich richtig (`_actions/artikel.ts` ist eine
Verwaltungs-Action und verschöbe den fremden Zweig), aber der Plan weiß nichts davon.

Zusätzlich ist Teil 5s eigene Zählung überholt: `teil5.md:498` sagt „**15 Action-Dateien** mit **43
Deklarationen**"; nach dem Vorziehen baut Teil 5 noch **14 Dateien mit 40 Deklarationen**. Die Zahl
wird in Kommentaren fortgeschrieben (`teil5.md:4842`, `:5045`, `:5183` — „42 der 43 Deklarationen").

**Was es sichtbar macht.** Die Asymmetrie selbst ist der Defekt: wer T113 nach Plan ausführt, legt
eine Datei an, die schon da ist, ohne dass irgendetwas im Plan ihn warnt — während T114 zwölf Zeilen
Warnung trägt. Genau dieser Mechanismus ist auf diesem Branch bereits eingetreten, nur in der
Gegenrichtung: T83 lief BLOCKED, weil Auflage A2 („`_actions/buchung.ts` wird vorgezogen") nie
ausgeführt worden war (`progress.md:268-271`) — Kosten: ein blockierter Task, eine autonome
Entscheidung, eine umgeplante Welle. Erschwerend kommt hinzu, dass der einzige Datensatz, der die
Frage heute auflöst (`task-87-report.md:307`, T5-1 „erledigt"), nach Important 1 an keinem
getrackten Ort steht.

**Nicht betroffen — geprüft:** Die Teil-6-Arithmetik geht weiterhin auf. Teil 6 zählt das
Verzeichnis, nicht die Urheberschaft: `_actions/` hat nach diesem Branch 4 Dateien mit 7
Deklarationen (`buchung.ts` 3 · `check.ts` 1 · `gate.ts` 1 · `sitzung.ts` 2), Teil 5 liefert die
restlichen 14 mit 40 → **18 Dateien / 47 Deklarationen**, exakt die Sollliste in
`teil6.md:6626-6645` (`buchung.ts: 3` stimmt zeichengleich). `_lib/actionErgebnis.ts` zählt korrekt
nicht mit. `_actions/guards.test.ts` steht weiter in der Eigenschaftsform und toleriert das Wachstum
bewusst (`guards.test.ts:296-301`); seine Kommentarzahlen (47 = 44 + 3, 18/19) stimmen. Und Teil 6
misstraut den Zählungen beider Nachbarpläne ohnehin ausdrücklich (`teil6.md:6612-6617`).

**Fix.** In `teil5.md` an T113 denselben Vorzieh-Vermerk setzen, den T114 schon trägt, und §6
(`:498`) auf 14/40 korrigieren. Alternativ vollständig über die Übergabe-Datei aus Important 1.

---

### Important 3 — Die Falle-16-Kostenaussage widerspricht dem Schema *und* dem Test zwölf Zeilen weiter

**Fundstellen:**
- `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts:14-19`
- `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts:141-144`
- `src/app/m/lagerbuch/_actions/gate.test.ts:144-145`

gegen `src/app/m/lagerbuch/_db/schema.ts:412-413` und
`src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.test.ts:154-186`.

**Befund.** Drei eingecheckte Stellen tragen die Aussage:

> „Ein Code, der einmal eingeloest wurde, ist NICHT MEHR LOESCHBAR, sondern nur noch sperrbar
> (loeschen.ts:89-99). Ein cross-origin-Redirect verbrennt damit einen laminierten Gegenstand, ohne
> dass jemand eine Sitzung bekommen haette" (`tokenEinloesung.ts:14-17`)

Das Schema aus Teil 1 sagt das Gegenteil, und zwar als ratifizierte Entscheidung:

> „NULL = „nie eingeloest". Reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und (nach Entscheidung
> 8-F) auch ohne Einfluss auf **Loeschbarkeit**." (`_db/schema.ts:412-413`)

Am schärfsten wird es **innerhalb derselben Datei**: `tokenEinloesung.test.ts:141` heißt
„SCHREIBT `lastUsedAt` — und genau das macht Falle 16 teuer", `:154` heißt „**BLEIBT NACH DER
EINLOESUNG EINLOESBAR** — dasselbe Kaertchen, zweite Schicht" — und dessen Kommentar (`:156-160`)
zitiert `schema.ts:412` als die Entscheidung, die den ersten Titel widerlegt. Der Code ist richtig
und getestet (`:180-186`: zweiter `redeemToken`-Aufruf, `ok === true`); falsch ist nur die
Begründung, die dreimal danebensteht. `loeschen.ts:89-99` ist zudem eine Herkunftsmarke in die
**Alt-Anwendung**; im neuen Modul existiert die Datei nicht.

**Was es sichtbar macht.** Das Ledger hat den Widerspruch als „⚠️ PLANWIDERSPRUCH für T82" notiert
(`progress.md:69-71`, mit der Auflage „Die Falle-16-Kostenaussage gehört vor T82 einmal gegen 8-F
gestellt"). T82 lief; sein Review hat den Posten als „Kreuz-Task-Notiz, keine Beanstandung gegen T82"
weitergereicht (`progress.md:266`) — korrekt für ein task-enges Review, und damit hat ihn niemand
geschlossen. Genau die Konstellation, für die dieses Abschluss-Review da ist.

**Die betriebliche Folge.** Die falsche Prämisse ist die *angegebene Begründung* für zwei bindende
Konstruktionsentscheidungen: den relativen `Location` in `t/[code]/route.ts` (§7.2.3) und die
Stellung des Host-Riegels vor `redeemToken`. Wer später prüft, ob der relative `Location` noch nötig
ist, liest die Begründung, findet sie durch `schema.ts:412-413` widerlegt — und kann folgerichtig
schließen, die Auflage sei entbehrlich. Damit kehrt Falle 16 zurück, obwohl die *echte* (geringere,
aber reale) Kostenaussage weiterhin trägt: der Code wird auf fremdem Host eingelöst, ohne dass jemand
eine Sitzung bekommt.

**Fix.** Die drei Kommentare auf die heutige Rechtslage stellen: `lastUsedAt` beeinflusst weder
Gültigkeit noch Löschbarkeit (8-F); der Schaden eines cross-origin-Redirects ist eine
**Einlösung ohne Sitzung**, kein verbranntes Kärtchen. Den Verweis `loeschen.ts:89-99` als
Alt-App-Marke kenntlich machen. Die beiden Konstruktionsentscheidungen bleiben unverändert richtig —
nur ihre Begründung wird tragfähig.

---

## 3. Triage der zurückgestellten Minors aus `progress.md`

Rund 90 `minor (deferred)`-Zeilen. Drei Eimer.

**(a) Zu Recht zurückgestellt, bleibt Minor — die große Mehrheit (~70).** Berichtshygiene
(Zahlendreher, veraltete Zeilennummern, Mutationszählungen), tautologische Zugaben neben tragenden
Zusicherungen, Abdeckungsbreite ohne Defekt am heutigen Code, randscharfe Vakuum-Riegel
(`toBeGreaterThanOrEqual(9)` bei genau 9). Keine davon rechtfertigt eine Merge-Verzögerung.

**(b) Geprüft und *entkräftet* — die Kette löst sich auf.**

- **Tap-Maß 56px (`.beenden` 44px, `.rueckweg` 44px, Fahrzeugzeile ~42,75px).** Von fünf Reviews
  (T64, T69, T76, T78, T80) je einzeln als „nicht mein Task" vertagt — das sah nach dem klassischen
  Blindfleck aus. **Ist es nicht.** Die bindende Regel lautet „Tap-Maß 56px an jeder **±-Fläche**"
  (`teil4.md:458`), und die Spec ist genauso eng: §7.7.3 heißt „56px Tap-Maß gegen die Dichte der
  Zählliste", `spec:8323` sagt „Suite-Tap-Maß **an den ±-Flächen**". Gedeckt sind damit
  `.stepTaste`/`.stepWert` — und die tragen 56×56 (`helfer.module.css:241-248`). `.beenden` und
  `.rueckweg` sind keine ±-Flächen; mit 44px erfüllen sie zudem WCAG 2.5.5 AA. Die wiederholte
  Formulierung „Querschnittsregel: Tap-Maß 56px an **jeder Fläche**" im Ledger ist ein Zitierfehler,
  der sich über fünf Tasks fortgepflanzt hat. **Kein Handlungsbedarf; die Kette gehört geschlossen,
  nicht abgearbeitet.** Einzig die Fahrzeugzeile (~42,75px, `helfer.module.css:193-196`) liegt knapp
  unter 44px — als eigenständiger a11y-Posten, nicht als Planverstoß.
- **`grund:"netz"` serverseitig (Vorab-Befund 5).** Durch B4 vollständig aufgelöst, alle drei Beine
  verifiziert (siehe §1). Erledigt.
- **`NETZ_TEXT_GATE` außerhalb der `NETZ_TEXT_*`-Familie.** Kein Widerspruch: der Kopf von
  `_lib/gateTexte.ts:1-2` beansprucht „die **vier Gate-Texte** an genau einer Stelle" — das sind die
  `GateGrund`-Texte, nicht die Netzsätze; `Gate.tsx:63-66` begründet die Trennung ausdrücklich. Beide
  Seiten dokumentiert.

**(c) Zur Weitergabe, nicht zur Behebung.** `public/login-bg.jpg` trägt denselben Falle-56-Fall wie
die drei PNG ihn hatten (`progress.md:328`) — real, außerhalb des Umfangs, gehört als Posten in die
Übergabe aus Important 1. Ebenso T6-4 (Routenzahl 14 vs. gemessen 11).

---

## 4. Minors aus diesem Review

1. **`_ui/CheckFlow.tsx:57` — `CheckPos.fahrzeugBestand` ist tot.** Maschinell über alle exportierten
   Typen der Produktivdateien des Branches geprüft: **die einzige** Eigenschaft ohne jede Verwendung
   außerhalb ihrer Deklaration. Der Weg ist vollständig gebaut —
   `_lib/lesepfade/fahrzeuge.ts:135` rechnet sie, `helfer/check/page.tsx:113` reicht sie durch,
   `helfer/check/page.test.tsx:437` nagelt sie in der Feldliste fest — und `CheckFlow.tsx` liest sie
   nie. T79 meldete sie als tot mit „wird von T85 gefüllt" (`progress.md:229`); T85 füllt sie jetzt,
   und tot ist sie immer noch. Kein Mangel: der Zählschirm zeigt laut Spec-Skizze (`spec:8266-8272`)
   nur `Soll` und den Stepper, und den Fahrzeugbestand *nicht* zu zeigen ist gegen Anker-Effekte
   sogar richtig. **Der Grund, es überhaupt zu notieren:** `helfer/check/page.test.tsx:437` nagelt die
   Feldliste inklusive der toten Eigenschaft fest. Damit ist sie testtragend geworden — wer sie später
   entfernt, muss eine Zusicherung anfassen, die mit der Entfernung nichts zu tun hat. Das ist die
   Form, in der Ballast dauerhaft wird.
2. **`_lib/hostRiegel.ts` und `_lib/actionErgebnis.test.ts` stehen in keiner Eigentümertabelle**
   (über alle drei Pläne gegrept: null Treffer). Beide sind sachlich richtig entstanden
   (`hostRiegel.ts` löst Befund 43 und ersetzt fünf Kopien; die Testdatei gehört zur vorgezogenen
   Typdatei). Kein Konflikt mit Teil 5/6, keine Arithmetikwirkung. Gehört in die Übergabe, damit
   `_lib/host.ts:52-67` (§2.6-Tabelle, beschreibt den Aufruf jetzt transitiv) und ein späterer
   §2.6-Grep nicht ins Leere laufen.
3. **`ohneKommentare()` liegt in 24 Kopien** — semantisch identisch (nachgemessen), also N-5-konform
   in der Sache. Die Form skaliert aber schlecht: `_actions/guards.test.ts` und `_lib/format.test.ts`
   (beide Vorbestand, außerhalb dieses Diffs) führen bereits **je eine abweichende Variante**. Wenn
   Teil 5 weitere ~15 Testdateien bringt, ist der Export aus einem `_lib/testhelfer.ts` die billigere
   Antwort als die 40. Kopie.
4. **Der Host-Riegel steht noch zweimal inline** (`t/[code]/route.ts:38`, `abmelden/route.ts:51`)
   statt über `hostAbweisung()`. Beide Auslassungen sind begründet (bei `t/[code]` folgen fünf
   weitere Schritte, `abmelden` ist eine fremde Task-Datei) und im T86-Bericht offengelegt.
5. **Kein `hostRiegel.test.ts`** für die neue geteilte Sicherheitszusage. Vertretbar — die drei
   Zeilen sind über zehn Verhaltenstests ausgeübt —, aber es ist die Stelle, an der ein künftiger
   Umbau leise durchginge.

---

## 5. Ergebnis

**Spec-Treue: ja.** Die Weichen-Verschärfung (E9), der Reihenfolge-Scan (B2), die Login-Reparatur
(B3), die Auflösung von Befund 5 (B4) und die Abrufprobe sind gebaut und belegt. Die
Action-Arithmetik von Teil 6 geht nach dem Vorziehen unverändert auf (18/47, nachgerechnet).

**Qualität: Nachbesserung nötig** — nicht am Code. Alle drei Important-Befunde sind Dokumentation
bzw. Begründungstext; der eingecheckte Code ist in allen drei Fällen korrekt und getestet. Zwei
davon (1 und 2) sind reine Merge-Vorbereitung und in einer Sitzung erledigt; der dritte sind drei
Kommentare.

Was ein task-enges Review strukturell nicht sehen **konnte**, war in allen drei Fällen dasselbe: die
Befunde leben zwischen Dateien, die nie zusammen in einem Diff lagen — bzw., bei Important 1, in
Dateien, die in **keinem** Diff lagen.
