import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";

const ORDNER = "src/app/m/files/_db/migrations";

/**
 * Gegen eine temporäre DATEI-DB, nicht `:memory:` — der Boot legt `files.db`
 * als Datei an, und nur der Dateiweg belegt, dass `migrate()` auf einer frisch
 * angelegten Datei durchläuft (Vorbild: `core/bootstrap.test.ts`).
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "files-migrations-"));
  sqlite = new Database(join(tmp, "files.db"));
  // `foreign_keys` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmäßig
  // AUS (§4.9). Ohne diese Zeile wären alle FK-Zusagen unten grün, ohne zu gelten.
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

type SpalteInfo = { name: string; notnull: number; dflt_value: string | null };
type IndexInfo = { name: string; unique: number; origin: string };

const spalten = (tabelle: string) =>
  sqlite.prepare(`PRAGMA table_info(${tabelle})`).all() as SpalteInfo[];

/** Nur die selbst angelegten Indizes — PK-/UNIQUE-Autoindizes zählen nicht. */
const eigeneIndizes = (tabelle: string) =>
  (sqlite.prepare(`PRAGMA index_list(${tabelle})`).all() as IndexInfo[])
    .filter((i) => i.origin === "c")
    .map((i) => i.name)
    .sort();

// notnull/dflt_value je Spalte aus §4.2-§4.8. `dflt` ist der ROHE SQL-Default:
// wo die Spec „DEFAULT 0" schreibt, steht hier "0"; wo sie es NICHT schreibt,
// steht null — insbesondere bei `shares.created_at` ($defaultFn ist Drizzle-
// seitig, das SQL trägt dort keinen Default) und bei beiden `av_status`
// (der Startwert `scanning` gehört an die Einfügestelle, nicht ins DDL).
const TABELLEN: Record<string, { name: string; notnull: 0 | 1; dflt: string | null }[]> = {
  shares: [
    { name: "id", notnull: 1, dflt: null },
    { name: "title", notnull: 1, dflt: null },
    { name: "description", notnull: 0, dflt: null },
    { name: "type", notnull: 1, dflt: null },
    { name: "expires_at", notnull: 1, dflt: null },
    { name: "max_downloads", notnull: 0, dflt: null },
    { name: "download_count", notnull: 1, dflt: "0" },
    { name: "password_hash", notnull: 0, dflt: null },
    { name: "total_size", notnull: 1, dflt: "0" },
    { name: "created_at", notnull: 1, dflt: null },
    { name: "created_by", notnull: 1, dflt: null },
  ],
  share_files: [
    { name: "id", notnull: 1, dflt: null },
    { name: "share_id", notnull: 1, dflt: null },
    { name: "filename", notnull: 1, dflt: null },
    { name: "mime_type", notnull: 1, dflt: null },
    { name: "size", notnull: 1, dflt: null },
    { name: "created_at", notnull: 1, dflt: null },
    { name: "bytes_vollstaendig_at", notnull: 0, dflt: null },
    { name: "av_status", notnull: 1, dflt: null },
    { name: "av_geprueft_at", notnull: 0, dflt: null },
  ],
  download_logs: [
    { name: "id", notnull: 1, dflt: null },
    { name: "share_id", notnull: 1, dflt: null },
    // NULL trägt hier Bedeutung: „ZIP des ganzen Shares" (§4.5, Magic Value).
    { name: "file_id", notnull: 0, dflt: null },
    { name: "client_ip_unbestaetigt", notnull: 0, dflt: null },
    { name: "user_agent", notnull: 0, dflt: null },
    { name: "downloaded_at", notnull: 1, dflt: null },
  ],
  inbox_files: [
    { name: "id", notnull: 1, dflt: null },
    { name: "token_id", notnull: 0, dflt: null },
    { name: "dateiname", notnull: 1, dflt: null },
    { name: "kategorie", notnull: 0, dflt: null },
    { name: "hinweis", notnull: 0, dflt: null },
    // nullable: für den Altbestand von `drop` gibt es keinen MIME-Wert (§4.6).
    { name: "mime_type", notnull: 0, dflt: null },
    { name: "size", notnull: 1, dflt: null },
    { name: "client_ip_unbestaetigt", notnull: 0, dflt: null },
    { name: "empfangen_at", notnull: 1, dflt: null },
    { name: "bytes_vollstaendig_at", notnull: 0, dflt: null },
    { name: "av_status", notnull: 1, dflt: null },
    { name: "av_geprueft_at", notnull: 0, dflt: null },
  ],
  zugangslinks: [
    { name: "id", notnull: 1, dflt: null },
    { name: "name", notnull: 1, dflt: null },
    { name: "token_start", notnull: 1, dflt: null },
    { name: "token_hash", notnull: 1, dflt: null },
    { name: "created_at", notnull: 1, dflt: null },
    { name: "created_by", notnull: 1, dflt: null },
    { name: "expires_at", notnull: 1, dflt: null },
    { name: "revoked_at", notnull: 0, dflt: null },
    { name: "budget_dateien", notnull: 1, dflt: null },
    { name: "budget_bytes", notnull: 1, dflt: null },
    { name: "verbraucht_dateien", notnull: 1, dflt: "0" },
    { name: "verbraucht_bytes", notnull: 1, dflt: "0" },
  ],
  aufraeum_laeufe: [
    { name: "id", notnull: 1, dflt: null },
    { name: "gestartet_at", notnull: 1, dflt: null },
    // NULL = Lauf abgebrochen (Prozess weg) — daran ist ein Absturz mitten im
    // Lauf erkennbar (§4.8). Ein NOT NULL hier nähme genau diese Aussage.
    { name: "beendet_at", notnull: 0, dflt: null },
    { name: "trockenlauf", notnull: 1, dflt: null },
    { name: "shares_geloescht", notnull: 1, dflt: "0" },
    { name: "dateien_geloescht", notnull: 1, dflt: "0" },
    { name: "bytes_geloescht", notnull: 1, dflt: "0" },
    { name: "logzeilen_geloescht", notnull: 1, dflt: "0" },
    { name: "inbox_geloescht", notnull: 1, dflt: "0" },
    { name: "parts_geloescht", notnull: 1, dflt: "0" },
    { name: "verwaiste_blobs_gemeldet", notnull: 1, dflt: "0" },
    { name: "fehler", notnull: 0, dflt: null },
  ],
};

