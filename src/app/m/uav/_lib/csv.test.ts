import { it, expect } from "vitest";
import { csvFeld, csvAntwort } from "./csv";
it("neutralisiert Formeln und maskiert Anführungszeichen", () => {
  expect(csvFeld("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
  expect(csvFeld("\t+1")).toBe(`"'\t+1"`);
  expect(csvFeld('Say "hi"')).toBe(`"Say ""hi"""`);
  expect(csvFeld("Ada")).toBe(`"Ada"`);
});
// `Response.text()` decodiert nach WHATWG-Spec per UTF-8 und entfernt dabei ein
// führendes BOM (gemessen: Node/undici, auch bei String-, Uint8Array- und
// Blob-Body sowie bei NextResponse — überall identisch). Das ist korrektes
// Verhalten einer spec-konformen `Response`, kein Decodier-Bug — der Vertrag ist
// der Byte-Rumpf auf der Leitung, deshalb prüft dieser Test die tatsächlichen
// Bytes statt `text()`.
it("liefert BOM als Bytes im Rumpf, CRLF, text/csv und attachment", async () => {
  const r = csvAntwort([["a", "b"], ["1", "2"]], "x.csv");
  expect(r.headers.get("content-type")).toContain("text/csv");
  expect(r.headers.get("content-disposition")).toBe(`attachment; filename="x.csv"`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe('﻿"a","b"\r\n"1","2"\r\n');
});
