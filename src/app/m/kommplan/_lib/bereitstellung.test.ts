import { describe, expect, it } from "vitest";
import { zeichenAlsSvg, zeichenAuswahl } from "./bereitstellung";
import { speichereEigenesZeichen } from "./eigeneZeichenDb";
import { testDb } from "./testDb";

const ILS = { kind: "post", organization: "fuehrung-leitung", text: { center: "ILS" } };

describe("Zeichen für andere Module", () => {
  it("bietet eigene Zeichen vor dem Katalog an und zeichnet beide als eigenständiges SVG", () => {
    const db = testDb();
    const r = speichereEigenesZeichen(db, { id: null, titel: "ILS Uelzen", zeichen: ILS }, { nutzer: "u1", name: "Jana" }, 1);
    if (!r.ok) throw new Error(r.fehler);
    const auswahl = zeichenAuswahl(db);
    expect(auswahl[0]).toEqual({ schluessel: r.schluessel, titel: "ILS Uelzen" });
    expect(auswahl).toContainEqual({ schluessel: "rezept:E.2.19", titel: "Führungskraftwagen, geländefähig" });

    const svg = zeichenAlsSvg([r.schluessel, "rezept:E.2.19", "rezept:gibt-es-nicht"], db);
    expect(Object.keys(svg).sort()).toEqual([r.schluessel, "rezept:E.2.19"].sort());
    for (const s of Object.values(svg)) expect(s).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. ]+" font-family="[^"]+">[^]+<\/svg>$/);
  });
});
