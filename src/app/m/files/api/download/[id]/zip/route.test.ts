import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import type { Readable } from "node:stream";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/*
 * WAS DIESE DATEI BESITZT (Plan T34, Spec §7.5, §7.7):
 *
 *  - das Archiv selbst — geprueft ueber das ZENTRALVERZEICHNIS des ZIP, nicht
 *    ueber eine Textsuche im Puffer: der Name einer AUSGESCHLOSSENEN Datei steht
 *    woertlich in `_HINWEIS.txt` und damit ebenfalls im Puffer. „Name kommt
 *    nicht vor" waere also keine Aussage ueber die Eintragsliste;
 *  - die Zusage „genau EIN Download, genau EINE Logzeile mit `file_id = NULL`";
 *  - die Pruefkette (404/410/401) und dass 401/403 weder zaehlen noch loggen;
 *  - die Abbruchbehandlung, GEMESSEN an offenen Descriptoren — „der Strom endet"
 *    bliebe auch ohne `req.signal`-Listener gruen;
 *  - „sequenziell": zu keinem Zeitpunkt ist mehr als EIN Quellstrom offen.
 *
 * Was sie NICHT besitzt: die Atomizitaet des Zaehlers (T16,
 * `_db/gleichzeitigkeit.test.ts` gegen echte Prozesse), die Namens- und
 * Ausschlussregeln selbst (T21, `_lib/zip.test.ts`) und die Pruefkette als
 * solche (T15, `_db/queries.test.ts`). Hier steht nur, dass dieser Handler sie
 * in der richtigen Reihenfolge benutzt.
 */

/**
 * Ein PASS-THROUGH-Mock, kein Ersatz: `lieseStrom` laeuft echt, wird aber
 * mitgeschrieben. Nur so ist „sequenziell" (Fertig-wenn-Zeile von T34)
 * ueberhaupt eine Aussage — sie ist an keiner Antwort ablesbar, und ein
 * Quelltext-Scan kann „oeffnet erst, wenn der vorige Eintrag durch ist" nicht
 * sehen.
 */
const beobachtet = vi.hoisted(() => ({
  stroeme: [] as Readable[],
  offenBeiOeffnung: [] as number[],
  /**
   * Ein TOR direkt hinter dem Öffnen. Ohne es ist der Abbruch-Test wertlos: das
   * Archiv einer Handvoll Dateien ist fertig, bevor der erste `read()` des
   * Lesers zurückkommt (gemessen — die Descriptor-Zahl blieb über den ganzen
   * Lauf auf dem Ausgangswert). Der Test hielte dann einen Abbruch NACH dem Ende
   * fuer einen Abbruch waehrend des Streamens und bliebe gruen, waehrend jede
   * Aufraeumzeile fehlt.
   */
  tor: null as Promise<void> | null,
  /**
   * Ein Lesefehler MITTEN im Eintrag — die einzige Lage, in der die Zusicherungen
   * etwas behaupten. Zwei Entscheidungen der Vorrichtung tragen das:
   *
   *  - der Handler bekommt einen Strom, der NICHTS liefert. Ein echter Strom auf
   *    eine kleine Datei ist ausgelesen, bevor der Fehler faellt (gemessen: das
   *    Archiv war fertig, die Kopie im Archivierer voll, der Descriptor zu) —
   *    der Fehler traefe dann einen fertigen Eintrag und der Test bliebe auch
   *    ohne jede Fehlerbehandlung gruen;
   *  - der Fehler kommt als `emit("error")`, NICHT als `destroy(fehler)`, und der
   *    Descriptor der echten Datei haengt am zurueckgegebenen Strom. So schliesst
   *    ihn ausschliesslich das `finally` des Handlers — die Descriptor-Messung
   *    ist damit eine Aussage ueber den Handler und nicht ueber die Vorrichtung.
   */
  fehlerBeimLesen: null as string | null,
}));

vi.mock("@/app/m/files/_lib/storage", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/app/m/files/_lib/storage")>();
  // Wertimport IN der Fabrik: `vi.mock` wird ueber die Importe gehoben, ein
  // Modulbinding von oben waere hier noch nicht initialisiert.
  const { Readable: ReadableWert } = await import("node:stream");
  return {
    ...echt,
    lieseStrom: async (ziel: Parameters<typeof echt.lieseStrom>[0]) => {
      const ergebnis = await echt.lieseStrom(ziel);
      // Gezaehlt wird NACH dem echten Oeffnen, nicht davor: vorher stuenden bei
      // einem `Promise.all` ueber alle Eintraege drei Messungen gleichzeitig auf
      // null, und die Zusage „sequenziell" waere unbeobachtbar (gemessen).
      beobachtet.offenBeiOeffnung.push(
        beobachtet.stroeme.filter((s) => !s.destroyed && !s.readableEnded).length,
      );
      // Verfolgt wird immer der ECHTE Strom — auch im Fehlerfall unten, wo der
      // Handler stattdessen `stockend` bekommt. An ihm haengt der Descriptor,
      // und nur er gehoert in die Messungen und ins Aufraeumen der `afterEach`.
      beobachtet.stroeme.push(ergebnis.strom);
      // Angehalten wird NACH dem Öffnen — genau die Lage, die der Handler
      // aufräumen muss.
      if (beobachtet.tor) await beobachtet.tor;
      if (beobachtet.fehlerBeimLesen !== null) {
        const text = beobachtet.fehlerBeimLesen;
        const echterStrom = ergebnis.strom;
        const stockend = new ReadableWert({
          // Liefert absichtlich nichts: der Eintrag bleibt offen, der Fehler
          // faellt also wirklich MITTEN in ihn hinein.
          read() {},
          destroy(fehler, fertig) {
            // Der Descriptor der echten Datei haengt hier — und nur hier.
            echterStrom.destroy();
            fertig(fehler);
          },
        });
        // `setImmediate`, nicht sofort: der Handler haengt seinen Fehlerhorcher
        // erst an, wenn dieses `await` zurueckgekehrt ist.
        setImmediate(() => stockend.emit("error", new Error(text)));
        return { ...ergebnis, strom: stockend };
      }
      return ergebnis;
    },
  };
});

