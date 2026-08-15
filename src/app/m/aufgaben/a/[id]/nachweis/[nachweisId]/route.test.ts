import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import type { TestDb } from "../../../../_db/testdb";
import { migrierteTestDb } from "../../../../_db/testdb";
import { aufgaben, dateien, nachweise, personen } from "../../../../_db/schema";
import { legeNachweisAb } from "../../../../_lib/ablage";

/**
 * `GET /a/<id>/nachweis/<nachweisId>` — DIE AUSLIEFERUNG, DER SICHERHEITSKRITISCHSTE PFAD DES
 * MODULS (Aufgabe 19). ECHTES DATEISYSTEM (`DATA_DIR` auf ein `mkdtemp`-Verzeichnis, Vorbild
 * `ablage.test.ts`), ECHTE In-Memory-DB (`migrierteTestDb()`, Vorbild `zugang.test.ts`/
 * `actions.test.ts`) — nur `@/core/auth` ist ein Spion, wie ueberall im Modul.
 *
 * DIE VIER SCAN-ZUSTAENDE WERDEN ERSCHOEPFEND GEPRUEFT (Brief: „nicht stichprobenweise"): `offen`,
 * `befund`, `fehler` liefern NICHT aus; `sauber` tut es. Dazu: `darfNachweisSehen` einzeln (auch bei
 * `sauber`), der IDOR-Fall (Nachweis gehoert zu einer ANDEREN Aufgabe), der ausgelieferte MIME-Typ,
 * und ein nicht zugelassener MIME-Typ trotz `sauber` (Datenfehler-Fall).
 *
 * DREI GEGENPROBEN SIND PFLICHT (Brief) und werden HIER NICHT alle als Dauertest gefuehrt — sie
 * sind manuell durchgefuehrt und im Bericht protokolliert (Aenderung, roter Lauf, Rueckbau):
 * `scanStatus === "sauber"` durch `!== "befund"` ersetzen, die `darfNachweisSehen`-Pruefung
 * entfernen, den Scan-Join aus `fertigMeldenAction` entfernen.
 */

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

let t: TestDb;
vi.mock("../../../../_db/client", () => ({ getDb: () => t.db }));

import { GET } from "./route";

let datenVerzeichnis: string;
let vorherigesDataDir: string | undefined;

beforeEach(() => {
  t = migrierteTestDb();
  sitzung = null;
  datenVerzeichnis = mkdtempSync(join(tmpdir(), "aufgaben-nachweis-route-"));
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

/**
 * Legt eine ECHTE Datei ab (Magic Bytes PNG, ueber `legeNachweisAb`) und schreibt die passende
 * `dateien`-Zeile MIT DERSELBEN ID — `leseNachweis` (in `route.ts` aufgerufen) loest den Pfad
 * ausschliesslich ueber `datei.id` auf, DB-Zeile und Blob muessen also dieselbe ID teilen (genau die
 * Entkopplung, die `_lib/ablage.ts`s Kopfkommentar beschreibt: die eine Instanz mintet die ID VOR
 * beiden Schreibvorgaengen).
 */
async function legeDatei(
  aufgabeId: string,
  scanStatus: "offen" | "sauber" | "befund" | "fehler",
  mime = "image/png",
  dateiname = "beweisfoto.png",
) {
  const id = nanoid();
  const befund = await legeNachweisAb(id, dateiname, PNG);
  if (!befund.ok) throw new Error("Testaufbau: legeNachweisAb ist fehlgeschlagen");
  return t.db
    .insert(dateien)
    .values({ id, aufgabeId, dateiname, mime, groesse: befund.groesse, scanStatus })
    .returning()
    .get();
}

function legeNachweis(aufgabeId: string, dateiId: string | null, erstelltVon: string) {
  return t.db
    .insert(nachweise)
    .values({ aufgabeId, art: dateiId === null ? "text" : "bild", text: dateiId === null ? "T" : null, dateiId, erstelltVon })
    .returning()
    .get();
}

function anmelden(person: { sub: string }): void {
  sitzung = { user: { id: person.sub } };
}

async function ruf(id: string, nachweisId: string): Promise<Response> {
  return GET(new Request(`http://aufgaben.localtest.me/a/${id}/nachweis/${nachweisId}`), {
    params: Promise.resolve({ id, nachweisId }),
  });
}

describe("GET /a/<id>/nachweis/<nachweisId> — Bedingung 1: exakt 'sauber' liefert aus", () => {
  it.each(["offen", "befund", "fehler"] as const)("scanStatus '%s' liefert NICHT aus — 404", async (status) => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, status);
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    anmelden(ersteller);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(404);
  });

  it("scanStatus 'sauber' liefert aus — 200, mit dem gespeicherten MIME-Typ und den Bytes", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, "sauber");
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    anmelden(ersteller);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("image/png");
    expect(antwort.headers.get("x-content-type-options")).toBe("nosniff");
    expect(antwort.headers.get("cache-control")).toBe("private, no-store");
    // DER DATEINAME IM KOPF WIRD GEBAUT, NICHT UEBERNOMMEN (Abschlussreview W5): `nachweis-<id>`
    // plus die Endung aus `ENDUNG_FUER[mime]` — die Datenbankspalte `dateiname` kommt darin nicht
    // vor. Bis zum Abschlussreview gab es im ganzen Modul NULL Zusicherungen auf diesen Kopf.
    expect(antwort.headers.get("content-disposition")).toBe(
      `inline; filename="nachweis-${datei.id}.png"`,
    );
    const bytes = new Uint8Array(await antwort.arrayBuffer());
    expect(bytes).toEqual(PNG);
  });

  /**
   * DIE GEGENPROBE ZUM KOPF (Abschlussreview W5) — der Grund, warum der gebaute Name kein
   * Stilentscheid ist: `dateien.dateiname` ist der ROHE `File.name` des Uploads
   * (`hochladen/route.ts`) und wird ABSICHTLICH NIE bereinigt (`_lib/ablage.ts` schreibt
   * ausdruecklich `void dateiname`, weil der Name in den Ablagepfad nicht eingeht). Flosse er in
   * den `content-disposition`-Kopf, braeche ein `"` die Quoted-String auf und haengte eigene
   * Kopfparameter an; ein CR/LF liesse den `Response`-Konstruktor werfen — ein unbehandelter 500
   * auf dem sicherheitskritischsten Pfad des Moduls.
   *
   * DIE MUTATION, DIE OHNE DIESEN FALL GRUEN BLIEBE:
   *   `inline; filename="${datei.dateiname}.${ENDUNG_FUER[datei.mime]}"`
   * (`ENDUNG_FUER` bliebe benutzt, also auch kein Lint-Befund).
   */
  it("ein feindseliger dateiname taucht im content-disposition NICHT auf", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, "sauber", "image/png", 'a"b.png');
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    anmelden(ersteller);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(200);
    // Der gespeicherte Name steht wirklich so in der Datenbank — der Kopf traegt ihn trotzdem nicht.
    expect(datei.dateiname).toBe('a"b.png');
    const kopf = antwort.headers.get("content-disposition")!;
    expect(kopf).not.toContain('a"b');
    expect(kopf).toBe(`inline; filename="nachweis-${datei.id}.png"`);
  });
});

