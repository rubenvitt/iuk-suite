import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

// `notFound()` wirft in der echten Laufzeit einen Next-internen Fehler. Fuer die
// Unit-Aussage genuegt ein erkennbarer Wurf — geprueft wird, DASS geworfen wird.
// Zeichengleich zu `lagerbuch/_lib/host.test.ts:3-7`.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { istRadioHost, requireRadioHost, radioHostOderNull } from "./host";
import { hostAbweisung } from "./hostRiegel";

const kopf = (h: Record<string, string>) => new Headers(h);
const anfrage = (h: Record<string, string>) => new Request("https://beliebig.example/x", { headers: h });

/**
 * ⚠️ DIE TESTSUITE SIEHT DIE PROZESSUMGEBUNG, NICHT `.env.local` — gemessen, nicht
 * angenommen: in diesem Repo laedt vitest KEINE `.env`-Datei (kein `dotenv` in
 * `vitest.config.ts`, `vitest.setup.ts` oder `package.json`). Ein lokal in `.env.local`
 * gesetztes `SUITE_HOST_RADIO` verfaelscht damit kein Tor — ein in der Shell oder in der
 * CI EXPORTIERTER Wert dagegen schon.
 *
 * Deshalb loescht `beforeEach` die Variable VOR jedem Fall, statt sich darauf zu
 * verlassen, dass der vorige Fall aufgeraeumt hat: sonst laufen die Faelle, die keinen
 * Prod-Host setzen, unter dem Wert, den die aufrufende Shell zufaellig exportiert hat.
 * `afterEach` stellt den Ausgangszustand des Prozesses wieder her.
 */
const alterWert = process.env.SUITE_HOST_RADIO;
beforeEach(() => {
  delete process.env.SUITE_HOST_RADIO;
});
afterEach(() => {
  if (alterWert === undefined) delete process.env.SUITE_HOST_RADIO;
  else process.env.SUITE_HOST_RADIO = alterWert;
});

describe("istRadioHost", () => {
  it("trifft den Dev-Host OHNE jede Env", () => {
    // Genau dieser Fall macht den „kein Prod-Host konfiguriert -> durchlassen"-Zweig
    // ueberfluessig: moduleForHost trifft <key>.localtest.me VOR und UNABHAENGIG von
    // prodHostsFor (registry.ts:246-253). Damit laeuft in Dev, E2E und Produktion
    // derselbe Code-Pfad.
    //
    // ⚠️ IN DER MUTATIONSDECKUNG TRAEGT IHN HEUTE FALL 6 MIT („ignoriert einen Port"): kein
    // gefahrener Eingriff faerbt diesen Fall ALLEIN rot, waehrend Fall 6 einen eigenen hat
    // (Rumpf -> Vergleich gegen die Zeichenkette radio.localtest.me). Er bleibt trotzdem
    // stehen — Spec:712 verlangt „trifft radio.localtest.me OHNE gesetzte Env" namentlich als
    // Mindestzusicherung, und ein Gegenbeispiel macht ihn nicht zum eigenstaendigen Riegel.
    // Das Env-Loeschen leistet das beforeEach oben (kein zweites hier, es waere tot).
    expect(istRadioHost(kopf({ host: "radio.localtest.me" }))).toBe(true);
  });

  it("trifft den konfigurierten Prod-Host", () => {
    process.env.SUITE_HOST_RADIO = "radio.iuk-ue.de";
    expect(istRadioHost(kopf({ host: "radio.iuk-ue.de" }))).toBe(true);
  });

  it("weist einen FREMDEN Suite-Host ab — auch den, der iuk-ue.de per prodHosts fuehrt", () => {
    // `iuk-ue.de` ist der einzige Host, der im REGISTRY-CODE steht (portal,
    // registry.ts:59) — und damit der einzige, den validateHostConfig als Kollision NICHT
    // sehen wuerde (core/hosts.ts:65-99 fuellt seine Karte nur aus envHostsFor). Er
    // gehoert deshalb namentlich in diesen Fall.
    expect(istRadioHost(kopf({ host: "lagerbuch.localtest.me" }))).toBe(false);
    expect(istRadioHost(kopf({ host: "iuk-ue.de" }))).toBe(false);
  });

  it("bevorzugt x-forwarded-host vor host — die Vorrangregel aus core/routing", () => {
    // Nach dem Rewrite der Middleware ist das die einzig richtige Reihenfolge. Eine
    // zweite Aufloesung waere der Ort, an dem beide auseinanderlaufen; deshalb wird
    // `resolveHost` wiederverwendet, nicht nachgebaut (routing.ts:14-35).
    expect(istRadioHost(kopf({
      "x-forwarded-host": "radio.localtest.me", host: "lagerbuch.localtest.me",
    }))).toBe(true);
    expect(istRadioHost(kopf({
      "x-forwarded-host": "lagerbuch.localtest.me", host: "radio.localtest.me",
    }))).toBe(false);
  });

  it("nimmt aus einer Kommaliste den ERSTEN Wert", () => {
    // routing.ts:25-27: der erste Wert ist der urspruengliche Client-Host, der Rest sind
    // Zwischenstationen. Ein Proxy, der anhaengt, darf den Riegel nicht kippen.
    expect(istRadioHost(kopf({ "x-forwarded-host": "radio.localtest.me, proxy.intern" }))).toBe(true);
    expect(istRadioHost(kopf({ "x-forwarded-host": "proxy.intern, radio.localtest.me" }))).toBe(false);
  });

  it("ignoriert einen Port", () => {
    expect(istRadioHost(kopf({ host: "radio.localtest.me:3000" }))).toBe(true);
  });

  it("hat KEINEN 'kein Prod-Host konfiguriert -> durchlassen'-Zweig", () => {
    // Er waere die Sperre, die sich selbst abschaltet: solange SUITE_HOST_RADIO fehlt —
    // und VOR DEM CUTOVER FEHLT SIE —, waere genau der Zustand offen, gegen den die Datei
    // gebaut ist (Spec §1.4.5, Zeilen 609-635). Das Env-Loeschen leistet das beforeEach oben.
    expect(istRadioHost(kopf({ host: "irgendwas.example.org" }))).toBe(false);
    expect(istRadioHost(kopf({}))).toBe(false);
  });
});

