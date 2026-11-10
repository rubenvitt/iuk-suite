import { describe, expect, it } from "vitest";
import { MANGEL_KURZ_MAX, mangelKurz } from "./telefon";

describe("mangelKurz (IDA-381)", () => {
  it("lässt Kurzes stehen und macht aus Zeilenumbrüchen eine Zeile", () => {
    expect(mangelKurz("Griff locker")).toBe("Griff locker");
    expect(mangelKurz("  Kabel\nangescheuert  ")).toBe("Kabel angescheuert");
  });

  it("kürzt Langes an einer Wortgrenze mit „…“ und bleibt unter der Grenze", () => {
    const lang = "Der Tankdeckel schließt nicht mehr richtig, beim Kippen läuft Benzin aus und riecht im ganzen Fahrzeug";
    const k = mangelKurz(lang);
    expect(k.length).toBeLessThanOrEqual(MANGEL_KURZ_MAX);
    expect(k.endsWith("…")).toBe(true);
    expect(lang.startsWith(k.slice(0, -1))).toBe(true);
    expect(k).not.toMatch(/[\s,]…$/);
  });

  it("schneidet ein Wort ohne Leerzeichen hart", () => {
    expect(mangelKurz("x".repeat(200), 10)).toBe(`${"x".repeat(9)}…`);
  });
});
