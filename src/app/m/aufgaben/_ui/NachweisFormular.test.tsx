// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";
import type { FormState } from "../_lib/formState";

/*
 * IDA-386 — EIN FORMULAR: Foto, optionaler Text, „Fertig melden". Der Knopf laedt ein gewaehltes
 * Foto ueber die Route hoch (`fetch`, gestubbt — KEIN `new Response(...)`, die Klasse ist in jsdom
 * nicht zugesichert) und ruft danach `fertigMeldenAction` (gemockt; sonst zoege jsdom
 * `better-sqlite3` herein). `useRouter` ist gemockt wie in `TagesWaehler.test.tsx`.
 */

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const { fertigMock } = vi.hoisted(() => ({ fertigMock: vi.fn() }));
vi.mock("../actions", () => ({ fertigMeldenAction: fertigMock }));

/** Alle Anfragen des gestubbten `fetch`, als `{url, init}`. */
let aufrufe: { url: string; init?: RequestInit }[] = [];
type Antwort = { status: number; koerper?: unknown; redirected?: boolean };
let antwortGeber: () => Antwort;

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  aufrufe = [];
  refreshMock.mockClear();
  fertigMock.mockReset();
  fertigMock.mockResolvedValue({ ok: true } satisfies FormState);
  antwortGeber = () => ({ status: 200, koerper: { ok: true } });
  vi.stubGlobal("fetch", (eingabe: unknown, init?: RequestInit) => {
    aufrufe.push({ url: String(eingabe), init });
    const a = antwortGeber();
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

const MB = 1024 * 1024;

function bildFormular(over: Partial<Parameters<typeof NachweisFormular>[0]> = {}) {
  return (
    <NachweisFormular
      aufgabeId="a1"
      nachweisArt="bild"
      nachweisPflicht
      bildMoeglich
      maxBytes={8 * MB}
      {...over}
    />
  );
}

/** Ein Foto ins Dateifeld legen — jsdom kennt kein `DataTransfer`, `files` wird ueberschrieben. */
function waehleFoto(groesse = 1024, name = "foto.jpg"): File {
  const datei = new File([new Uint8Array(groesse)], name, { type: "image/jpeg" });
  Object.defineProperty(query<HTMLInputElement>("#nf-datei"), "files", { value: [datei], configurable: true });
  return datei;
}

/** Absenden und die Kette (Upload → Action → Antwort) auslaufen lassen. */
async function absenden(): Promise<void> {
  await submitForm();
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((weiter) => setTimeout(weiter, 0));
    });
  }
}

function fertigFormData(aufruf = 0): FormData {
  return fertigMock.mock.calls[aufruf]![1] as FormData;
}

describe("NachweisFormular — ein Formular, ein Knopf", () => {
  it("trägt genau einen Knopf „Fertig melden“ und kein „Nachweis speichern“", async () => {
    await mount(bildFormular());
    const knoepfe = [...document.querySelectorAll("button")].map((b) => b.textContent);
    expect(knoepfe).toEqual(["Fertig melden"]);
    expect(document.body.textContent).not.toContain("Nachweis speichern");
  });

  it("keine Fachtexte: weder „sauber“ noch die Größe in MiB als Hinweis", async () => {
    await mount(bildFormular());
    expect(document.body.textContent).not.toMatch(/sauber|MiB|Höchstens/);
  });

  it("Bildpflicht: Foto ohne „(optional)“, Text optional", async () => {
    await mount(bildFormular());
    expect(document.querySelector("label[for='nf-datei']")!.textContent).toBe("Foto");
    expect(document.querySelector("label[for='nf-text']")!.textContent).toContain("optional");
  });

  it("Textpflicht: Text ohne „(optional)“, Foto optional", async () => {
    await mount(bildFormular({ nachweisArt: "text" }));
    expect(document.querySelector("label[for='nf-text']")!.textContent).not.toContain("optional");
    expect(document.querySelector("label[for='nf-datei']")!.textContent).toContain("optional");
  });

  it("ohne Recht auf ein Foto (`bildMoeglich: false`) gibt es kein Dateifeld", async () => {
    await mount(bildFormular({ bildMoeglich: false, nachweisPflicht: false }));
    expect(document.querySelector("input[type='file']")).toBeNull();
  });
});

