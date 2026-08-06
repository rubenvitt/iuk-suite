# Abschluss-Review Teil 4 — Blickrichtung Testgüte über den ganzen Branch

Branch `feat/lagerbuch-modul-teil4`, 44 Commits, `b1254e5..49a77c6`, 63 Dateien,
+16.056/−31 Zeilen. Referenzlauf: `pnpm vitest run src/app/m/lagerbuch
src/components/login-form.test.tsx` → **80 Dateien, 1293 bestanden, 1 übersprungen,
0 rot** (der eine übersprungene ist das beabsichtigte `it.runIf` für
`g/[code]/page.tsx`, Teil 6).

Alle Befunde unten sind **Testgüte**. Der Branch enthält nach dieser Prüfung
keinen Produktionsfehler, den ich benennen könnte.

---

## Zuerst: was tatsächlich getragen wird

Der Auftrag verwies auf Teil 3, wo dreiundzwanzig Testkörper grün blieben, ohne
ihre Zusage zu tragen. Die acht dort gelernten Muster habe ich über **alle 28
geänderten Testdateien mechanisch** gefahren. Sieben davon sind hier
**restlos abgestellt**, und zwar nicht durch Zufall, sondern durch eine Praxis,
die ich im Folgenden belege — das gehört vor die Mängelliste, weil es die
Grundlage der Kalibrierung ist.

**1. `it()`-Rümpfe ohne `expect`: null.**
Klammer-gematchte Extraktion aller `it(`/`test(`-Körper über alle 28 Dateien →
kein einziger Rumpf ohne `expect(`.

**2. `toEqual` mit `undefined`-Eigenschaft: null.**
Acht Treffer auf `: undefined` — **alle acht sind Kommentare über die Falle**,
kein einziger ist eine Zusicherung. `pwa.route.test.ts:159` benutzt `toStrictEqual`
und schreibt dabei ehrlich dazu, dass es an dieser Stelle **nachgemessen keinen
Unterschied macht** (die Nutzlast läuft durch `JSON.stringify`, das `undefined`
verschluckt) — die engere Form bleibt als Form stehen, nicht als Zusage. Das ist
genau die Ehrlichkeit, deren Fehlen Teil 3 teuer gemacht hat.

**3. `for`-Schleifen über Selektoren ohne Mengen-Untergrenze: null.**
Jede DOM-Schleife trägt ihren Riegel, jeweils mit einem Kommentar, der die
Vakuität benennt:
`CheckFlow.test.tsx:665` (`toBe(5)`), `HelferRahmen.test.tsx:379` (`toBe(3)`),
`HelferRahmen.test.tsx:151` (`links.length` → `toBe(2)`),
`FahrzeugWahl.test.tsx:143` (`toBe(2)`), `t/[code]/route.test.ts:409`
(`orte.length` → `toBe(5)`), `helfer/check/page.test.tsx:504` (Zähler `geprueft`
→ `toBe(3)`, obwohl die Schleife über ein Literal läuft und gar nicht leer sein
kann).

**4. Die 24 Kopien von `ohneKommentare()` sind behavioral identisch.**
Automatisch geprüft: alle 24 Vorkommen (`page.test.tsx:22`, `bauform.test.ts:97`,
`check.test.ts:51`, `gate.test.ts:43`, … bis `pwa.route.test.ts:32`) normalisieren
auf **genau eine** Variante. Das war in den Task-Reviews zweimal als Abweichung
gemeldet worden (Ledger, T69/T70 M-6); es stimmt heute nicht mehr — die Kopien
sind zusammengeführt. Damit gibt es keine Datei, deren Scans still anders filtern
als die des Nachbarn.

**5. Die `toContain`-Falle „grün, weil die Zeichenfolge nur im Kopfkommentar
steht" ist gezielt bearbeitet — und zwar messbar richtig.**
Ich habe **jeden** Rohtext-Positivscan des Branches gegen die
kommentarbefreite Quelle nachgerechnet:

