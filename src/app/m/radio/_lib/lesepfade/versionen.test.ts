// src/app/m/radio/_lib/lesepfade/versionen.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../../_db/schema";
import { devices, softwareVersions } from "../../_db/schema";
import { berechneUpdateStand } from "../updateStand";
import { versionenMitGeraetezahl, zielVersion } from "./versionen";

/**
 * DER ERSTE LESEPFAD DER VERWALTUNG (Planteil 4, Aufgabe V5). Er ersetzt
 * `listSoftwareVersions` (`radio-admin/server/src/repos/softwareVersionRepo.ts:139-151`) und
 * `getTargetVersion` (`:63-70`) durch Drizzle-Aufrufe im selben Prozess.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`): dessen Cache ist per
 * MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`) — ein Test, der
 * ihn benutzt, bekaeme die Datenbank des vorigen Tests. Vorbild ist
 * `src/app/m/radio/_db/migrations.test.ts:29-37`, das seinerseits
 * `src/app/m/lagerbuch/_db/migrations.test.ts:29-37` folgt — die Datei, die
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:270` namentlich als Hausform fuehrt; die vier
 * Pragmas aus `openModuleDatabase` braucht dieser Test nicht — er misst Abfrageergebnisse,
 * keine Nebenlaeufigkeit.
 *
 * ⚠️ EINE FRISCHE DATENBANK JE FALL (`beforeEach`, nicht `beforeAll`): jeder Fall unten
 * setzt seinen eigenen Bestand, und `software_versions.value` ist unique
 * (`src/app/m/radio/_db/schema.ts:69`) — geteilte Zeilen liessen die Faelle einander
 * bedingen.
 *
 * ⚠️ ZEIT IST EIN `Date`, KEINE ZAHL. `software_versions.created_at` steht als
 * `integer(..., { mode: "timestamp" })` im Schema (`_db/schema.ts:70`); Drizzle rechnet die
 * Sekundengrenze selbst, und in diesem Test taucht keine rohe Epochenzahl auf.
 */
const MIGRATIONEN = "src/app/m/radio/_db/migrations";

/**
 * Der Anlegezeitpunkt, an dem `angelegtText` gemessen wird: 14.06.2026, 09:12 in Berlin
 * (dort UTC+2). Dieselbe Form und dieselbe Begruendung wie in
 * `src/app/m/radio/_db/leihen.test.ts:62-65`.
 */
const ANGELEGT_AM = new Date("2026-06-14T07:12:00Z");
const ANGELEGT_TEXT = "14.06.2026, 09:12";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-versionen-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Eine Versionszeile; alles ausser `value` hat eine Vorgabe, die der Fall ueberschreibt. */
function version(werte: Partial<typeof softwareVersions.$inferInsert> & { value: string }) {
  return {
    id: `v-${werte.value.replace(/[^a-zA-Z0-9]/g, "-")}`,
    createdAt: ANGELEGT_AM,
    sortOrder: 0,
    isTarget: false,
    ...werte,
  };
}

/** Ein Geraet mit genau den Spalten, die dieser Test braucht — `issi` ist unique. */
function geraet(id: string, softwareVersion: string | null) {
  return {
    id,
    issi: `issi-${id}`,
    softwareVersion,
    createdAt: ANGELEGT_AM,
    updatedAt: ANGELEGT_AM,
  };
}

