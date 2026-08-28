// src/app/m/radio/_lib/ausleihSitzung.test.ts
// ⛔ `vi` GEHOERT IN DIESE ZEILE — die Datei ruft `vi.resetModules()`. Ohne den Import ist
// `rtk pnpm typecheck` rot (TS2304), und das ist das erste Torkriterium der Aufgabe.
// Vorbild: `src/app/m/lagerbuch/_lib/helferZugang.test.ts:1`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT, decodeJwt } from "jose";
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
  // ERST DIE STUMMEL, DANN DIE ERSETZUNG — die sichere Reihenfolge, weil
  // `vi.unstubAllEnvs()` auf das Objekt schreibt, das `process.env` in diesem Augenblick
  // IST. Gebraucht wird der Aufruf vom Fall „secure folgt NODE_ENV": `NODE_ENV` ist
  // readonly und nur ueber `vi.stubEnv` setzbar.
  //
  // ⚠️ WAS HIER NICHT BEHAUPTET WIRD (Fix-Runde 2 zu A4, Fund N-c). Hier stand, die
  // umgekehrte Reihenfolge traefe das frische Objekt und liesse den Stummel auf dem alten
  // stehen. Gemessen trifft das NICHT zu: die zwei Zeilen vertauscht, und alle 23 Faelle
  // bleiben gruen — das alte Objekt wird ohnehin verworfen, und `UMGEBUNG` traegt dasselbe
  // `NODE_ENV` wie das Objekt aus `beforeEach`. Kein Waechter haelt diese Reihenfolge;
  // sie steht so, weil sie die robuste ist, nicht weil ein Fall sie erzwingt.
  vi.unstubAllEnvs();
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

  it("secure folgt NODE_ENV — production true, development false", async () => {
    /*
     * ⛔ DIESE ZEILE WAR VON KEINEM FALL BEWACHT (Fix-Runde 1 zu A4, Fund W1). Gemessen:
     * `secure: process.env.NODE_ENV === "production"` auf `secure: false` verdrahtet, und
     * alle 21 Faelle blieben gruen — das ANONYME Cookie ginge dann im Klartext ueber HTTP,
     * ohne dass ein Tor rot wuerde. Der Loeschen-Fall daneben sieht es strukturell nicht:
     * sein `toEqual` hat `secure` auf BEIDEN Seiten und ist dafuer tautologisch.
     *
     * ⛔ UND EIN `expect(o.secure).toBe(process.env.NODE_ENV === "production")` WAERE
     * DIESELBE TAUTOLOGIE. Deshalb wird die Variable hier auf beide Werte gesetzt und die
     * Erwartung ausgeschrieben. Unter vitest ist NODE_ENV "test" — also von sich aus
     * weder der eine noch der andere Fall.
     *
     * `NODE_ENV=production` steht fest im Image (`Dockerfile:36`); genau dort, und nur
     * dort, muss das Cookie `Secure` tragen.
     *
     * ⛔ `vi.stubEnv` UND NICHT `process.env.NODE_ENV = …`: gemessen ist die Zuweisung
     * `error TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property` —
     * `NODE_ENV` ist in den Next-Typen `readonly`, anders als die uebrigen Variablen, die
     * diese Datei setzt. `vi.unstubAllEnvs()` in `afterEach` nimmt den Stummel zurueck.
     */
    const { ausleihCookieOptionen } = await import("./ausleihSitzung");
    vi.stubEnv("NODE_ENV", "production");
    expect(ausleihCookieOptionen(3600).secure, "im Container gehoert Secure ans Cookie").toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(ausleihCookieOptionen(3600).secure, "lokal ueber http waere Secure wirkungslos").toBe(false);
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
    /*
     * ⛔ UND DIE NUTZLAST SELBST, NICHT NUR DIE RUECKGABE (Fix-Runde 1 zu A4, Fund K1).
     * Die Zeile darueber prueft, was `verifyAusleihSitzung` HERAUSGIBT — eine Ebene neben
     * der Zusage. Gemessen: ein `bezeichnung: "Handfunkgeraet 7"` NUR in `SignJWT`, bei
     * unveraenderter Rueckgabeform, liess alle 21 Faelle gruen. Die Bezeichnung stuende
     * dann im Cookie eines ANONYMEN Halters, base64url fuer jeden lesbar, und waere bis
     * zum Ablauf eingefroren — genau der Zustand, den Pflicht 15 verbietet
     * (`docs/radio-portierung-analyse.md:959-971`).
     *
     * `decodeJwt` liest OHNE Signaturpruefung — hier richtig, weil die Frage nicht lautet
     * „ist das Token gueltig" (das prueft der Fall darueber), sondern „was steht drin".
     * `iat` und `exp` sind registrierte Claims und kommen von `setIssuedAt()` bzw.
     * `setExpirationTime()` (`ausleihSitzung.ts`, `createAusleihSitzung`), nicht aus der
     * uebergebenen Nutzlast.
     */
    expect(Object.keys(decodeJwt(wert)).sort(), "die Nutzlast traegt nur codeId").toEqual([
      "codeId",
      "exp",
      "iat",
    ]);
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

  it("lehnt ein ABGELAUFENES Token ab", async () => {
    /*
     * ⛔ DER ZWECK VON ENTSCHEIDUNG 8 — „kein QR-Code, der fuer immer gilt" — WAR
     * UNBEWACHT (Fix-Runde 1 zu A4, Fund W3). Der Fall darueber prueft ein Token OHNE
     * `exp`; dass ein VORHANDENES, aber verstrichenes `exp` auch wirklich abgelehnt wird,
     * prueft kein Fall. Gemessen: `{ algorithms: ["HS256"] }` um
     * `clockTolerance: 999_999_999` ergaenzt (rund 31 Jahre Nachsicht) — alle Faelle
     * blieben gruen, und eine Sitzung liefe faktisch unbegrenzt.
     *
     * Die Ablehnung leistet `jose` selbst (`JWTExpired`), das `catch` in
     * `verifyAusleihSitzung` macht daraus `null`. Beide Zeilen traegt dieser Fall.
     *
     * Sekunden auf BEIDEN Seiten: `exp` ist ein Unix-Zeitstempel in Sekunden, deshalb
     * steht der Faktor 1000 hier — anders als beim Kopplungsfall weiter unten — nicht im
     * Ausdruck.
     */
    const { verifyAusleihSitzung } = await import("./ausleihSitzung");
    const abgelaufen = await new SignJWT({ codeId: "zc-1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(GEHEIMNIS));
    await expect(verifyAusleihSitzung(abgelaufen)).resolves.toBeNull();
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
     *
     * ⛔ DIE VARIABLE WIRD WEG VON DER VORBELEGUNG GESETZT, WIE IM STUNDEN-FALL DARUNTER
     * (Fix-Runde 1 zu A4, Fund W2). An der Vorbelegung 12 lief dieser Fall ins Leere:
     * gemessen mit `12 * 3600` fest in die `exp`-Seite verdrahtet blieben ohne gesetzte
     * Variable alle Faelle gruen, und erst mit `RADIO_AUSLEIH_SITZUNG_STUNDEN=7` wurde er
     * rot („exp und maxAge laufen auseinander"). Der Waechter KONNTE den Fehler sehen, er
     * sah ihn nur bei genau der Zahl nicht, die ⬜ A-L1 gerade aendern wird — der Ausfall
     * im Feld waere Cookie 7 h gegen Token 12 h, also exakt die stille Divergenz, die
     * dieser Fall zu verhindern vorgibt.
     */
    process.env.RADIO_AUSLEIH_SITZUNG_STUNDEN = "7";
    const { createAusleihSitzung, verifyAusleihSitzung, ausleihCookieOptionen, ausleihGueltigkeitSekunden } =
      await import("./ausleihSitzung");
    expect(grenzenStunden(), "die Vorbelegung wuerde diesen Fall ins Leere laufen lassen").toBe(7);
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
     * ⚠️ WAS DIESER FALL TRAEGT UND WAS DER SCAN DANEBEN TRAEGT (Fix-Runde 1 zu A4, Fund
     * K4). Hier stand frueher, der Laufzeit-Import genuege NICHT als Nachweis, weil
     * vitest Module cache — das ist der Messung entgegengesetzt: `vi.resetModules()`
     * unten fuehrt das Modul nachweislich NEU aus, und dieser Fall wurde bei JEDER
     * geprobten Form eines Modulebenen-Lesens rot (ohne `TextEncoder`, als `export const`,
     * als schlichtes `const`). Er ist der Waechter der WIRKUNG.
     *
     * Der Scan daneben sichert die FORM — die eine erlaubte Schreibweise `() =>` — und
     * faengt damit auch, was zur Laufzeit dieser Datei folgenlos bliebe. In der ersten
     * Fassung war er der SCHWAECHERE der beiden (er blieb bei zwei der drei Formen gruen);
     * seit Fund K3 gehen bei allen drei Formen BEIDE Faelle rot.
     */
    delete process.env.RADIO_AUSLEIH_SITZUNG_SECRET;
    vi.resetModules();
    await expect(import("./ausleihSitzung")).resolves.toBeTruthy();
  });

  it("Quelltext-Scan: das Geheimnis steht in einem Thunk, nicht in einem Modulebenen-const", async () => {
    /*
     * Der Scan sucht die verbotene Form: ein Modulebenen-`const`, das
     * `ausleihSitzungGeheimnis()` liest. Die erlaubte Form ist
     * `const schluessel = () => new TextEncoder().encode(ausleihSitzungGeheimnis())`.
     * ⛔ Der Unterschied ist genau das `() =>`.
     *
     * ⛔ DREI SCHAERFUNGEN AUS FIX-RUNDE 1 ZU A4 (Fund K3), jede gegen eine gemessene
     * Luecke der ersten Fassung:
     *
     * (a) Alle drei Muster sind mit `^` an den ZEILENANFANG verankert (`m`-Flag). Ohne das
     *     erfuellte ein blosses PROSA-ZITAT in einem Kommentar die positive Zusicherung:
     *     gemessen blieb sie gruen, waehrend der Thunk im Quelltext nur noch als
     *     `// Die erlaubte Form waere: const schluessel = () => …` existierte.
     *
     *     ⛔ WAS SPALTE 0 HIER LEISTET UND WAS NICHT (Fix-Runde 2 zu A4, Fund N-a). Hier
     *     stand „Modulebene heisst Spalte 0" — das ist fuer JavaScript FALSCH,
     *     Modulebenen-Code darf eingerueckt sein, und `package.json:12-13` fuehrt nur
     *     `eslint` und `tsc`, keinen Format-Waechter, der es geraderueckte. Spalte 0 ist
     *     also ein STELLVERTRETER fuer „Modulebene", kein Beweis.
     *
     *     Die Luecke ist gemessen: ein eingeruecktes
     *     `  const X = new TextEncoder().encode(ausleihSitzungGeheimnis());` neben dem
     *     richtigen Thunk laesst beide verbietenden Muster gruen — ROT wird dann allein
     *     der Laufzeit-Fall oben. ⛔ Kein falsches Gruen auf Dateiebene, nur ein Waechter
     *     weniger auf derselben Fehlerklasse.
     *
     *     ⛔ DIE NAHELIEGENDE ABHILFE WURDE GEBAUT, GEMESSEN UND ZURUECKGENOMMEN.
     *     `^[ \t]*` statt `^` faengt die eingerueckte Form — und faengt zugleich JEDES
     *     `const` in einem FUNKTIONSRUMPF, denn eine Regex sieht Einzug, nicht Geltungs-
     *     bereich. Gemessen wurde dieser Fall damit rot auf
     *     `const geheim = ausleihSitzungGeheimnis();` INNERHALB von `createAusleihSitzung`
     *     — also auf der spaeten, richtigen Leseform, die diese ganze Regel gerade
     *     verlangt; die Meldung „kein Modulebenen-const" waere dann schlicht unwahr.
     *     Ein Waechter, der die richtige Form bestraft, erzieht zum Abschwaechen. Von
     *     zwei unvollkommenen Mustern ist das mit dem FALSCH-NEGATIV (eine bizarre
     *     Einrueckung, die der Laufzeit-Fall ohnehin faengt) dem mit dem FALSCH-POSITIV
     *     auf gewoehnlichem Code vorzuziehen. Deshalb bleibt `^`.
     *
     *     Die POSITIVE Zusicherung bleibt aus einem zweiten Grund an Spalte 0: sie ist die
     *     Zusage ueber die eine erlaubte Form, und genau diese Verankerung haelt das
     *     Prosa-Zitat oben von ihr fern.
     *
     * (b) Die verbietende Seite zielt auf `ausleihSitzungGeheimnis(` statt auf
     *     `TextEncoder`. Gemessen kam sonst ein `const ROH = ausleihSitzungGeheimnis();`
     *     mit nachgeschaltetem Thunk durch — dieselbe `pnpm build`-Falle, nur ohne den
     *     Namen, auf den das alte Muster sah. Der negative Vorgriff steht UNMITTELBAR
     *     hinter dem `=` und schliesst den Zwischenraum selbst ein
     *     (`=(?!\s*\(\s*\)\s*=>)\s*`); stuende er hinter einem eigenen `\s*`, koennte die
     *     Maschine dieses `\s*` auf null zuruecknehmen und den Vorgriff damit ins Leere
     *     laufen lassen. Gemessen: in der ersten Fassung war dieser Fall rot AUF DEM
     *     RICHTIGEN THUNK, weil die Maschine genau diesen Rueckzieher machte.
     *
     * (c) `export\s+` ist zugelassen. Gemessen kam sonst ein
     *     `export const SCHLUESSEL = new TextEncoder().encode(ausleihSitzungGeheimnis());`
     *     durch, weil das alte Muster `const` unmittelbar am Zeilenanfang verlangte.
     *     ⛔ Fix-Runde 2 zu A4 (Fund N-b): `(?:export\s+)?` steht jetzt auch in der
     *     POSITIVEN Zusicherung. Vorher war die Regel widerspruechlich — die verbietenden
     *     Muster liessen `export` zu, die positive nicht, und ein sachlich unbedenkliches
     *     `export const schluessel = () => …` machte den Scan gemessen rot. Ein
     *     Waechter, der die richtige Form bestraft, erzieht zum Abschwaechen.
     *
     * Das alte, auf `TextEncoder` zielende Muster bleibt daneben stehen: es faengt ein
     * Modulebenen-`const`, das das Geheimnis auf einem anderen Weg als ueber
     * `ausleihSitzungGeheimnis()` einliest.
     */
    const quelle = readFileSync(join(process.cwd(), "src/app/m/radio/_lib/ausleihSitzung.ts"), "utf8");
    expect(quelle, "das Geheimnis gehoert in einen Thunk (Spec:2042-2047)")
      .toMatch(/^(?:export\s+)?const\s+\w+\s*=\s*\(\s*\)\s*=>\s*new\s+TextEncoder\(\)/m);
    expect(quelle, "kein Modulebenen-const auf das Geheimnis")
      .not.toMatch(/^(?:export\s+)?const\s+\w+\s*=(?!\s*\(\s*\)\s*=>)\s*[^\n]*\bausleihSitzungGeheimnis\s*\(/m);
    expect(quelle, "kein Modulebenen-const auf einen Schluessel")
      .not.toMatch(/^(?:export\s+)?const\s+\w+\s*=\s*new\s+TextEncoder\(\)/m);
  });
});
