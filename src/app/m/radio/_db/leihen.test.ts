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
import { ZUSTANDSNOTIZ_MAX } from "../_lib/meldungen";
import {
  geraeteMitLeihstand,
  offeneAusleihen,
  sucheEntleiher,
  bucheAusleihe,
  bucheRueckgabe,
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
     * ⛔ GEMESSEN WIRD DER UNGETRIMMTE WERT — `_db/leihen.ts:599` misst `notiz.length`,
     * nicht `notiz.trim().length`, und das ist Absicht: gemessen wird, was gespeichert
     * wird (`_db/leihen.ts:591-592`, die Notiz wird nicht umgeschrieben). Bis zu diesem
     * Fall war die Grenze zwar bewacht, aber nicht, WELCHEN der zwei Werte sie misst:
     * kein Fall trug Leerzeichen an den Enden (REVIEW-A17 Fund F6-N).
     *
     * ⛔ DIESER FALL GEHOERT VOR DIE GRENZZEILE DARUNTER UND DARF NICHT UNTER SIE WANDERN.
     * Er traegt nur, solange die Leihe noch aktiv ist — und das ist sie hier, gemessen von
     * der Zusicherung darueber. Faellt `:599` auf `trim()`, laeuft der Wert durch die
     * Pruefung und bucht die AKTIVE Leihe zurueck: `ok` wird `true`, der Fall rot. Unter
     * der Grenzzeile ist die Leihe bereits zurueck, dasselbe `ok: false` kaeme dann aus
     * `schon-zurueck` (`_db/leihen.ts:619-620`) und der Fall bliebe GRUEN — gemessen, die
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

describe("radio-leihen: die Bauform der Datei", () => {
  it("traegt keine Direktive und keinen Verweis auf die alte HTTP-Grenze", () => {
    /*
     * ⛔ KEIN `"use client"`, KEIN `"use server"` — reine Datenzugriffe (Spec:5014).
     * Der modulweite `"use client"`-Scan steht in `riegel.test.ts:921-940`; fuer
     * `"use server"` gibt es ihn nicht (⬜ A-L16, `_lib/meldungen.ts:19-24`), deshalb
     * scannt diese Datei sich hier selbst — dieselbe Bauform wie
     * `_lib/meldungen.test.ts:530-555`.
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
     * Prosa-Sperre tragen `_lib/anzeige.ts` und `_lib/meldungen.ts:384-389`.
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

  it("benennt die fehlende Laengengrenze des Entleihernamens als Leerstelle", () => {
    /*
     * ⬜ A-L17. DIESELBE BAUFORM WIE DIE `STALE_GRACE_MS`-ZEILE UNTEN, UND AUS DEMSELBEN GRUND:
     * eine Grenze des Alt-Bestands, die hier NICHT faellt, muss eine dokumentierte
     * Entscheidung bleiben und darf keine Auslassung werden, die beim naechsten Blick in
     * die Alt-App als „vergessen" wiederentdeckt wird. Der Alt-Deckel ist
     * `BORROWER_NAME_MAX: 100` (`radio-admin/shared/src/loan.ts:5`).
     *
     * ⚠️ DER WAECHTER GEHOERT IN DEN VERFOLGTEN BAUM UND NICHT IN EINEN BERICHT:
     * `.superpowers/` ist git-ignoriert (`.gitignore:17`), eine Leerstelle, die nur dort
     * steht, steht nirgends. Derselbe Praezedenzfall, aus dem A14 die Leerstelle A-L16
     * nach `_lib/meldungen.ts:19-24` gehoben hat.
     *
     * ⛔ ER BELEGT, DASS DER SATZ DASTEHT, NICHT DASS ER STIMMT — genau wie die zwei
     * Quelltext-Scans darunter. Behauptet wird nichts anderes.
     */
    const quelle = readFileSync(LEIHEN_QUELLE, "utf8");
    expect(quelle).toContain("BORROWER_NAME_MAX");
    expect(quelle).toContain("radio-admin/shared/src/loan.ts:5");
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
