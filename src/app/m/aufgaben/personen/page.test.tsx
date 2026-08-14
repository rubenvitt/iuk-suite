// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import PersonenPage, { personenInhalt } from "./page";

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

describe("personenInhalt — Kopf, Formular, Tabelle", () => {
  it("zeigt den Titel, die Anzahl und das Anlege-Formular", async () => {
    legePerson("dev:rike@test", "koordination", { name: "Rike" });
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(personenInhalt(t.db, HEUTE));
    expect(query("h1").textContent).toBe("Personenverwaltung");
    expect(document.body.textContent).toContain("2 Personen im Modul, davon 2 aktiv");
    expect(query("h2").textContent).toBe("Neue Person anlegen");
    expect(query("button[type='submit']").textContent).toBe("Person anlegen");
  });

  it("zeigt genau eine ausgeschiedene Person in der aktiv-Zahl korrekt", async () => {
    legePerson("dev:rike@test", "koordination");
    legePerson("dev:doerte@test", "bufdi", { aktivBis: "2020-01-01" });
    await mount(personenInhalt(t.db, HEUTE));
    expect(document.body.textContent).toContain("2 Personen im Modul, davon 1 aktiv");
  });

  it("mit bearbeitenId: zeigt das Aendern-Formular vorbelegt, mit Abbrechen-Verweis", async () => {
    legePerson("dev:rike@test", "koordination");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(personenInhalt(t.db, HEUTE, alina.id));
    expect(query("h2").textContent).toBe("Person „Alina“ ändern");
    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina");
    const abbrechen = queryAll<HTMLAnchorElement>("a").find((a) => a.textContent === "Abbrechen")!;
    expect(abbrechen, "Abbrechen-Verweis fehlt").toBeTruthy();
    expect(abbrechen.getAttribute("href")).toBe("/personen");
  });

  it("eine unbekannte bearbeitenId zeigt das Anlege-Formular, kein Fehler", async () => {
    legePerson("dev:rike@test", "koordination");
    await mount(personenInhalt(t.db, HEUTE, "unbekannte-id"));
    expect(query("h2").textContent).toBe("Neue Person anlegen");
  });
});

describe("PersonenPage — Rollen-Gate (Spec §4: nur koordination verwaltet Personen)", () => {
  it("koordination: die Seite antwortet normal", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };
    await mount(await PersonenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Personenverwaltung");
  });

  it("auftrag: notFound()", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    sitzung = { user: { id: malte.sub } };
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("bufdi: notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("eine ausgeschiedene Koordination bekommt ebenfalls notFound()", async () => {
    const exRike = legePerson("dev:ex-rike@test", "koordination", { aktivBis: "2020-01-01" });
    sitzung = { user: { id: exRike.sub } };
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await PersonenPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });
});
