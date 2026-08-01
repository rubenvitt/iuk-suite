/**
 * Der Scanner-Vertrag des Moduls `files` (Spec §6.2–§6.4).
 *
 * Zusage, absolut: `scanne(ziel)` settelt IMMER und GENAU EINMAL und wirft nie
 * asynchron. Ein Protokollfehler, eine Zeitüberschreitung, ein nicht
 * erreichbarer Scanner und eine kaputte Konfiguration sind alle dasselbe:
 * ein RÜCKGABEWERT `{art:"error"}`.
 *
 * Der belegte Anlass ist `drop`: sein `parseResponse` wirft bei jeder
 * unerwarteten Antwort, und der Wurf passiert im `socket.on('end')`-Callback
 * (`antivirus.js:11-26,56-58`) — also ausserhalb der synchronen Ausführung des
 * Promise-Konstruktors. Daraus wird KEINE Rejection, sondern eine uncaught
 * exception; das Promise settelt nie, und im Monolithen reisst das `portal`,
 * `qr` und `feedback` mit. Gemessen: Exit-Code 1.
 *
 * Deshalb gelten hier vier Bauregeln, und alle vier stehen bewusst VOR dem
 * ersten Ereignis-Zuhörer: `av.test.ts` scannt den Quelltext daraufhin, dass ab
 * dem ersten Zuhörer das Wort „wirf" (englisch) nirgends mehr vorkommt — und
 * ein Scan liest Kommentare mit, also gilt die Regel auch für diese Erklärung:
 *
 * 1. Es gibt genau EIN `abschluss(ergebnis)`, durch ein `bereits`-Flag
 *    idempotent, und ALLE Ereignisse laufen durch ihn (`error`, `close`,
 *    `timeout`, Zeitgrenze, Parse-Ergebnis).
 * 2. Kein Handler wirft. Ein Parse-Fehler ist ein Rückgabewert.
 * 3. Eine harte Zeitgrenze (`FILES_AV_TIMEOUT_MS`) läuft unabhängig vom Socket.
 * 4. `socket.destroy()` in JEDEM Ausgang — sonst leckt der Descriptor. Zeuge
 *    dafür ist in der Testsuite der Server, nicht das Promise.
 *
 * Was hier NICHT existiert und nicht entstehen darf: ein fail-open-Schalter.
 * `istFreigegeben` kennt einen Wert. Drops `AV_FAIL_OPEN` war in beiden
 * Stellungen wirkungslos, weil sein `catch`-Block für Protokollfehler nie
 * erreicht wurde — ein Schalter, der Sicherheit verspricht und keine liefert,
 * ist schlimmer als keiner (§6.3).
 */
import net from "node:net";
import { and, eq, isNotNull } from "drizzle-orm";

import { grenzen, type Grenzen } from "./grenzen";
import { scanPfad, type BlobZiel } from "./storage";

/**
 * EINE Konstante für BEIDE Tabellen (`share_files` und `inbox_files`, §4.6).
 * Zwei Listen wären zwei Statusmodelle, und das ist der belegte Preis von E18:
 * `drop` und `easy-filesharing` führen denselben Zustand unter verschiedenen
 * Namen, und keine Freigabeprüfung galt für beide.
 */
export const AV_STATUS = ["scanning", "clean", "infected", "error", "unscanned"] as const;

export type AvStatus = (typeof AV_STATUS)[number];

/**
 * DIE Freigabeprüfung. Genau ein Wert gibt frei, und alle Lesewege rufen sie
 * (Download, ZIP, Vorschau, Inbox-Download, ZIP-Zusammenstellung).
 *
 * `unscanned` gibt ausdrücklich NICHT frei: es ist der Altbestand aus dem
 * Spec-2-Import, also gerade der Fall, der noch niemand geprüft hat.
 */
export function istFreigegeben(status: AvStatus): boolean {
  return status === "clean";
}

/**
 * Einmal je Prozess, nicht je Aufruf: unter HMR läuft `register()` mehr als
 * einmal, und zwei Zuhörer loggten doppelt und beendeten doppelt.
 */
let netzhakenGesetzt = false;

