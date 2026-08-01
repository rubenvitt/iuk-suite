import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { istCookieGueltig } from "@/app/m/files/_lib/passwort";

/*
 * Prüfling: `POST /api/s/<id>/verify` — der EINE Setzweg des Entsperr-Cookies
 * (Spec §7.4, Plan T28).
 *
 * Drei Zusagen, die dieser Test besitzt, und alle drei sind in der Alt-App
 * gebrochen:
 *  1. Ein richtiges Passwort setzt ein share-gebundenes HttpOnly-Cookie. Alt:
 *     `{ ok: true }` und sonst nichts — der Schutz war Dekoration.
 *  2. Das Orakel ist geschlossen: unbekannter Share, passwortfreier Share und
 *     falsches Passwort antworten UNUNTERSCHEIDBAR 401. Alt: 404 für die ersten
 *     beiden, 401 für das dritte.
 *  3. Der Limiter greift VOR bcrypt. Alt: unbegrenzt aufrufbar, und das war der
 *     einzige Ort, an dem pro Anfrage cost-12-bcrypt gerechnet wurde.
 *
 * Gegen eine echte, migrierte Datei-DB (Muster aus `_db/queries.test.ts`):
 * `expires_at` führt Unix-SEKUNDEN (`mode: "timestamp"`), und ein
 * Millisekunden-Wert sähe in der Max-Age-Rechnung richtig aus und wäre um den
 * Faktor 1000 daneben. Geschrieben wird deshalb über Drizzle mit `Date`, nie
 * über rohes SQL.
 */

const DIR = "./.data/files-verify-test";

/** `erzeugeShareCookie` signiert mit `AUTH_SECRET` und WIRFT ohne. */
const GEHEIMNIS = "verify-test-geheimnis-lang-genug";

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

const SEK = 1000;
const STUNDE = 3600 * SEK;
const TAG = 24 * STUNDE;

/**
 * Feste Uhr — die Spalten führen Sekunden, eine laufende Uhr wäre Flackerwerk.
 *
 * Sie gilt für JEDEN Test der Datei (`beforeEach` setzt sie), und der Wert ist
 * deshalb beliebig: der Handler sieht die Wanduhr nie. Wer daran zweifelt,
 * setzt hier `1_700_000_000` ein — die Suite muss vollständig grün bleiben.
 */
const JETZT = new Date(1_800_000_000 * SEK);

/** Das Literal, NICHT `MAX_ENTSPERRUNG_SEKUNDEN` aus dem Prüfling: ein Import
 *  von dort machte jede Mutation der Grenze zugleich zur Mutation der
 *  Erwartung. */
const VIER_STUNDEN_SEKUNDEN = 14400;

const PASSWORT = "Testpasswort-2026";
const FALSCHES_PASSWORT = "Testpasswort-2027";

/** Zwei ID-Formen, wie `nanoid(10)` sie erzeugt (mit `-` und `_`). */
const SHARE_A = "V1StGXR8_Z";
const SHARE_B = "aB-dEfGh1J";
const SHARE_OHNE_PASSWORT = "cD_fGhIj2K";
const UNBEKANNT = "zZzZzZzZzZ";

/**
 * Der bcrypt-Zähler. Er trägt Punkt 4 zur Hälfte: „der 11. Versuch antwortet 429
 * OHNE bcrypt-Aufruf" ist ohne Zählung nicht belegbar — ein Handler, der erst
 * hasht und dann 429 antwortet, sähe am Statuscode gleich aus.
 *
 * `vi.hoisted`, weil die `vi.mock`-Fabrik vor allen `const`-Bindungen läuft.
 */
const { bcryptZaehler } = vi.hoisted(() => ({ bcryptZaehler: { anzahl: 0 } }));

vi.mock("@/app/m/files/_lib/passwort", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/app/m/files/_lib/passwort")>();
  return {
    ...echt,
    // Zählen, nicht ersetzen: die Prüfung bleibt die echte, sonst wäre Punkt 1
    // („richtiges Passwort → 200") gegen eine Attrappe grün.
    bcryptVerify: (passwort: string, hash: string | null | undefined) => {
      bcryptZaehler.anzahl++;
      return echt.bcryptVerify(passwort, hash);
    },
  };
});

