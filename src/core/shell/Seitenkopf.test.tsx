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
    // `query()` wirft bereits, wenn das Element fehlt (`test-dom.tsx`) — ein
    // zusaetzliches `.not.toBeNull()` danach koennte strukturell nie fallen
    // und stand hier als tote Zusicherung (Review-Befund, Aufgabe 7 Runde 2).
    const beschreibung = query('[data-testid="seitenkopf-beschreibung"]');
    expect(beschreibung.textContent).toBe("Sichtbar, sobald übergeben.");
    const aktionen = query('[data-testid="seitenkopf-aktionen"]');
    expect(aktionen.textContent).toBe("Anlegen");
  });

  it("trägt keine tabellarische Ziffernstellung — eine Überschrift vergleicht nichts", async () => {
    /*
     * `core/theme/schrift.ts` setzt `fontVariantNumeric: "tabular-nums
     * lining-nums"` auf jeder Rolle, weil dieselben Rollen auch Tabellenzellen
     * und KPI-Werte bedienen. Der Seitenkopf ist keins von beidem — die
     * Eigenschaft muss an ALLEN DREI Stellen draußen bleiben (Titel,
     * Beschreibung, Rückweg-Link — alle drei benutzen `ohneZiffernstellung`),
     * sonst setzt eine spätere Aufräumrunde die Rolle an genau einer Stelle
     * wieder pur ein, ohne dass ein Test es merkt. Deshalb hier mit `zurueck`
     * mounten und alle drei Knoten in einer Schleife prüfen, statt den
     * Rückweg-Link separat und ungetestet zu lassen.
     */
    await mount(
      <Seitenkopf
        titel="Artikel"
        beschreibung="Text"
        zurueck={{ titel: "Zurück", href: "/verwaltung" }}
      />,
    );
    const knoten = [
      query("h1"),
      query('[data-testid="seitenkopf-beschreibung"]'),
      query('[data-testid="seitenkopf-zurueck"]'),
    ];
    for (const el of knoten) {
      expect(el.getAttribute("style")).not.toMatch(/font-variant-numeric/);
    }
  });

  it("trägt einen Rückweg, wenn einer übergeben wird", async () => {
    /*
     * „Führt jede Seite zurück, oder ist sie eine Sackgasse?" steht als
     * Prüf­frage in `docs/design/README.md` und hatte bis 2026-08-13 keinen
     * gemeinsamen Träger — jede Detailseite löste es selbst oder gar nicht.
     */
    await mount(<Seitenkopf titel="Kompressen" zurueck={{ titel: "Artikel", href: "/verwaltung/artikel" }} />);
    // `query()` wirft bereits, wenn das Element fehlt — kein `.not.toBeNull()`
    // davor (dieselbe tote Bauform wie oben, im selben Zug bereinigt).
    const link = query('[data-testid="seitenkopf-zurueck"]') as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/verwaltung/artikel");
    expect(link.textContent).toContain("Artikel");
  });

  it("fasst den Rückweg in ein benanntes Landmark, nicht in einen nackten Link", async () => {
    /*
     * Nachtrag aus dem Review zu Aufgabe 9: die Vorlage `Brotkrume.tsx` fasst
     * denselben Link in `<nav aria-label="Brotkrume">`. Ohne eigenes Landmark
     * hier verlieren alle Seiten, die auf `zurueck` umstellen, das Sprungziel
     * fuer Screenreader-Bedienung. Der Name ist bewusst nicht "Brotkrume" —
     * beide Fassungen rendern genau einen Link, keine mehrstufige Brotkrume.
     */
    await mount(<Seitenkopf titel="Kompressen" zurueck={{ titel: "Artikel", href: "/verwaltung/artikel" }} />);
    const landmark = query('nav[aria-label="Zurück"]');
    const link = query('[data-testid="seitenkopf-zurueck"]');
    expect(landmark.contains(link)).toBe(true);
  });

  it("versteckt das Pfeilzeichen vor Screenreadern, der Linktext bleibt der einzige Wortlaut", async () => {
    /*
     * `‹` ist ein Textzeichen, kein Icon wie bei `Brotkrume` (dessen `Ikone`
     * bereits `aria-hidden` traegt). Ohne eigenes `aria-hidden` wuerde ein
     * Screenreader das Zeichen mitlesen, bevor er den eigentlichen Linktext
     * ausspricht.
     */
    await mount(<Seitenkopf titel="Kompressen" zurueck={{ titel: "Artikel", href: "/verwaltung/artikel" }} />);
    const link = query('[data-testid="seitenkopf-zurueck"]');
    const glyph = link.querySelector("span");
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.textContent).toContain("‹");
  });
});
