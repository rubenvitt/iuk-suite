// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { mount, unmount, query, exists, fill, click, rerender } from "@/app/m/qr/_lib/test-dom";
import { Stepper } from "./Stepper";

const QUELLE = "src/app/m/lagerbuch/_ui/Stepper.tsx";
const MINUS = "button[aria-label='Menge verringern']";
const PLUS = "button[aria-label='Menge erhöhen']";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der Regeldatei
 * fuer Teil 4). Die drei Quelltext-Scans unten laesen sonst den Rohtext INKLUSIVE
 * Kommentaren — und `Stepper.tsx` traegt die gesuchte Zeichenfolge woertlich in
 * seiner eigenen Begruendung: „DIE `sm`-VARIANTE ENTFAELLT" steht im Kopfkommentar
 * der Komponente, weil §7.7.3 genau diese Begruendung konserviert haben will. Ohne
 * diese Funktion waere der Scan auf der Begruendung rot, die er schuetzen soll.
 * `bauform.test.ts` exportiert sie nicht, und dies ist ein anderer Testkoerper —
 * deshalb die lokale Kopie statt eines Re-Exports, genau wie `_lib/pwaIcons.test.ts`
 * (T65), `_lib/schreibpfade/tokenEinloesung.test.ts` (T66) und `_ui/Restzeit.test.tsx`
 * (T67) es halten.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * React bildet `onBlur` seit Version 17 auf das native `focusout` ab, NICHT auf
 * `blur`: `blur` steigt nicht auf, und React haengt seine Zuhoerer am Wurzel-Knoten
 * auf. Ein abgesetztes `blur`-Ereignis erreicht den Handler also nie — der Test
 * waere rot, und die naheliegende „Reparatur" (`abschliessen()` direkt rufen)
 * hoehlte genau die Zusicherung aus, um die es geht. Im `act()`, damit React die
 * Zustandsaenderung noch im selben Schritt ausspuelt.
 */
async function verlassen(selector: string): Promise<void> {
  const el = query(selector);
  await act(async () => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

afterEach(async () => {
  await unmount();
});

describe("Stepper — Klemmen an beiden Enden", () => {
  it("`−` unter `min` klemmt", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={1} setWert={setWert} min={1} max={9} />);
    await click(MINUS);
    expect(setWert).toHaveBeenCalledWith(1);
  });

  it("`+` ueber `max` klemmt", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={9} setWert={setWert} min={0} max={9} />);
    await click(PLUS);
    expect(setWert).toHaveBeenCalledWith(9);
  });

  it("Direkteingabe ueber `max` klemmt — und die ANZEIGE zeigt den geklemmten Wert", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={3} setWert={setWert} min={0} max={20} />);
    await fill("input", "999");
    expect(setWert).toHaveBeenLastCalledWith(20);
    expect(query<HTMLInputElement>("input").value).toBe("20");
  });

  it("nicht-Ziffern werden verworfen, nicht als NaN committet", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={3} setWert={setWert} min={0} max={20} />);
    await fill("input", "1a2");
    expect(setWert).toHaveBeenLastCalledWith(12);
  });
});

describe("Stepper — das leere Feld", () => {
  it("committet NICHT als 0", async () => {
    // Loeschen und neu tippen ist der Normalfall. Ein leeres Feld als 0 zu
    // committen bucht bei einem Zwischenschritt der Eingabe eine Null — und die
    // ist in der Zaehlliste eine falsche Bestandsbuchung.
    const setWert = vi.fn();
    await mount(<Stepper wert={7} setWert={setWert} min={0} max={99} />);
    await fill("input", "");
    expect(setWert).not.toHaveBeenCalled();
    expect(query<HTMLInputElement>("input").value).toBe("");
  });

  it("faellt beim Verlassen auf den Parent-Wert zurueck", async () => {
    await mount(<Stepper wert={7} setWert={() => {}} min={0} max={99} />);
    await fill("input", "");
    await verlassen("input");
    expect(query<HTMLInputElement>("input").value).toBe("7");
  });
});

