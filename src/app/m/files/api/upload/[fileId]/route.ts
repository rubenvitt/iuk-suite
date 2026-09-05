import { eq, sql } from "drizzle-orm";

import { getDb } from "../../../_db/client";
import { shareFiles, shares } from "../../../_db/schema";
import { requireFilesAccess } from "../../../_lib/access";
import { reiheAvEin } from "../../../_lib/av";
import { grenzen } from "../../../_lib/grenzen";
import { rolleOderNull } from "../../../_lib/hostRolle";
import { MIME_PRAEFIX_BYTES, pruefeInhaltstyp } from "../../../_lib/mime";
import {
  AblageNichtSchreibbar,
  GroesseUeberschritten,
  KeinPlatz,
  UngueltigeId,
  abschliesse,
  fortschritt,
  kopfBytes,
  loesche,
  schreibeStrom,
  type BlobZiel,
} from "../../../_lib/storage";

/**
 * DER BYTE-WEG DER FREIGABEN — `PUT`/`GET`/`DELETE /api/upload/<fileId>`
 * (Spec §7.1, §5.4, §6.6; Plan T27).
 *
 * VIER ZUSAGEN, und die erste ist die, die eine ganze Fehlerklasse aufloest:
 *
 * 1. **Der Zielpfad kommt aus der Datenbank, nie vom Browser.** Der Handler
 *    nimmt ausschliesslich eine `fileId` entgegen; `shareId` liest er aus der
 *    gefundenen Zeile, und `_lib/storage.ts` baut daraus den Pfad. In der
 *    Alt-App war der Schluessel ein freier Request-Header, ungeprueft
 *    weitergereicht (`chunk/route.ts:11,23`, `complete/route.ts:12,25`) — auf
 *    einem Dateisystem heisst das „schreibe an jede Stelle, die der Prozess
 *    erreicht" (Analyse Falle 28). Weggefallen sind damit auch `uploadId`,
 *    `ETag` und `PartNumber`.
 * 2. **`?ab=` ist ein BYTE-Offset, keine Chunk-Nummer**, und er muss GENAU der
 *    Laenge der Zwischendatei entsprechen. Eine Nummer stimmt nur, solange
 *    jeder Chunk ausser dem letzten exakt `FILES_CHUNK_BYTES` gross ist — eine
 *    unausgesprochene Invariante, die der erste abweichende Client still
 *    bricht. Der Fortschritt IST die Laenge der `.part`-Datei; es gibt keinen
 *    zweiten Zustand, der auseinanderlaufen koennte (§7.1 Schritt 3).
 * 3. **Der letzte Chunk (`?ende=1`) stellt fest, benennt um und misst.**
 *    `mime_type` traegt den FESTGESTELLTEN Typ (§8.5), `size` die GEMESSENE
 *    Bytezahl, `total_size` wird neu SUMMIERT (nicht erhoeht), und der Scan
 *    wird eingereiht — `av_status` bleibt dabei `scanning` (§6.1).
 * 4. **`DELETE` bricht ab:** Zwischendatei weg, unvollstaendige Zeile weg,
 *    `shares.type` neu abgeleitet (Plan Festlegung G).
 *
 * WARUM DIESE DATEI UNTER `src/app/m/files/api/…` LIEGT und nicht unter
 * `src/app/api/…`: beide Orte sind gueltige Next-Routen und bauen fehlerfrei,
 * aber der Host-Rewrite bildet `/<pfad>` auf `/m/files/<pfad>` ab
 * (`routing.ts:78-79`) — am falschen Ort zielte er auf einen Pfad, an dem
 * nichts liegt, und jeder Upload-Versuch waere ein 404 (Analyse Falle 16).
 *
 * DIE ROLLENSPERRE STEHT IN JEDER METHODE. Route Handler haben kein Layout, die
 * Sperre aus §3.2 erreicht sie also ueber die Group-Layouts nicht — und
 * `core/routing.ts:57-67` laesst den internen `/m/<key>`-Pfad bei
 * `requiresAuth: false` ungegatet durch. Benutzt wird `rolleOderNull` und nicht
 * `requireRolle`: ein `notFound()`-Wurf ist in einem Handler keine brauchbare
 * Antwort, die 404 gehoert dem Handler selbst.
 */

