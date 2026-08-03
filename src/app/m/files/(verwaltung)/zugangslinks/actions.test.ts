import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/*
 * WAS DIESE DATEI BESITZT (Spec §4.7, §8.4, §8.6; Plan T30):
 *
 *  - dass ein Abgabelink nur mit 1–72 GANZEN Stunden entsteht,
 *  - dass der Rohtoken EINMAL zurueckkommt und in der Zeile NICHT steht,
 *  - dass `token_hash` UNIQUE traegt und ein zweiter Eintrag scheitert,
 *  - dass das Kontingent DERSELBEN Zeile aufstockbar und auf gueltige, nicht
 *    widerrufene Links beschraenkt ist,
 *  - dass Widerrufen die Zeile stehen laesst und die `token_id`-Bezuege haelt,
 *  - dass ohne Zugang keine der drei Actions etwas schreibt.
 *
 * WARUM IN FAST JEDER SCHREIBPROBE ZWEI LINKS LIEGEN: mit nur EINEM gueltigen
 * Link kann keine Zusicherung „trifft DIESELBE Zeile" von „trifft IRGENDEINE
 * Zeile" unterscheiden — ein `UPDATE`, dem `id` im `WHERE` fehlt, traefe dann
 * genau eine Zeile, meldete `changes === 1` und bliebe gruen. Der Nachbar-Link
 * ist bewusst GUELTIG (nicht widerrufen, nicht abgelaufen), denn nur so steht
 * er im Trefferbereich der uebrigen Bedingungen.
 *
 * Gegen eine echte, migrierte Datei-DB — nicht gegen ein Mock: die
 * UNIQUE-Zusage, die bedingten UPDATEs und die Sekunden-Zeitstempel
 * (`mode: "timestamp"`) sind gegen ein Mock gruen, ohne zu gelten. Gelesen wird
 * ROH ueber better-sqlite3, nie ueber Drizzle: der Rundlauf buegelte den
 * Faktor-1000-Fehler glatt (`_db/schema.ts:4-13`).
 *
 * Muster der Vorrichtung aus `_db/queries.test.ts`: DATA_DIR setzen, migrieren,
 * `globalThis.__suiteDb` verwerfen, Code unter Test DYNAMISCH importieren.
 */

const DIR = "./.data/files-zugangslinks-actions-test";

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

/*
 * `erzeugeToken` bleibt ECHT und wird nur im Kollisionsfall festgenagelt. Ein
 * dateiweit fester Token liesse schon die Vorrichtungen zweier Links in den
 * UNIQUE-Index laufen — Fehlschlaege, die wie Defekte in `aufstocken` und
 * `widerrufen` aussehen und keine sind.
 */
vi.mock("@/app/m/files/_lib/token", async (echt) => {
  const original = await echt<typeof import("@/app/m/files/_lib/token")>();
  return {
    ...original,
    erzeugeToken: vi.fn((...args) => original.erzeugeToken(...args)),
    tokenHash: vi.fn((token: string) => original.tokenHash(token)),
  };
});

import { auth } from "@/core/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { erzeugeToken, tokenHash } from "@/app/m/files/_lib/token";

const authMock = vi.mocked(auth);
const erzeugeTokenMock = vi.mocked(erzeugeToken);
const tokenHashMock = vi.mocked(tokenHash);
const revalidatePathMock = vi.mocked(revalidatePath);

/** Die Gruppe aus `core/registry.ts:88` — die einzige Stufe des Moduls (§2.4). */
const GRUPPE = "iuk-files-admin";

