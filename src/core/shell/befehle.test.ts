import { describe, expect, it } from "vitest";
import { befehle, istPalettenKuerzel, SPRUNGZIELE_MAX } from "./befehle";
import type { LauncherEintrag, Sprungziel, SuiteNavItem } from "./types";

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

  it("findet Umlaute auch ausgeschrieben und ohne Akzent („pruef“, „pruf“ → „Prüfungen“)", () => {
    const nav = [{ key: "pruef", title: "Prüfungen", href: "/p" }];
    for (const eingabe of ["pruef", "pruf", "PRÜF"]) {
      expect(befehle({ eingabe, nav, eintraege: [], suchHref: null }).map((b) => b.key)).toEqual(["nav:pruef"]);
    }
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

describe("befehle — Stichworte und Sprungziele (IDA-380)", () => {
  const nav: SuiteNavItem[] = [
    { key: "auffuellen", title: "Auffüllen", href: "/auffuellen", stichworte: ["Wareneingang"] },
    { key: "verfall", title: "Verfall", href: "/verwaltung/verfall" },
  ];
  const ziele: Sprungziel[] = Array.from({ length: 12 }, (_, i) => ({
    key: `a${i}`, titel: `Kompresse ${i}`, hinweis: "Artikel", href: `/verwaltung/artikel?artikel=a${i}`,
  }));

  it("ein Stichwort findet die Seite, ohne sichtbar zu werden", () => {
    expect(befehle({ eingabe: "waren", nav, eintraege: [], suchHref: null })).toEqual([
      { key: "nav:auffuellen", titel: "Auffüllen", hinweis: undefined, gruppe: "Seiten", href: "/auffuellen", extern: false },
    ]);
  });

  it("Sprungziele erst ab zwei Zeichen, höchstens SPRUNGZIELE_MAX, nach den Seiten und vor den Apps", () => {
    expect(befehle({ eingabe: "", nav, eintraege: APPS, suchHref: null, sprungziele: ziele })
      .some((b) => b.gruppe === "In diesem Modul")).toBe(false);
    expect(befehle({ eingabe: "k", nav, eintraege: [], suchHref: null, sprungziele: ziele })).toEqual([]);
    const liste = befehle({ eingabe: "kompr", nav, eintraege: [], suchHref: SUCHE, sprungziele: ziele });
    expect(liste.filter((b) => b.gruppe === "In diesem Modul")).toHaveLength(SPRUNGZIELE_MAX);
    expect(liste[0]).toMatchObject({ key: "ziel:a0", hinweis: "Artikel", extern: false });
    expect(liste.at(-1)?.gruppe).toBe("Suche");
  });

  it("Stichworte eines Sprungziels zählen mit (Kennzeichen)", () => {
    const rtw: Sprungziel = { key: "rtw", titel: "RTW 1", href: "/f/rtw", stichworte: ["UE-RK 831"] };
    expect(befehle({ eingabe: "rk 831", nav: [], eintraege: [], suchHref: null, sprungziele: [rtw] }).map((b) => b.key))
      .toEqual(["ziel:rtw"]);
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
