import { withAuditContext, auditDenied } from "@/core/audit/server";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { RateLimiter, clientIpAus } from "@/core/ratelimit";
import { getDb } from "../../../../_db/client";
import { inboxFiles, zugangslinks } from "../../../../_db/schema";
import {
  behalteAbschnittVor,
  belegeDateiplatz,
  gibAbschnittFrei,
  unterBudgetRiegel,
  wandleInVerbrauchUm,
} from "../../../../_lib/abgabeBudget";
import { reiheAvEin } from "../../../../_lib/av";
import {
  FILES_CHUNK_BYTES,
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
  BereitsAbgeschlossen,
  BlobFehlt,
  GroesseUeberschritten,
  KeinPlatz,
  SchreibbesitzBelegt,
  abschliesse,
  fortschritt,
  kopfBytes,
  loesche,
  mitSchreibbesitz,
  schreibeStrom,
  type BlobZiel,
} from "../../../../_lib/storage";
import { normalisiereToken, tokenHash } from "../../../../_lib/token";

/**
 * DIE ANONYME ABGABE — `PUT /api/u/<token>/upload` (Spec §8.2–§8.5, Task 31)
 * samt Budget, Notbremse und dem `POST`-Altweg des Cutover-Fensters (Task 50).
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
 *           · "kein-platz" · "ablage" · "kontingent" · "zu-viele-anfragen"
 *           · "veraltet" (nur der POST-Altweg)
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
 * ═══ DIE DREI STUFEN AUS §8.4, in dieser Reihenfolge (Task 50) ═══════════════
 *
 *   1. Zugangs-Guard        Token aufloesen; Fehlversuchszaehler je ADRESSE.
 *   2. Mengenbudget         je TOKEN, in der Datenbank, atomar (`_db/zaehler.ts`).
 *   3. IP-Notbremse         `FILES_IP_ANFRAGEN_PRO_10MIN`, im Prozessspeicher.
 *
 * Die Reihenfolge ist die Zusage, nicht nur die Summe der drei Stufen. Laege die
 * Notbremse vorn, verbrauchte jede vom Guard oder vom Budget abgewiesene Anfrage
 * einen ihrer Plaetze — und ein Fremder ohne jede Zugangsdaten schloesse das
 * Postfach fuer die ganze NAT-Adresse. Der Schluessel des echten Vorgangs ist
 * deshalb das TOKEN, die Adresse ist ausschliesslich Notbremse (§8.4).
 *
 * Der `POST`-Zweig traegt seine EIGENE Rollensperre als erste Anweisung — die
 * Pruefung im `PUT` deckt nur `PUT` (Plan §1, „dreizehn Rollensperren").
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
  | "ablage"
  | "kontingent"
  | "zu-viele-anfragen"
  | "veraltet";

/**
 * EIN Text fuer beide Wege ins erschoepfte Kontingent — die Vorpruefung und die
 * Rueckabwicklung des Wettlaufs. Fuer den Melder ist es derselbe Zustand, und
 * zwei Formulierungen dafuer waeren zwei Fehlerbilder fuer eine Sache.
 *
 * Der naechste Schritt steht im Text, weil ihn nur der Betreiber gehen kann: das
 * Budget ist nachtraeglich erhoehbar (`kontingentAufstockenAction`, §8.4), und
 * der GEDRUCKTE Code bleibt dabei gueltig. Ohne diesen Satz waere die Grenze fuer
 * den Melder eine Sackgasse.
 */
const KONTINGENT_ERSCHOEPFT =
  "Das Kontingent dieses Abgabelinks ist erschöpft. Bitte beim I&K melden.";

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

/**
 * Stufe 3 aus §8.4: die IP-Notbremse. Sie liegt bei 600 Anfragen je 10 Minuten —
 * bei 4-MiB-Chunks rund 2,3 GiB ueber EINE Adresse. **Wer den Wert senkt,
 * reproduziert den `feedback`-Ausfall** (15 Ehrenamtliche hinter einer NAT-IP, ab
 * der 11. Abgabe „Zu viele Anfragen"). Genau deshalb ist die Zahl eine
 * Env-Variable und keine Konstante: die Groessenordnung eines realen Einsatzes
 * kennt nur der Betreiber (§13.2, Frage 15).
 *
 * WARUM DER ZAEHLER NICHT AUF MODULEBENE STEHT wie `fehlversuche` daneben: seine
 * Grenze kommt aus `grenzen()`, und ein Aufruf beim Import laege VOR jeder
 * Boot-Pruefung — eine §9.4-widrige Konfiguration wuerfe dann schon beim Laden
 * des Moduls, also als Ausfall der ganzen Route statt als benannter
 * Startabbruch. Neu gebaut wird der Zaehler nur, wenn sich die Grenze aendert;
 * im Betrieb passiert das NIE (die Umgebung steht ab dem Start fest), sodass er
 * dort ueber die ganze Laufzeit derselbe bleibt.
 */
