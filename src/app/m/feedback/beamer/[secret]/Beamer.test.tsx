// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { clickElement, exists, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { BeamerSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { Beamer } from "./Beamer";

/**
 * Die Beamer-Ansicht des Live-Quiz (`docs/design/feedback-live-quiz.md`, Mockup
 * `docs/design/mockups/live-quiz.html`, Abschnitt „Beamer“). Strom = nachgebaute `EventSource`,
 * POSTs = gemocktes `fetch`, das iframe = ein gemocktes `window.parent`.
 */

class FalscheQuelle {
  static alle: FalscheQuelle[] = [];
  readyState = 0;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(readonly url: string) {
    FalscheQuelle.alle.push(this);
  }
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
  async sende(sicht: BeamerSicht) {
    await act(async () => {
      this.readyState = 1;
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(sicht) }));
    });
  }
}
const letzteQuelle = () => FalscheQuelle.alle[FalscheQuelle.alle.length - 1];

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const antwortMit = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const OPTIONEN = ["Sie landet sofort", "Sie fliegt zum Startpunkt", "Sie schwebt", "Sie fliegt zum Handy"];

function sicht(extra: Partial<BeamerSicht> = {}): BeamerSicht {
  return {
    titel: "Notfallverfahren UAV",
    modus: "wettbewerb",
    phase: { art: "lobby" },
    jetzt: 1_000_000,
    fragenAnzahl: 8,
    schritt: 0,
    schrittAnzahl: 25,
    beitrittCode: "K7Q2MX",
    teilnehmende: 31,
    beendet: false,
    ...extra,
  };
}
const vorStart = () => sicht({ phase: { art: "vorStart" }, beitrittCode: null, teilnehmende: 0 });
const frage = (extra: Partial<BeamerSicht> = {}) =>
  sicht({
    phase: { art: "frage", index: 2, offen: true, endetUm: 1_014_000 },
    schritt: 7,
    frage: { index: 2, anzahl: 8, text: "Was macht die Drohne?", typ: "einfach", optionen: OPTIONEN, antworten: 12, zeitS: 30 },
    ...extra,
  });

const text = () => document.body.textContent ?? "";
const flush = () => act(async () => {});
const knopf = (wort: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.includes(wort));
const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url, init]) => ({ url, body: JSON.parse(String(init?.body ?? "null")) }));

/** Das Fenster als iframe: `window.parent` ist ein anderes Fenster mit eigenem `postMessage`. */
const elternPost = vi.fn();
const elternFenster = { postMessage: elternPost, focus: () => {} } as unknown as Window;
function alsIframe() {
  vi.spyOn(window, "parent", "get").mockReturnValue(elternFenster);
}
/** Eine Nachricht, standardmäßig vom (gemockten) Parent; `quelle` setzt einen anderen Absender. */
async function nachricht(daten: unknown, quelle: unknown = elternFenster) {
  await act(async () => {
    const e = new MessageEvent("message", { data: daten });
    // jsdom nimmt im Konstruktor nur echte Fenster als `source`.
    Object.defineProperty(e, "source", { value: quelle });
    window.dispatchEvent(e);
  });
  await flush();
}
async function taste(key: string) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  await flush();
}

