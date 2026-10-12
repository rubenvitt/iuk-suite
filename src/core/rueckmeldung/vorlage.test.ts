import { describe, expect, it } from "vitest";

import type { RueckmeldungEingabe } from "@/core/rueckmeldung/eingabe";
import { baueAufgabe, kurzerBrowser, seiteOhneQuery } from "@/core/rueckmeldung/vorlage";

const EINGABE: RueckmeldungEingabe = {
  id: "tz4a98xxat96iws9zmbrgj3a",
  art: "fehler",
  titel: "Inventur speichert nicht",
  text: "Nach dem Klick auf Speichern passiert nichts.",
  modulKey: "lagerbuch",
  seite: "https://lagerbuch.example.test/m/lagerbuch/inventur?token=geheim#zeile-3",
  browser: "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0",
  fenster: "1280×800",
  thema: "dark",
};

const KONTEXT = {
  name: "Max Mustermann",
  version: "1.42.0",
  revision: "a1b2c3d4e5f6",
  jetzt: new Date("2026-10-12T16:04:00Z"),
};

describe("baueAufgabe", () => {
  it("macht aus Fehler/Idee/Sonstiges bug/feature/aufgabe", () => {
    expect(baueAufgabe(EINGABE, KONTEXT).type).toBe("bug");
    expect(baueAufgabe({ ...EINGABE, art: "idee" }, KONTEXT).type).toBe("feature");
    expect(baueAufgabe({ ...EINGABE, art: "sonstiges" }, KONTEXT).type).toBe("aufgabe");
  });

  it("übernimmt Titel und ID unverändert", () => {
    const a = baueAufgabe(EINGABE, KONTEXT);
    expect(a.title).toBe(EINGABE.titel);
    expect(a.external_id).toBe(EINGABE.id);
  });

  it("setzt den Text vor den Kontextblock", () => {
    const d = baueAufgabe(EINGABE, KONTEXT).description;
    expect(d.startsWith(EINGABE.text)).toBe(true);
    expect(d).toContain("**Gemeldet von:** Max Mustermann");
    expect(d).toContain("**Modul:** Lagerbuch (`lagerbuch`)");
    expect(d).toContain("**Seite:** `/m/lagerbuch/inventur`");
    expect(d).toContain("1.42.0 (`a1b2c3d`)");
    expect(d).toContain("Firefox 141 · Linux · 1280×800 · Dunkel");
    expect(d).toContain("Rückmeldung `tz4a98xxat96iws9zmbrgj3a`");
  });

  /**
   * ⚠️ PARAMETER KÖNNEN KENNUNGEN ODER FREIGABE-SCHLÜSSEL TRAGEN. In Zunder
   * hilft nur der Pfad; der Rest bleibt in der Suite.
   */
  it("schneidet Query und Fragment ab — in der Beschreibung und im Link", () => {
    const a = baueAufgabe(EINGABE, KONTEXT);
    expect(a.description).not.toContain("geheim");
    expect(a.links).toEqual([
      { url: "https://lagerbuch.example.test/m/lagerbuch/inventur", title: "Gemeldet auf" },
    ]);
  });

  /** Entscheidung vom 12.10.2026: nur der Anzeigename kommt in Zunder an. */
  it("enthält keine E-Mail-Adresse", () => {
    const d = baueAufgabe(EINGABE, KONTEXT).description;
    expect(d).not.toMatch(/E-Mail|@/);
  });

  it("kommt ohne Text, Name, Modul und Revision aus", () => {
    const a = baueAufgabe(
      { ...EINGABE, text: "", modulKey: "gibtsnicht" },
      { ...KONTEXT, name: null, revision: "unbekannt" },
    );
    expect(a.description.startsWith("**Gemeldet von:** unbekannt")).toBe(true);
    expect(a.description).toContain("**Modul:** unbekannt");
    expect(a.description).toContain("**Version:** 1.42.0 ·");
  });

  it("lässt keine Backticks aus der Eingabe in die Code-Spannen", () => {
    const a = baueAufgabe({ ...EINGABE, id: "abc`def12" }, KONTEXT);
    expect(a.description).toContain("Rückmeldung `abcdef12`");
  });
});

describe("seiteOhneQuery", () => {
  it("behält Herkunft und Pfad", () => {
    expect(seiteOhneQuery("http://portal.localtest.me:3102/profil?x=1#y")).toBe(
      "http://portal.localtest.me:3102/profil",
    );
  });
});

describe("kurzerBrowser", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15", "Safari 18 · macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0", "Edge 140 · Windows"],
    ["Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36", "Chrome 140 · Android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1", "Safari 18 · iOS"],
  ])("%s", (ua, kurz) => {
    expect(kurzerBrowser(ua)).toBe(kurz);
  });

  it("behält Unbekanntes gekürzt", () => {
    expect(kurzerBrowser("curl/8.0")).toBe("curl/8.0");
    expect(kurzerBrowser("")).toBe("unbekannt");
  });
});
