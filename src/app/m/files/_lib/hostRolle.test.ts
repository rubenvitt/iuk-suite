import { afterEach, describe, expect, it, vi } from "vitest";
import { validateHostConfig } from "@/core/hosts";
import {
  hostFuerRolle,
  oeffentlicheUrl,
  requireRolle,
  resolveRole,
  rolleOderNull,
  validateFilesHosts,
} from "./hostRolle";

/*
 * WAS DIESE DATEI BESITZT (Spec §3.2, §3.3, Plan T9):
 *
 *  - Host → Rolle, mit Port und Grossschreibung normalisiert,
 *  - die Arbeitsteilung der drei Namen: `resolveRole` wirft, `rolleOderNull`
 *    wirft NIE (Route Handler bauen ihre 404 selbst), `requireRolle` wirft bei
 *    der falschen Rolle,
 *  - „Host aus der ROLLE, Protokoll und Port aus dem REQUEST" — die Zusage, an
 *    der ein GEDRUCKTER Code haengt,
 *  - die vier Urteile der Boot-Pruefung.
 *
 * Was sie NICHT besitzt: dass die Pruefung beim Boot auch gerufen wird (T22)
 * und dass die zwei Dev-/E2E-Hosts gesetzt sind (T14). Beides sind fremde
 * Dateien.
 */

const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";

/**
 * `notFound()` wirft in Next 16 einen Fehler, dessen Nachricht UND `digest`
 * genau dieser String ist (am Testlauf gemessen, nicht geraten). Auf ihn zu
 * pruefen statt auf `toThrow()` allein unterscheidet die 404 von einem
 * beliebigen `throw new Error(...)` — sonst blieben die Faelle gruen, wenn
 * jemand `notFound()` gegen einen Wurf mit eigener Meldung tauscht.
 */
const NICHT_GEFUNDEN = /NEXT_HTTP_ERROR_FALLBACK;404/;

/** Der Zustand nach dem Cutover (und ab T14 in Dev/E2E): beide Rollen belegt. */
function zweiHosts(): void {
  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
}

function kopf(host: string, weitere: Record<string, string> = {}): Headers {
  return new Headers({ host, ...weitere });
}

afterEach(() => vi.unstubAllEnvs());

describe("resolveRole: Host → Rolle, genau diese eine Aufgabe", () => {
  it("beide Hosts liefern ihre Rolle — mit Port und in Grossschreibung", () => {
    zweiHosts();
    expect(resolveRole(kopf(VERWALTUNG))).toBe("verwaltung");
    expect(resolveRole(kopf(INBOX))).toBe("inbox");
    // E2E laeuft auf 3100, Dev auf 3000 — ohne Port-Abschnitt traefe hier nichts.
    expect(resolveRole(kopf(`${VERWALTUNG}:3100`))).toBe("verwaltung");
    expect(resolveRole(kopf(`${INBOX}:3000`))).toBe("inbox");
    // Hostnamen sind case-insensitiv; `moduleForHost` normalisiert genauso.
    expect(resolveRole(kopf("FILES.LOCALTEST.ME:3100"))).toBe("verwaltung");
    expect(resolveRole(kopf("Drop.Localtest.Me"))).toBe("inbox");
  });

  it("die Reihenfolge in SUITE_HOST_FILES traegt die Rolle — vertauscht, vertauschen sich die Rollen", () => {
    // Das ist der Grund, warum es EINE Variable ist und keine zwei (§3.1).
    vi.stubEnv("SUITE_HOST_FILES", `${INBOX},${VERWALTUNG}`);
    expect(resolveRole(kopf(INBOX))).toBe("verwaltung");
    expect(resolveRole(kopf(VERWALTUNG))).toBe("inbox");
  });

  it("liest den Host ueber resolveHost — x-forwarded-host hat Vorrang vor host", () => {
    // Nach dem Rewrite der Middleware traegt `host` die interne Adresse; der
    // echte Host steht nur in `x-forwarded-host` (core/routing.ts:14-35).
    zweiHosts();
    expect(
      resolveRole(kopf("localhost:3000", { "x-forwarded-host": `${INBOX}:3100` })),
    ).toBe("inbox");
  });

  it("unbekannter Host wirft 404 — kein 403, die Existenz wird nicht verraten", () => {
    zweiHosts();
    expect(() => resolveRole(kopf("fremd.example.com"))).toThrow(NICHT_GEFUNDEN);
    expect(() => resolveRole(kopf(""))).toThrow(NICHT_GEFUNDEN);
  });

  it("ohne gesetzte Hosts gehoert kein Host zu einer Rolle", () => {
    // Der Zustand vor dem Cutover. Ein `*.localtest.me`-Sonderfall in
    // resolveRole waere eine ZWEITE Hostauflösung neben prodHostsFor — genau
    // die, die spaeter von hostFuerRolle abweicht (§3.2).
    vi.stubEnv("SUITE_HOST_FILES", "");
    expect(() => resolveRole(kopf(VERWALTUNG))).toThrow(NICHT_GEFUNDEN);
  });
});

