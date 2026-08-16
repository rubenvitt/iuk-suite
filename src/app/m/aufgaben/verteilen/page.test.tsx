// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, mount, query, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { aufgaben, personen, type PersonRow, type Rolle } from "../_db/schema";
import type { Akteur } from "../_lib/zugang";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
let mockDb: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => mockDb.db }));

import VerteilenPage, { verteilenInhalt } from "./page";
import s from "../_ui/aufgaben.module.css";

let t: TestDb;
beforeEach(() => {
  t = migrierteTestDb();
  mockDb = t;
  sitzung = null;
});
afterEach(async () => {
  await unmount();
  t.schliessen();
});

const HEUTE = "2026-08-13";

function legePerson(sub: string, rolle: Rolle, extra: Partial<PersonRow> = {}): PersonRow {
  return t.db
    .insert(personen)
    .values({
      sub,
      name: extra.name ?? sub,
      initialen: extra.initialen ?? sub.slice(0, 2).toUpperCase(),
      rolle,
      aktivVon: extra.aktivVon ?? "2026-01-01",
      aktivBis: extra.aktivBis ?? null,
    })
    .returning()
    .get();
}

function legeAufgabe(extra: Partial<typeof aufgaben.$inferInsert> & { erstellerId: string }) {
  return t.db
    .insert(aufgaben)
    .values({
      titel: "T",
      beschreibung: "B",
      prioritaet: "mittel",
      status: "eingegangen",
      faelligAm: "2026-08-20",
      dauerMinuten: 60,
      ...extra,
    })
    .returning()
    .get();
}

/**
 * ANMELDEN — DIE SITZUNG STELLT DIE KOORDINATIONSGRUPPE, SEIT DIE ZEILE SIE NICHT MEHR TRAEGT
 * (Quellenwechsel 2026-08-15): `istKoordination` kommt aus `canAdminModule("aufgaben")`
 * (`_lib/zugang.ts`s `akteurFuer`), nicht mehr aus `personen.rolle`. Damit jede bestehende Zusage
 * dieser Datei DIESELBE bleibt, bekommt eine koordinierende Person hier genau die Gruppe, die ihre
 * Rolle bisher bedeutet hat — die FIXTUR wandert mit der Quelle, die ERWARTUNG bleibt stehen.
 *
 * SEIT `ROLLEN = ["auftrag", "bufdi"]` MUSS DER AUFRUFER ES SAGEN: aus der Zeile ist es nicht mehr
 * ableitbar. `iuk-aufgaben-koordination` ist der Registry-Vorgabewert (`core/registry.ts`);
 * `SUITE_ADMIN_GROUP_AUFGABEN` ist in der Testumgebung nicht gesetzt.
 */
function anmelden(p: PersonRow, koordiniert = false): void {
  sitzung = {
    user: { id: p.sub, groups: koordiniert ? ["iuk-aufgaben-koordination"] : [] },
  };
}

/**
 * DER AKTEUR IST SEIT DER VIERTEN OBERFLAECHEN-RUNDE (2026-08-16) EIN PARAMETER VON
 * `verteilenInhalt` — er beantwortet dort GENAU EINE Frage: darf eine Karte des Bretts in eine
 * andere Personenspalte wandern (`aktionsOptionen(...).umverteilen`)? Er ist NICHT der Riegel; der
 * steht unveraendert im Default-Export und wird in dieser Datei weiter ueber `VerteilenPage`
 * geprueft.
 *
 * DIE FIXTUR BAUT IHN DIREKT, statt `akteurFuer` zu bemuehen: `Akteur` ist ein reines Datenpaar
 * (`{ person, istKoordination }`), und die Inhaltsfunktion loest keine Sitzung auf. `verteilenInhalt`
 * darf ohne Sitzung aufrufbar bleiben — das ist die Eigenschaft, derentwegen es sie gibt.
 */
