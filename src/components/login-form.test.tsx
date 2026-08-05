// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount, submitForm } from "@/app/m/qr/_lib/test-dom";

/**
 * DIE WEICHE DES DEV-LOGINS — `login-form.tsx`, das `window.location.assign`
 * nach `signIn("dev-login", { redirect: false })`.
 *
 * Warum es diese Datei gibt (Betreiberentscheidung B3 zu Vorab-Scan-Befund 14,
 * Uebergabe Teil 2 Punkt 3b): die Weiche lautete
 * `callbackUrl.startsWith("/") ? callbackUrl : "/"`. Sie hatte damit ZWEI
 * Defekte gleichzeitig, und beide sind still:
 *
 *  1. Jeder ABSOLUTE `callbackUrl` wurde verworfen — auch einer auf einen Host
 *     der eigenen Suite. Der Verwaltungsknopf des Lagerbuch-Gates traegt genau
 *     so einen Wert, und der Weg vom Gate in die Verwaltung fuehrte damit in
 *     jeder Dev- und E2E-Umgebung auf die Wurzel statt ans Ziel.
 *  2. `"//boese.example/".startsWith("/")` ist `true`. Ein protokoll-relativer
 *     Wert kam durch, und der Browser liest ihn als FREMDE Origin — eine offene
 *     Weiterleitung mitten im Anmeldeweg.
 *
 * Die Reparatur darf deshalb NICHT „einfach `callbackUrl` durchreichen" sein:
 * das waere die Schwachstelle, nicht ihre Behebung. Geprueft wird gegen die
 * Allowlist der Suite (`suiteRedirect`, `core/auth/redirect.ts`), also gegen
 * dieselbe Quelle, die der Auth.js-Umschreiber benutzt.
 */

const signInMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const suchparameter = vi.hoisted(() => ({ wert: new URLSearchParams() }));

vi.mock("next-auth/react", () => ({ signIn: signInMock }));
vi.mock("next/navigation", () => ({ useSearchParams: () => suchparameter.wert }));

import { LoginForm } from "@/components/login-form";

/**
 * Der Host, auf dem der Login LAEUFT. Bewusst ein anderer als der Suite-Host in
 * der Zusage „absolut auf einen bekannten Suite-Host" weiter unten: waeren
 * beide gleich, truege dort schon `target.host === base.host`
 * (`redirect.ts:53`) den Test — die Allowlist waere ersatzlos entfernbar, und
 * der Test bliebe gruen. Genau diese Klasse ist Regel 2.
 */
const ORIGIN = "http://lagerbuch.localtest.me:3100";
/** Ein ZWEITER, echter Suite-Host (`moduleForHost` kennt `<key>.localtest.me`). */
const ANDERER_SUITE_HOST = "http://portal.localtest.me:3100";

/*
 * Befund 17 der Vorab-Analyse: `vi.spyOn(window.location, "assign")` WIRFT
 * unter jsdom 26 — `assign` ist per WebIDL `[LegacyUnforgeable]`, also nicht
 * konfigurierbar. `window.location` SELBST ist konfigurierbar; derselbe Weg,
 * den `_ui/BarcodeScanner.test.tsx` bereits faehrt.
 *
 * Anders als dort sind die Felder hier NICHT von der echten Location kopiert,
 * sondern kohaerent auf ORIGIN gesetzt: `suiteRedirect` parst
 * `window.location.origin` als `baseUrl`, der Wert ist also Pruefgegenstand und
 * nicht Kulisse.
 */
let zugewiesen: string[] = [];
/** Reihenfolge der Seiteneffekte — traegt die Zusage „erst anmelden, dann navigieren". */
let ablauf: string[] = [];
const echteLocationBeschreibung = Object.getOwnPropertyDescriptor(window, "location")!;
const ziel = new URL(ORIGIN + "/login");

beforeEach(() => {
  zugewiesen = [];
  ablauf = [];
  signInMock.mockClear();
  signInMock.mockImplementation(async () => { ablauf.push("signIn"); });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      assign: (u: string | URL) => { zugewiesen.push(String(u)); ablauf.push("assign"); },
      replace: () => {},
      reload: () => {},
      href: ziel.href, origin: ziel.origin, protocol: ziel.protocol, host: ziel.host,
      hostname: ziel.hostname, port: ziel.port, pathname: ziel.pathname,
      search: ziel.search, hash: ziel.hash,
      toString: () => ziel.href,
    },
  });
});

