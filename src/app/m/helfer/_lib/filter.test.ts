import { describe, expect, it } from "vitest";
import { ausschlussgrund, filterSchema, statusParameter, STANDARD_FILTER, type Importfilter } from "./filter";
import type { QuellPerson } from "./hiorg/person";

const p = (teil: Partial<QuellPerson> = {}): QuellPerson => ({
  quellId: "x", vorname: "Jana", nachname: "Albers", status: "aktiv", gesperrt: false, austritt: null,
  gruppen: ["Bereitschaft"], qualifikationen: [], ...teil,
});
const HEUTE = "2026-10-20";

describe("ausschlussgrund", () => {
  it("lässt eine aktive Person mit dem Standardfilter durch", () => {
    expect(ausschlussgrund(p(), STANDARD_FILTER, HEUTE)).toBeNull();
  });

  it("gesperrt kommt nie hinein — als Status und als Kennzeichen, auch wenn der Status gewählt wäre", () => {
    expect(ausschlussgrund(p({ gesperrt: true }), STANDARD_FILTER, HEUTE)).toBe("gesperrt");
    expect(ausschlussgrund(p({ status: "gesperrt" }), { ...STANDARD_FILTER, status: ["aktiv", "extern", "eingeschraenkt"] }, HEUTE)).toBe("gesperrt");
  });

  it("ausgetreten ab dem Austrittstag, ein künftiger Austritt zählt noch nicht", () => {
    expect(ausschlussgrund(p({ austritt: "2026-10-20" }), STANDARD_FILTER, HEUTE)).toBe("ausgetreten");
    expect(ausschlussgrund(p({ austritt: "2025-12-31" }), STANDARD_FILTER, HEUTE)).toBe("ausgetreten");
    expect(ausschlussgrund(p({ austritt: "2026-10-21" }), STANDARD_FILTER, HEUTE)).toBeNull();
  });

  it("nur die gewählten Kontostatus; ein unbekannter Status fällt durch", () => {
    expect(ausschlussgrund(p({ status: "extern" }), STANDARD_FILTER, HEUTE)).toBe("status");
    expect(ausschlussgrund(p({ status: "extern" }), { ...STANDARD_FILTER, status: ["aktiv", "extern"] }, HEUTE)).toBeNull();
    expect(ausschlussgrund(p({ status: "neu-bei-hiorg" }), STANDARD_FILTER, HEUTE)).toBe("status");
  });

  it("Gruppen: Ausschluss vor Einschluss, ohne Groß-/Kleinschreibung", () => {
    const f: Importfilter = { status: ["aktiv"], gruppenEin: ["bereitschaft"], gruppenAus: ["Passive "] };
    expect(ausschlussgrund(p({ gruppen: ["Bereitschaft"] }), f, HEUTE)).toBeNull();
    expect(ausschlussgrund(p({ gruppen: ["Bereitschaft", "passive"] }), f, HEUTE)).toBe("gruppe_ausgeschlossen");
    expect(ausschlussgrund(p({ gruppen: ["Jugendrotkreuz"] }), f, HEUTE)).toBe("gruppe_fehlt");
    expect(ausschlussgrund(p({ gruppen: [] }), { ...f, gruppenEin: [] }, HEUTE)).toBeNull();
  });
});

describe("filterSchema", () => {
  it("verlangt mindestens einen Status und lässt „gesperrt“ nicht wählen", () => {
    expect(filterSchema.safeParse({ status: [], gruppenEin: [], gruppenAus: [] }).success).toBe(false);
    expect(filterSchema.safeParse({ status: ["gesperrt"], gruppenEin: [], gruppenAus: [] }).success).toBe(false);
    expect(filterSchema.safeParse(STANDARD_FILTER).success).toBe(true);
  });
  it("statusParameter geht als filter[status] an HiOrg", () => {
    expect(statusParameter({ ...STANDARD_FILTER, status: ["aktiv", "extern", "aktiv"] })).toBe("aktiv,extern");
  });
});
