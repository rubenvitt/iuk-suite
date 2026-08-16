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

/*
 * Migration 0002 (Quellenwechsel 2026-08-15) — `ROLLEN` kennt nur noch `auftrag` und `bufdi`, die
 * Koordination kommt aus der Auth-Gruppe (`_lib/zugang.ts`). Ein reines Daten-UPDATE, weil
 * `text("rolle", { enum })` in SQLite KEIN `CHECK` erzeugt.
 *
 * DIESE GRUPPE HAELT DAS KERNRISIKO DES GANZEN UMBAUS: `verteilDaten` speist die Verteillisten aus
 * `bufdis()`, DAMIT die Koordination nicht in ihrer eigenen Zielliste steht — daran haengt das
 * Vier-Augen-Prinzip aus der Betreiberentscheidung vom 2026-08-13 (`darfFreigeben`s
 * Kopfkommentar). Ein Umschreiben auf `bufdi` statt `auftrag` braeche diese Zusage STILL: die
 * Migration liefe durch, jede Zeile haette einen gueltigen Rollenwert, und die Koordination stuende
 * ab dem naechsten Seitenaufbau in der Liste, aus der sie ausdruecklich herausgehalten wird.
 * Deshalb steht die Gegenprobe auf `bufdi` ausgeschrieben daneben.
 */
describe("Migration 0002 — koordination wird auftrag", () => {
  function datei0002(): string {
    const datei = readdirSync(join(process.cwd(), ORDNER)).find((d) => d.startsWith("0002_"));
    if (!datei) throw new Error("Migration 0002 nicht gefunden");
    return datei;
  }

  /**
   * Die Zeile wird NACH der vollen Migration gesetzt und die 0002-Anweisung danach ERNEUT
   * ausgefuehrt: `migrate()` kennt keinen Teil-Lauf bis 0001, und die Aussage dieses Tests ist die
   * WIRKUNG DER ANWEISUNG, nicht die Reihenfolge des Migrators (die `_journal.json` haelt).
   * `UPDATE … WHERE` ist idempotent — ein zweiter Lauf ist hier kein Kunstgriff, sondern genau das,
   * was auf einer bestehenden Datenbank passiert.
   */
  function nachMigration0002(rolle: string): string {
    const sqlite = frisch();
    sqlite
      .prepare(
        `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
         VALUES ('p1','dev:rike@b','Rike','RI',?,468,'2026-08-01',1)`,
      )
      .run(rolle);
    sqlite.exec(readFileSync(join(process.cwd(), ORDNER, datei0002()), "utf8"));
    const zeile = sqlite.prepare("SELECT rolle FROM personen WHERE id='p1'").get() as {
      rolle: string;
    };
    sqlite.close();
    return zeile.rolle;
  }

  it("schreibt eine koordination-Zeile auf auftrag um — und NIEMALS auf bufdi", () => {
    expect(nachMigration0002("koordination")).toBe("auftrag");
    expect(nachMigration0002("koordination")).not.toBe("bufdi");
  });

  it("laesst auftrag und bufdi unangetastet", () => {
    expect(nachMigration0002("auftrag")).toBe("auftrag");
    expect(nachMigration0002("bufdi")).toBe("bufdi");
  });

  /**
   * MEHRERE ZEILEN AUF EINMAL, NICHT NUR EINE — und zwar gemischt: das `UPDATE` traegt ein `WHERE`,
   * und ein vergessenes oder falsch gesetztes `WHERE` faellt an einer einzelnen Zeile nicht auf.
   *
   * OHNE VORHER GESETZTE ZEILEN WAERE DIESER FALL EINE TAUTOLOGIE (Review-Befund): `frisch()`
   * liefert eine LEERE `personen`-Tabelle, ein `COUNT(*) … WHERE rolle='koordination'` darauf ist
   * auch dann 0, wenn es die Migrationsdatei gar nicht gibt.
   */
  it("schreibt ALLE koordination-Zeilen um und laesst die anderen in Ruhe", () => {
    const sqlite = frisch();
    const einfuegen = sqlite.prepare(
      `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
       VALUES (?, ?, 'X', 'XX', ?, 468, '2026-08-01', 1)`,
    );
    einfuegen.run("k1", "dev:k1@b", "koordination");
    einfuegen.run("k2", "dev:k2@b", "koordination");
    einfuegen.run("a1", "dev:a1@b", "auftrag");
    einfuegen.run("b1", "dev:b1@b", "bufdi");

    sqlite.exec(readFileSync(join(process.cwd(), ORDNER, datei0002()), "utf8"));

    const zaehle = (rolle: string) =>
      (sqlite.prepare("SELECT COUNT(*) AS n FROM personen WHERE rolle=?").get(rolle) as { n: number })
        .n;
    expect(zaehle("koordination")).toBe(0);
    expect(zaehle("auftrag")).toBe(3);
    expect(zaehle("bufdi")).toBe(1);
    sqlite.close();
  });
});

/*
 * DAS DRITTE TEIL DES MIGRATIONS-DREIECKS, DAS KEIN ANDERER TEST SIEHT: eine `.sql`-Datei ohne
 * Eintrag in `_journal.json` wird beim Boot schlicht UEBERSPRUNGEN (kein Fehler, keine Meldung),
 * ein Journal-Eintrag ohne Datei bricht den Start. Beides faellt sonst erst im Container auf.
 */
