import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buchung, charge, helferLink } from "../_db/schema";
import { ladeBuchungen, ladeSicht, unterMindest } from "./daten";
import { linkAusCookie, loeseEin } from "./helfer";
import {
  Abgelehnt, artikelAendern, artikelAktiv, artikelAnlegen, artikelVorlaeufig, ausgabe, aussondern, eingang, linkAnlegen,
  linkSperren, ortAktiv, ortAnlegen,
} from "./schreiben";
import { testDb } from "./testDb";

const HEUTE = "2026-11-04";
const W = { jetzt: Date.UTC(2026, 10, 4, 10), heute: HEUTE, wer: "Helfer-Link Dienstabend", linkId: null };

function lager() {
  const db = testDb();
  const ort = ortAnlegen(db, { name: "Regal A", kurz: "A", gekuehlt: false }, W.jetzt);
  const dose = artikelAnlegen(db, {
    name: "Erbsensuppe 800 g", ean: "4000000000017", kategorie: "Konserven", einheit: "Dose", mhdArt: "mhd", rotTage: 7, gelbTage: 30, mindest: 10,
  }, W.jetzt);
  const wurst = artikelAnlegen(db, {
    name: "Wiener Würstchen", ean: null, kategorie: "Kühlware", einheit: "Packung", mhdArt: "verbrauch", rotTage: 2, gelbTage: 5, mindest: null,
  }, W.jetzt);
  return { db, ort, dose, wurst };
}

const fehler = (f: () => unknown) => {
  try { f(); } catch (e) { if (e instanceof Abgelehnt) return e.message; throw e; }
  return null;
};

