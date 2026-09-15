// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { VergleichTabelle, type VergleichZeile } from "./VergleichTabelle";

/*
 * DIE SPALTENKOEPFE DES GRUPPENVERGLEICHS (`@/core/tabelle`).
 *
 * WAS HIER GEPRUEFT WIRD UND WARUM ES NICHT IN `(admin)/vergleich/page.test.tsx` STEHT:
 * dort haengt die Ordnung an der SEITE (sie sortiert die Zeilen, bevor sie sie reicht),
 * hier an der TABELLE. Beide muessen dieselbe sein — §3.4 sagt „bester zuerst" —, und
 * genau deshalb braucht die zweite Haelfte einen eigenen Beleg: bekaeme die Notenspalte
 * ihren `sorter` ohne `defaultSortOrder`, waere die Seite weiterhin gruen und die Zusage
 * trotzdem nur noch ein Angebot im Spaltenkopf.
 *
 * ⚠️ DIE NOTE IST DER FALL, IN DEM „GROESZER" UND „BESSER" AUSEINANDERGEHEN. 1 ist die
 * beste Schulnote; aufsteigend ist hier also die fachlich richtige Richtung, und eine
 * Gruppe OHNE Ø darf nicht vorn stehen — ein `null` an erster Stelle laese sich als die
 * beste Bewertung lesen.
 */

afterEach(async () => {
  await unmount();
});

function zeile(over: Partial<VergleichZeile> & Pick<VergleichZeile, "groupId" | "name">): VergleichZeile {
  return {
    abende: 4,
    ruecklauf: 50,
    note: 2.4,
    noten: [],
    rueckmeldungen: 20,
    hasLegacyScale: false,
    ...over,
  };
}

const namen = () =>
  queryAll("tbody tr[data-testid='vergleich-row']").map(
    (tr) => tr.querySelector("a")?.textContent ?? "",
  );

function spaltenkopf(beschriftung: string): HTMLElement {
  const th = queryAll("thead th").find((t) =>
    (t.textContent ?? "").toLowerCase().includes(beschriftung.toLowerCase()),
  );
  if (!th) throw new Error(`Kein Spaltenkopf „${beschriftung}“`);
  return th;
}

async function filterWaehlen(spalte: string, eintrag: string): Promise<void> {
  const ausloeser = spaltenkopf(spalte).querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!ausloeser) throw new Error(`Spalte „${spalte}“ hat keinen Filter`);
  await clickElement(ausloeser);
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

describe("VergleichTabelle — Spaltenkopf", () => {
  it("steht von sich aus aufsteigend nach Ø, Gruppen ohne Ø am Ende (§3.4)", async () => {
    await mount(
      <VergleichTabelle
        zeilen={[
          // Absichtlich UNSORTIERT hereingereicht: die Tabelle selbst muss die
          // Ordnung herstellen, nicht nur die Reihenfolge der Seite durchreichen.
          zeile({ groupId: 3, name: "Ohne", note: null }),
          zeile({ groupId: 2, name: "Schlecht", note: 4.8 }),
          zeile({ groupId: 1, name: "Beste", note: 1.2 }),
        ]}
      />,
    );
    expect(namen()).toEqual(["Beste", "Schlecht", "Ohne"]);
  });

  it("dreht die Notenordnung auf Klick um — die beste Gruppe steht dann hinten", async () => {
    await mount(
      <VergleichTabelle
        zeilen={[
          zeile({ groupId: 1, name: "Beste", note: 1.2 }),
          zeile({ groupId: 2, name: "Schlecht", note: 4.8 }),
        ]}
      />,
    );
    await clickElement(spaltenkopf("Ø Note"));
    expect(namen()).toEqual(["Schlecht", "Beste"]);
  });

  it("filtert die nicht vergleichbaren Gruppen aus (unter fuenf Rueckmeldungen, §3.4)", async () => {
    await mount(
      <VergleichTabelle
        zeilen={[
          zeile({ groupId: 1, name: "Viele", rueckmeldungen: 20, note: 1.2 }),
          zeile({ groupId: 2, name: "Wenige", rueckmeldungen: 3, note: 1.1 }),
        ]}
      />,
    );
    // Beide sind da, und die „wenige" Zeile sagt es auch in der Zelle.
    expect(namen()).toEqual(["Wenige", "Viele"]);

    await filterWaehlen("Gruppe", "Vergleichbar");
    expect(namen()).toEqual(["Viele"]);
  });
});