/**
 * cost 4, NICHT `bcryptHash` (cost 12): Punkt 4 rechnet zehn Vergleiche, und mit
 * cost 12 dauerte allein dieser Test mehrere Sekunden. Die Kostenstufe steht im
 * Hash selbst — geprüft wird also genau der Weg, den auch ein cost-12-Hash
 * nimmt. Wer das auf `bcryptHash` „vereinheitlicht", macht die Suite langsamer,
 * ohne eine Aussage zu gewinnen.
 */
function hashe(passwort: string): string {
  return bcrypt.hashSync(passwort, 4);
}

beforeEach(async () => {
  bcryptZaehler.anzahl = 0;
  // Frische Modulinstanzen je Test: der `RateLimiter` des Handlers ist
  // Modulzustand, und ohne Zurücksetzen trüge Test 4 die Treffer der übrigen
  // mit sich.
  vi.resetModules();
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  // Alle drei über `stubEnv`, nicht per Zuweisung: Vitest teilt einen Worker
  // zwischen Testdateien, und ein hier gesetztes `DATA_DIR` schöbe einer
  // späteren Datei still diese Datenbank unter. `unstubAllEnvs` räumt nur, was
  // gestubt wurde.
  vi.stubEnv("DATA_DIR", DIR);
  vi.stubEnv("AUTH_SECRET", GEHEIMNIS);
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  await legeShares();
  // EINE Uhr für die ganze Datei, und zwar für JEDEN Test — nicht nur für die
  // drei des Rate-Limits. Sonst führt die Datei zwei: die Saat rechnet gegen
  // `JETZT`, ein Test ohne Fake-Timer aber gegen die Wanduhr. Das hält, solange
  // die Wanduhr vor `JETZT + 7 TAG` steht, und wird an einem Kalendertag rot,
  // ohne dass sich eine Zeile Code geändert hätte — ein Ausfall, der wie eine
  // Regression aussieht. Nachgestellt: mit `JETZT = 1_700_000_000` (in der
  // Vergangenheit) waren genau fünf Tests rot.
  // Erst NACH `legeShares()`: das Säen macht dynamische Importe und `migrate`,
  // und beides geht die echte Uhr nichts an.
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function legeShare(vorgabe: {
  id: string;
  passwordHash?: string | null;
  ablaufAt?: Date;
}): Promise<void> {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id,
      title: "Übung Nord",
      description: null,
      type: "folder",
      expiresAt: vorgabe.ablaufAt ?? new Date(JETZT.getTime() + 7 * TAG),
      maxDownloads: null,
      downloadCount: 0,
      passwordHash: vorgabe.passwordHash ?? null,
      totalSize: 0,
      createdAt: JETZT,
      createdBy: "sub-1",
    })
    .run();
}

async function legeShares(): Promise<void> {
  await legeShare({ id: SHARE_A, passwordHash: hashe(PASSWORT) });
  await legeShare({ id: SHARE_B, passwordHash: hashe(PASSWORT) });
  await legeShare({ id: SHARE_OHNE_PASSWORT, passwordHash: null });
}

type Antwort = { status: number; text: string; setCookie: string | null };

/**
 * Ein echter Aufruf des Handlers samt Host-Kopf — die Rollensperre liest ihn,
 * und ohne ihn liefe jeder Test auf der 404 des unbekannten Hosts.
 */