let notbremseStand: { max: number; limiter: RateLimiter } | null = null;

function notbremse(max: number): RateLimiter {
  if (notbremseStand === null || notbremseStand.max !== max) {
    notbremseStand = { max, limiter: new RateLimiter({ windowMs: 600_000, max }) };
  }
  return notbremseStand.limiter;
}

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

/** Was die Stufen 2 und 3 vom aufgeloesten Abgabelink brauchen. */
type Link = {
  id: string;
  restDateien: number;
  restBytes: number;
};

/**
 * Stufe 1 aus §8.4: Token aufloesen, `revoked_at IS NULL`, `expires_at > now`.
 * Ein einziger Rueckgabewert `null` fuer alle drei Ablehnungen — der Melder
 * erfaehrt nicht, ob sein Code falsch, widerrufen oder abgelaufen ist, und die
 * Oberflaeche sagt in allen drei Faellen dasselbe (§10.1).
 *
 * DIE BUDGETSPALTEN KOMMEN AUS DIESER ABFRAGE MIT, und das ist der Grund, warum
 * die Vorpruefung der Stufe 2 kein zweites Statement kostet. „Ein einzelnes
 * SQL-Statement pro Vorgang" (§8.4, `_db/zaehler.ts`) meint die BUCHUNG: sie ist
 * das `UPDATE` mit Bedingung, und ihre Entscheidung ist die Zahl betroffener
 * Zeilen. Die Werte hier sind eine Vorschau, nie die Entscheidung — zwischen
 * dieser Zeile und der Buchung darf sich das Restbudget aendern, und genau dafuer
 * gibt es die Rueckabwicklung in `schliesseAb`.
 */
