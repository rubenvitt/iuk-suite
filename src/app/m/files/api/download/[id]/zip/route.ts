// archiver 8 ist reines ESM ohne Default-Export: die Fabrik `archiver("zip", …)`
// gibt es nicht mehr, an ihre Stelle tritt die Klasse `ZipArchive` (index.js
// exportiert nur noch `Archiver`, `ZipArchive`, `TarArchive`, `JsonArchive`).
import { ZipArchive, type Archiver } from "archiver";
import { PassThrough, Readable } from "node:stream";

import { getDb } from "@/app/m/files/_db/client";
import { ladeShare } from "@/app/m/files/_db/queries";
import { protokolliereDownload, zaehleDownload } from "@/app/m/files/_db/zaehler";
import { rolleOderNull } from "@/app/m/files/_lib/hostRolle";
import { lieseStrom } from "@/app/m/files/_lib/storage";
import { HINWEIS_DATEINAME, archivDisposition, planeArchiv, type ZipKandidat } from "@/app/m/files/_lib/zip";

/**
 * `GET /api/download/<shareId>/zip` — das Archiv einer Freigabe (Spec §7.5,
 * §7.7, Plan T34).
 *
 * VIER ZUSAGEN, und drei davon sind an der Reihenfolge in dieser Datei ablesbar:
 *
 *  1. **Ohne Temp-Datei.** Der Archivierer schreibt in einen `PassThrough`, der
 *     unmittelbar der Antwortkörper ist. Es gibt keinen Ort, an dem ein halbes
 *     Archiv liegen bleiben könnte, und keine Gesamtlänge — deshalb trägt die
 *     Antwort bewusst **kein** `Content-Length`.
 *  2. **Genau EIN Download je Archiv**, unabhängig von der Zahl der Dateien, und
 *     der Zählschritt läuft als **letzter** Schritt vor dem ersten Byte — nach
 *     Existenz, Ablauf, Passwort-Cookie und der Archivplanung. Läge er früher,
 *     wäre eine Freigabe mit drei erlaubten Downloads mit drei fremden GETs ohne
 *     Passwort tot (§7.4).
 *  3. **Genau EINE Logzeile**, mit `fileId: null` — dem 1:1-pflichtigen Magic
 *     Value „ZIP der ganzen Freigabe" (§4.5). Nicht eine je Datei.
 *  4. **Sequenziell.** Zu jedem Zeitpunkt ist höchstens **ein** Quellstrom
 *     offen: die nächste Datei wird erst geöffnet, wenn der vorige Eintrag
 *     vollständig im Archiv steht. Alle Quellen vorab zu öffnen wäre ein
 *     Descriptor-Leck per Bauform, und zwar eines, das erst bei einer Freigabe
 *     mit vielen Dateien auffällt.
 *
 * **Was hier NICHT entschieden wird:** welche Zeile ins Archiv gehört und wie
 * ihr Eintrag heißt. Das kommt vollständig aus `_lib/zip.ts` (T21) — dieselbe
 * Funktion, die auch der Posteingang-ZIP benutzt. Eine zweite Regel wäre eine
 * zweite Wahrheit darüber, was „freigegeben" heißt (§6.2).
 *
 * **Die Abbruchbehandlung der Alt-App wandert mit** (PassThrough,
 * `archive.on("error")`, `req.signal`-Listener, Aufräumen im `finally`), obwohl
 * ihr S3-Anlass wegfällt: hier verhindert sie geleckte **File-Descriptors**
 * statt Sockets. Der Socket-Pool-Apparat der Alt-App (maxSockets, Timeouts,
 * autoheal-Sidecar) wandert **nicht** mit — er adressiert einen Fehlermodus, den
 * es auf einem Dateisystem nicht gibt.
 */

/** Der Handler antwortet als Rolle `verwaltung`; der Inbox-Host kennt ihn nicht. */
const ROLLE = "verwaltung";

/**
 * Die Antwort hängt an einem Passwort-Cookie UND an einem verbrauchenden
 * Zähler. Eine geteilte Zwischenablage (CDN, Firmenproxy) lieferte beides aus,
 * ohne dass dieser Handler es je sähe: das Limit zählte nicht mit, und das
 * Cookie würde für den zweiten Abrufer nicht mehr gebraucht. Wortgleich zu den
 * vier Geschwister-Byte-Wegen — `api/download/[id]`, `api/preview/[id]`,
 * `api/inbox/zip`, `api/u/[token]/qr.png`; `next.config.ts` hat kein
 * `async headers()`, es gibt also keine projektweite Vorgabe, auf die man sich
 * hier stützen könnte.
 */