describe("requireRadioHost — fuer LAYOUTS UND SEITEN, erste Anweisung", () => {
  it("laesst den eigenen Host durch", () => {
    expect(() => requireRadioHost(kopf({ host: "radio.localtest.me" }))).not.toThrow();
  });

  it("wirft auf fremdem Host — notFound(), KEIN 403", () => {
    // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten. `radio` hat
    // dafuer einen eigenen Anlass: hinter /admin liegen Klarnamen samt Bewegungshistorie
    // und die Enrollment-Codes (docs/radio-portierung-analyse.md:979-997).
    expect(() => requireRadioHost(kopf({ host: "lagerbuch.localtest.me" })))
      .toThrow("NEXT_NOT_FOUND");
  });
});

describe("radioHostOderNull — fuer ROUTE HANDLER", () => {
  it("wirft NIE", () => {
    // Ein notFound() ist keine brauchbare Antwort auf einen GESCANNTEN QR-Code; der
    // Handler baut seine 404 selbst (Spec:500/525-527).
    expect(radioHostOderNull(kopf({ host: "radio.localtest.me" }))).toBe("radio");
    expect(radioHostOderNull(kopf({ host: "lagerbuch.localtest.me" }))).toBeNull();
    expect(radioHostOderNull(kopf({}))).toBeNull();
  });
});

describe("hostAbweisung — die vierte Form (B13), fuer Handler mit eigenem Content-Type", () => {
  it("gibt auf dem eigenen Host null zurueck — damit `??` den rechten Zweig nimmt", () => {
    expect(hostAbweisung(anfrage({ host: "radio.localtest.me" }))).toBeNull();
  });

  it("gibt auf fremdem Host eine FERTIGE 404 zurueck, statt zu werfen", async () => {
    const antwort = hostAbweisung(anfrage({ host: "iuk-ue.de" }));
    expect(antwort).not.toBeNull();
    expect(antwort!.status).toBe(404);
    // Koerper UND Content-Type sind bewusst Text: eine HTML-Fehlerseite meldete dem Browser
    // „manifest fetch failed" statt einer sauberen Abweisung (Spec:544-546). Genau diese
    // Eigenschaft ist der Daseinsgrund der vierten Riegelform (hostRiegel.ts, Kopf) — sie
    // gehoert deshalb zugesichert, nicht nur begruendet.
    //
    // ⛔ POSITIV formuliert, nicht als `not.toContain("text/html")`: die verneinende Form
    // waere auch ueber einem FEHLENDEN Header wahr (der Getter liefert dann `null`) und damit
    // die still-gruene Gestalt, gegen die dieser Bauweg antritt. Der Wert kommt heute von
    // undici, nicht von uns — gemessen: `text/plain;charset=UTF-8` fuer einen String-Koerper;
    // deshalb bindet das Muster am Anfang und nicht an der ganzen Zeichenkette.
    expect(antwort!.headers.get("content-type"), "keine HTML-Fehlerseite auf /sw.js")
      .toMatch(/^text\/plain/);
    await expect(antwort!.text()).resolves.toBe("Not found");
  });

  it("wirft in keinem Fall", () => {
    expect(() => hostAbweisung(anfrage({ host: "iuk-ue.de" }))).not.toThrow();
    expect(() => hostAbweisung(anfrage({}))).not.toThrow();
  });
});

