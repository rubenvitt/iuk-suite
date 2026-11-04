// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as paket from "@lucasmarkes/hairline";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { MODULES } from "@/core/registry";
import { FIGUREN, LAGE_FIGUR, MODUL_FIGUR, figurFuer } from "./figuren";
import { LADER } from "./laden";
import { deckt, untergrund } from "./untergrund";

const montiert = vi.fn();
vi.mock("./laden", async (original) => {
  const echt = await original<typeof import("./laden")>();
  const LADER = Object.fromEntries(
    Object.keys(echt.LADER).map((name) => [
      name,
      () => Promise.resolve({ default: (el: HTMLElement, o: unknown) => (montiert(name, el, o), { destroy: vi.fn(), update: vi.fn() }) }),
    ]),
  );
  return { LADER, echt: echt.LADER };
});

const { Ruhezustand, RuheFigur } = await import("./Ruhezustand");

const ORDNER = join(process.cwd(), "src/core/ruhe");
const lies = (datei: string) => readFileSync(join(ORDNER, datei), "utf8");
const ohneKommentare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

afterEach(async () => {
  await unmount();
  montiert.mockReset();
  vi.unstubAllGlobals();
});

describe("die Zuordnung: ein Schlüssel, eine Figur, eine Stelle", () => {
  it("jede zugeordnete Figur ist eine der geladenen", () => {
    for (const figur of [...Object.values(MODUL_FIGUR), ...Object.values(LAGE_FIGUR)]) {
      expect(FIGUREN).toContain(figur);
    }
  });

  it("jede Modul-Figur gehört zu einem registrierten Modul", () => {
    const schluessel = MODULES.map((m) => m.key);
    for (const modul of Object.keys(MODUL_FIGUR)) expect(schluessel).toContain(modul);
  });

  it("kein Modul teilt seine Figur mit einem anderen oder mit einer Lage", () => {
    const alle = [...Object.values(MODUL_FIGUR), ...Object.values(LAGE_FIGUR)];
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("jede Figur hat ihre eigene Datei, die genau die gleichnamige Funktion des Pakets weiterreicht", async () => {
    const dateien = readdirSync(join(ORDNER, "figuren")).map((d) => d.replace(/\.ts$/, "")).sort();
    expect(dateien).toEqual([...FIGUREN].sort());
    for (const figur of FIGUREN) {
      expect(lies(`figuren/${figur}.ts`)).toContain(`export { ${figur} as default } from "@lucasmarkes/hairline";`);
      expect(typeof (paket as Record<string, unknown>)[figur]).toBe("function");
    }
  });

  it("lädt jede Figur einzeln nach — kein statischer Import des Pakets in der Insel", async () => {
    const { echt } = (await import("./laden")) as unknown as { echt: typeof LADER };
    expect(Object.keys(echt).sort()).toEqual([...FIGUREN].sort());
    for (const datei of ["FigurInsel.tsx", "Ruhezustand.tsx", "laden.ts", "figuren.ts"]) {
      expect(ohneKommentare(lies(datei))).not.toMatch(/from "@lucasmarkes\/hairline/);
    }
    for (const figur of FIGUREN) expect(typeof (await echt[figur]()).default).toBe("function");
  });

  it("figurFuer löst Modul und Lage auf", () => {
    expect(figurFuer("lagerbuch")).toBe("drawer");
    expect(figurFuer("fehlt")).toBe("query");
  });
});

describe("Falle 6: Werte und der Ruhezustand selbst stehen ohne Client-Direktive", () => {
  it.each(["figuren.ts", "laden.ts", "untergrund.ts", "Ruhezustand.tsx", "index.ts"])("%s", (datei) => {
    expect(lies(datei)).not.toMatch(/^\s*["']use client["']/m);
  });

  it("nur die Insel ist Client", () => {
    expect(lies("FigurInsel.tsx")).toMatch(/^"use client";/);
  });
});

describe("der Ruhezustand", () => {
  it("rendert auf dem Server die Fläche der Figur schon in ihrer Größe, Titel und eine Aktion", () => {
    const html = renderToString(
      <Ruhezustand figur="lagerbuch" titel="Noch keine Artikel" aktion={<button type="button">Anlegen</button>} />,
    );
    expect(html).toMatch(/<div aria-hidden="true" data-figur="drawer" class="[^"]*figur/);
    expect(html).toContain("<p");
    expect(html).toContain("Noch keine Artikel");
    expect(html).toContain("Anlegen");
    expect(html).toContain('data-rolle="ruhezustand"');
  });

  it("setzt die Überschriftenebene, wo der Zustand die einzige Auskunft ist", () => {
    expect(renderToString(<Ruhezustand figur="fehlt" als="h1" titel="Weg" />)).toMatch(/<h1[^>]*>Weg<\/h1>/);
  });

  it("montiert die Figur nach dem Laden, spielend", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    await mount(<Ruhezustand figur="wartung" titel="Keine Mängel" />);
    await Promise.resolve();
    expect(montiert).toHaveBeenCalledWith("lockers", query('[data-figur="lockers"]'), { intensity: 0.55, play: true });
  });

  it("spielt bei reduzierter Bewegung nicht", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    await mount(<RuheFigur figur="anmeldung" />);
    await Promise.resolve();
    expect(montiert).toHaveBeenCalledWith("dish", expect.any(HTMLElement), { intensity: 0.55, play: false });
  });

  it("ohne IntersectionObserver bleibt die Fläche leer, ohne Fehler", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await mount(<Ruhezustand figur="fehlt" titel="Weg" />);
    await Promise.resolve();
    expect(montiert).not.toHaveBeenCalled();
    expect(query('[data-figur="query"]')).toBeTruthy();
  });

  it("färbt die Platten in der Farbe des echten Untergrunds", async () => {
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    await mount(
      <div style={{ background: "rgb(17, 17, 19)" }}>
        <Ruhezustand figur="fehlt" titel="Weg" />
      </div>,
    );
    expect(query<HTMLElement>('[data-figur="query"]').style.getPropertyValue("--ruhe-flaeche")).toBe("rgb(17, 17, 19)");
  });
});

describe("untergrund", () => {
  it("erkennt deckende und durchsichtige Farben", () => {
    expect(deckt("rgb(255, 255, 255)")).toBe(true);
    expect(deckt("rgba(0, 0, 0, 0)")).toBe(false);
    expect(deckt("rgba(0, 0, 0, 0.5)")).toBe(false);
    expect(deckt("rgb(0 0 0 / 1)")).toBe(true);
    expect(deckt("transparent")).toBe(false);
    expect(deckt("")).toBe(false);
  });

  it("geht aufwärts bis zur ersten deckenden Fläche", () => {
    const aussen = document.createElement("div");
    aussen.style.background = "rgb(1, 2, 3)";
    const innen = document.createElement("span");
    aussen.appendChild(innen);
    document.body.appendChild(aussen);
    expect(untergrund(innen)).toBe("rgb(1, 2, 3)");
    aussen.remove();
  });
});

describe("das CSS: Haarlinie in beiden Modi, still bei reduzierter Bewegung", () => {
  const css = ohneKommentare(lies("ruhe.module.css"));

  it("nimmt nur Suite-Tokens — kein `--ant-*` (Falle 2), keine `.ant-*`-Klasse (Falle 20)", () => {
    expect(css).not.toContain("--ant-");
    expect(css).not.toMatch(/\.ant-/);
  });

  it("färbt alle Linien der Figur aus Tinte und Grau, die ihren Dunkelzweig in `globals.css` haben", () => {
    for (const name of ["plate", "hi", "edge", "mid", "lo"]) {
      expect(css).toMatch(new RegExp(`--hairline-${name}:[^;]*var\\(--(iuk|ruhe)-`));
    }
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("reserviert die Fläche: 5:4 wie das Paket", () => {
    expect(css).toMatch(/aspect-ratio:\s*5 \/ 4/);
  });

  it("nimmt der Figur bei reduzierter Bewegung den Zeiger", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.figur\s*\{\s*pointer-events:\s*none/);
  });
});