describe("Ein- und Ausbuchen", () => {
  it("zählt gleiche Ware am gleichen Ort mit gleichem MHD zu einer Charge zusammen", () => {
    const { db, ort, dose } = lager();
    const a = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 4 }, W);
    const b = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 2 }, W);
    expect(b.chargeId).toBe(a.chargeId);
    expect(db.select().from(charge).all()).toMatchObject([{ menge: 6 }]);
    expect(db.select().from(buchung).all()).toHaveLength(2);
  });

  it("IDA-358: dieselbe Sendung zweimal bucht einmal und antwortet wie beim ersten Mal", () => {
    const { db, ort, dose } = lager();
    const ein = "a0000000-0000-4000-8000-000000000001";
    const aus = "a0000000-0000-4000-8000-000000000002";
    const { chargeId } = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 3, sendung: ein }, W);
    expect(eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 3, sendung: ein }, W).chargeId).toBe(chargeId);
    const erste = ausgabe(db, { chargeId, menge: 3, ziel: "Einsatz", sendung: aus }, W);
    // Die Charge ist nach der ersten Ausgabe leer und weg — die Wiederholung wird trotzdem nicht abgewiesen.
    expect(ausgabe(db, { chargeId, menge: 3, ziel: "Einsatz", sendung: aus }, W)).toEqual(erste);
    expect(db.select().from(buchung).all().map((b) => b.id).sort()).toEqual([ein, aus]);
    expect(fehler(() => aussondern(db, { chargeId, menge: 1, grund: "abgelaufen", freitext: "", sendung: ein }, W))).toMatch(/nicht vollständig/);
  });

  it("lehnt ein MHD in der Vergangenheit und halbe Dosen ab", () => {
    const { db, ort, dose } = lager();
    expect(fehler(() => eingang(db, { artikelId: dose, ortId: ort, mhd: "2026-11-03", menge: 1 }, W))).toMatch(/Vergangenheit/);
    expect(fehler(() => eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-01-01", menge: 1.5 }, W))).toMatch(/nur ganz/);
  });

  it("bucht Teilmengen ab und räumt die leere Charge", () => {
    const { db, ort, dose } = lager();
    const { chargeId } = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 3 }, W);
    expect(ausgabe(db, { chargeId, menge: 2, ziel: "Dienstabend" }, W)).toMatchObject({ menge: 2, einheit: "Dose" });
    expect(fehler(() => ausgabe(db, { chargeId, menge: 2, ziel: "Einsatz" }, W))).toMatch(/nur 1 Dose/);
    ausgabe(db, { chargeId, menge: 1, ziel: "Einsatz" }, W);
    expect(db.select().from(charge).all()).toHaveLength(0);
    expect(ladeBuchungen(db).map((b) => [b.art, b.menge, b.ziel])).toEqual(expect.arrayContaining([["ausgabe", 2, "Dienstabend"], ["ausgabe", 1, "Einsatz"]]));
  });

  it("gibt ein abgelaufenes MHD noch aus, ein überschrittenes Verbrauchsdatum nicht", () => {
    const { db, ort, dose, wurst } = lager();
    const vorher = { ...W, heute: "2026-10-01" };
    const d = eingang(db, { artikelId: dose, ortId: ort, mhd: "2026-11-01", menge: 2 }, vorher).chargeId;
    const w = eingang(db, { artikelId: wurst, ortId: ort, mhd: "2026-11-01", menge: 2 }, vorher).chargeId;
    expect(fehler(() => ausgabe(db, { chargeId: d, menge: 1, ziel: "Übung" }, W))).toBeNull();
    expect(fehler(() => ausgabe(db, { chargeId: w, menge: 1, ziel: "Übung" }, W))).toMatch(/Verbrauchsdatum/);
    aussondern(db, { chargeId: w, menge: 2, grund: "abgelaufen", freitext: "" }, W);
    expect(ladeBuchungen(db).find((b) => b.art === "aussonderung")).toMatchObject({ grund: "abgelaufen", menge: 2 });
  });

  it("schreibt den Freitext bei „Sonstiges“ an den Grund", () => {
    const { db, ort, dose } = lager();
    const { chargeId } = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 1 }, W);
    aussondern(db, { chargeId, menge: 1, grund: "Sonstiges", freitext: "Dose aufgebläht" }, W);
    expect(ladeBuchungen(db).find((b) => b.art === "aussonderung")?.grund).toBe("Sonstiges: Dose aufgebläht");
  });

  it("rechnet Bestand und Journal mit derselben gerundeten Menge", () => {
    const { db, ort } = lager();
    const mehl = artikelAnlegen(db, { name: "Mehl", ean: null, kategorie: "Trockenware", einheit: "kg", mhdArt: "mhd", rotTage: 7, gelbTage: 30, mindest: null }, W.jetzt);
    const { chargeId } = eingang(db, { artikelId: mehl, ortId: ort, mhd: "2027-03-01", menge: 1.235 }, W);
    expect(ausgabe(db, { chargeId, menge: 1.2345, ziel: "Küche" }, W)).toMatchObject({ menge: 1.235 });
    expect(db.select().from(charge).all()).toHaveLength(0);
    expect(fehler(() => eingang(db, { artikelId: mehl, ortId: ort, mhd: "2027-03-01", menge: 0.0004 }, W))).toMatch(/0,001/);
  });
});

