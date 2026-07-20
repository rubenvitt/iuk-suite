// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QrDisplay } from "@/app/m/qr/QrDisplay";

/**
 * Deckt gezielt das Long-Press-Invertieren ab. Die restlichen Funktionen
 * (PNG-Export, Vollbild, Teilen) hängen an Canvas-, Fullscreen- und
 * Share-APIs, die jsdom nicht umsetzt — die prüft `e2e/qr.spec.ts` am echten
 * Browser, samt Zurückdekodieren der heruntergeladenen PNG-Datei.
 */

let host: HTMLDivElement;
let root: Root;

function box(): HTMLElement {
  const el = host.querySelector<HTMLElement>('[data-testid="qr-display"]');
  if (!el) throw new Error("QR-Box nicht gefunden");
  return el;
}

// jsdom kennt keinen PointerEvent-Konstruktor; React hört auf den reinen
// Event-Typ, deshalb reicht ein bubbelndes Event.
function pointer(type: "pointerdown" | "pointerup" | "pointerleave") {
  box().dispatchEvent(new Event(type, { bubbles: true }));
}

beforeEach(async () => {
  vi.useFakeTimers();
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<QrDisplay text="https://example.org" label="Test" />);
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
});

describe("QrDisplay Long-Press", () => {
  it("invertiert nach 600 ms gehaltenem Druck", async () => {
    pointer("pointerdown");
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(box().style.filter).toBe("invert(1)");
  });

  it("invertiert nicht, wenn vor 600 ms losgelassen wird", async () => {
    pointer("pointerdown");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    pointer("pointerup");
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(box().style.filter).toBe("");
  });

  it("laesst nach zwei ueberlappenden Pointern keinen verwaisten Timer zurueck", async () => {
    // Zweiter Finger auf der Box, dann heben beide früh ab. Ohne das Abräumen
    // in startPress bliebe der Timer des ERSTEN Pointers stehen und würde
    // 600 ms nach dessen pointerdown invertieren — ohne Berührung.
    pointer("pointerdown");
    pointer("pointerdown");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    pointer("pointerup");
    pointer("pointerup");
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(box().style.filter).toBe("");
  });
});