afterEach(async () => {
  await unmount();
  Object.defineProperty(window, "location", echteLocationBeschreibung);
});

/** Dev-Login mit gegebenem `?callbackUrl=` absenden; liefert alle Navigationen. */
async function absenden(callbackUrl: string): Promise<string[]> {
  suchparameter.wert = new URLSearchParams({ callbackUrl });
  await mount(<LoginForm devLogin />);
  await submitForm("form");
  return zugewiesen;
}

describe("Dev-Login: das Navigationsziel nach dem Absenden", () => {
  // Bestandsverhalten. Es bleibt auch unter der alten Weiche gruen — das ist
  // Absicht: der Test sichert zu, dass die Reparatur den einzigen Fall, der
  // vorher funktionierte, nicht mitnimmt.
  it("nimmt einen relativen Pfad an", async () => {
    expect(await absenden("/verwaltung")).toEqual([`${ORIGIN}/verwaltung`]);
  });

  // Der Fall, um den es geht: der Verwaltungsknopf des Gates ist ein
  // HOST-WECHSEL und traegt deshalb ein absolutes Ziel.
  it("nimmt eine absolute URL auf einen bekannten Suite-Host an — auf einem ANDEREN Host als dem eigenen", async () => {
    expect(await absenden(`${ANDERER_SUITE_HOST}/m/portal`)).toEqual([
      `${ANDERER_SUITE_HOST}/m/portal`,
    ]);
  });

  // Die Form, die `_lib/zugang.ts:254` (`verwaltungsZiel(kopf)`) tatsaechlich
  // baut: absolut, aber auf DEM Host, auf dem der Login gerade laeuft — der Weg,
  // den T87 in E2E faehrt.
  //
  // NACHGEMESSEN, nicht angenommen: dieser Fall ist DOPPELT gedeckt. Weder das
  // Entfernen von `target.host === base.host` (`redirect.ts:53`) noch das
  // Entfernen der `moduleForHost`-Allowlist (`:54`) macht ihn allein rot — erst
  // beide zusammen. Die Zusage darueber haengt dagegen an `:54` ALLEIN (der Host
  // ist dort ein anderer als die eigene Origin). Die beiden sind also keine
  // Kopie voneinander: die eine haelt die Allowlist, diese die Zusicherung, dass
  // das E2E-Ziel ueberhaupt ankommt.
  it("nimmt eine absolute URL auf den EIGENEN Host an", async () => {
    expect(await absenden(`${ORIGIN}/verwaltung`)).toEqual([`${ORIGIN}/verwaltung`]);
  });

  // Der Sicherheitsriegel. `http`, nicht `https`: gleiches Protokoll wie ORIGIN,
  // damit die Abweisung von der HOST-Allowlist getragen wird und nicht schon
  // vom Protokollvergleich (`redirect.ts:52`).
  it("verwirft eine absolute URL auf einen fremden Host", async () => {
    expect(await absenden("http://boese.example/uebernahme")).toEqual([ORIGIN]);
  });

  // Die BESTEHENDE Luecke der alten Weiche: beginnt mit „/" und kaeme durch,
  // ist fuer den Browser aber eine fremde Origin.
  it("verwirft einen protokoll-relativen Wert", async () => {
    expect(await absenden("//boese.example/")).toEqual([ORIGIN]);
  });

  // Gegen die naheliegende „Reparatur" `window.location.assign(callbackUrl)`.
  it("verwirft javascript:-artige Schemata", async () => {
    expect(await absenden("javascript:alert(1)")).toEqual([ORIGIN]);
  });

  // Die Weiche sitzt NACH dem Anmeldeversuch: waere es umgekehrt, navigierte
  // der Browser weg, bevor das Sitzungscookie aus der Antwort gesetzt ist.
  it("meldet erst an, dann navigiert es", async () => {
    await absenden("/verwaltung");
    expect(ablauf).toEqual(["signIn", "assign"]);
    expect(signInMock.mock.calls[0][0]).toBe("dev-login");
    expect(signInMock.mock.calls[0][1]).toMatchObject({ redirect: false });
  });
});
