// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  click,
  clickPortal,
  existsPortal,
  mount,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";
import s from "./aufgaben.module.css";

/*
 * `useActionState` SELBST GEMOCKT (Vorbild `EinplanenFormular.test.tsx`) — so laesst sich jeder
 * Zustand (inklusive eines Feldfehlers mit zurueckgetragenen Werten) als frischer Mount herstellen,
 * ohne eine echte Server-Action-Transition zu simulieren. `verteilenAction` ist nur ein SENTINEL:
 * dieser Test ruft sie nie auf, die eigentliche Logik ist in `actions.test.ts` bewacht.
 */
const { useActionStateMock, VERTEILEN_MARKER, UMVERTEILEN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  VERTEILEN_MARKER: Symbol("verteilenAction"),
  UMVERTEILEN_MARKER: Symbol("umverteilenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({
  verteilenAction: VERTEILEN_MARKER,
  // Seit Schritt 6 waehlt `ZUWEISUNG` die Action VOR `useActionState` — beide Schluessel werden
  // damit BEIM IMPORT gelesen, auch wenn dieser Test nur „verteilen" fuehrt.
  umverteilenAction: UMVERTEILEN_MARKER,
}));

import { UmverteilenKnopf, VerteilenKnopf } from "./VerteilenDialog";

function aufgabe(over: Partial<AufgabeRow> & Pick<AufgabeRow, "id">): AufgabeRow {
  return {
    titel: "T",
    beschreibung: "B",
    prioritaet: "mittel",
    erstellerId: "e1",
    zugewiesenAn: null,
    status: "eingegangen",
    faelligAm: "2026-08-20",
    faelligUhrzeit: null,
    dauerMinuten: 60,
    nachweisPflicht: false,
    nachweisArt: "text",
    prueferId: null,
    istSelbst: false,
    planDatum: null,
    planUhrzeit: null,
    planRang: 0,
    vorschlagDatum: null,
    vorschlagUhrzeit: null,
    erstelltAm: new Date(0),
    aktualisiertAm: new Date(0),
    ...over,
  };
}

function person(over: Partial<PersonRow> & Pick<PersonRow, "id" | "name">): PersonRow {
  return {
    sub: `dev:${over.id}@localtest.me`,
    initialen: over.name.slice(0, 2).toUpperCase(),
    rolle: "bufdi",
    sollMinutenTag: 468,
    aktivVon: "2026-01-01",
    aktivBis: null,
    erstelltAm: new Date(0),
    ...over,
  };
}

function auslastung(p: PersonRow, over: Partial<AuslastungZeile> = {}): AuslastungZeile {
  return { person: p, verplantMinuten: 0, sollMinuten: p.sollMinutenTag, ueberbucht: false, ...over };
}

const TAGE = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];

let absendenMock: ReturnType<typeof vi.fn>;
function stelleZustandEin(zustand: FormState, laeuft = false): void {
  absendenMock = vi.fn();
  useActionStateMock.mockReturnValue([zustand, absendenMock, laeuft]);
}

beforeEach(() => {
  useActionStateMock.mockReset();
  stelleZustandEin(FORM_START);
});
afterEach(async () => {
  await unmount();
});

/*
 * ══ DIE TABELLENFAELLE SIND MIT DER TABELLE ENTFALLEN (Oberflaechen-Runde 2026-08-16, zweite
 *    Haelfte). Was hier stand, prueft eine Bauform, die es nicht mehr gibt:
 *
 *      · „leerer Posteingang zeigt den ausgeschriebenen Leerzustand, keine Tabelle"
 *      · „zeigt Titel, Auftraggeber, Frist, Dauer und Nachweispflicht je Zeile"
 *      · „jede Zeile oeffnet den Dialog fuer die EIGENE Aufgabe"
 *      · „darfVerteilen=false: keine Verteilen-Aktion erscheint"
 *
 *    WOHIN JEDE EINZELNE ZUSAGE GEWANDERT IST — ausgeschrieben, damit der Wegfall nicht als
 *    Deckungsluecke durchgeht:
 *
 *      · LEERZUSTAND: `AufgabenListe`s `leerText` ist eine PFLICHT-Prop (kein `?`), und
 *        `AufgabenListe.test.tsx` prueft, dass sie bei null Zeilen als Satz erscheint;
 *        `verteilen/page.test.tsx` prueft den Satz an dieser Route.
 *      · DIE ANGABEN JE ZEILE: `AufgabenZeile.test.tsx` misst die feste Reihenfolge aus §10
 *        Prueffrage 7 fuer JEDE Flaeche des Moduls auf einmal — eine staerkere Zusage als eine
 *        Spaltenliste, die nur fuer diese eine Tabelle galt. Die Spalte „Nachweispflicht" faellt
 *        dabei bewusst fort; die Begruendung steht im Kopfkommentar von `verteilen/page.tsx`.
 *      · JE ZEILE DIE EIGENE AUFGABE: `ZuweisenInline` bekommt `aufgabe` als Prop und bildet
 *        `data-testid` und das versteckte `aufgabeId`-Feld daraus — es gibt keinen gemeinsamen
 *        Zustand mehr, in dem sich zwei Zeilen verwechseln koennten.
 *      · `darfVerteilen=false`: DER SCHALTER EXISTIERT NICHT MEHR, und das ist die staerkere
 *        Fassung. Der Riegel steht nur noch an einer Stelle — `notFound()` im Default-Export von
 *        `verteilen/page.tsx`, geprueft dort und in `e2e/aufgaben.spec.ts`s 404-Gegenprobe. Zwei
 *        Orte fuer dieselbe Frage koennen auseinanderlaufen, einer nicht.
 */
