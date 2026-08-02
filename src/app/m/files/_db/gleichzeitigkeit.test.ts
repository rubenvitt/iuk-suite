import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openModuleDatabase } from "@/core/db";
import * as schema from "./schema";
import { protokolliereDownload, verbucheAbgabe, zaehleDownload } from "./zaehler";

/*
 * WARUM DIESE DATEI ECHTE PROZESSE STARTET (Analyse Falle 25).
 *
 * better-sqlite3 ist SYNCHRON. Ein `Promise.all` über N Aufrufe in EINEM
 * Prozess läuft deshalb strikt hintereinander — kein `await` liegt zwischen
 * einem gelesenen Wert und dem darauf gebauten `UPDATE`, also kann sich die
 * Lücke nicht öffnen. Eine „vorher lesen, dann bedingungslos schreiben"-Fassung
 * ist gegen einen solchen Test IMMER grün, und die atomare SQL-Variante daneben
 * lässt den JS-Teil unverdächtig aussehen.
 *
 * Also: N echte Node-Prozesse, jeder mit einer EIGENEN Verbindung auf dieselbe
 * Datei-DB, freigegeben durch eine gemeinsame Startdatei. Die Prozesse rufen die
 * ECHTE Funktion aus `zaehler.ts` — nicht ihr SQL nachgebaut, sonst belegt der
 * Test das Produkt nicht.
 *
 * Beide Seiten öffnen mit `openModuleDatabase` (WAL, `busy_timeout = 5000`,
 * `foreign_keys = ON`) — also mit der PRODUKTIONS-Konfiguration. Eine nackte
 * `new Database(pfad)` hätte `journal_mode = delete` und `busy_timeout = 0`; bei
 * acht Schreibern kämen geworfene SQLITE_BUSY heraus statt serialisierter
 * Schreibvorgänge, und der Test wäre aus einem Harness-Grund rot, der wie ein
 * Fehler in der Implementierung aussieht.
 */

const REPO = process.cwd();
const KERN_DB = resolve(REPO, "src/core/db/index.ts");
const SCHEMA = resolve(REPO, "src/app/m/files/_db/schema.ts");
const ZAEHLER = resolve(REPO, "src/app/m/files/_db/zaehler.ts");
const MIGRATIONEN = "src/app/m/files/_db/migrations";

/** So viele Prozesse treten gleichzeitig an. */
const PARALLEL = 8;

/*
 * Das Kind bekommt seine Parameter über die UMGEBUNG, nicht über `process.argv`:
 * bei `node -e` ist die Bedeutung von `argv[1]` uneindeutig, und ein um eins
 * verschobener Index wäre ein stiller Fehlschlag im Testgerüst.
 *
 * Der Ablauf ist eine Barriere in zwei Takten: das Kind meldet mit `R`, dass
 * Verbindung UND Funktion stehen (tsx-Start und Modulladen liegen also VOR dem
 * Startschuss), und dreht dann auf der Startdatei. Ohne diese Barriere hinge die
 * Überlappung an der Startzeit von acht tsx-Prozessen — der Test wäre
 * rennabhängig grün.
 */
const KIND = `
import { existsSync } from "node:fs";
const { openModuleDatabase } = await import(process.env.KIND_KERN);
const { drizzle } = await import("drizzle-orm/better-sqlite3");
const schema = await import(process.env.KIND_SCHEMA);
const { zaehleDownload, verbucheAbgabe } = await import(process.env.KIND_ZAEHLER);
const sqlite = openModuleDatabase(process.env.KIND_DB);
const db = drizzle(sqlite, { schema });
process.stdout.write("R");
while (!existsSync(process.env.KIND_START)) {}
const darf =
  process.env.KIND_ART === "download"
    ? zaehleDownload(db, process.env.KIND_ID)
    : verbucheAbgabe(db, process.env.KIND_ID, Number(process.env.KIND_BYTES));
sqlite.close();
process.stdout.write(darf ? "=1" : "=0");
`;

type Kind = { proc: ChildProcess; aus: string; fehler: string; ende: Promise<number> };

let tmp: string;
let dbPfad: string;
let sqlite: ReturnType<typeof openModuleDatabase>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "files-gleichzeitigkeit-"));
  dbPfad = join(tmp, "files.db");
  sqlite = openModuleDatabase(dbPfad);
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  // Räumt WAL- und SHM-Datei mit ab; der Ordner ist die Klammer um alle drei.
  rmSync(tmp, { recursive: true, force: true });
});

