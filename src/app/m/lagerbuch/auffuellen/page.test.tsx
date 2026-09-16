// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * DIE AUFFUELLSTRECKE — DRK-313, AK2: „Der Zugriff ist auf GF beschränkt und
 * wird auch bei direktem Aufruf geprüft."
 *
 * ⚠️ WAS HIER HAENGT, IST DER RIEGEL, NICHT DAS AUSSEHEN. Ein Menueeintrag, den
 * eine Person nicht sieht, ist keine Beschraenkung — die Adresse ist trotzdem
 * abrufbar, und ein Layout darueber ist keine Sicherheitsgrenze (Falle 17).
 * Zugesichert wird deshalb an ALLEN DREI Dateien der Strecke einzeln, dass sie
 * `requireLagerbuchAdmin` selbst rufen und dass ein Wurf von dort sie
 * vollstaendig anhaelt.
 *
 * ⚠️ DER RIEGEL WIRFT IN BEIDEN ABWEISENDEN LAGEN, und das ist der Grund,
 * warum `rejects.toThrow` hier eine Aussage ist: ohne Sitzung leitet er nach
 * `/login` um (ein `redirect()` ist ein Wurf), mit Sitzung ohne Gruppe ruft er
 * `notFound()`. Eine Seite, die den Riegel zwar ruft, sein Ergebnis aber nicht
 * abwartet, liefe hier durch — genau deshalb steht `await` davor.
 *
 * ⚠️ EIN KAERTCHEN KOMMT AUF DIESER STRECKE NICHT VOR. `requireHelferSitzung`
 * wird gar nicht erst gemockt: taucht es je in einer der drei Dateien auf,
 * bricht der Import mit einem unaufgeloesten Modulzugriff statt still eine
 * zweite Tuer zu oeffnen.
 */
const { riegel } = vi.hoisted(() => ({ riegel: vi.fn<() => Promise<unknown>>() }));

vi.mock("../_lib/zugang", () => ({ requireLagerbuchAdmin: () => riegel() }));

vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../_db/client", () => ({ getDb: () => ({ marke: "test-db" }) }));

const liste = vi.fn<(...args: unknown[]) => unknown[]>(() => []);
const detail = vi.fn<(...args: unknown[]) => unknown>(() => null);
vi.mock("../_lib/lesepfade/artikel", () => ({
  artikelListe: (...args: unknown[]) => liste(...args),
  artikelDetailHelfer: (...args: unknown[]) => detail(...args),
}));

const ziele = vi.fn(() => [{ id: "handlager", name: "Handlager (ohne Schrank)", zugangshinweis: null }]);
vi.mock("../_lib/lesepfade/orte", () => ({ zugangsZiele: () => ziele() }));

vi.mock("../_actions/buchung", () => ({ bucheAuffuellung: vi.fn() }));

/*
 * Die Oberflaechenteile werden durch Attrappen ersetzt, die ihre Props an den
 * GERENDERTEN Baum haengen (N-8: eine Zusage ueber das Ergebnis gehoert an den
 * Baum, nicht an den Dateitext).
 */
vi.mock("../_ui/ArtikelSuche", () => ({
  ArtikelSuche: (p: { artikel: Record<string, unknown>[]; basis: string }) => (
    <div data-rolle="suche" data-basis={p.basis} data-anzahl={String(p.artikel.length)} />
  ),
}));
vi.mock("../_ui/AuffuellRahmen", () => ({
  AuffuellRahmen: (p: { etikett: string; children: ReactNode }) => (
    <div data-rolle="rahmen" data-etikett={p.etikett}>{p.children}</div>
  ),
}));
vi.mock("../_ui/Auffuellen", () => ({
  Auffuellen: (p: { detail: { name: string }; ziele: unknown[] }) => (
    <div data-rolle="insel" data-artikel={p.detail.name} data-ziele={String(p.ziele.length)} />
  ),
}));

import AuffuellenSeite, { dynamic as seiteDynamic } from "./page";
import AuffuellenLayout, { dynamic as layoutDynamic } from "./layout";
import AuffuellenArtikelSeite from "./[artikelId]/page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const VIEWER = { sub: "u-gf", groups: ["lagerbuch_nutzer"], name: "G. Führer", email: null };

