// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { TESTEINSAETZE, TESTVERSIEGELT } from "../testvektoren/einsaetze";
import { Einsatzdetail } from "./Einsatzdetail";

afterEach(unmount);

const ZONE = "Europe/Berlin";
const blockFuer = (i: number) => ({ nummer: i + 1, hash: "d".repeat(64), prev: "e".repeat(64), versiegelt: TESTVERSIEGELT[i] });

/** `<dt>`-Beschriftung → Text des zugehörigen `<dd>`. */
function wert(beschriftung: string): string | null {
  const dt = queryAll("dt").find((d) => d.textContent === beschriftung);
  return dt?.nextElementSibling?.textContent ?? null;
}

describe("Einsatzdetail", () => {
  it("doppelte Kennungen (selbst gebaute Datei): jede Zeile bleibt, React warnt nicht", async () => {
    const e = TESTEINSAETZE[2];
    const doppelt = { ...e, fahrzeuge: [e.fahrzeuge[0], e.fahrzeuge[0]], personal: [e.personal[0], e.personal[0]] };
    const konsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await mount(<Einsatzdetail block={blockFuer(2)} einsatz={doppelt} zeitzone={ZONE} dritteKennzahl="gesamt" mitDauerzeile objektImmer />);
      expect(queryAll("[data-fahrzeug]").length).toBe(2);
      expect(queryAll("[data-person]").length).toBe(2);
      expect(konsole).not.toHaveBeenCalled();
    } finally {
      konsole.mockRestore();
    }
  });

  it("offenes Ende: „nicht angegeben“ und Dauer „—“", async () => {
    await mount(<Einsatzdetail block={blockFuer(1)} einsatz={TESTEINSAETZE[1]} zeitzone={ZONE} dritteKennzahl="gesamt" mitDauerzeile objektImmer />);
    expect(wert("Beginn")).toBe("29.8.2026, 13:00 Uhr");
    expect(wert("Ende")).toBe("nicht angegeben");
    expect(wert("Dauer")).toBe("—");
    expect(query("h2").textContent).toBe("SanD");
    expect(query("[data-objekt]").textContent).toBe("Stadtfest, ca. 2.500 Besucher");
    expect(exists("[data-notizen]")).toBe(true);
  });

  it("Kopf, Kennzahlen, Listen, Notizen und Hash-Box", async () => {
    await mount(
      <Einsatzdetail
        block={blockFuer(2)} einsatz={TESTEINSAETZE[2]} zeitzone={ZONE}
        dritteKennzahl="gesamt" mitDauerzeile={false} objektImmer={false}
        kopfRechts={<button type="button">PDF erzeugen</button>}
        aktionen={<span data-aktion>Aktion</span>}
      />,
    );
    expect(query("[data-kicker]").textContent).toBe("Block 3 · 2026-043");
    expect(query("[data-kopf]").textContent).toContain("PDF erzeugen");
    expect(exists("[data-aktion]")).toBe(true);
    expect(query("[data-ort]").textContent).toBe("B4, Abfahrt Uelzen-Nord, 29525 Uelzen");
    expect(wert("Vor Ort")).toBe("7");
    expect(wert("Transport")).toBe("3");
    expect(wert("Gesamt")).toBe("10");
    expect(wert("Dauer")).toBeNull();
    expect(wert("Ende")).toBe("23.9.2026, 21:05 Uhr");
    const text = query("section").textContent ?? "";
    expect(text).toContain("Fahrzeuge · 2");
    expect(text).toContain("Personal · 2");
    expect(queryAll("[data-fahrzeug]").map((f) => f.textContent)).toEqual(["ELW 1Rotkreuz Uelzen 11-11-1", "GW-SanRotkreuz Uelzen 11-64-1"]);
    expect(queryAll("[data-person]").map((p) => p.textContent)).toEqual(["Albers, JanaZF", "Meyer, HannaBtH"]);
    expect(query("[data-notizen]").textContent).toBe(TESTEINSAETZE[2].notizen);
    expect(query("[data-notizen]").textContent).toContain("\n");
    expect(wert("Fingerabdruck")).toBe("d".repeat(64));
    expect(wert("Vorgänger")).toBe("e".repeat(64));
    expect(wert("Versiegelt")).toBe("23.9.2026, 21:08 Uhr");
  });

  it("dritte Kennzahl „Dauer“ statt „Gesamt“", async () => {
    await mount(<Einsatzdetail block={blockFuer(2)} einsatz={TESTEINSAETZE[2]} zeitzone={ZONE} dritteKennzahl="dauer" mitDauerzeile={false} objektImmer={false} />);
    expect(wert("Gesamt")).toBeNull();
    expect(wert("Dauer")).toBe("2 h 23 min");
  });

  it("leeres Objekt: bei objektImmer „—“, sonst weggelassen; ohne Notizen kein Notizblock", async () => {
    await mount(<Einsatzdetail block={blockFuer(0)} einsatz={TESTEINSAETZE[0]} zeitzone={ZONE} dritteKennzahl="gesamt" mitDauerzeile objektImmer />);
    expect(query("[data-objekt]").textContent).toBe("—");
    expect(exists("[data-notizen]")).toBe(false);
    expect(wert("Dauer")).toBe("1 h 28 min");
    await unmount();
    await mount(<Einsatzdetail block={blockFuer(0)} einsatz={TESTEINSAETZE[0]} zeitzone={ZONE} dritteKennzahl="gesamt" mitDauerzeile objektImmer={false} />);
    expect(exists("[data-objekt]")).toBe(false);
  });
});
