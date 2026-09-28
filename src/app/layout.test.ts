import { describe, it, expect, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  // Die Namen bilden `layout.tsx` ab: dort heiszen die drei Variablen nach der
  // SCHRIFT, nicht nach der Rolle — die Rollennamen gehoeren `globals.css`.
  Barlow: () => ({ variable: "--font-barlow" }),
  Barlow_Condensed: () => ({ variable: "--font-barlow-condensed" }),
  IBM_Plex_Mono: () => ({ variable: "--font-plex-mono" }),
}));

const kopf = vi.hoisted(() => ({ host: "" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(kopf.host ? { host: kopf.host } : {}),
}));

import { generateMetadata, viewport } from "./layout";

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

describe("Root-Layout — Favicon nach Host", () => {
  const icon = async (host: string) => {
    kopf.host = host;
    const { icons } = await generateMetadata();
    return (icons as { icon: { url: string } }).icon.url;
  };

  it("zeigt auf einem Modul-Host das Zeichen des Moduls", async () => {
    expect(await icon("qr.localtest.me:3000")).toMatch(/^\/favicon\/qr\.svg\?v=/);
    expect(await icon("radio.localtest.me")).toMatch(/^\/favicon\/radio\.svg\?v=/);
  });

  it("lässt lagerbuch sein eigenes Symbol", async () => {
    expect(await icon("lagerbuch.localtest.me")).toBe("/pwa-icon.svg");
  });

  it("zeigt sonst das IDA-Zeichen", async () => {
    expect(await icon("portal.localtest.me")).toMatch(/^\/favicon\/ida\.svg\?v=/);
    expect(await icon("")).toMatch(/^\/favicon\/ida\.svg\?v=/);
  });

  it("behält Titel und Beschreibung", async () => {
    kopf.host = "";
    const m = await generateMetadata();
    expect(m.title).toBe("IDA");
    expect(m.description).toBe("Interne Dienste und Anwendungen");
  });
});
