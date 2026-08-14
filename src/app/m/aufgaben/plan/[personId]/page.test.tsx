// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { personen, aufgaben, type PersonRow, type Rolle } from "../../_db/schema";

/*
 * MOCKS — dieselbe Form wie `page.test.tsx`: `next/navigation` (notFound + die Router-Hooks von
 * `TagesWaehler`), `@/core/auth`, `../../_db/client`.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
let mockDb: TestDb;
vi.mock("../../_db/client", () => ({ getDb: () => mockDb.db }));

import PlanPage, { planInhalt } from "./page";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
  mockDb = t;
  sitzung = null;
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

const HEUTE = "2026-08-10"; // Montag

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

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

describe("planInhalt — eigener Plan aenderbar, fremder lesend (Spec §7, Kern dieser Route)", () => {
  it("der EIGENE Plan zeigt Aktionen: das Einzuplanen-Formular fuer eine noch nicht eingeplante Aufgabe", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({
      titel: "Frisch verteilt",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });

    await mount(planInhalt(t.db, alina, alina, HEUTE, {}));

    expect(query("h1").textContent).toBe("Mein Zeitplan");
    expect(document.body.textContent).toContain("Einzuplanen");
    expect(document.body.textContent).toContain("Frisch verteilt");
    expect(query("form")).toBeTruthy();
    expect(document.body.textContent).not.toContain("nur Alina kann ihn ändern");
  });

  /*
   * DIE GEGENPROBE, DIE DER BRIEF VERLANGT: wuerde ein Test rot, wenn `darfPlanAendern` in der
   * Anzeige durch "immer wahr" ersetzt wuerde? Dieser Test schon — er verlangt AUSDRUECKLICH KEIN
   * Formular und KEINEN RangKnoepfe-Button fuer eine fremde Person.
   */
  it("ein FREMDER Plan ist lesbar, aber OHNE jede Aktion — kein Formular, kein RangKnopf", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const bendix = legePerson("dev:bendix@test", "bufdi", { name: "Bendix" });
    legeAufgabe({
      titel: "Alinas Aufgabe",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: HEUTE,
    });

    await mount(planInhalt(t.db, bendix, alina, HEUTE, {}));

    expect(query("h1").textContent).toBe("Zeitplan von Alina");
    expect(document.body.textContent).toContain("Alinas Aufgabe"); // lesbar
    expect(document.body.textContent).not.toContain("Einzuplanen"); // kein Abschnitt
    expect(queryAll("form")).toHaveLength(0); // kein EinplanenFormular
    expect(queryAll("button")).toHaveLength(0); // keine RangKnoepfe
    expect(document.body.textContent).toContain("nur Alina kann ihn ändern");
  });

  /*
   * AUCH DIE KOORDINATION SCHEITERT AN EINEM FREMDEN PLAN (Spec, `_lib/zugang.ts`-Kommentar zu
   * `darfPlanAendern`): sie schlaegt vor, sie setzt nicht.
   */
  it("auch die Koordination sieht einen fremden Plan nur lesend", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const rike = legePerson("dev:rike@test", "koordination");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({
      titel: "X",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });

    await mount(planInhalt(t.db, rike, alina, HEUTE, {}));

    expect(document.body.textContent).not.toContain("Einzuplanen");
    expect(queryAll("form")).toHaveLength(0);
  });

  it("eine ausgeschiedene Person liest den eigenen, historischen Plan weiterhin, ohne Aktionen", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const doerte = legePerson("dev:doerte@test", "bufdi", { name: "Dörte", aktivBis: "2020-01-01" });
    legeAufgabe({
      titel: "Vergangene Aufgabe",
      erstellerId: malte.id,
      zugewiesenAn: doerte.id,
      prueferId: malte.id,
      status: "abgeschlossen",
      planDatum: "2019-12-01",
    });

    await mount(planInhalt(t.db, doerte, doerte, HEUTE, {}));

    expect(document.body.textContent).not.toContain("Einzuplanen");
    expect(queryAll("form")).toHaveLength(0);
  });
});

