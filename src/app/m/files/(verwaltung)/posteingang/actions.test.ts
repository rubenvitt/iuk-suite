import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/*
 * WAS DIESE DATEI BESITZT (Spec §8.6; Plan T43):
 *
 *  - `inboxLoeschenAction` entfernt die ZEILE **und** die BYTES — einzeln und
 *    ueber die Mehrfachauswahl. Das ist die fachliche Zusage, die `drop` nicht
 *    hatte, und sie ist der GRUND, warum die Sidecar-`.txt` entfallen darf
 *    (§8.6, Betreiberentscheidung E14 (a)). Ein Loeschweg, der nur die Zeile
 *    entfernt, liesse die Bytes fuer immer liegen: der Aufraeum-Lauf MELDET
 *    verwaiste Blobs, er loescht sie nicht (§7.6).
 *  - ohne Zugang wird NICHTS geloescht.
 *
 * GEGEN EINE ECHTE, MIGRIERTE DATENBANK UND GEGEN ECHTE DATEIEN, nicht gegen
 * ein Mock. „Die Bytes sind weg" ist gegen ein Mock von `_lib/storage`
 * ausschliesslich die Aussage „eine Funktion wurde gerufen" — und genau die
 * bliebe gruen, wenn `loesche` mit dem falschen Ziel gerufen wuerde (etwa
 * `art: "share"`, wo der Pfad ein anderer ist). Die Blobs entstehen deshalb
 * ueber `_lib/storage` selbst; ihr Pfadschema steht in diesem Test nirgends,
 * denn `storage.ts` ist die einzige Stelle im Modul, an der ein Pfad entsteht
 * (§5.1).
 *
 * Muster der Vorrichtung aus `(verwaltung)/zugangslinks/actions.test.ts`:
 * DATA_DIR setzen, migrieren, `globalThis.__suiteDb` verwerfen, den Code unter
 * Test DYNAMISCH importieren.
 */

const DIR = "./.data/files-posteingang-actions-test";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
/*
 * `revalidatePath` wirft ausserhalb eines Request-Scopes. Ohne diesen Mock
 * scheiterte JEDER Erfolgsfall in der letzten Zeile der Action — an einer
 * Umgebung, nicht an einer Zusage.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/core/auth";
import { revalidatePath } from "next/cache";

const authMock = vi.mocked(auth);
const revalidatePathMock = vi.mocked(revalidatePath);

/** Die Gruppe aus `core/registry.ts:88` — die einzige Stufe des Moduls (§2.4). */
const GRUPPE = "drk-files-admin";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  // Die drei Pflichtzahlen aus §9.3 — ohne sie wirft `grenzen()` schon beim
  // Modulimport, und jeder Fehlschlag saehe wie eine Ablehnung der Action aus.
  vi.stubEnv("FILES_MAX_DATEI_BYTES", "12582912");
  vi.stubEnv("FILES_AV_MAX_BYTES", "12582912");
  vi.stubEnv("FILES_MAX_ABLAUF_TAGE", "7");

  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  authMock.mockReset();
  revalidatePathMock.mockClear();
  alsBerechtigt();
});

afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

function alsBerechtigt(sub = "sub-1"): void {
  authMock.mockResolvedValue({ user: { id: sub, groups: [GRUPPE] } } as never);
}

function ohneZugang(): void {
  // Angemeldet, aber in KEINER Gruppe: das ist der `notFound()`-Zweig aus
  // `requireFilesAccess`. „Gar nicht angemeldet" waere der `redirect`-Zweig und
  // damit eine Aussage ueber eine andere Naht.
  authMock.mockResolvedValue({ user: { id: "sub-fremd", groups: [] } } as never);
}

/** Zehn Zeichen aus dem nanoid-Alphabet — kuerzere IDs koennen kein Pfad werden. */
function id(nummer: number): string {
  return `inbox${String(nummer).padStart(5, "0")}`;
}

/**
 * Eine Abgabe: Zeile PLUS Bytes. Beides, weil die Zusage beides nennt — eine
 * Vorrichtung, die nur die Zeile anlegt, koennte „die Bytes sind weg" nicht von
 * „es gab nie welche" unterscheiden.
 */
async function legeAbgabe(vorgabe: {
  id: string;
  inhalt: string;
  kategorie?: string | null;
  avStatus?: string;
}): Promise<void> {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { inboxFiles } = await import("@/app/m/files/_db/schema");
  const { schreibeStrom, abschliesse } = await import("@/app/m/files/_lib/storage");

  const bytes = Buffer.from(vorgabe.inhalt, "utf8");
  const ziel = { art: "inbox", inboxFileId: vorgabe.id } as const;
  await schreibeStrom(ziel, (async function* () { yield bytes; })(), {
    maxBytes: 1_000_000,
  });
  await abschliesse(ziel);

  getDb()
    .insert(inboxFiles)
    .values({
      id: vorgabe.id,
      tokenId: null,
      dateiname: `${vorgabe.id}.txt`,
      kategorie: vorgabe.kategorie ?? "dokumente",
      hinweis: null,
      mimeType: "text/plain",
      size: bytes.byteLength,
      clientIpUnbestaetigt: null,
      empfangenAt: new Date(),
      bytesVollstaendigAt: new Date(),
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: new Date(),
    })
    .run();
}

async function loeschen(ids: string[]) {
  const { inboxLoeschenAction } = await import(
    "@/app/m/files/(verwaltung)/posteingang/actions"
  );
  const formData = new FormData();
  for (const eintrag of ids) formData.append("ids", eintrag);
  return inboxLoeschenAction({ ok: false, feldFehler: {} }, formData);
}

