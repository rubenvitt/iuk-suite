/**
 * Anlegen, Ändern und Entfernen der Qualifikationen (IDA-282). Anders als die übrigen Stammdaten
 * lässt sich eine Qualifikation entfernen, aber nur, solange niemand im Personal sie trägt (auch
 * kein deaktivierter Eintrag): `person.quali` ist eine Kurzform ohne Fremdschlüssel.
 *
 * Eine geänderte Kurzform zieht in derselben Transaktion das Personal und die Zuordnung aus HiOrg
 * mit. Das Personal-Update zählt über die Trigger `stand_person_*` den Stammdatenstand hoch, die
 * App holt also das neue Kürzel; versiegelte Einsätze behalten ihren Schnappschuss.
 */
import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { person, qualifikation } from "../../_db/schema";
import { NichtGefunden, QualiFehler, eindeutig, type Db } from "./daten";
import { zieheRegelnNach } from "./qualiZuordnung";
import type { QualifikationEingabe } from "./schemas";
import type { QualifikationDTO } from "./typen";

export { listeQualifikationen } from "./daten";

export function speichereQualifikation(db: Db, id: string | null, e: QualifikationEingabe): QualifikationDTO {
  return eindeutig("kurz", () => db.transaction(() => {
    if (id === null) return db.insert(qualifikation).values({ id: nanoid(), ...e }).returning().get();
    const alt = db.select().from(qualifikation).where(eq(qualifikation.id, id)).get();
    if (!alt) throw new NichtGefunden();
    const neu = db.update(qualifikation).set(e).where(eq(qualifikation.id, id)).returning().get()!;
    if (alt.kurz !== neu.kurz) {
      db.update(person).set({ quali: neu.kurz }).where(eq(person.quali, alt.kurz)).run();
      zieheRegelnNach(db, alt.kurz, neu.kurz);
    }
    return neu;
  }));
}

export function entferneQualifikation(db: Db, id: string): void {
  db.transaction(() => {
    const q = db.select().from(qualifikation).where(eq(qualifikation.id, id)).get();
    if (!q) throw new NichtGefunden();
    const n = db.select({ n: count() }).from(person).where(eq(person.quali, q.kurz)).get()?.n ?? 0;
    if (n > 0) {
      throw new QualiFehler(`${n === 1 ? "Eine Person trägt" : `${n} Personen tragen`} „${q.kurz}“, auch deaktivierte zählen. Bitte erst umstellen, dann entfernen.`);
    }
    db.delete(qualifikation).where(eq(qualifikation.id, id)).run();
    zieheRegelnNach(db, q.kurz, null);
  });
}
