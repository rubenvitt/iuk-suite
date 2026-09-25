/**
 * Anker (Spec §12): Die App meldet den Hash jedes versiegelten Blocks. Der erste gemeldete Hash
 * je Rechner und Block gilt; eine spätere abweichende Meldung ändert ihn nicht, sondern landet
 * als Abweichung in `anker_abweichung` (auditiert) — ein Hinweis auf eine veränderte Kette.
 * Je Rechner, Block und gemeldetem Hash entsteht höchstens eine Abweichungszeile.
 */
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { anker, ankerAbweichung, rechner } from "../../_db/schema";
import type { RechnerZeile } from "./geraet";
import type { Db } from "../stammdaten/daten";

export function meldeAnker(db: Db, rechnerId: string, block: number, hash: string, jetzt: Date): { ok: true } | { ok: false; erwartet: string } {
  return db.transaction((tx) => {
    const da = tx.select({ hash: anker.hash }).from(anker).where(and(eq(anker.rechnerId, rechnerId), eq(anker.block, block))).get();
    if (!da) {
      tx.insert(anker).values({ rechnerId, block, hash, gemeldetAm: jetzt }).run();
      return { ok: true } as const;
    }
    if (da.hash === hash) return { ok: true } as const;
    // Die App meldet einen strittigen Block nach jeder Versiegelung, stündlich und bei „Kette
    // prüfen" erneut. Dieselbe Abweichung ist schon protokolliert; nur ein neuer Hash ist neu.
    const bekannt = tx.select({ id: ankerAbweichung.id }).from(ankerAbweichung)
      .where(and(eq(ankerAbweichung.rechnerId, rechnerId), eq(ankerAbweichung.block, block), eq(ankerAbweichung.gemeldet, hash))).get();
    if (!bekannt) tx.insert(ankerAbweichung).values({ id: nanoid(), rechnerId, block, erwartet: da.hash, gemeldet: hash, zeitpunkt: jetzt }).run();
    return { ok: false, erwartet: da.hash } as const;
  });
}

export type Kettenanker = { block: number; hash: string };

/**
 * Der höchste Suite-Anker der Kette, zu der `r` gehört (`GET /api/anker`, Entscheidung 5): für
 * einen echten Rechner über alle Rechner mit `art = 'echt'`, auch widerrufene — ein frisch
 * eingerichteter echter Rechner hat noch keine eigenen Anker, und ein widerrufener trägt echte
 * Blöcke, die die Wiederherstellung in Stufe 6 lesen können muss. Für einen Test-Rechner nur
 * seine eigenen. Tragen zwei echte Rechner für den höchsten Block verschiedene Hashes, ist die
 * Kette mehrdeutig (`{ ok: false }`; die Route antwortet `409 anker_mehrdeutig`).
 */
export function kettenanker(db: Db, r: RechnerZeile): { ok: true; anker: Kettenanker | null } | { ok: false } {
  const zeilen = r.art === "echt"
    ? db.select({ block: anker.block, hash: anker.hash }).from(anker)
        .innerJoin(rechner, eq(anker.rechnerId, rechner.id))
        .where(eq(rechner.art, "echt")).all()
    : db.select({ block: anker.block, hash: anker.hash }).from(anker)
        .where(eq(anker.rechnerId, r.id)).all();
  if (zeilen.length === 0) return { ok: true, anker: null };
  const hoechsterBlock = Math.max(...zeilen.map((z) => z.block));
  const hashes = [...new Set(zeilen.filter((z) => z.block === hoechsterBlock).map((z) => z.hash))];
  if (hashes.length > 1) return { ok: false };
  return { ok: true, anker: { block: hoechsterBlock, hash: hashes[0] } };
}
