// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DER MODULTITEL IM KOPF IST EIN LINK (Entwurf feedback-admin §4.1, §5.1).
 *
 * Uebernommen aus der abgeloesten `FullShell.test.tsx`: wer sich in einem Modul
 * verlaufen hatte, kam ohne diesen Link nur ueber die Zurueck-Taste zurueck.
 * Der Defekt hing an der Shell, nicht am Modul — deshalb pruefen diese Tests
 * ALLE Module mit Chrome, nicht nur das, das den Anlass gab.
 *
 * Zwei Zusagen, die still brechen wuerden:
 * 1. `data-testid="module-title"` bleibt auf dem `<strong>`, INNERHALB des
 *    Links. Der Keystone-E2E fragt es dort ab; waere es an den Link gewandert,
 *    faende der Test weiterhin den richtigen Text und niemandem fiele auf, dass
 *    die Zusage verschoben wurde.
 * 2. Die Kopfzeile traegt `data-testid="suite-header"` — der alte Name
 *    `full-shell-header` ist bewusst weg, weil die Kopfzeile jetzt auch in
 *    `minimal` steht. Die E2E-Dateien sind mit umgeschrieben.
 *
 * `SuiteNav` ist ersetzt: es ist eine Client-Komponente mit antd-Kontext
 * (`useThemeMode` wirft ausserhalb des Providers), und geprueft wird hier die
 * Kopfzeile, nicht ihr Inhalt.
 */
const { authMock, suiteNavMock, modulnavMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  suiteNavMock: vi.fn(() => null),
  // Ein sichtbarer Platzhalter statt `null`: nur so laesst sich pruefen, WO im
  // Baum die zweite Zeile landet (siehe den Test dazu unten).
  modulnavMock: vi.fn(() => <i data-testid="modulnav-platz" />),
}));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/shell/SuiteNav", () => ({ SuiteNav: suiteNavMock, Modulnav: modulnavMock }));

import { SuiteHeader } from "./SuiteHeader";
import { moduleUrl } from "./moduleUrl";
import { MODULES } from "@/core/registry";
import type { SuiteNavItem } from "./types";

/** Genau die Module mit Chrome — aus der Registry gelesen, nicht behauptet. */
const MIT_CHROME = MODULES.filter((m) => m.shell === "full" || m.shell === "minimal").map(
  (m) => m.key,
);

async function zeichne(moduleKey: string, nav?: SuiteNavItem[]): Promise<HTMLElement> {
  authMock.mockResolvedValue({ user: { name: "Test", groups: [] } });
  const element = await SuiteHeader({ moduleKey, nav });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

const titel = (wirt: HTMLElement) => wirt.querySelector<HTMLElement>('[data-testid="module-title"]');

describe("SuiteHeader", () => {
  it("kennt mehr als ein Modul mit Chrome (sonst waere der Test wertlos)", () => {
    expect(MIT_CHROME.length).toBeGreaterThan(1);
    expect(MIT_CHROME).toContain("feedback");
    // qr ist `minimal` und bekommt die Kopfzeile NEU — das ist die
    // Verhaltensaenderung dieses Vorhabens.
    expect(MIT_CHROME).toContain("qr");
  });

  it.each(MIT_CHROME)("wickelt den Titel von `%s` in einen Link auf moduleUrl", async (key) => {
    const wirt = await zeichne(key);
    const strong = titel(wirt);
    expect(strong).not.toBeNull();
    expect(strong!.tagName).toBe("STRONG");
    const link = strong!.closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(moduleUrl(key) ?? "/");
  });

  it("traegt data-testid=suite-header", async () => {
    expect(
      (await zeichne("feedback")).querySelector('[data-testid="suite-header"]'),
    ).not.toBeNull();
  });

  it("zeigt den Titel des Moduls, nicht seinen Schluessel", async () => {
    expect(titel(await zeichne("gamma"))!.textContent).toBe("Gamma");
  });

  it("reicht eine leere Modulnavigation weiter, statt eine zu erfinden", async () => {
    // `toBeTruthy()` auf dem Rueckgabewert waere hier wertlos gewesen: eine
    // Komponente, die nicht wirft, liefert immer etwas Wahrheitswertiges. Die
    // Zusage lautet aber "Module, die nichts uebergeben, bekommen genau das
    // heutige Bild" — pruefbar allein daran, WOMIT SuiteNav gerufen wird.
    suiteNavMock.mockClear();
    await zeichne("gamma");
    // Zweites Argument ist Reacts Komponentenparameter (hier `undefined`, nicht
    // ein Ref-Objekt) — geprueft am tatsaechlichen Aufruf, nicht geraten.
    expect(suiteNavMock).toHaveBeenCalledWith(expect.objectContaining({ nav: [] }), undefined);
  });

  it("reicht eine uebergebene Modulnavigation unveraendert durch", async () => {
    const nav = [
      { key: "start", title: "Übersicht", href: "/" },
      { key: "vergleich", title: "Vergleich", href: "/vergleich" },
    ];
    suiteNavMock.mockClear();
    modulnavMock.mockClear();
    await zeichne("feedback", nav);
    // An BEIDE: `SuiteNav` braucht sie fuer den Drawer (mobil), `Modulnav` fuer
    // die sichtbare zweite Zeile (ab 768px).
    expect(suiteNavMock).toHaveBeenCalledWith(expect.objectContaining({ nav }), undefined);
    expect(modulnavMock).toHaveBeenCalledWith(expect.objectContaining({ nav }), undefined);
  });

  it("haengt die Modulnavigation NEBEN die Kopfzeile, nicht hinein", async () => {
    /*
     * DIE STRUKTURZUSAGE DIESES FIXES.
     *
     * Solange die Modulnavigation im `<Header>` sasz, war sie dort das dritte
     * Kind eines Flex-Containers und konkurrierte mit dem Modultitel um die
     * Breite. Zwischen 768px und 903px gewann sie: der Titel mass 0px, die
     * Seite scrollte seitwaerts (rechte Kante 904px). Der Titel ist der Link
     * zurueck auf die Modulstartseite — ohne ihn ist jede Unterseite eine
     * Sackgasse. Der Entwurf (§4, Tabelle) sah immer eine „zweite Zeile" vor.
     *
     * Hier und nicht nur im E2E, weil der E2E die Geometrie prueft und nicht
     * den Baum: eine Fassung, die bei 1280px zufaellig passt, waere dort gruen.
     */
    const wirt = await zeichne("feedback", [{ key: "start", title: "Übersicht", href: "/" }]);
    const kopf = wirt.querySelector('[data-testid="suite-header"]')!;
    expect(wirt.querySelector('[data-testid="modulnav-platz"]')).not.toBeNull();
    expect(kopf.querySelector('[data-testid="modulnav-platz"]')).toBeNull();
  });
});
