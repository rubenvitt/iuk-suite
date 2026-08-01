// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToReadableStream } from "react-dom/server";
import type { ReactElement } from "react";

/**
 * DIE ABLAGE-KACHEL UND IHR AUSLOESER (Spec §7.6, §4.8; Plan T46, Punkte 5 und 6).
 *
 * WARUM DIE ACTION HIER MITGEPRUEFT WIRD und nicht in einer eigenen Datei: T46
 * besitzt vier neue Dateien, und `(verwaltung)/ablage-actions.test.ts` ist keine
 * davon. Die Zusammengehoerigkeit ist ohnehin die richtige: die Kachel ist der
 * EINZIGE Einstiegspunkt der Action (`docs/design/README.md` — „hat jede Action
 * einen Weg in der Oberflaeche?"), und beide Haelften derselben Zusage in einer
 * Datei zu pruefen haelt sie zusammen.
 *
 * GEGEN EINE ECHTE, MIGRIERTE DATENBANK UND EINE ECHTE ABLAGE: die Zahlen der
 * Kachel kommen aus SQL-Aggregaten und aus dem Dateisystem. Gegen ein Mock waere
 * jede davon gruen, ohne zu gelten.
 *
 * DER RENDERWEG ist `renderToReadableStream` bis `allReady` — dieselbe Form wie
 * in `SharesUebersicht.test.tsx`: die Kachel ist eine asynchrone Server
 * Component, ein synchroner Renderer kaeme nur bis zum `Suspense`-Ersatz.
 */

const { requireFilesAccessMock, revalidatePathMock } = vi.hoisted(() => ({
  requireFilesAccessMock: vi.fn(async () => ({ sub: "sub-1", name: "Testperson" })),
  revalidatePathMock: vi.fn(),
}));

/* Der Riegel wird hier GESTEUERT, nicht umgangen: Punkt 6 verlangt „nur mit
   Zugang aufrufbar", und das ist nur pruefbar, wenn beide Antworten herstellbar
   sind. Der echte Riegel zoege `next-auth` in den Testlauf. */
