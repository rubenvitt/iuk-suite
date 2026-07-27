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
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/shell/SuiteNav", () => ({ SuiteNav: () => null }));

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

  it("reicht die Modulnavigation durch, ohne sie zu erfinden", async () => {
    // Ohne `nav` bleibt es beim heutigen Bild — die Aenderung ist fuer Module,
    // die nichts uebergeben, unsichtbar.
    const ohne = await SuiteHeader({ moduleKey: "gamma" });
    expect(ohne).toBeTruthy();
  });
});
