import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { befehle } from "@/core/shell/befehle";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, lagerorte } from "../_db/schema";
import { ENTNAHMEBOX_ID } from "./konstanten";
import { LAGERBUCH_NAV } from "./nav";
import { lagerbuchSprungziele } from "./sprungziele";

const JETZT = new Date("2026-11-10T08:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sprungziele-");
  t.db.insert(lagerorte).values([
    { id: "rtw1", name: "RTW 1", typ: "fahrzeug", kennung: "UE-RK 831", einheitenart: "fahrzeug" },
    { id: "san1", name: "Sanitätstasche 1", typ: "fahrzeug", einheitenart: "tasche" },
    { id: "alt", name: "RTW alt", typ: "fahrzeug", einheitenart: "fahrzeug", aktiv: false },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Kompressen 10x10", einheit: "Stk.", fach: "A3", kategorie: "Verbandmaterial", createdAt: JETZT },
    { id: "a2", name: "Rettungsdecke", einheit: "Stk.", fach: "B1", aktiv: false, createdAt: JETZT },
  ]).run();
});

afterEach(() => t.schliessen());

/** Was „Springen zu" für diese Eingabe anbietet — ohne Apps und ohne suiteweite Suche. */
function springe(eingabe: string) {
  return befehle({ eingabe, nav: LAGERBUCH_NAV, eintraege: [], suchHref: null, sprungziele: lagerbuchSprungziele(t.db) })
    .map((b) => ({ titel: b.titel, href: b.href, gruppe: b.gruppe }));
}

describe("lagerbuchSprungziele", () => {
  it("führt aktive Einheiten und Artikel, Einheiten zuerst; Ausgemustertes fehlt", () => {
    const ziele = lagerbuchSprungziele(t.db);
    const titel = ziele.map((z) => z.titel);
    expect(titel).toContain("RTW 1");
    expect(titel).toContain("Kompressen 10x10");
    expect(titel).not.toContain("RTW alt");
    expect(titel).not.toContain("Rettungsdecke");
    expect(titel.indexOf("RTW 1")).toBeLessThan(titel.indexOf("Kompressen 10x10"));
  });

  it("benennt die Art und führt auf die passende Seite", () => {
    const ziele = new Map(lagerbuchSprungziele(t.db).map((z) => [z.key, z]));
    expect(ziele.get("ort:rtw1")).toMatchObject({ hinweis: "Fahrzeug", href: "/verwaltung/fahrzeuge/rtw1", stichworte: ["UE-RK 831"] });
    expect(ziele.get("ort:san1")).toMatchObject({ hinweis: "Tasche", href: "/verwaltung/fahrzeuge/san1" });
    expect(ziele.get("artikel:a1")).toMatchObject({
      hinweis: "Artikel",
      href: "/verwaltung/artikel?artikel=a1",
      stichworte: ["Verbandmaterial", "A3"],
    });
    const box = ziele.get(`ort:${ENTNAHMEBOX_ID}`);
    if (box) expect(box.href).toBe("/verwaltung/entnahmebox");
  });

  it("trägt nur Zeichenketten — die Liste geht über die RSC-Grenze (Falle 9)", () => {
    const roh = JSON.parse(JSON.stringify(lagerbuchSprungziele(t.db)));
    expect(roh).toEqual(lagerbuchSprungziele(t.db));
  });

  it('die Datei trägt kein "use client" (Falle 6)', () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_lib/sprungziele.ts", "utf8");
    expect(quelle).not.toMatch(/^\s*["']use client["'];?\s*$/m);
  });
});

describe("„Springen zu“ im Lagerbuch (IDA-380)", () => {
  it("„Kompressen“ führt auf den Artikel", () => {
    expect(springe("Kompressen")).toEqual([
      { titel: "Kompressen 10x10", href: "/verwaltung/artikel?artikel=a1", gruppe: "In diesem Modul" },
    ]);
  });

  it("„RTW“ und das Kennzeichen führen auf das Fahrzeug", () => {
    expect(springe("RTW")).toEqual([{ titel: "RTW 1", href: "/verwaltung/fahrzeuge/rtw1", gruppe: "In diesem Modul" }]);
    expect(springe("ue-rk 831")[0]).toMatchObject({ href: "/verwaltung/fahrzeuge/rtw1" });
  });

  it("„Wareneingang“ findet „Auffüllen“, „Aussondern“ findet „Verfall“", () => {
    expect(springe("Wareneingang")).toEqual([{ titel: "Auffüllen", href: "/auffuellen", gruppe: "Seiten" }]);
    expect(springe("Aussondern")).toEqual([{ titel: "Verfall", href: "/verwaltung/verfall", gruppe: "Seiten" }]);
  });

  it("die Kategorie eines Artikels findet ihn auch", () => {
    expect(springe("verband").map((b) => b.titel)).toContain("Kompressen 10x10");
  });
});
