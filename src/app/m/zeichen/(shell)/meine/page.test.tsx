// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { migrateAllModules } from "@/core/bootstrap";

/*
 * ECHTE DATENBANK, GEMOCKTE SITZUNG — dieselbe Bauform wie `actions.test.ts`. Der
 * Pruefgegenstand ist die DARSTELLUNG des gespeicherten Markups, und die haengt an
 * einer echten Zeile.
 */
const DIR = "./.data/zeichen-meine-test";
let angemeldet: string | null = null;

vi.mock("@/core/auth", () => ({
  auth: async () => (angemeldet === null ? null : { user: { id: angemeldet } }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const ANNA = "dev:anna@localtest.me";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  angemeldet = ANNA;
});

async function lege(svg: string, zusatz: Record<string, string> = {}) {
  const { getDb } = await import("../../_db/client");
  const { legeEigenesZeichenAn } = await import("../../_db/eigeneZeichen");
  legeEigenesZeichenAn(getDb(), {
    sub: ANNA,
    name: "Zugtrupp Nord",
    specJson: '{"kind":"formation"}',
    specKanon: "kind=formation",
    svg,
    paketVersion: "1.1.0",
    datenVersion: "0.2.0",
    ...zusatz,
  });
}

async function seite() {
  const MeineSeite = (await import("./page")).default;
  const html = renderToStaticMarkup(await MeineSeite());
  const knoten = document.createElement("div");
  knoten.innerHTML = html;
  return { html, knoten };
}

describe("Meine Zeichen", () => {
  /*
   * ⛔ DER WICHTIGSTE FALL DIESER DATEI (Spec §4.3). Das gespeicherte Markup kommt
   * vom Client; die Server Action kann es fachlich nicht nachpruefen, weil das
   * `composeFromCatalog` und damit den Katalog im Server-Graph braeuchte (M1). In
   * einem `<img>` mit `data:`-URL fuehrt ein SVG kein Script aus und laedt nichts
   * nach — DAS ist der Riegel, nicht die Formpruefung beim Speichern.
   */
  it("rendert das gespeicherte SVG als data-URL im img, nie als Markup", async () => {
    await lege("<svg><g/></svg>");
    const { html, knoten } = await seite();
    const bild = knoten.querySelector("img");
    expect(bild?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<g/>");
  });

  it("verlinkt in den Baukasten — mit Spec UND gespeicherter Paketfassung", async () => {
    await lege("<svg><g/></svg>");
    const { knoten } = await seite();
    const ziel = knoten.querySelector('a[href*="/m/zeichen/baukasten"]')?.getAttribute("href");
    expect(ziel).toContain(`s=${Buffer.from('{"kind":"formation"}').toString("base64url")}`);
    expect(ziel).toContain("v=1.1.0");
  });

  it("sagt bei einem aelteren Stand, dass heute ein neuerer gilt", async () => {
    await lege("<svg><g/></svg>", { paketVersion: "0.9.0" });
    const { html } = await seite();
    expect(html).toContain("neuerer Stand");
  });

  it("zeigt eine leere Liste als Satz mit Weg, nicht als Nichts", async () => {
    const { knoten } = await seite();
    expect(knoten.querySelector('[data-testid="tz-meine-leer"]')).not.toBeNull();
    expect(knoten.querySelector('a[href="/m/zeichen/baukasten"]')).not.toBeNull();
  });

  /* Ohne Sitzung gibt es die Seite nicht — `notFound()`, nicht eine leere Liste. */
  it("antwortet ohne Sitzung mit notFound", async () => {
    angemeldet = null;
    await expect(seite()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
