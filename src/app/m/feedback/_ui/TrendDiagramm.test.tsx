// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { TrendDiagramm, type TrendFrage } from "./TrendDiagramm";
import { MAX_SERIEN } from "./NotenVerlauf";

/**
 * DER UMSCHALTER DER FRAGEKURVEN (Entwurf §3.3, wortgenau: „Nur die
 * Gesamtdurchschnittslinie ist Vorgabe; einzelne Fragen sind zuschaltbar, maximal
 * drei gleichzeitig, gestrichelt und direkt beschriftet").
 *
 * WAS OHNE DIESE INSEL FEHLTE: auf dem Trend-Screen gab es ausschliesslich die
 * Gesamtdurchschnittslinie und kein Bedienelement fuer eine einzelne Frage. Wer
 * wissen wollte, ob sich speziell „Wie gut war alles vorbereitet?" ueber zwoelf
 * Monate verbessert hat, musste zwoelf Auswertungsseiten oeffnen und die
 * Notenspuren im Kopf vergleichen.
 *
 * DREI ZUSAGEN, DIE STILL BRECHEN KOENNEN:
 *
 * 1. DER DECKEL IST SICHTBAR. Bei drei zugeschalteten Fragen sind die uebrigen
 *    Schalter `disabled` — ein Klick, der nichts tut, lehrt „die Anwendung ist
 *    kaputt".
 * 2. KEIN `type="primary"`. `colorError === colorPrimary === #c8000f`: ein
 *    gefuellter Primaerknopf je zugeschalteter Frage waere Suite-Rot auf einer
 *    Datenflaeche (§4.9).
 * 3. DER ZUSTAND IST AM KNOPF ABLESBAR, nicht nur an der Farbe: `aria-pressed`.
 *
 * Das Diagramm selbst rendert unter jsdom NICHTS (`ResponsiveContainer` misst
 * seinen Elternknoten, Hoehe 0) — geprueft wird deshalb die Schalterreihe, und die
 * Serienbildung liegt in `NotenVerlauf.test.tsx` am Elementbaum.
 */

const PUNKTE = [
  { label: "2026-04", note: 2.2 },
  { label: "2026-05", note: 2.0 },
  { label: "2026-06", note: 1.8 },
];

const FRAGEN: TrendFrage[] = [
  { id: "q1", text: "Insgesamt?", werte: [2, 2, 2] },
  { id: "q2", text: "Vorbereitet?", werte: [3, 3, 3] },
  { id: "q3", text: "Verständlich?", werte: [1, 1, 1] },
  { id: "q4", text: "Genug Zeit?", werte: [4, 4, 4] },
];

const schalter = (): HTMLButtonElement[] =>
  queryAll<HTMLButtonElement>("[data-testid='trend-fragen'] button");

const mitText = (text: string): HTMLButtonElement => {
  const treffer = schalter().find((b) => (b.textContent ?? "").trim() === text);
  if (!treffer) throw new Error(`Kein Schalter „${text}“`);
  return treffer;
};

afterEach(async () => {
  await unmount();
  document.body.replaceChildren();
});

describe("TrendDiagramm — die Fragen sind zuschaltbar (§3.3)", () => {
  it("zeigt je Frage einen Schalter, keiner davon vorgewaehlt", async () => {
    await mount(<TrendDiagramm punkte={PUNKTE} fragen={FRAGEN} />);

    expect(schalter()).toHaveLength(4);
    for (const b of schalter()) expect(b.getAttribute("aria-pressed")).toBe("false");
  });

  it("schaltet eine Frage an und wieder aus", async () => {
    await mount(<TrendDiagramm punkte={PUNKTE} fragen={FRAGEN} />);

    await clickElement(mitText("Vorbereitet?"));
    expect(mitText("Vorbereitet?").getAttribute("aria-pressed")).toBe("true");
    expect(mitText("Insgesamt?").getAttribute("aria-pressed")).toBe("false");

    await clickElement(mitText("Vorbereitet?"));
    expect(mitText("Vorbereitet?").getAttribute("aria-pressed")).toBe("false");
  });

  it("sperrt die uebrigen Schalter beim Deckel — statt Klicks stumm zu verschlucken", async () => {
    await mount(<TrendDiagramm punkte={PUNKTE} fragen={FRAGEN} />);

    for (const text of ["Insgesamt?", "Vorbereitet?", "Verständlich?"]) {
      await clickElement(mitText(text));
    }
    expect(MAX_SERIEN).toBe(3);

    const vierter = mitText("Genug Zeit?");
    expect(vierter.disabled).toBe(true);
    // Die drei gewaehlten bleiben bedienbar — sonst kaeme man nie wieder heraus.
    for (const text of ["Insgesamt?", "Vorbereitet?", "Verständlich?"]) {
      expect(mitText(text).disabled).toBe(false);
    }
    // Und die Reihe sagt, warum.
    expect(document.body.textContent).toContain("Drei Kurven sind das Maximum");

    // Eine abwaehlen gibt den vierten wieder frei.
    await clickElement(mitText("Insgesamt?"));
    expect(mitText("Genug Zeit?").disabled).toBe(false);
  });

  it("traegt keinen Primaerknopf — Rot gehoert nicht auf eine Datenflaeche (§4.9)", async () => {
    await mount(<TrendDiagramm punkte={PUNKTE} fragen={FRAGEN} />);
    await clickElement(mitText("Insgesamt?"));

    for (const b of schalter()) {
      expect(b.className).not.toContain("ant-btn-primary");
      expect(b.className).not.toContain("ant-btn-dangerous");
    }
  });

  it("nennt den Deckel in der Reihe, damit die Grenze vor dem Klick bekannt ist", async () => {
    await mount(<TrendDiagramm punkte={PUNKTE} fragen={FRAGEN} />);
    expect(document.body.textContent).toContain("EINZELNE FRAGEN ZUSCHALTEN (MAX. 3)");
  });

  it("laesst die Reihe ganz weg, wo es keine Schulnotenfrage gibt (§4.3)", async () => {
    await mount(<TrendDiagramm punkte={PUNKTE} fragen={[]} />);
    // Eine beschriftete leere Schublade ist schlimmer als keine.
    expect(queryAll("[data-testid='trend-fragen']")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("EINZELNE FRAGEN ZUSCHALTEN");
  });
});
