// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DER MODULTITEL IM KOPF IST DER APP-UMSCHALTER — ANGEMELDET. ANONYM BLEIBT ER
 * EIN LINK (Entwurf feedback-admin §4.1, §5.1; Suite-Chrome §6).
 *
 * Uebernommen aus der abgeloesten `FullShell.test.tsx`: wer sich in einem Modul
 * verlaufen hatte, kam ohne einen Weg zurück nur über die Zurück-Taste
 * zurück. Der Defekt hing an der Shell, nicht am Modul — deshalb prüfen diese
 * Tests ALLE Module mit Chrome, nicht nur das, das den Anlass gab.
 *
 * Drei Zusagen, die still brechen würden:
 * 1. `data-testid="module-title"` steht in GENAU EINEM Zweig — angemeldet auf
 *    dem `<strong>` im Auslöser von `AppUmschalter`, anonym auf dem `<strong>`
 *    im `Link`. Nie in beiden: der Keystone-E2E fragt es ab, und zwei Treffer
 *    wären für Playwright eine Strict-Mode-Verletzung.
 * 2. Die Kopfzeile traegt `data-testid="suite-header"` — der alte Name
 *    `full-shell-header` ist bewusst weg, weil die Kopfzeile jetzt auch in
 *    `minimal` steht. Die E2E-Dateien sind mit umgeschrieben.
 * 3. `launcherEintraege` (die Portal-Datenbank) wird NUR angemeldet gerufen.
 *    `MinimalShell` nutzt dieselbe Kopfzeile wie `FullShell` — sonst öffnete
 *    jeder anonyme Aufruf von `qr` und `beta` die Portal-Datenbank für eine
 *    Liste, die anonym gar nicht erscheint (der Umschalter existiert anonym
 *    nicht).
 *
 * `SuiteNav` ist gemockt: es ist eine Client-Komponente mit antd-Kontext
 * (`useThemeMode` wirft ausserhalb des Providers), und geprueft wird hier die
 * Kopfzeile, nicht ihr Inhalt. `AppUmschalter` ist NICHT gemockt — es braucht
 * keinen antd-Kontext (reines HTML plus `@ant-design/icons`) und sein
 * geschlossener Zustand (Auslöser + `module-title`) lässt sich ohne
 * Interaktion in `renderToStaticMarkup` beobachten. Ein Mock prüfte hier nur
 * gegen sich selbst.
 */
const { authMock, suiteNavMock, launcherEintraegeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  suiteNavMock: vi.fn(() => null),
  launcherEintraegeMock: vi.fn(async () => []),
}));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/shell/SuiteNav", () => ({ SuiteNav: suiteNavMock }));
vi.mock("@/core/shell/launcherEintraege", () => ({ launcherEintraege: launcherEintraegeMock }));

import { SuiteHeader } from "./SuiteHeader";
import { moduleUrl } from "./moduleUrl";
import { MODULES } from "@/core/registry";
import type { SuiteNavItem } from "./types";

/** Genau die Module mit Chrome — aus der Registry gelesen, nicht behauptet. */
const MIT_CHROME = MODULES.filter((m) => m.shell === "full" || m.shell === "minimal").map(
  (m) => m.key,
);

