/**
 * Erzeugt die vier eingecheckten Generate des Moduls kommplan.
 *
 * WARUM EINGECHECKT: eine frische Arbeitskopie muss ohne Vorlauf `typecheck` und `vitest` bestehen,
 * und die Rezepte stehen im Prüfpaket `@einsatzzeichen/conformance` (devDependency, früher `catalog`) — der
 * Server-Graph darf es nie laden (Befund M1: `fonts.js` ruft `fileURLToPath(new URL(…))` auf Modulebene). Drift
 * fängt `_lib/zeichen/generat.test.ts`: er erzeugt neu in einen Wegwerfordner und vergleicht byteweise.
 *
 * WARUM VIER DATEIEN: `zeichen.generiert.json` (alle Rezepte als fertiges SVG) und `zeichen-sw.generiert.json` (dieselben im Druckthema `PRINT_MONOCHROME_THEME`, Phase 5) liest nur der Server;
 * `grundlagen.generiert.json` (Metriken von „Einsatzzeichen Sans", Piktogramme) braucht auch der Browser, weil der Betrachter das Layout
 * selbst rechnet; `schrift.generiert.json` (die Schnitte 400, 500 und 700 aus `@einsatzzeichen/core/fonts`, Base64) lädt nur der SVG-Export beim Klick.
 *
 * KEIN DATUM IM GENERAT: sonst wäre der Drift-Vergleich am nächsten Tag rot.
 *
 * Lauf: pnpm exec tsx scripts/kommplan-zeichen-generat.ts [zielordner]
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { RECIPES } from "@einsatzzeichen/conformance";
import { ALL_PICTOGRAMS, PRINT_MONOCHROME_THEME, TEXT_FONT_METRICS, drawSymbol, renderSvg } from "@einsatzzeichen/core";
import { SECHSECK } from "../src/app/m/kommplan/_lib/layout/masse";

const STANDARD_ZIEL = "src/app/m/kommplan/_lib/zeichen";
const ZIEL = process.argv[2] ?? STANDARD_ZIEL;

export class GeneratFehler extends Error {
  constructor(nachricht: string) {
    super(`kommplan-Generat: ${nachricht}. Paketstand prüfen und den Generator anpassen.`);
    this.name = "GeneratFehler";
  }
}

type Anforderer = ReturnType<typeof createRequire>;
const hier: Anforderer = createRequire(import.meta.url);

/** Paketwurzel aus dem Einstiegspunkt — `package.json` ist über `exports` nicht erreichbar. */
function wurzel(einstieg: string, endung: RegExp): string {
  const w = einstieg.replace(endung, "");
  if (w === einstieg) throw new GeneratFehler(`Einstiegspunkt liegt unerwartet unter ${einstieg}`);
  return w;
}
const pruefEinstieg = hier.resolve("@einsatzzeichen/conformance");
const PRUEFPAKET = wurzel(pruefEinstieg, /dist[/\\]src[/\\]index\.js$/);
const ausPruefpaket: Anforderer = createRequire(pruefEinstieg);
const kern = (von: Anforderer, name: string) => wurzel(von.resolve(name), /dist[/\\]index\.js$/);
const version = (w: string) => (JSON.parse(readFileSync(join(w, "package.json"), "utf8")) as { version: string }).version;
const KERN = kern(hier, "@einsatzzeichen/core");

/**
 * EIN KERN FÜR REZEPT UND ZEICHNUNG: bis Katalog 1.5.0 zeichnete der Katalog mit seinem verschachtelten core 1.5.0
 * und kommplan renderte mit dem eigenen — zwei Schriften, zwei Typstände. Das Prüfpaket muss denselben core und
 * dasselbe schema auflösen wie die Wurzel, sonst stünden die Kürzel wieder in Metriken, mit denen nicht gemessen wird.
 */
for (const name of ["@einsatzzeichen/core", "@einsatzzeichen/schema"]) {
  if (kern(ausPruefpaket, name) !== kern(hier, name)) throw new GeneratFehler(`das Prüfpaket löst ${name} anders auf als die Wurzel`);
}
const STAND = {
  conformance: version(PRUEFPAKET),
  core: version(KERN),
  schema: version(kern(hier, "@einsatzzeichen/schema")),
};

type Symbol = { viewBox: string; inhalt: string };
const runde = (v: number) => Math.round(v * 1000) / 1000;