| Zusicherung | roh | `ohneKommentare` | Bewertung |
|---|---|---|---|
| `actionTypen.test.ts:34` (`import type { SperrGrund }`) | ✓ | ✓ | trägt Code |
| `actionTypen.test.ts:35-37` (`export type HelferGrund = …`) | ✓ | ✓ | trägt Code |
| `actionTypen.test.ts:46` (`"eingabe" … safeParse`) | ✓ | **✗** | Kommentar-Zusage, **nicht deklariert** → Minor |
| `actionTypen.test.ts:153` (`netz … nie serverseitig`) | ✓ | ✗ | Kommentar-Zusage, ausdrücklich so gewollt |
| `check.test.ts:704` (`scope_lagerort_id`) | ✓ | ✗ | Kommentar-Zusage, ausdrücklich so gewollt |
| `t/[code]/route.test.ts:454` (`x-forwarded-host`) | ✓ | ✗ | Kommentar-Zusage, ausdrücklich so gewollt |

Drei der vier kommentargetragenen Scans schreiben wörtlich dazu, dass sie den
**Rohtext mit Absicht** lesen und dass die Zusage die **Anwesenheit des
Kommentars** ist. Das ist keine Lücke, sondern eine benannte Bauform. Der vierte
(`actionTypen.test.ts:41-47`) ist derselbe Fall **ohne die Deklaration** — siehe
Minor.

**6. Der Rest-Leck von `ohneKommentare()` ist nachgemessen folgenlos.**
Die Funktion leert nur Zeilen, die **mit** `//` beginnen; ein **nachgestellter**
`//`-Kommentar überlebt und könnte einen Positivscan tragen. Ich habe alle
Zeilen aufgelistet, die nach dem Filter noch einen nachgestellten Kommentar
tragen: **23 Stück** über alle Produktionsdateien des Branches
(`check.ts:120/123/124/198/212/255`, `gate.ts:52`, `sitzung.ts:57/152`,
`BarcodeScanner.tsx:107`, `Entnahme.tsx:76`, `Restzeit.tsx:49/53/54/55`,
`a/[artikelId]/page.tsx:66`, `page.tsx:30/57`, `t/[code]/route.ts:50/55`, …).
**Keine einzige** enthält einen Bezeichner, den ein Positivscan sucht
(`requireLagerbuchHost`, `istLagerbuchAdmin`, `redeemToken`, `falte`,
`lagerbuchHostOderNull`, `Record<AmpelTon`). Das Leck ist real, greift hier aber
nirgends.

**7. Schwellen sind auf BEIDEN Seiten festgenagelt.**
Die 30-Minuten-Schwelle war genau die Stelle, an der die erste Fassung „hohl"
war (Intervall [29 min, 35 min) wäre grün geblieben) — und **beide** Kopien sind
nachgeschärft worden, in eigenen Commits (`9a5352b`, `4094d36`):
Client `Restzeit.test.tsx:130` (30:00 warnt) und `:144` (30:01 warnt noch nicht,
eine Minute später doch); Server `HelferRahmen.test.tsx:311`/`:331` dieselben
zwei Punkte. Damit sind `<=` vs. `<` und der Zahlenwert selbst gefangen. Der
Ledger-Eintrag „die sofortige `pruefen()`-Prüfung ist von keinem Test getragen"
(T67) ist mit dem 30:00-Test **eingelöst** — dieser Test kann nur über die
sofortige Prüfung grün werden.

**8. Vakuum-Riegel sind die Regel, nicht die Ausnahme.**
`bauform.test.ts:716` (≥5), `:778` (≥50), `:794` (≥50), `:846` (≥2), `:1119` (≥7),
`rahmen.test.tsx:224/226`, `HelferRahmen.test.tsx:454/456`,
`FahrzeugWahl.test.tsx:184/186`, `pwa.route.test.ts:197/209`,
`HelferChip.test.tsx:110`. Von den mengenbasierten Scans des Branches fehlt er
**an drei Stellen** — und genau die stehen unten.

**9. Der Abnahme-Commit `49a77c6` hat die Eigenschaftsform dort verlassen, wo sie
zur Dauer-Attrappe geworden wäre**, und schreibt die Restmenge namentlich auf
(Weichen-Block → Existenzpflicht für zwei von drei Dateien, `it.runIf` statt
frühem `return` für die dritte, damit der Lauf ÜBERSPRUNGEN statt BESTANDEN
meldet; B2-Block → Existenzpflicht auf `flaechen()` statt auf `existsSync`, weil
eine Fläche, die ihr `redeemToken(` verliert, sonst still aus allen drei Tests
fällt). Das ist die genaue Klasse von Fehler, die ein task-enges Review nicht
sehen kann, und sie ist hier von innen gesehen worden.

