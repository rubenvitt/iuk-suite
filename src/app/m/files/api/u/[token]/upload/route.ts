import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { RateLimiter, clientIpAus } from "@/core/ratelimit";
import { getDb } from "../../../../_db/client";
import { inboxFiles, zugangslinks } from "../../../../_db/schema";
import { reiheAvEin } from "../../../../_lib/av";
import {
  FILES_FEHLVERSUCHE_PRO_MIN,
  FILES_HINWEIS_MAX_ZEICHEN,
  grenzen,
} from "../../../../_lib/grenzen";
import { rolleOderNull } from "../../../../_lib/hostRolle";
import { ipKuerzen } from "../../../../_lib/ip";
import { istSchreibbareKategorie } from "../../../../_lib/kategorien";
import { MIME_PRAEFIX_BYTES, pruefeInhaltstyp } from "../../../../_lib/mime";
import {
  AblageNichtSchreibbar,
  GroesseUeberschritten,
  KeinPlatz,
  abschliesse,
  fortschritt,
  kopfBytes,
  loesche,
  schreibeStrom,
  type BlobZiel,
} from "../../../../_lib/storage";
import { normalisiereToken, tokenHash } from "../../../../_lib/token";

/**
 * DIE ANONYME ABGABE — `PUT /api/u/<token>/upload` (Spec §8.2–§8.5, Task 31).
 *
 * ═══ DAS DRAHTFORMAT, vollstaendig ═══════════════════════════════════════════
 *
 *   PUT /api/u/<token>/upload
 *     ?ab=<byteOffset>        IMMER. Byte-Offset, KEINE Chunk-Nummer.
 *     &id=<inboxFileId>       ab dem ZWEITEN Chunk (die Antwort des ersten nennt ihn).
 *     &ende=1                 der LETZTE Chunk dieser Datei.
 *     &name=<Anzeigename>     nur beim ERSTEN Chunk (ab=0 ohne id), Pflicht.
 *     &kategorie=<wert>       nur beim ersten Chunk, optional.
 *     &hinweis=<text>         nur beim ersten Chunk, optional.
 *     &typ=<deklarierter MIME> nur beim LETZTEN Chunk (ende=1), optional.
 *   Rumpf: die rohen Bytes dieses Chunks (hoechstens `FILES_CHUNK_BYTES`).
 *
 *   200 { id, empfangen, fertig }                    — `fertig: false` je Chunk,
 *   200 { id, empfangen, fertig: true, mimeTyp, dateiname }  — der letzte Chunk.
 *   Fehler: { code, fehler, … } mit
 *     code ∈ "token" · "zu-viele-fehlversuche" · "unbekannt" · "offset" · "name"
 *           · "kategorie" · "hinweis" · "zu-gross" · "typ-nicht-erlaubt"
 *           · "kein-platz" · "ablage"   (T50 ergaenzt "kontingent", §8.4)
 *
 * WARUM `name` VORNE UND `typ` HINTEN STEHT — die Asymmetrie ist keine
 * Nachlaessigkeit: `inbox_files.dateiname` ist `NOT NULL`, der Name muss also
 * schon bei der Anlage der Zeile bekannt sein; die Deklaration braucht
 * ausschliesslich `pruefeInhaltstyp` beim letzten Chunk, und es gibt keine Spalte,
 * in der sie bis dahin ueberleben koennte. Sie darf es auch nicht: gespeichert
 * wird der FESTGESTELLTE Typ (§8.5).
 *
 * WARUM DIE METADATEN IN DER ANFRAGE-URL STEHEN und nicht in Headern:
 * HTTP-Header sind ISO-8859-1, `Übung_Größe.pdf` waere dort ein Mojibake-Weg —
 * und genau dieser Name ist die 1:1-Zusage aus §12. Die Query ist UTF-8 und
 * prozentkodiert. In keinen Pfad geht der Name ohnehin (`_lib/storage.ts`).
 *
 * ═══ DIE ZEILE ENTSTEHT BEIM ERSTEN CHUNK, nicht beim letzten ════════════════
 *
 * Das ist die Bauform, die `_lib/aufraeumen.ts` beschreibt („ein abgebrochener
 * anonymer Chunk-Upload hinterlaesst Zeile und `inbox/<id>.part`") und die
 * §4.4 fuer `share_files` schon fuehrt: der Zwischenzustand „Zeile ohne Bytes"
 * ist SICHTBAR statt still. Zwei Eigenschaften haengen daran:
 *
 * - Die `id` kommt vom SERVER. Ein vom Browser gewaehlter Schluessel waere genau
 *   der Alt-Defekt aus §7.1 („schreibe an jede Stelle, die der Prozess
 *   erreicht") — hier zusaetzlich mit der Moeglichkeit, an die laufende Abgabe
 *   eines fremden Melders anzuhaengen.
 * - `av_status` steht ab der ersten Zeile auf `scanning`, und die Warteschlange
 *   holt sie trotzdem NICHT: `auftraege()` verlangt `bytes_vollstaendig_at IS
 *   NOT NULL` (`_lib/av.ts`). Ohne diese zweite Bedingung liefe clamd auf eine
 *   Datei, die es noch nicht gibt, und die Zeile stuende nach
 *   `FILES_AV_VERSUCHE` dauerhaft auf `error` — fail-closed.
 *
 * ═══ WAS DIESE DATEI (NOCH) NICHT TUT ════════════════════════════════════════
 *
 * Mengenbudget je Token, die Rueckabwicklung des benannten Wettlaufs, die
 * IP-Notbremse `FILES_IP_ANFRAGEN_PRO_10MIN` und der `POST`-Altweg des
 * Cutover-Fensters gehoeren T50 (Welle 6a) und werden HIER ergaenzt (Plan §2
 * fuehrt die Datei mit beiden Tasks). Die Reihenfolge der Stufen aus §8.4 ist
 * unten deshalb als Kette einzelner, benannter Schritte gebaut: Budget kommt
 * zwischen Zugangs-Guard und Chunk-Weg, die Notbremse dahinter.
 *
 * Der `POST`-Zweig bekommt seine EIGENE Rollensperre als erste Anweisung — die
 * Pruefung hier deckt nur `PUT` (Plan §1, „dreizehn Rollensperren").
 *
 * KEIN 207 MULTI-STATUS: eine Datei = eine Anfrage = ein Ergebnis, und der letzte
 * Chunk antwortet erst, wenn die Zeile steht. Heute kann in `drop` ein Upload
 * erfolgreich sein, obwohl der Status nicht 200 ist — der Client zeigt „Upload
 * abgelehnt", der Melder laedt erneut hoch und erzeugt eine Dublette (§8.2).
 *
 * KEIN TOKEN IM LOG. `drop` laeuft mit `logger: true`, seine `incoming
 * request`-Zeilen tragen die volle URL samt Token (§8.1). Wo diese Datei loggt,
 * erscheint die Inbox-ID, nie der Token.
 */

