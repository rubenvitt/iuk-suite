// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/m/portal/neuigkeiten/actions", () => ({
  ladeNeuigkeitenAction: vi.fn(),
  merkeNeuigkeitenGesehenAction: vi.fn(async () => undefined),
}));

import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { NeuigkeitenListe } from "@/app/m/portal/_ui/NeuigkeitenListe";
import type { Neuigkeit, NeuigkeitenApp } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { ladeNeuigkeitenAction, merkeNeuigkeitenGesehenAction } from "@/app/m/portal/neuigkeiten/actions";
import { absatz, hinweis, liste } from "@/app/m/portal/_lib/neuigkeiten/typen";

const NEUIGKEITEN: Neuigkeit[] = [
  {
    modul: "lagerbuch",
    modulTitel: "Lagerbuch",
    icon: "warehouse",
    slug: "checkliste-als-pdf",
    datum: "2026-08-16",
    titel: "Fahrzeug-Checklisten als PDF",
    inhalt: [absatz("Neben „Drucken“ steht jetzt „PDF“."), liste("Fach", "Geräte")],
  },
  {
    modul: "portal",
    modulTitel: "Portal",
    icon: "apps",
    slug: "von-allen-geraeten-abmelden",
    datum: "2026-08-14",
    titel: "Von allen Geräten abmelden",
    inhalt: [absatz("Im Nutzermenü steht „Profil“."), hinweis("Einmal abmelden, einmal anmelden.")],
  },
];

const APPS: NeuigkeitenApp[] = [
  { key: "lagerbuch", titel: "Lagerbuch", anzahl: 1 },
  { key: "portal", titel: "Portal", anzahl: 1 },
];

const lade = vi.mocked(ladeNeuigkeitenAction);
const merke = vi.mocked(merkeNeuigkeitenGesehenAction);

function insel(props: Partial<Parameters<typeof NeuigkeitenListe>[0]> = {}) {
  return (
    <NeuigkeitenListe
      erste={{ eintraege: NEUIGKEITEN, weitere: false }}
      apps={APPS}
      neuSeit={null}
      merken={false}
      {...props}
    />
  );
}

/** Wartet, bis die gemockte Action aufgelöst ist und React die Antwort gesetzt hat. */
async function abwarten(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  lade.mockReset();
  merke.mockClear();
});

afterEach(async () => {
  await unmount();
  window.location.hash = "";
});

async function klickeFilter(beschriftung: string): Promise<void> {
  const knopf = queryAll('[data-testid="neuigkeiten-filter"] button').find((b) =>
    b.textContent?.includes(beschriftung),
  );
  if (!knopf) throw new Error(`Kein Filtereintrag „${beschriftung}“`);
  await clickElement(knopf);
  await abwarten();
}