describe("NachweisFormular — Absenden in einem Schritt", () => {
  it("ohne Foto: kein Upload, die Action bekommt aufgabeId und Text", async () => {
    await mount(bildFormular({ nachweisArt: "text" }));
    await fill("#nf-text", "Erledigt.");
    await absenden();
    expect(aufrufe).toHaveLength(0);
    expect(fertigMock).toHaveBeenCalledTimes(1);
    expect(fertigFormData().get("aufgabeId")).toBe("a1");
    expect(fertigFormData().get("nachweisText")).toBe("Erledigt.");
    expect(refreshMock).toHaveBeenCalled();
    expect(query<HTMLTextAreaElement>("#nf-text").value).toBe("");
  });

  it("mit Foto: erst Upload an die Route (Foto + Text), dann Fertigmeldung ohne doppelten Text", async () => {
    await mount(bildFormular());
    await fill("#nf-text", "Vorher/nachher");
    const datei = waehleFoto();
    await absenden();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]!.url).toBe("/a/a1/nachweis/hochladen");
    expect(aufrufe[0]!.init?.method).toBe("POST");
    const body = aufrufe[0]!.init?.body as FormData;
    expect((body.get("datei") as File).name).toBe(datei.name);
    expect(body.get("text")).toBe("Vorher/nachher");
    expect(fertigMock).toHaveBeenCalledTimes(1);
    expect(fertigFormData().get("nachweisText")).toBe("");
  });

  it("Prüfung gerade nicht möglich: Meldung steht da, und der nächste Druck lädt NICHT erneut hoch", async () => {
    const meldung = "Prüfung gerade nicht möglich. Das Foto bleibt gespeichert — bitte später erneut „Fertig melden“ drücken.";
    fertigMock.mockResolvedValueOnce({ ok: false, fieldErrors: { nachweis: meldung }, values: {} });
    await mount(bildFormular());
    waehleFoto();
    await absenden();
    expect(document.body.textContent).toContain(meldung);
    expect(aufrufe).toHaveLength(1);
    expect(refreshMock).toHaveBeenCalled();

    // Das Foto liegt beim Server — dasselbe Bild wird erneut geprueft, kein neues verlangt.
    Object.defineProperty(query<HTMLInputElement>("#nf-datei"), "files", { value: [], configurable: true });
    await absenden();
    expect(aufrufe).toHaveLength(1);
    expect(fertigMock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain(meldung);
  });

  it("zu großes Foto: Meldung in MB, nichts wird gesendet", async () => {
    await mount(bildFormular({ maxBytes: 8 * MB }));
    waehleFoto(9 * MB);
    await absenden();
    expect(document.body.textContent).toContain("Das Foto ist zu groß (9 MB), erlaubt sind höchstens 8 MB.");
    expect(aufrufe).toHaveLength(0);
    expect(fertigMock).not.toHaveBeenCalled();
  });

  it("ein Feldfehler der Route (Datei) steht am Foto, die Fertigmeldung unterbleibt, der Text bleibt", async () => {
    antwortGeber = () => ({
      status: 400,
      koerper: { ok: false, fieldErrors: { datei: "Das ist kein Foto in einem passenden Format." }, values: { text: "x" } },
    });
    await mount(bildFormular());
    await fill("#nf-text", "Vorher eingetippt");
    waehleFoto();
    await absenden();
    expect(query("#nf-datei-err").textContent).toContain("kein Foto");
    expect(fertigMock).not.toHaveBeenCalled();
    expect(query<HTMLTextAreaElement>("#nf-text").value).toBe("Vorher eingetippt");
  });

  it("ein Feldfehler der Action zum Text steht am Textfeld", async () => {
    fertigMock.mockResolvedValueOnce({
      ok: false,
      fieldErrors: { nachweisText: "Für diese Aufgabe ist ein Textnachweis erforderlich." },
      values: {},
    });
    await mount(bildFormular({ nachweisArt: "text" }));
    await absenden();
    expect(query("#nf-text-err").textContent).toContain("Textnachweis erforderlich");
  });
});

