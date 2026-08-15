import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";

/*
 * DIE REACHABILITY-GEGENPROBE (Brief: „ein Test dafuer ist die eigentliche Zusage dieser
 * Aufgabe"). EINE KONSISTENZPRUEFUNG ALLEIN GEGEN DIE IMPORTIERTEN PRAEDIKATE WAERE KEIN
 * AUSREICHENDER TEST: `darfVerteilen` und `darfPersonenVerwalten` sind fuer die Rolle
 * `koordination` HEUTE EXTENSIONAL IDENTISCH (`_lib/zugang.ts`) — ein vertauschter Aufruf in
 * `nav.ts` (z. B. "verteilen" gated ueber `darfPersonenVerwalten") bliebe bei einem reinen
 * Praedikat-Vergleich unbemerkt. Dieser Test ruft deshalb die ECHTEN Seiten-Default-Exporte
 * (Vorbild `verteilen/page.test.tsx`s Rollen-Gate-Block) und prueft: JEDER Eintrag, den
 * `aufgabenNav` fuer eine Rolle erzeugt, fuehrt tatsaechlich zu einer Antwort, keinem `notFound()`.
 *
 * DIESELBEN DREI MOCKS WIE IN JEDEM `page.test.tsx` DES MODULS: `@/core/auth`/`next/navigation`
 * mit einer resolved-Pfad-Identitaet, die auch die importierten Seiten treffen (`../_db/client`
 * liegt fuer `_lib/nav.test.ts` UND fuer z. B. `verteilen/page.tsx` auf demselben absoluten Pfad
 * `src/app/m/aufgaben/_db/client.ts` — vitest mockt nach AUFGELOESTEM Pfad, nicht nach
 * Spezifizierer-String).
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import { aufgabenNav } from "./nav";
import AufgabenPage from "../page";
import NeuPage from "../neu/page";
import VerteilenPage from "../verteilen/page";
import FreigabenPage from "../freigaben/page";
import RoutinenPage from "../routinen/page";
import PersonenPage from "../personen/page";
import ArchivPage from "../archiv/page";

const HEUTE = "2026-08-13";

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
 * DER ECHTE DEFAULT-EXPORT JE NAV-ZIEL — GESCHLUESSELT NACH `href`, NICHT NACH `key` (Fix-Runde 1,
 * Important 1). Ein Schluesseln nach `key` faengt ein vertauschtes PRAEDIKAT (die Gegenprobe unten
 * belegt das), aber KEIN vertauschtes ZIEL: mit `{ key: "verteilen", href: "/personen" }" haette die
 * Schleife ueber den `key` weiterhin `VerteilenPage` gewaehlt, waere gruen geblieben, und eine
 * `auftrag`-Person, die auf „Verteilen" klickt, waere auf `/personen` in Wahrheit auf 404 gelaufen.
 * Ueber `href` gefunden, fuehrt der Eintrag ueber sein eigenes ZIEL zur Route — genau die Achse, die
 * Spec §7 „strukturell ausgeschlossen" nennt.
 */
const ROUTEN: Record<string, () => Promise<unknown>> = {
  "/": () => AufgabenPage({ searchParams: Promise.resolve({}) }),
  "/neu": () => NeuPage(),
  "/verteilen": () => VerteilenPage(),
  "/freigaben": () => FreigabenPage(),
  "/routinen": () => RoutinenPage({ searchParams: Promise.resolve({}) }),
  "/personen": () => PersonenPage({ searchParams: Promise.resolve({}) }),
  "/archiv": () => ArchivPage({ searchParams: Promise.resolve({}) }),
};

describe("aufgabenNav — Grundgeruest", () => {
  it("traegt genau EINEN Wurzeleintrag mit href '/'", () => {
    const rike = legePerson("dev:rike@test", "koordination");
    expect(aufgabenNav(rike, HEUTE).filter((e) => e.href === "/")).toHaveLength(1);
  });

  it("hat eindeutige Schluessel und eindeutige Ziele", () => {
    const rike = legePerson("dev:rike@test", "koordination");
    const nav = aufgabenNav(rike, HEUTE);
    expect(new Set(nav.map((e) => e.key)).size).toBe(nav.length);
    expect(new Set(nav.map((e) => e.href)).size).toBe(nav.length);
  });

  it("traegt ausschliesslich die AEUSZERE Pfadform, nie /m/aufgaben/...", () => {
    const rike = legePerson("dev:rike@test", "koordination");
    for (const e of aufgabenNav(rike, HEUTE)) {
      expect(e.href, e.key).not.toMatch(/^\/m\/aufgaben/);
    }
  });
});

