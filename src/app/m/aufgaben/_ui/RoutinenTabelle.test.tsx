// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { RoutineRow } from "../_db/schema";
import { RoutinenTabelle } from "./RoutinenTabelle";

/**
 * DER RAHMEN UM DIE BREITE DARSTELLUNG (DRK-451).
 *
 * ⚠️ SEIT DIESE TABELLE EINE `Kartentabelle` IST, STEHT JEDE ZEILE ZWEIMAL IM
 * BAUM — einmal als Tabellenzeile, einmal als Karte. Beide tragen dieselben
 * Marken, und das ist richtig: `display: none` nimmt die verborgene aus dem
 * Zugaenglichkeitsbaum, ein Greifer ueber das DOM sieht sie trotzdem. jsdom
 * wertet die Media Query gar nicht aus, dort sind also BEIDE „da".
 *
 * ⚠️ OHNE DIESEN RAHMEN MISST EIN FALL DIE DOPPELTE MENGE, und die Meldung
 * fuehrt in die Irre: „erwartet 2, bekommen 4" liest sich wie ein doppelt
 * gerenderter Lesepfad, nicht wie zwei Darstellungen derselben Zeile.
 *
 * ⚠️ `tbody`- UND `thead`-GREIFER BRAUCHEN IHN NICHT — eine Karte hat weder das
 * eine noch das andere. Eingerahmt wird nur, was ohne sie greift.
 */
const BREIT = '[data-rolle="breitansicht"]';


/*
 * DIE ZEILENAKTIONEN — UND WARUM SIE EIN EIGENER TEST BRAUCHEN (Review Fix-Runde 1, Important): weder
 * der Aendern-Verweis noch die `routineId` im Ruhen-Formular waren gegen die RICHTIGE zeilenspezifische
 * Id geprueft. Eine fest verdrahtete Id (z. B. immer die der ersten Zeile) haette in `page.test.tsx`
 * NICHT aufgefallen — dort steht bislang keine Zeile, die zwei Routinen NEBENEINANDER auf ihre je
 * EIGENE Aktion prueft. Der Fehler traefe die falsche Zeile, und niemand bemerkte ihn, bis jemand die
 * falsche Routine schlafen legt. DIESER TEST NIMMT DESHALB ZWEI ZEILEN — mit einer einzigen bewiese er
 * nichts, eine fest verdrahtete Id waere ununterscheidbar von der richtigen.
 */

afterEach(async () => {
  await unmount();
});

function routine(over: Partial<RoutineRow> & Pick<RoutineRow, "id">): RoutineRow {
  return {
    personId: "alina",
    titel: "R",
    wochentage: 0b11111,
    uhrzeit: "08:00",
    dauerMinuten: 15,
    aktiv: true,
    erstelltAm: new Date(0),
    ...over,
  };
}

describe("RoutinenTabelle — Zeilenaktionen tragen die EIGENE routine.id, nicht die einer anderen Zeile", () => {
  it("der Aendern-Verweis zeigt je Zeile auf die eigene id", async () => {
    const zeilen = [
      routine({ id: "r-1", titel: "Erste" }),
      routine({ id: "r-2", titel: "Zweite" }),
    ];
    await mount(<RoutinenTabelle routinen={zeilen} />);

    const hrefs = queryAll<HTMLAnchorElement>(`${BREIT} a`)
      .filter((a) => a.textContent === "Ändern")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/routinen?bearbeiten=r-1", "/routinen?bearbeiten=r-2"]);
  });

  it("das Ruhen-Formular traegt je Zeile die eigene routineId im versteckten Feld", async () => {
    const zeilen = [
      routine({ id: "r-1", titel: "Erste" }),
      routine({ id: "r-2", titel: "Zweite" }),
    ];
    await mount(<RoutinenTabelle routinen={zeilen} />);

    const ids = queryAll<HTMLInputElement>(`${BREIT} input[name='routineId']`)
      .map((i) => i.value);
    expect(ids).toEqual(["r-1", "r-2"]);
  });

  it("die Ruhen-Beschriftung folgt je Zeile dem EIGENEN aktiv-Zustand, nicht dem der ersten Zeile", async () => {
    const zeilen = [
      routine({ id: "r-1", titel: "Aktive", aktiv: true }),
      routine({ id: "r-2", titel: "Ruhende", aktiv: false }),
    ];
    await mount(<RoutinenTabelle routinen={zeilen} />);

    const rows = queryAll("tbody tr[data-row-key]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Ruhen lassen");
    expect(rows[1]!.textContent).toContain("Wieder aktivieren");
  });
});

