// src/app/m/radio/_lib/lesepfade/geraete.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../../_db/schema";
import { devices, softwareVersions, users } from "../../_db/schema";
import { berechneUpdateStand } from "../updateStand";
import {
  geraet,
  geraetFormWerte,
  geraeteFuerExport,
  geraeteKennzahlen,
  geraeteListe,
  updateKarten,
  vorschlaege,
  SORTIER_SCHLUESSEL,
  SUCHFELDER,
  SUCHFELDER_VORGABE,
  VORSCHLAGSFELDER,
  type GeraetFilter,
} from "./geraete";

/**
 * DIE LESEPFADE DER GERAETEVERWALTUNG (Planteil 4, Aufgabe V6).
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`): dessen Cache ist per MODULSCHLUESSEL
 * gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`) — ein Test, der ihn benutzt,
 * bekaeme die Datenbank des vorigen Tests. Vorbild `_db/migrations.test.ts:29-37` und die
 * Schwesterdatei `_lib/lesepfade/versionen.test.ts:19-27`.
 *
 * ⚠️ EINE FRISCHE DATENBANK JE FALL (`beforeEach`): `devices.issi` und
 * `software_versions.value` sind unique (`_db/schema.ts:22`, `:69`), geteilte Zeilen liessen die
 * Faelle einander bedingen.
 */
const MIGRATIONEN = "src/app/m/radio/_db/migrations";

/**
 * Der Zeitpunkt, an dem `zuletztAktualisiertText` gemessen wird: 14.06.2026, 09:12 in Berlin
 * (dort UTC+2). Dieselbe Form und dieselbe Begruendung wie
 * `_lib/lesepfade/versionen.test.ts:45-46`.
 */
const ZEIT = new Date("2026-06-14T07:12:00Z");
const ZEIT_TEXT = "14.06.2026, 09:12";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-geraete-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

type GeraeteWerte = Partial<typeof devices.$inferInsert> & { id: string };

/** Ein Geraet; alles ausser `id` hat eine Vorgabe, die der Fall ueberschreibt. */
function g(werte: GeraeteWerte) {
  return {
    issi: `issi-${werte.id}`,
    createdAt: ZEIT,
    updatedAt: ZEIT,
    ...werte,
  };
}

function lege(...liste: GeraeteWerte[]): void {
  db.insert(devices)
    .values(liste.map(g))
    .run();
}

/** Eine Softwareversion; `isTarget` setzt der Fall. */
function version(wert: string, isTarget = false) {
  return { id: `v-${wert}`, value: wert, createdAt: ZEIT, sortOrder: 0, isTarget };
}

function ids(p: GeraetFilter): string[] {
  return geraeteListe(db, p).zeilen.map((z) => z.id);
}

describe("geraeteListe — die zehn Filter", () => {
  /**
   * ⛔ DER FALL, DEN `DeviceList.tsx:77-78` NAMENTLICH BEGRUENDET, woertlich: „Map every filter
   * key explicitly (not a spread) so that clearing a filter actually removes it from params."
   *
   * Ein Spread haette zwei Auspraegungen, und beide sind hier gefangen: ein Filter, der GAR
   * NICHT abgebildet ist (die Menge bleibt gleich gross, obwohl er greifen muesste), und ein
   * Filter, der sich nicht LEEREN laesst (die zweite Menge waere nicht echt groesser).
   */
  const BESTAND: GeraeteWerte[] = [
    {
      id: "a",
      status: "Einsatzbereit",
      location: "Funkraum",
      deviceType: "HRT",
      funktion: "Fuehrung",
      hersteller: "Sepura",
      deviceModes: "TMO",
      loanable: true,
      alamosIntegrated: true,
      updateNote: "Antenne locker",
      softwareVersion: "FW 1",
    },
    {
      id: "b",
      status: "Defekt",
      location: "Halle",
      deviceType: "MRT",
      funktion: "Trupp",
      hersteller: "Motorola",
      deviceModes: "DMO",
      loanable: false,
      alamosIntegrated: false,
      updateNote: "",
      softwareVersion: "FW 2",
    },
    {
      id: "c",
      status: "Wartung",
      location: "Werkstatt",
      deviceType: "FRT",
      funktion: "Reserve",
      hersteller: "Hytera",
      deviceModes: "REP",
      loanable: null,
      alamosIntegrated: null,
      updateNote: null,
      softwareVersion: null,
    },
  ];

  /**
   * Je Filter: der Wert, der genau „a" treffen soll, und die geleerte Fassung, mit der wieder
   * ALLE drei kommen muessen. `updateStand` haengt an der Ziel-Marke, die der Fall setzt.
   */
  const ZEHN: { name: string; gesetzt: GeraetFilter; geleert: GeraetFilter }[] = [
    { name: "updateStand", gesetzt: { updateStand: "aktuell" }, geleert: { updateStand: undefined } },
    { name: "status", gesetzt: { status: ["Einsatzbereit"] }, geleert: { status: [] } },
    { name: "lagerort", gesetzt: { lagerort: ["Funkraum"] }, geleert: { lagerort: [] } },
    { name: "geraeteTyp", gesetzt: { geraeteTyp: ["HRT"] }, geleert: { geraeteTyp: [] } },
    { name: "funktion", gesetzt: { funktion: ["Fuehrung"] }, geleert: { funktion: [] } },
    { name: "hersteller", gesetzt: { hersteller: ["Sepura"] }, geleert: { hersteller: [] } },
    {
      name: "geraeteFunktionen",
      gesetzt: { geraeteFunktionen: ["TMO"] },
      geleert: { geraeteFunktionen: [] },
    },
    { name: "ausleihbar", gesetzt: { ausleihbar: true }, geleert: { ausleihbar: false } },
    { name: "alamos", gesetzt: { alamos: true }, geleert: { alamos: false } },
    { name: "hatAbweichung", gesetzt: { hatAbweichung: true }, geleert: { hatAbweichung: false } },
  ];

  it("liefert die zehn Filter einzeln, und ein geleerter Filter verschwindet aus der Abfrage", () => {
    db.insert(softwareVersions).values(version("FW 1", true)).run();
    lege(...BESTAND);

    expect(ZEHN, "es sind ZEHN Filter (DeviceList.tsx:82-91)").toHaveLength(10);

    for (const f of ZEHN) {
      expect(ids(f.gesetzt), `${f.name} greift nicht`).toEqual(["a"]);
      const ohne = ids(f.geleert);
      expect(ohne.sort(), `${f.name} laesst sich nicht leeren`).toEqual(["a", "b", "c"]);
      expect(
        ohne.length > 1,
        `${f.name}: die zweite Menge ist nicht echt groesser`,
      ).toBe(true);
    }
  });

  it("geraeteFunktionen mit zwei Token verlangt BEIDE", () => {
    /*
     * ⛔ `AND`, NICHT `OR` (`radio-admin/server/src/repos/deviceRepo.ts:183-185`): „TMO,DMO"
     * heisst „beide", nicht „eines von beiden". Ein `OR` liefert hier zwei Zeilen statt einer.
     */
    lege(
      { id: "nur-tmo", deviceModes: "TMO" },
      { id: "beide", deviceModes: "TMO,DMO" },
    );

    expect(ids({ geraeteFunktionen: ["TMO", "DMO"] })).toEqual(["beide"]);
    expect(ids({ geraeteFunktionen: ["TMO"] }).sort()).toEqual(["beide", "nur-tmo"]);
  });

  it("ausleihbar filtert nur, wenn es wahr ist", () => {
    /*
     * ⛔ `deviceRepo.ts:186` ist `if (params.loanable)` — `ausleihbar: false` liefert damit ALLE
     * Geraete, auch die nicht ausleihbaren. Das ist die 1:1-Wahrheit, so unbequem sie ist:
     * „nicht ausleihbar" ist in dieser Maske nicht ausdrueckbar.
     */
    lege({ id: "ja", loanable: true }, { id: "nein", loanable: false }, { id: "leer" });

    expect(ids({ ausleihbar: true })).toEqual(["ja"]);
    expect(ids({ ausleihbar: false }).sort()).toEqual(["ja", "leer", "nein"]);
    expect(ids({}).sort()).toEqual(["ja", "leer", "nein"]);
  });

  it("hatAbweichung zaehlt eine leere Update-Anmerkung nicht mit", () => {
    /*
     * ⛔ `ne(updateNote, '')` (`deviceRepo.ts:188`). Die leere Zeichenkette ist ein GESETZTER,
     * aber leerer Wert — sie zaehlt NICHT als Abweichung, und die Projektion muss dasselbe
     * sagen wie der Filter.
     */
    lege(
      { id: "mit", updateNote: "Antenne locker" },
      { id: "leer", updateNote: "" },
      { id: "ohne", updateNote: null },
    );

    expect(ids({ hatAbweichung: true })).toEqual(["mit"]);

    const nachId = new Map(geraeteListe(db, {}).zeilen.map((z) => [z.id, z.hatAbweichung]));
    expect(nachId.get("mit")).toBe(true);
    expect(nachId.get("leer"), "Filter und Projektion sind auseinandergelaufen").toBe(false);
    expect(nachId.get("ohne")).toBe(false);
  });
});