/** Der Rahmen fuer T38: jeder Fehlerfall traegt einen maschinenlesbaren Grund. */
type Fehlercode =
  | "token"
  | "zu-viele-fehlversuche"
  | "unbekannt"
  | "offset"
  | "name"
  | "kategorie"
  | "hinweis"
  | "zu-gross"
  | "typ-nicht-erlaubt"
  | "kein-platz"
  | "ablage";

/**
 * Der Fehlversuchszaehler des Zugangs-Guards (§8.4 Stufe 1). Schluessel ist die
 * ABSENDERADRESSE, und er zaehlt AUSSCHLIESSLICH Fehlversuche — der echte
 * Vorgang laeuft ueber das Mengenbudget je Token (T50).
 *
 * Der Grund steht in der eigenen Suite: im Modul `feedback` hat ein einziger
 * IP-Limiter mit 10/min den Kernfall getoetet (15 Ehrenamtliche aus einem
 * Vereins-WLAN teilen eine NAT-IP; ab der 11. Abgabe kam „Zu viele Anfragen").
 * Deshalb liegt dieser Zaehler HINTER der Token-Aufloesung: er wird nur
 * angefasst, wenn kein gueltiges Token vorlag.
 */
const fehlversuche = new RateLimiter({ windowMs: 60_000, max: FILES_FEHLVERSUCHE_PRO_MIN });

/** Steuerzeichen, `/` und `\` — mehr wird aus einem Anzeigenamen NICHT entfernt (§4.6, §12). */
const NAMENS_UNRAT = /[\x00-\x1F\x7F/\\]/g;

const GANZZAHL = /^\d+$/;