/** Die Deklaration des Clients kommt als `Content-Type` des LETZTEN Chunks.
 *  Sie ist nur ein Indiz — die Feststellung aus den Bytes gewinnt (§8.5) —, aber
 *  fuer `text/plain` und fuer die drei ZIP-basierten Office-Formate ist sie das
 *  zweite Signal, ohne das nicht entschieden werden kann. Die Upload-Insel
 *  (T35) setzt dafuer `datei.type`. */
const DEKLARATION_KOPF = "content-type";

type Zeile = {
  id: string;
  shareId: string;
  filename: string;
  bytesVollstaendigAt: Date | null;
};

/**
 * Der Abbruch ist idempotent, weil der Browser ihn bei einem Verbindungsverlust
 * mitten im Upload wiederholt — und eine Fehlermeldung auf einen bereits
 * gelungenen Abbruch waere eine Falschmeldung.
 *
 * Diese Menge ist AUSDRUECKLICH KEIN zweiter Zustand: die Wahrheit ueber eine
 * Datei steht in `share_files` und auf dem Dateisystem. Sie beantwortet genau
 * eine Frage, die dort nicht mehr steht — „haben WIR diese Zeile gerade
 * entfernt?" —, und unterscheidet damit den Wiederholversuch (204) von einer
 * fremden oder erfundenen `fileId` (404). Nach einem Neustart ist sie leer;
 * dann antwortet ein spaeter Wiederholversuch 404, und mehr als eine
 * ueberfluessige Meldung kostet das nicht.
 *
 * Die Kappung ist noetig, weil ein langlaufender Prozess sonst jede je
 * abgebrochene ID behielte.
 */
const ABBRUCH_GEDAECHTNIS = 500;
const abgebrochen = new Set<string>();

function merkeAbbruch(fileId: string): void {
  abgebrochen.add(fileId);
  if (abgebrochen.size > ABBRUCH_GEDAECHTNIS) {
    // `Set` haelt die Einfuegereihenfolge — der erste Eintrag ist der aelteste.
    const aeltester = abgebrochen.values().next().value;
    if (aeltester !== undefined) abgebrochen.delete(aeltester);
  }
}

// --- Antworten -------------------------------------------------------------

function json(status: number, koerper: Record<string, unknown>): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Kein 403: die Existenz eines Pfades auf dem falschen Host und die Existenz
 *  einer fremden `fileId` werden beide nicht verraten (§3.2, §2.4). */
function nichtGefunden(): Response {
  return json(404, { fehler: "Nicht gefunden." });
}

// --- Gemeinsame Vorstufen --------------------------------------------------

/**
 * Rolle zuerst, Zugriff danach. Die Reihenfolge traegt eine Aussage: auf dem
 * Inbox-Host existiert diese Route nicht, also darf sie dort auch keine
 * Anmeldung verlangen.
 *
 * `requireFilesAccess()` WIRFT (Anmeldung bzw. `notFound()`) — das ist die
 * Form, die §2.4 fuer alle drei Aufrufergruppen festlegt, und der Grund, warum
 * sie hier nicht in eine eigene Antwort uebersetzt wird: zwei Fassungen
 * desselben Riegels liefen auseinander.
 */
async function riegel(req: Request): Promise<Response | null> {
  if (rolleOderNull(req.headers) !== "verwaltung") return nichtGefunden();
  await requireFilesAccess();
  return null;
}

function ladeZeile(fileId: string): Zeile | undefined {
  return getDb()
    .select({
      id: shareFiles.id,
      shareId: shareFiles.shareId,
      filename: shareFiles.filename,
      bytesVollstaendigAt: shareFiles.bytesVollstaendigAt,
    })
    .from(shareFiles)
    .where(eq(shareFiles.id, fileId))
    .get();
}

function zielFuer(zeile: Zeile): BlobZiel {
  return { art: "share", shareId: zeile.shareId, fileId: zeile.id };
}

function errnoCode(fehler: unknown): string | undefined {
  if (typeof fehler === "object" && fehler !== null && "code" in fehler) {
    const code = (fehler as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Der Request-Body als `AsyncIterable<Uint8Array>` — ausgeschrieben statt
 * `for await (const s of req.body)`: dass ein `ReadableStream` asynchron
 * iterierbar ist, ist eine Eigenschaft der Laufzeit und keine der Web-Streams,
 * und ein fehlender `Symbol.asyncIterator` waere hier ein Ausfall des ganzen
 * Upload-Wegs.
 */
async function* stromAus(req: Request): AsyncIterable<Uint8Array> {
  const koerper = req.body;
  if (koerper === null) return;
  const leser = koerper.getReader();
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) return;
      if (value !== undefined) yield value;
    }
  } finally {
    leser.releaseLock();
  }
}