describe("geraeteListe — die Freitextsuche", () => {
  it("ein unbekanntes Suchfeld liefert KEINE Zeile", () => {
    /*
     * ⛔ DER SICHERHEITSFALL (`deviceRepo.ts:168-172`, Kommentar `:169-170`: „never interpolate
     * unknown names into SQL"). Waren ALLE angeforderten Felder unbekannt, ist die Antwort
     * LEER — nicht die ungefilterte Liste, und schon gar nicht eine Interpolation.
     *
     * ⛔ DAS FIXTURE FORDERT AUSSCHLIESSLICH UNBEKANNTE FELDER AN. Stuende ein bekanntes daneben,
     * ueberlebte es die Allowlist, der `OR`-Zweig griffe, und der Fall bliebe gruen, auch wenn
     * der `sql`-Nullzweig ersatzlos entfiele.
     */
    lege({ id: "a", rufname: "Rotkreuz 1" });

    const seite = geraeteListe(db, { q: "Rotkreuz", suchfelder: ["quatsch", "notes"] });
    expect(seite.zeilen).toEqual([]);
    expect(seite.gesamt).toBe(0);
  });

  it("ohne gewaehlte Suchfelder gelten die sieben Vorgabefelder", () => {
    /*
     * `deviceRepo.ts:140` fuehrt die sieben, `:162` setzt sie ein, wenn nichts gewaehlt ist.
     * `bedieneinheit` ist waehlbar, aber NICHT vorgewaehlt (`SearchFieldPicker.tsx:16`, `:21`) —
     * daran haengt der Fall.
     */
    expect(SUCHFELDER_VORGABE).toHaveLength(7);
    expect([...SUCHFELDER_VORGABE]).toEqual([
      "rufname",
      "issi",
      "tei",
      "seriennummer",
      "zuordnung",
      "opta",
      "funktion",
    ]);

    lege(
      { id: "im-vorgabefeld", tei: "MARKE-1" },
      { id: "nur-bedieneinheit", bedieneinheit: "MARKE-1" },
    );

    expect(ids({ q: "MARKE-1" })).toEqual(["im-vorgabefeld"]);
    expect(ids({ q: "MARKE-1", suchfelder: [] })).toEqual(["im-vorgabefeld"]);
    expect(ids({ q: "MARKE-1", suchfelder: ["bedieneinheit"] })).toEqual(["nur-bedieneinheit"]);
    expect(ids({ q: "MARKE-1", suchfelder: ["tei", "bedieneinheit"] }).sort()).toEqual([
      "im-vorgabefeld",
      "nur-bedieneinheit",
    ]);
  });

  it("bietet genau die zwoelf waehlbaren Suchfelder an, und die sieben Vorgaben liegen darin", () => {
    /*
     * ⛔ DER STILLE VERTRAG MIT V13, UND ER IST SCHAERFER ALS DER DER SORTIERUNG. Ein
     * unbekannter Sortierschluessel faellt auf die Vorgabe zurueck und tut nichts. Waehlt die
     * Flaeche dagegen ausschliesslich ein Suchfeld, dessen Name hier nicht steht, greift der
     * Sicherheitszweig `sql`0`` (`deviceRepo.ts:168-172`) — und die Suche liefert fuer JEDEN
     * Begriff KEINE Zeile. Schriebe die Flaeche `location` und diese Datei `lagerort`, blieben
     * typecheck, lint, build und jeder Verhaltenstest gruen.
     *
     * ⛔ DIE TEILMENGENZUSICHERUNG IST DIE, DIE EINE UMBENENNUNG AUF BEIDEN SEITEN FAENGT: sie
     * bricht, sobald einer der beiden Namenssaetze allein wandert. Der Alt-Bestand hielt dafuer
     * zwei Kopien synchron (`deviceRepo.ts:139` mahnt es an) — in der Suite gibt es nur noch
     * diese eine Liste.
     *
     * Zwoelf waehlbare (`deviceRepo.ts:125-138`, `SearchFieldPicker.tsx:5-18`), sieben
     * vorgewaehlt (`deviceRepo.ts:140`, `SearchFieldPicker.tsx:21`).
     */
    expect(SUCHFELDER).toHaveLength(12);
    expect([...SUCHFELDER]).toEqual([
      "rufname",
      "issi",
      "tei",
      "seriennummer",
      "zuordnung",
      "opta",
      "funktion",
      "geraeteTyp",
      "lagerort",
      "hersteller",
      "bedieneinheit",
      "hiorgId",
    ]);
    for (const feld of SUCHFELDER_VORGABE) {
      expect(SUCHFELDER, `${feld} ist vorgewaehlt, aber gar nicht waehlbar`).toContain(feld);
    }
  });

  it("ohne Freitext bleiben die Suchfelder wirkungslos", () => {
    /*
     * Der aeussere `if (params.q)` (`deviceRepo.ts:159`): ohne Suchbegriff wird `searchFields`
     * gar nicht gelesen — auch ein unbekanntes Feld sperrt dann nichts aus.
     */
    lege({ id: "a" }, { id: "b" });
    expect(ids({ suchfelder: ["quatsch"] }).sort()).toEqual(["a", "b"]);
  });
});

