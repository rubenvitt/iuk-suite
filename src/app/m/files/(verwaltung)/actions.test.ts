import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/*
 * Gegen eine ECHTE, migrierte Datei-DB — nicht gegen ein Mock. Zwei Zusagen
 * dieses Tasks sind gegen ein Mock gruen, ohne zu gelten:
 *
 * 1. „es entsteht KEINE Zeile" (Punkt 1, 2, 3, 4) ist nur nachweisbar, wenn es
 *    eine Tabelle gibt, in der man nachsieht;
 * 2. `expires_at` fuehrt Unix-SEKUNDEN (`mode: "timestamp"`, `schema.ts:4-13`).
 *    Ein Faktor-1000-Fehler ist gegen die eigene Leseseite PARITAETSGRUEN — die
 *    Zusicherung unten liest deshalb den ROHEN Spaltenwert an SQLite vorbei.
 *
 * Muster uebernommen aus `_db/queries.test.ts`: DATA_DIR setzen, migrieren,
 * `globalThis.__suiteDb` verwerfen (`getModuleDb` haelt die Verbindung global
 * fest und zeigte sonst auf die geloeschte Datei weiter).
 */
const DIR = "./.data/files-actions-test";

/** `auth()` ist gemockt, damit die Action ohne echten Request laeuft. */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));

