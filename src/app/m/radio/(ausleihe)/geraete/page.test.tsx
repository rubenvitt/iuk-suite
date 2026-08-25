// @vitest-environment jsdom
// src/app/m/radio/(ausleihe)/geraete/page.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../../_db/schema";
import { devices, loans } from "../../_db/schema";

/**
 * DIE GERAETEUEBERSICHT AN `/geraete` (Entscheidung E1,
 * `.superpowers/sdd/planteil3/briefs/KOPF.md:416-455`; Spec 1 §4.1, §4.2.1, §4.7).
 *
 * ⛔ WARUM DIE SEITENFUNKTION DIREKT GERUFEN UND IHR ERGEBNIS DANACH GEMOUNTET WIRD: sie ist
 * eine ASYNC Server Component; `mount()` treibt eine solche nicht an (react-dom rendert kein
 * Promise), und `redirect()` arbeitet ueber einen geworfenen Sentinel. Die Hauspraezedenz
 * steht in `src/app/m/lagerbuch/page.test.tsx:139` und im Gate dieses Moduls
 * (`src/app/m/radio/page.test.tsx:9-20`). Ein eigener Baumlaeufer waere das zweite Harness,
 * das `CLAUDE.md` („Tests") verbietet — deshalb `// @vitest-environment jsdom` in Zeile 1.
 * ⚠️ Der Aufgabenbrief zaehlt die drei `page.test.tsx` zum „Node-Geruest"; A11 hat diese
 * Frage schon anders entschieden und gebaut, und zwei Bauformen fuer dieselbe Sache waeren
 * schlechter als eine abweichende. Die Abweichung steht im Bericht.
 *
 * ⛔ `_db/leihen.ts` IST HIER NICHT GEMOCKT, UND DAS IST DER PUNKT. Der Seriennummer-Fall
 * unten muss an einer Zeile messen, die der PRODUKTIONSCODE gebaut hat. REVIEW-A13 Fund K3
 * hat die andere Form gemessen: eine Zusicherung, die `Object.entries()` der testeigenen
 * Hilfsfunktion liest, blieb gegen fuenf gleichzeitige Mutationen gruen. Deshalb steht hinter
 * `getDb()` eine ECHTE, migrierte SQLite-Datei.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (`.superpowers/sdd/planteil3/KONTEXT.md:95-97`):
 * dessen Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR`
 * (`src/core/db/index.ts:31-35`). Vorbild: `_db/leihen.test.ts:48-56`.
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT: dass ein Riegel bei einem ECHTEN Abruf GREIFT (⬜ A-L9).
 * Sie belegt, dass die Seite ihn selbst ruft und was sie danach baut.
 */

const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const STYLESHEET = "src/app/m/radio/_ui/ausleihe.module.css";

/**
 * Der Rumpf EINER CSS-Regel. Zeichengleiche Kopie aus
 * `src/app/m/radio/_ui/StatusChip.test.tsx:20-26` — vitest laedt Testdateien nicht als
 * Module fuereinander, und eine geteilte Helferdatei unter `src/app/m/radio/` zaehlte der
 * Direktiven-Scan aus `riegel.test.ts:909-962` mit. Die Verdoppelung ist der Preis.
 */
function regelkoerper(css: string, selektor: string): string {
  const auf = css.indexOf(selektor);
  if (auf === -1) throw new Error(`Selektor fehlt in ${STYLESHEET}: ${selektor}`);
  const zu = css.indexOf("}", auf);
  if (zu === -1) throw new Error(`Regel ohne Ende in ${STYLESHEET}: ${selektor}`);
  return css.slice(auf + selektor.length, zu);
}

/** Der Ausleihzeitpunkt der Fixtures: 14.06.2026, 09:12 in Berlin (dort UTC+2). */
const AUSGELIEHEN_AM = new Date("2026-06-14T07:12:00Z");
const AUSGELIEHEN_UHRZEIT = "09:12";

/**
 * ⛔ DIE SAETZE STEHEN HIER AUSGESCHRIEBEN und werden nicht aus dem Quellmodul importiert:
 * sonst richtete sich die Zusicherung gegen denselben Wert, den die Seite rendert, und
 * koennte konstruktiv nie fehlschlagen (dieselbe Form wie
 * `src/app/m/radio/page.test.tsx:36-39`). Quelle des ersten: `_lib/meldungen.ts` (A14,
 * §4.9.6, Spec:3919-3922).
 */
