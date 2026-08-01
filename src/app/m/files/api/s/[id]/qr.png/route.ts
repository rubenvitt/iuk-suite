import { qrPng } from "@/core/qr";
import { oeffentlicheUrl, rolleOderNull } from "../../../../_lib/hostRolle";

/**
 * DER SHARE-QR — ein DRUCKSTUECK, kein Bild (Spec §7.9).
 *
 * Die Nutzlast kommt aus `oeffentlicheUrl("verwaltung", …)`, also HOST AUS DER
 * ROLLE und nicht aus dem Request. Das ist der ganze Punkt: ein auf der
 * Inbox-Domain erzeugter Share-QR truege sonst `drop.iuk-ue.de`, funktionierte
 * SOFORT, saehe richtig aus — und wuerde beim Abschalten eines Hosts ungueltig,
 * auf Papier, das dann laengst verteilt ist. GEDRUCKT IST GEDRUCKT.
 *
 * Erzeugt wird ueber `core/qr` (`qrPng`), also mit der EINEN verbindlichen
 * Konfiguration (`errorCorrectionLevel: "H"`, `margin: 4`, Schwarz auf Weiss).
 * Neu erzeugte Codes sehen anders aus als die der Alt-App (Version 5 mit 37×37
 * statt Version 3 mit 29×29), der INHALT bleibt gleich — Bestandsdrucke bleiben
 * gueltig.
 *
 * `qrPng` WIRFT bei Ueberlaenge (`assertQrCapacity` ist nicht exportiert, die
 * Pruefung sitzt darin). Das wird hier NICHT abgefangen: eine Share-URL ist rund
 * 40 Zeichen lang gegen eine Grenze von 1273 Byte, der Wurf waere also die
 * richtige Antwort auf einen Programmierfehler und nicht auf eine Eingabe.
 *
 * DIESE ROUTE FRAGT DIE DATENBANK NICHT. Ein QR fuer eine nicht (mehr)
 * existierende Freigabe ist kein Schaden — die Freigabeseite selbst antwortet
 * dann mit ihrem benannten Zustand; eine Existenzpruefung hier waere nur ein
 * zweiter Ort, an dem dieselbe Frage anders beantwortet werden koennte.
 */

/** Vorgabe wie in `feedback`: die 200px-Vorschau und der Handy-Scan brauchen nicht mehr. */
const BREITE_VORGABE = 512;
/** Obergrenze fuer Sonderfaelle; der Aushang selbst fragt 1024 an. */
const BREITE_MAX = 2048;

/**
 * `?w=` GEKLEMMT, nicht durchgereicht — 1:1 die Bauform aus
 * `feedback/f/[slugSecret]/qr.png/route.ts:26-31`. Diese Route ist OEFFENTLICH,
 * `qrPng` gibt `width` direkt an den Kodierer, und `cache-control: public`
 * schluesselt auf die GANZE URL: ein ungepruefetes `?w=100000` waere
 * Rechenlast- UND Cache-Verstaerkung mit einer Zeichenfolge als Eintrittskarte.
 * Unsinn (leer, 0, negativ, Text) faellt auf die Vorgabe zurueck statt einen
 * Fehler zu erzeugen — ein 400 auf einem gedruckten Code waere die schlechtere
 * Antwort.
 */
function breiteAus(anfrage: string): number {
  const rohwert = new URL(anfrage).searchParams.get("w");
  if (!rohwert) return BREITE_VORGABE;
  const zahl = Number.parseInt(rohwert, 10);
  if (!Number.isFinite(zahl) || zahl <= 0) return BREITE_VORGABE;
  return Math.min(zahl, BREITE_MAX);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  /*
   * DIE ROLLENSPERRE ALS ERSTE ANWEISUNG (§3.2). Route Handler haben kein
   * Layout, die Sperre der Route-Groups erreicht sie also nicht — das ist die
   * dritte Verankerung, die man vergisst. `rolleOderNull` und nicht
   * `requireRolle`: in einem Handler ist ein `notFound()`-Wurf keine brauchbare
   * Antwort, die 404 gehoert dem Handler selbst.
   *
   * 404 und nicht 403: die Existenz eines Pfades auf dem falschen Host wird
   * nicht verraten.
   */
  if (rolleOderNull(req.headers) !== "verwaltung") {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  /*
   * `oeffentlicheUrl` wirft, wenn die Rolle keinen Host hat. Hier unerreichbar:
   * ohne `SUITE_HOST_FILES` liefert `rolleOderNull` fuer JEDEN Host `null` und
   * die Zeile darueber hat bereits mit 404 geantwortet; eine Konfiguration mit
   * nur EINEM Host bricht schon beim Boot ab (`validateFilesHosts`).
   */
  const nutzlast = oeffentlicheUrl("verwaltung", `/s/${id}`, req.headers);
  const png = await qrPng(nutzlast, { width: breiteAus(req.url) });

  return new Response(Buffer.from(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
}