describe("NachweisFormular — laute Fehler", () => {
  it("abgelaufene Sitzung (Redirect, HTTP 200) beim Upload: Fehler, KEIN Erfolg, keine Fertigmeldung", async () => {
    antwortGeber = () => ({ status: 200, redirected: true, koerper: "<html>Login</html>" });
    await mount(bildFormular());
    waehleFoto();
    await absenden();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(fertigMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Die Anmeldung ist abgelaufen");
  });

  it("ein 404 der Route ohne Feldfehler bleibt laut", async () => {
    antwortGeber = () => ({ status: 404 });
    await mount(bildFormular());
    waehleFoto();
    await absenden();
    expect(document.body.textContent).toContain("HTTP 404");
  });

  it("eine Ablehnung der Action (Wurf mit `digest`) wird laut, statt endlos wiederholt", async () => {
    fertigMock.mockRejectedValueOnce(Object.assign(new Error("x"), { digest: "123" }));
    await mount(bildFormular({ nachweisArt: "text" }));
    await fill("#nf-text", "Erledigt.");
    await absenden();
    expect(document.querySelector("[role='alert']")?.textContent).toContain("Fertig melden ging gerade nicht");
  });
});

describe("NachweisFormular — Entwurf auf dem Gerät (IDA-358)", () => {
  it("der getippte Text übersteht ein Neuladen", async () => {
    await mount(bildFormular());
    await fill("#nf-text", "Fahrzeug gewaschen");
    await unmount();
    await mount(bildFormular());
    expect(query<HTMLTextAreaElement>("#nf-text").value).toBe("Fahrzeug gewaschen");
  });

  it("ohne Antwort (Netz weg) bleibt die Meldung liegen und geht nach dem Neuladen raus", async () => {
    fertigMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await mount(bildFormular({ nachweisArt: "text" }));
    await fill("#nf-text", "Fahrzeug gewaschen");
    await absenden();
    expect(document.body.textContent).toMatch(/Nicht gesendet\. Neuer Versuch in \d+ s\./);
    expect(document.querySelector("[role='alert']")).toBeNull();
    expect(ladeEntwurf("aufgaben:nachweis:a1")?.sendung).toBeTruthy();
    await unmount();

    await mount(bildFormular({ nachweisArt: "text" }));
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((weiter) => setTimeout(weiter, 0));
      });
    }
    expect(fertigMock).toHaveBeenCalledTimes(2);
    expect(fertigFormData(1).get("nachweisText")).toBe("Fahrzeug gewaschen");
    expect(ladeEntwurf("aufgaben:nachweis:a1")).toBeNull();
  });

  it("IDA-386 Review: ging die Antwort nach dem Upload verloren, bekommt ein ANDERES Foto eine neue Sendungs-ID", async () => {
    fertigMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fertigMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await mount(bildFormular());
    waehleFoto(1024, "erstes.jpg");
    await absenden();
    expect(document.body.textContent).toMatch(/Nicht gesendet\./);
    // Dasselbe Foto noch einmal: dieselbe ID — die Route bestaetigt den schon gespeicherten Upload.
    await absenden();
    // Ein anderes Foto: eine neue ID, sonst bestaetigte die Route nur den alten Upload.
    waehleFoto(2048, "zweites.jpg");
    await absenden();
    const sendungen = aufrufe.map((a) => (a.init?.body as FormData).get("sendung"));
    expect(sendungen).toHaveLength(3);
    expect(sendungen[1]).toBe(sendungen[0]);
    expect(sendungen[2]).not.toBe(sendungen[0]);
    expect(String(sendungen[2])).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(((aufrufe[2]!.init?.body as FormData).get("datei") as File).name).toBe("zweites.jpg");
  });
});
