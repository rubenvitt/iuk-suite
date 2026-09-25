/**
 * Anker (Spec §12): Die App meldet den Hash jedes versiegelten Blocks. Der erste gemeldete Hash
 * je Rechner und Block gilt; eine spätere abweichende Meldung ändert ihn nicht, sondern landet
 * als Abweichung in `anker_abweichung` (auditiert) — ein Hinweis auf eine veränderte Kette.
 */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { anker, ankerAbweichung } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";

export function meldeAnker(db: Db, rechnerId: string, block: number, hash: string, jetzt: Date): { ok: true } | { ok: false; erwartet: string } {
  return db.transaction((tx) => {
    const da = tx.select({ hash: anker.hash }).from(anker).where(and(eq(anker.rechnerId, rechnerId), eq(anker.block, block))).get();
    if (!da) {
      tx.insert(anker).values({ rechnerId, block, hash, gemeldetAm: jetzt }).run();
      return { ok: true } as const;
    }
    if (da.hash === hash) return { ok: true } as const;
    tx.insert(ankerAbweichung).values({ id: nanoid(), rechnerId, block, erwartet: da.hash, gemeldet: hash, zeitpunkt: jetzt }).run();
    return { ok: false, erwartet: da.hash } as const;
  });
}
