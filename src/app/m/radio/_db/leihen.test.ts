// src/app/m/radio/_db/leihen.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, isNull } from "drizzle-orm";
import { openModuleDatabase } from "@/core/db";
import * as schema from "./schema";
import { devices, loans, zugangscodes } from "./schema";
import { normalisiereSuchtext } from "../_lib/filter";
import { ENTLEIHER_MAX, ZUSTANDSNOTIZ_MAX } from "../_lib/meldungen";
import {
  geraeteMitLeihstand,
  offeneAusleihen,
  sucheEntleiher,
  bucheAusleihe,
  bucheRueckgabe,
  leihhistorie,
} from "./leihen";

/**
 * DIE FUENFTE TESTEBENE DES MODULS — der DB-Integrationstest gegen eine ECHTE SQLite-DATEI
 * (Spec 1 §8.1/§8.4, `docs/superpowers/specs/2026-08-17-radio-modul-design.md:6694-6710`).
 * Er ist keine Vitest-Ebene fuer reine Funktionen: er haengt an einer Datei, an zwei
 * Verbindungen und an den Pragmas, die `openModuleDatabase` setzt.
 *
 * ⛔ DIE DREI BAUFORM-AUFLAGEN DER ZWEI WAL-FAELLE SIND VERBINDLICH (Spec:5420-5435,
 * :6700-6710) — und die naheliegende Form kann die Zusage NICHT halten und ist trotzdem
 * gruen. Sie stehen hier vollstaendig, weil sie sonst beim naechsten Umbau verlorengehen:
 *
 *   1. ZWEI GETRENNTE VERBINDUNGEN, NICHT EINE. `better-sqlite3` ist synchron und
 *      verbindungsgebunden: ein Lesen auf DEMSELBEN Handle innerhalb der eigenen offenen
 *      Transaktion sieht deren eigenen Zustand und kann gar nicht in Konkurrenz geraten.
 *      Ein Test, der eine Transaktion oeffnet und danach auf derselben Verbindung liest,
 *      KANN NICHT ROT WERDEN — er prueft nichts (Spec:5420-5424). Also
 *      `const schreiber = openModuleDatabase(pfad)` UND `const leser = openModuleDatabase(pfad)`.
 *   2. EINE DATEI, KEIN `:memory:`. Zwei `:memory:`-Handles sind zwei VERSCHIEDENE
 *      Datenbanken; der Test liefe an der Frage vorbei (Spec:5427-5429). Pfad aus
 *      `os.tmpdir()`, im `afterEach` entfernt.
 *   3. DER TEST PRUEFT SEINE EIGENE VORAUSSETZUNG. Erste Zusicherung ist die
 *      `journal_mode`-Probe auf dem LESER (Spec:5430-5435). Damit haengt die Aussage nicht
 *      an einer Behauptung ueber `openModuleDatabase`, sondern MISST sie — und wenn ein
 *      spaeterer Umbau von `src/core/db/index.ts:18` WAL entfernt, faellt genau dieser
 *      Fall, statt still weiterzulaufen.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (`.superpowers/sdd/planteil3/KONTEXT.md:95-97`):
 * dessen Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR`
 * (`src/core/db/index.ts:31-35`) — ein Test, der ihn benutzt, bekaeme die Datenbank des
 * vorigen Tests. Vorbild: `src/app/m/radio/_db/migrations.test.ts:29-37`.
 *
 * ⚠️ DIE DATENBANK ENTSTEHT UEBER `openModuleDatabase` UND NICHT UEBER `new Database(...)`,
 * anders als in `migrations.test.ts:34`: nur so tragen die Handles dieses Tests dieselben
 * vier Pragmas wie der Betrieb (`src/core/db/index.ts:18-21`), und nur so kann der
 * `busy_timeout`-Fall die gesetzte Zahl ueberhaupt ablesen.
 */
const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const LEIHEN_QUELLE = "src/app/m/radio/_db/leihen.ts";

/** Der Ausleihzeitpunkt aller Fixtures: 14.06.2026, 09:12 in Berlin (dort UTC+2). */
const AUSGELIEHEN_AM = new Date("2026-06-14T07:12:00Z");
const AUSGELIEHEN_UHRZEIT = "09:12";
const AUSGELIEHEN_DATUM_UHRZEIT = "14.06.2026, 09:12";

let tmp: string;
let pfad: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-leihen-"));
  pfad = join(tmp, "radio.db");
  sqlite = openModuleDatabase(pfad);
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Ein Geraet mit ALLEN 25 Spalten gefuellt (`_db/schema.ts:19-65`).
 *
 * ⛔ DAS IST DER PUNKT DIESES HELFERS UND KEINE GRUENDLICHKEIT: der Lesemodell-Fall unten
 * kann nur dann zeigen, dass `geraeteMitLeihstand` beschneidet, wenn in der Quellzeile
 * ueberhaupt etwas zu beschneiden ist. Ein Fixture mit vier gesetzten Spalten liesse ein
 * `select()` ueber alle Spalten gruen durchlaufen.
 */
function geraet(werte: Partial<typeof devices.$inferInsert> & { id: string; issi: string }) {
  db.insert(devices)
    .values({
      rufname: `Ruf ${werte.id}`,
      tei: "0011223344556677",
      serialNumber: `SN-${werte.id}`,
      deviceType: "Motorola MTP3550",
      status: "Einsatzbereit",
      location: "Fahrzeughalle",
      assignedTo: "Zugtrupp",
      softwareVersion: "MR2022.3",
      lastUpdatedAt: "2026-05-01",
      notes: "Antenne getauscht",
      hiorgId: "hio-1",
      opta: "HE DRK MUE 12/83",
      funktion: "Handfunkgeraet",
      hersteller: "Motorola",
      bedieneinheit: "keine",
      deviceModes: "TMO,DMO",
      alamosIntegrated: false,
      loanable: true,
      updateNote: "nichts offen",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      updatedAt: new Date("2026-05-01T10:00:00Z"),
      createdBy: "sub-anlegerin",
      updatedBy: "sub-pflegerin",
      ...werte,
    })
    .run();
}

/** Eine Leihe, die nur in den Feldern abweicht, die der jeweilige Fall braucht. */
function leihe(werte: Partial<typeof loans.$inferInsert> & { deviceId: string }) {
  db.insert(loans)
    .values({
      snapshotCallSign: `Ruf ${werte.deviceId}`,
      borrowerName: "Anna Beispiel",
      borrowedAt: AUSGELIEHEN_AM,
      createdAt: AUSGELIEHEN_AM,
      updatedAt: AUSGELIEHEN_AM,
      ...werte,
    })
    .run();
}

/** Der exakte Feldsatz einer Zeile OHNE aktive Leihe (Spec:4082-4084, :5248-5251). */
const FELDER_FREI = ["id", "rufname", "geraetetyp", "standort", "status", "suchschluessel"];
/** Derselbe Satz mit den zwei Feldern der aktiven Leihe (Spec:4082-4084). */
const FELDER_VERGEBEN = [...FELDER_FREI, "entleiher", "seit"];

