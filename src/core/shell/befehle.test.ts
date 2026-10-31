import { describe, expect, it } from "vitest";
import { befehle, istPalettenKuerzel } from "./befehle";
import type { LauncherEintrag, SuiteNavItem } from "./types";

const NAV: SuiteNavItem[] = [
  { key: "start", title: "Übersicht", href: "/" },
  { key: "artikel", title: "Artikel", href: "/verwaltung/artikel", abschnitt: "Bestand" },
];
const APPS: LauncherEintrag[] = [
  { key: "radio", title: "Funkgeräte", href: "https://radio.example", abschnitt: "Apps", extern: false },
  { key: "wiki", title: "Wiki", beschreibung: "Handbücher", href: "https://wiki.example", abschnitt: "Dienste", extern: true },
];
const SUCHE = "https://portal.example/suche";

describe("befehle", () => {
  it("ohne Eingabe: alle Seiten, dann alle Apps, keine Suche", () => {
    expect(befehle({ eingabe: "", nav: NAV, eintraege: APPS, suchHref: SUCHE }).map((b) => b.key))
      .toEqual(["nav:start", "nav:artikel", "app:radio", "app:wiki"]);
  });

  it("filtert über Titel, Abschnitt und Beschreibung; jedes Wort muss passen", () => {
    expect(befehle({ eingabe: "best art", nav: NAV, eintraege: APPS, suchHref: SUCHE }).map((b) => b.key))
      .toEqual(["nav:artikel", "suche"]);
    expect(befehle({ eingabe: "handb", nav: NAV, eintraege: APPS, suchHref: SUCHE })[0])
      .toMatchObject({ key: "app:wiki", extern: true, href: "https://wiki.example" });
  });

  it("die Suche steht immer am Ende, ab zwei Zeichen, mit kodiertem Begriff", () => {
    const liste = befehle({ eingabe: " UE-RK 831 ", nav: NAV, eintraege: APPS, suchHref: SUCHE });
    expect(liste.at(-1)).toMatchObject({
      gruppe: "Suche",
      titel: "In allen Modulen nach „UE-RK 831“ suchen",
      href: "https://portal.example/suche?q=UE-RK%20831",
    });
    expect(befehle({ eingabe: "x", nav: NAV, eintraege: APPS, suchHref: SUCHE }).some((b) => b.key === "suche")).toBe(false);
  });

  it("ohne Portal-Adresse keine Suchzeile — kein toter Link", () => {
    expect(befehle({ eingabe: "rtw", nav: [], eintraege: [], suchHref: null })).toEqual([]);
  });
});

describe("istPalettenKuerzel", () => {
  const taste = (key: string, mod: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>>) =>
    ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mod });

  it("Strg+K und ⌘K, auch bei Feststelltaste", () => {
    expect(istPalettenKuerzel(taste("k", { ctrlKey: true }))).toBe(true);
    expect(istPalettenKuerzel(taste("K", { metaKey: true }))).toBe(true);
  });

  it("nicht ohne Modifikator und nicht mit Shift oder Alt", () => {
    expect(istPalettenKuerzel(taste("k", {}))).toBe(false);
    expect(istPalettenKuerzel(taste("k", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(istPalettenKuerzel(taste("k", { metaKey: true, altKey: true }))).toBe(false);
  });
});