/**
 * Die Fehlerabbildung aus §5.4, an EINER Stelle. Sie ist der Grund, warum
 * `_lib/storage.ts` fuer ENOSPC und EACCES eigene Typen fuehrt: ohne sie
 * muesste hier eine Zeichenkette verglichen werden.
 */
async function ausFehler(fehler: unknown, ziel: BlobZiel | null): Promise<Response> {
  if (fehler instanceof GroesseUeberschritten) {
    // Die Zwischendatei hat `schreibeStrom` bereits entfernt (§5.4). Die
    // EINHEIT gehoert in die Meldung, nicht in einen Kommentar (§9.1).
    return json(413, {
      fehler: `Die Datei ist zu groß. Erlaubt sind höchstens ${new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: 2,
      }).format(fehler.maxBytes / (1024 * 1024))} MiB.`,
      grenzeBytes: fehler.maxBytes,
    });
  }
  if (fehler instanceof KeinPlatz) {
    // Zusaetzlich zum Aufraeumen in `schreibeStrom`: der Wurf kann aus jeder
    // Stufe kommen, und ohne Loeschen bliebe halber Muell liegen (§5.4).
    if (ziel !== null) await loesche(ziel).catch(() => {});
    console.error(`[files][upload] kein Platz in der Ablage`, fehler);
    return json(507, { fehler: "Auf dem Server ist kein Platz mehr frei." });
  }
  if (fehler instanceof AblageNichtSchreibbar) {
    // LAUT, weil es ein Konfigurationsfehler ist und kein Nutzerfehler: ohne
    // diese Zeile sieht der Betreiber einen 500 ohne Grund. Die `fileId` steht
    // darin, damit die Zeile einer Datei zuzuordnen ist — der PFAD nicht.
    const wo = ziel === null ? "?" : ziel.art === "share" ? ziel.fileId : ziel.inboxFileId;
    console.error(`[files][upload] Ablage nicht schreibbar bei ${wo}`, fehler);
    return json(500, { fehler: "Die Ablage ist nicht schreibbar." });
  }
  if (fehler instanceof UngueltigeId) {
    // Eine Zeile mit einer ID, die keine nanoid(10) ist — ein Datenfehler, wie
    // ihn ein Import hinterlassen kann. 404 statt 500, wie in `_db/queries.ts`.
    console.error("[files][upload] Zeile mit unbrauchbarer ID", fehler);
    return nichtGefunden();
  }
  if (errnoCode(fehler) === "EEXIST") {
    // Ein ZWEITER Starter auf dasselbe Ziel. `wx` meldet den Konflikt, statt
    // Bytes zu verschraenken (`storage.ts:196-201`); die Antwort ist dieselbe
    // wie bei einem falschen Offset, damit der Client denselben Weg geht.
    const stand = ziel === null ? 0 : await fortschritt(ziel).catch(() => 0);
    return json(409, {
      fehler: "Fuer diese Datei laeuft bereits ein Upload.",
      erwartetesOffsetBytes: stand,
    });
  }
  throw fehler;
}

