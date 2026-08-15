// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../_db/schema";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import FreigabenPage, { freigabenInhalt } from "./page";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
  mockDb = t;
  sitzung = null;
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

const HEUTE = "2026-08-13";

function legePerson(sub: string, rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: extra.initialen ?? sub.slice(0, 2).toUpperCase(),
      rolle,
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

describe("freigabenInhalt", () => {
  it("traegt die Ueberschrift und den ausgeschriebenen Leerzustand", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    await mount(freigabenInhalt(t.db, rike, HEUTE));
    expect(query("h1").textContent).toBe("Freigaben");
    expect(document.body.textContent).toContain("Keine Freigabe offen.");
  });

  /*
   * DIESELBE „MEINE"/„IN VERTRETUNG"-TRENNUNG WIE `EinstiegKoordination.test.tsx` (Aufgabe 14) —
   * hier fuer die ADRESSIERBARE ROUTE, mit je EINEM Fall auf jeder Seite und unterscheidbaren
   * Titeln, damit eine Vertauschung sichtbar rot wuerde.
   */
  it("trennt „meine“ von „in Vertretung“, je ein Fall, fuer die Koordination", async () => {
    const rike = legePerson("dev:rike@test", "koordination", { name: "Rike" });
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({
      titel: "Meine Freigabe", erstellerId: malte.id, zugewiesenAn: alina.id,
      prueferId: rike.id, status: "freigabe_offen",
    });
    legeAufgabe({
      titel: "Vertretungsfall", erstellerId: malte.id, zugewiesenAn: alina.id,
      prueferId: malte.id, status: "freigabe_offen",
    });

    await mount(freigabenInhalt(t.db, rike, HEUTE));

    const ueberschriften = queryAll("h3").map((h) => h.textContent);
    expect(ueberschriften).toEqual(["Meine", "In Vertretung"]);
    const listen = queryAll("h3").map((h) => h.parentElement!);
    expect(listen[0]!.textContent).toContain("Meine Freigabe");
    expect(listen[0]!.textContent).not.toContain("Vertretungsfall");
    expect(listen[1]!.textContent).toContain("Vertretungsfall");
    expect(listen[1]!.textContent).not.toContain("Meine Freigabe");
  });

  it("die Kontextzeile nennt die Gesamtzahl", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({
      titel: "F1", erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: rike.id,
      status: "freigabe_offen",
    });
    await mount(freigabenInhalt(t.db, rike, HEUTE));
    expect(document.body.textContent).toContain("1 Aufgabe warten auf Freigabe.");
  });
});

describe("FreigabenPage — Rollen-Gate (Aufgabe 15, Spec §8: '/freigaben' fuer auftrag, koordination)", () => {
  it("auftrag: die Seite antwortet normal", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    sitzung = { user: { id: malte.sub } };
    await mount(await FreigabenPage());
    expect(query("h1").textContent).toBe("Freigaben");
  });

  it("koordination: die Seite antwortet normal", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };
    await mount(await FreigabenPage());
    expect(query("h1").textContent).toBe("Freigaben");
  });

  it("bufdi: notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ein ausgeschiedener auftrag bekommt ebenfalls notFound()", async () => {
    const malteEx = legePerson("dev:malte-ex@test", "auftrag", { aktivBis: "2020-01-01" });
    sitzung = { user: { id: malteEx.sub } };
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await FreigabenPage();
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });

  it("ohne Sitzung: notFound()", async () => {
    sitzung = null;
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