// §4.9 wörtlich. `aufraeum_laeufe` steht mit der LEEREN Liste da, weil die Spec
// das ausdrücklich entscheidet („damit sie nicht als Vergessen gelesen wird").
const INDIZES: Record<string, string[]> = {
  shares: ["idx_shares_created", "idx_shares_expires"],
  share_files: ["idx_share_files_av", "idx_share_files_share"],
  download_logs: ["idx_logs_share_time", "idx_logs_time"],
  inbox_files: ["idx_inbox_av", "idx_inbox_empfangen", "idx_inbox_token"],
  zugangslinks: ["idx_zugangslinks_hash"],
  aufraeum_laeufe: [],
};

const AV_WERTE = ["scanning", "clean", "infected", "error", "unscanned"];

/** Legt einen Share an und liefert seine ID — ohne Drizzle, roh. */
function shareAnlegen(id: string, type = "file"): string {
  sqlite
    .prepare(
      `INSERT INTO shares (id, title, type, expires_at, created_at, created_by)
       VALUES (?, 'T', ?, 0, 0, 'u')`,
    )
    .run(id, type);
  return id;
}

describe("files-Migration: die sechs Tabellen aus §4", () => {
  it("legt genau diese sechs Tabellen an und keine siebte", () => {
    // Mengengleichheit, nicht sechs `toContain`: eine siebte Tabelle wäre eine
    // Zusage, die in der Spec nicht steht — und der Spec-2-Import müsste sie
    // füllen, ohne dass jemand sie ihm genannt hat.
    const namen = (
      sqlite
        .prepare(
          `SELECT name FROM sqlite_master
             WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'`,
        )
        .all() as { name: string }[]
    )
      .map((r) => r.name)
      .sort();
    expect(namen).toEqual(Object.keys(TABELLEN).sort());
  });

  for (const [tabelle, erwartet] of Object.entries(TABELLEN)) {
    it(`${tabelle}: Spaltennamen in der Reihenfolge aus der Spec`, () => {
      expect(spalten(tabelle).map((s) => s.name)).toEqual(erwartet.map((s) => s.name));
    });

    it(`${tabelle}: notnull und SQL-Default je Spalte`, () => {
      const ist = new Map(spalten(tabelle).map((s) => [s.name, s]));
      for (const soll of erwartet) {
        const s = ist.get(soll.name);
        expect(s, `${tabelle}.${soll.name} fehlt`).toBeDefined();
        expect(s!.notnull, `${tabelle}.${soll.name}: notnull`).toBe(soll.notnull);
        expect(s!.dflt_value, `${tabelle}.${soll.name}: dflt_value`).toBe(soll.dflt);
      }
    });
  }
});

