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
 * ⚠️ ZWEI BLINDE FLECKEN, BEIDE GEERBT UND BENANNT — DER ZWEITE IST SEIT DRK-423 ZU:
 *   1. **Falle 9.** In jsdom gibt es keine RSC-Grenze — eine `render`-Funktion ist hier ein
 *      gewoehnlicher Funktionswert. Zoege jemand `SPALTEN` nach `_lib/` und liesse die Server
 *      Component sie durchreichen, bliebe JEDER Fall dieser Datei gruen. Der Waechter dagegen
 *      ist der Playwright-Fall aus `Spec:4881-4882` (Fall 5) — Eigentuemer Aufgabe V23.
 *   2. **Die Breite.** Bis DRK-451 schaltete die Insel per `Grid.useBreakpoint()` um, und jsdom
 *      sah nur den MOBILEN Zweig. Seit die Umschaltung CSS ist (`Schmalkarten`), stehen BEIDE
 *      Darstellungen im Baum; die breite pruefen die Faelle „die breite Darstellung" am Ende
 *      dieser Datei am echten Tabellenkopf. `SPALTEN` und das Geruest bleiben daneben. Welche
 *      Darstellung SICHTBAR ist, sieht jsdom nie (keine Media Query) — das misst der e2e-Fall.
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
 * initialisiert (gemessen in `GeraeteTabelle.test.tsx` am `vi.hoisted`: `ReferenceError: Cannot access
 * ... before initialization`, und die ganze Datei faellt aus, nicht ein Fall).
 *
 * ⚠️ OHNE DIESEN ERSATZ STIRBT JEDER `mount()` AN `invariant expected app router to be
 * mounted` — gemessen beim ersten Lauf dieser Aufgabe: 4 von 15 Faellen rot, alle mit dieser
 * Meldung. Die Insel schreibt ihre Blaetterung und ihren Filter ueber `router.replace`.
 */
const { replaceMock, nachladenMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  nachladenMock: vi.fn(),
}));
// ⛔ Die Insel importiert die Nachschlag-Action DIREKT (DRK-335); ohne Ersatz zoege der Test
// die ganze `"use server"`-Datei samt Datenbank und Riegel in jsdom.
vi.mock("../../actions", () => ({ ausleihenNachladenAction: nachladenMock }));
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
    naechsterCursor: null,
    filter: { geraet: "", von: "", bis: "" },
    geraete: [{ id: "g-1", rufname: "41/12" }],
    ...teil,
  };
}

