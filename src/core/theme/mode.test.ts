import { describe, it, expect } from "vitest";
import { parseThemeMode, themeCookieString, themeInitScript, THEME_COOKIE } from "@/core/theme/mode";

describe("parseThemeMode", () => {
  it("liest 'dark' als dark", () => {
    expect(parseThemeMode("dark")).toBe("dark");
  });

  // Alles andere ist light: ohne Cookie rendert der Server hell, und ein
  // kaputter Cookie-Wert darf die Seite nicht in einen dritten Zustand kippen.
  it.each([undefined, null, "", "light", "system", "kaputt"])("liest %s als light", (raw) => {
    expect(parseThemeMode(raw)).toBe("light");
  });
});

describe("themeCookieString", () => {
  it("setzt Pfad, Lebensdauer und SameSite", () => {
    const s = themeCookieString("dark");
    expect(s).toContain(`${THEME_COOKIE}=dark`);
    expect(s).toContain("Path=/");
    expect(s).toContain("SameSite=Lax");
    expect(s).not.toContain("Domain=");
  });

  // Der Grund für die ganze Cookie-Konstruktion: die Einstellung muss über
  // alle Modul-Domains hinweg gelten (qr.iuk-ue.de <-> iuk-ue.de).
  it("trägt die Domain, wenn eine gesetzt ist", () => {
    expect(themeCookieString("light", ".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});

describe("themeInitScript", () => {
  it("prüft auf ein vorhandenes Cookie, bevor es schreibt", () => {
    expect(themeInitScript()).toContain(THEME_COOKIE);
    expect(themeInitScript()).toContain("prefers-color-scheme");
  });

  it("nimmt die Domain auf", () => {
    expect(themeInitScript(".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});
