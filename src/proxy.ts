import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import type { NextAuthRequest } from "next-auth";
import { auth } from "@/core/auth";
import { decideRoute, resolveHost } from "@/core/routing";

/**
 * BEIDE Parameter sind absichtlich benannt, obwohl die Weiche nur den ersten
 * benutzt. `auth` ist ueberladen (`next-auth/index.d.ts:209-211`), und eine
 * einstellige Rueckruffunktion trifft die FALSCHE Ueberladung:
 *
 *   (req, ctx: AppRouteHandlerFnContext) => …   -> Route Handler
 *   (req, event: NextFetchEvent)         => …   -> Middleware   <- die hier
 *
 * TypeScript nimmt die erste passende — also den Route Handler, dessen Ergebnis
 * `AppRouteHandlerFn` ist und sich nicht mit `(request, event)` aufrufen laesst.
 * Der zweite Parameter zwingt die Wahl auf die Middleware-Ueberladung.
 */
type Weiche = (req: NextAuthRequest, event: NextFetchEvent) => NextResponse;

/**
 * Die Weichenstellung selbst — inhaltlich unveraendert.
 */
const weiche: Weiche = (req) => {
  // Nicht `req.headers.get("host")`: hinter dem Reverse-Proxy und bei der
  // internen Render-Anfrage nach einem `redirect()` steht der echte Host nur in
  // `x-forwarded-host`. Siehe resolveHost.
  const host = resolveHost(req.headers);
  const { nextUrl } = req;
  const groups = req.auth?.user?.groups ?? null;

  const decision = decideRoute({ host, pathname: nextUrl.pathname, groups });

  switch (decision.action) {
    case "next":
      return NextResponse.next();
    case "rewrite": {
      const url = nextUrl.clone();
      url.pathname = decision.target;
      return NextResponse.rewrite(url);
    }
    case "login": {
      const url = nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", decision.callbackUrl);
      return NextResponse.redirect(url);
    }
    case "forbidden":
      return new NextResponse("Forbidden", { status: 403 });
  }
};

/**
 * Die Weiche im Wrapper-Zweig von next-auth (`lib/index.js:60-70`). Dieser Weg
 * ist Pflicht, nicht Geschmack: nur er laeuft durch `handleAuth`, und nur
 * `handleAuth` haengt die `Set-Cookie`-Header der Sitzungsantwort an unsere
 * Antwort an (`lib/index.js:166-170`). Ohne ihn kaeme ein rotiertes
 * Refresh-Token nie im Browser an.
 *
 * EXPORTIERT, damit `proxy.test.ts` genau diese Stelle prueft. Sie ist die neue
 * Bruchstelle: dass `proxy` eine Funktion IST, macht die Dateiform allein schon
 * wahr — dass dieses Promise zu etwas Aufrufbarem auffloest, nicht. Aendert
 * next-auth den Wrapper-Zweig, waere das Symptom wieder 500 auf jeder Route,
 * nur still bei jeder Anfrage statt laut beim Laden. Next.js liest den Export
 * nicht; es kennt nur `proxy` und `config`.
 */
export const weicheMitAuth = Promise.resolve(auth(weiche));

/** Der Kopf, in den `NextResponse.rewrite()` sein Ziel schreibt
 *  (`node_modules/next/dist/server/web/spec-extension/response.js:118`). */
export const REWRITE_KOPF = "x-middleware-rewrite";