/** Ausserhalb eines Next-Requests wirft `revalidatePath`. */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/*
 * `redirect` und `notFound` WERFEN hier — genau wie in Next. Ohne den Wurf liefe
 * die Action nach einer abgewiesenen Sitzung weiter und schriebe, was der Riegel
 * gerade verhindert hat; der Test saehe eine Zeile und wuesste nicht, warum.
 */
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    throw new Error(`NEXT_REDIRECT:${ziel}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

/*
 * Die Ablage bleibt ECHT — `blob()` legt hier wirkliche Bytes ab, und die
 * Verzeichnis-Zusicherungen lesen die Platte. Gesteuert wird ausschliesslich
 * EIN Fall, den es auf einem gesunden Dateisystem nicht gibt: ein `rmdir`, das
 * mit einem Betriebsfehler scheitert (nur lesbar eingehaengte Ablage, EACCES).
 * Nur so ist pruefbar, dass die Action ihn AUSHAELT und trotzdem MELDET —
 * ENOTEMPTY wirft nicht und kann diese Zusage deshalb nicht tragen.
 */
const storageSteuerung = vi.hoisted(() => ({ verzeichnisFehler: undefined as unknown }));

/*
 * `reiheAvEin` ist der EINZIGE Teil von T45, den die Datenbank nicht bezeugen
 * kann. Die echte Funktion steigt bei stehendem Arbeiter sofort wieder aus
 * (`_lib/av.ts`: `if (!arbeiterLaeuft) return`), und in diesem Lauf steht er —
 * ein ersatzloses Streichen des Aufrufs bliebe damit gruen. Der Rest von
 * `_lib/av.ts` bleibt ECHT (`importOriginal`), weil `AV_STATUS` und
 * `istFreigegeben` an anderer Stelle mitlaufen.
 */
const avSteuerung = vi.hoisted(() => ({ eingereiht: [] as unknown[] }));

vi.mock("@/app/m/files/_lib/av", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/app/m/files/_lib/av")>();
  return {
    ...echt,
    reiheAvEin: (ziel: unknown) => {
      avSteuerung.eingereiht.push(ziel);
    },
  };
});

vi.mock("@/app/m/files/_lib/storage", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/app/m/files/_lib/storage")>();
  return {
    ...echt,
    loescheShareVerzeichnis: async (shareId: string) => {
      if (storageSteuerung.verzeichnisFehler !== undefined) {
        throw storageSteuerung.verzeichnisFehler;
      }
      return echt.loescheShareVerzeichnis(shareId);
    },
  };
});

import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import {
  anlegenAction,
  avWiederholenAction,
  bearbeitenAction,
  downloadsAufstockenAction,
  shareLoeschenAction,
  type ShareFormZustand,
} from "@/app/m/files/(verwaltung)/actions";
import { getDb } from "@/app/m/files/_db/client";
import { downloadLogs, inboxFiles } from "@/app/m/files/_db/schema";
import type { AvStatus } from "@/app/m/files/_lib/av";
import { BlobFehlt, abschliesse, fortschritt, groesse, schreibeStrom } from "@/app/m/files/_lib/storage";

const authMock = vi.mocked(auth);

/** Die Gruppe aus `registry.ts:88` — `adminGroupsFor` liest sie. */
const GRUPPE = "drk-files-admin";
const SUB = "sub-4711";

/** `FILES_MAX_ABLAUF_TAGE` im Test — klein, damit die Obergrenze pruefbar ist. */
const MAX_TAGE = 7;

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;

  // Die drei Pflichtzahlen aus `_lib/grenzen.ts` (§9.3). Ohne sie wirft
  // `grenzen()` — und der Test bewiese den Startabbruch statt der Validierung.
  process.env.FILES_MAX_DATEI_BYTES = String(100 * 1024 * 1024);
  process.env.FILES_AV_MAX_BYTES = String(100 * 1024 * 1024);
  process.env.FILES_MAX_ABLAUF_TAGE = String(MAX_TAGE);
  delete process.env.FILES_MAX_DATEIEN_PRO_SHARE;

  storageSteuerung.verzeichnisFehler = undefined;
  avSteuerung.eingereiht.length = 0;

  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  authMock.mockResolvedValue({
    user: { id: SUB, groups: [GRUPPE] },
  } as unknown as Awaited<ReturnType<typeof auth>>);
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

type Felder = {
  title?: string;
  description?: string;
  expiryDays?: string;
  maxDownloads?: string;
  password?: string;
};

const GUELTIG: Felder = { title: "Übung Nord", expiryDays: "3" };

function formular(felder: Felder = GUELTIG, dateien: string[] = ["bericht.pdf"]): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) if (v !== undefined) f.set(k, v);
  for (const name of dateien) f.append("dateien", name);
  return f;
}

/** Rohe Spaltenwerte, an Drizzle vorbei — siehe Kopfkommentar, Punkt 2. */
function rohZeilen(tabelle: string): Record<string, unknown>[] {
  const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
  try {
    return sqlite.prepare(`SELECT * FROM ${tabelle}`).all() as Record<string, unknown>[];
  } finally {
    sqlite.close();
  }
}

function keineZeilen(): void {
  expect(rohZeilen("shares")).toEqual([]);
  expect(rohZeilen("share_files")).toEqual([]);
}

/** Der Feldfehler-Zweig, typsicher ausgepackt. */
function abgelehnt(ergebnis: Awaited<ReturnType<typeof anlegenAction>>) {
  if (ergebnis.ok) throw new Error("erwartet: Ablehnung, war: angenommen");
  return ergebnis;
}

function angenommen(ergebnis: Awaited<ReturnType<typeof anlegenAction>>) {
  if (!ergebnis.ok) {
    throw new Error(`erwartet: Annahme, war: ${JSON.stringify(ergebnis.feldFehler)}`);
  }
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Punkt 1 — Titel
// ---------------------------------------------------------------------------

describe("anlegenAction — Titel", () => {
  it("ein Titel aus Leerzeichen ist ein Feldfehler, und es entsteht keine Zeile", async () => {
    const ergebnis = abgelehnt(await anlegenAction(formular({ ...GUELTIG, title: "   " })));
    expect(ergebnis.feldFehler.title).toBeTruthy();
    keineZeilen();
  });

  it("der Titel wird GETRIMMT gespeichert", async () => {
    await anlegenAction(formular({ ...GUELTIG, title: "  Übung Nord  " }));
    expect(rohZeilen("shares")[0].title).toBe("Übung Nord");
  });

  it("die abgelehnte Eingabe kommt zurueck — aber NIE das Passwort", async () => {
    // Ohne `werte` verliert das Formular die Eingaben (docs/design/README.md:245).
    // Das Passwort gehoert trotzdem nicht dazu: es kaeme im RSC-Payload derselben
    // Antwort zurueck an den Browser und stuende als `defaultValue` im Markup.
    const ergebnis = abgelehnt(
      await anlegenAction(formular({ title: " ", expiryDays: "3", password: "geheim-genug-1" })),
    );
    expect(ergebnis.werte.title).toBe(" ");
    expect(JSON.stringify(ergebnis.werte)).not.toContain("geheim-genug-1");
    // Auch der SCHLUESSEL nicht: ein `werte.password = ""` truege zwar keinen
    // Klartext, setzte aber `defaultValue=""` auf das Passwortfeld und
    // ueberschriebe damit still, was der Browser dort schon eingesetzt hat.
    expect(Object.keys(ergebnis.werte)).not.toContain("password");
  });
});

// ---------------------------------------------------------------------------
// Punkt 2 — Ablauf
// ---------------------------------------------------------------------------

describe("anlegenAction — Ablauf", () => {
  const abgelehnteWerte = ["0", "-1", "1.5", String(MAX_TAGE + 1), "", "sieben", "1e1", "0x2"];

  for (const wert of abgelehnteWerte) {
    it(`expiryDays=${JSON.stringify(wert)} wird abgelehnt, ohne eine Zeile anzulegen`, async () => {
      const ergebnis = abgelehnt(await anlegenAction(formular({ ...GUELTIG, expiryDays: wert })));
      expect(ergebnis.feldFehler.expiryDays).toBeTruthy();
      keineZeilen();
    });
  }

  it("genau FILES_MAX_ABLAUF_TAGE wird ANGENOMMEN — die Grenze ist einschliesslich", async () => {
    // Die Gegenprobe zu MAX_TAGE + 1: ohne sie waere ein `>=` statt `>` gruen.
    angenommen(await anlegenAction(formular({ ...GUELTIG, expiryDays: String(MAX_TAGE) })));
    expect(rohZeilen("shares")).toHaveLength(1);
  });

  it("expires_at steht in SEKUNDEN, nicht in Millisekunden", async () => {
    // `schema.ts:4-13`: der Faktor-1000-Fehler ist paritaetsgruen und faellt in
    // keinem Test auf, der nur die eigene Leseseite befragt.
    const vorher = Math.floor(Date.now() / 1000);
    angenommen(await anlegenAction(formular({ ...GUELTIG, expiryDays: "3" })));
    const nachher = Math.floor(Date.now() / 1000);

    const roh = rohZeilen("shares")[0].expires_at as number;
    expect(roh).toBeGreaterThanOrEqual(vorher + 3 * 86400);
    expect(roh).toBeLessThanOrEqual(nachher + 3 * 86400);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 — Download-Limit
// ---------------------------------------------------------------------------

describe("anlegenAction — Download-Limit", () => {
  it("leer heisst NULL (unbegrenzt)", async () => {
    angenommen(await anlegenAction(formular({ ...GUELTIG, maxDownloads: "" })));
    expect(rohZeilen("shares")[0].max_downloads).toBeNull();
  });

  it("gar nicht gesendet heisst ebenfalls NULL", async () => {
    angenommen(await anlegenAction(formular(GUELTIG)));
    expect(rohZeilen("shares")[0].max_downloads).toBeNull();
  });

  it('"0" wird ABGELEHNT — nie „0 wird unbegrenzt"', async () => {
    // Die Alt-Zeile `maxDownloads || null` machte aus „0 Downloads" still einen
    // unbegrenzten Share (§4.1). Ein `??` allein reicht nicht: die 0 muss schon
    // an der Validierung scheitern, sonst entstuende ein sofort erschoepfter
    // Share, den niemand gewollt hat.
    const ergebnis = abgelehnt(await anlegenAction(formular({ ...GUELTIG, maxDownloads: "0" })));
    expect(ergebnis.feldFehler.maxDownloads).toBeTruthy();
    keineZeilen();
  });

  it('"3" wird als Zahl 3 gespeichert', async () => {
    angenommen(await anlegenAction(formular({ ...GUELTIG, maxDownloads: "3" })));
    expect(rohZeilen("shares")[0].max_downloads).toBe(3);
  });

  for (const wert of ["-1", "2.5", "drei"]) {
    it(`maxDownloads=${JSON.stringify(wert)} wird abgelehnt`, async () => {
      const ergebnis = abgelehnt(await anlegenAction(formular({ ...GUELTIG, maxDownloads: wert })));
      expect(ergebnis.feldFehler.maxDownloads).toBeTruthy();
      keineZeilen();
    });
  }
});

// ---------------------------------------------------------------------------
// Punkt 4 — Mengengrenze
// ---------------------------------------------------------------------------

describe("anlegenAction — Zahl der gemeldeten Dateien", () => {
  it("ohne eine einzige gemeldete Datei wird abgelehnt", async () => {
    const ergebnis = abgelehnt(await anlegenAction(formular(GUELTIG, [])));
    expect(ergebnis.feldFehler.dateien).toBeTruthy();
    keineZeilen();
  });

  it("ein leerer Dateiname wird abgelehnt", async () => {
    const ergebnis = abgelehnt(await anlegenAction(formular(GUELTIG, ["  "])));
    expect(ergebnis.feldFehler.dateien).toBeTruthy();
    keineZeilen();
  });

  it("FILES_MAX_DATEIEN_PRO_SHARE + 1 → Ablehnung, und es entsteht KEINE EINZIGE Zeile", async () => {
    // Die Ablehnung liegt VOR dem ersten INSERT: sonst waere der halb angelegte
    // Share genau der Zustand, den §4.4 vermeiden will — und der Aufraeum-Timer
    // holte ihn erst nach FILES_UPLOAD_VERFALL_STUNDEN ab.
    process.env.FILES_MAX_DATEIEN_PRO_SHARE = "3";
    const namen = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"];
    const ergebnis = abgelehnt(await anlegenAction(formular(GUELTIG, namen)));
    expect(ergebnis.feldFehler.dateien).toBeTruthy();
    keineZeilen();
  });

  it("genau FILES_MAX_DATEIEN_PRO_SHARE wird angenommen", async () => {
    process.env.FILES_MAX_DATEIEN_PRO_SHARE = "3";
    angenommen(await anlegenAction(formular(GUELTIG, ["a.pdf", "b.pdf", "c.pdf"])));
    expect(rohZeilen("share_files")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Punkt 5 — der Erfolgsfall
// ---------------------------------------------------------------------------

describe("anlegenAction — der Erfolgsfall", () => {
  it("legt die Datei-Zeilen im Zwischenzustand „Zeile ohne Bytes“ an", async () => {
    const ergebnis = angenommen(
      await anlegenAction(formular(GUELTIG, ["bericht.pdf", "lage.png"])),
    );

    const dateien = rohZeilen("share_files");
    expect(dateien).toHaveLength(2);
    for (const zeile of dateien) {
      expect(zeile.bytes_vollstaendig_at).toBeNull();
      expect(zeile.av_status).toBe("scanning");
      expect(zeile.size).toBe(0);
      expect(zeile.mime_type).toBe("application/octet-stream");
      expect(zeile.share_id).toBe(ergebnis.shareId);
      expect(zeile.av_geprueft_at).toBeNull();
    }
    expect(dateien.map((z) => z.filename)).toEqual(["bericht.pdf", "lage.png"]);
  });

  it("liefert je gemeldeter Datei fileId und Name zurueck — der Upload-Weg braucht beides", async () => {
    const ergebnis = angenommen(await anlegenAction(formular(GUELTIG, ["bericht.pdf", "lage.png"])));
    expect(ergebnis.dateien.map((d) => d.name)).toEqual(["bericht.pdf", "lage.png"]);
    const ausDerDb = rohZeilen("share_files").map((z) => z.id);
    expect(ergebnis.dateien.map((d) => d.fileId).sort()).toEqual([...ausDerDb].sort());
  });

  it("EINE gemeldete Datei ergibt type = \"file\"", async () => {
    angenommen(await anlegenAction(formular(GUELTIG, ["bericht.pdf"])));
    expect(rohZeilen("shares")[0].type).toBe("file");
  });

  it("ZWEI gemeldete Dateien ergeben type = \"folder\"", async () => {
    // Kleingeschrieben, 1:1-Pflicht (§4.2). Das Schema traegt bewusst KEINEN
    // CHECK — die setzende Seite ist diese hier, und ohne sie waere der Wert
    // nirgends belegt.
    angenommen(await anlegenAction(formular(GUELTIG, ["bericht.pdf", "lage.png"])));
    expect(rohZeilen("shares")[0].type).toBe("folder");
  });

  it("total_size startet bei 0 und download_count bei 0", async () => {
    // `total_size` ist die GEMESSENE Bytesumme (§4.2) und entsteht erst, wenn
    // Bytes geflossen sind — nicht aus der Client-Selbstauskunft wie in der
    // Alt-App.
    angenommen(await anlegenAction(formular(GUELTIG, ["a.pdf", "b.pdf"])));
    expect(rohZeilen("shares")[0].total_size).toBe(0);
    expect(rohZeilen("shares")[0].download_count).toBe(0);
  });

  it("die Beschreibung ist optional und wird zu NULL, nicht zu \"\"", async () => {
    angenommen(await anlegenAction(formular(GUELTIG)));
    expect(rohZeilen("shares")[0].description).toBeNull();
  });

  it("die Share-ID ist eine nanoid(10) ueber das 64-Zeichen-urlAlphabet", async () => {
    // 1:1-Pflicht: ein Validator /^[a-z0-9]+$/ gaebe fuer ~jeden 32. Zeichenplatz
    // ein stilles 404 auf einen gemailten Bestandslink.
    const ergebnis = angenommen(await anlegenAction(formular(GUELTIG)));
    expect(ergebnis.shareId).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(rohZeilen("shares")[0].id).toBe(ergebnis.shareId);
    expect(String(rohZeilen("share_files")[0].id)).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });

  it("ohne Passwort bleibt password_hash NULL", async () => {
    angenommen(await anlegenAction(formular(GUELTIG)));
    expect(rohZeilen("shares")[0].password_hash).toBeNull();
  });

  it("ein gesetztes Passwort wird als bcrypt $2b$12$ abgelegt, nie im Klartext", async () => {
    angenommen(await anlegenAction(formular({ ...GUELTIG, password: "richtig-langes-Wort" })));
    const hash = rohZeilen("shares")[0].password_hash as string;
    expect(hash.startsWith("$2b$12$")).toBe(true);
    expect(hash).not.toContain("richtig-langes-Wort");
  });

  it("ein zu kurzes Passwort wird abgelehnt, ohne eine Zeile anzulegen", async () => {
    const ergebnis = abgelehnt(await anlegenAction(formular({ ...GUELTIG, password: "kurz" })));
    expect(ergebnis.feldFehler.password).toBeTruthy();
    keineZeilen();
  });
});

// ---------------------------------------------------------------------------
// Punkt 6 — created_by
// ---------------------------------------------------------------------------

describe("anlegenAction — created_by", () => {
  it("traegt den OIDC-sub der Sitzung", async () => {
    angenommen(await anlegenAction(formular(GUELTIG)));
    expect(rohZeilen("shares")[0].created_by).toBe(SUB);
  });

  it("eine Sitzung OHNE sub kommt gar nicht bis zum INSERT", async () => {
    // Statt eines `?? \"unbekannt\"`-Rueckfalls: `viewerAusSession` liefert ohne
    // `user.id` keinen Viewer, und `requireFilesAccess` schickt in die Anmeldung.
    // Ein Rueckfall waere unerreichbarer Code, der aussaehe wie ein Riegel.
    authMock.mockResolvedValue({ user: { groups: [GRUPPE] } } as unknown as Awaited<
      ReturnType<typeof auth>
    >);
    await expect(anlegenAction(formular(GUELTIG))).rejects.toThrow(/NEXT_REDIRECT/);
    keineZeilen();
  });
});

// ---------------------------------------------------------------------------
// Der Riegel — jede Action ruft ihn selbst
// ---------------------------------------------------------------------------

