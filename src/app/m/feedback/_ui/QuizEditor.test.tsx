// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuizFrage } from "../_lib/quiz/fragen";

/**
 * DER QUIZ-EDITOR (Live-Quiz, Task 8). Drei Zusagen:
 *
 * 1. Der Slidev-Schnipsel trägt die `clicks`-Zahl aus `schrittAnzahl` (Lagebild 2 je Frage,
 *    Wettbewerb 3, nach der letzten 2; dazu Lobby und Schluss) und die Beamer-Adresse.
 * 2. Neben der Beamer-Adresse steht der Warntext aus Spec §5.6 wörtlich.
 * 3. Das versteckte Feld `fragen` ist das JSON der Fragen, das `pruefeFragen` versteht:
 *    leere Zeit und leere Erklärung fehlen, statt als `""` mitzugehen.
 */

vi.mock("../quiz-actions", () => ({
  speichereQuizAction: vi.fn(async () => ({ ok: true })),
  rotiereSecretAction: vi.fn(async () => {}),
}));

import { QuizEditor } from "./QuizEditor";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const URL_BEAMER = "https://feedback.example/beamer/geheimgeheim";

function frage(text: string, extra: Partial<QuizFrage> = {}): QuizFrage {
  return { text, typ: "einfach", optionen: ["A", "B"], richtig: [0], ...extra };
}

afterEach(async () => {
  await unmount();
});

function schnipsel(): string {
  return query('[data-testid="slidev-schnipsel"]').textContent ?? "";
}

describe("QuizEditor", () => {
  it("Lagebild mit 3 Fragen: clicks 8 und die Beamer-Adresse im Schnipsel", async () => {
    await mount(
      <QuizEditor
        quizId={1}
        titel="Funk"
        modus="lagebild"
        fragen={[frage("a"), frage("b"), frage("c")]}
        beamerUrl={URL_BEAMER}
      />,
    );
    expect(schnipsel()).toBe(`---\nclicks: 8\n---\n<LiveQuiz src="${URL_BEAMER}" />`);
  });

  it("Wettbewerb mit 3 Fragen: clicks 10", async () => {
    await mount(
      <QuizEditor
        quizId={1}
        titel="Funk"
        modus="wettbewerb"
        fragen={[frage("a"), frage("b"), frage("c")]}
        beamerUrl={URL_BEAMER}
      />,
    );
    expect(schnipsel()).toContain("clicks: 10\n");
  });

  it("zeigt die Beamer-Adresse und den Warntext aus §5.6 wörtlich", async () => {
    await mount(<QuizEditor quizId={1} titel="Funk" modus="lagebild" fragen={[frage("a")]} beamerUrl={URL_BEAMER} />);
    expect(document.body.textContent).toContain(URL_BEAMER);
    expect(document.body.textContent).toContain(
      "Wer die Adresse kennt, kann das Quiz steuern. Foliensätze mit dieser Adresse nicht öffentlich ablegen.",
    );
    expect(document.body.textContent).toContain("Adresse neu erzeugen");
  });

  it("serialisiert die Fragen ohne leere Zeit und Erklärung", async () => {
    await mount(
      <QuizEditor
        quizId={1}
        titel="Funk"
        modus="lagebild"
        fragen={[frage("a", { zeit_s: 20, erklaerung: "weil" }), frage("b")]}
        beamerUrl={URL_BEAMER}
      />,
    );
    const feld = query<HTMLInputElement>('input[name="fragen"]');
    expect(JSON.parse(feld.value)).toEqual([
      { text: "a", typ: "einfach", optionen: ["A", "B"], richtig: [0], zeit_s: 20, erklaerung: "weil" },
      { text: "b", typ: "einfach", optionen: ["A", "B"], richtig: [0] },
    ]);
  });

  it("„Frage hinzufügen“ hängt eine Frage an, „nach oben“ tauscht", async () => {
    await mount(<QuizEditor quizId={1} titel="Funk" modus="lagebild" fragen={[frage("a"), frage("b")]} beamerUrl={URL_BEAMER} />);
    const hinzu = queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.includes("Frage hinzufügen"))!;
    await clickElement(hinzu);
    const fragen = () => JSON.parse(query<HTMLInputElement>('input[name="fragen"]').value) as QuizFrage[];
    expect(fragen()).toHaveLength(3);

    const hoch = queryAll<HTMLButtonElement>('button[aria-label="Frage 2 nach oben"]')[0]!;
    await clickElement(hoch);
    expect(fragen().map((f) => f.text).slice(0, 2)).toEqual(["b", "a"]);
  });

  it("Wahr oder falsch setzt die festen Optionen", async () => {
    await mount(
      <QuizEditor
        quizId={1}
        titel="Funk"
        modus="lagebild"
        fragen={[frage("a", { typ: "wahrfalsch", optionen: ["Wahr", "Falsch"], richtig: [1] })]}
        beamerUrl={URL_BEAMER}
      />,
    );
    const f = JSON.parse(query<HTMLInputElement>('input[name="fragen"]').value) as QuizFrage[];
    expect(f[0]).toEqual({ text: "a", typ: "wahrfalsch", optionen: ["Wahr", "Falsch"], richtig: [1] });
  });
});
