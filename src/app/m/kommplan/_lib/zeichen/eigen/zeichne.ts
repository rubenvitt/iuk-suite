import { PRINT_MONOCHROME_THEME, SpecParseError, checkSpec, describeSymbolSpec, parseSpec, renderSvg } from "@einsatzzeichen/core";
import type { Drawing, Primitive, SymbolSpec } from "@einsatzzeichen/schema";
import { PALETTE } from "@einsatzzeichen/schema";
import type { Symbolquelle } from "../grundlagen";

/**
 * DER ZEICHNER EIGENER ZEICHEN — Server UND Baukasten im Browser, damit die Vorschau genau das Bild ist, das später
 * in Plan, Druck und Freigabe-Link steht.
 *
 * WARUM `@einsatzzeichen/core` (4.0.0) UND NICHT DER KATALOG: der Kern bringt seit 3.0.0 die vermessene Geometrie
 * selbst mit (`drawSymbol`, `checkSpec`, `vocabulary`) und lädt seine Metriken als JSON-Import — kein
 * `fileURLToPath` auf Modulebene, also nicht Befund M1, der `@einsatzzeichen/catalog` aus jedem Server-Graph
 * verbannt (`grenze.test.ts`). Damit zeichnet der SERVER aus der gespeicherten Zusammenstellung; ein SVG aus dem
 * Browser wird nie angenommen. Gespeichert wird nur die Spec, geprüft von `parseSpec` (Form) und `checkSpec`
 * (Regeln), gezeichnet bei jedem Abruf (`symbole.ts`).
 *
 * Die eingecheckten Katalogzeichen (`zeichen.generiert.json`) entstehen weiter aus Katalog 1.5.0; ein eigenes
 * Zeichen kann sich deshalb in Feinheiten unterscheiden. Einen Rezeptnachbau gibt es hier nicht.
 */

/** Obergrenze der gespeicherten Spec: eine echte Zusammenstellung braucht wenige hundert Zeichen. */
export const SPEC_MAX_ZEICHEN = 4000;

/**
 * `abgeleitet`: die Spec-Dimensionen (`capabilities`, `bodyMarks`, `labels.center` …), deren Zeichnung kein Original
 * belegt — seit core 4.0.0 überträgt oder konstruiert das Paket sie aus vermessenen Nachbarn (`Drawing.derivations`, DRK-507).
 */
export type Zeichnung =
  | { ok: true; quelle: Symbolquelle; beschreibung: string; abgeleitet: readonly string[] }
  | { ok: false; art: "regel"; hinweise: readonly Regelhinweis[] }
  | { ok: false; art: "unvermessen"; meldung: string };

/** Ein Regelverstoß in Worten des Pakets: Titel und Erklärung (deutsch), dazu das Spec-Feld, an dem er hängt. */
export interface Regelhinweis { titel: string; erklaerung: string; feld: string | null }

/**
 * LESBARE BESCHRIFTUNG AUF HELLEN KÖRPERN. Der Kern färbt jede Körperbeschriftung weiß, außer auf Weiß
 * (`bodyLabelInk`). Auf dem Gelb der Führung (#fafa00) liegt Weiß bei einem Kontrast von 1,07:1 — ein „ILS"
 * war praktisch unsichtbar. Die Referenz setzt Kürzel auf Gelb schwarz (D.1.4 „EL"; dieselbe Abweichung U2
 * behandelt `scripts/kommplan-zeichen-generat.ts`). Getauscht wird nur unterhalb von 3:1 — Rot (4,0:1) und
 * Grün (3,4:1) behalten Weiß wie in der Vorschrift; betroffen sind Gelb, Hellgrün, Orange und Hellgrau.
 */
const MINDESTKONTRAST_WEISS = 3;
function luminanz(hex: string): number {
  const kanal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
}
export function weissZuSchwach(token: string): boolean {
  const hex = (PALETTE as Readonly<Record<string, string>>)[token];
  if (!hex) return false;
  return 1.05 / (luminanz(hex) + 0.05) < MINDESTKONTRAST_WEISS;
}

function alle(primitive: readonly Primitive[]): Primitive[] {
  return primitive.flatMap((p) => ("children" in p ? [p, ...alle(p.children as readonly Primitive[])] : [p]));
}
function lesbar(zeichnung: Drawing): Drawing {
  const kopie = structuredClone(zeichnung) as { children: Primitive[] } & Drawing;
  const flach = alle(kopie.children);
  const koerper = flach.find((p) => p.role === "body" && typeof p.style?.fill === "string");
  if (!koerper || !weissZuSchwach(koerper.style!.fill as string)) return kopie;
  for (const p of flach) {
    if (p.type === "text" && p.role === "label" && p.style?.fill === "weiss") (p as { style: { fill: string } }).style.fill = "schwarz";
  }
  return kopie;
}