describe("geraeteListe — Sortierung und Blaetterung", () => {
  it("ein unbekannter Sortierschluessel faellt auf createdAt absteigend zurueck", () => {
    /*
     * ⛔ KEIN FEHLER, KEINE INTERPOLATION (`deviceRepo.ts:196-201`): `if (col)` laesst die
     * Vorgabe `desc(devices.createdAt)` (`:195`) stehen.
     */
    lege(
      { id: "alt", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "neu", createdAt: new Date("2026-05-01T00:00:00Z") },
      { id: "mittel", createdAt: new Date("2026-03-01T00:00:00Z") },
    );

    expect(ids({ sortierung: "quatsch:asc" })).toEqual(["neu", "mittel", "alt"]);
    expect(ids({}), "die Vorgabe selbst").toEqual(["neu", "mittel", "alt"]);
  });

  it("lastUpdatedAt und createdAt sind sortierbar, obwohl die Oberflaeche sie nicht anbietet", () => {
    /*
     * ⛔ ENTSCHEIDUNG E-V9 (`.superpowers/sdd/planteil4/briefs/KOPF.md:708-733`), gegen den zu
     * engen Alt-Kommentar `deviceColumns.tsx:12-15` („sechs"): der Server fuehrt SIEBEN Spalten
     * (`deviceRepo.ts:113-121`) plus den `updateStand`-Sonderfall.
     *
     * ⛔ DIE ANLEGEREIHENFOLGE WIDERSPRICHT DER TAGESREIHENFOLGE. Faellt `lastUpdatedAt` aus der
     * Allowlist, greift die Vorgabe `desc(createdAt)` — und die ergibt hier eine ANDERE Folge.
     * Ohne diesen Widerspruch waere der Fall gegen genau jene Mutation blind.
     */
    lege(
      { id: "x", createdAt: new Date("2026-01-01T00:00:00Z"), lastUpdatedAt: "2026-08-03" },
      { id: "y", createdAt: new Date("2026-02-01T00:00:00Z"), lastUpdatedAt: "2026-08-01" },
      { id: "z", createdAt: new Date("2026-03-01T00:00:00Z"), lastUpdatedAt: "2026-08-02" },
    );

    expect(ids({ sortierung: "lastUpdatedAt:asc" })).toEqual(["y", "z", "x"]);
    expect(ids({ sortierung: "lastUpdatedAt:desc" })).toEqual(["x", "z", "y"]);
    expect(ids({ sortierung: "createdAt:asc" })).toEqual(["x", "y", "z"]);
  });

  it("nimmt genau die acht Sortierschluessel aus E-V9 an", () => {
    /*
     * ⛔ DIE LISTE IST DIE EINE WAHRHEIT, aus der V13 seine URL-Schluessel nimmt. Ein Schluessel,
     * den die Flaeche schreibt und diese Datei nicht kennt, faellt STILL auf die Vorgabe zurueck
     * — typecheck, lint, build und jeder Verhaltenstest blieben gruen.
     */
    expect(SORTIER_SCHLUESSEL).toHaveLength(8);
    expect([...SORTIER_SCHLUESSEL]).toEqual([
      "rufname",
      "issi",
      "status",
      "lagerort",
      "softwareVersion",
      "lastUpdatedAt",
      "createdAt",
      "updateStand",
    ]);
  });

  it("blaettert 1-basiert und deckelt die Seitengroesse bei 200", () => {
    /*
     * `deviceRepo.ts:192-193`: `page` mindestens 1, `pageSize` zwischen 1 und 200, Vorgabe 25.
     * Die Flaeche schickt 20 (`DeviceList.tsx:28`).
     */
    lege(
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `n${String(i).padStart(2, "0")}`,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
      })),
    );

    const erste = geraeteListe(db, { seitenGroesse: 20 });
    expect(erste.zeilen).toHaveLength(20);
    expect(erste.gesamt).toBe(30);
    expect(erste.seite).toBe(1);
    expect(erste.seitenGroesse).toBe(20);

    const zweite = geraeteListe(db, { seite: 2, seitenGroesse: 20 });
    expect(zweite.zeilen).toHaveLength(10);
    expect(zweite.zeilen[0]?.id).toBe("n09");

    expect(geraeteListe(db, {}).seitenGroesse, "Vorgabe 25").toBe(25);
    expect(geraeteListe(db, { seitenGroesse: 5000 }).seitenGroesse, "Deckel 200").toBe(200);
    expect(geraeteListe(db, { seite: 0 }).seite, "mindestens 1").toBe(1);
  });

  it("updateStand filtert VOR der Blaetterung", () => {
    /*
     * ⛔ DER FALL, DEN EIN NACHBAU IN JAVASCRIPT FALSCH MACHT (`deviceRepo.ts:189`,
     * Entscheidung E-V8). 25 Geraete, davon drei veraltet, Seitengroesse 20.
     *
     * ⛔ DIE DREI VERALTETEN SIND DIE AELTESTEN. Bei der Vorgabesortierung `desc(createdAt)`
     * liegen sie damit auf Position 23 bis 25 — wer erst nach `LIMIT 20` filtert, bekommt NULL
     * statt drei. Laegen sie oben, waere der Fall gegen genau diese Mutation blind.
     */
    db.insert(softwareVersions).values(version("FW 2", true)).run();
    lege(
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `n${String(i).padStart(2, "0")}`,
        createdAt: new Date(Date.UTC(2026, 0, i + 1)),
        softwareVersion: i < 3 ? "FW 1" : "FW 2",
      })),
    );

    const seite = geraeteListe(db, { updateStand: "veraltet", seitenGroesse: 20 });
    expect(seite.zeilen.map((z) => z.id).sort()).toEqual(["n00", "n01", "n02"]);
    expect(seite.gesamt, "auch die Gesamtzahl zaehlt die gefilterte Menge").toBe(3);
  });

  it("updateStand sortiert ueber denselben Ausdruck, mit dem er filtert", () => {
    /*
     * ⛔ E-V8: `deviceRepo.ts:198-199` schiebt den `statusExpr` in den `orderBy`, wenn der
     * Schluessel `updateStatus` heisst. Sortiert wird alphabetisch ueber das WORT —
     * „aktuell" < „unbekannt" < „veraltet".
     *
     * ⛔ DIE ANLEGEREIHENFOLGE IST EINE DRITTE, damit die Erwartung nicht schon aus der
     * Vorgabesortierung faellt.
     */
    db.insert(softwareVersions).values(version("FW 2", true)).run();
    lege(
      { id: "veraltet", softwareVersion: "FW 1", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "unbekannt", softwareVersion: null, createdAt: new Date("2026-03-01T00:00:00Z") },
      { id: "aktuell", softwareVersion: "FW 2", createdAt: new Date("2026-02-01T00:00:00Z") },
    );

    expect(ids({ sortierung: "updateStand:asc" })).toEqual(["aktuell", "unbekannt", "veraltet"]);
    expect(ids({ sortierung: "updateStand:desc" })).toEqual(["veraltet", "unbekannt", "aktuell"]);
  });
});

