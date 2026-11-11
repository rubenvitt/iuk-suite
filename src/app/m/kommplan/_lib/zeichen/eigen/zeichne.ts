import { PRINT_MONOCHROME_THEME, check, describe, draw, kindFamilyOf, parse, renderSvg, serialize, type Fidelity } from "@einsatzzeichen/core";
import { SpecParseError } from "@einsatzzeichen/core/exact";
import type { BodySign, Drawing, Primitive, Sign } from "@einsatzzeichen/schema";
import { PALETTE } from "@einsatzzeichen/schema";
import type { Symbolquelle } from "../grundlagen";

/**
 * DER ZEICHNER EIGENER ZEICHEN — Server UND Baukasten im Browser, damit die Vorschau genau das Bild ist, das später
 * in Plan, Druck und Freigabe-Link steht.
 *
 * WARUM `@einsatzzeichen/core` UND NICHT DAS PRÜFPAKET: der Kern bringt die vermessene Geometrie selbst mit und lädt
 * seine Metriken als JSON-Import — kein `fileURLToPath` auf Modulebene, also nicht Befund M1, der
 * `@einsatzzeichen/conformance` aus jedem Server-Graph verbannt (`grenze.test.ts`). Damit zeichnet der SERVER aus der
 * gespeicherten Beschreibung; ein SVG aus dem Browser wird nie angenommen.
 *
 * BESCHREIBUNG STATT BAUPLAN (Einsatzzeichen 7, ESZ-148 bis ESZ-151; IDA-408): gespeichert wird, was gemeint ist
 * (`Sign`), in der Hülle `{"v":2,"sign":…}`. Die Fassungen wählt das Paket bei jedem Zeichnen. `draw` wirft nie wegen
 * einer Regel: trägt eine gespeicherte Beschreibung nach einem Paketwechsel nicht mehr ganz, lässt es weg, was nicht
 * passt, und das Zeichen bleibt im Plan. Streng geprüft (`check`) wird nur beim Speichern. Zeilen aus der Zeit vor
 * IDA-408 tragen den nackten Bauplan; `parse` liest ihn über `fromExact` weiter.
 *
 * Die eingecheckten Katalogzeichen (`zeichen.generiert.json`) zeichnet derselbe Kern aus den Rezepten des Prüfpakets.
 */

/** Obergrenze der gespeicherten Beschreibung: eine echte Zusammenstellung braucht wenige hundert Zeichen. */
export const SPEC_MAX_ZEICHEN = 4000;

/** Was `draw` weglassen musste, mit dem Feld der Beschreibung (`tasks`, `head`, `text.center` …) und dem Grund. */
export interface Weglassung { feld: string; wert: string; grund: string }

/**
 * Ein gezeichnetes eigenes Zeichen. `treue`: `measured` (an der Referenz vermessen), `derived` (vollständig, Teile
 * abgeleitet) oder `simplified` (etwas fehlt, siehe `weggelassen`).
 */
export interface Zeichnung { quelle: Symbolquelle; beschreibung: string; treue: Fidelity; weggelassen: readonly Weglassung[] }

/** Ein Befund in Worten des Pakets: Titel und Erklärung (deutsch), dazu das Feld der Beschreibung, an dem er hängt. */
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
 * Äußeres <svg> ab, `desc`/`title` und `font-family` heraus (die Schrift erbt vom Plan-<svg>, wie im Generat).
 * `font-weight` bleibt: der Kern setzt jedes Kürzel in 500 wie im Generat, und die Seite lädt den Schnitt
 * (`_ui/schrift.ts`); ohne die Angabe stünde ein eigenes Zeichen dünner neben einem Katalogzeichen.
 */
function zerlege(svg: string): Symbolquelle {
  const kopf = /^<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(svg);
  if (!kopf || !svg.endsWith("</svg>")) throw new Error("renderSvg: SVG ohne erwartete Hülle");
  const inhalt = svg.slice(kopf[0].length, -"</svg>".length)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, "")
    .replace(/\sfont-family="[^"]*"/g, "");
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
  "text-anchor", "dominant-baseline", "font-size", "font-weight", "font-style",
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

/**
 * ALTBESTAND: bis core 4.1.0 bot der Baukasten die Schrifttoken `funktionslauf-kontrast` und `koerperlauf-kontrast`
 * als technische Füllung an; seit 4.2.0 zeichnet das Paket sie dort nicht mehr. Beide sind Schwarz (`PALETTE`) —
 * gelesen wird deshalb `schwarz`, damit ein so gespeichertes Zeichen im Plan bleibt.
 */
const ALTE_FUELLUNGEN = new Set(["funktionslauf-kontrast", "koerperlauf-kontrast"]);

type Gelesen = { ok: true; zeichen: BodySign } | { ok: false; fehler: string };

function lies(roh: () => Sign): Gelesen {
  try {
    const zeichen = roh();
    if (kindFamilyOf(zeichen.kind).id === "freestanding") return { ok: false, fehler: "Ein Zeichen ohne Grundzeichen lässt sich hier nicht speichern." };
    const sign = zeichen as BodySign;
    return { ok: true, zeichen: sign.color && ALTE_FUELLUNGEN.has(sign.color) ? { ...sign, color: "schwarz" } : sign };
  } catch (e) {
    if (e instanceof SpecParseError) return { ok: false, fehler: `Die Zusammenstellung lässt sich nicht lesen (${e.message}).` };
    throw e;
  }
}

/** Form prüfen (unbekannte Felder, falsche Werte), wie der Browser sie schickt: eine nackte Beschreibung. */
export function liesEingabe(roh: unknown): Gelesen {
  if (JSON.stringify(roh ?? null).length > SPEC_MAX_ZEICHEN) return { ok: false, fehler: "Die Zusammenstellung ist zu groß." };
  return lies(() => parse({ v: 2, sign: roh }));
}

/** Eine Zeile der Datenbank: die Hülle v2 oder (vor IDA-408) der nackte Bauplan. */
export function liesGespeichert(json: string): Gelesen {
  return lies(() => parse(json));
}

/** Die Form für die Datenbank: kanonisch in der Hülle v2. */
export function speicherform(zeichen: BodySign): string {
  return serialize(zeichen);
}

/** Streng: trägt die Beschreibung als Ganzes, ohne dass `draw` etwas weglassen müsste? Nur der Server beim Speichern. */
export function pruefeEigenes(zeichen: BodySign): { ok: true } | { ok: false; hinweise: Regelhinweis[] } {
  const r = check(zeichen);
  return r.ok ? { ok: true } : { ok: false, hinweise: r.issues.map((i) => ({ titel: i.title, erklaerung: i.message, feld: i.field ?? null })) };
}

/** Zeichnen, nie scheiternd. `idPraefix` hält IDs eindeutig, wenn mehrere Zeichen im selben Dokument stehen (Befund M11). */
export function zeichneEigenes(zeichen: BodySign, idPraefix: string, optionen: { schwarzweiss?: boolean } = {}): Zeichnung {
  const r = draw(zeichen);
  const svg = renderSvg(lesbar(r.drawing), { idPrefix: idPraefix, ...(optionen.schwarzweiss ? { theme: PRINT_MONOCHROME_THEME } : {}) });
  const quelle = zerlege(svg);
  if (!istSicheresSymbol(quelle.inhalt, idPraefix)) throw new Error("renderSvg lieferte unerwartetes Markup");
  return {
    quelle, beschreibung: describe(zeichen).description, treue: r.fidelity,
    weggelassen: r.omitted.map((o) => ({ feld: o.field, wert: o.value, grund: o.why })),
  };
}
