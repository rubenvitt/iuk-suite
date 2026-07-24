// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clickElement,
  fill,
  mount,
  queryAll,
  unmount,
  query,
  exists,
  submitForm,
} from "@/app/m/qr/_lib/test-dom";
import { ENTWURF_VERFALL_MS, entwurfSchluessel, Zettel } from "./Zettel";
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
  // jsdom traegt den Speicher ueber die ganze Datei. Ohne diese zwei Zeilen
  // wuerde der Entwurf des vorigen Tests im naechsten Mount wiederhergestellt —
  // und der Fehlschlag saehe nach Logikfehler im Zaehler aus, nicht nach
  // Testrueckstand.
  sessionStorage.clear();
  localStorage.clear();
});

async function nichtsTun(): Promise<void> {}

const TOKEN_HASH = "abc123";

function zeichne(questions: Question[], scale: number) {
  return mount(
    <Zettel questions={questions} scale={scale} action={nichtsTun} tokenHash={TOKEN_HASH} />,
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

/** Die sechs linierten Freitextzeilen (§3.7). */
function textfelder(): HTMLTextAreaElement[] {
  return queryAll<HTMLTextAreaElement>("[data-freitexte] textarea");
}

function textfeld(frage: string): HTMLTextAreaElement {
  return query<HTMLTextAreaElement>(`textarea[name="${frage}"]`);
}

async function tippe(frage: string, wert: string): Promise<void> {
  await fill(`textarea[name="${frage}"]`, wert);
}

const FREITEXTFRAGEN = STANDARD_QUESTIONS.filter((q) => q.type === "text");

/** Ein Entwurf, wie ihn die Komponente selbst geschrieben haette. */
function legeEntwurfAb(texte: Record<string, string>, alterMs = 0): void {
  sessionStorage.setItem(
    entwurfSchluessel(TOKEN_HASH),
    JSON.stringify({ at: Date.now() - alterMs, texte }),
  );
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

describe("Freitextfragen bleiben der Matrix fern", () => {
  it("macht aus `text`-Fragen keine Notenzeile", async () => {
    await zeichneStandard();
    // 14 Standardfragen, davon 8 Bewertungsfragen — die sechs Freitexte duerfen
    // keine Radiogruppe erzeugen.
    expect(zeilen()).toHaveLength(8);
    expect(radios("q9")).toHaveLength(0);
  });
});

/*
 * §3.7: sechs gleich aussehende leere Kaesten (~540px) werden zu linierten
 * Zeilen (~300px). Der Preis, den der Entwurf NICHT zahlt: keine Frage wird
 * versteckt, gekuerzt oder umbenannt. Genau das pruefen die ersten drei Tests —
 * ein Konkurrenzentwurf hatte fuenf der sechs Fragen hinter erfundene
 * Kurzlabels gelegt, was funktional nahe an einer Streichung liegt.
 */
describe("Freitexte: sechs linierte Zeilen, jede mit ihrer ganzen Frage", () => {
  it("rendert sechs Zeilen in Fragereihenfolge — q9 zuerst, dann q10–q14", async () => {
    await zeichneStandard();
    expect(textfelder().map((t) => t.name)).toEqual(["q9", "q10", "q11", "q12", "q13", "q14"]);
  });

  it("beschriftet jede Zeile mit dem vollstaendigen Originaltext, nicht mit einem Kurzlabel", async () => {
    await zeichneStandard();
    expect(FREITEXTFRAGEN).toHaveLength(6);
    for (const frage of FREITEXTFRAGEN) {
      const label = query(`label[for="${textfeld(frage.id).id}"]`);
      expect(label.textContent).toBe(frage.text);
    }
  });

  it("legt keine Frage hinter einen Aufklapper und versteckt kein Feld", async () => {
    await zeichneStandard();
    expect(exists("details")).toBe(false);
    expect(exists("summary")).toBe(false);
    for (const feld of textfelder()) {
      expect(feld.className).not.toContain(s.srOnly);
      expect(feld.hidden).toBe(false);
    }
  });

  it("haengt an kein Feld ein `(optional)` — die Freiwilligkeit steht im Einleitungssatz", async () => {
    await zeichneStandard();
    const sektion = query("[data-freitexte]");
    expect(query("form").textContent).not.toContain("optional");
    expect(sektion.textContent).toContain("04 IN EIGENEN WORTEN");
    expect(sektion.textContent).toContain(
      "Alles hier ist freiwillig. Ein Halbsatz hilft uns mehr als ein voller Absatz.",
    );
    expect(sektion.textContent).toContain("Schreib nichts, woran man dich erkennt.");
  });

  it("begrenzt jede Zeile physisch auf 500 Zeichen", async () => {
    await zeichneStandard();
    for (const feld of textfelder()) {
      expect(feld.maxLength).toBe(500);
    }
  });

  it("gibt der Zeile die Eingabehilfen der Vorgabe — Enter macht einen Absatz", async () => {
    await zeichneStandard();
    for (const feld of textfelder()) {
      // `textarea` statt `input`: nur so erzeugt Enter einen Absatz und nicht
      // die Abgabe. Das ist die eigentliche Zusicherung hinter `enterkeyhint`.
      expect(feld.tagName).toBe("TEXTAREA");
      expect(feld.rows).toBe(1);
      expect(feld.getAttribute("autocomplete")).toBe("off");
      expect(feld.getAttribute("autocapitalize")).toBe("sentences");
      expect(feld.getAttribute("spellcheck")).toBe("true");
      expect(feld.getAttribute("enterkeyhint")).toBe("enter");
    }
  });

  it("laesst die Zeile beim Tippen mitwachsen", async () => {
    await zeichneStandard();
    expect(textfeld("q9").style.height).toBe("");
    await tippe("q9", "Die Sprechgruppen-Uebung.");
    // jsdom rechnet kein Layout (`scrollHeight` ist 0) — pruefbar ist deshalb
    // nur, DASS die Hoehe gesetzt wird, nicht auf welchen Wert.
    expect(textfeld("q9").style.height).not.toBe("");
  });

  it("setzt kein Erledigt-Haekchen an eine gefuellte Zeile", async () => {
    await zeichneStandard();
    await tippe("q9", "Die Sprechgruppen-Uebung.");
    // Die gefuellte Zeile besteht aus genau zwei Teilen: Frage und Feld. Kein
    // dritter Knoten, also kein Haekchen, kein "erledigt", kein Zaehler (dafuer
    // ist der Text zu kurz). Bei freiwilligen Feldern waere ein Haekchen eine
    // stille Beschaemung der leeren.
    const zeile = query(`[data-textzeile="q9"]`);
    expect(Array.from(zeile.children).map((kind) => kind.tagName)).toEqual(["LABEL", "TEXTAREA"]);
    expect(zeile.textContent).not.toContain("✓");
    expect(zeile.textContent?.toLowerCase()).not.toContain("erledigt");
    expect(query(`label[for="q9-feld"]`).textContent).toBe("Was hat dir am besten gefallen?");
  });
});

describe("Freitexte: der Zeichenzaehler bleibt still, bis es knapp wird", () => {
  it("zeigt bis 419 Zeichen keinen Zaehler", async () => {
    await zeichneStandard();
    await tippe("q9", "z".repeat(419));
    expect(exists("[data-zaehler]")).toBe(false);
  });

  it("nennt ab 420 Zeichen die Restzahl", async () => {
    await zeichneStandard();
    await tippe("q9", "z".repeat(420));
    const zaehler = queryAll("[data-zaehler]");
    expect(zaehler).toHaveLength(1);
    expect(zaehler[0].textContent).toBe("noch 80 Zeichen");
  });

  it("sagt bei 500 Zeichen `Zeile ist voll` — kein Rot, kein Icon, kein Ausrufezeichen", async () => {
    await zeichneStandard();
    await tippe("q9", "z".repeat(500));
    const zaehler = query("[data-zaehler]");
    expect(zaehler.textContent).toBe("Zeile ist voll");
    expect(zaehler.textContent).not.toContain("!");
    // Warnfarbe ausserhalb der Notenskala ist verboten: der Zaehler laeuft in
    // `--gedaempft`, also in derselben Farbe wie bei 420 Zeichen.
    const zaehlerRegel = /\.zaehler\s*\{[^}]*\}/.exec(cssQuelle)?.[0] ?? "";
    expect(zaehlerRegel).toMatch(/color:\s*var\(--gedaempft\)/);
    expect(zaehlerRegel).not.toMatch(/#[0-9a-f]{3}/i);
  });
});

describe("Freitexte: Entwurf im sessionStorage", () => {
  it("haelt Eingaben im sessionStorage — nie im localStorage", async () => {
    await zeichneStandard();
    await tippe("q9", "Kartenkunde");
    const roh = sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH));
    expect(roh).not.toBeNull();
    expect(JSON.parse(roh as string).texte).toEqual({ q9: "Kartenkunde" });
    // `localStorage` ueberlebt den Browserneustart — ein anonymer Freitext
    // gehoert dort nicht hin.
    expect(localStorage.length).toBe(0);
  });

  it("stellt einen frischen Entwurf im Effekt wieder her", async () => {
    legeEntwurfAb({ q9: "halb getippt", q12: "ein Tipp" });
    await zeichneStandard();
    expect(textfeld("q9").value).toBe("halb getippt");
    expect(textfeld("q12").value).toBe("ein Tipp");
    expect(textfeld("q10").value).toBe("");
  });

  it("liest den Speicher beim ERSTEN Rendern nicht — sonst Hydration-Konflikt", () => {
    legeEntwurfAb({ q9: "halb getippt" });
    const spion = vi.spyOn(Storage.prototype, "getItem");
    const markup = renderToStaticMarkup(
      <Zettel
        questions={STANDARD_QUESTIONS}
        scale={6}
        action={nichtsTun}
        tokenHash={TOKEN_HASH}
      />,
    );
    expect(spion).not.toHaveBeenCalled();
    expect(markup).not.toContain("halb getippt");
    spion.mockRestore();
  });

  it("verwirft einen Entwurf, der aelter als 30 Minuten ist", async () => {
    legeEntwurfAb({ q9: "von vorletzter Woche" }, ENTWURF_VERFALL_MS + 1000);
    await zeichneStandard();
    expect(textfeld("q9").value).toBe("");
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).toBeNull();
  });

  it("loescht den Entwurf bei der Abgabe", async () => {
    await zeichneStandard();
    await tippe("q9", "Kartenkunde");
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).not.toBeNull();
    await submitForm();
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).toBeNull();
  });

  it("haelt Entwuerfe zweier Abende auseinander", () => {
    expect(entwurfSchluessel("abc123")).not.toBe(entwurfSchluessel("def456"));
    expect(entwurfSchluessel("abc123")).toContain("abc123");
  });
});

