import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { qrSvg } from "@/core/qr";
import { plan as planTabelle } from "../_db/schema";
import { stelleFreigabeAus } from "./freigaben";
import { blaetterFuer, druckseitenDaten, interneDruckdaten, qrUrlFuerToken, qrZielIntern } from "./druckdaten";
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

describe("QR-Ziel (Entscheidungen 9, 10)", () => {
  it("intern: nur mit Option, Adresse und gültigem Link — dann der beste, mit Notiz und Ablauf für den Satz", async () => {
    const db = await mitSeed();
    const ohne = ladePlanLesend(db, "beispiel-openr-2022-07-01")!;
    aus(db, ohne.id, "24h");
    expect(qrZielIntern(db, ohne, true, JETZT, BASIS)).toBeNull(); // Option aus
    const p = mitQrOption(db, ohne.id);
    const unbegrenzt = aus(db, p.id, "unbegrenzt");
    expect(qrZielIntern(db, p, true, JETZT, BASIS)).toEqual({ url: `${BASIS}/t/${unbegrenzt.token}`, notiz: null, ablauf: null });
    expect(qrZielIntern(db, p, true, JETZT, null)).toBeNull(); // keine Adresse eingerichtet
    expect(qrZielIntern(db, p, false, JETZT, BASIS)).toBeNull(); // nur Zugangsgruppe: kein QR, der Code wäre der Link
  });
  it("Token-Druck: IMMER der benutzte Token, nie der beste Link des Plans (Review Focus 1)", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-openr-2022-07-01");
    const kurz = aus(db, p.id, "24h");
    aus(db, p.id, "unbegrenzt");
    expect(qrUrlFuerToken(p, kurz.token, BASIS)).toBe(`${BASIS}/t/${kurz.token}`);
  });
  it("Token-Druck ohne die Option qrAufDruck: kein QR, auch mit gültigem Token", async () => {
    const db = await mitSeed();
    const p = ladePlanLesend(db, "beispiel-openr-2022-07-01")!;
    expect(p.inhalt!.optionen.qrAufDruck).toBe(false);
    expect(qrUrlFuerToken(p, aus(db, p.id, "unbegrenzt").token, BASIS)).toBeNull();
  });
  it("der gedruckte Code kodiert genau das Ziel — nicht nur das Attribut daneben (intern und Token)", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-openr-2022-07-01");
    const kurz = aus(db, p.id, "24h");
    aus(db, p.id, "unbegrenzt");
    const ziele = [qrZielIntern(db, p, true, JETZT, BASIS)!.url, qrUrlFuerToken(p, kurz.token, BASIS)!];
    expect(new Set(ziele).size).toBe(2);
    for (const url of ziele) {
      const d = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: url });
      expect(d.rahmen.qr).toEqual(qrGrafikAus(await qrSvg(url), url));
    }
  });
  it("archiviert: kein QR; Druckdaten tragen den QR nur, wenn ein Ziel da ist", async () => {
    const db = await mitSeed();
    const p = mitQrOption(db, "beispiel-einsatz-2026-02-22");
    aus(db, p.id, "unbegrenzt");
    const ziel = qrZielIntern(db, p, true, JETZT, BASIS)!;
    const mit = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: ziel.url, qrSatz: "Der QR-Code führt auf …" });
    expect(mit.rahmen.qr).toMatchObject({ ziel: ziel.url, module: expect.any(Number) });
    expect(mit.qrSatz).toBe("Der QR-Code führt auf …");
    const ohne = await druckseitenDaten(db, p, { format: "a4-quer", qrUrl: null });
    expect(ohne.rahmen.qr).toBeNull();
    expect(ohne.qrSatz).toBeNull();
    archiviere(db, p.id, JETZT);
    expect(qrZielIntern(db, ladePlanLesend(db, p.id)!, true, JETZT, BASIS)).toBeNull();
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

describe("interneDruckdaten: ein Rumpf für die internen Routen A4 und A3 (Abnahme)", () => {
  it("QR samt Satz nur für Bearbeitende, im gewünschten Format, mit SVG-Export", async () => {
    const db = await mitSeed();
    const plan = mitQrOption(db, "beispiel-openr-2022-07-01");
    const f = aus(db, plan.id, "unbegrenzt");
    for (const format of ["a4-quer", "a3-quer"] as const) {
      const mit = await interneDruckdaten(db, plan, true, format, JETZT, BASIS);
      expect(mit.format).toBe(format);
      expect(mit.rahmen.qr?.ziel).toBe(`${BASIS}/t/${f.token}`);
      expect(mit.qrSatz).not.toBeNull();
      expect(mit.svgExport).not.toBeNull();
      const ohne = await interneDruckdaten(db, plan, false, format, JETZT, BASIS);
      expect([ohne.rahmen.qr, ohne.qrSatz]).toEqual([null, null]);
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
