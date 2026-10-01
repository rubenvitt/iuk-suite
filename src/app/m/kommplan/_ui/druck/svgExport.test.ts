// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { eigenstaendigesSvg, SCHRIFTLISTE, verweiseIn } from "./svgExport";

function baue(html: string): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = html;
  document.body.appendChild(wirt);
  return wirt;
}

describe("eigenständiges SVG (Entscheidung 15, Review Focus 6)", () => {
  it("findet href-, xlink:href- und url()-Verweise", () => {
    expect(verweiseIn('<use href="#a"/><use xlink:href="#b"/><g filter="url(#c)" fill="url(#a)"/>')).toEqual(["a", "b", "c"]);
  });
  it("nimmt genau die erreichten Defs mit (auch über Ketten), dazu Schrift, Schriftliste, weißen Grund — jeder Verweis löst auf", () => {
    const w = baue(`
      <svg class="kp-symbole" width="0" height="0"><defs>
        <symbol id="kp-rezept-A" viewBox="0 0 1 1"><use href="#kp-innen"></use></symbol>
        <symbol id="kp-innen" viewBox="0 0 1 1"><rect width="1" height="1"></rect></symbol>
        <symbol id="kp-unbenutzt" viewBox="0 0 1 1"></symbol>
        <image id="kp-logo" width="40" height="11" href="data:image/png;base64,QUJD"></image>
        <filter id="kp-grau"><feColorMatrix type="saturate" values="0"></feColorMatrix></filter>
      </defs></svg>
      <svg class="kp-blatt" data-blatt="1" width="297mm" height="210mm" viewBox="0 0 297 210" style="font-family: __Arimo_abc; background: rgb(255, 255, 255);">
        <use href="#kp-rezept-A"></use><use href="#kp-logo" filter="url(#kp-grau)"></use><text>Stand</text>
      </svg>`);
    const text = eigenstaendigesSvg(w.querySelector("svg.kp-blatt") as SVGSVGElement, [w.querySelector("svg.kp-symbole")!], "QUJD");
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const id of ["kp-rezept-A", "kp-innen", "kp-logo", "kp-grau"]) expect(text).toContain(`id="${id}"`);
    expect(text).not.toContain("kp-unbenutzt");
    const ids = new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    for (const ref of verweiseIn(text)) expect(ids.has(ref), ref).toBe(true);
    expect(text).toContain('@font-face{font-family:"Arimo";src:url(data:font/ttf;base64,QUJD) format("truetype")');
    expect(text).toContain(`font-family="${SCHRIFTLISTE.replace(/"/g, "&quot;")}"`);
    expect(text).toContain('style="background:#ffffff"');
    expect(text).not.toContain("__Arimo_abc");
    expect(text).not.toContain('class="kp-blatt"');
    expect(text).toContain('width="297mm"');
    // das Blatt im Dokument bleibt unberührt
    expect(w.querySelector("svg.kp-blatt defs")).toBeNull();
    w.remove();
  });
  it("die Datei ist wohlgeformtes XML im SVG-Namensraum — mit und ohne xmlns am Blatt", () => {
    for (const kopf of ['<svg class="kp-blatt" data-blatt="1">', '<svg xmlns="http://www.w3.org/2000/svg" class="kp-blatt" data-blatt="1">']) {
      const w = baue(`<svg class="kp-symbole"><defs><symbol id="kp-a"></symbol></defs></svg>${kopf}<use href="#kp-a"></use><text>Ä &amp; Ö</text></svg>`);
      const text = eigenstaendigesSvg(w.querySelector("svg.kp-blatt") as SVGSVGElement, [w.querySelector("svg.kp-symbole")!], "QUJD");
      const dok = new DOMParser().parseFromString(text, "image/svg+xml");
      expect(dok.querySelector("parsererror"), text.slice(0, 300)).toBeNull();
      expect(dok.documentElement.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(text.match(/\sxmlns="/g)?.length ?? 0).toBeLessThanOrEqual(1);
      w.remove();
    }
  });
});
