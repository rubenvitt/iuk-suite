// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "./_db/testdb";
import { personen, type PersonRow, type Rolle } from "./_db/schema";

/*
 * MOCKS: `next/navigation` (fuer `notFound()`, ausgeloest von `personFuerSession`, UND fuer
 * `useRouter`/`usePathname`/`useSearchParams`, gebraucht von `TagesWaehler` innerhalb der
 * `bufdi`-Fassung), `@/core/auth` (fuer die Sitzung) und `./_db/client` (fuer die Testdatenbank) —
 * dieselbe Form wie `_lib/zugang.test.ts` und `routinen/page.test.tsx`.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
let mockDb: TestDb;
vi.mock("./_db/client", () => ({ getDb: () => mockDb.db }));

import AufgabenPage, { aufgabenInhalt } from "./page";

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

const HEUTE = "2026-08-10";

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

describe("aufgabenInhalt — der Verteiler waehlt nach Rolle (Spec §8)", () => {
  it("bufdi bekommt „Meine Woche“ (EinstiegBufdi)", async () => {
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(aufgabenInhalt(t.db, alina, HEUTE, {}));
    expect(query("h1").textContent).toBe("Meine Woche");
  });

  it("koordination bekommt einen ehrlichen, benannten Platzhalter — keine leere Seite", async () => {
    const rike = legePerson("dev:rike@test", "koordination", { name: "Rike" });
    await mount(aufgabenInhalt(t.db, rike, HEUTE, {}));
    expect(query("h1").textContent).toBe("Verteilung");
    expect(document.body.textContent).toContain("Rike");
    expect(document.body.textContent).not.toBe("");
  });

  it("auftrag bekommt ebenfalls einen ehrlichen, benannten Platzhalter, mit anderem Titel", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    await mount(aufgabenInhalt(t.db, malte, HEUTE, {}));
    expect(query("h1").textContent).toBe("Meine Aufträge");
    expect(document.body.textContent).toContain("Malte");
  });

  it("reicht woche/tag aus den Suchparametern an EinstiegBufdi durch", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(aufgabenInhalt(t.db, alina, HEUTE, { woche: "2026-08-24" }));
    expect(document.body.textContent).toContain("Mo, 24.08.");
  });
});

describe("AufgabenPage — Default-Export", () => {
  it("traegt data-testid=\"aufgaben-content\" (Vertrag aus Aufgabe 1)", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await mount(await AufgabenPage({ searchParams: Promise.resolve({}) }));
    expect(query('[data-testid="aufgaben-content"]')).toBeTruthy();
  });

  it("kein Eintrag in personen: notFound(), nicht 403", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    await expect(AufgabenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("ohne Sitzung: ebenfalls notFound()", async () => {
    sitzung = null;
    await expect(AufgabenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
