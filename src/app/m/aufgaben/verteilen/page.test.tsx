// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, mount, query, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { aufgaben, personen, type PersonRow, type Rolle } from "../_db/schema";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import VerteilenPage, { verteilenInhalt } from "./page";

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

describe("verteilenInhalt — Kopf und Leerzustand", () => {
  it("zeigt den Titel „Verteilen“ und den Leerzustand ohne Posteingang", async () => {
    await mount(verteilenInhalt(t.db, HEUTE));
    expect(query("h1").textContent).toBe("Verteilen");
    expect(document.body.textContent).toContain("Posteingang leer — alles verteilt");
  });

  it("nennt die Anzahl in der Kontextzeile, wenn der Posteingang nicht leer ist", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    await mount(verteilenInhalt(t.db, HEUTE));
    expect(document.body.textContent).toContain("2 Aufgaben zu verteilen");
  });
});

/**
 * DIE ZIELLISTE KOMMT AUS `bufdis()`, NICHT AUS `aktivePersonen()` (Brief: „die dritte Linie eines
 * Riegels, nicht die erste") — GEPRUEFT AUF DER VOLLSTAENDIGEN SEITE, nicht nur an der Komponente:
 * die Komponente rendert nur, was ihr Prop liefert, die Aussage "woher kommt dieser Prop" liegt in
 * DIESER Datei (`verteilenInhalt`). Die Fixtur traegt bewusst koordination UND auftrag zusaetzlich zu
 * den BuFDis — „Rike fehlt" bewiese auch bei einem Filter auf `rolle !== "koordination"` (der
 * `auftrag` faelschlich mit einschlaesse); erst „genau die zwei BuFDi-Namen, nicht mehr" bindet die
 * echte Quelle.
 */
describe("verteilenInhalt — die Zielliste des Verteil-Dialogs", () => {
  it("enthaelt genau die aktiven BuFDis — nicht die Koordination, nicht auftrag", async () => {
    legePerson("dev:rike@test", "koordination", { name: "Rike" });
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const bendix = legePerson("dev:bendix@test", "bufdi", { name: "Bendix" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    await mount(verteilenInhalt(t.db, HEUTE));
    await click("[data-testid^='verteilen-']");

    const radios = queryPortal(".ant-modal").querySelectorAll("input[type='radio']");
    const namen = Array.from(radios).map((r) => r.closest("label")?.textContent);
    expect(namen.sort()).toEqual(["Alina", "Bendix"].sort());
    expect(namen).not.toContain("Rike");
    expect(namen).not.toContain("Malte");
    expect(alina.rolle).toBe("bufdi");
    expect(bendix.rolle).toBe("bufdi");
  });

  /**
   * `aktivBis` SCHLIESST EIN (Spec §4, Brief) — eine BuFDi, deren letzter Diensttag GENAU heute ist,
   * gehoert noch in die Zielliste; eine, deren letzter Diensttag GESTERN war, nicht mehr. Beide
   * Grenzfaelle in EINEM Test, damit ein Off-by-one in beide Richtungen sichtbar wuerde.
   */
  it("aktivBis === heute ist noch in der Liste, aktivBis === gestern nicht mehr", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legePerson("dev:carla@test", "bufdi", { name: "Carla", aktivBis: HEUTE });
    legePerson("dev:doerte@test", "bufdi", { name: "Dörte", aktivBis: "2026-08-12" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    await mount(verteilenInhalt(t.db, HEUTE));
    await click("[data-testid^='verteilen-']");

    const radios = queryPortal(".ant-modal").querySelectorAll("input[type='radio']");
    const namen = Array.from(radios).map((r) => r.closest("label")?.textContent);
    expect(namen).toContain("Carla");
    expect(namen).not.toContain("Dörte");
  });
});

/*
 * DER DEFAULT-EXPORT — DAS ROLLEN-GATE (Spec §8.3, Brief: "/verteilen antwortet einer
 * auftrag-Person mit 404, und der Weg dorthin existiert in ihrer Oberflaeche nicht. Beides prueft
 * dasselbe Praedikat aus derselben Quelle.").
 */
describe("VerteilenPage — Rollen-Gate (Spec §8.3: '/verteilen' nur fuer koordination)", () => {
  it("koordination: die Seite antwortet normal", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };
    await mount(await VerteilenPage());
    expect(query("h1").textContent).toBe("Verteilen");
  });

  it("auftrag: notFound() — die Antwort auf 'Jönne und Schulle pfuschen immer wieder rein'", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    sitzung = { user: { id: malte.sub } };
    await expect(VerteilenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("bufdi: ebenfalls notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await expect(VerteilenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("eine ausgeschiedene Koordination bekommt ebenfalls notFound()", async () => {
    const exRike = legePerson("dev:ex-rike@test", "koordination", { aktivBis: "2020-01-01" });
    sitzung = { user: { id: exRike.sub } };
    await expect(VerteilenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await VerteilenPage();
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });
});