// --- PUT: ein Chunk --------------------------------------------------------

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const gesperrt = await riegel(req);
  if (gesperrt) return gesperrt;

  const { fileId } = await ctx.params;
  const zeile = ladeZeile(fileId);
  if (zeile === undefined) return nichtGefunden();

  // Eine fertige Datei wird nicht erneut beschrieben: sonst entstuende ein
  // neuer Blob unter einem bereits geprueften `av_status`, und der Empfaenger
  // laedt Bytes, die niemand gesehen hat. Der Weg dafuer heisst „Freigabe
  // loeschen und neu anlegen".
  if (zeile.bytesVollstaendigAt !== null) {
    return json(409, { fehler: "Diese Datei ist bereits vollstaendig uebertragen." });
  }

  const url = new URL(req.url);
  const rohAb = url.searchParams.get("ab");
  const ab = rohAb === null ? 0 : Number(rohAb);
  // Bewusst eine Ziffernpruefung und NICHT `Number()` allein: `Number("0x10")`
  // ist 16 und ganzzahlig — dieselbe Falle, die `_lib/grenzen.ts` mit `GANZZAHL`
  // schliesst. Ein geratener Offset ueberschriebe fremde Bytes.
  if (!/^\d+$/.test(rohAb ?? "0") || !Number.isSafeInteger(ab)) {
    return json(400, { fehler: "`ab` muss ein Byte-Offset sein (ganze Zahl, nicht negativ)." });
  }
  const ende = url.searchParams.get("ende") === "1";

  const ziel = zielFuer(zeile);

  try {
    // Der Fortschritt IST die Laenge der Zwischendatei — kein zweiter
    // Mechanismus (§7.1 Schritt 3).
    const stand = await fortschritt(ziel);
    if (ab !== stand) {
      return json(409, {
        fehler: "Der Offset passt nicht zum Stand dieser Datei.",
        erwartetesOffsetBytes: stand,
      });
    }

    const g = grenzen();

    // `anhaengen: false` NUR fuer den ersten Chunk: er oeffnet mit `wx` und
    // laesst einen zweiten Starter auf dasselbe Ziel als EEXIST auflaufen
    // statt in verschraenkten Bytes (`storage.ts:196-201`).
    const { bytes } = await schreibeStrom(ziel, stromAus(req), {
      maxBytes: g.maxDateiBytes,
      anhaengen: ab > 0,
    });

    // §6.6, die ZWEITE Linie: oberhalb der scanbaren Groesse wird BENANNT
    // abgelehnt, nicht angenommen und dauerhaft `unscanned` gesetzt — das waere
    // eine Datei, die fail-closed nie herunterladbar ist, eine Sackgasse mit
    // Bytes darin. Im Normalbetrieb ist der Zweig unerreichbar, weil §9.4
    // Pruefung 3 `FILES_MAX_DATEI_BYTES <= FILES_AV_MAX_BYTES` erzwingt und
    // damit die Grenze oben zuerst greift.
    if (bytes > g.avMaxBytes) {
      await loesche(ziel);
      return json(413, {
        fehler:
          `Datei zu gross fuer die Virenpruefung: hoechstens ${g.avMaxBytes} Bytes ` +
          `(FILES_AV_MAX_BYTES, Einheit: Bytes).`,
        grenzeBytes: g.avMaxBytes,
      });
    }

    if (!ende) return json(200, { empfangeneBytes: bytes });

    // Die Magic-Byte-Pruefung liegt ZWISCHEN Schreiben und Umbenennen (§8.5):
    // sie liest Bytes, die in frueheren Anfragen angekommen sind, und ihr
    // Fehlschlag darf das Ziel nie entstehen lassen.
    const befund = pruefeInhaltstyp({
      praefix: await kopfBytes(ziel, MIME_PRAEFIX_BYTES),
      gesamtGroesse: bytes,
      deklariert: req.headers.get(DEKLARATION_KOPF),
      dateiname: zeile.filename,
    });
    if (!befund.ok) {
      // Zwischendatei weg, Zeile bleibt unvollstaendig: der Client kann den
      // Upload mit einer anderen Datei neu beginnen (§7.1, §8.2).
      await loesche(ziel);
      return json(415, { fehler: befund.meldung, grund: befund.grund });
    }

    // Der EINE Moment, in dem der Blob entsteht — atomar, im selben Verzeichnis.
    const { bytes: gemessen } = await abschliesse(ziel);

    const db = getDb();
    db.update(shareFiles)
      .set({
        // Die Laenge der DATEI (aus `abschliesse`), nicht der Zaehler der
        // Schreibfunktion und erst recht keine Selbstauskunft des Clients
        // (Analyse E20 b). Laufen beide auseinander, braeche ein falsches
        // `Content-Length` den Download beim Empfaenger ab (§5.4).
        size: gemessen,
        // Der FESTGESTELLTE Typ ersetzt den Platzhalter aus `anlegenAction`.
        mimeType: befund.typ,
        bytesVollstaendigAt: new Date(),
      })
      .where(eq(shareFiles.id, zeile.id))
      .run();

    // NEU SUMMIERT, nicht erhoeht: ein Inkrement waere nach jedem Abbruch,
    // jedem Neuversuch und jedem Import um genau die Faelle daneben, die man
    // nicht sieht. Gezaehlt werden ausschliesslich VOLLSTAENDIGE Zeilen (§4.4).
    db.update(shares)
      .set({
        totalSize: sql`(SELECT COALESCE(SUM(${shareFiles.size}), 0) FROM ${shareFiles}
                        WHERE ${shareFiles.shareId} = ${zeile.shareId}
                          AND ${shareFiles.bytesVollstaendigAt} IS NOT NULL)`,
      })
      .where(eq(shares.id, zeile.shareId))
      .run();

    // Die Zeile steht schon als `scanning` in der Datenbank und ist damit
    // bereits Teil der Warteschlange; dieser Aufruf zieht sie nur VOR den
    // naechsten Takt (§6.4). Ohne laufenden Arbeiter tut er nichts.
    reiheAvEin(ziel);

    return json(200, {
      fertig: true,
      groesseBytes: gemessen,
      mimeTyp: befund.typ,
      abweichungen: befund.abweichungen,
    });
  } catch (fehler) {
    return ausFehler(fehler, ziel);
  }
}

