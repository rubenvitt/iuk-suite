import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import { MODULE_MIGRATIONS } from "@/core/bootstrap";

const ORDNER = "src/app/m/aufgaben/_db/migrations";

/** Eine frische Datenbank im Speicher, migriert wie beim Boot. */
function frisch() {
  const sqlite = new Database(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  return sqlite;
}

describe("Das Dreieck", () => {
  /*
   * Ein Modul mit eigener Datenbank braucht DREI zusammenpassende Eintraege:
   * das Migrationsverzeichnis, die Zeile in MODULE_MIGRATIONS und die
   * COPY-Zeile im Dockerfile. Fehlt die dritte, laeuft es lokal und bricht im
   * Container — und zwar erst beim Deployment, wenn niemand mehr hinsieht.
   */
  it("nennt aufgaben in MODULE_MIGRATIONS", () => {
    expect(MODULE_MIGRATIONS.some((m) => m.key === "aufgaben" && m.migrationsFolder === ORDNER)).toBe(true);
  });

  it("kopiert die Migrationen im Dockerfile", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toContain("src/app/m/aufgaben/_db/migrations");
  });

  /*
   * Die Gegenprobe zum Dockerfile-Test: er prueft nur, dass der Pfad VORKOMMT.
   * Diese Zeile stellt sicher, dass er in einer COPY-Zeile vorkommt und nicht
   * bloss in einem Kommentar.
   */
  it("kopiert sie in einer COPY-Zeile, nicht in einem Kommentar", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    const zeile = dockerfile
      .split("\n")
      .find((z) => z.includes("src/app/m/aufgaben/_db/migrations"));
    expect(zeile?.trimStart().startsWith("COPY")).toBe(true);
  });
});

describe("Migration 0000", () => {
  it("legt alle sechs Tabellen an", () => {
    const sqlite = frisch();
    const tabellen = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((z) => (z as { name: string }).name);
    for (const t of ["personen", "aufgaben", "routinen", "nachweise", "dateien", "verlauf"]) {
      expect(tabellen, t).toContain(t);
    }
    sqlite.close();
  });

  it("macht personen.sub eindeutig", () => {
    const sqlite = frisch();
    const einfuegen = sqlite.prepare(
      `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
       VALUES (?, ?, 'X', 'XX', 'bufdi', 468, '2026-08-01', 1)`,
    );
    einfuegen.run("p1", "dev:a@b");
    expect(() => einfuegen.run("p2", "dev:a@b")).toThrow(/UNIQUE/i);
    sqlite.close();
  });

  /*
   * ZEITPUNKTE SIND SEKUNDEN, NICHT MILLISEKUNDEN. Der Fehler waere ueber die
   * Drizzle-Schicht unsichtbar (beide Richtungen rechnen dieselbe Umrechnung),
   * waehrend jeder Zeitstempel um Jahrtausende falsch steht. Deshalb prueft
   * dieser Test den ROHEN Spaltenwert auf seine Stellenzahl — genau wie
   * `lagerbuch/_db/migrations.test.ts`.
   */
  it("speichert Zeitpunkte als Sekunden (zehn Stellen), nicht als Millisekunden", async () => {
    const sqlite = frisch();
    const db = drizzle(sqlite);
    const { personen } = await import("./schema");
    db.insert(personen)
      .values({
        id: "p1", sub: "dev:a@b", name: "X", initialen: "XX",
        rolle: "bufdi", aktivVon: "2026-08-01",
      })
      .run();
    const roh = sqlite.prepare("SELECT erstellt_am FROM personen WHERE id='p1'").get() as {
      erstellt_am: number;
    };
    expect(String(roh.erstellt_am)).toMatch(/^\d{10}$/);
    sqlite.close();
  });

  it("loescht Verlauf, Nachweise und Dateien mit der Aufgabe", () => {
    const sqlite = frisch();
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite
      .prepare(
        `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
         VALUES ('p1','dev:a@b','X','XX','bufdi',468,'2026-08-01',1)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO aufgaben (id, titel, beschreibung, prioritaet, ersteller_id, status,
           faellig_am, dauer_minuten, nachweis_pflicht, nachweis_art, ist_selbst, plan_rang,
           erstellt_am, aktualisiert_am)
         VALUES ('a1','T','B','mittel','p1','eingegangen','2026-08-20',60,0,'text',0,0,1,1)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO verlauf (id, aufgabe_id, ereignis, akteur_id, ts)
         VALUES ('v1','a1','eingestellt','p1',1)`,
      )
      .run();
    // Dateien und Nachweise gehoeren mit ins Spiel — sonst haette ein spaeter
    // verlorenes `ON DELETE cascade` an genau diesen beiden Tabellen hier
    // keinen Zeugen. Die Nachweis-Zeile trägt zusaetzlich `datei_id`, damit
    // auch dieser Verweis mitgeprueft ist.
    sqlite
      .prepare(
        `INSERT INTO dateien (id, aufgabe_id, dateiname, mime, groesse, scan_status, erstellt_am)
         VALUES ('d1','a1','nachweis.jpg','image/jpeg',1024,'sauber',1)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO nachweise (id, aufgabe_id, art, datei_id, erstellt_von, erstellt_am)
         VALUES ('n1','a1','bild','d1','p1',1)`,
      )
      .run();
    sqlite.prepare("DELETE FROM aufgaben WHERE id='a1'").run();
    for (const t of ["verlauf", "dateien", "nachweise"]) {
      const rest = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number };
      expect(rest.n, t).toBe(0);
    }
    sqlite.close();
  });

  /*
   * Fremdschluessel auf `personen` haben ABSICHTLICH kein `ON DELETE cascade`:
   * eine Person wird nicht geloescht, sondern ueber `aktiv_bis` beendet. Ein
   * Cascade hier hiesse, dass ein versehentliches DELETE die Geschichte eines
   * ganzen Dienstjahres mitnimmt.
   */
  it("kaskadiert NICHT von personen aus", () => {
    const sql = readFileSync(join(process.cwd(), ORDNER, naechsteDatei()), "utf8");
    const personenVerweise = sql
      .split("\n")
      .filter((z) => /REFERENCES\s+`?personen`?/i.test(z));
    expect(personenVerweise.length).toBeGreaterThan(0);
    for (const z of personenVerweise) expect(z).not.toMatch(/ON DELETE cascade/i);
  });
});

