// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";
import { RollenAnbieter, mitRollen, mitZeilenindex } from "./rollen";
import { Datentabelle } from "./Datentabelle";

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
  const koerperVon = (einbau: { bauteile?: unknown }) =>
    (einbau.bauteile as { body?: Record<string, unknown> } | undefined)?.body;

  it("haengt OHNE Virtualisierung nichts ein", () => {
    expect(mitRollen(undefined, false)).toEqual({ bauteile: undefined, gesetzt: false });
    const eigene = { body: { row: "tr" as unknown as never } };
    expect(mitRollen(eigene, false).bauteile).toBe(eigene);
  });

  it("belegt mit Virtualisierung genau die drei Steckplaetze des Koerpers", () => {
    const einbau = mitRollen(undefined, true);
    expect(einbau.gesetzt).toBe(true);
    expect(Object.keys(koerperVon(einbau) ?? {}).sort()).toEqual(["cell", "row", "wrapper"]);
    expect((einbau.bauteile as { header?: unknown } | undefined)?.header).toBeUndefined();
  });

  it("laesst die Kopfzeilen-Bauteile des Aufrufers unberuehrt", () => {
    const kopf = { cell: "th" as unknown as never };
    expect((mitRollen({ header: kopf }, true).bauteile as { header?: unknown }).header).toBe(kopf);
  });

  it("haelt sich aus einem `body` als Funktion heraus UND sagt es", () => {
    // rc-tables eigener Ausweg („render props") kennt die drei Steckplaetze
    // gar nicht — wer ihn nimmt, baut den Koerper selbst. `gesetzt: false` ist
    // hier die tragende Aussage: an ihr haengt, dass die Beschriftung bleibt,
    // wo antd sie hinhaengt, statt ersatzlos zu verschwinden.
    const eigene = { body: (() => null) as unknown as never };
    expect(mitRollen(eigene, true)).toEqual({ bauteile: eigene, gesetzt: false });
  });

  it("liefert bei gleichen Eingaben denselben Komponententyp", () => {
    // ⚠️ DIE AUSSAGE, DIE DIE TABELLE VOR EINEM NEUAUFBAU SCHUETZT: waeren die
    // Komponenten je Aufruf neu, saehe React einen ANDEREN Typ und baute den
    // Tabellenkoerper ab und neu auf — Scrollstand weg, und zwar bei jedem
    // Tastendruck in der Suche darueber.
    const a = koerperVon(mitRollen(undefined, true));
    const b = koerperVon(mitRollen(undefined, true));
    expect(a).not.toBe(b);
    expect(a?.row).toBe(b?.row);
    expect(a?.cell).toBe(b?.cell);
    expect(a?.wrapper).toBe(b?.wrapper);
  });

  it("UMHUELLT ein eigenes Bauteil, statt es zu verwerfen", async () => {
    // ⚠️ DER FALL, DER FRUEHER STILL AUSFIEL: wer `components.body.cell` setzt,
    // tut das fuer sein eigenes Rendern — und verloere es erst ab 150 Zeilen,
    // also lange nach dem Zeitpunkt, an dem er es geprueft hat.
    const EigeneZelle = (props: Record<string, unknown>) => (
      <div {...props} data-eigen="ja" />
    );
    const koerper = koerperVon(mitRollen({ body: { cell: EigeneZelle } }, true));
    expect(koerper?.cell).not.toBe(EigeneZelle);

    const Zelle = koerper?.cell as React.ComponentType<Record<string, unknown>>;
    await mount(<Zelle className="eigen">Wert</Zelle>);
    const gerendert = query('[role="cell"]');
    expect(gerendert.getAttribute("data-eigen")).toBe("ja");
    expect(gerendert.className).toBe("eigen");
    expect(gerendert.textContent).toBe("Wert");
  });

  it("merkt die Huelle am BAUTEIL, nicht am components-Objekt", async () => {
    // ⚠️ DER NORMALFALL IST EIN LITERAL IM JSX: `components={{ body: { cell:
    // Zelle } }}` ist bei jedem Render ein ANDERES Objekt. Waere die Huelle
    // daran gemerkt, entstuende je Render ein neuer Komponententyp — React
    // baute Halter, Zeilen und Zellen ab und neu auf, und Scrollstand wie
    // Eingabefokus waeren bei jedem unbeteiligten Render der Elternkomponente
    // weg.
    const EigeneZelle = (props: Record<string, unknown>) => <div {...props} />;
    const a = koerperVon(mitRollen({ body: { cell: EigeneZelle } }, true));
    const b = koerperVon(mitRollen({ body: { cell: EigeneZelle } }, true));
    expect(a).not.toBe(b);
    expect(a?.cell).toBe(b?.cell);

    // Ein anderes Bauteil bekommt eine andere Huelle — sonst traege die eine
    // Zelle das Rendern der anderen.
    const AndereZelle = (props: Record<string, unknown>) => <div {...props} />;
    expect(koerperVon(mitRollen({ body: { cell: AndereZelle } }, true))?.cell)
      .not.toBe(a?.cell);
  });

  it("umhuellt auch einen ELEMENTNAMEN — antd laesst beides zu", async () => {
    const koerper = koerperVon(mitRollen({ body: { row: "section" } }, true));
    const Zeile2 = koerper?.row as React.ComponentType<Record<string, unknown>>;
    await mount(<Zeile2 data-row-key="x" />);
    expect(query('[role="row"]').tagName).toBe("SECTION");
  });
});