/**
 * WARUM DAS REWRITE-ZIEL AUF DIE ORIGIN DER ANFRAGE ZURUECKGESCHRIEBEN WIRD.
 *
 * ⛔ Diese Funktion sieht ueberfluessig aus. Sie ist es nicht — ohne sie geht
 * JEDE Anfrage auf einem Modul-Host (share, drop, qr, da, aufgaben, lagerbuch)
 * ein zweites Mal EXTERN ueber Cloudflare und Traefik in denselben Container
 * zurueck. Gemessen am 2026-08-22 gegen `test.iuk-ue.de`:
 * `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`,
 * Befund 4 — zwei Traefik-Zeilen fuer EINEN Aufruf. Der Umbau und seine
 * Abnahme stehen in
 * `docs/superpowers/plans/2026-08-22-modul-host-rewrite-intern.md`.
 *
 * Der Schaden ist nicht die Latenz, sondern die Client-Adresse: im INNEREN
 * Request — dort, wo der Modul-Handler laeuft — ist `cf-connecting-ip` die
 * Egress-IP dieses Servers. `clientIpAus` (`src/core/ratelimit.ts`) liefert
 * damit auf jedem Modul-Host fuer jeden Nutzer denselben Wert: jedes
 * IP-Rate-Limit zaehlt gegen EINEN Sammel-Eimer, und die Auditspalte
 * `client_ip_unbestaetigt` traegt fuer alle Zeilen dieselbe Adresse.
 *
 * DIE KETTE, IN VIER SCHRITTEN:
 *
 * (a) next-auth tauscht die Origin der Anfrage gegen `AUTH_URL` aus, BEVOR
 *     unsere Weiche sie klont — `reqWithEnvURL`
 *     (`node_modules/next-auth/lib/env.js:5-12`), aufgerufen in
 *     `node_modules/next-auth/lib/index.js:143`. Das Rewrite-Ziel traegt
 *     danach `https://iuk-ue.de`, die Koepfe bleiben unangetastet.
 *
 * (b) Next entscheidet „intern oder extern" an REINER Origin-Gleichheit gegen
 *     seine eigene `initUrl`
 *     (`node_modules/next/dist/shared/lib/router/utils/relativize-url.js:29`:
 *     `const isRelative = relative.origin === baseURL.origin;`, aufgerufen in
 *     `node_modules/next/dist/server/lib/router-utils/resolve-routes.js:466-472`).
 *     Und `initUrl` kommt NICHT aus dem `Host`-Kopf, solange
 *     `trustHostHeader` ungesetzt ist — was es hier ist (`next.config.ts:1-12`
 *     fuehrt nur `reactCompiler`, `output`, `allowedDevOrigins`). Sie wird aus
 *     `opts.hostname`/`opts.port` gebaut (`resolve-routes.js:117`), im
 *     Container also aus `0.0.0.0` und `3000` (`Dockerfile:38-39`).
 *
 * (c) Faellt die Gleichheit, ist der Zweig ein ECHTER HTTP-Aufruf:
 *     `node_modules/next/dist/server/lib/router-server.js:415-417` ruft
 *     `proxyRequest` — ueber oeffentliches DNS, also Cloudflare, dann Traefik,
 *     dann zurueck in denselben Container.
 *
 * (d) ⛔ EIN PINNEN AUF DEN BEREITS GEPRUEFTEN HOST GENUEGT NICHT. Der
 *     Messbericht schlaegt genau das vor (`:158-162`: `url.protocol`/`url.host`
 *     auf `resolveHost`s Ergebnis pinnen) — es waere der Fehler in neuer Form.
 *     Verglichen wird nach (b) gegen `https://0.0.0.0:3000`, und davon ist ein
 *     auf `share.iuk-ue.de` gepinntes Ziel genauso verschieden wie
 *     `https://iuk-ue.de`: der externe Round-Trip bliebe, nur auf einem anderen
 *     Host.
 *
 * Deshalb die Origin DERSELBEN Anfrage, die Next gerade selbst gebaut hat
 * (`request.nextUrl.origin` in `proxy` unten). Damit ist die Gleichheit in (b)
 * konstruktionsbedingt wahr — fuer jedes `HOSTNAME`, jedes `PORT`, jedes
 * Protokoll, in Dev wie in Prod. Es gibt keinen Wert zu raten und keinen zu
 * pflegen.
 *
 * ⚠️ DAS TRAEGT NUR, WEIL `request.nextUrl.origin` DIESELBEN BAUTEILE HAT WIE
 * `initUrl`. Nachgemessen am Quelltext, weil ohne diese Gleichheit der ganze
 * Umbau wirkungslos waere und kein Tor es saehe:
 *
 *   - `node_modules/next/dist/server/next-server.js:1136-1142` baut die URL,
 *     die die Middleware sieht. Der Default-Zweig (`:1142`) setzt sie aus
 *     `initProtocol`, `this.fetchHostname` und `this.port` zusammen; der
 *     Zweig fuer `skipProxyUrlNormalize` (`:1137`) nimmt `initURL` direkt.
 *   - `initProtocol` IST das `protocol`, aus dem `initUrl` gebaut wird —
 *     dieselbe Variable, zwei Zeilen weiter abgelegt
 *     (`resolve-routes.js:115`, `:117`, `:122`).
 *   - `this.fetchHostname` ist `formatHostname(this.hostname)`
 *     (`base-server.js:352`) — dieselbe Funktion, die `resolve-routes.js:117`
 *     auf denselben Wert anwendet. `hostname`/`port` reicht
 *     `router-server.js:601` an `render-server.js:99-102` durch, aus
 *     demselben `opts`.
 *
 * Beide Zweige ergeben also dieselbe Origin wie `initUrl`.
 *
 * ⛔ `location` wird NIE gelesen und NIE geschrieben. Die Login-Weiterleitung
 * (`case "login"` oben) hat dieselbe Ursache und traegt heute die Apex-Origin —
 * sie bleibt bewusst unangetastet, weil ungemessen ist, wo ein Nutzer danach
 * landen soll. `src/proxy.test.ts` haelt das mit einem eigenen Test fest.
 *
 * ⛔ `headers.set` an Ort und Stelle, ohne `try`/`catch`: die `Response`, die
 * aus der Weiche kommt, ist die aus `node_modules/next-auth/lib/index.js:181`
 * (`new Response(response?.body, response)`), und next-auth mutiert ihre Koepfe
 * zwei Zeilen spaeter selbst (`:183-184`). Ein vorsichtshalber gesetztes
 * `try`/`catch` erzeugte genau den stillen No-Op, gegen den der
 * Kanarienvogel-Test gebaut ist — nur ohne Waechter.
 */