const DIR = "./.data/files-zip-route-test";
const GEHEIMNIS = "zip-route-test-geheimnis-lang-genug";
const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

const SEK = 1000;
const TAG = 24 * 60 * 60 * SEK;

/**
 * KEINE eingefrorene Uhr: der Handler hat bewusst keinen `jetzt`-Parameter (ein
 * Zeit-Ventil auf einem oeffentlichen Byte-Weg waere ein Angriffspunkt), also
 * werden die Vorrichtungen relativ zur ECHTEN Uhr gelegt. Geschrieben wird ueber
 * Drizzle, NIE ueber rohes SQL mit `Date.now()`: `mode: "timestamp"` fuehrt
 * SEKUNDEN, und ein Millisekundenwert saehe in der Ablaufstufe richtig aus und
 * waere um den Faktor 1000 daneben.
 */
function jetzt(): Date {
  return new Date();
}

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  process.env.AUTH_SECRET = GEHEIMNIS;
  process.env.SUITE_HOST_FILES = `${VERWALTUNG},${INBOX}`;
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  beobachtet.stroeme.length = 0;
  beobachtet.offenBeiOeffnung.length = 0;
  beobachtet.tor = null;
  beobachtet.fehlerBeimLesen = null;
});

afterEach(() => {
  for (const strom of beobachtet.stroeme) strom.destroy();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

async function legeShare(vorgabe: {
  id: string;
  titel?: string;
  ablaufAt?: Date;
  maxDownloads?: number | null;
  downloadCount?: number;
  passwort?: string;
}) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
  const { bcryptHash } = await import("@/app/m/files/_lib/passwort");
  getDb()
    .insert(shares)
    .values({
      id: vorgabe.id,
      title: vorgabe.titel ?? "Übung Nord",
      description: null,
      type: "folder",
      expiresAt: vorgabe.ablaufAt ?? new Date(jetzt().getTime() + 7 * TAG),
      maxDownloads: vorgabe.maxDownloads ?? null,
      downloadCount: vorgabe.downloadCount ?? 0,
      passwordHash: vorgabe.passwort ? bcryptHash(vorgabe.passwort) : null,
      totalSize: 0,
      createdAt: jetzt(),
      createdBy: "sub-1",
    })
    .run();
}

async function legeDatei(vorgabe: {
  id: string;
  shareId: string;
  dateiname?: string;
  inhalt?: Buffer;
  avStatus?: "scanning" | "clean" | "infected" | "error" | "unscanned";
  vollstaendig?: boolean;
  mitBlob?: boolean;
}) {
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shareFiles } = await import("@/app/m/files/_db/schema");
  const vollstaendig = vorgabe.vollstaendig ?? true;
  const inhalt = vorgabe.inhalt ?? Buffer.from(`Inhalt von ${vorgabe.id}`, "utf8");

  getDb()
    .insert(shareFiles)
    .values({
      id: vorgabe.id,
      shareId: vorgabe.shareId,
      filename: vorgabe.dateiname ?? "bericht.pdf",
      mimeType: "application/pdf",
      size: inhalt.byteLength,
      createdAt: jetzt(),
      bytesVollstaendigAt: vollstaendig ? jetzt() : null,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: vorgabe.avStatus === "scanning" ? null : jetzt(),
    })
    .run();

  if (vorgabe.mitBlob ?? vollstaendig) {
    const echt = await vi.importActual<typeof import("@/app/m/files/_lib/storage")>(
      "@/app/m/files/_lib/storage",
    );
    const ziel = { art: "share", shareId: vorgabe.shareId, fileId: vorgabe.id } as const;
    async function* quelle() {
      yield new Uint8Array(inhalt);
    }
    await echt.schreibeStrom(ziel, quelle(), { maxBytes: 64 * 1024 * 1024 });
    await echt.abschliesse(ziel);
  }
}

type RufOptionen = {
  host?: string;
  cookie?: string;
  ip?: string;
  signal?: AbortSignal;
};