describe("files-Migration: Indizes (§4.9)", () => {
  for (const [tabelle, erwartet] of Object.entries(INDIZES)) {
    it(`${tabelle}: genau ${erwartet.length} eigene Indizes`, () => {
      expect(eigeneIndizes(tabelle)).toEqual([...erwartet].sort());
    });
  }

  it("idx_zugangslinks_hash ist UNIQUE, nicht nur vorhanden", () => {
    const idx = (
      sqlite.prepare("PRAGMA index_list(zugangslinks)").all() as IndexInfo[]
    ).find((i) => i.name === "idx_zugangslinks_hash");
    expect(idx?.unique).toBe(1);
  });

  it("derselbe token_hash lässt sich nicht zweimal einfügen", () => {
    const einfuegen = (id: string) =>
      sqlite
        .prepare(
          `INSERT INTO zugangslinks
             (id, name, token_start, token_hash, created_at, created_by, expires_at,
              budget_dateien, budget_bytes)
           VALUES (?, 'Übung', 'dz-2345', 'HASH-A', 0, 'u', 0, 10, 100)`,
        )
        .run(id);
    einfuegen("zl-uniq-1");
    expect(() => einfuegen("zl-uniq-2")).toThrow();
  });
});

describe("files-Migration: die AV-CHECKs tragen alle FÜNF Werte", () => {
  // Ein CHECK ohne `unscanned` bricht den Spec-2-Import (Analyse E18) — das ist
  // der Wert, mit dem der Altbestand einläuft (§6.2).
  it.each(AV_WERTE)("share_files.av_status akzeptiert '%s'", (wert) => {
    const s = shareAnlegen(`sh-av-${wert}`);
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO share_files (id, share_id, filename, mime_type, size, created_at, av_status)
           VALUES (?, ?, 'a.txt', 'text/plain', 1, 0, ?)`,
        )
        .run(`sf-av-${wert}`, s, wert),
    ).not.toThrow();
  });

  it("share_files.av_status weist einen unbekannten Wert ab", () => {
    const s = shareAnlegen("sh-av-bogus");
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO share_files (id, share_id, filename, mime_type, size, created_at, av_status)
           VALUES ('sf-av-bogus', ?, 'a.txt', 'text/plain', 1, 0, 'bogus')`,
        )
        .run(s),
    ).toThrow();
  });

  it.each(AV_WERTE)("inbox_files.av_status akzeptiert '%s'", (wert) => {
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO inbox_files (id, dateiname, size, empfangen_at, av_status)
           VALUES (?, 'a.txt', 1, 0, ?)`,
        )
        .run(`if-av-${wert}`, wert),
    ).not.toThrow();
  });

  it("inbox_files.av_status weist einen unbekannten Wert ab", () => {
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO inbox_files (id, dateiname, size, empfangen_at, av_status)
           VALUES ('if-av-bogus', 'a.txt', 1, 0, 'bogus')`,
        )
        .run(),
    ).toThrow();
  });
});