/**
 * Der prozessweite Netzhaken (§6.4) — die ZWEITE Linie hinter dem Vertrag
 * darunter. Gerufen wird er aus `src/instrumentation.ts`, wo `register()` einmal
 * beim Boot läuft.
 *
 * Warum er HIER liegt und nicht dort: `instrumentation.ts` wird auch für das
 * Edge-Bundle übersetzt, und der Bundler sieht `process.on` statisch — mit
 * Runtime-Guard davor oder nicht. Gemessen war die Folge eine
 * Edge-Runtime-Warnung bei jedem `pnpm dev`. Von hier holt sie ein dynamischer
 * Import, genau wie `core/bootstrap`.
 *
 * Die beiden Ereignisse werden ABSICHTLICH verschieden behandelt:
 * `unhandledRejection` loggt und beendet NICHT (ein verlorenes Promise ist kein
 * Grund, die ganze Suite abzuschalten), `uncaughtException` loggt und beendet
 * dann mit 1 — ein unterdrückter uncaughtException lässt den Prozess in einem
 * undefinierten Zustand, und `restart: unless-stopped` (`compose.yaml:4`) ist
 * der ehrlichere Weg.
 *
 * Tragend ist `scanne` selbst; dieser Haken ist das Netz darunter und darf nicht
 * als Ersatz gelesen werden.
 */
export function registriereNetzhaken(): void {
  if (netzhakenGesetzt) return;
  netzhakenGesetzt = true;
  process.on("unhandledRejection", (grund) => {
    console.error("[suite] unhandledRejection — der Prozess läuft weiter:", grund);
  });
  process.on("uncaughtException", (fehler) => {
    console.error("[suite] uncaughtException — der Prozess wird beendet:", fehler);
    process.exit(1);
  });
}

export type AvErgebnis =
  | { art: "clean" }
  | { art: "infected"; signatur: string }
  | { art: "error"; grund: string };

/** Der Rahmen des clamd-Protokolls: `z`-Präfix beim Kommando, NUL als Ende. */
const NUL = "\0";

/**
 * Die Auswertung nach §6.3.3 — und ausdrücklich OHNE Verlass auf ein
 * `stream:`-Präfix. Gemessen antwortet eine Übergrösse
 * `INSTREAM size limit exceeded. ERROR`, also ohne Präfix; wer auf das Präfix
 * prüft, hält diese Antwort für unbekannt und (schlimmer) eine Antwort mit
 * Präfix für vertrauenswürdig.
 *
 * Reihenfolge ist Absicht: erst ` FOUND`, dann das exakte `<irgendwas>: OK`,
 * und alles andere ist `error` mit der ROHEN Antwort als Grund. Ein blankes
 * `OK` ohne Präfix ist damit kein Freibrief — die Spec sagt „genau
 * `stream: OK` bzw. `<pfad>: OK`", und die Lücke wäre eine Freigabe durch
 * Zufall.
 */