beforeEach(() => {
  FalscheQuelle.alle = [];
  vi.stubGlobal("EventSource", FalscheQuelle);
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { schritt?: number };
    return antwortMit(200, sicht({ schritt: body.schritt ?? 0 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  elternPost.mockReset();
  window.history.replaceState(null, "", "/beamer/geheim");
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const ADRESSE = "feedback.drk-ida.de/q";

describe("Beamer: Strom und Lobby", () => {
  it("öffnet den Strom relativ zur Seite und zeigt Code, QR und Zahl", async () => {
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    expect(letzteQuelle().url).toBe("/beamer/geheim/strom");
    expect(text()).toContain("Mach mit");
    expect(text()).toContain(ADRESSE);
    expect(queryAll("[data-code-zeichen]").map((e) => e.textContent).join("")).toBe("K7Q2MX");
    expect(new URL(document.querySelector("img")!.src).pathname).toBe("/q/K7Q2MX/qr.svg");
    expect(text()).toContain("31");
    await letzteQuelle().sende(sicht({ teilnehmende: 32 }));
    expect(text()).toContain("32");
  });

  it("der QR-Weg hält das Präfix vor `/beamer/` (Aufruf ohne Host-Rewrite)", async () => {
    window.history.replaceState(null, "", "/m/feedback/beamer/geheim");
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    expect(new URL(document.querySelector("img")!.src).pathname).toBe("/m/feedback/q/K7Q2MX/qr.svg");
  });
});

describe("Beamer: allein im Browser", () => {
  it("`vorStart` zeigt „Lobby öffnen“ → POST `{ schritt: 0 }`", async () => {
    await mount(<Beamer anfang={vorStart()} beitrittAdresse={ADRESSE} />);
    expect(text()).toContain("Notfallverfahren UAV");
    expect(text()).toContain("Wettbewerb, 8 Fragen");
    await clickElement(knopf("Lobby öffnen")!);
    await flush();
    expect(posts()).toEqual([{ url: "/beamer/geheim/schritt", body: { schritt: 0 } }]);
    expect(text()).toContain("Mach mit");
  });

  it("Tastatur: → / Bild ab / Leertaste vor, ← / Bild auf zurück", async () => {
    await mount(<Beamer anfang={sicht({ schritt: 3 })} beitrittAdresse={ADRESSE} />);
    await taste("ArrowRight");
    expect(posts().at(-1)?.body).toEqual({ schritt: 4 });
    await taste("PageDown");
    expect(posts().at(-1)?.body).toEqual({ schritt: 5 });
    await taste(" ");
    expect(posts().at(-1)?.body).toEqual({ schritt: 6 });
    await taste("ArrowLeft");
    expect(posts().at(-1)?.body).toEqual({ schritt: 5 });
    await taste("PageUp");
    expect(posts().at(-1)?.body).toEqual({ schritt: 4 });
  });

  it("nicht vor Schritt 0 und nicht hinter den letzten Schritt", async () => {
    await mount(<Beamer anfang={sicht({ schritt: 0 })} beitrittAdresse={ADRESSE} />);
    await taste("ArrowLeft");
    expect(posts()).toHaveLength(0);
    await unmount();
    await mount(<Beamer anfang={sicht({ schritt: 24, phase: { art: "schluss" } })} beitrittAdresse={ADRESSE} />);
    await taste("ArrowRight");
    expect(posts()).toHaveLength(0);
  });

  it("nach einem Klick auf „Weiter“ blättern die Pfeiltasten weiter (Fokus auf dem Knopf)", async () => {
    await mount(<Beamer anfang={sicht({ schritt: 3 })} beitrittAdresse={ADRESSE} />);
    const weiter = document.querySelector<HTMLButtonElement>('button[aria-label="Weiter"]')!;
    await clickElement(weiter);
    weiter.focus();
    await act(async () => {
      weiter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await flush();
    expect(posts().map((p) => p.body)).toEqual([{ schritt: 4 }, { schritt: 5 }]);
    // Leertaste und Enter bleiben beim Knopf (sonst klickte er UND blätterte).
    await act(async () => {
      weiter.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      weiter.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(posts()).toHaveLength(2);
  });

  it("kleine Knöpfe zurück/weiter in der Ecke", async () => {
    await mount(<Beamer anfang={sicht({ schritt: 3 })} beitrittAdresse={ADRESSE} />);
    await clickElement(document.querySelector<HTMLButtonElement>('button[aria-label="Weiter"]')!);
    expect(posts().at(-1)?.body).toEqual({ schritt: 4 });
    await clickElement(document.querySelector<HTMLButtonElement>('button[aria-label="Zurück"]')!);
    expect(posts().at(-1)?.body).toEqual({ schritt: 3 });
  });

  it("nimmt allein im Browser keine `postMessage`-Steuerung an", async () => {
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 3 });
    expect(posts()).toHaveLength(0);
  });

  it("409 `tag_belegt`: klare Meldung statt einer Lobby", async () => {
    fetchMock.mockImplementation(() => antwortMit(409, { fehler: "tag_belegt" }));
    await mount(<Beamer anfang={vorStart()} beitrittAdresse={ADRESSE} />);
    await clickElement(knopf("Lobby öffnen")!);
    await flush();
    expect(text()).toContain("Der Dienstabend heute ist abgesagt. Das Quiz kann nicht starten.");
  });

  it("ein Schritt nach dem Beenden: Hinweis „Neue Runde gestartet“", async () => {
    await mount(
      <Beamer anfang={sicht({ phase: { art: "schluss" }, schritt: 24, beendet: true, beitrittCode: null })} beitrittAdresse={ADRESSE} />,
    );
    await taste("ArrowLeft");
    expect(text()).toContain("Neue Runde gestartet");
  });
});

describe("Beamer: im iframe (Slidev)", () => {
  it("`{ typ: \"iuk-quiz\", schritt: 3 }` → genau ein POST; dieselbe Nachricht noch einmal → keiner", async () => {
    alsIframe();
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 3 });
    expect(posts()).toEqual([{ url: "/beamer/geheim/schritt", body: { schritt: 3 } }]);
    await nachricht({ typ: "iuk-quiz", schritt: 3 });
    expect(posts()).toHaveLength(1);
    await nachricht({ typ: "iuk-quiz", schritt: 4 });
    expect(posts()).toHaveLength(2);
  });

  it("schickt keinen POST für den Schritt, den der Strom schon zeigt — außer vor dem Start", async () => {
    alsIframe();
    await mount(<Beamer anfang={vorStart()} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 0 });
    expect(posts()).toEqual([{ url: "/beamer/geheim/schritt", body: { schritt: 0 } }]);
    await letzteQuelle().sende(sicht({ schritt: 5 }));
    await nachricht({ typ: "iuk-quiz", schritt: 5 });
    expect(posts()).toHaveLength(1);
  });

  it("ein verspätetes Strom-Ereignis (älter als die Antwort auf den POST) setzt den Stand nicht zurück", async () => {
    alsIframe();
    fetchMock.mockImplementation(() => antwortMit(200, sicht({ schritt: 6, jetzt: 1_000_500 })));
    await mount(<Beamer anfang={sicht({ schritt: 3 })} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 6 });
    // Gelesen vor dem Schreiben von Schritt 6, aber erst danach angekommen.
    await letzteQuelle().sende(sicht({ schritt: 4, jetzt: 1_000_200 }));
    expect(elternPost).toHaveBeenLastCalledWith({ typ: "iuk-quiz-stand", schritt: 6, schrittAnzahl: 25 }, "*");
    await nachricht({ typ: "iuk-quiz", schritt: 6 });
    expect(posts()).toHaveLength(1);
  });

  it("nimmt Steuerung nur vom eigenen Parent an, nicht von anderen Fenstern", async () => {
    alsIframe();
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 3 }, { postMessage: () => {} });
    await nachricht({ typ: "iuk-quiz", schritt: 3 }, null);
    expect(posts()).toHaveLength(0);
    await nachricht({ typ: "iuk-quiz", schritt: 3 });
    expect(posts()).toHaveLength(1);
  });

  it("eine überholte Fehlerantwort zeigt keine Meldung über dem neueren Stand", async () => {
    alsIframe();
    let erste!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (erste = r)));
    fetchMock.mockImplementationOnce(() => antwortMit(200, sicht({ schritt: 4 })));
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 3 });
    await nachricht({ typ: "iuk-quiz", schritt: 4 });
    await act(async () => {
      erste(new Response(JSON.stringify({ fehler: "zu_viele" }), { status: 429 }));
    });
    await flush();
    expect(exists('[role="status"]')).toBe(false);
    // Der überholte Fehler gibt den Schritt auch nicht wieder frei: 4 geht nicht noch einmal hinaus.
    await nachricht({ typ: "iuk-quiz", schritt: 4 });
    expect(posts()).toHaveLength(2);
  });

  it("ignoriert fremde und kaputte Nachrichten", async () => {
    alsIframe();
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    for (const d of [{ typ: "anders", schritt: 1 }, { typ: "iuk-quiz", schritt: "2" }, { typ: "iuk-quiz", schritt: -1 }, { typ: "iuk-quiz", schritt: 1.5 }, "iuk-quiz", null]) {
      await nachricht(d);
    }
    expect(posts()).toHaveLength(0);
  });

  it("meldet dem Parent den Stand `{ typ: \"iuk-quiz-stand\", schritt, schrittAnzahl }`, nie das Secret", async () => {
    alsIframe();
    await mount(<Beamer anfang={sicht()} beitrittAdresse={ADRESSE} />);
    await nachricht({ typ: "iuk-quiz", schritt: 3 });
    expect(elternPost).toHaveBeenLastCalledWith({ typ: "iuk-quiz-stand", schritt: 3, schrittAnzahl: 25 }, "*");
    for (const [daten] of elternPost.mock.calls) expect(JSON.stringify(daten)).not.toContain("geheim");
  });

  it("keine Tastatur und keine Knöpfe außer „Quiz beenden“ im Schluss", async () => {
    alsIframe();
    await mount(<Beamer anfang={sicht({ schritt: 3 })} beitrittAdresse={ADRESSE} />);
    await taste("ArrowRight");
    expect(posts()).toHaveLength(0);
    expect(queryAll("button")).toHaveLength(0);
    await letzteQuelle().sende(sicht({ phase: { art: "schluss" }, schritt: 24, rangliste: [] }));
    expect(queryAll("button").map((b) => b.textContent)).toEqual(["Quiz beenden"]);
  });
});

