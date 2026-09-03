// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { QuizInsel } from "./QuizInsel";

afterEach(async () => {
  await unmount();
});

const FRAGE = {
  zeichenId: "rezept:C.1.1",
  typ: "zeichen_bedeutung" as const,
  stamm: "",
  optionen: [
    { id: "rezept:C.1.1", antwort: "Löschstaffel", svg: null },
    { id: "rezept:C.1.2", antwort: "Löschgruppe", svg: null },
    { id: "rezept:C.1.3", antwort: "Löschzug", svg: null },
    { id: "rezept:C.1.4", antwort: "Löschtrupp", svg: null },
  ],
};

describe("QuizInsel", () => {
  it("zeigt vier Optionen und keine Aufloesung", async () => {
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={vi.fn()} />);
    expect(queryAll('[data-testid="quiz-option"]').length).toBe(4);
    expect(exists('[data-testid="quiz-aufloesung"]')).toBe(false);
  });

  /*
   * WORT ZUERST, ZEICHEN ZWEITENS, FARBE ZULETZT (Spec §5.5). Ein Test, der nur die
   * Farbe pruefte, ginge an der Regel vorbei — und wer die Farbe spaeter aendert, wuerde
   * ihn anpassen statt die Regel zu pruefen.
   */
  it("nennt das Ergebnis in Worten", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: true });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]');
    expect(query('[data-testid="quiz-aufloesung"]').textContent).toContain("Richtig");
  });

  it("sagt bei falscher Wahl, was richtig gewesen waere", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: false });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]:nth-of-type(2)');
    const text = query('[data-testid="quiz-aufloesung"]').textContent ?? "";
    expect(text).toContain("Nicht ganz");
    expect(text).toContain("Löschstaffel");
  });

  it("sperrt die Optionen nach der Antwort", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: true });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]');
    await click('[data-testid="quiz-option"]:nth-of-type(2)');
    expect(beantworte).toHaveBeenCalledTimes(1);
  });
});