/** Äußeres <svg> abnehmen, title/desc und font-family entfernen (die Schrift erbt vom Plan-<svg>). */
function zerlege(svg: string, schluessel: string): Symbol {
  const kopf = /^<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(svg);
  if (!kopf || !svg.endsWith("</svg>")) throw new GeneratFehler(`${schluessel}: SVG ohne erwartete Hülle`);
  const inhalt = svg
    .slice(kopf[0].length, -"</svg>".length)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, "")
    .replace(/\sfont-family="[^"]*"/g, "");
  return { viewBox: kopf[1], inhalt };
}
const praefix = (roh: string) => `kpz-${roh.replace(/[^A-Za-z0-9]/g, "-")}`;
type Zeichnung = Parameters<typeof renderSvg>[0];

/** Breite des Kürzels in Einheiten der viewBox, gemessen im Schnitt, in dem der Kern es setzt (`CATALOG_TEXT_FONT_WEIGHT`). */
const kuerzelBreite = (text: string, groesse: number) =>
  [...text].reduce((summe, c) => summe + (TEXT_FONT_METRICS.medium!.advanceEm(c.codePointAt(0)!) ?? 0.6), 0) * groesse;
/**
 * Große Kürzel im Führungszeichen (Schrift ≥ 25 Einheiten, Körper 85 von 90,7 Einheiten breit)
 * schrumpfen auf höchstens 72 Einheiten Breite: der Katalog setzt jedes Kürzel mit fester Größe,
 * „KatSL" und „UEAL" stießen links und rechts an den Rahmen (Review Phase 1).
 */
const GROSSES_KUERZEL = 25;
const KUERZEL_MAX = 72;
function kuerzelMitLuft(svg: string): string {
  return svg.replace(/<text\b([^>]*)\bfont-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g, (ganz, vor: string, g: string, nach: string, text: string) => {
    const groesse = Number(g);
    if (groesse < GROSSES_KUERZEL) return ganz;
    const passend = Math.min(groesse, (groesse * KUERZEL_MAX) / Math.max(1e-9, kuerzelBreite(text, groesse)));
    return passend === groesse ? ganz : `<text${vor}font-size="${runde(passend)}"${nach}>${text}</text>`;
  });
}

// 1. Rezepte (ohne #alternative) und Zusatzzeichen.
const zeichen: Record<string, Symbol & { titel: string; suchtext: string }> = {};
/** Dieselben Schlüssel im Druckthema (Phase 5, Entscheidung 14): Grauwerte und Strichmuster der Organisationen. */
const zeichenSw: Record<string, Symbol> = {};
for (const [abschnitt, rezept] of Object.entries(RECIPES)) {
  if (abschnitt.includes("#")) continue;
  const schluessel = `rezept:${abschnitt}`;
  const zeichnung = drawSymbol(rezept.spec, { title: rezept.title });
  const svg = kuerzelMitLuft(renderSvg(zeichnung, { size: 64, idPrefix: praefix(abschnitt) }));
  zeichen[schluessel] = {
    titel: rezept.title,
    suchtext: `${rezept.title} ${abschnitt}`.toLocaleLowerCase("de-DE"),
    ...zerlege(svg, schluessel),
  };
  zeichenSw[schluessel] = zerlege(kuerzelMitLuft(renderSvg(zeichnung, { size: 64, idPrefix: praefix(abschnitt), theme: PRINT_MONOCHROME_THEME })), schluessel);
}
const ZUSATZ = [
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", text: "EAL" },
  { schluessel: "zusatz:ea", titel: "Einsatzabschnitt", text: "EA" },
  { schluessel: "zusatz:stab", titel: "Stab", text: "Stab" },
  { schluessel: "zusatz:oel", titel: "Örtliche Einsatzleitung", text: "ÖEL" },
] as const;
/**
 * Die Zusatzzeichen entstehen aus dem Rezept „Einsatzleitung im Einsatz" (D.1.4), nur das Kürzel
 * wird getauscht. Grund: ein frei komponiertes Führungszeichen (`labels.center`) setzt der Katalog
 * 1.5.0 weiß auf Gelb und ohne den Balken „im Einsatz" — neben dem EL-Zeichen desselben Plans
 * sähe es fremd und kaum lesbar aus (Sichtprüfung Phase 1, Abweichung U2 im Umsetzungsplan).
 */