describe("Journal und Dateien passen zusammen", () => {
  it("jede .sql-Datei hat genau einen Journal-Eintrag mit demselben Namen", () => {
    const dateien = readdirSync(join(process.cwd(), ORDNER))
      .filter((d) => d.endsWith(".sql"))
      .map((d) => d.replace(/\.sql$/, ""))
      .sort();
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), ORDNER, "meta", "_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.map((e) => e.tag).sort()).toEqual(dateien);
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
  });

  it("zu jedem Journal-Eintrag gibt es einen Schnappschuss", () => {
    const schnappschuesse = readdirSync(join(process.cwd(), ORDNER, "meta")).filter((d) =>
      d.endsWith("_snapshot.json"),
    );
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), ORDNER, "meta", "_journal.json"), "utf8"),
    ) as { entries: { idx: number }[] };
    for (const eintrag of journal.entries) {
      const praefix = String(eintrag.idx).padStart(4, "0");
      expect(schnappschuesse, praefix).toContain(`${praefix}_snapshot.json`);
    }
  });
});

/*
 * `faellig_am` IST `NOT NULL` — DER RIEGEL, DEN DIE OBERFLAECHEN-SPEC (2026-08-16 §11.1, §9/S4)
 * BESTELLT, WEIL ZWEI IHRER ZUSAGEN DARAUF RUHEN:
 *
 *  - DIE TOTALE ORDNUNG (§4.1): `_lib/lage.ts` sortiert jede Sprosse nach `faelligAm` aufsteigend,
 *    dann `prioritaet`, `erstelltAm`, `id`. Eine Zeile ohne Frist haette in dieser Kette keinen
 *    Platz — SQLite ordnet `NULL` vor jedem Wert, die Karte naehme also ausgerechnet die Aufgabe
 *    OHNE Frist als „die dringendste" und nennte sie als Extrem.
 *  - `<Frist>` (§6.2): die Komponente hat DREI Auspraegungen und keinen vierten Zweig fuer
 *    „keine Frist". `istUeberfaellig(a, heute)` vergleicht `a.faelligAm < heute` — mit `NULL`
 *    waere der Vergleich weder wahr noch falsch, und die Zeile fiele lautlos in den Sonst-Zweig
 *    („Frist: null").
 *
 * WARUM DAS EINEN EIGENEN TEST BRAUCHT: `_db/schema.ts` sagt `.notNull()`, aber das ist eine
 * Drizzle-Aussage — WIRKSAM ist allein, was in der Migration steht. Faellt die Spalte je in einer
 * neuen Migration auf nullable zurueck, bleiben `typecheck`, `lint` und `build` gruen, und der
 * Fehler zeigte sich erst als falsch sortierte Fuehrungskarte in Produktion.
 *
 * GEPRUEFT WIRD GEGEN DIE MIGRIERTE DATENBANK, NICHT GEGEN DEN SCHEMA-QUELLTEXT — ein Scan ueber
 * `schema.ts` bewiese nur, dass jemand `.notNull()` getippt hat.
 */
describe("Die Frist ist Pflicht", () => {
  it("weist eine Aufgabe ohne `faellig_am` ab — `NOT NULL` steht in der Migration, nicht nur im Schema", () => {
    const sqlite = frisch();
    sqlite
      .prepare(
        `INSERT INTO personen (id, sub, name, initialen, rolle, soll_minuten_tag, aktiv_von, erstellt_am)
         VALUES ('p1','dev:a@b','X','XX','bufdi',468,'2026-08-01',1)`,
      )
      .run();

    const ohneFrist = () =>
      sqlite
        .prepare(
          `INSERT INTO aufgaben (id, titel, beschreibung, prioritaet, ersteller_id, status,
             faellig_am, dauer_minuten, nachweis_pflicht, nachweis_art, ist_selbst, plan_rang,
             erstellt_am, aktualisiert_am)
           VALUES ('a1','T','B','mittel','p1','eingegangen',NULL,60,0,'text',0,0,1,1)`,
        )
        .run();
    expect(ohneFrist).toThrow(/NOT NULL/i);

    // GEGENPROBE: DIESELBE ZEILE MIT FRIST GEHT DURCH. Ohne sie koennte der Wurf oben auch von
    // einer ganz anderen Spalte kommen, und der Test hiesse etwas anderes, als sein Name sagt.
    sqlite
      .prepare(
        `INSERT INTO aufgaben (id, titel, beschreibung, prioritaet, ersteller_id, status,
           faellig_am, dauer_minuten, nachweis_pflicht, nachweis_art, ist_selbst, plan_rang,
           erstellt_am, aktualisiert_am)
         VALUES ('a1','T','B','mittel','p1','eingegangen','2026-08-20',60,0,'text',0,0,1,1)`,
      )
      .run();
    const zeile = sqlite.prepare("SELECT faellig_am FROM aufgaben WHERE id='a1'").get() as {
      faellig_am: string;
    };
    expect(zeile.faellig_am).toBe("2026-08-20");
    sqlite.close();
  });
});
