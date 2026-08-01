import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

import { auth } from "@/core/auth";
import { anlegenAction } from "@/app/m/files/(verwaltung)/actions";

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
    expect(gezaehlt).toContain("anlegenAction");
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
