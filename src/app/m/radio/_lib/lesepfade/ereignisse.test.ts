// src/app/m/radio/_lib/lesepfade/ereignisse.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../../_db/schema";
import { devices, deviceEvents, users } from "../../_db/schema";
import {
  ereignisseFuerGeraet,
  EREIGNIS_GRENZE,
  FELD_ETIKETTEN,
  QUELLE_WOERTER,
} from "./ereignisse";

/**
 * DIE AENDERUNGSHISTORIE EINES GERAETS (Planteil 4, Aufgabe V7).
 *
 * ⛔ DIESE FLAECHE IST NEU UND KEIN 1:1-PORT
 * (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:4759-4765`): der Alt-Endpunkt
 * `GET /devices/:id/events` (`radio-admin/server/src/routes/devices.ts:66-80`) existiert, hat
 * aber gemessen KEINEN Konsumenten im Alt-Client. Es gibt also kein Vorbild zum Nachpruefen —
 * die Faelle hier pruefen deshalb gegen das DATENMODELL: die sechs Spalten aus
 * `src/app/m/radio/_db/schema.ts:130-141`.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`): dessen Cache ist per MODULSCHLUESSEL
 * gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`). Dieselbe Form wie
 * `src/app/m/radio/_lib/lesepfade/versionen.test.ts:52-63`.
 *
 * ⛔ `foreign_keys = ON` IST HIER KEINE ZIER: `device_events.device_id` ist ein Cascade-FK auf
 * `devices.id` (`_db/schema.ts:127-129`). Jeder Fall legt sein Geraet zuerst an; ohne das bricht
 * schon das Einfuegen des Fixtures.
 */
const MIGRATIONEN = "src/app/m/radio/_db/migrations";

/** Der Anlegezeitpunkt der Geraetezeilen — er spielt in keinem Fall eine Rolle. */
const ANGELEGT_AM = new Date("2026-06-14T07:12:00Z");

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-ereignisse-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Ein Geraet mit genau den Spalten, die dieser Test braucht — `issi` ist unique. */
function geraet(id: string) {
  return { id, issi: `issi-${id}`, createdAt: ANGELEGT_AM, updatedAt: ANGELEGT_AM };
}

/**
 * Ein Zaehler fuer die Ereignis-Ids. ⛔ KEINE ZUFALLSQUELLE — `riegel.test.ts:995-998`
 * verbietet die eingebaute Standardquelle modulweit, und ein Test, der die Regel des Moduls
 * umginge, waere ein schlechtes Vorbild fuer die naechste Datei.
 */
let laufendeNummer = 0;
beforeEach(() => {
  laufendeNummer = 0;
});

/** Eine Ereigniszeile; alles ausser `deviceId` hat eine Vorgabe, die der Fall ueberschreibt. */
function ereignis(
  werte: Partial<typeof deviceEvents.$inferInsert> & { deviceId: string },
): typeof deviceEvents.$inferInsert {
  return {
    id: `e-${++laufendeNummer}`,
    field: "status",
    oldValue: "alt",
    newValue: "neu",
    changedBy: null,
    changedAt: new Date("2026-07-01T10:00:00Z"),
    source: "manual",
    ...werte,
  };
}

/**
 * Die ZWANZIG Feldnamen der Geraetemaske mit ihrem deutschen Etikett — woertlich aus den
 * `label`-Attributen von `radio-admin/client/src/features/devices/DeviceFields.tsx`, je mit
 * eigenem Anker. Der Feldname links ist der Wert, den `diffDevice`
 * (`radio-admin/shared/src/diff-device.ts:16-22`) in `device_events.field` schreibt: der
 * Schluessel des Datensatzes, also genau das `name`-Attribut derselben Zeile.
 *
 * ⛔ SIE STEHT HIER ALS LITERAL UND WIRD NICHT AUS DER ABBILDUNG ABGELEITET. Eine Schleife
 * ueber die Schluessel der Abbildung waere gruen, auch wenn die Abbildung schrumpft — genau
 * die Fehlerform, gegen die die Zahl unten ausserhalb jeder Schleife steht.
 */
