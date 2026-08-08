// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { Plakette } from "./Plakette";

afterEach(async () => { await unmount(); });

describe("Plakette", () => {
  it("nennt im aria-label Datum UND Status", async () => {
    // Der Bestand nennt nur das Datum; die Farbe traegt den Zustand allein.
    // Als role="img" mit unvollstaendigem Label ist die Komponente
    // alleinstehend unbrauchbar — der Verstosz liegt im Zusicherungsvertrag,
    // nicht am Bildschirm (dort steht heute ueberall ein Chip daneben).
    await mount(<Plakette verfall="2027-03" ampel="rot" statusText="abgelaufen" />);
    expect(query("svg").getAttribute("aria-label")).toBe("Verfall 03/27 — abgelaufen");
  });

  it("traegt role=img", async () => {
    await mount(<Plakette verfall="2027-03" ampel="gelb" statusText="läuft 03/27 ab" />);
    expect(query("svg").getAttribute("role")).toBe("img");
  });

  it("zeichnet zwoelf Monatsstriche und hebt genau einen hervor", async () => {
    await mount(<Plakette verfall="2027-03" ampel="gruen" statusText="bis 03/27" />);
    const striche = queryAll("svg line");
    expect(striche).toHaveLength(12);
    const dick = striche.filter((l) => Number(l.getAttribute("stroke-width")) > 2);
    expect(dick).toHaveLength(1);
    // Maerz ist Index 2 — der dritte Strich.
    expect(striche.indexOf(dick[0])).toBe(2);
  });

  it("begrenzt jede Koordinate auf drei Nachkommastellen fuer stabiles Hydrieren", async () => {
    // Node und Chromium duerfen die trigonometrischen Zwischenwerte in den
    // letzten Bits verschieden runden. Ungerundete SVG-Attribute erzeugten
    // deshalb im echten Browser `6.836413862476535` auf dem Server, aber
    // `6.836413862476537` im Client und damit eine Hydration-Abweichung.
    await mount(<Plakette verfall="2027-03" ampel="gruen" statusText="bis 03/27" />);
    const koordinaten = queryAll("svg line").flatMap((strich) => [
      strich.getAttribute("x1"),
      strich.getAttribute("y1"),
      strich.getAttribute("x2"),
      strich.getAttribute("y2"),
    ]);

    expect(koordinaten).toHaveLength(48);
    for (const wert of koordinaten) {
      expect(wert).toMatch(/^-?\d+(?:\.\d{1,3})?$/);
    }
  });

  it("setzt KEINEN festen Farbwert — alle Farben kommen aus --lb-*", async () => {
    await mount(<Plakette verfall="2027-03" ampel="rot" statusText="abgelaufen" />);
    const svg = query("svg").outerHTML;
    // Im Dunkelmodus bliebe die Plakette sonst eine weisze Scheibe.
    expect(svg).not.toMatch(/#fff\b|#ffffff/i);
    expect(svg).not.toMatch(/#C7CDD1/i);
    expect(svg).not.toMatch(/var\(--tinte\)|var\(--rot\)|var\(--gelb\)|var\(--ok\)/);
    expect(svg).toMatch(/var\(--lb-karte\)/);
    expect(svg).toMatch(/var\(--lb-ampel-rot-text\)/);
    expect(svg).toMatch(/var\(--lb-linie\)/);
  });

  it("benutzt keine --ant-*-Variable (die sieht eigenes Markup nicht)", async () => {
    // antd deklariert seine Variablen auf SEINER Scope-Klasse; ein SVG
    // auszerhalb eines antd-Baums sieht sie nicht, und der Fehler ist still.
    await mount(<Plakette verfall="2027-03" ampel="gruen" statusText="bis 03/27" />);
    expect(query("svg").outerHTML).not.toMatch(/var\(--ant-/);
  });
});

describe("Plakette: Ampel -> Variablenname", () => {
  it.each([
    ["rot", "--lb-ampel-rot-text"],
    ["gelb", "--lb-ampel-gelb-text"],
    ["gruen", "--lb-ampel-ok-text"],
  ] as const)("%s zeichnet mit %s", async (ampel, variable) => {
    // `gruen` -> `ok` ist die Namensfalle aus §5.17: ein direkt
    // interpoliertes `--lb-ampel-${ampel}-text` ergaebe
    // `--lb-ampel-gruen-text` — nicht deklariert, faellt auf `transparent`
    // zurueck und ist gueltiges CSS. Der Ring verschwaende einfach.
    await mount(<Plakette verfall="2027-03" ampel={ampel} statusText="x" />);
    expect(query("svg").outerHTML).toContain(variable);
  });
});
