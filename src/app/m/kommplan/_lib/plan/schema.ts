import { z } from "zod";

/**
 * DAS PLANDOKUMENT (Spec §4.2) — ein Plan ist EIN JSON-Dokument. Die Invarianten prüft
 * `superRefine` beim Speichern und beim Lesen; eine verletzte Invariante ist nie ein HTTP 500,
 * sondern `leseInhalt(...).ok === false`.
 *
 * EIN NAMENSRAUM FÜR ALLE IDs: Stellen, Einheiten und Verbindungen teilen sich die Eindeutigkeit.
 * Das hält Verweise (Einklappen, Auswahl, Rückgängig) eindeutig, ohne einen Typ mitzuführen.
 */
export const KONTAKT_ARTEN = ["funkrufname", "digitalfunk", "telefon", "mobil", "fax", "email", "sonstiges"] as const;
export const VERBINDUNGS_ARTEN = ["tmo", "dmo", "analogfunk", "draht", "telefon", "mobil", "fax", "daten"] as const;
export const LAGEN = ["unter", "links", "rechts"] as const;
export type KontaktArt = (typeof KONTAKT_ARTEN)[number];
export type VerbindungsArt = (typeof VERBINDUNGS_ARTEN)[number];
export type Lage = (typeof LAGEN)[number];

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const zeichenSchluessel = z.string().min(1).max(80).nullable();

export const kontaktSchema = z.object({ art: z.enum(KONTAKT_ARTEN), wert: z.string().max(200) }).strict();
export const einheitSchema = z.object({ id, typ: z.string().max(40), rufname: z.string().max(80), zeichen: zeichenSchluessel }).strict();
export const stelleSchema = z.object({
  id,
  eltern: id.nullable(),
  lage: z.enum(LAGEN),
  reihenfolge: z.number(),
  zeichen: zeichenSchluessel,
  titel: z.string().max(200),
  leiter: z.string().max(120).nullable(),
  hervorheben: z.boolean(),
  verbindungId: id.nullable(),
  /** Kanäle, die die Stelle benutzt, ohne Gegenstelle (Abweichung 12) — Sechsecke unter der Karte. */
  kanaele: z.array(id).max(12).default([]),
  kontakte: z.array(kontaktSchema).max(30),
  einheiten: z.array(einheitSchema).max(60),
}).strict();
export const verbindungSchema = z.object({ id, art: z.enum(VERBINDUNGS_ARTEN), bezeichnung: z.string().max(60) }).strict();
export const optionenSchema = z.object({
  leerzeilen: z.boolean(), vermerkVsNfD: z.boolean(), qrAufDruck: z.boolean(), schwarzweiss: z.boolean(),
}).strict();

type Roh = {
  stellen: z.infer<typeof stelleSchema>[];
  verbindungen: z.infer<typeof verbindungSchema>[];
};

function pruefeInvarianten(p: Roh, ctx: z.RefinementCtx): void {
  const melde = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const ids = new Set<string>();
  const merke = (wert: string, path: (string | number)[]) => {
    if (ids.has(wert)) melde(path, `ID doppelt: ${wert}`);
    ids.add(wert);
  };
  p.stellen.forEach((s, i) => {
    merke(s.id, ["stellen", i, "id"]);
    s.einheiten.forEach((e, j) => merke(e.id, ["stellen", i, "einheiten", j, "id"]));
  });
  p.verbindungen.forEach((v, i) => merke(v.id, ["verbindungen", i, "id"]));

  const stellen = new Map(p.stellen.map((s) => [s.id, s]));
  const verbindungen = new Set(p.verbindungen.map((v) => v.id));
  p.stellen.forEach((s, i) => {
    if (s.eltern !== null && !stellen.has(s.eltern)) melde(["stellen", i, "eltern"], `Elternstelle ${s.eltern} existiert nicht`);
    if (s.lage !== "unter" && s.eltern === null) melde(["stellen", i, "lage"], "Eine Seitenstelle braucht eine Elternstelle");
    const eltern = s.eltern === null ? undefined : stellen.get(s.eltern);
    if (eltern && eltern.lage !== "unter") melde(["stellen", i, "eltern"], `Seitenstelle ${eltern.id} kann keine Stellen tragen`);
    if (s.verbindungId !== null && !verbindungen.has(s.verbindungId)) {
      melde(["stellen", i, "verbindungId"], `Verbindung ${s.verbindungId} existiert nicht`);
    }
    const kanaele = new Set<string>();
    s.kanaele.forEach((k, j) => {
      if (!verbindungen.has(k)) melde(["stellen", i, "kanaele", j], `Kanal ${k} existiert nicht`);
      if (kanaele.has(k)) melde(["stellen", i, "kanaele", j], `Kanal ${k} doppelt an ${s.id}`);
      kanaele.add(k);
    });
  });
  for (const s of p.stellen) {
    const gesehen = new Set<string>([s.id]);
    let eltern = s.eltern === null ? undefined : stellen.get(s.eltern);
    while (eltern) {
      if (gesehen.has(eltern.id)) { melde(["stellen"], `Zyklus über ${s.id}`); break; }
      gesehen.add(eltern.id);
      eltern = eltern.eltern === null ? undefined : stellen.get(eltern.eltern);
    }
  }
}

export const planInhaltSchema = z.object({
  schema: z.literal(1),
  optionen: optionenSchema,
  stellen: z.array(stelleSchema).max(500),
  verbindungen: z.array(verbindungSchema).max(200),
}).strict().superRefine(pruefeInvarianten);

export type Kontakt = z.infer<typeof kontaktSchema>;
export type Einheit = z.infer<typeof einheitSchema>;
export type Stelle = z.infer<typeof stelleSchema>;
export type Verbindung = z.infer<typeof verbindungSchema>;
export type PlanOptionen = z.infer<typeof optionenSchema>;
export type PlanInhalt = z.infer<typeof planInhaltSchema>;

export function leseInhalt(roh: unknown): { ok: true; inhalt: PlanInhalt } | { ok: false; fehler: string } {
  const r = planInhaltSchema.safeParse(roh);
  return r.success ? { ok: true, inhalt: r.data } : { ok: false, fehler: r.error.issues.map((i) => i.message).join("; ") };
}

/** Anzeigenamen der Verbindungsarten (Legende, Phase 2: Auswahl im Flyin). */
export const ART_NAME: Record<VerbindungsArt, string> = {
  tmo: "Digitalfunk TMO", dmo: "Digitalfunk DMO", analogfunk: "Analogfunk", draht: "Draht",
  telefon: "Telefon", mobil: "Mobilfunk", fax: "Fax", daten: "Datenverbindung",
};
