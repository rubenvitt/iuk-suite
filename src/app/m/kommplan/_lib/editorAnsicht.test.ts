import { describe, expect, it } from "vitest";
import { adresseMitAnsicht, leseEditorAnsicht, sichtbareAnsicht } from "./editorAnsicht";

describe("Ansicht des Editors (Entscheidung 1)", () => {
  it("nur die zwei erlaubten Werte; alles andere heißt „nicht gewählt“", () => {
    expect(leseEditorAnsicht("gliederung")).toBe("gliederung");
    expect(leseEditorAnsicht(["diagramm", "gliederung"])).toBe("diagramm");
    expect(leseEditorAnsicht("Gliederung")).toBeNull();
    expect(leseEditorAnsicht("<script>")).toBeNull();
    expect(leseEditorAnsicht(undefined)).toBeNull();
  });
  it("die Adresse behält Pfad, andere Parameter und Anker", () => {
    expect(adresseMitAnsicht("http://kommplan.localtest.me:3100/p/abc?x=1#k", "gliederung")).toBe("/p/abc?x=1&ansicht=gliederung#k");
    expect(adresseMitAnsicht("http://h/p/abc?ansicht=gliederung", "diagramm")).toBe("/p/abc?ansicht=diagramm");
  });
  it("sichtbar: die ausdrückliche Wahl, sonst der Breakpoint", () => {
    expect(sichtbareAnsicht("diagramm", true)).toBe("diagramm");
    expect(sichtbareAnsicht(null, true)).toBe("gliederung");
    expect(sichtbareAnsicht(null, false)).toBe("diagramm");
  });
});
