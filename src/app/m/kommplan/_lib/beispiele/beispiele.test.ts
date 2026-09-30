import { describe, expect, it } from "vitest";
import zeichen from "../zeichen/zeichen.generiert.json";
import { MIN_MASSSTAB } from "../layout/masse";
import { teileAuf } from "../layout/papier";
import { pruefeAlles } from "../layout/pruefung";
import { zeichne } from "../layout/zeichne";
import { BEISPIELE } from "./index";

const nach = (id: string) => BEISPIELE.find((b) => b.id === id)!;

describe("Beispielpläne", () => {
  it("fünf Beispiele mit eindeutigen IDs und gültigen Daten", () => {
    expect(BEISPIELE.map((b) => b.id)).toEqual([
      "beispiel-einsatz-2026-02-22", "beispiel-openr-2022-07-01", "vorlage-kommunikationsplan-label",
      "vorlage-fernmeldeskizze-stab", "beispiel-grosse-stabslage",
    ]);
    for (const b of BEISPIELE) {
      if (b.datum !== null) expect(b.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(b.stand))).toBe(false);
    }
  });
  it("jeder verwendete Zeichenschlüssel steht im Generat", () => {
    const bekannt = new Set(Object.keys(zeichen.zeichen));
    for (const b of BEISPIELE) for (const s of b.inhalt.stellen) if (s.zeichen) expect(bekannt.has(s.zeichen), `${b.id}: ${s.zeichen}`).toBe(true);
  });
  it.each(BEISPIELE.map((b) => [b.id]))("%s: sauber und angebunden auf Bildschirm und A4, jedes Blatt ebenso", (id) => {
    const inhalt = nach(id).inhalt;
    for (const ziel of ["bildschirm", "a4-quer"] as const) {
      const z = zeichne(inhalt, ziel);
      expect(pruefeAlles(z, inhalt).map((b) => b.text), ziel).toEqual([]);
    }
    for (const blatt of teileAuf(inhalt, "a4-quer")) {
      const z = blatt.zeichnung;
      expect(pruefeAlles(z, inhalt).map((b) => b.text), `Blatt ${blatt.nummer}`).toEqual([]);
    }
  });
  /*
   * DIE ABNAHME: was die Excel-Vorlage heute auf EIN Blatt bringt, muss auch hier auf eines passen,
   * bei mindestens 6 pt. Ein Aufteilen wäre ein Rückschritt gegenüber der Vorlage.
   */
  it.each([["beispiel-einsatz-2026-02-22"], ["beispiel-openr-2022-07-01"], ["vorlage-kommunikationsplan-label"], ["vorlage-fernmeldeskizze-stab"]])(
    "%s passt auf ein Blatt A4 quer bei mindestens 6 pt",
    (id) => {
      const blaetter = teileAuf(nach(id).inhalt, "a4-quer");
      expect(blaetter).toHaveLength(1);
      expect(blaetter[0].massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    },
  );
  it("die große Stab-Lage teilt auf, jedes Blatt lesbar, jede Stelle genau einmal", () => {
    const b = nach("beispiel-grosse-stabslage");
    const blaetter = teileAuf(b.inhalt, "a4-quer");
    expect(blaetter.length).toBeGreaterThanOrEqual(2);
    for (const bl of blaetter) expect(bl.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    const normal = blaetter.flatMap((bl) => bl.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));
    expect(normal.sort()).toEqual(b.inhalt.stellen.map((s) => s.id).sort());
    expect(zeichne(b.inhalt, "a4-quer").karten.some((k) => k.id.startsWith("ea-4-"))).toBe(true);
  });
  it("große Stab-Lage, Blatt 1: Stab, KatSL, Leitstelle und TEL als Karten, die Abschnitte als Karte oder Verweis in steigender Folge", () => {
    const [erstes] = teileAuf(nach("beispiel-grosse-stabslage").inhalt, "a4-quer");
    const art = (id: string) => erstes.zeichnung.karten.find((k) => k.id === id)?.art;
    for (const id of ["stab", "katsl", "lts", "tel"]) expect(art(id), id).toBe("normal"); // früher: TEL als Verweis, Blatt 1 fast leer
    for (let a = 1; a <= 4; a++) expect(["normal", "verweis"]).toContain(art(`eal-${a}`));
    const verweise = erstes.zeichnung.karten.filter((k) => k.art === "verweis").sort((p, q) => p.x - q.x);
    expect(verweise.length).toBeGreaterThan(0);
    const nummern = verweise.map((k) => Number(k.verweis!.text.replace("→ Blatt ", "")));
    expect(nummern).toEqual([...nummern].sort((p, q) => p - q));
  });
});
