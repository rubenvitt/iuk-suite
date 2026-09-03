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

  /*
   * FIX-RUNDE 1, BEFUND W1: der „Naechstes Zeichen"-Link haengte fest auf
   * `/m/zeichen/lernen/runde` OHNE `?set=` — wer mit gewaehltem Lernset startete, uebte
   * ab der zweiten Frage still im ganzen Bestand. Das Set kommt jetzt als Prop herein
   * und haengt am Link.
   */
  it("haengt das gewaehlte Lernset an den Weiter-Link", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: true });
    await mount(
      <QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} set="rettungsdienst" />,
    );
    await click('[data-testid="quiz-option"]');
    const link = query<HTMLAnchorElement>('[data-testid="quiz-naechstes"]');
    expect(link.getAttribute("href")).toBe("/m/zeichen/lernen/runde?set=rettungsdienst");
  });

  /*
   * ABSCHLUSSREVIEW, W1 — DIE RUNDE VERRIET IHRE ANTWORT IM BILD.
   *
   * Die zwei Faelle unten benutzen ABSICHTLICH ein SVG in der Form des Generats
   * (`<title>` = Titel, `<desc>` = Bedeutung, `aria-labelledby` auf beide). Ein
   * Test mit `<svg></svg>` — wie die fuenf Faelle darueber ihn fuehren — waere
   * gruen, ohne irgendetwas zu belegen: da ist nichts, was auslaufen koennte.
   */
  const ECHTES_SVG = (id: string, titel: string, bedeutung: string) =>
    `<svg role="img" viewBox="0 0 10 10" aria-labelledby="${id}-t ${id}-d">` +
    `<title id="${id}-t">${titel}</title><desc id="${id}-d">${bedeutung}</desc>` +
    `<path d="M0 0"/></svg>`;

  it("zeigt das Fragebild ohne seine eigene Beschriftung", async () => {
    await mount(
      <QuizInsel
        frage={FRAGE}
        svg={ECHTES_SVG("z1", "Löschstaffel", "Löschstaffel der Feuerwehr")}
        beantworte={vi.fn()}
      />,
    );
    const bild = query('[data-testid="quiz-zeichen"]');

    // Die drei Dinge sind weg …
    expect(bild.innerHTML).not.toContain("<title");
    expect(bild.innerHTML).not.toContain("<desc");
    expect(bild.innerHTML).not.toContain("aria-labelledby");
    // … und damit auch der Antworttext, den die Optionen anbieten.
    expect(bild.innerHTML).not.toContain("Löschstaffel");
    // Das Bild selbst steht noch da — sonst waere „nichts rendern" auch gruen.
    expect(bild.innerHTML).toContain("<path");

    // Die Beschriftung kommt von aussen und ist der FRAGETEXT, nicht der Name.
    expect(bild.getAttribute("role")).toBe("img");
    const name = bild.getAttribute("aria-label") ?? "";
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toContain("Löschstaffel");
  });

  it("nennt einem Bildschirmleser nicht die Namen der Bildoptionen", async () => {
    const bildfrage = {
      zeichenId: "rezept:C.1.1",
      typ: "bedeutung_zeichen" as const,
      stamm: "Eine Staffel der Feuerwehr zum Löschen.",
      optionen: [
        { id: "rezept:C.1.1", antwort: "Löschstaffel", svg: ECHTES_SVG("a", "Löschstaffel", "A") },
        { id: "rezept:C.1.2", antwort: "Löschgruppe", svg: ECHTES_SVG("b", "Löschgruppe", "B") },
        { id: "rezept:C.1.3", antwort: "Löschzug", svg: ECHTES_SVG("c", "Löschzug", "C") },
        { id: "rezept:C.1.4", antwort: "Löschtrupp", svg: ECHTES_SVG("d", "Löschtrupp", "D") },
      ],
    };
    await mount(<QuizInsel frage={bildfrage} svg="" beantworte={vi.fn()} />);

    const knoepfe = queryAll('[data-testid="quiz-option"]');
    expect(knoepfe.length).toBe(4);

    knoepfe.forEach((knopf, i) => {
      // Der Name des Knopfes ist die laufende Nummer — nicht der des Zeichens.
      expect(knopf.getAttribute("aria-label")).toBe(`Antwort ${i + 1}`);
      // Das Bild ist aus dem Baum genommen; sein Markup traegt keinen Namen mehr.
      const flaeche = knopf.firstElementChild;
      expect(flaeche?.getAttribute("aria-hidden")).toBe("true");
      for (const o of bildfrage.optionen) {
        expect(knopf.innerHTML).not.toContain(o.antwort);
      }
      expect(knopf.innerHTML).toContain("<path");
    });
  });

  it("verlinkt ohne Parameter, wenn kein Lernset gewaehlt ist", async () => {
    const beantworte = vi.fn().mockResolvedValue({ richtig: true });
    await mount(<QuizInsel frage={FRAGE} svg="<svg></svg>" beantworte={beantworte} />);
    await click('[data-testid="quiz-option"]');
    const link = query<HTMLAnchorElement>('[data-testid="quiz-naechstes"]');
    expect(link.getAttribute("href")).toBe("/m/zeichen/lernen/runde");
  });
});