describe("versionenMitGeraetezahl — die Zeilen der Verwaltungstabelle", () => {
  it("sortiert nach sortOrder absteigend, dann nach createdAt absteigend", () => {
    /*
     * 1:1 aus `radio-admin/server/src/repos/softwareVersionRepo.ts:150`
     * (`orderBy(desc(sortOrder), desc(createdAt))`).
     *
     * ⛔ DREI ZEILEN UND NICHT ZWEI, UND DAS IST DER PUNKT DES FIXTURES. Die Aufgabentafel
     * (`.superpowers/sdd/planteil4/briefs/V5.md:74`) verlangt „zwei Zeilen mit gleichem
     * `sortOrder`" — das prueft den Gleichstandsbrecher, aber NICHT den ersten Schluessel:
     * bei zwei gleich geordneten Zeilen bliebe der Fall gruen, wenn `desc(sortOrder)`
     * ersatzlos entfiele. Die dritte Zeile traegt einen ANDEREN `sortOrder` und liegt beim
     * juengsten Anlegedatum — damit widerspricht die erwartete Reihenfolge dem, was JEDER
     * der beiden Schluessel allein ergaebe, und beide Haelften sind einzeln sondierbar
     * (S-V5d und S-V5e).
     *
     * ⛔ DIE EINFUEGEREIHENFOLGE IST ABSICHTLICH EINE DRITTE. Ohne `orderBy` antwortet
     * SQLite in rowid-Ordnung; faellt die mit der Erwartung zusammen, misst der Fall nichts.
     *
     * ⚠️ DER GLEICHSTAND IST HERGESTELLT UND NICHT DER NORMALFALL. Jeder bekannte
     * Schreibweg setzt `sortOrder` verschieden (`softwareVersionRepo.ts:19-25`, `:131`);
     * der Gleichstandsbrecher wandert trotzdem 1:1 mit (`:150`), weil die Spalte die
     * Vorgabe 0 traegt (`_db/schema.ts:83`) und ein Schreibweg, der sie ausliesse, sofort
     * Gleichstaende erzeugte.
     */
    db.insert(softwareVersions)
      .values([
        version({ value: "FW 11.0", sortOrder: 1, createdAt: new Date("2026-03-01T10:00:00Z") }),
        version({ value: "FW 10.0", sortOrder: 5, createdAt: new Date("2026-01-01T10:00:00Z") }),
        version({ value: "FW 12.0", sortOrder: 5, createdAt: new Date("2026-02-01T10:00:00Z") }),
      ])
      .run();

    expect(versionenMitGeraetezahl(db).map((z) => z.wert)).toEqual([
      "FW 12.0", // sortOrder 5, juenger als FW 10.0
      "FW 10.0", // sortOrder 5, aelter
      "FW 11.0", // sortOrder 1
    ]);
  });

  it("deviceCount zaehlt Geraete mit genau diesem Versionswert", () => {
    /*
     * Die Unterabfrage aus `softwareVersionRepo.ts:147`
     * (`SELECT COUNT(*) FROM devices WHERE devices.software_version = software_versions.value`).
     * Drei Geraete, zwei Versionen: waere die Zahl eine Gesamtzahl oder ein Join ohne
     * Bedingung, stuende an beiden Zeilen dieselbe 3.
     */
    db.insert(softwareVersions)
      .values([
        version({ value: "FW 12.3", sortOrder: 2 }),
        version({ value: "FW 11.0", sortOrder: 1 }),
      ])
      .run();
    db.insert(devices)
      .values([
        geraet("g-1", "FW 12.3"),
        geraet("g-2", "FW 12.3"),
        geraet("g-3", "FW 11.0"),
      ])
      .run();

    const zahlen = new Map(versionenMitGeraetezahl(db).map((z) => [z.wert, z.deviceCount]));
    expect(zahlen.get("FW 12.3")).toBe(2);
    expect(zahlen.get("FW 11.0")).toBe(1);
  });

  it("eine Version ohne Geraete traegt die Zahl null", () => {
    /*
     * Die Gegenprobe zum Fall darueber; sie traegt in V19 die Loeschsperre
     * (`.superpowers/sdd/planteil4/briefs/V19.md:35-37`: gesperrt, solange
     * `deviceCount > 0`) — eine Zahl, die nie null wird, sperrt das Loeschen fuer immer.
     *
     * ⛔ ZWEI GERAETE, DIE BEIDE NICHT ZAEHLEN DUERFEN, und beide sind ein eigener
     * Fehlweg: eines OHNE Version (`software_version IS NULL` — ein `= NULL` trifft in
     * SQL nie, ein `IS NOT DISTINCT FROM` schon) und eines mit einer Version, die gar
     * nicht angelegt ist. Die Liste bleibt trotzdem EINZEILIG: sie kommt aus
     * `software_versions`, nicht aus `devices`.
     */
    db.insert(softwareVersions).values(version({ value: "FW 12.3" })).run();
    db.insert(devices).values([geraet("g-1", null), geraet("g-2", "FW 99.9")]).run();

    const zeilen = versionenMitGeraetezahl(db);
    expect(zeilen.map((z) => z.wert)).toEqual(["FW 12.3"]);
    expect(zeilen[0]?.deviceCount).toBe(0);
  });

  it("die Ziel-Marke wandert als Feld mit", () => {
    // `softwareVersionRepo.ts:146`. Ohne sie kann V19 weder die Marke anzeigen noch den
    // Knopf „Als Ziel" von der Marke unterscheiden.
    db.insert(softwareVersions)
      .values([
        version({ value: "FW 12.3", sortOrder: 2, isTarget: true }),
        version({ value: "FW 11.0", sortOrder: 1 }),
      ])
      .run();

    const zeilen = versionenMitGeraetezahl(db);
    expect(zeilen.map((z) => z.isTarget)).toEqual([true, false]);
  });

  it("angelegtText ist eine fertige Zeichenkette in Berliner Zeit, kein Zeitstempel", () => {
    /*
     * Der Alt-Bestand formatiert im Browser (`SoftwareVersionsPage.tsx:110` ruft
     * `formatTimestamp`, `radio-admin/client/src/utils/format.ts:2-5`); die Suite
     * formatiert auf dem Server (`_lib/anzeige.ts:75`, `datumMitUhrzeit`), weil die Zeile
     * an eine Client-Insel geht und ein `Date` als Prop dort verboten ist
     * (Bauform-Zulaessigkeitstafel Nr. 7, `.superpowers/sdd/planteil4/briefs/KOPF.md:320`).
     *
     * ⚠️ DAMIT IST DIE ZEICHENKETTE NICHT DIE DES BESTANDS, und das ist eine benannte
     * Abweichung des Plans, keine des Baus: `toLocaleString('de-DE')` ergibt
     * `14.6.2026, 09:12:00`, `datumMitUhrzeit` ergibt die aufgefuellte Form ohne Sekunden.
     * Der Plan nennt beide Belegzeilen nebeneinander (`briefs/V5.md:51`).
     */
    db.insert(softwareVersions).values(version({ value: "FW 12.3" })).run();

    expect(versionenMitGeraetezahl(db)[0]?.angelegtText).toBe(ANGELEGT_TEXT);
  });
});

