# Abschlussreview Teil 6 — `9bf928d..47d4b7a`

**Gegenstand:** das Review, das PR #39 ausgelassen hat. Nachgeholt vor dem Cutover.
**Prüflinse:** Plan §3 (J1–J13), §4, §5, §8, §9 vollständig · `CLAUDE.md` (sieben Fallen) ·
Alt-Anwendung `lagerbuch @ ca04eb1` als Vergleichsgrundlage für die 1:1-Verträge.
**Vorwissen (nicht wiederholt):** T174, T175, T176-A/B.

**Disk-Abgleich:** Der Prüfstand ist der Diff (`47d4b7a`). Der Branch steht vier Commits weiter
(`443ddb0`, `407075e`, `133e6ba`, `fe49511`). Diese vier fassen nur `checks/**`,
`e2e/lagerbuch-verwaltung.spec.ts`, `e2e/seed-lagerbuch.ts` und Dokumente an — **keine** der 54
Teil-6-Dateien außer `e2e/seed-lagerbuch.ts`. Jeder Fund unten ist am **Arbeitsbaum-Stand**
nachgelesen, nicht nur am Diff. Kein Fund ist zwischenzeitlich behoben.

**Kein Testlauf gefahren** (Vorgabe). Wo ich etwas gemessen habe, steht die Messung dabei.

⚠️ **Diese Datei liegt selbst im gitignorierten Baum** (`.superpowers/sdd/.gitignore:1` ist `*`).
Was daraus für den Bericht folgt, steht in I5; was daraus für **ihn selbst** folgt: wer die
Befunde überleben lassen will, muss sie auf das Board oder ins Runbook heben, nicht hier liegen
lassen.

---

## Stärken

Das ist unter den saubersten Portierungen, die ich gesehen habe. Konkret und mit Belegen:

**1. Die drei Sicherheitszusagen halten an der Sache, nicht nur im Kommentar.**
`grep` über den gesamten `(druck)`-Baum und `_db/etiketten.ts`: `resolveHost`, `x-forwarded` und
`APP_BASE_URL` kommen **ausschließlich in Verneinungen im Kommentar** vor
(`_db/etiketten.ts:48,53`). Es gibt genau **eine** `moduleUrl`-Aufrufstelle im ganzen Modul
(`_db/etiketten.ts:57`). Beide Riegel stehen in `(druck)/layout.tsx:50-51` zeichengleich zu
`(arbeit)/layout.tsx`, und beide antworten über `notFound()` mit **404** (`_lib/host.ts:49`,
`_lib/zugang.ts:257`), nie 403.

**2. Die einzige Zusicherung, die die Layout-Kopplung sehen kann, ist ein echter Abruf — und sie
prüft beide Nichtzugangs-Fälle.** `e2e/lagerbuch-etiketten.spec.ts:146-165`: angemeldet **ohne**
Gruppe → `404`, und `expect(etiketten.status()).toBe(artikel.status())`, plus Inhaltsnachweis
„kein Code im Klartext". Direkt daneben `:168-179` der **anonyme** Fall → `/login`, mit
ausgeschriebener Begründung, warum hier die URL und nicht der Statuscode trägt. Das ist die
Stelle, an der ein weggeräumter „doppelter" Riegel den Bogen mit Klartext-Codes öffentlich
machen würde — und sie ist besetzt.

**3. Der QR wird dekodiert, nicht gemustert.** `_db/etiketten.test.ts:94-103` liest den
erzeugten SVG **zurück** und vergleicht die Nutzlast zeichengleich. Genau der Mangel des
Bestands (`lagerbuch/e2e/etiketten.spec.ts:13`, ein `toHaveAttribute("src", /^data:image/)`) ist
damit behoben, nicht portiert. Ergänzt um `:107-110` (der Bindestrich überlebt),
`:115-118` (SVG statt Data-URL) und `:126-129` (kein `[object Promise]`).