vi.mock("../_lib/access", () => ({ requireFilesAccess: requireFilesAccessMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { AblageKachel, ladeAblageStand } from "./AblageKachel";
import { aufraeumenAction } from "../(verwaltung)/ablage-actions";

const DIR = "./.data/files-ablagekachel-test";
const ABLAGE = join(DIR, "files");

const SEK = 1000;
const TAG = 24 * 60 * 60 * SEK;

const SHARE_A = "aaaaaaaaaa";
const SHARE_B = "bbbbbbbbbb";
const DATEI_FERTIG = "cccccccccc";
const DATEI_OHNE_BYTES = "dddddddddd";
const DATEI_FEHLER = "eeeeeeeeee";
const DATEI_SCAN = "ffffffffff";
const INBOX_FERTIG = "gggggggggg";
const INBOX_OHNE_BYTES = "hhhhhhhhhh";

let ursprung: NodeJS.ProcessEnv;
let fehlerSpy: ReturnType<typeof vi.spyOn>;

function frischeDatenbank(): void {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(ABLAGE, { recursive: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(join(DIR, "files.db"));
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
}

beforeEach(() => {
  ursprung = process.env;
  process.env = { ...process.env };
  // Die Kachel darf NICHT von den `FILES_`-Zahlen abhaengen: sie steht auf der
  // Uebersicht, und `grenzen()` wirft ohne sie. Eine Kachel, die das braucht,
  // riss die ganze Seite mit — deshalb sind sie hier ABWESEND.
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("FILES_")) delete process.env[name];
  }
  requireFilesAccessMock.mockClear();
  revalidatePathMock.mockClear();
  fehlerSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  frischeDatenbank();
});

afterEach(() => {
  process.env = ursprung;
  fehlerSpy.mockRestore();
});

async function legeBestandAn(): Promise<void> {
  const { getDb } = await import("../_db/client");
  const { shares, shareFiles, inboxFiles } = await import("../_db/schema");
  const bank = getDb();
  const jetzt = new Date();

  for (const id of [SHARE_A, SHARE_B]) {
    bank
      .insert(shares)
      .values({
        id,
        title: `Freigabe ${id}`,
        type: "folder",
        expiresAt: new Date(jetzt.getTime() + 7 * TAG),
        downloadCount: 0,
        totalSize: 0,
        createdAt: jetzt,
        createdBy: "sub-1",
      })
      .run();
  }

  bank
    .insert(shareFiles)
    .values([
      {
        id: DATEI_FERTIG,
        shareId: SHARE_A,
        filename: "lage.pdf",
        mimeType: "application/pdf",
        size: 100,
        createdAt: jetzt,
        bytesVollstaendigAt: jetzt,
        avStatus: "clean",
      },
      {
        id: DATEI_OHNE_BYTES,
        shareId: SHARE_A,
        filename: "halb.bin",
        mimeType: "application/octet-stream",
        /*
         * NICHT 0, obwohl eine frisch angelegte Zeile mit `size = 0` startet
         * (§7.1 Schritt 1): eine IMPORTIERTE Zeile ohne Blob traegt ihren
         * Altwert (§4.4), und nur mit einem Wert ungleich 0 kann dieser Test
         * ueberhaupt widerlegen, dass die Belegung sie mitzaehlt.
         */
        size: 999,
        createdAt: jetzt,
        bytesVollstaendigAt: null,
        avStatus: "scanning",
      },
      {
        id: DATEI_FEHLER,
        shareId: SHARE_B,
        filename: "kaputt.bin",
        mimeType: "application/octet-stream",
        size: 50,
        createdAt: jetzt,
        bytesVollstaendigAt: jetzt,
        avStatus: "error",
      },
      {
        id: DATEI_SCAN,
        shareId: SHARE_B,
        filename: "frisch.bin",
        mimeType: "application/octet-stream",
        size: 7,
        createdAt: jetzt,
        bytesVollstaendigAt: jetzt,
        avStatus: "scanning",
      },
    ])
    .run();

  bank
    .insert(inboxFiles)
    .values([
      {
        id: INBOX_FERTIG,
        tokenId: null,
        dateiname: "abgabe.jpg",
        kategorie: null,
        hinweis: null,
        mimeType: "image/jpeg",
        size: 25,
        empfangenAt: jetzt,
        bytesVollstaendigAt: jetzt,
        avStatus: "clean",
      },
      {
        id: INBOX_OHNE_BYTES,
        tokenId: null,
        dateiname: "abbruch.jpg",
        kategorie: null,
        hinweis: null,
        mimeType: null,
        // Ebenfalls ungleich 0 — Begruendung wie oben.
        size: 111,
        empfangenAt: jetzt,
        bytesVollstaendigAt: null,
        avStatus: "scanning",
      },
    ])
    .run();

  mkdirSync(join(ABLAGE, SHARE_A), { recursive: true });
  mkdirSync(join(ABLAGE, SHARE_B), { recursive: true });
  mkdirSync(join(ABLAGE, "inbox"), { recursive: true });
  writeFileSync(join(ABLAGE, SHARE_A, DATEI_FERTIG), "x".repeat(100));
  writeFileSync(`${join(ABLAGE, SHARE_A, DATEI_OHNE_BYTES)}.part`, "y".repeat(3));
  writeFileSync(join(ABLAGE, SHARE_B, DATEI_FEHLER), "z".repeat(50));
  writeFileSync(join(ABLAGE, "inbox", INBOX_FERTIG), "i".repeat(25));
  writeFileSync(`${join(ABLAGE, "inbox", INBOX_OHNE_BYTES)}.part`, "j".repeat(2));
}

async function legeLaufAn(vorgabe: {
  trockenlauf: boolean;
  beendet: boolean;
  sharesGeloescht?: number;
  verwaisteBlobsGemeldet?: number;
}): Promise<void> {
  const { getDb } = await import("../_db/client");
  const { aufraeumLaeufe } = await import("../_db/schema");
  const jetzt = new Date();
  getDb()
    .insert(aufraeumLaeufe)
    .values({
      gestartetAt: new Date(jetzt.getTime() - 60 * SEK),
      beendetAt: vorgabe.beendet ? jetzt : null,
      trockenlauf: vorgabe.trockenlauf,
      sharesGeloescht: vorgabe.sharesGeloescht ?? 0,
      verwaisteBlobsGemeldet: vorgabe.verwaisteBlobsGemeldet ?? 0,
    })
    .run();
}

/** Das fertige Markup der Kachel — asynchrone Server Component, bis `allReady`. */
async function markup(): Promise<string> {
  const baum = (await AblageKachel()) as ReactElement;
  const strom = await renderToReadableStream(baum);
  await strom.allReady;
  return new Response(strom).text();
}

/** Der Textinhalt eines `data-testid` im gerenderten Markup. */
function textVon(html: string, testid: string): string {
  document.body.innerHTML = html;
  const el = document.body.querySelector(`[data-testid="${testid}"]`);
  if (el === null) throw new Error(`Nicht im Markup: ${testid}`);
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function zaehle(tabelle: "shares" | "share_files" | "aufraeum_laeufe"): number {
  const sqlite = new Database(join(DIR, "files.db"), { readonly: true });
  try {
    return (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${tabelle}`).get() as { n: number }).n;
  } finally {
    sqlite.close();
  }
}

function laeufe(): Record<string, number | string | null>[] {
  const sqlite = new Database(join(DIR, "files.db"), { readonly: true });
  try {
    return sqlite.prepare("SELECT * FROM aufraeum_laeufe ORDER BY id").all() as Record<
      string,
      number | string | null
    >[];
  } finally {
    sqlite.close();
  }
}

describe("ladeAblageStand", () => {
  it("zaehlt Zeilen ohne Bytes, laufende Pruefungen, AV-Fehler und `.part`-Reste", async () => {
    await legeBestandAn();
    const stand = await ladeAblageStand();

    // Vier verschiedene Zahlen — gleiche Werte liessen eine Vertauschung durch.
    expect(stand.zeilenOhneBytes).toBe(2);
    expect(stand.avScanning).toBe(3);
    expect(stand.avFehler).toBe(1);
    expect(stand.partReste).toBe(2);
    // NUR die vollstaendigen Zeilen: eine Zeile ohne Bytes traegt `size = 0`,
    // eine importierte ohne Blob ihren Altwert — mitgezaehlt waere die Belegung
    // eine Behauptung ueber Bytes, die es nicht gibt.
    expect(stand.belegteBytesLautDatenbank).toBe(100 + 50 + 7 + 25);
  });

  it("nennt den freien Platz des Volumes — die Zahl, die kein SQL kennt", async () => {
    await legeBestandAn();
    const stand = await ladeAblageStand();
    expect(stand.freieBytesAufVolume).not.toBeNull();
    // Der freie Platz einer Entwicklungsmaschine ist um Groessenordnungen mehr
    // als die 182 Byte der Vorrichtung: eine verwechselte Quelle faellt hier auf.
    expect(stand.freieBytesAufVolume!).toBeGreaterThan(1024 * 1024);
  });

  it("meldet den freien Platz als unbekannt, statt zu werfen, wenn es die Ablage noch nicht gibt", async () => {
    // Vor dem ersten Upload existiert `<DATA_DIR>/files` nicht. Ein Wurf hier
    // riss die ganze Uebersicht mit — es gibt keine `error.tsx` darueber.
    rmSync(ABLAGE, { recursive: true, force: true });
    const stand = await ladeAblageStand();
    expect(stand.freieBytesAufVolume).toBeNull();
    expect(stand.partReste).toBe(0);
  });

  it("liest den letzten Lauf, nicht den ersten", async () => {
    await legeLaufAn({ trockenlauf: true, beendet: true, sharesGeloescht: 9 });
    await legeLaufAn({ trockenlauf: false, beendet: true, sharesGeloescht: 4 });
    const stand = await ladeAblageStand();
    expect(stand.letzterLauf?.sharesGeloescht).toBe(4);
    expect(stand.letzterLauf?.trockenlauf).toBe(false);
  });
});

describe("Die Ablage-Kachel", () => {
  it("zeigt die vier Zaehlungen, die Belegung und den freien Platz", async () => {
    await legeBestandAn();
    const html = await markup();

    expect(textVon(html, "files-ablage-zeilen-ohne-bytes")).toContain("2");
    expect(textVon(html, "files-ablage-scanning")).toContain("3");
    expect(textVon(html, "files-ablage-fehler")).toContain("1");
    expect(textVon(html, "files-ablage-parts")).toContain("2");
    expect(textVon(html, "files-ablage-belegt")).toContain("182 Byte");
    expect(textVon(html, "files-ablage-frei")).not.toContain("unbekannt");
  });

  it("bietet BEIDE Knoepfe an — die Vorschau vor dem echten Lauf", async () => {
    const html = await markup();
    document.body.innerHTML = html;

    const vorschau = document.body.querySelector<HTMLButtonElement>(
      'button[name="modus"][value="vorschau"]',
    );
    const echt = document.body.querySelector<HTMLButtonElement>(
      'button[name="modus"][value="echt"]',
    );
    expect(vorschau).not.toBeNull();
    expect(echt).not.toBeNull();
    // Beide gehoeren in DASSELBE Formular: zwei Formulare koennten
    // auseinanderlaufen, und der Trockenlauf waere dann nicht mehr die Vorschau
    // desselben Auslosers.
    expect(vorschau!.closest("form")).toBe(echt!.closest("form"));
    expect(document.body.querySelectorAll("form")).toHaveLength(1);
  });

  it("nennt den letzten Lauf samt Trockenlauf-Kennzeichnung", async () => {
    await legeLaufAn({
      trockenlauf: true,
      beendet: true,
      sharesGeloescht: 4,
      verwaisteBlobsGemeldet: 2,
    });
    const text = textVon(await markup(), "files-ablage-letzter-lauf");
    expect(text).toContain("Trockenlauf");
    expect(text).toContain("4");
    expect(text).toContain("2");
  });

  it("sagt es, wenn ein Lauf ohne `beendet_at` dasteht — daran ist ein Absturz erkennbar", async () => {
    await legeLaufAn({ trockenlauf: false, beendet: false });
    const text = textVon(await markup(), "files-ablage-letzter-lauf");
    expect(text).toContain("abgebrochen");
  });

  it("hat einen Leerzustand, solange kein Lauf protokolliert ist", async () => {
    const text = textVon(await markup(), "files-ablage-letzter-lauf");
    expect(text).toContain("Noch kein Lauf");
  });

  it("wird zum benannten Fehlerzustand, statt die Uebersicht mitzureissen", async () => {
    // Eine Datenbank ohne Tabellen — dasselbe Bild wie ein Lesefehler.
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    new Database(join(DIR, "files.db")).close();
    delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

    const html = await markup();
    expect(html).toContain("files-ablage-fehlerzustand");
    // `type="warning"`, nicht `type="error"`: `colorError === colorPrimary`, ein
    // roter Kasten auf einer Datenflaeche saehe aus wie eine Primaeraktion.
    expect(html).not.toContain("ant-alert-error");
    expect(fehlerSpy).toHaveBeenCalled();
  });
});

describe("aufraeumenAction", () => {
  it("ist ohne Zugang nicht aufrufbar — und schreibt dann auch nichts", async () => {
    requireFilesAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    const daten = new FormData();
    daten.set("modus", "echt");

    await expect(aufraeumenAction(daten)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(zaehle("aufraeum_laeufe")).toBe(0);
  });

  it("laeuft als Vorschau: dieselbe Rechnung, keine geloeschte Zeile", async () => {
    process.env.FILES_MAX_DATEI_BYTES = "524288000";
    process.env.FILES_AV_MAX_BYTES = "524288000";
    process.env.FILES_MAX_ABLAUF_TAGE = "7";
    await legeBestandAn();
    const daten = new FormData();
    daten.set("modus", "vorschau");

    await aufraeumenAction(daten);

    expect(laeufe()).toHaveLength(1);
    expect(laeufe()[0].trockenlauf).toBe(1);
    expect(zaehle("shares")).toBe(2);
    expect(zaehle("share_files")).toBe(4);
    expect(existsSync(join(ABLAGE, SHARE_A, DATEI_FERTIG))).toBe(true);
    // Ohne dieses `revalidatePath` zeigte die Kachel bis zur naechsten
    // Navigation die Zahlen von VOR dem Lauf — die Vorschau waere unsichtbar.
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("nimmt einen fehlenden oder unbekannten Modus als VORSCHAU", async () => {
    /*
     * Die sichere Richtung. Ein leeres oder verdrehtes Feld darf nie in einem
     * Loeschlauf enden: der erste Lauf nach dem Cutover ist ein Loeschereignis
     * (§7.6), und ein Formularfehler ist ein schlechter Ausloeser dafuer.
     */
    process.env.FILES_MAX_DATEI_BYTES = "524288000";
    process.env.FILES_AV_MAX_BYTES = "524288000";
    process.env.FILES_MAX_ABLAUF_TAGE = "7";

    await aufraeumenAction(new FormData());
    const daten = new FormData();
    daten.set("modus", "ECHT!!");
    await aufraeumenAction(daten);

    expect(laeufe().map((z) => z.trockenlauf)).toEqual([1, 1]);
  });

  it("loescht mit dem echten Lauf tatsaechlich", async () => {
    process.env.FILES_MAX_DATEI_BYTES = "524288000";
    process.env.FILES_AV_MAX_BYTES = "524288000";
    process.env.FILES_MAX_ABLAUF_TAGE = "7";
    process.env.FILES_LOESCH_KARENZ_STUNDEN = "0";
    await legeBestandAn();
    // Eine abgelaufene Freigabe, damit der echte Lauf ueberhaupt etwas zu tun hat.
    const { getDb } = await import("../_db/client");
    const { shares } = await import("../_db/schema");
    const { eq } = await import("drizzle-orm");
    getDb()
      .update(shares)
      .set({ expiresAt: new Date(Date.now() - 5 * TAG) })
      .where(eq(shares.id, SHARE_A))
      .run();

    const daten = new FormData();
    daten.set("modus", "echt");
    await aufraeumenAction(daten);

    expect(laeufe()[0].trockenlauf).toBe(0);
    expect(zaehle("shares")).toBe(1);
    expect(existsSync(join(ABLAGE, SHARE_A))).toBe(false);
  });
});
