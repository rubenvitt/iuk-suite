// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STANDARD_ZEITZONE,
  istGueltigeZeitzone,
  setzeAktiveZeitzone,
  tagesGrenzenInZone,
  waehlbareZeitzonen,
  zeitFormat,
  zeitzone,
} from "./index";

/** 2026-07-31T12:00:00Z — Berlin 14:00 (MESZ), Lissabon 13:00, New York 08:00. */
const SOMMER = new Date("2026-07-31T12:00:00Z");

afterEach(() => {
  setzeAktiveZeitzone(STANDARD_ZEITZONE);
  delete document.documentElement.dataset.zeitzone;
});

const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

describe("zeitzone()", () => {
  it("ist ohne Einstellung Europe/Berlin", () => {
    expect(zeitzone()).toBe("Europe/Berlin");
    expect(UHR.format(SOMMER)).toBe("14:00");
  });

  it("folgt dem prozessweiten Speicher", () => {
    setzeAktiveZeitzone("Europe/Lisbon");
    expect(zeitzone()).toBe("Europe/Lisbon");
  });

  it("liest im Browser das Attribut, das das Root-Layout stempelt", () => {
    document.documentElement.dataset.zeitzone = "America/New_York";
    expect(zeitzone()).toBe("America/New_York");
  });

  it("überhört ein ungültiges Attribut und nimmt den Speicher", () => {
    document.documentElement.dataset.zeitzone = "Mars/Olympus_Mons";
    expect(zeitzone()).toBe("Europe/Berlin");
  });

  it("wirft bei einer unbekannten Zone und behält die alte", () => {
    expect(() => setzeAktiveZeitzone("Mars/Olympus_Mons")).toThrow("Unbekannte Zeitzone");
    expect(zeitzone()).toBe("Europe/Berlin");
  });

  /*
   * Ein zweites Bundle (Instrumentation, RSC, SSR) hätte eine eigene Kopie
   * einer Modulvariable. Der Speicher hängt deshalb an `globalThis`.
   */
  it("teilt den Speicher über `globalThis`, nicht über eine Modulvariable", () => {
    setzeAktiveZeitzone("Asia/Tokyo");
    const speicher = (globalThis as Record<symbol, { zone: string }>)[
      Symbol.for("iuk-suite.zeitzone")
    ];
    expect(speicher.zone).toBe("Asia/Tokyo");
  });
});

describe("zeitFormat", () => {
  /*
   * Der Kern der Umstellung: ein Formatierer auf Modulebene darf die Zone
   * nicht beim Import einfrieren. `UHR` oben entstand, bevor dieser Fall
   * die Zone wechselt.
   */
  it("löst die Zone beim Formatieren auf, nicht beim Anlegen", () => {
    expect(UHR.format(SOMMER)).toBe("14:00");
    setzeAktiveZeitzone("America/New_York");
    expect(UHR.format(SOMMER)).toBe("08:00");
    setzeAktiveZeitzone("Europe/Lisbon");
    expect(UHR.formatToParts(SOMMER).find((t) => t.type === "hour")?.value).toBe("13");
  });
});

describe("waehlbareZeitzonen", () => {
  it("bietet Europe/Berlin und UTC an, und nur gültige Zonen", () => {
    const zonen = waehlbareZeitzonen();
    expect(zonen).toContain("Europe/Berlin");
    expect(zonen).toContain("UTC");
    expect(zonen.every(istGueltigeZeitzone)).toBe(true);
  });
});

describe("tagesGrenzenInZone", () => {
  it("ist ein gewöhnlicher Tag von 00:00 bis 23:59:59.999 Berliner Zeit", () => {
    const { von, bis } = tagesGrenzenInZone("2026-07-15");
    expect(new Date(von).toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(new Date(bis).toISOString()).toBe("2026-07-15T21:59:59.999Z");
  });

  it.each([
    ["2026-03-29", 23, "2026-03-28T23:00:00.000Z"],
    ["2026-10-25", 25, "2026-10-24T22:00:00.000Z"],
  ])("hält die Wanduhr über die Umstellung am %s (%i Stunden)", (tag, stunden, anfang) => {
    const { von, bis } = tagesGrenzenInZone(tag);
    expect(new Date(von).toISOString()).toBe(anfang);
    expect(bis - von + 1).toBe(stunden * 3_600_000);
  });

  it("folgt der eingestellten Zone", () => {
    setzeAktiveZeitzone("UTC");
    expect(new Date(tagesGrenzenInZone("2026-07-15").von).toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
    setzeAktiveZeitzone("Pacific/Kiritimati");
    expect(new Date(tagesGrenzenInZone("2026-07-15").von).toISOString()).toBe(
      "2026-07-14T10:00:00.000Z",
    );
  });
});

/*
 * Falle 6: Server Components, Route Handler und Client-Inseln lesen diese
 * Datei. Mit `"use client"` käme in einer Server Component nur eine
 * Client-Referenz an, und Vitest sähe das nicht.
 */
it("trägt kein `use client` und zieht keinen Servercode an", () => {
  const quelle = readFileSync(join(process.cwd(), "src/core/zeit/index.ts"), "utf8");
  expect(quelle).not.toMatch(/^\s*["']use client["'];?\s*$/m);
  expect(quelle).not.toMatch(/^import /m);
});