export function rewriteZielAufAnfrageOrigin(antwort: Response, anfrageOrigin: string): Response {
  const ziel = antwort.headers.get(REWRITE_KOPF);
  if (!ziel) return antwort;

  const alt = new URL(ziel);
  const neu = new URL(alt.pathname + alt.search + alt.hash, anfrageOrigin);
  antwort.headers.set(REWRITE_KOPF, neu.toString());
  return antwort;
}

/**
 * WARUM HIER EIN `await` STEHT — und warum `export default auth(...)` nicht geht.
 *
 * `initAuth` hat zwei Zweige, und sie sind NICHT symmetrisch
 * (`node_modules/next-auth/lib/index.js:39-125`):
 *
 *   NextAuth(objekt)   -> `return (...args) => …`        synchron
 *   NextAuth(funktion) -> `return async (...args) => …`  ASYNC
 *
 * Wir uebergeben eine Funktion (siehe `core/auth/config.ts` — daran haengt
 * `darfSchreiben`). Damit liefert der `auth(weiche)`-Aufruf oben kein
 * Middleware-Handle, sondern ein PROMISE darauf. Next.js prueft beim Laden des
 * Moduls `typeof (mod.proxy ?? mod.default) === "function"`
 * (`next/dist/build/templates/middleware.js`) — ein Promise faellt durch, und
 * die Folge ist HTTP 500 auf JEDER Route. Weder `pnpm build` noch die
 * Unit-Tests sehen das; genau so ist es einmal passiert.
 *
 * `Promise.resolve` statt eines blanken `await` auf `auth(...)`: die
 * Typdeklaration von next-auth sagt „synchron" (`index.d.ts:211`), der Code
 * sagt „async". `Promise.resolve` ist unter BEIDEN Lesarten wahr — es
 * normalisiert Wert wie Promise — und bleibt richtig, falls next-auth die
 * Zweige eines Tages angleicht.
 *
 * Aufgeloest wird EINMAL; das Promise ist modulweit. Die eigentliche
 * Konfiguration baut next-auth trotzdem pro Anfrage (`config(req)` in
 * `lib/index.js:66`) — `request` ist auf diesem Weg also definiert und
 * `darfSchreiben` damit `true`.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // `event` mitgeben: `handleAuth` reicht `args[1]` an die Weiche durch, und
  // daran haengt `waitUntil`.
  const antwort = await (await weicheMitAuth)(request, event);
  // `NextMiddlewareResult` schliesst `null | undefined | void` ein
  // (`next/dist/server/web/types.d.ts:44`); nur eine echte Antwort hat Koepfe.
  if (!(antwort instanceof Response)) return antwort;

  // `request`, NICHT `req` der Weiche: `request` ist die unverfaelschte Anfrage,
  // die einzige Stelle, an der die von Next selbst gebaute Origin noch heil ist.
  // `req` traegt bereits die gegen AUTH_URL getauschte Origin — wer sie hier
  // nimmt, schreibt `iuk-ue.de` auf `iuk-ue.de` und hat nichts geaendert.
  return rewriteZielAufAnfrageOrigin(antwort, request.nextUrl.origin);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