describe("die zwei Quelltext-Zusicherungen ueber die Riegeldateien", () => {
  /*
   * WARUM QUELLTEXT UND NICHT VERHALTEN: beide Aussagen unten sind ueber die ABWESENHEIT
   * eines Zweigs bzw. einer Aufrufform. Ein Verhaltenstest kann eine Abwesenheit nicht
   * belegen — er faende nur den Zweig, den er zufaellig trifft. Vorbild:
   * `lagerbuch/_lib/bauform.test.ts:8-11` („Sie belegen NICHT, dass etwas wirkt, sondern
   * dass eine BAUFORM eingehalten ist").
   *
   * ⛔ ALLE VIER MUSTER LESEN DEN ROHTEXT, OHNE KOMMENTAR-ENTFERNUNG. Deshalb bindet
   * jedes an einen Aufruf `(` oder an eine IMPORT-Zeile, nie an die blosse Nennung eines
   * Namens — sonst waere der Scan auf seiner eigenen Begruendung rot, die Falle, die
   * `lagerbuch/_lib/bauform.test.ts:124-141` benennt und gegen die dort `ohneKommentare`
   * steht. Wer einen Kommentar in host.ts oder hostRiegel.ts umformuliert und dabei ein
   * `(` hinter einen dieser Namen setzt, macht den Test rot — dann ist der KOMMENTAR zu
   * aendern, nicht der Test.
   */
  it("host.ts enthaelt keinen Zweig, der bei leerem prodHostsFor durchlaesst", () => {
    /*
     * Spec:712 verlangt genau diese Zusicherung. Der Zweig saehe wie eine Erleichterung
     * aus („lokal ist ja nichts konfiguriert") und waere die Sperre, die sich selbst
     * abschaltet. Der Test bindet an den FUNKTIONSNAMEN, nicht an eine Formulierung:
     * `host.ts` darf `prodHostsFor` ueberhaupt nicht rufen, weil es die Frage gar nicht
     * stellt — es fragt `moduleForHost`.
     */
    const quelle = readFileSync("src/app/m/radio/_lib/host.ts", "utf8");
    expect(quelle, "host.ts fragt moduleForHost, nie prodHostsFor (Spec §1.4.5)")
      .not.toMatch(/\bprodHostsFor\s*\(/);
  });

  it("hostAbweisung loest auf die NICHT-werfende Form auf", () => {
    /*
     * DIE KETTE SCHLIESSEN (Vorbild lagerbuch/_lib/bauform.test.ts:1584-1595). Sobald
     * Planteil 5 den `sw.js`-Handler baut, ist DIES die eine Datei, in der die Form fuer
     * ihn umkippen koennte — und ein Scan ueber den Handler liesse `hostAbweisung(`
     * weiter durchgehen, ohne etwas zu merken.
     */
    const riegel = readFileSync("src/app/m/radio/_lib/hostRiegel.ts", "utf8");
    expect(riegel, "hostAbweisung ruft die nicht-werfende Form").toMatch(/\bradioHostOderNull\s*\(/);
    expect(riegel, "hostAbweisung wuerfe sonst fuer den Handler, der sie kurzschliesst")
      .not.toMatch(/\brequireRadioHost\s*\(/);
    // Und die Wurzel derselben Aussage, ohne Umweg ueber einen Aufrufnamen: wer nicht
    // aus `next/navigation` importiert, kann `notFound()` gar nicht rufen. Diese Form
    // bindet an eine IMPORT-Zeile und ist damit gegen jede Umbenennung robust — und sie
    // trifft den Kommentarkopf nicht, der `notFound()` erklaerenderweise nennt.
    expect(riegel, "hostRiegel.ts importiert nichts aus next/navigation")
      .not.toMatch(/from\s+["']next\/navigation["']/);
  });
});
