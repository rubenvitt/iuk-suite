/**
 * DIE GEGENBUCHUNG — IDA-378. Transaktionsfrei (Festlegung H3), wie
 * `abbuchung.ts` und `umlagerung.ts`.
 *
 * Das Journal ist append-only (`_db/append-only.test.ts`): ein Vorgang wird
 * nicht geloescht, sondern mit umgekehrtem Vorzeichen nachgebucht. Je
 * Originalzeile EINE Gegenzeile mit gleichem Typ, gleicher Charge und gleichem
 * Ort; danach ist der Bestand je (Charge, Ort) wieder der von vorher.
 *
 * ⚠️ DIE ID DER GEGENZEILE IST `storno:<originalId>`. Der Primaerschluessel ist
 * damit die harte Grenze gegen doppeltes Gegenbuchen — auch bei zwei
 * gleichzeitigen Versuchen, die beide an der Vorpruefung vorbeikommen.
 *
 * ⚠️ DIE REFERENZ IST DIESELBE (`STORNO_PRAEFIX` aus `_lib/vorgang.ts`). Die
 * Statistik spiegelt daran die Originalart (`bewegungsArt`), das Journal zeigt
 * „Gegenbuchung" und filtert sie als eigene Art. Die Referenz des Originals
 * geht dabei verloren — das ist vertretbar, weil nur Vorgaenge gegenbuchbar
 * sind, deren Art am Typ allein haengt (`zeileGegenbuchbar`).
 */
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, buchungen } from "../../_db/schema";
import { BuchungAbgewiesen } from "../buchungAbgewiesen";
import { STORNO_PRAEFIX, istGegenbuchung, zeileGegenbuchbar } from "../vorgang";
import { ortStamm } from "../lesepfade/orte";
import type { Quelle, Tx } from "./abbuchung";
import { zeilenDerSendung, type SendungsZeile } from "./sendung";

/** Die ID (und Referenz) der Gegenzeile zu einer Originalzeile. */
export function gegenzeilenId(originalId: string): string {
  return `${STORNO_PRAEFIX}${originalId}`;
}

/** `<sendungId>:<n>` — die IDs einer Sendung (`sendung.ts`). nanoid kennt kein `:`. */
const SENDUNGS_ZEILE = /^([^:]+):\d+$/;

/**
 * ALLE ZEILEN DES VORGANGS, ZU DEM DIESE ZEILE GEHOERT — aus der Datenbank,
 * nie aus einer Liste des Clients.
 *
 * Mit Sendung (`<sendungId>:n`) ist der Vorgang die Sendung. Ohne sie (Altzeilen,
 * newId) sind es die Zeilen mit demselben Zeitpunkt, derselben Quelle, demselben
 * Artikel und derselben Referenz — dieselbe Klammer, die `letzteBoxZugaenge`
 * (`lesepfade/entnahmebox.ts`) benutzt.
 */
export function vorgangsZeilen(db: DB | Tx, zeilenId: string): SendungsZeile[] {
  const zeile = db.select().from(buchungen).where(eq(buchungen.id, zeilenId)).get();
  if (!zeile) return [];
  if (istGegenbuchung(zeile)) return [zeile];
  const sendung = SENDUNGS_ZEILE.exec(zeile.id);
  if (sendung) return zeilenDerSendung(db, sendung[1]!);
  /*
   * ⚠️ EIN ZUGANG IST IMMER GENAU EINE ZEILE (`zugangBuchen`). Die Klammer
   * darunter faende zwei Zugaenge derselben Person in derselben Sekunde als
   * EINEN Vorgang, und die Gegenbuchung naehme den nicht gewaehlten mit.
   */
  if (zeile.typ === "zugang") return [zeile];
  return db.select().from(buchungen).where(and(
    eq(buchungen.ts, zeile.ts),
    eq(buchungen.quelleTyp, zeile.quelleTyp),
    eq(buchungen.quelleId, zeile.quelleId),
    eq(buchungen.artikelId, zeile.artikelId),
    zeile.referenz === null ? isNull(buchungen.referenz) : eq(buchungen.referenz, zeile.referenz),
    // Gegenzeilen tragen eine andere Referenz und fallen damit schon heraus;
    // der Bereich schliesst sie zusaetzlich am Schluessel aus.
    // (`:` ist 0x3A, `;` 0x3B — dieselbe Bereichsform wie `zeilenDerSendung`.)
    or(lt(buchungen.id, STORNO_PRAEFIX), gte(buchungen.id, "storno;")),
  )).all()
    // Zeilen mit Vorgangskennung gehoeren zu ihrem eigenen Vorgang, nie in die
    // Klammer einer Altzeile derselben Sekunde.
    .filter((z) => !SENDUNGS_ZEILE.test(z.id));
}

/**
 * ⚠️ NUR ALTZEILEN OHNE VORGANGSKENNUNG KOENNEN MEHRDEUTIG SEIN. Ihre Klammer
 * in `vorgangsZeilen` faengt zwei Vorgaenge derselben Sekunde gemeinsam ein,
 * und eine Entnahme ueber zwei Chargen sieht dort genauso aus wie zwei
 * Entnahmen ueber je eine. Eindeutig sind deshalb nur:
 * - eine einzelne Zeile,
 * - die zwei Legs einer Umlagerung der Verwaltung (eine Charge, ab und zu,
 *   netto null).
 * Alles andere weist `gegenbuchen` ab; der Bestand laesst sich dann mit einer
 * Korrektur ausgleichen. Neue Vorgaenge tragen eine Kennung (`<uuid>:n`) und
 * kommen hier nie an.
 */
