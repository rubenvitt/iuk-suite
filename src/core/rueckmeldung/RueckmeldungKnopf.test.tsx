// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { RueckmeldungKnopf } from "@/core/rueckmeldung/RueckmeldungKnopf";
import { vergissRueckmeldungStand } from "@/core/rueckmeldung/zustand";
import { click, exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DAS SICHTBARE VERSPRECHEN DES KNOPFES: er steht genau einmal da, und danach
 * nie wieder. `zustand.test.ts` prüft den Speicher darunter; hier steht, dass
 * der Knopf ihn auch wirklich liest und schreibt.
 *
 * ⚠️ WAS JSDOM HIER NICHT KANN, und das ist eine Aussage, keine Ausrede: die
 * LAGE des Knopfes (`position: fixed`, unten rechts, über dem Inhalt) und die
 * Druckregel rechnet jsdom nicht — es wertet weder Media Queries noch
 * Layoutboxen aus. Beides hält deshalb `einbindung.test.ts` als
 * Quelltext-Zusicherung fest, und nur ein echter Browser kennt die Zahlen
 * (dieselbe Klasse wie die Fallen 8 und 18 in `CLAUDE.md`).
 */
const URL_ = "https://forms.example.test/f/abc";

afterEach(async () => {
  await unmount();
  vergissRueckmeldungStand();
  localStorage.clear();
});

describe("RueckmeldungKnopf", () => {
  it("steht da, solange niemand ihn erledigt hat", async () => {
    await mount(<RueckmeldungKnopf url={URL_} />);
    const link = query<HTMLAnchorElement>('[data-testid="rueckmeldung-knopf"]');
    expect(link.getAttribute("href")).toBe(URL_);
    /*
     * ⚠️ `rel` UND `target` ZUSAMMEN: das Formular liegt bei einem fremden
     * Anbieter, und ohne `noopener` bekäme dessen Seite über `window.opener`
     * einen Griff auf das Fenster der Suite. Ein Umbau, der nur `target` stehen
     * lässt, wäre still.
     */
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("verschwindet, sobald jemand ihn benutzt", async () => {
    await mount(<RueckmeldungKnopf url={URL_} />);
    await click('[data-testid="rueckmeldung-knopf"]');
    expect(exists('[data-testid="rueckmeldung-schweber"]')).toBe(false);
  });

  /**
   * ⚠️ DAS SCHLIESSKREUZ IST DIE ZWEITE HÄLFTE DES VERSPRECHENS. Ohne es hätte
   * nur den Knopf los, wer das Formular öffnet — wer gar nichts sagen wollte,
   * müsste erst so tun als ob.
   */
  it("verschwindet auch, wenn jemand ihn wegklickt", async () => {
    await mount(<RueckmeldungKnopf url={URL_} />);
    await click('[data-testid="rueckmeldung-ausblenden"]');
    expect(exists('[data-testid="rueckmeldung-schweber"]')).toBe(false);
  });

  it("kommt nach einem Seitenwechsel nicht wieder", async () => {
    await mount(<RueckmeldungKnopf url={URL_} />);
    await click('[data-testid="rueckmeldung-ausblenden"]');
    await unmount();
    // Der Prozesszustand geht mit einem harten Seitenwechsel verloren; der
    // Eintrag in `localStorage` nicht. Genau das ist der Unterschied zwischen
    // „für diesen Aufruf weg" und „weg".
    vergissRueckmeldungStand();
    await mount(<RueckmeldungKnopf url={URL_} />);
    expect(exists('[data-testid="rueckmeldung-schweber"]')).toBe(false);
  });

  /**
   * ⚠️ DER AUSBLENDEN-KNOPF TRÄGT NUR EIN ZEICHEN, und ein Zeichen liest sich
   * nicht vor. Ohne `aria-label` stünde er in der Bedienelementliste einer
   * Vorleseanwendung als namenloser Knopf neben dem Feedback-Link — also als
   * das, was man am wenigsten treffen will.
   */
  it("gibt dem Ausblenden-Knopf einen Namen", async () => {
    await mount(<RueckmeldungKnopf url={URL_} />);
    const zu = query('[data-testid="rueckmeldung-ausblenden"]');
    expect(zu.getAttribute("aria-label")).toBe("Feedback-Knopf ausblenden");
  });
});
