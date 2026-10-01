// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";
import { AUSWAHLLEISTE, Griffe } from "./Griffe";

const KARTE = { id: "a", x: 100, y: 50, breite: 60, hoehe: 20, titelVoll: "EA 1" } as unknown as KarteL;
const zeige = async (seitenstelle = false, breite = 800) => {
  await mount(<Griffe karte={KARTE} ansicht={{ x: 0, y: 0, massstab: 1 } as Ansicht} flaeche={{ breite, hoehe: 600 }} seitenstelle={seitenstelle}
    onUnterstelle={() => {}} onSeitenstelle={() => {}} onEinheit={() => {}} onBearbeiten={() => {}} />);
  await act(async () => {});
};
const griffe = () => queryAll("[data-griff]").map((g) => g.getAttribute("data-griff"));

afterEach(async () => { await unmount(); });

describe("Griffe in der Auswahlleiste (Phase 3, Entscheidung 18; Phase 4, Entscheidung 15)", () => {
  it("Reihenfolge: Bearbeiten zuerst (am Telefon im Bild), dann + Unterstelle, + Einheit, + links, + rechts", async () => {
    await zeige();
    expect(griffe()).toEqual(["bearbeiten", "unter", "einheit", "links", "rechts"]);
  });
  it("eine Seitenstelle trägt nichts (§4.2): nur Bearbeiten und + Einheit", async () => {
    await zeige(true);
    expect(griffe()).toEqual(["bearbeiten", "einheit"]);
  });
  it("die Leiste ist höchstens so breit wie die Fläche abzüglich beider Abstände", async () => {
    await zeige(false, 390);
    expect(query(".kp-auswahlleiste").style.maxWidth).toBe(`${390 - 2 * AUSWAHLLEISTE.abstand}px`);
  });
  it("an der Karte hängt nur der Auswahlrahmen; die Leiste ist eine Gruppe mit dem Namen der Stelle", async () => {
    await zeige();
    expect(queryAll(".kp-griffe-karte > *").map((e) => e.className)).toEqual(["kp-auswahlrahmen"]);
    expect(query(".kp-auswahlleiste").getAttribute("role")).toBe("group");
    expect(query(".kp-auswahlleiste").getAttribute("aria-label")).toBe("Auswahl: EA 1");
  });
});
