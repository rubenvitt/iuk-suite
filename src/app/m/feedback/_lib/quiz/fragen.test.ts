import { describe, expect, it } from "vitest";
import { pruefeFragen } from "./fragen";

const gut = { text: "Frage?", typ: "einfach", optionen: ["A", "B"], richtig: [0] };

describe("pruefeFragen", () => {
  it("nimmt eine gültige Frage an", () => {
    const r = pruefeFragen([gut]);
    expect(r).toEqual({ ok: true, fragen: [gut] });
  });
  it("lehnt eine leere Liste ab", () => {
    expect(pruefeFragen([]).ok).toBe(false);
    expect(pruefeFragen("x").ok).toBe(false);
  });
  it("lehnt 7 Optionen ab", () => {
    const o = ["1", "2", "3", "4", "5", "6", "7"];
    expect(pruefeFragen([{ ...gut, optionen: o }]).ok).toBe(false);
  });
  it("lehnt einen ungültigen Index ab", () => {
    expect(pruefeFragen([{ ...gut, richtig: [5] }]).ok).toBe(false);
  });
  it("lehnt einfach mit zwei richtigen ab, mehrfach nimmt es an", () => {
    expect(pruefeFragen([{ ...gut, richtig: [0, 1] }]).ok).toBe(false);
    expect(pruefeFragen([{ ...gut, typ: "mehrfach", richtig: [0, 1] }]).ok).toBe(true);
  });
  it("verlangt für wahrfalsch genau Wahr/Falsch", () => {
    const wf = { text: "x", typ: "wahrfalsch", optionen: ["Wahr", "Falsch"], richtig: [1] };
    expect(pruefeFragen([wf]).ok).toBe(true);
    expect(pruefeFragen([{ ...wf, optionen: ["Ja", "Nein"] }]).ok).toBe(false);
  });
  it("prüft zeit_s und Textlängen", () => {
    expect(pruefeFragen([{ ...gut, zeit_s: 4 }]).ok).toBe(false);
    expect(pruefeFragen([{ ...gut, zeit_s: 301 }]).ok).toBe(false);
    expect(pruefeFragen([{ ...gut, zeit_s: 20 }]).ok).toBe(true);
    expect(pruefeFragen([{ ...gut, text: "" }]).ok).toBe(false);
    expect(pruefeFragen([{ ...gut, text: "x".repeat(301) }]).ok).toBe(false);
  });
  it("begrenzt die Erklärung auf 400 Zeichen (der Beamer muss sie ganz zeigen)", () => {
    expect(pruefeFragen([{ ...gut, erklaerung: "x".repeat(400) }]).ok).toBe(true);
    expect(pruefeFragen([{ ...gut, erklaerung: "x".repeat(401) }]).ok).toBe(false);
  });
  it("lehnt mehr als 50 Fragen ab und meldet Fehler mit Fragenummer", () => {
    expect(pruefeFragen(Array(51).fill(gut)).ok).toBe(false);
    const r = pruefeFragen([gut, { ...gut, richtig: [] }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler[0]).toMatch(/Frage 2/);
  });
});
