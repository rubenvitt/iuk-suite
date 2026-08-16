// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AktionsOptionen } from "../_lib/aktionsOptionen";
import type { AufgabeRow } from "../_db/schema";
import { ANLASS_ARTEN, type AnlassArt } from "../_lib/anzeige";
import type { Anlass, Lage } from "../_lib/lage";
import { ohneKommentare } from "./testQuellscan";

/*
 * DIE FUEHRUNGSKARTE (Oberflaechen-Spec 2026-08-16 §11.1) — drei Zusagen, die kein anderes Tor
 * treffen kann:
 *
 *  1. HOECHSTENS EIN `type="primary"` JE BELEGUNG. Der e2e-Zaehlriegel misst die ganze Flaeche und
 *     kann deshalb nicht sagen, WELCHE Belegung ihn gerissen hat; er laeuft ausserdem nur gegen die
 *     Seed-Lage, also gegen drei der 22 Anlaesse.
 *  2. FUER JEDE SPROSSE OHNE ZUSTANDSAKTION KEIN PRIMAERKNOPF (Regel P). Das ist die Zusage, die
 *     §9/S6 als echten Fehler des Siegerentwurfs benennt — ein Knopf, den der Server danach ablehnt.
 *  3. DER QUELLTEXT-SCAN AUF `Card`, `Alert` UND `"use client"` (§9/S5, §6.7). Die Client/Server-
 *     Entscheidung ist die eine, die STILL kippen kann: `typecheck`, `lint`, `build` und Vitest
 *     bleiben alle gruen, und erst ein echter Abruf zeigt den HTTP 500.
 *
 * DIE MOCKS FOLGEN `AktionsZone.test.tsx`: `../actions` auf Sentinels/`vi.fn()` (sonst zoege der
 * jsdom-Lauf `better-sqlite3`/`next/cache` herein), `useActionState` gemockt (die Karte rendert
 * ueber `FertigMeldenKnopf` und `FreigabeAktionen` zwei Inseln, die ihn rufen) und
 * `next/navigation` fuer `useRouter`.
 */
