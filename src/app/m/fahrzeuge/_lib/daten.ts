/**
 * Lesen und Pflegen des Bestands. Gelöscht wird nicht: ein Fahrzeug, das ausgemustert ist, wird
 * deaktiviert — andere Apps verweisen auf seine Kennung, und versiegelte Einsätze tragen sie.
 */
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { FahrzeugeDb, FahrzeugeSchreiber } from "../_db/client";
import { stammfahrzeug } from "../_db/schema";
import type { Art, FahrzeugEingabe } from "./eingabe";

export interface FahrzeugDTO {
  id: string;
  art: Art;
  typ: string;
  funkrufname: string;
  funkkenner: string | null;
  kennzeichen: string | null;
  standort: string;
  bemerkung: string | null;
  aktiv: boolean;
  aktualisiertAm: string;
}

export class NichtGefunden extends Error {
  constructor() {
    super("Dieses Fahrzeug gibt es nicht mehr.");
  }
}

/** Ein eindeutiges Feld ist schon an ein anderes Fahrzeug vergeben. */
export class SchonVergeben extends Error {
  constructor(readonly feld: "funkkenner" | "kennzeichen") {
    super(feld === "funkkenner" ? "Diesen Funkkenner hat schon ein anderes Fahrzeug." : "Dieses Kennzeichen hat schon ein anderes Fahrzeug.");
  }
}

/** Übersetzt den `UNIQUE constraint failed`-Fehler von better-sqlite3 in `SchonVergeben` — mit dem Feld aus der Meldung. */
function eindeutig<T>(schreiben: () => T): T {
  try {
    return schreiben();
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed: stammfahrzeug\.funkkenner/.test(e.message)) throw new SchonVergeben("funkkenner");
    if (e instanceof Error && /UNIQUE constraint failed: stammfahrzeug\.kennzeichen/.test(e.message)) throw new SchonVergeben("kennzeichen");
    throw e;
  }
}

type Zeile = typeof stammfahrzeug.$inferSelect;
const alsDTO = (z: Zeile): FahrzeugDTO => ({
  id: z.id, art: z.art, typ: z.typ, funkrufname: z.funkrufname, funkkenner: z.funkkenner, kennzeichen: z.kennzeichen,
  standort: z.standort, bemerkung: z.bemerkung, aktiv: z.aktiv, aktualisiertAm: z.aktualisiertAm.toISOString(),
});

/** Nach Standort, dann Funkkenner (numerisch, „11-83-2“ vor „11-83-10“), dann Funkrufname. */
export function listeFahrzeuge(db: FahrzeugeDb): FahrzeugDTO[] {
  const sortierer = new Intl.Collator("de", { numeric: true });
  return db.select().from(stammfahrzeug).orderBy(asc(stammfahrzeug.standort)).all().map(alsDTO).sort((a, b) =>
    sortierer.compare(a.standort, b.standort)
    || sortierer.compare(a.funkkenner ?? "\uffff", b.funkkenner ?? "\uffff")
    || sortierer.compare(a.funkrufname, b.funkrufname));
}

/** Legt an (`id === null`) oder ändert. `aktualisiertAm` rückt nur vor, wenn sich ein Wert ändert. */
export function speichereFahrzeug(db: FahrzeugeSchreiber, id: string | null, e: FahrzeugEingabe, jetzt = new Date()): FahrzeugDTO {
  return eindeutig(() => {
    if (id === null) {
      return alsDTO(db.insert(stammfahrzeug).values({ id: nanoid(), ...e, angelegtAm: jetzt, aktualisiertAm: jetzt }).returning().get());
    }
    const alt = db.select().from(stammfahrzeug).where(eq(stammfahrzeug.id, id)).get();
    if (!alt) throw new NichtGefunden();
    const gleich = (Object.keys(e) as (keyof FahrzeugEingabe)[]).every((k) => alt[k] === e[k]);
    if (gleich) return alsDTO(alt);
    return alsDTO(db.update(stammfahrzeug).set({ ...e, aktualisiertAm: jetzt }).where(eq(stammfahrzeug.id, id)).returning().get());
  });
}

export function setzeAktiv(db: FahrzeugeDb, id: string, aktiv: boolean, jetzt = new Date()): void {
  const z = db.update(stammfahrzeug).set({ aktiv, aktualisiertAm: jetzt }).where(eq(stammfahrzeug.id, id)).returning({ id: stammfahrzeug.id }).get();
  if (!z) throw new NichtGefunden();
}
