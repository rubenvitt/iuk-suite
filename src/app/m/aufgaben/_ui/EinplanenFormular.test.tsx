// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import type { AufgabeRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * GETESTET WIE `RoutineFormular.test.tsx` (Aufgabe 11): `useActionState` SELBST gemockt, nicht die
 * Action — damit laesst sich jeder Zustand (inklusive eines Feldfehlers mit zurueckgetragenen Werten)
 * als FRISCHER Mount herstellen, ohne eine echte Transition zu simulieren. `einplanenAction` wird nur
 * als SENTINEL gemockt: `useActionState` ruft sie in diesem Test nie auf, sie muss nicht ausfuehrbar
 * sein, nur an `useActionStateMock` uebergeben werden.
 */

const { useActionStateMock, EINPLANEN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  EINPLANEN_MARKER: Symbol("einplanenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({ einplanenAction: EINPLANEN_MARKER }));

import { EinplanenFormular } from "./EinplanenFormular";

function task(over: Partial<AufgabeRow> & Pick<AufgabeRow, "id">): AufgabeRow {
  return {
    titel: "T",
    beschreibung: "B",
    prioritaet: "mittel",
    erstellerId: "e1",
    zugewiesenAn: "b1",
    status: "verteilt",
    faelligAm: "2026-08-20",
    faelligUhrzeit: null,
    dauerMinuten: 60,
    nachweisPflicht: false,
    nachweisArt: "text",
    prueferId: "e1",
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

describe("EinplanenFormular — Zeile 1 und die Action", () => {
  it('„use client" steht als allererste Zeile der Datei, vor jedem Kommentar', () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/EinplanenFormular.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("ruft useActionState mit einplanenAction auf", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(useActionStateMock).toHaveBeenCalledWith(EINPLANEN_MARKER, FORM_START);
  });
});

describe("EinplanenFormular — Vorbelegung", () => {
  it("zeigt Tag und Uhrzeit einer bereits eingeplanten Aufgabe, samt versteckter aufgabeId", async () => {
    await mount(
      <EinplanenFormular
        task={task({ id: "a1", planDatum: "2026-08-17", planUhrzeit: "09:00" })}
      />,
    );
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("2026-08-17");
    expect(query<HTMLInputElement>("#ep-planUhrzeit").value).toBe("09:00");
    expect(query<HTMLInputElement>("input[name='aufgabeId']").value).toBe("a1");
  });

  it("eine noch nicht eingeplante Aufgabe zeigt leere Tag- und Uhrzeitfelder", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("");
    expect(query<HTMLInputElement>("#ep-planUhrzeit").value).toBe("");
  });

  it("zeigt die Dauerschaetzung lesend, ohne sie als Formularfeld zu senden", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1", dauerMinuten: 90 })} />);
    expect(query("form").textContent).toContain("Dauerschätzung");
    // KEIN EINGABEFELD FUER DIE DAUER (Kopfkommentar der Komponente, Widerspruch im Bericht): kein
    // `name="dauerMinuten"` irgendwo im Formular — nur Lesetext.
    expect(queryAll("[name='dauerMinuten']")).toHaveLength(0);
  });

  it("die Uhrzeit ist optional — kein `required`, kein erzwungener Wert", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    const feld = query<HTMLInputElement>("#ep-planUhrzeit");
    expect(feld.required).toBe(false);
    expect(feld.hasAttribute("required")).toBe(false);
  });
});

/**
 * DIE ZUSAGE „KEIN SONDERFALL FUER `in_arbeit`" (Brief: „das Formular unterscheidet die beiden
 * Ausgangszustaende NICHT; es gibt keinen Sonderfall zu bauen"): `EinplanenFormular` liest `status`
 * gar nicht (der Kopfkommentar der Komponente traegt das als Zusage) — dieser Test beweist es, statt
 * es nur zu behaupten, indem er zwei sonst IDENTISCHE Aufgaben mit unterschiedlichem `status` rendert
 * und das Markup vergleicht. Die eigentliche Durchsetzung — dass `in_arbeit` tatsaechlich verschoben
 * werden DARF — ist bereits auf Aktionsebene getestet (`actions.test.ts`, Commit `4575bfe`); dieser
 * Test deckt nur die Formularseite ab, die dort nicht geprueft wird.
 */
describe("EinplanenFormular — kein Sonderfall fuer in_arbeit", () => {
  /**
   * NICHT ueber `outerHTML`-Gleichheit verglichen: `action={formAction}` haengt eine Funktionsreferenz
   * an das `<form>`, und React ist frei, dafuer bei jedem Mount einen eigenen internen Marker zu
   * vergeben — ein Vergleich der rohen Zeichenkette wäre potenziell brüchig, ohne etwas ueber die
   * Aussage dieses Tests zu sagen. Verglichen wird deshalb die FACHLICH relevante Teilmenge: welche
   * Felder mit welchem Wert gerendert werden.
   */
  function feldSchnappschuss(): unknown {
    return {
      text: query("form").textContent,
      felder: queryAll<HTMLInputElement>("input").map((i) => ({
        name: i.name,
        type: i.type,
        value: i.value,
      })),
    };
  }

  it("verteilt und in_arbeit ergeben identische Felder und Werte", async () => {
    const gemeinsam = { id: "a1", planDatum: "2026-08-17", planUhrzeit: "09:00", dauerMinuten: 45 };
    await mount(<EinplanenFormular task={task({ ...gemeinsam, status: "verteilt" })} />);
    const verteiltSchnappschuss = feldSchnappschuss();
    await unmount();
    stelleZustandEin(FORM_START);
    await mount(<EinplanenFormular task={task({ ...gemeinsam, status: "in_arbeit" })} />);
    expect(feldSchnappschuss()).toEqual(verteiltSchnappschuss);
  });
});

describe("EinplanenFormular — Absenden", () => {
  it("sendet aufgabeId, Tag und Uhrzeit", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    await fill("#ep-planDatum", "2026-08-18");
    await fill("#ep-planUhrzeit", "10:15");
    await submitForm();

    expect(absendenMock).toHaveBeenCalledTimes(1);
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("aufgabeId")).toBe("a1");
    expect(formData.get("planDatum")).toBe("2026-08-18");
    expect(formData.get("planUhrzeit")).toBe("10:15");
  });

  it("ein leeres Uhrzeitfeld wird mitgesendet, nicht als Fehler behandelt", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    await fill("#ep-planDatum", "2026-08-18");
    await submitForm();

    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("planUhrzeit")).toBe("");
  });
});

