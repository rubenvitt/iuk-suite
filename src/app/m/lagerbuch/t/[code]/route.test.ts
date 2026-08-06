import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE ZWEITE GATE-FLAECHE — der gescannte Zugangs-Kaertchen-QR (§7.2.3).
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
 * Die Auflage nennt T82 namentlich. Wer sie hier nicht abdeckt, hat sie
 * NIRGENDS abgedeckt.
 *
 * ⚠️ DIESE ROUTE HAT HEUTE NULL E2E (Falle 32), und der Mehrhost-Fall ist in
 * Vitest NICHT darstellbar: es gibt keinen zweiten Host, gegen den ein
 * relatives `Location` anders aufloeste als ein absolutes. Der Nachweis liegt
 * in Teil 6, T171. WAS HIER PRUEFBAR IST — Status 303, RELATIVES `Location` in
 * JEDEM Zweig, `Set-Cookie` auf DERSELBEN Antwort —, ist deshalb umso
 * vollstaendiger geprueft.
 *
 * ⚠️ `_lib/host.ts` ist BEWUSST NICHT gemockt. Der Host-Riegel ist die Zusage
 * dieser Datei mit der groessten Datenwirkung; ein Mock ersetzte genau das
 * Verhalten, das geprueft werden soll, durch eine Vereinbarung des Tests mit
 * sich selbst. Gefahren wird gegen die echte Registry
 * (`core/registry.ts:157-164` trifft `<key>.localtest.me`).
 */

const QUELLE = "src/app/m/lagerbuch/t/[code]/route.ts";

/**
 * ZEICHENGLEICH aus `_lib/bauform.test.ts:84-104` kopiert. Die Funktion ist dort
 * NICHT exportiert (N-5); `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts`, `_actions/gate.test.ts` und
 * `_actions/sitzung.test.ts` halten es genauso.
 *
 * ⚠️ OHNE SIE IST JEDER NEGATIVE SCAN DIESER DATEI AUF SEINER EIGENEN
 * BEGRUENDUNG ROT: `t/[code]/route.ts` schreibt „Bewusst NICHT
 * `NextResponse.redirect(…)`" in den Kommentar, der genau diesen Scan erklaert
 * — und die naheliegende „Reparatur" waere das Loeschen dieser Begruendung.
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
 * (`_actions/sitzung.test.ts:86`, `_actions/gate.test.ts:71`): `vi.mock`-Aufrufe
 * werden an den Dateikopf gehoben, und ein Modulebenen-`const` waere zu diesem
 * Zeitpunkt noch in der temporalen Totzone.
 */
const { gateGesperrt, gateFehlversuchBuchen, redeemToken, getDb } = vi.hoisted(() => ({
  gateGesperrt: vi.fn<(absender: string) => number | null>(),
  gateFehlversuchBuchen: vi.fn<(absender: string) => void>(),
  redeemToken: vi.fn<(code: string, db: unknown) => Promise<unknown>>(),
  getDb: vi.fn<() => unknown>(),
}));

vi.mock("../../_lib/gateSchranke", () => ({ gateGesperrt, gateFehlversuchBuchen }));
// ⚠️ N-3: `redeemToken` traegt hier seinen ECHTEN Namen. Ein Alias machte den
// Reihenfolge-Scan aus T64 (`_lib/bauform.test.ts`) ueber diese Datei still
// stumm — er schneidet den Funktionskoerper anhand von `redeemToken(`.
vi.mock("../../_lib/schreibpfade/tokenEinloesung", () => ({ redeemToken }));
vi.mock("../../_db/client", () => ({ getDb }));

import { GET } from "./route";

/**
 * Das EINE Handle. Es wird ueber IDENTITAET geprueft (`toBe`), nicht ueber die
 * Struktur: `toHaveBeenCalledWith` vergleicht mit `toEqual`-Semantik, und ein
 * zweiter Opener, der ein gleich geformtes Objekt liefert, bestuende das.
 */
const DB_HANDLE = { marke: "db" };

/**
 * ⚠️ `req.url` traegt nach dem Rewrite den INNEREN Pfad — genau der Grund,
 * warum der Handler daraus keine absolute URL bauen darf. Der aeussere Host
 * steht ausschliesslich in der `host`-Kopfzeile, und `intern.invalid` ist
 * bewusst ein Name, der nirgends aufloest: taucht er je in einem `Location`
 * auf, ist die Basis aus `req.url` gebaut worden.
 */
function anfrage(
  pfad: string,
  host = "lagerbuch.localtest.me",
  weitere: Record<string, string> = {},
): Request {
  return new Request(`http://intern.invalid/m/lagerbuch${pfad}`, {
    headers: { host, ...weitere },
  });
}
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

