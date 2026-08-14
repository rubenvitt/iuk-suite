import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestDb } from "../../../../_db/testdb";
import { migrierteTestDb } from "../../../../_db/testdb";
import { aufgaben, dateien, nachweise, personen } from "../../../../_db/schema";

/**
 * `POST /a/<id>/nachweis/hochladen` — DER UPLOAD, SEIT FIX-RUNDE 1 EIN ROUTE HANDLER (vorher
 * `nachweisHochladenAction`, `actions.ts` — s. `route.ts`s Kopfkommentar fuer das Warum). ECHTES
 * DATEISYSTEM (`DATA_DIR` auf ein `mkdtemp`-Verzeichnis, dieselbe Wahl wie zuvor in
 * `actions.test.ts`), ECHTE In-Memory-DB — nur `@/core/auth` ist ein Spion, wie ueberall im Modul.
 *
 * `starteAufgabenScanArbeiter` bleibt UNGESTUBT und wird ueber sein SICHTBARES ERGEBNIS geprueft
 * (`scanStatus` bleibt `offen`, kein Wurf) statt ueber einen Interaktions-Mock: ein echter
 * Netzwerkversuch gegen "clamav" schlaegt lokal fehl, aber `starteAufgabenScanArbeiter`s eigener
 * Vertrag (`_lib/scan.ts`) ist "synchron, wirft nie" — der fehlgeschlagene Scan-Versuch selbst
 * laeuft als unbeobachtete Promise weiter und darf diesen Test nicht beruehren.
 */

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let t: TestDb;
vi.mock("../../../../_db/client", () => ({ getDb: () => t.db }));

import { POST } from "./route";

let datenVerzeichnis: string;
let vorherigesDataDir: string | undefined;

beforeEach(() => {
  t = migrierteTestDb();
  sitzung = null;
  revalidatePathMock.mockClear();
  datenVerzeichnis = mkdtempSync(join(tmpdir(), "aufgaben-nachweis-upload-"));
  vorherigesDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = datenVerzeichnis;
});
afterEach(() => {
  t.schliessen();
  if (vorherigesDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = vorherigesDataDir;
  rmSync(datenVerzeichnis, { recursive: true, force: true });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function legePerson(sub: string, rolle: "koordination" | "auftrag" | "bufdi") {
  return t.db
    .insert(personen)
    .values({ sub, name: sub, initialen: "XX", rolle, aktivVon: "2026-01-01" })
    .returning()
    .get();
}

function legeAufgabe(over: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "in_arbeit",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      nachweisArt: "bild",
      ...over,
    })
    .returning()
    .get();
}

function anmelden(person: { sub: string }): void {
  sitzung = { user: { id: person.sub } };
}

function bildDatei(name = "beweisfoto.png"): File {
  return new File([PNG], name, { type: "image/png" });
}

function form(over: Record<string, string> = {}, datei?: File): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  if (datei) f.set("datei", datei);
  return f;
}

/**
 * Ein echtes `Request` mit `multipart/form-data`-Rumpf: `formData()` verlangt einen Rumpf, den der
 * Browser/`undici` selbst kodiert hat, ein einfaches `new Request(url, {body: formData})` traegt
 * `fetch`s eigene Kodierung bereits (Node/undici setzt `content-type` samt Grenze automatisch).
 */
function anfrage(daten: FormData, headers: HeadersInit = {}): Request {
  return new Request("http://aufgaben.localtest.me/a/x/nachweis/hochladen", {
    method: "POST",
    body: daten,
    headers,
  });
}

async function ruf(id: string, daten: FormData, headers: HeadersInit = {}): Promise<Response> {
  return POST(anfrage(daten, headers), { params: Promise.resolve({ id }) });
}

describe("POST /a/<id>/nachweis/hochladen — Zugriffsriegel, alles IN der Route (Falle 55)", () => {
  it("keine Sitzung → 404, kein JSON-Rumpf", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "text" });
    sitzung = null;

    const antwort = await ruf(task.id, form({ text: "Erledigt." }));
    expect(antwort.status).toBe(404);
    expect(t.db.select().from(nachweise).all()).toHaveLength(0);
  });

  it("unbekannte Aufgaben-Id → 404", async () => {
    const bufdi = legePerson("dev:alina@test", "bufdi");
    anmelden(bufdi);
    const antwort = await ruf("unbekannt", form({ text: "Erledigt." }));
    expect(antwort.status).toBe(404);
  });

  it("eine ANDERE Person als die zugewiesene → 404, nichts geschrieben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const andere = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "bild" });
    anmelden(andere);

    const antwort = await ruf(task.id, form({}, bildDatei()));
    expect(antwort.status).toBe(404);
    expect(t.db.select().from(nachweise).all()).toHaveLength(0);
    expect(t.db.select().from(dateien).all()).toHaveLength(0);
  });

  it("ein Zustand ausserhalb 'in_arbeit' → 404, auch fuer die zugewiesene Person", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "verteilt", nachweisArt: "bild" });
    anmelden(bufdi);

    const antwort = await ruf(task.id, form({}, bildDatei()));
    expect(antwort.status).toBe(404);
  });
});

