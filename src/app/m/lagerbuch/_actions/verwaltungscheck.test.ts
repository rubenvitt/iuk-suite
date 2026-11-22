import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel, buchungen, chargen, checks, fachVerfall, geraete, lagerorte, o2Flaschen, plomben, sollPositionen,
} from "../_db/schema";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "../_lib/konstanten";
import { AUFLADEN_PRAEFIX, AUSSONDERN_PRAEFIX, RUECKLAUF_PRAEFIX } from "../_lib/vorgang";
import { summiereCheckErgebnis } from "../_lib/domain/check";
import { statistikDaten } from "../_lib/lesepfade/statistik";
import { kurzcheckVorlage } from "../_lib/lesepfade/kurzcheck";
import { verwaltungscheckDaten } from "../_lib/lesepfade/verwaltungscheck";
import { baueNutzlast, leererZustand } from "../_lib/verwaltungscheck";

/**
 * DER VERWALTUNGSCHECK-ABSCHLUSS — Spec 6.8 und 6.12.
 *
 * Gegen eine echte, migrierte SQLite wie Check und Aufladen daneben: „alles oder
 * nichts" ist eine Aussage über die Buchungszeilen NACH einer Absage, und
 * Handlager-Wurzel und Entnahmebox kommen aus der Migration.
 */

const { adminRiegel, revalidiert } = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { verwaltungscheckAbschluss } from "./verwaltungscheck";

const JETZT = new Date("2026-11-01T10:00:00Z");
const VIEWER = { sub: "u-gf", groups: ["lagerbuch"], name: "G. Führer", email: null };
const SENDUNG = "6f1c2b9e-1d2a-4c3b-9a8e-0f1e2d3c4b5a";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-verwaltungscheck-");

  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "fz-alt", name: "KTW alt", typ: "fahrzeug", aktiv: false, einheitenart: "fahrzeug" },
    { id: "sch-1", name: "Schrank 1", typ: "lager", parentId: HANDLAGER_ID, aktiv: true, sortierung: 0 },
  ]).run();
  t.db.insert(artikel).values([
    { id: "art-1", name: "Kompresse", einheit: "Stk", fach: "A-01", mindestbestand: 0, aktiv: true, createdAt: JETZT },
    { id: "art-2", name: "Wärmedecke", einheit: "Stk", fach: "A-02", mindestbestand: 0, aktiv: true, createdAt: JETZT },
  ]).run();
  t.db.insert(chargen).values([
    { id: "ch-1", artikelId: "art-1", chargenNr: "L1", verfall: "2030-01", createdAt: JETZT },
    { id: "ch-2", artikelId: "art-2", chargenNr: "W1", verfall: "2030-06", createdAt: JETZT },
  ]).run();
  // art-1 liegt in ZWEI Fächern (3 + 2), art-2 teilt sich Fach 2 mit ihm.
  t.db.insert(sollPositionen).values([
    { id: "sp-1", fahrzeugId: "fz-1", fachLabel: "1", sort: 1, artikelId: "art-1", soll: 3, entfernt: false },
    { id: "sp-2", fahrzeugId: "fz-1", fachLabel: "2", sort: 2, artikelId: "art-1", soll: 2, entfernt: false },
    { id: "sp-3", fahrzeugId: "fz-1", fachLabel: "2", sort: 3, artikelId: "art-2", soll: 4, entfernt: false },
    { id: "sp-alt", fahrzeugId: "fz-alt", fachLabel: "1", sort: 1, artikelId: "art-1", soll: 1, entfernt: false },
  ]).run();
  t.db.insert(plomben).values([
    { id: "pl-2", lagerortId: "fz-1", bezeichnung: "Siegel Fach 2", fachLabel: "2", nummer: null, aktiv: true, createdAt: JETZT },
  ]).run();
  t.db.insert(o2Flaschen).values([
    { id: "o-1", name: "O2 klein", lagerortId: "fz-1", nennfuelldruckBar: 200, aktiv: true, createdAt: JETZT },
  ]).run();
});

afterEach(() => { t.schliessen(); vi.clearAllMocks(); });

let seedNr = 0;
function buchen(ort: string, menge: number, chargeId = "ch-1", artikelId = "art-1") {
  t.db.insert(buchungen).values({
    id: `seed-${++seedNr}`, ts: JETZT, typ: "zugang", artikelId, chargeId,
    lagerortId: ort, menge, quelleTyp: "system", quelleId: "seed", referenz: null, kommentar: null,
  }).run();
}

