import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * DIE ZEITZONE DER ANZEIGE — und warum diese Datei das Modul unter einer
 * FREMDEN Prozess-Zeitzone IMPORTIERT.
 *
 * Ohne `timeZone` formatiert `Intl` in der Zone des SERVERPROZESSES. Weder
 * `compose.yaml` noch das `Dockerfile` setzen `TZ`, der Container laeuft also
 * auf UTC — im Sommer zwei Stunden, im Winter eine hinter der Berliner
 * Wanduhr. Die Entwicklungsmaschine steht auf `Europe/Berlin`, und dort sind
 * „ohne `timeZone`" und „`timeZone: Europe/Berlin`" DASSELBE Ergebnis: **die
 * Anzeige ist lokal richtig und in Produktion falsch.** Ein Test, der nur unter
 * `Europe/Berlin` laeuft, ist deshalb genau der Test, der den Fehler nicht
 * gesehen hat.
 *
 * WARUM `await import` UND `vi.resetModules()` STATT EINES STATISCHEN IMPORTS —
 * das ist die eigentliche Lehre dieser Datei, und sie ist teuer erkauft: die
 * Formatierer in `zeit.ts` stehen auf MODULEBENE. Ein `Intl.DateTimeFormat`
 * ohne `timeZone` loest seine Zone EINMAL BEI DER ERZEUGUNG auf und behaelt sie
 * danach. Ein spaeteres `process.env.TZ = "UTC"` erreicht ihn nicht mehr.
 *
 * Die erste Fassung dieser Datei importierte `./zeit` statisch und drehte `TZ`
 * erst in den Tests. Sie war gruen — **und blieb gruen, als die Mutation
 * `timeZone` aus dem Formatierer entfernte.** Sie besasz ihre Aussage nicht:
 * gemessen wurde ein Formatierer, der beim Import auf der Berliner
 * Entwicklungsmaschine erzeugt worden war. Genau so kommt der Fehler in
 * Produktion durch, nur andersherum.
 *
 * Deshalb wird `TZ` VOR dem Import gesetzt und das Modul je Zone frisch
 * geladen. Das ist zugleich die Lage im Container: dort wird `zeit.ts` unter
 * UTC importiert.
 *
 * SOMMER **UND** WINTER, und das ist keine Gruendlichkeit: mit nur einem
 * Sommerzeitpunkt sind `timeZone: "Europe/Berlin"` und ein fest verdrahtetes
 * `+02:00` nicht zu unterscheiden — also genau die Fehlerklasse dieser Naht.
 */

/** 2026-07-31T12:00:00Z — Sommerzeit (CEST, UTC+2), Berliner Wanduhr 14:00. */
const SOMMER = new Date("2026-07-31T12:00:00Z");
/** 2026-01-15T12:00:00Z — Winterzeit (CET, UTC+1), Berliner Wanduhr 13:00. */
const WINTER = new Date("2026-01-15T12:00:00Z");

/**
 * Vier Prozess-Zonen, davon drei fremde: UTC (der Container), eine negative
 * (Los Angeles, −7/−8) und die extremste positive der Welt (Kiritimati, +14).
 * Die negative zoege bei fehlendem `timeZone` sogar den KALENDERTAG zurueck,
 * die positive schoebe ihn vor.
 */
const PROZESS_ZONEN = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Europe/Berlin"] as const;

const TZ_VORHER = process.env.TZ;

/*
 * Zuruecksetzen ist Pflicht, nicht Hoeflichkeit: ein ausgelaufenes `TZ=UTC`
 * verstellte still die Uhr jeder anderen Testdatei desselben Workers — ein
 * Fehlschlag, den man an der falschen Datei suchen wuerde.
 */
afterAll(() => {
  setzeTz(TZ_VORHER);
});

function setzeTz(zone: string | undefined): void {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
}

/** Laedt `zeit.ts` FRISCH unter `zone` — siehe Kopfkommentar. */
async function ladeUnterZone(zone: string) {
  setzeTz(zone);
  vi.resetModules();
  try {
    return await import("./zeit");
  } finally {
    setzeTz(TZ_VORHER);
  }
}

