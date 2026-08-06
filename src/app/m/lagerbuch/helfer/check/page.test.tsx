// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import type { TestDb } from "../../_db/testdb";
import { migrierteTestDb } from "../../_db/testdb";
import { tokens } from "../../_db/schema";
import { verfallSchwellen } from "../../_lib/domain/verfall";

const QUELLE = "src/app/m/lagerbuch/helfer/check/page.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die zeichengleiche lokale Kopie statt eines
 * Re-Exports, genau wie `_lib/pwaIcons.test.ts`,
 * `_lib/schreibpfade/tokenEinloesung.test.ts` und `helfer/page.test.tsx` es
 * halten.
 *
 * ⚠️ OHNE SIE IST DER SCAN „benutzt KEIN `redirect`" AUF SEINER EIGENEN
 * BEGRUENDUNG ROT (Befund 1 des Preflight-Scans): der Ansatzpunkt-Kommentar an
 * der `gewaehlt`-Zeile schreibt aus, WARUM hier kein `redirect()` steht, und
 * nennt den Aufruf dabei. Die naheliegende „Reparatur" waere, genau diese
 * Begruendung zu loeschen.
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
 * ⚠️ `_lib/helferZugang.ts` WIRD NICHT GEMOCKT — dieselbe Entscheidung wie in
 * `helfer/page.test.tsx`, und aus demselben Grund (N-11): dass DIESE SEITE
 * `requireHelferSitzung(getDb())` selbst noch einmal ruft, stand bisher nur als
 * Begruendung in einem Kopfkommentar und war nirgends geprueft. Ein Mock von
 * `requireHelferSitzung` koennte den Selbstaufruf nur ALS AUFRUF zaehlen; er
 * koennte nicht zeigen, dass der Riegel dabei wirklich laeuft (Host → Cookie →
 * Datenbank) und dass der Host-Riegel NICHT ein zweites Mal gerufen wird
 * (§2.24).
 *
 * Attrappen sind `next/headers`, `next/navigation`, `_db/client`, die vier
 * Fahrzeug-Lesepfade, die zwei Oberflaechen-Inseln — und `_lib/helferSitzung`
 * (die JWT-Haelfte).
 *
 * ⚠️ WARUM DIE JWT-HAELFTE EINE ATTRAPPE IST: gemessen in T84 — `jose` ist unter
 * `environment: "jsdom"` nicht benutzbar (`SignJWT.sign()` bricht mit
 * „payload must be an instance of Uint8Array", weil jose seinen `TextEncoder`
 * auf Modulebene anlegt und jsdom eigene Realm-Globals stellt). Diese Datei MUSS
 * jsdom sein, weil sie mountet (Befund 4). Signatur und Ablauf des Cookies sind
 * Gegenstand von `_lib/helferSitzung.test.ts`.
 *
 * ⚠️ `_ui/LeerZustand.tsx` wird BEWUSST NICHT gemockt. Nur so ist
 * `href === "/helfer"` ein echter Beleg fuer die Aeusserer-Pfad-Regel (§2.1 g);
 * gegen eine Attrappe waere es eine Zusicherung gegen die Attrappe.
 */
const { GUELTIGES_COOKIE, LAEUFT_AB } = vi.hoisted(() => ({
  GUELTIGES_COOKIE: "cookie-gueltig",
  LAEUFT_AB: new Date("2026-08-04T17:00:00.000Z"),
}));
vi.mock("../../_lib/helferSitzung", () => ({
  HELFER_COOKIE: "helfer_session",
  verifyHelferSitzung: async (wert: string) =>
    wert === GUELTIGES_COOKIE ? { tokenId: "tk1", laeuftAb: LAEUFT_AB } : null,
}));

let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
let cookieWert: string | undefined;

