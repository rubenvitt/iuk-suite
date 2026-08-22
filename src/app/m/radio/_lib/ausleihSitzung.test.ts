// src/app/m/radio/_lib/ausleihSitzung.test.ts
// ⛔ `vi` GEHOERT IN DIESE ZEILE — die Datei ruft `vi.resetModules()`. Ohne den Import ist
// `rtk pnpm typecheck` rot (TS2304), und das ist das erste Torkriterium der Aufgabe.
// Vorbild: `src/app/m/lagerbuch/_lib/helferZugang.test.ts:1`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { grenzen } from "./grenzen";

/**
 * DIE AUSLEIH-SITZUNG (Spec 1 §3.4, Zeilen 2423-2629; Testauftrag §3.8, Zeilen 3084-3088).
 *
 * ⛔ DER ERSTE FALL IST DER WICHTIGSTE UND ZUGLEICH DER, DEN PLAYWRIGHT NICHT SEHEN KANN
 * (Spec:2456-2459, Analyse-Falle Nr. 19, `docs/radio-portierung-analyse.md:1498-1515`):
 * Playwright faehrt gegen EINEN Host, und dort verhaelt sich ein domain-weites Cookie
 * exakt wie ein host-only. Dieser Unit-Test ist die EINZIGE Absicherung.
 */
const GEHEIMNIS = "radio-test-geheimnis-mindestens-32-zeichen-lang";
const UMGEBUNG = { ...process.env };
beforeEach(() => {
  process.env = { ...UMGEBUNG, RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIMNIS };
});
afterEach(() => {
  process.env = { ...UMGEBUNG };
});

/**
 * Die Stundenzahl aus `_lib/grenzen.ts` (A1) — der EINZIGE Ort, an dem sie steht.
 *
 * ⬜ A-L1: die Vorbelegung 12 ist der VORSCHLAG der Spec (§3.4.3, Spec:2529-2531), nicht
 * die Antwort des Betreibers. Deshalb liest dieser Helfer die Zahl ab, statt sie zu
 * verdrahten — sonst waere jeder Fall unten rot, sobald der Betreiber antwortet.
 */
function grenzenStunden(): number {
  return grenzen().ausleihSitzungStunden;
}

describe("radio-Ausleihsitzung: die Cookie-Attribute", () => {
  it("ausleihCookieOptionen fuehrt KEIN domain-Feld", async () => {
    /*
     * ⛔ `not.toHaveProperty("domain")` UND NICHT `toBeUndefined()`. Der Unterschied ist
     * tragend: `{ domain: undefined }` bestuende ein `toBeUndefined`, und Nexts
     * Cookie-Serialisierung liesse das Feld dann zwar weg — aber die naechste Fassung, die
     * `domain: process.env.AUTH_COOKIE_DOMAIN` schreibt, bestuende es AUCH, solange die
     * Variable im Test nicht gesetzt ist. Die Zusage lautet: das Feld existiert nicht.
     *
     * Der Schaden bei Verletzung: das ANONYME Cookie ginge an jeden Suite-Modul-Host
     * (`qr`, `feedback`, `files`, `lagerbuch`, `aufgaben`, `portal`) — Exposition, keine
     * Rechteausweitung, aber unnoetig und still. Die naheliegende Vorlage
     * `src/core/auth/cookies.ts:46-59` ist fuer die SUITE-Sitzung richtig, nicht hier.
     */
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    expect(ausleihCookieOptionen(3600)).not.toHaveProperty("domain");
  });

  it("Loeschen benutzt dieselben Attribute wie Setzen, nur maxAge 0", async () => {
    /*
     * ⛔ Spec:2596-2604. Attribute muessen beim Loeschen DIESELBEN sein wie beim Setzen,
     * sonst bleibt das Loeschen WIRKUNGSLOS — und der Browser meldet das NICHT. Deshalb
     * gibt es nur EINE Optionen-Funktion mit einem Parameter, statt zweier Objekte.
     *
     * Ein `cookies.delete(name)` setzt kein `Path` und loescht dadurch am falschen Scope
     * (`lagerbuch/_actions/sitzung.ts:140-149`) — der Quelltext-Scan dagegen steht in A9.
     */
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    const setzen = ausleihCookieOptionen(43_200);
    const loeschen = ausleihCookieOptionen(0);
    expect({ ...loeschen, maxAge: undefined }).toEqual({ ...setzen, maxAge: undefined });
    expect(loeschen.maxAge).toBe(0);
  });

  it("traegt httpOnly, sameSite lax und path /", async () => {
    // `path: "/"` traegt die Zusage aus Spec:2449-2451 („KEINE Entscheidung unter /admin
    // liest AUSLEIH_COOKIE") — der Scan dazu steht in A9. `httpOnly` haelt das Cookie aus
    // jedem Skript heraus; `lax` laesst den 303 aus `t/[code]` durch.
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    const o = ausleihCookieOptionen(3600);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
  });

  it("heisst radio_ausleihe — praefigiert, anders als lagerbuch", async () => {
    // Spec:2453-2455: bei `radio` ist ueber den Cutover nichts zu erhalten, also traegt
    // der Name das Modulpraefix. Der Name steht im Cookie-Kopf jedes Aufrufs und ist nach
    // dem ersten Rollout so wenig frei aenderbar wie `/t/<code>`.
    const { AUSLEIH_COOKIE } = await import("./ausleihSitzung");
    expect(AUSLEIH_COOKIE).toBe("radio_ausleihe");
  });
});

