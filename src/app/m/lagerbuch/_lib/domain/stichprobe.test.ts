import { describe, expect, it } from "vitest";
import {
  grundText, waehleStichprobe, zufallAus, type StichprobenKandidat,
} from "./stichprobe";

const k = (
  id: string,
  tage: number | null,
  extra: Partial<StichprobenKandidat> = {},
): StichprobenKandidat => ({
  id, artikelId: `a-${id}`, tageSeitZaehlung: tage, verbraucht: false, verfallBald: false, ...extra,
});

const ids = (t: { id: string }[]) => t.map((x) => x.id).sort();

describe("waehleStichprobe", () => {
  it("nimmt Ueberfaelliges vor allem anderen, die aeltesten zuerst", () => {
    const kandidaten = [
      k("frisch1", 1), k("frisch2", 2), k("frisch3", 3),
      k("alt40", 40), k("alt30", 30), k("nie", null),
    ];
    const t = waehleStichprobe(kandidaten, { seed: "s", umfang: 2 });
    expect(ids(t)).toEqual(["alt40", "nie"]);
    expect(t.find((x) => x.id === "nie")?.grund).toBe("nie");
    expect(t.find((x) => x.id === "alt40")?.grund).toBe("ueberfaellig");
  });

  it("fuellt nach der Garantie gewichtet auf, bis der Umfang erreicht ist", () => {
    const kandidaten = Array.from({ length: 30 }, (_, i) => k(`p${i}`, i % 10));
    const t = waehleStichprobe(kandidaten, { seed: "x", umfang: 18 });
    expect(t).toHaveLength(18);
    expect(new Set(t.map((x) => x.id)).size).toBe(18);
  });

  it("ist bei gleichem Seed gleich und bei anderem Seed (meist) anders", () => {
    const kandidaten = Array.from({ length: 60 }, (_, i) => k(`p${i}`, 5));
    const a = waehleStichprobe(kandidaten, { seed: "fz|2026-10-17" });
    const b = waehleStichprobe(kandidaten, { seed: "fz|2026-10-17" });
    const c = waehleStichprobe(kandidaten, { seed: "fz|2026-10-18" });
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).not.toEqual(ids(c));
  });

  it("zieht einen Artikel immer mit ALLEN seinen Positionen", () => {
    const kandidaten = [
      k("x1", 50, { artikelId: "mull" }),
      k("x2", 2, { artikelId: "mull" }),
      ...Array.from({ length: 20 }, (_, i) => k(`p${i}`, 1)),
    ];
    const t = waehleStichprobe(kandidaten, { seed: "s", umfang: 1 });
    // der aeltere Platz macht den Artikel ueberfaellig, und der jüngere kommt mit
    expect(ids(t)).toEqual(["x1", "x2"]);
    expect(t.every((x) => x.grund === "ueberfaellig" && x.tage === 50)).toBe(true);
  });

  it("bevorzugt Verbrauchtes deutlich vor Unveraendertem", () => {
    const kandidaten = [
      ...Array.from({ length: 10 }, (_, i) => k(`v${i}`, 3, { verbraucht: true })),
      ...Array.from({ length: 10 }, (_, i) => k(`r${i}`, 3)),
    ];
    let verbraucht = 0;
    for (let s = 0; s < 200; s++) {
      const t = waehleStichprobe(kandidaten, { seed: `s${s}`, umfang: 5 });
      verbraucht += t.filter((x) => x.id.startsWith("v")).length;
    }
    // Gewicht 3:1 → erwartet deutlich ueber der Haelfte von 1000 Zuegen
    expect(verbraucht).toBeGreaterThan(650);
  });

  it("nennt den Grund einer Gewichtung", () => {
    const t = waehleStichprobe(
      [k("v", 3, { verbraucht: true }), k("f", 3, { verfallBald: true })],
      { seed: "s", umfang: 5 },
    );
    expect(t.find((x) => x.id === "v")?.grund).toBe("verbraucht");
    expect(t.find((x) => x.id === "f")?.grund).toBe("verfall");
  });

  it("liefert bei weniger Kandidaten als Umfang einfach alle", () => {
    expect(waehleStichprobe([k("a", 1), k("b", 2)], { seed: "s" })).toHaveLength(2);
    expect(waehleStichprobe([], { seed: "s" })).toEqual([]);
  });

  it("laesst ueber viele Kurzchecks nichts liegen", () => {
    // 200 Positionen, 18 je Check, zwei Checks pro Woche: nach 28 Tagen ist
    // jede Position mindestens einmal gezaehlt worden.
    const stand = new Map(Array.from({ length: 200 }, (_, i) => [`p${i}`, 0]));
    const gezaehltAm = new Map<string, number>();
    for (let tag = 0; tag < 120; tag += 3.5) {
      const kandidaten = [...stand.keys()].map((id) =>
        k(id, gezaehltAm.has(id) ? Math.floor(tag - gezaehltAm.get(id)!) : null));
      for (const t of waehleStichprobe(kandidaten, { seed: `t${tag}` })) gezaehltAm.set(t.id, tag);
      if (tag >= 60) {
        for (const id of stand.keys()) {
          expect(tag - (gezaehltAm.get(id) ?? -Infinity)).toBeLessThanOrEqual(56);
        }
      }
    }
  });
});

describe("waehleStichprobe — Pflichtkern (IDA-223)", () => {
  it("nimmt „immer zaehlen“ jedes Mal mit, ausserhalb des Umfangs", () => {
    const kandidaten = [
      ...Array.from({ length: 30 }, (_, i) => k(`p${i}`, 40)),
      k("defi", 0, { immerZaehlen: true }), k("o2", 1, { immerZaehlen: true }),
    ];
    for (const seed of ["a", "b", "c"]) {
      const t = waehleStichprobe(kandidaten, { seed, umfang: 5 });
      expect(t).toHaveLength(7);
      expect(t.find((x) => x.id === "defi")?.grund).toBe("pflicht");
      expect(t.find((x) => x.id === "o2")?.grund).toBe("pflicht");
      // Der Umfang bleibt fuer den Rest: fuenf Ueberfaellige, nicht drei.
      expect(t.filter((x) => x.grund === "ueberfaellig")).toHaveLength(5);
    }
  });

  it("zieht einen markierten Artikel mit ALLEN seinen Positionen", () => {
    const t = waehleStichprobe([
      k("fach1", 0, { artikelId: "pad", immerZaehlen: true }),
      k("fach2", 0, { artikelId: "pad" }),
      k("anderes", 0),
    ], { seed: "s", umfang: 0 });
    expect(ids(t)).toEqual(["fach1", "fach2"]);
    expect(t.every((x) => x.grund === "pflicht")).toBe(true);
  });

  it("nennt den Pflichtkern vor jedem anderen Grund", () => {
    const t = waehleStichprobe(
      [k("p", null, { immerZaehlen: true, verbraucht: true })], { seed: "s" });
    expect(t[0].grund).toBe("pflicht");
    expect(grundText(t[0])).toBe("Wird jedes Mal gezählt");
  });
});

describe("zufallAus", () => {
  it("liefert Werte in [0, 1)", () => {
    const z = zufallAus("abc");
    for (let i = 0; i < 1000; i++) {
      const v = z();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("grundText", () => {
  it("spricht in ganzen Saetzen", () => {
    expect(grundText({ grund: "ueberfaellig", tage: 31 })).toBe("Seit 31 Tagen nicht gezählt");
    expect(grundText({ grund: "nie", tage: null })).toBe("Noch nie gezählt");
  });
});