function starteKind(art: "download" | "abgabe", id: string, bytes: number, start: string): Kind {
  const proc = spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", KIND],
    {
      // `cwd` wird GESETZT, nicht geerbt: nur von der Repo-Wurzel aus findet tsx
      // die `tsconfig.json` und löst damit das `@/…`-Alias auf, das `zaehler.ts`
      // für `clientIpAus` benutzt.
      cwd: REPO,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        KIND_KERN: KERN_DB,
        KIND_SCHEMA: SCHEMA,
        KIND_ZAEHLER: ZAEHLER,
        KIND_DB: dbPfad,
        KIND_START: start,
        KIND_ART: art,
        KIND_ID: id,
        KIND_BYTES: String(bytes),
      },
    },
  );
  const kind: Kind = {
    proc,
    aus: "",
    fehler: "",
    ende: new Promise<number>((fertig) => proc.on("exit", (code) => fertig(code ?? -1))),
  };
  proc.stdout?.on("data", (d: Buffer) => (kind.aus += d.toString()));
  proc.stderr?.on("data", (d: Buffer) => (kind.fehler += d.toString()));
  return kind;
}

const kurzWarten = () => new Promise((w) => setTimeout(w, 10));

/**
 * Startet `PARALLEL` Prozesse, wartet bis ALLE bereit sind, gibt sie mit einer
 * Datei frei und liefert je Prozess die Entscheidung der Zählfunktion.
 */
async function gleichzeitig(
  art: "download" | "abgabe",
  id: string,
  bytes = 0,
  anzahl = PARALLEL,
): Promise<boolean[]> {
  const start = join(tmp, `start-${art}-${id}`);
  const kinder = Array.from({ length: anzahl }, () => starteKind(art, id, bytes, start));
  try {
    const frist = Date.now() + 45_000;
    while (!kinder.every((k) => k.aus.includes("R"))) {
      if (kinder.some((k) => k.proc.exitCode !== null)) {
        throw new Error(`Kind endete vor dem Startschuss: ${kinder.map((k) => k.fehler).join("")}`);
      }
      if (Date.now() > frist) throw new Error("Kinder wurden nicht bereit");
      await kurzWarten();
    }
    writeFileSync(start, "los");
    const codes = await Promise.all(kinder.map((k) => k.ende));
    codes.forEach((code, i) => {
      expect(code, `Kind ${i} endete mit ${code}: ${kinder[i].fehler}`).toBe(0);
    });
    return kinder.map((k, i) => {
      const treffer = /=([01])$/.exec(k.aus.trim());
      if (!treffer) throw new Error(`Kind ${i} lieferte kein Ergebnis: ${k.aus} ${k.fehler}`);
      return treffer[1] === "1";
    });
  } finally {
    for (const k of kinder) if (k.proc.exitCode === null) k.proc.kill("SIGKILL");
  }
}

function shareAnlegen(id: string, maxDownloads: number | null): void {
  db.insert(schema.shares)
    .values({
      id,
      title: "Lagebild",
      type: "file",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      maxDownloads,
      createdAt: new Date("2026-07-30T12:00:00Z"),
      createdBy: "u",
    })
    .run();
}

function linkAnlegen(id: string, budgetDateien: number, budgetBytes: number): void {
  db.insert(schema.zugangslinks)
    .values({
      id,
      name: "Übung Nord",
      tokenStart: `dz-${id.slice(-4)}`,
      tokenHash: `HASH-${id}`,
      createdAt: new Date("2026-07-30T12:00:00Z"),
      createdBy: "u",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      budgetDateien,
      budgetBytes,
    })
    .run();
}

/* Roh gelesen — nie über Drizzle, damit ein Rundlauf nichts glattbügelt. */
const zaehlerVon = (id: string) =>
  (
    sqlite.prepare("SELECT download_count AS c FROM shares WHERE id = ?").get(id) as {
      c: number;
    }
  ).c;

const verbrauchVon = (id: string) =>
  sqlite
    .prepare(
      "SELECT verbraucht_dateien AS dateien, verbraucht_bytes AS bytes FROM zugangslinks WHERE id = ?",
    )
    .get(id) as { dateien: number; bytes: number };

const logZeilen = (shareId: string) =>
  sqlite
    .prepare(
      "SELECT file_id AS fileId, client_ip_unbestaetigt AS ip, user_agent AS ua," +
        " downloaded_at AS zeit FROM download_logs WHERE share_id = ? ORDER BY id",
    )
    .all(shareId) as { fileId: string | null; ip: string | null; ua: string | null; zeit: number }[];

