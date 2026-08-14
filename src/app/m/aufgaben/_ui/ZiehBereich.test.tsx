// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

/*
 * DIE GRENZE DIESES TESTS (Brief, Aufgabe 20): "Ziehen ist die eine Bedienart, die ein jsdom-Test
 * strukturell nicht beweisen kann" — hier gibt es kein echtes Zeigergeraet und keine echte
 * Ereigniskette. Was HIER geprueft wird, ist deshalb zweigeteilt:
 *
 *  1. `zielAusAblage` — eine REINE Funktion ohne DOM, vollstaendig pruefbar.
 *  2. Die DOM-Verdrahtung (`onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`) mit HANDGEBAUTEN
 *     `dragstart`/`dragover`/`drop`-Ereignissen (ein `Event` mit einer angehefteten `dataTransfer`-
 *     Attrappe) — das beweist, dass die Verdrahtung bei einer Ereigniskette die RICHTIGE Action mit
 *     den richtigen Feldern ruft, NICHT, dass ein echtes Zeigergeraet in jedem Browser genau diese
 *     Kette ausloest. LETZTERES ist ausschliesslich `e2e/aufgaben.spec.ts`s Sache (`dragTo()`,
 *     Viewport > 768px) — der eigentliche Nachweis, kein Zusatz (Brief).
 */

const { einplanenActionMock, rangVerschiebenActionMock } = vi.hoisted(() => ({
  // Parameter EXPLIZIT getippt (auch wenn ungenutzt): sonst leitet Vitest die Aufrufsignatur aus
  // der Implementierung ab (nullstellig), und `mock.calls[0]` traegt dann ein leeres Tupel ohne
  // Indizes — `pnpm typecheck` lehnt den Zugriff auf `calls[0]![0]`/`[1]` weiter unten dann ab.
  einplanenActionMock: vi.fn(async (_prev: unknown, _formData: FormData) => ({ ok: true }) as const),
  rangVerschiebenActionMock: vi.fn(async (_formData: FormData) => undefined),
}));

vi.mock("../actions", () => ({
  einplanenAction: einplanenActionMock,
  rangVerschiebenAction: rangVerschiebenActionMock,
}));

const { ZiehBereich, zielAusAblage } = await import("./ZiehBereich");

afterEach(async () => {
  await unmount();
  einplanenActionMock.mockClear();
  rangVerschiebenActionMock.mockClear();
});

describe("ZiehBereich — Zeile 1", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/ZiehBereich.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("importiert kein @ant-design/icons", () => {
    // Nur die IMPORT-ZEILEN, nicht die Rohdatei: der Kopfkommentar nennt die verbotene
    // Spezifiziererzeichenfolge ausdruecklich als Begruendung (dieselbe Falle wie bei
    // `aufgaben-css.test.ts`s Verbotsliste — ein Scan der Rohdatei schluege am eigenen Kommentar an).
    const quelle = readFileSync("src/app/m/aufgaben/_ui/ZiehBereich.tsx", "utf8");
    const spezifizierer = [...quelle.matchAll(/\bimport\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    expect(spezifizierer).not.toContain("@ant-design/icons");
  });
});

/*
 * DIE REINE ABBILDUNG — KEIN DOM, KEIN NETZWERK. Der Brief verlangt "benutz die Rang-Action aus
 * Aufgabe 12, statt eine zweite Rangberechnung im Browser aufzumachen": diese Funktion IST diese
 * eine erlaubte Abbildung, nicht eine Rangberechnung — sie liefert ausschliesslich "wie viele
 * hoch/runter-Schritte", nie einen neuen `planRang`-Wert.
 */
describe("zielAusAblage — reine Abbildung Ablageort → Wirkung", () => {
  it("ein anderer Zieltag ist immer ein Tageswechsel, unabhaengig von den Indizes", () => {
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "b", quellIndex: 3, zielIndex: 0, anzahlZielTag: 5 }),
    ).toEqual({ art: "tag", planDatum: "b" });
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "b", quellIndex: 0, zielIndex: null, anzahlZielTag: 1 }),
    ).toEqual({ art: "tag", planDatum: "b" });
  });

  it("derselbe Tag, Ziel weiter hinten: richtung runter, schritte = Differenz", () => {
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "a", quellIndex: 0, zielIndex: 3, anzahlZielTag: 5 }),
    ).toEqual({ art: "rang", richtung: "runter", schritte: 3 });
  });

  it("derselbe Tag, Ziel weiter vorne: richtung hoch, schritte = Differenz", () => {
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "a", quellIndex: 4, zielIndex: 1, anzahlZielTag: 5 }),
    ).toEqual({ art: "rang", richtung: "hoch", schritte: 3 });
  });

  it("derselbe Tag, keine getroffene Zeile (leere Flaeche): ans Ende des Tages", () => {
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "a", quellIndex: 0, zielIndex: null, anzahlZielTag: 4 }),
    ).toEqual({ art: "rang", richtung: "runter", schritte: 3 });
  });

  it("derselbe Tag, dieselbe Position: kein Zug (null)", () => {
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "a", quellIndex: 2, zielIndex: 2, anzahlZielTag: 5 }),
    ).toBeNull();
  });

  it("derselbe Tag, leere Flaeche, Quelle ist bereits die letzte Position: kein Zug (null)", () => {
    expect(
      zielAusAblage({ quellTag: "a", zielTag: "a", quellIndex: 4, zielIndex: null, anzahlZielTag: 5 }),
    ).toBeNull();
  });
});

