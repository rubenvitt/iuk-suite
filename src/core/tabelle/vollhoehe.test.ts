import { describe, expect, it } from "vitest";
import { vollhoehe } from "./vollhoehe";

/**
 * Dieser Test besitzt die Aussage, die KEIN anderes Tor treffen kann.
 *
 * Die Wirkung selbst ist für Vitest strukturell unsichtbar: jsdom rechnet keine
 * Layoutboxen (Falle 13/14), eine virtuelle Tabelle rendert dort überhaupt
 * keine Zeile, und ob zwei Scrollbalken ineinanderstehen, weiß nur ein echter
 * Browser (`e2e/lagerbuch-artikel-mobil.spec.ts`). Prüfbar ist deshalb genau
 * das, was VOR dem Layout entschieden wird: die Rechnung.
 */

/** Ein Telefon (390×844), Rahmen direkt unter der Kopfzeile. */
const TELEFON = {
  fensterHoehe: 844,
  rahmenOben: 85,
  tabelleOben: 205,
  tabellenkopfHoehe: 47,
  rand: 24,
  mindestens: 360,
};

describe("vollhoehe", () => {
  it("laesst den Rahmen genau bis zum unteren Fensterrand reichen", () => {
    // 844 − 85 − 24. Mehr waere ein Dokument mit Scrollweg, weniger weisse Luft.
    expect(vollhoehe(TELEFON).rahmenHoehe).toBe(735);
  });

  it("ZIEHT DEN TABELLENKOPF AB — der Fehler, um den es geht", () => {
    // `virtuell` setzt `scroll.y`, und das ist die Hoehe des KOERPERS. Ohne den
    // Abzug waere die Tabelle um genau eine Kopfzeile hoeher als ihr Platz:
    // 844 − 205 − 24 = 615 statt 568. Diese 47px sind der Scrollweg, den das
    // Dokument bekam — genug fuer zwei Scrollbalken, zu wenig zum Auffallen.
    expect(vollhoehe(TELEFON).koerperHoehe).toBe(568);
  });

  it("haelt Rahmen und Tabelle deckungsgleich", () => {
    // Die Probe auf die ganze Rechnung: was der Rahmen hoch ist, muessen
    // Kopfbereich + Tabellenkopf + Koerper zusammen ergeben. Klafft das
    // auseinander, schneidet `overflow: hidden` Zeilen ab oder das Dokument
    // scrollt wieder — beides still.
    const { rahmenHoehe, koerperHoehe } = vollhoehe(TELEFON);
    const kopfbereich = TELEFON.tabelleOben - TELEFON.rahmenOben;
    expect(kopfbereich + TELEFON.tabellenkopfHoehe + koerperHoehe).toBe(rahmenHoehe);
  });

  it("deckelt NICHT, solange der Platz reicht", () => {
    expect(vollhoehe(TELEFON).gedeckelt).toBe(false);
  });

  it("gibt die Deckelung auf, wenn die Werkzeugleiste den Platz frisst", () => {
    // Die Notbremse: umgebrochene Knoepfe, Sammelleiste und ein Hinweis
    // schieben die Tabelle nach unten. Lieber eine scrollende Seite als ein
    // Knopf, den `overflow: hidden` unerreichbar macht.
    const eng = vollhoehe({ ...TELEFON, tabelleOben: 500 });
    expect(eng.gedeckelt).toBe(true);
    expect(eng.koerperHoehe).toBe(360);
  });

  it("rundet nach unten, nicht kaufmaennisch", () => {
    // Ein halbes Pixel zu viel IST ein Scrollweg; ein halbes zu wenig sieht
    // niemand. Bei einem Fenster mit gebrochener Hoehe (Zoomstufe, Lupe)
    // entscheidet genau das.
    const krumm = vollhoehe({ ...TELEFON, fensterHoehe: 844.9 });
    expect(krumm.rahmenHoehe).toBe(735);
    expect(krumm.koerperHoehe).toBe(568);
  });

  it("laesst den Rahmen nie negativ werden", () => {
    // Vor der ersten Messung und auf einem sehr niedrigen Schirm koennte die
    // Differenz unter null fallen. `block-size: -12px` ist ungueltig und faellt
    // still auf `auto` zurueck — dann gaebe es die Deckelung gar nicht.
    expect(vollhoehe({ ...TELEFON, fensterHoehe: 40 }).rahmenHoehe).toBe(0);
  });
});