/**
 * ZWEI ZAEHLER FUER N-11 (uebernommen aus `helfer/page.test.tsx`).
 *
 * `requireHelferSitzung` ruft `headers()` genau einmal (erste Anweisung) und
 * `cookies()` danach. Ein Seitenrumpf, der den Riegel GAR NICHT selbst ruft,
 * laesst beide auf 0; einer, der zusaetzlich `requireLagerbuchHost` ruft, hebt
 * `kopfRufe` auf 2.
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

vi.mock("../../_db/client", () => ({ getDb: () => t.db }));

/*
 * ⚠️ DER LESEPFAD HEISST `_lib/lesepfade/o2.ts`, NICHT `sauerstoff.ts` (Regel 1,
 * mechanischer Defekt): der Brief nennt beide Namen, im Baum existiert nur `o2`.
 */
const fahrzeuge = vi.fn<(...a: unknown[]) => unknown[]>(() => []);
const sollFuer = vi.fn<(...a: unknown[]) => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/fahrzeuge", () => ({
  fahrzeugListe: (...a: unknown[]) => fahrzeuge(...a),
  sollFuerFahrzeug: (...a: unknown[]) => sollFuer(...a),
}));
const geraeteFuer = vi.fn<(...a: unknown[]) => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/geraete", () => ({
  geraeteFuerLagerort: (...a: unknown[]) => geraeteFuer(...a),
}));
const flaschenFuer = vi.fn<(...a: unknown[]) => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/o2", () => ({
  o2FlaschenFuerLagerort: (...a: unknown[]) => flaschenFuer(...a),
}));
const verfallFuer = vi.fn<(...a: unknown[]) => Map<string, unknown>>(() => new Map());
vi.mock("../../_lib/lesepfade/verfall", () => ({
  verfallFuerLagerort: (...a: unknown[]) => verfallFuer(...a),
}));

/*
 * Die zwei Inseln werden durch Attrappen ersetzt, die ihre Props als Attribute
 * an den GERENDERTEN Baum haengen (N-8: eine Zusage ueber das gerenderte
 * Ergebnis gehoert an den Baum, nicht an den Dateitext — in T76 blieb ein
 * `toContain`-Scan 18/18 gruen, obwohl die Zusage am Markup fehlte).
 *
 * `data-*-felder` traegt die SCHLUESSELMENGE. Sie ist die einzige Sonde fuer die
 * Kernzusage dieses Tasks: `SollZeile` ist `CheckPos` PLUS `sort`, `herkunft`
 * und `entfernt`, `GeraetZeile` traegt neun Felder mehr als `CheckGeraet` — und
 * weil Arrays kovariant sind und die Ueberschuss-Pruefung nur auf frischen
 * Objektliteralen greift, kompiliert ein Durchreichen OHNE `.map()` sauber.
 * `typecheck` faengt das NICHT.
 */
vi.mock("../../_ui/CheckFlow", () => ({
  CheckFlow: (p: {
    fahrzeug: { id: string; name: string; kennung: string | null };
    soll: Record<string, unknown>[];
    geraete: Record<string, unknown>[];
    flaschen: { letzterDruck: number | null }[];
    verfall: Record<string, string>;
    warn: unknown;
  }) => (
    <div
      data-rolle="flow"
      data-fz={p.fahrzeug.id}
      data-fz-felder={Object.keys(p.fahrzeug).sort().join(",")}
      data-soll-ids={p.soll.map((x) => String(x.id)).join(",")}
      data-soll-felder={Object.keys(p.soll[0] ?? {}).sort().join(",")}
      data-geraete-ids={p.geraete.map((x) => String(x.id)).join(",")}
      data-geraete-felder={Object.keys(p.geraete[0] ?? {}).sort().join(",")}
      data-flaschen-felder={Object.keys(p.flaschen[0] ?? {}).sort().join(",")}
      data-druecke={p.flaschen.map((f) => String(f.letzterDruck)).join(",")}
      data-verfall={JSON.stringify(p.verfall)}
      data-warn={JSON.stringify(p.warn)}
    />
  ),
}));
vi.mock("../../_ui/FahrzeugWahl", () => ({
  FahrzeugWahl: (p: { fahrzeuge: Record<string, unknown>[] }) => (
    <div
      data-rolle="wahl"
      data-anzahl={String(p.fahrzeuge.length)}
      data-ids={p.fahrzeuge.map((f) => String(f.id)).join(",")}
      data-felder={Object.keys(p.fahrzeuge[0] ?? {}).sort().join(",")}
    />
  ),
}));
vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; sitzungsetikett: string; laeuftAb: Date; children: ReactNode }) => (
    <div
      data-rolle="rahmen"
      data-aktiv={p.aktiv}
      data-etikett={p.sitzungsetikett}
      data-laeuftab={p.laeuftAb.toISOString()}
    >
      {p.children}
    </div>
  ),
}));

