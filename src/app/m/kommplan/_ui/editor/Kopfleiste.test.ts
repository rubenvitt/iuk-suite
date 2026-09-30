import { describe, expect, it } from "vitest";
import { statusText } from "./Kopfleiste";

const basis = { version: 1, konflikt: null, zuletztGespeichert: null, fehler: null };

describe("Speicherstatus (Spec §6.2, Entscheidung 19)", () => {
  it("benennt jeden Zustand in Worten, nie nur über Farbe — kurz, damit die Werkzeugleiste nicht umbricht", () => {
    expect(statusText({ ...basis, status: "gespeichert" })).toBe("Gespeichert");
    expect(statusText({ ...basis, status: "gespeichert", zuletztGespeichert: Date.UTC(2026, 8, 30, 9, 5) })).toBe("Gespeichert 11:05");
    expect(statusText({ ...basis, status: "ungespeichert" })).toBe("Ungespeichert");
    expect(statusText({ ...basis, status: "speichert" })).toBe("Speichert …");
    expect(statusText({ ...basis, status: "fehler", fehler: "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist." })).toBe("Nicht gespeichert");
    expect(statusText({ ...basis, status: "konflikt" })).toBe("Konflikt");
  });
  it("kein Text ist länger als der feste Platz (18 Zeichen, CSS `.kp-speicherstatus`)", () => {
    for (const status of ["gespeichert", "ungespeichert", "speichert", "fehler", "konflikt"] as const) {
      expect(statusText({ ...basis, status, zuletztGespeichert: Date.UTC(2026, 8, 30, 9, 5) }).length).toBeLessThanOrEqual(18);
    }
  });
});
