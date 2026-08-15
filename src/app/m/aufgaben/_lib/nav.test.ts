import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";
import type { Akteur } from "./zugang";

/*
 * DIE REACHABILITY-GEGENPROBE (Brief: „ein Test dafuer ist die eigentliche Zusage dieser
 * Aufgabe"). EINE KONSISTENZPRUEFUNG ALLEIN GEGEN DIE IMPORTIERTEN PRAEDIKATE WAERE KEIN
 * AUSREICHENDER TEST: `darfVerteilen` und `darfPersonenVerwalten` sind fuer eine koordinierende
 * Person HEUTE EXTENSIONAL IDENTISCH (`_lib/zugang.ts`) — ein vertauschter Aufruf in
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
 * DIE FIXTUR-ZEILE ALS `Akteur`. `istKoordination` STEHT AUSDRUECKLICH AM AUFRUF, NICHT ABGELEITET
 * AUS DER ZEILE (Quellenwechsel 2026-08-15): die Koordination kommt aus der Auth-Gruppe und liegt
 * damit auf einer ANDEREN Achse als `rolle`. Wichtig fuer GENAU DIESE Datei: `akteur(...)` und
 * `anmelden(...)` muessen DASSELBE sagen — die Reachability-Gegenprobe unten vergleicht die
 * Navigation (aus dem `Akteur`) mit dem echten Seitenabruf (aus der Sitzung), und eine Fixtur, die
 * nur eine der beiden Haelften koordinieren laesst, pruefte zwei verschiedene Personen.
 */
function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
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

/**
 * ANMELDEN — DIE SITZUNG STELLT DIE KOORDINATIONSGRUPPE, SEIT DIE ZEILE SIE NICHT MEHR TRAEGT
 * (Quellenwechsel 2026-08-15): `istKoordination` kommt aus `canAdminModule("aufgaben")`
 * (`_lib/zugang.ts`s `akteurFuer`), nicht mehr aus `personen.rolle`. Damit jede bestehende Zusage
 * dieser Datei DIESELBE bleibt, bekommt eine koordinierende Person hier genau die Gruppe, die ihre
 * Rolle bisher bedeutet hat — die FIXTUR wandert mit der Quelle, die ERWARTUNG bleibt stehen.
 *
 * SEIT `ROLLEN = ["auftrag", "bufdi"]` MUSS DER AUFRUFER ES SAGEN: aus der Zeile ist es nicht mehr
 * ableitbar. `iuk-aufgaben-koordination` ist der Registry-Vorgabewert (`core/registry.ts`);
 * `SUITE_ADMIN_GROUP_AUFGABEN` ist in der Testumgebung nicht gesetzt.
 */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = {
    user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
  };
}

describe("aufgabenNav — Grundgeruest", () => {
  it("traegt genau EINEN Wurzeleintrag mit href '/'", () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    expect(aufgabenNav(akteur(rike, true), HEUTE).filter((e) => e.href === "/")).toHaveLength(1);
  });

  it("hat eindeutige Schluessel und eindeutige Ziele", () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    const nav = aufgabenNav(akteur(rike, true), HEUTE);
    expect(new Set(nav.map((e) => e.key)).size).toBe(nav.length);
    expect(new Set(nav.map((e) => e.href)).size).toBe(nav.length);
  });

  it("traegt ausschliesslich die AEUSZERE Pfadform, nie /m/aufgaben/...", () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    for (const e of aufgabenNav(akteur(rike, true), HEUTE)) {
      expect(e.href, e.key).not.toMatch(/^\/m\/aufgaben/);
    }
  });
});

describe("aufgabenNav — genau die erwartete Eintragsmenge je Rolle (echte, unterschiedliche Mengen)", () => {
  it("koordination: start, neu, verteilen, freigaben, personen, archiv — NICHT routinen", () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    expect(aufgabenNav(akteur(rike, true), HEUTE).map((e) => e.key)).toEqual([
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
    expect(aufgabenNav(akteur(malte), HEUTE).map((e) => e.key)).toEqual(["start", "neu", "freigaben", "archiv"]);
  });

  it("bufdi: start, neu, routinen, archiv — NICHT verteilen, freigaben, personen", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aufgabenNav(akteur(alina), HEUTE).map((e) => e.key)).toEqual(["start", "neu", "routinen", "archiv"]);
  });

  /*
   * VERHALTENSAENDERUNG VOM 2026-08-15 (Entwurf §5) — DIESE ZEILE ERWARTETE FRUEHER `["start",
   * "neu", "archiv"]`: `istAktiv` misst die Koordination nicht mehr, ihre Rolle kommt aus der
   * Pocket-ID-Gruppe. Die Navigation behaelt damit genau die Eintraege, die die Routen ihr auch
   * tatsaechlich oeffnen — und das ist die eigentliche Zusage dieser Datei: Oberflaeche und Riegel
   * duerfen nicht auseinanderlaufen. Der Reachability-Lauf unten faehrt dieselbe Person durch die
   * ECHTEN Seiten und wuerde rot, ginge das hier auseinander.
   */
  it("eine ausgeschiedene koordination behaelt ihre Eintraege — die Gruppe traegt die Rolle, nicht aktivBis", () => {
    const exRike = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2020-01-01" });
    expect(aufgabenNav(akteur(exRike, true), HEUTE).map((e) => e.key)).toEqual([
      "start",
      "neu",
      "verteilen",
      "freigaben",
      "personen",
      "archiv",
    ]);
  });

  it("ein ausgeschiedener auftrag OHNE Gruppe verliert dagegen jeden rollengebundenen Eintrag", () => {
    const exMalte = legePerson("dev:ex-malte@test", "auftrag", { aktivBis: "2020-01-01" });
    expect(aufgabenNav(akteur(exMalte), HEUTE).map((e) => e.key)).toEqual(["start", "neu", "archiv"]);
  });
});

