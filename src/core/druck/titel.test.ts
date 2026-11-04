import { describe, expect, it } from "vitest";
import { druckTitel, pdfDateiname } from "./titel";

// 14.11.2026, 23:30 Uhr in Berlin — in UTC schon der 14., kurz vor Mitternacht der Suite-Zone.
const AM = Date.UTC(2026, 10, 14, 22, 30);

describe("druckTitel", () => {
  it("verbindet Teile, lässt leere weg und hängt den Tag der Suite-Zone an", () => {
    expect(druckTitel(["Mietvertrag Bar", null, "", false, "unterschrieben"], AM)).toBe("Mietvertrag Bar – unterschrieben 2026-11-14");
  });

  it("nimmt Zeichen heraus, die kein Dateiname verträgt", () => {
    expect(druckTitel(["Plan: A/B", "x\ny"])).toBe("Plan A B – x y");
  });

  it("kürzt überlange Titel", () => {
    expect(druckTitel(["a".repeat(300)]).length).toBeLessThanOrEqual(120);
  });

  it("macht daraus einen PDF-Namen, nie einen leeren", () => {
    expect(pdfDateiname(["Mietvertrag Bar"], AM)).toBe("Mietvertrag Bar 2026-11-14.pdf");
    expect(pdfDateiname([""])).toBe("Dokument.pdf");
  });
});
