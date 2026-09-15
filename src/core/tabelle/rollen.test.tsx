// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { RollenAnbieter, mitRollen, mitZeilenindex } from "./rollen";

/**
 * ⚠️ WAS DIESER TEST NICHT KANN, UND WARUM ER TROTZDEM ETWAS WERT IST.
 *
 * Er kann die virtualisierte Tabelle nicht prüfen. Eine solche rendert in jsdom
 * ÜBERHAUPT KEINE ZEILE — rc-virtual-list kommt ohne Layoutboxen auf null
 * sichtbare Einträge (CLAUDE.md, Falle 14) —, und ein `mount()` einer
 * `Datentabelle` mit `virtuell` wäre deshalb lautlos blind: er risse nicht, er
 * misste nur nichts. Die Wirkung im echten Baum bezeugt allein
 * `e2e/lagerbuch-artikel-rollen.spec.ts`.
 *
 * Prüfbar ist hier die andere Hälfte, und die ist genau die, die ein Browser
 * NICHT zeigt: die ENTSCHEIDUNG, ob die Rollen überhaupt eingehängt werden. Ein
 * Rollen-`div` an einer gewöhnlichen Tabelle zerstörte sie (statt `tbody`/`tr`/
 * `td` stünden dort Kästen); dass das nicht passiert, lässt sich nur vor dem
 * Rendern zeigen, als Funktion von Absicht auf `components`.
 */

afterEach(async () => {
  await unmount();
});

describe("mitRollen", () => {
  it("haengt OHNE Virtualisierung nichts ein", () => {
    expect(mitRollen(undefined, false)).toBeUndefined();
    const eigene = { body: { row: "tr" as unknown as never } };
    expect(mitRollen(eigene, false)).toBe(eigene);
  });

  it("belegt mit Virtualisierung genau die drei Steckplaetze des Koerpers", () => {
    const bauteile = mitRollen(undefined, true);
    expect(Object.keys(bauteile?.body ?? {}).sort()).toEqual(["cell", "row", "wrapper"]);
    expect(bauteile?.header).toBeUndefined();
  });

  it("laesst die Kopfzeilen-Bauteile des Aufrufers unberuehrt", () => {
    const kopf = { cell: "th" as unknown as never };
    expect(mitRollen({ header: kopf }, true)?.header).toBe(kopf);
  });

  it("haelt sich aus einem `body` als Funktion heraus", () => {
    // rc-tables eigener Ausweg („render props") kennt die drei Steckplaetze
    // gar nicht — wer ihn nimmt, baut den Koerper selbst.
    const eigene = { body: (() => null) as unknown as never };
    expect(mitRollen(eigene, true)).toBe(eigene);
  });

  it("liefert bei gleichen Eingaben denselben Komponententyp", () => {
    // ⚠️ DIE AUSSAGE, DIE DIE TABELLE VOR EINEM NEUAUFBAU SCHUETZT: waeren die
    // Komponenten je Aufruf neu, saehe React einen ANDEREN Typ und baute den
    // Tabellenkoerper ab und neu auf — Scrollstand weg, und zwar bei jedem
    // Tastendruck in der Suche darueber.
    const a = mitRollen(undefined, true)?.body;
    const b = mitRollen(undefined, true)?.body;
    expect(a).not.toBe(b);
    const alsObjekt = (w: unknown) => w as Record<string, unknown>;
    expect(alsObjekt(a).row).toBe(alsObjekt(b).row);
    expect(alsObjekt(a).cell).toBe(alsObjekt(b).cell);
    expect(alsObjekt(a).wrapper).toBe(alsObjekt(b).wrapper);
  });
});

describe("mitZeilenindex", () => {
  it("reicht OHNE Virtualisierung das eigene `onRow` unveraendert durch", () => {
    const eigenes = () => ({ className: "x" });
    expect(mitZeilenindex(eigenes, false)).toBe(eigenes);
    expect(mitZeilenindex(undefined, false)).toBeUndefined();
  });

  it("zaehlt ab 1 und nimmt den ABSOLUTEN Index", () => {
    const gebaut = mitZeilenindex(undefined, true);
    expect(gebaut?.({}, 0)["aria-rowindex"]).toBe(1);
    // Zeile 412 der Liste — nicht die vierte im Sichtfenster.
    expect(gebaut?.({}, 411)["aria-rowindex"]).toBe(412);
  });

  it("ergaenzt das eigene `onRow`, statt es zu ersetzen", () => {
    const eigenes = () => ({ className: "geklickt", onClick: () => {} });
    const gebaut = mitZeilenindex(eigenes, true)?.({}, 7);
    expect(gebaut?.className).toBe("geklickt");
    expect(typeof gebaut?.onClick).toBe("function");
    expect(gebaut?.["aria-rowindex"]).toBe(8);
  });
});

describe("die Rollen-Bauteile selbst", () => {
  /** Holt die drei Komponenten so heraus, wie rc-table sie ueber `getComponent` faende. */
  function bauteile() {
    const body = mitRollen(undefined, true)?.body as unknown as Record<
      string,
      React.ComponentType<Record<string, unknown>>
    >;
    return { Koerper: body.wrapper, Zeile: body.row, Zelle: body.cell };
  }

  it("traegt Rolle, Name und Gesamtzahl am Koerper", async () => {
    const { Koerper, Zeile, Zelle } = bauteile();
    await mount(
      <RollenAnbieter value={{ beschriftung: "Artikel und Bestand", zeilen: 812 }}>
        <Koerper className="halter">
          <Zeile data-row-key="a" aria-rowindex={1}>
            <Zelle>Mullbinde</Zelle>
          </Zeile>
        </Koerper>
      </RollenAnbieter>,
    );

    const koerper = query('[role="table"]');
    expect(koerper.getAttribute("aria-label")).toBe("Artikel und Bestand");
    // ⚠️ Die Zahl der LISTE, nicht die der Knoten im Baum — genau der
    // Unterschied, den Virtualisierung erzeugt.
    expect(koerper.getAttribute("aria-rowcount")).toBe("812");
    // Die Klasse von rc-virtual-list darf die Rolle nicht verdraengen.
    expect(koerper.className).toBe("halter");
    expect(queryAll('[role="row"]')).toHaveLength(1);
    expect(query('[role="row"]').getAttribute("data-row-key")).toBe("a");
    expect(query('[role="cell"]').textContent).toBe("Mullbinde");
  });

  it("laesst `aria-label` weg, wenn die Tabelle keinen Namen traegt", async () => {
    const { Koerper } = bauteile();
    await mount(
      <RollenAnbieter value={{ zeilen: 3 }}>
        <Koerper />
      </RollenAnbieter>,
    );
    expect(query('[role="table"]').hasAttribute("aria-label")).toBe(false);
  });
});