describe("der Kopplungsfall aus E-V8", () => {
  it("der SQL-Ausdruck der Liste und berechneUpdateStand stimmen ueber alle vier Eingabelagen ueberein", () => {
    /*
     * ⛔ ER LIEGT HIER UND NICHT IN V5, weil nur hier BEIDE Seiten existieren: die
     * TypeScript-Rechnung `berechneUpdateStand` (`_lib/updateStand.ts:48-55`) und der
     * SQL-Ausdruck der Liste. Der Alt-Kommentar sagt, dass genau das die Sorge war
     * (`deviceRepo.ts:149-152`: „SQL expression mirroring computeUpdateStatus(device, target)").
     *
     * Die vier Eingabelagen, jede einzeln benannt:
     *   1. Version NULL, Ziel NULL            -> unbekannt
     *   2. Version NULL, Ziel gesetzt         -> unbekannt
     *   3. Version gesetzt, Ziel NULL         -> veraltet   ⛔ der Zweig, den ein Nachbau
     *                                                          faelschlich „unbekannt" nennt
     *   4. Version gesetzt und GLEICH dem Ziel-> aktuell
     * Dazu die fuenfte, die aus 3 und 4 folgt: Version gesetzt und UNGLEICH -> veraltet.
     */
    const versionen: (string | null)[] = [null, "FW 1", "FW 2"];
    const ziele: (string | null)[] = [null, "FW 1"];

    for (const ziel of ziele) {
      sqlite.exec("DELETE FROM devices; DELETE FROM software_versions;");
      if (ziel !== null) db.insert(softwareVersions).values(version(ziel, true)).run();
      lege(
        ...versionen.map((v, i) => ({ id: `v${i}`, softwareVersion: v })),
      );

      const ausSql = new Map(geraeteListe(db, {}).zeilen.map((z) => [z.id, z.updateStand]));
      versionen.forEach((v, i) => {
        expect(
          ausSql.get(`v${i}`),
          `Lage: softwareVersion=${String(v)}, zielVersion=${String(ziel)}`,
        ).toBe(berechneUpdateStand(v, ziel));
      });
    }

    // Die dritte Lage noch einmal ausgeschrieben, damit sie nicht in der Schleife verschwindet.
    expect(berechneUpdateStand("FW 1", null)).toBe("veraltet");
  });
});

