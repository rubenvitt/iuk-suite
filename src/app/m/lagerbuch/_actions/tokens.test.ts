import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { artikel, lagerorte, tokens } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import {
  TOKEN_ALPHABET,
  TOKEN_ZIEHUNGEN,
  TOKEN_ZIFFERN,
} from "../_lib/tokenForm";

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

const { createToken, setTokenAktiv } = tokenActions;
const { tokenListe, tokenZiele } = tokenLesepfade;

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
}): void {
  t.db.insert(lagerorte).values({
    id: args.id,
    name: args.name,
    typ: "fahrzeug",
    kennung: args.kennung ?? null,
    aktiv: args.aktiv ?? true,
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
  it("exportiert genau zwei Runtime-Actions und zwei Runtime-Lesepfade", () => {
    expect(Object.keys(tokenActions).sort()).toEqual([
      "createToken",
      "setTokenAktiv",
    ]);
    expect(Object.keys(tokenLesepfade).sort()).toEqual([
      "tokenListe",
      "tokenZiele",
    ]);
  });

  it("konfiguriert den internen Generator fuer sechs Dezimalziffern", () => {
    expect(generatorKonfiguration).toContainEqual({
      alphabet: "0123456789",
      laenge: 6,
    });
  });

  it.each([
    ["createToken", () => createToken({ label: "" }, t.db)],
    ["setTokenAktiv", () => setTokenAktiv({ id: "", aktiv: "nein" }, t.db)],
  ])("%s ruft den Admin-Riegel vor Validierung oder Datenzugriff auf", async (_name, aufruf) => {
    const riegelFehler = new Error("Riegel vor Eingabe und DB");
    adminRiegel.mockRejectedValueOnce(riegelFehler);

    await expect(aufruf()).rejects.toBe(riegelFehler);
    expect(tokenZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });
});

describe("createToken", () => {
  it("speichert sechs Ziffern mit Bindestrich im Wert und ein allgemeines Ziel", async () => {
    ziffernGenerator.mockReturnValueOnce("123456");

    const ergebnis = await createToken({ label: "  Bereitschaft  " }, t.db);
    const { id, code } = wertVon<{ id: string; code: string }>(ergebnis);

    expect(code).toBe("123-456");
    expect(code).toMatch(/^\d{3}-\d{3}$/);
    expect(t.db.select().from(tokens).where(eq(tokens.id, id)).get()).toMatchObject({
      id,
      code: "123-456",
      label: "Bereitschaft",
      scopeLagerortId: null,
      zielTyp: null,
      zielId: null,
      aktiv: true,
      createdBy: "u-admin",
      lastUsedAt: null,
    });
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("akzeptiert nur vollstaendige Zielpaare", async () => {
    for (const eingabe of [
      { label: "X", zielTyp: "artikel" },
      { label: "X", zielId: "art-1" },
      { label: "X", zielTyp: "ungueltig", zielId: "art-1" },
    ]) {
      const ergebnis = await createToken(eingabe, t.db);
      expect(ergebnis.ok).toBe(false);
      expect(fehlerVon(ergebnis).fehler).toBe("Bitte die markierten Felder prüfen.");
    }

    expect(tokenZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("speichert aktive Fahrzeug- und Artikelziele mit ihrer echten Art", async () => {
    fahrzeugAnlegen({ id: "fz-aktiv", name: "RTW 1" });
    artikelAnlegen({ id: "art-aktiv", name: "Mullbinde", fach: "A1" });

    const fahrzeugToken = wertVon<{ id: string }>(await createToken({
      label: "Fahrzeug",
      zielTyp: "fahrzeug",
      zielId: "fz-aktiv",
    }, t.db));
    const artikelToken = wertVon<{ id: string }>(await createToken({
      label: "Artikel",
      zielTyp: "artikel",
      zielId: "art-aktiv",
    }, t.db));

    expect(t.db.select().from(tokens).where(eq(tokens.id, fahrzeugToken.id)).get())
      .toMatchObject({ zielTyp: "fahrzeug", zielId: "fz-aktiv" });
    expect(t.db.select().from(tokens).where(eq(tokens.id, artikelToken.id)).get())
      .toMatchObject({ zielTyp: "artikel", zielId: "art-aktiv" });
    expect(revalidiert).toEqual([LISTENPFAD, LISTENPFAD]);
  });

  it("lehnt fehlende, inaktive und artfremde Fahrzeugziele ab", async () => {
    fahrzeugAnlegen({ id: "fz-inaktiv", name: "RTW alt", aktiv: false });

    for (const zielId of ["fz-fehlt", "fz-inaktiv", HANDLAGER_ID]) {
      const ergebnis = await createToken({
        label: "Fahrzeug",
        zielTyp: "fahrzeug",
        zielId,
      }, t.db);
      expect(ergebnis).toEqual({
        ok: false,
        fehler: "Fahrzeug nicht gefunden oder inaktiv.",
        feldFehler: { zielId: "Fahrzeug nicht gefunden oder inaktiv." },
      });
    }

    expect(tokenZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("lehnt fehlende und inaktive Artikelziele ab", async () => {
    artikelAnlegen({
      id: "art-inaktiv",
      name: "Altbestand",
      fach: "Z9",
      aktiv: false,
    });

    for (const zielId of ["art-fehlt", "art-inaktiv"]) {
      const ergebnis = await createToken({
        label: "Artikel",
        zielTyp: "artikel",
        zielId,
      }, t.db);
      expect(ergebnis).toEqual({
        ok: false,
        fehler: "Artikel nicht gefunden oder inaktiv.",
        feldFehler: { zielId: "Artikel nicht gefunden oder inaktiv." },
      });
    }

    expect(tokenZeilen()).toEqual([]);
    expect(revalidiert).toEqual([]);
  });

  it("wiederholt eine Kollision auch gegen einen inaktiven Token", async () => {
    tokenDirekt({
      id: "belegt",
      code: "111-111",
      aktiv: false,
    });
    ziffernGenerator
      .mockReturnValueOnce("111111")
      .mockReturnValueOnce("222222");

    const ergebnis = await createToken({ label: "Neu" }, t.db);

    expect(wertVon<{ code: string }>(ergebnis).code).toBe("222-222");
    expect(ziffernGenerator).toHaveBeenCalledTimes(2);
    expect(tokenZeilen().map((zeile) => zeile.code).sort())
      .toEqual(["111-111", "222-222"]);
    expect(revalidiert).toEqual([LISTENPFAD]);
  });

  it("bricht nach genau zwanzig belegten Ziehungen mit festem Fehler ab", async () => {
    tokenDirekt({
      id: "belegt",
      code: "111-111",
      aktiv: false,
    });
    ziffernGenerator.mockReturnValue("111111");

    const ergebnis = await createToken({ label: "Ohne freien Code" }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Es konnte kein freier Code erzeugt werden — bitte erneut versuchen.",
    });
    expect(ziffernGenerator).toHaveBeenCalledTimes(20);
    expect(tokenZeilen()).toHaveLength(1);
    expect(revalidiert).toEqual([]);
  });

  it("gibt bei einem Insertfehler nur einen festen deutschen Fehler zurueck", async () => {
    ziffernGenerator.mockReturnValueOnce("333333");
    t.sqlite.exec(`
      CREATE TRIGGER tokens_insert_defekt
      BEFORE INSERT ON tokens
      BEGIN
        SELECT RAISE(ABORT, 'TOKEN_SQL_GEHEIMNIS');
      END;
    `);

    const ergebnis = await createToken({ label: "Fehler" }, t.db);

    expect(ergebnis).toEqual({
      ok: false,
      fehler: "Zugangs-Code konnte nicht angelegt werden.",
    });
    expect(fehlerVon(ergebnis).fehler).not.toContain("TOKEN_SQL_GEHEIMNIS");
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
      aktiv: false,
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
      },
    ]);
    expect(revalidiert).toEqual([]);
  });
});

/**
 * §8.3 — DER TOKEN-VERTRAG, 1:1-Pflicht (T160).
 *
 * Die drei Zahlen selbst stehen in `_lib/tokenForm.ts` und werden dort geprueft
 * (A1: eine `"use server"`-Datei exportiert ausschliesslich Actions). Hier steht
 * die andere Haelfte: dass DIESE Datei sie auch BENUTZT statt sie ein zweites
 * Mal abzuschreiben. Ein Test gegen ein Literal im Funktionsrumpf koennte nur
 * pruefen, dass das Literal dasteht — nicht, dass es wirkt.
 */
describe("Token-Codeform (§8.3)", () => {
  it("konfiguriert den Generator aus den Konstanten, nicht aus Literalen", () => {
    const quelle = readFileSync(QUELLE, "utf8");

    expect(quelle).toContain('from "../_lib/tokenForm"');
    expect(quelle).toMatch(/customAlphabet\(\s*TOKEN_ALPHABET\s*,\s*TOKEN_ZIFFERN\s*\)/);
    expect(quelle, "das Alphabet steht nur noch in _lib/tokenForm.ts")
      .not.toMatch(/customAlphabet\(\s*["']/);
    // Der Laufzeitwert kommt beim selben Aufruf an — siehe
    // „konfiguriert den internen Generator fuer sechs Dezimalziffern" oben.
    expect(generatorKonfiguration).toContainEqual({
      alphabet: TOKEN_ALPHABET,
      laenge: TOKEN_ZIFFERN,
    });
  });

  it("zieht hoechstens TOKEN_ZIEHUNGEN mal", async () => {
    tokenDirekt({ id: "belegt", code: "111-111" });
    ziffernGenerator.mockReturnValue("111111");

    expect((await createToken({ label: "Ohne freien Code" }, t.db)).ok).toBe(false);
    expect(ziffernGenerator).toHaveBeenCalledTimes(TOKEN_ZIEHUNGEN);
    expect(readFileSync(QUELLE, "utf8"))
      .toMatch(/versuch\s*<\s*TOKEN_ZIEHUNGEN/);
  });

  /**
   * DER BINDESTRICH IST TEIL DES GESPEICHERTEN WERTES (Spalte `tokens.code`,
   * UNIQUE). Er steht zwischen Position 3 und 4. Die Normalisierung der EINGABE
   * (`_lib/code.ts`, Teil 2) bringt `123456` auf diese Form — sie kann damit nur
   * Treffer HINZUFUEGEN, nie einen bestehenden verlieren (8-E).
   */
  it("speichert den Code in der Form NNN-NNN", async () => {
    const { code } = wertVon<{ id: string; code: string }>(
      await createToken({ label: "RTW 1" }, t.db),
    );

    expect(code).toMatch(/^\d{3}-\d{3}$/);
    expect(
      t.db.select().from(tokens).where(eq(tokens.code, code)).get(),
      "der Bindestrich muss in der Spalte stehen",
    ).toBeDefined();
  });

  /**
   * ES GIBT KEINEN ABLAUF — kein `expiresAt`, kein `validUntil`
   * (`_db/schema.ts:376-410`). Widerruf laeuft ausschliesslich ueber `aktiv`.
   * Mehrfachgebrauch ist ausdruecklich beabsichtigt: die Codes sind physisch
   * laminiert.
   */
  it("legt kein Ablaufdatum an", async () => {
    const { id } = wertVon<{ id: string; code: string }>(
      await createToken({ label: "RTW 1" }, t.db),
    );
    const zeile = t.db.select().from(tokens).where(eq(tokens.id, id)).get()!;

    expect(Object.keys(zeile)).not.toContain("expiresAt");
    expect(Object.keys(zeile)).not.toContain("validUntil");
    expect(zeile.lastUsedAt).toBeNull();
  });

  /**
   * ENTSCHEIDUNG 8-F: Die Kollisionspruefung laeuft gegen ALLE vorhandenen
   * Zeilen — nicht nur gegen die aktiven. Ein gesperrter Code bleibt belegt.
   *
   * 999.999 von 1.000.000 Codes zu belegen waere unpraktikabel; stattdessen
   * wird die Aussage direkt geprueft: der gesperrte Code steht in der Tabelle,
   * und die Abfrage im Generator fragt die Tabelle OHNE aktiv-Bedingung.
   * `erzeugeFreienCode` selbst bleibt dabei unveraendert — der Namensraum wird
   * nicht hier dichtgemacht, sondern in `_actions/loeschen.ts`, indem die Zeile
   * nicht mehr verschwinden kann.
   */
  it("vergibt einen gesperrten Code nicht neu", async () => {
    const { id, code } = wertVon<{ id: string; code: string }>(
      await createToken({ label: "wird gesperrt" }, t.db),
    );
    expect(await setTokenAktiv({ id, aktiv: false }, t.db)).toEqual({ ok: true });
    expect(t.db.select().from(tokens).where(eq(tokens.code, code)).get()?.aktiv)
      .toBe(false);

    const block = /function erzeugeFreienCode[\s\S]*?\n}/
      .exec(readFileSync(QUELLE, "utf8"))![0];
    expect(block).toContain("tokens.code");
    expect(block, "Kollisionspruefung darf nicht auf aktiv filtern")
      .not.toContain("tokens.aktiv");
  });
});

describe("tokenZiele", () => {
  it("liefert nur aktive Fahrzeuge und Artikel, mit Suchfeldern und Namenssortierung", () => {
    fahrzeugAnlegen({
      id: "fz-zulu",
      name: "Zulu",
      kennung: "UE-RK 2",
    });
    fahrzeugAnlegen({
      id: "fz-alpha",
      name: "Alpha",
      kennung: "UE-RK 1",
    });
    fahrzeugAnlegen({
      id: "fz-inaktiv",
      name: "Alt",
      aktiv: false,
    });
    artikelAnlegen({ id: "art-zulu", name: "Zubehör", fach: "Z9" });
    artikelAnlegen({ id: "art-alpha", name: "Absaugkatheter", fach: "A1" });
    artikelAnlegen({
      id: "art-inaktiv",
      name: "Altbestand",
      fach: "X1",
      aktiv: false,
    });

    expect(tokenZiele(t.db)).toEqual({
      fahrzeuge: [
        { id: "fz-alpha", name: "Alpha", kennung: "UE-RK 1" },
        { id: "fz-zulu", name: "Zulu", kennung: "UE-RK 2" },
      ],
      artikel: [
        { id: "art-alpha", name: "Absaugkatheter", fach: "A1" },
        { id: "art-zulu", name: "Zubehör", fach: "Z9" },
      ],
    });
    expect(revalidiert).toEqual([]);
  });
});