describe("rolleOderNull: dieselbe Auflösung OHNE Wurf — die Form fuer Route Handler", () => {
  it("liefert null statt zu werfen", () => {
    zweiHosts();
    expect(rolleOderNull(kopf("fremd.example.com"))).toBeNull();
    expect(() => rolleOderNull(kopf("fremd.example.com"))).not.toThrow();
    expect(rolleOderNull(kopf(""))).toBeNull();
  });

  it("liefert fuer bekannte Hosts dieselbe Rolle wie resolveRole", () => {
    zweiHosts();
    for (const host of [VERWALTUNG, `${INBOX}:3100`, "FILES.LOCALTEST.ME"]) {
      expect(rolleOderNull(kopf(host))).toBe(resolveRole(kopf(host)));
    }
  });
});

describe("requireRolle: die Rollensperre fuer Layouts und Seiten", () => {
  it("laesst die passende Rolle durch und wirft bei der anderen", () => {
    zweiHosts();
    expect(() => requireRolle("inbox", kopf(INBOX))).not.toThrow();
    expect(() => requireRolle("inbox", kopf(VERWALTUNG))).toThrow(NICHT_GEFUNDEN);
    expect(() => requireRolle("verwaltung", kopf(VERWALTUNG))).not.toThrow();
    expect(() => requireRolle("verwaltung", kopf(INBOX))).toThrow(NICHT_GEFUNDEN);
  });

  it("wirft auch bei einem Host, der zu keiner Rolle gehoert", () => {
    zweiHosts();
    expect(() => requireRolle("verwaltung", kopf("fremd.example.com"))).toThrow(
      NICHT_GEFUNDEN,
    );
  });
});

describe("hostFuerRolle: Rolle → Host, immer ueber prodHostsFor", () => {
  it("liefert die konfigurierten Hosts in Rollenreihenfolge", () => {
    // Diese Zusage ist die einzige, die den Griff auf `mod.prodHosts` direkt
    // faengt: die Registry fuehrt `files` mit `prodHosts: []`, also waeren
    // beide Bauformen im NULL-Fall unten nicht zu unterscheiden.
    zweiHosts();
    expect(hostFuerRolle("verwaltung")).toBe(VERWALTUNG);
    expect(hostFuerRolle("inbox")).toBe(INBOX);
  });

  it("liefert null, solange die Rolle keinen Host hat — der Zustand vor dem Cutover", () => {
    vi.stubEnv("SUITE_HOST_FILES", "");
    expect(hostFuerRolle("verwaltung")).toBeNull();
    expect(hostFuerRolle("inbox")).toBeNull();
  });

  it("bei nur einem Host fehlt der Inbox-Rolle ihrer — deshalb bricht der Boot ab", () => {
    vi.stubEnv("SUITE_HOST_FILES", VERWALTUNG);
    expect(hostFuerRolle("verwaltung")).toBe(VERWALTUNG);
    expect(hostFuerRolle("inbox")).toBeNull();
  });
});

