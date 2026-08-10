"use server";

import { and, count, eq, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import {
  artikel,
  buchungen,
  bzGeraete,
  bzKontrollen,
  chargen,
  checks,
  geraete,
  lagerorte,
  o2Flaschen,
  o2Messungen,
  sollPositionen,
  templatePositionen,
  tokens,
} from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { parseCheckErgebnis } from "../_lib/checkErgebnis";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { ELEMENT_ARTEN, type ElementArt, type Loeschbarkeit } from "../_lib/loeschen";
import { loescheVerfallFuer } from "../_lib/schreibpfade/lagerortVerfall";
import { TOKEN_LOESCHGRUND } from "../_lib/tokenForm";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const ArtSchema = z.enum(ELEMENT_ARTEN);
const IdSchema = z.string().min(1);

const REVALIDATE: Record<ElementArt, string[]> = {
  artikel: ["/m/lagerbuch/verwaltung/artikel", "/m/lagerbuch/verwaltung"],
  fahrzeug: ["/m/lagerbuch/verwaltung/fahrzeuge", "/m/lagerbuch/verwaltung"],
  token: ["/m/lagerbuch/verwaltung/tokens"],
  bzGeraet: ["/m/lagerbuch/verwaltung/bz"],
  o2Flasche: ["/m/lagerbuch/verwaltung/sauerstoff"],
  geraet: ["/m/lagerbuch/verwaltung/geraete"],
};

const FESTER_LOESCHFEHLER =
  "Dieser Eintrag hängt noch an anderen Daten und kann nicht gelöscht werden.";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Leser = DB | Tx;

function anzahl(db: Leser, tabelle: SQLiteTable, wo: SQL): number {
  return db.select({ n: count() }).from(tabelle).where(wo).get()?.n ?? 0;
}

function plural(n: number, ein: string, mehr: string): string {
  return `${n} ${n === 1 ? ein : mehr}`;
}

function verknuepftGrund(teile: string[]): string {
  return `Noch mit ${teile.join(", ")} verknüpft — Löschen würde den Nachweis zerstören.`;
}

function pruefeArtikel(db: Leser, id: string): Loeschbarkeit {
  const buch = anzahl(db, buchungen, eq(buchungen.artikelId, id));
  const chg = anzahl(db, chargen, eq(chargen.artikelId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.artikelId, id));
  const vorlage = anzahl(db, templatePositionen, eq(templatePositionen.artikelId, id));
  const codes = anzahl(db, tokens, and(
    eq(tokens.zielTyp, "artikel"),
    eq(tokens.zielId, id),
  )!);

  if (buch + chg + soll + vorlage + codes === 0) return { loeschbar: true };

  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (chg) teile.push(plural(chg, "Charge", "Chargen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  if (vorlage) {
    teile.push(plural(vorlage, "Vorlagen-Position", "Vorlagen-Positionen"));
  }
  if (codes) teile.push(plural(codes, "Zugangs-Code", "Zugangs-Codes"));
  return {
    loeschbar: false,
    grund: verknuepftGrund(teile),
    kannDeaktivieren: true,
  };
}

function pruefeFahrzeug(db: Leser, id: string): Loeschbarkeit {
  if (id === HANDLAGER_ID) {
    return {
      loeschbar: false,
      grund: "Das Handlager ist der feste Bezugspunkt jeder Buchung und kann nicht entfernt werden.",
      kannDeaktivieren: false,
    };
  }

  const buch = anzahl(db, buchungen, eq(buchungen.lagerortId, id));
  const soll = anzahl(db, sollPositionen, eq(sollPositionen.fahrzeugId, id));
  const chk = anzahl(db, checks, eq(checks.fahrzeugId, id));
  const bzGer = anzahl(db, bzGeraete, eq(bzGeraete.lagerortId, id));
  const ger = anzahl(db, geraete, eq(geraete.lagerortId, id));
  const flaschen = anzahl(db, o2Flaschen, eq(o2Flaschen.lagerortId, id));
  const codes = anzahl(db, tokens, and(
    eq(tokens.zielTyp, "fahrzeug"),
    eq(tokens.zielId, id),
  )!);

  if (buch + soll + chk + bzGer + ger + flaschen + codes === 0) {
    return { loeschbar: true };
  }

  const teile: string[] = [];
  if (buch) teile.push(plural(buch, "Buchung", "Buchungen"));
  if (soll) teile.push(plural(soll, "Soll-Position", "Soll-Positionen"));
  if (chk) teile.push(plural(chk, "Check", "Checks"));
  if (bzGer) teile.push(plural(bzGer, "BZ-Gerät", "BZ-Geräten"));
  if (ger) teile.push(plural(ger, "Gerät", "Geräten"));
  if (flaschen) teile.push(plural(flaschen, "O₂-Flasche", "O₂-Flaschen"));
  if (codes) teile.push(plural(codes, "Zugangs-Code", "Zugangs-Codes"));
  return {
    loeschbar: false,
    grund: verknuepftGrund(teile),
    kannDeaktivieren: true,
  };
}

/**
 * ENTSCHEIDUNG 8-F (§8.3): der Code-Namensraum wird gegen Wiederverwendung
 * gesperrt. Ein Zugangs-Code kann nur noch gesperrt werden; sein Code bleibt
 * fuer immer belegt.
 *
 * WAS AN DIE STELLE VON `pruefeToken` TRITT: eine Konstante. Die BEDINGTE
 * Pruefung („loeschbar, solange keine Buchung mit `quelleTyp="token"` auf den
 * `code` zeigt") entfaellt ersatzlos — mit ihr faellt der einzige Weg, auf dem
 * ein Code wieder frei werden konnte: nie eingeloest ⇒ keine Buchung ⇒
 * loeschbar ⇒ ein spaeter ausgestelltes Kaertchen erbt den Code, und weil
 * `tokens.code` zugleich der Anzeigeschluessel im Journal ist (1:1-Pflicht 6),
 * erschienen historische Zeilen danach unter dem NEUEN Label.
 *
 * `last_used_at` ist danach KEIN Loeschbarkeitsschalter mehr, sondern nur noch
 * die Auskunft „nie benutzt" auf der Code-Tabelle. Beim Import wandert es
 * weiterhin vollstaendig mit (§4.12, 1:1-Pflicht 5).
 *
 * OHNE DATENBANKZUGRIFF: die Ablehnung haengt an keiner Zeile und an keinem
 * Zaehler mehr. Es gibt keinen Zustand, in dem sie ausbleibt.
 *
 * ⚠️ 8-F ist eine Ausnahme fuer TOKENS, keine neue Regel fuer das Modul: der
 * Hard-Delete der uebrigen fuenf Objektarten bleibt (§5.21).
 */
const TOKEN_UNLOESCHBAR: Loeschbarkeit = {
  loeschbar: false,
  grund: TOKEN_LOESCHGRUND,
  kannDeaktivieren: true,
};

function pruefeBzGeraet(db: Leser, id: string): Loeschbarkeit {
  const kontrollen = anzahl(db, bzKontrollen, eq(bzKontrollen.geraetId, id));
  if (kontrollen === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(kontrollen, "Kontrolle", "Kontrollen")]),
    kannDeaktivieren: true,
  };
}

