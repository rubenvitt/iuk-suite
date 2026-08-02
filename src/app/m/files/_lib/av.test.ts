/**
 * T11 — der Scanner-Vertrag des Moduls `files` (Spec §6.2–§6.4, §6.8; Plan T11).
 *
 * Warum diese Suite gegen einen ECHTEN `net.createServer` laeuft und nicht gegen
 * einen Stub: drops zwei Tests decken genau den Pfad ab, in dem ihr Stub
 * INNERHALB einer async-Funktion wirft — das ist ein echtes `reject` und
 * harmlos. Der toedliche Pfad ist der andere: `parseResponse` wirft im
 * `socket.on('end')`-Callback (`antivirus.js:11-26,56-58`), also ausserhalb der
 * synchronen Ausfuehrung des Promise-Konstruktors. Daraus wird keine Rejection,
 * sondern eine uncaught exception; das Promise settelt NIE, und im Monolithen
 * reisst das `portal`, `qr` und `feedback` mit. Ein Stub kann diesen Unterschied
 * nicht herstellen, ein Socket schon.
 *
 * Deshalb bezeugt jede Zeile hier eine Aussage, die ohne Socket keine waere:
 *
 * - Der SERVER ist der Zeuge fuer `socket.destroy()`. Ein doppeltes `resolve`
 *   ist in JavaScript unbeobachtbar — „genau ein Ergebnis" liesse sich am
 *   Promise nicht falsifizieren. Beobachtbar ist dagegen, dass der Server das
 *   Verbindungsende sieht, und zwar in JEDEM Ausgang (clean, infected, error,
 *   Zeitgrenze). Wer `destroy()` aus einem Ausgang entfernt, faerbt genau eine
 *   dieser Zeilen rot.
 * - `ausfaelle` ist der Zeuge fuer „der Prozess lebt danach". Die Suite haengt
 *   sich selbst an `uncaughtException`/`unhandledRejection`; ein Wurf in einem
 *   Socket-Handler landet dort und nicht in einem gruenen Balken.
 * - Die Zeitgrenze wird MIT Dauer geprueft. Ohne die Dauer waere ein
 *   `{art:"error"}`, das sofort zurueckkommt, von der Zusage nicht zu
 *   unterscheiden.
 *
 * Warum der Netzhaken aus `src/instrumentation.ts` hier mitgeprueft wird: er ist
 * die ZWEITE Linie desselben Vertrags (§6.4) und gehoert demselben Task. Eine
 * eigene Testdatei dafuer waere eine zweite Stelle mit derselben Aussage.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "../_db/schema";
import {
  AV_STATUS,
  arbeiteAvWarteschlangeAb,
  istFreigegeben,
  reiheAvEin,
  scanne,
  starteAvArbeiter,
  stoppeAvArbeiter,
  type AvStatus,
} from "./av";
import { scanPfad, type BlobZiel } from "./storage";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..", "..", "..", "..");

/** Zwei nanoid(10) — `_lib/storage.ts` laesst nur dieses Muster in einen Pfad. */
const ZIEL: BlobZiel = { art: "share", shareId: "AbCdEfGhIj", fileId: "0123456789" };

/**
 * Die drei Pflichtzahlen aus §9.3; ohne sie kaeme `grenzen()` gar nicht durch.
 * Die Groesse ist nicht beliebig: §9.4 verlangt
 * `FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES <= FILES_AV_MAX_BYTES`.
 */
const ENV_PFLICHT = {
  FILES_MAX_DATEI_BYTES: String(8 * 1024 * 1024),
  FILES_AV_MAX_BYTES: String(16 * 1024 * 1024),
  FILES_MAX_ABLAUF_TAGE: "30",
} as const;

function setzeEnv(zusatz: Record<string, string>): void {
  for (const [name, wert] of Object.entries({ ...ENV_PFLICHT, ...zusatz })) {
    vi.stubEnv(name, wert);
  }
}

// ---------------------------------------------------------------------------
// Der Testserver: ein echter clamd-Sprecher, der genau das antwortet, was die
// Zeile braucht — und der protokolliert, was er gesehen hat.
// ---------------------------------------------------------------------------

interface Lauscher {
  readonly port: number;
  /** Alles, was der Client geschickt hat, byteweise unveraendert. */
  roh(): string;
  /** Wie oft der Server das Ende einer Verbindung gesehen hat. */
  geschlossen(): number;
  stoppe(): Promise<void>;
}

type Reaktion = (kommando: string, verbindung: net.Socket) => void;

async function lausche(reagiere: Reaktion): Promise<Lauscher> {
  let roh = "";
  let geschlossen = 0;
  const server = net.createServer((verbindung) => {
    let puffer = "";
    verbindung.on("data", (stueck) => {
      const text = stueck.toString("utf8");
      roh += text;
      puffer += text;
      const ende = puffer.indexOf("\0");
      if (ende < 0) return;
      const kommando = puffer.slice(0, ende);
      puffer = puffer.slice(ende + 1);
      reagiere(kommando, verbindung);
    });
    verbindung.on("close", () => {
      geschlossen += 1;
    });
    // Ein RST des Clients darf den Testserver nicht reissen — sonst pruefte die
    // Suite ihren eigenen Aufbau statt den Vertrag.
    verbindung.on("error", () => {});
  });
  await new Promise<void>((fertig) => {
    server.listen(0, "127.0.0.1", fertig);
  });
  const adresse = server.address() as net.AddressInfo;
  return {
    port: adresse.port,
    roh: () => roh,
    geschlossen: () => geschlossen,
    stoppe: () =>
      new Promise<void>((fertig) => {
        server.close(() => fertig());
      }),
  };
}

/** Ein Port, auf dem sicher niemand lauscht — fuer den ECONNREFUSED-Ausgang. */
async function freierPort(): Promise<number> {
  const leer = await lausche(() => {});
  const port = leer.port;
  await leer.stoppe();
  return port;
}

async function warteBis(bedingung: () => boolean, frist = 2000): Promise<boolean> {
  const ende = Date.now() + frist;
  while (Date.now() < ende) {
    if (bedingung()) return true;
    await new Promise((weiter) => setTimeout(weiter, 10));
  }
  return bedingung();
}

/**
 * Sentinel statt eines Wurfs: wenn `scanne` NICHT settelt, soll die Zeile ihre
 * eigentliche Aussage noch pruefen koennen (naemlich `ausfaelle`), statt in der
 * Vitest-Zeitgrenze zu verschwinden.
 */
const OHNE_ERGEBNIS = Symbol("scanne hat nicht gesettelt");