describe("geraeteKennzahlen", () => {
  it("zaehlt in EINER Abfrage und die vier Zahlen summieren sich auf gesamt", () => {
    /*
     * ⛔ EINE ABFRAGE MIT `GROUP BY`, nicht vier mit `pageSize: 1` (`Spec:4780-4784`,
     * Entscheidung E-V15). Gezaehlt wird, wie oft eine Anweisung ueber `devices` vorbereitet
     * wird, waehrend der Aufruf laeuft.
     *
     * ⛔ `gesamt` IST NICHT DIE SUMME DER DREI. Waere es das, waere die Summenzusicherung eine
     * Tautologie ohne Waechterwirkung — genau der Praezedenzfall dieses Hauses, in dem eine
     * Abschlusszeile „Paritaet gruen" als konstanten Text meldete. So faellt eine vergessene
     * Kategorie auf: sie erhoeht `gesamt`, landet aber in keiner der drei Zahlen.
     */
    db.insert(softwareVersions).values(version("FW 2", true)).run();
    lege(
      { id: "a1", softwareVersion: "FW 2" },
      { id: "a2", softwareVersion: "FW 2" },
      { id: "v1", softwareVersion: "FW 1" },
      { id: "u1", softwareVersion: null },
      { id: "u2", softwareVersion: null },
      { id: "u3", softwareVersion: null },
    );

    const echt = sqlite.prepare.bind(sqlite);
    let ueberGeraete = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqlite as any).prepare = (text: string) => {
      if (/\bdevices\b/.test(text)) ueberGeraete++;
      return echt(text);
    };
    let k: ReturnType<typeof geraeteKennzahlen>;
    try {
      k = geraeteKennzahlen(db);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sqlite as any).prepare = echt;
    }

    expect(ueberGeraete, "vier Rundlaeufe statt einer Gruppierung").toBe(1);
    expect(k).toEqual({ gesamt: 6, aktuell: 2, veraltet: 1, unbekannt: 3 });
    expect(
      k.aktuell + k.veraltet + k.unbekannt,
      "eine Kategorie faellt aus der Aufstellung heraus",
    ).toBe(k.gesamt);
  });

  it("zaehlt einen leeren Bestand als vier Nullen", () => {
    expect(geraeteKennzahlen(db)).toEqual({ gesamt: 0, aktuell: 0, veraltet: 0, unbekannt: 0 });
  });
});

describe("vorschlaege", () => {
  it("liefert genau acht Feldlisten", () => {
    /*
     * ⚠️ DIE ZAHL IM PLANTEXT STIMMT NICHT, GEMESSEN: der Alt-Endpunkt fuehrt NEUN Felder
     * (`radio-admin/server/src/routes/suggestions.ts:8-18`) — die acht hier plus `status`. Das
     * Formular nutzt genau diese acht (`DeviceFields.tsx:76-127`; der Plan nennt `:76-121` und schneidet
     * damit das achte Feld `assignedTo` ab, das auf `:122-127` steht — selbst nachgemessen); `status` bleibt draussen,
     * weil es eine feste Optionsliste hat (`radio-admin/shared/src/constants.ts:10-16`).
     *
     * ⛔ EIN AUFRUF LIEFERT ALLE (`Spec:4599-4601`), nicht acht Aufrufe.
     */
    lege({ id: "a", rufname: "Rotkreuz 1" });

    const alle = vorschlaege(db);
    expect(Object.keys(alle)).toHaveLength(8);
    expect(Object.keys(alle)).toEqual([
      "rufname",
      "geraeteTyp",
      "lagerort",
      "zuordnung",
      "opta",
      "funktion",
      "hersteller",
      "bedieneinheit",
    ]);
    expect([...VORSCHLAGSFELDER]).toEqual(Object.keys(alle));
    expect(Object.keys(alle), "status hat eine feste Optionsliste").not.toContain("status");
  });

  it("ueberspringt NULL und sortiert aufsteigend", () => {
    /*
     * `suggestions.ts:26-31`: `selectDistinct`, `isNotNull`, `orderBy(col)`.
     */
    lege(
      { id: "a", location: "Werkstatt" },
      { id: "b", location: "Funkraum" },
      { id: "c", location: "Funkraum" },
      { id: "d", location: null },
    );

    expect(vorschlaege(db).lagerort).toEqual(["Funkraum", "Werkstatt"]);
  });
});

