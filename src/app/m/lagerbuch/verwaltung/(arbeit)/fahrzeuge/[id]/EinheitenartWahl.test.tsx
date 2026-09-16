// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { EinheitenartWahl } from "./EinheitenartWahl";

const mocks = vi.hoisted(() => ({ setEinheitenart: vi.fn(), refresh: vi.fn() }));

vi.mock("../../../../_actions/fahrzeuge", () => ({
  setEinheitenart: (...args: unknown[]) => mocks.setEinheitenart(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Die beiden Art-Schaltflächen — `Radio.Group` rendert `label > input`. */
function artKnopf(beschriftung: string): HTMLElement {
  const treffer = queryAll<HTMLElement>("label.ant-radio-button-wrapper")
    .find((element) => element.textContent?.trim() === beschriftung);
  if (!treffer) throw new Error(`Art nicht gefunden: ${beschriftung}`);
  return treffer.querySelector<HTMLInputElement>("input") ?? treffer;
}

function istGewaehlt(beschriftung: string): boolean {
  const treffer = queryAll<HTMLElement>("label.ant-radio-button-wrapper")
    .find((element) => element.textContent?.trim() === beschriftung);
  return Boolean(treffer?.classList.contains("ant-radio-button-wrapper-checked"));
}

afterEach(async () => {
  // ⚠️ `unmount()` IST ASYNCHRON UND MUSS ERWARTET WERDEN. Ohne `await` läuft
  // es in den nächsten Fall hinein und räumt dessen frisch gemounteten Baum
  // ab — `document.body.textContent` ist dann leer, und der Fall meldet einen
  // fehlenden Text statt eines Aufräumfehlers.
  await unmount();
  mocks.setEinheitenart.mockReset();
  mocks.refresh.mockReset();
});

describe("EinheitenartWahl — der Weg aus dem Zwischenstand (DRK-309)", () => {
  it("zeigt bei fehlender Zuordnung beide Arten ungewählt und den grauen Hinweis", async () => {
    await mount(<EinheitenartWahl id="alt-1" einheitenart={null} />);

    expect(istGewaehlt("Fahrzeug")).toBe(false);
    expect(istGewaehlt("Tasche")).toBe(false);
    expect(document.body.textContent).toContain("Noch nicht zugeordnet");
  });

  it("nennt den Zwischenstand NICHT mehr, sobald eine Art feststeht", async () => {
    // ⚠️ Sonst stünde auf jedem zugeordneten Blatt dauerhaft ein Hinweis auf
    // einen Zustand, aus dem es längst heraus ist.
    await mount(<EinheitenartWahl id="f1" einheitenart="fahrzeug" />);

    expect(istGewaehlt("Fahrzeug")).toBe(true);
    expect(document.body.textContent).not.toContain("Noch nicht zugeordnet");
  });

  it("schickt die gewählte Art an die Action und übernimmt sie erst danach", async () => {
    let fertig!: (wert: { ok: true }) => void;
    mocks.setEinheitenart.mockReturnValueOnce(
      new Promise((resolve) => { fertig = resolve; }));
    await mount(<EinheitenartWahl id="alt-1" einheitenart={null} />);

    await clickElement(artKnopf("Tasche"));
    await warte();

    expect(mocks.setEinheitenart)
      .toHaveBeenCalledWith({ id: "alt-1", einheitenart: "tasche" });
    /*
     * ⚠️ NOCH NICHT ÜBERNOMMEN, solange die Antwort aussteht. Eine
     * optimistische Anzeige wäre hier die falsche Zusicherung: schlägt die
     * Action fehl, stünde die neue Art auf dem Blatt und die alte in der
     * Datenbank — und die Meldung daneben läse sich wie ein
     * Darstellungsfehler statt wie ein nicht gespeicherter Wert.
     */
    expect(document.body.textContent).toContain("Noch nicht zugeordnet");

    await act(async () => { fertig({ ok: true }); });
    await warte();
    expect(istGewaehlt("Tasche")).toBe(true);
    expect(document.body.textContent).not.toContain("Noch nicht zugeordnet");
    /*
     * ⚠️ UND DAS BLATT WIRD AUFGEFRISCHT (Reviewrunde 7). Diese Insel ist
     * nicht die einzige Stelle, die die Art liest: der Chip in der Kopfzeile,
     * der Löschknopf, die Vorlagenfläche und die Verfallsüberschrift bekommen
     * sie als Prop aus der Server Component. Ohne `refresh()` stünde die Wahl
     * richtig, und drei Zeilen weiter oben fragte dieselbe Seite „Fahrzeug
     * löschen?" über einer gerade gespeicherten Tasche.
     */
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("behält den alten Stand und zeigt den Fachtext, wenn die Action ablehnt", async () => {
    mocks.setEinheitenart.mockResolvedValueOnce({
      ok: false, fehler: "Einheit nicht gefunden.",
    });
    await mount(<EinheitenartWahl id="weg" einheitenart="fahrzeug" />);

    await clickElement(artKnopf("Tasche"));
    await warte();

    expect(istGewaehlt("Fahrzeug")).toBe(true);
    expect(istGewaehlt("Tasche")).toBe(false);
    expect(document.body.textContent).toContain("Einheit nicht gefunden.");
    // ⚠️ UND KEINE AUFFRISCHUNG: es gibt nichts Neues zu holen, und ein
    // `refresh()` hier holte den ALTEN Stand — was wie ein Zurückspringen
    // aussähe und die Fehlermeldung daneben Lügen strafte.
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("verbirgt einen geworfenen Fehler hinter einem festen Fachtext", async () => {
    mocks.setEinheitenart.mockRejectedValueOnce(new Error("SQLITE intern und geheim"));
    await mount(<EinheitenartWahl id="f1" einheitenart="fahrzeug" />);

    await clickElement(artKnopf("Tasche"));
    await warte();

    expect(document.body.textContent).toContain("Art konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("SQLITE intern und geheim");
    expect(istGewaehlt("Fahrzeug")).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("ruft die Action nicht auf, wenn die schon gewählte Art erneut geklickt wird", async () => {
    // Ein Klick ohne Änderung ist keine Änderung — er schriebe sonst eine
    // Audit-Zeile über nichts.
    await mount(<EinheitenartWahl id="f1" einheitenart="fahrzeug" />);

    await clickElement(artKnopf("Fahrzeug"));
    await warte();

    expect(mocks.setEinheitenart).not.toHaveBeenCalled();
  });
});
