import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { helferGueltigkeitSekunden, helferCookieOptionen } from "../_lib/helferSitzung";
import { darfErneuern } from "../_lib/actionTypen";

/**
 * DIE DRITTE GATE-FLAECHE UND DER BEENDEN-KNOPF — §7.4.4, §7.5.2.
 *
 * Was diese Datei besitzt, und warum sie es besitzen MUSS:
 *
 * `_lib/bauform.test.ts` (T64, Betreiberentscheidung B2) scannt die
 * Riegelreihenfolge der drei Gate-Flaechen ueber den Quelltext und nennt in
 * seinem Kopf ausdruecklich die zwei Glieder, die er NICHT sehen kann, weil ein
 * Quelltext-Scan POSITION sieht und nicht BEDINGTHEIT:
 *
 *   - „KEIN Budgetverbrauch im Erfolgsfall": ein UNBEDINGTES
 *     `gateFehlversuchBuchen()` NACH `redeemToken()` ist dort gruen.
 *   - „Erfolg: Cookie": dass im Erfolgsfall eine Sitzung gesetzt wird, prueft
 *     dort kein `it()`.
 *
 * Die Auflage nennt T74 namentlich. Wer sie hier nicht abdeckt, hat sie
 * NIRGENDS abgedeckt.
 *
 * Dazu vier Zusagen, die sonst gar keinen Traeger haetten:
 *   - der Absenderschluessel der Pruefung ist DERSELBE wie der der Buchung
 *     (§3.5.2),
 *   - das DB-Handle kommt IDENTISCH aus `getDb()` (§5.13.2),
 *   - der `grund` der beiden Fehlerzweige oeffnet KEIN zweites Erneuerungsfeld
 *     im ersten (`darfErneuern`, T63),
 *   - `beenden` entfernt das Cookie mit DENSELBEN Attributen, mit denen es
 *     gesetzt wurde — sonst bleibt das Loeschen wirkungslos, und zwar still.
 */

const QUELLE = "src/app/m/lagerbuch/_actions/sitzung.ts";

/**
 * ZEICHENGLEICH aus `_lib/bauform.test.ts:84-104` kopiert. Die Funktion ist dort
 * NICHT exportiert (N-5); `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts` und `_actions/gate.test.ts`
 * halten es genauso.
 *
 * ⚠️ OHNE SIE IST JEDER SCAN DIESER DATEI AUF SEINER EIGENEN BEGRUENDUNG ROT:
 * `_actions/sitzung.ts` schreibt „use server", „requireLagerbuchHost" und die
 * Namen beider Actions in seine Begruendungskommentare, und die naheliegende
 * „Reparatur" waere das Loeschen genau dieser Begruendungen.
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
 * (`_actions/gate.test.ts:71`, `m/files/api/s/[id]/qr.png/route.test.ts:40`):
 * `vi.mock`-Aufrufe werden an den Dateikopf gehoben, und ein
 * Modulebenen-`const` waere zu diesem Zeitpunkt noch in der temporalen
 * Totzone.
 */
const stand = vi.hoisted(() => ({
  kopf: new Headers(),
  cookieOps: [] as {
    art: "set" | "delete";
    name: string;
    wert?: string;
    opt?: Record<string, unknown>;
  }[],
  umleitungen: [] as string[],
}));

const { gateGesperrt, gateFehlversuchBuchen, redeemToken, getDb } = vi.hoisted(() => ({
  gateGesperrt: vi.fn<(absender: string) => number | null>(),
  gateFehlversuchBuchen: vi.fn<(absender: string) => void>(),
  redeemToken: vi.fn<(code: string, db: unknown) => Promise<unknown>>(),
  getDb: vi.fn<() => unknown>(),
}));