describe("radio-leihen: das Lesemodell der Geraeteliste", () => {
  it("reicht keine Audit- und keine Software-Spalte an die Ausleihe durch", () => {
    /*
     * ⛔ `Object.keys()` AUF GLEICHHEIT, NICHT AUF TEILMENGE (Spec:5254-5258, woertlich:
     * „eine Teilmengenpruefung faengt genau den Fall nicht, gegen den der Test steht").
     * Die Sonde S-A15a haengt genau daran: ein zusaetzliches Feld `seriennummer` an
     * `GeraetMitLeihstand` laesst eine Teilmengenpruefung GRUEN und diese hier ROT.
     *
     * ⛔ BEIDE GESTALTEN, weil die Zeile zwei hat: ohne aktive Leihe sechs Felder, mit
     * aktiver Leihe acht. Ein Fall, der nur die erste prueft, liesse ein durchgereichtes
     * Audit-Feld an der zweiten unbemerkt.
     */
    geraet({ id: "g-frei", issi: "1000001" });
    geraet({ id: "g-vergeben", issi: "1000002" });
    leihe({ deviceId: "g-vergeben" });

    const zeilen = geraeteMitLeihstand(db);
    const frei = zeilen.find((z) => z.id === "g-frei");
    const vergeben = zeilen.find((z) => z.id === "g-vergeben");
    expect(frei, "Fixture g-frei fehlt in der Ausgabe").toBeDefined();
    expect(vergeben, "Fixture g-vergeben fehlt in der Ausgabe").toBeDefined();

    expect(Object.keys(frei!).sort()).toEqual([...FELDER_FREI].sort());
    expect(Object.keys(vergeben!).sort()).toEqual([...FELDER_VERGEBEN].sort());

    // ⛔ UND DIE VIER NAMEN AUSDRUECKLICH (Spec:5257-5258). Sie stehen zusaetzlich zur
    // Gleichheitspruefung da, weil sie den AUSFALL benennen, gegen den der Fall steht —
    // eine gescheiterte Gleichheit sagt „andere Schluessel", diese Zeile sagt welche.
    for (const verboten of ["softwareVersion", "tei", "createdBy", "updatedAt"]) {
      expect(Object.keys(vergeben!), `${verboten} reist in die Ausleihe mit`).not.toContain(
        verboten,
      );
    }
  });

  it("zeigt nur freigegebene Geraete — loanable false und loanable NULL fallen heraus", () => {
    /*
     * ⛔ FUND F1 DER SCHLUSSPRUEFUNG, BETREIBERENTSCHEIDUNG VOM 2026-08-24: dieser Lesepfad
     * filtert `loanable`, wie der ersetzte Endpunkt. Ohne den Filter erscheint ein als nicht
     * verleihbar gekennzeichnetes Geraet auf der Ausleihflaeche als „Verfuegbar", ist
     * antippbar, und der Vorgang scheitert erst beim Absenden (`bucheAusleihe` →
     * `NICHT_FREIGEGEBEN`, unten in dieser Datei). Der Import traegt die Spalte am Tag eins
     * mit (`scripts/import/radio.ts:279`).
     *
     * ⛔ DIE NULL-SEMANTIK IST GEMESSEN, NICHT GERATEN — und dieser Fall ist die Messung.
     * Der ersetzte Endpunkt lautet `.where(eq(devices.loanable, true))`
     * (`radio-admin/server/src/repos/deviceRepo.ts:53-59`, der Filter an `:57`); die Spalte
     * steht dort als `integer('loanable', { mode: 'boolean' })`
     * (`radio-admin/server/src/db/schema.ts:32`), Drizzle setzt `true` also auf `1`. In
     * SQLite ist `NULL = 1` weder wahr noch falsch, sondern NULL — DIE NULL-ZEILE FAELLT
     * ALSO HERAUS. Der Schreibweg des Bestands entscheidet gleich
     * (`radio-admin/server/src/routes/loanApi.ts:166`: `if (!device.loanable)`), und
     * `bucheAusleihe` bildet genau das schon ab.
     *
     * ⛔ DREI ZEILEN UND NICHT ZWEI: ohne die NULL-Zeile bliebe dieser Fall gruen, wenn
     * jemand den Filter zu „ungleich false" abschwaecht — die eine Form, die die gemessene
     * Semantik verfehlt, ohne dass es auffiele.
     *
     * ⚠️ `offeneAusleihen` FILTERT BEWUSST NICHT MIT (siehe dort): der Bestand haelt die zwei
     * ausdruecklich auseinander (`loanApi.ts:131-132`), damit eine Leihe auf einem
     * nachtraeglich gesperrten Geraet nicht aus der Rueckgabe verschwindet.
     */
    geraet({ id: "g-loanable-ja", issi: "1100001", loanable: true });
    geraet({ id: "g-loanable-nein", issi: "1100002", loanable: false });
    geraet({ id: "g-loanable-null", issi: "1100003", loanable: null });

    const ids = geraeteMitLeihstand(db).map((z) => z.id);
    expect(ids, "das freigegebene Geraet fehlt in der Liste").toContain("g-loanable-ja");
    expect(ids, "loanable = false erscheint auf der Ausleihflaeche").not.toContain(
      "g-loanable-nein",
    );
    expect(ids, "loanable = NULL erscheint auf der Ausleihflaeche").not.toContain(
      "g-loanable-null",
    );
  });

  it("traegt die Seriennummer im Suchschluessel und in keinem Feld der Zeile", () => {
    /*
     * ⛔ DER WIRKNACHWEIS FUER §4.1 PUNKT 2, DEN A13 SCHULDIG BLEIBEN MUSSTE
     * (`.superpowers/sdd/planteil3/progress.md:354-372`, REVIEW-A13 Fund K3): die zweite
     * Haelfte des A13-Falles liest `Object.entries()` einer TESTEIGENEN Hilfsfunktion und
     * ist damit gegen jede Mutation in `_lib/filter.ts` immun. Der Lesepfad, der den
     * `suchschluessel` wirklich baut, entsteht erst HIER — ein Scan ueber eine Datei, die
     * es damals nicht gab, waere leer-gruen gewesen.
     *
     * ⛔ DIE ZIFFERNFOLGE IST DER ANKER UND NICHT DAS WORT: `normalisiereSuchtext`
     * (`_lib/filter.ts:108-115`) schreibt klein und zerlegt Diakritika, laesst Ziffern
     * aber unberuehrt. Ein Anker auf „ZETA" fiele allein an der Kleinschreibung; ein
     * Anker auf „9931" trifft die Seriennummer in JEDER Schreibweise, in der sie in ein
     * Feld der Zeile geraten koennte.
     */
    const SERIENNUMMER = "SN-ZETA-9931";
    geraet({ id: "g-serie", issi: "1000003", serialNumber: SERIENNUMMER });

    const zeile = geraeteMitLeihstand(db).find((z) => z.id === "g-serie");
    expect(zeile).toBeDefined();

    expect(
      zeile!.suchschluessel,
      "die Seriennummer geht NICHT in den Suchschluessel ein — die Suche der Insel findet sie nie",
    ).toContain(normalisiereSuchtext(SERIENNUMMER));

    for (const [name, wert] of Object.entries(zeile!)) {
      if (name === "suchschluessel") continue;
      expect(
        typeof wert === "string" ? wert : "",
        `die Seriennummer reist im Feld ${name} in den Client (§4.1 Punkt 2)`,
      ).not.toContain("9931");
    }
  });

  it("legt den Leihstand ueber den Zustand und liefert fertige Zeichenketten", () => {
    /*
     * `ON_LOAN` kommt NIE aus der Spalte `devices.status`, sondern aus `loans`
     * (`_lib/status.ts:44-46`). Und `seit` ist eine FERTIGE Zeichenkette, kein `Date`
     * (§4.1 Punkt 1, Spec:3338-3342) — sonst entscheiden Server und Client an der
     * Tagesgrenze verschieden.
     */
    geraet({ id: "g-vergeben", issi: "1000004", status: "Einsatzbereit" });
    leihe({ deviceId: "g-vergeben", borrowerName: "Max Mustermann" });

    const zeile = geraeteMitLeihstand(db).find((z) => z.id === "g-vergeben");
    expect(zeile?.status).toBe("ON_LOAN");
    expect(zeile?.entleiher).toBe("Max Mustermann");
    expect(zeile?.seit).toBe(AUSGELIEHEN_UHRZEIT);
  });

  it("faellt fuer ein Geraet ohne erfassten Zustand auf frei zurueck", () => {
    /*
     * ⬜ A-L13, die Betreiberentscheidung vom 2026-08-22
     * (`.superpowers/sdd/planteil3/progress.md:22-32`). Der Faltungsort ist
     * `_lib/status.ts:177-188` und diese Datei deklariert ihn NICHT ein zweites Mal
     * (`progress.md:236-246`) — dieser Fall belegt, dass der Lesepfad ihn wirklich
     * benutzt und die rohe Spalte nicht durchreicht.
     */
    geraet({ id: "g-ohne", issi: "1000005", status: null });
    expect(geraeteMitLeihstand(db).find((z) => z.id === "g-ohne")?.status).toBe("AVAILABLE");
  });

  it("blendet eine zurueckgegebene Leihe aus und vervielfacht keine Zeile", () => {
    /*
     * ⛔ DER WAECHTER UEBER `isNull(loans.returnedAt)` IM `leftJoin`. Ohne diese Bedingung
     * traegt ein laengst zurueckgegebenes Geraet auf der zentralen Leseflaeche weiter
     * `ON_LOAN`, den alten Entleihernamen und die alte Uhrzeit — und ein Geraet mit
     * aktiver UND alter Leihe bekommt ZWEI Zeilen. Beides ist gueltiges Drizzle und
     * gueltiges SQL; nur ein Fixture mit ZWEI Leihen zum selben Gegenstand sieht es.
     *
     * ⛔ DIE ZWEITE HAELFTE IST NICHT DIE ERSTE IN ANDERER SCHREIBWEISE: die erste faengt
     * das Durchreichen einer toten Leihe, die zweite die Vervielfachung. Ein `leftJoin`
     * ohne die Bedingung braeche beide, ein falsch gesetztes `distinct` nur die erste.
     *
     * ⚠️ DER FELDSATZ WIRD MITGEPRUEFT (`FELDER_FREI`): `entleiher` und `seit` duerfen an
     * einer freien Zeile nicht nur leer sein, sie duerfen GAR NICHT dastehen
     * (Spec:4082-4084) — sonst ruecken sie ueber die RSC-Grenze als `undefined` mit.
     */
    geraet({ id: "g-zurueck", issi: "1000007" });
    geraet({ id: "g-beide", issi: "1000008" });
    leihe({
      deviceId: "g-zurueck",
      borrowerName: "Carla Beispiel",
      returnedAt: new Date("2026-06-15T07:12:00Z"),
    });
    leihe({
      deviceId: "g-beide",
      borrowerName: "Dora Beispiel",
      borrowedAt: new Date("2026-06-01T07:12:00Z"),
      returnedAt: new Date("2026-06-02T07:12:00Z"),
    });
    leihe({ deviceId: "g-beide", borrowerName: "Erna Beispiel" });

    const zeilen = geraeteMitLeihstand(db);

    const zurueck = zeilen.filter((z) => z.id === "g-zurueck");
    expect(zurueck, "die zurueckgegebene Leihe vervielfacht die Geraetezeile").toHaveLength(1);
    expect(
      zurueck[0]?.status,
      "eine zurueckgegebene Leihe haelt das Geraet weiter auf ON_LOAN",
    ).toBe("AVAILABLE");
    expect(Object.keys(zurueck[0]!).sort(), "der alte Entleiher reist an der freien Zeile mit")
      .toEqual([...FELDER_FREI].sort());

    const beide = zeilen.filter((z) => z.id === "g-beide");
    expect(beide, "das Geraet mit alter UND aktiver Leihe steht mehrfach in der Liste")
      .toHaveLength(1);
    expect(beide[0]?.status).toBe("ON_LOAN");
    expect(beide[0]?.entleiher, "die ALTE Leihe hat die aktive verdraengt").toBe("Erna Beispiel");
  });

  it("nimmt die issi als Rufnamen, wenn das Geraet keinen traegt", () => {
    /*
     * `devices.rufname` ist NULLABLE (`_db/schema.ts:21`), `GeraetMitLeihstand.rufname`
     * ist es nicht (Spec:4082-4084) — und der Alt-Schreibweg faltet an derselben Stelle
     * (`radio-admin/server/src/routes/loanApi.ts:173`:
     * `snapshotCallSign: device.rufname ?? device.issi`). Ohne diesen Fall traegt die
     * Zusammenfaltung nur einer der beiden Pfade, und die Ausleihe eines Geraets ohne
     * Rufnamen scheitert am `NOT NULL` von `snapshot_call_sign` (`_db/schema.ts:214`).
     */
    geraet({ id: "g-namenlos", issi: "1000006", rufname: null });
    expect(geraeteMitLeihstand(db).find((z) => z.id === "g-namenlos")?.rufname).toBe("1000006");
  });
});

describe("radio-leihen: die offenen Ausleihen", () => {
  it("liefert Rufname, Entleiher und einen fertigen Zeitpunkt, neueste zuerst", () => {
    geraet({ id: "g-1", issi: "2000001" });
    geraet({ id: "g-2", issi: "2000002" });
    leihe({ deviceId: "g-1", snapshotCallSign: "41/12", borrowerName: "Anna Beispiel" });
    leihe({
      deviceId: "g-2",
      snapshotCallSign: "41/13",
      borrowerName: "Bea Beispiel",
      borrowedAt: new Date("2026-06-15T07:12:00Z"),
    });
    // Eine zurueckgegebene Leihe gehoert NICHT in die Liste — `returned_at IS NULL` heisst
    // „aktive Leihe" (`_db/schema.ts:199`).
    leihe({
      deviceId: "g-1",
      snapshotCallSign: "41/12",
      borrowerName: "Carla Beispiel",
      borrowedAt: new Date("2026-06-10T07:12:00Z"),
      returnedAt: new Date("2026-06-11T07:12:00Z"),
    });

    const offen = offeneAusleihen(db);
    expect(offen.map((o) => o.entleiher)).toEqual(["Bea Beispiel", "Anna Beispiel"]);
    expect(offen[1]?.rufname).toBe("41/12");
    expect(offen[1]?.seitText).toBe(AUSGELIEHEN_DATUM_UHRZEIT);
    expect(Object.keys(offen[0]!).sort()).toEqual(
      ["id", "rufname", "entleiher", "seitText"].sort(),
    );
  });
});

