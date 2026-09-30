// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { click, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { BEISPIELE } from "../../_lib/beispiele";
import { leererPlan } from "../../_lib/plan/operationen";
import { Betrachter } from "./Betrachter";

afterEach(() => unmount());
const einsatz = BEISPIELE[0];

describe("Betrachter", () => {
  it("zeigt alle Karten; Einklappen der EL lässt nur Leitstelle und EL stehen, mit Abzeichen", async () => {
    await mount(<Betrachter inhalt={einsatz.inhalt} symbole={{}} titel={einsatz.titel} schrift="Arimo" />);
    expect(queryAll("[data-karte]")).toHaveLength(6);
    await click('[data-umschalter="el"]');
    expect(queryAll("[data-karte]").map((k) => k.getAttribute("data-karte"))).toEqual(["lts", "el"]);
    expect(query("[data-abzeichen]").textContent).toBe("+4 Stellen");
    expect(query('[data-umschalter="el"]').getAttribute("aria-expanded")).toBe("false");
    await click('[data-umschalter="el"]');
    expect(queryAll("[data-karte]")).toHaveLength(6);
  });
  it("Tastatur: + vergrößert", async () => {
    await mount(<Betrachter inhalt={einsatz.inhalt} symbole={{}} titel={einsatz.titel} schrift="Arimo" />);
    const vorher = query("[data-ansicht]").getAttribute("transform");
    await act(async () => { query(".kp-betrachter").dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })); });
    expect(query("[data-ansicht]").getAttribute("transform")).not.toBe(vorher);
  });
  it("leerer Plan: ein Hinweis statt einer leeren Fläche", async () => {
    await mount(<Betrachter inhalt={leererPlan()} symbole={{}} titel="leer" schrift="Arimo" />);
    expect(document.body.textContent).toContain("Dieser Plan hat noch keine Stellen.");
  });
});