describe("anlegenAction — der Zugriffsriegel", () => {
  it("ohne Sitzung fuehrt sie in die Anmeldung und schreibt nichts", async () => {
    authMock.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(anlegenAction(formular(GUELTIG))).rejects.toThrow(/NEXT_REDIRECT/);
    keineZeilen();
  });

  it("mit Sitzung ohne Gruppe antwortet sie wie eine unbekannte Route und schreibt nichts", async () => {
    // `notFound()`, nicht 403: die Existenz der Route wird nicht verraten
    // (`docs/design/README.md:239-242`).
    authMock.mockResolvedValue({
      user: { id: SUB, groups: ["irgendeine-andere-gruppe"] },
    } as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(anlegenAction(formular(GUELTIG))).rejects.toThrow("NEXT_NOT_FOUND");
    keineZeilen();
  });

  it("der Riegel steht VOR der Validierung — eine unbrauchbare Eingabe wird nicht kommentiert", async () => {
    // Sonst verriete die Feldfehler-Antwort einer nicht berechtigten Person,
    // dass es die Action gibt und welche Felder sie kennt.
    authMock.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);
    await expect(anlegenAction(formular({ title: "  " }, []))).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

// ===========================================================================
// T37 — bearbeiten, Downloads aufstocken, loeschen
// ===========================================================================

/**
 * Der Startwert, den `useActionState` in `_vorher` reicht. Die drei Actions
 * lesen ihn nicht; er steht hier, damit der Aufruf im Test dieselbe Form hat
 * wie in der Oberflaeche.
 */
const LEER: ShareFormZustand = { ok: false, feldFehler: {}, werte: {} };

/** Eine FormData aus reinen Textfeldern — die Nutzlast der drei Actions. */
function fd(werte: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

async function legeAn(felder: Felder = GUELTIG, dateien: string[] = ["bericht.pdf"]) {
  return angenommen(await anlegenAction(formular(felder, dateien)));
}

function shareZeile(id: string): Record<string, unknown> {
  const zeile = rohZeilen("shares").find((z) => z.id === id);
  if (zeile === undefined) throw new Error(`Share ${id} nicht in der Datenbank`);
  return zeile;
}

/**
 * Eine Zeile ohne die genannten Spalten.
 *
 * WARUM DER VERGLEICH SO LAEUFT und nicht als Reihe von Einzelzusicherungen:
 * die Zusage lautet „NUR das Genannte hat sich geaendert". Eine Liste gepruefter
 * Spalten waere fuer jede Spalte gruen, an die beim Schreiben des Tests niemand
 * gedacht hat — und genau so entstand der Alt-Defekt (`updateShare` schrieb
 * `expires_at` bedingungslos mit).
 */
function ohne(zeile: Record<string, unknown>, ...spalten: string[]): Record<string, unknown> {
  const kopie = { ...zeile };
  for (const spalte of spalten) delete kopie[spalte];
  return kopie;
}

function abgewiesen(zustand: ShareFormZustand) {
  if (zustand.ok) throw new Error("erwartet: Ablehnung, war: angenommen");
  return zustand;
}

function bestaetigt(zustand: ShareFormZustand): void {
  if (!zustand.ok) {
    throw new Error(`erwartet: Annahme, war: ${JSON.stringify(zustand.feldFehler)}`);
  }
}

async function* stueckweise(inhalt: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(inhalt);
}

/**
 * Legt echte Bytes ueber `_lib/storage.ts` ab — NICHT ueber einen im Test
 * zusammengebauten Pfad. Sonst schriebe der Test das Ablageschema fest, von dem
 * er unabhaengig sein soll (`_lib/storage.ts` ist die einzige Stelle, an der im
 * Modul ein Pfad entsteht).
 *
 * `abschliessen: false` laesst es bei der Zwischendatei `.part` — der Zustand
 * eines abgebrochenen Uploads, den das Loeschen mitnehmen muss.
 */
async function blob(
  shareId: string,
  fileId: string,
  inhalt: string,
  abschliessen: boolean,
): Promise<{ art: "share"; shareId: string; fileId: string }> {
  const ziel = { art: "share", shareId, fileId } as const;
  await schreibeStrom(ziel, stueckweise(inhalt), { maxBytes: 4096 });
  if (abschliessen) await abschliesse(ziel);
  return ziel;
}

/**
 * Die direkten Kinder der Ablagewurzel — genau die Ebene, aus der
 * `_lib/aufraeumen.ts:planeAufraeumen` seine `blobVerzeichnisse` bildet und
 * daraus die „verwaisten Blobs" ableitet.
 *
 * Der Test baut damit keinen Pfad zu einem BLOB (das bliebe `_lib/storage.ts`
 * vorbehalten, siehe `blob` darueber) — er liest dieselbe Ebene wie der
 * Aufraeum-Bericht, und dass deren Eintragsnamen die Share-IDs sind, ist eine
 * Annahme, die das Modul dort ohnehin schon traegt.
 */
function ablageWurzelEintraege(): string[] {
  return readdirSync(join(DIR, "files"));
}

// ---------------------------------------------------------------------------
// Punkt 1 — bearbeiten aendert NUR, was mitgeschickt wurde
// ---------------------------------------------------------------------------

describe("bearbeitenAction — nur das Mitgeschickte aendert sich", () => {
  it("nur der Titel geaendert → JEDE andere Spalte steht unveraendert", async () => {
    // Der Alt-Defekt: `useState(1)` im Formular plus bedingungsloses Senden in
    // `updateShare` verkuerzte den Share auf 24 h, sobald jemand den Titel
    // korrigierte (§7.3, Punkt 1).
    const { shareId } = await legeAn({
      ...GUELTIG,
      expiryDays: "5",
      maxDownloads: "3",
      password: "richtig-langes-Wort",
      description: "Lagebericht",
    });
    const vorher = shareZeile(shareId);

    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "  Übung Süd  " })));

    const nachher = shareZeile(shareId);
    expect(nachher.title).toBe("Übung Süd");
    expect(ohne(nachher, "title")).toEqual(ohne(vorher, "title"));
  });

  it("ein leerer Titel ist ein Feldfehler, und die Zeile bleibt unangetastet", async () => {
    const { shareId } = await legeAn();
    const vorher = shareZeile(shareId);
    const ergebnis = abgewiesen(await bearbeitenAction(LEER, fd({ id: shareId, title: "   " })));
    expect(ergebnis.feldFehler.title).toBeTruthy();
    expect(shareZeile(shareId)).toEqual(vorher);
  });

  it("eine unbekannte ID wird BENANNT abgelehnt, nicht still angenommen", async () => {
    const ergebnis = abgewiesen(
      await bearbeitenAction(LEER, fd({ id: "Abcdefghij", title: "Neu" })),
    );
    expect(ergebnis.feldFehler.id).toBeTruthy();
  });

  it("die Beschreibung wird nur geaendert, wenn das Feld mitkommt — leer heisst NULL", async () => {
    const { shareId } = await legeAn({ ...GUELTIG, description: "Lagebericht" });
    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T" })));
    expect(shareZeile(shareId).description).toBe("Lagebericht");

    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T", description: "  " })));
    expect(shareZeile(shareId).description).toBeNull();
  });

  it("das Download-Limit wird nur geaendert, wenn das Feld mitkommt", async () => {
    const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T" })));
    expect(shareZeile(shareId).max_downloads).toBe(3);

    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T", maxDownloads: "9" })));
    expect(shareZeile(shareId).max_downloads).toBe(9);

    // Leer heisst unbegrenzt — dieselbe Lesart wie beim Anlegen, und `"0"` ist
    // auch hier eine Ablehnung und nie „unbegrenzt".
    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T", maxDownloads: "" })));
    expect(shareZeile(shareId).max_downloads).toBeNull();
  });

  it('maxDownloads="0" wird abgelehnt, das bestehende Limit bleibt stehen', async () => {
    const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
    const ergebnis = abgewiesen(
      await bearbeitenAction(LEER, fd({ id: shareId, title: "T", maxDownloads: "0" })),
    );
    expect(ergebnis.feldFehler.maxDownloads).toBeTruthy();
    expect(shareZeile(shareId).max_downloads).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Punkt 2 — der Ablauf ist IN DER ACTION gedeckelt
// ---------------------------------------------------------------------------

describe("bearbeitenAction — der Ablauf", () => {
  for (const wert of ["0", "-1", "99999", "1.5", "sieben", "1e1", "0x2"]) {
    it(`ein direkter Aufruf mit expiryDays=${JSON.stringify(wert)} wird abgelehnt, expires_at bleibt`, async () => {
      // In der Alt-App stand die Deckelung NUR als HTML-Attribut; ueber einen
      // direkten Action-Aufruf waren 0, negative und beliebig grosse Werte
      // moeglich (§7.3, Punkt 2).
      const { shareId } = await legeAn({ ...GUELTIG, expiryDays: "5" });
      const vorher = shareZeile(shareId);
      const ergebnis = abgewiesen(
        await bearbeitenAction(LEER, fd({ id: shareId, title: "T", expiryDays: wert })),
      );
      expect(ergebnis.feldFehler.expiryDays).toBeTruthy();
      expect(shareZeile(shareId)).toEqual(vorher);
    });
  }

  it(`genau FILES_MAX_ABLAUF_TAGE (${MAX_TAGE}) wird angenommen — die Grenze ist einschliesslich`, async () => {
    // Die Gegenprobe zu 99999: ohne sie waere ein `>=` statt `>` gruen.
    const { shareId } = await legeAn({ ...GUELTIG, expiryDays: "1" });
    const vorher = Math.floor(Date.now() / 1000);
    bestaetigt(
      await bearbeitenAction(LEER, fd({ id: shareId, title: "T", expiryDays: String(MAX_TAGE) })),
    );
    const nachher = Math.floor(Date.now() / 1000);

    // Und in SEKUNDEN, nicht in Millisekunden (`schema.ts:4-13`): der
    // Faktor-1000-Fehler ist gegen die eigene Leseseite paritaetsgruen.
    const roh = shareZeile(shareId).expires_at as number;
    expect(roh).toBeGreaterThanOrEqual(vorher + MAX_TAGE * 86400);
    expect(roh).toBeLessThanOrEqual(nachher + MAX_TAGE * 86400);
  });

  it("ein leeres Ablauffeld laesst expires_at unveraendert — es ist kein „auf 0 Tage setzen“", async () => {
    const { shareId } = await legeAn({ ...GUELTIG, expiryDays: "5" });
    const vorher = shareZeile(shareId);
    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T", expiryDays: "" })));
    // Der Titel darf sich aendern — er wurde ja mitgeschickt; alles andere nicht.
    expect(ohne(shareZeile(shareId), "title")).toEqual(ohne(vorher, "title"));
  });
});

// ---------------------------------------------------------------------------
// Punkt 5 — Passwort setzen und entfernen
// ---------------------------------------------------------------------------

describe("bearbeitenAction — Passwort", () => {
  it("ein neu gesetztes Passwort liegt als $2b$12$ in der Zeile, nie im Klartext", async () => {
    const { shareId } = await legeAn();
    bestaetigt(
      await bearbeitenAction(LEER, fd({ id: shareId, title: "T", password: "richtig-langes-Wort" })),
    );
    const hash = shareZeile(shareId).password_hash as string;
    expect(hash.startsWith("$2b$12$")).toBe(true);
    expect(hash).not.toContain("richtig-langes-Wort");
  });

  it("passwortEntfernen=1 setzt password_hash auf NULL", async () => {
    const { shareId } = await legeAn({ ...GUELTIG, password: "richtig-langes-Wort" });
    bestaetigt(
      await bearbeitenAction(LEER, fd({ id: shareId, title: "T", passwortEntfernen: "1" })),
    );
    expect(shareZeile(shareId).password_hash).toBeNull();
  });

  it("ein LEERES Passwortfeld laesst den Hash stehen — sonst entzieht jede Titelkorrektur den Schutz", async () => {
    // Dieselbe Fehlerklasse wie der Ablauf-Defekt, nur teurer: der Empfaenger
    // haelt einen Link fuer geschuetzt, der es nicht mehr ist. Das Entfernen
    // braucht deshalb ein EIGENES Signal.
    const { shareId } = await legeAn({ ...GUELTIG, password: "richtig-langes-Wort" });
    const vorher = shareZeile(shareId).password_hash;
    bestaetigt(await bearbeitenAction(LEER, fd({ id: shareId, title: "T", password: "" })));
    expect(shareZeile(shareId).password_hash).toBe(vorher);
  });

  it("ein zu kurzes Passwort wird abgelehnt, der bestehende Hash bleibt", async () => {
    const { shareId } = await legeAn({ ...GUELTIG, password: "richtig-langes-Wort" });
    const vorher = shareZeile(shareId).password_hash;
    const ergebnis = abgewiesen(
      await bearbeitenAction(LEER, fd({ id: shareId, title: "T", password: "kurz" })),
    );
    expect(ergebnis.feldFehler.password).toBeTruthy();
    expect(shareZeile(shareId).password_hash).toBe(vorher);
  });

  it("eine Ablehnung schickt das Passwort NICHT zurueck — weder als Wert noch als Schluessel", async () => {
    // `werte` wird per `defaultValue` wieder ins Formular gesetzt (T35/T42).
    // Stuende `password` in der Namensliste von `mitgeschickt`, kaeme der
    // Klartext im RSC-Payload DERSELBEN Antwort an den Browser zurueck und
    // stuende als Attribut im Markup. Bis hierher haengt diese Zusage allein an
    // der Namensliste — dieser Fall ist es, der sie besitzt.
    const { shareId } = await legeAn();
    const ergebnis = abgewiesen(
      await bearbeitenAction(
        LEER,
        // Der Titel loest die Ablehnung aus; das Passwort ist lang genug und
        // damit fuer sich genommen fehlerfrei — geprueft wird das Echo, nicht
        // die Passwortpruefung.
        fd({ id: shareId, title: "   ", password: "richtig-langes-Wort" }),
      ),
    );
    expect(ergebnis.feldFehler.title).toBeTruthy();
    expect(Object.keys(ergebnis.werte)).not.toContain("password");
    // Ueber das GANZE Ergebnis, nicht nur ueber `werte`: eine Fehlermeldung, die
    // die Eingabe zitierte, waere derselbe Weg an denselben Browser.
    expect(JSON.stringify(ergebnis)).not.toContain("richtig-langes-Wort");
  });

  it("Setzen UND Entfernen zugleich ist ein Feldfehler, kein stiller Vorrang", async () => {
    const { shareId } = await legeAn({ ...GUELTIG, password: "richtig-langes-Wort" });
    const vorher = shareZeile(shareId).password_hash;
    const ergebnis = abgewiesen(
      await bearbeitenAction(
        LEER,
        fd({ id: shareId, title: "T", password: "ein-anderes-Wort", passwortEntfernen: "1" }),
      ),
    );
    expect(ergebnis.feldFehler.password).toBeTruthy();
    expect(shareZeile(shareId).password_hash).toBe(vorher);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 — Downloads aufstocken
// ---------------------------------------------------------------------------

describe("downloadsAufstockenAction", () => {
  it("stockt um den ZUWACHS auf: 3 + 5 ergibt 8, nicht 5", async () => {
    // Der Zuwachs statt der neuen Summe — dieselbe Begruendung wie bei
    // `kontingentAufstockenAction`: `max_downloads + ?` kann keinen gerade
    // laufenden Download ueberschreiben, und eine absolute Zahl liesse sich
    // versehentlich NACH UNTEN setzen.
    const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
    bestaetigt(await downloadsAufstockenAction(LEER, fd({ id: shareId, zusatzDownloads: "5" })));
    expect(shareZeile(shareId).max_downloads).toBe(8);
  });

  it("aendert KEINE andere Spalte — insbesondere setzt sie keinen Zeitstempel zurueck", async () => {
    // Punkt 3 ist der Grund, warum `limit_reached_at` gestrichen wurde: das
    // ANHEBEN eines Limits hinterliess dort einen gesetzten Wert, 24 h spaeter
    // antworteten drei Auslieferungsrouten 410, und der Aufraeumjob loeschte den
    // Share. Der Spaltenvergleich haelt das fuer JEDE Spalte fest, auch fuer
    // eine, die es heute noch nicht gibt.
    const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
    const vorher = shareZeile(shareId);
    bestaetigt(await downloadsAufstockenAction(LEER, fd({ id: shareId, zusatzDownloads: "5" })));
    expect(ohne(shareZeile(shareId), "max_downloads")).toEqual(ohne(vorher, "max_downloads"));
  });

  it("ein UNBEGRENZTER Share wird benannt abgelehnt — NULL + n waere NULL und still", async () => {
    // Ohne diesen Riegel meldete die Action Erfolg, waehrend `max_downloads`
    // NULL bliebe (dieselbe Falle wie `budget + 0` bei den Abgabelinks).
    const { shareId } = await legeAn(GUELTIG);
    const ergebnis = abgewiesen(
      await downloadsAufstockenAction(LEER, fd({ id: shareId, zusatzDownloads: "5" })),
    );
    expect(ergebnis.feldFehler.id).toBeTruthy();
    expect(shareZeile(shareId).max_downloads).toBeNull();
  });

  for (const wert of ["0", "-1", "", "2.5", "drei"]) {
    it(`zusatzDownloads=${JSON.stringify(wert)} wird abgelehnt, das Limit bleibt`, async () => {
      const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
      const ergebnis = abgewiesen(
        await downloadsAufstockenAction(LEER, fd({ id: shareId, zusatzDownloads: wert })),
      );
      expect(ergebnis.feldFehler.zusatzDownloads).toBeTruthy();
      expect(shareZeile(shareId).max_downloads).toBe(3);
    });
  }

  it("eine unbekannte ID wird benannt abgelehnt", async () => {
    const ergebnis = abgewiesen(
      await downloadsAufstockenAction(LEER, fd({ id: "Abcdefghij", zusatzDownloads: "5" })),
    );
    expect(ergebnis.feldFehler.id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Punkt 4 — loeschen: Zeilen, Blobs, Zwischendateien — das Audit-Log BLEIBT
// ---------------------------------------------------------------------------

describe("shareLoeschenAction", () => {
  it("entfernt Zeilen, Blobs und Zwischendateien und laesst das Audit-Log stehen", async () => {
    const opfer = await legeAn(GUELTIG, ["bericht.pdf", "abbruch.pdf"]);
    const fremd = await legeAn(GUELTIG, ["fremd.pdf"]);

    const fertig = await blob(opfer.shareId, opfer.dateien[0].fileId, "Inhalt", true);
    // Die zweite Datei blieb im Upload stecken: nur die Zwischendatei liegt da.
    const halb = await blob(opfer.shareId, opfer.dateien[1].fileId, "halb", false);
    const fremderBlob = await blob(fremd.shareId, fremd.dateien[0].fileId, "bleibt", true);

    // Ohne diese Zeile waere „das Audit-Log bleibt erhalten" gegen eine LEERE
    // Tabelle gruen und beliese nichts.
    getDb()
      .insert(downloadLogs)
      .values({
        shareId: opfer.shareId,
        fileId: null,
        clientIpUnbestaetigt: "203.0.113.0",
        userAgent: "Test",
        downloadedAt: new Date(),
      })
      .run();

    bestaetigt(await shareLoeschenAction(LEER, fd({ id: opfer.shareId })));

    expect(rohZeilen("shares").map((z) => z.id)).toEqual([fremd.shareId]);
    expect(rohZeilen("share_files").map((z) => z.share_id)).toEqual([fremd.shareId]);

    await expect(groesse(fertig)).rejects.toBeInstanceOf(BlobFehlt);
    expect(await fortschritt(halb)).toBe(0);

    // Der fremde Share ist unberuehrt — Bytes und Zeile.
    expect(await groesse(fremderBlob)).toBe(6);

    const log = rohZeilen("download_logs");
    expect(log).toHaveLength(1);
    expect(log[0].share_id).toBe(opfer.shareId);
  });

  it("loescht die share_files-Zeilen auch bei ABGESCHALTETEM Fremdschluessel-Cascade", async () => {
    // Ohne diesen Fall erledigt `PRAGMA foreign_keys = ON` (`core/db/index.ts`)
    // das Loeschen der Dateizeilen still mit: der ausdrueckliche `DELETE` im
    // Rumpf laesst sich ersatzlos streichen, und kein Lauf wird rot. Genau das
    // ist aber die Zusage — sie soll nicht an einer Einstellung AUSSERHALB des
    // Moduls haengen. Hier steht sie mit ausgeschalteter Einstellung.
    const opfer = await legeAn(GUELTIG, ["bericht.pdf", "lage.png"]);
    const fremd = await legeAn(GUELTIG, ["fremd.pdf"]);

    // Auf DERSELBEN Verbindung, die die Action benutzt: `getModuleDb` haelt sie
    // je Modulschluessel global fest, und `beforeEach` verwirft sie wieder —
    // die Abschaltung leckt also nicht in den naechsten Fall.
    getDb().run(sql`PRAGMA foreign_keys = OFF`);
    // Die Gegenprobe zur Vorrichtung selbst: griffe das PRAGMA nicht, liefe der
    // Fall gegen ein eingeschaltetes Cascade und bewiese das Gegenteil.
    expect(getDb().get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`)).toEqual({
      foreign_keys: 0,
    });

    bestaetigt(await shareLoeschenAction(LEER, fd({ id: opfer.shareId })));

    expect(rohZeilen("share_files").map((z) => z.share_id)).toEqual([fremd.shareId]);
    expect(rohZeilen("shares").map((z) => z.id)).toEqual([fremd.shareId]);
  });

  it("das Verzeichnis des FREMDEN Shares bleibt stehen", async () => {
    // Die Kontrollgruppe zum Fall darunter: was hier stehen bleiben MUSS, darf
    // eine kuenftige Verzeichnis-Entfernung nicht mitnehmen.
    const opfer = await legeAn(GUELTIG, ["bericht.pdf"]);
    const fremd = await legeAn(GUELTIG, ["fremd.pdf"]);
    await blob(opfer.shareId, opfer.dateien[0].fileId, "Inhalt", true);
    await blob(fremd.shareId, fremd.dateien[0].fileId, "bleibt", true);

    // Die Vorrichtung selbst, VOR dem Loeschen: ohne diese Zeile bewiese der
    // Fall nicht, dass ueberhaupt zwei Verzeichnisse entstanden sind.
    expect(ablageWurzelEintraege()).toContain(opfer.shareId);

    bestaetigt(await shareLoeschenAction(LEER, fd({ id: opfer.shareId })));
    expect(ablageWurzelEintraege()).toContain(fremd.shareId);
  });

  /*
   * Die Zusage aus Spec §7.3 lautet „alle Blobs (`loesche` je Datei, DANACH das
   * Verzeichnis)", und sie ist nicht kosmetisch:
   * `_lib/aufraeumen.ts:planeAufraeumen` bildet `verwaisteBlobs` aus den
   * direkten Kindern der Ablagewurzel, gefiltert gegen die vorhandenen
   * `shares`-Zeilen. Bliebe das leere Verzeichnis stehen, meldete JEDER
   * Aufraeumlauf ab dann JEDE planmaessige Loeschung als „verwaisten Blob", mit
   * monoton steigender Zahl. Der Bericht ist laut §7.6 bewusst nur meldend und
   * nicht loeschend; Falschmeldungen nehmen ihm genau diese Aussage.
   */
  it("das leere Verzeichnis des geloeschten Shares verschwindet mit", async () => {
    const opfer = await legeAn(GUELTIG, ["bericht.pdf"]);
    await blob(opfer.shareId, opfer.dateien[0].fileId, "Inhalt", true);

    // VOR dem Loeschen, sonst waere die Zusicherung darunter auch dann gruen,
    // wenn `legeAn`/`blob` aus einem ganz anderen Grund nichts angelegt haetten.
    expect(ablageWurzelEintraege()).toContain(opfer.shareId);

    bestaetigt(await shareLoeschenAction(LEER, fd({ id: opfer.shareId })));
    expect(ablageWurzelEintraege()).not.toContain(opfer.shareId);
  });

  it("ein fremder Rest haelt das Verzeichnis — und das Loeschen gelingt trotzdem", async () => {
    const opfer = await legeAn(GUELTIG, ["bericht.pdf"]);
    await blob(opfer.shareId, opfer.dateien[0].fileId, "Inhalt", true);

    /*
     * Eine Zwischendatei OHNE `share_files`-Zeile: der noch nicht
     * abgeschlossene Upload eines anderen Vorgangs. Die Schleife oben kennt ihn
     * nicht, also raeumt sie ihn nicht weg — und ein `rm -r` auf das
     * Verzeichnis risse ihn mit. Deshalb ist ENOTEMPTY hier kein Fehler,
     * sondern der erwartete Zustand: das Verzeichnis bleibt, die Action gelingt.
     */
    const fremderTeil = await blob(opfer.shareId, "Zz9_x-1Qw2", "halb", false);

    bestaetigt(await shareLoeschenAction(LEER, fd({ id: opfer.shareId })));

    expect(ablageWurzelEintraege()).toContain(opfer.shareId);
    expect(await fortschritt(fremderTeil)).toBe(4);
  });

  it("ein gescheitertes rmdir laesst das Loeschen gelingen, aber nicht STILL", async () => {
    /*
     * Der Betriebsfall: die Ablage ist nur lesbar eingehaengt. Das Loeschen darf
     * daran nicht scheitern — die Zeilen sind der teurere Zustand, und der
     * Vorgang liesse sich sonst nicht abschliessen. Es darf aber auch nicht
     * still bleiben, sonst sucht der Betreiber die Ursache der steigenden
     * „verwaisten Blobs" im Bericht und findet sie nie.
     */
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const opfer = await legeAn(GUELTIG, ["bericht.pdf"]);
      await blob(opfer.shareId, opfer.dateien[0].fileId, "Inhalt", true);
      storageSteuerung.verzeichnisFehler = new Error("simuliert: EACCES");

      bestaetigt(await shareLoeschenAction(LEER, fd({ id: opfer.shareId })));

      expect(rohZeilen("shares")).toHaveLength(0);
      expect(laut).toHaveBeenCalled();
    } finally {
      laut.mockRestore();
    }
  });

  it("eine unbekannte ID wird benannt abgelehnt, und nichts verschwindet", async () => {
    const { shareId } = await legeAn();
    const ergebnis = abgewiesen(await shareLoeschenAction(LEER, fd({ id: "Abcdefghij" })));
    expect(ergebnis.feldFehler.id).toBeTruthy();
    expect(rohZeilen("shares").map((z) => z.id)).toEqual([shareId]);
  });
});

// ---------------------------------------------------------------------------
// Punkt 4 (Fortsetzung) — die Auffrischung erreicht auch die Unterrouten
// ---------------------------------------------------------------------------

describe("die drei T37-Actions frischen das Segment MIT Unterrouten auf", () => {
  /*
   * `next/cache` ist gemockt (oben), die Wahl `"layout"` faellt also in keinem
   * anderen Lauf auf: streicht man den Aufruf ersatzlos, bleibt die uebrige
   * Suite gruen. Ohne ihn zeigten Uebersicht UND Detailseite nach jeder
   * Bearbeitung, jedem Aufstocken und jedem Loeschen weiter den alten Stand —
   * und beim Loeschen bekaeme `/shares/<id>` ihren `notFound()`-Zweig nie.
   *
   * Geprueft wird das PAAR aus Pfad und Reichweite: `"/m/files"` ist der
   * INTERNE Pfad (nicht die per Host geroutete Wurzel `/`), `"layout"` die
   * Reichweite ueber alle Unterrouten.
   */
  const auffrischer = vi.mocked(revalidatePath);

  const rufe: Record<string, (id: string) => Promise<ShareFormZustand>> = {
    bearbeitenAction: (id) => bearbeitenAction(LEER, fd({ id, title: "Neu" })),
    downloadsAufstockenAction: (id) =>
      downloadsAufstockenAction(LEER, fd({ id, zusatzDownloads: "5" })),
    shareLoeschenAction: (id) => shareLoeschenAction(LEER, fd({ id })),
  };

  for (const [name, rufe1] of Object.entries(rufe)) {
    it(`${name}: revalidatePath("/m/files", "layout")`, async () => {
      const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
      // Erst NACH dem Anlegen: `anlegenAction` frischt selbst auf (ohne
      // `"layout"`), und ohne das Leeren zaehlte ein spaeterer Fall fremde
      // Aufrufe mit.
      auffrischer.mockClear();

      bestaetigt(await rufe1(shareId));

      expect(auffrischer).toHaveBeenCalledWith("/m/files", "layout");
    });
  }
});

// ---------------------------------------------------------------------------
// Punkt 6 — ohne Zugang sind alle DREI abweisend
// ---------------------------------------------------------------------------

describe("die drei T37-Actions — der Zugriffsriegel", () => {
  const rufe: Record<string, (id: string) => Promise<ShareFormZustand>> = {
    bearbeitenAction: (id) => bearbeitenAction(LEER, fd({ id, title: "Neu" })),
    downloadsAufstockenAction: (id) =>
      downloadsAufstockenAction(LEER, fd({ id, zusatzDownloads: "5" })),
    shareLoeschenAction: (id) => shareLoeschenAction(LEER, fd({ id })),
  };

  for (const [name, rufe1] of Object.entries(rufe)) {
    it(`${name}: ohne Sitzung fuehrt sie in die Anmeldung und aendert nichts`, async () => {
      const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
      const vorher = shareZeile(shareId);
      authMock.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);
      await expect(rufe1(shareId)).rejects.toThrow(/NEXT_REDIRECT/);
      expect(shareZeile(shareId)).toEqual(vorher);
    });

    it(`${name}: mit Sitzung ohne Gruppe antwortet sie wie eine unbekannte Route`, async () => {
      const { shareId } = await legeAn({ ...GUELTIG, maxDownloads: "3" });
      const vorher = shareZeile(shareId);
      authMock.mockResolvedValue({
        user: { id: SUB, groups: ["irgendeine-andere-gruppe"] },
      } as unknown as Awaited<ReturnType<typeof auth>>);
      await expect(rufe1(shareId)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(shareZeile(shareId)).toEqual(vorher);
    });
  }
});

// ===========================================================================
// T45 — avWiederholenAction: `error → scanning`, und sonst nichts
// ===========================================================================

/**
 * DER WERTEBEREICH DER UEBERGAENGE (§6.2) IST HIER DIE GANZE ZUSAGE.
 *
 * `error → scanning` ist der EINZIGE Uebergang dieses Knopfes. `clean` und
 * `infected` sind Endzustaende — kein Weg fuehrt aus ihnen heraus —, `scanning`
 * laeuft schon, und `unscanned → scanning` gehoert AUSSCHLIESSLICH dem
 * Nachscan-Lauf aus Spec 2. Die vier stehen deshalb NAMENTLICH in einer
 * Schleife und nicht als „irgendein anderer Wert": eine Aufzaehlung sagt, WELCHE
 * Faelle geprueft sind, und `Record<AvStatus, …>` bzw. dieser Typ fallen im
 * typecheck auf, sobald ein sechster Status entsteht.
 */
const AV_UNBERUEHRT: AvStatus[] = ["clean", "infected", "unscanned", "scanning"];

/** Die Zeit, die vor der Wiederholung in `av_geprueft_at` steht. */
const GEPRUEFT_AM = new Date("2026-07-30T08:00:00Z");

const INBOX_ID = "ib-aaaaaa1";

function setzeAvStatus(tabelle: "share_files" | "inbox_files", id: string, status: AvStatus): void {
  // Ueber DIESELBE Verbindung, die die Action benutzt — eine zweite waere ein
  // zweiter Schreiber auf derselben Datei.
  getDb().run(
    sql`UPDATE ${sql.raw(tabelle)} SET av_status = ${status},
        av_geprueft_at = ${Math.floor(GEPRUEFT_AM.getTime() / 1000)} WHERE id = ${id}`,
  );
}

/**
 * Eine Abgabe im Posteingang. `bytes_vollstaendig_at` ist gesetzt: eine Zeile
 * ohne Bytes erreicht `error` gar nicht erst (`_lib/av.ts:auftraege` nimmt nur
 * vollstaendige Zeilen).
 */
function legeInbox(status: AvStatus, id = INBOX_ID): string {
  getDb()
    .insert(inboxFiles)
    .values({
      id,
      tokenId: null,
      dateiname: "abgabe.pdf",
      kategorie: "dokumente",
      hinweis: null,
      mimeType: "application/pdf",
      size: 12,
      clientIpUnbestaetigt: null,
      empfangenAt: GEPRUEFT_AM,
      bytesVollstaendigAt: GEPRUEFT_AM,
      avStatus: status,
      avGeprueftAt: GEPRUEFT_AM,
    })
    .run();
  return id;
}

/** Eine Freigabe mit genau einer Dateizeile im gewuenschten AV-Zustand. */
async function legeShareDatei(status: AvStatus) {
  const { shareId, dateien } = await legeAn();
  setzeAvStatus("share_files", dateien[0].fileId, status);
  return { shareId, fileId: dateien[0].fileId };
}

function avZeile(tabelle: "share_files" | "inbox_files", id: string): Record<string, unknown> {
  const zeile = rohZeilen(tabelle).find((z) => z.id === id);
  if (zeile === undefined) throw new Error(`${tabelle}/${id} nicht in der Datenbank`);
  return zeile;
}

describe("avWiederholenAction — der Uebergang error → scanning", () => {
  it("setzt eine share_files-Zeile auf scanning und reiht sie mit ihrem Blob-Ziel ein", async () => {
    const { shareId, fileId } = await legeShareDatei("error");

    await avWiederholenAction(fd({ art: "share", id: fileId }));

    expect(avZeile("share_files", fileId).av_status).toBe("scanning");
    /*
     * DAS BLOB-ZIEL TRAEGT BEIDE IDs. Ein `{art:"share", fileId}` ohne
     * `shareId` waere kein gueltiges `BlobZiel` — `_lib/storage.ts` baut den
     * Pfad aus beiden, und die Wiederholung fuende die Bytes nie.
     */
    expect(avSteuerung.eingereiht).toEqual([{ art: "share", shareId, fileId }]);
  });

  it("setzt eine inbox_files-Zeile auf scanning und reiht sie ein — DIESELBE Action", async () => {
    // Zwei Tabellen, ein Knopf (§4.6: beide fuehren denselben Zustand). Eine
    // zweite Action waere ein zweites Statusmodell.
    legeInbox("error");

    await avWiederholenAction(fd({ art: "inbox", id: INBOX_ID }));

    expect(avZeile("inbox_files", INBOX_ID).av_status).toBe("scanning");
    expect(avSteuerung.eingereiht).toEqual([{ art: "inbox", inboxFileId: INBOX_ID }]);
  });

  it("loescht av_geprueft_at — sonst uebergeht die Boot-Wiederaufnahme die Zeile", async () => {
    /*
     * §6.4 beschreibt die Wiederaufnahme als `scanning` UND
     * `av_geprueft_at IS NULL`. Heute waehlt `_lib/av.ts:auftraege` breiter
     * (nur `scanning` plus vollstaendige Bytes), ein stehengebliebener
     * Zeitstempel waere also HEUTE folgenlos — und genau deshalb steht diese
     * Zusicherung hier: zoege jemand die Auswahl auf den Wortlaut der Spec
     * zusammen, bliebe jede wiederholte Zeile fuer immer auf „wird geprueft".
     */
    const { fileId } = await legeShareDatei("error");
    expect(avZeile("share_files", fileId).av_geprueft_at).not.toBeNull();

    await avWiederholenAction(fd({ art: "share", id: fileId }));

    expect(avZeile("share_files", fileId).av_geprueft_at).toBeNull();
  });

  for (const status of AV_UNBERUEHRT) {
    it(`share_files in '${status}' bleibt unveraendert und wird NICHT eingereiht`, async () => {
      const { fileId } = await legeShareDatei(status);
      const vorher = avZeile("share_files", fileId);

      await avWiederholenAction(fd({ art: "share", id: fileId }));

      expect(avZeile("share_files", fileId)).toEqual(vorher);
      expect(avSteuerung.eingereiht).toEqual([]);
    });

    it(`inbox_files in '${status}' bleibt unveraendert und wird NICHT eingereiht`, async () => {
      legeInbox(status);
      const vorher = avZeile("inbox_files", INBOX_ID);

      await avWiederholenAction(fd({ art: "inbox", id: INBOX_ID }));

      expect(avZeile("inbox_files", INBOX_ID)).toEqual(vorher);
      expect(avSteuerung.eingereiht).toEqual([]);
    });
  }

  it("eine unbekannte `art` aendert in KEINER der beiden Tabellen etwas", async () => {
    // Ohne die Pruefung waere ein Default-Zweig noetig, und der entschiede
    // stillschweigend fuer eine der beiden Tabellen.
    const { fileId } = await legeShareDatei("error");
    legeInbox("error");

    await avWiederholenAction(fd({ art: "share_files", id: fileId }));
    await avWiederholenAction(fd({ art: "", id: INBOX_ID }));

    expect(avZeile("share_files", fileId).av_status).toBe("error");
    expect(avZeile("inbox_files", INBOX_ID).av_status).toBe("error");
    expect(avSteuerung.eingereiht).toEqual([]);
  });

  it("eine unbekannte ID aendert nichts — auch nicht in der anderen Tabelle", async () => {
    const { fileId } = await legeShareDatei("error");
    legeInbox("error");

    await avWiederholenAction(fd({ art: "share", id: "Abcdefghij" }));
    // Die ID der ANDEREN Tabelle darf nicht wirken: `art` entscheidet, nie ein
    // Rateweg ueber beide Tabellen.
    await avWiederholenAction(fd({ art: "share", id: INBOX_ID }));
    await avWiederholenAction(fd({ art: "inbox", id: fileId }));

    expect(avZeile("share_files", fileId).av_status).toBe("error");
    expect(avZeile("inbox_files", INBOX_ID).av_status).toBe("error");
    expect(avSteuerung.eingereiht).toEqual([]);
  });

  it("frischt das Segment MIT Unterrouten auf — Detailseite UND Posteingang", async () => {
    /*
     * `next/cache` ist gemockt, die Wahl faellt also in keinem anderen Lauf auf.
     * Der Knopf steht an ZWEI Orten (`/shares/<id>` und `/posteingang`), und
     * beide liegen unter demselben internen Segment — ohne `"layout"` bliebe
     * einer von beiden auf dem alten Stand stehen.
     */
    const { fileId } = await legeShareDatei("error");
    const auffrischer = vi.mocked(revalidatePath);
    auffrischer.mockClear();

    await avWiederholenAction(fd({ art: "share", id: fileId }));

    expect(auffrischer).toHaveBeenCalledWith("/m/files", "layout");
  });
});

describe("avWiederholenAction — der Zugriffsriegel", () => {
  it("ohne Sitzung fuehrt sie in die Anmeldung und aendert nichts", async () => {
    const { fileId } = await legeShareDatei("error");
    authMock.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof auth>>);

    await expect(avWiederholenAction(fd({ art: "share", id: fileId }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );
    expect(avZeile("share_files", fileId).av_status).toBe("error");
    expect(avSteuerung.eingereiht).toEqual([]);
  });

  it("mit Sitzung ohne Gruppe antwortet sie wie eine unbekannte Route", async () => {
    const { fileId } = await legeShareDatei("error");
    authMock.mockResolvedValue({
      user: { id: SUB, groups: ["irgendeine-andere-gruppe"] },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    await expect(avWiederholenAction(fd({ art: "share", id: fileId }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(avZeile("share_files", fileId).av_status).toBe("error");
    expect(avSteuerung.eingereiht).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Punkt 7 — die Quelltext-Zusicherung ueber ALLE Server Actions des Moduls
// ---------------------------------------------------------------------------

/*
 * WARUM ES DIESEN SCAN GIBT (Plan T26 Punkt 7, Spec §2.4).
 *
 * Eine Seiten- oder Layout-Pruefung erstreckt sich NICHT auf die Actions
 * darunter (mitgelieferte Next-Doku, `data-security.md:282,329`) — in der
 * Alt-App fehlte `auth()` in ALLEN DREI Actions (`dashboard/actions.ts`). Der
 * Scan ist damit staerker als das, was die Spec verlangt: er gilt fuer jede
 * Action, die es je geben wird, nicht nur fuer die von heute.
 *
 * ZWEI LUECKEN SIND AUSDRUECKLICH GESCHLOSSEN:
 * (a) `"use server"` nur in Zeile 1 zu suchen laesst jede Datei mit
 *     vorangestelltem Kommentar und jede FUNKTIONSLOKALE Direktive
 *     durchrutschen — beides ist gueltiges Next und beides ergibt eine
 *     erreichbare Action.
 * (b) Ein Scan ueber NULL Dateien ist gruen. Deshalb wird die gefundene Menge
 *     ausgegeben und gegen eine NAMENTLICHE Erwartung geprueft.
 */

/** Zusammengesetzt, damit DIESE Datei kein Treffer ihres eigenen Scans ist. */
const DIREKTIVE = "use " + "server";
const RIEGEL = "requireFilesAccess";

const MODULWURZEL = "src/app/m/files";

/**
 * Die `"use server"`-Dateien, die es in Welle 5 geben soll — NAMENTLICH und als
 * Mindestzahl.
 *
 * Der Plan nennt zwei: diese hier (T26) und die der Zugangslinks (T30). Beide
 * Formen stehen nebeneinander, weil sie verschiedene Fehler fangen: die
 * Mindestzahl trifft einen Scan, der ploetzlich weniger findet; die
 * NAMENTLICHE Liste sagt zusaetzlich, WELCHE Datei fehlt — eine blosse Zahl
 * liesse offen, ob der Scan blind ist oder eine Datei umbenannt wurde.
 */
const ERWARTETE_USE_SERVER_DATEIEN = [
  `${MODULWURZEL}/(verwaltung)/actions.ts`,
  `${MODULWURZEL}/(verwaltung)/zugangslinks/actions.ts`,
];

const MINDESTZAHL_USE_SERVER_DATEIEN = 2;

/** Die Datei, ohne die der Scan nichts geprueft haben KANN. */
const PFLICHTDATEI = `${MODULWURZEL}/(verwaltung)/actions.ts`;

describe("Quelltext-Zusicherung: jede Server Action des Moduls ruft requireFilesAccess", () => {
  it("findet die erwarteten Dateien — ein Scan ueber null Dateien waere sonst gruen", () => {
    const gefunden = useServerDateien().map((d) => d.pfad);
    console.info(
      `[T26] "${DIREKTIVE}"-Dateien unter ${MODULWURZEL}: ${gefunden.length}\n  - ` +
        gefunden.join("\n  - "),
    );

    expect(gefunden.length).toBeGreaterThanOrEqual(MINDESTZAHL_USE_SERVER_DATEIEN);
    expect(gefunden).toContain(PFLICHTDATEI);
    for (const erwartet of ERWARTETE_USE_SERVER_DATEIEN) expect(gefunden).toContain(erwartet);
  });

  it("jede exportierte Funktion darin ruft den Riegel in ihrem eigenen Rumpf", () => {
    const ohneRiegel: string[] = [];
    for (const datei of useServerDateien()) {
      for (const fn of aktionen(datei.inhalt)) {
        if (!fn.rumpf.includes(RIEGEL)) ohneRiegel.push(`${datei.pfad}#${fn.name}`);
      }
    }
    expect(ohneRiegel).toEqual([]);
  });

  it("der Scan sieht ueberhaupt Funktionen — sonst waere die Zeile darueber leer und gruen", () => {
    const gezaehlt = useServerDateien().flatMap((d) => aktionen(d.inhalt).map((f) => f.name));
    // NAMENTLICH und nicht als blosse Zahl: eine Zahl liesse offen, ob der Scan
    // blind ist oder eine Action umbenannt wurde. Die drei aus T37 stehen mit
    // dabei — sonst waere die Riegel-Zusicherung darueber fuer sie leer.
    for (const name of [
      "anlegenAction",
      "bearbeitenAction",
      "downloadsAufstockenAction",
      "shareLoeschenAction",
      "avWiederholenAction",
    ]) {
      expect(gezaehlt).toContain(name);
    }
  });

  it("der Scan erkennt eine funktionslokale Direktive, nicht nur die Modulzeile", () => {
    // Gegenprobe an einem KONSTRUIERTEN Quelltext: ohne sie waere Luecke (a)
    // offen, und niemand merkte es, weil es heute keine solche Datei gibt.
    const konstruiert = [
      "export default function Seite() {",
      "  async function speichern() {",
      `    "${DIREKTIVE}";`,
      "    schreibe();",
      "  }",
      "  return null;",
      "}",
    ].join("\n");
    const treffer = aktionen(konstruiert);
    expect(treffer.map((f) => f.name)).toContain("speichern");
    expect(treffer.find((f) => f.name === "speichern")!.rumpf).toContain("schreibe()");
  });

  it("eine Direktive hinter einem Kommentarblock zaehlt ebenfalls als Modulzeile", () => {
    const konstruiert = ["/* Kopfkommentar */", `"${DIREKTIVE}";`, "export async function a() {}"].join(
      "\n",
    );
    expect(istServerModul(konstruiert)).toBe(true);
    expect(aktionen(konstruiert).map((f) => f.name)).toEqual(["a"]);
  });

  it("eine Exportform, die der Scan nicht liest, faellt LAUT aus statt still durchzugehen", () => {
    // Das ist der gefaehrlichste Fehler dieses Scans: `export { … }` traegt
    // keinen Funktionskopf, den die Muster finden — ohne den Wurf faende der
    // Scan null Funktionen in einer Action-Datei und meldete Erfolg.
    for (const form of [
      "export { irgendwas };",
      'export * from "./anderswo";',
      "export const ZAHL = 5;",
    ]) {
      const konstruiert = [`"${DIREKTIVE}";`, "export async function a() {", `  ${RIEGEL}();`, "}", form].join(
        "\n",
      );
      expect(() => aktionen(konstruiert)).toThrow();
    }
  });

  it("ein Destructuring-Parameter wird nicht fuer den Rumpf gehalten", () => {
    // `function f({ a }: X) {` — ohne das Ueberspringen der Parameterliste
    // pruefte der Scan das Muster `{ a }` als „Rumpf" und waere gruen, ohne
    // etwas gesehen zu haben.
    const konstruiert = [
      `"${DIREKTIVE}";`,
      "export async function a({ wert }: { wert: string }) {",
      `  ${RIEGEL}();`,
      "  return wert;",
      "}",
    ].join("\n");
    expect(aktionen(konstruiert)[0].rumpf).toContain(`${RIEGEL}()`);
  });

  it("ein Riegel im KOMMENTAR zaehlt nicht", () => {
    // Sonst genuegte das Wort in einer Erklaerzeile, um die Zusicherung zu
    // erfuellen — der Scan waere Dekoration.
    const konstruiert = [
      `"${DIREKTIVE}";`,
      "export async function a() {",
      `  // ruft absichtlich kein ${RIEGEL}`,
      "}",
    ].join("\n");
    const fn = aktionen(konstruiert)[0];
    expect(fn.rumpf).not.toContain(RIEGEL);
  });
});

// ---------------------------------------------------------------------------
// Der Scan
// ---------------------------------------------------------------------------

/** Alle TypeScript-Quellen des Moduls, mit repo-relativem Pfad. */
function quelldateien(): { pfad: string; inhalt: string }[] {
  const gesammelt: { pfad: string; inhalt: string }[] = [];
  const gehe = (verzeichnis: string) => {
    for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
      const pfad = join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) gehe(pfad);
      else if (/\.tsx?$/.test(eintrag.name))
        gesammelt.push({ pfad: pfad.split("\\").join("/"), inhalt: readFileSync(pfad, "utf8") });
    }
  };
  gehe(MODULWURZEL);
  return gesammelt;
}

function useServerDateien(): { pfad: string; inhalt: string }[] {
  return quelldateien().filter((d) => istServerModul(d.inhalt) || hatLokaleDirektive(d.inhalt));
}

/**
 * Ersetzt den INHALT von Kommentaren und Zeichenketten durch Leerzeichen — die
 * Laenge und damit jeder Offset bleiben erhalten.
 *
 * Zweck: die Klammerzaehlung unten darf keine Klammer aus einem Kommentar oder
 * einem Text sehen, und der Riegelname darf nicht aus einem Kommentar zaehlen.
 * Regex-Literale werden bewusst NICHT gesondert behandelt: in einer
 * `"${DIREKTIVE}"`-Datei ist keins zu erwarten, und faende die Klammerzaehlung
 * deswegen kein Ende, wirft sie — sie wird nicht still zu wenig pruefen.
 */
function maskiere(quelle: string): string {
  const aus = quelle.split("");
  const n = quelle.length;
  let i = 0;
  const leere = (bis: number) => {
    for (; i < bis && i < n; i++) if (quelle[i] !== "\n") aus[i] = " ";
  };

  while (i < n) {
    const c = quelle[i];
    const c2 = quelle[i + 1];
    if (c === "/" && c2 === "/") {
      const ende = quelle.indexOf("\n", i);
      leere(ende === -1 ? n : ende);
      continue;
    }
    if (c === "/" && c2 === "*") {
      const ende = quelle.indexOf("*/", i + 2);
      leere(ende === -1 ? n : ende + 2);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i++; // das oeffnende Zeichen bleibt stehen
      while (i < n) {
        if (quelle[i] === "\\") {
          aus[i] = " ";
          if (i + 1 < n && quelle[i + 1] !== "\n") aus[i + 1] = " ";
          i += 2;
          continue;
        }
        if (quelle[i] === c) break;
        if (quelle[i] !== "\n") aus[i] = " ";
        i++;
      }
      i++; // das schliessende Zeichen
      continue;
    }
    i++;
  }
  return aus.join("");
}

/** Trifft `"use server"` bzw. `'use server'` als vollstaendige Direktive. */
const DIREKTIV_MUSTER = new RegExp(`(["'])${DIREKTIVE}\\1\\s*;?`);

/** Traegt die Datei die Direktive als ERSTE Anweisung (Kommentare davor erlaubt)? */
function istServerModul(quelle: string): boolean {
  const maskiert = maskiere(quelle);
  const erstes = maskiert.search(/\S/);
  if (erstes === -1) return false;
  const rest = quelle.slice(erstes);
  const treffer = DIREKTIV_MUSTER.exec(rest);
  return treffer !== null && treffer.index === 0;
}

function hatLokaleDirektive(quelle: string): boolean {
  return lokaleDirektivStellen(quelle).length > 0;
}

/** Alle Stellen, an denen die Direktive als erste Anweisung eines Rumpfes steht. */
function lokaleDirektivStellen(quelle: string): number[] {
  const maskiert = maskiere(quelle);
  const stellen: number[] = [];
  const global = new RegExp(DIREKTIV_MUSTER.source, "g");
  let treffer: RegExpExecArray | null;
  while ((treffer = global.exec(quelle)) !== null) {
    // Nur echte Direktiven zaehlen, keine Vorkommen in einem Kommentar: an
    // dieser Stelle muss der maskierte Quelltext dasselbe Anfuehrungszeichen
    // tragen.
    if (maskiert[treffer.index] !== quelle[treffer.index]) continue;
    let davor = treffer.index - 1;
    while (davor >= 0 && /\s/.test(maskiert[davor])) davor--;
    if (davor >= 0 && maskiert[davor] === "{") stellen.push(davor);
  }
  return stellen;
}

type Aktion = { name: string; rumpf: string };

/** `export async function x`, `export default function x`, `export default function (`. */
const FUNKTIONS_EXPORT = /^export\s+(?:default\s+)?(?:async\s+)?function\s*(\w+)?\s*\(/gm;

/** `export const x = (…) => {` und `export const x = async function (…) {`. */
const KONSTANTEN_EXPORT = /^export\s+const\s+(\w+)\s*(?::[^=]*)?=/gm;

/**
 * Die Exportformen, die dieser Scan LESEN kann. Alles andere ist ein
 * Fehlschlag, kein stilles Uebergehen.
 *
 * Der Unterschied ist der ganze Wert der Zusicherung: `export { anlegenAction }`
 * traegt keinen Funktionskopf, den die beiden Muster oben finden — ohne diese
 * Liste faende der Scan null Funktionen in der Datei und meldete Erfolg.
 */
const VERSTANDENE_EXPORTFORMEN = [
  /^export\s+(?:default\s+)?(?:async\s+)?function\s*\w*\s*\(/,
  /^export\s+const\s+\w+\s*(?::[^=]*)?=/,
  /^export\s+type\b/,
  /^export\s+interface\b/,
];

function pruefeExportformen(maskiert: string): void {
  for (const treffer of maskiert.matchAll(/^export\b.*$/gm)) {
    const zeile = treffer[0].trim();
    if (!VERSTANDENE_EXPORTFORMEN.some((muster) => muster.test(zeile))) {
      throw new Error(
        `Der Scan versteht die Exportform nicht: ${JSON.stringify(zeile)} — bitte ergaenzen, ` +
          `statt sie stillschweigend zu uebergehen.`,
      );
    }
  }
}

/**
 * Die Funktionen einer Datei, deren Rumpf der Riegel schuetzen muss:
 * - in einem `"${DIREKTIVE}"`-MODUL jede EXPORTIERTE Funktion (dort ist jeder
 *   Export per Next-Vertrag eine erreichbare Action),
 * - dazu jede Funktion mit einer FUNKTIONSLOKALEN Direktive, exportiert oder
 *   nicht — sie wird als Prop an den Client gereicht und ist von dort ebenso
 *   erreichbar.
 */
function aktionen(quelle: string): Aktion[] {
  const maskiert = maskiere(quelle);
  const gefunden = new Map<number, Aktion>();

  if (istServerModul(quelle)) {
    // ZUERST die Gegenprobe, DANN das Sammeln: eine Exportform, die der Scan
    // nicht kennt, wuerde er sonst still uebergehen und mit „alles geprueft"
    // antworten. `export { a }`, `export * from …` und ein anonymes
    // `export default` sind alle drei gueltiges Next und alle drei eine
    // erreichbare Action — sie MUESSEN hier laut ausfallen.
    pruefeExportformen(maskiert);

    for (const treffer of maskiert.matchAll(FUNKTIONS_EXPORT)) {
      const [von, bis] = rumpfNachKopf(maskiert, treffer.index + treffer[0].length, quelle);
      gefunden.set(von, { name: treffer[1] ?? "default", rumpf: maskiert.slice(von, bis) });
    }
    for (const treffer of maskiert.matchAll(KONSTANTEN_EXPORT)) {
      const [von, bis] = rumpfNachKopf(maskiert, treffer.index + treffer[0].length, quelle);
      gefunden.set(von, { name: treffer[1], rumpf: maskiert.slice(von, bis) });
    }
  }

  for (const klammer of lokaleDirektivStellen(quelle)) {
    const [von, bis] = rumpfGrenzen(maskiert, klammer, quelle);
    gefunden.set(von, { name: nameVorRumpf(maskiert, von), rumpf: maskiert.slice(von, bis) });
  }

  return [...gefunden.values()];
}

/** Von der oeffnenden bis hinter die zugehoerige schliessende Klammer. */
function rumpfGrenzen(maskiert: string, start: number, quelle: string): [number, number] {
  if (start === -1) throw new Error("Kein Funktionsrumpf gefunden — der Scan waere sonst leer.");
  return [start, paarEnde(maskiert, start, "{", "}", quelle) + 1];
}

/**
 * Der Rumpf hinter einem Funktionskopf, dessen Parameterliste bei
 * `nachOeffnenderKlammer` schon begonnen hat.
 *
 * Die Parameterliste wird UEBERSPRUNGEN und nicht bloss nach dem naechsten `{`
 * gesucht: `function f({ a }: X) {` traegt eine geschweifte Klammer im
 * Parameter, und der Scan pruefte sonst das Destructuring-Muster als „Rumpf" —
 * gruen, ohne etwas gesehen zu haben.
 *
 * BEKANNTE GRENZE, benannt statt verschwiegen: ein INLINE-Objekttyp als
 * Rueckgabeannotation (`): { a: number } {`) fuehrt den Scan auf denselben
 * Irrweg. In dieser Datei kommt keiner vor, und ein spaeterer faellt beim
 * naechsten Mutationslauf auf — anders als das Parameter-Destructuring, das in
 * Actions ueblich ist.
 */
function rumpfNachKopf(maskiert: string, nachTreffer: number, quelle: string): [number, number] {
  // `nachTreffer - 1` ist bei einem Funktionsexport bereits die oeffnende
  // Klammer; bei `export const f = async (…) =>` liegt sie ein paar Zeichen
  // weiter. Dazwischen darf nur stehen, was der Scan LIEST — sonst ist
  // `export const ZAHL = 5;` gemeint, und die naechste Klammer irgendwo weiter
  // unten waere eine fremde Funktion.
  const klammerAuf = maskiert.indexOf("(", nachTreffer - 1);
  const zwischen = klammerAuf === -1 ? "" : maskiert.slice(nachTreffer, klammerAuf);
  if (klammerAuf === -1 || !/^\s*(?:async\s+)?(?:function\s*\w*\s*)?$/.test(zwischen)) {
    throw new Error(
      `Der Scan findet hinter dem Export keine Parameterliste, sondern ` +
        `${JSON.stringify(zwischen.slice(0, 40))} — diese Form liest er nicht.`,
    );
  }
  const klammerZu = paarEnde(maskiert, klammerAuf, "(", ")", quelle);
  const start = maskiert.indexOf("{", klammerZu);
  return rumpfGrenzen(maskiert, start, quelle);
}

/** Position der zu `start` gehoerenden schliessenden Klammer. */
function paarEnde(maskiert: string, start: number, auf: string, zu: string, quelle: string): number {
  if (start < 0 || maskiert[start] !== auf) {
    throw new Error(`Erwartet "${auf}" an Position ${start}, gefunden ${JSON.stringify(maskiert[start])}.`);
  }
  let tiefe = 0;
  for (let i = start; i < maskiert.length; i++) {
    if (maskiert[i] === auf) tiefe++;
    else if (maskiert[i] === zu) {
      tiefe--;
      if (tiefe === 0) return i;
    }
  }
  throw new Error(
    `Klammern nicht ausgeglichen ab Position ${start} — der Scan kann diesen Bereich nicht ` +
      `abgrenzen: ${quelle.slice(start, start + 60)}`,
  );
}

/**
 * Der Bezeichner links vom Rumpf. Er steht in der Fehlermeldung, damit ein
 * Fehlschlag die Funktion NENNT statt eine Position zu melden.
 *
 * Abgetragen wird von rechts: Pfeil, Rueckgabetyp, Parameterliste — was danach
 * am Ende steht, ist der Name.
 */
function nameVorRumpf(maskiert: string, start: number): string {
  let davor = maskiert.slice(Math.max(0, start - 300), start).trimEnd();
  davor = davor.replace(/=>\s*$/, "").trimEnd();
  davor = davor.replace(/:\s*[\w<>[\],.|& ]+$/, "").trimEnd();
  davor = davor.replace(/\([^()]*\)\s*$/, "").trimEnd();
  const treffer = /(?:function\s+(\w+)|(\w+)\s*=|(\w+))\s*$/.exec(davor);
  return treffer?.[1] ?? treffer?.[2] ?? treffer?.[3] ?? `anonym@${start}`;
}
