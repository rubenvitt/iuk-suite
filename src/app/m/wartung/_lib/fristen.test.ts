import { describe, expect, it } from "vitest";
import { fristStand, intervallText, naechsteFrist, plusMonate, tageBis, zustandAus, type FristVorlage } from "./fristen";

const QUARTAL: FristVorlage = { id: "q", name: "Quartalsprüfung", wer: "intern", monate: 3, stunden: null };
const WARTUNG: FristVorlage = { id: "w", name: "Wartung", wer: "fachfirma", monate: 12, stunden: 100 };
const HEUTE = "2026-11-01";

describe("Fristrechnung der Gerätewartung", () => {
  it("rechnet Monate als Kalendermonate, der 31. wird Monatsletzter", () => {
    expect(plusMonate("2026-08-31", 3)).toBe("2026-11-30");
    expect(plusMonate("2026-11-30", 3)).toBe("2027-02-28");
    expect(plusMonate("2026-01-15", 12)).toBe("2027-01-15");
    expect(tageBis("2026-11-05", HEUTE)).toBe(4);
  });

  it("nie erledigt ist überfällig", () => {
    const f = fristStand(QUARTAL, null, null, HEUTE);
    expect(f.stufe).toBe("ueberfaellig");
    expect(f.text).toBe("noch nie erledigt");
  });

  it("nach Zeit: im Plan, bald, überfällig", () => {
    expect(fristStand(QUARTAL, { am: "2026-10-01", stunden: null }, null, HEUTE).stufe).toBe("ok");
    const bald = fristStand(QUARTAL, { am: "2026-08-20", stunden: null }, null, HEUTE);
    expect(bald.stufe).toBe("bald");
    expect(bald.text).toBe("fällig in 19 Tagen");
    const ueber = fristStand(QUARTAL, { am: "2026-07-12", stunden: null }, null, HEUTE);
    expect(ueber.stufe).toBe("ueberfaellig");
    expect(ueber.text).toBe("seit 20 Tagen überfällig");
  });

  it("nach Stunden oder Zeit, was zuerst kommt", () => {
    const stunden = fristStand(WARTUNG, { am: "2026-09-01", stunden: 340 }, 445, HEUTE);
    expect(stunden.stufe).toBe("ueberfaellig");
    expect(stunden.text).toBe("5 h über dem Intervall");
    const knapp = fristStand(WARTUNG, { am: "2026-09-01", stunden: 340 }, 425, HEUTE);
    expect(knapp.stufe).toBe("bald");
    expect(knapp.text).toBe("noch 15 Betriebsstunden");
    const imPlan = fristStand(WARTUNG, { am: "2026-09-01", stunden: 340 }, 350, HEUTE);
    expect(imPlan.stufe).toBe("ok");
    expect(imPlan.text).toBe("fällig 01.09.2027 oder in 90 h");
  });

  it("ohne Stand am Zähler zählt nur die Zeit", () => {
    expect(fristStand(WARTUNG, { am: "2026-09-01", stunden: null }, 999, HEUTE).stufe).toBe("ok");
  });

  it("die nächste Frist ist die dringendste", () => {
    const a = fristStand(QUARTAL, { am: "2026-10-01", stunden: null }, null, HEUTE);
    const b = fristStand(WARTUNG, null, null, HEUTE);
    expect(naechsteFrist([a, b])?.vorlage.id).toBe("w");
    expect(naechsteFrist([])).toBeNull();
  });

  it("der Zustand folgt aus den offenen Mängeln", () => {
    expect(zustandAus([])).toBe("ok");
    expect(zustandAus([{ einsatzbereit: true }])).toBe("mangel");
    expect(zustandAus([{ einsatzbereit: true }, { einsatzbereit: false }])).toBe("defekt");
  });

  it("beschreibt das Intervall", () => {
    expect(intervallText(QUARTAL)).toBe("alle 3 Monate");
    expect(intervallText(WARTUNG)).toBe("jährlich oder alle 100 Betriebsstunden, was zuerst kommt");
  });
});