describe("Beamer: Phasen", () => {
  it("`frage` mit `endetUm` zeigt den Countdown gegen die Serveruhr", async () => {
    vi.useFakeTimers({ now: 5_000_000, toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    // Serveruhr 1 000 000, Ende bei 1 014 000: noch 14 s, egal was die Geräteuhr sagt.
    await mount(<Beamer anfang={frage()} beitrittAdresse={ADRESSE} />);
    const ring = document.querySelector('[role="timer"]');
    expect(ring?.textContent).toBe("14");
    expect(ring?.getAttribute("aria-label")).toBe("noch 14 Sekunden");
    expect(text()).toContain("Was macht die Drohne?");
    expect(queryAll("[data-option]")).toHaveLength(4);
    expect(text()).toContain("12 Antworten von 31");
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(document.querySelector('[role="timer"]')?.textContent).toContain("Zeit");
    expect(text()).toContain("Abstimmung geschlossen");
  });

  it("`frage` ohne Zeitlimit hat keinen Ring", async () => {
    await mount(<Beamer anfang={frage({ phase: { art: "frage", index: 2, offen: true, endetUm: null } })} beitrittAdresse={ADRESSE} />);
    expect(exists('[role="timer"]')).toBe(false);
  });

  it("Auflösung: Prozent, ✓ an der richtigen Option, Erklärung", async () => {
    await mount(
      <Beamer
        anfang={sicht({
          phase: { art: "aufloesung", index: 2 },
          frage: { index: 2, anzahl: 8, text: "Was macht die Drohne?", typ: "einfach", optionen: OPTIONEN, antworten: 31, verteilung: [3, 21, 2, 5], richtig: [1], anteilRichtig: 21 / 31, erklaerung: "Weil RTH." },
        })}
        beitrittAdresse={ADRESSE}
      />,
    );
    expect(text()).toContain("68%");
    expect(text()).toContain("richtig, 21 von 31");
    expect(text()).toContain("Weil RTH.");
    const zeilen = queryAll("[data-option]");
    expect(zeilen.map((z) => z.hasAttribute("data-richtig"))).toEqual([false, true, false, false]);
  });

  it("Zwischenrangliste mit Bewegung", async () => {
    await mount(
      <Beamer
        anfang={sicht({
          phase: { art: "rangliste", nachIndex: 2 },
          rangliste: [
            { spitzname: "Funkfuchs", punkte: 2840, bewegung: 2 },
            { spitzname: "Kerstin_B", punkte: 2790, bewegung: -1 },
            { spitzname: "Pilot 7", punkte: 2455, bewegung: 0 },
            { spitzname: "Nordlicht", punkte: 2210, bewegung: "neu" },
          ],
        })}
        beitrittAdresse={ADRESSE}
      />,
    );
    expect(text()).toContain("Zwischenstand");
    expect(text()).toContain("Nach Frage 3 von 8");
    const zeilen = queryAll("li");
    expect(zeilen[0].textContent).toContain("2\u202f840");
    expect(zeilen.map((z) => z.querySelector("[data-bewegung]")?.getAttribute("aria-label"))).toEqual([
      "2 Plätze hoch",
      "1 Platz runter",
      "gleich",
      "neu",
    ]);
  });

  it("Schluss Lagebild: Kennzahlen und schwerste Frage, „Quiz beenden“ → POST beenden", async () => {
    fetchMock.mockImplementation(() => antwortMit(200, { ok: true }));
    await mount(
      <Beamer
        anfang={sicht({
          modus: "lagebild",
          phase: { art: "schluss" },
          schritt: 17,
          gesamt: { teilnehmende: 31, antworten: 214, anteilRichtig: 0.74, schwersteFrage: { index: 4, text: "Wer meldet?", anteilRichtig: 0.38 } },
        })}
        beitrittAdresse={ADRESSE}
      />,
    );
    expect(text()).toContain("So steht die Gruppe");
    expect(text()).toContain("8 Fragen, 214 Antworten");
    expect(text()).toContain("Frage 5: Wer meldet?");
    expect(text()).toContain("38 %");
    // Zwei Tipps: der erste fragt nach, erst der zweite beendet (kein Dialog, kein Fokusklau).
    await clickElement(knopf("Quiz beenden")!);
    await flush();
    expect(posts()).toEqual([]);
    expect(knopf("Wirklich beenden?")).toBeDefined();
    await clickElement(knopf("Wirklich beenden?")!);
    await flush();
    expect(posts()).toEqual([{ url: "/beamer/geheim/beenden", body: null }]);
  });

  it("„Wirklich beenden?“ fällt nach ein paar Sekunden zurück", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await mount(<Beamer anfang={sicht({ phase: { art: "schluss" }, schritt: 24, rangliste: [] })} beitrittAdresse={ADRESSE} />);
    await clickElement(knopf("Quiz beenden")!);
    expect(knopf("Wirklich beenden?")).toBeDefined();
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });
    expect(knopf("Quiz beenden")).toBeDefined();
    expect(knopf("Wirklich")).toBeUndefined();
    expect(posts()).toEqual([]);
  });

  it("Schluss Wettbewerb: Podest 2–1–3 und „Quiz beenden“", async () => {
    await mount(
      <Beamer
        anfang={sicht({
          phase: { art: "schluss" },
          schritt: 24,
          rangliste: ["Funkfuchs", "Kerstin_B", "Hummel", "Pilot 7", "Nordlicht"].map((spitzname, i) => ({ spitzname, punkte: 7000 - i * 100 })),
        })}
        beitrittAdresse={ADRESSE}
      />,
    );
    expect(queryAll("[data-podest]").map((e) => e.getAttribute("data-podest"))).toEqual(["2", "1", "3"]);
    expect(text()).toContain("Pilot 7");
    expect(knopf("Quiz beenden")).toBeDefined();
  });

  it("rendert auf dem Server ohne Fenster (RSC-Vorab-HTML)", () => {
    expect(renderToStaticMarkup(<Beamer anfang={frage()} beitrittAdresse={ADRESSE} />)).toContain("Was macht die Drohne?");
  });
});

