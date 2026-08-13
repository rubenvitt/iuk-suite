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
