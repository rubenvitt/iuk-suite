import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import {
  HANDLAGER_ID, PSEUDO_VERFALL, istOhneVerfall,
  CHARGE_KORREKTUR, CHARGE_INVENTUR, CHARGE_OHNE_VERFALL,
  ZUSTAENDE, ZUSTAND_DEFEKT,
  MONAT_REGEX, TAG_REGEX, istEchterKalendertag,
  BUCHUNGSTYPEN, QUELLE_TYPEN, LAGERORT_TYPEN, GERAETE_TYPEN, TOKEN_ZIEL_TYPEN,
} from "./konstanten";
import { buchungen, checks, lagerorte, geraete, tokens } from "../_db/schema";

describe("feste Werte, die auf Papier bzw. in Produktionsdaten stehen", () => {
  it("HANDLAGER_ID ist woertlich 'handlager'", () => {
    // 75 Fundstellen im Alt-Repo. Mit foreign_keys = ON ist eine andere ID kein
    // Schoenheitsfehler, sondern ein FK-Fehler bei der ersten Entnahme.
    expect(HANDLAGER_ID).toBe("handlager");
  });

  it("PSEUDO_VERFALL ist '2099-12' und wird als 'kein Verfall' erkannt", () => {
    expect(PSEUDO_VERFALL).toBe("2099-12");
    expect(istOhneVerfall("2099-12")).toBe(true);
    expect(istOhneVerfall("2026-08")).toBe(false);
  });

  it("die drei Chargennummern-Literale stehen in den Produktionsdaten", () => {
    expect([CHARGE_KORREKTUR, CHARGE_INVENTUR, CHARGE_OHNE_VERFALL])
      .toEqual(["Korrektur", "Inventur", "ohne Verfall"]);
  });

  it("ZUSTAENDE traegt die drei Literale in der Reihenfolge des Bestands", () => {
    // Historische ergebnis-JSONs tragen sie bereits; "Defekt" ist der Vertrag
    // der serverseitigen Auswertung an drei Stellen.
    expect(ZUSTAENDE).toEqual(["In Ordnung", "Gebrauchsspuren", "Defekt"]);
    expect(ZUSTAND_DEFEKT).toBe("Defekt");
  });
});

describe("MONAT_REGEX — der EINZIGE Monatsvalidator des Moduls", () => {
  it("nimmt gueltige Monate an", () => {
    for (const gut of ["2026-01", "2026-08", "2026-12", "2099-12"]) {
      expect(MONAT_REGEX.test(gut)).toBe(true);
    }
  });

  it("weist genau die Werte ab, die der laxe Ausdruck durchliess", () => {
    // "2026-00" landete ueber new Date(2026, 0, 0, …) auf dem 31.12.2025,
    // "2026-13" auf dem 31.01.2027 (Analyse, §4.6).
    for (const schlecht of ["2026-00", "2026-13", "2026-8", "26-08", "2026-08-01", ""]) {
      expect(MONAT_REGEX.test(schlecht)).toBe(false);
    }
  });
});

describe("Tagesfelder — Form UND echter Kalendertag", () => {
  it("TAG_REGEX prueft die Form", () => {
    expect(TAG_REGEX.test("2026-02-31")).toBe(true);   // Form ok
    expect(TAG_REGEX.test("2026-2-3")).toBe(false);
  });

  it("istEchterKalendertag faengt ueberrollende Tage", () => {
    expect(istEchterKalendertag("2026-08-03")).toBe(true);
    expect(istEchterKalendertag("2026-02-31")).toBe(false);
    expect(istEchterKalendertag("2024-02-29")).toBe(true);   // Schaltjahr
    expect(istEchterKalendertag("2026-02-29")).toBe(false);
    expect(istEchterKalendertag("2026-13-01")).toBe(false);
  });
});

