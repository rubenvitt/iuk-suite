import { describe, it, expect } from "vitest";
import {
  parseThemeMode,
  parseThemePreference,
  resolveThemeMode,
  themePreferenceCookieString,
  themeSystemCookieString,
  themeInitScript,
  LEGACY_THEME_COOKIE,
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
  it("schreibt den Systemwert und nicht die Praeferenz", () => {
    const s = themeInitScript();
    expect(s).toContain("prefers-color-scheme");
    expect(s).toContain(THEME_SYSTEM_COOKIE);
    expect(s).not.toContain(THEME_PREF_COOKIE);
  });

  // Der Early-Return des Vorgaengers liess das Script genau einmal pro Browser
  // laufen. Mit Auto waere das ein Fehler: ein spaeterer OS-Wechsel kaeme nie
  // an, und Auto hoerte still auf zu funktionieren. Der Vergleich vor dem
  // Schreiben ist der Ersatz — er verhindert nur unnoetige Schreibvorgaenge,
  // nicht das Fortschreiben eines GEAENDERTEN Wertes. Das neue Script hat
  // deshalb ueberhaupt kein `return` mehr.
  it("Regression: kehrt NICHT frueh zurueck, wenn schon ein Cookie steht", () => {
    expect(themeInitScript()).not.toContain("return");
  });

  // `toContain(LEGACY_THEME_COOKIE)` allein sichert nichts zu: LEGACY_THEME_COOKIE
  // ist "iuk-theme", und das steckt als Teilstring schon in "iuk-theme-system" —
  // die Zusicherung bliebe gruen, auch wenn die Loeschung ganz entfiele. Geprueft
  // wird deshalb auf den tatsaechlich ausgelieferten Loeschbefehl
  // ("iuk-theme=;...Max-Age=0..."), nicht auf den nackten Namen — und auf BEIDE
  // Loeschzeilen (mit und ohne Domain), damit ein Wegfall einer der beiden
  // auffaellt (Befund 6: ohne konfigurierte Domain sind sie byteidentisch, mit
  // Domain unterscheiden sie sich).
  it("raeumt den Altschluessel ab: beide Loeschzeilen, mit und ohne Domain", () => {
    const geloescht = `${LEGACY_THEME_COOKIE}=;Path=/;Max-Age=0;SameSite=Lax`;

    const ohneDomain = themeInitScript();
    // Ohne Domain sind beide Zeilen byteidentisch — die Form muss trotzdem
    // ZWEIMAL vorkommen, sonst ist eine der beiden Loeschzeilen verschwunden.
    expect(ohneDomain.split(geloescht).length - 1).toBe(2);

    const mitDomain = themeInitScript(".iuk-ue.de");
    // Mit Domain sind es zwei VERSCHIEDENE Formen: eine mit `;Domain=...`
    // (trifft ein mit Domain gesetztes Cookie), eine ohne (trifft ein je Host
    // ohne Domain gesetztes Cookie).
    expect(mitDomain).toContain(`${geloescht};Domain=.iuk-ue.de'`);
    expect(mitDomain).toContain(`${geloescht}'`);
  });

  // Der Cookie-Vertrag (Pfad, Lebensdauer, SameSite) fuer das SYSTEM-Cookie ist
  // separat vom Vertrag der "Cookie-Bauer" oben zu pruefen: `cookieString()` und
  // dieses Script bauen ihn an zwei Stellen auf. Wer im Script `Max-Age`
  // versehentlich fallen laesst, macht aus dem Auto-Modus ein Sitzungs-Cookie —
  // funktioniert, solange der Browser offen ist, faellt nach jedem Neustart auf
  // hell zurueck, bis die Hydration nachzieht. Kein anderes Tor sieht das.
  //
  // `ONE_YEAR` ist modulprivat und bleibt es (Befund 2): der Test rechnet die
  // Formel selbst nach, statt eine sonst ungebrauchte Konstante nur fuers
  // Testen zu exportieren.
  it("schreibt das System-Cookie mit vollem Vertrag: Pfad, Lebensdauer, SameSite", () => {
    const einJahrInSekunden = 60 * 60 * 24 * 365;
    const s = themeInitScript();
    expect(s).toContain(`Max-Age=${einJahrInSekunden}`);
    expect(s).toContain("Path=/");
    expect(s).toContain("SameSite=Lax");
  });

  it("nimmt die Domain auf", () => {
    expect(themeInitScript(".iuk-ue.de")).toContain("Domain=.iuk-ue.de");
  });
});
