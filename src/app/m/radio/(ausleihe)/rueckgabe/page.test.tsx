// @vitest-environment jsdom
// src/app/m/radio/(ausleihe)/rueckgabe/page.test.tsx
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
 * DIE RUECKGABE AN `/rueckgabe` (Spec 1 §4.4, `:3554-3594`).
 *
 * ⛔ WARUM DIE SEITENFUNKTION DIREKT GERUFEN UND IHR ERGEBNIS DANACH GEMOUNTET WIRD: sie ist
 * eine ASYNC Server Component; `mount()` treibt eine solche nicht an, und `redirect()`
 * arbeitet ueber einen geworfenen Sentinel. Hauspraezedenz:
 * `src/app/m/lagerbuch/page.test.tsx:139`, `src/app/m/radio/page.test.tsx:9-20` und
 * `(ausleihe)/ausleihen/page.test.tsx:16-26`.
 *
 * ⛔ `_db/leihen.ts` IST HIER NICHT GEMOCKT, UND DAS IST DER PUNKT — hinter `getDb()` steht
 * eine ECHTE, migrierte SQLite-Datei. Die Projektion der offenen Ausleihen und die fertige
 * Zeitzeichenkette muessen an Zeilen messen, die der PRODUKTIONSCODE gebaut hat (REVIEW-A13
 * Fund K3: eine Zusicherung gegen testeigene Hilfsdaten blieb gegen fuenf Mutationen gruen).
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
 * Wortlauts: `LoanedDeviceList.tsx:59`, `:61` — woertlich verlangt in `briefs/A20.md:15`.
 */
const LEER_SATZ = "Keine Geräte ausgeliehen";

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
 * Verhalten haben `_ui/AusleihRahmen.test.tsx` und `_ui/RueckgabeListe.test.tsx`.
 */
vi.mock("../../_ui/AusleihRahmen", () => ({
  AusleihRahmen: (p: { aktiv: string; zugang: { weg: string }; children: React.ReactNode }) => (
    <div data-rolle="radio-rahmen" data-aktiv={p.aktiv} data-weg={p.zugang.weg}>
      {p.children}
    </div>
  ),
}));
vi.mock("../../_ui/RueckgabeListe", () => ({
  RueckgabeListe: (p: { ausleihen: unknown[] }) => (
    <div data-rolle="radio-rueckgabeliste-attrappe" data-ausleihen={JSON.stringify(p.ausleihen)} />
  ),
}));

import { requireAusleihZugang } from "../../_lib/ausleihZugang";
import RueckgabePage, { dynamic } from "./page";
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
  tmp = mkdtempSync(join(tmpdir(), "radio-rueckgabe-"));
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

function geraet(id: string, issi: string) {
  db.insert(devices)
    .values({
      id,
      issi,
      rufname: `Ruf ${id}`,
      deviceType: "Motorola MTP3550",
      status: "Einsatzbereit",
      location: "Fahrzeughalle",
      createdAt: new Date("2026-01-01T10:00:00Z"),
      updatedAt: new Date("2026-05-01T10:00:00Z"),
    })
    .run();
}

function leihe(werte: {
  id: string;
  deviceId: string;
  rufname: string;
  entleiher: string;
  borrowedAt?: Date;
  returnedAt?: Date;
}) {
  db.insert(loans)
    .values({
      id: werte.id,
      deviceId: werte.deviceId,
      snapshotCallSign: werte.rufname,
      borrowerName: werte.entleiher,
      borrowedAt: werte.borrowedAt ?? AUSGELIEHEN_AM,
      returnedAt: werte.returnedAt,
      createdAt: werte.borrowedAt ?? AUSGELIEHEN_AM,
      updatedAt: werte.borrowedAt ?? AUSGELIEHEN_AM,
    })
    .run();
}

async function rendere(): Promise<void> {
  await mount(await RueckgabePage());
}

/** Was die Seite ueber die RSC-Grenze an die Insel reicht. */
function propsAnDieInsel(): Record<string, unknown>[] {
  return JSON.parse(
    query('[data-rolle="radio-rueckgabeliste-attrappe"]').getAttribute("data-ausleihen") ?? "[]",
  );
}

