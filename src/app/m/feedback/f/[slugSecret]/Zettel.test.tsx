// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clickElement,
  fill,
  hydrate,
  mount,
  queryAll,
  unmount,
  query,
  exists,
  submitForm,
} from "@/app/m/qr/_lib/test-dom";
import {
  ENTWURF_VERFALL_MS,
  SPERRE_MS,
  entwurfSchluessel,
  Zettel,
  type ZettelProps,
} from "./Zettel";
import s from "./zettel.module.css";
import { MAX_TEXT_LENGTH, STANDARD_QUESTIONS, type Question } from "../../_lib/questions";
import { JS_FELD } from "../../_lib/absenden";
import type { SubmitResult } from "../../actions";

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

/** Der Quelltext der Server Component — sie liefert den Siegeltext (Task 13). */
const pageQuelle = readFileSync(
  join(process.cwd(), "src/app/m/feedback/f/[slugSecret]/page.tsx"),
  "utf8",
);

const zettelQuelle = readFileSync(
  join(process.cwd(), "src/app/m/feedback/f/[slugSecret]/Zettel.tsx"),
  "utf8",
);

/** Die Regel eines Selektors aus dem Quelltext — jsdom rechnet kein CSS. */
function cssRegel(selektor: string): string {
  const muster = new RegExp(`${selektor.replace(/[.[\]()]/g, "\\$&")}\\s*\\{[^}]*\\}`);
  return muster.exec(cssOhneKommentare)?.[0] ?? "";
}

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

/**
 * WORTLAUT A aus Entwurf §3.9, wortgenau. Er ist nur zulaessig, weil Task 8
 * beide Voraussetzungen erfuellt hat: `insertResponse` speichert den Zeitstempel
 * auf Mitternacht UTC des Abends (`actions.ts` — "keine Uhrzeit") und
 * `shuffleStable` mischt die Leseordnung deterministisch (`aggregation.ts`, auch
 * von der CSV-Route benutzt — "in zufaelliger Reihenfolge"). Faellt eine der
 * beiden weg, luegt dieser Text und es gilt Fassung B.
 */
const FASSUNG_A =
  "Diese Rückmeldung ist anonym. Gespeichert werden nur deine Noten und deine Texte — kein Name, keine E-Mail, keine Geräte- oder IP-Kennung, keine Uhrzeit. Die Gruppenleitung sieht Durchschnitte und die Texte in zufälliger Reihenfolge, nie eine Person.";

function zeichne(questions: Question[], scale: number, action: ZettelProps["action"] = nichtsTun) {
  return mount(
    <Zettel
      questions={questions}
      scale={scale}
      action={action}
      tokenHash={TOKEN_HASH}
      siegel={FASSUNG_A}
    />,
  );
}

function zeichneStandard(action: ZettelProps["action"] = nichtsTun) {
  return zeichne(STANDARD_QUESTIONS, 6, action);
}

/**
 * Derselbe Zettel ueber den ECHTEN Hydrationsweg. `vorbereiten` laeuft in dem
 * Fenster, in dem das HTML schon steht und das JavaScript noch nicht laeuft —
 * dem Weg, den §3.11 zusagt.
 */
function hydriereStandard(
  vorbereiten?: (host: HTMLElement) => void,
  action: ZettelProps["action"] = nichtsTun,
) {
  return hydrate(
    <Zettel
      questions={STANDARD_QUESTIONS}
      scale={6}
      action={action}
      tokenHash={TOKEN_HASH}
      siegel={FASSUNG_A}
    />,
    vorbereiten,
  );
}

/**
 * jsdom kennt `scrollIntoView` nicht (der Code ruft es deshalb optional auf).
 * Diese Attrappe merkt sich, WORAUF gescrollt wurde — `this` ist der
 * Pruefgegenstand, nicht die Argumente. Sie wird nach dem Test zurueckgenommen,
 * damit sie nicht in andere Tests derselben Datei blutet.
 */
function scrollAttrappe(): { ziele: Element[]; zurueck: () => void } {
  const ziele: Element[] = [];
  const echt = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element) {
    ziele.push(this);
  };
  return {
    ziele,
    zurueck: () => {
      Element.prototype.scrollIntoView = echt;
    },
  };
}

/** Setzt `checked` OHNE change-Ereignis — so wirkt eine Formular-Wiederherstellung. */
function setzeOhneEreignis(host: ParentNode, frage: string, stufe: number): void {
  const feld = host.querySelector<HTMLInputElement>(
    `input[name="${frage}"][value="${stufe}"]`,
  );
  if (!feld) throw new Error(`Radio nicht gefunden: ${frage}=${stufe}`);
  feld.checked = true;
}

/**
 * Merkt sich die Aufrufe der Action samt Nutzlast. Bewusst kein `vi.fn` mit
 * leerer Signatur: die Nutzlast IST der Pruefgegenstand ("kommen alle acht Noten
 * an?"), und ein Mock ohne Parametertyp macht `calls[0][0]` untypisiert.
 */
function mitschrift() {
  const aufrufe: FormData[] = [];
  const action = async (fd: FormData): Promise<void> => {
    aufrufe.push(fd);
  };
  return { aufrufe, action };
}

/** Die beiden Absende-Knoepfe (§3.2 Punkt 5 und 7). */
function absendeknoepfe(): HTMLButtonElement[] {
  return queryAll<HTMLButtonElement>("[data-absenden]");
}

/** Alle acht Noten setzen — der Zustand, in dem der Zettel absendbar ist. */
async function alleNoten(stufe = 2): Promise<void> {
  for (let i = 1; i <= 8; i++) await clickElement(feld(`q${i}`, stufe));
}

/**
 * Fuenf von acht Noten: offen bleiben q4, q7 und q8 — die erste Luecke ist
 * damit Frage 4, genau der Fall aus der Anforderungsliste ("Noch 3 Noten offen
 * — Frage 4.").
 */