describe("POST /a/<id>/nachweis/hochladen — legt Datei UND/ODER Nachweis an", () => {
  it("nachweisArt bild: legt Datei UND Nachweis an, scanStatus startet 'offen'", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "bild" });
    anmelden(bufdi);

    const antwort = await ruf(task.id, form({}, bildDatei()));
    expect(antwort.status).toBe(200);
    expect(await antwort.json()).toEqual({ ok: true });

    const zeilen = t.db.select().from(nachweise).all();
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.art).toBe("bild");
    expect(zeilen[0]!.dateiId).not.toBeNull();

    const dateiZeilen = t.db.select().from(dateien).all();
    expect(dateiZeilen).toHaveLength(1);
    expect(dateiZeilen[0]!.scanStatus).toBe("offen");
    expect(dateiZeilen[0]!.id).toBe(zeilen[0]!.dateiId);

    expect(revalidatePathMock).toHaveBeenCalledWith("/m/aufgaben", "layout");
  });

  it("nachweisArt bild OHNE Datei: 400 mit Feldfehler `datei`, nichts wird geschrieben", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "bild" });
    anmelden(bufdi);

    const antwort = await ruf(task.id, form());
    expect(antwort.status).toBe(400);
    const koerper = (await antwort.json()) as { ok: false; fieldErrors: Record<string, string> };
    expect(koerper.ok).toBe(false);
    expect(koerper.fieldErrors.datei).toBeTruthy();
    expect(t.db.select().from(nachweise).all()).toHaveLength(0);
    expect(t.db.select().from(dateien).all()).toHaveLength(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("nachweisArt bild MIT Datei UND Text: beides landet auf derselben Zeile", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "bild" });
    anmelden(bufdi);

    await ruf(task.id, form({ text: "Zusatzbemerkung." }, bildDatei()));
    const zeile = t.db.select().from(nachweise).all()[0]!;
    expect(zeile.art).toBe("bild");
    expect(zeile.text).toBe("Zusatzbemerkung.");
    expect(zeile.dateiId).not.toBeNull();
  });

  it("nachweisArt text OHNE Text: 400 mit Feldfehler `text`, eine mitgeschickte Datei aendert daran nichts", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "text" });
    anmelden(bufdi);

    const antwort = await ruf(task.id, form({}, bildDatei()));
    expect(antwort.status).toBe(400);
    const koerper = (await antwort.json()) as { ok: false; fieldErrors: Record<string, string> };
    expect(koerper.fieldErrors.text).toBeTruthy();
  });

  it("nachweisArt text MIT Text: legt einen Textnachweis an, kein Dateizugriff", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "text" });
    anmelden(bufdi);

    const antwort = await ruf(task.id, form({ text: "Erledigt." }));
    expect(antwort.status).toBe(200);
    const zeile = t.db.select().from(nachweise).all()[0]!;
    expect(zeile.art).toBe("text");
    expect(zeile.dateiId).toBeNull();
    expect(t.db.select().from(dateien).all()).toHaveLength(0);
  });

  it("eine ungueltige Datei (falsches Format) wird VOR jedem Insert abgelehnt — kein verwaister Datensatz", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "bild" });
    anmelden(bufdi);

    const keinBild = new File([new Uint8Array([1, 2, 3, 4])], "nicht-bild.txt", { type: "text/plain" });
    const antwort = await ruf(task.id, form({}, keinBild));
    expect(antwort.status).toBe(400);
    const koerper = (await antwort.json()) as { ok: false; fieldErrors: Record<string, string> };
    expect(koerper.fieldErrors.datei).toBeTruthy();
    expect(t.db.select().from(nachweise).all()).toHaveLength(0);
    expect(t.db.select().from(dateien).all()).toHaveLength(0);
  });
});

/**
 * DER FRUEHE `content-length`-RIEGEL (Kopfkommentar `route.ts`) — KEIN zweiter Grenzwert, nur ein
 * frueher Verzicht auf das Puffern einer Anfrage, die `legeNachweisAb` ohnehin ablehnen wuerde.
 * Ohne den Server-Action-Deckel (der mit dieser Aufgabe entfaellt) ist dies die einzige Bremse
 * VOR dem vollstaendigen Einlesen des Rumpfs.
 */
describe("POST /a/<id>/nachweis/hochladen — der fruehe content-length-Riegel", () => {
  it("eine Anfrage mit einem `content-length` weit ueber NACHWEIS_MAX_BYTES wird abgelehnt, OHNE den Rumpf zu lesen", async () => {
    const auftrag = legePerson("dev:malte@test", "auftrag");
    const bufdi = legePerson("dev:alina@test", "bufdi");
    const task = legeAufgabe({ erstellerId: auftrag.id, prueferId: auftrag.id, zugewiesenAn: bufdi.id, status: "in_arbeit", nachweisArt: "bild" });
    anmelden(bufdi);

    const antwort = await ruf(task.id, form({}, bildDatei()), {
      "content-length": String(100 * 1024 * 1024),
    });
    expect(antwort.status).toBe(413);
    const koerper = (await antwort.json()) as { ok: false; fieldErrors: Record<string, string> };
    expect(koerper.fieldErrors.datei).toBeTruthy();
    expect(t.db.select().from(dateien).all()).toHaveLength(0);
  });
});