function werteAntwortAus(roh: string): AvErgebnis {
  const antwort = roh.trim();
  const FUND = " FOUND";
  if (antwort.endsWith(FUND)) {
    const davor = antwort.slice(0, -FUND.length);
    // Das Präfix ist `<pfad>: ` oder `stream: `. Der Pfad besteht aus IDs und
    // enthält kein `: ` (siehe `_lib/storage.ts`), deshalb ist die LETZTE
    // Vorkommnis die Trennstelle und die Signatur der Rest.
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
 * Der Grund für einen Socket-Fehler wird SELBST gebaut, nicht aus
 * `fehler.message` abgeschrieben: §6.8 sagt wörtlich `ECONNREFUSED <host>:<port>`
 * zu, und dieser String ist der Unterschied zwischen „der Scanner ist kaputt"
 * und „`pnpm dev:av` vergessen". Node schreibt ihn heute zufällig ähnlich; das
 * ist eine Bibliotheksmeldung und keine Zusage.
 */
function socketGrund(fehler: unknown, host: string, port: number): string {
  const code = errnoCode(fehler);
  const adresse = `${host}:${port}`;
  if (code !== undefined) return `${code} ${adresse}`;
  const botschaft = fehler instanceof Error ? fehler.message : String(fehler);
  return `Socketfehler ${adresse}: ${botschaft}`;
}

/**
 * Settelt IMMER, genau EINMAL. Wirft nie asynchron.
 *
 * Transport ist `zSCAN <pfad>` (kein INSTREAM): clamd liest die Datei selbst,
 * statt die Bytes ein zweites Mal über einen Socket zu schicken. Der Pfad kommt
 * aus `_lib/storage.ts` — die einzige Stelle, an der im Modul ein Pfad entsteht.
 */
export async function scanne(ziel: BlobZiel): Promise<AvErgebnis> {
  let host: string;
  let port: number;
  let timeoutMs: number;
  let pfad: string;
  try {
    // Zahlen und Adresse kommen aus `_lib/grenzen.ts` und werden bei JEDEM
    // Aufruf gelesen — ein modulweit festgehaltener Wert wäre in Tests und beim
    // Boot eine stille Falle. `process.env` direkt zu lesen wäre eine zweite
    // Zahlenquelle neben §9.3.
    const g = grenzen();
    host = g.avHost;
    port = g.avPort;
    timeoutMs = g.avTimeoutMs;
    pfad = scanPfad(ziel);
  } catch (fehler) {
    // Ein Konfigurationsfehler (`GrenzenUngueltig`) oder eine verdorbene ID
    // (`UngueltigeId`) darf die Zusage „settelt immer" nicht brechen: die
    // Warteschlange aus T17 müsste sonst einen zweiten Fehlerweg kennen, und ein
    // Rejection-Pfad, den niemand behandelt, ist genau der Ausfall von oben.
    // Fail-closed plus LAUTE Logzeile — sonst sieht der Betreiber einen
    // AV-Fehler an der Datei und sucht in der falschen Schicht.
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`[files][av] Scan nicht möglich, bevor eine Verbindung entstand: ${grund}`);
    return { art: "error", grund };
  }

  return new Promise<AvErgebnis>((erfuelle) => {
    let bereits = false;
    let puffer = "";

    const socket = net.createConnection({ host, port });

    // Die harte Zeitgrenze läuft am Socket VORBEI: `socket.setTimeout` ist eine
    // Untätigkeitsgrenze und wird von jedem einzelnen Byte zurückgesetzt — ein
    // Scanner, der langsam Unsinn tröpfelt, käme damit nie an ein Ende.
    //
    // Sie steht VOR `abschluss`, obwohl sie ihn ruft: ein Timer feuert nie im
    // selben Zug wie seine Registrierung, also ist der Zugriff zur Laufzeit
    // aufgelöst. Umgekehrt bräuchte `abschluss` sonst ein `let uhr` mit
    // Undefined-Zweig, den niemand erreichen kann.
    const uhr = setTimeout(() => {
      abschluss({ art: "error", grund: `Zeitgrenze von ${timeoutMs} ms überschritten` });
    }, timeoutMs);

    const abschluss = (ergebnis: AvErgebnis): void => {
      if (bereits) return;
      bereits = true;
      clearTimeout(uhr);
      socket.destroy();
      erfuelle(ergebnis);
    };

    // Zusätzlich die Untätigkeitsgrenze: sie beendet den häufigen Fall (Scanner
    // nimmt an und schweigt) am Socket selbst, statt ihn nur auszusitzen.
    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.write(`zSCAN ${pfad}${NUL}`);
    });

    socket.on("data", (stueck: Buffer) => {
      puffer += stueck.toString("utf8");
      const ende = puffer.indexOf(NUL);
      // Die ERSTE vollständige Antwort entscheidet. Erst auf `end` über den
      // gesamten Puffer auszuwerten hiesse: ein Scanner, der zweimal redet,
      // bestimmt das Ergebnis mit seinem letzten Wort.
      if (ende >= 0) abschluss(werteAntwortAus(puffer.slice(0, ende)));
    });

    socket.on("timeout", () => {
      abschluss({ art: "error", grund: `Zeitgrenze von ${timeoutMs} ms überschritten (untätig)` });
    });

    socket.on("error", (fehler: unknown) => {
      // Ohne diesen Zuhörer ist ein Socket-`error` eine uncaught exception —
      // auch der, der nach einer bereits ausgewerteten Antwort eintrifft (RST).
      abschluss({ art: "error", grund: socketGrund(fehler, host, port) });
    });

    socket.on("close", () => {
      // Der Fall „Antwort ohne NUL, dann Abbruch". Der Grund nennt das
      // Empfangene: „error" ohne Anhaltspunkt wäre für den Betreiber wertlos.
      abschluss({
        art: "error",
        grund:
          puffer === ""
            ? `Verbindung zu ${host}:${port} ohne Antwort geschlossen`
            : `unvollständige Antwort des Scanners: ${puffer}`,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Die Warteschlange (§6.4 „Warteschlange und Neustart").
//
// Sie IST die Datenbank: die Warteschlange ist die Menge der Zeilen mit
// `av_status = 'scanning'`. Es gibt daneben KEINE Liste offener Auftraege — und
// das ist der Grund, warum ein Neustart nichts verliert: der ganze Zustand liegt
// in zwei Tabellen, und der Start liest sie einfach.
//
// Was hier zusaetzlich im Prozessspeicher lebt, ist ausdruecklich KEIN zweiter
// Zustand, sondern gegenseitiger Ausschluss und eine Zaehlung: `inArbeit`
// verhindert, dass Takt und Sofortscan dieselbe Zeile doppelt scannen, und
// `laufendeScans` haelt die Nebenlaeufigkeit auf `FILES_AV_PARALLEL`. Nach einem
// Neustart sind beide von sich aus leer, und die Warteschlange ist unveraendert.
// ---------------------------------------------------------------------------

/** Beide Tabellen fuehren denselben Zustand (§4.6) — beide gehoeren dazu. */
export type AvTabelle = "share_files" | "inbox_files";

/** Was ein Lauf an EINER Zeile entschieden hat. `grund` fehlt genau bei `clean`. */
export interface AvBefund {
  readonly tabelle: AvTabelle;
  readonly id: string;
  readonly status: "clean" | "infected" | "error";
  readonly grund?: string;
}

/**
 * Datenbank und Tabellen kommen NUR als Typ und per DYNAMISCHEM Import herein —
 * `_db/client` zieht `@/core/db` und damit `better-sqlite3`, ein natives Modul.
 *
 * Der Grund ist die andere Haelfte dieser Datei: `AV_STATUS` und
 * `istFreigegeben` sind genau die Namen, nach denen eine spaetere Oberflaeche
 * greift (ein Zustands-Chip, eine Zeilenaktion). Ist eines dieser Module
 * `"use client"`, buendelt Next den GANZEN statischen Importbaum fuer den
 * Browser — und `better-sqlite3` laesst sich dort nicht aufloesen. Der Bau
 * bricht dann in einer Datei ab, die mit der Warteschlange nichts zu tun hat,
 * und niemand sucht hier. Genau dieselbe Ueberlegung fuehrt in
 * `src/instrumentation.ts` zum dynamischen Import von `core/bootstrap`.
 *
 * Die Spaltung dieser Datei waere die Alternative und ist ausgeschlossen:
 * `_lib/av.ts` bleibt EINE Datei (Plan §1, letzter Absatz).
 */
export type FilesDb = ReturnType<typeof import("../_db/client").getDb>;
/** Die beiden Tabellen als WERTE — sie stehen in Drizzle-Ausdruecken. */
type Tabellen = Pick<typeof import("../_db/schema"), "shareFiles" | "inboxFiles">;

async function holeTabellen(): Promise<Tabellen> {
  const { shareFiles, inboxFiles } = await import("../_db/schema");
  return { shareFiles, inboxFiles };
}

async function holeDb(db: FilesDb | undefined): Promise<FilesDb> {
  if (db !== undefined) return db;
  const { getDb } = await import("../_db/client");
  return getDb();
}

interface Auftrag {
  readonly tabelle: AvTabelle;
  readonly id: string;
  readonly ziel: BlobZiel;
  /** Annahmezeit in Millisekunden — die Sortierschluessel beider Tabellen. */
  readonly empfangen: number;
}

/**
 * Der Zeitgeber der Warteschlange. `unref` ist zweimal tragend: unter Vitest
 * haelt ein lebender Timer den ganzen Lauf offen, und unter HMR bliebe je
 * Neuladung einer stehen.
 */
function schlafe(ms: number): Promise<void> {
  return new Promise<void>((weiter) => {
    const uhr = setTimeout(weiter, ms);
    uhr.unref?.();
  });
}

// --- Nebenlaeufigkeitsschranke ---------------------------------------------

let laufendeScans = 0;
/** Die Weckrufe der Warter, FIFO — damit die Empfangsreihenfolge erhalten bleibt. */
const platzWarter: Array<() => void> = [];

/**
 * Genau `FILES_AV_PARALLEL` Scans gleichzeitig.
 *
 * **Kein globaler Semaphore ueber den Upload-Weg** (§6.4, letzter Absatz): in
 * `drop` umschliesst ein einziger Semaphore beide Upload-Routen UND den Scan,
 * ohne Wartezeitgrenze; gemessen ist mit haengendem Scanner nach 1200 ms keine
 * von vier Anfragen beantwortet. Diese Schranke sitzt AUSSCHLIESSLICH um den
 * Scan, der hinter der Antwort liegt — sie kann den Upload-Weg nicht stauen.
 *
 * Die Pruefung laeuft synchron beim Eintritt, und `verarbeite` wird in
 * Auftragsreihenfolge aufgerufen: damit stehen die Warter in Empfangsreihenfolge
 * in der Liste, und bei `FILES_AV_PARALLEL = 1` ist die Abarbeitung strikt
 * sequenziell in genau dieser Reihenfolge.
 */
async function mitPlatz<T>(parallel: number, arbeit: () => Promise<T>): Promise<T> {
  while (laufendeScans >= parallel) {
    await new Promise<void>((frei) => platzWarter.push(frei));
  }
  laufendeScans += 1;
  try {
    return await arbeit();
  } finally {
    laufendeScans -= 1;
    platzWarter.shift()?.();
  }
}

// --- Die Warteschlange lesen ----------------------------------------------

/**
 * DIE eine Auswahl. Zwei Bedingungen, und beide sind begruendet:
 *
 * 1. `av_status = 'scanning'` — und ausdruecklich OHNE `av_geprueft_at IS NULL`.
 *    §6.4 beschreibt mit beiden Bedingungen den BOOT-Fall (eine mitten im Scan
 *    abgebrochene Zeile); als Filter waere die zweite Bedingung ein Defekt:
 *    `avWiederholenAction` setzt `error → scanning` und laesst `av_geprueft_at`
 *    stehen (T45), die wiedereingereihte Zeile fiele also aus der Auswahl und
 *    der Wiederholen-Knopf waere ein Knopf ohne Wirkung. Diese Auswahl ist eine
 *    Obermenge der Zusage und erfuellt sie deshalb.
 * 2. `bytes_vollstaendig_at IS NOT NULL` — eine Zeile ohne Bytes hat noch keine
 *    Blobdatei, nur eine `.part`-Zwischendatei (§4.4). clamd antwortete darauf
 *    „Can't access file ERROR", und nach `FILES_AV_VERSUCHE` stuende eine Datei
 *    auf `error`, die gerade voellig in Ordnung entsteht — fail-closed, also
 *    dauerhaft nicht herunterladbar. Eingereiht wird sie vom LETZTEN Chunk.
 */
function auftraege(db: FilesDb, t: Tabellen): Auftrag[] {
  const { shareFiles, inboxFiles } = t;
  const ausShares = db
    .select({ id: shareFiles.id, shareId: shareFiles.shareId, zeit: shareFiles.createdAt })
    .from(shareFiles)
    .where(and(eq(shareFiles.avStatus, "scanning"), isNotNull(shareFiles.bytesVollstaendigAt)))
    .all()
    .map(
      (z): Auftrag => ({
        tabelle: "share_files",
        id: z.id,
        ziel: { art: "share", shareId: z.shareId, fileId: z.id },
        empfangen: z.zeit.getTime(),
      }),
    );
  const ausInbox = db
    .select({ id: inboxFiles.id, zeit: inboxFiles.empfangenAt })
    .from(inboxFiles)
    .where(and(eq(inboxFiles.avStatus, "scanning"), isNotNull(inboxFiles.bytesVollstaendigAt)))
    .all()
    .map(
      (z): Auftrag => ({
        tabelle: "inbox_files",
        id: z.id,
        ziel: { art: "inbox", inboxFileId: z.id },
        empfangen: z.zeit.getTime(),
      }),
    );

  // `share_files.created_at` und `inbox_files.empfangen_at` sind DIESELBE Uhr —
  // die Annahmezeit. Die Namen unterscheiden sich (§4.3 gegen §4.6), die
  // Bedeutung nicht, und deshalb ist eine gemeinsame Reihenfolge ueber beide
  // Tabellen die richtige.
  //
  // Der ID-Stichentscheid ist nicht Kosmetik: die Zeitstempel sind SEKUNDEN, in
  // einer Sekunde koennen mehrere Dateien ankommen, und ohne ihn haengt die
  // Reihenfolge dann an der Rueckgabereihenfolge zweier SELECTs. „Deterministisch"
  // waere sonst eine Zusage, die niemand einhaelt.
  return [...ausShares, ...ausInbox].sort(
    (a, b) => a.empfangen - b.empfangen || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

// --- Eine Zeile abarbeiten -------------------------------------------------

/**
 * `FILES_AV_VERSUCHE` Versuche im Abstand `FILES_AV_WIEDERHOLUNG_SEKUNDEN`,
 * und die Wiederholung sitzt INNERHALB eines Auftrags.
 *
 * 5 × 60 s ist keine Kosmetik: clamd braucht nach einem Neustart eine
 * Groessenordnung von zwei Minuten bis zur Bereitschaft (§6.5). Fuenf
 * unmittelbar folgende Versuche waeren nach Sekunden erschoepft und liessen
 * jede in diesem Fenster hochgeladene Datei in `error` fallen — fail-closed,
 * also nicht herunterladbar, obwohl der Scanner zwei Minuten spaeter da ist.
 *
 * Wiederholt wird bei JEDEM `error`, nicht nur bei „Scanner unerreichbar".
 * §6.7 liest sich, als unterschiede es die Faelle; die Unterscheidung waere
 * aber nur ueber den Grund-String zu treffen, also ueber eine Textpruefung auf
 * eine Scanner-Meldung — und die falsche Einordnung kostet in einer Richtung
 * eine dauerhaft gesperrte Datei. Die andere Richtung kostet Zeit, und auch die
 * nur in einem Fall, den §9.4 im Normalbetrieb ausschliesst (eine Uebergroesse
 * wird schon beim Upload benannt abgelehnt).
 */
async function scanneMitWiederholung(
  ziel: BlobZiel,
  versuche: number,
  abstandMs: number,
): Promise<AvErgebnis> {
  let letztes: AvErgebnis = { art: "error", grund: "kein Versuch ausgefuehrt" };
  for (let n = 1; n <= versuche; n += 1) {
    letztes = await scanne(ziel);
    if (letztes.art !== "error") return letztes;
    if (n < versuche) await schlafe(abstandMs);
  }
  return letztes;
}

/**
 * Das Ergebnis in die Zeile schreiben — mit `av_status = 'scanning'` als
 * Vorbehalt im WHERE.
 *
 * Die Zusage „kein Rueckweg" traegt die AUSWAHL (`auftraege`): eine `clean`- oder
 * `infected`-Zeile kommt nie in einen Lauf, und genau das haelt `av.test.ts`
 * fest. Dieser Vorbehalt ist die zweite Linie fuer die Zeitspanne DAZWISCHEN:
 * zwischen Auswahl und Schreiben liegen bis zu
 * `FILES_AV_VERSUCHE × FILES_AV_WIEDERHOLUNG_SEKUNDEN`, und wer die Zeile in
 * diesem Fenster wegloescht oder anders entscheidet, soll sie nicht durch ein
 * spaet eintreffendes Scan-Ergebnis zurueckgedreht bekommen. Er kostet nichts
 * und braucht keine Vorab-Pruefung, die selbst ein Wettlauf waere.
 *
 * **Kein Weg des Moduls stellt diesen Wettlauf her** — bei „ein Container, ein
 * Arbeiter" (§6.4, T22) gibt es keinen zweiten Schreiber. Der Vorbehalt steht
 * deshalb als benannte Absicherung hier. Belegt ist dagegen, was PASSIERT, wenn
 * er greift: `av.test.ts` stellt die Lage per direktem SQL her und haelt fest,
 * dass die Zeile unveraendert bleibt UND der Lauf keinen Befund meldet.
 *
 * Daran haengt die Rueckgabe: ein `AvBefund` behauptet einen Zustand der ZEILE.
 * Hat das UPDATE keine getroffen, hat die Zeile diesen Zustand nicht, und ein
 * Befund waere eine stille Falschaussage an jeden spaeteren Verbraucher (T22,
 * T45) — deshalb `null`. Der Grund geht dabei nicht verloren: er steht in der
 * Logzeile, denn ein `error` mit `changes = 0` heisst BEIDES, der Scanner ist
 * kaputt UND die Zeile ist weitergezogen.
 */
function schreibe(
  db: FilesDb,
  t: Tabellen,
  auftrag: Auftrag,
  ergebnis: AvErgebnis,
  versuche: number,
): AvBefund | null {
  const { shareFiles, inboxFiles } = t;
  const status: AvStatus = ergebnis.art;
  const jetzt = new Date();
  const wo = `${auftrag.tabelle}/${auftrag.id}`;
  const treffer =
    auftrag.tabelle === "share_files"
      ? db
          .update(shareFiles)
          .set({ avStatus: status, avGeprueftAt: jetzt })
          .where(and(eq(shareFiles.id, auftrag.id), eq(shareFiles.avStatus, "scanning")))
          .run()
      : db
          .update(inboxFiles)
          .set({ avStatus: status, avGeprueftAt: jetzt })
          .where(and(eq(inboxFiles.id, auftrag.id), eq(inboxFiles.avStatus, "scanning")))
          .run();

  if (treffer.changes === 0) {
    const nachtrag = ergebnis.art === "clean" ? "" : `: ${ergebnisGrund(ergebnis)}`;
    console.error(
      `[files][av] ${wo} war nicht mehr 'scanning' — Ergebnis '${status}' verworfen${nachtrag}`,
    );
    return null;
  }

  if (ergebnis.art === "infected") {
    console.error(`[files][av] Fund in ${wo}: ${ergebnis.signatur}`);
    return { tabelle: auftrag.tabelle, id: auftrag.id, status, grund: ergebnis.signatur };
  }
  if (ergebnis.art === "error") {
    // Es gibt KEINE `av_grund`-Spalte (§4.3, §4.6): das Log ist der einzige Ort,
    // an dem der Betreiber erfaehrt, WARUM die Pruefung nicht moeglich war —
    // und `ECONNREFUSED <host>:<port>` ist der Unterschied zwischen „AV kaputt"
    // und „`pnpm dev:av` vergessen" (§6.8).
    console.error(
      `[files][av] Pruefung nicht moeglich fuer ${wo} nach ${versuche} Versuch(en): ${ergebnis.grund}`,
    );
    return { tabelle: auftrag.tabelle, id: auftrag.id, status, grund: ergebnis.grund };
  }
  return { tabelle: auftrag.tabelle, id: auftrag.id, status };
}

/** Der sprechende Teil eines Ergebnisses — `clean` hat keinen, und das ist der Punkt. */
function ergebnisGrund(ergebnis: AvErgebnis): string {
  if (ergebnis.art === "infected") return ergebnis.signatur;
  if (ergebnis.art === "error") return ergebnis.grund;
  return "";
}

/** Prozessweiter gegenseitiger Ausschluss je Zeile — Takt und Sofortscan treffen sich hier. */
const inArbeit = new Set<string>();

async function verarbeite(
  db: FilesDb,
  t: Tabellen,
  auftrag: Auftrag,
  g: Grenzen,
): Promise<AvBefund | null> {
  const schluessel = `${auftrag.tabelle}/${auftrag.id}`;
  if (inArbeit.has(schluessel)) return null;
  inArbeit.add(schluessel);
  try {
    const ergebnis = await mitPlatz(g.avParallel, () =>
      scanneMitWiederholung(auftrag.ziel, g.avVersuche, g.avWiederholungSekunden * 1000),
    );
    return schreibe(db, t, auftrag, ergebnis, g.avVersuche);
  } finally {
    inArbeit.delete(schluessel);
  }
}

/**
 * Die Zahlen einmal je Runde, nicht je Zeile. Eine ungueltige Konfiguration
 * ueberspringt die Runde LAUT und laesst die Zeilen auf `scanning` stehen
 * (fail-closed); der Normalbetrieb kann hier nicht ankommen, weil `_lib/boot.ts`
 * den Start abbricht, sobald das Modul eine Domain hat (§9.4).
 */
function zahlenOderNull(zweck: string): Grenzen | null {
  try {
    return grenzen();
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`[files][av] ${zweck} uebersprungen, die Zahlen sind ungueltig: ${grund}`);
    return null;
  }
}

/**
 * EINE Runde: alles, was gerade `scanning` ist, in Empfangsreihenfolge, mit
 * fester Nebenlaeufigkeit. Settelt erst, wenn jede Zeile entschieden ist.
 */
export async function arbeiteAvWarteschlangeAb(db?: FilesDb): Promise<AvBefund[]> {
  const g = zahlenOderNull("Runde der AV-Warteschlange");
  if (g === null) return [];
  const bank = await holeDb(db);
  const t = await holeTabellen();
  // Alle Auftraege werden in Reihenfolge ANGESTOSSEN; die Schranke oben
  // serialisiert sie auf `FILES_AV_PARALLEL`.
  const ergebnisse = await Promise.all(
    auftraege(bank, t).map((a) => verarbeite(bank, t, a, g)),
  );
  return ergebnisse.filter((b): b is AvBefund => b !== null);
}

// --- Der Arbeiter ----------------------------------------------------------

let arbeiterLaeuft = false;
let taktUhr: ReturnType<typeof setTimeout> | undefined;
let taktEnde: (() => void) | undefined;

function taktSchlaf(ms: number): Promise<void> {
  return new Promise<void>((weiter) => {
    taktEnde = weiter;
    taktUhr = setTimeout(() => {
      taktUhr = undefined;
      taktEnde = undefined;
      weiter();
    }, ms);
    taktUhr.unref?.();
  });
}

function beendeTakt(): void {
  if (taktUhr !== undefined) clearTimeout(taktUhr);
  const weiter = taktEnde;
  taktUhr = undefined;
  taktEnde = undefined;
  weiter?.();
}

/**
 * Der Takt ist `FILES_AV_WIEDERHOLUNG_SEKUNDEN` — bewusst dieselbe Zahl und
 * keine zweite: §9.3 verlangt EINE Quelle je Zahl, und eine eigene
 * Abfragefrequenz waere eine erfundene.
 *
 * `Math.max(1, …)`, weil die Zahl 0 sein darf (§9.3, Untergrenze 0) und ein
 * Takt von 0 ms eine Endlosschleife waere, die eine CPU belegt.
 */
function taktMs(): number {
  const g = zahlenOderNull("Takt der AV-Warteschlange");
  // 60 ist die Vorbelegung aus §9.3. Erreichbar ist der Zweig nur mit kaputter
  // Konfiguration, die `_lib/boot.ts` beim Start schon abgewiesen haette.
  const sekunden = g === null ? 60 : g.avWiederholungSekunden;
  return Math.max(1, sekunden) * 1000;
}

async function arbeiterSchleife(db?: FilesDb): Promise<void> {
  while (arbeiterLaeuft) {
    try {
      await arbeiteAvWarteschlangeAb(db);
    } catch (fehler) {
      // Der Vertrag oben settelt immer; sollte dennoch etwas herauskommen, ist
      // eine Logzeile die Antwort und nicht das Ende der Schleife. Eine Runde,
      // die den Arbeiter mitnimmt, waere eine Warteschlange, die ab dem ersten
      // unerwarteten Fehler niemand mehr abarbeitet.
      console.error("[files][av] eine Runde der Warteschlange ist gescheitert:", fehler);
    }
    if (!arbeiterLaeuft) break;
    await taktSchlaf(taktMs());
  }
}

/**
 * Der Arbeiter. Sein Startpunkt liegt NICHT hier, sondern in `_lib/boot.ts`
 * hinter den Migrationen (T22) — diese Datei ruft ihn ausdruecklich nicht
 * selbst. Ein Arbeiter ohne Startpunkt ist eine Warteschlange, die niemand
 * abarbeitet: Uploads werden quittiert, alles bleibt `scanning`, und kein Test
 * wird rot.
 *
 * Die erste Runde IST die Boot-Wiederaufnahme (§6.4): sie liest die Tabellen,
 * und eine Zeile, die beim letzten Prozessende mitten im Scan stand, steht dort
 * als `scanning` mit leerem `av_geprueft_at`. Ohne diesen Schritt bliebe sie
 * fuer immer stehen und der Empfaenger wartet auf etwas, das nie kommt.
 *
 * Idempotent, weil `register()` unter HMR mehr als einmal laeuft — zwei
 * Arbeiter waeren zwei Schleifen, zwei Timer und doppelte Scans.
 *
 * **Ein Container, ein Arbeiter.** `compose.yaml` hat kein `deploy:`/`replicas:`;
 * bei mehreren Instanzen liefe der Takt mehrfach und braeuchte ein Lock.
 */
export function starteAvArbeiter(db?: FilesDb): void {
  if (arbeiterLaeuft) return;
  arbeiterLaeuft = true;
  void arbeiterSchleife(db);
}

/** Haelt den Arbeiter an und beendet einen laufenden Takt sofort. */
export function stoppeAvArbeiter(): void {
  arbeiterLaeuft = false;
  beendeTakt();
}

/**
 * „Diese Zeile ist eingereiht" — gerufen von den Upload-Wegen, sobald die Bytes
 * vollstaendig sind (T27, T31/T50) und von `avWiederholenAction` (T45).
 *
 * Die Zeile steht dann schon als `scanning` in der Datenbank und ist damit
 * bereits Teil der Warteschlange; dieser Aufruf zieht sie nur VOR den naechsten
 * Takt. Ohne ihn waere ein Upload bei erreichbarem Scanner bis zu
 * `FILES_AV_WIEDERHOLUNG_SEKUNDEN` lang auf „wird geprueft" — richtig, aber
 * unnoetig.
 *
 * Zwei Eigenschaften, die daran haengen:
 * - **Ohne laufenden Arbeiter tut der Aufruf nichts**, und das ist Absicht: die
 *   Zeile bleibt `scanning` und wird beim naechsten Start abgeholt. Ein Route
 *   Handler in einem Unit-Test oeffnet damit keine Netzverbindung.
 * - **Die Auswahl ist dieselbe** wie im Takt (`auftraege`), nicht eine zweite:
 *   deshalb ist auch dieser Weg kein Rueckweg — eine `clean`- oder
 *   `infected`-Zeile ist ueber ihn nicht erreichbar.
 */
export function reiheAvEin(ziel: BlobZiel, db?: FilesDb): void {
  if (!arbeiterLaeuft) return;
  const g = zahlenOderNull("Sofortscan");
  if (g === null) return;
  const gesucht = ziel.art === "share" ? ziel.fileId : ziel.inboxFileId;
  const tabelle: AvTabelle = ziel.art === "share" ? "share_files" : "inbox_files";
  const lauf = (async () => {
    const bank = await holeDb(db);
    const t = await holeTabellen();
    const auftrag = auftraege(bank, t).find((a) => a.tabelle === tabelle && a.id === gesucht);
    if (auftrag === undefined) return;
    await verarbeite(bank, t, auftrag, g);
  })();
  void lauf.catch((fehler) => {
    console.error(`[files][av] Sofortscan fuer ${tabelle}/${gesucht} gescheitert:`, fehler);
  });
}