/**
 * Ein `dragstart`/`dragover`/`drop`-Ereignis mit einer `dataTransfer`-Attrappe (jsdom kennt
 * `DataTransfer` nicht vollstaendig) — das Muster, mit dem HTML5-Drag-and-Drop in jsdom ueberhaupt
 * simulierbar ist. React liest `nativeEvent.target`/`.dataTransfer` beim Aufbau des
 * SyntheticEvent, `dispatchEvent` setzt `target` selbst korrekt.
 */
function zugEreignis(typ: string): Event {
  const ereignis = new Event(typ, { bubbles: true, cancelable: true });
  Object.defineProperty(ereignis, "dataTransfer", {
    configurable: true,
    value: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
  });
  return ereignis;
}

const KINDER = (
  <>
    <div data-tag="2026-08-17">
      <span data-aufgabe-id="a1" data-plan-index="0" data-plan-uhrzeit="" draggable>
        a1
      </span>
      <span data-aufgabe-id="a2" data-plan-index="1" data-plan-uhrzeit="" draggable>
        a2
      </span>
    </div>
    <div data-tag="2026-08-18">
      <span data-aufgabe-id="b1" data-plan-index="0" data-plan-uhrzeit="09:00" draggable>
        b1
      </span>
    </div>
  </>
);