function alsKoordination(p: PersonRow): Akteur {
  return { person: p, istKoordination: true };
}

/** Die drei Argumente, die jeder Aufruf in dieser Datei teilt — die Ansicht kommt je Test dazu. */
function inhalt(akteur: Akteur, ansicht?: string) {
  return verteilenInhalt(t.db, HEUTE, akteur, ansicht);
}

describe("verteilenInhalt — Kopf und Leerzustand", () => {
  it("zeigt den Titel „Verteilen“ und den Leerzustand ohne Posteingang", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    await mount(inhalt(alsKoordination(rike)));
    expect(query("h1").textContent).toBe("Verteilen");
    expect(document.body.textContent).toContain("Posteingang leer — alles verteilt");
  });

  it("nennt die Anzahl in der Kontextzeile, wenn der Posteingang nicht leer ist", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    await mount(inhalt(alsKoordination(malte)));
    expect(document.body.textContent).toContain("2 Aufgaben zu verteilen");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DIE ZWEITE SICHT (Nachtrag „mehr Diversitaet im UI/UX", vierte Oberflaechen-Runde 2026-08-16).
 *
 * WAS DIESE DATEI PRUEFEN KANN UND WAS NICHT, ausdruecklich: sie prueft, WELCHE SICHT AUS WELCHEM
 * PARAMETER FOLGT und dass die Brett-Spalten aus derselben Quelle kommen wie die Zielliste. Sie
 * kann NICHT pruefen, dass die Wahl einen Neuladen ueberlebt (das ist eine Frage an die Adresse und
 * den Browser, nicht an eine Funktion) und nicht, dass das Brett auf 360px stapelt (jsdom wertet
 * keine Medienabfrage aus). Beides steht in `e2e/aufgaben.spec.ts`, und nur zusammen sind die zwei
 * die Zusicherung.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
describe("verteilenInhalt — die Ansichtswahl (`?ansicht=`)", () => {
  const brettDa = (): boolean => document.querySelector("[data-rolle='brett']") !== null;
  const listeDa = (): boolean => document.querySelector(`.${s.zeilenListe}`) !== null;

  it("ohne Parameter: die Liste — `/verteilen` ist woertlich die Seite, die sie vorher war", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    await mount(inhalt(alsKoordination(malte)));
    expect(listeDa()).toBe(true);
    expect(brettDa()).toBe(false);
  });

  it("`?ansicht=brett`: das Brett, und NUR das Brett — es rendert immer genau eine Sicht", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    await mount(inhalt(alsKoordination(malte), "brett"));
    expect(brettDa()).toBe(true);
    expect(listeDa()).toBe(false);
  });

  /**
   * EIN UNBEKANNTER WERT FAELLT STILL AUF DIE LISTE ZURUECK — kein Wurf, keine Meldung. Dieselbe
   * Lehre wie `/archiv`s `alsPrioritaetsFilter` und `_lib/datum.ts`s `montagAusParam`: „ein
   * URL-Parameter ist kein Formularfeld, das eine Ablehnung verdient". Eine 404 fuer
   * `?ansicht=kalender` machte aus einem Tippfehler in der Adresszeile eine kaputte Seite.
   */
  it("`?ansicht=kalender` ist kein Fehler, sondern die Liste", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });
    await mount(inhalt(alsKoordination(malte), "kalender"));
    expect(listeDa()).toBe(true);
    expect(brettDa()).toBe(false);
  });

  it("die Leiste zeigt beide Sichten und zeichnet genau die gewaehlte mit `aria-current` aus", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    await mount(inhalt(alsKoordination(malte), "brett"));
    const optionen = [...document.querySelectorAll("[data-rolle='ansichtwahl'] a")];
    expect(optionen.map((el) => el.textContent)).toEqual(["Liste", "Brett"]);
    expect(optionen.filter((el) => el.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(
      optionen.find((el) => el.getAttribute("aria-current") === "page")?.getAttribute("data-ansicht"),
    ).toBe("brett");
  });

  /**
   * DER LEERZUSTAND IST IN BEIDEN SICHTEN WORTGLEICH (Spec §9.8) — zwei Sichten auf dieselben Daten
   * duerfen fuer denselben Bestand nicht zwei verschiedene Saetze sagen. Sonst waere „leer" je nach
   * Sicht eine andere Auskunft, und niemand saehe es: der Satz steht in zwei verschiedenen Dateien.
   */
  it("sagt den Leersatz des Posteingangs in BEIDEN Sichten woertlich gleich", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    await mount(inhalt(alsKoordination(rike), "brett"));
    expect(document.body.textContent).toContain("Posteingang leer — alles verteilt");
  });
});

