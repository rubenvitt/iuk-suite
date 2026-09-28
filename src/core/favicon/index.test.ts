import { describe, it, expect } from "vitest";
import { MODULES } from "@/core/registry";
import { faviconFuer, zeichenZuDatei } from "./index";
import { ZEICHEN } from "./zeichen";

describe("faviconFuer", () => {
  it("gibt Modulen mit eigenem Zeichen dieses, versioniert über die Prüfsumme", () => {
    for (const key of ["qr", "feedback", "files", "aufgaben", "radio", "uav", "einsatzbuch"]) {
      expect(faviconFuer(key).url).toMatch(new RegExp(`^/favicon/${key}\\.svg\\?v=[0-9a-z]+$`));
    }
  });

  it("lässt lagerbuch sein eigenes PWA-Symbol behalten", () => {
    expect(faviconFuer("lagerbuch").url).toBe("/pwa-icon.svg");
  });

  it("fällt ohne Modul, für das Portal und für Demos auf das IDA-Zeichen zurück", () => {
    for (const key of [null, undefined, "portal", "alpha", "gamma", "beta", "kioskdemo", "gibtsnicht"]) {
      expect(faviconFuer(key).url).toMatch(/^\/favicon\/ida\.svg\?v=/);
    }
  });

  it("verlinkt für jedes Registry-Modul eine Datei, die die Route auch ausliefert", () => {
    for (const m of MODULES) {
      const { url } = faviconFuer(m.key);
      if (url === "/pwa-icon.svg") continue;
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
    for (const datei of ["ida", "ida.png", "IDA.svg", "../ida.svg", "toString.svg", "constructor.svg", "lagerbuch.svg"]) {
      expect(zeichenZuDatei(datei), datei).toBeNull();
    }
  });
});