const JSON_KOPF = {
  "content-type": "application/json; charset=utf-8",
  // Eine Quittung ist nie zwischenspeicherbar; ein Zwischenspeicher auf dem Weg
  // haette sonst den Fortschritt einer fremden Abgabe.
  "cache-control": "no-store",
} as const;

function antwort(status: number, koerper: Record<string, unknown>): Response {
  return new Response(JSON.stringify(koerper), { status, headers: JSON_KOPF });
}

function fehler(
  status: number,
  code: Fehlercode,
  text: string,
  zusatz: Record<string, unknown> = {},
): Response {
  return antwort(status, { code, fehler: text, ...zusatz });
}

/**
 * Die Rollensperre antwortet OHNE Rumpf. Ein benannter Fehlercode waere hier die
 * Auskunft „diesen Pfad gibt es, nur nicht hier" — und genau die verweigert die
 * 404-Regel der Suite (`docs/design/README.md`).
 */
function nichtGefunden(): Response {
  return new Response(null, { status: 404 });
}

function ganzzahlOderNull(roh: string | null): number | null {
  if (roh === null || !GANZZAHL.test(roh)) return null;
  const zahl = Number(roh);
  return Number.isSafeInteger(zahl) ? zahl : null;
}

function errnoCode(grund: unknown): string | undefined {
  if (typeof grund === "object" && grund !== null && "code" in grund) {
    const code = (grund as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Der Rumpf als Byte-Strom. `null` (Anfrage ohne Rumpf) ist ein leerer Strom und
 * kein Fehler: er erzeugt eine leere Zwischendatei, und die faellt beim letzten
 * Chunk an `pruefeInhaltstyp` mit „keine Bytes" heraus.
 *
 * Ausgeschrieben ueber `getReader()` statt `for await (const s of anfrage.body)`
 * — dieselbe Bauform wie `stromAus` in `api/upload/[fileId]/route.ts`, und aus
 * demselben Grund: dass ein `ReadableStream` asynchron iterierbar ist, ist eine
 * Eigenschaft der Laufzeit und keine der Web-Streams. Die kurze Form braeuchte
 * ausserdem ein `as unknown as`, das jeden Ausfall vor `pnpm typecheck` verbirgt,
 * und ein fehlender `Symbol.asyncIterator` waere hier der Ausfall des ganzen
 * Upload-Wegs. Der Chunk-Weg hat EINE Bauform, nicht zwei (Plan T31 Punkt 2).
 */
async function* koerperStrom(anfrage: Request): AsyncGenerator<Uint8Array> {
  const strom = anfrage.body;
  if (strom === null) return;
  const leser = strom.getReader();
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
 * Stufe 1 aus §8.4: Token aufloesen, `revoked_at IS NULL`, `expires_at > now`.
 * Ein einziger Rueckgabewert `null` fuer alle drei Ablehnungen — der Melder
 * erfaehrt nicht, ob sein Code falsch, widerrufen oder abgelaufen ist, und die
 * Oberflaeche sagt in allen drei Faellen dasselbe (§10.1).
 */
function loeseTokenAuf(roh: string, jetzt: Date): { id: string } | null {
  const kanonisch = normalisiereToken(roh);
  if (kanonisch === null) return null;

  const zeile = getDb()
    .select({
      id: zugangslinks.id,
      expiresAt: zugangslinks.expiresAt,
      revokedAt: zugangslinks.revokedAt,
    })
    .from(zugangslinks)
    .where(eq(zugangslinks.tokenHash, tokenHash(kanonisch)))
    .get();

  if (zeile === undefined) return null;
  if (zeile.revokedAt !== null) return null;
  // Gleichstand ist abgelaufen — dieselbe Lesart wie bei `shares.expires_at`
  // (`_db/queries.ts`): `expires_at` bezeichnet das Ende der Laufzeit.
  if (zeile.expiresAt.getTime() <= jetzt.getTime()) return null;

  return { id: zeile.id };
}

/** Blob, Zwischendatei UND Zeile weg — der Weg jeder ENDGUELTIGEN Ablehnung. */
async function verwirf(ziel: BlobZiel, inboxFileId: string): Promise<void> {
  await raeumeBytesWeg(ziel);
  getDb().delete(inboxFiles).where(eq(inboxFiles.id, inboxFileId)).run();
}

/**
 * Nur die Bytes. Ein misslungenes Aufraeumen darf die fliegende Aussage nicht
 * ersetzen (dieselbe Linie wie im `finally` von `pruefeAblage`); ein wirklich
 * verwaister Rest ist Sache des Aufraeum-Laufs (§7.6).
 */
async function raeumeBytesWeg(ziel: BlobZiel): Promise<void> {
  try {
    await loesche(ziel);
  } catch (grund) {
    console.error(`[files][inbox] Aufraeumen nach Abbruch fehlgeschlagen:`, grund);
  }
}

export async function PUT(
  anfrage: Request,
  kontext: { params: Promise<{ token: string }> },
): Promise<Response> {
  // ERSTE ANWEISUNG: die Rollensperre. Ein Handler hat kein Layout, das sie fuer
  // ihn erledigen koennte (§3.2) — und `rolleOderNull` wirft nie, weil ein
  // `notFound()` im Antwortweg eines Uploads keine brauchbare Antwort ist.
  if (rolleOderNull(anfrage.headers) !== "inbox") return nichtGefunden();

  const jetzt = new Date();
  const { token } = await kontext.params;

  // --- Stufe 1: Zugangs-Guard, VOR allem anderen --------------------------
  const link = loeseTokenAuf(token, jetzt);
  if (link === null) {
    // Der Zaehler wird erst HIER angefasst. Die umgekehrte Reihenfolge ist der
    // gemessene Ausfall von `drop`: dort zaehlt der `onRequest`-Hook vor jedem
    // preHandler-Guard hoch, und fuenf Uploads OHNE Zugangsdaten sperren den
    // naechsten Upload MIT gueltigem Token — ein Fremder kann das Postfach
    // lahmlegen (§8.4).
    const nochErlaubt = fehlversuche.check(clientIpAus(anfrage.headers));
    return nochErlaubt
      ? fehler(401, "token", "Dieser Abgabelink ist nicht (mehr) gültig.")
      : fehler(
          429,
          "zu-viele-fehlversuche",
          "Zu viele Fehlversuche von dieser Verbindung. Bitte in einer Minute erneut versuchen.",
        );
  }

  // --- Stufe 2 (T50): Mengenbudget je Token --------------------------------
  // --- Stufe 3 (T50): IP-Notbremse -----------------------------------------

  return chunkWeg(anfrage, link.id, jetzt);
}

/**
 * Der Chunk-Weg — dieselbe Bauform wie `PUT /api/upload/[fileId]` (§7.1): `ab`
 * ist ein BYTE-Offset und muss genau der Laenge der Zwischendatei entsprechen,
 * `ende=1` schliesst ab. Eine Chunk-NUMMER stimmte nur, solange jeder Chunk
 * ausser dem letzten exakt `FILES_CHUNK_BYTES` gross ist — eine unausgesprochene
 * Invariante, die der erste abweichende Client still bricht.
 */
async function chunkWeg(anfrage: Request, tokenId: string, jetzt: Date): Promise<Response> {
  const suche = new URL(anfrage.url).searchParams;
  const ab = ganzzahlOderNull(suche.get("ab"));
  if (ab === null) {
    return fehler(400, "offset", "Der Parameter `ab` fehlt oder ist keine Bytezahl.");
  }
  const ende = suche.get("ende") === "1";
  const id = suche.get("id");

  const zeile = id === null ? eroeffne(suche, tokenId, anfrage, jetzt, ab) : hole(id, tokenId);
  if (zeile instanceof Response) return zeile;

  const ziel: BlobZiel = { art: "inbox", inboxFileId: zeile.id };
  // VOR dem `try`, weil der `catch` die Grenze fuer die 413-Meldung braucht. Der
  // Preis ist sichtbar: auch eine Anfrage mit falschem Offset liest jetzt zuerst
  // die Grenzen. Bei einer §9.4-widrigen Konfiguration wuerfe das statt 409 —
  // unerreichbar, weil Pruefung 2/3 schon den Start abbricht, aber es soll
  // dastehen und nicht als Zufall der Zeilenreihenfolge gelesen werden.
  const g = grenzen();

  // EIN Riegel um den GANZEN Byte-Weg, nicht nur um das Schreiben. Vier Aufrufe
  // in `_lib/storage.ts` koennen dieselben Fehlerklassen aus §5.4 werfen:
  // `fortschritt` (stat → EACCES/EROFS), `schreibeStrom` (open/write → ENOSPC,
  // EACCES, EEXIST), `kopfBytes` (open) und `abschliesse` (rename → ENOSPC).
  // Lag der Riegel nur um `schreibeStrom`, wurde aus einem vollen Volume beim
  // `rename` ein 500 mit leerem Rumpf — und die Zwischendatei blieb liegen, wo
  // sie unter der Standardkonfiguration niemand mehr abholt (`_lib/aufraeumen.ts`
  // fuehrt fuer unvollstaendige `inbox_files` keine Frist).
  try {
    // Der Fortschritt IST die Laenge der Zwischendatei — kein zweiter Zustand, der
    // auseinanderlaufen kann (§7.1 Schritt 3).
    const bisher = await fortschritt(ziel);
    // GENAU die Laenge, in BEIDE Richtungen: ein kleineres `ab` haenge zusammen
    // mit `anhaengen: ab > 0` die Bytes trotzdem hinten an und verdorbe den Blob
    // still — die Magic-Byte-Pruefung saehe nichts davon, weil sie nur den Kopf
    // liest.
    if (bisher !== ab) {
      return fehler(
        409,
        "offset",
        `Dieser Abschnitt passt nicht: erwartet wurde Byte ${bisher}.`,
        { erwartetesAb: bisher },
      );
    }

    const { bytes } = await schreibeStrom(ziel, koerperStrom(anfrage), {
      maxBytes: g.maxDateiBytes,
      // `anhaengen: false` oeffnet mit `wx` — nur so sieht ein zweiter Starter
      // auf dasselbe Ziel EEXIST statt verschraenkter Bytes (§5.3).
      anhaengen: ab > 0,
    });

    // §6.6, die ZWEITE Linie. Im Normalbetrieb unerreichbar, weil Pruefung 3 aus
    // §9.4 `FILES_MAX_DATEI_BYTES <= FILES_AV_MAX_BYTES` beim Start erzwingt —
    // und genau deshalb steht sie hier: eine BENANNTE Ablehnung statt einer Datei,
    // die dauerhaft nicht scanbar und damit fail-closed nie ladbar waere.
    if (bytes > g.avMaxBytes) {
      await verwirf(ziel, zeile.id);
      return fehler(
        413,
        "zu-gross",
        `Datei zu groß für die Virenprüfung (Grenze: ${g.avMaxBytes} Bytes).`,
      );
    }

    if (!ende) {
      return antwort(200, { id: zeile.id, empfangen: bytes, fertig: false });
    }

    // `return await`, nicht `return`: ein blosses `return` eines Promise verlaesst
    // das `try` VOR seiner Ablehnung — der `catch` saehe die Fehler des letzten
    // Chunks nie, und genau die (rename auf vollem Volume) sind der Grund fuer
    // diesen Riegel.
    return await schliesseAb(ziel, zeile, suche.get("typ"), bytes, jetzt);
  } catch (grund) {
    return await aufSchreibfehler(grund, ziel, zeile.id, g.maxDateiBytes);
  }
}

/** Was der Chunk-Weg von der Zeile braucht — und ausdruecklich nicht mehr. */
type Zeile = { id: string; dateiname: string };

/**
 * Der ERSTE Chunk: Metadaten pruefen, DANN die Zeile anlegen. Die Reihenfolge
 * traegt eine Zusage — eine abgelehnte Kategorie oder ein zu langer Hinweis
 * hinterlaesst KEINE halbe Zeile. Fuer `inbox_files` gibt es unter der
 * Standardkonfiguration keine Verfallsfrist (`FILES_INBOX_AUFBEWAHRUNG_TAGE` hat
 * bewusst keine Vorbelegung), eine Waise holte also niemand mehr ab.
 */
function eroeffne(
  suche: URLSearchParams,
  tokenId: string,
  anfrage: Request,
  jetzt: Date,
  ab: number,
): Zeile | Response {
  if (ab !== 0) {
    return fehler(400, "offset", "Ohne `id` beginnt eine Abgabe bei `ab=0`.", { erwartetesAb: 0 });
  }

  const dateiname = (suche.get("name") ?? "").replace(NAMENS_UNRAT, "").trim();
  if (dateiname === "") {
    return fehler(400, "name", "Der Dateiname fehlt.");
  }

  const rohKategorie = suche.get("kategorie");
  // Leer heisst „keine Kategorie" und ist NULL in der Spalte — nicht `""`
  // (`_lib/kategorien.ts` haelt beide Formen fuer dieselbe Sache).
  const kategorie = rohKategorie === null || rohKategorie.trim() === "" ? null : rohKategorie;
  if (kategorie !== null && !istSchreibbareKategorie(kategorie)) {
    return fehler(400, "kategorie", "Diese Kategorie gibt es nicht.");
  }

  const rohHinweis = suche.get("hinweis");
  const hinweis = rohHinweis === null || rohHinweis === "" ? null : rohHinweis;
  // CODE POINTS, nicht UTF-16-Einheiten: `"🚒".repeat(500).length` ist 1000, und
  // eine Pruefung ueber `.length` wiese genau die Abgabe ab, die die Grenze
  // einhaelt (§8.3).
  if (hinweis !== null && Array.from(hinweis).length > FILES_HINWEIS_MAX_ZEICHEN) {
    return fehler(
      400,
      "hinweis",
      `Der Hinweis ist länger als ${FILES_HINWEIS_MAX_ZEICHEN} Zeichen.`,
    );
  }

  const id = nanoid(10);
  getDb()
    .insert(inboxFiles)
    .values({
      id,
      tokenId,
      dateiname,
      kategorie,
      hinweis,
      // NULL bis zum letzten Chunk: gespeichert wird der FESTGESTELLTE Typ, und
      // festgestellt ist er erst, wenn alle Bytes liegen (§8.5).
      mimeType: null,
      size: 0,
      // Durch `ipKuerzen`, an JEDER Schreibstelle einer Absenderadresse (§4.5).
      // Der Zaehler oben arbeitet dagegen mit der VOLLEN Adresse im
      // Prozessspeicher und schreibt sie nie.
      clientIpUnbestaetigt: ipKuerzen(clientIpAus(anfrage.headers)),
      empfangenAt: jetzt,
      bytesVollstaendigAt: null,
      avStatus: "scanning",
    })
    .run();

  return { id, dateiname };
}

/**
 * Jeder FOLGEchunk loest seine Zeile serverseitig auf — mit `token_id` als
 * Bedingung IM `WHERE`, nicht als Vergleich davor. Ohne diese Bedingung haengte
 * ein zweiter Melder mit gueltigem eigenem Token Bytes an die laufende Abgabe
 * eines fremden Tokens an (`CLAUDE.md`, „Zugriffsschutz": die
 * Objekt-Zugehoerigkeit wird aus der Datenbank aufgeloest, nie aus einem
 * URL-Parameter).
 *
 * `bytes_vollstaendig_at IS NULL` schliesst eine bereits abgeschlossene Datei
 * aus: sie ist fertig, und ein zweiter Durchgang ueber dieselbe `id` wuerde
 * entweder Bytes an einen geprueften Blob haengen oder ihn ersetzen.
 */
function hole(id: string, tokenId: string): Zeile | Response {
  const zeile = getDb()
    .select({ id: inboxFiles.id, dateiname: inboxFiles.dateiname })
    .from(inboxFiles)
    .where(
      and(
        eq(inboxFiles.id, id),
        eq(inboxFiles.tokenId, tokenId),
        isNull(inboxFiles.bytesVollstaendigAt),
      ),
    )
    .get();

  if (zeile === undefined) {
    return fehler(404, "unbekannt", "Diese Abgabe ist nicht (mehr) offen.");
  }
  return zeile;
}

/**
 * Der letzte Chunk: Magic-Byte-Pruefung, atomares Umbenennen, dann die Zeile.
 * Die Reihenfolge ist die Zusage — die Pruefung liegt ZWISCHEN Schreiben und
 * Umbenennen, ihr Fehlschlag darf das Ziel nie entstehen lassen (§5.3, §8.5).
 */
async function schliesseAb(
  ziel: BlobZiel,
  zeile: Zeile,
  deklariert: string | null,
  bytes: number,
  jetzt: Date,
): Promise<Response> {
  const praefix = await kopfBytes(ziel, MIME_PRAEFIX_BYTES);
  const befund = pruefeInhaltstyp({
    praefix,
    gesamtGroesse: bytes,
    deklariert,
    dateiname: zeile.dateiname,
  });
  if (!befund.ok) {
    await verwirf(ziel, zeile.id);
    return fehler(415, "typ-nicht-erlaubt", befund.meldung);
  }

  // Die GEMESSENE Bytezahl, nicht die des Schreibvorgangs: `abschliesse` liest
  // die Laenge der Zwischendatei unmittelbar vor dem `rename`.
  const { bytes: endgueltig } = await abschliesse(ziel);

  getDb()
    .update(inboxFiles)
    .set({
      size: endgueltig,
      // Der FESTGESTELLTE Typ, nie die Deklaration (§8.5). Aus dem Durchschlupf
      // von `drop` — HTML-Inhalt in `evil.html`, deklariert als `image/png` —
      // wuerde hier gespeicherter XSS im Cookie-Scope der ganzen Suite.
      mimeType: befund.typ,
      bytesVollstaendigAt: jetzt,
    })
    .where(eq(inboxFiles.id, zeile.id))
    .run();

  // Erst JETZT ist die Zeile Teil der Warteschlange (`bytes_vollstaendig_at IS
  // NOT NULL`); dieser Aufruf zieht sie nur vor den naechsten Takt und tut ohne
  // laufenden Arbeiter nichts (§6.4).
  reiheAvEin(ziel);

  return antwort(200, {
    id: zeile.id,
    empfangen: endgueltig,
    fertig: true,
    mimeTyp: befund.typ,
    dateiname: zeile.dateiname,
  });
}

/**
 * Die Fehlerabbildung aus §5.4. Drei Wege, drei verschiedene naechste Schritte —
 * und nur einer davon ist ein Nutzerfehler.
 */
async function aufSchreibfehler(
  grund: unknown,
  ziel: BlobZiel,
  inboxFileId: string,
  maxDateiBytes: number,
): Promise<Response> {
  if (grund instanceof GroesseUeberschritten) {
    // ENDGUELTIG: diese Datei passt nie. Blob UND Zeile gehen, sonst bleibt
    // unter der Standardkonfiguration eine Waise ohne Frist zurueck.
    await verwirf(ziel, inboxFileId);
    return fehler(
      413,
      "zu-gross",
      `Die Datei ist größer als erlaubt (Grenze: ${maxDateiBytes} Bytes).`,
    );
  }

  if (grund instanceof KeinPlatz) {
    // Die ZEILE bleibt, und das ist der Unterschied zu oben: der Platzmangel ist
    // ein Betriebszustand, keine Aussage ueber die Datei. Der Melder kann mit
    // derselben `id` bei `ab=0` neu beginnen — die Zwischendatei ist weg, also
    // oeffnet der naechste erste Chunk wieder exklusiv mit `wx`.
    await raeumeBytesWeg(ziel);
    return fehler(
      507,
      "kein-platz",
      "Auf dem Server ist kein Platz mehr. Bitte melden Sie sich bei der Leitstelle.",
    );
  }

  if (grund instanceof AblageNichtSchreibbar) {
    // LAUT, weil es ein Konfigurationsfehler ist und kein Nutzerfehler: ohne
    // diese Zeile sieht der Betreiber nur 500 ohne Grund. Die Inbox-ID steht
    // darin, der Token nie (§8.1).
    console.error(
      `[files][inbox] Ablage nicht schreibbar bei der Abgabe ${inboxFileId}:`,
      grund,
    );
    return fehler(500, "ablage", "Die Ablage ist gerade nicht beschreibbar.");
  }

  if (errnoCode(grund) === "EEXIST") {
    // Ein ZWEITER Starter auf dasselbe Ziel: `wx` meldet den Konflikt, statt
    // Bytes zu verschraenken (`_lib/storage.ts`). Gelesen wird der errno-Code und
    // keine Fehlerklasse, weil `uebersetze` EEXIST ABSICHTLICH unveraendert
    // durchreicht — genau damit der Aufrufer ihn hier sieht.
    //
    // Erreichbar auch ohne Gleichzeitigkeit: nach einem 507 bleibt die Zeile
    // stehen, der Melder beginnt mit derselben `id` bei `ab=0` neu, und zwei
    // solche Wiederaufnahmen laufen aufeinander. Die Antwort ist dieselbe wie bei
    // einem falschen Offset — damit der Client denselben Weg geht, und dieselbe
    // wie in `api/upload/[fileId]/route.ts`.
    const stand = await fortschritt(ziel).catch(() => 0);
    return fehler(409, "offset", "Für diese Abgabe läuft bereits eine Übertragung.", {
      erwartetesAb: stand,
    });
  }

  throw grund;
}
