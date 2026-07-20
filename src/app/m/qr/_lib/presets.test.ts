import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

const DIR = "./.data/qr-test";

// Der Code unter Test wird in jedem Test dynamisch importiert, damit er die
// hier gesetzte DATA_DIR sieht.
//
// mkdirSync ist noetig, weil better-sqlite3 - anders als openModuleDatabase() -
// das Verzeichnis nicht selbst anlegt; nach dem rmSync gaebe es sonst
// SQLITE_CANTOPEN statt eines Testergebnisses.
//
// Der Cache in globalThis.__suiteDb muss mit weg: getModuleDb() haelt die
// Verbindung global fest, und nach dem rmSync zeigte sie auf die geloeschte
// Datei weiter. Die Tests saehen dann die Daten ihrer Vorgaenger.
beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(`${DIR}/qr.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/qr/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

/** Liest die Audit-Spalten direkt aus der Tabelle. toPreset bildet created_by
 *  und updated_by nicht ab, ueber listPresets sind sie also unerreichbar. */
async function readAudit(id: string) {
  const { getDb } = await import("@/app/m/qr/_db/client");
  const { presets } = await import("@/app/m/qr/_db/schema");
  const { eq } = await import("drizzle-orm");
  return getDb().select().from(presets).where(eq(presets.id, id)).get();
}

describe("presets", () => {
  // Zurueckgelesen wird ueber listPresets, nicht ueber den Rueckgabewert:
  // createPreset synthetisiert diesen aus der Eingabe, ein nie ausgefuehrtes
  // INSERT faellt daran nicht auf.
  it("legt ein Preset an und vergibt einen Slug aus dem Label", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "Übung Größe", kind: "url", value: "https://drk.de" }, "user-1");
    const rows = await listPresets();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("uebung-groesse");
    expect(rows[0].label).toBe("Übung Größe");
  });

  it("kollidierende Labels bekommen -2", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "Test", kind: "url", value: "a" }, "u");
    await createPreset({ label: "Test", kind: "url", value: "b" }, "u");
    expect((await listPresets()).map((p) => p.id)).toEqual(["test", "test-2"]);
  });

  // Eine explizit uebergebene id umgeht idFromLabel vollstaendig - der Vertrag
  // aus dem Plan, auf den ein Import bestehender easy-qr-Daten angewiesen ist.
  it("uebernimmt eine explizit uebergebene id unveraendert", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset(
      { id: "fest-vergeben", label: "Ganz anderes Label", kind: "url", value: "a" },
      "u",
    );
    expect(p.id).toBe("fest-vergeben");
    expect((await listPresets()).map((x) => x.id)).toEqual(["fest-vergeben"]);
  });

  it("value wird JSON-kodiert gespeichert und wieder geparst", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset(
      { label: "W", kind: "wifi", value: { ssid: "S", password: "p", encryption: "WPA" } },
      "u",
    );
    const [p] = await listPresets();
    expect(p.kind).toBe("wifi");
    expect(p.value).toEqual({ ssid: "S", password: "p", encryption: "WPA" });
  });

  // label und icon werden sonst nirgends aus der DB zurueckgelesen; faellt ihr
  // Mapping in toPreset aus, verschwinden die Icons aus Kachel und Adminliste.
  it("liest label und icon zurueck, fehlendes icon wird undefined", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "Mit Icon", icon: "🔗", kind: "url", value: "a" }, "u");
    await createPreset({ label: "Ohne Icon", kind: "url", value: "b" }, "u");

    const [mit, ohne] = await listPresets();
    expect(mit).toMatchObject({ id: "mit-icon", label: "Mit Icon", icon: "🔗" });
    expect(ohne).toMatchObject({ id: "ohne-icon", label: "Ohne Icon" });
    expect(ohne.icon).toBeUndefined();
  });

  it("sortiert nach sort_order, dann label", async () => {
    const { createPreset, listPresets, reorderPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "A", kind: "url", value: "a" }, "u");
    await createPreset({ label: "B", kind: "url", value: "b" }, "u");
    await reorderPresets(["b", "a"]);
    expect((await listPresets()).map((p) => p.id)).toEqual(["b", "a"]);
  });

  // reorderPresets akzeptiert Teilmengen, Gleichstaende im sort_order sind also
  // erreichbar. Der Test haelt die beobachtbare Zusage fest, dass sie dann
  // alphabetisch aufgeloest werden.
  //
  // Achtung: Er beweist NICHT, dass asc(presets.label) im orderBy steht. Der
  // Index idx_presets_sort liegt auf (sort_order, label), SQLite scannt ihn und
  // liefert die Label-Ordnung auch ohne den zweiten orderBy-Ausdruck mit
  // (per EXPLAIN QUERY PLAN geprueft). Fehlen Index und Tiebreak zusammen, wird
  // er in der Praxis rot - garantiert ist das aber nicht, denn die Reihenfolge
  // gleicher sort_order-Werte ist dann schlicht unspezifiziert. Mehr ist ueber
  // die oeffentliche API nicht nachweisbar.
  it("loest gleichen sort_order alphabetisch nach label auf", async () => {
    const { createPreset, listPresets, reorderPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "B", kind: "url", value: "b" }, "u");
    await createPreset({ label: "A", kind: "url", value: "a" }, "u");
    // Nur "a" umsortieren: es landet auf sort_order 0, wo "b" schon steht.
    await reorderPresets(["a"]);
    expect((await listPresets()).map((p) => p.id)).toEqual(["a", "b"]);
  });

  // Absteigend alphabetische Labels: kaeme die Reihenfolge aus dem Label statt
  // aus sort_order, waere das Ergebnis umgekehrt. Der Test faellt damit auch
  // dann auf, wenn alle Presets denselben sort_order bekaemen.
  it("haengt neue Presets ans Ende statt an den Anfang", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "Z", kind: "url", value: "z" }, "u");
    await createPreset({ label: "A", kind: "url", value: "a" }, "u");
    expect((await listPresets()).map((p) => p.id)).toEqual(["z", "a"]);
  });

  it("update aendert die gespeicherten Werte, id bleibt", async () => {
    const { createPreset, updatePreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Alt", kind: "url", value: "a" }, "u1");
    const updated = await updatePreset(p.id, { label: "Neu", kind: "url", value: "b" }, "u2");
    expect(updated?.id).toBe(p.id);

    const [gelesen] = await listPresets();
    expect(gelesen.id).toBe(p.id);
    expect(gelesen.label).toBe("Neu");
    expect(gelesen.value).toBe("b");
  });

  it("schreibt created_by beim Anlegen und updated_by beim Aendern", async () => {
    const { createPreset, updatePreset } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Audit", kind: "url", value: "a" }, "u1");
    expect(await readAudit(p.id)).toMatchObject({ createdBy: "u1", updatedBy: "u1" });

    await updatePreset(p.id, { label: "Audit", kind: "url", value: "b" }, "u2");
    expect(await readAudit(p.id)).toMatchObject({ createdBy: "u1", updatedBy: "u2" });
  });

  it("update auf unbekannte id liefert null statt zu werfen", async () => {
    const { updatePreset } = await import("@/app/m/qr/_lib/presets");
    expect(
      await updatePreset("gibtsnicht", { label: "X", kind: "url", value: "a" }, "u"),
    ).toBeNull();
  });

  // uniqueSlug haengt `-2` an, ohne die Laenge zu pruefen. Bei einer Basis, die
  // slugify bereits auf die vollen 60 Zeichen bringt, entstuende eine 62 Zeichen
  // lange ID - die validatePresetInput ablehnt. Das Preset liesse sich dann
  // anlegen, aber nie wieder bearbeiten.
  it("kuerzt die Basis, damit auch eine kollidierende ID gueltig bleibt", async () => {
    const { createPreset } = await import("@/app/m/qr/_lib/presets");
    const { validatePresetInput } = await import("@/app/m/qr/_lib/validator");
    const label = "a".repeat(60);

    await createPreset({ label, kind: "url", value: "a" }, "u");
    const second = await createPreset({ label, kind: "url", value: "b" }, "u");

    expect(validatePresetInput({ id: second.id, label, kind: "url", value: "b" }).ok).toBe(true);
  });

  // Faellt der Schnitt auf 60 Zeichen mitten in einen Trennstrich, endet die
  // gekuerzte Basis auf einem Bindestrich - den ID_RE ablehnt. 54 a, Leerzeichen,
  // 10 b ergibt genau das: die Basis traegt an Position 55 einen Bindestrich.
  it("schneidet einen Trennstrich am Ende der gekuerzten Basis ab", async () => {
    const { createPreset } = await import("@/app/m/qr/_lib/presets");
    const { validatePresetInput } = await import("@/app/m/qr/_lib/validator");
    const label = `${"a".repeat(54)} ${"b".repeat(10)}`;

    await createPreset({ label, kind: "url", value: "a" }, "u");
    const second = await createPreset({ label, kind: "url", value: "b" }, "u");

    expect(second.id.endsWith("-")).toBe(false);
    expect(validatePresetInput({ id: second.id, label, kind: "url", value: "b" }).ok).toBe(true);
  });

  // Die Reserve MAX_SUFFIX haelt Platz fuer das `-<n>` von uniqueSlug frei. Die
  // vorbelegten IDs erzwingen, dass die gekuerzte Basis selbst kollidiert und
  // ein Suffix tatsaechlich vergeben wird - erst dann traegt die Reserve.
  it("laesst Platz fuer das Suffix, wenn auch die gekuerzte Basis vergeben ist", async () => {
    const { createPreset } = await import("@/app/m/qr/_lib/presets");
    const { validatePresetInput } = await import("@/app/m/qr/_lib/validator");
    const label = "a".repeat(60);

    for (const len of [55, 59, 60]) {
      await createPreset({ id: "a".repeat(len), label: "Vorbelegt", kind: "url", value: "x" }, "u");
    }
    const p = await createPreset({ label, kind: "url", value: "b" }, "u");

    expect(p.id).not.toBe("a".repeat(55));
    expect(validatePresetInput({ id: p.id, label, kind: "url", value: "b" }).ok).toBe(true);
  });

  it("delete meldet, ob etwas gelöscht wurde", async () => {
    const { createPreset, deletePreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Weg", kind: "url", value: "a" }, "u");
    expect(await deletePreset(p.id)).toBe(true);
    expect(await deletePreset(p.id)).toBe(false);
    expect(await listPresets()).toHaveLength(0);
  });
});