/*
 * SORTIERUNG UND FILTER LIEGEN IM SPALTENKOPF (`@/core/tabelle`) — UND DIESE ZWEI FAELLE SIND
 * GENAU DIE, DIE EINE FALSCHE UMSETZUNG NICHT BEMERKT HAETTE.
 *
 * 1. Die Dauer ist die Spalte, an der sich „ueber den Rohwert" von „ueber den Anzeigetext"
 *    UEBERHAUPT unterscheiden laesst: `fmtDauer(45)` ist „45 Min.", `fmtDauer(90)` ist
 *    „1,5 Std." — als Zeichenkette stuende die laengere Routine VOR der kuerzeren, und das
 *    saehe niemand, weil beide Ordnungen plausibel aussehen. Die Zahlen sind deshalb bewusst
 *    so gewaehlt, dass Text- und Zahlenordnung ENTGEGENGESETZT sind.
 * 2. Der Statusfilter ersetzt keine Knopfleiste, es gab nie eine — er ist der Ort, an den
 *    „zeig mir nur die ruhenden" gehoert, statt in eine zweite Bedienzeile ueber der Tabelle.
 */
function spaltenkopf(beschriftung: string): HTMLElement {
  const th = queryAll("thead th").find((t) => (t.textContent ?? "").includes(beschriftung));
  if (!th) throw new Error(`Kein Spaltenkopf „${beschriftung}“`);
  return th;
}

/** Den Filter EINER Spalte oeffnen — das Menue haengt danach im Portal an `document.body`. */
async function filterOeffnen(beschriftung: string): Promise<void> {
  const ausloeser = spaltenkopf(beschriftung).querySelector<HTMLElement>(
    ".ant-table-filter-trigger",
  );
  if (!ausloeser) throw new Error(`Spalte „${beschriftung}“ hat keinen Filter`);
  await clickElement(ausloeser);
}

async function filterWaehlen(eintrag: string): Promise<void> {
  const punkt = [...document.body.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item")].find(
    (i) => i.textContent === eintrag,
  );
  if (!punkt) throw new Error(`Kein Filtereintrag „${eintrag}“`);
  await clickElement(punkt);
  const ok = [
    ...document.body.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown-btns button"),
  ].find((b) => b.textContent === "OK");
  if (!ok) throw new Error("Kein OK im Filtermenue");
  await clickElement(ok);
}

describe("RoutinenTabelle — Spaltenkopf: Sortierung ueber den Rohwert, Filter statt Leiste", () => {
  it("sortiert die Dauer NUMERISCH, nicht ueber „45 Min.“/„1,5 Std.“", async () => {
    await mount(
      <RoutinenTabelle
        routinen={[
          routine({ id: "r-lang", titel: "Lang", dauerMinuten: 90 }),
          routine({ id: "r-kurz", titel: "Kurz", dauerMinuten: 45 }),
        ]}
      />,
    );
    // Ohne Zutun bleibt die Ordnung die der Seite — kein `defaultSortOrder`.
    expect(queryAll("tbody tr[data-row-key]").map((r) => r.getAttribute("data-row-key"))).toEqual([
      "r-lang",
      "r-kurz",
    ]);

    await clickElement(spaltenkopf("Dauer"));
    expect(queryAll("tbody tr[data-row-key]").map((r) => r.getAttribute("data-row-key"))).toEqual([
      // 45 vor 90. Ueber den Anzeigetext waere es die umgekehrte Reihenfolge,
      // weil „1,5 Std." vor „45 Min." steht.
      "r-kurz",
      "r-lang",
    ]);
  });

  it("filtert im Spaltenkopf auf „Ruht“ — die aktive Zeile verschwindet", async () => {
    await mount(
      <RoutinenTabelle
        routinen={[
          routine({ id: "r-aktiv", titel: "Laeuft", aktiv: true }),
          routine({ id: "r-ruht", titel: "Schlaeft", aktiv: false }),
        ]}
      />,
    );
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(2);

    await filterOeffnen("Status");
    await filterWaehlen("Ruht");

    const uebrig = queryAll("tbody tr[data-row-key]");
    expect(uebrig).toHaveLength(1);
    expect(uebrig[0]!.getAttribute("data-row-key")).toBe("r-ruht");
  });
});