export function vorgangMehrdeutig(zeilen: readonly SendungsZeile[]): boolean {
  if (zeilen.length <= 1 || zeilen.some((z) => SENDUNGS_ZEILE.test(z.id))) return false;
  if (zeilen.length > 2) return true;
  const [a, b] = zeilen as [SendungsZeile, SendungsZeile];
  const umlagerung = a.typ === "umlagerung" && b.typ === "umlagerung";
  return !(umlagerung && a.chargeId === b.chargeId && a.menge + b.menge === 0);
}

/** Ist zu einer dieser Zeilen schon eine Gegenzeile gebucht? */
export function schonGegengebucht(db: DB | Tx, zeilen: readonly SendungsZeile[]): boolean {
  if (zeilen.length === 0) return false;
  return db.select({ id: buchungen.id }).from(buchungen)
    .where(inArray(buchungen.id, zeilen.map((z) => gegenzeilenId(z.id))))
    .all().length > 0;
}

/**
 * Bucht zu jeder Zeile die Gegenzeile. Wirft `BuchungAbgewiesen` mit einem
 * fertigen Satz, wenn der Vorgang nicht gegenbuchbar ist — der Aufrufer rollt
 * damit seine Transaktion zurueck.
 */
export function gegenbuchen(
  tx: Tx,
  args: { zeilen: readonly SendungsZeile[]; quelle: Quelle },
): { gegengebucht: number } {
  const { zeilen, quelle } = args;
  if (zeilen.length === 0) {
    throw new BuchungAbgewiesen("Diesen Vorgang gibt es nicht.");
  }
  if (zeilen.some(istGegenbuchung)) {
    throw new BuchungAbgewiesen("Eine Gegenbuchung lässt sich nicht noch einmal gegenbuchen.");
  }
  if (!zeilen.every(zeileGegenbuchbar)) {
    throw new BuchungAbgewiesen("Dieser Vorgang lässt sich nicht gegenbuchen.");
  }
  if (vorgangMehrdeutig(zeilen)) {
    throw new BuchungAbgewiesen("Hier liegen zwei Vorgänge in derselben Sekunde. Gleiche den Bestand mit einer Korrektur aus.");
  }
  if (schonGegengebucht(tx, zeilen)) {
    throw new BuchungAbgewiesen("Dieser Vorgang ist schon gegengebucht.");
  }

  /*
   * ⚠️ DER BESTAND DARF NICHT UNTER NULL. Wo die Gegenbuchung abbucht (die
   * Plus-Zeile eines Zugangs, das Ziel-Leg einer Umlagerung), muss die Charge
   * am Ort noch liegen — ist sie inzwischen weiterverbraucht, gaebe es sonst
   * negativen Bestand in einem Buch, das kein UPDATE kennt (I2).
   */
  const abgang = new Map<string, { artikelId: string; chargeId: string; lagerortId: string; menge: number }>();
  for (const z of zeilen) {
    if (z.menge <= 0) continue;
    const k = `${z.artikelId}|${z.chargeId}|${z.lagerortId}`;
    const e = abgang.get(k) ?? { artikelId: z.artikelId, chargeId: z.chargeId, lagerortId: z.lagerortId, menge: 0 };
    e.menge += z.menge;
    abgang.set(k, e);
  }
  for (const e of abgang.values()) {
    const rest = tx.select({ summe: sql<number>`coalesce(sum(${buchungen.menge}), 0)` })
      .from(buchungen)
      .where(and(
        eq(buchungen.artikelId, e.artikelId),
        eq(buchungen.chargeId, e.chargeId),
        eq(buchungen.lagerortId, e.lagerortId),
      ))
      .get()?.summe ?? 0;
    if (rest < e.menge) {
      const ort = ortStamm(tx).get(e.lagerortId)?.name ?? e.lagerortId;
      const einheit = tx.select({ einheit: artikel.einheit }).from(artikel)
        .where(eq(artikel.id, e.artikelId)).get()?.einheit ?? "";
      throw new BuchungAbgewiesen(
        `In „${ort}“ liegen von dieser Charge nur noch ${rest} ${einheit}`.trimEnd()
        + ` statt ${e.menge}. Es wurde nichts gegengebucht.`,
      );
    }
  }

  // EIN Zeitstempel fuer alle Gegenzeilen — dieselbe Begruendung wie in `umlagerung.ts`.
  const ts = new Date();
  for (const z of zeilen) {
    tx.insert(buchungen).values({
      id: gegenzeilenId(z.id), ts, typ: z.typ, artikelId: z.artikelId,
      chargeId: z.chargeId, lagerortId: z.lagerortId, menge: -z.menge,
      quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      referenz: gegenzeilenId(z.id), kommentar: null,
    }).run();
  }
  return { gegengebucht: zeilen.length };
}

/** Bis wann eine Helfer-Entnahme am Telefon rueckgaengig gemacht werden kann. */
export const RUECKGAENGIG_MS = 10 * 60_000;

/** Ende des Rueckgaengig-Fensters einer Sendung — gerechnet ab ihrer ERSTEN Zeile. */
export function rueckgaengigBis(zeilen: readonly SendungsZeile[]): Date | null {
  const erste = zeilen[0];
  return erste ? new Date(erste.ts.getTime() + RUECKGAENGIG_MS) : null;
}
