import { RECIPES } from "@einsatzzeichen/catalog";
import { describe, expect, it } from "vitest";

import { ORDNUNG, kanonischerSchluessel } from "./kanon";

const HAUPT = Object.entries(RECIPES).filter(([k]) => !k.includes("#"));

describe("kanonischerSchluessel", () => {
  /*
   * GEMESSEN: 232 Rezepte ergeben 232 verschiedene Schluessel, 0 Kollisionen;
   * Median-Laenge 123, Maximum 510 Zeichen. Der Schluessel traegt zwei Lasten:
   * die Frage „diese Zusammenstellung habe ich schon gespeichert?" und die
   * Bewertung der Bauuebung.
   */
  it("gibt 232 Rezepten 232 verschiedene Schluessel", () => {
    expect(HAUPT.length).toBe(232);
    const schluessel = new Set(HAUPT.map(([, r]) => kanonischerSchluessel(r.spec)));
    expect(schluessel.size).toBe(232);
  });

  it("behandelt ein leeres Array wie ein weggelassenes Feld", () => {
    expect(kanonischerSchluessel({ kind: "formation", bodyMarks: [] } as never)).toBe(
      kanonischerSchluessel({ kind: "formation" } as never),
    );
  });

  it("ist gegen die Reihenfolge in capabilities unempfindlich", () => {
    const a = { kind: "formation", capabilities: ["transport", "fire-fighting"] } as never;
    const b = { kind: "formation", capabilities: ["fire-fighting", "transport"] } as never;
    expect(kanonischerSchluessel(a)).toBe(kanonischerSchluessel(b));
  });

  /*
   * DIE SPEC, DIE matchFingerprint FAELSCHLICH DURCHWINKT. Gemessen besteht
   * {kind:'formation', organization:'thw', strength:'staffel'} gegen den Kennwert
   * von C.1.1 „Loeschstaffel" mit {"ok":true,"problems":[]} — falsche Organisation,
   * Faehigkeit fehlt vollstaendig. matchFingerprint vergleicht vier Huellwerte des
   * Koerper-Primitivs; Farbe, Kopfzone, Piktogramm und Beschriftung gehen nicht ein.
   * Als Bewerter waere es ein Pruefer, der die falsche Organisation durchwinkt.
   */
  it("lehnt ab, was matchFingerprint faelschlich durchwinkt", () => {
    const falsch = { kind: "formation", organization: "thw", strength: "staffel" } as never;
    const richtig = RECIPES["C.1.1"].spec;
    expect(kanonischerSchluessel(falsch)).not.toBe(kanonischerSchluessel(richtig));
  });

  /*
   * DER FELDWAECHTER. ORDNUNG ist eine handgeschriebene Liste — ein in einer
   * kuenftigen Paketversion hinzukommendes SymbolSpec-Feld wuerde still
   * weggelassen, und zwei verschiedene Zeichen bekaemen denselben Schluessel.
   * Dieser Test macht daraus einen roten Lauf statt eines stillen Datenverlusts.
   */
  it("ORDNUNG deckt jedes in den Rezepten vorkommende Spec-Feld ab", () => {
    const vorhanden = new Set<string>();
    for (const [, r] of HAUPT) for (const k of Object.keys(r.spec)) vorhanden.add(k);
    const unbekannt = [...vorhanden].filter((k) => !(ORDNUNG as readonly string[]).includes(k));
    expect(unbekannt).toEqual([]);
  });
});