beforeEach(() => { riegel.mockResolvedValue(VIEWER); detail.mockReturnValue(null); });
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

const params = (artikelId: string) => Promise.resolve({ artikelId });

describe("auffuellen — der Riegel steht an jeder der drei Dateien einzeln", () => {
  it("das Layout ruft ihn", async () => {
    await AuffuellenLayout({ children: null });
    expect(riegel).toHaveBeenCalledTimes(1);
  });

  it("die Artikelliste ruft ihn SELBST — ein Layout reicht keine Props", async () => {
    await AuffuellenSeite();
    expect(riegel).toHaveBeenCalledTimes(1);
  });

  it("die Artikelseite ruft ihn SELBST", async () => {
    await AuffuellenArtikelSeite({ params: params("art-1") });
    expect(riegel).toHaveBeenCalledTimes(1);
  });

  it("ohne Sitzung kommt keine der drei Dateien durch", async () => {
    riegel.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));
    await expect(AuffuellenLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/login");
    await expect(AuffuellenSeite()).rejects.toThrow("NEXT_REDIRECT:/login");
    await expect(AuffuellenArtikelSeite({ params: params("art-1") }))
      .rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("angemeldet OHNE die Lagerbuch-Gruppe endet in 404, nicht in der Ansicht", async () => {
    riegel.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(AuffuellenSeite()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(AuffuellenArtikelSeite({ params: params("art-1") }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(liste).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });

  /** Beide Seiten und das Layout sind `force-dynamic` — eine zwischengespeicherte
   *  Auffuellansicht waere eine Ansicht ohne Riegel. */
  it("beide Einstiegsdateien sind dynamisch", () => {
    expect(seiteDynamic).toBe("force-dynamic");
    expect(layoutDynamic).toBe("force-dynamic");
  });
});

describe("auffuellen — die Liste zeigt auf die Auffuellstrecke, nicht auf die Entnahme", () => {
  it("reicht `basis=/auffuellen` an die Suche", async () => {
    await mount(await AuffuellenSeite());
    expect(query('[data-rolle="suche"]').dataset.basis).toBe("/auffuellen");
  });

  it("nennt die Richtung, weil die Flaeche der Entnahme gleicht", async () => {
    await mount(await AuffuellenSeite());
    expect(query('[data-rolle="auffuellen-hinweis"]').textContent)
      .toContain("Hier kommt Material ins Handlager");
  });

  it("traegt das Etikett der angemeldeten Person, nicht ein Kaertchen-Label", async () => {
    await mount(await AuffuellenSeite());
    expect(query('[data-rolle="rahmen"]').dataset.etikett).toBe("Angemeldet: G. Führer");
  });
});

describe("auffuellen/[artikelId] — Insel oder benannter Leerzustand", () => {
  it("reicht Artikel und Ziele an die Insel", async () => {
    detail.mockReturnValue({
      id: "art-1", name: "Mullbinde", einheit: "Stk", fach: "A-01", bestand: 10,
      chargen: [{ id: "ch-1", chargenNr: "L1", verfall: "2027-03", rest: 6, ampel: "gruen", text: "ok" }],
    });
    await mount(await AuffuellenArtikelSeite({ params: params("art-1") }));
    expect(query('[data-rolle="insel"]').dataset.artikel).toBe("Mullbinde");
    expect(query('[data-rolle="insel"]').dataset.ziele).toBe("1");
  });

  /*
   * HTTP 200 MIT EINEM SATZ statt einer Suite-404 — nach einer 404 weiss
   * niemand, ob der Artikel geloescht wurde oder der Link veraltet ist.
   */
  it("ein unbekannter Artikel ergibt einen benannten Leerzustand mit Rueckweg", async () => {
    await mount(await AuffuellenArtikelSeite({ params: params("gibt-es-nicht") }));
    expect(exists('[data-rolle="insel"]')).toBe(false);
    expect(query('[data-rolle="leer-titel"]').textContent).toBe("Diesen Artikel gibt es nicht");
    expect(query<HTMLAnchorElement>('[data-rolle="leer-weg"]').getAttribute("href"))
      .toBe("/auffuellen");
  });
});
