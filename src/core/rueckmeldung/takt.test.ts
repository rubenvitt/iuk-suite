import { beforeEach, describe, expect, it } from "vitest";

import { TAKT_FENSTER_MS, TAKT_GRENZE, _taktZuruecksetzen, gibTaktZurueck, nimmTakt } from "@/core/rueckmeldung/takt";

describe("nimmTakt", () => {
  beforeEach(_taktZuruecksetzen);

  it("lässt fünf je Stunde durch und die sechste nicht", () => {
    for (let i = 0; i < TAKT_GRENZE; i++) expect(nimmTakt("u1", 1000 + i)).toBe(true);
    expect(nimmTakt("u1", 2000)).toBe(false);
  });

  it("zählt je Person", () => {
    for (let i = 0; i < TAKT_GRENZE; i++) nimmTakt("u1", 1000);
    expect(nimmTakt("u2", 1000)).toBe(true);
  });

  it("gibt nach einer Stunde wieder frei", () => {
    for (let i = 0; i < TAKT_GRENZE; i++) nimmTakt("u1", 1000);
    expect(nimmTakt("u1", 1000 + TAKT_FENSTER_MS)).toBe(true);
  });

  it("zählt einen gescheiterten Versand nicht mit", () => {
    for (let i = 0; i < TAKT_GRENZE; i++) {
      nimmTakt("u1", 1000);
      gibTaktZurueck("u1");
    }
    expect(nimmTakt("u1", 1000)).toBe(true);
  });
});
