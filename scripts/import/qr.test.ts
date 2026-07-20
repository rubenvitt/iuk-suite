import { describe, it, expect, beforeEach } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";

const DIR = "./.data/qr-import-test";
const SOURCE = `${DIR}/easy-qr.db`;

/** Legt eine Quell-DB mit dem echten easy-qr-Schema an (migrations/0001_init.sql). */
function makeSource(rows: Record<string, unknown>[]): void {
  const db = new Database(SOURCE);
  db.exec(`
    CREATE TABLE presets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      icon TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('url','wifi','tel','vcard','text')),
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );
  `);
  const stmt = db.prepare(
    `INSERT INTO presets (id,label,icon,kind,value,sort_order,created_at,updated_at,created_by,updated_by)
     VALUES (@id,@label,@icon,@kind,@value,@sort_order,@created_at,@updated_at,@created_by,@updated_by)`,
  );
  for (const r of rows) stmt.run(r);
  db.close();
}

/**
 * Fixture mit **pro Feld unterschiedlichen** Werten. Das ist kein Zufall: der
 * Paritätscheck vergleicht Quell- und Zielansicht, die beide durch dieselbe
 * Mapping-Funktion laufen — er zertifiziert also die Round-Trip-Treue, nicht die
 * Korrektheit des Mappings. Vertauschte Felder fielen ihm nicht auf. Nur
 * unterscheidbare Werte machen eine Vertauschung hier sichtbar.
 */
const FIXTURE = {
  id: "wlan-einsatz",
  label: "WLAN Einsatzstelle",
  icon: "📶",
  kind: "wifi",
  value: JSON.stringify({ ssid: "DRK-Einsatz", password: "geheim", encryption: "WPA" }),
  sort_order: 7,
  created_at: 1_700_000_000_123,
  updated_at: 1_700_000_555_456,
  created_by: "oidc-sub-alice",
  updated_by: "oidc-sub-bob",
};

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  // getModuleDb cacht pro Modul-Key in globalThis — ohne Leeren schriebe der
  // zweite Test in die gelöschte Datei des ersten weiter.
  (globalThis as Record<string, unknown>).__suiteDb = undefined;
});