async function ruf(shareId: string, opts: RufOptionen = {}): Promise<Response> {
  const host = opts.host ?? VERWALTUNG;
  const kopf: Record<string, string> = { host };
  if (opts.cookie) kopf.cookie = opts.cookie;
  if (opts.ip) kopf["x-forwarded-for"] = opts.ip;
  const anfrage = new Request(`http://${host}/api/download/${shareId}/zip`, {
    headers: kopf,
    signal: opts.signal,
  });
  const { GET } = await import("@/app/m/files/api/download/[id]/zip/route");
  return GET(anfrage, { params: Promise.resolve({ id: shareId }) });
}

async function cookieFuer(shareId: string): Promise<string> {
  const { erzeugeShareCookie } = await import("@/app/m/files/_lib/passwort");
  const { getDb } = await import("@/app/m/files/_db/client");
  const { shares } = await import("@/app/m/files/_db/schema");
  const { eq } = await import("drizzle-orm");
  const zeile = getDb()
    .select({ ablaufAt: shares.expiresAt })
    .from(shares)
    .where(eq(shares.id, shareId))
    .get();
  const vorlage = erzeugeShareCookie(shareId, zeile!.ablaufAt);
  if (!vorlage) throw new Error("Vorrichtung: kein Cookie fuer einen abgelaufenen Share");
  return `${vorlage.name}=${vorlage.value}`;
}

function lies(): Database.Database {
  return new Database(`${DIR}/files.db`, { readonly: true });
}

function zaehler(shareId: string): number {
  const db = lies();
  const zeile = db.prepare("SELECT download_count AS n FROM shares WHERE id = ?").get(shareId) as
    | { n: number }
    | undefined;
  db.close();
  return zeile?.n ?? -1;
}

type Logzeile = { file_id: string | null; client_ip_unbestaetigt: string | null; user_agent: string | null };

function logzeilen(shareId: string): Logzeile[] {
  const db = lies();
  const zeilen = db
    .prepare(
      "SELECT file_id, client_ip_unbestaetigt, user_agent FROM download_logs WHERE share_id = ? ORDER BY id",
    )
    .all(shareId) as Logzeile[];
  db.close();
  return zeilen;
}

// ---------------------------------------------------------------------------
// Ein ZIP-Leser. `archiver` schreibt nur, ein Entpacker ist nicht installiert
// und darf es nach den Arbeitsregeln auch nicht werden — also wird das
// Zentralverzeichnis hier gelesen. Es ist die einzige Stelle im Archiv, an der
// die EINTRAGSLISTE steht; alles andere waere eine Textsuche im Puffer.
// ---------------------------------------------------------------------------

const EOCD_SIGNATUR = 0x06054b50;
const ZENTRAL_SIGNATUR = 0x02014b50;

