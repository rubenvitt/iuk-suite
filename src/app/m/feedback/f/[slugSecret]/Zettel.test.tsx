// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clickElement,
  mount,
  queryAll,
  unmount,
  query,
  exists,
} from "@/app/m/qr/_lib/test-dom";
import { Zettel } from "./Zettel";
import s from "./zettel.module.css";
import { STANDARD_QUESTIONS, type Question } from "../../_lib/questions";

/**
 * Der Zettel traegt den Kern des Entwurfs (§3.2 Punkt 3–4, §3.6, §3.10): die
 * INVERTIERTE deutsche Schulnote 1–6. Vorher standen hier sechs graue Sterne —
 * universell gelesen als "Bestnote", gemeint war "ungenuegend". Wer nicht liest,
 * bewertet das Gegenteil, und hinterher ist nicht unterscheidbar, welche
 * Antworten invertiert gemeint waren.
 *
 * Deshalb pruefen diese Tests nicht Optik, sondern die Kanaele, die die Richtung
 * tragen, und dass keiner davon Farbe ALLEIN ist: Ziffer · Position · Wort.
 *
 * Was hier NICHT geprueft werden kann, weil jsdom kein CSS anwendet: Fuellungen,
 * Abstaende, Tonwertkeil. Wo eine Zusage nur in CSS lebt (die per `clip-path`
 * versteckte `legend`, das Rot-Budget der Route), steht unten eine
 * Quelltext-Assertion — der einzige Weg, sie ueberhaupt festzunageln.
 */

// Ueber `process.cwd()`, NICHT ueber `import.meta.url`: in der jsdom-Umgebung
// ist `import.meta.url` eine http-URL, und `fileURLToPath` wirft dort.
const cssQuelle = readFileSync(
  join(process.cwd(), "src/app/m/feedback/f/[slugSecret]/zettel.module.css"),
  "utf8",
);

