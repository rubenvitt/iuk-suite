import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * DER SCAN HINTER `zentrierung.test.ts`: findet Seiten, die sich mittig stellen (Höchstbreite plus
 * automatischer Rand). Er liest eine Seite (`page.tsx`), die Bausteine, die sie DIREKT relativ
 * importiert (die Seitenhülle aus `_ui/` oder daneben), und die CSS-Klassen, die diese Dateien lesen. Tiefer nicht: ein mittiger QR-Kasten in einer
 * Karte ist keine Seitenausrichtung.
 */

export type Fund = { datei: string; seite: string; auszug: string };

const QUELLEN = /\.(tsx|ts)$/;

export function seitenUnter(wurzel: string): string[] {
  const aus: string[] = [];
  const geh = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const pfad = join(dir, name);
      if (statSync(pfad).isDirectory()) geh(pfad);
      else if (name === "page.tsx") aus.push(pfad);
    }
  };
  geh(wurzel);
  return aus.sort();
}

function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function relativeImporte(datei: string): string[] {
  const text = readFileSync(datei, "utf8");
  return [...text.matchAll(/^\s*import\s+[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)].map((t) => t[1]!);
}

/** Die CSS-Module einer Datei mit ihrem Importnamen (`import s from "./x.module.css"`). */
function cssModule(datei: string, text: string): { pfad: string; name: string }[] {
  return [...text.matchAll(/^\s*import\s+(\w+)\s+from\s+["'](\.{1,2}\/[^"']+\.module\.css)["']/gm)]
    .map((t) => ({ name: t[1]!, pfad: aufloesen(datei, t[2]!) }))
    .filter((m): m is { name: string; pfad: string } => m.pfad !== null);
}

/** Die Klassen, die eine Datei aus einem CSS-Modul tatsächlich liest (`s.flaeche`, `s["a-b"]`). */
function genutzteKlassen(text: string, name: string): Set<string> {
  const punkt = new RegExp(`\\b${name}\\.([A-Za-z_][\\w]*)`, "g");
  const klammer = new RegExp(`\\b${name}\\[["']([^"']+)["']\\]`, "g");
  return new Set([...text.matchAll(punkt), ...text.matchAll(klammer)].map((t) => t[1]!));
}

function aufloesen(von: string, spez: string): string | null {
  const basis = resolve(dirname(von), spez);
  for (const kandidat of [basis, `${basis}.tsx`, `${basis}.ts`, join(basis, "index.tsx"), join(basis, "index.ts")]) {
    if (existsSync(kandidat) && statSync(kandidat).isFile()) return kandidat;
  }
  return null;
}

/** Ein Inline-Stilobjekt mit Höchstbreite und automatischem Rand in der Waagrechten. */
const INLINE_RAND = /margin\s*:\s*["'`](?:0|\d+px|[\w.$]+)?\s*auto["'`]|marginInline\s*:\s*["'`]auto["'`]|margin\s*:\s*["'`]auto["'`]/;
const INLINE_BREITE = /\bmax(?:Width|InlineSize)\s*:/;

/** Eine CSS-Regel mit Höchstbreite und automatischem Rand in der Waagrechten. */
const CSS_RAND = /margin(?:-inline)?\s*:\s*(?:[\w.-]+\s+)?auto\b/;
const CSS_BREITE = /\bmax-(?:width|inline-size)\s*:/;

export function inlineFunde(text: string): string[] {
  const funde: string[] = [];
  // Jedes `style={{ … }}` und jedes Objektliteral, das in einem `style`-Wert endet: grob, aber
  // über Zeilen hinweg — die Seiten schreiben ihre Stilobjekte meist mehrzeilig.
  for (const t of text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const koerper = t[1]!;
    if (INLINE_RAND.test(koerper) && INLINE_BREITE.test(koerper)) funde.push(koerper.replace(/\s+/g, " ").trim());
  }
  return funde;
}

/** Zentrierende Regeln, deren Selektor eine der genutzten Klassen allein trägt (`.flaeche`). */
export function cssFunde(text: string, klassen: Set<string>): string[] {
  const funde: string[] = [];
  for (const t of ohneKommentare(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const koerper = t[2]!;
    if (!(CSS_RAND.test(koerper) && CSS_BREITE.test(koerper))) continue;
    const selektoren = t[1]!.split(",").map((x) => x.trim());
    const treffer = selektoren.filter((sel) => {
      const k = /^\.([A-Za-z_][\w-]*)$/.exec(sel);
      return k !== null && klassen.has(k[1]!);
    });
    const auszug = koerper
      .split(";")
      .map((d) => d.trim())
      .filter((d) => CSS_RAND.test(d) || CSS_BREITE.test(d))
      .join("; ");
    for (const sel of treffer) funde.push(`${sel} { ${auszug} }`);
  }
  return funde;
}

/** Alle Funde unter `wurzel` (z. B. `src/app/m`), Pfade relativ zu `repo`. */
export function zentrierteSeiten(repo: string, wurzel: string): Fund[] {
  const funde: Fund[] = [];
  for (const seite of seitenUnter(wurzel)) {
    const rel = relative(repo, seite);
    const dateien = new Set<string>([seite]);
    for (const spez of relativeImporte(seite)) {
      const ziel = aufloesen(seite, spez);
      if (ziel && QUELLEN.test(ziel)) dateien.add(ziel);
    }
    for (const datei of dateien) {
      const text = ohneKommentare(readFileSync(datei, "utf8"));
      for (const auszug of inlineFunde(text)) funde.push({ datei: relative(repo, datei), seite: rel, auszug });
      for (const modul of cssModule(datei, text)) {
        const klassen = genutzteKlassen(text, modul.name);
        for (const auszug of cssFunde(readFileSync(modul.pfad, "utf8"), klassen)) {
          funde.push({ datei: relative(repo, modul.pfad), seite: rel, auszug });
        }
      }
    }
  }
  return funde;
}
