// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AntdProvider, useThemeMode } from "./AntdProvider";

/**
 * `setMode` wechselt den Modus OHNE Reload. Wenn es dabei nur das Cookie und
 * `style.colorScheme` schreibt, bleiben eigene CSS-Variablen, die an
 * `[data-theme]` haengen, bis zur naechsten Navigation auf dem alten Modus
 * stehen — der Umschalter waere fuer sie sichtbar wirkungslos. Deshalb muss der
 * Client `dataset.theme` mitschreiben.
 *
 * Umgeschaltet wird ueber echte Knopfdruecke, nicht ueber ein nach draussen
 * gereichtes `setMode`: eine Zuweisung an eine Variable ausserhalb der
 * Komponente waere ein Seiteneffekt im Render (`react-hooks/globals`) — und
 * ein Klick prueft ohnehin den Weg, den der echte Umschalter nimmt.
 */
let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  document.cookie = "iuk-theme=; Path=/; Max-Age=0";
});

function Sonde() {
  const { mode, setMode } = useThemeMode();
  return (
    <div>
      <span data-testid="modus">{mode}</span>
      <button type="button" data-testid="nach-dunkel" onClick={() => setMode("dark")} />
      <button type="button" data-testid="nach-hell" onClick={() => setMode("light")} />
    </div>
  );
}

function mount(initialMode: "light" | "dark") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AntdProvider initialMode={initialMode}>
        <Sonde />
      </AntdProvider>,
    );
  });
}

function umschalten(ziel: "light" | "dark") {
  const knopf = container!.querySelector<HTMLButtonElement>(
    ziel === "dark" ? '[data-testid="nach-dunkel"]' : '[data-testid="nach-hell"]',
  );
  if (!knopf) throw new Error(`Umschalt-Knopf fuer '${ziel}' nicht gefunden`);
  act(() => knopf.click());
}

function angezeigterModus() {
  return container!.querySelector('[data-testid="modus"]')?.textContent;
}

describe("AntdProvider.setMode schreibt das Theme-Signal mit", () => {
  it("Wechsel auf dunkel setzt dataset.theme auf dem Wurzelelement — ohne Navigation", () => {
    mount("light");
    expect(angezeigterModus()).toBe("light");

    umschalten("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(angezeigterModus()).toBe("dark");
  });

  it("Wechsel zurueck auf hell setzt dataset.theme wieder auf 'light'", () => {
    mount("dark");

    umschalten("dark");
    umschalten("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(angezeigterModus()).toBe("light");
  });

  it("Regression: colorScheme wird weiterhin mitgeschrieben, nicht ersetzt", () => {
    mount("light");

    umschalten("dark");

    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("Regression: das Cookie wird weiterhin geschrieben", () => {
    mount("light");

    umschalten("dark");

    expect(document.cookie).toContain("iuk-theme=dark");
  });
});
