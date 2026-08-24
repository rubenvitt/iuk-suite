// @vitest-environment jsdom
// src/app/m/radio/(ausleihe)/ausleihen/page.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../../_db/schema";
import { devices, loans } from "../../_db/schema";

/**
 * DIE AUSLEIHE AN `/ausleihen` (Spec 1 §4.3, `:3417-3516`).
 *
 * ⛔ WARUM DIE SEITENFUNKTION DIREKT GERUFEN UND IHR ERGEBNIS DANACH GEMOUNTET WIRD: sie ist
 * eine ASYNC Server Component; `mount()` treibt eine solche nicht an, und `redirect()`
 * arbeitet ueber einen geworfenen Sentinel. Hauspraezedenz: `src/app/m/lagerbuch/page.test.tsx:139`,
 * `src/app/m/radio/page.test.tsx:9-20` und `(ausleihe)/geraete/page.test.tsx:16-26`.
 *
 * ⛔ `_db/leihen.ts` IST HIER NICHT GEMOCKT, UND DAS IST DER PUNKT — hinter `getDb()` steht
 * eine ECHTE, migrierte SQLite-Datei. Der Seriennummer-Fall und die Verfuegbarkeitspruefung
 * muessen an Zeilen messen, die der PRODUKTIONSCODE gebaut hat (REVIEW-A13 Fund K3: eine
 * Zusicherung gegen testeigene Hilfsdaten blieb gegen fuenf Mutationen gruen).
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (`.superpowers/sdd/planteil3/KONTEXT.md:95-97`):
 * dessen Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR`
 * (`src/core/db/index.ts:31-35`).
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT: dass ein Riegel bei einem ECHTEN Abruf GREIFT (⬜ A-L9,
 * `.superpowers/sdd/planteil3/progress.md:45-55`).
 */

const MIGRATIONEN = "src/app/m/radio/_db/migrations";

/**
 * ⛔ DER SATZ STEHT HIER AUSGESCHRIEBEN und wird nicht aus `page.tsx` importiert: sonst
 * richtete sich die Zusicherung gegen denselben Wert, den die Seite rendert, und koennte
 * konstruktiv nie fehlschlagen (`(ausleihe)/geraete/page.test.tsx:63-70`). Quelle des
 * Wortlauts: Spec:3486-3488.
 */
const VERLUST_SATZ = "Ein vorgewähltes Gerät ist nicht mehr frei und wurde aus der Auswahl entfernt.";

const kopfzeilenGelesen = vi.hoisted(() => vi.fn());
const hostRiegel = vi.hoisted(() => vi.fn());
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
 * ⚠️ DER RAHMEN UND DIE INSEL WERDEN DURCH ATTRAPPEN ERSETZT, die ihre Props als Attribute
 * an den GERENDERTEN Baum haengen — eine Zusage ueber das gerenderte Ergebnis gehoert an den
 * Baum, nicht an den Dateitext (`src/app/m/radio/page.test.tsx:99-114`). Ihr eigenes
 * Verhalten haben `_ui/AusleihRahmen.test.tsx` und `_ui/AusleihVorgang.test.tsx`.
 */
vi.mock("../../_ui/AusleihRahmen", () => ({
  AusleihRahmen: (p: { aktiv: string; zugang: { weg: string }; children: React.ReactNode }) => (
    <div data-rolle="radio-rahmen" data-aktiv={p.aktiv} data-weg={p.zugang.weg}>
      {p.children}
    </div>
  ),
}));
vi.mock("../../_ui/AusleihVorgang", () => ({
  AusleihVorgang: (p: {
    geraete: unknown[];
    vorauswahl: readonly string[];
    namensVorbelegung: string | null;
  }) => (
    <div
      data-rolle="radio-vorgang-attrappe"
      data-geraete={JSON.stringify(p.geraete)}
      data-vorauswahl={JSON.stringify(p.vorauswahl)}
      data-vorbelegung={JSON.stringify(p.namensVorbelegung)}
    />
  ),
}));

import { requireAusleihZugang } from "../../_lib/ausleihZugang";
import AusleihenPage, { dynamic } from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const ZUGANG_CODE = {
  weg: "code" as const,
  codeId: "zc-1",
  bezeichnung: "Aufsteller Wache",
  laeuftAb: new Date("2026-06-14T20:00:00Z"),
};
const ZUGANG_SUITE = { weg: "suite" as const, sub: "pid-1", name: "Rita Roth" };

/** Der Ausleihzeitpunkt der Fixtures: 14.06.2026, 09:12 in Berlin (dort UTC+2). */
const AUSGELIEHEN_AM = new Date("2026-06-14T07:12:00Z");

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-ausleihen-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
  halter.db = db;
  umleitungen.length = 0;
  vi.mocked(requireAusleihZugang).mockResolvedValue(ZUGANG_CODE);
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