**4. Die Geometrie hat EINE Wahrheit und eine Bindung.** `druck.css` trägt die Millimeter als
CSS-Literale (unvermeidlich), `_lib/etikettMasse.ts` als Werte — und `druck.test.ts:197-201,
214-215, 258-263, 272-275` vergleicht den **CSS-Text gegen die TS-Konstanten**, nicht gegen im
Test abgeschriebene Zahlen. Eine dritte Abschrift ist zusätzlich verboten:
`EtikettenBogen.test.tsx:263` („hält keine Millimeterwerte in der Insel").

**5. Die „heikelste Zeile" des Plans ist beidseitig festgenagelt.**
`druck.test.ts:254-264` zerlegt das Stylesheet in Bildschirm-Teil und `@media print`-Block und
verlangt `gap: 2mm` **dort** und `gap: 0` **hier**. Analog `:268-276` für
`opacity: .35` gegen `display: none`. Ein Test, der nur „irgendwo steht `gap`" geprüft hätte,
wäre die naheliegende und wertlose Fassung gewesen.

**6. Der CSV-Vertrag ist auf Byte-Ebene zugesichert, nicht auf Textebene.**
`csvBestellung.test.ts:94-99`: `Buffer.from(...)`, `bytes[0]` ist nicht `0xEF` (kein BOM),
kein `0x0D` (kein CRLF), aber `0x0A` vorhanden. Dazu die zeichengleiche Beispielausgabe
(`:73-80`) und — die Zeile, die den 9-C-Fehler ausschließt — `:46-49`:
`expect(csvZelle(-3)).toBe('"-3"')` **und** `.not.toContain("'")`. Die Kopfzeile hat ihre
eigene Gegenprobe (`:69-71`).

**7. U+00D7 wird über den Codepoint geprüft, nicht über ein eingefügtes Zeichen.**
`bestellText.test.ts:28`: `expect(text.codePointAt(...)).toBe(0x00d7)`. Damit fällt genau der
Fall auf, in dem Quelle **und** Test dasselbe falsche Zeichen tragen und sich gegenseitig
bestätigen.

**8. `guards.test.ts` nagelt fest, WELCHER Riegel wo steht — nicht nur die Summen.**
`:522-534` verlangt `["buchung.ts#bucheEntnahmeHelfer", "check.ts#checkAbschluss"]`
**namentlich** und `admin` mit `toHaveLength(42)`. Die naheliegende Mutation (auf einer
Verwaltungs-Action `requireLagerbuchAdmin` → `requireHelferSchreibend`) lässt 47/44/3/18/19
unverändert und färbt trotzdem rot. Dazu die **invertierte Allowlist** `:284-313`: statt vier
weiterer Erkennungs-Regexe wird jede unbekannte `export`-Bauform gemeldet — laut statt still,
und das ist die richtige Versagensrichtung.

**9. `bauform.test.ts` ist geschrumpft, weil Deckung dazukam.** Die 68 entfernten Zeilen sind
der `NOCH_NICHT`/`it.runIf`-Block; `g/[code]/page.tsx` steht jetzt unbedingt in `PFLICHT`
(Diff 2892–3041). Ein Test, der bei fehlender Datei „übersprungen" meldete, ist durch einen
ersetzt, der rot wird. Die Mutation ist laut Ledger gefahren worden (3 echte Fehlschläge).

**10. A14 ist der Beleg dafür, dass die E2E-Schicht ihr Geld verdient hat.** Der Inline-Style
`style={{display:"flex"}}` auf demselben Element wie `lb-nichtDrucken`
(`EtikettenBogen.tsx:80`) hätte die Bedienleiste **mitgedruckt** — auf gekauftem Material, ohne
dass irgendein Gate es zeigt. Gefunden vom ersten echten `emulateMedia({media:"print"})`-Lauf,
behoben auf **Klassenebene** (`!important` im Druck-Stylesheet, `druck.css:143-145`), und die
Zusicherung wurde **mitgezogen** statt verbogen (`druck.test.ts:128-132`).

**11. Die E2E-Vorbedingungen sind harte Untergrenzen, keine defensiven Übersprünge.**
`etiketten:38,62,79` · `mobil:250-253,303-305,364,375` · `export:82` · `hosts:76,221` — jede mit
Begründungstext, jede rot bei fehlendem Seed. `.first()` kommt in allen fünf Dateien nur in
Kommentaren vor. Datenbank-Zusicherungen sind **differenziell** gegen den im Test selbst
gelesenen Ausgangswert (`helfer:121,133-134` · `hosts:220,229,246-249`), überleben also
`--repeat-each`.

**12. Die Maskierungsfalle im Druck-Test ist gesehen und umgangen.**
`etiketten.spec.ts:82-97` prüft das Kästchen auf `nth(1)`, weil `nth(0)` unter einem bereits
per `display:none` versteckten Label säße — dort wäre `toBeHidden()` aussagefrei. Am Bauteil
verifiziert (`EtikettenBogen.tsx:56-63`): Kachel ist das `<label>`, Kästchen ein Kind.

**13. Der Excel-Pfad ist gegen die eingefrorene Alt-Anwendung nachgeschlagen, nicht angenommen.**
Ich habe `verwaltung/(arbeit)/artikel/ArtikelTable.tsx:142-166` Zeile für Zeile gegen
`lagerbuch/src/app/verwaltung/(admin)/artikel/ArtikelTable.tsx:87-147` gehalten: neun Spalten in
Reihenfolge, Breiten, `zahl`-Flags, `header: { value, fontWeight: "bold" }`,
`stickyRowsCount: 1`, Blattname `Bestand Handlager`, dynamischer Import beim Klick — alles
zeichengleich. Auch der Dateiname:
`bestandExport.ts:74-81` gegen `lagerbuch/src/lib/bestand-export.ts:55-57` — identisch, samt
Bildung im **Browser**. Die einzige Änderung ist die, die der Plan verlangt: `EXCEL_SPALTEN`
verlässt das `"use client"`-Modul (Falle 6), und `EXCEL_FEHLERTEXT` kommt als **Rückgabewert**
statt als `e.message` (Falle 66).

**14. `error.tsx` hält J7 vollständig.** Kein antd, kein Icon, eigenes CSS-Modul, `reset()`-Prop,
und **kein** `error.message`/`error.digest` im Markup (`error.tsx:39-85`) — Falle 66 ist damit
strukturell ausgeschlossen, nicht nur beschrieben.

---

## Funde

### Critical (muss behoben werden)

**Keine.** Ich habe die Sicherheits-, Byte- und Riegelzusagen an der Sache geprüft; keine davon
ist gebrochen.

### Important (sollte behoben werden)

---

**I1 · Der Etikettenbogen hat keine Obergrenze — unbegrenzt, ungecacht, und die QR-Nutzlast steht zweimal in derselben Antwort**
`src/app/m/lagerbuch/_db/etiketten.ts:64-65` · `verwaltung/(druck)/etiketten/page.tsx:9,74`

```ts
const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();   // kein LIMIT
const toks = db.select().from(tokens).where(eq(tokens.aktiv, true)).all();
```
```tsx
export const dynamic = "force-dynamic";                            // kein Cache davor
<EtikettenBogen artikel={daten.artikel} tokens={daten.tokens} />   // "use client"
```

**Was falsch ist — der harte Teil zuerst.** Die Seite hat **keine Obergrenze**: sie liest alle
aktiven Artikel und alle aktiven Codes, erzeugt für **jeden** einen QR-Code und rendert alle auf
**eine** Seite. Sie ist `force-dynamic`, es gibt also keinen Cache davor — jeder Aufruf macht die
Arbeit vollständig neu. `qrSvg` ist CPU-gebunden, und `Promise.all` (`_db/etiketten.ts:72-87`)
reiht N davon in denselben Tick.

**Dazu ein Verdoppler auf der Antwortgröße:** `EtikettenBogen` trägt `"use client"` (`:1`) und
bekommt die fertigen SVG-Zeichenketten als Props. Sie stehen damit sowohl im gerenderten HTML
als auch im RSC-Flight-Payload für die Hydration.

**Gemessen** (`qrcode` aus diesem Repo, Level H, margin 4, URL 51 Zeichen): **2.901 Byte je SVG**.

| aktive Artikel + Codes | HTML | + Flight | Summe je Aufruf |
|---|---|---|---|
| 100 | 0,3 MB | 0,3 MB | **0,6 MB** |
| 300 | 0,8 MB | 0,8 MB | **1,7 MB** |
| 800 | 2,2 MB | 2,2 MB | **4,4 MB** |
| 2000 | 5,5 MB | 5,5 MB | **11,1 MB** |

**Warum es zählt — und warum gerade jetzt.** Die Unbegrenztheit ist 1:1 aus dem Bestand geerbt
(`lagerbuch/src/db/etiketten.ts:16-25`, ebenfalls ohne `LIMIT`), sie ist also **kein
Regressionsfehler**. Zwei Dinge sind neu, und beide zeigen genau vor einem Cutover:
(a) der Bogen läuft jetzt im **geteilten Suite-Container** neben vier anderen Modulen — ein
CPU-Spike beim Erzeugen von N QR-Codes trifft `portal`, `files`, `feedback` und `qr` mit;
(b) die Artikelzahl nach dem **Datenimport aus der Alt-Anwendung** ist heute unbekannt, die
Demodaten sagen darüber nichts. Bricht die Seite erst nach dem Import, bricht sie am
schlechtesten Tag.

**Wie es zu beheben ist.**

*Zuerst und unabhängig von allem anderen:* die Artikel- und Token-Zahl der **Alt-Datenbank
messen** und als Zeile ins Runbook, neben R30. Diese eine Zahl entscheidet, ob der Rest
überhaupt Arbeit ist.

*Zur Verdopplung:* ⚠️ Der naheliegende Griff — die Kacheln serverseitig rendern und als
`children` in die Insel reichen — **behebt sie nicht.** Server-gerenderte Kinder, die in eine
Client-Komponente hineingereicht werden, landen als Element-Beschreibungen im Flight-Payload,
`dangerouslySetInnerHTML`-Prop inbegriffen; die Kopie entsteht durch das **Überqueren der
Grenze**, nicht durch die Form der Prop. Die Doppelung fällt nur, wenn das SVG die Client-Grenze
**gar nicht** überquert. Zwei Wege, die dafür in Frage kommen und die **zu prüfen, nicht zu
glauben** sind:

- **Auswahl rein über CSS.** Das Markup ist bereits `<label>` mit verschachteltem
  `<input type="checkbox">` (`EtikettenBogen.tsx:56-63`) — genau die Form, die
  `label:has(input:not(:checked))` bedient. Abblenden am Bildschirm und `display:none` im Druck
  würden reines CSS; als Insel bliebe nur der Zähler `Drucken (n)`, und der braucht kein SVG.
  Zu prüfen ist, ob die Geometriezusagen aus §9 dabei zeichengleich bleiben — der
  `druck.test.ts`-Scan hängt an `.lb-etikettAbgewaehlt`, das dann anders entstünde.
- **QR über eine Route** (`<img src="/…/qr/<id>.svg">`). Jedes SVG erscheint dann **null**mal
  inline; der Preis sind N Anfragen und ein neuer, riegelpflichtiger Route Handler.

Ist die gemessene Zahl vierstellig, gehört zusätzlich eine Seitenteilung in die Übergabe an
Spec 2 — dann trägt kein Bogen mehr „alle aktiven Artikel", und das ist eine Fachentscheidung,
keine Optimierung.

---

**I2 · Die gedruckte QR-Modulgröße sinkt um 29 % — und der im Plan benannte Rückfall holt das nicht ein**
`src/core/qr/index.ts:24-28` (unverändert, richtig) · Plan §9 „Der QR kommt aus `core/qr`
(Level H, `margin: 4`)" · Plan §5 „der optionale `margin`-Parameter ist der benannte Rückfall aus
A-J2"

**Was falsch ist.** Die Alt-Anwendung erzeugte den Etiketten-QR mit
`QRCode.toDataURL(text, { margin: 1, width: 200 })` (`lagerbuch/src/db/etiketten.ts:11`) — also
mit dem Bibliotheks-Default **Level M** und **margin 1**. Der Port nimmt bewusst die
Suite-Konfiguration: **Level H, margin 4**. Die Etikettenfläche für den Code bleibt aber
zeichengleich bei **20 mm × 20 mm** (1:1-Pflicht 22).

**Gemessen** (`QRCode.create` aus diesem Repo):

| | URL | Version | Module | + Rand | **Modulgröße bei 20 mm** |
|---|---|---|---|---|---|
| ALT Artikel (M, margin 1) | 51 | 4 | 33 | 35 | **0,571 mm** |
| NEU Artikel (H, margin 4) | 51 | 6 | 41 | 49 | **0,408 mm** (−29 %) |
| ALT Token (M, margin 1) | 37 | 3 | 29 | 31 | **0,645 mm** |
| NEU Token (H, margin 4) | 37 | 5 | 37 | 45 | **0,444 mm** (−31 %) |

**Warum es zählt.** Das ist die eine Zusage des Plans, die „auf Papier lebt" und für die es
ausdrücklich **keinen Test** gibt (§6, letzte Zeile: „Kein Test — Runbook-Zeile R30"). Die
Geometrie ist zeichengleich portiert, die **Codedichte darin nicht** — und das ist genau die
Sorte Änderung, die erst der Probebogen zeigt. 0,408 mm liegt an der unteren Kante dessen, was
Handykameras auf Laserdruck zuverlässig lesen; jede Verlängerung der Artikel-URL schiebt die
nächste QR-Version nach und drückt weiter.

Der eigentliche Fund ist aber nicht die Zahl, sondern der **Rückfall**: §5 nennt `margin` als
den einen Knopf, den man bei einem gescheiterten Probebogen drehen darf. Das reicht nicht.
`margin 4 → 1` bei unverändertem Level H ergibt 41 + 2 = 43 Module → **0,465 mm**, immer noch
unter dem Altwert von 0,571 mm. Wer nach R30 nur am Rand dreht und wieder scheitert, hat keinen
zweiten benannten Knopf und improvisiert dann unter Zeitdruck.

**Wie es zu beheben ist.** Kein Codeeingriff. Die R30-Zeile im Runbook muss **beide** Stellräder
nennen und die Rangfolge festlegen: erst `margin` (4 → 2 → 1), dann — und nur, wenn das nicht
reicht — die Fehlerkorrekturstufe für **diesen einen Erzeugungsweg** (H → Q → M), mit dem
ausgeschriebenen Preis (weniger Toleranz gegen Verschmutzung auf einem Etikett, das in einem
Fahrzeug klebt). Die Zahlen oben gehören mit in die Zeile, damit niemand sie noch einmal messen
muss. **Alternativ und besser:** der Probebogen wird vor dem Freeze gedruckt und mit dem
Diensthandy gescannt, nicht danach — dann ist die Entscheidung kein Cutover-Schritt mehr.

---

**I3 · `e2e/lagerbuch-helfer.spec.ts:403-405` schreibt undeklariert in `lagerort_verfall` und räumt nicht auf**

```ts
await page.getByLabel(/^Verfall E2E Check Kompressen/).fill("2026-09");
```

**Was falsch ist.** Die Kette ist nachgelesen, nicht vermutet (Zeilenanker am **Arbeitsbaum**
geprüft — `e2e/seed-lagerbuch.ts` ist die einzige der 54 Dateien, die sich nach `47d4b7a` noch
bewegt hat): `_actions/check.ts:299` →
`setzeVerfall(...)` → `_lib/schreibpfade/lagerortVerfall.ts` mit `onConflictDoUpdate`, **ohne
Historie und ohne Rücknahme**. Gelesen wird die Zeile von
`verwaltung/(arbeit)/verfall/page.tsx:24` (`nurWarnend: true`) und von
`_lib/lesepfade/fahrzeuge.ts:66`. `monatsEnde("2026-09")` liegt bei Laufdatum 11.08.2026 rund 50
Tage entfernt, also unter `LAGERBUCH_VERFALL_GELB_TAGE = 56` → **warnend**, in beiden Lesarten
des Monats.

**Warum es zählt.** `e2e/seed-lagerbuch.ts:50-62` führt `E2E_VERFALL_FERN = "2090-01"`
ausdrücklich **deshalb** ein: „dann stuenden die Helfer- und Check-Artikel mit in der
Verfallsliste … und eine als ‚enthaelt' geschriebene Zusicherung bliebe dabei gruen, waehrend
die Liste sich still verdoppelt." Dieser Test führt genau diesen Zustand von der anderen Seite
wieder ein — über eine Tabelle, die der Seed nicht anfasst. Playwright fährt **einen** Worker
gegen **eine** SQLite-Datei. Der Spec-Kopf deklariert die `checks`-Zeile (`:395`),
`lagerbuch-hosts.spec.ts:196-203` deklariert `last_used_at` — **dieser** Schreibvorgang ist
nirgends deklariert. Heute latent, weil keine Spec `/verwaltung/verfall` liest; rot für die
erste, die es tut, und dann mit einer Ursache in einer **anderen Datei**.

**Wie es zu beheben ist.** Entweder `loescheVerfallFuer(...)` in einem `afterEach`/`finally`
(analog zum `sperre(t.id, true)`-Muster derselben Datei), oder — billiger und in der Absicht des
Seeds — den Testwert auf einen **nicht warnenden** Monat legen (`2090-09`) und die Zusicherung
gegen den geschriebenen Wert statt gegen die Warnwirkung führen. In jedem Fall gehört die
Datenwirkung in den Spec-Kopf, wo die beiden anderen schon stehen.

---

**I4 · `e2e/lagerbuch-mobil.spec.ts:301-322` misst das Tapmaß enger als die Zusage, die es tragen soll**

```ts
const knoepfe = page.locator("button");
  [...document.querySelectorAll("button")]
    .filter((z) => z.w > 0 && z.h > 0)
    .filter((z) => z.h < 44)
```

**Was falsch ist.** Der Docstring (`:283-288`) nennt `e2e/files-mobil.spec.ts:377-401` als
Bauform. Das Vorbild misst `a[href], button, input, textarea, select` und **beide** Kanten:
`(z.w > 0 || z.h > 0) && (z.w < 44 || z.h < 44)`. Hier fällt durch: (a) jeder Knopf, der 44 px
**hoch**, aber schmaler ist — also genau die Icon-only-Zeilenaktion, für die §7.7.2 existiert
(`BestellListe.tsx:124-132` rendert eine: `<Button shape="circle">`); (b) **jede** `<a>`-Aktion
und jeder Modulnav-Link, die auf `/verwaltung/bestellung` mitrendern.

**Warum es zählt.** Der Testname ist ehrlich („mindestens 44 px **hoch**"), die Zusage von
§7.7.2 ist es nicht — sie spricht vom Tapmaß, also von der Fläche. Die Lücke ist still: sie sieht
aus wie Deckung.

**Wie es zu beheben ist.** Selektormenge und Filter des Vorbilds übernehmen (eine Zeile je) und
den Testnamen auf „mindestens 44 × 44 px" ziehen. Die Vorbedingung `:301-305` prüft bereits
dieselbe Menge wie die Messung und muss mitwandern.

---

**I5 · Fünf Dateien außerhalb der Eigentümertabelle — §5 nennt sich „mechanisch prüfbar" und ist es nicht mehr**
`_lib/tokenForm.ts` · `_lib/tokenForm.test.ts` · `_ui/Chip.tsx` ·
`verwaltung/(arbeit)/journal/{JournalTable.tsx,JournalTable.test.tsx,page.tsx,page.test.tsx}` ·
`e2e/seed-lagerbuch.ts`

> ⚠️ **Dieselbe Klasse, die das parallele Abnahme-Review als Critical führt** („Beleg im
> gitignorierten Bericht, Behauptung im verfolgten Plan", dort an der §12.5-Tabelle in `133e6ba`).
> Ich leite sie hier nicht neu her — sie zählt in derselben Welle. Bei meiner Kalibrierung bleibt
> sie **Important** und nicht Critical, weil kein Code kaputt ist und mein Auftrag anders als der
> des Abnahme-Reviews keine Vorab-Einstufung „unbelegte Zeile = Critical" trägt. Der Objektbezug
> ist ein anderer: dort die §12.5-Tabelle, hier die Eigentümertabelle §5.

**Was falsch ist.** Ich habe die 54 geänderten Dateien gegen §5 und J10 (die sieben ERGÄNZT-
Zeilen) gehalten. Alles deckt sich — bis auf diese fünf Posten. Jeder hat eine Begründung, und
**jede Begründung steht ausschließlich in einer gitignorierten Datei**:
`git check-ignore -v` weist `progress.md` und `entscheidungen.md` über
`.superpowers/sdd/.gitignore:1` (`*`) als ignoriert aus — der gesamte `sdd`-Baum ist es. Der
Ledger sagt über sich selbst „Bericht ist Kladde, wird am Ende geloescht". Der **verfolgte** Plan
sagt derweil unverändert „Datei-Eigentümerschaft — **mechanisch prüfbar**" und „Jede Datei gehört
genau einem Task" und führt keine der fünf:

| Datei | Grund | Wo festgehalten | überlebt das Löschen der Kladde? |
|---|---|---|---|
| `_lib/tokenForm.ts` + Test | Ruling A1: Konstanten dürfen nicht aus `"use server"` exportiert werden | `progress.md` (ignoriert) + `guards.test.ts:352-358` | **ja**, im Testkommentar |
| `_ui/Chip.tsx` | Ruling A15: optionale `title`-Prop | `progress.md` (ignoriert) + `Chip.tsx:50-58` | **ja**, im Quellkommentar |
| `journal/**` (4 Dateien) | Ruling A15: `quelleId` durchreichen | `progress.md` (ignoriert) + `JournalTable.tsx:14-17` | **teilweise** — der Kommentar nennt A15, nicht die Eigentümer-Ausnahme |
| `e2e/seed-lagerbuch.ts` | Ruling A10: Artikelname auf 35 Zeichen | **nur `progress.md`** (ignoriert) | **nein** |

**Warum es zählt.** §5 ist nicht Prosa, sondern der **Mechanismus**, mit dem sechs Teilpläne
kollisionsfrei nebeneinander laufen — „Wer in einer fremden Datei arbeitet, hat den Schnitt
verlassen." Spec 2 (Datenumzug, Generalprobe, Cutover) erbt diese Tabelle. Wer sie liest, hält
`journal/**` weiterhin für unberührtes Teil-5-Gebiet und übersieht, dass dort seit A15 ein
**neues DOM-Attribut** steht. Der Ledger ist Kladde und wird laut eigenem Vermerk am Ende
gelöscht; die Rulings überleben dann nirgends.

Die A15-Änderung selbst habe ich geprüft und halte sie für **richtig**: der Bestand trug
`title={j.quelleId}` (`lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`), der Port
hatte sie verloren, und nach 8-F (Codes bleiben für immer belegt) ist die rohe Kennung die
Auskunft, die den Bestand prüfbar macht. Sie ist additiv (`Chip.tsx:59` optional, 58 andere
Aufrufstellen unverändert) und von einem Test gehalten (`JournalTable.test.tsx:114`).
**Eine Zeile gehört trotzdem in die Cutover-Doku:** für `quelleTyp === "token"` **ist**
`quelleId` der Zugangs-Code (`_db/quelle.ts:40`, `tokens.code` als Map-Schlüssel). Das Journal
ist damit ein **weiterer** Ort, an dem aktive Codes im Klartext im DOM stehen — dieselbe
Zielgruppe wie `/verwaltung/tokens` und der Etikettenbogen, also keine neue Vertrauensgrenze,
aber relevant für Screenshots, Bildschirmfreigaben und jeden künftigen Journal-Export.

**Wie es zu beheben ist.** §5 um die fünf Zeilen ergänzen, je mit dem Ruling-Kürzel (A1, A10,
A15) — das ist eine Dokumentänderung von zehn Minuten und die einzige, die den Mechanismus
rettet. Dazu die A15/Klartext-Zeile in die Runbook-Übergabe an Spec 2.

---

### Minor (nice to have)

**M1 · `_db/etiketten.test.ts:181-183` — der Name behauptet, der Körper nicht.**
```ts
it("erzeugt in diesem Fall gar keinen QR", async () => { … await expect(etikettenDaten(t.db)).rejects.toThrow(); });
```
Über den QR sagt die Zeile nichts; `:167-169` deckt den Wurf bereits ab. Entweder `qrSvg`
bespitzeln (`expect(qrSvg).not.toHaveBeenCalled()`) oder ersatzlos streichen. *(= T159s
deferred minor, am Arbeitsbaum nachgelesen: weiterhin offen.)*

**M2 · `BestellListe.test.tsx:454-467` — dem Fehlerfall fehlt die negative Vorabzusicherung, die sein Erfolgs-Zwilling hat.**
Der Zwilling `:439` schreibt `expect(document.body.textContent).not.toContain("Kopieren fehlgeschlagen")`
**vor** der Handlung; dieser Test nicht. Er bliebe grün, wenn jemand
`setFehler("Kopieren fehlgeschlagen")` eifrig direkt in `kopieren()` setzte statt im
`.catch()`-Zweig. Eine Zeile vor `ablehnen?.()`. *(= T166s deferred minor, verifiziert offen.)*

**M3 · `e2e/lagerbuch-etiketten.spec.ts:128-134` — der Dunkelmodus-Test hat keine Gegenprobe.**
```ts
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await expect(bogen).toHaveCSS("background-color", "rgb(255, 255, 255)");
```
Der Bogen trägt `#fff`/`#000` als Literal, für das es modulweit **keine** Dunkel-Überschreibung
gibt — die Zusicherung bestünde also auch, wenn `data-theme` gar nichts bewirkte. Eine Zeile,
die belegt, dass der Umschalter am selben Dokument **irgendetwas** verändert hat (etwa
`documentElement` oder ein antd-Element), macht daraus eine Aussage.

**M4 · `e2e/lagerbuch-etiketten.spec.ts:98` — `toBeHidden()` besteht auch bei fehlendem Element.**
`lb-drucken` wird in *diesem* Test nie zuvor als sichtbar nachgewiesen; verschwände das
`data-testid`, bliebe die Zeile still grün. Ein `toBeVisible()` vor dem `emulateMedia` schließt
das. Gleiches, schwächer, für `:97`.

**M5 · `verwaltung/(druck)/etiketten/page.tsx:53` und `:92` — „Zurück zur Übersicht" steht zweimal als Literal.**
Beide Vorkommen sind Wege zurück derselben Seite, und `_lib/zustandTexte.ts` existiert genau
dafür (es hält bereits `FEHLER_ZURUECK` und `etikettenDomainFehlt()` für diese Seite). Zwei
Wahrheiten für einen Satz, in einer Datei, die den Rest sauber importiert.

**M6 · `_lib/bestandExportSpalten.ts:49-55` — Texte in einem Spalten-Modul.**
`EXCEL_BLATTNAME` und `EXCEL_FEHLERTEXT` sind Anzeigetexte und liegen in der Datei, die es laut
eigenem Kopf ausschließlich wegen Falle 6 für die **neun Spalten** gibt. Damit hat das Modul
zwei Heimaten für Texte (`zustandTexte.ts` und diese). Kohäsion, kein Defekt.

**M7 · 40 byte-identische Kopien von `ohneKommentare()` unter `src/app/m/lagerbuch/`** (Teil 6
hat ~8 beigetragen: `csvBestellung.test.ts:135`, `bestellText.test.ts:69`,
`bestandExportSpalten.test.ts:21`, `druck.test.ts:78`, `etikettMasse.test.ts`,
`zustandTexte.test.ts`, `tokenForm.test.ts`, `EtikettenBogen.test.tsx`). Jede Kopie ist einzeln
begründet und die Konvention ist älter als dieser Teil (K-4, Regel 1) — deshalb Minor und **kein
Fund gegen Teil 6**. Für die Übergabe an Spec 2 ist es trotzdem eine Zahl, die man kennen sollte:
ein Fehler in diesem Parser ist ein Fehler an 40 Stellen. Ein `_lib/testhelfer/` (ohne
`"use client"`, ohne Laufzeitwirkung) wäre der Ort.

**M8 · Der leere Bestellvorschlag: zwei Knöpfe ohne Riegel, wo der dritte einen hat.**
`BestellListe.tsx:213-226` rendert „Liste kopieren (nur offene)" und „CSV (alle Zeilen)" ohne
`disabled`; `verwaltung/(arbeit)/bestellung/page.tsx:38` rendert die Insel unbedingt. Bei leerer
Liste lädt CSV eine Datei mit **nur der Kopfzeile**, und „Liste kopieren" meldet
`Bestellliste kopiert` für einen **leeren** String. Die Alt-Anwendung konnte diesen Zustand nicht
erreichen (`lagerbuch/.../BestellListe.tsx:15` stieg vorher aus). Der Excel-Knopf derselben Welle
hat den Riegel (`ArtikelTable.tsx:246`, `disabled={… || zeilen.length === 0}`) samt
ausgeschriebener Begründung — drei Knöpfe, zwei Regeln.

**M12 · `_lib/csvBestellung.ts:11-17` begründet das BOM-Verbot mit einem Abnehmer, der diese Datei nicht lesen kann.**
```
 * … und es verfehlte ausgerechnet die
 * Kopfzeilenerkennung des modul-eigenen Importers (./csv.ts:43-47, KOPFWORTE-Vergleich).
```
An der Quelle nachgelesen: `_lib/csv.ts:20` führt
`KOPFWORTE = ["name","einheit","fach","mindestbestand","startbestand"]` — der **Artikel**-Import,
fünf Spalten. `bestellvorschlag.csv` trägt sechs andere (`Artikel;Bestand;…`). Die beiden Mengen
sind **disjunkt**; der Importer weist die Datei schon am ersten Feld ab. Und er entfernt ein BOM
ohnehin selbst (`_lib/csv.ts:33`, `text.replace(/^﻿/, "")`).

Das **Verbot bleibt richtig** — es schützt den Abnehmer *außerhalb* des Repos, und genau das ist
1:1-Pflicht 28. Falsch ist nur der zitierte Fundort, und er ist die Sorte, die den nächsten Leser
in die Irre führt: wer prüft, ob der interne Importer betroffen ist, findet „nein" und schließt
daraus, das Verbot sei gegenstandslos. **Zugleich schließt derselbe Befund eine Frage, die ich
prüfen musste:** ein Export→Bearbeiten→Re-Import-Rundlauf von `bestellvorschlag.csv` ist
**nicht möglich**, also kann der Apostroph aus `csvTextZelle` (`csvZelle.ts:33`) — eine
Neuerung gegenüber dem Bestand, der `csvCell` einheitlich anwandte,
`lagerbuch/.../BestellListe.tsx:8,29-30` — auf diesem Weg **nicht** in einen Artikelnamen
zurückwandern. Zehnte Instanz der Fundort-Klasse; Halbsatz genügt.

**M13 · Die 8-F-Begründung in `_lib/tokenForm.ts:44-48` nennt die schwächere Hälfte.**
```
// … ein gedrucktes, nie eingeloestes Kaertchen konnte seinen Code also an ein
// spaeter ausgestelltes verlieren. Weil `tokens.code` zugleich der
// Anzeigeschluessel im Journal ist (1:1-Pflicht 6), erschienen historische
// Zeilen danach unter dem NEUEN Label.
```
An der eingefrorenen Alt-Anwendung nachgelesen: `pruefeToken`
(`lagerbuch/src/actions/loeschen.ts:89-98`) ließ den Hard-Delete **nur** zu, solange
`lastUsedAt` NULL war, und `lastUsedAt` wird bei der **Einlösung** gesetzt
(`lagerbuch/src/actions/token-redeem.ts:16`). Eine Buchung mit `quelleTyp: "token"` setzt eine
eingelöste Sitzung voraus. Ein löschbarer Code hatte damit per Konstruktion **keine**
Journalzeilen — die im Kommentar genannte Folge („historische Zeilen unter dem neuen Label")
war auf diesem Weg nicht erreichbar.

**Die Entscheidung 8-F ist trotzdem richtig, und der Grund steht im selben Absatz eine Zeile
weiter oben:** das **gedruckte, nie eingelöste Kärtchen**, das seinen Code an ein späteres
Token verliert. Das ist ein physisches Artefakt in einem Fahrzeug, und es ist genau der Schaden,
gegen den ein permanent belegter Namensraum hilft. Nur die Journal-Hälfte trägt nicht.

**Warum das über Kosmetik hinausgeht** — und deshalb steht es hier und nicht bei den
Berichtsnotizen: `tokenForm.ts:44-48` ist nach dem Löschen der Kladden die **einzige** schriftlich
überlebende Begründung für 8-F, und 8-F ist eine Fachentscheidung mit Runbook-Folge (R34,
Ankündigungspflicht). Wer sie in zwei Jahren prüft, prüft die falsche Hälfte, findet sie
unbelegt und kippt womöglich die richtige Entscheidung.

**Für den Cutover folgt daraus eine billige Paritätscheck-Zeile, kein Codeeingriff.** Die
Argumentation oben ruht auf dem `lastUsedAt`-Riegel des Alt-Codes; sie deckt **keine** von Hand
oder per SQL bearbeitete Datenbank. Ein `SELECT DISTINCT quelle_id FROM buchungen WHERE
quelle_typ = 'token'` gegen `SELECT code FROM tokens` in der **Alt**-Datenbank beantwortet es
endgültig: bleibt kein Rest, ist die Sache erledigt; bleibt einer, zeigt das Journal nach dem
Import Zeilen unter einem Label, das nie zu ihnen gehörte — und A15 macht diese Zeilen jetzt
**sichtbar** (roher Code im `title`), statt sie zu verbergen. Eine Abfrage, eine Zeile Protokoll.
Der Paritätscheck beweist ohnehin nur den Rundlauf, nicht die Feldzuordnung; das hier ist ein
zuordnungsförmiger Defekt und gehört deshalb dazu.

**M9 · Kleinigkeiten in `e2e/lagerbuch-helfer.spec.ts`:** `:131` `getByText(/gebucht/i)` ist eine
lose Teilstring-Probe, während dieselbe Datei `:213-215` ausdrücklich „der VOLLE Satz, nicht nur
ein Teilstring" verlangt. `:165`, `:257`, `:299`, `:319` — Aufräumen (`sperre(…, true)`,
`ctx.close()`) liegt nicht in `finally`; schlägt eine Zusicherung davor fehl, bleibt ein Code
gesperrt und nachfolgende Dateien sehen acht statt neun Etikettenkacheln.

**M10 · `e2e/lagerbuch-mobil.spec.ts:102,107,144` — Überlauf gegen `window.innerWidth` statt
`documentElement.clientWidth`.** `innerWidth` schließt die Scrollleiste ein und toleriert damit
bei klassischen Scrollleisten einen echten Überlauf in deren Breite. Aus
`files-mobil.spec.ts:348-366` geerbt, nicht neu; der Gegenbeleg im selben Repo ist
`e2e/lagerbuch-verwaltung.spec.ts:53-56` (`scroll === client`).

**M11 · `e2e/lagerbuch-mobil.spec.ts:248,267` — `.ant-select-input` als Ausschlussfilter.**
Kein Regelverstoß (verboten ist `.ant-*` als *Zusicherung*) und ungewöhnlich sorgfältig belegt
(`:194-229`). Benennt antd die Klasse aber um, wird der Ausschluss wirkungslos, ohne dass etwas
rot wird. `[readonly][role=combobox]` hinge am Verhalten statt am antd-Interna.

---

## Triage der aufgeschobenen und geparkten Funde

Alle `minor (deferred)`- und `parked`-Zeilen aus `progress.md`, vollständig, je mit Urteil.

| # | Ledger-Posten | Urteil |
|---|---|---|
| T156 | `223100c` isoliert grün / auf voller Suite rot; „vor dem PR quetschen" | **erledigt/gegenstandslos** — PR #39 ist gemergt, die Historie steht. Ein Rewrite gemergter Historie ist teurer als der `git bisect`-Nachteil. |
| T159 | `_db/etiketten.test.ts:181` behauptet mehr als es prüft | **aufs Board** (= M1). Verifiziert offen. |
| T160 a | `tokens.test.ts:561` Name verspricht mehr als der Körper | **aufs Board.** Deckung existiert (`:292`), nur der Name lügt. |
| T160 b | `tokens.test.ts:505/:521` Doppeldeckung zu `:325`/`:195` | **aufs Board.** Redundanz kostet Laufzeit, nichts sonst. |
| T160 c | drei Negativ-Scans über den Rohtext ohne Begründung | **aufs Board.** Bei `loeschen.test.ts:825` ist Rohtext sogar **stärker**; ohne Halbsatz stellt der nächste Leser sie „vereinheitlichend" um und schwächt sie. Halbsatz ergänzen, wenn die Datei ohnehin angefasst wird. |
| T160 d | `TokenTable.tsx:185` `<Flex>` mit nur noch einem Kind | **aufs Board** (kosmetisch, Entfernen könnte die Ausrichtung verschieben). |
| T161 | Commit-Nachricht `ede793c` sagt „drei Testfälle", es waren zwei | **erledigt/gegenstandslos.** Gemergte Commit-Nachricht, nicht korrigierbar ohne Rewrite. |
| T162 a | `EtikettenBogen.test.tsx:249-251` Kommentar ungenau | **aufs Board.** Versagensrichtung ist laut (spurios rot), nicht still. |
| T162 b | Weg-zurück-Link nur per Quelltext-Scan gepinnt, nicht am Markup | **erledigt.** T167/T175 haben den echten Abruf nachgeholt; `page.tsx:90-94` und `EtikettenBogen.tsx:74-76` sind beide belegt. |
| T163 a | `fehler.module.css:18-31` setzt keinen Seitengrund — weiße Karte auf weißem UA-Grund | **aufs Board, mit Nachdruck.** Der Zeiger auf T175 Schritt 4/5 ist eingelöst (der Abruf lief), die Abweichung vom Hausmuster (`not-found.module.css:30/68` setzt `--nf-grund`) bleibt. Kein Merge-Blocker: die Karte ist über ihren 1px-Rahmen lesbar. |
| T163 b | Rot bleibt im Dunkelmodus `#c8000f` statt `#ef404c` | **aufs Board.** Dekorative Kante ohne Bedeutungslast, kein Constraint-Bruch. |
| T163 c | `error.test.tsx:126` `loading.tsx`-Riegel liest nicht rekursiv | **vor dem Cutover beheben — ich widerspreche der Einstufung als Minor nicht, wohl aber der Reihenfolge.** Die Vorgabe lautet „Keine `loading.tsx`, **in keiner Route**"; der Riegel deckt genau ein Verzeichnis. Heute kein Verstoß (per `find` bestätigt), aber der Fix ist **eine Zeile** (`readdirSync` → rekursiv, das Muster steht in `druck.test.ts:63-70` fertig da). Ein Riegel, der seine eigene Aussage zu 5 % deckt, ist schlechter als keiner, weil er Deckung vortäuscht. |
| T163 d | Berichtslücke zu `:root[data-theme="dark"]` | **erledigt/gegenstandslos** (Bericht ist Kladde, Code ist richtig). |
| T164 | Benutzung von `SeitenKopf` von keinem Test gepinnt | **aufs Board.** War nicht Teil der Forderung; ein Rückbau auf nacktes `<h1>` wäre eine Typografie-Abweichung, kein Funktionsverlust. |
| T166 | `BestellListe.test.tsx` Fehlerfall ohne negative Vorabzusicherung | **aufs Board** (= M2). Eine Zeile; verifiziert offen. |
| T169 | Zeilenzitat `tokenEinloesung.ts:70` statt `:72` | **aufs Board.** Zehnte Instanz derselben Klasse; siehe Empfehlung 3. |
| T171 a | Falle-60-Test prüft Anzeige und Ziel-URL, nicht 303 + Location des Fehlerzweigs | **aufs Board.** Beide Zweige laufen durch dieselbe `antwort()`-Hilfe, der Erfolgszweig nagelt 303 fest. |
| T171 b | `:215` `toMatch(/^\//)` lässt `//fremder-host/pfad` durch | **vor dem Cutover beheben.** Der Fix ist `/^\/(?!\/)/` — ein Zeichen. Die Zusicherung heißt „Location ist **relativ**", und protokoll-relativ ist es nicht: es ist eine offene Weiterleitung. Heute nicht erreichbar, aber die Zusicherung ist genau der Wächter, der das *bleiben* lassen soll. Billigster Fix dieser Liste; ihn liegen zu lassen ist teurer als ihn zu machen. |
| T172 a | `guards.test.ts:276` Selbstverweis veraltet | **erledigt** — mit `a479606` auf Namensform umgestellt; am Arbeitsbaum nachgelesen (`:480-483` zitiert jetzt den Zusicherungsnamen, keine Zeilennummer). |
| T172 b | Verweis auf `bauform.test.ts:66-78` zeigt daneben | **aufs Board** (Vorbestand, DRK-192). |
| T172 c | Zusicherungsname „19. Datei des Ordners" verletzt A7 | **erledigt** — heißt jetzt „hat 18 Action-Dateien plus `guards.test.ts`" (`guards.test.ts:408`). |
| T172 d | `toHaveLength(3)` auf die Typ-Exporte von `detail.ts` deckelt keine Invariante | **aufs Board, und ich teile die Kritik.** `guards.test.ts:487` färbt rot, sobald jemand einen vierten legitimen Typ ergänzt — eine Zahl ohne Invariante dahinter. Die tragende Hälfte (`:488`, `actionsIn(...) === ["getDetail"]`) ist differenziell und genügt. Streichen, wenn die Datei ohnehin angefasst wird. |
| T173 | `g/[code]/page.test.tsx:292` zitiert die entfernte `NOCH_NICHT`-Schleife | **aufs Board** (DRK-192, Fundort-Klasse). Inhaltlich jetzt **stärker** gedeckt. |
| T174 | Bericht zitiert `devLogin` aus der falschen Datei | **erledigt/gegenstandslos** (Kladde). |
| T175 a/b/c | Plantabelle §7.1 driftet (307 statt 303, zwei Wortlaute) | **erledigt** — mit `129f0cc` nachgezogen; die Richtung (Tabelle folgt gemessenem Code) ist richtig. |
| T175 | Brief-Schritt 5 als Kommando unbrauchbar (`curl \| grep` findet clientseitig gerenderte Texte nie) | **aufs Board — gegen den Plan, nicht gegen den Code.** Der Satz steht weiterhin so im Plan; wer ihn unbesehen fährt, liest „nicht gefunden" und zieht den falschen Schluss. Ein Halbsatz („nur im Browser messbar") in §7.3 schließt es. |
| **T176-A** | **`parked`: W1 verlangt „jeder Fix ein eigener Commit", `a479606` bündelt F-6+F-7+F-8** | **Ruling bestätigt, kein Widerspruch.** Ich habe die Begründung geprüft und trage sie: alle drei sind Kommentar-/Namensfixes in **derselben** Datei, line-count-neutral, die Commit-Nachricht benennt alle drei einzeln. Der einzige genannte Nachteil — gezielter Revert von F-8 allein — ist bei einer Kommentaränderung ohne Wert, und die Behebung wäre ein Rewrite bereits gereviewter Historie auf einem gemergten Branch. **Aufs Board gehört er auch nicht; er ist erledigt.** |
| T176-A | Bericht beziffert 116 statt 115 Zeilen | **erledigt/gegenstandslos** (Kladde). |
| T176-B a | Plan-Zeile 118: Selbstverweis „siehe §2.3" innerhalb von §2.3, gemeint ist §2.2 | **aufs Board.** Die Entscheidung, ihn *nicht* im Vorbeigehen zu fixen, teile ich: genau so entstand der Falschverweis-durch-Falschverweis, den §16 gerade erst aufgelöst hat. Er gehört in eine Runde, die die Verweise **gesammelt** prüft — siehe Empfehlung 3. |
| T176-B b | §16-Warnblock verallgemeinert „§1–§15" als „gemessene Einzeltatsache" | **aufs Board.** Schwächt die Kernaussage nicht ab. |

**Zwei bereits angelegte Board-Posten, die ich hier ausdrücklich hochstufen möchte:**
`DRK-196` (offener Check erscheint als Check mit „0 Positionen") trägt in seiner eigenen
Begründung den Satz „nach dem Cutover nicht [harmlos]: der Datenimport aus der Alt-Anwendung
kann sie mitbringen". Das ist kein Board-Posten, das ist eine **Importprüfung**. Sie gehört als
Zeile in den Paritätscheck des Runbooks — die Alt-Datenbank **vor** dem Import auf offene Checks
zählen und die Zahl nach dem Import gegenprüfen. Der Paritätscheck beweist ohnehin nur den
Rundlauf, nicht die Feldzuordnung; das ist genau die Sorte Zeile, die er zusätzlich braucht.

---

## Empfehlungen

1. **I1 zuerst, weil es der einzige Fund mit unbekannter Größe ist.** Die Artikel- und
   Token-Zahl der Alt-Datenbank messen, bevor irgendetwas anderes entschieden wird. Ist sie
   dreistellig, genügt das Entdoppeln der Client-Grenze; ist sie vierstellig, gehört eine
   Seitenteilung in die Übergabe an Spec 2, und der Probebogen aus R30 wird ohnehin nur ein
   Ausschnitt sein.
2. **I2 als zwei benannte Stellräder ins Runbook**, mit den gemessenen Zahlen. Und den
   Probebogen **vor** den Freeze ziehen, nicht danach.
3. **Eine gesammelte Fundort-Runde statt zehn Vorbeigehen-Fixes.** Der Ledger zählt neun
   Instanzen derselben Klasse (veralteter `datei:zeile`-Anker), `DRK-192` beziffert ~47
   Fundstellen, und die neunte Instanz entstand, weil drei Beteiligte denselben Falschverweis
   durchgeschrieben haben. Die Lehre aus T173 („Kopfkommentar bewusst **zeilenneutral**
   umformuliert") ist die richtige und sollte Konvention werden: **Anker sind Namen, keine
   Zeilennummern.** Ein Scan, der `datei.ts:NN`-Muster in Kommentaren gegen die Datei prüft,
   wäre billiger als die zehnte Instanz — aber das ist eine Board-Aufgabe, kein Cutover-Schritt.
4. **Die zwei Einzeiler mitnehmen, die auf dem Board nur verrotten:** `T171 b`
   (`/^\/(?!\/)/`) und `T163 c` (rekursives `readdirSync`). Beide sind Wächter, die heute
   weniger halten, als ihr Name sagt.
5. **§5 nachziehen** (I5) — zehn Minuten, und der Mechanismus, auf dem Spec 2 aufsetzt, stimmt
   wieder. **In eine Welle mit dem §12.5-Befund des parallelen Abnahme-Reviews:** es ist dieselbe
   Klasse (Beleg im gitignorierten Bericht, Behauptung im verfolgten Plan), und beide Male ist die
   Behebung dieselbe Bewegung — die gemessene Zuordnung aus der Kladde in das Dokument heben, das
   überlebt. Wer nur eine der beiden zieht, lässt die Klasse stehen. Ein dritter Kandidat für
   dieselbe Welle sind M12 und M13: dort ist der Beleg nicht flüchtig, sondern **zeigt daneben** —
   ein zitierter Fundort, der die Aussage nicht stützt.
6. **Zwei Abfragen gegen die Alt-Datenbank, bevor importiert wird** — beide beantworten eine
   Frage, die der Paritätscheck strukturell nicht stellt (er beweist den Rundlauf, nicht die
   Feldzuordnung): die Zahl aktiver Artikel + Codes (I1) und der `quelleId`-Abgleich aus M13.
   Zwei `SELECT`s, zwei Protokollzeilen. Dazu, bereits auf dem Board und hier hochgestuft:
   `DRK-196` (offene Checks aus dem Import) gehört aus demselben Grund in dieselbe Liste.
7. **Vor dem Cutover einmal `pnpm exec playwright test` mit stabilem Netz**, wie der Ledger es
   selbst verlangt. Der letzte volle grüne Lauf (168 Tests) war auf `6beffdc`; danach hat der
   Zustand-27-Nachbau **Produktivcode** angefasst. T176-B meldet alle fünf Gates grün — die Zeile
   ist damit eingelöst; ich nenne sie nur, weil der Ledger zusätzlich Flakiness bei
   Parallelbetrieb protokolliert und der Cutover-Lauf allein stehen sollte.

---

## Bewertung

**Merge-fähig?** **Mit Korrekturen** (I1–I5).

⚠️ Zur Klarstellung, weil die Frage in diesem Fall zweideutig ist: **PR #39 ist bereits
gemergt.** „Mit Korrekturen" heißt hier also nicht „nachbessern, dann mergen", sondern: *der
Merge war vertretbar, ich fordere keine Rücknahme — aber I1 und I2 gehören vor den Cutover, nicht
auf das Board.* Kein Fund rechtfertigt einen Revert; keiner der fünf ist nach der Messung mehr
als ein halber Tag.

**Begründung:** Die drei Zusagen mit Schadenspotenzial — Basis-URL ausschließlich aus
`moduleUrl`, Verweigerung statt relativem QR, 404 statt 403 in **beiden** Group-Layouts — halten
an der Sache, und die einzige Zusicherung, die die Layout-Kopplung überhaupt sehen kann, ist ein
echter Abruf mit beiden Nichtzugangs-Fällen. Die byte-genauen Verträge sind byte-genau geprüft
(kein BOM über `bytes[0]`, U+00D7 über den Codepoint, `-3` mit eigener Gegenprobe), und die
Geometrie hat eine Wahrheit mit einer Bindung statt zweier Abschriften. Was offen bleibt, ist
zweierlei und beides zeigt erst auf Papier oder erst nach dem Datenimport: eine unbegrenzte,
doppelt serialisierte Bogenseite und ein QR, dessen Module 29 % kleiner geworden sind, ohne dass
der benannte Rückfall das einholt.
