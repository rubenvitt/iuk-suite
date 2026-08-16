// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../_db/schema";
import type { Akteur } from "../_lib/zugang";

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

/**
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE (Quellenwechsel 2026-08-15): die Koordination kommt aus der Auth-Gruppe und liegt
 * damit auf einer ANDEREN Achse als `rolle` — auf DIESER Route besonders sichtbar, weil sie fuer
 * `auftrag` MIT und OHNE Gruppe offensteht und die Trennung „meine"/„in Vertretung" allein an
 * `istKoordination` haengt (`istVertretungsfreigabe`).
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

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

/**
 * ANMELDEN — DIE SITZUNG STELLT DIE KOORDINATIONSGRUPPE, SEIT DIE ZEILE SIE NICHT MEHR TRAEGT
 * (Quellenwechsel 2026-08-15): `istKoordination` kommt aus `canAdminModule("aufgaben")`
 * (`_lib/zugang.ts`s `akteurFuer`), nicht mehr aus `personen.rolle`. Damit jede bestehende Zusage
 * dieser Datei DIESELBE bleibt, bekommt eine koordinierende Person hier genau die Gruppe, die ihre
 * Rolle bisher bedeutet hat — die FIXTUR wandert mit der Quelle, die ERWARTUNG bleibt stehen.
 *
 * `iuk-aufgaben-koordination` ist der Registry-Vorgabewert (`core/registry.ts`);
 * `SUITE_ADMIN_GROUP_AUFGABEN` ist in der Testumgebung nicht gesetzt.
 */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = {
    user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
  };
}

describe("freigabenInhalt", () => {
  it("traegt die Ueberschrift und den ausgeschriebenen Leerzustand", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    await mount(freigabenInhalt(t.db, akteur(rike, true), HEUTE));
    expect(query("h1").textContent).toBe("Freigaben");
    expect(document.body.textContent).toContain("Keine Freigabe offen.");
  });

  /*
   * DIESELBE „MEINE"/„IN VERTRETUNG"-TRENNUNG WIE `EinstiegKoordination.test.tsx` (Aufgabe 14) —
   * hier fuer die ADRESSIERBARE ROUTE, mit je EINEM Fall auf jeder Seite und unterscheidbaren
   * Titeln, damit eine Vertauschung sichtbar rot wuerde.
   */
  it("trennt „meine“ von „in Vertretung“, je ein Fall, fuer die Koordination", async () => {
    const rike = legePerson("dev:rike@test", "auftrag", { name: "Rike" });
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

    await mount(freigabenInhalt(t.db, akteur(rike, true), HEUTE));

    // `h2` MIT ZAHL statt `h3` — s. die Begruendung in `_ui/FreigabeZone.test.tsx`.
    const ueberschriften = queryAll("h2").map((h) => h.textContent);
    expect(ueberschriften).toEqual(["Meine (1)", "In Vertretung (1)"]);
    const listen = queryAll("h2").map((h) => h.closest("section")!);
    expect(listen[0]!.textContent).toContain("Meine Freigabe");
    expect(listen[0]!.textContent).not.toContain("Vertretungsfall");
    expect(listen[1]!.textContent).toContain("Vertretungsfall");
    expect(listen[1]!.textContent).not.toContain("Meine Freigabe");
  });

  it("die Kontextzeile nennt die Gesamtzahl", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    legeAufgabe({
      titel: "F1", erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: rike.id,
      status: "freigabe_offen",
    });
    await mount(freigabenInhalt(t.db, akteur(rike, true), HEUTE));
    expect(document.body.textContent).toContain("1 Aufgabe warten auf Freigabe.");
  });
});

describe("FreigabenPage — Rollen-Gate (Aufgabe 15, Spec §8: '/freigaben' fuer auftrag und die Koordination)", () => {
  it("auftrag: die Seite antwortet normal", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    anmelden(malte);
    await mount(await FreigabenPage());
    expect(query("h1").textContent).toBe("Freigaben");
  });

  it("die Koordination: die Seite antwortet normal", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    anmelden(rike, true);
    await mount(await FreigabenPage());
    expect(query("h1").textContent).toBe("Freigaben");
  });

  it("bufdi: notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /*
   * DIE ZWEI FAELLE, DIE DIE KOORDINATIONSKLAUSEL VON `darfFreigabenSehen` ALLEIN TRAGEN
   * (Review-Runde zum Quellenwechsel 2026-08-15). Der Fall „die Koordination: antwortet normal"
   * oben beweist sie NICHT mehr: Rikes Zeile ist seither `auftrag` und aktiv, also bejaht schon die
   * zweite Klausel (`rolle === "auftrag" && istAktiv`) — als die Zeile noch `koordination` trug, war
   * das anders. Diese beiden Personen gibt es seit dem Quellenwechsel wirklich, und fuer beide ist
   * `istKoordination` der EINZIGE Grund, warum die Route antwortet:
   *  1. eine ausgeschiedene Koordination (die `auftrag`-Klausel scheitert an `istAktiv`),
   *  2. eine koordinierende Person mit `bufdi`-Zeile (die `auftrag`-Klausel greift gar nicht).
   * Ohne sie bliebe diese Datei gruen, streiche jemand `akteur.istKoordination ||` aus dem
   * Praedikat — und der zweite Fall ist zugleich die Gegenprobe zu „bufdi: notFound()" darueber.
   */
  it("eine ausgeschiedene Koordination kommt hinein — die Gruppe traegt die Rolle, nicht aktivBis", async () => {
    const exRike = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2020-01-01" });
    anmelden(exRike, true);
    await mount(await FreigabenPage());
    expect(query("h1").textContent).toBe("Freigaben");
  });

  it("dieselbe bufdi-Zeile wie oben kommt MIT Koordinationsgruppe hinein", async () => {
    const alina = legePerson("dev:alina-koord@test", "bufdi");
    anmelden(alina, true);
    await mount(await FreigabenPage());
    expect(query("h1").textContent).toBe("Freigaben");
  });

  it("ein ausgeschiedener auftrag OHNE Gruppe bekommt notFound()", async () => {
    const malteEx = legePerson("dev:malte-ex@test", "auftrag", { aktivBis: "2020-01-01" });
    anmelden(malteEx);
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