describe("aufgabenNav — genau die erwartete Eintragsmenge je Rolle (echte, unterschiedliche Mengen)", () => {
  it("koordination: start, neu, verteilen, freigaben, personen, archiv — NICHT routinen", () => {
    const rike = legePerson("dev:rike@test", "koordination");
    expect(aufgabenNav(rike, HEUTE).map((e) => e.key)).toEqual([
      "start",
      "neu",
      "verteilen",
      "freigaben",
      "personen",
      "archiv",
    ]);
  });

  it("auftrag: start, neu, freigaben, archiv — NICHT verteilen, routinen, personen", () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    expect(aufgabenNav(malte, HEUTE).map((e) => e.key)).toEqual(["start", "neu", "freigaben", "archiv"]);
  });

  it("bufdi: start, neu, routinen, archiv — NICHT verteilen, freigaben, personen", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aufgabenNav(alina, HEUTE).map((e) => e.key)).toEqual(["start", "neu", "routinen", "archiv"]);
  });

  it("eine ausgeschiedene koordination verliert jeden rollengebundenen Eintrag, behaelt start/neu/archiv", () => {
    const exRike = legePerson("dev:ex-rike@test", "koordination", { aktivBis: "2020-01-01" });
    expect(aufgabenNav(exRike, HEUTE).map((e) => e.key)).toEqual(["start", "neu", "archiv"]);
  });
});

describe("aktiverEintrag gegen aufgabenNav — die Wurzel gewinnt nicht gegen eine laengere Uebereinstimmung", () => {
  it("/archiv markiert 'archiv', nicht 'start'", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aktiverEintrag("/archiv", aufgabenNav(alina, HEUTE))?.schluessel).toBe("archiv");
  });

  it("/routinen markiert 'routinen'", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aktiverEintrag("/routinen", aufgabenNav(alina, HEUTE))?.schluessel).toBe("routinen");
  });

  it("/ markiert 'start', genau auf der Wurzel", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aktiverEintrag("/", aufgabenNav(alina, HEUTE))).toEqual({ schluessel: "start", genau: true });
  });
});

describe("DIE KERNZUSAGE: jeder Navigationseintrag ist fuer die jeweilige Rolle tatsaechlich erreichbar", () => {
  const ROLLEN: { bezeichnung: string; rolle: Rolle; sub: string; extra?: Partial<PersonRow> }[] = [
    { bezeichnung: "koordination", rolle: "koordination", sub: "dev:rike@test" },
    { bezeichnung: "auftrag", rolle: "auftrag", sub: "dev:malte@test" },
    { bezeichnung: "bufdi", rolle: "bufdi", sub: "dev:alina@test" },
    // MINOR 8 (Fix-Runde 1): die Reachability-SCHLEIFE deckte bislang nur aktive Personen ab — die
    // ausgeschiedene Koordination stand nur im Schluesselmengen-Test oben, nicht hier. `neu`/`start`/
    // `archiv` tragen bewusst kein `istAktiv`-Gate (Spec §8), eine ausgeschiedene Person erreicht sie
    // also weiterhin; diese Zeile bindet das als echten Abruf, nicht nur als Behauptung.
    {
      bezeichnung: "ausgeschiedene koordination",
      rolle: "koordination",
      sub: "dev:ex-rike-reach@test",
      extra: { aktivBis: "2020-01-01" },
    },
  ];

  for (const { bezeichnung, rolle, sub, extra } of ROLLEN) {
    it(`${bezeichnung}: jeder eigene Navigationseintrag antwortet — kein notFound()`, async () => {
      const person = legePerson(sub, rolle, extra);
      sitzung = { user: { id: sub } };
      const nav = aufgabenNav(person, HEUTE);
      expect(nav.length).toBeGreaterThan(0);
      for (const eintrag of nav) {
        const route = ROUTEN[eintrag.href];
        if (!route) throw new Error(`Keine Test-Route fuer nav-Ziel "${eintrag.href}" hinterlegt.`);
        await expect(
          route(),
          `Eintrag "${eintrag.key}" (${eintrag.href}) fuer Rolle "${bezeichnung}"`,
        ).resolves.toBeTruthy();
      }
    });
  }

  /**
   * DIE GEGENPROBE, DIE DEN TEST ERST SCHARF MACHT: wuerde `aufgabenNav` fuer eine `bufdi`-Person
   * FAELSCHLICH "verteilen"/"freigaben"/"personen" ergaenzen (z. B. durch einen vertauschten
   * Praedikat-Aufruf, der heute zufaellig denselben Wert liefert wie das richtige Praedikat), wuerde
   * die Schleife oben ROT — die drei Routen lehnen eine BuFDi tatsaechlich ab. Dieser Test haelt
   * NUR fest, dass diese Ablehnung wirklich existiert (sonst waere die obige Schleife bedeutungslos:
   * sie koennte auch dann gruen bleiben, wenn KEINE Route je 404 werfen wuerde).
   */
  it("die drei rollengebundenen Routen lehnen eine BuFDi tatsaechlich mit notFound() ab", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await expect(VerteilenPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("/routinen lehnt koordination und auftrag tatsaechlich mit notFound() ab", async () => {
    const rike = legePerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");

    const t2 = migrierteTestDb();
    mockDb = t2;
    const malte = t2.db
      .insert(personen)
      .values({ sub: "dev:malte@test", name: "Malte", initialen: "MA", rolle: "auftrag", aktivVon: "2026-01-01" })
      .returning()
      .get();
    sitzung = { user: { id: malte.sub } };
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    t2.schliessen();
  });
});
