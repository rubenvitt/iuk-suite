// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, mount, query, rerender, unmount } from "@/app/m/qr/_lib/test-dom";

const fuegeMock = vi.fn<(lernsetId: string, zeichenId: string) => Promise<{ ok: boolean; fehler?: string }>>();
vi.mock("../actions", () => ({
  entferneZeichenAusSet: async () => {},
  fuegeZeichenZuSetHinzu: (lernsetId: string, zeichenId: string) => fuegeMock(lernsetId, zeichenId),
  setzeLernsetAktiv: async () => {},
}));

const { LernsetEintraege } = await import("./LernsetEintraege");

const SET = { id: "set1", slug: "rd", titel: "Rettungsdienst", aktiv: true };

const OPTIONEN_VORHER = [
  { id: "rezept:C.1.1", titel: "Löschstaffel" },
  { id: "rezept:E.1.1", titel: "Bergungsgruppe" },
];
// Wie die Optionen nach einer erfolgreichen Aufnahme aussaehen: das aufgenommene
// Zeichen ist raus, Server Actions revalidieren die Seite und `optionen` kommt
// als NEUES Prop herein.
const OPTIONEN_NACHHER = [{ id: "rezept:E.1.1", titel: "Bergungsgruppe" }];

beforeEach(() => {
  fuegeMock.mockReset();
  fuegeMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
});

describe("LernsetEintraege", () => {
  it("waehlt anfangs die erste Option", async () => {
    await mount(<LernsetEintraege set={SET} eintraege={[]} optionen={OPTIONEN_VORHER} />);
    const auswahl = query<HTMLSelectElement>('[data-testid="lernset-hinzufuegen-auswahl"]');
    expect(auswahl.value).toBe("rezept:C.1.1");
  });

  /*
   * FIX-RUNDE 1, BEFUND W4: `ausgewaehlt` war eine EINMAL-Initialisierung aus
   * `optionen[0]`. Nach einer erfolgreichen Aufnahme verschwindet das aufgenommene
   * Zeichen aus `optionen` (neues Prop nach Revalidierung) — der `useState`-Wert blieb
   * bisher stehen, das kontrollierte `<select>` fand keine passende `<option>` mehr,
   * und ein zweiter Klick auf „Hinzufuegen" schickte die VERALTETE ID erneut. Dieser
   * Test bildet genau die Prop-Aenderung nach (`rerender` mit `OPTIONEN_NACHHER`) und
   * prueft den zweiten Klick.
   */
  it("faellt nach einer Aufnahme auf die naechste verfuegbare Option zurueck, statt an der alten ID festzuhalten", async () => {
    await mount(<LernsetEintraege set={SET} eintraege={[]} optionen={OPTIONEN_VORHER} />);

    await click('[data-testid="lernset-hinzufuegen-absenden"]');
    expect(fuegeMock).toHaveBeenNthCalledWith(1, SET.id, "rezept:C.1.1");

    // Die Seite revalidiert: `optionen` kommt ohne das gerade aufgenommene Zeichen an.
    await rerender(<LernsetEintraege set={SET} eintraege={[]} optionen={OPTIONEN_NACHHER} />);

    const auswahl = query<HTMLSelectElement>('[data-testid="lernset-hinzufuegen-auswahl"]');
    expect(auswahl.value).toBe("rezept:E.1.1");

    await click('[data-testid="lernset-hinzufuegen-absenden"]');
    expect(fuegeMock).toHaveBeenNthCalledWith(2, SET.id, "rezept:E.1.1");
  });

  it("zeigt einen Hinweis, wenn alle Zeichen schon im Set stehen", async () => {
    await mount(<LernsetEintraege set={SET} eintraege={[]} optionen={[]} />);
    const auswahl = query<HTMLSelectElement>('[data-testid="lernset-hinzufuegen-auswahl"]');
    expect(auswahl.disabled).toBe(true);
  });
});
