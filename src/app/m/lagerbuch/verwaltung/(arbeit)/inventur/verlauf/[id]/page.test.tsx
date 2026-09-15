import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: () => { throw new Error("REDIRECT"); },
}));

import { artikel, chargen, inventuren, inventurPositionen } from "../../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../../_db/testdb";
import { SeitenKopf } from "../../../../../_ui/SeitenKopf";
import { LaufTabelle } from "./LaufTabelle";
import InventurLaufSeite, { dynamic, laufDetailInhalt } from "./page";

/** Muster „Inventurseite als RSC" (`inventur/InventurForm.test.tsx`). */
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  return [
    ...(wert.type === typ ? [wert] : []),
    ...Object.values(wert.props as Record<string, ReactNode>)
      .flatMap((prop) => elementeVomTyp(prop, typ)),
  ];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (
    typeof wert !== "object"
    || wert instanceof Date
    || isValidElement(wert)
    || Object.getPrototypeOf(wert) !== Object.prototype
  ) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

const QUELLE = readFileSync("src/app/m/lagerbuch/verwaltung/(arbeit)/inventur/verlauf/[id]/page.tsx", "utf8");
const ANGELEGT = new Date("2026-07-01T00:00:00Z");

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-inventur-lauf-seite-");
  t.db.insert(artikel).values([
    { id: "a-mull", name: "Mullbinde", einheit: "Stk", fach: "A1", mindestbestand: 0, aktiv: true, createdAt: ANGELEGT },
    { id: "a-pfl", name: "Pflaster", einheit: "Pkg", fach: "B2", mindestbestand: 0, aktiv: true, createdAt: ANGELEGT },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c-spaet", artikelId: "a-mull", chargenNr: "Inventur", verfall: "2033-02", createdAt: ANGELEGT },
    { id: "c-frueh", artikelId: "a-mull", chargenNr: "L1", verfall: "2027-01", createdAt: ANGELEGT },
  ]).run();
  t.db.insert(inventuren).values({
    id: "lauf-1", ts: new Date("2026-07-15T10:00:00Z"), quelleTyp: "system", quelleId: "x",
    kommentar: "Monatsinventur", umfang: JSON.stringify({ kategorien: ["Hygiene"], faecher: ["A1"] }),
  }).run();
  t.db.insert(inventurPositionen).values([
    { id: "p-pfl", inventurId: "lauf-1", artikelId: "a-pfl", chargeId: null, erwartet: 2, gezaehlt: 2 },
    { id: "p-spaet", inventurId: "lauf-1", artikelId: "a-mull", chargeId: "c-spaet", erwartet: 0, gezaehlt: 3 },
    { id: "p-frueh", inventurId: "lauf-1", artikelId: "a-mull", chargeId: "c-frueh", erwartet: 5, gezaehlt: 4 },
  ]).run();
});

afterEach(() => t.schliessen());

describe("Inventurlauf-Detail als RSC", () => {
  it("ist eine dynamische App-Router-Seite mit async Params", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(InventurLaufSeite).toBeTypeOf("function");
    expect(QUELLE).toMatch(/params:\s*Promise<\{ id: string \}>/);
  });

  it("reicht gruppierte, primitive Positionszeilen an die Client-Tabelle", () => {
    const inhalt = laufDetailInhalt(t.db, "lauf-1");
    const [tabelle] = elementeVomTyp(inhalt, LaufTabelle);
    expect(tabelle!.props).toEqual({ zeilen: [
      {
        id: "p-frueh", artikelText: "Mullbinde", chargeText: "L1 · 01/27",
        erwartetText: "5 Stk", gezaehltText: "4 Stk", differenz: -1,
      },
      {
        id: "p-spaet", artikelText: "", chargeText: "Inventur · 02/33",
        erwartetText: "0 Stk", gezaehltText: "3 Stk", differenz: 3,
      },
      {
        id: "p-pfl", artikelText: "Pflaster", chargeText: "je Artikel",
        erwartetText: "2 Pkg", gezaehltText: "2 Pkg", differenz: 0,
      },
    ] });
    expect(istRekursivJsonSicher(tabelle!.props)).toBe(true);
  });

  it("zeigt Zeit, Person, Kommentar und Umfang im Kopf mit Rückweg zum Verlauf", () => {
    const [kopf] = elementeVomTyp(laufDetailInhalt(t.db, "lauf-1"), SeitenKopf);
    expect(kopf!.props).toMatchObject({
      titel: "Inventur vom 15.07.2026, 12:00",
      zurueck: { titel: "Verlauf", href: "/verwaltung/inventur/verlauf" },
      beschreibung: "System · Monatsinventur · Umfang: Hygiene, Fach A1",
    });
  });

  it("wirft notFound für eine unbekannte ID", () => {
    expect(() => laufDetailInhalt(t.db, "gibt-es-nicht")).toThrow("NOT_FOUND");
  });

  it("ist eine directive-freie Server Component ohne Icon-Paket und prüft den Admin vor der Datenbank", () => {
    expect(QUELLE).not.toMatch(/["']use client["']/);
    expect(QUELLE).not.toMatch(/@ant-design\/icons/);
    expect(QUELLE).not.toMatch(/from "antd"/);
    const adminIndex = QUELLE.indexOf("await requireLagerbuchAdmin()");
    const dbIndex = QUELLE.indexOf("getDb()");
    expect(adminIndex).toBeGreaterThan(-1);
    expect(dbIndex).toBeGreaterThan(-1);
    expect(adminIndex).toBeLessThan(dbIndex);
  });
});
