// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import {
  auffaellig,
  dringlichkeit,
  laeuftAb,
  trifftStatus,
  unterSoll,
  zaehleStatus,
  type BestandStatusZeile,
} from "./bestandStatus";
import { FahrzeugReiter } from "./FahrzeugReiter";
import { blattAdresse, reiterAus, statusAus } from "./reiter";

/**
 * IDA-232 — die Reiter des Einheitenblatts und die Statuslogik der
 * Bestandsliste.
 */

const ZEILE: BestandStatusZeile = { statusTon: "ok", abgelaufen: false, bestand: 3, soll: 3 };

afterEach(async () => {
  await unmount();
  window.history.replaceState(null, "", "/");
});

describe("Statuslogik der Bestandsliste", () => {
  /**
   * ⚠️ DIESELBE TEILUNG WIE DIE KACHELN (DRK-340): eine rote, noch nicht
   * abgelaufene Meldung ist „läuft ab", nicht „abgelaufen". Sonst filterte die
   * Kachel „läuft ab" genau die Zeile weg, die sie gezählt hat.
   */
  it("teilt abgelaufen und läuft ab über die Quelle, nicht über den Ton", () => {
    const rotNichtAbgelaufen = { ...ZEILE, statusTon: "rot" as const };
    expect(laeuftAb(rotNichtAbgelaufen)).toBe(true);
    expect(trifftStatus(rotNichtAbgelaufen, "abgelaufen")).toBe(false);

    const abgelaufen = { ...ZEILE, statusTon: "rot" as const, abgelaufen: true };
    expect(laeuftAb(abgelaufen)).toBe(false);
    expect(trifftStatus(abgelaufen, "abgelaufen")).toBe(true);
    expect(laeuftAb({ ...ZEILE, statusTon: "gelb" })).toBe(true);
  });

  it("rechnet „unter Soll“ gegen die Summe und fasst das Auffällige zusammen", () => {
    expect(unterSoll({ ...ZEILE, bestand: 2 })).toBe(true);
    expect(unterSoll({ ...ZEILE, bestand: 4 })).toBe(false);
    expect(auffaellig(ZEILE)).toBe(false);
    // „nicht erfasst" ist keine Entwarnung, aber auch kein Befund.
    expect(auffaellig({ ...ZEILE, statusTon: null })).toBe(false);
    expect(trifftStatus({ ...ZEILE, statusTon: null }, "nicht-erfasst")).toBe(true);
    expect(trifftStatus(ZEILE, null)).toBe(true);
  });

  it("ordnet abgelaufen vor läuft ab vor unter Soll vor nicht erfasst vor dem Rest", () => {
    const zeilen = [
      ZEILE,
      { ...ZEILE, statusTon: null },
      { ...ZEILE, bestand: 0 },
      { ...ZEILE, statusTon: "gelb" as const },
      { ...ZEILE, statusTon: "rot" as const, abgelaufen: true },
    ];
    expect(zeilen.map(dringlichkeit)).toEqual([4, 3, 2, 1, 0]);
    expect(zaehleStatus(zeilen)).toEqual({
      auffaellig: 3,
      abgelaufen: 1,
      "laeuft-ab": 1,
      "unter-soll": 1,
      "nicht-erfasst": 1,
    });
  });
});

describe("Adressen der Reiter", () => {
  it("lässt den Startreiter aus der Adresse und nennt die anderen", () => {
    expect(blattAdresse("fz 1", "bestand")).toBe("/verwaltung/fahrzeuge/fz%201");
    expect(blattAdresse("fz-1", "soll")).toBe("/verwaltung/fahrzeuge/fz-1?reiter=soll");
    expect(blattAdresse("fz-1", "bestand", "abgelaufen"))
      .toBe("/verwaltung/fahrzeuge/fz-1?status=abgelaufen");
  });

  it("fällt bei unbekannten Werten auf den Start bzw. keinen Filter zurück", () => {
    expect(reiterAus("soll")).toBe("soll");
    expect(reiterAus("gibt-es-nicht")).toBe("bestand");
    expect(reiterAus(null)).toBe("bestand");
    expect(statusAus("laeuft-ab")).toBe("laeuft-ab");
    expect(statusAus("rot")).toBeNull();
  });
});

describe("FahrzeugReiter", () => {
  const REITER = [
    { schluessel: "bestand" as const, titel: "Bestand & Verfall", zusatz: "2 abgelaufen", inhalt: <p>Liste</p> },
    { schluessel: "soll" as const, titel: "Soll", zusatz: "210", inhalt: <p>Gruppen</p> },
    { schluessel: "plomben" as const, titel: "Plomben", inhalt: <p>Plomben</p> },
    { schluessel: "einstellungen" as const, titel: "Einstellungen", inhalt: <p>Art</p> },
  ];

  function reiterTexte(): string[] {
    return queryAll("[role='tab']").map((reiter) => reiter.textContent ?? "");
  }

  it("nennt die Zähler im Reiter und öffnet ohne Angabe auf Bestand & Verfall", async () => {
    await mount(<FahrzeugReiter reiter={REITER} />);
    expect(reiterTexte()).toEqual([
      "Bestand & Verfall · 2 abgelaufen",
      "Soll · 210",
      "Plomben",
      "Einstellungen",
    ]);
    expect(query("[role='tab'][aria-selected='true']").textContent).toContain("Bestand");
    expect(query("[role='tabpanel']:not([hidden])").textContent).toBe("Liste");
  });

  it("öffnet den Reiter aus der Adresse", async () => {
    window.history.replaceState(null, "", "/?reiter=einstellungen");
    await mount(<FahrzeugReiter reiter={REITER} />);
    expect(query("[role='tab'][aria-selected='true']").textContent).toBe("Einstellungen");
  });

  /**
   * ⚠️ EIN NEUER EINTRAG IM VERLAUF, nicht ersetzt: „Zurück" führt auf den
   * vorigen Reiter. Der Startreiter verschwindet dabei aus der Adresse.
   */
  it("schreibt den Wechsel als neuen Verlaufseintrag in die Adresse", async () => {
    await mount(<FahrzeugReiter reiter={REITER} />);
    const vorher = window.history.length;
    const soll = queryAll("[role='tab']").find((reiter) => (reiter.textContent ?? "").startsWith("Soll"))!;
    await clickElement(soll);

    expect(window.location.search).toBe("?reiter=soll");
    expect(window.history.length).toBe(vorher + 1);
    expect(query("[role='tab'][aria-selected='true']").textContent).toContain("Soll");

    const bestand = queryAll("[role='tab']").find((reiter) => (reiter.textContent ?? "").startsWith("Bestand"))!;
    await clickElement(bestand);
    expect(window.location.search).toBe("");
  });
});