describe("files-Migration: kein CHECK auf shares.type (§4.1)", () => {
  // Ein Enum hier kann an Altdaten scheitern; der Wertebereich "file"|"folder"
  // lebt im TypeScript-Typ. Der Test hält fest, dass das SQL ihn NICHT kennt.
  it("nimmt einen Typ außerhalb von file/folder an", () => {
    expect(() => shareAnlegen("sh-type-frei", "irgendwas-aus-dem-import")).not.toThrow();
  });
});

describe("files-Migration: die Fremdschlüssel-Zusagen", () => {
  it("share_files hängt kaskadierend am Share (§4.3)", () => {
    const s = shareAnlegen("sh-cascade");
    sqlite
      .prepare(
        `INSERT INTO share_files (id, share_id, filename, mime_type, size, created_at, av_status)
         VALUES ('sf-cascade', ?, 'a.txt', 'text/plain', 1, 0, 'clean')`,
      )
      .run(s);
    sqlite.prepare("DELETE FROM shares WHERE id = ?").run(s);
    const rest = sqlite
      .prepare("SELECT COUNT(*) AS c FROM share_files WHERE share_id = ?")
      .get(s) as { c: number };
    expect(rest.c).toBe(0);
  });

  it("download_logs überlebt seinen Share — KEIN Cascade (§4.5)", () => {
    // Ein Log, das mit dem Share stirbt, ist kein Audit-Log: es verschwindet
    // genau dann, wenn man es braucht (Analyse E12 b).
    const s = shareAnlegen("sh-log");
    sqlite
      .prepare(
        `INSERT INTO download_logs (share_id, file_id, downloaded_at) VALUES (?, NULL, 0)`,
      )
      .run(s);
    sqlite.prepare("DELETE FROM shares WHERE id = ?").run(s);
    const rest = sqlite
      .prepare("SELECT COUNT(*) AS c FROM download_logs WHERE share_id = ?")
      .get(s) as { c: number };
    expect(rest.c).toBe(1);
  });

  it("inbox_files.token_id verweist auf zugangslinks und kaskadiert NICHT (§4.6)", () => {
    sqlite
      .prepare(
        `INSERT INTO zugangslinks
           (id, name, token_start, token_hash, created_at, created_by, expires_at,
            budget_dateien, budget_bytes)
         VALUES ('zl-fk', 'Übung', 'dz-2345', 'HASH-FK', 0, 'u', 0, 10, 100)`,
      )
      .run();
    // (a) ein unbekanntes Token wird abgewiesen — der FK gilt wirklich
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO inbox_files (id, token_id, dateiname, size, empfangen_at, av_status)
           VALUES ('if-fk-bad', 'gibt-es-nicht', 'a.txt', 1, 0, 'clean')`,
        )
        .run(),
    ).toThrow();
    // (b) mit gültigem Token geht es, und das Löschen des Links scheitert
    sqlite
      .prepare(
        `INSERT INTO inbox_files (id, token_id, dateiname, size, empfangen_at, av_status)
         VALUES ('if-fk-ok', 'zl-fk', 'a.txt', 1, 0, 'clean')`,
      )
      .run();
    expect(() => sqlite.prepare("DELETE FROM zugangslinks WHERE id = 'zl-fk'").run()).toThrow();
    const rest = sqlite
      .prepare("SELECT COUNT(*) AS c FROM inbox_files WHERE id = 'if-fk-ok'")
      .get() as { c: number };
    expect(rest.c).toBe(1);
  });
});

describe("files-Migration: Zeitstempel sind Unix-SEKUNDEN (Faktor-1000-Wächter)", () => {
  /*
   * Der Wächter muss ROH lesen. Über eine Drizzle-Auswahl käme ein
   * timestamp/timestamp_ms-Verwechsler zurückgerechnet an und der Rundlauf
   * wäre grün, während die Spalte dreizehnstellig ist — genau der
   * paritätsgrüne Fehler aus §4.1 (`qr/_db/schema.ts:19-20` benutzt
   * timestamp_ms, ein Copy-Paste von dort ist der wahrscheinlichste Weg
   * hinein). Symptom in Produktion: nie läuft ein Share ab, oder alles ist
   * sofort abgelaufen.
   *
   * UND ER MUSS JEDE SPALTE EINZELN TREFFEN. Eine frühere Fassung prüfte sechs
   * der vierzehn Zeitstempelspalten; die acht übrigen ließen sich einzeln auf
   * `timestamp_ms` kippen, ohne dass ein Test fiel (nachgemessen). Der reale
   * Fehler ist aber genau die EINZELNE verwechselte Spalte — ein Copy-Paste
   * einer Zeile, nicht des ganzen Schemas. Zwei der Löcher tragen Prädikate:
   * `share_files.created_at` ist die Bedingung, an der unvollständige Uploads
   * samt `.part`-Datei aufgeräumt werden (§4.4 — in Millisekunden nie wahr,
   * also nie aufgeräumt), `download_logs.downloaded_at` trägt
   * FILES_LOG_AUFBEWAHRUNG_TAGE (§4.5) und die Sortierung des Audit-Logs (§7.8).
   */
  const datum = new Date("2026-07-30T12:00:00.000Z");
  const sekunden = Math.floor(datum.getTime() / 1000);

  // Alle Zeitstempelspalten in SQL-Schreibweise — auch die nullable, denn ein
  // Verwechsler dort ist genauso still.
  const ZEIT_SPALTEN: Record<string, string[]> = {
    shares: ["expires_at", "created_at"],
    share_files: ["created_at", "bytes_vollstaendig_at", "av_geprueft_at"],
    download_logs: ["downloaded_at"],
    inbox_files: ["empfangen_at", "bytes_vollstaendig_at", "av_geprueft_at"],
    zugangslinks: ["created_at", "expires_at", "revoked_at"],
    aufraeum_laeufe: ["gestartet_at", "beendet_at"],
  };

  // Die WHERE-Bedingung, die die eine Probezeile je Tabelle roh wiederfindet.
  // Auch die autoincrement-IDs sind festgenagelt: mit `LIMIT 1` hinge das
  // Ergebnis daran, welcher andere Test vorher in dieselbe Tabelle geschrieben hat.
  const WO: Record<string, string> = {
    shares: "id = 'sh-zeit'",
    share_files: "id = 'sf-zeit'",
    download_logs: "id = 9001",
    inbox_files: "id = 'if-zeit'",
    zugangslinks: "id = 'zl-zeit'",
    aufraeum_laeufe: "id = 9001",
  };

  const PAARE = Object.entries(ZEIT_SPALTEN).flatMap(([tabelle, spalten]) =>
    spalten.map((spalte) => [tabelle, spalte] as const),
  );

  // Je Tabelle EIN Insert über Drizzle, das JEDE Zeitstempelspalte mit demselben
  // `datum` belegt. Nur so trägt jede Spalte einen Wert, der gegen `sekunden`
  // prüfbar ist; eine vergessene nullable Spalte fällt als `null !== sekunden` auf.
  beforeAll(() => {
    db.insert(schema.shares)
      .values({
        id: "sh-zeit",
        title: "Zeitprobe",
        type: "file",
        expiresAt: datum,
        createdAt: datum,
        createdBy: "u",
      })
      .run();
    db.insert(schema.shareFiles)
      .values({
        id: "sf-zeit",
        shareId: "sh-zeit",
        filename: "a.txt",
        mimeType: "text/plain",
        size: 1,
        createdAt: datum,
        bytesVollstaendigAt: datum,
        avStatus: "clean",
        avGeprueftAt: datum,
      })
      .run();
    db.insert(schema.downloadLogs)
      .values({ id: 9001, shareId: "sh-zeit", fileId: "sf-zeit", downloadedAt: datum })
      .run();
    db.insert(schema.inboxFiles)
      .values({
        id: "if-zeit",
        dateiname: "a.txt",
        size: 1,
        empfangenAt: datum,
        bytesVollstaendigAt: datum,
        avStatus: "clean",
        avGeprueftAt: datum,
      })
      .run();
    db.insert(schema.zugangslinks)
      .values({
        id: "zl-zeit",
        name: "Übung Nord",
        tokenStart: "dz-2345",
        tokenHash: "HASH-ZEIT",
        createdAt: datum,
        createdBy: "u",
        expiresAt: datum,
        revokedAt: datum,
        budgetDateien: 10,
        budgetBytes: 100,
      })
      .run();
    db.insert(schema.aufraeumLaeufe)
      .values({ id: 9001, gestartetAt: datum, beendetAt: datum, trockenlauf: true })
      .run();
  });

  it("der Wächter kennt JEDE Zeitstempelspalte des Schemas", () => {
    // Entdeckt wird über `columnType`, nicht über `mode`: "SQLiteTimestamp" ist
    // für `timestamp` UND `timestamp_ms` derselbe Wert (nachgemessen). Die
    // Entdeckung ist damit blind gegen genau den Fehler, den sie einsammeln
    // soll — eine gekippte Spalte kann sich nicht aus der Liste herausmogeln.
    // Und eine NEUE Zeitstempelspalte ohne Eintrag in ZEIT_SPALTEN lässt
    // diesen Test fallen, statt still unbewacht zu bleiben.
    const gefunden: string[] = [];
    for (const wert of Object.values(schema)) {
      if (!is(wert, SQLiteTable)) continue;
      for (const spalte of Object.values(getTableColumns(wert))) {
        if (spalte.columnType === "SQLiteTimestamp") {
          gefunden.push(`${getTableName(wert)}.${spalte.name}`);
        }
      }
    }
    const bewacht = PAARE.map(([tabelle, spalte]) => `${tabelle}.${spalte}`);
    expect(gefunden.sort()).toEqual([...bewacht].sort());
  });

  it.each(PAARE)("%s.%s steht zehnstellig in Sekunden in der Spalte", (tabelle, spalte) => {
    const roh = sqlite
      .prepare(`SELECT ${spalte} AS v FROM ${tabelle} WHERE ${WO[tabelle]}`)
      .get() as { v: number | null };
    expect(roh.v, `${tabelle}.${spalte}`).toBe(sekunden);
    // Die lesbare Hälfte derselben Aussage: zehnstellig, nicht dreizehnstellig.
    expect(String(roh.v).length, `${tabelle}.${spalte}: zehnstellig`).toBe(10);
    expect(roh.v, `${tabelle}.${spalte}`).toBeLessThan(1e11);
  });

  it("aufraeum_laeufe.trockenlauf ist ein 0/1-Integer, kein Text", () => {
    const l = sqlite
      .prepare("SELECT trockenlauf AS t FROM aufraeum_laeufe WHERE id = 9001")
      .get() as { t: number };
    expect(l.t).toBe(1);
  });

  it("shares.created_at kommt aus $defaultFn, wenn es nicht mitgegeben wird", () => {
    const vorher = Math.floor(Date.now() / 1000);
    db.insert(schema.shares)
      .values({
        id: "sh-defaultfn",
        title: "Ohne created_at",
        type: "file",
        expiresAt: datum,
        createdBy: "u",
      })
      .run();
    const roh = sqlite
      .prepare("SELECT created_at AS c FROM shares WHERE id='sh-defaultfn'")
      .get() as { c: number };
    expect(roh.c).toBeGreaterThanOrEqual(vorher);
    expect(String(roh.c).length).toBe(10);
  });
});