describe("aktiverEintrag gegen aufgabenNav — die Wurzel gewinnt nicht gegen eine laengere Uebereinstimmung", () => {
  it("/archiv markiert 'archiv', nicht 'start'", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aktiverEintrag("/archiv", aufgabenNav(akteur(alina), HEUTE))?.schluessel).toBe("archiv");
  });

  it("/routinen markiert 'routinen'", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aktiverEintrag("/routinen", aufgabenNav(akteur(alina), HEUTE))?.schluessel).toBe("routinen");
  });

  it("/ markiert 'start', genau auf der Wurzel", () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    expect(aktiverEintrag("/", aufgabenNav(akteur(alina), HEUTE))).toEqual({ schluessel: "start", genau: true });
  });
});

describe("DIE KERNZUSAGE: jeder Navigationseintrag ist fuer die jeweilige Rolle tatsaechlich erreichbar", () => {
  /*
   * DIE PERSONEN DES BETRIEBS, NICHT DIE WERTE EINER SPALTE (Quellenwechsel 2026-08-15): seit
   * `rolle` und `istKoordination` unabhaengige Achsen sind, beschreibt jede Zeile eine
   * KOMBINATION. Neu hinzugekommen ist „bufdi MIT Koordinationsgruppe" — vorher nicht
   * darstellbar, ab jetzt ein Fall, den der Betrieb erzeugen kann (jemand steht in der
   * Koordinationsgruppe UND hat eine BuFDi-Zeile), und der die einzige Person ist, die
   * `/routinen` UND `/verteilen` zugleich erreicht.
   */
  const PERSONEN: {
    bezeichnung: string;
    rolle: Rolle;
    koordiniert: boolean;
    sub: string;
    extra?: Partial<PersonRow>;
  }[] = [
    { bezeichnung: "koordination", rolle: "auftrag", koordiniert: true, sub: "dev:rike@test" },
    { bezeichnung: "auftrag", rolle: "auftrag", koordiniert: false, sub: "dev:malte@test" },
    { bezeichnung: "bufdi", rolle: "bufdi", koordiniert: false, sub: "dev:alina@test" },
    {
      bezeichnung: "bufdi MIT Koordinationsgruppe",
      rolle: "bufdi",
      koordiniert: true,
      sub: "dev:alina-koord@test",
    },
    // MINOR 8 (Fix-Runde 1): die Reachability-SCHLEIFE deckte bislang nur aktive Personen ab — die
    // ausgeschiedene Koordination stand nur im Schluesselmengen-Test oben, nicht hier. `neu`/`start`/
    // `archiv` tragen bewusst kein `istAktiv`-Gate (Spec §8), eine ausgeschiedene Person erreicht sie
    // also weiterhin; diese Zeile bindet das als echten Abruf, nicht nur als Behauptung.
    {
      bezeichnung: "ausgeschiedene koordination",
      rolle: "auftrag",
      koordiniert: true,
      sub: "dev:ex-rike-reach@test",
      extra: { aktivBis: "2020-01-01" },
    },
  ];

  for (const { bezeichnung, rolle, koordiniert, sub, extra } of PERSONEN) {
    it(`${bezeichnung}: jeder eigene Navigationseintrag antwortet — kein notFound()`, async () => {
      const person = legePerson(sub, rolle, extra);
      anmelden(person, koordiniert);
      const nav = aufgabenNav(akteur(person, koordiniert), HEUTE);
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
    anmelden(alina);
    await expect(VerteilenPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(FreigabenPage()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("/routinen lehnt die Koordination und auftrag tatsaechlich mit notFound() ab", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    anmelden(rike, true);
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");

    const t2 = migrierteTestDb();
    mockDb = t2;
    const malte = t2.db
      .insert(personen)
      .values({ sub: "dev:malte@test", name: "Malte", initialen: "MA", rolle: "auftrag", aktivVon: "2026-01-01" })
      .returning()
      .get();
    anmelden(malte);
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    t2.schliessen();
  });
});
