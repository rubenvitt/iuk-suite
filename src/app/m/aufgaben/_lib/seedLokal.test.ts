import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { personen, aufgaben, routinen, verlauf, STATUS_WERTE } from "../_db/schema";
import { isoTag } from "./datum";
import { istUeberfaellig } from "./anzeige";
import { seedLokalAufgaben } from "./seedLokal";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
});
afterEach(() => {
  t.schliessen();
  vi.useRealTimers();
});

function zaehlen() {
  return {
    personen: t.db.select().from(personen).all().length,
    aufgaben: t.db.select().from(aufgaben).all().length,
    routinen: t.db.select().from(routinen).all().length,
    verlauf: t.db.select().from(verlauf).all().length,
  };
}

describe("seedLokalAufgaben — idempotent", () => {
  it("zweimal laufen lassen ergibt dieselben Zaehlstaende wie einmal", async () => {
    await seedLokalAufgaben(t.db);
    const nachErstemLauf = zaehlen();
    await seedLokalAufgaben(t.db);
    const nachZweitemLauf = zaehlen();
    expect(nachZweitemLauf).toEqual(nachErstemLauf);
    // Nicht triviale Nullpruefung: es muss tatsaechlich etwas angelegt worden sein.
    expect(nachErstemLauf.aufgaben).toBeGreaterThan(0);
    expect(nachErstemLauf.routinen).toBeGreaterThan(0);
    expect(nachErstemLauf.verlauf).toBeGreaterThan(0);
  });
});

describe("seedLokalAufgaben — rein additiv", () => {
  it("eine vorher von Hand angelegte Person mit demselben sub wird nicht ueberschrieben", async () => {
    t.db
      .insert(personen)
      .values({
        sub: "dev:sarah@localtest.me",
        name: "Handangelegt",
        initialen: "HA",
        rolle: "bufdi",
        aktivVon: "2020-01-01",
      })
      .run();
    await seedLokalAufgaben(t.db);
    const sarah = t.db
      .select()
      .from(personen)
      .all()
      .find((p) => p.sub === "dev:sarah@localtest.me");
    expect(sarah?.name).toBe("Handangelegt");
    expect(sarah?.rolle).toBe("bufdi");
  });

  it("eine vorher von Hand angelegte Aufgabe bleibt unangetastet", async () => {
    const ersteller = t.db
      .insert(personen)
      .values({ sub: "x", name: "X", initialen: "XX", rolle: "auftrag", aktivVon: "2026-01-01" })
      .returning()
      .get();
    t.db
      .insert(aufgaben)
      .values({
        titel: "Handangelegte Aufgabe",
        beschreibung: "B",
        prioritaet: "mittel",
        erstellerId: ersteller.id,
        status: "eingegangen",
        faelligAm: "2026-08-20",
        dauerMinuten: 30,
      })
      .run();
    await seedLokalAufgaben(t.db);
    const meine = t.db
      .select()
      .from(aufgaben)
      .all()
      .filter((a) => a.titel === "Handangelegte Aufgabe");
    expect(meine).toHaveLength(1);
  });
});

