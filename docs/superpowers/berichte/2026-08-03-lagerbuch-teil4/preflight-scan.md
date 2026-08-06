# Preflight-Scan — Teil 4 (`2026-08-03-lagerbuch-modul-teil4.md`, T62–T87)

Gelesen: der vollständige Plan (11.433 Zeilen), `UEBERGABE-lagerbuch-teil2.md`,
`UEBERGABE-lagerbuch-teil3.md`, `CLAUDE.md`. Jeder Befund unten ist am Quelltext des Repos oder
durch Nachrechnen belegt; Zeilennummern ohne Dateiangabe beziehen sich auf den Plan.

**Stand:** T62 ist bereits gebaut (`task-62-report.md`). Alles hier betrifft T63 aufwärts.

**51 Befunde.** Die neun, die den Bau sofort anhalten, weil ein Task seinen eigenen „Test grün"-Schritt
nicht erreichen kann oder ein Tor bricht:

| # | Kurz | Tasks |
|---|---|---|
| 1 | 27 Quelltext-Scans matchen ihre eigene Begründung; `ohneKommentare()` aus Teil 2 wird nirgends benutzt | 16 Tasks |
| 2 | T64s modulweite Scans: `alleDateien` existiert nicht — entweder dauerhaft leer oder ab Welle 3 rot | T64 + 10 |
| 3 | `const HELFER_CSS` zweimal auf Modulebene → `bauform.test.ts` parst nicht mehr | T64, T87 |
| 4 | Keine DOM-Testdatei trägt `// @vitest-environment jsdom`; Vorgabe ist `node` | 11+ Tasks |
| 5 | `checkAbschluss` gibt `grund: "netz"` **serverseitig** zurück (§2.12) | T75, T63, T79 |
| 6 | T65 trägt ein anderes SVG ein, als Schritt 1 und E7 zusichern | T65 |
| 9 | T73s `slice(0, 8)` erreicht `requireLagerbuchHost` in Zeile 12 nicht | T73 |
| 25 | `verwaltungsZiel()` ohne Argument — die eingecheckte Funktion verlangt `headers` | T81 |
| 28 | T79 fordert einen Chip, den derselbe Task bei `soll={[]}` unterdrückt | T79 |

Die drei Übergabe-Auflagen, die nicht abgedeckt sind: **Befund 13** (Teil-3 Punkt 9, `falte()`-Scan),
**Befund 14** (Teil-2 Punkt 3b, absoluter `callbackUrl`), **Befund 15** (Teil-2 Punkt 2, Gate-Reihenfolge).
Teil-2 Punkt 1 (Reset-Haken) ist geprüft und **nicht** anwendbar — Begründung am Ende.

---

### Befund 1 — Siebenundzwanzig Quelltext-Scans matchen ihre eigene Begründung; Teil 2 hat den Riegel dagegen bereits gebaut, der Plan benutzt ihn nirgends

