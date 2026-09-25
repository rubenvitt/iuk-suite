import { describe, expect, it } from "vitest";

import { ankerAbweichungText, stammdatenVomText } from "./verbindung";

describe("stammdatenVomText", () => {
  it("formatiert wie „Stammdaten vom 25.9.2026, 10:00“", () => {
    expect(stammdatenVomText("2026-09-25T10:00:00+02:00", "Europe/Berlin")).toBe("Stammdaten vom 25.9.2026, 10:00");
  });

  it("rechnet in der übergebenen Zone, nicht in UTC", () => {
    expect(stammdatenVomText("2026-09-25T22:30:00Z", "Europe/Berlin")).toBe("Stammdaten vom 26.9.2026, 00:30");
  });

  it("wirft bei einem unlesbaren Zeitpunkt", () => {
    expect(() => stammdatenVomText("nicht-iso", "Europe/Berlin")).toThrow();
  });
});

describe("ankerAbweichungText", () => {
  it("nennt Block, erwarteten und gemeldeten Hash gekürzt auf 8 Zeichen (§8)", () => {
    expect(
      ankerAbweichungText({ block: 5, erwartet: "1a2b3c4d".repeat(8), gemeldet: "99887766".repeat(8) }),
    ).toBe("Anker weicht ab bei Block 5: erwartet #1a2b3c4d, hier #99887766");
  });
});
