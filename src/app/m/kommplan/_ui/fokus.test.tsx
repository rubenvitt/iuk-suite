// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { fokussiereWennFrei } from "./fokus";

afterEach(async () => { await unmount(); });

const schublade = (
  <>
    <button type="button" data-aussen="">Neu</button>
    <div role="dialog" tabIndex={-1} data-rahmen="">
      <input aria-label="Titel" />
      <input aria-label="Telefon" />
      <div tabIndex={-1} data-container="" />
    </div>
  </>
);

describe("fokussiereWennFrei (Abnahme: verspäteter Autofokus nahm Eingaben weg)", () => {
  it("hat die Bearbeitende schon in ein anderes Feld der Schublade geklickt, bleibt der Fokus dort", async () => {
    await mount(schublade);
    query("[aria-label='Telefon']").focus();
    fokussiereWennFrei(query("[aria-label='Titel']"));
    expect(document.activeElement).toBe(query("[aria-label='Telefon']"));
  });
  it("steht der Fokus außerhalb, auf dem Container der Schublade oder nirgends, geht er ins Ziel", async () => {
    await mount(schublade);
    for (const vorher of ["[data-aussen]", "[data-rahmen]", "[data-container]", null]) {
      if (vorher) query(vorher).focus(); else (document.activeElement as HTMLElement | null)?.blur();
      fokussiereWennFrei(query("[aria-label='Titel']"));
      expect(document.activeElement, String(vorher)).toBe(query("[aria-label='Titel']"));
    }
  });
  it("ohne Ziel passiert nichts", () => {
    expect(() => fokussiereWennFrei(null)).not.toThrow();
  });
});
