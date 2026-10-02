import type { KommplanDb } from "../_db/client";
import { bibEinheit, bibStelle, bibVerbindung, briefkopf, plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag kommplan). Idempotent pro
 * Entität über feste IDs und `onConflictDoNothing`, additiv (ändert nichts Vorhandenes).
 */
export async function seedLokalKommplan(db: KommplanDb): Promise<string[]> {
  const zaehle = (r: { changes: number }[]) => r.reduce((n, x) => n + x.changes, 0);
  const plaene = zaehle(BEISPIELE.map((b) => db.insert(plan).values({
    id: b.id, titel: b.titel, typ: b.typ, anlass: b.anlass,
    datum: b.datum === null ? null : new Date(`${b.datum}T00:00:00.000Z`),
    istVorlage: b.istVorlage, erstelltAm: new Date(b.stand), aktualisiertAm: new Date(b.stand), aktualisiertVon: b.bearbeiter,
    inhalt: JSON.stringify(b.inhalt),
  }).onConflictDoNothing().run()));
  const stellen = zaehle([db.insert(bibStelle).values({
    id: "bib-lts-uelzen", titel: "Leitstelle Uelzen",
    kontakte: JSON.stringify([{ art: "telefon", wert: "0581 / 82 266" }, { art: "fax", wert: "0581 / 82 284" }, { art: "email", wert: "fel@landkreis-uelzen.de" }]),
  }).onConflictDoNothing().run()]);
  const einheiten = zaehle(["RTW|RK UE 40-83-5", "KTW|RK UE 40-92-1", "MTW|RK UE 40-17-1"].map((x, i) => {
    const [typ, rufname] = x.split("|");
    return db.insert(bibEinheit).values({ id: `bib-einheit-${i + 1}`, typ, rufname }).onConflictDoNothing().run();
  }));
  const verbindungen = zaehle(["R_UE_1", "R_UE_2", "R_UE_3"].map((bezeichnung, i) =>
    db.insert(bibVerbindung).values({ id: `bib-verbindung-${i + 1}`, art: "tmo", bezeichnung }).onConflictDoNothing().run()));
  // Briefkopf (Spec §4.4, Entscheidung 6): ein NEUTRALER Name für die lokale Ansicht, nie ein Logo und nie
  // eine echte Organisation — das trägt der Betrieb unter „Einstellungen" ein.
  const kopf = db.insert(briefkopf).values({ id: 1, organisation: "Musterorganisation", aktualisiertAm: new Date(0), aktualisiertVon: "Seed" }).onConflictDoNothing().run().changes;
  return [`kommplan: ${plaene} Pläne angelegt, Bibliothek ${stellen} Stellen, ${einheiten} Einheiten, ${verbindungen} Verbindungen, Briefkopf ${kopf}`];
}