function bestand(ort: string, artikelId = "art-1"): number {
  return t.db.select().from(buchungen).all()
    .filter((b) => b.lagerortId === ort && b.artikelId === artikelId)
    .reduce((s, b) => s + b.menge, 0);
}

function neueZeilen() {
  return t.db.select().from(buchungen).all().filter((b) => b.quelleId !== "seed");
}

function checkZeile(id = SENDUNG) {
  return t.db.select().from(checks).where(eq(checks.id, id)).get();
}

function ergebnis(id = SENDUNG) {
  return JSON.parse(checkZeile(id)!.ergebnis!) as {
    art: string; kommentar?: string;
    positionen: { sollPositionId: string; ist: number }[];
    artikel: Record<string, number | string>[];
    plomben: { plombeId: string; gesetzt?: string }[];
    abschluss: Record<string, number>;
  };
}

/** Die Nutzlast „art-1 in beiden Fächern gezählt". */
function nutzlast(extra: Record<string, unknown> = {}, ist: [number, number] = [3, 2]) {
  return {
    fahrzeugId: "fz-1", sendungId: SENDUNG,
    positionen: [{ sollPositionId: "sp-1", ist: ist[0] }, { sollPositionId: "sp-2", ist: ist[1] }],
    verfaelle: [], ausgleich: [], plomben: [], geraete: [], flaschen: [],
    ...extra,
  };
}

describe("verwaltungscheckAbschluss — Zählung", () => {
  it("setzt den Bestand je Artikel auf die Summe seiner Fächer und schreibt einen Check der Art „verwaltung“", async () => {
    buchen("fz-1", 4);

    const erg = await verwaltungscheckAbschluss(nutzlast({ kommentar: "Erstbestückung" }, [3, 3]), t.db);

    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    expect(erg.wert.checkId).toBe(SENDUNG);
    expect(erg.wert.korrigiert).toBe(2);
    expect(bestand("fz-1")).toBe(6);

    const zeile = checkZeile()!;
    expect(zeile.fahrzeugId).toBe("fz-1");
    expect(zeile.quelleTyp).toBe("oidc");
    expect(zeile.quelleId).toBe("u-gf");
    const e = ergebnis();
    expect(e.art).toBe("verwaltung");
    expect(e.kommentar).toBe("Erstbestückung");
    expect(e.positionen.map((p) => p.sollPositionId)).toEqual(["sp-1", "sp-2"]);
    expect(e.artikel).toEqual([expect.objectContaining({
      artikelId: "art-1", positionen: 2, sollSumme: 5, istSumme: 6, recordedVorher: 4, korrektur: 2,
      nachfuellGewuenscht: 0, nachfuellGebucht: 0,
    })]);
    expect(e.abschluss).toEqual(expect.objectContaining({ korrigiert: 2, offen: 0 }));
    expect(e.abschluss).not.toHaveProperty("checkId");

    expect(revalidiert).toEqual(expect.arrayContaining([
      "/m/lagerbuch/verwaltung/checks",
      "/m/lagerbuch/verwaltung/sauerstoff",
      "/m/lagerbuch/verwaltung/fahrzeuge/fz-1",
    ]));
  });

  it("weist einen nur in einem Teil seiner Fächer gezählten Artikel ab und bucht nichts", async () => {
    buchen("fz-1", 4);

    const erg = await verwaltungscheckAbschluss({
      ...nutzlast(), positionen: [{ sollPositionId: "sp-1", ist: 1 }],
    }, t.db);

    expect(erg.ok).toBe(false);
    expect(checkZeile()).toBeUndefined();
    expect(neueZeilen()).toEqual([]);
  });

  it("antwortet auf dieselbe Sendung mit demselben Check und bucht nur einmal", async () => {
    buchen("fz-1", 4);

    const erst = await verwaltungscheckAbschluss(nutzlast({}, [3, 3]), t.db);
    const zweit = await verwaltungscheckAbschluss(nutzlast({}, [3, 3]), t.db);

    expect(erst.ok && zweit.ok).toBe(true);
    if (!erst.ok || !zweit.ok) return;
    expect(zweit.wert).toEqual(erst.wert);
    expect(bestand("fz-1")).toBe(6);
    expect(neueZeilen()).toHaveLength(1);
    expect(t.db.select().from(checks).all()).toHaveLength(1);
  });

  it("deckt danach im Kurzcheck genau die gezählten Positionen ab", async () => {
    buchen("fz-1", 5);
    expect((await verwaltungscheckAbschluss(nutzlast(), t.db)).ok).toBe(true);

    const vorlage = kurzcheckVorlage(t.db, {
      fahrzeugId: "fz-1",
      soll: [
        { id: "sp-1", artikelId: "art-1", fachLabel: "1" },
        { id: "sp-2", artikelId: "art-1", fachLabel: "2" },
        { id: "sp-3", artikelId: "art-2", fachLabel: "2" },
      ],
      plomben: [],
      letzterCheckId: SENDUNG,
    });
    expect(vorlage.abgedeckt).toBe(2);
    expect(vorlage.gesamt).toBe(3);
  });

  it("schreibt den Verfall nur für gezählte Fächer", async () => {
    buchen("fz-1", 5);

    const fremd = await verwaltungscheckAbschluss(nutzlast({
      verfaelle: [{ sollPositionId: "sp-3", verfall: "2027-01" }],
    }), t.db);
    expect(fremd.ok).toBe(false);
    expect(checkZeile()).toBeUndefined();

    const erg = await verwaltungscheckAbschluss(nutzlast({
      verfaelle: [{ sollPositionId: "sp-2", verfall: "2027-01" }],
    }), t.db);
    expect(erg.ok).toBe(true);
    expect(t.db.select().from(fachVerfall).all())
      .toEqual([expect.objectContaining({ sollPositionId: "sp-2", verfall: "2027-01" })]);
  });
});

