import { NextResponse } from "next/server";
import { radioHostOderNull } from "../_lib/host";
import { istGateGrund } from "../_lib/gateTexte";
import { AUSLEIH_COOKIE, ausleihCookieOptionen } from "../_lib/ausleihSitzung";

export const dynamic = "force-dynamic";

/**
 * DER EINZIGE WEG, AUF DEM EIN TOTES AUSLEIH-COOKIE UNFREIWILLIG VERSCHWINDET — Spec 1
 * §3.4.5 (Zeilen 2572-2614). Aeusserer Pfad `/abmelden`.
 *
 * ⚠️ ⛔ ES MUSS EIN ROUTE HANDLER SEIN, und das ist gemessen, nicht Geschmack:
 * `requireAusleihZugang` (`_lib/ausleihZugang.ts:236`) wird aus `(ausleihe)/layout.tsx`
 * gerufen, und das ist eine SERVER COMPONENT. `cookies()` ist dort versiegelt — `delete`,
 * `set` und `clear` sind durch einen Proxy ersetzt, der WIRFT
 * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` traegt den Satz
 * „Cookies can only be modified in a Server Action or Route Handler" woertlich, und `:69-72`
 * haengt den Riegel an: `case 'clear': case 'delete': case 'set': return
 * ReadonlyRequestCookiesError.callable;` in `RequestCookiesAdapter.seal`. ⚠️ NACHGEMESSEN AN
 * DER INSTALLIERTEN FASSUNG, `next` 16.3.0 (Fix-Runde 1 zu A910, Fund 4): `:171` — der Anker,
 * den `lagerbuch/abmelden/route.ts:17` fuer Next 16.2.11 nennt und der hier zuerst
 * abgeschrieben stand — ist dort das ENDE des SCHREIBENDEN Proxys (`case 'set': return
 * function(...args) { … target.set(...args) … }`, `:162-171`). Der erlaubt, er riegelt nicht.
 * Die AUSSAGE des Kommentars stimmt, der Zeilenanker stimmte nicht.) Ein `cookies().delete(...)`
 * an der Stelle, an der der Sperrbefund auffaellt, ist also nicht „unsauber", sondern ein
 * LAUFZEITFEHLER. Der Riegel leitet deshalb per `redirect()` ALS STRING hierher; diese Datei
 * raeumt (Bauform-Zulaessigkeitstafel Zeilen 3 und 7).
 *
 * ⚠️ WARUM GET UND KEINE SERVER ACTION: der Aufrufer ist ein `redirect()` aus einer Server
 * Component — die kann keine Action ausloesen. Der freiwillige Weg bleibt davon unberuehrt:
 * `beenden` in `_actions/sitzung.ts` ist und bleibt eine Server Action hinter einem POST
 * (`lagerbuch/abmelden/route.ts:27-30`).
 *
 * ⛔ WARUM NICHT UNTER `t/` (NS-Z3): `t/[code]/route.ts` ist ein dynamisches Segment, und ein
 * `t/abmelden/route.ts` daneben gewaenne zwar (statisch schlaegt dynamisch), legte aber eine
 * Falle in genau den Pfad, der auf gedruckten Aufstellern steht. `/abmelden` steht auf keinem
 * Gegenstand und ist deshalb frei waehlbar.
 *
 * ⛔ EIN `<Link href="/abmelden">` IST HIER FALSCH (Bauform-Zulaessigkeitstafel Zeile 15):
 * Nexts Prefetch fordert das Ziel beim blossen Darueberfahren an und beendete die Sitzung
 * ungefragt. Der sichtbare Abmeldeweg ist `<form action={beenden}>` (A16).
 *
 * ⛔ ES RAEUMT AUSSCHLIESSLICH `AUSLEIH_COOKIE`. Kein `signOut()`, kein Auth.js-Cookie
 * (Spec:2610-2614) — sonst verloere eine angemeldete Person ihre Suite-Sitzung auf ALLEN
 * Modul-Hosts beim Beenden des anonymen Zugangs. `_lib/bauform.test.ts` sichert das mit
 * einem eigenen Fall zu.
 *
 * ⚠️ ANGENOMMENE RESTLUECKE, AUSGESPROCHEN STATT WEGGESCHRIEBEN (Spec:2604-2606): ein
 * GET-Endpunkt, der ein Cookie raeumt, ist von fremden Seiten ausloesbar — ein `<img src=…>`
 * genuegt, und `SameSite=Lax` verhindert das Setzen des `Set-Cookie` nicht. Der Schaden ist
 * genau „erneut scannen", und §3.4.4 faengt das inline ab, ohne die eingetragenen Werte zu
 * verlieren. Ein CSRF-Token auf einem Abmeldeweg waere teurer als der Schaden. ⛔ Das ist
 * eine ENTSCHEIDUNG, kein uebersehener Fund — ein spaeterer Durchgang melde sie nicht erneut.
 */
