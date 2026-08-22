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
  return (await weicheMitAuth)(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