describe("Enum-Listen", () => {
  it("BUCHUNGSTYPEN traegt 'umlagerung' — der Typ fehlt im Implementierungsplan", () => {
    // Beide Legs einer Verschiebung tragen ihn, damit Bestellvorschlag und
    // Reporting eine interne Verschiebung nicht als Wareneingang oder Verbrauch
    // missdeuten (1:1-Pflicht 15).
    expect(BUCHUNGSTYPEN).toEqual(["zugang", "entnahme", "korrektur", "umlagerung"]);
  });

  it("die uebrigen vier Listen", () => {
    expect([...QUELLE_TYPEN].sort()).toEqual(["oidc", "system", "token"]);
    expect([...LAGERORT_TYPEN].sort()).toEqual(["fahrzeug", "lager"]);
    expect([...GERAETE_TYPEN].sort()).toEqual(["medizin", "objekt"]);
    expect([...TOKEN_ZIEL_TYPEN].sort()).toEqual(["artikel", "fahrzeug"]);
  });
});

describe("_lib und _db tragen weder 'use client' noch einen Icon-Import", () => {
  const wurzel = "src/app/m/lagerbuch";

  function dateien(ordner: string): string[] {
    const p = join(wurzel, ordner);
    if (!existsSync(p)) return [];
    return readdirSync(p, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => join(p, f));
  }

  it.each(["_lib", "_db"])("%s ist frei von 'use client'", (ordner) => {
    // Falle 6: eine Server Component bekaeme eine Client-Referenz statt des Wertes,
    // HTTP 500 fuer die ganze Seite. TypeScript ist zufrieden, `build` findet nichts,
    // und Vitest kann es strukturell nicht sehen — dort ist "use client" ein
    // wirkungsloser String. Deshalb dieser Scan.
    const treffer = dateien(ordner).filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });

  it.each(["_lib", "_db"])("%s importiert kein Icon", (ordner) => {
    // Falle 7: der nackte Spezifizierer loest auf CJS auf, das createContext auf
    // Modulebene ruft — der Fehler entsteht BEIM IMPORT und reisst jede Datei mit,
    // die die Konstanten liest.
    const treffer = dateien(ordner).filter((f) =>
      /from\s+["'](@ant-design\/icons|lucide-react)/.test(readFileSync(f, "utf8")));
    expect(treffer).toEqual([]);
  });
});

/**
 * §4.15 fuehrt die Enum-Listen bewusst an ZWEI Orten: Drizzle-Enum in _db/schema.ts
 * (1:1-Port des Bestands) und Zod-Liste hier (Eingangsvalidator). Dieser Block haelt
 * sie zusammen. Die REIHENFOLGE darf abweichen — SQLite-`text({enum})` erzeugt keinen
 * CHECK, sie ist im erzeugten SQL unsichtbar (nachpruefbar an
 * lagerbuch/drizzle/0000_brief_zodiak.sql:20, wo buchungen.quelle_typ MIT Enum als
 * nacktes `text NOT NULL` steht).
 */
const enumWerte = (spalte: unknown): string[] =>
  [...((spalte as { enumValues?: string[] }).enumValues ?? [])].sort();

describe("Enum-Listen: Zod-Seite und Drizzle-Seite sind mengengleich", () => {
  it("BUCHUNGSTYPEN", () => {
    expect(enumWerte(getTableColumns(buchungen).typ)).toEqual([...BUCHUNGSTYPEN].sort());
  });
  it("QUELLE_TYPEN — buchungen und checks (checks ist die Abweichung S1)", () => {
    expect(enumWerte(getTableColumns(buchungen).quelleTyp)).toEqual([...QUELLE_TYPEN].sort());
    expect(enumWerte(getTableColumns(checks).quelleTyp)).toEqual([...QUELLE_TYPEN].sort());
  });
  it("LAGERORT_TYPEN", () => {
    expect(enumWerte(getTableColumns(lagerorte).typ)).toEqual([...LAGERORT_TYPEN].sort());
  });
  it("GERAETE_TYPEN", () => {
    expect(enumWerte(getTableColumns(geraete).typ)).toEqual([...GERAETE_TYPEN].sort());
  });
  it("TOKEN_ZIEL_TYPEN", () => {
    expect(enumWerte(getTableColumns(tokens).zielTyp)).toEqual([...TOKEN_ZIEL_TYPEN].sort());
  });
});
