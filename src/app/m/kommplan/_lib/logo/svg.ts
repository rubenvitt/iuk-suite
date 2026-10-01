/**
 * SVG-BEREINIGUNG (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 5) — rein, ohne DOM, ohne Abhängigkeit.
 *
 * ALLOWLIST STATT BLOCKLIST: Elemente und Attribute, die nicht ausdrücklich erlaubt sind, fallen — so trifft
 * jede Schreibweise (`foreignobject`, `FOREIGNOBJECT`) und jedes Präfix (`svg:script`) dieselbe Regel. Ein
 * eigener, STRIKTER Zerleger: nur wohlgeformtes XML ohne DOCTYPE (keine Entitäten außer den fünf
 * vordefinierten, keine XXE, keine Entitäten-Bombe), Attribute nur in Anführungszeichen, keines doppelt.
 * Zeichenreferenzen werden VOR jeder Prüfung aufgelöst (`&#106;avascript:`), Leer- und Steuerzeichen vor
 * der `javascript:`-Prüfung entfernt. Die Ausgabe ist neu geschrieben, nie durchgereicht, und idempotent.
 *
 * `<style>` bleibt, je Deklaration gefiltert: Illustrator setzt Farben über Klassen (`.st0{fill:…}`) — ohne
 * ihn wäre ein Logo schwarz (Review Focus 1). Im Kopf der Zeichnung steht das Logo als `<image>` mit
 * `data:`-URI; dort führt kein Browser Skript aus. Die Bereinigung ist die zweite Linie, nicht die einzige.
 */
export type SvgErgebnis = { ok: true; svg: string } | { ok: false; grund: string };

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const MAX_TIEFE = 256;

const ELEMENTE = new Set([
  "svg", "g", "defs", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "title", "desc", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "image", "style",
]);
const ZEICHNEND = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "image", "use"]);
const MIT_TEXT = new Set(["text", "tspan", "title", "desc", "style"]);
/** `href` nur als `#id` — an diesen Elementen; an `image` nur Rasterbilder als `data:`. */
const LOKAL_VERWEISEND = new Set(["use", "linearGradient", "radialGradient", "pattern"]);
const PRAESENTATION = new Set([
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "stop-color", "stop-opacity", "clip-path",
  "clip-rule", "mask", "font", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline",
  "letter-spacing", "visibility", "display", "color", "vector-effect",
]);
const ATTRIBUTE = new Set([
  ...PRAESENTATION, "id", "class", "style", "version", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r",
  "x1", "y1", "x2", "y2", "points", "d", "viewBox", "preserveAspectRatio", "transform", "gradientTransform",
  "gradientUnits", "patternUnits", "patternContentUnits", "patternTransform", "clipPathUnits", "maskUnits",
  "maskContentUnits", "offset", "fx", "fy", "fr", "spreadMethod", "dx", "dy", "rotate", "textLength", "lengthAdjust",
]);
const RASTER_DATA = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;
const LOKAL = /^#[A-Za-z_][\w.:-]*$/;
const NAME = /[A-Za-z_][\w.:-]*/y;
const LEERZEICHEN = /\s/;
/** Deckel für `<style>`-Inhalt: Illustrator-Klassen brauchen ein paar hundert Byte; mehr ist kein Logo. */
const MAX_CSS = 64 * 1024;

class Ungueltig extends Error {}
interface Knoten { name: string; attribute: [string, string][]; kinder: (Knoten | string)[] }

function nameAb(text: string, pos: number): string | null {
  NAME.lastIndex = pos;
  const m = NAME.exec(text);
  return m === null ? null : m[0];
}

const BENANNT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function dekodiere(roh: string): string {
  return roh.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);|&/g, (_ganz, e: string | undefined) => {
    if (e === undefined) throw new Ungueltig("Ein „&“ steht ohne Entität.");
    if (e.startsWith("#")) {
      const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) throw new Ungueltig("Ungültige Zeichenreferenz.");
      return String.fromCodePoint(n);
    }
    if (!(e in BENANNT)) throw new Ungueltig(`Unbekannte Entität „&${e};“.`);
    return BENANNT[e];
  });
}

const leer = (z: string | undefined) => z !== undefined && /\s/.test(z);

