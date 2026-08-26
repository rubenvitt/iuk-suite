// src/app/m/radio/_lib/sw-quelle.test.ts
import { describe, it, expect } from "vitest";
import { RADIO_SW_ABRAEUM_QUELLE } from "./sw-quelle";

/**
 * DER ABRAEUM-WORKER (Spec 1 Kapitel 7 §7.1, `Spec:5635-5656`; Planteil 5, Aufgabe G5).
 *
 * ⛔ FAKE-`self` STATT jsdom, und das ist keine Bequemlichkeit: der Worker laeuft in
 * keinem DOM. Vorbild und Hausform ist `src/app/m/qr/_lib/sw-source.test.ts:167` —
 * `new Function("self", "caches", QUELLE)(...)` ist der einzige Weg, den AUSGELIEFERTEN
 * Quelltext wirklich auszufuehren statt eine zweite Abschrift zu pruefen.
 *
 * ⛔ UND DIE PARAMETERFORM IST DER GRUND, WARUM NODE 26 HIER NICHTS VERDECKT: `self` und
 * `caches` sind PARAMETER und verdecken jedes gleichnamige Global. Node bringt eigene
 * Web-Globals mit (`vitest.config.ts:54-87` beschreibt denselben Mechanismus fuer
 * `localStorage`); ein Test, der sich auf ihre Abwesenheit verliesse, waere rennabhaengig.
 *
 * ⛔ `waitUntil` WIRD GEDRAINT, BEVOR IRGENDETWAS GEPRUEFT WIRD. Der `activate`-Handler
 * haengt seine ganze Arbeit an das Event; ohne `drain` waere jede Zusage hier gruen oder
 * rot aus dem falschen Grund (Vorbild `qr/_lib/sw-source.test.ts:186-188`).
 */

/**
 * ⛔ DER GEMESSENE CACHE-NAME DES ALT-KIOSKS (E-G5). Gelesen an
 * `/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/public/sw.js:2`
 * (`const CACHE_NAME = 'radio-inventar-v1';`); es ist der EINZIGE Name der Alt-Anwendung,
 * geprueft ueber alle ELF `caches.`-Vorkommen jener Datei (`:20, 32, 36, 63, 71, 84, 91,
 * 92, 101, 107, 122`). Vorabscan-Fund 2 hat die Messung Zeile fuer Zeile bestaetigt.
 *
 * ⚠️ ER STEHT HIER ALS TESTWERT, NICHT IM WORKER. Der Worker loescht `caches.keys()` —
 * die Begruendung `Spec:5663-5666`: der Alt-Worker loeschte selbst nur FREMDE Namen, ueber
 * frueherer Staende auf dem jeweiligen Telefon sagt das nichts.
 */
const ALT_NAME = "radio-inventar-v1";

/**
 * Drei erfundene Namen, ⛔ KEINER PRAEFIX EINES ANDEREN (`Spec:5757`) — sonst bestuende ein
 * Worker mit `startsWith`-Filter die Breitenzusage.
 */
const DREI_FREMDE = ["alpha-cache", "zweiter-stand", "kiosk-2024"];

interface FakeEvent {
  waited: Promise<unknown>[];
  waitUntil(p: Promise<unknown>): void;
}

function starte(namen: string[] = DREI_FREMDE) {
  /** ⛔ EINE GEMEINSAME AUFRUFLISTE. Zwei getrennte Zaehler belegten die REIHENFOLGE nicht. */
  const aufrufe: string[] = [];
  const geloescht: string[] = [];
  const angemeldet: string[] = [];
  const listener = new Map<string, (e: FakeEvent) => void>();

  const self = {
    addEventListener: (typ: string, fn: (e: FakeEvent) => void) => {
      angemeldet.push(typ);
      listener.set(typ, fn);
    },
    skipWaiting: () => {
      aufrufe.push("skipWaiting");
      return Promise.resolve();
    },
    clients: {
      claim: () => {
        aufrufe.push("clients.claim");
        return Promise.resolve();
      },
    },
    registration: {
      unregister: () => {
        aufrufe.push("registration.unregister");
        return Promise.resolve(true);
      },
    },
  };

  const caches = {
    keys: () => Promise.resolve([...namen]),
    delete: (name: string) => {
      geloescht.push(name);
      return Promise.resolve(true);
    },
  };

  // RADIO_SW_ABRAEUM_QUELLE ist eine Konstante aus diesem Repo, nichts wird
  // hineininterpoliert (Form 1:1 aus `qr/_lib/sw-source.test.ts:165-167`).
  new Function("self", "caches", RADIO_SW_ABRAEUM_QUELLE)(self, caches);

  async function feuere(typ: string): Promise<void> {
    const event: FakeEvent = {
      waited: [],
      waitUntil(p) {
        event.waited.push(p);
      },
    };
    /*
     * ⛔ KEIN `?.` — GENAU DAS WAR DIE LEER-GRUEN-LUECKE (REVIEW-G5 W2, selbst nachgemessen).
     * Mit `listener.get(typ)?.(event)` geschah bei FEHLENDEM Listener nichts, `aufrufe` blieb
     * leer, und `expect(beimActivate.aufrufe).not.toContain("skipWaiting")` (`:186`) war wahr,
     * WEIL NICHTS ZU PRUEFEN DA WAR — die Klasse, die dieser Planteil jagt.
     * ⛔ GEMESSEN, NICHT VERMUTET: `"activate"` in `_lib/sw-quelle.ts:61` nach
     * `"XXaktivierenXX"` umbenannt ergab VOR dieser Zeile `4 failed | 1 passed (5)`, und der
     * einzige gruene Fall war eben jener. Die Zusicherung schliesst die Luecke fuer JEDEN
     * Aufrufer von `feuere`, nicht nur fuer den einen Fall.
     */
    const fn = listener.get(typ);
    expect(fn, `kein ${typ}-Listener angemeldet — der Fall waere leer-gruen`).toBeTypeOf(
      "function",
    );
    fn!(event);
    await Promise.all(event.waited);
  }

  return { aufrufe, geloescht, angemeldet, feuere };
}

