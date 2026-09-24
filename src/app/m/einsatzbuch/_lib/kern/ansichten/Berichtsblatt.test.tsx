// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import erwartetJson from "../testvektoren/erwartet.json";
import { TESTEINSAETZE } from "../testvektoren/einsaetze";
import { bericht } from "../bericht";
import type { Block } from "../format";
import { Berichtsblatt } from "./Berichtsblatt";

afterEach(unmount);

const bloecke = (erwartetJson as unknown as { bloecke: Block[] }).bloecke;
const EXTRA = { pruefung: "Kette intakt (geprüft im Reader)", quelle: "Einsatzbuch Reader, aus export.einsatzbuch", erzeugt: "24.9.2026", zeitzone: "Europe/Berlin" };
/** Derselbe Block als Test-Block — `bericht()` prüft keinen Hash, nur `umgebung` zählt. */
const testBlock: Block = { ...bloecke[2], kopf: { ...bloecke[2].kopf, umgebung: "test" } };

const blatt = () => query("[data-bericht]").textContent ?? "";

describe("Berichtsblatt", () => {
  it("Test-Block trägt „TESTDATEN“ im Kopf", async () => {
    await mount(<Berichtsblatt daten={bericht(testBlock, TESTEINSAETZE[2], EXTRA)} bereitschaft="DRK-Bereitschaft Uelzen" />);
    expect(query("header").textContent).toContain("TESTDATEN");
  });

  it("echter Block: kein „TESTDATEN“, Kopf, Raster, Tabellen, Siegel und Fuß", async () => {
    await mount(<Berichtsblatt daten={bericht(bloecke[2], TESTEINSAETZE[2], EXTRA)} bereitschaft="DRK-Bereitschaft Uelzen" />);
    const text = blatt();
    expect(text).not.toContain("TESTDATEN");
    const kopf = query("header").textContent ?? "";
    expect(kopf).toContain("EINSATZBUCH");
    expect(kopf).toContain("DRK-Bereitschaft Uelzen");
    expect(kopf).toContain("Einsatzbericht");
    expect(kopf).toContain("2026-043");
    expect(query("h1").textContent).toBe("MANV 10");
    expect(text).toContain("Objekt, Lage vor Ort");
    expect(text).toContain("2 h 23 min");
    expect(text).toContain("Patienten gesamt");
    expect(text).toContain("Fahrzeuge · 2");
    expect(queryAll("thead th").map((th) => th.textContent)).toEqual(["Typ", "Funkrufname", "Besatzung"]);
    expect(queryAll("tbody tr").length).toBe(2);
    expect(text).toContain("Eingesetztes Personal · 2");
    expect(text).toContain("Unverändert seit der Versiegelung");
    expect(text).toContain("3 · versiegelt 23.9.2026, 21:08 Uhr");
    expect(text).toContain(bloecke[2].hash);
    expect(text).toContain("Kette intakt (geprüft im Reader)");
    expect(query("footer").textContent).toContain("Erzeugt 24.9.2026 · Einsatzbuch Reader, aus export.einsatzbuch");
    expect(query("footer").textContent).toContain("Vertraulich — nur für den Dienstgebrauch");
    expect(query("[data-notizen]").textContent).toBe(TESTEINSAETZE[2].notizen);
  });

  it("leere Listen", async () => {
    const leer = { ...TESTEINSAETZE[0], fahrzeuge: [], personal: [], notizen: "" };
    await mount(<Berichtsblatt daten={bericht(bloecke[0], leer, EXTRA)} bereitschaft="DRK-Bereitschaft Uelzen" />);
    const text = blatt();
    expect(text).toContain("Keine Fahrzeuge angegeben.");
    expect(text).toContain("Kein Personal angegeben.");
    expect(text).toContain("Vertraulich — nur für den Dienstgebrauch");
    expect(text).toContain("DRK-Bereitschaft Uelzen");
    expect(queryAll("table").length).toBe(0);
    expect(text).not.toContain("Notizen");
  });
});