describe("verwaltungscheckAbschluss — Riegel und leere Nutzlast", () => {
  it("weist eine stillgelegte Einheit ab", async () => {
    const erg = await verwaltungscheckAbschluss({
      ...nutzlast(), fahrzeugId: "fz-alt", positionen: [{ sollPositionId: "sp-alt", ist: 1 }],
    }, t.db);
    expect(erg).toEqual({ ok: false, fehler: "Dieses Fahrzeug ist nicht mehr aktiv. Bitte die Seite neu laden." });
    expect(checkZeile()).toBeUndefined();
  });

  it("weist eine Nutzlast ab, in der nichts erfasst ist", async () => {
    const erg = await verwaltungscheckAbschluss({ ...nutzlast(), positionen: [] }, t.db);
    expect(erg).toEqual({ ok: false, fehler: "Es ist noch nichts erfasst." });
    expect(checkZeile()).toBeUndefined();
  });

  it("weist eine ungültige Nutzlast ab, bevor etwas gelesen wird", async () => {
    const erg = await verwaltungscheckAbschluss({ ...nutzlast(), sendungId: "keine-uuid" }, t.db);
    expect(erg.ok).toBe(false);
  });

  it("nimmt einen Abschluss nur mit Sauerstoff an (keine gezählte Position)", async () => {
    const erg = await verwaltungscheckAbschluss({
      ...nutzlast(), positionen: [], flaschen: [{ flascheId: "o-1", druckBar: 180 }],
    }, t.db);
    expect(erg.ok).toBe(true);
    expect(ergebnis().positionen).toEqual([]);
  });

  it("weist einen Druck über dem Nennfülldruck ab", async () => {
    const erg = await verwaltungscheckAbschluss({
      ...nutzlast(), flaschen: [{ flascheId: "o-1", druckBar: 400 }],
    }, t.db);
    expect(erg.ok).toBe(false);
    expect(checkZeile()).toBeUndefined();
  });
});