async function rufe(
  shareId: string,
  koerper: unknown,
  optionen: { host?: string; ip?: string; cookie?: string } = {},
): Promise<Antwort> {
  const { POST } = await import("./route");
  const kopf: Record<string, string> = { host: optionen.host ?? VERWALTUNG };
  if (optionen.ip) kopf["cf-connecting-ip"] = optionen.ip;
  if (optionen.cookie) kopf["cookie"] = optionen.cookie;
  const anfrage = new Request(`http://${kopf.host}/api/s/${shareId}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...kopf },
    body: typeof koerper === "string" ? koerper : JSON.stringify(koerper),
  });
  const antwort = await POST(anfrage, { params: Promise.resolve({ id: shareId }) });
  return {
    status: antwort.status,
    text: await antwort.text(),
    setCookie: antwort.headers.get("set-cookie"),
  };
}

/** Die Attribute eines `Set-Cookie`-Kopfes, kleingeschrieben nachgeschlagen. */
function attribut(setCookie: string, name: string): string | null {
  for (const teil of setCookie.split(";").slice(1)) {
    const [schluessel, wert] = teil.split("=");
    if (schluessel.trim().toLowerCase() === name.toLowerCase()) return (wert ?? "").trim();
  }
  return null;
}

function hatAttribut(setCookie: string, name: string): boolean {
  return setCookie
    .split(";")
    .slice(1)
    .some((teil) => teil.split("=")[0].trim().toLowerCase() === name.toLowerCase());
}

function cookieWertAus(setCookie: string): { name: string; wert: string } {
  const erstes = setCookie.split(";")[0];
  const trenner = erstes.indexOf("=");
  return { name: erstes.slice(0, trenner), wert: decodeURIComponent(erstes.slice(trenner + 1)) };
}

// ---------------------------------------------------------------------------
// 1. Richtiges Passwort → 200 und ein Cookie, das die vier Attribute trägt.
// ---------------------------------------------------------------------------

describe("richtiges Passwort", () => {
  it("antwortet 200 und setzt ein HttpOnly-Cookie mit SameSite=Lax und Path=/", async () => {
    const antwort = await rufe(SHARE_A, { password: PASSWORT });

    expect(antwort.status).toBe(200);
    const setCookie = antwort.setCookie;
    expect(setCookie).not.toBeNull();
    expect(cookieWertAus(setCookie!).name).toBe(`files_s_${SHARE_A}`);
    expect(hatAttribut(setCookie!, "HttpOnly")).toBe(true);
    expect(attribut(setCookie!, "SameSite")?.toLowerCase()).toBe("lax");
    expect(attribut(setCookie!, "Path")).toBe("/");
  });

  it("der gesetzte Wert entsperrt diesen Share wirklich", async () => {
    const antwort = await rufe(SHARE_A, { password: PASSWORT });
    const { wert } = cookieWertAus(antwort.setCookie!);

    // Die Gegenprobe zur Alt-App: dort gab es nichts, was ein Byte-Weg hätte
    // lesen können. Geprüft wird mit derselben Funktion, die Download, ZIP und
    // Vorschau benutzen.
    expect(istCookieGueltig(SHARE_A, wert)).toBe(true);
  });

  it("Max-Age ist gedeckelt: vier Stunden bei langer, die Restlaufzeit bei kurzer Frist", async () => {
    const lang = await rufe(SHARE_A, { password: PASSWORT });
    expect(Number(attribut(lang.setCookie!, "Max-Age"))).toBe(VIER_STUNDEN_SEKUNDEN);

    // Ein Share, der in 30 Minuten endet: ohne die zweite Hälfte der Deckelung
    // überlebte die Entsperrung den Share um dreieinhalb Stunden.
    const kurz = "eF-hIjKl3M";
    await legeShare({
      id: kurz,
      passwordHash: hashe(PASSWORT),
      ablaufAt: new Date(JETZT.getTime() + 30 * 60 * SEK),
    });
    const antwort = await rufe(kurz, { password: PASSWORT });
    const maxAge = Number(attribut(antwort.setCookie!, "Max-Age"));
    expect(maxAge).toBeLessThanOrEqual(30 * 60);
    expect(maxAge).toBeGreaterThan(30 * 60 - 10);
  });

  it("ein bereits abgelaufener Share gibt kein Cookie aus, sondern 401", async () => {
    // Nicht als Ablaufprüfung — die Prüfkette liegt in `_db/queries.ts`. Es gibt
    // hier schlicht keine Entsperrung zu beglaubigen, und 401 ist die Antwort,
    // die das Orakel geschlossen hält.
    const abgelaufen = "gH_jKlMn4P";
    await legeShare({
      id: abgelaufen,
      passwordHash: hashe(PASSWORT),
      ablaufAt: new Date(JETZT.getTime() - SEK),
    });

    const antwort = await rufe(abgelaufen, { password: PASSWORT });
    expect(antwort.status).toBe(401);
    expect(antwort.setCookie).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. + 3. Falsches Passwort, unbekannter Share, passwortfreier Share.
// ---------------------------------------------------------------------------

describe("das geschlossene Orakel", () => {
  it("falsches Passwort → 401 und KEIN Cookie", async () => {
    const antwort = await rufe(SHARE_A, { password: FALSCHES_PASSWORT });
    expect(antwort.status).toBe(401);
    expect(antwort.setCookie).toBeNull();
  });

  it("unbekannte ID, passwortfreier Share und falsches Passwort sind ununterscheidbar", async () => {
    const unbekannt = await rufe(UNBEKANNT, { password: PASSWORT });
    const ohnePasswort = await rufe(SHARE_OHNE_PASSWORT, { password: PASSWORT });
    const falsch = await rufe(SHARE_A, { password: FALSCHES_PASSWORT });

    // Alt: 404 für die ersten beiden. Wer die ID kannte, erfuhr damit, ob ein
    // Share existiert und ob er geschützt ist.
    expect([unbekannt.status, ohnePasswort.status, falsch.status]).toEqual([401, 401, 401]);
    expect(new Set([unbekannt.text, ohnePasswort.text, falsch.text]).size).toBe(1);
    expect([unbekannt.setCookie, ohnePasswort.setCookie, falsch.setCookie]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("ein Rumpf ohne brauchbares Passwortfeld ist ein Fehlversuch, keine vierte Antwort", async () => {
    const falsch = await rufe(SHARE_A, { password: FALSCHES_PASSWORT });
    for (const koerper of [{}, { password: 42 }, "kein json"]) {
      const antwort = await rufe(SHARE_A, koerper);
      expect(antwort.status).toBe(401);
      expect(antwort.text).toBe(falsch.text);
      expect(antwort.setCookie).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Rate-Limit: der 11. Versuch in 10 Minuten ist 429 — VOR bcrypt.
// ---------------------------------------------------------------------------

describe("Rate-Limit auf demselben ${shareId}|${ip}", () => {
  it("der 11. Versuch antwortet 429, und bcrypt lief genau zehnmal", async () => {
    // Die Uhr steht seit `beforeEach` auf `JETZT` — alle elf Anfragen fallen
    // damit in DASSELBE Fenster, und nur so ist der Zähler die Aussage.
    const versuch = () =>
      rufe(SHARE_A, { password: FALSCHES_PASSWORT }, { ip: "203.0.113.7" });

    for (let i = 0; i < 10; i++) expect((await versuch()).status).toBe(401);
    expect(bcryptZaehler.anzahl).toBe(10);

    const elfter = await versuch();
    expect(elfter.status).toBe(429);
    // Der ganze Punkt: der Limiter greift VOR dem Hash. Ein Handler, der erst
    // rechnet und dann 429 antwortet, bliebe am Statuscode allein grün.
    expect(bcryptZaehler.anzahl).toBe(10);
    expect(elfter.setCookie).toBeNull();

    // Auch das RICHTIGE Passwort kommt nicht mehr durch — sonst wäre die Sperre
    // eine Höflichkeit statt einer Sperre.
    const mitRichtigem = await rufe(SHARE_A, { password: PASSWORT }, { ip: "203.0.113.7" });
    expect(mitRichtigem.status).toBe(429);
    expect(mitRichtigem.setCookie).toBeNull();
    expect(bcryptZaehler.anzahl).toBe(10);
  });

  it("der Schlüssel ist ${shareId}|${ip}: andere IP und anderer Share sind nicht gesperrt", async () => {
    for (let i = 0; i < 10; i++) {
      await rufe(SHARE_A, { password: FALSCHES_PASSWORT }, { ip: "203.0.113.7" });
    }
    expect((await rufe(SHARE_A, { password: PASSWORT }, { ip: "203.0.113.7" })).status).toBe(429);

    // Dieselbe IP, anderer Share.
    expect((await rufe(SHARE_B, { password: PASSWORT }, { ip: "203.0.113.7" })).status).toBe(200);
    // Derselbe Share, andere IP.
    expect((await rufe(SHARE_A, { password: PASSWORT }, { ip: "203.0.113.8" })).status).toBe(200);
  });

  it("das Fenster ist zehn Minuten — nach 9:59 noch gesperrt, nach 10:01 wieder frei", async () => {
    for (let i = 0; i < 10; i++) {
      await rufe(SHARE_A, { password: FALSCHES_PASSWORT }, { ip: "203.0.113.7" });
    }
    expect((await rufe(SHARE_A, { password: PASSWORT }, { ip: "203.0.113.7" })).status).toBe(429);

    // Die UNTERE Schranke, und sie ist die sicherheitsrelevante: bei einem zu
    // KURZEN Fenster findet jede Anfrage ein leeres Fenster vor, der Limiter
    // sammelt über echte Zeit nie an, und `verify` ist wieder der
    // Rechenlast-Verstärker mit cost-12-bcrypt. Alle elf Anfragen oben laufen
    // auf DERSELBEN Fake-Zeit — dort geht die Fensterlänge gar nicht ein, ein
    // 1-ms-Fenster bliebe ohne diesen Schritt unbemerkt.
    // Der Aufruf verbraucht nichts: `RateLimiter.check` gibt bei erreichtem
    // Limit `false` zurück, OHNE den Treffer zu pushen (`core/ratelimit.ts`) —
    // der Schritt darunter sieht weiterhin nur die ursprünglichen zehn Treffer.
    vi.setSystemTime(new Date(JETZT.getTime() + 9 * 60 * SEK + 59 * SEK));
    expect((await rufe(SHARE_A, { password: PASSWORT }, { ip: "203.0.113.7" })).status).toBe(429);

    // Die OBERE Schranke: das Fenster ist zehn Minuten, nicht zehn Stunden —
    // eine vergessene Passworteingabe darf niemanden für den Rest des Tages
    // aussperren.
    vi.setSystemTime(new Date(JETZT.getTime() + 10 * 60 * SEK + SEK));
    expect((await rufe(SHARE_A, { password: PASSWORT }, { ip: "203.0.113.7" })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 5. Share-Bindung des Cookies.
// ---------------------------------------------------------------------------

describe("das Cookie ist an SEINEN Share gebunden", () => {
  it("der Wert für Share A entsperrt Share B nicht", async () => {
    const antwort = await rufe(SHARE_A, { password: PASSWORT });
    const { wert } = cookieWertAus(antwort.setCookie!);

    // Cookie-Namen wählt der Client: ein Wert von A erreicht uns jederzeit unter
    // dem Namen von B. Die Bindung muss deshalb im signierten Wert stecken.
    expect(istCookieGueltig(SHARE_B, wert)).toBe(false);
    expect(istCookieGueltig(SHARE_A, wert)).toBe(true);
  });

  it("ein mitgeschicktes gültiges Cookie ersetzt das Passwort nicht", async () => {
    const echt = await rufe(SHARE_A, { password: PASSWORT });
    const { name, wert } = cookieWertAus(echt.setCookie!);

    const antwort = await rufe(
      SHARE_A,
      { password: FALSCHES_PASSWORT },
      { cookie: `${name}=${encodeURIComponent(wert)}` },
    );
    expect(antwort.status).toBe(401);
    expect(antwort.setCookie).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Rollensperre — erste Anweisung des Handlers.
// ---------------------------------------------------------------------------

describe("Rollensperre", () => {
  it("auf dem Inbox-Host antwortet die Route 404 — ohne bcrypt und ohne Cookie", async () => {
    const antwort = await rufe(SHARE_A, { password: PASSWORT }, { host: INBOX });
    expect(antwort.status).toBe(404);
    expect(antwort.setCookie).toBeNull();
    // Die Sperre ist die ERSTE Anweisung: ein Handler, der erst prüft und dann
    // 404 antwortet, wäre auf dem falschen Host ein Rechenlast-Verstärker.
    expect(bcryptZaehler.anzahl).toBe(0);
  });

  it("ein unbekannter Host antwortet ebenfalls 404", async () => {
    const antwort = await rufe(SHARE_A, { password: PASSWORT }, { host: "beliebig.example" });
    expect(antwort.status).toBe(404);
    expect(bcryptZaehler.anzahl).toBe(0);
  });
});
