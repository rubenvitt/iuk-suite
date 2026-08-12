import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

/**
 * `data-theme` auf `<html>` ist der verbindliche Selektor fuer jedes kuenftige
 * CSS-Modul der Suite. Auf `prefers-color-scheme` zu selektieren waere falsch:
 * die Suite hat einen Umschalter mit DREI Zustaenden (`iuk-theme-pref`,
 * serverseitig gelesen), und dann bricht der Fall "System dunkel, Umschalter
 * hell". Der Auto-Zustand loest der Server aus dem zweiten Cookie
 * `iuk-theme-system` auf — er sieht die Medienabfrage selbst nicht.
 * `colorScheme` bleibt zusaetzlich stehen — es zieht Scrollbalken und native
 * Bedienelemente mit, was ein Attribut nicht kann. Dieser Test haelt BEIDES
 * fest, damit niemand das eine gegen das andere austauscht.
 *
 * Gerendert wird nicht: `RootLayout` ist eine Server Component, ihr Rueckgabe-
 * wert ist ein React-Element. Dessen Props zu lesen prueft genau die Zusage,
 * ohne antd, AntdRegistry oder eine DOM-Umgebung hochzufahren.
 */
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

const get = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get }),
}));

import RootLayout from "./layout";

async function htmlElement(kekse: { pref?: string; system?: string }) {
  get.mockImplementation((name: string) => {
    const wert = name === "iuk-theme-pref" ? kekse.pref : name === "iuk-theme-system" ? kekse.system : undefined;
    return wert === undefined ? undefined : { value: wert };
  });
  return (await RootLayout({ children: null })) as ReactElement<
    Record<string, unknown> & { style?: { colorScheme?: string } }
  >;
}

describe("Wurzel-Layout: Theme-Signal fuer CSS", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("Wahl hell: <html> traegt data-theme='light'", async () => {
    const html = await htmlElement({ pref: "light", system: "dark" });

    expect(html.type).toBe("html");
    expect(html.props["data-theme"]).toBe("light");
  });

  it("Wahl dunkel: <html> traegt data-theme='dark'", async () => {
    const html = await htmlElement({ pref: "dark", system: "light" });

    expect(html.props["data-theme"]).toBe("dark");
  });

  // Der Regelfall nach der Umstellung: niemand hat den neuen Schluessel.
  it("kein Praeferenz-Cookie: der Systemwert entscheidet", async () => {
    expect((await htmlElement({ system: "dark" })).props["data-theme"]).toBe("dark");
    expect((await htmlElement({ system: "light" })).props["data-theme"]).toBe("light");
  });

  // Der allererste Besuch, bevor das Init-Script gelaufen ist.
  it("gar kein Cookie: faellt auf 'light' zurueck", async () => {
    const html = await htmlElement({});

    expect(html.props["data-theme"]).toBe("light");
  });

  // DIE INVARIANTE: 'auto' darf das Wurzelelement nie erreichen.
  it("Praeferenz 'auto' wird aufgeloest, nicht durchgereicht", async () => {
    const html = await htmlElement({ pref: "auto", system: "dark" });

    expect(html.props["data-theme"]).toBe("dark");
    expect(html.props.style?.colorScheme).toBe("dark");
  });

  it("Regression: colorScheme bleibt ZUSAETZLICH gesetzt, nicht ersetzt", async () => {
    expect((await htmlElement({ pref: "dark" })).props.style?.colorScheme).toBe("dark");
    expect((await htmlElement({ pref: "light" })).props.style?.colorScheme).toBe("light");
  });

  it("data-theme und colorScheme sagen immer dasselbe", async () => {
    for (const kekse of [{ pref: "light" }, { pref: "dark" }, { system: "dark" }, {}]) {
      const html = await htmlElement(kekse);
      expect(html.props["data-theme"]).toBe(html.props.style?.colorScheme);
    }
  });
});
