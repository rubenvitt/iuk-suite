import { describe, it, expect, vi, afterEach } from "vitest";

// `notFound()` wirft in der echten Laufzeit einen Next-internen Fehler. Fuer die
// Unit-Aussage genuegt ein erkennbarer Wurf — geprueft wird, DASS geworfen wird.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { istLagerbuchHost, requireLagerbuchHost, lagerbuchHostOderNull } from "./host";

const kopf = (h: Record<string, string>) => new Headers(h);
const alterWert = process.env.SUITE_HOST_LAGERBUCH;
afterEach(() => {
  if (alterWert === undefined) delete process.env.SUITE_HOST_LAGERBUCH;
  else process.env.SUITE_HOST_LAGERBUCH = alterWert;
});

describe("istLagerbuchHost", () => {
  it("trifft den Dev-Host OHNE jede Env", () => {
    // Genau dieser Fall macht den „kein Prod-Host konfiguriert → durchlassen"-Zweig
    // ueberfluessig: moduleForHost trifft <key>.localtest.me VOR und UNABHAENGIG
    // von prodHostsFor. Damit laeuft in Dev, E2E und Produktion derselbe Code-Pfad.
    delete process.env.SUITE_HOST_LAGERBUCH;
    expect(istLagerbuchHost(kopf({ host: "lagerbuch.localtest.me" }))).toBe(true);
  });

  it("trifft den konfigurierten Prod-Host", () => {
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de";
    expect(istLagerbuchHost(kopf({ host: "lagerbuch.iuk-ue.de" }))).toBe(true);
  });

  it("weist einen FREMDEN Suite-Host ab", () => {
    expect(istLagerbuchHost(kopf({ host: "feedback.localtest.me" }))).toBe(false);
    expect(istLagerbuchHost(kopf({ host: "iuk-ue.de" }))).toBe(false);
  });

  it("bevorzugt x-forwarded-host vor host — die Vorrangregel aus core/routing", () => {
    // Nach dem Rewrite der Middleware ist das die einzig richtige Reihenfolge. Eine
    // zweite Aufloesung waere der Ort, an dem beide auseinanderlaufen; deshalb wird
    // `resolveHost` wiederverwendet, nicht nachgebaut.
    expect(istLagerbuchHost(kopf({
      "x-forwarded-host": "lagerbuch.localtest.me", host: "feedback.localtest.me",
    }))).toBe(true);
    expect(istLagerbuchHost(kopf({
      "x-forwarded-host": "feedback.localtest.me", host: "lagerbuch.localtest.me",
    }))).toBe(false);
  });

  it("ignoriert einen Port", () => {
    expect(istLagerbuchHost(kopf({ host: "lagerbuch.localtest.me:3000" }))).toBe(true);
  });

  it("hat KEINEN 'kein Prod-Host konfiguriert → durchlassen'-Zweig", () => {
    // Er waere die Sperre, die sich selbst abschaltet: solange SUITE_HOST_LAGERBUCH
    // fehlt, waere genau der Zustand offen, gegen den die Datei gebaut ist.
    delete process.env.SUITE_HOST_LAGERBUCH;
    expect(istLagerbuchHost(kopf({ host: "irgendwas.example.org" }))).toBe(false);
  });
});

describe("requireLagerbuchHost — fuer LAYOUTS UND SEITEN, erste Anweisung", () => {
  it("laesst den eigenen Host durch", () => {
    expect(() => requireLagerbuchHost(kopf({ host: "lagerbuch.localtest.me" }))).not.toThrow();
  });

  it("wirft auf fremdem Host — notFound(), KEIN 403", () => {
    // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten
    // (docs/design/README.md:237-242).
    expect(() => requireLagerbuchHost(kopf({ host: "feedback.localtest.me" })))
      .toThrow("NEXT_NOT_FOUND");
  });
});

describe("lagerbuchHostOderNull — fuer ROUTE HANDLER", () => {
  it("wirft NIE", () => {
    // Ein notFound() ist keine brauchbare Antwort auf einen gescannten QR-Code;
    // der Handler baut seine 404 selbst.
    expect(lagerbuchHostOderNull(kopf({ host: "lagerbuch.localtest.me" }))).toBe("lagerbuch");
    expect(lagerbuchHostOderNull(kopf({ host: "feedback.localtest.me" }))).toBeNull();
    expect(lagerbuchHostOderNull(kopf({}))).toBeNull();
  });
});