describe("GET /a/<id>/nachweis/<nachweisId> — Bedingung 2: darfNachweisSehen", () => {
  it("eine Person OHNE darfNachweisSehen bekommt die Datei nicht — auch wenn sie 'sauber' ist", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const fremd = legePerson("dev:bendix@test", "bufdi");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, "sauber");
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    // `fremd` ist weder Ersteller, Zugewiesene, Pruefer, noch Koordination — `darfNachweisSehen`
    // ist fuer sie false, unabhaengig vom Scan-Status.
    anmelden(fremd);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(404);
  });

  it("die Koordination sieht den Nachweis (darfNachweisSehen: rolle === koordination)", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const koordination = legePerson("dev:rike@test", "koordination");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, "sauber");
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    anmelden(koordination);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(200);
  });
});

describe("GET /a/<id>/nachweis/<nachweisId> — der IDOR ueber zwei Ecken", () => {
  it("ein Nachweis, der zu einer ANDEREN Aufgabe gehoert, wird nicht ausgeliefert", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    // BEIDE Aufgaben sind fuer `ersteller` sichtbar (er ist Ersteller/Zugewiesener beider) — nur
    // die ZUGEHOERIGKEIT unterscheidet, nicht das Sichtrecht. Waere `darfNachweisSehen` fuer die
    // ZWEITE Aufgabe false, bewiese ein 404 die Sicht-Bedingung, nicht die Zugehoerigkeit.
    const aufgabeA = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true, titel: "A" });
    const aufgabeB = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true, titel: "B" });
    const datei = await legeDatei(aufgabeB.id, "sauber");
    const nachweisAufB = legeNachweis(aufgabeB.id, datei.id, ersteller.id);
    anmelden(ersteller);

    // `/a/<A>/nachweis/<nachweisAufB>` — der Nachweis existiert, gehoert aber zu B, nicht zu A.
    const antwort = await ruf(aufgabeA.id, nachweisAufB.id);
    expect(antwort.status).toBe(404);

    // GEGENPROBE: derselbe Nachweis unter der RICHTIGEN Aufgabe liefert aus.
    const richtig = await ruf(aufgabeB.id, nachweisAufB.id);
    expect(richtig.status).toBe(200);
  });
});

describe("GET /a/<id>/nachweis/<nachweisId> — sonstige Ablehnungen", () => {
  it("keine Sitzung → 404", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, "sauber");
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    sitzung = null;

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(404);
  });

  it("unbekannte Aufgaben-Id → 404", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    anmelden(ersteller);
    const antwort = await ruf("unbekannt", "auch-unbekannt");
    expect(antwort.status).toBe(404);
  });

  it("ein Text-Nachweis (kein dateiId) → 404, kein Wurf", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const nachweis = legeNachweis(task.id, null, ersteller.id);
    anmelden(ersteller);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(404);
  });

  it("ein nicht zugelassener MIME-Typ liefert trotz 'sauber' nicht aus (Datenfehler-Fall)", async () => {
    const ersteller = legePerson("dev:malte@test", "auftrag");
    const task = legeAufgabe({ erstellerId: ersteller.id, zugewiesenAn: ersteller.id, istSelbst: true });
    const datei = await legeDatei(task.id, "sauber", "text/html");
    const nachweis = legeNachweis(task.id, datei.id, ersteller.id);
    anmelden(ersteller);

    const antwort = await ruf(task.id, nachweis.id);
    expect(antwort.status).toBe(404);
  });
});
