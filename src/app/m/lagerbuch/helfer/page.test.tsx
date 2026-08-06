// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { tokens } from "../_db/schema";

const LAYOUT = "src/app/m/lagerbuch/helfer/layout.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die zeichengleiche lokale Kopie statt eines
 * Re-Exports, genau wie `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts` und `page.test.tsx` es halten.
 *
 * ⚠️ OHNE SIE IST DER SCAN „raeumt KEIN Cookie" DETERMINISTISCH ROT (Befund 1
 * des Preflight-Scans, Fundstelle `:10109`): `helfer/layout.tsx` traegt den
 * Satz „`cookies()` ist dort versiegelt" in ihrem Begruendungskommentar, weil
 * §3.4.4 genau das konserviert haben will. Die naheliegende „Reparatur" waere,
 * den Kommentar zu loeschen — also genau die Begruendung, um die es geht.
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

/*
 * ⚠️ `_lib/helferZugang.ts` WIRD NICHT GEMOCKT — und das ist der Kern dieser
 * Datei (Befund 37 des Preflight-Scans).
 *
 * Der Plan druckt in `helfer/layout.tsx` `requireLagerbuchHost(await headers())`
 * ZUSAETZLICH zu `requireHelferSitzung(getDb())` ab. Global Constraint 24 sagt
 * wortwoertlich das Gegenteil: „`requireHelferSitzung` und
 * `requireHelferSchreibend` rufen `requireLagerbuchHost` INTERN, als erste
 * Anweisung. Wer sie benutzt, ruft den Host-Riegel NICHT noch einmal."
 * (`_lib/host.ts` schreibt denselben Satz in seiner Aufruftabelle aus.)
 *
 * Der Test des Plans („wirft auf fremdem Host, BEVOR die Sitzung gefragt wird")
 * mockt `requireHelferSitzung` weg und kann deshalb NUR gruen werden, wenn der
 * ueberzaehlige Aufruf im Layout steht — er zementiert den Verstoss. Deshalb
 * faehrt diese Datei den ECHTEN Riegel gegen eine ECHTE migrierte Test-DB und
 * ein ECHT signiertes Cookie (dieselbe Vorrichtung wie
 * `_lib/helferZugang.test.ts`) und prueft die INTERNE Reihenfolge:
 *
 *   Host → Cookie → Datenbank.
 *
 * Attrappen sind nur `next/headers`, `next/navigation`, `_db/client`, die
 * beiden Oberflaechenteile — und `_lib/helferSitzung` (die JWT-Haelfte).
 *
 * ⚠️ WARUM DIE JWT-HAELFTE EINE ATTRAPPE IST, obwohl `_lib/helferZugang.test.ts`
 * dort mit einem ECHT signierten Cookie faehrt: GEMESSEN, nicht vermutet —
 * `jose` ist unter `environment: "jsdom"` nicht benutzbar. `SignJWT.sign()`
 * bricht mit „TypeError: payload must be an instance of Uint8Array"
 * (`jose@6.2.7/dist/webapi/jws/flattened/sign.js:9`), weil jose seinen
 * `TextEncoder` auf MODULEBENE anlegt und jsdom eigene Realm-Globals stellt;
 * ein spaeteres Ueberschreiben von `globalThis.TextEncoder` kommt zu spaet
 * (nachgestellt in einer Wegwerf-Testdatei, weiterhin rot). `helferZugang.test.ts`
 * laeuft in der Vorgabeumgebung `node` und hat das Problem nicht — diese Datei
 * MUSS jsdom sein, weil sie mountet (Befund 4).
 *
 * Der Tausch kostet nichts an dieser Stelle: Signatur und Ablauf des Cookies
 * sind Gegenstand von `_lib/helferSitzung.test.ts`, hier geht es um die
 * REIHENFOLGE Host → Cookie → Datenbank und darum, wer den Riegel ruft.
 */
/*
 * `vi.hoisted` und nicht `const`: `vi.mock`-Fabriken werden ueber die Importe
 * gehoben und laufen, wenn das gemockte Modul zum ersten Mal geladen wird — also
 * BEVOR eine gewoehnliche `const`-Zeile dieser Datei ausgefuehrt waere. Ein
 * direkter Zugriff darauf endet in der temporalen Totzone.
 */
