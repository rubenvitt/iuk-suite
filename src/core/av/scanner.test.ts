/**
 * T17 — das clamd-Protokoll als geteilter Suite-Code (Spec §6.2–§6.4, §6.8 des
 * Moduls `files`, wo der Vertrag entstanden ist; Plan T11/T17).
 *
 * Diese Datei war bis T17 Teil von `src/app/m/files/_lib/av.test.ts`. Verschoben
 * ist nur das PROTOKOLL: `AvErgebnis`, die Auswertung der Antwort, der
 * Socket-Automat mit seinen vier Bauregeln, die Quelltext-Zusicherung darueber
 * und der prozessweite Netzhaken (§6.4). `files` behaelt seine eigene Testdatei
 * fuer die `files`-eigene Haelfte (Konfiguration, Pfadaufloesung, das
 * fuenfwertige Statusvokabular, die Warteschlange).
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
 * die ZWEITE Linie desselben Vertrags (§6.4) und gehoert demselben Modul. Eine
 * eigene Testdatei dafuer waere eine zweite Stelle mit derselben Aussage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanne, type AvKonfig } from "./scanner";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..", "..");

/** Ein beliebiger Pfad — `core/av` kennt keine Modul-ID und keine Ablage. */
const PFAD = "/data/blobs/AB/testdatei";

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

