// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { MeineSeiteDaten } from "../../_lib/meinLink";

const aktion = vi.hoisted(() => ({ erledigt: vi.fn(), abgeben: vi.fn(), uebernehmen: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../_actions/mein", () => ({
  meineAufgabeErledigtAction: aktion.erledigt, meineAufgabeAbgebenAction: aktion.abgeben, aufgabeUebernehmenAction: aktion.uebernehmen,
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { MeineSeite } from "./MeineSeite";

const LINK = "AbCdEfGhIjKlMnOpQrStUv";
const DATEN: MeineSeiteDaten = {
  vorname: "Jonas",
  verantwortlich: ["Weihnachtsmarkt-Stand"],
  offen: [{ id: "a1", titel: "Aufbau Stand", vorhaben: "Weihnachtsmarkt – Samstag", wann: "Sa, 28. Nov., 14:00 Uhr", dringend: false }],
  erledigt: [{ id: "a2", titel: "Standplatz anmelden", vorhaben: "Weihnachtsmarkt-Stand", wann: null, dringend: false }],
  gebraucht: [{ id: "a3", titel: "Snacks besorgen", vorhaben: "Spieleabend", wann: "fällig heute", dringend: true }],
  termine: [{ id: "v1", titel: "Spieleabend", monat: "Nov.", tag: "12", wochentag: "Do", zeit: "19:00–22:00 Uhr", ort: "Bar", dabei: true }],
};

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text)!;

beforeEach(() => {
  for (const f of Object.values(aktion)) f.mockReset().mockResolvedValue({ ok: true });
  router.refresh.mockReset();
});
afterEach(async () => { await unmount(); });

describe("MeineSeite", () => {
  it("zeigt Begrüßung, Verantwortung, Aufgaben, offene Stellen und Termine", async () => {
    await mount(<MeineSeite link={LINK} daten={DATEN} />);
    const text = document.body.textContent ?? "";
    expect(query("h1").textContent).toBe("Hallo Jonas");
    expect(text).toContain("Du bist verantwortlich für Weihnachtsmarkt-Stand.");
    expect(text).toContain("Weihnachtsmarkt – Samstag · Sa, 28. Nov., 14:00 Uhr");
    expect(text).toContain("Du bist dabei");
    expect(text).not.toContain("Standplatz anmelden"); // Erledigte erst nach Aufklappen
  });

  it("Haken, „Schaffe ich doch nicht“ und „Ich mach’s“ schicken Link und Aufgabe an die Action", async () => {
    await mount(<MeineSeite link={LINK} daten={DATEN} />);
    await clickElement(knopf("„Aufbau Stand“ erledigt"));
    await abwarten();
    expect(aktion.erledigt).toHaveBeenCalledWith(LINK, "a1", true);
    await clickElement(knopf("Schaffe ich doch nicht"));
    await abwarten();
    expect(aktion.abgeben).toHaveBeenCalledWith(LINK, "a1");
    await clickElement(knopf("„Snacks besorgen“ übernehmen: Ich mach’s"));
    await abwarten();
    expect(aktion.uebernehmen).toHaveBeenCalledWith(LINK, "a3");
  });

  it("Erledigte aufklappen und wieder öffnen", async () => {
    await mount(<MeineSeite link={LINK} daten={DATEN} />);
    const auf = knopf("Erledigt (1) anzeigen");
    expect(auf.getAttribute("aria-expanded")).toBe("false");
    await clickElement(auf);
    expect(document.body.textContent).toContain("Standplatz anmelden");
    await clickElement(knopf("„Standplatz anmelden“ wieder offen"));
    await abwarten();
    expect(aktion.erledigt).toHaveBeenCalledWith(LINK, "a2", false);
    await clickElement(knopf("Erledigte ausblenden"));
    expect(document.body.textContent).not.toContain("Standplatz anmelden");
  });

  it("eine Ablehnung steht an der Aufgabe; ein ungültiger Link lädt die Seite neu", async () => {
    aktion.uebernehmen.mockResolvedValue({ ok: false, fehler: "Da war schon jemand schneller. Danke trotzdem!" });
    await mount(<MeineSeite link={LINK} daten={DATEN} />);
    await clickElement(knopf("„Snacks besorgen“ übernehmen: Ich mach’s"));
    await abwarten();
    expect(query('[role="alert"]').textContent).toBe("Da war schon jemand schneller. Danke trotzdem!");
    expect(router.refresh).not.toHaveBeenCalled();
    aktion.erledigt.mockResolvedValue({ ok: false, fehler: "Dieser Link gilt nicht mehr.", linkUngueltig: true });
    await clickElement(knopf("„Aufbau Stand“ erledigt"));
    await abwarten();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("leere Listen haben einen Satz", async () => {
    await mount(<MeineSeite link={LINK} daten={{ ...DATEN, verantwortlich: [], offen: [], erledigt: [], gebraucht: [], termine: [] }} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Gerade nichts offen. Danke!");
    expect(text).toContain("Alles verteilt.");
    expect(text).toContain("Gerade steht kein Termin an.");
    expect(text).not.toContain("verantwortlich für");
  });
});
