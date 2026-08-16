// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { waehleZeit } from "./testFelder";
import type { RoutineRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * DIE ERSTE CLIENT-INSEL DES MODULS — GETESTET WIE `files/_ui/ZugangslinksListe.test.tsx`:
 * `useActionState` selbst gemockt (nicht die Action), weil sich damit JEDER Zustand — inklusive eines
 * Feldfehlers MIT zurueckgetragener Wochentagsauswahl — als FRISCHER Mount herstellen laesst.
 *
 * WARUM NICHT UEBER EINE ECHTE TRANSITION GETESTET: `defaultChecked` wirkt NUR beim (Re-)Mount, nicht
 * bei einem Rerender derselben Instanz — das DOM einer Client-Komponente persistiert ueber eine
 * Server-Action-Transition hinweg (kein Seitenwechsel), die Kontrollkaestchen blieben also so stehen,
 * wie die Person sie zuletzt selbst gesetzt hat, VOELLIG UNABHAENGIG davon, ob `gewaehlteIndizes`
 * `state.values.wochentage` richtig liest. Ein Test ueber eine echte Transition priefte in Wahrheit
 * nur "das DOM aendert sich nicht von selbst" — wahr, aber nicht die Aussage, um die es geht. Die
 * Aussage, die zaehlt, ist die fuer PROGRESSIVE ENHANCEMENT (ein voller Seitenwechsel VOR Hydration,
 * bei dem die Formularwerte tatsaechlich aus `state.values` neu ins HTML gerendert werden) — und die
 * ist ueber einen frischen Mount mit fest vorgegebenem Fehlerzustand direkt und eindeutig pruefbar.
 *
 * `../actions` WIRD AUF ZWEI SENTINELS GEMOCKT, NICHT AUF ECHTE FUNKTIONEN: `useActionState` ist
 * ebenfalls gemockt und ruft die uebergebene Action nie auf — sie muss also nicht ausfuehrbar sein,
 * nur UNTERSCHEIDBAR (welche der beiden Actions die Komponente je nach `routine`-Prop waehlt).
 */

const { useActionStateMock, ANLEGEN_MARKER, AENDERN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  ANLEGEN_MARKER: Symbol("routineAnlegenAction"),
  AENDERN_MARKER: Symbol("routineAendernAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({
  routineAnlegenAction: ANLEGEN_MARKER,
  routineAendernAction: AENDERN_MARKER,
}));

import { RoutineFormular } from "./RoutineFormular";

const ROUTINE: RoutineRow = {
  id: "r1",
  personId: "alina",
  titel: "Fruehsport",
  wochentage: 0b10101, // Mo, Mi, Fr
  uhrzeit: "07:00",
  dauerMinuten: 30,
  aktiv: true,
  erstelltAm: new Date(0),
};

let absendenMock: ReturnType<typeof vi.fn>;

/** Setzt den Rueckgabewert von `useActionState` fuer den NAECHSTEN Mount. */
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

/** Die Indizes (0-4) der angehakten Wochentags-Kontrollkaestchen, in DOM-Reihenfolge. */
function angehakteIndizes(): number[] {
  return queryAll<HTMLInputElement>("input[name='wochentage']")
    .map((cb, i) => (cb.checked ? i : null))
    .filter((i): i is number => i !== null);
}

describe("RoutineFormular — Zeile 1 und die Action-Wahl", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/RoutineFormular.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("waehlt routineAnlegenAction ohne `routine`-Prop", async () => {
    await mount(<RoutineFormular />);
    expect(useActionStateMock).toHaveBeenCalledWith(ANLEGEN_MARKER, FORM_START);
  });

  it("waehlt routineAendernAction MIT `routine`-Prop", async () => {
    await mount(<RoutineFormular routine={ROUTINE} />);
    expect(useActionStateMock).toHaveBeenCalledWith(AENDERN_MARKER, FORM_START);
  });
});

describe("RoutineFormular — Anlegen", () => {
  it("zeigt leere Felder, keine angehakten Wochentage, kein verstecktes routineId, den Anlege-Knopf", async () => {
    await mount(<RoutineFormular />);
    expect(query<HTMLInputElement>("#rt-titel").value).toBe("");
    expect(query<HTMLInputElement>("#rt-uhrzeit").value).toBe("");
    expect(query<HTMLInputElement>("#rt-dauer").value).toBe("");
    expect(angehakteIndizes()).toEqual([]);
    expect(query("button[type='submit']").textContent).toBe("Routine anlegen");
    expect(queryAll("input[name='routineId']")).toHaveLength(0);
  });

  it("sendet Titel, die angehakten Wochentage, Uhrzeit und Dauer beim Absenden", async () => {
    await mount(<RoutineFormular />);
    await click("#rt-wochentag-0");
    await click("#rt-wochentag-2");
    await fill("#rt-titel", "Joggen");
    await waehleZeit("#rt-uhrzeit", "06:30");
    await fill("#rt-dauer", "40");
    await submitForm();

    expect(absendenMock).toHaveBeenCalledTimes(1);
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("titel")).toBe("Joggen");
    expect(formData.getAll("wochentage")).toEqual(["0", "2"]);
    expect(formData.get("uhrzeit")).toBe("06:30");
    expect(formData.get("dauerMinuten")).toBe("40");
  });

  it("ein zweites Anhaken hebt das erste wieder auf — ein Kontrollkaestchen schaltet um", async () => {
    await mount(<RoutineFormular />);
    await click("#rt-wochentag-1");
    expect(angehakteIndizes()).toEqual([1]);
    await click("#rt-wochentag-1");
    expect(angehakteIndizes()).toEqual([]);
  });
});

