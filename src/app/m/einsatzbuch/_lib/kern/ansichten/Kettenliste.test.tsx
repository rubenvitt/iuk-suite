// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { Kettenliste } from "./Kettenliste";
import type { Listeneintrag } from "./modell";

afterEach(unmount);

const h = (c: string) => c.repeat(64);

const eintraege: Listeneintrag[] = [
  {
    block: 3, nummer: "2026-043", stichwort: "MANV 10", ort: "B4, Abfahrt Uelzen-Nord, 29525 Uelzen",
    versiegelt: "23.9.2026, 21:08 Uhr", hash: h("c"), prev: h("b"), knoten: "neutral",
    meta: "2 Fahrzeuge · 2 Kräfte · 10 Patienten",
  },
  {
    block: 2, nummer: null, stichwort: null, ort: null,
    versiegelt: "29.8.2026, 19:33 Uhr", hash: h("b"), prev: h("a"), knoten: "gebrochen",
    fehler: "Block 2 lässt sich nicht öffnen",
  },
  {
    block: 1, nummer: "2026-041", stichwort: "RD 2", ort: "Lindenstraße 8, 29525 Uelzen",
    versiegelt: "22.8.2026, 04:43 Uhr", hash: h("a"), prev: h("0"), knoten: "geprueft",
  },
];

describe("Kettenliste", () => {
  it("rendert Einträge in gegebener Reihenfolge mit Kopf und Fuß", async () => {
    await mount(<Kettenliste eintraege={eintraege} gewaehlt={3} onWaehle={() => {}} kopfRechts="neueste oben" fuss={{ text: "Block 0 · Anfang der Kette" }} />);
    expect(query("section").getAttribute("aria-label")).toBe("Einsatzkette");
    expect(queryAll("ol > li button").map((b) => b.getAttribute("data-block"))).toEqual(["3", "2", "1"]);
    const kopf = query("[data-kopf]").textContent;
    expect(kopf).toContain("Einsatzkette");
    expect(kopf).toContain("neueste oben");
    expect(query("[data-fuss]").textContent).toBe("Block 0 · Anfang der Kette");
    const erste = query('button[data-block="3"]');
    expect(erste.getAttribute("aria-label")).toBe("Block 3, 2026-043, MANV 10");
    expect(erste.textContent).toContain("versiegelt 23.9.2026, 21:08 Uhr");
    expect(erste.textContent).toContain("2 Fahrzeuge · 2 Kräfte · 10 Patienten");
    expect(erste.textContent).toContain(`#cccccccc`);
    expect(erste.textContent).toContain(`#bbbbbbbb`);
  });

  it("onWaehle bekommt die Blocknummer, gewählte Zeile ist gedrückt", async () => {
    const onWaehle = vi.fn();
    await mount(<Kettenliste eintraege={eintraege} gewaehlt={1} onWaehle={onWaehle} fuss={{ text: "x" }} />);
    expect(query('button[data-block="1"]').getAttribute("aria-pressed")).toBe("true");
    expect(query('button[data-block="3"]').getAttribute("aria-pressed")).toBe("false");
    await click('button[data-block="3"]');
    expect(onWaehle).toHaveBeenCalledWith(3);
  });

  it("Knoten tragen ihren Zustand, gebrochener Knoten heißt gebrochen", async () => {
    await mount(<Kettenliste eintraege={eintraege} gewaehlt={null} onWaehle={() => {}} fuss={{ text: "x" }} />);
    expect(queryAll("[data-knoten]").map((k) => k.getAttribute("data-knoten"))).toEqual(["neutral", "gebrochen", "geprueft"]);
  });

  it("Eintrag mit Fehler zeigt den Fehlertext statt Stichwort", async () => {
    await mount(<Kettenliste eintraege={eintraege} gewaehlt={null} onWaehle={() => {}} fuss={{ text: "x" }} />);
    const zeile = query('button[data-block="2"]');
    expect(zeile.textContent).toContain("Block 2 lässt sich nicht öffnen");
    expect(zeile.getAttribute("aria-label")).toBe("Block 2, Block 2 lässt sich nicht öffnen");
  });

  it("gesperrter Eintrag zeigt Chiffretext statt Inhalt", async () => {
    const gesperrt: Listeneintrag = { ...eintraege[0], gesperrt: true, chiffre: "q7Hk2mZ0…" };
    await mount(<Kettenliste eintraege={[gesperrt]} gewaehlt={null} onWaehle={() => {}} fuss={{ text: "x" }} />);
    const zeile = query('button[data-block="3"]');
    expect(zeile.textContent).toContain("q7Hk2mZ0…");
    expect(zeile.textContent).not.toContain("MANV 10");
    expect(zeile.textContent).not.toContain("10 Patienten");
    expect(zeile.getAttribute("aria-label")).toBe("Block 3, verschlüsselt");
  });
});
