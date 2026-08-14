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
import type { FreigabeZeile } from "../_db/queries";
import type { AufgabeRow, NachweisRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * ZWEI MOCKS, DIESELBE FORM WIE `VerteilenDialog.test.tsx`/`PersonenTabelle.test.tsx`:
 * `useActionState` gemockt (fuer den Zurueckweisen-Dialog — jeder Zustand als frischer Mount), und
 * `../actions` auf zwei SENTINELS statt der echten Datei (sonst zoege der jsdom-Lauf
 * `better-sqlite3`/`next/cache` ueber die echte `actions.ts` herein — s. `PersonenTabelle.test.tsx`s
 * Kopfkommentar). `freigebenAction` wird in diesen Tests nie ausgefuehrt (dasselbe Prinzip wie
 * `RoutinenTabelle.test.tsx`s Ruhen-Formular: geprueft wird die TRAEGT-DIE-RICHTIGE-ID-Zusage, nicht
 * die Server-Action selbst — die ist in `actions.test.ts` bewacht).
 */
const { useActionStateMock, ZURUECKWEISEN_MARKER, FREIGEBEN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  ZURUECKWEISEN_MARKER: Symbol("zurueckweisenAction"),
  FREIGEBEN_MARKER: Symbol("freigebenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({
  freigebenAction: FREIGEBEN_MARKER,
  zurueckweisenAction: ZURUECKWEISEN_MARKER,
}));

import { FreigabeZone } from "./FreigabeZone";

function aufgabe(over: Partial<AufgabeRow> & Pick<AufgabeRow, "id">): AufgabeRow {
  return {
    titel: "T",
    beschreibung: "B",
    prioritaet: "mittel",
    erstellerId: "e1",
    zugewiesenAn: "z1",
    status: "freigabe_offen",
    faelligAm: "2026-08-20",
    faelligUhrzeit: null,
    dauerMinuten: 60,
    nachweisPflicht: false,
    nachweisArt: "text",
    prueferId: "p1",
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

function nachweis(over: Partial<NachweisRow> & Pick<NachweisRow, "id" | "aufgabeId">): NachweisRow {
  return {
    art: "text",
    text: "N",
    dateiId: null,
    erstelltVon: "z1",
    erstelltAm: new Date(0),
    ...over,
  };
}

function zeile(over: Partial<FreigabeZeile> & { aufgabe: AufgabeRow }): FreigabeZeile {
  return { erstellerName: "Ersteller", zugewiesenName: "Zugewiesen", nachweise: [], ...over };
}

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

describe("FreigabeZone — Zeile 1 und Leerzustaende", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/FreigabeZone.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("leere Listen zeigen je ihren eigenen ausgeschriebenen Satz (Spec §9.8)", async () => {
    await mount(<FreigabeZone meine={[]} vertretung={[]} heute="2026-08-13" />);
    expect(document.body.textContent).toContain("Keine Freigabe offen");
    expect(document.body.textContent).toContain("Keine Freigabe in Vertretung offen");
  });
});

describe("FreigabeZone — ZWEI Zeilen je Liste (Lehre 5 dieser Aufgabenreihe)", () => {
  it("zeigt Titel, Zustand, Prioritaet, Ersteller/Zugewiesen je Zeile GETRENNT", async () => {
    const meine = [
      zeile({
        aufgabe: aufgabe({ id: "a1", titel: "Erste", prioritaet: "hoch" }),
        erstellerName: "Malte",
        zugewiesenName: "Alina",
      }),
      zeile({
        aufgabe: aufgabe({ id: "a2", titel: "Zweite", prioritaet: "niedrig" }),
        erstellerName: "Tomke",
        zugewiesenName: "Carla",
      }),
    ];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);

    const karten = queryAll("li").filter((li) => li.querySelector("[data-testid^='freigeben-']"));
    expect(karten).toHaveLength(2);
    expect(karten[0]!.textContent).toContain("Erste");
    expect(karten[0]!.textContent).toContain("Malte");
    expect(karten[0]!.textContent).toContain("Alina");
    expect(karten[0]!.textContent).not.toContain("Zweite");
    expect(karten[1]!.textContent).toContain("Zweite");
    expect(karten[1]!.textContent).toContain("Tomke");
    expect(karten[1]!.textContent).toContain("Carla");
  });

  it("das Freigeben-Formular UND der Zurueckweisen-Knopf tragen je Zeile die EIGENE aufgabe.id", async () => {
    const meine = [
      zeile({ aufgabe: aufgabe({ id: "a1", titel: "Erste" }) }),
      zeile({ aufgabe: aufgabe({ id: "a2", titel: "Zweite" }) }),
    ];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);

    const ids = queryAll<HTMLInputElement>("input[name='aufgabeId']").map((i) => i.value);
    expect(ids).toEqual(["a1", "a2"]);
    expect(queryAll("[data-testid='freigeben-a1']")).toHaveLength(1);
    expect(queryAll("[data-testid='freigeben-a2']")).toHaveLength(1);
  });

  it("zeigt den Nachweis je Zeile, oder „Kein Nachweis hinterlegt“, wenn keiner vorliegt", async () => {
    const meine = [
      zeile({
        aufgabe: aufgabe({ id: "a1", titel: "Mit Nachweis" }),
        nachweise: [nachweis({ id: "n1", aufgabeId: "a1", text: "Kurs durchgefuehrt." })],
      }),
      zeile({ aufgabe: aufgabe({ id: "a2", titel: "Ohne Nachweis" }), nachweise: [] }),
    ];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);

    const karten = queryAll("li").filter((li) => li.querySelector("[data-testid^='freigeben-']"));
    expect(karten[0]!.textContent).toContain("Kurs durchgefuehrt.");
    expect(karten[1]!.textContent).toContain("Kein Nachweis hinterlegt.");
  });
});