describe("verwaltungscheckAbschluss — Ausgleich", () => {
  it("sondert nach der Zählung aus — als Aussonderung, nicht als Verbrauch", async () => {
    buchen("fz-1", 5);

    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", aussondern: { menge: 2 } }],
    }), t.db);

    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    expect(bestand("fz-1")).toBe(3);
    const zeilen = neueZeilen();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toEqual(expect.objectContaining({
      typ: "korrektur", menge: -2, referenz: `${AUSSONDERN_PRAEFIX}fz-1`,
      kommentar: "Beim Zählen ausgesondert",
    }));
    expect(erg.wert.ausgesondert).toBe(2);
    expect(ergebnis().abschluss.ausgesondert).toBe(2);
    expect(ergebnis().artikel[0]).toEqual(expect.objectContaining({ ausgesondert: 2 }));
    // Nach dem Ausgleich fehlen 2 zum Soll von 5.
    expect(erg.wert.offen).toBe(2);

    // Die Statistik führt die Zeile unter „aussondern" und NICHT als Verbrauch an der Einheit.
    const stat = statistikDaten(t.db, 3);
    const art1 = stat.bewegungen.filter((b) => b.a === "art-1");
    expect(art1.filter((b) => b.art === "einheit")).toEqual([]);
    expect(art1.filter((b) => b.art === "aussondern")).toEqual([expect.objectContaining({ n: 2 })]);
  });

  it("nimmt einen Grund für das Aussondern mit", async () => {
    buchen("fz-1", 5);
    await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", aussondern: { menge: 1, grund: "Verpackung beschädigt" } }],
    }), t.db);
    expect(neueZeilen()[0]!.kommentar).toBe("Verpackung beschädigt");
  });

  it("weist Ausgleich für einen nicht gezählten Artikel ab", async () => {
    buchen("fz-1", 5);
    buchen("fz-1", 4, "ch-2", "art-2");
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-2", aussondern: { menge: 1 } }],
    }), t.db);
    expect(erg.ok).toBe(false);
    expect(neueZeilen()).toEqual([]);
  });

  it("verlangt für das Zurücklegen in einen Schrank eine Charge — und nimmt dann auch die Korrektur zurück", async () => {
    // Buchstand 9, gezählt 7: die Korrektur (−2) ist schon gebucht, wenn die Absage kommt.
    buchen("fz-1", 9);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", zuruecklegen: { menge: 2, zielLagerortId: "sch-1" } }],
    }, [4, 3]), t.db);
    expect(erg).toEqual({ ok: false, fehler: "Kompresse: Für den Schrank eine Charge wählen." });
    expect(neueZeilen()).toEqual([]);
    expect(bestand("fz-1")).toBe(9);
    expect(checkZeile()).toBeUndefined();
  });

  it("nennt den Artikel, wenn eine Bewegung nicht gedeckt ist", async () => {
    buchen("fz-1", 5);
    buchen("sch-1", 1);

    const aus = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", aussondern: { menge: 5 }, zuruecklegen: { menge: 1, zielLagerortId: "sch-1", chargeId: "ch-2" } }],
    }), t.db);
    // Fremde Charge: der Text des Schreibpfads, davor der Artikel.
    expect(aus).toEqual({
      ok: false,
      fehler: "Kompresse: Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.",
    });

    const ort = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{
        artikelId: "art-1",
        auffuellen: { menge: 3, herkunft: { art: "ort", vonLagerortId: "sch-1", chargeId: "ch-1" } },
      }],
    }), t.db);
    expect(ort.ok).toBe(false);
    if (ort.ok) return;
    expect(ort.fehler).toMatch(/^Kompresse: In „Schrank 1/);

    // Der Text, der den Namen schon trägt, bekommt ihn nicht doppelt.
    const handlager = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", auffuellen: { menge: 3, herkunft: { art: "handlager" } } }],
    }), t.db);
    expect(handlager).toEqual({ ok: false, fehler: "Im Handlager liegen von Kompresse nur 1" });
    expect(neueZeilen()).toEqual([]);
  });

  it("nennt den Artikel beim Aussondern über den Bestand", async () => {
    buchen("fz-1", 5);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", aussondern: { menge: 6 } }],
    }), t.db);
    expect(erg).toEqual({ ok: false, fehler: "Kompresse: Hier liegen nur 5 Stück." });
  });

  it("legt mit Charge in den Schrank zurück", async () => {
    buchen("fz-1", 7);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", zuruecklegen: { menge: 2, zielLagerortId: "sch-1", chargeId: "ch-1" } }],
    }, [4, 3]), t.db);
    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    expect(bestand("sch-1")).toBe(2);
    expect(bestand("fz-1")).toBe(5);
    expect(erg.wert.zurueckgelegt).toBe(2);
    expect(neueZeilen().every((b) => b.referenz === `${RUECKLAUF_PRAEFIX}fz-1`)).toBe(true);
  });

  it("legt ohne Charge in die Entnahmebox", async () => {
    buchen("fz-1", 7);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", zuruecklegen: { menge: 2, zielLagerortId: ENTNAHMEBOX_ID } }],
    }, [4, 3]), t.db);
    expect(erg.ok).toBe(true);
    expect(bestand(ENTNAHMEBOX_ID)).toBe(2);
    expect(bestand("fz-1")).toBe(5);
  });

  it("weist Auffüllen über den Handlager-Bestand ab und bucht dann gar nichts, auch die Korrektur nicht", async () => {
    // Buchstand 3, gezählt 1: die Korrektur (−2) ist schon gebucht, wenn die Absage kommt.
    buchen("fz-1", 3);
    buchen("sch-1", 3);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", auffuellen: { menge: 4, herkunft: { art: "handlager" } } }],
    }, [1, 0]), t.db);
    expect(erg.ok).toBe(false);
    if (erg.ok) return;
    expect(erg.fehler).toContain("Im Handlager liegen");
    expect(neueZeilen()).toEqual([]);
    expect(bestand("fz-1")).toBe(3);
    expect(checkZeile()).toBeUndefined();
  });

  it("füllt aus dem Handlager auf und zählt es als „aus Handlager nachgefüllt“", async () => {
    buchen("fz-1", 2);
    buchen("sch-1", 10);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{ artikelId: "art-1", auffuellen: { menge: 3, herkunft: { art: "handlager" } } }],
    }, [2, 0]), t.db);
    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    expect(bestand("fz-1")).toBe(5);
    expect(bestand("sch-1")).toBe(7);
    expect(erg.wert.aufgefuellt).toBe(3);
    expect(erg.wert.offen).toBe(0);
    const a = ergebnis().artikel[0]!;
    expect(a.nachfuellGebucht).toBe(3);
    expect(a).not.toHaveProperty("aufgefuellt");
    expect(neueZeilen().filter((b) => b.typ === "umlagerung").every((b) => b.referenz === `check:${SENDUNG}`))
      .toBe(true);
  });

  it("bucht bei „schon eingeräumt und mitgezählt“ die Korrektur ohne die Auffüllmenge", async () => {
    buchen("fz-1", 6);
    buchen("sch-1", 10);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{
        artikelId: "art-1",
        auffuellen: { menge: 4, herkunft: { art: "handlager" }, mitgezaehlt: true },
      }],
    }, [6, 4]), t.db);
    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    // Korrektur auf 6 = keine Korrekturzeile; die 4 kommen per Umlagerung aus dem Handlager.
    expect(neueZeilen().filter((b) => b.typ === "korrektur")).toEqual([]);
    expect(neueZeilen().filter((b) => b.typ === "umlagerung" && b.lagerortId === "fz-1")
      .reduce((s, b) => s + b.menge, 0)).toBe(4);
    expect(bestand("fz-1")).toBe(10);
    expect(bestand("sch-1")).toBe(6);
    expect(erg.wert.korrigiert).toBe(0);
  });

  it("rechnet „offen“ bei mitgezähltem Auffüllen nicht doppelt — im Abschluss wie in der Liste", async () => {
    buchen("fz-1", 3);
    buchen("sch-1", 10);
    // Soll 5, gezählt 4 — davon 1 schon eingeräumt. Endstand 4, offen 1.
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{
        artikelId: "art-1",
        auffuellen: { menge: 1, herkunft: { art: "handlager" }, mitgezaehlt: true },
      }],
    }, [3, 1]), t.db);
    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    expect(bestand("fz-1")).toBe(4);
    expect(erg.wert.offen).toBe(1);
    expect(summiereCheckErgebnis(checkZeile()!.ergebnis).offen).toBe(1);
  });

  it("füllt von einem bestimmten Ort auf (Aufladen)", async () => {
    buchen("fz-1", 3);
    buchen("sch-1", 5);
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{
        artikelId: "art-1",
        auffuellen: { menge: 2, herkunft: { art: "ort", vonLagerortId: "sch-1", chargeId: "ch-1" } },
      }],
    }, [3, 0]), t.db);
    expect(erg.ok).toBe(true);
    if (!erg.ok) return;
    expect(bestand("fz-1")).toBe(5);
    expect(bestand("sch-1")).toBe(3);
    expect(erg.wert.aufgefuellt).toBe(2);
    expect(ergebnis().artikel[0]).toEqual(expect.objectContaining({ aufgefuellt: 2, nachfuellGebucht: 0 }));
    expect(neueZeilen().filter((b) => b.typ === "umlagerung").every((b) => b.referenz === `${AUFLADEN_PRAEFIX}fz-1`))
      .toBe(true);
  });

  it("füllt neu geliefertes Material auf (Zugang an der Einheit)", async () => {
    const erg = await verwaltungscheckAbschluss(nutzlast({
      ausgleich: [{
        artikelId: "art-1",
        auffuellen: { menge: 5, herkunft: { art: "neu", charge: { art: "neu", verfall: "2031-05" } } },
      }],
    }, [0, 0]), t.db);
    expect(erg.ok).toBe(true);
    expect(bestand("fz-1")).toBe(5);
    const zugang = neueZeilen().filter((b) => b.typ === "zugang");
    expect(zugang).toEqual([expect.objectContaining({ lagerortId: "fz-1", menge: 5 })]);
  });
});