async function mitFrist<T>(versprechen: Promise<T>, ms = 3000): Promise<T | typeof OHNE_ERGEBNIS> {
  return Promise.race([
    versprechen,
    new Promise<typeof OHNE_ERGEBNIS>((fertig) => setTimeout(() => fertig(OHNE_ERGEBNIS), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Prozessgesundheit: der Zeuge dafuer, dass kein Handler wirft.
// ---------------------------------------------------------------------------

let ausfaelle: unknown[] = [];
const merkeAusfall = (fehler: unknown) => {
  ausfaelle.push(fehler);
};

beforeEach(() => {
  ausfaelle = [];
  process.on("uncaughtException", merkeAusfall);
  process.on("unhandledRejection", merkeAusfall);
});

afterEach(() => {
  process.off("uncaughtException", merkeAusfall);
  process.off("unhandledRejection", merkeAusfall);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("scanne — Transport: zSCAN per Pfad, NUL-terminiert", () => {
  it("schickt genau `zSCAN <absoluter Pfad>\\0` und nimmt den Pfad aus _lib/storage.ts", async () => {
    const lauscher = await lausche((_k, v) => v.end(`${scanPfad(ZIEL)}: OK\0`));
    setzeEnv({ FILES_AV_HOST: "127.0.0.1", FILES_AV_PORT: String(lauscher.port) });

    const ergebnis = await scanne(ZIEL);
    const pfad = scanPfad(ZIEL);

    expect(ergebnis).toEqual({ art: "clean" });
    // Der ganze Rahmen, nicht nur der Inhalt: das `z`-Praefix und die
    // NUL-Terminierung sind der Vertrag (§6.4), und ohne sie liest clamd das
    // Kommando nie zu Ende.
    expect(lauscher.roh()).toBe(`zSCAN ${pfad}\0`);
    expect(isAbsolute(pfad)).toBe(true);
    await lauscher.stoppe();
  });
});

describe("scanne — Auswertung der Antwort (§6.3.3, ohne Verlass auf `stream:`)", () => {
  async function frage(antwort: string, timeoutMs = "2000") {
    const lauscher = await lausche((_k, v) => v.end(antwort));
    setzeEnv({
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(lauscher.port),
      FILES_AV_TIMEOUT_MS: timeoutMs,
    });
    const ergebnis = await mitFrist(scanne(ZIEL));
    return { ergebnis, lauscher };
  }

  it("`<pfad>: OK` ist clean, und der Server sieht die Verbindung geschlossen", async () => {
    const { ergebnis, lauscher } = await frage(`${scanPfad(ZIEL)}: OK\0`);
    expect(ergebnis).toEqual({ art: "clean" });
    expect(await warteBis(() => lauscher.geschlossen() >= 1)).toBe(true);
    await lauscher.stoppe();
  });

  it("`stream: OK` ist ebenfalls clean — beide Praefixe gelten", async () => {
    const { ergebnis, lauscher } = await frage("stream: OK\0");
    expect(ergebnis).toEqual({ art: "clean" });
    await lauscher.stoppe();
  });

  it("ein blankes `OK` ohne Praefix ist KEIN Freibrief, sondern error", async () => {
    // §6.3.3 sagt „genau `stream: OK` bzw. `<pfad>: OK`". Alles andere ist
    // error — auch das, was wie eine Freigabe aussieht.
    const { ergebnis, lauscher } = await frage("OK\0");
    expect(ergebnis).toEqual({ art: "error", grund: "OK" });
    await lauscher.stoppe();
  });

  it("`… FOUND` ist infected und traegt die Signatur ohne Praefix", async () => {
    const { ergebnis, lauscher } = await frage("stream: Eicar-Test-Signature FOUND\0");
    expect(ergebnis).toEqual({ art: "infected", signatur: "Eicar-Test-Signature" });
    expect(await warteBis(() => lauscher.geschlossen() >= 1)).toBe(true);
    await lauscher.stoppe();
  });

  it("`<pfad>: <Signatur> FOUND` — die Signatur ist der Teil davor, nicht der Pfad", async () => {
    const { ergebnis, lauscher } = await frage(`${scanPfad(ZIEL)}: Win.Test.EICAR_HDB-1 FOUND\0`);
    expect(ergebnis).toEqual({ art: "infected", signatur: "Win.Test.EICAR_HDB-1" });
    await lauscher.stoppe();
  });

  it("`INSTREAM size limit exceeded. ERROR` (OHNE Praefix) ist error — und der Prozess lebt", async () => {
    const { ergebnis, lauscher } = await frage("INSTREAM size limit exceeded. ERROR\0");
    expect(ergebnis).toEqual({ art: "error", grund: "INSTREAM size limit exceeded. ERROR" });
    // Die eigentliche Zusage dieser Zeile: die unerwartete Antwort ist ein
    // RUECKGABEWERT. Genau hier wirft `drop` im Socket-Handler.
    expect(ausfaelle).toEqual([]);
    expect(await warteBis(() => lauscher.geschlossen() >= 1)).toBe(true);
    await lauscher.stoppe();
  });

  it("`stream: … ERROR` ist error — das Praefix ist kein Freibrief", async () => {
    const { ergebnis, lauscher } = await frage("stream: Can't allocate memory ERROR\0");
    expect(ergebnis).toEqual({ art: "error", grund: "stream: Can't allocate memory ERROR" });
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  });
});

describe("scanne — jeder Ausgang settelt genau einmal und zerstoert den Socket", () => {
  it("Antwort ohne `\\0`, dann Abbruch: das Promise settelt als error", async () => {
    const lauscher = await lausche((_k, v) => {
      v.write("stream: OK");
      v.destroy();
    });
    setzeEnv({
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(lauscher.port),
      FILES_AV_TIMEOUT_MS: "2000",
    });

    const ergebnis = await mitFrist(scanne(ZIEL));

    expect(ergebnis).not.toBe(OHNE_ERGEBNIS);
    expect(ergebnis).toMatchObject({ art: "error" });
    // Der Grund muss die unvollstaendige Antwort nennen: ohne sie steht der
    // Betreiber vor „error" ohne Anhaltspunkt.
    expect((ergebnis as { grund: string }).grund).toContain("stream: OK");
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  });

  it("Server antwortet nie: nach FILES_AV_TIMEOUT_MS error, Socket zerstoert", async () => {
    const lauscher = await lausche(() => {
      /* nimmt an und schweigt */
    });
    setzeEnv({
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(lauscher.port),
      FILES_AV_TIMEOUT_MS: "200",
    });

    const start = Date.now();
    const ergebnis = await mitFrist(scanne(ZIEL));
    const dauer = Date.now() - start;

    expect(ergebnis).toMatchObject({ art: "error" });
    // Ohne die Dauer waere ein sofortiges `error` von der Zusage nicht zu
    // unterscheiden — die Zeitgrenze ist der Gegenstand, nicht das Wort.
    expect(dauer).toBeGreaterThanOrEqual(190);
    expect((ergebnis as { grund: string }).grund).toMatch(/200/);
    expect(await warteBis(() => lauscher.geschlossen() >= 1)).toBe(true);
    await lauscher.stoppe();
  });

  it("ECONNREFUSED: error, und der Grund nennt woertlich `ECONNREFUSED <host>:<port>`", async () => {
    const port = await freierPort();
    setzeEnv({
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(port),
      FILES_AV_TIMEOUT_MS: "2000",
    });

    const ergebnis = await mitFrist(scanne(ZIEL));

    expect(ergebnis).toMatchObject({ art: "error" });
    // Woertlich, weil §6.8 genau diesen String im Log zusagt: er ist der
    // Unterschied zwischen „AV kaputt" und „`pnpm dev:av` vergessen".
    expect((ergebnis as { grund: string }).grund).toContain(`ECONNREFUSED 127.0.0.1:${port}`);
    expect(ausfaelle).toEqual([]);
  });

  it("Server schickt ZWEI Antworten in EINEM Segment: die erste entscheidet", async () => {
    const lauscher = await lausche((_k, v) => {
      // Ein einziger `write`: nur so liegen beide Antworten im SELBEN
      // `data`-Ereignis. Mit zwei Schreibvorgaengen kaeme die zweite erst nach
      // dem Abschluss an, und die Zeile waere von einer Auswertung, die den
      // LETZTEN Rahmen nimmt, nicht zu unterscheiden — sie pruefte dann nichts.
      v.write("stream: OK\0stream: Eicar-Test-Signature FOUND\0");
    });
    setzeEnv({
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(lauscher.port),
      FILES_AV_TIMEOUT_MS: "2000",
    });

    const ergebnis = await mitFrist(scanne(ZIEL));

    // Eine Auswertung, die erst auf `end` ueber den gesamten Puffer laeuft,
    // saehe hier „FOUND" — und eine Datei waere infiziert, weil der Scanner
    // zweimal geredet hat.
    expect(ergebnis).toEqual({ art: "clean" });
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  });

  it("Verbindungsabbruch NACH der Antwort aendert das Ergebnis nicht und reisst nichts", async () => {
    const lauscher = await lausche((_k, v) => {
      v.write("stream: OK\0");
      // RST statt FIN: der Client sieht danach ein `error`-Ereignis. Ohne
      // `error`-Zuhoerer ist ein Socket-`error` eine uncaught exception — genau
      // die Klasse, gegen die dieser Vertrag gebaut ist.
      v.resetAndDestroy();
    });
    setzeEnv({
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(lauscher.port),
      FILES_AV_TIMEOUT_MS: "2000",
    });

    const ergebnis = await mitFrist(scanne(ZIEL));
    await new Promise((weiter) => setTimeout(weiter, 60));

    expect(ergebnis).toEqual({ art: "clean" });
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  });
});

describe("scanne — ein Konfigurationsfehler bleibt ein Ergebnis, keine Rejection", () => {
  it("fehlt eine Pflichtzahl, settelt scanne als error und nennt die Variable", async () => {
    // `grenzen()` wirft `GrenzenUngueltig`. In einer async-Funktion waere das
    // eine Rejection — und die Warteschlange aus T17 muesste einen zweiten
    // Fehlerweg kennen. Die Zusage „settelt IMMER" gilt absolut, deshalb ist
    // auch das ein `{art:"error"}` (fail-closed) plus laute Logzeile.
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FILES_MAX_DATEI_BYTES", ENV_PFLICHT.FILES_MAX_DATEI_BYTES);
    vi.stubEnv("FILES_MAX_ABLAUF_TAGE", ENV_PFLICHT.FILES_MAX_ABLAUF_TAGE);
    vi.stubEnv("FILES_AV_MAX_BYTES", "");

    const ergebnis = await mitFrist(scanne(ZIEL));

    expect(ergebnis).toMatchObject({ art: "error" });
    expect((ergebnis as { grund: string }).grund).toContain("FILES_AV_MAX_BYTES");
    expect(laut).toHaveBeenCalled();
    expect(ausfaelle).toEqual([]);
  });

  it("eine verdorbene ID settelt als error, nicht als Rejection", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    setzeEnv({ FILES_AV_HOST: "127.0.0.1", FILES_AV_PORT: "3310" });

    const ergebnis = await mitFrist(
      scanne({ art: "inbox", inboxFileId: "../../etc/passwd" } as BlobZiel),
    );

    expect(ergebnis).toMatchObject({ art: "error" });
    expect((ergebnis as { grund: string }).grund).toContain("inboxFileId");
    expect(laut).toHaveBeenCalled();
    expect(ausfaelle).toEqual([]);
  });
});

describe("AV_STATUS und istFreigegeben — EINE Konstante, EINE Freigabeprüfung (§6.2)", () => {
  it("AV_STATUS traegt genau die fuenf Werte der Spec", () => {
    expect([...AV_STATUS]).toEqual(["scanning", "clean", "infected", "error", "unscanned"]);
  });

  it("die Datenbankschranke beider Tabellen erlaubt GENAU diese fuenf Werte", () => {
    // §4.6 verlangt EINE Konstante fuer BEIDE Tabellen — der belegte Preis von
    // E18 ist, dass `drop` und `easy-filesharing` denselben Zustand unter
    // verschiedenen Namen fuehren und keine Freigabepruefung fuer beide gilt.
    // TypeScript-Wertebereich und SQL-CHECK sind aber zwei Schichten und koennen
    // nicht dieselbe Zeile sein (T2 haelt den CHECK, T11 den Typ). Diese Zeile
    // ist die Naht dazwischen: laeuft eine der beiden Seiten weg, faellt es hier
    // auf und nicht erst an einer Zeile, die die Datenbank nicht annimmt.
    const verzeichnis = resolve(HIER, "..", "_db", "migrations");
    const sql = readdirSync(verzeichnis)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(resolve(verzeichnis, name), "utf8"))
      .join("\n");
    const treffer = [...sql.matchAll(/"av_status" IN \(([^)]*)\)/g)].map((m) =>
      m[1].split(",").map((wert) => wert.trim().replace(/^'|'$/g, "")),
    );

    // Zwei Tabellen, zwei CHECKs: `share_files` und `inbox_files`.
    expect(treffer).toHaveLength(2);
    for (const werte of treffer) {
      expect([...werte].sort()).toEqual([...AV_STATUS].sort());
    }
  });

  it("istFreigegeben gibt AUSSCHLIESSLICH bei clean frei", () => {
    // Die Schleife ueber alle fuenf ist der Punkt: ein zusaetzliches
    // „|| status === 'error'" (der fail-open-Schalter in neuer Gestalt) faellt
    // hier auf, eine einzelne clean-Zeile saehe ihn nicht.
    const frei = AV_STATUS.filter((status: AvStatus) => istFreigegeben(status));
    expect(frei).toEqual(["clean"]);
  });
});

describe("Quelltext-Zusicherung: kein `throw` in einem Socket-Handler", () => {
  const quelle = readFileSync(resolve(HIER, "av.ts"), "utf8");

  it("es gibt ueberhaupt Socket-Handler — sonst pruefte die Zeile darunter nichts", () => {
    // Ohne diese Vorbedingung ist die Negativ-Zusicherung vakuum-gruen: sie
    // waere auch dann erfuellt, wenn die Verbindungsvariable anders heisst und
    // der Scan schlicht nichts findet.
    const treffer = quelle.match(/socket\.on\(/g) ?? [];
    expect(treffer.length).toBeGreaterThanOrEqual(3);
  });

  it("nach dem ersten Socket-Handler steht kein `throw` in der Datei", () => {
    expect(quelle).not.toMatch(/socket\.on\([^)]*\)[\s\S]*?throw/);
  });
});

describe("scripts/fake-clamd.mjs — EIN Werkzeug fuer Vitest, `pnpm dev` und Playwright (§6.8)", () => {
  let kind: ChildProcessWithoutNullStreams;
  let port = 0;
  let fehlerstrom = "";
  let ablage = "";
  let modusDatei = "";

  async function verbinde(kommando: string, teile = 1): Promise<string> {
    return new Promise<string>((fertig, scheitere) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      let antwort = "";
      socket.setTimeout(3000, () => {
        socket.destroy();
        fertig(antwort);
      });
      socket.on("connect", () => {
        if (teile === 1) {
          socket.write(kommando);
          return;
        }
        // Ein `zSCAN <pfad>\0` darf in zwei Segmenten ankommen — TCP kennt
        // keine Nachrichtengrenzen, und drei Verbraucher haengen an diesem Fake.
        const schnitt = Math.floor(kommando.length / 2);
        socket.write(kommando.slice(0, schnitt));
        setTimeout(() => socket.write(kommando.slice(schnitt)), 20);
      });
      socket.on("data", (stueck) => {
        antwort += stueck.toString("utf8");
        if (antwort.includes("\0")) {
          socket.destroy();
          fertig(antwort);
        }
      });
      socket.on("error", scheitere);
    });
  }

  async function scanneUeberFake(ziel: BlobZiel = ZIEL, timeoutMs = "2000") {
    setzeEnv({
      DATA_DIR: ablage,
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(port),
      FILES_AV_TIMEOUT_MS: timeoutMs,
    });
    return mitFrist(scanne(ziel));
  }

  function schreibeModus(inhalt: string): void {
    writeFileSync(modusDatei, inhalt, "utf8");
  }

  beforeAll(async () => {
    ablage = mkdtempSync(resolve(tmpdir(), "iuk-files-av-"));
    // NIE die Vorbelegung `./.data/fake-clamd-modus`: ein Test, der dort
    // schreibt, kippt die laufende Dev-Sitzung und den E2E-Aufbau.
    modusDatei = resolve(ablage, "fake-clamd-modus");
    schreibeModus("ok");

    kind = spawn(process.execPath, ["scripts/fake-clamd.mjs"], {
      cwd: REPO,
      env: { ...process.env, PORT: "0", FAKE_CLAMD_MODUS_DATEI: modusDatei },
    }) as ChildProcessWithoutNullStreams;
    kind.stderr.setEncoding("utf8");
    kind.stderr.on("data", (text: string) => {
      fehlerstrom += text;
    });

    port = await new Promise<number>((fertig, scheitere) => {
      let gesehen = "";
      const frist = setTimeout(() => scheitere(new Error(`fake-clamd startete nicht: ${gesehen}`)), 8000);
      kind.stdout.setEncoding("utf8");
      kind.stdout.on("data", (text: string) => {
        gesehen += text;
        const treffer = gesehen.match(/lauscht auf 127\.0\.0\.1:(\d+)/);
        if (treffer) {
          clearTimeout(frist);
          fertig(Number(treffer[1]));
        }
      });
    });
  }, 20000);

  afterAll(() => {
    kind?.kill();
    if (ablage) rmSync(ablage, { recursive: true, force: true });
  });

  it("beantwortet `zPING` mit `PONG\\0`", async () => {
    expect(await verbinde("zPING\0")).toBe("PONG\0");
  });

  it("Modus ok: liest den Pfad wirklich und antwortet `<pfad>: OK` → clean", async () => {
    schreibeModus("ok");
    setzeEnv({ DATA_DIR: ablage });
    const pfad = scanPfad(ZIEL);
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, "harmloser Inhalt");

    expect(await scanneUeberFake()).toEqual({ art: "clean" });
  });

  it("Modus ok, aber die Datei fehlt: `Can't access file ERROR` → error", async () => {
    schreibeModus("ok");
    // Genau die Klasse „clamd sieht den Pfad nicht" — sie ist der Grund, warum
    // der Fake per Pfad scannt und nicht per INSTREAM.
    const fehlt: BlobZiel = { art: "inbox", inboxFileId: "ZZZZZZZZZZ" };

    const ergebnis = await scanneUeberFake(fehlt);

    expect(ergebnis).toMatchObject({ art: "error" });
    expect((ergebnis as { grund: string }).grund).toContain("Can't access file");
  });

  it("der Modus ist ZUR LAUFZEIT umschaltbar — ohne Neustart des Fakes", async () => {
    schreibeModus("ok");
    setzeEnv({ DATA_DIR: ablage });
    const pfad = scanPfad(ZIEL);
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, "harmloser Inhalt");
    expect(await scanneUeberFake()).toEqual({ art: "clean" });

    // Kein `kind.kill()`, kein neuer Prozess: Playwright startet den Fake
    // einmal je Lauf (`workers: 1`), und ein Lauf braucht `ok` UND `error`
    // (Festlegung H). Waere der Modus am Prozessstart festgenagelt, waere T47
    // unausfuehrbar.
    schreibeModus("found");
    const zweites = await scanneUeberFake();

    expect(zweites).toMatchObject({ art: "infected" });
    expect((zweites as { signatur: string }).signatur).not.toBe("");
  });

  it("Modus error: antwortet die gemessene Zeile OHNE `stream:`-Praefix → error", async () => {
    schreibeModus("error");
    const ergebnis = await scanneUeberFake();
    expect(ergebnis).toEqual({ art: "error", grund: "INSTREAM size limit exceeded. ERROR" });
  });

  it("Modus haengt: nimmt an und schweigt → die Zeitgrenze greift", async () => {
    schreibeModus("haengt");
    const start = Date.now();
    const ergebnis = await scanneUeberFake(ZIEL, "250");
    expect(ergebnis).toMatchObject({ art: "error" });
    expect(Date.now() - start).toBeGreaterThanOrEqual(240);
  });

  it("ein unbekannter Modusinhalt wird LAUT gemeldet und gilt als error, nicht als ok", async () => {
    fehlerstrom = "";
    schreibeModus("okay-vielleicht");

    const ergebnis = await scanneUeberFake();

    // Still zu `ok` zurueckzufallen machte aus einem Tippfehler in einem
    // Testhelfer einen gruenen Lauf mit der falschen Zusage.
    expect(ergebnis).toMatchObject({ art: "error" });
    expect(await warteBis(() => fehlerstrom.includes("okay-vielleicht"))).toBe(true);
    expect(fehlerstrom).toMatch(/fake-clamd/);
  });

  it("ein Kommando in ZWEI Schreibvorgaengen wird trotzdem beantwortet", async () => {
    schreibeModus("ok");
    setzeEnv({ DATA_DIR: ablage });
    const pfad = scanPfad(ZIEL);
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, "harmloser Inhalt");

    const antwort = await verbinde(`zSCAN ${pfad}\0`, 2);

    expect(antwort).toBe(`${pfad}: OK\0`);
  });
});

