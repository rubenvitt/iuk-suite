import { describe, expect, it } from "vitest";
import { MODULES } from "@/core/registry";
import { MARKEN, basisFuer, markeFuerHost, metadatenFuerHost, vorschauBildUrl } from "./index";

describe("Seitentitel und Linkvorschau je Host", () => {
  it("nennt auf einem Modul-Host das Modul, sonst IDA", () => {
    expect(markeFuerHost("lagerbuch.localtest.me:3000").titel).toBe("Lagerbuch");
    expect(markeFuerHost("wartung.localtest.me").titel).toBe("Gerätewartung");
    expect(markeFuerHost("portal.localtest.me").titel).toBe("IDA");
    expect(markeFuerHost("").titel).toBe("IDA");
    expect(markeFuerHost("unbekannt.example").titel).toBe("IDA");
  });

  it("gibt dem Einstiegshost von „Ehrlich gesagt“ seinen eigenen Namen", () => {
    expect(markeFuerHost("ehrlich-gesagt.localtest.me").titel).toBe("Ehrlich gesagt");
  });

  it("hat ein Vorschaubild für jedes Modul", () => {
    const namen = new Set(MARKEN.map((m) => m.name));
    for (const m of MODULES) expect(namen.has(m.key === "portal" ? "ida" : m.key), m.key).toBe(true);
    expect(MARKEN.every((m) => /^[a-z]+$/.test(m.name))).toBe(true);
  });

  it("setzt Vorlage, Open Graph und Twitter-Karte mit absolutem Bild", () => {
    const m = metadatenFuerHost("radio.localtest.me:3000");
    expect(m.title).toEqual({ default: "Funkgeräte", template: "%s · Funkgeräte" });
    expect(m.metadataBase?.toString()).toBe("http://radio.localtest.me:3000/");
    expect(m.openGraph).toMatchObject({ siteName: "Funkgeräte · IDA", locale: "de_DE", type: "website" });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
    const bild = (m.openGraph?.images as { url: string }[])[0];
    expect(bild.url).toMatch(/^\/favicon\/vorschau-radio\.png\?v=[a-z0-9]+$/);
    // Kein Seitentitel in Open Graph: Next nimmt dann den fertigen <title> der Seite.
    expect(m.openGraph).not.toHaveProperty("title");
  });

  it("baut die Basis aus dem Host und verwirft Unbrauchbares", () => {
    expect(basisFuer("radio.localtest.me:3000")?.toString()).toBe("http://radio.localtest.me:3000/");
    expect(basisFuer("")).toBeUndefined();
    expect(basisFuer("a b")).toBeUndefined();
    expect(basisFuer("evil.example/pfad")).toBeUndefined();
    expect(basisFuer("nutzer@evil.example")).toBeUndefined();
  });

  it("ändert die Bild-URL mit dem Titel", () => {
    const a = vorschauBildUrl({ name: "qr", titel: "QR-Codes", zeichen: "qr" });
    const b = vorschauBildUrl({ name: "qr", titel: "QR", zeichen: "qr" });
    expect(a).not.toBe(b);
  });
});