/**
 * Ein Geruest, das die ZELLEN der sieben Spalten rendert.
 *
 * ⚠️ HIER STAND „DER EINZIGE WEG AN DIE ZELLEN" — das galt, solange jsdom nur den mobilen
 * Zweig renderte. Seit DRK-451 steht die Tabelle mit im Baum (Kopf dieser Datei); das Geruest
 * bleibt, weil es jede Zelle ohne antds Tabellenmechanik und ohne Karte daneben misst.
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
  nachladenMock.mockReset();
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

describe("radio-Ausleihen: Nachladen und Filter", () => {
  it("der Stand nennt die GEFILTERTE Gesamtzahl, nicht die geladene Portion", async () => {
    /*
     * `gesamt` ist die GEFILTERTE Menge (`_db/leihen.ts`, dasselbe `where` wie die
     * Zeilenabfrage, ohne die Position) — rechnete der Stand mit den geladenen Zeilen, stuende
     * auf jeder ersten Portion „20 Ausleihen", auch bei 45.
     */
    await mount(
      <AusleihenTabelle
        {...props({ gesamt: 45, naechsterCursor: { ausgeliehen: 1_780_000_000, id: "l-1" } })}
      />,
    );

    expect(texte("radio-nachladen-stand")).toEqual([
      "1 von 45 Ausleihen geladen – weitere beim Scrollen",
    ]);
  });

  it("laedt beim Scrollen nach — mit dem Filter der Seite und ihrer Position (DRK-335)", async () => {
    /*
     * ⛔ DER NACHSCHLAG BEKOMMT DEN FILTER IN ADRESSZEILEN-FORM, damit die Action ihn mit
     * derselben Faltung liest wie die Seite. Die Logik des Hooks steht in
     * `_ui/Nachladen.test.tsx`; hier geht es um die Anbindung dieser Insel.
     */
    let melden: (() => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(rueckruf: IntersectionObserverCallback) {
          melden = () =>
            rueckruf(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe() {}
        disconnect() {}
      },
    );
    nachladenMock.mockResolvedValue({
      ok: true,
      zeilen: [zeile({ id: "l-2", entleiher: "Berta Nachgeladen" })],
      cursor: null,
      gesamt: 2,
    });
    await mount(
      <AusleihenTabelle
        {...props({
          gesamt: 2,
          naechsterCursor: { ausgeliehen: 1_780_000_000, id: "l-1" },
          filter: { geraet: "g-1", von: "2026-06-01", bis: "" },
        })}
      />,
    );
    await act(async () => melden?.());
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });

    expect(nachladenMock).toHaveBeenCalledWith({
      parameter: { geraet: "g-1", von: "2026-06-01", bis: "", seite: "" },
      cursor: { ausgeliehen: 1_780_000_000, id: "l-1" },
    });
    expect(texte("radio-leihe-mobil-entleiher")).toEqual(["Anna Beispiel", "Berta Nachgeladen"]);
    expect(texte("radio-nachladen-stand")).toEqual(["2 Ausleihen"]);
    vi.unstubAllGlobals();
  });

  it("eine Filteraenderung schreibt die Adresszeile und loescht eine alte Seitenzahl", async () => {
    /*
     * ⛔ DER GANZE URL-SCHREIBWEG DER INSEL WAR UNBEWACHT (Schlusspruefung V16, Fund 1):
     * `replaceMock` wurde angelegt und eingehaengt, aber in keinem Fall zugesichert. Zwei
     * Mutationen gleichzeitig — die Seite-1-Ruecksetzung entfernt UND `replace` zu `push`
     * gedreht — liessen das GANZE Modul gruen (62 Dateien, 882 Faelle). Bauform 1:1 aus
     * `GeraeteTabelle.test.tsx` („ein gesetzter Filter landet in der URL").
     *
     * ⛔ SEIT DRK-335 BLAETTERT DIE LISTE NICHT MEHR — die Adresszeile traegt deshalb eine
     * ALTE Seitenzahl, wie ein gespeicherter Link sie hat. Sie muss beim Schreiben
     * verschwinden; bliebe sie stehen, behauptete die Adresse eine Seite, die es nicht gibt.
     *
     * ⛔ `toHaveBeenCalledTimes(1)` AUF `replaceMock` IST DIE HAELFTE, DIE `push` FAENGT: der
     * Ersatz reicht fuer `push` ein frisch gebautes `vi.fn()` heraus, das niemand abgreift —
     * eine Insel, die `push` benutzte, liesse den Zaehler hier auf 0 fallen
     * (`AusleihenTabelle.tsx`: „`replace`, NICHT `push`").
     */
    window.history.replaceState({}, "", "/admin/ausleihen?seite=3");
    await mount(<AusleihenTabelle {...props({ gesamt: 100 })} />);
    await waehleGeraet("41/12");

    expect(replaceMock, "der Filter hat die URL nicht geschrieben").toHaveBeenCalledTimes(1);
    const { pfad, abfrage } = geschriebenesZiel();
    expect(pfad, "die Insel schreibt einen fremden Pfad").toBe("/admin/ausleihen");
    expect(abfrage.get("geraet"), "der gewaehlte Filter steht nicht in der Adresszeile").toBe("g-1");
    expect(abfrage.get("seite"), "die alte Seitenzahl steht noch in der Adresszeile").toBe(null);
  });

  it("der Zuruecksetzen-Knopf leert JEDEN Filterwert in der Adresszeile", async () => {
    /*
     * ⛔ DER MESSENDE LESER VON `LEERER_AUSLEIHEN_FILTER` (Schlusspruefung V16, Fund 2): die
     * Konstante war exportiert und wurde NIRGENDS gelesen, waehrend die Filterleiste das
     * Literal von Hand hinschrieb — „der leere Filter" stand an zwei Stellen, und keine
     * Messung hielt sie zusammen.
     *
     * ⛔ DREI GESETZTE WERTE UND EINE ALTE SEITENZAHL: ein Zuruecksetzen, das nur den
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
     * `ausleihenParameterAus` (`_lib/suchparameter.ts`, `roh.geraet` · `roh.von` · `roh.bis`;
     * `seite` liest er seit DRK-335 nicht mehr), und `page.tsx` baut daraus (`filter={…}`) die
     * Props dieses Falls. Die Adresszeile hier ist also die Lage, die der Server herstellt.
     */
    window.history.replaceState(
      {},
      "",
      "/admin/ausleihen?geraet=g-1&von=2026-06-01&bis=2026-06-30&seite=2",
    );
    await mount(
      <AusleihenTabelle
        {...props({
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
     * ⛔ ER WANDERT MIT (`LoanList.tsx:86-…`), IN DERSELBEN INSEL.
     *
     * ⚠️ SEIT DRK-451 IST ER NICHT MEHR DER EINZIGE GERENDERTE ZWEIG. Hier stand
     * „in jsdom ist er der gerenderte Zweig" — das galt, solange
     * `Grid.useBreakpoint()` umschaltete und in jsdom `md` falsch meldete. Die
     * Umschaltung ist jetzt CSS (`Schmalkarten`), also stehen BEIDE
     * Darstellungen im Baum, und jsdom wertet die Media Query nicht aus.
     *
     * Die `radio-leihe-mobil-*`-Marken gibt es nur auf der Karte, die sind
     * eindeutig. `radio-leihe-status` dagegen traegt die Statusmarke in BEIDEN
     * Zweigen — sie wird deshalb auf die Kartenliste eingerahmt. Ohne das
     * zaehlte der Fall, wie viele Darstellungen es gibt, statt was die Karte
     * traegt.
     */
    await mount(
      <AusleihenTabelle
        {...props({ zeilen: [zeile({ aktiv: false, zurueckText: "15.06.2026, 08:00", notiz: "Kratzer" })] })}
      />,
    );

    const KARTEN = '[data-rolle="schmalkarten"]';
    expect(texte("radio-leihe-mobil-name")).toEqual(["41/12"]);
    expect(
      queryAll(`${KARTEN} [data-rolle="radio-leihe-status"]`)
        .map((el) => (el.textContent ?? "").trim()),
    ).toEqual(["Zurückgegeben"]);
    expect(texte("radio-leihe-mobil-entleiher")).toEqual(["Anna Beispiel"]);
    expect(texte("radio-leihe-mobil-ausgeliehen")).toEqual(["Ausgeliehen: 14.06.2026, 09:12"]);
    expect(texte("radio-leihe-mobil-zurueck")).toEqual(["Zurückgegeben: 15.06.2026, 08:00"]);
    expect(texte("radio-leihe-mobil-notiz")).toEqual(["Kratzer"]);
  });

  it("die Flaeche traegt ihre Rolle in BEIDEN Zweigen", async () => {
    /*
     * ⛔ DER GRIFF DES PLAYWRIGHT-FALLS (V23, `Spec:4881-4882`) — und er darf nicht am
     * `<table>` haengen: die Insel hat zwei Zweige. (⚠️ Hier stand „⬜ V13-L2 laesst die Liste
     * dort heute leer" — seit V23 seedet der e2e-Lauf, `seed-lokal.ts radio` in `playwright.config.ts`.)
     * Ein Griff auf Tabellenmarkup meldete den mobilen Zweig als gebrochene Insel. Fall 4 sagt dasselbe.
     */
    await mount(<AusleihenTabelle {...props({ zeilen: [], gesamt: 0 })} />);
    expect(queryAll('[data-rolle="radio-ausleihen-flaeche"]').length).toBe(1);
  });
});

describe("radio-Ausleihen: die Bauform der Insel und ihrer Seite", () => {
  it("die Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 9 (Bauform-Zulaessigkeitstafel Nr. 1): die sieben Spalten fuehren sieben
     * `render`-Funktionen; dazu `karte` der schmalen Darstellung, das Nachladen, `Select` und
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
     * ⛔ REGIME B (`KOPF.md`, antd-Zuordnung): keine tabelleneigene Blaetterung, die
     * Blaetterung laeuft ueber die URL. ⚠️ HIER STAND, EIN BLAETTERWERK FIELE IN VITEST NICHT
     * AUF, weil jsdom nur den mobilen Zweig renderte und die Tabelle nie entstand. Seit DRK-451
     * steht die Tabelle mit im Baum, und der Block „die breite Darstellung" am Ende dieser
     * Datei misst `.ant-pagination` jetzt auch am DOM. ⛔ DER QUELLTEXT-SCAN BLEIBT trotzdem:
     * er nennt den WEG (`blaettern=`, `showSizeChanger`, `size`), die DOM-Probe die Wirkung —
     * beide zusammen sagen, was fehlt, wenn einer von beiden rot wird.
     *
     * ⛔ **UND GENAU DESHALB IST ER UMGESCHRIEBEN STATT GELOESCHT.** Seit der Umstellung auf
     * `@/core/tabelle` steht `pagination={false}` als VORGABE in
     * `src/core/tabelle/Datentabelle.tsx`; ein Scan auf das Literal `pagination={false}`
     * faerbte ueber korrektem Bestand rot. Der Weg, auf dem hier ein Blaetterwerk ENTSTEHEN
     * kann, ist ein `blaettern={…}` am Bauteil — das ist jetzt der Prueffling. Dazu die
     * Zusicherung, dass die Tabelle ueberhaupt die `Datentabelle` IST: nur so traegt sie die
     * Vorgabe, die dieser Fall behauptet.
     *
     * ⛔ UND KEIN `size` — Falle 4: die Verwaltung traegt `SCHREIBTISCHDICHTE`,
     * `controlHeight: 32` (`core/theme/theme.ts`). Platz schafft das waagerechte Scrollen, und
     * auch das kommt aus der `Datentabelle`.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(quelle, "die Tabelle ist nicht die Datentabelle der Suite").toMatch(/<Datentabelle</);
    expect(quelle, "die Tabelle blaettert selbst").not.toMatch(/blaettern=/);
    expect(quelle, "ein Groessenwechsler — der Bestand hat keinen (LoanList.tsx:66)").not.toMatch(
      /showSizeChanger/,
    );
    expect(quelle, "ein size-Attribut an einem antd-Bedienelement (Falle 4)").not.toMatch(
      /\bsize=\{?["']?(?:small|large)/,
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

  it("die Seite schreibt die Portionsgroesse nicht selbst hin und reicht die Position durch", () => {
    /*
     * ⛔ DIE ZWANZIG STEHT IM LESEPFAD (`_lib/lesepfade/ausleihen.ts`,
     * `AUSLEIHEN_SEITENGROESSE`, 1:1 `LoanList.tsx:8`) und in keiner zweiten Stelle — auch der
     * Nachschlag liest sie von dort (DRK-335). Ohne die Position bekaeme die Insel eine erste
     * Portion und koennte nie weiterladen.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "die Seite schreibt die Portionsgroesse selbst hin").not.toMatch(/\b20\b/);
    expect(quelle, "die Position erreicht die Insel nicht").toMatch(
      /naechsterCursor=\{seite\.naechsterCursor\}/,
    );
  });
});

/**
 * DIE BREITE DARSTELLUNG, AM GERENDERTEN MARKUP (DRK-423).
 *
 * Bis DRK-451 entschied `Grid.useBreakpoint()`, welche Darstellung entsteht, und jsdom
 * meldete dort immer „schmal": die Tabelle entstand in dieser Datei NIE, jede Zusage ueber sie
 * war rein an `SPALTEN` oder vakuum — und das fiel nicht auf, weil alles gruen war. Seit die
 * Umschaltung CSS ist, stehen beide Darstellungen im Baum, und diese Faelle messen die breite.
 *
 * ⛔ JEDER GRIFF IST AUF `[data-rolle="breitansicht"]` EINGERAHMT: `radio-leihe-status` steht
 * auch auf der Karte, ohne Rahmen zaehlte ein Fall die Darstellungen statt der Zeilen.
 *
 * ⚠️ WELCHE DER BEIDEN SICHTBAR IST, SAGT JSDOM NICHT — es wertet keine Media Query aus. Das
 * belegt der Playwright-Fall „DRK-423: /admin/ausleihen schaltet per CSS" in
 * `e2e/radio-verwaltung.spec.ts`, bei 1280 und bei 390.
 */
const BREIT = '[data-rolle="breitansicht"]';

describe("radio-Ausleihen: die breite Darstellung (DRK-423)", () => {
  it("die Tabelle steht neben der Kartenliste im Baum, mit den sieben Spaltenkoepfen", async () => {
    await mount(<AusleihenTabelle {...props()} />);

    expect(queryAll(`${BREIT} table`).length, "die breite Darstellung traegt keine Tabelle").toBe(1);
    expect(queryAll('[data-rolle="schmalkarten"]').length, "die Kartenliste fehlt").toBe(1);
    /*
     * ⛔ `toEqual` AUF DEN GERENDERTEN KOPF, NICHT AUF `SPALTEN`: der Fall oben haelt die Liste,
     * dieser haelt, dass die `Datentabelle` sie auch so ausgibt (Kicker, Reihenfolge).
     */
    expect(queryAll(`${BREIT} thead th`).map((th) => (th.textContent ?? "").trim())).toEqual([
      "Gerät",
      "Typ",
      "Ausleihende:r",
      "Ausgeliehen",
      "Zurückgegeben",
      "Status",
      "Notiz",
    ]);
  });

  it("jede Leihe ist eine Tabellenzeile, und ihre Zellen kommen aus den render-Funktionen", async () => {
    /*
     * ⛔ ZWEI VERSCHIEDENE ZEILEN: eine laufende mit Typ und eine zurueckgegebene mit leerem Typ.
     * Ein vertauschter Zweig in `StatusMarke` oder ein verlorener Rueckfall in `wert` dreht
     * oder leert hier je eine Zelle.
     */
    await mount(
      <AusleihenTabelle
        {...props({
          zeilen: [
            zeile(),
            zeile({ id: "l-2", geraetetyp: "", aktiv: false, zurueckText: "15.06.2026, 08:00" }),
          ],
          gesamt: 2,
        })}
      />,
    );

    const imBreiten = (rolle: string) =>
      queryAll(`${BREIT} [data-rolle="${rolle}"]`).map((el) => (el.textContent ?? "").trim());
    expect(queryAll(`${BREIT} tr[data-row-key]`).map((tr) => tr.getAttribute("data-row-key")))
      .toEqual(["l-1", "l-2"]);
    expect(imBreiten("radio-leihe-status")).toEqual(["Aktiv", "Zurückgegeben"]);
    expect(imBreiten("radio-leihe-typ")).toEqual(["Motorola MTP3550", "—"]);
    expect(imBreiten("radio-leihe-zurueck")).toEqual(["—", "15.06.2026, 08:00"]);
  });

  it("die Tabelle blaettert nicht selbst — jetzt auch am DOM gemessen", async () => {
    /*
     * ⛔ FUENFUNDZWANZIG ZEILEN, NICHT EINE: antds Vorgabe sind zehn je Seite. Blaetterte die
     * Tabelle, stuenden hier zehn Zeilen und eine `.ant-pagination` — bei einer Zeile saehe
     * man keinen Unterschied. Unter `VIRTUELL_AB_ZEILEN` (150), also ohne Virtualisierung.
     */
    const viele = Array.from({ length: 25 }, (_, i) => zeile({ id: `l-${i + 1}` }));
    await mount(<AusleihenTabelle {...props({ zeilen: viele, gesamt: 25 })} />);

    expect(queryAll(`${BREIT} tr[data-row-key]`).length, "die Tabelle zeigt nur eine Seite").toBe(25);
    expect(exists(`${BREIT} .ant-pagination`), "die Tabelle blaettert selbst").toBe(false);
  });

  it("die Umschaltung ist CSS: kein JavaScript-Breakpoint in der Insel", () => {
    /*
     * ⛔ DIE REGEL DER SUITE (`core/tabelle/Schmalkarten.tsx`): beide Darstellungen liegen im
     * HTML, die Media Query blendet eine aus. Ein JS-Breakpoint kennt beim ersten Rendern die
     * Fenstergroesse nicht und zeigt einen Wimpernschlag lang die falsche Variante — und in
     * jsdom liefe dann wieder nur ein Zweig, ohne dass dieser Block es merkte: seine Faelle
     * oben wuerden rot, aber mit einer Meldung ueber fehlende Zeilen statt ueber die Ursache.
     * Dieselbe Sperre wie `files/_ui/SharesTabelle.test.tsx`.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(quelle, "die Insel schaltet nicht ueber Schmalkarten um").toMatch(/<Schmalkarten</);
    expect(quelle, "ein JavaScript-Breakpoint in der Insel").not.toMatch(
      /useBreakpoint|matchMedia|innerWidth|clientWidth/,
    );
  });
});
