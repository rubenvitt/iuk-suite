"use server";

import { z } from "zod";
import { withAuditContext, auditActor } from "@/core/audit/server";
import { getDb, type DB } from "../_db/client";
import { gegenbuchen, vorgangsZeilen } from "../_lib/schreibpfade/gegenbuchung";
import { BuchungAbgewiesen } from "../_lib/buchungAbgewiesen";
import { revalidiereBestand } from "../_lib/revalidierung";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { JOURNAL_GRENZE, JOURNAL_SUCHE_MAX } from "../_lib/grenzen";
import { journalEintraege } from "../_lib/lesepfade/journal";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { VORGANG_ARTEN } from "../_lib/vorgang";
import { journalZeileDTO, type JournalZeileDTO } from "../_lib/journalDTO";

/**
 * DIE NAECHSTE JOURNALSEITE (DRK-331).
 *
 * ⚠️ DIE BERECHTIGUNG WIRD HIER ERNEUT GEPRUEFT, nicht von der Seite geerbt.
 * Eine Server Action ist ein eigener Einstiegspunkt — sie ist von aussen
 * aufrufbar, egal welche Seite sie eingebaut hat. Ohne `requireLagerbuchAdmin`
 * waere das Journal ueber diese Action fuer jeden lesbar, der ihre Kennung
 * kennt, und kein Tor faende das (CLAUDE.md, „Zugriffsschutz").
 *
 * ⚠️ DER DECKEL BLEIBT — er wandert nur von „insgesamt" zu „je Abruf". Die
 * Begruendung in `_lib/grenzen.ts` gilt unveraendert: `better-sqlite3` ist
 * SYNCHRON, ein Vollladen blockiert die GANZE Suite, nicht nur dieses Modul.
 * Was sich aendert, ist allein die Zahl der Abrufe. `grenze` kommt deshalb
 * NICHT aus der Eingabe.
 */

const CursorSchema = z.object({
  // Der Zeitstempel reist als ISO-Zeichenkette — ein `Date` durch eine Server
  // Action zu schicken geht, aber die Pruefung ist an der Zeichenkette ehrlicher.
  ts: z.string().datetime(),
  id: z.string().min(1).max(64),
});

const AnfrageSchema = z.object({
  q: z.string().max(JOURNAL_SUCHE_MAX).optional(),
  /** Die VORGANGSART, dieselbe Aufzaehlung wie im Auswahlfeld (DRK-344).
   *  ⚠️ Der Nachschlag MUSS denselben Filter fahren wie die erste Seite —
   *  faellt hier ein Wert durch, blaettert die Tabelle ab Seite zwei durch eine
   *  ANDERE Treffermenge. */
  vorgang: z.enum(VORGANG_ARTEN).optional(),
  von: z.string().datetime().optional(),
  bis: z.string().datetime().optional(),
  /** IDA-239 — Artikel und Ort reisen als Kennung, dieselben wie auf Seite eins. */
  artikelId: z.string().min(1).max(64).optional(),
  lagerortId: z.string().min(1).max(64).optional(),
  cursor: CursorSchema.nullable().optional(),
});

export type JournalSeitenAnfrage = z.input<typeof AnfrageSchema>;

export type JournalSeitenAntwort =
  | {
    ok: true;
    zeilen: JournalZeileDTO[];
    cursor: { ts: string; id: string } | null;
  }
  | { ok: false; fehler: string };

/** Fester Satz statt `e.message` — derselbe Grund wie ueberall im Modul (§11.2 d). */
const ABRUF_FEHLER = "Weitere Buchungen konnten nicht geladen werden – bitte erneut versuchen.";

export async function naechsteJournalSeite(
  anfrage: JournalSeitenAnfrage,
): Promise<JournalSeitenAntwort> {
  await requireLagerbuchAdmin();

  const gelesen = AnfrageSchema.safeParse(anfrage);
  if (!gelesen.success) return { ok: false, fehler: ABRUF_FEHLER };
  const { q, vorgang, von, bis, artikelId, lagerortId, cursor } = gelesen.data;

  try {
    const ergebnis = journalEintraege(getDb(), {
      q: q || undefined,
      vorgang,
      artikelId,
      lagerortId,
      von: von ? new Date(von) : undefined,
      bis: bis ? new Date(bis) : undefined,
      grenze: JOURNAL_GRENZE,
      cursor: cursor ? { ts: new Date(cursor.ts), id: cursor.id } : undefined,
    });
    return {
      ok: true,
      zeilen: ergebnis.zeilen.map(journalZeileDTO),
      cursor: ergebnis.naechsterCursor
        ? {
          ts: ergebnis.naechsterCursor.ts.toISOString(),
          id: ergebnis.naechsterCursor.id,
        }
        : null,
    };
  } catch {
    return { ok: false, fehler: ABRUF_FEHLER };
  }
}

const GegenbuchenSchema = z.object({
  zeilenIds: z.array(z.string().min(1).max(64)).min(1).max(500),
});

/**
 * IDA-378 — „GEGENBUCHEN" IM JOURNAL.
 *
 * ⚠️ DER CLIENT NENNT ZEILEN, DER SERVER BESTIMMT DEN VORGANG. Aus der ersten
 * Zeile loest `vorgangsZeilen` den ganzen Vorgang aus der Datenbank auf; jede
 * weitere genannte Zeile muss dazugehoeren. Eine gefilterte Journalseite zeigt
 * oft nur ein Leg einer Umlagerung — gegengebucht werden trotzdem beide.
 *
 * Die Gegenzeilen tragen die angemeldete Person als Quelle (`oidc`), nicht die
 * des Originals: im Journal steht, wer zurueckgenommen hat.
 */
export async function gegenbucheVorgang(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ gegengebucht: number; ids: string[] }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ gegengebucht: number; ids: string[] }>> => {
    const geparst = GegenbuchenSchema.safeParse(eingabe);
    if (!geparst.success) return { ok: false, fehler: "Diesen Vorgang gibt es nicht." };
    const [erste, ...weitere] = geparst.data.zeilenIds;
    const zeilen = vorgangsZeilen(db, erste!);
    const ids = new Set(zeilen.map((z) => z.id));
    if (zeilen.length === 0 || !weitere.every((id) => ids.has(id))) {
      return { ok: false, fehler: "Diesen Vorgang gibt es nicht." };
    }
    let gegengebucht = 0;
    try {
      db.transaction((tx) => {
        gegengebucht = gegenbuchen(tx, {
          zeilen,
          quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
        }).gegengebucht;
      });
    } catch (e) {
      // Sentinel statt `Error` — Begruendung am `catch` von `bucheZugang`.
      return {
        ok: false,
        fehler: e instanceof BuchungAbgewiesen ? e.message : "Gegenbuchung konnte nicht gebucht werden.",
      };
    }
    revalidiereBestand();
    return { ok: true, wert: { gegengebucht, ids: zeilen.map((z) => z.id) } };
  });
}
