// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import type { PersonRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * DIESELBE PRUEFSTRATEGIE WIE `RoutineFormular.test.tsx`: `useActionState` selbst gemockt, die
 * beiden Actions nur als unterscheidbare Sentinels — sie werden nie ausgefuehrt.
 */
const { useActionStateMock, ANLEGEN_MARKER, AENDERN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  ANLEGEN_MARKER: Symbol("personAnlegenAction"),
  AENDERN_MARKER: Symbol("personAendernAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({
  personAnlegenAction: ANLEGEN_MARKER,
  personAendernAction: AENDERN_MARKER,
}));

import { PersonenFormular } from "./PersonenFormular";

const PERSON: PersonRow = {
  id: "p1",
  sub: "dev:alina@localtest.me",
  name: "Alina",
  initialen: "AL",
  rolle: "bufdi",
  sollMinutenTag: 468,
  aktivVon: "2026-08-01",
  aktivBis: null,
  erstelltAm: new Date(0),
};

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

describe("PersonenFormular — Zeile 1 und die Action-Wahl", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/PersonenFormular.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("waehlt personAnlegenAction ohne `person`-Prop", async () => {
    await mount(<PersonenFormular />);
    expect(useActionStateMock).toHaveBeenCalledWith(ANLEGEN_MARKER, FORM_START);
  });

  it("waehlt personAendernAction MIT `person`-Prop", async () => {
    await mount(<PersonenFormular person={PERSON} />);
    expect(useActionStateMock).toHaveBeenCalledWith(AENDERN_MARKER, FORM_START);
  });
});

describe("PersonenFormular — Anlegen: der sub ist ein echtes Feld, mit Erklaerung", () => {
  it("zeigt ein leeres sub-Feld und den Anlege-Knopf, kein verstecktes personId", async () => {
    await mount(<PersonenFormular />);
    expect(query<HTMLInputElement>("#pf-sub").value).toBe("");
    expect(query("button[type='submit']").textContent).toBe("Person anlegen");
    expect(queryAll("input[name='personId']")).toHaveLength(0);
  });

  /**
   * DER AUSGANG AUS `NichtEingetragenSeite.tsx` (Brief: "kein Feld, das die Koordination raten
   * laesst") — das Formular erklaert, WOHER der sub kommt, statt ihn nur abzufragen.
   */
  it("erklaert, woher die Kennung kommt — kein blindes Rate-Feld", async () => {
    await mount(<PersonenFormular />);
    expect(document.body.textContent).toContain("Hinweisseite");
  });

  it("sendet sub, Name, Initialen, Rolle, Soll-Zeit, aktivVon/aktivBis beim Absenden", async () => {
    await mount(<PersonenFormular />);
    await fill("#pf-sub", "dev:neu@localtest.me");
    await fill("#pf-name", "Neu");
    await fill("#pf-initialen", "NE");
    await fill("#pf-soll", "400");
    await fill("#pf-aktiv-von", "2026-08-14");
    await submitForm();

    expect(absendenMock).toHaveBeenCalledTimes(1);
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("sub")).toBe("dev:neu@localtest.me");
    expect(formData.get("name")).toBe("Neu");
    expect(formData.get("initialen")).toBe("NE");
    expect(formData.get("sollMinutenTag")).toBe("400");
    expect(formData.get("aktivVon")).toBe("2026-08-14");
  });
});

/**
 * DIE ROLLENAUSWAHL BIETET DIE KOORDINATION NICHT MEHR AN (Quellenwechsel 2026-08-15) — und das ist
 * kein kosmetischer Punkt: solange „Koordination" hier zur Wahl stuende, verspraeche das Formular
 * eine Vergabe, die es nicht mehr leisten kann (die Rolle kommt aus der Pocket-ID-Gruppe, s.
 * `_lib/zugang.ts`), und die Koordination suchte den Fehler bei sich statt in der Gruppenpflege.
 * Die Auswahl liest `ROLLEN`/`ROLLE_TEXT` (`_db/schema.ts`, `_lib/anzeige.ts`) — dieser Test bindet
 * das ANGEBOT an die eine Quelle, statt es nur zu behaupten.
 */
