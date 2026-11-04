// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

import { Filterchips, type Filteroption } from "./Filterchips";

const CSS = readFileSync(join(__dirname, "filterchips.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type W = "alle" | "offen" | "erledigt";
const OPTIONEN: Filteroption<W>[] = [
  { wert: "alle", label: "Alle", anzahl: 12 },
  { wert: "offen", label: "Offen", anzahl: 3 },
  { wert: "erledigt", label: "Erledigt" },
];

function Einfach() {
  const [wert, setWert] = useState<W>("alle");
  return <Filterchips aria-label="Zustand" optionen={OPTIONEN} wert={wert} onChange={setWert} />;
}
function Mehrfach() {
  const [werte, setWerte] = useState<W[]>([]);
  return <Filterchips mehrfach aria-label="Zustand" optionen={OPTIONEN} werte={werte} onChange={setWerte} />;
}

async function taste(el: HTMLElement, key: string) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

afterEach(unmount);

describe("Filterchips — Einfachwahl", () => {
  it("ist eine radiogroup mit genau einem Tabstopp auf der Wahl", async () => {
    await mount(<Einfach />);
    expect(query("[role=radiogroup]").getAttribute("aria-label")).toBe("Zustand");
    const radios = queryAll("[role=radio]");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it("zeigt die Zahl, wo eine steht", async () => {
    await mount(<Einfach />);
    expect(queryAll("[role=radio]").map((r) => r.textContent)).toEqual(["Alle 12", "Offen 3", "Erledigt"]);
  });

  it("wählt per Klick und per Pfeiltaste, Pos1 und Ende", async () => {
    await mount(<Einfach />);
    await clickElement(queryAll("[role=radio]")[1]);
    expect(query("[aria-checked=true]").dataset.wert).toBe("offen");
    await taste(query("[aria-checked=true]"), "ArrowRight");
    expect(query("[aria-checked=true]").dataset.wert).toBe("erledigt");
    expect(document.activeElement?.getAttribute("data-wert")).toBe("erledigt");
    await taste(query("[aria-checked=true]"), "ArrowRight");
    expect(query("[aria-checked=true]").dataset.wert).toBe("alle");
    await taste(query("[aria-checked=true]"), "End");
    expect(query("[aria-checked=true]").dataset.wert).toBe("erledigt");
    await taste(query("[aria-checked=true]"), "Home");
    expect(query("[aria-checked=true]").dataset.wert).toBe("alle");
    expect(queryAll("[role=radio]").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it("zeigt ohne Wahl keine gewählte Pille, hält den Tabstopp aber auf der ersten", async () => {
    await mount(<Filterchips<W> aria-label="Zustand" optionen={OPTIONEN} wert={null} onChange={() => {}} />);
    expect(queryAll("[role=radio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "false"]);
    expect(queryAll("[role=radio]").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });
});

describe("Filterchips — Mehrfachwahl", () => {
  it("ist eine group aus Umschaltknöpfen, alle im Tabzyklus", async () => {
    await mount(<Mehrfach />);
    expect(query("[role=group]")).toBeTruthy();
    const knoepfe = queryAll("button");
    expect(knoepfe.map((k) => k.getAttribute("aria-pressed"))).toEqual(["false", "false", "false"]);
    expect(knoepfe.every((k) => k.tabIndex === 0)).toBe(true);
    expect(knoepfe.some((k) => k.hasAttribute("role"))).toBe(false);
  });

  it("schaltet an und wieder aus", async () => {
    await mount(<Mehrfach />);
    await clickElement(queryAll("button")[1]);
    await clickElement(queryAll("button")[2]);
    expect(queryAll("button").map((k) => k.getAttribute("aria-pressed"))).toEqual(["false", "true", "true"]);
    await clickElement(queryAll("button")[1]);
    expect(queryAll("button").map((k) => k.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
  });
});

describe("Filterchips — Regeln", () => {
  it("hält die Tippfläche auf 44px (Arbeitsdichte)", () => {
    expect(CSS).toMatch(/\.knopf \{[^}]*min-block-size: 44px/);
  });

  it("scrollt am Telefon in sich statt umzubrechen", () => {
    expect(CSS).toMatch(/@media \(max-width: 767\.98px\) \{\s*\.reihe \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto/);
  });

  it("nennt keine antd-Variable, keine antd-Klasse und kein Rot", () => {
    expect(CSS).not.toMatch(/--ant-|\.ant-|--iuk-marke/);
  });

  it("nimmt die Bewegung bei reduzierter Bewegung zurück", () => {
    expect(CSS).toMatch(/prefers-reduced-motion: reduce/);
  });
});