const VORLAGE_ZUSATZ = RECIPES["D.1.4"];
if (!VORLAGE_ZUSATZ) throw new GeneratFehler("Rezept D.1.4 fehlt im Katalog");
type Thema = NonNullable<NonNullable<Parameters<typeof renderSvg>[1]>["theme"]>;
function zusatzSvg(z: (typeof ZUSATZ)[number], theme: Thema | undefined): string {
  const svg = renderSvg(
    drawSymbol(VORLAGE_ZUSATZ!.spec, { title: z.titel }),
    { size: 64, idPrefix: praefix(z.schluessel), ...(theme ? { theme } : {}) },
  );
  const kuerzel = /<text\b([^>]*)\bfont-size="([\d.]+)"([^>]*)>EL<\/text>/g;
  const treffer = [...svg.matchAll(kuerzel)];
  if (treffer.length !== 1) throw new GeneratFehler(`D.1.4 trägt das Kürzel EL nicht genau einmal (${treffer.length})`);
  // Kürzel tauschen, dann wie jedes Rezept auf Luft zum Rahmen schrumpfen: längere Kürzel („Stab").
  return kuerzelMitLuft(svg.replace(kuerzel, (_, vor: string, g: string, nach: string) => `<text${vor}font-size="${g}"${nach}>${z.text}</text>`));
}
for (const z of ZUSATZ) {
  zeichen[z.schluessel] = { titel: z.titel, suchtext: `${z.titel} ${z.text}`.toLocaleLowerCase("de-DE"), ...zerlege(zusatzSvg(z, undefined), z.schluessel) };
  zeichenSw[z.schluessel] = zerlege(zusatzSvg(z, PRINT_MONOCHROME_THEME), z.schluessel);
}

/**
 * MINDESTSTRICH im Sechseck: der Katalog zeichnet jedes Piktogramm mit 1,417 Einheiten Strich in
 * seiner eigenen Box. Eingepasst in den Platz 7 × 4 mm wird ein hochformatiges Piktogramm (Draht,
 * 51 × 79 Einheiten) so klein, dass der Strich 0,07 mm dünn und fast unsichtbar war, während TMO
 * 0,2 mm trägt (Review Phase 1). Strichstärken werden deshalb so angehoben, dass jeder Strich im
 * Sechseck mindestens `MINDESTSTRICH_MM` hat — Form und Maße bleiben.
 */
const MINDESTSTRICH_MM = 0.2;
function mitMindeststrich(inhalt: string, breite: number, hoehe: number): string {
  const s = Math.min(SECHSECK.piktoBreite / breite, SECHSECK.piktoHoehe / hoehe);
  return inhalt.replace(/<[^>]*\bstroke-width="([\d.]+)"[^>]*>/g, (element, sw: string) => {
    const skala = Number(/transform="scale\(([\d.]+)\)"/.exec(element)?.[1] ?? 1);
    const mm = Number(sw) * skala * s;
    return mm >= MINDESTSTRICH_MM ? element : element.replace(/\bstroke-width="[\d.]+"/, `stroke-width="${runde((Number(sw) * MINDESTSTRICH_MM) / mm)}"`);
  });
}

// 2. Piktogramme: Katalog auf seine Box zugeschnitten, dazu fünf eigene für die Kontaktarten.
const KATALOG_PIKTOGRAMME = [
  "comms.voice-radio-tmo", "comms.voice-radio-dmo", "comms.voice-radio", "comms.cable-construction",
  "comms.telephone-exchange", "comms.fax-transmission", "comms.data-transmission", "comms.handheld-radio-terminal",
] as const;
const piktogramme: Record<string, Symbol> = {};
for (const id of KATALOG_PIKTOGRAMME) {
  const p = ALL_PICTOGRAMS.find((x) => x.id === id && x.variant === "primary");
  if (!p) throw new GeneratFehler(`Piktogramm ${id} fehlt im Katalog`);
  const svg = renderSvg({ viewBox: p.viewBox, children: p.primitives } as unknown as Zeichnung, { size: 32, idPrefix: praefix(id) });
  const roh = zerlege(svg, id);
  const f = Number(roh.viewBox.split(/\s+/)[2]) / p.viewBox.width;
  if (!Number.isFinite(f) || f <= 0) throw new GeneratFehler(`${id}: unerwartete viewBox ${roh.viewBox}`);
  const viewBox = [p.box.xMm, p.box.yMm, p.box.widthMm, p.box.heightMm].map((v) => runde(v * f));
  piktogramme[id] = { viewBox: viewBox.join(" "), inhalt: mitMindeststrich(roh.inhalt, viewBox[2], viewBox[3]) };
}
const S = 'stroke="#000" stroke-width="1.5" fill="none"';
const EIGENE: Record<string, string> = {
  // Die Raute der Excel-Vorlage: Kontur mit gefüllter Spitze.
  "kontakt.funkrufname": `<path d="M12 3 21 12 12 21 3 12Z" ${S}/><path d="M12 3 16.5 7.5H7.5Z" fill="#000"/>`,
  "kontakt.telefon": `<path d="M7 4C5.5 4 4 5.5 4 7c0 7 6 13 13 13 1.5 0 3-1.5 3-3l-3.5-2.5-2.5 2c-2.5-1-5.5-4-6.5-6.5l2-2.5Z" ${S} stroke-linejoin="round"/>`,
  "kontakt.mobil": `<rect x="7" y="2.5" width="10" height="19" rx="1.5" ${S}/><path d="M10 18.5h4" ${S}/>`,
  "kontakt.email": `<rect x="3" y="5.5" width="18" height="13" rx="1" ${S}/><path d="M3.5 6.5 12 13l8.5-6.5" ${S}/>`,
  "kontakt.sonstiges": `<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>`,
};
for (const [id, inhalt] of Object.entries(EIGENE)) piktogramme[id] = { viewBox: "0 0 24 24", inhalt };

