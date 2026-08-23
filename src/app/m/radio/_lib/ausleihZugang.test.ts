// src/app/m/radio/_lib/ausleihZugang.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../_db/schema";
import { zugangscodes } from "../_db/schema";

/**
 * DAS ZUGANGSPRAEDIKAT (Spec 1 §3.5, Zeilen 2632-2786; Testauftrag §3.8, Zeilen 3089-3094).
 *
 * ⚠️ DREI NEXT-NAEHTE WERDEN GEMOCKT, UND JEDE HAT EINEN GRUND:
 *   `next/headers`   — `headers()`/`cookies()` brauchen einen Anfragekontext, den vitest
 *                      nicht hat.
 *   `next/navigation`— `redirect()` wirft in Next einen Sentinel; hier wird der Aufruf
 *                      SICHTBAR gemacht, statt ihn zu verschlucken.
 *   `@/core/auth`    — `auth()` liest das Suite-JWT.
 *
 * ⛔ WAS DIESE DATEI DAMIT NICHT BELEGT: dass die Riegel bei einem ECHTEN Abruf GREIFEN
 * (⬜ A-L9, Erbe von Z-L1, `riegel.test.ts:49-53`). Sie belegt die LOGIK des Praedikats.
 * Kein Fall hier darf etwas anderes behaupten.
 */
const hostRiegel = vi.fn();
const kopfzeilenGelesen = vi.fn();
const cookieGelesen = vi.fn();
const redirectRuf = vi.fn((ziel: string) => {
  throw new Error(`REDIRECT:${ziel}`);
});
let sitzung: unknown = null;
let cookieWert: string | undefined;

