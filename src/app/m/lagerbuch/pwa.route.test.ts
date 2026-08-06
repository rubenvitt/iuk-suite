import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GET as manifest } from "./manifest.webmanifest/route";
import { GET as svg } from "./pwa-icon.svg/route";
import { GET as png192 } from "./icon-192.png/route";
import { GET as png512 } from "./icon-512.png/route";
import { GET as pngMask } from "./icon-maskable-512.png/route";

/**
 * KEIN `// @vitest-environment jsdom` — und das ist Absicht, kein Versehen.
 * Diese Datei prueft `Response`-Objekte und Dateien auf der Platte, kein DOM;
 * sie importiert `@/app/m/qr/_lib/test-dom` nicht. Die bau-anhaltende Reparatur
 * aus der Regeldatei (Befund 4) greift hier nicht.
 */

const WURZEL = process.cwd();
const MODUL = "src/app/m/lagerbuch";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der
 * Regeldatei fuer Teil 4, N-5). Die Scans unten lesen sonst den Rohtext
 * INKLUSIVE Kommentaren — und `manifest.webmanifest/route.ts` wie
 * `_lib/hostRiegel.ts` nennen `requireLagerbuchHost` woertlich in der
 * Begruendung, WARUM sie es nicht benutzen. Ohne diese Funktion waere der Scan
 * genau auf dieser Begruendung rot (gemessen: der Scan faellt).
 * `bauform.test.ts` exportiert sie nicht, und dies ist ein anderer Testkoerper,
 * deshalb die lokale Kopie.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Die erste AUSFUEHRBARE Anweisung des `GET`-Rumpfs — nicht die erste Zeile der
 * Datei.
 *
 * ⚠️ WARUM NICHT EINFACH `toMatch(/hostAbweisung/)` (Befund 40): der Name steht
 * in jeder der fuenf Dateien schon in der Importzeile. Ein Handler, der den
 * Riegel importiert und den Aufruf ersatzlos streicht, bestuende einen solchen
 * Scan — und traegt von §2.6 dann weder „als erster Anweisung" noch ueberhaupt
 * „ruft". Dasselbe Herausschneiden der ersten Rumpfzeilen benutzen T73 und T74.
 */
function ersteRumpfanweisung(quelle: string): string {
  const rumpf = ohneKommentare(quelle).split(/export function GET\s*\([^)]*\)[^{]*\{/)[1] ?? "";
  return rumpf.split("\n").map((z) => z.trim()).find((z) => z.length > 0) ?? "";
}

const HANDLER = [
  { name: "manifest.webmanifest", fn: manifest, typ: "application/manifest+json" },
  { name: "pwa-icon.svg", fn: svg, typ: "image/svg+xml" },
  { name: "icon-192.png", fn: png192, typ: "image/png" },
  { name: "icon-512.png", fn: png512, typ: "image/png" },
  { name: "icon-maskable-512.png", fn: pngMask, typ: "image/png" },
] as const;

/** Die sechs Quelldateien dieses Tasks: die fuenf Handler und ihr geteilter Riegel. */
const QUELLEN = [
  ...HANDLER.map((h) => `${MODUL}/${h.name}/route.ts`),
  `${MODUL}/_lib/hostRiegel.ts`,
];

const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), "utf8");

/**
 * ⚠️ `req.url` traegt nach dem Rewrite den INNEREN Pfad; der aeussere Host steht
 * ausschliesslich in der `host`-Kopfzeile. `intern.invalid` loest nirgends auf.
 */
const anfrage = (host: string) =>
  new Request("http://intern.invalid/m/lagerbuch/x", { headers: { host } });

describe("Alle fuenf Handler tragen den Host-Riegel (§2.6)", () => {
  for (const h of HANDLER) {
    it(`${h.name}: 404 auf fremdem Host, und KEINE HTML-Fehlerseite`, async () => {
      // Sonst bewirbt JEDER Suite-Host eine Lagerbuch-PWA (Falle 56).
      //
      // Die zweite Zusicherung ist die Verhaltensform dessen, was der Plan nur
      // als Schreibweise prueft: die nicht-werfende Riegelform. Ein notFound()
      // waere eine HTML-Fehlerseite, und der Browser meldete „manifest fetch
      // failed" statt eines sauberen 404.
      const r = await h.fn(anfrage("feedback.localtest.me"));
      expect(r.status, h.name).toBe(404);
      expect(r.headers.get("Content-Type") ?? "", h.name).not.toMatch(/text\/html/);
    });

    it(`${h.name}: 200 mit ${h.typ} auf dem Modul-Host`, async () => {
      const r = await h.fn(anfrage("lagerbuch.localtest.me"));
      expect(r.status, h.name).toBe(200);
      expect(r.headers.get("Content-Type"), h.name).toContain(h.typ);
    });
  }
});

