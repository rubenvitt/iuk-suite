// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, rerender, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { feldWertImDom, listenOptionen, oeffneListe, waehleAusListe, waehleDatum, waehleZeit } from "./testFelder";
import type { AufgabeRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";
import { entwurfSchluessel, ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

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

/** IDA-358: der Schluessel eines Bearbeiten-Entwurfs traegt den Fingerabdruck des Serverstands. */
const entwurfZu = (anfang: string) => {
  const k = entwurfSchluessel().find((x) => x.startsWith(anfang) && !x.endsWith(":wahl"));
  return k ? ladeEntwurf(k) : null;
};

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
  // IDA-358: das Formular legt seine Eingaben auf dem Geraet ab.
  localStorage.clear();
  vergissFluechtig();
  useActionStateMock.mockReset();
  stelleZustandEin(FORM_START);
});

afterEach(async () => {
  await unmount();
});

describe("EinplanenFormular — Zeile 1 und die Action", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
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
    /*
     * ZWEI ABLESESTELLEN SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16), UND BEIDE WERDEN
     * GEBRAUCHT: das SICHTBARE Feld traegt seit dem Wechsel auf antds `DatePicker` den deutschen
     * Anzeigetext, das VERSTECKTE daneben den ISO-Wert, den die Action liest. Nur die zweite Zeile
     * zu pruefen liesse ein Feld durchgehen, das dem Menschen nichts zeigt; nur die erste liesse
     * eines durchgehen, das dem Server nichts schickt.
     */
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("17.08.2026");
    expect(feldWertImDom("planDatum")).toBe("2026-08-17");
    expect(query<HTMLInputElement>("#ep-planUhrzeit").value).toBe("09:00");
    expect(feldWertImDom("planUhrzeit")).toBe("09:00");
    expect(query<HTMLInputElement>("input[name='aufgabeId']").value).toBe("a1");
  });

  it("eine noch nicht eingeplante Aufgabe zeigt leere Tag- und Uhrzeitfelder", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("");
    expect(query<HTMLInputElement>("#ep-planUhrzeit").value).toBe("");
  });

  /**
   * FIX-RUNDE 1 (Betreiberentscheidung): die Dauerschaetzung ist jetzt ein ECHTES Eingabefeld,
   * vorbelegt mit dem bisherigen Wert der Aufgabe — nicht mehr der reine Lesetext der ersten
   * Fassung. Seit IDA-386 eine Auswahl in Stufen statt einer Minutenzahl.
   */
  it("zeigt die Dauerschaetzung vorbelegt als Auswahl in Stufen", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1", dauerMinuten: 90 })} />);
    expect(feldWertImDom("dauerMinuten")).toBe("90");
    expect(query("#ep-dauerMinuten").closest(".ant-select")?.textContent).toContain("1,5 Std.");
    await oeffneListe("#ep-dauerMinuten");
    expect(listenOptionen().map((o) => o.textContent)).toEqual([
      "15 Min.", "30 Min.", "45 Min.", "1 Std.", "1,5 Std.", "2 Std.", "3 Std.", "4 Std.", "6 Std.", "8 Std.",
    ]);
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
   * NICHT ueber `outerHTML`-Gleichheit verglichen: `action={absenden}` haengt eine Funktionsreferenz
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
  it("sendet aufgabeId, Tag, Uhrzeit und die (vorbelegte) Dauerschaetzung", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1", dauerMinuten: 60 })} />);
    await waehleDatum("#ep-planDatum", "2026-08-18");
    await waehleZeit("#ep-planUhrzeit", "10:15");
    await submitForm();

    expect(absendenMock).toHaveBeenCalledTimes(1);
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("aufgabeId")).toBe("a1");
    expect(formData.get("planDatum")).toBe("2026-08-18");
    expect(formData.get("planUhrzeit")).toBe("10:15");
    // VORBELEGT, NICHT ANGEFASST — ein normales Absenden traegt trotzdem die bisherige Dauer mit,
    // weil das Feld nie leer gerendert wird.
    expect(formData.get("dauerMinuten")).toBe("60");
  });

  it("ein leeres Uhrzeitfeld wird mitgesendet, nicht als Fehler behandelt", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    await waehleDatum("#ep-planDatum", "2026-08-18");
    await submitForm();

    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("planUhrzeit")).toBe("");
  });

  it("eine geaenderte Dauerschaetzung wird mit dem NEUEN Wert gesendet", async () => {
    await mount(<EinplanenFormular task={task({ id: "a1", dauerMinuten: 60 })} />);
    await waehleDatum("#ep-planDatum", "2026-08-18");
    await waehleAusListe("#ep-dauerMinuten", "1,5 Std.");
    await submitForm();

    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("dauerMinuten")).toBe("90");
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
      fieldErrors: { planDatum: "Plantag fehlt oder ist ungültig." },
      values: { aufgabeId: "a1", planDatum: "", planUhrzeit: "" },
    });
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(query("#ep-planDatum-err").textContent).toBe("Plantag fehlt oder ist ungültig.");
    expect(query<HTMLInputElement>("#ep-planDatum").getAttribute("aria-invalid")).toBe("true");
    expect(query<HTMLInputElement>("#ep-planDatum").value).toBe("");
  });

  it("ein leerer values.planDatum im Fehlerzustand ueberschreibt eine vorhandene Vorbelegung", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { planDatum: "Plantag fehlt oder ist ungültig." },
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
      fieldErrors: { planUhrzeit: "Uhrzeit ungültig — Format HH:MM." },
      values: { aufgabeId: "a1", planDatum: "2026-08-18", planUhrzeit: "" },
    });
    await mount(
      <EinplanenFormular task={task({ id: "a1", planDatum: "2026-08-17", planUhrzeit: "09:00" })} />,
    );
    expect(query<HTMLInputElement>("#ep-planUhrzeit").value).toBe("");
    expect(query("#ep-planUhrzeit-err").textContent).toBe("Uhrzeit ungültig — Format HH:MM.");
  });

  /*
   * DIESELBE LEKTION FUER DAS VIERTE FELD: die Aufgabe traegt bereits eine gueltige Dauer (60), der
   * Fehlerzustand traegt fuer dasselbe Feld die (ungueltige) EINGETIPPTE Zeichenkette zurueck ("0").
   * Das Feld muss GENAU "0" zeigen, nicht "60" — sonst waere die Vorbelegung staerker als der
   * zurueckgemeldete Serverzustand, und die Person saehe ihren Tippfehler nicht mehr.
   */
  it("ein ungueltiger values.dauerMinuten im Fehlerzustand ueberschreibt eine vorhandene Vorbelegung", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { dauerMinuten: "Dauerschätzung muss eine ganze Zahl größer 0 sein." },
      values: { aufgabeId: "a1", planDatum: "2026-08-18", planUhrzeit: "", dauerMinuten: "0" },
    });
    await mount(<EinplanenFormular task={task({ id: "a1", dauerMinuten: 60 })} />);
    expect(feldWertImDom("dauerMinuten")).toBe("0");
    expect(query("#ep-dauerMinuten-err").textContent).toBe(
      "Dauerschätzung muss eine ganze Zahl größer 0 sein.",
    );
  });
});

describe("EinplanenFormular — waehrend `isPending`", () => {
  it("deaktiviert den Absende-Knopf, waehrend eine Absendung laeuft", async () => {
    stelleZustandEin(FORM_START, true);
    await mount(<EinplanenFormular task={task({ id: "a1" })} />);
    expect(query<HTMLButtonElement>("button[type='submit']").disabled).toBe(true);
  });
});

describe("EinplanenFormular — Entwurf auf dem Geraet (IDA-358)", () => {
  it("Tag und Dauer ueberstehen das Neuladen; Erfolg raeumt den Entwurf", async () => {
    const t = task({ id: "a1" });
    await mount(<EinplanenFormular task={t} />);
    await waehleDatum("#ep-planDatum", "2026-11-05");
    await waehleAusListe("#ep-dauerMinuten", "30 Min.");
    await unmount();

    await mount(<EinplanenFormular task={t} />);
    expect(feldWertImDom("planDatum")).toBe("2026-11-05");
    expect(feldWertImDom("dauerMinuten")).toBe("30");

    stelleZustandEin({ ok: true });
    await rerender(<EinplanenFormular task={t} />);
    expect(entwurfZu(`aufgaben:einplanen:${t.id}:ep:`)).toBeNull();
  });
});
