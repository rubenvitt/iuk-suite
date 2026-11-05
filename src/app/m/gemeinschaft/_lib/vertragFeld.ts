import { z } from "zod";

/**
 * Die Felder einer Vorlage (IDA-343, IDA-354): je Feld eine Seite (ab 0) und ein Rechteck in PDF-Punkten, Ursprung
 * unten links wie in der PDF selbst. Ohne Datenbank- und Node-Import, damit Verwaltung und Ausfüllseite im Browser
 * damit rechnen.
 *
 * `quelle`: `formular` = beim Hochladen in der PDF gefundenes Formularfeld (AcroForm, `formular` ist sein Name in der
 * PDF), `gezogen` = von der Leitung auf der Seite aufgezogen. `art`: Text, Ankreuzen oder Unterschrift; nur eine
 * Unterschrift hat eine `rolle` — wer dort unterschreibt (Leitung oder die mietende Person).
 */
export type Rect = { seite: number; x: number; y: number; b: number; h: number };
/** Nur das Rechteck: so hieß das eine Unterschriftenfeld aus IDA-343. */
export type Feld = Rect;
export type Seitenmass = { b: number; h: number };
export type FeldArt = "text" | "ankreuz" | "unterschrift";
export type Rolle = "leitung" | "mieter";
export type Vertragsfeld = Rect & { id: string; art: FeldArt; name: string; quelle: "formular" | "gezogen"; formular?: string; rolle?: Rolle };

/** Werte der Leitung je Feld-ID: Text oder Haken. */
export type Werte = Record<string, string | boolean>;

export const FELDARTEN: { value: FeldArt; label: string }[] = [
  { value: "text", label: "Text" }, { value: "ankreuz", label: "Ankreuzen" }, { value: "unterschrift", label: "Unterschrift" },
];
export const ROLLEN: { value: Rolle; label: string }[] = [{ value: "leitung", label: "Leitung" }, { value: "mieter", label: "Mietende Person" }];

/** Kleiner geht nicht sinnvoll: eine Unterschrift ≈ 2 × 0,7 cm, Text und Haken ≈ 3 mm. */
export const FELD_MIN: Record<FeldArt, { b: number; h: number }> = { unterschrift: { b: 56, h: 20 }, text: { b: 8, h: 8 }, ankreuz: { b: 6, h: 6 } };
export const FELDER_MAX = 200;
export const TEXT_MAX = 2000;
const NAME_MAX = 80;

const zahl = z.number().finite();
export const rectSchema = z.object({ seite: z.number().int().min(0).max(999), x: zahl, y: zahl, b: zahl, h: zahl }).strict();
const idSchema = z.string().regex(/^(f|g):[\p{L}\p{N} ._\-[\]()#/]{1,120}$/u);
export const vertragsfeldSchema = rectSchema.extend({
  id: idSchema,
  art: z.enum(["text", "ankreuz", "unterschrift"]),
  name: z.string().trim().min(1).max(NAME_MAX),
  quelle: z.enum(["formular", "gezogen"]),
  formular: z.string().min(1).max(200).optional(),
  rolle: z.enum(["leitung", "mieter"]).optional(),
}).strict();

const rund = (n: number) => Math.round(n * 10) / 10;

/** Das Rechteck liegt ganz auf der Seite und ist groß genug — sonst `null`. */
export function pruefeRect(f: Rect, seiten: readonly Seitenmass[], min: { b: number; h: number }): Rect | null {
  const s = seiten[f.seite];
  if (!s) return null;
  if (f.b < min.b || f.h < min.h) return null;
  if (f.x < -0.5 || f.y < -0.5 || f.x + f.b > s.b + 0.5 || f.y + f.h > s.h + 0.5) return null;
  return { seite: f.seite, x: rund(Math.max(0, f.x)), y: rund(Math.max(0, f.y)), b: rund(f.b), h: rund(f.h) };
}

/**
 * Die Feldliste, die die Verwaltung speichern will, gegen die echte PDF: Formularfelder nur, wenn die PDF sie hat
 * (Lage und Art kommen aus der PDF, die Leitung ändert nur Name und Rolle), aufgezogene Felder auf der Seite und groß
 * genug, IDs eindeutig, jede Unterschrift mit Rolle. `null` = ungültig.
 */
export function pruefeFelder(roh: unknown, seiten: readonly Seitenmass[], formular: readonly Vertragsfeld[]): Vertragsfeld[] | null {
  const p = z.array(vertragsfeldSchema).max(FELDER_MAX).safeParse(roh);
  if (!p.success) return null;
  const ids = new Set<string>();
  const aus: Vertragsfeld[] = [];
  for (const f of p.data) {
    if (ids.has(f.id)) return null;
    ids.add(f.id);
    if (f.quelle === "formular") {
      const echt = formular.find((x) => x.id === f.id);
      if (!echt) return null;
      aus.push({ ...echt, name: f.name, ...(echt.art === "unterschrift" ? { rolle: f.rolle ?? "mieter" } : {}) });
      continue;
    }
    if (!f.id.startsWith("g:") || f.formular !== undefined) return null;
    const r = pruefeRect(f, seiten, FELD_MIN[f.art]);
    if (!r) return null;
    if (f.art === "unterschrift" && !f.rolle) return null;
    aus.push({ id: f.id, art: f.art, name: f.name, quelle: "gezogen", ...r, ...(f.art === "unterschrift" ? { rolle: f.rolle } : {}) });
  }
  return aus;
}

/** Gespeichertes JSON zurück in eine Feldliste; Unlesbares wird weggelassen. */
export function felderAusJson(roh: string | null): Vertragsfeld[] {
  if (!roh) return [];
  try {
    const liste = JSON.parse(roh) as unknown;
    if (!Array.isArray(liste)) return [];
    return liste.flatMap((f) => { const p = vertragsfeldSchema.safeParse(f); return p.success ? [p.data] : []; });
  } catch {
    return [];
  }
}

/** Gespeicherte Werte zurück; nur Text oder Haken, Text gekappt. */
export function werteAusJson(roh: string | null): Werte {
  if (!roh) return {};
  try {
    const o = JSON.parse(roh) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const aus: Werte = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "boolean") aus[k] = v;
      else if (typeof v === "string") aus[k] = v.slice(0, TEXT_MAX);
    }
    return aus;
  } catch {
    return {};
  }
}