describe("Punkt 1: max_downloads hält gegen echte Parallelität", () => {
  it(
    `${PARALLEL} gleichzeitige Vorgänge gegen max_downloads = 1: genau EINE Freigabe`,
    async () => {
      shareAnlegen("sh-eins", 1);
      const ergebnisse = await gleichzeitig("download", "sh-eins");
      expect(ergebnisse.filter((e) => e).length, ergebnisse.join("")).toBe(1);
      expect(ergebnisse.filter((e) => !e).length).toBe(PARALLEL - 1);
      // Die Zahl in der Spalte ist die eigentliche Zusage: „Obergrenze", nicht
      // „etwa N". Eine Fassung, die vorher liest und dann bedingungslos
      // schreibt, steht hier auf PARALLEL.
      expect(zaehlerVon("sh-eins")).toBe(1);
    },
    60_000,
  );
});

describe("Punkt 2: dieselbe Zusage sequenziell, und der Sonderwert NULL", () => {
  it("drei Vorgänge bei max_downloads = 2 → darf, darf, gesperrt", () => {
    shareAnlegen("sh-zwei", 2);
    expect(zaehleDownload(db, "sh-zwei")).toBe(true);
    expect(zaehleDownload(db, "sh-zwei")).toBe(true);
    expect(zaehleDownload(db, "sh-zwei")).toBe(false);
    expect(zaehlerVon("sh-zwei")).toBe(2);
  });

  it("max_downloads = NULL ist UNBEGRENZT und zählt trotzdem mit", () => {
    // Ohne den `IS NULL`-Zweig wird aus `download_count < NULL` in SQLite NULL,
    // also nicht wahr: JEDER unbegrenzte Share wäre stumm nicht herunterladbar.
    // Das ist der teuerste denkbare Fehler dieser Funktion, weil er den
    // Normalfall trifft und wie „Limit erreicht" aussieht.
    shareAnlegen("sh-frei", null);
    expect(zaehleDownload(db, "sh-frei")).toBe(true);
    expect(zaehleDownload(db, "sh-frei")).toBe(true);
    expect(zaehleDownload(db, "sh-frei")).toBe(true);
    expect(zaehlerVon("sh-frei")).toBe(3);
  });

  it("max_downloads = 0 sperrt sofort — 0 ist nicht „unbegrenzt“", () => {
    // `maxDownloads || null` machte in der Alt-App aus „0 Downloads" still einen
    // UNBEGRENZTEN Share (§4.2). Hier ist 0 eine Zahl wie jede andere.
    shareAnlegen("sh-null", 0);
    expect(zaehleDownload(db, "sh-null")).toBe(false);
    expect(zaehlerVon("sh-null")).toBe(0);
  });

  it("ein unbekannter Share gibt nie frei", () => {
    expect(zaehleDownload(db, "gibt-es-nicht")).toBe(false);
  });
});

describe("Punkt 3: das Mengenbudget hält gegen echte Parallelität", () => {
  it(
    `${PARALLEL} gleichzeitige Abgaben gegen budget_dateien = 1: EINE Annahme`,
    async () => {
      linkAnlegen("zl-eins", 1, 1_000_000);
      const ergebnisse = await gleichzeitig("abgabe", "zl-eins", 100);
      expect(ergebnisse.filter((e) => e).length, ergebnisse.join("")).toBe(1);
      expect(ergebnisse.filter((e) => !e).length).toBe(PARALLEL - 1);
      const v = verbrauchVon("zl-eins");
      expect(v.dateien).toBe(1);
      // Die Bytes dürfen nur für die EINE angenommene Abgabe gewachsen sein —
      // sonst wären N−1 abgelehnte Abgaben trotzdem vom Budget abgezogen.
      expect(v.bytes).toBe(100);
    },
    60_000,
  );
});