import CheckSeite, { dynamic as seiteDynamic } from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const TOKEN_ID = "tk1";
/** Ausgeschrieben, NICHT aus denselben Feldern zusammengesetzt (Regel 2). */
const ETIKETT = "Zugang: Token 482-137 · RTW 1";

let t: TestDb;

/** Eine Token-Zeile. `createdBy` ist NOT NULL und gehoert deshalb dazu. */
function tokenAnlegen(aktiv = true): void {
  t.db.insert(tokens).values({
    id: TOKEN_ID, code: "482-137", label: "RTW 1",
    aktiv, createdAt: new Date(), createdBy: "sub-1",
  }).run();
}

/** Eine Zeile aus `fahrzeugListe` — alle fuenf Felder, die der Lesepfad fuehrt. */
const FZ = (id: string, aktiv = true) => ({
  id, name: id.toUpperCase(), kennung: null, aktiv, templateId: null,
});

/** Eine vollstaendige `SollZeile` — inklusive `sort`, `herkunft`, `entfernt`. */
const POS = (id: string, artikelId: string, entfernt = false) => ({
  id, fachLabel: "Fach 1", sort: 1, artikelId, artikelName: "Kompresse",
  einheit: "Stk", handlagerFach: "A-01", soll: 5,
  fahrzeugBestand: 5, handlagerBestand: 10,
  herkunft: "manuell" as const, entfernt,
});

/** Eine vollstaendige `GeraetZeile` — zwoelf Felder, drei davon duerfen weiter. */
const GERAET = (id: string) => ({
  id, typ: "medizin" as const, name: "AED", barcode: "1234",
  lagerortId: "fz-1", lagerortName: "FZ-1", anmerkung: null,
  mtkFaellig: "2027-01-01", beschreibung: null, ablaufdatum: null, aktiv: true,
  faelligkeit: { tage: 500, text: "in 500 Tagen" }, chip: null,
});

const FLASCHE = (id: string, letzterDruck: number | null) => ({
  id, name: `O2 ${id}`, nennfuelldruckBar: 200, letzterDruck,
});

const sp = (o: Record<string, string> = {}) => ({ searchParams: Promise.resolve(o) });

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-checkseite-");
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  umleitungen.length = 0;
  kopfRufe = 0;
  fahrzeuge.mockReturnValue([]);
  sollFuer.mockReturnValue([]);
  geraeteFuer.mockReturnValue([]);
  flaschenFuer.mockReturnValue([]);
  verfallFuer.mockReturnValue(new Map());
  tokenAnlegen();
  cookieWert = GUELTIGES_COOKIE;
});
afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
  t.schliessen();
});