describe("seedLokalAufgaben — die Zusagen sind wirklich erfuellt", () => {
  it("jeder der sechs Zustaende kommt vor", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    for (const status of STATUS_WERTE) {
      expect(alle.some((a) => a.status === status), status).toBe(true);
    }
  });

  it("es gibt eine Aufgabe mit offenem Zeitvorschlag", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    expect(
      alle.some(
        (a) => a.status === "verteilt" && a.planDatum === null && a.vorschlagDatum !== null,
      ),
    ).toBe(true);
  });

  it("es gibt eine ueberfaellige Aufgabe", async () => {
    await seedLokalAufgaben(t.db);
    const heute = isoTag(new Date());
    const alle = t.db.select().from(aufgaben).all();
    expect(alle.some((a) => istUeberfaellig(a, heute))).toBe(true);
  });

  it("es gibt eine Selbstaufgabe (istSelbst, kein Pruefer, Ersteller = Zugewiesener)", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    expect(
      alle.some(
        (a) => a.istSelbst && a.prueferId === null && a.erstellerId === a.zugewiesenAn,
      ),
    ).toBe(true);
  });

  it("es gibt eine Aufgabe mit nachweisPflicht", async () => {
    await seedLokalAufgaben(t.db);
    const alle = t.db.select().from(aufgaben).all();
    expect(alle.some((a) => a.nachweisPflicht)).toBe(true);
  });

  it("es gibt eingeplante Aufgaben an mehreren Tagen bei mindestens zwei BuFDis, darunter ein ueberbuchter Tag", async () => {
    await seedLokalAufgaben(t.db);
    const alleAufgaben = t.db.select().from(aufgaben).all();
    const allePersonen = t.db.select().from(personen).all();
    const bufdiIds = new Set(allePersonen.filter((p) => p.rolle === "bufdi").map((p) => p.id));

    const geplante = alleAufgaben.filter(
      (a) => a.planDatum !== null && a.zugewiesenAn !== null && bufdiIds.has(a.zugewiesenAn),
    );
    const tage = new Set(geplante.map((a) => a.planDatum));
    expect(tage.size).toBeGreaterThanOrEqual(2);

    const personenMitPlan = new Set(geplante.map((a) => a.zugewiesenAn));
    expect(personenMitPlan.size).toBeGreaterThanOrEqual(2);

    const minutenProPersonUndTag = new Map<string, number>();
    for (const a of geplante) {
      const schluessel = `${a.zugewiesenAn}|${a.planDatum}`;
      minutenProPersonUndTag.set(
        schluessel,
        (minutenProPersonUndTag.get(schluessel) ?? 0) + a.dauerMinuten,
      );
    }
    const sollMinuten = new Map(allePersonen.map((p) => [p.id, p.sollMinutenTag]));
    const ueberbucht = [...minutenProPersonUndTag.entries()].some(([schluessel, minuten]) => {
      const [personId] = schluessel.split("|");
      return minuten > (sollMinuten.get(personId as string) ?? Infinity);
    });
    expect(ueberbucht).toBe(true);
  });

  it("es gibt Routinen bei mindestens zwei BuFDis mit unterschiedlichen Wochentagsmasken", async () => {
    await seedLokalAufgaben(t.db);
    const alleRoutinen = t.db.select().from(routinen).all();
    const personenMitRoutine = new Set(alleRoutinen.map((r) => r.personId));
    expect(personenMitRoutine.size).toBeGreaterThanOrEqual(2);
    const masken = new Set(alleRoutinen.map((r) => r.wochentage));
    expect(masken.size).toBeGreaterThanOrEqual(2);
  });

  it("jede Aufgabe hat mindestens eine Verlaufszeile", async () => {
    await seedLokalAufgaben(t.db);
    const alleAufgaben = t.db.select().from(aufgaben).all();
    const alleVerlauf = t.db.select().from(verlauf).all();
    const aufgabenMitVerlauf = new Set(alleVerlauf.map((v) => v.aufgabeId));
    for (const a of alleAufgaben) {
      expect(aufgabenMitVerlauf.has(a.id), a.titel).toBe(true);
    }
  });
});

describe("seedLokalAufgaben — relativ statt fest", () => {
  it("erzeugt bei zwei verschiedenen 'heute' verschiedene Plandaten", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    await seedLokalAufgaben(t.db);
    const planDatenLauf1 = new Set(
      t.db
        .select()
        .from(aufgaben)
        .all()
        .map((a) => a.planDatum)
        .filter((d): d is string => d !== null),
    );

    const t2 = migrierteTestDb();
    try {
      vi.setSystemTime(new Date("2026-09-24T10:00:00Z")); // sechs Wochen spaeter
      await seedLokalAufgaben(t2.db);
      const planDatenLauf2 = new Set(
        t2.db
          .select()
          .from(aufgaben)
          .all()
          .map((a) => a.planDatum)
          .filter((d): d is string => d !== null),
      );
      const ueberschneidung = [...planDatenLauf1].filter((d) => planDatenLauf2.has(d));
      expect(ueberschneidung).toHaveLength(0);
    } finally {
      t2.schliessen();
    }
  });
});
