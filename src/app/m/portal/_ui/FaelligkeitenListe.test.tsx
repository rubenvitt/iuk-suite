// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Faelligkeit } from "@/core/faelligkeiten";
import type { FaelligkeitsGruppe } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import { FaelligkeitenListe } from "@/app/m/portal/_ui/FaelligkeitenListe";

const f = (id: string, dringlichkeit: Faelligkeit["dringlichkeit"]): Faelligkeit => ({
  id, art: "Verfall", titel: `Artikel ${id}`, wo: null, zustand: "abgelaufen", dringlichkeit, sortierung: "", pfad: `/x/${id}`,
});

const GRUPPEN: FaelligkeitsGruppe[] = [
  { modul: "lagerbuch", titel: "Lagerbuch", basisUrl: "https://lager.example", eintraege: [f("u1", "ueberfaellig"), f("b1", "bald")], fehler: false },
  { modul: "radio", titel: "Funk", basisUrl: null, eintraege: [f("b2", "bald")], fehler: false },
];

afterEach(async () => {
  await unmount();
});

async function waehle(gruppe: string, beschriftung: string): Promise<void> {
  const knopf = queryAll(`[role="radiogroup"][aria-label="${gruppe}"] button`).find((b) => b.textContent?.startsWith(beschriftung));
  if (!knopf) throw new Error(`Keine Pille „${beschriftung}“ in ${gruppe}`);
  await clickElement(knopf);
}

const zeilen = () => queryAll('[data-testid="faellig-zeile"]').map((z) => z.textContent ?? "");

describe("FaelligkeitenListe (IDA-391)", () => {
  it("setzt Modulnamen als echte Überschriften", async () => {
    await mount(<FaelligkeitenListe gruppen={GRUPPEN} />);
    expect(queryAll("h2").map((h) => h.textContent)).toEqual(["Lagerbuch", "Funk"]);
  });

  it("zeigt die Dringlichkeit als Statuschip mit den Wörtern der Wortliste", async () => {
    await mount(<FaelligkeitenListe gruppen={GRUPPEN} />);
    const chips = queryAll('[data-testid="faellig-zeile"] [data-statuschip]');
    expect(chips.map((c) => [c.getAttribute("data-statuschip"), c.textContent])).toEqual([
      ["fehler", "überfällig"], ["warnung", "bald fällig"], ["warnung", "bald fällig"],
    ]);
  });

  it("macht Zeilen mit Ziel als Link mit Pfeil erkennbar — ohne Ziel weder noch", async () => {
    await mount(<FaelligkeitenListe gruppen={GRUPPEN} />);
    const lager = queryAll('[data-testid="faellig-lagerbuch"] [data-testid="faellig-zeile"]');
    expect(lager.every((z) => z.tagName === "A" && z.querySelector("svg"))).toBe(true);
    expect(lager[0].getAttribute("href")).toBe("https://lager.example/x/u1");
    const funk = query('[data-testid="faellig-radio"] [data-testid="faellig-zeile"]');
    expect(funk.tagName).toBe("DIV");
    expect(funk.querySelector("svg")).toBeNull();
  });

  it("filtert nach Dringlichkeit und Modul, die Liste folgt", async () => {
    await mount(<FaelligkeitenListe gruppen={GRUPPEN} />);
    await waehle("Dringlichkeit", "Überfällig");
    expect(zeilen()).toHaveLength(1);
    expect(zeilen()[0]).toContain("Artikel u1");
    // Funk hat nichts Überfälliges — die Karte fällt weg, statt „nichts an" zu behaupten.
    expect(exists('[data-testid="faellig-radio"]')).toBe(false);

    await waehle("Modul", "Funk");
    expect(zeilen()).toEqual([]);
    expect(query('[data-testid="faellig-leer"]').textContent).toBe("Nichts ist überfällig.");

    await waehle("Dringlichkeit", "Alle");
    expect(zeilen()).toHaveLength(1);
    expect(zeilen()[0]).toContain("Artikel b2");
  });

  it("zählt an den Dringlichkeits-Pillen im gewählten Modul", async () => {
    await mount(<FaelligkeitenListe gruppen={GRUPPEN} />);
    const zahlen = () => queryAll('[aria-label="Dringlichkeit"] button').map((b) => b.textContent);
    expect(zahlen()).toEqual(["Alle 3", "Überfällig 1", "Fällig 0", "Bald fällig 2"]);
    await waehle("Modul", "Funk");
    expect(zahlen()).toEqual(["Alle 1", "Überfällig 0", "Fällig 0", "Bald fällig 1"]);
  });

  it("kennt „fällig“ (heute) als eigene Stufe: Chip, Zähler und Filter (IDA-402)", async () => {
    const mitHeute: FaelligkeitsGruppe[] = [
      { ...GRUPPEN[0], eintraege: [f("u1", "ueberfaellig"), f("h1", "faellig"), f("b1", "bald")] },
      GRUPPEN[1],
    ];
    await mount(<FaelligkeitenListe gruppen={mitHeute} />);
    const chips = queryAll('[data-testid="faellig-lagerbuch"] [data-statuschip]');
    expect(chips.map((c) => [c.getAttribute("data-statuschip"), c.textContent])).toEqual([
      ["fehler", "überfällig"], ["warnung", "fällig"], ["warnung", "bald fällig"],
    ]);
    expect(query('[data-testid="faellig-lagerbuch"]').textContent).toContain("1 überfällig · 1 fällig · 1 bald fällig");

    await waehle("Dringlichkeit", "Fällig");
    expect(zeilen()).toHaveLength(1);
    expect(zeilen()[0]).toContain("Artikel h1");
    await waehle("Modul", "Funk");
    expect(query('[data-testid="faellig-leer"]').textContent).toBe("Nichts ist fällig.");
  });

  it("zeigt bei nur einem Modul keinen Modulfilter", async () => {
    await mount(<FaelligkeitenListe gruppen={[GRUPPEN[0]]} />);
    expect(exists('[aria-label="Modul"]')).toBe(false);
    expect(exists('[aria-label="Dringlichkeit"]')).toBe(true);
  });
});
