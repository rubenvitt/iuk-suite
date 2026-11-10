// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { BEISPIELE } from "../../_lib/beispiele";
import { leererPlan } from "../../_lib/plan/operationen";
import { TokenFlaeche } from "./TokenFlaeche";

afterEach(() => unmount());
const einsatz = BEISPIELE[0];
const zeige = (inhalt = einsatz.inhalt) =>
  mount(<TokenFlaeche inhalt={inhalt} symbole={{}} titel={einsatz.titel} schrift="Arimo" schriftKlasse="zs" />);
const wurzel = () => query(".kp-token-ansicht");
const radio = (name: string, gruppe: ParentNode) =>
  [...gruppe.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.closest("label")!.textContent === name)!;

describe("TokenFlaeche — Liste und Diagramm (IDA-390)", () => {
  it("ohne Wahl entscheidet CSS: beide Ansichten montiert, je Breite ein Umschalter", async () => {
    await zeige();
    expect(wurzel().getAttribute("data-tokenansicht")).toBe("auto");
    expect(queryAll(".kp-token-liste .kp-tl-zeile")).toHaveLength(6);
    expect(queryAll(".kp-token-diagramm [data-karte]")).toHaveLength(6);
    expect(queryAll('[aria-label="Ansicht"]')).toHaveLength(2);
    expect(radio("Liste", query(".kp-token-nur-schmal")).checked).toBe(true);
    expect(radio("Diagramm", query(".kp-token-nur-breit")).checked).toBe(true);
  });

  it("die Wahl gilt dann auf jeder Breite, mit einem Umschalter", async () => {
    await zeige();
    await clickElement(radio("Liste", query(".kp-token-nur-breit")));
    expect(wurzel().getAttribute("data-tokenansicht")).toBe("liste");
    expect(queryAll('[aria-label="Ansicht"]')).toHaveLength(1);
  });

  it("Liste: Reihenfolge wie die Gliederung, Nummern antippbar, Text im Telefonfeld bleibt Text", async () => {
    await zeige();
    const titel = queryAll(".kp-tl-titel").map((t) => t.textContent);
    expect(titel.slice(0, 3)).toEqual(["Leitstelle Uelzen", "Einsatzleitung", "EA 1 Notunterkunft 1. HEG"]);
    const lts = query('[data-stelle="lts"]');
    const links = [...lts.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("tel:058182266");
    expect(links).toContain("tel:058119222");
    expect(links.some((l) => l!.startsWith("mailto:"))).toBe(true);
    expect(links.some((l) => l!.includes("82284")), "Fax ohne Verweis").toBe(false);
    expect(query('[data-stelle="ea1"]').querySelectorAll('a[href^="tel:"]')).toHaveLength(0); // „EA NuK 1."
    expect(query('[data-stelle="el"]').textContent).toContain("Digitalfunk TMO · R_UE_1");
    expect(query('[data-stelle="ea1"] .kp-tl-einheiten').textContent).toContain("GW-Ver RK UE 40-74-1");
  });

  it("leerer Plan: ein Satz statt einer leeren Liste", async () => {
    await zeige(leererPlan());
    expect(query(".kp-token-liste").textContent).toBe("Dieser Plan hat noch keine Stellen.");
  });

  it("token.css: ohne Wahl am Telefon die Liste, ab 768 px das Diagramm; die Liste rollt in sich", () => {
    const css = readFileSync("src/app/m/kommplan/_ui/token/token.css", "utf8");
    const schmal = css.slice(css.indexOf("@media (max-width: 767.98px)"));
    const breit = css.slice(css.indexOf("@media (min-width: 768px)"), css.indexOf("@media (max-width: 767.98px)"));
    expect(schmal).toMatch(/\[data-tokenansicht="auto"\] \.kp-token-diagramm[^{]*\{ display: none; \}/);
    expect(breit).toMatch(/\[data-tokenansicht="auto"\] \.kp-token-liste[^{]*\{ display: none; \}/);
    expect(css).toMatch(/\.kp-token-liste \{[^}]*overflow-y: auto;/);
  });
});