describe("geraet — die Geraeteakte", () => {
  it("loest createdBy und updatedBy ueber users auf und faellt auf den rohen sub zurueck", () => {
    /*
     * ⛔ BEIDE HAELFTEN (`radio-admin/server/src/routes/devices.ts:89-95`): der bekannte `sub`
     * wird zum Namen, der unbekannte bleibt roh stehen — „so the field is never blank".
     * ⛔ UND DIE ROHEN `sub`s BLEIBEN DANEBEN (`:92`, das `...device`), sie werden nicht ersetzt.
     */
    db.insert(users)
      .values({ sub: "sub-bekannt", name: "Anna Beispiel", lastSeenAt: ZEIT })
      .run();
    lege({ id: "a", createdBy: "sub-bekannt", updatedBy: "sub-unbekannt" });

    const d = geraet(db, "a");
    expect(d?.angelegtVon).toBe("sub-bekannt");
    expect(d?.angelegtVonName).toBe("Anna Beispiel");
    expect(d?.geaendertVon).toBe("sub-unbekannt");
    expect(d?.geaendertVonName, "der Rueckfall auf den rohen sub fehlt").toBe("sub-unbekannt");
  });

  it("kommt ohne jeden Auditwert aus, ohne die Datenbank nach IN () zu fragen", () => {
    /*
     * `radio-admin/server/src/repos/userRepo.ts:25-26`, woertlich: „Empty input returns an empty
     * map without touching the db — avoids the invalid `IN ()` SQL that SQLite would reject."
     * Beide Spalten sind nullable (`_db/schema.ts:62-64`), der Fall ist der Normalfall.
     *
     * ⛔ DIE ZWEITE HAELFTE DES NAMENS WIRD GEMESSEN, NICHT NUR BEHAUPTET. Die drei
     * `null`-Zusicherungen gelten unabhaengig davon, ob `users` gefragt wurde — sie allein machten
     * den Fall zu einem Waechter, der seinen Namen nicht haelt (Fix-Runde 1 zu V6, Fund 1): die
     * Sonde auf `geraete.ts:604` ergab OHNE die Zaehlung unten 0 rot, MIT ihr 1 rot. Gezaehlt wird
     * deshalb, wie oft eine Anweisung ueber `users` vorbereitet wird, waehrend `geraet` laeuft —
     * dieselbe Technik wie in „zaehlt in EINER Abfrage…" (`geraete.test.ts:515-528`).
     */
    lege({ id: "a" });

    const echt = sqlite.prepare.bind(sqlite);
    let ueberNutzer = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqlite as any).prepare = (text: string) => {
      if (/\busers\b/.test(text)) ueberNutzer++;
      return echt(text);
    };
    let d: ReturnType<typeof geraet>;
    try {
      d = geraet(db, "a");
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sqlite as any).prepare = echt;
    }

    expect(d?.angelegtVon).toBeNull();
    expect(d?.angelegtVonName).toBeNull();
    expect(d?.geaendertVonName).toBeNull();
    expect(ueberNutzer, "die leere Eingabe fragt die Datenbank trotzdem nach IN ()").toBe(0);
  });

  it("liefert null fuer eine unbekannte Id", () => {
    /*
     * `devices.ts:84`: fehlt das Geraet, antwortet der Alt-Handler 404. In der Suite ist das
     * `null`, und die Seite ruft `notFound()`.
     */
    lege({ id: "a" });
    expect(geraet(db, "gibt-es-nicht")).toBeNull();
  });

  it("traegt die Akte-Felder, die die Listenzeile NICHT hat", () => {
    /*
     * ⛔ DER DETAILTYP IST WEITER ALS `GeraetZeile` und wird NICHT mit ihm zusammengelegt —
     * sonst wandern die Audit-Spalten in jede Listenzeile.
     *
     * `zuletztAktualisiertText` ist eine FERTIGE Zeichenkette, kein `Date`
     * (Bauform-Zulaessigkeitstafel Nr. 7, `.superpowers/sdd/planteil4/briefs/KOPF.md:320`).
     */
    db.insert(softwareVersions).values(version("FW 2", true)).run();
    lege({
      id: "a",
      notes: "Bemerkung",
      updateNote: "Antenne locker",
      hiorgId: "H-4711",
      softwareVersion: "FW 2",
      lastUpdatedAt: "2026-08-03",
    });

    const d = geraet(db, "a");
    expect(d?.notizen).toBe("Bemerkung");
    expect(d?.updateAnmerkung).toBe("Antenne locker");
    expect(d?.hiorgId).toBe("H-4711");
    expect(d?.zuletztAktualisiertText).toBe(ZEIT_TEXT);
    expect(d?.updateStand, "der Stand wird berechnet, nicht gelesen").toBe("aktuell");
    expect(d?.hatAbweichung).toBe(true);
    expect(d?.letztesUpdateText).toBe("2026-08-03");
  });
});

describe("GeraetZeile — der Feldsatz", () => {
  it("traegt genau die zwanzig Felder aus Spec:4542-4553", () => {
    /*
     * ⛔ EXAKTER FELDSATZABGLEICH AN EINER ECHTEN ZEILE. Der Waechter gegen eine hineinwandernde
     * Audit-Spalte: `createdBy`, `updatedBy`, `updatedAt` und `notes` gehoeren in `GeraetDetail`,
     * nicht in die Liste. Gegen den TYP allein waere das nicht pruefbar — ein Typ hat zur
     * Laufzeit keine Felder; deshalb misst der Fall die PROJEKTION.
     */
    lege({ id: "a" });

    const zeile = geraeteListe(db, {}).zeilen[0];
    expect(zeile).toBeDefined();
    expect(Object.keys(zeile!).sort()).toEqual([
      "alamos",
      "ausleihbar",
      "bedieneinheit",
      "funktion",
      "geraeteFunktionen",
      "geraeteTyp",
      "hatAbweichung",
      "hersteller",
      "id",
      "issi",
      "lagerort",
      "letztesUpdateText",
      "opta",
      "rufname",
      "seriennummer",
      "softwareVersion",
      "status",
      "tei",
      "updateStand",
      "zuordnung",
    ]);
    expect(Object.keys(zeile!)).toHaveLength(20);
  });

  it("faltet die rohe Statusspalte und den fehlenden Update-Tag zu Zeichenketten", () => {
    /*
     * ⚠️ BENANNTE ABWEICHUNG: `Spec:4544` fuehrt `status: string`, die Spalte ist aber nullable
     * (`_db/schema.ts:30`). Der Nullwert faellt auf die leere Zeichenkette — sichtbar aendert das
     * nichts, weil die Alt-Spalte `status` ohne Rueckfall rendert (`deviceColumns.tsx:23`).
     *
     * ⛔ `letztesUpdateText` WIRD NICHT GERECHNET (E-V11 Punkt 3): die Suite-Spalte IST die
     * Zeichenkette. Der Nullwert wird zum Gedankenstrich, 1:1 aus
     * `radio-admin/client/src/utils/format.ts:3`.
     *
     * ⚠️ UND DIE VERWECHSLUNG IN DER ALT-BESCHRIFTUNG WANDERT MIT: die Spalte „Letztes Update"
     * zeigt dort `softwareVersion` (`deviceColumns.tsx:34`). Die Zeile fuehrt deshalb BEIDES.
     */
    lege({ id: "a", status: null, lastUpdatedAt: null, softwareVersion: "FW 9" });

    const z = geraeteListe(db, {}).zeilen[0];
    expect(z?.status).toBe("");
    expect(z?.letztesUpdateText).toBe("—");
    expect(z?.softwareVersion, "die beiden Spalten sind nicht dieselbe").toBe("FW 9");
    expect(z?.ausleihbar, "NULL ist kein Wahrheitswert").toBe(false);
    expect(z?.alamos).toBe(false);
  });
});

describe("geraeteFuerExport", () => {
  it("liefert ALLE Geraete, auch nicht ausleihbare", () => {
    /*
     * ⛔ KEIN `loanable`-FILTER (`deviceRepo.ts:62-65`: „All devices, newest-first. Backs the
     * full CSV export"). Das ist der GEGENFALL zu `geraeteMitLeihstand`, wo das FEHLEN des
     * Filters der Fehler waere — der Alt-Bestand fuehrt beide Leser nebeneinander (`:53-59`
     * gegen `:63-65`). Ein Export, der stillschweigend nur ausleihbare Geraete traegt, ist ein
     * unvollstaendiger Datenbestand ohne Fehlermeldung.
     */
    lege(
      { id: "ja", loanable: true, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "nein", loanable: false, createdAt: new Date("2026-03-01T00:00:00Z") },
      { id: "leer", loanable: null, createdAt: new Date("2026-02-01T00:00:00Z") },
    );

    const alle = geraeteFuerExport(db);
    expect(alle.map((d) => d.id)).toEqual(["nein", "leer", "ja"]);
  });
});

