// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { click, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { App } from "antd";
import { Fahrzeugtafel } from "./Fahrzeugtafel";
import { leereAkte, ruhigeAkte, volleAkte } from "./fixtures";
import type { AkteMitStand } from "../../_lib/akte/typen";

afterEach(async () => { await unmount(); });

const zeige = (liste: AkteMitStand[]) => mount(<App><Fahrzeugtafel liste={liste} /></App>);
const zeilen = () => queryAll("[data-row-key]").map((z) => z.getAttribute("data-row-key"));
const kachel = (stufe: string) => query<HTMLButtonElement>(`button[data-stufe="${stufe}"]`);

describe("Fahrzeugtafel", () => {
  it("zeigt je Fahrzeug eine Zeile mit Gesamtstand, Terminen und dem Weg in die Akte", async () => {
    await zeige([volleAkte(), ruhigeAkte()]);
    expect(zeilen()).toEqual(["fz-rtw", "fz-mtf"]);
    const rtw = query('[data-row-key="fz-rtw"]');
    expect(rtw.querySelector("a")?.getAttribute("href")).toBe("/fahrzeug/fz-rtw");
    expect(rtw.textContent).toContain("RTW 11-83-1");
    expect(rtw.textContent).toContain("überfällig");
    expect(rtw.textContent).toContain("seit 7 Tagen fällig");
    expect(rtw.textContent).toContain("noch 800 km");
    expect(rtw.textContent).toContain("152.340 km");
    // Das MTF hat weder HU noch Service erfasst: die Zelle sagt es, statt leer zu bleiben.
    expect(query('[data-row-key="fz-mtf"]').textContent).toContain("entfällt");
  });

  it("die Kacheln zählen und filtern nach dem Gesamtstand; ein zweiter Klick hebt den Filter auf", async () => {
    await zeige([volleAkte(), ruhigeAkte()]);
    expect(kachel("ueberfaellig").textContent).toContain("1");
    expect(kachel("bald").textContent).toContain("0");
    expect(kachel("ok").getAttribute("aria-pressed")).toBe("false");

    await click('button[data-stufe="ok"]');
    expect(kachel("ok").getAttribute("aria-pressed")).toBe("true");
    expect(kachel("ok").textContent).toContain("Filter aktiv");
    expect(zeilen()).toEqual(["fz-mtf"]);

    await click('button[data-stufe="ok"]');
    expect(zeilen()).toEqual(["fz-rtw", "fz-mtf"]);
  });

  it("ein Filter ohne Treffer sagt das in einem Satz", async () => {
    await zeige([volleAkte(), ruhigeAkte()]);
    await click('button[data-stufe="bald"]');
    expect(zeilen()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Fahrzeug passt zu diesem Filter.");
  });

  it("ohne Fahrzeuge steht der Leerzustand da, kein Filtertext", async () => {
    await zeige([]);
    expect(document.body.textContent).toContain("Noch keine Fahrzeuge");
    expect(document.body.textContent).not.toContain("Kein Fahrzeug passt zu diesem Filter.");
  });

  it("eine Akte ohne Reifensatz steht als nicht erfasst da, ein Anhänger ohne Kilometer", async () => {
    await zeige([leereAkte({ art: "anhaenger", typ: "Anhänger Betreuung", funkkenner: null, funkrufname: "Anhänger Betreuung Uelzen" })]);
    const zeile = query('[data-row-key="fz-neu"]');
    expect(zeile.textContent).toContain("Anhänger Betreuung Uelzen");
    expect(zeile.textContent).toContain("nicht erfasst");
    expect(zeile.textContent).not.toContain("km");
  });
});