> **Der schwerwiegendste Befund dieses Scans.** Er betrifft 16 der 26 Tasks, und in jedem einzelnen ist
> der Schritt „Test grün" mit dem im selben Task abgedruckten Quelltext unerreichbar.

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:995` — „`expect(readFileSync(QUELLE, "utf8")).not.toMatch(/"use client"/);`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:1021` — „` * KEIN "use client" (Falle 6): die Datei exportiert WERTE (`RIEGEL_TEXTE`,`" — derselbe Task schreibt diesen Kommentar in Schritt 3 in genau die Datei, die Schritt 1 scannt.
- **Warum das ein echter Widerspruch ist:** Der Scan liest den Rohtext der Datei, Kommentare eingeschlossen. Der Kommentar, den der Plan vorschreibt, enthält die verbotene Zeichenfolge wörtlich — Schritt 4 („Erwartet: PASS") ist mit dem in Schritt 3 abgedruckten Quelltext unerreichbar. Der Bestand hat dafür bereits eine Antwort: `src/app/m/lagerbuch/_lib/bauform.test.ts:70` trägt wörtlich „⚠️ OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT" und stellt `ohneKommentare()` bereit. Kein einziger der neuen Scans in Teil 4 ruft sie. Die naheliegende „Reparatur" ist, den Kommentar zu löschen — also genau die Begründung, die der Plan konservieren will.
- **Betroffene Tasks:** T63, T65, T66, T67, T68, T69, T70, T71, T72, T75, T76, T77, T78, T79, T80, T81, T83, T84, T87

**Alle Fundstellen** (Testzeile → die Kommentarzeile im vorgeschriebenen Quelltext, die sie trifft):

| Test | Muster | Getroffen von | Task |
|---|---|---|---|
| `:995` | `/"use client"/` | `:1021`, `:1023` | T63 |
| `:2116` | `/"use client"/` | `:2167` | T65 |
| `:2470` | `/getDb\(\)/` | `:2534` (`@param db … _db/client.ts#getDb()`) | T66 |
| `:2478` | `/"use client"/` | `:2514` | T66 |
| `:2741` | `/toLocaleTimeString\|toLocaleString\|\bIntl\b/` | `:2786` | T67 |
| `:2749` | `/getHours\|getMinutes\|getFullYear\|getMonth\|getDate\(/` | `:2798` | T67 |
| `:3044` | `/\bsm\b/` | `:3080` (`DIE \`sm\`-VARIANTE ENTFAELLT`) | T68 |
| `:3313` | `/"use client"/` | `:3386` | T69 |
| `:3352` | `/"use client"/` | `:3418` | T69 |
| `:3589` | ``/s\[`/`` | `:3634` (``s[`chip-${ton}`]``) | T70 |
| `:3590` | `/\$\{ton\}/` | `:3634` | T70 |
| `:3599` | `/"use client"/` | `:3626` | T70 |
| `:3859` | `/toLowerCase\(\)/` | `:3909` | T71 |
| `:4289` | `/verwaltung\.module\.css/` | `:4345` | T72 |
| `:4299` | `/^import .* from "@zxing\/(browser\|library)"/m` | `:4331` (`import type { IScannerControls } …`) | T72 |
| `:5899` | `/requireLagerbuchHost/` | `:6003` | T75 |
| `:6406` | `/"use client"/` | `:6453` | T76 |
| `:6412` | `/usePathname\|startsWith/` | `:6457`, `:6458` | T76 |
| `:6800` | `/dev-login\|devLogin\|Demo-Login/` | `:6879` (`core/auth/devLogin.ts:14`) | T77 |
| `:6809` | `/next-auth\|signIn\(/` | `:6863` (`signIn("oidc", …)`) | T77 |
| `:7255` | `/_actions\/buchung/` | `:7304` | T78 |
| `:7932` | `/preselect\|Record<string, Pos\[\]>\|fahrzeuge:/` | `:7994` (`… und \`preselect\` entfallen`) | T79 |
| `:8789` | `/"use client"/` | `:8812` | T80 |
| `:9138` | `/requireLagerbuchAdmin\|moduleAdminPageOrNotFound\|isModuleAdmin/` | `:9197` | T81 |
| `:9848` | `/requireLagerbuchAdmin/` | `:9903` | T83 |
| `:10109` | `/cookies\(\)/` | `:10193-10194` | T84 |
| `:11143` | `/requireLagerbuchAdmin\|moduleAdminPageOrNotFound\|isModuleAdmin/` | `:9197`, `:9903` | T87 |

Die letzten vier sind in Befund 45 gesondert aufgeführt, weil sie zusätzlich eine als **Abnahme**
deklarierte Zusicherung betreffen.

---

### Befund 2 — T64s modulweite Scans sind entweder dauerhaft leer oder ab Welle 3 rot; der Plan benennt eine Hilfsfunktion, die es nicht gibt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:1344-1346` — „`function alleModulCss(): string[] { return alleDateien(MODULWURZEL).filter((p) => p.endsWith(".css")); }`"
- **Kollidiert mit:** `src/app/m/lagerbuch/_lib/bauform.test.ts:28-40` — „`/** Jede .ts/.tsx-Datei unter dem Modulbaum, rekursiv — diese Datei ausgenommen. */ function quellDateien(…)`" mit „`if (!/\.tsx?$/.test(eintrag)) continue;`" und „`if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;`"
- **Warum das ein echter Widerspruch ist:** `alleDateien` und `MODULWURZEL` existieren in der Datei nicht; sie heißen `quellDateien` und `MODUL`, und `:1216` weist an, „der vorhandene [Name] wird benutzt". Damit liefert `alleModulCss()` **immer `[]`** — `quellDateien` gibt nur `.ts`/`.tsx` zurück. Drei der fünf neuen Scans (`max-width: 767.98`, `--ant-` in `_ui/*.module.css`, die Feldschrift-Lücke aus §7.7.2) wären dauerhaft leer-grün, also genau die Ausprägung 3 aus Übergabe-Teil-3 Punkt 8. Schreibt man stattdessen ein neues `alleDateien` ohne Testdatei-Filter, wie der abgedruckte Code es verlangt, wird der `lucide-react`-Scan (`:1478-1479`, ohne Testdatei-Filter) **ab Welle 3 rot**: `_ui/Stepper.test.tsx:3050`, `rahmen.test.tsx:3314`/`:3353`, `HelferChip.test.tsx:3600`, `ArtikelSuche.test.tsx:3870`, `BarcodeScanner.test.tsx:4312` und fünf weitere tragen `lucide-react` in ihrem eigenen Verbots-Regex. Beide Wege brechen; der Plan entscheidet nicht, welcher gemeint ist.
- **Betroffene Tasks:** T64, T68, T69, T70, T71, T72, T76, T77, T78, T79, T80

---

### Befund 3 — T64 deklariert `HELFER_CSS` zweimal und importiert `join` ein zweites Mal in dieselbe Datei

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:1219-1220` (Schritt 1) — „`import { join } from "node:path";`" / „`const HELFER_CSS = join(MODULWURZEL, "_ui/helfer.module.css");`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:1341` (Schritt 3, dieselbe Datei) — „`const HELFER_CSS = join(MODULWURZEL, "_ui/helfer.module.css");`"; ferner `src/app/m/lagerbuch/_lib/bauform.test.ts:3` — „`import { join, relative } from "node:path";`"
- **Warum das ein echter Widerspruch ist:** Beide Blöcke werden ausdrücklich „ans **Ende**" derselben Datei angehängt, beide auf Modulebene. `const HELFER_CSS` zweimal ist ein `SyntaxError: Identifier 'HELFER_CSS' has already been declared` — die Datei parst nicht mehr, und mit ihr fällt die gesamte Bauform-Suite aus Teil 2. Der zweite `join`-Import ist zusätzlich ein Duplikat gegen die bestehende Zeile 3.
- **Betroffene Tasks:** T64

---

### Befund 4 — Keine der DOM-Testdateien trägt `// @vitest-environment jsdom`; die Projektvorgabe ist `node`

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:2662` — „`import { describe, it, expect, afterEach, vi } from "vitest";`" als erste Zeile von `_ui/Restzeit.test.tsx` (ebenso `:2926`, `:3280`, `:3544`, `:3748`, `:4108`, `:6308`, `:6688`, `:7109`, u. a.)
- **Kollidiert mit:** `vitest.config.ts:7` — „`environment: "node",`"
- **Warum das ein echter Widerspruch ist:** Alle 29 Bestandsdateien, die `@/app/m/qr/_lib/test-dom` importieren, tragen `// @vitest-environment jsdom` in den ersten drei Zeilen — ohne Ausnahme (nachgezählt über `src/`). `mount()` ruft `document`; ohne den Docblock stirbt jeder dieser Tests mit `document is not defined`, und Schritt 2 wäre nicht der angekündigte Fehlschlag „Failed to resolve import". Die Zeichenfolge `vitest-environment` kommt im gesamten Plandokument **null Mal** vor.
- **Betroffene Tasks:** T67, T68, T69, T70, T71, T72, T76, T77, T78, T79, T80 (und jede weitere DOM-Testdatei der Wellen 7)

---

### Befund 5 — `checkAbschluss` erzeugt `grund: "netz"` serverseitig — Global Constraint 12 verbietet das ausdrücklich

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:6023-6024` — „`return { ok: false, grund: "netz", text: "Die Eingabe war unvollständig. …" };`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:431` (§2, Punkt 12) — „**`"netz"` entsteht NIE serverseitig.** Es ist der Grund, den der Client im `catch` selbst setzt."
- **Warum das ein echter Widerspruch ist:** Der `safeParse`-Fehlerzweig gibt einen Grund zurück, den der Vertrag ausschließlich dem Client zuweist. Der Bruch ist still und typkorrekt (`HelferGrund` enthält `"netz"`). T63 zementiert das Gegenteil sogar mechanisch: `:1000` verlangt einen Quelltext-Scan `/netz.*nie serverseitig/is` auf `actionTypen.ts`, und `:1059` schreibt den Satz „⚠️ `"netz"` ENTSTEHT NIE SERVERSEITIG" in die Datei. T79 reicht `r.grund` ungefiltert in die Anzeigelogik (`:8141`); kein Test prüft den Grund, `:5813` prüft nur `r.ok`.
- **Betroffene Tasks:** T75, T63, T79

---

### Befund 6 — T65 trägt in Schritt 4 ein anderes SVG ein als das, was Schritt 1 und E7 zusichern

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:2220` — „`export const PWA_ICON_SVG = \`<svg … viewBox="0 0 512 512" width="512" height="512" …>`" mit sieben `rect`-Elementen auf `#c8000f`
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:1984-1989` (derselbe Task, der als „VOLLSTÄNDIGER Dateiinhalt" ausgewiesene 64×64-Block) und `:2084-2086` — „`expect(Buffer.byteLength(PWA_ICON_SVG, "utf8")).toBe(385);`" / „`.toBe("98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34")`"
- **Warum das ein echter Widerspruch ist:** Der 64×64-Block ergibt nachgemessen exakt 385 Bytes und exakt diese Prüfsumme (gegen `../lagerbuch/src/app/icon.svg` @ `ca04eb1`). Der bei `:2220` einzutragende 512×512-Block hat 745 Bytes und eine andere Prüfsumme; er ist die unter A-E1 „neu gezeichnete" Fassung, die `:1978` selbst für gegenstandslos erklärt, und widerspricht zusätzlich E7 (`:243-245`: „ein abgerundetes Quadrat auf `#1a1d20` mit **einer roten und zwei weißen** Regalmarken"). Wer Schritt 4 wörtlich ausführt, bekommt einen roten Test aus demselben Task. Zusatz: die 385 Bytes enthalten den Schluss-Zeilenumbruch — das Template-Literal darf nicht direkt nach `</svg>` schließen.
- **Betroffene Tasks:** T65

---

### Befund 7 — T71 erwartet eine Umlautfaltung, die `falte()` nicht leistet

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:3812-3813` — „`await fill("[data-rolle='artikel-suche']", "waerme"); expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(1);`" unter dem Titel „findet ueber die Faltung auch bei abweichenden Umlauten"
- **Kollidiert mit:** `src/app/m/lagerbuch/_lib/suche.ts:20` — „`export const falte = (s: string): string => s.toLowerCase();`"
- **Warum das ein echter Widerspruch ist:** `falte("Wärmedecke")` ist `"wärmedecke"`, `falte("waerme")` ist `"waerme"`; `"wärmedecke".includes("waerme")` ist `false`. Erwartet wird 1 Treffer, tatsächlich sind es 0. Der Testtitel behauptet zudem eine Fähigkeit, die die eine Faltung des Moduls bewusst nicht hat.
- **Betroffene Tasks:** T71

---

### Befund 8 — T71 erwartet ein `trim()`, das die abgedruckte Implementierung nicht hat — und das der Server-Filter sehr wohl hat

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:3818-3819` — „`await fill("[data-rolle='artikel-suche']", "   mull   "); expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(1);`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:3931` — „`const nadel = falte(q);`"; und `src/app/m/lagerbuch/_lib/artikelFilter.ts:54` — „`const q = falte(f.suche.trim());`"
- **Warum das ein echter Widerspruch ist:** `falte` trimmt nicht. `nadel` ist `"   mull   "`, `if (!nadel)` greift nicht, kein Artikelname enthält den Wert — Ergebnis 0 statt 1. Zugleich ist das eine echte Divergenz zum Server-Prädikat aus Teil 3, das an derselben Stelle `trim()` vor `falte()` setzt: Client- und Serversuche liefern für dieselbe Eingabe verschiedene Treffermengen.
- **Betroffene Tasks:** T71

---

### Befund 9 — T73s Bauform-Test liest acht Zeilen, der vorgeschriebene Code setzt den Riegel in Zeile zwölf

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:4884` — „`const ersteZeilen = rumpf.split("\n").slice(0, 8).join("\n");`" mit `:4885` „`expect(ersteZeilen).toMatch(/requireLagerbuchHost\(/);`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:4943-4954` — die Signatur belegt Index 0–3, `const kopf` Index 4, eine Leerzeile Index 5, der fünfzeilige SCHRITT-1-Kommentar Index 6–10, und erst Index 11 ist „`requireLagerbuchHost(kopf);`"
- **Warum das ein echter Widerspruch ist:** `slice(0, 8)` endet mitten im Kommentar. Der Test schlägt gegen genau den Code fehl, den derselbe Task in Schritt 3 vorschreibt. Der Gegenbeweis steht in T74: dort ist derselbe `slice(0, 8)`-Test (`:5233`) grün, weil der Kommentar nur eine Zeile hat. Die naheliegende Reparatur ist, den Riegel-Kommentar zu kürzen — also die Begründung zu löschen, die §7.3 hier verlangt.
- **Betroffene Tasks:** T73

---

### Befund 10 — Ein `it()` ohne jede Zusicherung, direkt neben seinem echten Zwilling

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:5831-5835` — „`it("das JSON traegt \`version: 2\` und die fuenf Listen", () => { … });`" — der Rumpf enthält ausschließlich Kommentar, kein `expect`
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:5837` — „`it("das JSON traegt version 2 und alle fuenf Listen — geprueft", async () => {`"
- **Warum das ein echter Widerspruch ist:** Vitest meldet den leeren Rumpf als bestanden. Zwei fast gleichnamige Tests stehen direkt untereinander; der erste zählt in jeder Bestandsaufnahme als „geprüft", ohne etwas zu prüfen — und T87 zählt Testkörper mechanisch nach. Genau die Klasse, gegen die Übergabe-Teil-3 Punkt 8 geschrieben ist.
- **Betroffene Tasks:** T75, T87

---

### Befund 11 — T66s `beforeEach` benutzt `t.aufraeumen()`; `TestDb` kennt nur `schliessen()`

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:2390` — „`afterEach(() => t.aufraeumen());`" (zweite Fundstelle: `:5599`)
- **Kollidiert mit:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil1.md:2297-2332` — „`export type TestDb = { db: …; sqlite: Database.Database; schliessen: () => void; };`"
- **Warum das ein echter Widerspruch ist:** Teil 1 (T9) definiert genau drei Felder; alle übrigen 20+ Verwendungen in den Teilen 1, 2, 3 und 5 rufen `t.schliessen()`. `t.aufraeumen()` scheitert schon im `pnpm typecheck` und zur Laufzeit; zusätzlich bliebe die temporäre Datenbankdatei liegen.
- **Betroffene Tasks:** T66, T75

---

### Befund 12 — T66s Token-Fixture lässt die NOT-NULL-Spalte `createdBy` aus

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:2382` — „`{ id: "tk-aktiv", code: "482-137", label: "RTW 1", aktiv: true, zielTyp: "fahrzeug", zielId: "fz-1", createdAt: new Date(), lastUsedAt: null }`" (ebenso `:2384`, `:2386`)
- **Kollidiert mit:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil1.md:1846` — „`createdBy: text("created_by").notNull(),`"
- **Warum das ein echter Widerspruch ist:** Die Spalte ist `notNull()` ohne Default. Drizzle verlangt sie damit im Insert-Typ, und SQLite wirft `NOT NULL constraint failed: tokens.created_by`. Das `beforeEach` scheitert vor jedem einzelnen Test des Tasks. (`scopeLagerortId` ist nullable und darf fehlen — `createdBy` nicht.)
- **Betroffene Tasks:** T66

---

### Befund 13 — Übergabe-Teil-3 Punkt 9: der `falte()`-Quelltext-Scan für `_lib/artikelFilter.ts` fehlt in T64

- **Planstelle:** `UEBERGABE-lagerbuch-teil3.md:196-198` — „⚠️ **Kein Netz sichert die Bindung.** Empirisch belegt: ein Rückfall auf `.toLowerCase()` bliebe grün. Falls die Entscheidung ratifiziert wird, gehört ein Quelltext-Scan in die **Teil-4-Erweiterung von `_lib/bauform.test.ts`** — dort wird die Datei ohnehin angefasst."
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:1331-1519` — die fünf Scans, die T64 an `_lib/bauform.test.ts` anhängt: `max-width`, `--ant-` (CSS), `--ant-` (TSX), `antd`/`lucide`, `usePathname`/`useSearchParams`. Kein `falte`-Scan.
- **Warum das ein echter Widerspruch ist:** Der einzige `falte`-Scan des Plans steht in T71 (`:3856-3859`) und liest ausschließlich `_ui/ArtikelSuche.tsx` — die Datei, um die es in der Auflage geht (`_lib/artikelFilter.ts:198,201`, Teil 3) wird von keinem Scan berührt. Die Auflage nennt T64 namentlich als den Ort, und `artikelFilter` kommt im ganzen Plan genau einmal vor (`:3741`, in einer Nebenbemerkung). Die Bindung bleibt damit ungesichert; ein Rückfall auf `.toLowerCase()` bliebe grün, genau wie die Übergabe es beschreibt. Zusatz: derselbe T71-Scan ist wegen Befund 1 ohnehin rot.
- **Betroffene Tasks:** T64, T71

---

### Befund 14 — Übergabe-Teil-2 Punkt 3b: der Plan baut genau den absoluten `callbackUrl`, den der Dev-Login verwirft, und erwähnt die Ursache nirgends

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:6698` — „`const LOGIN = "/login?callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung";`" (dieselbe Zusicherung in T81, `:9053`)
- **Kollidiert mit:** `src/components/login-form.tsx:220` — „`window.location.assign(callbackUrl.startsWith("/") ? callbackUrl : "/");`"; dazu `UEBERGABE-lagerbuch-teil3.md:9-11` — „insbesondere ihr Punkt 1 … und ihr Punkt 3b (der Dev-Login verwirft absolute `callbackUrl`-Werte …) sind **nicht** erledigt."
- **Warum das ein echter Widerspruch ist:** Der Verwaltungsknopf des Gates trägt einen **absoluten** `callbackUrl`; der Dev-Login verwirft jeden Wert, der nicht mit `/` beginnt, und landet auf `/`. T87 fährt seine Abrufprobe gegen die `playwright.config.ts` aus Teil 3, T60, und dort ist `AUTH_DEV_LOGIN=true` gesetzt. Die Zeichenfolgen `login-form` und die Übergabe-Auflage kommen im gesamten Plan **null Mal** vor — weder als Auflage an Teil 6 noch als Runbook-Eingabe. Der Weg vom Gate in die Verwaltung ist damit in jeder Dev- und E2E-Umgebung still kaputt, und der Plan sagt nirgends, dass er es weiß.
- **Betroffene Tasks:** T77, T81, T87

---

### Befund 15 — Übergabe-Teil-2 Punkt 2 bleibt unbeantwortet: die Gate-Reihenfolge steht dreimal wörtlich da und hat kein mechanisches Netz

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:82-84` (§0) — „**Punkt 2 — vor dem Bau des Gate-Wegs zu entscheiden.** Die Reihenfolgezusage der Gate-Schranke … hat nirgends ein mechanisches Netz."
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:4954-4986` (T73), `:5308-5327` (T74) und `:9582` (T81) — dreimal derselbe Block Host → Sperre → normalisieren → `redeemToken` → Cookie ohne Budgetverbrauch; dazu `:600-612` (§4, „Was diese vier Gates strukturell NICHT sehen"), das die Riegelreihenfolge **nicht** aufführt.
- **Warum das ein echter Widerspruch ist:** §0 stellt die Frage ausdrücklich als „vor dem Bau zu entscheiden" hin, und im gesamten Plan folgt keine Entscheidung. Die fünf Scans in T64 enthalten keinen Reihenfolge-Scan, E11 verbietet diesem Plan jede E2E-Datei, und §3 verbietet Welle 4 zugleich jede gemeinsame neue Datei — die Duplikation ist also erzwungen, und damit muss die Zusage einen Scan tragen. Sie hat nur drei voneinander unabhängige, mock-basierte Unit-Testsätze; genau die Konstellation, in der die dritte Kopie die Reihenfolge verliert und kein Gate es sieht. `_lib/gateSchranke.ts:119-124` benennt diesen Fehler als in dieser Suite bereits produktiv eingetreten. (Die Reihenfolge selbst ist in allen drei Kopien Zeile für Zeile korrekt — es fehlt allein das Netz.)
- **Betroffene Tasks:** T73, T74, T81, T64

---

### Befund 16 — T72: die 2-Sekunden-Sperre und das „busy bleibt gesetzt" werden von Tests bewacht, die ohne sie identisch grün blieben

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:4253-4255` — „`await vi.advanceTimersByTimeAsync(2100); await submitForm("[data-rolle='scan-form']"); expect(zuBarcode).toHaveBeenCalledTimes(2);`" und `:4265` — „`expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);   // genau EINE Navigation`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:4550` — „`busyRef.current = false;`" im `onSubmit` des Formulars; und `:4424` — „`return;   // busy bleibt gesetzt, sonst navigiert ein Folge-Scan doppelt`"
- **Warum das ein echter Widerspruch ist:** Der einzige Auslöser im Test ist die manuelle Absendung, und die setzt `busyRef` unmittelbar davor selbst zurück — ob die Sperre 2 Sekunden, 0 Sekunden oder gar nicht existiert, ändert am Ergebnis nichts. Beim zweiten Test ruft nach dem einen `submitForm` nichts mehr `pruefeCode`; entfernte man das `return`, bliebe er grün. Beide sind als 1:1-Pflicht aus §7.6.3 ausgewiesen und haben damit keine Absicherung. Zusätzlich prüfen alle T72-Tests ausschließlich `sichererKontext(false)` — die vier Kamerazustände aus `kameraText()` (`:4363-4379`), die §4 ausdrücklich T72 zuweist, sind ungeprüft, und E11 verbietet einen E2E als Ersatz.
- **Betroffene Tasks:** T72

---

### Befund 17 — T72: `vi.spyOn(window.location, "assign")` wirft unter jsdom 26 und reißt jeden Test der Datei ab

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:4133` — „`vi.spyOn(window.location, "assign").mockImplementation((u: string | URL) => {`" im `beforeEach`
- **Kollidiert mit:** `package.json` — „`"jsdom": "^26.0.0"`"; `Location`-Member sind per WebIDL `[LegacyUnforgeable]`, also nicht konfigurierbar (`Object.getOwnPropertyDescriptor(location,"assign")` → `configurable: false`)
- **Warum das ein echter Widerspruch ist:** `vi.spyOn` arbeitet über `Object.defineProperty` und wirft „Cannot redefine property: assign". Der Wurf steht im `beforeEach`, gilt also für alle Tests der Datei — auch die, die mit `location` nichts zu tun haben. Das Repo hat dafür keinen Präzedenzfall; Teil 5 umgeht das Problem, indem T138 den Scanner per `vi.mock` ersetzt.
- **Betroffene Tasks:** T72

---

### Befund 18 — T78: die einzige `fmtVerfall`-Zusicherung ist von der Fixture selbst getragen, und der Chip-Test ist bei leerem Selektor vakuum-grün

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:7143-7144` — „`expect(zeilen[1].textContent).toContain("läuft ab 09/26"); expect(zeilen[1].textContent).toContain("09/26");   // fmtVerfall`" und `:7149-7151` — „`for (const chip of queryAll("[data-rolle='helfer-chip']")) { expect(chip.className).not.toContain("undefined"); }`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:7120` — die Fixture trägt `text: "läuft ab 09/26"`; und `:7456` — „`<span>{fmtVerfall(c.verfall)}</span>`"
- **Warum das ein echter Widerspruch ist:** „09/26" steht bereits im Chip-Text der Fixture; entfernte man `fmtVerfall` ersatzlos, bliebe der Test grün. Die `for`-Schleife führt bei leerem Trefferarray null Zusicherungen aus — benennt jemand das `data-rolle` in T70 um, bleibt der einzige §5.17-Regressionstest dieser Datei grün. T79 macht es an `:7731` richtig (`toBeGreaterThanOrEqual(2)` davor).
- **Betroffene Tasks:** T78

---

### Befund 19 — T77: der einzige Action-Aufruf des Gates steht in keinem `try/catch`; §2 Punkt 11 nimmt ihn nicht aus

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:6894` — „`const [zustand, formAction, laeuft] = useActionState<GateZustand, FormData>(einloesenAmGate, {});`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:428` (§2, Punkt 11) — „**Jeder Action-Aufruf im Client steht in `try/catch` mit `grund: "netz"`.**"
- **Warum das ein echter Widerspruch ist:** `_ui/Gate.tsx` ist ausdrücklich eine Client-Insel (`"use client"`, `:6836`) und ruft die Server Action `einloesenAmGate`. Bricht die Verbindung, verwirft `useActionState` in die nächste Error Boundary — genau der Zustand, den Falle 66 als verboten benennt. `GateZustand` kennt nur `fehler`, `"netz"` darf nach §2.12 nicht serverseitig entstehen, und der Bauform-Block `:6788-6822` enthält keinen Netz-Fall. Der Plan nimmt das Gate an keiner Stelle von §2.11 aus.
- **Betroffene Tasks:** T77, T73

---

### Befund 20 — T75 und T78: die `Consumes`-Blöcke nennen Importe, die der abgedruckte Code nicht hat und nicht haben darf

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:5422-5424` — „`_lib/actionTypen.ts` (T63) — `type HelferErgebnis`, `RIEGEL_TEXTE`, `NETZ_TEXT_CHECK` (nur der Typ-Import für den Client); `_lib/checkNutzlast.ts` (Teil 3, T43) — **nur die Typen** `CheckNutzlast`, `CheckZaehlung`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:5921-5935` — der Importblock von `check.ts` führt nur „`import { RIEGEL_TEXTE, type HelferErgebnis } from "../_lib/actionTypen";`", kein `NETZ_TEXT_CHECK`, kein `checkNutzlast`
- **Warum das ein echter Widerspruch ist:** `NETZ_TEXT_CHECK` gehört laut `:1094` und T79 (`:7982`) ausschließlich in die Client-Insel; in einer `"use server"`-Datei hat er nichts zu suchen, und die Klammer „nur der Typ-Import für den Client" ist in sich unschlüssig. Wer der Liste folgt, importiert ungenutzte Bindungen und bricht `pnpm lint`. Derselbe Fehler in T78: `:7038-7039` verlangt `leerText`, obwohl `:7341` das Neuformulieren in der Insel ausdrücklich verbietet, und lässt umgekehrt `HelferGrund` weg, das der Code (`:7292`) importiert.
- **Betroffene Tasks:** T75, T78

---

### Befund 21 — T65: „20 Zusicherungen" trifft weder die Test- noch die `expect`-Zahl

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:2259` — „Erwartet: PASS, 20 Zusicherungen."
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:2032-2122` — der abgedruckte Testkörper: 3 Icons × 4 `it` = 12, plus 2 (`pngAntwort`), plus 5 (`PWA_ICON_SVG`), plus 2 (Bauform) = **21** Testfälle; an `expect(…)`-Aufrufen sind es **27**.
- **Warum das ein echter Widerspruch ist:** Die Zeile dient als Abnahmekriterium von Schritt 5. Sie trifft keine der beiden Größen und bestätigt damit fälschlich, wenn ein Testfall verlorengeht — dieselbe Klasse wie die drei falschen Erwartungswerte aus Teil 3 (Übergabe-Teil-3 Punkt 8, Ausprägung 6).
- **Betroffene Tasks:** T65

---

### Befund 22 — E6 und T65 legen die Prüfquelle der Byte-Längen gegensätzlich fest

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:1958` — „⚠️ **Der Test liest NICHT `../lagerbuch/public/`.**"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:226-228` (E6) — „prüft die Byte-Längen (1558 · 5458 · 3290) in `_lib/pwaIcons.test.ts` **gegen dieselben Dateien**"
- **Warum das ein echter Widerspruch ist:** E6 ist eine verbindliche Festlegung des Plans und schreibt die Prüfung gegen die Alt-App-Dateien fest; T65 legt das Gegenteil fest und begründet es (kein Nachbar-Checkout in Container und CI). Sachlich ist T65 die bessere Regel — die drei fest eingetragenen Prüfsummen stimmen nachgemessen mit `../lagerbuch/public/*.png` @ `ca04eb1` überein —, aber der §1-Text wurde nicht nachgezogen, und ein Umsetzer trifft damit auf zwei sich ausschließende Vorgaben.
- **Betroffene Tasks:** T65

---

### Befund 23 — §2 Punkt 3 verbietet wörtlich jedes `nav` für `/helfer/*`; T76 rendert eines, und E11 verlangt es

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:6543` — „`<nav className={s.tableiste} aria-label="Helfer-Bereiche" data-testid="lb-tableiste">`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:393` (§2, Punkt 3) — „**Kein `<Shell>`, kein `nav`, kein App-Switcher, kein `SuiteNavItem` für `/helfer/*`.**"
- **Warum das ein echter Widerspruch ist:** Ein Wortlaut-, kein Sachwiderspruch: der Folgesatz („Das Modul-Wurzel-Layout … trägt **ausschließlich** `metadata.manifest` und `{children}`") begrenzt das Verbot erkennbar auf die Suite-Navigation, und E11 verlangt `data-testid="lb-tableiste"` ausdrücklich **am `<nav>`**. Die Auflösung steht aber nirgends bei §2.3. Wer den Constraint wörtlich nimmt, baut die Tab-Leiste als `<div>` und bricht damit E11 und T171.
- **Betroffene Tasks:** T76

---

### Befund 24 — §2 Punkt 16 verbietet „NULL Media Queries"; T64s eigener Test verlangt eine

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:446` (§2, Punkt 16) — „**`_ui/helfer.module.css` enthält NULL Media Queries.**"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:1303-1304` — „`expect(readFileSync(HELFER_CSS, "utf8")).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);`"
- **Warum das ein echter Widerspruch ist:** Der Constraint ist absolut formuliert, T64 verlangt eine `prefers-reduced-motion`-Abfrage und benennt sie im Stylesheet-Kommentar (`:1536-1537`) als Ausnahme. Selbstkorrigierend (T64s Test gewinnt), aber ein Umsetzer, der §2 als die verbindliche Liste liest, streicht die Zeile und verliert den Zweig, den `globals.css:158-160` heute schon hat.
- **Betroffene Tasks:** T64

---
</content>

### Befund 25 — T81 ruft `verwaltungsZiel()` ohne Argument; die eingecheckte Funktion verlangt `headers`

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:9243` — „`const ziel = verwaltungsZiel();`"
- **Kollidiert mit:** `src/app/m/lagerbuch/_lib/zugang.ts:205` — „`export function verwaltungsZiel(headers: Headers): string {`"
- **Warum das ein echter Widerspruch ist:** Die Datei ist bereits eingecheckt und gehört Teil 2 (T23) — Teil 4 darf sie nicht ändern. Der Aufruf ohne Argument ist „Expected 1 arguments, but got 0" und bricht `pnpm typecheck` in T81 Schritt 5. Der Test sieht es nicht, weil `vi.mock("./_lib/zugang")` (`:8979`) die Funktion als null-stellig ersetzt. Der `Consumes`-Block (`:8928`) und die Importzeile (`:9169`) übernehmen die alte, in `teil2.md:3948` abgedruckte Signatur, die es im Bestand nicht mehr gibt.
- **Betroffene Tasks:** T81

---

### Befund 26 — T81s `startsWith("https://")`-Weiche baut in Dev und E2E den INNEREN Pfad in den `callbackUrl`

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:9245` — „`? (ziel.startsWith("https://") ? new URL(sauber, ziel).toString() : \`/m/lagerbuch${sauber}\`)`"
- **Kollidiert mit:** `src/app/m/lagerbuch/_lib/zugang.ts:211` — „`const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";`"; und `2026-08-03-lagerbuch-modul-teil4.md:406` (§2, Punkt 6) — „Jedes `href`, jedes `Location`, jedes `redirect()` trägt den ÄUSSEREN Pfad"
- **Warum das ein echter Widerspruch ist:** `verwaltungsZiel` liefert im gesamten Dev- und E2E-Betrieb ein `http://`-Ziel (belegt durch `zugang.test.ts:265`, das `http://lagerbuch.localtest.me:3000/verwaltung` erwartet). Der else-Zweig greift damit auch dann, wenn ein gültiger äußerer Host bekannt ist, und schreibt `callbackUrl=/m/lagerbuch/a/art-9` — den inneren Pfad, während der Browser auf dem Modul-Host steht. `zugang.ts:176-179` streicht diesen Rückfall ausdrücklich („KEIN RELATIVER RUECKFALL MEHR — er trug nicht"); T81 baut ihn wieder ein. Kein Test betritt den Zweig, weil der Mock hart `https://` liefert.
- **Betroffene Tasks:** T81

---

### Befund 27 — E1 verspricht die Rollen-Weiche „vollständig in §6"; §6 enthält sie nicht

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:137-138` — „**Damit Teil 6 die Rollen-Weiche nicht neu herleiten muss, steht sie vollständig in der Abschlusstabelle dieses Plans (§6).**"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:11338` (§6.2) — der einzige `/g`-Eintrag endet mit „**Was dieser Plan dafür liefert: `_lib/barcode.ts#normalisiereBarcode` (T62)**"
- **Warum das ein echter Widerspruch ist:** §6.1–§6.5 führen die Action-Tabelle, die Eigentümertabelle, vier Auflagen, drei Korrekturen und die offenen Fragen — an keiner Stelle die drei Ausgänge der Rollen-Weiche. Die einzige ausgeschriebene Weiche des Plans steht in T83 (`:9686-9692`) und gilt `/a/<id>`; sie unterscheidet sich fachlich von `/g` (dort „leiten **alle** Trefferfälle weiter", `:123`). Die Zusage, die den Schnitt „`/g` gehört Teil 6" überhaupt trägt, ist nicht eingelöst.
- **Betroffene Tasks:** T81, T83, T87

---

### Befund 28 — T79s erster Abschluss-Test fordert einen Chip, den derselbe Task bei `soll={[]}` unterdrückt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:7787-7791` — „`await mount(<CheckFlow fahrzeug={FZ} soll={[]} geraete={[GERAET]} flaschen={[]} … />); await click(ABSCHLIESSEN); … expect(t).toContain("3 aus Handlager geholt");`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:8097` — „`const hatArtikel = soll.length > 0;`" und `:8193` — „`{hatArtikel && <HelferChip ton="ok">{ergebnis.nachgefuellt} aus Handlager geholt</HelferChip>}`"
- **Warum das ein echter Widerspruch ist:** Bei leerem `soll` ist `hatArtikel === false`, der Chip wird gar nicht gerendert, und die Zusicherung schlägt deterministisch fehl — während Schritt 4 „Erwartet: PASS" verlangt. Entweder braucht die Fixture eine Position (dann ändert sich aber die adaptive Schrittfolge und `ABSCHLIESSEN` liegt nicht mehr im Geräteschritt), oder die `hatArtikel`-Bedingung ist falsch. Der Task entscheidet es nicht.
- **Betroffene Tasks:** T79

---

### Befund 29 — Übergabe-Teil-3 Punkt 4: `letzterDruck` wird durchgereicht und nirgends gelesen; „nicht gemessen" fehlt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:8016` — „`id: string; name: string; nennfuelldruckBar: number; letzterDruck: number | null;`" — im gesamten Rumpf von `CheckFlow.tsx` kommt `letzterDruck` kein zweites Mal vor; der Sauerstoffschritt zeigt nur `druck[f.id] ?? f.nennfuelldruckBar` (`:8113`)
- **Kollidiert mit:** `UEBERGABE-lagerbuch-teil3.md:83` — „**Teil 5 muss den Null-Fall anzeigen** („nicht gemessen"), sonst steht dort ein leeres Feld ohne Erklärung."
- **Warum das ein echter Widerspruch ist:** `_lib/lesepfade/o2.ts` setzt `letzterDruck` auf `null`, wenn keine Messung vorliegt; T85 reicht den Wert durch (`:10613`), T79 nimmt ihn im Typ entgegen und rendert weder ihn noch die Ersatzaussage. Der Sauerstoffschritt zeigt stattdessen „Nennfülldruck nicht hinterlegt" (`:8530-8532`) — das ist eine **andere** Aussage (kein hinterlegter Sollwert vs. keine Messung). Die Übergabe adressiert zwar Teil 5, aber die einzige Oberfläche, die den Wert bekommt, entsteht hier; die Prop bleibt tot.
- **Betroffene Tasks:** T79, T85

---

### Befund 30 — T79: die neue §5.12-Regel „ohne Nennfülldruck nicht bewertbar" ist von keinem Test berührt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:8523` — „`const st = f.nennfuelldruckBar > 0 ? o2Status(wert, f.nennfuelldruckBar) : null;`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:7815-7826` — der einzige Test dazu („nennt nicht bewertbare Flaschen (NEU, §5.12)") montiert mit `soll={[]} geraete={[GERAET]} flaschen={[]}` und prüft nur die Ergebniskarte gegen einen gemockten Serverwert
- **Warum das ein echter Widerspruch ist:** Der Sauerstoffschritt wird in **keinem** Test dieser Datei gerendert, und die einzige Flaschen-Fixture hat `nennfuelldruckBar: 200`. Ersetzte man `:8523` durch ein nacktes `o2Status(wert, f.nennfuelldruckBar)`, bliebe die gesamte Suite grün. Die Begründung im Plan („die Helferin liefe los, um eine VOLLE Flasche zu tauschen") beschreibt genau den Schaden, den niemand fängt.
- **Betroffene Tasks:** T79

---

### Befund 31 — T79 und T80 legen dieselbe URL-Form unterschiedlich fest, in derselben Welle

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:8251` — „`href={\`/helfer/check?fz=${fahrzeug.id}\`}`" (T79, zementiert durch den Test `:7833-7834`)
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:8841` — „`href={\`/helfer/check?fz=${encodeURIComponent(f.id)}\`}`" (T80), begründet in `:8778-8784` mit „Ein importierter Alt-Bestand kann aber andere IDs tragen, und ein rohes `?fz=a b` erzeugt eine kaputte URL."
- **Warum das ein echter Widerspruch ist:** Beide Tasks laufen gleichzeitig in Welle 6, erzeugen dieselbe URL-Form für dieselbe Fahrzeug-ID, und die Gefahr, mit der T80 die Kodierung begründet, besteht in T79 unverändert — „Nochmal dieses Fahrzeug" führt auf exakt denselben Pfad. Entweder ist T80s Begründung falsch, oder T79 baut für Alt-Bestands-IDs eine kaputte URL.
- **Betroffene Tasks:** T79, T80

---

### Befund 32 — T79: der Nachfüll-Knappheitstest kann seine Bedingung rechnerisch nicht erreichen

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:7768-7775` — „`soll={[POS({ id: "sp-1", soll: 5, handlagerBestand: 2 }), POS({ id: "sp-2", fachLabel: "Fach 2", soll: 5, handlagerBestand: 2 })]}`" … „`expect(exists("[data-rolle='nf-knappheit']")).toBe(true);`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:8311-8318` — „`for (const p of soll) if (!rest.has(p.artikelId)) rest.set(p.artikelId, p.handlagerBestand);`" … „`const nimm = Math.min(luecke, uebrig);`"; und `:8633` — „`some((e) => e.gewuenscht > e.verfuegbar)`"
- **Warum das ein echter Widerspruch ist:** Beide Fixtures tragen die Vorgabe-`artikelId` `"art-1"`, also ist `rest = {art-1: 2}`. Greedy vergibt `nf[sp-1] = 2`, `nf[sp-2] = 0`; `gewuenscht = 2`, `verfuegbar = 2`, und `2 > 2` ist falsch — die Warnung wird nicht gerendert, der Test schlägt fehl. Verschärfend: `:7771-7773` ruft `b.click()` roh, ohne das `act`-Flushen des Harness, sodass die Ist-Werte nicht einmal auf 0 kommen. Der greedy Deckel macht die Bedingung auf diesem Weg konstruktiv unerreichbar.
- **Betroffene Tasks:** T79

---

### Befund 33 — T79: der `noText`-Test schließt jedes `input[aria-label]` in der Zählliste aus; das Verfallsfeld ist genau so eins

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:7708` — „`expect(exists("[data-rolle='zaehlliste'] input[aria-label]")).toBe(false);`" (montiert mit `soll={[POS()]}`, `:7706`)
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:8376-8380` — „`<input type="month" inputMode="numeric" pattern="\d{4}-\d{2}" aria-label={\`Verfall ${p.artikelName}\`}`" innerhalb von `<div data-rolle="zaehlliste">` (`:8340`)
- **Warum das ein echter Widerspruch ist:** Bei einer Position ist `traegtFeld` wahr, das Monatsfeld wird gerendert und liegt im Teilbaum des Selektors; `exists` liefert `true`, der Test schlägt fehl. Er will die `noText`-Variante des Steppers prüfen (T68, `:3165-3166` belegt, dass sie gar keinen Input erzeugt) und trifft das falsche Element.
- **Betroffene Tasks:** T79, T68

---

### Befund 34 — T79: „ALLE sechs Client-Zustaende bleiben stehen" prüft genau einen

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:7915` / `:7923` — „`it("ALLE sechs Client-Zustaende bleiben stehen", async () => {`" … „`expect(query("[data-rolle='stepanzeige']").textContent).toBe("3");`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:8056-8063` — „DIE SECHS CLIENT-ZUSTAENDE (1:1, `:62-71`). Sie bleiben bei JEDEM Fehler stehen — das ist die tragende Zusage von §7.4.4 und §7.10.3."
- **Warum das ein echter Widerspruch ist:** Zugesichert wird nur `ist`. Setzte man im `catch` zusätzlich `setNachfuell({})`, `setGeraeteState({})`, `setDruck({})`, `setVerfallState({})` und `setPhase("zaehlen")` zurück, bliebe der Test grün — vier verlorene Zustände bliebe er blind gegenüber, und den `setPhase`-Reset erst recht, weil er ohnehin per `zurueck-zaehlen` zurückspringt. Derselbe Mangel im Erneuerungs-Test (`:7846-7855`).
- **Betroffene Tasks:** T79

---

### Befund 35 — T79: im Geräteschritt trägt die Auswahl allein die Chipfarbe

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:8451-8459` — „`<button type="button" onClick={…}><HelferChip ton={e.vorhanden ? "ok" : "grau"}>vorhanden</HelferChip></button>`" … „`<HelferChip ton={!e.vorhanden ? "rot" : "grau"}>fehlt</HelferChip>`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:3536-3537` (T70) — „**Der Chip trägt IMMER Text.** Es gibt keinen Modus „nur Farbe" (`docs/design/README.md`, „Bedeutung nie allein über Farbe")."; ferner §2, Punkt 21 (`:466`) — „jeder Status trägt zusätzlich Text"
- **Warum das ein echter Widerspruch ist:** Der Chiptext ist im gewählten wie im ungewählten Fall identisch; unterschieden wird ausschließlich `ok`/`rot` gegen `grau`. Die Schaltflächen sind nackte `<button>` ohne `aria-pressed`, ohne Klasse und ohne Beschriftungszusatz, also auch für Bildschirmleser zustandslos. Die Bedeutung steht damit genau dort allein auf der Farbe, wo T70 es ausschließt — und kein Test dieser Datei rendert eine Interaktion im Geräteschritt.
- **Betroffene Tasks:** T79, T70

---

### Befund 36 — T83: „kodiert eine ID mit Sonderzeichen in beiden Umleitungen" prüft eine

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:9802-9805` — „`it("kodiert eine ID mit Sonderzeichen in beiden Umleitungen", async () => { … expect(umleitungen[0]).toBe("/?returnTo=%2Fa%2Fa%20b%26c"); });`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:9931` — „`redirect(\`/verwaltung/artikel?a=${encodeURIComponent(artikelId)}\`);`"
- **Warum das ein echter Widerspruch ist:** `istAdmin` steht im `beforeEach` auf `false`, der Admin-Zweig wird nie betreten, und `umleitungen` enthält nur den Gate-Redirect. Entfernte man `encodeURIComponent` in `:9931`, bliebe der Test grün — die zweite der „beiden Umleitungen" ist unbewacht. Der Erwartungswert selbst ist korrekt.
- **Betroffene Tasks:** T83

---

### Befund 37 — T84: `helfer/layout.tsx` ruft den Host-Riegel doppelt, und der Test zementiert den Verstoß

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10206-10207` — „`requireLagerbuchHost(await headers());   // §2.6 — erste Anweisung`" / „`await requireHelferSitzung(getDb());     // §3.4.4 — prueft Cookie UND tokens.aktiv`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:475-476` (§2, Punkt 24) — „**`requireHelferSitzung` und `requireHelferSchreibend` rufen `requireLagerbuchHost` INTERN, als erste Anweisung** (Teil 1, T10). Wer sie benutzt, ruft den Host-Riegel **nicht noch einmal**."
- **Warum das ein echter Widerspruch ist:** Der Plan setzt §2.24 anderswo aktiv durch — T75 hat dafür einen eigenen Test (`:5895-5899`), und `helfer/page.tsx` (`:10233 ff.`) wie `helfer/check/page.tsx` (`:10555`) halten sich daran. Nur das Layout tut es doppelt. Verschärfend: der Test `:10088-10091` („wirft auf fremdem Host, BEVOR die Sitzung gefragt wird" mit `expect(sitzung).not.toHaveBeenCalled()`) mockt `requireHelferSitzung` weg und kann deshalb **nur** grün werden, wenn der explizite Aufruf im Layout steht. Die Korrektur ist damit keine Zeilenlöschung, sondern eine Testumschreibung.
- **Betroffene Tasks:** T84

---

### Befund 38 — Teil 2 sichert zu, `requireHelferSitzung` werde **nur** aus `helfer/layout.tsx` gerufen; Teil 4 ruft es aus drei Dateien

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10235` — „`const zugang = await requireHelferSitzung(db);`" (`helfer/page.tsx`), ebenso `:10555` (`helfer/check/page.tsx`)
- **Kollidiert mit:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil2.md:4977` — „Konsumenten: `helfer/layout.tsx` (**nur dort** `requireHelferSitzung`, Teil 4), `a/[artikelId]/page.tsx` und `g/[code]/page.tsx` (`helferZugangOderNull`, Teil 4)"
- **Warum das ein echter Widerspruch ist:** Der `Produces`-Block von Teil 2 (T25) ist die Schnittstellenzusage, an der Teil 4 gemessen wird, und er benennt genau einen Konsumenten. Teil 4 hat drei. Die Begründung in §7.8.2 (ein Layout kann einer Seite keine Props reichen) ist sachlich richtig, aber Teil 2 wurde nie nachgezogen — wer Teil 2 als Vertrag liest, hält den zweiten und dritten Aufruf für einen Fehler.
- **Betroffene Tasks:** T84, T85

---

### Befund 39 — T86: die Zusicherung „keine der fünf liegt unter `public/`" prüft eine Zeichenkette, die der Test selbst gebaut hat

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10853-10857` — „`it("keine der fuenf liegt unter \`public/\`", () => { … for (const p of DATEIEN) expect(p).toMatch(/^src\/app\/m\/lagerbuch\//); });`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:10832` — „`const DATEIEN = HANDLER.map((h) => \`src/app/m/lagerbuch/${h.name}/route.ts\`);`"
- **Warum das ein echter Widerspruch ist:** `DATEIEN` wird aus genau dem Literal konstruiert, gegen das die Regex prüft — die Zusicherung kann konstruktiv nie fehlschlagen. Lägen die drei PNG weiterhin unter `public/`, bliebe sie grün. Sie steht im Plan als Beweis für die eigentliche Reparatur dieses Tasks (Falle 56) und trägt sie zu null Prozent.
- **Betroffene Tasks:** T86

---

### Befund 40 — T86: der §2.26-Scan trifft schon die Importzeile; „als erste Anweisung" ist unbewacht

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10834-10842` — „`it("jede der fuenf ruft \`lagerbuchHostOderNull\` und NICHT die werfende Form", … expect(q, p).toMatch(/lagerbuchHostOderNull/);`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:482-483` (§2, Punkt 26) — „Manifest und Icons sind **Route Handler unter dem Modul**, alle fünf mit `lagerbuchHostOderNull` als **erster Anweisung**"
- **Warum das ein echter Widerspruch ist:** Jeder der fünf Handler importiert die Funktion in Zeile 1 — die Regex trifft dort. Ein Handler, der sie importiert und den `if`-Block ersatzlos streicht, besteht den Test. Damit trägt er von §2.26 weder „als erster Anweisung" noch überhaupt „ruft". Der Plan kennt die richtige Form nachweislich (T73 `:4881-4885` und T74 `:5230-5233` schneiden die ersten Rumpfzeilen heraus) und benutzt sie hier nicht.
- **Betroffene Tasks:** T86

---

### Befund 41 — T86: der als „zeichengleich, 1:1-Pflicht" ausgewiesene Manifest-Block nennt `description` und `scope` nicht; Implementierung und Test tragen beide

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10706-10714` — der Autoritätsblock listet `name`, `short_name`, `display`, `start_url`, `theme_color`, `background_color` und `icons`
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:10914` / `:10916` — „`description: LAGERBUCH_ZEILE,`" / „`scope: "/",`"; und `:10767-10778` — „`it("traegt die sieben Werte" … expect(m.description).toBe("Bestand, Fahrzeuge, Geräte"); expect(m.scope).toBe("/");`"
- **Warum das ein echter Widerspruch ist:** Der Block ist im Task die benannte Autorität für die 1:1-Portierung („diese Werte … werden beim INSTALLIEREN eingebrannt"). Er listet sechs Skalare, Handler und Test führen acht. Entweder ist die Autoritätsliste unvollständig — dann kann niemand die 1:1-Pflicht gegen sie prüfen — oder zwei Werte sind nicht 1:1 belegt. Der Titel „die sieben Werte" über acht `expect`-Zeilen ist dasselbe Symptom.
- **Betroffene Tasks:** T86

---

### Befund 42 — T86: „Erwartet: PASS, 27 Zusicherungen" trifft keine Zählweise

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11030` — „Erwartet: PASS, 27 Zusicherungen."
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:10751-10858` — die Testdatei: Riegel-Block 5 × 2 = 10 Tests / 15 `expect`; Manifest 4 Tests / 18 `expect`; Icon-Bytes 4 Tests / 9 `expect`; Bauform 3 Tests / 20 `expect`. Summe **21 Tests, 62 `expect`**; ausgeschrieben stehen 11 `it` und 22 `expect`.
- **Warum das ein echter Widerspruch ist:** Keine der vier Zählweisen ergibt 27. Auffällig: 27 ist exakt die `expect`-Zahl von T65s `pwaIcons.test.ts` — die Zahl sieht übernommen aus. Ein Ausführender, der Schritt 4 gegen „27" abgleicht, hält einen korrekten Lauf für falsch. Zweiter Fall derselben Sorte nach Befund 21.
- **Betroffene Tasks:** T86

---

### Befund 43 — T86: der dreizeilige Host-Riegel steht fünfmal wörtlich; die abgedruckte Begründung deckt nur die Verzeichnisfrage

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10907-10909`, `:10948-10950`, `:10977-10979`, `:10994-10996`, `:11011-11013` — je „`if (!lagerbuchHostOderNull(new Headers(req.headers))) { return new Response("Not found", { status: 404 }); }`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:11018-11022` — „⚠️ **Die drei PNG-Handler sind absichtlich Kopien und werden NICHT zu einer Fabrik zusammengezogen.** Next.js leitet die Route aus dem **Verzeichnisnamen** ab; eine Fabrik bräuchte trotzdem drei Verzeichnisse mit je einer Datei …"
- **Warum das ein echter Widerspruch ist:** Die Begründung argumentiert ausschließlich gegen das Zusammenlegen der Dateien und Verzeichnisse — das ist gültig und wird hier nicht bestritten. Über den Riegel-Block sagt sie nichts, und der ist ein anderer Fall: er ist keine Route, sondern eine geteilte Zusage aus §2.26, für die T65 mit `pngAntwort` (`:2243-2250`) den geteilten Helfer bereits vorgemacht hat. Fünf Kopien heißt, dass eine spätere Änderung an fünf Stellen nachgezogen werden muss — und der Scan aus Befund 40 würde eine vergessene Stelle nicht bemerken.
- **Betroffene Tasks:** T86

---

### Befund 44 — T84 und T85: zwei weitere Tests, die nichts rendern und stattdessen eine Schreibweise prüfen

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:10456-10470` — „`it("filtert Grabstein-Positionen (\`entfernt\`) aus dem Soll", async () => { fahrzeuge.mockReturnValue([FZ("fz-1")]); sollFuer.mockReturnValue([ … ]); const q = readFileSync(QUELLE, "utf8"); expect(q).toMatch(/filter\(\(p\) => !p\.entfernt\)/); });`"; ferner `:10143-10149` („blendet inaktive Artikel aus")
- **Kollidiert mit:** `UEBERGABE-lagerbuch-teil3.md:170-171` — „**Frage bei jeder Zusicherung: bliebe sie grün, wenn ich genau die Regel entfernte, die sie zusichern soll?**"
- **Warum das ein echter Widerspruch ist:** `CheckSeite` wird nie aufgerufen, also laufen weder `fahrzeuge` noch `sollFuer` — die beiden ausgeschriebenen Soll-Positionen sind toter Aufbau, der eine Verhaltensprüfung vortäuscht. Geprüft wird die exakte Schreibweise `filter((p) => !p.entfernt)`; ein semantisch identisches `.filter(p => !p.entfernt)` machte den Test rot, dieselbe Zeile an einer beliebigen anderen Stelle grün. Die Seite ist in den Nachbartests bereits gemountet — die Verhaltensprüfung wäre zwei Zeilen entfernt gewesen.
- **Betroffene Tasks:** T85, T84

---

### Befund 45 — T87 Schritt 1 ist rot, und dieselbe Zusicherung ist schon in Welle 7 rot: der `requireLagerbuchAdmin`-Scan trifft die Kommentare, die der Plan vorschreibt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11143` — „`expect(q).not.toMatch(/requireLagerbuchAdmin|moduleAdminPageOrNotFound|isModuleAdmin/);`" (identisch in T81 `:9138` und T83 `:9848`); dazu `:11181` — „Erwartet: PASS. **Grün von Anfang an — das ist der Punkt einer Abnahme.**"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:9197` (Rumpf von `page.tsx`, T81) — „`// PRAEDIKAT, KEIN RIEGEL (§3.2.1). \`requireLagerbuchAdmin()\` waere hier`"; und `:9903` (Rumpf von `a/[artikelId]/page.tsx`, T83) — „` * \`requireLagerbuchAdmin()\`: der DRITTE Fall ist „keine Sitzung → Gate mit`"
- **Warum das ein echter Widerspruch ist:** Beide Pflicht-Dateien tragen den Literalstring in ihren erklärenden Kommentaren, weil der Plan sie dort hinschreibt. Die Zusicherung ist deterministisch FAIL, nicht PASS — und zwar zuerst in **Welle 7** (T81, T83), nicht erst in T87. Ein Abnahme-Test, der „grün von Anfang an" verspricht und rot ist, wird abgeschaltet statt repariert; die naheliegende Reparatur ist das Löschen genau der Kommentare, die §3.2.1 begründen. Dieselbe Klasse wie Befund 1, hier aber mit einer Zusicherung, die als **Abnahme** deklariert ist.
- **Betroffene Tasks:** T87, T81, T83

---

### Befund 46 — T87 macht den Doppel-Riegel aus T84 zur dauerhaften Zusicherung; T75 verbietet dieselbe Form mit `not.toMatch`

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11168-11171` — „`it("\`helfer/layout.tsx\` traegt BEIDE Riegel und KEINEN Rahmen", () => { … expect(q).toMatch(/requireLagerbuchHost\(/); expect(q).toMatch(/requireHelferSitzung\(/); });`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:5895-5899` (T75) — „`it("ruft \`requireLagerbuchHost\` NICHT — der Riegel ruft ihn intern", … expect(readFileSync(QUELLE, "utf8")).not.toMatch(/requireLagerbuchHost/);`"; und §2, Punkt 24 (`:475-476`)
- **Warum das ein echter Widerspruch ist:** Dieselbe Regel wird für zwei Aufrufer, die beide einen intern host-riegelnden Riegel benutzen, einmal als `not.toMatch` und einmal als `toMatch` erzwungen. T84 (`:10206-10207`) baut die von §2.24 verbotene Form, T87 zementiert sie. Damit ist die Regel „wer sie benutzt, ruft den Host-Riegel nicht noch einmal" nach Teil 4 dauerhaft in zwei entgegengesetzte Testzusagen zerlegt, und die Zusage „host-gebunden durch Konstruktion" (`:6003-6006`) trägt nicht mehr.
- **Betroffene Tasks:** T87, T84, T75

---

### Befund 47 — E9 verweist für die Weiterführung der Weichen-Zeile auf §6; §6 trägt sie nicht, und damit hat der `NOCH_NICHT`-Zweig kein Subjekt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:287-289` (E9) — „`g/[code]/page.tsx` entsteht erst in Teil 6 (E1); sie bleibt bis dahin in der Eigenschaftsform … und wird von **Teil 6** in die Existenzpflicht überführt. **Das steht in §6.**"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:11348-11357` (§6.3) — „**Vier Auflagen, die dieser Plan an andere stellt.** Jede ist **namentlich zugewiesen** und hat ein Subjekt, das existiert" — A1/A2 → Teil 5 T114, A3 → Teil 5 T100, A4 → Teil 6 T171. Keine nennt die Verschärfung.
- **Warum das ein echter Widerspruch ist:** Der Kontrast macht es eindeutig: E11 sagt an `:369` denselben Satz („Das steht in §6") und **löst ihn ein** (§6.2-Zeile plus A4). E9s Verweis läuft ins Leere. Folge: die `NOCH_NICHT`-Schleife in T87 (`:11147-11152`) ist ein Dauer-No-op, für dessen Überführung in keinem Plan ein Task zuständig ist — und §6.3s eigene Zusage („ein Subjekt, das existiert") ist an dieser Stelle verletzt.
- **Betroffene Tasks:** T87

---

### Befund 48 — T87s Abrufprobe erbt die Konfiguration nicht, auf die sie sich beruft; Aufruf 3 fällt aus

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11220-11224` — „Er braucht die Konfiguration aus Teil 3, T60 (`SUITE_HOST_LAGERBUCH`, Sitzungsgeheimnis, Seed)." / „`pnpm dev &        # Dev-Server auf 3000`"
- **Kollidiert mit:** `docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil3.md:11701` — „`SUITE_HOST_LAGERBUCH: LAGERBUCH_HOST,`" steht in **`webServer.env`** von `playwright.config.ts`; und `.env.example:224` / `:256` — „`# LAGERBUCH_HELFER_SITZUNG_SECRET=…`" (beide **auskommentiert**)
- **Warum das ein echter Widerspruch ist:** `webServer.env` ist Playwright-Prozessumgebung; ein blankes `pnpm dev` erbt davon nichts. Die Zeichenfolgen `env.local` und `env.example` kommen im gesamten Plan **null Mal** vor, `playwright.config` genau einmal (`:59`, in der Vorbedingung). Die Host-Auflösung selbst hält zwar auch ohne Env (`src/core/registry.ts:160` trifft `<key>.localtest.me`), aber **Aufruf 3** — der einzige, der `/t/<code>` und damit Falle 16 überhaupt berührt — braucht `LAGERBUCH_HELFER_SITZUNG_SECRET`, und `_lib/grenzen.ts:334-359` wirft ohne es. §4 (`:612-614`) nennt die Abrufprobe „der einzige Punkt, an dem dieser Plan eine gerenderte Seite sieht"; für den teuersten der sieben Aufrufe fällt sie aus, und der Plan nennt nirgends, wo die drei Werte für `pnpm dev` herkommen sollen.
- **Betroffene Tasks:** T87

---

### Befund 49 — T87: die Routenzahl 14 entsteht nur durch Doppelzählung

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11213-11215` — „Die Routenzählung aus Teil 6, §2.1 („14 der 36 Routen") zählt **zusätzlich** `/helfer` **und** `/helfer/check` je als eigene Route sowie den Gate-Pfad `/` unter beiden Formen"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:11193-11202` — dieselbe Aufstellung führt `helfer/page.tsx` und `helfer/check/page.tsx` bereits auf und endet mit „`# → 10`"; ebenso `:8899-8901` (Welle-7-Kopf)
- **Warum das ein echter Widerspruch ist:** „zusätzlich" ist sachlich falsch — beide sind schon in den zehn enthalten. 10 + 2 + 2 = 14 geht nur, wenn man sie zweimal zählt. Der Plan behauptet 14 an zwei Stellen, zählt an beiden 10 auf und liefert eine Versöhnung, die sich selbst widerlegt. Für eine Abnahme, die „mechanisch nachzählen" heißt (`:11189`), ist das die falsche Grundlage.
- **Betroffene Tasks:** T87

---

### Befund 50 — T87: „die zwei Bildschirmmessungen" — der Block darunter listet drei, und die dritte ist die einzige Falle-63-Probe des Plans

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11238` — „**Und die zwei Messungen am Bildschirm, die `curl` nicht leisten kann.**"; und `:11308` (§5) — „Die sieben Abrufe und die **zwei** Bildschirmmessungen aus T87 sind **protokolliert**"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:11242-11245` — „a) `[data-testid="lb-tableiste"]` ist im Sichtbereich …; b) `document.documentElement.scrollWidth === document.documentElement.clientWidth`; **c) genau EIN `a[aria-current="page"]` in der Tab-Leiste**, und er trägt den richtigen Text."
- **Warum das ein echter Widerspruch ist:** (c) wurde nachgetragen, die Zahl nicht — und §5 übernimmt sie in die Abhakliste. Ein Umsetzer, der nach „zwei" protokolliert, lässt (c) still weg. (c) ist die einzige Stelle des ganzen Plans, an der die Prop-Durchreichung der Aktivmarkierung (Falle 63) an einer gerenderten Seite gemessen wird; alles andere dazu liegt in T171.
- **Betroffene Tasks:** T87

---

### Befund 51 — T87: Aufruf 5 der Abrufprobe ist nicht falsifizierbar, und Schritt 3s `git log` beweist nicht, was §5 abhakt

- **Planstelle:** `2026-08-03-lagerbuch-modul-teil4.md:11234` — „`curl -si http://portal.localtest.me:3000/manifest.webmanifest` | **nicht** das lagerbuch-Manifest"; und `:11209-11210` — „`git log --oneline -- src/app/m/lagerbuch/_actions/buchung.ts | head -1`"
- **Kollidiert mit:** `2026-08-03-lagerbuch-modul-teil4.md:11235` (Aufruf 6, derselbe Block) — „`200 1558`"; und `:11355` (A2) — „Wird **vorgezogen** und läuft **vor** Welle 7 dieses Plans", ferner `:8903` — „**VORBEDINGUNG DIESER WELLE: Teil 5, T114 (`_actions/buchung.ts`) ist eingecheckt**"
- **Warum das ein echter Widerspruch ist:** Aufruf 5 nennt weder Status noch Rumpfmerkmal — ein 404, ein 500, ein leerer Rumpf und das echte Portal-Manifest bestehen die Probe gleichermaßen; die Nachbarzeile zeigt, dass der Plan die präzise Form beherrscht. Und der `git log` druckt zum Zeitpunkt von T87 **in beiden Welten** einen Commit, weil A2 die Datei zwingend vorher einspielt — er unterscheidet „Teil 4 hat sie angelegt" nicht von „Teil 5 hat sie angelegt", während `:11304` genau diese Aussage abhakt.
- **Betroffene Tasks:** T87

---

## Was geprüft und NICHT beanstandet wurde

Damit niemand dieselben Stellen ein zweites Mal absucht:

- **Übergabe-Teil-2 Punkt 1 (Reset-Haken der Dedup-Speicher):** `_resetGemeldeteGruppen` und `_resetNamenlosGemeldet` kommen im Plan null Mal vor — **das ist hier korrekt.** T81 (`:8975`) und T83 (`:9732`) mocken `_lib/zugang` vollständig, T75 mockt `_lib/helferZugang` (`:5550`); die modulweiten `console.warn`-Speicher laufen in Teil 4 nie an. `:77-81` trägt zudem bereits die **korrigierte** Fassung des Satzes, den die Übergabe als falsch benennt.
- **Übergabe-Teil-2 Punkt 2, materielle Seite:** die Riegelreihenfolge selbst steht in T73 (`:4954→4968→4976→4980→4985`), T74 (`:5308→5313→5323→5327`) und T82 (`:9550→9568→9574→9578→9583`) Zeile für Zeile **richtig**, und Erfolg verbraucht nirgends Budget. Beanstandet ist allein das fehlende datei-übergreifende Netz und die nicht protokollierte Entscheidung (Befund 15).
- **Übergabe-Teil-3 Punkt 6 und Punkt 10** (Seed-Artikel je Flow, `e.message`-Scan, `.limit()`-Deckel): von der Übergabe ausdrücklich an Teil 6 bzw. an niemanden adressiert; Teil 4 schreibt keine Spec-Datei (E11) und fasst den Artikel-Verlauf nicht an.
- **E9 vs. T87, „nur ZWEI der drei Dateien":** T87 tut genau, was E9 verlangt — `PFLICHT` führt `page.tsx` und `a/[artikelId]/page.tsx`, `g/[code]/page.tsx` steht in `NOCH_NICHT`. Der Mangel liegt allein im §6-Verweis (Befund 47).
- **E10-Arithmetik:** §5, §6.1 (Nummern 44–47), §6.4 Punkt 2 und E10 sind untereinander konsistent — 3 Dateien / 4 Deklarationen / 1 bewacht + 3 Ausnahmen; Summe 47 = 44 + 3 in 18 Dateien und 19 Verzeichniseinträgen. Task-Zählung 26 = T62–T87 stimmt, Wellensumme 4+1+6+3+3+2+6+1 = 26 stimmt.
- **T78s Abhängigkeit auf `_actions/buchung.ts` (Teil 5):** sauber als **Prop** umgangen (`:7068-7072`), die verbleibende Importbindung liegt in T83 und ist als Vorbedingung von Welle 7 dokumentiert (`:8903-8908`, A2). Kein Wellenverstoß.
- **Nachgerechnet und korrekt:** 1558 + 5458 + 3290 = 10.306 und die Base64-Längen 2080/7280/4388 (Summe 13.748); alle drei PNG-Prüfsummen gegen `../lagerbuch/public/` @ `ca04eb1`; 385 Bytes und sha256 des 64×64-SVG; `max-age=604800` = 7 Tage; T76s Berliner Sommerzeit-Umrechnung (`:6379-6380`); T78s fünf Mengenrechnungen (`:7175-7249`); T75s `offen`/Kappung/Klemmung und die sechs `revalidatePath`-Pfade; T79s Schrittzahlen 4/3/2 und der greedy Deckel im Einzelfall; `encodeURIComponent`-Werte in T80/T82/T83; die drei Gate-Sätze zeichengleich mit `gateTexte.ts`; `normalisiereCode(" 482137 ") === "482-137"`; `tokenZielPfad`-Rückgaben.
- **§3.3 (Scanner unter zwei Trägern):** alle vom Scanner benutzten Regeln greifen ausschließlich auf `--lb-*` zurück, und `.modul` (Teil 5, T100) deklariert denselben Satz. Die Regel hält.
- **E3 (SVG-`d`-Attribut):** kein Test des ganzen Plans sichert ein `d`-Attribut zu; die Hebung nach `_ui/ikonen.tsx` in T101 bleibt ein reiner Import-Tausch.