const ETIKETTEN_ERWARTET: ReadonlyArray<readonly [string, string]> = [
  ["issi", "ISSI"], // DeviceFields.tsx:63
  ["tei", "TEI"], // DeviceFields.tsx:71
  ["opta", "OPTA"], // DeviceFields.tsx:76
  ["rufname", "Rufname"], // DeviceFields.tsx:77
  ["serialNumber", "Seriennummer"], // DeviceFields.tsx:79
  ["hiorgId", "Hiorg-ID"], // DeviceFields.tsx:84
  ["hersteller", "Hersteller"], // DeviceFields.tsx:95
  ["deviceType", "Gerät"], // DeviceFields.tsx:99
  ["bedieneinheit", "Bedieneinheit"], // DeviceFields.tsx:102
  ["deviceModes", "Gerätefunktionen"], // DeviceFields.tsx:107
  ["funktion", "Funktion"], // DeviceFields.tsx:116
  ["location", "Lagerort"], // DeviceFields.tsx:121
  ["assignedTo", "Zuordnung"], // DeviceFields.tsx:124
  ["status", "Status"], // DeviceFields.tsx:129
  ["loanable", "Ausleihbar"], // DeviceFields.tsx:138
  ["alamosIntegrated", "Alamos integriert"], // DeviceFields.tsx:143
  ["softwareVersion", "Letztes Update"], // DeviceFields.tsx:152
  ["lastUpdatedAt", "Zuletzt aktualisiert"], // DeviceFields.tsx:163
  ["notes", "Bemerkung"], // DeviceFields.tsx:177
  ["updateNote", "Update-Anmerkung (Abweichungen)"], // DeviceFields.tsx:186
];

/**
 * Die VIER Quellwerte mit ihrem Klartextwort. Die Werte links sind abschliessend
 * (`radio-admin/server/src/repos/deviceRepo.ts:219`, `_db/schema.ts:136-141`), die Woerter
 * rechts kommen woertlich aus dem Aufgabentext (`.superpowers/sdd/planteil4/briefs/V7.md`,
 * Abschnitt „source als Tag").
 */
const QUELLEN_ERWARTET: ReadonlyArray<readonly [string, string]> = [
  ["manual", "von Hand"],
  ["csv-import", "CSV-Import"],
  ["create", "angelegt"],
  ["update-note", "Abweichung"],
];