describe("Freitexte: Zeile statt Kasten (CSS-Zusicherung)", () => {
  it("gibt dem Feld nur eine Grundlinie — keinen Rahmen, keine Fuellung, keinen Radius", () => {
    const feldRegel = /\.textfeld\s*\{[^}]*\}/.exec(cssQuelle)?.[0] ?? "";
    expect(feldRegel).not.toBe("");
    expect(feldRegel).toMatch(/border:\s*0/);
    expect(feldRegel).toMatch(/border-bottom:\s*1px solid var\(--linie\)/);
    expect(feldRegel).toMatch(/border-radius:\s*0/);
    expect(feldRegel).toMatch(/background:\s*transparent/);
    expect(feldRegel).toMatch(/min-height:\s*40px/);
    expect(feldRegel).toMatch(/font-size:\s*18px/);
    // Ohne JavaScript waechst die Zeile ueber `field-sizing` mit; `rows=1` ist
    // der Rueckfall dort, wo es noch fehlt. Genau dort darf `overflow` nicht
    // `hidden` sein — sonst waere alles ab der zweiten Zeile unsichtbar UND
    // unerreichbar, also stiller Datenverlust ohne JavaScript.
    expect(feldRegel).toMatch(/field-sizing:\s*content/);
    expect(feldRegel).not.toMatch(/overflow:\s*hidden/);
  });

  it("verstaerkt die Grundlinie bei Fokus und bei Inhalt statt einen Kasten zu zeichnen", () => {
    const fokusRegel = /\.textfeld:focus\s*\{[^}]*\}/.exec(cssQuelle)?.[0] ?? "";
    expect(fokusRegel).toMatch(/border-bottom:\s*2px solid var\(--graphit\)/);
    const gefuelltRegel = /\.textfeld\[data-gefuellt\]\s*\{[^}]*\}/.exec(cssQuelle)?.[0] ?? "";
    expect(gefuelltRegel).toMatch(/border-bottom-width:\s*1\.5px/);
    expect(gefuelltRegel).toMatch(/border-bottom-color:\s*var\(--graphit\)/);
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