describe("die Rueckgabe an /rueckgabe", () => {
  it("leitet der Riegel um, entsteht keine Flaeche", async () => {
    /*
     * ⛔ DIE SEITE RUFT DEN RIEGEL SELBST, obwohl `(ausleihe)/layout.tsx` ihn auch ruft
     * (§4.2.1, Spec:3401-3406): Route-Group-Grenzen sind KEINE Sicherheitsgrenzen, und ein
     * Layout kann einer Seite keine Props reichen — diese Seite braucht `zugang` fuer den
     * Rahmen. `riegel.test.ts` Klausel (f) haelt die ZEILE fest (und seit der Fix-Runde 2 zu
     * A18 ihre STELLUNG als erste Anweisung), dieser Fall haelt die WIRKUNG ihres Fehlens:
     * ohne den Riegel rendert die Seite, statt abzubrechen.
     * ⚠️ DER WURF IST DER ERWARTETE AUSGANG. Ein `try`/`catch` in `page.tsx` verschluckte den
     * `redirect()`-Sentinel, und die Weiterleitung faende STILL nicht statt
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
    geraet("g-1", "1001");
    leihe({ id: "l-1", deviceId: "g-1", rufname: "41/12", entleiher: "Anna Beispiel" });

    await rendere();

    expect(kopfzeilenGelesen).toHaveBeenCalledTimes(0);
    expect(hostRiegel).toHaveBeenCalledTimes(0);
  });

  it("haengt im Ausleih-Rahmen und markiert den dritten Abschnitt", async () => {
    /*
     * §4.2 (Spec:3377-3381): drei Ziele in der Fussnavigation, die Aktivmarkierung ist ein
     * SERVER-Prop und kein `usePathname()` (Bauform-Zulaessigkeitstafel Zeile 16). ⛔ KEINE
     * `<Shell>` (Entscheidung E9).
     * ⛔ UND DER ZUGANG WANDERT UNVERAENDERT WEITER: das Sitzungsetikett kommt vom RIEGEL
     * (`_ui/AusleihRahmen.tsx`), nicht aus dem Cookie.
     */
    vi.mocked(requireAusleihZugang).mockResolvedValue(ZUGANG_SUITE);

    await rendere();

    expect(query("[data-rolle='radio-rahmen']").getAttribute("data-aktiv")).toBe("rueckgabe");
    expect(query("[data-rolle='radio-rahmen']").getAttribute("data-weg")).toBe("suite");
    expect(query("h1").textContent).toBe("Geräte zurückgeben");
  });

  it("reicht fertige Zeichenketten ueber die RSC-Grenze, kein Date", async () => {
    /*
     * §4.1 Punkt 1 (Spec:3336-3341) und die Projektion aus Spec:4084:
     * `{ id, rufname, entleiher, seitText }` — und NICHTS SONST. ⛔ EIN `Date` ueber der
     * RSC-Grenze waere in einer Client-Insel ein Objekt mit der Zeitzone des BROWSERS; die
     * Flaeche zeigte dann je nach Geraet eine andere Uhrzeit fuer denselben Vorgang.
     * ⛔ `Object.keys()` AUF GLEICHHEIT, NICHT AUF TEILMENGE (Spec:5254-5258): „eine
     * Teilmengenpruefung faengt genau den Fall nicht, gegen den der Test steht" — ein
     * durchgereichtes `...ausleihe` machte jedes neue Feld des Lesemodells still zu einem
     * Feld im Client-Payload.
     * ⛔ DER RUFNAME KOMMT AUS DEM SCHNAPPSCHUSS DER LEIHZEILE (`_db/schema.ts:201-205`),
     * nicht aus einem Join auf `devices`: die Fixture setzt beide bewusst VERSCHIEDEN,
     * sonst belegte der Fall die Herkunft nicht.
     */
    geraet("g-1", "1001");
    leihe({ id: "l-1", deviceId: "g-1", rufname: "41/12", entleiher: "Anna Beispiel" });

    await rendere();

    const zeilen = propsAnDieInsel();
    expect(zeilen.length).toBe(1);
    expect(Object.keys(zeilen[0]!).sort()).toEqual(["entleiher", "id", "rufname", "seitText"]);
    expect(zeilen[0]).toEqual({
      id: "l-1",
      rufname: "41/12",
      entleiher: "Anna Beispiel",
      seitText: "14.06.2026, 09:12",
    });
  });

  it("zeigt nur OFFENE Ausleihen, neueste zuerst", async () => {
    /*
     * `offeneAusleihen` filtert auf `returned_at IS NULL` und ordnet absteigend
     * (`_db/leihen.ts:333-351`, Alt-Vorbild `loanRepo.ts:126-135`). ⛔ DIESER FALL MISST DIE
     * SEITE UND NICHT DIE DATENFUNKTION: er belegt, dass die Seite sie UEBERHAUPT benutzt —
     * eine Seite, die `loans` selbst laese, waere typkorrekt und liesse `_db/leihen.test.ts`
     * gruen.
     */
    geraet("g-1", "1001");
    geraet("g-2", "1002");
    geraet("g-3", "1003");
    leihe({ id: "l-alt", deviceId: "g-1", rufname: "41/12", entleiher: "Anna Beispiel" });
    leihe({
      id: "l-neu",
      deviceId: "g-2",
      rufname: "41/13",
      entleiher: "Björn Müller",
      borrowedAt: new Date("2026-06-14T08:30:00Z"),
    });
    leihe({
      id: "l-zurueck",
      deviceId: "g-3",
      rufname: "Wache 7",
      entleiher: "Carla Cordes",
      returnedAt: new Date("2026-06-14T12:00:00Z"),
    });

    await rendere();

    expect(propsAnDieInsel().map((z) => z.id)).toEqual(["l-neu", "l-alt"]);
  });

  it("zeigt bei leerer Liste den Leerzustand und KEINE Insel", async () => {
    /*
     * §4.4 Schritt 6 (Spec:3563): „War die Liste leer: ‚Keine Geraete ausgeliehen' (antd
     * `Empty`) — `LoanedDeviceList.tsx:54-63` woertlich."
     * ⛔ `Empty` NACKT, kein `Empty.PRESENTED_IMAGE_SIMPLE`: Compound-Zugriff in einer Server
     * Component ist HTTP 500 (Falle 1, `CLAUDE.md:11-13`). Vorbild:
     * `(ausleihe)/geraete/page.tsx` und `lagerbuch/verwaltung/(arbeit)/page.tsx:130`.
     * ⛔ UND DIE INSEL ERSCHEINT DANN GAR NICHT — eine Suchzeile ueber nichts ist eine
     * Bedienflaeche ohne Gegenstand (Spec:3559, `routes/return.tsx:60`).
     *
     * ⬜ WAS DIESER ZUSCHNITT KOSTET, und es steht hier statt nur im Bericht: raeumt eine
     * Person die LETZTE Ausleihe ab, entwertet `revalidatePath("/rueckgabe")`
     * (`_actions/ausleihe.ts:184-185`) diese Seite, sie rendert neu — und der Erfolgssatz
     * „41/12 zurueckgegeben." verschwindet mit der Insel, die ihn haelt. Was bleibt, ist die
     * verschwundene Karte und dieser Leerzustand. Der Bestand haette denselben Verlust nicht,
     * weil sein Toast ausserhalb haengt (`routes/return.tsx:43`); ein Toast-System gibt es in
     * dieser Suite aber nicht (Entscheidung E6). Der Betreiber entscheidet, ob es das wert
     * ist; die Gegenform waere, den Leerzustand IN die Insel zu ziehen.
     */
    await rendere();

    expect(exists("[data-rolle='radio-rueckgabeliste-attrappe']")).toBe(false);
    expect(query("[data-rolle='radio-leer-ausleihen']").textContent).toContain(LEER_SATZ);
  });

  it("ist ausdruecklich dynamisch", async () => {
    /*
     * ⛔ ERSATZ FUER `staleTime: 30_000` UND `keepPreviousData` DES ALT-KIOSK (§4.7,
     * Spec:3826-3829). ⛔ BEIDES, NICHT EINES VON BEIDEN (`VORABSCAN-A.md:415-424`, Fund
     * F26): DIESE Zeile verhindert, dass die SERVERANTWORT vorgerendert ist;
     * `revalidatePath("/rueckgabe")` in `_actions/ausleihe.ts:185` entwertet zusaetzlich den
     * ROUTER-CACHE DES CLIENTS — und nur dadurch verschwindet die zurueckgegebene Karte ohne
     * einen Neuaufbau der Seite.
     * ⛔ EINE VORGERENDERTE ANTWORT WAERE HIER BESONDERS TEUER: sie zeigte eine Leihe, die
     * jemand anders vor Minuten zurueckgegeben hat, und der Dialog scheiterte dann an
     * `schon-zurueck` (`_db/leihen.ts:673-674`).
     */
    expect(dynamic).toBe("force-dynamic");
  });
});
