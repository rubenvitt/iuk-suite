import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "@/app/m/portal/_db/schema";
import { seedPortal } from "./seed";
import { seedLokalPortal, LOKALE_DIENSTE } from "./seedLokal";
import { filterVisibleServices } from "./rbac";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/portal/_db/migrations" });
});
afterEach(() => sqlite.close());

function alle(): schema.Service[] {
  return db.select().from(schema.services).all();
}

describe("seedLokalPortal", () => {
  it("legt den Katalog an und ist idempotent", async () => {
    const ersteZeilen = await seedLokalPortal(db);
    expect(alle()).toHaveLength(LOKALE_DIENSTE.length);
    expect(LOKALE_DIENSTE.length).toBeGreaterThanOrEqual(12);
    expect(ersteZeilen.length).toBeGreaterThan(0);

    // Zweiter Lauf: keine Duplikate, und die Protokollzeile sagt es auch.
    const zweiteZeilen = await seedLokalPortal(db);
    expect(alle()).toHaveLength(LOKALE_DIENSTE.length);
    expect(zweiteZeilen[0]).toContain(`0 Dienste angelegt`);
  });

  it("lässt den Boot-Seed unangetastet und ergänzt ihn nur", async () => {
    await seedPortal(db);
    const nachBootSeed = alle();
    expect(nachBootSeed).toHaveLength(2);

    await seedLokalPortal(db);
    const nachher = alle();
    expect(nachher).toHaveLength(2 + LOKALE_DIENSTE.length);

    // Die zwei Boot-Zeilen stehen unverändert da — inklusive ihrer sortOrder.
    const bookstack = nachher.find((s) => s.slug === "bookstack");
    const vaultwarden = nachher.find((s) => s.slug === "vaultwarden");
    expect(bookstack?.name).toBe("BookStack");
    expect(bookstack?.sortOrder).toBe(1);
    expect(vaultwarden?.name).toBe("Vaultwarden");
    expect(vaultwarden?.sortOrder).toBe(2);
  });

  /**
   * E2E-SCHUTZ, kein Stilwunsch: `e2e/portal.spec.ts` greift beide Boot-Dienste
   * über ein nacktes `getByText("BookStack")` / `getByText("Vaultwarden")` —
   * ein zweiter Textreffer im Raster wäre dort ein Strict-Mode-Fehler, und für
   * "Vaultwarden" gilt zusätzlich `toHaveCount(0)` im Nicht-Admin-Fall.
   * Ebenso reserviert sind die Namen, die die Anlege-/Lösch-Tests selbst
   * erzeugen und mit `toHaveCount(1)`/`(0)` prüfen.
   */
  it("kollidiert mit keinem Text, den die E2E-Tests exakt zählen", async () => {
    await seedLokalPortal(db);
    const verboten = ["BookStack", "Vaultwarden", "Neuer Dienst", "Zu loeschender Dienst"];
    for (const dienst of alle()) {
      const text = `${dienst.name} ${dienst.description}`;
      for (const wort of verboten) {
        expect(text, `Dienst "${dienst.name}" enthält "${wort}"`).not.toContain(wort);
      }
    }
    // Und keiner der Slugs, die die E2E-Tests selbst anlegen.
    const slugs = alle().map((s) => s.slug);
    for (const belegt of ["bookstack", "vaultwarden", "neu", "weg"]) {
      expect(slugs.filter((s) => s === belegt)).toHaveLength(0);
    }
  });

  it("sortiert sich hinter den Boot-Seed und vergibt eindeutige Slugs", async () => {
    await seedLokalPortal(db);
    const dienste = alle();
    const slugs = dienste.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const d of dienste) expect(d.sortOrder).toBeGreaterThanOrEqual(10);
  });

  it("zeigt Kategorien-Vielfalt sowie öffentliche, geschützte und inaktive Einträge", async () => {
    await seedLokalPortal(db);
    const dienste = alle();

    const kategorien = new Set(dienste.map((d) => d.category));
    expect(kategorien.size).toBeGreaterThanOrEqual(4);

    expect(dienste.filter((d) => d.isPublic).length).toBeGreaterThanOrEqual(3);
    expect(dienste.filter((d) => !d.isPublic).length).toBeGreaterThanOrEqual(3);
    expect(dienste.filter((d) => !d.isActive).length).toBeGreaterThanOrEqual(1);
    // Ohne diese Zeile prüft lokal niemand den Zweig, der `target`/`rel` weglässt.
    expect(dienste.filter((d) => !d.openInNewTab).length).toBeGreaterThanOrEqual(1);
    expect(dienste.filter((d) => d.description !== "").length).toBe(dienste.length);
  });

  /**
   * Der eigentliche Zweck des Katalogs: dass die Sichtbarkeitsprüfung lokal
   * überhaupt etwas zu filtern hat. Ohne Gruppen sieht man echt weniger als mit.
   */
  it("ergibt für „ohne Gruppen“ eine echte Teilmenge von „mit allen Gruppen“", async () => {
    await seedLokalPortal(db);
    const dienste = alle();

    const ohne = filterVisibleServices([], dienste);
    const mit = filterVisibleServices(
      ["da-einsatz", "da-ausbildung", "da-verwaltung", "dashboard-admins"],
      dienste,
    );

    expect(ohne.length).toBeGreaterThan(0);
    expect(mit.length).toBeGreaterThan(ohne.length);
    // Inaktive bleiben in BEIDEN Sichten außen vor.
    expect(mit.length).toBeLessThan(dienste.length);
  });
});