describe("RoutineFormular — Aendern", () => {
  it("zeigt Titel, Uhrzeit, Dauer, das versteckte routineId und GENAU die richtigen angehakten Tage", async () => {
    await mount(<RoutineFormular routine={ROUTINE} />);
    expect(query<HTMLInputElement>("#rt-titel").value).toBe("Fruehsport");
    expect(query<HTMLInputElement>("#rt-uhrzeit").value).toBe("07:00");
    expect(query<HTMLInputElement>("#rt-dauer").value).toBe("30");
    expect(query<HTMLInputElement>("input[name='routineId']").value).toBe("r1");
    expect(query("button[type='submit']").textContent).toBe("Speichern");
    // DIE BITMASKE GEHT IN BEIDE RICHTUNGEN RICHTIG (Brief): 0b10101 = Bit 0 + Bit 2 + Bit 4 = Mo, Mi, Fr.
    expect(angehakteIndizes()).toEqual([0, 2, 4]);
  });

  it("sendet die routineId mit", async () => {
    await mount(<RoutineFormular routine={ROUTINE} />);
    await submitForm();
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("routineId")).toBe("r1");
    expect(formData.getAll("wochentage")).toEqual(["0", "2", "4"]);
  });
});

describe("RoutineFormular — Feldfehler tragen die Eingaben mit", () => {
  it("zeigt eine Titel-Fehlermeldung am Feld, mit aria-invalid", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { titel: "Titel fehlt." },
      values: { titel: "", wochentage: "0,2,4", uhrzeit: "", dauerMinuten: "30" },
    });
    await mount(<RoutineFormular />);
    expect(query("#rt-titel-err").textContent).toBe("Titel fehlt.");
    expect(query<HTMLInputElement>("#rt-titel").getAttribute("aria-invalid")).toBe("true");
  });

  /*
   * DER FALL, DEN DER BRIEF NAMENTLICH NENNT: `feldWert` ignoriert im Fehlerzustand die Vorbelegung —
   * jedes Feld, das die Action nicht in `values` zurueckgibt, kaeme LEER zurueck. Bei einer
   * Checkbox-Gruppe ueber fuenf Wochentage heisst das: nach einem Feldfehler ist die ganze Auswahl
   * weg, wenn `RoutineFormular` sie nicht selbst mitfuehrt (Aufgabe 9 hatte denselben Fehler bei
   * `fuerSichSelbst`, dort behoben).
   */
  it("nach einem Feldfehler traegt die Wochentagsauswahl GENAU die zurueckgemeldeten Tage — nicht leer", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { wochentage: "Mindestens ein Wochentag muss gewaehlt sein." },
      values: { titel: "Joggen", wochentage: "1,3", uhrzeit: "", dauerMinuten: "20" },
    });
    await mount(<RoutineFormular />);
    expect(angehakteIndizes()).toEqual([1, 3]);
    expect(query("#rt-wochentage-err").textContent).toBe(
      "Mindestens ein Wochentag muss gewaehlt sein.",
    );
  });

  it("eine leere Wochentagsauswahl im Feldfehler ergibt KEINE angehakten Tage, nicht alle", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { wochentage: "Mindestens ein Wochentag muss gewaehlt sein." },
      values: { titel: "Joggen", wochentage: "", uhrzeit: "", dauerMinuten: "20" },
    });
    await mount(<RoutineFormular />);
    expect(angehakteIndizes()).toEqual([]);
  });

  it("traegt Uhrzeit und Dauer aus dem Feldfehler-Zustand weiter, NICHT aus der Vorbelegung des Ziels", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { dauerMinuten: "Dauerschaetzung muss eine ganze Zahl groesser 0 sein." },
      values: { titel: "Joggen", wochentage: "0", uhrzeit: "09:15", dauerMinuten: "0" },
    });
    // `routine={ROUTINE}` traegt "Fruehsport"/"07:00"/30 — der Fehlerzustand muss trotzdem gewinnen.
    await mount(<RoutineFormular routine={ROUTINE} />);
    expect(query<HTMLInputElement>("#rt-titel").value).toBe("Joggen");
    expect(query<HTMLInputElement>("#rt-uhrzeit").value).toBe("09:15");
    expect(query<HTMLInputElement>("#rt-dauer").value).toBe("0");
    expect(query("#rt-dauer-err").textContent).toBe(
      "Dauerschaetzung muss eine ganze Zahl groesser 0 sein.",
    );
  });
});

describe("RoutineFormular — waehrend `isPending`", () => {
  it("deaktiviert den Absende-Knopf, waehrend eine Absendung laeuft", async () => {
    stelleZustandEin(FORM_START, true);
    await mount(<RoutineFormular />);
    expect(query<HTMLButtonElement>("button[type='submit']").disabled).toBe(true);
  });
});