describe("radio-leihen: die Namensvorschlaege", () => {
  it("liefert hoechstens deckel Vorschlaege und nichts unter zwei Zeichen", () => {
    /*
     * ⛔ DER DECKEL GREIFT NACH DEM FILTERN, NIE ALS `LIMIT` IM SQL. Die Fixtures sind so
     * gebaut, dass die falsche Reihenfolge auffaellt: DREI nicht passende Namen tragen
     * die NEUESTEN Zeitpunkte und stuenden bei einem `limit(3)` vor jedem Treffer — ein
     * `limit` im SQL lieferte danach NULL Vorschlaege, obwohl vier passen.
     *
     * ⛔ ZWEI ZEICHEN, NICHT EINES (Spec:5119-5121): ohne die Schwelle liefert
     * `sucheEntleiher(db, "")` einem ANONYMEN Aufrufer die vollstaendige Namensliste des
     * Retentionsfensters.
     */
    geraet({ id: "g-v", issi: "3000001" });
    const namen = [
      ["Mustermann Anna", "2026-06-01T10:00:00Z"],
      ["Mustermann Bea", "2026-06-02T10:00:00Z"],
      ["Mustermann Carla", "2026-06-03T10:00:00Z"],
      ["Mustermann Dora", "2026-06-04T10:00:00Z"],
      ["Zimmermann Emil", "2026-06-20T10:00:00Z"],
      ["Zimmermann Frida", "2026-06-21T10:00:00Z"],
      ["Zimmermann Greta", "2026-06-22T10:00:00Z"],
    ] as const;
    for (const [name, zeit] of namen) {
      leihe({
        deviceId: "g-v",
        borrowerName: name,
        borrowedAt: new Date(zeit),
        returnedAt: new Date(zeit),
      });
    }

    const drei = sucheEntleiher(db, "mustermann", 3);
    expect(drei).toHaveLength(3);
    for (const v of drei) expect(v.name).toContain("Mustermann");
    // Neueste zuerst (`radio-admin/server/src/repos/loanRepo.ts:181`).
    expect(drei[0]?.name).toBe("Mustermann Dora");

    /*
     * ⛔ DER VORGABEWERT 10 — DER AUFRUF OHNE DRITTEN PARAMETER. Die Zahl steht „HIER UND
     * NUR HIER". Der Brief bindet ihn an die Datenfunktion und haelt A17 ausdruecklich
     * davon ab, einen zweiten daneben zu setzen (`briefs/KOPF.md:487-490`) — sie ist damit
     * die einzige Grenze der Namensauskunft eines ANONYMEN Aufrufers. Ohne einen
     * Aufruf, der MEHR passende Namen vorfindet als der Vorgabewert zulaesst, ist sie
     * unbewacht — mit `deckel = 3` bliebe jeder andere Fall dieser Datei gruen.
     * ⛔ `toHaveLength(10)`, NICHT `toBeLessThanOrEqual(10)`: eine Obergrenze faengt genau
     * den Fall nicht, in dem der Vorgabewert nach unten verrutscht.
     */
    for (let i = 1; i <= 11; i++) {
      const zeit = new Date(`2026-05-${String(i).padStart(2, "0")}T10:00:00Z`);
      leihe({
        deviceId: "g-v",
        borrowerName: `Deckelmann ${String(i).padStart(2, "0")}`,
        borrowedAt: zeit,
        returnedAt: zeit,
      });
    }
    expect(
      sucheEntleiher(db, "deckelmann"),
      "der Vorgabewert des Deckels ist nicht 10",
    ).toHaveLength(10);

    expect(sucheEntleiher(db, "m"), "ein Zeichen genuegt nicht").toEqual([]);
    expect(sucheEntleiher(db, "  "), "Leerraum genuegt nicht").toEqual([]);
    expect(sucheEntleiher(db, ""), "keine Auflistung ohne Suchtext").toEqual([]);
  });

  it("ein Vorschlag traegt name UND zuletztText", () => {
    /*
     * ⛔ `Vorschlag` IST KEIN `string` (Spec:5029-5035): „eine Signatur `string[]` waere
     * genau der Posten, der beim Port STILL verschwindet". Und `zuletztText` ist eine
     * FERTIGE Zeichenkette — kein Zeitstempel in Millisekunden verlaesst den Server
     * (Spec:5122-5123).
     */
    geraet({ id: "g-v2", issi: "3000002" });
    /*
     * ⛔ ZWEI LEIHEN DESSELBEN NAMENS, UND ZWAR ABSICHTLICH — sie tragen die zwei
     * Zusicherungen unten, die es ohne sie nicht gaebe:
     *   • `groupBy(loans.borrowerName)` entdoppelt („Distinct borrower-name suggestions",
     *     `radio-admin/server/src/repos/loanRepo.ts:163-166`). Ohne die Gruppierung
     *     erscheint derselbe Name so oft, wie die Person geliehen hat, und der Deckel 10
     *     ist von einem einzigen Vielleiher aufgebraucht.
     *   • `max(borrowed_at)` nimmt die NEUERE der beiden. Mit `min` stuende in der
     *     Nebenzeile der aelteste Zeitpunkt — ein stiller Datenfehler, den kein
     *     Einzelfixture zeigt, weil dort beide Aggregate dasselbe liefern.
     */
    leihe({
      deviceId: "g-v2",
      borrowerName: "Anna Beispiel",
      borrowedAt: new Date("2026-03-02T07:12:00Z"),
      returnedAt: new Date("2026-03-02T09:12:00Z"),
    });
    leihe({
      deviceId: "g-v2",
      borrowerName: "Anna Beispiel",
      borrowedAt: AUSGELIEHEN_AM,
      returnedAt: AUSGELIEHEN_AM,
    });

    const vorschlaege = sucheEntleiher(db, "beispiel");
    expect(vorschlaege, "derselbe Name erscheint mehrfach — die Entdopplung fehlt").toHaveLength(
      1,
    );
    const [vorschlag] = vorschlaege;
    expect(vorschlag).toBeDefined();
    expect(Object.keys(vorschlag!).sort()).toEqual(["name", "zuletztText"].sort());
    expect(vorschlag!.name).toBe("Anna Beispiel");
    expect(typeof vorschlag!.zuletztText).toBe("string");
    expect(vorschlag!.zuletztText, "die Nebenzeile traegt nicht die JUENGSTE der zwei Leihen")
      .toContain(AUSGELIEHEN_DATUM_UHRZEIT);
  });

  it("findet auch ohne Umlaut, weil die Faltung in JavaScript laeuft", () => {
    /*
     * Die Suche dieses Moduls faltet in JAVASCRIPT und NICHT in SQL — `_db/client.ts:4-13`
     * schreibt genau das aus und nennt die Folge einer Umkehr: `radio` braeuchte dann
     * einen eigenen Opener nach `lagerbuch`-Muster. Der Alt-Bestand faltet in SQL, mit
     * einer registrierten Funktion `lower_u` (`loanRepo.ts:179`), die es hier nicht gibt.
     * SQLites eingebautes `LIKE` faltet nur ASCII — „muller" faende „Müller" dort NIE.
     */
    geraet({ id: "g-v3", issi: "3000003" });
    leihe({
      deviceId: "g-v3",
      borrowerName: "Müller",
      borrowedAt: AUSGELIEHEN_AM,
      returnedAt: AUSGELIEHEN_AM,
    });
    expect(sucheEntleiher(db, "muller").map((v) => v.name)).toEqual(["Müller"]);
  });
});

