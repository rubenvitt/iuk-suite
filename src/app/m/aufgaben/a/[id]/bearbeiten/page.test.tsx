// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { aufgaben, personen, type AufgabeRow, type PersonRow, type Rolle } from "../../../_db/schema";

/*
 * DAS GATE DER BEARBEITEN-SEITE (DRK-487) — `bearbeitung()` und `darfAufgabeSehen`, beide mit
 * `notFound()` statt 403. Dieselbe Pruefstand-Bauart wie `a/[id]/page.test.tsx`.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let t: TestDb;
vi.mock("../../../_db/client", () => ({ getDb: () => t.db }));

import AufgabeBearbeitenPage from "./page";

beforeEach(() => {
  t = migrierteTestDb();
  sitzung = null;
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

function legePerson(sub: string, rolle: Rolle): PersonRow {
  return t.db
    .insert(personen)
    .values({ sub, name: sub, initialen: sub.slice(4, 6).toUpperCase(), rolle, aktivVon: "2026-01-01" })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }): AufgabeRow {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "Funkgeräte laden",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "verteilt",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = { user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] } };
}

const seite = (id: string) => AufgabeBearbeitenPage({ params: Promise.resolve({ id }) });

describe("/a/<id>/bearbeiten", () => {
  it("der Ersteller sieht das vorbelegte Formular", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    const a = legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, zugewiesenAn: alina.id });
    anmelden(malte);
    await mount(await seite(a.id));
    expect(query("h1").textContent).toBe("Aufgabe bearbeiten");
    expect(query<HTMLInputElement>("#af-titel").value).toBe("Funkgeräte laden");
  });

  it("die Koordination darf auch eine fremde Aufgabe bearbeiten", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const rike = legePerson("dev:rike@test", "auftrag");
    const a = legeAufgabe({ erstellerId: malte.id, prueferId: malte.id });
    anmelden(rike, true);
    await mount(await seite(a.id));
    expect(query("h1").textContent).toBe("Aufgabe bearbeiten");
  });

  it("die zugewiesene BuFDi einer Fremdaufgabe bekommt notFound()", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    const a = legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, zugewiesenAn: alina.id });
    anmelden(alina);
    await expect(seite(a.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("aus „Freigabe offen“ bekommt auch der Ersteller notFound()", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    const a = legeAufgabe({
      erstellerId: malte.id,
      prueferId: malte.id,
      zugewiesenAn: alina.id,
      status: "freigabe_offen",
    });
    anmelden(malte);
    await expect(seite(a.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("eine unbekannte Id bleibt notFound()", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    anmelden(malte);
    await expect(seite("gibt-es-nicht")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