// 3. Metriken von „Einsatzzeichen Sans" aus den JSON-Assets des Kerns (dieselbe Quelle wie TEXT_FONT_METRICS). Der Plantext
// setzt in 400 und 700; die Unterschneidung bleibt in den Klassen des Pakets — paarweise ausgeschrieben wären es rund 27 000
// Einträge je Schnitt in jedem Bündel, das den Betrachter lädt.
type MetrikDatei = {
  unitsPerEm: number; ascender: number; descender: number; notdefAdvance: number;
  advances: Record<string, number>; kerning: { left: string[]; right: string[]; values: Record<string, number>[] };
};
const lies = (datei: string) => JSON.parse(readFileSync(join(KERN, "dist/assets", datei), "utf8")) as MetrikDatei;
const normal = lies("einsatzzeichen-sans-metrics.json");
const fett = lies("einsatzzeichen-sans-bold-metrics.json");
for (const k of ["unitsPerEm", "ascender", "descender"] as const) {
  if (normal[k] !== fett[k]) throw new GeneratFehler(`normal und fett haben verschiedene ${k}`);
}
const sortiert = <T,>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort((a, b) => Number(a) - Number(b)).map((k) => [k, o[k]]));
const schnitt = (m: MetrikDatei) => ({
  vorschub: sortiert(m.advances),
  unterschneidung: { links: m.kerning.left, rechts: m.kerning.right, werte: m.kerning.values.map(sortiert) },
});
const metrik = {
  einheitenProEm: normal.unitsPerEm,
  aufstieg: normal.ascender,
  abstieg: -normal.descender,
  ersatz: normal.advances["65533"] ?? normal.notdefAdvance,
  normal: schnitt(normal),
  fett: schnitt(fett),
};

// 4. Schreiben — sortiert, ohne Datum, atomar (Zwischendatei im selben Ordner, dann rename).
const nachSchluessel = <T,>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
function schreibe(datei: string, wert: unknown): void {
  const pfad = join(ZIEL, datei);
  writeFileSync(`${pfad}.tmp`, `${JSON.stringify(wert)}\n`, "utf8");
  renameSync(`${pfad}.tmp`, pfad);
}
mkdirSync(ZIEL, { recursive: true });
schreibe("zeichen.generiert.json", { stand: STAND, zeichen: nachSchluessel(zeichen) });
schreibe("zeichen-sw.generiert.json", { stand: STAND, zeichen: nachSchluessel(zeichenSw) });
// Die Schrift für den SVG-Export (Phase 5, Entscheidung 15): dieselben drei WOFF2 wie im Browser (`_ui/schrift.ts`),
// als Base64, damit sie gebündelt wird — unter `output: "standalone"` liegt `node_modules` zur Laufzeit nicht vollständig
// vor. Gelesen nur beim Klick (`SvgHerunterladen`).
const coreSchrift = (stufe: "regular" | "medium" | "bold") => readFileSync(hier.resolve(`@einsatzzeichen/core/fonts/text-${stufe}.woff2`)).toString("base64");
schreibe("schrift.generiert.json", { stand: STAND, regular: coreSchrift("regular"), mittel: coreSchrift("medium"), fett: coreSchrift("bold") });
schreibe("grundlagen.generiert.json", { stand: STAND, metrik, piktogramme: nachSchluessel(piktogramme) });

console.log(`${ZIEL}: ${Object.keys(zeichen).length} Zeichen, ${Object.keys(piktogramme).length} Piktogramme, Stand ${JSON.stringify(STAND)}`);