/**
 * ⚠️ `delete` WIRD MIT SEINEN OPTIONEN AUFGEZEICHNET, nicht nur mit dem Namen.
 * Ein Mock, der `delete: (name) => namen.push(name)` schriebe, wuerfe genau das
 * Attribut weg, an dem die Wirksamkeit des Loeschens haengt (`path`), und die
 * Zusicherung „loescht das Cookie" waere gegen die einzige Regression, die hier
 * real droht, blind.
 *
 * ⚠️ ABER: DIESER MOCK IST GROSSZUEGIGER ALS NEXT. Er reicht die Optionen eines
 * `delete(name, opt)` durch; Next verwirft sie an dieser Stelle
 * (`index.js:303`). Was eine `delete`-Fassung rot macht, ist deshalb NICHT das
 * Mitschreiben der Optionen, sondern die Zusicherung `art === "set"` im Test
 * „entfernt das Cookie mit DENSELBEN Attributen …" —
 * wer sie streicht, oeffnet das Loch wieder.
 */
vi.mock("next/headers", () => ({
  headers: async () => stand.kopf,
  cookies: async () => ({
    set: (name: string, wert: string, opt: Record<string, unknown>) => {
      stand.cookieOps.push({ art: "set", name, wert, opt });
    },
    delete: (name: string, opt?: Record<string, unknown>) => {
      stand.cookieOps.push({ art: "delete", name, opt });
    },
  }),
}));

