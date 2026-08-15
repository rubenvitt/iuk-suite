import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { migrierteTestDb, type TestDb } from "./_db/testdb";
import { personen, type PersonRow, type Rolle } from "./_db/schema";
import type { Akteur } from "./_lib/zugang";

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

/**
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE (Quellenwechsel 2026-08-15): die Koordination kommt aus der Auth-Gruppe und liegt
 * damit auf einer ANDEREN Achse als `rolle` — `akteur(rike, true)` macht an jeder Fixtur sichtbar,
 * dass diese Zusage die Gruppe voraussetzt, während `akteur(malte)` denselben `auftrag` OHNE Gruppe
 * meint. Eine Ableitung aus der Zeile ginge nicht mehr: `ROLLEN` kennt `koordination` nicht mehr.
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

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
/**
 * ANMELDEN — DIE SITZUNG STELLT DIE KOORDINATIONSGRUPPE, SEIT DIE ZEILE SIE NICHT MEHR TRAEGT
 * (Quellenwechsel 2026-08-15): `istKoordination` kommt aus `canAdminModule("aufgaben")`
 * (`_lib/zugang.ts`s `akteurFuer`), nicht mehr aus `personen.rolle`. Damit jede bestehende Zusage
 * dieser Datei DIESELBE bleibt, wandert die FIXTUR mit der Quelle mit, die ERWARTUNG bleibt stehen
 * — und `koordiniert` steht deshalb AM AUFRUF, genauso wie `istKoordination` bei `akteur` oben:
 * ableiten liesse es sich nicht mehr, `ROLLEN` kennt `koordination` nicht mehr.
 *
 * `iuk-aufgaben-koordination` ist der Registry-Vorgabewert (`core/registry.ts`);
 * `SUITE_ADMIN_GROUP_AUFGABEN` ist in der Testumgebung nicht gesetzt.
 */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = {
    user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
  };
}

describe("AufgabenLayout — Verdrahtung von nav an <Shell>", () => {
  it("mit personen-Zeile: <Shell> bekommt aufgabenNav(person, heute) als nav-Prop", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    anmelden(rike, true);

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
    // `akteur(rike, true)` MUSS ZU `anmelden(rike, true)` PASSEN: die linke Seite loest
    // `istKoordination` ueber den echten Weg auf (Sitzungsgruppen → `canAdminModule`), die rechte
    // baut ihn hier von Hand. Genau diese Gegenueberstellung ist die Zusage der Zeile — faellt eine
    // der beiden Haelften auf `false`, geht der Test rot statt still eine schwaechere Aussage zu
    // treffen.
    expect(shellElement.props.nav).toEqual(aufgabenNav(akteur(rike, true), isoTag(new Date())));
  });

  it("ohne personen-Zeile (Modulzugang, aber noch nicht eingetragen): <Shell> bekommt ein leeres nav-Prop", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };

    const element = (await AufgabenLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ nav?: unknown }>;
    }>;
    const shellElement = element.props.children;

    expect(shellElement.props.nav).toEqual([]);
  });

  /*
   * DER TITEL NENNT SEIT DEM QUELLENWECHSEL (2026-08-15) BEIDE ACHSEN, NICHT NUR DIE ROLLE: Rike
   * traegt hier `auftrag` wie jeder Auftraggeber, und "verteilen" bekommt sie AUSSCHLIESSLICH ueber
   * die Koordinationsgruppe. "routinen" haengt dagegen weiter an der ZEILE (`darfRoutinenVerwalten`
   * fragt `rolle === "bufdi"`) — deshalb faellt es bei Rike weg, obwohl sie koordiniert. Die vier
   * Zusagen unten pruefen damit genau die Kreuzung der beiden Achsen.
   */
  it("die Navigation unterscheidet sich tatsaechlich nach Rolle UND Gruppe — wer koordiniert bekommt „verteilen“, eine BuFDi „routinen“", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    anmelden(rike, true);
    const koordElement = (await AufgabenLayout({ children: null })) as ReactElement<{
      children: ReactElement<{ nav?: { key: string }[] }>;
    }>;
    const koordNav = koordElement.props.children.props.nav ?? [];

    t.schliessen();
    t = migrierteTestDb();
    mockDb = t;
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
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