describe("VerteilenDialog — die Datei selbst", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/VerteilenDialog.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  /**
   * DIE GEGENPROBE ZUM AUSBAU: die Posteingangs-Tabelle ist fort, und zwar samt `Table`-Import.
   * Ohne diesen Riegel koennte eine spaetere Runde sie stillschweigend zurueckholen — und der
   * einzige sichtbare Unterschied waere eine Flaeche, die wieder aus der Formsprache des Moduls
   * faellt. Ein Quelltext-Scan, weil genau das kein gerendertes DOM zeigt.
   */
  it("fuehrt keine antd-`Table` mehr — der Posteingang ist eine Zeilenliste", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/VerteilenDialog.tsx", "utf8");
    expect(quelle).not.toMatch(/<Table\b/);
    expect(quelle).not.toMatch(/\bTable,|, Table\b/);
  });
});

/*
 * DER DIALOG WIRD JETZT UEBER `VerteilenKnopf` GEOEFFNET STATT UEBER EINE TABELLENZEILE — DIESELBE
 * `VerteilenModal`-INSTANZ, DERSELBE AUSLOESER-`data-testid` (`verteilen-<id>`), DIESELBEN PROPS.
 * `VerteilenKnopf` ist der Weg der FUEHRUNGSKARTE und damit heute der einzige verbliebene Aufrufer
 * des Modals fuer „verteilen"; die Faelle unten pruefen unveraendert das MODAL, nicht den Ausloeser.
 */
