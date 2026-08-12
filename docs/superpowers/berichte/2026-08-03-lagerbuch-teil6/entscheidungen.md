# Entscheidungen zum Vorab-Scan — Teil 6

Diese Datei geht **über** dem Plantext. Wo sie dem Plan widerspricht, gilt sie.
Grundlage: `vorab-scan.md` (11 bau-anhaltende Funde A1–A11).
Drei Punkte hat der Betreiber am 10.08.2026 entschieden (A1, A8, A11), acht der
Koordinator; jeder ist unten mit seiner Herkunft vermerkt.

---

## A1 — Die vier Token-Konstanten (T160) · **Betreiber**

`export const` in einer `"use server"`-Datei ist verboten (Next-Regel, und
`_actions/guards.test.ts:265-267` meldet es als Fremdform — richtigerweise).

→ **Neue Datei `src/app/m/lagerbuch/_lib/tokenForm.ts`**, ohne `"use client"`,
hält `TOKEN_ALPHABET`, `TOKEN_ZIFFERN`, `TOKEN_ZIEHUNGEN`, `TOKEN_LOESCHGRUND`.
`_actions/tokens.ts` und `_actions/loeschen.ts` **importieren** sie.
`TOKEN_LOESCHGRUND` ist ein Text, den eine Client-Insel zeigt — `_lib/` ist damit
auch nach Falle 6 der einzig richtige Ort.

Folgen:
- §5 (Eigentümertabelle) bekommt die Zeile `_lib/tokenForm.ts`, `_lib/tokenForm.test.ts` | T160 | neu
- T160s Schritte 1 und 5 prüfen gegen die importierten Konstanten
- T172s **neuer** Testfall „verwirft exportierte Konstanten" (Plan:6696–6706) **entfällt** —
  es gibt keine. Der vorhandene Allowlist-Scan aus Teil 2 bleibt unangetastet.

## A2 — `generateUniqueCode` heißt `erzeugeFreienCode` (T160) · Koordinator

Die Funktion im Bestand ist `_actions/tokens.ts:30-41`
`function erzeugeFreienCode(db: DB): string | null` — sie wirft **nicht**, sie gibt
`null` zurück, und `:113-114` verwandelt das in `festerFehler(CODE_FEHLER)`.