describe("NeuigkeitenListe", () => {
  it("zeigt jede Notiz mit App, Datum und Titel", async () => {
    await mount(insel());
    const notizen = queryAll('[data-testid="notiz"]');
    expect(notizen.length).toBe(2);
    expect(notizen[0].textContent).toContain("Lagerbuch");
    expect(notizen[0].textContent).toContain("16. August 2026");
    expect(notizen[0].textContent).toContain("Fahrzeug-Checklisten als PDF");
  });

  it("trägt den slug als Sprungmarke und das Maschinendatum am <time>", async () => {
    await mount(insel());
    expect(exists("#checkliste-als-pdf")).toBe(true);
    expect(query("time").getAttribute("datetime")).toBe("2026-08-16");
  });

  it("rendert die drei Blockarten", async () => {
    await mount(insel());
    expect(queryAll("p").some((p) => p.textContent?.includes("Neben „Drucken“"))).toBe(true);
    expect(queryAll("li").map((li) => li.textContent)).toEqual(["Fach", "Geräte"]);
    expect(query('[data-testid="notiz-hinweis"]').textContent).toContain("Einmal abmelden");
  });

  it("filtert über den Server und kehrt ohne Umlauf zu „Alle“ zurück", async () => {
    lade.mockResolvedValue({ eintraege: [NEUIGKEITEN[1]], weitere: false });
    await mount(insel());
    await klickeFilter("Portal");
    expect(lade).toHaveBeenCalledWith("portal", 0);
    expect(queryAll('[data-testid="notiz"]').map((n) => n.getAttribute("data-modul"))).toEqual(["portal"]);

    await klickeFilter("Alle");
    expect(lade).toHaveBeenCalledTimes(1);
    expect(queryAll('[data-testid="notiz"]').length).toBe(2);
  });

  it("lädt mit „Ältere anzeigen“ die nächste Seite dazu", async () => {
    const aelter: Neuigkeit = { ...NEUIGKEITEN[1], slug: "aelter", datum: "2026-07-01", titel: "Ältere Notiz" };
    lade.mockResolvedValue({ eintraege: [aelter], weitere: false });
    await mount(insel({ erste: { eintraege: NEUIGKEITEN, weitere: true } }));

    await clickElement(query('[data-testid="neuigkeiten-aeltere"]'));
    await abwarten();
    expect(lade).toHaveBeenCalledWith("alle", 2);
    expect(queryAll('[data-testid="notiz"]').map((n) => n.id)).toEqual([
      "checkliste-als-pdf", "von-allen-geraeten-abmelden", "aelter",
    ]);
    // Keine weiteren — der Knopf verschwindet.
    expect(exists('[data-testid="neuigkeiten-aeltere"]')).toBe(false);
  });

  it("meldet ein gescheitertes Nachladen und behält die Liste", async () => {
    lade.mockRejectedValue(new Error("weg"));
    await mount(insel({ erste: { eintraege: NEUIGKEITEN, weitere: true } }));
    await clickElement(query('[data-testid="neuigkeiten-aeltere"]'));
    await abwarten();
    expect(document.body.textContent).toContain("Laden hat nicht geklappt");
    expect(queryAll('[data-testid="notiz"]').length).toBe(2);
  });

  it("kennzeichnet, was nach dem gemerkten Stand liegt, als neu", async () => {
    await mount(insel({ neuSeit: { bis: "2026-08-14", schluessel: ["portal/von-allen-geraeten-abmelden"] } }));
    const neu = queryAll('[data-testid="notiz"][data-neu="ja"]');
    expect(neu.map((n) => n.id)).toEqual(["checkliste-als-pdf"]);
    expect(neu[0].textContent).toContain("Neu");
  });

  it("merkt den Besuch erst nach dem Anzeigen und nur für Angemeldete", async () => {
    await mount(insel({ merken: false }));
    expect(merke).not.toHaveBeenCalled();
    await unmount();
    await mount(insel({ merken: true }));
    expect(merke).toHaveBeenCalledTimes(1);
  });

  it("lädt bis zu einer Sprungmarke nach, die nicht auf der ersten Seite steht", async () => {
    const aelter: Neuigkeit = { ...NEUIGKEITEN[1], slug: "weit-hinten", datum: "2026-01-01" };
    lade.mockResolvedValue({ eintraege: [...NEUIGKEITEN, aelter], weitere: true });
    // jsdom kennt kein `scrollIntoView`.
    const gerollt = vi.fn();
    HTMLElement.prototype.scrollIntoView = gerollt;
    window.location.hash = "#weit-hinten";
    await mount(insel());
    await abwarten();
    expect(lade).toHaveBeenCalledWith("alle", 0, "weit-hinten");
    expect(exists("#weit-hinten")).toBe(true);
    expect(gerollt).toHaveBeenCalledTimes(1);
  });

  it("zeigt keinen Filter, wenn alle Notizen zur selben App gehören", async () => {
    await mount(insel({ erste: { eintraege: [NEUIGKEITEN[1]], weitere: false }, apps: [APPS[1]] }));
    expect(exists('[data-testid="neuigkeiten-filter"]')).toBe(false);
    expect(queryAll('[data-testid="notiz"]').length).toBe(1);
  });

  it("sagt es, wenn für diese Person noch nichts vorliegt — ohne Filterzeile darüber", async () => {
    await mount(insel({ erste: { eintraege: [], weitere: false }, apps: [] }));
    expect(query('[data-testid="neuigkeiten-leer"]').textContent).toContain("noch nichts");
    expect(exists('[data-testid="neuigkeiten-filter"]')).toBe(false);
    expect(exists('[data-testid="neuigkeiten"]')).toBe(false);
  });
});
