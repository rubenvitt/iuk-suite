// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { HiorgQualiZeile } from "../../_lib/stammdaten/helferAbgleich";
import { QUALIFIKATIONEN } from "../../_lib/stammdaten/vorlage";
import { QualiZuordnung, regelnAus, startZuordnung, zuordnungGeaendert } from "./QualiZuordnung";

afterEach(unmount);

const ZEILEN: HiorgQualiZeile[] = [
  { hiorg: "Rettungssanitäter", kurz: "RS", anzahl: 2, eingebaut: "RS", regel: undefined },
  { hiorg: "Sanitäter", kurz: "San", anzahl: 1, eingebaut: "SiK", regel: null },
  { hiorg: "Fachdienst", kurz: "", anzahl: 0, eingebaut: null, regel: "SanH" },
];

describe("QualiZuordnung", () => {
  it("zeigt jede HiOrg-Qualifikation mit Anzahl und ihrer Zuordnung, jedes Feld beschriftet", async () => {
    await mount(<QualiZuordnung zeilen={ZEILEN} auswahl={[...QUALIFIKATIONEN]} wahl={startZuordnung(ZEILEN)} onWahl={() => {}} />);
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

  it("gilt erst als geändert, wenn eine Wahl vom gespeicherten Stand abweicht", () => {
    const wahl = startZuordnung(ZEILEN);
    expect(zuordnungGeaendert(ZEILEN, wahl)).toBe(false);
    expect(zuordnungGeaendert(ZEILEN, new Map(wahl).set("Sanitäter", "keine"))).toBe(false);
    expect(zuordnungGeaendert(ZEILEN, new Map(wahl).set("Sanitäter", "auto"))).toBe(true);
  });

  it("schickt „Automatisch“ nicht als Regel, „Nicht zuordnen“ als null", () => {
    expect(regelnAus(ZEILEN, startZuordnung(ZEILEN))).toEqual([
      { hiorg: "Sanitäter", kurz: null },
      { hiorg: "Fachdienst", kurz: "SanH" },
    ]);
  });
});
