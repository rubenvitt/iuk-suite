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
/**
 * ⛔ DER PFAD, AUF DEM `revalidatePath` WERFEN SOLL — das Messwerkzeug fuer Review-V10 Fund
 * F13. Nexts eigenes `revalidatePath` wirft ausserhalb einer Anfrage; ein Erfolgsabschluss
 * INNERHALB eines `try` machte daraus die Meldung „Import fehlgeschlagen" fuer einen
 * vollstaendig geschriebenen Import.
 */
let entwertungWirftAuf: string | null = null;
vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => {
    entwertetePfade.push(pfad);
    if (pfad === entwertungWirftAuf) throw new Error("revalidatePath ausserhalb einer Anfrage");
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
  entwertungWirftAuf = null;
  hostKopf = new Headers({ host: "radio.localtest.me" });
  sitzung = ADMIN_SITZUNG;
  delete process.env.SUITE_ADMIN_GROUP_RADIO;
  delete process.env.SUITE_HOST_RADIO;
  // Die Updater-Stufe ist ohne diese Variable GESCHLOSSEN (`_lib/zugang.ts:225-231`); die
  // zwei Faelle, die sie brauchen, bekommen sie hier fuer die ganze Datei.
  process.env.SUITE_UPDATER_GROUP_RADIO = UPDATER_GRUPPE;
});