/** ROH ueber better-sqlite3 gelesen — nie ueber Drizzle. */
function zeilenIds(): string[] {
  const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
  const zeilen = sqlite.prepare("SELECT id FROM inbox_files ORDER BY rowid").all() as {
    id: string;
  }[];
  sqlite.close();
  return zeilen.map((z) => z.id);
}

/** Liegen die Bytes noch? `groesse` wirft `BlobFehlt`, wenn nicht. */
async function bytesDa(inboxFileId: string): Promise<boolean> {
  const { groesse, BlobFehlt } = await import("@/app/m/files/_lib/storage");
  try {
    await groesse({ art: "inbox", inboxFileId });
    return true;
  } catch (fehler) {
    if (fehler instanceof BlobFehlt) return false;
    throw fehler;
  }
}

// ---------------------------------------------------------------------------

describe("inboxLoeschenAction — Zeile UND Bytes", () => {
  it("entfernt bei einer einzelnen Auswahl die Zeile und die Bytes", async () => {
    await legeAbgabe({ id: id(1), inhalt: "eins" });
    await legeAbgabe({ id: id(2), inhalt: "zwei" });
    expect(await bytesDa(id(1))).toBe(true);

    const ergebnis = await loeschen([id(1)]);

    expect(ergebnis.ok).toBe(true);
    expect(zeilenIds()).toEqual([id(2)]);
    // DIE ZWEITE HAELFTE DER ZUSAGE, und die teurere: ohne sie waere „geloescht"
    // nur „aus der Liste verschwunden", und die Bytes laegen fuer immer in der
    // Ablage — der Aufraeum-Lauf meldet verwaiste Blobs, er loescht sie nicht.
    expect(await bytesDa(id(1))).toBe(false);
    // Der Nachbar ist UNBERUEHRT. Ohne ihn koennte „loescht die ausgewaehlte"
    // nicht von „loescht alles" unterschieden werden.
    expect(await bytesDa(id(2))).toBe(true);
  });

  it("entfernt bei einer Mehrfachauswahl jede ausgewaehlte Zeile samt Bytes", async () => {
    await legeAbgabe({ id: id(1), inhalt: "eins" });
    await legeAbgabe({ id: id(2), inhalt: "zwei" });
    await legeAbgabe({ id: id(3), inhalt: "drei" });

    const ergebnis = await loeschen([id(1), id(3)]);

    expect(ergebnis.ok).toBe(true);
    // ZWEI von drei, nicht eine: eine Action, die nur `formData.get("ids")`
    // liest, entfernte still nur die erste — und `ok: true` saehe genauso aus.
    expect(zeilenIds()).toEqual([id(2)]);
    expect(await bytesDa(id(1))).toBe(false);
    expect(await bytesDa(id(3))).toBe(false);
    expect(await bytesDa(id(2))).toBe(true);
  });

  it("meldet Anzahl und Bytesumme der geloeschten Auswahl zurueck", async () => {
    await legeAbgabe({ id: id(1), inhalt: "1234567890" });
    await legeAbgabe({ id: id(2), inhalt: "12345" });

    const ergebnis = await loeschen([id(1), id(2)]);

    // Die Rueckmeldung traegt die Groesze, weil die Bestaetigung sie nennt
    // (§8.6) — und weil „2 Zeilen weg" ohne Byteangabe nicht sagt, was
    // freigeworden ist.
    expect(ergebnis).toEqual({ ok: true, geloescht: 2, bytes: 15 });
  });

  it("frischt die Liste auf dem INTERNEN Pfad auf", async () => {
    await legeAbgabe({ id: id(1), inhalt: "eins" });
    await loeschen([id(1)]);
    // `/m/files`, nicht der per Host geroutete Pfad: die Route-Group
    // `(verwaltung)` taucht in keinem URL-Pfad auf.
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/files", "layout");
  });

  it("lehnt eine leere Auswahl mit einem Feldfehler ab, ohne etwas zu loeschen", async () => {
    await legeAbgabe({ id: id(1), inhalt: "eins" });

    const ergebnis = await loeschen([]);

    expect(ergebnis.ok).toBe(false);
    expect(zeilenIds()).toEqual([id(1)]);
    expect(await bytesDa(id(1))).toBe(true);
  });

  it("lehnt eine unbekannte ID mit einem Feldfehler ab, ohne etwas zu loeschen", async () => {
    await legeAbgabe({ id: id(1), inhalt: "eins" });

    const ergebnis = await loeschen([id(9)]);

    expect(ergebnis.ok).toBe(false);
    expect(zeilenIds()).toEqual([id(1)]);
    expect(await bytesDa(id(1))).toBe(true);
  });
});

describe("inboxLoeschenAction — der Riegel", () => {
  it("loescht ohne Zugang NICHTS und wirft", async () => {
    await legeAbgabe({ id: id(1), inhalt: "eins" });
    ohneZugang();

    // GEWORFEN, nicht zurueckgegeben: eine gerenderte Meldung „darfst du nicht"
    // waere eine Auskunft ueber einen fremden Datenbestand (§2.4).
    await expect(loeschen([id(1)])).rejects.toThrow("NEXT_NOT_FOUND");

    expect(zeilenIds()).toEqual([id(1)]);
    expect(await bytesDa(id(1))).toBe(true);
  });

  it("ruft den Riegel VOR dem Lesen der Nutzlast — auch bei leerer Auswahl", async () => {
    ohneZugang();
    // Eine Action, die erst die Eingabe prueft und dann den Zugang, verriete
    // ueber die Fehlerform, dass sie ueberhaupt etwas gelesen hat. Der Riegel
    // steht als ERSTES (§2.4).
    await expect(loeschen([])).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