describe("ZiehBereich — DOM-Verdrahtung", () => {
  it("ein Zug innerhalb eines Tages ruft rangVerschiebenAction genau schritte-mal, mit der richtigen richtung", async () => {
    await mount(<ZiehBereich interaktiv>{KINDER}</ZiehBereich>);
    const a1 = query('[data-aufgabe-id="a1"]');
    const a2 = query('[data-aufgabe-id="a2"]');
    a1.dispatchEvent(zugEreignis("dragstart"));
    a2.dispatchEvent(zugEreignis("dragover"));
    await act(async () => {
      a2.dispatchEvent(zugEreignis("drop"));
      await Promise.resolve();
    });
    expect(einplanenActionMock).not.toHaveBeenCalled();
    expect(rangVerschiebenActionMock).toHaveBeenCalledTimes(1);
    const formData = rangVerschiebenActionMock.mock.calls[0]![0] as FormData;
    expect(formData.get("aufgabeId")).toBe("a1");
    expect(formData.get("richtung")).toBe("runter");
  });

  it("ein Zug zwischen zwei Tagen ruft einplanenAction mit dem Zieltag und der bisherigen Uhrzeit", async () => {
    await mount(<ZiehBereich interaktiv>{KINDER}</ZiehBereich>);
    const b1 = query('[data-aufgabe-id="b1"]');
    const zielSpalte = query('[data-tag="2026-08-17"]');
    b1.dispatchEvent(zugEreignis("dragstart"));
    zielSpalte.dispatchEvent(zugEreignis("dragover"));
    await act(async () => {
      zielSpalte.dispatchEvent(zugEreignis("drop"));
      await Promise.resolve();
    });
    expect(rangVerschiebenActionMock).not.toHaveBeenCalled();
    expect(einplanenActionMock).toHaveBeenCalledTimes(1);
    const formData = einplanenActionMock.mock.calls[0]![1] as FormData;
    expect(formData.get("aufgabeId")).toBe("b1");
    expect(formData.get("planDatum")).toBe("2026-08-17");
    expect(formData.get("planUhrzeit")).toBe("09:00");
    expect(formData.get("dauerMinuten")).toBe("");
  });

  it("auf sich selbst fallengelassen: kein Zug", async () => {
    await mount(<ZiehBereich interaktiv>{KINDER}</ZiehBereich>);
    const a1 = query('[data-aufgabe-id="a1"]');
    a1.dispatchEvent(zugEreignis("dragstart"));
    a1.dispatchEvent(zugEreignis("dragover"));
    await act(async () => {
      a1.dispatchEvent(zugEreignis("drop"));
      await Promise.resolve();
    });
    expect(einplanenActionMock).not.toHaveBeenCalled();
    expect(rangVerschiebenActionMock).not.toHaveBeenCalled();
  });

  /*
   * ABGEBROCHENER ZUG (Brief: "Escape, Loslassen außerhalb ändert nichts"). Escape selbst feuert im
   * Browser kein `drop`, nur `dragend` — ein `dragstart` OHNE nachfolgendes `drop` ist deshalb die
   * jsdom-Nachbildung dieses Falls.
   */
  it("dragstart ohne drop (Escape/Abbruch): keine Action wird gerufen", async () => {
    await mount(<ZiehBereich interaktiv>{KINDER}</ZiehBereich>);
    const a1 = query('[data-aufgabe-id="a1"]');
    a1.dispatchEvent(zugEreignis("dragstart"));
    await act(async () => {
      a1.dispatchEvent(zugEreignis("dragend"));
      await Promise.resolve();
    });
    expect(einplanenActionMock).not.toHaveBeenCalled();
    expect(rangVerschiebenActionMock).not.toHaveBeenCalled();
  });

  it("Loslassen außerhalb jeder Tagesspalte ändert nichts", async () => {
    await mount(<ZiehBereich interaktiv>{KINDER}</ZiehBereich>);
    const a1 = query('[data-aufgabe-id="a1"]');
    a1.dispatchEvent(zugEreignis("dragstart"));
    // Der Wurzel-Container von `ZiehBereich` selbst traegt kein `data-tag` — ein Drop direkt darauf
    // (statt auf eine Tagesspalte) landet ausserhalb jeder Flaeche.
    const wurzel = query('[data-rolle="wochengitter"]');
    await act(async () => {
      wurzel.dispatchEvent(zugEreignis("drop"));
      await Promise.resolve();
    });
    expect(einplanenActionMock).not.toHaveBeenCalled();
    expect(rangVerschiebenActionMock).not.toHaveBeenCalled();
  });

  /*
   * FREMDER PLAN NICHT ZIEHBAR — DASSELBE PRAEDIKAT WIE DIE KNOEPFE (Brief): `interaktiv={false}`
   * ist exakt der Wert, den `Wochenplan.tsx` aus `darfPlanAendern` durchreicht (`zeigeAktionen ===
   * true`), keine zweite Pruefung hier. GEGENPROBE (im Bericht dokumentiert, nicht dauerhaft im
   * Code): entfernt man das `if (!interaktiv) return` in `onDragStart`, wird GENAU DIESER Test rot
   * (`rangVerschiebenActionMock` waere dann doch gerufen).
   */
  it("interaktiv=false: kein dragstart merkt sich etwas, keine Action wird je gerufen", async () => {
    await mount(<ZiehBereich interaktiv={false}>{KINDER}</ZiehBereich>);
    const a1 = query('[data-aufgabe-id="a1"]');
    const a2 = query('[data-aufgabe-id="a2"]');
    a1.dispatchEvent(zugEreignis("dragstart"));
    a2.dispatchEvent(zugEreignis("dragover"));
    await act(async () => {
      a2.dispatchEvent(zugEreignis("drop"));
      await Promise.resolve();
    });
    expect(einplanenActionMock).not.toHaveBeenCalled();
    expect(rangVerschiebenActionMock).not.toHaveBeenCalled();
  });

  it("rendert `.wochenGitter`/`data-rolle=\"wochengitter\"` selbst, keinen zusaetzlichen Wrapper darin", async () => {
    await mount(
      <ZiehBereich interaktiv>
        <div data-tag="2026-08-17" />
      </ZiehBereich>,
    );
    const wurzel = query('[data-rolle="wochengitter"]');
    // Direktes Kind ist die Tagesspalte selbst — kein Zwischen-`<div>`, sonst braeche das
    // CSS-Grid-Rastermass von `.wochenGitter` (Kopfkommentar `ZiehBereich.tsx`).
    expect(wurzel.firstElementChild?.getAttribute("data-tag")).toBe("2026-08-17");
  });
});