afterEach(() => {
  vi.unstubAllGlobals();
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

/**
 * ⛔ EINE UHR, DIE BEI JEDEM ARGUMENTLOSEN `new Date()` EINEN TAG WEITERSPRINGT — das
 * Werkzeug fuer die zwei Zusagen „EIN Zeitstempel", die sonst nur in Produktion rot werden
 * koennen (Review V10 Funde F1 und F5).
 *
 * ⛔ WARUM NICHT `vi.useFakeTimers()`: eine GEPINNTE Uhr macht zwei Lesungen IDENTISCHER,
 * nicht unterscheidbarer — der Waechter waere danach noch schwaecher als vorher. Was die
 * eine Lesung von zwei trennt, ist eine Uhr, die WEITERLAEUFT.
 *
 * ⛔ WARUM EIN GANZER TAG UND NICHT EINE SEKUNDE: `haengeNotizAn` formt ueber `isoDatum` nur
 * `YYYY-MM-DD` (`_lib/notiz.ts:18-20`, `:82-86`), und `changedAt` liegt in einer
 * `mode: "timestamp"`-Spalte, die SEKUNDEN speichert (`_db/schema.ts:134`). Ein Sprung
 * unterhalb eines Tages faerbt die erste Zusage gemessen NICHT — genau das ist die
 * Mitternachtsgrenze, vor der der Alt-Kommentar warnt
 * (`radio-admin/server/src/routes/devices.ts:172-176`: „so they can never diverge across a
 * midnight-UTC boundary").
 *
 * ⚠️ `Date.now()` BLEIBT ECHT, und Aufrufe MIT Argument gehen unveraendert durch: drizzle
 * liest jeden Zeitstempel als `new Date(ms)` zurueck, und eine Attrappe, die das verbiegt,
 * machte die Datenbank unlesbar statt die Zusage messbar.
 */
const UHR_BASIS = Date.UTC(2026, 5, 14, 23, 59, 59, 500);
function springendeUhr(): void {
  const echt = Date;
  let n = 0;
  class Springend extends echt {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(UHR_BASIS + n++ * 86_400_000);
      else super(...(args as [number]));
    }
    static now(): number {
      return echt.now();
    }
  }
  vi.stubGlobal("Date", Springend);
}

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
    // ⛔ REVIEW-V10 FUND F6: die DREI Pfade dieses Wegs waren unbewacht (1:1-Tafel
    // Abschnitt D, `briefs/KOPF.md:1313`, abgeleitet aus `useCreateDevice.ts:11-13`).
    // ⛔ INNERE FORM — ein aeusserer Pfad hier ist folgenlos und still.
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/geraete",
      "/m/radio/admin",
      "/m/radio/admin/versionen",
    ]);
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

  it("lehnt einen Wert der FALSCHEN ART ab, statt ihn zu wandeln", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F2. Der Alt-Bestand fuehrt seine Feldgrenzen als zod-Schema, und das
     * traegt nicht nur `.strip()` und `min(1)`, sondern auch TYPPRAEDIKATE:
     * `alamosIntegrated: z.boolean().nullable().optional()` und
     * `status: z.string().nullable().optional()` (`radio-admin/shared/src/schemas.ts:69`,
     * `:57`). Ein Verstoss ist dort 400 `invalid` fuer die GANZE Anfrage (`devices.ts:102`).
     *
     * ⛔ DIE TYPSIGNATUR TRAEGT DAS NICHT: eine Server Action bekommt ihre Argumente ueber die
     * Leitung, `GeraetEingabe` ist beim Aufruf eine Zusage des Aufrufers.
     * ⛔ UND DIE FOLGE IST EINE BEDEUTUNGSUMKEHR, KEIN SCHOENHEITSFEHLER: better-sqlite3
     * bindet fuer eine `mode: "boolean"`-Spalte jeden wahrheitswertigen Wert, und aus dem
     * Text „nein" wird `true`.
     *
     * ⚠️ DIESER FALL VERLETZT NUR DIE BOOLEAN-GRENZE, der Aenderweg unten nur die
     * STRING-Grenze — und das ist Absicht: verletzte EIN Fall beide, deckte jedes der zwei
     * Praedikate das andere ab, und beide Sonden ergaeben 0 rot (gemessen in Fix-Runde 1,
     * bevor die Faelle getrennt waren).
     */
    const ergebnis = await geraetAnlegenAction({
      issi: "1000001",
      alamosIntegrated: "nein",
    } as unknown as Parameters<typeof geraetAnlegenAction>[0]);

    expect(ergebnis).toEqual({ ok: false, fehler: "Anlegen fehlgeschlagen" });
    expect(geraeteZeilen()).toEqual([]);
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

  it("gibt allen Ereigniszeilen EINER Aenderung denselben changedAt", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F5, dieselbe Klasse wie F1 und eine Ebene tiefer: „EIN EINZIGER
     * `changedAt` FUER ALLE" ist 1:1 aus `writeEvents`
     * (`radio-admin/server/src/repos/deviceRepo.ts:222-245`) und war unbewacht. Ohne die
     * Zusage fielen die Felder EINER Aenderung in der nach `changedAt` sortierten
     * Ereignisliste auseinander.
     *
     * ⛔ DIE SPRINGENDE UHR IST HIER DAS GANZE MESSWERKZEUG: ein `new Date()` JE ZEILE liegt
     * an einer echten Uhr in derselben Millisekunde, und die Spalte speichert ohnehin nur
     * Sekunden — die naheliegende Sonde „Zeile entfernen" ist ausserdem keine gueltige
     * (`ReferenceError`, sie faerbt neun Faelle und misst nichts).
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1", status: "Einsatzbereit" });
    springendeUhr();

    expect(await geraetAendernAction("g-1", { rufname: "Florian 2", status: "Defekt" })).toEqual({
      ok: true,
    });

    const zeilen = ereignisse();
    expect(zeilen).toHaveLength(2);
    const zeitpunkte = new Set(zeilen.map((z) => z.changedAt.getTime()));
    expect(zeitpunkte.size, "die zwei Ereigniszeilen tragen verschiedene changedAt").toBe(1);
  });

  it("lehnt eine unbekannte Geraete-Id ab, statt eine Zeile anzulegen", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F10, zweite Haelfte. Der Bestand antwortet 404
     * (`devices.ts:128-129`); der Alt-Client bildet ihn auf den allgemeinen Satz ab.
     */
    expect(await geraetAendernAction("g-unbekannt", { rufname: "Florian 2" })).toEqual({
      ok: false,
      fehler: "Speichern fehlgeschlagen",
    });
    expect(geraeteZeilen()).toEqual([]);
    expect(entwertetePfade).toEqual([]);
  });

  it("lehnt eine LEERE ISSI im Patch ab, laesst eine fehlende aber durch", async () => {
    /*
     * ⛔ `devicePatchSchema` fuehrt `issi: z.string().min(1).optional()` (`schemas.ts:78`):
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

  it("lehnt einen Wert der FALSCHEN ART im Patch ab", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F2, zweite Haelfte: dieselbe Luecke im Patchweg
     * (`radio-admin/shared/src/schemas.ts:76-99`), und hier ist es die STRING-Grenze
     * (`status: z.string().nullable().optional()`, `:83`). ⛔ ABGELEHNT WIRD DIE GANZE ANFRAGE, das
     * Feld wird NICHT still weggeschnitten — der Bestand antwortet 400 `invalid`
     * (`devices.ts:102`), und ein stilles Wegschneiden waere eine NEUE Bedeutung: der
     * Bedienende bekaeme „gespeichert" fuer etwas, das nicht gespeichert wurde.
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1", status: "Einsatzbereit" });

    const ergebnis = await geraetAendernAction("g-1", {
      rufname: "Florian 2",
      status: 42,
    } as unknown as Parameters<typeof geraetAendernAction>[1]);

    expect(ergebnis).toEqual({ ok: false, fehler: "Speichern fehlgeschlagen" });
    const zeile = geraeteZeilen()[0];
    expect(zeile.rufname).toBe("Florian 1");
    // ⛔ GEMESSEN, WAS OHNE DIE GRENZE PASSIERT: better-sqlite3 schriebe die Zahl als
    // `"42.0"` in die Textspalte — ein Status, den es in keiner Auswahlliste gibt.
    expect(zeile.status).toBe("Einsatzbereit");
    expect(ereignisse()).toEqual([]);
  });

  it("entwertet die vier INNEREN Pfade, nie die aeusseren", async () => {
    /*
     * ⛔ `revalidatePath` adressiert Nexts Zwischenspeicher, nicht die Adresszeile
     * (`Spec:4212-4216`). Ein aeusserer Pfad dort ist FOLGENLOS und still — Fund F3 der
     * Planteil-3-Schlusspruefung war genau dieser Fehler.
     * Die Liste steht in der 1:1-Tafel Abschnitt D (`briefs/KOPF.md:1314`), abgeleitet aus
     * `useUpdateDevice.ts:38-39`.
     *
     * ⛔ DER VIERTE PFAD IST `/m/radio/admin/software` UND KAM MIT DER FIX-RUNDE 1 ZU V17
     * DAZU (REVIEW-V17 Fund F1). Er ist KEINE Erweiterung der Tafel, sondern ihre
     * Vervollstaendigung: der Alt-Faecher invalidiert `['devices']`
     * (`useUpdateDevice.ts:39`), und der Listenschluessel des Update-Modus ist
     * `['devices', params]` (`useDevices.ts:62`) — die Karte lud im Bestand nach. Der
     * Update-Modus ist die EINZIGE Flaeche, von der aus diese Action ueberhaupt getappt
     * wird (`admin/(arbeit)/software/UpdateSuche.tsx`, `anwenden`), und ohne die Zeile
     * entwertete sie jede Geraeteflaeche AUSSER ihrer eigenen.
     */
    geraet({ id: "g-1", issi: "1000001", rufname: "Florian 1" });

    await geraetAendernAction("g-1", { rufname: "Florian 2" });

    expect(entwertetePfade).toEqual([
      "/m/radio/admin/geraete/g-1",
      "/m/radio/admin/geraete",
      "/m/radio/admin",
      "/m/radio/admin/software",
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

  it("bricht ab, wenn die Rueckgabe fehlschlaegt — das Geraet bleibt stehen", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F3. Der Quelltext behauptet neben der Zeile ausdruecklich, das
     * Ergebnis der Rueckgabe werde GEPRUEFT („ohne die Pruefung liefe die Loeschung weiter
     * und die Leihe bliebe offen") — und die Zusage war unbewacht. Sie ist Punkt 4 der
     * Betreiberentscheidung ⬜ V-L6: ein Abbruch dazwischen hinterliesse genau den verwaisten
     * Zustand, den die Entscheidung vermeiden soll.
     *
     * ⛔ DER FEHLSCHLAG WIRD ECHT ERZEUGT, NICHT WEGGEMOCKT: ein `BEFORE UPDATE`-Ausloeser mit
     * `RAISE(ABORT, …)` laesst das `SELECT` von `offeneLeiheZuGeraet` durch und bringt genau
     * das `UPDATE` von `bucheRueckgabe` zu Fall (`_db/leihen.ts:694-698`), das seinen Fehler
     * selbst faengt und `{ ok: false }` liefert. ⚠️ `RAISE(ABORT)` rollt NUR DIE ANWEISUNG
     * zurueck, nicht die umschliessende Transaktion — gemessen, sonst waere dieser Fall
     * rot-by-construction. Eine Attrappe auf `../_db/leihen` haette zugleich die zweite,
     * bereits bewachte Zusage abgeschaltet, dass `bucheRueckgabe(db, …)` mit der AEUSSEREN
     * Verbindung INNERHALB der offenen Transaktion laeuft.
     *
     * ⛔ DER AUFRUF STEHT IN EINEM `try`, UND DAS IST DIE ZUSICHERUNG DIESES FALLES, NICHT
     * BEQUEMLICHKEIT (Review-V10 Fund N2). Im gruenen Lauf wirft die Action nicht — sie bricht
     * vor dem `redirect()` ab und liefert `{ ok: false }`. Faellt der Riegel weg, laeuft die
     * Loeschung durch bis zum `redirect()`, und dessen Attrappe wirft (`:56-58`): ohne das
     * `try` faerbte die Sonde ueber den UMLEITUNGS-SENTINEL, und „das Geraet bleibt stehen"
     * aus dem Fallnamen bliebe im Sondenlauf ungeprueft. ⛔ DESHALB STEHEN DIE ZUSTANDS-
     * ZUSICHERUNGEN VOR DER ZUSICHERUNG AUF `ergebnis` — die erste rote Zeile soll die sein,
     * die der Fallname nennt. ⚠️ `rejects` traegt hier NICHT: der gruene Lauf wirft ja gerade
     * nicht.
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
    sqlite.exec(
      "CREATE TRIGGER sonde_rueckgabe BEFORE UPDATE ON loans BEGIN SELECT RAISE(ABORT, 'sonde'); END",
    );

    let ergebnis: Awaited<ReturnType<typeof geraetLoeschenAction>> | undefined;
    try {
      ergebnis = await geraetLoeschenAction("g-1");
    } catch {
      // Der Umleitungs-Sentinel. Er faellt NUR im Sondenlauf; siehe den Kopf dieses Falles.
    }

    expect(
      geraeteZeilen(),
      "das Geraet wurde geloescht, obwohl die Rueckgabe fehlschlug",
    ).toHaveLength(1);
    const leihe = db.select().from(loans).where(eq(loans.id, "l-1")).get();
    expect(leihe?.returnedAt, "die Rueckgabe blieb gebucht, obwohl die Transaktion fiel").toBeNull();
    expect(entwertetePfade).toEqual([]);
    expect(ergebnis).toEqual({ ok: false, fehler: "Löschen fehlgeschlagen" });
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
    /*
     * ⛔ OHNE DIE SPRINGENDE UHR PRUEFT DIESER FALL DIE ZUSAGE NICHT (Review V10 Fund F1,
     * gemessen: die natuerliche Mutation „zwei Uhrenlesungen" ergab 0 rot). `isoDatum` formt
     * nur `YYYY-MM-DD` — zwei Lesungen derselben Millisekunde sind zeichengleich, und die
     * EINZIGE rote Bedingung ist die Mitternachtsgrenze. Die Uhr stellt genau sie her.
     */
    springendeUhr();

    const ergebnis = await notizAnfuegenAction("g-1", "Antenne getauscht");

    expect(ergebnis).toEqual({ ok: true });
    const notiz = geraeteZeilen()[0].updateNote ?? "";
    const letzte = notiz.split("\n").at(-1);
    expect(
      ereignisse()[0].newValue,
      "Zeile und Ereignis liefen ueber die Mitternachtsgrenze auseinander",
    ).toBe(letzte);
  });

  it("faellt fuer den Autor auf den rohen sub zurueck, wenn kein Name da ist", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F7: der BENANNTE Rueckfall in `autorName` war unbewacht, weil beide
     * Testsitzungen einen Namen tragen. Er ist derselbe wie in `merkeNutzer`
     * (`_lib/zugang.ts:427-430`) und derselbe, den der Bestand auf der Leseseite einsetzt,
     * „so the field is never blank" (`radio-admin/server/src/routes/devices.ts:70-78`).
     * ⛔ EIN NAME AUS LEERRAUM IST KEIN NAME — deshalb `?.trim()` und nicht `?? `.
     */
    sitzung = { user: { id: "sub-namenlos", name: "   ", groups: ["iuk-radio-admin"] } };
    geraet({ id: "g-1", issi: "1000001" });

    expect(await notizAnfuegenAction("g-1", "Antenne getauscht")).toEqual({ ok: true });

    expect(geraeteZeilen()[0].updateNote).toContain("· sub-namenlos]");
  });

  it("lehnt eine unbekannte Geraete-Id ab, statt sie anzulegen", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F10: `if (!bestehend) return …` war in BEIDEN Actions unbewacht.
     * Der Bestand antwortet hier 404 (`devices.ts:164-165`), und der 404 faellt im Alt-Client
     * in den allgemeinen Zweig — deshalb derselbe Satz wie bei einem fehlgeschlagenen
     * Schreibvorgang und kein dritter, neu erfundener.
     */
    expect(await notizAnfuegenAction("g-unbekannt", "Antenne getauscht")).toEqual({
      ok: false,
      fehler: "Anmerkung fehlgeschlagen",
    });
    expect(ereignisse()).toEqual([]);
    expect(entwertetePfade).toEqual([]);
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
    // ⛔ REVIEW-V10 FUND F6: die Pfade dieses Wegs (1:1-Tafel Abschnitt D,
    // `briefs/KOPF.md:1316`) waren unbewacht — INNERE Form, und die Uebersicht steht NICHT
    // dabei, weil eine Anmerkung keine Kennzahl der Uebersichtsseite bewegt.
    // ⛔ `/m/radio/admin/software` KAM MIT DER FIX-RUNDE 1 ZU V17 DAZU (Fund F1): die
    // gespeicherte Anmerkung steht auf der Update-Karte (`UpdateKarteZeile.updateAnmerkung`,
    // `_lib/lesepfade/geraete.ts`), und der zweite Knopf der Karte ruft genau diese Action
    // (`admin/(arbeit)/software/UpdateSuche.tsx`, `anhaengen`). Im Bestand lud die Karte
    // nach, weil `useUpdateNote.ts:16` `['devices']` invalidiert.
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/geraete/g-1",
      "/m/radio/admin/geraete",
      "/m/radio/admin/software",
    ]);
  });
});

