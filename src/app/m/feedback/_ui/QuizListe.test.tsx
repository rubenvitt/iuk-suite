// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * EINE ACTION, DIE ABLEHNT (Netz weg, Recht entzogen): die Liste meldet es und bleibt bedienbar —
 * keine unbehandelte Ablehnung, kein Knopf, der auf „läuft“ hängen bleibt.
 */
const { beende } = vi.hoisted(() => ({ beende: vi.fn<(f: FormData) => Promise<void>>() }));
vi.mock("../quiz-actions", () => ({
  beendeRundeAction: beende,
  loescheQuizAction: vi.fn(),
  legeQuizAnAction: vi.fn(async (s: unknown) => s),
}));

import { QuizListe } from "./QuizListe";

const BREIT = '[data-rolle="breitansicht"]';
afterEach(async () => {
  await unmount();
  beende.mockReset();
});

const knopf = (text: string, wurzel = document.body) =>
  [...wurzel.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);

describe("QuizListe", () => {
  it("lehnt „Quiz beenden“ ab, steht eine Meldung da, ohne unbehandelte Ablehnung", async () => {
    beende.mockRejectedValue(new Error("Netz weg"));
    const unbehandelt = vi.fn();
    process.on("unhandledRejection", unbehandelt);
    try {
      await mount(
        <App>
          <QuizListe groupId={1} zeilen={[{ id: 7, titel: "Funk", modus: "wettbewerb", fragen: 3, heute: "laeuft" }]} />
        </App>,
      );
      const breit = queryAll(BREIT)[0]!;
      await act(async () => knopf("Quiz beenden", breit)!.click());
      await act(async () => knopf("Beenden")!.click());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(beende).toHaveBeenCalledTimes(1);
      expect(beende.mock.calls[0][0].get("quizId")).toBe("7");
      expect(document.body.textContent).toContain("„Quiz beenden“ ging nicht");
      expect(knopf("Quiz beenden", breit)!.disabled).toBe(false);
      expect(unbehandelt).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unbehandelt);
    }
  });
});