const TREFFER = {
  ok: true as const,
  cookieValue: "jwt.x.y",
  tokenId: "tk1",
  zielTyp: "fahrzeug" as const,
  zielId: "fz-1",
};

/**
 * Die Cookie-Lebensdauer kommt aus `grenzen()` und haengt damit an der
 * Umgebung. Sie wird fuer die Dauer der Datei auf die Vorgabe geklemmt, damit
 * die Zahl unten (12 h × 3600 = 43200) eine ZUSAGE ist und nicht der Zufall
 * einer gesetzten Variablen.
 */
const STUNDEN_VORHER = process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN;

beforeEach(() => {
  delete process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN;
  gateGesperrt.mockReset().mockReturnValue(null);
  gateFehlversuchBuchen.mockReset();
  // Ein Vorgabewert, damit eine Mutation, die einen Riegel ENTFERNT, an der
  // Zusicherung scheitert und nicht an einem `undefined.ok` — die Meldung soll
  // die Regel nennen, die fehlt, nicht den Folgefehler.
  redeemToken.mockReset().mockResolvedValue({ ok: false });
  getDb.mockReset().mockReturnValue(DB_HANDLE);
});
afterEach(() => {
  vi.clearAllMocks();
  if (STUNDEN_VORHER === undefined) delete process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN;
  else process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = STUNDEN_VORHER;
});

