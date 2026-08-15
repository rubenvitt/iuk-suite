import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { migrierteTestDb, type TestDb } from "./_db/testdb";
import { personen, type PersonRow, type Rolle } from "./_db/schema";

/*
 * DIESELBEN DREI MOCKS WIE JEDES `page.test.tsx` DES MODULS (Vorbild `verteilen/page.test.tsx`):
 * `@/core/auth` gesteuert ueber `sitzung`, `./_db/client` auf eine echte In-Memory-Testdatenbank,
 * `next/navigation`s `notFound()` erkennbar geworfen (`personFuerSeite` wirft ohne Sitzung —
 * hier nicht gebraucht, aber Teil desselben Vorbilds).
 *
 * `portal/layout.test.tsx`s Kopfkommentar begruendet, warum `@/core/auth` UEBERHAUPT gemockt sein
 * muss: `layout.tsx` fuehrt ueber `Shell` zu `SuiteHeader`, das im `node`-Environment ungemockt an
 * next-auths eigenem `next/server`-Import bricht.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("./_db/client", () => ({ getDb: () => mockDb.db }));

import { isoTag } from "./_lib/datum";
import { aufgabenNav } from "./_lib/nav";
import AufgabenLayout from "./layout";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
  mockDb = t;
  sitzung = null;
});
afterEach(() => t.schliessen());

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

/**
 * DIE VERDRAHTUNG: `aufgabenNav(person, heute)` muss auch tatsaechlich als `nav`-Prop bei
 * `<Shell>` ankommen — Vorbild `portal/layout.test.tsx`. `AufgabenLayout` ist eine Server
 * Component: ihr Rueckgabewert ist ein React-Element, kein DOM; `element.props.nav` zu lesen
 * prueft die Verdrahtung ohne Rendern.
 */
describe("AufgabenLayout — Verdrahtung von nav an <Shell>", () => {
  it("mit personen-Zeile: <Shell> bekommt aufgabenNav(person, heute) als nav-Prop", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };

    const element = (await AufgabenLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ nav?: unknown }>;
    }>;
    const shellElement = element.props.children;

    // `heute` kommt aus `new Date()` — hier nicht gefaelscht, deshalb gegen die REALE Ableitung
    // verglichen (dieselbe Funktion, `aufgabenNav`), nicht gegen einen im Test fest verankerten Tag.
    // `isoTag`, NICHT `toISOString().slice(0, 10)` (Fix-Runde 1, Minor 7): Letzteres ist ein
    // UTC-Tag, `layout.tsx` rechnet aber in Europe/Berlin (`_lib/datum.ts`) — zwischen 00:00 und
    // 02:00 Berliner Zeit waeren das verschiedene Kalendertage, und der Vergleich pruefte dann
    // nicht mehr dasselbe `heute`, das `AufgabenLayout` tatsaechlich verwendet.
    expect(shellElement.props.nav).toEqual(aufgabenNav(rike, isoTag(new Date())));
  });

  it("ohne personen-Zeile (Modulzugang, aber noch nicht eingetragen): <Shell> bekommt ein leeres nav-Prop", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };

    const element = (await AufgabenLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ nav?: unknown }>;
    }>;
    const shellElement = element.props.children;

    expect(shellElement.props.nav).toEqual([]);
  });

  it("die Navigation unterscheidet sich tatsaechlich nach Rolle — koordination bekommt mehr Eintraege als eine BuFDi", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };
    const koordElement = (await AufgabenLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ nav?: { key: string }[] }>;
    }>;
    const koordNav = koordElement.props.children.props.nav ?? [];

    t.schliessen();
    t = migrierteTestDb();
    mockDb = t;
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    const bufdiElement = (await AufgabenLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ nav?: { key: string }[] }>;
    }>;
    const bufdiNav = bufdiElement.props.children.props.nav ?? [];

    expect(koordNav.map((e) => e.key)).toContain("verteilen");
    expect(bufdiNav.map((e) => e.key)).not.toContain("verteilen");
    expect(bufdiNav.map((e) => e.key)).toContain("routinen");
    expect(koordNav.map((e) => e.key)).not.toContain("routinen");
  });
});
