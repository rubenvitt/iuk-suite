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

/**
 * DIE SCHMALE DARSTELLUNG (DRK-421).
 *
 * ⚠️ WAS DIESER TEST BESITZT UND WAS NICHT. Er besitzt „beide Darstellungen
 * stehen im HTML und zeigen dieselben Daten". Er besitzt AUSDRUECKLICH NICHT
 * „auf 390px sieht man die Karten": jsdom wertet Media Queries nicht aus, eine
 * solche Zusicherung waere immer gruen und damit eine Luege
 * (`docs/design/README.md`, „Tests fuer Responsives"). Die Media Query selbst
 * haelt `core/tabelle/schmalkarten.test.ts` fest, die Wirkung ein echter
 * Browser.
 */
describe("TeilnehmerTabelle — schmale Darstellung", () => {
  it("legt Karten und Tabelle nebeneinander ins HTML", async () => {
    await mount(<TeilnehmerTabelle zeilen={[zeile({ id: "a", name: "Bruno" })]} />);

    expect(queryAll('[data-rolle="schmalkarten"]').length).toBe(1);
    expect(queryAll('[data-rolle="breitansicht"]').length).toBe(1);
  });

  it("zeigt in der Karte Name, Code, Fortschritt und den Kopierknopf", async () => {
    await mount(<TeilnehmerTabelle zeilen={[zeile({ id: "a", name: "Bruno", quote: 0.25 })]} />);
    const karte = queryAll('[data-rolle="schmalkarten"] > li')[0];

    // Der Name ist ein Weg, kein Text — und er traegt dieselbe Form wie in der
    // Tabellenzelle (`ZEILENLINK`), weil es dafuer nur eine Quelle gibt.
    const link = karte.querySelector("a");
    expect(link?.textContent).toBe("Bruno");
    expect(link?.getAttribute("href")).toBe("/admin/teilnehmer/a");
    expect(link?.style.color).toBe("inherit");
    expect(link?.style.minHeight).toBe("44px");

    expect(karte.textContent).toContain("code-a");
    expect(karte.textContent).toContain("3/12");
    // Der eigentliche Arbeitsvorgang der Seite — er war vorher am rechten Ende
    // einer waagerecht gescrollten Zeile.
    expect(karte.textContent).toContain("Link kopieren");
  });

  it("bietet jede Zeile auch als Karte an", async () => {
    await mount(
      <TeilnehmerTabelle
        zeilen={[zeile({ id: "a", name: "Bruno" }), zeile({ id: "b", name: "Carla" })]}
      />,
    );

    const karten = queryAll('[data-rolle="schmalkarten"] > li');
    expect(karten.length).toBe(2);
    expect(karten.map((k) => k.getAttribute("data-row-key"))).toEqual(["a", "b"]);
  });

  it("zeigt den Leertext auch in der schmalen Darstellung", async () => {
    // Ohne diesen Zweig staende auf dem Telefon gar nichts — die Tabelle mit
    // ihrem `emptyText` ist dort ausgeblendet.
    await mount(<TeilnehmerTabelle zeilen={[]} />);
    expect(queryAll('[data-rolle="schmalkarten-leer"]')[0]?.textContent)
      .toBe("Noch keine Teilnehmer angelegt.");
  });
});