describe("Netzhaken: prozessweite Zweitlinie, gerufen aus src/instrumentation.ts (§6.4)", () => {
  type Zuhoerer = (fehler: unknown) => void;
  const eigene: Array<{ ereignis: "uncaughtException" | "unhandledRejection"; zuhoerer: Zuhoerer }> =
    [];

  async function frischRegistrieren() {
    // Frisches Modul, damit die Idempotenz-Wache nicht aus einer frueheren
    // Zeile schon gesetzt ist.
    vi.resetModules();
    const modul = await import("./av");
    const vorherU = process.listeners("uncaughtException").length;
    const vorherR = process.listeners("unhandledRejection").length;
    modul.registriereNetzhaken();
    const uncaught = process.listeners("uncaughtException").at(-1) as (f: unknown) => void;
    const rejection = process.listeners("unhandledRejection").at(-1) as (f: unknown) => void;
    eigene.push({ ereignis: "uncaughtException", zuhoerer: uncaught });
    eigene.push({ ereignis: "unhandledRejection", zuhoerer: rejection });
    return {
      modul,
      uncaught,
      rejection,
      zuwachsU: process.listeners("uncaughtException").length - vorherU,
      zuwachsR: process.listeners("unhandledRejection").length - vorherR,
    };
  }

  afterEach(() => {
    for (const { ereignis, zuhoerer } of eigene) process.off(ereignis, zuhoerer);
    eigene.length = 0;
  });

  it("unhandledRejection: loggt mit Markierung und beendet NICHT", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    const ende = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { rejection } = await frischRegistrieren();

    rejection(new Error("ein verlorenes Promise"));

    expect(laut.mock.calls.flat().join(" ")).toContain("[suite] unhandledRejection");
    // Ein `exit` hier machte aus einem verlorenen Promise einen Ausfall des
    // ganzen Monolithen — die Umkehrung des Zwecks.
    expect(ende).not.toHaveBeenCalled();
  });

  it("uncaughtException: loggt mit Markierung und beendet dann mit 1", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    const ende = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const { uncaught } = await frischRegistrieren();

    uncaught(new Error("ein Wurf aus dem Nichts"));

    expect(laut.mock.calls.flat().join(" ")).toContain("[suite] uncaughtException");
    // `restart: unless-stopped` (compose.yaml:4) ist der ehrlichere Weg als ein
    // Prozess in undefiniertem Zustand.
    expect(ende).toHaveBeenCalledWith(1);
  });

  it("zweimaliges Registrieren haengt keine zweiten Zuhoerer an", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { modul, zuwachsU, zuwachsR } = await frischRegistrieren();
    expect(zuwachsU).toBe(1);
    expect(zuwachsR).toBe(1);

    const vorherU = process.listeners("uncaughtException").length;
    // `register()` laeuft unter HMR mehr als einmal; ohne Wache stuenden dann
    // zwei Zuhoerer und der Prozess loggte doppelt und beendete doppelt.
    modul.registriereNetzhaken();

    expect(process.listeners("uncaughtException").length).toBe(vorherU);
  });

  it("src/instrumentation.ts ruft den Haken im Node-Zweig von register() — per DYNAMISCHEM Import", () => {
    // Der Haken lebt in `_lib/av.ts` und nicht in `instrumentation.ts`, und das
    // ist keine Bequemlichkeit: `instrumentation.ts` wird auch fuer das
    // EDGE-Bundle uebersetzt, und der Bundler sieht `process.on` statisch —
    // egal welcher Runtime-Guard davorsteht. Gemessen meldete `pnpm dev` sonst
    // bei jedem Boot „A Node.js API is used (process.on) which is not supported
    // in the Edge Runtime" samt „Ecmascript file had an error", waehrend der
    // Node-Pfad funktionierte. Eine Warnung, die niemand mehr zuordnet.
    //
    // Ein Quelltext-Scan ist hier die ehrliche Ebene: `register()` auszufuehren
    // hiesse, Migrationen und Host-Pruefung mitzustarten. Dass der Haken beim
    // ECHTEN Boot greift, hat der Durchlauf mit `pnpm dev` belegt.
    const quelle = readFileSync(resolve(REPO, "src", "instrumentation.ts"), "utf8");

    expect(quelle).toMatch(/await import\(\s*"@\/app\/m\/files\/_lib\/av"\s*\)/);
    expect(quelle).toMatch(/registriereNetzhaken\(\)/);
    // Kein `process.on` in dieser Datei — genau das war der Befund.
    expect(quelle).not.toMatch(/process\.on\(/);
    // Und der Aufruf steht NACH dem Runtime-Guard: davor liefe er auch im Edge.
    const guard = quelle.indexOf('NEXT_RUNTIME !== "nodejs"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(quelle.indexOf("registriereNetzhaken()")).toBeGreaterThan(guard);
  });
});

