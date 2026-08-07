// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { exists, fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { Trefferanzeige } from "./Trefferanzeige";
import { Suchfeld } from "./Suchfeld";
import s from "./verwaltung.module.css";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/verwaltung/journal",
}));

beforeEach(() => {
  replace.mockClear();
  window.history.replaceState({}, "", "/verwaltung/journal");
});

afterEach(async () => {
  await unmount();
});

describe("Trefferanzeige", () => {
  it("erscheint, wenn gefiltert wurde", async () => {
    await mount(<Trefferanzeige gezeigt={3} gesamt={42} />);
    const el = query(`.${s.filtertreffer}`);
    expect(el.textContent).toBe("3 von 42");
    expect(el.getAttribute("data-testid")).toBe("trefferanzeige");
  });

  it("erscheint NICHT, wenn nichts ausgeblendet ist", async () => {
    await mount(<div><Trefferanzeige gezeigt={42} gesamt={42} /></div>);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
  });

  it("erscheint auch bei null Treffern", async () => {
    await mount(<Trefferanzeige gezeigt={0} gesamt={42} />);
    expect(query(`.${s.filtertreffer}`).textContent).toBe("0 von 42");
  });

  it("erscheint nicht bei leerer Liste", async () => {
    await mount(<div><Trefferanzeige gezeigt={0} gesamt={0} /></div>);
    expect(exists(`.${s.filtertreffer}`)).toBe(false);
  });

  it("bleibt eine Server Component ohne use-client-Direktive", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Trefferanzeige.tsx", "utf8");
    expect(quelle.trimStart()).not.toMatch(/^["']use client["']/);
  });
});

describe("Suchfeld", () => {
  it("traegt die Rolle searchbox gegen das gerenderte Bauteil geprueft", async () => {
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="Artikel oder Fach suchen…" />);
    const input = query("input");
    expect(input.getAttribute("type")).toBe("search");
    expect(input.getAttribute("role") ?? "searchbox").toBe("searchbox");
  });

  it("benutzt Input, nicht Input.Search und hat keinen Absendeknopf", async () => {
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="suchen…" />);
    expect(exists(".ant-input-search-button")).toBe(false);
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Suchfeld.tsx", "utf8");
    expect(quelle).not.toMatch(/Input\.Search/);
    expect(exists("button[type='submit']")).toBe(false);
  });

  it("traegt die Lupe als prefix und ein aria-label", async () => {
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="Gerät suchen…" />);
    expect(exists(".ant-input-prefix svg")).toBe(true);
    expect(query("input").getAttribute("aria-label")).toBe("Gerät suchen…");
  });

  it("meldet jede Eingabe nach oben", async () => {
    const gesehen: string[] = [];
    await mount(<Suchfeld wert="" onWert={(wert) => gesehen.push(wert)} platzhalter="suchen…" />);
    await fill("input", "mull");
    expect(gesehen.at(-1)).toBe("mull");
  });

  it("setzt keine Schriftgroesze unter 16px", async () => {
    await mount(<Suchfeld wert="" onWert={() => {}} platzhalter="suchen…" />);
    const stil = query("input").getAttribute("style") ?? "";
    const treffer = /font-size:\s*([\d.]+)px/.exec(stil);
    if (treffer) expect(Number(treffer[1])).toBeGreaterThanOrEqual(16);
  });
});

describe("useUrlFilter", () => {
  it("schreibt gesetzte Parameter relativ und ohne Scroll-Sprung", async () => {
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({ q: "mull", typ: "entnahme" })}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal?q=mull&typ=entnahme", { scroll: false });
  });

  it("erhaelt bestehende Query-Werte, die der Aufruf nicht aendert", async () => {
    window.history.replaceState({}, "", "/verwaltung/journal?seite=2");
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({ q: "mull", typ: "entnahme" })}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith(
      "/verwaltung/journal?seite=2&q=mull&typ=entnahme",
      { scroll: false },
    );
  });

  it("laeszt leere Werte aus und entfernt deren bestehenden Parameter", async () => {
    window.history.replaceState({}, "", "/verwaltung/journal?q=alt");
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({ q: "", typ: "zugang" })}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal?typ=zugang", { scroll: false });
  });

  it("setzt mit einem leeren Objekt alle Filter zurueck", async () => {
    window.history.replaceState({}, "", "/verwaltung/journal?q=alt&typ=zugang");
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({})}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal", { scroll: false });
  });

  it("kodiert Parameter ueber URLSearchParams", async () => {
    const { useUrlFilter } = await import("./useUrlFilter");
    function Probe() {
      const setzen = useUrlFilter();
      return <button type="button" onClick={() => setzen({ q: "Müll & Tee" })}>los</button>;
    }
    await mount(<Probe />);
    query("button").click();
    expect(replace).toHaveBeenCalledWith("/verwaltung/journal?q=M%C3%BCll+%26+Tee", { scroll: false });
  });

  it("benutzt replace und NICHT push", () => {
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/useUrlFilter.ts", "utf8");
    expect(quelle).toMatch(/router\.replace/);
    expect(quelle).not.toMatch(/router\.push/);
  });
});

describe("usePathname kommt im Modul genau einmal vor", () => {
  it("nur in _ui/useUrlFilter.ts", () => {
    const treffer: string[] = [];
    const suche = (verzeichnis: string) => {
      for (const eintrag of readdirSync(verzeichnis)) {
        const pfad = join(verzeichnis, eintrag);
        if (statSync(pfad).isDirectory()) suche(pfad);
        else if (/\.tsx?$/.test(pfad) && !/\.(?:test|spec)\.tsx?$/.test(pfad)) {
          const quelle = readFileSync(pfad, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
          if (/\busePathname\b/.test(quelle)) {
            treffer.push(relative("src/app/m/lagerbuch", pfad));
          }
        }
      }
    };
    suche("src/app/m/lagerbuch");
    expect(treffer).toEqual(["_ui/useUrlFilter.ts"]);
  });
});
