// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { clickElement, fill, mount, queryAll, unmount, exists } from "@/app/m/qr/_lib/test-dom";
import type { HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { Handy } from "./Handy";

/**
 * Die Handy-Ansicht des Live-Quiz (`docs/design/feedback-live-quiz.md`, Mockup
 * `docs/design/mockups/live-quiz.html`). Der Strom ist eine nachgebaute `EventSource`, die
 * POSTs ein gemocktes `fetch`; geprüft werden Wortlaute, gesendete Bodies und Übergänge.
 */

class FalscheQuelle {
  static alle: FalscheQuelle[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = 0;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  private hoerer = new Map<string, ((e: MessageEvent) => void)[]>();
  constructor(readonly url: string) {
    FalscheQuelle.alle.push(this);
  }
  addEventListener(art: string, f: (e: MessageEvent) => void) {
    this.hoerer.set(art, [...(this.hoerer.get(art) ?? []), f]);
  }
  removeEventListener() {}
  close() {
    this.readyState = 2;
  }
  async sende(sicht: HandySicht) {
    await act(async () => {
      this.readyState = 1;
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(sicht) }));
    });
  }
  async ende() {
    await act(async () => {
      for (const f of this.hoerer.get("ende") ?? []) f(new MessageEvent("ende", { data: "" }));
    });
  }
  async fehler(geschlossen: boolean) {
    await act(async () => {
      this.readyState = geschlossen ? 2 : 0;
      this.onerror?.(new Event("error"));
    });
  }
}

const letzteQuelle = () => FalscheQuelle.alle[FalscheQuelle.alle.length - 1];

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const antwortMit = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  FalscheQuelle.alle = [];
  vi.stubGlobal("EventSource", FalscheQuelle);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/q/ABC234");
});
afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const OPTIONEN = ["Sie landet sofort", "Sie fliegt zum Startpunkt", "Sie schwebt", "Sie fliegt zum Handy"];

function sicht(extra: Partial<HandySicht> = {}): HandySicht {
  return {
    titel: "Notfallverfahren UAV",
    modus: "wettbewerb",
    phase: { art: "frage", index: 2, offen: true, endetUm: null },
    jetzt: 1_000_000,
    dabei: true,
    fragenAnzahl: 8,
    spitzname: "Hummel",
    frage: { index: 2, text: "Was macht die Drohne?", typ: "einfach", optionen: OPTIONEN },
    beendet: false,
    ...extra,
  };
}

const kacheln = () => queryAll<HTMLButtonElement>("button[data-option]");
const text = () => document.body.textContent ?? "";
const flush = () => act(async () => {});

describe("Handy: Frage", () => {
  it("rendert bei `frage einfach` vier Knöpfe mit Form-Symbol und Text", async () => {
    await mount(<Handy anfang={sicht()} />);
    expect(kacheln()).toHaveLength(4);
    kacheln().forEach((k, i) => {
      expect(k.querySelector("[data-form]")).not.toBeNull();
      expect(k.textContent).toContain(OPTIONEN[i]);
    });
    expect(text()).toContain("Frage 3 von 8");
    expect(text()).toContain("Tipp eine Antwort an");
  });

  it("öffnet den Strom relativ zur Seite", async () => {
    await mount(<Handy anfang={sicht()} />);
    expect(letzteQuelle().url).toBe("/q/ABC234/strom");
  });

  it("ein Tipp sendet `{ frageIndex, gewaehlt: [i] }` und zeigt „Antwort ist da“", async () => {
    fetchMock.mockReturnValue(antwortMit(200, { ok: true }));
    await mount(<Handy anfang={sicht()} />);
    await clickElement(kacheln()[1]);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/q/ABC234/antwort");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ frageIndex: 2, gewaehlt: [1] });
    expect(text()).toContain("Antwort ist da");
    expect(text()).toContain("Sie fliegt zum Startpunkt");
  });

  it("bei 409 `geschlossen` erscheint „Zeit ist um“ statt eines Fehlers", async () => {
    fetchMock.mockReturnValue(antwortMit(409, { fehler: "geschlossen" }));
    await mount(<Handy anfang={sicht()} />);
    await clickElement(kacheln()[0]);
    await flush();
    expect(text()).toContain("Zeit ist um");
    expect(kacheln()).toHaveLength(0);
  });

  it("bei 409 `doppelt` gilt die Antwort als da", async () => {
    fetchMock.mockReturnValue(antwortMit(409, { fehler: "doppelt" }));
    await mount(<Handy anfang={sicht()} />);
    await clickElement(kacheln()[3]);
    await flush();
    expect(text()).toContain("Antwort ist da");
  });

  it("Mehrfachauswahl sendet erst mit „Absenden“, mit allen gewählten Optionen", async () => {
    fetchMock.mockReturnValue(antwortMit(200, { ok: true }));
    const frage = { index: 5, text: "Welche Call-outs?", typ: "mehrfach" as const, optionen: OPTIONEN };
    await mount(<Handy anfang={sicht({ phase: { art: "frage", index: 5, offen: true, endetUm: null }, frage })} />);
    const absenden = () => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === "Absenden")!;
    expect(absenden().disabled).toBe(true);
    await clickElement(kacheln()[2]);
    await clickElement(kacheln()[0]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(kacheln()[0].getAttribute("aria-pressed")).toBe("true");
    expect(text()).toContain("2 gewählt");
    await clickElement(absenden());
    await flush();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ frageIndex: 5, gewaehlt: [0, 2] });
    expect(text()).toContain("Antwort ist da");
  });

  it("zeigt die Restzeit gegen die Serveruhr, nicht gegen die Gerätezeit", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9_000_000_000); // Gerät geht völlig falsch
    await mount(
      <Handy anfang={sicht({ jetzt: 1_000_000, phase: { art: "frage", index: 2, offen: true, endetUm: 1_014_000 } })} />,
    );
    expect(text()).toContain("noch 14 s");
  });

  it("zeigt „Zeit ist um“, wenn die Frage zu ist und keine Antwort kam", async () => {
    await mount(<Handy anfang={sicht({ phase: { art: "frage", index: 2, offen: false, endetUm: 1 } })} />);
    expect(text()).toContain("Zeit ist um");
    expect(kacheln()).toHaveLength(0);
  });
});

