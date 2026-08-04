import { NextResponse } from "next/server";
import { lagerbuchHostOderNull } from "../_lib/host";
import { HELFER_COOKIE, helferCookieOptionen } from "../_lib/helferSitzung";
import { istGateGrund } from "../_lib/gateTexte";

export const dynamic = "force-dynamic";

/**
 * DER EINZIGE WEG, auf dem ein totes Helfer-Cookie unfreiwillig verschwindet.
 * Aeusserer Pfad: /abmelden
 *
 * WARUM ES IHN GIBT — gemessen, nicht vermutet: `requireHelferSitzung` wird aus
 * `helfer/layout.tsx` gerufen, und das ist eine SERVER COMPONENT. `cookies()` ist
 * dort versiegelt: delete, set und clear sind durch einen Proxy ersetzt, der
 * wirft (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53`
 * traegt den Satz „Cookies can only be modified in a Server Action or Route
 * Handler" woertlich, `:171` haengt den Riegel an `cookies().delete`;
 * nachgeschlagen im Arbeitsbaum, Next 16.2.11). Ein `cookies().delete(...)` an
 * der Stelle, an der der Sperrbefund auffaellt, ist also nicht „unsauber",
 * sondern ein LAUFZEITFEHLER.
 *
 * WARUM NICHT UNTER `t/`: `t/[code]/route.ts` ist ein dynamisches Segment, und
 * ein `t/abmelden/route.ts` daneben gewaenne zwar (statisch schlaegt dynamisch),
 * legte aber eine Falle in einen Pfad, der auf laminierten Kaertchen steht.
 * `/abmelden` steht auf keinem Gegenstand und ist deshalb frei waehlbar (§2.7).
 *
 * WARUM GET UND KEINE SERVER ACTION: der Aufrufer ist ein `redirect()` aus einer
 * Server Component — die kann keine Action ausloesen. Der freiwillige Weg bleibt
 * davon unberuehrt: `beenden` in `_actions/sitzung.ts` ist und bleibt eine
 * Server Action hinter einem POST (§3.8.2, Ausnahme 3).
 *
 * ⚠️ EIN `<Link href="/abmelden">` IST HIER FALSCH: Nexts Prefetch fordert das
 * Ziel beim blossen Darueberfahren an und beendete die Sitzung ungefragt. Wer je
 * einen sichtbaren Abmelden-Weg baut, nimmt das POST-Formular auf `beenden`.
 *
 * ⚠️ ANGENOMMENE RESTLUECKE, benannt statt weggeschrieben: ein GET-Endpunkt, der
 * ein Cookie raeumt, ist von fremden Seiten ausloesbar (ein `<img src=…>`
 * genuegt; `SameSite=Lax` verhindert das Setzen des `Set-Cookie` nicht). Der
 * Schaden ist genau: die Helferin muss ihr Kaertchen erneut eingeben — und
 * §7.4.4 faengt das inline ab, ohne die gezaehlten Mengen zu verlieren. Ein
 * CSRF-Token auf einem Abmeldeweg waere teurer als der Schaden.
 */
export async function GET(req: Request) {
  const kopf = new Headers(req.headers);

  /*
   * `lagerbuchHostOderNull`, NICHT `requireLagerbuchHost`: ein `notFound()`-Wurf
   * ist im Antwortweg eines Route Handlers keine brauchbare Antwort
   * (`m/files/_lib/hostRolle.ts:30-32`). Der Handler baut seine 404 selbst (§2.6).
   */
  if (!lagerbuchHostOderNull(kopf)) return new Response("Not found", { status: 404 });

  /*
   * GESCHLOSSENER SATZ, NIE DURCHGEREICHT (§3.9). Ein `searchParams`-Wert ist
   * Nutzereingabe, und er landet hier in einem `Location`-Kopf — dort schuetzt
   * keine React-Entkommung.
   */
  const roh = new URL(req.url).searchParams.get("grund");
  const grund = istGateGrund(roh) ? roh : null;

  /*
   * RELATIVER `Location`, und das ist Absicht. RFC 7231 §7.1.2 erlaubt eine
   * relative Referenz; der Browser loest sie gegen die angefragte URL auf, also
   * gegen den Host, unter dem gescannt wurde — DIESELBE Herkunft, auf die
   * `antw.cookies.set` das Cookie legt. Cookie und Landung koennen damit
   * konstruktiv nicht auseinanderfallen.
   *
   * ⚠️ `NextResponse.redirect(new URL(ziel, req.url))` waere hier FALSCH: das
   * verlangt eine ABSOLUTE URL, und `req.url` traegt in der Suite nach dem
   * Host-Rewrite die INTERNE Adresse (`m/files/_lib/hostRolle.ts:137-139`).
   *
   * 303 statt 302: die Antwort auf ein GET, das eine Wirkung hatte, ist ein
   * „See Other" — dieselbe Form wie in `t/[code]/route.ts` (§7.2.3).
   */
  const antw = new NextResponse(null, {
    status: 303,
    headers: { Location: grund ? `/?grund=${grund}` : "/" },
  });

  /*
   * `helferCookieOptionen(0)` statt `cookies.delete(...)`: die Attribute muessen
   * beim Loeschen DIESELBEN sein wie beim Setzen (path, kein domain, §3.4.2), und
   * die eine Funktion, die das garantiert, gibt es schon. Dieselbe Form benutzt
   * `feedback` (`m/feedback/actions.ts:638`).
   *
   * ⚠️ Ein Loeschen mit abweichenden Attributen bleibt WIRKUNGSLOS, und der
   * Browser meldet das nicht: die Sitzung saehe weiterhin gueltig aus, und
   * `requireHelferSitzung` schickte bei jedem Aufruf erneut hierher — eine
   * Schleife aus zwei 303, die erst auffaellt, wenn jemand das Protokoll liest.
   */
  antw.cookies.set(HELFER_COOKIE, "", helferCookieOptionen(0));
  return antw;
}
