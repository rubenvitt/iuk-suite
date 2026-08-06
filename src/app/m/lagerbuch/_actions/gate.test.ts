import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { helferGueltigkeitSekunden } from "../_lib/helferSitzung";

/**
 * DIE ZWEITE GATE-FLAECHE — §7.5.2. Was diese Datei besitzt, und warum sie es
 * besitzen MUSS:
 *
 * `_lib/bauform.test.ts` (T64, Betreiberentscheidung B2) scannt die
 * Riegelreihenfolge der drei Gate-Flaechen ueber den Quelltext. Sein
 * Blockkommentar sagt ausdruecklich, was er NICHT sehen kann, weil ein
 * Quelltext-Scan POSITION sieht und nicht BEDINGTHEIT:
 *
 *   - „KEIN Budgetverbrauch im Erfolgsfall": ein UNBEDINGTES
 *     `gateFehlversuchBuchen()` NACH `redeemToken()` ist dort gruen.
 *   - „Erfolg: Cookie": dass im Erfolgsfall eine Sitzung gesetzt wird, prueft
 *     dort kein `it()`.
 *
 * Beides liegt damit HIER — die Auflage nennt T73 namentlich. Wer sie hier
 * nicht abdeckt, hat sie NIRGENDS abgedeckt.
 *
 * Dazu drei Zusagen, die sonst gar keinen Traeger haetten:
 *   - der Absenderschluessel der Pruefung ist DERSELBE wie der der Buchung
 *     (§3.5.2) — eine Buchung auf einen anderen Schluessel degradiert den
 *     Per-Absender-Zaehler still,
 *   - das DB-Handle kommt IDENTISCH aus `getDb()` (§5.13.2, ein Handle, ein
 *     Weg),
 *   - vor dem Host-Riegel laeuft NICHTS (Schritt 1 der Reihenfolge).
 */

const QUELLE = "src/app/m/lagerbuch/_actions/gate.ts";

/**
 * ZEICHENGLEICH aus `_lib/bauform.test.ts:84-104` kopiert. Die Funktion ist dort
 * NICHT exportiert (N-5); `_lib/pwaIcons.test.ts` und
 * `_lib/schreibpfade/tokenEinloesung.test.ts` halten es genauso.
 *
 * ⚠️ OHNE SIE IST JEDER SCAN DIESER DATEI AUF SEINER EIGENEN BEGRUENDUNG ROT:
 * `_actions/gate.ts` schreibt „requireLagerbuchHost" und „use server" in seine
 * Begruendungskommentare, und die naheliegende „Reparatur" waere das Loeschen
 * genau dieser Begruendungen.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Die Vorrichtung liegt in `vi.hoisted`, wie im Bestand
 * (`m/files/api/s/[id]/qr.png/route.test.ts:40`): `vi.mock`-Aufrufe werden an
 * den Dateikopf gehoben, und ein Modulebenen-`const` waere zu diesem Zeitpunkt
 * noch in der temporalen Totzone.
 */
const stand = vi.hoisted(() => ({
  kopf: new Headers(),
  cookies: [] as { name: string; wert: string; opt: Record<string, unknown> }[],
  umleitungen: [] as string[],
}));

const { gateGesperrt, gateFehlversuchBuchen, redeemToken, getDb } = vi.hoisted(() => ({
  gateGesperrt: vi.fn<(absender: string) => number | null>(),
  gateFehlversuchBuchen: vi.fn<(absender: string) => void>(),
  redeemToken: vi.fn<(code: string, db: unknown) => Promise<unknown>>(),
  getDb: vi.fn<() => unknown>(),
}));

vi.mock("next/headers", () => ({
  headers: async () => stand.kopf,
  cookies: async () => ({
    set: (name: string, wert: string, opt: Record<string, unknown>) => {
      stand.cookies.push({ name, wert, opt });
    },
  }),
}));

