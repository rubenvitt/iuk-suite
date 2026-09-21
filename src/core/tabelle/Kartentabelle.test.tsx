// @vitest-environment jsdom
/**
 * Was die `Kartentabelle` WIRKLICH in den Baum schreibt (DRK-451).
 *
 * ⚠️ WAS DIESE DATEI NICHT BESITZT, UND ZWAR STRUKTURELL: welche der beiden
 * Darstellungen zu SEHEN ist. jsdom wertet Media Queries nicht aus — ein Test,
 * der hier „auf 390px steht die Karte" behauptet, geht IMMER durch und misst
 * nichts (`docs/design/README.md`, „Tests für Responsives"). Beide
 * Darstellungen stehen hier gleichzeitig im DOM; geprüft wird ihr INHALT und
 * ihr Zusammenhang, nicht ihre Sichtbarkeit. Die gehört Playwright.
 *
 * ⚠️ UND DESHALB GREIFT JEDER SELEKTOR HIER ÜBER `[data-rolle="schmalkarten"]`.
 * Dieselbe Lehre wie in DRK-421: jede Zeile steht zweimal im Baum, und ein
 * Greifer ohne Rahmen findet die Tabellendarstellung genauso.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, type TableProps } from "antd";
import { mount, unmount, query, queryAll, clickElement } from "@/app/m/qr/_lib/test-dom";
import { Kartentabelle } from "./Kartentabelle";
import { nachText } from "./sortierer";

type Zeile = { id: string; name: string; fach: string | null; status: string };

const ZEILEN: Zeile[] = [
  { id: "a", name: "Mullbinde", fach: "3", status: "aktiv" },
  { id: "b", name: "Beatmungsbeutel", fach: null, status: "inaktiv" },
];

const SPALTEN: NonNullable<TableProps<Zeile>["columns"]> = [
  { title: "Artikel", dataIndex: "name", sorter: nachText<Zeile>((z) => z.name) },
  { title: "Fach", dataIndex: "fach" },
  {
    title: "Status",
    dataIndex: "status",
    filters: [{ text: "aktiv", value: "aktiv" }, { text: "inaktiv", value: "inaktiv" }],
    onFilter: (wert, zeile) => zeile.status === wert,
  },
];

const KARTEN = "[data-rolle=\"schmalkarten\"]";

afterEach(async () => {
  await unmount();
});

describe("Kartentabelle", () => {
  it("schreibt je Zeile eine Karte, mit dem Zeilenschlüssel als Griff", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
      />,
    );
    expect(queryAll(`${KARTEN} > li`)).toHaveLength(2);
    expect(query(`${KARTEN} > li[data-row-key="a"]`)).toBeTruthy();
  });

  it("macht den Spaltentitel zur Beschriftung und den Zellinhalt zum Wert", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
      />,
    );
    const erste = query(`${KARTEN} > li[data-row-key="a"]`);
    expect(erste.textContent).toContain("Mullbinde");
    const paare = Array.from(erste.querySelectorAll("dt")).map((dt) => dt.textContent);
    expect(paare).toEqual(["Fach", "Status"]);
    expect(erste.querySelectorAll("dd")[0]?.textContent).toBe("3");
  });

  /*
   * ⚠️ DAS IST DIE ENTSCHEIDUNG AUS `traegtInhalt`, hier am echten Baum: ein
   * leeres Fach steht gar nicht da. Acht Zeilen „—" untereinander wären keine
   * Karte, sondern eine Liste von Nichtigkeiten.
   */
  it("lässt ein leeres Feld weg, statt es als leere Zeile zu zeigen", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
      />,
    );
    const zweite = query(`${KARTEN} > li[data-row-key="b"]`);
    expect(Array.from(zweite.querySelectorAll("dt")).map((dt) => dt.textContent))
      .toEqual(["Status"]);
  });

  /*
   * ⚠️ DER EIGENTLICHE GRUND FÜR DAS GANZE BAUTEIL. Ohne diese Leiste NIMMT
   * eine Umstellung auf Karten dem Telefon den Filter weg, statt ihm etwas zu
   * geben: er sitzt im Spaltenkopf, und den gibt es auf der Karte nicht.
   *
   * `steuerungAbZeilen={0}` schaltet die Schwelle ab — diese Liste hat zwei
   * Zeilen, und geprüft wird hier der INHALT der Leiste, nicht die Schwelle.
   */
  it("bietet für jede filterbare Spalte ein Feld in der Schmalleiste", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        steuerungAbZeilen={0}
      />,
    );
    const leiste = query("[data-rolle=\"schmalsteuerung\"]");
    expect(leiste.querySelector("[aria-label=\"Status filtern\"]")).toBeTruthy();
    expect(leiste.querySelector("[aria-label=\"Sortierung\"]")).toBeTruthy();
  });

  it("zeigt keine Leiste, wenn nichts zu filtern und nichts zu sortieren ist", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={[{ title: "Artikel", dataIndex: "name" }]}
        leer={{ nichts: "Nichts da." }}
        steuerungAbZeilen={0}
      />,
    );
    expect(document.querySelector("[data-rolle=\"schmalsteuerung\"]")).toBeNull();
  });

  /*
   * ⚠️ EINE LISTE, DIE MAN MIT EINEM BLICK ÜBERSCHAUT, BRAUCHT KEINEN FILTER —
   * und auf 390px kostet jedes Auswahlfeld eine volle Zeile über der Liste.
   * Gemessen am `ArtikelDrawer`: dort standen plötzlich Sortierfelder über den
   * zwei Chargen eines Artikels.
   */
  it("hält die Leiste bei einer kurzen Liste zurück", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
      />,
    );
    expect(document.querySelector("[data-rolle=\"schmalsteuerung\"]")).toBeNull();
  });

  /*
   * ⚠️ ABER NICHT, WENN BEREITS GEFILTERT WIRD. Sonst verschwände die Leiste
   * mitsamt dem gesetzten Filter, sobald er die Liste unter die Schwelle zieht —
   * eine kurze Liste, die sich nicht mehr zurücksetzen lässt.
   */
  it("hält die Leiste, solange ein Filter die Liste kurz macht", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        filter={{ status: ["aktiv"] }}
        onFilter={() => {}}
      />,
    );
    const leiste = query("[data-rolle=\"schmalsteuerung\"]");
    // Die Trefferanzeige gehört dazu: auf der Karte fehlt der gefüllte
    // Trichter, an dem man am Schreibtisch sieht, warum die Liste kurz ist.
    expect(leiste.textContent).toContain("1 von 2");
  });

  /*
   * „Nichts angelegt" und „nichts passt" sind verschiedene Auskünfte, und der
   * falsche lädt zum Anlegen eines Datensatzes ein, den es längst gibt.
   */
  it("unterscheidet die zwei leeren Zustände", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={[]}
        columns={SPALTEN}
        leer={{ nichts: "Noch nichts angelegt.", gefiltert: "Nichts passt." }}
      />,
    );
    expect(query("[data-rolle=\"schmalkarten-leer\"]").textContent).toBe("Noch nichts angelegt.");
    await unmount();

    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={[]}
        columns={SPALTEN}
        leer={{ nichts: "Noch nichts angelegt.", gefiltert: "Nichts passt.", aktiv: true }}
      />,
    );
    expect(query("[data-rolle=\"schmalkarten-leer\"]").textContent).toBe("Nichts passt.");
  });

  /*
   * ⚠️ `leer.aktiv` ÜBERSCHREIBT, ES ERGÄNZT NICHT — und dieser Fall ist der
   * Grund. Als ODER geschrieben konnte der Wink den gefilterten Satz nur
   * EINSCHALTEN. Der `uav`-Katalog braucht das Gegenteil: dort bleibt der
   * Spaltenfilter stehen, wenn die letzte Aufgabe darunter GELÖSCHT wird, und
   * „nichts passt zum Filter" behauptete dann einen Bestand, den es nicht mehr
   * gibt — genau vor der Person, die jetzt die erste neue Aufgabe anlegen soll.
   */
  it("lässt `aktiv: false` den gesetzten Spaltenfilter überstimmen", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={[]}
        columns={SPALTEN}
        leer={{ nichts: "Noch nichts angelegt.", gefiltert: "Nichts passt.", aktiv: false }}
        filter={{ status: ["aktiv"] }}
        onFilter={() => {}}
      />,
    );
    expect(query("[data-rolle=\"schmalkarten-leer\"]").textContent)
      .toBe("Noch nichts angelegt.");
  });

  /*
   * ⚠️ EIN ÜBERNOMMENER ZUSTAND MUSS DIE KARTEN MITZIEHEN — sonst zeigen die
   * beiden Darstellungen verschiedene Mengen, und geprüft wäre nur die eine.
   */
  it("filtert die Karten aus dem übernommenen Zustand", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        filter={{ status: ["aktiv"] }}
        onFilter={() => {}}
      />,
    );
    const karten = queryAll(`${KARTEN} > li`);
    expect(karten).toHaveLength(1);
    expect(karten[0]?.getAttribute("data-row-key")).toBe("a");
  });

  it("sortiert die Karten aus dem übernommenen Zustand", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        sortierung={{ spalte: "name", richtung: "ascend" }}
        onSortierung={() => {}}
      />,
    );
    expect(queryAll(`${KARTEN} > li`).map((li) => li.getAttribute("data-row-key")))
      .toEqual(["b", "a"]);
  });

  /*
   * ⚠️ DER TITEL IST DIE TASTATUR-STATION DER KARTE. Eine ganze Fläche mit
   * `role="button"` zu versehen wäre der naheliegende Weg und der falsche —
   * Begründung im Kopf von `Spaltenkarte.tsx`.
   */
  it("macht den Titel zum Knopf, sobald die Zeile klickbar ist", async () => {
    const geoeffnet = vi.fn();
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        onRow={(zeile) => ({ onClick: () => geoeffnet(zeile.id) })}
      />,
    );
    const knopf = query(`${KARTEN} > li[data-row-key="a"] [data-rolle="kartentitel"]`);
    expect(knopf.tagName).toBe("BUTTON");
    await clickElement(knopf);
    expect(geoeffnet).toHaveBeenCalledWith("a");
  });

  it("lässt den Titel ein nackter Text, wenn die Zeile nichts auslöst", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
      />,
    );
    expect(document.querySelector(`${KARTEN} [data-rolle="kartentitel"]`)).toBeNull();
  });

  /*
   * ⚠️ OHNE DIESE WEICHE ÖFFNET JEDES „LÖSCHEN" ZUSÄTZLICH DIE DETAILANSICHT.
   * Ein Klick auf einen Knopf innen blubbert bis zur Karte.
   */
  it("hält einen Klick auf einen Knopf in der Karte von der Zeile fern", async () => {
    const geoeffnet = vi.fn();
    const gedrueckt = vi.fn();
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={[
          ...SPALTEN,
          { title: "Aktionen", key: "akt", render: () => <Button onClick={gedrueckt}>Löschen</Button> },
        ]}
        leer={{ nichts: "Nichts da." }}
        onRow={(zeile) => ({ onClick: () => geoeffnet(zeile.id) })}
      />,
    );
    const loeschen = query(`${KARTEN} > li[data-row-key="a"] button.ant-btn`);
    await clickElement(loeschen);
    expect(gedrueckt).toHaveBeenCalled();
    expect(geoeffnet).not.toHaveBeenCalled();
  });

  it("stellt die Handlungsspalte unten statt in die Merkmalsliste", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={[...SPALTEN, { title: "Aktionen", key: "akt", render: () => "Löschen" }]}
        leer={{ nichts: "Nichts da." }}
      />,
    );
    const erste = query(`${KARTEN} > li[data-row-key="a"]`);
    expect(Array.from(erste.querySelectorAll("dt")).map((dt) => dt.textContent))
      .not.toContain("Aktionen");
    expect(erste.textContent).toContain("Löschen");
  });

  it("nimmt eine fertig gebaute Karte, wenn der Aufrufer eine mitbringt", async () => {
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        karte={(zeile) => <b>{`eigen-${zeile.id}`}</b>}
      />,
    );
    expect(query(`${KARTEN} > li[data-row-key="a"]`).textContent).toBe("eigen-a");
  });

  /*
   * ⚠️ DIE AUSWAHL WIRD FORTGESCHRIEBEN, NICHT ERSETZT. Ein Aufrufer mit
   * `preserveSelectedRowKeys` erwartet, dass ein Kreuzchen auf einer Karte die
   * Auswahl außerhalb des Filters nicht wegwirft.
   */
  it("schreibt die Auswahl aus dem bisherigen Stand fort", async () => {
    const gewaehlt = vi.fn();
    await mount(
      <Kartentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        leer={{ nichts: "Nichts da." }}
        rowSelection={{ selectedRowKeys: ["b"], onChange: gewaehlt }}
      />,
    );
    const kreuz = query(`${KARTEN} > li[data-row-key="a"] input[type="checkbox"]`);
    await clickElement(kreuz);
    expect(gewaehlt.mock.calls[0]?.[0]).toEqual(["b", "a"]);
  });
});