describe("radio-Ausleihsitzung: signieren und pruefen", () => {
  it("ein frisch erzeugtes Token wird angenommen und traegt nur codeId", async () => {
    const { createAusleihSitzung, verifyAusleihSitzung } = await import("./ausleihSitzung");
    const wert = await createAusleihSitzung({ codeId: "zc-1" });
    const s = await verifyAusleihSitzung(wert);
    expect(s?.codeId).toBe("zc-1");
    expect(s?.laeuftAb).toBeInstanceOf(Date);
    /*
     * ⛔ NUR `codeId` IN DER NUTZLAST (Spec:2503-2506). `bezeichnung` kaeme sonst aus dem
     * Cookie und waere bis zu zwoelf Stunden eingefroren — und eine Umbenennung oder
     * Sperre in der Verwaltung waere auf der Flaeche unsichtbar. Pflicht 15
     * (`docs/radio-portierung-analyse.md:959-971`): „`label` fuer die Anzeige kommt aus
     * DIESER Zeile, nicht aus der Cookie-Nutzlast."
     */
    expect(Object.keys(s ?? {}).sort()).toEqual(["codeId", "laeuftAb"]);
  });

  it.each([
    ["Muell", "kein-jwt"],
    ["leerer String", ""],
    ["nur Punkte", "..."],
    ["abgeschnittenes JWT", "eyJhbGciOiJIUzI1NiJ9.eyJjb2RlSWQiOiJ4In0"],
  ])("gibt null zurueck statt zu werfen: %s", async (_n, wert) => {
    /*
     * ⛔ Spec:2508-2513: „`verifyAusleihSitzung` WIRFT NIE." Der Cookiewert ist
     * Nutzereingabe — ein Wurf waere HTTP 500 auf JEDER Ausleihseite, und zwar fuer
     * jeden, dessen Cookie irgendwie beschaedigt ist.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    await expect(verifyAusleihSitzung(wert)).resolves.toBeNull();
  });

  it("lehnt alg none ab", async () => {
    /*
     * ⛔ Spec:2506-2508 verlangt `algorithms: ["HS256"]` AUSDRUECKLICH.
     *
     * ⚠️ GEMESSEN AM 2026-08-23, und es steht hier statt verschwiegen zu werden: `jose`
     * 6.2.x lehnt `alg: none` AUCH OHNE die Angabe ab („JOSENotSupported: alg none is not
     * supported either by JOSE or your javascript runtime"). Die Sonde S-A4b (Entfernen
     * von `algorithms`) macht deshalb GENAU DIESEN FALL NICHT ROT — die tragende Zeile
     * hier ist `jwtVerify` selbst, nicht die Algorithmenliste. Wer statt zu verifizieren
     * nur dekodierte (`decodeJwt`), naehme das unsignierte Token an.
     *
     * ⛔ Die Zusage der Algorithmenliste bewacht der Fall „lehnt ein HS512-signiertes
     * Token ab" darunter — dort ist sie GEMESSEN tragend.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const roh = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${
      Buffer.from(JSON.stringify({ codeId: "zc-1", exp: 9_999_999_999 })).toString("base64url")}.`;
    await expect(verifyAusleihSitzung(roh)).resolves.toBeNull();
  });

  it("lehnt ein HS512-signiertes Token ab — mit DEMSELBEN Geheimnis", async () => {
    /*
     * ⛔ DAS IST DER FALL, DER `algorithms: ["HS256"]` TRAEGT (Spec:2506-2508). Gemessen
     * am 2026-08-23 gegen `jose` 6.2.x: ein mit demselben Geheimnis, aber HS512
     * signiertes Token wird OHNE die Angabe ANGENOMMEN — mit ihr abgelehnt
     * („JOSEAlgNotAllowed"). Der Angriff heisst Algorithmenverwirrung; er ist der Grund,
     * warum die Liste ueberhaupt hingeschrieben wird.
     *
     * Ohne diesen Fall waere die Auflage 7 des Auftrags unbewacht: der Fall „alg none"
     * daneben bleibt gruen, auch wenn die Zeile verschwindet.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const hs512 = await new SignJWT({ codeId: "zc-1" })
      .setProtectedHeader({ alg: "HS512" })
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(GEHEIMNIS));
    await expect(verifyAusleihSitzung(hs512)).resolves.toBeNull();
  });

  it("lehnt ein mit FREMDEM Geheimnis signiertes Token ab", async () => {
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const fremd = await new SignJWT({ codeId: "zc-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode("ein-ganz-anderes-geheimnis-32-zeichen"));
    await expect(verifyAusleihSitzung(fremd)).resolves.toBeNull();
  });

  it("ohne exp ungueltig", async () => {
    /*
     * ⛔ Spec:2508: „Fehlt `exp`, ist die Sitzung ungueltig." Ein Token ohne Ablauf ist
     * genau der Zustand, den Entscheidung 8 abschafft — „ein QR-Code, der heute fuer immer
     * gilt". Ein lax pruefender Verifizierer machte ihn still wieder her.
     *
     * ⚠️ `jose` prueft das NICHT von sich aus: gemessen am 2026-08-23 nimmt `jwtVerify`
     * ein Token ohne `exp` klaglos an. Die tragende Zeile ist die eigene `exp`-Pruefung.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const ohneExp = await new SignJWT({ codeId: "zc-1" })
      .setProtectedHeader({ alg: "HS256" })
      .sign(new TextEncoder().encode(GEHEIMNIS));
    await expect(verifyAusleihSitzung(ohneExp)).resolves.toBeNull();
  });

  it.each([
    ["codeId fehlt", {}],
    ["codeId ist leer", { codeId: "" }],
    ["codeId ist eine Zahl", { codeId: 42 }],
    ["codeId ist null", { codeId: null }],
  ])("prueft STRIKT: %s", async (_n, nutzlast) => {
    /*
     * ⛔ STRIKT, ANDERS ALS `lagerbuch` (Spec:2513-2517). `lagerbuch` prueft absichtlich
     * lax; hier steht die strikte Form, weil `codeId` in A7 unmittelbar in einen
     * Datenbank-Lookup geht. Eine `codeId` vom falschen Typ waere dort entweder ein Wurf
     * oder ein stiller Treffer auf nichts.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const t = await new SignJWT(nutzlast as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(GEHEIMNIS));
    await expect(verifyAusleihSitzung(t)).resolves.toBeNull();
  });

  it("exp und maxAge stammen aus EINER Quelle", async () => {
    /*
     * ⛔ Spec:2523-2530: „Die Gueltigkeit steht ZWEIMAL in derselben Sitzung — als JWT-
     * `exp` und als Cookie-`maxAge`. Zwei Umrechnungen waeren zwei Wahrheiten." Der
     * Ausfall bei Verletzung ist unangenehm still: das Cookie liefe (etwa) 12 Stunden, das
     * Token 12 Minuten — der Mensch saehe eine Sitzung, die es nicht mehr gibt, und
     * bekaeme auf jeder Seite eine Weiterleitung ohne erkennbaren Grund.
     *
     * Die Kopplung wird GEMESSEN, nicht behauptet: `laeuftAb` aus dem geprueften Token
     * gegen `maxAge` aus den Optionen, mit dem Faktor 1000 SICHTBAR im Ausdruck
     * (Hausregel: nie ueber die Einheitengrenze vergleichen, ohne den Faktor zu zeigen).
     */
    const { createAusleihSitzung, verifyAusleihSitzung, ausleihCookieOptionen, ausleihGueltigkeitSekunden } =
      await import("./ausleihSitzung");
    const sek = ausleihGueltigkeitSekunden();
    expect(ausleihCookieOptionen(sek).maxAge).toBe(sek);
    const vorher = Date.now();
    const s = await verifyAusleihSitzung(await createAusleihSitzung({ codeId: "zc-1" }));
    const abstandSek = (s!.laeuftAb.getTime() - vorher) / 1000;
    expect(Math.abs(abstandSek - sek), "exp und maxAge laufen auseinander").toBeLessThan(5);
  });

  it("die Gueltigkeit folgt RADIO_AUSLEIH_SITZUNG_STUNDEN", async () => {
    // ⬜ A-L1: die 12 ist die VORGABE, nicht die Antwort des Betreibers. Dieser Fall
    // prueft die KOPPLUNG an die Variable, nicht die Zahl 12 — sonst waere er rot, sobald
    // der Betreiber antwortet.
    //
    // ⛔ DIE VARIABLE WIRD ABSICHTLICH WEG VON DER VORBELEGUNG GESETZT (7, weder die
    // Vorgabe 12 noch ein Rand der Spanne 1..24, `_lib/grenzen.ts:76`). Ohne diese Zeile
    // waere der Fall eine Tautologie: eine verdrahtete `12 * 3600` bestuende ihn, und
    // genau die Kopplung, die er zusichert, waere unbewacht.
    process.env.RADIO_AUSLEIH_SITZUNG_STUNDEN = "7";
    const { ausleihGueltigkeitSekunden } = await import("./ausleihSitzung");
    expect(grenzenStunden(), "die Vorbelegung wuerde diesen Fall zur Tautologie machen").toBe(7);
    expect(ausleihGueltigkeitSekunden()).toBe(grenzenStunden() * 3600);
  });
});