/**
 * T17 — die Warteschlange (Spec §6.4 „Warteschlange und Neustart", Plan T17).
 *
 * Diese Suite laeuft gegen eine ECHTE, migrierte Datei-Datenbank und einen
 * ECHTEN Socket, und beides ist Absicht:
 *
 * - **Die Warteschlange IST die Datenbank.** Es gibt keine In-Memory-Liste, die
 *   man befuellen und dann abfragen koennte. Was „eingereiht" heisst, ist damit
 *   ausschliesslich an Zeilen pruefbar — und der Zustand nach einem Neustart ist
 *   genau der Zustand einer Tabelle ohne laufenden Prozess.
 * - **Der Zeuge fuer die Reihenfolge und fuer die Zahl der Versuche ist der
 *   SERVER**, nicht ein Rueckgabewert des Prueflings. `lauscher.roh()` haelt die
 *   `zSCAN`-Kommandos in Ankunftsreihenfolge, `lauscher.geschlossen()` zaehlt die
 *   Verbindungen. Eine Zahl, die der Prueflings-Code selbst geschrieben hat,
 *   wuerde sich hier selbst bestaetigen.
 * - Die Datenbank ist eine **Datei**, nicht `:memory:`: `getModuleDb` haelt seine
 *   Verbindung auf `globalThis` und liest `DATA_DIR` beim ERSTEN Aufruf. Deshalb
 *   bekommen die Warteschlangenfunktionen die Datenbank als Parameter — den
 *   globalen Cache aus einem Test zu steuern waere von der Reihenfolge der
 *   Testdateien abhaengig.
 */