describe("oeffentlicheUrl: Host aus der ROLLE, Protokoll und Port aus dem REQUEST", () => {
  it("auf dem VERWALTUNGS-Host erzeugt ein Inbox-Link den INBOX-Host", () => {
    // Die nicht-triviale Richtung (§3.4): der Abgabelink wird in der Verwaltung
    // angelegt, muss aber die Inbox-Domain tragen. Aus der Request-Origin
    // gebaut trueg er `files.…`, funktionierte sofort und waere beim Abschalten
    // eines Hosts Altpapier. Gedruckt ist gedruckt.
    zweiHosts();
    expect(
      oeffentlicheUrl("inbox", "/u/dz-2345-6789-abcd", kopf(VERWALTUNG, {
        "x-forwarded-proto": "https",
      })),
    ).toBe(`https://${INBOX}/u/dz-2345-6789-abcd`);
  });

  it("traegt der Request-Host einen Port, traegt ihn der erzeugte Link auch", () => {
    // SUITE_HOST_* darf keinen Port tragen (hosts.ts:78-86), E2E laeuft aber auf
    // 3100. Ohne diese Regel lautete der Link `http://drop.localtest.me/u/x`
    // und waere lokal unerreichbar — der ganze Zweihost-Aufbau waere unpruefbar.
    zweiHosts();
    expect(oeffentlicheUrl("inbox", "/u/x", kopf(`${VERWALTUNG}:3100`))).toBe(
      `http://${INBOX}:3100/u/x`,
    );
    // Und der Port kommt aus derselben Auflösung wie der Host: x-forwarded-host
    // vor host. Nach dem Rewrite traegt `host` nur `localhost:3000`.
    expect(
      oeffentlicheUrl("inbox", "/u/x", kopf("localhost:3000", {
        "x-forwarded-host": `${VERWALTUNG}:3100`,
      })),
    ).toBe(`http://${INBOX}:3100/u/x`);
  });

  it("ohne x-forwarded-proto ist das Protokoll http, bei einer Kommaliste gilt der erste Wert", () => {
    zweiHosts();
    expect(oeffentlicheUrl("verwaltung", "/s/abc", kopf(VERWALTUNG))).toBe(
      `http://${VERWALTUNG}/s/abc`,
    );
    expect(
      oeffentlicheUrl("verwaltung", "/s/abc", kopf(VERWALTUNG, {
        "x-forwarded-proto": "https, http",
      })),
    ).toBe(`https://${VERWALTUNG}/s/abc`);
  });

  it("wirft, wenn die Rolle keinen Host hat — der Aufrufer muss den Zustand vorher abfragen", () => {
    vi.stubEnv("SUITE_HOST_FILES", "");
    expect(() => oeffentlicheUrl("inbox", "/u/x", kopf(VERWALTUNG))).toThrow(/inbox/);
    // Und es ist KEINE 404: hier liegt ein Konfigurationsfehler vor, keine
    // Anfrage auf dem falschen Host.
    expect(() => oeffentlicheUrl("inbox", "/u/x", kopf(VERWALTUNG))).not.toThrow(
      NICHT_GEFUNDEN,
    );
  });
});

describe("validateFilesHosts: die vier Urteile aus §3.3", () => {
  const mit = (wert?: string): string[] =>
    validateFilesHosts(wert === undefined ? {} : { SUITE_HOST_FILES: wert });

  it("0 Hosts sind ERLAUBT — „kein Cutover“ ist eine sinnvolle Aussage", () => {
    // Ohne diesen Fall waere das Modul vor dem ersten Cutover nicht bootfaehig,
    // und zwar die ganze Suite mit.
    expect(mit()).toEqual([]);
    expect(mit("")).toEqual([]);
  });

  it("1 Host bricht ab — eine Rolle haette keinen Host", () => {
    expect(mit(VERWALTUNG)).toHaveLength(1);
    expect(mit(VERWALTUNG)[0]).toContain("SUITE_HOST_FILES");
    // Die Meldung raet NICHT, welche Rolle fehlt: der Code kann es nicht wissen.
    // Deshalb ist sie fuer beide Einzelhosts dieselbe.
    expect(mit(VERWALTUNG)).toEqual(mit(INBOX));
  });

  it("2 verschiedene Hosts sind erlaubt — beide Rollen sind belegt", () => {
    expect(mit(`${VERWALTUNG},${INBOX}`)).toEqual([]);
  });

  it("2 GLEICHE Hosts brechen ab — und der Suite-Kern sieht diesen Fall NICHT", () => {
    const fehler = mit(`${VERWALTUNG},${VERWALTUNG}`);
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain(VERWALTUNG);
    /*
     * Die Gegenprobe ist der Grund, warum diese Pruefung ueberhaupt existiert:
     * `claimedBy` in validateHostConfig meldet nur, wenn `other !== key`
     * (hosts.ts:87-94) — eine Doppelung INNERHALB eines Moduls faellt dort
     * durch, und beide Rollen zeigten still auf denselben Host. Waere der Kern
     * eines Tages strenger, meldete dieser Fall zweimal, und die Zeile hier
     * wuerde rot statt still ueberfluessig zu werden.
     */
    expect(
      validateHostConfig(["files"], { SUITE_HOST_FILES: `${VERWALTUNG},${VERWALTUNG}` }),
    ).toEqual([]);
  });

  it("drei oder mehr Hosts brechen ab — es gibt nur zwei Rollen", () => {
    expect(mit(`${VERWALTUNG},${INBOX},drittes.example.com`)).toHaveLength(1);
    expect(mit(`a.example,b.example,c.example,d.example`)).toHaveLength(1);
  });

  it("ohne Argument liest sie process.env", () => {
    zweiHosts();
    expect(validateFilesHosts()).toEqual([]);
    vi.stubEnv("SUITE_HOST_FILES", VERWALTUNG);
    expect(validateFilesHosts()).toHaveLength(1);
  });
});