describe("planInhalt — die Woche steht in der URL", () => {
  it("ein anderer woche-Suchparameter zeigt eine andere Woche", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(planInhalt(t.db, alina, alina, HEUTE, { woche: "2026-08-24" }));
    expect(document.body.textContent).toContain("Mo, 24.08.");
    expect(document.body.textContent).not.toContain("Mo, 10.08.");
  });

  it("ohne Parameter zeigt die Woche von heute", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(planInhalt(t.db, alina, alina, HEUTE, {}));
    expect(document.body.textContent).toContain("Mo, 10.08.");
  });
});

describe("planInhalt — Tageswaehler und Leerzustaende", () => {
  it("zeigt die Radiogruppe mit fuenf Tagen", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(planInhalt(t.db, alina, alina, HEUTE, {}));
    expect(queryAll('input[type="radio"]')).toHaveLength(5);
  });

  it("eine leere Woche zeigt in jedem Tag den eigenen Satz", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(planInhalt(t.db, alina, alina, HEUTE, {}));
    expect(document.body.textContent).toContain("Nichts eingeplant.");
  });

  it("ohne noch einzuplanende Aufgaben erscheint kein Einzuplanen-Abschnitt, auch fuer den eigenen Plan", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(planInhalt(t.db, alina, alina, HEUTE, {}));
    expect(document.body.textContent).not.toContain("Einzuplanen");
  });

  /*
   * GEGENPROBE (advisor-Fund): ZWEI einzuplanende Aufgaben rendern ZWEI `EinplanenFormular`e.
   * Vor `idPrefix` teilten sich beide dieselben Feld-Ids ("ep-planDatum" usw.) — jedes
   * `label[for]` zeigte auf das ERSTE Formular. Dieser Test haelt fest, dass jedes Formular
   * eigene Ids traegt und `label[for]` sein eigenes Feld trifft.
   */
  it("zwei einzuplanende Aufgaben ergeben zwei Formulare mit eigenen, nicht kollidierenden Ids", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const erste = legeAufgabe({
      titel: "Erste",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });
    const zweite = legeAufgabe({
      titel: "Zweite",
      erstellerId: malte.id,
      zugewiesenAn: alina.id,
      prueferId: malte.id,
      status: "verteilt",
      planDatum: null,
    });

    await mount(planInhalt(t.db, alina, alina, HEUTE, {}));

    const formulare = queryAll("form");
    expect(formulare).toHaveLength(2);

    for (const aufgabe of [erste, zweite]) {
      const feld = query<HTMLInputElement>(`#ep-${aufgabe.id}-planDatum`);
      expect(feld).toBeTruthy();
      const label = document.querySelector(`label[for="ep-${aufgabe.id}-planDatum"]`);
      expect(label).toBeTruthy();
      expect(label?.getAttribute("for")).toBe(feld.id);
    }

    // die IDs sind wirklich verschieden, nicht zufaellig gleich
    expect(query<HTMLInputElement>(`#ep-${erste.id}-planDatum`).id).not.toBe(
      query<HTMLInputElement>(`#ep-${zweite.id}-planDatum`).id,
    );
  });
});

describe("PlanPage — Default-Export: IDOR-Schutz und notFound()", () => {
  it("eine unbekannte personId ergibt notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await expect(
      PlanPage({
        params: Promise.resolve({ personId: "unbekannt" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("eine bekannte personId einer fremden Person ist erreichbar (200, kein notFound)", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    const bendix = legePerson("dev:bendix@test", "bufdi", { name: "Bendix" });
    sitzung = { user: { id: alina.sub } };
    const element = await PlanPage({
      params: Promise.resolve({ personId: bendix.id }),
      searchParams: Promise.resolve({}),
    });
    await mount(element);
    expect(query("h1").textContent).toBe("Zeitplan von Bendix");
  });

  it("ohne Sitzung: notFound() (personFuerSession)", async () => {
    sitzung = null;
    await expect(
      PlanPage({ params: Promise.resolve({ personId: "irrelevant" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
