# Lagerbuch UX-Verbesserungen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier Anforderungen aus dem Betrieb umsetzen — Kennzahlleisten nachziehen, der Etikettenseite einen Bildschirm-Rahmen geben, ±-Knöpfe in die Inventur, und die Icon-Quelle des Moduls auf `react-icons/pi` (Phosphor) migrieren.

**Architecture:** Vier fachlich unabhängige Änderungen in einem Branch. Die Icon-Migration läuft **zuerst**, weil `_ui/Kachel.tsx` — der Baustein aller Kennzahlleisten — heute `<Ikone>` importiert; andernfalls entstünden neue Aufrufe, die sofort wieder umzuschreiben wären. Danach die Kennzahlleisten, zuletzt Inventur und Etiketten.

**Tech Stack:** Next.js 16.3.0 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Vitest + Playwright · `react-icons` 5.7.0

**Spec:** `docs/superpowers/specs/2026-08-12-lagerbuch-ux-verbesserungen-design.md`

## Global Constraints

Diese gelten für **jede** Task. Sie sind nicht Stil, sondern die Fallenliste dieses Repos — jede einzelne bleibt unter `pnpm typecheck`, `pnpm lint`, `pnpm build` **und `pnpm vitest run` grün** und zeigt sich erst im echten Abruf.

- **Falle 1 — kein Compound-Zugriff auf antd in einer Server Component.** `Typography.Title`, `Form.Item`, `Descriptions.Item`, `List.Item`, `Input.TextArea` ergeben HTTP 500. Sicher sind `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag`, `Row`, `Col`, `Flex`.
- **Falle 3 — Rot ist nicht Betonung.** `colorError === colorPrimary === #c8000f`. Ein roter Ton muss eine Fachaussage tragen (überfällig, niedriger Druck), nie bloß Hervorhebung.
- **Falle 6 — kein Wert-Import aus einem `"use client"`-Modul in eine Server Component.** Die Server Component bekommt eine Client-Referenz statt des Wertes → HTTP 500. Werte für Server Components gehören in ein Modul ohne `"use client"`.
- **Falle 7 — `@ant-design/icons` nie in einer Server Component**, und `"use client"` behebt das nicht, es macht es still. In diesem Branch relevant als Gegenprobe: `react-icons` ist davon nicht betroffen (Beleg in Task 1).
- **`size="large"` nie setzen** — `controlHeight: 56` ist bereits das richtige Maß.
- **Keine personenbezogenen Daten** in Code, Kommentaren, Testdaten, Commit-Messages, Branch-Namen oder PR-Texten. Platzhalter: `Erika Musterfrau`, `demo@example.com`.
- **Kommentarstil des Moduls beibehalten.** Die Dateien erklären, *warum* etwas so ist und welche Falle sonst zuschlägt. Neue Kommentare folgen dem — keine Wiederholung dessen, was der Code schon sagt.
- **Deutsche Bezeichner** in Fachcode (`beruehrt`, `wertSetzen`, `zeilen`), wie im Bestand.
- Alle Befehle laufen im Worktree `~/dev/personal/drk/iuk-suite-lagerbuch-ux`.
- Commit-Messages enden mit `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

### Testmuster dieses Repos

Zwei, je nach Komponentenart:

**Server Components** werden nicht gerendert, sondern als Elementbaum durchlaufen. Jede Testdatei bringt ihren eigenen Helfer mit (er ist im Repo bewusst dupliziert, nicht geteilt) — wortgleich zu übernehmen:

```tsx
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}
```

**Client-Inseln** über das etablierte DOM-Harness `@/app/m/qr/_lib/test-dom` (`mount`, `fill`, `click`, `query`, `queryAll`, `unmount`, `submitForm`). Datei beginnt mit `// @vitest-environment jsdom`. **Kein zweites Harness erfinden.**

---

## Dateiübersicht

| Datei | Verantwortung | Task |
|---|---|---|
| `package.json` | `react-icons` als Abhängigkeit | 1 |
| `src/app/m/lagerbuch/_ui/ikonenRiegel.test.ts` | **Neu** — Import-Riegel, ersetzt `ikonen.test.ts` | 1, 2 |
| `src/app/m/lagerbuch/_ui/ikonen.tsx`, `ikonen.test.ts` | **Entfallen** | 2 |
| 32 Dateien mit `<Ikone>` | Migration auf `Pi*` | 2 |
| `src/core/shell/types.ts` | `SuiteNavItem.ikon` (String-Union) | 3 |
| `src/core/shell/navIkonen.tsx` | **Neu** — Schlüssel→Komponente, Client | 3 |
| `src/core/shell/SuiteNav.tsx` | Auflösung des Schlüssels | 3 |
| `src/app/m/lagerbuch/_lib/nav.ts` | 15 Einträge bekommen `ikon` | 3 |
| `…/(arbeit)/bz/page.tsx`, `bz/[id]/page.tsx` | Kennzahlleiste, Wechselanzahl | 4 |
| `…/(arbeit)/geraete/page.tsx`, `geraete/[id]/page.tsx` | Kennzahlleisten | 5 |
| `…/(arbeit)/sauerstoff/page.tsx` | Kennzahlleiste; `sauerstoffSeitenInhalt` muss erst herausgezogen werden | 6 |
| `…/(arbeit)/vorlagen/[id]/page.tsx` | Kennzahlleiste; Zahlen wandern aus dem Kopftext | 6 |
| `…/(arbeit)/inventur/InventurForm.tsx` | ±-Knöpfe | 7 |
| `…/(druck)/etiketten/EtikettenChrome.tsx` | **Neu** — Client-Insel, Bildschirm-Chrome | 8 |
| `…/(druck)/etiketten/page.tsx` | bindet das Chrome ein | 8 |

---

## Task 1: react-icons aufnehmen und den RSC-Beweis führen

Diese Task installiert das Paket, **beweist am laufenden Server**, dass es in der RSC-Ebene trägt, und dreht den Import-Riegel des Moduls um. Sie ändert noch keine einzige Verwendungsstelle.

**Files:**
- Modify: `package.json` (Abhängigkeit)
- Create: `src/app/m/lagerbuch/_ui/ikonenRiegel.test.ts`
- Create (temporär, am Ende gelöscht): `src/app/m/lagerbuch/_ui/rscProbe/page.tsx`

**Interfaces:**
- Consumes: nichts
- Produces: `react-icons/pi` als erlaubter Spezifizierer im Modul; `ikonenRiegel.test.ts` als der Test, den die Tasks 2 und 3 grün halten müssen.

- [ ] **Step 1: Abhängigkeiten installieren**

Der Worktree ist frisch und hat noch keine `node_modules`.

```bash
cd ~/dev/personal/drk/iuk-suite-lagerbuch-ux && pnpm install
```

- [ ] **Step 2: Baseline messen und festhalten**

Vor jeder Änderung. Die Ausgabe wird in Task 9 gegengelesen.

```bash
pnpm build 2>&1 | tee /tmp/lagerbuch-build-vorher.txt | tail -40
```

Notiere die Route-Größe von `/m/lagerbuch/verwaltung` und `/m/lagerbuch/verwaltung/bz` in der Commit-Message von Step 10.

- [ ] **Step 3: react-icons installieren**

```bash
pnpm add react-icons@5.7.0
```

Version wird gepinnt, weil der RSC-Beweis in Step 5 genau für diese Fassung gilt.

- [ ] **Step 4: Temporäre RSC-Probe anlegen**

Eine Server Component **ohne** `"use client"`, die aus `react-icons/pi` importiert. Das ist der einzige Aufbau, der Falle 7 sichtbar macht.

```tsx
// src/app/m/lagerbuch/_ui/rscProbe/page.tsx
// TEMPORÄR — wird in Step 6 wieder gelöscht. Belegt, dass react-icons/pi in
// der RSC-Ebene traegt: kein "use client", Import auf Modulebene.
import { PiSquaresFour } from "react-icons/pi";

export const dynamic = "force-dynamic";

export default function RscProbe() {
  return (
    <main>
      <p data-testid="probe">rsc-probe</p>
      <PiSquaresFour size={18} aria-hidden focusable="false" />
    </main>
  );
}
```

- [ ] **Step 5: Die Probe abrufen — das ist der Beweis**

```bash
pnpm dev &
sleep 12
curl -s -o /tmp/probe.html -w "HTTP %{http_code}\n" http://lagerbuch.localtest.me:3000/m/lagerbuch/_ui/rscProbe
grep -c "<svg" /tmp/probe.html
```

Erwartet: `HTTP 200` und mindestens ein `<svg`.

Bei `HTTP 500`: **nicht weitermachen und nicht `"use client"` daraufsetzen** — das verwandelt Falle 7 in Falle 6 (HTTP 200 mit still falschem Bild). Stattdessen die Antwort lesen (`grep -i "createContext" /tmp/probe.html`) und in der Sitzung melden; dann trägt die Entscheidung E1 der Spec nicht und der Plan muss neu aufgesetzt werden.

Falls der Modulpfad nicht auflöst (das `_ui`-Verzeichnis ist keine Route), lege die Probe stattdessen unter `src/app/m/lagerbuch/rscProbe/page.tsx` an und rufe `http://lagerbuch.localtest.me:3000/rscProbe` ab. Der Hostname stammt aus `allowedDevOrigins` in `next.config.ts`.

- [ ] **Step 6: Probe wieder entfernen**

```bash
rm -rf src/app/m/lagerbuch/_ui/rscProbe src/app/m/lagerbuch/rscProbe
```

Das Ergebnis des Abrufs ist der bleibende Wert, nicht die Datei.

- [ ] **Step 7: Den neuen Import-Riegel schreiben**

`ikonen.test.ts` prüft heute zweierlei: verbotene Importe **und** den Inhalt von `ikonen.tsx` (36 Namen, Pfadform). Der zweite Teil entfällt mit der Datei; der erste bleibt und wird umgedreht.

Lies zuerst `src/app/m/lagerbuch/_ui/ikonen.test.ts` vollständig — der neue Riegel übernimmt daraus `importSpezifizierer` und die Dateisammlung wortgleich, weil beide bereits gegen Umgehungen gehärtet sind (dynamischer Import, `require`, Re-Export, indirekte Stringvariable).

