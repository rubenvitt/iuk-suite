// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { HiorgQualiZeile } from "../../_lib/stammdaten/helferAbgleich";
import { QualiZuordnung } from "./QualiZuordnung";

vi.mock("../../_actions/stammdaten", () => ({ qualiZuordnungSpeichernAction: vi.fn() }));

afterEach(unmount);

const ZEILEN: HiorgQualiZeile[] = [
  { hiorg: "Rettungssanitäter", kurz: "RS", anzahl: 2, eingebaut: "RS", regel: undefined },
  { hiorg: "Sanitäter", kurz: "San", anzahl: 1, eingebaut: "SiK", regel: null },
  { hiorg: "Fachdienst", kurz: "", anzahl: 0, eingebaut: null, regel: "SanH" },
];

describe("QualiZuordnung", () => {
  it("zeigt jede HiOrg-Qualifikation mit Anzahl und ihrer Zuordnung, jedes Feld beschriftet", async () => {
    await mount(<QualiZuordnung zeilen={ZEILEN} onGespeichert={() => {}} />);
    const zeilen = queryAll("[data-testid=quali-zuordnung] > li");
    expect(zeilen.map((li) => li.querySelector("label")?.textContent)).toEqual([
      "Rettungssanitäter (RS)2 Helfer",
      "Sanitäter (San)1 Helfer",
      "Fachdienstbei niemandem mehr",
    ]);
    // Die gewählte Zuordnung steht als Text im Auswahlfeld, hinter der Beschriftung.
    expect(zeilen.map((li) => li.textContent?.replace(li.querySelector("label")?.textContent ?? "", ""))).toEqual([
      "Automatisch: RS",
      "Nicht zuordnen",
      "SanH – Sanitätshelfer",
    ]);
    for (const li of zeilen) {
      const id = li.querySelector("label")?.getAttribute("for");
      expect(id && li.querySelector(`#${id}`)).toBeTruthy();
    }
  });

  it("Speichern ist gesperrt, solange nichts geändert ist", async () => {
    await mount(<QualiZuordnung zeilen={ZEILEN} onGespeichert={() => {}} />);
    expect(query<HTMLButtonElement>("button").disabled).toBe(true);
  });
});
