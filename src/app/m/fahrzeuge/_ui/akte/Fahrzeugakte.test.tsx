// @vitest-environment jsdom
import { act } from "react";
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, existsPortal, fillElement, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

const aktionen = vi.hoisted(() => ({
  technikSpeichernAction: vi.fn(), kilometerEintragenAction: vi.fn(), pruefungSpeichernAction: vi.fn(), pruefungErledigtAction: vi.fn(),
  pruefungEntfernenAction: vi.fn(), reifensatzSpeichernAction: vi.fn(), reifensatzEntfernenAction: vi.fn(), reifenwechselAction: vi.fn(),
}));
vi.mock("../../_actions/akte", () => aktionen);

import { Fahrzeugakte } from "./Fahrzeugakte";
import { HEUTE, leereAkte, volleAkte } from "./fixtures";
import type { AkteMitStand } from "../../_lib/akte/typen";
import type { AkteVerweise } from "../../_lib/akte/verweise";

const VERWEISE: AkteVerweise = {
  lagerbuch: { href: "https://lagerbuch.example/verwaltung/fahrzeuge/ort-7", genau: true },
  funk: { href: "https://funk.example", genau: false },
};

beforeEach(() => { for (const f of Object.values(aktionen)) f.mockReset().mockResolvedValue({ ok: true }); });
afterEach(async () => { await unmount(); });

const zeige = (eintrag: AkteMitStand, darfVerwalten: boolean, verweise: AkteVerweise = VERWEISE) =>
  mount(<App><Fahrzeugakte eintrag={eintrag} darfVerwalten={darfVerwalten} heute={HEUTE} verweise={verweise} /></App>);

const knoepfe = () => queryAll<HTMLButtonElement>("button").map((b) => (b.textContent ?? "").trim() || b.getAttribute("aria-label") || "");
const knopf = (text: string) => {
  const b = queryAll<HTMLButtonElement>("button").find((x) => (x.textContent ?? "").trim() === text);
  if (!b) throw new Error(`Knopf nicht gefunden: ${text}`);
  return b;
};
const karte = (name: string) => query(`[data-karte="${name}"]`);
const dialogKnopf = (text: string) => {
  const b = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".ant-modal button, .ant-drawer button")).find((x) => (x.textContent ?? "").trim() === text);
  if (!b) throw new Error(`Knopf im Dialog nicht gefunden: ${text}`);
  return b;
};
const warte = () => act(async () => {});

describe("Fahrzeugakte: lesen", () => {
  it("zeigt Kopf, Termine, Reifen, Technik und Kilometer", async () => {
    await zeige(volleAkte(), false);
    expect(query("h1").textContent).toBe("Rotkreuz Uelzen 11-83-1");
    expect(query('[data-testid="seitenkopf-zurueck"]').getAttribute("href")).toBe("/tafel");
    expect(query('[data-testid="seitenkopf-beschreibung"]').textContent).toContain("RTW · Mercedes Sprinter 519, Baujahr 2016 · UE-RK 1101 · Standort Uelzen");

    const termine = karte("pruefungen").textContent ?? "";
    expect(termine).toContain("HU (TÜV)");
    expect(termine).toContain("alle 24 Monate");
    expect(termine).toContain("seit 7 Tagen fällig");
    expect(termine).toContain("alle 12 Monate oder 20.000 km");
    expect(termine).toContain("bei 133.140 km");
    expect(termine).toContain("oder bei 153.140 km");

    const reifen = karte("reifen").textContent ?? "";
    expect(reifen).toContain("Aufgezogen");
    expect(reifen).toContain("Winterreifen");
    expect(reifen).toContain("DOT 3822 · 4 Jahre");
    expect(reifen).toContain("Eingelagert");
    expect(reifen).toContain("DOT 1423 · 3 Jahre");
    expect(reifen).not.toContain("Tempo-100");

    const technik = karte("technik").textContent ?? "";
    expect(technik).toContain("6,95 × 2,30 × 2,85 m");
    expect(technik).toContain("5.000 kg");
    expect(technik).toContain("880 kg");
    expect(technik).toContain("0 / 1 / 1 / 2");
    expect(technik).toContain("Klasse C1");
    expect(karte("km").textContent).toContain("152.340 km");
    expect(karte("km").textContent).toContain("abgelesen am 10.11.2026");
  });

  it("ohne Verwaltungsrecht steht kein ändernder Knopf da", async () => {
    await zeige(volleAkte(), false);
    expect(knoepfe()).toEqual([]);
    await unmount();
    await zeige(leereAkte(), false);
    expect(knoepfe()).toEqual([]);
  });

  it("mit Verwaltungsrecht stehen die Handgriffe an Kopf, Zeile und Karte", async () => {
    await zeige(volleAkte(), true);
    const alle = knoepfe();
    for (const text of ["Kilometerstand eintragen", "Technische Daten bearbeiten", "Erledigt", "Prüfung hinzufügen", "Reifenwechsel eintragen", "Reifensatz hinzufügen"]) {
      expect(alle).toContain(text);
    }
    expect(alle).toContain("Aktionen für HU (TÜV)");
    expect(alle).toContain("Aktionen für Winterreifen");
  });

  it("Beladung und Funkgeräte zeigen nur in ihre App: genau aufs Fahrzeug oder nur zur App, ohne Adresse gar kein Link", async () => {
    await zeige(volleAkte(), false);
    const links = queryAll<HTMLAnchorElement>('[data-karte="verweis"] a');
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Im Lagerbuch öffnen", "https://lagerbuch.example/verwaltung/fahrzeuge/ort-7"],
      ["Zu den Funkgeräten", "https://funk.example"],
    ]);
    await unmount();
    await zeige(volleAkte(), false, { lagerbuch: null, funk: null });
    expect(queryAll('[data-karte="verweis"]').length).toBe(2);
    expect(queryAll('[data-karte="verweis"] a')).toEqual([]);
  });
});

