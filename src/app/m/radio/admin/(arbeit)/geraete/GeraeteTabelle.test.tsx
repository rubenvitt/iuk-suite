// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * INSEL 1 — DIE GERAETELISTE (`Spec:4490-4553`, §5.6.1; Aufgabe V13).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile
 * stirbt jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ WAS DIESE DATEI STRUKTURELL NICHT SEHEN KANN, und es steht hier, statt verschwiegen zu
 * werden: **Falle 9**. In jsdom gibt es keine RSC-Grenze — eine `render`-Funktion, die aus
 * einer Server Component ueber die Grenze ginge, ist hier ein gewoehnlicher Funktionswert.
 * Zoege jemand `COLUMN_DEFS` nach `_lib/` und liesse die Server Component sie durchreichen,
 * bliebe JEDER Fall dieser Datei gruen. Denselben blinden Fleck hat `pagination` an der
 * Tabelle. ⛔ Beides ist der Grund, warum der Playwright-Fall aus `Spec:4878`
 * PFLICHTBESTANDTEIL ist und nicht Nachbesserung — Eigentuemer ist Aufgabe V23.
 *
 * ⚠️ UND DER ZWEITE BLINDE FLECK IST DIE BREITE: `vitest.setup.ts` stubt `matchMedia` mit
 * `matches: false`, also liefert `Grid.useBreakpoint()` hier ausschliesslich falsche
 * Breakpoints — gerendert wird der MOBILE Zweig (`DeviceList.tsx:188-231`). Die Werkzeugleiste
 * steht in beiden Zweigen, die Spaltenlogik wird hier deshalb REIN geprueft
 * (`baueSpalten`), nicht am gerenderten Tabellenkopf. Der Kopf ist V23s Fall.
 */

const QUELLE_TABELLE = "src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx";
const QUELLE_SEITE = "src/app/m/radio/admin/(arbeit)/geraete/page.tsx";

/**
 * ⛔ `admin/actions.ts` WIRD ERSETZT, NICHT GELADEN. Die Datei traegt `"use server"` als
 * erste Zeile und zieht ueber `getDb`/`next/headers` den ganzen Serverbaum nach — in einer
 * jsdom-Umgebung ist das weder ladbar noch der Pruefgegenstand. Die Insel importiert sie
 * DIREKT (Bauform-Zulaessigkeitstafel Nr. 6: eine Server Action wird nie als Prop
 * durchgereicht), und genau dieser Import wird hier ersetzt.
 */
/*
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD. Ein gewoehnliches
 * `const anlegenMock = vi.fn()` darueber ist zur Ausfuehrungszeit der Fabrik noch nicht
 * initialisiert — gemessen: `ReferenceError: Cannot access 'anlegenMock' before
 * initialization`, und die ganze Datei faellt aus, nicht ein Fall.
 */
const { anlegenMock, replaceMock, pushMock } = vi.hoisted(() => ({
  anlegenMock: vi.fn(),
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
}));
vi.mock("../../actions", () => ({ geraetAnlegenAction: anlegenMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  usePathname: () => "/admin/geraete",
}));