const { useActionStateMock, MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(() => [{ ok: true as const }, vi.fn(), false]),
  MARKER: Symbol("action"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("../actions", () => ({
  startenAction: vi.fn(),
  zuruecksetzenAction: vi.fn(),
  wiederaufnehmenAction: vi.fn(),
  zurueckziehenAction: vi.fn(),
  einplanenAnnehmenAction: vi.fn(),
  fertigMeldenAction: MARKER,
  freigebenAction: vi.fn(),
  zurueckweisenAction: MARKER,
  verteilenAction: MARKER,
  // Schritt 6: die Karte importiert `UmverteilenKnopf`, der beide Actions beim Import liest.
  umverteilenAction: MARKER,
}));

const { Fuehrungskarte } = await import("./Fuehrungskarte");

afterEach(async () => {
  await unmount();
});

const HEUTE = "2026-08-17";

function aufgabe(over: Partial<AufgabeRow> = {}): AufgabeRow {
  return {
    id: "a1", titel: "Verbandskästen prüfen", beschreibung: "Bestand kontrollieren.",
    prioritaet: "mittel", erstellerId: "malte", zugewiesenAn: "alina", status: "verteilt",
    faelligAm: "2026-08-27", faelligUhrzeit: null, dauerMinuten: 60,
    nachweisPflicht: false, nachweisArt: "text", prueferId: "malte", istSelbst: false,
    planDatum: null, planUhrzeit: null, planRang: 0, vorschlagDatum: null, vorschlagUhrzeit: null,
    erstelltAm: new Date("2026-08-17T08:00:00Z"), aktualisiertAm: new Date("2026-08-17T08:00:00Z"),
    ...over,
  };
}

const ALLE_AUS: AktionsOptionen = {
  starten: false, zuruecksetzen: false, fertig: false, freigeben: false,
  zurueckweisen: false, wiederaufnehmen: false, zurueckziehen: false, umverteilen: false,
  nachweisHochladen: false,
};

function anlass(art: AnlassArt, zeilen: AufgabeRow[]): Anlass {
  return { art, zeilen, einzeln: zeilen.length === 1 };
}

function lage(fuehrung: Anlass, alsNaechstes: Anlass | null = null): Lage {
  return {
    ansicht: "koordination",
    anlaesse: [fuehrung],
    fuehrung,
    alsNaechstes,
    zonen: [],
    achsenVorbehalt: null,
    kontext: "Kontext",
  };
}

function karte(fuehrung: Anlass, over: Record<string, unknown> = {}) {
  return (
    <Fuehrungskarte
      lage={lage(fuehrung, (over.alsNaechstes as Anlass | null) ?? null)}
      heute={HEUTE}
      namen={{ alina: "Alina", malte: "Malte", rike: "Rike" }}
      eigenePersonId="alina"
      optionen={(over.optionen as AktionsOptionen | null) ?? null}
      darfPlanAendern={(over.darfPlanAendern as boolean) ?? true}
      darfFreigabenSehen={(over.darfFreigabenSehen as boolean) ?? true}
      darfRoutinenVerwalten={(over.darfRoutinenVerwalten as boolean) ?? true}
      verteilen={
        (over.verteilen as null) === null && "verteilen" in over
          ? null
          : { bufdis: [], auslastung: [], tage: ["2026-08-17"] }
      }
      naechsterArbeitstag="2026-08-18"
      ereignis={(over.ereignis as never) ?? null}
      morgen={(over.morgen as AufgabeRow | null) ?? null}
      vertretungAnzahl={(over.vertretungAnzahl as number) ?? 0}
    />
  );
}

function primaerKnoepfe(): HTMLElement[] {
  return queryAll(".ant-btn-primary");
}

describe("Fuehrungskarte — Aufbau und Auszeichnung", () => {
  it("traegt `data-rolle=\"fuehrung\"` — die Adresse, an der der e2e-Riegel misst", async () => {
    await mount(karte(anlass("koordPosteingang", [aufgabe()])));
    expect(query("[data-rolle='fuehrung']")).toBeTruthy();
  });

  /**
   * DIE UEBERSCHRIFT IST NATIVES `<h2>`, NIE `Typography.Title` (Falle 1) — und bei n = 1 traegt
   * sie den TITEL, bei n > 1 die ZAHL (§4.3: „eine Karte, die aus zehn eines herausgreift,
   * verdeckt neun").
   */
  it("nennt bei n = 1 die Aufgabe und bei n > 1 die Zahl", async () => {
    await mount(karte(anlass("koordPosteingang", [aufgabe()])));
    expect(query("h2").textContent).toBe("Verbandskästen prüfen");
    await unmount();

    await mount(
      karte(anlass("koordPosteingang", [aufgabe(), aufgabe({ id: "a2" }), aufgabe({ id: "a3" })])),
    );
    expect(query("h2").textContent).toContain("3 Aufgaben warten auf Verteilung");
    expect(query("h2").textContent).not.toContain("Verbandskästen");
  });

  it("zeigt den Kicker in der Karte, den §3.5 fuer den Anlass ausschreibt", async () => {
    await mount(karte(anlass("koordPosteingang", [aufgabe()])));
    expect(query("[data-rolle='fuehrung']").textContent).toContain(
      "POSTEINGANG · NOCH NIEMANDEM ZUGEWIESEN",
    );
  });

  /**
   * DER WOCHENENDSATZ HAT GENAU EINEN ORT (§4.2): `bufdiKeinArbeitstag` traegt NULL Zeilen und
   * trotzdem einen Satz. Mit `anlass.einzeln` allein („genau eine Zeile") bliebe die Karte hier
   * STILL leer — der Fall, den §4.2 als Sonntagsbild ausdruecklich fuehrt.
   */
  it("belegt `bufdiKeinArbeitstag` trotz null Zeilen mit seinem Satz", async () => {
    await mount(karte(anlass("bufdiKeinArbeitstag", [])));
    expect(query("h2").textContent).toBe("Wochenende. Nächster Arbeitstag: Di, 18.08.");
  });

  it("schreibt denselben Satz in die Zeile ALS NAECHSTES, wenn der Anlass dort steht", async () => {
    await mount(
      karte(anlass("bufdiUeberfaellig", [aufgabe({ faelligAm: "2026-08-14", status: "in_arbeit" })]), {
        alsNaechstes: anlass("bufdiKeinArbeitstag", []),
        optionen: ALLE_AUS,
      }),
    );
    const text = query("[data-rolle='fuehrung']").textContent ?? "";
    expect(text).toContain("Als Nächstes");
    expect(text).toContain("Wochenende. Nächster Arbeitstag: Di, 18.08.");
  });

  it("laesst die Zeile ALS NAECHSTES weg, wenn `alsNaechstes` null ist (Ruhefall)", async () => {
    await mount(karte(anlass("koordRuhe", [])));
    expect(query("[data-rolle='fuehrung']").textContent).not.toContain("Als Nächstes");
  });

  /** Die Begruendung WOERTLICH — „das ist der ganze Wert einer Zurueckweisung" (§4.2). */
  it("zeigt die Begruendung einer Zurueckweisung woertlich", async () => {
    await mount(
      karte(anlass("bufdiZurueckgewiesen", [aufgabe({ status: "zurueckgewiesen" })]), {
        optionen: ALLE_AUS,
        ereignis: {
          id: "v1", aufgabeId: "a1", ereignis: "zurueckgewiesen", akteurId: "malte",
          notiz: "Bitte Reifendruck nachtragen.", ts: new Date("2026-08-16T09:00:00Z"),
        },
      }),
    );
    const text = query("[data-rolle='fuehrung']").textContent ?? "";
    expect(text).toContain("Bitte Reifendruck nachtragen.");
    expect(text).toContain("ZURÜCKGEWIESEN VON MALTE");
  });
});

describe("Fuehrungskarte — hoechstens ein Primaerknopf (Regel P)", () => {
  /**
   * JEDE BELEGUNG, NICHT NUR DIE DREI AUS DEM SEED: der e2e-Zaehlriegel laeuft gegen die
   * Seed-Lage und trifft damit drei der 22 Anlaesse. Hier steht jede einzeln.
   */
  it.each(ANLASS_ARTEN.map((art) => [art] as const))(
    "%s traegt hoechstens einen `.ant-btn-primary`",
    async (art) => {
      const zeilen = art.endsWith("Ruhe") || art.endsWith("Negativ") || art === "bufdiKeinArbeitstag"
        ? []
        : [aufgabe()];
      await mount(karte(anlass(art, zeilen), { optionen: ALLE_AUS }));
      expect(primaerKnoepfe().length).toBeLessThanOrEqual(1);
    },
  );

  /**
   * OHNE ZUSTANDSAKTION KEIN PRIMAERKNOPF — die Abwesenheit IST die Auskunft (Regel P). Das ist
   * §9/S6 auf den Fall angewendet, an dem der Siegerentwurf gescheitert waere: „In Bearbeitung"
   * neben einem Knopf, den `uebergang()` danach ablehnt.
   */
  it.each([
    ["koordUeberfaelligInArbeit"],
    ["koordZurueckgewiesen"],
    ["auftragUeberfaellig"],
    ["auftragUnverteilt"],
  ] as const)("%s traegt gar keinen Primaerknopf", async (art) => {
    await mount(karte(anlass(art as AnlassArt, [aufgabe()]), { optionen: ALLE_AUS }));
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  /*
   * DIE RAENGE 1 UND 5a — „ANDERS ZUWEISEN (DER ZEITPLAN WIRD DABEI GELEERT)" (§4.2, §7 Nr. 3).
   *
   * SIE STEHEN SEIT SCHRITT 6 NICHT MEHR IN DER LISTE DARUEBER, UND DAS IST DER GANZE UNTERSCHIED
   * ZWISCHEN „hat keine Zustandsaktion" UND „hat eine, die hier nicht gilt": beide Belegungen
   * tragen einen Primaerknopf GENAU DANN, wenn `optionen.umverteilen` gilt — also wenn
   * `uebergang()` es erlaubt, und das ist ausschliesslich aus `verteilt` der Fall. Die drei
   * Gegenproben unten decken die drei Wege, auf denen er ausbleibt.
   */
  it.each([["koordOhneTraeger"], ["koordUeberfaelligVerteilt"]] as const)(
    "%s traegt „Anders zuweisen“ als Primaerknopf, sobald optionen.umverteilen gilt",
    async (art) => {
      await mount(
        karte(anlass(art as AnlassArt, [aufgabe()]), {
          optionen: { ...ALLE_AUS, umverteilen: true },
        }),
      );
      expect(primaerKnoepfe()).toHaveLength(1);
      expect(primaerKnoepfe()[0]!.textContent).toContain(
        "Anders zuweisen (der Zeitplan wird dabei geleert)",
      );
    },
  );

  it.each([["koordOhneTraeger"], ["koordUeberfaelligVerteilt"]] as const)(
    "%s bleibt ohne Primaerknopf, wenn optionen.umverteilen falsch ist",
    async (art) => {
      await mount(karte(anlass(art as AnlassArt, [aufgabe()]), { optionen: ALLE_AUS }));
      expect(primaerKnoepfe()).toHaveLength(0);
    },
  );

  /**
   * BEI n > 1 KEIN „ANDERS ZUWEISEN" — dieselbe Regel wie bei bufdi Rang 1 darueber, und hier
   * traegt sie doppelt: §3.5 gibt beiden „Überfällig"-Zonen ausdruecklich KEIN Deckelziel, und
   * §3.1 verbietet, fuer „ueberfaellig" eine Route zu erfinden. Es gibt also keine Flaeche, die n
   * verarbeitet — ein Modal auf die erste von neun waere der Griff ins Beliebige, den §4.3
   * verbietet. Die Zone darunter fuehrt stattdessen jede Zeile einzeln (§3.2).
   */
  it("koordUeberfaelligVerteilt mit n > 1 traegt keinen Primaerknopf", async () => {
    await mount(
      karte(anlass("koordUeberfaelligVerteilt", [aufgabe(), aufgabe({ id: "a2" })]), {
        optionen: { ...ALLE_AUS, umverteilen: true },
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  /** Ohne Zielliste kein Modal — und damit kein Knopf, der in eine leere Auswahl fuehrte. */
  it("koordOhneTraeger bleibt ohne Primaerknopf, wenn keine Verteilziele durchgereicht sind", async () => {
    await mount(
      karte(anlass("koordOhneTraeger", [aufgabe()]), {
        optionen: { ...ALLE_AUS, umverteilen: true },
        verteilen: null,
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  /**
   * RANG 5b BLEIBT OHNE PRIMAERKNOPF, AUCH WENN MAN IHM `umverteilen: true` REICHT — die Belegung
   * fragt gar nicht danach. Das ist der Riegel gegen die naheliegende „Vereinfachung", 5a und 5b
   * wieder zusammenzulegen: `_lib/lebenszyklus.ts` kennt `umverteilen` ausschliesslich aus
   * `verteilt`, und die Aufspaltung von Rang 5 existiert nur deswegen (§9/S6).
   */
  it("koordUeberfaelligInArbeit bleibt ohne Primaerknopf, selbst mit umverteilen: true", async () => {
    await mount(
      karte(anlass("koordUeberfaelligInArbeit", [aufgabe({ status: "in_arbeit" })]), {
        optionen: { ...ALLE_AUS, umverteilen: true },
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  it("bufdi Rang 1 ohne erlaubte Zustandsaktion bleibt ohne Primaerknopf", async () => {
    await mount(
      karte(anlass("bufdiUeberfaellig", [aufgabe({ status: "freigabe_offen" })]), {
        optionen: ALLE_AUS,
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  it("bufdi Rang 1 mit `starten` traegt „Bearbeitung starten“ als Primaerknopf", async () => {
    await mount(
      karte(anlass("bufdiUeberfaellig", [aufgabe()]), {
        optionen: { ...ALLE_AUS, starten: true },
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(1);
    expect(primaerKnoepfe()[0]!.textContent).toContain("Bearbeitung starten");
  });

  /**
   * `nachweisHochladen` STEHT VOR `fertig` (§7 Nr. 2): `uebergang()` erlaubt `in_arbeit`×`fertig`
   * unabhaengig von der Nachweispflicht, die Ablehnung entsteht erst als Feldfehler in der Action.
   * Ohne die Umsortierung waere „Fertig melden" der Primaerknopf, waehrend der tatsaechlich noetige
   * erste Schritt gar nicht dastuende.
   */
  it("bevorzugt „Nachweis hinterlegen“ vor „Fertig melden“ und fuehrt dafuer auf /a/<id>", async () => {
    await mount(
      karte(anlass("bufdiInArbeit", [aufgabe({ status: "in_arbeit", nachweisPflicht: true })]), {
        optionen: { ...ALLE_AUS, fertig: true, nachweisHochladen: true },
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(1);
    expect(primaerKnoepfe()[0]!.textContent).toContain("Nachweis hinterlegen und fertig melden");
    expect(primaerKnoepfe()[0]!.getAttribute("href")).toBe("/a/a1");
  });

  /**
   * BEI n > 1 GREIFT DIE KARTE KEINE AUFGABE HERAUS (§4.3) — und deshalb gibt es dort nur einen
   * Primaerknopf, wo eine FLAECHE existiert, die n verarbeitet. „Ueberfaellig" ist keine Sammlung
   * (§3.1), also traegt die Karte dort keinen.
   */
  it("bufdi Rang 1 mit n > 1 traegt keinen Primaerknopf — „ueberfaellig“ ist keine Flaeche", async () => {
    await mount(
      karte(anlass("bufdiUeberfaellig", [aufgabe(), aufgabe({ id: "a2" })]), {
        optionen: { ...ALLE_AUS, starten: true },
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  /**
   * „Freigaben ansehen" HAENGT AN `darfFreigabenSehen` — ein Auftraggeber ohne Koordination
   * bekommt auf `/freigaben` 404 (`zugang.ts:534-536`), und ein Primaerknopf dorthin waere ein
   * Knopf auf eine 404-Seite.
   */
  it("bietet „Freigaben ansehen“ nur bei `darfFreigabenSehen`", async () => {
    await mount(
      karte(anlass("auftragFreigabe", [aufgabe(), aufgabe({ id: "a2" })]), {
        darfFreigabenSehen: true,
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(1);
    await unmount();

    await mount(
      karte(anlass("auftragFreigabe", [aufgabe(), aufgabe({ id: "a2" })]), {
        darfFreigabenSehen: false,
      }),
    );
    expect(primaerKnoepfe()).toHaveLength(0);
  });

  /**
   * DIE DREI PLAN-AKTIONEN HAENGEN AN `darfPlanAendern` (§4.2) — `aktionsOptionen` deckt
   * `einplanen` NICHT ab. Ohne den Aufruf bekaeme eine ausgeschiedene BuFDi die Knoepfe angeboten
   * und liefe in einen Wurf.
   */
  it("laesst „Auf heute legen“ weg, wenn `darfPlanAendern` falsch ist", async () => {
    const mitRecht = anlass("bufdiUeberfaellig", [aufgabe()]);
    await mount(karte(mitRecht, { optionen: ALLE_AUS, darfPlanAendern: true }));
    expect(query("[data-rolle='fuehrung']").textContent).toContain("Auf heute legen");
    await unmount();

    await mount(karte(mitRecht, { optionen: ALLE_AUS, darfPlanAendern: false }));
    expect(query("[data-rolle='fuehrung']").textContent).not.toContain("Auf heute legen");
  });

  /** „Routinen verwalten" folgt dem Riegel der ZIELSEITE, nicht einer gleichwertigen Bedingung. */
  it("laesst „Routinen verwalten“ weg, wenn `darfRoutinenVerwalten` falsch ist", async () => {
    await mount(karte(anlass("bufdiRuhe", []), { darfRoutinenVerwalten: false }));
    expect(query("[data-rolle='fuehrung']").textContent).not.toContain("Routinen verwalten");
  });
});

/*
 * DER QUELLTEXT-SCAN DIESER EINEN DATEI (§9/S5, §6.7, §11.1) — drei Verbote, jedes mit einer
 * Begruendung, die kein anderes Tor nachhalten kann.
 */
describe("Fuehrungskarte.tsx — der Quelltext-Scan (§9/S5, §6.7)", () => {
  const QUELLE = ohneKommentare(readFileSync("src/app/m/aufgaben/_ui/Fuehrungskarte.tsx", "utf8"));

  it("liest eine nicht-leere Datei (sonst prueft der Scan nichts)", () => {
    expect(QUELLE.trim().length).toBeGreaterThan(0);
  });

  /**
   * KEIN antd-`Card`: `.fuehrung { padding: 24px }` und `.ant-card-body` sind beide (0,1,0), antds
   * Stylesheet laedt spaeter und gewaenne durch Dokumentreihenfolge (Falle 5) — still, und weder
   * `build` noch Vitest noch der CSS-Scan saehen es.
   */
  it("benutzt kein antd-`Card`", () => {
    expect(QUELLE).not.toMatch(/\bCard\b/);
  });

  /** KEIN `Alert`: `colorError === colorPrimary === #c8000f` — Suite-Rot auf einer Datenflaeche. */
  it("benutzt kein antd-`Alert`", () => {
    expect(QUELLE).not.toMatch(/\bAlert\b/);
  });

  /**
   * KEIN `"use client"` (§6.7) — DIE ENTSCHEIDUNG, DIE STILL KIPPEN KANN. Mit ihr wuerde die Karte
   * zur Client-Komponente, `lage()` und `aktionsOptionen` zoegen `@/core/auth` ins Bundle, und die
   * Server-Aufrufer bekaemen eine Client-Referenz. Kein Tor ausser Playwright saehe das.
   */
  it("traegt kein `\"use client\"`", () => {
    expect(QUELLE).not.toMatch(/["']use client["']/);
  });

  /** KEIN Icon ueber den nackten Spezifizierer (Falle 7) — HTTP 500 beim IMPORT, nicht beim Rendern. */
  it("importiert nichts aus `@ant-design/icons`", () => {
    expect(QUELLE).not.toMatch(/@ant-design\/icons/);
  });

  /**
   * KEINE `columns[].render`-FUNKTION (Falle 9). Der Scan sucht das MUSTER, nicht das Wort
   * `Table` — eine Tabelle ohne `render` waere unbedenklich, eine `render`-Funktion aus einer
   * Server Component nie.
   */
  it("erzeugt keine `render`-Funktion fuer eine antd-Spalte", () => {
    expect(QUELLE).not.toMatch(/\brender\s*:/);
  });

  /*
   * GEGENPROBEN: ein Scan, der bei null Treffern ebenso gruen bliebe wie bei zehn, beweist nichts.
   */
  it.each([
    ['import { Card } from "antd";', /\bCard\b/],
    ['<Alert type="error" />;', /\bAlert\b/],
    ['"use client";', /["']use client["']/],
    ['import { PlusOutlined } from "@ant-design/icons";', /@ant-design\/icons/],
    ["columns={[{ render: (a) => a.titel }]}", /\brender\s*:/],
  ])("Gegenprobe: %s wuerde gefunden", (quelle, muster) => {
    expect(muster.test(quelle)).toBe(true);
  });
});
