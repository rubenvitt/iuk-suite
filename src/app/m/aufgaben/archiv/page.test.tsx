// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { aufgaben, personen, type AufgabeRow, type PersonRow, type Rolle } from "../_db/schema";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import ArchivPage, { archivInhalt } from "./page";

const HEUTE = "2026-08-13";

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

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }): AufgabeRow {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "abgeschlossen",
      faelligAm: "2026-08-01",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

describe("archivInhalt — Leerzustand ausgeschrieben", () => {
  it("zeigt einen ausgeschriebenen Satz, wenn es noch keine abgeschlossene Aufgabe gibt", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    await mount(archivInhalt(t.db, malte, HEUTE));
    expect(document.body.textContent).toContain("Noch keine abgeschlossene Aufgabe.");
  });
});

describe("archivInhalt — filtert SERVERSEITIG auf das Sichtrecht (Spec §8)", () => {
  /**
   * DIE KERNZUSAGE (Brief-Gegenprobe: „würde ein Test rot, wenn das Archiv im Browser statt
   * serverseitig filterte?"): `archivInhalt` bekommt die Person schon als Argument und liest die
   * Datenbank NUR EINMAL, INTERN gefiltert (`archiv(db).filter(darfAufgabeSehen)`) — Malte
   * bekommt Tomkes fremde, abgeschlossene Aufgabe NIRGENDS im gerenderten HTML zu sehen, nicht nur
   * optisch versteckt.
   */
  it("ein Auftraggeber sieht die abgeschlossene Aufgabe eines ANDEREN Auftraggebers NICHT im HTML", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const tomke = legePerson("dev:tomke@test", "auftrag", { name: "Tomke" });
    legeAufgabe({ erstellerId: tomke.id, prueferId: tomke.id, titel: "Tomkes Aufgabe" });
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Maltes Aufgabe" });

    await mount(archivInhalt(t.db, malte, HEUTE));
    expect(document.body.textContent).toContain("Maltes Aufgabe");
    expect(document.body.textContent).not.toContain("Tomkes Aufgabe");
  });

  it("die Koordination sieht JEDE abgeschlossene Aufgabe", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const malte = legePerson("dev:malte@test", "auftrag");
    const tomke = legePerson("dev:tomke@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Maltes Aufgabe" });
    legeAufgabe({ erstellerId: tomke.id, prueferId: tomke.id, titel: "Tomkes Aufgabe" });

    await mount(archivInhalt(t.db, rike, HEUTE));
    expect(document.body.textContent).toContain("Maltes Aufgabe");
    expect(document.body.textContent).toContain("Tomkes Aufgabe");
  });

  it("jeder BuFDi sieht jede abgeschlossene Aufgabe — Peer-Sichtbarkeit", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi");
    const bendix = legePerson("dev:bendix@test", "bufdi");
    legeAufgabe({ erstellerId: malte.id, zugewiesenAn: alina.id, prueferId: malte.id, titel: "Alinas Aufgabe" });

    await mount(archivInhalt(t.db, bendix, HEUTE));
    expect(document.body.textContent).toContain("Alinas Aufgabe");
  });
});

describe("archivInhalt — Filter auf Priorität", () => {
  it("zeigt nur die Aufgaben MIT der gewaehlten Priorität — echte, verschiedene Zahlen", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Hoch A", prioritaet: "hoch" });
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Hoch B", prioritaet: "hoch" });
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Mittel A", prioritaet: "mittel" });

    await mount(archivInhalt(t.db, malte, HEUTE, "hoch"));
    expect(document.body.textContent).toContain("Hoch A");
    expect(document.body.textContent).toContain("Hoch B");
    expect(document.body.textContent).not.toContain("Mittel A");
  });

  it("ein ungueltiger Filterwert wird ignoriert, statt zu werfen — zeigt alle sichtbaren Aufgaben", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, titel: "Eine Aufgabe" });

    await mount(archivInhalt(t.db, malte, HEUTE, "manipuliert"));
    expect(document.body.textContent).toContain("Eine Aufgabe");
  });

  it("zeigt einen EIGENEN Leertext, wenn der Filter alles wegfiltert (verschieden vom generellen Leerzustand)", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, prueferId: malte.id, prioritaet: "mittel" });

    await mount(archivInhalt(t.db, malte, HEUTE, "hoch"));
    expect(document.body.textContent).toContain("Keine abgeschlossene Aufgabe mit dieser Priorität.");
    expect(document.body.textContent).not.toContain("Noch keine abgeschlossene Aufgabe.");
  });
});

describe("ArchivPage — kein rollengebundenes Gate, aber die Erklärseite ohne personen-Zeile", () => {
  it("Sitzung ohne personen-Zeile: die Erklärseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await ArchivPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });

  it("jede Rolle erreicht /archiv (BuFDi, Beispiel)", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    const element = await ArchivPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(document.body.textContent).toContain("Noch keine abgeschlossene Aufgabe.");
  });
});
