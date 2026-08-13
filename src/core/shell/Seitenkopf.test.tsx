// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

afterEach(unmount);

describe("Seitenkopf", () => {
  it("setzt den Titel als einziges h1", async () => {
    await mount(<Seitenkopf titel="Artikel" />);
    const ueberschriften = document.querySelectorAll("h1");
    expect(ueberschriften).toHaveLength(1);
    expect(ueberschriften[0].textContent).toBe("Artikel");
  });

  it("lässt Beschreibung und Aktionen weg, wenn keine da sind", async () => {
    await mount(<Seitenkopf titel="Artikel" />);
    expect(exists('[data-testid="seitenkopf-beschreibung"]')).toBe(false);
    expect(exists('[data-testid="seitenkopf-aktionen"]')).toBe(false);
  });

  it("zeigt Beschreibung und Aktionen, wenn sie da sind", async () => {
    /*
     * Gegenprobe zum vorigen Test: der bloße Verzicht auf Assertion-Fehler bei
     * Abwesenheit beweist nicht, dass die Haken bei Anwesenheit tatsächlich
     * erscheinen — ein vertippter oder umbenannter `data-testid` fiele sonst
     * nirgends auf. Aufgaben 8-13 hängen an genau diesen beiden Haken.
     */
    await mount(
      <Seitenkopf
        titel="Artikel"
        beschreibung="Sichtbar, sobald übergeben."
        aktionen={<button type="button">Anlegen</button>}
      />,
    );
    const beschreibung = query('[data-testid="seitenkopf-beschreibung"]');
    expect(beschreibung).not.toBeNull();
    expect(beschreibung.textContent).toBe("Sichtbar, sobald übergeben.");
    const aktionen = query('[data-testid="seitenkopf-aktionen"]');
    expect(aktionen).not.toBeNull();
    expect(aktionen.textContent).toBe("Anlegen");
  });

  it("trägt keine tabellarische Ziffernstellung — eine Überschrift vergleicht nichts", async () => {
    /*
     * `core/theme/schrift.ts` setzt `fontVariantNumeric: "tabular-nums
     * lining-nums"` auf jeder Rolle, weil dieselben Rollen auch Tabellenzellen
     * und KPI-Werte bedienen. Der Seitenkopf ist keins von beidem — die
     * Eigenschaft muss draußen bleiben, sonst setzt eine spätere Aufräumrunde
     * die Rolle wieder pur ein, ohne dass ein Test es merkt.
     */
    await mount(<Seitenkopf titel="Artikel" beschreibung="Text" />);
    expect(query("h1").getAttribute("style")).not.toMatch(/font-variant-numeric/);
    expect(query('[data-testid="seitenkopf-beschreibung"]').getAttribute("style")).not.toMatch(
      /font-variant-numeric/,
    );
  });

  it("trägt einen Rückweg, wenn einer übergeben wird", async () => {
    /*
     * „Führt jede Seite zurück, oder ist sie eine Sackgasse?" steht als
     * Prüf­frage in `docs/design/README.md` und hatte bis 2026-08-13 keinen
     * gemeinsamen Träger — jede Detailseite löste es selbst oder gar nicht.
     */
    await mount(<Seitenkopf titel="Kompressen" zurueck={{ titel: "Artikel", href: "/verwaltung/artikel" }} />);
    const link = query('[data-testid="seitenkopf-zurueck"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/verwaltung/artikel");
    expect(link.textContent).toContain("Artikel");
  });
});
