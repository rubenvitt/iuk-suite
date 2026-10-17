import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { lagerorte, artikel, sollPositionen, checks, plomben } from "../_db/schema";
import { parseCheckErgebnis } from "../_lib/checkErgebnis";
import { VOLLE_REICHWEITE } from "../_lib/helferBereich";

/**
 * IDA-222 — Kurzcheck, Vollcheck und Plomben am Abschluss. Eigene Datei neben
 * `check.test.ts`, mit denselben Attrappen: die Faelle dort beschreiben den
 * Abgleich, diese hier nur, was IDA-222 hinzufuegt.
 */
const { riegel } = vi.hoisted(() => ({ riegel: vi.fn<(db: unknown) => Promise<unknown>>() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../_lib/helferZugang", () => ({ requireHelferSchreibend: (db: unknown) => riegel(db) }));
vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db"); },
}));

import { checkAbschluss } from "./check";

let t: TestDb;

beforeEach(() => {
  riegel.mockResolvedValue({
    ok: true,
    zugang: {
      herkunft: "token" as const, tokenId: "tk1", code: "482-137", label: "RTW 1",
      laeuftAb: new Date(Date.now() + 3_600_000), fahrzeugBindung: null,
      reichweite: VOLLE_REICHWEITE,
    },
  });
  t = migrierteTestDb();
  const jetzt = new Date();
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
  ]).run();
  t.db.insert(artikel).values([
    { id: "mull", name: "Mullbinde", einheit: "Stk", fach: "A", mindestbestand: 0, aktiv: true, createdAt: jetzt },
    { id: "decke", name: "Rettungsdecke", einheit: "Stk", fach: "B", mindestbestand: 0, aktiv: true, createdAt: jetzt },
    { id: "guedel", name: "Guedeltubus", einheit: "Stk", fach: "C", mindestbestand: 0, aktiv: true, createdAt: jetzt },
  ]).run();
  t.db.insert(sollPositionen).values([
    // Mullbinde liegt in ZWEI Faechern — der Fall, an dem eine Stichprobe den
    // Bestand beschaedigen koennte.
    { id: "sp-mull-1", fahrzeugId: "fz-1", fachLabel: "Fach 1", sort: 1, artikelId: "mull", soll: 4, entfernt: false },
    { id: "sp-mull-k", fahrzeugId: "fz-1", fachLabel: "Medizinkoffer", sort: 1, artikelId: "mull", soll: 2, entfernt: false },
    { id: "sp-guedel", fahrzeugId: "fz-1", fachLabel: "Medizinkoffer", sort: 2, artikelId: "guedel", soll: 3, entfernt: false },
    { id: "sp-decke", fahrzeugId: "fz-1", fachLabel: "Fach 2", sort: 1, artikelId: "decke", soll: 2, entfernt: false },
  ]).run();
  t.db.insert(plomben).values([
    { id: "pl-koffer", lagerortId: "fz-1", bezeichnung: "Medizinkoffer", fachLabel: "Medizinkoffer",
      nummer: "12345", gesetztAt: jetzt, createdAt: jetzt },
    { id: "pl-nie", lagerortId: "fz-1", bezeichnung: "Kindertasche", fachLabel: null,
      nummer: null, createdAt: jetzt },
    { id: "pl-fremd", lagerortId: "fz-2", bezeichnung: "Fremd", fachLabel: null,
      nummer: "999", createdAt: jetzt },
  ]).run();
});

afterEach(() => { t.schliessen(); vi.clearAllMocks(); });

const basis = { fahrzeugId: "fz-1", geraete: [], flaschen: [], verfaelle: [] };
const pos = (id: string, ist: number) => ({ sollPositionId: id, ist, nachfuellMenge: 0 });

const plombe = (id: string) => t.db.select().from(plomben).where(eq(plomben.id, id)).get()!;
const ergebnis = () => parseCheckErgebnis(t.db.select().from(checks).get()!.ergebnis);

describe("ein Artikel wird ganz oder gar nicht gezaehlt", () => {
  it("weist eine Nutzlast ab, die einen Artikel nur in einem seiner Faecher zaehlt", async () => {
    await expect(checkAbschluss({
      ...basis, art: "kurz", positionen: [pos("sp-mull-1", 4)],
      plomben: [{ plombeId: "pl-koffer", nummer: "12345" }],
    }, t.db)).rejects.toThrow(/Teil seiner Fächer/);
    expect(t.db.select().from(checks).all()).toHaveLength(0);
  });

  it("nimmt denselben Artikel an, wenn beide Faecher gezaehlt sind", async () => {
    const r = await checkAbschluss({
      ...basis, art: "kurz", positionen: [pos("sp-mull-1", 4), pos("sp-mull-k", 2)],
      plomben: [{ plombeId: "pl-koffer", nummer: "12345" }],
    }, t.db);
    expect(r.ok).toBe(true);
  });
});

