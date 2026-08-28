import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";

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

/**
 * DER ZWEITE TEIL DIESER DATEI: DIE UMSCHREIBUNG DES REWRITE-ZIELS.
 *
 * Anlass ist eine Messung am laufenden Betrieb
 * (`docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`,
 * Befund 4): jede Anfrage auf einem Modul-Host erzeugt heute einen zweiten,
 * EXTERNEN Round-Trip ueber Cloudflare. Im inneren Request ist
 * `cf-connecting-ip` deshalb die Egress-IP des Servers — jedes IP-Rate-Limit
 * zaehlt gegen einen Sammel-Eimer, und die Auditspalte
 * `client_ip_unbestaetigt` traegt fuer alle Zeilen dieselbe Adresse.
 *
 * Der Plan dazu: `docs/superpowers/plans/2026-08-22-modul-host-rewrite-intern.md`.
 *
 * ⚠️ WARUM DIE VORRICHTUNGEN HIER VON HAND GEBAUT SIND, statt durch
 * `NextResponse.rewrite()` zu laufen: der Kopfname ist ein INTERNER
 * Next-Vertrag (`node_modules/next/dist/server/web/spec-extension/response.js:118`).
 * Er gehoert genau EINEM Test — dem Kanarienvogel unten. Liefen alle
 * Vorrichtungen durch `NextResponse.rewrite()`, faerbte eine Umbenennung in
 * Next vier Tests rot statt des einen, dessen Name die Ursache nennt.
 */
describe("rewriteZielAufAnfrageOrigin — das Rewrite-Ziel auf die Anfrage-Origin zuruecksetzen", () => {
  // Die Origin, die Next selbst gebaut hat: aus `opts.hostname`/`opts.port`,
  // NICHT aus dem `Host`-Kopf
  // (`node_modules/next/dist/server/lib/router-utils/resolve-routes.js:117`,
  // `trustHostHeader` ist in `next.config.ts:1-12` ungesetzt). Im Container
  // sind das `0.0.0.0` und `3000` (`Dockerfile:38-39`).
  const ANFRAGE_ORIGIN = "https://0.0.0.0:3000";

  function antwortMitZiel(ziel: string): Response {
    return new Response(null, { headers: { [proxyModul.REWRITE_KOPF]: ziel } });
  }

  it("schreibt das Rewrite-Ziel auf die Origin der eingehenden Anfrage zurueck", () => {
    const antwort = proxyModul.rewriteZielAufAnfrageOrigin(
      antwortMitZiel("https://iuk-ue.de/m/files"),
      ANFRAGE_ORIGIN,
    );

    expect(antwort.headers.get(proxyModul.REWRITE_KOPF)).toBe("https://0.0.0.0:3000/m/files");
  });

  // Ohne `search` verschwaende jede Paginierung und jeder RSC-Parameter; ohne
  // `hash` waere die Umschreibung nicht verlustfrei. Der Browser sendet zwar nie
  // ein Fragment an den Server — die Zusicherung haelt trotzdem fest, dass die
  // Funktion NUR die Herkunft austauscht und sonst nichts.
  it("laesst Pfad, Query und Fragment unveraendert", () => {
    const antwort = proxyModul.rewriteZielAufAnfrageOrigin(
      antwortMitZiel("https://iuk-ue.de/m/files/s/abc?seite=2#x"),
      ANFRAGE_ORIGIN,
    );

    expect(antwort.headers.get(proxyModul.REWRITE_KOPF)).toBe(
      "https://0.0.0.0:3000/m/files/s/abc?seite=2#x",
    );
  });

  // Der haeufigste Fall ueberhaupt: `NextResponse.next()` traegt kein
  // Rewrite-Ziel. Ohne die Wache liefe `new URL(null)` und wuerfe — HTTP 500
  // auf jeder Route.
  it("ruehrt eine Antwort ohne Rewrite-Kopf nicht an", () => {
    const vorher = NextResponse.next();
    const nachher = proxyModul.rewriteZielAufAnfrageOrigin(vorher, ANFRAGE_ORIGIN);

    expect(nachher).toBe(vorher);
    expect(nachher.headers.get(proxyModul.REWRITE_KOPF)).toBeNull();
  });

  /*
   * Die Login-Weiterleitung (`src/proxy.ts:41-46`) hat dieselbe Ursache — ihr
   * `Location` traegt heute die Apex-Origin — und bleibt BEWUSST unangetastet
   * (Plan, Kapitel 3, Zeile „Die Login-Weiterleitung"). Wo der Nutzer nach dem
   * Login landet, ist ungemessen und gehoert in einen eigenen Posten.
   *
   * ⚠️ Die Vorrichtung ist kuenstlich: eine echte Antwort traegt entweder das
   * Rewrite-Ziel ODER `Location`, nie beides. Sie muss BEIDE tragen, sonst
   * steigt die Funktion an der Wache oben aus, die Zeile, die `location`
   * anfassen wuerde, liefe nie — und der Test bewachte nichts.
   */
  it("fasst den Location-Kopf nicht an", () => {
    const antwort = new Response(null, {
      status: 307,
      headers: {
        [proxyModul.REWRITE_KOPF]: "https://iuk-ue.de/m/files",
        location: "https://iuk-ue.de/login?callbackUrl=%2F",
      },
    });

    const nachher = proxyModul.rewriteZielAufAnfrageOrigin(antwort, ANFRAGE_ORIGIN);

    expect(nachher.headers.get("location")).toBe("https://iuk-ue.de/login?callbackUrl=%2F");
    // Gegenprobe, dass die Funktion ueberhaupt gelaufen ist — sonst waere die
    // Zusicherung darueber wertlos.
    expect(nachher.headers.get(proxyModul.REWRITE_KOPF)).toBe("https://0.0.0.0:3000/m/files");
  });

  /*
   * DER KANARIENVOGEL. `x-middleware-rewrite` ist nicht oeffentlich
   * dokumentiert, aber stabil genug, dass Next ihn im EIGENEN Test-Hilfsmittel
   * liest (`node_modules/next/dist/experimental/testing/server/utils.js:61`).
   *
   * Benennt ein Next-Upgrade ihn um, findet `rewriteZielAufAnfrageOrigin` den
   * Kopf nie mehr, die Umschreibung wird ein STILLER No-Op und der externe
   * Round-Trip kehrt unbemerkt zurueck (Risiko R2 im Plan). Dieser Test ist der
   * einzige Waechter dagegen.
   */
  it("NextResponse.rewrite schreibt weiterhin in REWRITE_KOPF", () => {
    const antwort = NextResponse.rewrite("https://iuk-ue.de/m/files");

    expect(antwort.headers.get(proxyModul.REWRITE_KOPF)).toBe("https://iuk-ue.de/m/files");
  });
});