export async function GET(req: Request) {
  const kopf = new Headers(req.headers);

  /*
   * `radioHostOderNull`, NICHT `requireRadioHost`: ein `notFound()`-Wurf ist im Antwortweg
   * eines Route Handlers keine brauchbare Antwort (`_lib/host.ts:62-63`,
   * `riegel.test.ts:442-451`). Der Handler baut seine 404 selbst.
   */
  if (!radioHostOderNull(kopf)) return new Response("Not found", { status: 404 });

  /*
   * GESCHLOSSENER SATZ, NIE DURCHGEREICHT (Spec:2390-2394). Ein `searchParams`-Wert ist
   * Nutzereingabe, und er landet hier in einem `Location`-Kopf — dort schuetzt keine
   * React-Entkommung. `istGateGrund` ist der Typwaechter vor jeder Verwendung
   * (`_lib/gateTexte.ts:56`).
   */
  const roh = new URL(req.url).searchParams.get("grund");
  const grund = istGateGrund(roh) ? roh : null;

  /*
   * RELATIVER `Location`, und das ist Absicht. RFC 7231 §7.1.2 erlaubt eine relative
   * Referenz; der Browser loest sie gegen die angefragte URL auf, also gegen den Host, unter
   * dem gescannt wurde — DIESELBE Herkunft, auf die `antw.cookies.set` das Cookie legt.
   *
   * ⛔ `NextResponse.redirect(new URL(ziel, req.url))` waere hier FALSCH: das verlangt eine
   * ABSOLUTE URL, und `req.url` traegt nach dem Modul-Host-Rewrite den INNEREN Pfad
   * (`src/app/m/files/_lib/hostRolle.ts:137-139`). `_lib/bauform.test.ts` verbietet die Form
   * ueber alle vier aeusseren Flaechen.
   *
   * 303 statt 302: die Antwort auf ein GET, das eine Wirkung hatte, ist ein „See Other" —
   * dieselbe Form wie in `t/[code]/route.ts`.
   */
  const antw = new NextResponse(null, {
    status: 303,
    headers: { Location: grund ? `/?grund=${grund}` : "/" },
  });

  /*
   * ⛔ `ausleihCookieOptionen(0)` STATT `cookies.delete(...)`: die Attribute muessen beim
   * Loeschen DIESELBEN sein wie beim Setzen (`path: "/"`, kein `domain` —
   * `_lib/ausleihSitzung.ts:207-219`, Spec:2596-2604), und die eine Funktion, die das
   * garantiert, gibt es schon.
   *
   * ⚠️ Ein Loeschen mit abweichenden Attributen bleibt WIRKUNGSLOS, und der Browser meldet
   * das nicht: die Sitzung saehe weiterhin gueltig aus, und `requireAusleihZugang` schickte
   * bei jedem Aufruf erneut hierher — eine Schleife aus zwei 303, die erst auffaellt, wenn
   * jemand das Protokoll liest.
   */
  antw.cookies.set(AUSLEIH_COOKIE, "", ausleihCookieOptionen(0));
  return antw;
}
