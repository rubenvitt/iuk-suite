"use server";

import { z } from "zod";
import { getDb } from "../_db/client";
import { JOURNAL_GRENZE } from "../_lib/grenzen";
import { journalEintraege } from "../_lib/lesepfade/journal";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { TYPEN } from "../verwaltung/(arbeit)/journal/journalFilterLogik";
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
  q: z.string().max(200).optional(),
  typ: z.enum(TYPEN).optional(),
  von: z.string().datetime().optional(),
  bis: z.string().datetime().optional(),
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
  const { q, typ, von, bis, cursor } = gelesen.data;

  try {
    const ergebnis = journalEintraege(getDb(), {
      q: q || undefined,
      typ,
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