// `redirect()` und `notFound()` WERFEN in der echten Laufzeit einen
// Next-internen Fehler. Fuer die Unit-Aussage genuegt ein erkennbarer Wurf —
// dieselbe Form wie in `_lib/host.test.ts:5-7` und `_actions/gate.test.ts:96`.
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { stand.umleitungen.push(ziel); throw new Error("NEXT_REDIRECT"); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../_lib/gateSchranke", () => ({ gateGesperrt, gateFehlversuchBuchen }));
// ⚠️ N-3: `redeemToken` traegt hier seinen ECHTEN Namen. Ein Alias machte den
// Reihenfolge-Scan aus T64 (`_lib/bauform.test.ts:865`) ueber diese Datei still
// stumm — er sucht `\bredeemToken\s*\(`.
vi.mock("../_lib/schreibpfade/tokenEinloesung", () => ({ redeemToken }));
vi.mock("../_db/client", () => ({ getDb }));

import { erneuereSitzung, beenden } from "./sitzung";

/**
 * Das EINE Handle. Es wird ueber IDENTITAET geprueft (`toBe`), nicht ueber die
 * Struktur: `toHaveBeenCalledWith` vergleicht mit `toEqual`-Semantik, und ein
 * zweiter Opener, der ein gleich geformtes Objekt liefert, bestuende das.
 */
const DB_HANDLE = { marke: "db" };

const CODE_TEXT = "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";

const TREFFER = {
  ok: true as const,
  cookieValue: "jwt.neu",
  tokenId: "tk1",
  zielTyp: null,
  zielId: null,
};

beforeEach(() => {
  stand.cookieOps.length = 0;
  stand.umleitungen.length = 0;
  stand.kopf = new Headers({ host: "lagerbuch.localtest.me" });
  gateGesperrt.mockReset().mockReturnValue(null);
  gateFehlversuchBuchen.mockReset();
  redeemToken.mockReset();
  getDb.mockReset().mockReturnValue(DB_HANDLE);
});
afterEach(() => { vi.clearAllMocks(); });

describe("erneuereSitzung — Schritt 1: der Host-Riegel WIRFT, und er steht ganz vorn", () => {
  it("auf fremdem Host: notFound(), und NICHTS davor ist gelaufen", async () => {
    // §7.3 nimmt den Riegelfall ausdruecklich vom Rueckgabewert-Grundmuster aus.
    //
    // ⚠️ DIE VIER `not.toHaveBeenCalled` SIND DER EIGENTLICHE INHALT. Dass
    // geworfen wird, sagt nur, DASS ein Riegel existiert — nicht, dass er VOR
    // allem anderen steht. Ein Riegel hinter `redeemToken` wuerfe genauso,
    // haette aber `tokens.lastUsedAt` auf dem fremden Host schon geschrieben
    // (`tokenEinloesung.ts:57`: ein einmal eingeloester Code ist nicht mehr
    // loeschbar, nur noch sperrbar).
    stand.kopf = new Headers({ host: "feedback.localtest.me" });

    await expect(erneuereSitzung("482-137")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(gateGesperrt).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(redeemToken).not.toHaveBeenCalled();
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
    expect(stand.cookieOps).toEqual([]);
    expect(stand.umleitungen).toEqual([]);
  });
});

describe("erneuereSitzung — Schritt 2: DIESELBE Sperre wie am Gate, OHNE Datenbankzugriff", () => {
  it("gibt den `zuviele`-Text zurueck und fasst die Datenbank NICHT an", async () => {
    // Schritt 2 schuetzt den DB-Zugriff, nicht der Absender-Eimer: wer den
    // Absenderschluessel rotiert, startet mit leerem Eimer und bekaeme so oder
    // so einen Lookup. Gedeckelt wird das ausschliesslich durch die beiden
    // modulweiten Zaehler, und die lesen VOR jedem DB-Zugriff (§3.5.3).
    gateGesperrt.mockReturnValue(17);

    const r = await erneuereSitzung("482-137");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unerwartet ok");
    expect(r.grund).toBe("gesperrt");
    expect(r.text).toBe("Zu viele Fehlversuche. Bitte in 17 Sekunden erneut versuchen.");
    expect(redeemToken).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(stand.cookieOps).toEqual([]);
  });

  it("bucht bei einer laufenden Sperre KEINEN weiteren Fehlversuch", async () => {
    // Sonst verlaengert jeder Versuch waehrend der Sperre die Sperre — und eine
    // Helferin, die mitten im Check zweimal tippt, kaeme nie wieder herein.
    //
    // Regel 4 — was DIESER Test allein haelt: den Fall „Sperre laeuft". Der
    // Erfolgsfall („fuenf Erfolge verbrauchen kein Budget") liegt weiter unten
    // und wird von hier NICHT mitgetragen: dort laeuft `redeemToken`, hier
    // kommt der Weg nie so weit.
    gateGesperrt.mockReturnValue(17);

    await erneuereSitzung("482-137");

    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("erneuereSitzung — der Absenderschluessel: einmal ermittelt, zweimal benutzt", () => {
  it("prueft und bucht auf DEMSELBEN Schluessel aus den Kopfzeilen (§3.5.2)", async () => {
    // Ohne diese Zusicherung ist eine Buchung auf einen ANDEREN Schluessel
    // (etwa den konstanten Ausfallwert `"direkt"`) still gruen: der
    // Per-Absender-Zaehler zaehlte dann fuer alle zusammen, waehrend die
    // Pruefung je Absender liest. Die Sperre traefe nie den, der sie ausloest.
    stand.kopf = new Headers({ host: "lagerbuch.localtest.me", "cf-connecting-ip": "1.2.3.4" });
    redeemToken.mockResolvedValue({ ok: false });

    await erneuereSitzung("000-000");

    expect(gateGesperrt).toHaveBeenCalledWith("cf:1.2.3.4");
    expect(gateFehlversuchBuchen).toHaveBeenCalledWith("cf:1.2.3.4");
  });
});

describe("erneuereSitzung — Schritt 3: die Normalisierung", () => {
  it("`482137` wird zu `482-137`, BEVOR redeemToken sie sieht (Falle 24)", async () => {
    // N-2: `redeemToken` normalisiert NICHT selbst (`tokenEinloesung.ts:35-40`).
    // Ohne diese Zeile scheitert die Erneuerung MIT RICHTIGEN CODES — und zwar
    // an der Stelle, an der die Helferin gerade zwanzig Minuten Zaehlarbeit
    // retten will.
    redeemToken.mockResolvedValue({ ok: false });

    await erneuereSitzung(" 482137 ");

    expect(redeemToken.mock.calls[0]?.[0]).toBe("482-137");
  });
});

describe("erneuereSitzung — Schritt 4: ein Handle, ein Weg", () => {
  it("reicht GENAU das Objekt aus `getDb()` weiter, und holt es genau einmal", async () => {
    // §5.13.2: `_db/client.ts#getDb()` ist der einzige Opener des Moduls, und
    // `redeemToken` NIMMT das Handle (`tokenEinloesung.ts:50`).
    //
    // ⚠️ IDENTITAET (`toBe`), NICHT STRUKTUR: `toHaveBeenCalledWith` vergleicht
    // mit `toEqual`-Semantik — ein zweiter Opener, der ein gleich geformtes
    // Objekt liefert, bestuende das und waere genau der Fehler, den §5.13.2
    // ausschliesst.
    redeemToken.mockResolvedValue({ ok: false });

    await erneuereSitzung("482-137");

    expect(redeemToken.mock.calls[0]?.[1]).toBe(DB_HANDLE);
    expect(getDb).toHaveBeenCalledTimes(1);
  });
});

describe("erneuereSitzung — Schritt 5: Erfolg, und die Seite bleibt stehen", () => {
  it("setzt ein FRISCHES Cookie mit voller Gueltigkeit und leitet NICHT um", async () => {
    // Der Punkt der Inline-Erneuerung ist, die Seite NICHT zu verlassen: der
    // gesamte Check-Zustand liegt im Client (`CheckFlow.tsx:62-71`, sechs
    // useState), und jede Navigation verwuerfe zehn bis zwanzig Minuten Arbeit.
    //
    // ⚠️ `maxAge` IST NICHT SCHMUECKENDES BEIWERK: `helferCookieOptionen(0)` ist
    // laut `helferSitzung.ts:132-135` das LOESCHEN des Cookies. Eine Sitzung,
    // die mit Gueltigkeit 0 „erneuert" wird, ist im selben Moment weg — und
    // jede andere Zusicherung dieser Datei bliebe gruen. `toBe(...)` allein
    // truege das nicht (Test und Code riefen dieselbe Funktion), deshalb
    // zusaetzlich `toBeGreaterThan(0)`.
    //
    // ⚠️ `toStrictEqual` UND NICHT `toEqual` (N-4, in T66 empirisch belegt):
    // Vitest behandelt bei `toEqual` eine Eigenschaft mit Wert `undefined` wie
    // einen fehlenden Schluessel — `{ok:true, wert:null, grund:undefined}` waere
    // dort gruen.
    redeemToken.mockResolvedValue(TREFFER);

    const r = await erneuereSitzung("482-137");

    expect(r).toStrictEqual({ ok: true, wert: null });
    expect(stand.umleitungen).toEqual([]);
    expect(stand.cookieOps).toHaveLength(1);
    expect(stand.cookieOps[0]?.art).toBe("set");
    expect(stand.cookieOps[0]?.name).toBe("helfer_session");
    expect(stand.cookieOps[0]?.wert).toBe("jwt.neu");
    expect(stand.cookieOps[0]?.opt?.maxAge).toBe(helferGueltigkeitSekunden());
    expect(stand.cookieOps[0]?.opt?.maxAge as number).toBeGreaterThan(0);
    expect(stand.cookieOps[0]?.opt?.httpOnly).toBe(true);
    expect(stand.cookieOps[0]?.opt?.path).toBe("/");
  });

  it("verbraucht KEIN Budget — fuenf Erneuerungen in Folge schliessen das Gate nicht", async () => {
    // ⚠️ DIESE ZUSAGE HAELT NUR DIESER TEST. Der Reihenfolge-Scan aus T64
    // vergleicht POSITIONEN: ein UNBEDINGTES `gateFehlversuchBuchen()` NACH
    // `redeemToken()` steht dort an der richtigen Stelle und ist gruen. Erst
    // hier faellt auf, dass es auch im Erfolgsfall buchte.
    redeemToken.mockResolvedValue(TREFFER);

    for (let i = 0; i < 5; i++) await erneuereSitzung("482-137");

    expect(stand.cookieOps).toHaveLength(5);
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("erneuereSitzung — Schritt 6: Misserfolg ist ein RUECKGABEWERT", () => {
  it("bucht GENAU EINEN Fehlversuch, gibt den `code`-Text zurueck — und wirft NICHT", async () => {
    // Falle 66: jede ERWARTBARE Fehlerlage ist ein Rueckgabewert. Ein Wurf
    // erreichte die Helferin als englischer `digest`-Satz — und die Seite, auf
    // der sie steht, ist genau die, die nicht neu laden darf.
    redeemToken.mockResolvedValue({ ok: false });

    const r = await erneuereSitzung("000-000");

    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unerwartet ok");
    expect(r.grund).toBe("gesperrt");
    expect(r.text).toBe(CODE_TEXT);
    expect(stand.cookieOps).toEqual([]);
    expect(stand.umleitungen).toEqual([]);
  });

  it("KEIN Fehlergrund dieser Action oeffnet ein zweites Erneuerungsfeld im ersten", async () => {
    // §7.4.4: `darfErneuern` (T63) schaltet auf `"sitzung"` das Zahlenfeld EIN —
    // und genau in diesem Feld stehen wir gerade. Ein `"sitzung"` HIER baute ein
    // zweites Feld im ersten auf.
    //
    // ⚠️ GEPRUEFT WIRD `darfErneuern(r.grund)` UND NICHT das Wort „gesperrt":
    // die Zusage ist die WIRKUNG, nicht die Schreibweise. Ein spaeter
    // hinzugefuegter Grund, der ebenfalls erneuern darf, faellt hier auf; ein
    // Vergleich auf ein Literal saehe ihn nicht.
    gateGesperrt.mockReturnValue(17);
    const beiSperre = await erneuereSitzung("482-137");

    gateGesperrt.mockReturnValue(null);
    redeemToken.mockResolvedValue({ ok: false });
    const beiFalschemCode = await erneuereSitzung("000-000");

    expect(beiSperre.ok).toBe(false);
    expect(beiFalschemCode.ok).toBe(false);
    if (beiSperre.ok || beiFalschemCode.ok) throw new Error("unerwartet ok");
    expect(darfErneuern(beiSperre.grund)).toBe(false);
    expect(darfErneuern(beiFalschemCode.grund)).toBe(false);
  });
});

describe("beenden — der Knopf", () => {
  it("entfernt das Cookie mit DENSELBEN Attributen, mit denen es gesetzt wurde, und leitet aufs Gate", async () => {
    // ⚠️ DAS `path` IST DER GANZE INHALT DIESER ZUSICHERUNG. `helferSitzung.ts:132-135`
    // schreibt fest, dass das Loeschen dieselben Attribute tragen muss wie das
    // Setzen, und `abmelden/route.ts` haelt sich als einziger Bestandsweg
    // bereits daran (`helferCookieOptionen(0)`, mit ausgeschriebener Warnung).
    // Nexts `cookies().delete(name)` erzeugt dagegen
    // `set({name, value:"", expires: new Date(0)})` OHNE `path`
    // (`next/dist/compiled/@edge-runtime/cookies/index.js:302-304`, Next 16.2.11
    // im Arbeitsbaum nachgeschlagen) — der Browser scopet das Set-Cookie dann
    // auf das Verzeichnis der Anfrage, das Cookie unter `Path=/` UEBERLEBT, und
    // der Knopf leitet trotzdem auf `/` um. Es SIEHT aus wie Erfolg.
    //
    // ⚠️ „AEUSSERER PFAD": `/` ist die Modulwurzel und damit das Gate (§2.1 b).
    // Ein `redirect("/m/lagerbuch")` landete beim Browser, der nur den
    // Modul-Host kennt. Die Zusicherung `toEqual(["/"])` traegt beides; ein
    // zweiter `not.toMatch(/^\/m\/lagerbuch/)`-Test daneben koennte nach ihr
    // konstruktiv nicht mehr fehlschlagen.
    await expect(beenden()).rejects.toThrow("NEXT_REDIRECT");

    expect(stand.cookieOps).toHaveLength(1);
    // ⚠️ DIESE ZEILE IST DER RIEGEL, NICHT SCHMUCK. Ohne sie bliebe
    // `delete(HELFER_COOKIE, helferCookieOptionen(0))` gruen — der Mock reicht
    // die Optionen brav durch, Next VERWIRFT sie (`index.js:303`, Next 16.2.11:
    // `typeof args[0] === "string" ? [args[0]] : …` laesst `options` undefined).
    // Der Erfolgstest der Nachbaraktion prueft `art` bereits genauso.
    expect(stand.cookieOps[0]?.art).toBe("set");
    expect(stand.cookieOps[0]?.name).toBe("helfer_session");
    expect(stand.cookieOps[0]?.wert).toBe("");
    expect(stand.cookieOps[0]?.opt?.path).toBe("/");
    expect(stand.cookieOps[0]?.opt?.maxAge).toBe(0);
    expect(stand.cookieOps[0]?.opt).toEqual(helferCookieOptionen(0));
    expect(stand.umleitungen).toEqual(["/"]);
  });

  it("widerruft NICHTS serverseitig — es gibt kein `jti` und keinen Einzelwiderruf", async () => {
    // Falle 20, ausdruecklich NICHT behoben (§7.4.1). Wer denselben Code erneut
    // eingibt, ist wieder drin; der Knopf heisst „Beenden", nicht „Kaertchen
    // sperren". Ohne diese Zusicherung waere ein spaeterer „naheliegender"
    // DB-Zugriff im Abmeldeweg gruen — und der macht den Knopf ausgerechnet
    // dann unbrauchbar, wenn die Datenbank klemmt.
    await beenden().catch(() => {});

    expect(getDb).not.toHaveBeenCalled();
    expect(redeemToken).not.toHaveBeenCalled();
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });

  it("prueft den Host NICHT — ein Abmelden darf nie an einem Riegel scheitern", async () => {
    // Der schlechteste denkbare Zustand ist eine Sitzung, die man nicht mehr
    // loswird. `beenden` entfernt nur ein host-only Cookie; auf fremdem Host
    // gibt es keins, und der Aufruf ist dort wirkungslos statt schaedlich.
    //
    // Ohne diese Zusicherung ist ein `requireLagerbuchHost(await headers())` am
    // Kopf von `beenden` still gruen — es sieht wie die Vervollstaendigung des
    // Musters der Nachbar-Action aus und ist genau das Gegenteil.
    //
    // Regel 4 — was DIESER Test allein haelt: dass auf einem FREMDEN Host
    // ueberhaupt noch etwas passiert. Die drei Zusicherungen unten pruefen
    // deshalb GLEICHHEIT mit dem Normalfall, nicht dessen Inhalt: Cookie-Op und
    // Umleitung stehen hier, damit „identisch, auch auf fremdem Host" die volle
    // Aussage ist und nicht nur „das Cookie geht weg". WAS geloescht und WOHIN
    // geleitet wird, haelt der Test darueber — deshalb macht die
    // Redirect-Mutation (M10) bewusst beide rot.
    stand.kopf = new Headers({ host: "feedback.localtest.me" });

    await expect(beenden()).rejects.toThrow("NEXT_REDIRECT");

    expect(stand.cookieOps).toHaveLength(1);
    expect(stand.cookieOps[0]?.name).toBe("helfer_session");
    expect(stand.umleitungen).toEqual(["/"]);
  });
});

describe("_actions/sitzung.ts — Bauform", () => {
  /**
   * Der Rumpf einer Action, ohne Kommentare, ab der Zeile NACH der
   * schliessenden Signaturklammer — zeichengleich zu
   * `_actions/gate.test.ts:379`.
   *
   * ⚠️ DIE KLAMMERTIEFE WIRD MITGEZAEHLT, wie in `_actions/guards.test.ts:98`:
   * ein naives „erste Zeile, die auf `{` endet" naehme bei einer mehrzeiligen
   * Signatur die Deklarationszeile selbst.
   */
  function rumpfDerAction(name: string): string {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    const ab = q.indexOf(`export async function ${name}`);
    expect(ab, `${name} ist in sitzung.ts nicht als \`export async function\` deklariert`)
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

  it('beginnt mit "use server" und exportiert GENAU ZWEI Actions', () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));

    // Die Direktive wirkt NUR als erste Anweisung der Datei. `toMatch(/^"use
    // server";/m)` — die Form des Plans — wuerde sie auch mitten in der Datei
    // akzeptieren, und dort ist sie wirkungslos.
    expect(q.split("\n").map((z) => z.trim()).find((z) => z !== "")).toBe('"use server";');
    expect([...q.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]))
      .toEqual(["erneuereSitzung", "beenden"]);
  });

  it("laesst vor dem Host-Riegel KEINEN Aufruf ausser der Beschaffung der Kopfzeilen zu", () => {
    /**
     * ⚠️ ABWEICHUNG VOM PLAN. Der abgedruckte Test las
     * `rumpf.split("\n").slice(0, 8)` und erwartete darin
     * `requireLagerbuchHost(` — ein Fenster, das nur zufaellig passt (es haengt
     * an der Zeilenzahl eines Kommentars) UND das Falsche sichert: ein Aufruf
     * VOR dem Riegel bliebe innerhalb der ersten acht Zeilen unbemerkt.
     * Stattdessen prueft dieser Test die SACHE.
     *
     * ⚠️ „ERSTE WIRKSAME", NICHT „ERSTE": vor ihm steht `const kopf = await
     * headers();`, und das muss so sein — `kopf` ist sein eigenes Argument.
     *
     * Was der Verhaltenstest oben („NICHTS davor ist gelaufen") NICHT sieht und
     * dieser Scan schon: einen Aufruf vor dem Riegel, dessen Wirkung kein Mock
     * dieser Datei beobachtet.
     */
    const rumpf = rumpfDerAction("erneuereSitzung");
    const riegel = rumpf.indexOf("requireLagerbuchHost(");
    expect(riegel, "der Host-Riegel kommt im Rumpf von erneuereSitzung gar nicht vor")
      .toBeGreaterThanOrEqual(0);

    const aufrufeVorher = [...rumpf.slice(0, riegel).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
      .map((m) => m[1]);

    expect(aufrufeVorher, [
      "Vor `requireLagerbuchHost(` darf im Rumpf NICHTS stehen ausser der",
      "Beschaffung der Kopfzeilen — sie ist das Argument des Riegels selbst.",
    ].join("\n")).toEqual(["headers"]);
  });

  it("`beenden` traegt GAR KEINEN Riegel im Rumpf", () => {
    // Die Gegenprobe zum Verhaltenstest oben, und sie faengt einen Fall, den
    // kein Mock dieser Datei sieht: einen Riegel, der auf dem Testhost
    // durchlaesst (`requireHelferSchreibend`, `requireLagerbuchAdmin`) und erst
    // im Feld zuschlaegt — ausgerechnet in dem Zustand, in dem man abmelden
    // will. `_actions/guards.test.ts:49` fuehrt `beenden` genau deshalb auf der
    // Ausnahmeliste.
    const rumpf = rumpfDerAction("beenden");

    expect(rumpf).not.toMatch(/require(?:LagerbuchHost|LagerbuchAdmin|HelferSchreibend|HelferSitzung)\s*\(/);
  });

  it("traegt AM Beenden-Knopf den Kommentar, der ihn gegen `/abmelden` abgrenzt", () => {
    // Ohne ihn liest ein Reviewer die beiden als Doppel und streicht eines —
    // und welches auch immer er streicht, der verbleibende Weg deckt den
    // anderen Fall nicht (§3.1).
    //
    // ⚠️ GESCHNITTEN, NICHT GEFENSTERT: vom letzten `/**` VOR der Deklaration
    // bis zur Deklaration. Ein „die N Zeilen davor"-Fenster ist der Scan, der
    // spaeter falsch-rot wird und dann abgeschaltet statt repariert.
    const roh = readFileSync(QUELLE, "utf8");
    const deklaration = roh.indexOf("export async function beenden");
    expect(deklaration, "beenden ist nicht als `export async function` deklariert")
      .toBeGreaterThanOrEqual(0);
    const auf = roh.lastIndexOf("/**", deklaration);
    expect(auf, "vor `beenden` steht ueberhaupt kein Blockkommentar").toBeGreaterThanOrEqual(0);
    const kopfkommentar = roh.slice(auf, deklaration);

    expect(kopfkommentar, "der Kopfkommentar von `beenden` nennt `/abmelden` nicht")
      .toMatch(/abmelden/);
    expect(kopfkommentar, "er nennt den Grund nicht: ein Link waere prefetch-faehig")
      .toMatch(/[Pp]refetch/);

    // Und der Beleg, dass es wirklich der KOMMENTAR ist und nicht ein
    // Code-Bezug, der zufaellig so heisst: im Quelltext ohne Kommentare kommt
    // das Wort nicht vor. `beenden` importiert und ruft `/abmelden` NICHT.
    expect(ohneKommentare(roh)).not.toMatch(/abmelden/);
  });
});