const KEIN_ZWISCHENSPEICHER = "private, no-store";

/**
 * Ein Text für JEDE 404 dieses Handlers. „Unbekannte Freigabe", „falscher Host"
 * und „Freigabe ohne Datei" dürfen sich für einen anonymen Abrufer nicht
 * unterscheiden lassen — sonst ist der Statuscode ein Orakel über die Existenz.
 * Die einzige Ausnahme steht unten und ist begründet.
 */
const NICHT_GEFUNDEN = "Diese Freigabe gibt es nicht.";
const ABGELAUFEN = "Dieser Link ist abgelaufen.";
const LIMIT_ERREICHT = "Die zulässige Zahl an Downloads ist erreicht.";
const PASSWORT_NOETIG = "Für diese Freigabe ist ein Passwort nötig.";

/**
 * Der Cookie-Leser kommt aus den Headern des Requests, **nicht** aus `cookies()`
 * von `next/headers`. Zwei Gründe, und der zweite ist der wichtigere: der
 * Handler hat den Request ohnehin in der Hand (eine zweite Quelle für dieselbe
 * Angabe ist die Bauform, an der zwei Wege auseinanderlaufen), und `cookies()`
 * ist nur innerhalb des Request-Kontexts von Next benutzbar — ein Test, der
 * `GET(new Request(…))` direkt ruft, müsste sonst Nexts Ablagespeicher
 * nachstellen, statt den Handler zu prüfen.
 *
 * Der ERSTE Wert eines Namens gewinnt; ein zweites Cookie gleichen Namens
 * überschreibt die Entsperrung also nicht.
 */
function cookieLeserAus(headers: Headers): (name: string) => string | undefined {
  const werte = new Map<string, string>();
  for (const teil of (headers.get("cookie") ?? "").split(";")) {
    const gleich = teil.indexOf("=");
    if (gleich <= 0) continue;
    const name = teil.slice(0, gleich).trim();
    if (!werte.has(name)) werte.set(name, teil.slice(gleich + 1).trim());
  }
  return (name) => werte.get(name);
}

/** Eine benannte Antwort statt eines leeren Körpers: der Abrufer sieht sonst nur
 *  eine nackte Zahl im Browser und weiß nicht, was als Nächstes zu tun ist. */