describe("EinplanenFormular — Feldfehler tragen die Eingaben mit, nicht die Vorbelegung", () => {
  /*
   * `values.planDatum` STEHT HIER LEER, NICHT ALS FEHLERHAFTE ZEICHENKETTE (z. B. "17.08.2026"): ein
   * natives `<input type="date">` gibt genau wie der Browser NUR eine gueltige ISO-Zeichenkette oder
   * leer als `.value` zurueck (jsdom haelt sich daran) — ein nicht-ISO-Format ist ueber DIESES Feld
   * strukturell gar nicht eintippbar, nur ueber ein manipuliertes `FormData` erreichbar
   * (`actions.test.ts` deckt genau diesen Fall bereits auf Aktionsebene ab: "17.08.2026" als
   * Feldfehler). Realistisch am Formular selbst ist der leere Fall — ein Absenden ohne gewaehltes
   * Datum.
   */
  it("zeigt eine Tag-Fehlermeldung am Feld, mit aria-invalid", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { planDatum: "Plantag fehlt oder ist ungueltig." },
      values: { aufgabeId: "a1", planDatum: "", planUhrzeit: "" },
    });
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(query("#ep-planDatum-err").textContent).toBe("Plantag fehlt oder ist ungueltig.");
    expect(query<HTMLInputElement>("#ep-planDatum").getAttribute("aria-invalid")).toBe("true");
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("");
  });

  it("ein leerer values.planDatum im Fehlerzustand ueberschreibt eine vorhandene Vorbelegung", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { planDatum: "Plantag fehlt oder ist ungueltig." },
      values: { aufgabeId: "a1", planDatum: "", planUhrzeit: "" },
    });
    await mount(<EinplanenFormular task={task({ id: "a1", planDatum: "2026-08-10" })} />);
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("");
  });

  /*
   * DER FALL, DEN DER BRIEF NAMENTLICH NENNT (Lektion 3): `feldWert` ignoriert im Fehlerzustand die
   * Vorbelegung. Die Aufgabe TRAEGT bereits einen `planUhrzeit`-Wert ("09:00") — der Fehlerzustand
   * traegt fuer dasselbe Feld einen LEEREN Wert zurueck (die Action haette es nicht gesendet
   * bekommen, oder es kam leer an). Das Feld muss LEER erscheinen, nicht "09:00" — sonst waere die
   * Vorbelegung staerker als der zurueckgemeldete Serverzustand.
   */
  it("ein leerer values.planUhrzeit im Fehlerzustand ueberschreibt eine vorhandene Vorbelegung", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { planUhrzeit: "Uhrzeit ungueltig — Format HH:MM." },
      values: { aufgabeId: "a1", planDatum: "2026-08-18", planUhrzeit: "" },
    });
    await mount(
      <EinplanenFormular task={task({ id: "a1", planDatum: "2026-08-17", planUhrzeit: "09:00" })} />,
    );
    expect(query<HTMLInputElement>("#ep-planUhrzeit").value).toBe("");
    expect(query("#ep-planUhrzeit-err").textContent).toBe("Uhrzeit ungueltig — Format HH:MM.");
  });
});

describe("EinplanenFormular — waehrend `isPending`", () => {
  it("deaktiviert den Absende-Knopf, waehrend eine Absendung laeuft", async () => {
    stelleZustandEin(FORM_START, true);
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(query<HTMLButtonElement>("button[type='submit']").disabled).toBe(true);
  });
});