async function fuenfVonAchtNoten(): Promise<void> {
  for (const nr of [1, 2, 3, 5, 6]) await clickElement(feld(`q${nr}`, 2));
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
    /*
     * Die gefuellte Zeile besteht aus Frage, Feld, dem leeren sichtbaren Zaehler
     * und der leeren Live-Region der Ansage (§3.10 — beide stehen immer im Baum;
     * bei diesem kurzen Text haben beide nichts zu sagen). Kein weiterer Knoten,
     * also kein Haekchen und kein "erledigt": bei freiwilligen Feldern waere ein
     * Haekchen eine stille Beschaemung der leeren.
     */
    const zeile = query(`[data-textzeile="q9"]`);
    expect(Array.from(zeile.children).map((kind) => kind.tagName)).toEqual([
      "LABEL",
      "TEXTAREA",
      "SPAN",
      "SPAN",
    ]);
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
        siegel={FASSUNG_A}
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

  /*
   * Mit allen acht Noten, denn seit Task 13 ist eine Abgabe mit Luecken kein
   * Absenden mehr, sondern ein Sprung zur Luecke — und dann darf der Entwurf
   * gerade NICHT fallen. Genau das prueft der zweite Test.
   */
  it("loescht den Entwurf bei der Abgabe", async () => {
    await zeichneStandard();
    await alleNoten();
    await tippe("q9", "Kartenkunde");
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).not.toBeNull();
    await submitForm();
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).toBeNull();
  });

  it("behaelt den Entwurf, wenn Noten fehlen und der Sprung zur Luecke greift", async () => {
    await zeichneStandard();
    await tippe("q9", "Kartenkunde");
    await submitForm();
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).not.toBeNull();
    expect(textfeld("q9").value).toBe("Kartenkunde");
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

/*
 * DER ANGELPUNKT DES ENTWURFS (§3.2 Punkt 5): nach der achten Note kommt der
 * Abschluss mit Siegel und Absende-Knopf, die Freitexte liegen DARUNTER. Wer um
 * 21:31 gehen will, ist nach acht Tipps fertig; wer schreiben will, scrollt
 * weiter. Der Preis ist benannt (freiwilliger Text kann ungeschrieben bleiben),
 * der Gewinn ist die Zusage: es koennen NIEMALS Pflichtnoten verloren gehen.
 */
describe("Abschluss-Block: der Pflichtteil endet VOR den Freitexten", () => {
  it("stellt den Abschluss-Block vor die Freitextsektion", async () => {
    await zeichneStandard();
    const abschluss = query("[data-abschluss]");
    const freitexte = query("[data-freitexte]");
    // Bit 4 = DOCUMENT_POSITION_FOLLOWING: die Freitexte kommen NACH dem Abschluss.
    expect(abschluss.compareDocumentPosition(freitexte) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Und der erste Absende-Knopf steht im Abschluss-Block, nicht dahinter.
    expect(abschluss.contains(absendeknoepfe()[0])).toBe(true);
  });

  it("nennt den Pflichtteil beendet und erklaert die Notenuebersicht", async () => {
    await zeichneStandard();
    const abschluss = query("[data-abschluss]");
    expect(abschluss.textContent).toContain("Das war der Pflichtteil.");
    expect(abschluss.textContent).toContain("Tippe eine Zahl an, um sie zu ändern.");
  });

  it("traegt das Anonymitaetssiegel wortgenau in Fassung A", async () => {
    await zeichneStandard();
    const siegel = query("[data-siegel]");
    expect(query("[data-abschluss]").contains(siegel)).toBe(true);
    expect(siegel.textContent).toBe(FASSUNG_A);
    // Der Satz aus Entwurf 1 steht im Formular (§3.2 Punkt 6: in der
    // Freitextsektion, wo er wirkt — nicht zweimal auf 200px).
    expect(query("form").textContent).toContain("Schreib nichts, woran man dich erkennt.");
  });

  it("laesst die Server Component den Siegeltext liefern", () => {
    // Das Siegel ist eine Zusage ueber SERVER-Verhalten (gerundeter Zeitstempel,
    // gemischte Leseordnung). Sie gehoert neben den Code, der sie wahr macht —
    // deshalb liegt der Wortlaut in `page.tsx` und reist als Prop.
    expect(pageQuelle).toContain(FASSUNG_A);
    expect(pageQuelle).toContain("siegel={");
  });

  it("stellt Siegel und Kacheln nicht in Rot dar", () => {
    expect(cssRegel(".siegel")).toMatch(/border-left:\s*2px solid var\(--graphit\)/);
    expect(cssRegel(".siegel")).toMatch(/background:\s*var\(--tint\)/);
    for (const selektor of [".siegel", ".kachel", ".kachel[data-offen]"]) {
      expect(cssRegel(selektor)).not.toBe("");
      expect(cssRegel(selektor)).not.toMatch(/#c8000f/i);
    }
  });
});

describe("Zwei Absenden-Knoepfe desselben Formulars", () => {
  it("beschriftet beide gleich und macht beide zu `submit`, sobald alle Noten stehen", async () => {
    await zeichneStandard();
    await alleNoten();
    const knoepfe = absendeknoepfe();
    expect(knoepfe).toHaveLength(2);
    expect(knoepfe.map((k) => k.textContent)).toEqual([
      "Rückmeldung absenden",
      "Rückmeldung absenden",
    ]);
    expect(knoepfe.map((k) => k.type)).toEqual(["submit", "submit"]);
    // Beide gehoeren zum SELBEN Formular — sonst waere unklar, welcher sendet.
    const formular = query<HTMLFormElement>("form");
    for (const knopf of knoepfe) expect(knopf.form).toBe(formular);
  });

  it("liefert schon ohne JavaScript zwei `submit`-Knoepfe mit dem regulaeren Label", () => {
    const markup = renderToStaticMarkup(
      <Zettel
        questions={STANDARD_QUESTIONS}
        scale={6}
        action={nichtsTun}
        tokenHash={TOKEN_HASH}
        siegel={FASSUNG_A}
      />,
    );
    expect(markup.match(/type="submit"/g)).toHaveLength(2);
    expect(markup.match(/Rückmeldung absenden/g)).toHaveLength(2);
    // Ohne JavaScript gibt es keinen Lueckenspringer — dann muss `required`
    // greifen, also darf `novalidate` NICHT im gelieferten HTML stehen.
    expect(markup.toLowerCase()).not.toContain("novalidate");
    expect(markup).not.toContain("Noten offen");
  });

  it("gibt dem Formular die Server Action unveraendert — sonst faellt der Weg ohne JS", () => {
    /*
     * Die einzige Zusage dieser Aufgabe, deren Bruch fuer Typecheck, Lint, Build
     * UND jeden Mounttest unsichtbar ist. Belegt: `renderToStaticMarkup` rendert
     * fuer eine gewoehnliche Client-Funktion
     *   action="javascript:throw new Error('React form unexpectedly submitted.')"
     * — eine Abgabe ohne JavaScript ist dann unmoeglich. Nur eine
     * SERIALISIERBARE Server Action bekommt das echte POST-Ziel, und die ueberlebt
     * keinen Wrapper. Deshalb hier an beiden Enden der Kette im Quelltext
     * festgenagelt; das Verhalten selbst belegt der E2E-Lauf ohne JavaScript
     * (Task 15).
     */
    expect(pageQuelle).toMatch(/action=\{submitResponseAction\.bind\(null, slugSecret\)\}/);
    expect(zettelQuelle).toMatch(/<form[\s\S]{0,120}action=\{action as unknown as/);
    // Mit JavaScript uebernimmt `onSubmit` per `preventDefault` — React ruft die
    // Action dann nicht auf (react-dom 19.2), der Aufrufer kann fangen.
    expect(zettelQuelle).toMatch(/ereignis\.preventDefault\(\)/);
  });

  it("stellt den Freiwilligkeits-Hinweis unter den ersten, die Kurzzusage ueber den zweiten Knopf", async () => {
    await zeichneStandard();
    const [erster, zweiter] = absendeknoepfe();
    expect(erster.nextElementSibling?.textContent).toBe(
      "Die sechs freien Zeilen darunter sind freiwillig — du kannst auch direkt absenden.",
    );
    expect(zweiter.previousElementSibling?.textContent).toBe(
      "Anonym — kein Name, kein Gerät, keine Uhrzeit.",
    );
  });
});

describe("Notenuebersicht als Lueckenspringer", () => {
  it("zeigt acht Kacheln in Fragereihenfolge — offene mit Fragenummer", async () => {
    await zeichneStandard();
    const kacheln = queryAll("[data-kachel]");
    expect(kacheln).toHaveLength(8);
    expect(kacheln.map((k) => k.getAttribute("data-kachel"))).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
      "q5",
      "q6",
      "q7",
      "q8",
    ]);
    // Offen: gestrichelte Kontur (CSS) plus die Fragenummer als Text.
    expect(kacheln.every((k) => k.hasAttribute("data-offen"))).toBe(true);
    expect(kacheln.map((k) => k.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(cssRegel(".kachel[data-offen]")).toMatch(/border:\s*1px dashed var\(--linie-stark\)/);
  });

  it("zeigt an einer beantworteten Kachel die Ziffer der Note", async () => {
    await zeichneStandard();
    await clickElement(feld("q3", 5));
    const kachel = query('[data-kachel="q3"]');
    expect(kachel.hasAttribute("data-offen")).toBe(false);
    expect(kachel.textContent).toBe("5");
    expect(kachel.getAttribute("aria-label")).toContain("Note 5 – mangelhaft");
  });

  it("springt zur Frage und setzt den Fokus auf ihr erstes Feld", async () => {
    await zeichneStandard();
    await clickElement(query('[data-kachel="q6"]'));
    expect(document.activeElement).toBe(radios("q6")[0]);
    // Lesezeichen statt Ruege: 2px-Balken an der linken Kante der Zielzeile.
    expect(zeilen()[5].hasAttribute("data-lesezeichen")).toBe(true);
    expect(cssRegel(".zeile[data-lesezeichen]")).toMatch(/var\(--graphit\)/);
  });
});

/*
 * §3.6 "Pflicht ohne Pruefungsgefuehl": mit JavaScript uebernimmt der gestaltete
 * Lueckenspringer (`noValidate`), ohne JavaScript bleibt `required` das Netz.
 * Kein Rot, kein Alert, nie das Wort "Fehler" — eine Sammelfehlermeldung nach
 * dem Serverweg (mit Datenverlust) ist genau der Zustand, den der Umbau beendet.
 */
describe("Pflicht ohne Pruefungsgefuehl", () => {
  it("setzt `noValidate` erst beim Mounten und laesst `required` stehen", async () => {
    await zeichneStandard();
    expect(query<HTMLFormElement>("form").noValidate).toBe(true);
    expect(queryAll<HTMLInputElement>('input[type="radio"]').every((r) => r.required)).toBe(true);
  });

  it("traegt den Zustand als Text und wird zum Navigations-Knopf", async () => {
    await zeichneStandard();
    await fuenfVonAchtNoten();
    for (const knopf of absendeknoepfe()) {
      expect(knopf.textContent).toBe("Noch 3 Noten offen");
      expect(knopf.type).toBe("button");
    }
    await clickElement(feld("q4", 3));
    await clickElement(feld("q7", 3));
    for (const knopf of absendeknoepfe()) {
      expect(knopf.textContent).toBe("Noch 1 Note offen");
    }
  });

  it("navigiert zur ersten Luecke, meldet sie hoeflich und sendet NICHT", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    await fuenfVonAchtNoten();
    await clickElement(absendeknoepfe()[0]);
    expect(aufrufe).toHaveLength(0);
    expect(document.activeElement).toBe(radios("q4")[0]);
    const ansage = query("[data-ansage]");
    expect(ansage.getAttribute("aria-live")).toBe("polite");
    expect(ansage.textContent).toBe("Noch 3 Noten offen — Frage 4.");
  });

  it("sendet auch bei einer Abgabe aus dem Formular nicht, solange Noten fehlen", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    await fuenfVonAchtNoten();
    await submitForm();
    expect(aufrufe).toHaveLength(0);
    expect(document.activeElement).toBe(radios("q4")[0]);
  });

  it("sendet, sobald alle acht Noten stehen", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    await alleNoten(3);
    await submitForm();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].get("q1")).toBe("3");
    expect(aufrufe[0].get("q8")).toBe("3");
  });

  it("kennt im Lueckenpfad kein Rot und nie das Wort `Fehler`", async () => {
    await zeichneStandard();
    await fuenfVonAchtNoten();
    await clickElement(absendeknoepfe()[0]);
    expect(query("form").textContent).not.toContain("Fehler");
    // Und der Pfad traegt auch in CSS keine Warnfarbe: der Umriss-Knopf, das
    // Lesezeichen und der Puls laufen in Graphit bzw. `--tint`.
    expect(cssRegel(".knopfUmriss")).toMatch(/var\(--graphit\)/);
    expect(cssRegel(".knopfUmriss")).not.toMatch(/#c8000f/i);
    expect(cssRegel("@keyframes puls")).toMatch(/var\(--tint\)/);
    expect(cssRegel("@keyframes puls")).not.toMatch(/#c8000f/i);
  });
});

/*
 * DER RIEGEL DARF NICHT AM ZUSTAND ALLEIN HAENGEN.
 *
 * Die Radios sind unkontrolliert (kein `checked`-Prop), der Zustand `noten`
 * fuellt sich nur ueber `onChange`. Zwei Wege setzen eine Note OHNE
 * change-Ereignis: die Formular-Wiederherstellung des Browsers beim
 * Neuladen/Zuruecknavigieren und das Antippen VOR der Hydration — genau der Weg,
 * den §3.11 zusagt. Liest der Riegel nur den Zustand, dann faerbt CSS acht Chips
 * (`input:checked + .chip`), `new FormData(form)` traegt acht Noten, und der Knopf
 * behauptet trotzdem "Noch 8 Noten offen" und sendet nicht. Und er heilt NICHT:
 * ein zweiter Tipp auf die schon gesetzte Note feuert kein change-Ereignis, die
 * Person muesste achtmal erst eine FALSCHE Note waehlen und dann die richtige.
 * Deshalb ist das DOM hier die Wahrheit.
 */
describe("Absende-Riegel: gesetzt ist gesetzt, auch ohne change-Ereignis", () => {
  it("sendet, wenn die Noten nur im DOM stehen (Formular-Wiederherstellung)", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    for (let i = 1; i <= 8; i++) setzeOhneEreignis(query("form"), `q${i}`, 2);
    await submitForm();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].get("q1")).toBe("2");
    expect(aufrufe[0].get("q8")).toBe("2");
  });

  it("heilt beim ersten Tipp auf den Knopf und sendet — nicht zwei Tipps", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    for (let i = 1; i <= 8; i++) setzeOhneEreignis(query("form"), `q${i}`, 3);
    // Der Knopf traegt noch den veralteten Lueckentext …
    expect(absendeknoepfe()[0].type).toBe("button");
    expect(absendeknoepfe()[0].textContent).toBe("Noch 8 Noten offen");
    // … EIN Tipp muss reichen.
    await clickElement(absendeknoepfe()[0]);
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].get("q4")).toBe("3");
    // Und danach traegt keiner von beiden mehr den veralteten Lueckentext. Der
    // Wortlaut steht hier absichtlich nicht: die Abgabe LAEUFT in diesem Moment,
    // also traegt der Knopf den Pending-Zustand aus 3.8 ("Wird gesendet…").
    for (const knopf of absendeknoepfe()) {
      expect(knopf.type).toBe("submit");
      expect(knopf.textContent).not.toBe("Noch 8 Noten offen");
    }
    expect(queryAll("[data-kachel][data-offen]")).toHaveLength(0);
  });

  it("springt weiterhin, wenn im DOM wirklich noch Noten fehlen", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    // Fuenf per Tipp (q1–q3, q5, q6), q4 nur im DOM: offen bleiben q7 und q8.
    await fuenfVonAchtNoten();
    setzeOhneEreignis(query("form"), "q4", 2);
    await clickElement(absendeknoepfe()[0]);
    expect(aufrufe).toHaveLength(0);
    expect(query("[data-ansage]").textContent).toBe("Noch 2 Noten offen — Frage 7.");
    expect(document.activeElement).toBe(radios("q7")[0]);
  });

  it("uebernimmt beim Hydrieren, was schon angetippt war (§3.11)", async () => {
    // Der Weg ohne JavaScript: das HTML steht, acht Noten sind gesetzt, DANN
    // kommt React. Belegt, dass `checked` die Hydration ueberlebt — der Zustand
    // muss also nachziehen, sonst steht die Person vor einem toten Knopf.
    const { aufrufe, action } = mitschrift();
    await hydriereStandard((host) => {
      for (let i = 1; i <= 8; i++) setzeOhneEreignis(host, `q${i}`, 2);
    }, action);
    expect(queryAll('input[type="radio"]:checked')).toHaveLength(8);
    for (const knopf of absendeknoepfe()) {
      expect(knopf.type).toBe("submit");
      expect(knopf.textContent).toBe("Rückmeldung absenden");
    }
    // Und die Uebersicht zeigt die Ziffern, nicht acht gestrichelte Kacheln.
    expect(queryAll("[data-kachel][data-offen]")).toHaveLength(0);
    expect(queryAll("[data-kachel]").map((k) => k.textContent)).toEqual([
      "2",
      "2",
      "2",
      "2",
      "2",
      "2",
      "2",
      "2",
    ]);
    // Und die Zusage ganz: „Knopf ist `submit` UND die Abgabe geht durch."
    await submitForm();
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0].get("q1")).toBe("2");
    expect(aufrufe[0].get("q8")).toBe("2");
  });

  it("laesst den Knopf beim Hydrieren ohne Vorauswahl unveraendert", async () => {
    // Gegenprobe: ohne gesetzte Radios darf der Abgleich nichts erfinden.
    await hydriereStandard();
    for (const knopf of absendeknoepfe()) {
      expect(knopf.type).toBe("button");
      expect(knopf.textContent).toBe("Noch 8 Noten offen");
    }
  });
});

