// src/app/m/radio/sw.js/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /sw.js` — DER ABRAEUM-WORKER ALS ROUTE HANDLER (Spec 1 §7.1.3, `Spec:5607-5629`;
 * Planteil 5, Aufgabe G5).
 *
 * ⛔ ZWEI FRAGEN, ZWEI DATEIEN — wie bei `admin/(arbeit)/geraete/export/route.test.ts:24-27`:
 * `riegel.test.ts` Klausel (c) prueft die BAUFORM ueber den Quelltext, diese Datei prueft
 * das VERHALTEN.
 *
 * ⛔ DIE SONDE AUF DEM MODUL `_lib/sw-quelle`, UND SIE IST DER KERN DIESER DATEI. Die
 * strukturelle Zusage des `??` (`_lib/hostRiegel.ts:17-22`) lautet: auf fremdem Host wird
 * die Quelle GAR NICHT AUSGEWERTET. ⚠️ Ein Fall, der dafuer nur „auch bei leerer Quelle
 * kommt 404" prueft, ist gegen die naheliegende Verschlechterung BLIND — ein Handler, der
 * die Antwort erst baut und den Riegel als ZWEITE Anweisung fuehrt, antwortet auf fremdem
 * Host genauso mit 404. Der EINZIGE beobachtbare Unterschied ist, OB gelesen wurde.
 * Deshalb zaehlt der Getter unten die Zugriffe. (Abweichung vom Brief-Rezept, Grund in
 * `BERICHT-G5.md`.)
 */
const sonde = vi.hoisted(() => ({ gelesen: 0 }));

vi.mock("../_lib/sw-quelle", async () => {
  const echt = await vi.importActual<typeof import("../_lib/sw-quelle")>("../_lib/sw-quelle");
  return {
    get RADIO_SW_ABRAEUM_QUELLE() {
      sonde.gelesen++;
      return echt.RADIO_SW_ABRAEUM_QUELLE;
    },
  };
});

import { GET } from "./route";

/**
 * ⛔ `x-forwarded-host` UND NICHT `host` — gemessen und im Haus ausgeschrieben
 * (`admin/(arbeit)/geraete/export/route.test.ts:165-169`): `resolveHost`
 * (`src/core/routing.ts:36-41`) liest ihn mit Vorrang, und `Host` ist in undicis `Headers`
 * mit dem Request-Waechter ein verbotener Name — ein Test, der ihn setzt, misst am Ende die
 * leere Zeichenkette und waere aus dem falschen Grund gruen.
 */
const RADIO_HOST = { "x-forwarded-host": "radio.localtest.me" };
const FREMDER_HOST = { "x-forwarded-host": "portal.localtest.me" };

function anfrage(kopf: HeadersInit): Request {
  return new Request("http://radio.localtest.me/sw.js", { method: "GET", headers: kopf });
}

beforeEach(() => {
  sonde.gelesen = 0;
});

describe("GET /sw.js — der Riegel, alles IN der Route", () => {
  it("auf fremdem Host 404, und nicht als HTML", async () => {
    /*
     * ⛔ `hostAbweisung`, NICHT die werfende Form (Bauform-Zulaessigkeitstafel Nr. 12,
     * `Spec:5624-5629`). Ein notFound waere eine HTML-Fehlerseite mit
     * `Content-Type: text/html`, und der Browser braeche die Worker-Registrierung mit einer
     * irrefuehrenden Meldung ab.
     *
     * ⚠️ DER GEMESSENE WERT STEHT MIT, NICHT NUR DIE VERNEINUNG: eine Zusage ueber einen
     * FEHLENDEN Kopf waere leer-gruen. `text/plain;charset=UTF-8` ist undicis Vorgabe fuer
     * einen Zeichenketten-Rumpf, abgelesen am 2026-08-26 unter Node v26.7.0.
     *
     * ⛔ ZUGESICHERT WIRD ABER NUR DER PRAEFIX, UND DAS IST DIE HAUSFORM DERSELBEN ANTWORT:
     * `_lib/host.test.ts:142-144` prueft dieselbe `hostAbweisung`-404 und schreibt dort aus,
     * warum das Muster vorn bindet. Ein exaktes `toBe` auf die undici-Schreibweise machte den
     * Fall bei einem Node-Sprung rot AUS EINEM GRUND, DEN ER NICHT BEHAUPTET (REVIEW-G5 H2).
     */
    const antwort = GET(anfrage(FREMDER_HOST));
    expect(antwort.status).toBe(404);
    expect(await antwort.text()).toBe("Not found");

    const typ = antwort.headers.get("content-type");
    expect(typ, "ohne Kopfzeile waere die Verneinung darunter leer-gruen").not.toBeNull();
    expect(typ).toMatch(/^text\/plain/);
    expect(typ?.startsWith("text/html")).toBe(false);
  });

  it("auf dem radio-Host 200 mit text/javascript", async () => {
    /*
     * `Spec:5607-5622`. ⛔ `cache-control: no-cache` — der Browser holt den Worker bei jeder
     * Update-Pruefung frisch; eine gecachte Fassung waere genau der Zustand, den diese Route
     * aufloest.
     */
    const antwort = GET(anfrage(RADIO_HOST));
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")?.startsWith("text/javascript")).toBe(true);
    expect(antwort.headers.get("cache-control")).toBe("no-cache");

    const echt = await vi.importActual<typeof import("../_lib/sw-quelle")>("../_lib/sw-quelle");
    expect(await antwort.text()).toBe(echt.RADIO_SW_ABRAEUM_QUELLE);
  });

  it("der Riegel steht VOR jeder Auswertung der Quelle", async () => {
    /*
     * ⛔ DIE STRUKTURELLE ZUSAGE DES `??` (`_lib/hostRiegel.ts:17-22`, `Spec:538-540`): im
     * rechten Zweig kann nichts vor dem Riegel laufen, weil er erst ausgewertet wird, wenn
     * der linke `null` ist.
     *
     * Die zweite Haelfte ist kein Beiwerk: ohne sie waere `gelesen === 0` auch dann wahr,
     * wenn die Sonde gar nicht griffe — der Fall waere leer-gruen.
     */
    const abgewiesen = GET(anfrage(FREMDER_HOST));
    expect(abgewiesen.status).toBe(404);
    expect(sonde.gelesen, "die Quelle wurde auf fremdem Host ausgewertet").toBe(0);

    sonde.gelesen = 0;
    const geliefert = GET(anfrage(RADIO_HOST));
    expect(geliefert.status).toBe(200);
    expect(sonde.gelesen, "die Sonde greift nicht — der Fall oben waere leer-gruen").toBe(1);
  });
});