// --- GET: der Fortschritt --------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const gesperrt = await riegel(req);
  if (gesperrt) return gesperrt;

  const { fileId } = await ctx.params;
  const zeile = ladeZeile(fileId);
  if (zeile === undefined) return nichtGefunden();

  try {
    return json(200, {
      // Genau der naechste `ab`-Wert. Damit ist der Upload fortsetzbar, ohne
      // dass es dafuer einen eigenen Mechanismus braucht (§7.1 Schritt 3).
      empfangeneBytes: await fortschritt(zielFuer(zeile)),
      // Aus der ZEILE, nicht aus einem zweiten Fortschrittszaehler: nach dem
      // Umbenennen gibt es keine Zwischendatei mehr, `empfangeneBytes` faellt
      // also auf 0 zurueck. Ohne diese Auskunft hielte ein wiederaufnehmender
      // Client eine fertige Datei fuer eine unbegonnene und lieferte sie erneut.
      vollstaendig: zeile.bytesVollstaendigAt !== null,
    });
  } catch (fehler) {
    return ausFehler(fehler, zielFuer(zeile));
  }
}

// --- DELETE: der Abbruch ---------------------------------------------------

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  const gesperrt = await riegel(req);
  if (gesperrt) return gesperrt;

  const { fileId } = await ctx.params;
  const zeile = ladeZeile(fileId);
  if (zeile === undefined) {
    // Wiederholung nach einem Verbindungsverlust gegen fremde oder erfundene ID.
    return abgebrochen.has(fileId) ? new Response(null, { status: 204 }) : nichtGefunden();
  }

  // Der Abbruch ist KEIN Loeschweg fuer fertige Dateien — der heisst
  // `shareLoeschenAction` (T37). Ohne diese Sperre naehme ein verspaeteter
  // Abbruch aus der Client-Schleife eine bereits ausgelieferte Datei mit.
  if (zeile.bytesVollstaendigAt !== null) {
    return json(409, {
      fehler:
        "Diese Datei ist bereits vollstaendig uebertragen und kann nicht abgebrochen werden. " +
        "Zum Entfernen die Freigabe bearbeiten oder loeschen.",
    });
  }

  try {
    // `loesche` ist idempotent und nimmt Ziel UND Zwischendatei mit; fuer eine
    // unvollstaendige Zeile existiert nur die Zwischendatei.
    await loesche(zielFuer(zeile));
  } catch (fehler) {
    return ausFehler(fehler, zielFuer(zeile));
  }

  const db = getDb();
  db.delete(shareFiles).where(eq(shareFiles.id, zeile.id)).run();

  // DIESELBE Regel wie beim Anlegen (T26 Punkt 5), nicht eine zweite: eine
  // verbleibende Datei → „file", mehrere → „folder". Ohne diesen Schritt zeigte
  // ein Share nach einem abgebrochenen zweiten Upload dauerhaft „Ordner" bei
  // einer Datei. Der Abbruch ist die EINZIGE Stelle, an der die Zahl nach dem
  // Anlegen noch sinkt.
  const rest =
    db
      .select({ anzahl: sql<number>`count(*)` })
      .from(shareFiles)
      .where(eq(shareFiles.shareId, zeile.shareId))
      .get()?.anzahl ?? 0;
  db.update(shares)
    .set({ type: rest > 1 ? "folder" : "file" })
    .where(eq(shares.id, zeile.shareId))
    .run();

  merkeAbbruch(zeile.id);
  return new Response(null, { status: 204 });
}
