// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";
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

import NeuPage, { neuInhalt } from "./page";

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
 * damit auf einer ANDEREN Achse als `rolle` — `ROLLEN` kennt `koordination` gar nicht mehr, eine
 * Ableitung aus der Zeile waere also nicht bloss unsauber, sondern unmoeglich. Genau deshalb
 * pruefen die Tabellen unten VIER Kombinationen (zwei Rollen × mit/ohne Gruppe) statt der
 * bisherigen drei Rollen: die frueher gar nicht darstellbaren Faelle („auftrag MIT Gruppe",
 * „bufdi MIT Gruppe") sind die interessanten.
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

describe("neuInhalt — die Formularseite", () => {
  it("traegt die Ueberschrift und die Pflichtfeld-Kontextzeile", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    await mount(neuInhalt(akteur(malte), HEUTE));
    expect(query("h1").textContent).toBe("Aufgabe einstellen");
    expect(document.body.textContent).toContain(
      "Titel, Erklärung, Priorität, Frist und Dauerschätzung sind Pflichtfelder.",
    );
  });

  /*
   * DIE WAHL „FUER MICH SELBST" ERSCHEINT NUR, WO SIE FACHLICH BESTEHT (Brief, Spec §5.2) —
   * `darfEinstellenFuerAndere` entscheidet, nicht ein zweites Praedikat in dieser Datei.
   */
  it.each<[Rolle, boolean, boolean]>([
    ["auftrag", false, true],
    ["auftrag", true, true],
    ["bufdi", false, false],
    ["bufdi", true, true],
  ])(
    "Rolle %s, koordiniert %s → Kontrollkaestchen „fuer mich selbst“ sichtbar: %s",
    async (rolle, istKoordination, sichtbar) => {
      const p = legePerson(`n-${rolle}-${istKoordination}`, rolle);
      await mount(neuInhalt(akteur(p, istKoordination), HEUTE));
      expect(queryAll("#af-fuerSichSelbst")).toHaveLength(sichtbar ? 1 : 0);
    },
  );
});

describe("NeuPage — Default-Export: keine Rollenschranke, nur die Erklaerseite fehlt", () => {
  /*
   * `/neu` GATET NICHT AUF EINE ROLLE (Brief, Spec §8s Tabelle: „auftrag, koordination; BuFDis fuer
   * sich selbst") — JEDE aktive ODER inaktive Person mit einer `personen`-Zeile erreicht die Seite;
   * `anfangsZustand()` entscheidet erst beim ABSENDEN, nicht die Route. Diese Entscheidung ist
   * bewusst (s. Kopfkommentar `page.tsx`) und hier fuer BEIDE Rollen, je MIT und OHNE
   * Koordinationsgruppe, UND eine ausgeschiedene Person als Vertrag festgehalten — seit dem
   * Quellenwechsel (2026-08-15) sind Rolle und Koordination zwei unabhaengige Achsen, und „gatet
   * nicht" muss auf beiden gelten.
   *
   * DIE GRUPPE STEHT AM AUFRUF, NICHT IN DER ZEILE: `iuk-aufgaben-koordination` ist der
   * Registry-Vorgabewert (`core/registry.ts`); `SUITE_ADMIN_GROUP_AUFGABEN` ist in der
   * Testumgebung nicht gesetzt.
   */
  it.each<[Rolle, boolean]>([
    ["auftrag", false],
    ["auftrag", true],
    ["bufdi", false],
    ["bufdi", true],
  ])(
    "Rolle %s, koordiniert %s bekommt die Seite (200), kein notFound()",
    async (rolle, koordiniert) => {
      const p = legePerson(`np-${rolle}-${koordiniert}`, rolle);
      sitzung = {
        user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
      };
      await mount(await NeuPage());
      expect(query("h1").textContent).toBe("Aufgabe einstellen");
    },
  );

  it("eine ausgeschiedene Person bekommt die Seite ebenfalls — die Action lehnt erst beim Absenden ab", async () => {
    const doerte = legePerson("dev:doerte@test", "bufdi", { aktivBis: "2020-01-01" });
    sitzung = { user: { id: doerte.sub } };
    await mount(await NeuPage());
    expect(query("h1").textContent).toBe("Aufgabe einstellen");
  });

  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await NeuPage();
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });

  it("ohne Sitzung: notFound()", async () => {
    sitzung = null;
    await expect(NeuPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