```ts
// src/app/m/lagerbuch/_ui/ikonenRiegel.test.ts
/*
 * DER IMPORT-RIEGEL DES MODULS — Nachfolger von ikonen.test.ts.
 *
 * Das Modul hatte bis 2026-08-12 eine eigene Inline-SVG-Zeichenquelle und
 * verbot JEDES fremde Paket. Betreiberentscheidung E1 kehrt das um:
 * `react-icons/pi` ist ab jetzt die EINE erlaubte Quelle. Die Begruendung —
 * und der gemessene Beleg, dass Falle 7 auf react-icons nicht zutrifft —
 * steht in docs/superpowers/specs/2026-08-12-lagerbuch-ux-verbesserungen-design.md.
 *
 * WARUM DER RIEGEL BLEIBT, obwohl das Verbot faellt: `@ant-design/icons` ist
 * weiterhin toedlich (Falle 7, HTTP 500 schon beim Import, waehrend typecheck,
 * build UND Vitest gruen bleiben), und eine zweite Zeichenquelle neben
 * Phosphor waere ein sichtbarer Stilbruch. Faellt der Riegel ersatzlos, ist
 * die Regel nur noch eine Behauptung im Kommentar.
 *
 * ⚠️ DIESER TEST KANN FALLE 7 NICHT SEHEN. Er liest QUELLTEXT. In Vitest laedt
 * `react` ueber die `default`-Bedingung, Icons rendern dort klaglos. Der
 * Beleg fuer die RSC-Tauglichkeit ist ein echter Abruf (Task 1 Step 5,
 * Task 9).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WURZEL = "src/app/m/lagerbuch";

/** Die EINE erlaubte Zeichenquelle des Moduls. */
const ERLAUBT = "react-icons/pi";

/**
 * Verbotene Quellen. `react-icons` OHNE Set-Suffix steht mit drauf: der
 * Wurzelimport zieht alle Sets und umgeht die Set-Wahl.
 */
function istVerboteneQuelle(spezifizierer: string): boolean {
  if (spezifizierer === ERLAUBT) return false;
  return (
    spezifizierer === "@ant-design/icons" ||
    spezifizierer.startsWith("@ant-design/icons/") ||
    spezifizierer === "lucide-react" ||
    spezifizierer.startsWith("lucide-react/") ||
    spezifizierer === "@/core/shell/icons" ||
    /(?:^|\/)core\/shell\/icons(?:$|\/)/.test(spezifizierer) ||
    spezifizierer === "react-icons" ||
    (spezifizierer.startsWith("react-icons/") && spezifizierer !== ERLAUBT)
  );
}

/**
 * `\b` vor jedem Schluesselwort ist Absicht: ohne es faengt `reimport("x")`
 * mit. Uebernommen aus ikonen.test.ts.
 */
function importSpezifizierer(quelle: string): string[] {
  const muster = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
  const treffer: string[] = [];
  for (const m of quelle.matchAll(muster)) treffer.push(m[1]!);
  return treffer;
}

function quelldateien(verzeichnis: string): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      gefunden.push(...quelldateien(pfad));
    } else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) {
      gefunden.push(pfad);
    }
  }
  return gefunden;
}

describe("Zeichenquelle des Lagerbuch-Moduls", () => {
  const dateien = quelldateien(WURZEL);

  it("findet ueberhaupt Quelldateien", () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  it("importiert keine verbotene Zeichenquelle", () => {
    const befunde = dateien.flatMap((datei) =>
      importSpezifizierer(readFileSync(datei, "utf8"))
        .filter(istVerboteneQuelle)
        .map((s) => `${datei} importiert ${JSON.stringify(s)}`),
    );
    expect(befunde).toEqual([]);
  });

  it("kennt die alte modul-eigene Zeichenquelle nicht mehr", () => {
    const befunde = dateien.flatMap((datei) =>
      importSpezifizierer(readFileSync(datei, "utf8"))
        .filter((s) => /(?:^|\/)_ui\/ikonen$/.test(s) || s === "./ikonen")
        .map((s) => `${datei} importiert ${JSON.stringify(s)}`),
    );
    expect(befunde).toEqual([]);
  });

  it.each([
    { name: "Wurzelimport", quelle: 'import { PiX } from "react-icons";' },
    { name: "fremdes Set", quelle: 'import { FaX } from "react-icons/fa";' },
    { name: "antd-Icons", quelle: 'import "@ant-design/icons";' },
    { name: "lucide", quelle: 'void import("lucide-react");' },
    { name: "core-Icons", quelle: 'require("@/core/shell/icons");' },
  ])("erkennt $name als verboten", ({ quelle }) => {
    expect(importSpezifizierer(quelle).some(istVerboteneQuelle)).toBe(true);
  });

  it("laesst react-icons/pi durch", () => {
    const quelle = 'import { PiPlus } from "react-icons/pi";';
    expect(importSpezifizierer(quelle).some(istVerboteneQuelle)).toBe(false);
  });
});
```

- [ ] **Step 8: Test laufen lassen — er muss JETZT FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ikonenRiegel.test.ts
```

Erwartet: rot. Der Test „kennt die alte modul-eigene Zeichenquelle nicht mehr" findet 32 Dateien, die `./ikonen` bzw. `_ui/ikonen` importieren — das ist genau die Arbeit von Task 2. Der Test ist damit die Fortschrittsanzeige der Migration.

Die übrigen Fälle müssen bereits grün sein. Sind sie es nicht, importiert eine Datei schon heute eine verbotene Quelle — das melden, nicht wegkonfigurieren.

- [ ] **Step 9: `ikonen.test.ts` noch NICHT löschen**

Sie bleibt bis Task 2 grün und schützt `ikonen.tsx`, solange die 52 Stellen es noch nutzen. Zwei Riegel nebeneinander sind hier für die Dauer einer Task richtig.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/m/lagerbuch/_ui/ikonenRiegel.test.ts
git commit -m "$(cat <<'EOF'
feat(lagerbuch): react-icons aufnehmen und den Import-Riegel umdrehen

Betreiberentscheidung E1: react-icons/pi (Phosphor) wird die eine
Zeichenquelle des Moduls; das bisherige Verbot jedes fremden Pakets faellt.

Der RSC-Beweis ist gefuehrt, nicht angenommen: eine Server Component ohne
"use client", die aus react-icons/pi importiert, antwortet mit HTTP 200 und
liefert das SVG aus. Falle 7 trifft das Paket nicht -- seine exports-Map hat
keine node-Bedingung, iconContext guardet createContext, und IconBase faellt
ohne Context auf DefaultContext zurueck.

ikonenRiegel.test.ts ist absichtlich noch rot: er zaehlt die 32 Dateien, die
noch die alte Quelle importieren, und ist damit die Fortschrittsanzeige der
Migration in Task 2. ikonen.test.ts bleibt solange daneben bestehen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Die 52 Verwendungsstellen migrieren

**Files:**
- Delete: `src/app/m/lagerbuch/_ui/ikonen.tsx`, `src/app/m/lagerbuch/_ui/ikonen.test.ts`
- Modify: 32 Dateien (Liste unten)

**Interfaces:**
- Consumes: `react-icons/pi` (Task 1), `ikonenRiegel.test.ts` als Gate
- Produces: keine `<Ikone>`-Aufrufe mehr im Modul; alle Zeichen kommen als `Pi*`-Komponenten

### Die Zuordnung

Vollständig; alle Namen sind gegen `react-icons@5.7.0/pi/index.d.ts` geprüft.

| `IkonName` | Phosphor | `IkonName` | Phosphor |
|---|---|---|---|
| `pfeil-links` | `PiArrowLeft` | `info` | `PiInfo` |
| `pfeil-rechts` | `PiArrowRight` | `erneut` | `PiArrowsClockwise` |
| `chevron-rechts` | `PiCaretRight` | `zuruecksetzen` | `PiArrowCounterClockwise` |
| `chevron-links` | `PiCaretLeft` | `verketten` | `PiLink` |
| `plus` | `PiPlus` | `entketten` | `PiLinkBreak` |
| `minus` | `PiMinus` | `tabelle` | `PiTable` |
| `kreuz` | `PiX` | `liste` | `PiList` |
| `haken` | `PiCheck` | `scannen` | `PiBarcode` |
| `stift` | `PiPencilSimple` | `qr` | `PiQrCode` |
| `papierkorb` | `PiTrash` | `schluessel` | `PiKey` |
| `archiv` | `PiArchive` | `taschenlampe` | `PiFlashlight` |
| `kopieren` | `PiCopy` | `auf-ab` | `PiCaretUpDown` |
| `herunterladen` | `PiDownloadSimple` | `warnung` | `PiWarning` |
| `hochladen` | `PiUploadSimple` | `medizin` | `PiHeartbeat` |
| `drucken` | `PiPrinter` | `objekt` | `PiPackage` |
| `lupe` | `PiMagnifyingGlass` | `sauerstoff` | `PiWind` |
| | | `akku` | `PiBatteryCharging` |
| | | `verfall` | `PiCalendarX` |
| | | `handlager-griff` | `PiHandGrabbing` |
| | | `fahrzeug` | `PiTruck` |

### Die Umschreibregel

```tsx
// vorher
<Ikone name="chevron-rechts" />
<Ikone name="warnung" groesse={11} />

// nachher
<PiCaretRight size={18} aria-hidden focusable="false" />
<PiWarning size={11} aria-hidden focusable="false" />
```

Drei Punkte, die dabei **nicht** verloren gehen dürfen:

1. **`groesse` → `size`.** react-icons rendert ohne Angabe `1em`. Die alte Vorgabe war `18`; wo `groesse` nicht gesetzt war, wird `size={18}` **explizit** geschrieben.
2. **`aria-hidden` und `focusable="false"` mitschreiben.** `ikonen.tsx` setzte beide fest, react-icons tut das nicht. Alle Zeichen im Modul sind dekorativ; der Name sitzt am Bedienelement. Ohne `aria-hidden` sagt ein Screenreader ein leeres Grafikelement an.
3. **`style={{ flex: "none" }}` prüfen.** `ikonen.tsx` setzte es fest. Wo ein Zeichen in einem Flex-Container neben Text steht (Chips, Knöpfe, Kacheln), muss es mitwandern, sonst schrumpft das Zeichen bei knappem Platz. Im Zweifel mitschreiben — es ist harmlos.

### Betroffene Dateien

`_ui/`: `BarcodeScanner.tsx`, `HelferRahmen.tsx`, `Gate.tsx`, `Suchfeld.tsx`, `LoeschButton.tsx`, `Brotkrume.tsx`, `CheckFlow.tsx`, `Chip.tsx`, `ArtikelSuche.tsx`, `Entnahme.tsx`, `Kachel.tsx`, `FahrzeugWahl.tsx`, `Stepper.tsx`

`verwaltung/(arbeit)/`: `sauerstoff/NeuFlasche.tsx`, `verfall/AussondernRow.tsx`, `geraete/GeraeteListe.tsx`, `geraete/NeuGeraet.tsx`, `artikel/ArtikelTable.tsx`, `artikel/NeuArtikel.tsx`, `fahrzeuge/NeuFahrzeug.tsx`, `fahrzeuge/FahrzeugeListe.tsx`, `fahrzeuge/[id]/TemplateVerknuepfung.tsx`, `fahrzeuge/[id]/SollEditor.tsx`, `bz/NeuBzGeraet.tsx`, `bz/BzListe.tsx`, `vorlagen/NeuTemplate.tsx`, `vorlagen/[id]/TemplateAktionen.tsx`, `vorlagen/[id]/TemplatePosEditor.tsx`, `tokens/NeuToken.tsx`, `tokens/TokenTable.tsx`, `bestellung/BestellListe.tsx`

- [ ] **Step 1: Die vollständige Liste erzeugen**

Nicht aus diesem Plan abtippen — der Stand im Code ist die Wahrheit.

```bash
grep -rn "<Ikone\|from \"./ikonen\"\|_ui/ikonen" src/app/m/lagerbuch --include="*.tsx" --include="*.ts" | grep -v "/ikonen.t"
```

- [ ] **Step 2: `Chip.tsx` zuerst migrieren**

`Chip` nimmt einen Zeichennamen als **Prop** (`zeichen`) und wird von Server Components aufgerufen (z. B. `geraete/[id]/page.tsx:36`). Es ist damit die einzige Stelle, an der ein Zeichenname über eine Komponentengrenze wandert — und die einzige, an der Falle 6 lauern kann.

Lies `src/app/m/lagerbuch/_ui/Chip.tsx` und prüfe, ob es `"use client"` trägt.

**Die Prop bleibt eine String-Union, keine Komponente.** Die Auflösung Schlüssel→Komponente findet **innerhalb** von `Chip` statt. Gäbe `geraete/[id]/page.tsx` eine Komponentenreferenz weiter, wäre das Falle 6: HTTP 500 für die ganze Seite, für `build` und Vitest unsichtbar.

- [ ] **Step 3: Test von Chip laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/Chip.test.tsx
```