function zerlege(text: string): Knoten {
  const dokument: Knoten = { name: "#dokument", attribute: [], kinder: [] };
  const stapel: Knoten[] = [dokument];
  const oben = () => stapel[stapel.length - 1];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) { oben().kinder.push(dekodiere(text.slice(i))); break; }
    if (lt > i) oben().kinder.push(dekodiere(text.slice(i, lt)));
    if (text.startsWith("<!--", lt)) {
      const e = text.indexOf("-->", lt + 4);
      if (e < 0) throw new Ungueltig("Ein Kommentar wird nicht geschlossen.");
      i = e + 3; continue;
    }
    if (text.startsWith("<![CDATA[", lt)) {
      const e = text.indexOf("]]>", lt + 9);
      if (e < 0) throw new Ungueltig("Ein CDATA-Abschnitt wird nicht geschlossen.");
      oben().kinder.push(text.slice(lt + 9, e)); // wörtlicher Text
      i = e + 3; continue;
    }
    if (text.startsWith("<?", lt)) { // XML-Deklaration und Verarbeitungsanweisungen (xml-stylesheet) fallen weg
      const e = text.indexOf("?>", lt + 2);
      if (e < 0) throw new Ungueltig("Eine Verarbeitungsanweisung wird nicht geschlossen.");
      i = e + 2; continue;
    }
    if (text.startsWith("<!", lt)) throw new Ungueltig("DOCTYPE- und ENTITY-Angaben werden nicht angenommen.");
    if (text.startsWith("</", lt)) {
      const name = nameAb(text, lt + 2);
      if (name === null) throw new Ungueltig("Ein schließendes Element hat keinen Namen.");
      let j = lt + 2 + name.length;
      while (leer(text[j])) j++;
      if (text[j] !== ">") throw new Ungueltig(`</${name}> wird nicht mit „>“ beendet.`);
      const k = stapel.pop();
      if (k === undefined || k === dokument || k.name !== name) throw new Ungueltig(`Schließendes </${name}> passt nicht.`);
      i = j + 1; continue;
    }
    const name = nameAb(text, lt + 1);
    if (name === null) throw new Ungueltig("Ein „<“ steht ohne Elementnamen.");
    const knoten: Knoten = { name, attribute: [], kinder: [] };
    const gesehen = new Set<string>();
    let j = lt + 1 + name.length;
    for (;;) {
      const vor = j;
      while (leer(text[j])) j++;
      if (text.startsWith("/>", j)) { oben().kinder.push(knoten); j += 2; break; }
      if (text[j] === ">") {
        oben().kinder.push(knoten);
        stapel.push(knoten);
        if (stapel.length > MAX_TIEFE + 1) throw new Ungueltig(`Das SVG ist tiefer als ${MAX_TIEFE} Ebenen verschachtelt.`);
        j += 1; break;
      }
      if (j >= text.length) throw new Ungueltig(`<${name}> wird nicht beendet.`);
      if (j === vor) throw new Ungueltig(`In <${name}> fehlt Leerraum zwischen den Attributen.`);
      const a = nameAb(text, j);
      if (a === null) throw new Ungueltig(`Ungültiges Attribut in <${name}>.`);
      j += a.length;
      while (leer(text[j])) j++;
      if (text[j] !== "=") throw new Ungueltig(`Attribut „${a}“ ohne Wert.`);
      j++;
      while (leer(text[j])) j++;
      const q = text[j];
      if (q !== '"' && q !== "'") throw new Ungueltig(`Attribut „${a}“ ohne Anführungszeichen.`);
      const ende = text.indexOf(q, j + 1);
      if (ende < 0) throw new Ungueltig(`Attribut „${a}“ wird nicht geschlossen.`);
      const roh = text.slice(j + 1, ende);
      if (roh.includes("<")) throw new Ungueltig(`„<“ im Wert von „${a}“.`);
      if (gesehen.has(a)) throw new Ungueltig(`Attribut „${a}“ doppelt in <${name}>.`);
      gesehen.add(a);
      knoten.attribute.push([a, dekodiere(roh)]);
      j = ende + 1;
    }
    i = j;
  }
  if (stapel.length !== 1) throw new Ungueltig(`<${oben().name}> wird nicht geschlossen.`);
  return dokument;
}

/** Ohne Leer- und Steuerzeichen, klein — die Form, in der `java\tscript:` als `javascript:` erkannt wird. */
const verdichtet = (w: string) => w.replace(/[\u0000- \u007f-\u009f]+/g, "").toLowerCase();

