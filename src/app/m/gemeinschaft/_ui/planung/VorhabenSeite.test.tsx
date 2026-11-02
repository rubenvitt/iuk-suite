// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { clickElement, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { VorhabenDetailDTO } from "../../_lib/vorhabenTypen";
import { zeitpunkt } from "../../_lib/zeit";
import { VorhabenSeite } from "./VorhabenSeite";

const aktion = vi.hoisted(() => ({
  erledigt: vi.fn(), anlegen: vi.fn(), loeschen: vi.fn(), zustaendig: vi.fn(), verantwortlich: vi.fn(), aufgabeWeg: vi.fn(), speichern: vi.fn(),
}));
vi.mock("../../_actions/vorhaben", () => ({
  aufgabeErledigtAction: aktion.erledigt, aufgabeAnlegenAction: aktion.anlegen, vorhabenLoeschenAction: aktion.loeschen,
  zustaendigeSetzenAction: aktion.zustaendig, verantwortlichSetzenAction: aktion.verantwortlich, aufgabeLoeschenAction: aktion.aufgabeWeg,
  vorhabenSpeichernAction: aktion.speichern,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const MITGLIEDER = [{ id: "jonas", name: "Jonas Albers" }, { id: "nele", name: "Nele Vogt" }];
const PROJEKT: VorhabenDetailDTO = {
  id: "p1", art: "projekt", titel: "Weihnachtsmarkt-Stand", beschreibung: "Glühwein- und Waffelstand.", verantwortlich: MITGLIEDER[0], verantwortlichId: "jonas",
  von: null, bis: null, ort: "", barBelegen: false, ziel: "2026-11-29", projekt: null, projektId: null, events: 1, aufgaben: 2, erledigt: 1, ohneZustaendige: 0, vorbei: false,
  aufgabenListe: [
    { id: "a1", titel: "Glühwein bestellen", faellig: "2026-11-06", erledigt: false, zustaendig: ["nele"] },
    { id: "a2", titel: "Standplatz anmelden", faellig: "2026-10-26", erledigt: true, zustaendig: ["jonas"] },
  ],
  eventKarten: [{
    id: "e1", art: "event", titel: "Weihnachtsmarkt – Samstag", verantwortlich: MITGLIEDER[0], von: zeitpunkt("2026-11-28", "14:00"), bis: zeitpunkt("2026-11-28", "21:00"),
    ort: "Marktplatz", barBelegen: false, ziel: null, projekt: { id: "p1", titel: "Weihnachtsmarkt-Stand" }, events: 0, aufgaben: 1, erledigt: 0, ohneZustaendige: 1, vorbei: false,
  }],
};

async function zeige(v = PROJEKT) {
  await mount(<App><VorhabenSeite v={v} heute="2026-11-01" daten={{ mitglieder: MITGLIEDER, projekte: [{ id: "p1", titel: "Weihnachtsmarkt-Stand" }], bar: [] }} /></App>);
}
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === text)!;

afterEach(async () => { await unmount(); Object.values(aktion).forEach((f) => f.mockReset()); });

describe("Seite eines Projekts", () => {
  it("zeigt Fakten, Aufgaben mit Fälligkeit, „Wer macht mit“ und die Events", async () => {
    await zeige();
    const text = document.body.textContent!;
    expect(text).toContain("So, 29. November 2026");
    expect(text).toContain("1 von 2 erledigt");
    expect(text).toContain("fällig Fr, 6. Nov.");
    expect(text).toContain("war fällig 26. Okt.");
    expect(text).toContain("verantwortlich · Standplatz anmelden");
    expect(query("[data-vorhaben='e1']").getAttribute("href")).toBe("/v/e1");
    expect(query("[data-vorhaben='e1']").textContent).toContain("1 ohne Zuständige");
  });

  it("hakt eine Aufgabe ab: sofort sichtbar, Action mit Vorhaben und Aufgabe", async () => {
    let loese: (r: unknown) => void = () => {};
    aktion.erledigt.mockImplementation(() => new Promise((r) => { loese = r; }));
    await zeige();
    const haken = query<HTMLInputElement>("input[aria-label='„Glühwein bestellen“ erledigt']");
    await clickElement(haken);
    expect(aktion.erledigt).toHaveBeenCalledWith("p1", "a1", true);
    expect(query("[data-zaehler='aufgaben']").textContent).toBe("2 von 2 erledigt");
    await act(async () => { loese({ ok: true }); });
  });

  it("legt eine Aufgabe an und leert danach das Feld", async () => {
    aktion.anlegen.mockResolvedValue({ ok: true, wert: "a3" });
    await zeige();
    expect(knopf("Hinzufügen").disabled).toBe(true);
    await fill("input[aria-label='Neue Aufgabe']", "Deko holen");
    await clickElement(knopf("Hinzufügen"));
    await act(async () => {});
    expect(aktion.anlegen).toHaveBeenCalledWith("p1", { titel: "Deko holen", zustaendig: [], faellig: null });
    expect(query<HTMLInputElement>("input[aria-label='Neue Aufgabe']").value).toBe("");
  });

  it("ein leeres Projekt zeigt nur die Leerzustände, ohne Bedienhinweis", async () => {
    await zeige({ ...PROJEKT, aufgabenListe: [], eventKarten: [], verantwortlichId: null, verantwortlich: null });
    const text = document.body.textContent!;
    expect(text).toContain("Noch keine Aufgaben.");
    expect(text).toContain("Noch niemand eingeteilt.");
    expect(text).toContain("Noch keine Events.");
    expect(text).not.toContain("Leg unten");
  });
});
