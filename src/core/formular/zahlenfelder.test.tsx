// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { InputNumber } from "antd";
import { act } from "react";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * ZAHLENFELDER ÖFFNEN AM TELEFON DIE ZIFFERNTASTATUR (IDA-394), OHNE ZUTUN DES MODULS.
 *
 * Erster Teil: die WIRKUNG des Patches an `@rc-component/input-number` (Begründung in
 * `pnpm-workspace.yaml`), gemessen über antds eigenes `InputNumber`. Fällt der Patch bei einem
 * antd-Upgrade weg, wird dieser Teil rot — nicht erst das Telefon in der Hand.
 *
 * Zweiter Teil: ein rohes `<input type="number">` (oder antds `Input` damit) kennt den Patch nicht.
 * Ohne `inputMode` zeigt iOS dort die volle Tastatur in der Zahlenebene; jedes solche Feld trägt
 * deshalb `inputMode` selbst.
 */

afterEach(async () => {
  await unmount();
});

function feld(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>("input[role=spinbutton]");
  if (!el) throw new Error("kein Zahlenfeld gerendert");
  return el;
}

describe("antd-InputNumber mit Suite-Vorgaben", () => {
  it.each([
    ["ganze Zahl (precision 0)", { precision: 0 }, "numeric"],
    ["ganzzahliger Schritt", { step: 1 }, "numeric"],
    ["Kommazahl (precision 2)", { precision: 2 }, "decimal"],
    ["halber Schritt", { step: 0.5 }, "decimal"],
    ["ohne Angabe", {}, "decimal"],
  ])("%s öffnet die Zifferntastatur", async (_name, props, erwartet) => {
    await mount(<InputNumber aria-label="Zahl" {...props} />);
    expect(feld().getAttribute("inputmode")).toBe(erwartet);
  });

  it("lässt die volle Tastatur, wenn das Feld negativ werden darf", async () => {
    await mount(<InputNumber aria-label="Zahl" min={-90} max={90} />);
    expect(feld().hasAttribute("inputmode")).toBe(false);
  });

  it("nimmt ein inputMode am Aufruf vor der Vorgabe", async () => {
    await mount(<InputNumber aria-label="Zahl" precision={0} inputMode="text" />);
    expect(feld().getAttribute("inputmode")).toBe("text");
  });

  it("liest das Komma als Dezimaltrenner statt es zu verschlucken", async () => {
    const onChange = vi.fn();
    await mount(<InputNumber aria-label="Zahl" onChange={onChange} />);
    const el = feld();
    const setzeWert = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setzeWert.call(el, "231,5");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith(231.5);
  });

  it("zeigt einen Wert mit Komma", async () => {
    await mount(<InputNumber aria-label="Zahl" value={1.5} />);
    expect(feld().value).toBe("1,5");
  });
});

/**
 * Felder, die heute noch ohne `inputMode` stehen, weil ihr Modul gerade in einem eigenen Paket
 * umgebaut wird (IDA-390 Feedback). Die Liste wird nur kürzer.
 */
const NOCH_OHNE_TASTATUR = new Set([
  "src/app/m/feedback/_ui/AbendBearbeiten.tsx",
  "src/app/m/feedback/_ui/Gruppenkarten.tsx",
  "src/app/m/feedback/_ui/StartFormular.tsx",
  "src/app/m/feedback/_ui/Verlauf.tsx",
]);

const WURZEL = join(__dirname, "..", "..", "..");

function tsxDateien(ordner: string): string[] {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
    const pfad = join(ordner, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : tsxDateien(pfad);
    return e.name.endsWith(".tsx") && !e.name.includes(".test.") ? [pfad] : [];
  });
}

/** `<input type="number">` und `<Input type="number">` ohne `inputMode`, als „Datei:Zeile“. */
function zahlenfelderOhneTastatur(pfad: string, text = readFileSync(pfad, "utf8")): string[] {
  const quelle = ts.createSourceFile(pfad, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const funde: string[] = [];
  const besuche = (knoten: ts.Node): void => {
    if (ts.isJsxOpeningElement(knoten) || ts.isJsxSelfClosingElement(knoten)) {
      const tag = knoten.tagName.getText(quelle);
      if (tag === "input" || tag === "Input") {
        const attribute = knoten.attributes.properties.filter(ts.isJsxAttribute);
        const name = (a: ts.JsxAttribute) => a.name.getText(quelle);
        const istZahl = attribute.some(
          (a) => name(a) === "type" && a.initializer !== undefined && /["']number["']/.test(a.initializer.getText(quelle)),
        );
        const hatTastatur = attribute.some((a) => name(a) === "inputMode");
        const hatSpread = knoten.attributes.properties.some(ts.isJsxSpreadAttribute);
        if (istZahl && !hatTastatur && !hatSpread) {
          const { line } = quelle.getLineAndCharacterOfPosition(knoten.getStart(quelle));
          funde.push(`${relative(WURZEL, pfad)}:${line + 1}`);
        }
      }
    }
    ts.forEachChild(knoten, besuche);
  };
  besuche(quelle);
  return funde;
}

describe("rohe Zahlenfelder", () => {
  it("tragen inputMode", () => {
    const funde = tsxDateien(join(WURZEL, "src"))
      .filter((p) => !NOCH_OHNE_TASTATUR.has(relative(WURZEL, p)))
      .flatMap((p) => zahlenfelderOhneTastatur(p));
    expect(
      funde,
      'type="number" ohne inputMode öffnet am Telefon nicht den Ziffernblock: inputMode="numeric" oder "decimal" setzen, oder antds InputNumber nehmen',
    ).toEqual([]);
  });

  it("findet ein Feld ohne inputMode (Gegenprobe)", () => {
    const probe = [
      'const a = <Input name="x" type="number" min={1} />;',
      'const b = <input type="number" inputMode="numeric" />;',
      'const c = <XAxis type="number" />;',
    ].join("\n");
    expect(zahlenfelderOhneTastatur(join(WURZEL, "probe.tsx"), probe)).toEqual(["probe.tsx:1"]);
  });
});