function pruefeO2Flasche(db: Leser, id: string): Loeschbarkeit {
  const messungen = anzahl(db, o2Messungen, eq(o2Messungen.flascheId, id));
  if (messungen === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(messungen, "Messung", "Messungen")]),
    kannDeaktivieren: true,
  };
}

function pruefeGeraet(db: Leser, id: string): Loeschbarkeit {
  const checkAnzahl = db.select({ ergebnis: checks.ergebnis })
    .from(checks)
    .all()
    .filter(({ ergebnis }) => {
      const geparst = parseCheckErgebnis(ergebnis);
      return geparst.version === 2
        && geparst.geraete.some((eintrag) => eintrag.geraetId === id);
    }).length;

  if (checkAnzahl === 0) return { loeschbar: true };
  return {
    loeschbar: false,
    grund: verknuepftGrund([plural(checkAnzahl, "Check", "Checks")]),
    kannDeaktivieren: true,
  };
}

function pruefe(db: Leser, art: ElementArt, id: string): Loeschbarkeit {
  switch (art) {
    case "artikel": return pruefeArtikel(db, id);
    case "fahrzeug": return pruefeFahrzeug(db, id);
    case "token": return TOKEN_UNLOESCHBAR;
    case "bzGeraet": return pruefeBzGeraet(db, id);
    case "o2Flasche": return pruefeO2Flasche(db, id);
    case "geraet": return pruefeGeraet(db, id);
  }
}