/**
 * Äußeres <svg> ab, `desc`/`title` und `font-family` heraus (die Schrift erbt vom Plan-<svg>, wie im Generat),
 * `font-weight` heraus: das Generat (Katalog 1.5.0) setzt Text im Normalschnitt, ein eigenes Zeichen neben einem
 * Katalogzeichen sähe sonst fetter aus.
 */
function zerlege(svg: string): Symbolquelle {
  const kopf = /^<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(svg);
  if (!kopf || !svg.endsWith("</svg>")) throw new Error("renderSvg: SVG ohne erwartete Hülle");
  const inhalt = svg.slice(kopf[0].length, -"</svg>".length)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, "")
    .replace(/\sfont-(?:family|weight)="[^"]*"/g, "");
  return { viewBox: kopf[1], inhalt };
}

/**
 * DIE ZWEITE LINIE: der Inhalt landet per `dangerouslySetInnerHTML` in einem `<symbol>` (`Symbole.tsx`), auch in
 * der login-freien Token-Ansicht. `renderSvg` maskiert Text und schreibt nur Geometrie — diese Prüfung hält das
 * fest, statt es zu glauben: nur bekannte Elemente und Attribute, kein `on…`, kein `url(` außer auf eine eigene
 * ID, kein `href`. Schlägt sie an, ist das ein Fehler im Paket, kein Zustand für die Oberfläche.
 */
const ELEMENTE = new Set(["g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "defs", "clipPath"]);
const ATTRIBUTE = new Set([
  "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "d", "transform", "id",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-miterlimit", "fill-rule", "clip-rule", "clip-path", "opacity", "fill-opacity", "stroke-opacity",
  "text-anchor", "dominant-baseline", "font-size", "font-style",
]);
export function istSicheresSymbol(inhalt: string, idPraefix: string): boolean {
  for (const tag of inhalt.matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*)>/g)) {
    if (!ELEMENTE.has(tag[1])) return false;
    const rest = tag[2].replace(/\/$/, "");
    const attribute = [...rest.matchAll(/\s([\w:-]+)="([^"]*)"/g)];
    if (rest.replace(/\s([\w:-]+)="([^"]*)"/g, "").trim() !== "") return false;
    for (const [, name, wert] of attribute) {
      if (!ATTRIBUTE.has(name)) return false;
      if (name === "id" && !wert.startsWith(idPraefix)) return false;
      for (const u of wert.matchAll(/url\(([^)]*)\)/gi)) if (!u[1].startsWith(`#${idPraefix}`)) return false;
      if (/javascript:|&#|\\/i.test(wert)) return false;
    }
  }
  return !/<!|<\?/.test(inhalt);
}

/** Form prüfen (unbekannte Felder, falsche Werte): `parseSpec` liefert die kanonische Spec oder einen Satz. */
export function liesSpec(roh: unknown): { ok: true; spec: SymbolSpec } | { ok: false; fehler: string } {
  try {
    if (JSON.stringify(roh ?? null).length > SPEC_MAX_ZEICHEN) return { ok: false, fehler: "Die Zusammenstellung ist zu groß." };
    return { ok: true, spec: parseSpec(roh) };
  } catch (e) {
    if (e instanceof SpecParseError) return { ok: false, fehler: `Die Zusammenstellung lässt sich nicht lesen (${e.message}).` };
    throw e;
  }
}

/** Zeichnen. `idPraefix` hält IDs eindeutig, wenn mehrere Zeichen im selben Dokument stehen (Befund M11). */
export function zeichneEigenes(spec: SymbolSpec, idPraefix: string, optionen: { schwarzweiss?: boolean } = {}): Zeichnung {
  const r = checkSpec(spec);
  if (!r.ok) {
    return r.reason === "rule"
      ? { ok: false, art: "regel", hinweise: r.issues.map((i) => ({ titel: i.title, erklaerung: i.explanation, feld: i.field ?? null })) }
      : { ok: false, art: "unvermessen", meldung: r.scope === "value" ? "Für einen der gewählten Werte gibt es keine vermessene Zeichnung." : "Diese Kombination ist nicht vermessen. Nimm einen der Werte heraus." };
  }
  const svg = renderSvg(lesbar(r.drawing), { idPrefix: idPraefix, ...(optionen.schwarzweiss ? { theme: PRINT_MONOCHROME_THEME } : {}) });
  const quelle = zerlege(svg);
  if (!istSicheresSymbol(quelle.inhalt, idPraefix)) throw new Error("renderSvg lieferte unerwartetes Markup");
  const abgeleitet = [...new Set((r.drawing.derivations ?? []).map((d) => d.dimension))];
  return { ok: true, quelle, beschreibung: describeSymbolSpec(spec), abgeleitet };
}