describe("Punkt 4: budget_bytes an seinen beiden Rändern", () => {
  it("eine Abgabe, die das Restbudget genau ausfüllt, wird ANGENOMMEN", () => {
    // Der Gegenpol zum Byte darüber: ohne ihn ist `<=` von `<` nicht zu
    // unterscheiden, und die Grenze läge still um ein Byte falsch.
    linkAnlegen("zl-exakt", 10, 1000);
    expect(verbucheAbgabe(db, "zl-exakt", 1000)).toBe(true);
    expect(verbrauchVon("zl-exakt")).toEqual({ dateien: 1, bytes: 1000 });
  });

  it("eine Abgabe, die das Restbudget um EIN Byte überschreitet, wird abgelehnt", () => {
    linkAnlegen("zl-drueber", 10, 1000);
    expect(verbucheAbgabe(db, "zl-drueber", 600)).toBe(true);
    expect(verbucheAbgabe(db, "zl-drueber", 401)).toBe(false);
    // Eine Ablehnung verbraucht NICHTS — weder Datei noch Byte.
    expect(verbrauchVon("zl-drueber")).toEqual({ dateien: 1, bytes: 600 });
    expect(verbucheAbgabe(db, "zl-drueber", 400)).toBe(true);
    expect(verbrauchVon("zl-drueber")).toEqual({ dateien: 2, bytes: 1000 });
  });

  it("die letzte freie Datei wird angenommen, die nächste abgelehnt", () => {
    linkAnlegen("zl-dateien", 2, 1_000_000);
    expect(verbucheAbgabe(db, "zl-dateien", 1)).toBe(true);
    expect(verbucheAbgabe(db, "zl-dateien", 1)).toBe(true);
    expect(verbucheAbgabe(db, "zl-dateien", 1)).toBe(false);
    expect(verbrauchVon("zl-dateien")).toEqual({ dateien: 2, bytes: 2 });
  });

  it("ein unbekanntes Token nimmt nichts an", () => {
    expect(verbucheAbgabe(db, "zl-gibt-es-nicht", 1)).toBe(false);
  });

  it("eine negative Bytezahl wird abgewiesen, statt Budget zurückzugeben", () => {
    // `verbraucht_bytes + (−n)` wäre eine Rückerstattung: ein Aufrufer mit einer
    // kaputten Größenmessung könnte das Budget beliebig oft auffüllen.
    linkAnlegen("zl-negativ", 10, 1000);
    expect(() => verbucheAbgabe(db, "zl-negativ", -100)).toThrow();
    expect(verbrauchVon("zl-negativ")).toEqual({ dateien: 0, bytes: 0 });
  });
});

describe("Punkt 5: ein ZIP ist genau EIN Download", () => {
  /*
   * Die andere Hälfte dieser Zusage — „die Zählfunktion wird je ZIP EINMAL
   * gerufen, egal wie viele Dateien im Archiv sind" — gehört dem ZIP-Handler und
   * damit T34; sie ist von hier aus nicht belegbar, weil die Route nicht
   * existiert. Was HIER gilt: ein Aufruf erhöht um genau 1, und die Logzeile des
   * ZIPs trägt `file_id = NULL`.
   */
  it("ein Aufruf erhöht download_count um genau 1, nie um die Dateizahl", () => {
    shareAnlegen("sh-zip", 5);
    db.insert(schema.shareFiles)
      .values(
        ["a.txt", "b.txt", "c.txt"].map((filename, i) => ({
          id: `sf-zip-${i}`,
          shareId: "sh-zip",
          filename,
          mimeType: "text/plain",
          size: 1,
          createdAt: new Date("2026-07-30T12:00:00Z"),
          bytesVollstaendigAt: new Date("2026-07-30T12:00:00Z"),
          avStatus: "clean",
        })),
      )
      .run();
    expect(zaehleDownload(db, "sh-zip")).toBe(true);
    expect(zaehlerVon("sh-zip")).toBe(1);
  });

  it("die Logzeile des ZIPs trägt file_id = NULL", () => {
    shareAnlegen("sh-zip-log", null);
    protokolliereDownload(db, {
      shareId: "sh-zip-log",
      fileId: null,
      headers: new Headers({ "cf-connecting-ip": "93.184.216.34" }),
    });
    const zeilen = logZeilen("sh-zip-log");
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].fileId).toBeNull();
  });
});