describe("qr-Import", () => {
  it("überträgt eine Zeile feldtreu", async () => {
    makeSource([FIXTURE]);
    const { runQrImport } = await import("../../scripts/import/qr");
    const report = runQrImport(SOURCE);
    expect(report.ok).toBe(true);
    expect(report.sourceCount).toBe(1);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const row = db.prepare("SELECT * FROM presets WHERE id = ?").get("wlan-einsatz") as Record<
      string,
      unknown
    >;
    db.close();

    expect(row.label).toBe("WLAN Einsatzstelle");
    expect(row.icon).toBe("📶");
    expect(row.kind).toBe("wifi");
    expect(row.sort_order).toBe(7);
    expect(row.created_by).toBe("oidc-sub-alice");
    expect(row.updated_by).toBe("oidc-sub-bob");
  });

  it("erhält die Millisekunden-Auflösung der Zeitstempel", async () => {
    // Die Altdaten sind Date.now(), also Millisekunden. Ein Drizzle-Schema mit
    // `timestamp` statt `timestamp_ms` würde hier auf Sekunden runden und die
    // .123/.456 verlieren — der Import wäre lautlos ungenau.
    makeSource([FIXTURE]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const row = db.prepare("SELECT created_at, updated_at FROM presets").get() as {
      created_at: number;
      updated_at: number;
    };
    db.close();
    expect(row.created_at).toBe(1_700_000_000_123);
    expect(row.updated_at).toBe(1_700_000_555_456);
  });

  it("lässt value als JSON-String unangetastet — auch bei kind='url'", async () => {
    // easy-qr speichert value doppelt kodiert: bei kind='url' steht in der
    // Spalte "\"https://…\"" MIT Anführungszeichen. Ein Import, der hier parst
    // und neu serialisiert, oder gar den rohen Wert schreibt, erzeugt einen Mix
    // aus beidem — und die App liest ihn mit JSON.parse.
    const raw = JSON.stringify("https://www.drk.de");
    makeSource([{ ...FIXTURE, id: "demo-url", kind: "url", value: raw }]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const row = db.prepare("SELECT value FROM presets WHERE id = ?").get("demo-url") as {
      value: string;
    };
    db.close();
    expect(row.value).toBe(raw);
    expect(JSON.parse(row.value)).toBe("https://www.drk.de");
  });

  it("reicht value byte-genau durch, auch wenn es nicht kanonisch ist", async () => {
    // Der Test daneben deckte das nicht ab: sein Fixture ist kanonisches JSON,
    // und darauf ist parse→stringify idempotent. Ein Import, der value parst und
    // neu serialisiert, blieb damit unbemerkt. Nicht-kanonische Eingabe
    // (Whitespace, abweichende Schlüsselreihenfolge) macht den Unterschied
    // sichtbar — und die Zusage lautet „unangetastet", nicht „wertgleich".
    const raw = '{ "encryption":"WPA",  "ssid": "A",\n"password":"b" }';
    makeSource([{ ...FIXTURE, id: "nicht-kanonisch", value: raw }]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const row = db.prepare("SELECT value FROM presets WHERE id = ?").get("nicht-kanonisch") as {
      value: string;
    };
    db.close();
    expect(row.value).toBe(raw);
  });

  it("übernimmt Änderungen der Quelle beim erneuten Import", async () => {
    // Der Idempotenz-Test daneben importiert zweimal dasselbe und bliebe auch
    // mit onConflictDoNothing grün. Genau der Fall tritt beim Cutover aber ein:
    // erst ein Probe-Import, später der echte — dazwischen kann im Alt-System
    // noch gearbeitet worden sein. Ein Insert-ignore verschluckte das lautlos.
    makeSource([FIXTURE]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);

    const src = new Database(SOURCE);
    src.prepare("UPDATE presets SET label = ?, updated_at = ? WHERE id = ?").run(
      "WLAN Einsatzstelle (neu)",
      1_800_000_000_999,
      "wlan-einsatz",
    );
    src.close();

    const report = runQrImport(SOURCE);
    expect(report.ok).toBe(true);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const row = db.prepare("SELECT label, updated_at FROM presets").get() as {
      label: string;
      updated_at: number;
    };
    db.close();
    expect(row.label).toBe("WLAN Einsatzstelle (neu)");
    expect(row.updated_at).toBe(1_800_000_000_999);
  });

  it("erhält Slug-IDs 1:1 — sie sind zugleich URL-Segment", async () => {
    makeSource([
      { ...FIXTURE, id: "erste-hilfe" },
      { ...FIXTURE, id: "erste-hilfe-2" },
    ]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const ids = db.prepare("SELECT id FROM presets ORDER BY id").all() as { id: string }[];
    db.close();
    expect(ids.map((r) => r.id)).toEqual(["erste-hilfe", "erste-hilfe-2"]);
  });

  it("nimmt fehlendes icon als NULL statt als leeren String", async () => {
    makeSource([{ ...FIXTURE, icon: null }]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const row = db.prepare("SELECT icon FROM presets").get() as { icon: string | null };
    db.close();
    expect(row.icon).toBeNull();
  });

  it("ist idempotent: zweimal importieren ändert nichts", async () => {
    makeSource([FIXTURE, { ...FIXTURE, id: "zweites" }]);
    const { runQrImport } = await import("../../scripts/import/qr");
    runQrImport(SOURCE);
    const second = runQrImport(SOURCE);
    expect(second.ok).toBe(true);

    const db = new Database(`${DIR}/qr.db`, { readonly: true });
    const count = db.prepare("SELECT count(*) AS n FROM presets").get() as { n: number };
    db.close();
    expect(count.n).toBe(2);
  });

  it("überträgt mehrere Zeilen vollständig", async () => {
    makeSource([
      { ...FIXTURE, id: "a", sort_order: 0 },
      { ...FIXTURE, id: "b", sort_order: 1 },
      { ...FIXTURE, id: "c", sort_order: 2 },
    ]);
    const { runQrImport } = await import("../../scripts/import/qr");
    const report = runQrImport(SOURCE);
    expect(report.sourceCount).toBe(3);
    expect(report.targetCount).toBe(3);
    expect(report.missingInTarget).toEqual([]);
    expect(report.missingInSource).toEqual([]);
  });

  it("leere Quelle ist kein Fehler, schreibt aber auch nichts", async () => {
    makeSource([]);
    const { runQrImport } = await import("../../scripts/import/qr");
    const report = runQrImport(SOURCE);
    expect(report.ok).toBe(true);
    expect(report.sourceCount).toBe(0);
  });

  it("bricht ab, wenn die Quelldatei keine presets-Tabelle hat", async () => {
    // Schutz gegen den naheliegenden Bedienfehler: falsche .db-Datei erwischt.
    new Database(SOURCE).close();
    const { runQrImport } = await import("../../scripts/import/qr");
    expect(() => runQrImport(SOURCE)).toThrow(/presets/i);
  });
});
