import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, lagerorte, tokens } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";

const {
  adminRiegel,
  generatorKonfiguration,
  revalidiert,
  ziffernGenerator,
} = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  generatorKonfiguration: [] as { alphabet: string; laenge: number | undefined }[],
  revalidiert: [] as string[],
  ziffernGenerator: vi.fn<() => string>(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test - jeder Aufruf uebergibt t.db"); },
}));

vi.mock("nanoid", async () => {
  const echt = await vi.importActual<typeof import("nanoid")>("nanoid");
  return {
    ...echt,
    customAlphabet: (alphabet: string, laenge?: number) => {
      generatorKonfiguration.push({ alphabet, laenge });
      return ziffernGenerator;
    },
  };
});

import * as tokenActions from "./tokens";
import * as tokenLesepfade from "../_lib/lesepfade/tokens";

const { setTokenAktiv } = tokenActions;
const { tokenListe } = tokenLesepfade;

const LISTENPFAD = "/m/lagerbuch/verwaltung/tokens";
const QUELLE = "src/app/m/lagerbuch/_actions/tokens.ts";
const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = {
  sub: "u-admin",
  groups: ["lagerbuch"],
  name: "A. Verwaltung",
  email: null,
};

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockReset();
  adminRiegel.mockResolvedValue(VIEWER);
  ziffernGenerator.mockReset();
  let naechsterCode = 1;
  ziffernGenerator.mockImplementation(
    () => String(naechsterCode++).padStart(6, "0"),
  );
  t = migrierteTestDb("lagerbuch-actions-tokens-");
});

afterEach(() => {
  t.schliessen();
});

function wertVon<T>(ergebnis: { ok: boolean }): T {
  expect(ergebnis.ok).toBe(true);
  return (ergebnis as { ok: true; wert: T }).wert;
}

function fehlerVon(ergebnis: { ok: boolean }) {
  return ergebnis as {
    ok: false;
    fehler: string;
    feldFehler?: Record<string, string>;
  };
}

function tokenZeilen() {
  return t.db.select().from(tokens).all();
}

function tokenDirekt(args: {
  id: string;
  code: string;
  label?: string;
  aktiv?: boolean;
  createdAt?: Date;
  lastUsedAt?: Date | null;
  zielTyp?: "fahrzeug" | "artikel" | null;
  zielId?: string | null;
}): void {
  t.db.insert(tokens).values({
    id: args.id,
    code: args.code,
    label: args.label ?? args.id,
    scopeLagerortId: null,
    zielTyp: args.zielTyp ?? null,
    zielId: args.zielId ?? null,
    aktiv: args.aktiv ?? true,
    createdAt: args.createdAt ?? JETZT,
    createdBy: "fixture",
    lastUsedAt: args.lastUsedAt ?? null,
  }).run();
}

function fahrzeugAnlegen(args: {
  id: string;
  name: string;
  kennung?: string | null;
  aktiv?: boolean;
  einheitenart?: "fahrzeug" | "tasche" | null;
}): void {
  t.db.insert(lagerorte).values({
    id: args.id,
    name: args.name,
    typ: "fahrzeug",
    kennung: args.kennung ?? null,
    aktiv: args.aktiv ?? true,
    einheitenart: args.einheitenart ?? null,
  }).run();
}

function artikelAnlegen(args: {
  id: string;
  name: string;
  fach: string;
  aktiv?: boolean;
}): void {
  t.db.insert(artikel).values({
    id: args.id,
    name: args.name,
    einheit: "Stk.",
    fach: args.fach,
    mindestbestand: 1,
    aktiv: args.aktiv ?? true,
    createdAt: JETZT,
  }).run();
}

