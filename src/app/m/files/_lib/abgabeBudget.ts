/**
 * DAS KONTINGENT OFFENER ABGABEN (DRK-288) — Dateiplätze und Bytes, die ein
 * Abgabelink belegt, BEVOR eine Datei abgeschlossen ist.
 *
 * Vorher zählte das Kontingent ausschließlich abgeschlossene Dateien
 * (`verbraucht_*`, gebucht erst beim letzten Chunk). Eine Abgabe, die nie
 * `ende=1` schickte, belegte Zeile und Zwischendatei, ohne je zu zählen —
 * gemessen: ein Link mit 1 Datei / 32 Byte hielt nach drei ersten Chunks 3 offene
 * Dateien mit 48 Byte, bei Zählerstand 0 / 0.
 *
 * ═══ WAS BELEGT IST, und woher die Zahl kommt ═══════════════════════════════
 *
 *   Dateiplätze = `verbraucht_dateien` + offene Zeilen des Links
 *   Bytes       = `verbraucht_bytes`   + je offener Datei ihr Vorbehalt
 *
 * Der Vorbehalt einer offenen Datei ist die Länge ihrer Zwischendatei — oder,
 * solange gerade ein Chunk in sie geschrieben wird, die Obergrenze, die dieser
 * Chunk vorab bekommen hat. Es gibt KEINEN Zähler für offene Abgaben, und das ist
 * die Zusage „genau einmal freigegeben": was nicht hochgezählt wird, kann auch
 * nicht doppelt oder gar nicht heruntergezählt werden. Ein Dateiplatz ist die
 * Zeile selbst — er geht mit ihr (Abbruch, Ablehnung, Verfall) oder wandelt sich
 * mit ihrem Abschluss in `verbraucht_dateien` um, in derselben Transaktion.
 * Bytes auf der Platte sind die Zwischendatei selbst.
 *
 * Nach einem PROZESSNEUSTART stimmt die Rechnung ohne Nacharbeit: offene Zeilen
 * stehen in der Datenbank, ihre Bytes auf der Platte. Nur der Vorbehalt eines
 * laufenden Chunks lebt im Prozessspeicher — und ein laufender Chunk überlebt
 * keinen Neustart, seine geschriebenen Bytes zählen danach als Länge.
 *
 * ═══ WARUM EIN RIEGEL JE LINK ═══════════════════════════════════════════════
 *
 * Die Rechnung liest Längen vom Dateisystem, also asynchron. Ohne Riegel läge
 * zwischen dem Lesen und dem Eintragen des eigenen Vorbehalts ein Fenster: ein
 * paralleler Chunk könnte seinen Vorbehalt dort freigeben und seine Bytes noch
 * nicht auf der Platte zeigen — beide sähen dann mehr Platz, als da ist. Deshalb
 * laufen Vorbehalt, Freigabe und Abschluss (Umbenennen + Buchung) je Link
 * nacheinander. Der Riegel umfasst nie das SCHREIBEN selbst: sonst stünde jeder
 * Melder hinter einem langsamen Upload desselben Links an, und dieselbe NAT-IP
 * teilen sich bei einem Einsatz 15 Ehrenamtliche (`feedback`-Ausfall, §8.4).
 *
 * Darum ist ein Vorbehalt je Chunk begrenzt (`FILES_CHUNK_BYTES`): er hält nur so
 * viel Budget fest, wie ein Chunk braucht, und parallele Abgaben desselben Links
 * teilen sich den Rest.
 *
 * GRENZE, benannt: Riegel und laufende Vorbehalte gelten in EINEM Prozess — die
 * Betriebsform, dieselbe Annahme wie `mitSchreibbesitz` in `_lib/storage.ts`.
 * Der Zustand liegt auf `globalThis`, damit jede Modulinstanz (Next bündelt je
 * Route Handler) dieselbe Tabelle sieht.
 */
