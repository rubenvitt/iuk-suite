// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";
import { Zellentext } from "./Zellentext";

/**
 * ⚠️ WAS DIESER TEST NICHT KANN, UND WARUM ER TROTZDEM ETWAS WERT IST.
 *
 * Er kann die WIRKUNG nicht messen. jsdom rechnet keine Layoutboxen
 * (`getBoundingClientRect()` liefert überall Nullen) und wertet weder `ch` noch
 * `-webkit-line-clamp` aus — ob eine Spalte nach dem Deckel schmaler ist, weiß
 * nur ein echter Browser (CLAUDE.md, Fallen 13 und 14). Das bezeugt
 * `e2e/lagerbuch-zellentext.spec.ts`.
 *
 * Prüfbar ist hier die andere Hälfte, und sie ist die, die beim nächsten Umbau
 * still kippen würde: WAS die Komponente in den Baum schreibt — dass der volle
 * Text immer im DOM steht (der Nachweis darf nicht verschwinden), dass `title`
 * nur bei einer Höhendeckelung dazukommt, und dass die Zeilenzahl als
 * Custom-Property ankommt statt als fester Klassenname.
 */

afterEach(async () => {
  await unmount();
});

const LANG = "Teststreifen abgelaufen, Ersatz bestellt, Ruecklauf steht aus.";

describe("Zellentext", () => {
  it("schreibt den vollen Text in den Baum und setzt OHNE `zeilen` keinen `title`", async () => {
    await mount(<Zellentext text={LANG} />);
    const knoten = query("[data-zellentext]");
    expect(knoten.textContent).toBe(LANG);
    // Ohne Kuerzung steht der Satz ohnehin da; ein `title` waere fuer eine
    // Vorleseanwendung eine zweite Stimme auf denselben Text.
    expect(knoten.getAttribute("title")).toBeNull();
    expect(knoten.hasAttribute("data-gekuerzt")).toBe(false);
  });

  it("legt mit `zeilen` die Kuerzung an — und den vollen Text in den `title`", async () => {
    await mount(<Zellentext text={LANG} zeilen={3} />);
    const knoten = query<HTMLSpanElement>("[data-zellentext]");
    // ⚠️ DER TEXT BLEIBT VOLLSTAENDIG. `overflow: hidden` schneidet fuer das
    // Auge ab, nicht im Baum — waere hier gekuerzt, ginge der Nachweis
    // verloren, und kein Tor faende es.
    expect(knoten.textContent).toBe(LANG);
    expect(knoten.getAttribute("title")).toBe(LANG);
    expect(knoten.hasAttribute("data-gekuerzt")).toBe(true);
    // Die Zahl reist als Custom-Property, nicht als eigene Klasse je Wert.
    expect(knoten.style.getPropertyValue("--zellentext-zeilen")).toBe("3");
  });

  it("laesst einen eigenen `title` und fremde Attribute durch", async () => {
    await mount(
      <Zellentext text={LANG} zeilen={2} title="seit 14 Tagen" data-spalte="hinweis" />,
    );
    const knoten = query("[data-zellentext]");
    expect(knoten.getAttribute("title")).toBe("seit 14 Tagen");
    expect(knoten.getAttribute("data-spalte")).toBe("hinweis");
  });
});
