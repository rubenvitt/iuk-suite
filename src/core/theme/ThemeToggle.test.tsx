// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AntdProvider } from "./AntdProvider";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Der Dreier-Zyklus, ueber echte Klicks im echten Provider — nicht gegen eine
 * herausgeloeste Zyklus-Tabelle. Der Test soll den Weg pruefen, den ein Finger
 * nimmt: Klick -> Praeferenz -> aufgeloester Modus -> `dataset.theme`.
 *
 * `window.matchMedia` gibt es in jsdom nicht; der Provider wirft sonst beim
 * Mounten.
 */
let root: Root | null = null;
let container: HTMLElement | null = null;

function matchMediaStellen(dunkel: boolean) {
  window.matchMedia = (() => ({
    matches: dunkel,
    media: "(prefers-color-scheme: dark)",
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  matchMediaStellen(true);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  document.cookie = "iuk-theme-pref=; Path=/; Max-Age=0";
  document.cookie = "iuk-theme-system=; Path=/; Max-Age=0";
});

function mount() {
  // Repo-Konvention (siehe `AntdProvider.test.tsx`): ohne dieses Flag meldet
  // React bei jedem `act()`-Aufruf eine Umgebungswarnung auf stderr —
  // Rauschen, das eine saubere Testausgabe verdeckt.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AntdProvider initialMode="dark" initialPreference="auto">
        <ThemeToggle />
      </AntdProvider>,
    );
  });
}

function knopf(): HTMLButtonElement {
  const k = container!.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]');
  if (!k) throw new Error("Umschalter nicht gefunden");
  return k;
}

describe("ThemeToggle: Dreier-Zyklus", () => {
  it("laeuft auto -> hell -> dunkel -> auto", () => {
    mount();
    expect(knopf().getAttribute("aria-label")).toContain("Automatisch");

    act(() => knopf().click());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(knopf().getAttribute("aria-label")).toContain("Design: Hell");

    act(() => knopf().click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(knopf().getAttribute("aria-label")).toContain("Design: Dunkel");

    // Rundum: das System steht auf dunkel, also bleibt es dunkel — aber die
    // Praeferenz ist wieder 'auto'.
    act(() => knopf().click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("iuk-theme-pref=auto");
    expect(knopf().getAttribute("aria-label")).toContain("Automatisch");
  });

  // Ein Zyklus, dessen Label nur das Ziel nennt, zwingt zum Raten, was gerade
  // gilt. Beides muss drinstehen.
  it("das Label nennt den geltenden Zustand UND das Ziel des naechsten Klicks", () => {
    mount();

    const label = knopf().getAttribute("aria-label") ?? "";
    expect(label).toContain("Automatisch (folgt dem Gerät)");
    expect(label).toContain("weiter zu Hell");
  });
});