function konfigFuer(lauscher: Lauscher, timeoutMs = 2000): AvKonfig {
  return { host: "127.0.0.1", port: lauscher.port, timeoutMs };
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
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("scanne — Transport: zSCAN per Pfad, NUL-terminiert", () => {
  it("schickt genau `zSCAN <Pfad>\\0` — der Pfad kommt UNVERAENDERT vom Aufrufer", async () => {
    const lauscher = await lausche((_k, v) => v.end(`${PFAD}: OK\0`));

    const ergebnis = await scanne(PFAD, konfigFuer(lauscher));

    expect(ergebnis).toEqual({ art: "clean" });
    // Der ganze Rahmen, nicht nur der Inhalt: das `z`-Praefix und die
    // NUL-Terminierung sind der Vertrag (§6.4), und ohne sie liest clamd das
    // Kommando nie zu Ende.
    expect(lauscher.roh()).toBe(`zSCAN ${PFAD}\0`);
    await lauscher.stoppe();
  });
});

describe("scanne — Auswertung der Antwort (§6.3.3, ohne Verlass auf `stream:`)", () => {
  async function frage(antwort: string, timeoutMs = 2000) {
    const lauscher = await lausche((_k, v) => v.end(antwort));
    const ergebnis = await mitFrist(scanne(PFAD, konfigFuer(lauscher, timeoutMs)));
    return { ergebnis, lauscher };
  }

  it("`<pfad>: OK` ist clean, und der Server sieht die Verbindung geschlossen", async () => {
    const { ergebnis, lauscher } = await frage(`${PFAD}: OK\0`);
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
    const { ergebnis, lauscher } = await frage(`${PFAD}: Win.Test.EICAR_HDB-1 FOUND\0`);
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

    const ergebnis = await mitFrist(scanne(PFAD, konfigFuer(lauscher)));

    expect(ergebnis).not.toBe(OHNE_ERGEBNIS);
    expect(ergebnis).toMatchObject({ art: "error" });
    // Der Grund muss die unvollstaendige Antwort nennen: ohne sie steht der
    // Betreiber vor „error" ohne Anhaltspunkt.
    expect((ergebnis as { grund: string }).grund).toContain("stream: OK");
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  });

  it("Server antwortet nie: nach timeoutMs error, Socket zerstoert", async () => {
    const lauscher = await lausche(() => {
      /* nimmt an und schweigt */
    });

    const start = Date.now();
    const ergebnis = await mitFrist(scanne(PFAD, konfigFuer(lauscher, 200)));
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

    const ergebnis = await mitFrist(scanne(PFAD, { host: "127.0.0.1", port, timeoutMs: 2000 }));

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

    const ergebnis = await mitFrist(scanne(PFAD, konfigFuer(lauscher)));

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

    const ergebnis = await mitFrist(scanne(PFAD, konfigFuer(lauscher)));
    await new Promise((weiter) => setTimeout(weiter, 60));

    expect(ergebnis).toEqual({ art: "clean" });
    expect(ausfaelle).toEqual([]);
    await lauscher.stoppe();
  });
});

describe("scanne — eine kaputte Konfiguration bleibt ein Ergebnis, keine Rejection", () => {
  // `core/av` darf sich hier NICHT auf einen pruefenden Aufrufer verlassen:
  // `files` liest zwar aus `grenzen()` (dort mit Mindest-/Hoechstwert
  // geprueft), aber ein anderer Aufrufer (T18) muss das nicht tun. Ohne diese
  // Pruefung wirft `net.createConnection` bei einem ungueltigen Port SYNCHRON
  // `ERR_SOCKET_BAD_PORT` — innerhalb des Promise-Executors wird daraus keine
  // uncaught exception, aber eine REJECTION, und die darf laut Kopfkommentar
  // nie entstehen.

  it("ein Port ausserhalb 1-65535 settelt als error, NICHT als Rejection", async () => {
    let rejected = false;
    const ergebnis = await scanne(PFAD, { host: "127.0.0.1", port: 70000, timeoutMs: 2000 }).catch(
      () => {
        rejected = true;
        return undefined;
      },
    );

    expect(rejected).toBe(false);
    expect(ergebnis).toMatchObject({ art: "error" });
    expect((ergebnis as { grund: string }).grund).toContain("port");
    expect(ausfaelle).toEqual([]);
  });

  it("ein leerer host settelt als error, NICHT als Rejection", async () => {
    const ergebnis = await scanne(PFAD, { host: "", port: 3310, timeoutMs: 2000 });

    expect(ergebnis).toMatchObject({ art: "error" });
    expect((ergebnis as { grund: string }).grund).toContain("host");
    expect(ausfaelle).toEqual([]);
  });

  it("ein nicht-positives timeoutMs settelt als error, NICHT als Rejection", async () => {
    const ergebnis = await scanne(PFAD, { host: "127.0.0.1", port: 3310, timeoutMs: 0 });

    expect(ergebnis).toMatchObject({ art: "error" });
    expect((ergebnis as { grund: string }).grund).toContain("timeoutMs");
    expect(ausfaelle).toEqual([]);
  });
});

describe("scanne — die Konfiguration kommt AUSSCHLIESSLICH vom Aufrufer (T17)", () => {
  it("zwei Aufrufe mit zwei verschiedenen Konfigurationen erreichen zwei verschiedene Server", async () => {
    // `core/av` kennt keine Umgebungsvariable und keine Modulgrenzen — waere
    // irgendwo eine versteckte zweite Quelle (ein Modul-Level-Default, ein
    // gelesenes `process.env`), zeigten beide Aufrufe denselben Server.
    const eins = await lausche((_k, v) => v.end(`${PFAD}: OK\0`));
    const zwei = await lausche((_k, v) => v.end(`${PFAD}: Eicar-Test-Signature FOUND\0`));

    const ergebnisEins = await scanne(PFAD, konfigFuer(eins));
    const ergebnisZwei = await scanne(PFAD, konfigFuer(zwei));

    expect(ergebnisEins).toEqual({ art: "clean" });
    expect(ergebnisZwei).toEqual({ art: "infected", signatur: "Eicar-Test-Signature" });
    expect(eins.roh()).toBe(`zSCAN ${PFAD}\0`);
    expect(zwei.roh()).toBe(`zSCAN ${PFAD}\0`);
    await eins.stoppe();
    await zwei.stoppe();
  });
});

describe("Quelltext-Zusicherung: kein `throw` in einem Socket-Handler", () => {
  const quelle = readFileSync(resolve(HIER, "scanner.ts"), "utf8");

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

describe("Netzhaken: prozessweite Zweitlinie, gerufen aus src/instrumentation.ts (§6.4)", () => {
  type Zuhoerer = (fehler: unknown) => void;
  const eigene: Array<{ ereignis: "uncaughtException" | "unhandledRejection"; zuhoerer: Zuhoerer }> =
    [];

  async function frischRegistrieren() {
    // Frisches Modul, damit die Idempotenz-Wache nicht aus einer frueheren
    // Zeile schon gesetzt ist.
    vi.resetModules();
    const modul = await import("./scanner");
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
    // Der Haken lebt in `core/av/scanner.ts` und nicht in `instrumentation.ts`,
    // und das ist keine Bequemlichkeit: `instrumentation.ts` wird auch fuer das
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

    expect(quelle).toMatch(/await import\(\s*"@\/core\/av\/scanner"\s*\)/);
    expect(quelle).toMatch(/registriereNetzhaken\(\)/);
    // Kein `process.on` in dieser Datei — genau das war der Befund.
    expect(quelle).not.toMatch(/process\.on\(/);
    // Und der Aufruf steht NACH dem Runtime-Guard: davor liefe er auch im Edge.
    const guard = quelle.indexOf('NEXT_RUNTIME !== "nodejs"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(quelle.indexOf("registriereNetzhaken()")).toBeGreaterThan(guard);
  });
});
