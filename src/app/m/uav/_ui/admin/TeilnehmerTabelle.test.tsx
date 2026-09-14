// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { TeilnehmerTabelle, type TeilnehmerZeile } from "./TeilnehmerTabelle";

/*
 * DIE SPALTENKOEPFE DER TEILNEHMER-UEBERSICHT (`@/core/tabelle`).
 *
 * ⚠️ DER FALL, DER DIESEN TEST TRAEGT: „Letzte Aktivität" zeigt „14.09.2026, 08:12" —
 * deutsches Datum, Tag zuerst. Als Zeichenkette sortiert steht der 2. OKTOBER („02.10.")
 * vor dem 14. SEPTEMBER („14.09."), also die juengere Zeile hinter der aelteren; beide
 * Ordnungen sehen auf dem Schirm gleich plausibel aus, und niemand merkt den Unterschied,
 * solange die Beispiele im selben Monat liegen. Die beiden Zeitstempel unten sind deshalb
 * so gewaehlt, dass Text- und Zeitordnung ENTGEGENGESETZT sind — sonst pruefte der Test
 * nur, DASS sortiert wird, nicht WONACH.
 *
 * Gemountet wird mit dem etablierten Harness (`qr/_lib/test-dom`), nicht mit einem
 * zweiten: antds Filtermenue haengt in einem Portal an `document.body`, und genau dafuer
 * hat das Harness `clickElement`.
 */

afterEach(async () => {
  await unmount();
});

function zeile(over: {
  id: string;
  name?: string;
  aktiv?: boolean;
  lastSeen?: string | null;
  quote?: number;
}): TeilnehmerZeile {
  return {
    participant: {
      id: over.id,
      name: over.name ?? over.id,
      loginCode: `code-${over.id}`,
      aktiv: over.aktiv ?? true,
      beginn: "2026-01-15",
      lastSeen: over.lastSeen === undefined ? "2026-09-14T08:12:00.000Z" : over.lastSeen,
    },
    erledigt: 3,
    gesamt: 12,
    quote: over.quote ?? 0.25,
    magicLink: `https://example.invalid/${over.id}`,
  };
}

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

const zeilenSchluessel = () =>
  queryAll("tbody tr[data-row-key]").map((r) => r.getAttribute("data-row-key"));

describe("TeilnehmerTabelle — Spaltenkopf", () => {
  it("sortiert „Letzte Aktivität“ CHRONOLOGISCH, nicht ueber „02.10.“/„14.09.“", async () => {
    await mount(
      <TeilnehmerTabelle
        zeilen={[
          zeile({ id: "t-oktober", lastSeen: "2026-10-02T09:00:00.000Z" }),
          zeile({ id: "t-september", lastSeen: "2026-09-14T09:00:00.000Z" }),
        ]}
      />,
    );
    // Ohne Zutun bleibt die Ordnung die der Seite — keine Spalte traegt `defaultSortOrder`.
    expect(zeilenSchluessel()).toEqual(["t-oktober", "t-september"]);

    await clickElement(spaltenkopf("Letzte Aktivität"));
    // September vor Oktober. Ueber den Anzeigetext stuende „02.10.2026" vorn.
    expect(zeilenSchluessel()).toEqual(["t-september", "t-oktober"]);
  });

  it("haelt Teilnehmer ohne Aktivitaet aufsteigend am Ende — „nie da“ ist kein Datum", async () => {
    await mount(
      <TeilnehmerTabelle
        zeilen={[
          zeile({ id: "t-nie", lastSeen: null }),
          zeile({ id: "t-da", lastSeen: "2026-09-14T09:00:00.000Z" }),
        ]}
      />,
    );
    await clickElement(spaltenkopf("Letzte Aktivität"));
    expect(zeilenSchluessel()).toEqual(["t-da", "t-nie"]);
  });

  it("filtert den Status im Spaltenkopf auf die inaktiven", async () => {
    await mount(
      <TeilnehmerTabelle
        zeilen={[
          zeile({ id: "t-aktiv", aktiv: true }),
          zeile({ id: "t-inaktiv", aktiv: false }),
        ]}
      />,
    );
    expect(zeilenSchluessel()).toHaveLength(2);

    await filterOeffnen("Status");
    await filterWaehlen("inaktiv");
    expect(zeilenSchluessel()).toEqual(["t-inaktiv"]);
  });
});
