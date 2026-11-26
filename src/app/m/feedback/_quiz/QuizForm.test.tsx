import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuizForm, quizFarbe } from "./QuizForm";

// Eine Frage darf sechs Optionen haben: jede braucht ihr eigenes Paar aus Form und Farbe, auf
// Beamer und Handy gleich (Review Task 7, Fix-Runde 2). Option 5 darf nie wie Option 1 aussehen.
describe("QuizForm / quizFarbe", () => {
  const sechs = [0, 1, 2, 3, 4, 5];
  it("sechs Optionen: sechs verschiedene Formen", () => {
    const formen = sechs.map((i) => /data-form="([^"]+)"/.exec(renderToStaticMarkup(<QuizForm i={i} className="f" />))![1]);
    expect(new Set(formen).size).toBe(6);
    expect(formen).toEqual(["dreieck", "kreis", "quadrat", "raute", "stern", "kreuz"]);
  });
  it("sechs Optionen: sechs verschiedene Farbklassen", () => {
    expect(new Set(sechs.map(quizFarbe)).size).toBe(6);
  });
});
