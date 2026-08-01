/**
 * `GET /api/download/<shareId>?file=<fileId>` — der Byte-Weg für EINE Datei
 * (Spec §7.4, §7.5, §7.7, §5.4; Plan T33).
 *
 * VIER ZUSAGEN, und jede hat ihren Grund:
 *
 * 1. **Eine Prüfkette, und sie liegt nicht hier.** Existenz → Ablauf →
 *    Passwort-Cookie → AV-Status → Limit steht vollständig in `ladeShare`
 *    (`_db/queries.ts`); dieser Handler bildet ihren Ausgang nur auf einen
 *    Statuscode ab. Die Alt-App hatte fünf Eintrittspunkte mit fünf
 *    verschiedenen Ketten, und die drei Endpunkte, die Bytes auslieferten,
 *    lasen `password_hash` NIRGENDS.
 * 2. **Der Zähler ist der LETZTE Schritt vor dem ersten Byte** (§7.5). Liefe er
 *    früher, wäre ein Share mit `max_downloads = 3` mit drei fremden GETs ohne
 *    Passwort tot — das serverseitige Gate wäre still ausgehebelt statt
 *    schützend. Deshalb: ein 401 und ein 403 erhöhen `download_count` nicht.
 * 3. **Genau eine Audit-Zeile je Erfolg**, mit der AUFGELÖSTEN `file_id`.
 *    `file_id = NULL` ist der 1:1-pflichtige Magic Value „ZIP des ganzen
 *    Shares" (§4.5) — hier wäre er eine Lüge, und die Audit-Ansicht (T41) zeigte
 *    für einen Dateidownload „ZIP".
 * 4. **Kein `Range`, kein `Accept-Ranges`, kein 206** (§7.7, verworfen in §12):
 *    neue Funktionalität, sie kollidiert mit dem atomaren Zähler (drei
 *    Range-Anfragen wären drei Downloads), und niemand hat sie beauftragt.
 *
 * Dieser Handler ist ÖFFENTLICH und ruft deshalb kein `requireFilesAccess()` —
 * der Empfänger einer Freigabe hat keine Sitzung. Was ihn gatet, ist die
 * Prüfkette samt Passwort-Cookie (§2.5-Tabelle: „öffentlich + Passwort-Cookie").
 */
import { Readable } from "node:stream";

import { getDb } from "../../../_db/client";
import { ladeShare, type CookieLeser } from "../../../_db/queries";
import { protokolliereDownload, zaehleDownload } from "../../../_db/zaehler";
import type { AvStatus } from "../../../_lib/av";
import { rolleOderNull } from "../../../_lib/hostRolle";
import { BlobFehlt, lieseStrom } from "../../../_lib/storage";
import { ZIP_AUSSCHLUSS_MELDUNGEN, dispositionKopfzeile } from "../../../_lib/zip";

/**
 * Die Antwort für jeden Zustand, der keine Bytes trägt. Immer Text, immer
 * `no-store` (siehe unten) — und immer eine ANTWORT: `notFound()` wäre in einem
 * Route Handler ein Wurf im Antwortweg statt einer benannten 404.
 */