→ **Name überall korrigieren.** Signatur, Rückgabetyp und Nullpfad bleiben
**unverändert** — so, wie T160s eigener Kopf es sagt („bleibt unverändert, und das ist
der Witz an 8-F"). Plan-Schritt 3 reduziert sich damit auf: die vier Literale durch die
Importe aus `_lib/tokenForm.ts` ersetzen. **Kein** neuer `throw`, **keine**
Signaturänderung, `_actions/tokens.test.ts` bleibt in seinem Vertrag.
Die Quelltext-Regex in Schritt 1 liest `erzeugeFreienCode`.

## A3 — Der `ActionErgebnis`-Umschlag (T160) · Koordinator

Alle Action-Aufrufe liefern `ActionErgebnis<T>`, nicht den nackten Wert; und
`loescheElement` (`_actions/loeschen.ts:212-269`) **rejected nie** — sie fängt alles
und gibt `{ ok:false, fehler }` zurück.

→ **Das vorhandene Auspack-Idiom der jeweiligen Datei benutzen**, kein neues erfinden:
- in `_actions/loeschen.test.ts`: `wert<T>(…)` (`:79`) und `fehlerVon(…)` (`:83`)
- in `_actions/tokens.test.ts`: `wertVon<T>(…)` (`:75`) und `fehlerVon(…)` (`:80`)

→ `await expect(loescheElement("token", id, t.db)).rejects.toThrow()` wird zu einer
**Rückgabewert-Prüfung**: das Ergebnis trägt `ok === false` und den Grund, der auf das
Sperren verweist. Der Global Constraint „Fehler kommen als Rückgabewert an, nie über
`e.message`" (Plan:727) gilt hier gegen den Testschnipsel.
Der vorgeschlagene `default: throw` (Plan:2828–2834) entfällt (siehe B6: TypeScript
verlangt dort keine Vollständigkeit, und der umgebende `catch` schluckte ihn ohnehin).

## A4 — Der Shell-Scan über `layout.tsx` (T161) · Koordinator

`expect(wurzel).not.toContain("Shell")` ist garantiert rot: `layout.tsx:8` schreibt
im **Kommentar** „KEINE Shell, KEIN Rahmen …". Die Datei tut inhaltlich das Richtige.

→ Der Scan läuft über **`ohneKommentare(...)`** — die Funktion steht bereits in T161s
eigener Datei (Plan:2980) und in `_lib/bauform.test.ts:98`.
⚠️ **Der Kommentar in `layout.tsx` wird NICHT umformuliert, um einen Test grün zu machen.**

## A5 — Die `max-width`-Zusicherung (T161) · Koordinator

Der Testfall aus Plan:3172–3179 liest **jede** `max-width`-Deklaration und trifft damit
Layout-Obergrenzen (`_ui/helfer.module.css:69,165`) statt Breakpoints → rot am ersten Tag.
Die **richtige** Fassung existiert bereits: `_lib/bauform.test.ts:659-683` liest nur
`@media`-Präluden und deckt über `cssDateien()` (`:430`) alle `.css` unter
`m/lagerbuch/**` ab — **einschließlich** `(druck)/druck.css`.

→ **Der Testfall entfällt in `druck.test.ts` ersatzlos.** J11 Punkt 4 ist damit erfüllt,
nicht fallengelassen; T161 vermerkt im Kopfkommentar, wo die Zusicherung liegt.
Die anderen drei J11-Punkte (`@media print` genau einmal · kein `body *` · die
Pflichtinhalte von `druck.css`) baut T161 wie geplant.

## A6 — Der Kopplungs-Adapter (T156, Schritt 6) · Koordinator

`artikelFiltern<T extends ArtikelFilterZeile>` verlangt `chargeKritisch: boolean`
(`_lib/artikelFilter.ts:18-27`); `BestandExportEingabe` liefert es nicht → `tsc` bricht.

→ Der Adapter ergänzt **`chargeKritisch: false`** und lässt `id` und `chargenNr` weg
(beide stehen im Zieltyp gar nicht). Der Kopplungstest bleibt sonst wie geplant — er ist
der einzige Nachweis für §12.1 Punkt 2.

## A7 — Die „19 Verzeichniseinträge" (T172) · Koordinator

`readdirSync(_actions)` liefert **37** (18 Action-Dateien + 19 Testdateien), nie 19.
Die übrigen Zahlen stimmen datei-genau: **47 Deklarationen, 18 Dateien, 44 bewacht,
3 Ausnahmen** (nachgezählt, Scan Teil C).

→ Die Zusicherung liest **`actionDateien()`** (der vorhandene Helfer,
`guards.test.ts:54`) → 18, und prüft `guards.test.ts` separat über `existsSync`.
Die Zahl **19** wird als „18 Action-Dateien **plus** `guards.test.ts`" formuliert, nicht
als Verzeichnislänge. Eine Bindung an die Zahl der Testdateien wäre bei jeder neuen
Testdatei rot und ist ausdrücklich nicht gewollt.
⚠️ T176s Abnahmecheckliste (Plan:7402) hakt dieselbe Formulierung ab.

## A8 — Wer löst die Weichen-Zeile ein (T173) · **Betreiber**

`_lib/bauform.test.ts:221-262` (Teil 4, T87) trägt den Block bereits und weist die
Einlösung namentlich T164 zu (`:251-259`).

→ **T173 editiert den vorhandenen Block**: `"g/[code]/page.tsx"` wandert von
`NOCH_NICHT` nach `PFLICHT`, der Anweisungskommentar wird auf „eingelöst" umgeschrieben.
**Kein zweiter `describe`-Block, kein zweites `const WEICHEN`.**
→ T173s `usePathname`-Teil **entfällt ersatzlos** — er existiert doppelt
(`bauform.test.ts:837-857` und `_ui/filter.test.tsx:160-175`).
→ §5 bleibt unverändert: `_lib/bauform.test.ts` gehört T173. **T164 fasst die Datei nicht an.**

## A9 — Die fünf E2E-Dateien benutzen den Helfer (T167–T171) · Koordinator

`e2e/fixtures.ts:3-7`: `devLogin(page, { host, email?, groups?, callbackPath?, port? })`
— `host` ist **Pflicht**, `groups` ist ein **`string`**, kein `string[]`. Der Plantext
ist an sieben Stellen `tsc`-falsch.
`e2e/helpers/lagerbuch.ts` ist laut eigenem Kopf „**DIE EINE QUELLE**" (Festlegung H9,
Spec §12.6 Punkt 2) und exportiert `LAGERBUCH_HOST`, `FREMDER_HOST`,
`LAGERBUCH_ADMIN_GRUPPE`, `LAGERBUCH_PORT`, `lagerbuchUrl()`, `fremdUrl()` sowie
`E2E_TOKEN_HELFER` / `E2E_TOKEN_CHECK` / `E2E_TOKEN_GERAETE`.