function leseZip(puffer: Buffer): { name: string; inhalt: Buffer }[] {
  let eocd = -1;
  for (let i = puffer.length - 22; i >= 0; i--) {
    if (puffer.readUInt32LE(i) === EOCD_SIGNATUR) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Kein ZIP: das Ende des Zentralverzeichnisses fehlt");

  const anzahl = puffer.readUInt16LE(eocd + 10);
  let zeiger = puffer.readUInt32LE(eocd + 16);
  const eintraege: { name: string; inhalt: Buffer }[] = [];

  for (let n = 0; n < anzahl; n++) {
    if (puffer.readUInt32LE(zeiger) !== ZENTRAL_SIGNATUR) {
      throw new Error(`Zentralverzeichnis kaputt bei Eintrag ${n}`);
    }
    const methode = puffer.readUInt16LE(zeiger + 10);
    const komprimiert = puffer.readUInt32LE(zeiger + 20);
    const namenLaenge = puffer.readUInt16LE(zeiger + 28);
    const extraLaenge = puffer.readUInt16LE(zeiger + 30);
    const kommentarLaenge = puffer.readUInt16LE(zeiger + 32);
    const lokal = puffer.readUInt32LE(zeiger + 42);
    const name = puffer.toString("utf8", zeiger + 46, zeiger + 46 + namenLaenge);

    // Im LOKALEN Kopf sind die Groessen beim Streaming 0 (Data Descriptor); die
    // Namens- und Extra-Laengen stimmen dort aber und geben den Datenanfang.
    const lokalName = puffer.readUInt16LE(lokal + 26);
    const lokalExtra = puffer.readUInt16LE(lokal + 28);
    const start = lokal + 30 + lokalName + lokalExtra;
    const roh = puffer.subarray(start, start + komprimiert);

    eintraege.push({ name, inhalt: methode === 0 ? Buffer.from(roh) : inflateRawSync(roh) });
    zeiger += 46 + namenLaenge + extraLaenge + kommentarLaenge;
  }
  return eintraege;
}

function namen(eintraege: { name: string }[]): string[] {
  return eintraege.map((e) => e.name).sort();
}

function hinweisAus(eintraege: { name: string; inhalt: Buffer }[]): string {
  const eintrag = eintraege.find((e) => e.name === "_HINWEIS.txt");
  if (!eintrag) throw new Error("Keine _HINWEIS.txt im Archiv");
  return eintrag.inhalt.toString("utf8");
}

/** Offene Descriptoren des Prozesses. Beide Messungen laufen ueber denselben
 *  Weg, damit der Descriptor des Listings selbst sich heraushebt. */
function offeneDescriptoren(): number {
  return readdirSync("/dev/fd").length;
}

/** Ein paar Makrotasks, damit `destroy()` und `close()` durch sind. */
async function setzenLassen(runden = 20): Promise<void> {
  for (let i = 0; i < runden; i++) await new Promise((f) => setTimeout(f, 5));
}

/** Wartet auf eine Bedingung statt auf eine geratene Zeitspanne. */
async function warteBis(bedingung: () => boolean, runden = 200): Promise<void> {
  for (let i = 0; i < runden; i++) {
    if (bedingung()) return;
    await new Promise((f) => setTimeout(f, 5));
  }
  throw new Error("Vorrichtung: die erwartete Lage trat nicht ein");
}

// ---------------------------------------------------------------------------

describe("Punkt 1 — drei clean-Dateien: drei Eintraege, EIN Download, EINE Logzeile", () => {
  beforeEach(async () => {
    await legeShare({ id: "sh00000001", titel: "Lage Übung" });
    await legeDatei({ id: "fi00000001", shareId: "sh00000001", dateiname: "a.txt", inhalt: Buffer.from("AAA") });
    await legeDatei({ id: "fi00000002", shareId: "sh00000001", dateiname: "b.txt", inhalt: Buffer.from("BBB") });
    await legeDatei({ id: "fi00000003", shareId: "sh00000001", dateiname: "c.txt", inhalt: Buffer.from("CCC") });
  });

  it("liefert genau drei Eintraege mit den richtigen Bytes und OHNE _HINWEIS.txt", async () => {
    const antwort = await ruf("sh00000001");
    expect(antwort.status).toBe(200);
    const eintraege = leseZip(Buffer.from(await antwort.arrayBuffer()));
    // Ohne Fehlliste: eine `_HINWEIS.txt` in einem vollstaendigen Archiv waere
    // eine Luege ueber die Vollstaendigkeit.
    expect(namen(eintraege)).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(eintraege.find((e) => e.name === "b.txt")!.inhalt.toString("utf8")).toBe("BBB");
  });

  it("erhoeht download_count um GENAU 1 — nicht um die Zahl der Dateien", async () => {
    await (await ruf("sh00000001")).arrayBuffer();
    expect(zaehler("sh00000001")).toBe(1);
  });

  it("schreibt GENAU EINE Logzeile mit file_id NULL und gekuerzter Adresse", async () => {
    await (await ruf("sh00000001", { ip: "203.0.113.42" })).arrayBuffer();
    const zeilen = logzeilen("sh00000001");
    expect(zeilen).toHaveLength(1);
    // `file_id = NULL` ist der 1:1-pflichtige Magic Value „ZIP des ganzen
    // Shares" (§4.5) — eine echte fileId hier machte die Audit-Ansicht falsch.
    expect(zeilen[0].file_id).toBeNull();
    // Gekuerzt auf das Netz, nicht der Rohwert (§4.5).
    expect(zeilen[0].client_ip_unbestaetigt).toBe("203.0.113.0");
  });

  it("traegt die Kopfzeilen eines Downloads — und KEIN Accept-Ranges", async () => {
    const antwort = await ruf("sh00000001");
    expect(antwort.headers.get("content-type")).toBe("application/zip");
    expect(antwort.headers.get("x-content-type-options")).toBe("nosniff");
    // Kein Range-Weg (§12): drei Range-Anfragen waeren drei Downloads.
    expect(antwort.headers.get("accept-ranges")).toBeNull();
    // Gestreamt ohne Temp-Datei — die Gesamtlaenge ist beim ersten Byte unbekannt.
    expect(antwort.headers.get("content-length")).toBeNull();
    // Wortgleich zu den vier Geschwister-Byte-Wegen (T33, T49, T51, qr.png):
    // die Antwort haengt an einem Passwort-Cookie UND an einem VERBRAUCHENDEN
    // Zaehler. Eine geteilte Zwischenablage (CDN, Firmenproxy) lieferte beides
    // aus, ohne dass dieser Handler es je saehe — das Limit zaehlte nicht mit,
    // und das Cookie braeuchte der zweite Abrufer gar nicht mehr.
    expect(antwort.headers.get("cache-control")).toBe("private, no-store");
    await antwort.arrayBuffer();
  });
});

describe("Punkt 2 — nicht freigegebene Dateien fehlen und stehen mit Grund im _HINWEIS.txt", () => {
  it("scanning und error fehlen, die _HINWEIS.txt nennt Name UND Grund", async () => {
    await legeShare({ id: "sh00000002" });
    await legeDatei({ id: "fi00000011", shareId: "sh00000002", dateiname: "gut.txt" });
    await legeDatei({ id: "fi00000012", shareId: "sh00000002", dateiname: "laeuft.txt", avStatus: "scanning" });
    await legeDatei({ id: "fi00000013", shareId: "sh00000002", dateiname: "kaputt.txt", avStatus: "error" });

    const eintraege = leseZip(Buffer.from(await (await ruf("sh00000002")).arrayBuffer()));
    expect(namen(eintraege)).toEqual(["_HINWEIS.txt", "gut.txt"]);

    const hinweis = hinweisAus(eintraege);
    expect(hinweis).toContain("laeuft.txt — Die Virenprüfung läuft noch");
    expect(hinweis).toContain("kaputt.txt — Die Virenprüfung war nicht möglich");
  });

  it("eine unvollstaendige Zeile fehlt mit dem Grund der ABBRUCHS, nicht dem der Pruefung", async () => {
    await legeShare({ id: "sh00000003" });
    await legeDatei({ id: "fi00000021", shareId: "sh00000003", dateiname: "gut.txt" });
    await legeDatei({
      id: "fi00000022",
      shareId: "sh00000003",
      dateiname: "halb.txt",
      avStatus: "scanning",
      vollstaendig: false,
    });

    const eintraege = leseZip(Buffer.from(await (await ruf("sh00000003")).arrayBuffer()));
    expect(namen(eintraege)).toEqual(["_HINWEIS.txt", "gut.txt"]);
    expect(hinweisAus(eintraege)).toContain("halb.txt — Die Übertragung wurde nicht abgeschlossen");
  });

  it("eine Zeile OHNE Blob kommt nicht ins Archiv, sondern mit ihrem NAMEN in den Hinweis", async () => {
    // Der Fall ist belegt (Waisen in beide Richtungen, Analyse Falle 9). Ohne
    // diesen Ausschluss faellt `lieseStrom` MITTEN im Archiv — also nach HTTP
    // 200 und nach dem Zaehlschritt — und der Empfaenger bekommt ein
    // abgeschnittenes ZIP: genau das stille Weglassen, das §7.7 verbietet.
    await legeShare({ id: "sh00000004" });
    await legeDatei({ id: "fi00000031", shareId: "sh00000004", dateiname: "gut.txt" });
    await legeDatei({
      id: "fi00000032",
      shareId: "sh00000004",
      dateiname: "verschwunden.txt",
      mitBlob: false,
    });

    const eintraege = leseZip(Buffer.from(await (await ruf("sh00000004")).arrayBuffer()));
    expect(namen(eintraege)).toEqual(["_HINWEIS.txt", "gut.txt"]);
    // Der NAME, nicht die nanoid: eine ID im Hinweis ist fuer den Empfaenger
    // unbrauchbar.
    expect(hinweisAus(eintraege)).toContain("verschwunden.txt — Nicht gefunden");
  });
});

describe("Punkt 3 — alles ausgeschlossen: benannter Zustand statt leerem Archiv", () => {
  it("alle Dateien gesperrt → 403 mit Klartext, KEIN Archiv", async () => {
    await legeShare({ id: "sh00000005" });
    await legeDatei({ id: "fi00000041", shareId: "sh00000005", avStatus: "scanning" });
    await legeDatei({ id: "fi00000042", shareId: "sh00000005", avStatus: "infected" });

    const antwort = await ruf("sh00000005");
    expect(antwort.status).toBe(403);
    const text = await antwort.text();
    expect(text).toContain("Keine der Dateien ist zum Herunterladen freigegeben.");
    // Ein leeres ZIP sieht fuer den Empfaenger wie ein Fehler seines
    // Entpackprogramms aus.
    expect(antwort.headers.get("content-type")).not.toBe("application/zip");
  });

  it("alles ausgeschlossen zaehlt NICHT und loggt NICHT", async () => {
    await legeShare({ id: "sh00000006" });
    await legeDatei({ id: "fi00000051", shareId: "sh00000006", avStatus: "error" });

    await ruf("sh00000006");
    expect(zaehler("sh00000006")).toBe(0);
    expect(logzeilen("sh00000006")).toHaveLength(0);
  });

  it("ein Share ganz OHNE Dateien → 404 mit eigenem Grund", async () => {
    await legeShare({ id: "sh00000007" });
    const antwort = await ruf("sh00000007");
    expect(antwort.status).toBe(404);
    expect(await antwort.text()).toContain("Hier ist keine Datei vorhanden.");
    expect(zaehler("sh00000007")).toBe(0);
  });
});

describe("Punkt 4 — die Pruefkette, und was NICHT zaehlt", () => {
  it("unbekannte Share-ID → 404", async () => {
    expect((await ruf("sh99999999")).status).toBe(404);
  });

  it("Unrat als ID wirft nicht, sondern ist 404", async () => {
    // `cookieName()` WIRFT bei einer ID, die kein Cookie-Name waere; ein
    // Handler, der den Namen VOR der Existenzstufe bildet, antwortet 500.
    expect((await ruf("../../etc/passwd; drop")).status).toBe(404);
  });

  it("abgelaufener Share → 410, ohne zu zaehlen", async () => {
    await legeShare({ id: "sh00000008", ablaufAt: new Date(jetzt().getTime() - TAG) });
    await legeDatei({ id: "fi00000061", shareId: "sh00000008" });
    expect((await ruf("sh00000008")).status).toBe(410);
    expect(zaehler("sh00000008")).toBe(0);
    expect(logzeilen("sh00000008")).toHaveLength(0);
  });

  it("Limit erreicht → 410, ohne weiter zu zaehlen", async () => {
    await legeShare({ id: "sh00000009", maxDownloads: 2, downloadCount: 2 });
    await legeDatei({ id: "fi00000071", shareId: "sh00000009" });
    expect((await ruf("sh00000009")).status).toBe(410);
    expect(zaehler("sh00000009")).toBe(2);
    expect(logzeilen("sh00000009")).toHaveLength(0);
  });

  it("Passwort-Share ohne Cookie → 401, und das erhoeht download_count NICHT", async () => {
    // Die Zusage, die das serverseitige Gate erst schuetzend macht: liefe das
    // Inkrement vor der Cookie-Pruefung, waere ein Share mit max_downloads = 3
    // mit DREI fremden GETs tot (§7.4).
    await legeShare({ id: "sh00000010", passwort: "geheim" });
    await legeDatei({ id: "fi00000081", shareId: "sh00000010" });

    const antwort = await ruf("sh00000010");
    expect(antwort.status).toBe(401);
    // Auch die Absage gehoert in keinen geteilten Zwischenspeicher: ein Proxy,
    // der sie behaelt, beantwortet den Abruf NACH dem Entsperren aus dem Cache.
    expect(antwort.headers.get("cache-control")).toBe("private, no-store");
    expect(zaehler("sh00000010")).toBe(0);
    expect(logzeilen("sh00000010")).toHaveLength(0);
  });

  it("ein ZWEITES Cookie gleichen Namens hebt die Entsperrung NICHT auf", async () => {
    // Der ERSTE Wert gewinnt. Gewaenne der letzte, koennte ein fremd gesetztes
    // Cookie (gleicher Name, anderer Pfad/Domain) eine bereits entsperrte
    // Freigabe fuer den Abrufer wieder zusperren — ohne dass er es aendern kann.
    await legeShare({ id: "sh00000020", passwort: "geheim" });
    await legeDatei({ id: "fi00000181", shareId: "sh00000020", dateiname: "gut.txt" });

    const gueltig = await cookieFuer("sh00000020");
    const zweitesGleichenNamens = `${gueltig.slice(0, gueltig.indexOf("="))}=Unrat`;

    const antwort = await ruf("sh00000020", {
      cookie: `${gueltig}; ${zweitesGleichenNamens}`,
    });
    expect(antwort.status).toBe(200);
    expect(namen(leseZip(Buffer.from(await antwort.arrayBuffer())))).toEqual(["gut.txt"]);
  });

  it("Passwort-Share mit gefaelschtem Cookie → 401", async () => {
    await legeShare({ id: "sh00000011", passwort: "geheim" });
    await legeDatei({ id: "fi00000091", shareId: "sh00000011" });
    const gefaelscht = `files_s_sh00000011=sh00000011.9999999999.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
    expect((await ruf("sh00000011", { cookie: gefaelscht })).status).toBe(401);
    expect(zaehler("sh00000011")).toBe(0);
  });

  it("Passwort-Share MIT gueltigem Cookie → 200 und ein Archiv", async () => {
    await legeShare({ id: "sh00000012", passwort: "geheim" });
    await legeDatei({ id: "fi00000101", shareId: "sh00000012", dateiname: "gut.txt" });

    const antwort = await ruf("sh00000012", { cookie: await cookieFuer("sh00000012") });
    expect(antwort.status).toBe(200);
    expect(namen(leseZip(Buffer.from(await antwort.arrayBuffer())))).toEqual(["gut.txt"]);
    expect(zaehler("sh00000012")).toBe(1);
  });

  it("ein 403 (alles gesperrt) erhoeht download_count NICHT", async () => {
    await legeShare({ id: "sh00000013", maxDownloads: 3 });
    await legeDatei({ id: "fi00000111", shareId: "sh00000013", avStatus: "infected" });
    expect((await ruf("sh00000013")).status).toBe(403);
    expect(zaehler("sh00000013")).toBe(0);
  });

  it("zwei gleichzeitige Abrufe bei max_downloads = 1: einmal 200, einmal 410, Zaehler 1", async () => {
    // Der Zweig „`zaehleDownload` liefert false, obwohl die Ladefunktion `offen`
    // sagte" ist NUR so erreichbar — sequenziell faengt ihn schon die
    // Limit-Stufe ab. Er ist der Grund, warum das Inkrement die Bedingung IM
    // UPDATE traegt (§7.5); ohne den Zweig flossen hier zwei Archive.
    await legeShare({ id: "sh00000014", maxDownloads: 1 });
    await legeDatei({ id: "fi00000121", shareId: "sh00000014", dateiname: "gut.txt" });

    const antworten = await Promise.all([ruf("sh00000014"), ruf("sh00000014")]);
    await Promise.all(antworten.map((a) => a.arrayBuffer().catch(() => null)));
    expect(antworten.map((a) => a.status).sort()).toEqual([200, 410]);
    expect(zaehler("sh00000014")).toBe(1);
    expect(logzeilen("sh00000014")).toHaveLength(1);
  });
});

describe("Punkt 5 — Abbruch: Stroeme zu, keine geleckten Descriptoren", () => {
  it("bricht mitten im Archiv ab: Leser sofort fertig, KEIN Descriptor offen, Rest ungelesen", async () => {
    await legeShare({ id: "sh00000015" });
    for (let i = 1; i <= 3; i++) {
      await legeDatei({ id: `fi0000013${i}`, shareId: "sh00000015", dateiname: `g-${i}.bin` });
    }

    // Das Tor haelt den Erzeuger UNMITTELBAR HINTER dem Oeffnen der ersten
    // Quelle an. Damit ist der Zeitpunkt des Abbruchs bekannt, statt ihn gegen
    // einen Puffer zu erraten.
    let oeffne: () => void = () => {};
    beobachtet.tor = new Promise<void>((f) => {
      oeffne = f;
    });

    const basis = offeneDescriptoren();
    const abbruch = new AbortController();
    const antwort = await ruf("sh00000015", { signal: abbruch.signal });
    expect(antwort.status).toBe(200);

    const leser = antwort.body!.getReader();
    await warteBis(() => beobachtet.stroeme.length === 1 && offeneDescriptoren() > basis);
    // Die Kontrollmessung: ohne sie waere die Zusage unten auch dann gruen, wenn
    // gar nichts offen WAR.
    expect(offeneDescriptoren()).toBe(basis + 1);

    abbruch.abort();

    // Der Leser muss SOFORT fertig sein — waehrend der Erzeuger noch am Tor
    // haengt. Das kann nur der `req.signal`-Listener leisten (er zerstoert den
    // `PassThrough`); ohne ihn wartete der Empfaenger auf einen Erzeuger, der
    // gar nicht mehr laeuft.
    const ausgang = await Promise.race([
      leser.read().then(
        () => "beendet",
        () => "beendet",
      ),
      new Promise<string>((f) => setTimeout(() => f("haengt"), 500)),
    ]);
    expect(ausgang).toBe("beendet");

    oeffne();
    await setzenLassen();

    // GEMESSEN, nicht behauptet.
    expect(offeneDescriptoren()).toBe(basis);
    expect(beobachtet.stroeme.every((s) => s.destroyed)).toBe(true);
    // Kein halbes Weiterarbeiten: die beiden uebrigen Dateien werden gar nicht
    // mehr angefasst.
    expect(beobachtet.stroeme).toHaveLength(1);
  });

  it("oeffnet die Quellen SEQUENZIELL — nie zwei Descriptoren gleichzeitig", async () => {
    await legeShare({ id: "sh00000016" });
    for (let i = 1; i <= 3; i++) {
      await legeDatei({ id: `fi0000014${i}`, shareId: "sh00000016", dateiname: `d-${i}.txt` });
    }

    await (await ruf("sh00000016")).arrayBuffer();

    expect(beobachtet.stroeme).toHaveLength(3);
    // Bei JEDER Oeffnung war kein frueherer Strom mehr offen. Alle drei vorab zu
    // oeffnen waere ein Descriptor-Leck per Bauform und macht Punkt 5
    // unbeweisbar.
    expect(beobachtet.offenBeiOeffnung).toEqual([0, 0, 0]);
  });
});

describe("Punkt 5 — ein Quellstrom, der MITTEN im Eintrag scheitert", () => {
  /*
   * Warum dieser Fall einen eigenen Test braucht und `archiv.on("error")` ihn
   * NICHT abdeckt (nachgelesen in `node_modules`, nicht vermutet):
   * `archiver-utils@5.0.2/index.js:86` leitet JEDEN angehaengten Strom durch
   * `source.pipe(new PassThrough())`. `pipe()` traegt Fehler nicht weiter — der
   * Fehler des Quellstroms erreicht den Archivierer also nie. Ohne einen
   * eigenen Horcher am Quellstrom ist er ein unbehandeltes `error`-Ereignis
   * (der Prozess stirbt), das `fuegeEin`-Versprechen loeste nie auf, und sein
   * `finally` — das den Descriptor schliesst — liefe nie.
   */
  it("meldet ihn, beendet den Koerper und laesst KEINEN Descriptor offen", async () => {
    await legeShare({ id: "sh00000021" });
    await legeDatei({ id: "fi00000191", shareId: "sh00000021", dateiname: "gut.txt" });

    beobachtet.fehlerBeimLesen = "EIO: Lesefehler des Dateisystems";
    const fehlerLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const basis = offeneDescriptoren();
      const antwort = await ruf("sh00000021");
      // Der Fehler faellt NACH dem ersten Byte — der Statuscode steht da schon.
      expect(antwort.status).toBe(200);

      // Der Koerper endet, statt fuer immer offen zu bleiben.
      const ausgang = await Promise.race([
        antwort.arrayBuffer().then(
          () => "beendet",
          () => "beendet",
        ),
        new Promise<string>((f) => setTimeout(() => f("haengt"), 1000)),
      ]);
      expect(ausgang).toBe("beendet");

      await setzenLassen();
      // GEMESSEN: das `finally` des Handlers ist gelaufen.
      expect(offeneDescriptoren()).toBe(basis);
      // Ohne Logzeile gaebe es von einem abgeschnittenen Archiv keine Spur.
      expect(fehlerLog).toHaveBeenCalledWith(
        expect.stringContaining("sh00000021"),
        expect.anything(),
      );
    } finally {
      fehlerLog.mockRestore();
    }
  });
});

describe("Punkt 6 — der Archivname traegt BEIDE Formen", () => {
  it("entschaerfter ASCII-Fallback plus filename*=UTF-8''", async () => {
    await legeShare({ id: "sh00000017", titel: "Lage Übung" });
    await legeDatei({ id: "fi00000151", shareId: "sh00000017" });

    const antwort = await ruf("sh00000017");
    // Der angefuehrte Teil ist UNKODIERT (Alt lieferte `%C3%9C` an den
    // Empfaenger); der echte Titel steht ausschliesslich in `filename*`.
    expect(antwort.headers.get("content-disposition")).toBe(
      `attachment; filename="Lage__bung.zip"; filename*=UTF-8''Lage%20%C3%9Cbung.zip`,
    );
    await antwort.arrayBuffer();
  });
});

describe("Punkt 7 — Rollensperre", () => {
  it("auf dem Inbox-Host → 404, ohne zu zaehlen und ohne die DB zu lesen", async () => {
    await legeShare({ id: "sh00000018" });
    await legeDatei({ id: "fi00000161", shareId: "sh00000018" });

    const antwort = await ruf("sh00000018", { host: INBOX });
    expect(antwort.status).toBe(404);
    expect(zaehler("sh00000018")).toBe(0);
    expect(logzeilen("sh00000018")).toHaveLength(0);
  });

  it("auf einem voellig fremden Host → 404", async () => {
    await legeShare({ id: "sh00000019" });
    await legeDatei({ id: "fi00000171", shareId: "sh00000019" });
    expect((await ruf("sh00000019", { host: "qr.localtest.me" })).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Quelltext-Zusicherung. Drei Punkte der Fertig-wenn-Zeile sind an keiner
// Antwort ablesbar: `zlib: { level: 1 }` (Stufe 9 waere gruen und CPU-teuer),
// „ohne Temp-Datei" (das Ergebnis waere identisch) und die Namensentscheidungen,
// die aus `_lib/zip.ts` kommen muessen statt hier nachgebaut zu werden.
// ---------------------------------------------------------------------------

describe("Quelltext-Zusicherung", () => {
  // Lazy: waere die Datei beim Sammeln gelesen, riss ihr Fehlen die GANZE Suite
  // in einen Sammelfehler statt in benannte rote Tests.
  const quelltext = (): string =>
    readFileSync("src/app/m/files/api/download/[id]/zip/route.ts", "utf8");

  it("komprimiert auf Stufe 1", () => {
    expect(quelltext()).toMatch(/zlib:\s*\{\s*level:\s*1\s*\}/);
  });

  it("schreibt nichts auf die Platte — kein Temp-Weg", () => {
    for (const verboten of [
      "schreibeStrom",
      "abschliesse",
      "createWriteStream",
      "writeFile",
      "tmpdir",
      "mkdtemp",
    ]) {
      expect(quelltext()).not.toContain(verboten);
    }
  });

  it("holt Ausschluss und Namen aus _lib/zip.ts statt sie nachzubauen", () => {
    expect(quelltext()).toContain("planeArchiv");
    expect(quelltext()).toContain("archivDisposition");
    // Ein zweiter Vergleich gegen den Freigabewert waere ein zweites
    // Statusmodell (§6.2).
    expect(quelltext()).not.toMatch(/["']clean["']/);
  });

  it("horcht auch auf Fehler des ARCHIVIERERS selbst", () => {
    // Nur als Quelltext-Zusicherung, und der Grund ist nachgelesen: die vom
    // Archivierer selbst ausgeloesten Fehler (`QUEUECLOSED`, `ENTRYNAMEREQUIRED`,
    // ein Fehler des zip-Moduls) sind von aussen nicht provozierbar, ohne den
    // Handler dafuer umzubauen. Der Fehler eines QUELLSTROMS erreicht diesen
    // Horcher nicht — dafuer gibt es den eigenen Test in Punkt 5.
    // Am ZEILENANFANG und mit Rumpf: ein blosses `toContain` waere schon von
    // der Erwaehnung im Kommentar erfuellt gewesen (gemessen — die Mutation
    // „Block entfernt" blieb damit gruen).
    expect(quelltext()).toMatch(/^ *archiv\.on\("error", \(fehler[^\n]*=> \{/m);
  });

  it("horcht auf Fehler jedes QUELLSTROMS", () => {
    // Die Verhaltenszusicherung steht in Punkt 5; hier nur der Name, damit die
    // Zeile beim Umbau nicht stillschweigend verschwindet.
    expect(quelltext()).toMatch(/quellStrom\?\.(once|on)\("error"/);
  });

  it("zaehlt und protokolliert ueber _db/zaehler.ts, nicht mit eigenem SQL", () => {
    expect(quelltext()).toContain("zaehleDownload");
    expect(quelltext()).toContain("protokolliereDownload");
    expect(quelltext()).not.toMatch(/download_count|downloadCount\s*:/);
  });
});
