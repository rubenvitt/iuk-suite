import { describe, it, expect } from "vitest";
import { payloadToSvg, exceedsQrCapacity, QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";

// Golden Output: exakt das SVG, das qrcode 1.5.4 mit den fest verdrahteten
// Parametern für "https://drk.de" erzeugt. Es nagelt gleichzeitig fest, was
// keine der übrigen Assertions sieht: das Fehlerkorrektur-Level H (M oder L
// ergäben eine andere Symbolgröße), die Quiet Zone von 4 Modulen (viewBox ist
// um 8 größer als das 25er-Symbol) und den tatsächlich kodierten Inhalt. Die
// Version ist exakt gepinnt, damit die heute im Umlauf befindlichen Codes
// unverändert bleiben — genau deshalb ist der Vergleich hier stabil und nicht
// brüchig. Wenn er rot wird, hat sich ein QR-Parameter geändert; das ist eine
// bewusste Entscheidung und der Wert ist dann neu zu erzeugen.
const GOLDEN_DRK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h33v33H0z"/><path stroke="#000000" d="M4 4.5h7m1 0h3m2 0h2m3 0h7M4 5.5h1m5 0h1m1 0h2m1 0h3m2 0h1m1 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m2 0h1m1 0h2m2 0h1m2 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m2 0h1m3 0h1m2 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h4m1 0h3m2 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M15 11.5h2m1 0h3M7 12.5h1m2 0h1m2 0h2m2 0h1m1 0h1m3 0h3m1 0h2M4 13.5h5m4 0h1m3 0h1m1 0h2m1 0h1m5 0h1M6 14.5h3m1 0h1m1 0h2m1 0h6m1 0h3m2 0h2M6 15.5h2m3 0h5m2 0h3m1 0h1m1 0h1M4 16.5h1m3 0h1m1 0h3m2 0h1m1 0h2m1 0h3m2 0h1m1 0h2M5 17.5h3m1 0h1m2 0h1m2 0h1m2 0h6m1 0h2m1 0h1M4 18.5h1m1 0h1m1 0h5m1 0h2m1 0h1m3 0h1m1 0h2m1 0h1m1 0h1M5 19.5h1m1 0h1m4 0h1m1 0h1m4 0h2m1 0h1m1 0h1m2 0h1M4 20.5h3m1 0h3m1 0h2m1 0h2m3 0h7M12 21.5h1m1 0h1m1 0h2m1 0h2m3 0h2m2 0h1M4 22.5h7m2 0h1m2 0h2m1 0h2m1 0h1m1 0h2m1 0h2M4 23.5h1m5 0h1m6 0h2m1 0h1m3 0h5M4 24.5h1m1 0h3m1 0h1m2 0h2m1 0h1m3 0h6M4 25.5h1m1 0h3m1 0h1m1 0h2m1 0h5m1 0h1m1 0h5M4 26.5h1m1 0h3m1 0h1m2 0h4m2 0h1m3 0h2m1 0h1m1 0h1M4 27.5h1m5 0h1m2 0h1m2 0h1m2 0h4m2 0h1M4 28.5h7m2 0h1m1 0h1m1 0h4m2 0h1m3 0h2"/></svg>
`;

describe("payloadToSvg", () => {
  it("liefert ein SVG", async () => {
    const svg = await payloadToSvg("https://drk.de");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("erzeugt byteweise denselben Code wie bisher — Level H, Quiet Zone, Inhalt", async () => {
    expect(await payloadToSvg("https://drk.de")).toBe(GOLDEN_DRK_SVG);
  });

  it("nutzt reines Schwarz auf Weiß — Scan-Sicherheit im Einsatz", async () => {
    const svg = await payloadToSvg("x");
    expect(svg).toContain("#000000");
    expect(svg).toContain("#ffffff");
  });

  // Die Meldungen sind der eigentliche Zweck der beiden Guards: die Bibliothek
  // lehnt leer und zu lang ohnehin ab, aber auf Englisch. Deshalb wird auf den
  // Text assertiert, sonst blieben die Tests auch ohne Guards grün.
  it("leerer Text wirft mit deutscher Meldung", async () => {
    await expect(payloadToSvg("")).rejects.toThrow(/darf nicht leer sein/);
  });

  it("Text über dem Limit wirft mit deutscher Meldung", async () => {
    await expect(payloadToSvg("a".repeat(QR_MAX_LENGTH + 1))).rejects.toThrow(
      new RegExp(`überschreitet ${QR_MAX_LENGTH}`),
    );
  });

  it("Text genau am Limit ist erlaubt", async () => {
    await expect(payloadToSvg("a".repeat(QR_MAX_LENGTH))).resolves.toContain("<svg");
  });

  // Umlaute belegen in UTF-8 zwei Bytes: 637 Zeichen sind 1274 Bytes und damit
  // über der Kapazität, obwohl text.length weit unter dem Limit läge.
  it("zählt Umlaute als zwei Bytes und lehnt sie über der Grenze deutsch ab", async () => {
    await expect(payloadToSvg("ä".repeat(637))).rejects.toThrow(
      new RegExp(`überschreitet ${QR_MAX_LENGTH}`),
    );
  });

  it("Umlaut-Text knapp unter der Byte-Grenze ist erlaubt", async () => {
    await expect(payloadToSvg("ä".repeat(636))).resolves.toContain("<svg");
  });
});

/**
 * Die Eingabe warnt den Nutzer, bevor er absendet — dafür braucht sie dieselbe
 * Grenze wie der Guard in payloadToSvg. Zählte die UI Zeichen statt Bytes
 * (so stand es im Plan), bliebe sie bei Umlaut- oder Emoji-Text still, während
 * die Erzeugung längst wirft: der Nutzer tippt, drückt und sieht nichts.
 * Deshalb prüft die Suite nicht nur den Rückgabewert, sondern hält ihn gegen
 * das tatsächliche Verhalten von payloadToSvg.
 */
describe("exceedsQrCapacity", () => {
  it.each([
    ["genau am Limit", "a".repeat(QR_MAX_LENGTH), false],
    ["ein Byte darüber", "a".repeat(QR_MAX_LENGTH + 1), true],
    ["Umlaute knapp darunter", "ä".repeat(636), false],
    ["Umlaute knapp darüber", "ä".repeat(637), true],
    ["Emoji knapp darunter", "😀".repeat(318), false],
    ["Emoji knapp darüber", "😀".repeat(319), true],
  ])("%s — Warnung und Erzeugung sind sich einig", async (_name, text, expected) => {
    expect(exceedsQrCapacity(text)).toBe(expected);
    const rejected = await payloadToSvg(text).then(
      () => false,
      () => true,
    );
    expect(rejected).toBe(expected);
  });
});
