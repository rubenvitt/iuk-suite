import { describe, it, expect, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import { viewport } from "./layout";

/**
 * DIE ZOOM-SPERRE IST EINE BETREIBERENTSCHEIDUNG, KEIN VERSEHEN.
 *
 * `user-scalable=no` verletzt WCAG 1.4.4 (Text auf 200 % vergroesserbar). Die
 * Entscheidung wurde bewusst getroffen; dieser Test haelt sie fest, damit
 * niemand sie fuer einen Fehler haelt und "korrigiert", und damit niemand sie
 * still verliert.
 *
 * Sie haengt an der 16px-Untergrenze fuer Eingabefelder (globals.css,
 * theme.ts): ohne Zoom kann niemand mehr heranholen, was zu klein ist. Wer
 * eine der beiden Regeln anfasst, prueft die andere mit.
 *
 * `viewportFit: "cover"` gehoert ausdruecklich NICHT dazu — es waere eine
 * andere Anforderung (randlose Darstellung) und verpflichtete jede Flaeche der
 * Suite auf `env(safe-area-inset-*)`.
 */
describe("Root-Layout — Viewport", () => {
  it("sperrt den Zoom", () => {
    expect(viewport.userScalable).toBe(false);
    expect(viewport.maximumScale).toBe(1);
  });

  it("bleibt auf Geraetebreite mit Anfangsmassstab 1", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });

  it("schaltet NICHT auf randlose Darstellung", () => {
    expect(viewport.viewportFit).toBeUndefined();
  });
});
