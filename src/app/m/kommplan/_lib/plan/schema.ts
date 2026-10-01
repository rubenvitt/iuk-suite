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
/**
 * Feldgrenzen — dieselben Zahlen im Schema und an den Eingabefeldern des Editors (`maxLength`),
 * damit Tippen nie in einen Schemafehler läuft (Review Focus Phase 2, Punkt 2).
 */
export const LAENGE = { titel: 200, leiter: 120, kontakt: 200, typ: 40, rufname: 80, bezeichnung: 60 } as const;
/**
 * `bytes`: GESAMTGRENZE des Dokuments (Umsetzungsplan Phase 2, Entscheidung 15). Nach den Feldgrenzen
 * allein wären rund 9 MB möglich, eine Server Action nimmt aber höchstens 1 MB an — und ein
 * abgelehnter Aufruf sähe im Editor aus wie ein Netzfehler. 800 000 Byte UTF-8 lassen Luft für die
 * Kodierung des Aufrufs. Kosten: ein `JSON.stringify` je Prüfung, neben dem vollen `safeParse`.
 */
export const GRENZE = { stellen: 500, verbindungen: 200, kontakte: 30, einheiten: 60, kanaele: 12, ebenen: 15, bytes: 800_000 } as const;
export const ZU_GROSS = "Der Plan ist zu groß zum Speichern. Teile ihn auf mehrere Pläne auf.";
/**
 * `ebenen` (Abnahme kommplan, Befund „Token-Druck blockiert"): die Aufteilung aufs Papier zeichnet je Probe den
 * ganzen Teilbaum, und eine tiefe Kette kostet je Zeichnung quadratisch in der Tiefe — 500 Ebenen hielten den
 * Suite-Prozess minutenlang fest. Echte Pläne haben selten mehr als acht. Seitenstellen zählen als eigene Ebene.
 */
export const ZU_TIEF = `Höchstens ${GRENZE.ebenen} Ebenen je Plan. Teile ihn auf mehrere Pläne auf.`;
export const inhaltBytes = (inhalt: unknown): number => new TextEncoder().encode(JSON.stringify(inhalt)).length;

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const zeichenSchluessel = z.string().min(1).max(80).nullable();

export const kontaktSchema = z.object({ art: z.enum(KONTAKT_ARTEN), wert: z.string().max(LAENGE.kontakt) }).strict();
export const einheitSchema = z.object({ id, typ: z.string().max(LAENGE.typ), rufname: z.string().max(LAENGE.rufname), zeichen: zeichenSchluessel }).strict();
export const stelleSchema = z.object({
  id,
  eltern: id.nullable(),
  lage: z.enum(LAGEN),
  reihenfolge: z.number(),
  zeichen: zeichenSchluessel,
  titel: z.string().max(LAENGE.titel),
  leiter: z.string().max(LAENGE.leiter).nullable(),
  hervorheben: z.boolean(),
  verbindungId: id.nullable(),
  /** Kanäle, die die Stelle benutzt, ohne Gegenstelle (Abweichung 12) — Sechsecke unter der Karte. */
  kanaele: z.array(id).max(GRENZE.kanaele).default([]),
  kontakte: z.array(kontaktSchema).max(GRENZE.kontakte),
  einheiten: z.array(einheitSchema).max(GRENZE.einheiten),
}).strict();
export const verbindungSchema = z.object({ id, art: z.enum(VERBINDUNGS_ARTEN), bezeichnung: z.string().max(LAENGE.bezeichnung) }).strict();
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
  let zuTief = false;
  for (const s of p.stellen) {
    const gesehen = new Set<string>([s.id]);
    let eltern = s.eltern === null ? undefined : stellen.get(s.eltern);
    while (eltern) {
      if (gesehen.has(eltern.id)) { melde(["stellen"], `Zyklus über ${s.id}`); break; }
      gesehen.add(eltern.id);
      eltern = eltern.eltern === null ? undefined : stellen.get(eltern.eltern);
    }
    if (!zuTief && gesehen.size > GRENZE.ebenen) { zuTief = true; melde(["stellen"], ZU_TIEF); }
  }
}

function pruefeGroesse(p: unknown, ctx: z.RefinementCtx): void {
  if (inhaltBytes(p) > GRENZE.bytes) ctx.addIssue({ code: "custom", path: [], message: ZU_GROSS });
}

export const planInhaltSchema = z.object({
  schema: z.literal(1),
  optionen: optionenSchema,
  stellen: z.array(stelleSchema).max(GRENZE.stellen),
  verbindungen: z.array(verbindungSchema).max(GRENZE.verbindungen),
}).strict().superRefine(pruefeInvarianten).superRefine(pruefeGroesse);

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
