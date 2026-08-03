import { describe, it, expect, vi, afterEach } from "vitest";
import QRCode from "qrcode";
import { qrSvg, qrPng, exceedsQrCapacity, QR_MAX_LENGTH, QR_OPTIONS } from "@/core/qr";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("qrSvg", () => {
  it("liefert ein SVG-Dokument", async () => {
    const svg = await qrSvg("https://example.org");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("leerer Text wirft", async () => {
    await expect(qrSvg("")).rejects.toThrow(/darf nicht leer sein/);
  });

  it("überlange Eingabe wirft — bestehende Kapazitätsprüfung bleibt erhalten", async () => {
    await expect(qrSvg("a".repeat(QR_MAX_LENGTH + 1))).rejects.toThrow(
      new RegExp(`überschreitet ${QR_MAX_LENGTH}`),
    );
  });

  it("Text genau am Limit ist erlaubt", async () => {
    await expect(qrSvg("a".repeat(QR_MAX_LENGTH))).resolves.toContain("<svg");
  });
});

describe("qrPng", () => {
  it("liefert Bytes mit PNG-Signatur", async () => {
    const png = await qrPng("https://example.org");
    expect(png).toBeInstanceOf(Uint8Array);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("leerer Text wirft", async () => {
    await expect(qrPng("")).rejects.toThrow(/darf nicht leer sein/);
  });

  it("überlange Eingabe wirft", async () => {
    await expect(qrPng("a".repeat(QR_MAX_LENGTH + 1))).rejects.toThrow(
      new RegExp(`überschreitet ${QR_MAX_LENGTH}`),
    );
  });
});

describe("qrSvg und qrPng nutzen dieselbe Fehlerkorrekturstufe", () => {
  it("beide rufen QRCode mit demselben errorCorrectionLevel aus QR_OPTIONS auf", async () => {
    const svgSpy = vi.spyOn(QRCode, "toString");
    const pngSpy = vi.spyOn(QRCode, "toBuffer");

    await qrSvg("https://example.org");
    await qrPng("https://example.org");

    const svgOptions = svgSpy.mock.calls[0]?.[1] as { errorCorrectionLevel?: string };
    const pngOptions = pngSpy.mock.calls[0]?.[1] as { errorCorrectionLevel?: string };

    expect(svgOptions.errorCorrectionLevel).toBe(pngOptions.errorCorrectionLevel);
    expect(svgOptions.errorCorrectionLevel).toBe(QR_OPTIONS.errorCorrectionLevel);
  });
});

describe("exceedsQrCapacity", () => {
  it.each([
    ["genau am Limit", "a".repeat(QR_MAX_LENGTH), false],
    ["ein Byte darüber", "a".repeat(QR_MAX_LENGTH + 1), true],
  ])("%s", (_name, text, expected) => {
    expect(exceedsQrCapacity(text)).toBe(expected);
  });
});
