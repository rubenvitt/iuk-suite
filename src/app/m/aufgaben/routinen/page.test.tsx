// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, routinen, type PersonRow, type Rolle } from "../_db/schema";

/*
 * ZWEI MOCKS, NUR FUER DEN NEUEN BLOCK GANZ UNTEN (Aufgabe 13, `darfRoutinenVerwalten`-Gate):
 * dieselbe Form wie `_lib/zugang.test.ts`. `sitzung`/`testDb` sind `let`-Variablen, die
 * `beforeEach` neu setzt — die Mock-Factories schliessen ueber sie, Vitest hebt `vi.mock` ohnehin
 * vor die Imports.
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

import RoutinenPage, { routinenInhalt } from "./page";

/*
 * `routinenInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Brief) — die meisten Tests unten
 * rufen AUSSCHLIESSLICH sie, nie den Default-Export `RoutinenPage`: der braucht eine Sitzung
 * (`personFuerSession`), und genau das soll Vitest nicht stellen muessen.
 */

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

function legePerson(sub: string, extra: Partial<typeof personen.$inferInsert> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: extra.initialen ?? "XX",
      rolle: extra.rolle ?? "bufdi",
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeRoutine(personId: string, extra: Partial<typeof routinen.$inferInsert> = {}) {
  return t.db
    .insert(routinen)
    .values({
      personId,
      titel: "Fruehbesprechung",
      wochentage: 0b11111,
      uhrzeit: "08:00",
      dauerMinuten: 15,
      aktiv: true,
      ...extra,
    })
    .returning()
    .get();
}

describe("routinenInhalt — Leerzustand", () => {
  it("zeigt den ausgeschriebenen Leerzustand mit Anlege-Knopf, wenn niemand Routinen hat", async () => {
    const alina = legePerson("dev:alina@test");
    await mount(routinenInhalt(t.db, alina));

    expect(query("h1").textContent).toBe("Routinen");
    expect(document.body.textContent).toContain("Noch keine Routinen angelegt.");
    expect(queryAll("table")).toHaveLength(0);
    const knopf = queryAll("a").find((a) => a.textContent === "Routine anlegen");
    expect(knopf, "Anlege-Knopf im Leerzustand fehlt").toBeTruthy();
    expect(knopf!.getAttribute("href")).toBe("#routine-formular");
  });
});

describe("routinenInhalt — die eigenen Routinen, nicht die fremden", () => {
  it("zeigt nur die Routinen der anmeldenden Person", async () => {
    const alina = legePerson("dev:alina@test");
    const bendix = legePerson("dev:bendix@test");
    legeRoutine(alina.id, { titel: "Alinas Joggen" });
    legeRoutine(bendix.id, { titel: "Bendix Sport" });

    await mount(routinenInhalt(t.db, alina));

    expect(document.body.textContent).toContain("Alinas Joggen");
    expect(document.body.textContent).not.toContain("Bendix");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(1);
  });

  /*
   * DIE BITMASKE GEHT IN BEIDE RICHTUNGEN RICHTIG (Brief) — die Anzeige-Seite: eine Routine mit den
   * Bits Mo/Mi/Fr (0b10101 = 21) muss "Mo, Mi, Fr" zeigen, NICHT die Zahl 21. Ein Off-by-one waere
   * hier still falsch — eine Routine erschiene am falschen Tag, ohne dass jemand es saehe.
   */
  it("die Wochentage stehen lesbar da, nicht als Zahl", async () => {
    const alina = legePerson("dev:alina@test");
    legeRoutine(alina.id, { wochentage: 0b10101 });
    await mount(routinenInhalt(t.db, alina));

    const zeile = query("tbody tr[data-row-key]");
    expect(zeile.textContent).toContain("Mo, Mi, Fr");
    expect(zeile.textContent).not.toContain("21");
  });

  it("zeigt eine feste Uhrzeit oder „ohne feste Zeit“, und die Dauer ueber fmtDauer", async () => {
    const alina = legePerson("dev:alina@test");
    legeRoutine(alina.id, { titel: "Mit Uhrzeit", uhrzeit: "08:00", dauerMinuten: 90 });
    legeRoutine(alina.id, { titel: "Ohne Uhrzeit", uhrzeit: null, dauerMinuten: 45 });
    await mount(routinenInhalt(t.db, alina));

    const zeilen = queryAll("tbody tr[data-row-key]");
    const mit = zeilen.find((z) => z.textContent?.includes("Mit Uhrzeit"))!;
    const ohne = zeilen.find((z) => z.textContent?.includes("Ohne Uhrzeit"))!;
    expect(mit.textContent).toContain("08:00");
    expect(mit.textContent).toContain("1,5 Std.");
    expect(ohne.textContent).toContain("ohne feste Zeit");
    expect(ohne.textContent).toContain("45 Min.");
  });

  it("eine ruhende Routine ist sichtbar als solche markiert und verschwindet nicht", async () => {
    const alina = legePerson("dev:alina@test");
    legeRoutine(alina.id, { titel: "Ruhende Routine", aktiv: false });
    await mount(routinenInhalt(t.db, alina));

    const zeile = queryAll("tbody tr[data-row-key]").find((z) => z.textContent?.includes("Ruhende Routine"));
    expect(zeile, "die ruhende Routine fehlt in der Liste").toBeTruthy();
    expect(zeile!.textContent).toContain("Ruht");
  });

  it("eine aktive Routine traegt „Aktiv“, keine ruhende Markierung", async () => {
    const alina = legePerson("dev:alina@test");
    legeRoutine(alina.id, { titel: "Aktive Routine", aktiv: true });
    await mount(routinenInhalt(t.db, alina));

    const zeile = query("tbody tr[data-row-key]");
    expect(zeile.textContent).toContain("Aktiv");
    expect(zeile.textContent).not.toContain("Ruht");
  });

  it("die Kontextzeile ist nie leer und nennt Anzahl und ruhende Routinen", async () => {
    const alina = legePerson("dev:alina@test");
    legeRoutine(alina.id);
    legeRoutine(alina.id, { titel: "Ruhend", aktiv: false });
    await mount(routinenInhalt(t.db, alina));

    expect(query("p").textContent).toBe("2 eigene Routinen, davon 1 ruhend.");
  });

  it("die Kontextzeile behandelt den Singular richtig", async () => {
    const alina = legePerson("dev:alina@test");
    legeRoutine(alina.id);
    await mount(routinenInhalt(t.db, alina));

    expect(query("p").textContent).toBe("1 eigene Routine, davon 0 ruhend.");
  });
});

describe("routinenInhalt — bearbeiten ueber ?bearbeiten=<id>", () => {
  it("zeigt das Aendern-Formular vorbelegt, wenn die id der eigenen Person gehoert", async () => {
    const alina = legePerson("dev:alina@test");
    const routine = legeRoutine(alina.id, { titel: "Joggen" });

    await mount(routinenInhalt(t.db, alina, routine.id));

    expect(document.body.textContent).toContain("Routine „Joggen“ ändern");
    expect(query<HTMLInputElement>("#rt-titel").value).toBe("Joggen");
    expect(query("a[href='/routinen']")).toBeTruthy();
  });

  /*
   * KEIN IDOR: die id wird gegen die BEREITS AUF DIE EIGENE PERSON GEFILTERTE LISTE gesucht, nicht
   * gegen eine zweite, ungeprueften Datenbankabfrage. Eine fremde id ergibt deshalb schlicht das
   * Anlege-Formular — kein Fehler, kein Blick auf fremde Daten.
   */
  it("eine fremde id ergibt schlicht das Anlege-Formular, keinen Fehler", async () => {
    const alina = legePerson("dev:alina@test");
    const bendix = legePerson("dev:bendix@test");
    const fremdeRoutine = legeRoutine(bendix.id, { titel: "Bendix Routine" });

    await mount(routinenInhalt(t.db, alina, fremdeRoutine.id));

    expect(document.body.textContent).toContain("Neue Routine anlegen");
    expect(document.body.textContent).not.toContain("Bendix Routine");
  });

  it("eine unbekannte id ergibt ebenfalls das Anlege-Formular", async () => {
    const alina = legePerson("dev:alina@test");
    await mount(routinenInhalt(t.db, alina, "unbekannt"));

    expect(document.body.textContent).toContain("Neue Routine anlegen");
  });
});

/*
 * DER DEFAULT-EXPORT — GENAU HIER, WEIL ER DAS ROLLEN-GATE TRAEGT (Aufgabe 13, `darfRoutinenVerwalten`
 * in `_lib/zugang.ts`). Braucht die Mocks oben, deshalb bewusst NICHT im selben Stil wie die Tests
 * darueber (die rufen nur `routinenInhalt`, ohne Sitzung).
 */
describe("RoutinenPage — Rollen-Gate (Aufgabe 13, Spec §8: '/routinen' fuer bufdi)", () => {
  function legeRollenPerson(sub: string, rolle: Rolle): PersonRow {
    return legePerson(sub, { rolle });
  }

  it("bufdi: die Seite antwortet normal", async () => {
    const alina = legeRollenPerson("dev:alina@test", "bufdi");
    sitzung = { user: { id: alina.sub } };
    await mount(await RoutinenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Routinen");
  });

  it("koordination: notFound(), nicht 403", async () => {
    const rike = legeRollenPerson("dev:rike@test", "koordination");
    sitzung = { user: { id: rike.sub } };
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("auftrag: notFound()", async () => {
    const malte = legeRollenPerson("dev:malte@test", "auftrag");
    sitzung = { user: { id: malte.sub } };
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("ein ausgeschiedener bufdi bekommt ebenfalls notFound()", async () => {
    const doerte = legePerson("dev:doerte@test", { rolle: "bufdi", aktivBis: "2020-01-01" });
    sitzung = { user: { id: doerte.sub } };
    await expect(RoutinenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /*
   * SPEC-NACHTRAG 2026-08-14: Modulzugang ohne `personen`-Zeile ist die Erklaerseite, NICHT
   * `notFound()` — VOR dem Rollen-Gate, das ohne eine aufgeloeste Person gar nicht pruefbar waere.
   */
  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await RoutinenPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });
});
