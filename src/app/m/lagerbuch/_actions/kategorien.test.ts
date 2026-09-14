import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ausgeblendeteKategorien, users } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { KATEGORIEN_AUSWAHL_MAX } from "../_lib/kategorie";
import { ausgeblendeteKategorienVon } from "../_lib/lesepfade/kategorien";

const { revalidiert, adminRiegel } = vi.hoisted(() => ({
  revalidiert: [] as string[],
  adminRiegel: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test — jeder Aufruf übergibt t.db"); },
}));

import { setzeAusgeblendeteKategorien } from "./kategorien";

const VIEWER = { sub: "u-anna", groups: ["lagerbuch"], name: "Anna", email: null };
const ARTIKEL_PFAD = "/m/lagerbuch/verwaltung/artikel";

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-kategorien-");
  // Im Betrieb legt `requireLagerbuchAdmin` die Zeile an (`merkeNutzer`); der
  // Riegel ist hier gemockt, also steht sie im Test selbst.
  t.db.insert(users).values([{ id: "u-anna" }, { id: "u-bert" }]).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

describe("setzeAusgeblendeteKategorien", () => {
  it("speichert gefaltet, ohne Doppel und Leerwerte, fuer das Konto aus der Sitzung", async () => {
    const erg = await setzeAusgeblendeteKategorien(
      { kategorien: ["Hygiene", " HYGIENE ", "Sanitätsmaterial", "", "   "] },
      t.db,
    );

    expect(erg).toEqual({ ok: true });
    expect(ausgeblendeteKategorienVon(t.db, "u-anna")).toEqual(["hygiene", "sanitätsmaterial"]);
    expect(revalidiert).toEqual([ARTIKEL_PFAD]);
  });

  it("ersetzt die vorige Auswahl, und eine leere Liste blendet nichts mehr aus", async () => {
    await setzeAusgeblendeteKategorien({ kategorien: ["Hygiene", "Technik"] }, t.db);
    await setzeAusgeblendeteKategorien({ kategorien: ["Technik"] }, t.db);
    expect(ausgeblendeteKategorienVon(t.db, "u-anna")).toEqual(["technik"]);

    await setzeAusgeblendeteKategorien({ kategorien: [] }, t.db);
    expect(ausgeblendeteKategorienVon(t.db, "u-anna")).toEqual([]);
  });

  /**
   * Die IDOR-Zusage (CLAUDE.md, „Zugriffsschutz"): das Konto kommt aus der
   * Sitzung, nie aus der Eingabe. Ein mitgeschicktes `userId` wird ignoriert,
   * und die Auswahl eines anderen Kontos bleibt unberuehrt.
   */
  it("schreibt nie fuer ein fremdes Konto, auch nicht auf Zuruf", async () => {
    t.db.insert(ausgeblendeteKategorien).values({ userId: "u-bert", kategorie: "technik" }).run();

    await setzeAusgeblendeteKategorien({ kategorien: ["Hygiene"], userId: "u-bert" }, t.db);

    expect(ausgeblendeteKategorienVon(t.db, "u-anna")).toEqual(["hygiene"]);
    expect(ausgeblendeteKategorienVon(t.db, "u-bert")).toEqual(["technik"]);
  });

  it.each([
    ["keine Liste", { kategorien: "Hygiene" }],
    ["kein Text in der Liste", { kategorien: ["Hygiene", 3] }],
    ["zu lange Kategorie", { kategorien: ["x".repeat(61)] }],
    ["zu viele Kategorien", { kategorien: Array.from({ length: KATEGORIEN_AUSWAHL_MAX + 1 }, (_, i) => `k${i}`) }],
  ])("weist %s zurueck, ohne die gespeicherte Auswahl anzufassen", async (_name, eingabe) => {
    await setzeAusgeblendeteKategorien({ kategorien: ["Hygiene"] }, t.db);
    revalidiert.length = 0;

    const erg = await setzeAusgeblendeteKategorien(eingabe, t.db);

    expect(erg).toEqual({ ok: false, fehler: "Die Auswahl konnte nicht gespeichert werden." });
    expect(ausgeblendeteKategorienVon(t.db, "u-anna")).toEqual(["hygiene"]);
    expect(revalidiert).toEqual([]);
  });

  it("laesst den Admin-Riegel vor jeder Validierung entscheiden", async () => {
    const verweigert = new Error("Riegel");
    adminRiegel.mockRejectedValueOnce(verweigert);

    await expect(setzeAusgeblendeteKategorien("kaputt", t.db)).rejects.toBe(verweigert);
    expect(t.db.select().from(ausgeblendeteKategorien).all()).toEqual([]);
  });
});
