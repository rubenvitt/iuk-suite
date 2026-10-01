import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { qrSvg } from "@/core/qr";
import { QR_BOX } from "./layout/masse";
import { qrGrafikAus } from "./qrGrafik";

// Ein ECHTER Token (Kritik): "A".repeat(43) kodiert qrcode alphanumerisch und kommt mit Version 7 aus; base64url mit
// Groß- und Kleinbuchstaben ist ein Byte-Segment und braucht bei Fehlerkorrektur H Version 8.
const URL_ = `https://kommplan.iuk-ue.de/t/${randomBytes(32).toString("base64url")}`;

describe("QR-Grafik aus core/qr (Entscheidung 11)", () => {
  it("liest Modulzahl samt Rand und den Pfad der dunklen Module — 72 Zeichen ergeben 57 × 57", async () => {
    const g = qrGrafikAus(await qrSvg(URL_), URL_);
    expect(URL_).toHaveLength(72);
    expect(g.module).toBe(57); // Version 8: 49 Module + 2 × 4 Rand
    expect(g.pfad).toMatch(/^M\d/);
    expect(g.ziel).toBe(URL_);
    expect(QR_BOX.kante / g.module).toBeGreaterThanOrEqual(0.4); // mm je Modul (24 mm → 0,42)
  });
  it("unerwartete Form wirft — lieber kein Druck als ein falscher Code", () => {
    expect(() => qrGrafikAus("<svg/>", URL_)).toThrow();
  });
});
