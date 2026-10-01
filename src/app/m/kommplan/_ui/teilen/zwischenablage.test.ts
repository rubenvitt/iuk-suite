// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { kopiere } from "./zwischenablage";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const URL_ = "http://kommplan.localtest.me:3000/t/" + "A".repeat(43);

describe("kopiere (Review Focus 3)", () => {
  it("sicherer Kontext mit Clipboard-API: schreibt dorthin", async () => {
    const schreibe = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: schreibe } });
    expect(await kopiere(URL_)).toBe("kopiert");
    expect(schreibe).toHaveBeenCalledWith(URL_);
  });
  it("http ohne Clipboard-API: Rückfall über ein verstecktes Textfeld, Fokus kehrt zurück, nichts bleibt im DOM", async () => {
    vi.stubGlobal("isSecureContext", false);
    const knopf = document.body.appendChild(document.createElement("button"));
    knopf.focus();
    let kopiert = "";
    document.execCommand = vi.fn((befehl: string) => { kopiert = befehl === "copy" ? (document.activeElement as HTMLTextAreaElement).value : ""; return true; });
    expect(await kopiere(URL_)).toBe("kopiert");
    expect(kopiert).toBe(URL_);
    expect(document.activeElement).toBe(knopf);
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
    knopf.remove();
  });
  it("Clipboard-API wirft (Berechtigung verweigert) und execCommand scheitert: „manuell“, nie ein Wurf", async () => {
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowed")) } });
    document.execCommand = vi.fn(() => false);
    expect(await kopiere(URL_)).toBe("manuell");
  });
});