describe("Bauform und Riegel", () => {
  /**
   * ⚠️ EINE ACTION, EIN LESEPFAD — DRK-406, und diese Zusicherung ist der
   * Riegel gegen das naheliegende Versehen. `createToken` und `tokenZiele`
   * sind mit dem Anlegen von Hand entfallen; eine `"use server"`-Datei macht
   * aus jedem Export einen global aufrufbaren Endpunkt, ein „nur den Knopf
   * wegnehmen" hätte die Fähigkeit stehen lassen. Wer sie zurückholt, holt
   * nicht einen Dialog zurück, sondern einen Weg, Codes ohne Karte anzulegen.
   */
  it("exportiert genau eine Runtime-Action und einen Runtime-Lesepfad", () => {
    expect(Object.keys(tokenActions).sort()).toEqual(["setTokenAktiv"]);
    expect(Object.keys(tokenLesepfade).sort()).toEqual(["tokenListe"]);
  });

  /**
   * ⚠️ UND DIE ZIEHUNG IST MIT UMGEZOGEN. Diese Datei zieht keine Codes mehr;
   * sie steht in `_lib/schreibpfade/ortCodes.ts` und nirgends sonst. Ein
   * zweiter `customAlphabet`-Aufruf hier wären zwei Zufälle für denselben
   * Namensraum — und das fiele erst auf, wenn zwei Karten denselben Code
   * trügen. Geprüft wird die ABWESENHEIT am Quelltext, weil ein Laufzeittest
   * für etwas, das nicht passiert, nichts zu beobachten hat.
   */
  it("zieht selbst keine Codes mehr", () => {
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle).not.toContain("customAlphabet");
    expect(quelle).not.toContain("tokenForm");
    expect(generatorKonfiguration).toEqual([]);
  });

  it.each([
    ["setTokenAktiv", () => setTokenAktiv({ id: "", aktiv: "nein" }, t.db)],
  ])("%s ruft den Admin-Riegel vor Validierung oder Datenzugriff auf", async (_name, aufruf) => {
    const riegelFehler = new Error("Riegel vor Eingabe und DB");
    adminRiegel.mockRejectedValueOnce(riegelFehler);

    await expect(aufruf()).rejects.toBe(riegelFehler);
    expect(tokenZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("setTokenAktiv", () => {
  it("sperrt und reaktiviert mit exakt dem Listenpfad", async () => {
    tokenDirekt({ id: "token-1", code: "444-444" });

    expect(await setTokenAktiv({ id: "token-1", aktiv: false }, t.db))
      .toEqual({ ok: true });
    expect(t.db.select().from(tokens).where(eq(tokens.id, "token-1")).get()?.aktiv)
      .toBe(false);
    expect(revalidiert).toEqual([LISTENPFAD]);

    revalidiert.length = 0;
    expect(await setTokenAktiv({ id: "token-1", aktiv: true }, t.db))
      .toEqual({ ok: true });
    expect(t.db.select().from(tokens).where(eq(tokens.id, "token-1")).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("weist ungueltige Nutzlast ohne Schreiben oder Revalidierung ab", async () => {
    tokenDirekt({ id: "token-1", code: "444-444" });

    const ergebnis = await setTokenAktiv({ id: "", aktiv: "nein" }, t.db);

    expect(ergebnis).toEqual({ ok: false, fehler: "Ungültige Eingabe." });
    expect(t.db.select().from(tokens).where(eq(tokens.id, "token-1")).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });

  it("gibt bei einem Updatefehler nur einen festen deutschen Fehler zurueck", async () => {
    tokenDirekt({ id: "token-1", code: "444-444" });
    t.sqlite.exec(`
      CREATE TRIGGER tokens_update_defekt
      BEFORE UPDATE ON tokens
      BEGIN
        SELECT RAISE(ABORT, 'STATUS_SQL_GEHEIMNIS');
      END;
    `);

    const ergebnis = await setTokenAktiv({ id: "token-1", aktiv: false }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Zugangs-Code-Status konnte nicht geändert werden.",
    });
    expect(fehlerVon(ergebnis).fehler).not.toContain("STATUS_SQL_GEHEIMNIS");
    expect(t.db.select().from(tokens).where(eq(tokens.id, "token-1")).get()?.aktiv)
      .toBe(true);
    expect(revalidiert).toEqual([]);
  });
});

describe("tokenListe", () => {
  it("listet auch inaktive Tokens, loest beide Zielnamen auf und sortiert Gleichstaende stabil", () => {
    fahrzeugAnlegen({
      id: "fz-inaktiv",
      name: "RTW Vergangenheit",
      kennung: "MS-ALT",
      aktiv: false,
      einheitenart: "fahrzeug",
    });
    artikelAnlegen({ id: "art-1", name: "Mullbinde", fach: "A1" });
    const gleich = new Date("2026-08-07T12:00:00Z");
    tokenDirekt({
      id: "token-y",
      code: "666-666",
      label: "Fahrzeug-Code",
      createdAt: gleich,
      zielTyp: "fahrzeug",
      zielId: "fz-inaktiv",
    });
    // Absichtlich VOR token-z eingefuegt: Ohne den zweiten ORDER-BY-Ausdruck
    // waere die Einfuegereihenfolge stabil genug, um den Test falsch-gruen zu
    // machen. Der erwartete ID-Tiebreak muss sie umdrehen.
    tokenDirekt({
      id: "token-z",
      code: "555-555",
      label: "Artikel-Code",
      aktiv: false,
      createdAt: gleich,
      lastUsedAt: new Date("2026-08-07T12:30:00Z"),
      zielTyp: "artikel",
      zielId: "art-1",
    });
    tokenDirekt({
      id: "token-a",
      code: "777-777",
      label: "Allgemein",
      createdAt: new Date("2026-08-07T11:59:59Z"),
    });

    expect(tokenListe(t.db)).toEqual([
      {
        id: "token-z",
        code: "555-555",
        label: "Artikel-Code",
        aktiv: false,
        lastUsedAt: new Date("2026-08-07T12:30:00Z"),
        createdAt: gleich,
        zielTyp: "artikel",
        zielId: "art-1",
        zielName: "Mullbinde",
        // ⚠️ EIN ARTIKEL HAT KEINE ART (DRK-309) — hier steht `null`, und das
        // heisst „gegenstandslos", nicht „noch nicht zugeordnet".
        zielKennung: null,
        zielEinheitenart: null,
        ortId: null,
        ortName: null,
        ortTyp: null,
        ortKennung: null,
        ortEinheitenart: null,
      },
      {
        id: "token-y",
        code: "666-666",
        label: "Fahrzeug-Code",
        aktiv: true,
        lastUsedAt: null,
        createdAt: gleich,
        zielTyp: "fahrzeug",
        zielId: "fz-inaktiv",
        zielName: "RTW Vergangenheit",
        // Auch fuer ein INAKTIVES Ziel — die Liste bleibt lesbar, und wer den
        // Code sperrt, muss sehen, woran er klebte.
        zielKennung: "MS-ALT",
        zielEinheitenart: "fahrzeug",
        ortId: null,
        ortName: null,
        ortTyp: null,
        ortKennung: null,
        ortEinheitenart: null,
      },
      {
        id: "token-a",
        code: "777-777",
        label: "Allgemein",
        aktiv: true,
        lastUsedAt: null,
        createdAt: new Date("2026-08-07T11:59:59Z"),
        zielTyp: null,
        zielId: null,
        zielName: null,
        zielKennung: null,
        zielEinheitenart: null,
        ortId: null,
        ortName: null,
        ortTyp: null,
        ortKennung: null,
        ortEinheitenart: null,
      },
    ]);
    expect(revalidiert).toEqual([]);
  });
});