describe("Beamer: lange Texte (nie kürzen, kleiner setzen)", () => {
  const lang = (n: number, z = "Wort ") => z.repeat(Math.ceil(n / z.length)).slice(0, n);
  const sechs = Array.from({ length: 6 }, (_, i) => lang(120, `Option${i} `));

  it("Frage: der längste gültige Fragetext und sechs lange Optionen bekommen die kleinste Stufe", async () => {
    await mount(
      <Beamer
        anfang={frage({ frage: { index: 0, anzahl: 8, text: lang(300), typ: "einfach", optionen: sechs, antworten: 0, zeitS: 30 } })}
        beitrittAdresse={ADRESSE}
      />,
    );
    expect(document.querySelector("h1")?.getAttribute("data-stufe")).toBe("3");
    expect(document.querySelector("[data-kacheln]")?.getAttribute("data-stufe")).toBe("2");
    // Der Text steht vollständig im DOM.
    expect(text()).toContain(sechs[5]);
  });

  it("kurze Texte behalten die Mockup-Größe", async () => {
    await mount(<Beamer anfang={frage()} beitrittAdresse={ADRESSE} />);
    expect(document.querySelector("h1")?.getAttribute("data-stufe")).toBe("0");
    expect(document.querySelector("[data-kacheln]")?.getAttribute("data-stufe")).toBe("0");
  });

  it("Auflösung: Frage, Optionen und Erklärung werden gestuft", async () => {
    await mount(
      <Beamer
        anfang={sicht({
          phase: { art: "aufloesung", index: 0 },
          frage: { index: 0, anzahl: 8, text: lang(300), typ: "einfach", optionen: sechs, antworten: 6, verteilung: [1, 1, 1, 1, 1, 1], richtig: [0], anteilRichtig: 1 / 6, erklaerung: lang(400) },
        })}
        beitrittAdresse={ADRESSE}
      />,
    );
    expect(document.querySelector("h1")?.getAttribute("data-stufe")).toBe("2");
    expect(document.querySelector("[data-balken]")?.getAttribute("data-stufe")).toBe("2");
    expect(document.querySelector("[data-erklaerung]")?.getAttribute("data-stufe")).toBe("2");
  });

  it("vor dem Start: ein langer Titel wird kleiner", async () => {
    await mount(<Beamer anfang={sicht({ phase: { art: "vorStart" }, titel: lang(120) })} beitrittAdresse={ADRESSE} />);
    expect(document.querySelector("h1")?.getAttribute("data-stufe")).toBe("2");
  });
});

