import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { lagerorte, plomben } from "../_db/schema";

const { adminRiegel } = vi.hoisted(() => ({ adminRiegel: vi.fn<() => Promise<unknown>>() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../_lib/zugang", () => ({ requireLagerbuchAdmin: () => adminRiegel() }));
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { plombeAendern, plombeAnlegen } from "./plomben";
import { loescheElement } from "./loeschen";

let t: TestDb;

beforeEach(() => {
  adminRiegel.mockResolvedValue({ sub: "u-admin", groups: ["lagerbuch"], name: "A", email: null });
  t = migrierteTestDb();
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "KTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
  ]).run();
});
afterEach(() => { t.schliessen(); vi.clearAllMocks(); });

const zeile = (id: string) => t.db.select().from(plomben).where(eq(plomben.id, id)).get()!;

describe("plombeAnlegen", () => {
  it("legt eine Plombe ohne Nummer an — gesetzt wird im Vollcheck", async () => {
    const r = await plombeAnlegen({ lagerortId: "fz-1", bezeichnung: " Medizinkoffer ", fachLabel: "Koffer" }, t.db);
    expect(r.ok).toBe(true);
    const p = zeile(r.ok ? r.wert.id : "");
    expect(p).toMatchObject({ bezeichnung: "Medizinkoffer", fachLabel: "Koffer", nummer: null, aktiv: true });
  });

  it("ein leeres Fach heisst „deckt kein Fach ab“", async () => {
    const r = await plombeAnlegen({ lagerortId: "fz-1", bezeichnung: "Tasche", fachLabel: "" }, t.db);
    expect(zeile(r.ok ? r.wert.id : "").fachLabel).toBeNull();
  });

  it("weist eine unbekannte Einheit und eine leere Bezeichnung ab", async () => {
    expect((await plombeAnlegen({ lagerortId: "gibt-es-nicht", bezeichnung: "X", fachLabel: null }, t.db)).ok).toBe(false);
    expect((await plombeAnlegen({ lagerortId: "fz-1", bezeichnung: "  ", fachLabel: null }, t.db)).ok).toBe(false);
  });

  it("laeuft nur fuer die Verwaltung", async () => {
    adminRiegel.mockRejectedValueOnce(new Error("kein Lagerbuch-Admin"));
    await expect(plombeAnlegen({ lagerortId: "fz-1", bezeichnung: "X", fachLabel: null }, t.db)).rejects.toThrow();
  });
});

describe("plombeAendern", () => {
  beforeEach(() => {
    t.db.insert(plomben).values({
      id: "pl", lagerortId: "fz-1", bezeichnung: "Koffer", fachLabel: "Koffer",
      nummer: "123", gesetztAt: new Date(), createdAt: new Date(),
    }).run();
  });

  it("ein anderes Fach oeffnet die Plombe — sie bezeugte das alte", async () => {
    expect((await plombeAendern({ id: "pl", lagerortId: "fz-1", fachLabel: "Fach 2" }, t.db)).ok).toBe(true);
    expect(zeile("pl")).toMatchObject({ fachLabel: "Fach 2", nummer: null, gesetztAt: null });
  });

  it("stilllegen laesst die Nummer stehen, reaktivieren oeffnet sie", async () => {
    await plombeAendern({ id: "pl", lagerortId: "fz-1", aktiv: false }, t.db);
    expect(zeile("pl")).toMatchObject({ aktiv: false, nummer: "123" });
    await plombeAendern({ id: "pl", lagerortId: "fz-1", aktiv: true }, t.db);
    expect(zeile("pl")).toMatchObject({ aktiv: true, nummer: null });
  });

  it("findet keine Plombe ueber eine fremde Einheit", async () => {
    t.db.insert(lagerorte).values({ id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true }).run();
    const r = await plombeAendern({ id: "pl", lagerortId: "fz-2", aktiv: false }, t.db);
    expect(r.ok).toBe(false);
    expect(zeile("pl").aktiv).toBe(true);
  });
});

describe("eine Einheit loeschen", () => {
  it("nimmt ihre Plomben mit", async () => {
    await plombeAnlegen({ lagerortId: "fz-1", bezeichnung: "Koffer", fachLabel: null }, t.db);
    expect(await loescheElement("lagerort", "fz-1", t.db)).toEqual({ ok: true });
    expect(t.db.select().from(plomben).all()).toEqual([]);
  });
});