const STUNDE_SEKUNDEN = 3600;

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  vi.stubEnv("DATA_DIR", DIR);
  // Die drei Pflichtzahlen aus §9.3; ohne sie wirft `grenzen()` schon beim
  // Lesen der Vorbelegungen, und jede Ablehnung saehe wie eine Validierung aus.
  vi.stubEnv("FILES_MAX_DATEI_BYTES", "12582912");
  vi.stubEnv("FILES_AV_MAX_BYTES", "12582912");
  vi.stubEnv("FILES_MAX_ABLAUF_TAGE", "7");
  vi.stubEnv("FILES_INBOX_BUDGET_DATEIEN", "100");
  vi.stubEnv("FILES_INBOX_BUDGET_BYTES", "2147483648");

  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  authMock.mockReset();
  // `mockReset` und NICHT `mockClear`: `mockClear` loescht nur die Aufrufliste
  // und liesse ein in einem Test gesetztes `mockReturnValue` in alle folgenden
  // Tests durchsickern — bei `tokenHash` waere das ein `null` fuer jede weitere
  // Zeile. `vi.fn(impl)` bekommt durch `mockReset` seine Durchreiche zurueck.
  erzeugeTokenMock.mockReset();
  tokenHashMock.mockReset();
  revalidatePathMock.mockClear();
  vi.mocked(headers).mockResolvedValue(new Headers({ host: "files.localtest.me" }) as never);
  alsBerechtigt();
});

afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

function alsBerechtigt(sub = "sub-1"): void {
  authMock.mockResolvedValue({ user: { id: sub, groups: [GRUPPE] } } as never);
}

function fd(eintraege: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(eintraege)) f.set(k, v);
  return f;
}

async function anlegen(eintraege: Record<string, string> = {}) {
  const { zugangslinkAnlegenAction } = await import(
    "@/app/m/files/(verwaltung)/zugangslinks/actions"
  );
  return zugangslinkAnlegenAction(
    { ok: false, fieldErrors: {}, values: {} },
    fd({ name: "Übung Nord 30.07.", laufzeitStunden: "24", ...eintraege }),
  );
}

async function aufstocken(eintraege: Record<string, string>) {
  const { kontingentAufstockenAction } = await import(
    "@/app/m/files/(verwaltung)/zugangslinks/actions"
  );
  return kontingentAufstockenAction({ ok: true }, fd(eintraege));
}

async function widerrufen(eintraege: Record<string, string>) {
  const { zugangslinkWiderrufenAction } = await import(
    "@/app/m/files/(verwaltung)/zugangslinks/actions"
  );
  return zugangslinkWiderrufenAction({ ok: true }, fd(eintraege));
}

/** ROH, nie ueber Drizzle: `mode: "timestamp"` rechnete den Faktor 1000 weg. */
function rohZeilen(): Record<string, unknown>[] {
  const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
  const zeilen = sqlite
    .prepare("SELECT * FROM zugangslinks ORDER BY rowid")
    .all() as Record<string, unknown>[];
  sqlite.close();
  return zeilen;
}

function rohZeile(id?: string): Record<string, unknown> {
  const zeilen = rohZeilen();
  const zeile = id ? zeilen.find((z) => z.id === id) : zeilen[0];
  if (!zeile) throw new Error(`Vorrichtung: keine Zeile ${id ?? "(erste)"} in zugangslinks`);
  return zeile;
}

/** Ein fertiger Link OHNE die Action — fuer `aufstocken` und `widerrufen`. */
async function legeLink(vorgabe: {
  id: string;
  ablaufAt?: Date;
  revokedAt?: Date | null;
  budgetDateien?: number;
  budgetBytes?: number;
  verbrauchtDateien?: number;
  verbrauchtBytes?: number;
}) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { zugangslinks } = await import("@/app/m/files/_db/schema");
  getDb()
    .insert(zugangslinks)
    .values({
      id: vorgabe.id,
      name: `Link ${vorgabe.id}`,
      tokenStart: `dz-${vorgabe.id.slice(-4)}`,
      tokenHash: `HASH-${vorgabe.id}`,
      createdAt: new Date(),
      createdBy: "sub-1",
      expiresAt: vorgabe.ablaufAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      revokedAt: vorgabe.revokedAt ?? null,
      budgetDateien: vorgabe.budgetDateien ?? 100,
      budgetBytes: vorgabe.budgetBytes ?? 1_000_000,
      verbrauchtDateien: vorgabe.verbrauchtDateien ?? 0,
      verbrauchtBytes: vorgabe.verbrauchtBytes ?? 0,
    })
    .run();
}