describe("manifest.webmanifest — die acht Werte, gemessen gegen die Alt-Anwendung", () => {
  const gelesen = async () =>
    (await (await manifest(anfrage("lagerbuch.localtest.me"))).json()) as {
      name: string; short_name: string; description: string; start_url: string;
      scope: string; display: string; theme_color: string; background_color: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };

  it("traegt die ACHT Werte", async () => {
    /**
     * ⚠️ „DIE SIEBEN WERTE" WAERE FALSCH GEZAEHLT, und die Autoritaetsliste des
     * Plans ist unvollstaendig (Befund 41). Gemessen gegen `../lagerbuch`
     * @ ca04eb1, `src/app/manifest.webmanifest/route.ts`:
     *
     *   byte-identisch (5)   short_name, start_url, display,
     *                        background_color, theme_color
     *   Form 1:1 (1)         name — alt ist es
     *                        `appOrg ? \`${appName} · ${appOrg}\` : appName`;
     *                        die Konstante ist nie leer, der Leerzweig entfaellt
     *   NICHT 1:1 (1)        description — alt ist APP_TAGLINE, und das ist im
     *                        Alt-Repo durchgehend „Materialverwaltung"
     *                        (`src/lib/config.ts:32`, `stack.env.example:5`,
     *                        `compose.yaml:10`). Der Wert hier kommt aus T33s
     *                        ratifiziertem `_lib/marke.ts` (§10.2)
     *   ohne Alt-Gegenstueck (1)  scope — das Alt-Manifest kennt den Schluessel
     *                        gar nicht
     *
     * Die 1:1-Pflicht gilt also fuer sechs der acht; `description` und `scope`
     * sind Entscheidungen. Fuer `name` gilt zusaetzlich A-T3-4 aus `marke.ts`:
     * der wahre Organisationsname ist eine Runbook-Eingabe.
     *
     * Woran die Haerte haengt: diese Werte werden beim INSTALLIEREN eingebrannt.
     * Ein spaeterer Tausch erreicht kein Geraet, auf dem die App schon liegt.
     */
    const m = await gelesen();
    expect(m.name).toBe("Lagerbuch · DRK Bereitschaft Musterstadt");
    expect(m.short_name).toBe("Lagerbuch");
    expect(m.description).toBe("Bestand, Fahrzeuge, Geräte");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe("#C8000F");
    expect(m.background_color).toBe("#EEF0F1");
  });

  it("nennt VIER Symbole, und das SVG heisst `/pwa-icon.svg`", async () => {
    /**
     * `toStrictEqual` und nicht `toEqual` — aber NACHGEMESSEN OHNE UNTERSCHIED
     * an dieser Stelle, und das ist der ehrlichere Vermerk: N-4s Falle („ein
     * `purpose: undefined` geht bei `toEqual` als fehlender Schluessel durch")
     * greift hier nicht, weil die Nutzlast durch `JSON.stringify` laeuft und ein
     * `undefined` dabei ganz verschwindet — die ERWARTUNG traegt „maskable",
     * also faellt der Vergleich in beiden Formen. Gemessen: dieselbe Mutation
     * (`purpose: undefined`) ist mit `toStrictEqual` UND mit `toEqual` rot.
     * `toStrictEqual` bleibt als die engere Form stehen, nicht als Zusage.
     *
     * ⚠️ `/pwa-icon.svg` STATT `/icon.svg` — und der Grund im Plan (E7, „diese
     * Datei existiert nicht") ist NACHGEMESSEN FALSCH: `../lagerbuch/public/`
     * enthaelt sie zwar nicht, aber `../lagerbuch/src/app/icon.svg` gibt es
     * (385 Bytes), Next liefert eine App-Router-Metadatendatei unter `/icon.svg`
     * aus, und `_lib/pwaIcons.ts` nennt genau diese Datei als Portierungsquelle.
     * Der tragfaehige Grund ist ein anderer: eine `app/icon.svg` laege in der
     * Suite an der WURZEL und wuerde von jedem Host getragen — dieselbe
     * Falle 56 —, und ein Verzeichnis `icon.svg/` mit `route.ts` unter dem Modul
     * stuende gegen Nexts Metadatendatei-Konvention fuer dieses Segment.
     */
    const m = await gelesen();
    expect(m.icons).toStrictEqual([
      { src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });

  it("jeder genannte Pfad hat einen Route Handler UNTER DEM MODUL auf der Platte", async () => {
    // Falle 56: heute prueft niemand, ob die im Manifest genannten Pfade
    // ueberhaupt aufloesen — und /icon-192.png laeuft auf dem Modul-Host ins
    // 404, waehrend dieselbe Datei auf jedem anderen Host ausgeliefert wuerde.
    //
    // Geprueft wird gegen das DATEISYSTEM und nicht gegen eine Liste, die dieser
    // Test selbst aus denselben Literalen gebaut hat (Befund 39).
    const m = await gelesen();
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const i of m.icons) {
      expect(i.src.startsWith("/"), i.src).toBe(true);
      expect(
        existsSync(join(WURZEL, MODUL, i.src.slice(1), "route.ts")),
        `${i.src} ohne Route Handler unter ${MODUL}/`,
      ).toBe(true);
    }
  });

  it("die Icon-Pfade sind AEUSSER — der Browser sieht den Modul-Host", async () => {
    const m = await gelesen();
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const i of m.icons) expect(i.src, i.src).not.toMatch(/^\/m\/lagerbuch/);
  });
});

describe("Die Icon-Handler liefern BYTES, nicht Text", () => {
  /**
   * Nachgemessen an `../lagerbuch/public/` @ ca04eb1 (`wc -c`, `shasum -a 256`)
   * — dieselben vier Werte, die `_lib/pwaIcons.test.ts` (T65) selbsttragend
   * fuehrt. Hier haengen sie an der ANTWORT: `pngAntwort` koennte durch ein
   * `new Response(base64)` ersetzt werden, und der Byte-Test von T65 bliebe
   * gruen, waehrend der Browser ein kaputtes Bild zeigte.
   */
  const ERWARTET = [
    { name: "icon-192.png", fn: png192, bytes: 1558, sha: "8ba1cec7e6b5590566e218542c2c8ba818726621ca75de724da402740528d607" },
    { name: "icon-512.png", fn: png512, bytes: 5458, sha: "deab28e9c5eaa3b1eee2ebc34147bc2632cac7fd865770d35c318a3b68800779" },
    { name: "icon-maskable-512.png", fn: pngMask, bytes: 3290, sha: "b990ac769739a40a7a0e6e9cb10576b7bd08b4ef186604750f307dc33e3cf559" },
  ];

  for (const e of ERWARTET) {
    it(`${e.name}: ${e.bytes} Bytes mit dem erwarteten SHA-256`, async () => {
      const puffer = Buffer.from(
        await (await e.fn(anfrage("lagerbuch.localtest.me"))).arrayBuffer(),
      );
      expect(puffer.length, e.name).toBe(e.bytes);
      expect(createHash("sha256").update(puffer).digest("hex"), e.name).toBe(e.sha);
    });
  }

  it("pwa-icon.svg: 385 Bytes mit dem erwarteten SHA-256", async () => {
    const text = await (await svg(anfrage("lagerbuch.localtest.me"))).text();
    expect(Buffer.byteLength(text, "utf8")).toBe(385);
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(
      "98d9dcdb66ee733fd9b28921930121973937fc344b1d28628f354e35a44e5b34",
    );
  });

  it("alle VIER Symbol-Antworten tragen eine Woche unveraenderlichen Cache", async () => {
    // `immutable`: die Bytes sind Konstanten im Bundle. Das Manifest ist
    // absichtlich NICHT dabei — es traegt die Werte, die man noch aendern will.
    const symbole = [svg, png192, png512, pngMask];
    expect(symbole.length).toBe(4);
    for (const fn of symbole) {
      const r = await fn(anfrage("lagerbuch.localtest.me"));
      expect(r.headers.get("Cache-Control")).toBe("public, max-age=604800, immutable");
    }
  });
});

describe("Bauform", () => {
  it("der Riegel ist in JEDER der fuenf die ERSTE ausfuehrbare Anweisung", () => {
    /**
     * §2.6 verlangt `lagerbuchHostOderNull` „als erster Anweisung". Die
     * Verhaltenstests oben halten „der Riegel ist da"; sie koennen „vor allem
     * anderen" nicht halten, weil die fuenf Handler keine beobachtbare
     * Nebenwirkung haben, deren Reihenfolge sich messen liesse. Das ist die
     * Ebene, auf der B2 denselben Fall bereits fuehrt.
     *
     * ⚠️ DIE `??`-FORM IST DER PUNKT, nicht Kuerze: der Kurzschluss macht „vor
     * allem anderen" STRUKTURELL wahr statt konventionell. Ein
     * `const antwort = pngAntwort(…); return hostAbweisung(req) ?? antwort;`
     * antwortet auf fremdem Host genauso mit 404 — alle Verhaltenstests oben
     * bleiben gruen — und wird hier rot.
     */
    // ⚠️ ABGELEITET AUS `HANDLER`, nicht aus `QUELLEN.slice(0, 5)`: ein sechster
    // Handler liesse `QUELLEN` auf sieben wachsen, und ein `slice(0, 5)` pruefte
    // dann fuenf von sechs — die sechste Reihenfolge bliebe still ungeprueft.
    for (const h of HANDLER) {
      const p = `${MODUL}/${h.name}/route.ts`;
      expect(ersteRumpfanweisung(lies(p)), p).toMatch(/^return hostAbweisung\(req\) \?\? /);
    }
  });

  it("keine der fuenf nennt die werfende Form, und der Riegel benutzt die nicht-werfende", () => {
    // Ein `notFound()` waere eine HTML-Fehlerseite mit Content-Type text/html —
    // der Browser meldete dann „manifest fetch failed" statt eines sauberen 404.
    // Der Scan trifft ausdruecklich auch `_lib/hostRiegel.ts`: seit der Riegel
    // geteilt ist, ist DAS die Datei, in der die Form umkippen koennte.
    //
    // ⚠️ DER POSITIVE TEIL UNTEN (`toMatch(/lagerbuchHostOderNull\(/)`) LIEST
    // ZEICHENKETTEN MIT — ein Textliteral „lagerbuchHostOderNull(" erfuellte ihn,
    // ohne dass der Riegel je liefe; das ist dieselbe Klasse, die
    // `bauform.test.ts` mit `ohneKommentareUndZeichenketten` behandelt. Er steht
    // hier trotzdem in der schwaecheren Form, WEIL ER NICHT DER TRAEGER IST: die
    // Zusage haengt an den zehn Verhaltenstests oben (gemessen — ein Riegel, der
    // unbedingt `null` gibt, faellt dort fuenffach; einer, der mit `text/html`
    // antwortet, ebenso). Dies ist Redundanz, kein Netz.
    for (const p of QUELLEN) {
      expect(ohneKommentare(lies(p)), p).not.toMatch(/requireLagerbuchHost/);
    }
    const riegel = ohneKommentare(lies(`${MODUL}/_lib/hostRiegel.ts`));
    expect(riegel).toMatch(/lagerbuchHostOderNull\s*\(/);
    expect(riegel).not.toMatch(/notFound/);
  });

  it("keine der sechs liest eine Env-Variable fuer Text oder Host", () => {
    // §10.2: die drei Textwerte kommen aus `_lib/marke.ts`. Und `start_url: "/"`
    // braucht keinen Host — der Browser sieht den aeusseren.
    for (const p of QUELLEN) {
      expect(ohneKommentare(lies(p)), p).not.toMatch(/process\.env/);
    }
  });

  it("die fuenf Namen liegen als Route Handler unter dem Modul und NICHT in `public/`", () => {
    /**
     * ⚠️ DIE EIGENTLICHE REPARATUR DIESES TASKS, und der Plan sichert sie mit
     * `expect(p).toMatch(/^src\/app\/m\/lagerbuch\//)` ueber eine Zeichenkette
     * zu, die der Test selbst aus genau diesem Literal gebaut hat — laegen die
     * drei PNG weiterhin unter `public/`, bliebe sie gruen (Befund 39).
     *
     * Gemessen wird deshalb die PLATTE: Handler da, `public/`-Zwilling weg.
     * `src/proxy.ts:103` schliesst vom Matcher nur
     * `_next/static|_next/image|favicon.ico` aus — eine Datei `public/x.png`
     * wuerde auf dem lagerbuch-Host nach `/m/lagerbuch/x.png` umgeschrieben und
     * liefe ins 404, waehrend sie auf JEDEM ANDEREN Host an der Wurzel
     * ausgeliefert wuerde (Falle 56).
     */
    for (const h of HANDLER) {
      expect(
        existsSync(join(WURZEL, MODUL, h.name, "route.ts")),
        `${MODUL}/${h.name}/route.ts fehlt`,
      ).toBe(true);
      expect(
        existsSync(join(WURZEL, "public", h.name)),
        `public/${h.name} — auf dem Modul-Host unerreichbar, auf jedem anderen an der Wurzel`,
      ).toBe(false);
    }
  });
});