describe("Fahrzeugakte: leer", () => {
  it("jede Karte nennt den nächsten Handgriff", async () => {
    await zeige(leereAkte(), true);
    expect(karte("pruefungen").textContent).toContain("Noch keine Prüfungen erfasst.");
    expect(karte("reifen").textContent).toContain("Noch kein Reifensatz erfasst.");
    expect(karte("technik").textContent).toContain("Noch keine technischen Daten erfasst.");
    expect(karte("km").textContent).toContain("Noch kein Kilometerstand abgelesen.");
    const alle = knoepfe();
    for (const text of ["Prüfung hinzufügen", "Reifensatz hinzufügen", "Technische Daten eintragen"]) expect(alle).toContain(text);
    expect(alle).not.toContain("Reifenwechsel eintragen");
    expect(alle).not.toContain("Erledigt");
  });

  it("ein Anhänger führt keine Kilometer", async () => {
    await zeige(leereAkte({ art: "anhaenger" }), true);
    expect(queryAll('[data-karte="km"]')).toEqual([]);
    expect(knoepfe()).not.toContain("Kilometerstand eintragen");
  });

  it("eine neue Prüfung beginnt bei der HU und geht mit Art und Abstand an die Action", async () => {
    await zeige(leereAkte(), true);
    await clickElement(knopf("Prüfung hinzufügen"));
    expect(queryPortal<HTMLInputElement>("#fz-pruefung-name").value).toBe("HU (TÜV)");
    await clickElement(dialogKnopf("Hinzufügen"));
    await warte();
    expect(aktionen.pruefungSpeichernAction).toHaveBeenCalledWith("fz-neu", null, { art: "HU", name: "HU (TÜV)", monate: 24, kmAbstand: null, zuletzt: null, vonHand: null });
    expect(existsPortal("#fz-pruefung-name")).toBe(false);
  });
});

