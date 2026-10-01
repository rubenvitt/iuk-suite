import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { plan as planTabelle } from "../_db/schema";
import { stelleFreigabeAus } from "./freigaben";
import { druckseitenDaten, qrUrlFuerToken, qrZielIntern } from "./druckdaten";
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
  });
});

describe("QR-Ziel (Entscheidungen 9, 10)", () => {
  it("intern: nur mit Option, Adresse und gültigem Link — dann der beste, mit Notiz und Ablauf für den Satz", async () => {
    const db = await mitSeed();
    const ohne = ladePlanLesend(db, "beispiel-openr-2022-07-01")!;
    aus(db, ohne.id, "24h");
    expect(qrZielIntern(db, ohne, JETZT, BASIS)).toBeNull(); // Option aus
    const p = mitQrOption(db, ohne.id);
    const unbegrenzt = aus(db, p.id, "unbegrenzt");
    expect(qrZielIntern(db, p, JETZT, BASIS)).toEqual({ url: `${BASIS}/t/${unbegrenzt.token}`, notiz: null, ablauf: null });
    expect(qrZielIntern(db, p, JETZT, null)).toBeNull(); // keine Adresse eingerichtet
  });
  it("Token-Druck: IMMER der benutzte Token, nie der beste Link des Plans (Review Focus 1)", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-openr-2022-07-01");
    const kurz = aus(db, p.id, "24h");
    aus(db, p.id, "unbegrenzt");
    expect(qrUrlFuerToken(p, kurz.token, BASIS)).toBe(`${BASIS}/t/${kurz.token}`);
  });
  it("archiviert: kein QR; Druckdaten tragen den QR nur, wenn ein Ziel da ist", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-einsatz-2026-02-22");
    aus(db, p.id, "unbegrenzt");
    const ziel = qrZielIntern(db, p, JETZT, BASIS)!;
    const mit = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: ziel.url, qrSatz: "Der QR-Code führt auf …" });
    expect(mit.rahmen.qr).toMatchObject({ ziel: ziel.url, module: expect.any(Number) });
    expect(mit.qrSatz).toBe("Der QR-Code führt auf …");
    const ohne = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null });
    expect(ohne.rahmen.qr).toBeNull();
    expect(ohne.qrSatz).toBeNull();
    archiviere(db, p.id, JETZT);
    expect(qrZielIntern(db, ladePlanLesend(db, p.id)!, JETZT, BASIS)).toBeNull();
  });
  it("Schwarzweiß-Option: graue Symbole und Rahmen mit schwarzweiss", async () => {
    const db = await mitSeed();
    const p0 = ladePlanLesend(db, "beispiel-einsatz-2026-02-22")!;
    db.update(planTabelle).set({ inhalt: JSON.stringify(setzeOptionen(p0.inhalt!, { schwarzweiss: true })) }).where(eq(planTabelle.id, p0.id)).run();
    const d = await druckseitenDaten(db, ladePlanLesend(db, p0.id)!, { format: "a4-quer", qrUrl: null });
    expect(d.rahmen.schwarzweiss).toBe(true);
    for (const s of Object.values(d.symbole)) for (const m of s.inhalt.matchAll(/#([0-9a-f]{6})\b/gi)) {
      const h = m[1].toLowerCase();
      expect(h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6), `#${h}`).toBe(true);
    }
  });
  it("SVG-Export nur auf Wunsch; Tag = Plandatum, sonst der Tag des Stands in der Suite-Zone", async () => {
    const db = await mitSeed();
    const p = ladePlanLesend(db, "beispiel-einsatz-2026-02-22")!;
    expect((await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null })).svgExport).toBeNull();
    expect((await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null, mitSvgExport: true })).svgExport).toEqual({ titel: p.titel, tag: "2026-02-22" });
    const ohneDatum = { ...p, datum: null, aktualisiertAm: Date.UTC(2026, 8, 30, 22, 30) }; // 01.10.2026, 00:30 in Berlin
    expect((await druckseitenDaten(db, ohneDatum, { format: "a4-quer", qrUrl: null, mitSvgExport: true })).svgExport?.tag).toBe("2026-10-01");
  });
});
