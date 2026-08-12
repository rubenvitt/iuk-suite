# Vorab-Scan — Teil 6 (`2026-08-03-lagerbuch-modul-teil6.md`, 7571 Zeilen, T153–T176)

Gescannt am 10.08.2026 gegen den Arbeitsbaum auf `main @ 9bf928d` (Teil 1–5 gemergt).
Plan vollständig gelesen; alle `Consumes`-Symbole, alle harten Zahlen und alle
Ergänzungspunkte gegen das Repo nachgeschlagen.

**Bilanz: 11 bau-anhaltende Funde · 27 kosmetische · 22 geprüft und stimmig.**

⚠️ Alle Zeilenangaben „Plan:NNNN" beziehen sich auf
`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md`.

---

## Teil A — BAU-ANHALTEND

### A1 — T160: vier `export const` in `"use server"`-Dateien brechen drei Dinge zugleich

**Planstelle** (Plan:2551–2564, `Produces` von T160):

> ```ts
> // _actions/tokens.ts
> export const TOKEN_ALPHABET: "0123456789";
> export const TOKEN_ZIFFERN: 6;
> export const TOKEN_ZIEHUNGEN: 20;
>
> // _actions/loeschen.ts
> export const TOKEN_LOESCHGRUND: string;   // der Text, den der Dialog woertlich zeigt
> ```
> ⚠️ **Die Zahl der Actions ändert sich NICHT.** … Die **vier** neuen Exporte sind Konstanten,
> keine Actions

**Beleg 1 — der vorhandene Guard-Scan wird rot.**
`src/app/m/lagerbuch/_actions/guards.test.ts` (Teil 2, T20, heute grün) hat einen dritten Testfall
mit einer **Allowlist** über jede Zeile, die bei Spalte 0 mit `export` beginnt:

```
guards.test.ts:265  const ERLAUBT = [
guards.test.ts:266    /^export\s+(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*[(<]/, // die eine Action-Bauform
guards.test.ts:267    /^export\s+(?:type|interface)\s/, // `_actions/detail.ts` exportiert drei Typen (§2.1 a)
```

und im Kopfkommentar dazu wörtlich:

> ⚠️ EIN `export const FOO = 5` WIRD MITGEMELDET, UND DAS IST RICHTIG. Ein
> "use server"-Modul darf ausschliesslich async-Funktionen exportieren; ein
> Wert-Export dort ist selbst der Fehler. Konstanten gehoeren nach `_lib/`.

`export const TOKEN_ALPHABET = "0123456789";` trifft keinen der zwei erlaubten Ausdrücke → vier
Einträge in `fremdformen` → **Gate Welle 2 rot**.

**Beleg 2 — der Zulieferer hat ausdrücklich widersprochen.**
`src/app/m/lagerbuch/_actions/tokens.ts:20-27`:

> T160 erweitert diese Datei spaeter um benannte Konstanten und entfernt den
> Token-Hard-Delete an anderer Stelle. **In T126 bleiben alle Werte intern: Eine
> `"use server"`-Datei exportiert ausschliesslich Actions.**

**Beleg 3 (Korroboration) — Next.js.** Ein `"use server"`-Modul darf nur async-Funktionen
exportieren; ein Wert-Export ist ein Build-Fehler. Nachgezählt: von 28 `"use server"`-Dateien im
ganzen `src/` exportiert **keine einzige** einen Laufzeitwert (`_actions/detail.ts:12,21,30`
exportiert drei *Typen* — die sind erlaubt und werden zur Bauzeit gelöscht).

**Zu entscheiden:** Wohin gehören die vier Konstanten?
- **(a)** nach `_lib/` (z. B. `_lib/tokenForm.ts` neu, oder `_lib/konstanten.ts` — Teil 3, ERGÄNZT)
  und von `_actions/tokens.ts`/`loeschen.ts` importiert. Dann muss §5s Eigentümertabelle um die
  Datei erweitert und T172s Testfall „verwirft exportierte Konstanten" (Plan:6696–6706) gestrichen
  werden, weil es dann keine gibt.
