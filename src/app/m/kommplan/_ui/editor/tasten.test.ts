// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { flaechenBefehl, globalerBefehl, istTextfeld, type Taste } from "./tasten";

const t = (key: string, mehr: Partial<Taste> = {}): Taste => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mehr });

describe("Tastenbefehle", () => {
  it("Strg/Cmd+Z, Shift+Strg/Cmd+Z und Strg+Y — nie in einem Textfeld", () => {
    expect(globalerBefehl(t("z", { ctrlKey: true }), false)).toEqual({ art: "rueckgaengig" });
    expect(globalerBefehl(t("z", { metaKey: true }), false)).toEqual({ art: "rueckgaengig" });
    expect(globalerBefehl(t("Z", { metaKey: true, shiftKey: true }), false)).toEqual({ art: "wiederholen" });
    expect(globalerBefehl(t("y", { ctrlKey: true }), false)).toEqual({ art: "wiederholen" });
    expect(globalerBefehl(t("z", { ctrlKey: true }), true)).toBeNull();
    expect(globalerBefehl(t("z"), false)).toBeNull();
  });
  it("auf der Fläche: Pfeile, Enter, N, Entf und Rücktaste, Escape — ohne Modifikator", () => {
    expect(flaechenBefehl(t("ArrowLeft"))).toEqual({ art: "wandere", richtung: "links" });
    expect(flaechenBefehl(t("ArrowDown"))).toEqual({ art: "wandere", richtung: "runter" });
    expect(flaechenBefehl(t("Enter"))).toEqual({ art: "oeffnen" });
    expect(flaechenBefehl(t("F2"))).toEqual({ art: "oeffnen" }); // wie in Excel (Entscheidung 9)
    expect(flaechenBefehl(t("a"))).toBeNull(); // Tippen bearbeitet NICHT den Titel (Entscheidung 9)
    expect(flaechenBefehl(t("n"))).toEqual({ art: "neueUnterstelle" });
    expect(flaechenBefehl(t("N", { shiftKey: true }))).toEqual({ art: "neueUnterstelle" });
    expect(flaechenBefehl(t("Delete"))).toEqual({ art: "loeschen" });
    expect(flaechenBefehl(t("Backspace"))).toEqual({ art: "loeschen" });
    expect(flaechenBefehl(t("Escape"))).toEqual({ art: "abwaehlen" });
    expect(flaechenBefehl(t("n", { ctrlKey: true }))).toBeNull();
    expect(flaechenBefehl(t("+"))).toBeNull(); // Zoom bleibt Sache der Fläche
  });
  it("erkennt Textfelder, auch verschachtelt", () => {
    document.body.innerHTML = '<input id="i"><div contenteditable="true"><span id="s"></span></div><button id="b"></button>';
    expect(istTextfeld(document.getElementById("i"))).toBe(true);
    expect(istTextfeld(document.getElementById("s"))).toBe(true);
    expect(istTextfeld(document.getElementById("b"))).toBe(false);
    expect(istTextfeld(null)).toBe(false);
  });
});