/** Werte der Leitung gegen die Felder des Dokuments: nur Text- und Ankreuzfelder, Typ passend, leere weg. */
export function pruefeWerte(roh: unknown, felder: readonly Vertragsfeld[]): Werte | null {
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
  const aus: Werte = {};
  for (const [id, v] of Object.entries(roh as Record<string, unknown>)) {
    const f = felder.find((x) => x.id === id);
    if (!f || f.art === "unterschrift") return null;
    if (f.art === "text") {
      if (typeof v !== "string" || v.length > TEXT_MAX) return null;
      if (v.trim() !== "") aus[id] = v.replace(/\r\n?/g, "\n");
    } else {
      if (typeof v !== "boolean") return null;
      if (v) aus[id] = true;
    }
  }
  return aus;
}

/** Die Unterschriftenfelder einer Rolle. */
export const unterschriftfelder = (felder: readonly Vertragsfeld[], rolle: Rolle) => felder.filter((f) => f.art === "unterschrift" && f.rolle === rolle);

/**
 * Hat ein Dokument kein Unterschriftenfeld für die mietende Person, unterschreibt sie auf einer eigenen letzten Seite
 * (wie in IDA-343 ohne Feld); das ist dieses gedachte Feld.
 */
export const EIGENE_SEITE = "g:eigene-seite";

/** Die Felder, in denen die mietende Person unterschreibt: ihre Unterschriftenfelder, sonst die eigene Seite. */
export const mieterFeldIds = (felder: readonly Vertragsfeld[]): string[] => {
  const ids = unterschriftfelder(felder, "mieter").map((f) => f.id);
  return ids.length ? ids : [EIGENE_SEITE];
};

/** Eine neue ID für ein aufgezogenes Feld. */
export const neueFeldId = () => `g:${Math.random().toString(36).slice(2, 10)}`;

/**
 * Bildschirm → PDF: ein auf der gerenderten Seite aufgezogenes Rechteck (Pixel, Ursprung oben links, `massstab` =
 * Pixel je Punkt) in PDF-Punkte. Gekappt auf die Seite, damit ein Zug über den Rand nicht verloren geht.
 */
export function feldAusPixeln(seite: number, px: { x1: number; y1: number; x2: number; y2: number }, massstab: number, mass: Seitenmass): Rect {
  const links = Math.max(0, Math.min(px.x1, px.x2) / massstab);
  const rechts = Math.min(mass.b, Math.max(px.x1, px.x2) / massstab);
  const oben = Math.max(0, Math.min(px.y1, px.y2) / massstab);
  const unten = Math.min(mass.h, Math.max(px.y1, px.y2) / massstab);
  return { seite, x: rund(links), y: rund(mass.h - unten), b: rund(rechts - links), h: rund(unten - oben) };
}

/** PDF → Bildschirm, für das Anzeigen eines gespeicherten Felds über der gerenderten Seite. */
export function feldInPixeln(f: Rect, massstab: number, mass: Seitenmass): { links: number; oben: number; breite: number; hoehe: number } {
  return { links: f.x * massstab, oben: (mass.h - f.y - f.h) * massstab, breite: f.b * massstab, hoehe: f.h * massstab };
}