describe("zielVersion — die eine Marke", () => {
  it("liefert null, wenn keine Marke gesetzt ist", () => {
    // `softwareVersionRepo.ts:70` (`row?.value ?? null`). Zwei Versionen, keine Marke.
    db.insert(softwareVersions)
      .values([version({ value: "FW 12.3", sortOrder: 2 }), version({ value: "FW 11.0" })])
      .run();

    expect(zielVersion(db)).toBeNull();
  });

  it("liefert den Wert der gesetzten Marke", () => {
    /*
     * `softwareVersionRepo.ts:63-70`: `where(eq(isTarget, true))`.
     *
     * ⛔ DIE MARKIERTE ZEILE TRAEGT DEN GROESSEREN `sortOrder`, UND DAS IST DER PUNKT DES
     * FIXTURES. Umgekehrt herum waere sie zugleich die erste in `asc(sortOrder)` — dann
     * bliebe dieser Fall gruen, wenn `where(eq(isTarget, true))` ERSATZLOS ENTFIELE
     * (gemessen an der Fassung davor: Sonde S-V5o war 1 rot, und dieser Fall war nicht
     * dabei). So waehlt allein die Marke, und die Anzeigeordnung zeigt in die Gegenrichtung.
     */
    db.insert(softwareVersions)
      .values([
        version({ value: "FW 12.3", sortOrder: 1 }),
        version({ value: "FW 11.0", sortOrder: 2, isTarget: true }),
      ])
      .run();

    expect(zielVersion(db)).toBe("FW 11.0");
  });

  it("antwortet bei zwei Marken deterministisch — die Schwaeche ohne Constraint steht in _db/schema.ts:84-92", () => {
    /*
     * ⛔ DIE EINE BENANNTE ABWEICHUNG DIESER AUFGABE. Es gibt KEINEN DB-Constraint, der
     * genau eine Ziel-Marke erzwingt (`src/app/m/radio/_db/schema.ts:84-92`, dort mit der
     * Begruendung: ein partieller Index verwandelte das Setzen der Marke von einer
     * Zweischritt-Transaktion in einen Konflikt und braeche den bestehenden Schreibweg).
     * Der Alt-Leser hat dazu KEIN `ORDER BY` (`softwareVersionRepo.ts:63-70`) — bei zwei
     * Marken entscheidet die Reihenfolge, in der SQLite zufaellig liefert, ueber den
     * angezeigten Stand JEDES Geraets, und derselbe Datenbestand kann zweimal verschieden
     * antworten. Der Suite-Lesepfad bekommt deshalb ein `asc(sortOrder)` davor.
     *
     * ⚠️ WAS DIESER FALL NICHT BEHAUPTET: dass die kleinere Anzeigeordnung die RICHTIGE
     * Marke ist. Bei zwei Marken ist der Bestand bereits kaputt, und keine Richtung waere
     * fachlich richtig — die Abweichung kauft Determinismus, nicht Richtigkeit.
     *
     * ⛔ DIE EINFUEGEREIHENFOLGE IST DER GANZE FALL. `software_versions` traegt keinen
     * Index auf `is_target`; ein `WHERE is_target = 1 LIMIT 1` ohne `ORDER BY` ist ein
     * voller Durchgang in rowid-Ordnung, also in EINFUEGEREIHENFOLGE. Die Marke mit dem
     * GROESSEREN `sortOrder` wird deshalb ZUERST eingefuegt: nur so antwortet die Fassung
     * ohne `orderBy` messbar anders (Sonde S-V5c). Bei umgekehrter Einfuegereihenfolge
     * waere derselbe Fall gruen, ohne etwas zu pruefen.
     *
     * ⛔ DIE DRITTE ZEILE IST UNMARKIERT UND LIEGT GANZ UNTEN. Beide Marken allein
     * machen das `where` zu einer Leerbedingung — es zu entfernen aenderte am Ergebnis
     * nichts, und der Fall bewachte nur das `orderBy`. Mit `FW 1.0` auf `sortOrder` 0
     * greift `asc(sortOrder)` ohne `where` auf eine Zeile OHNE Marke, und beide Haelften
     * der Abfrage sind einzeln sondierbar (S-V5c und S-V5o). Sie steht ZULETZT, damit die
     * rowid-Ordnung der beiden Marken unberuehrt bleibt.
     */
    db.insert(softwareVersions)
      .values([
        version({ value: "FW 20.0", sortOrder: 9, isTarget: true }),
        version({ value: "FW 5.0", sortOrder: 1, isTarget: true }),
        version({ value: "FW 1.0", sortOrder: 0 }),
      ])
      .run();

    expect(zielVersion(db)).toBe("FW 5.0");
  });
});