describe("Kurzcheck — Plomben ablesen", () => {
  it("haelt eine passende Plombe fest und laesst sie stehen", async () => {
    const r = await checkAbschluss({
      ...basis, art: "kurz", positionen: [pos("sp-decke", 2)],
      plomben: [{ plombeId: "pl-koffer", nummer: "123 45" }],
    }, t.db);
    expect(r.ok && r.wert.plombenOffen).toBe(0);
    expect(plombe("pl-koffer").nummer).toBe("12345");
    const e = ergebnis();
    expect(e.version === 2 && e.art).toBe("kurz");
    expect(e.version === 2 && e.plomben).toEqual([{
      plombeId: "pl-koffer", bezeichnung: "Medizinkoffer", erwartet: "12345", gelesen: "123 45", intakt: true,
    }]);
  });

  it("eine andere Nummer oeffnet die Plombe — ihr Fach muss gezaehlt sein", async () => {
    await expect(checkAbschluss({
      ...basis, art: "kurz", positionen: [pos("sp-decke", 2)],
      plomben: [{ plombeId: "pl-koffer", nummer: "54321" }],
    }, t.db)).rejects.toThrow(/offenen Plombe/);
    expect(plombe("pl-koffer").nummer).toBe("12345");
  });

  it("ist das Fach gezaehlt, gilt die Plombe danach als offen", async () => {
    const r = await checkAbschluss({
      ...basis, art: "kurz",
      positionen: [pos("sp-mull-1", 4), pos("sp-mull-k", 2), pos("sp-guedel", 3)],
      plomben: [{ plombeId: "pl-koffer", nummer: null }],
    }, t.db);
    expect(r.ok && r.wert.plombenOffen).toBe(1);
    expect(plombe("pl-koffer").nummer).toBeNull();
    expect(plombe("pl-koffer").gesetztAt).toBeNull();
    const e = ergebnis();
    expect(e.version === 2 && e.plomben?.[0]).toMatchObject({ intakt: false, gelesen: null, erwartet: "12345" });
  });

  it("eine stehende Plombe muss abgelesen werden", async () => {
    await expect(checkAbschluss({
      ...basis, art: "kurz", positionen: [pos("sp-decke", 2)], plomben: [],
    }, t.db)).rejects.toThrow(/nicht abgelesen/);
  });

  it("eine Plombe einer anderen Einheit wird abgewiesen", async () => {
    await expect(checkAbschluss({
      ...basis, art: "kurz", positionen: [],
      plomben: [{ plombeId: "pl-koffer", nummer: "12345" }, { plombeId: "pl-fremd", nummer: "999" }],
    }, t.db)).rejects.toThrow(/gehört nicht/);
  });
});

describe("Vollcheck — Plomben setzen", () => {
  const alles = [pos("sp-mull-1", 4), pos("sp-mull-k", 2), pos("sp-guedel", 3), pos("sp-decke", 2)];

  it("setzt neue Nummern und haelt sie im Nachweis fest", async () => {
    const r = await checkAbschluss({
      ...basis, art: "voll", positionen: alles,
      plomben: [{ plombeId: "pl-koffer", nummer: "777" }, { plombeId: "pl-nie", nummer: "888" }],
    }, t.db);
    expect(r.ok && r.wert.plombenGesetzt).toBe(2);
    expect(plombe("pl-koffer").nummer).toBe("777");
    expect(plombe("pl-nie").nummer).toBe("888");
    expect(plombe("pl-nie").gesetztAt).toBeInstanceOf(Date);
    const e = ergebnis();
    expect(e.version === 2 && e.art).toBe("voll");
    expect(e.version === 2 && e.plomben?.map((p) => p.gesetzt)).toEqual(["777", "888"]);
  });

  it("eine leere Nummer laesst die Plombe, wie sie war", async () => {
    const r = await checkAbschluss({
      ...basis, art: "voll", positionen: alles, plomben: [{ plombeId: "pl-koffer", nummer: "" }],
    }, t.db);
    expect(r.ok && r.wert.plombenGesetzt).toBe(0);
    expect(plombe("pl-koffer").nummer).toBe("12345");
  });

  it("ohne `art` ist ein Check ein Vollcheck — wie vor IDA-222", async () => {
    await checkAbschluss({ ...basis, positionen: alles }, t.db);
    const e = ergebnis();
    expect(e.version === 2 && e.art).toBe("voll");
  });
});
