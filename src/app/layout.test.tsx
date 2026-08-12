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
 *
 * DIE FAMILIE-VARIABLE-BINDUNG (Nachschaerfung Gesamtreview). Die urspruengliche
 * Fassung ignorierte ihr Argument (`Barlow: () => ({ variable: "--font-body" })`)
 * und lieferte den Wert unabhaengig davon, was `layout.tsx` uebergab. Vertauscht
 * `layout.tsx` die `variable:`-Werte von `Barlow` und `Barlow_Condensed`, blieb
 * dieser Mock — und damit der Test — gruen: gueltiges CSS/JSX, alle Gates
 * gruen, Bruch still (Falle 2, ganzer Fliesstext in Barlow Condensed).
 *
 * Der Mock echot deshalb sein Argument, und `vi.fn()` haelt fest, WELCHER
 * Aufruf welche Variable bekam — die Assertion unten prueft die Paarung
 * Familie ↔ Variable, nicht nur, dass beide Werte irgendwo auftauchen.
 */
const fontMocks = vi.hoisted(() => ({
  barlow: vi.fn((optionen: { variable: string }) => ({ variable: optionen.variable })),
  barlowCondensed: vi.fn((optionen: { variable: string }) => ({ variable: optionen.variable })),
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Barlow: fontMocks.barlow,
  Barlow_Condensed: fontMocks.barlowCondensed,
  IBM_Plex_Mono: () => ({ variable: "--font-mono" }),
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
    Record<string, unknown> & { className?: string; style?: { colorScheme?: string } }
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

  /**
   * DIE ADDITIVITAETS-INVARIANTE (Task 6, Fix-Runde 1). Der urspruengliche Scan
   * dafuer stand in `bauform.test.ts` und pruefte `/<html[^>]*className=/` —
   * das matcht JEDES `<html>` mit IRGENDEINER `className`, unabhaengig vom
   * Inhalt. Ein kuenftiger Umbau, der die beiden Geist-Klassen durch die drei
   * neuen ERSETZT statt sie zu ergaenzen — oder umgekehrt eine der drei neuen
   * entfernt, waehrend die `next/font`-Deklaration stehen bleibt — liefe durch
   * diesen Scan, durch `typecheck` und durch `lint` genauso durch: gueltiges
   * CSS/JSX, alle Gates gruen, Bruch still. Genau der Fehlertyp, gegen den
   * dieses Repo geschrieben ist.
   *
   * Deshalb hier statt dort: diese Datei haelt `html.props` schon in der Hand
   * (siehe `data-theme`/`colorScheme` oben) — ein echter Property-Test auf dem
   * tatsaechlichen `className`-Wert ist staerker als ein Quelltext-Scan auf die
   * blosse Anwesenheit des Attributs.
   *
   * `bauform.test.ts` behaelt seinen Scan — er deckt die andere Haelfte (dass
   * die drei `next/font`-Aufrufe ueberhaupt existieren und eine der drei
   * Font-Variablen als `variable:` setzen). Diese beiden Zusicherungen
   * ergaenzen sich; keine ersetzt die andere.
   *
   * Mutationsprobe (beide Richtungen, vor dem Commit von Hand durchgefuehrt):
   * eine Geist-Klasse aus dem `className`-Template in `layout.tsx` entfernt ->
   * dieser Test wird rot. Eine der drei neuen Klassen entfernt -> ebenfalls
   * rot. Beide Richtungen sind damit tatsaechlich gedeckt, nicht nur behauptet.
   */
  it("Additivitaet: <html> traegt alle FUENF Font-Variablen, Geist bleibt neben den drei neuen stehen", async () => {
    const html = await htmlElement("light");
    const klassen = (html.props.className ?? "").split(/\s+/).filter(Boolean);

    for (const name of [
      "--font-geist-sans",
      "--font-geist-mono",
      "--font-body",
      "--font-display",
      "--font-mono",
    ]) {
      expect(klassen, `${name} fehlt in der className des <html>-Elements`).toContain(name);
    }
  });

  /**
   * Ergaenzt die Additivitaets-Probe oben: die pruefte nur, dass alle fuenf
   * Variablennamen IRGENDWO in der className stehen — eine Vertauschung der
   * beiden Barlow-Werte liesse beide weiterhin auftauchen, nur an der
   * falschen Familie. `fontMocks` haelt fest, mit welchem Argument `Barlow`
   * bzw. `Barlow_Condensed` tatsaechlich aufgerufen wurden; das bindet die
   * Zusicherung an die Familie, nicht nur an die blosse Anwesenheit des Werts.
   */
  it("Familie ↔ Variable: Barlow traegt --font-body, Barlow_Condensed traegt --font-display", () => {
    // `barlow`/`barlowCondensed` in `layout.tsx` sind Modul-Konstanten — der
    // Aufruf geschah beim Import oben, nicht erst beim Rendern.
    expect(fontMocks.barlow).toHaveBeenCalledWith(expect.objectContaining({ variable: "--font-body" }));
    expect(fontMocks.barlowCondensed).toHaveBeenCalledWith(
      expect.objectContaining({ variable: "--font-display" }),
    );
  });
});
