import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";

/**
 * DIESE DATEI STELLT DEN PRODUKTIONSFEHLER NACH, DEN KEIN ANDERES TOR SIEHT.
 *
 * Gemessen am 2026-08-22 gegen `test.iuk-ue.de`
 * (`docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`,
 * Befund 4): jede Anfrage auf einem Modul-Host erzeugt einen zweiten,
 * EXTERNEN Round-Trip ueber Cloudflare. Im inneren Request ist
 * `cf-connecting-ip` die Egress-IP des Servers.
 *
 * ⚠️ WARUM EINE EIGENE DATEI STATT `src/proxy.test.ts`: jene Datei importiert
 * `@/proxy` OHNE Attrappe und prueft damit die echte next-auth-Naht
 * (`src/proxy.test.ts:54-56`) — eine `vi.mock("@/core/auth")` in derselben
 * Datei entwertete genau diese Pruefung. Vitest haelt Modul-Register je Datei
 * getrennt, deshalb hier.
 *
 * ⚠️ UND WARUM UEBERHAUPT EINE ATTRAPPE: `AUTH_URL` ist in dieser
 * Testumgebung NICHT gesetzt — weder in `playwright.config.ts` (`webServer.env`,
 * belegt in `e2e/konto-widerruf.spec.ts:52-56`, wo genau dieses
 * Nicht-Gesetztsein die Testfuehrung bestimmt) noch in `.env.local`. Ohne
 * `AUTH_URL` ist `reqWithEnvURL` ein No-Op
 * (`node_modules/next-auth/lib/env.js:6-8`: `if (!url) return req;`), und der
 * Fehler kann strukturell nicht auftreten. Die Attrappe stellt die
 * Umschreibung deshalb selbst nach, woertlich nach `env.js:5-12`.
 */
vi.mock("@/core/auth", () => ({
  auth:
    (rueckruf: (req: NextRequest, event: NextFetchEvent) => NextResponse) =>
    async (request: NextRequest, event: NextFetchEvent) => {
      // Nachstellung von `reqWithEnvURL` (node_modules/next-auth/lib/env.js:5-12).
      // Sie ist noetig, weil AUTH_URL in dieser Testumgebung NICHT gesetzt ist
      // (playwright.config.ts webServer.env, belegt in e2e/konto-widerruf.spec.ts:52-56)
      // und der Fehler ohne sie strukturell nicht auftreten kann.
      const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
      let getauscht = request;
      if (url) {
        const { origin: envOrigin } = new URL(url);
        const { href, origin } = request.nextUrl;
        getauscht = new NextRequest(href.replace(origin, envOrigin), request);
      }

      // `handleAuth` ruft die Weiche mit der AUSGETAUSCHTEN Anfrage
      // (`next-auth/lib/index.js:163-169`) und verpackt ihr Ergebnis in eine
      // neue `Response` (`:181`, `new Response(response?.body, response)`).
      const antwort = (await rueckruf(getauscht, event)) ?? NextResponse.next();
      return new Response(antwort.body, antwort);
    },
}));

import { proxy } from "@/proxy";

const EREIGNIS = undefined as unknown as NextFetchEvent;

// Der Kopfname steht hier ABSICHTLICH als Literal und nicht als
// `proxyModul.REWRITE_KOPF`: geprueft wird, was in Produktion ankommt, nicht,
// was die eigene Konstante behauptet. Waeren beide dieselbe Quelle, bliebe eine
// falsch gesetzte Konstante hier unsichtbar.
const REWRITE_KOPF_LITERAL = "x-middleware-rewrite";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("src/proxy.ts — das Rewrite-Ziel bleibt auf der Origin der Anfrage", () => {
  /*
   * DER TEST, DER DEN BESTANDSFEHLER REPRODUZIERT.
   *
   * Die Anfrage kommt auf `https://0.0.0.0:3000/` an — das ist die Origin, die
   * Next aus `opts.hostname`/`opts.port` selbst baut
   * (`resolve-routes.js:117`, `Dockerfile:38-39`), NICHT der Host-Kopf.
   * `x-forwarded-host` traegt den Modul-Host, wie Traefik ihn durchreicht.
   *
   * next-auth tauscht die Origin gegen AUTH_URL aus. Ohne die Umschreibung
   * traegt das Rewrite-Ziel danach `apex.example.test` — eine Origin, die Next
   * nie gesehen hat, also entscheidet es „extern" (`relativize-url.js:29`) und
   * proxyt per echtem HTTP-Aufruf (`router-server.js:415-417`).
   */
  it("mit gesetztem AUTH_URL zeigt das Rewrite-Ziel auf die Origin der Anfrage, nicht auf AUTH_URL", async () => {
    vi.stubEnv("AUTH_URL", "https://apex.example.test");
    // Ohne diese Variable faende `moduleForHost` kein Modul
    // (`src/core/registry.ts:251-258`), `decideRoute` fiele auf `portal`
    // zurueck (`src/core/routing.ts:69`) und der Test prueefte etwas anderes,
    // als sein Name sagt.
    vi.stubEnv("SUITE_HOST_FILES", "files.example.test");

    const anfrage = new NextRequest("https://0.0.0.0:3000/", {
      headers: { "x-forwarded-host": "files.example.test" },
    });

    const antwort = await proxy(anfrage, EREIGNIS);

    expect(antwort?.headers.get(REWRITE_KOPF_LITERAL)).toBe("https://0.0.0.0:3000/m/files");
  });

  /*
   * DER DEV- UND E2E-FALL. Ohne `AUTH_URL` ist `reqWithEnvURL` ein No-Op
   * (`next-auth/lib/env.js:6-8`) — die Umschreibung darf dort nichts
   * veraendern. Der Modul-Host kommt in Dev ueber `*.localtest.me`, fest
   * verdrahtet in `src/core/registry.ts:254`.
   *
   * Die Origin ist hier bewusst eine ANDERE als in T6 (`http://localhost:3000`
   * statt `https://0.0.0.0:3000`): eine fest verdrahtete Origin in der
   * Umschreibung bliebe sonst unbemerkt.
   */
  it("ohne AUTH_URL bleibt das Ergebnis unveraendert", async () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");

    const anfrage = new NextRequest("http://localhost:3000/", {
      headers: { host: "files.localtest.me" },
    });

    const antwort = await proxy(anfrage, EREIGNIS);

    expect(antwort?.headers.get(REWRITE_KOPF_LITERAL)).toBe("http://localhost:3000/m/files");
  });
});