// `redirect()` und `notFound()` WERFEN in der echten Laufzeit einen
// Next-internen Fehler. Fuer die Unit-Aussage genuegt ein erkennbarer Wurf —
// dieselbe Form wie in `_lib/host.test.ts:5-7`.
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { stand.umleitungen.push(ziel); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../_lib/gateSchranke", () => ({ gateGesperrt, gateFehlversuchBuchen }));
vi.mock("../_lib/schreibpfade/tokenEinloesung", () => ({ redeemToken }));
vi.mock("../_db/client", () => ({ getDb }));

import { einloesenAmGate } from "./gate";

/**
 * Das EINE Handle. Es wird ueber IDENTITAET geprueft (`toBe`), nicht ueber die
 * Struktur: `toHaveBeenCalledWith` vergleicht mit `toEqual`-Semantik, und ein
 * zweiter Opener, der ein gleich geformtes Objekt liefert, bestuende das.
 */
const DB_HANDLE = { marke: "db" };

const CODE_TEXT = "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";

function form(felder: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
}

beforeEach(() => {
  stand.cookies.length = 0;
  stand.umleitungen.length = 0;
  stand.kopf = new Headers({ host: "lagerbuch.localtest.me" });
  gateGesperrt.mockReset().mockReturnValue(null);
  gateFehlversuchBuchen.mockReset();
  redeemToken.mockReset();
  getDb.mockReset().mockReturnValue(DB_HANDLE);
});
afterEach(() => { vi.clearAllMocks(); });

describe("einloesenAmGate — Schritt 1: der Host-Riegel WIRFT, und er steht ganz vorn", () => {
  it("auf fremdem Host: notFound(), und NICHTS davor ist gelaufen", async () => {
    // §7.3 nimmt den Riegelfall ausdruecklich vom Rueckgabewert-Grundmuster aus:
    // ein Action-POST auf dem falschen Host ist kein Betriebsfall, den ein
    // Formular anzeigen muesste, sondern ein manipulierter. Die Existenz eines
    // Pfades auf dem falschen Host wird nicht verraten.
    //
    // ⚠️ DIE VIER `not.toHaveBeenCalled` SIND DER EIGENTLICHE INHALT. Dass
    // geworfen wird, sagt nur, DASS ein Riegel existiert — nicht, dass er VOR
    // allem anderen steht. Ein Riegel, der erst hinter `redeemToken` griffe,
    // wuerfe genauso, haette aber `tokens.lastUsedAt` auf dem fremden Host schon
    // geschrieben (`tokenEinloesung.ts:14-19`: ein einmal eingeloester Code ist
    // nicht mehr loeschbar, nur noch sperrbar).
    stand.kopf = new Headers({ host: "feedback.localtest.me" });

    await expect(einloesenAmGate({}, form({ code: "482-137" }))).rejects.toThrow("NEXT_NOT_FOUND");

    expect(gateGesperrt).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(redeemToken).not.toHaveBeenCalled();
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
    expect(stand.cookies).toEqual([]);
    expect(stand.umleitungen).toEqual([]);
  });
});

describe("einloesenAmGate — Schritt 2: gesperrt, OHNE Datenbankzugriff", () => {
  it("gibt den `zuviele`-Text zurueck und fasst die Datenbank NICHT an", async () => {
    // Schritt 2 schuetzt den DB-Zugriff, nicht der Absender-Eimer: wer den
    // Absenderschluessel rotiert, startet mit leerem Eimer und bekaeme so oder
    // so einen Lookup. Gedeckelt wird das ausschliesslich durch die beiden
    // modulweiten Zaehler, und die lesen VOR jedem DB-Zugriff (§3.5.3).
    gateGesperrt.mockReturnValue(42);

    const r = await einloesenAmGate({}, form({ code: "482-137" }));

    expect(r.fehler).toBe("Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.");
    expect(redeemToken).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("bucht bei einer laufenden Sperre KEINEN weiteren Fehlversuch", async () => {
    // Sonst verlaengert jeder Versuch waehrend der Sperre die Sperre — eine
    // Bereitschaft, die es zweimal probiert, kaeme nie wieder herein.
    //
    // Regel 4 — was DIESER Test allein haelt: den Fall „Sperre laeuft". Der
    // Erfolgsfall („hundert Erfolge schliessen das Gate nicht") liegt weiter
    // unten und wird von hier NICHT mitgetragen: dort laeuft `redeemToken`,
    // hier kommt der Weg nie so weit.
    gateGesperrt.mockReturnValue(42);

    await einloesenAmGate({}, form({ code: "482-137" }));

    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("einloesenAmGate — der Absenderschluessel: einmal ermittelt, zweimal benutzt", () => {
  it("prueft und bucht auf DEMSELBEN Schluessel aus den Kopfzeilen (§3.5.2)", async () => {
    // Ohne diese Zusicherung ist eine Buchung auf einen ANDEREN Schluessel
    // (etwa den konstanten Ausfallwert `"direkt"`) still gruen: der
    // Per-Absender-Zaehler zaehlte dann fuer alle zusammen, waehrend die
    // Pruefung je Absender liest. Die Sperre traefe nie den, der sie ausloest.
    stand.kopf = new Headers({ host: "lagerbuch.localtest.me", "cf-connecting-ip": "1.2.3.4" });
    redeemToken.mockResolvedValue({ ok: false });

    await einloesenAmGate({}, form({ code: "000-000" }));

    expect(gateGesperrt).toHaveBeenCalledWith("cf:1.2.3.4");
    expect(gateFehlversuchBuchen).toHaveBeenCalledWith("cf:1.2.3.4");
  });
});

describe("einloesenAmGate — Schritt 3: die Normalisierung", () => {
  it("`482137` wird zu `482-137`, BEVOR redeemToken sie sieht (Falle 24)", async () => {
    // Der Generator setzt den Bindestrich fest zwischen Position 3 und 4; die
    // Suche laeuft auf Gleichheit, und `redeemToken` normalisiert NICHT selbst
    // (`tokenEinloesung.ts:35-40`). Ohne diese Zeile teilt sich eine
    // Bereitschaft, die zu Schichtbeginn von Hand eintippt, fuenf Fehlversuche
    // pro Minute — MIT RICHTIGEN CODES.
    redeemToken.mockResolvedValue({ ok: false });

    await einloesenAmGate({}, form({ code: " 482137 " }));

    expect(redeemToken.mock.calls[0]?.[0]).toBe("482-137");
  });
});

describe("einloesenAmGate — Schritt 4: ein Handle, ein Weg", () => {
  it("reicht GENAU das Objekt aus `getDb()` weiter, und holt es genau einmal", async () => {
    // §5.13.2: `_db/client.ts#getDb()` ist der einzige Opener des Moduls, und
    // `redeemToken` NIMMT das Handle (`tokenEinloesung.ts:41-43`).
    //
    // ⚠️ IDENTITAET (`toBe`), NICHT STRUKTUR: `toHaveBeenCalledWith` vergleicht
    // mit `toEqual`-Semantik — ein zweiter Opener, der ein gleich geformtes
    // Objekt liefert, bestuende das und waere genau der Fehler, den §5.13.2
    // ausschliesst.
    redeemToken.mockResolvedValue({ ok: false });

    await einloesenAmGate({}, form({ code: "482-137" }));

    expect(redeemToken.mock.calls[0]?.[1]).toBe(DB_HANDLE);
    expect(getDb).toHaveBeenCalledTimes(1);
  });
});

describe("einloesenAmGate — Schritt 5: Erfolg", () => {
  it("setzt das Sitzungs-Cookie und leitet an das Code-Ziel", async () => {
    // T64 (`_lib/bauform.test.ts`) sagt in seinem Kopf ausdruecklich, dass
    // „Erfolg: Cookie" dort von KEINEM `it()` geprueft wird — die Auflage liegt
    // hier.
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt.x.y", tokenId: "tk1", zielTyp: "fahrzeug", zielId: "fz-1",
    });

    await expect(einloesenAmGate({}, form({ code: "482-137" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(stand.cookies).toHaveLength(1);
    expect(stand.cookies[0]?.name).toBe("helfer_session");
    expect(stand.cookies[0]?.wert).toBe("jwt.x.y");
    // ⚠️ `maxAge` ist NICHT schmueckendes Beiwerk: `helferCookieOptionen(0)` ist
    // laut `helferSitzung.ts:132-135` das LOESCHEN des Cookies. Eine Sitzung,
    // die mit Gueltigkeit 0 gesetzt wird, ist im selben Moment weg — und jeder
    // andere Test dieser Datei bliebe gruen.
    expect(stand.cookies[0]?.opt.maxAge).toBe(helferGueltigkeitSekunden());
    expect(stand.cookies[0]?.opt.maxAge as number).toBeGreaterThan(0);
    expect(stand.cookies[0]?.opt.httpOnly).toBe(true);
    expect(stand.umleitungen).toEqual(["/helfer/check?fz=fz-1"]);
  });

  it("ein ausdrueckliches `returnTo` hat VORRANG vor dem Code-Ziel", async () => {
    // Ein gescanntes Regaletikett fuehrt nach dem Einloesen zurueck auf den
    // Artikel — sonst laeuft der Deep-Link ins Leere.
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "fahrzeug", zielId: "fz-1",
    });

    await expect(einloesenAmGate({}, form({ code: "482-137", returnTo: "/a/art-9" })))
      .rejects.toThrow("NEXT_REDIRECT");

    expect(stand.umleitungen).toEqual(["/a/art-9"]);
  });

  it("ein FEINDLICHES `returnTo` wird verworfen (Open Redirect)", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });

    await expect(einloesenAmGate({}, form({ code: "482-137", returnTo: "//boese.example/x" })))
      .rejects.toThrow("NEXT_REDIRECT");

    expect(stand.umleitungen).toEqual(["/helfer"]);
  });

  it("verbraucht KEIN Budget — fuenf Erfolge in Folge schliessen das Gate nicht", async () => {
    // ⚠️ DIESE ZUSAGE HAELT NUR DIESER TEST. Der Reihenfolge-Scan aus T64
    // vergleicht POSITIONEN: ein UNBEDINGTES `gateFehlversuchBuchen()` NACH
    // `redeemToken()` steht dort an der richtigen Stelle und ist gruen. Erst
    // hier faellt auf, dass es auch im Erfolgsfall buchte.
    //
    // Sonst sperrt sich eine Bereitschaft zu Schichtbeginn selbst aus, mit
    // RICHTIGEN Codes (§3.5.3).
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });

    for (let i = 0; i < 5; i++) {
      await expect(einloesenAmGate({}, form({ code: "482-137" }))).rejects.toThrow("NEXT_REDIRECT");
    }

    expect(stand.cookies).toHaveLength(5);
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });

  it("leitet auf einen AEUSSEREN Pfad um — auch im Artikel-Zweig", async () => {
    // Die zweite Haelfte von `tokenZielPfad` (`tokenZiel.ts:17`). Die Pfade
    // tragen die AEUSSERE Form (`/a/<id>`), nicht die innere
    // (`/m/lagerbuch/a/<id>`): sie landen in einem `redirect()`, also beim
    // Browser, und der kennt nur den Modul-Host.
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "artikel", zielId: "art-9",
    });

    await expect(einloesenAmGate({}, form({ code: "482-137" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(stand.umleitungen).toEqual(["/a/art-9"]);
  });
});

describe("einloesenAmGate — Schritt 6: Misserfolg", () => {
  it("bucht GENAU EINEN Fehlversuch, gibt den `code`-Text zurueck — und wirft NICHT", async () => {
    redeemToken.mockResolvedValue({ ok: false });

    const r = await einloesenAmGate({}, form({ code: "000-000" }));

    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.fehler).toBe(CODE_TEXT);
    expect(stand.cookies).toEqual([]);
    expect(stand.umleitungen).toEqual([]);
  });

  it("sagt bei einem GESPERRTEN Code dasselbe wie bei einem unbekannten", async () => {
    // Ein Text, der beides unterschiede, waere ein Orakel darueber, welche der
    // 10^6 Ziffernfolgen je vergeben waren (`tokenEinloesung.ts:45-48`).
    //
    // ⚠️ GEPRUEFT WIRD DIE UNTERSCHEIDBARKEIT, nicht zweimal derselbe Aufruf:
    // der zweite Lauf liefert eine Nicht-Treffer-Form MIT einem zusaetzlichen
    // Feld. Genau so saehe die Regression aus — jemand ergaenzt `redeemToken`
    // um einen Grund und verzweigt hier darauf. Ohne das zweite Feld waere
    // dieser Test eine Kopie des vorigen und truege gar nichts.
    redeemToken.mockResolvedValue({ ok: false });
    const unbekannt = await einloesenAmGate({}, form({ code: "000-000" }));

    redeemToken.mockResolvedValue({ ok: false, gesperrt: true, grund: "gesperrt" });
    const gesperrt = await einloesenAmGate({}, form({ code: "900-001" }));

    expect(unbekannt.fehler).toBe(CODE_TEXT);
    expect(gesperrt.fehler).toBe(CODE_TEXT);
  });

  it("ein leeres Feld ist ein Fehlversuch wie jeder andere", async () => {
    // „Wie jeder andere" ist die Zusage, und sie hat drei Haelften: der leere
    // Code laeuft bis in die Einloesung (keine Abkuerzung davor), er wird
    // gebucht, und er bekommt denselben Satz. Ein `toBeTruthy()` auf `fehler`
    // allein truege keine davon.
    redeemToken.mockResolvedValue({ ok: false });

    const r = await einloesenAmGate({}, form({ code: "" }));

    expect(redeemToken.mock.calls[0]?.[0]).toBe("");
    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.fehler).toBe(CODE_TEXT);
  });
});

describe("_actions/gate.ts — Bauform", () => {
  /**
   * Der Rumpf von `einloesenAmGate`, ohne Kommentare, ab der Zeile NACH der
   * schliessenden Signaturklammer.
   *
   * ⚠️ DIE KLAMMERTIEFE WIRD MITGEZAEHLT, wie in `_actions/guards.test.ts:98`:
   * die Signatur dieser Action ist MEHRZEILIG (`_vorher`, `formData`), und ein
   * naives „erste Zeile, die auf `{` endet" naehme die Zeile
   * `export async function einloesenAmGate(` selbst — der Rumpf begaenne dann
   * bei `_vorher: GateZustand,`.
   */
  function rumpfDerAction(): string {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    const ab = q.indexOf("export async function einloesenAmGate");
    expect(ab, "die Action ist in gate.ts nicht als `export async function` deklariert")
      .toBeGreaterThanOrEqual(0);
    const zeilen = q.slice(ab).split("\n");
    let tiefe = 0;
    for (let i = 0; i < zeilen.length; i++) {
      for (const z of zeilen[i]!) {
        if (z === "(") tiefe++;
        else if (z === ")") tiefe--;
      }
      if (tiefe <= 0 && zeilen[i]!.trimEnd().endsWith("{")) return zeilen.slice(i + 1).join("\n");
    }
    return "";
  }

  it('beginnt mit "use server" und exportiert genau EINE Action', () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));

    // Die Direktive wirkt NUR als erste Anweisung der Datei. `toMatch(/^"use
    // server";/m)` wuerde sie auch mitten in der Datei akzeptieren.
    expect(q.split("\n").map((z) => z.trim()).find((z) => z !== "")).toBe('"use server";');
    expect([...q.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]))
      .toEqual(["einloesenAmGate"]);
  });

  it("laesst vor dem Host-Riegel KEINEN Aufruf ausser der Beschaffung der Kopfzeilen zu", () => {
    /**
     * ⚠️ ABWEICHUNG VOM PLAN, Befund 9. Der abgedruckte Test las
     * `rumpf.split("\n").slice(0, 8)` und erwartete darin `requireLagerbuchHost(`
     * — er schlaegt gegen genau den Code fehl, den derselbe Task vorschreibt:
     * dort belegt der fuenfzeilige SCHRITT-1-Kommentar die Indizes 6-10, und
     * erst Index 11 traegt den Riegel. Die naheliegende Reparatur waere, den
     * Kommentar zu kuerzen — also die Begruendung zu loeschen, die §7.3 dort
     * verlangt. Stattdessen prueft dieser Test die SACHE: der Riegel ist die
     * erste WIRKSAME Anweisung.
     *
     * ⚠️ „ERSTE WIRKSAME", NICHT „ERSTE": vor ihm steht `const kopf = await
     * headers();`, und das muss so sein — `kopf` ist sein eigenes Argument.
     * Dieselbe Form traegt der Bestand in `_lib/zugang.ts:251-252`, das der Plan
     * selbst als „erste Anweisung" fuehrt.
     *
     * Was der Verhaltenstest oben („NICHTS davor ist gelaufen") NICHT sieht und
     * dieser Scan schon: einen Aufruf vor dem Riegel, dessen Wirkung kein Mock
     * dieser Datei beobachtet.
     */
    const rumpf = rumpfDerAction();
    const riegel = rumpf.indexOf("requireLagerbuchHost(");
    expect(riegel, "der Host-Riegel kommt im Rumpf von einloesenAmGate gar nicht vor")
      .toBeGreaterThanOrEqual(0);

    const aufrufeVorher = [...rumpf.slice(0, riegel).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
      .map((m) => m[1]);

    expect(aufrufeVorher, [
      "Vor `requireLagerbuchHost(` darf im Rumpf NICHTS stehen ausser der",
      "Beschaffung der Kopfzeilen — sie ist das Argument des Riegels selbst.",
      "Diese Erwartung wird NICHT auf `toContain` gelockert: 'der Riegel kommt",
      "irgendwo vor' ist genau die Aussage, die Schritt 1 der Reihenfolge",
      "(§7.5.2) nicht macht.",
    ].join("\n")).toEqual(["headers"]);
  });
});
