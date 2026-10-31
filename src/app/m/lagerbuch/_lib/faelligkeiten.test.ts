import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel, bzGeraete, bzKontrollen, lagerorte, lagerortVerfall, o2Flaschen, o2Messungen, plomben, users,
} from "../_db/schema";
import { darfLagerbuchFaelligkeitenSehen, lagerbuchFaelligkeiten } from "./faelligkeiten";

const NOW = new Date("2026-06-15T10:00:00Z");
const vorTagen = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-faellig-");
  t.db.transaction((tx) => {
    tx.insert(lagerorte).values([
      { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true, einheitenart: "fahrzeug" },
      { id: "alt", name: "Alter KTW", typ: "fahrzeug", kennung: null, aktiv: false, einheitenart: "fahrzeug" },
    ]).run();
    tx.insert(users).values({ id: "sub-1", name: "Anna Beispiel", email: null, lastLoginAt: NOW }).run();
    tx.insert(artikel).values([
      { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1", mindestbestand: 0, aktiv: true, createdAt: NOW },
      { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, aktiv: true, createdAt: NOW },
    ]).run();
  });
});
afterEach(() => t.schliessen());

describe("lagerbuchFaelligkeiten — was das Lagerbuch an „Was steht an“ herausgibt", () => {
  it("ohne Daten: nichts", () => {
    expect(lagerbuchFaelligkeiten(NOW, t.db)).toEqual([]);
  });

  it("gemeldeter Verfall: abgelaufen ist überfällig, bald ablaufend ist bald, grün und ausgemusterte Einheiten fehlen", () => {
    t.db.insert(lagerortVerfall).values([
      { id: "v1", lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-05", erfasstAt: NOW, quelleTyp: "oidc", quelleId: "sub-1" },
      { id: "v2", lagerortId: "rtw-1", artikelId: "a2", verfall: "2026-06", erfasstAt: NOW, quelleTyp: "oidc", quelleId: "sub-1" },
      { id: "v3", lagerortId: "alt", artikelId: "a2", verfall: "2026-01", erfasstAt: NOW, quelleTyp: "oidc", quelleId: "sub-1" },
    ]).run();
    t.db.insert(lagerortVerfall).values(
      { id: "v4", lagerortId: "rtw-1", artikelId: "a2", verfall: "2029-01", erfasstAt: NOW, quelleTyp: "oidc", quelleId: "sub-1" },
    ).onConflictDoNothing().run();
    const liste = lagerbuchFaelligkeiten(NOW, t.db);
    expect(liste.map((f) => [f.titel, f.wo, f.dringlichkeit, f.art, f.pfad])).toEqual([
      ["Verband", "RTW 1", "ueberfaellig", "Verfall", "/verwaltung/verfall"],
      ["NaCl", "RTW 1", "bald", "Verfall", "/verwaltung/verfall"],
    ]);
    expect(liste[0].zustand).toBe("abgelaufen");
  });

  it("Sauerstoff: nur aktive Flaschen an oder unter der Wechselgrenze; ohne Messung keine Frist", () => {
    t.db.insert(o2Flaschen).values([
      { id: "f-leer", name: "O2 A", lagerortId: "rtw-1", nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
      { id: "f-voll", name: "O2 B", lagerortId: "rtw-1", nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
      { id: "f-ohne", name: "O2 C", lagerortId: "rtw-1", nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
      { id: "f-aus", name: "O2 D", lagerortId: "rtw-1", nennfuelldruckBar: 200, aktiv: false, createdAt: NOW },
    ]).run();
    t.db.insert(o2Messungen).values([
      { id: "m1", flascheId: "f-leer", ts: NOW, druckBar: 40, quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
      { id: "m2", flascheId: "f-voll", ts: NOW, druckBar: 190, quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
      { id: "m3", flascheId: "f-aus", ts: NOW, druckBar: 10, quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
    ]).run();
    const liste = lagerbuchFaelligkeiten(NOW, t.db);
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({
      art: "Sauerstoff", titel: "Flasche O2 A", wo: "RTW 1", zustand: "noch 20 %, wechseln",
      dringlichkeit: "ueberfaellig", pfad: "/verwaltung/sauerstoff/f-leer",
    });
  });

  it("BZ: nie kontrolliert und überfällig sind überfällig, im Warnfenster bald, frisch kontrolliert fehlt", () => {
    const geraet = (id: string, name: string, aktiv = true) => ({
      id, name, barcode: null, lagerortId: "rtw-1", streifenLot: null, level1Label: null, level1Min: null,
      level1Max: null, level2Label: null, level2Min: null, level2Max: null, aktiv, createdAt: NOW,
    });
    const kontrolle = (id: string, geraetId: string, ts: Date) => ({
      id, geraetId, ts, quelleTyp: "oidc" as const, quelleId: "sub-1", level1Wert: null, level1ImBereich: null,
      level2Wert: null, level2ImBereich: null, kompresseVerfall: null, sticks: 10, lanzetten: 10,
      batterieGewechselt: false, kommentar: null, bestanden: true, refSnapshot: null,
    });
    t.db.insert(bzGeraete).values([
      geraet("bz-nie", "Gerät nie"), geraet("bz-alt", "Gerät alt"), geraet("bz-bald", "Gerät bald"),
      geraet("bz-frisch", "Gerät frisch"), geraet("bz-aus", "Gerät aus", false),
    ]).run();
    t.db.insert(bzKontrollen).values([
      kontrolle("k1", "bz-alt", vorTagen(40)),
      kontrolle("k2", "bz-bald", vorTagen(28)),
      kontrolle("k3", "bz-frisch", vorTagen(2)),
    ]).run();
    const liste = lagerbuchFaelligkeiten(NOW, t.db).map((f) => [f.titel, f.dringlichkeit, f.zustand]);
    expect(liste).toEqual([
      ["Gerät alt", "ueberfaellig", "Kontrolle seit 9 Tagen überfällig"],
      ["Gerät bald", "bald", "Kontrolle fällig in 3 Tagen"],
      ["Gerät nie", "ueberfaellig", "noch nie kontrolliert"],
    ]);
  });

  it("Plomben: angelegt, aber ohne Nummer, an einer aktiven Einheit", () => {
    t.db.insert(plomben).values([
      { id: "p-offen", lagerortId: "rtw-1", bezeichnung: "Medizinkoffer", fachLabel: "Koffer", nummer: null, createdAt: NOW },
      { id: "p-zu", lagerortId: "rtw-1", bezeichnung: "Absaugung", fachLabel: null, nummer: "123", gesetztAt: NOW, createdAt: NOW },
      { id: "p-alt", lagerortId: "alt", bezeichnung: "Koffer alt", fachLabel: null, nummer: null, createdAt: NOW },
      { id: "p-aus", lagerortId: "rtw-1", bezeichnung: "Ausgebaut", fachLabel: null, nummer: null, aktiv: false, createdAt: NOW },
    ]).run();
    expect(lagerbuchFaelligkeiten(NOW, t.db)).toEqual([{
      id: "plombe:p-offen", art: "Plombe", titel: "Medizinkoffer (Koffer)", wo: "RTW 1", zustand: "nicht gesetzt",
      dringlichkeit: "bald", sortierung: "", pfad: "/verwaltung/fahrzeuge/rtw-1",
    }]);
  });
});

describe("darfLagerbuchFaelligkeitenSehen — dasselbe Prädikat wie istLagerbuchAdmin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Modul-Admin ja, Suite-Admin allein nein, anonym nein", () => {
    vi.stubEnv("ADMIN_GROUP", "betrieb");
    vi.stubEnv("SUITE_ADMIN_GROUP_LAGERBUCH", "lager-admin");
    expect(darfLagerbuchFaelligkeitenSehen(["lager-admin"])).toBe(true);
    expect(darfLagerbuchFaelligkeitenSehen(["betrieb"])).toBe(false);
    expect(darfLagerbuchFaelligkeitenSehen([])).toBe(false);
    expect(darfLagerbuchFaelligkeitenSehen(null)).toBe(false);
  });
});
