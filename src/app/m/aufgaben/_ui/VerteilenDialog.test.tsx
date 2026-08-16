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
  rerender,
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

import { UmverteilenKnopf, VerteilenTabelle } from "./VerteilenDialog";

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

describe("VerteilenTabelle — Zeile 1 und Leerzustand", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/VerteilenDialog.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("leerer Posteingang zeigt den ausgeschriebenen Leerzustand, keine Tabelle", async () => {
    await mount(
      <VerteilenTabelle
        posteingang={[]}
        erstellerNamen={{}}
        bufdis={[]}
        auslastung={[]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
      />,
    );
    expect(document.body.textContent).toContain("Posteingang leer — alles verteilt");
    expect(queryAll("table")).toHaveLength(0);
  });
});

describe("VerteilenTabelle — Spalten, ZWEI Zeilen (Lehre 2 dieser Aufgabenreihe)", () => {
  it("zeigt Titel, Auftraggeber, Frist (mit Ueberfaellig-Markierung), Dauer und Nachweispflicht je Zeile", async () => {
    const posteingang = [
      aufgabe({
        id: "a1", titel: "Erste", erstellerId: "malte", faelligAm: "2026-08-10",
        dauerMinuten: 30, nachweisPflicht: false,
      }),
      aufgabe({
        id: "a2", titel: "Zweite", erstellerId: "tomke", faelligAm: "2026-08-20",
        dauerMinuten: 90, nachweisPflicht: true,
      }),
    ];
    await mount(
      <VerteilenTabelle
        posteingang={posteingang}
        erstellerNamen={{ malte: "Malte", tomke: "Tomke" }}
        bufdis={[]}
        auslastung={[]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
      />,
    );
    const zeilen = queryAll("tbody tr[data-row-key]");
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]!.textContent).toContain("Erste");
    expect(zeilen[0]!.textContent).toContain("Malte");
    // DIE VEREINHEITLICHTE FORM (Oberflaechen-Spec §6.2, §11.1): vorher klebte hier ein
    // kleingeschriebenes „ · überfällig" hinter dem Datum. `_ui/Frist.tsx` schreibt das Wort gross
    // UND MIT DER ZAHL — ein nacktes „überfällig" sagt nicht, ob es gestern oder im Mai war.
    expect(zeilen[0]!.textContent).toContain("Überfällig seit 3 Tagen");
    expect(zeilen[0]!.textContent).not.toContain("Zweite");
    expect(zeilen[1]!.textContent).toContain("Zweite");
    expect(zeilen[1]!.textContent).toContain("Tomke");
    expect(zeilen[1]!.textContent).not.toContain("Überfällig");
    expect(zeilen[1]!.textContent).toContain("Ja");
  });

  it("jede Zeile oeffnet den Dialog fuer die EIGENE Aufgabe, nicht die einer anderen Zeile", async () => {
    const posteingang = [
      aufgabe({ id: "a1", titel: "Erste", erstellerId: "malte" }),
      aufgabe({ id: "a2", titel: "Zweite", erstellerId: "malte" }),
    ];
    await mount(
      <VerteilenTabelle
        posteingang={posteingang}
        erstellerNamen={{ malte: "Malte" }}
        bufdis={[person({ id: "alina", name: "Alina" })]}
        auslastung={[]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
      />,
    );
    expect(queryAll("[data-testid^='verteilen-a']")).toHaveLength(2);

    await click("[data-testid='verteilen-a2']");

    expect(existsPortal(".ant-modal")).toBe(true);
    const versteckteId = queryPortal<HTMLInputElement>("input[name='aufgabeId']");
    expect(versteckteId.value).toBe("a2");
  });

  it("darfVerteilen=false: keine „Verteilen“-Aktion erscheint", async () => {
    const posteingang = [aufgabe({ id: "a1", titel: "Erste", erstellerId: "malte" })];
    await mount(
      <VerteilenTabelle
        posteingang={posteingang}
        erstellerNamen={{ malte: "Malte" }}
        bufdis={[]}
        auslastung={[]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen={false}
      />,
    );
    expect(queryAll("[data-testid='verteilen-a1']")).toHaveLength(0);
  });
});

describe("VerteilenTabelle — der Dialog: Zielliste, Auslastung, Schliessen", () => {
  function mountMitEinerAufgabe(bufdisListe: PersonRow[], auslastungListe: AuslastungZeile[]) {
    return mount(
      <VerteilenTabelle
        posteingang={[aufgabe({ id: "a1", titel: "Nur eine", erstellerId: "malte" })]}
        erstellerNamen={{ malte: "Malte" }}
        bufdis={bufdisListe}
        auslastung={auslastungListe}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
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

  /**
   * DIE ABGELEITETE SICHTBARKEIT (Bericht: „kein Effekt, kein Zeitpunkt-Tracking noetig"):
   * verlaesst die gewaehlte Aufgabe den `posteingang`-Prop (so wie nach einer erfolgreichen
   * `verteilenAction`, die revalidiert), schliesst sich der Dialog von selbst — ohne einen Klick auf
   * „Abbrechen" und ohne dass `useActionState`s Zustand sich je aendert (er bleibt in diesem Test
   * durchgehend `FORM_START`).
   */
  it("schliesst sich von selbst, wenn die gewaehlte Aufgabe den posteingang-Prop verlaesst", async () => {
    const alina = person({ id: "alina", name: "Alina" });
    const nurEine = aufgabe({ id: "a1", titel: "Nur eine", erstellerId: "malte" });
    await mount(
      <VerteilenTabelle
        posteingang={[nurEine]}
        erstellerNamen={{ malte: "Malte" }}
        bufdis={[alina]}
        auslastung={[auslastung(alina)]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
      />,
    );
    await click("[data-testid='verteilen-a1']");
    expect(existsPortal(".ant-modal")).toBe(true);

    await rerender(
      <VerteilenTabelle
        posteingang={[]}
        erstellerNamen={{ malte: "Malte" }}
        bufdis={[alina]}
        auslastung={[auslastung(alina)]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
      />,
    );
    expect(existsPortal(".ant-modal")).toBe(false);
  });

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
      <VerteilenTabelle
        posteingang={[aufgabe({ id: "a1", titel: "Nur eine", erstellerId: "malte" })]}
        erstellerNamen={{ malte: "Malte" }}
        bufdis={[alina]}
        auslastung={[auslastung(alina)]}
        tage={TAGE}
        heute="2026-08-13"
        darfVerteilen
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