describe("PersonenFormular — die Rollenauswahl kennt nur noch die zwei Tabellenrollen", () => {
  it("bietet genau `auftrag` und `bufdi` an, nicht die Koordination", async () => {
    await mount(<PersonenFormular />);
    const optionen = queryAll<HTMLOptionElement>("#pf-rolle option");
    expect(optionen.map((o) => o.value)).toEqual(["auftrag", "bufdi"]);
    expect(optionen.map((o) => o.textContent)).toEqual(["Auftraggeber", "BuFDi"]);
  });
});

describe("PersonenFormular — Aendern: der sub ist NICHT mehr editierbar", () => {
  it("zeigt Name/Rolle/Soll-Zeit/aktivVon/aktivBis vorbelegt, das versteckte personId, den Speichern-Knopf", async () => {
    await mount(<PersonenFormular person={PERSON} />);
    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina");
    expect(query<HTMLInputElement>("#pf-initialen").value).toBe("AL");
    expect(query<HTMLSelectElement>("#pf-rolle").value).toBe("bufdi");
    expect(query<HTMLInputElement>("#pf-soll").value).toBe("468");
    expect(query<HTMLInputElement>("#pf-aktiv-von").value).toBe("2026-08-01");
    expect(query<HTMLInputElement>("input[name='personId']").value).toBe("p1");
    expect(query("button[type='submit']").textContent).toBe("Speichern");
  });

  /**
   * DER SUB STEHT NUR NOCH ALS TEXT, NICHT ALS `<input name="sub">` (Kopfkommentar der Komponente):
   * ein geaendertes sub haengte die gesamte Geschichte einer Person still an eine andere Anmeldung
   * um. Kein Formularfeld heisst: ein manipuliertes Formular kann `sub` gar nicht mitschicken, weil
   * diese Komponente es nie rendert.
   */
  it("rendert KEIN Formularfeld namens sub — nur Lesetext", async () => {
    await mount(<PersonenFormular person={PERSON} />);
    expect(queryAll("input[name='sub']")).toHaveLength(0);
    expect(document.body.textContent).toContain("dev:alina@localtest.me");
  });
});

describe("PersonenFormular — Feldfehler tragen die Eingaben mit", () => {
  it("zeigt eine Name-Fehlermeldung am Feld, mit aria-invalid", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { name: "Name fehlt." },
      values: {
        sub: "dev:neu@localtest.me", name: "", initialen: "NE", rolle: "bufdi",
        sollMinutenTag: "300", aktivVon: "2026-08-14", aktivBis: "",
      },
    });
    await mount(<PersonenFormular />);
    expect(query("#pf-name-err").textContent).toBe("Name fehlt.");
    expect(query<HTMLInputElement>("#pf-name").getAttribute("aria-invalid")).toBe("true");
  });

  it("ein bereits vergebener sub kommt als Fehlermeldung am sub-Feld zurueck, der Wert bleibt stehen", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { sub: "Diese Kennung ist bereits vergeben." },
      values: {
        sub: "dev:doppelt@localtest.me", name: "Neu", initialen: "NE", rolle: "bufdi",
        sollMinutenTag: "300", aktivVon: "2026-08-14", aktivBis: "",
      },
    });
    await mount(<PersonenFormular />);
    expect(query<HTMLInputElement>("#pf-sub").value).toBe("dev:doppelt@localtest.me");
    expect(query("#pf-sub-err").textContent).toBe("Diese Kennung ist bereits vergeben.");
  });
});

describe("PersonenFormular — waehrend isPending", () => {
  it("deaktiviert den Absende-Knopf, waehrend eine Absendung laeuft", async () => {
    stelleZustandEin(FORM_START, true);
    await mount(<PersonenFormular />);
    expect(query<HTMLButtonElement>("button[type='submit']").disabled).toBe(true);
  });
});