describe("geraetFormWerte", () => {
  it("liefert den ROHEN Update-Tag, nicht den Gedankenstrich der Listenzeile", () => {
    /*
     * ⛔ DER FALL, DEN DIE ⬜ AN `letztesUpdateText` VORHERSAGT
     * (`_lib/lesepfade/geraete.ts:113-122`): „wer ihre Werte aus `letztesUpdateText` zieht,
     * belegt den Datumswaehler bei JEDEM Geraet ohne Tag mit dem Gedankenstrich". Ein Formular,
     * das `"—"` in seinen `DatePicker` legte, waere typkorrekt und lint-sauber — und schriebe
     * beim naechsten Speichern einen Diff auf einen Tag, den niemand eingegeben hat.
     *
     * ⛔ BEIDE LAGEN, sonst bestuende ein fest verdrahtetes `null` den Fall.
     */
    lege(
      { id: "ohne", lastUpdatedAt: null },
      { id: "mit", lastUpdatedAt: "2026-08-03", softwareVersion: "FW 2" },
    );

    expect(geraetFormWerte(db, "ohne")?.lastUpdatedAt, "der Gedankenstrich im Datumswaehler")
      .toBeNull();
    expect(geraeteListe(db, {}).zeilen.find((z) => z.id === "ohne")?.letztesUpdateText)
      .toBe("—");
    expect(geraetFormWerte(db, "mit")?.lastUpdatedAt).toBe("2026-08-03");
  });

  it("traegt genau die zwanzig schreibbaren Felder plus id und updateStand", () => {
    /*
     * ⛔ EXAKTER FELDSATZABGLEICH AN EINER ECHTEN ZEILE, wie beim Feldsatz von `GeraetZeile`
     * (`geraete.test.ts:680-715`): der Waechter dagegen, dass eine Auditspalte
     * (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`) in das Formular wandert. Gegen den
     * TYP allein waere das nicht pruefbar — ein Typ hat zur Laufzeit keine Felder.
     *
     * ⛔ UND DER STAND WIRD BERECHNET, NICHT GELESEN (E-V8): dieselbe Rechnung wie in `geraet()`.
     */
    db.insert(softwareVersions).values(version("FW 2", true)).run();
    lege({ id: "a", softwareVersion: "FW 2" });

    const w = geraetFormWerte(db, "a");
    expect(w).not.toBeNull();
    expect(Object.keys(w!).sort()).toEqual([
      "alamosIntegrated",
      "assignedTo",
      "bedieneinheit",
      "deviceModes",
      "deviceType",
      "funktion",
      "hersteller",
      "hiorgId",
      "id",
      "issi",
      "lastUpdatedAt",
      "loanable",
      "location",
      "notes",
      "opta",
      "rufname",
      "serialNumber",
      "softwareVersion",
      "status",
      "tei",
      "updateNote",
      "updateStand",
    ]);
    expect(Object.keys(w!)).toHaveLength(22);
    expect(w!.updateStand, "der Stand wird berechnet, nicht gelesen").toBe("aktuell");
  });

  it("liefert null, wenn es das Geraet nicht gibt", () => {
    /* Die Seite antwortet darauf mit `notFound()` (`devices.ts:84`), nicht mit einer Fehlerseite. */
    expect(geraetFormWerte(db, "gibtsNicht")).toBeNull();
  });
});

