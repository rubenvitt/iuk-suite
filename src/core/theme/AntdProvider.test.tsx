// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AntdProvider, useThemeMode } from "./AntdProvider";
import type { ThemePreference } from "@/core/theme/theme";

/**
 * `setPreference` wechselt den Modus OHNE Reload. Wenn es dabei nur das Cookie
 * und `style.colorScheme` schreibt, bleiben eigene CSS-Variablen, die an
 * `[data-theme]` haengen, bis zur naechsten Navigation auf dem alten Modus
 * stehen — der Umschalter waere fuer sie sichtbar wirkungslos. Deshalb muss der
 * Client `dataset.theme` mitschreiben.
 *
 * Umgeschaltet wird ueber echte Knopfdruecke, nicht ueber ein nach draussen
 * gereichtes `setPreference`: eine Zuweisung an eine Variable ausserhalb der
 * Komponente waere ein Seiteneffekt im Render (`react-hooks/globals`) — und
 * ein Klick prueft ohnehin den Weg, den der echte Umschalter nimmt.
 *
 * `window.matchMedia` gibt es in jsdom NICHT. Ohne die Attrappe unten wirft der
 * Provider beim Mounten.
 */
let root: Root | null = null;
let container: HTMLElement | null = null;

interface MediaAttrappe {
  wechseln: (nachDunkel: boolean) => void;
}

function matchMediaStellen(dunkel: boolean): MediaAttrappe {
  const hoerer = new Set<(e: MediaQueryListEvent) => void>();
  const liste = {
    matches: dunkel,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, h: (e: MediaQueryListEvent) => void) => {
      hoerer.add(h);
    },
    removeEventListener: (_: string, h: (e: MediaQueryListEvent) => void) => {
      hoerer.delete(h);
    },
  };
  window.matchMedia = (() => liste) as unknown as typeof window.matchMedia;
  return {
    wechseln(nachDunkel: boolean) {
      liste.matches = nachDunkel;
      act(() => {
        for (const h of hoerer) h({ matches: nachDunkel } as MediaQueryListEvent);
      });
    },
  };
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  // BEIDE Cookies — sonst leckt Zustand in andere Testdateien.
  document.cookie = "iuk-theme-pref=; Path=/; Max-Age=0";
  document.cookie = "iuk-theme-system=; Path=/; Max-Age=0";
});

function Sonde() {
  const { mode, preference, setPreference } = useThemeMode();
  return (
    <div>
      <span data-testid="modus">{mode}</span>
      <span data-testid="praeferenz">{preference}</span>
      <button type="button" data-testid="nach-auto" onClick={() => setPreference("auto")} />
      <button type="button" data-testid="nach-dunkel" onClick={() => setPreference("dark")} />
      <button type="button" data-testid="nach-hell" onClick={() => setPreference("light")} />
    </div>
  );
}

function mount(initialMode: "light" | "dark", initialPreference: ThemePreference) {
  // Repo-Konvention (siehe `src/app/m/qr/_lib/test-dom.tsx`): ohne dieses Flag
  // meldet React bei jedem `act()`-Aufruf eine Umgebungswarnung auf stderr —
  // Rauschen, das eine saubere Testausgabe verdeckt.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AntdProvider initialMode={initialMode} initialPreference={initialPreference}>
        <Sonde />
      </AntdProvider>,
    );
  });
}

function umschalten(ziel: ThemePreference) {
  const testId = { auto: "nach-auto", dark: "nach-dunkel", light: "nach-hell" }[ziel];
  const knopf = container!.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!knopf) throw new Error(`Umschalt-Knopf fuer '${ziel}' nicht gefunden`);
  act(() => knopf.click());
}

function angezeigt(was: "modus" | "praeferenz") {
  return container!.querySelector(`[data-testid="${was}"]`)?.textContent;
}

describe("AntdProvider: die ausdrueckliche Wahl", () => {
  it("Wechsel auf dunkel setzt dataset.theme auf dem Wurzelelement — ohne Navigation", () => {
    matchMediaStellen(false);
    mount("light", "auto");

    umschalten("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(angezeigt("modus")).toBe("dark");
  });

  it("Regression: colorScheme wird weiterhin mitgeschrieben, nicht ersetzt", () => {
    matchMediaStellen(false);
    mount("light", "auto");

    umschalten("dark");

    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Regression: das Praeferenz-Cookie wird weiterhin geschrieben", () => {
    matchMediaStellen(false);
    mount("light", "auto");

    umschalten("dark");

    expect(document.cookie).toContain("iuk-theme-pref=dark");
  });

  // Der Fall, fuer den die ganze Cookie-Konstruktion existiert.
  it("eine ausdrueckliche Wahl schlaegt das System", () => {
    matchMediaStellen(true);
    mount("dark", "auto");

    umschalten("light");

    expect(angezeigt("modus")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("AntdProvider: der Auto-Modus", () => {
  it("schreibt den Systemwert schon beim Mounten ins Cookie", () => {
    matchMediaStellen(true);
    mount("light", "auto");

    expect(document.cookie).toContain("iuk-theme-system=dark");
  });

  // Der erste Besuch: der Server kannte den OS-Wert noch nicht und hat hell
  // geliefert. Der Client zieht einen Render spaeter nach.
  it("holt beim Mounten einen abweichenden Systemwert nach", () => {
    matchMediaStellen(true);
    mount("light", "auto");

    expect(angezeigt("modus")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("zieht bei einem OS-Wechsel waehrend der Sitzung nach", () => {
    const medien = matchMediaStellen(false);
    mount("light", "auto");
    expect(angezeigt("modus")).toBe("light");

    medien.wechseln(true);

    expect(angezeigt("modus")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // Die Gegenprobe: wer ausdruecklich gewaehlt hat, wird vom OS nicht mehr
  // umgestellt. Ohne diesen Test waere ein Effekt, der IMMER nachzieht, gruen.
  it("laesst eine ausdrueckliche Wahl bei einem OS-Wechsel in Ruhe", () => {
    const medien = matchMediaStellen(false);
    mount("light", "light");

    medien.wechseln(true);

    expect(angezeigt("modus")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    // Das Cookie wird trotzdem fortgeschrieben — sonst gilt beim spaeteren
    // Wechsel zurueck auf Auto ein veralteter Systemwert.
    expect(document.cookie).toContain("iuk-theme-system=dark");
  });

  it("zurueck auf Auto uebernimmt sofort den Systemwert", () => {
    matchMediaStellen(true);
    mount("light", "light");
    expect(angezeigt("modus")).toBe("light");

    umschalten("auto");

    expect(angezeigt("praeferenz")).toBe("auto");
    expect(angezeigt("modus")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // DIE INVARIANTE. `data-theme="auto"` besteht typecheck, build und Vitest
  // und kippt trotzdem jede Modulflaeche still auf helle Darstellung.
  it("stempelt NIE 'auto' auf das Wurzelelement", () => {
    matchMediaStellen(true);
    mount("dark", "dark");

    umschalten("auto");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