async function legeUpload(id: string, tokenId: string) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { inboxFiles } = await import("@/app/m/files/_db/schema");
  getDb()
    .insert(inboxFiles)
    .values({
      id,
      tokenId,
      dateiname: "Übung_Größe.pdf",
      size: 17,
      empfangenAt: new Date(),
      avStatus: "clean",
    })
    .run();
}

function tokenIdVon(uploadId: string): string | null {
  const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
  const zeile = sqlite.prepare("SELECT token_id AS t FROM inbox_files WHERE id = ?").get(uploadId) as
    | { t: string | null }
    | undefined;
  sqlite.close();
  return zeile?.t ?? null;
}

// ---------------------------------------------------------------------------
// 1. Laufzeit: 1–72 GANZE Stunden
// ---------------------------------------------------------------------------

describe("zugangslinkAnlegenAction — Laufzeit in ganzen Stunden, 1 bis 72 (§8.6)", () => {
  /*
   * `1.5` und `73` sind die beiden Enden der Zusage. `0x10` und `1e1` stehen
   * dabei, weil `Number()` sie zu 16 und 10 macht — die in `grenzen.ts:196-199`
   * ausgeschriebene Falle: die geltende Grenze waere eine andere als die
   * eingegebene, und zwar still.
   */
  it.each(["0", "73", "1.5", "-1", "", "   ", "abc", "0x10", "1e1", "72.0", "+24"])(
    "Laufzeit %j wird abgelehnt, und es entsteht KEINE Zeile",
    async (laufzeitStunden) => {
      const ergebnis = await anlegen({ laufzeitStunden });
      expect(ergebnis.ok).toBe(false);
      if (!ergebnis.ok) expect(ergebnis.fieldErrors.laufzeitStunden).toBeTruthy();
      expect(rohZeilen()).toHaveLength(0);
    },
  );

  it.each([1, 72])(
    "Laufzeit %i Stunden wird angenommen, und expires_at liegt genau so weit hinter created_at",
    async (stunden) => {
      const ergebnis = await anlegen({ laufzeitStunden: String(stunden) });
      expect(ergebnis.ok).toBe(true);

      const zeile = rohZeile();
      const angelegt = zeile.created_at as number;
      const ablauf = zeile.expires_at as number;

      // DIE Zusage gegen den Faktor 1000: die DIFFERENZ ist exakt, unabhaengig
      // von der Wanduhr. `* 3_600_000` ergaebe 3.600.000, eine Sekundenrechnung
      // auf `getTime()` ergaebe 3,6 — beides faellt hier auf.
      expect(ablauf - angelegt).toBe(stunden * STUNDE_SEKUNDEN);
      // Und die Groessenordnung selbst: Sekunden sind 10-stellig, Millisekunden
      // 13-stellig. Ohne diese Zeile waere eine Zeile, in der BEIDE Spalten in
      // Millisekunden stehen, mit der Differenz oben vereinbar.
      expect(String(angelegt)).toHaveLength(10);
      expect(String(ablauf)).toHaveLength(10);
      expect(Math.abs(angelegt - Math.floor(Date.now() / 1000))).toBeLessThan(60);
    },
  );

  it("Leerzeichen um die Laufzeit sind kein Fehler", async () => {
    const ergebnis = await anlegen({ laufzeitStunden: " 24 " });
    expect(ergebnis.ok).toBe(true);
    const zeile = rohZeile();
    expect((zeile.expires_at as number) - (zeile.created_at as number)).toBe(24 * STUNDE_SEKUNDEN);
  });

  it("ein Name aus Leerzeichen wird abgelehnt, und es entsteht KEINE Zeile", async () => {
    const ergebnis = await anlegen({ name: "   " });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fieldErrors.name).toBeTruthy();
    expect(rohZeilen()).toHaveLength(0);
  });

  it("der Name wird getrimmt gespeichert, `created_by` traegt den `sub`", async () => {
    alsBerechtigt("sub-42");
    await anlegen({ name: "  Übung Nord 30.07.  " });
    const zeile = rohZeile();
    expect(zeile.name).toBe("Übung Nord 30.07.");
    expect(zeile.created_by).toBe("sub-42");
  });

  it("ohne Budgetangaben gelten die Vorbelegungen aus §9.3", async () => {
    await anlegen();
    const zeile = rohZeile();
    expect(zeile.budget_dateien).toBe(100);
    expect(zeile.budget_bytes).toBe(2147483648);
    expect(zeile.verbraucht_dateien).toBe(0);
    expect(zeile.verbraucht_bytes).toBe(0);
    expect(zeile.revoked_at).toBeNull();
  });

  /*
   * BEIDE Budgetfelder, nicht nur `budgetDateien`. Dass heute derselbe Helfer
   * `zahl` beide prueft, ist ein Symmetrie-Argument und keine Zusicherung: eine
   * eines Tages auf `min: 0` zurueckrutschende Grenze liesse einen Link mit
   * `budget_bytes = 0` entstehen, der in der Liste gueltig aussieht und keine
   * einzige Datei annimmt.
   */
  it.each(
    ["budgetDateien", "budgetBytes"].flatMap((feld) =>
      ["0", "-5", "2.5", "abc"].map((wert) => [feld, wert] as [string, string]),
    ),
  )("Budget %s=%j wird abgelehnt, und es entsteht KEINE Zeile", async (feld, wert) => {
    const ergebnis = await anlegen({ [feld]: wert });
    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.fieldErrors[feld]).toBeTruthy();
    expect(rohZeilen()).toHaveLength(0);
  });

  it("nach erfolgreichem Anlegen wird die Liste aufgefrischt", async () => {
    // Ohne diese Zusicherung waere der Rumpf von `auffrischen()` ersatzlos
    // streichbar — und die Liste zeigte nach dem Anlegen den alten Stand.
    expect((await anlegen()).ok).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/files", "layout");
  });

  it("nach einer Ablehnung wird NICHT aufgefrischt", async () => {
    expect((await anlegen({ laufzeitStunden: "0" })).ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Der Rohtoken: einmal zurueck, nie gespeichert
// ---------------------------------------------------------------------------

describe("zugangslinkAnlegenAction — der Rohtoken kommt EINMAL zurueck (§4.7)", () => {
  it("liefert den vollen Token in kanonischer Form", async () => {
    const ergebnis = await anlegen();
    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(ergebnis.token).toMatch(
      /^dz-[23456789abcdefghijkmnpqrstuvwxyz]{4}-[23456789abcdefghijkmnpqrstuvwxyz]{4}-[23456789abcdefghijkmnpqrstuvwxyz]{4}$/,
    );
    expect(ergebnis.id).toHaveLength(10);
  });

  it("in der Zeile steht `token_start` — SIEBEN Zeichen, ohne haengenden Bindestrich", async () => {
    const ergebnis = await anlegen();
    if (!ergebnis.ok) throw new Error("Vorrichtung: Anlegen misslungen");

    const zeile = rohZeile();
    // `dz-` plus VIER Geheimzeichen (§4.7 im Wortlaut, `_lib/token.ts:50-56`).
    // `slice(0, 8)` ergaebe `dz-2345-` mit haengendem Bindestrich und ein achtes
    // Zeichen ohne Aussage; `_db/migrations.test.ts:443` setzt dieselben sieben.
    expect(zeile.token_start).toBe(ergebnis.token.slice(0, 7));
    expect(String(zeile.token_start)).not.toMatch(/-$/);
  });

  it("der REST des Tokens steht nirgends in der Zeile, und der Hash ist nicht der Token", async () => {
    const ergebnis = await anlegen();
    if (!ergebnis.ok) throw new Error("Vorrichtung: Anlegen misslungen");

    const zeile = rohZeile();
    const alsText = JSON.stringify(zeile);
    // Der „grep ueber die Zeile" aus T30 Punkt 2: die acht Geheimzeichen hinter
    // `token_start` duerfen in KEINER Spalte auftauchen.
    expect(ergebnis.token.slice(7)).toHaveLength(10);
    expect(alsText).not.toContain(ergebnis.token.slice(7));
    expect(alsText).not.toContain(ergebnis.token);
    expect(zeile.token_hash).not.toBe(ergebnis.token);
  });

  it("der gespeicherte Hash loest den Token auf — genau eine Zeile", async () => {
    const ergebnis = await anlegen();
    if (!ergebnis.ok) throw new Error("Vorrichtung: Anlegen misslungen");

    // Das ist die Zusage, an der der Upload-Weg (T31) haengt: er kennt nur den
    // eingetippten Token und sucht `token_hash`. Ein anders gebildeter Hash
    // waere hier still, und JEDE Abgabe liefe ins 401.
    const sqlite = new Database(`${DIR}/files.db`, { readonly: true });
    const treffer = sqlite
      .prepare("SELECT id FROM zugangslinks WHERE token_hash = ?")
      .all(tokenHash(ergebnis.token));
    sqlite.close();
    expect(treffer).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. token_hash ist UNIQUE
// ---------------------------------------------------------------------------

describe("zugangslinkAnlegenAction — `token_hash` ist UNIQUE (§4.9)", () => {
  it("ein zweiter Eintrag mit demselben Hash schlaegt fehl, und es bleibt EINE Zeile", async () => {
    // Kollision festgenagelt statt erhofft: bei 60 Bit Entropie tritt sie im
    // Test nie ein, und ohne sie waere der UNIQUE-Index eine unbelegte Zusage.
    erzeugeTokenMock.mockReturnValue("dz-2345-6789-abcd");

    const erste = await anlegen({ name: "Erster" });
    expect(erste.ok).toBe(true);

    // Laut, nicht still: ein stiller zweiter Link mit demselben Hash waere ein
    // Mehrtreffer beim Aufloesen im Upload-Weg.
    await expect(anlegen({ name: "Zweiter" })).rejects.toThrow(/Abgabelink/);
    expect(rohZeilen()).toHaveLength(1);
    expect(rohZeile().name).toBe("Erster");
  });

  it("ein ANDERER Constraint-Fehler wird nicht als Token-Kollision ausgegeben", async () => {
    /*
     * Eingespeist, weil es heute keinen erreichbaren Weg dorthin gibt:
     * `zugangslinks` traegt weder CHECK noch FK, und alle NOT-NULL-Spalten
     * werden gefuellt. Genau deshalb ist die Zusage sonst unbesessen — eine
     * Pruefung auf `startsWith("SQLITE_CONSTRAINT")` finge JEDE Constraint-
     * Klasse mit und riete dem Betreiber zum WIEDERHOLEN eines Fehlers, den
     * Wiederholen nicht besser macht. Der Wortlaut des Fehlers muss die
     * Ursache tragen.
     */
    tokenHashMock.mockReturnValue(null as unknown as string);

    const fehler = await anlegen().then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(fehler?.message).toMatch(/NOT NULL/i);
    expect(fehler?.message).not.toMatch(/bereits vergeben/);
    expect(rohZeilen()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Kontingent aufstocken
// ---------------------------------------------------------------------------

describe("kontingentAufstockenAction — dieselbe Zeile, nur gueltige Links (§8.4)", () => {
  it("erhoeht `budget_dateien` und `budget_bytes` DERSELBEN Zeile — und nur dieser", async () => {
    await legeLink({ id: "zl00000001", budgetDateien: 100, budgetBytes: 1000, verbrauchtDateien: 7 });
    // Der NACHBAR ist gueltig und nicht widerrufen, liegt also im Trefferbereich
    // aller uebrigen WHERE-Bedingungen. Nur er trennt „dieselbe Zeile" von
    // „irgendeine Zeile".
    await legeLink({ id: "zl00000009", budgetDateien: 42, budgetBytes: 4242 });
    const vorher = rohZeile("zl00000001");

    const ergebnis = await aufstocken({
      id: "zl00000001",
      zusatzDateien: "50",
      zusatzBytes: "2000",
    });
    expect(ergebnis.ok).toBe(true);

    const nachher = rohZeile("zl00000001");
    expect(nachher.budget_dateien).toBe(150);
    expect(nachher.budget_bytes).toBe(3000);
    // „derselben Zeile": der gedruckte Code bleibt gueltig, der Verbrauch
    // unangetastet. Eine Fassung, die loescht und neu anlegt, faellt hier auf.
    expect(nachher.id).toBe(vorher.id);
    expect(nachher.token_hash).toBe(vorher.token_hash);
    expect(nachher.token_start).toBe(vorher.token_start);
    expect(nachher.expires_at).toBe(vorher.expires_at);
    expect(nachher.verbraucht_dateien).toBe(7);

    const nachbar = rohZeile("zl00000009");
    expect(nachbar.budget_dateien).toBe(42);
    expect(nachbar.budget_bytes).toBe(4242);
    expect(rohZeilen()).toHaveLength(2);

    expect(revalidatePathMock).toHaveBeenCalledWith("/m/files", "layout");
  });

  it("nur eine der beiden Zahlen genuegt — die andere bleibt unveraendert", async () => {
    await legeLink({ id: "zl00000002", budgetDateien: 10, budgetBytes: 1000 });
    expect((await aufstocken({ id: "zl00000002", zusatzDateien: "5" })).ok).toBe(true);
    expect(rohZeile("zl00000002").budget_dateien).toBe(15);
    expect(rohZeile("zl00000002").budget_bytes).toBe(1000);
  });

  it.each([
    ["mit Nullen", { zusatzDateien: "0", zusatzBytes: "0" }],
    // Der Fall, der die eigentliche Falle trifft: BEIDE Felder leer laufen an
    // jeder Feldpruefung vorbei, und `budget + 0` ist fuer SQLite eine
    // GEAENDERTE Zeile — `changes === 1` meldete Erfolg fuer einen Vorgang, der
    // nichts getan hat.
    ["mit leeren Feldern", { zusatzDateien: "", zusatzBytes: "" }],
    ["ganz ohne die Felder", {}],
  ])("ohne jeden Zuwachs wird abgelehnt (%s)", async (_wie, felder) => {
    await legeLink({ id: "zl00000003", budgetDateien: 10, budgetBytes: 1000 });
    const ergebnis = await aufstocken({ id: "zl00000003", ...felder });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeile("zl00000003").budget_dateien).toBe(10);
    expect(rohZeile("zl00000003").budget_bytes).toBe(1000);
  });

  it("ein WIDERRUFENER Link wird abgelehnt, und nichts aendert sich", async () => {
    await legeLink({ id: "zl00000004", budgetDateien: 10, revokedAt: new Date() });
    const ergebnis = await aufstocken({ id: "zl00000004", zusatzDateien: "5" });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeile("zl00000004").budget_dateien).toBe(10);
  });

  it("ein ABGELAUFENER Link wird abgelehnt, und nichts aendert sich", async () => {
    await legeLink({
      id: "zl00000005",
      budgetDateien: 10,
      ablaufAt: new Date(Date.now() - 60_000),
    });
    const ergebnis = await aufstocken({ id: "zl00000005", zusatzDateien: "5" });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeile("zl00000005").budget_dateien).toBe(10);
  });

  it("eine unbekannte id wird abgelehnt, ohne etwas anzulegen", async () => {
    const ergebnis = await aufstocken({ id: "gibtesnich", zusatzDateien: "5" });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeilen()).toHaveLength(0);
  });

  it("eine unbekannte id ruehrt den einzigen gueltigen Link NICHT an", async () => {
    // Das Szenario aus dem Betrieb: ein veraltetes Formular schickt eine fremde
    // `id`, waehrend genau EIN gueltiger Link existiert. Ohne `id` im WHERE
    // meldete die Action `changes === 1` — Erfolg, und aufgestockt waere das
    // Budget des FALSCHEN Links.
    await legeLink({ id: "zl00000007", budgetDateien: 10, budgetBytes: 1000 });
    const ergebnis = await aufstocken({ id: "gibtesnich", zusatzDateien: "5", zusatzBytes: "9" });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeile("zl00000007").budget_dateien).toBe(10);
    expect(rohZeile("zl00000007").budget_bytes).toBe(1000);
    expect(rohZeilen()).toHaveLength(1);
    // Nichts geaendert heisst auch: nichts aufzufrischen.
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["-5", "2.5", "abc", "0x10"])(
    "Zusatz %j wird abgelehnt, und nichts aendert sich",
    async (zusatzDateien) => {
      await legeLink({ id: "zl00000006", budgetDateien: 10 });
      const ergebnis = await aufstocken({ id: "zl00000006", zusatzDateien });
      expect(ergebnis.ok).toBe(false);
      expect(rohZeile("zl00000006").budget_dateien).toBe(10);
    },
  );
});

// ---------------------------------------------------------------------------
// 5. Widerrufen
// ---------------------------------------------------------------------------

describe("zugangslinkWiderrufenAction — Widerruf ist KEIN Zeilenloeschen (§8.6)", () => {
  it("setzt `revoked_at` in SEKUNDEN, laesst die Zeile stehen und den Nachbarn gueltig", async () => {
    await legeLink({ id: "zl00000010", budgetDateien: 10, verbrauchtDateien: 3 });
    // Der zweite, ebenfalls gueltige Link: ohne ihn traefe ein WHERE ohne `id`
    // genau eine Zeile und bliebe unbemerkt.
    await legeLink({ id: "zl00000019" });
    const ergebnis = await widerrufen({ id: "zl00000010" });
    expect(ergebnis.ok).toBe(true);

    expect(rohZeilen()).toHaveLength(2);
    expect(rohZeile("zl00000019").revoked_at).toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith("/m/files", "layout");
    const zeile = rohZeile("zl00000010");
    const widerrufen_at = zeile.revoked_at as number;
    expect(String(widerrufen_at)).toHaveLength(10);
    expect(Math.abs(widerrufen_at - Math.floor(Date.now() / 1000))).toBeLessThan(60);
    // Der Rest der Zeile bleibt unangetastet — sonst waere „widerrufen" ein
    // Zuruecksetzen mit anderem Namen.
    expect(zeile.budget_dateien).toBe(10);
    expect(zeile.verbraucht_dateien).toBe(3);
  });

  it("die `token_id`-Bezuege der Uploads bleiben erhalten", async () => {
    await legeLink({ id: "zl00000011" });
    await legeUpload("ib00000001", "zl00000011");

    expect((await widerrufen({ id: "zl00000011" })).ok).toBe(true);

    // Genau das ist der Grund fuer `revoked_at` statt DELETE: `drop` loescht die
    // Zeile, und mit ihr verschwaende die Zuordnung der schon empfangenen
    // Dateien (§8.6).
    expect(tokenIdVon("ib00000001")).toBe("zl00000011");
  });

  it("ein zweiter Widerruf wird abgelehnt und ueberschreibt den Zeitpunkt nicht", async () => {
    const frueher = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await legeLink({ id: "zl00000012", revokedAt: frueher });
    const ergebnis = await widerrufen({ id: "zl00000012" });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeile("zl00000012").revoked_at).toBe(Math.floor(frueher.getTime() / 1000));
  });

  it("ein ABGELAUFENER Link ist weiterhin widerrufbar", async () => {
    // Widerrufen ist eine Zustandsmarke, keine Wirkung auf die Laufzeit: wer
    // einen Link abschaltet, will das auch nach Ablauf nachvollziehbar haben.
    await legeLink({ id: "zl00000013", ablaufAt: new Date(Date.now() - 60_000) });
    expect((await widerrufen({ id: "zl00000013" })).ok).toBe(true);
    expect(rohZeile("zl00000013").revoked_at).not.toBeNull();
  });

  it("eine unbekannte id wird abgelehnt", async () => {
    const ergebnis = await widerrufen({ id: "gibtesnich" });
    expect(ergebnis.ok).toBe(false);
  });

  it("eine unbekannte id widerruft den einzigen gueltigen Link NICHT", async () => {
    // Derselbe Betriebsfall wie beim Aufstocken: eine fremde `id` bei genau
    // einem gueltigen Link. Ohne `id` im WHERE waere der FALSCHE Link
    // abgeschaltet — mit Erfolgsmeldung.
    await legeLink({ id: "zl00000014" });
    const ergebnis = await widerrufen({ id: "gibtesnich" });
    expect(ergebnis.ok).toBe(false);
    expect(rohZeile("zl00000014").revoked_at).toBeNull();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Ohne Zugang weist JEDE der drei Actions ab
// ---------------------------------------------------------------------------

describe("ohne Zugang weisen alle drei Actions ab (§2.4)", () => {
  /*
   * Der Riegel steht VOR jedem Lesen der Nutzlast. Beide Zweige werden
   * unterschieden, weil sie verschiedene Zusagen tragen: anonym → Anmeldung
   * (`redirect`), eingeloggt ohne Gruppe → `notFound()`, NICHT 403 (die Existenz
   * der Route wird nicht verraten). Ein blosses `.rejects.toThrow()` waere auch
   * dann gruen, wenn die Action an einer unerwarteten Stelle gescheitert waere.
   */
  const faelle: [string, unknown, string][] = [
    ["anonym", null, "NEXT_REDIRECT"],
    ["eingeloggt ohne Gruppe", { user: { id: "sub-9", groups: [] } }, "NEXT_NOT_FOUND"],
    [
      "eingeloggt mit fremder Gruppe",
      { user: { id: "sub-9", groups: ["iuk-qr-admin"] } },
      "NEXT_NOT_FOUND",
    ],
  ];

  it.each(faelle)("%s darf nicht anlegen", async (_rolle, session, meldung) => {
    authMock.mockResolvedValue(session as never);
    await expect(anlegen()).rejects.toThrow(meldung);
    expect(rohZeilen()).toHaveLength(0);
  });

  it.each(faelle)("%s darf nicht aufstocken", async (_rolle, session, meldung) => {
    await legeLink({ id: "zl00000020", budgetDateien: 10 });
    authMock.mockResolvedValue(session as never);
    await expect(aufstocken({ id: "zl00000020", zusatzDateien: "5" })).rejects.toThrow(meldung);
    expect(rohZeile("zl00000020").budget_dateien).toBe(10);
  });

  it.each(faelle)("%s darf nicht widerrufen", async (_rolle, session, meldung) => {
    await legeLink({ id: "zl00000021" });
    authMock.mockResolvedValue(session as never);
    await expect(widerrufen({ id: "zl00000021" })).rejects.toThrow(meldung);
    expect(rohZeile("zl00000021").revoked_at).toBeNull();
  });
});
