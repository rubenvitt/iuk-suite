import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { autoEnde } = vi.hoisted(() => ({ autoEnde: vi.fn(() => 0) }));
vi.mock("@/app/m/feedback/_lib/quiz/autoEnde", () => ({
  quizAutoEndeBeimStart: autoEnde,
}));
vi.mock("../../_db/client", () => ({ getDb: () => ({}) }));
vi.mock("./daten", () => ({ loescheAbgelaufene: () => 0, tagVon: () => "2026-11-26" }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  autoEnde.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("starteFeedbackHintergrund", () => {
  it("holt das Auto-Ende der Quizrunden einmal sofort beim Start nach (§5.3)", async () => {
    const { starteFeedbackHintergrund } = await import("./hintergrund");
    starteFeedbackHintergrund();
    starteFeedbackHintergrund();
    expect(autoEnde).toHaveBeenCalledTimes(1);
  });

  it("holt es danach in jedem Takt nach, nicht nur beim Start — sonst gäbe es ohne Neustart keinen Wecker", async () => {
    const { starteFeedbackHintergrund } = await import("./hintergrund");
    starteFeedbackHintergrund();
    expect(autoEnde).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10 * 60_000);
    expect(autoEnde).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(6 * 60 * 60_000);
    expect(autoEnde).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(6 * 60 * 60_000);
    expect(autoEnde).toHaveBeenCalledTimes(4);
  });
});