describe("mitZeilenindex", () => {
  it("reicht OHNE eingehaengte Rollen das eigene `onRow` unveraendert durch", () => {
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
    const body = (mitRollen(undefined, true).bauteile as {
      body: Record<string, React.ComponentType<Record<string, unknown>>>;
    }).body;
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

/**
 * DIE ZAHL AN DER ECHTEN TABELLE — und damit die Naht, an der die Rechnung aus
 * `angezeigt.ts` und die Rolle aus `rollen.tsx` zusammenkommen.
 *
 * ⚠️ WARUM DAS HIER GEHT, OBWOHL FALLE 14 DAS GEGENTEIL SAGT: zeilenlos ist in
 * jsdom der KÖRPER, nicht der HALTER. rc-virtual-list legt seinen
 * Scrollcontainer immer an — und genau der trägt die Rolle und die Zahl. Die
 * Zeilen darin fehlen weiterhin, sobald die Liste lang ist; der zweite Fall
 * unten hält beides nebeneinander fest, damit niemand aus dem ersten
 * schließt, jsdom könne virtuelle Zeilen sehen.
 */
describe("aria-rowcount an der Datentabelle", () => {
  type Zeile = { id: string; aktiv: boolean };
  const zeilen: Zeile[] = Array.from(
    { length: 200 },
    (_, i) => ({ id: `a${i}`, aktiv: i < 5 }),
  );

  const idSpalte = { title: "Id", dataIndex: "id", key: "id", width: 200 } as const;

  function aktivSpalte(filteredValue?: (string | number | boolean)[] | null) {
    return {
      title: "Aktiv",
      dataIndex: "aktiv",
      key: "aktiv",
      width: 120,
      filters: [{ text: "ja", value: true }],
      ...(filteredValue === undefined ? {} : { filteredValue }),
      onFilter: (wert: React.Key | boolean, zeile: Zeile) => zeile.aktiv === wert,
    };
  }

  it("zaehlt die GANZE Liste, solange kein Spaltenfilter greift", async () => {
    await mount(
      <Datentabelle<Zeile>
        rowKey="id"
        virtuell={400}
        aria-label="Bestand"
        dataSource={zeilen}
        columns={[idSpalte, aktivSpalte(null)]}
      />,
    );
    const halter = query('[role="table"]');
    expect(halter.getAttribute("aria-rowcount")).toBe("200");
    expect(halter.getAttribute("aria-label")).toBe("Bestand");
    // Und hier steht der Grund fuer `aria-rowcount` leibhaftig daneben: im Baum
    // steht nur ein Bruchteil der Liste.
    //
    // ⚠️ WIE GROSZ DIESER BRUCHTEIL IST, WIRD HIER NICHT ZUGESICHERT. Falle 14
    // haelt „gar keine Zeile" fest, gemessen an der Artikeltabelle; dieselbe
    // Messung ergibt hier neun. Die Zahl haengt daran, was rc-virtual-list aus
    // Hoehen errechnet, die jsdom alle mit 0 beantwortet — sie ist ein Artefakt
    // der Umgebung und keine Aussage ueber die Tabelle. Belastbar ist allein
    // das Verhaeltnis.
    expect(queryAll("[data-row-key]").length).toBeLessThan(zeilen.length);
  });

  it("zaehlt NACH dem Spaltenfilter, den antd selbst noch anwendet", async () => {
    // ⚠️ DER FALL, DER DIE ZAHL FRUEHER LUEGEN LIESZ: `dataSource` traegt 200
    // Zeilen, `filteredValue` zieht sie auf 5 zusammen — und antd filtert erst
    // NACH uns. Aus `dataSource.length` gelesen stuende hier 200, waehrend
    // `aria-rowindex` nur bis 5 zaehlt: „Zeile 3 von 200" an einer Tabelle mit
    // fuenf Zeilen.
    await mount(
      <Datentabelle<Zeile>
        rowKey="id"
        virtuell={400}
        aria-label="Bestand"
        dataSource={zeilen}
        columns={[idSpalte, aktivSpalte([true])]}
      />,
    );
    expect(query('[role="table"]').getAttribute("aria-rowcount")).toBe("5");

    // Fuenf Zeilen passen in die Sichtflaeche, also rendert rc-virtual-list sie
    // auch in jsdom — die Gegenprobe zur Zahl steht damit daneben.
    const gerendert = queryAll("[data-row-key]");
    expect(gerendert).toHaveLength(5);
    expect(gerendert.map((z) => z.getAttribute("aria-rowindex")))
      .toEqual(["1", "2", "3", "4", "5"]);
  });

  it("sagt -1, wenn eine Spalte UNGESTEUERT filtert", async () => {
    // Ohne `filteredValue` fuehrt antd den Stand allein; von auszen ist er
    // nicht zu sehen. `-1` ist ARIAs Angabe fuer „unbekannt viele" — eine zu
    // grosze Zahl waere eine Behauptung.
    await mount(
      <Datentabelle<Zeile>
        rowKey="id"
        virtuell={400}
        aria-label="Bestand"
        dataSource={zeilen}
        columns={[idSpalte, aktivSpalte()]}
      />,
    );
    expect(query('[role="table"]').getAttribute("aria-rowcount")).toBe("-1");
  });
});

describe("die Beschriftung, wenn der Aufrufer den Koerper selbst baut", () => {
  type Zeile = { id: string };
  const zeilen: Zeile[] = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}` }));

  it("bleibt am Kopf, statt ersatzlos zu verschwinden", async () => {
    // ⚠️ DER FALL, DEN `gesetzt` ABFAENGT: bei `components.body` als FUNKTION
    // haengt `mitRollen` nichts ein — es gibt also kein Element, das den Namen
    // auffangen koennte. Naehme `Datentabelle` ihn antd trotzdem weg, traege
    // die Tabelle am Ende GAR KEINEN Namen: schlechter als vorher.
    await mount(
      <Datentabelle<Zeile>
        rowKey="id"
        virtuell={400}
        aria-label="Bestand"
        dataSource={zeilen}
        columns={[{ title: "Id", dataIndex: "id", key: "id", width: 200 }]}
        components={{ body: () => <div data-eigener-koerper="ja" /> }}
      />,
    );
    // ⚠️ GEMESSEN, UND NICHT DAS ERWARTETE: der eigene Koerper rendert hier
    // GAR NICHT. rc-table ersetzt `components.body` im virtuellen Zweig durch
    // sein eigenes Raster (`VirtualTable/index.js`: `body: data?.length ?
    // renderBody : undefined`), und `getComponent(['body','wrapper'])` findet
    // auf einer FUNKTION keinen Steckplatz. Die Funktionsform ist virtuell also
    // wirkungslos — was den Ausstieg in `mitRollen` nicht ueberfluessig macht,
    // sondern belegt, wie wenig dort zu holen ist: die Rollen fehlen so oder
    // so, und der Name darf deshalb nicht auch noch verschwinden.
    expect(queryAll('[data-eigener-koerper="ja"]')).toHaveLength(0);
    expect(queryAll('[role="table"]')).toHaveLength(0);
    expect(queryAll('[aria-label="Bestand"]').length).toBeGreaterThan(0);
  });
});

describe("die Beschriftung, wenn kein Filter mehr passt", () => {
  type Zeile = { id: string; aktiv: boolean };
  const zeilen: Zeile[] = Array.from(
    { length: 200 },
    (_, i) => ({ id: `a${i}`, aktiv: false }),
  );

  it("bleibt am Kopf, wenn der Spaltenfilter NICHTS uebrig laesst", async () => {
    // ⚠️ EINGEHAENGT IST NICHT GERENDERT: die Quelle traegt 200 Zeilen, ist also
    // weiter virtualisiert — aber der Filter laesst keine uebrig, und rc-table
    // baut sein virtuelles Raster dann gar nicht erst. Naehme `Datentabelle`
    // antd trotzdem den Namen weg, traege die leere Tabelle GAR KEINEN.
    await mount(
      <Datentabelle<Zeile>
        rowKey="id"
        virtuell={400}
        aria-label="Bestand"
        dataSource={zeilen}
        columns={[
          { title: "Id", dataIndex: "id", key: "id", width: 200 },
          {
            title: "Aktiv", dataIndex: "aktiv", key: "aktiv", width: 120,
            filters: [{ text: "ja", value: true }],
            filteredValue: [true],
            onFilter: (wert: React.Key | boolean, zeile: Zeile) => zeile.aktiv === wert,
          },
        ]}
      />,
    );
    expect(queryAll("[data-row-key]")).toHaveLength(0);
    expect(queryAll('[role="table"]')).toHaveLength(0);
    expect(queryAll('[aria-label="Bestand"]').length).toBeGreaterThan(0);
  });
});