import { click, clickPortal, exists, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { GERAETE_MODI } from "../../../_lib/csv/klassifizieren";
import { ohneKommentare } from "../../../_lib/quelltextScan";
import {
  SORTIER_SCHLUESSEL,
  SUCHFELDER,
  SUCHFELDER_VORGABE,
  type GeraetZeile,
} from "../../../_lib/lesepfade/geraete";
import { LEERE_FILTER, STATUS_OPTIONEN, type GeraetFilterWerte } from "../../../_lib/suchparameter";
import { aktiveFilterZahl } from "./FilterSchublade";
import { SUCHFELD_ETIKETTEN } from "./GeraeteWerkzeugleiste";
import {
  COLUMN_DEFS,
  GeraeteTabelle,
  SPALTEN_SPEICHER,
  VORGABE_SPALTEN,
  baueSpalten,
  gespeicherteSpalten,
  type GeraeteTabelleProps,
} from "./GeraeteTabelle";

function zeile(teil: Partial<GeraetZeile> = {}): GeraetZeile {
  return {
    id: "g-1",
    issi: "1000001",
    tei: null,
    rufname: "Florian 1",
    opta: null,
    funktion: null,
    geraeteTyp: null,
    status: "Einsatzbereit",
    lagerort: null,
    hersteller: null,
    bedieneinheit: null,
    geraeteFunktionen: null,
    zuordnung: null,
    seriennummer: null,
    ausleihbar: true,
    alamos: false,
    softwareVersion: null,
    updateStand: "unbekannt",
    hatAbweichung: false,
    letztesUpdateText: "—",
    ...teil,
  };
}

function eigenschaften(teil: Partial<GeraeteTabelleProps> = {}): GeraeteTabelleProps {
  return {
    zeilen: [zeile()],
    gesamt: 1,
    seite: 1,
    seitenGroesse: 20,
    sortierung: null,
    filter: LEERE_FILTER,
    suchtext: "",
    suchfelder: [...SUCHFELDER_VORGABE],
    vorschlaege: {
      rufname: [],
      geraeteTyp: [],
      lagerort: [],
      zuordnung: [],
      opta: [],
      funktion: [],
      hersteller: [],
      bedieneinheit: [],
    },
    darfAnlegen: true,
    darfExportieren: true,
    ...teil,
  };
}

beforeEach(() => {
  replaceMock.mockReset();
  pushMock.mockReset();
  anlegenMock.mockReset();
  window.localStorage.clear();
});

afterEach(async () => {
  await unmount();
});

describe("radio-Geraeteliste: die Spaltenlogik", () => {
  it("acht Spalten sind vorgewaehlt", () => {
    /*
     * 1:1 aus `deviceColumns.tsx:37-39` (`DEFAULT_VISIBLE_COLUMNS`). ⛔ `toBe(8)` steht
     * AUSSERHALB der Schleife: eine Zusicherung nur INNERHALB waere ueber einer
     * geschrumpften Liste still gruen — dieselbe Fehlerform wie NT11.
     */
    expect(VORGABE_SPALTEN.length, "acht Vorgabespalten (deviceColumns.tsx:37-39)").toBe(8);
    const bekannt = new Set(COLUMN_DEFS.map((d) => d.schluessel));
    for (const schluessel of VORGABE_SPALTEN) {
      expect(bekannt.has(schluessel), `${schluessel} steht in keiner Spaltendefinition`).toBe(true);
    }
    expect(VORGABE_SPALTEN).toEqual([
      "rufname",
      "issi",
      "funktion",
      "geraeteTyp",
      "updateStand",
      "status",
      "lagerort",
      "hatAbweichung",
    ]);
  });

  it("achtzehn Spalten stehen zur Wahl", () => {
    /*
     * 1:1 aus `deviceColumns.tsx:16-35` — ACHTZEHN Definitionen. ⛔ `toBe(18)`, nicht
     * „mindestens": eine verlorene Spalte faellt sonst nirgends auf, weil die Auswahl sie
     * einfach nicht mehr anbietet.
     */
    expect(COLUMN_DEFS.length).toBe(18);
    const schluessel = COLUMN_DEFS.map((d) => d.schluessel);
    expect(new Set(schluessel).size, "ein Spaltenschluessel steht doppelt").toBe(18);
    for (const def of COLUMN_DEFS) {
      expect(def.etikett.length, `${def.schluessel} hat kein Etikett`).toBeGreaterThan(0);
    }
  });

  it("ein unbekannter gespeicherter Spaltenschluessel wird ignoriert", () => {
    /*
     * 1:1 aus `deviceColumns.tsx:41-46`: „Build the antd columns array from the persisted
     * visible-key list, preserving COLUMN_DEFS order. Unknown stored keys are ignored."
     * ⛔ BEIDE HAELFTEN: unbekannt faellt weg UND die Reihenfolge ist die der Definitionen,
     * nicht die der gespeicherten Liste.
     */
    const gebaut = baueSpalten(["gibtsNicht", "issi", "rufname"]);
    expect(gebaut.length, "der unbekannte Schluessel hat eine Spalte erzeugt").toBe(2);
    expect(gebaut.map((s) => s.key)).toEqual(["rufname", "issi"]);
  });

  it("eine unbrauchbare Speicherung faellt auf die Vorgabe zurueck", () => {
    /*
     * `usePersistentState` bleibt fuer die SPALTEN (`DeviceList.tsx:49-51`) — reine
     * Darstellung. ⚠️ Der Speicherschluessel ist ein SUITE-EIGENER: die zwei Anwendungen
     * teilen sich nach dem Schwenk denselben Origin, und ein Fremdname im `localStorage`
     * der Suite waere genau die Kollision, die niemand sucht.
     */
    expect(SPALTEN_SPEICHER.startsWith("iuk-radio-"), "ein Fremdname im localStorage").toBe(true);
    expect(gespeicherteSpalten(null)).toEqual(VORGABE_SPALTEN);
    expect(gespeicherteSpalten("kein json")).toEqual(VORGABE_SPALTEN);
    expect(gespeicherteSpalten('{"a":1}')).toEqual(VORGABE_SPALTEN);
    expect(gespeicherteSpalten('["issi"]')).toEqual(["issi"]);
  });

  it("die Erstspalte faellt auf OPTA, dann Rufname, dann einen Gedankenstrich zurueck", () => {
    /*
     * 1:1 aus `deviceColumns.tsx:17`: `render: (_, d) => d.opta || d.rufname || '—'`.
     * ⛔ ALLE DREI LAGEN, und mit `||` und nicht `??`: beide Spalten sind Freitext
     * (`_db/schema.ts:20`, `:40`), eine LEERE Zeichenkette faellt also weiter.
     */
    const erste = COLUMN_DEFS[0]!;
    expect(erste.schluessel).toBe("rufname");
    const zeichne = erste.spalte.render!;
    const wert = (g: GeraetZeile) => zeichne(undefined, g, 0);
    expect(wert(zeile({ opta: "DRK 1", rufname: "Florian 1" }))).toBe("DRK 1");
    expect(wert(zeile({ opta: "", rufname: "Florian 1" }))).toBe("Florian 1");
    expect(wert(zeile({ opta: null, rufname: null }))).toBe("—");
  });

  it("die sechs sortierbaren Spalten stehen alle in der Sortierliste des Servers", () => {
    /*
     * ⛔ DIE FALLE, DIE `_lib/lesepfade/geraete.ts:266-272` NAMENTLICH BESCHREIBT: schriebe
     * die Flaeche `location` und der Lesepfad `lagerort`, blieben typecheck, lint, build und
     * jeder Test gruen — und die Sortierung taete einfach nichts. Sortierbar sind SECHS
     * (`deviceColumns.tsx:12-15`, gemessen an `sorter: true`): `rufname`, `issi`,
     * `updateStatus`, `status`, `location`, `softwareVersion`.
     */
    const sortierbar = COLUMN_DEFS.filter((d) => d.spalte.sorter).map((d) => d.schluessel);
    expect(sortierbar.length, "sechs sortierbare Spalten (deviceColumns.tsx)").toBe(6);
    expect(sortierbar.sort()).toEqual(
      ["issi", "lagerort", "rufname", "softwareVersion", "status", "updateStand"],
    );
    for (const schluessel of sortierbar) {
      expect(
        SORTIER_SCHLUESSEL.includes(schluessel),
        `${schluessel} kennt der Lesepfad nicht — die Sortierung taete nichts`,
      ).toBe(true);
    }
  });
});

describe("radio-Geraeteliste: Suchfelder, Filterzaehler und Wertelisten", () => {
  it("die zwoelf waehlbaren Suchfelder tragen je ein Etikett", () => {
    /*
     * `SearchFieldPicker.tsx:5-18` fuehrt zwoelf Felder mit Etikett; die SCHLUESSEL kommen
     * in der Suite aus `SUCHFELDER` (`_lib/lesepfade/geraete.ts:224`) und werden hier NICHT
     * zweitgeschrieben. ⛔ Der Fall prueft die Deckung in BEIDE Richtungen: ein Etikett ohne
     * Feld waere ein Haken, der nichts tut, ein Feld ohne Etikett ein leerer Eintrag.
     */
    expect(SUCHFELDER.length).toBe(12);
    expect(SUCHFELDER_VORGABE.length, "sieben Vorgabefelder (deviceRepo.ts:140)").toBe(7);
    expect(Object.keys(SUCHFELD_ETIKETTEN).sort()).toEqual([...SUCHFELDER].sort());
  });

  it("der Filterzaehler stimmt", () => {
    /*
     * ⛔ 1:1 AUS `countActiveFilters` (`DeviceFilterDrawer.tsx:14-24`): `updateStatus` zaehlt
     * EINZELN, die SECHS Listen je als EINS (nicht je Eintrag), und die DREI Schalter je als
     * EINS. Ein Zaehler, der Listeneintraege zaehlte, zeigte bei zwei gewaehlten Standorten
     * eine Zwei — und niemand saehe, dass es ein Filter ist.
     */
    expect(aktiveFilterZahl(LEERE_FILTER)).toBe(0);

    const mit = (teil: Partial<GeraetFilterWerte>) =>
      aktiveFilterZahl({ ...LEERE_FILTER, ...teil });
    expect(mit({ updateStand: "veraltet" })).toBe(1);
    expect(mit({ status: ["Defekt", "Wartung"] }), "zwei Eintraege sind EIN Filter").toBe(1);
    expect(mit({ status: [] }), "die leere Liste zaehlt nicht").toBe(0);
    expect(mit({ ausleihbar: true })).toBe(1);
    expect(mit({ ausleihbar: false }), "der ausgeschaltete Schalter zaehlt nicht").toBe(0);
    expect(
      aktiveFilterZahl({
        updateStand: "veraltet",
        status: ["Defekt"],
        lagerort: ["Lager"],
        geraeteTyp: ["HRT"],
        funktion: ["Fuehrung"],
        hersteller: ["Sepura"],
        geraeteFunktionen: ["TMO"],
        ausleihbar: true,
        alamos: true,
        hatAbweichung: true,
      }),
      "alle zehn Filter gesetzt",
    ).toBe(10);
  });

  it("die fuenf Statusoptionen und die vier Geraetefunktionen stehen in der Reihenfolge des Bestands", () => {
    /*
     * 1:1 aus `radio-admin/shared/src/constants.ts:4` und `:10-16`. ⛔ REIHENFOLGEERHALTEND,
     * nicht sortiert — `GERAETE_MODI` ist zugleich die kanonische AUSGABEreihenfolge der
     * Zelle (`_lib/csv/klassifizieren.ts:17-33`), und `STATUS_OPTIONEN` die Reihenfolge des
     * Auswahlfeldes.
     *
     * ⚠️ DIE ZWEI LISTEN LIEGEN IN ZWEI DATEIEN, und der Grund ist gemessen, nicht
     * geschmacklich: er steht bei `STATUS_OPTIONEN` in `_lib/suchparameter.ts`
     * ausgeschrieben. Dieser Fall haelt beide zusammen, damit die Trennung nicht zur Drift
     * wird.
     */
    expect([...STATUS_OPTIONEN]).toEqual([
      "Einsatzbereit",
      "Defekt",
      "Ausgeliehen",
      "Wartung",
      "Sonstiges",
    ]);
    expect([...GERAETE_MODI]).toEqual(["TMO", "DMO", "REP", "GAT"]);
  });
});

describe("radio-Geraeteliste: die Insel im DOM", () => {
  it("die Spaltenauswahl schaltet eine Spalte an und aus", async () => {
    /*
     * Der Fall, den §5.13 namentlich nennt (`Spec:4864`). ⛔ Gemessen wird der WEG, nicht
     * ein Zustandsobjekt: Haken weg ⇒ die Spalte verschwindet aus der gespeicherten Auswahl,
     * Haken wieder hin ⇒ sie ist zurueck, UND die Reihenfolge der Definitionen bleibt
     * (`deviceColumns.tsx:41-46`) — ein naiver `push` haengte sie hinten an.
     */
    await mount(<GeraeteTabelle {...eigenschaften()} />);
    await click('[data-rolle="radio-spaltenwahl"]');

    const haken = () =>
      queryPortal('[data-rolle="radio-spaltenliste"]').querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
    expect(haken().length, "die Auswahl bietet nicht alle Spalten an").toBe(18);
    expect([...haken()].filter((h) => h.checked).length, "acht sind vorgewaehlt").toBe(8);

    await clickPortal('[data-schluessel="issi"] input[type="checkbox"]');
    expect(gespeicherteSpalten(window.localStorage.getItem(SPALTEN_SPEICHER))).toEqual([
      "rufname",
      "funktion",
      "geraeteTyp",
      "updateStand",
      "status",
      "lagerort",
      "hatAbweichung",
    ]);

    await clickPortal('[data-schluessel="issi"] input[type="checkbox"]');
    expect(
      gespeicherteSpalten(window.localStorage.getItem(SPALTEN_SPEICHER)),
      "die Spalte kam an falscher Stelle zurueck",
    ).toEqual([...VORGABE_SPALTEN]);
  });

  it("ein gesetzter Filter landet in der URL", async () => {
    /*
     * Regime B: die Filter laufen ueber die URL, nicht ueber antds Tabellenzustand
     * (Hausmuster, Vorbild `lagerbuch/.../journal/`). ⛔ Der Fall faehrt den GANZEN Weg —
     * Schublade auf, Schalter an, „Anwenden" — und liest ab, was der Router bekommt.
     * Denselben Fall fuehrt Playwright ein zweites Mal (`Spec:4878`, Fall 2), weil erst der
     * echte Abruf zeigt, dass die Adresszeile auch wirklich neu liest.
     */
    await mount(<GeraeteTabelle {...eigenschaften()} />);
    await click('[data-rolle="radio-filterknopf"]');
    await clickPortal('[data-rolle="radio-filter-ausleihbar"] button');
    await clickPortal('[data-rolle="radio-filter-anwenden"]');

    expect(replaceMock, "der Filter hat die URL nicht geschrieben").toHaveBeenCalledTimes(1);
    const ziel = String(replaceMock.mock.calls[0]![0]);
    expect(ziel.startsWith("/admin/geraete?"), "die AEUSSERE Pfadform fehlt").toBe(true);
    expect(new URLSearchParams(ziel.split("?")[1]).get("ausleihbar")).toBe("1");
  });

  it("der Anlegen-Knopf fehlt, wenn darfAnlegen falsch ist", async () => {
    /*
     * 1:1 aus `DeviceList.tsx:150` (`{isAdmin && (…)}`). ⛔ UND ES IST EINE
     * ANZEIGE-ENTSCHEIDUNG, KEINE SPERRE: die Sperre ist `requireRadioAdmin()` als erste
     * Anweisung von `geraetAnlegenAction` (`admin/actions.ts:426`). Wer diesen Fall fuer den
     * Riegel haelt, hat die Luecke gebaut, gegen die der Riegel steht.
     */
    await mount(<GeraeteTabelle {...eigenschaften({ darfAnlegen: false, darfExportieren: false })} />);
    expect(exists('[data-rolle="radio-geraet-anlegen"]')).toBe(false);
    expect(exists('[data-rolle="radio-geraete-export"]')).toBe(false);
    await unmount();

    await mount(<GeraeteTabelle {...eigenschaften()} />);
    expect(exists('[data-rolle="radio-geraet-anlegen"]')).toBe(true);
    expect(exists('[data-rolle="radio-geraete-export"]')).toBe(true);
  });

  it("jede Zeile fuehrt auf die AEUSSERE Detailadresse", async () => {
    /*
     * ⛔ DIE AEUSSERE FORM `/admin/geraete/<id>`, nicht die innere `/m/radio/...`. Der
     * Grund steht gemessen in `_lib/nav.test.ts:135-150`: ein `href="/m/radio/..."` fuehrte
     * auf dem Verwaltungshost auf `/m/radio/m/radio/...` — 404, und typecheck wie lint
     * bleiben gruen. Dieselbe Zusage traegt `admin/(arbeit)/page.tsx` fuer die Uebersicht.
     */
    /*
     * ⛔ UEBER `ohneKommentare` (`_lib/quelltextScan.ts`), NICHT UEBER DEN ROHTEXT: der
     * Kopfkommentar dieser Insel NENNT die innere Form, um zu erklaeren, warum sie falsch
     * ist. Ein Scan ueber den rohen Text waere genau an dieser Begruendung rot, und die
     * naheliegende „Reparatur" waere, sie zu loeschen — dieselbe Falle, die
     * `riegel.test.ts:183-191` beschreibt.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(quelle, "eine innere Pfadform in der Insel").not.toMatch(/["'`]\/m\/radio\//);
    expect(quelle).toMatch(/\/admin\/geraete\/\$\{/);
  });
});

describe("radio-Geraeteliste: die Bauform der Insel", () => {
  it("die fuenf Dateien der Insel tragen use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 1 UND FALLE 9 ZUGLEICH (Bauform-Zulaessigkeitstafel Nr. 1, 3 und 5): die
     * Insel fuehrt `render`-Funktionen, `Grid.useBreakpoint()`, `Input.Search` und
     * `Space.Compact`. Fehlte die Direktive an EINER der fuenf, waere es HTTP 500 beim
     * ersten Abruf — und typecheck, lint und build saehen nichts.
     */
    for (const datei of [
      "GeraeteTabelle.tsx",
      "GeraeteWerkzeugleiste.tsx",
      "SpaltenWahl.tsx",
      "FilterSchublade.tsx",
      "NeuGeraetModal.tsx",
    ]) {
      const quelle = readFileSync(`src/app/m/radio/admin/(arbeit)/geraete/${datei}`, "utf8");
      expect(quelle.trimStart().split("\n")[0]!.trim(), `${datei}: keine Direktive`).toMatch(
        /^["']use client["'];?$/,
      );
    }
  });

  it("die Seite traegt force-dynamic und den Riegel der Verwaltungs-Stufe", () => {
    /*
     * `export const dynamic = "force-dynamic"` (`Spec:4644-4645`, Vorbild
     * `lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`) — ohne sie liesse Next die Seite
     * mit ihren Suchparametern in den Vollstatik-Zweig fallen, und die Filter zeigten den
     * Stand des Bauzeitpunkts.
     *
     * ⛔ UND DER RIEGEL IST DIE VERWALTUNGS-STUFE (`Spec:4370`), nicht die Admin-Stufe: die
     * Geraeteliste ist eine der sieben Flaechen, die auch eine Updater-Person sieht
     * (`Spec:4444-4454`). `riegel.test.ts` faengt eine faelschlich ANGEHOBENE Seite im
     * `(arbeit)`-Zweig strukturell nicht — die ODER-Klausel dort laesst beide Namen zu.
     */
    /* ⛔ Ueber `ohneKommentare`, aus demselben Grund wie oben: der Kopfkommentar der Seite
       nennt beide Riegelnamen, um die Stufenwahl zu begruenden. */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle).toMatch(/export const dynamic = "force-dynamic";/);
    expect(quelle).toMatch(/await requireRadioVerwaltung\(\)/);
    expect(quelle, "auf die Admin-Stufe angehoben — jede Updater-Person bekaeme 404")
      .not.toMatch(/\brequireRadioAdmin\s*\(/);
  });

  it("die Seite reicht KEINE Funktion und KEIN Date ueber die Grenze", () => {
    /*
     * Bauform-Zulaessigkeitstafel Nr. 6 und 7 (`Spec:4495-4497`, `Spec:4536-4539`): ueber die
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte. Eine Server Action wird
     * DIREKT importiert (`NeuGeraetModal.tsx`), nie durchgereicht.
     * ⚠️ Der Scan ist die Untergrenze, nicht der Beweis — den fuehrt der echte Abruf (V23).
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[a-zA-Z]*Action\}/);
    expect(quelle, "ein Date ueber die Grenze").not.toMatch(/=\{new Date\(/);
  });
});
