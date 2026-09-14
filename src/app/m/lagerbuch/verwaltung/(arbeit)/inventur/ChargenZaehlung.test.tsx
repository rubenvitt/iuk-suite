// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { ChargenZaehlung } from "./ChargenZaehlung";
import { positionenAus, type ZaehlStand } from "./inventurZustand";

const ZEILE: InventurZeile = {
  id: "a1", name: "Mullbinde", einheit: "Stk", fach: "A1", kategorie: null, mindestbestand: 0, bestand: 10,
  chargen: [
    { id: "c1", chargenNr: "L1", verfall: "2026-10", rest: 4, ampel: "gelb" },
    { id: "c2", chargenNr: "L2", verfall: "2029-01", rest: 6, ampel: "gruen" },
  ],
};

/** Wendet die Umbauten auf einen echten Stand an — so prueft der Test die Nutzlast, nicht Aufrufe. */
function harness() {
  let stand: ZaehlStand = {};
  const onAendern = vi.fn((umbau: (s: ZaehlStand) => ZaehlStand) => { stand = umbau(stand); });
  return { onAendern, stand: () => stand };
}

afterEach(async () => { await unmount(); });

describe("ChargenZaehlung", () => {
  it("zeigt je Charge Nummer, MHD und erwartete Menge", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    expect(queryAll("[data-rolle='charge']")).toHaveLength(2);
    expect(query("[data-charge-id='c1']").textContent).toContain("L1");
    expect(query("[data-charge-id='c1']").textContent).toContain("10/26");
    expect(query("[data-charge-id='c1']").textContent).toContain("erwartet 4");
  });

  it("sendet nur die angefasste Charge", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    await fill("input[aria-label='Ist Charge L2']", "5");
    expect(positionenAus(h.stand())).toEqual([{ artikelId: "a1", chargen: [{ chargeId: "c2", ist: 5 }], neu: [] }]);
  });

  it("ergänzt eine Charge erst mit gültigem MHD und leert danach die Felder", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    const knopf = query<HTMLButtonElement>("button[aria-label='Charge ergänzen']");
    expect(knopf.disabled).toBe(true);
    await fill("input[aria-label='MHD der neuen Charge']", "2027-03");
    await fill("input[aria-label='Menge der neuen Charge']", "2");
    expect(knopf.disabled).toBe(false);
    await click("button[aria-label='Charge ergänzen']");
    expect(positionenAus(h.stand())).toEqual([{
      artikelId: "a1", chargen: [], neu: [{ verfall: "2027-03", chargenNr: "", ist: 2 }],
    }]);
    expect(query<HTMLInputElement>("input[aria-label='MHD der neuen Charge']").value).toBe("");
  });

  it("sperrt das Ergänzen einer Charge, die schon in der Liste steht", async () => {
    const h = harness();
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={undefined} gesperrt={false} onAendern={h.onAendern} />);
    await fill("input[aria-label='MHD der neuen Charge']", "2026-10");
    await fill("input[aria-label='Chargennummer der neuen Charge']", "L1");
    expect(query<HTMLButtonElement>("button[aria-label='Charge ergänzen']").disabled).toBe(true);
    expect(document.body.textContent).toContain("Diese Charge steht schon in der Liste");
  });

  it("verwirft die Chargenzählung", async () => {
    const h = harness();
    h.onAendern((s) => ({ ...s, a1: { art: "chargen", chargen: { c1: 1 }, neu: [] } }));
    await mount(<ChargenZaehlung zeile={ZEILE} zaehlung={h.stand().a1} gesperrt={false} onAendern={h.onAendern} />);
    // Text-Knopf ohne aria-label — ueber seinen Text finden, nicht ueber einen Platzhalter-Selektor.
    const verwerfen = queryAll<HTMLButtonElement>("button")
      .find((b) => b.textContent?.includes("Chargenzählung verwerfen"));
    if (!verwerfen) throw new Error("Knopf „Chargenzählung verwerfen“ fehlt");
    await act(async () => { verwerfen.click(); });
    expect(positionenAus(h.stand())).toEqual([]);
  });
});
