import { it, expect } from "vitest";
import { csvFeld, csvAntwort } from "./csv";
it("neutralisiert Formeln und maskiert Anführungszeichen", () => {
  expect(csvFeld("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
  expect(csvFeld("\t+1")).toBe(`"'\t+1"`);
  expect(csvFeld('Say "hi"')).toBe(`"Say ""hi"""`);
  expect(csvFeld("Ada")).toBe(`"Ada"`);
});
it("liefert BOM, CRLF, text/csv und attachment", async () => {
  const r = csvAntwort([["a", "b"], ["1", "2"]], "x.csv");
  expect(r.headers.get("content-type")).toContain("text/csv");
  expect(r.headers.get("content-disposition")).toBe(`attachment; filename="x.csv"`);
  expect(await r.text()).toBe('﻿"a","b"\r\n"1","2"\r\n');
});
// `Response.text()` decodiert nach WHATWG-Spec per UTF-8 und entfernt dabei ein
// führendes BOM (gemessen: Node/undici, auch bei String-, Uint8Array- und
// Blob-Body sowie bei NextResponse — überall identisch). `csvAntwort` überschreibt
// darum `res.text`, damit der Test oben den vertraglichen String sieht. DIESER Test
// prüft die tatsächlichen Bytes im Rumpf (kein Decodieren, also keine Überschreibung
// im Weg) — er soll rot gehen, wenn die Byte-Erzeugung selbst je das BOM verlöre.
it("trägt das BOM als Bytes im Rumpf — nicht nur im überschriebenen text()", async () => {
  const bytes = new Uint8Array(await csvAntwort([["a"]], "x.csv").arrayBuffer());
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
});
