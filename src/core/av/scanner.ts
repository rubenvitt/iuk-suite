/**
 * Das clamd-Protokoll — geteilter Suite-Code (Aufgabe T17 des Moduls
 * `aufgaben`, Spec §6.2–§6.4 des Moduls `files`, wo der Vertrag entstanden
 * ist). Zweiter belegter Nutznieser: `aufgaben` scannt seine Bildnachweise
 * (T18) ueber genau dieses Protokoll, ohne es ein zweites Mal zu schreiben.
 *
 * Zusage, absolut: `scanne(pfad, konfig)` settelt IMMER und GENAU EINMAL und
 * wirft nie asynchron. Ein Protokollfehler, eine Zeitueberschreitung, ein
 * nicht erreichbarer Scanner und eine kaputte Konfiguration sind alle
 * dasselbe: ein RUECKGABEWERT `{art:"error"}`.
 *
 * Der belegte Anlass ist `drop`: sein `parseResponse` wirft bei jeder
 * unerwarteten Antwort, und der Wurf passiert im `socket.on('end')`-Callback
 * (`antivirus.js:11-26,56-58`) — also ausserhalb der synchronen Ausfuehrung des
 * Promise-Konstruktors. Daraus wird KEINE Rejection, sondern eine uncaught
 * exception; das Promise settelt nie, und im Monolithen reisst das `portal`,
 * `qr` und `feedback` mit. Gemessen: Exit-Code 1.
 *
 * Deshalb gelten hier vier Bauregeln, und alle vier stehen bewusst VOR dem
 * ersten Ereignis-Zuhoerer: `scanner.test.ts` scannt den Quelltext daraufhin,
 * dass ab dem ersten Zuhoerer das Wort „wirf" (englisch) nirgends mehr
 * vorkommt — und ein Scan liest Kommentare mit, also gilt die Regel auch fuer
 * diese Erklaerung:
 *
 * 1. Es gibt genau EIN `abschluss(ergebnis)`, durch ein `bereits`-Flag
 *    idempotent, und ALLE Ereignisse laufen durch ihn (`error`, `close`,
 *    `timeout`, Zeitgrenze, Parse-Ergebnis).
 * 2. Kein Handler wirft. Ein Parse-Fehler ist ein Rueckgabewert.
 * 3. Eine harte Zeitgrenze (aus `konfig.timeoutMs`) laeuft unabhaengig vom
 *    Socket.
 * 4. `socket.destroy()` in JEDEM Ausgang — sonst leckt der Descriptor. Zeuge
 *    dafuer ist in der Testsuite der Server, nicht das Promise.
 *
 * Was hier NICHT existiert und nicht entstehen darf: ein fail-open-Schalter.
 * Ein Modul, das ein Ergebnis dieses Protokolls in eine Freigabe uebersetzt
 * (`istFreigegeben` bei `files`, das eigene Vokabular bei `aufgaben`), kennt
 * genau EINEN freigebenden Wert. Drops `AV_FAIL_OPEN` war in beiden
 * Stellungen wirkungslos, weil sein `catch`-Block fuer Protokollfehler nie
 * erreicht wurde — ein Schalter, der Sicherheit verspricht und keine liefert,
 * ist schlimmer als keiner (§6.3).
 *
 * `core/av` kennt WEDER eine Umgebungsvariable NOCH Modulgrenzen — die
 * Konfiguration kommt bei jedem Aufruf als Argument herein. Jedes Modul liest
 * seine eigenen Zahlen (`files` aus `_lib/grenzen.ts`, `aufgaben` aus seinen
 * eigenen) und reicht sie durch. Ein zweiter Ort fuer die Zahlen von `files`
 * waere hier keine Verschiebung, sondern eine Verdopplung.
 */
import net from "node:net";

export type AvErgebnis =
  | { art: "clean" }
  | { art: "infected"; signatur: string }
  | { art: "error"; grund: string };

/** Die Konfiguration eines Aufrufs — von aussen hereingereicht, nie geraten. */
export interface AvKonfig {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
}

/** Der Rahmen des clamd-Protokolls: `z`-Praefix beim Kommando, NUL als Ende. */
const NUL = "\0";

/**
 * Die Auswertung nach §6.3.3 — und ausdruecklich OHNE Verlass auf ein
 * `stream:`-Praefix. Gemessen antwortet eine Uebergroesse
 * `INSTREAM size limit exceeded. ERROR`, also ohne Praefix; wer auf das
 * Praefix prueft, haelt diese Antwort fuer unbekannt und (schlimmer) eine
 * Antwort mit Praefix fuer vertrauenswuerdig.
 *
 * Reihenfolge ist Absicht: erst ` FOUND`, dann das exakte `<irgendwas>: OK`,
 * und alles andere ist `error` mit der ROHEN Antwort als Grund. Ein blankes
 * `OK` ohne Praefix ist damit kein Freibrief — die Spec sagt „genau
 * `stream: OK` bzw. `<pfad>: OK`", und die Luecke waere eine Freigabe durch
 * Zufall.
 */
