// @vitest-environment jsdom
/**
 * IDA-245 — JEDES AUSWAHLKREUZCHEN DER `Datentabelle` TRÄGT DIE TREFFERFLÄCHE,
 * in der Zeile UND im Spaltenkopf („Alle auswählen"). Die Größe selbst misst
 * jsdom nicht (kein Layout); geprüft wird, dass die Klasse am LABEL hängt — dem
 * Element, das den Klick annimmt. Die Fläche misst Playwright
 * (`e2e/lagerbuch-sammelaktionen.spec.ts`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableProps } from "antd";
import { mount, unmount, query, queryAll, clickElement } from "@/app/m/qr/_lib/test-dom";
import { Datentabelle } from "./Datentabelle";
import { AUSWAHL_SPALTENBREITE, mitGrossenKreuzchen } from "./auswahl";
import stil from "./auswahl.module.css";

type Zeile = { id: string; name: string };

const ZEILEN: Zeile[] = [
  { id: "a", name: "Mullbinde" },
  { id: "b", name: "Beatmungsbeutel" },
];
const SPALTEN: NonNullable<TableProps<Zeile>["columns"]> = [
  { title: "Artikel", dataIndex: "name", width: 200 },
];

afterEach(async () => {
  await unmount();
});

describe("Auswahlkreuzchen der Datentabelle", () => {
  it("vergrößert das Label jeder Zeile und das im Spaltenkopf", async () => {
    await mount(
      <Datentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        rowSelection={{ selectedRowKeys: [] }}
      />,
    );
    const labels = queryAll("tr[data-row-key] label");
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label.classList.contains(stil.kreuz)).toBe(true);
    const kopf = query("thead label");
    expect(kopf.classList.contains(stil.kreuz)).toBe(true);
  });

  it("lässt „Alle auswählen“ weiter alle auswählen", async () => {
    const gewaehlt = vi.fn();
    await mount(
      <Datentabelle<Zeile>
        aria-label="Artikel"
        rowKey="id"
        dataSource={ZEILEN}
        columns={SPALTEN}
        rowSelection={{ selectedRowKeys: [], onChange: gewaehlt }}
      />,
    );
    await clickElement(query("thead input[type=\"checkbox\"]"));
    expect(gewaehlt.mock.calls[0]?.[0]).toEqual(["a", "b"]);
  });

  it("reicht einem eigenen `renderCell` das große Kreuzchen", () => {
    const eigene = vi.fn((_g: boolean, _z: Zeile, _i: number, kreuz: React.ReactNode) => kreuz);
    const auswahl = mitGrossenKreuzchen<Zeile>({ renderCell: eigene });
    const kreuz = <label className="antd" />;
    const ergebnis = auswahl?.renderCell?.(false, ZEILEN[0], 0, kreuz) as React.ReactElement<{ className: string }>;
    expect(eigene).toHaveBeenCalledOnce();
    expect(ergebnis.props.className).toBe(`antd ${stil.kreuz}`);
  });

  it("lässt einen eigenen Kopf, `hideSelectAll` und die Spaltenbreite des Aufrufers stehen", () => {
    expect(mitGrossenKreuzchen<Zeile>({ hideSelectAll: true })?.columnTitle).toBeUndefined();
    expect(mitGrossenKreuzchen<Zeile>({ columnTitle: "Wahl" })?.columnTitle).toBe("Wahl");
    expect(mitGrossenKreuzchen<Zeile>({ type: "radio" })?.columnTitle).toBeUndefined();
    expect(mitGrossenKreuzchen<Zeile>({ columnWidth: 80 })?.columnWidth).toBe(80);
    expect(mitGrossenKreuzchen<Zeile>({})?.columnWidth).toBe(AUSWAHL_SPALTENBREITE);
    expect(mitGrossenKreuzchen<Zeile>(undefined)).toBeUndefined();
  });

  it("hat Platz für 44 px und antds Zellenrand von je 8 px", () => {
    expect(AUSWAHL_SPALTENBREITE).toBeGreaterThanOrEqual(44 + 2 * 8);
  });
});
