import { describe, expect, it } from "vitest";

import { formatiereDatum } from "@/app/m/portal/_lib/neuigkeiten/datum";

describe("formatiereDatum", () => {
  it("schreibt den Monat aus", () => {
    expect(formatiereDatum("2026-08-16")).toBe("16. August 2026");
  });

  it("hält den Tag am Monatsanfang fest", () => {
    /*
     * DER EIGENTLICHE PUNKT DIESER DATEI. `new Date("2026-08-01")` ist
     * Mitternacht UTC; in jeder Zeitzone westlich davon — und ein CI-Runner
     * steht schneller in `America/*`, als man denkt — formatiert sich daraus
     * der 31. Juli. Der erste Tag eines Monats ist der Fall, in dem das nicht
     * nur ein anderer Tag, sondern ein anderer MONAT wäre.
     */
    expect(formatiereDatum("2026-08-01")).toBe("1. August 2026");
    expect(formatiereDatum("2026-01-01")).toBe("1. Januar 2026");
  });

  it("nimmt den Schalttag an", () => {
    expect(formatiereDatum("2028-02-29")).toBe("29. Februar 2028");
  });

  it("gibt Unsinn unverändert zurück, statt zu werfen", () => {
    // Ein Wurf wäre HTTP 500 für die ganze Seite — wegen einer Metazeile.
    // `register.test.ts` lässt solche Werte gar nicht erst ins Repo.
    expect(formatiereDatum("morgen")).toBe("morgen");
    expect(formatiereDatum("2026-8-1")).toBe("2026-8-1");
  });

  it("erkennt einen Tag, den es nicht gibt", () => {
    // Besteht die Regex, würde `Date.UTC` still in den Folgemonat rollen:
    // aus dem 31. Februar wird der 3. März, und in der Metazeile stünde ein
    // Datum, das in keiner Notiz steht.
    expect(formatiereDatum("2026-02-31")).toBe("2026-02-31");
    expect(formatiereDatum("2026-13-01")).toBe("2026-13-01");
  });
});
