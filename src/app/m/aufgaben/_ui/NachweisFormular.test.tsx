// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * DIESELBE FORM WIE `AktionsZone.test.tsx`/`FreigabeZone.test.tsx`: `useActionState` gemockt, und
 * `../actions` auf ein Sentinel statt der echten Datei (sonst zoege der jsdom-Lauf
 * `better-sqlite3`/`next/cache` ueber die echte `actions.ts` herein).
 */
const { useActionStateMock, NACHWEIS_HOCHLADEN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  NACHWEIS_HOCHLADEN_MARKER: Symbol("nachweisHochladenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({
  nachweisHochladenAction: NACHWEIS_HOCHLADEN_MARKER,
}));

import { NachweisFormular } from "./NachweisFormular";

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

describe("NachweisFormular — Untergrenzen-Regel als Beschriftung, Pruefung liegt beim Server", () => {
  it("nachweisArt „bild“: Bild ist Pflicht (kein „(optional)“), Text ist optional", async () => {
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={1024} />);
    const bildLabel = document.querySelector("label[for='nf-datei']")!;
    const textLabel = document.querySelector("label[for='nf-text']")!;
    expect(bildLabel.textContent).not.toContain("optional");
    expect(textLabel.textContent).toContain("optional");
  });

  it("nachweisArt „text“: Text ist Pflicht, Bild ist optional", async () => {
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    const bildLabel = document.querySelector("label[for='nf-datei']")!;
    const textLabel = document.querySelector("label[for='nf-text']")!;
    expect(textLabel.textContent).not.toContain("optional");
    expect(bildLabel.textContent).toContain("optional");
  });
});

describe("NachweisFormular — die Dateiauswahl geht nach jedem Absenden verloren, und das steht da", () => {
  it("der Hinweis steht STAENDIG da, nicht erst nach einem Fehler", async () => {
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={1024} />);
    expect(document.body.textContent).toContain("muss die Datei bei einem erneuten Versuch");
  });

  it("nennt die konfigurierte Obergrenze in MiB, aus der Prop, nicht hartcodiert", async () => {
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={8 * 1024 * 1024} />);
    expect(document.body.textContent).toContain("8.0 MiB");
  });
});

describe("NachweisFormular — Feldfehler kommen an, unter dem jeweils eigenen Schluessel", () => {
  it("zeigt den Feldfehler zum Text (`text`)", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { text: "Für diese Aufgabe ist ein Text erforderlich." },
      values: { aufgabeId: "a1", text: "" },
    });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    expect(document.body.textContent).toContain("Für diese Aufgabe ist ein Text erforderlich.");
  });

  it("zeigt den Feldfehler zur Datei (`datei`) — eine ANDERE Fehlerquelle als `text`", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { datei: "Für diese Aufgabe ist ein Bild erforderlich." },
      values: { aufgabeId: "a1" },
    });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={1024} />);
    expect(document.body.textContent).toContain("Für diese Aufgabe ist ein Bild erforderlich.");
  });

  it("ein zurueckgetragener Text-Wert fuellt das Feld nach einem Feldfehler wieder", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { datei: "Für diese Aufgabe ist ein Bild erforderlich." },
      values: { aufgabeId: "a1", text: "Vorher eingetippt" },
    });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={1024} />);
    const textarea = query<HTMLTextAreaElement>("textarea[name='text']");
    expect(textarea.value).toBe("Vorher eingetippt");
  });
});

describe("NachweisFormular — traegt die eigene aufgabeId als verstecktes Feld", () => {
  it("das versteckte Feld `aufgabeId` traegt die uebergebene Id", async () => {
    await mount(<NachweisFormular aufgabeId="a42" nachweisArt="text" maxBytes={1024} />);
    const versteckt = query<HTMLInputElement>("input[name='aufgabeId']");
    expect(versteckt.value).toBe("a42");
  });

  it("Textfeld ausfuellen aendert den kontrollierten Wert (rein strukturelle Rendersicherung)", async () => {
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    await fill("textarea[name='text']", "Erledigt.");
    const textarea = query<HTMLTextAreaElement>("textarea[name='text']");
    expect(textarea.value).toBe("Erledigt.");
  });
});
