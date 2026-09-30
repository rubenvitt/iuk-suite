import { describe, expect, it } from "vitest";
import { gliederungsBefehl } from "./tasten";

const t = (key: string, mehr: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean; repeat: boolean; code: string }> = {}) =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mehr });

describe("Tasten der Gliederung (Spec §6.5, Entscheidungen 5–10)", () => {
  it("Enter, Tab, Umschalt+Tab, Alt+↑/↓, ↑/↓, Esc, F2", () => {
    expect(gliederungsBefehl(t("Enter"), false)).toEqual({ art: "neu" });
    expect(gliederungsBefehl(t("Tab"), false)).toEqual({ art: "einruecken" });
    expect(gliederungsBefehl(t("Tab", { shiftKey: true }), false)).toEqual({ art: "ausruecken" });
    expect(gliederungsBefehl(t("ArrowUp", { altKey: true }), false)).toEqual({ art: "verschiebe", richtung: "hoch" });
    expect(gliederungsBefehl(t("ArrowDown", { altKey: true }), false)).toEqual({ art: "verschiebe", richtung: "runter" });
    expect(gliederungsBefehl(t("ArrowUp"), false)).toEqual({ art: "wandere", richtung: "hoch" });
    expect(gliederungsBefehl(t("ArrowDown"), false)).toEqual({ art: "wandere", richtung: "runter" });
    expect(gliederungsBefehl(t("Escape"), false)).toEqual({ art: "verlassen" });
    expect(gliederungsBefehl(t("F2"), false)).toEqual({ art: "details" });
  });
  it("Enter auf leerem Titel ist „neuLeer“ (rückt aus, Entscheidung 5); Strg/Cmd+Enter öffnet Details", () => {
    expect(gliederungsBefehl(t("Enter"), true)).toEqual({ art: "neuLeer" });
    expect(gliederungsBefehl(t("Enter", { ctrlKey: true }), false)).toEqual({ art: "details" });
    expect(gliederungsBefehl(t("Enter", { metaKey: true }), true)).toEqual({ art: "details" });
  });
  it("Alt+V / Alt+Z über e.code — auch wenn Option+Taste auf macOS ein Sonderzeichen liefert (Entscheidung 10)", () => {
    expect(gliederungsBefehl(t("√", { altKey: true, code: "KeyV" }), false)).toEqual({ art: "verbindung" });
    expect(gliederungsBefehl(t("Ω", { altKey: true, code: "KeyZ" }), false)).toEqual({ art: "zeichen" });
    expect(gliederungsBefehl(t("v", { code: "KeyV" }), false)).toBeNull();
    expect(gliederungsBefehl(t("e", { altKey: true, code: "KeyE" }), false)).toBeNull(); // Alt+E gehört unter Windows dem Browsermenü
  });
  it("gehaltene Tasten (repeat) löschen nie eine Zeile und legen nie eine an (Entscheidung 8)", () => {
    expect(gliederungsBefehl(t("Backspace", { repeat: true }), true)).toBeNull();
    expect(gliederungsBefehl(t("Delete", { repeat: true }), true)).toBeNull();
    expect(gliederungsBefehl(t("Enter", { repeat: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("Enter", { repeat: true }), true)).toBeNull();
    expect(gliederungsBefehl(t("ArrowDown", { repeat: true }), false)).toEqual({ art: "wandere", richtung: "runter" }); // wandern darf man halten
  });
  it("Rücktaste und Entf nur auf leerem Titel — sonst gehören sie dem Feld", () => {
    expect(gliederungsBefehl(t("Backspace"), true)).toEqual({ art: "loeschen", richtung: "hoch" });
    expect(gliederungsBefehl(t("Delete"), true)).toEqual({ art: "loeschen", richtung: "runter" });
    expect(gliederungsBefehl(t("Backspace"), false)).toBeNull();
    expect(gliederungsBefehl(t("Delete"), false)).toBeNull();
  });
  it("während einer Eingabekomposition (IME) und mit Strg/Cmd (außer Strg/Cmd+Enter): nichts; Buchstaben: nichts", () => {
    expect(gliederungsBefehl(t("Enter", { isComposing: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("Tab", { metaKey: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("Enter", { shiftKey: true }), false)).toBeNull();
    expect(gliederungsBefehl(t("n"), false)).toBeNull();
  });
});