describe("Stepper — der `draft`-Zustand haelt den Parent-Wert als Quelle der Wahrheit", () => {
  // Stepper.tsx loest genau diesen Konflikt und schreibt ihn aus: „So bleibt der
  // Parent-Wert die Quelle der Wahrheit und Klicks/Tastatur lesen nie einen
  // veralteten Wert zurueck." Wer den Stepper auf ein formulargebundenes
  // InputNumber hebt, baut eine DRITTE Zustandsquelle auf — in einem Feld, dessen
  // falscher Wert eine falsche Bestandsbuchung ist (Falle 45).
  //
  // Zwei Tests, zwei getrennte Regeln (Regel 4): der erste haelt „der Klick RECHNET
  // auf dem Parent-Wert", der zweite „der Entwurf wird beim Klick VERWORFEN". Ein
  // Klick, der auf dem Parent rechnet, den Entwurf aber stehen liesse, zeigte
  // hinterher 40 an, waehrend der Parent 6 sagt.
  it("ein Klick nach einer Direkteingabe RECHNET auf dem Parent-Wert, nicht auf dem Entwurf", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={5} setWert={setWert} min={0} max={99} />);
    await fill("input", "40");
    // Der Parent hat noch NICHT neu gerendert (Serverantwort ausstehend).
    await click(PLUS);
    expect(setWert).toHaveBeenLastCalledWith(6); // 5 + 1, nicht 41
  });

  it("ein Klick VERWIRFT den Entwurf — das Feld zeigt danach den Parent-Wert", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={5} setWert={setWert} min={0} max={99} />);
    await fill("input", "40");
    await click(PLUS);
    // Jetzt trifft die Antwort des Parents ein.
    await rerender(<Stepper wert={6} setWert={setWert} min={0} max={99} />);
    expect(query<HTMLInputElement>("input").value).toBe("6"); // nicht "40"
  });
});

describe("Stepper — `noText`", () => {
  it("rendert KEIN <input>", async () => {
    // „damit unterwegs am Handy nicht versehentlich ins Zahlenfeld getippt
    // wird" (Stepper.tsx). Genutzt beim Zaehlen und beim Nachfuellen — beides
    // Stellen, an denen ein Fehlgriff eine falsche Bestandsbuchung ist.
    await mount(<Stepper wert={4} setWert={() => {}} noText />);
    expect(exists("input")).toBe(false);
    expect(query("[data-rolle='stepanzeige']").textContent).toBe("4");
  });

  it("die beiden Tasten bleiben bedienbar und benannt", async () => {
    const setWert = vi.fn();
    await mount(<Stepper wert={4} setWert={setWert} min={0} max={9999} noText />);
    await click(PLUS);
    expect(setWert).toHaveBeenCalledWith(5);
    expect(exists(MINUS)).toBe(true);
  });
});

describe("Stepper — Benennung und Mass", () => {
  it("beide Tasten tragen ein aria-label — mit 56px ohne Text die einzige Benennung", async () => {
    await mount(<Stepper wert={1} setWert={() => {}} />);
    expect(exists(MINUS)).toBe(true);
    expect(exists(PLUS)).toBe(true);
  });

  it("die Beschriftung ist ueberschreibbar — mehrere Stepper je Bildschirm brauchen sie", async () => {
    // In der Zaehlliste stehen zwanzig Stepper untereinander. „Menge erhoehen"
    // zwanzigmal ist fuer eine Bildschirmleserin keine Benennung.
    await mount(<Stepper wert={1} setWert={() => {}} beschriftung="Kompresse 10×10" />);
    expect(exists("button[aria-label='Kompresse 10×10 verringern']")).toBe(true);
    expect(exists("button[aria-label='Kompresse 10×10 erhöhen']")).toBe(true);
  });

  it("beide benannten Tasten behalten ein stummes Zeichen", async () => {
    await mount(<Stepper wert={1} setWert={() => {}} />);
    for (const selektor of [MINUS, PLUS]) {
      const svg = query(`${selektor} svg`);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
    }
  });

  it("hat KEINE `sm`-Variante mehr", () => {
    // §7.7.3: es gibt genau eine Groesse. Eine zweite waere die Ruecknahme des
    // Tap-Masses durch die Hintertuer. Das Tap-Mass selbst (56px an beiden
    // Flaechen) haelt `_lib/bauform.test.ts` am Stylesheet fest — hier wird es
    // nicht ein zweites Mal geprueft.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/\bsm\b/);
  });

  it("ist eine Client-Insel ohne antd und ohne lucide", () => {
    const roh = readFileSync(QUELLE, "utf8");
    expect(roh).toMatch(/^"use client";/m);
    expect(ohneKommentare(roh)).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
