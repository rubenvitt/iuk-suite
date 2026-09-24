import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clickElement, mount, queryAll, unmount } from "../../../src/app/m/qr/_lib/test-dom";
import type { Ausstehend, Entwurf, Stammdatenpaket, Status, Versiegelung } from "./typen";

const befehle = vi.hoisted(() => ({
  status: vi.fn(),
  stammdaten: vi.fn(),
  entwurfSpeichern: vi.fn(),
  entwurfVerwerfen: vi.fn(),
  absenden: vi.fn(),
  jetztVersiegeln: vi.fn(),
  fristPruefen: vi.fn(),
  versiegelungQuittieren: vi.fn(),
  testbetriebBeenden: vi.fn(),
  entwicklungEinrichten: vi.fn(),
}));
vi.mock("./befehle", () => ({ befehle }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { App } from "./App";

const BAND = "TESTBETRIEB — nichts hiervon ist ein echter Einsatz";
const VERFALLEN =
  "Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand.";

function status(teil: Partial<Status> = {}): Status {
  return {
    betrieb: "echt",
    eingerichtet: true,
    entwicklung: false,
    startfehler: null,
    bereitschaft: "DRK-Bereitschaft Uelzen",
    zeitzone: "Europe/Berlin",
    fristMinuten: 15,
    besatzung: false,
    jetzt: "2026-09-24T10:00:00+02:00",
    jetztMs: Date.now(),
    entwurf: null,
    ausstehend: null,
    kette: { anzahl: 3, letzter: { block: 3, hash: "c".repeat(64) } },
    versiegelung: null,
    ...teil,
  };
}

function entwurf(teil: Partial<Entwurf> = {}): Entwurf {
  return {
    stichwort: "RD 1",
    beginnDatum: "2026-09-24",
    beginnZeit: "10:00",
    endeDatum: "",
    endeZeit: "",
    strasse: "Lindenstraße 8",
    ort: "29525 Uelzen",
    objekt: "",
    fahrzeuge: ["11-83-1"],
    personal: [],
    vorOrt: 1,
    transport: 0,
    notizen: "",
    ...teil,
  };
}

function ausstehend(e: Entwurf = entwurf()): Ausstehend {
  const fristBisMs = Date.now() + 10 * 60_000;
  return { entwurf: e, abgesendetAm: "2026-09-24T10:05:00+02:00", fristBis: "2026-09-24T10:20:00+02:00", fristBisMs };
}

function versiegelung(teil: Partial<Versiegelung> = {}): Versiegelung {
  return {
    block: 4,
    hash: "abcdef0123456789".repeat(4),
    prev: "c".repeat(64),
    versiegelt: "2026-09-24T10:20:00+02:00",
    nummer: "T-2026-004",
    verfallen: false,
    ...teil,
  };
}

const PAKET: Stammdatenpaket = {
  version: 1,
  stammdaten: {
    fahrzeuge: [{ id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
    personal: [{ id: "p1", name: "Albers, Jana", quali: "RS", ov: "Uelzen" }],
    stichworte: [{ name: "Rettungsdienst", items: ["RD 1", "RD 2"] }],
  },
  fristMinuten: 15,
  besatzung: false,
  zeitzone: "Europe/Berlin",
  bereitschaft: "DRK-Bereitschaft Uelzen",
};

/** Lässt die Promise-Ketten der Befehlsnaht (Status → Stammdaten → setState) auslaufen. */
async function warte(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }
}

function text(): string {
  return document.body.textContent ?? "";
}

/** Knopf nach seinem zugänglichen Namen: `aria-label`, sonst der sichtbare Text. */
function knopf(name: string): HTMLButtonElement | undefined {
  return queryAll<HTMLButtonElement>("button").find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name);
}

/** Eingabefeld über das umschließende `<label>` — so, wie `getByLabel` es findet. */
function feld(label: string): HTMLInputElement | undefined {
  const l = queryAll<HTMLLabelElement>("label").find((x) => (x.textContent ?? "").trim() === label);
  return l?.querySelector("input") ?? undefined;
}

function band(): HTMLElement | undefined {
  return queryAll('[role="status"]').find((el) => (el.textContent ?? "").trim() === BAND);
}

async function starte(s: Status): Promise<void> {
  befehle.status.mockResolvedValue(s);
  await mount(<App />);
  await warte();
}

beforeEach(() => {
  for (const f of Object.values(befehle)) f.mockReset();
  befehle.stammdaten.mockResolvedValue(PAKET);
  befehle.entwurfSpeichern.mockResolvedValue(undefined);
  befehle.entwurfVerwerfen.mockResolvedValue(undefined);
  befehle.fristPruefen.mockResolvedValue(null);
  befehle.versiegelungQuittieren.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("Testband", () => {
  it("steht im Testbetrieb über der Startseite, mit „Testbetrieb beenden“ im Fuß", async () => {
    await starte(status({ betrieb: "test" }));
    expect(band()).toBeDefined();
    expect(knopf("Einsatz öffnen")).toBeDefined();
    expect(knopf("Testbetrieb beenden")).toBeDefined();
    expect(text()).toContain("DRK-Bereitschaft Uelzen");
  });

  it("fehlt im echten Betrieb, samt „Testbetrieb beenden“", async () => {
    await starte(status({ betrieb: "echt" }));
    expect(knopf("Einsatz öffnen")).toBeDefined();
    expect(band()).toBeUndefined();
    expect(knopf("Testbetrieb beenden")).toBeUndefined();
  });

  it("„Testbetrieb beenden“ fragt erst nach und steht danach bei „nicht eingerichtet“", async () => {
    await starte(status({ betrieb: "test" }));
    await clickElement(knopf("Testbetrieb beenden")!);
    const dialog = queryAll('[role="dialog"]')[0];
    expect(dialog?.textContent).toContain(
      "Die lokale Testdatenbank mit allen Testeinsätzen wird gelöscht. Das lässt sich nicht rückgängig machen.",
    );
    expect(befehle.testbetriebBeenden).not.toHaveBeenCalled();

    befehle.testbetriebBeenden.mockResolvedValue(undefined);
    befehle.status.mockResolvedValue(status({ betrieb: null, eingerichtet: false }));
    await clickElement(knopf("Testdatenbank löschen")!);
    await warte();
    expect(befehle.testbetriebBeenden).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Rechner ist noch nicht eingerichtet");
    expect(queryAll('[role="dialog"]')).toHaveLength(0);
  });
});

describe("Nicht eingerichtet", () => {
  it("zeigt ohne Entwicklungs-Build keinen Entwicklerweg", async () => {
    await starte(status({ betrieb: null, eingerichtet: false, entwicklung: false }));
    expect(text()).toContain("Rechner ist noch nicht eingerichtet");
    expect(text()).toContain("Die Einrichtung übernimmt die Verwaltung über die Anmeldung an der Suite.");
    expect(text()).not.toContain("Entwickler-Einrichtung");
    expect(knopf("Mit Testvektor-Schlüssel einrichten")).toBeUndefined();
    expect(knopf("Schlüssel aus Datei …")).toBeUndefined();
    expect(befehle.stammdaten).not.toHaveBeenCalled();
  });

  it("zeigt im Entwicklungs-Build die Entwickler-Einrichtung mit Frist 15", async () => {
    await starte(status({ betrieb: null, eingerichtet: false, entwicklung: true }));
    expect(text()).toContain("Entwickler-Einrichtung (nur Debug-Build)");
    expect(knopf("Mit Testvektor-Schlüssel einrichten")).toBeDefined();
    expect(knopf("Schlüssel aus Datei …")).toBeDefined();
    expect(feld("Frist in Minuten")?.value).toBe("15");
  });
});

describe("Startfehler", () => {
  it("zeigt die Fehlerseite ohne Einrichtungsweg und ohne schreibende Knöpfe", async () => {
    await starte(status({ betrieb: "test", eingerichtet: false, entwicklung: true, startfehler: "Datei ist keine Datenbank" }));
    expect(text()).toContain("Die Datenbank dieses Rechners lässt sich nicht öffnen");
    expect(text()).toContain("Datei ist keine Datenbank");
    expect(text()).toContain("Bitte wende dich an die Verwaltung. Es wird nichts versiegelt, bis das behoben ist.");
    expect(band()).toBeDefined();
    for (const name of ["Einsatz öffnen", "Testbetrieb beenden", "Mit Testvektor-Schlüssel einrichten", "Schlüssel aus Datei …"]) {
      expect(knopf(name)).toBeUndefined();
    }
    expect(befehle.stammdaten).not.toHaveBeenCalled();
  });
});

describe("Frist", () => {
  it("öffnet bei einem ausstehenden Einsatz direkt die Frist-Seite", async () => {
    await starte(status({ ausstehend: ausstehend() }));
    expect(text()).toContain("Abgesendet · noch änderbar");
    expect(knopf("Jetzt versiegeln")).toBeDefined();
    expect(knopf("Angaben ändern")).toBeDefined();
    expect(knopf("Einsatz öffnen")).toBeUndefined();
    expect(text()).toContain("Lindenstraße 8, 29525 Uelzen");
  });

  it("öffnet nach einem Neustart mit ausstehendem Einsatz und Entwurf die Bearbeitung mit dem Entwurf", async () => {
    const bearbeitet = entwurf({ strasse: "Hauptstraße 30" });
    await starte(status({ ausstehend: ausstehend(), entwurf: bearbeitet }));
    const h1 = queryAll("h1").map((h) => h.textContent);
    expect(h1).toContain("Angaben ändern");
    expect(feld("Straße, Hausnummer")?.value).toBe("Hauptstraße 30");
    expect(knopf("Änderungen übernehmen")).toBeDefined();
    expect(knopf("Änderungen verwerfen")).toBeDefined();
    expect(knopf("Zurück zur Frist")).toBeDefined();
    expect(befehle.entwurfSpeichern).not.toHaveBeenCalled();
  });
});

describe("Versiegelt", () => {
  it("meldet eine verfallene Bearbeitung", async () => {
    await starte(status({ versiegelung: versiegelung({ verfallen: true }) }));
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Einsatz versiegelt");
    expect(text()).toContain(VERFALLEN);
    expect(text()).toContain("Block 3");
    expect(text()).toContain("Block 4 · neu");
    expect(text()).toContain("#abcdef01");
    expect(text()).toContain("#cccccccc");
    expect(text()).toContain("Versiegelt am 24.9.2026, 10:20 Uhr");
  });

  it("ohne Verfall kein Hinweis", async () => {
    await starte(status({ versiegelung: versiegelung({ verfallen: false }) }));
    expect(text()).toContain("Einsatz versiegelt");
    expect(text()).not.toContain(VERFALLEN);
  });

  it("„Neuen Einsatz erfassen“ quittiert zuerst und fragt erst dann den Status ab", async () => {
    await starte(status({ versiegelung: versiegelung() }));
    befehle.status.mockResolvedValue(status());
    await clickElement(knopf("Neuen Einsatz erfassen")!);
    await warte();
    expect(befehle.versiegelungQuittieren).toHaveBeenCalledTimes(1);
    const quittiert = befehle.versiegelungQuittieren.mock.invocationCallOrder[0];
    const statusAufrufe = befehle.status.mock.invocationCallOrder;
    expect(statusAufrufe[statusAufrufe.length - 1]).toBeGreaterThan(quittiert);
    expect(knopf("Einsatz öffnen")).toBeDefined();
  });
});

describe("Fehler der Befehlsnaht", () => {
  it("landen als Hinweis über dem Inhalt, nicht als alert()", async () => {
    const alarm = vi.spyOn(window, "alert").mockImplementation(() => {});
    befehle.status.mockRejectedValue("Status nicht lesbar");
    await mount(<App />);
    await warte();
    const hinweis = queryAll('[role="alert"]')[0];
    expect(hinweis?.textContent).toContain("Status nicht lesbar");
    expect(alarm).not.toHaveBeenCalled();
    alarm.mockRestore();
  });
});
