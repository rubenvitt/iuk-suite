import { describe, it, expect } from "vitest";
import { GET as manifest } from "./manifest.webmanifest/route";
import { GET as icon } from "./pwa-icon.svg/route";
import { baueAntwort as worker } from "./sw.js/route";
import { ZEICHEN_SW_QUELLE, ZEICHEN_SW_ABRAEUM_QUELLE } from "./_lib/sw-quelle";

/**
 * KEIN `// @vitest-environment jsdom` — diese Datei prueft `Response`-Objekte,
 * kein DOM.
 */

describe("PWA-Routen zeichen", () => {
  it("das Manifest startet auf /offline und umfasst den ganzen Host", async () => {
    /*
     * ⛔ DIE EINE ZEILE, DIE VON BEIDEN BESTEHENDEN MANIFESTEN DER SUITE ABWEICHT.
     * qr/manifest.webmanifest/route.ts und uav setzen `start_url: "/"`. Hier
     * waere "/" die RSC-Startseite unter SuiteRahmen — sie liegt ausdruecklich
     * NICHT im Cache, und die installierte PWA landete offline auf Chromiums
     * Netzwerkfehlerseite. `scope` bleibt "/", damit der Worker JEDE Navigation
     * des Hosts sieht und auf /offline zurueckfallen kann.
     */
    const json = await (await manifest()).json();
    expect(json.start_url).toBe("/offline");
    expect(json.scope).toBe("/");
    expect(json.icons[0].src).toBe("/pwa-icon.svg");
    expect(json.display).toBe("standalone");
  });

  it("Manifest-Startadresse und Worker-Rueckfall sind dieselbe Route", async () => {
    // Das Dreieck dieser Aufgabe: manifest.start_url == NAV_FALLBACK ==
    // (rahmenlos)/offline. Laufen zwei davon auseinander, startet die
    // installierte PWA auf einer Route, die der Worker nicht kennt — und das
    // sieht man erst offline, im Einsatz.
    const json = await (await manifest()).json();
    expect(ZEICHEN_SW_QUELLE).toContain(`const NAV_FALLBACK = "${json.start_url}";`);
  });

  it("das Icon kommt als SVG und ohne @ant-design/icons", async () => {
    // Falle 7: ein Icon-Import aus @ant-design/icons ergibt in einem Route
    // Handler HTTP 500 beim IMPORT, nicht beim Rendern. Dieses Modul ist ein
    // SVG-Modul und fasst das Paket nirgends an.
    const res = await icon();
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain("<svg");
  });

  it("mit ZEICHEN_SW=1 liefert /sw.js den Cache-Worker", async () => {
    const res = worker({ ZEICHEN_SW: "1" });
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe(ZEICHEN_SW_QUELLE);
  });

  it("ohne ZEICHEN_SW liefert /sw.js den Abraeum-Worker", async () => {
    /*
     * Ein Schalter, den man einschalten kann, muss auch ausschaltbar sein: ohne
     * diesen Zweig liefe auf jedem Geraet, das die PWA einmal installiert hat,
     * der alte Worker WEITER — mitsamt Cache und Geraetedatenbank.
     */
    expect(await worker({}).text()).toBe(ZEICHEN_SW_ABRAEUM_QUELLE);
  });
});
