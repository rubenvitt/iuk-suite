import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { qrSvg } from "@/core/qr";
import { plan as planTabelle } from "../_db/schema";
import { stelleFreigabeAus } from "./freigaben";
import { blaetterFuer, druckseitenDaten, qrUrlFuerToken, qrZielIntern } from "./druckdaten";
import { teileAuf } from "./layout/papier";
import { pruefeQrAbstand } from "./layout/pruefung";
import { BEISPIELE } from "./beispiele";
import { qrGrafikAus } from "./qrGrafik";
import { setzeOptionen } from "./plan/operationen";
import { archiviere } from "./planverwaltung";
import { ladePlanLesend } from "./plaene";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

async function mitSeed() { const db = testDb(); await seedLokalKommplan(db); return db; }
const BASIS = "https://kommplan.iuk-ue.de";
const JETZT = Date.UTC(2026, 9, 1, 18, 0);
const WER = { nutzer: "u1", name: "Jana" };
function mitQrOption(db: ReturnType<typeof testDb>, id: string) {
  const p = ladePlanLesend(db, id)!;
  db.update(planTabelle).set({ inhalt: JSON.stringify(setzeOptionen(p.inhalt!, { qrAufDruck: true })) }).where(eq(planTabelle.id, id)).run();
  return ladePlanLesend(db, id)!;
}
const aus = (db: ReturnType<typeof testDb>, planId: string, dauer: string) => {
  const r = stelleFreigabeAus(db, { planId, dauer, notiz: "" }, WER, JETZT);
  if (!r.ok) throw new Error(r.fehler);
  return r.freigaben.find((f) => f.id === r.neu)!;
};

describe("Druckdaten (Spec §5.6, §8.1)", () => {
  it("A3 teilt die große Stab-Lage auf höchstens so viele Blätter wie A4, mit A3-Rahmen", async () => {
    const db = await mitSeed();
    const plan = ladePlanLesend(db, "beispiel-grosse-stabslage")!;
    const a4 = await druckseitenDaten(db, plan, { format: "a4-quer", qrUrl: null });
    const a3 = await druckseitenDaten(db, plan, { format: "a3-quer", qrUrl: null });
    expect(a3.format).toBe("a3-quer");
    expect(a3.blaetter!.length).toBeLessThanOrEqual(a4.blaetter!.length);
    expect(a3.rahmen).toMatchObject({ titel: plan.titel, organisation: "Musterorganisation" });
    // Die Blätter kommen aus dem A3-Aufteiler, nicht aus dem A4-Layout auf A3-Papier (Review Phase 5) — und die
    // beiden Layouts unterscheiden sich an diesem Plan, sonst bewiese die Gleichheit nichts.
    expect(teileAuf(plan.inhalt!, "a3-quer")).not.toEqual(teileAuf(plan.inhalt!, "a4-quer"));
    expect(a3.blaetter).toEqual(teileAuf(plan.inhalt!, "a3-quer", { qr: false }));
    expect(a4.blaetter).toEqual(teileAuf(plan.inhalt!, "a4-quer", { qr: false }));
  });
  it("mit QR hält jedes Blatt die QR-Box frei — in beiden Formaten (Review Focus 5, verdrahtet)", async () => {
    const db = await mitSeed();
    const plan = ladePlanLesend(db, "beispiel-openr-2022-07-01")!;
    for (const format of ["a4-quer", "a3-quer"] as const) {
      const d = await druckseitenDaten(db, plan, { format, qrUrl: `${BASIS}/t/${"Q".repeat(43)}` });
      // An A4 verschiebt der QR die Aufteilung dieses Plans (sonst bewiese die Gleichheit nichts): unten rechts stehen
      // Einheiten, wo die Box hin muss. An A3 bleibt Platz genug.
      if (format === "a4-quer") expect(teileAuf(plan.inhalt!, format, { qr: true })).not.toEqual(teileAuf(plan.inhalt!, format, { qr: false }));
      expect(d.blaetter).toEqual(teileAuf(plan.inhalt!, format, { qr: true }));
      for (const b of d.blaetter!) expect(pruefeQrAbstand(b, format).map((x) => x.text), `${format} Blatt ${b.nummer}`).toEqual([]);
    }
  });
});

describe("blaetterFuer: die Aufteilung je Inhalt gemerkt (Abnahme: Token-Druck blockiert den Prozess)", () => {
  const gross = BEISPIELE.find((b) => b.id === "beispiel-grosse-stabslage")!.inhalt;
  it("gleicher Inhalt (auch als Kopie) liefert dieselben Blätter ohne neue Rechnung; Format, QR und Inhalt trennen", () => {
    const erst = blaetterFuer(gross, "a4-quer", false);
    expect(erst).toEqual(teileAuf(gross, "a4-quer"));
    expect(blaetterFuer(structuredClone(gross), "a4-quer", false)).toBe(erst);
    expect(blaetterFuer(gross, "a3-quer", false)).not.toBe(erst);
    expect(blaetterFuer(gross, "a4-quer", true)).toEqual(teileAuf(gross, "a4-quer", { qr: true }));
    const anders = { ...gross, stellen: gross.stellen.map((s, i) => (i === 0 ? { ...s, titel: `${s.titel} neu` } : s)) };
    expect(blaetterFuer(anders, "a4-quer", false)).toEqual(teileAuf(anders, "a4-quer"));
    expect(blaetterFuer(anders, "a4-quer", false)).not.toBe(erst);
  });
});