function werteAntwortAus(roh: string): AvErgebnis {
  const antwort = roh.trim();
  const FUND = " FOUND";
  if (antwort.endsWith(FUND)) {
    const davor = antwort.slice(0, -FUND.length);
    // Das Praefix ist `<pfad>: ` oder `stream: `. Der Pfad besteht aus IDs und
    // enthaelt kein `: ` (siehe `files/_lib/storage.ts`), deshalb ist die
    // LETZTE Vorkommnis die Trennstelle und die Signatur der Rest.
    const trenner = davor.lastIndexOf(": ");
    const signatur = (trenner >= 0 ? davor.slice(trenner + 2) : davor).trim();
    return { art: "infected", signatur: signatur === "" ? davor.trim() : signatur };
  }
  if (/^.+: OK$/.test(antwort)) {
    return { art: "clean" };
  }
  return { art: "error", grund: antwort === "" ? "leere Antwort des Scanners" : antwort };
}

function errnoCode(fehler: unknown): string | undefined {
  if (typeof fehler === "object" && fehler !== null && "code" in fehler) {
    const code = (fehler as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Der Grund fuer einen Socket-Fehler wird SELBST gebaut, nicht aus
 * `fehler.message` abgeschrieben: §6.8 sagt woertlich `ECONNREFUSED <host>:<port>`
 * zu, und dieser String ist der Unterschied zwischen „der Scanner ist kaputt"
 * und „`pnpm dev:av` vergessen". Node schreibt ihn heute zufaellig aehnlich;
 * das ist eine Bibliotheksmeldung und keine Zusage.
 */
function socketGrund(fehler: unknown, host: string, port: number): string {
  const code = errnoCode(fehler);
  const adresse = `${host}:${port}`;
  if (code !== undefined) return `${code} ${adresse}`;
  const botschaft = fehler instanceof Error ? fehler.message : String(fehler);
  return `Socketfehler ${adresse}: ${botschaft}`;
}

/**
 * Eine kaputte Konfiguration ist der VIERTE Fall aus der Zusage oben — und
 * `core/av` kann sich hier NICHT auf einen Aufrufer verlassen, der schon
 * geprueft hat: `files` liest `host`/`port`/`timeoutMs` zwar aus `grenzen()`
 * (dort mit Mindest- und Hoechstwert geprueft), aber `aufgaben` (T18) liest
 * seine eigenen Zahlen, und ein DRITTER Aufrufer ist nicht ausgeschlossen. Ein
 * ungueltiger `port` (z. B. 70000 oder `NaN`) laesst `net.createConnection`
 * SYNCHRON mit `ERR_SOCKET_BAD_PORT` scheitern — innerhalb des
 * Promise-Executors wird daraus zwar keine uncaught exception, aber eine
 * REJECTION, und genau die darf laut Kopfkommentar nie entstehen: T18 muesste
 * sonst einen zweiten Fehlerweg kennen, obendrein einen, den `files` heute nur
 * durch die Sorgfalt von `grenzen()` nie sieht.
 */
function konfigFehler(konfig: AvKonfig): string | null {
  const { host, port, timeoutMs } = konfig;
  if (typeof host !== "string" || host.trim() === "") {
    return "ungueltige Konfiguration: host fehlt oder ist leer";
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return `ungueltige Konfiguration: port=${port} liegt ausserhalb 1-65535`;
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return `ungueltige Konfiguration: timeoutMs=${timeoutMs} muss positiv sein`;
  }
  return null;
}

/**
 * Settelt IMMER, genau EINMAL. Wirft nie asynchron.
 *
 * Transport ist `zSCAN <pfad>` (kein INSTREAM): clamd liest die Datei selbst,
 * statt die Bytes ein zweites Mal ueber einen Socket zu schicken. Der Pfad
 * kommt vom Aufrufer — welche Datei das ist und wo sie liegt, weiss `core/av`
 * nicht und muss es nicht wissen.
 */
export async function scanne(pfad: string, konfig: AvKonfig): Promise<AvErgebnis> {
  const fehler = konfigFehler(konfig);
  if (fehler !== null) {
    return { art: "error", grund: fehler };
  }

  const { host, port, timeoutMs } = konfig;

  return new Promise<AvErgebnis>((erfuelle) => {
    let bereits = false;
    let puffer = "";

    const socket = net.createConnection({ host, port });

    // Die harte Zeitgrenze laeuft am Socket VORBEI: `socket.setTimeout` ist eine
    // Untaetigkeitsgrenze und wird von jedem einzelnen Byte zurueckgesetzt — ein
    // Scanner, der langsam Unsinn troepfelt, kaeme damit nie an ein Ende.
    //
    // Sie steht VOR `abschluss`, obwohl sie ihn ruft: ein Timer feuert nie im
    // selben Zug wie seine Registrierung, also ist der Zugriff zur Laufzeit
    // aufgeloest. Umgekehrt braeuchte `abschluss` sonst ein `let uhr` mit
    // Undefined-Zweig, den niemand erreichen kann.
    const uhr = setTimeout(() => {
      abschluss({ art: "error", grund: `Zeitgrenze von ${timeoutMs} ms ueberschritten` });
    }, timeoutMs);

    const abschluss = (ergebnis: AvErgebnis): void => {
      if (bereits) return;
      bereits = true;
      clearTimeout(uhr);
      socket.destroy();
      erfuelle(ergebnis);
    };

    // Zusaetzlich die Untaetigkeitsgrenze: sie beendet den haeufigen Fall (Scanner
    // nimmt an und schweigt) am Socket selbst, statt ihn nur auszusitzen.
    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.write(`zSCAN ${pfad}${NUL}`);
    });

    socket.on("data", (stueck: Buffer) => {
      puffer += stueck.toString("utf8");
      const ende = puffer.indexOf(NUL);
      // Die ERSTE vollstaendige Antwort entscheidet. Erst auf `end` ueber den
      // gesamten Puffer auszuwerten hiesse: ein Scanner, der zweimal redet,
      // bestimmt das Ergebnis mit seinem letzten Wort.
      if (ende >= 0) abschluss(werteAntwortAus(puffer.slice(0, ende)));
    });

    socket.on("timeout", () => {
      abschluss({ art: "error", grund: `Zeitgrenze von ${timeoutMs} ms ueberschritten (untaetig)` });
    });

    socket.on("error", (fehler: unknown) => {
      // Ohne diesen Zuhoerer ist ein Socket-`error` eine uncaught exception —
      // auch der, der nach einer bereits ausgewerteten Antwort eintrifft (RST).
      abschluss({ art: "error", grund: socketGrund(fehler, host, port) });
    });

    socket.on("close", () => {
      // Der Fall „Antwort ohne NUL, dann Abbruch". Der Grund nennt das
      // Empfangene: „error" ohne Anhaltspunkt waere fuer den Betreiber wertlos.
      abschluss({
        art: "error",
        grund:
          puffer === ""
            ? `Verbindung zu ${host}:${port} ohne Antwort geschlossen`
            : `unvollstaendige Antwort des Scanners: ${puffer}`,
      });
    });
  });
}

/**
 * Einmal je Prozess, nicht je Aufruf: unter HMR laeuft `registriereNetzhaken()`
 * mehr als einmal, und zwei Zuhoerer loggten doppelt und beendeten doppelt.
 */
let netzhakenGesetzt = false;

/**
 * Der prozessweite Netzhaken (§6.4) — die ZWEITE Linie hinter dem Vertrag
 * oben. Gerufen wird er aus `src/instrumentation.ts`, wo `register()` einmal
 * beim Boot laeuft.
 *
 * Er ist GENERISCH — er kennt weder `files` noch `aufgaben` noch clamd — und
 * liegt deshalb hier statt in einem der beiden Module: sonst braeuchte jedes
 * Modul mit einer eigenen Scan-Warteschlange (T17/T18) seine eigene Flagge
 * und seine eigene Registrierung fuer dieselben zwei Ereignisse, und die
 * Zusage „einmal je Prozess" gaelte dann zweimal statt einmal.
 *
 * Warum er HIER liegt und nicht in `instrumentation.ts`: die Datei wird auch
 * fuer das Edge-Bundle uebersetzt, und der Bundler sieht `process.on` statisch —
 * mit Runtime-Guard davor oder nicht. Gemessen war die Folge eine
 * Edge-Runtime-Warnung bei jedem `pnpm dev`. Von dort holt ihn ein
 * DYNAMISCHER Import (`await import("@/core/av/scanner")`), genau wie
 * `core/bootstrap` — und ein dynamischer Import haelt sein Ziel aus dem
 * statisch analysierten Edge-Bundle heraus. Dieser Grund haengt an der Art
 * des Imports aus `instrumentation.ts`, nicht am Ablageort dieser Datei, und
 * gilt nach der Verschiebung unveraendert weiter.
 *
 * Die beiden Ereignisse werden ABSICHTLICH verschieden behandelt:
 * `unhandledRejection` loggt und beendet NICHT (ein verlorenes Promise ist kein
 * Grund, die ganze Suite abzuschalten), `uncaughtException` loggt und beendet
 * dann mit 1 — ein unterdrueckter uncaughtException laesst den Prozess in einem
 * undefinierten Zustand, und `restart: unless-stopped` (`compose.yaml:4`) ist
 * der ehrlichere Weg.
 *
 * Tragend ist `scanne` selbst; dieser Haken ist das Netz darunter und darf
 * nicht als Ersatz gelesen werden.
 */
export function registriereNetzhaken(): void {
  if (netzhakenGesetzt) return;
  netzhakenGesetzt = true;
  process.on("unhandledRejection", (grund) => {
    console.error("[suite] unhandledRejection — der Prozess laeuft weiter:", grund);
  });
  process.on("uncaughtException", (fehler) => {
    console.error("[suite] uncaughtException — der Prozess wird beendet:", fehler);
    process.exit(1);
  });
}
