// src/app/m/radio/admin/actions.verhalten.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";
import { deviceEvents, devices, loans, softwareVersions } from "../_db/schema";

/**
 * DIE VERHALTENSZUSICHERUNGEN VON `admin/actions.ts` — die acht namentlichen Faelle aus
 * `.superpowers/sdd/planteil4/briefs/V10.md:127-136`, plus die zwei, die die
 * Betreiberentscheidung ⬜ V-L6 verlangt.
 *
 * ⛔ WARUM SIE HIER STEHEN UND NICHT IN V11 — eine BENANNTE ABWEICHUNG von `V10.md:122-126`.
 * Jener Satz gibt die acht Faelle an V11 weiter („sie wandern in V11s Datei"). ⛔ V11s Brief
 * nimmt sie gemessen NICHT an: er fuehrt elf Faelle (`briefs/V11.md:22`, „Die elf
 * Zusicherungen"), und keiner der elf ist einer der acht — es sind ausschliesslich
 * Quelltext-Scan-Faelle plus die vier Seiten-Zusicherungen
 * (`briefs/KOPF.md:1524-1548`). Der Vorabscan hat das als Fund **F5** („BAU-ANHALTEND: acht
 * benannte Verhaltenszusicherungen haben keinen Eigentuemer") gemessen und genau diese Datei
 * als eine der zwei Aufloesungen benannt (`.superpowers/sdd/planteil4/VORABSCAN.md`, F5,
 * „Vorschlag"). ⛔ V10 kann V11s Brief nicht aendern; eine Weitergabe, die der Empfaenger
 * nicht annimmt, ist keine.
 *
 * ⛔ `admin/actions.test.ts` (Aufgabe V11) BLEIBT DAVON UNBERUEHRT: das ist der vierte
 * QUELLTEXT-Scan, diese Datei hier prueft VERHALTEN. Zwei verschiedene Fragen, zwei Dateien —
 * dieselbe Trennung wie zwischen `riegel.test.ts` und `_lib/zugang.test.ts`.
 *
 * FUENF MOCKS, JEDER MIT SEINEM GRUND (Form 1:1 aus `_lib/zugang.test.ts:31-50`):
 *
 *   `next/navigation` — `redirect()` und `notFound()` werfen in der echten Laufzeit
 *   Next-interne Fehler. Fuer die Unit-Aussage genuegt ein ERKENNBARER Wurf; er traegt hier
 *   zusaetzlich das ZIEL, weil `geraetLoeschenAction`s aeusserer Pfad eine benannte
 *   Abweichung ist und einen Waechter braucht.
 *
 *   `next/cache` — `revalidatePath()` gibt es ausserhalb einer Anfrage nicht. Der Mock
 *   SAMMELT die Pfade: die innere Form (`/m/radio/...`) ist eine Zusage, die kein Tor sonst
 *   prueft — ein aeusserer Pfad dort ist folgenlos, und `typecheck`, `lint` und `build`
 *   bleiben gruen (`_actions/ausleihe.ts:74-77`).
 *
 *   `next/headers` — `riegelAufStufe` ruft `headers()` (`_lib/zugang.ts:461`).
 *
 *   `@/core/auth` — `auth()` liest das Session-JWT; der Test steuert Sitzung und damit Stufe.
 *
 *   `../_db/client` — die Actions UND der Riegel rufen `getDb()`. Sie bekommen eine ECHTE,
 *   migrierte Datei-Datenbank; ⛔ NICHT `getModuleDb()`, dessen Cache per Modulschluessel
 *   gekeyt ist und nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`). Vorbild
 *   `_db/migrations.test.ts:29-37`.
 */
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    throw new Error(`NEXT_REDIRECT:${ziel}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

let entwertetePfade: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => {
    entwertetePfade.push(pfad);
  },
}));

let hostKopf = new Headers({ host: "radio.localtest.me" });
vi.mock("next/headers", () => ({ headers: async () => hostKopf }));

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
vi.mock("../_db/client", () => ({ getDb: () => testDb }));

import {
  geraetAendernAction,
  geraetAnlegenAction,
  geraetLoeschenAction,
  importSchreibenAction,
  notizAnfuegenAction,
  versionAnlegenAction,
  versionLoeschenAction,
  versionZielSetzenAction,
  versionenSortierenAction,
} from "./actions";

const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const UPDATER_GRUPPE = "eine-updater-gruppe";

const ADMIN_SITZUNG = {
  user: { id: "sub-admin", name: "Adam Admin", groups: ["iuk-radio-admin"] },
};
const UPDATER_SITZUNG = {
  user: { id: "sub-updater", name: "Uwe Updater", groups: [UPDATER_GRUPPE] },
};

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const alterAdmin = process.env.SUITE_ADMIN_GROUP_RADIO;
const alterUpdater = process.env.SUITE_UPDATER_GROUP_RADIO;
const alterHost = process.env.SUITE_HOST_RADIO;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-actions-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
  testDb = db;
  entwertetePfade = [];
  hostKopf = new Headers({ host: "radio.localtest.me" });
  sitzung = ADMIN_SITZUNG;
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_HOST_RADIO;
  // Die Updater-Stufe ist ohne diese Variable GESCHLOSSEN (`_lib/zugang.ts:225-231`); die
  // zwei Faelle, die sie brauchen, bekommen sie hier fuer die ganze Datei.
  process.env.SUITE_UPDATER_GROUP_RADIO = UPDATER_GRUPPE;
});

afterEach(() => {
  testDb = null;
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  for (const [name, wert] of [
    ["SUITE_ADMIN_GROUP_RADIO", alterAdmin],
    ["SUITE_UPDATER_GROUP_RADIO", alterUpdater],
    ["SUITE_HOST_RADIO", alterHost],
  ] as const) {
    if (wert === undefined) delete process.env[name];
    else process.env[name] = wert;
  }
});

/** Ein Geraet mit den Feldern, die die Faelle unten anfassen. */
function geraet(werte: Partial<typeof devices.$inferInsert> & { id: string; issi: string }) {
  db.insert(devices)
    .values({
      rufname: `Ruf ${werte.id}`,
      status: "Einsatzbereit",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      updatedAt: new Date("2026-01-01T10:00:00Z"),
      ...werte,
    })
    .run();
}

const ereignisse = () => db.select().from(deviceEvents).all();
const versionen = () => db.select().from(softwareVersions).all();
const geraeteZeilen = () => db.select().from(devices).all();

describe("geraetAnlegenAction", () => {
  it("schreibt eine create-Ereigniszeile je NICHT-NULL uebergebenem Feld", async () => {
    /*
     * ⛔ 1:1 aus `radio-admin/server/src/routes/devices.ts:106-108`, `:117`: der Filter
     * `v !== null && v !== undefined` ist die tragende Zeile. Ohne ihn truege jedes
     * ausgelassene Feld eine Ereigniszeile „nach null" — und die Historie eines frisch
     * angelegten Geraets bestuende zur Haelfte aus Nichtaenderungen.
     */
    const ergebnis = await geraetAnlegenAction({
      issi: "1000001",
      rufname: "Florian 1",
      status: null,
      notes: undefined,
    });

    expect(ergebnis.ok).toBe(true);
    const zeilen = ereignisse();
    expect(zeilen.map((z) => z.field).sort()).toEqual(["issi", "rufname"]);
    expect(zeilen.every((z) => z.source === "create")).toBe(true);
    expect(zeilen.every((z) => z.oldValue === null)).toBe(true);
  });

  it("lehnt eine LEERE ISSI ab, statt sie einzufuegen", async () => {
    /*
     * ⛔ `deviceCreateSchema` fuehrt `issi: z.string().min(1)`
     * (`radio-admin/shared/src/schemas.ts:52`) — das einzige Pflichtfeld der Maske
     * („ISSI ist erforderlich", `DeviceFields.tsx:64`).
     * ⛔ `notNull()` IN DER SPALTE ERSETZT DAS NICHT: SQLite nimmt `""` an. Die erste leere
     * ISSI ginge durch, die zweite kollidierte auf dem Unique-Index — und die Meldung
     * spraeche von einer VERGEBENEN ISSI, also von einem ganz anderen Problem.
     */
    const ergebnis = await geraetAnlegenAction({ issi: "", rufname: "Ohne Kennung" });

    expect(ergebnis).toEqual({ ok: false, fehler: "Anlegen fehlgeschlagen" });
    expect(geraeteZeilen()).toEqual([]);
  });

  it("nimmt keine servereigenen Felder aus der Nutzlast an", async () => {
    /*
     * ⛔ DER 1:1-ERSATZ FUER ZODS `.strip()` (`schemas.ts:49`, `:72`: „server-owned fields
     * (id/createdAt/updatedAt/...) are NOT accepted"). Eine Server Action bekommt ihre
     * Argumente ueber die Leitung — die Typsignatur ist beim Aufruf eine Zusage des
     * Aufrufers, keine Pruefung; deshalb steht hier ein `as`, das die Grenze nachbaut.
     * ⛔ Ohne den Schnitt schriebe drizzle `id` als echte Spalte, und der Primaerschluessel
     * eines Geraets liesse sich von aussen bestimmen.
     */
    const ergebnis = await geraetAnlegenAction({
      issi: "1000001",
      id: "g-fremdbestimmt",
      createdBy: "sub-gefaelscht",
    } as unknown as Parameters<typeof geraetAnlegenAction>[0]);

    expect(ergebnis.ok).toBe(true);
    const zeile = geraeteZeilen()[0];
    expect(zeile.id).not.toBe("g-fremdbestimmt");
    expect(zeile.createdBy).toBe("sub-admin");
  });

  it("rollt bei einer ISSI-Kollision die Softwareversion mit zurueck", async () => {
    /*
     * ⛔ `devices.ts:110-111`, woertlich: „a duplicate-ISSI throw rolls back the whole write".
     * Die tragende Zeile ist die `db.transaction(...)`-Klammer — ohne sie bliebe die eben
     * registrierte Softwareversion stehen, obwohl das Geraet nie entstanden ist.
     */
    geraet({ id: "g-1", issi: "1000001" });

    const ergebnis = await geraetAnlegenAction({ issi: "1000001", softwareVersion: "FW 9.9" });

    expect(ergebnis).toEqual({ ok: false, fehler: "ISSI bereits vergeben" });
    expect(versionen()).toEqual([]);
    expect(ereignisse()).toEqual([]);
  });
});

describe("geraetAendernAction", () => {
  it("schreibt bei leerem Diff kein Ereignis", async () => {
    /*
     * ⛔ DER FRUEHE AUSSTIEG `if (diffs.length === 0)` steht zweimal im Bestand
     * (`devices.ts:139-142` und `deviceRepo.ts:229`): kein Ereignis, kein `updatedAt`, kein
     * `revalidatePath`. Alle drei werden hier geprueft — der Ausstieg ohne die dritte Zusage
     * waere ein Geraet, dessen Detailseite nach einem Nichtvorgang neu gerendert wird.
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1" });
    const vorher = geraeteZeilen()[0].updatedAt;

    const ergebnis = await geraetAendernAction("g-1", { rufname: "Florian 1" });

    expect(ergebnis).toEqual({ ok: true });
    expect(ereignisse()).toEqual([]);
    expect(geraeteZeilen()[0].updatedAt).toEqual(vorher);
    expect(entwertetePfade).toEqual([]);
  });

  it("filtert die Rolle VOR dem Diff", async () => {
    /*
     * ⛔ DIE REIHENFOLGE IST DER GANZE PUNKT (`devices.ts:136-137`, `Spec:4586-4592`): eine
     * Updater-Person aendert `rufname` UND `status`, und `rufname` steht nicht in
     * `UPDATER_FELDER` (`_lib/rollen.ts:79`). Es entsteht EIN Ereignis, nicht zwei — liefe
     * der Diff vor dem Filter, truege die Historie eine Aenderung an `rufname`, die nie
     * geschrieben wurde.
     */
    sitzung = UPDATER_SITZUNG;
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1", status: "Einsatzbereit" });

    const ergebnis = await geraetAendernAction("g-1", { rufname: "Florian 2", status: "Defekt" });

    expect(ergebnis).toEqual({ ok: true });
    expect(ereignisse().map((z) => z.field)).toEqual(["status"]);
    expect(geraeteZeilen()[0].rufname).toBe("Florian 1");
    expect(geraeteZeilen()[0].status).toBe("Defekt");
  });

  it("rollt bei einer ISSI-Kollision alles zurueck", async () => {
    /*
     * ⛔ `devices.ts:144-145`, woertlich: „roll back together (e.g. changing issi to an
     * existing one rolls back)". ⛔ NACH DEM FEHLSCHLAG STEHT WEDER DIE NEUE SOFTWAREVERSION
     * NOCH EINE EREIGNISZEILE.
     */
    geraet({ id: "g-1", issi: "1000001" });
    geraet({ id: "g-2", issi: "1000002" });

    const ergebnis = await geraetAendernAction("g-1", {
      issi: "1000002",
      softwareVersion: "FW 9.9",
    });

    expect(ergebnis).toEqual({ ok: false, fehler: "ISSI bereits vergeben" });
    expect(versionen()).toEqual([]);
    expect(ereignisse()).toEqual([]);
    expect(geraeteZeilen().find((z) => z.id === "g-1")?.issi).toBe("1000001");
  });

  it("lehnt eine LEERE ISSI im Patch ab, laesst eine fehlende aber durch", async () => {
    /*
     * ⛔ `devicePatchSchema` fuehrt `issi: z.string().min(1).optional()` (`schemas.ts:76`):
     * fehlen darf sie, leer sein nicht. Eine Pruefung OHNE das `!== undefined` machte jede
     * gewoehnliche Aenderung unmoeglich; eine ohne die Leerpruefung schriebe eine
     * kennungslose Zeile.
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1" });

    expect(await geraetAendernAction("g-1", { issi: "" })).toEqual({
      ok: false,
      fehler: "Speichern fehlgeschlagen",
    });
    expect(geraeteZeilen()[0].issi).toBe("1000001");

    expect(await geraetAendernAction("g-1", { rufname: "Florian 2" })).toEqual({ ok: true });
    expect(geraeteZeilen()[0].rufname).toBe("Florian 2");
  });

  it("nimmt keine servereigenen Felder aus dem Patch an", async () => {
    /*
     * ⛔ Dieselbe Grenze wie beim Anlegen (`schemas.ts:99`), und hier waere der Schaden
     * groesser: ein durchgereichtes `createdAt` faelschte die Bestandsgeschichte, ein `id`
     * verschoebe die Zeile unter jeder Ereigniszeile weg, die per Cascade-FK an ihr haengt.
     * ⚠️ Der Rollenfilter faengt das NICHT — fuer die Admin-Stufe ist er eine flache Kopie
     * (`_lib/rollen.ts:105`).
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1" });

    const ergebnis = await geraetAendernAction("g-1", {
      rufname: "Florian 2",
      id: "g-fremdbestimmt",
      createdBy: "sub-gefaelscht",
    } as unknown as Parameters<typeof geraetAendernAction>[1]);

    expect(ergebnis).toEqual({ ok: true });
    const zeile = geraeteZeilen()[0];
    expect(zeile.id).toBe("g-1");
    expect(zeile.createdBy).toBeNull();
    expect(ereignisse().map((z) => z.field)).toEqual(["rufname"]);
  });

  it("entwertet die drei INNEREN Pfade, nie die aeusseren", async () => {
    /*
     * ⛔ `revalidatePath` adressiert Nexts Zwischenspeicher, nicht die Adresszeile
     * (`Spec:4212-4216`). Ein aeusserer Pfad dort ist FOLGENLOS und still — Fund F3 der
     * Planteil-3-Schlusspruefung war genau dieser Fehler.
     * Die Liste steht in der 1:1-Tafel Abschnitt D (`briefs/KOPF.md:1314`), abgeleitet aus
     * `useUpdateDevice.ts:38-39`.
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1" });

    await geraetAendernAction("g-1", { rufname: "Florian 2" });

    expect(entwertetePfade).toEqual([
      "/m/radio/admin/geraete/g-1",
      "/m/radio/admin/geraete",
      "/m/radio/admin",
    ]);
  });
});

describe("geraetLoeschenAction — ⬜ V-L6", () => {
  it("gibt die offene Leihe im selben Vorgang zurueck und loescht danach", async () => {
    /*
     * ⛔ DIE BETREIBERENTSCHEIDUNG VOM 2026-08-24 UEBERHOLT DEN PLAN
     * (`.superpowers/sdd/planteil4/progress.md`, „✅ V-L6"): nicht ablehnen, nicht verwaisen
     * lassen — die offene Leihe wird automatisch als zurueckgegeben gebucht.
     * ⛔ MIT DEM ZEITPUNKT DES LOESCHENS, nicht `NULL` und nicht `new Date(0)`: der vernarbte
     * Praezedenzfall (B7) haette jede aktive Leihe zu einer 1970 zurueckgegebenen gemacht,
     * und der naechste Retention-Lauf haette sie geloescht.
     * ⛔ UND ERKENNBAR ALS SOLCHE — ueber `return_note` (`_db/schema.ts:220`), das einzige
     * Feld, das es tragen kann.
     */
    geraet({ id: "g-1", issi: "1000001" });
    db.insert(loans)
      .values({
        id: "l-1",
        deviceId: "g-1",
        snapshotCallSign: "Ruf g-1",
        borrowerName: "Bea Beispiel",
        borrowedAt: new Date("2026-06-14T07:12:00Z"),
        createdAt: new Date("2026-06-14T07:12:00Z"),
        updatedAt: new Date("2026-06-14T07:12:00Z"),
      })
      .run();
    /*
     * ⚠️ AUF DIE SEKUNDE GENAU, NICHT AUF DIE MILLISEKUNDE: `returned_at` ist
     * `integer(..., { mode: "timestamp" })` (`_db/schema.ts:219`), und Drizzle speichert dort
     * SEKUNDEN. Ein Vergleich gegen die rohen Millisekunden waere rot-by-construction — und
     * der billige „Fix" waere, die Zusage ganz zu streichen.
     */
    const vorher = Math.floor(Date.now() / 1000) * 1000;

    await expect(geraetLoeschenAction("g-1")).rejects.toThrow("NEXT_REDIRECT:/admin/geraete");

    expect(geraeteZeilen()).toEqual([]);
    const leihe = db.select().from(loans).where(eq(loans.id, "l-1")).get();
    expect(leihe?.returnNote).toBe("Automatisch zurückgegeben: Gerät gelöscht");
    expect(leihe?.returnedAt).not.toBeNull();
    expect(leihe!.returnedAt!.getTime()).toBeGreaterThanOrEqual(vorher);
  });

  it("laesst bei einem Abbruch weder die Rueckgabe noch die Loeschung stehen", async () => {
    /*
     * ⛔ „Beides in EINER Transaktion" (V-L6, Punkt 4): ein Abbruch dazwischen hinterliesse
     * genau den verwaisten Zustand, den die Entscheidung vermeiden soll.
     *
     * ⛔ DER FALL IST KONSTRUIERBAR, WEIL `loans.device_id` ABSICHTLICH KEIN FREMDSCHLUESSEL
     * IST (`_db/schema.ts:201-205`): eine Leihzeile kann auf ein Geraet zeigen, das es nicht
     * (mehr) gibt. Die Rueckgabe gelingt dann, das `DELETE` trifft null Zeilen, und die
     * Transaktion muss BEIDES zurueckrollen.
     *
     * ⚠️ ER MISST ZUGLEICH DIE ZUSAGE AUS DEM QUELLTEXT, dass `bucheRueckgabe(db, …)` mit der
     * AEUSSEREN Verbindung INNERHALB der offenen Transaktion laeuft (better-sqlite3 ist
     * synchron und einverbindungsgebunden). Liefe sie daneben, bliebe die Rueckgabe stehen
     * und dieser Fall waere rot.
     */
    db.insert(loans)
      .values({
        id: "l-geist",
        deviceId: "g-geist",
        snapshotCallSign: "Ruf g-geist",
        borrowerName: "Bea Beispiel",
        borrowedAt: new Date("2026-06-14T07:12:00Z"),
        createdAt: new Date("2026-06-14T07:12:00Z"),
        updatedAt: new Date("2026-06-14T07:12:00Z"),
      })
      .run();

    const ergebnis = await geraetLoeschenAction("g-geist");

    expect(ergebnis).toEqual({ ok: false, fehler: "Löschen fehlgeschlagen" });
    const leihe = db.select().from(loans).where(eq(loans.id, "l-geist")).get();
    expect(leihe?.returnedAt, "die Rueckgabe blieb stehen, obwohl das Loeschen scheiterte")
      .toBeNull();
    expect(leihe?.returnNote).toBeNull();
    expect(entwertetePfade).toEqual([]);
  });

  it("entwertet auch die Ausleihenliste — sie mutiert seit V-L6 mit", async () => {
    /*
     * ⛔ VORABSCAN-FUND F2, PUNKT (d): die 1:1-Tafel (`briefs/KOPF.md:1315`) fuehrt fuer
     * diesen Weg nur `/m/radio/admin/geraete` und `/m/radio/admin`. Mit der automatischen
     * Rueckgabe mutiert die Action jetzt auch `loans` — ohne die dritte Zeile zeigte
     * `/admin/ausleihen` danach eine veraltete Liste.
     *
     * ⛔ UND DAS ZIEL DES `redirect` IST DER AEUSSERE PFAD (benannte Abweichung von
     * `Spec:4605`): der innere WUERDE rendern (`src/core/routing.ts:68-77`), und genau
     * deshalb waere der Fehler still.
     */
    geraet({ id: "g-1", issi: "1000001" });

    await expect(geraetLoeschenAction("g-1")).rejects.toThrow("NEXT_REDIRECT:/admin/geraete");

    expect(entwertetePfade).toEqual([
      "/m/radio/admin/geraete",
      "/m/radio/admin",
      "/m/radio/admin/ausleihen",
    ]);
  });
});

describe("notizAnfuegenAction", () => {
  it("benutzt EINEN Zeitstempel fuer Zeile und Ereignis", async () => {
    /*
     * ⛔ `devices.ts:172-176`, woertlich: „One timestamp for both the appended note and its
     * audit event so they can never diverge across a midnight-UTC boundary." Die tragende
     * Zeile ist das GEMEINSAME `jetzt` in beiden `haengeNotizAn`-Aufrufen; die messbare
     * Folge ist, dass der `newValue` des Ereignisses ZEICHENGLEICH die letzte Zeile der
     * gespeicherten Anmerkung ist.
     */
    geraet({ id: "g-1", issi: "1000001", updateNote: "[2026-01-01 · Alt] frueher" });

    const ergebnis = await notizAnfuegenAction("g-1", "Antenne getauscht");

    expect(ergebnis).toEqual({ ok: true });
    const notiz = geraeteZeilen()[0].updateNote ?? "";
    const letzte = notiz.split("\n").at(-1);
    expect(ereignisse()[0].newValue).toBe(letzte);
  });

  it("lehnt einen leeren oder nur aus Leerraum bestehenden Text ab", async () => {
    /*
     * ⛔ `updateNoteSchema` fuehrt `text: z.string().trim().min(1)` (`schemas.ts:103`) —
     * GETRIMMT, anders als bei der ISSI (`:52`, rohe Laenge). Ohne die Pruefung haengt ein
     * leerer Text eine dauerhafte Auditzeile OHNE INHALT an, und niemand kann sie mehr
     * entfernen: die Spalte ist append-only (`_db/schema.ts:56-59`).
     */
    geraet({ id: "g-1", issi: "1000001", updateNote: "[2026-01-01 · Alt] frueher" });

    expect(await notizAnfuegenAction("g-1", "   ")).toEqual({
      ok: false,
      fehler: "Anmerkung fehlgeschlagen",
    });
    expect(geraeteZeilen()[0].updateNote).toBe("[2026-01-01 · Alt] frueher");
    expect(ereignisse()).toEqual([]);
  });

  it("schreibt als newValue NUR die neue Zeile", async () => {
    /*
     * ⛔ `devices.ts:180`: das Ereignis traegt `oldValue = bisherige Notiz` und
     * `newValue = nur die neue Zeile`. Schriebe es die ganze Notiz, waechse jede
     * Ereigniszeile um den gesamten bisherigen Verlauf — und die Historie waere nach dem
     * dritten Eintrag unlesbar.
     */
    geraet({ id: "g-1", issi: "1000001", updateNote: "[2026-01-01 · Alt] frueher" });

    await notizAnfuegenAction("g-1", "Antenne getauscht");

    const zeile = ereignisse()[0];
    expect(zeile.field).toBe("updateNote");
    expect(zeile.source).toBe("update-note");
    expect(zeile.oldValue).toBe("[2026-01-01 · Alt] frueher");
    expect(zeile.newValue).not.toContain("frueher");
    expect(zeile.newValue).toContain("Antenne getauscht");
    // Die gespeicherte Anmerkung behaelt den alten Inhalt WOERTLICH (`update-note.ts:34`).
    expect(geraeteZeilen()[0].updateNote).toContain("frueher");
  });
});

describe("die vier Versions-Actions", () => {
  it("versionAnlegenAction lehnt ein Duplikat mit dem woertlichen Satz ab", async () => {
    /*
     * ⛔ DER WEG IST `onConflictDoNothing` UND DIE PRUEFUNG `changes > 0`
     * (`softwareVersionRepo.ts:54-59`), nicht ein `SELECT` davor.
     */
    await versionAnlegenAction("FW 12.3");
    const zweiter = await versionAnlegenAction("FW 12.3");

    expect(zweiter).toEqual({ ok: false, fehler: "Diese Version existiert bereits" });
    expect(versionen()).toHaveLength(1);
    // ⛔ Eine neu angelegte Version wird NIE automatisch zum Ziel (`_db/schema.ts:80-82`).
    expect(versionen()[0].isTarget).toBe(false);
  });

  it("versionZielSetzenAction raeumt bei unbekannter Id keine Marke ab", async () => {
    /*
     * ⛔ DER WETTLAUF-FALL (`softwareVersionRepo.ts:79-88`), woertlich: „Set first:
     * changes === 0 means the id is unknown, so we bail without having cleared anything (no
     * pre-flight existence SELECT needed)."
     * ⛔ EIN `SELECT`-DANN-`UPDATE` WAERE HIER EIN FACHLICHER FEHLER: eine unbekannte Id
     * loeschte die Marke ueberall — und der Update-Stand JEDES Geraets haengt allein an ihr.
     */
    db.insert(softwareVersions)
      .values({ id: "v-1", value: "FW 12.3", createdAt: new Date(), isTarget: true })
      .run();

    const ergebnis = await versionZielSetzenAction("v-unbekannt");

    expect(ergebnis).toEqual({ ok: false, fehler: "Zielversion konnte nicht gesetzt werden" });
    expect(versionen()[0].isTarget, "die Ziel-Marke wurde abgeraeumt").toBe(true);
  });

  it("versionZielSetzenAction setzt die Marke und raeumt die anderen ab", async () => {
    db.insert(softwareVersions)
      .values([
        { id: "v-1", value: "FW 12.3", createdAt: new Date(), isTarget: true },
        { id: "v-2", value: "FW 12.4", createdAt: new Date(), isTarget: false },
      ])
      .run();

    expect(await versionZielSetzenAction("v-2")).toEqual({ ok: true });

    const nach = Object.fromEntries(versionen().map((z) => [z.id, z.isTarget]));
    expect(nach).toEqual({ "v-1": false, "v-2": true });
  });

  it("versionLoeschenAction lehnt ab, solange Geraete die Version tragen", async () => {
    /*
     * ⛔ `softwareVersionRepo.ts:102-120`, mit dem woertlichen Text aus
     * `SoftwareVersionsPage.tsx:60`. Der Alt-Kommentar (`:98-101`) gibt den Grund: „the admin
     * must reassign those devices first, so deletion can never orphan a device's version
     * string."
     */
    db.insert(softwareVersions)
      .values({ id: "v-1", value: "FW 12.3", createdAt: new Date() })
      .run();
    geraet({ id: "g-1", issi: "1000001", softwareVersion: "FW 12.3" });
    geraet({ id: "g-2", issi: "1000002", softwareVersion: "FW 12.3" });

    const ergebnis = await versionLoeschenAction("v-1");

    expect(ergebnis).toEqual({ ok: false, fehler: "Version wird noch von 2 Gerät(en) genutzt" });
    expect(versionen()).toHaveLength(1);
  });

  it("versionenSortierenAction gibt der ERSTEN Id den hoechsten sortOrder", async () => {
    /*
     * ⛔ `ids.length - index` (`softwareVersionRepo.ts:131`): die Liste kommt von oben nach
     * unten herein, die Anzeige sortiert `desc(sortOrder)` (`:150`). Wer `index` schreibt,
     * dreht die Liste um, ohne dass ein Tor rot wird.
     * ⛔ UNBEKANNTE IDS WERDEN IGNORIERT, DIE ZIEL-MARKE BLEIBT UNBERUEHRT (`:124-125`).
     */
    db.insert(softwareVersions)
      .values([
        { id: "v-1", value: "FW 12.3", createdAt: new Date(), sortOrder: 1, isTarget: true },
        { id: "v-2", value: "FW 12.4", createdAt: new Date(), sortOrder: 2 },
      ])
      .run();

    expect(await versionenSortierenAction(["v-2", "v-1", "v-unbekannt"])).toEqual({ ok: true });

    const nach = Object.fromEntries(versionen().map((z) => [z.id, z.sortOrder]));
    expect(nach).toEqual({ "v-1": 2, "v-2": 3 });
    expect(versionen().find((z) => z.id === "v-1")?.isTarget).toBe(true);
  });
});

describe("importSchreibenAction", () => {
  it("legt an, aendert nur die geaenderten Felder und schreibt fuer Fehlerzeilen nichts", async () => {
    /*
     * ⛔ 1:1 aus `apply-commit.ts:37-71`: `created` und `updated` schreiben, `unchanged`,
     * `error` und `skipped-no-permission` schreiben NICHTS (`:69`). ⛔ Und beim Aendern nur
     * die tatsaechlich geaenderten Felder (`:58-61`) — sonst schriebe ein Import jede
     * zugeordnete Spalte und `updated_at` spraenge fuer Zeilen ohne Aenderung.
     *
     * ⚠️ `quelle` IST `csv-import` (`briefs/V10.md:115`); der Bestand schreibt fuer eine NEU
     * angelegte Zeile gemessen `create` (`apply-commit.ts:50`) — die Abweichung ist im
     * Quelltext benannt.
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Alt", status: "Einsatzbereit" });

    const ergebnis = await importSchreibenAction({ issi: 0, rufname: 1 }, [
      ["1000001", "Neu"], // updated
      ["1000002", "Frisch"], // created
      ["", "ohne Kennung"], // error
      ["1000002", "Doppelt"], // error: Duplikat in Datei
    ]);

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.zusammenfassung).toEqual({
      created: 1,
      updated: 1,
      unchanged: 0,
      error: 2,
      "skipped-no-permission": 0,
    });

    const zeilen = geraeteZeilen();
    expect(zeilen).toHaveLength(2);
    const geaendert = zeilen.find((z) => z.issi === "1000001");
    expect(geaendert?.rufname).toBe("Neu");
    // ⛔ `status` war nicht zugeordnet und bleibt unangetastet.
    expect(geaendert?.status).toBe("Einsatzbereit");
    expect(zeilen.find((z) => z.issi === "1000002")?.rufname).toBe("Frisch");

    expect(ereignisse().every((z) => z.source === "csv-import")).toBe(true);
    /*
     * ⚠️ KEIN `issi`-EREIGNIS: der Klassifikator entfernt die ISSI aus dem Patch, BEVOR er
     * difft — „it is the match key, never a diffed/persisted field"
     * (`classify-import-row.ts:39`, uebernommen in `_lib/csv/klassifizieren.ts:280`). Das ist
     * der gemessene Unterschied zum Anlegeweg des FORMULARS, der `issi` mitzaehlt
     * (`devices.ts:106-108`); beide Wege sind hier 1:1 abgebildet, samt ihrer Divergenz.
     */
    expect(ereignisse().map((z) => z.field).sort()).toEqual(["rufname", "rufname"]);
  });

  it("lehnt ohne zugeordnete ISSI-Spalte mit dem woertlichen Satz ab", async () => {
    /*
     * ⛔ `ImportWizard.tsx:109`, `:211`: ohne zugeordnete ISSI-Spalte gibt es keinen
     * Schluessel — und der Alt-Assistent laesst den Schritt gar nicht erst zu. Der Server
     * prueft erneut: „eine Regel, die nur im Client steht, ist keine Regel" (Spec:3583-3585).
     */
    const ergebnis = await importSchreibenAction({ rufname: 1 }, [["1000001", "Neu"]]);

    expect(ergebnis).toEqual({ ok: false, fehler: "ISSI-Spalte muss zugeordnet sein" });
    expect(geraeteZeilen()).toEqual([]);
  });
});