describe("VerteilenModal — Zielliste, Auslastung, Schliessen", () => {
  function mountMitEinerAufgabe(bufdisListe: PersonRow[], auslastungListe: AuslastungZeile[]) {
    return mount(
      <VerteilenKnopf
        aufgabe={aufgabe({ id: "a1", titel: "Nur eine", erstellerId: "malte" })}
        bufdis={bufdisListe}
        auslastung={auslastungListe}
        tage={TAGE}
      />,
    );
  }

  it("zeigt genau die uebergebenen BuFDis als Ziel — nicht mehr, nicht weniger", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    const bendix = person({ id: "bendix", name: "Bendix" });
    await mountMitEinerAufgabe([alina, bendix], [auslastung(alina), auslastung(bendix)]);

    await click("[data-testid='verteilen-a1']");

    const radios = queryPortal(".ant-modal").querySelectorAll("input[type='radio']");
    expect(radios).toHaveLength(2);
    const namen = Array.from(radios).map((r) => r.closest("label")?.textContent);
    expect(namen).toEqual(["Alina", "Bendix"]);
  });

  it("zeigt die Wochenauslastung neutral, mit „überbucht“-Text plus Kante fuer eine ueberbuchte Person", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    const bendix = person({ id: "bendix", name: "Bendix" });
    await mountMitEinerAufgabe(
      [alina, bendix],
      [
        auslastung(alina, { verplantMinuten: 200, sollMinuten: 468, ueberbucht: false }),
        auslastung(bendix, { verplantMinuten: 600, sollMinuten: 468, ueberbucht: true }),
      ],
    );

    await click("[data-testid='verteilen-a1']");

    const modal = queryPortal(".ant-modal");
    const alinaZeile = Array.from(modal.querySelectorAll("li")).find((li) =>
      li.textContent?.includes("Alina"),
    )!;
    const bendixZeile = Array.from(modal.querySelectorAll("li")).find((li) =>
      li.textContent?.includes("Bendix"),
    )!;
    expect(alinaZeile.className).not.toContain(s.budgetUeberbucht);
    expect(bendixZeile.className).toContain(s.budgetUeberbucht);
    expect(bendixZeile.textContent).toContain("überbucht");
    expect(alinaZeile.textContent).not.toContain("überbucht");
  });

  it("„Abbrechen“ schliesst den Dialog", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    await mountMitEinerAufgabe([alina], [auslastung(alina)]);

    await click("[data-testid='verteilen-a1']");
    expect(existsPortal(".ant-modal")).toBe(true);

    await clickPortal("[data-testid='verteilen-abbrechen']");
    expect(existsPortal(".ant-modal")).toBe(false);
  });

  /*
   * ══ DIE ABGELEITETE SICHTBARKEIT WIRD HIER NICHT MEHR GEPRUEFT, WEIL SIE HIER NICHT MEHR
   *    WOHNT — und das ist kein Deckungsverlust, sondern ein Umzug (Oberflaechen-Runde
   *    2026-08-16, zweite Haelfte).
   *
   *    Der Fall hiess „schliesst sich von selbst, wenn die gewaehlte Aufgabe den
   *    `posteingang`-Prop verlaesst" und mass ein Merkmal von `VerteilenTabelle`: der Dialog war
   *    offen, SOLANGE die Zeile in der Liste stand. Mit der Tabelle ist auch dieser Zustand fort —
   *    `VerteilenKnopf` und `UmverteilenKnopf` haben keine Liste, aus der etwas verschwinden
   *    koennte; ihr `offen` faellt auf `false`, weil die Karte nach dem Verteilen ohnehin neu
   *    entsteht (s. Kopfkommentar von `VerteilenKnopf`).
   *
   *    DASSELBE MUSTER — „offen, SOLANGE X gilt", statt eines zweiten Zustands — traegt heute
   *    `_ui/ZuweisenInline.tsx`, dort an `aufgabe.zugewiesenAn` statt an der Listenzugehoerigkeit.
   *    `ZuweisenInline.test.tsx` prueft es, und zwar am schaerferen Fall: eine umverteilte Aufgabe
   *    BLEIBT in ihrer Zone stehen, ein naives `useState(false)` liesse das Feld also offen.
   */

  /**
   * DIE FOLGE STEHT IM DIALOG, NICHT AUF DEM KNOPF — und dieser Test ist der Riegel dafuer, dass
   * sie nicht bei nachster Gelegenheit BEIDE Orte verlaesst.
   *
   * VORGESCHICHTE (Bildstrecken-Runde): Spec §1.3/§7 Nr. 3 legte die Beschriftung „Anders zuweisen
   * (der Zeitplan wird dabei geleert)" fest, WEIL `_lib/lebenszyklus.ts` die Zeile mit
   * `planLoeschen: true` fuehrt. Gemessen an echten Bildern war der Knopf der falsche Ort: in der
   * Zone „Überfällig, noch nicht begonnen" steht er JE ZEILE, und vier 44-Zeichen-Knoepfe brachen
   * bei 1280px unterschiedlich um. Der Dialog steht auf jedem der drei Wege (Karte, Zone,
   * `/a/<id>`) davor — die Aktion ist ohne ihn nicht ausloesbar —, also traegt er den Satz.
   *
   * DREI ZUSAGEN, EINZELN GEPRUEFT, weil je zwei davon gruen bleiben koennten, waehrend die dritte
   * bricht: kurzer Knopf · Folge im Dialog · „Verteilen" nennt KEINE Folge (dort gibt es keine —
   * eine Aufgabe im Posteingang hat noch keinen Zeitplan, und ein geliehener Satz waere schlicht
   * falsch).
   */
  it("beschriftet „Anders zuweisen“ kurz — die Folge steht NICHT mehr auf dem Knopf", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    await mount(
      <UmverteilenKnopf
        aufgabe={aufgabe({ id: "a1", titel: "Nur eine", status: "verteilt" })}
        bufdis={[alina]}
        auslastung={[auslastung(alina)]}
        tage={TAGE}
      />,
    );
    const knopf = queryAll("[data-testid='umverteilen-a1']")[0]!;
    expect(knopf.textContent).toBe("Anders zuweisen");
    expect(knopf.textContent).not.toContain("Zeitplan");
  });

  it("nennt die Folge im geoeffneten Dialog", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    await mount(
      <UmverteilenKnopf
        aufgabe={aufgabe({ id: "a1", titel: "Nur eine", status: "verteilt" })}
        bufdis={[alina]}
        auslastung={[auslastung(alina)]}
        tage={TAGE}
      />,
    );
    await click("[data-testid='umverteilen-a1']");
    expect(queryPortal(".ant-modal").textContent).toContain(
      "Der bisher eingeplante Tag dieser Aufgabe wird dabei geleert.",
    );
  });

  it("„Verteilen“ nennt keine Folge — eine Aufgabe im Posteingang hat keinen Zeitplan", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    await mount(
      <VerteilenKnopf
        aufgabe={aufgabe({ id: "a1", titel: "Nur eine", erstellerId: "malte" })}
        bufdis={[alina]}
        auslastung={[auslastung(alina)]}
        tage={TAGE}
      />,
    );
    await click("[data-testid='verteilen-a1']");
    expect(queryPortal(".ant-modal").textContent).not.toContain("geleert");
  });

  it("zeigt einen Feldfehler am Zielfeld, wenn useActionState ihn liefert", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { zielId: "Zielperson nicht gefunden, nicht aktiv oder kein BuFDi." },
      values: { aufgabeId: "a1", zielId: "", vorschlagDatum: "", vorschlagUhrzeit: "" },
    });
    const alina = person({ id: "alina", name: "Alina" });
    await mountMitEinerAufgabe([alina], [auslastung(alina)]);

    await click("[data-testid='verteilen-a1']");

    expect(queryPortal(".ant-modal").textContent).toContain(
      "Zielperson nicht gefunden, nicht aktiv oder kein BuFDi.",
    );
  });
});