Erwartet: grün. Der Test prüft vermutlich SVG-Attribute (`width`, `height`, `aria-hidden`) — Phosphor liefert andere `d`-Pfade, also müssen Zusicherungen auf konkrete Pfade angepasst werden. Zusicherungen auf `aria-hidden`, `width` und `height` müssen **ohne Änderung** grün bleiben; tun sie es nicht, fehlt eine der drei Regeln oben.

- [ ] **Step 4: Die übrigen 31 Dateien migrieren**

Datei für Datei. Nach jeder dritten Datei:

```bash
pnpm typecheck
```

- [ ] **Step 5: Die alte Quelle löschen**

```bash
git rm src/app/m/lagerbuch/_ui/ikonen.tsx src/app/m/lagerbuch/_ui/ikonen.test.ts
```

- [ ] **Step 6: Der Riegel muss jetzt grün sein**

```bash
pnpm vitest run src/app/m/lagerbuch/_ui/ikonenRiegel.test.ts
```

Erwartet: grün — insbesondere „kennt die alte modul-eigene Zeichenquelle nicht mehr". Bleibt er rot, ist eine Datei übersehen; die Fehlermeldung nennt sie.

- [ ] **Step 7: Volle Testkette**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

Erwartet: grün. Testdateien, die auf `d`-Attribute der alten Pfade zusichern (z. B. `BzLogbuchTabelle.test.tsx:131`), schlagen fehl und werden auf die Phosphor-Pfade angepasst — **die Zusicherung wird nicht gelöscht**, sondern auf den neuen Wert gezogen. Sie hält fest, dass an dieser Stelle ein *bestimmtes* Zeichen steht.

- [ ] **Step 8: Sichtprüfung im Browser**

```bash
pnpm dev &
sleep 12
curl -s -o /dev/null -w "verwaltung HTTP %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung
```

Erwartet: `HTTP 200`. Das ist der erste echte RSC-Abruf mit migrierten Zeichen.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(lagerbuch): Zeichen auf react-icons/pi migrieren

Alle 52 Verwendungsstellen in 32 Dateien; _ui/ikonen.tsx und ikonen.test.ts
entfallen. Betreiberentscheidung E2: Vollmigration statt Koexistenz -- die
alten Pfade waren lucide-Strichzeichnungen, Phosphor rendert gefuellt, und
beides nebeneinander waere ein sichtbarer Stilbruch.

Drei Eigenschaften, die ikonen.tsx fest setzte, wandern jetzt an jede
Aufrufstelle mit, weil react-icons sie nicht von selbst setzt: size (sonst
1em statt 18), aria-hidden/focusable (alle Zeichen sind dekorativ, der Name
sitzt am Bedienelement) und flex:none neben Text.

Chip.tsx behaelt seine String-Union-Prop: der Zeichenname wandert dort ueber
eine Komponentengrenze aus Server Components heraus, eine Komponentenreferenz
waere Falle 6.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Nav-Icons über `core/shell`

**Files:**
- Modify: `src/core/shell/types.ts:22-26`
- Create: `src/core/shell/navIkonen.tsx`
- Modify: `src/core/shell/SuiteNav.tsx:136-150`, `:240-250`
- Modify: `src/app/m/lagerbuch/_lib/nav.ts`
- Create: `src/core/shell/navIkonen.test.tsx`

**Interfaces:**
- Consumes: `react-icons/pi`
- Produces: `NavIkonName` (String-Union) aus `core/shell/types`; `SuiteNavItem.ikon?: NavIkonName`

- [ ] **Step 1: Den Test zuerst schreiben**

```tsx
// src/core/shell/navIkonen.test.tsx
/*
 * ⚠️ WAS DIESER TEST NICHT KANN: pruefen, ob `types.ts` in der RSC-Ebene
 * traegt. In Vitest ist "use client" ein wirkungsloser String, und ein Modul,
 * das dort einen Wert exportiert, exportiert ihn hier immer. Der Beleg fuer
 * Falle 6 ist der Abruf einer Server Component, die LAGERBUCH_NAV liest
 * (Task 3 Step 7, Task 9).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAV_IKONEN } from "./navIkonen";
import { LAGERBUCH_NAV } from "@/app/m/lagerbuch/_lib/nav";

describe("Nav-Zeichen", () => {
  it("kennt zu jedem im Lagerbuch gesetzten Schluessel eine Komponente", () => {
    const fehlend = LAGERBUCH_NAV
      .map((eintrag) => eintrag.ikon)
      .filter((schluessel) => schluessel !== undefined)
      .filter((schluessel) => !(schluessel in NAV_IKONEN));
    expect(fehlend).toEqual([]);
  });

  it("setzt fuer jeden Lagerbuch-Eintrag ein Zeichen", () => {
    const ohne = LAGERBUCH_NAV.filter((e) => e.ikon === undefined).map((e) => e.key);
    expect(ohne).toEqual([]);
  });

  /*
   * DER GRUND FUER DIESEN TEST: `types.ts` wird von Server Components gelesen
   * (_lib/nav.ts importiert SuiteNavItem von dort und wird in einem
   * RSC-Layout ausgewertet). Traegt die Datei je eine Komponente als WERT,
   * ist das Falle 6 -- HTTP 500 fuer jede Seite mit Navigation, und weder
   * `build` noch dieser Test-Runner sieht es. Deshalb prueft dieser Test den
   * QUELLTEXT: types.ts darf react-icons ueberhaupt nicht kennen.
   */
  it("haelt types.ts frei von jedem Zeichen-Import", () => {
    const quelle = readFileSync("src/core/shell/types.ts", "utf8");
    expect(quelle).not.toMatch(/react-icons/);
    expect(quelle).not.toMatch(/@ant-design\/icons/);
  });

  it("markiert navIkonen als Client-Modul", () => {
    const quelle = readFileSync("src/core/shell/navIkonen.tsx", "utf8");
    expect(quelle.trimStart().startsWith('"use client"')).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

```bash
pnpm vitest run src/core/shell/navIkonen.test.tsx
```

Erwartet: FAIL, `Cannot find module './navIkonen'`.

- [ ] **Step 3: `types.ts` erweitern**

```ts
/**
 * Schluessel eines Navigationszeichens. STRING-UNION, keine Ableitung aus der
 * Komponentenmap (`navIkonen.tsx`) — diese Datei wird von Server Components
 * gelesen (`m/lagerbuch/_lib/nav.ts`), und ein Wert-Import aus einem
 * "use client"-Modul kaeme dort als Client-Referenz an: Falle 6, HTTP 500 fuer
 * jede Seite mit Navigation, unsichtbar fuer typecheck, build und Vitest.
 * `navIkonen.test.tsx` haelt diese Datei quelltextlich frei von react-icons.
 */
export type NavIkonName =
  | "uebersicht" | "artikel" | "verfall" | "fahrzeuge" | "vorlagen"
  | "checks" | "bz" | "sauerstoff" | "geraete" | "bestellung"
  | "inventur" | "journal" | "tokens" | "etiketten" | "import";

export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
  /** Optional. Aufgeloest in SuiteNav — hier steht NIE eine Komponente. */
  ikon?: NavIkonName;
}
```

- [ ] **Step 4: `navIkonen.tsx` anlegen**

```tsx
"use client";

/*
 * DIE AUFLOESUNG SCHLUESSEL → KOMPONENTE. Gegenstueck zu `NavIkonName` in
 * types.ts, und der Grund fuer die Trennung steht dort: types.ts wird von
 * Server Components gelesen und darf keinen Zeichen-Wert kennen.
 *
 * DIESE DATEI IST CLIENT, weil SuiteNav es ist. Sie liegt bewusst NEBEN
 * `core/shell/icons.ts` und nicht darin: jene Map bedient den Modulwechsler
 * mit @ant-design/icons und traegt einen eigenen, repo-weiten Riegel
 * (icons.test.ts). Beides zu vermengen brauchte ein Modul, das beide Quellen
 * gleichzeitig will — das gibt es heute nicht.
 */
import type { IconType } from "react-icons/lib";
import {
  PiSquaresFour, PiPackage, PiCalendarX, PiTruck, PiLayout,
  PiCheckSquare, PiHeartbeat, PiWind, PiCube, PiShoppingCart,
  PiClipboardText, PiClockCounterClockwise, PiKey, PiQrCode, PiUploadSimple,
} from "react-icons/pi";
import type { NavIkonName } from "./types";

export const NAV_IKONEN: Record<NavIkonName, IconType> = {
  uebersicht: PiSquaresFour,
  artikel: PiPackage,
  verfall: PiCalendarX,
  fahrzeuge: PiTruck,
  vorlagen: PiLayout,
  checks: PiCheckSquare,
  bz: PiHeartbeat,
  sauerstoff: PiWind,
  geraete: PiCube,
  bestellung: PiShoppingCart,
  inventur: PiClipboardText,
  journal: PiClockCounterClockwise,
  tokens: PiKey,
  etiketten: PiQrCode,
  import: PiUploadSimple,
};

/**
 * Ein unbekannter Schluessel rendert NICHTS und wirft nicht: die Navigation
 * darf an einem Tippfehler nicht ausfallen. Ein fehlendes Zeichen ist ein
 * Schoenheitsfehler, eine leere Seite waere ein Ausfall.
 */