describe("Handy: Beitritt", () => {
  it("im Wettbewerb ohne Teilnahme erscheint das Spitzname-Feld", async () => {
    await mount(<Handy anfang={sicht({ dabei: false, spitzname: undefined, phase: { art: "lobby" }, frage: undefined })} />);
    expect(exists("input[name=spitzname]")).toBe(true);
    expect(text()).toContain("Dein Spitzname");
    expect(text()).toContain("Wettbewerb");
  });

  it("im Lagebild ein Knopf „Mitmachen“ und die Zusage „Anonym — kein Name, keine Uhrzeit.“", async () => {
    await mount(
      <Handy anfang={sicht({ modus: "lagebild", dabei: false, spitzname: undefined, phase: { art: "lobby" }, frage: undefined })} />,
    );
    expect(exists("input[name=spitzname]")).toBe(false);
    expect(queryAll("button").some((b) => b.textContent === "Mitmachen")).toBe(true);
    expect(text()).toContain("Anonym — kein Name, keine Uhrzeit.");
  });

  it("nach dem Beitritt verbindet der Strom neu (das Cookie zählt erst beim Verbinden)", async () => {
    fetchMock.mockReturnValue(antwortMit(200, { ok: true }));
    await mount(<Handy anfang={sicht({ dabei: false, spitzname: undefined, phase: { art: "lobby" }, frage: undefined })} />);
    const erste = letzteQuelle();
    await fill("input[name=spitzname]", "Hummel");
    await clickElement(queryAll<HTMLButtonElement>("button").find((b) => b.textContent === "Mitmachen")!);
    await flush();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/q/ABC234/beitritt");
    expect(JSON.parse(String(init?.body))).toEqual({ spitzname: "Hummel" });
    expect(erste.readyState).toBe(FalscheQuelle.CLOSED);
    expect(FalscheQuelle.alle).toHaveLength(2);
    await letzteQuelle().sende(sicht({ phase: { art: "lobby" }, frage: undefined }));
    expect(text()).toContain("Du bist dabei.");
  });

  it("ein vergebener Spitzname wird gesagt, das Feld bleibt", async () => {
    fetchMock.mockReturnValue(antwortMit(409, { fehler: "spitzname_vergeben" }));
    await mount(<Handy anfang={sicht({ dabei: false, spitzname: undefined, phase: { art: "lobby" }, frage: undefined })} />);
    await fill("input[name=spitzname]", "Hummel");
    await clickElement(queryAll<HTMLButtonElement>("button").find((b) => b.textContent === "Mitmachen")!);
    await flush();
    expect(text()).toContain("Den Spitznamen hat schon jemand.");
    expect(exists("input[name=spitzname]")).toBe(true);
    expect(FalscheQuelle.alle).toHaveLength(1);
  });
});