/** Kommentare raus: die Begruendung DARF eine Farbe nennen, der Code nicht. */
const cssOhneKommentare = cssQuelle.replace(/\/\*[\s\S]*?\*\//g, "");

afterEach(async () => {
  await unmount();
});

async function nichtsTun(): Promise<void> {}

function zeichne(questions: Question[], scale: number) {
  return mount(
    <Zettel questions={questions} scale={scale} action={nichtsTun} tokenHash="abc123" />,
  );
}

function zeichneStandard() {
  return zeichne(STANDARD_QUESTIONS, 6);
}

/** Die Notenzeilen sind `fieldset`s — eine echte Radiogruppe je Frage. */
function zeilen(): HTMLElement[] {
  return queryAll("fieldset");
}

function radios(name: string): HTMLInputElement[] {
  return queryAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`);
}

/** Wie ein Mensch: auf das FELD tippen, nicht auf das versteckte Radio. */
function feld(frage: string, stufe: number): HTMLElement {
  return query(`label[for="${frage}-${stufe}"]`);
}

describe("Notenmatrix: echte Radiogruppen statt Sterne", () => {
  it("rendert fuer jede der acht Bewertungsfragen eine Gruppe mit sechs Optionen", async () => {
    await zeichneStandard();
    expect(zeilen()).toHaveLength(8);
    for (let i = 1; i <= 8; i++) {
      expect(radios(`q${i}`)).toHaveLength(6);
    }
    expect(queryAll('input[type="radio"]')).toHaveLength(48);
  });

  it("gibt allen sechs Optionen einer Frage denselben Namen — ein Tabstop, Pfeiltasten nativ", async () => {
    await zeichneStandard();
    expect(radios("q1").map((r) => r.value)).toEqual(["1", "2", "3", "4", "5", "6"]);
    for (const zeile of zeilen()) {
      const namen = new Set(
        Array.from(zeile.querySelectorAll<HTMLInputElement>('input[type="radio"]')).map(
          (r) => r.name,
        ),
      );
      expect(namen.size).toBe(1);
    }
  });

  it("setzt `required` auf jede Option — das Netz ohne JavaScript", async () => {
    await zeichneStandard();
    const alle = queryAll<HTMLInputElement>('input[type="radio"]');
    expect(alle).toHaveLength(48);
    expect(alle.every((r) => r.required)).toBe(true);
  });

  it("benennt jede Option als Note plus Notenwort, nicht nur als Zahl", async () => {
    await zeichneStandard();
    const labels = Array.from(zeilen()[0].querySelectorAll("label")).map((l) =>
      l.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Note 1 – sehr gut",
      "Note 2 – gut",
      "Note 3 – befriedigend",
      "Note 4 – ausreichend",
      "Note 5 – mangelhaft",
      "Note 6 – ungenügend",
    ]);
  });

  it("waehlt die Note, wenn das Feld angetippt wird", async () => {
    await zeichneStandard();
    await clickElement(feld("q1", 3));
    expect(radios("q1").map((r) => r.checked)).toEqual([false, false, true, false, false, false]);
  });

  it("haelt die Ziffer im Feld sichtbar — auch im gewaehlten Zustand", async () => {
    await zeichneStandard();
    expect(feld("q1", 3).textContent).toBe("3");
    await clickElement(feld("q1", 3));
    expect(feld("q1", 3).textContent).toBe("3");
  });
});

describe("Notenmatrix: die Frage wird genau einmal angekuendigt", () => {
  it("gibt jeder Gruppe eine `legend` mit dem Fragetext", async () => {
    await zeichneStandard();
    const legenden = queryAll("fieldset > legend");
    expect(legenden).toHaveLength(8);
    expect(legenden[0].textContent).toBe("Wie war der Dienstabend insgesamt?");
  });

  it("versteckt den sichtbaren Fragetext vor Screenreadern (`aria-hidden`)", async () => {
    await zeichneStandard();
    const sichtbar = zeilen()[0].querySelector('[aria-hidden="true"]:not(legend)');
    expect(sichtbar?.textContent).toContain("Wie war der Dienstabend insgesamt?");
  });

  it("versteckt die `legend` per clip-path, NICHT per display:none", async () => {
    await zeichneStandard();
    // Erst die Verbindung: die `legend` traegt GENAU die Klasse, deren Regel
    // unten geprueft wird. Ohne diese Zeile waeren beide Haelften einzeln gruen,
    // auch wenn an der `legend` eine voellig andere Klasse haengt.
    expect(query("fieldset > legend").className).toBe(s.srOnly);
    // Nur `clip-path` haelt den Text im Barrierefreiheitsbaum; `display: none`
    // wuerde die Frage fuer Screenreader loeschen und die Radiogruppe namenlos
    // machen. jsdom rechnet kein CSS, deshalb Quelltext.
    const srRegel = /\.srOnly\s*\{[^}]*\}/.exec(cssQuelle)?.[0] ?? "";
    expect(srRegel).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(srRegel).not.toMatch(/display:\s*none/);
    expect(srRegel).not.toMatch(/visibility:\s*hidden/);
  });
});

describe("Notenmatrix: Rueckmeldung nach der Wahl", () => {
  it("zeigt vor der Wahl keine Fussnote", async () => {
    await zeichneStandard();
    expect(exists("[data-fussnote]")).toBe(false);
  });

  it("zeigt nach der Wahl Ziffer UND Notenwort", async () => {
    await zeichneStandard();
    await clickElement(feld("q1", 3));
    const fussnoten = queryAll("[data-fussnote]");
    expect(fussnoten).toHaveLength(1);
    expect(fussnoten[0].textContent).toBe("3 · befriedigend");
  });

  it("ersetzt die Fussnote bei Umwahl statt sie zu verdoppeln", async () => {
    await zeichneStandard();
    await clickElement(feld("q1", 3));
    await clickElement(feld("q1", 6));
    const fussnoten = queryAll("[data-fussnote]");
    expect(fussnoten).toHaveLength(1);
    expect(fussnoten[0].textContent).toBe("6 · ungenügend");
  });
});

describe("Notenmatrix: Richtung ohne Farbe lesbar", () => {
  it("zeigt die Legende genau einmal — nicht je Frage", async () => {
    await zeichneStandard();
    expect(queryAll("[data-legende]")).toHaveLength(1);
    const legende = query("[data-legende]");
    expect(legende.textContent).toContain("sehr gut");
    expect(legende.textContent).toContain("ungenügend");
  });

  it("stellt die Ankerwoerter genau einmal unter die erste Zeile", async () => {
    await zeichneStandard();
    const anker = queryAll("[data-anker]");
    expect(anker).toHaveLength(1);
    expect(zeilen()[0].contains(anker[0])).toBe(true);
    expect(anker[0].textContent).toContain("1 sehr gut");
    expect(anker[0].textContent).toContain("6 ungenügend");
  });
});

describe("Alt-Umfragen mit fuenfstufiger Skala (`stars`)", () => {
  const starsFragen: Question[] = [
    { id: "s1", type: "stars", text: "Wie war der Dienstabend insgesamt?" },
    { id: "s2", type: "stars", text: "Wie spannend war das Thema fuer dich?" },
  ];

  it("rendert fuenf Optionen je Frage", async () => {
    await zeichne(starsFragen, 5);
    expect(radios("s1")).toHaveLength(5);
    expect(radios("s1").map((r) => r.value)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("verankert die Skala mit `1 sehr gut` und `5 mangelhaft`", async () => {
    await zeichne(starsFragen, 5);
    const anker = query("[data-anker]");
    expect(anker.textContent).toContain("1 sehr gut");
    expect(anker.textContent).toContain("5 mangelhaft");
    expect(anker.textContent).not.toContain("ungenügend");
  });

  it("beschriftet die fuenfte Option als `Note 5 – mangelhaft`", async () => {
    await zeichne(starsFragen, 5);
    const labels = Array.from(zeilen()[0].querySelectorAll("label")).map((l) =>
      l.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Note 1 – sehr gut",
      "Note 2 – gut",
      "Note 3 – befriedigend",
      "Note 4 – ausreichend",
      "Note 5 – mangelhaft",
    ]);
  });

  it("zeigt eine fuenfsegmentige Legende", async () => {
    await zeichne(starsFragen, 5);
    expect(queryAll("[data-legende] [data-segment]")).toHaveLength(5);
  });
});

describe("Freitextfragen bleiben der Matrix fern (Task 12 setzt sie)", () => {
  it("macht aus `text`-Fragen keine Notenzeile", async () => {
    await zeichneStandard();
    // 14 Standardfragen, davon 8 Bewertungsfragen — die sechs Freitexte duerfen
    // hier keine Radiogruppe erzeugen.
    expect(zeilen()).toHaveLength(8);
    expect(radios("q9")).toHaveLength(0);
  });
});

describe("Rot-Budget der Route", () => {
  it("nennt `#c8000f` hoechstens zweimal — Fahne und Wortzeichen", () => {
    const treffer = cssOhneKommentare.match(/#c8000f/gi) ?? [];
    expect(treffer.length).toBeLessThanOrEqual(2);
  });

  it("faerbt keine Notenflaeche mit einer zweiten Palette", () => {
    // Die Notenfarben kommen aus `_lib/noten.ts` (Task 10) und erreichen den
    // Chip als Inline-Variablen. Steht ein Hex-Code hier im CSS, gibt es zwei
    // Paletten, und die Kontrast-/Monotonie-Zusicherung haengt nicht mehr an
    // einer Definition.
    for (const note of ["#2F7F59", "#54782A", "#7E6103", "#904708", "#912E10", "#811221"]) {
      expect(cssOhneKommentare.toLowerCase()).not.toContain(note.toLowerCase());
    }
  });
});