export function NavIkone({ name }: { name?: NavIkonName }) {
  if (!name) return null;
  const Zeichen = NAV_IKONEN[name];
  if (!Zeichen) return null;
  return <Zeichen size={16} aria-hidden focusable="false" style={{ flex: "none" }} />;
}
```

- [ ] **Step 5: `LAGERBUCH_NAV` erweitern**

```ts
export const LAGERBUCH_NAV: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/verwaltung", ikon: "uebersicht" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", ikon: "artikel" },
  { key: "verfall", title: "Verfall", href: "/verwaltung/verfall", ikon: "verfall" },
  { key: "fahrzeuge", title: "Fahrzeuge", href: "/verwaltung/fahrzeuge", ikon: "fahrzeuge" },
  { key: "vorlagen", title: "Vorlagen", href: "/verwaltung/vorlagen", ikon: "vorlagen" },
  { key: "checks", title: "Checks", href: "/verwaltung/checks", ikon: "checks" },
  { key: "bz", title: "BZ-Kontrolle", href: "/verwaltung/bz", ikon: "bz" },
  { key: "sauerstoff", title: "Sauerstoff", href: "/verwaltung/sauerstoff", ikon: "sauerstoff" },
  { key: "geraete", title: "Geräte", href: "/verwaltung/geraete", ikon: "geraete" },
  { key: "bestellung", title: "Bestellung", href: "/verwaltung/bestellung", ikon: "bestellung" },
  { key: "inventur", title: "Inventur", href: "/verwaltung/inventur", ikon: "inventur" },
  { key: "journal", title: "Journal", href: "/verwaltung/journal", ikon: "journal" },
  { key: "tokens", title: "Zugangs-Codes", href: "/verwaltung/tokens", ikon: "tokens" },
  { key: "etiketten", title: "Etiketten", href: "/verwaltung/etiketten", ikon: "etiketten" },
  { key: "import", title: "Import", href: "/verwaltung/import", ikon: "import" },
];
```

Der bestehende Kopfkommentar der Datei bleibt unverändert stehen — er erklärt, warum es keinen `/`-Eintrag gibt und warum die Datei kein `"use client"` trägt. Beides gilt weiter.

- [ ] **Step 6: `SuiteNav.tsx` rendert das Zeichen**

Lies `src/core/shell/SuiteNav.tsx` um die Zeilen 136-150 und 240-250. Es gibt **zwei** Stellen, an denen ein Eintrag gerendert wird (`navLinks` für die breite Ansicht, `Modulnav`/Drawer für schmal). Beide bekommen `<NavIkone name={eintrag.ikon} />` **vor** `{eintrag.title}`.

Der Link braucht dafür eine Flex-Ausrichtung mit `gap: 8`, falls er sie nicht schon hat. Vorhandene Klassennamen dabei nicht ersetzen — ergänzen.

- [ ] **Step 7: Test grün, dann echter Abruf**

```bash
pnpm vitest run src/core/shell/navIkonen.test.tsx && pnpm typecheck && pnpm lint
```

Dann — und das ist der Teil, den kein Test ersetzt:

```bash
pnpm dev &
sleep 12
curl -s http://lagerbuch.localtest.me:3000/verwaltung -o /tmp/nav.html -w "HTTP %{http_code}\n"
grep -c "<svg" /tmp/nav.html
```

Erwartet: `HTTP 200` und mindestens 15 `<svg`. Ein `HTTP 500` hier heißt: `types.ts` oder `nav.ts` zieht doch einen Client-Wert in die RSC-Ebene (Falle 6).

- [ ] **Step 8: Die anderen Module bleiben grün**

`files`, `feedback` und `portal` setzen `ikon` nicht. Das Feld ist optional, ihre Navigationen ändern sich nicht — aber ihre Seiten müssen weiter antworten:

```bash
curl -s -o /dev/null -w "files HTTP %{http_code}\n" http://files.localtest.me:3000/verwaltung
curl -s -o /dev/null -w "portal HTTP %{http_code}\n" http://localhost:3000/
```

Antwortet einer mit 401/302 statt 200, ist das der Zugriffsriegel und kein Fehler dieser Task — dann zählt, dass es **kein 500** ist.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(core): Navigationseintraege koennen ein Zeichen tragen

Betreiberentscheidung E3: core/shell wird erweitert, obwohl CLAUDE.md das auf
"was ein zweites, heute belegbares Modul braucht" begrenzt. Lagerbuch belegt
es sofort mit 15 Eintraegen; files, feedback und portal koennen folgen, das
Feld ist optional.

Der Schluessel ist eine String-Union in types.ts, die Komponentenmap liegt
getrennt in navIkonen.tsx. Der Grund ist Falle 6: types.ts wird von
Server Components gelesen (m/lagerbuch/_lib/nav.ts), und ein Komponentenwert
aus einem "use client"-Modul kaeme dort als Client-Referenz an -- HTTP 500
fuer jede Seite mit Navigation, gruen unter typecheck, build und Vitest.
navIkonen.test.tsx haelt types.ts quelltextlich frei von react-icons; der
eigentliche Beleg ist der Abruf von /verwaltung.

Ein unbekannter Schluessel rendert nichts und wirft nicht -- ein fehlendes
Zeichen ist ein Schoenheitsfehler, eine leere Navigation waere ein Ausfall.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BZ — Kennzahlleiste und Wechselanzahl

**Files:**
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.tsx:105-139`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.test.tsx:268`
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.test.tsx`

**Interfaces:**
- Consumes: `bzAkkuKennzahlGesamt(db: Leser): BzAkkuKennzahl` aus `_lib/lesepfade/bz.ts:218`; `Kachel` aus `_ui/Kachel`; `ampelTon(a: Ampel | null): AmpelTon` aus `_lib/format`
- Produces: `bzSeitenInhalt(db, jetzt)` rendert jetzt vier `Kachel`

- [ ] **Step 1: Den Test für die Übersicht schreiben**

Vorbild ist `bz/[id]/page.test.tsx`. Die Testdatenbank kommt aus `_db/testdb`.

