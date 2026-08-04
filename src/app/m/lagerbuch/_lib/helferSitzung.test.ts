import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import {
  HELFER_COOKIE, createHelferSitzung, verifyHelferSitzung,
  helferCookieOptionen, helferGueltigkeitSekunden,
} from "./helferSitzung";

/**
 * Das Geheimnis kommt zur AUFRUFZEIT aus der Umgebung (§10.8, Eigenschaft 3).
 * Deshalb genuegt es, `process.env` je Fall zu setzen — es gibt keinen
 * Modul-Singleton, den man zuruecksetzen muesste. Genau das ist die Eigenschaft,
 * die dieser Aufbau nebenbei belegt.
 */
const GEHEIM = "e2e-helfer-secret-nicht-produktiv-32z";
const FREMD = "ein-voellig-anderes-geheimnis-mit-32z!";

const alt: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ["LAGERBUCH_HELFER_SITZUNG_SECRET", "LAGERBUCH_HELFER_SITZUNG_STUNDEN", "NODE_ENV"]) {
    alt[k] = process.env[k];
  }
  process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = GEHEIM;
});
afterEach(() => {
  for (const [k, v] of Object.entries(alt)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Ein Cookie, wie es die ALT-Anwendung ausgestellt hat: drei Felder, HS256, exp. */
async function altCookie(
  nutzlast: Record<string, unknown>,
  opts: { geheimnis?: string; ablaufSekunden?: number; ohneExp?: boolean } = {},
): Promise<string> {
  let b = new SignJWT(nutzlast).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  if (!opts.ohneExp) {
    b = b.setExpirationTime(
      Math.floor(Date.now() / 1000) + (opts.ablaufSekunden ?? 12 * 3600),
    );
  }
  return b.sign(new TextEncoder().encode(opts.geheimnis ?? GEHEIM));
}

describe("HELFER_COOKIE", () => {
  it("heisst helfer_session — OHNE Modulpraefix, unbedingt", () => {
    /**
     * Das weicht vom Hausstil ab, der praefigiert (`files_s_<shareId>`,
     * `feedback-<surveyId>`). Begruendung: das Cookie ist HOST-ONLY, lagerbuch
     * ist das einzige Modul auf lagerbuch.iuk-ue.de, und KEIN anderes
     * Suite-Modul liest `helfer_session` — eine Namenskollision ist konstruktiv
     * unmoeglich.
     *
     * Ein Praefix kostete im guenstigen Cutover-Zweig genau das, wofuer das
     * Geheimnis uebernommen wird: JEDE laufende Feld-Sitzung. Ein bedingter
     * Cookie-Name waere eine Bauzeit-Gabelung, die niemand will.
     */
    expect(HELFER_COOKIE).toBe("helfer_session");
  });
});

describe("verifyHelferSitzung — RUECKWAERTSKOMPATIBEL, und das ist der Punkt", () => {
  it("verifiziert ein ALT-Cookie mit {tokenId, code, label} unveraendert weiter", async () => {
    /**
     * DIE ZEILE, WEGEN DER DIE GEHEIMNIS-UEBERNAHME UEBERHAUPT TRAEGT
     * (Betreiber-Entscheidung 4). Heute traegt das JWT `{tokenId, code, label}`
     * (`lagerbuch/src/lib/auth/helferSession.ts:6,11`); die neue Nutzlast ist
     * `{tokenId}`, weil §3.4.4 auf jedem Lesepfad ohnehin die Token-Zeile holt.
     *
     * DIE GEGENMUTATION IST TEUER UND UNSICHTBAR: eine strikte Feldpruefung auf
     * genau `{tokenId}` beendet JEDE laufende Feld-Sitzung beim Cutover, und
     * KEIN ANDERER TEST SIEHT DAS. Deshalb steht dieser Fall hier und nicht
     * irgendwo im E2E.
     */
    const roh = await altCookie({ tokenId: "tk1", code: "123-456", label: "RTW 1" });
    const s = await verifyHelferSitzung(roh);
    expect(s).not.toBeNull();
    expect(s?.tokenId).toBe("tk1");
  });

  it("liefert laeuftAb aus dem exp DIESES Alt-Cookies", async () => {
    // `exp` ist kein Feld der signierten Nutzlast, sondern der registrierte
    // Claim, den setExpirationTime setzt — und den jose beim Verifizieren ohnehin
    // schon prueft. Ihn herauszureichen kostet keinen zusaetzlichen Zugriff und
    // ist der EINZIGE Datenpfad der Restzeit-Anzeige (§3.4.3, §7.8.2).
    const inEinerStunde = Math.floor(Date.now() / 1000) + 3600;
    const roh = await altCookie({ tokenId: "tk1", code: "1", label: "l" },
                                { ablaufSekunden: 3600 });
    const s = await verifyHelferSitzung(roh);
    expect(s?.laeuftAb).toBeInstanceOf(Date);
    // Sekundengenau: jose rechnet in Sekunden, Date in Millisekunden.
    expect(Math.round((s!.laeuftAb.getTime() / 1000 - inEinerStunde))).toBeLessThanOrEqual(1);
  });

  it("verifiziert die NEUE Nutzlast {tokenId}", async () => {
    const s = await verifyHelferSitzung(await createHelferSitzung({ tokenId: "tk9" }));
    expect(s?.tokenId).toBe("tk9");
  });

  it("weist ein Cookie OHNE tokenId ab", async () => {
    expect(await verifyHelferSitzung(await altCookie({ code: "123-456" }))).toBeNull();
    expect(await verifyHelferSitzung(await altCookie({ tokenId: 42 }))).toBeNull();
    expect(await verifyHelferSitzung(await altCookie({ tokenId: "" }))).toBeNull();
  });

  it("weist ein Cookie OHNE exp ab — die eine bewusste Verschaerfung", async () => {
    /**
     * Sie ist strenger als die Feldpruefung eine Zeile hoeher und darf NUR
     * deshalb dort stehen, weil dieser Fall im Bestand nicht vorkommt: der
     * Aussteller setzt den Claim seit jeher UNBEDINGT
     * (`helferSession.ts:14`), ein Alt-Cookie traegt ihn also.
     *
     * Ohne diesen Fall faellt die Verschaerfung erst am Cutover-Abend auf — und
     * dann allen.
     */
    expect(await verifyHelferSitzung(await altCookie({ tokenId: "tk1" }, { ohneExp: true })))
      .toBeNull();
  });

  it("weist ein FREMDES Geheimnis ab", async () => {
    const roh = await altCookie({ tokenId: "tk1" }, { geheimnis: FREMD });
    expect(await verifyHelferSitzung(roh)).toBeNull();
  });

  it("weist ein ABGELAUFENES exp ab", async () => {
    const roh = await altCookie({ tokenId: "tk1" }, { ablaufSekunden: -60 });
    expect(await verifyHelferSitzung(roh)).toBeNull();
  });

  it("weist Muell ab, ohne zu werfen", async () => {
    // Der Wert kommt aus einem Cookie und ist damit Nutzereingabe. Ein Wurf
    // machte aus einem manipulierten Cookie einen 500 auf JEDER Helfer-Seite.
    for (const roh of ["", "abc", "a.b.c", "eyJhbGciOiJub25lIn0..", "null"]) {
      await expect(verifyHelferSitzung(roh)).resolves.toBeNull();
    }
  });

  it("weist ein Cookie mit alg:none ab", async () => {
    // Die klassische JWT-Falle. `jwtVerify` bekommt `algorithms: ["HS256"]`
    // ausdruecklich mit — ohne die Zeile akzeptierten manche Bibliotheken ein
    // unsigniertes Token.
    const unsigniert =
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify({ tokenId: "tk1", exp: Math.floor(Date.now() / 1000) + 3600 }))
        .toString("base64url") +
      ".";
    expect(await verifyHelferSitzung(unsigniert)).toBeNull();
  });

  it("weist ein Cookie mit KORREKTEM Geheimnis, aber falschem Algorithmus (HS512) ab", async () => {
    /**
     * DIE SCHAERFERE GEGENPROBE zum Fall darueber. `alg: none` scheitert schon
     * daran, dass ueberhaupt keine Signatur anliegt — der Fall belegt also
     * weniger, als er verspricht. HIER stimmt das Geheimnis, die Signatur ist
     * echt und pruefbar; allein der Algorithmus steht nicht in
     * `algorithms: ["HS256"]`.
     *
     * OHNE DIESEN FALL FIELE EINE ERWEITERUNG DER LISTE DURCH KEINEN TESTLAUF
     * AUF: `algorithms` ist eine Signaturzusage, und wer sie aufmacht, laesst
     * Tokens gelten, die diese Anwendung nie ausgestellt hat.
     */
    const hs512 = await new SignJWT({ tokenId: "tk1" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(GEHEIM));
    expect(await verifyHelferSitzung(hs512)).toBeNull();

    // Die Gegenrichtung, damit der Fall nicht aus einem ANDEREN Grund gruen ist:
    // dieselbe Nutzlast, dasselbe Geheimnis, nur HS256 — und sie verifiziert.
    expect(await verifyHelferSitzung(await altCookie({ tokenId: "tk1" }))).not.toBeNull();
  });
});

describe("createHelferSitzung", () => {
  it("signiert mit HS256 und setzt exp aus LAGERBUCH_HELFER_SITZUNG_STUNDEN", async () => {
    process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = "3";
    const vorher = Math.floor(Date.now() / 1000);
    const s = await verifyHelferSitzung(await createHelferSitzung({ tokenId: "tk1" }));
    const sekunden = s!.laeuftAb.getTime() / 1000 - vorher;
    expect(sekunden).toBeGreaterThan(3 * 3600 - 5);
    expect(sekunden).toBeLessThan(3 * 3600 + 5);
  });

  it("schreibt AUSSCHLIESSLICH tokenId in die Nutzlast — kein code, kein label", async () => {
    /**
     * `code` ist der Wert, den der Implementierungsplan als „das Etikett IST das
     * Secret" bezeichnet. Er kann weg, weil §3.4.4 auf jedem Lesepfad ohnehin die
     * Token-Zeile holt — `code` und `label` kommen ab jetzt VON DORT.
     *
     * Der Test liest die Nutzlast roh, nicht ueber verifyHelferSitzung: die
     * Funktion wuerde ueberzaehlige Felder ja gerade ignorieren und koennte den
     * Unterschied nicht zeigen.
     */
    const [, nutzlast] = (await createHelferSitzung({ tokenId: "tk1" })).split(".");
    const felder = JSON.parse(Buffer.from(nutzlast, "base64url").toString("utf8"));
    expect(Object.keys(felder).sort()).toEqual(["exp", "iat", "tokenId"]);
  });

  it("wirft mit benannter Meldung, wenn das Geheimnis fehlt", async () => {
    // `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in Compose den LEEREN
    // String; leer greift keinen Default. Ohne diese Zeile verweigerte `jose`
    // einen Nullschluessel mit „Zero-length key is not supported" — eine Meldung,
    // die niemanden zur Ursache fuehrt.
    delete process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
    await expect(createHelferSitzung({ tokenId: "tk1" }))
      .rejects.toThrow(/LAGERBUCH_HELFER_SITZUNG_SECRET/);
  });
});

describe("helferCookieOptionen", () => {
  it("traegt KEIN domain — die eine Zeile, an der am meisten haengt", () => {
    /**
     * Die naheliegende Vorlage heisst `core/auth/cookies.ts` und SETZT es. Mit
     * `domain` wanderte das Helfer-Cookie an files., an feedback. und an jeden
     * weiteren Modul-Host — keine Rechteausweitung, aber Exposition in jedem
     * Header und jedem Log, das Cookies fuehrt.
     *
     * PLAYWRIGHT KANN DAS NICHT SEHEN: es faehrt gegen EINEN Host, und dort
     * verhaelt sich ein domain-weites Cookie exakt wie ein host-only (Falle 19).
     */
    expect(helferCookieOptionen(3600)).not.toHaveProperty("domain");
    expect(Object.keys(helferCookieOptionen(3600)).sort())
      .toEqual(["httpOnly", "maxAge", "path", "sameSite", "secure"]);
  });

  it("traegt httpOnly, sameSite lax und path /", () => {
    const o = helferCookieOptionen(3600);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(3600);
  });

  it("setzt secure aus NODE_ENV, nicht aus einer Basis-URL", () => {
    // NODE_ENV=production steht fest im Image (`iuk-suite/Dockerfile:25`);
    // APP_BASE_URL existiert in der Suite gar nicht (§8.2). Der zweite Operand
    // des Bestands waere ein Verweis auf eine Variable, die niemand setzt.
    //
    // Next's next-env.d.ts augmentiert NodeJS.ProcessEnv mit `readonly
    // NODE_ENV`, eine direkte `process.env.NODE_ENV = ...`-Zuweisung (wie im
    // Task-Brief) schlaegt bei `tsc --noEmit` fehl. `vi.stubEnv` ist das im
    // Repo etablierte Muster fuer genau diese Einschraenkung (vgl.
    // `devLogin.test.ts`, `bootstrap.test.ts:110-114`). Verhalten und
    // Zusicherungen bleiben gegenueber dem Brief unveraendert.
    vi.stubEnv("NODE_ENV", "production");
    expect(helferCookieOptionen(1).secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(helferCookieOptionen(1).secure).toBe(false);
  });

  it("maxAge 0 ist das LOESCHEN — dieselben Attribute wie beim Setzen", () => {
    /**
     * `/abmelden` loescht mit `helferCookieOptionen(0)` statt mit
     * `cookies.delete(...)`: die Attribute muessen beim Loeschen DIESELBEN sein
     * wie beim Setzen (path, kein domain), und die eine Funktion, die das
     * garantiert, gibt es schon. Es ist zugleich die Form, die `feedback`
     * benutzt (`m/feedback/actions.ts:638`).
     */
    const loeschen = helferCookieOptionen(0);
    const setzen = helferCookieOptionen(3600);
    expect(loeschen.maxAge).toBe(0);
    expect(loeschen.path).toBe(setzen.path);
    expect(loeschen.sameSite).toBe(setzen.sameSite);
    expect(loeschen.httpOnly).toBe(setzen.httpOnly);
    expect(loeschen).not.toHaveProperty("domain");
  });
});

describe("helferGueltigkeitSekunden", () => {
  it("rechnet die Stunden aus der Env in Sekunden um — an EINER Stelle", () => {
    // Der Wert steht ZWEIMAL in derselben Sitzung: als JWT-exp und als
    // Cookie-maxAge (§3.4.3). Zwei Umrechnungen waeren zwei Wahrheiten, und die
    // Sitzung liefe je nach Weg verschieden lange.
    process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = "12";
    expect(helferGueltigkeitSekunden()).toBe(12 * 3600);
    process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = "1";
    expect(helferGueltigkeitSekunden()).toBe(3600);
  });
});

describe("die Quelltext-Zusicherung zu dieser Datei", () => {
  it("setzt kein domain und importiert core/auth/cookies nicht", async () => {
    // §3.8.2. Sie liegt hier und nicht in `bauform.test.ts`, weil sie eine
    // Aussage ueber GENAU DIESE Datei ist.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/lagerbuch/_lib/helferSitzung.ts"), "utf8");
    /**
     * ⚠️ GEPRUEFT WIRD AUF EINE ZUWEISUNG, NICHT AUF DAS WORT. Der Kopfkommentar
     * von `helferCookieOptionen` traegt sowohl „domain" als auch
     * „AUTH_COOKIE_DOMAIN" — er erklaert ja gerade die Abwesenheit. Ein
     * `expect(quelle).not.toMatch(/AUTH_COOKIE_DOMAIN/)` waere auf der eigenen
     * Begruendung rot und wuerde dann geloescht statt verstanden.
     *
     * `/^\s*domain\s*:/m` trifft eine Objekteigenschaft am Zeilenanfang. In einem
     * Blockkommentar steht dort ein ` * `, die Zeile beginnt also nie mit
     * `domain:`.
     */
    expect(quelle, "helferCookieOptionen darf kein domain setzen (§3.4.2)")
      .not.toMatch(/^\s*domain\s*:/m);
    // Und kein IMPORT der Suite-Cookie-Konfiguration — die naheliegende Vorlage.
    expect(quelle, "core/auth/cookies ist die Vorlage fuer die SUITE-Sitzung, nicht fuer diese")
      .not.toMatch(/from\s+["']@\/core\/auth\/cookies["']/);
  });
});
