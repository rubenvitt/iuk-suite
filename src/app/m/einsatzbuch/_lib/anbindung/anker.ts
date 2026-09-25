/**
 * Anker (Spec §12): Die App meldet den Hash jedes versiegelten Blocks. Der erste gemeldete Hash
 * je Rechner und Block gilt; eine spätere abweichende Meldung ändert ihn nicht, sondern landet
 * als Abweichung in `anker_abweichung` (auditiert) — ein Hinweis auf eine veränderte Kette.
 * Je Rechner, Block und gemeldetem Hash entsteht höchstens eine Abweichungszeile.
 */
import { and, eq, inArray } from "drizzle-orm";
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
 * Der höchste Suite-Anker der Kette, deren Block 1 den Hash `erster` trägt (`GET /api/anker`,
 * Entscheidung 5, ergänzt um die Kettenidentität). Mitglied der Kette ist ein Rechner, dessen
 * Anker für Block 1 genau `erster` ist:
 * - für einen echten Rechner jeder Rechner mit `art = 'echt'`, auch widerrufene — ein frisch
 *   eingerichteter echter Rechner hat noch keine eigenen Anker, und ein widerrufener trägt echte
 *   Blöcke, die die Wiederherstellung lesen können muss;
 * - für einen Test-Rechner nur er selbst.
 *
 * Ohne `erster` nähme das Maximum auch die Anker einer älteren, verlorenen Kette mit: Hat A bis
 * Block 10 gemeldet und B danach eine neue Kette bis Block 5 begonnen, hieße Bs gültige
 * Sicherung sonst „veraltet“. Innerhalb der Kette gilt der höchste Block; tragen zwei Rechner
 * dort verschiedene Hashes, ist sie mehrdeutig (`{ ok: false }`, die Route antwortet
 * `409 anker_mehrdeutig`). Ohne Mitglied: `anker: null`.
 */
export function kettenanker(db: Db, r: RechnerZeile, erster: string): { ok: true; anker: Kettenanker | null } | { ok: false } {
  const kandidaten = r.art === "echt"
    ? db.select({ id: anker.rechnerId }).from(anker)
        .innerJoin(rechner, eq(anker.rechnerId, rechner.id))
        .where(and(eq(rechner.art, "echt"), eq(anker.block, 1), eq(anker.hash, erster))).all()
    : db.select({ id: anker.rechnerId }).from(anker)
        .where(and(eq(anker.rechnerId, r.id), eq(anker.block, 1), eq(anker.hash, erster))).all();
  if (kandidaten.length === 0) return { ok: true, anker: null };
  const zeilen = db.select({ block: anker.block, hash: anker.hash }).from(anker)
    .where(inArray(anker.rechnerId, kandidaten.map((k) => k.id))).all();
  const hoechsterBlock = Math.max(...zeilen.map((z) => z.block));
  const hashes = [...new Set(zeilen.filter((z) => z.block === hoechsterBlock).map((z) => z.hash))];
  if (hashes.length > 1) return { ok: false };
  return { ok: true, anker: { block: hoechsterBlock, hash: hashes[0] } };
}