describe("ereignisseFuerGeraet — die Aenderungshistorie eines Geraets", () => {
  it("liefert die Ereignisse eines Geraets, neueste zuerst", () => {
    /*
     * 1:1 aus `getDeviceEvents` (`radio-admin/server/src/repos/deviceRepo.ts:253`:
     * `orderBy(desc(deviceEvents.changedAt))`).
     *
     * ⛔ DREI VERSCHIEDENE ORDNUNGEN, UND DAS IST DER PUNKT DES FIXTURES: die
     * Einfuegereihenfolge (rowid) ist eine dritte, weder die erwartete noch ihre Umkehrung.
     * Faellt `orderBy` ersatzlos weg, antwortet SQLite in rowid-Ordnung — waere die mit der
     * Erwartung deckungsgleich, maesse der Fall nichts. Dieselbe Auflage und derselbe Grund
     * wie in `_lib/lesepfade/versionen.test.ts:102-103`.
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values([
        ereignis({ deviceId: "g1", newValue: "mitte", changedAt: new Date("2026-07-02T10:00:00Z") }),
        ereignis({ deviceId: "g1", newValue: "aelteste", changedAt: new Date("2026-07-01T10:00:00Z") }),
        ereignis({ deviceId: "g1", newValue: "neueste", changedAt: new Date("2026-07-03T10:00:00Z") }),
      ])
      .run();

    expect(ereignisseFuerGeraet(db, "g1").map((z) => z.neu)).toEqual([
      "neueste",
      "mitte",
      "aelteste",
    ]);
  });

  it("liefert KEIN Ereignis eines anderen Geraets", () => {
    /*
     * Der Fall, der ein fehlendes `where` faengt (`deviceRepo.ts:252`:
     * `where(eq(deviceEvents.deviceId, deviceId))`). Ohne ihn liefe eine Historie, die die
     * Aenderungen ALLER Geraete unter dem Namen eines einzigen zeigt — typkorrekt,
     * lint-sauber und in einer Oberflaeche mit einem Geraet nicht zu bemerken.
     */
    db.insert(devices).values([geraet("g1"), geraet("g2")]).run();
    db.insert(deviceEvents)
      .values([
        ereignis({ deviceId: "g1", newValue: "meins" }),
        ereignis({ deviceId: "g2", newValue: "fremd" }),
      ])
      .run();

    expect(ereignisseFuerGeraet(db, "g1").map((z) => z.neu)).toEqual(["meins"]);
  });

  it("deckelt bei zweihundert", () => {
    /*
     * ⬜ V-L7 — DIE GRENZE IST EINE NEUERUNG DIESES PORTS, KEIN 1:1-POSTEN. Der Alt-Leser hat
     * gemessen KEINE Grenze (`deviceRepo.ts:248-254`: kein `limit`, keine Blaetterung); ob die
     * 200 in der Produktion tragen, wird bei der Generalprobe abgelesen
     * (`Spec:4767-4770`, `.superpowers/sdd/planteil4/progress.md`, Zeile V-L7).
     *
     * ⛔ DER AUFRUF UEBERGIBT KEINE GRENZE. Mit einer mitgegebenen Grenze bliebe der Fall
     * gruen, auch wenn die Vorgabe aus dem Bau verschwaende — und genau die Vorgabe ist das,
     * was in der Flaeche wirkt. Deshalb 201 Zeilen im Fixture und ein Aufruf mit zwei
     * Parametern.
     */
    db.insert(devices).values(geraet("g1")).run();
    const zeilen = Array.from({ length: EREIGNIS_GRENZE + 1 }, (_, i) =>
      ereignis({
        deviceId: "g1",
        newValue: `w${i}`,
        // Aufsteigende Zeit: die juengste Zeile traegt den hoechsten Index.
        changedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)),
      }),
    );
    // In Haeppchen, damit die Zahl der gebundenen Parameter unter der Grenze von
    // better-sqlite3 bleibt (201 Zeilen mal acht Spalten).
    for (let i = 0; i < zeilen.length; i += 50) {
      db.insert(deviceEvents).values(zeilen.slice(i, i + 50)).run();
    }

    const ergebnis = ereignisseFuerGeraet(db, "g1");
    expect(ergebnis.length).toBe(200);
    // Die juengste Zeile steht oben — der Deckel schneidet die AELTESTEN weg, nicht die
    // juengsten.
    expect(ergebnis[0]?.neu).toBe(`w${EREIGNIS_GRENZE}`);
  });

  it("nimmt eine kleinere Grenze entgegen", () => {
    /*
     * Der Parameter aus der Signatur (`ereignisseFuerGeraet(db, geraeteId, grenze?)`). Ohne
     * diesen Fall waere der dritte Parameter unbewacht: ein Bau, der ihn entgegennimmt und
     * ignoriert, ist typkorrekt.
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values([
        ereignis({ deviceId: "g1", changedAt: new Date("2026-07-01T10:00:00Z") }),
        ereignis({ deviceId: "g1", changedAt: new Date("2026-07-02T10:00:00Z") }),
        ereignis({ deviceId: "g1", changedAt: new Date("2026-07-03T10:00:00Z") }),
      ])
      .run();

    expect(ereignisseFuerGeraet(db, "g1", 2).length).toBe(2);
  });

  it("jedes der vier Quellwoerter hat ein Klartextwort", () => {
    /*
     * ⛔ DIE ZAHL STEHT AUSSERHALB DER SCHLEIFE. Ein Fall, der nur ueber die Schluessel der
     * gebauten Abbildung laeuft, bleibt gruen, wenn die Abbildung schrumpft — die Menge
     * verschwaende lautlos, und der Rueckfall unten uebernaehme still einen der vier
     * bekannten Werte.
     *
     * Die vier Werte sind abschliessend (`deviceRepo.ts:219`, `_db/schema.ts:136-141`).
     */
    expect(QUELLEN_ERWARTET.length, "die Erwartungstafel selbst").toBe(4);
    expect(Object.keys(QUELLE_WOERTER).length, "die gebaute Abbildung").toBe(4);

    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values(
        QUELLEN_ERWARTET.map(([wert], i) =>
          ereignis({
            deviceId: "g1",
            source: wert as (typeof deviceEvents.$inferInsert)["source"],
            // Absteigende Zeit in der Reihenfolge der Tafel — damit die Antwort dieselbe
            // Reihenfolge traegt wie `QUELLEN_ERWARTET`.
            changedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, QUELLEN_ERWARTET.length - i)),
          }),
        ),
      )
      .run();

    expect(ereignisseFuerGeraet(db, "g1").map((z) => [z.quelle, z.quelleWort])).toEqual(
      QUELLEN_ERWARTET.map(([wert, wort]) => [wert, wort]),
    );
  });

  it("ein unbekannter Quellwert faellt auf den rohen Wert zurueck und stuerzt nicht ab", () => {
    /*
     * ⛔ DER ENUM-OHNE-DB-CHECK-FALL (`_db/schema.ts:135-137`, woertlich: „Die Datenbank
     * akzeptiert JEDEN String; ein fuenfter Wert passiert Datenbank und Typpruefung
     * unbeanstandet und bricht erst in einem erschoepfenden Switch der Oberflaeche.")
     *
     * ⛔ DIE ZEILE ENTSTEHT MIT ROHEM SQL UND NICHT UEBER DRIZZLE — ein `as`-Guss auf den
     * Enum-Typ pruefte die Behauptung nicht, sondern umginge sie. Roh eingefuegt BELEGT der
     * Fall, dass die Datenbank den fuenften Wert annimmt.
     *
     * ⚠️ `changed_at` IST IN SEKUNDEN. Die Spalte steht als
     * `integer(..., { mode: "timestamp" })` (`_db/schema.ts:134`); `mode: "timestamp"` rechnet
     * Sekunden, `Date.now()` gaebe hier ein Jahr weit jenseits des Fensters.
     */
    db.insert(devices).values(geraet("g1")).run();
    sqlite
      .prepare(
        "INSERT INTO device_events (id, device_id, field, old_value, new_value, changed_by, changed_at, source)" +
          " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "e-fremd",
        "g1",
        "status",
        "alt",
        "neu",
        null,
        Math.floor(Date.UTC(2026, 6, 1, 10, 0, 0) / 1000),
        "aus-der-zukunft",
      );

    const zeilen = ereignisseFuerGeraet(db, "g1");
    expect(zeilen.length).toBe(1);
    // Der rohe Wert bleibt erhalten — die Insel braucht ihn fuer ihren erschoepfenden Switch.
    expect(zeilen[0]?.quelle).toBe("aus-der-zukunft");
    // Und das Wort faellt auf ihn zurueck, statt leer zu bleiben oder zu werfen.
    expect(zeilen[0]?.quelleWort).toBe("aus-der-zukunft");
  });

  it("jedes Feld der Etikettenliste hat ein deutsches Etikett", () => {
    /*
     * ⛔ DIE ZAHL STEHT AUSSERHALB DER SCHLEIFE, und die Erwartung ist eine LITERALE Tafel im
     * Test — nicht die Schluessel der gebauten Abbildung. Sonst schrumpfte die Liste lautlos
     * mit, und die Historie zeigte fuer das verlorene Feld seinen Spaltennamen.
     *
     * `Spec:4770`, woertlich: „deutsches Etikett aus derselben Etikettenliste, die das
     * Formular benutzt".
     */
    expect(ETIKETTEN_ERWARTET.length, "die Erwartungstafel selbst").toBe(20);
    expect(Object.keys(FELD_ETIKETTEN).length, "die gebaute Abbildung").toBe(20);

    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values(
        ETIKETTEN_ERWARTET.map(([feld], i) =>
          ereignis({
            deviceId: "g1",
            field: feld,
            changedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, ETIKETTEN_ERWARTET.length - i)),
          }),
        ),
      )
      .run();

    expect(ereignisseFuerGeraet(db, "g1").map((z) => z.feldEtikett)).toEqual(
      ETIKETTEN_ERWARTET.map(([, etikett]) => etikett),
    );
  });

  it("ein Feld ohne Etikett faellt auf den rohen Feldnamen zurueck", () => {
    /*
     * Damit ein neues Feld nicht eine LEERE Spalte erzeugt. Der Alt-Bestand schreibt eine
     * Ereigniszeile je geaendertem Schluessel des Datensatzes
     * (`radio-admin/shared/src/diff-device.ts:16-22`); wer dem Schema eine Spalte hinzufuegt,
     * ohne diese Liste zu erweitern, bekommt den Spaltennamen zu sehen — nicht nichts.
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents).values(ereignis({ deviceId: "g1", field: "nochNichtBenannt" })).run();

    expect(ereignisseFuerGeraet(db, "g1")[0]?.feldEtikett).toBe("nochNichtBenannt");
  });

  it("leere alte und neue Werte werden als Gedankenstrich dargestellt", () => {
    /*
     * `Spec:4771-4772` („leere Werte als `—`"). ⛔ BEIDE SEITEN, MIT JE UNTERSCHIEDLICHEM
     * WERT AUF DER ANDEREN — ein Bau, der nur eine der beiden Seiten faltet, bliebe bei
     * einem symmetrischen Fixture gruen.
     *
     * ⚠️ ZWEI LEERFORMEN, BEIDE GEFALTET: `null` (die Spalten tragen kein `.notNull()`,
     * `_db/schema.ts:131-132`) und die leere Zeichenkette (`toEventValue` gibt fuer einen
     * leeren Feldwert ebendiese heraus, `radio-admin/shared/src/diff-device.ts:4-6`).
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values([
        ereignis({
          deviceId: "g1",
          oldValue: null,
          newValue: "gesetzt",
          changedAt: new Date("2026-07-03T10:00:00Z"),
        }),
        ereignis({
          deviceId: "g1",
          oldValue: "vorher",
          newValue: null,
          changedAt: new Date("2026-07-02T10:00:00Z"),
        }),
        ereignis({
          deviceId: "g1",
          oldValue: "",
          newValue: "",
          changedAt: new Date("2026-07-01T10:00:00Z"),
        }),
      ])
      .run();

    expect(ereignisseFuerGeraet(db, "g1").map((z) => [z.alt, z.neu])).toEqual([
      ["—", "gesetzt"],
      ["vorher", "—"],
      ["—", "—"],
    ]);
  });

  it("der rohe sub steht im title, nicht in der Zelle", () => {
    /*
     * `Spec:4772` — der aufgeloeste Name in der Zelle, der rohe `sub` nur im `title`. Der
     * Fall haelt fest, dass BEIDE Werte da sind und an VERSCHIEDENEN Stellen; ein Bau, der
     * nur einen von beiden fuehrt, kann die Zusage nicht halten.
     *
     * Die Aufloesung ist 1:1 aus `radio-admin/server/src/routes/devices.ts:70-78`, samt
     * Rueckfall auf den rohen `sub` — „so the field is never blank".
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(users)
      .values({ sub: "sub-bekannt", name: "Anna Beispiel", lastSeenAt: ANGELEGT_AM })
      .run();
    db.insert(deviceEvents)
      .values([
        ereignis({
          deviceId: "g1",
          changedBy: "sub-bekannt",
          changedAt: new Date("2026-07-02T10:00:00Z"),
        }),
        ereignis({
          deviceId: "g1",
          changedBy: "sub-unbekannt",
          changedAt: new Date("2026-07-01T10:00:00Z"),
        }),
      ])
      .run();

    expect(ereignisseFuerGeraet(db, "g1").map((z) => [z.werText, z.werSub])).toEqual([
      // Der bekannte `sub`: Name in der Zelle, roher Wert daneben.
      ["Anna Beispiel", "sub-bekannt"],
      // Der unbekannte: Rueckfall auf den rohen Wert, aber das Feld bleibt nie leer.
      ["sub-unbekannt", "sub-unbekannt"],
    ]);
  });

  it("eine Zeile ohne Urheber traegt einen Gedankenstrich und keinen sub", () => {
    /*
     * ⚠️ HIER GIBT ES KEIN 1:1 ZU PORTIEREN, und das steht hier, statt verschwiegen zu
     * werden: `changed_by` ist nullable (`_db/schema.ts:133`), der Alt-Endpunkt antwortet
     * dafuer mit `changedByName: null` (`radio-admin/server/src/routes/devices.ts:77`) — und
     * er hat gemessen keinen Konsumenten, der zeigte, wie das aussieht. Der Gedankenstrich
     * ist die Leerwertform dieses Moduls (`_db/leihen.ts`, `ZURUECK_OFFEN`;
     * `_lib/lesepfade/geraete.ts:434`, `letztesUpdateText`), also eine BENANNTE Wahl.
     *
     * Der Fall ist kein Randfall: jede Zeile aus dem CSV-Import traegt den Urheber nicht.
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values(ereignis({ deviceId: "g1", changedBy: null, source: "csv-import" }))
      .run();

    const zeile = ereignisseFuerGeraet(db, "g1")[0];
    expect(zeile?.werText).toBe("—");
    expect(zeile?.werSub).toBe("");
  });

  it("die Zeit kommt vorformatiert und in der Zone der Flaeche", () => {
    /*
     * ⛔ VORFORMATIERT AUF DEM SERVER (`_lib/anzeige.ts:75`, `datumMitUhrzeit`). Die Zeile
     * geht als Prop an Insel 5 (`Spec:4507`); ein `Date` ueber diese Grenze ist verboten
     * (Bauform-Zulaessigkeitstafel Nr. 7, `.superpowers/sdd/planteil4/briefs/KOPF.md:320`),
     * und eine im Browser gerechnete Zeit entschiede an der Tagesgrenze anders als der
     * Server (`Spec:3341-3342`).
     *
     * 01:30 UTC ist in Berlin (UTC+2 im Juli) 03:30 — der Fall misst also die Zone mit.
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values(ereignis({ deviceId: "g1", changedAt: new Date("2026-07-16T01:30:00Z") }))
      .run();

    expect(ereignisseFuerGeraet(db, "g1")[0]?.zeitText).toBe("16.07.2026, 03:30");
  });

  it("ohne Ereignisse antwortet der Lesepfad mit einer leeren Liste und fragt keine Namen ab", () => {
    /*
     * Der Normalfall eines frisch importierten Geraets. ⛔ KEIN WURF und kein `null` — die
     * Server Component aus V15 rendert daraus ihren Leertext, und ein Wurf kostete die ganze
     * Seite.
     *
     * ⛔ DIE NUTZERTABELLE WIRD VORHER GELOESCHT, und das ist die Messung, nicht Zierrat.
     * GEMESSEN (Sonde P13 dieser Aufgabe): drizzle 0.45.2 wirft bei einer LEEREN Werteliste
     * NICHT mehr — es setzt einen Falsch-Ausdruck ein. Ein Fall, der nur „kein Wurf" prueft,
     * bliebe deshalb auch ohne die Vorkehrung in `nutzernamen` gruen und bewachte nichts. Ohne
     * Tabelle dagegen ist die Frage messbar: wird sie gestellt, bricht SQLite ab.
     */
    db.insert(devices).values(geraet("g1")).run();
    sqlite.exec("DROP TABLE users");

    expect(ereignisseFuerGeraet(db, "g1")).toEqual([]);
  });

  it("eine Historie ganz ohne Urheber fragt die Nutzertabelle nicht", () => {
    /*
     * ⛔ DIE LEERE EINGABE FRAEGT DIE DATENBANK NICHT — sonst entstuende das ungueltige
     * `IN ()`, das SQLite zurueckweist. Der Alt-Kommentar nennt genau diesen Grund
     * (`radio-admin/server/src/repos/userRepo.ts:25-26`), und dieselbe Vorkehrung traegt
     * `_lib/lesepfade/geraete.ts:538-548`.
     *
     * ⚠️ HIER IST ES KEIN RANDFALL: eine per CSV importierte Historie traegt `changed_by`
     * durchgehend als `null` — die leere Eingabe ist der Normalfall dieser Flaeche, nicht ihr
     * Rand. Faellt die Vorkehrung, stellt der haeufigste Lesevorgang des Moduls eine Frage,
     * die er nicht stellen muesste.
     */
    db.insert(devices).values(geraet("g1")).run();
    db.insert(deviceEvents)
      .values([
        ereignis({ deviceId: "g1", changedBy: null, changedAt: new Date("2026-07-02T10:00:00Z") }),
        ereignis({ deviceId: "g1", changedBy: null, changedAt: new Date("2026-07-01T10:00:00Z") }),
      ])
      .run();
    // ⛔ DIESELBE MESSUNG WIE OBEN, auf dem anderen Weg in denselben Zweig: hier gibt es
    // Zeilen, nur keinen Urheber. Ohne die Tabelle bricht jede gestellte Frage ab.
    sqlite.exec("DROP TABLE users");

    expect(ereignisseFuerGeraet(db, "g1").length).toBe(2);
    expect(ereignisseFuerGeraet(db, "g1")[0]?.werText).toBe("—");
  });
});