describe("beamer.module.css", () => {
  const css = readFileSync(join(__dirname, "beamer.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("kürzt und beschneidet keinen Text: kein nowrap, keine Ellipse, `overflow: hidden` nur an Bühne und Balkenspur", () => {
    const regeln = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
    expect(css).not.toMatch(/text-overflow|nowrap|line-clamp/);
    const erlaubt = new Set([".seite", ".buehne", ".balkenSpur"]);
    const beschneidend = regeln.filter((r) => /overflow\s*:\s*(hidden|clip)/.test(r.body)).map((r) => r.sel);
    expect(beschneidend.filter((sel) => !erlaubt.has(sel))).toEqual([]);
    for (const sel of [".kachelText", ".optText", ".erkl", ".frageText", ".auflFrage"]) {
      const regel = regeln.find((r) => r.sel.split(",").map((x) => x.trim()).includes(sel));
      expect(regel?.body, sel).toMatch(/overflow-wrap:\s*anywhere/);
    }
  });

  it("kennt kein antd, keine `--ant-*`, kein `prefers-color-scheme`", () => {
    expect(css).not.toMatch(/--ant-|\.ant-/);
    expect(css).not.toContain("prefers-color-scheme");
  });
  it("misst in `cqh` (gleiche Komposition im Slidev-iframe und im Vollbild)", () => {
    expect(css).toContain("container-type: size");
    expect(css.match(/\d(\.\d+)?cqh/g)!.length).toBeGreaterThan(50);
  });
  it("kein Suite-Rot außer über `--qz-marke`", () => {
    expect(css).not.toMatch(/#c8000f/i);
  });
  it("Bewegung nur ohne `prefers-reduced-motion`", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
  it("die Beamer-Komponente importiert kein antd", () => {
    expect(readFileSync(join(__dirname, "Beamer.tsx"), "utf8")).not.toMatch(/from "antd"/);
  });
});