/** Der erzeugte Dateiname traegt einen Zufallsnamen — er wird gesucht, nicht geraten. */
function naechsteDatei(): string {
  const datei = readdirSync(join(process.cwd(), ORDNER)).find((d) => d.startsWith("0000_"));
  if (!datei) throw new Error("Migration 0000 nicht gefunden");
  return datei;
}

/*
 * Aufgabe 18 — Migration 0001, zwei nachgeholte Indizes (siehe Kopfkommentar
 * von `_db/schema.ts` bei `dateien`). Zwei Zusicherungen, und beide brauchen
 * eine GEGENPROBE, sonst bleibt „0000 ist unverändert" ungeprüft: eine
 * spätere Bearbeitung, die stattdessen 0000 anfasst, müsste HIER auffallen,
 * nicht nur „die Indizes existieren irgendwo".
 */
describe("Migration 0001 — zwei nachgeholte Indizes auf `dateien`", () => {
  function datei0001(): string {
    const datei = readdirSync(join(process.cwd(), ORDNER)).find((d) => d.startsWith("0001_"));
    if (!datei) throw new Error("Migration 0001 nicht gefunden");
    return datei;
  }

  it("0001 legt den Index auf aufgabe_id UND auf scan_status an", () => {
    const sql = readFileSync(join(process.cwd(), ORDNER, datei0001()), "utf8");
    expect(sql).toMatch(/CREATE INDEX `dateien_aufgabe_idx` ON `dateien` \(`aufgabe_id`\)/);
    expect(sql).toMatch(/CREATE INDEX `dateien_scan_idx` ON `dateien` \(`scan_status`\)/);
  });

  it("0000 nennt diese beiden Indizes NICHT — sie gehören zu 0001, nicht nachträglich in 0000", () => {
    const sql0000 = readFileSync(join(process.cwd(), ORDNER, naechsteDatei()), "utf8");
    expect(sql0000).not.toContain("dateien_aufgabe_idx");
    expect(sql0000).not.toContain("dateien_scan_idx");
  });

  it("nach der vollen Migration existieren beide Indizes in sqlite_master", () => {
    const sqlite = frisch();
    const indizes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((z) => (z as { name: string }).name);
    expect(indizes).toContain("dateien_aufgabe_idx");
    expect(indizes).toContain("dateien_scan_idx");
    sqlite.close();
  });
});