import { TransactionRollbackError, and, eq, isNull, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "../_db/schema";
import { inboxFiles, zugangslinks } from "../_db/schema";
import { verbucheAbgabe } from "../_db/zaehler";
import { FILES_CHUNK_BYTES } from "./grenzen";
import { fortschritt } from "./storage";

type DB = BetterSQLite3Database<typeof schema>;

interface LinkZustand {
  /** Das Ende der Warteschlange dieses Links — der Riegel. */
  kette: Promise<void>;
  /** Laufende Chunks: `inboxFileId` → Obergrenze der Zwischendatei. */
  imFlug: Map<string, number>;
}

const ZUSTAND_SCHLUESSEL = Symbol.for("iuk.files.abgabeBudget");
type MitZustand = typeof globalThis & { [ZUSTAND_SCHLUESSEL]?: Map<string, LinkZustand> };

function zustandFuer(tokenId: string): LinkZustand {
  const g = globalThis as MitZustand;
  g[ZUSTAND_SCHLUESSEL] ??= new Map();
  const alle = g[ZUSTAND_SCHLUESSEL];
  let z = alle.get(tokenId);
  if (z === undefined) {
    z = { kette: Promise.resolve(), imFlug: new Map() };
    alle.set(tokenId, z);
  }
  return z;
}

/** Aufräumen der Tabelle, sobald ein Link nichts mehr in Arbeit hat. */
function vergiss(tokenId: string, z: LinkZustand, meineKette: Promise<void>): void {
  const alle = (globalThis as MitZustand)[ZUSTAND_SCHLUESSEL];
  if (z.imFlug.size === 0 && z.kette === meineKette) alle?.delete(tokenId);
}

/**
 * Führt `arbeit` unter dem Riegel des Links aus — nacheinander, in
 * Ankunftsreihenfolge. Ein Wurf gibt den Riegel frei und fliegt weiter.
 */
export async function unterBudgetRiegel<T>(tokenId: string, arbeit: () => Promise<T>): Promise<T> {
  const z = zustandFuer(tokenId);
  const vorher = z.kette;
  let loese!: () => void;
  const meine = new Promise<void>((r) => (loese = r));
  z.kette = vorher.then(() => meine);
  const meineKette = z.kette;
  await vorher;
  try {
    return await arbeit();
  } finally {
    loese();
    vergiss(tokenId, z, meineKette);
  }
}

/**
 * Belegt einen Dateiplatz: legt die Zeile an, wenn der Link noch einen hat, und
 * sonst nicht. Zählen und Anlegen stehen in EINER `IMMEDIATE`-Transaktion — auch
 * gegen einen zweiten Prozess auf derselben Datei, nicht nur innerhalb dieses.
 * `false` = kein Platz frei (der Aufrufer antwortet 429).
 */
export function belegeDateiplatz(
  db: DB,
  tokenId: string,
  zeile: typeof inboxFiles.$inferInsert,
): boolean {
  return db.transaction(
    (tx) => {
      const stand = tx
        .select({
          budget: zugangslinks.budgetDateien,
          verbraucht: zugangslinks.verbrauchtDateien,
          offen: sql<number>`(SELECT count(*) FROM ${inboxFiles}
                             WHERE ${inboxFiles.tokenId} = ${tokenId}
                               AND ${inboxFiles.bytesVollstaendigAt} IS NULL)`,
        })
        .from(zugangslinks)
        .where(eq(zugangslinks.id, tokenId))
        .get();
      if (stand === undefined) return false;
      if (stand.verbraucht + stand.offen >= stand.budget) return false;
      tx.insert(inboxFiles).values(zeile).run();
      return true;
    },
    { behavior: "immediate" },
  );
}

/** Was ein Chunk schreiben darf — und welche Grenze dabei bindet. */
export type Abschnitt =
  | { ok: true; obergrenze: number; bindend: "budget" | "abschnitt" }
  | { ok: false };

/**
 * Behält vor dem Schreiben Platz für EINEN Chunk ein: höchstens
 * `FILES_CHUNK_BYTES` über `bisher`, und nie mehr, als das Budget nach Abzug
 * aller anderen offenen und abgeschlossenen Abgaben hergibt. `obergrenze` ist die
 * Länge, die die Zwischendatei danach höchstens haben darf — der Aufrufer reicht
 * sie als `maxBytes` an `schreibeStrom`.
 *
 * Jeder Aufruf mit `ok: true` VERLANGT genau einen `gibAbschnittFrei` danach, in
 * jedem Ausgang. Ein vergessener hielte bis zum Neustart Budget fest.
 */
export async function behalteAbschnittVor(
  db: DB,
  tokenId: string,
  inboxFileId: string,
  bisher: number,
): Promise<Abschnitt> {
  return unterBudgetRiegel(tokenId, async () => {
    const z = zustandFuer(tokenId);
    const link = db
      .select({ budget: zugangslinks.budgetBytes, verbraucht: zugangslinks.verbrauchtBytes })
      .from(zugangslinks)
      .where(eq(zugangslinks.id, tokenId))
      .get();
    if (link === undefined) return { ok: false };

    const andere = db
      .select({ id: inboxFiles.id })
      .from(inboxFiles)
      .where(and(eq(inboxFiles.tokenId, tokenId), isNull(inboxFiles.bytesVollstaendigAt)))
      .all()
      .filter((zeile) => zeile.id !== inboxFileId);

    let belegt = link.verbraucht;
    for (const { id } of andere) {
      belegt += z.imFlug.get(id) ?? (await fortschritt({ art: "inbox", inboxFileId: id }));
    }

    const frei = link.budget - belegt;
    // `frei` ist, was DIESE Datei insgesamt noch haben darf — ihre schon
    // liegenden Bytes eingeschlossen.
    if (frei < bisher) return { ok: false };
    const nachAbschnitt = bisher + FILES_CHUNK_BYTES;
    const obergrenze = Math.min(frei, nachAbschnitt);
    z.imFlug.set(inboxFileId, obergrenze);
    return { ok: true, obergrenze, bindend: obergrenze < nachAbschnitt ? "budget" : "abschnitt" };
  });
}

/**
 * Gibt den Vorbehalt eines Chunks frei. Danach zählt die Datei mit der Länge
 * ihrer Zwischendatei — die ist in diesem Moment fertig geschrieben. Idempotent.
 */
export async function gibAbschnittFrei(tokenId: string, inboxFileId: string): Promise<void> {
  await unterBudgetRiegel(tokenId, async () => {
    zustandFuer(tokenId).imFlug.delete(inboxFileId);
  });
}

/**
 * Wandelt den Vorbehalt einer Datei in Verbrauch um: `verbraucht_*` hochzählen
 * UND die Zeile abschließen, in EINER Transaktion. Zwischen beiden gibt es damit
 * keinen Zustand, in dem die Datei doppelt oder gar nicht zählt.
 *
 * `false` = das Budget reicht nicht (nur erreichbar, wenn es seit dem Vorbehalt
 * gesenkt wurde) oder die Zeile ist nicht mehr offen. Dann ist NICHTS gebucht.
 */
export function wandleInVerbrauchUm(
  db: DB,
  tokenId: string,
  inboxFileId: string,
  abschluss: { bytes: number; mimeType: string; jetzt: Date },
): boolean {
  try {
    return db.transaction(
      (tx) => {
        if (!verbucheAbgabe(tx, tokenId, abschluss.bytes)) return false;
        const abgeschlossen = tx
          .update(inboxFiles)
          .set({
            size: abschluss.bytes,
            mimeType: abschluss.mimeType,
            bytesVollstaendigAt: abschluss.jetzt,
          })
          .where(and(eq(inboxFiles.id, inboxFileId), isNull(inboxFiles.bytesVollstaendigAt)))
          .run();
        // Die Buchung darf ohne ihre Zeile nicht stehen bleiben.
        if (abgeschlossen.changes !== 1) tx.rollback();
        return true;
      },
      { behavior: "immediate" },
    );
  } catch (fehler) {
    if (fehler instanceof TransactionRollbackError) return false;
    throw fehler;
  }
}
