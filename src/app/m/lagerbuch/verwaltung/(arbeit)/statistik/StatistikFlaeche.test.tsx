// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import type { StatistikDaten } from "../../../_lib/lesepfade/statistik";

const ersetze = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: ersetze }),
  usePathname: () => "/verwaltung/statistik",
}));

const { StatistikFlaeche } = await import("./StatistikFlaeche");

/**
 * jsdom misst 0×0, und `ResponsiveContainer` zeichnet dann nichts. Derselbe
 * Rect-Stub wie in `core/charts/charts.test.tsx`.
 */
let original: typeof Element.prototype.getBoundingClientRect;
beforeAll(() => {
  original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return { width: 800, height: 280, top: 0, left: 0, right: 800, bottom: 280, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = original;
});
afterEach(async () => {
  await unmount();
  ersetze.mockReset();
});

const MONATE = [
  { schluessel: "2026-09", label: "Sep 26" },
  { schluessel: "2026-10", label: "Okt 26" },
];

function leer(): StatistikDaten {
  return {
    monate: MONATE, tage: 45, artikel: [], kategorien: [], einheiten: [],
    bewegungen: [], bestandsDeltas: [], vorschauMonate: MONATE, verfall: [], einheitenVerfallWarnend: 0,
  };
}

function mitDaten(): StatistikDaten {
  return {
    ...leer(),
    artikel: [
      { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", kategorie: "Verband", kategorieSchluessel: "verband",
        aktiv: true, handlager: 30, einheiten: 4, startHandlager: 40, startEinheiten: 0 },
      { id: "a2", name: "NaCl 500 ml", einheit: "Fl.", kategorie: null, kategorieSchluessel: null,
        aktiv: true, handlager: 5, einheiten: 0, startHandlager: 5, startEinheiten: 0 },
    ],
    kategorien: [{ schluessel: "verband", label: "Verband" }],
    einheiten: [{ id: "rtw", label: "RTW 1 · Fahrzeug", aktiv: true }],
    bewegungen: [
      { m: 0, a: "a1", o: null, art: "regal", n: 6 },
      { m: 1, a: "a1", o: "rtw", art: "einheit", n: 2 },
      { m: 0, a: "a1", o: "rtw", art: "nachschub", n: 4 },
      { m: 1, a: "a2", o: null, art: "regal", n: 1 },
    ],
    bestandsDeltas: [{ m: 0, a: "a1", b: "handlager", n: -10 }, { m: 0, a: "a1", b: "einheiten", n: 4 }],
  };
}

const text = () => document.body.textContent ?? "";

describe("StatistikFlaeche", () => {
  it("zeigt ohne Buchungen Leerzustaende statt leerer Achsenkreuze", async () => {
    await mount(<StatistikFlaeche daten={leer()} zeitraum={12} />);
    expect(document.querySelector(".recharts-wrapper")).toBeNull();
    expect(text()).toContain("Im gewählten Zeitraum wurde nichts verbraucht.");
    expect(text()).toContain("Wähle oben einen Artikel");
  });

  it("zeichnet die Diagramme und warnt vor gemischten Zaehleinheiten", async () => {
    await mount(<StatistikFlaeche daten={mitDaten()} zeitraum={12} />);
    expect(document.querySelectorAll(".recharts-wrapper").length).toBeGreaterThanOrEqual(2);
    expect(text()).toContain("verschiedene Einheiten");
    expect(text()).toContain("Am meisten verbraucht");
    expect(text()).toContain("Reicht noch");
  });

  it("legt den Zeitraum in die URL", async () => {
    await mount(<StatistikFlaeche daten={mitDaten()} zeitraum={12} />);
    const knopf = [...document.querySelectorAll<HTMLElement>(".ant-segmented-item")]
      .find((el) => el.textContent === "6")!;
    knopf.click();
    await Promise.resolve();
    expect(ersetze).toHaveBeenCalledWith("/verwaltung/statistik?monate=6", { scroll: false });
  });
});

describe("StatistikFlaeche — Quelltext", () => {
  const quelle = readFileSync("src/app/m/lagerbuch/verwaltung/(arbeit)/statistik/StatistikFlaeche.tsx", "utf8");

  it("faerbt nie mit dem Suite-Rot (Falle 3) und nie ueber antd-Token (Falle 2)", () => {
    expect(quelle).not.toContain("#c8000f");
    expect(quelle).not.toContain("colorPrimary");
    expect(quelle).not.toContain("useToken");
    expect(quelle).not.toContain("--ant-");
  });

  it("setzt kein `size` auf Bedienelemente (Falle 4)", () => {
    expect(quelle).not.toMatch(/\bsize=/);
  });
});