describe("Punkt 6: protokolliereDownload schreibt genau EINE Zeile", () => {
  const kopf = (ip: string, ua = "Mozilla/5.0 (Handy)") =>
    new Headers({ "cf-connecting-ip": ip, "user-agent": ua });

  it("eine einzelne Datei: genau eine Zeile mit gesetzter file_id", () => {
    shareAnlegen("sh-log-eine", null);
    protokolliereDownload(db, {
      shareId: "sh-log-eine",
      fileId: "sf-42",
      headers: kopf("93.184.216.34"),
    });
    const zeilen = logZeilen("sh-log-eine");
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0].fileId).toBe("sf-42");
    expect(zeilen[0].ua).toBe("Mozilla/5.0 (Handy)");
  });

  it("die Adresse steht GEKÜRZT in der Zeile, nie vollständig", () => {
    shareAnlegen("sh-log-ip", null);
    protokolliereDownload(db, {
      shareId: "sh-log-ip",
      fileId: "sf-1",
      headers: kopf("93.184.216.34"),
    });
    protokolliereDownload(db, {
      shareId: "sh-log-ip",
      fileId: "sf-2",
      headers: kopf("2001:db8:1234:5678::1"),
    });
    const zeilen = logZeilen("sh-log-ip");
    expect(zeilen.map((z) => z.ip)).toEqual(["93.184.216.0", "2001:db8:1234::"]);
    // Die Gegenprobe, die den Wegfall von `ipKuerzen` sicher fängt: die
    // vollständige Adresse darf NIRGENDS in der Tabelle stehen.
    const roh = sqlite
      .prepare("SELECT COUNT(*) AS c FROM download_logs WHERE client_ip_unbestaetigt IN (?, ?)")
      .get("93.184.216.34", "2001:db8:1234:5678::1") as { c: number };
    expect(roh.c).toBe(0);
  });

  it("ein unparsbarer Wert wird NULL, nicht der Rohwert", () => {
    // `clientIpAus` liefert ohne jeden Kopf „unknown" — genau der Fall, in dem
    // ein durchgereichter Rohwert in der Spalte landen würde.
    shareAnlegen("sh-log-roh", null);
    protokolliereDownload(db, { shareId: "sh-log-roh", fileId: null, headers: new Headers() });
    protokolliereDownload(db, {
      shareId: "sh-log-roh",
      fileId: null,
      headers: new Headers({ "x-forwarded-for": "kein-ip, 93.184.216.34" }),
    });
    expect(logZeilen("sh-log-roh").map((z) => z.ip)).toEqual([null, null]);
  });

  it("downloaded_at steht ZEHNSTELLIG in Sekunden in der Spalte", () => {
    // Roh gelesen: über Drizzle käme ein `timestamp_ms`-Verwechsler
    // zurückgerechnet an, und der Rundlauf wäre grün, während die Spalte
    // dreizehnstellig ist (§4.1, derselbe Wächter wie in `migrations.test.ts`).
    const vorher = Math.floor(Date.now() / 1000);
    shareAnlegen("sh-log-zeit", null);
    protokolliereDownload(db, {
      shareId: "sh-log-zeit",
      fileId: null,
      headers: kopf("93.184.216.34"),
    });
    const zeit = logZeilen("sh-log-zeit")[0].zeit;
    expect(String(zeit).length).toBe(10);
    expect(zeit).toBeGreaterThanOrEqual(vorher);
    expect(zeit).toBeLessThan(1e11);
  });

  it("ein fehlender User-Agent wird NULL", () => {
    shareAnlegen("sh-log-ua", null);
    protokolliereDownload(db, {
      shareId: "sh-log-ua",
      fileId: null,
      headers: new Headers({ "cf-connecting-ip": "93.184.216.34" }),
    });
    expect(logZeilen("sh-log-ua")[0].ua).toBeNull();
  });
});

describe("Punkt 7: die Entscheidung kann kein vorher gelesener Wert sein", () => {
  it("zaehler.ts liest nirgends, es schreibt nur bedingt", () => {
    /*
     * Quelltext-Zusicherung, und sie besitzt NUR die Gegenmaßnahme: ein
     * `select`/`get` in dieser Datei wäre der erste Schritt zurück zu
     * „Zahl lesen, dann rechnen". Ob die Atomarität WIRKT, besitzt allein der
     * Parallelitätstest oben — ein Scan kennt keine Nebenläufigkeit.
     */
    const quelle = readFileSync(ZAEHLER, "utf8");
    // `.get(` steht NICHT auf der Liste, und das ist kein Versehen:
    // `headers.get("user-agent")` ist genau das — die Liste nennt deshalb die
    // Datenbank-Lesewege einzeln, statt eine Zeichenkette zu verbieten, die auch
    // harmlos vorkommt.
    for (const verboten of [".select(", ".all(", "db.get(", ".prepare("]) {
      expect(quelle.includes(verboten), `zaehler.ts enthält ${verboten}`).toBe(false);
    }
  });
});
