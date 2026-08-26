// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.test.tsx
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * INSEL 2 — DIE AUSLEIHENLISTE DER VERWALTUNG (`Spec:4498-4506`, §5.9; Aufgabe V16).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ ZWEI BLINDE FLECKEN, BEIDE GEERBT UND BEIDE BENANNT:
 *   1. **Falle 9.** In jsdom gibt es keine RSC-Grenze — eine `render`-Funktion ist hier ein
 *      gewoehnlicher Funktionswert. Zoege jemand `SPALTEN` nach `_lib/` und liesse die Server
 *      Component sie durchreichen, bliebe JEDER Fall dieser Datei gruen. Der Waechter dagegen
 *      ist der Playwright-Fall aus `Spec:4881-4882` (Fall 5) — Eigentuemer Aufgabe V23.
 *   2. **Die Breite.** `vitest.setup.ts` stubt `matchMedia` mit `matches: false`, also liefert
 *      `Grid.useBreakpoint()` hier ausschliesslich falsche Breakpoints — gerendert wird der
 *      MOBILE Zweig. Die sieben Spalten werden deshalb REIN an `SPALTEN` geprueft und ihre
 *      Zellen ueber ein Geruest, nicht am gerenderten Tabellenkopf. Der Kopf ist V23s Fall.
 *      Dieselbe Aufteilung und derselbe Grund wie in `GeraeteTabelle.test.tsx:25-29`.
 *
 * ⛔ WAS DIESE DATEI ZUSAETZLICH ZUM AUFGABENBRIEF HAELT: die vier 1:1-Untergrenzen, die der
 * Vorabscan als UNGEPRUEFT gemeldet hat (`.superpowers/sdd/planteil4/VORABSCAN.md:665`:
 * „nur 4 Faelle — Sortierung, Seitengroesse und `gesamt` sind **nicht** gepruefte
 * 1:1-Pflichten"). Sie sind die Untergrenze, die der Filter aus ⬜ V-L11 nicht verschieben
 * darf (`.superpowers/sdd/planteil4/progress.md`: „die Grundliste, ihre Sortierung und ihre
 * Spalten bleiben, wie der Bestand sie hat; der Filter kommt HINZU").
 */

/*
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD. Ein gewoehnliches
 * `const replaceMock = vi.fn()` darueber ist zur Ausfuehrungszeit der Fabrik noch nicht
 * initialisiert (gemessen in `GeraeteTabelle.test.tsx:80-85`: `ReferenceError: Cannot access
 * ... before initialization`, und die ganze Datei faellt aus, nicht ein Fall).
 *
 * ⚠️ OHNE DIESEN ERSATZ STIRBT JEDER `mount()` AN `invariant expected app router to be
 * mounted` — gemessen beim ersten Lauf dieser Aufgabe: 4 von 15 Faellen rot, alle mit dieser
 * Meldung. Die Insel schreibt ihre Blaetterung und ihren Filter ueber `router.replace`.
 */
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/admin/ausleihen",
}));

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/ausleihen";
const QUELLE_TABELLE = `${INSEL_ORDNER}/AusleihenTabelle.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"). Gemessen in der
 * Schlusspruefung zu V13 (`REVIEW-V13.md:101`, Fund M2): eine zusaetzliche Datei in einem
 * Inselverzeichnis, ohne Bauform-Direktive UND mit einem Wertimport aus `_db/schema`, liess
 * eine handgeschriebene Namensliste voellig unbeeindruckt.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**).
 */
const SERVER_EINSTIEGE = ["page.tsx", "layout.tsx", "template.tsx", "route.ts"];

function inselDateien(): string[] {
  return readdirSync(INSEL_ORDNER)
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !/\.test\.tsx?$/.test(name))
    .filter((name) => !SERVER_EINSTIEGE.includes(name))
    .sort();
}

/** ⛔ Die Sollwerttafel steht NUR auf der rechten Seite — sie ist der Prueffling der Messung. */
const INSEL_SOLL = ["AusleihenTabelle.tsx"];

import { act } from "react";
import {
  click,
  clickElement,
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { ohneKommentare } from "../../../_lib/quelltextScan";
import type { AusleihZeile } from "../../../_lib/lesepfade/ausleihen";
import { AusleihenTabelle, SPALTEN } from "./AusleihenTabelle";

/**
 * Eine Zeile, wie der Lesepfad sie liefert — VORFORMATIERT und serialisierbar, ohne `Date`
 * (`_db/leihen.ts`, Kopf von `LeihZeile`; Bauform-Zulaessigkeitstafel Nr. 7). Die Vorbelegung
 * ist die haeufigste Zeile der Flaeche: eine laufende Ausleihe.
 */
function zeile(teil: Partial<AusleihZeile> = {}): AusleihZeile {
  return {
    id: "l-1",
    rufname: "41/12",
    geraetetyp: "Motorola MTP3550",
    entleiher: "Anna Beispiel",
    ausgeliehenText: "14.06.2026, 09:12",
    zurueckText: "—",
    aktiv: true,
    notiz: null,
    ...teil,
  };
}

/** Die vorbelegten Props — jeder Fall aendert nur, worauf er zielt. */
function props(teil: Partial<Parameters<typeof AusleihenTabelle>[0]> = {}) {
  return {
    zeilen: [zeile()],
    gesamt: 1,
    seite: 1,
    seitenGroesse: 20,
    filter: { geraet: "", von: "", bis: "" },
    geraete: [{ id: "g-1", rufname: "41/12" }],
    ...teil,
  };
}

/**
 * Ein Geruest, das die ZELLEN der sieben Spalten rendert.
 *
 * ⛔ ES IST DER EINZIGE WEG AN DIE ZELLEN, und der Grund steht im Kopf dieser Datei: in jsdom
 * rendert `AusleihenTabelle` den MOBILEN Zweig, nicht die Tabelle. Ein Fall, der die Zellen
 * am gerenderten Tabellenkopf suchte, maesse den falschen Zweig — oder gar nichts.
 */
type ZellenRender = (wert: unknown, zeile: AusleihZeile, index: number) => ReactNode;

function Zellen({ z }: { z: AusleihZeile }) {
  return (
    <div>
      {SPALTEN.map((spalte, i) => (
        <div key={String(spalte.key)}>
          {/*
            ⚠️ DIE ENGERE SIGNATUR IST EINE MESSUNG, KEINE BEQUEMLICHKEIT: antds `render` darf
            auch ein `RenderedCell` (`{ children, props }`) liefern, und dann waere die Zelle
            kein `ReactNode`. Keine der sieben Spalten tut das — faengt eine damit an, faellt
            dieser Ausdruck beim Typecheck auf, statt still eine leere Zelle zu rendern.
          */}
          {(spalte.render as ZellenRender | undefined)?.(undefined, z, i)}
        </div>
      ))}
    </div>
  );
}

/** Der Text jeder Zelle einer Rolle, ohne Randleerraum. */
function texte(rolle: string): string[] {
  return queryAll(`[data-rolle="${rolle}"]`).map((el) => (el.textContent ?? "").trim());
}

/**
 * ⛔ OHNE DIESE ZEILE ZAEHLEN DIE URL-FAELLE UEBEREINANDER. `vi.hoisted` legt `replaceMock`
 * EINMAL fuer die ganze Datei an; ein zweiter Fall saehe die Aufrufe des ersten mit, und
 * `toHaveBeenCalledTimes(1)` waere von der Reihenfolge der Faelle abhaengig statt von der
 * Sache. Dieselbe Vorkehrung und derselbe Grund wie in `GeraeteTabelle.test.tsx`.
 */
beforeEach(() => {
  replaceMock.mockReset();
  /*
   * ⛔ UND DIE ADRESSZEILE GEHOERT EBENSO ZURUECKGESETZT. `schreibeUrl` liest den BESTAND aus
   * `window.location.search` (`AusleihenTabelle.tsx`, „Er legt IMMER den vollstaendigen Patch
   * auf die bestehende Abfrage"); jsdom teilt ein `window` ueber die ganze Datei, ein Fall, der
   * die Adresse setzt, reichte sie sonst an alle folgenden weiter.
   */
  window.history.replaceState({}, "", "/admin/ausleihen");
});

afterEach(async () => {
  await unmount();
});

/**
 * Das Auswahlfeld des Geraetefilters bedienen.
 *
 * ⛔ `mousedown` AUF DER HUELLE, NICHT `click` AUF DEM FELD — gemessen im Haus
 * (`src/app/m/aufgaben/_ui/testFelder.ts:56-59`): rc-select oeffnet am `onMouseDown` seines
 * Wrapper-`<div>` (`.ant-select`); ein Klick auf das innere `<input>` liess die Liste leer,
 * ohne dass irgendetwas fehlschlug. ⛔ Und die Optionen haengen in einem PORTAL an
 * `document.body`, nicht im Mount-Wirt.
 *
 * ⚠️ NACHGEBAUT UND NICHT IMPORTIERT: `testFelder.ts` gehoert dem Modul `aufgaben`; ein
 * modulfremder Testimport waere eine Bindung, die dieses Modul nirgends sonst eingeht.
 *
 * ⚠️ DIE OPTIONSSUCHE GREIFT GLOBAL AUF `document.body` — sie gilt, SOLANGE GENAU EIN
 * Auswahlfeld auf der Flaeche steht. Kommt ein zweites dazu, trifft sie still das falsche
 * Portal; dann bekommt sie ihre Einschraenkung (Beobachtung B2 der Nachpruefung). ⛔ Und der
 * Weg dahin ist NICHT „wie `testFelder.ts`": das Hausvorbild greift bei `:74` gemessen
 * ebenso global auf `document.body` zu; seine Id fuehrt bei `:62` zur HUELLE, und die sucht
 * dieser Helfer bereits genauso.
 */
async function waehleGeraet(anzeigetext: string): Promise<void> {
  const huelle = query('[data-rolle="radio-ausleihen-geraetefeld"]').closest(".ant-select");
  if (!(huelle instanceof HTMLElement)) throw new Error("das Geraetefeld steckt in keinem antd-Select");
  await act(async () => {
    huelle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    huelle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const optionen = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"),
  );
  const treffer = optionen.find((o) => (o.textContent ?? "").trim() === anzeigetext);
  if (!treffer) {
    throw new Error(
      `Option nicht gefunden — da stand: ${optionen.map((o) => o.textContent).join(", ")}`,
    );
  }
  await clickElement(treffer);
}

/** Das Ziel des einzigen `router.replace`-Aufrufs, zerlegt. */
function geschriebenesZiel(): { pfad: string; abfrage: URLSearchParams } {
  const ziel = String(replaceMock.mock.calls[0]![0]);
  const [pfad, roh] = ziel.split("?");
  return { pfad: pfad!, abfrage: new URLSearchParams(roh ?? "") };
}

describe("radio-Ausleihen: die sieben Spalten", () => {
  it("sieben Spalten, in dieser Reihenfolge", async () => {
    /*
     * ⛔ 1:1 AUS `LoanList.tsx:15-47`, UND `toEqual` STATT `toContain`: eine vertauschte
     * Reihenfolge bestuende jede Enthaltensein-Pruefung, und eine achte Spalte ebenso. Die
     * Liste ist der Vertrag, nicht ihre Menge.
     */
    expect(SPALTEN.map((spalte) => spalte.title)).toEqual([
      "Gerät",
      "Typ",
      "Ausleihende:r",
      "Ausgeliehen",
      "Zurückgegeben",
      "Status",
      "Notiz",
    ]);
  });

  it("das Statuszeichen kommt aus rueckgabeAm gleich null", async () => {
    /*
     * ⛔ DER FALL, DEN `Spec:4861` NAMENTLICH NENNT, und die Zusage steht woertlich im
     * Bestand: `LoanList.tsx:10-13` („Active vs. returned status, derived purely from
     * `returnedAt`"). Entscheidung **E-V14** uebernimmt sie 1:1.
     *
     * ⛔ BEIDE ZUSTAENDE, und die Rueckgabezeit der zweiten Zeile ist GESETZT: eine Ableitung
     * aus `ausgeliehenText` oder aus einem zweiten Zustandsbegriff bestuende einen Fall, der
     * nur den aktiven Zustand kennt.
     */
    await mount(
      <>
        <Zellen z={zeile({ aktiv: true, zurueckText: "—" })} />
        <Zellen z={zeile({ id: "l-2", aktiv: false, zurueckText: "15.06.2026, 08:00" })} />
      </>,
    );

    expect(texte("radio-leihe-status")).toEqual(["Aktiv", "Zurückgegeben"]);
  });

  it("das Statuszeichen ist nicht der einzige Traeger", async () => {
    /*
     * ⛔ FALLE 3 IN IHRER ALLGEMEINEN FORM: jede Zeile traegt ihr WORT, nicht nur ihren Ton.
     * `LoanList.tsx:11-12` unterscheidet die zwei Zustaende ueber `color="processing"` UND
     * ueber den Text; ein `<Tag color="processing" />` ohne Kind waere fuer Menschen mit
     * Farbsehschwaeche und in jedem Ausdruck unlesbar — und faerbt genau diesen Fall rot,
     * weil sein Text dann leer ist.
     *
     * ⛔ UND DIE ZWEI WOERTER MUESSEN VERSCHIEDEN SEIN: ein Bau, der beide Zustaende gleich
     * beschriftet, bestuende eine blosse „nicht leer"-Pruefung.
     */
    await mount(
      <>
        <Zellen z={zeile({ aktiv: true })} />
        <Zellen z={zeile({ id: "l-2", aktiv: false, zurueckText: "15.06.2026, 08:00" })} />
      </>,
    );

    const woerter = texte("radio-leihe-status");
    expect(woerter.length, "kein Statuszeichen gerendert").toBe(2);
    for (const wort of woerter) expect(wort, "der Ton traegt allein").not.toBe("");
    expect(new Set(woerter).size, "beide Zustaende tragen dasselbe Wort").toBe(2);
  });

  it("ein leerer Typ und eine leere Notiz werden zum Gedankenstrich", async () => {
    /*
     * `LoanList.tsx:21` und `:45`, je `render: (v) => v || '—'`.
     *
     * ⛔ BEIDE SPALTEN, MIT JE UNTERSCHIEDLICHEM WERT AUF DER ANDEREN: ein Bau, der nur eine
     * der beiden faltet, bliebe bei einem symmetrischen Fixture gruen.
     *
     * ⛔ UND `null` WIE LEERE ZEICHENKETTE — beide Spalten sind Freitext (`_db/schema.ts:216`,
     * `:221`), der Bestand faltet mit `||` und nicht mit `??`.
     */
    await mount(
      <>
        <Zellen z={zeile({ geraetetyp: null, notiz: "Kratzer am Display" })} />
        <Zellen z={zeile({ id: "l-2", geraetetyp: "", notiz: "" })} />
        <Zellen z={zeile({ id: "l-3", geraetetyp: "HRT", notiz: null })} />
      </>,
    );

    expect(texte("radio-leihe-typ")).toEqual(["—", "—", "HRT"]);
    expect(texte("radio-leihe-notiz")).toEqual(["Kratzer am Display", "—", "—"]);
  });

  it("die Grundliste bietet KEINE Sortierung an", async () => {
    /*
     * ⛔ EINE 1:1-UNTERGRENZE, die der Vorabscan als ungeprueft gemeldet hat
     * (`VORABSCAN.md:665`). `leihhistorie` sortiert IMMER `desc(borrowedAt)`, ohne Parameter
     * (1:1 `loanRepo.ts:153`, ausgeschrieben in `_db/leihen.ts`). Ein `sorter` an einer Spalte
     * ergaebe eine antd-INTERNE Sortierung ueber der bereits geschnittenen Seite — die
     * Reihenfolge auf dem Bildschirm waere eine andere als die der Abfrage, und zwar nur auf
     * der gerade sichtbaren Seite. Kein Tor faengt das.
     */
    expect(SPALTEN.filter((spalte) => spalte.sorter !== undefined).map((s) => s.key)).toEqual([]);
  });
});

describe("radio-Ausleihen: Blaetterung und Filter", () => {
  it("die Blaetterung rechnet mit der Seitengroesse aus den Props", async () => {
    /*
     * ⛔ DIE ZWEITE UNGEPRUEFTE 1:1-UNTERGRENZE (`VORABSCAN.md:665`: `gesamt` und die
     * Seitengroesse). `gesamt` ist die GEFILTERTE Menge, nicht die Seite (`_db/leihen.ts`,
     * dasselbe `where` wie die Zeilenabfrage) — rechnete die Blaetterung mit der Zeilenzahl
     * der Seite, stuende auf jeder vollen Seite „Seite 1 von 1".
     */
    await mount(<AusleihenTabelle {...props({ gesamt: 45, seite: 2, seitenGroesse: 20 })} />);

    expect(texte("radio-blaetterung-text")).toEqual(["Seite 2 von 3 · 45 Ausleihen"]);
  });

  it("eine Filteraenderung schreibt die Adresszeile und setzt auf Seite 1 zurueck", async () => {
    /*
     * ⛔ DER GANZE URL-SCHREIBWEG DER INSEL WAR UNBEWACHT (Schlusspruefung V16, Fund 1):
     * `replaceMock` wurde angelegt und eingehaengt, aber in keinem Fall zugesichert. Zwei
     * Mutationen gleichzeitig — die Seite-1-Ruecksetzung entfernt UND `replace` zu `push`
     * gedreht — liessen das GANZE Modul gruen (62 Dateien, 882 Faelle). Bauform 1:1 aus
     * `GeraeteTabelle.test.tsx` („ein gesetzter Filter landet in der URL").
     *
     * ⛔ DER FALL MUSS MIT `seite: 3` MONTIEREN UND NICHT MIT DER VORBELEGUNG, und das ist
     * gemessen, nicht vermutet: `ausleihenSuchparameterZu` faltet die Seite 1 zur LEEREN
     * Zeichenkette (`_lib/suchparameter.ts`, „Seite 1 ist die Vorgabe"), und `angewandt`
     * loescht leere Schluessel. Auf der Vorbelegung schrieben die richtige Fassung und die
     * Fehlform `{ ...naechster, seite }` DIESELBE Adresse — der Fall waere 0 rot by
     * construction, genau die Klasse aus Ruling R-V11-1.
     *
     * ⛔ `toHaveBeenCalledTimes(1)` AUF `replaceMock` IST DIE HAELFTE, DIE `push` FAENGT: der
     * Ersatz reicht fuer `push` ein frisch gebautes `vi.fn()` heraus, das niemand abgreift —
     * eine Insel, die `push` benutzte, liesse den Zaehler hier auf 0 fallen
     * (`AusleihenTabelle.tsx`: „`replace`, NICHT `push`").
     */
    await mount(<AusleihenTabelle {...props({ seite: 3, gesamt: 100 })} />);
    await waehleGeraet("41/12");

    expect(replaceMock, "der Filter hat die URL nicht geschrieben").toHaveBeenCalledTimes(1);
    const { pfad, abfrage } = geschriebenesZiel();
    expect(pfad, "die Insel schreibt einen fremden Pfad").toBe("/admin/ausleihen");
    expect(abfrage.get("geraet"), "der gewaehlte Filter steht nicht in der Adresszeile").toBe("g-1");
    expect(abfrage.get("seite"), "die Filteraenderung bleibt auf der alten Seite stehen").toBe(null);
  });

  it("die Blaetterung schreibt die Adresszeile, ohne den Filter zu verlieren", async () => {
    /*
     * ⛔ DIE ZWEITE HAELFTE DESSELBEN SCHREIBWEGS. `schreibeUrl({ ...stand, seite })` traegt
     * den bestehenden Filter mit; ein Blaettern, das ihn fallen liesse, spraenge auf Seite 2
     * der UNGEFILTERTEN Liste — und die Zeilen darunter waeren stillschweigend andere.
     *
     * ⛔ UND DIE SEITE MUSS HIER STEHENBLEIBEN, sie ist die Aussage: die Ruecksetzung aus dem
     * Fall darueber gilt fuer die FILTER-Aenderung, nicht fuer die Blaetterung.
     */
    await mount(
      <AusleihenTabelle
        {...props({ gesamt: 45, seite: 1, filter: { geraet: "g-1", von: "2026-06-01", bis: "" } })}
      />,
    );
    await click('[data-rolle="radio-blaettern-vor"]');

    expect(replaceMock, "die Blaetterung hat die URL nicht geschrieben").toHaveBeenCalledTimes(1);
    const { pfad, abfrage } = geschriebenesZiel();
    expect(pfad).toBe("/admin/ausleihen");
    expect(abfrage.get("seite"), "die Blaetterung blaettert nicht").toBe("2");
    expect(abfrage.get("geraet"), "die Blaetterung verliert den Geraetefilter").toBe("g-1");
    expect(abfrage.get("von"), "die Blaetterung verliert den Zeitraum").toBe("2026-06-01");
  });

  it("der Zuruecksetzen-Knopf leert JEDEN Filterwert in der Adresszeile", async () => {
    /*
     * ⛔ DER MESSENDE LESER VON `LEERER_AUSLEIHEN_FILTER` (Schlusspruefung V16, Fund 2): die
     * Konstante war exportiert und wurde NIRGENDS gelesen, waehrend die Filterleiste das
     * Literal von Hand hinschrieb — „der leere Filter" stand an zwei Stellen, und keine
     * Messung hielt sie zusammen.
     *
     * ⛔ DREI GESETZTE WERTE UND EINE SEITE GROESSER EINS: ein Zuruecksetzen, das nur den
     * Geraetefilter loeschte, bestuende ein Fixture mit nur einem gesetzten Wert. Das Ziel ist
     * die NACKTE Adresse — `ausleihenSuchparameterZu` fuehrt alle vier Schluessel als leere
     * Zeichenkette, und `angewandt` loescht genau die.
     *
     * ⛔ UND DIE VIER WERTE STEHEN AUCH IN DER ADRESSZEILE, NICHT NUR IN DEN PROPS — sonst
     * misst dieser Fall seinen eigenen Namen nicht (Nachpruefung der Fix-Runde 1, Beobachtung
     * B1). Gemessen: ohne diese Zeile ist `window.location.search` in jsdom LEER (weder
     * `vitest.setup.ts` noch `src/app/m/qr/_lib/test-dom.tsx` setzen eine Adresse), also hat
     * `schreibeUrl` gar keinen Bestand, aus dem etwas zu loeschen waere — ein
     * `ausleihenSuchparameterZu`, das die leeren Schluessel WEGLIESSE, blieb hier gruen
     * (Sonde vor dem Fix: 18 passed, 0 rot). ⛔ UND DIE VIER SCHLUESSELNAMEN SIND DIE DES
     * LESEWEGS, nicht des Schreibewegs: `page.tsx:76` reicht `await searchParams` an
     * `ausleihenParameterAus` (`_lib/suchparameter.ts:505-519`, `roh.geraet` · `roh.von` ·
     * `roh.bis` · `roh.seite`), und `page.tsx:87-89` baut daraus genau die Props dieses
     * Falls. Die Adresszeile hier ist also die Lage, die der Server herstellt.
     */
    window.history.replaceState(
      {},
      "",
      "/admin/ausleihen?geraet=g-1&von=2026-06-01&bis=2026-06-30&seite=2",
    );
    await mount(
      <AusleihenTabelle
        {...props({
          seite: 2,
          gesamt: 45,
          filter: { geraet: "g-1", von: "2026-06-01", bis: "2026-06-30" },
        })}
      />,
    );
    await click('[data-rolle="radio-ausleihen-filter-zuruecksetzen"]');

    expect(replaceMock, "das Zuruecksetzen hat die URL nicht geschrieben").toHaveBeenCalledTimes(1);
    expect(String(replaceMock.mock.calls[0]![0]), "ein Rest steht noch in der Adresszeile").toBe(
      "/admin/ausleihen",
    );
  });

  it("der Zeitraumfilter heisst nach dem, worauf er wirkt", async () => {
    /*
     * ⛔ ⬜ **V16-L1**, und die Beschriftung ist die ganze Abhilfe: das Fenster steht auf
     * `borrowedAt` und nicht auf einer Ueberlappung (1:1 `loanRepo.ts:140-141`). „Zeitraum
     * von/bis" liesse den Bedienenden glauben, er sehe jede Leihe, die an diesem Tag LIEF.
     */
    await mount(<AusleihenTabelle {...props()} />);

    expect(exists('[aria-label="Ausgeliehen von"]'), "das Von-Feld fehlt").toBe(true);
    expect(exists('[aria-label="Ausgeliehen bis"]'), "das Bis-Feld fehlt").toBe(true);
    /*
     * ⛔ DAS GERAETEFELD HAENGT AN SEINER ROLLE UND NICHT AN SEINER BESCHRIFTUNG. Die zwei
     * Datumsfelder duerfen ihren Anker als Text tragen, weil ihre Beschriftung die Aussage IST
     * (⬜ V16-L1). Die Beschriftung des Auswahlfelds traegt dagegen einen Umlaut und ist NEU —
     * der Bestand hat keinen Filter —, faellt also nicht unter die Bildschirmtext-Ausnahme der
     * Hausregel („niemals ein Umlaut in einem zitierten Wert oder einem Grep-Anker").
     */
    expect(exists('[data-rolle="radio-ausleihen-geraetefeld"]'), "das Geraetefeld fehlt").toBe(
      true,
    );
  });

  it("der mobile Zweig traegt Rufname, Status, Entleiher und die Ausleihzeit", async () => {
    /*
     * ⛔ ER WANDERT MIT (`LoanList.tsx:86-…`), IN DERSELBEN INSEL: `Grid.useBreakpoint()` ist
     * ein Client-Hook und `renderItem` waere Falle 9. In jsdom ist er der gerenderte Zweig
     * (Kopf dieser Datei) — deshalb ist er hier ueberhaupt messbar.
     */
    await mount(
      <AusleihenTabelle
        {...props({ zeilen: [zeile({ aktiv: false, zurueckText: "15.06.2026, 08:00", notiz: "Kratzer" })] })}
      />,
    );

    expect(texte("radio-leihe-mobil-name")).toEqual(["41/12"]);
    expect(texte("radio-leihe-status")).toEqual(["Zurückgegeben"]);
    expect(texte("radio-leihe-mobil-entleiher")).toEqual(["Anna Beispiel"]);
    expect(texte("radio-leihe-mobil-ausgeliehen")).toEqual(["Ausgeliehen: 14.06.2026, 09:12"]);
    expect(texte("radio-leihe-mobil-zurueck")).toEqual(["Zurückgegeben: 15.06.2026, 08:00"]);
    expect(texte("radio-leihe-mobil-notiz")).toEqual(["Kratzer"]);
  });

  it("die Flaeche traegt ihre Rolle in BEIDEN Zweigen", async () => {
    /*
     * ⛔ DER GRIFF DES PLAYWRIGHT-FALLS (V23, `Spec:4881-4882`) — und er darf nicht am
     * `<table>` haengen: die Insel hat zwei Zweige. (⚠️ Hier stand „⬜ V13-L2 laesst die Liste
     * dort heute leer" — seit V23 seedet der e2e-Lauf, `playwright.config.ts:141`.) Ein Griff
     * auf Tabellenmarkup meldete den mobilen Zweig als gebrochene Insel. Fall 4 sagt dasselbe.
     */
    await mount(<AusleihenTabelle {...props({ zeilen: [], gesamt: 0 })} />);
    expect(queryAll('[data-rolle="radio-ausleihen-flaeche"]').length).toBe(1);
  });
});

describe("radio-Ausleihen: die Bauform der Insel und ihrer Seite", () => {
  it("die Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 9 (Bauform-Zulaessigkeitstafel Nr. 1): die sieben Spalten fuehren sieben
     * `render`-Funktionen; dazu `Grid.useBreakpoint()`, `renderItem`, `Select` und
     * `DatePicker`. ⛔ DIE MENGE WIRD GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8");
      expect(quelle.trimStart().split("\n")[0]!.trim(), `${datei}: keine Direktive`).toMatch(
        /^["']use client["'];?$/,
      );
    }
  });

  it("die Tabelle blaettert nicht selbst und bietet keinen Groessenwechsler", () => {
    /*
     * ⛔ REGIME B (`KOPF.md`, antd-Zuordnung): `pagination={false}`, die Blaetterung laeuft
     * ueber die URL. ⚠️ EIN VERSEHENTLICH EINGESCHALTETES `pagination` FAELLT IN VITEST NICHT
     * AUF — jsdom zeigte dann eine zweite, rein clientseitige Blaetterung ueber den bereits
     * geschnittenen zwanzig Zeilen (derselbe Satz steht in `GeraeteTabelle.tsx`). Deshalb ein
     * Quelltext-Scan und nicht eine DOM-Zusicherung.
     *
     * ⛔ UND KEIN `size` — Falle 4: `FullShell` traegt `controlHeight: 44`
     * (`src/core/theme/theme.ts:207-209`). Platz schafft `scroll={{ x: "max-content" }}`.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(quelle, "die Tabelle blaettert selbst").toMatch(/pagination=\{false\}/);
    expect(quelle, "ein Groessenwechsler — der Bestand hat keinen (LoanList.tsx:66)").not.toMatch(
      /showSizeChanger/,
    );
    expect(quelle, "ein size-Attribut an einem antd-Bedienelement (Falle 4)").not.toMatch(
      /\bsize=\{?["']?(?:small|large)/,
    );
    expect(quelle, "ohne scroll bricht die Tabelle auf 390 px").toMatch(
      /scroll=\{\{ x: "max-content" \}\}/,
    );
  });

  it("keine Datei der Insel zieht _db/ oder drizzle-orm in den Browser", () => {
    /*
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen
     * (`.superpowers/sdd/planteil4/BERICHT-V13.md`). ⛔ HIER IST DIE GEFAHR NAMENTLICH:
     * `_lib/lesepfade/ausleihen.ts` traegt die Typen `AusleihZeile` UND `GeraetWahl` und
     * importiert `_db/leihen.ts` als WERT — beide duerfen NUR als `import type` vorkommen, und
     * ein `import type` ist eine EIGENE Anweisung, kein `type` in einer gemischten Klammer.
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE WURZELN (Ruling R-V11-3).
     * ⚠️ ER IST DIE UNTERGRENZE, NICHT DER BEWEIS: was das Bundle wirklich enthaelt, zeigt
     * erst `pnpm build` (V23).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    const WURZELN = gefunden.map((datei) => `${INSEL_ORDNER}/${datei}`);

    const BEZUG = /\b(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;

    function aufloesen(vonDatei: string, spezifizierer: string): string | null {
      if (!spezifizierer.startsWith(".")) return null;
      const basis = normalize(join(dirname(vonDatei), spezifizierer));
      for (const kandidat of [`${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts")]) {
        if (existsSync(kandidat)) return kandidat;
      }
      return null;
    }

    const gesehen = new Set<string>(WURZELN);
    const offen = [...WURZELN];
    const verstoesse: string[] = [];
    const gelesen = new Set<string>();

    const istServerModul = (datei: string): boolean =>
      /^["']use server["'];?$/.test(readFileSync(datei, "utf8").trimStart().split("\n")[0]!.trim());

    while (offen.length > 0) {
      const datei = offen.pop()!;
      if (istServerModul(datei)) continue;
      const quelle = ohneKommentare(readFileSync(datei, "utf8"));
      gelesen.add(datei);
      for (const treffer of quelle.matchAll(BEZUG)) {
        const nurTyp = treffer[1] !== undefined;
        const spezifizierer = treffer[3]!;
        if (nurTyp) continue;
        /*
         * ⛔ `next/headers` GEHOERT IN DIESE LISTE, UND DAS IST GEMESSEN (Schlusspruefung V16,
         * Fund 4): `import { headers } from "next/headers";` als Wertimport in die Insel
         * gesetzt liess drei Scandateien gruen (53 Faelle). Es ist dieselbe Klasse wie
         * `drizzle-orm` — ein Server-Baustein, den kein Browser-Bundle tragen kann.
         * ⚠️ `server-only` steht hier BEWUSST NICHT: seine kanonische Form ist der
         * NEBENWIRKUNGS-Import `import "server-only";`, und der traegt kein `from` — `BEZUG`
         * oben faende ihn nie. Ein Eintrag dafuer waere ein Waechter, der nichts kauft.
         */
        if (/^(?:drizzle-orm|node:|better-sqlite3|next\/headers)(?:\/|$)/.test(spezifizierer)) {
          verstoesse.push(`${datei}: Wertimport von ${spezifizierer}`);
          continue;
        }
        const ziel = aufloesen(datei, spezifizierer);
        if (ziel === null) continue;
        if (/[/\\]_db[/\\]/.test(ziel)) {
          verstoesse.push(`${datei}: Wertimport aus _db/ (${spezifizierer})`);
          continue;
        }
        if (!gesehen.has(ziel)) {
          gesehen.add(ziel);
          offen.push(ziel);
        }
      }
    }

    expect(
      WURZELN.filter((wurzel) => !gelesen.has(wurzel)),
      "der Walker hat eine Wurzel nicht gelesen — er ist nicht gelaufen",
    ).toEqual([]);
    expect(verstoesse).toEqual([]);
  });

  it("die Seite traegt force-dynamic und den Riegel der Verwaltungs-Stufe", () => {
    /*
     * ⛔ `Spec:4373`: die Ausleihenliste ist eine der Flaechen, die auch eine Updater-Person
     * sieht (Rechtetafel `Spec:4444-4454`: „Uebersicht, Geraeteliste, Geraetedetail,
     * Ereignisse, Ausleihen | ja | ja"), und der Bestand haelt sie ebenso offen
     * (`loans.ts:18` ohne `requireRole`).
     *
     * ⛔ UND DIESE ZEILE IST DER EINZIGE WAECHTER DAGEGEN. `riegel.test.ts` faengt eine
     * faelschlich ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell NICHT — die ODER-Klausel
     * dort laesst beide Namen zu (`riegel.test.ts:253-262`), und zwar absichtlich, sonst waere
     * der Scan gegen `Spec:4367` rot-by-construction. Der Zaehlfall „genau VIER
     * Verwaltungsseiten nennen requireRadioAdmin" in `admin/actions.test.ts` ist bis V21 eine
     * `it.todo` und faengt es bis dahin auch nicht.
     *
     * ⛔ `force-dynamic` IST PFLICHT (`Spec:4644-4645`, Vorbild
     * `lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`): ohne sie faellt eine Seite mit
     * Suchparametern in Nexts statischen Zweig und zeigte den Stand des Bauzeitpunkts.
     *
     * ⛔ Ueber `ohneKommentare`: der Kopfkommentar der Seite nennt beide Riegelnamen, um die
     * Stufenwahl zu begruenden.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle).toMatch(/await requireRadioVerwaltung\(\)/);
    expect(quelle, "auf die Admin-Stufe angehoben — jede Updater-Person bekaeme 404").not.toMatch(
      /\brequireRadioAdmin\s*\(/,
    );
    expect(quelle, "ohne force-dynamic zeigt die Liste den Stand des Bauzeitpunkts").toMatch(
      /export const dynamic = "force-dynamic"/,
    );
  });

  it("die Seite reicht KEINE Funktion und KEIN Date ueber die Grenze", () => {
    /*
     * Bauform-Zulaessigkeitstafel Nr. 6 und 7 (`Spec:4495-4497`, `Spec:4536-4539`): ueber die
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte. Die Umrechnung der zwei
     * Kalendertage in Zeitpunkte steht deshalb im Vertrag (`_lib/suchparameter.ts`) und nicht
     * hier.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[^}]*Action\b/);
    expect(quelle, "eine Pfeilfunktion als Prop").not.toMatch(/=\{[^}]*=>/);
    expect(quelle, "ein Date in der Seite").not.toMatch(/\bnew Date\(/);
  });

  it("die Seite erbt die Seitengroesse und schreibt sie nicht selbst hin", () => {
    /*
     * ⛔ DIE ZWANZIG STEHT IM LESEPFAD (`_lib/lesepfade/ausleihen.ts`,
     * `AUSLEIHEN_SEITENGROESSE`, 1:1 `LoanList.tsx:8`). Schriebe die Seite sie ein zweites Mal
     * hin, zeigte die Blaetterung eine andere Zahl an, als die Abfrage benutzt hat — und die
     * naechste Aenderung korrigierte nur eine der beiden.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "die Seite schreibt die Seitengroesse selbst hin").not.toMatch(/\b20\b/);
    expect(quelle, "die Seitengroesse erreicht die Insel nicht").toMatch(
      /seitenGroesse=\{seite\.seitenGroesse\}/,
    );
  });
});
