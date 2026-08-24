// @vitest-environment jsdom
// src/app/m/radio/_ui/GeraeteListe.test.tsx
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE INSEL DER GERAETEUEBERSICHT — Suche, Statusfilter, Standortgruppen, Zeilen
 * (Spec 1 §4.5, `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3596-3637`).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile
 * stirbt jeder `mount()` an `document is not defined`. Der Bestand opt-in't je Datei
 * (`src/app/m/portal/_ui/DiensteRaster.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ KEIN `localStorage` IN DIESER DATEI, und das ist keine Auslassung: Node 26 bringt ein
 * eigenes mit, das jsdoms verdeckt (`vitest.config.ts:54-87`). Die Insel haelt ihren
 * Zustand in `useState` — der Suchtext ist fluechtig und steht ausdruecklich auch nicht in
 * der URL (`_lib/filter.ts:22-24`, Spec:3633-3635).
 */

import { mount, unmount, query, queryAll, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { normalisiereSuchtext, STATUS_FILTER, STATUS_FILTER_ETIKETT } from "../_lib/filter";
import type { GeraeteStatus } from "../_lib/status";
import { GeraeteListe, type ListenGeraet } from "./GeraeteListe";

const QUELLE_LISTE = "src/app/m/radio/_ui/GeraeteListe.tsx";
const QUELLE_ZEILE = "src/app/m/radio/_ui/GeraeteZeile.tsx";
const QUELLE_SEITE = "src/app/m/radio/(ausleihe)/geraete/page.tsx";

/**
 * Kopie von `ohneKommentare()` aus `src/app/m/radio/riegel.test.ts:181-201` — dieselbe
 * Bauform und derselbe Grund wie in `_ui/AusleihRahmen.test.tsx:82-89`: die drei
 * gescannten Dateien schreiben ihre Begruendung („die Seriennummer wandert nicht in den
 * Client") in ihren Kopfkommentar, und das sind genau die Saetze, die der Scan konserviert
 * haben will. Ein Scan ueber den rohen Text waere auf ihnen rot, und die naheliegende
 * „Reparatur" waere, sie zu loeschen. `riegel.test.ts` exportiert die Funktion nicht.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Eine Zeile, wie der Lesepfad sie liefert (`_db/leihen.ts:93-102`).
 *
 * ⚠️ DER `suchschluessel` WIRD HIER GEBAUT, UND DAS IST DIE GRENZE DIESES HELFERS: er ist
 * eine Prop der Insel, also muss der Test ihn setzen. Die Zusicherung, dass der ECHTE
 * Lesepfad ihn richtig baut, traegt `_db/leihen.test.ts` („traegt die Seriennummer im
 * Suchschluessel und in keinem Feld der Zeile"); die Zusicherung, dass die Seite ihn
 * unveraendert ueber die RSC-Grenze reicht, traegt `(ausleihe)/geraete/page.test.tsx`.
 * ⛔ Deshalb ruht der Seriennummer-Fall unten NICHT auf diesem Helfer, sondern auf einem
 * Scan ueber die drei ausgelieferten Dateien (REVIEW-A13 Fund K3: die A13-Haelfte las
 * `Object.entries()` ihrer EIGENEN Hilfsfunktion und war gegen jede Mutation immun).
 */
function zeile(werte: {
  id: string;
  rufname?: string;
  geraetetyp?: string | null;
  seriennummer?: string | null;
  standort?: string | null;
  status?: GeraeteStatus;
  entleiher?: string;
  seit?: string;
}): ListenGeraet {
  const rufname = werte.rufname ?? `Ruf ${werte.id}`;
  const geraetetyp = werte.geraetetyp === undefined ? "Motorola MTP3550" : werte.geraetetyp;
  const standort = werte.standort === undefined ? "Fahrzeughalle" : werte.standort;
  const basis: ListenGeraet = {
    id: werte.id,
    rufname,
    geraetetyp,
    standort,
    status: werte.status ?? "AVAILABLE",
    suchschluessel: normalisiereSuchtext(
      [rufname, geraetetyp, werte.seriennummer ?? null, standort].filter(Boolean).join(" "),
    ),
  };
  if (werte.entleiher === undefined) return basis;
  return { ...basis, entleiher: werte.entleiher, seit: werte.seit };
}

/** 23 Geraete, davon 7 mit „Kater" im Rufnamen — die Zahlen der Trefferzeile aus Spec:3613. */
function dreiundzwanzig(): ListenGeraet[] {
  const liste: ListenGeraet[] = [];
  for (let i = 1; i <= 7; i++) liste.push(zeile({ id: `k-${i}`, rufname: `Kater ${i}` }));
  for (let i = 1; i <= 16; i++) liste.push(zeile({ id: `f-${i}`, rufname: `Florian ${i}` }));
  return liste;
}

afterEach(async () => {
  await unmount();
});

function rufnamen(): string[] {
  return queryAll('[data-rolle="radio-geraetezeile"]').map(
    (el) => el.querySelector('[data-rolle="radio-zeile-rufname"]')?.textContent ?? "",
  );
}

describe("die Geraeteliste — Trefferzeile, Gruppen, Zeilen", () => {
  it("zeigt 7 von 23 Geraeten in der Trefferzeile", async () => {
    /*
     * Spec:3613 und `DeviceFilterBar.tsx:88-90`, woertlich: bei Gleichstand „23 Geräte",
     * sonst „7 von 23 Geräten". ⛔ BEIDE HAELFTEN IN EINEM FALL: eine Zeile, die IMMER
     * „7 von 23" schriebe, bestuende die eine; eine, die immer die Gesamtzahl schriebe, die
     * andere.
     *
     * ⛔ `role="status" aria-live="polite"` (`DeviceFilterBar.tsx:88`) — und hier ist es
     * ausdruecklich NICHT `role="alert"` wie am Gate (`_ui/GateFormular.tsx:124-146`,
     * REVIEW-A11 Fund W3): die Region steht von Anfang an im Baum und aendert nur ihren
     * Text, waehrend der Gate-Fehler erst NACH einem Antippen ueberhaupt entsteht. Eine
     * `assertive`-Region, die bei jedem Tastendruck dazwischenredet, waere hier der Fehler.
     */
    await mount(<GeraeteListe geraete={dreiundzwanzig()} />);

    const zeileEl = query('[data-rolle="radio-trefferzeile"]');
    expect(zeileEl.getAttribute("role")).toBe("status");
    expect(zeileEl.getAttribute("aria-live")).toBe("polite");
    expect(zeileEl.textContent).toBe("23 Geräte");

    await fill('[data-rolle="radio-suche"]', "Kater");
    expect(query('[data-rolle="radio-trefferzeile"]').textContent).toBe("7 von 23 Geräten");
    expect(queryAll('[data-rolle="radio-geraetezeile"]')).toHaveLength(7);
  });

  it("rendert eine einzelne Gruppe flach ohne Kopfzeile", async () => {
    /*
     * `DeviceGroupedList.tsx:34-36`, woertlich: „Nur eine Gruppe → flach ohne Header
     * rendern." Ein Kopf „Fahrzeughalle" ueber allem, was es gibt, ist eine Zeile, die der
     * Mensch lesen muss, ohne dass sie etwas sagt.
     *
     * ⛔ DIE GEGENPROBE GEHOERT IN DENSELBEN FALL: ohne sie bliebe er gruen, wenn die Insel
     * NIE einen Gruppenkopf rendert.
     */
    await mount(
      <GeraeteListe geraete={[zeile({ id: "g-1" }), zeile({ id: "g-2" })]} />,
    );
    expect(exists('[data-rolle="radio-gruppenkopf"]')).toBe(false);
    expect(queryAll('[data-rolle="radio-geraetezeile"]')).toHaveLength(2);
    await unmount();

    await mount(
      <GeraeteListe
        geraete={[zeile({ id: "g-1" }), zeile({ id: "g-2", standort: "Wache" })]}
      />,
    );
    const koepfe = queryAll('[data-rolle="radio-gruppenkopf"]');
    expect(koepfe).toHaveLength(2);
    // Benannte Standorte alphabetisch nach de-Kollation (`_lib/filter.ts:221-228`).
    expect(koepfe.map((k) => k.getAttribute("data-gruppe"))).toEqual(["Fahrzeughalle", "Wache"]);
  });

  it("haelt bei aktivem Suchtext alle Gruppen offen und die Koepfe unklickbar", async () => {
    /*
     * `DeviceGroupedList.tsx:31` (`const forceOpen = query.trim().length > 0`) und
     * `DeviceGroup.tsx:22` (`disabled={forceOpen}`). Der Grund ist fachlich: wer sucht,
     * will das Ergebnis sehen und nicht erst drei Gruppen aufklappen — und ein Kopf, der
     * sich zuklappen liesse, verstecke Treffer, nach denen die Person gerade gesucht hat.
     *
     * ⛔ DIE GEGENPROBE IST DIE TRAGENDE HAELFTE: ohne Suchtext MUSS der Kopf klickbar sein
     * und die Gruppe zuklappen. Eine Insel, die ihre Gruppen nie zuklappt, bestuende die
     * erste Haelfte allein.
     */
    const geraete = [
      zeile({ id: "g-1", rufname: "Kater 1" }),
      zeile({ id: "g-2", rufname: "Kater 2", standort: "Wache" }),
    ];

    await mount(<GeraeteListe geraete={geraete} />);

    const ersterKopf = () => queryAll('[data-rolle="radio-gruppenkopf"]')[0]!;
    expect(ersterKopf().hasAttribute("disabled")).toBe(false);
    await click('[data-rolle="radio-gruppenkopf"]');
    expect(ersterKopf().getAttribute("aria-expanded")).toBe("false");
    expect(queryAll('[data-rolle="radio-geraetezeile"]')).toHaveLength(1);

    await fill('[data-rolle="radio-suche"]', "Kater");

    for (const kopf of queryAll('[data-rolle="radio-gruppenkopf"]')) {
      expect(kopf.hasAttribute("disabled"), "der Kopf bleibt bei aktivem Suchtext klickbar").toBe(
        true,
      );
      expect(kopf.getAttribute("aria-expanded")).toBe("true");
    }
    expect(queryAll('[data-rolle="radio-geraetezeile"]')).toHaveLength(2);
  });

  it("macht ein vergebenes Geraet nicht antippbar", async () => {
    /*
     * `DeviceRow.tsx:47` (`aria-disabled={!selectable}`) und `:49-50` (`tabIndex` und
     * `onClick` nur, wenn antippbar). ⛔ DER FEHLENDE LINK IST DIE ZUSAGE, nicht die
     * Deckkraft: ein `<a href>` mit 60 % Deckkraft waere weiterhin antippbar, und der
     * Unterschied faellt auf einer Datenflaeche niemandem auf, bis jemand ein vergebenes
     * Geraet ein zweites Mal bucht.
     *
     * ⛔ DIE ZWEITE HAELFTE — das freie Geraet IST ein Anker mit dem richtigen Ziel
     * (Spec:3427, `_lib/auswahl.ts:55-61`) — steht im selben Fall: eine Insel, die GAR
     * KEINE Links baut, bestuende die erste Haelfte.
     */
    await mount(
      <GeraeteListe
        geraete={[
          zeile({ id: "g-1", rufname: "Kater 1" }),
          zeile({
            id: "g-2",
            rufname: "Kater 2",
            status: "ON_LOAN",
            entleiher: "Anna Beispiel",
            seit: "09:12",
          }),
        ]}
      />,
    );

    const zeilen = queryAll('[data-rolle="radio-geraetezeile"]');
    const frei = zeilen.find((z) => z.getAttribute("data-frei") === "ja")!;
    const vergeben = zeilen.find((z) => z.getAttribute("data-frei") === "nein")!;

    expect(frei.tagName).toBe("A");
    expect(frei.getAttribute("href")).toBe("/ausleihen?geraete=g-1");
    expect(frei.getAttribute("aria-disabled")).toBe(null);

    expect(vergeben.tagName).not.toBe("A");
    expect(vergeben.hasAttribute("href")).toBe(false);
    expect(vergeben.getAttribute("aria-disabled")).toBe("true");
    // Die Nebenzeile traegt Entleiher und Uhrzeit (`DeviceRow.tsx:20-26`), „Uhr" am
    // Aufrufort und nicht in `uhrzeit()` (`_lib/anzeige.ts:55-58`).
    expect(vergeben.textContent).toContain("Anna Beispiel · 09:12 Uhr");
  });

  it("reicht die Seriennummer nicht in die Zeile, findet sie aber ueber den Suchschluessel", async () => {
    /*
     * ⛔ DER FALL, DER DIE DATENSCHUTZ-ZUSAGE AUS §4.1 PUNKT 2 TRAEGT (Spec:3343-3348):
     * „die Seriennummer wandert nicht in den Client. Sie bleibt Suchfeld — die Suche laeuft
     * dafuer serverseitig." ⬜ Die Auflage steht im Ledger
     * (`.superpowers/sdd/planteil3/progress.md`, Block „Fix-Runde 1 zu A13"): A15 belegt,
     * dass das Lesemodell sie nicht als Feld liefert, A18 belegt sie „an der Prop, die ueber
     * die RSC-Grenze geht".
     *
     * ⛔ DIE ERSTE HAELFTE IST EIN SCAN UEBER DIE AUSGELIEFERTEN DATEIEN, UND SIE IST DIE
     * TRAGENDE. Gemessen und benannt in REVIEW-A13 Fund K3: die A13-Haelfte las
     * `Object.entries()` ihrer eigenen Hilfsfunktion und blieb gegen fuenf gleichzeitige
     * Mutationen gruen. Ein Fall, der nur ein selbstgebautes Fixture betrachtet, kann
     * konstruktiv nicht fehlschlagen — deshalb wird hier der PRODUKTIONSTEXT gelesen.
     *
     * ⚠️ ER SUCHT AUF ZWEI WORTSTAEMMEN, deutsch und englisch: das Schema fuehrt die Spalte
     * als `serialNumber` (`_db/schema.ts`), das Lesemodell nennt sie im Kopfkommentar
     * `seriennummer` (`_db/leihen.ts`). Ein Scan auf nur einem der beiden liesse die andere
     * Schreibweise durch.
     *
     * ⛔ DIE ZWEITE HAELFTE ZEIGT, DASS DIE SUCHE SIE TROTZDEM FINDET — sonst waere die
     * Zusage mit einem geloeschten Suchschluessel genauso erfuellt.
     */
    for (const pfad of [QUELLE_ZEILE, QUELLE_LISTE, QUELLE_SEITE]) {
      const q = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(q, `${pfad} nennt die Seriennummer in ausfuehrbarem Code`).not.toMatch(
        /serien|serial/i,
      );
    }

    const geraete = [
      zeile({ id: "g-1", rufname: "Kater 1", seriennummer: "SN-9931" }),
      zeile({ id: "g-2", rufname: "Kater 2", seriennummer: "SN-4400" }),
    ];
    await mount(<GeraeteListe geraete={geraete} />);

    expect(
      query('[data-rolle="radio-liste"]').textContent,
      "die Seriennummer steht im gerenderten Baum",
    ).not.toContain("9931");

    await fill('[data-rolle="radio-suche"]', "9931");
    expect(rufnamen()).toEqual(["Kater 1"]);
  });

  it("baut die vier Statusfilter aus STATUS_FILTER und filtert damit", async () => {
    /*
     * ⛔ DIE VIER NAMEN UND IHRE BESCHRIFTUNGEN STEHEN IN `_lib/filter.ts:47-71` UND WERDEN
     * HIER NICHT ZWEITGESCHRIEBEN (`_lib/filter.ts:58-61`): „Defekt·Wartung" ist EIN Wort
     * mit einem Mittelpunkt, und die naheliegende Erfindung „Defekt/Wartung" waere still
     * falsch.
     *
     * `UNAVAILABLE` fasst DEFECT und MAINTENANCE zusammen (`_lib/filter.ts:151-153`) — der
     * einzige der vier, der das tut, und deshalb der Fall, den dieser Test faehrt.
     */
    await mount(
      <GeraeteListe
        geraete={[
          zeile({ id: "g-1", rufname: "Kater 1" }),
          zeile({ id: "g-2", rufname: "Kater 2", status: "DEFECT" }),
          zeile({ id: "g-3", rufname: "Kater 3", status: "MAINTENANCE" }),
          zeile({ id: "g-4", rufname: "Kater 4", status: "ON_LOAN", entleiher: "Anna" }),
        ]}
      />,
    );

    const knoepfe = queryAll('[data-rolle="radio-statusfilter"]');
    expect(knoepfe.map((k) => k.getAttribute("data-wert"))).toEqual([...STATUS_FILTER]);
    expect(knoepfe.map((k) => k.textContent)).toEqual(
      STATUS_FILTER.map((f) => STATUS_FILTER_ETIKETT[f]),
    );
    expect(knoepfe.map((k) => k.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);

    await click('[data-rolle="radio-statusfilter"][data-wert="UNAVAILABLE"]');

    expect(rufnamen()).toEqual(["Kater 2", "Kater 3"]);
    expect(
      queryAll('[data-rolle="radio-statusfilter"]').map((k) => k.getAttribute("aria-pressed")),
    ).toEqual(["false", "false", "false", "true"]);
  });

  it("zeigt ohne Treffer den Leerzustand und setzt ihn ueber den Knopf zurueck", async () => {
    /*
     * `DeviceGroupedList.tsx:17-28`. ⛔ ER IST EIN ANDERER LEERZUSTAND ALS DER DER SEITE:
     * dort heisst es „Es sind noch keine Geräte erfasst" (`_lib/meldungen.ts:354-355`,
     * antd `Empty`, Server), hier „kein Treffer fuer DIESEN Filter" — und nur hier gibt es
     * etwas zurueckzusetzen. Die zwei zu einem zusammenzuziehen waere „der Posten, der beim
     * Port still verschwindet".
     *
     * ⛔ DER SATZ NENNT DEN SUCHTEXT, WENN ES EINEN GIBT (`DeviceGroupedList.tsx:22`) —
     * ohne ihn steht dort „Keine Treffer" ueber einer Liste, die voll ist, und niemand
     * sieht, warum.
     */
    await mount(<GeraeteListe geraete={[zeile({ id: "g-1", rufname: "Kater 1" })]} />);

    await click('[data-rolle="radio-statusfilter"][data-wert="ON_LOAN"]');
    expect(exists('[data-rolle="radio-geraetezeile"]')).toBe(false);
    expect(query('[data-rolle="radio-leer-treffer"]').textContent).toContain(
      "Keine Geräte für diesen Filter",
    );

    await fill('[data-rolle="radio-suche"]', "Waldi");
    expect(query('[data-rolle="radio-leer-treffer"]').textContent).toContain("Waldi");

    await click('[data-rolle="radio-filter-zuruecksetzen"]');

    expect(exists('[data-rolle="radio-leer-treffer"]')).toBe(false);
    expect(rufnamen()).toEqual(["Kater 1"]);
    expect(query<HTMLInputElement>('[data-rolle="radio-suche"]').value).toBe("");
  });

  it("das Suchfeld nimmt antds allowClear und setzt kein size", async () => {
    /*
     * Spec:3650 und `briefs/KOPF.md` (antd-Zuordnung): das Loeschkreuz ist `allowClear`,
     * nicht ein eigener 44er-Knopf (`DeviceFilterBar.tsx:54-63`) — antd bringt Tastatur-
     * und Bildschirmleserverhalten mit, ein Nachbau nicht.
     *
     * ⛔ UND KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`): die Flaeche
     * laeuft ohne `FullShell` und erbt `controlHeight: TAP = 56`
     * (`src/core/theme/theme.ts:50-51`); `size="large"` waere 72.
     *
     * ⚠️ EIN QUELLTEXT-SCAN, WEIL JSDOM KEINE HOEHE RECHNET (Hauslehre „UI-Abnahme: messen,
     * nicht schauen"). Er belegt die BAUFORM, nicht das Ergebnis auf dem Bildschirm.
     */
    const q = ohneKommentare(readFileSync(QUELLE_LISTE, "utf8"));
    expect(q, "das Suchfeld braucht allowClear statt eines eigenen Loeschknopfs").toMatch(
      /\ballowClear\b/,
    );
    expect(q, "size auf einem Bedienelement dieser Flaeche ist 72 (Falle 4)").not.toMatch(
      /\bsize=/,
    );
  });
});