/**
 * Nur `url(#id)` (oder gar kein `url(`). Jede Fundstelle von „url" einzeln per `indexOf` — linear auch bei
 * `url(url(url(…` ohne „)" (ein Regex `url\s*\(…\)` suchte von jeder Fundstelle bis zum Textende: quadratisch).
 */
function nurLokaleUrls(w: string): boolean {
  const k = w.toLowerCase();
  let i = 0;
  for (;;) {
    const a = k.indexOf("url", i);
    if (a < 0) return true;
    let j = a + 3;
    while (j < k.length && LEERZEICHEN.test(k[j])) j++;
    if (k[j] !== "(") { i = a + 3; continue; }
    const e = k.indexOf(")", j + 1);
    if (e < 0) return false;
    let innen = w.slice(j + 1, e).trim();
    if (innen.length >= 2 && (innen[0] === '"' || innen[0] === "'") && innen.at(-1) === innen[0]) innen = innen.slice(1, -1).trim();
    if (!LOKAL.test(innen)) return false;
    i = e + 1;
  }
}

function bereinigeDeklarationen(css: string): string {
  return css.split(";").flatMap((d) => {
    const i = d.indexOf(":");
    if (i < 0) return [];
    const prop = d.slice(0, i).trim().toLowerCase();
    const wert = d.slice(i + 1).trim();
    if (!PRAESENTATION.has(prop) || wert === "") return [];
    if (/[\\@<>]|expression\s*\(/i.test(wert) || verdichtet(wert).includes("javascript:")) return [];
    if (!nurLokaleUrls(wert)) return [];
    return [`${prop}:${wert}`];
  }).join(";");
}

/** CSS-Kommentare heraus, per `indexOf` (linear; ein offener Kommentar nimmt den Rest mit). */
function ohneCssKommentare(css: string): string {
  let aus = "";
  let i = 0;
  for (;;) {
    const a = css.indexOf("/*", i);
    if (a < 0) return aus + css.slice(i);
    aus += css.slice(i, a);
    const e = css.indexOf("*/", a + 2);
    if (e < 0) return aus;
    i = e + 2;
  }
}

/**
 * `<style>`: Kommentare und @-Anweisungen fallen, Regeln nur mit einfachen Selektoren, Deklarationen gefiltert.
 * Ein Zerleger, der Zeichen für Zeichen Klammern und Semikolons zählt — EIN Durchlauf. Die frühere Form mit
 * `matchAll(/([^{}]+)\{([^{}]*)\}/g)` lief bei fehlender Klammer von jeder Startposition bis zum Ende
 * (quadratisch; `svg.test.ts`, „lineare Laufzeit"). Verschachtelte Blöcke (`@media {…{…}}`) fallen ganz.
 */
function bereinigeCss(css: string): string {
  if (css.length > MAX_CSS) throw new Ungueltig("Der style-Inhalt ist größer als 64 KB.");
  const c = ohneCssKommentare(css);
  const regeln: [string, string][] = [];
  let tiefe = 0;
  let start = 0;
  let selektor = "";
  for (let j = 0; j < c.length; j++) {
    const z = c[j];
    if (z === "{") {
      if (tiefe === 0) { selektor = c.slice(start, j); start = j + 1; }
      tiefe++;
    } else if (z === "}") {
      if (tiefe === 0) { start = j + 1; continue; } // verirrte Klammer: was davor steht, fällt
      tiefe--;
      if (tiefe === 0) { regeln.push([selektor, c.slice(start, j)]); start = j + 1; }
    } else if (z === ";" && tiefe === 0) {
      start = j + 1; // `@import …;` und Reste zwischen den Regeln fallen
    }
  }
  return regeln.flatMap(([sel, decl]) => {
    const s = sel.trim();
    if (s === "" || decl.includes("{") || !/^[\w\s.#,:>*+~-]+$/.test(s)) return [];
    const d = bereinigeDeklarationen(decl);
    return d === "" ? [] : [`${s}{${d}}`];
  }).join("");
}

function reinigeVerweis(element: string, wert: string): string | null {
  const w = wert.trim();
  if (element === "image") return RASTER_DATA.test(w) ? w : null;
  return LOKAL_VERWEISEND.has(element) && LOKAL.test(w) ? w : null;
}

function reinigeAttribut(element: string, name: string, wert: string): string | null {
  if (/^on/i.test(name)) return null;
  if (name === "href" || name === "xlink:href") return reinigeVerweis(element, wert);
  if (name === "xmlns") return wert === SVG_NS ? wert : null;
  if (name === "xmlns:xlink") return wert === XLINK_NS ? wert : null;
  if (name === "xml:space") return wert === "preserve" || wert === "default" ? wert : null;
  if (!ATTRIBUTE.has(name)) return null;
  if (verdichtet(wert).includes("javascript:")) return null;
  if (name === "style") { const r = bereinigeDeklarationen(wert); return r === "" ? null : r; }
  if (!nurLokaleUrls(wert)) return null;
  return wert;
}

function reinige(k: Knoten): Knoten | null {
  if (!ELEMENTE.has(k.name)) return null; // samt Inhalt
  if (k.name === "style") {
    const css = bereinigeCss(k.kinder.filter((c): c is string => typeof c === "string").join(""));
    return css === "" ? null : { name: "style", attribute: [], kinder: [css] };
  }
  const attribute = k.attribute.flatMap(([n, w]): [string, string][] => {
    const r = reinigeAttribut(k.name, n, w);
    return r === null ? [] : [[n, r]];
  });
  if ((k.name === "use" || k.name === "image") && !attribute.some(([n]) => n === "href" || n === "xlink:href")) return null;
  const kinder = k.kinder.flatMap((c): (Knoten | string)[] => {
    if (typeof c === "string") return MIT_TEXT.has(k.name) && c !== "" ? [c] : [];
    const r = reinige(c);
    return r === null ? [] : [r];
  });
  return { name: k.name, attribute, kinder };
}

const zeichnet = (k: Knoten): boolean => ZEICHNEND.has(k.name) || k.kinder.some((c) => typeof c !== "string" && zeichnet(c));
const nutztXlink = (k: Knoten): boolean => k.attribute.some(([n]) => n === "xlink:href") || k.kinder.some((c) => typeof c !== "string" && nutztXlink(c));
const maskiere = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function schreibe(k: Knoten): string {
  const a = k.attribute.map(([n, w]) => ` ${n}="${maskiere(w).replace(/"/g, "&quot;")}"`).join("");
  const innen = k.kinder.map((c) => (typeof c === "string" ? maskiere(c) : schreibe(c))).join("");
  return innen === "" ? `<${k.name}${a}/>` : `<${k.name}${a}>${innen}</${k.name}>`;
}

const ZAHL = /^\d+(?:\.\d+)?(?:px)?$/;

export function bereinigeSvg(eingabe: string): SvgErgebnis {
  try {
    const text = eingabe.replace(/^﻿/, "");
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Ungueltig("DOCTYPE- und ENTITY-Angaben werden nicht angenommen.");
    const dokument = zerlege(text);
    if (dokument.kinder.some((c) => typeof c === "string" && c.trim() !== "")) throw new Ungueltig("Text steht außerhalb des svg-Wurzelelements.");
    const elemente = dokument.kinder.filter((c): c is Knoten => typeof c !== "string");
    if (elemente.length !== 1 || elemente[0].name !== "svg") throw new Ungueltig("Die Datei hat kein svg-Wurzelelement.");
    const wurzel = reinige(elemente[0])!;
    const attr = new Map(wurzel.attribute);
    const vb = attr.get("viewBox")?.trim().split(/[\s,]+/).map(Number);
    const hatViewBox = vb !== undefined && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
    if (!hatViewBox) {
      const b = attr.get("width")?.trim(), h = attr.get("height")?.trim();
      if (!b || !h || !ZAHL.test(b) || !ZAHL.test(h) || parseFloat(b) <= 0 || parseFloat(h) <= 0) {
        throw new Ungueltig("Das SVG braucht eine viewBox oder Breite und Höhe als Zahlen.");
      }
      attr.set("viewBox", `0 0 ${parseFloat(b)} ${parseFloat(h)}`);
    }
    if (!zeichnet(wurzel)) throw new Ungueltig("Nach der Bereinigung bleibt nichts zu zeichnen.");
    attr.set("xmlns", SVG_NS);
    if (nutztXlink(wurzel)) attr.set("xmlns:xlink", XLINK_NS); else attr.delete("xmlns:xlink");
    wurzel.attribute = [...attr];
    return { ok: true, svg: schreibe(wurzel) };
  } catch (e) {
    if (e instanceof Ungueltig) return { ok: false, grund: e.message };
    throw e;
  }
}
