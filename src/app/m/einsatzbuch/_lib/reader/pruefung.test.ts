import { describe, expect, it } from "vitest";
import { beispielEinsatz } from "../kern/testhilfe";
import { einsatzSchema } from "./pruefung";

describe("einsatzSchema: Angaben je Patient", () => {
  const vorOrt = { art: "vorOrt" as const, einsatznummer: "", durch: "" };
  const transport = { art: "transport" as const, einsatznummer: "2608-0193", durch: "RTW 11-83-1" };
  const mit = (vorOrtZahl: number, transportZahl: number, patienten: unknown[]) =>
    einsatzSchema.safeParse({ ...beispielEinsatz(), vorOrt: vorOrtZahl, transport: transportZahl, patienten }).success;

  it("ohne Schlüssel gültig wie bisher", () => {
    expect(einsatzSchema.safeParse(beispielEinsatz()).success).toBe(true);
  });
  it("je gezähltem Patient genau eine Zeile", () => {
    expect(mit(1, 2, [vorOrt, transport, transport])).toBe(true);
    expect(mit(1, 2, [vorOrt, transport])).toBe(false);
    expect(mit(0, 1, [vorOrt])).toBe(false);
  });
  it("leer, zu lang oder „durch“ bei vor Ort ist ungültig", () => {
    expect(mit(0, 0, [])).toBe(false);
    expect(mit(0, 1, [{ ...transport, einsatznummer: "x".repeat(41) }])).toBe(false);
    expect(mit(0, 1, [{ ...transport, durch: "x".repeat(121) }])).toBe(false);
    expect(mit(1, 0, [{ ...vorOrt, durch: "RTW" }])).toBe(false);
  });
});