function loeseTokenAuf(roh: string, jetzt: Date): Link | null {
  const kanonisch = normalisiereToken(roh);
  if (kanonisch === null) return null;

  const zeile = getDb()
    .select({
      id: zugangslinks.id,
      expiresAt: zugangslinks.expiresAt,
      revokedAt: zugangslinks.revokedAt,
      budgetDateien: zugangslinks.budgetDateien,
      budgetBytes: zugangslinks.budgetBytes,
      verbrauchtDateien: zugangslinks.verbrauchtDateien,
      verbrauchtBytes: zugangslinks.verbrauchtBytes,
    })
    .from(zugangslinks)
    .where(eq(zugangslinks.tokenHash, tokenHash(kanonisch)))
    .get();

  if (zeile === undefined) return null;
  if (zeile.revokedAt !== null) return null;
  // Gleichstand ist abgelaufen — dieselbe Lesart wie bei `shares.expires_at`
  // (`_db/queries.ts`): `expires_at` bezeichnet das Ende der Laufzeit.
  if (zeile.expiresAt.getTime() <= jetzt.getTime()) return null;

  return {
    id: zeile.id,
    restDateien: zeile.budgetDateien - zeile.verbrauchtDateien,
    restBytes: zeile.budgetBytes - zeile.verbrauchtBytes,
  };
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
    // Nur die noch zugelassenen Fehlversuche dauerhaft protokollieren. Ohne
    // diese Reihenfolge erzeugte auch jede bereits mit 429 abgewiesene Anfrage
    // weiterhin eine neue Zeile in der zentralen Audit-Datenbank.
    if (nochErlaubt) auditDenied("files");
    return nochErlaubt
      ? fehler(401, "token", "Dieser Abgabelink ist nicht (mehr) gültig.")
      : fehler(
          429,
          "zu-viele-fehlversuche",
          "Zu viele Fehlversuche von dieser Verbindung. Bitte in einer Minute erneut versuchen.",
        );
  }

  // --- Stufe 2: Mengenbudget je Token, Vorpruefung -------------------------
  // Ist ueberhaupt nichts mehr frei, endet die Anfrage HIER — vor dem Chunk-Weg
  // und damit ohne Zeile, die danach jemand wegraeumen muesste. Verbindlich
  // entscheiden erst `belegeDateiplatz` (Dateiplatz, erster Chunk) und
  // `behalteAbschnittVor` (Bytes, jeder Chunk), die auch offene Abgaben
  // mitzaehlen (DRK-288); diese Vorschau kennt nur `verbraucht_*`.
  //
  // ASYMMETRIE, benannt statt uebersehen: die beiden Kontingent-Ausgaenge INNEN
  // (`aufSchreibfehler`, `schliesseAb`) raeumen Blob UND Zeile weg, dieser hier
  // kann das nicht — er kennt die Zeile nicht, weil er vor ihrer Aufloesung
  // liegt. Trifft er einen SPAETEREN Chunk, bleiben Zeile und `.part` einer
  // halben Abgabe stehen; das ist dieselbe Form, die der 507-Weg absichtlich
  // hinterlaesst, und Sache des Aufraeum-Laufs (§7.6). Die Pruefung nach hinten
  // zu verschieben, waere der teurere Tausch: dann liefe jede Anfrage eines
  // erschoepften Links erst durch die Notbremse.
  if (link.restDateien <= 0 || link.restBytes <= 0) {
    return fehler(429, "kontingent", KONTINGENT_ERSCHOEPFT);
  }

  // --- Stufe 3: IP-Notbremse, ZULETZT --------------------------------------
  // Erst hier zaehlt eine Anfrage als Vorgang. Alles davor Abgewiesene bleibt
  // ungezaehlt — sonst sperrte ein Fremder ohne Zugangsdaten die ganze Adresse.
  if (!notbremse(grenzen().ipAnfragenPro10Min).check(clientIpAus(anfrage.headers))) {
    return fehler(
      429,
      "zu-viele-anfragen",
      "Zu viele Anfragen von dieser Verbindung. Bitte in einigen Minuten erneut versuchen.",
    );
  }

  return withAuditContext({ actor: { kind: "anonymous" } }, () => chunkWeg(anfrage, link, jetzt));
}

/**
 * DER ALTWEG DES CUTOVER-FENSTERS (§8.2) — die einzige Zeile im Modul mit einem
 * Ablaufdatum: nach dem Standby-Ende darf dieser Export entfallen.
 *
 * Sein einziger Aufrufer ist drops React-SPA in einem Tab, der beim Umschwenken
 * schon offen war (`drop/src/app.js:711`); jede neue Navigation laedt die
 * Suite-Ansicht. Fuer diesen Tab ist ein stummes 405 die schlechteste aller
 * Antworten: der Alt-Client wertet nur `uploaded.length > 0` aus und zeigt
 * „Upload abgelehnt", ohne zu sagen, was zu tun ist. Deshalb 409 MIT Text.
 *
 * Die FormData-Felder `hint`/`category`/`files` werden NICHT gelesen — mit dem
 * Chunk-Format entfallen sie, und ein 409 braucht keinen Rumpf. Die Datei ist
 * damit nicht gespeichert, es entsteht also auch keine Dublette.
 *
 * EINEN EINSTIEGSPUNKT IN DER OBERFLAECHE HAT DIESER ZWEIG NICHT, und das ist
 * Absicht (§10.2): er bedient ausschliesslich Alt-Clients.
 */
export async function POST(anfrage: Request): Promise<Response> {
  // Die EIGENE erste Anweisung. Dass `PUT` daneben dieselbe Pruefung traegt,
  // hilft hier nichts — es ist ein eigener Export mit eigenem Code, und ohne
  // diese Zeile antwortete der Altweg auch auf dem Verwaltungs-Host.
  if (rolleOderNull(anfrage.headers) !== "inbox") return nichtGefunden();

  return fehler(
    409,
    "veraltet",
    "Diese Seite ist veraltet — bitte neu laden und die Abgabe wiederholen.",
  );
}

