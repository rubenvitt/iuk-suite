import { describe, expect, it } from "vitest";
import type { Faelligkeit } from "@/core/faelligkeiten";
import { sortiereFaelligkeiten, woAnzeige } from "./anzeige";

const f = (id: string, dringlichkeit: Faelligkeit["dringlichkeit"], sortierung: string): Faelligkeit => ({
  id, art: "Verfall", titel: id, wo: null, zustand: "", dringlichkeit, sortierung, pfad: "/",
});

describe("sortiereFaelligkeiten", () => {
  it("überfällig vor bald, dann früheste Frist, „sofort“ (leer) ganz vorn — auf einer Kopie", () => {
    const roh = [f("b2", "bald", "2026-08"), f("u2", "ueberfaellig", "2026-05"), f("b1", "bald", "2026-07"), f("u1", "ueberfaellig", "")];
    expect(sortiereFaelligkeiten(roh).map((x) => x.id)).toEqual(["u1", "u2", "b1", "b2"]);
    expect(roh[0].id).toBe("b2");
  });
});

describe("woAnzeige", () => {
  it("lässt den Ort weg, wenn er schon im Titel steht", () => {
    expect(woAnzeige({ titel: "Accu-Chek Guide (KTW 1)", wo: "KTW 1" })).toBeNull();
    expect(woAnzeige({ titel: "NaCl", wo: "RTW 1" })).toBe("RTW 1");
    expect(woAnzeige({ titel: "NaCl", wo: null })).toBeNull();
  });
});