function meldung(status: number, text: string): Response {
  return new Response(`${text}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": KEIN_ZWISCHENSPEICHER,
    },
  });
}

/**
 * Hängt EINEN Eintrag an und wartet, bis er vollständig im Archiv steht.
 *
 * Genau dieses Warten ist die Zusage „sequenziell": ohne es hätte der Aufrufer
 * alle Quellströme gleichzeitig offen, weil `archiver` seine Warteschlange zwar
 * der Reihe nach abarbeitet, die Ströme aber schon beim Anhängen entstehen.
 *
 * Der `signal`-Zweig ist kein Beiwerk: nach `archiv.abort()` verarbeitet
 * `archiver` die laufende Aufgabe nicht zu Ende und sendet **kein** `entry`
 * mehr. Ohne ihn bliebe dieses Promise für immer offen — und mit ihm der
 * `finally`-Block, der den Descriptor schließt.
 *
 * Der Horcher am QUELLSTROM ist es ebensowenig, und sein Grund steht in einer
 * fremden Bibliothek: `archiver` hängt jeden Strom über
 * `source.pipe(new PassThrough())` an (archiver-utils 5.0.2, `index.js:86`), und
 * `pipe()` trägt Fehler **nicht** weiter. Ein Lesefehler der Quelle erreicht
 * `archiv.on("error")` also nie. Ohne diese Zeile wäre er ein unbehandeltes
 * `error`-Ereignis — der Node-Prozess stirbt daran —, das Promise löste nie auf,
 * und der `finally`-Block, der den Descriptor schließt, liefe nie. Genau der
 * Fehlermodus, gegen den die mitgewanderte Abbruchbehandlung angetreten ist.
 */
function fuegeEin(
  archiv: Archiver,
  quelle: Readable | string,
  name: string,
  signal: AbortSignal,
): Promise<void> {
  // Die Fehlliste kommt als Zeichenkette, jede Datei als Strom — nur Letztere
  // kann beim Lesen scheitern.
  const quellStrom = typeof quelle === "string" ? null : quelle;

  return new Promise((aufloesen, ablehnen) => {
    const aufraeumen = () => {
      archiv.off("entry", beiEintrag);
      archiv.off("error", beiFehler);
      quellStrom?.off("error", beiFehler);
      signal.removeEventListener("abort", beiAbbruch);
    };
    const beiEintrag = () => {
      aufraeumen();
      aufloesen();
    };
    const beiFehler = (fehler: Error) => {
      aufraeumen();
      ablehnen(fehler);
    };
    const beiAbbruch = () => {
      aufraeumen();
      ablehnen(new Error("[files] ZIP: die Anfrage wurde abgebrochen"));
    };

    // Ein `addEventListener` auf einem BEREITS abgebrochenen Signal löst laut
    // Spezifikation nicht mehr aus. Ohne diese Zeile bliebe genau der Fall offen,
    // in dem der Abbruch kam, während der vorige Schritt noch lief — und das
    // Promise hinge für immer, samt dem Descriptor, den sein `finally` schließt.
    if (signal.aborted) {
      beiAbbruch();
      return;
    }

    archiv.once("entry", beiEintrag);
    archiv.once("error", beiFehler);
    // VOR dem Anhängen: `archiver` liest die Quelle sofort an, und ein Fehler
    // ohne Horcher beendet den Prozess.
    quellStrom?.once("error", beiFehler);
    signal.addEventListener("abort", beiAbbruch, { once: true });
    archiv.append(quelle, { name });
  });
}

export async function GET(
  req: Request,
  kontext: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Die Rollensperre steht VOR allem anderen — auch vor jedem Datenbankzugriff.
  // Ein Route Handler hat kein Layout; wer sie hier vergisst, hat auf dem
  // Inbox-Host einen offenen Freigabe-Download (§3.2).
  if (rolleOderNull(req.headers) !== ROLLE) return meldung(404, NICHT_GEFUNDEN);

  const { id } = await kontext.params;

  // Die EINE Prüfkette (T15). Ohne `dateiId`: ein Archiv ist die ganze Freigabe.
  const ladung = await ladeShare({ shareId: id, cookieLeser: cookieLeserAus(req.headers) });
  if (ladung.zustand === "abgelaufen") return meldung(410, ABGELAUFEN);
  if (ladung.zustand === "passwortNoetig") return meldung(401, PASSWORT_NOETIG);
  if (ladung.zustand === "limitErreicht") return meldung(410, LIMIT_ERREICHT);
  if (ladung.zustand !== "offen") {
    // `unbekannt` — und die drei Zustände einer EINZELNEN Datei
    // (`dateiNichtGefunden`, `gesperrt`, `blobFehlt`), die ohne `dateiId` gar
    // nicht entstehen können. Sie werden trotzdem behandelt, statt hier eine
    // Unerreichbarkeit zu behaupten: ein späterer `?file=`-Parameter auf diesem
    // Weg fiele sonst in einen `undefined`-Körper mit HTTP 200.
    return meldung(404, NICHT_GEFUNDEN);
  }

  const { share, inhalt } = ladung;

  /*
   * Zeilen OHNE Blob gehen als „nicht gefunden" in die Fehlliste, statt in die
   * Kandidatenliste.
   *
   * Der Fall ist belegt (Waisen in beide Richtungen, Analyse Falle 9), und er
   * muss VOR dem ersten Byte entschieden sein: käme er erst beim Öffnen, fiele
   * `lieseStrom` mitten im Archiv — also nach HTTP 200 und nach dem Zählschritt
   * — und der Empfänger bekäme ein abgeschnittenes ZIP. Genau das stille
   * Weglassen, das §7.7 verbietet, nur schlimmer: hier fehlt der Rest.
   *
   * Übergeben wird der ANZEIGENAME, nicht die `fileId`. `planeArchiv` nimmt in
   * diesem Parameter sonst IDs entgegen (T49: eine fremde `id` aus `?ids=`, für
   * die es keinen Namen gibt) — hier gibt es einen, und eine nanoid in der
   * `_HINWEIS.txt` wäre für den Empfänger unbrauchbar.
   */
  const kandidaten: ZipKandidat[] = [];
  const ohneBlob: string[] = [];
  for (const datei of inhalt.dateien) {
    if (datei.blobFehlt) {
      ohneBlob.push(datei.dateiname);
      continue;
    }
    kandidaten.push({
      id: datei.id,
      name: datei.dateiname,
      avStatus: datei.avStatus,
      // `ShareDatei` führt die Spalte als Wahrheitswert; `ZipKandidat` nimmt den
      // rohen Spaltenwert, weil das Prädikat „NULL heißt unvollständig" in
      // `_lib/zip.ts` gehört. Gelesen wird nur, OB der Wert null ist — der
      // Zeitpunkt selbst geht nirgends ein.
      bytesVollstaendigAt: datei.vollstaendig ? datei.angelegtAt : null,
    });
  }

  const plan = planeArchiv(kandidaten, ohneBlob);
  if (plan.art === "leer") {
    // Ein leeres Archiv sieht für den Empfänger wie ein Fehler seines
    // Entpackprogramms aus, also gibt es keines. Der Unterschied 404/403 ist
    // hier KEIN Orakel: beide Zustände setzen voraus, dass der Abrufer die
    // Freigabe bereits geöffnet hat (bei Passwort: entsperrt hat) — er weiß
    // längst, dass sie existiert.
    return meldung(plan.grund === "keine-dateien" ? 404 : 403, plan.meldung);
  }

  // Der letzte Schritt vor dem ersten Byte, und die Bedingung steht IM UPDATE
  // (§7.5, `_db/zaehler.ts`). Dass die Ladefunktion eben noch `offen` sagte,
  // reicht nicht: zwischen ihrem LESENDEN Blick und hier liegt eine Messung des
  // Dateisystems, in der ein zweiter Abruf denselben Rest verbrauchen kann.
  const db = getDb();
  if (!zaehleDownload(db, share.id)) return meldung(410, LIMIT_ERREICHT);
  protokolliereDownload(db, { shareId: share.id, fileId: null, headers: req.headers });

  const durchgang = new PassThrough();
  const archiv = new ZipArchive({ zlib: { level: 1 } });
  archiv.on("error", (fehler: Error) => {
    // Laut: ab hier ist die Antwort schon unterwegs, der Abrufer sieht nur ein
    // abgeschnittenes Archiv, und ohne diese Zeile gäbe es keine Spur davon.
    console.error(`[files] ZIP der Freigabe ${share.id} fehlgeschlagen`, fehler);
    durchgang.destroy(fehler);
  });
  archiv.pipe(durchgang);

  let laufenderStrom: Readable | null = null;
  const beiAbbruch = () => {
    laufenderStrom?.destroy();
    laufenderStrom = null;
    archiv.abort();
    durchgang.destroy();
  };
  req.signal.addEventListener("abort", beiAbbruch, { once: true });

  // Bewusst NICHT erwartet: die Antwort geht sofort hinaus, der Körper füllt
  // sich danach. Der Rückgabewert wird verworfen, jeder Ausgang ist im
  // `try`/`finally` behandelt.
  void (async () => {
    try {
      // Die Fehlliste zuerst — sie ist selbst ein Eintrag und hat ihren
      // Namensplatz in der Planung schon belegt.
      if (plan.hinweis !== null) {
        await fuegeEin(archiv, plan.hinweis, HINWEIS_DATEINAME, req.signal);
      }
      for (const eintrag of plan.eintraege) {
        if (req.signal.aborted) break;
        const { strom } = await lieseStrom({
          art: "share",
          shareId: share.id,
          fileId: eintrag.id,
        });
        laufenderStrom = strom;
        try {
          await fuegeEin(archiv, strom, eintrag.eintragsname, req.signal);
        } finally {
          laufenderStrom = null;
          // HIER, nicht erst im äußeren `finally`: dort wäre `laufenderStrom`
          // schon zurückgesetzt, und der Descriptor bliebe auf JEDEM Fehlerweg
          // offen. Nach vollständigem Lesen ist der Strom ohnehin zu; `destroy`
          // ist dann folgenlos.
          strom.destroy();
        }
      }
      if (!req.signal.aborted) await archiv.finalize();
    } catch (fehler) {
      if (!req.signal.aborted) {
        console.error(`[files] ZIP der Freigabe ${share.id} abgebrochen`, fehler);
      }
      durchgang.destroy(fehler instanceof Error ? fehler : new Error(String(fehler)));
    } finally {
      // In JEDEM Ausgang: ein hier vergessener Strom ist ein Descriptor, den
      // nichts mehr schließt — der Fehlermodus, den die Alt-Abbruchbehandlung
      // auf einem Dateisystem verhindert.
      req.signal.removeEventListener("abort", beiAbbruch);
      laufenderStrom?.destroy();
      laufenderStrom = null;
    }
  })();

  return new Response(Readable.toWeb(durchgang) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      // Beide Formen: der angeführte Teil unkodiert als ASCII-Rückfall, der
      // echte Titel prozentkodiert in `filename*` (§7.7).
      "content-disposition": archivDisposition(share.titel),
      "x-content-type-options": "nosniff",
      "cache-control": KEIN_ZWISCHENSPEICHER,
      // Kein `Accept-Ranges` und kein 206 (§12): drei Bereichsanfragen wären
      // drei Downloads, und der Zähler ist eine harte Obergrenze.
    },
  });
}