describe("verwaltungscheckAbschluss — Plomben", () => {
  it("setzt eine Nummer nur, wenn das Fach der Plombe ganz gezählt ist", async () => {
    buchen("fz-1", 5);
    buchen("fz-1", 4, "ch-2", "art-2");

    const halb = await verwaltungscheckAbschluss(nutzlast({
      plomben: [{ plombeId: "pl-2", nummer: "A-123" }],
    }), t.db);
    expect(halb).toEqual({ ok: false, fehler: "Plombe „Siegel Fach 2“: erst das ganze Fach 2 zählen." });
    expect(t.db.select().from(plomben).where(eq(plomben.id, "pl-2")).get()!.nummer).toBeNull();

    const ganz = await verwaltungscheckAbschluss(nutzlast({
      positionen: [
        { sollPositionId: "sp-1", ist: 3 }, { sollPositionId: "sp-2", ist: 2 },
        { sollPositionId: "sp-3", ist: 4 },
      ],
      plomben: [{ plombeId: "pl-2", nummer: "A-123" }],
    }), t.db);
    expect(ganz.ok).toBe(true);
    if (!ganz.ok) return;
    expect(ganz.wert.plombenGesetzt).toBe(1);
    const pl = t.db.select().from(plomben).where(eq(plomben.id, "pl-2")).get()!;
    expect(pl.nummer).toBe("A-123");
    expect(pl.gesetztAt).not.toBeNull();
  });
});