`migrierteTestDb(praefix)` liefert `{ db, sqlite, schliessen }`; Testdaten entstehen über `t.db.insert(<tabelle>).values({…}).run()`. Beachte die Fremdschlüssel — `foreign_keys` ist in dieser DB **eingeschaltet**, ein BZ-Gerät ohne vorher angelegten Lagerort schlägt fehl.

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.test.tsx
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { bzGeraete, bzKontrollen, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { Kachel } from "../../../_ui/Kachel";
import { bzSeitenInhalt } from "./page";

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

const NOW = new Date("2026-08-12T12:00:00Z");

let t: ReturnType<typeof migrierteTestDb>;

function beschriftungen(seite: ReactNode): ReactNode[] {
  return elementeVomTyp(seite, Kachel)
    .map((e) => (e.props as { beschriftung: ReactNode }).beschriftung);
}

/** Ein Lagerort ist Pflicht — bzGeraete.lagerortId ist ein Fremdschlüssel. */
function lagerortAnlegen(): void {
  t.db.insert(lagerorte).values({
    id: "lager-1", name: "Lager", typ: "lager", kennung: null, aktiv: true,
  }).run();
}

function bzGeraetAnlegen(id: string, aktiv = true): void {
  t.db.insert(bzGeraete).values({
    id, barcode: null, name: `Messgerät ${id}`, lagerortId: "lager-1",
    streifenLot: null,
    level1Label: null, level1Min: null, level1Max: null,
    level2Label: null, level2Min: null, level2Max: null,
    aktiv, createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

/** Eine Kontrolle mit Batteriewechsel — das Ereignis, aus dem die Ø-Rechnung lebt. */
function wechselAnlegen(id: string, geraetId: string, ts: Date): void {
  t.db.insert(bzKontrollen).values({
    id, geraetId, ts, quelleTyp: "oidc", quelleId: "sub-test",
    level1Wert: null, level1ImBereich: null,
    level2Wert: null, level2ImBereich: null,
    kompresseVerfall: null, sticks: 0, lanzetten: 0,
    batterieGewechselt: true, kommentar: null,
    bestanden: true, refSnapshot: null,
  }).run();
}

afterEach(() => {
  t?.schliessen();
});

describe("BZ-Übersicht", () => {
  it("zeigt vier Kennzahlen in der Reihenfolge des Originals", () => {
    t = migrierteTestDb("lagerbuch-bz-uebersicht-");
    expect(beschriftungen(bzSeitenInhalt(t.db, NOW))).toEqual([
      "Aktive Geräte",
      "Kontrolle fällig/bald",
      "Überfällig / nie geprüft",
      "Ø Akku-Lebensdauer",
    ]);
  });

  it("zeigt „–\" als Ø Akku, solange weniger als zwei Wechsel erfasst sind", () => {
    t = migrierteTestDb("lagerbuch-bz-akku-leer-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-1");
    wechselAnlegen("k-1", "bz-1", new Date("2026-06-01T12:00:00Z"));

    const akku = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel)[3]!;
    // EIN Wechsel ergibt NULL Intervalle — nichts messbar.
    expect((akku.props as { zahl: ReactNode }).zahl).toBe("–");
    // KEIN Warnton: „noch nicht messbar" ist kein Missstand.
    expect((akku.props as { ton?: string }).ton).toBeUndefined();
  });

  it("mittelt zwei Wechsel zu ihrem Abstand in Tagen", () => {
    t = migrierteTestDb("lagerbuch-bz-akku-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-1");
    wechselAnlegen("k-1", "bz-1", new Date("2026-06-01T12:00:00Z"));
    wechselAnlegen("k-2", "bz-1", new Date("2026-07-01T12:00:00Z"));

    const akku = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel)[3]!;
    expect((akku.props as { zahl: ReactNode }).zahl).toBe("30 T");
  });

  /*
   * DIE FALLE DIESER SEITE (domain/bz.ts): `nieGeprueft: true` liefert
   * `ampel: "rot"` bei `ueberfaellig: FALSE`. Wer nur `ueberfaellig` zaehlt,
   * meldet das schlechteste Geraet im Bestand als unauffaellig.
   */
  it("zählt nie geprüfte Geräte als überfällig mit", () => {
    t = migrierteTestDb("lagerbuch-bz-nie-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-neu");   // aktiv, ohne jede Kontrolle

    const kacheln = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[2]!.props as { ton?: string }).ton).toBe("rot");
  });

  it("zählt inaktive Geräte in keiner Kachel mit", () => {
    t = migrierteTestDb("lagerbuch-bz-inaktiv-");
    lagerortAnlegen();
    bzGeraetAnlegen("bz-alt", false);

    const kacheln = elementeVomTyp(bzSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.test.tsx"
```

Erwartet: FAIL — `elementeVomTyp` findet null `Kachel`.

- [ ] **Step 3: Die Kennzahlleiste bauen**

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.tsx
import type { ReactNode } from "react";
import { Col, Row } from "antd";
import { getDb, type DB } from "../../../_db/client";
import {
  bzAkkuKennzahlGesamt,
  bzGeraeteUebersicht,
  lagerortOptionen,
} from "../../../_lib/lesepfade/bz";
import { Kachel } from "../../../_ui/Kachel";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { BzListe } from "./BzListe";
import { bzAnzeigeZeilen } from "./bzAnzeige";

export const dynamic = "force-dynamic";

export function bzSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const geraete = bzGeraeteUebersicht(db, jetzt);
  const zeilen = bzAnzeigeZeilen(geraete);
  const lagerorte = lagerortOptionen(db);

  const aktive = geraete.filter((g) => g.aktiv);
  const faellig = aktive.filter((g) => g.faelligkeit.ampel !== "gruen").length;
  /*
   * ⚠️ `nieGeprueft` MUSS mitgezaehlt werden. `domain/bz.ts#bzFaelligkeit`
   * liefert fuer ein nie geprueftes Geraet `ampel: "rot"` bei
   * `ueberfaellig: false` — wer nur `ueberfaellig` zaehlt, meldet den
   * schlechtesten Fall im Bestand als unauffaellig. Das Original zaehlt
   * genauso (lagerbuch/src/app/verwaltung/(admin)/bz/page.tsx:17).
   */
  const ueberfaellig = aktive.filter(
    (g) => g.faelligkeit.ueberfaellig || g.faelligkeit.nieGeprueft,
  ).length;

  const akku = bzAkkuKennzahlGesamt(db);
  /* `null` = weniger als zwei Wechsel, also kein Intervall messbar. Das ist
   * kein Missstand und bekommt deshalb keinen Warnton. */
  const akkuText = akku.tageDurchschnitt === null
    ? "–"
    : `${Math.round(akku.tageDurchschnitt)} T`;

  return (
    <>
      <SeitenKopf
        titel="BZ-Kontrolle"
        beschreibung="Blutzuckermessgeräte mit Kontrollfrist, Referenzbereichen und Logbuch."
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={aktive.length} beschriftung="Aktive Geräte" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={faellig}
            beschriftung="Kontrolle fällig/bald"
            ton={faellig ? "gelb" : "ok"}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={ueberfaellig}
            beschriftung="Überfällig / nie geprüft"
            ton={ueberfaellig ? "rot" : "ok"}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={akkuText} beschriftung="Ø Akku-Lebensdauer" />
        </Col>
      </Row>

      <BzListe zeilen={zeilen} lagerorte={lagerorte} />
    </>
  );
}

export default function BzSeite() {
  return bzSeitenInhalt(getDb(), new Date());
}
```

`Row`, `Col` und `Card` (in `Kachel`) sind in RSC unbedenklich — keine Compound-Zugriffe (Falle 1).

- [ ] **Step 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/page.test.tsx"
```

- [ ] **Step 5: Die Wechselanzahl im Detail ergänzen**

In `bz/[id]/page.tsx` die Zeilen 105-107 und 134-139:

```tsx
  const akkuText = akku.tageDurchschnitt === null
    ? "–"
    : `${Math.round(akku.tageDurchschnitt)} Tage`;
```

bleibt, und die Kachel bekommt die Anzahl in die Beschriftung:

```tsx
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={akkuText}
            /* Das Original nennt die Zahl der Wechsel mit
             * (lagerbuch/src/app/verwaltung/(admin)/bz/[id]/page.tsx:45): ein
             * Mittelwert aus zwei Intervallen und einer aus zwanzig sehen
             * ohne sie gleich verlaesslich aus. */
            beschriftung={`Ø Akku (${akku.anzahlWechsel} Wechsel)`}
          />
        </Col>
```

- [ ] **Step 6: Den bestehenden Detailtest anpassen**

`bz/[id]/page.test.tsx:268` sichert die alte Beschriftung zu:

```tsx
      .toEqual(["Nächste Kontrolle", "Letzte Kontrolle", "Ø Akkulaufzeit", "Status / Standort"]);
```

wird zu:

```tsx
      .toEqual(["Nächste Kontrolle", "Letzte Kontrolle", "Ø Akku (2 Wechsel)", "Status / Standort"]);
```

Die Zahl `2` muss zu den Testdaten dieser Datei passen — lies `bz/[id]/page.test.tsx:230-260` und setze die tatsächliche Anzahl der Kontrollen mit `batterieGewechselt: true` ein. Rate sie nicht; ein falscher Wert macht den Test rot und du weißt nach dem Lauf, welcher richtig ist.

- [ ] **Step 7: Tests und Abruf**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/bz" && pnpm typecheck
pnpm dev &
sleep 12
curl -s -o /dev/null -w "bz HTTP %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/bz
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(lagerbuch): Kennzahlleiste der BZ-Uebersicht, Wechselanzahl im Detail

bzAkkuKennzahlGesamt gab es im Modul seit der Portierung, aufgerufen hat sie
niemand -- die Uebersicht hatte gar keine Kennzahlleiste. Die Rechnung selbst
war und ist zeilengleich zum Original; es fehlte nur die Verdrahtung.

Die Kachel "Ueberfaellig / nie geprueft" zaehlt `ueberfaellig || nieGeprueft`.
Das ist keine Bequemlichkeit: bzFaelligkeit liefert fuer ein nie geprueftes
Geraet ampel "rot" bei ueberfaellig FALSE, und wer nur ueberfaellig zaehlt,
meldet den schlechtesten Fall im Bestand als unauffaellig.

Die Detailkachel nennt wieder die Zahl der Wechsel: ein Mittelwert aus zwei
Intervallen und einer aus zwanzig sehen ohne sie gleich verlaesslich aus.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Geräte — Kennzahlleisten auf Liste und Detail

**Files:**
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/page.tsx`
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.test.tsx`

**Interfaces:**
- Consumes: `geraeteUebersicht(db, now): GeraetZeile[]`, `geraetById(db, id, now)` aus `_lib/lesepfade/geraete.ts`; `geraetFaelligChip(typ, f): FaelligChip | null` aus `_lib/format`
- Produces: nichts für spätere Tasks

**Wichtig zum Typ:** `GeraetZeile.faelligkeit` ist `DatumFaelligkeit` mit den Feldern `faelligAm`, `tageBisFaellig`, `ampel`, `ueberfaellig`, **`keinDatum`**. Das letzte Feld entscheidet die Zählung: `ampel` ist laut Kommentar in `domain/geraet.ts` **nur aussagekräftig, wenn `keinDatum === false`**.

- [ ] **Step 1: Test für die Geräteliste schreiben**

`geraeteSeitenInhalt(db: Leser, jetzt: Date)` **existiert bereits** (`geraete/page.tsx:36`) und ist direkt aufrufbar. `elementeVomTyp` und `beschriftungen` aus Task 4 Step 1 mitkopieren.

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.test.tsx
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { geraete, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { Kachel } from "../../../_ui/Kachel";
import { geraeteSeitenInhalt } from "./page";

// elementeVomTyp: wortgleich aus Task 4 Step 1 übernehmen.

const NOW = new Date("2026-08-12T12:00:00Z");
let t: ReturnType<typeof migrierteTestDb>;

function lagerortAnlegen(): void {
  t.db.insert(lagerorte).values({
    id: "lager-1", name: "Lager", typ: "lager", kennung: null, aktiv: true,
  }).run();
}

/**
 * `mtkFaellig` und `ablaufdatum` sind "YYYY-MM-DD"-TEXTE, nicht Date.
 * `null` heißt „kein Datum gepflegt" — genau der Fall, den `keinDatum` deckt.
 */
function geraetAnlegen(werte: {
  id: string;
  typ: "medizin" | "objekt";
  mtkFaellig?: string | null;
  ablaufdatum?: string | null;
  aktiv?: boolean;
}): void {
  t.db.insert(geraete).values({
    id: werte.id, typ: werte.typ, barcode: null, name: `Gerät ${werte.id}`,
    lagerortId: "lager-1", anmerkung: null,
    mtkFaellig: werte.mtkFaellig ?? null,
    beschreibung: null,
    ablaufdatum: werte.ablaufdatum ?? null,
    aktiv: werte.aktiv ?? true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

afterEach(() => {
  t?.schliessen();
});

describe("Geräte-Übersicht", () => {
  it("zeigt vier Kennzahlen", () => {
    t = migrierteTestDb("lagerbuch-geraete-kpi-");
    expect(beschriftungen(geraeteSeitenInhalt(t.db, NOW)))
      .toEqual(["Aktive Geräte", "MTK fällig/bald", "MTK überfällig", "Objekte ablaufend"]);
  });

  /*
   * `DatumFaelligkeit.ampel` ist laut domain/geraet.ts NUR aussagekraeftig,
   * wenn `keinDatum === false`. Ein Geraet ohne gepflegtes Datum darf keine
   * Faelligkeit melden — sonst zaehlt die Kachel Pflegeluecken als Missstand,
   * und die Zahl waechst mit jedem neu angelegten Geraet.
   */
  it("zählt Geräte ohne gepflegtes Datum nicht als fällig", () => {
    t = migrierteTestDb("lagerbuch-geraete-kein-datum-");
    lagerortAnlegen();
    geraetAnlegen({ id: "g-1", typ: "medizin", mtkFaellig: null });
    geraetAnlegen({ id: "g-2", typ: "objekt", ablaufdatum: null });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(2);   // aktiv
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);   // MTK fällig
    expect((kacheln[3]!.props as { zahl: ReactNode }).zahl).toBe(0);   // Objekt ablaufend
  });

  it("zählt ein überfälliges MTK in beiden MTK-Kacheln", () => {
    t = migrierteTestDb("lagerbuch-geraete-mtk-");
    lagerortAnlegen();
    geraetAnlegen({ id: "g-alt", typ: "medizin", mtkFaellig: "2026-01-01" });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    // „fällig/bald" ist ampel !== gruen und schliesst ueberfaellig ein.
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[2]!.props as { ton?: string }).ton).toBe("rot");
  });

  it("trennt die Klassen: ein Objekt zählt nie in einer MTK-Kachel", () => {
    t = migrierteTestDb("lagerbuch-geraete-klassen-");
    lagerortAnlegen();
    geraetAnlegen({ id: "o-alt", typ: "objekt", ablaufdatum: "2026-01-01" });

    const kacheln = elementeVomTyp(geraeteSeitenInhalt(t.db, NOW), Kachel);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[2]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[3]!.props as { zahl: ReactNode }).zahl).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.test.tsx"
```

- [ ] **Step 3: Die Zählungen bauen**

Wortgleich zum Original (`lagerbuch/src/app/verwaltung/(admin)/geraete/page.tsx:15-18`):

```tsx
  const aktive = geraete.filter((g) => g.aktiv);
  const mtkFaellig = aktive.filter(
    (g) => g.typ === "medizin" && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen",
  ).length;
  const mtkUeberfaellig = aktive.filter(
    (g) => g.typ === "medizin" && g.faelligkeit.ueberfaellig,
  ).length;
  const objektAblaufend = aktive.filter(
    (g) => g.typ === "objekt" && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen",
  ).length;
```

Und die Leiste, nach dem Muster aus Task 4 Step 3:

```tsx
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={aktive.length} beschriftung="Aktive Geräte" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={mtkFaellig} beschriftung="MTK fällig/bald" ton={mtkFaellig ? "gelb" : "ok"} />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={mtkUeberfaellig} beschriftung="MTK überfällig" ton={mtkUeberfaellig ? "rot" : "ok"} />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={objektAblaufend} beschriftung="Objekte ablaufend" ton={objektAblaufend ? "gelb" : "ok"} />
        </Col>
      </Row>
```

Die Leiste kommt **zwischen** `SeitenKopf` und `GeraeteListe` in `geraeteSeitenInhalt`. Die Zählungen lesen `geraeteUebersicht(db, jetzt)` — dessen Ergebnis wird heute direkt in `geraeteAnzeigeZeilen` gereicht; hole es in eine Zwischenvariable, damit beide es nutzen. **Kein zweiter Aufruf von `geraeteUebersicht`**: das wäre ein zweiter Datenbankdurchlauf für dieselbe Frage.

```tsx
export function geraeteSeitenInhalt(db: Leser, jetzt: Date = new Date()) {
  const geraeteZeilen = geraeteUebersicht(db, jetzt);
  const zeilen = geraeteAnzeigeZeilen(geraeteZeilen);
  const lagerorte = lagerortOptionen(db);
  const aktive = geraeteZeilen.filter((g) => g.aktiv);
  // … Zählungen wie oben …
```

- [ ] **Step 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/page.test.tsx"
```

- [ ] **Step 5: Die Detailseite bekommt ihre Leiste**

`geraete/[id]/page.tsx` zeigt heute einen freistehenden `Chip` mit der Fälligkeit (Zeilen 34-42). Die Fälligkeitskachel ersetzt ihn — sonst steht dieselbe Aussage zweimal untereinander.

```tsx
  const chip = detail.chip;
  /* `ton: "grau"` faerbt die Kante nicht (Kachel.tsx): grau ist kein
   * Ampelwert, und eine graue Kante neben rot und gruen laese sich als
   * vierte Stufe lesen. */
  const faelligTon = chip ? chip.ton : "ok";

  return (
    <>
      <Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>
      <SeitenKopf
        titel={geraet.name}
        beschreibung={chip ? undefined : "Für diese Klasse ist kein Datum gepflegt."}
        aktionen={(
          <GeraetAktivToggle id={geraet.id} name={geraet.name} aktiv={geraet.aktiv} />
        )}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={geraet.typ === "medizin" ? "Medizin" : "Objekt"}
            beschriftung="Gerätetyp"
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={chip ? chip.text : "–"}
            beschriftung={geraet.typ === "medizin" ? "MTK-Fälligkeit" : "Ablauf"}
            ton={faelligTon}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={detail.lagerortName} beschriftung="Standort" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={geraet.aktiv ? "aktiv" : "inaktiv"}
            beschriftung="Status"
            ton={geraet.aktiv ? "ok" : "gelb"}
          />
        </Col>
      </Row>
```

Der `<Chip>`-Block darunter entfällt; der `Chip`-Import ebenfalls, falls die Datei ihn sonst nicht mehr braucht (`pnpm lint` meldet es).

Prüfe, ob `geraetById` überhaupt `lagerortName` liefert. Tut es das nicht, lies den Namen wie `bz/[id]/page.tsx` es tut, oder ergänze das Feld im Lesepfad — **keinen zweiten Auflösungsweg** danebenstellen.

- [ ] **Step 6: Volle Kette und Abruf**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete" && pnpm typecheck && pnpm lint
pnpm dev &
sleep 12
curl -s -o /dev/null -w "geraete HTTP %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/geraete
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(lagerbuch): Kennzahlleisten fuer Geraeteliste und Geraeteblatt

Beide Zaehlungen pruefen `keinDatum` mit, bevor sie `ampel` lesen.
domain/geraet.ts sagt ausdruecklich, dass `ampel` nur bei keinDatum===false
aussagekraeftig ist -- ohne die Pruefung zaehlte jede Pflegeluecke als
Faelligkeit, und die Zahl stiege mit jedem neu angelegten Geraet.

Auf dem Geraeteblatt ersetzt die Faelligkeitskachel den freistehenden Chip.
Beides nebeneinander waere dieselbe Aussage zweimal untereinander.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Sauerstoff und Vorlagen — die letzten zwei Leisten

**Files:**
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/page.tsx:41-52`
- Create: `src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.test.tsx`

**Interfaces:**
- Consumes: `o2FlaschenUebersicht(db): O2FlascheZeile[]`; `templateDetail(db, id)` aus `_lib/lesepfade/fahrzeuge.ts`
- Produces: nichts für spätere Tasks

**Wichtig zum Typ:** `O2FlascheZeile.status` ist `O2Status | null`, und `null` heißt **keine Messung** — nicht 0 %. `O2Status.niedrig` ist genau `ampel === "rot"`.

- [ ] **Step 1: Test für Sauerstoff schreiben**

**Achtung, hier fehlt die Voraussetzung:** `sauerstoff/page.tsx` hat **keine** herausgezogene `…SeitenInhalt`-Funktion — die Seite baut ihr JSX direkt in der Default-Export-Komponente. Anders als bei `geraeteSeitenInhalt` muss sie erst herausgelöst werden; das ist das Muster aller übrigen Seiten des Moduls (`bzSeitenInhalt`, `geraetSeitenInhalt`, `geraeteSeitenInhalt`) und Voraussetzung dafür, dass der Test ohne laufenden Server greift.

```tsx
// sauerstoff/page.tsx — neue Signatur, Default-Export ruft sie
export function sauerstoffSeitenInhalt(db: Leser): ReactNode { … }

export default function SauerstoffSeite() {
  return sauerstoffSeitenInhalt(getDb());
}
```

`o2FlaschenUebersicht` nimmt **kein** `now` — der Füllstand ist zeitlos. Die Signatur bekommt deshalb keinen `jetzt`-Parameter.

```tsx
// src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.test.tsx
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { lagerorte, o2Flaschen, o2Messungen } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { Kachel } from "../../../_ui/Kachel";
import { sauerstoffSeitenInhalt } from "./page";

// elementeVomTyp + beschriftungen: wortgleich aus Task 4 Step 1 übernehmen.

let t: ReturnType<typeof migrierteTestDb>;

function lagerortAnlegen(): void {
  t.db.insert(lagerorte).values({
    id: "lager-1", name: "Lager", typ: "lager", kennung: null, aktiv: true,
  }).run();
}

function flascheAnlegen(id: string, aktiv = true): void {
  t.db.insert(o2Flaschen).values({
    id, name: `Flasche ${id}`, lagerortId: "lager-1",
    groesseLiter: 10, nennfuelldruckBar: 200, aktiv,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

function messungAnlegen(id: string, flascheId: string, druckBar: number): void {
  t.db.insert(o2Messungen).values({
    id, flascheId, ts: new Date("2026-08-01T12:00:00Z"),
    druckBar, quelleTyp: "oidc", quelleId: "sub-test", kommentar: null,
  }).run();
}

afterEach(() => {
  t?.schliessen();
});

describe("Sauerstoff-Übersicht", () => {
  it("zeigt zwei Kennzahlen", () => {
    t = migrierteTestDb("lagerbuch-o2-kpi-");
    expect(beschriftungen(sauerstoffSeitenInhalt(t.db)))
      .toEqual(["Aktive Flaschen", "Niedriger Druck"]);
  });

  /*
   * `status: null` heisst KEINE Messung, nicht 0 % (lesepfade/o2.ts). Eine
   * ungemessene Flasche als "niedriger Druck" zu zaehlen erfaende einen
   * Missstand. Das Original zaehlt sie nicht mit; der Test haelt die
   * Entscheidung fest, damit ein spaeteres `!f.status?.niedrig === false`
   * auffaellt.
   */
  it("zählt ungemessene Flaschen nicht als niedrigen Druck", () => {
    t = migrierteTestDb("lagerbuch-o2-ungemessen-");
    lagerortAnlegen();
    flascheAnlegen("f-1");   // aktiv, ohne jede Messung

    const kacheln = elementeVomTyp(sauerstoffSeitenInhalt(t.db), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[1]!.props as { ton?: string }).ton).toBe("ok");
  });

  it("zählt eine Flasche unter der roten Schwelle und färbt rot", () => {
    t = migrierteTestDb("lagerbuch-o2-niedrig-");
    lagerortAnlegen();
    flascheAnlegen("f-1");
    // 20 von 200 bar = 10 % — unter O2_AMPEL_ROT_PROZENT.
    messungAnlegen("m-1", "f-1", 20);

    const kacheln = elementeVomTyp(sauerstoffSeitenInhalt(t.db), Kachel);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(1);
    expect((kacheln[1]!.props as { ton?: string }).ton).toBe("rot");
  });

  it("zählt inaktive Flaschen in keiner Kachel mit", () => {
    t = migrierteTestDb("lagerbuch-o2-inaktiv-");
    lagerortAnlegen();
    flascheAnlegen("f-alt", false);
    messungAnlegen("m-alt", "f-alt", 20);

    const kacheln = elementeVomTyp(sauerstoffSeitenInhalt(t.db), Kachel);
    expect((kacheln[0]!.props as { zahl: ReactNode }).zahl).toBe(0);
    expect((kacheln[1]!.props as { zahl: ReactNode }).zahl).toBe(0);
  });
});
```

Prüfe `O2_AMPEL_ROT_PROZENT` in `_lib/domain/o2.ts`, bevor du `20` als Druck festschreibst — der Wert muss sicher unter der roten Schwelle liegen.

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.test.tsx"
```

- [ ] **Step 3: Sauerstoff-Leiste bauen**

Die Seite reicht `o2FlaschenUebersicht(db)` heute direkt in `sauerstoffAnzeigeZeilen`. Hole das Ergebnis in eine Zwischenvariable — **kein zweiter Aufruf**, das wäre ein zweiter Datenbankdurchlauf für dieselbe Frage.

```tsx
export function sauerstoffSeitenInhalt(db: Leser): ReactNode {
  const flaschen = o2FlaschenUebersicht(db);
  const zeilen = sauerstoffAnzeigeZeilen(flaschen);
  const lagerorte = lagerorteFuerFlaschen(db);

  const aktive = flaschen.filter((f) => f.aktiv);
  /* `?.` ist hier tragend: status === null heisst KEINE Messung, nicht 0 %.
   * Eine ungemessene Flasche zaehlt nicht als niedriger Druck. */
  const niedrig = aktive.filter((f) => f.status?.niedrig).length;
```

Gezählt wird auf `flaschen` (dem Lesepfad-Typ mit `status`), nicht auf `zeilen` — die Anzeigeprojektion trägt `status` zwar mit, aber die Kennzahl gehört zur Datenseite.

```tsx
      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={aktive.length} beschriftung="Aktive Flaschen" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel zahl={niedrig} beschriftung="Niedriger Druck" ton={niedrig ? "rot" : "ok"} />
        </Col>
      </Row>
```

Rot ist hier fachlich belegt (Falle 3): eine Flasche unter der roten Schwelle ist ein Missstand, keine Betonung.

- [ ] **Step 4: Test grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/page.test.tsx"
```

- [ ] **Step 5: Vorlagen-Detail — Leiste statt Zahlen im Kopftext**

**Achtung, das weicht von den anderen ab:** `vorlagen/[id]/page.tsx:46-51` zeigt die Zahlen bereits als Fließtext in der `beschreibung` des `SeitenKopf` („N Position(en) · M verknüpfte(s) Fahrzeug(e)"). Eine Leiste **zusätzlich** stellte dieselbe Zahl zweimal auf die Seite.

Die Zahlen wandern deshalb aus der Beschreibung in die Leiste; der `inaktiv`-Chip bleibt in der Beschreibung, weil er keine Kennzahl ist.

```tsx
  const faecher = new Set(positionen.map((p) => p.fachLabel)).size;

  return (
    <>
      <Brotkrume href="/verwaltung/vorlagen">Alle Vorlagen</Brotkrume>
      <SeitenKopf
        titel={detail.name}
        beschreibung={detail.aktiv ? undefined : <Chip ton="grau">inaktiv</Chip>}
      />

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
        <Col xs={24} md={8}>
          <Kachel zahl={positionen.length} beschriftung="Positionen" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={faecher} beschriftung="Fächer" />
        </Col>
        <Col xs={24} md={8}>
          <Kachel zahl={verknuepfteFahrzeuge.length} beschriftung="Fahrzeuge" />
        </Col>
      </Row>
```

`md={8}` statt `md={12} xl={6}`: drei Kacheln teilen die Reihe zu Dritteln, nicht zu Vierteln.

- [ ] **Step 6: Bestehenden Vorlagen-Test anpassen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen"
```

`vorlagen/[id]/page.test.tsx` sichert vermutlich den Beschreibungstext zu. Die Zusicherung wandert auf die Kacheln — sie wird **nicht** gelöscht: dass diese Zahlen auf der Seite stehen, ist die Aussage, die sie festhält.

- [ ] **Step 7: Volle Kette und Abrufe**

```bash
pnpm vitest run && pnpm typecheck && pnpm lint
pnpm dev &
sleep 12
curl -s -o /dev/null -w "sauerstoff HTTP %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/sauerstoff
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(lagerbuch): Kennzahlleisten fuer Sauerstoff und Vorlagenblatt

Bei Sauerstoff traegt das `?.` die Aussage: status === null heisst KEINE
Messung, nicht 0 %. Eine ungemessene Flasche als niedrigen Druck zu zaehlen
erfaende einen Missstand.

Auf dem Vorlagenblatt wandern die Zahlen aus dem Beschreibungstext des
Seitenkopfs in die Leiste, statt dort zusaetzlich zu erscheinen -- sonst
stuende dieselbe Zahl zweimal auf der Seite. Der inaktiv-Chip bleibt im Kopf,
er ist keine Kennzahl.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Inventur — ±-Knöpfe

**Files:**
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.tsx:128-143`
- Modify: `src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.test.tsx`

**Interfaces:**
- Consumes: `PiPlus`, `PiMinus` aus `react-icons/pi`; `wertSetzen(id: string, wert: number | null): void` (bereits vorhanden, `InventurForm.tsx:44`)
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Die Tests zuerst schreiben**

An `InventurForm.test.tsx` anhängen. Die Datei bringt Harness und Testdaten schon mit (`ZEILEN` mit `a1`/Bestand 12 und `a2`/Bestand 4).

```tsx
describe("±-Knöpfe", () => {
  it("erhöht und verringert den Ist-Wert über wertSetzen", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    const plus = query('[aria-label="Ist-Bestand Mullbinde erhöhen"]');
    const minus = query('[aria-label="Ist-Bestand Mullbinde verringern"]');
    const feld = query<HTMLInputElement>('[aria-label="Ist-Bestand Mullbinde"]');

    expect(feld.value).toBe("12");
    await click(plus);
    expect(feld.value).toBe("13");
    await click(minus);
    await click(minus);
    expect(feld.value).toBe("11");
  });

  /*
   * DIE EIGENSCHAFT, DIE HIER NICHT KAPUTTGEHEN DARF: `positionenAus` reicht
   * eine BERUEHRTE Zeile auch dann ein, wenn ihr Wert dem Seitenladebestand
   * entspricht -- der Server vergleicht gegen den LIVE-Bestand und verhindert
   * so Lost Updates. Plus-dann-Minus muss die Zeile also eingereicht lassen.
   * Wer hier "unveraenderte Zeilen herausfiltert", entfernt den Schutz.
   */
  it("lässt eine berührte Zeile eingereicht, auch wenn + und − sich aufheben", async () => {
    mocks.inventurKorrektur.mockResolvedValue({ ok: true, wert: { korrigiert: 0 } });
    await mount(<InventurForm zeilen={ZEILEN} />);
    await click(query('[aria-label="Ist-Bestand Mullbinde erhöhen"]'));
    await click(query('[aria-label="Ist-Bestand Mullbinde verringern"]'));
    await fill(query('[aria-label="Kommentar"]'), "Quartalsinventur");
    await click(query('[data-rolle="abschluss"]'));

    expect(mocks.inventurKorrektur).toHaveBeenCalledWith({
      kommentar: "Quartalsinventur",
      positionen: [{ artikelId: "a1", ist: 12 }],
    });
  });

  it("zählt eine aufgehobene Änderung nicht als Abweichung", async () => {
    await mount(<InventurForm zeilen={ZEILEN} />);
    await click(query('[aria-label="Ist-Bestand Mullbinde erhöhen"]'));
    await click(query('[aria-label="Ist-Bestand Mullbinde verringern"]'));
    expect(query('[data-rolle="abschluss"]').textContent)
      .toContain("0 Abweichungen");
  });

  it("sperrt − bei 0 und + bei 9999", async () => {
    await mount(<InventurForm zeilen={[{ ...ZEILEN[0]!, bestand: 0 }]} />);
    expect(query('[aria-label="Ist-Bestand Mullbinde verringern"]')
      .hasAttribute("disabled")).toBe(true);
    expect(query('[aria-label="Ist-Bestand Mullbinde erhöhen"]')
      .hasAttribute("disabled")).toBe(false);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/InventurForm.test.tsx"
```

Erwartet: FAIL, die Knöpfe gibt es nicht.

- [ ] **Step 3: Die Knöpfe bauen**

In `InventurForm.tsx`, Spalte „Ist" (Zeilen 128-143):

```tsx
          {
            title: "Ist",
            dataIndex: "id",
            align: "right",
            render: (_wert: string, zeile) => {
              const aktuell = zeile.id in beruehrt ? beruehrt[zeile.id]! : zeile.bestand;
              return (
                <Flex gap={4} align="center" justify="flex-end">
                  <Button
                    size="small"
                    disabled={laeuft || aktuell <= 0}
                    aria-label={`Ist-Bestand ${zeile.name} verringern`}
                    onClick={() => wertSetzen(zeile.id, aktuell - 1)}
                    icon={<PiMinus size={14} aria-hidden focusable="false" />}
                  />
                  <InputNumber<number>
                    size="small"
                    min={0}
                    max={9999}
                    disabled={laeuft}
                    aria-label={`Ist-Bestand ${zeile.name}`}
                    value={aktuell}
                    onChange={(wert) => wertSetzen(zeile.id, wert)}
                  />
                  <Button
                    size="small"
                    disabled={laeuft || aktuell >= 9999}
                    aria-label={`Ist-Bestand ${zeile.name} erhöhen`}
                    onClick={() => wertSetzen(zeile.id, aktuell + 1)}
                    icon={<PiPlus size={14} aria-hidden focusable="false" />}
                  />
                </Flex>
              );
            },
          },
```

Import ergänzen: `import { PiMinus, PiPlus } from "react-icons/pi";`

Vier Dinge, die hier tragen:
- **Beide Knöpfe rufen `wertSetzen`** — denselben Pfad wie das Feld. Kein zweiter Zustandsweg, kein direktes `setBeruehrt`.
- **`aktuell` wird einmal berechnet** und von allen dreien gelesen. Zwei Ableitungen desselben Wertes liefen auseinander.
- **`size="small"` ist hier richtig**, weil das `InputNumber` daneben es schon trägt. Die globale Regel „`size` nicht setzen" gilt der Vorgabe `controlHeight: 56`; innerhalb einer Tabellenzeile ist `small` der bestehende Stand.
- **`disabled`-Grenzen spiegeln `min`/`max`** des Feldes. Ohne sie führte ein Klick zu einem Wert, den das Feld gleich wieder zurücksetzt.

- [ ] **Step 4: Tests grün**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(arbeit)/inventur"
```

- [ ] **Step 5: Abruf**

```bash
pnpm typecheck && pnpm lint
pnpm dev &
sleep 12
curl -s -o /dev/null -w "inventur HTTP %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/inventur
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(lagerbuch): +/- je Zeile in der Inventur

Beide Knoepfe rufen wertSetzen -- denselben Pfad wie das Eingabefeld, kein
zweiter Zustandsweg. Die disabled-Grenzen spiegeln min/max des Feldes, sonst
fuehrte ein Klick zu einem Wert, den das Feld gleich zurueckzieht.

positionenAus bleibt unberuehrt: eine beruehrte Zeile wird auch dann
eingereicht, wenn + und - sich aufheben. Das ist kein Versehen, sondern der
Lost-Update-Schutz -- der Server vergleicht gegen den Live-Bestand. Ein Test
haelt die Eigenschaft jetzt ausdruecklich fest, damit sie niemand
"wegoptimiert".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Etikettenseite — Bildschirm-Chrome

**Files:**
- Create: `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenChrome.tsx`
- Create: `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenChrome.test.tsx`
- Modify: `src/app/m/lagerbuch/verwaltung/(druck)/etiketten/page.tsx:61-73`

**Interfaces:**
- Consumes: `PiArrowLeft`, `PiPrinter` aus `react-icons/pi`
- Produces: `EtikettenChrome({ basis }: { basis: string })`

**Der Kern dieser Task:** Der fehlende Rahmen ist Absicht — aber nur fürs Papier. `(druck)/layout.tsx` lässt die Shell weg, weil `FullShell` sonst Kopfzeile und App-Switcher mitdruckt und `minHeight:100vh` leere Folgeseiten erzeugt. Die Lösung ist deshalb **nicht** `FullShell`, sondern Bildschirm-Chrome innerhalb der Druckroute.

- [ ] **Step 1: Test zuerst**

```tsx
// EtikettenChrome.test.tsx
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { EtikettenChrome } from "./EtikettenChrome";

const QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenChrome.tsx",
  "utf8",
);

describe("Bildschirm-Chrome des Etikettenbogens", () => {
  it("trägt lb-nichtDrucken an jedem äußeren Element", async () => {
    await mount(<EtikettenChrome basis="https://lagerbuch.example" />);
    const wurzel = query("[data-testid='lb-chrome']");
    expect(wurzel.className).toContain("lb-nichtDrucken");
    await unmount();
  });

  it("führt zurück in die Verwaltung", async () => {
    await mount(<EtikettenChrome basis="https://lagerbuch.example" />);
    expect(query("a[href='/verwaltung']")).not.toBeNull();
    await unmount();
  });

  it("nennt die Basis, auf die die QR-Codes zeigen", async () => {
    await mount(<EtikettenChrome basis="https://lagerbuch.example" />);
    expect(query("[data-testid='lb-basis']").textContent)
      .toContain("https://lagerbuch.example");
    await unmount();
  });

  /*
   * DIE REGEL, DIE HIER GEPRUEFT WIRD, IST EINE CSS-REGEL — und deshalb kann
   * dieser Test sie nur halb sehen. `.lb-nichtDrucken{display:none!important}`
   * steht in druck.css innerhalb @media print; jsdom wertet das nicht aus.
   * Was hier haelt: dass die Klasse UEBERHAUPT an jedem aeusseren Element
   * steht. Dass sie im Druck greift, zeigt nur die Druckemulation (Task 9).
   *
   * `!important` in druck.css ist kein Zufall: ein Inline-Style haette
   * hoehere Praezedenz als jede Selektorregel des externen Stylesheets. Wer
   * hier ein `style={{display:...}}` ergaenzt, druckt es mit aufs Etikett.
   */
  it("setzt keinen Inline-display-Style, der die Druckregel schlagen würde", () => {
    expect(QUELLE).not.toMatch(/style=\{\{[^}]*display:/);
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)/etiketten/EtikettenChrome.test.tsx"
```

- [ ] **Step 3: Das Chrome bauen**

```tsx
"use client";

/*
 * DAS BILDSCHIRM-CHROME DES ETIKETTENBOGENS.
 *
 * WARUM NICHT FullShell: `(druck)/layout.tsx` laesst die Suite-Shell aus zwei
 * Gruenden weg, die beide weiter gelten -- FullShell druckt Kopfzeile und
 * App-Switcher mit, und sein `minHeight:100vh` erzeugt leere Folgeseiten
 * hinter dem Bogen. Der Rahmen fehlte also nur am BILDSCHIRM, und genau dort
 * setzt diese Insel an.
 *
 * JEDES AEUSSERE ELEMENT TRAEGT `lb-nichtDrucken`. Die Klasse ist global
 * (druck.css ist ein gewoehnliches Stylesheet, kein CSS-Modul) und blendet
 * innerhalb @media print mit `!important` aus. Wer hier einen Inline-Style
 * fuer `display` ergaenzt, schlaegt die Regel und druckt das Chrome mit aufs
 * gekaufte Etikettenmaterial -- ohne dass ein Test oder `pnpm build` es vor
 * dem Drucker zeigte.
 *
 * WARUM EINE CLIENT-INSEL: `page.tsx` ist eine Server Component und traegt
 * bewusst KEIN antd und KEIN Zeichen (Fallen 1 und 7). Der Druckknopf
 * braucht ausserdem `window.print()`.
 */
import { Button, Flex } from "antd";
import Link from "next/link";
import { PiArrowLeft, PiPrinter } from "react-icons/pi";

export function EtikettenChrome({ basis }: { basis: string }) {
  return (
    <div className="lb-nichtDrucken" data-testid="lb-chrome">
      <Link
        href="/verwaltung"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <PiArrowLeft size={15} aria-hidden focusable="false" style={{ flex: "none" }} />
        Zurück zur Verwaltung
      </Link>

      <Flex align="center" justify="space-between" gap={12} style={{ marginBlock: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Etiketten</h1>
          {/*
            §8.1, 8-B: `moduleUrl` nimmt prodHostsFor(mod)[0]. Eine Umsortierung
            von SUITE_HOST_LAGERBUCH aendert STILL jeden ab dann gedruckten
            Bogen, waehrend die alten Etiketten weiter auf den frueheren ersten
            Eintrag zeigen. Diese Zeile ist der einzige Weg, den Fehler VOR dem
            Papier zu bemerken.
          */}
          <p data-testid="lb-basis" style={{ margin: 0 }}>
            Alle QR-Codes zeigen auf {basis}
          </p>
        </div>
        <Button
          type="primary"
          onClick={() => window.print()}
          icon={<PiPrinter size={16} aria-hidden focusable="false" />}
        >
          Drucken
        </Button>
      </Flex>
    </div>
  );
}
```

`Flex` und `Button` sind keine Compound-Zugriffe und hier ohnehin in einer Client-Insel.

- [ ] **Step 4: `page.tsx` umstellen**

Die Zeilen 61-73 werden zu:

```tsx
  return (
    <>
      <EtikettenChrome basis={daten.basis} />
      <EtikettenBogen artikel={daten.artikel} tokens={daten.tokens} />
      {daten.artikel.length === 0 && daten.tokens.length === 0 && (
        <p className="lb-nichtDrucken">
          <a href="/verwaltung">Zurück zur Übersicht</a>
        </p>
      )}
    </>
  );
```

Der `<h1>` und das `<p data-testid="lb-basis">` wandern in das Chrome; **`data-testid="lb-basis"` muss mitwandern**, es hängen Tests daran.

Drei Dinge bleiben unverändert:
- Der Fehlerzweig `EtikettenBasisFehlt` (Zeilen 38-58) — er rendert bewusst ohne antd.
- Der Sonderfall-Link bei leerem Bestand. Er ist durch das Chrome redundant, aber seine Bedingung und DOM-Position sind in Tests festgehalten, und ein zweiter Weg zurück schadet nicht.
- Beide Zugriffsriegel in Layout **und** Seite.

Der Kopfkommentar von `page.tsx` bekommt einen Zusatz: die Datei ist weiterhin antd- und icon-frei, das Chrome ist die Insel daneben.

- [ ] **Step 5: Bestehende Etiketten-Tests**

```bash
pnpm vitest run "src/app/m/lagerbuch/verwaltung/(druck)"
```

Tests, die `lb-basis` oder den `<h1>` in `page.tsx` suchten, finden sie jetzt im Chrome. Zusicherungen anpassen, nicht löschen.

- [ ] **Step 6: Der Abruf, den kein Test ersetzt**

```bash
pnpm typecheck && pnpm lint
pnpm dev &
sleep 12
curl -s http://lagerbuch.localtest.me:3000/verwaltung/etiketten -o /tmp/etiketten.html -w "HTTP %{http_code}\n"
grep -c "lb-nichtDrucken" /tmp/etiketten.html
grep -c "lb-etikett" /tmp/etiketten.html
```

Erwartet: `HTTP 200`, beide Zählungen > 0. Ein 500 heißt: antd oder ein Zeichen ist doch in `page.tsx` gelandet.

Die **Druckemulation** folgt in Task 9 — sie ist die einzige Prüfung, die zeigt, dass das Chrome auf Papier verschwindet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(lagerbuch): Bildschirm-Rahmen fuer die Etikettenseite

Der Rahmen fehlte nur am Bildschirm, und das war halb Absicht: (druck) laesst
die Suite-Shell weg, weil FullShell Kopfzeile und App-Switcher mitdruckt und
sein minHeight:100vh leere Folgeseiten hinter dem Bogen erzeugt. Beide Gruende
gelten weiter -- deshalb kein FullShell, sondern eine Insel innerhalb der
Druckroute, die vollstaendig unter lb-nichtDrucken haengt.

Client-Insel, weil page.tsx eine Server Component ist und bewusst weder antd
noch ein Zeichen traegt (Fallen 1 und 7); window.print() braucht sie ohnehin.

Kein Inline-Style fuer display in der Insel: druck.css blendet mit !important
aus, weil ein Inline-Style jede Selektorregel des externen Stylesheets
schluege -- und das Chrome laege auf gekauftem Etikettenmaterial, ohne dass
ein Test es vor dem Drucker zeigte. Ein Quelltext-Test haelt das fest.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Abschlussverifikation

Diese Task schreibt keinen Produktivcode. Sie führt die Belege, die die Standardkette **strukturell nicht führen kann** — und ohne die „alle Gates grün" für diesen Branch nichts bedeutet.

**Files:**
- Create: `e2e/lagerbuch-ux.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-12-lagerbuch-ux-verbesserungen-design.md` (Messwerte nachtragen)

- [ ] **Step 1: Die volle Standardkette**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build 2>&1 | tee /tmp/lagerbuch-build-nachher.txt | tail -40
```

Alle vier grün, bevor es weitergeht.

- [ ] **Step 2: Bundle-Vergleich**

```bash
diff <(grep -E "^\S*/(m/)?lagerbuch" /tmp/lagerbuch-build-vorher.txt) \
     <(grep -E "^\S*/(m/)?lagerbuch" /tmp/lagerbuch-build-nachher.txt)
```

Erwartet: die Route-Größen bewegen sich moderat. **Ein Sprung um mehrere hundert KB heißt, dass das Phosphor-Barrel mitgebündelt wird** — dann prüfen, ob irgendwo `import … from "react-icons"` ohne Set-Suffix steht (der Riegel aus Task 1 sollte das gefangen haben) und den gemessenen Wert in der Spec festhalten.

Die Zahlen werden in Abschnitt 4c der Spec eingetragen — sie war ausdrücklich als „wird belegt, nicht behauptet" formuliert.

- [ ] **Step 3: Der E2E-Test, der die Druckregel prüft**

```ts
// e2e/lagerbuch-ux.spec.ts
import { expect, test } from "@playwright/test";

/*
 * DIE EINZIGE PRUEFUNG, DIE DIE DRUCKREGEL SIEHT. jsdom wertet @media print
 * nicht aus; ein Vitest-Lauf kann nur pruefen, DASS die Klasse gesetzt ist,
 * nicht dass sie greift. Ohne diesen Test ist "das Chrome verschwindet im
 * Druck" eine Behauptung, die sich erst auf gekauftem Etikettenmaterial
 * widerlegt.
 */
test("Etikettenbogen: Chrome am Bildschirm, unsichtbar im Druck", async ({ page }) => {
  await page.goto("/verwaltung/etiketten");

  await expect(page.getByTestId("lb-chrome")).toBeVisible();
  await expect(page.getByTestId("lb-basis")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("lb-chrome")).toBeHidden();

  // Der Bogen selbst bleibt — er ist der Zweck der Seite.
  await expect(page.locator(".lb-etikettbogen")).toBeVisible();
});

test("Inventur: ± verändert den Wert und bucht die Zeile", async ({ page }) => {
  await page.goto("/verwaltung/inventur");
  const ersteZeile = page.locator("tbody tr").first();
  const feld = ersteZeile.locator("input[aria-label^='Ist-Bestand']");
  const vorher = await feld.inputValue();

  await ersteZeile.locator("button[aria-label*='erhöhen']").click();
  await expect(feld).toHaveValue(String(Number(vorher) + 1));

  await ersteZeile.locator("button[aria-label*='verringern']").click();
  await expect(feld).toHaveValue(vorher);
});

test("Navigation trägt Zeichen und die Seite antwortet", async ({ page }) => {
  const antwort = await page.goto("/verwaltung");
  expect(antwort?.status()).toBe(200);
  // 15 Nav-Eintraege, jeder mit einem Zeichen.
  await expect(page.locator("nav svg")).toHaveCount(15, { timeout: 10_000 });
});

test("BZ-Übersicht zeigt vier Kennzahlen", async ({ page }) => {
  await page.goto("/verwaltung/bz");
  await expect(page.getByText("Ø Akku-Lebensdauer")).toBeVisible();
  await expect(page.getByText("Überfällig / nie geprüft")).toBeVisible();
});
```

Lies zuerst eine bestehende Datei in `e2e/` — Basis-URL, Anmeldung und Host-Auflösung sind dort schon gelöst und werden übernommen, nicht neu erfunden. Der Nav-Selektor (`nav svg`) muss an die tatsächliche Struktur von `SuiteNav` angepasst werden; nimm ihn aus dem gerenderten HTML von Task 3 Step 7.

- [ ] **Step 4: Playwright laufen lassen**

```bash
pnpm exec playwright test
```

Die volle Suite, nicht nur die neue Datei — dieser Branch fasst `core/shell` an, und das betrifft jedes Modul.

- [ ] **Step 5: Der Zugriffsriegel der Druckroute**

Kein Regressionsverdacht aus diesem Branch, aber die einzige Zusicherung, die die Kopplung beider Riegel überhaupt prüft (T167, T175) — und dieser Branch fasst die Druckroute an:

```bash
# Ohne Lagerbuch-Gruppe muss /verwaltung/etiketten dieselbe Antwort geben
# wie /verwaltung/artikel ohne Gruppe.
curl -s -o /dev/null -w "etiketten %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/etiketten
curl -s -o /dev/null -w "artikel   %{http_code}\n" http://lagerbuch.localtest.me:3000/verwaltung/artikel
```

Beide Codes müssen **gleich** sein. Unterscheiden sie sich, ist beim Umbau des Chromes ein Riegel verlorengegangen — das ist die sicherheitsrelevante Zeile dieses Moduls, die Seite zeigt Zugangs-Codes im Klartext.

- [ ] **Step 6: Messwerte in die Spec eintragen**

Abschnitt 4c („Die Route-Größen aus `pnpm build` werden vor und nach der Migration festgehalten") bekommt die tatsächlichen Zahlen. Der Abruf-Beleg aus Task 1 Step 5 wird im Vorbefund-Abschnitt als „gemessen am TT.MM.JJJJ" vermerkt.

Die Belege gehören in ein verfolgtes Artefakt, nicht in einen Sitzungsbericht — Berichte unter `docs/superpowers/berichte/` sind git-ignoriert.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(lagerbuch): die Belege, die typecheck/build/vitest strukturell nicht fuehren

Alle vier Fallen, die dieser Branch beruehrt (1, 3, 6, 7), bleiben unter der
Standardkette gruen -- "alle Gates gruen" bedeutet fuer diese Arbeit nichts.
Die Belege sind deshalb Abrufe: HTTP 200 auf einer Server Component mit
react-icons/pi, 15 Zeichen in der Navigation, und die Druckemulation, die als
einzige zeigt, dass das Etiketten-Chrome auf Papier verschwindet.

Dazu der Riegel-Vergleich der Druckroute (T167/T175): /verwaltung/etiketten
und /verwaltung/artikel muessen ohne Gruppe dieselbe Antwort geben. Die Seite
zeigt Zugangs-Codes im Klartext; ein verlorener Riegel waere hier der
teuerste Fehler des Branches.

Die Bundle-Zahlen sind gemessen und stehen jetzt in der Spec, wo vorher eine
Absichtserklaerung stand.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Abgrenzung

Gehört auf das ClickUp-Board („I&K Suite", 901524923921), **nicht** in diesen Branch:

- Nav-Icons für `files`, `feedback` und `portal`. Das Feld steht nach Task 3 bereit; welche Zeichen die Module tragen, ist je Modul eine eigene Entscheidung.
- Umstellung der Suite-Kopfzeile (`core/shell/icons.ts`, heute `@ant-design/icons`) auf Phosphor. Suiteweiter Eingriff mit eigenem Risiko und eigenem Riegel (`core/shell/icons.test.ts`).
- Die vier Kennzahlleisten, die Original und Portierung bereits gemeinsam haben — sie sind vollständig und werden nicht angefasst.