describe("die Ziel-Marke und das Anlegedatum", () => {
  it("aktuell wird nie aus dem Anlegedatum abgeleitet", () => {
    /*
     * ⛔ `aktuell` HAENGT AUSSCHLIESSLICH AN DER ZIEL-MARKE (Entscheidung E-V8,
     * `.superpowers/sdd/planteil4/briefs/KOPF.md:698-700`). Der Alt-Schreibweg
     * `insertSoftwareVersionIfNew` legt eine neu gesehene Version OBEN in der
     * Anzeigeordnung ab (`softwareVersionRepo.ts:29-30`, `:39`: `sortOrder:
     * nextSortOrder(db)`), macht sie aber NIE zum Ziel — „only an explicit
     * `setTargetVersion` makes one current".
     *
     * Fixture genau danach: die juengste und oberste Version ist NICHT Ziel, eine aeltere
     * ist es. Ein Geraet auf der juengsten Version ist damit VERALTET. Ein Lesepfad, der
     * die Marke aus dem Anlegedatum oder aus der Anzeigeordnung ableitete, machte daraus
     * „aktuell" — Sonde S-V5b.
     *
     * ⚠️ DIESER FALL LIEGT HIER UND NICHT IN `_lib/updateStand.test.ts`: die Rechnung dort
     * kennt kein Datum, ihre beiden Parameter sind Zeichenketten. Ein Anlegedatum gibt es
     * erst dort, wo die Marke herkommt.
     *
     * ⛔ DIE DRITTE ZEILE IST DIE, DIE DAS `where` BEWACHT: unmarkiert, mit dem
     * KLEINSTEN `sortOrder` und dem AELTESTEN Anlegedatum. Ohne sie waere die markierte
     * `FW 9.0` zugleich die erste in `asc(sortOrder)`, und der Fall bliebe gruen, wenn
     * `where(eq(isTarget, true))` ersatzlos entfiele. ⛔ SIE WIRD NICHT DURCH EIN DREHEN
     * DER `sortOrder` VON `FW 9.0` ERSETZT: dann truege die MARKE die oberste
     * Anzeigeordnung, und genau die Ableitung „Marke = oberste Zeile", gegen die dieser
     * Fall steht, waere wieder gruen. Mit der dritten Zeile sind alle drei Fehlwege rot —
     * Marke aus `desc(sortOrder)`, Marke aus `desc(createdAt)`, Marke ohne `where`.
     */
    db.insert(softwareVersions)
      .values([
        version({
          value: "FW 9.0",
          sortOrder: 1,
          createdAt: new Date("2026-01-15T10:00:00Z"),
          isTarget: true,
        }),
        version({
          value: "FW 12.3",
          sortOrder: 9,
          createdAt: new Date("2026-06-01T10:00:00Z"),
        }),
        version({
          value: "FW 8.0",
          sortOrder: 0,
          createdAt: new Date("2025-11-01T10:00:00Z"),
        }),
      ])
      .run();

    const ziel = zielVersion(db);
    expect(ziel).toBe("FW 9.0");
    expect(berechneUpdateStand("FW 12.3", ziel)).toBe("veraltet");
  });
});