- **(b)** intern bleiben; T160 Schritt 1/Schritt 5 prüfen dann gegen Literale statt gegen
  Konstanten — das ist genau der Zustand, den T160s Prosa („damit der Test gegen die Konstante prüft
  und nicht gegen eine zweite Abschrift derselben Zahl", Plan:2670) vermeiden will.
- **(c)** guards.test.ts’ Allowlist um `export const` aufweichen — **widerspricht ihrem eigenen
  Kopfkommentar** und macht den Scan strukturell schwächer.

---

### A2 — T160: die Funktion `generateUniqueCode` gibt es im Repo nicht

**Planstelle 1** (Plan:2576, Task-Kopf):

> ⚠️ **`generateUniqueCode` bleibt unverändert, und das ist der Witz an 8-F.**

**Planstelle 2** (Plan:2646–2650, Schritt 1 — Testcode):

> ```ts
> const block = /function generateUniqueCode[\s\S]*?\n}/.exec(quelle)![0];
> ```

**Planstelle 3** (Plan:2699–2708, Schritt 3 — die Datei „schreiben"):

> ```ts
> function generateUniqueCode(db: DB): string {
>   for (let i = 0; i < TOKEN_ZIEHUNGEN; i++) {
> …
>   throw new Error("Konnte keinen eindeutigen Code erzeugen");
> }
> ```

**Beleg** — `src/app/m/lagerbuch/_actions/tokens.ts:30-41`:

```ts
function erzeugeFreienCode(db: DB): string | null {
  for (let versuch = 0; versuch < 20; versuch++) {
    …
    if (!belegt) return code;
  }
  return null;
}
```

und `:113-114` `const code = erzeugeFreienCode(db); if (!code) return festerFehler(CODE_FEHLER);`

Drei Folgen: (1) die Regex trifft nicht, `.exec(...)![0]` wirft `TypeError` → Testfall rot;
(2) Schritt 3 ist keine Ergänzung, sondern eine Umbenennung + Signaturänderung
(`string | null` → `string`) + ein neuer `throw`, wo heute ein sauberes `ActionErgebnis`
zurückkommt; (3) Schritt 3 widerspricht dem eigenen Task-Kopf („bleibt unverändert").

**Zu entscheiden:** Wird der Name im Plan auf `erzeugeFreienCode` korrigiert und Schritt 3 auf „nur
die Literale durch Konstanten ersetzen, Rückgabetyp und Nullpfad unberührt" reduziert — oder soll
die Funktion tatsächlich umgeschrieben werden (dann ist der Rückgabewert-Vertrag von `createToken`
mitbetroffen und `_actions/tokens.test.ts` aus Teil 5 muss angefasst werden)?

---

### A3 — T160: sämtliche Testschnipsel ignorieren den `ActionErgebnis`-Umschlag; `loescheElement` kann nicht `reject`en

**Planstellen** (Plan:2616, 2629, 2737–2739, 2752, 2762, 2781):

> ```ts
> const { code } = await createToken({ label: "RTW 1" }, t.db);
> const { id } = await createToken({ label: "nie benutzt" }, t.db);
> const status = await pruefeLoeschbar("token", id, t.db);
> expect(status.loeschbar).toBe(false);
> expect((await pruefeLoeschbar("token", id, t.db)).loeschbar).toBe(false);
> await expect(loescheElement("token", id, t.db)).rejects.toThrow();
> expect((await pruefeLoeschbar("artikel", artikelId, t.db)).loeschbar).toBe(true);
> ```

**Beleg** — die tatsächlichen Signaturen:

- `_actions/tokens.ts:80-83` → `Promise<ActionErgebnis<{ id: string; code: string }>>`, Erfolg ist
  `{ ok: true, wert: { id, code } }`. `const { code } = …` ergibt `undefined`.
- `_actions/loeschen.ts:194-198` → `Promise<ActionErgebnis<Loeschbarkeit>>`; richtig wäre
  `(… ).wert.loeschbar`.
- `_actions/loeschen.ts:212-269` → `loescheElement` fängt **alles** (`try { db.transaction(…) }
  catch { return { ok:false, fehler: FESTER_LOESCHFEHLER } }`) und gibt bei `!status.loeschbar`
  `{ ok:false, fehler: status.grund }` zurück. **Sie rejected nie.** Nach T160s eigener Änderung
  (`pruefe()` steigt für `"token"` mit `loeschbar:false` aus) wird der `switch` gar nicht erreicht,
  der neu vorgeschlagene `default: throw` (Plan:2828–2834) ist damit unerreichbar **und** würde vom
  umgebenden `catch` ohnehin geschluckt.

**Das Idiom existiert bereits — es steht nur nicht im Plan.** Beide Zieldateien halten je einen
lokalen Auspacker, und zwar **unter verschiedenen Namen**:

- `_actions/loeschen.test.ts:79` → `function wert<T>(ergebnis: unknown): T` (dazu `fehlerVon()` `:83`)
- `_actions/tokens.test.ts:75` → `function wertVon<T>(ergebnis: { ok: boolean }): T`
  (prüft zusätzlich `expect(ergebnis.ok).toBe(true)`; dazu `fehlerVon()` `:80`)

**Zu entscheiden bleibt nur der `loescheElement`-Teil:** (a) die Zusicherungen benutzen das
vorhandene Idiom der jeweiligen Datei (`wert<Loeschbarkeit>(await pruefeLoeschbar(…)).loeschbar`
bzw. `wertVon<{id,code}>(await createToken(…))`) und `rejects.toThrow()` wird zu
`expect(fehlerVon(await loescheElement("token", id, t.db)).ok).toBe(false)` — oder (b)
`loescheElement` soll für `"token"` tatsächlich werfen, was den heutigen „nie werfen, immer
Rückgabewert"-Vertrag der Datei und Global Constraint „Fehler kommen als Rückgabewert an, nie über
`e.message`" (Plan:727) bricht.

---

### A4 — T161: der Scan „mountet im Modul-Layout keine Shell" ist gegen das vorhandene `layout.tsx` garantiert rot

**Planstelle** (Plan:3217–3221):

> ```ts
> it("mountet im Modul-Layout keine Shell", () => {
>   const wurzel = readFileSync(join(MODUL, "layout.tsx"), "utf8");
>   expect(wurzel).not.toContain("Shell");
>   expect(wurzel).not.toContain("VerwaltungsRahmen");
> });
> ```

**Beleg** — `src/app/m/lagerbuch/layout.tsx:8` und `:12` (Kopfkommentar, Teil 1):

```
 * KEINE Shell, KEIN Rahmen, KEIN Riegel, KEIN viewport-Export.
 *  - Eine Shell waere hier falsch: ein Layout ohne Gruppenklammer ist Vorfahr
```

`toContain("Shell")` ist ein roher Substring-Test über die ungefilterte Quelle. Die Datei tut
inhaltlich genau das Richtige (`return children`), scheitert aber am Wort im Kommentar.

**Zu entscheiden:** Der Scan läuft über `ohneKommentare(...)` (die Funktion existiert bereits in
`_lib/bauform.test.ts:98` und in T161s eigener Datei, Plan:2980) — oder er prüft statt Substrings
`import`-Zeilen (`/from\s+["'].*shell/i`, `/VerwaltungsRahmen/` in einem Import). Der Kommentar in
`layout.tsx` darf **nicht** umformuliert werden, um einen Test grün zu machen.

---

### A5 — T161: die `max-width`-Zusicherung trifft Layout-Obergrenzen statt Breakpoints — und dupliziert einen bereits existierenden, besseren Scan

**Planstelle 1** (Plan:317–318, J11 Punkt 4):

> 4. In `max-width`-**Abfragen** des Modul-CSS steht **kein anderer Wert als 767.98px**

**Planstelle 2** (Plan:3172–3179, der Testcode dazu):

> ```ts
> it("benutzt in max-width ausschliesslich 767.98px", () => {
>   for (const datei of alleCss()) {
>     const rein = ohneKommentare(readFileSync(datei, "utf8"));
>     for (const m of rein.matchAll(/max-width:\s*([\d.]+)px/g)) {
>       expect(m[1], `${datei}: max-width ${m[1]}px`).toBe("767.98");
> ```

**Beleg 1** — `src/app/m/lagerbuch/_ui/helfer.module.css` (Teil 4):

```
 69:  max-width: 560px;            /* kein Breakpoint — eine Obergrenze */
165:  gap: 14px; width: 100%; max-width: 680px; margin-top: 26px;
```

Beides sind Layout-Deklarationen, keine Media-Query-Präludien. Der Testfall ist damit am Tag seiner
Entstehung rot.

**Beleg 2** — die richtige Fassung existiert bereits, in
`src/app/m/lagerbuch/_lib/bauform.test.ts:659-683`:

> ```
> // GELESEN WIRD NUR DIE PRAELUDE einer `@media`-Regel: `max-width` als
> // LAYOUT-Eigenschaft (`.rahmen{max-width:560px}`) ist kein Breakpoint.
> for (const regel of css.matchAll(/@media([^{]*)\{/g)) {
>   for (const t of regel[1]!.matchAll(/max-width:\s*([\d.]+)px/gi)) {
> ```
> — und sie liest bereits **alle** `.css` unter `m/lagerbuch/**` (`cssDateien()`,
> `bauform.test.ts:430`), also inklusive `(druck)/druck.css`.

**Zu entscheiden:** (a) Der Testfall entfällt in `druck.test.ts` ersatzlos (er ist eine Dublette der
vorhandenen, korrekten Zusicherung) — oder (b) er wird auf `@media`-Präluden eingeengt und damit
bewusst als zweite Kopie geführt. Bei (a) ist J11 Punkt 4 als „liegt bereits in `bauform.test.ts`"
zu vermerken; die dortige Fassung deckt die Warnung „der Glob muss `**/*.css` lesen" (Plan:320)
schon ab.

---

### A6 — T156 Schritt 6: der Adapter erfüllt `ArtikelFilterZeile` nicht — `pnpm typecheck` bricht

**Planstelle** (Plan:1686–1694):

> ```ts
> const gefiltert = artikelFiltern(
>   rohe.map((r, i) => ({ ...r, id: String(i), chargenNr: r.naechsteCharge?.chargenNr ?? null })),
>   { ...LEERER_FILTER, nurUnterMindest: true },
> );
> ```

**Beleg** — `src/app/m/lagerbuch/_lib/artikelFilter.ts:18-27`:

```ts
export type ArtikelFilterZeile = {
  name: string;
  fach: string;
  aktiv: boolean;
  unterMindest: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  chargeKritisch: boolean;
};
```

`BestandExportEingabe` (T156, Plan:1406–1411) liefert `name`, `fach`, `aktiv`, `unterMindest`,
`naechsteCharge` — aber **kein `chargeKritisch`**. Die Signatur ist
`artikelFiltern<T extends ArtikelFilterZeile>(…)` (`artikelFilter.ts:68`), also ist die
Argumentliste nicht zuweisbar. Die zusätzlich gesetzten `id` und `chargenNr` existieren im Typ gar
nicht — sie sind unnötig, aber harmlos.

**Zu entscheiden:** Der Adapter ergänzt `chargeKritisch: false` (und lässt `id`/`chargenNr` weg) —
oder der Kopplungstest wird auf ein separates, minimal getipptes Fixture umgestellt. Ohne
Entscheidung ist der Task rot, und der Plan warnt an dieser Stelle nur unspezifisch
(„Weicht die Zeilenform ab, wird der Adapter … angepasst", Plan:1706–1708).

---

### A7 — T172: „19 Verzeichniseinträge" ist falsch; `_actions/` hat 37

**Planstelle 1** (Plan:393, die ausgeschriebene Addition in §4.1):

> ```
> 18 Action-Dateien + guards.test.ts = 19      Verzeichniseinträge
> ```

**Planstelle 2** (Plan:6643–6649, der Testcode):

> ```ts
> it("hat 18 Action-Dateien und 19 Verzeichniseintraege", () => {
>   const eintraege = readdirSync(ACTIONS).sort();
>   expect(eintraege).toHaveLength(19);
>   expect(eintraege).toContain("guards.test.ts");
>   expect(eintraege.filter((e) => e !== "guards.test.ts")).toEqual(Object.keys(SOLL).sort());
> });
> ```

**Beleg** — nachgezählt im Arbeitsbaum:

```
ls src/app/m/lagerbuch/_actions | wc -l          → 37
… | grep -v '\.test\.ts' | wc -l                 → 18
… | grep '\.test\.ts' | wc -l                    → 19
```

Jede der 18 Action-Dateien trägt eine Schwesterdatei `*.test.ts`, dazu `guards.test.ts`. Beide
Zusicherungen sind damit garantiert rot. Der bestehende Scan trifft die Unterscheidung selbst
(`guards.test.ts:57`: `.filter((n) => n.endsWith(".ts") && n !== SELBST && !n.endsWith(".test.ts"))`
→ 18) — sie fehlt nur in T172s neuem Block.

⚠️ **Die übrigen Zahlen stimmen** (siehe Teil C, C1): 47 Deklarationen, 18 Dateien, 44 bewacht,
3 Ausnahmen — je Datei exakt wie in §4.1s Tabelle. Falsch ist ausschließlich die 19.

**Zu entscheiden:** (a) Die Zusicherung liest `actionDateien()` (18) statt `readdirSync` und die 19
wird zu „18 Action-Dateien plus `guards.test.ts`, geprüft über `existsSync`". (b) Die Zahl wird auf
37 korrigiert — dann bindet sie sich an die Testdatei-Anzahl und wird bei jeder neuen `_actions`-
Testdatei rot. Empfehlung liegt bei (a); die Zahl **19** steht dann auch in §4.1 (Plan:384, 393),
§4.2 (Plan:418), T172 (Plan:6562, 6608) und der Abnahmecheckliste (Plan:7402) zur Korrektur an.

---

### A8 — T173 gegen `bauform.test.ts`: die Verschärfung ist im Repo bereits gebaut und namentlich **T164** zugewiesen

**Planstelle 1** (Plan:6819–6820, T173-Kopf):

> ⚠️ **Da Teil 4 keine Tasks trägt (§2.1), übernimmt dieser Task die GANZE Verschärfung** —
> inklusive des `usePathname`-Scans, den E9 an T64 vergeben hatte.

**Planstelle 2** (Plan:6865–6898): T173 legt einen **neuen** `describe`-Block mit einem eigenen
`const WEICHEN = [...]` an.

**Beleg** — `src/app/m/lagerbuch/_lib/bauform.test.ts:221-262` existiert bereits, aus **Teil 4,
T87**:

```
221: describe("Teil 4, T87 — die Weichen-Dateien existieren UND tragen ein PRAEDIKAT, keinen Riegel", …
247:   const PFLICHT = [
248:     "page.tsx",                  // das Gate (§7.2.4, T81)
249:     "a/[artikelId]/page.tsx",    // Regaletikett-Weiche (§7.4.3, T83)
250:   ];
…
260:   const NOCH_NICHT = ["g/[code]/page.tsx"];   // Teil 6, T164
```

mit der ausdrücklichen Anweisung darüber (`:251-259`):

> ⚠️ **WER DIESE ZEILE EINLOEST: TEIL 6, T164 (dort J3)** — die Aufgabe, die
> `g/[code]/page.tsx` anlegt, ueberfuehrt sie in `PFLICHT`.

Ebenso existiert der `usePathname`-Scan bereits — sogar **zweimal**:
`bauform.test.ts:837-857` („findet ausschliesslich `_ui/useUrlFilter.ts`", exakt T173s Zusicherung)
und `_ui/filter.test.tsx:160-175` („usePathname kommt im Modul genau einmal vor").

**Zwei Konflikte auf einmal:** (1) Der Plan lässt T173 einen zweiten, parallelen Weichen-Block
anlegen — zwei Wahrheitsquellen über dieselbe Aussage in **einer** Datei. (2) §5 (Plan:473) gibt
`_lib/bauform.test.ts` an T173, während der Bestand die Zeile an **T164** adressiert; T164 dürfte
sie nach §5 gar nicht anfassen.

**Zu entscheiden:** (a) T173 **editiert** den vorhandenen Block (`"g/[code]/page.tsx"` von
`NOCH_NICHT` nach `PFLICHT`) statt einen zweiten anzulegen, streicht seinen `usePathname`-Teil
ersatzlos, und §5 bleibt bei T173 — oder (b) T164 löst die Zeile ein, wie der Bestand es vorsieht,
und §5s Eigentümerzeile wandert mit (dann arbeiten T164 und T173 in derselben Datei, gegen §5).
Solange das offen ist, entstehen doppelte Zusicherungen oder eine Eigentümerverletzung.

---

### A9 — T167–T171: `devLogin` hat eine andere Signatur, und die fünf Specs umgehen `e2e/helpers/lagerbuch.ts`

**Planstelle** (fünfmal, u. a. Plan:5495, 5590, 5710, 5894, 5943, 6044, 6294):

> ```ts
> const HOST = "http://lagerbuch.localtest.me:3100";
> await devLogin(page, { groups: ["lagerbuch_nutzer"] });
> await devLogin(page, { groups: [] });   // angemeldet, aber ohne Gruppe
> ```
> und in T169: `const FREMD = "http://feedback.localtest.me:3100";`

**Beleg 1** — `e2e/fixtures.ts:3-7`:

```ts
export async function devLogin(
  page: Page,
  opts: { host: string; email?: string; groups?: string; callbackPath?: string; port?: number },
)
```

`host` ist **Pflicht** (ohne ihn navigiert der Helfer nach `http://undefined:3100/login`), und
`groups` ist ein **`string`**, kein `string[]`. Beide Abweichungen sind `tsc`-Fehler.

**Beleg 2** — `e2e/helpers/lagerbuch.ts` ist laut eigenem Kopf „**DIE EINE QUELLE** fuer Host,
Admin-Gruppe, Port und die drei Token-Codes (Festlegung H9, Spec §12.6 Punkt 2)" und exportiert
`LAGERBUCH_HOST`, `FREMDER_HOST` (`= "feedback.localtest.me"`), `LAGERBUCH_ADMIN_GRUPPE`,
`LAGERBUCH_PORT`, `lagerbuchUrl()`, `fremdUrl()`, `E2E_TOKEN_HELFER/CHECK/GERAETE`. Der
Kopfkommentar begründet ausdrücklich, warum Literale verboten sind:

> ⚠️ WARUM NICHT ALS LITERALE. … der Fehlerfall ist nicht laut, sondern GEGENTEILIG: ohne (oder mit
> falschem) `groups` bezeugt der Lauf den 404 aus §11.5, Zustand 19 und **sieht dabei aus wie ein
> bestandener Test**.

Die vorhandene Schwesterdatei `e2e/lagerbuch-verwaltung.spec.ts:1-17` (Teil 5, T150) macht es
richtig vor: `devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath })`
und `page.goto(lagerbuchUrl("/verwaltung/artikel"))`.

**Beleg 3** — T171 (Plan:6254–6261) zieht seinen Code so:

```ts
db.prepare(`select id, code from tokens where ${bedingung} limit 1`)
```

`limit 1` **ohne** `order by` greift einen beliebigen der drei bewusst getrennten Seed-Codes
(`111-111` Helfer, `222-222` Check, `333-333` Geräte) und sperrt ihn zwischendurch
(`sperre(t.id, false)`). Der Kopf von `e2e/helpers/lagerbuch.ts` begründet die Dreiteilung
ausdrücklich damit, dass Playwright „alle Spec-Dateien in EINEM Worker gegen EINE SQLite-Datei"
fährt — genau die Kopplung, die der Plan selbst als Global Constraint verbietet (Plan:739–741,
„kein `.first()` und keine Zusicherung, die an der Reihenfolge früherer Specs hängt").

**Zu entscheiden:** Die fünf Specs übernehmen `e2e/helpers/lagerbuch.ts` vollständig
(`lagerbuchUrl`/`fremdUrl`/`LAGERBUCH_HOST`/`FREMDER_HOST`/`LAGERBUCH_ADMIN_GRUPPE` und die drei
benannten Token-Konstanten) — dann sind alle Literale und die `limit 1`-Auswahl zu streichen. Der
Plan enthält dazu **keine Zeile**; ohne Entscheidung baut ein Umsetzer fünf Dateien, die weder
typprüfen noch der Festlegung H9 folgen.

---

### A10 — T170: der Seed liefert keinen Artikelnamen > 28 Zeichen; die Zusicherung ist rot und die Reparatur liegt in fremdem Besitz

**Planstelle** (Plan:6144–6157):

> ⚠️ **DER SEED MUSS EINEN BEWUSST LANGEN ARTIKELNAMEN LIEFERN** … Der Name steht im Seed-Schritt
> aus Teil 3 (T60); reicht er nicht, wird er **DORT** verlängert und nicht hier umgangen.
> ```ts
> expect(laengster.length, "der Seed braucht einen langen Artikelnamen").toBeGreaterThan(28);
> ```

**Beleg** — sämtliche Artikelnamen in `e2e/seed-lagerbuch.ts`:

```
:85   "E2E Verbandpäckchen"     (19)
:92   "E2E Verfall NaCl"        (16)
:174  "E2E Check Kompressen"    (20)
:207  "E2E Geräte Pflaster"     (19)
:228  "E2E Bestellung NaCl"     (19)
```

Der längste hat **20** Zeichen. Der Testfall ist damit rot, und zwar an der Zusicherung, die den
eigentlichen Gegenstand (QR schrumpft nicht) gar nicht misst.

Zusätzlich: `e2e/seed-lagerbuch.ts` steht **nicht** in §5s Eigentümertabelle (Plan:449–474) — weder
als „neu" noch als „ERGÄNZT". Ein Umsetzer von T170 darf die Datei nach dem Schnitt nicht anfassen.

**Zu entscheiden:** (a) `e2e/seed-lagerbuch.ts` wird in §5 als **ERGÄNZT** (Teil 3, T60) aufgenommen
und T170 verlängert einen Namen dort — oder (b) T170 setzt die Grenze auf einen im Seed erreichbaren
Wert und verliert damit die Aussage („der lange Name drängt den QR unter 20 mm"), was die Zeile zum
No-op macht. (b) ist ausdrücklich nicht empfohlen; die Entscheidung gehört trotzdem getroffen, bevor
gebaut wird.

---

### A11 — §2 Vorbedingung 5 (`.spec.ts`-Lücke in `guards.test.ts`) wird von KEINEM Task dieses Plans geschlossen

**Planstelle** (Plan:64–68, §2 Vorbedingungen, als **bindend** deklariert):

> ⚠️ **Zuerst lesen: `docs/superpowers/plans/UEBERGABE-lagerbuch-teil2.md`.** Für Teil 6 binden
> **Punkt 1** … und **Punkt 5** (`_actions/guards.test.ts:57` hat dieselbe `.spec.ts`-Lücke, die in
> `_lib/bauform.test.ts:56` bereits geschlossen ist — **diese Datei fasst Teil 6 für die
> Guard-Zählung ohnehin an**).

**Beleg 1 — die Lücke ist real.** `src/app/m/lagerbuch/_actions/guards.test.ts:57`:

```ts
.filter((n) => n.endsWith(".ts") && n !== SELBST && !n.endsWith(".test.ts"))
```

Eine Datei `foo.spec.ts` endet auf `.ts` und **nicht** auf `.test.ts` → sie würde als Action-Modul
gescannt, ihre `export`-Zeilen gegen die Allowlist gehalten und ihre Funktionen als ungeschützte
Actions gemeldet.

**Beleg 2 — die geschlossene Gegenfassung** in `src/app/m/lagerbuch/_lib/bauform.test.ts:74`:

```ts
if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
```

mit Begründung `:70-73`:

> `*.spec.ts(x)` zaehlt mit: heute traegt keine Datei im Modul diese Endung, aber die
> `e2e/`-Konvention der Suite kennt sie, und ein Scan, der sie uebersieht, macht genau die Datei
> rot, die eine Zusicherung TRAEGT.

**Beleg 3 — T172 schließt sie nicht.** T172 ist der einzige Task, der `guards.test.ts` anfasst (§5,
Plan:472). Seine neun Schritte (Plan:6580–6797) hängen ausschließlich einen `describe("Zählung …")`
an: `SOLL`, `AUSNAHMEN` und acht `it(...)`. **Keine Zeile fasst `actionDateien()` oder den Filter
in `:57` an.** Die als bindend markierte Vorbedingung bleibt damit unerledigt, und zwar in genau der
Datei, die der Plan als „fasst Teil 6 ohnehin an" benennt.

**Zu entscheiden:** (a) T172 bekommt einen Schritt, der `:57` auf
`!/\.(?:test|spec)\.tsx?$/.test(n)` umstellt (dann fällt auch `n !== SELBST` weg, weil
`guards.test.ts` selbst darunter fällt — der `SELBST`-Wächter kann als redundante zweite Linie
bleiben, dann aber mit Begründung). Achtung: die Umstellung ändert **nichts** an der Zählung 18,
weil heute keine `.spec.ts` unter `_actions/` liegt — die Zusicherung wird nur zukunftsfest.
(b) Die Vorbedingung wird ausdrücklich vertagt, und §2 sagt das statt „bindet".

⚠️ Zusatz: Nach A7s Auflösung würde die 19er-Zusicherung ohnehin über `actionDateien()` laufen —
die beiden Änderungen gehören in **einen** Schritt.

---

## Teil B — KOSMETISCH

| # | Task/Stelle | Was falsch ist | Wie es richtig heißt |
|---|---|---|---|
| B1 | Plan:2147–2149 | Zwei verirrte Werkzeug-Tags `</content>` / `</invoke>` mitten im Dokument, direkt vor „Welle 2" | ersatzlos streichen; der Rest des Task-Blocks ist vollständig (nachgeprüft: keine weitere Trunkierung im Dokument) |
| B2 | T160, Plan:2566, 2725 | „`pruefeToken` (`loeschen.ts:89-99`) erlaubt das harte Löschen, solange `lastUsedAt` **null** ist" — das Prädikat des Bestands ist ein anderes | `loeschen.ts:126-143`; gezählt werden `buchungen` mit `quelleTyp="token"` und `quelleId = code`; löschbar, solange **null Buchungen** darauf zeigen. Die Begründung von 8-F trägt über dieses Prädikat unverändert (nie eingelöst ⇒ keine Buchung ⇒ löschbar ⇒ Code frei) |
| B3 | T160, Plan:2823 | „der Zweig `case "token"` in `loescheElement` (`:168`)" | `loeschen.ts:246-248` |
| B4 | T160, Plan:2599, 2606, 2610, 2637 | `tokens.ts:10 / :12 / :15 / :16` | `_actions/tokens.ts:28` (Alphabet+Länge), `:31` (20 Ziehungen), `:33` (Bindestrich), `:36` (Kollisionsabfrage) |
| B5 | T160, Plan:2623 | „kein `expiresAt`, kein `validUntil` (`schema.ts:132-147`)" | `_db/schema.ts:376-410` |
| B6 | T160, Plan:2824–2834 | „damit `tsc` das nicht als Vollständigkeitslücke meldet … bekommt er einen `default`-Zweig" — der `switch` in `loescheElement` steht in einem Block mit nachfolgendem `return aktuell;`, TypeScript verlangt dort keine Vollständigkeit | Der `default`-Zweig ist optional. Wenn er kommt, dann als Kommentarbegründung ohne `throw` (der `throw` wird vom umgebenden `catch` verschluckt, siehe A3) |
| B7 | T160, Files-Block Plan:2541 | `_lib/lesepfade/tokens.ts` steht als „Modify" und in §5 (Plan:458), aber **kein einziger** der neun Schritte fasst die Datei an | entweder Schritt ergänzen (die Datei existiert, 2,6 KB) oder aus Files-Block und §5 streichen |
| B8 | T159, Plan:2192 | „`core/qr/index.ts:19-23` hat drei divergierende Stellen … abgeschafft" | `src/core/qr/index.ts:20-21`; die Konfiguration selbst steht `:25-26` |
| B9 | T159/J9, Plan:281 | „`sharp` und `jsqr` stehen in `devDependencies` (`package.json:51-52`)" | `package.json:56` (`jsqr`), `:57` (`sharp`) |
| B10 | T172, Plan:6644, 6653, 6732, 6744 | „`ACTIONS`, `actionsIn(datei)` und `rumpfVon(quelle, name)` stammen aus Teil 2, T20" — **keiner** der drei existiert | vorhanden sind `ORDNER` (`guards.test.ts:30`), `actionDateien()` (`:54`), `exportierteActions()` (`:178`), `rumpfNach(quelle, abIndex)` (`:92`), `ersteAnweisung()` (`:112`). Alle drei Namen sind in `guards.test.ts` neu anzulegen oder auf die vorhandenen umzuschreiben — insbesondere `rumpfVon(quelle, name)` (nach Name) gegen `rumpfNach(quelle, index)` (nach Position) |
| B11 | T173, Plan:6819 · T172, Plan:6754 · T176, Plan:7371 | Drei Stellen behaupten weiterhin, Teil 4 trage keine Tasks („am 04.08.2026: nein, das Dokument endet nach E11"; „Ohne einen ausgeführten Teil 4 ist dieser Test ROT … es fehlen `gate.ts`, `sitzung.ts` und `check.ts`") — §2.1 (Plan:70–80) korrigiert das selbst | Teil 4 trägt T62–T87 (nachgezählt: `grep -c "^### Task " …teil4.md` → 26, T62 bis T87); `_actions/gate.ts`, `sitzung.ts`, `check.ts` existieren im Bestand. Die drei Absätze sind zu streichen bzw. auf „erledigt" umzuschreiben |
| B12 | T176-Checkliste, Plan:7370 | „**Teil 4** — Helfer-Weg (§7), T62–**T85**" | T62–T87 (so auch §2.1, Plan:75, und §11, Plan:7521) |
| B13 | T173, Plan:6829–6835 | Die Sorge, der `"use client"`-Scan könne den ganzen Modulbaum abdecken und `error.tsx` rot färben | Nachgeprüft: `bauform.test.ts:380-395` scannt ausschließlich `_lib/`+`_db/` (`unterLibUndDb`). Der Absatz kann entfallen; `error.tsx` ist unproblematisch |
| B14 | T173, Plan:6900–6916 | Der `usePathname`-Scan wird „mit angelegt, falls er fehlt" | Er existiert doppelt: `bauform.test.ts:837-857` (identische Zusicherung) und `_ui/filter.test.tsx:160-175`. Der T173-Block entfällt |
| B15 | T165, Plan:4980–5054 | Die Testschnipsel greifen `query("[data-testid='lb-excel']")` | `ArtikelTable.tsx` trägt **keinen** `data-testid`; der Knopf ist über den Text „Excel-Liste" (`:185`) erreichbar, verpackt in `Tooltip`+`span` (`:178-182`). Entweder Anker in T165 nachziehen oder — konsequenter — den `data-testid` beim Anbinden setzen und in T168 (`getByRole("button", { name: /Excel-Liste/ })`) unverändert lassen |
| B16 | T166, Plan:5210–5223 | Die Testschnipsel greifen `[data-testid='lb-kopieren']` / `[data-testid='lb-csv']` | `BestellListe.tsx:158,165` trägt keine testids; die Knöpfe heißen heute „Liste kopieren" und „CSV" mit `icon={<Ikone …>}` — `textContent` enthält damit nur den Text. Gleiche Auflösung wie B15 |
| B17 | T166, Plan:5222 | `expect(query("[data-testid='lb-kopieren']").textContent).toBe("Liste kopieren (nur offene)")` — mit dem vorhandenen `<Ikone>` im Knopf ist `textContent` nicht zeichengleich | `toContain(...)` statt `toBe(...)`, oder den Text-Knoten gezielt greifen |
| B18 | T175, Plan:7137–7143 | Die Handler-Schleife listet sechs Pfade, davon einen (`/api/health/lagerbuch`), der nicht zu den sieben Handlern gehört, und lässt `/pwa-icon.svg`-Nachbarn stehen | Die sieben Handler sind `t/[code]`, `abmelden`, `manifest.webmanifest`, `pwa-icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (im Repo als `route.ts` bestätigt). `/api/health/lagerbuch` ist ein Zusatzabruf und gehört als solcher markiert |
| B19 | §11, Plan:7523 vs. T176 Schritt 3, Plan:7328–7329 | Zustand **36** wird einmal Teil 4 („1–11 und 33–36") und einmal Teil 5 zugeordnet | Die Verteilungstabelle in T176 ist maßgeblich: 36 = Teil 5 (T138) mit `_ui/BarcodeScanner.tsx` aus Teil 4 |
| B20 | T161, Plan:2903–2905 | „T161 und T162 arbeiten in benachbarten Dateien, aber nie in derselben" — `druck.test.ts` liegt in T162s Verzeichnis `(druck)/etiketten/` | stimmt so (Datei ≠ Datei), aber der Satz sollte „nie in derselben **Datei**" sagen, sonst liest man Verzeichnistrennung hinein |
| B21 | T161, Plan:2971–2978 | `alleCss()` wird neu geschrieben | `cssDateien()` existiert bereits in `bauform.test.ts:430` mit derselben Semantik; die Neuimplementierung ist eine Dublette (unkritisch, weil andere Datei) |
| B22 | T164, Plan:4451–4452 vs. T162, Plan:3587 | T164 nennt sich „die **28.** `page.tsx`", T162 „die **29.**" — die Wellen laufen aber parallel (Welle 3), die Reihenfolge ist also nicht festgelegt | Beide sind „28./29., je nach Reihenfolge"; die Gesamtzahl 29 stimmt (siehe C4) |
| B23 | T171, Plan:6293 | `const { devLogin } = await import("./fixtures");` mitten im Testkörper, während alle anderen Specs oben importieren | oben importieren; der dynamische Import bringt hier nichts |
| B24 | T164, Plan:4608 | `await mount(await GeraetDeepLink({ params: … }))` mountet das Ergebnis samt `<VerwaltungsRahmen>` → `<Shell>` in jsdom, ohne es zu mocken | Risiko, nicht Befund: falls `Shell` unter jsdom nicht rendert, ist `VerwaltungsRahmen` per `vi.mock` zu ersetzen (wie die übrigen Consumes im selben Test bereits gemockt sind). Vorab einmal prüfen |
| B25 | T175, Plan:7082–7090 | **T175 ist der einzige Abnahme-Task ohne benannte Mutation.** Der Plan-Kopf verlangt sie für T172–T176 ausdrücklich („statt ‚Rot, weil …' nennen sie die **Mutation**, die sie fangen", Plan:8–11); T175 liefert stattdessen eine Tabelle mit **vier Fehlerklassen** | Zwei Mutationen stehen bereits in T175s eigener Prosa und sind nur zu benennen: „ein `@ant-design/icons`-Import wandert in `(druck)/etiketten/page.tsx`" (Schritt 2, Plan:7112–7114) und „`className={s.modul}` fällt aus `DruckRahmen`" (Schritt 4, Plan:7172–7174 — HTTP 200, kein Log, Scan grün) |
| B26 | T160, Plan:2655–2657 | „`t`, `createToken`, `setTokenAktiv`, `tokens`, `eq`, `readFileSync`, `join` stehen bereits im Kopf der Datei aus Teil 5, T126" | `_actions/tokens.test.ts` hat `eq`, `tokens`, `t` und (via `import * as tokenActions from "./tokens"`, `:42,45`) `createToken`/`setTokenAktiv` ✓ — **`readFileSync` und `join` fehlen** (null Treffer auf `node:fs`/`node:path`). Sie sind zu ergänzen |
| B27 | T160, Plan:2736–2782 | Der Schritt-5-Block in `_actions/loeschen.test.ts` ruft `createToken(...)` | `loeschen.test.ts` importiert `createToken` **nicht** (null Treffer) und hat auch keinen Grund dazu. Entweder `import { createToken } from "./tokens"` ergänzen — dann greift der dortige `vi.mock("../_lib/zugang")` auch für `tokens.ts` — oder die Token-Zeilen direkt per `t.db.insert(tokens)` anlegen, wie es die Datei für alle anderen Arten bereits tut |

---

## Teil C — GEPRÜFT UND STIMMIG

| # | Behauptung | Prüfung | Ergebnis |
|---|---|---|---|
| C1 | **§4.1: 47 Deklarationen in 18 `_actions/`-Dateien, 44 bewacht + 3 Ausnahmen** | `grep -cE '^export (async )?function ' ` je Datei | **stimmt exakt, Datei für Datei**: artikel 3 · aussondern 1 · bestellung 1 · buchung 3 · bz 4 · check 1 · csv 1 · detail 1 · fahrzeuge 5 · gate 1 · geraete 3 · inventur 1 · lagerortVerfall 1 · loeschen 3 · sauerstoff 3 · sitzung 2 · templates 11 · tokens 2 = **47** in **18** Dateien. Alle 18 tragen `"use server"` in Zeile 1. Die Zeile aus Teil 5 („32 Deklarationen in 14 Dateien") ist damit definitiv falsch, §4.2s Auflösung trägt. **Nur die „19 Verzeichniseinträge" gehen nicht auf — siehe A7.** |
| C2 | **§4.1: genau zwei Actions tragen `requireHelferSchreibend`** | `grep -rn requireHelferSchreibend _actions/*.ts` | stimmt: `buchung.ts:247` in `bucheEntnahmeHelfer` (`:243`) und `check.ts:92` in `checkAbschluss` (`:77`). T172s Zusicherung „42 Admin + 2 Helfer" ist erfüllbar |
| C3 | **§4.3: drei Namensdubletten (`geraetSpeichern`, `setGeraetAktiv`, `geraetZuBarcode` in `bz.ts` **und** `geraete.ts`)** | Exportlisten beider Dateien | stimmt; 47 Deklarationen bei 44 verschiedenen Namen geht auf |
| C4 | **§7.1: 29 `page.tsx`, davon 23 unter `(arbeit)`** | `find src/app/m/lagerbuch -name page.tsx` | 27 vorhanden, davon 23 unter `verwaltung/(arbeit)`. Es fehlen **genau** `g/[code]/page.tsx` (T164) und `verwaltung/(druck)/etiketten/page.tsx` (T162) → 27 + 2 = **29**. Die Zahl geht auf |
| C5 | **§7.2: 7 Route Handler** | `find … -name route.ts` | genau 7: `abmelden`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `manifest.webmanifest`, `pwa-icon.svg`, `t/[code]`. **36 Routen = 29 + 7** geht auf |
| C6 | **§11.5/T176: 40 Fehlerzustände** | Zeilenbereiche der Verteilungstabelle addiert | 5+5+1+1+2+1+1+2+1+1+1+2+2+3+4+3+1+1+1+1+1 = **40**, lückenlos 1–40 |
| C7 | **§9.4: neun Excel-Spalten** | T157s Liste gegen `Produces` und Testfälle | neun Header, neun Breiten, genau zwei `zahl: true` — intern konsistent (die Alt-Quelle `ArtikelTable.tsx:89-99` liegt in `../lagerbuch` und ist erreichbar, s. C20) |
| C8 | **§11-Tabelle / T164: `VerwaltungsRahmen` **mit** `nav`** | `_ui/VerwaltungsRahmen.tsx:6-13` | `nav: SuiteNavItem[]` ist **Pflicht-Prop ohne Default**. Ein Mount ohne `nav` ist ein `tsc`-Fehler. Teil 5s Abschlusstabelle („ohne `nav`") ist damit gegenstandslos, §11.3/T164 hat recht — **es gibt hier nichts zu entscheiden**. Kein Test und kein Code im Bestand hartcodiert eine nav-lose Erwartung (geprüft: `VerwaltungsRahmen.test.tsx`, `rahmen.test.tsx`, `bauform.test.ts`) |
| C9 | **T164s einzige Reihenfolgebindung nach außen ist erfüllt** | `_lib/barcode.ts:27` | `export function normalisiereBarcode(roh: string): string` existiert mit exakt der genannten Signatur. T164s Schritt 0 („Fehlt die Datei, hält dieser Task an") läuft durch |
| C10 | **T164s übrige Consumes** | Exportlisten | `viewerOderNull` (`zugang.ts:74`), `istLagerbuchAdmin` (`:112`), `requireLagerbuchAdmin` (`:250`), `helferZugangOderNull` (`helferZugang.ts:110`), `requireLagerbuchHost` (`host.ts:48`), `geraetByBarcode(db, barcode): {id}|null` (`lesepfade/geraete.ts:91`), `bzGeraetByBarcode` (`lesepfade/bz.ts:176`), `LAGERBUCH_NAV` (`_lib/nav.ts:12`, 15 Einträge inkl. `etiketten` → `/verwaltung/etiketten`) — **alle vorhanden, alle mit der genannten Signatur** |
| C11 | **J8, Punkt 2: `moduleUrl`s `null`-Zweig hängt an `NODE_ENV === "production"`, `core/shell/moduleUrl.ts:19-21`** | Datei gelesen | stimmt **zeilengenau**: `:19 if (process.env.NODE_ENV === "production")`, `:20 const host = prodHostsFor(mod)[0]`, `:21 return host ? … : null`. Der `vi.mock`-Ansatz aus J8 ist korrekt begründet |
| C12 | **T159s Test-Infrastruktur** | `_db/testdb.ts`, `_db/schema.ts`, `_db/client.ts` | `migrierteTestDb(praefix)` → `{db, sqlite, schliessen}` ✓ · `newId` (`schema.ts:30`) ✓ · `artikel` mit `name/einheit/fach/mindestbestand/aktiv/createdAt` (`:69-80`) ✓ · `tokens` mit `code/label/aktiv/createdAt/lastUsedAt` (`:376+`) ✓ · `getDb()` und `type DB` (`client.ts:32,43`) ✓ |
| C13 | **J9: `e2e/helpers/decode-qr.ts` existiert und ist aus `src/` importierbar** | Datei gelesen, `vitest.config.ts` geprüft | Die Datei existiert und exportiert `decodeQr`; `sharp ^0.35.3` (`package.json:57`) und `jsqr ^1.4.0` (`:56`) stehen in `devDependencies`. `vitest.config.ts:exclude` steuert nur die Sammlung. Der Rückfall aus §8.5 ist nicht nötig |
| C14 | **T161: kein `body *`, kein `visibility: hidden` im heutigen Modul-CSS** | grep über `_ui/helfer.module.css`, `_ui/verwaltung.module.css` | null Treffer. Nach T163 kommt `_ui/fehler.module.css` dazu (nur `max-width: 34rem`, kein px) — die Zusicherung ist erfüllbar |
| C15 | **T161: es gibt kein `verwaltung/layout.tsx` und kein `verwaltung/(arbeit)/etiketten/`** | `ls src/app/m/lagerbuch/verwaltung/` | enthält ausschließlich `(arbeit)/`. Beide Zusicherungen sind heute grün |
| C16 | **T161: beide Group-Layouts rufen beide Riegel** | `verwaltung/(arbeit)/layout.tsx:20-22` | `requireLagerbuchHost(kopf)` und `await requireLagerbuchAdmin()`, kein `isModuleAdmin`, kein `user.isAdmin`. Der `it.each(["(arbeit)","(druck)"])`-Block ist erfüllbar, sobald T161 das zweite Layout anlegt |
| C17 | **T167/T175: Anker und Texte, gegen die die E2E prüfen** | Repo | `data-testid="suite-header"` an `<Header>` (`core/shell/SuiteHeader.tsx:65`) ✓ · Suite-404-Text „Diese Seite gibt es hier nicht." (`src/app/not-found.tsx:36`) ✓ · `.modul` als `--lb-*`-Träger (`_ui/verwaltung.module.css:2`) ✓ |
| C18 | **T176-Checkliste: `_ui/ikonen.test.ts` findet 36 Namen** | `ikonen.test.ts:390-391` | `expect(Object.keys(PFADE)).toHaveLength(36)` steht dort und ist heute grün |
| C19 | **`write-excel-file` liegt als direkte Abhängigkeit vor** | `package.json:38` | `"write-excel-file": "^4.1.1"` in `dependencies` — T165s Schritt-1-Prüfung („Fehlt das Paket, hält der Task an", Falle 58) läuft durch |
| C20 | **Die Alt-Anwendung ist aus dem Arbeitsbaum erreichbar** | `ls ../lagerbuch` | `/Users/rubeen/dev/personal/drk/lagerbuch` existiert. Alle „1:1 aus `../lagerbuch/src/...`"-Zitate (globals.css:265-282, bestand-export.ts:34-51, ArtikelTable.tsx:89-99, BestellListe.tsx:8/25/30/31, etiketten.ts:16-23) sind für den Umsetzer nachschlagbar und wurden **nicht** stichprobenweise gegengelesen — sie stehen außerhalb dieses Scans |
| C21 | **Die Abnahme-Tasks nennen je eine Mutation (Plan:8–11)** | T172–T176 durchgesehen | **Vier von fünf vollständig:** T172 → „eine Action, die es gar nicht erst in den Ordner geschafft hat" (Plan:6566–6570) · T173 → „eine **gelöschte** Weichen-Datei" (Plan:6809–6812) · T174 → „ein grüner Nachfolgetest, der etwas anderes prüft als vorher" (Plan:6967–6970) · T176 → „einen Teil, den jemand für abgenommen hält, weil sein eigenes Gate grün war" (Plan:7269–7271). Jede ist zusätzlich mit einer ausgeschriebenen Gegenprobe hinterlegt (T172: drei Gegenproben, Plan:6758–6768; T173: umbenennen, Plan:6928–6930). **T175 fehlt — siehe B25** |
| C22 | **§5: keine Datei ist zwei Tasks zugeordnet** | Eigentümertabelle Plan:449–474 durchgesehen | Innerhalb der Tabelle keine Dublette. **Ausnahme siehe A8** (`_lib/bauform.test.ts`: T173 laut Plan, T164 laut Bestandsdatei) und **A10** (`e2e/seed-lagerbuch.ts` fehlt ganz). Wellenreihenfolge: die einzige Bindung nach außen (T164 → `_lib/barcode.ts`) ist erfüllt; innerhalb des Plans verletzt kein Task seine Welle — T157 `Consumes` T156 nur als Typ (Plan:1743–1745, korrekt begründet), T161/T162 sind sauber getrennt, T172–T176 laufen hinter allem |

---

## Was dieser Scan NICHT geprüft hat

- Die Spec selbst (`docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md`) — der Plan zitiert
  sie an über hundert Stellen; nachgeschlagen wurden nur die Stellen, an denen der Plan sich selbst
  widerspricht.
- Die Alt-Anwendung `../lagerbuch @ ca04eb1` — Zeilenzitate daraus (Millimeter aus `globals.css`,
  die neun Excel-Spalten, die CSV-Beispielausgabe) sind **nicht** gegengelesen. Sie sind die einzige
  Quelle der 1:1-Pflichten und verdienen eine eigene Stichprobe, bevor T153/T154/T157 dispatcht
  werden.
- Teil 1–3 und Teil 5 als Dokumente. Geprüft wurde ausschließlich, was dieser Plan aus ihnen zitiert.