describe("die Vorrichtung", () => {
  /**
   * Ohne diese Zusage koennte die ganze Datei gruen sein, weil `process.env.TZ`
   * gar nicht mehr wirkt — und nicht, weil der Kode richtig ist.
   */
  it("dreht die Prozess-Zeitzone tatsaechlich, und zwar VOR dem Import", async () => {
    setzeTz("UTC");
    const inUtc = new Date(2026, 6, 31, 14, 0, 0).toISOString();
    setzeTz("America/Los_Angeles");
    const inLosAngeles = new Date(2026, 6, 31, 14, 0, 0).toISOString();
    setzeTz(TZ_VORHER);

    expect(inUtc).toBe("2026-07-31T14:00:00.000Z");
    expect(inLosAngeles).not.toBe(inUtc);
  });

  /**
   * Die Gegenprobe zur Lehre oben: ein Formatierer OHNE `timeZone`, unter UTC
   * erzeugt, zeigt 12:00 statt 14:00. Diese Zeile ist der Defekt selbst,
   * festgehalten — sie belegt, dass die Zusagen darunter etwas zu holen haben.
   */
  it("ein Formatierer ohne `timeZone` zeigt unter UTC die falsche Stunde", () => {
    setzeTz("UTC");
    const ohneZone = new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(SOMMER);
    setzeTz(TZ_VORHER);

    expect(ohneZone).toBe("31.07.2026, 12:00");
  });
});

describe("zeitpunktBerlin", () => {
  it.each(PROZESS_ZONEN)("zeigt unter TZ=%s die Berliner Wanduhrzeit", async (zone) => {
    const { zeitpunktBerlin } = await ladeUnterZone(zone);
    expect(zeitpunktBerlin(SOMMER)).toBe("31.07.2026, 14:00");
    expect(zeitpunktBerlin(WINTER)).toBe("15.01.2026, 13:00");
  });

  /**
   * Die Locale steckt in der Aussage: `de-DE` mit `dateStyle: "medium"` ergibt
   * „31.07.2026", `en-US` ergaebe „Jul 31, 2026". Und `timeStyle: "short"`
   * traegt KEINE Sekunden — das unterscheidet diese Form von der genauen.
   */
  it("schreibt deutsch, ohne Sekunden", async () => {
    const { zeitpunktBerlin } = await ladeUnterZone("UTC");
    expect(zeitpunktBerlin(SOMMER)).not.toMatch(/:\d\d:\d\d/);
  });
});

describe("zeitpunktGenauBerlin", () => {
  /**
   * Das Zugriffsprotokoll fuehrt SEKUNDEN mit: zwei Downloads derselben Minute
   * waeren sonst nicht auseinanderzuhalten, und genau die Reihenfolge ist die
   * Frage, die man an ein Protokoll stellt.
   */
  it.each(PROZESS_ZONEN)("zeigt unter TZ=%s die Berliner Sekunde", async (zone) => {
    const { zeitpunktGenauBerlin } = await ladeUnterZone(zone);
    expect(zeitpunktGenauBerlin(SOMMER)).toBe("31.07.2026, 14:00:00");
    expect(zeitpunktGenauBerlin(new Date("2026-07-31T12:00:03Z"))).toBe("31.07.2026, 14:00:03");
  });
});

describe("langerZeitpunktBerlin", () => {
  /**
   * Die ausgeschriebene Form der oeffentlichen Empfaengerseite — dort ist der
   * Ablauf die einzige Zahl, nach der sich jemand richtet, und sie steht auf
   * einem fremden Handy ohne weiteren Zusammenhang.
   */
  it.each(PROZESS_ZONEN)("zeigt unter TZ=%s den ausgeschriebenen Monat", async (zone) => {
    const { langerZeitpunktBerlin } = await ladeUnterZone(zone);
    expect(langerZeitpunktBerlin(SOMMER)).toBe("31. Juli 2026 um 14:00");
    expect(langerZeitpunktBerlin(WINTER)).toBe("15. Januar 2026 um 13:00");
  });
});

