import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc } from "drizzle-orm";
import Database from "better-sqlite3";
import * as schema from "@/app/m/qr/_db/schema";
import { presets, type PresetRow } from "@/app/m/qr/_db/schema";
import { seedQr } from "./seed";
import { seedLokalQr, LOKALE_PRESETS } from "./seedLokal";
import { validatePresetInput } from "./validator";
import { payloadToQrString } from "./payload";
import type { QrKind, QrPayload } from "./types";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/qr/_db/migrations" });
});
afterEach(() => sqlite.close());

/** Wie `listPresets` sortiert — nur ohne den globalen `getDb()`-Zugriff. */
function alle(): PresetRow[] {
  return db.select().from(presets).orderBy(asc(presets.sortOrder), asc(presets.label)).all();
}

describe("seedLokalQr", () => {
  it("legt den Preset-Katalog an und ist idempotent", async () => {
    const ersteZeilen = await seedLokalQr(db);
    expect(alle()).toHaveLength(LOKALE_PRESETS.length);
    expect(ersteZeilen.length).toBeGreaterThan(0);

    const zweiteZeilen = await seedLokalQr(db);
    expect(alle()).toHaveLength(LOKALE_PRESETS.length);
    expect(zweiteZeilen[0]).toContain("0 Presets angelegt");
  });

  /**
   * DER KERN: jede vom CHECK-Constraint erlaubte `kind`-Variante ist belegt.
   * Ohne diese Zusicherung wäre der Katalog beliebig — der Zweck ist, den
   * Generator lokal komplett durchklicken zu können.
   */
  it("deckt alle fünf kind-Varianten ab", async () => {
    await seedLokalQr(db);
    const arten = new Set(alle().map((r) => r.kind));
    const erwartet: QrKind[] = ["url", "wifi", "tel", "vcard", "text"];
    for (const art of erwartet) expect(arten, `kind '${art}' fehlt`).toContain(art);
  });

  /**
   * BIS ZUM FERTIGEN QR-TEXT, nicht nur „Zeile existiert": die Spalte `value`
   * ist JSON-kodiert und trägt die INNERE Nutzlast (nicht das ganze
   * Payload-Objekt). Ein Encoding-Fehler wäre in der Datenbank unsichtbar und
   * schlüge erst an der Kachel zu — als Preset, das ins Leere führt.
   */
  it("jede Zeile überlebt JSON.parse, den Validator und die QR-Kodierung", async () => {
    await seedLokalQr(db);
    for (const zeile of alle()) {
      const wert: unknown = JSON.parse(zeile.value);

      const geprueft = validatePresetInput({
        id: zeile.id,
        label: zeile.label,
        icon: zeile.icon ?? undefined,
        kind: zeile.kind,
        value: wert,
      });
      expect(geprueft.ok, `Preset '${zeile.id}': ${geprueft.ok ? "" : geprueft.error}`).toBe(true);

      const text = payloadToQrString({ kind: zeile.kind, value: wert } as QrPayload);
      expect(text.length, `Preset '${zeile.id}' ergibt leeren QR-Text`).toBeGreaterThan(0);
    }
  });

  it("belegt die drei WLAN-Fälle und die vCard ohne Kontaktdaten", async () => {
    await seedLokalQr(db);
    const wlan = alle()
      .filter((r) => r.kind === "wifi")
      .map((r) => JSON.parse(r.value) as { encryption: string; hidden?: boolean });

    expect(wlan.some((w) => w.encryption === "WPA" && w.hidden !== true)).toBe(true);
    expect(wlan.some((w) => w.encryption === "nopass")).toBe(true);
    expect(wlan.some((w) => w.hidden === true)).toBe(true);

    const vcards = alle()
      .filter((r) => r.kind === "vcard")
      .map((r) => JSON.parse(r.value) as { tel?: string });
    // Nur `name` ist Pflicht — der knappe Fall muss vorkommen.
    expect(vcards.some((v) => v.tel === undefined)).toBe(true);
    expect(vcards.some((v) => v.tel !== undefined)).toBe(true);
  });

  /**
   * E2E-SCHUTZ: `e2e/qr.spec.ts` greift das Boot-Preset über ein nacktes
   * `getByText("Beispiel-Link")` und zählt den Verlaufseintrag mit
   * `toHaveCount(1)`. Ebenso reserviert sind die Bezeichnungen, die die
   * Anlege-/Lösch-/Rotationstests selbst erzeugen.
   */
  it("kollidiert mit keiner Bezeichnung, die die E2E-Tests exakt zählen", async () => {
    await seedLokalQr(db);
    const verboten = [
      "Beispiel-Link",
      "Neues Preset",
      "Preset zum Loeschen",
      "Preset vor Rotation",
      "Preset nach Rotation",
    ];
    for (const zeile of alle()) {
      for (const wort of verboten) {
        expect(zeile.label, `Preset '${zeile.id}' enthält "${wort}"`).not.toContain(wort);
      }
    }
  });

  it("lässt das Boot-Preset unangetastet und einsortiert es vor den lokalen", async () => {
    await seedQr(db);
    await seedLokalQr(db);

    const zeilen = alle();
    expect(zeilen).toHaveLength(1 + LOKALE_PRESETS.length);

    const demo = zeilen.find((r) => r.id === "demo-url");
    expect(demo?.label).toBe("Beispiel-Link");
    expect(demo?.sortOrder).toBe(0);
    // Erste Kachel bleibt das Boot-Preset: jeder lokale Eintrag hat sortOrder >= 10.
    expect(zeilen[0].id).toBe("demo-url");
    for (const zeile of zeilen.filter((r) => r.id !== "demo-url")) {
      expect(zeile.sortOrder).toBeGreaterThanOrEqual(10);
    }
    // IDs eindeutig — sonst hätte `onConflictDoNothing` still Zeilen verschluckt.
    const ids = zeilen.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