**10. Der einzige Ordnungs-Fixture-Test des Branches trennt wirklich.**
`CheckFlow.test.tsx:405-427` (greedy Nachfüllvorschlag): `sp-1` und `sp-2` sind
in **jedem** Feld gleich außer `id`/`fachLabel`, beide mit `soll:5`,
`handlagerBestand:2`. Die Zusicherung `toEqual(["2","0"])` ist positionsscharf —
sowohl eine umgekehrte Vergabereihenfolge (`["0","2"]`) als auch eine gleichmäßige
Aufteilung (`["1","1"]`) macht sie rot. Der Fall „Fixture zeigt in dieselbe
Richtung" liegt hier also **nicht** vor.

---

## Befunde

### Wichtig 1 — `HelferChip.test.tsx:196`: der Scan verbietet weniger, als sein Titel sagt

`src/app/m/lagerbuch/_ui/HelferChip.test.tsx:190-196`

```
it("benutzt ein vollstaendiges Record, KEINE Interpolation und KEINEN Index-Zugriff auf `s`", …
    expect(q).not.toMatch(/s\[`/);   // kein s[`chip-${…}`]
```

Der Titel verbietet **jeden** Index-Zugriff auf `s`; das Muster fängt nur die
**Backtick**-Form.

**Mutation, die sie überlebt.** In `_ui/HelferChip.tsx:49`
`${s.chip} ${KLASSE[ton]}` → `${s.chip} ${s[ton]}` (das `KLASSE`-Record bleibt
stehen). Alle 12 Zusicherungen der Datei bleiben grün: unter Vitest ist das
CSS-Modul ein Proxy, `s["rot"]` liefert `_rot_…`, `schluessel()` gewinnt daraus
`rot`, `DEKLARIERT.has("rot")` ist `true`, und `regelKoerper(CSS,"rot")` enthält
`--lb-ampel-rot-text`/`-flaeche`. `not.toMatch(/\$\{ton\}/)` greift nicht,
`toMatch(/Record<AmpelTon, string>/)` greift weiter.

**Was damit verloren geht.** Genau die Zusage, derentwegen die Datei existiert —
`HelferChip.tsx:18-20`: „DESHALB EIN VOLLSTAENDIGES `Record<AmpelTon, string>`
und kein Index-Zugriff. … sobald jemand einen fuenften Ton einfuehrt, wird
`typecheck` rot — statt dass ein Chip farblos rendert." Nachgeprüft: Next
deklariert `*.module.css` als `{ readonly [key: string]: string }`, `s[ton]`
typecheckt also für **jeden** `AmpelTon`. Ein fünfter Ton (§6.6.2 führt `grau`
bereits außerhalb der Rangfolge — die Menge ist nicht eingefroren) renderte dann
`class="undefined"`: Padding und Radius stehen, die Farbe fehlt, und „abgelaufen"
sieht aus wie „kein Wert gepflegt". Realistischer als der reine Ersatz ist die
Fassung `KLASSE[ton] ?? s[ton]` — sie besteht **auch** den `Record`-Positivscan.

**Fix.** `expect(q).not.toMatch(/\bs\[/);` — die Datei enthält keinen anderen
`s[`-Zugriff, der Scan bleibt grün und deckt danach beide Formen.

*Im Ledger als T70 M-1 zurückgestellt; ich stufe ihn hoch, weil die Zusage die
Existenzberechtigung der Datei ist und der Fix zwei Zeichen kostet.*

---

### Wichtig 2 — `bauform.test.ts:524-534`: der Träger-Vertrag prüft das Präfix, nicht die Auflösbarkeit — und hat keinen Vakuum-Riegel

`src/app/m/lagerbuch/_lib/bauform.test.ts:524-534`

```
const fremde = [...lies().matchAll(/var\(\s*(--[\w-]+)/g)]
  .map((t) => t[1]!)
  .filter((n) => !n.startsWith("--lb-") && !/^--font-(display|body|mono)$/.test(n));
expect([...new Set(fremde)], "nur --lb-* und die drei --font-* sind erlaubt").toEqual([]);
```

Zwei Mutationen überleben sie:

**(a) Ein `--lb-*`, das niemand deklariert.** `color: var(--lb-tinte2);` in
irgendeine Regel von `helfer.module.css` → grün. Der Filter fragt das **Präfix**
ab, nicht die **Deklariertheit**. Das ist wörtlich der Ausfall, den der Test in
seiner eigenen Begründung benennt (`:526-529` und der Blockkopf `:481-484`): „eine
nicht aufloesbare CSS-Variable ist gueltiges CSS und faellt auf `transparent`
zurueck". Ein Tippfehler oder eine in Teil 5 neu eingeführte, aber nur unter
`.modul` deklarierte Variable ist damit unsichtbar. Nachgemessen ist der Stand
heute sauber (20 benutzte Variablen, alle 20 unter `.rahmen`/Dunkelzweig
deklariert, dazu die drei erlaubten `--font-*`) — die Lücke ist latent, nicht
akut.

**(b) Die leere Menge.** `expect([…]).toEqual([])` ist grün, wenn die Datei gar
kein `var(` mehr enthält. Ersetzt jemand beim „Aufräumen" alle
`var(--lb-…)`-Aufrufe durch Literalfarben, meldet der Lauf eine bestandene
Prüfung, und der ganze Zweck des Blocks — dass `_ui/BarcodeScanner.tsx` unter
`.rahmen` **und** unter `.modul` denselben Satz vorfindet (§Teil 5, T138) — ist
still weg. Dies ist der **einzige** mengenbasierte Scan der Datei ohne
Untergrenze; die fünf Nachbarn (`:716`, `:778`, `:794`, `:846`, `:1119`) haben
alle eine.

**Fix.** Die deklarierte Menge aus dem `.rahmen`-Körper und dem Dunkelzweig
einsammeln (die beiden Tests darüber lesen sie ohnehin schon) und
`genutzt ⊆ deklariert ∪ {--font-display,--font-body,--font-mono}` zusichern,
dazu einen **echten Vakuum-Riegel**, keine Ist-Stand-Marke:
`expect(genutzt.size).toBeGreaterThanOrEqual(10)`. Ausdrücklich **nicht** `20` —
das wäre exakt der heutige Messwert einer Datei, die T64 gehört, also dieselbe
Stolperdrahtleine, die ich unten an `HelferChip.test.tsx:110` als Schwäche
notiere. Der Riegel soll die leere Menge fangen, nicht die Zahl festschreiben.

*Im Ledger als T64 zweifach zurückgestellt (Untergrenze; Präfix statt
Deklariertheit). Beide Hälften gehören zusammen behoben.*

---

### Wichtig 3 — `bauform.test.ts:752-764` und `:809-820`: die beiden einzigen antd-/Router-Riegel des öffentlichen Astes haben keinen Vakuum-Riegel, und ihre Begründung ist seit T87 falsch

`src/app/m/lagerbuch/_lib/bauform.test.ts:752-764` (antd/`@ant-design/icons`)
und `:809-820` (`useSearchParams`/`router.push`)

Beide sammeln ihre Dateimenge selbst ein
(`["_ui","helfer","a","t"].flatMap(quellDateien)` + `page.tsx`) und enden auf
`expect(verstoesse).toEqual([])` — **ohne** eine Untergrenze auf `dateien`. Ihre
unmittelbaren Nachbarn, die dieselbe Sammelfunktion benutzen, haben eine
(`:778` und `:794`, jeweils `≥50`, mit dem Kommentar „leere Dateimenge — der Scan
waere leer-gruen").

**Mutation / Betriebsfall, der sie sichtbar macht.** Jede Änderung, die die
Astliste von der Platte entkoppelt: eine Umbenennung von `_ui/` oder `helfer/`,
ein zusätzlicher Ausschluss in `quellDateien()`, eine Verschiebung der Weiche
`a/[artikelId]` — beide Scans melden dann „bestanden" über **null** Dateien.

**Wie viel dann wirklich ungedeckt wäre, habe ich ausgezählt statt behauptet.**
Elf der zwölf `_ui/*.tsx` tragen einen **eigenen** antd-Scan
(`ArtikelSuche.test.tsx:303`, `BarcodeScanner.test.tsx:649`,
`CheckFlow.test.tsx:1198`, `Entnahme.test.tsx:427`, `FahrzeugWahl.test.tsx:167`,
`Gate.test.tsx:353`, `HelferChip.test.tsx:211`, `HelferRahmen.test.tsx:426`,
`Stepper.test.tsx:193`, `rahmen.test.tsx:144`/`:201` für `OeffentlicherRahmen`
und `LeerZustand`) — für die fiele ein leerer Modulscan nicht auf. **Sieben der
achtzehn Dateien haben keinen:** `_ui/Restzeit.tsx`, `page.tsx`,
`helfer/page.tsx`, `helfer/layout.tsx` (gar keine eigene Testdatei),
`helfer/check/page.tsx`, `a/[artikelId]/page.tsx`, `t/[code]/route.ts`. Das ist
**genau** der Ast, den der Scan in seiner eigenen Begründung nennt: „An der
Ordnergrenze `_ui/` zu enden hiesse: ein `import { Card } from "antd"` in
`helfer/entnahme/page.tsx`, `a/[artikelId]/page.tsx`, `t/[code]/route.ts` oder
`page.tsx` liefe durch" (`:729-733`). `core/shell/icons.test.ts` fängt repo-weit
nur die **Icons**, nicht `antd` selbst; `typecheck`, `lint` und `build` sehen
nichts (Falle 41: 96px Überlauf gegen `100dvh` plus Verwaltungsanmutung auf dem
Telefon). Beim Router-Scan `:809-820` ist das Bild ähnlich: eigene Scans haben
nur `ArtikelSuche.test.tsx:293`, `CheckFlow.test.tsx:1191`,
`Entnahme.test.tsx:435`, `FahrzeugWahl.test.tsx:170` und
`a/[artikelId]/page.test.tsx:464`.

**Dazu eine Textstelle, die inzwischen falsch ist.** Beide Blöcke tragen noch
„⚠️ EIGENSCHAFTSFORM: die Menge ist heute 0 Dateien … Zaehne ab Welle 3"
(`:744-746` und `:807-808`). Gemessen sind es heute **18 Dateien**. Der
Abnahme-Commit `49a77c6` hat den Dateikopf ausdrücklich korrigiert („Der Satz
‚ALLE Scans stehen in der Eigenschaftsform' ist seither FALSCH") und den
Weichen- sowie den B2-Block auf Existenzpflicht gehoben — diese beiden hier hat
er übersehen. Wer die Stelle liest, hält den Scan für harmloser, als er ist:
genau die Wirkung, gegen die der Commit-Text argumentiert.

**Fix.** In beiden Blöcken je eine Zeile —
`expect(dateien.length, "leere Dateimenge — der Scan waere leer-gruen").toBeGreaterThanOrEqual(18);`
— und die zwei überholten Eigenschaftsform-Absätze auf den heutigen Stand
bringen.

---

## Minors

- **`_lib/bauform.test.ts:716` — die Untergrenze `≥5` des Feldschrift-Scans zählt
  Regeln mit, die gar keine Schriftgröße tragen.** Nachgemessen: 7 Regeln
  gezählt, davon **5** mit `px`-Schriftgröße (`.codefeld`, `.stepWert`,
  `.verfallZeile input`, `.feld`, `.suchfeld`), 2 ohne (`.verfallZeile`, der
  `:focus-visible`-Sammelselektor). Mutation: die `font-size` aus `.codefeld` und
  `.stepWert` entfernen → `geprueft` bleibt 7 ≥ 5, `verstoesse` bleibt `[]`, der
  Lauf meldet „5 Feldregeln geprüft", und zwei Zifferfelder fallen auf die
  geerbte Größe (iOS-Auto-Zoom-Falle). Sauberer wäre, nur Regeln **mit**
  Schriftangabe zu zählen. *(Ledger, T64)*
- **`_lib/actionTypen.test.ts:41-47` — Kommentar-Zusage ohne die Deklaration, die
  ihre drei Geschwister tragen.** Nachgemessen: `/["`]eingabe["`][\s\S]{0,400}safeParse/`
  trifft **ausschließlich** im Kopfkommentar von `actionTypen.ts` (roh ✓,
  `ohneKommentare` ✗). Das ist zulässig — `check.test.ts:699-705`,
  `t/[code]/route.test.ts:446-455` und `actionTypen.test.ts:148-154` machen
  dasselbe und schreiben jeweils „⚠️ ROHTEXT, mit Absicht" dazu. Hier fehlt der
  Satz. Betriebsfall: wer die Scans „vereinheitlicht" und `ohneKommentare()`
  vorschaltet, macht den Test deterministisch rot, und die naheliegende Reparatur
  ist das Löschen der B4-Begründung. Zweitens pinnt die 400-Zeichen-Fenstermarke
  „an der Definition" nicht — derselbe Satz irgendwo sonst in der Datei erfüllt
  sie auch.
- **`_ui/Restzeit.test.tsx:176-181` — der Aufräum-Test misst nur, DASS
  `clearInterval` gerufen wurde.** Mutation: in `Restzeit.tsx:55`
  `return () => clearInterval(takt)` → `return () => clearInterval(0)` (oder eine
  Refactor-Fassung, die das Handle über eine Ref verliert) → Spion gerufen, Test
  grün, Takt läuft weiter — genau der Ausfall, den der Test in seinem eigenen
  Kommentar benennt („laeuft der Takt pro Navigation ein weiteres Mal"). Schärfer:
  nach dem Unmount Timer vorspulen und „kein weiterer Zustandswechsel" zusichern.
  *(Ledger, T67)*
- **`pwa.route.test.ts:249-250` — `expect(symbole.length).toBe(4)` kann
  konstruktiv nie fehlschlagen**: das Array ist eine Zeile darüber als Literal
  gebaut. Der Branch verbietet diese Form selbst (Commit `49a77c6`: „eine
  Zusicherung, die konstruktiv nie fehlschlagen kann, ist selbst eine der drei
  verbotenen Formen"). Harmlos als Stolperdraht für Bearbeiter, aber die einzige
  Stelle des Branches, an der die Form **ohne** einen benannten anderen Träger
  steht — die Geschwister (`actionErgebnis.test.ts:159/167/176/184/193`,
  `rahmen.test.tsx:300`, `HelferRahmen.test.tsx:416`) hängen alle an einem
  `@ts-expect-error` und nennen `pnpm typecheck` ausdrücklich als Träger.
- **`_ui/ArtikelSuche.test.tsx:172-177` — der Umlaut-Test übt keinen Umlaut.**
  Nadel „wärme" ist bereits klein, Heuhaufen „Wärmedecke B-11": `falte` ist
  `toLowerCase()` und faltet nur `W→w`; das `ä` ist auf beiden Seiten identisch.
  Der Test ist verhaltensgleich mit `:126` („KOMPRESSE") und überlebt jede
  Änderung an einer Umlautbehandlung. Die echte Grenzaussage tragen `:186`
  („`ae` wird NICHT auf `ä` gefaltet") und der Mock-Test `:200`. *(Ledger, T71)*
- **`_ui/HelferChip.test.tsx:110` — `toBeGreaterThanOrEqual(74)` ist keine
  Untergrenze, sondern der exakte Ist-Stand einer FREMDEN Datei.** Nachgerechnet:
  `helfer.module.css` deklariert heute genau 74 Klassen; nach unten ist null
  Spielraum. Entfernt T64 oder ein späterer Task eine beliebige, fachlich
  überflüssige Klasse, geht dieser Test rot und schickt den Suchenden in die
  falsche Datei. Der Kommentar daneben nennt den Wert selbst „BEWUSST eine
  UNTERGRENZE" — als Untergrenze wirkt er nicht. Eine Zahl mit Luft (etwa 40)
  fängt „Regex kaputt, Menge leer" genauso. *(Ledger, T70 M-2)*
- **`_actions/gate.test.ts:258` / `_actions/sitzung.test.ts:299` —
  `toBeGreaterThan(0)` auf `maxAge` ist unerreichbar rot**: die Zeile davor
  sichert `toBe(helferGueltigkeitSekunden())` zu, und `helferSitzungStunden` hat
  `min: 1`. *(Ledger, T73)*
- **`_actions/gate.test.ts:259` — `opt.httpOnly === true` bliebe für jedes
  `gate.ts` grün, das `helferCookieOptionen(...)` mit irgendeinem Argument ruft.**
  Die Zusage gehört `helferSitzung.test.ts` und steht dort. *(Ledger, T73)*
- **`_actions/gate.test.ts:174-187` — der Sperrpfad sichert nicht zu, dass er
  weder Cookie setzt noch umleitet.** Die beiden `beforeEach`-Sammelarrays stehen
  bereit; zwei Zeilen (`expect(stand.cookies).toEqual([])`,
  `expect(stand.umleitungen).toEqual([])`) machten „Schritt 2 endet den Weg"
  vollständig. *(Ledger, T73)*
- **`_lib/barcode.ts` — `/\/g\/([^/?#]+)/` trifft `/g/` als Teilstring, nicht als
  verankertes Pfadsegment**, und `barcode.test.ts` übt den Fall nicht
  (`https://alt.example/log/g/SN-1` → `SN-1`). Plan-vorgegebener Code, wörtliche
  Übernahme war Pflicht. Dazu der Tippfehler „Gaeraet" in `barcode.ts:24`.
  *(Ledger, T62)*
- **Ledger-Triage, außerhalb der Testgüte, aber vor dem Merge zu entscheiden:**
  (a) `_ui/helfer.module.css` gibt `.beenden` und `.rueckweg` `min-height: 44px`,
  während das Tap-Maß des Plans 56px ist (`core/theme/tokens.ts:33`,
  „Bedienung mit Handschuhen … eine Einsatzanforderung, keine Stilfrage") — und
  `.rueckweg` ist das **einzige** Bedienelement auf dem öffentlichen
  Leerzustands-Bildschirm. Kein Scan sieht es; plan-vorgegeben. (b) Der
  Schreibvorgang in `redeemToken` ist kein Compare-and-Set: zwischen `.get()` und
  `.run()` kann prozessübergreifend eine Sperrung committen und eine 12-Stunden-
  Sitzung für ein gerade gesperrtes Kärtchen entstehen (heute low risk, weil
  better-sqlite3 in einem Prozess läuft). Beides sind die einzigen zwei
  zurückgestellten Minors mit einem echten Betriebsfall; alle übrigen
  `minor (deferred)`-Zeilen des Ledgers halte ich für zu Recht zurückgestellt.

---

## Urteil

**Spec-treu:** ja. Die dokumentierten Abweichungen vom Plan sind durchweg an der
Stelle begründet, an der sie stehen, und mehrere davon (Befund 7 Umlautfaltung,
Befund 8 `trim()`, Befund 9 Riegelposition, Befund 41 acht statt sieben
Manifest-Werte, Befund 43 `hostAbweisung`, Befund 49 elf statt vierzehn Routen)
korrigieren nachgemessene Fehler des Plans, statt den Testkörper an den Code zu
biegen.

**Qualität:** Nachbesserung nötig — drei Zusicherungen, jede mit genannter
Mutation, jede in wenigen Zeilen zu schließen:

1. `_ui/HelferChip.test.tsx:196` — `not.toMatch(/s\[`/)` fängt nur die
   Backtick-Form; `${s.chip} ${s[ton]}` überlebt alle 12 Tests.
2. `_lib/bauform.test.ts:524-534` — der `--lb-*`-Scan prüft das Präfix statt der
   Deklariertheit **und** hat als einziger mengenbasierter Scan der Datei keinen
   Vakuum-Riegel.
3. `_lib/bauform.test.ts:752-764` und `:809-820` — keine Untergrenze auf der
   selbst eingesammelten Dateimenge; für sieben der achtzehn Dateien (der ganze
   `helfer/`-, `a/`-, `t/`- und Wurzel-Ast) ist das der einzige antd-Riegel, und
   die Begründungsabsätze („die Menge ist heute 0 Dateien") sind seit T87 falsch.

Keine davon deckt einen heutigen Produktionsfehler zu; alle drei sind Netze, die
im nächsten Umbau reißen würden, ohne rot zu werden.
