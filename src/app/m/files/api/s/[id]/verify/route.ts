import { NextResponse } from "next/server";
import { RateLimiter, clientIpAus } from "@/core/ratelimit";
import { ladeVerifikationsdaten } from "../../../../_db/queries";
import { bcryptVerify, erzeugeShareCookie } from "../../../../_lib/passwort";
import { rolleOderNull } from "../../../../_lib/hostRolle";

/**
 * `POST /api/s/<id>/verify` — der EINE Setzweg des Entsperr-Cookies (Spec §7.4).
 *
 * **Vertrag:** JSON-Rumpf `{ "password": "…" }`. Der Feldname ist der der
 * Alt-App (`verify/route.ts:12`), damit ein Bestands-Client im Cutover-Fenster
 * nicht an einer Umbenennung scheitert. Zwei Antworten gibt es und nur zwei:
 * **200** mit dem Cookie, **401** sonst — plus **429** der Notbremse und **404**
 * der Rollensperre, die beide vor der Passwortfrage liegen.
 *
 * Drei Zusagen, die in der Alt-App gebrochen waren:
 *
 * 1. **Der Schutz ist kein Schmuck mehr.** Alt antwortete diese Route
 *    `{ ok: true }` — kein Cookie, kein Token; der Client merkte sich das in
 *    React-State, und die drei Endpunkte, die Bytes auslieferten, lasen
 *    `password_hash` nirgends. Wer die Share-ID kannte (sie steht in seiner
 *    eigenen URL), lud ohne Passwort. Hier entsteht ein signiertes,
 *    share-gebundenes HttpOnly-Cookie, und genau dieses Cookie prüfen Download,
 *    ZIP und Vorschau.
 * 2. **Das Orakel ist geschlossen.** Alt hieß „existiert nicht" 404 und
 *    „existiert ohne Passwort" ebenfalls 404 — beides Auskünfte an jeden, der
 *    eine ID rät. Hier antworten unbekannter Share, passwortfreier Share und
 *    falsches Passwort ununterscheidbar 401, mit demselben Rumpf. Der Rest der
 *    Arbeit steckt in `ladeVerifikationsdaten` (`null` statt eines Wurfs) und in
 *    `bcryptVerify` (`hash === null` ist eine Ablehnung, kein Freibrief).
 * 3. **Die Notbremse liegt VOR bcrypt.** Alt war diese Route unbegrenzt
 *    aufrufbar und der einzige Ort, an dem pro Anfrage bcrypt mit cost 12
 *    gerechnet wurde: ein Rechenlast-Verstärker mit einer Zeichenfolge als
 *    Eintrittskarte.
 *
 * **Was hier ABSICHTLICH nicht steht:** eine Ablauf- oder Limitprüfung und jedes
 * Hochzählen. Die Prüfkette gehört `_db/queries.ts` (`ladeShare`), das
 * verbrauchende Inkrement ausschließlich `download` und `zip` (§7.5). Eine
 * zweite Kette hier wäre eine zweite Wahrheit — und genau daran litt die Alt-App
 * mit fünf Eintrittspunkten und fünf Prüfketten.
 */

/** Zehn Versuche je zehn Minuten auf denselben `${shareId}|${ip}` (§7.4). */
const VERSUCHE_JE_FENSTER = 10;
const FENSTER_MS = 10 * 60 * 1000;

/**
 * Modulzustand mit Absicht: die Treffer müssen Anfragen überdauern. Der
 * mitgehobene Vorbehalt aus `core/ratelimit.ts` gilt — die `Map` liegt im
 * Prozessspeicher, ist also nach einem Neustart leer und bei mehreren Instanzen
 * je Instanz eigen. Für eine Notbremse gegen Rechenlast trägt das; ein
 * Mengenbudget dürfte so nicht gebaut werden.
 */
const versuche = new RateLimiter({ windowMs: FENSTER_MS, max: VERSUCHE_JE_FENSTER });

/**
 * EIN Rumpf für jede Ablehnung. Die drei Fälle aus Zusage 2 unterscheiden sich
 * damit weder im Status noch im Text — ein eigener Text je Fall wäre dasselbe
 * Orakel in Prosa.
 */
const ABLEHNUNG = { fehler: "Passwort falsch." } as const;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Erste Anweisung: die Rollensperre. Route Handler haben kein Layout, das sie
  // für sie erledigt — `/s/<id>` gehört dem Verwaltungs-Host, und auf dem
  // Inbox-Host existiert dieser Pfad nicht (§3.2). `rolleOderNull` wirft nie;
  // die 404 baut der Handler selbst.
  if (rolleOderNull(req.headers) !== "verwaltung") {
    return NextResponse.json({ fehler: "Nicht gefunden." }, { status: 404 });
  }

  const { id } = await ctx.params;

  // Vor dem Rumpf und vor jeder Datenbankzeile: was hier durchkommt, darf
  // rechnen. Der Schlüssel trägt beides — ohne die Share-ID sperrte ein
  // Angreifer alle anderen Shares desselben Netzes mit, ohne die Adresse
  // sperrte er sie für alle Welt.
  if (!versuche.check(`${id}|${clientIpAus(req.headers)}`)) {
    return NextResponse.json(
      { fehler: "Zu viele Versuche. Bitte später erneut." },
      { status: 429 },
    );
  }

  const passwort = await passwortAus(req);

  // `null` = unbekannter Share. Kein eigener Zweig, keine eigene Antwort: die
  // Auflösung endet in derselben Ablehnung wie ein falsches Passwort. Der
  // Unterschied, der bleibt, ist die Laufzeit (ohne Zeile kein bcrypt-Vergleich)
  // — und gegen das Ausmessen dieses Unterschieds steht die Notbremse oben.
  const daten = await ladeVerifikationsdaten(id);
  if (daten === null || !bcryptVerify(passwort, daten.passwortHash)) {
    return NextResponse.json(ABLEHNUNG, { status: 401 });
  }

  // `min(4 h, Restlaufzeit)`, und `null` bei einem bereits abgelaufenen Share:
  // dann gibt es keine Entsperrung zu beglaubigen. Das ist KEINE Ablaufprüfung
  // (die liegt in `ladeShare`) — es ist der Grund, warum hier kein Cookie
  // entsteht, und die Antwort bleibt die des geschlossenen Orakels.
  const vorlage = erzeugeShareCookie(id, daten.ablaufAt);
  if (vorlage === null) return NextResponse.json(ABLEHNUNG, { status: 401 });

  const antwort = NextResponse.json({ ok: true });
  antwort.cookies.set(vorlage);
  return antwort;
}

/**
 * Ein unlesbarer Rumpf, ein fehlendes und ein nicht-textliches Feld sind
 * **Fehlversuche**, keine vierte Antwortart: `bcryptVerify` weist den leeren
 * String ab, und der Aufrufer bekommt dieselbe 401 wie mit falschem Passwort.
 * Ein 400 wäre eine unterscheidbare Antwort mehr auf einer Route, deren Zweck
 * gerade die Ununterscheidbarkeit ist.
 */
async function passwortAus(req: Request): Promise<string> {
  try {
    const roh: unknown = await req.json();
    if (roh !== null && typeof roh === "object" && "password" in roh) {
      const wert = (roh as { password: unknown }).password;
      if (typeof wert === "string") return wert;
    }
  } catch {
    // Kein JSON im Rumpf.
  }
  return "";
}
