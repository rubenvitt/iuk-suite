// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import PersonenPage, { personenInhalt } from "./page";

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

const HEUTE = "2026-08-13";

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

describe("personenInhalt — Kopf, Formular, Tabelle", () => {
  it("zeigt den Titel, die Anzahl und das Anlege-Formular", async () => {
    legePerson("dev:rike@test", "auftrag", { name: "Rike" });
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(personenInhalt(t.db, HEUTE));
    expect(query("h1").textContent).toBe("Personenverwaltung");
    expect(document.body.textContent).toContain("2 Personen im Modul, davon 2 aktiv");
    expect(query("h2").textContent).toBe("Neue Person anlegen");
    expect(query("button[type='submit']").textContent).toBe("Person anlegen");
  });

  it("zeigt genau eine ausgeschiedene Person in der aktiv-Zahl korrekt", async () => {
    legePerson("dev:rike@test", "auftrag");
    legePerson("dev:doerte@test", "bufdi", { aktivBis: "2020-01-01" });
    await mount(personenInhalt(t.db, HEUTE));
    expect(document.body.textContent).toContain("2 Personen im Modul, davon 1 aktiv");
  });

  it("mit bearbeitenId: zeigt das Aendern-Formular vorbelegt, mit Abbrechen-Verweis", async () => {
    legePerson("dev:rike@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(personenInhalt(t.db, HEUTE, alina.id));
    expect(query("h2").textContent).toBe("Person „Alina“ ändern");
    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina");
    const abbrechen = queryAll<HTMLAnchorElement>("a").find((a) => a.textContent === "Abbrechen")!;
    expect(abbrechen, "Abbrechen-Verweis fehlt").toBeTruthy();
    expect(abbrechen.getAttribute("href")).toBe("/personen");
  });

  it("eine unbekannte bearbeitenId zeigt das Anlege-Formular, kein Fehler", async () => {
    legePerson("dev:rike@test", "auftrag");
    await mount(personenInhalt(t.db, HEUTE, "unbekannte-id"));
    expect(query("h2").textContent).toBe("Neue Person anlegen");
  });
});

describe("PersonenPage — Rollen-Gate (Spec §4: nur die Koordination verwaltet Personen)", () => {
  it("die Koordination: die Seite antwortet normal", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    anmelden(rike, true);
    await mount(await PersonenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Personenverwaltung");
  });

  it("auftrag: notFound()", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    anmelden(malte);
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("bufdi: notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  /**
   * DIE EINE ZUSAGE, DIE DER QUELLENWECHSEL (2026-08-15) UMDREHT — bewusst, nicht als Panne. Bis
   * dahin hiess dieser Fall „eine ausgeschiedene Koordination bekommt ebenfalls notFound()": die
   * Rolle stand in der Zeile, und `darfPersonenVerwalten`s `istAktiv` lehnte sie ab.
   *
   * Jetzt traegt die GRUPPE die Rolle. Ein `aktivBis` auf der Zeile sagt ueber die
   * Gruppenmitgliedschaft nichts aus — der Entzug laeuft ueber Pocket ID (Entwurf §5: „`istAktiv`
   * gilt fuer die Koordination nicht mehr"). ZWEI UNABHAENGIGE WEGE fuehren diese Sitzung inzwischen
   * herein, und beide sollen sie hereinfuehren: der NOTAUSGANG (`canAdminModule`,
   * Betreiberentscheidung 2026-08-14) steht vor jeder Personen-Zeilen-Frage, UND
   * `darfPersonenVerwalten` selbst misst die Koordination nicht mehr an `istAktiv`.
   *
   * DIE FRUEHER HIER AUSGESCHRIEBENE UNGLEICHHEIT IST AUFGELOEST: `/verteilen` und `/freigaben`
   * antworteten derselben Sitzung bis zum 2026-08-15 mit `notFound()`, weil dort kein Notausgang
   * steht und die Praedikate auf `&& istAktiv(...)` endeten. Seit die Praedikate selbst nachgezogen
   * sind, gilt fuer alle drei Routen dieselbe Regel — `verteilen/page.test.tsx` haelt die andere
   * Haelfte fest.
   */
  it("eine ausgeschiedene Koordination MIT Gruppe kommt hinein — die Gruppe traegt die Rolle, nicht aktivBis", async () => {
    const exRike = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2020-01-01" });
    anmelden(exRike, true);
    await mount(await PersonenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Personenverwaltung");
  });

  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await PersonenPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });
});

/**
 * DER NOTAUSGANG (Fix-Runde 1, Betreiberentscheidung 2026-08-14, Spec §4 "plus der Suite-Admin") —
 * geprueft auf der Route (`canAdminModule`), nicht im Praedikat. Die Gruppe "dashboard-admins" ist
 * der Vorgabewert von `suiteAdminGroup()` (`core/groups.ts`, ohne `ADMIN_GROUP` in der Testumgebung
 * gesetzt); "iuk-aufgaben-koordination" ist die modul-eigene Admin-Gruppe aus der Registry
 * (`core/registry.ts`s `adminGroups` fuer `aufgaben`) — `isModuleAdmin` laesst BEIDE durch.
 */
describe("PersonenPage — der Notausgang fuer den Suite-/Modul-Admin", () => {
  /**
   * NUR DIE LESE-HAELFTE — DER NAME SAGT DAS JETZT AUCH (Abschlussreview K1). Bis dahin hiess
   * dieser Test „genau der Erstbetriebs-Fall" und prueft doch nur, dass die SEITE rendert; der
   * Erstbetriebs-Fall ist aber das SCHREIBEN der ersten Zeile, und das war zu diesem Zeitpunkt
   * ueberhaupt nicht gebaut. Die Schreib-Haelfte steht seither in `actions.test.ts`
   * („Suite-Admin OHNE eigene personen-Zeile legt die erste Person an").
   */
  it("Suite-Admin OHNE eigene personen-Zeile bekommt die Seite mit dem Formular (Lesepfad)", async () => {
    // Bewusst KEINE `personen`-Zeile fuer diese Sitzung: eine frische Datenbank kennt ueberhaupt
    // keine Person, und genau das soll dieser Notausgang loesen.
    sitzung = { user: { id: "dev:admin@test", groups: ["dashboard-admins"] } };
    await mount(await PersonenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Personenverwaltung");
  });

  it("die modul-eigene Admin-Gruppe (iuk-aufgaben-koordination) kommt ebenso hinein", async () => {
    sitzung = { user: { id: "dev:modadmin@test", groups: ["iuk-aufgaben-koordination"] } };
    await mount(await PersonenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Personenverwaltung");
  });

  /**
   * DER AUSSPERR-FALL, WOERTLICH (Fix-Auftrag Punkt 4): die EINZIGE Koordinationsperson hat ihr
   * eigenes `aktivBis` auf gestern gesetzt (versehentlich oder als Jahreswechsel). OHNE den
   * Notausgang waere `/personen` fuer NIEMANDEN mehr erreichbar gewesen, auch nicht fuer den
   * Betreiber. Traegt dieselbe Sitzung zusaetzlich die Suite-Admin-Gruppe, kommt sie trotzdem
   * hinein.
   *
   * SEIT DEM 2026-08-15 IST DER FALL DOPPELT ABGESICHERT, UND DER TEST BLEIBT TROTZDEM STEHEN:
   * `darfPersonenVerwalten` misst die Koordination nicht mehr an `istAktiv`, das Aussperren durch
   * das eigene Formular ist also gar nicht mehr moeglich. Diese Zeile prueft weiterhin den ZWEITEN
   * Weg — die Suite-Admin-Gruppe —, und der ist der einzige, der auch dann noch traegt, wenn
   * `SUITE_ADMIN_GROUP_AUFGABEN` fehlkonfiguriert ist.
   */
  it("Aussperr-Fall: die einzige (jetzt beendete) Koordinationsperson kommt als Suite-Admin trotzdem hinein", async () => {
    const exRike = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2026-08-12" });
    sitzung = { user: { id: exRike.sub, groups: ["dashboard-admins"] } };
    await mount(await PersonenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Personenverwaltung");
  });

  it("eine Rolle ohne jede Admin-Gruppe bleibt bei notFound(), auch mit anderen, fremden Gruppen", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    sitzung = { user: { id: malte.sub, groups: ["irgendeine-andere-gruppe"] } };
    await expect(PersonenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

/**
 * DIE FELDWAHL DER PERSONENANLAGE REICHT DURCH (Verzeichnis-Autofill 2026-08-15).
 *
 * `personenInhalt` entscheidet sie nicht selbst — `isDirectoryConfigured()` steht im Default-Export,
 * damit diese reine Inhaltsfunktion ohne Env auskommt. Der Test haelt fest, dass der Wert beim
 * Formular ANKOMMT: er ist die einzige Naht zwischen "ein Key ist hinterlegt" und "die Koordination
 * bekommt eine Suche statt eines Rate-Feldes", und ohne ihn faellt sie still auf das Textfeld
 * zurueck, ohne dass irgendetwas rot wuerde.
 */
describe("personenInhalt — das Verzeichnis entscheidet ueber das Kennungsfeld", () => {
  it("ohne Verzeichnis: das Textfeld traegt name='sub' (der Rueckfallweg)", async () => {
    await mount(personenInhalt(t.db, HEUTE));
    expect(query<HTMLInputElement>("#pf-sub").getAttribute("name")).toBe("sub");
  });

  it("mit Verzeichnis: dieselbe Id, aber als Suchfeld ohne name", async () => {
    await mount(personenInhalt(t.db, HEUTE, undefined, true));
    expect(query("#pf-sub").getAttribute("name")).toBeNull();
    expect(queryAll<HTMLInputElement>("input[name='sub']")).toHaveLength(1);
  });
});