vi.mock("next/headers", () => ({
  headers: async () => {
    kopfzeilenGelesen();
    return new Headers({ host: "radio.localtest.me" });
  },
  cookies: async () => ({
    get: (n: string) => {
      cookieGelesen(n);
      return n === "radio_ausleihe" && cookieWert ? { value: cookieWert } : undefined;
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (z: string) => redirectRuf(z),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("./host", async (echt) => ({
  ...(await echt<typeof import("./host")>()),
  requireRadioHost: (h: Headers) => hostRiegel(h),
}));

import { createAusleihSitzung, verifyAusleihSitzung } from "./ausleihSitzung";
import {
  ausleihZugangOderNull,
  requireAusleihZugang,
  requireAusleihSchreibend,
} from "./ausleihZugang";

/**
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (KONTEXT.md:95-97): dessen Cache ist per
 * MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`). Vorbild:
 * `src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts:34-47`.
 *
 * ⚠️ `foreign_keys = ON` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig AUS.
 */
const GEHEIMNIS = "radio-test-geheimnis-mindestens-32-zeichen-lang";
const UMGEBUNG = { ...process.env };

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

/**
 * DER ABFRAGEZAEHLER — ausgeschrieben, nicht als Proxy auf `db.select`.
 *
 * Er haengt an `better-sqlite3`s `prepare`, das `drizzle-orm/better-sqlite3` fuer JEDE
 * Anweisung ruft; er zaehlt damit die tatsaechlich abgesetzten SQL-Anweisungen und nicht
 * nur die Aufrufe eines einzelnen Bauteils der Abfragekette. Gepatcht wird NACH `migrate`,
 * damit die Migrationsanweisungen nicht in die Grundlinie fallen.
 *
 * ⛔ EIN ZAEHLER, DER NIE HOCHZAEHLT, MACHT DEN FALL „Weg 2 kostet keinen Datenbankzugriff"
 * ZU EINEM KONSTANTEN GRUEN. Deshalb misst derselbe Fall zusaetzlich die GEGENPROBE auf dem
 * Code-Weg (Delta > 0) — der Praezedenzfall dieses Repos ist eine Abschlusszeile, die
 * „Paritaet gruen" als konstanten Text meldete.
 *
 * ⚠️ `toBeGreaterThan(0)` STATT `toBe(1)` IST EINE GEWAEHLTE LOCKERUNG, KEINE NT11-FORM
 * (Fix-Runde 1, Fund K2). Gemessen kostet der Code-Weg heute GENAU EINE Anweisung je
 * Aufruf. Zugesichert wird trotzdem nur „> 0", weil die Gegenprobe eine ZAEHLER-Probe ist:
 * ihre Frage lautet „zaehlt der Zaehler ueberhaupt", nicht „wie viele Anweisungen setzt
 * `drizzle` ab". Ein `toBe(1)` machte aus einem Detail der Bibliothek eine Zusage — und
 * faerbte den Fall bei einem Update rot, ohne dass sich das Verhalten geaendert haette.
 */
let abfragen = 0;
const zaehleAbfragen = () => abfragen;

beforeEach(() => {
  process.env = { ...UMGEBUNG, RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIMNIS };
  tmp = mkdtempSync(join(tmpdir(), "radio-ausleihzugang-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  const echtesPrepare = sqlite.prepare.bind(sqlite);
  sqlite.prepare = ((sql: string) => {
    abfragen += 1;
    return echtesPrepare(sql);
  }) as typeof sqlite.prepare;
  db = drizzle(sqlite, { schema });
  abfragen = 0;

  // ⛔ JEDER FALL STARTET AUS DEMSELBEN ZUSTAND. Ohne diese Zeilen truege der naechste
  // Fall das Cookie und die verbrauchte `mockImplementationOnce` des vorigen mit sich, und
  // die Datei bestuende nur in ihrer heutigen Reihenfolge.
  sitzung = null;
  cookieWert = undefined;
  hostRiegel.mockReset();
  kopfzeilenGelesen.mockClear();
  cookieGelesen.mockClear();
  redirectRuf.mockClear();
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  process.env = { ...UMGEBUNG };
});

// ⚠️ JEDES ZEICHEN STEHT IN `CODE_ALPHABET` (`_lib/code.ts:53`) — Crockford-Base32 OHNE
// I, L, O, U. Ein Fixture-Code, den der Erzeuger des Moduls nie ausgeben koennte, waere
// eine Erfindung mit gueltigem Aussehen.
const CODE = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";

async function legeCodeAn(werte: Partial<typeof zugangscodes.$inferInsert> = {}) {
  const zeile = {
    id: "zc-1",
    code: CODE,
    bezeichnung: "Aufsteller Fahrzeughalle",
    aktiv: true,
    createdAt: new Date(),
    createdBy: "sub-admin",
    ...werte,
  };
  await db.insert(zugangscodes).values(zeile);
  return zeile;
}

/**
 * Praegt ein Sitzungs-Cookie, SETZT `cookieWert` und liefert den SOLLWERT fuer `laeuftAb`.
 *
 * ⚠️ DER SOLLWERT KOMMT AUS DEMSELBEN DECODER, DEN DIE IMPLEMENTIERUNG BENUTZT
 * (`verifyAusleihSitzung`, `_lib/ausleihSitzung.ts:141-151`). Das ist Absicht und keine
 * Nachlaessigkeit: die Frage, die die `laeuftAb`-Zusicherungen entscheiden, lautet „stammt
 * `laeuftAb` ueberhaupt aus dem `exp` DIESES Cookies" — und genau das faengt Sonde R-A7h
 * (`laeuftAb: new Date(0)`). Eine zweite, selbst nachgerechnete Zeitspanne belegte nichts,
 * was diese Zusicherung nicht schon belegt, und waere die Erfindung eines Sollwerts.
 *
 * ⛔ KEIN `!`-OPERATOR AUF DEM ERGEBNIS: laesst sich das eben selbst gepraegte Cookie nicht
 * wieder lesen, ist die Vorbedingung des Falles kaputt und der Fall soll LAUT scheitern,
 * nicht mit `undefined` gegen `undefined` gruen werden.
 */
async function praegeSitzung(codeId: string): Promise<Date> {
  cookieWert = await createAusleihSitzung({ codeId });
  const soll = await verifyAusleihSitzung(cookieWert);
  if (!soll) throw new Error("das selbst gepraegte Cookie liess sich nicht wieder lesen");
  return soll.laeuftAb;
}

/*
 * ⛔ DER MOCK DER SUITE-SITZUNG TRAEGT `id`, NICHT `sub`. `viewerAusSession` liest
 * `session.user.id` und gibt `null` zurueck, wenn es fehlt (`_lib/zugang.ts:62-72`);
 * `sub` ist ihr AUSGABEname, nicht ihr Eingabename. Mit `{ user: { sub: … } }` faellt
 * `befund` in den Code-Zweig, und der wichtigste Fall dieser Datei („Suite-Sitzung
 * schlaegt ein gesperrtes Code-Cookie") liefert `null` statt `{ weg: "suite", … }` —
 * bei RICHTIGER Implementierung.
 */
const SUITE_SITZUNG = { user: { id: "s-1", name: "Anna", groups: [] } };

describe("radio-Ausleihzugang: die Reihenfolge des Befunds", () => {
  it("der Host-Riegel laeuft, BEVOR das Cookie angefasst wird", async () => {
    /*
     * ⛔ NS-Z1 UND PFLICHT 16 (`docs/radio-portierung-analyse.md:973-977`): „(iii) innen,
     * im Zugangspraedikat selbst ist die tragende — Server Actions haben kein Layout ueber
     * sich."
     *
     * ⛔ UND DER FALL PRUEFT ZUSAETZLICH, DASS DIE KOPFZEILEN GENAU EINMAL GELESEN WERDEN
     * (Testauftrag Spec:3092). Ein zweiter Aufruf des Host-Riegels aus einer Seite oder
     * Action heraus (die naheliegende „Sicherheitsverbesserung") behauptet, das Praedikat
     * sei host-blind — und macht aus „hostgebunden durch Konstruktion" eine Liste, die
     * jemand vergessen kann.
     *
     * ⚠️ DIE DRITTE ZUSICHERUNG IST DIE, DIE DER NAME VERSPRICHT: das Cookie wurde NICHT
     * angefasst. Ein Riegel, der zwar wirft, aber erst nach dem Cookie-Lesen, bestuende
     * die ersten beiden Zusicherungen und hiesse trotzdem falsch.
     */
    hostRiegel.mockImplementationOnce(() => {
      throw new Error("HOST");
    });
    cookieWert = "egal";
    await expect(ausleihZugangOderNull(db as never)).rejects.toThrow("HOST");
    expect(hostRiegel).toHaveBeenCalledTimes(1);
    expect(cookieGelesen, "das Cookie wurde vor dem Host-Riegel gelesen").not.toHaveBeenCalled();
  });

  it("liest die Kopfzeilen genau einmal je Aufruf", async () => {
    /*
     * ⛔ BEIDE WEGE, UND DAS IST DER PUNKT DES FALLES (Fix-Runde 1, Fund W4). Die erste
     * Haelfte faehrt den SUITE-Weg — der steigt bei Schritt 2 aus, und alles ab Schritt 3
     * waere von ihm unbewacht. Ein ZWEITER `requireRadioHost(await headers())` auf dem
     * Code-Weg — die naheliegende „Sicherheitsverbesserung", vor der `_lib/host.ts:117-121`
     * warnt — bliebe damit unentdeckt, obwohl der Name des Falles und der Testauftrag
     * (Spec:3092) beide Wege versprechen. Sonde R-A7i.
     *
     * ⚠️ ZWISCHEN DEN HAELFTEN WIRD DER ZAEHLER GELEERT, NICHT KUMULIERT. Ein `toBe(2)` am
     * Ende waere eine Aussage ueber DIESEN TESTRUMPF (zwei Aufrufe darin), nicht ueber das
     * Praedikat (eine Lesung je Aufruf).
     */
    sitzung = SUITE_SITZUNG;
    kopfzeilenGelesen.mockClear();
    await ausleihZugangOderNull(db as never);
    expect(kopfzeilenGelesen, "Suite-Weg").toHaveBeenCalledTimes(1);

    await legeCodeAn();
    await praegeSitzung("zc-1");
    sitzung = null;
    kopfzeilenGelesen.mockClear();
    await ausleihZugangOderNull(db as never);
    expect(kopfzeilenGelesen, "Code-Weg").toHaveBeenCalledTimes(1);
  });
});

describe("radio-Ausleihzugang: die zwei Wege, und wer wen schlaegt", () => {
  it("Suite-Sitzung schlaegt ein gesperrtes Code-Cookie", async () => {
    /*
     * ⛔ DER AUSHEBELUNGSFALL AUS SPEC:2694-2708, und der wichtigste dieser Datei. Ein
     * angemeldetes Mitglied mit abgelaufenem oder gesperrtem Code-Cookie ist der
     * REGELFALL — nicht die Ausnahme. Prueft `befund` den Code zuerst, wird die Person
     * faelschlich zum Gate geleitet: typkorrekt, lint-sauber, fuer `pnpm build`
     * unsichtbar, und im Betrieb ein Mensch, der sich nicht erklaeren kann, warum die
     * Suite ihn nach dem Anmelden nach einem Code fragt.
     *
     * BEIDE gleichzeitig gesetzt -> `weg: "suite"`.
     */
    await legeCodeAn({ id: "zc-gesperrt", aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-gesperrt" });
    sitzung = SUITE_SITZUNG; // `id`, nicht `sub` — Kommentar oben
    const z = await ausleihZugangOderNull(db as never);
    expect(z).toEqual({ weg: "suite", sub: "s-1", name: "Anna" });
  });

  it("Weg 2 kostet keinen Datenbankzugriff", async () => {
    /*
     * Spec:2704-2706. Der Fall haelt fest, WARUM die Reihenfolge so ist und nicht nur,
     * DASS sie so ist: `auth()` liest das Suite-JWT, kein `SELECT`. Ein Umbau, der auch
     * fuer angemeldete Personen in die Tabelle sieht, waere auf jeder Seite ein
     * zusaetzlicher Lookup — und wuerde diesen Fall rot faerben, statt still
     * durchzulaufen.
     *
     * ⛔ DIE ZWEITE HAELFTE IST DIE GEGENPROBE UND SIE IST NICHT SCHMUCK: sie belegt, dass
     * der Zaehler ueberhaupt zaehlt. Ohne sie waere „Delta 0" auch dann wahr, wenn der
     * Zaehler kaputt ist — genau die Form von konstantem Gruen, gegen die dieser Bauweg
     * antritt.
     */
    await legeCodeAn();
    sitzung = SUITE_SITZUNG;
    const vorher = zaehleAbfragen();
    await ausleihZugangOderNull(db as never);
    expect(zaehleAbfragen() - vorher).toBe(0);

    // GEGENPROBE: derselbe Zaehler auf dem Code-Weg.
    sitzung = null;
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    const vorherCode = zaehleAbfragen();
    await ausleihZugangOderNull(db as never);
    expect(
      zaehleAbfragen() - vorherCode,
      "der Abfragezaehler zaehlt nicht — der Fall darueber ist konstantes Gruen",
    ).toBeGreaterThan(0);
  });

  it("fuer weg suite wird KEINE Gruppe verlangt", async () => {
    /*
     * Spec:2729-2736: „fuer `weg: "suite"` wird KEINE Gruppe verlangt — jede
     * Suite-Sitzung genuegt, weil die Ausleihe absichtlich anonym ist und derselbe Vorgang
     * ohne jede Anmeldung per QR-Code erlaubt ist." Wer hier eine Gruppenpruefung
     * ergaenzt, sperrt genau die Personen aus, die den bequemeren der zwei zugelassenen
     * Wege nehmen.
     */
    sitzung = { user: { id: "s-1", name: null, groups: [] } };
    await expect(ausleihZugangOderNull(db as never)).resolves.toEqual({
      weg: "suite",
      sub: "s-1",
      name: null,
    });
  });

  it("weg code entsteht nur aus signiertem Cookie PLUS DB-Recheck", async () => {
    /*
     * ⛔ `toEqual`, NICHT `toMatchObject` (Fix-Runde 1, Funde W3 und K1). `toMatchObject`
     * liess den Rest der Vereinigung frei, und `laeuftAb` war damit die eine Angabe des
     * Code-Wegs, die NIRGENDS geprueft wurde — weder ihr Wert noch ihre Herkunft. Sie ist
     * laut Spec:2509-2511 der einzige Datenpfad einer Restzeit-Anzeige, und der Kopf der
     * Implementierung macht ueber ihre Herkunft eine praezise Aussage
     * (`ausleihZugang.ts:57-59`). Der Suite-Zweig prueft seit jeher mit `toEqual`; die
     * Datei war in sich uneinheitlich.
     */
    await legeCodeAn();
    const laeuftAb = await praegeSitzung("zc-1");
    sitzung = null;
    const z = await ausleihZugangOderNull(db as never);
    expect(z).toEqual({
      weg: "code",
      codeId: "zc-1",
      bezeichnung: "Aufsteller Fahrzeughalle",
      laeuftAb,
    });
  });

  it("bezeichnung kommt aus der DB-Zeile, nicht aus dem Cookie", async () => {
    /*
     * ⛔ PFLICHT 15 (`docs/radio-portierung-analyse.md:959-971`), woertlich: „`label` fuer
     * die Anzeige kommt aus DIESER Zeile, nicht aus der Cookie-Nutzlast — deshalb kann
     * das Geheimnis aus dem Cookie verschwinden." Die Gegenprobe: die Zeile umbenennen,
     * OHNE das Cookie neu zu praegen; die Flaeche muss den neuen Namen zeigen.
     */
    await legeCodeAn();
    const laeuftAb = await praegeSitzung("zc-1");
    await db
      .update(zugangscodes)
      .set({ bezeichnung: "Umbenannt" })
      .where(eq(zugangscodes.id, "zc-1"));
    const z = await ausleihZugangOderNull(db as never);
    // ⛔ `toEqual` statt `toMatchObject` (Fund K1): der Fall prueft die GANZE Form, nicht
    // nur das eine Feld, das sein Name nennt.
    expect(z).toEqual({
      weg: "code",
      codeId: "zc-1",
      bezeichnung: "Umbenannt",
      laeuftAb,
    });
  });
});

describe("radio-Ausleihzugang: der DB-Recheck IST der Widerruf", () => {
  it("ohne Suite-Sitzung und mit gesperrtem Code -> grund gesperrt", async () => {
    await legeCodeAn({ aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never)).resolves.toEqual({
      ok: false,
      grund: "gesperrt",
    });
  });

  it("manipuliertes codeId in gueltig signiertem Cookie verhaelt sich wie gesperrt", async () => {
    /*
     * Der Fall setzt voraus, dass jemand das GEHEIMNIS haette — er ist trotzdem
     * lehrreich: eine gueltige Signatur allein reicht NICHT, weil Schritt 5 die Zeile
     * nachschlaegt. Waere der Recheck nur vor Schreibvorgaengen, saehe diese Person die
     * ganze Geraeteliste samt Entleihernamen.
     */
    await legeCodeAn();
    cookieWert = await createAusleihSitzung({ codeId: "gibt-es-nicht" });
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never)).resolves.toEqual({
      ok: false,
      grund: "gesperrt",
    });
  });

  it("der Recheck laeuft auch auf dem reinen LESEpfad", async () => {
    // Pflicht 15: „Er muss auf JEDEM Lesepfad stehen, nicht nur vor schreibenden
    // Aktionen." `ausleihZugangOderNull` ist der Lesepfad der Gate-Seite (A11).
    await legeCodeAn({ aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    await expect(ausleihZugangOderNull(db as never)).resolves.toBeNull();
  });
});

describe("radio-Ausleihzugang: die drei Formen unterscheiden sich in ihrem Ausgang", () => {
  it("fehlendes Cookie -> Redirect auf /, nicht auf /abmelden", async () => {
    /*
     * ⛔ EINE RUNDE STATT ZWEI (Spec:2409, Testauftrag Spec:3093). Wer nie ein
     * Cookie hatte, hat nichts zu raeumen; ein Umweg ueber `/abmelden` waere ein
     * zusaetzlicher 303 fuer JEDEN anonymen Erstaufruf — auf einem Telefon im Funkloch
     * sichtbar.
     *
     * ⛔ ANKER AUF DAS GANZE ZIEL, NICHT AUF EINEN PRAEFIX. `toThrow("REDIRECT:/")` ist
     * ein TEILZEICHENKETTEN-Vergleich — `REDIRECT:/abmelden?grund=abgelaufen` enthaelt
     * ihn ebenfalls. Der Fall bliebe also gruen, wenn die Implementierung genau den
     * Umweg naehme, gegen den sein Name steht.
     */
    cookieWert = undefined;
    sitzung = null;
    await expect(requireAusleihZugang(db as never)).rejects.toThrow(/^REDIRECT:\/$/);
  });

  it("abgelaufenes Cookie -> Redirect auf /abmelden?grund=abgelaufen", async () => {
    cookieWert = "kaputt";
    sitzung = null;
    await expect(requireAusleihZugang(db as never)).rejects.toThrow(
      /^REDIRECT:\/abmelden\?grund=abgelaufen$/,
    );
  });

  it("gesperrter Code -> Redirect auf /abmelden?grund=gesperrt", async () => {
    await legeCodeAn({ aktiv: false });
    cookieWert = await createAusleihSitzung({ codeId: "zc-1" });
    sitzung = null;
    await expect(requireAusleihZugang(db as never)).rejects.toThrow(
      /^REDIRECT:\/abmelden\?grund=gesperrt$/,
    );
  });

  it("requireAusleihSchreibend wirft bei abgelaufener Sitzung nicht, sondern gibt ok false", async () => {
    /*
     * ⛔ DIE GEFAEHRLICHSTE EIGENSCHAFT DIESES KAPITELS (Spec:2780-2784), und dieser Fall
     * ist ihre einzige Zusicherung auf dieser Ebene: sie WIRFT NICHT und LEITET NICHT UM.
     * Ein `redirect()` verwuerfe die eingetragenen Werte des Formulars — der Mensch haette
     * vier Geraete und einen Namen eingegeben und faende ein leeres Formular vor.
     *
     * ⚠️ DIE KEHRSEITE STEHT IM GUARD-SCAN (A8): `await requireAusleihSchreibend(db)`
     * OHNE Pruefung des Ergebnisses ist typkorrekt, lint-sauber und oeffnet die Action fuer
     * jeden. Dieser Test kann das NICHT fangen — er prueft die Funktion, nicht ihre
     * Aufrufer.
     */
    cookieWert = "kaputt";
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never)).resolves.toEqual({
      ok: false,
      grund: "sitzung",
    });
    expect(redirectRuf).not.toHaveBeenCalled();
  });

  it("requireAusleihZugang gibt bei gueltigem Code den Zugang zurueck und leitet NICHT um", async () => {
    /*
     * ⛔ DIE ERFOLGSFORM WAR UNBEWACHT (Fix-Runde 1, Fund W2): alle drei uebrigen Faelle
     * dieser Funktion sind Redirect-Faelle, und `if (b.ok) return b.zugang;` liess sich
     * durch eine feste `weg: "suite"`-Ruecklieferung ersetzen, ohne dass ein Fall, der
     * `typecheck` oder der `lint` rot wurde (Sonde R-A7g). Die Rueckgabe traegt jede Seite
     * unter `(ausleihe)/` (A18-A20): eine solche Fassung blendete die Bezeichnung des
     * Aufstellers still aus.
     *
     * Die zweite Zusicherung ist die Kehrseite des Namens — auf dem Erfolgsweg wird NICHT
     * umgeleitet.
     */
    await legeCodeAn();
    const laeuftAb = await praegeSitzung("zc-1");
    sitzung = null;
    await expect(requireAusleihZugang(db as never)).resolves.toEqual({
      weg: "code",
      codeId: "zc-1",
      bezeichnung: "Aufsteller Fahrzeughalle",
      laeuftAb,
    });
    expect(redirectRuf).not.toHaveBeenCalled();
  });

  it("requireAusleihSchreibend gibt auf dem Code-Weg ok true mit codeId und bezeichnung", async () => {
    /*
     * ⛔ DIE ERFOLGSFORM WAR UNBEWACHT (Fix-Runde 1, Fund W1): alle drei uebrigen Faelle
     * dieser Funktion pruefen `ok: false`, und `zugang: b.zugang` liess sich durch eine
     * erfundene Nutzlast ersetzen, ohne dass ein Fall rot wurde (Sonde R-A7f).
     *
     * Die Nutzlast ist TRAGEND und nicht Beiwerk: sie ist der einzige Weg, auf dem `codeId`
     * in die vier Actions aus A17 und von dort in `loans.zugangscode_id` gelangt. Eine
     * Fassung, die hier etwas anderes zurueckgibt, liesse eine ganze Spalte tot — typkorrekt
     * und lint-sauber.
     */
    await legeCodeAn();
    const laeuftAb = await praegeSitzung("zc-1");
    sitzung = null;
    await expect(requireAusleihSchreibend(db as never)).resolves.toEqual({
      ok: true,
      zugang: {
        weg: "code",
        codeId: "zc-1",
        bezeichnung: "Aufsteller Fahrzeughalle",
        laeuftAb,
      },
    });
    expect(redirectRuf).not.toHaveBeenCalled();
  });

  it("ausleihZugangOderNull leitet NIE um und loescht NICHTS", async () => {
    // Spec:2653-2654: DAS PRAEDIKAT. Fuer `page.tsx` (die Weiche Gate-oder-Ausleihe) ist
    // „kein Zugang" der REGELFALL, nicht der Fehlerfall.
    cookieWert = undefined;
    sitzung = null;
    redirectRuf.mockClear();
    await expect(ausleihZugangOderNull(db as never)).resolves.toBeNull();
    expect(redirectRuf).not.toHaveBeenCalled();
  });
});

describe("radio-Ausleihzugang: keine dritte Quelle", () => {
  it("Quelltext-Scan: kein Bearer-Header, kein token-Parameter, kein localStorage", async () => {
    /*
     * ⛔ Spec:2723-2727, Zusicherung 4: „Keine dritte Quelle — kein Bearer-Header, kein
     * `?token=`, kein `localStorage`. Der ALT-MECHANISMUS WIRD NICHT UEBERGANGSWEISE
     * MITAKZEPTIERT."
     *
     * Der Alt-Kiosk traegt seinen Token base64-kodiert im URL-Parameter `token`
     * (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:14-25`)
     * und legt ihn in `localStorage` (`routes/__root.tsx:59-72`). Der naheliegende
     * „sanfte Uebergang" — alte Tokens noch eine Weile annehmen — waere genau der
     * Mechanismus, den Entscheidung 8 (Spec:64) ausschliesst: geteilter Token als
     * URL-Parameter, unbefristet, unwiderruflich.
     */
    /*
     * ⛔ DER SCAN LIEST DIE QUELLE OHNE KOMMENTARE, UND DAS IST KEINE FEINHEIT. Schritt 3
     * dieser Aufgabe verlangt „die sieben Auflagen oben, jede mit Kommentar und
     * Spec-Zeile" — und Auflage 4 lautet woertlich „Keine dritte Quelle: kein
     * BEARER-Header, kein `?token=`, kein `localStorage`". Wer sie als Kommentar
     * schreibt, faerbt einen Rohtext-Scan auf seiner eigenen Begruendung rot; wer den
     * Scan daraufhin „repariert", schwaecht ihn.
     *
     * ⛔ DER BESTAND HAT DIESE LEHRE SCHON GEZOGEN, woertlich (`riegel.test.ts:170-173`):
     * „OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT." Deshalb
     * laeuft dort jeder Scan ueber `ohneKommentare(...)` (`riegel.test.ts:236`).
     *
     * ⛔ `ohneKommentare` WIRD AUS `riegel.test.ts:181-201` KOPIERT, nicht importiert
     * (vitest laedt Testdateien nicht als Module fuereinander; eine geteilte Helferdatei
     * unter `_lib/` zaehlte der `"use client"`-Scan mit). A9 kopiert dieselbe Funktion
     * noch einmal — das ist gewollt und der Preis der Nicht-Importierbarkeit.
     */
    const quelle = ohneKommentare(
      readFileSync(join(process.cwd(), "src/app/m/radio/_lib/ausleihZugang.ts"), "utf8"),
    );
    expect(quelle).not.toMatch(/\bauthorization\b|\bBearer\b/i);
    expect(quelle).not.toMatch(/\blocalStorage\b/);
    expect(quelle).not.toMatch(/searchParams|["']token["']/);
  });
});

/**
 * Kopie aus `riegel.test.ts:181-201` — Kommentare werden VOR dem Vergleich geleert,
 * inhaltlich und nicht zeilenweise, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte
 * damit eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
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
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}
