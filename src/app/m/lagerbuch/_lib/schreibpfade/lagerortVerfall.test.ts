import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, lagerorte, lagerortVerfall } from "../../_db/schema";
import { setzeVerfall, loescheVerfallEintrag, loescheVerfallFuer } from "./lagerortVerfall";
import type { Quelle } from "./abbuchung";

const NOW = new Date("2026-06-15T10:00:00Z");
const SPAETER = new Date("2026-06-20T10:00:00Z");
const QUELLE: Quelle = { quelleTyp: "token", quelleId: "111-111" };
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-sp-lvf-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null, aktiv: true },
    { id: "rtw-2", name: "RTW 2", typ: "fahrzeug", kennung: null, aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "A", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "B", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

const alle = () => t.db.select().from(lagerortVerfall).all();

describe("setzeVerfall — der Upsert", () => {
  it("legt eine Angabe an", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    expect(alle()).toHaveLength(1);
    expect(alle()[0]).toMatchObject({ verfall: "2026-09", quelleTyp: "token" });
  });

  it("UEBERSCHREIBT eine bestehende Angabe, statt zu duplizieren", () => {
    /**
     * §4.11: der Upsert laeuft ueber den Unique-Index
     * `idx_lagerort_verfall_ort_artikel`. Die ALTE ANGABE IST DANACH WEG — es gibt
     * keine Historie und keinen Trigger. Das ist gewollt: ein Fahrzeug hat einen
     * aktuellen fruehesten Verfall, keine Verlaufskurve.
     */
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    const idVorher = alle()[0].id;
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-07",
      quelle: { quelleTyp: "oidc", quelleId: "sub-1" }, jetzt: SPAETER });
    expect(alle()).toHaveLength(1);
    expect(alle()[0]).toMatchObject({
      verfall: "2026-07", quelleTyp: "oidc", quelleId: "sub-1",
    });
    expect(alle()[0].erfasstAt.getTime()).toBe(SPAETER.getTime());
    // ⚠️ DIE ZEILE, UM DIE ES GEHT: `id` bleibt IDENTISCH. `INSERT OR REPLACE`
    // loeschte die Zeile und legte sie mit einer NEUEN `id` neu an — das waere
    // an jeder anderen Zusicherung dieses Tests nicht zu unterscheiden.
    expect(alle()[0].id).toBe(idVorher);
  });

  it("fuehrt (Lagerort, Artikel) als Paar — zwei Fahrzeuge, zwei Zeilen", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-2", artikelId: "a1",
      verfall: "2026-10", quelle: QUELLE, jetzt: NOW });
    expect(alle()).toHaveLength(2);
  });
});

describe("setzeVerfall — null und '' LOESCHEN", () => {
  it("nimmt eine Angabe zurueck", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: null, quelle: QUELLE, jetzt: SPAETER });
    expect(alle()).toHaveLength(0);
  });

  it("behandelt den leeren String wie null", () => {
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "", quelle: QUELLE, jetzt: SPAETER });
    expect(alle()).toHaveLength(0);
  });

  it("ist auf einer nicht vorhandenen Zeile ein No-Op", () => {
    expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: null, quelle: QUELLE, jetzt: NOW })).not.toThrow();
  });
});

describe("setzeVerfall — genau EIN Monatsvalidator (§5.6.4, Entscheidung 6)", () => {
  it("lehnt '2026-00' ab — der laxe Ausdruck liesse ihn durch", () => {
    /**
     * `/^\d{4}-\d{2}$/` (`buchung.ts:17`, `bz.ts:83`) laesst „2026-00" durch;
     * `verfallStatus` rechnet daraus den 31.12.2025, und die Charge gilt AB DEM
     * ANLEGEN als abgelaufen. Ab jetzt gilt ueberall MONAT_REGEX.
     */
    expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
      verfall: "2026-00", quelle: QUELLE, jetzt: NOW })).toThrow(/YYYY-MM/);
    expect(alle()).toHaveLength(0);
  });

  it("lehnt '2026-13' und Freitext ab", () => {
    for (const roh of ["2026-13", "2026-6", "Juni 2026", "2026"]) {
      expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
        verfall: roh, quelle: QUELLE, jetzt: NOW })).toThrow();
    }
  });

  it("nimmt '2026-01' und '2026-12' an", () => {
    for (const roh of ["2026-01", "2026-12", "2099-12"]) {
      expect(() => setzeVerfall(t.db, { lagerortId: "rtw-1", artikelId: "a1",
        verfall: roh, quelle: QUELLE, jetzt: NOW })).not.toThrow();
    }
  });
});

describe("die beiden Loeschwege", () => {
  beforeEach(() => {
    for (const [ort, art] of [["rtw-1", "a1"], ["rtw-1", "a2"], ["rtw-2", "a1"]] as const) {
      setzeVerfall(t.db, { lagerortId: ort, artikelId: art,
        verfall: "2026-09", quelle: QUELLE, jetzt: NOW });
    }
  });

  it("loescheVerfallEintrag trifft genau EIN Paar", () => {
    // Der Weg, den `fahrzeuge.ts:80` geht, wenn ein Artikel an diesem Fahrzeug
    // aus dem Soll faellt. Die verbleibenden zwei Zeilen sind NAMENTLICH die
    // beiden Nachbarn (gleicher Lagerort, gleicher Artikel) — nicht nur eine
    // Anzahl, die zufaellig stimmt.
    loescheVerfallEintrag(t.db, "rtw-1", "a1");
    expect(alle().map((r) => `${r.lagerortId}/${r.artikelId}`).sort()).toEqual([
      "rtw-1/a2", "rtw-2/a1",
    ]);
  });

  it("loescheVerfallFuer('lagerort') raeumt ein ganzes Fahrzeug ab", () => {
    loescheVerfallFuer(t.db, "lagerort", "rtw-1");
    expect(alle().map((r) => r.lagerortId)).toEqual(["rtw-2"]);
  });

  it("loescheVerfallFuer('artikel') raeumt einen Artikel ueberall ab", () => {
    loescheVerfallFuer(t.db, "artikel", "a1");
    expect(alle().map((r) => r.artikelId)).toEqual(["a2"]);
  });
});
