// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { Kachel } from "./Kachel";
import s from "./aufgaben.module.css";

afterEach(async () => {
  await unmount();
});

/*
 * KEIN VOLLSTAENDIGER TEST GEFORDERT (Brief Aufgabe 6) — Kachel hat keine
 * fachliche Logik, und ihre WIRKUNG (Kantenfarbe, kein Rot auf der Zahl)
 * prueft Playwright in Aufgabe 21 ueber `getComputedStyle`; jsdom wertet
 * keine Custom-Property-Farben aus einem CSS-Modul aus. Diese Handvoll
 * Zusicherungen lohnt trotzdem: dieselbe „undefined-Klasse"-Falle, die Chip
 * und Kachel in `lagerbuch` beide betrifft, gilt hier unveraendert fuer
 * `KANTE[ton]`.
 */
describe("Kachel", () => {
  it("rendert Zahl und Beschriftung", async () => {
    await mount(<Kachel zahl={7} beschriftung="ueberfaellig" />);
    const karte = query(".ant-card");
    expect(karte.textContent).toContain("7");
    expect(karte.textContent).toContain("ueberfaellig");
  });

  it.each([
    ["achtung", "kpiKanteAchtung"],
    ["ocker", "kpiKanteOcker"],
    ["ok", "kpiKanteOk"],
  ] as const)("Ton %s faerbt die Kante mit .%s — nie mit undefined", async (ton, klasse) => {
    await mount(<Kachel zahl={1} beschriftung="x" ton={ton} />);
    const kpi = query(`.${s.kpi}`);
    expect(kpi.className.split(" ")).toContain(s[klasse]);
    expect(kpi.className).not.toMatch(/undefined/);
  });

  it.each(["grau", "stahl"] as const)("Ton %s faerbt bewusst KEINE Kante (kein Ampelwert)", async (ton) => {
    await mount(<Kachel zahl={1} beschriftung="x" ton={ton} />);
    const kpi = query(`.${s.kpi}`);
    expect(kpi.className).not.toMatch(/undefined/);
    expect(kpi.className.trim()).toBe(s.kpi);
  });

  it("ohne ton bleibt die Kante transparent (kein Befund, keine Klasse)", async () => {
    await mount(<Kachel zahl={0} beschriftung="x" />);
    expect(query(`.${s.kpi}`).className.trim()).toBe(s.kpi);
  });

  it("verlinkt mit der aeuszeren Pfadform, traegt den Chevron und .kpiLink", async () => {
    await mount(<Kachel zahl={3} beschriftung="offen" href="/verteilen" />);
    const link = query<HTMLAnchorElement>("a");
    expect(link.getAttribute("href")).toBe("/verteilen");
    expect(link.className.split(" ")).toContain(s.kpiLink);
    expect(query("svg").getAttribute("data-zeichen")).toBe("chevron-rechts");
  });

  it("ohne href: kein <a>, kein Chevron", async () => {
    await mount(<Kachel zahl={3} beschriftung="offen" />);
    expect(queryAll("a")).toHaveLength(0);
    expect(queryAll("svg")).toHaveLength(0);
  });
});