const SATZ_KEINE_GERAETE = "Es sind noch keine Geräte erfasst. Das erledigt die Verwaltung.";
const SATZ_GEBUCHT_2 = "2 Geräte ausgeliehen.";
const SATZ_GEBUCHT_1 = "1 Gerät ausgeliehen.";

const kopfzeilenGelesen = vi.hoisted(() => vi.fn());
const hostRiegel = vi.hoisted(() => vi.fn());
const listeAktualisierenMock = vi.hoisted(() => vi.fn());
const umleitungen = vi.hoisted(() => [] as string[]);
const halter = vi.hoisted(() => ({ db: null as unknown }));

/*
 * ⚠️ `next/headers` WIRD GEMOCKT, OBWOHL DIE SEITE ES NICHT IMPORTIERT — genau deshalb. Der
 * Zaehler ist der Waechter: steht er bei 0, hat die Seite die Kopfzeilen nicht gelesen. Wer
 * `requireRadioHost(await headers())` ergaenzt, macht ihn 1 und den Fall rot.
 */
vi.mock("next/headers", () => ({
  headers: async () => {
    kopfzeilenGelesen();
    return new Headers({ host: "radio.localtest.me" });
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    umleitungen.push(ziel);
    throw new Error("NEXT_REDIRECT");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("../../_lib/host", async (echt) => ({
  ...(await echt<typeof import("../../_lib/host")>()),
  requireRadioHost: (h: Headers) => hostRiegel(h),
}));
vi.mock("../../_lib/ausleihZugang", () => ({ requireAusleihZugang: vi.fn() }));
vi.mock("../../_db/client", () => ({ getDb: () => halter.db }));

/*
 * `_actions/ausleihe.ts` traegt `"use server"` und zieht `next/cache`, `next/navigation` und
 * die Moduldatenbank nach. Die Seite braucht `listeAktualisieren` nur als REFERENZ fuer
 * `<form action={…}>`; WAS sie tut, gehoert A17 (`_actions/ausleihe.test.ts`). Dieselbe
 * Bauform wie `_ui/AusleihRahmen.test.tsx:14-15`.
 */
vi.mock("../../_actions/ausleihe", () => ({ listeAktualisieren: listeAktualisierenMock }));

/*
 * ⚠️ DER RAHMEN UND DIE INSEL WERDEN DURCH ATTRAPPEN ERSETZT, die ihre Props als Attribute an
 * den GERENDERTEN Baum haengen — eine Zusage ueber das gerenderte Ergebnis gehoert an den
 * Baum, nicht an den Dateitext (Vorbild `src/app/m/radio/page.test.tsx:99-114`). Ihr eigenes
 * Verhalten haben `_ui/AusleihRahmen.test.tsx` und `_ui/GeraeteListe.test.tsx`.
 */
vi.mock("../../_ui/AusleihRahmen", () => ({
  AusleihRahmen: (p: { aktiv: string; zugang: { weg: string }; children: React.ReactNode }) => (
    <div data-rolle="radio-rahmen" data-aktiv={p.aktiv} data-weg={p.zugang.weg}>
      {p.children}
    </div>
  ),
}));
vi.mock("../../_ui/GeraeteListe", () => ({
  GeraeteListe: (p: { geraete: unknown[] }) => (
    <div data-rolle="radio-liste-attrappe" data-geraete={JSON.stringify(p.geraete)} />
  ),
}));

import { requireAusleihZugang } from "../../_lib/ausleihZugang";
import { STATUS_HEX } from "../../_lib/status";
import GeraeteUebersichtPage, { dynamic } from "./page";
import { mount, unmount, query, exists, submitForm } from "@/app/m/qr/_lib/test-dom";

const ZUGANG = {
  weg: "code" as const,
  codeId: "zc-1",
  bezeichnung: "Aufsteller Wache",
  laeuftAb: new Date("2026-06-14T20:00:00Z"),
};

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-uebersicht-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
  halter.db = db;
  umleitungen.length = 0;
  vi.mocked(requireAusleihZugang).mockResolvedValue(ZUGANG);
});

afterEach(async () => {
  await unmount();
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
});

function geraet(werte: {
  id: string;
  issi: string;
  rufname?: string;
  serialNumber?: string;
  deviceType?: string;
  location?: string;
  status?: string;
}) {
  db.insert(devices)
    .values({
      rufname: `Ruf ${werte.id}`,
      deviceType: "Motorola MTP3550",
      status: "Einsatzbereit",
      location: "Fahrzeughalle",
      // ⛔ OHNE DIESE ZEILE STEHT DAS FIXTURE GAR NICHT IN DER LISTE: `geraeteMitLeihstand`
      // filtert seit dem 2026-08-24 auf `loanable = true`, und die Spalte ist nullable —
      // eine nicht gesetzte Spalte ist `NULL` und faellt heraus (Fund F1, gemessen in
      // `_db/leihen.test.ts`). Die Faelle dieser Datei fragen nach der ANZEIGE eines
      // verleihbaren Geraets; wer den Filter selbst pruefen will, tut das dort.
      loanable: true,
      createdAt: new Date("2026-01-01T10:00:00Z"),
      updatedAt: new Date("2026-05-01T10:00:00Z"),
      ...werte,
    })
    .run();
}

function leihe(deviceId: string, borrowerName: string) {
  db.insert(loans)
    .values({
      deviceId,
      snapshotCallSign: `Ruf ${deviceId}`,
      borrowerName,
      borrowedAt: AUSGELIEHEN_AM,
      createdAt: AUSGELIEHEN_AM,
      updatedAt: AUSGELIEHEN_AM,
    })
    .run();
}

async function rendere(sp: Record<string, string> = {}): Promise<void> {
  await mount(await GeraeteUebersichtPage({ searchParams: Promise.resolve(sp) }));
}

/** Was die Seite ueber die RSC-Grenze an die Insel reicht. */
function propsAnDieInsel(): Record<string, unknown>[] {
  return JSON.parse(query('[data-rolle="radio-liste-attrappe"]').getAttribute("data-geraete") ?? "[]");
}

describe("die Uebersicht an /geraete", () => {
  it("leitet der Riegel um, entsteht keine Flaeche", async () => {
    /*
     * ⛔ DIE SEITE RUFT DEN RIEGEL SELBST, obwohl `(ausleihe)/layout.tsx` ihn auch ruft
     * (§4.2.1, Spec:3401-3406): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein
     * Layout kann einer Seite keine Props reichen — sie braucht Etikett und Ablaufzeit fuer
     * den Rahmen. `riegel.test.ts` Klausel (f) haelt die Zeile fest, dieser Fall haelt die
     * WIRKUNG ihres Fehlens: ohne den Riegel rendert die Seite, statt abzubrechen.
     *
     * ⚠️ DER WURF IST DER ERWARTETE AUSGANG: `requireAusleihZugang` leitet ueber einen
     * geworfenen `redirect()`-Sentinel um (`_lib/ausleihZugang.ts:236-241`). Ein `try`/
     * `catch` in `page.tsx` verschluckte ihn, und die Weiterleitung faende STILL nicht statt
     * (Bauform-Zulaessigkeitstafel Zeile 6).
     */
    vi.mocked(requireAusleihZugang).mockImplementation(() => {
      umleitungen.push("/abmelden?grund=abgelaufen");
      throw new Error("NEXT_REDIRECT");
    });

    await expect(rendere()).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/abmelden?grund=abgelaufen"]);
  });

  it("ruft weder headers() noch den Host-Riegel selbst", async () => {
    /*
     * ⛔ NULL, NICHT EINS — und das ist der Unterschied zum Gate. `src/app/m/radio/page.tsx`
     * ruft `requireRadioHost` ZUSAETZLICH und liest die Kopfzeilen dafuer genau einmal (die
     * eine angeordnete Ausnahme, `_lib/ausleihZugang.ts:104-113`). Hier ist ein zweiter
     * Aufruf VERBOTEN (§4.2.1, Spec:3408-3413, Pflicht 16
     * `docs/radio-portierung-analyse.md:973-977`): das Praedikat ruft ihn intern als erste
     * Anweisung; ein zweiter Aufruf behauptet, es sei hostblind, und macht aus „hostgebunden
     * durch Konstruktion" wieder eine Liste, die die naechste Datei vergisst.
     * ⚠️ Der Aufgabenbrief nennt diesen Fall „liest die Kopfzeilen genau einmal" — das ist
     * die Zusage des GATES und waere hier die falsche Zahl. Die Abweichung steht im Bericht.
     *
     * ⚠️ Das Praedikat ist gemockt; seine eigene, interne Lesung faellt hier also nicht ins
     * Gewicht. Gemessen wird genau, was `page.tsx` selbst tut.
     */
    geraet({ id: "g-1", issi: "1001" });

    await rendere();

    expect(kopfzeilenGelesen).toHaveBeenCalledTimes(0);
    expect(hostRiegel).toHaveBeenCalledTimes(0);
  });

  it("reicht die fertigen Zeilen des Lesepfads an die Insel und markiert den Abschnitt", async () => {
    /*
     * Schritt 2 und 4 des Briefs: `geraeteMitLeihstand(getDb())` liefert die FERTIGEN Zeilen
     * (Spec:3423), die Seite reicht sie durch und setzt `aktiv="uebersicht"` — ein
     * SERVER-Prop, kein `usePathname()` (Bauform-Zulaessigkeitstafel Zeile 16,
     * `AusleihRahmen.tsx:47-52`).
     *
     * ⛔ „Was an einer Uhr haengt, entsteht auf dem Server" (§4.1 Punkt 1, Spec:3338-3342):
     * `seit` ist eine fertige Zeichenkette, kein `Date` und kein Zeitstempel. Deshalb prueft
     * dieser Fall den WERT `09:12` und nicht bloss die Anwesenheit des Feldes — im Browser
     * gerechnet entschieden Server und Client an der Tagesgrenze verschieden.
     */
    geraet({ id: "g-1", issi: "1001", rufname: "Kater 1" });
    geraet({ id: "g-2", issi: "1002", rufname: "Kater 2" });
    leihe("g-2", "Anna Beispiel");

    await rendere();

    expect(query('[data-rolle="radio-rahmen"]').getAttribute("data-aktiv")).toBe("uebersicht");
    expect(query('[data-rolle="radio-rahmen"]').getAttribute("data-weg")).toBe("code");

    const zeilen = propsAnDieInsel();
    expect(zeilen.map((z) => z.rufname).sort()).toEqual(["Kater 1", "Kater 2"]);
    const vergeben = zeilen.find((z) => z.id === "g-2")!;
    expect(vergeben.status).toBe("ON_LOAN");
    expect(vergeben.entleiher).toBe("Anna Beispiel");
    expect(vergeben.seit).toBe(AUSGELIEHEN_UHRZEIT);
  });

  it("reicht die Seriennummer nicht ueber die RSC-Grenze, wohl aber im Suchschluessel", async () => {
    /*
     * ⛔ DER FALL, DER DIE DATENSCHUTZ-ZUSAGE AUS §4.1 PUNKT 2 AN DER RSC-GRENZE TRAEGT
     * (Spec:3343-3348): „Auf einem privaten Telefon in einer Sitzung ohne Konto landete das
     * im RSC-Payload, ohne dass die Flaeche es zeigt … die Seriennummer wandert nicht in den
     * Client. Sie bleibt Suchfeld." ⬜ Die Auflage steht im Ledger
     * (`.superpowers/sdd/planteil3/progress.md`, Block „Fix-Runde 1 zu A13"): „A18 belegt es
     * an der Prop, die ueber die RSC-Grenze geht."
     *
     * ⛔ DESHALB IST `_db/leihen.ts` HIER NICHT GEMOCKT. Die geprueften Objekte hat der
     * PRODUKTIONSCODE aus einer echten Zeile gebaut, in der eine Seriennummer steht —
     * andernfalls praefte der Fall ein selbstgebautes Fixture gegen sich selbst und koennte
     * konstruktiv nie fehlschlagen (REVIEW-A13 Fund K3, gemessen).
     *
     * ⛔ DREI EBENEN, DREI WAECHTER, und keiner ersetzt den anderen: das Lesemodell
     * (`_db/leihen.test.ts`, `Object.keys()` auf GLEICHHEIT), diese Grenze, und die Zeile
     * selbst (`_ui/GeraeteListe.test.tsx`, Scan ueber den ausgelieferten Quelltext).
     *
     * ⚠️ DER SUCHSCHLUESSEL IST NORMALISIERT (klein, ohne Diakritika, `_lib/filter.ts:108`),
     * die Nadel deshalb kleingeschrieben. Der Anker `9931` trifft sie in jeder Schreibweise,
     * in der sie ueberhaupt in ein Feld geraten koennte.
     */
    geraet({ id: "g-1", issi: "1001", rufname: "Kater 1", serialNumber: "SN-9931" });

    await rendere();

    const zeilen = propsAnDieInsel();
    expect(zeilen).toHaveLength(1);
    const zeile = zeilen[0]!;

    expect(String(zeile.suchschluessel), "der Suchschluessel traegt sie nicht mehr").toContain(
      "9931",
    );
    for (const [name, wert] of Object.entries(zeile)) {
      if (name === "suchschluessel") continue;
      expect(
        String(wert).toLowerCase(),
        `die Seriennummer reist im Feld ${name} ueber die RSC-Grenze`,
      ).not.toContain("9931");
    }
    for (const name of Object.keys(zeile)) {
      expect(name, "ein Feld mit dem Namen der Seriennummer reist mit").not.toMatch(
        /serien|serial/i,
      );
    }
  });

  it("zeigt nach einer Buchung eine Zeile in role=status aria-live=polite", async () => {
    /*
     * Entscheidung E6 (`briefs/KOPF.md`): KEIN Toast. Der Erfolg wandert als
     * Ergebnisparameter durch den `redirect` (`_actions/ausleihe.ts:218`) und wird von der
     * SEITE gerendert (Spec:3429).
     *
     * ⛔ `role="status" aria-live="polite"` UND NICHT `role="alert"` — die Abweichung von der
     * A11-Entscheidung (REVIEW-A11 Fund W3, `_ui/GateFormular.tsx:124-146`) ist gewollt und
     * hat denselben gemessenen Grund wie jene: dort entsteht der Satz NACH einem Antippen
     * ohne Seitenwechsel, und eine hoefliche Region, die zusammen mit ihrem Inhalt in den
     * Baum kommt, wird haeufig nicht angesagt. Hier kommt der Satz mit einem FRISCHEN
     * Dokument nach einer Weiterleitung — genau die Lage, in der eine hoefliche Region
     * angesagt wird und eine `assertive` die Seite unterbraeche.
     *
     * ⛔ DER SATZ NENNT DIE ZAHL UND NICHT DEN NAMEN, und das ist eine Abweichung vom
     * Wortlaut der Spec (`:3429`: „2 Geräte an Max Mustermann ausgeliehen."): `?gebucht=<n>`
     * traegt nur die Zahl (`_actions/ausleihe.ts:218`). Einen Entleihernamen in die URL zu
     * schreiben, hiesse ihn in den Verlauf eines geteilten Telefons zu schreiben — genau der
     * Grund, aus dem der Suchtext dort nicht steht (Spec:3633-3635).
     *
     * ⛔ DIE EINZAHL IST EIN EIGENER ZWEIG. „1 Geräte ausgeliehen." waere still falsch.
     */
    geraet({ id: "g-1", issi: "1001" });

    await rendere({ gebucht: "2" });
    const zeile = query('[data-rolle="radio-gebucht"]');
    expect(zeile.getAttribute("role")).toBe("status");
    expect(zeile.getAttribute("aria-live")).toBe("polite");
    expect(zeile.textContent).toBe(SATZ_GEBUCHT_2);
    await unmount();

    await rendere({ gebucht: "1" });
    expect(query('[data-rolle="radio-gebucht"]').textContent).toBe(SATZ_GEBUCHT_1);
  });

  it("zeigt die Erfolgszeile nicht ohne Parameter und nicht bei Unfug", async () => {
    /*
     * ⛔ DIE ZWEITE HAELFTE, und ohne sie waere der Fall darueber halb-gruen: eine Seite, die
     * die Zeile IMMER zeigt, bestuende ihn. `?gebucht=` ist NUTZEREINGABE — jemand kann sie
     * von Hand in die Adresszeile schreiben.
     *
     * ⛔ DIE OBERGRENZE IST `AUSWAHL_MAX` (`_lib/auswahl.ts:53`, 20): mehr kann die Action
     * konstruktiv nie gebucht haben, weil `auswahlLesen` dort deckelt. Eine Zeile
     * „99999 Geräte ausgeliehen." waere eine Behauptung ueber einen Vorgang, den es nie gab.
     */
    geraet({ id: "g-1", issi: "1001" });

    const faelle: Record<string, string>[] = [
      {},
      { gebucht: "0" },
      { gebucht: "-3" },
      { gebucht: "zwei" },
      { gebucht: "21" },
    ];
    for (const sp of faelle) {
      await rendere(sp);
      expect(exists('[data-rolle="radio-gebucht"]'), `zu ${JSON.stringify(sp)}`).toBe(false);
      await unmount();
    }
  });

  it("zeigt ohne Geraete den Satz aus _lib/meldungen.ts, ohne Weg in die Verwaltung", async () => {
    /*
     * §4.9.6 (Spec:3919-3922) und `_lib/meldungen.ts` (A14). ⛔ OHNE VERWEIS AUF DIE
     * VERWALTUNG: der Bestand setzt hier einen Knopf „Geraete verwalten" auf `/admin`
     * (`DeviceList.tsx:89-98`) — auf einer ANONYMEN Flaeche. Ein sichtbarer Weg dorthin, wo
     * die aufrufende Person nicht hindarf, verletzt die Gegenprobe
     * `docs/design/README.md:420`.
     *
     * ⛔ DER TEST VERANKERT AUF DEM FEHLEN EINES PFADES, nicht auf dem Wort „Verwaltung" —
     * das steht im Satz selbst und waere rot-by-construction (`_lib/meldungen.ts:350-352`).
     *
     * ⛔ UND DIE INSEL ERSCHEINT DANN GAR NICHT: eine leere Filterleiste ueber nichts ist
     * eine Bedienfläche ohne Gegenstand.
     */
    await rendere();

    const leer = query('[data-rolle="radio-leer-bestand"]');
    expect(leer.textContent).toContain(SATZ_KEINE_GERAETE);
    expect(leer.querySelector("a")).toBe(null);
    expect(query('[data-rolle="radio-rahmen"]').querySelectorAll('a[href*="/admin"]')).toHaveLength(
      0,
    );
    expect(exists('[data-rolle="radio-liste-attrappe"]')).toBe(false);
  });

  it("traegt den Aktualisieren-Knopf als Formular auf listeAktualisieren", async () => {
    /*
     * §4.7 (Spec:3814-3818): der Knopf bleibt, denn ohne TanStack Query gibt es kein
     * Hintergrund-Refetch mehr. Aus ihm wird ein `<form action={…}>` — ⛔ kein
     * `useState`-Fehlerkasten mit Fuenf-Sekunden-Selbstschluss mehr (`DeviceList.tsx:19`,
     * `:35-49`, `:143-165`): ein fehlgeschlagenes Neuladen ist genau der Fall, den man nicht
     * nach fuenf Sekunden verstecken sollte.
     *
     * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT UND NICHT ALS PROP GEREICHT (Falle 9,
     * `CLAUDE.md:52-70`). Der Fall SENDET das Formular deshalb ab und misst, dass GENAU
     * DIESE Funktion laeuft — die DOM-Eigenschaft `form.action` taugt dafuer nicht: React
     * legt dort eine `javascript:`-Notbremse ab und nicht die Funktion (gemessen).
     *
     * ⛔ UND KEIN ZEICHEN, SONDERN DIE BESCHRIFTUNG „Aktualisieren" (Entscheidung E5,
     * Spec:3750-3752): `RefreshCw` faellt weg, eine dreizehnte Inline-SVG waere der Preis.
     */
    geraet({ id: "g-1", issi: "1001" });

    await rendere();

    await submitForm("form");
    expect(listeAktualisierenMock).toHaveBeenCalledTimes(1);

    /*
     * ⛔ DER SELEKTOR NENNT DEN VORFAHREN, UND DAS IST DIE ZUSAGE, NICHT DIE KOSMETIK:
     * `useFormStatus()` liest das `<form>`, in dem SEINE Komponente steht — und gibt ohne
     * Vorfahr klaglos `{ pending: false }` zurueck, statt zu werfen. Wanderte der Knopf aus
     * dem Formular heraus, waere der sperrende Zustand tot, und JEDES Tor bliebe gruen.
     * `form ...` macht genau diese Wanderung rot.
     */
    const knopf = query('form [data-rolle="radio-aktualisieren"]');
    expect(knopf.textContent).toContain("Aktualisieren");
    expect(knopf.querySelector("svg")).toBe(null);
  });

  it("die Erfolgszeile fuehrt das GRUEN aus STATUS_HEX, in beiden Farbmodi", () => {
    /*
     * ⛔ ENTSCHEIDUNG E6, WOERTLICH: „Erfolgsfarbe GRUEN AUS DEM CHIP-SATZ, nicht
     * `colorSuccess` — ein Farbsystem je Flaeche" (Spec:3754-3776). Der Chip-Satz ist
     * `STATUS_HEX` (`_lib/status.ts`, ⬜ A-L10), woertlich aus dem Alt-Kiosk.
     *
     * ⛔ OHNE DIESE ZEILE STUENDE DIE ABLEITUNG NUR IM KOMMENTAR. `.gebucht` traegt die zwei
     * Werte SELBST — es kann sie nicht ueber `var(--radio-status-frei)` holen, weil jene
     * Variable auf `.chip` deklariert ist und nicht auf einem gemeinsamen Vorfahren
     * (`ausleihe.module.css`, Kopf des Chip-Blocks: „`.chip` TRAEGT SIE SELBST"). Genau
     * deshalb ist das ein zweites Vorkommen derselben Zahl, und genau deshalb braucht es
     * einen Waechter: „die beiden liefen beim ersten Umbau auseinander — ohne dass ein Test
     * es saehe" (Entscheidung E13). Der Zwilling fuer `.chip` steht in
     * `_ui/StatusChip.test.tsx`, mit derselben Bauform und derselben Messung im Ruecken
     * (dort blieben zwei verdrehte Werte ueber 393 Faelle gruen).
     *
     * ⛔ GEPRUEFT WIRD DIE BINDUNG REGEL->WERT, nicht das blosse Vorkommen einer Hexzahl: ein
     * `toContain(hex)` waere gruen, sobald der Wert IRGENDWO in der Datei steht — und er
     * steht dort, im Chip-Block.
     *
     * ⚠️ Was das NICHT sagt: ob das Gruen auf einem Bildschirm lesbar ist. Das ist der
     * Browserlauf in BEIDEN Farbmodi (Hauslehre „UI-Abnahme: messen, nicht schauen").
     */
    const css = readFileSync(STYLESHEET, "utf8");
    const hell = regelkoerper(css, ".gebucht {");
    const dunkel = regelkoerper(css, ':root[data-theme="dark"] .gebucht {');
    expect(hell, "der HELLE Wert aus STATUS_HEX.frei, im Hellzweig").toMatch(
      new RegExp(`--radio-gebucht-farbe:\\s*${STATUS_HEX.frei.hell}\\b`),
    );
    expect(dunkel, "der DUNKLE Wert aus STATUS_HEX.frei, im Dunkelzweig").toMatch(
      new RegExp(`--radio-gebucht-farbe:\\s*${STATUS_HEX.frei.dunkel}\\b`),
    );
  });

  it("ist force-dynamic", async () => {
    /*
     * ⛔ ERSATZ FUER `staleTime: 30_000` UND `keepPreviousData` DES ALT-KIOSK (§4.7,
     * Spec:3826-3829): „eine Bestandsliste, die 30 Sekunden alt sein darf, ist auf einer
     * Flaeche mit zwei Menschen am gleichen Regal genau die Ursache des Konflikts aus §4.3.2."
     *
     * ⛔ BEIDES, NICHT EINES VON BEIDEN (`VORABSCAN-A.md:415-424`, Fund F26): `force-dynamic`
     * verhindert, dass die SERVERANTWORT vorgerendert ist; das `revalidatePath("/geraete")`
     * in `_actions/ausleihe.ts:184` entwertet zusaetzlich den ROUTER-CACHE DES CLIENTS, den
     * der `redirect` unmittelbar danach benutzt.
     */
    expect(dynamic).toBe("force-dynamic");
  });
});
