/**
 * DIE EIGENSTÄNDIGE SVG-DATEI EINES BLATTS (Spec §8.1; Umsetzungsplan Phase 5, Entscheidung 15). Im Druckdokument
 * stehen Symbole, Logo und Graufilter EINMAL in einem gemeinsamen Vorrat (`Druckblaetter`), die Blätter verweisen per
 * `<use>`/`url(#…)`. Die Datei nimmt genau die erreichten Einträge mit (auch über Ketten, etwa ein Symbol, das ein
 * anderes verwendet), bettet Arimo 400 und 700 als `@font-face` ein und setzt eine Schriftliste, die auch ohne `@font-face` gleich
 * breit setzt (Arimo ist metrisch gleich mit Arial und Liberation Sans). DOM-Code für die Client-Insel; kein React.
 */
const SVG_NS = "http://www.w3.org/2000/svg";
export const SCHRIFTLISTE = 'Arimo, Arial, "Liberation Sans", Helvetica, sans-serif';
const VERWEIS = /(?:\bhref|xlink:href)="#([^"]+)"|url\(#([^)"']+)\)/g;
const SICHERE_ID = /^[A-Za-z0-9_.:-]+$/;

/** Die zwei Stufen aus `@einsatzzeichen/core/fonts` (WOFF2, Base64), dieselben wie im Browser (`_ui/schrift.ts`). */
export interface ExportSchrift { regular: string; fett: string }

export function schriftStil(schrift: ExportSchrift): string {
  const flaeche = (base64: string, gewicht: number) =>
    `@font-face{font-family:"Arimo";src:url(data:font/woff2;base64,${base64}) format("woff2");font-weight:${gewicht};font-style:normal;}`;
  return flaeche(schrift.regular, 400) + flaeche(schrift.fett, 700);
}

export function verweiseIn(text: string): string[] {
  const ids: string[] = [];
  for (const m of text.matchAll(VERWEIS)) {
    const id = m[1] ?? m[2];
    if (SICHERE_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function eigenstaendigesSvg(blatt: SVGSVGElement, vorraete: readonly Element[], schrift: ExportSchrift | null): string {
  const kopie = blatt.cloneNode(true) as SVGSVGElement;
  const defs = document.createElementNS(SVG_NS, "defs");
  const vorhanden = new Set([...kopie.querySelectorAll("[id]")].map((e) => e.id));
  const offen = verweiseIn(kopie.outerHTML);
  while (offen.length > 0) {
    const id = offen.shift()!;
    if (vorhanden.has(id)) continue;
    const quelle = vorraete.map((v) => v.querySelector(`[id="${id}"]`)).find((e): e is Element => e !== null);
    if (!quelle) continue;
    const klon = quelle.cloneNode(true) as Element;
    defs.appendChild(klon);
    for (const e of [klon, ...klon.querySelectorAll("[id]")]) if (e.id) vorhanden.add(e.id);
    offen.push(...verweiseIn(klon.outerHTML));
  }
  if (defs.childNodes.length > 0) kopie.insertBefore(defs, kopie.firstChild);
  if (schrift) {
    const stil = document.createElementNS(SVG_NS, "style");
    stil.textContent = schriftStil(schrift);
    kopie.insertBefore(stil, kopie.firstChild);
  }
  kopie.removeAttribute("class");
  kopie.setAttribute("style", "background:#ffffff");
  kopie.setAttribute("font-family", SCHRIFTLISTE);
  // KEIN setAttribute("xmlns"): das Blatt rendert es schon, und ein zweites (namensraumloses) Attribut kann der
  // XMLSerializer doppelt ausgeben — dann öffnet die Datei nirgends. Der Serializer setzt den SVG-Namensraum selbst.
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(kopie)}\n`;
}