describe("AV-Warteschlange (T17) — die Warteschlange IST die Datenbank", () => {
  const SHARE = "ShareIdAbc";
  const MIGRATIONEN = resolve(HIER, "..", "_db", "migrations");

  let tmp = "";
  let ablage = "";
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeAll(() => {
    tmp = mkdtempSync(resolve(tmpdir(), "iuk-files-avq-"));
    ablage = resolve(tmp, "ablage");
    mkdirSync(ablage, { recursive: true });
    sqlite = new Database(resolve(tmp, "files.db"));
    // Verbindungs-Eigenschaft, standardmaessig AUS: ohne sie waere der
    // FK share_files.share_id → shares.id hier wirkungslos.
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
    db = drizzle(sqlite, { schema });
  });

  afterAll(() => {
    sqlite?.close();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Modulzustand ist prozessweit: ein Arbeiter aus einer frueheren Zeile wuerde
    // in die naechste hineinscannen und sie rennabhaengig gruen machen.
    stoppeAvArbeiter();
    sqlite.exec("DELETE FROM share_files; DELETE FROM inbox_files; DELETE FROM shares;");
    sqlite
      .prepare(
        "INSERT INTO shares (id,title,type,expires_at,download_count,total_size,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(SHARE, "Testfreigabe", "folder", 2_000_000_000, 0, 0, 1_700_000_000, "test");
  });

  afterEach(() => {
    stoppeAvArbeiter();
  });

  /** `sekunden` ist `created_at` — dieselbe Uhr wie `inbox_files.empfangen_at`. */
  function legeShareDatei(
    id: string,
    sekunden: number,
    opt: { status?: AvStatus; vollstaendig?: boolean } = {},
  ): void {
    sqlite
      .prepare(
        "INSERT INTO share_files (id,share_id,filename,mime_type,size,created_at,bytes_vollstaendig_at,av_status,av_geprueft_at) VALUES (?,?,?,?,?,?,?,?,NULL)",
      )
      .run(
        id,
        SHARE,
        `${id}.bin`,
        "application/octet-stream",
        10,
        sekunden,
        opt.vollstaendig === false ? null : sekunden,
        opt.status ?? "scanning",
      );
  }

  function legeInboxDatei(id: string, sekunden: number, status: AvStatus = "scanning"): void {
    sqlite
      .prepare(
        "INSERT INTO inbox_files (id,token_id,dateiname,kategorie,hinweis,mime_type,size,client_ip_unbestaetigt,empfangen_at,bytes_vollstaendig_at,av_status,av_geprueft_at) VALUES (?,NULL,?,NULL,NULL,NULL,?,NULL,?,?,?,NULL)",
      )
      .run(id, `${id}.bin`, 10, sekunden, sekunden, status);
  }

  type Zeile = { av_status: string; av_geprueft_at: number | null };
  const liesShare = (id: string) =>
    sqlite.prepare("SELECT av_status, av_geprueft_at FROM share_files WHERE id=?").get(id) as Zeile;
  const liesInbox = (id: string) =>
    sqlite.prepare("SELECT av_status, av_geprueft_at FROM inbox_files WHERE id=?").get(id) as Zeile;

  /** Ein Fake, der jeden Pfad freigibt — und dabei protokolliert, welchen. */
  const scannerOk = () =>
    lausche((kommando, v) => v.end(`${kommando.slice("zSCAN ".length)}: OK\0`));

  interface Gleichzeitig extends Lauscher {
    /** Die HOECHSTE Zahl gleichzeitig UNBEANTWORTETER `zSCAN`-Kommandos. */
    hoechstGleichzeitig(): number;
  }

  /**
   * Ein Fake, der erst nach `verzoegerungMs` antwortet — und mitzaehlt, wie viele
   * Scans dabei gleichzeitig bei ihm lagen.
   *
   * Die Verzoegerung ist der ganze Punkt: ohne sie ist jeder Scan schon fertig,
   * bevor der naechste beginnt, und „gleichzeitig" waere unabhaengig von jeder
   * Schranke immer 1. Und der Zaehler sitzt im SERVER, nicht im Prueflings-Code —
   * eine Zaehlung dort wuerde sich selbst bestaetigen.
   *
   * Gezaehlt wird das Fenster zwischen KOMMANDO und ANTWORT, nicht die Zahl
   * offener Sockets: gemessen zaehlte die Socket-Variante 3 statt 2, weil der
   * `connection`-Zuhoerer der naechsten Verbindung vor dem `close`-Zuhoerer der
   * abgebauten feuern kann (TCP-Abbau ist mehrstufig). Das waere ein Befund ueber
   * die Reihenfolge von Node-Ereignissen gewesen, nicht ueber die Schranke.
   */
  async function langsamerScanner(verzoegerungMs: number): Promise<Gleichzeitig> {
    let roh = "";
    let geschlossen = 0;
    let offen = 0;
    let hoechst = 0;
    const server = net.createServer((verbindung) => {
      let puffer = "";
      verbindung.on("data", (stueck) => {
        const text = stueck.toString("utf8");
        roh += text;
        puffer += text;
        const ende = puffer.indexOf("\0");
        if (ende < 0) return;
        const kommando = puffer.slice(0, ende);
        puffer = puffer.slice(ende + 1);
        offen += 1;
        hoechst = Math.max(hoechst, offen);
        const uhr = setTimeout(() => {
          offen -= 1;
          verbindung.end(`${kommando.slice("zSCAN ".length)}: OK\0`);
        }, verzoegerungMs);
        uhr.unref?.();
      });
      verbindung.on("close", () => {
        geschlossen += 1;
      });
      verbindung.on("error", () => {});
    });
    await new Promise<void>((fertig) => {
      server.listen(0, "127.0.0.1", fertig);
    });
    const adresse = server.address() as net.AddressInfo;
    return {
      port: adresse.port,
      roh: () => roh,
      geschlossen: () => geschlossen,
      hoechstGleichzeitig: () => hoechst,
      stoppe: () =>
        new Promise<void>((fertig) => {
          server.close(() => fertig());
        }),
    };
  }

  function setzeQueueEnv(port: number, zusatz: Record<string, string> = {}): void {
    setzeEnv({
      DATA_DIR: ablage,
      FILES_AV_HOST: "127.0.0.1",
      FILES_AV_PORT: String(port),
      FILES_AV_TIMEOUT_MS: "2000",
      FILES_AV_VERSUCHE: "1",
      FILES_AV_WIEDERHOLUNG_SEKUNDEN: "0",
      FILES_AV_PARALLEL: "2",
      ...zusatz,
    });
  }

  it("Punkt 1: drei `scanning`-Zeilen, der Fake antwortet OK → alle drei `clean` mit `av_geprueft_at`", async () => {
    const lauscher = await scannerOk();
    setzeQueueEnv(lauscher.port);
    legeShareDatei("AaaaaaaaaA", 1000);
    legeShareDatei("BbbbbbbbbB", 1001);
    // Beide Tabellen in EINEM Lauf: §4.6 zahlt den Preis von E18 mit einer
    // Konstante und einer Freigabepruefung — eine Warteschlange, die nur eine
    // der beiden Tabellen kennt, waere derselbe Fehler in neuer Gestalt.
    legeInboxDatei("CccccccccC", 1002);

    const befunde = await arbeiteAvWarteschlangeAb(db);

    expect(befunde.map((b) => b.status)).toEqual(["clean", "clean", "clean"]);
    for (const id of ["AaaaaaaaaA", "BbbbbbbbbB"]) {
      const zeile = liesShare(id);
      expect(zeile.av_status).toBe("clean");
      // Ohne `av_geprueft_at` waere die Zeile nach einem Neustart nicht von
      // einer mitten im Scan abgebrochenen zu unterscheiden (Punkt 4).
      expect(zeile.av_geprueft_at).not.toBeNull();
    }
    expect(liesInbox("CccccccccC").av_status).toBe("clean");
    expect(liesInbox("CccccccccC").av_geprueft_at).not.toBeNull();
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 15000);

  it("Punkt 2: FILES_AV_PARALLEL=1 → die Reihenfolge ist die Empfangszeit, nicht die Einfuegereihenfolge", async () => {
    const lauscher = await scannerOk();
    setzeQueueEnv(lauscher.port, { FILES_AV_PARALLEL: "1" });
    // Die Einfuegereihenfolge steht ABSICHTLICH gegen die Empfangszeit: ohne
    // Sortierung liefert SQLite hier die Einfuegereihenfolge, und eine Zeile mit
    // gleichlaufender Reihenfolge waere gruen, ohne etwas zu belegen.
    legeShareDatei("CccccccccC", 3000);
    legeInboxDatei("AaaaaaaaaA", 1000);
    legeShareDatei("BbbbbbbbbB", 2000);

    await arbeiteAvWarteschlangeAb(db);

    const pfade = [...lauscher.roh().matchAll(/zSCAN ([^\0]+)\0/g)].map((m) => m[1]);
    expect(pfade).toEqual([
      scanPfad({ art: "inbox", inboxFileId: "AaaaaaaaaA" }),
      scanPfad({ art: "share", shareId: SHARE, fileId: "BbbbbbbbbB" }),
      scanPfad({ art: "share", shareId: SHARE, fileId: "CccccccccC" }),
    ]);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 15000);

  it("Punkt 2: FILES_AV_PARALLEL=2 ist eine FESTE Nebenlaeufigkeit — nicht 1 und nicht alle auf einmal", async () => {
    // Punkt 2 der Zusage pinnt mit PARALLEL=1 nur die Reihenfolge; „feste
    // Nebenlaeufigkeit" ist damit halb belegt: eine streng serielle Umsetzung
    // waere dort gruen und hier falsch, eine ohne jede Schranke waere in Punkt 1
    // gruen und hier falsch. Diese Zeile besitzt die andere Haelfte.
    const lauscher = await langsamerScanner(300);
    setzeQueueEnv(lauscher.port, { FILES_AV_PARALLEL: "2" });
    legeShareDatei("Qqqqqqqqqq", 1000);
    legeShareDatei("Rrrrrrrrrr", 1001);
    legeShareDatei("Ssssssssss", 1002);

    const start = Date.now();
    const befunde = await arbeiteAvWarteschlangeAb(db);
    const dauer = Date.now() - start;

    expect(befunde.map((b) => b.status)).toEqual(["clean", "clean", "clean"]);
    expect(lauscher.hoechstGleichzeitig()).toBe(2);
    // Drei Zeilen zu zweit sind ZWEI Staffeln à 300 ms. Ohne die Dauer waere
    // „hoechstens 2" auch von einer Umsetzung erfuellt, die zufaellig langsam ist.
    expect(dauer).toBeGreaterThanOrEqual(600);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 20000);

  it("Punkt 3: verweigerte Verbindung → `error` mit `ECONNREFUSED <host>:<port>`, und NICHT vor dem letzten Versuch", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    const port = await freierPort();
    setzeQueueEnv(port, { FILES_AV_VERSUCHE: "3", FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1" });
    legeShareDatei("Dddddddddd", 1000);

    const start = Date.now();
    const runde = arbeiteAvWarteschlangeAb(db);
    // ECONNREFUSED kommt in Millisekunden. Nach 1,2 s sind also zwei von drei
    // Versuchen vorbei — und die Zeile MUSS noch `scanning` sein. Ein `error`
    // hier waere „frueher als FILES_AV_VERSUCHE" und genau der Fall, der jede
    // im Startfenster von clamd hochgeladene Datei fail-closed verliert
    // (§6.4: 5 × 60 s ueberspannen die zwei Minuten bis zur Bereitschaft).
    await new Promise((weiter) => setTimeout(weiter, 1200));
    expect(liesShare("Dddddddddd").av_status).toBe("scanning");

    const befunde = await runde;
    const dauer = Date.now() - start;

    expect(befunde).toHaveLength(1);
    expect(befunde[0].status).toBe("error");
    // Woertlich, weil §6.8 genau diesen String zusagt: er ist der Unterschied
    // zwischen „AV kaputt" und „`pnpm dev:av` vergessen".
    expect(befunde[0].grund).toContain(`ECONNREFUSED 127.0.0.1:${port}`);
    // Zwei Abstaende à 1 s zwischen drei Versuchen. Ohne die Dauer waere ein
    // sofortiges `error` von der Zusage nicht zu unterscheiden.
    expect(dauer).toBeGreaterThanOrEqual(2000);
    expect(liesShare("Dddddddddd").av_status).toBe("error");
    expect(liesShare("Dddddddddd").av_geprueft_at).not.toBeNull();
    // §6.7: „Grund im Log" — es gibt keine `av_grund`-Spalte, das Log ist der
    // einzige Ort, an dem der Betreiber den Grund findet.
    expect(laut.mock.calls.flat().join(" ")).toContain("ECONNREFUSED");
    expect(ausfaelle).toEqual([]);
  }, 20000);

  it("Punkt 3: der Server bezeugt GENAU FILES_AV_VERSUCHE Verbindungen — nicht zwei, nicht vier", async () => {
    // Der Zeuge ist bewusst der Server und nicht eine Zaehlung im Prueflings-
    // Code: die wuerde sich selbst bestaetigen.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lauscher = await lausche((_k, v) => v.end("INSTREAM size limit exceeded. ERROR\0"));
    setzeQueueEnv(lauscher.port, { FILES_AV_VERSUCHE: "3", FILES_AV_WIEDERHOLUNG_SEKUNDEN: "0" });
    legeShareDatei("Eeeeeeeeee", 1000);

    const befunde = await arbeiteAvWarteschlangeAb(db);

    expect(befunde[0].status).toBe("error");
    expect(befunde[0].grund).toContain("INSTREAM size limit exceeded");
    expect(await warteBis(() => lauscher.geschlossen() >= 3, 3000)).toBe(true);
    expect(lauscher.geschlossen()).toBe(3);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 20000);

  it("Punkt 4: `starteAvArbeiter()` reiht eine mitten im Scan abgebrochene Zeile ERNEUT ein", async () => {
    const lauscher = await scannerOk();
    setzeQueueEnv(lauscher.port);
    // Genau der Zustand nach einem Neustart: `scanning`, `av_geprueft_at` NULL,
    // und niemand hat fuer diese Zeile `reiheAvEin` gerufen — der Prozess, der
    // es getan haette, ist ja gestorben. Ohne die Wiederaufnahme beim Start
    // bleibt sie FUER IMMER stehen, der Empfaenger wartet auf etwas, das nie
    // kommt, und kein Gate wird rot.
    legeShareDatei("Ffffffffff", 1000);
    expect(liesShare("Ffffffffff").av_geprueft_at).toBeNull();

    starteAvArbeiter(db);

    expect(await warteBis(() => liesShare("Ffffffffff").av_status === "clean", 6000)).toBe(true);
    stoppeAvArbeiter();
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 20000);

  it("Punkt 5: keine Rueckwege — `clean`, `infected`, `unscanned` und `error` werden von keinem Lauf angefasst", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lauscher = await lausche((_k, v) => v.end("stream: Eicar-Test-Signature FOUND\0"));
    setzeQueueEnv(lauscher.port);
    legeShareDatei("Gggggggggg", 1000, { status: "clean" });
    legeShareDatei("Hhhhhhhhhh", 1001, { status: "infected" });
    legeShareDatei("Iiiiiiiiii", 1002, { status: "unscanned" });
    // `error → scanning` laeuft AUSSCHLIESSLICH ueber die Wiederholung (Knopf,
    // T45) — nicht dadurch, dass ein Lauf die Zeile nochmal aufgreift.
    legeShareDatei("Jjjjjjjjjj", 1003, { status: "error" });
    legeShareDatei("Kkkkkkkkkk", 1004);

    const befunde = await arbeiteAvWarteschlangeAb(db);

    expect(befunde).toEqual([
      {
        tabelle: "share_files",
        id: "Kkkkkkkkkk",
        status: "infected",
        grund: "Eicar-Test-Signature",
      },
    ]);
    expect(liesShare("Gggggggggg").av_status).toBe("clean");
    expect(liesShare("Hhhhhhhhhh").av_status).toBe("infected");
    expect(liesShare("Iiiiiiiiii").av_status).toBe("unscanned");
    expect(liesShare("Jjjjjjjjjj").av_status).toBe("error");
    expect(liesShare("Kkkkkkkkkk").av_status).toBe("infected");
    // Die vier fremden Zeilen sind nicht bloss unveraendert — sie wurden gar
    // nicht gescannt. Genau EINE Verbindung.
    expect(await warteBis(() => lauscher.geschlossen() >= 1, 3000)).toBe(true);
    expect(lauscher.geschlossen()).toBe(1);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 15000);

  it("eine Zeile ohne `bytes_vollstaendig_at` ist NICHT in der Warteschlange", async () => {
    const lauscher = await scannerOk();
    setzeQueueEnv(lauscher.port, { FILES_AV_VERSUCHE: "3" });
    // Der laufende Chunk-Upload (§4.4): es gibt noch keine Blobdatei, nur eine
    // `.part`-Zwischendatei. Wuerde sie gescannt, antwortete clamd
    // „Can't access file ERROR", und nach FILES_AV_VERSUCHE stuende eine Datei
    // auf `error`, die gerade voellig in Ordnung entsteht — fail-closed, also
    // nie herunterladbar. Eingereiht wird sie vom LETZTEN Chunk (T27).
    legeShareDatei("Llllllllll", 1000, { vollstaendig: false });

    const befunde = await arbeiteAvWarteschlangeAb(db);

    expect(befunde).toEqual([]);
    expect(liesShare("Llllllllll").av_status).toBe("scanning");
    expect(liesShare("Llllllllll").av_geprueft_at).toBeNull();
    expect(lauscher.geschlossen()).toBe(0);
    await lauscher.stoppe();
  }, 15000);

  it("`reiheAvEin` scannt die benannte Zeile SOFORT, ohne auf den Takt zu warten", async () => {
    const lauscher = await scannerOk();
    // Takt 60 s: ohne `reiheAvEin` waere die naechste Runde eine Minute entfernt,
    // und ein Upload staende trotz erreichbarem Scanner eine Minute auf
    // „wird geprueft".
    setzeQueueEnv(lauscher.port, { FILES_AV_WIEDERHOLUNG_SEKUNDEN: "60" });
    starteAvArbeiter(db);
    // Die erste Runde laeuft auf LEERE Tabellen; danach schlaeft der Arbeiter.
    await new Promise((weiter) => setTimeout(weiter, 200));
    legeShareDatei("Mmmmmmmmmm", 1000);
    await new Promise((weiter) => setTimeout(weiter, 300));
    expect(liesShare("Mmmmmmmmmm").av_status).toBe("scanning");

    reiheAvEin({ art: "share", shareId: SHARE, fileId: "Mmmmmmmmmm" }, db);

    expect(await warteBis(() => liesShare("Mmmmmmmmmm").av_status === "clean", 4000)).toBe(true);
    stoppeAvArbeiter();
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 20000);

  it("der Takt KEHRT WIEDER: eine Zeile, die erst nach der Boot-Runde entsteht, wird ohne `reiheAvEin` abgeholt", async () => {
    // Diese Zeile besitzt den WIEDERKEHRENDEN Takt, den keine andere besitzt:
    // Punkt 4 haengt an der ERSTEN Runde, `reiheAvEin` umgeht den Takt per
    // Definition, und die Stopp-Zeile prueft nur, dass DANACH nichts passiert.
    // Ein Arbeiter, der von sich aus nie wiederkommt, erfuellt alle drei — und
    // dann bleibt jede Zeile, die `reiheAvEin` verpasst hat (Auftrag noch nicht
    // sichtbar, `inArbeit` belegt, Arbeiter noch nicht gestartet), bis zum
    // Prozessneustart auf `scanning` stehen: fail-closed, also nicht
    // herunterladbar. Deshalb wird hier ABSICHTLICH kein `reiheAvEin` gerufen.
    const lauscher = await scannerOk();
    // 1 s ist hier NUR der Takt, nicht der Wiederholungsabstand: `FILES_AV_VERSUCHE`
    // bleibt bei 1 (Vorbelegung von `setzeQueueEnv`), und der Fake antwortet OK —
    // es gibt also keinen zweiten Versuch, dessen Abstand mitzaehlte.
    setzeQueueEnv(lauscher.port, { FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1" });

    starteAvArbeiter(db);
    // Die erste Runde laeuft auf LEERE Tabellen und ist danach vorbei.
    await new Promise((weiter) => setTimeout(weiter, 300));
    legeShareDatei("Tttttttttt", 1000);

    // Die Frist ist knapp gewaehlt: sie belegt nicht nur „irgendwann wieder",
    // sondern dass der Takt `FILES_AV_WIEDERHOLUNG_SEKUNDEN` IST. Eine erfundene
    // zweite Zahl (etwa 60 s aus §9.3 oder ein hartcodierter Wert) faellt hier auf.
    expect(await warteBis(() => liesShare("Tttttttttt").av_status === "clean", 3000)).toBe(true);
    stoppeAvArbeiter();
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 20000);

  it("`reiheAvEin` waehrend eines laufenden Scans derselben Zeile scannt NICHT ein zweites Mal", async () => {
    // Der gegenseitige Ausschluss je Zeile (`inArbeit`): waehrend eine Takt-Runde
    // eine Zeile bearbeitet, liegen bis zu
    // `FILES_AV_VERSUCHE × FILES_AV_WIEDERHOLUNG_SEKUNDEN` — trifft in diesem
    // Fenster ein `reiheAvEin` fuer DIESELBE Zeile ein (Wiederholen-Knopf T45,
    // letzter Chunk T27), entstuenden ohne die Wache zwei gleichzeitige
    // clamd-Verbindungen fuer eine Datei.
    //
    // 1500 ms Verzoegerung sind Absicht: das Fenster muss so weit sein, dass
    // `reiheAvEin` den Auftrag SICHER noch als `scanning` sieht. Kaeme es zu spaet,
    // faende es gar keinen Auftrag — und die Zeile waere aus dem falschen Grund
    // gruen, also auch ohne die Wache.
    const lauscher = await langsamerScanner(1500);
    setzeQueueEnv(lauscher.port, { FILES_AV_WIEDERHOLUNG_SEKUNDEN: "60" });
    legeShareDatei("Uuuuuuuuuu", 1000);
    const pfad = scanPfad({ art: "share", shareId: SHARE, fileId: "Uuuuuuuuuu" });

    starteAvArbeiter(db);
    // Erst wenn der Scanner das Kommando gesehen hat, laeuft der Scan wirklich —
    // ein blindes `setTimeout` waere hier eine Vermutung.
    expect(await warteBis(() => lauscher.roh().includes(pfad), 3000)).toBe(true);

    reiheAvEin({ art: "share", shareId: SHARE, fileId: "Uuuuuuuuuu" }, db);

    expect(await warteBis(() => liesShare("Uuuuuuuuuu").av_status === "clean", 6000)).toBe(true);
    stoppeAvArbeiter();
    // Der direkte Zeuge: GENAU EIN `zSCAN`. `geschlossen()` allein waere
    // schwaecher, weil eine zweite Verbindung erst spaeter abgebaut wird.
    const kommandos = [...lauscher.roh().matchAll(/zSCAN ([^\0]+)\0/g)].map((m) => m[1]);
    expect(kommandos).toEqual([pfad]);
    expect(await warteBis(() => lauscher.geschlossen() >= 1, 3000)).toBe(true);
    expect(lauscher.geschlossen()).toBe(1);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 25000);

  it("wird die Zeile im Scanfenster anders entschieden, ist der Lauf OHNE Befund — und schreibt nichts zurueck", async () => {
    // Zwischen Auswahl und Schreiben liegen bis zu
    // `FILES_AV_VERSUCHE × FILES_AV_WIEDERHOLUNG_SEKUNDEN`. Der Vorbehalt
    // `av_status = 'scanning'` im WHERE haelt fest, dass ein spaet eintreffendes
    // Ergebnis eine inzwischen anders entschiedene Zeile nicht zurueckdreht.
    //
    // Die Lage wird hier per DIREKTEM SQL hergestellt, nicht ueber einen Weg des
    // Moduls: bei „ein Container, ein Arbeiter" gibt es im Modul keinen zweiten
    // Schreiber. Diese Zeile besitzt deshalb genau zwei Aussagen — die Zeile
    // bleibt unveraendert, und der Lauf meldet KEINEN Befund. Ein Befund
    // `status: "clean"` fuer eine Zeile, die `infected` ist, waere eine stille
    // Falschaussage an jeden spaeteren Verbraucher (T22, T45).
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lauscher = await langsamerScanner(1500);
    setzeQueueEnv(lauscher.port);
    legeShareDatei("Vvvvvvvvvv", 1000);
    const pfad = scanPfad({ art: "share", shareId: SHARE, fileId: "Vvvvvvvvvv" });

    const runde = arbeiteAvWarteschlangeAb(db);
    expect(await warteBis(() => lauscher.roh().includes(pfad), 3000)).toBe(true);
    // Mitten im Scanfenster: die Zeile ist nicht mehr `scanning`.
    sqlite
      .prepare("UPDATE share_files SET av_status='infected', av_geprueft_at=? WHERE id=?")
      .run(1_700_000_100, "Vvvvvvvvvv");

    const befunde = await runde;

    expect(befunde).toEqual([]);
    expect(liesShare("Vvvvvvvvvv").av_status).toBe("infected");
    // Der Scan hat wirklich stattgefunden — sonst waere die Zeile leer gruen.
    expect(lauscher.roh()).toContain(pfad);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 25000);

  it("`reiheAvEin` auf eine `clean`-Zeile ist wirkungslos — der Weg ist kein Rueckweg", async () => {
    const lauscher = await lausche((_k, v) => v.end("stream: Eicar-Test-Signature FOUND\0"));
    setzeQueueEnv(lauscher.port, { FILES_AV_WIEDERHOLUNG_SEKUNDEN: "60" });
    legeShareDatei("Nnnnnnnnnn", 1000, { status: "clean" });
    starteAvArbeiter(db);
    await new Promise((weiter) => setTimeout(weiter, 200));

    reiheAvEin({ art: "share", shareId: SHARE, fileId: "Nnnnnnnnnn" }, db);
    await new Promise((weiter) => setTimeout(weiter, 400));

    expect(liesShare("Nnnnnnnnnn").av_status).toBe("clean");
    expect(lauscher.geschlossen()).toBe(0);
    stoppeAvArbeiter();
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 15000);

  it("zweimaliges `starteAvArbeiter` startet keinen zweiten Arbeiter, und `stoppe` haelt ihn wirklich an", async () => {
    const lauscher = await scannerOk();
    setzeQueueEnv(lauscher.port, { FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1" });
    legeShareDatei("Oooooooooo", 1000);

    // `register()` laeuft unter HMR mehr als einmal; zwei Arbeiter hiessen zwei
    // Schleifen, zwei Timer und doppelte Scans auf derselben Zeile.
    starteAvArbeiter(db);
    starteAvArbeiter(db);
    expect(await warteBis(() => liesShare("Oooooooooo").av_status === "clean", 6000)).toBe(true);
    stoppeAvArbeiter();

    // Erst das Verbindungsende abwarten, dann die Gleichheit — wie in den beiden
    // Zeilen oben. `av_status = 'clean'` steht in der Datenbank, BEVOR der Server
    // sein `close` sieht: `abschluss` zerstoert den Socket und erfuellt danach das
    // Promise, der Schreibvorgang laeuft in der naechsten Microtask, und der
    // `close`-Zuhoerer des Servers braucht erst noch FIN/RST ueber die Schleife.
    // Ohne diese Naht ist `geschlossen()` hier rennabhaengig 0 statt 1.
    expect(await warteBis(() => lauscher.geschlossen() >= 1, 3000)).toBe(true);
    const nachStopp = lauscher.geschlossen();
    // Genau EINE Verbindung fuer EINE Zeile — nicht zwei.
    expect(nachStopp).toBe(1);
    legeShareDatei("Pppppppppp", 1001);
    await new Promise((weiter) => setTimeout(weiter, 1500));
    // Nach `stoppe` laeuft kein Takt mehr: die neue Zeile bleibt liegen.
    expect(liesShare("Pppppppppp").av_status).toBe("scanning");
    expect(lauscher.geschlossen()).toBe(nachStopp);
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  }, 20000);
});
