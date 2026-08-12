import { describe, it, expect } from "vitest";
import {
  parseThemeMode,
  parseThemePreference,
  resolveThemeMode,
  themePreferenceCookieString,
  themeSystemCookieString,
  themeInitScript,
  THEME_COOKIE,
  THEME_PREF_COOKIE,
  THEME_SYSTEM_COOKIE,
} from "@/core/theme/mode";

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

describe("parseThemePreference", () => {
  it.each(["light", "dark"] as const)("liest '%s' als ausdrueckliche Wahl", (raw) => {
    expect(parseThemePreference(raw)).toBe(raw);
  });

  // Die Vorgabe der Suite. Ein fehlendes Cookie ist der Normalfall (der
  // Schluessel ist neu), ein kaputter Wert darf keinen vierten Zustand
  // erzeugen — beide landen auf 'auto'.
  it.each([undefined, null, "", "auto", "system", "kaputt"])("liest %s als auto", (raw) => {
    expect(parseThemePreference(raw)).toBe("auto");
  });
});

describe("resolveThemeMode", () => {
  it("auto folgt dem System", () => {
    expect(resolveThemeMode("auto", "dark")).toBe("dark");
    expect(resolveThemeMode("auto", "light")).toBe("light");
  });

  // Der Fall, fuer den die ganze Cookie-Konstruktion existiert: 'System
  // dunkel, Umschalter hell' darf nicht brechen.
  it("eine ausdrueckliche Wahl schlaegt das System", () => {
    expect(resolveThemeMode("light", "dark")).toBe("light");
    expect(resolveThemeMode("dark", "light")).toBe("dark");
  });
});

describe("die beiden Cookie-Bauer", () => {
  it("setzen Pfad, Lebensdauer und SameSite", () => {
    for (const s of [themePreferenceCookieString("auto"), themeSystemCookieString("dark")]) {
      expect(s).toContain("Path=/");
      expect(s).toContain("SameSite=Lax");
      expect(s).not.toContain("Domain=");
    }
  });

  it("schreiben unter getrennten Schluesseln", () => {
    expect(themePreferenceCookieString("auto")).toContain(`${THEME_PREF_COOKIE}=auto`);
    expect(themeSystemCookieString("dark")).toContain(`${THEME_SYSTEM_COOKIE}=dark`);
  });

  // Der Grund fuer die ganze Cookie-Konstruktion: die Einstellung muss ueber
  // alle Modul-Domains hinweg gelten (qr.iuk-ue.de <-> iuk-ue.de).
  it("tragen die Domain, wenn eine gesetzt ist", () => {
    expect(themePreferenceCookieString("light", ".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
    expect(themeSystemCookieString("light", ".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
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