describe("radio-Ausleihsitzung: die Bauform", () => {
  it("liest das Geheimnis NICHT auf Modulebene — Import ohne gesetzte Umgebung gelingt", async () => {
    /*
     * ⛔ DIE ZUSICHERUNG, DIE `pnpm build` RETTET (Spec:2042-2047, Bestand
     * `lagerbuch/_lib/helferSitzung.ts:39-49`): `next build` laeuft mit
     * NODE_ENV=production und OHNE Secrets und wertet Modulebene aus.
     *
     * ⚠️ DER LAUFZEIT-IMPORT ALLEIN GENUEGT NICHT ALS NACHWEIS — vitest cached Module.
     * Deshalb steht daneben der Quelltext-Scan.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    vi.resetModules();
    await expect(import("./ausleihSitzung")).resolves.toBeTruthy();
  });

  it("Quelltext-Scan: das Geheimnis steht in einem Thunk, nicht in einem Modulebenen-const", async () => {
    /*
     * Der Scan sucht die verbotene Form: ein `const … = new TextEncoder().encode(` auf
     * Modulebene. Die erlaubte Form ist `const schluessel = () => new TextEncoder()…`.
     * ⛔ Der Unterschied ist genau das `() =>`.
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/ausleihSitzung.ts"), "utf8");
    expect(quelle, "das Geheimnis gehoert in einen Thunk (Spec:2042-2047)")
      .toMatch(/const\s+\w+\s*=\s*\(\s*\)\s*=>\s*new\s+TextEncoder\(\)/);
    expect(quelle, "kein Modulebenen-const auf das Geheimnis")
      .not.toMatch(/^\s*const\s+\w+\s*=\s*new\s+TextEncoder\(\)/m);
  });
});
