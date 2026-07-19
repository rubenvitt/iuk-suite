import { describe, it, expect } from "vitest";
import { payloadToSvg, QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";

describe("payloadToSvg", () => {
  it("liefert ein SVG", async () => {
    const svg = await payloadToSvg("https://drk.de");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("nutzt reines Schwarz auf Weiß — Scan-Sicherheit im Einsatz", async () => {
    const svg = await payloadToSvg("x");
    expect(svg).toContain("#000000");
    expect(svg).toContain("#ffffff");
  });

  it("leerer Text wirft", async () => {
    await expect(payloadToSvg("")).rejects.toThrow();
  });

  it("Text über dem Limit wirft", async () => {
    await expect(payloadToSvg("a".repeat(QR_MAX_LENGTH + 1))).rejects.toThrow();
  });

  it("Text genau am Limit ist erlaubt", async () => {
    await expect(payloadToSvg("a".repeat(QR_MAX_LENGTH))).resolves.toContain("<svg");
  });
});