/**
 * Der Chunk-Weg — dieselbe Bauform wie `PUT /api/upload/[fileId]` (§7.1): `ab`
 * ist ein BYTE-Offset und muss genau der Laenge der Zwischendatei entsprechen,
 * `ende=1` schliesst ab. Eine Chunk-NUMMER stimmte nur, solange jeder Chunk
 * ausser dem letzten exakt `FILES_CHUNK_BYTES` gross ist — eine unausgesprochene
 * Invariante, die der erste abweichende Client still bricht.
 */
async function chunkWeg(anfrage: Request, link: Link, jetzt: Date): Promise<Response> {
  const tokenId = link.id;
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

  // DER SCHREIBBESITZ UMSCHLIESST ALLES, was die Datei beruehrt (DRK-289):
  // Offen-Pruefung, Offset, Schreiben, Typpruefung, Abschluss UND die
  // Fehlerbehandlung. Ohne ihn passierten zwei ueberlappende Folgeanfragen
  // beide die Offset-Pruefung; die eine hielt ihren Deskriptor ueber einen
  // verzoegerten Rumpf offen, die andere schloss ab, und nach dem sauberen Scan
  // wuchs der freigegebene Blob weiter. Die Fehlerbehandlung liegt INNEN, weil
  // ihr `verwirf` sonst die Zwischendatei einer Folgeanfrage mitnaehme, die den
  // Besitz schon uebernommen hat.
  try {
    return await mitSchreibbesitz(ziel, async () => {
      // Die Offen-Pruefung ERNEUT, jetzt unter dem Besitz: `hole` oben lief
      // davor, und dazwischen darf eine andere Anfrage abgeschlossen haben. Ohne
      // diese Zeile begaenne eine Folgeanfrage mit `ab=0` eine neue
      // Zwischendatei neben dem schon geprueften Blob.
      if (id !== null) {
        const nochOffen = hole(id, tokenId);
        if (nochOffen instanceof Response) return nochOffen;
      }
      return await byteWeg(anfrage, suche, ziel, zeile, tokenId, ab, ende, jetzt, g);
    });
  } catch (grund) {
    if (grund instanceof SchreibbesitzBelegt) {
      // Dieselbe Antwort wie bei EEXIST unten: der Client uebernimmt den Stand
      // und setzt fort, sobald die laufende Anfrage durch ist.
      const stand = await fortschritt(ziel).catch(() => 0);
      return fehler(409, "offset", "Für diese Abgabe läuft bereits eine Übertragung.", {
        erwartetesAb: stand,
      });
    }
    throw grund;
  }
}

