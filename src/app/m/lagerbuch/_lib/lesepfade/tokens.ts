import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, lagerorte, tokens } from "../../_db/schema";

/**
 * Der Lesepfad entsteht in T126. T126 hat hier eine Erweiterung durch T160
 * angekuendigt; T160 hat die Datei geprueft und BEWUSST nicht geaendert:
 *
 * Die drei Zusicherungen aus §8.3 (Alphabet, Laenge, Kollision gegen ALLE
 * Zeilen) haengen samt und sonders am Schreibpfad `_actions/tokens.ts`. Die
 * einzige §8.3-nahe Eigenschaft DIESER Datei — `tokenListe` liest ohne
 * `aktiv`-Bedingung, ein gesperrter Code bleibt also sichtbar und belegt — ist
 * unten bereits gebaut und in `_actions/tokens.test.ts` geprueft („listet auch
 * inaktive Tokens …"). Entscheidung 8-F verschaerft das nicht, sie stuetzt sich
 * darauf. Eine Aenderung haette hier nichts zu tun gehabt.
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
