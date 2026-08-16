// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../_db/schema";
import { FADEN, ROLLEN } from "../_lib/hilfe";
import type { Akteur } from "../_lib/zugang";

/*
 * `/hilfe` — DIE UEBERSICHT.
 *
 * DIE ROLLENFRAGE SELBST GEHOERT `_lib/hilfe.test.ts` (dort mit echten Seitenabrufen als
 * Gegenprobe); hier steht, was die SEITE daraus macht: eine Karte je Kapitel, mit Titel, Marke,
 * Zweck und — wo es eine gibt — der Adresse der Sicht.
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

import HilfePage, { hilfeInhalt } from "./page";

const HEUTE = "2026-08-13";

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

function legePerson(sub: string, rolle: Rolle): PersonRow {
  return t.db
    .insert(personen)
    .values({ sub, name: sub, initialen: "XX", rolle, aktivVon: "2026-01-01" })
    .returning()
    .get();
}

function akteur(p: PersonRow, istKoordination = false): Akteur {
  return { person: p, istKoordination };
}

describe("hilfeInhalt", () => {
  it("traegt den Titel „Anleitung“ und zaehlt die eigenen Kapitel in der Kontextzeile", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(hilfeInhalt(akteur(alina), HEUTE));
    expect(query("h1").textContent).toBe("Anleitung");
    expect(query("p").textContent).toMatch(/^6 Kapitel/);
  });

  /*
   * DIE KAPITELTITEL SIND DIE VERLINKTEN `<h3>` — seit der Rollenabschnitt darueber ebenfalls
   * `<h3>` traegt (die drei Rollenkarten und „Ein Auftrag, vier Schritte"), waere ein
   * ungezieltes `queryAll("h3")` eine Mischung aus beidem. Der Verweis IST hier das
   * Unterscheidungsmerkmal: eine Kapitelkarte fuehrt in ihr Kapitel, eine Rollenkarte nirgendwohin.
   */
  const kapitelTitel = () => queryAll("h3 a").map((h) => h.textContent);

  it("zeigt einer BuFDi ihre sechs Kapitel — und keines der Koordinationskapitel", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(hilfeInhalt(akteur(alina), HEUTE));
    const titel = kapitelTitel();
    expect(titel).toEqual([
      "Meine Woche",
      "Aufgabe einstellen",
      "Routinen",
      "Zeitplan",
      "Die einzelne Aufgabe",
      "Archiv",
    ]);
  });

  it("zeigt der Koordination ihre Kapitel, einschliesslich Verteilen und Personenverwaltung", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    await mount(hilfeInhalt(akteur(rike, true), HEUTE));
    const titel = kapitelTitel();
    expect(titel).toContain("Verteilung");
    expect(titel).toContain("Verteilen");
    expect(titel).toContain("Personenverwaltung");
    expect(titel).not.toContain("Meine Woche");
    expect(titel).not.toContain("Routinen");
  });

  /*
   * DER ZEITPLAN-VERWEIS TRAEGT DIE EIGENE PERSONEN-ID — die Anleitung kann nur auf den Plan der
   * LESENDEN Person zeigen (`zielHref`, `_lib/hilfe.ts`). Ein fester Pfad waere entweder falsch
   * oder eine geratene fremde Id.
   */
  it("verlinkt den Zeitplan auf die eigene Person", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(hilfeInhalt(akteur(alina), HEUTE));
    const ziele = queryAll("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/plan/${alina.id}`);
    expect(ziele).toContain("/hilfe/meine-woche");
  });

  /*
   * `/a/<id>` HAT KEINE ALLGEMEINE ADRESSE (`ziel.art === "kein"`) — die Karte darf deshalb
   * keinen „Sicht oeffnen"-Verweis tragen. Ein Verweis auf `/a/` waere ein Weg ins Leere.
   */
  it("gibt der Aufgaben-Karte keinen Sichtverweis", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(hilfeInhalt(akteur(alina), HEUTE));
    const ziele = queryAll("a").map((a) => a.getAttribute("href") ?? "");
    expect(ziele.filter((z) => z.startsWith("/a/"))).toEqual([]);
  });

  /*
   * DER ROLLENABSCHNITT STEHT VOR DEM VERZEICHNIS — er beantwortet „wer bin ich hier", und diese
   * Frage kommt vor „welche Seiten gibt es" (s. Kommentar in `page.tsx`).
   */
  it("stellt die drei Rollen und den durchgehenden Fall voran", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(hilfeInhalt(akteur(alina), HEUTE));
    const ueberschriften = queryAll("h3").map((h) => h.textContent);
    for (const rolle of ROLLEN) expect(ueberschriften).toContain(rolle.name);
    // Der Fall nennt Namen und Handlung je Schritt.
    expect(document.body.textContent).toContain(FADEN[0].rolle);
    expect(document.body.textContent).toContain("Beamer im Schulungsraum");
    // Das Rollenbild steht daneben, nicht nur der Text.
    expect(
      queryAll("svg[role='img']").map((svg) => svg.getAttribute("aria-label") ?? ""),
    ).toContainEqual(expect.stringContaining("Vier Stationen"));
  });

  it("zeigt das Lebenszyklusbild samt vollstaendiger Uebergangstabelle", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(hilfeInhalt(akteur(alina), HEUTE));
    expect(query("svg[role='img'] title")?.textContent).toBeTruthy();
    expect(queryAll("table tbody tr").length).toBeGreaterThan(10);
  });
});

describe("HilfePage — der Default-Export", () => {
  it("zeigt ohne Sitzung nichts an, sondern wirft notFound()", async () => {
    await expect(HilfePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /*
   * MODULZUGANG OHNE `personen`-ZEILE: dieselbe Erklaerseite wie ueberall sonst im Modul. Die
   * Rollenfrage ist dann unbeantwortbar, und jedes Kapitel beschriebe eine Flaeche, die dieser
   * Person heute ebenfalls die Erklaerseite zeigt (s. Kopfkommentar der Seite).
   */
  it("zeigt ohne personen-Zeile die Erklaerseite statt einer Kapitelliste", async () => {
    sitzung = { user: { id: "dev:neu@test", groups: [] } };
    await mount((await HilfePage()) as React.ReactElement);
    expect(query("h1").textContent).toBe("Aufgaben");
    expect(queryAll("h3 a").map((h) => h.textContent)).not.toContain("Archiv");
  });
});