describe("updateKarten — die Karten des Update-Modus (E-V17b)", () => {
  it("traegt die gespeicherte Update-Anmerkung, die GeraetZeile nicht hat", () => {
    /*
     * ⛔ DER GRUND, AUS DEM ES DIESE FUNKTION UEBERHAUPT GIBT. Die Alt-Karte zeigt die
     * gespeicherte Anmerkung (`radio-admin/client/src/features/update/UpdateDeviceCard.tsx:74-78`),
     * weil sie eine bereits erfasste ISSI-Abweichung sichtbar macht; ohne sie schriebe der
     * Bedienende dieselbe Abweichung ein zweites Mal auf. `GeraetZeile` fuehrt dafuer nur
     * `hatAbweichung: boolean` — der Feldsatzfall oben haelt ihre zwanzig Felder exakt, sie
     * darf also NICHT verbreitert werden.
     *
     * ⛔ BEIDE RICHTUNGEN, sonst bestuende eine Fassung, die immer `null` zurueckgibt.
     */
    lege(
      { id: "mit", updateNote: "2026-08-01: echte ISSI 7654321" },
      { id: "ohne", updateNote: null },
    );

    const nachId = new Map(updateKarten(db, {}).map((k) => [k.id, k.updateAnmerkung]));
    expect(nachId.get("mit")).toBe("2026-08-01: echte ISSI 7654321");
    expect(nachId.get("ohne")).toBeNull();
  });

  it("uebernimmt Suche, Seitengroesse und Reihenfolge von geraeteListe", () => {
    /*
     * ⛔ SIE BAUT KEINE ZWEITE ABFRAGE — Filter, Freitextsuche, Sortierung und Blaetterung sind
     * der 1:1-Posten aus `listDevices` (`deviceRepo.ts:147-217`). Eine zweite Abschrift waere
     * die Stelle, an der eine Regel nur an einer von beiden ankommt.
     *
     * ⛔ DIE REIHENFOLGE IST DIE AUSSAGE, NICHT DIE MENGE: die Anmerkungen werden ueber
     * `inArray` NACHgeschlagen, und ein `ORDER BY` in jener zweiten Abfrage haette die erste
     * Ordnung still ueberschrieben. Deshalb `toEqual` auf der Id-Folge und nicht `sort()`.
     */
    lege(
      { id: "alt", rufname: "41/12", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "neu", rufname: "41/13", createdAt: new Date("2026-03-01T00:00:00Z") },
      { id: "fremd", rufname: "99/99", createdAt: new Date("2026-02-01T00:00:00Z") },
    );

    const gesucht = updateKarten(db, { q: "41/1", suchfelder: ["rufname"] });
    expect(gesucht.map((k) => k.id), "die Suche greift nicht oder ordnet anders").toEqual([
      "neu",
      "alt",
    ]);
    expect(updateKarten(db, { seitenGroesse: 1 }).map((k) => k.id)).toEqual(["neu"]);
  });

  it("ordnet jede Anmerkung IHREM Geraet zu, auch wenn die Reihenfolgen auseinanderlaufen", () => {
    /*
     * ⛔ DIE SONDE, DIE DIESEN FALL ERZWUNGEN HAT (S-V17z, Fix-Runde im Bau von V17): eine
     * erste Fassung verglich nur die Id-FOLGE, und eine Zuordnung ueber den INDEX statt ueber
     * die Id war fuer sie unsichtbar — `33 passed`, 0 rot. Der Nachschlag ueber `inArray` hat
     * KEIN `ORDER BY` und liefert in der Ordnung der Tabelle, waehrend `geraeteListe` mit
     * `desc(createdAt)` sortiert. Wo beide auseinanderlaufen, bekaeme jedes Geraet die
     * Anmerkung eines anderen — und auf dem Bildschirm stuende eine ISSI-Abweichung am
     * falschen Funkgeraet.
     *
     * ⛔ DAS FIXTURE MUSS DIE ZWEI ORDNUNGEN GEGENEINANDER STELLEN: eingefuegt wird alt vor
     * neu, gelistet wird neu vor alt. Bei gleichem `createdAt` fielen beide zusammen, und der
     * Fall waere 0 rot by construction.
     */
    lege(
      { id: "alt", updateNote: "A", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "neu", updateNote: "N", createdAt: new Date("2026-03-01T00:00:00Z") },
    );

    expect(updateKarten(db, {}).map((k) => [k.id, k.updateAnmerkung])).toEqual([
      ["neu", "N"],
      ["alt", "A"],
    ]);
  });

  it("liefert bei leerer Trefferliste eine leere Liste", () => {
    /*
     * ⚠️ GEMESSEN, UND DIE ERWARTUNG WAR FALSCH: eine erste Fassung dieses Falls behauptete,
     * ohne einen Kurzschluss WERFE die Abfrage am ungueltigen `IN ()` — dieselbe Begruendung,
     * die `namenFuer` (`userRepo.ts:25-26`) aus dem Alt-Bestand mitgebracht hat. Sonde S-V17aa
     * (den Kurzschluss entfernt): `33 passed`, **0 rot**. Die hier eingesetzte Drizzle-Fassung
     * uebersetzt `inArray(spalte, [])` in eine falsche Konstante und wirft nicht. ⛔ Der
     * Kurzschluss ist deshalb ERSATZLOS ENTFALLEN, statt als unbewachte Zeile stehenzubleiben
     * — eine Zusicherung ueber einer Fehlerform, die der Bestand gar nicht traegt, ist genau
     * die Klasse aus Ruling **R-V11-1**.
     */
    expect(updateKarten(db, { q: "gibtesnicht" })).toEqual([]);
  });

  it("traegt jedes Feld der Listenzeile weiter — genau eines kommt dazu", () => {
    /*
     * ⛔ DER WAECHTER GEGEN EINE ZWEITE PROJEKTION: `updateKarten` darf `GeraetZeile` nicht
     * beschneiden (dann fehlte der Karte der Update-Stand oder die ISSI) und nicht um Audit-
     * oder Rohspalten verbreitern (dann waere sie die Geraeteakte, `Spec:4542-4553`).
     * Gemessen an einer ECHTEN Zeile, nicht am Typ — ein Typ hat zur Laufzeit keine Felder.
     *
     * ⛔ JEDES FELD TRAEGT EINEN EIGENEN, NICHT LEEREN WERT — und das ist erzwungen, nicht
     * ordentlich: Sonde S-V17ab (`tei` auf den Vorgabewert gesetzt) blieb ueber einem Fixture
     * aus lauter Vorgaben **0 rot**, weil richtig und falsch dort dasselbe sind. Ein
     * Weitergabefall ueber einem symmetrischen Fixture misst seinen eigenen Namen nicht.
     */
    db.insert(softwareVersions).values(version("FW 9", true)).run();
    lege({
      id: "a",
      issi: "1234567",
      tei: "TEI-1",
      rufname: "41/12",
      opta: "HE FD 41/12",
      funktion: "Zugfuehrer",
      deviceType: "MTP3550",
      status: "Einsatzbereit",
      location: "Funkraum",
      hersteller: "Motorola",
      bedieneinheit: "TMR",
      deviceModes: "TMO,DMO",
      assignedTo: "Zug 1",
      serialNumber: "SN-1",
      loanable: true,
      alamosIntegrated: true,
      softwareVersion: "FW 9",
      updateNote: "Abweichung",
      lastUpdatedAt: "2026-08-03",
    });

    const zeile = geraeteListe(db, {}).zeilen[0]!;
    const karte = updateKarten(db, {})[0]!;
    expect(Object.keys(karte).sort()).toEqual([...Object.keys(zeile), "updateAnmerkung"].sort());
    /*
     * ⛔ UND DIE WERTE DAZU, NICHT NUR DIE SCHLUESSELNAMEN. Sonde S-V17ab (`tei: undefined`
     * ueber die Zeile gelegt): `33 passed`, **0 rot** — `Object.keys` sieht einen auf
     * `undefined` gesetzten Schluessel weiterhin. Ein Feldsatzabgleich allein bewacht also die
     * NAMEN und nicht die Weitergabe.
     */
    for (const [feld, wert] of Object.entries(zeile)) {
      expect(karte[feld as keyof typeof karte], `${feld} kommt nicht durch`).toEqual(wert);
    }
  });
});