describe("die vier Versions-Actions", () => {
  it("versionAnlegenAction lehnt ein Duplikat mit dem woertlichen Satz ab", async () => {
    /*
     * ⛔ DER WEG IST `onConflictDoNothing` UND DIE PRUEFUNG `changes > 0`
     * (`softwareVersionRepo.ts:54-59`), nicht ein `SELECT` davor.
     */
    await versionAnlegenAction("FW 12.3");
    // ⛔ REVIEW-V10 FUND F6: die DREI Pfade dieses Wegs waren unbewacht (1:1-Tafel
    // Abschnitt D, `briefs/KOPF.md:1317`). ⚠️ ABGELESEN VOR DEM ZWEITEN AUFRUF — der Mock
    // SAMMELT ueber den ganzen Fall hinweg, und eine Zusicherung danach saehe beide Listen
    // aneinandergehaengt.
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/versionen",
      "/m/radio/admin/geraete",
      "/m/radio/admin",
    ]);
    entwertetePfade = [];

    const zweiter = await versionAnlegenAction("FW 12.3");

    expect(zweiter).toEqual({ ok: false, fehler: "Diese Version existiert bereits" });
    expect(versionen()).toHaveLength(1);
    // ⛔ Eine neu angelegte Version wird NIE automatisch zum Ziel (`_db/schema.ts:80-82`).
    expect(versionen()[0].isTarget).toBe(false);
    // ⛔ EINE ABGELEHNTE ANLAGE ENTWERTET NICHTS — sie hat nichts geaendert.
    expect(entwertetePfade).toEqual([]);
  });

  it("versionAnlegenAction setzt die neue Version an die SPITZE der Reihenfolge", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F8: `naechsteReihenfolge` — „eine neu gesehene Version landet oben"
     * (1:1 aus `nextSortOrder`, `softwareVersionRepo.ts:19-25`) — war unbewacht; kein Fall
     * las `sortOrder` nach dem Anlegen. Die Anzeige sortiert `desc(sortOrder)` (`:150`), also
     * entscheidet diese eine Zahl die Position.
     */
    db.insert(softwareVersions)
      .values({ id: "v-1", value: "FW 12.3", createdAt: new Date(), sortOrder: 5 })
      .run();

    expect(await versionAnlegenAction("FW 12.4")).toEqual({ ok: true });

    expect(versionen().find((z) => z.value === "FW 12.4")?.sortOrder).toBe(6);
  });

  it("versionAnlegenAction lehnt einen Wert aus reinem Leerraum ab", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F9: `value` getrimmt, min 1
     * (`radio-admin/server/src/routes/softwareVersions.ts:13`). Die Fassung im Client prueft
     * dasselbe (`SoftwareVersionsPage.tsx:28-29`) — „eine Regel, die nur im Client steht, ist
     * keine Regel" (Spec:3583-3585). Ohne sie entstuende eine Version namens „   ", die in
     * jeder Liste als leere Zeile erscheint und nie wieder zuzuordnen ist.
     */
    expect(await versionAnlegenAction("   ")).toEqual({
      ok: false,
      fehler: "Version konnte nicht angelegt werden",
    });
    expect(versionen()).toEqual([]);
    expect(entwertetePfade).toEqual([]);
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
    // ⛔ REVIEW-V10 FUND F6, INNERE Form (1:1-Tafel Abschnitt D, `briefs/KOPF.md:1317`).
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/versionen",
      "/m/radio/admin/geraete",
      "/m/radio/admin",
    ]);
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
    // ⛔ EINE ABGELEHNTE LOESCHUNG ENTWERTET NICHTS.
    expect(entwertetePfade).toEqual([]);
  });

  it("versionLoeschenAction loescht eine ungenutzte Version und entwertet die drei Pfade", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F6: dieser Weg hatte ueberhaupt keinen Erfolgsfall, und damit war
     * seine Pfadliste unbewacht (1:1-Tafel Abschnitt D, `briefs/KOPF.md:1317`).
     */
    db.insert(softwareVersions)
      .values({ id: "v-1", value: "FW 12.3", createdAt: new Date() })
      .run();

    expect(await versionLoeschenAction("v-1")).toEqual({ ok: true });

    expect(versionen()).toEqual([]);
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/versionen",
      "/m/radio/admin/geraete",
      "/m/radio/admin",
    ]);
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
    // ⛔ REVIEW-V10 FUND F6, INNERE Form (1:1-Tafel Abschnitt D, `briefs/KOPF.md:1317`).
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/versionen",
      "/m/radio/admin/geraete",
      "/m/radio/admin",
    ]);
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
    // ⛔ REVIEW-V10 FUND F6: die DREI Pfade dieses Wegs waren unbewacht (1:1-Tafel
    // Abschnitt D, `briefs/KOPF.md:1318`). ⛔ INNERE Form.
    expect(entwertetePfade).toEqual([
      "/m/radio/admin/geraete",
      "/m/radio/admin",
      "/m/radio/admin/versionen",
    ]);
  });

  it("registriert eine neue Softwareversion auch auf dem AENDERUNGS-Zweig", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F12: `registriereVersion` stand auf dem Aenderungszweig unbewacht —
     * der einzige Importfall ordnete keine `softwareVersion` zu. Ohne die Zeile traegt ein
     * Geraet nach dem Import eine Versionszeichenkette, die in der Versionsliste gar nicht
     * vorkommt: die Zielversion liesse sich nie darauf setzen, und der Update-Stand jedes
     * Geraets haengt allein an dieser Marke (`_db/schema.ts:84-92`).
     * ⛔ 1:1 AUS `apply-commit.ts:62-64`, wo dieselbe Registrierung im Aenderungszweig steht.
     */
    geraet({ id: "g-1", issi: "1000001", softwareVersion: "FW 12.3" });

    const ergebnis = await importSchreibenAction({ issi: 0, softwareVersion: 1 }, [
      ["1000001", "FW 12.4"],
    ]);

    expect(ergebnis.ok).toBe(true);
    expect(geraeteZeilen()[0].softwareVersion).toBe("FW 12.4");
    expect(versionen().map((z) => z.value)).toEqual(["FW 12.4"]);
  });

  it("schneidet ein NICHT IMPORTIERBARES Feld schon aus der Zuordnung — Neuanlage", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F4, Fall (a). `Spaltenzuordnung` ist eine Typzusage des Aufrufers,
     * und `zeileZuEingehend` schreibt JEDEN Schluessel der Zuordnung in die Zeile
     * (`_lib/csv/klassifizieren.ts:186-201`). Bis zur Fix-Runde schnitt die Action das
     * SCHREIBEN zurecht, den KLASSIFIKATOR aber nicht — die Ereignisliste einer Neuanlage
     * trug dadurch `{ feld: "id", alt: "", neu: "g-fremdbestimmt" }`: ⛔ EINE AUDITZEILE
     * UEBER EINE AENDERUNG, DIE NIE STATTFAND.
     *
     * ⛔ DER SCHNITT LIEGT DESHALB AN DER ZUORDNUNG, dem Eintrittsort der fremden Daten, und
     * nicht an zwei Stellen dahinter: so speisen sich Ereignis, Schreibvorgang, Bilanz und
     * Vorschauzeile aus EINER Filterung — wie im Bestand, wo `row.changes` und `patch` aus
     * demselben `filterEditableFields` kommen (`apply-commit.ts:53-57`). Die Grenze ist
     * `IMPORTIERBARE_FELDER` (`_lib/csv/kopfzeilen.ts:32-52`, 1:1 aus
     * `auto-map-headers.ts:2-22`: „no system/identity-internal fields").
     *
     * ⛔ `updateNote` STEHT MIT IN DER ZUORDNUNG, UND DAS IST DIE ZWEITE HAELFTE DES FUNDES:
     * die Spalte ist SCHREIBBAR (sie gehoert keinem Server), aber NICHT IMPORTIERBAR — sie ist
     * append-only und hat einen eigenen Schreibpfad ueber `haengeNotizAn`
     * (`_db/schema.ts:56-59`, `_lib/notiz.ts`). Ein Feldschnitt entlang `SCHREIBBARE_FELDER`
     * liesse sie durch, und ein Import ueberschriebe die gezeichnete Auditspur eines Geraets
     * mit rohem CSV-Text. ⛔ NUR DIE ENGERE GRENZE FAENGT DAS.
     */
    const ergebnis = await importSchreibenAction(
      {
        issi: 0,
        id: 1,
        rufname: 2,
        updateNote: 3,
      } as unknown as Parameters<typeof importSchreibenAction>[0],
      [["1000002", "g-fremdbestimmt", "Frisch", "gefaelschte Auditspur"]],
    );

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.zusammenfassung.created).toBe(1);
    const zeile = geraeteZeilen()[0];
    expect(zeile.id).not.toBe("g-fremdbestimmt");
    expect(zeile.rufname).toBe("Frisch");
    expect(zeile.updateNote, "die append-only Auditspur kam aus der CSV").toBeNull();
    expect(ereignisse().map((z) => z.field).sort()).toEqual(["rufname"]);
    expect(ergebnis.zeilen[0].aenderungen.map((a) => a.feld).sort()).toEqual(["rufname"]);
  });

  it("schneidet ein NICHT IMPORTIERBARES Feld schon aus der Zuordnung — Aenderung", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F4, Fall (b), und er ist der teurere: `zuSetzen[feld] = erlaubt[feld]
     * ?? null` machte aus dem weggeschnittenen `id` ein EXPLIZITES `NULL` im `UPDATE` — die
     * `NOT NULL`-Verletzung riss den GANZEN Stapel mit, und der Import meldete
     * „Import fehlgeschlagen", obwohl an den Daten nichts falsch war.
     */
    geraet({
      id: "g-1",
      issi: "1000001",
      rufname: "Alt",
      updateNote: "[2026-01-01 · Alt] frueher",
    });

    const ergebnis = await importSchreibenAction(
      {
        issi: 0,
        id: 1,
        rufname: 2,
        updateNote: 3,
      } as unknown as Parameters<typeof importSchreibenAction>[0],
      [["1000001", "g-fremdbestimmt", "Neu", "gefaelschte Auditspur"]],
    );

    expect(ergebnis.ok, "der ganze Stapel fiel wegen eines weggeschnittenen Feldes").toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.zusammenfassung.updated).toBe(1);
    const zeile = geraeteZeilen()[0];
    expect(zeile.id).toBe("g-1");
    expect(zeile.rufname).toBe("Neu");
    // ⛔ DIE APPEND-ONLY SPALTE BLEIBT WOERTLICH STEHEN — ein Import schreibt sie nie.
    expect(zeile.updateNote).toBe("[2026-01-01 · Alt] frueher");
    expect(ereignisse().map((z) => z.field)).toEqual(["rufname"]);
  });

  it("meldet einen VOLLSTAENDIG geschriebenen Import nicht als fehlgeschlagen", async () => {
    /*
     * ⛔ REVIEW-V10 FUND F13, ein Formunterschied mit Wirkung: in `geraetAnlegenAction` und
     * `geraetAendernAction` stehen `revalidatePath` und der Erfolgsfall AUSSERHALB des
     * `try`, hier standen sie darin. Wirft die Entwertung, bekam der Bedienende
     * „Import fehlgeschlagen" fuer Zeilen, die in der Datenbank stehen — und fuhr den Import
     * ein zweites Mal.
     *
     * ⛔ WAS DIE HAUSFORM STATTDESSEN TUT, IST DER WURF: er kommt beim Aufrufer als Stoerung
     * an, nicht als fachliche Ablehnung, und ist damit von einem echten Fehlschlag
     * unterscheidbar. ⚠️ DIESER FALL ZUSICHERT DESHALB NICHT „ok: true", SONDERN DASS DER
     * FALSCHE SATZ NICHT FAELLT — eine Zusage „ok: true" haette die Bauform gar nicht halten
     * koennen, und der billige Weg dorthin waere ein `catch` gewesen, das die Stoerung
     * verschluckt.
     */
    entwertungWirftAuf = "/m/radio/admin/versionen";

    await expect(
      importSchreibenAction({ issi: 0, rufname: 1 }, [["1000002", "Frisch"]]),
    ).rejects.toThrow("revalidatePath ausserhalb einer Anfrage");

    expect(geraeteZeilen(), "die Zeile war geschrieben").toHaveLength(1);
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