describe("Fahrzeugakte: Dialoge", () => {
  it("„Erledigt“ trägt heute, den Kilometerstand der Akte und die Bemerkung ein", async () => {
    await zeige(volleAkte(), true);
    // Die erste Zeile ist die HU; jede Zeile trägt ihren eigenen Knopf.
    await clickElement(query('[data-row-key="p-hu"]').querySelector<HTMLButtonElement>('[data-rolle="zeilenaktionen"] button')!);
    expect(queryPortal(".ant-modal-title").textContent).toBe("HU (TÜV) erledigt eintragen");
    expect(queryPortal(".ant-modal").textContent).toContain("24 Monate nach dem Prüfdatum, also etwa 12.11.2028");
    await fillElement(queryPortal<HTMLTextAreaElement>("#fz-erledigt-bemerkung"), "ohne Mängel");
    await clickElement(dialogKnopf("Eintragen"));
    await warte();
    expect(aktionen.pruefungErledigtAction).toHaveBeenCalledTimes(1);
    expect(aktionen.pruefungErledigtAction).toHaveBeenCalledWith("p-hu", { am: HEUTE, km: 152340, vonHand: null, bemerkung: "ohne Mängel" });
    expect(existsPortal("#fz-erledigt-bemerkung")).toBe(false);
  });

  it("ein Fehler der Action bleibt am Feld stehen, der Dialog bleibt offen", async () => {
    aktionen.pruefungErledigtAction.mockResolvedValue({ ok: false, fehler: "Bitte prüfe die Angaben.", feldFehler: { km: "Der Stand liegt unter dem letzten." } });
    await zeige(volleAkte(), true);
    await clickElement(query('[data-row-key="p-service"]').querySelector<HTMLButtonElement>('[data-rolle="zeilenaktionen"] button')!);
    await clickElement(dialogKnopf("Eintragen"));
    await warte();
    expect(queryPortal(".ant-modal").textContent).toContain("Der Stand liegt unter dem letzten.");
    expect(existsPortal("#fz-erledigt-km")).toBe(true);
  });

  it("der Kilometerstand geht als Zahl hinaus; ein leeres Feld meldet sich, ohne zu speichern", async () => {
    await zeige(volleAkte(), true);
    await clickElement(knopf("Kilometerstand eintragen"));
    expect(queryPortal(".ant-modal").textContent).toContain("Zuletzt 152.340 km am 10.11.2026.");
    await fillElement(queryPortal<HTMLInputElement>("#fz-km"), "");
    await clickElement(dialogKnopf("Speichern"));
    await warte();
    expect(aktionen.kilometerEintragenAction).not.toHaveBeenCalled();
    expect(queryPortal(".ant-modal").textContent).toContain("Gib den Kilometerstand an.");
    await fillElement(queryPortal<HTMLInputElement>("#fz-km"), "152400");
    await clickElement(dialogKnopf("Speichern"));
    await warte();
    expect(aktionen.kilometerEintragenAction).toHaveBeenCalledWith("fz-rtw", { km: 152400 });
  });

  it("der Reifenwechsel bietet den Satz an, der nicht drauf ist", async () => {
    await zeige(volleAkte(), true);
    await clickElement(knopf("Reifenwechsel eintragen"));
    expect(queryPortal(".ant-modal").textContent).toContain("Sommerreifen, DOT 1423");
    expect(queryPortal(".ant-modal").textContent).toContain("Der bisherige Satz (Winterreifen) gilt danach als eingelagert.");
    await clickElement(dialogKnopf("Speichern"));
    await warte();
    expect(aktionen.reifenwechselAction).toHaveBeenCalledWith("fz-rtw", { aufgezogen: "Sommer" });
  });

  it("technische Daten: Meter mit Komma werden Zentimeter, Unsinn bleibt am Feld", async () => {
    await zeige(volleAkte(), true);
    await clickElement(knopf("Technische Daten bearbeiten"));
    const laenge = queryPortal<HTMLInputElement>("#fz-technik-laengeCm");
    expect(laenge.value).toBe("6,95");
    expect(queryPortal('[data-rolle="zuladung"]').textContent).toBe("Zuladung: 880 kg (berechnet)");

    await fillElement(laenge, "sieben");
    await clickElement(dialogKnopf("Speichern"));
    await warte();
    expect(aktionen.technikSpeichernAction).not.toHaveBeenCalled();
    expect(queryPortal(".ant-drawer").textContent).toContain("Gib die Länge in Metern an, zum Beispiel 5,30.");

    await fillElement(laenge, "7,02");
    await clickElement(dialogKnopf("Speichern"));
    await warte();
    expect(aktionen.technikSpeichernAction).toHaveBeenCalledWith("fz-rtw", {
      modell: "Mercedes Sprinter 519", baujahr: 2016, laengeCm: 702, breiteCm: 230, hoeheCm: 285, zggKg: 5000, leerKg: 4120,
      staerke: [0, 1, 1], sitze: 4, tragen: 1, fuehrerschein: "C1", besonderheiten: ["Sondersignal", "Landstrom"],
    });
  });
});