describe("/helfer/check — der Riegel dieser SEITE (N-11)", () => {
  it("wirft auf fremdem Host SELBST — ohne Layout darueber (Falle 17)", async () => {
    /*
     * Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d). Die tragende
     * Zusage sind die aufrufbaren Funktionen — deshalb wird die Seite hier OHNE
     * das Layout gerendert. Und kein einziger Fahrzeug-Lesepfad darf dabei
     * gelaufen sein.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    await expect(CheckSeite(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(cookieGet).not.toHaveBeenCalled();
    expect(fahrzeuge).not.toHaveBeenCalled();
  });

  it("ruft `requireHelferSitzung` SELBST — und den Host-Riegel NICHT zusaetzlich", async () => {
    /*
     * N-11, verhaltensgeprueft. Ein Layout kann einer Seite keine Props reichen;
     * `sitzungsetikett` und `laeuftAb` kommen genau von hier (§7.8.2). Der
     * Mutant, gegen den das steht, ist ein Rumpf, der sich auf das Layout
     * verlaesst und die zwei Werte anders beschafft — `cookieGet` bliebe dann
     * auf 0. `kopfRufe === 1` haelt zugleich §2.24: der Riegel ruft
     * `requireLagerbuchHost` INTERN.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(cookieGet).toHaveBeenCalledTimes(1);
    expect(kopfRufe).toBe(1);
    expect(query("[data-rolle='rahmen']").getAttribute("data-etikett")).toBe(ETIKETT);
    expect(query("[data-rolle='rahmen']").getAttribute("data-laeuftab"))
      .toBe("2026-08-04T17:00:00.000Z");
  });

  it("WARTET den Riegel ab — ein gesperrter Token kommt nicht durch", async () => {
    /*
     * Der Mutant ist ein fehlendes `await`: die Umleitung waere dann eine
     * unbehandelte Ablehnung in einem Promise, und die Seite renderte weiter.
     * Zusaetzlich: kein Lesepfad darf gelaufen sein.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    t.db.update(tokens).set({ aktiv: false }).run();
    await expect(CheckSeite(sp())).rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
    expect(umleitungen).toEqual(["/abmelden?grund=gesperrt"]);
    expect(fahrzeuge).not.toHaveBeenCalled();
  });
});

describe("/helfer/check — der Schnitt aufs Fahrzeug (Falle 15)", () => {
  it("kein Fahrzeug angelegt: LeerZustand mit Rueckweg, KEIN CheckFlow", async () => {
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='leer-titel']").textContent).toBe("Kein Fahrzeug angelegt");
    expect(exists("[data-rolle='flow']")).toBe(false);
    expect(exists("[data-rolle='wahl']")).toBe(false);
    // AEUSSERER Pfad (§2.1 g) — ein innerer wuerde auf dem Modul-Host doppelt
    // praefixiert. `LeerZustand` ist deshalb ECHT und nicht gemockt.
    expect(query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href"))
      .toBe("/helfer");
    expect(sollFuer).not.toHaveBeenCalled();
  });

  it("mehrere Fahrzeuge, kein `?fz=`: die WAHL, und KEINE Fahrzeugdaten geladen", async () => {
    // DER GANZE PUNKT DES SCHNITTS: erst waehlen, DANN laden. Sonst wandert die
    // Soll-Bestueckung, Geraeteliste, Flaschenliste und Verfallslage der
    // GESAMTEN Organisation in den RSC-Payload — auf ein privates Telefon, in
    // einer Sitzung ohne Konto (§3.4.5).
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='wahl']").getAttribute("data-anzahl")).toBe("2");
    expect(exists("[data-rolle='flow']")).toBe(false);
    expect(sollFuer).not.toHaveBeenCalled();
    expect(geraeteFuer).not.toHaveBeenCalled();
    expect(flaschenFuer).not.toHaveBeenCalled();
    expect(verfallFuer).not.toHaveBeenCalled();
  });

  it("reicht in die Wahl NUR id, name und kennung", async () => {
    // `fahrzeugListe` traegt zusaetzlich `aktiv` und `templateId`. Beides ist
    // Verwaltungswissen und hat auf einem privaten Telefon nichts zu suchen.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='wahl']").getAttribute("data-felder"))
      .toBe("id,kennung,name");
    expect(query("[data-rolle='wahl']").getAttribute("data-ids")).toBe("fz-1,fz-2");
  });

  it("laedt NUR fuer das gewaehlte Fahrzeug — alle vier Lesepfade genau einmal", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp({ fz: "fz-2" })));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-2");
    for (const [name, spion] of [
      ["sollFuerFahrzeug", sollFuer], ["geraeteFuerLagerort", geraeteFuer],
      ["o2FlaschenFuerLagerort", flaschenFuer], ["verfallFuerLagerort", verfallFuer],
    ] as const) {
      expect(spion, name).toHaveBeenCalledTimes(1);
      expect(spion, name).toHaveBeenCalledWith(t.db, "fz-2");
    }
  });

  it("reicht in den Flow NUR id, name und kennung des Fahrzeugs", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-fz-felder"))
      .toBe("id,kennung,name");
  });

  it("genau EIN aktives Fahrzeug: kein Waehlen, und KEIN redirect", async () => {
    // §7.11: ein redirect waere eine zusaetzliche Anfrage und ein geschriebener
    // Pfad mehr, den jemand aeusser/innen verwechseln kann. Das Rendern kostet
    // nichts. `umleitungen` ist der Beleg — die Attrappe von `next/navigation`
    // sammelt JEDES `redirect()`.
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-1");
    expect(exists("[data-rolle='wahl']")).toBe(false);
    expect(umleitungen).toEqual([]);
  });

  it("blendet INAKTIVE Fahrzeuge aus", async () => {
    // Zwei Zeilen, davon eine stillgelegt: waere der Filter weg, gaebe es zwei
    // aktive — also die WAHL statt des Flows.
    fahrzeuge.mockReturnValue([FZ("fz-1", false), FZ("fz-2")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-2");
    expect(exists("[data-rolle='wahl']")).toBe(false);
  });

  it("ein `?fz=` auf ein INAKTIVES Fahrzeug wird verworfen", async () => {
    /*
     * Regel 4 — dieser Test und der naechste halten VERSCHIEDENE Zweige:
     * hier zeigt die verworfene Wahl auf eine EXISTIERENDE, aber stillgelegte
     * Zeile, und es bleibt genau ein aktives Fahrzeug uebrig (Rueckfall auf den
     * Einzelfall). Sonst laedt eine geratene ID die Daten eines stillgelegten
     * Fahrzeugs.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-alt", false)]);
    await mount(await CheckSeite(sp({ fz: "fz-alt" })));
    expect(query("[data-rolle='flow']").getAttribute("data-fz")).toBe("fz-1");
    expect(sollFuer).toHaveBeenCalledWith(t.db, "fz-1");
  });

  it("ein `?fz=` auf eine erfundene ID bei MEHREREN Fahrzeugen zeigt die Wahl", async () => {
    // Der andere Zweig: die ID existiert ueberhaupt nicht, und es bleibt kein
    // Einzelfall zum Zurueckfallen — also die Wahl, und KEIN Ladevorgang.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await CheckSeite(sp({ fz: "gibt-es-nicht" })));
    expect(exists("[data-rolle='wahl']")).toBe(true);
    expect(exists("[data-rolle='flow']")).toBe(false);
    expect(sollFuer).not.toHaveBeenCalled();
  });

  it("filtert Grabstein-Positionen (`entfernt`) aus dem Soll — am VERHALTEN", async () => {
    /*
     * Befund 44: der Plan prueft hier eine SCHREIBWEISE
     * (`/filter\(\(p\) => !p\.entfernt\)/`) und ruft `CheckSeite` gar nicht auf.
     * Ein semantisch identisches `.filter(p => !p.entfernt)` machte das rot,
     * dieselbe Zeile an beliebiger anderer Stelle gruen. Hier zaehlt, was im
     * Flow ankommt.
     *
     * Grabsteine sind auf dem Fahrzeug bewusst NICHT vorhanden → nicht Teil des
     * Checks (1:1 aus `helfer/check/page.tsx:15`).
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    sollFuer.mockReturnValue([POS("sp-1", "a1"), POS("sp-2", "a2", true)]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-soll-ids")).toBe("sp-1");
  });

  it("reicht vom Soll NUR die neun Anzeigefelder — `sort`, `herkunft`, `entfernt` bleiben", async () => {
    /*
     * DIE ZWEITE HAELFTE DES SCHNITTS, und die einzige Sonde dafuer.
     * `SollZeile` ist `CheckPos` PLUS `sort`, `herkunft` und `entfernt`. Weil
     * Arrays kovariant sind und die Ueberschuss-Pruefung nur auf frischen
     * Objektliteralen greift, kompiliert ein Durchreichen OHNE `.map()` sauber —
     * `typecheck` und `build` sehen nichts, und drei Verwaltungsfelder je
     * Position landen im RSC-Payload.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    sollFuer.mockReturnValue([POS("sp-1", "a1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-soll-felder"))
      .toBe("artikelId,artikelName,einheit,fachLabel,fahrzeugBestand,handlagerBestand,handlagerFach,id,soll");
  });

  it("reicht von den Geraeten NUR id, typ und name", async () => {
    // `GeraetZeile` traegt zwoelf Felder — darunter `barcode`, `anmerkung`,
    // `beschreibung`, `mtkFaellig` und die gerechnete `faelligkeit`. Der Check
    // braucht drei.
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    geraeteFuer.mockReturnValue([GERAET("g-1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-geraete-felder"))
      .toBe("id,name,typ");
    expect(query("[data-rolle='flow']").getAttribute("data-geraete-ids")).toBe("g-1");
  });

  it("reicht `letzterDruck` UNVERAENDERT durch — auch `null` (Befund 29)", async () => {
    /*
     * `_lib/lesepfade/o2.ts` setzt `letzterDruck` auf `null`, wenn NIE gemessen
     * wurde. Der Typ ist seit Teil 3 nullbar, und der Grund ist ein Fehlalarm
     * auf einem Medizinprodukte-Nachweis: eine fehlende Messung wurde vorher als
     * „0 bar" gelesen → Ampel rot → jemand lief los, um eine VOLLE Flasche zu
     * tauschen. Ein `?? 0` an dieser Stelle stellte genau das wieder her, und
     * `typecheck` haette nichts dagegen. `CheckFlow.tsx:826` loest den Null-Fall
     * als „noch nicht gemessen" auf (T79) — diese Seite darf ihn deshalb NICHT
     * vorher verschlucken.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    flaschenFuer.mockReturnValue([FLASCHE("o-1", 190), FLASCHE("o-2", null)]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-druecke")).toBe("190,null");
    expect(query("[data-rolle='flow']").getAttribute("data-flaschen-felder"))
      .toBe("id,letzterDruck,name,nennfuelldruckBar");
  });

  it("reduziert die Verfallslage auf die Monatszeichenkette je Artikel", async () => {
    // `VerfallAmLagerort` traegt zusaetzlich `erfasstAt`, `ampel`, `abgelaufen`
    // und `text`. Der Flow rechnet die Ampel selbst — aus `verfall` und `warn`,
    // und genau deshalb koennen Chip und Abschlusszahl konstruktiv nicht
    // auseinanderfallen (§7.9.3).
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    verfallFuer.mockReturnValue(new Map([
      ["a1", {
        artikelId: "a1", verfall: "2027-03", erfasstAt: new Date("2026-08-01T00:00:00.000Z"),
        ampel: "gruen", abgelaufen: false, text: "läuft ab 03/2027",
      }],
    ]));
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-verfall"))
      .toBe('{"a1":"2027-03"}');
  });

  it("reicht die Verfallsschwellen vom SERVER herein", async () => {
    // Die Ampel im Zaehlschritt rechnet der Client damit; die Schwellen sind
    // Betriebsgrenzen (`LAGERBUCH_VERFALL_*_TAGE`) und im Client nicht lesbar.
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='flow']").getAttribute("data-warn"))
      .toBe(JSON.stringify(verfallSchwellen()));
  });
});

describe("/helfer/check — der Rahmen", () => {
  it("setzt `aktiv=\"check\"` in JEDER der drei Lagen", async () => {
    const lagen = [[], [FZ("fz-1"), FZ("fz-2")], [FZ("fz-1")]];
    const erwarteteKinder = ["leer-titel", "wahl", "flow"];
    // Die Schleife laeuft ueber ein Literal, kann also nicht leer sein — der
    // Zaehler haelt trotzdem fest, dass alle drei Lagen wirklich geprueft wurden
    // (Regel 2: eine Schleife ohne Durchlauf fuehrt null Zusicherungen aus).
    let geprueft = 0;
    for (const [i, lage] of lagen.entries()) {
      fahrzeuge.mockReturnValue(lage);
      await mount(await CheckSeite(sp()));
      expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("check");
      // Und es ist wirklich die jeweils ANDERE Lage, nicht dreimal dieselbe.
      expect(exists(`[data-rolle='${erwarteteKinder[i]}']`)).toBe(true);
      geprueft += 1;
      await unmount();
    }
    expect(geprueft).toBe(3);
  });

  it("haengt den Inhalt INNERHALB des Rahmens", async () => {
    // Sass er auf einem Geschwister, faenden die `--lb-*`-Variablen ihn nicht —
    // und der Fehler waere STILL: eine nicht aufloesbare CSS-Variable ist
    // gueltiges CSS und faellt auf `transparent` zurueck (Falle 2).
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await CheckSeite(sp()));
    expect(query("[data-rolle='rahmen']").contains(query("[data-rolle='flow']"))).toBe(true);
  });
});

describe("Bauform", () => {
  it("traegt den Ansatzpunkt-Kommentar AN der `gewaehlt`-Zeile (offene Frage 5)", () => {
    /*
     * ANSATZPUNKT 1 VON 2. Der zweite ist die erste Zeile von `checkAbschluss`
     * (`_actions/check.ts`), und dort steht die Marke bereits.
     *
     * Ein blosses `toMatch(/scope_lagerort_id/)` — so druckt der Plan es ab —
     * bliebe gruen, wenn der Kommentar irgendwo sonst in der Datei staende. Der
     * Brief sagt aber „die `gewaehlt`-Zeile traegt einen Kommentar, der GENAU
     * DIE STELLE markiert". Also: den zusammenhaengenden `//`-Block UEBER der
     * `gewaehlt`-Zeile ablesen und dort suchen.
     *
     * ⚠️ Dieser Scan liest den ROHTEXT und darf es: er prueft die ANWESENHEIT
     * eines Kommentars. `ohneKommentare()` machte ihn strukturell unerfuellbar.
     */
    const zeilen = readFileSync(QUELLE, "utf8").split("\n");
    const i = zeilen.findIndex((z) => /^\s*const gewaehlt\b/.test(z));
    expect(i, "keine `const gewaehlt`-Zeile gefunden").toBeGreaterThan(0);
    const block: string[] = [];
    for (let j = i - 1; j >= 0 && zeilen[j].trimStart().startsWith("//"); j--) {
      block.unshift(zeilen[j]);
    }
    expect(block.length).toBeGreaterThan(0);
    expect(block.join("\n")).toMatch(/scope_lagerort_id/);
  });

  it("benutzt KEIN `redirect` — auch nicht bei genau einem Fahrzeug", () => {
    // Der Verhaltensbeleg steht oben (`umleitungen` bleibt leer). Dieser Scan
    // haelt zusaetzlich fest, dass der Aufruf gar nicht erst im Rumpf steht —
    // und laeuft ueber `ohneKommentare()`, weil die Begruendung an der
    // `gewaehlt`-Zeile das Wort selbst nennt (Regel 1, Befund 1).
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/redirect\s*\(/);
  });

  it("ist `force-dynamic`", () => {
    // Der WERT des Exports, nicht seine Schreibweise im Dateitext.
    expect(seiteDynamic).toBe("force-dynamic");
  });
});
