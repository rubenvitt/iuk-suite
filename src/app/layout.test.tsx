import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

/**
 * `data-theme` auf `<html>` ist der verbindliche Selektor fuer jedes kuenftige
 * CSS-Modul der Suite. Auf `prefers-color-scheme` zu selektieren waere falsch:
 * die Suite hat einen Umschalter (Cookie `iuk-theme`, serverseitig gelesen),
 * und dann bricht der Fall "System dunkel, Umschalter hell". `colorScheme`
 * bleibt zusaetzlich stehen — es zieht Scrollbalken und native Bedienelemente
 * mit, was ein Attribut nicht kann. Dieser Test haelt BEIDES fest, damit
 * niemand das eine gegen das andere austauscht.
 *
 * Gerendert wird nicht: `RootLayout` ist eine Server Component, ihr Rueckgabe-
 * wert ist ein React-Element. Dessen Props zu lesen prueft genau die Zusage,
 * ohne antd, AntdRegistry oder eine DOM-Umgebung hochzufahren.
 */
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Barlow: () => ({ variable: "--font-body" }),
  Barlow_Condensed: () => ({ variable: "--font-display" }),
  IBM_Plex_Mono: () => ({ variable: "--font-mono" }),
}));

const get = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get }),
}));

import RootLayout from "./layout";

async function htmlElement(cookieValue: string | undefined) {
  get.mockReturnValue(cookieValue === undefined ? undefined : { value: cookieValue });
  return (await RootLayout({ children: null })) as ReactElement<
    Record<string, unknown> & { style?: { colorScheme?: string } }
  >;
}

describe("Wurzel-Layout: Theme-Signal fuer CSS", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("Modus hell: <html> traegt data-theme='light'", async () => {
    const html = await htmlElement("light");

    expect(html.type).toBe("html");
    expect(html.props["data-theme"]).toBe("light");
  });

  it("Modus dunkel: <html> traegt data-theme='dark'", async () => {
    const html = await htmlElement("dark");

    expect(html.props["data-theme"]).toBe("dark");
  });

  it("kein Cookie: faellt auf 'light' zurueck, wie parseThemeMode", async () => {
    const html = await htmlElement(undefined);

    expect(html.props["data-theme"]).toBe("light");
  });

  it("Regression: colorScheme bleibt ZUSAETZLICH gesetzt, nicht ersetzt", async () => {
    expect((await htmlElement("dark")).props.style?.colorScheme).toBe("dark");
    expect((await htmlElement("light")).props.style?.colorScheme).toBe("light");
  });

  it("data-theme und colorScheme sagen immer dasselbe", async () => {
    for (const modus of ["light", "dark"] as const) {
      const html = await htmlElement(modus);
      expect(html.props["data-theme"]).toBe(html.props.style?.colorScheme);
    }
  });
});
