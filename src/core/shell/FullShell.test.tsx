// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DER MODULTITEL IM HEADER IST EIN LINK (Entwurf feedback-admin §4.1, §5.1
 * Punkt 1).
 *
 * Bis hierher war der Titel ein `<strong>` ohne Ziel: wer sich in einem Modul
 * verlaufen hatte, kam nur über die Zurück-Taste des Browsers auf seine
 * Startseite. Der Defekt hing NICHT am Modul `feedback`, sondern an der Shell —
 * er galt fuer JEDES Modul mit `shell: "full"`. Deshalb pruefen diese Tests alle
 * vier, nicht nur das eine, das den Anlass gab (Regressionsschutz aus §5.1).
 *
 * Zwei Zusagen, die still brechen wuerden:
 *
 * 1. `data-testid="module-title"` bleibt auf dem `<strong>` — INNERHALB des
 *    neuen Links. Der Keystone-E2E fragt es dort ab (§4.16); waere es an den
 *    Link gewandert, faende der Test weiterhin einen Knoten mit dem richtigen
 *    Text und niemandem faellt auf, dass die Zusage verschoben wurde.
 * 2. Der Header bricht auf schmalen Fenstern NICHT ueber den Titel: die
 *    Switcher-Leiste traegt `flexWrap: nowrap` + `overflow: hidden` (§5.1).
 *
 * `AppSwitcher` und `ThemeToggle` sind ersetzt: beide sind Client-Komponenten
 * mit antd-Kontext (`useThemeMode` wirft ausserhalb des Providers), und geprueft
 * wird hier die Kopfzeile der Shell, nicht ihr Inhalt.
 */
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/shell/AppSwitcher", () => ({ AppSwitcher: () => null }));
vi.mock("@/core/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

import { FullShell } from "./FullShell";
import { moduleUrl } from "./moduleUrl";
import { MODULES } from "@/core/registry";

/** Genau die Module mit `shell: "full"` — aus der Registry gelesen, nicht behauptet. */
const VOLLE_MODULE = MODULES.filter((m) => m.shell === "full").map((m) => m.key);

async function zeichne(moduleKey: string): Promise<HTMLElement> {
  authMock.mockResolvedValue({ user: { name: "Test", groups: [] } });
  const element = await FullShell({ moduleKey, children: <p>Inhalt</p> });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

const titel = (wirt: HTMLElement) => wirt.querySelector<HTMLElement>('[data-testid="module-title"]');

describe("FullShell — der Modultitel fuehrt zurueck auf die Modul-Startseite", () => {
  it("kennt mehr als ein Modul mit `shell: \"full\"` (sonst waere der Test wertlos)", () => {
    expect(VOLLE_MODULE.length).toBeGreaterThan(1);
    expect(VOLLE_MODULE).toContain("feedback");
  });

  it.each(VOLLE_MODULE)("wickelt den Titel von `%s` in einen Link auf moduleUrl", async (key) => {
    const wirt = await zeichne(key);
    const strong = titel(wirt);
    expect(strong).not.toBeNull();
    // `data-testid` sitzt weiter auf dem `<strong>`, nicht auf dem Link (§4.16).
    expect(strong!.tagName).toBe("STRONG");
    const link = strong!.closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(moduleUrl(key) ?? "/");
  });

  it("gibt dem Link die Schriftfarbe des Headers und keine Unterstreichung", async () => {
    const link = titel(await zeichne("feedback"))!.closest("a")!;
    const stil = (link.getAttribute("style") ?? "").replace(/\s/g, "");
    expect(stil).toContain("color:inherit");
    expect(stil).toContain("text-decoration:none");
  });

  it("laesst die Switcher-Leiste nicht ueber den Titel brechen", async () => {
    const wirt = await zeichne("feedback");
    const leiste = wirt.querySelector<HTMLElement>('[data-testid="full-shell-switcher"]');
    expect(leiste).not.toBeNull();
    const stil = (leiste!.getAttribute("style") ?? "").replace(/\s/g, "");
    expect(stil).toContain("flex-wrap:nowrap");
    expect(stil).toContain("overflow:hidden");
  });

  it("zeigt den Titel des Moduls, nicht seinen Schluessel", async () => {
    expect(titel(await zeichne("gamma"))!.textContent).toBe("Gamma");
  });
});
