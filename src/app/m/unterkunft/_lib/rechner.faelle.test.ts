import { describe, expect, it } from "vitest";
import faelleDatei from "./lifeline-hub/faelle.json";
import { rechne, type Eingabe } from "./rechner";
import { mitOverrides } from "./richtwerte";

/**
 * Die gemeinsamen Testfälle aus Lifeline Hub (IDA-323; dort LLH-1520, `tests/fixtures/unterkunft/faelle.json`).
 * Dieselbe Datei prüfen dort der TS-Kern und später der Rust-Kern der Rechner-API (LLH-1524). Rechnet die Suite
 * anders, wird diese Datei rot; die Erwartungen werden nie hier angepasst, nur aus Lifeline Hub neu kopiert.
 */
type Fall = { name: string; bezug: string; eingabe: Eingabe; richtwerte: Record<string, number>; erwartet: unknown };
const FAELLE = (faelleDatei as unknown as { faelle: Fall[] }).faelle;

describe("Rechenkern gegen die gemeinsamen Fälle aus Lifeline Hub", () => {
  it.each(FAELLE.map((f) => [f.name, f] as const))("%s", (_name, fall) => {
    expect(rechne(fall.eingabe, mitOverrides(fall.richtwerte))).toEqual(fall.erwartet);
  });

  it("deckt jeden Weg, beide Trennungen und jeden Befund W1–W9 ab", () => {
    expect(FAELLE.length).toBeGreaterThanOrEqual(24);
    const wege = new Set(FAELLE.map((f) => `${f.eingabe.weg}:${f.eingabe.trennung}`));
    for (const weg of ["personen", "raeume", "flaeche", "zelte"]) {
      expect(wege).toContain(`${weg}:true`);
      expect(wege).toContain(`${weg}:false`);
    }
    const bezuege = FAELLE.map((f) => f.bezug).join(" ");
    for (let i = 1; i <= 9; i++) expect(bezuege).toMatch(new RegExp(`W${i}\\b`));
  });
});
