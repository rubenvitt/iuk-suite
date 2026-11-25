// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { clickElement, fill, mount, queryAll, unmount, exists } from "@/app/m/qr/_lib/test-dom";
import type { HandySicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { Handy } from "./Handy";
import h from "./handy.module.css";
import zeichen from "@/app/m/feedback/_quiz/zeichen.module.css";

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

/** Die (gehashten) Klassennamen, deren Regeln Suite-Rot tragen: `--qz-marke`, `--qz-wortzeichen`, #c8000f. */
function rotKlassen(): Set<string> {
  const rot = new Set<string>();
  for (const [datei, modul] of [
    ["handy.module.css", h],
    [join(__dirname, "../../_quiz/zeichen.module.css"), zeichen],
  ] as const) {
    const css = readFileSync(datei.includes("/") ? datei : join(__dirname, datei), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/var\(--qz-(marke|wortzeichen)\)|#c8000f|#e45a66/i.test(body)) continue;
      for (const [, name] of sel.matchAll(/\.([A-Za-z][\w-]*)/g)) {
        const k = (modul as Record<string, string>)[name];
        // `.zeichen` setzt die Variablen nur (Definition, keine Farbe), `.seite` trägt die Fahne als ::before.
        if (k && name !== "zeichen" && name !== "seite") rot.add(k);
      }
    }
  }
  return rot;
}

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
    // KEIN ROT: keine Klasse im Ergebnis trägt eine Regel mit Suite-Rot (`--qz-marke`, auch über
    // `--qz-wortzeichen`), und kein Element hat eine eigene Farbe im `style`.
    const rot = rotKlassen();
    expect(rot.size).toBeGreaterThan(0); // der Wächter sieht die Fahne und das Wortzeichen
    const inhalt = [...document.querySelectorAll("main, main *")];
    expect(inhalt.length).toBeGreaterThan(5);
    const treffer = inhalt.flatMap((el) => [...el.classList].filter((k) => rot.has(k)));
    expect(treffer).toEqual([]);
    expect(inhalt.filter((el) => el.getAttribute("style")?.match(/color|background/))).toEqual([]);
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

describe("Handy: Verbindung", () => {
  const pruefOk = () => fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
  const warte = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("verbindet nach CLOSED gestaffelt neu (3 → 6 → 12 → 30 s) und setzt mit der ersten Nachricht zurück", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // ohne Streuung
    pruefOk();
    await mount(<Handy anfang={sicht()} />);
    const abstaende: number[] = [];
    for (let i = 0; i < 5; i++) {
      const vorher = FalscheQuelle.alle.length;
      await letzteQuelle().fehler(true);
      let ms = 0;
      while (FalscheQuelle.alle.length === vorher && ms < 60_000) {
        await warte(100);
        ms += 100;
      }
      abstaende.push(ms);
    }
    expect(abstaende).toEqual([3000, 6000, 12000, 30000, 30000]);
    await letzteQuelle().sende(sicht());
    await letzteQuelle().fehler(true);
    await warte(2900);
    const vorher = FalscheQuelle.alle.length;
    await warte(100);
    expect(FalscheQuelle.alle.length).toBe(vorher + 1);
  });

  it("streut die Pause um ±30 %", async () => {
    vi.useFakeTimers();
    const zufall = vi.spyOn(Math, "random").mockReturnValue(0);
    pruefOk();
    await mount(<Handy anfang={sicht()} />);
    await letzteQuelle().fehler(true);
    await warte(2099);
    expect(FalscheQuelle.alle).toHaveLength(1);
    await warte(1);
    expect(FalscheQuelle.alle).toHaveLength(2);
    zufall.mockReturnValue(1);
    await letzteQuelle().sende(sicht()); // zurück auf die erste Stufe
    await letzteQuelle().fehler(true);
    await warte(3899);
    expect(FalscheQuelle.alle).toHaveLength(2);
    await warte(1);
    expect(FalscheQuelle.alle).toHaveLength(3);
  });

  it("die Probe „gibt es die Runde noch?“ abonniert keinen Strom (`?pruefen=1`); 404 → beendet", async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(antwortMit(404, { fehler: "unbekannt" }));
    await mount(<Handy anfang={sicht()} />);
    await letzteQuelle().fehler(true);
    await warte(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/q/ABC234/strom?pruefen=1");
    expect(new Headers(init?.headers).get("accept")).not.toBe("text/event-stream");
    expect(FalscheQuelle.alle).toHaveLength(1);
    expect(text()).toContain("Das Quiz ist beendet.");
  });

  it("zwei Tipps im selben Takt senden nur einen POST", async () => {
    let fertig: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (fertig = r)));
    await mount(<Handy anfang={sicht()} />);
    const [a, b] = kacheln();
    await act(async () => {
      a.click();
      b.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => fertig(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect(text()).toContain("Antwort ist da");
  });

  it("nach dem Beitritt zählt der alte Strom nicht mehr: seine Nachricht setzt „dabei“ nicht zurück", async () => {
    fetchMock.mockReturnValue(antwortMit(200, { ok: true }));
    await mount(<Handy anfang={sicht({ dabei: false, spitzname: undefined, phase: { art: "lobby" }, frage: undefined })} />);
    const alt = letzteQuelle();
    await fill("input[name=spitzname]", "Hummel");
    await clickElement(queryAll<HTMLButtonElement>("button").find((b) => b.textContent === "Mitmachen")!);
    await flush();
    expect(text()).toContain("Du bist dabei.");
    // Der alte Strom liefert noch einen Stand ohne Teilnahme nach.
    await alt.sende(sicht({ dabei: false, spitzname: undefined, phase: { art: "lobby" }, frage: undefined }));
    expect(text()).toContain("Du bist dabei.");
    expect(exists("input[name=spitzname]")).toBe(false);
    // Der neue Strom zählt.
    await letzteQuelle().sende(sicht({ phase: { art: "lobby" }, frage: undefined }));
    expect(text()).toContain("Hummel");
  });
});

describe("Handy: Ansage und Fokus", () => {
  const region = () => document.querySelector<HTMLElement>('[aria-live="polite"]');

  it("hat eine dauerhafte, anfangs leere Live-Region", async () => {
    await mount(<Handy anfang={sicht()} />);
    expect(region()).not.toBeNull();
    expect(region()!.textContent).toBe("");
    expect(renderToStaticMarkup(<Handy anfang={sicht()} />)).toMatch(/<div[^>]*aria-live="polite"[^>]*><\/div>/);
  });

  it("sagt beim Phasenwechsel nur den kurzen Ort an; die Überschrift kommt über den Fokus, nicht doppelt", async () => {
    await mount(<Handy anfang={sicht({ phase: { art: "lobby" }, frage: undefined })} />);
    const r = region();
    await letzteQuelle().sende(sicht());
    expect(region()).toBe(r); // dieselbe Region, nicht neu eingehängt
    expect(r!.textContent).toBe("Frage 3 von 8");
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("Was macht die Drohne?");
    await letzteQuelle().sende(
      sicht({ phase: { art: "aufloesung", index: 2 }, eigeneAntwort: [3], richtig: [1], eigenesErgebnis: { richtig: false, punkte: 0 } }),
    );
    expect(r!.textContent).toBe("Auflösung");
    expect(document.activeElement?.textContent).toBe("Daneben.");
    await letzteQuelle().ende();
    expect(r!.textContent).toBe("Ergebnis");
    expect(document.activeElement?.tagName).toBe("H1");
    // Die Region wiederholt die fokussierte Überschrift nie.
    expect(r!.textContent).not.toContain(document.activeElement!.textContent!);
  });

  it("derselbe Stand noch einmal sagt nichts an und nimmt keinen Fokus", async () => {
    await mount(<Handy anfang={sicht()} />);
    await letzteQuelle().sende(sicht());
    expect(region()!.textContent).toBe("");
    expect(document.activeElement).toBe(document.body);
  });

  it("„Richtig.“, „Daneben.“ und „Keine Antwort.“ sind die Überschrift der Auflösung", async () => {
    for (const [ergebnis, wort] of [
      [{ richtig: true, punkte: 900 }, "Richtig."],
      [{ richtig: false, punkte: 0 }, "Daneben."],
      [undefined, "Keine Antwort."],
    ] as const) {
      await mount(
        <Handy anfang={sicht({ phase: { art: "aufloesung", index: 2 }, richtig: [1], eigenesErgebnis: ergebnis })} />,
      );
      const h1 = queryAll("h1");
      expect(h1.map((e) => e.textContent)).toEqual([wort]);
      await unmount();
    }
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
  it("kürzt und beschneidet keinen Text an Kacheln, Frage und Antworten; nur der Kopf darf kürzen", () => {
    const regeln = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
    // Ausnahmen: `.kopfTitel` (Quiztitel in der Kopfzeile, Ellipse erlaubt), `.rechts` (Restzeit oder
    // Spitzname ≤ 20 Zeichen, bricht nicht um) und `.ansage` (unsichtbare Live-Region).
    const erlaubt = new Set([".kopfTitel", ".rechts", ".ansage"]);
    const kuerzend = regeln
      .filter((r) => /text-overflow|nowrap|line-clamp|overflow(-x|-y)?\s*:\s*(hidden|clip)/.test(r.body))
      .map((r) => r.sel);
    expect(kuerzend.filter((sel) => !erlaubt.has(sel))).toEqual([]);
    for (const sel of [".kachel", ".frage", ".gewaehlt"]) {
      const regel = regeln.find((r) => r.sel.split(",").map((x) => x.trim()).includes(sel));
      expect(regel?.body, sel).toMatch(/overflow-wrap:\s*anywhere/);
    }
  });
  it("der Wächter greift: nowrap an einer Kachel fiele auf", () => {
    const boese = ".kachel { white-space: nowrap; } .frage { overflow-y: hidden; }";
    const treffer = [...boese.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) =>
      /text-overflow|nowrap|line-clamp|overflow(-x|-y)?\s*:\s*(hidden|clip)/.test(m[2]),
    );
    expect(treffer).toHaveLength(2);
  });
  it("Bewegung nur ohne `prefers-reduced-motion`", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
  it("die Handy-Komponente selbst importiert kein antd", () => {
    const quelle = readFileSync(join(__dirname, "Handy.tsx"), "utf8");
    expect(quelle).not.toMatch(/from "antd"/);
  });
});