async function rendere(sp: Record<string, string | string[]> = {}): Promise<void> {
  await mount(await AusleihenPage({ searchParams: Promise.resolve(sp) }));
}

/** Was die Seite ueber die RSC-Grenze an die Insel reicht. */
function propsAnDieInsel(): {
  geraete: Record<string, unknown>[];
  vorauswahl: string[];
  vorbelegung: string | null;
} {
  const knoten = query('[data-rolle="radio-vorgang-attrappe"]');
  return {
    geraete: JSON.parse(knoten.getAttribute("data-geraete") ?? "[]"),
    vorauswahl: JSON.parse(knoten.getAttribute("data-vorauswahl") ?? "[]"),
    vorbelegung: JSON.parse(knoten.getAttribute("data-vorbelegung") ?? "null"),
  };
}

describe("die Ausleihe an /ausleihen", () => {
  it("leitet der Riegel um, entsteht keine Flaeche", async () => {
    /*
     * ⛔ DIE SEITE RUFT DEN RIEGEL SELBST, obwohl `(ausleihe)/layout.tsx` ihn auch ruft
     * (§4.2.1, Spec:3401-3406): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein
     * Layout kann einer Seite keine Props reichen — diese Seite braucht `zugang` fuer den
     * Rahmen UND fuer die Vorbelegung des Namens (⬜ A-L2).
     * `riegel.test.ts` Klausel (f) haelt die ZEILE fest (und seit der Fix-Runde 2 zu A18
     * ihre STELLUNG als erste Anweisung), dieser Fall haelt die WIRKUNG ihres Fehlens:
     * ohne den Riegel rendert die Seite, statt abzubrechen.
     * ⚠️ DER WURF IST DER ERWARTETE AUSGANG. Ein `try`/`catch` in `page.tsx` verschluckte
     * den `redirect()`-Sentinel, und die Weiterleitung faende STILL nicht statt
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
     * ⛔ NULL, NICHT EINS (§4.2.1, Spec:3408-3413, Pflicht 16
     * `docs/radio-portierung-analyse.md:973-977`): das Praedikat ruft den Host-Riegel intern
     * als erste Anweisung; ein zweiter Aufruf behauptete, es sei hostblind. Der Unterschied
     * zum Gate ist gewollt — `src/app/m/radio/page.tsx` ruft ihn zusaetzlich, als die eine
     * angeordnete Ausnahme.
     */
    geraet({ id: "g-1", issi: "1001" });

    await rendere();

    expect(kopfzeilenGelesen).toHaveBeenCalledTimes(0);
    expect(hostRiegel).toHaveBeenCalledTimes(0);
  });

  it("markiert den Abschnitt ausleihen und reicht den Zugang an den Rahmen", async () => {
    geraet({ id: "g-1", issi: "1001" });

    await rendere();

    expect(query('[data-rolle="radio-rahmen"]').getAttribute("data-aktiv")).toBe("ausleihen");
    expect(query('[data-rolle="radio-rahmen"]').getAttribute("data-weg")).toBe("code");
  });

  it("faehrt dynamisch und nicht aus dem Vorrender-Vorrat", () => {
    /*
     * §4.7 (Spec:3826-3829). ⛔ SIE TRAEGT HIER MEHR ALS AUF DER UEBERSICHT: die Insel
     * schreibt ihre Auswahl mit `router.replace` in `?geraete=` zurueck (Spec:3426), und
     * jede dieser Adressen muss die serverseitige Pruefung aus §4.3.3 ERNEUT durchlaufen.
     */
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("die Ausleihe an /ausleihen: die serverseitige Pruefung der Vorwahl", () => {
  it("sortiert ungueltige Vorwahlen aus und sagt es", async () => {
    /*
     * §4.3.3 (Spec:3484-3488), woertlich: „Ungueltige IDs werden SERVERSEITIG aussortiert
     * und der Verlust wird ANGEZEIGT, nicht verschluckt … Heute prueft die Seite gar nichts,
     * der Fehler faellt erst beim Buchen auf."
     * ⛔ DREI LAGEN IN EINEM FALL, und alle drei sind der GLEICHE Verlust: eine Kennung, die
     * es nicht gibt; ein Geraet, das inzwischen VERGEBEN ist; ein Geraet, dessen Zustand
     * nicht „frei" ist. Ein Fall, der nur die erste prueft, liesse die zweite durch — und
     * die zweite ist die haeufige.
     */
    geraet({ id: "g-frei", issi: "1001" });
    geraet({ id: "g-vergeben", issi: "1002" });
    geraet({ id: "g-defekt", issi: "1003", status: "Defekt" });
    leihe("g-vergeben", "Anna Beispiel");

    await rendere({ geraete: "g-frei,g-vergeben,g-defekt,g-gibtesnicht" });

    expect(propsAnDieInsel().vorauswahl).toEqual(["g-frei"]);
    expect(query('[data-rolle="radio-verlust"]').textContent).toBe(VERLUST_SATZ);
  });

  it("laesst eine vollstaendig gueltige Vorwahl stehen und sagt nichts", async () => {
    /*
     * ⛔ DIE ANDERE HAELFTE, und ohne sie waere die erste mit einem Satz zufrieden, der
     * IMMER steht — eine Meldung ueber einen Verlust, den es nicht gab, ist genau die
     * Fehlerform, die das Gate mit „kein Rueckfalltext" abraeumt (Spec:2396-2398).
     */
    geraet({ id: "g-1", issi: "1001" });
    geraet({ id: "g-2", issi: "1002" });

    await rendere({ geraete: "g-1,g-2" });

    expect(propsAnDieInsel().vorauswahl).toEqual(["g-1", "g-2"]);
    expect(exists('[data-rolle="radio-verlust"]')).toBe(false);
  });

  it("wirft bei keiner Form des Parameters — auch nicht bei der wiederholten", async () => {
    /*
     * ⛔ `auswahlLesen` WIRFT NIE (`_lib/auswahl.ts:91-93`): Next liefert
     * `string | string[] | undefined`, und eine handgetippte Adresse darf kein HTTP 500 auf
     * der Ausleihseite sein.
     */
    geraet({ id: "g-1", issi: "1001" });

    await rendere({ geraete: ["g-1", "g-gibtesnicht"] });
    expect(propsAnDieInsel().vorauswahl).toEqual(["g-1"]);

    await unmount();
    await rendere();
    expect(propsAnDieInsel().vorauswahl).toEqual([]);
    expect(exists('[data-rolle="radio-verlust"]'), "ohne Vorwahl gibt es keinen Verlust").toBe(false);
  });

  it("der Verlustsatz traegt role alert und kein aria-live", async () => {
    /*
     * ⛔ Ruling `.superpowers/sdd/planteil3/progress.md:603-634`, Punkt 1. Das Kriterium ist,
     * WANN die Region in den Baum kommt: die Insel schreibt ihre Auswahl mit
     * `router.replace` zurueck, und diese WEICHE Navigation rendert die Seite neu, OHNE ein
     * neues Dokument zu laden — ein Geraet, das inzwischen vergeben wurde, laesst den Satz
     * dann mitten im Vorgang erscheinen. ⛔ KEIN `aria-live` daneben: `alert` impliziert
     * `assertive`, ein `polite` kehrte die Wahl still um.
     */
    geraet({ id: "g-1", issi: "1001" });

    await rendere({ geraete: "g-1,g-weg" });

    const ort = query('[data-rolle="radio-verlust"]');
    expect(ort.getAttribute("role")).toBe("alert");
    expect(ort.getAttribute("aria-live")).toBeNull();
  });
});

describe("die Ausleihe an /ausleihen: was ueber die RSC-Grenze geht", () => {
  it("reicht die Seriennummer nicht ueber die RSC-Grenze, wohl aber im Suchschluessel", async () => {
    /*
     * ⛔ §4.1 PUNKT 2 (Spec:3343-3348): „die Seriennummer wandert nicht in den Client. Sie
     * bleibt Suchfeld — die Suche laeuft dafuer serverseitig." Die Auflage aus dem Ledger
     * (`.superpowers/sdd/planteil3/progress.md:354-372`) verlangt den Nachweis an der Prop,
     * die ueber die Grenze geht — nicht an einer testeigenen Hilfsfunktion.
     * ⛔ UND DIE ZWEITE HAELFTE IST DIE TRAGENDE: der Suchschluessel muss sie ENTHALTEN,
     * sonst waere die Zusicherung mit einem Lesepfad zufrieden, der sie ganz verliert.
     */
    geraet({ id: "g-1", issi: "1001", rufname: "Kater 1", serialNumber: "SN-4711" });

    await rendere();

    const zeilen = propsAnDieInsel().geraete;
    expect(zeilen).toHaveLength(1);
    const felder = Object.keys(zeilen[0]!).sort();
    expect(felder).toEqual(["geraetetyp", "id", "rufname", "standort", "status", "suchschluessel"]);
    /*
     * ⚠️ KLEINGESCHRIEBEN VERGLICHEN, UND ZWAR AUF BEIDEN SEITEN: `suchschluessel` ist
     * durch `normalisiereSuchtext` gelaufen (`_lib/filter.ts:108`), traegt die Kennung also
     * als „sn-4711". Ein Vergleich gegen die Grossschreibung faende sie DORT nicht — und
     * uebersaehe sie in jedem anderen Feld, das sie kleingeschrieben truege.
     */
    expect(zeilen[0]!.suchschluessel, "ohne sie waere die Suche um ein Feld aermer")
      .toContain("sn-4711");
    for (const [name, wert] of Object.entries(zeilen[0]!)) {
      if (name === "suchschluessel") continue;
      expect(String(wert).toLowerCase(), `${name} traegt die Seriennummer`).not.toContain("sn-4711");
    }
  });

  it("reicht weder entleiher noch seit an diese Insel", async () => {
    /*
     * ⚠️ BENANNTE ABWEICHUNG VON DER UEBERSICHT: dort traegt die Zeile den Entleiher und die
     * Uhrzeit (`_ui/GeraeteZeile.tsx`). Hier nicht — wer ein vergebenes Geraet gerade hat,
     * ist die Auskunft der Uebersicht, und ihre Nebenzeilen-Logik ein zweites Mal zu
     * schreiben waere ein zweiter Ort fuer dieselbe Zeile. Der Nebeneffekt ist der kleinere
     * RSC-Payload: ein Klarname weniger auf einem geteilten Telefon.
     */
    geraet({ id: "g-1", issi: "1001" });
    geraet({ id: "g-2", issi: "1002" });
    leihe("g-2", "Anna Beispiel");

    await rendere();

    const roh = JSON.stringify(propsAnDieInsel().geraete);
    expect(roh).not.toContain("Anna Beispiel");
    expect(roh).not.toContain("entleiher");
  });

  it("reicht auch vergebene Geraete durch — die Liste zeigt sie, waehlbar sind sie nicht", async () => {
    /*
     * `DeviceSelector.tsx:36-51`: der Bestand zeigt ALLE Geraete und macht nur die freien
     * waehlbar. Ein Filter auf „nur freie" waere ein stiller Portverlust — man saehe nicht,
     * dass das gesuchte Geraet existiert und gerade vergeben ist.
     * ⛔ WAEHLBAR IST TROTZDEM NUR EIN FREIES: das entscheidet die Insel am `status`
     * (`_ui/AusleihVorgang.test.tsx`, „ein nicht freies Geraet ist nicht antippbar").
     */
    geraet({ id: "g-1", issi: "1001" });
    geraet({ id: "g-2", issi: "1002" });
    leihe("g-2", "Anna Beispiel");

    await rendere();

    const zeilen = propsAnDieInsel().geraete;
    expect(zeilen.map((z) => z.id).sort()).toEqual(["g-1", "g-2"]);
    expect(zeilen.find((z) => z.id === "g-2")!.status).toBe("ON_LOAN");
  });
});

describe("die Ausleihe an /ausleihen: ⬜ A-L2, die Vorbelegung des Namens", () => {
  it("belegt den Namen beim Suite-Weg vor", async () => {
    /*
     * ⬜ A-L2, §3.5.4 (Spec:2738-2748) und §4.10 (Spec:3955-3961): „Vorschlag: ja,
     * vorbelegt und frei ueberschreibbar … Faellt die Antwort auf nein, aendert sich genau
     * eine Zeile in `ausleihen/page.tsx` (die Vorbelegung des `defaultValue`)."
     * ⛔ DASS ER UEBERSCHREIBBAR IST, misst `_ui/AusleihVorgang.test.tsx` („der vorbelegte
     * Name ist ueberschreibbar"); hier wird gemessen, WAS die Seite reicht.
     */
    vi.mocked(requireAusleihZugang).mockResolvedValue(ZUGANG_SUITE);
    geraet({ id: "g-1", issi: "1001" });

    await rendere();

    expect(propsAnDieInsel().vorbelegung).toBe("Rita Roth");
  });

  it("belegt beim Code-Weg nichts vor und reicht sub an keine Insel", async () => {
    /*
     * ⛔ BEIM CODE-WEG GIBT ES NICHTS VORZUBELEGEN: `AusleihZugang` traegt dort `codeId` und
     * `bezeichnung` — die Herkunft des ZUGANGS, keinen Personennamen. Die Bezeichnung des
     * Aufstellers in ein Namensfeld zu setzen waere ein Entleiher, den es nicht gibt.
     * ⛔ UND `sub` GEHT NIRGENDWOHIN (§3.5.4, Zusage §3.10 Nr. 3): der Vorgang bleibt
     * anonym, in BEIDEN Wegen. Deshalb prueft dieser Fall den GANZEN gerenderten Baum und
     * nicht nur die eine Prop.
     */
    geraet({ id: "g-1", issi: "1001" });
    await rendere();
    expect(propsAnDieInsel().vorbelegung).toBeNull();
    expect(query('[data-rolle="radio-vorgang-attrappe"]').outerHTML).not.toContain("Aufsteller Wache");

    await unmount();
    vi.mocked(requireAusleihZugang).mockResolvedValue(ZUGANG_SUITE);
    await rendere();
    expect(document.body.innerHTML, "die Kennung gehoert auf keinen Bildschirm").not.toContain("pid-1");
  });
});