describe("Handy: Strom", () => {
  it("folgt dem Strom ohne Neuladen: Lobby → Frage → Auflösung", async () => {
    await mount(<Handy anfang={sicht({ phase: { art: "lobby" }, frage: undefined })} />);
    expect(text()).toContain("Du bist dabei.");
    await letzteQuelle().sende(sicht());
    expect(kacheln()).toHaveLength(4);
    await letzteQuelle().sende(
      sicht({
        phase: { art: "aufloesung", index: 2 },
        eigeneAntwort: [1],
        richtig: [1],
        eigenesErgebnis: { richtig: true, punkte: 812 },
        platz: 3,
        teilnehmende: 31,
        punkteGesamt: 2455,
      }),
    );
    expect(text()).toContain("Richtig.");
    expect(text()).toContain("+812");
    expect(text()).toContain("Platz von 31");
    expect(text()).toContain("Deine Antwort");
  });

  it("Auflösung daneben: die richtige Antwort steht zuerst, kein Rot", async () => {
    await mount(
      <Handy
        anfang={sicht({
          phase: { art: "aufloesung", index: 2 },
          eigeneAntwort: [3],
          richtig: [1],
          eigenesErgebnis: { richtig: false, punkte: 0 },
          platz: 7,
          teilnehmende: 31,
          punkteGesamt: 1643,
        })}
      />,
    );
    expect(text()).toContain("Daneben.");
    const t = text();
    expect(t.indexOf("Richtig war")).toBeLessThan(t.indexOf("Deine Antwort"));
  });

  it("Lagebild-Auflösung zeigt weder Punkte noch Platz", async () => {
    await mount(
      <Handy
        anfang={sicht({
          modus: "lagebild",
          spitzname: undefined,
          phase: { art: "aufloesung", index: 2 },
          eigeneAntwort: [1],
          richtig: [1],
          eigenesErgebnis: { richtig: true, punkte: 1000 },
        })}
      />,
    );
    expect(text()).toContain("Richtig.");
    expect(text()).not.toContain("Punkte");
    expect(text()).not.toContain("Platz");
  });

  it("nach kurzem WLAN-Verlust zeigt die neue Sicht „Antwort ist da“, ohne zweiten Beitritt", async () => {
    await mount(<Handy anfang={sicht()} />);
    const quelle = letzteQuelle();
    await quelle.fehler(false); // EventSource verbindet selbst neu
    await quelle.sende(sicht({ eigeneAntwort: [1] }));
    expect(text()).toContain("Antwort ist da");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ist der Strom ganz zu, verbindet das Handy nach einer Pause selbst neu", async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(antwortMit(200, {}));
    await mount(<Handy anfang={sicht()} />);
    await letzteQuelle().fehler(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(FalscheQuelle.alle.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).endsWith("/beitritt"))).toBe(true);
  });

  it("`event: ende` zeigt „Das Quiz ist beendet.“ mit den letzten eigenen Werten", async () => {
    await mount(<Handy anfang={sicht({ phase: { art: "schluss" }, frage: undefined, platz: 3, teilnehmende: 31, punkteGesamt: 6480 })} />);
    await letzteQuelle().ende();
    expect(text()).toContain("Das Quiz ist beendet.");
    expect(text()).toContain("Platz von 31");
    expect(letzteQuelle().readyState).toBe(FalscheQuelle.CLOSED);
  });

  it("ohne Runde (unbekannter oder beendeter Code): „Das Quiz ist beendet.“, kein Strom", async () => {
    await mount(<Handy anfang={null} />);
    expect(text()).toContain("Das Quiz ist beendet.");
    expect(text()).not.toContain("Platz");
    expect(FalscheQuelle.alle).toHaveLength(0);
  });

  it("rendert ohne JavaScript schon den Stand (Server-HTML)", () => {
    expect(renderToStaticMarkup(<Handy anfang={null} />)).toContain("Das Quiz ist beendet.");
    expect(renderToStaticMarkup(<Handy anfang={sicht()} />)).toContain("Was macht die Drohne?");
  });
});

describe("handy.module.css", () => {
  // Ohne Kommentare: die nennen die verbotenen Wege absichtlich beim Namen.
  const css = readFileSync(join(__dirname, "handy.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("kennt kein antd und keine `--ant-*`-Variablen (Falle 2)", () => {
    expect(css).not.toMatch(/--ant-|\.ant-/);
  });
  it("kennt kein `prefers-color-scheme`; Farben und Dunkel kommen aus `_quiz/zeichen.module.css`", () => {
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it("Suite-Rot nur für die Fahne (über `--qz-marke`)", () => {
    expect(css).not.toMatch(/#c8000f/i);
  });
  it("Bewegung nur ohne `prefers-reduced-motion`", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
  it("die Handy-Komponente selbst importiert kein antd", () => {
    const quelle = readFileSync(join(__dirname, "Handy.tsx"), "utf8");
    expect(quelle).not.toMatch(/from "antd"/);
  });
});
