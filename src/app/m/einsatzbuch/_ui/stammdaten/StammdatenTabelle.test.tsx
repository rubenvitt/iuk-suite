// @vitest-environment jsdom
import { App } from "antd";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { FahrzeugDTO, PersonDTO } from "../../_lib/stammdaten/typen";

vi.mock("../../_actions/stammdaten", () => ({ aktivSetzenAction: vi.fn() }));

import { StammdatenTabelle } from "./StammdatenTabelle";

afterEach(unmount);

const PERSONAL: PersonDTO[] = ["Beispiel, Änne", "Muster, Paul", "Probe, Jörg"].map((name, i) => ({ id: `p${i}`, name, quali: "SAN", aktiv: true }));
const FAHRZEUGE: FahrzeugDTO[] = [
  { id: "f1", typ: "ELW", kennung: "ELW 1", ruf: "Rotkreuz Musterstadt 11/12-1", standort: "Wache", aktiv: true },
  { id: "f2", typ: "KTW", kennung: "KTW 2", ruf: "Rotkreuz Musterstadt 85-2", standort: "Wache", aktiv: false },
];

/** Die Karten der schmalen Darstellung — in jsdom stehen beide Darstellungen im DOM. */
const karten = () => queryAll("[data-karte-key]").map((k) => k.getAttribute("data-karte-key"));
const suche = async (text: string) => {
  await fillElement(query<HTMLInputElement>('input[type="search"]'), text);
  // `useEntprellt` lässt die Ableitung 200 ms nachlaufen.
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
};

describe("StammdatenTabelle — Suche (IDA-390)", () => {
  it("findet eine Person über das Suchfeld, Groß/Klein und Umlaute egal", async () => {
    await mount(<App><StammdatenTabelle art="personal" liste={PERSONAL} onBearbeiten={() => {}} /></App>);
    expect(query('input[type="search"]').getAttribute("aria-label")).toBe("Name suchen");
    expect(karten()).toEqual(["p0", "p1", "p2"]);
    await suche("ANNE");
    expect(karten()).toEqual(["p0"]);
    await suche("jörg probe");
    expect(karten()).toEqual(["p2"]);
    await suche("niemand");
    expect(karten()).toEqual([]);
    expect(document.body.textContent).toContain("Keine Person passt zu Suche und Filter.");
  });

  it("findet ein Fahrzeug über Kennung und Funkrufname", async () => {
    await mount(<App><StammdatenTabelle art="fahrzeuge" liste={FAHRZEUGE} onBearbeiten={() => {}} /></App>);
    await suche("85-2");
    expect(karten()).toEqual(["f2"]);
    await suche("elw");
    expect(karten()).toEqual(["f1"]);
  });

  // IDA-393: die beiden Aktionen liegen im Menü der Zeile — auf der Karte EIN Knopf statt zweier.
  it("legt die beiden Aktionen in ein Menü „Aktionen für …“", async () => {
    await mount(<App><StammdatenTabelle art="personal" liste={PERSONAL.slice(0, 1)} onBearbeiten={() => {}} /></App>);
    const knoepfe = queryAll("[data-karte-key] button");
    expect(knoepfe.map((b) => b.getAttribute("aria-label"))).toEqual(["Aktionen für Beispiel, Änne"]);
  });

  it("ohne Einträge kein Suchfeld", async () => {
    await mount(<App><StammdatenTabelle art="personal" liste={[]} onBearbeiten={() => {}} /></App>);
    expect(queryAll('input[type="search"]')).toHaveLength(0);
  });
});
