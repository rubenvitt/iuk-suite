// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

/*
 * SEIT FIX-RUNDE 1 KEIN `useActionState` MEHR (`NachweisFormular.tsx`s Kopfkommentar): der Upload
 * ruft `fetch` auf einen Route Handler statt eine Server Action. Diese Datei stubbt deshalb
 * `fetch` (dieselbe Form wie `files/_ui/AbgabeFormular.test.tsx` — KEIN `new Response(...)`, die
 * Klasse ist in jsdom nicht zugesichert) und `next/navigation`s `useRouter` (dieselbe Form wie
 * `TagesWaehler.test.tsx`).
 */

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

/** Alle Anfragen des gestubbten `fetch`, als `{url, init}`. */
let aufrufe: { url: string; init?: RequestInit }[] = [];
type Antwort = { status: number; koerper?: unknown; redirected?: boolean; werfen?: unknown };
let antwortGeber: () => Antwort;

beforeEach(() => {
  aufrufe = [];
  refreshMock.mockClear();
  antwortGeber = () => ({ status: 200, koerper: { ok: true } });
  vi.stubGlobal("fetch", (eingabe: unknown, init?: RequestInit) => {
    aufrufe.push({ url: String(eingabe), init });
    const a = antwortGeber();
    if (a.werfen !== undefined) return Promise.reject(a.werfen);
    return Promise.resolve({
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      redirected: a.redirected ?? false,
      json: async () => a.koerper ?? {},
    });
  });
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

const { NachweisFormular } = await import("./NachweisFormular");

async function absenden(): Promise<void> {
  await submitForm();
}

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

describe("NachweisFormular — traegt die eigene aufgabeId NUR NOCH IN DER URL (Fix-Runde 1)", () => {
  it("kein verstecktes Feld `aufgabeId` mehr im Formular", async () => {
    await mount(<NachweisFormular aufgabeId="a42" nachweisArt="text" maxBytes={1024} />);
    expect(document.querySelector("input[name='aufgabeId']")).toBeNull();
  });

  it("das Absenden ruft `/a/<aufgabeId>/nachweis/hochladen` per POST auf", async () => {
    await mount(<NachweisFormular aufgabeId="a42" nachweisArt="text" maxBytes={1024} />);
    await fill("textarea[name='text']", "Erledigt.");
    await absenden();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]!.url).toBe("/a/a42/nachweis/hochladen");
    expect(aufrufe[0]!.init?.method).toBe("POST");
  });

  it("Textfeld ausfuellen aendert den kontrollierten Wert (rein strukturelle Rendersicherung)", async () => {
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    await fill("textarea[name='text']", "Erledigt.");
    const textarea = query<HTMLTextAreaElement>("textarea[name='text']");
    expect(textarea.value).toBe("Erledigt.");
  });
});

describe("NachweisFormular — Feldfehler kommen an, unter dem jeweils eigenen Schluessel", () => {
  it("zeigt den Feldfehler zum Text (`text`)", async () => {
    antwortGeber = () => ({
      status: 400,
      koerper: { ok: false, fieldErrors: { text: "Für diese Aufgabe ist ein Text erforderlich." }, values: { text: "" } },
    });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    await absenden();
    expect(document.body.textContent).toContain("Für diese Aufgabe ist ein Text erforderlich.");
  });

  it("zeigt den Feldfehler zur Datei (`datei`) — eine ANDERE Fehlerquelle als `text`", async () => {
    antwortGeber = () => ({
      status: 400,
      koerper: { ok: false, fieldErrors: { datei: "Für diese Aufgabe ist ein Bild erforderlich." }, values: { text: "" } },
    });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={1024} />);
    await absenden();
    expect(document.body.textContent).toContain("Für diese Aufgabe ist ein Bild erforderlich.");
  });

  it("ein Feldfehler behaelt den bereits eingetippten Text — nur die Datei ging verloren", async () => {
    antwortGeber = () => ({
      status: 400,
      koerper: { ok: false, fieldErrors: { datei: "Für diese Aufgabe ist ein Bild erforderlich." }, values: { text: "Vorher eingetippt" } },
    });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="bild" maxBytes={1024} />);
    await fill("textarea[name='text']", "Vorher eingetippt");
    await absenden();
    const textarea = query<HTMLTextAreaElement>("textarea[name='text']");
    expect(textarea.value).toBe("Vorher eingetippt");
  });
});

describe("NachweisFormular — Erfolg: Formular leert sich, die Seite wird aufgefrischt", () => {
  it("nach einem erfolgreichen Absenden steht kein Feldfehler mehr da und `router.refresh()` wird gerufen", async () => {
    antwortGeber = () => ({ status: 200, koerper: { ok: true } });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    await fill("textarea[name='text']", "Erledigt.");
    await absenden();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    const textarea = query<HTMLTextAreaElement>("textarea[name='text']");
    expect(textarea.value).toBe("");
  });
});

/**
 * DER SILENT-SUCCESS-RIEGEL (Kopfkommentar `NachweisFormular.tsx`) — verliert die Sitzung mitten
 * im Absenden, folgt `fetch` dem Redirect auf `/login` und antwortet mit HTTP 200. Ohne die
 * Pruefung auf `redirected` meldete das Formular Erfolg, ohne dass etwas gespeichert waere.
 */
describe("NachweisFormular — der Silent-Success-Riegel (abgelaufene Sitzung)", () => {
  it("eine gefolgte Weiterleitung (redirected: true, HTTP 200) zeigt einen Fehler, KEINEN Erfolg", async () => {
    antwortGeber = () => ({ status: 200, redirected: true, koerper: "<html>Login</html>" });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    await fill("textarea[name='text']", "Erledigt.");
    await absenden();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Die Anmeldung ist abgelaufen");
  });
});

describe("NachweisFormular — eine Zugriffsablehnung (404, kein Feldfehler-Koerper) bleibt laut", () => {
  it("ein 404 ohne JSON-Feldfehler zeigt eine allgemeine Fehlermeldung, keinen stillen Fehlschlag", async () => {
    antwortGeber = () => ({ status: 404 });
    await mount(<NachweisFormular aufgabeId="a1" nachweisArt="text" maxBytes={1024} />);
    await fill("textarea[name='text']", "Erledigt.");
    await absenden();
    expect(document.body.textContent).toContain("HTTP 404");
  });
});
