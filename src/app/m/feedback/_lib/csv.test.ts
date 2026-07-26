import { describe, it, expect } from "vitest";
import { buildCsv, joinTexts } from "./csv";

describe("buildCsv (RFC 4180)", () => {
  it("quotet Felder mit Komma, Anführungszeichen, Zeilenumbruch", () => {
    const csv = buildCsv([
      ["a", "b,c", 'd"e'],
      ["f\ng", "h", "i"],
    ]);
    expect(csv).toBe('a,"b,c","d""e"\r\n"f\ng",h,i');
  });
  it("leere Matrix → leerer String", () => {
    expect(buildCsv([])).toBe("");
  });
});

describe("joinTexts", () => {
  it("verbindet Freitexte mit ' | ' — kein Doppel-JSON wie die Alt-App", () => {
    expect(joinTexts(["super", "mehr Praxis"])).toBe("super | mehr Praxis");
  });
  it("leeres Array → leerer String", () => {
    expect(joinTexts([])).toBe("");
  });
});

describe("buildCsv (CSV-Formula-Injection)", () => {
  const dangerousPrefixes = ["=", "+", "-", "@", "\t", "\r"];

  it.each(dangerousPrefixes)(
    "neutralisiert Felder, die mit %j beginnen, mit führendem '",
    (prefix) => {
      const field = `${prefix}SUM(A1)`;
      const csv = buildCsv([[field]]);
      // \r zwingt weiterhin RFC-4180-Quoting (siehe eigener CR-Test unten) —
      // das neutralisierende ' muss trotzdem direkt am Feldanfang stehen,
      // ggf. innerhalb der Anführungszeichen.
      const core = csv.startsWith('"') ? csv.slice(1, -1) : csv;
      expect(core).toBe(`'${field}`);
    },
  );

  it("=SUM(A1) → 'SUM(A1) — bleibt unquotet (kein Komma/Quote/Newline)", () => {
    expect(buildCsv([["=SUM(A1)"]])).toBe("'=SUM(A1)");
  });

  it("harmloser Wert bleibt unverändert (kein führendes ')", () => {
    expect(buildCsv([["super Praxis"]])).toBe("super Praxis");
    expect(buildCsv([["note 2"]])).toBe("note 2");
  });

  it("neutralisiertes Feld mit Komma wird zusätzlich gequotet: =cmd,x → \"'=cmd,x\"", () => {
    expect(buildCsv([["=cmd,x"]])).toBe('"\'=cmd,x"');
  });

  it("isolierter CR-Test (Reviewer-Minor): Feld nur mit \\r wird gequotet", () => {
    expect(buildCsv([["\r"]])).toBe('"\'\r"');
  });
});