/** Der Byte-Weg einer Anfrage — ausschliesslich im Schreibbesitz aufgerufen. */
async function byteWeg(
  anfrage: Request,
  suche: URLSearchParams,
  ziel: BlobZiel,
  zeile: Zeile,
  tokenId: string,
  ab: number,
  ende: boolean,
  jetzt: Date,
  g: ReturnType<typeof grenzen>,
): Promise<Response> {
  // Welche Grenze den Schreibstrom begrenzt hat, entscheidet den Namen der
  // Ablehnung — geworfen wird in jedem Fall `GroesseUeberschritten`. Belegt wird
  // die Variable erst, wenn der Vorbehalt steht (unten).
  let grenzArt: GrenzArt = "datei";

  // EIN `try` um den GANZEN Byte-Weg, nicht nur um das Schreiben. Vier Aufrufe
  // in `_lib/storage.ts` koennen dieselben Fehlerklassen aus §5.4 werfen:
  // `fortschritt` (stat → EACCES/EROFS), `schreibeStrom` (open/write → ENOSPC,
  // EACCES, EEXIST), `kopfBytes` (open) und `abschliesse` (rename → ENOSPC).
  // Lag das `try` nur um `schreibeStrom`, wurde aus einem vollen Volume beim
  // `rename` ein 500 mit leerem Rumpf — und die Zwischendatei blieb liegen, bis
  // der Aufraeum-Lauf sie nach `FILES_UPLOAD_VERFALL_STUNDEN` abholt.
  try {
    // Der Fortschritt IST die Laenge der Zwischendatei — kein zweiter Zustand, der
    // auseinanderlaufen kann (§7.1 Schritt 3).
    const bisher = await fortschritt(ziel);
    // GENAU die Laenge, in BEIDE Richtungen: ein kleineres `ab` haenge zusammen
    // mit `anhaengen` die Bytes trotzdem hinten an und verdorbe den Blob
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

    // DER VORBEHALT, VOR dem ersten Byte (DRK-288). Er rechnet alle anderen
    // offenen Abgaben des Links mit — ihre liegenden Bytes und die Obergrenzen
    // ihrer gerade laufenden Chunks — und haelt fuer DIESEN Chunk hoechstens
    // `FILES_CHUNK_BYTES` fest. Vorher sah jede Anfrage dasselbe unverbrauchte
    // Restbudget, weil offene Abgaben nirgends zaehlten.
    //
    // Warum die Grenze VOR dem Schreiben sitzt und nicht erst bei der Buchung:
    // sonst schriebe ein Handyvideo erst seine vollen 200 MiB, bevor jemand
    // feststellt, dass es in ein Restbudget von 10 MiB nie passt (§8.4: „bricht
    // frueh ab, statt Bytes zu schreiben, die nicht passen").
    const vorbehalt = await behalteAbschnittVor(getDb(), tokenId, zeile.id, bisher);
    if (!vorbehalt.ok) {
      await verwirf(ziel, zeile.id);
      return fehler(429, "kontingent", KONTINGENT_ERSCHOEPFT);
    }
    grenzArt = g.maxDateiBytes <= vorbehalt.obergrenze ? "datei" : vorbehalt.bindend;

    let bytes: number;
    try {
      ({ bytes } = await schreibeStrom(ziel, koerperStrom(anfrage), {
        maxBytes: Math.min(g.maxDateiBytes, vorbehalt.obergrenze),
        // IMMER anhaengen: die Exklusivitaet traegt seit DRK-289 der
        // Schreibbesitz, nicht mehr `wx`, und der Offset ist oben geprueft. `wx`
        // machte aus einer LEEREN Zwischendatei eine 409-Schleife.
        anhaengen: true,
      }));
    } finally {
      // In JEDEM Ausgang, genau hier: ab jetzt zaehlt die Datei mit der Laenge
      // ihrer Zwischendatei, und die steht fest. Ein vergessener Vorbehalt hielte
      // bis zum Neustart Budget fest.
      await gibAbschnittFrei(tokenId, zeile.id);
    }

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
    // dieses `try`.
    return await schliesseAb(ziel, zeile, tokenId, suche.get("typ"), bytes, jetzt);
  } catch (grund) {
    return await aufSchreibfehler(grund, ziel, zeile.id, g.maxDateiBytes, grenzArt);
  }
}

/** Welche Grenze den Schreibstrom begrenzt hat: Datei, Kontingent oder Abschnitt. */
type GrenzArt = "datei" | "budget" | "abschnitt";

/** Was der Chunk-Weg von der Zeile braucht — und ausdruecklich nicht mehr. */
type Zeile = { id: string; dateiname: string };

