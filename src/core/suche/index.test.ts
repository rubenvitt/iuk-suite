import { describe, expect, it } from "vitest";
import { HOECHSTLAENGE, falte, kappe, merkmale, suchbegriff, trifft } from "./index";

describe("suchbegriff", () => {
  it("trimmt, nimmt den ersten Wert und lehnt zu kurze Eingaben ab", () => {
    expect(suchbegriff("  RTW ")).toBe("RTW");
    expect(suchbegriff(["ab", "cd"])).toBe("ab");
    expect(suchbegriff("a")).toBeNull();
    expect(suchbegriff("   ")).toBeNull();
    expect(suchbegriff(undefined)).toBeNull();
  });

  it("deckelt die Länge", () => {
    expect(suchbegriff("x".repeat(500))).toHaveLength(HOECHSTLAENGE);
  });
});

describe("falte und trifft", () => {
  it("vergleicht ohne Groß- und Kleinschreibung, auch bei Umlauten", () => {
    expect(falte("Kellerlager  SÜD")).toBe("kellerlager süd");
    expect(trifft(falte("süd"), null, "", "Kellerlager Süd")).toBe(true);
    expect(trifft(falte("nord"), "Kellerlager Süd")).toBe(false);
  });
});

describe("kappe und merkmale", () => {
  it("kappt auf die Grenze und merkt sich, dass es mehr gab", () => {
    const t = (id: string) => ({ id, art: "", titel: "", merkmale: [], pfad: "/" });
    expect(kappe([t("1"), t("2"), t("3")], 2)).toEqual({ treffer: [t("1"), t("2")], mehr: true });
    expect(kappe([t("1")], 2).mehr).toBe(false);
  });

  it("lässt leere Merkmale weg", () => {
    expect(merkmale(["A", "1"], ["B", null], ["C", "  "])).toEqual([{ etikett: "A", wert: "1" }]);
  });
});