→ **Alle fünf Specs ziehen Host, Gruppe, Port, URLs und Token-Codes aus
`e2e/helpers/lagerbuch.ts`.** Keine Literale wie `"http://lagerbuch.localtest.me:3100"`
oder `["lagerbuch_nutzer"]`. Vorbild ist die Schwesterdatei
`e2e/lagerbuch-verwaltung.spec.ts:1-17` (Teil 5, T150).
→ **T171 greift seinen Token-Code NICHT per `limit 1` aus der Datenbank**, sondern
benutzt `E2E_TOKEN_HELFER`. Ein `limit 1` ohne `order by` erwischt einen beliebigen der
drei bewusst getrennten Seed-Codes und sperrt ihn — genau die Kopplung, die der Global
Constraint „kein `.first()`, keine Zusicherung an der Reihenfolge früherer Specs"
(Plan:739–741) verbietet.
→ Der Fehlerfall ist hier **still und gegenteilig**: mit falschem `groups` bezeugt der
Lauf den 404 aus §11.5 Zustand 19 und sieht dabei aus wie ein bestandener Test.

## A10 — Der lange Artikelname (T170) · Koordinator

Der längste Artikelname im Seed hat **20** Zeichen (`e2e/seed-lagerbuch.ts:174`,
„E2E Check Kompressen"); T170 verlangt `> 28`.

→ **`e2e/seed-lagerbuch.ts` wird in §5 als ERGÄNZT (Teil 3, T60) aufgenommen**, und
**T170 verlängert dort einen Artikelnamen** auf über 28 Zeichen. Genau das schreibt
T170s eigener Warnkasten vor („reicht er nicht, wird er **DORT** verlängert und nicht
hier umgangen", Plan:6144–6157). Die Grenze im Test wird **nicht** abgesenkt — das
machte die Zeile zum No-op und verlöre die Aussage „der lange Name drängt den QR
unter 20 mm".
⚠️ Wer den Namen ändert, prüft, ob eine andere Spec ihn wörtlich erwartet.

## A11 — Die `.spec.ts`-Lücke in `guards.test.ts` (T172) · **Betreiber**

`_actions/guards.test.ts:57` filtert `n.endsWith(".ts") && !n.endsWith(".test.ts")` —
eine `foo.spec.ts` unter `_actions/` käme als Action-Modul durch.
`_lib/bauform.test.ts:74` hat dieselbe Lücke bereits geschlossen.

→ **T172 schließt den Filter mit**, in derselben Fassung wie `bauform.test.ts:74`.
Die als bindend markierte Vorbedingung aus §2 ist damit eingelöst statt nur zitiert.

## A12 — Der `@media`-Scan über `helfer.module.css` entfällt (T161) · Koordinator

**Nachgetragen am 10.08.2026**, gefunden vom Umsetzer von T161 vor dem Bau. Dritter Fund
derselben Klasse wie A4 und A5: eine Brief-Zusicherung, die **breiter** prüft als die Regel,
die sie meint — und deren korrekte enge Fassung im Bestand längst steht.

Der Brief-Testcode für `druck.test.ts` (Schritt 1) lautet:

```ts
it("laesst helfer.module.css ohne jede Media Query", () => {
  expect(ohneKommentare(inhalt)).not.toMatch(/@media/);
});
```

**Das ist garantiert rot, und zwar richtigerweise.** `_ui/helfer.module.css:336` trägt
`@media (prefers-reduced-motion: reduce)`, und `_lib/bauform.test.ts:612-623` **verlangt diese
Zeile ausdrücklich** — mit der Begründung im Test selbst: „Das ist die EINE Media Query dieser
Datei und die ausdrueckliche Ausnahme zu „NULL Media Queries" (§2 Punkt 16): der Constraint
zielt auf BREITEN-Abfragen, und `prefers-reduced-motion` ist keine."
Zwei Tests desselben Repos widersprächen einander direkt.

**Die korrekte enge Fassung existiert bereits** — `_lib/bauform.test.ts:651-656`:
`it("`_ui/helfer.module.css` enthaelt KEINE `@media (max-width`")`. Sie prüft genau das, was
§7.7.1 meint, und deckt den Zweck vollständig ab.

→ **Der Testfall entfällt in `druck.test.ts` ersatzlos.** Wie bei A5 wird die Zusicherung nicht
fallengelassen, sondern liegt woanders — und wie bei A5 gehört der **Fundort in den
Kopfkommentar** von `druck.test.ts`, sonst legt der nächste Umsetzer sie neu an.
⚠️ **Die Zeile in `helfer.module.css` wird NICHT gestrichen, um einen Test grün zu machen.**

## A13 — Die vier Scans in T164: einer streichen, drei reparieren · Koordinator

**Nachgetragen am 10.08.2026**, gefunden vom Umsetzer von T164 vor dem Commit — er hat
angehalten und gefragt, wie A12 es vorsieht. Vierter bis siebter Fund derselben Klasse.
**Die Antwort ist NICHT für alle vier dieselbe**, und genau das ist der Punkt: der Hebel hängt
daran, ob ein deckender Fundort existiert. Bei T162 hätte pauschales Streichen die einzige
Icon-Sperre beseitigt.

### Nachgemessen im Bestand

- **`_lib/bauform.test.ts:319-337`** trägt eine `NOCH_NICHT`-Schleife mit
  `it.runIf(existsSync(pfad))` über genau `g/[code]/page.tsx`. **Sie läuft von selbst an, sobald
  T164 die Datei anlegt**, und sichert dann drei Dinge über
  `ohneKommentareUndZeichenketten(...)`: `requireLagerbuchHost(` vorhanden,
  `istLagerbuchAdmin(` vorhanden, **kein** `requireLagerbuchAdmin`/`requireHelferSitzung`.
  Der Kommentar bei `:319-331` schreibt aus, warum `it.runIf` und nicht ein früher Ausstieg.
- **Der modulweite antd-/Icon-Scan (`bauform.test.ts:796-798`) sammelt
  `["_ui", "helfer", "a", "t"]` + Wurzel-`page.tsx`. `g/` steht NICHT darin.**

### Die Rulings

1. **Der `requireLagerbuchAdmin`-Abwesenheitsscan in T164s eigener Testdatei: STREICHEN**, mit
   Fundortvermerk auf `_lib/bauform.test.ts:319-337`. Er ist dort nicht nur gedeckt, sondern
   **stärker** — `ohneKommentareUndZeichenketten` schlägt jede lokale Fassung.
   ⚠️ **T164 fasst `bauform.test.ts` NICHT an** (Ruling A8: die Datei gehört T173). Es ist auch
   nichts zu tun: die Schleife aktiviert sich selbst.
2. **Der Icon-Import-Scan und der antd-Compound-Scan: REPARIEREN, nicht streichen.**
   Es gibt keinen deckenden Fundort — `g/` liegt außerhalb der Astliste. Ein Streichen ließe
   `g/[code]/page.tsx` ohne jede Icon-/antd-Zusicherung zurück, und Falle 7 sieht kein Gate.
   Hebel: Scan über **`ohneKommentare(...)`** (nicht die Zeichenketten-Fassung, siehe unten).
3. **Der `normalisiereBarcode`-Reihenfolgescan: REPARIEREN.** Die Diagnose des Umsetzers stimmt
   — ein bloßer Bezeichner trifft die **Importzeile**. Das Repo hat dafür ein gemessenes Idiom
   direkt daneben (`bauform.test.ts:288-293`): „mit `/istLagerbuchAdmin/` gruen, mit
   `/istLagerbuchAdmin\s*\(/` rot". Also **an der Klammer verankern** und die Reihenfolge über
   die Fundstellen-Indizes prüfen, gelesen über `ohneKommentareUndZeichenketten(...)`.

### ⚠️ Welcher Stripper wohin — das ist keine Geschmacksfrage

- **Positive Zusicherung** („ruft X auf"): `ohneKommentareUndZeichenketten`. Sonst erfüllt ein
  Kommentar **oder ein Zeichenketten-Literal** `"requireLagerbuchHost("` die Zusage, ohne dass
  der Riegel je liefe. Der Kommentar bei `bauform.test.ts:274-281` nennt genau das.
- **Negative Zusicherung** („importiert Y nicht"): **nur `ohneKommentare`**. Der Modulspezifizierer
  `"@ant-design/icons"` **ist** ein Zeichenketten-Literal — wer die Zeichenketten strippt, macht
  den Scan blind. `bauform.test.ts:815` tut es deshalb genau so.

Beide Helfer sind lokale Kopien, nicht exportiert. `ohneKommentareUndZeichenketten` steht in
`bauform.test.ts:133` und wird bereits in `_actions/guards.test.ts`, `_lib/format.test.ts` und
`pwa.route.test.ts` kopiert — **byte-identisch übernehmen**, wie beim kleinen Bruder.

## A14 — `lb-nichtDrucken` bekommt `!important` (Fund aus T167) · Koordinator

**Nachgetragen am 10.08.2026.** T167 hat beim ersten echten `emulateMedia({ media: "print" })`
einen Defekt in bereits abgenommenem Code gefunden — genau die Klasse, für die dieser Test im
Plan steht („der Scan aus T161 hält nur *die Regel steht da*, nie *sie wirkt*").

**Der Defekt:** `verwaltung/(druck)/etiketten/EtikettenBogen.tsx:80` trägt
`<div className="lb-nichtDrucken" style={{ display: "flex", … }}>`. Ein **Inline-Style schlägt
jede externe Selektorregel ohne `!important`** — `@media print { .lb-nichtDrucken { display: none } }`
(`druck.css:124-127`) erreicht dieses Element strukturell nie. Folge: die Bedienleiste
(„Alle" / „Keine" / „Drucken (n)") wird **mitgedruckt**, auf gekauftem Etikettenmaterial.

**Entschieden: die Druckregel bekommt `!important`**, nicht der Einzelfall eine Umbauaktion.

```css
@media print {
  .lb-nichtDrucken { display: none !important; }
}
```

Begründung, warum `!important` hier **richtig** ist und keine Notlösung:
1. Es behebt die **Klasse**, nicht die Instanz. Jedes künftige `lb-nichtDrucken` mit Inline-Style
   — und antd setzt Inline-Styles reichlich — liefe sonst in dieselbe Falle, und zwar **still**:
   kein Test, kein Gate und kein Blick auf den Bildschirm zeigt es. Erst das Papier.
2. Druck-Stylesheets sind der kanonische legitime Ort für `!important`. Die Regel hat genau eine
   Aufgabe (etwas verschwinden lassen) und keinen Gegenspieler, den sie ungewollt überstimmen
   könnte.
3. Die Alternative — Layout aus der Insel in `druck.css` heben — verschöbe Bildschirm-Layout in
   ein Stylesheet, das ausdrücklich **nur** die Druckregeln trägt, und fasste dafür **zwei**
   fremde Dateien an statt einer.

⚠️ **Der Inline-Style in `EtikettenBogen.tsx:80` bleibt.** Er ist Bildschirm-Layout und ab jetzt
harmlos. Ihn zu entfernen wäre eine zweite Änderung an einem zweiten fremden Task ohne Gewinn.

**Wer es ausführt:** der Umsetzer von **T167**. `druck.css` gehört T161 und ist abgenommen — die
Grenzüberschreitung ist hier bewusst und begründet: T167 hält die Reproduktion, kann den Fix in
derselben Minute verifizieren, und niemand sonst arbeitet in der Datei. Der Kommentar an der
Regel nennt Fundort und Grund, damit der nächste Leser das `!important` nicht „aufräumt".

⚠️ **Prüfen, ob `druck.test.ts` (T161) an der geänderten Zeile hängt** — sie hält alle
CSS-Aussagen des Moduls. Falls ja, wird die Zusicherung **mitgezogen**, nicht der Fix verbogen.

## A15 — Die Token-Provenienz im Journal wird nachgezogen (Fund aus T171) · Koordinator

**Nachgetragen am 11.08.2026.** T171 hat gemeldet, dass die Zusicherung „roher Code im `title`"
im gebauten Bauteil nirgends erfüllbar ist, **und den Fundort des Briefs als falsch erkannt**
(fünfte Instanz). Beides geprüft — der Umsetzer hat recht, und der Fund ist echt.

**Der Brief-Fundort ist falsch:** `_db/quelle.ts:20,23` handelt von der **Auflösung**
(`quelleId → Label`) und sagt über ein `title`-Attribut **nichts**. `Quelle` ist
`(quelleTyp, quelleId) => string` und kann konstruktiv nur den Anzeigenamen liefern.

**Der richtige Fundort ist die eingefrorene Alt-Anwendung**, nachgeschlagen:
`../lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`

```tsx
<span className="chip chip-grau" style={{ fontSize: 10.5 }} title={j.quelleId}>
  {j.quelleName}
</span>
```

**Damit ist es 1:1-Pflicht, und der Port hat sie verloren:**
`verwaltung/(arbeit)/journal/page.tsx:44-61` bildet `quelleName` ab und lässt `quelleId` fallen;
`_ui/Chip.tsx` nimmt kein `title`.

**Warum das mehr ist als Kosmetik:** `_db/quelle.ts:9-11` schreibt aus, dass die rohe ID in der
Datenbank **nachweisfest** stehen bleibt und nur die Anzeige aufgelöst wird. Das `title` ist die
**einzige Stelle in der Oberfläche**, an der die rohe Kennung wieder sichtbar wird. Ohne sie kann
niemand am Journal ablesen, **welcher Code** eine Buchung erzeugt hat — der Prüfpfad existiert
dann nur noch in der Datenbank. Nach 8-F (Codes bleiben für immer belegt) ist genau das die
Auskunft, die den Bestand prüfbar macht.

→ **Entschieden: nachziehen, minimal und additiv.**
1. `JournalAnzeigeZeile` bekommt `quelleId`
2. `journalAnzeigeZeilen` reicht `zeile.quelleId` durch
3. `_ui/Chip.tsx` bekommt ein **optionales** `title?: string` und setzt es auf das gerenderte
   Element

**Wer es ausführt:** der Umsetzer von **T171**, wie bei A14 — er hält die Reproduktion und kann
sofort verifizieren. Bewusste, begründete Grenzüberschreitung in zwei Teil-5-Dateien.

⚠️ **Auflagen:**
- `Chip` wird von vielen Seiten benutzt: das Prop ist **optional**, bestehende Aufrufstellen
  bleiben **unverändert**, und die Darstellung ohne `title` ändert sich **nicht**.
- **Nur nachziehen, was die Alt-Anwendung hatte.** Es gibt eine zweite Journal-Darstellung
  (`verwaltung/(arbeit)/page.tsx:60`, „Letzte Buchungen" auf dem Dashboard) — dort nur ändern,
  **wenn** die Alt-Anwendung es dort ebenfalls trug. Nachschlagen, nicht annehmen.
- Falls `quelleId` im Lesepfad gar nicht mitkommt, ist die Änderung größer als hier beschrieben:
  **dann anhalten und zurückfragen**, statt den Lesepfad umzubauen.

---

## Dazu aus Teil B, weil es einen Task sonst ohne Netz ließe

## B25 — T175 braucht seine benannte Mutation · Koordinator

Der Plankopf verlangt für **jeden** Abnahme-Task (T172–T176) statt einer Rot-Phase die
**Mutation**, die er fängt. T172, T173, T174 und T176 nennen je eine; **T175 nicht** —
es liefert stattdessen eine Tabelle mit vier Fehlerklassen.

→ T175 führt die **zwei** Mutationen, die in seiner eigenen Prosa schon stehen:
1. ein `@ant-design/icons`-Import wandert in `verwaltung/(druck)/etiketten/page.tsx`
   → der Abruf muss HTTP 500 zeigen (Schritt 2, Plan:7112–7114)
2. `className={s.modul}` fällt aus `_ui/DruckRahmen.tsx`
   → HTTP 200, kein Log, jeder Scan grün — **nur der Blick auf die Seite zeigt es**
   (Schritt 4, Plan:7172–7174)
Beide sind temporär und werden **nicht** committet.

---

## Was die 27 kosmetischen Funde angeht

Sie stehen in `vorab-scan.md`, Teil B, und wandern **je Task in dessen Brief** — falsche
Zeilennummern (B2–B5, B8, B9), nicht existierende Helfer-Namen in `guards.test.ts`
(B10), fehlende `data-testid`-Anker (B15–B17), drei Absätze, die Teil 4 immer noch für
ungeschrieben halten (B11, B12). Kein Umsetzer soll sie neu entdecken müssen.