export async function pruefeLoeschbar(
  art: ElementArt,
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<Loeschbarkeit>> {
  await requireLagerbuchAdmin();

  try {
    const a = ArtSchema.parse(art);
    const i = IdSchema.parse(id);
    const status = pruefe(db, a, i);
    if (status.loeschbar) return { ok: true, wert: status };
    return { ok: true, wert: status };
  } catch {
    return { ok: false, fehler: "Ungültige Anfrage." };
  }
}

export async function loescheElement(
  art: ElementArt,
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  let a: ElementArt;
  let i: string;
  try {
    a = ArtSchema.parse(art);
    i = IdSchema.parse(id);
  } catch {
    return { ok: false, fehler: "Ungültige Anfrage." };
  }

  let status: Loeschbarkeit;
  try {
    status = db.transaction((tx) => {
      const aktuell = pruefe(tx, a, i);
      if (!aktuell.loeschbar) return aktuell;

      switch (a) {
        case "artikel":
          loescheVerfallFuer(tx, "artikel", i);
          tx.delete(artikel).where(eq(artikel.id, i)).run();
          break;
        case "fahrzeug":
          loescheVerfallFuer(tx, "lagerort", i);
          tx.delete(lagerorte).where(and(
            eq(lagerorte.id, i),
            eq(lagerorte.typ, "fahrzeug"),
          )!).run();
          break;
        // 8-F: `token` erreicht diesen switch nie — `pruefe()` steigt zwei
        // Zeilen weiter oben mit `loeschbar: false` aus. Der Zweig fehlt
        // deshalb ABSICHTLICH; ein wiederhergestelltes `case "token"` waere die
        // Ruecknahme von 8-F. TypeScript verlangt hier keine Vollstaendigkeit
        // (der Block laeuft danach in `return aktuell;`), und ein `default`
        // mit `throw` waere schaedlich: das umgebende `catch` verschluckte ihn
        // und machte aus der benannten Ablehnung den festen Sammelfehler.
        case "bzGeraet":
          tx.delete(bzGeraete).where(eq(bzGeraete.id, i)).run();
          break;
        case "o2Flasche":
          tx.delete(o2Flaschen).where(eq(o2Flaschen.id, i)).run();
          break;
        case "geraet":
          tx.delete(geraete).where(eq(geraete.id, i)).run();
          break;
      }
      return aktuell;
    });
  } catch {
    return { ok: false, fehler: FESTER_LOESCHFEHLER };
  }

  if (!status.loeschbar) return { ok: false, fehler: status.grund };

  for (const pfad of REVALIDATE[a]) revalidatePath(pfad);
  return { ok: true };
}

export async function deaktiviereElement(
  art: ElementArt,
  id: string,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  let a: ElementArt;
  let i: string;
  try {
    a = ArtSchema.parse(art);
    i = IdSchema.parse(id);
  } catch {
    return { ok: false, fehler: "Ungültige Anfrage." };
  }

  if (a === "fahrzeug" && i === HANDLAGER_ID) {
    return { ok: false, fehler: "Das Handlager kann nicht deaktiviert werden." };
  }

  switch (a) {
    case "artikel":
      db.update(artikel).set({ aktiv: false }).where(eq(artikel.id, i)).run();
      break;
    case "fahrzeug":
      db.update(lagerorte).set({ aktiv: false }).where(eq(lagerorte.id, i)).run();
      break;
    case "token":
      db.update(tokens).set({ aktiv: false }).where(eq(tokens.id, i)).run();
      break;
    case "bzGeraet":
      db.update(bzGeraete).set({ aktiv: false }).where(eq(bzGeraete.id, i)).run();
      break;
    case "o2Flasche":
      db.update(o2Flaschen).set({ aktiv: false }).where(eq(o2Flaschen.id, i)).run();
      break;
    case "geraet":
      db.update(geraete).set({ aktiv: false }).where(eq(geraete.id, i)).run();
      break;
  }

  for (const pfad of REVALIDATE[a]) revalidatePath(pfad);
  return { ok: true };
}