const { GUELTIGES_COOKIE, LAEUFT_AB } = vi.hoisted(() => ({
  GUELTIGES_COOKIE: "cookie-gueltig",
  LAEUFT_AB: new Date("2026-08-04T17:00:00.000Z"),
}));
vi.mock("../_lib/helferSitzung", () => ({
  HELFER_COOKIE: "helfer_session",
  verifyHelferSitzung: async (wert: string) =>
    wert === GUELTIGES_COOKIE ? { tokenId: "tk1", laeuftAb: LAEUFT_AB } : null,
}));
let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
let cookieWert: string | undefined;

/**
 * ZWEI ZAEHLER, DIE DIE GANZE BEFUND-37-ZUSAGE TRAGEN.
 *
 * `requireHelferSitzung` ruft `headers()` genau einmal (erste Anweisung) und
 * `cookies()` danach. Ein Seiten- oder Layout-Rumpf, der den Host-Riegel noch
 * einmal selbst ruft, braucht dafuer eigene Kopfzeilen — `kopfRufe` steht dann
 * auf 2 statt auf 1. Ein Rumpf, der auf fremdem Host trotzdem bis zum Cookie
 * kaeme, hoebe `cookieGet` von 0.
 */
let kopfRufe = 0;
const cookieGet = vi.fn((name: string) =>
  name === "helfer_session" && cookieWert !== undefined ? { name, value: cookieWert } : undefined,
);

vi.mock("next/headers", () => ({
  headers: async () => { kopfRufe += 1; return hostKopf; },
  cookies: async () => ({ get: cookieGet }),
}));

const umleitungen: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { umleitungen.push(ziel); throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../_db/client", () => ({ getDb: () => t.db }));

const liste = vi.fn<(...args: unknown[]) => unknown[]>(() => []);
vi.mock("../_lib/lesepfade/artikel", () => ({
  artikelListe: (...args: unknown[]) => liste(...args),
}));

/*
 * Die beiden Oberflaechenteile werden durch Attrappen ersetzt, die ihre Props
 * als Attribute an den GERENDERTEN Baum haengen (N-8: eine Zusage ueber das
 * gerenderte Ergebnis gehoert an den Baum, nicht an den Dateitext — gemessen in
 * T76, wo ein `toContain`-Scan 18/18 gruen blieb, obwohl die Zusage am Markup
 * fehlte).
 */
vi.mock("../_ui/ArtikelSuche", () => ({
  ArtikelSuche: (p: { artikel: Record<string, unknown>[] }) => (
    <div
      data-rolle="suche"
      data-anzahl={String(p.artikel.length)}
      data-felder={Object.keys(p.artikel[0] ?? {}).sort().join(",")}
    />
  ),
}));
vi.mock("../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; sitzungsetikett: string; children: ReactNode }) => (
    <div data-rolle="rahmen" data-aktiv={p.aktiv} data-etikett={p.sitzungsetikett}>
      {p.children}
    </div>
  ),
}));

import HelferSeite, { dynamic as seiteDynamic } from "./page";
import HelferLayout, { dynamic as layoutDynamic } from "./layout";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

/**
 * Die Fixture-Zeile. `code` und `label` kommen aus DIESER Zeile in das Etikett —
 * nicht aus der Cookie-Nutzlast (§3.4.3) —, deshalb steht der erwartete Satz
 * unten ausgeschrieben und wird NICHT aus denselben Feldern zusammengesetzt.
 */
const TOKEN_ID = "tk1";
const ETIKETT = "Zugang: Token 482-137 · RTW 1";

let t: TestDb;

/** Eine Token-Zeile. `createdBy` ist NOT NULL und gehoert deshalb dazu. */
function tokenAnlegen(aktiv = true): void {
  t.db.insert(tokens).values({
    id: TOKEN_ID, code: "482-137", label: "RTW 1",
    aktiv, createdAt: new Date(), createdBy: "sub-1",
  }).run();
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-helferseite-");
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  umleitungen.length = 0;
  kopfRufe = 0;
  liste.mockReturnValue([]);
  tokenAnlegen();
  cookieWert = GUELTIGES_COOKIE;
});
afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
  t.schliessen();
});

