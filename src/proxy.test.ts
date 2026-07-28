import { describe, it, expect } from "vitest";

import * as proxyModul from "@/proxy";

/**
 * DIESER TEST BILDET NEXT.JS NACH, NICHT UNSERE ABSICHT.
 *
 * Next.js laedt `src/proxy.ts` ueber eine Vorlage, die genau eine Sache prueft
 * (`node_modules/next/dist/build/templates/middleware.js`):
 *
 *     const handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default
 *     if (typeof handlerUserland !== "function") throw new ProxyMissingExportError(...)
 *
 * Die Pruefung laeuft beim Laden des Moduls, also VOR jeder Anfrage — faellt sie
 * durch, antwortet die ganze Anwendung mit HTTP 500, auf JEDER Route.
 *
 * Genau das ist passiert: `export default auth((req) => …)` war jahrelang
 * richtig, wurde aber falsch in dem Moment, in dem `core/auth` von einer
 * Objekt- auf eine Funktions-Konfiguration umgestellt wurde. `NextAuth(fn)`
 * gibt aus `auth(callback)` ein Promise zurueck statt der Funktion
 * (`next-auth/lib/index.js:42` gegen `:88`) — ein Promise ist kein `function`.
 *
 * Weder `pnpm build` noch die uebrigen Unit-Tests haben das gesehen. Deshalb
 * steht die Zusicherung hier, in derselben Form, in der Next.js sie stellt: ein
 * anderer Weg zur selben Aussage wuerde denselben Fehler wieder durchlassen.
 */
describe("src/proxy.ts — der Export, den Next.js beim Laden prueft", () => {
  it("stellt unter `proxy` oder `default` eine Funktion bereit (Next.js wirft sonst beim Laden)", () => {
    const modul = proxyModul as Record<string, unknown>;
    // Dieselbe Aufloesung wie in der Next.js-Vorlage: `proxy` gewinnt, `default`
    // ist der Rueckfall. Bewusst nicht auf `proxy` festgenagelt — ein
    // funktionierendes `export default function` waere ebenso gueltig.
    const handler = modul.proxy ?? modul.default;

    expect(typeof handler).toBe("function");
  });

  /*
   * Der Test darueber kann seit der Reparatur nur noch rot werden, wenn jemand
   * die Datei auf `export default auth(cb)` ZURUECKschreibt — `export async
   * function proxy` macht `typeof === "function"` syntaktisch wahr. Er bewacht
   * damit den Bruch von gestern.
   *
   * Der Bruch von heute sitzt eine Ebene tiefer: `proxy` ruft
   * `(await weicheMitAuth)(…)`. Loest dieses Promise zu etwas nicht Aufrufbarem
   * auf — weil next-auth seinen Wrapper-Zweig (`lib/index.js:60-70`) aendert —,
   * ist das Ergebnis wieder HTTP 500 auf jeder Route, nur still bei jeder
   * Anfrage statt laut beim Laden des Moduls. Das saehe sonst nur Playwright.
   *
   * Bewusst NICHT `proxy(req, event)` durchrufen: das zoege `getSession` →
   * `Auth()` nach und machte den Test von `AUTH_SECRET` und einer echten
   * Anfrage abhaengig. Geprueft wird die Naht, nicht der Durchlauf.
   */
  it("loest die next-auth-Anbindung zu einer aufrufbaren Weiche auf", async () => {
    expect(typeof (await proxyModul.weicheMitAuth)).toBe("function");
  });

  // Ehrlich gesagt: eine Festschreibung des Literals, mehr nicht. Sie haelt den
  // Ausschluss fest, damit ein Umbau der Anbindung ihn nicht nebenbei
  // mitnimmt — ob Next.js `config` neben einem BENANNTEN `proxy`-Export
  // ueberhaupt noch liest, beantwortet sie NICHT (das tun die e2e-Tests und
  // das `middleware-manifest.json` nach `pnpm build`).
  it("laesst `_next/static`, `_next/image` und `favicon.ico` weiterhin am Matcher vorbei", () => {
    expect(proxyModul.config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});