describe("Artikel und Orte", () => {
  it("meldet Artikel unter Mindestbestand, abgelaufene Ware zählt nicht", () => {
    const { db, ort, dose } = lager();
    eingang(db, { artikelId: dose, ortId: ort, mhd: "2026-11-01", menge: 20 }, { ...W, heute: "2026-10-01" });
    eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-01-01", menge: 4 }, W);
    const s = ladeSicht(db, HEUTE);
    expect(unterMindest(s.artikel, s.chargen).map((a) => a.name)).toEqual(["Erbsensuppe 800 g"]);
  });

  it("hält die EAN eindeutig und legt vorläufige Artikel an, die beim Speichern geprüft sind", () => {
    const { db } = lager();
    expect(fehler(() => artikelVorlaeufig(db, { name: "Doppelt", ean: "4000000000017", einheit: "Dose" }, W.jetzt))).toMatch(/EAN|Strichcode/);
    const id = artikelVorlaeufig(db, { name: "Linseneintopf", ean: "4000000000024", einheit: "Dose", kategorie: "Konserven" }, W.jetzt);
    expect(ladeSicht(db, HEUTE).artikel.find((a) => a.id === id)).toMatchObject({ vorlaeufig: true, rotTage: 7, gelbTage: 30 });
    artikelAendern(db, id, { name: "Linseneintopf 800 g", ean: "4000000000024", kategorie: "Konserven", einheit: "Dose", mhdArt: "mhd", rotTage: 7, gelbTage: 30, mindest: null }, W.jetzt);
    expect(ladeSicht(db, HEUTE).artikel.find((a) => a.id === id)?.vorlaeufig).toBe(false);
  });

  it("ändert die Einheit nur, solange nichts darauf gebucht ist", () => {
    const { db, ort, dose } = lager();
    const neu = { name: "Erbsensuppe 800 g", ean: "4000000000017", kategorie: "Konserven", einheit: "Karton", mhdArt: "mhd", rotTage: 7, gelbTage: 30, mindest: 10 } as const;
    const { chargeId } = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 1 }, W);
    ausgabe(db, { chargeId, menge: 1, ziel: "Einsatz" }, W);
    expect(fehler(() => artikelAendern(db, dose, neu, W.jetzt))).toMatch(/gebucht/);
  });

  it("deaktiviert Artikel und Orte nur, wenn nichts mehr daliegt", () => {
    const { db, ort, dose } = lager();
    const { chargeId } = eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 1 }, W);
    expect(fehler(() => artikelAktiv(db, dose, false, W.jetzt))).toMatch(/noch etwas/);
    expect(fehler(() => ortAktiv(db, ort, false, W.jetzt))).not.toBeNull();
    ausgabe(db, { chargeId, menge: 1, ziel: "Einsatz" }, W);
    expect(fehler(() => artikelAktiv(db, dose, false, W.jetzt))).toBeNull();
    expect(fehler(() => eingang(db, { artikelId: dose, ortId: ort, mhd: "2027-03-01", menge: 1 }, W))).toMatch(/nicht mehr/);
  });
});

describe("Helfer-Links", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-geheimnis"));
  afterEach(() => vi.unstubAllEnvs());

  it("löst einen gültigen Code ein, und Sperren wirkt sofort auf die Sitzung", async () => {
    const db = testDb();
    const { id, code } = linkAnlegen(db, { name: "Dienstabend", stunden: 4 }, W.jetzt, "Leitung Verpflegung");
    const r = await loeseEin(db, code.toLowerCase(), W.jetzt + 1000);
    expect(r).not.toBeNull();
    expect(r!.sekunden).toBeLessThanOrEqual(4 * 3600);
    expect(db.select().from(helferLink).get()?.zuletztAm).toBe(W.jetzt + 1000);
    expect((await linkAusCookie(db, r!.wert, W.jetzt + 2000))?.name).toBe("Dienstabend");
    linkSperren(db, id);
    expect(await linkAusCookie(db, r!.wert, W.jetzt + 3000)).toBeNull();
    expect(await loeseEin(db, code, W.jetzt + 3000)).toBeNull();
  });

  it("nimmt abgelaufene, unbekannte und kaputte Codes nicht an", async () => {
    const db = testDb();
    const { code } = linkAnlegen(db, { name: "Kurz", stunden: 1 }, W.jetzt, "Leitung Verpflegung");
    expect(await loeseEin(db, code, W.jetzt + 2 * 3_600_000)).toBeNull();
    expect(await loeseEin(db, "0".repeat(28), W.jetzt)).toBeNull();
    expect(await loeseEin(db, "abc", W.jetzt)).toBeNull();
    expect(await linkAusCookie(db, "kein.jwt.wert", W.jetzt)).toBeNull();
  });
});
