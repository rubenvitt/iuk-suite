// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { personen, type PersonRow, type Rolle } from "../../_db/schema";
import { HILFE_SICHTEN, SICHT_SCHLUESSEL } from "../../_lib/hilfe";
import type { Akteur } from "../../_lib/zugang";

/*
 * `/hilfe/<sicht>` — EIN KAPITEL.
 *
 * DIESE DATEI PRUEFT DIE DARSTELLUNG: dass jedes Kapitel wirklich rendert (alle elf, nicht nur
 * eines als Stichprobe), dass Skizze, Schritte, Grenzen und der Verweis auf die Sicht ankommen —
 * und dass die Anleitung ihre eigene Zusage einhaelt, den Riegel zu ERKLAEREN statt zu verschweigen.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../../_db/client", () => ({ getDb: () => mockDb.db }));

import { kapitelInhalt } from "./page";

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

describe("kapitelInhalt — jedes der elf Kapitel rendert vollstaendig", () => {
  for (const schluessel of SICHT_SCHLUESSEL) {
    it(`${schluessel}`, async () => {
      const alina = legePerson("dev:alina@test", "bufdi");
      const sicht = HILFE_SICHTEN[schluessel];
      await mount(kapitelInhalt(sicht, akteur(alina)));

      expect(query("h1").textContent).toBe(sicht.titel);
      // Skizze: eine Nummernscheibe und eine Legendenzeile je Block.
      expect(queryAll("svg circle").length).toBeGreaterThanOrEqual(sicht.skizze.length);
      expect(queryAll("figcaption ol > li")).toHaveLength(sicht.skizze.length);
      // Schritte und Grenzen.
      const schrittTitel = queryAll("ol > li > strong").map((el) => el.textContent);
      for (const schritt of sicht.schritte) expect(schrittTitel).toContain(schritt.titel);
      const grenzen = queryAll("ul > li").map((el) => el.textContent);
      for (const grenze of sicht.grenzen) expect(grenzen).toContain(grenze);
      // Die Bilder des Kapitels.
      expect(queryAll("svg[role='img']").length).toBe(1 + sicht.bilder.length);
    });
  }
});

describe("kapitelInhalt — der Verweis auf die Sicht", () => {
  it("verlinkt eine feste Adresse", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    await mount(kapitelInhalt(HILFE_SICHTEN.verteilen, akteur(rike, true)));
    expect(queryAll("a").map((a) => a.getAttribute("href"))).toContain("/verteilen");
  });

  it("verlinkt den Zeitplan auf die lesende Person", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(kapitelInhalt(HILFE_SICHTEN.zeitplan, akteur(alina)));
    expect(queryAll("a").map((a) => a.getAttribute("href"))).toContain(`/plan/${alina.id}`);
  });

  /*
   * `/a/<id>` HAT KEINE ALLGEMEINE ADRESSE. Statt eines Verweises ins Leere steht dort der SATZ,
   * wie man hinkommt — das ist die Auskunft, die eine Adresse hier nicht geben kann.
   */
  it("ersetzt den fehlenden Verweis durch die Wegbeschreibung", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    await mount(kapitelInhalt(HILFE_SICHTEN.aufgabe, akteur(alina)));
    expect(queryAll("a").map((a) => a.getAttribute("href") ?? "").filter((h) => h.startsWith("/a/"))).toEqual([]);
    expect(document.body.textContent).toContain("So kommst du hin:");
  });

  /*
   * DIE ANLEITUNG VERSCHWEIGT DEN RIEGEL NICHT (s. `hilfe/[sicht]/page.tsx`): wo eine Sicht einer
   * Rolle mit 404 antwortet, steht das unter „Was hier nicht geht" — sonst liest jemand ein
   * Kapitel, klickt auf „Sicht oeffnen" und landet ohne Erklaerung auf der Fehlerseite.
   */
  it("nennt in jedem rollengebundenen Kapitel, wem die Sicht mit 404 antwortet", async () => {
    for (const schluessel of ["verteilen", "freigaben", "routinen"] as const) {
      const grenzen = HILFE_SICHTEN[schluessel].grenzen.join(" ");
      expect(grenzen, schluessel).toMatch(/404/);
    }
  });
});