describe("helfer/layout.tsx — NUR der Riegel", () => {
  it("wirft auf fremdem Host, OBWOHL Cookie und Token gueltig sind — und VOR dem Cookie", async () => {
    /*
     * DIE SITZUNG IST HIER VOLLSTAENDIG GUELTIG, und das ist der Punkt: nur so
     * unterscheidet der Test „der Host-Riegel greift" von „irgendetwas hat
     * abgewiesen". Ohne Cookie waere derselbe Test auch dann rot, wenn der
     * Host-Riegel fehlte — er wuerfe dann eine Umleitung ans Gate.
     *
     * ⚠️ `_lib/helferZugang.test.ts` haelt diesen Fall NICHT (Regel 4): dort
     * laeuft der Host-Test mit `cookieWert = undefined`. Diese Datei traegt
     * zusaetzlich, dass der Riegel den Host prueft, BEVOR er das Cookie liest —
     * `cookieGet` bleibt unberuehrt.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    await expect(HelferLayout({ children: null })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(cookieGet).not.toHaveBeenCalled();
    expect(umleitungen).toEqual([]);
  });

  it("ruft `requireLagerbuchHost` NICHT selbst — der Riegel ruft ihn INTERN (§2.24)", async () => {
    /*
     * BEFUND 37, verhaltensgeprueft. `requireHelferSitzung` liest die Kopfzeilen
     * genau einmal; ein zusaetzliches `requireLagerbuchHost(await headers())` im
     * Layout — so druckt der Plan es ab — machte daraus zwei.
     */
    await mount(await HelferLayout({ children: <p data-rolle="kind">X</p> }));
    expect(kopfRufe).toBe(1);
    // Und der Riegel ist wirklich gelaufen, nicht nur nicht doppelt gelaufen.
    expect(cookieGet).toHaveBeenCalledTimes(1);
  });

  it("reicht die Kinder durch und rendert KEINEN Rahmen (§7.8.2)", async () => {
    // Der Rahmen wandert in die drei Seiten, weil die Aktivmarkierung ein
    // Server-Prop ist und ein Layout einer Seite keine Props reichen kann.
    await mount(await HelferLayout({ children: <p data-rolle="kind">X</p> }));
    expect(query("[data-rolle='kind']").textContent).toBe("X");
    expect(exists("[data-rolle='rahmen']")).toBe(false);
    expect(exists("[data-testid='lb-tableiste']")).toBe(false);
  });

  it("WARTET den Riegel ab — ein gesperrter Token kommt nicht durch", async () => {
    /*
     * Der Mutant, gegen den das steht, ist ein fehlendes `await`: die Umleitung
     * des Riegels waere dann eine unbehandelte Ablehnung in einem Promise, und
     * das Layout renderte die Kinder klaglos weiter. Typkorrekt, lint-sauber,
     * still.
     *
     * Der Weg ueber `/abmelden` ist derselbe Grund, aus dem diese Datei kein
     * Cookie raeumt (siehe naechster Test).
     */
    t.db.update(tokens).set({ aktiv: false }).run();
    await expect(HelferLayout({ children: <p data-rolle="kind">X</p> }))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
    expect(umleitungen).toEqual(["/abmelden?grund=gesperrt"]);
  });

  it("raeumt KEIN Cookie — eine Server Component kann das nicht", () => {
    // `next/dist/.../request-cookies.js:53` traegt den Satz „Cookies can only be
    // modified in a Server Action or Route Handler" woertlich. Sperr- und
    // Ablauffall gehen ueber /abmelden (Teil 2, T26) — der Test darueber zeigt,
    // dass sie dort ankommen.
    expect(ohneKommentare(readFileSync(LAYOUT, "utf8"))).not.toMatch(/cookies\(\)/);
  });

  it("ist `force-dynamic`", () => {
    // Der WERT des Exports, nicht seine Schreibweise im Dateitext.
    expect(layoutDynamic).toBe("force-dynamic");
  });
});