describe("FreigabeZone — Zurueckweisen: bestaetigungspflichtig, Begruendung Pflicht", () => {
  it("oeffnet erst nach dem Klick einen Dialog mit der Begruendung als Pflichtfeld — kein sofortiges Absenden", async () => {
    const meine = [zeile({ aufgabe: aufgabe({ id: "a1", titel: "Erste" }) })];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);
    expect(existsPortal(".ant-modal")).toBe(false);

    await click("[data-testid='zurueckweisen-a1']");

    expect(existsPortal(".ant-modal")).toBe(true);
    expect(queryPortal(".ant-modal").textContent).toContain("Begründung");
    const versteckteId = queryPortal<HTMLInputElement>(".ant-modal input[name='aufgabeId']");
    expect(versteckteId.value).toBe("a1");
  });

  it("„Abbrechen“ schliesst den Dialog, ohne abzusenden", async () => {
    const meine = [zeile({ aufgabe: aufgabe({ id: "a1", titel: "Erste" }) })];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);
    await click("[data-testid='zurueckweisen-a1']");
    expect(existsPortal(".ant-modal")).toBe(true);

    await clickPortal("[data-testid='zurueckweisen-abbrechen']");
    expect(existsPortal(".ant-modal")).toBe(false);
    expect(absendenMock).not.toHaveBeenCalled();
  });

  it("zeigt einen Feldfehler an der Begruendung, wenn useActionState ihn liefert (leerer Text abgelehnt)", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { begruendung: "Eine Begruendung ist Pflicht." },
      values: { aufgabeId: "a1", begruendung: "" },
    });
    const meine = [zeile({ aufgabe: aufgabe({ id: "a1", titel: "Erste" }) })];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);

    await click("[data-testid='zurueckweisen-a1']");

    expect(queryPortal(".ant-modal").textContent).toContain("Eine Begruendung ist Pflicht.");
  });

  it("jede Zeile oeffnet den Dialog fuer die EIGENE Aufgabe, nicht die einer anderen Zeile", async () => {
    const meine = [
      zeile({ aufgabe: aufgabe({ id: "a1", titel: "Erste" }) }),
      zeile({ aufgabe: aufgabe({ id: "a2", titel: "Zweite" }) }),
    ];
    await mount(<FreigabeZone meine={meine} vertretung={[]} heute="2026-08-13" />);

    await click("[data-testid='zurueckweisen-a2']");
    const versteckteId = queryPortal<HTMLInputElement>(".ant-modal input[name='aufgabeId']");
    expect(versteckteId.value).toBe("a2");
  });
});

describe("FreigabeZone — „meine“ und „in Vertretung“ bleiben getrennte Listen", () => {
  it("eine Aufgabe in `vertretung` erscheint nicht unter „Meine“", async () => {
    const meine = [zeile({ aufgabe: aufgabe({ id: "a1", titel: "Meine Aufgabe" }) })];
    const vertretung = [zeile({ aufgabe: aufgabe({ id: "a2", titel: "Vertretungsfall" }) })];
    await mount(<FreigabeZone meine={meine} vertretung={vertretung} heute="2026-08-13" />);

    const ueberschriften = queryAll("h3").map((h) => h.textContent);
    expect(ueberschriften).toEqual(["Meine", "In Vertretung"]);
    const listen = queryAll("h3").map((h) => h.parentElement!.textContent ?? "");
    expect(listen[0]).toContain("Meine Aufgabe");
    expect(listen[0]).not.toContain("Vertretungsfall");
    expect(listen[1]).toContain("Vertretungsfall");
    expect(listen[1]).not.toContain("Meine Aufgabe");
  });
});