/**
 * DIE SPALTEN DES BRETTS SIND DIE ZIELLISTE — UND DAS IST HIER SCHAERFER ALS IN DER LISTENSICHT
 * (§11.3, `bufdis()`-Riegel).
 *
 * IN DER LISTE waere eine falsche Quelle ein falscher Name im aufgeklappten Zielfeld. AUF DEM BRETT
 * ist sie eine SICHTBARE SPALTE — die Koordination stuende in ihrer eigenen, und eine ausgeschiedene
 * BuFDi bekaeme eine, obwohl sie kein Verteilziel mehr ist. Die Fixtur traegt deshalb bewusst zwei
 * `auftrag`-Zeilen UND eine ausgeschiedene BuFDi: „Rike fehlt" allein bewiese wenig, erst „genau die
 * aktiven BuFDi-Namen, nicht mehr" bindet die echte Quelle.
 */
describe("verteilenInhalt — das Brett: eine Spalte je Zielperson, keine mehr", () => {
  const spaltenKoepfe = (): string[] =>
    [...document.querySelectorAll("[data-rolle='brett'] [data-person] h3")].map(
      (el) => el.textContent ?? "",
    );

  it("gibt genau den aktiven BuFDis eine Spalte — nicht der Koordination, nicht `auftrag`", async () => {
    legePerson("dev:rike@test", "auftrag", { name: "Rike" });
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legePerson("dev:bendix@test", "bufdi", { name: "Bendix" });
    legePerson("dev:doerte@test", "bufdi", { name: "Dörte", aktivBis: "2026-08-12" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    await mount(inhalt(alsKoordination(malte), "brett"));

    expect(spaltenKoepfe().sort()).toEqual(["Alina", "Bendix"].sort());
    expect(spaltenKoepfe()).not.toContain("Rike");
    expect(spaltenKoepfe()).not.toContain("Malte");
    expect(spaltenKoepfe()).not.toContain("Dörte");
  });

  /**
   * DER STAPEL IST EINE EIGENE SPALTE UND KEINE PERSONENSPALTE — sonst zaehlte der Riegel darueber
   * ihn mit, und eine vierte Spalte „Posteingang" saehe aus wie eine vierte Person.
   */
  it("fuehrt den Posteingang als eigene, nicht personengebundene Spalte", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen", titel: "Kästen prüfen" });

    await mount(inhalt(alsKoordination(malte), "brett"));

    const stapel = document.querySelector("[data-brett-spalte='posteingang']");
    expect(stapel).not.toBeNull();
    expect(stapel!.getAttribute("data-person")).toBeNull();
    expect(stapel!.textContent).toContain("Kästen prüfen");
    expect(stapel!.textContent).toContain("1 zu verteilen");
  });

  /**
   * DIE KARTE TRAEGT DIESELBEN ANGABEN IN DERSELBEN REIHENFOLGE WIE DIE ZEILE (§10 Prueffrage 7).
   * Waeren es andere Felder oder eine andere Folge, waeren es zwei Sichten auf VERSCHIEDENE Daten,
   * und die Umschaltung waere eine Behauptung.
   */
  it("zeigt auf der Karte Titel · Zustand · Prioritaet · Frist · Dauer · Auftraggeber, in dieser Folge", async () => {
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({
      erstellerId: malte.id,
      status: "eingegangen",
      titel: "Kästen prüfen",
      prioritaet: "hoch",
      faelligAm: "2026-08-20",
      dauerMinuten: 90,
    });

    await mount(inhalt(alsKoordination(malte), "brett"));

    const text = document.querySelector("[data-brett-spalte='posteingang'] li")!.textContent ?? "";
    const folge = ["Kästen prüfen", "Zu verteilen", "Hoch", "Frist", "1,5 Std.", "Von Malte"];
    let letzte = -1;
    for (const teil of folge) {
      const gefunden = text.indexOf(teil);
      expect(gefunden, `„${teil}“ fehlt in der Karte: „${text}“`).toBeGreaterThanOrEqual(0);
      expect(gefunden, `„${teil}“ steht nicht nach „${folge[folge.indexOf(teil) - 1]}“`).toBeGreaterThan(letzte);
      letzte = gefunden;
    }
  });

  /**
   * EINE PERSONENSPALTE ZEIGT DIE NOCH OFFENEN AUFGABEN IHRER PERSON — und NICHT die
   * abgeschlossenen. `nochOffen` (`_lib/anzeige.ts`) ist die eine Stelle, die das entscheidet; hier
   * steht die Gegenprobe, dass die Spalte sie tatsaechlich benutzt.
   */
  it("zeigt in der Personenspalte offene Aufgaben und laesst abgeschlossene weg", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    legeAufgabe({
      erstellerId: malte.id,
      status: "verteilt",
      zugewiesenAn: alina.id,
      titel: "Läuft noch",
    });
    legeAufgabe({
      erstellerId: malte.id,
      status: "abgeschlossen",
      zugewiesenAn: alina.id,
      titel: "Längst erledigt",
    });

    await mount(inhalt(alsKoordination(malte), "brett"));

    const spalte = document.querySelector(`[data-person="${alina.id}"]`)!;
    expect(spalte.textContent).toContain("Läuft noch");
    expect(spalte.textContent).not.toContain("Längst erledigt");
    expect(spalte.textContent).toContain("1 offen");
  });

  /**
   * DER KOPF NENNT SEINEN ZEITRAUM. Die Stunden sind die der WOCHE, die Karten sind die OFFENEN —
   * ohne die zwei Woerter behauptete der Kopf zweimal dasselbe mit zwei verschiedenen Zahlen, und
   * wer nachzaehlt, faende einen Fehler, der keiner ist.
   */
  it("beschriftet die Wochenstunden mit „diese Woche“ und die Kartenzahl mit „offen“", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    await mount(inhalt(alsKoordination(malte), "brett"));
    const spalte = document.querySelector("[data-rolle='brett'] [data-person]")!;
    expect(spalte.textContent).toContain("Std.");
    expect(spalte.textContent).toContain("diese Woche");
    expect(spalte.textContent).toContain("0 offen");
  });

  /**
   * DIE KARTE EINER `verteilt`-AUFGABE TRAEGT DEN WEG IN EINE ANDERE SPALTE, die einer
   * `in_arbeit`-Aufgabe NICHT — die Bedingung ist `aktionsOptionen(...).umverteilen`, also die
   * Uebergangstabelle, nicht eine zweite Statusabfrage im Brett. BEIDE FAELLE IN EINEM TEST, damit
   * ein Fehler in beide Richtungen sichtbar wuerde.
   */
  it("bietet „Zuweisen“ nur, wo die Uebergangstabelle `umverteilen` erlaubt", async () => {
    const rike = legePerson("dev:rike@test", "auftrag", { name: "Rike" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const verteilt = legeAufgabe({
      erstellerId: rike.id,
      status: "verteilt",
      zugewiesenAn: alina.id,
      titel: "Verteilt",
    });
    const inArbeit = legeAufgabe({
      erstellerId: rike.id,
      status: "in_arbeit",
      zugewiesenAn: alina.id,
      titel: "In Arbeit",
    });

    await mount(inhalt(alsKoordination(rike), "brett"));

    expect(document.querySelector(`[data-testid="zuweisen-${verteilt.id}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-testid="zuweisen-${inArbeit.id}"]`)).toBeNull();
  });
});

/**
 * DIE ZIELLISTE KOMMT AUS `bufdis()`, NICHT AUS `aktivePersonen()` (Brief: „die dritte Linie eines
 * Riegels, nicht die erste") — GEPRUEFT AUF DER VOLLSTAENDIGEN SEITE, nicht nur an der Komponente:
 * die Komponente rendert nur, was ihr Prop liefert, die Aussage "woher kommt dieser Prop" liegt in
 * DIESER Datei (`verteilenInhalt`). Die Fixtur traegt bewusst ZWEI `auftrag`-Zeilen zusaetzlich zu
 * den BuFDis (Rike koordiniert, Malte nicht) — „Rike fehlt" allein bewiese wenig; erst „genau die
 * zwei BuFDi-Namen, nicht mehr" bindet die echte Quelle. Seit dem Quellenwechsel (2026-08-15) gibt
 * es den frueher denkbaren schwaecheren Filter `rolle !== "koordination"` ohnehin nicht mehr: die
 * Koordination ist der Zeile nicht anzusehen, `bufdis()` ist der einzige Weg, sie herauszuhalten.
 */
describe("verteilenInhalt — die Zielliste des Zeilenwegs", () => {
  /*
   * DIE ZIELE SIND SEIT DER ZWEITEN OBERFLAECHEN-RUNDE KNOEPFE, KEINE RADIOFELDER (2026-08-16):
   * `/verteilen` fuehrt die Zuweisung als Zeilenweg (`_ui/ZuweisenInline.tsx`, art `verteilen`),
   * und dort IST der Klick auf den Namen das Absenden — ein `<button type="submit" name="zielId">`
   * statt eines Radiofelds plus Absendeknopf. Der Inhalt haengt im Portal (antds `Popover`), wie
   * der Modalinhalt vorher auch.
   *
   * DIE ZUSAGE DIESES BLOCKS IST UNVERAENDERT UND SIE IST DIE WICHTIGE: die Zielliste kommt aus
   * `bufdis()`, nicht aus `aktivePersonen()` (§11.3). Nur der Griff, mit dem der Test sie liest,
   * folgt der neuen Bauform.
   *
   * `.zuweisenName` UND NICHT `button.textContent`: der Knopf traegt NAME UND AUSLASTUNG
   * („Alina" + „6 / 39 Std."). Ein Vergleich gegen den ganzen Textinhalt wuerde bei jeder
   * Aenderung der Auslastungszahlen rot, ohne dass sich an der Zielliste etwas geaendert haette.
   */
  const zielNamen = (): string[] =>
    [...queryPortal("form").querySelectorAll(`.${s.zuweisenName}`)].map(
      (el) => el.textContent ?? "",
    );

  it("enthaelt genau die aktiven BuFDis — nicht die Koordination, nicht auftrag", async () => {
    legePerson("dev:rike@test", "auftrag", { name: "Rike" });
    const malte = legePerson("dev:malte@test", "auftrag", { name: "Malte" });
    const alina = legePerson("dev:alina@test", "bufdi", { name: "Alina" });
    const bendix = legePerson("dev:bendix@test", "bufdi", { name: "Bendix" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    await mount(inhalt(alsKoordination(malte)));
    await click("[data-testid^='verteilen-']");

    const namen = zielNamen();
    expect(namen.sort()).toEqual(["Alina", "Bendix"].sort());
    expect(namen).not.toContain("Rike");
    expect(namen).not.toContain("Malte");
    expect(alina.rolle).toBe("bufdi");
    expect(bendix.rolle).toBe("bufdi");
  });

  /**
   * `aktivBis` SCHLIESST EIN (Spec §4, Brief) — eine BuFDi, deren letzter Diensttag GENAU heute ist,
   * gehoert noch in die Zielliste; eine, deren letzter Diensttag GESTERN war, nicht mehr. Beide
   * Grenzfaelle in EINEM Test, damit ein Off-by-one in beide Richtungen sichtbar wuerde.
   */
  it("aktivBis === heute ist noch in der Liste, aktivBis === gestern nicht mehr", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    legePerson("dev:carla@test", "bufdi", { name: "Carla", aktivBis: HEUTE });
    legePerson("dev:doerte@test", "bufdi", { name: "Dörte", aktivBis: "2026-08-12" });
    legeAufgabe({ erstellerId: malte.id, status: "eingegangen" });

    await mount(inhalt(alsKoordination(malte)));
    await click("[data-testid^='verteilen-']");

    const namen = zielNamen();
    expect(namen).toContain("Carla");
    expect(namen).not.toContain("Dörte");
  });
});

/*
 * DER DEFAULT-EXPORT — DAS ROLLEN-GATE (Spec §8.3, Brief: "/verteilen antwortet einer
 * auftrag-Person mit 404, und der Weg dorthin existiert in ihrer Oberflaeche nicht. Beides prueft
 * dasselbe Praedikat aus derselben Quelle.").
 */
describe("VerteilenPage — Rollen-Gate (Spec §8.3: '/verteilen' nur fuer die Koordination)", () => {
  it("die Koordination: die Seite antwortet normal", async () => {
    const rike = legePerson("dev:rike@test", "auftrag");
    anmelden(rike, true);
    await mount(await VerteilenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Verteilen");
  });

  it("auftrag: notFound() — die Antwort auf 'Jönne und Schulle pfuschen immer wieder rein'", async () => {
    const malte = legePerson("dev:malte@test", "auftrag");
    anmelden(malte);
    await expect(VerteilenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("bufdi: ebenfalls notFound()", async () => {
    const alina = legePerson("dev:alina@test", "bufdi");
    anmelden(alina);
    await expect(VerteilenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  /*
   * VERHALTENSAENDERUNG VOM 2026-08-15 (Entwurf §5) — DIESER FALL ERWARTETE FRUEHER `notFound()`:
   * `darfVerteilen` misst die Koordination nicht mehr an `aktivBis`, weil ihre Rolle aus der
   * Pocket-ID-Gruppe kommt. Damit verschwindet auch die Ungleichheit, die `personen/page.tsx` bis
   * hierhin ausgeschrieben hat (dort kam sie ueber den Notausgang schon hinein, hier nicht).
   */
  it("eine ausgeschiedene Koordination kommt weiterhin hinein — die Gruppe traegt die Rolle", async () => {
    const exRike = legePerson("dev:ex-rike@test", "auftrag", { aktivBis: "2020-01-01" });
    anmelden(exRike, true);
    await mount(await VerteilenPage({ searchParams: Promise.resolve({}) }));
    expect(query("h1").textContent).toBe("Verteilen");
  });

  it("dieselbe ausgeschiedene Zeile OHNE Gruppe bekommt notFound()", async () => {
    const exMalte = legePerson("dev:ex-malte@test", "auftrag", { aktivBis: "2020-01-01" });
    anmelden(exMalte);
    await expect(VerteilenPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Sitzung ohne personen-Zeile: die Erklaerseite (200), kein notFound()", async () => {
    sitzung = { user: { id: "dev:unbekannt@test" } };
    const element = await VerteilenPage({ searchParams: Promise.resolve({}) });
    await mount(element);
    expect(document.body.textContent).toContain("Du bist noch nicht im Modul eingetragen.");
  });
});
