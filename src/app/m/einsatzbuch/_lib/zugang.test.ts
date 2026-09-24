import { describe, expect, it } from "vitest";
import { hatEinsatzbuchZugang } from "./zugang";

describe("hatEinsatzbuchZugang", () => {
  it("die Zugangsgruppe öffnet das Modul", () => {
    expect(hatEinsatzbuchZugang(["einsatzbuch-verwaltung"], {})).toBe(true);
  });
  it("ohne Gruppe, anonym oder mit leerer Liste: kein Zugang", () => {
    expect(hatEinsatzbuchZugang(["andere"], {})).toBe(false);
    expect(hatEinsatzbuchZugang(null, {})).toBe(false);
    expect(hatEinsatzbuchZugang([], {})).toBe(false);
  });
  it("der Suite-Admin allein öffnet das Modul NICHT (hier liegt die Schlüsselfreigabe)", () => {
    expect(hatEinsatzbuchZugang(["dashboard-admins"], {})).toBe(false);
    expect(hatEinsatzbuchZugang(["chef"], { ADMIN_GROUP: "chef" })).toBe(false);
  });
  it("SUITE_ACCESS_GROUP_EINSATZBUCH ersetzt die Vorgabe", () => {
    expect(hatEinsatzbuchZugang(["eb-leitung"], { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toBe(true);
    expect(hatEinsatzbuchZugang(["einsatzbuch-verwaltung"], { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toBe(false);
  });
});