describe("verwaltungscheckAbschluss — Nutzlast der Zählseite", () => {
  it("nimmt an, was `baueNutzlast` aus einem vollen Zählstand baut — jede Liste, alle drei Absichten", async () => {
    buchen("fz-1", 5);
    buchen("sch-1", 4);
    t.db.insert(geraete).values([
      { id: "g-1", typ: "medizin", name: "AED", lagerortId: "fz-1", selbsttest: true, createdAt: JETZT },
    ]).run();
    const daten = verwaltungscheckDaten(t.db, "fz-1")!;

    const z = {
      ...leererZustand(),
      // Kompresse 7 (davon 2 schon eingeräumt), Wärmedecke 4.
      ist: { "sp-1": 4, "sp-2": 3, "sp-3": 4 },
      verfall: { "sp-1": "2031-02", "sp-3": null },
      ausgleich: {
        "art-1": {
          aussondern: { menge: 1, grund: "Verpackung offen" },
          zuruecklegen: { menge: 1, zielLagerortId: "sch-1", chargeId: "ch-1" },
          auffuellen: { menge: 2, herkunft: { art: "ort" as const, vonLagerortId: "sch-1", chargeId: "ch-1" }, mitgezaehlt: true },
        },
        "art-2": {
          auffuellen: { menge: 1, herkunft: { art: "neu" as const, charge: { art: "neu" as const, chargenNr: "W9", verfall: "2031-06" } } },
        },
      },
      plomben: { "pl-2": "A-7" },
      geraete: { "g-1": { vorhanden: true, zustand: "In Ordnung" as const, bemerkung: "Pads neu", selbsttest: true } },
      druck: { "o-1": 180 },
      kommentar: "Erstbestückung",
    };

    const erg = await verwaltungscheckAbschluss(baueNutzlast(daten, z, SENDUNG), t.db);

    expect(erg).toEqual({ ok: true, wert: expect.objectContaining({
      ausgesondert: 1, zurueckgelegt: 1, aufgefuellt: 3, plombenGesetzt: 1,
    }) });
    // 7 gezählt − 2 mitgezählt = 5 = Buchstand; −1 aussondern, −1 zurück, +2 vom Schrank.
    expect(bestand("fz-1")).toBe(5);
    expect(bestand("fz-1", "art-2")).toBe(5);
    expect(t.db.select().from(fachVerfall).all()).toEqual([
      expect.objectContaining({ sollPositionId: "sp-1", verfall: "2031-02" }),
    ]);
  });
});
