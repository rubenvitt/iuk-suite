import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { enterUebernimmtNurDasFeld } from "./enter";

/**
 * Haelt nur fest, WELCHE Taste unterdrueckt wird. Ob der Browser danach wirklich nicht absendet,
 * sieht jsdom nicht (keine implizite Absendung) — das misst `e2e/lagerbuch-zugang-enter.spec.ts`
 * im echten Browser.
 */
function taste(key: string) {
  const preventDefault = vi.fn();
  enterUebernimmtNurDasFeld({ key, preventDefault } as unknown as KeyboardEvent<HTMLElement>);
  return preventDefault;
}

describe("enterUebernimmtNurDasFeld", () => {
  it("unterdrueckt die Folge von Enter", () => {
    expect(taste("Enter")).toHaveBeenCalledOnce();
  });

  it.each(["Escape", "Tab", "ArrowDown", "1", "-"])("laesst %s durch", (key) => {
    expect(taste(key)).not.toHaveBeenCalled();
  });
});