function zustand(status: number, meldung: string): Response {
  return new Response(`${meldung}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": KEIN_ZWISCHENSPEICHER,
    },
  });
}

/**
 * Die Antwort ist an ein Passwort-Cookie und an einen verbrauchenden Zähler
 * gebunden. Eine geteilte Zwischenablage (CDN, Firmenproxy) lieferte beides
 * aus, ohne dass dieser Handler es je sähe: das Limit zählte nicht mit, und das
 * Cookie würde für den zweiten Abrufer nicht mehr gebraucht.
 */
const KEIN_ZWISCHENSPEICHER = "private, no-store";

/** Dieselbe Auskunft für „gibt es nicht", „gehört nicht hierher" und „falscher Host". */
const NICHT_GEFUNDEN = "Diese Datei ist nicht verfügbar.";

/**
 * Der Cookie-Leser kommt aus den ANFRAGE-Kopfzeilen, nicht aus `cookies()`.
 * Zwei Gründe: `cookies()` braucht den Next-Anfragekontext und ist damit ohne
 * Rahmenwerk nicht prüfbar, und der Wert steht ohnehin schon in `req.headers` —
 * eine zweite Quelle wäre eine Stelle mehr, an der beide auseinanderlaufen.
 *
 * Der ERSTE Treffer gewinnt. Ein Client darf denselben Namen mehrfach senden;
 * würde der letzte gewinnen, hinge die Entscheidung an der Reihenfolge, die der
 * Absender wählt. (Beglaubigt ist der Wert ohnehin — `istCookieGueltig` prüft
 * den HMAC.)
 */
function cookieLeserAus(headers: Headers): CookieLeser {
  const paare = new Map<string, string>();
  const roh = headers.get("cookie");
  if (roh) {
    for (const stueck of roh.split(";")) {
      const trenner = stueck.indexOf("=");
      if (trenner <= 0) continue;
      const name = stueck.slice(0, trenner).trim();
      if (!paare.has(name)) paare.set(name, stueck.slice(trenner + 1).trim());
    }
  }
  return (name) => paare.get(name);
}

/**
 * Warum eine Datei gesperrt ist — im Wortlaut des ZIP-Wegs, nicht in einem
 * zweiten. Der Katalog heißt nach seinem ersten Aufrufer; die Sache, die er
 * benennt, ist dieselbe („diese Datei wird nicht ausgeliefert, und warum"), und
 * ein Empfänger soll denselben Satz lesen, ob er eine Datei zieht oder ein
 * Archiv.
 *
 * Der Cast schließt `clean` aus, das der Zustand `gesperrt` bereits ausschließt
 * — dieselbe Einengung wie in `zip.ts:222`, und aus demselben Grund:
 * `istFreigegeben` ist kein Typwächter, und ein Direktvergleich gegen `clean`
 * wäre ein zweites Statusmodell (§6.2).
 */
function sperrMeldung(avStatus: AvStatus): string {
  return ZIP_AUSSCHLUSS_MELDUNGEN[avStatus as Exclude<AvStatus, "clean">];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Die Rollensperre steht VOR allem anderen: Handler haben kein Layout, das
  // sie für sie erledigt (§3.2). `rolleOderNull` statt `requireRolle`, weil ein
  // Wurf hier keine brauchbare Antwort auf einen Download-Link ist.
  if (rolleOderNull(req.headers) !== "verwaltung") return zustand(404, NICHT_GEFUNDEN);

  const { id } = await params;
  // `?file=` ohne Wert ist „nicht gesetzt", nicht „die leere Datei-ID": sonst
  // liefe ein `…?file=` in die Dateiauflösung mit einer ID, die es nie gibt,
  // und der Empfänger bekäme 404 statt der einen Datei seines Shares.
  const gewaehlt = new URL(req.url).searchParams.get("file") || null;
  const cookieLeser = cookieLeserAus(req.headers);

  let ladung = await ladeShare({ shareId: id, dateiId: gewaehlt, cookieLeser });

  // DER PARAMETERVERTRAG. `?file=` ist optional, wenn der Share genau EINE Zeile
  // hat; bei mehreren ist das Fehlen ein benannter Fehler und ausdrücklich
  // nicht „die erste".
  //
  // Gezählt werden ALLE Zeilen, auch die unvollständigen. „Die einzige
  // vollständige" wäre die verlockendere Regel und die falsche: dann hinge die
  // Bedeutung eines gedruckten Links davon ab, wie weit ein zweiter Upload
  // gerade ist, und eine unvollständige Zeile bekäme nie ihren eigenen Zustand
  // (§4.4) zu sehen.
  //
  // Und die Reihenfolge ist die Aussage: die Zählung passiert NACH der
  // Prüfkette. Stünde sie davor, verriete der Statuscode (400 gegen 401), ob
  // dieser Share mehr als eine Datei hat — an jemanden ohne das Passwort.
  if (gewaehlt === null && ladung.zustand === "offen") {
    const dateien = ladung.inhalt.dateien;
    if (dateien.length === 0) return zustand(404, NICHT_GEFUNDEN);
    if (dateien.length > 1) {
      return zustand(
        400,
        "Diese Freigabe enthält mehrere Dateien. Bitte wählen Sie eine aus " +
          "(Parameter `file` fehlt).",
      );
    }
    // ZWEITER Durchlauf statt einer eigenen Prüfung an dieser Stelle: die
    // Stufen „vollständig / freigegeben / Blob vorhanden" gehören in die EINE
    // Kette (§7.4). Sie hier nachzubauen wäre die zweite, und genau daran sind
    // die fünf Eintrittspunkte der Alt-App auseinandergelaufen.
    ladung = await ladeShare({ shareId: id, dateiId: dateien[0].id, cookieLeser });
  }

  switch (ladung.zustand) {
    case "unbekannt":
      return zustand(404, NICHT_GEFUNDEN);
    case "abgelaufen":
      return zustand(410, "Diese Freigabe ist abgelaufen.");
    case "passwortNoetig":
      return zustand(401, "Diese Freigabe ist mit einem Passwort geschützt.");
    case "dateiNichtGefunden":
      return zustand(404, NICHT_GEFUNDEN);
    case "gesperrt":
      return zustand(403, sperrMeldung(ladung.avStatus));
    case "blobFehlt":
      return zustand(404, "Diese Datei ist nicht auffindbar.");
    case "limitErreicht":
      return zustand(410, "Die zulässige Zahl an Downloads ist erreicht.");
    case "offen":
      break;
  }

  const { share, datei } = ladung;
  // Strukturell unerreichbar: mit `?file=` steht die ID in der Anfrage, ohne
  // `?file=` hat der Block darüber sie eingesetzt. Der Zweig schließt den Fall
  // für den Typ und wäre, falls er je einträte, kein Grund für ein Byte.
  if (datei === null) return zustand(404, NICHT_GEFUNDEN);

  const db = getDb();

  // DER LETZTE SCHRITT VOR DEM ERSTEN BYTE (§7.5). Die Entscheidung ist die
  // Zahl betroffener Zeilen, nicht ein vorher gelesener Wert — die lesende
  // Limitstufe der Prüfkette ist Anzeige, dieses `UPDATE` ist die Zusage.
  if (!zaehleDownload(db, share.id)) {
    return zustand(410, "Die zulässige Zahl an Downloads ist erreicht.");
  }
  protokolliereDownload(db, { shareId: share.id, fileId: datei.id, headers: req.headers });

  let strom: Readable;
  let bytes: number;
  try {
    ({ strom, bytes } = await lieseStrom({ art: "share", shareId: share.id, fileId: datei.id }));
  } catch (fehler) {
    // Die Prüfkette hat den Blob schon gemessen; hierher kommt nur, wer ihn
    // zwischen Messung und Auslieferung verliert (Aufräum-Lauf, Handbetrieb).
    // Dass dieser Fall einen Download verbraucht hat, ist der Preis dafür, dass
    // der Zähler VOR dem Byte steht — die Richtung ist gewollt (§7.5) und darf
    // nicht „repariert" werden, indem der Zähler hinter das Öffnen wandert.
    if (fehler instanceof BlobFehlt) return zustand(404, "Diese Datei ist nicht auffindbar.");
    throw fehler;
  }

  if (bytes !== datei.groesse) {
    // Ausgeliefert wird die WIRKLICHKEIT (§5.4): ein falsches `Content-Length`
    // bricht den Download beim Empfänger ab, und der Fehler wäre dann bei ihm
    // sichtbar statt hier im Log.
    console.warn(
      `[files] Groessenabweichung bei share ${share.id}/${datei.id}: ` +
        `Spalte size=${datei.groesse}, gemessen=${bytes} Bytes — ausgeliefert wird die gemessene Zahl.`,
    );
  }

  return new Response(Readable.toWeb(strom) as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      // Aus der DB, nie geraten und nie aus einer Storage-Angabe: die Alt-App
      // prüfte den DB-Wert und lieferte den Storage-Wert im Kopf.
      "content-type": datei.mimeType,
      // `attachment` IMMER, für jeden Typ — die Inline-Auslieferung ist die
      // Vorschau (T51) und hat ihre eigene Allowlist.
      "content-disposition": dispositionKopfzeile(datei.dateiname, datei.dateiname),
      "content-length": String(bytes),
      "x-content-type-options": "nosniff",
      "cache-control": KEIN_ZWISCHENSPEICHER,
    },
  });
}
