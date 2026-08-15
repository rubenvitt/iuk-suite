// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "./_db/testdb";
import { personen, type PersonRow, type Rolle } from "./_db/schema";

/*
 * MOCKS: `next/navigation` (fuer `notFound()`, ausgeloest von `personFuerSeite` OHNE Sitzung, UND
 * fuer `useRouter`/`usePathname`/`useSearchParams`, gebraucht von `TagesWaehler` innerhalb der
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

  /*
   * SEIT AUFGABE 14 DIE ECHTE `EinstiegKoordination` STATT DES PLATZHALTERS — die Verzweigung in
   * `aufgabenInhalt` selbst aendert sich dabei nicht (Aufgabe 13s Bericht kuendigt das ausdruecklich
   * an: "nur der jeweilige case-Zweig tauscht seinen Rueckgabewert"). Die ausfuehrliche Pruefung
   * (KPI-Zahlen, Freigabe-Trennung, Ueberfaelligkeit …) lebt in `_ui/EinstiegKoordination.test.tsx`
   * — hier nur der Beleg, dass DIESE Rolle DIESE Komponente bekommt.
   */
  it("koordination bekommt „Verteilung“ (EinstiegKoordination)", async () => {
    const rike = legePerson("dev:rike@test", "koordination", { name: "Rike" });
    await mount(aufgabenInhalt(t.db, rike, HEUTE, {}));
    expect(query("h1").textContent).toBe("Verteilung");
    expect(document.body.textContent).toContain("Zu verteilen");
    expect(document.body.textContent).not.toBe("");
  });

  /*
   * SEIT AUFGABE 15 DIE ECHTE `EinstiegAuftrag` STATT DES PLATZHALTERS AUS AUFGABE 13 — die
   * Verzweigung in `aufgabenInhalt` selbst aendert sich dabei nicht (dieselbe Zusage wie beim
   * Wechsel auf `EinstiegKoordination` in Aufgabe 14). Die ausfuehrliche Pruefung (eigene
   * Auftraege, Freigabe-Trennung, kein Verteil-Weg …) lebt in `_ui/EinstiegAuftrag.test.tsx` — hier
   * nur der Beleg, dass DIESE Rolle DIESE Komponente bekommt.
   */
  it("auftrag bekommt „Meine Aufträge“ (EinstiegAuftrag)", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    await mount(aufgabenInhalt(t.db, malte, HEUTE, {}));
    expect(query("h1").textContent).toBe("Meine Aufträge");
    expect(document.body.textContent).toContain("Aufgabe einstellen");
    expect(document.body.textContent).not.toContain("entsteht in einer der nächsten Aufgaben");
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

  /*
   * SPEC-NACHTRAG 2026-08-14 (`1d36008`, Fix-Runde 1): Modulzugang (Sitzung vorhanden) OHNE
   * `personen`-Zeile ist NICHT mehr `notFound()` — die Erklaerseite `NichtEingetragenSeite`,
   * weil die Person den Modulzugang hat (die Middleware hat ihn schon geprueft), es also nichts
   * vor ihr zu verbergen gibt.
   */
  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await AufgabenPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(query('[data-testid="aufgaben-content"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });

  it("ohne Sitzung: ebenfalls notFound()", async () => {
    sitzung = null;
    await expect(AufgabenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