describe("/t/<code> — Schritt 1: Host", () => {
  it("antwortet auf fremdem Host mit 404, und NICHTS davor ist gelaufen", async () => {
    // Ein `notFound()` ist keine brauchbare Antwort auf einen GESCANNTEN
    // QR-Code; der Handler baut seine 404 selbst (Teil 1, T10).
    //
    // ⚠️ DIE VIER `not.toHaveBeenCalled` SIND DER EIGENTLICHE INHALT. Dass 404
    // kommt, sagt nur, DASS ein Riegel existiert — nicht, dass er VOR allem
    // anderen steht. Ein Riegel hinter `redeemToken` antwortete genauso mit
    // 404, haette aber `tokens.lastUsedAt` auf dem fremden Host schon
    // geschrieben, und das Cookie fuer die fremde Herkunft ausgestellt.
    const r = await GET(anfrage("/t/482-137", "feedback.localtest.me"), ctx("482-137"));

    expect(r.status).toBe(404);
    expect(gateGesperrt).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expect(redeemToken).not.toHaveBeenCalled();
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
    expect(r.headers.get("Location")).toBeNull();
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("auf dem EIGENEN Host antwortet er NICHT mit 404", async () => {
    // Die Gegenprobe zum Test darueber. Ohne sie bliebe ein Handler gruen, der
    // JEDE Anfrage mit 404 beantwortet — der Host-Riegel waere dann als
    // „vorhanden" zugesichert, ohne je zu unterscheiden.
    redeemToken.mockResolvedValue(TREFFER);
    const r = await GET(anfrage("/t/482-137"), ctx("482-137"));
    expect(r.status).toBe(303);
  });
});

describe("/t/<code> — Schritt 2: Sperre, OHNE Datenbankzugriff", () => {
  it("leitet mit `?grund=zuviele` aufs Gate und fasst die Datenbank NICHT an", async () => {
    // §3.9 — DAS GATE LIEST DEN GRUND (Falle 60). Heute schreibt der Handler
    // `?err=rate`, und niemand liest es: wer zu oft getippt hat, landet wortlos
    // auf dem Gate.
    //
    // `getDb` statt nur `redeemToken`: die Sperre ist genau deshalb OHNE
    // Datenbankzugriff gebaut (`gateSchranke.ts`, „LIEST NUR") — sie SCHUETZT
    // den Zugriff. Faellt ein `getDb()` davor, ist der Deckel wirkungslos, und
    // zwar still.
    gateGesperrt.mockReturnValue(42);

    const r = await GET(anfrage("/t/482-137"), ctx("482-137"));

    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/?grund=zuviele");
    expect(getDb).not.toHaveBeenCalled();
    expect(redeemToken).not.toHaveBeenCalled();
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("gibt die Sekundenzahl NICHT mit — das Gate liest sie selbst", async () => {
    // §7.2.4/§3.9: dieselbe Schranke, dieselben Absender-Kopfzeilen. Eine
    // mitgegebene Zahl waere eine zweite Wahrheit, die im Moment des Anzeigens
    // schon veraltet ist — und sie kaeme aus der URL, also aus Nutzerhand.
    gateGesperrt.mockReturnValue(42);
    const l = (await GET(anfrage("/t/482-137"), ctx("482-137"))).headers.get("Location") ?? "";
    expect(l).not.toMatch(/42/);
    expect(l).toBe("/?grund=zuviele");
  });

  it("nimmt `returnTo` in die Gate-URL mit", async () => {
    gateGesperrt.mockReturnValue(42);
    const r = await GET(anfrage("/t/482-137?returnTo=%2Fa%2Fart-9"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/?returnTo=%2Fa%2Fart-9&grund=zuviele");
  });

  it("verwirft ein feindliches `returnTo` AUCH auf dem Sperr-Weg", async () => {
    // Der Sperr-Weg ist der Zweig, den ein Angreifer am billigsten erreicht:
    // fuenf Fehlversuche, und jeder Aufruf danach nimmt ihn. Ein
    // durchgereichtes `returnTo` waere dort ein Open Redirect ohne jede
    // Kenntnis eines Codes.
    gateGesperrt.mockReturnValue(42);
    const r = await GET(anfrage("/t/482-137?returnTo=%2F%5Cboese.example"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/?grund=zuviele");
  });
});

describe("/t/<code> — Schritt 3 und 4: normalisieren, dann einloesen", () => {
  it("normalisiert den Code, BEVOR redeemToken ihn sieht", async () => {
    // `redeemToken` normalisiert NICHT selbst (N-2, `tokenEinloesung.ts:34-40`);
    // die Normalisierung liegt beim Aufrufer. Ein Aufruf ohne sie scheitert
    // STILL am Erfolgspfad: die Gleichheitssuche gegen `tokens.code` findet
    // `482137` nicht, und die Helferin sieht „unbekannt oder gesperrt" — mit
    // einem RICHTIGEN Code.
    redeemToken.mockResolvedValue({ ok: false });

    await GET(anfrage("/t/482137"), ctx("482137"));

    expect(redeemToken).toHaveBeenCalledTimes(1);
    expect(redeemToken.mock.calls[0]![0]).toBe("482-137");
  });

  it("reicht das Handle aus `getDb()` IDENTISCH durch", async () => {
    // §5.13.2: `_db/client.ts#getDb()` ist der einzige Opener des Moduls. Ein
    // Schreibpfad, der sich selbst eins holte, waere der erste, der die Regel
    // aufweicht — deshalb Identitaet (`toBe`) und nicht Struktur: ein zweiter
    // Opener, der ein gleich geformtes Objekt liefert, bestuende `toEqual`.
    redeemToken.mockResolvedValue({ ok: false });

    await GET(anfrage("/t/482-137"), ctx("482-137"));

    expect(getDb).toHaveBeenCalledTimes(1);
    expect(redeemToken.mock.calls[0]![1]).toBe(DB_HANDLE);
  });
});

describe("/t/<code> — Schritt 5: Erfolg", () => {
  it("antwortet 303 mit RELATIVEM Location und setzt das Cookie auf DIESER Antwort", async () => {
    // Ein relatives Location loest der Browser gegen die URL auf, die ER sah:
    // den aeusseren Modul-Host (RFC 7231 §7.1.2). Cookie und Landung koennen
    // damit KONSTRUKTIV nicht auseinanderfallen (Falle 16).
    //
    // 303 und nicht 302: die Antwort auf ein GET soll auch nach dem Folgen ein
    // GET sein, und 303 sagt das ausdruecklich.
    redeemToken.mockResolvedValue(TREFFER);

    const r = await GET(anfrage("/t/482-137"), ctx("482-137"));

    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/helfer/check?fz=fz-1");

    const cookie = r.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("helfer_session=jwt.x.y");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    // 12 h × 3600 = 43200 — die Vorgabe aus `grenzen.ts`
    // (LAGERBUCH_HELFER_SITZUNG_STUNDEN, vorgabe: 12), im `beforeEach`
    // geklemmt. Ohne diese Zusicherung bliebe ein `helferCookieOptionen(0)`
    // gruen — und das ist die LOESCH-Form: die Sitzung waere im selben Moment
    // tot, in dem sie entsteht, und die Helferin landete in einer Schleife.
    expect(cookie).toContain("Max-Age=43200");
    // KEIN `domain` — das Cookie ist host-only, und genau diese Eigenschaft
    // laesst die Sitzungen den Cutover ueberleben (§7.4.1, R1).
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("das Location ist RELATIV — es traegt weder Schema noch Host noch den inneren Pfad", async () => {
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: "artikel", zielId: "art-9",
    });

    const l = (await GET(anfrage("/t/482-137"), ctx("482-137"))).headers.get("Location") ?? "";

    expect(l).toBe("/a/art-9");
    expect(l).not.toMatch(/^https?:/);
    expect(l).not.toContain("intern.invalid");
    // Und es traegt NICHT den inneren Pfad aus `req.url`.
    expect(l).not.toMatch(/^\/m\/lagerbuch/);
  });

  it("ein ausdrueckliches `returnTo` hat Vorrang vor dem Code-Ziel", async () => {
    redeemToken.mockResolvedValue(TREFFER);
    const r = await GET(anfrage("/t/482-137?returnTo=%2Fa%2Fart-9"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/a/art-9");
  });

  it("ein feindliches `returnTo` wird verworfen", async () => {
    // `/\boese.example` — der Browser normalisiert `/\…` zu `//…` und landet
    // protokoll-relativ auf fremder Herkunft (`_lib/returnTo.ts:29`). Ohne
    // `sanitizeReturnTo` stuende genau dieser Wert im `Location`.
    redeemToken.mockResolvedValue({
      ok: true, cookieValue: "jwt", tokenId: "tk1", zielTyp: null, zielId: null,
    });
    const r = await GET(anfrage("/t/482-137?returnTo=%2F%5Cboese.example"), ctx("482-137"));
    expect(r.headers.get("Location")).toBe("/helfer");
  });

  it("verbraucht KEIN Budget", async () => {
    // Die Auflage aus `_lib/bauform.test.ts` (B2): der Quelltext-Scan sieht
    // POSITION, nicht BEDINGTHEIT — ein UNBEDINGTES `gateFehlversuchBuchen()`
    // NACH `redeemToken()` ist dort gruen. Hier ist es rot.
    redeemToken.mockResolvedValue(TREFFER);
    await GET(anfrage("/t/482-137"), ctx("482-137"));
    expect(gateFehlversuchBuchen).not.toHaveBeenCalled();
  });
});

describe("/t/<code> — Schritt 6: Misserfolg", () => {
  it("bucht den Fehlversuch und leitet mit `?grund=code` aufs Gate", async () => {
    // Heute schreibt der Handler `?err=code`, und NIEMAND liest es: wer ein
    // gesperrtes Kaertchen scannt, landet wortlos auf dem Gate (Falle 60).
    redeemToken.mockResolvedValue({ ok: false });

    const r = await GET(anfrage("/t/000-000"), ctx("000-000"));

    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/?grund=code");
    expect(gateFehlversuchBuchen).toHaveBeenCalledTimes(1);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("leitet den Absenderschluessel aus den Kopfzeilen ab und bucht auf DENSELBEN", async () => {
    // ⚠️ DIE KOPFZEILE IST DER PUNKT, nicht nur die Gleichheit. Ohne sie
    // laeuft der ganze Testsatz gegen kopflose Anfragen, `absenderAus` liefert
    // ueberall den konstanten Wert „direkt", und ein
    // `const absender = "direkt"` im Handler bliebe gruen — gemessen: 21/21.
    // Der Schluessel waere dann fuer ALLE Anfragen derselbe Eimer, und die
    // Per-Absender-Grenze (§3.5.2) waere still zur modulweiten geworden.
    //
    // Und die Gleichheit bleibt der zweite Teil: eine zweite Ableitung waere
    // der Ort, an dem Pruefung und Buchung auseinanderlaufen — der Zaehler
    // fuellte einen Eimer, den niemand liest.
    redeemToken.mockResolvedValue({ ok: false });

    await GET(
      anfrage("/t/000-000", "lagerbuch.localtest.me", { "cf-connecting-ip": "203.0.113.7" }),
      ctx("000-000"),
    );

    expect(gateGesperrt).toHaveBeenCalledTimes(1);
    expect(gateGesperrt).toHaveBeenCalledWith("cf:203.0.113.7");   // `absender.ts:48-51`
    expect(gateFehlversuchBuchen).toHaveBeenCalledWith("cf:203.0.113.7");
    expect(gateFehlversuchBuchen).toHaveBeenCalledWith(gateGesperrt.mock.calls[0]![0]);
  });

  it("nimmt `returnTo` auch in die Misserfolgs-Gate-URL mit", async () => {
    // Ohne das verliert jede Helferin, die ueber ein Artikel-Etikett kam und
    // sich vertippt hat, ihr Ziel — und landet nach dem zweiten Versuch auf
    // `/helfer` statt beim Material in der Hand.
    redeemToken.mockResolvedValue({ ok: false });
    const r = await GET(anfrage("/t/000-000?returnTo=%2Fa%2Fart-9"), ctx("000-000"));
    expect(r.headers.get("Location")).toBe("/?returnTo=%2Fa%2Fart-9&grund=code");
  });
});

describe("/t/<code> — die Querschnittszusage: JEDES Location ist relativ", () => {
  it("kein einziger Zweig baut eine absolute URL", async () => {
    // ⚠️ DAS IST DIE ZUSAGE DIESER DATEI, und sie gilt fuer ALLE Zweige, nicht
    // fuer den einen, den ein Einzeltest zufaellig anfasst. Ein Handler, der
    // nur den Erfolgsweg relativ haelt und die Gate-Umleitung aus `req.url`
    // baut, schickt die Helferin nach `http://intern.invalid/?grund=code` —
    // einen Namen, der nirgends aufloest.
    const zweige: (() => Promise<Response>)[] = [
      () => { gateGesperrt.mockReturnValue(42); return GET(anfrage("/t/482-137"), ctx("482-137")); },
      () => { redeemToken.mockResolvedValue({ ok: false }); return GET(anfrage("/t/000-000"), ctx("000-000")); },
      () => { redeemToken.mockResolvedValue(TREFFER); return GET(anfrage("/t/482-137"), ctx("482-137")); },
      () => {
        redeemToken.mockResolvedValue({ ok: true, cookieValue: "j", tokenId: "t", zielTyp: "artikel", zielId: "art-9" });
        return GET(anfrage("/t/482-137"), ctx("482-137"));
      },
      () => {
        redeemToken.mockResolvedValue({ ok: true, cookieValue: "j", tokenId: "t", zielTyp: null, zielId: null });
        return GET(anfrage("/t/482-137?returnTo=%2Fa%2Fb"), ctx("482-137"));
      },
    ];

    const orte: string[] = [];
    for (const zweig of zweige) {
      gateGesperrt.mockReturnValue(null);
      const r = await zweig();
      const l = r.headers.get("Location");
      expect(l, "jeder Zweig antwortet mit einem Location").not.toBeNull();
      expect(r.status, "jeder Zweig antwortet mit 303").toBe(303);
      orte.push(l!);
    }

    // Ohne diese Zeile pruefte eine leere Liste null Zusicherungen und waere
    // gruen.
    expect(orte.length).toBe(5);
    for (const l of orte) {
      expect(l, l).toMatch(/^\/(?!\/)/);       // relativ, und nicht protokoll-relativ
      expect(l, l).not.toMatch(/^https?:/);
      expect(l, l).not.toContain("intern.invalid");
      expect(l, l).not.toMatch(/^\/m\/lagerbuch/);
    }
  });
});

describe("Bauform", () => {
  it("benutzt `lagerbuchHostOderNull`, nicht die werfende Form", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/lagerbuchHostOderNull/);
    expect(q).not.toMatch(/requireLagerbuchHost/);
  });

  it("benutzt KEIN `NextResponse.redirect` und KEINE Basis-URL", () => {
    // Beides ist Falle 16. `NextResponse.redirect` verlangt eine absolute URL,
    // und jede absolute URL hier ist entweder aus einer Basis-Variablen geraten
    // oder aus `req.url` gebaut — und `req.url` traegt nach dem Rewrite den
    // INNEREN Pfad.
    //
    // ⚠️ GELESEN WIRD `ohneKommentare`: der Kopfkommentar der Quelle schreibt
    // „Bewusst NICHT `NextResponse.redirect(…)`" — auf dem Rohtext waere dieser
    // Scan auf seiner eigenen Begruendung rot (Befund 1).
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/NextResponse\.redirect|appBaseUrl|APP_BASE_URL|SUITE_HOST_LAGERBUCH/);
  });

  it("ist `force-dynamic`", () => {
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).toMatch(
      /export const dynamic = "force-dynamic"/,
    );
  });

  it("traegt den Rueckfall-Kommentar fuer den Fall, dass der E2E die Form widerlegt", () => {
    // §7.2.3: Herkunft aus `x-forwarded-host` bauen — NIE aus der
    // Konfiguration. Ohne den Satz baut der naechste Mensch die Basis-Variable
    // wieder ein.
    //
    // ⚠️ HIER BEWUSST DER ROHTEXT, als einziger Scan dieser Datei: die Zusage
    // IST die Existenz des Kommentars. `ohneKommentare` machte ihn
    // konstruktiv unerfuellbar.
    expect(readFileSync(QUELLE, "utf8")).toMatch(/x-forwarded-host/);
  });
});