/**
 * Der ERSTE Chunk: Metadaten pruefen, DANN die Zeile anlegen. Die Reihenfolge
 * traegt eine Zusage — eine abgelehnte Kategorie oder ein zu langer Hinweis
 * hinterlaesst KEINE halbe Zeile — und belegt damit auch keinen Dateiplatz des
 * Kontingents (DRK-288). Eine offene Zeile verfaellt nach
 * `FILES_UPLOAD_VERFALL_STUNDEN` (`_lib/aufraeumen.ts`, `offeneAbgabeVerfallen`).
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
  // DER DATEIPLATZ WIRD HIER BELEGT, nicht erst beim Abschluss (DRK-288): Zaehlen
  // und Anlegen in einer Transaktion. Vorher sah jede neue Abgabe dasselbe
  // unverbrauchte Kontingent, und ein Link mit einem Platz hielt beliebig viele
  // offene Dateien.
  const belegt = belegeDateiplatz(getDb(), tokenId, {
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
  });
  if (!belegt) return fehler(429, "kontingent", KONTINGENT_ERSCHOEPFT);

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
  tokenId: string,
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

  // UMBENENNEN UND BUCHEN unter dem Budget-Riegel des Links (DRK-288): zwischen
  // `rename` und Buchung zaehlte die Datei sonst weder als offen (die
  // Zwischendatei ist weg) noch als verbraucht — ein paralleler Vorbehalt saehe
  // genau in diesem Fenster zu viel Platz.
  const ergebnis = await unterBudgetRiegel(tokenId, async () => {
    // Die GEMESSENE Bytezahl, nicht die des Schreibvorgangs: `abschliesse` liest
    // die Laenge der Zwischendatei unmittelbar vor dem `rename`.
    const { bytes: endgueltig } = await abschliesse(ziel);
    // DIE UMWANDLUNG: `verbraucht_*` hochzaehlen UND die Zeile abschliessen, in
    // EINER Transaktion (`_lib/abgabeBudget.ts`). Der Dateiplatz war seit dem
    // ersten Chunk belegt, die Bytes seit jedem Chunk vorbehalten — hier wird
    // daraus Verbrauch, ohne dass die Datei dazwischen doppelt oder gar nicht
    // zaehlt. Gebucht wird NACH der Typpruefung: eine abgelehnte Datei darf kein
    // Kontingent kosten.
    //
    // `false` heisst: das Budget wurde seit dem Vorbehalt gesenkt, oder die Zeile
    // ist nicht mehr offen. Dann ist nichts gebucht, und Blob UND Zeile gehen —
    // ohne diesen Zweig bliebe ein stiller Waise liegen.
    //
    // Der FESTGESTELLTE Typ, nie die Deklaration (§8.5). Aus dem Durchschlupf
    // von `drop` — HTML-Inhalt in `evil.html`, deklariert als `image/png` —
    // wuerde sonst gespeicherter XSS im Cookie-Scope der ganzen Suite.
    const umgewandelt = wandleInVerbrauchUm(getDb(), tokenId, zeile.id, {
      bytes: endgueltig,
      mimeType: befund.typ,
      jetzt,
    });
    return { endgueltig, umgewandelt };
  });
  if (!ergebnis.umgewandelt) {
    await verwirf(ziel, zeile.id);
    return fehler(429, "kontingent", KONTINGENT_ERSCHOEPFT);
  }
  const { endgueltig } = ergebnis;

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
  grenzArt: GrenzArt,
): Promise<Response> {
  if (grund instanceof GroesseUeberschritten) {
    // ENDGUELTIG: diese Datei passt nie — weder in die Dateigrenze noch in das,
    // was vom Kontingent uebrig ist. Blob UND Zeile gehen — die Zeile haelt sonst
    // bis zu ihrem Verfall einen Dateiplatz des Links (DRK-288).
    await verwirf(ziel, inboxFileId);
    // WELCHE Grenze gerissen wurde, weiss nur der Aufrufer: geworfen wird immer
    // dieselbe Klasse. Ein 413 „zu gross" bei erschoepftem Kontingent waere die
    // falsche Auskunft — dieselbe Datei geht nach dem Aufstocken durch.
    if (grenzArt === "budget") return fehler(429, "kontingent", KONTINGENT_ERSCHOEPFT);
    if (grenzArt === "abschnitt") {
      // Ein Chunk ueber `FILES_CHUNK_BYTES` — der Client dieser Suite schickt
      // keinen; die Grenze ist die Groesse des Vorbehalts (DRK-288).
      return fehler(
        413,
        "zu-gross",
        `Ein Abschnitt darf höchstens ${FILES_CHUNK_BYTES} Bytes groß sein.`,
      );
    }
    return fehler(413, "zu-gross", `Die Datei ist größer als erlaubt (Grenze: ${maxDateiBytes} Bytes).`);
  }

  if (grund instanceof BlobFehlt) {
    // Die Zwischendatei ist unter dem laufenden Vorgang verschwunden — die
    // Verwaltung hat die offene Abgabe entfernt. Kein 500: die Abgabe ist weg.
    return fehler(404, "unbekannt", "Diese Abgabe ist nicht (mehr) offen.");
  }

  if (grund instanceof BereitsAbgeschlossen) {
    // Die Zeile ist offen, der Blob liegt aber schon da — ein Abschluss, der
    // zwischen `rename` und Zeilenupdate abbrach. Dieser Blob ist nie geprueft
    // worden, und ersetzt wird er nicht (DRK-289): die Abgabe ist verloren.
    await verwirf(ziel, inboxFileId);
    return fehler(404, "unbekannt", "Diese Abgabe ist nicht (mehr) offen.");
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
      "Auf dem Server ist kein Platz mehr. Bitte melden Sie sich beim I&K.",
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