describe("die Zone selbst", () => {
  it("ist `Europe/Berlin` — dieselbe Festlegung wie `TIME_ZONE` im Modul `feedback`", async () => {
    const { ZEITZONE_ANZEIGE } = await ladeUnterZone("UTC");
    expect(ZEITZONE_ANZEIGE).toBe("Europe/Berlin");
  });

  /**
   * FALLE 6 ALS QUELLTEXT-SCAN. Die Aufrufer dieses Moduls sind ueberwiegend
   * Server Components; ein `"use client"` hier gaebe ihnen eine Client-Referenz
   * statt der Funktion — HTTP 500 fuer die ganze Seite. Vitest kann das
   * strukturell NICHT bemerken (dort ist `"use client"` ein wirkungsloser
   * String), ein Blick in die Quelle aber schon.
   */
  it("traegt kein `use client`", () => {
    const quelle = readFileSync(new URL("./zeit.ts", import.meta.url), "utf8");
    /*
     * Auf die DIREKTIVE gesucht, nicht auf die Zeichenfolge: der Kopfkommentar
     * der Datei erklaert die Falle und nennt sie dabei. Eine Direktive ist eine
     * Zeile, die nur aus dem Stringliteral besteht.
     */
    const zeilen = quelle.split("\n").map((z) => z.trim());
    expect(zeilen.filter((z) => /^["']use client["'];?$/.test(z))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// „DIE EINE STELLE" — als Zusicherung statt als Behauptung im Kopfkommentar
// ---------------------------------------------------------------------------

/**
 * DER KOPF DIESER DATEI BEHAUPTET ETWAS UEBER DAS GANZE MODUL, und bis hierher
 * war das eine Absichtserklaerung: „die eine Stelle, an der ein Zeitpunkt
 * zonenabhaengig in Text verwandelt wird". Die Zusagen darueber messen den
 * Baustein — dass ihn ALLE benutzen, messen sie nicht. Genau so kam die
 * Fehlerklasse dieser Naht ueberhaupt zustande: sieben Aufrufstellen in sechs
 * Dateien, jede fuer sich plausibel, keine mit `timeZone`.
 *
 * WARUM EIN QUELLTEXT-SCAN UND KEIN VERHALTENSTEST. Ein Formatierer ohne
 * `timeZone` liefert auf der Entwicklungsmaschine (`Europe/Berlin`) die
 * IDENTISCHE Zeichenfolge wie der richtige. Kein Test einer Seite kann den
 * Unterschied je sehen — nicht schwer, sondern unmoeglich. Der Quelltext kann
 * es. Dieselbe Bauform wie der `@ant-design/icons`-Riegel in
 * `shares/[id]/page.test.tsx`.
 *
 * OHNE KOMMENTARE GESUCHT: mindestens fuenf Dateien des Moduls SCHREIBEN ueber
 * diese Falle und nennen `Intl` dabei beim Namen — ein Scan ueber den Rohtext
 * fiele reihenweise ueber die eigenen Begruendungen.
 *
 * TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit: die
 * Gegenprobe oben (`ein Formatierer ohne timeZone zeigt unter UTC die falsche
 * Stunde`) IST ein solcher Formatierer. Sie ist der festgehaltene Defekt und
 * muss stehen bleiben.
 */
const MODULWURZEL = fileURLToPath(new URL("..", import.meta.url));

/** Die zonenabhaengigen Formen. `toISOString()` fehlt hier mit Absicht — es
 *  liest die Prozesszone strukturell nicht (Begruendung im Kopf von `zeit.ts`). */
const ZONENABHAENGIG = [
  "Intl.DateTimeFormat",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
];

function quelldateien(verzeichnis: string): string[] {
  const gefunden: string[] = [];
  for (const eintrag of readdirSync(verzeichnis, { withFileTypes: true })) {
    const pfad = `${verzeichnis}/${eintrag.name}`;
    if (eintrag.isDirectory()) {
      gefunden.push(...quelldateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag.name)) continue;
    if (/\.test\.tsx?$/.test(eintrag.name)) continue;
    gefunden.push(pfad);
  }
  return gefunden;
}

describe("die eine Stelle", () => {
  it("ist die einzige Datei des Moduls, die zonenabhaengig formatiert", () => {
    const dateien = quelldateien(MODULWURZEL).filter((p) => !p.endsWith("/_lib/zeit.ts"));
    // Ohne diese Zusage waere die Schleife darunter bei einem kaputten Pfad
    // leer und damit gruen, ohne eine einzige Datei gelesen zu haben. 30 und
    // nicht die heute gemessenen 59: die Zahl soll den leeren Lauf abfangen,
    // nicht bei jeder neuen Datei des Moduls nachgezogen werden muessen.
    expect(dateien.length).toBeGreaterThan(30);

    const treffer: string[] = [];
    for (const pfad of dateien) {
      const ohneKommentare = readFileSync(pfad, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const form of ZONENABHAENGIG) {
        if (ohneKommentare.includes(form)) {
          treffer.push(`${pfad.slice(MODULWURZEL.length)}: ${form}`);
        }
      }
    }

    expect(treffer, "zonenabhaengige Formatierung gehoert nach `_lib/zeit.ts`").toEqual([]);
  });
});
