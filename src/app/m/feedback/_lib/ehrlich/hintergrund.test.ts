import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { autoEnde } = vi.hoisted(() => ({ autoEnde: vi.fn(() => 0) }));
vi.mock("@/app/m/feedback/_lib/quiz/autoEnde", () => ({
  quizAutoEndeBeimStart: autoEnde,
}));
vi.mock("../../_db/client", () => ({ getDb: () => ({}) }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("starteFeedbackHintergrund", () => {
  it("holt das Auto-Ende der Quizrunden einmal sofort beim Start nach (§5.3)", async () => {
    const { starteFeedbackHintergrund } = await import("./hintergrund");
    starteFeedbackHintergrund();
    starteFeedbackHintergrund();
    expect(autoEnde).toHaveBeenCalledTimes(1);
  });
});
