import { describe, it, expect } from "vitest";
import { MODULES } from "@/core/registry";
import { appIconFuerKachel, appIconsFuerManifest, appleIconFuer, faviconFuer, pngZuDatei, zeichenZuDatei } from "./index";
import { ZEICHEN } from "./zeichen";

describe("faviconFuer", () => {
  it("gibt Modulen mit eigenem Zeichen dieses, versioniert über die Prüfsumme", () => {
    for (const key of ["qr", "feedback", "files", "aufgaben", "radio", "uav", "einsatzbuch", "lagerbuch", "kommplan", "fahrzeuge", "helfer"]) {
      expect(faviconFuer(key).url).toMatch(new RegExp(`^/favicon/${key}\\.svg\\?v=[0-9a-z]+$`));
    }
  });

  it("fällt ohne Modul, für das Portal und für Demos auf das IDA-Zeichen zurück", () => {
    for (const key of [null, undefined, "portal", "alpha", "gamma", "beta", "kioskdemo", "gibtsnicht"]) {
      expect(faviconFuer(key).url).toMatch(/^\/favicon\/ida\.svg\?v=/);
    }
  });

  it("verlinkt für jedes Registry-Modul eine Datei, die die Route auch ausliefert", () => {
    for (const m of MODULES) {
      const { url } = faviconFuer(m.key);
      const datei = url.slice("/favicon/".length).split("?")[0];
      expect(zeichenZuDatei(datei), m.key).not.toBeNull();
    }
  });

  it("ändert die URL, wenn sich ein Zeichen ändert (sonst hielte ein Cache das alte fest)", () => {
    const urls = Object.keys(ZEICHEN).map((k) => faviconFuer(k).url.split("?v=")[1]);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("zeichenZuDatei", () => {
  it("kennt nur `<name>.svg` aus der Liste", () => {
    expect(zeichenZuDatei("ida.svg")).toBe(ZEICHEN.ida);
    for (const datei of ["ida", "ida.png", "IDA.svg", "../ida.svg", "toString.svg", "constructor.svg", "alpha.svg"]) {
      expect(zeichenZuDatei(datei), datei).toBeNull();
    }
  });
});

describe("appleIconFuer", () => {
  it("gibt jedem Modul sein Zeichen als App-Icon, versioniert über die Prüfsumme", () => {
    expect(appleIconFuer("qr")?.url).toMatch(/^\/favicon\/qr-apple-180\.png\?v=[0-9a-z]+$/);
    expect(appleIconFuer("portal")?.url).toMatch(/^\/favicon\/ida-apple-180\.png\?v=/);
    expect(appleIconFuer(null)?.url).toMatch(/^\/favicon\/ida-apple-180\.png\?v=/);
  });

  it("gibt auch lagerbuch sein Suite-Zeichen statt des Alt-Symbols", () => {
    expect(appleIconFuer("lagerbuch")?.url).toMatch(/^\/favicon\/lagerbuch-apple-180\.png\?v=/);
  });

  it("verlinkt für jedes Registry-Modul eine Datei, die die Route auch ausliefert", () => {
    for (const m of MODULES) {
      const icon = appleIconFuer(m.key);
      if (!icon) continue;
      expect(pngZuDatei(icon.url.slice("/favicon/".length).split("?")[0]), m.key).not.toBeNull();
    }
  });
});

describe("appIconsFuerManifest", () => {
  it("nennt 192, 512 und eine maskierbare 512 mit dem Zeichen des Moduls", () => {
    const icons = appIconsFuerManifest("uav");
    expect(icons.map((i) => [i.sizes, i.purpose])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
    for (const i of icons) {
      expect(i.src).toMatch(/^\/favicon\/uav-[a-z]+-\d+\.png\?v=/);
      expect(pngZuDatei(i.src.slice("/favicon/".length).split("?")[0])).not.toBeNull();
    }
  });
});

describe("pngZuDatei", () => {
  it("kennt nur die erzeugten Dateien", () => {
    expect(pngZuDatei("ida-apple-180.png")).not.toBeNull();
    for (const datei of ["ida.png", "ida-apple-180", "../ida-apple-180.png", "toString", "constructor", "alpha-app-192.png"]) {
      expect(pngZuDatei(datei), datei).toBeNull();
    }
  });
});

describe("appIconFuerKachel", () => {
  it("verlinkt eine Datei, die die Route auch ausliefert", () => {
    for (const m of MODULES) {
      const url = appIconFuerKachel(m.key);
      if (!url) continue;
      expect(pngZuDatei(url.slice("/favicon/".length).split("?")[0]), m.key).not.toBeNull();
    }
  });

  /** Rückmeldung vom 20.10.2026: Lagerbuchs dunkles Alt-Symbol stand als einzige Kachel aus der Reihe. */
  it("gibt lagerbuch das Suite-Zeichen, Modulen ohne Zeichen keines", () => {
    expect(appIconFuerKachel("lagerbuch")).toMatch(/^\/favicon\/lagerbuch-app-192\.png\?v=/);
    expect(appIconFuerKachel("alpha")).toBeUndefined();
    expect(appIconFuerKachel("portal")).toMatch(/^\/favicon\/ida-app-192\.png\?v=/);
  });

  /**
   * Rückmeldung vom 21.10.2026: Fahrzeuge, Helfer und Kommunikationspläne
   * standen mit Icons8-Zeichen ohne rotes Signal neben den Suite-Kacheln. Ein
   * neues Modul braucht ein Zeichen in `zeichen.ts`; nur die Wegwerf-Module nicht.
   */
  it("gibt jedem echten Modul ein eigenes Zeichen", () => {
    const wegwerf = new Set(["alpha", "beta", "gamma", "kioskdemo"]);
    const ohne = MODULES.filter((m) => !wegwerf.has(m.key) && !appIconFuerKachel(m.key)).map((m) => m.key);
    expect(ohne).toEqual([]);
  });
});
