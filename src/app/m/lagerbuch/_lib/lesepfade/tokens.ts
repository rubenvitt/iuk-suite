import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, lagerorte, tokens } from "../../_db/schema";

/**
 * Der Lesepfad entsteht in T126, wird aber in Teil 6 / T160 erweitert. Es
 * entsteht dort keine zweite Token-Datei.
 *
 * Zielnamen werden serverseitig aufgeloest. Auch gesperrte Tokens und spaeter
 * deaktivierte Ziele bleiben in der Liste lesbar; nur die Auswahllisten fuer
 * neue Codes sind auf aktive Ziele begrenzt.
 */
export type TokenZeile = {
  id: string;
  code: string;
  label: string;
  aktiv: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
  zielName: string | null;
};

export function tokenListe(db: DB): TokenZeile[] {
  const zeilen = db.select().from(tokens)
    .orderBy(desc(tokens.createdAt), desc(tokens.id))
    .all();
  const fahrzeugNamen = new Map(
    db.select({ id: lagerorte.id, name: lagerorte.name })
      .from(lagerorte)
      .where(eq(lagerorte.typ, "fahrzeug"))
      .all()
      .map((fahrzeug) => [fahrzeug.id, fahrzeug.name] as const),
  );
  const artikelNamen = new Map(
    db.select({ id: artikel.id, name: artikel.name })
      .from(artikel)
      .all()
      .map((zeile) => [zeile.id, zeile.name] as const),
  );

  return zeilen.map((zeile) => ({
    id: zeile.id,
    code: zeile.code,
    label: zeile.label,
    aktiv: zeile.aktiv,
    lastUsedAt: zeile.lastUsedAt,
    createdAt: zeile.createdAt,
    zielTyp: zeile.zielTyp,
    zielId: zeile.zielId,
    zielName: zeile.zielTyp === "fahrzeug"
      ? fahrzeugNamen.get(zeile.zielId ?? "") ?? null
      : zeile.zielTyp === "artikel"
        ? artikelNamen.get(zeile.zielId ?? "") ?? null
        : null,
  }));
}

/**
 * Nur aktive Ziele sind fuer neue laminierte Codes waehlbar. `kennung` und
 * `fach` werden fuer die spaetere Suche im Select mitgegeben.
 */
export function tokenZiele(db: DB): {
  fahrzeuge: { id: string; name: string; kennung: string | null }[];
  artikel: { id: string; name: string; fach: string }[];
} {
  return {
    fahrzeuge: db
      .select({
        id: lagerorte.id,
        name: lagerorte.name,
        kennung: lagerorte.kennung,
      })
      .from(lagerorte)
      .where(and(
        eq(lagerorte.typ, "fahrzeug"),
        eq(lagerorte.aktiv, true),
      )!)
      .all()
      .sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id)),
    artikel: db
      .select({ id: artikel.id, name: artikel.name, fach: artikel.fach })
      .from(artikel)
      .where(eq(artikel.aktiv, true))
      .all()
      .sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id)),
  };
}
