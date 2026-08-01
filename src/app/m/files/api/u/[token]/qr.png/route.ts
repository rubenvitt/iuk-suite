import { qrPng } from "@/core/qr";
import { requireFilesAccess } from "../../../../_lib/access";
import { oeffentlicheUrl, rolleOderNull } from "../../../../_lib/hostRolle";
import { normalisiereToken } from "../../../../_lib/token";

/**
 * DER ABGABE-QR — dieselben Regeln wie §7.9, Nutzlast aus der Rolle `inbox`
 * (Spec §8.7).
 *
 * ZWEI UNTERSCHIEDE ZUR SHARE-ROUTE, und beide sind der ganze Inhalt dieser
 * Datei:
 *
 * 1. DER ENDPUNKT IST GEGATET. Er wird nur in der Verwaltung gebraucht
 *    (Ausgabe-Dialog nach dem Anlegen und Druckansicht, §8.6), und ungegatet
 *    waere er ein Orakel: „existiert dieses Token?". Der Riegel ist derselbe wie
 *    ueberall im Modul — `requireFilesAccess()`, GENAU EINE Stufe, kein
 *    Suite-Admin-Umweg (§2.4).
 *
 *    Dass die Route auf der INBOX-Domain liegt und trotzdem eine angemeldete
 *    Sitzung verlangt, geht nur auf, weil das Session-Cookie ueber
 *    `AUTH_COOKIE_DOMAIN` auf der gemeinsamen Elterndomain sitzt
 *    (`core/auth/cookies.ts`) — host-only waere es auf `drop.…` unsichtbar und
 *    die Verwaltung bekaeme ihr eigenes Bild nicht zu sehen.
 *
 * 2. KEIN OEFFENTLICHER CACHE. Die Nutzlast IST der Abgabe-Link; ein gemeinsamer
 *    Cache schluesselt auf die URL, nicht auf die Sitzung, und liefe damit an
 *    Punkt 1 vorbei.
 *
 * DIE ROUTE LOEST DAS TOKEN NICHT AUF. Sie normalisiert es, baut die Nutzlast
 * und verlaesst sich auf den Riegel — genau deshalb gibt es hier keine
 * Tabellenabfrage: fuer ein existierendes und ein erfundenes Token ist die
 * Antwort byteweise gleich, und das Orakel entsteht gar nicht erst.
 */

/** Vorgabe und Obergrenze wie beim Share-QR — der Aushang druckt in 1024px. */
const BREITE_VORGABE = 512;
const BREITE_MAX = 2048;

/**
 * `?w=` GEKLEMMT, nicht durchgereicht. Auch hinter dem Riegel bleibt der Grund
 * gueltig: `qrPng` gibt `width` direkt an den Kodierer, und `?w=100000` waere
 * Rechenlast, die eine einzige angemeldete Sitzung beliebig oft ausloesen kann.
 * Unsinn faellt auf die Vorgabe zurueck statt einen Fehler zu erzeugen.
 *
 * (Dieselben sechs Zeilen stehen in `api/s/[id]/qr.png/route.ts` und ein drittes
 * Mal in `feedback/f/[slugSecret]/qr.png/route.ts:26-31`. Drei Aufrufer erfuellen
 * die core-Regel „ein zweiter, heute belegbarer Nutzniesser" — aber weder
 * `core/qr/` noch die feedback-Route gehoeren zur Dateiliste dieses Tasks; die
 * Zusammenfuehrung ist als offener Punkt gemeldet.)
 */
function breiteAus(anfrage: string): number {
  const rohwert = new URL(anfrage).searchParams.get("w");
  if (!rohwert) return BREITE_VORGABE;
  const zahl = Number.parseInt(rohwert, 10);
  if (!Number.isFinite(zahl) || zahl <= 0) return BREITE_VORGABE;
  return Math.min(zahl, BREITE_MAX);
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  /*
   * ERST DER HOST, DANN DIE PERSON — die Reihenfolge ist nicht beliebig und hat
   * dieselbe Begruendung wie in `(verwaltung)/layout.tsx`: andernfalls schickte
   * ein anonymer Aufruf auf dem FALSCHEN Host erst in den Login und antwortete
   * danach mit 404. Der Login waere eine Sackgasse, und die Rollentrennung
   * haette einen Umweg, der die Existenz des Pfades verraet.
   */
  if (rolleOderNull(req.headers) !== "inbox") {
    return new Response("Not found", { status: 404 });
  }

  /*
   * Der Riegel steht VOR der Bewertung des Tokens: waere es umgekehrt, unter-
   * schiede die Antwort fuer Unangemeldete zwischen „syntaktisch gueltig" und
   * „Unsinn" — ein kleines Orakel, das es nicht zu geben braucht.
   */
  await requireFilesAccess();

  const { token } = await params;
  const kanonisch = normalisiereToken(token);
  // Gedruckt gehoert die kanonische Form; eine Eingabe, die nicht der Grammatik
  // entspricht, kann kein Token sein und bekommt keine Nutzlast.
  if (kanonisch === null) return new Response("Not found", { status: 404 });

  const nutzlast = oeffentlicheUrl("inbox", `/u/${kanonisch}`, req.headers);
  const png = await qrPng(nutzlast, { width: breiteAus(req.url) });

  return new Response(Buffer.from(png), {
    headers: { "content-type": "image/png", "cache-control": "private, no-store" },
  });
}
