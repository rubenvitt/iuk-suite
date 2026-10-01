/**
 * LOGO-PRÜFUNG, TEIL 1 (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 5): Größe und Typ — der Typ allein
 * aus den ersten Bytes, nie aus Dateiname oder `Content-Type` (beides frei wählbar). Rein: Server und Test;
 * die Oberfläche liest nur die Konstanten. SVG ist Text: gültiges UTF-8, dessen erstes Element `<svg` ist —
 * ein HTML-Dokument mit eingebettetem `<svg>` ist kein SVG. Ob ein SVG sicher ist, entscheidet `svg.ts`.
 */
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPEN = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export type LogoTyp = (typeof LOGO_TYPEN)[number];
export const LOGO_TYP_NAME: Record<LogoTyp, string> = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP", "image/svg+xml": "SVG" };
/** Für `accept` am Dateifeld — nur eine Vorauswahl im Dialog, geprüft wird hier. */
export const LOGO_ANNAHME = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
export const LOGO_FEHLER = {
  leer: "Die Datei ist leer.",
  gross: "Das Logo darf höchstens 1 MB groß sein.",
  typ: "Erlaubt sind PNG, JPEG, WebP und SVG.",
} as const;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const LEER = /\s/;

/**
 * Vor dem ersten Element dürfen nur Leerraum, die XML-Deklaration, Kommentare und ein DOCTYPE stehen. Bewusst
 * KEIN Regex: eine wiederholte Gruppe über `\s+` oder `<!--[\s\S]*?-->` verfolgt bei einer Datei, die am Ende
 * doch nicht passt, exponentiell viele Zerlegungen — synchron, vor dem Scan, auf dem einzigen Node-Thread. Hier
 * springt `indexOf` von Ende zu Ende: linear in der Länge (`logoTyp.test.ts`, „Vorspann in linearer Zeit").
 */
function beginntMitSvg(text: string): boolean {
  let i = 0;
  for (;;) {
    while (i < text.length && LEER.test(text[i])) i++;
    const ende = text.startsWith("<?xml", i) ? "?>" : text.startsWith("<!--", i) ? "-->"
      : text.slice(i, i + 9).toUpperCase() === "<!DOCTYPE" ? ">" : null;
    if (ende === null) return text.startsWith("<svg", i) && /[\s>/]/.test(text[i + 4] ?? "");
    const e = text.indexOf(ende, i + 2);
    if (e < 0) return false;
    i = e + ende.length;
  }
}

function beginntMit(b: Uint8Array, signatur: number[], ab = 0): boolean {
  return b.length >= ab + signatur.length && signatur.every((x, i) => b[ab + i] === x);
}

function istSvg(b: Uint8Array): boolean {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return false; } // BOM fällt dabei weg
  return beginntMitSvg(text);
}

export function erkenneLogoTyp(b: Uint8Array): LogoTyp | null {
  if (beginntMit(b, PNG)) return "image/png";
  if (beginntMit(b, JPEG)) return "image/jpeg";
  if (beginntMit(b, RIFF) && beginntMit(b, WEBP, 8)) return "image/webp";
  if (istSvg(b)) return "image/svg+xml";
  return null;
}

export type LogoPruefung = { ok: true; typ: LogoTyp } | { ok: false; fehler: string };

export function pruefeLogoDatei(b: Uint8Array): LogoPruefung {
  if (b.length === 0) return { ok: false, fehler: LOGO_FEHLER.leer };
  if (b.length > LOGO_MAX_BYTES) return { ok: false, fehler: LOGO_FEHLER.gross };
  const typ = erkenneLogoTyp(b);
  return typ === null ? { ok: false, fehler: LOGO_FEHLER.typ } : { ok: true, typ };
}