async function zeichne(
  moduleKey: string,
  nav?: SuiteNavItem[],
  angemeldet = true,
): Promise<HTMLElement> {
  authMock.mockResolvedValue(angemeldet ? { user: { name: "Test", groups: [] } } : null);
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

  it.each(MIT_CHROME)("wickelt den Titel von `%s` anonym in einen Link auf moduleUrl", async (key) => {
    const wirt = await zeichne(key, undefined, false);
    const strong = titel(wirt);
    expect(strong).not.toBeNull();
    expect(strong!.tagName).toBe("STRONG");
    const link = strong!.closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(moduleUrl(key) ?? "/");
  });

  it.each(MIT_CHROME)(
    "zeigt den Titel von `%s` angemeldet im App-Umschalter, nicht im Link",
    async (key) => {
      const wirt = await zeichne(key, undefined, true);
      const strong = titel(wirt);
      expect(strong).not.toBeNull();
      expect(strong!.closest("a")).toBeNull();
      const ausloeser = wirt.querySelector('[data-testid="app-umschalter"]');
      expect(ausloeser).not.toBeNull();
      expect(ausloeser!.contains(strong)).toBe(true);
      // Geschlossen im Ausgangszustand — der Keystone-E2E öffnet erst explizit.
      expect(ausloeser!.getAttribute("aria-expanded")).toBe("false");
    },
  );

  it("trägt data-testid=module-title in GENAU EINEM Zweig — nie in beiden", async () => {
    // Zwei Treffer wären für Playwright eine Strict-Mode-Verletzung
    // (`getByTestId` findet dann zwei Knoten statt einem).
    const angemeldetWirt = await zeichne("feedback", undefined, true);
    expect(angemeldetWirt.querySelectorAll('[data-testid="module-title"]')).toHaveLength(1);
    expect(angemeldetWirt.querySelector('[data-testid="app-umschalter"]')).not.toBeNull();

    const anonymWirt = await zeichne("feedback", undefined, false);
    expect(anonymWirt.querySelectorAll('[data-testid="module-title"]')).toHaveLength(1);
    expect(anonymWirt.querySelector('[data-testid="app-umschalter"]')).toBeNull();
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
    await zeichne("feedback", nav);
    // `SuiteNav` braucht sie fuer den Drawer (mobil) — die Seitenleiste
    // (`SuiteRahmen`) bekommt dieselbe Navigation unabhaengig vom Kopf.
    expect(suiteNavMock).toHaveBeenCalledWith(expect.objectContaining({ nav }), undefined);
  });

  // KEIN Test „rendert keine zweite Zeile mehr unter der Kopfzeile" hier: in
  // diesem Testaufbau ist `SuiteNav` auf `() => null` gemockt und es gibt
  // keinen `Modulnav`-Mock — `[data-testid="modulnav"]` kann in diesem DOM
  // strukturell nie treffen, die Zusicherung waere tautologisch und finge
  // einen Rueckbau mit anderem Namen nicht. Die Aussage „es gibt keine zweite
  // Zeile mehr" ist bereits doppelt getragen: `shell-css.test.ts`
  // ("kennt die Klasse .modulnav nicht mehr") und `navAbschnitte.test.ts`
  // (kein `hatAbschnitte`-Export mehr).

  it("ruft launcherEintraege NUR angemeldet — anonym bleibt die Portal-Datenbank ungelesen", async () => {
    /*
     * DIESE ZUSICHERUNG WIRD MIT DIESEM UMBAU WIEDER SCHARF. `launcherEintraege`
     * erreicht über `dienstEintraege` die Portal-Datenbank; anders als das
     * frühere `modulEintraege` (synchron, ohne DB) ist ein anonymer Aufruf
     * hier also nicht mehr kostenlos.
     *
     * `MinimalShell` nutzt DIESELBE Kopfzeile wie `FullShell`
     * (`SuiteHeader.tsx`) — sonst öffnete jeder anonyme Aufruf von `qr` und
     * `beta` die Portal-Datenbank für eine Liste, die anonym gar nicht
     * erscheint: der Umschalter existiert anonym nicht (siehe JSX-Kommentar in
     * `SuiteHeader.tsx`), nur der Link auf `moduleUrl`.
     */
    launcherEintraegeMock.mockClear();

    authMock.mockResolvedValue(null);
    renderToStaticMarkup(await SuiteHeader({ moduleKey: "qr" }));
    expect(launcherEintraegeMock).not.toHaveBeenCalled();

    const groups = ["alpha-users"];
    authMock.mockResolvedValue({ user: { name: "Test", groups } });
    renderToStaticMarkup(await SuiteHeader({ moduleKey: "qr" }));
    expect(launcherEintraegeMock).toHaveBeenCalledTimes(1);
    expect(launcherEintraegeMock).toHaveBeenCalledWith(groups);
  });
});