describe("radio-leihen: die vier Riegel des Schreibpfads", () => {
  it("lehnt ein unbekanntes Geraet ab", () => {
    const ergebnis = bucheAusleihe(db, {
      geraeteIds: ["g-gibtsnicht"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.grund).toBe("verschwunden");
    expect(ergebnis.text.length).toBeGreaterThan(0);
    // ⛔ KEINE TECHNISCHE KENNUNG IM SATZ (`_lib/meldungen.ts:36-37`, Spec:3549-3550).
    expect(ergebnis.text, "die Geraete-Id steht im Bildschirmtext").not.toContain("g-gibtsnicht");
  });

  it("lehnt ein nicht verleihbares Geraet ab", () => {
    /*
     * ⛔ DIE REIHENFOLGE IST DIE AUSSAGE (Spec:5264-5268): Geraet lesen → `loanable` →
     * `mapDeviceCondition`. Das zweite Fixture ist der EINZIGE Weg, sie zu sehen — es ist
     * `loanable = false` UND `status = "defekt"` zugleich. Liefe die Zustandspruefung
     * zuerst, stuende `DEFECT` in `betroffen` statt `NICHT_FREIGEGEBEN`, und beide
     * Fassungen waeren „eine Ablehnung mit grund nicht-verfuegbar".
     */
    geraet({ id: "g-gesperrt", issi: "4000001", loanable: false });
    geraet({ id: "g-beides", issi: "4000002", loanable: false, status: "defekt" });

    const eins = bucheAusleihe(db, {
      geraeteIds: ["g-gesperrt"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(eins.ok).toBe(false);
    if (eins.ok) return;
    expect(eins.grund).toBe("nicht-verfuegbar");
    expect(eins.betroffen).toEqual([{ rufname: "Ruf g-gesperrt", status: "NICHT_FREIGEGEBEN" }]);

    const zwei = bucheAusleihe(db, {
      geraeteIds: ["g-beides"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(zwei.ok).toBe(false);
    if (zwei.ok) return;
    expect(
      zwei.betroffen[0]?.status,
      "loanable wird VOR mapDeviceCondition geprueft (Spec:5264-5268)",
    ).toBe("NICHT_FREIGEGEBEN");
  });

  it("lehnt ein Geraet in nicht verleihbarem Zustand ab und nennt den Zustand in betroffen", () => {
    /*
     * ⛔ `betroffen[].status` IST DER PLATZ DES HEUTIGEN `condition`-FELDS aus dem
     * 409-Rumpf (`loanApi.ts:168`, Spec:5223-5228): „das einzige, das dem Kiosk sagt,
     * WARUM ein Geraet nicht verfuegbar ist". Ein `betroffen`-Eintrag ohne `status` ist
     * derselbe Verlust in neuer Schreibweise.
     */
    geraet({ id: "g-defekt", issi: "4000003", status: " Defekt " });
    geraet({ id: "g-wartung", issi: "4000004", status: "wartung" });

    const defekt = bucheAusleihe(db, {
      geraeteIds: ["g-defekt"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(defekt.ok).toBe(false);
    if (defekt.ok) return;
    expect(defekt.grund).toBe("nicht-verfuegbar");
    expect(defekt.betroffen).toEqual([{ rufname: "Ruf g-defekt", status: "DEFECT" }]);

    const wartung = bucheAusleihe(db, {
      geraeteIds: ["g-wartung"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(wartung.ok).toBe(false);
    if (wartung.ok) return;
    expect(wartung.betroffen).toEqual([{ rufname: "Ruf g-wartung", status: "MAINTENANCE" }]);
  });

  it("lehnt den zweiten gleichzeitigen Verleih ueber den Unique-Index ab", () => {
    /*
     * ⛔ UEBER DEN INDEX, NICHT UEBER EIN `SELECT` VOR DEM `INSERT` (Spec:3457-3464,
     * :5272-5279). Ein `SELECT`-dann-`INSERT` hat ein Rennen zwischen den beiden
     * Anweisungen; der partielle Unique-Index `loans_device_active_uidx`
     * (`_db/migrations/0001_loans_aktiv_uidx.sql`, dem Drizzle-Schema UNSICHTBAR) hat
     * keines.
     *
     * ⚠️ DER FALL LAEUFT ZWEIMAL DURCH `bucheAusleihe` UND NICHT UEBER EIN ROHES `INSERT`:
     * geprueft wird, dass die FUNKTION die Verletzung auf `nicht-verfuegbar` abbildet —
     * dass der Index selbst wirft, sagt bereits `_db/migrations.test.ts:60-65`.
     */
    geraet({ id: "g-doppelt", issi: "4000005" });
    const erst = bucheAusleihe(db, {
      geraeteIds: ["g-doppelt"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(erst.ok).toBe(true);

    const zweit = bucheAusleihe(db, {
      geraeteIds: ["g-doppelt"],
      entleiher: "Bea Beispiel",
      zugangscodeId: null,
    });
    expect(zweit.ok).toBe(false);
    if (zweit.ok) return;
    expect(zweit.grund).toBe("nicht-verfuegbar");
    expect(zweit.betroffen).toEqual([{ rufname: "Ruf g-doppelt", status: "ON_LOAN" }]);
    expect(zweit.text, "der Satz nennt den aktuellen Entleiher").toContain("Anna Beispiel");

    // Der Quelltext-Anker dazu: die Abbildung haengt am Fehlercode der Verletzung, nicht
    // an einer Vorab-Abfrage. Ohne diese Zeile bliebe die Aussage „ueber den Index" eine
    // Behauptung im Kommentar.
    expect(readFileSync(LEIHEN_QUELLE, "utf8")).toContain("SQLITE_CONSTRAINT_UNIQUE");
  });
});

describe("radio-leihen: eine Transaktion ueber alle gewaehlten Geraete", () => {
  it("bucht vier Geraete in EINER Transaktion", () => {
    for (let i = 1; i <= 4; i++) geraet({ id: `g-t${i}`, issi: `500000${i}` });
    /*
     * ⛔ DAS FENSTER UM DEN AUFRUF IST DER EINZIGE WAECHTER UEBER DEM GESCHRIEBENEN
     * `borrowedAt`. Jede andere Zeitzusicherung dieser Datei laeuft ueber das Fixture
     * `leihe()` und liest damit einen Wert, den der Test selbst gesetzt hat — ein falscher
     * Zeitpunkt im Schreibpfad verfaelscht `seit` auf der Uebersicht, `seitText` auf der
     * Rueckgabeflaeche, die Sortierung von `offeneAusleihen` UND `zuletztText` der
     * Vorschlaege, und keine davon saehe es.
     * ⛔ IN SEKUNDEN GERECHNET, NICHT IN MILLISEKUNDEN: `loans.borrowed_at` ist
     * `integer(..., { mode: "timestamp" })` (`_db/schema.ts:218`) und speichert volle
     * Sekunden — ein Vergleich in Millisekunden scheiterte, sobald der Aufruf mitten in
     * einer Sekunde faellt. Und es ist ein FENSTER und keine absolute Schranke: eine
     * Zahl wie „unter 150 ms" maesse die Auslastung der Maschine, nicht diese Funktion.
     */
    const vorher = Math.floor(Date.now() / 1000);
    const ergebnis = bucheAusleihe(db, {
      geraeteIds: ["g-t1", "g-t2", "g-t3", "g-t4"],
      entleiher: "Max Mustermann",
      zugangscodeId: null,
    });
    const nachher = Math.floor(Date.now() / 1000);
    expect(ergebnis).toEqual({ ok: true, anzahl: 4, entleiher: "Max Mustermann" });
    expect(db.select().from(loans).all()).toHaveLength(4);
    // Der Anzeige-Schnappschuss wird beim Ausleihen KOPIERT (`_db/schema.ts:201-205`).
    const eine = db.select().from(loans).where(eq(loans.deviceId, "g-t1")).get();
    expect(eine?.snapshotCallSign).toBe("Ruf g-t1");
    expect(eine?.snapshotSerialNumber).toBe("SN-g-t1");
    expect(eine?.snapshotDeviceType).toBe("Motorola MTP3550");

    const geschrieben = Math.floor(eine!.borrowedAt.getTime() / 1000);
    expect(geschrieben, "der geschriebene Ausleihzeitpunkt liegt VOR dem Aufruf").toBeGreaterThanOrEqual(
      vorher,
    );
    expect(geschrieben, "der geschriebene Ausleihzeitpunkt liegt NACH dem Aufruf").toBeLessThanOrEqual(
      nachher,
    );
  });

  it("bucht KEIN Geraet, wenn eines inzwischen vergeben ist", () => {
    /*
     * ALLES ODER NICHTS (§4.3.2, Spec:3441-3449). Heute ist der Teilerfolg der Normalfall:
     * der Alt-Knopf feuert N unabhaengige POSTs
     * (`radio-inventar/apps/frontend/src/components/features/ConfirmLoanButton.tsx:55-59`)
     * — scheitert der dritte von vier, sind drei gebucht und die Flaeche meldet trotzdem
     * einen Fehler.
     *
     * ⛔ DAS DRITTE GERAET IST DAS KOLLIDIERENDE, NICHT DAS ERSTE: nur so laufen vor dem
     * Abbruch bereits zwei `INSERT`s, die zurueckgerollt werden muessen. Waere es das
     * erste, bliebe der Fall auch ohne Transaktion gruen — die Sonde S-A15d haengt daran.
     */
    for (let i = 1; i <= 4; i++) geraet({ id: `g-a${i}`, issi: `600000${i}` });
    leihe({ deviceId: "g-a3", borrowerName: "Anna Beispiel" });

    const ergebnis = bucheAusleihe(db, {
      geraeteIds: ["g-a1", "g-a2", "g-a3", "g-a4"],
      entleiher: "Max Mustermann",
      zugangscodeId: null,
    });
    expect(ergebnis.ok).toBe(false);
    expect(
      db.select().from(loans).where(eq(loans.borrowerName, "Max Mustermann")).all(),
      "es wurde teilweise gebucht — die Zusage 'Es wurde nichts gebucht.' ist gebrochen",
    ).toEqual([]);
    expect(db.select().from(loans).all(), "die fremde Leihe wurde mit zurueckgerollt")
      .toHaveLength(1);
  });

  it("eine ueber den Code gebuchte Leihe traegt die Herkunft, eine ueber die Suite gebuchte nicht", () => {
    /*
     * ⛔ DER EINZIGE FALL, DER `loans.zugangscode_id` UEBERHAUPT BERUEHRT. Spec:2181-2186:
     * die Spalte „ist NULL fuer alle importierten Alt-Leihen und fuer jede Leihe ueber den
     * Suite-Weg (3.5)" und ist „die HERKUNFT des Zugangs … ueber sie loest die Anzeige
     * `bezeichnung` auf". Ohne diesen Fall ist die Spalte tot, und das Loeschverbot aus
     * §3.2.4 (Spec:2240-2242, „Beides oder nichts") verloere die Haelfte, die ihm Wirkung
     * gibt.
     */
    db.insert(zugangscodes)
      .values({
        id: "zc-1",
        code: "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW",
        bezeichnung: "Aufsteller Fahrzeughalle",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        createdBy: "sub-admin",
      })
      .run();
    geraet({ id: "g-code", issi: "7000001" });
    geraet({ id: "g-suite", issi: "7000002" });

    expect(
      bucheAusleihe(db, {
        geraeteIds: ["g-code"],
        entleiher: "Anna Beispiel",
        zugangscodeId: "zc-1",
      }).ok,
    ).toBe(true);
    expect(
      bucheAusleihe(db, {
        geraeteIds: ["g-suite"],
        entleiher: "Bea Beispiel",
        zugangscodeId: null,
      }).ok,
    ).toBe(true);

    expect(db.select().from(loans).where(eq(loans.deviceId, "g-code")).get()?.zugangscodeId).toBe(
      "zc-1",
    );
    expect(
      db.select().from(loans).where(eq(loans.deviceId, "g-suite")).get()?.zugangscodeId,
    ).toBeNull();
  });

  it("lehnt eine leere Auswahl und einen leeren Namen ab, ohne etwas zu schreiben", () => {
    /*
     * „Der Server prueft erneut — eine Regel, die nur im Client steht, ist keine Regel"
     * (Spec:3583-3585). Die zwei feldnahen Gruende gehoeren auf der Flaeche ans Feld
     * (Spec:5203); geprueft werden sie trotzdem HIER, weil dies der Schreibpfad ist.
     *
     * ⚠️ DER NAME WIRD GEPRUEFT, NICHT UMGESCHRIEBEN (Spec:3587-3592): `sanitizeForDisplay`
     * wandert NICHT mit, und auch ein `trim()` auf dem Weg IN die Datenbank waere eine
     * Veraenderung der gespeicherten Zeichenkette.
     */
    geraet({ id: "g-leer", issi: "8000001" });
    const ohneAuswahl = bucheAusleihe(db, {
      geraeteIds: [],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(ohneAuswahl.ok).toBe(false);
    if (!ohneAuswahl.ok) expect(ohneAuswahl.grund).toBe("keine-auswahl");

    const ohneName = bucheAusleihe(db, {
      geraeteIds: ["g-leer"],
      entleiher: "   ",
      zugangscodeId: null,
    });
    expect(ohneName.ok).toBe(false);
    if (!ohneName.ok) expect(ohneName.grund).toBe("kein-name");

    expect(db.select().from(loans).all()).toEqual([]);

    // Der Name wandert UNVERAENDERT in die Spalte — mit Leerraum an den Raendern.
    expect(
      bucheAusleihe(db, {
        geraeteIds: ["g-leer"],
        entleiher: "  Max Mustermann  ",
        zugangscodeId: null,
      }).ok,
    ).toBe(true);
    expect(db.select().from(loans).get()?.borrowerName).toBe("  Max Mustermann  ");
  });

  it("weist einen zu langen Entleihernamen ab, misst auf trim und speichert unveraendert", () => {
    /*
     * ⛔ FUND F2 DER SCHLUSSPRUEFUNG, BETREIBERENTSCHEIDUNG VOM 2026-08-24: der einzige
     * ANONYME Schreibpfad des Moduls nahm einen unbegrenzt langen Entleihernamen an. Der
     * Bestand deckelt SERVERSEITIG bei 100
     * (`radio-admin/shared/src/loan.ts:5` und `:39`,
     * `z.string().trim().min(1).max(LOAN_FIELD_LIMITS.BORROWER_NAME_MAX)`), und
     * `_ui/EntleiherFeld.tsx` hielt bis dahin nur die Client-Haelfte — „eine Regel, die nur
     * im Client steht, ist keine Regel" (Spec:3583-3585).
     *
     * ⛔ ABGEWIESEN, NICHT GEKUERZT — am Bestand gemessen: `.max(100)` laesst den Vorgang
     * scheitern (`invalid_body`, `loanApi.ts:161`), es gibt dort kein `slice`. Und ein
     * `slice` waere hier die dauerhafte Veraenderung der gespeicherten Zeichenkette, die
     * Spec:3587-3592 fuer dieses Feld verbietet.
     *
     * ⛔ DIE GRENZE WIRD AUF `trim().length` GEMESSEN, WEIL DER BESTAND ES TUT: zods
     * `.trim()` laeuft VOR `.max()`. Deshalb der dritte Fall — genau `ENTLEIHER_MAX`
     * Zeichen mit Randleerzeichen wird ANGENOMMEN und UNVERAENDERT gespeichert. Ohne ihn
     * bliebe eine Messung auf der rohen Laenge gruen, und sie waere um Randleerzeichen
     * strenger als das Original.
     */
    geraet({ id: "g-lang", issi: "8000002" });

    const zuLang = bucheAusleihe(db, {
      geraeteIds: ["g-lang"],
      entleiher: "L".repeat(ENTLEIHER_MAX + 1),
      zugangscodeId: null,
    });
    expect(zuLang.ok, "ein Name ueber der Grenze wird angenommen").toBe(false);
    if (zuLang.ok) return;
    expect(zuLang.grund).toBe("name-zu-lang");
    expect(zuLang.text, `die Zahl ${ENTLEIHER_MAX} fehlt im Satz`).toContain(
      String(ENTLEIHER_MAX),
    );
    expect(zuLang.betroffen, "eine Feldgrenze hat kein betroffenes Geraet").toEqual([]);
    expect(db.select().from(loans).all(), "trotz Ablehnung wurde gebucht").toEqual([]);

    const gerade = "G".repeat(ENTLEIHER_MAX);
    expect(
      bucheAusleihe(db, { geraeteIds: ["g-lang"], entleiher: gerade, zugangscodeId: null }).ok,
      "genau ENTLEIHER_MAX Zeichen wird abgewiesen — die Grenze ist um eins verschoben",
    ).toBe(true);
    expect(db.select().from(loans).get()?.borrowerName).toBe(gerade);

    db.delete(loans).run();
    const mitRand = `  ${"R".repeat(ENTLEIHER_MAX)}  `;
    expect(
      bucheAusleihe(db, { geraeteIds: ["g-lang"], entleiher: mitRand, zugangscodeId: null }).ok,
      "gemessen wird die ROHE Laenge — der Bestand misst nach trim()",
    ).toBe(true);
    expect(
      db.select().from(loans).get()?.borrowerName,
      "der Name wurde auf dem Weg in die Datenbank beschnitten",
    ).toBe(mitRand);
  });
});

describe("radio-leihen: die Rueckgabe", () => {
  function legeAktiveLeiheAn(): string {
    geraet({ id: "g-r", issi: "9000001" });
    const ergebnis = bucheAusleihe(db, {
      geraeteIds: ["g-r"],
      entleiher: "Anna Beispiel",
      zugangscodeId: null,
    });
    expect(ergebnis.ok).toBe(true);
    const zeile = db.select().from(loans).where(isNull(loans.returnedAt)).get();
    expect(zeile).toBeDefined();
    return zeile!.id;
  }

  it("bucht eine Rueckgabe und traegt die Zustandsnotiz ein", () => {
    const id = legeAktiveLeiheAn();
    const ergebnis = bucheRueckgabe(db, id, "Akku schwach");
    expect(ergebnis).toEqual({ ok: true, rufname: "Ruf g-r" });
    const zeile = db.select().from(loans).where(eq(loans.id, id)).get();
    expect(zeile?.returnedAt).not.toBeNull();
    expect(zeile?.returnNote).toBe("Akku schwach");
  });

  it("lehnt eine zweite Rueckgabe derselben Leihe ab", () => {
    // `loan_already_returned` (`loanApi.ts:196`) → `grund: "schon-zurueck"` (Spec:5199).
    const id = legeAktiveLeiheAn();
    expect(bucheRueckgabe(db, id, null).ok).toBe(true);
    const zweit = bucheRueckgabe(db, id, null);
    expect(zweit.ok).toBe(false);
    if (zweit.ok) return;
    expect(zweit.grund).toBe("schon-zurueck");
    expect(zweit.text).toContain("Ruf g-r");
  });

  it("lehnt eine unbekannte Leihe ab", () => {
    // `loan_not_found` (`loanApi.ts:197`) → `grund: "unbekannt-geworden"` (Spec:5200).
    const ergebnis = bucheRueckgabe(db, "l-gibtsnicht", null);
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.grund).toBe("unbekannt-geworden");
    expect(ergebnis.text, "die Leih-Id steht im Bildschirmtext").not.toContain("l-gibtsnicht");
  });

  it("lehnt eine zu lange Zustandsnotiz ab und schreibt nichts", () => {
    /*
     * ⛔ DIE GRENZE WIRD AUS `_lib/meldungen.ts:88` IMPORTIERT UND NICHT NEU DEKLARIERT
     * (`_lib/meldungen.ts:82-86`, Auflage an A15). Zwei Zahlen fuer dieselbe Grenze
     * liefen auseinander, und die zweite saehe man erst dann.
     */
    const id = legeAktiveLeiheAn();
    const ergebnis = bucheRueckgabe(db, id, "x".repeat(ZUSTANDSNOTIZ_MAX + 1));
    expect(ergebnis.ok).toBe(false);
    if (ergebnis.ok) return;
    expect(ergebnis.grund).toBe("notiz-zu-lang");
    expect(db.select().from(loans).where(eq(loans.id, id)).get()?.returnedAt).toBeNull();

    /*
     * ⛔ GEMESSEN WIRD DER UNGETRIMMTE WERT — `_db/leihen.ts:653` misst `notiz.length`,
     * nicht `notiz.trim().length`, und das ist Absicht: gemessen wird, was gespeichert
     * wird (`_db/leihen.ts:645-646`, die Notiz wird nicht umgeschrieben). Bis zu diesem
     * Fall war die Grenze zwar bewacht, aber nicht, WELCHEN der zwei Werte sie misst:
     * kein Fall trug Leerzeichen an den Enden (REVIEW-A17 Fund F6-N).
     *
     * ⛔ DIESER FALL GEHOERT VOR DIE GRENZZEILE DARUNTER UND DARF NICHT UNTER SIE WANDERN.
     * Er traegt nur, solange die Leihe noch aktiv ist — und das ist sie hier, gemessen von
     * der Zusicherung darueber. Faellt `:599` auf `trim()`, laeuft der Wert durch die
     * Pruefung und bucht die AKTIVE Leihe zurueck: `ok` wird `true`, der Fall rot. Unter
     * der Grenzzeile ist die Leihe bereits zurueck, dasselbe `ok: false` kaeme dann aus
     * `schon-zurueck` (`_db/leihen.ts:673-674`) und der Fall bliebe GRUEN — gemessen, die
     * Sonde steht im Fix-Bericht zu A17.
     */
    // getrimmt genau auf der Grenze, ungetrimmt eine Stelle darueber
    const knappDrueber = ` ${"x".repeat(ZUSTANDSNOTIZ_MAX)}`;
    const mitLeerzeichen = bucheRueckgabe(db, id, knappDrueber);
    expect(mitLeerzeichen.ok).toBe(false);
    if (mitLeerzeichen.ok) return;
    expect(mitLeerzeichen.grund).toBe("notiz-zu-lang");

    // Genau auf der Grenze geht es durch — sonst waere ein `>=` hier unbemerkt.
    expect(bucheRueckgabe(db, id, "x".repeat(ZUSTANDSNOTIZ_MAX)).ok).toBe(true);
  });
});

describe("radio-leihen: WAL und busy_timeout — der Ersatz fuer den gestrichenen Ausfall-Puffer", () => {
  it("liest die Geraeteliste waehrend eines offenen Schreibvorgangs", () => {
    /*
     * ⛔ ZWEI GETRENNTE VERBINDUNGEN (Bauform-Auflage 1 im Kopf dieser Datei). Der
     * `beforeEach`-Handle saet nur; Schreiber und Leser entstehen HIER, beide ueber
     * `openModuleDatabase` auf DERSELBEN Datei (Auflage 2).
     */
    geraet({ id: "g-wal", issi: "1100001" });

    const schreiber = openModuleDatabase(pfad);
    const leserSqlite = openModuleDatabase(pfad);
    const leser = drizzle(leserSqlite, { schema });
    try {
      // ⛔ AUFLAGE 3 — DIE ERSTE ZUSICHERUNG IST DIE EIGENE VORAUSSETZUNG (Spec:5430-5435).
      // Entfernt ein spaeterer Umbau `src/core/db/index.ts:18`, faellt GENAU diese Zeile.
      expect(leserSqlite.pragma("journal_mode", { simple: true })).toBe("wal");

      schreiber.exec("BEGIN IMMEDIATE");
      schreiber
        .prepare(
          "insert into loans (id, device_id, snapshot_call_sign, borrower_name, borrowed_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "l-wal",
          "g-wal",
          "Ruf g-wal",
          "Anna Beispiel",
          // Unix-SEKUNDEN im Ziel, epoch-MILLISEKUNDEN in der Quelle — der Faktor steht
          // im Ausdruck (`src/app/m/lagerbuch/_db/schema.ts:11-16`).
          Math.floor(AUSGELIEHEN_AM.getTime() / 1000),
          Math.floor(AUSGELIEHEN_AM.getTime() / 1000),
          Math.floor(AUSGELIEHEN_AM.getTime() / 1000),
        );

      const zeilen = geraeteMitLeihstand(leser);
      expect(zeilen, "der Lesepfad ist am offenen Schreibvorgang haengengeblieben").toHaveLength(1);
      // Der noch nicht bestaetigte Schreibvorgang ist fuer den Leser unsichtbar — das ist
      // die andere Haelfte derselben Zusage.
      expect(zeilen[0]?.status).toBe("AVAILABLE");
    } finally {
      schreiber.exec("ROLLBACK");
      schreiber.close();
      leserSqlite.close();
    }
  });

  it("wartet auf eine belegte Datenbank, statt sofort zu scheitern", () => {
    /*
     * DIE ZWEITE HAELFTE DES ERSATZES (Spec:5437-5440): `busy_timeout = 5000` gibt einem
     * SCHREIBVORGANG fuenf Sekunden Wartezeit, bevor er scheitert.
     *
     * ⛔ GEMESSEN WIRD IN ZWEI SCHRITTEN, weil die naheliegende Form entweder fuenf
     * Sekunden dauert oder nichts misst:
     *   (a) die VORAUSSETZUNG — ein Handle aus `openModuleDatabase` traegt die 5000 aus
     *       `src/core/db/index.ts:20`. Faellt die Zeile dort, faellt diese hier.
     *   (b) das VERHALTEN — mit einer absichtlich HERUNTERGEDREHTEN Wartezeit scheitert
     *       ein blockierter Schreibvorgang erst NACH ihr, waehrend er ohne Wartezeit
     *       sofort scheitert. Erst der Kontrast macht die Aussage; eine einzelne Messung
     *       „es hat gedauert" waere auch auf einer langsamen Maschine gruen.
     */
    const wachhabend = openModuleDatabase(pfad);
    try {
      expect(wachhabend.pragma("busy_timeout", { simple: true })).toBe(5000);
    } finally {
      wachhabend.close();
    }

    const schreiber = openModuleDatabase(pfad);
    const sofort = openModuleDatabase(pfad);
    const geduldig = openModuleDatabase(pfad);
    sofort.pragma("busy_timeout = 0");
    geduldig.pragma("busy_timeout = 300");
    try {
      schreiber.exec("BEGIN IMMEDIATE");
      schreiber.prepare("insert into users (sub, name, last_seen_at) values (?, ?, ?)").run(
        "sub-wal",
        "Anna Beispiel",
        0,
      );

      const messe = (handle: typeof sofort): number => {
        const start = Date.now();
        expect(() => handle.exec("BEGIN IMMEDIATE")).toThrow(/SQLITE_BUSY|database is locked/);
        return Date.now() - start;
      };

      // ⚠️ DIE OBERGRENZE HAT ABSICHTLICH LUFT (250, nicht 150): sie ist eine ABSOLUTE
      // Zeitschranke in einer Suite, die Hunderte Dateien parallel faehrt. ⛔ DIE UNTERGRENZE
      // IST DIESELBE ZAHL — erst so sind die zwei Schranken eine LUECKENLOSE Teilung, die
      // KEINE Messung zugleich erfuellt (gemessen, drei volle Laeufe: 343/364/351 ms).
      expect(messe(sofort), "ohne Wartezeit muss es sofort scheitern").toBeLessThan(250);
      expect(messe(geduldig), "mit Wartezeit muss es erst nach ihr scheitern").toBeGreaterThanOrEqual(
        250,
      );
    } finally {
      schreiber.exec("ROLLBACK");
      schreiber.close();
      sofort.close();
      geduldig.close();
    }
  });
});

/**
 * Die Vergleichszeitpunkte der Historie-Faelle. `AUSGELIEHEN_AM` oben ist der 14.06.2026;
 * diese liegen davor und danach, damit die Fenstergrenzen etwas zu schneiden haben.
 */
const HISTORIE_FRUEH = new Date("2026-06-01T07:12:00Z");
const HISTORIE_SPAET = new Date("2026-06-20T07:12:00Z");
const HISTORIE_RUECKGABE = new Date("2026-06-15T07:12:00Z");
const HISTORIE_RUECKGABE_TEXT = "15.06.2026, 09:12";
/** Das Fenster der Zeitfenster-Faelle: 10.06.2026 bis 18.06.2026. */
const FENSTER_VON = new Date("2026-06-10T00:00:00Z");
const FENSTER_BIS = new Date("2026-06-18T00:00:00Z");

/** Der exakte Feldsatz einer Historienzeile (Vertrag E-V10, `briefs/V1.md`). */
const FELDER_LEIHZEILE = [
  "id",
  "rufname",
  "geraetetyp",
  "entleiher",
  "ausgeliehenText",
  "zurueckText",
  "aktiv",
  "notiz",
];

describe("radio-leihen: die Leihhistorie der Verwaltung", () => {
  it("liefert aktive und zurueckgegebene Leihen in einer Seite", () => {
    /*
     * ⛔ DAS FENSTER IST „aktiv UND zurueckgegeben", 1:1 aus `listLoans`
     * (`radio-admin/server/src/repos/loanRepo.ts:136`, woertlich „Paginated loan list
     * (active + returned)"). Der Fall braucht BEIDE Sorten in der Fixture — ueber einer
     * einseitigen Menge waere er auch dann gruen, wenn jemand `isNull(loans.returnedAt)`
     * aus `offeneAusleihen` hierher abschriebe.
     *
     * ⛔ UND LESEN PURGT NICHT: die Retention ist ein Job (`_lib/boot.ts:62`,
     * `raeumeLeihhistorie`), kein Nebeneffekt dieses Lesepfads.
     */
    geraet({ id: "h-1", issi: "3000001" });
    geraet({ id: "h-2", issi: "3000002" });
    leihe({ deviceId: "h-1", borrowerName: "Aktiv Anna" });
    leihe({ deviceId: "h-2", borrowerName: "Zurueck Zita", returnedAt: HISTORIE_RUECKGABE });

    const seite = leihhistorie(db, { seite: 1, seitenGroesse: 25 });
    expect(seite.zeilen.map((z) => z.entleiher).sort()).toEqual(["Aktiv Anna", "Zurueck Zita"]);
    expect(seite.gesamt).toBe(2);
  });

  it("sortiert neueste Ausleihe zuerst", () => {
    /*
     * `desc(loans.borrowedAt)`, IMMER und ohne Parameter (`loanRepo.ts:153`). Die
     * Einfuegereihenfolge ist ABSICHTLICH verwuerfelt (Mitte, spaet, frueh): ueber einer
     * bereits geordneten Fixture bliebe der Fall auch ohne jedes `ORDER BY` gruen, weil
     * SQLite die Einfuegereihenfolge dann zufaellig richtig zurueckgibt.
     */
    geraet({ id: "h-a", issi: "3100001" });
    geraet({ id: "h-b", issi: "3100002" });
    geraet({ id: "h-c", issi: "3100003" });
    leihe({ deviceId: "h-a", borrowerName: "Mitte", borrowedAt: AUSGELIEHEN_AM });
    leihe({ deviceId: "h-b", borrowerName: "Spaet", borrowedAt: HISTORIE_SPAET });
    leihe({ deviceId: "h-c", borrowerName: "Frueh", borrowedAt: HISTORIE_FRUEH });

    const seite = leihhistorie(db, { seite: 1, seitenGroesse: 25 });
    expect(seite.zeilen.map((z) => z.entleiher)).toEqual(["Spaet", "Mitte", "Frueh"]);
  });

  it("filtert auf eine Geraete-Id", () => {
    /*
     * `eq(loans.deviceId, ...)` (`loanRepo.ts:139`). Die Fixture fuehrt ZWEI Geraete —
     * ueber einem einzigen waere ein wirkungsloser Filter nicht von einem wirksamen zu
     * unterscheiden.
     */
    geraet({ id: "h-ziel", issi: "3200001" });
    geraet({ id: "h-fremd", issi: "3200002" });
    leihe({
      deviceId: "h-ziel",
      borrowerName: "Ziel Zwei",
      borrowedAt: HISTORIE_FRUEH,
      returnedAt: HISTORIE_RUECKGABE,
    });
    leihe({ deviceId: "h-ziel", borrowerName: "Ziel Eins" });
    leihe({ deviceId: "h-fremd", borrowerName: "Fremd Frida" });

    const seite = leihhistorie(db, { geraeteId: "h-ziel", seite: 1, seitenGroesse: 25 });
    expect(seite.zeilen.map((z) => z.entleiher)).toEqual(["Ziel Eins", "Ziel Zwei"]);
    expect(seite.gesamt).toBe(2);
  });

  it("filtert auf ein Zeitfenster ueber borrowedAt, nicht ueber returnedAt", () => {
    /*
     * ⛔ DER FALL, DER DIE HAEUFIGSTE VERWECHSLUNG FAENGT (`loanRepo.ts:140-141`: `gte`/`lte`
     * stehen auf `borrowedAt`). „Rand Rita" liegt mit ihrer AUSLEIHE ausserhalb und mit ihrer
     * RUECKGABE innerhalb des Fensters — sie faellt heraus. Haengte jemand die zwei Grenzen
     * an `returnedAt`, kaeme sie herein und „Innen Ida" (returnedAt NULL, also weder groesser
     * noch kleiner) fiele heraus.
     *
     * ⛔ UND DIE ZWEI AUSGESCHLOSSENEN ZEILEN WERDEN NAMENTLICH GEPRUEFT, nicht nur die
     * eingeschlossene: ein Fenster, das alle Zeilen umspannt, kann einen Einheitenfehler
     * (Sekunden gegen Millisekunden) nicht von einem richtigen Vergleich unterscheiden.
     *
     * ⛔ DIE ZWEI GRENZZEILEN SIND FUND F3 DER FIX-RUNDE ZU V1 UND KEIN SCHMUCK. Bis dahin
     * lag jeder Fixture-Zeitpunkt ECHT innerhalb oder ECHT ausserhalb des Fensters, und
     * `gte`/`lte` war von `gt`/`lt` durch keinen Fall zu unterscheiden — gemessen: die
     * Mutation ergab `42 passed`. Die Einschluss-Semantik ist eine 1:1-Pflicht
     * (`loanRepo.ts:140-141`), und nach der Betreiberentscheidung zu V-L11
     * (`progress.md`, „filtert nach Geraet UND Zeitraum") setzt „wer hatte was am
     * Einsatztag" die Grenze typischerweise GENAU auf einen Tagesrand.
     */
    geraet({ id: "h-innen", issi: "3300001" });
    geraet({ id: "h-rand", issi: "3300002" });
    geraet({ id: "h-spaet", issi: "3300003" });
    geraet({ id: "h-grenze-von", issi: "3300004" });
    geraet({ id: "h-grenze-bis", issi: "3300005" });
    leihe({ deviceId: "h-innen", borrowerName: "Innen Ida" });
    leihe({ deviceId: "h-grenze-von", borrowerName: "Grenze Gerda", borrowedAt: FENSTER_VON });
    leihe({ deviceId: "h-grenze-bis", borrowerName: "Grenze Gustav", borrowedAt: FENSTER_BIS });
    leihe({
      deviceId: "h-rand",
      borrowerName: "Rand Rita",
      borrowedAt: HISTORIE_FRUEH,
      returnedAt: HISTORIE_RUECKGABE,
    });
    leihe({ deviceId: "h-spaet", borrowerName: "Spaet Sina", borrowedAt: HISTORIE_SPAET });

    const seite = leihhistorie(db, {
      von: FENSTER_VON,
      bis: FENSTER_BIS,
      seite: 1,
      seitenGroesse: 25,
    });
    const namen = seite.zeilen.map((z) => z.entleiher);
    expect(namen, "die Ausleihe im Fenster fehlt").toContain("Innen Ida");
    expect(namen, "eine Leihe mit Ausleihe VOR dem Fenster ist hereingerutscht").not.toContain(
      "Rand Rita",
    );
    expect(namen, "eine Leihe mit Ausleihe NACH dem Fenster ist hereingerutscht").not.toContain(
      "Spaet Sina",
    );
    expect(namen, "die UNTERE Grenze ist ausschliessend (gt statt gte)").toContain("Grenze Gerda");
    expect(namen, "die OBERE Grenze ist ausschliessend (lt statt lte)").toContain("Grenze Gustav");
    expect(seite.gesamt).toBe(3);
  });

  it("gesamt zaehlt ueber die gefilterte Menge, nicht ueber die Seite", () => {
    /*
     * `count()` mit DEMSELBEN `where` wie die Zeilenabfrage (`loanRepo.ts:146`). Die Fixture
     * prueft beide Haelften auf einmal: fuenf Zeilen insgesamt, drei nach dem Filter, zwei
     * auf der Seite. `gesamt` ist damit weder 5 (Filter vergessen) noch 2 (ueber die Seite
     * gezaehlt).
     */
    geraet({ id: "h-z", issi: "3400001" });
    geraet({ id: "h-fremd", issi: "3400002" });
    leihe({
      deviceId: "h-z",
      borrowerName: "Zaehl Eins",
      borrowedAt: HISTORIE_SPAET,
      returnedAt: HISTORIE_SPAET,
    });
    leihe({
      deviceId: "h-z",
      borrowerName: "Zaehl Zwei",
      borrowedAt: AUSGELIEHEN_AM,
      returnedAt: HISTORIE_RUECKGABE,
    });
    leihe({ deviceId: "h-z", borrowerName: "Zaehl Drei", borrowedAt: HISTORIE_FRUEH });
    leihe({
      deviceId: "h-fremd",
      borrowerName: "Fremd Eins",
      borrowedAt: HISTORIE_FRUEH,
      returnedAt: HISTORIE_RUECKGABE,
    });
    leihe({ deviceId: "h-fremd", borrowerName: "Fremd Zwei" });

    const seite = leihhistorie(db, { geraeteId: "h-z", seite: 1, seitenGroesse: 2 });
    expect(seite.zeilen.map((z) => z.entleiher)).toEqual(["Zaehl Eins", "Zaehl Zwei"]);
    expect(seite.gesamt, "gesamt zaehlt die Seite oder die ungefilterte Menge").toBe(3);
  });

  it("seitenGroesse ueber 1000 wird auf 1000 gedeckelt", () => {
    /*
     * ⛔ DER DECKEL STEHT SERVERSEITIG, NICHT IM AUFRUFER (`radio-admin/shared/src/loan.ts:98`,
     * `.max(1000)`).
     *
     * ⛔ DER FALL PRUEFT BEIDE ORTE, UND DAS IST FUND F2 DER FIX-RUNDE ZU V1. Bis dahin las er
     * nur den UMSCHLAG. Gemessen: den Deckel NUR aus dem `limit` entfernen und den Umschlag
     * unveraendert lassen ergab `42 passed` — genau die NT11-Klasse, „ein Waechter, der
     * `>= 5` statt `= 6` prueft, bleibt gruen und bewacht nichts". Der alte Kommentar hielt
     * eine Fixture mit 1001 Zeilen fuer zu teuer („kostete Sekunden je Lauf"); das gilt nur
     * fuer 1001 EINZELNE Transaktionen, also 1001 fsyncs. In EINER Transaktion kostet sie
     * GEMESSEN unter 100 ms: die `tests`-Zeit dieser Datei lag vor der Fixture bei 523 ms
     * und danach bei 590 ms, bei einem Rauschband von 523/525/539 ms ueber drei Vorlaeufe
     * (2026-08-24, `rtk pnpm vitest run src/app/m/radio/_db/leihen.test.ts`). ⛔ DIE ZAHL
     * STEHT HIER UND NICHT NUR IM BERICHT: sie kehrt ein frueheres Urteil um, und der
     * Bericht liegt unter `.superpowers/`, das git-ignoriert ist (`.gitignore:17`).
     *
     * ⛔ EINTAUSENDEINS ZEILEN UND NICHT WENIGER: bei 1000 waere ein fehlender Deckel von
     * einem wirksamen nicht zu unterscheiden. Und `gesamt` MUSS 1001 sein — die Zahl zeigt,
     * dass die `count()`-Abfrage die Grenze NICHT geerbt hat (`loanRepo.ts:146` traegt kein
     * `limit`).
     *
     * ⛔ EIN EIGENES GERAET JE ZEILE, weil `loans_device_active_uidx` ein PARTIELLER
     * Unique-Index auf `device_id` ist, solange `returned_at` NULL ist
     * (`_db/migrations/0001_loans_aktiv_uidx.sql`). Geraetezeilen braucht der Fall nicht:
     * `loans.device_id` ist ABSICHTLICH kein Fremdschluessel (`_db/schema.ts:201-205`), und
     * dieser Lesepfad joint nicht.
     *
     * ⚠️ BENANNTE ABWEICHUNG: der Bestand LEHNT AB (zods `.max` wirft, die Route antwortet
     * 400), dieses Modul DECKELT. Der Grund steht an der Deckelung selbst in `leihen.ts`.
     */
    const ZEILEN = 1001;
    sqlite.exec("BEGIN");
    for (let i = 0; i < ZEILEN; i++) {
      leihe({
        deviceId: `h-deckel-${i}`,
        borrowerName: `Person ${i}`,
        borrowedAt: new Date(HISTORIE_FRUEH.getTime() + i * 60_000),
      });
    }
    sqlite.exec("COMMIT");

    const seite = leihhistorie(db, { seite: 1, seitenGroesse: 5000 });
    expect(seite.seitenGroesse, "der Deckel 1000 fehlt im Umschlag").toBe(1000);
    expect(seite.zeilen.length, "der Deckel 1000 fehlt in der Abfrage").toBe(1000);
    expect(seite.gesamt, "gesamt hat die Grenze der Zeilenabfrage geerbt").toBe(ZEILEN);
  });

  it("die zweite Seite traegt die naechsten Zeilen", () => {
    /*
     * ⛔ FUND F1 DER FIX-RUNDE ZU V1: DIE BLAETTERUNG WAR VON KEINEM EINZIGEN FALL BEWACHT.
     * Alle zwoelf Faelle der Aufgabe riefen effektiv `seite === 1` (1, 0 -> 1, NaN -> 1), also
     * war der Offset ueberall 0. Gemessen: `.offset(0)` ergab `42 passed`, und die
     * realistische Variante — die Multiplikation vergessen, `.offset(seite - 1)` — ebenfalls
     * `42 passed`. Nur die grobe Verschiebung `.offset(seite * seitenGroesse)` fiel auf, weil
     * dann JEDE Seite leer ist.
     *
     * ⛔ DER FALL PRUEFT BEIDE SEITEN NAMENTLICH, nicht nur ihre Laenge. Die bewachte Zeile
     * ist 1:1 der Bestand (`radio-admin/server/src/repos/loanRepo.ts:155`:
     * `.offset((page - 1) * pageSize)`). Drei Zeilen bei Seitengroesse 2 trennen alle drei
     * Fehlformen: `.offset(0)` liefert auf Seite 2 die ERSTEN zwei, `.offset(seite - 1)` die
     * MITTLEREN zwei, `.offset(seite * seitenGroesse)` gar keine.
     *
     * ⚠️ FAELLIG WAR ER VOR V7 (`_lib/lesepfade/ausleihen.ts`) — dem ersten Aufrufer, der
     * ueberhaupt `seite > 1` schicken wird.
     */
    geraet({ id: "h-b1", issi: "3650001" });
    geraet({ id: "h-b2", issi: "3650002" });
    geraet({ id: "h-b3", issi: "3650003" });
    leihe({ deviceId: "h-b2", borrowerName: "Mitte Mia", borrowedAt: AUSGELIEHEN_AM });
    leihe({ deviceId: "h-b1", borrowerName: "Neu Nora", borrowedAt: HISTORIE_SPAET });
    leihe({ deviceId: "h-b3", borrowerName: "Alt Alma", borrowedAt: HISTORIE_FRUEH });

    const erste = leihhistorie(db, { seite: 1, seitenGroesse: 2 });
    expect(erste.zeilen.map((z) => z.entleiher)).toEqual(["Neu Nora", "Mitte Mia"]);

    const zweite = leihhistorie(db, { seite: 2, seitenGroesse: 2 });
    expect(
      zweite.zeilen.map((z) => z.entleiher),
      "die zweite Seite setzt nicht hinter der ersten an",
    ).toEqual(["Alt Alma"]);
    expect(zweite.seite).toBe(2);
    expect(zweite.seitenGroesse).toBe(2);
    expect(zweite.gesamt, "gesamt zaehlt die Seite statt die gefilterte Menge").toBe(3);
  });

  it("seitenGroesse unter 1 und seite unter 1 werden auf 1 gehoben", () => {
    /*
     * `min(1)` auf beiden (`radio-admin/shared/src/loan.ts:97-98`). Der Fall prueft nicht nur
     * den Umschlag, sondern auch die WIRKUNG: mit einer ungehobenen `seitenGroesse` von 0
     * liefert SQLite `LIMIT 0` — also NULL Zeilen statt der einen neuesten.
     */
    geraet({ id: "h-u1", issi: "3600001" });
    geraet({ id: "h-u2", issi: "3600002" });
    leihe({ deviceId: "h-u1", borrowerName: "Neu Nora", borrowedAt: HISTORIE_SPAET });
    leihe({ deviceId: "h-u2", borrowerName: "Alt Alma", borrowedAt: HISTORIE_FRUEH });

    const seite = leihhistorie(db, { seite: 0, seitenGroesse: 0 });
    expect(seite.seite).toBe(1);
    expect(seite.seitenGroesse).toBe(1);
    expect(seite.zeilen.map((z) => z.entleiher)).toEqual(["Neu Nora"]);
    expect(seite.gesamt).toBe(2);
  });

  it("faellt bei einem unbrauchbaren Zahlenwert auf die Vorgabe zurueck, nicht auf eine unbegrenzte Abfrage", () => {
    /*
     * ⛔ ABWEICHUNG VOM BRIEF, WEIL DER GEMESSENE AUSFALL SCHLIMMER IST ALS DER GEDECKELTE
     * FALL. Die reine Deckelkette laesst einen `NaN` unveraendert durch (`Math.trunc(NaN)` ist
     * `NaN`, `Math.max(1, NaN)` ebenfalls). GEMESSEN am 2026-08-24 mit einer Wegwerf-Sonde
     * gegen eine echte Datei-DB, fuenf Zeilen, `seite: NaN, seitenGroesse: NaN`:
     * `{"zeilen":5,"gesamt":5,"seite":null,"seitenGroesse":null}` — also ALLE Zeilen in EINER
     * Seite. better-sqlite3 bindet den `NaN` als NULL, und SQLite liest `LIMIT NULL` als KEINE
     * GRENZE. Auf einer Produktionstabelle waere das ein unbegrenzter Volltabellen-Lauf, den
     * ein von Hand veraenderter Suchparameter ausloest.
     *
     * ⛔ SECHSUNDZWANZIG ZEILEN UND NICHT FUENF: unter `SEITENGROESSE_VORGABE` (25) waere die
     * unbegrenzte Abfrage von der richtigen nicht zu unterscheiden — beide lieferten alles.
     * Erst die 26. Zeile trennt sie.
     *
     * ⚠️ GERAETEZEILEN BRAUCHT DER FALL NICHT: `loans.device_id` ist ABSICHTLICH kein
     * Fremdschluessel (`_db/schema.ts:201-205`), und dieser Lesepfad joint nicht.
     */
    const ZEILEN = 26;
    for (let i = 0; i < ZEILEN; i++) {
      leihe({
        deviceId: `h-nan-${i}`,
        borrowerName: `Person ${i}`,
        borrowedAt: new Date(HISTORIE_FRUEH.getTime() + i * 60_000),
      });
    }

    const seite = leihhistorie(db, { seite: Number.NaN, seitenGroesse: Number.NaN });
    expect(seite.seite).toBe(1);
    expect(seite.seitenGroesse).toBe(25);
    expect(seite.gesamt).toBe(ZEILEN);
    expect(
      seite.zeilen.length,
      "eine unbrauchbare Seitengroesse liefert die ganze gefilterte Menge in einer Seite",
    ).toBe(25);
  });

  it("aktiv ist genau returnedAt === null", () => {
    /*
     * 1:1 aus `StatusTag` der Alt-Liste (`radio-admin/client/src/features/loans/LoanList.tsx:11-13`,
     * woertlich „Active vs. returned status, derived purely from `returnedAt`"). ⛔ JE ZUSTAND
     * EINE ZEILE — mit nur einer waere ein konstantes `true` oder `false` gruen.
     */
    geraet({ id: "h-akt", issi: "3700001" });
    geraet({ id: "h-ret", issi: "3700002" });
    leihe({ deviceId: "h-akt", borrowerName: "Aktiv Anna" });
    leihe({ deviceId: "h-ret", borrowerName: "Zurueck Zita", returnedAt: HISTORIE_RUECKGABE });

    const zeilen = leihhistorie(db, { seite: 1, seitenGroesse: 25 }).zeilen;
    expect(zeilen.find((z) => z.entleiher === "Aktiv Anna")?.aktiv).toBe(true);
    expect(zeilen.find((z) => z.entleiher === "Zurueck Zita")?.aktiv).toBe(false);
  });

  it("rufname kommt aus dem Schnappschuss, nicht aus devices", () => {
    /*
     * ⛔ DER FALL BRAUCHT EIN `devices`-OBJEKT MIT ABWEICHENDEM RUFNAMEN — sonst beweist er
     * nichts. Die beiden Fixture-Helfer setzen ihre Vorgaben aus derselben Id (`Ruf h-snap`
     * hier wie dort), deshalb werden BEIDE Seiten ausdruecklich ueberschrieben.
     *
     * Die historische Richtigkeit traegt der unveraenderliche Anzeige-Schnappschuss
     * (`_db/schema.ts:201-205`): „Ein zusaetzlicher FK waere gueltiges Drizzle, gueltiges SQL
     * und PARITAETSGRUEN; der Schaden entstuende Monate spaeter, bei der ersten
     * Geraeteausmusterung." Dieselbe Haltung wie bei `offeneAusleihen`.
     */
    geraet({ id: "h-snap", issi: "3800001", rufname: "LEBEND 99/1", deviceType: "Lebend-Typ" });
    leihe({
      deviceId: "h-snap",
      snapshotCallSign: "SCHNAPPSCHUSS 41/12",
      snapshotDeviceType: "Schnappschuss-Typ",
    });

    const zeile = leihhistorie(db, { seite: 1, seitenGroesse: 25 }).zeilen[0];
    expect(zeile?.rufname, "der Rufname kommt aus einem lebenden Join auf devices").toBe(
      "SCHNAPPSCHUSS 41/12",
    );
    expect(zeile?.geraetetyp, "der Geraetetyp kommt aus einem lebenden Join auf devices").toBe(
      "Schnappschuss-Typ",
    );
  });

  it("zurueckText ist ein Gedankenstrich, solange nicht zurueckgegeben", () => {
    /*
     * Leerwert-Darstellung 1:1 aus `LoanList.tsx:34` (`formatTimestamp(null)`), und
     * `formatTimestamp` liefert fuer einen leeren Wert genau diesen Strich
     * (`radio-admin/client/src/utils/format.ts:2-4`).
     *
     * ⛔ BEIDE TEXTE SIND AUF DEM SERVER FERTIG GEBAUT (`_lib/anzeige.ts:75`,
     * `datumMitUhrzeit`) — sonst entscheiden Server und Client an der Tagesgrenze
     * verschieden, und zwar systematisch gegen die Zone des Endgeraets.
     */
    geraet({ id: "h-offen", issi: "3900001" });
    geraet({ id: "h-zu", issi: "3900002" });
    leihe({ deviceId: "h-offen", borrowerName: "Offen Olga" });
    leihe({ deviceId: "h-zu", borrowerName: "Zu Zita", returnedAt: HISTORIE_RUECKGABE });

    const zeilen = leihhistorie(db, { seite: 1, seitenGroesse: 25 }).zeilen;
    const offen = zeilen.find((z) => z.entleiher === "Offen Olga");
    const zu = zeilen.find((z) => z.entleiher === "Zu Zita");
    expect(offen?.zurueckText).toBe("—");
    expect(zu?.zurueckText).toBe(HISTORIE_RUECKGABE_TEXT);
    expect(offen?.ausgeliehenText).toBe(AUSGELIEHEN_DATUM_UHRZEIT);
  });

  it("liefert keine Zeile ausserhalb der acht Felder von LeihZeile", () => {
    /*
     * ⛔ EXAKTER FELDSATZABGLEICH, KEINE TEILMENGENPRUEFUNG — dieselbe Form wie der
     * Lesemodell-Fall bei `geraeteMitLeihstand` oben (Spec:5254-5258, woertlich: „eine
     * Teilmengenpruefung faengt genau den Fall nicht, gegen den der Test steht"). Die
     * Quellzeile hat zwoelf Spalten (`_db/schema.ts:210-232`), die Zeile hat acht Felder.
     *
     * ⛔ UND `LeihZeile` HAT KEIN OPTIONALES FELD: anders als `GeraetMitLeihstand` gibt es
     * hier nur EINE Gestalt, also auch nur einen Sollsatz.
     */
    geraet({ id: "h-felder", issi: "4000001" });
    leihe({ deviceId: "h-felder", returnNote: "Akku leer", returnedAt: HISTORIE_RUECKGABE });

    const seite = leihhistorie(db, { seite: 1, seitenGroesse: 25 });
    expect(Object.keys(seite).sort()).toEqual(
      ["zeilen", "gesamt", "seite", "seitenGroesse"].sort(),
    );
    expect(Object.keys(seite.zeilen[0]!).sort()).toEqual([...FELDER_LEIHZEILE].sort());
    expect(seite.zeilen[0]?.notiz).toBe("Akku leer");
    for (const verboten of ["deviceId", "snapshotSerialNumber", "zugangscodeId", "createdAt"]) {
      expect(
        Object.keys(seite.zeilen[0]!),
        `${verboten} reist in die Verwaltungsliste mit`,
      ).not.toContain(verboten);
    }
  });
});

describe("radio-leihen: die Bauform der Datei", () => {
  it("traegt keine Direktive und keinen Verweis auf die alte HTTP-Grenze", () => {
    /*
     * ⛔ KEIN `"use client"`, KEIN `"use server"` — reine Datenzugriffe (Spec:5014).
     * Der modulweite `"use client"`-Scan steht in `riegel.test.ts:977-1030`; fuer
     * `"use server"` gibt es ihn nicht (⬜ A-L16, `_lib/meldungen.ts:19-24`), deshalb
     * scannt diese Datei sich hier selbst — dieselbe Bauform wie
     * `_lib/meldungen.test.ts:536-561`.
     *
     * ⛔ UND KEIN VERWEIS AUF DIE ALTE HTTP-GRENZE (Entscheidung 15, Spec:5453): sie steht
     * noch, `radio-admin` behaelt seine sechs Version-1-Routen. Der Abnahmebefehl des
     * Bauabschnitts C prueft dasselbe modulweit; diese Zeile prueft die eine Datei, die es
     * am ehesten braeche.
     *
     * ⛔ DIE ZWEI ANKER STEHEN ZUSAMMENGESETZT DA UND NICHT AUSGESCHRIEBEN, und das ist kein
     * Kunstgriff, sondern die Bedingung dafuer, dass der Waechter existieren DARF: der
     * Abnahmebefehl ist woertlich `rg -n "<umgebungsname>|<routenpfad>" src/app/m/radio` und
     * muss NICHTS liefern. Ein Waechter, der seine eigene Nadel ausschreibt, macht genau
     * diesen Befehl rot — gemessen in dieser Aufgabe: drei Treffer, alle in dieser Datei.
     * Zusammengesetzt prueft er dasselbe und faellt dem Befehl nicht auf. Dieselbe
     * Prosa-Sperre tragen `_lib/anzeige.ts` und `_lib/meldungen.ts:449-454`.
     */
    const ANKER_ALT_HOST = ["RADIO_ADMIN", ""].join("_");
    const ANKER_ALT_ROUTE = ["api", "v1", ""].join("/");
    const quelle = readFileSync(LEIHEN_QUELLE, "utf8");
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
    expect(quelle).not.toMatch(/^\s*["']use server["']/m);
    expect(quelle).not.toContain(ANKER_ALT_HOST);
    expect(quelle).not.toContain(ANKER_ALT_ROUTE);
  });

  it("nennt die Begruendung, warum id und nicht issi der Schluessel ist", () => {
    /*
     * ⛔ DIE BEGRUENDUNG WANDERT ALS KOMMENTAR MIT (Spec:5243-5246). „Ohne den Kommentar
     * ist der naechste naheliegende Umbau ein Join auf `issi`" — und ein Join auf `issi`
     * ist gueltiges SQL, gueltiges Drizzle und bricht in dem Moment, in dem ein Geraet
     * umprogrammiert wird.
     */
    const quelle = readFileSync(LEIHEN_QUELLE, "utf8");
    expect(quelle).toContain("issi is mutable (a device can be reprogrammed)");
  });

  it("nennt die Herkunft der Laengengrenze des Entleihernamens", () => {
    /*
     * A-L17, GESCHLOSSEN AM 2026-08-24 (Fund F2). Bis dahin belegte dieser Fall die
     * fehlende Grenze als DOKUMENTIERTE LEERSTELLE; jetzt belegt er ihre HERKUNFT — die
     * Bauform bleibt dieselbe wie bei der `STALE_GRACE_MS`-Zeile unten, und der Grund auch:
     * eine Zahl aus dem Alt-Bestand darf nicht zu einer Zahl ohne Quelle werden, die beim
     * naechsten Blick in die Alt-App als „ausgedacht" gilt.
     *
     * ⛔ DIE ZAHL SELBST STEHT NICHT HIER, sondern in `_lib/meldungen.ts` — dieser Fall
     * verankert deshalb auf dem ALT-NAMEN und dem ALT-PFAD, nicht auf „100". Ein Anker auf
     * der Ziffernfolge waere eine zweite Wahrheit ueber dieselbe Grenze.
     *
     * ⚠️ DER WAECHTER GEHOERT IN DEN VERFOLGTEN BAUM UND NICHT IN EINEN BERICHT:
     * `.superpowers/` ist git-ignoriert (`.gitignore:17`), was nur dort steht, steht
     * nirgends. Derselbe Praezedenzfall wie bei A-L16 (`_lib/meldungen.ts`).
     *
     * ⛔ ER BELEGT, DASS DER SATZ DASTEHT, NICHT DASS ER STIMMT — dass der Deckel WIRKT,
     * belegt der Fall „weist einen zu langen Entleihernamen ab" weiter oben.
     */
    const quelle = readFileSync(LEIHEN_QUELLE, "utf8");
    expect(quelle, "die Leerstelle A-L17 wird ohne Spur ihrer Aufloesung gestrichen")
      .toContain("A-L17");
    expect(quelle).toContain("ENTLEIHER_MAX");
    const meldungen = readFileSync("src/app/m/radio/_lib/meldungen.ts", "utf8");
    expect(meldungen).toContain("BORROWER_NAME_MAX");
    expect(meldungen).toContain("radio-admin/shared/src/loan.ts:5");
  });

  it("haelt den gestrichenen Ausfall-Puffer als Zeile im Kopf fest", () => {
    /*
     * ⛔ AUFLAGE 6 (Spec:5410-5415): die Streichung von `STALE_GRACE_MS` bleibt eine
     * DOKUMENTIERTE ENTSCHEIDUNG und wird nicht eine Auslassung, die beim naechsten Blick
     * in die Alt-App als „vergessen" wiederentdeckt wird.
     */
    const quelle = readFileSync(LEIHEN_QUELLE, "utf8");
    expect(quelle).toContain("STALE_GRACE_MS");
    expect(quelle).toContain("radio-admin.service.ts:43-48");
  });
});
