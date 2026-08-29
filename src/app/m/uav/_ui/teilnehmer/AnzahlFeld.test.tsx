// @vitest-environment jsdom
import { act, useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AnzahlFeld } from "./AnzahlFeld";
import { fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Port aus uav-praxis/src/components/AnzahlFeld.test.tsx — `@testing-library/react`
 * ist keine Abhängigkeit dieses Projekts, deshalb über das repo-eigene
 * `test-dom`-Harness (`mount`/`fill`/`query`) statt `render`/`userEvent`.
 */

// Harness, der den echten Eltern-Handler nachbildet: jeder gemeldete Wert
// wird (wie zielanzahlSetzen) auf min. 1 geklemmt und zurück in `value` gespiegelt.
function Harness({ start, onValueChange }: { start: number; onValueChange?: (n: number) => void }) {
  const [wert, setWert] = useState(start);
  return (
    <AnzahlFeld
      value={wert}
      min={1}
      onValueChange={(n) => {
        const geklemmt = Math.max(1, Math.floor(n) || 1);
        setWert(geklemmt);
        onValueChange?.(geklemmt);
      }}
    />
  );
}

// `test-dom` kennt keinen Blur-Helfer (nur `feedback`/`aufgaben` brauchen ihn
// bisher nicht) — React delegiert `onBlur` an ein nicht-bubbelndes `focusout`
// auf der Root, daher hier direkt dispatcht statt eine neue Harness-Funktion
// für einen einzigen Aufrufer einzuführen.
async function blur(selector: string): Promise<void> {
  const el = query<HTMLInputElement>(selector);
  await act(async () => {
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

afterEach(async () => {
  await unmount();
});

describe("AnzahlFeld", () => {
  it("lässt sich leeren und mit neuer Zahl überschreiben (kein Sprung auf min)", async () => {
    await mount(<Harness start={1} />);
    const input = query<HTMLInputElement>("input");

    await fill("input", "");
    expect(input.value).toBe(""); // leer – NICHT sofort zurück auf 1

    await fill("input", "2");
    expect(input.value).toBe("2");
  });

  it("meldet beim Leeren keinen Wert nach oben", async () => {
    const onValueChange = vi.fn();
    await mount(<Harness start={4} onValueChange={onValueChange} />);

    await fill("input", "");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("stellt beim Verlassen eines leeren Felds den letzten gültigen Wert wieder her", async () => {
    await mount(<Harness start={4} />);
    const input = query<HTMLInputElement>("input");

    await fill("input", "");
    await blur("input");
    expect(input.value).toBe("4");
  });
});
