import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mount, rerender, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import { SPERRE_NACH_MS, useSperre } from "./useSperre";

interface SondeProps {
  aktiv: boolean;
  ablaufMs: number | null;
  jetztVersatz: number;
  sperre: () => void;
}

function Sonde(p: SondeProps) {
  useSperre(p);
  return null;
}

async function laufe(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function eingabe(typ: "keydown" | "pointerdown" | "pointermove" | "wheel" = "keydown"): void {
  act(() => {
    window.dispatchEvent(new Event(typ));
  });
}

const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("useSperre", () => {
  it("sperrt nach 10 min ohne Eingabe, nicht vorher", async () => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv ablaufMs={null} jetztVersatz={0} sperre={sperre} />);
    await laufe(SPERRE_NACH_MS - 1);
    expect(sperre).not.toHaveBeenCalled();
    await laufe(1);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it.each(["keydown", "pointerdown", "pointermove", "wheel"] as const)("eine Eingabe (%s) nach 9 min verschiebt die Sperre", async (typ) => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv ablaufMs={null} jetztVersatz={0} sperre={sperre} />);
    await laufe(9 * MINUTE);
    eingabe(typ);
    await laufe(9 * MINUTE);
    expect(sperre).not.toHaveBeenCalled();
    await laufe(1 * MINUTE);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it("ein neuer Render oder ein anderer Uhrversatz verschiebt die Sperre nicht", async () => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv ablaufMs={null} jetztVersatz={0} sperre={sperre} />);
    await laufe(5 * MINUTE);
    // Wie ein Status-Poll während der Frist: neue Rückruf-Identität, Versatz um ein paar ms anders.
    await rerender(<Sonde aktiv ablaufMs={null} jetztVersatz={3} sperre={() => sperre()} />);
    await laufe(5 * MINUTE);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it("ein Token, dessen Ablauf nach der Uhr von Rust schon vorbei ist, sperrt sofort", async () => {
    const sperre = vi.fn();
    // Rust geht 2 s vor; nach seiner Uhr ist das Token seit 1 s abgelaufen.
    await mount(<Sonde aktiv ablaufMs={Date.now() + 1000} jetztVersatz={2000} sperre={sperre} />);
    await laufe(0);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it("`ablaufMs` in der Vergangenheit sperrt sofort", async () => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv ablaufMs={Date.now() - 1} jetztVersatz={0} sperre={sperre} />);
    await laufe(0);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it("sperrt beim Tokenablauf, auch mitten in Eingaben", async () => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv ablaufMs={Date.now() + 3 * MINUTE} jetztVersatz={0} sperre={sperre} />);
    await laufe(2 * MINUTE);
    eingabe();
    await laufe(MINUTE - 1);
    expect(sperre).not.toHaveBeenCalled();
    await laufe(1);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it("tut nichts, solange nicht aktiv — und beginnt beim Aktivieren neu zu zählen", async () => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv={false} ablaufMs={Date.now() - 1} jetztVersatz={0} sperre={sperre} />);
    await laufe(SPERRE_NACH_MS * 2);
    expect(sperre).not.toHaveBeenCalled();
    await rerender(<Sonde aktiv ablaufMs={null} jetztVersatz={0} sperre={sperre} />);
    await laufe(SPERRE_NACH_MS - 1);
    expect(sperre).not.toHaveBeenCalled();
    await laufe(1);
    expect(sperre).toHaveBeenCalledTimes(1);
  });

  it("räumt beim Deaktivieren Timer und Hörer ab", async () => {
    const sperre = vi.fn();
    await mount(<Sonde aktiv ablaufMs={Date.now() + MINUTE} jetztVersatz={0} sperre={sperre} />);
    await rerender(<Sonde aktiv={false} ablaufMs={null} jetztVersatz={0} sperre={sperre} />);
    await laufe(SPERRE_NACH_MS * 2);
    expect(sperre).not.toHaveBeenCalled();
  });
});