describe("der Abraeum-Worker — drei Eigenschaften und kein Zeichen mehr", () => {
  it("der Abraeum-Worker registriert keinen fetch-Handler", async () => {
    /*
     * ⛔ `toEqual`, NICHT „enthaelt nicht fetch" (Bauform-Zulaessigkeitstafel Nr. 14,
     * `Spec:5667-5669`). Eine Negativzusage ueber EINEN Namen liesse einen `message`- oder
     * `push`-Handler durch; die Zusage lautet aber „dieser Worker beantwortet nichts".
     *
     * ⚠️ DER SCHADEN EINES `fetch`-HANDLERS WAERE DER ZWECK SELBST: der Worker soll den
     * Alt-Kiosk daran hindern, gecachte Oberflaeche auszuliefern. Ein eigener
     * `fetch`-Handler machte ihn zu genau dem, was er abloest.
     */
    const sw = starte();
    expect(sw.angemeldet).toEqual(["install", "activate"]);
  });

  it("er loescht ALLE Cache-Namen, nicht nur radio-inventar-v1", async () => {
    /*
     * DIE BREITE (`Spec:5663-5666`). Ein Worker, der nur `radio-inventar-v1` raeumte,
     * liesse den Cache eines Alt-Alt-Standes stehen — und dieser Origin gehoert ab jetzt
     * der Suite.
     * ⛔ DIESER FALL UND DER NAECHSTE MESSEN VERSCHIEDENES; die Trennung ist erst durch
     * Sonde S-G5b falsifizierbar (E-G5).
     */
    const sw = starte(DREI_FREMDE);
    await sw.feuere("activate");
    expect([...sw.geloescht].sort()).toEqual([...DREI_FREMDE].sort());
  });

  it("er loescht auch den gemessenen Alt-Namen radio-inventar-v1", async () => {
    /*
     * DIE TREFFSICHERHEIT (E-G5). ⛔ DIESER FALL SICHERT GENAU EINE SACHE ZU — dass der
     * gemessene Alt-Name unter den geloeschten ist. Wuerde er zusaetzlich die Breite
     * behaupten, wuerde er unter Sonde S-G5b MIT rot, und das Sondenpaar bewiese nichts.
     */
    const sw = starte([ALT_NAME, ...DREI_FREMDE]);
    await sw.feuere("activate");
    expect(sw.geloescht).toContain(ALT_NAME);
  });

  it("er beansprucht die Clients und traegt sich danach aus", async () => {
    /*
     * ⛔ `clients.claim()` VOR `registration.unregister()` (`Spec:5667-5669`). Umgekehrt
     * waere der Worker abgemeldet, bevor er die offenen Seiten uebernimmt — die Geraete,
     * die nie neu geladen haben, blieben genau die, die er erreichen soll.
     * ⛔ UEBER EINE GEMEINSAME AUFRUFLISTE: zwei getrennte Zaehler bewiesen die
     * Reihenfolge nicht, sie bewiesen nur, dass beides passiert ist.
     * ⚠️ Die drei `caches.delete`-Aufrufe stehen bewusst NICHT in dieser Liste — ihre
     * Reihenfolge haengt an der Auswertung von `Promise.all(namen.map(...))` und ist keine
     * Zusage dieses Falls.
     */
    const sw = starte();
    await sw.feuere("activate");
    expect(sw.aufrufe).toEqual(["clients.claim", "registration.unregister"]);
  });

  it("skipWaiting steht im install-Handler, nicht im activate-Handler", async () => {
    /*
     * Sonst uebernaehme der Worker die Kontrolle erst nach einem ZWEITEN Ladevorgang — und
     * das Fenster, in dem der Alt-Worker noch ausliefert, bliebe offen.
     * ⛔ BEIDE RICHTUNGEN, an ZWEI frischen Instanzen: `install` ruft es, `activate` nicht.
     * Nur die erste Haelfte waere gegen ein zusaetzliches `skipWaiting()` im
     * `activate`-Zweig blind.
     */
    const beimInstall = starte();
    await beimInstall.feuere("install");
    expect(beimInstall.aufrufe).toEqual(["skipWaiting"]);

    const beimActivate = starte();
    await beimActivate.feuere("activate");
    expect(beimActivate.aufrufe).not.toContain("skipWaiting");
  });
});