/*
 * §3.2 Punkt 8 und §3.10: der Navigator zeigt FORTSCHRITT, keine Bewertung. Die
 * 15px-Farbmarke des Konkurrenzentwurfs waere reine Farbkodierung ohne lesbare
 * Ziffer — die farbige Notenuebersicht steht dafuer im Abschluss-Block.
 */
describe("Navigator: Fortschritt, kein zweiter Absende-Knopf", () => {
  it("erscheint erst nach der ersten Note", async () => {
    await zeichneStandard();
    expect(exists("[data-navigator]")).toBe(false);
    await clickElement(feld("q1", 2));
    expect(exists("[data-navigator]")).toBe(true);
  });

  it("traegt acht Striche, den Ankersatz und keinen Absende-Knopf", async () => {
    await zeichneStandard();
    await clickElement(feld("q1", 2));
    const navigator = query("[data-navigator]");
    expect(navigator.querySelectorAll("[data-strich]")).toHaveLength(8);
    expect(navigator.querySelectorAll("[data-strich][data-voll]")).toHaveLength(1);
    expect(navigator.textContent).toContain("1 = sehr gut · 6 = ungenügend");
    expect(navigator.querySelector("[data-absenden]")).toBeNull();
    expect(navigator.querySelector('button[type="submit"]')).toBeNull();
  });

  it("verdeckt den zweiten Absende-Knopf nicht", () => {
    // Die Leiste liegt fest am Unterrand (56px), das Blatt hat 32px Bodenabstand:
    // ohne diese Regel laege sie ueber dem Knopf am Fuss des Zettels.
    expect(cssRegel(".navigator")).toMatch(/position:\s*fixed/);
    expect(cssRegel(".form:has([data-navigator])")).toMatch(/padding-bottom:\s*calc\(56px/);
  });

  it("faerbt die Striche in Tinte statt in einer Notenfarbe", () => {
    // Keine Ampelfarbe: der Navigator kennt `--tinte` und `--linie-stark`,
    // NICHT `--note-hell`/`--note-dunkel`.
    expect(cssRegel(".strich")).toMatch(/var\(--linie-stark\)/);
    expect(cssRegel(".strich[data-voll]")).toMatch(/var\(--tinte\)/);
    for (const selektor of [".navigator", ".strich", ".strich[data-voll]"]) {
      expect(cssRegel(selektor)).not.toMatch(/--note-/);
      expect(cssRegel(selektor)).not.toMatch(/#c8000f/i);
    }
  });
});

/*
 * Task 9 hat das `try/catch` im Client entfernt, weil ein Catch den
 * Erfolgs-`redirect` verschluckt haette. Das gilt fuer den RUMPF der Action —
 * nicht fuer den Aufrufer: Next transportiert den Redirect in der Antwort, der
 * Client-Aufruf lehnt dafuer nicht ab. Seitdem landeten kaputtes `questions`-JSON
 * und ein Schreibfehler auf der technischen Fehlerseite, MIT Datenverlust.
 */
describe("Unerwartete Ausnahme der Action", () => {
  async function wirft(): Promise<void> {
    throw new Error("SQLITE_READONLY");
  }

  it("zeigt eine Zeile im Formular und laesst alle Eingaben stehen", async () => {
    await zeichneStandard(wirft);
    await alleNoten(4);
    await tippe("q9", "Kartenkunde bitte wiederholen");
    await submitForm();
    const meldung = query("[data-meldung]");
    expect(query("form").contains(meldung)).toBe(true);
    expect(meldung.getAttribute("role")).toBe("alert");
    expect(meldung.textContent).toContain("Deine Eingaben stehen noch");
    // Die Noten sind noch da — kein Datenverlust, keine Fehlerseite.
    expect(radios("q1")[3].checked).toBe(true);
    expect(radios("q8")[3].checked).toBe(true);
    expect(textfeld("q9").value).toBe("Kartenkunde bitte wiederholen");
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).not.toBeNull();
  });

  it("nennt das Wort `Fehler` auch dann nicht", async () => {
    await zeichneStandard(wirft);
    await alleNoten();
    await submitForm();
    expect(exists("[data-meldung]")).toBe(true);
    expect(query("form").textContent).not.toContain("Fehler");
  });

  /*
   * Die Meldung liegt im Abschluss-Block, also OBERHALB der Freitexte. Wer mit
   * dem ZWEITEN Knopf absendet, steht 400-500px darunter — ohne Scroll und Fokus
   * passiert nach dem Tippen sichtbar NICHTS, nicht unterscheidbar von einem
   * toten Knopf. Beide Knoepfe sind absichtlich austauschbar; eine Fehlerflaeche,
   * die nur von einem der beiden aus sichtbar ist, waere intern widersprüchlich.
   */
  it("holt die Meldung in den Blick, auch beim Absenden mit dem ZWEITEN Knopf", async () => {
    const attrappe = scrollAttrappe();
    try {
      await zeichneStandard(wirft);
      await alleNoten(4);
      const zweiter = absendeknoepfe()[1];
      // Der zweite Knopf steht hinter den Freitexten, nicht im Abschluss-Block.
      expect(query("[data-abschluss]").contains(zweiter)).toBe(false);
      await clickElement(zweiter);
      const meldung = query("[data-meldung]");
      expect(attrappe.ziele).toContain(meldung);
      // Der Fokus wandert NICHT mit: die Meldung traegt `role="alert"` (3.8
      // schreibt sie fuer das `closed`-Panel fest), und Rolle PLUS programmatischer
      // Fokus kuendigen sie moeglicherweise zweimal an. Das Scrollen bleibt — es
      // dient den Sehenden, was die Rolle nicht leistet.
      expect(document.activeElement).not.toBe(meldung);
    } finally {
      attrappe.zurueck();
    }
  });

  it("holt sie beim ZWEITEN Fehlversuch wieder in den Blick", async () => {
    // Der eigentliche Schaden war mehrfaches Tippen. Bleibt die Meldung beim
    // zweiten Versuch stumm, ist der Knopf aus Sicht der Person wieder tot —
    // obwohl der Text derselbe ist.
    const attrappe = scrollAttrappe();
    try {
      await zeichneStandard(wirft);
      await alleNoten(4);
      await clickElement(absendeknoepfe()[1]);
      const nachErstem = attrappe.ziele.length;
      expect(nachErstem).toBeGreaterThan(0);
      await clickElement(absendeknoepfe()[1]);
      expect(attrappe.ziele.length).toBe(nachErstem + 1);
      expect(attrappe.ziele.at(-1)).toBe(query("[data-meldung]"));
    } finally {
      attrappe.zurueck();
    }
  });

  it("laesst die Meldung in `--tint` mit Graphit-Kante laufen, nicht in Rot", () => {
    const regel = cssRegel(".meldung");
    expect(regel).toMatch(/background:\s*var\(--tint\)/);
    expect(regel).toMatch(/color:\s*var\(--tinte\)/);
    expect(regel).toMatch(/border-left:\s*2px solid var\(--graphit\)/);
    expect(regel).not.toMatch(/#c8000f/i);
  });
});

/*
 * DIE ABWEISUNGEN DER ACTION (Entwurf 3.8) — vorher der stillste Weg der Route.
 *
 * `submitResponseAction` gibt `{ ok: false, code: … }` zurueck, statt zu werfen.
 * Der Client las diesen Wert aber nur, um zu entscheiden, ob der Entwurf fallen
 * darf: laeuft die Frist mitten in der Sitzung ab, tippt jemand acht Noten und
 * drueckt "Rueckmeldung absenden" — und es aenderte sich KEIN PIXEL. Kein Satz,
 * kein Panel, kein Hinweis; nur ein Knopf, der aussieht wie vorher. Diese Tests
 * nageln fest, dass jeder Code eine sichtbare Wirkung hat.
 */
describe("Abweisungen der Action werden sichtbar", () => {
  /** Eine Action, die genau einen Code abweist. */
  function weistAb(code: string, missing?: string[]) {
    return async (): Promise<SubmitResult> =>
      ({ ok: false, code, ...(missing ? { missing } : {}) }) as SubmitResult;
  }

  async function abgesendet(code: string, missing?: string[]): Promise<HTMLElement> {
    await zeichneStandard(weistAb(code, missing));
    await alleNoten(3);
    await submitForm();
    return query("[data-meldung]");
  }

  it("nennt bei `closed` den Zustand UND was aus der Abgabe wurde", async () => {
    const meldung = await abgesendet("closed");
    expect(meldung.getAttribute("role")).toBe("alert");
    expect(meldung.textContent).toContain("Die Umfrage zu diesem Abend ist beendet.");
    // Der ehrliche Zusatz aus 3.8 — ohne ihn bleibt offen, wo die Noten blieben.
    expect(meldung.textContent).toContain("Deine Rückmeldung konnte nicht mehr gespeichert werden.");
  });

  it("nimmt bei `closed` beide Absende-Knoepfe weg — es gibt nichts mehr zu senden", async () => {
    expect((await zeichneStandard(weistAb("closed")), absendeknoepfe())).toHaveLength(2);
    await alleNoten(3);
    await submitForm();
    expect(absendeknoepfe()).toHaveLength(0);
    // Die Eingaben bleiben trotzdem stehen — sie sind nicht abgebbar, nicht weg.
    expect(radios("q1")[2].checked).toBe(true);
  });

  it("behandelt `none` (Umfrage von Hand geschlossen) genauso — nicht stumm", async () => {
    const meldung = await abgesendet("none");
    expect(meldung.textContent).toContain("Zurzeit läuft keine Umfrage.");
    expect(absendeknoepfe()).toHaveLength(0);
  });

  it("bittet beim Ratelimit um EINEN Tipp und laesst alle Eingaben stehen", async () => {
    await zeichneStandard(weistAb("ratelimit"));
    await alleNoten(3);
    await tippe("q9", "Kartenkunde bitte wiederholen");
    await submitForm();
    expect(query("[data-meldung]").textContent).toContain(
      "Gerade sind viele Rückmeldungen gleichzeitig unterwegs. Bitte einmal auf Absenden tippen.",
    );
    expect(radios("q1")[2].checked).toBe(true);
    expect(textfeld("q9").value).toBe("Kartenkunde bitte wiederholen");
    // Kein Endstand: nach der Sperre soll die Abgabe noch gehen.
    expect(absendeknoepfe()).toHaveLength(2);
  });

  it("sperrt beide Knoepfe 20 Sekunden und gibt sie dann wieder frei", async () => {
    vi.useFakeTimers();
    try {
      await zeichneStandard(weistAb("ratelimit"));
      await alleNoten(3);
      await submitForm();
      // BEIDE: sie sind derselbe Knopf, zweimal — ein offener unten waere die
      // Einladung, genau dort noch einmal zu tippen.
      expect(absendeknoepfe().map((k) => k.disabled)).toEqual([true, true]);
      // In `act`, weil der Zeitgeber einen Zustand setzt: ohne die Klammer laeuft
      // das Nachrendern erst nach der Zusicherung, und der Test misst den Stand
      // von vorher.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SPERRE_MS + 100);
      });
      expect(absendeknoepfe().map((k) => k.disabled)).toEqual([false, false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("nennt bei `incomplete` den Satz aus 3.8", async () => {
    const meldung = await abgesendet("incomplete", ["q5"]);
    expect(meldung.textContent).toContain("Da fehlten noch Noten.");
  });

  /*
   * `invalid` kann mitten in einer Sitzung nur entstehen, wenn das Token
   * aufgehoert hat zu gelten (die Gruppenleitung hat das Secret neu gesetzt).
   * Selten — aber ein Code ohne Text waere wieder der stille Knopf, und genau
   * dagegen steht dieser Test.
   */
  it("laesst KEINEN Code ohne sichtbare Wirkung — auch nicht `invalid`", async () => {
    const meldung = await abgesendet("invalid");
    expect(meldung.textContent).toContain("Das Absenden hat gerade nicht geklappt");
  });

  it("nennt in keiner Abweisung das Wort `Fehler`", async () => {
    for (const code of ["closed", "none", "ratelimit", "incomplete"]) {
      await zeichneStandard(weistAb(code));
      await alleNoten(3);
      await submitForm();
      expect(query("[data-meldung]").textContent).not.toContain("Fehler");
      await unmount();
    }
  });

  it("holt die Abweisung in den Blick — wie die Ausnahme", async () => {
    const attrappe = scrollAttrappe();
    try {
      await zeichneStandard(weistAb("ratelimit"));
      await alleNoten(3);
      await clickElement(absendeknoepfe()[1]);
      const meldung = query("[data-meldung]");
      expect(attrappe.ziele).toContain(meldung);
    } finally {
      attrappe.zurueck();
    }
  });

  /*
   * Der Unterschied, an dem beide Wege haengen: MIT JavaScript muss die Action
   * antworten (die Eingaben bleiben stehen), OHNE JavaScript muss sie umleiten
   * (den Rueckgabewert liest dort niemand). Kenntlich macht ihn dieses Feld — und
   * zwar erst hier im Handler, nicht als verstecktes Feld im Markup: ein Feld im
   * Markup haengt an der Hydration, und ein VOR der Hydration abgeschickter Bogen
   * (der Weg, den §3.11 zusagt) wuerde faelschlich als "mit JS" gelesen.
   */
  it("kennzeichnet die Nutzlast als `mit JavaScript`", async () => {
    const { aufrufe, action } = mitschrift();
    await zeichneStandard(action);
    await alleNoten(3);
    await submitForm();
    expect(aufrufe[0].get(JS_FELD)).toBe("1");
  });

  it("schreibt das Kennzeichen NICHT ins Markup — sonst haengt es an der Hydration", () => {
    const markup = renderToStaticMarkup(
      <Zettel
        questions={STANDARD_QUESTIONS}
        scale={6}
        action={nichtsTun}
        tokenHash={TOKEN_HASH}
        siegel={FASSUNG_A}
      />,
    );
    expect(markup).not.toContain(JS_FELD);
  });

  it("laesst den gesperrten Knopf gedaempft aussehen — ein Knopf, der nichts tut, wird getippt", () => {
    const regel = cssRegel(".knopf:disabled");
    expect(regel).toMatch(/opacity/);
    expect(regel).not.toMatch(/#c8000f/i);
  });
});

/*
 * DIE POLITUR (Task N3): die gesammelten Detailfunde aus den Reviews der Tasks
 * 11–14. Einzeln je "Minor", zusammen genau der Unterschied zwischen
 * "funktioniert" und "ist schoen". Zwei davon treffen TRAEGER des Entwurfs
 * selbst: der Legendenstreifen zeigte bis ~5px neben die Chips, auf die er zeigt
 * (er ist Traeger 1 der Richtungserkennung, §3.6), und in jeder schon
 * beantworteten Zeile fehlte die Hover-Rueckmeldung — also genau dort, wo jemand
 * eine Note AENDERN will.
 *
 * Die Nummern folgen der Fundliste, damit ein Fehlschlag auf einen Fund zeigt.
 */
describe("Politur der oeffentlichen Ansicht", () => {
  /** Fuenfstufige Alt-Umfrage: dort wird die Rampe abgetastet (§3.6). */
  const starsFragen: Question[] = [
    { id: "s1", type: "stars", text: "Wie war der Dienstabend insgesamt?" },
    { id: "s2", type: "stars", text: "Wie spannend war das Thema fuer dich?" },
  ];

  /** Spalten und Abstand einer Regel — jsdom rechnet kein CSS, also Quelltext. */
  function raster(selektor: string): { spalten: string; abstand: string } {
    const regel = cssRegel(selektor);
    expect(regel).not.toBe("");
    return {
      spalten: /grid-template-columns:\s*([^;]+);/.exec(regel)?.[1]?.trim() ?? "",
      abstand: /(?:^|[\s;{])gap:\s*([^;]+);/.exec(regel)?.[1]?.trim() ?? "",
    };
  }

  it("1. legt Legendenstreifen, Notenwoerter und Chips auf DASSELBE Raster", () => {
    const chips = raster(".chips");
    expect(chips).toEqual({ spalten: "repeat(6, 1fr)", abstand: "6px" });
    /*
     * Ohne denselben `gap` liegen die sechs Farbstopps bis ~5px neben der Spalte,
     * auf die sie zeigen. §3.2 Punkt 3 verlangt das "identische 6-Spalten-Raster",
     * und §3.6 nennt die Spaltengleichheit Traeger 1 der Richtungserkennung —
     * geprueft wird deshalb die GLEICHHEIT, nicht ein Literal: sie bleibt wahr,
     * wenn jemand spaeter eine Seite aendert.
     */
    expect(raster(".streifen")).toEqual(chips);
    expect(raster(".woerter")).toEqual(chips);
    const chips5 = raster('.chips[data-stufen="5"]');
    expect(chips5.spalten).toBe("repeat(5, 1fr)");
    expect(raster('.streifen[data-stufen="5"]').spalten).toBe(chips5.spalten);
    expect(raster('.woerter[data-stufen="5"]').spalten).toBe(chips5.spalten);
    // Der Radius sitzt jetzt am Segment: mit `gap` klippt der Container die
    // inneren Ecken nicht mehr, vier eckige Kloetzchen waeren die Folge.
    expect(cssRegel(".segment")).toMatch(/border-radius:\s*3px/);
  });

  it("2. laesst den Hover auch in einer schon beantworteten Zeile durch", () => {
    /*
     * `.chips:has(input:checked) .chip` hat Spezifitaet (0,3,1) und ueberschrieb
     * `.chip:hover` (0,2,0): in JEDER beantworteten Zeile gab es keine
     * Hover-Rueckmeldung mehr — also beim Aendern einer Note.
     */
    expect(cssOhneKommentare).toMatch(
      /\.chips:has\(input:checked\)\s+\.chip\s*\{[^}]*--rahmen:\s*var\(--linie\)/,
    );
    const hoverBlock = /@media \(hover: hover\)\s*\{([\s\S]*?)\n\}/.exec(cssOhneKommentare)?.[1];
    expect(hoverBlock).toBeDefined();
    expect(hoverBlock).toMatch(/\.chips:has\(input:checked\)\s+\.chip:hover/);
    expect(hoverBlock).toMatch(/--rahmen:\s*var\(--linie-stark\)/);
    // Und weiterhin KEINE Farbvorschau: eine Vorschau in der Notenfarbe waere
    // eine Bewertung, die niemand abgegeben hat (§3.6).
    expect(hoverBlock).not.toMatch(/--note-/);
  });

  it("3. haelt den Platz der Fussnote frei, damit die Notenwahl nichts verschiebt", async () => {
    await zeichneStandard();
    // Der Platz steht von Anfang an im Baum — acht Zeilen, acht Plaetze …
    const plaetze = queryAll(`.${s.fussnote}`);
    expect(plaetze).toHaveLength(8);
    // … aber ohne Text und ohne `data-fussnote`, also unsichtbar.
    expect(plaetze.every((p) => p.textContent === "")).toBe(true);
    expect(exists("[data-fussnote]")).toBe(false);
    await clickElement(feld("q1", 3));
    expect(queryAll("[data-fussnote]")).toHaveLength(1);
    /*
     * Sichtbarkeit umschalten statt ein-/ausbauen, und die Hoehe steht vorher:
     * 13px x 1,45 = 18,85px plus 8px Abstand — genau die ~27px, um die die Zeile
     * sonst bei jeder Notenwahl wuchs, waehrend der Finger schon zur naechsten
     * Zeile wanderte.
     */
    const regel = cssRegel(".fussnote");
    expect(regel).toMatch(/visibility:\s*hidden/);
    expect(regel).toMatch(/min-height:\s*1\.45em/);
    expect(cssRegel(".fussnote[data-fussnote]")).toMatch(/visibility:\s*visible/);
    /*
     * Die 160ms-Einblendung (§3.5) haengt am GESETZTEN Zustand, nicht am Platz:
     * stuende sie an `.fussnote`, liefe sie beim Seitenaufbau achtmal ins Leere
     * und bei der Wahl gar nicht mehr.
     */
    expect(cssRegel(".fussnote[data-fussnote]")).toMatch(/animation:\s*fussnoteEin/);
    expect(regel).not.toMatch(/animation:/);
  });

  it("4. laesst den Entwurf nach einer ABGEWIESENEN Abgabe stehen", async () => {
    const abweisen = async (): Promise<SubmitResult> => ({ ok: false, code: "closed" });
    await zeichneStandard(abweisen);
    await alleNoten(3);
    await tippe("q9", "Kartenkunde");
    await submitForm();
    expect(exists("[data-meldung]")).toBe(true);
    // Geloescht wird NUR bei erfolgreichem Absenden (§3.7) — sonst waeren die
    // Freitexte nach einem abgelehnten Absenden und einem Reload weg.
    expect(sessionStorage.getItem(entwurfSchluessel(TOKEN_HASH))).not.toBeNull();
    expect(textfeld("q9").value).toBe("Kartenkunde");
  });

  it("5. nennt eine Zeile aus reinem Leerraum NICHT beantwortet", async () => {
    await zeichneStandard();
    await tippe("q9", "   ");
    /*
     * `coerceAnswer` verwirft genau diesen Wert (`String(raw).trim() === ""`).
     * Da die kraeftigere Grundlinie ausdruecklich das verbotene Erledigt-Haekchen
     * ersetzt (§3.7), truege sie hier eine Falschaussage.
     */
    expect(textfeld("q9").hasAttribute("data-gefuellt")).toBe(false);
    await tippe("q9", " Kartenkunde ");
    expect(textfeld("q9").hasAttribute("data-gefuellt")).toBe(true);
    // Getrimmt wird die PRUEFUNG, nicht der Wert — die Person schreibt, was sie will.
    expect(textfeld("q9").value).toBe(" Kartenkunde ");
  });

  it("6. macht den Zeichenzaehler fuer Screenreader lesbar", async () => {
    await zeichneStandard();
    const beschreibung = textfeld("q9").getAttribute("aria-describedby");
    expect(beschreibung).toBe("q9-zaehler");
    /*
     * Der SICHTBARE Zaehler steht immer im Baum, auch leer — `aria-describedby`
     * braucht ein stabiles Ziel. Er traegt aber KEIN `aria-live`: er wird bei
     * jedem Tastendruck neu geschrieben, und §3.10 verlangt die Ansage
     * "gedrosselt". Ein Knoten, eine Rolle.
     */
    const sichtbar = query(`#${beschreibung}`);
    expect(sichtbar.hasAttribute("aria-live")).toBe(false);
    expect(sichtbar.textContent).toBe("");
    expect(exists("[data-zaehler]")).toBe(false);

    // Die Ansage ist ein zweiter, nur fuer Screenreader vorhandener Knoten.
    const ansage = query("[data-zaehler-ansage]");
    expect(ansage.getAttribute("aria-live")).toBe("polite");
    expect(ansage.className).toBe(s.srOnly);
    expect(ansage.hasAttribute("data-zaehler")).toBe(false);
    expect(ansage.textContent).toBe("");

    await tippe("q9", "z".repeat(420));
    expect(query(`#${beschreibung}`).textContent).toBe("noch 80 Zeichen");
    expect(query(`#${beschreibung}`).hasAttribute("data-zaehler")).toBe(true);
    expect(query("[data-zaehler-ansage]").textContent).toBe("noch etwa 80 Zeichen");
  });

  it("6b. drosselt die ANSAGE auf Stufen, waehrend die sichtbare Zahl zeichengenau bleibt", async () => {
    await zeichneStandard();
    // Bewusst als Literal aus §3.10 und nicht aus dem Modul importiert: der Test
    // haelt die ZUSAGE fest, nicht die Konstante, die sie umsetzt.
    const ZAEHLER_AB = 420;
    const gesehen: string[] = [];
    const gesagt: string[] = [];
    for (let laenge = ZAEHLER_AB; laenge <= MAX_TEXT_LENGTH; laenge++) {
      await tippe("q9", "z".repeat(laenge));
      gesehen.push(query("[data-zaehler]").textContent ?? "");
      gesagt.push(query("[data-zaehler-ansage]").textContent ?? "");
    }
    /*
     * DAS PAAR IST DIE AUSSAGE. Sichtbar: 81 verschiedene Texte, also jede Zahl
     * einzeln — wer hinsieht, liest die Wahrheit. Gesagt: fuenf verschiedene
     * Texte auf denselben 81 Tastendruecken. Genau das meint §3.10 mit
     * "gedrosselt"; eine Live-Region, die 80-mal in wenigen Sekunden mutiert,
     * plappert.
     */
    expect(new Set(gesehen).size).toBe(81);
    expect(new Set(gesagt).size).toBe(5);
    expect([...new Set(gesagt)]).toEqual([
      "noch etwa 80 Zeichen",
      "noch etwa 60 Zeichen",
      "noch etwa 40 Zeichen",
      "noch etwa 20 Zeichen",
      "Zeile ist voll",
    ]);
    // Die Ansage laeuft der sichtbaren Zahl nie voraus: "etwa 60" heisst <= 60.
    for (const [i, text] of gesagt.entries()) {
      const rest = MAX_TEXT_LENGTH - (ZAEHLER_AB + i);
      const stufe = Number(/\d+/.exec(text)?.[0] ?? 0);
      if (stufe > 0) expect(rest).toBeLessThanOrEqual(stufe);
    }
  });

  it("7. kuendigt denselben Lueckenstand auch beim ZWEITEN Tipp an", async () => {
    await zeichneStandard();
    await fuenfVonAchtNoten();
    await clickElement(absendeknoepfe()[0]);
    const erste = query("[data-ansage]").textContent ?? "";
    expect(erste).toBe("Noch 3 Noten offen — Frage 4.");
    await clickElement(absendeknoepfe()[0]);
    const zweite = query("[data-ansage]").textContent ?? "";
    /*
     * Schreibt der Zustand denselben String, rendert React nicht neu und die
     * Ansage bleibt stumm. Der Text muss sich also unterscheiden — im WORTLAUT
     * aber nicht, sonst stuende dort etwas anderes als beim ersten Mal.
     */
    expect(zweite).not.toBe(erste);
    expect(zweite.trim()).toBe(erste.trim());
  });

  it("8. kuendigt die Meldung genau einmal an — Rolle ODER Fokus", async () => {
    const attrappe = scrollAttrappe();
    try {
      await zeichneStandard(async () => {
        throw new Error("SQLITE_READONLY");
      });
      await alleNoten(4);
      await clickElement(absendeknoepfe()[1]);
      const meldung = query("[data-meldung]");
      // §3.8 schreibt `role="alert"` fest (fuer das `closed`-Panel) — also faellt
      // der programmatische Fokus, nicht die Rolle.
      expect(meldung.getAttribute("role")).toBe("alert");
      expect(document.activeElement).not.toBe(meldung);
      expect(meldung.hasAttribute("tabindex")).toBe(false);
      // Das Scrollen bleibt: es dient den Sehenden, was die Rolle nicht leistet.
      expect(attrappe.ziele).toContain(meldung);
    } finally {
      attrappe.zurueck();
    }
  });

  it("9. gleicht den Zustand an, BEVOR der Lueckenspringer sendet", async () => {
    const offeneKachelnBeimSenden: string[][] = [];
    const action = async (): Promise<void> => {
      offeneKachelnBeimSenden.push(
        queryAll("[data-kachel][data-offen]").map((k) => k.getAttribute("data-kachel") ?? ""),
      );
    };
    await zeichneStandard(action);
    for (let i = 1; i <= 8; i++) setzeOhneEreignis(query("form"), `q${i}`, 3);
    // Der Knopf traegt den veralteten Lueckentext (kein change-Ereignis) …
    expect(absendeknoepfe()[0].textContent).toBe("Noch 8 Noten offen");
    await clickElement(absendeknoepfe()[0]);
    /*
     * … und in genau diesem Zweig wird GESENDET. Ohne Angleichen VOR dem
     * `requestSubmit` zeigt die Uebersicht in dem Moment acht gestrichelte
     * Kacheln — die Abgabe laeuft, und die Seite behauptet, es fehle alles.
     */
    expect(offeneKachelnBeimSenden).toEqual([[]]);
  });

  it("10. traegt beim Absenden den Pending-Zustand: `aria-busy`, Label, `disabled`", async () => {
    let loesen = (): void => {};
    const haengt = (): Promise<void> =>
      new Promise((fertig) => {
        loesen = fertig;
      });
    await zeichneStandard(haengt);
    await alleNoten(3);
    await submitForm();
    const knoepfe = absendeknoepfe();
    expect(knoepfe.map((k) => k.textContent)).toEqual(["Wird gesendet…", "Wird gesendet…"]);
    expect(knoepfe.map((k) => k.getAttribute("aria-busy"))).toEqual(["true", "true"]);
    expect(knoepfe.map((k) => k.disabled)).toEqual([true, true]);
    // Ohne Spinner (§3.8): ein Spinner waere ein Kindelement im Knopf.
    expect(knoepfe.every((k) => k.children.length === 0)).toBe(true);
    /*
     * Und ohne Layoutverschiebung: der Knopf hat feste Masse, das laengere Label
     * kann ihn nicht wachsen lassen. Nicht ueber `cssRegel`, denn dessen Muster
     * greift auch in `.kurzzusage + .knopf` — hier muss die Grundregel her.
     */
    const knopfRegel = /\n\.knopf\s*\{[^}]*\}/.exec(cssOhneKommentare)?.[0] ?? "";
    expect(knopfRegel).toMatch(/width:\s*100%/);
    expect(knopfRegel).toMatch(/height:\s*48px/);
    await act(async () => {
      loesen();
    });
  });

  it("10b. nimmt den Pending-Zustand nach einer Ausnahme zurueck", async () => {
    await zeichneStandard(async () => {
      throw new Error("SQLITE_READONLY");
    });
    await alleNoten(3);
    await submitForm();
    const knoepfe = absendeknoepfe();
    // Bliebe er stehen, waeren nach einer Ausnahme BEIDE Knoepfe dauerhaft tot.
    expect(knoepfe.map((k) => k.textContent)).toEqual([
      "Rückmeldung absenden",
      "Rückmeldung absenden",
    ]);
    expect(knoepfe.map((k) => k.disabled)).toEqual([false, false]);
    expect(knoepfe.some((k) => k.hasAttribute("aria-busy"))).toBe(false);
  });

  it("10c. nimmt ihn auch nach einer Abweisung zurueck", async () => {
    await zeichneStandard(async (): Promise<SubmitResult> => ({ ok: false, code: "incomplete" }));
    await alleNoten(3);
    await submitForm();
    expect(absendeknoepfe().map((k) => k.disabled)).toEqual([false, false]);
    expect(absendeknoepfe().map((k) => k.textContent)).toEqual([
      "Rückmeldung absenden",
      "Rückmeldung absenden",
    ]);
  });

  it("13. reicht dem Chip eine VOLLFARBE statt `color-mix`", () => {
    /*
     * Im `stars`-Zweig wird die Sechser-Rampe abgetastet (1, 2, 3½, 5, 6): die
     * halben Indizes waren ein `color-mix(...)` in `--note-hell`. Kennt ein
     * Browser `color-mix` nicht, ist `background: var(--note-hell)` ungueltig →
     * `unset` → transparent, und die weisse Ziffer stand unsichtbar auf dem
     * hellen Blatt. Ein Rueckfall-`background` DAVOR hilft dagegen NICHT: eine
     * ungueltige var()-Ersetzung faellt auf `unset` zurueck, nicht auf die vorige
     * Deklaration — sie greift erst nach der Kaskade. Deshalb wird gerechnet.
     *
     * Ueber `renderToStaticMarkup` und nicht ueber das DOM: jsdom fuehrt keine
     * eigene CSSOM fuer Custom Properties, das `style`-Attribut waere dort leer.
     */
    const markup = renderToStaticMarkup(
      <Zettel
        questions={starsFragen}
        scale={5}
        action={nichtsTun}
        tokenHash={TOKEN_HASH}
        siegel={FASSUNG_A}
      />,
    );
    expect(markup).not.toContain("color-mix");
    // Note 3 der Fuenfer-Skala liegt bei Index 2½, also kanalweise mittig
    // zwischen `#7E6103` und `#904708` bzw. `#DAB22F` und `#EB9549`.
    expect(markup.toLowerCase()).toContain("#875406");
    expect(markup.toLowerCase()).toContain("#e3a43c");
    // Und die Vollstufen bleiben unveraendert die Palette aus `_lib/noten.ts`.
    expect(markup).toContain("#2F7F59");
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