describe("helfer/page.tsx", () => {
  it("wirft auf fremdem Host SELBST — ohne Layout darueber (Falle 17, N-11)", async () => {
    /*
     * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d). Die tragende
     * Zusage sind die aufrufbaren Funktionen — deshalb wird die Seite hier OHNE
     * das Layout gerendert. Zugleich die Verhaltensprobe zu N-11: dass die Seite
     * `requireHelferSitzung` selbst noch einmal ruft, stand bisher nur als
     * Begruendung in einem Kopfkommentar.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    await expect(HelferSeite()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(cookieGet).not.toHaveBeenCalled();
    expect(liste).not.toHaveBeenCalled();
  });

  it("ruft den Riegel SELBST — und den Host-Riegel NICHT zusaetzlich", async () => {
    // Nicht aus Misstrauen gegen das Layout, sondern weil `sitzungsetikett` und
    // `laeuftAb` genau von dort kommen. Der zweite Aufruf ist billig: dasselbe
    // gecachte Handle, derselbe Primaerschluessel-Lookup.
    await mount(await HelferSeite());
    expect(cookieGet).toHaveBeenCalledTimes(1);
    expect(kopfRufe).toBe(1);
    expect(query("[data-rolle='rahmen']").getAttribute("data-etikett")).toBe(ETIKETT);
  });

  it("setzt `aktiv=\"entnahme\"`", async () => {
    await mount(await HelferSeite());
    expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("entnahme");
  });

  it("reicht NUR die fuenf Anzeigefelder in die Insel", async () => {
    // Die Liste traegt serverseitig mehr (mindestbestand, chargeKritisch,
    // naechsteCharge …). Alles davon landete im RSC-Payload auf einem privaten
    // Telefon, ohne dass die Seite es zeigt.
    liste.mockReturnValue([{
      id: "a1", name: "Kompresse", einheit: "Stk", fach: "A-01", bestand: 42,
      mindestbestand: 10, aktiv: true, unterMindest: false, chargeKritisch: false,
      naechsteCharge: { chargenNr: "L1", verfall: "2027-03" },
    }]);
    await mount(await HelferSeite());
    expect(query("[data-rolle='suche']").getAttribute("data-felder"))
      .toBe("bestand,einheit,fach,id,name");
  });

  it("laesst das Ausblenden inaktiver Artikel beim Lesepfad — und filtert NICHT selbst", async () => {
    /*
     * `artikelListe` OHNE `inklInaktiv` liefert nur aktive (Teil 3, T51). Zwei
     * Zusagen, und beide verhaltensgeprueft statt als Schreibweise (Befund 44):
     *
     *  1. der Aufruf hat GENAU EIN Argument — ein `{ inklInaktiv: true }` hebt
     *     die Laenge auf 2. `toHaveLength` und nicht `toEqual([db])`: Vitest
     *     behandelt bei `toEqual` ein `undefined`-Element wie ein fehlendes
     *     (N-4), ein `artikelListe(db, undefined)` schluepfte durch.
     *  2. was der Lesepfad liefert, geht UNGEFILTERT weiter. Ein zweiter Filter
     *     in der Seite (`.filter((a) => a.aktiv)`) machte aus 2 eine 1.
     */
    liste.mockReturnValue([
      { id: "a1", name: "Kompresse", einheit: "Stk", fach: "A-01", bestand: 42, aktiv: true },
      { id: "a2", name: "Altbestand", einheit: "Stk", fach: "A-02", bestand: 0, aktiv: false },
    ]);
    await mount(await HelferSeite());
    expect(liste).toHaveBeenCalledTimes(1);
    expect(liste.mock.calls[0]).toHaveLength(1);
    expect(liste.mock.calls[0][0]).toBe(t.db);
    expect(query("[data-rolle='suche']").getAttribute("data-anzahl")).toBe("2");
  });

  it("traegt den Satz, der die Systemkamera erklaert", async () => {
    // 1:1 aus `helfer/page.tsx:12`. Er ist die einzige Stelle, an der die
    // Anwendung sagt, dass das Regaletikett ein Einstieg ist.
    await mount(await HelferSeite());
    expect(query("[data-rolle='helfer-hinweis']").textContent)
      .toBe("Regaletikett scannen öffnet den Artikel direkt — oder hier suchen.");
  });

  it("haengt Hinweis und Insel INNERHALB des Rahmens", async () => {
    // Saessen sie auf einem Geschwister, faenden die `--lb-*`-Variablen sie
    // nicht — und der Fehler waere STILL: eine nicht aufloesbare CSS-Variable
    // ist gueltiges CSS und faellt auf `transparent` zurueck (Falle 2).
    await mount(await HelferSeite());
    const rahmen = query("[data-rolle='rahmen']");
    expect(rahmen.contains(query("[data-rolle='helfer-hinweis']"))).toBe(true);
    expect(rahmen.contains(query("[data-rolle='suche']"))).toBe(true);
  });

  it("ist `force-dynamic`", () => {
    expect(seiteDynamic).toBe("force-dynamic");
  });
});
