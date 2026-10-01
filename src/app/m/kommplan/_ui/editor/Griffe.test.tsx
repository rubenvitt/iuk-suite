// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";
import { Griffe } from "./Griffe";

const karte = (hoehe: number) => ({ id: "a", x: 100, y: 50, breite: 60, hoehe, titelVoll: "EA 1" }) as unknown as KarteL;
const zeige = async (hoehe: number) => {
  await mount(<Griffe karte={karte(hoehe)} ansicht={{ x: 0, y: 0, massstab: 1 } as Ansicht} flaeche={{ breite: 800, hoehe: 600 }} seitenstelle={false}
    onUnterstelle={() => {}} onSeitenstelle={() => {}} onEinheit={() => {}} onBearbeiten={() => {}} />);
  await act(async () => {});
};
const px = (el: HTMLElement, eig: "top") => Number.parseFloat(el.style[eig]);

afterEach(async () => { await unmount(); });

describe("Griffe (Review Phase 3)", () => {
  it("eine niedrige Karte (eingepasst am Telefon): die Seitengriffe enden an der Kartenunterkante, über der Griffleiste", async () => {
    await zeige(20);
    for (const seite of ["links", "rechts"]) {
      const g = query(`[data-griff="${seite}"]`);
      expect(px(g, "top") + 44).toBeLessThanOrEqual(20); // Unterkante relativ zur Karte ≤ Kartenhöhe
    }
    expect(px(query(".kp-griffleiste"), "top")).toBe(50 + 20 + 8); // die Leiste beginnt 8 px unter der Karte
  });
  it("eine hohe Karte: die Seitengriffe stehen mittig", async () => {
    await zeige(200);
    expect(px(query('[data-griff="links"]'), "top")).toBe(100 - 22);
  });
});
