"use server";

import { revalidatePath } from "next/cache";
import { auditDenied, withAuditContext } from "@/core/audit/server";
import type { AuditActor } from "@/core/audit/types";
import { getDb, type GemeinschaftSchreiber } from "../_db/client";
import {
  AufgabeAbgelehnt, gebeAufgabeAb, mitgliedZuLink, setzeErledigt, uebernehmeAufgabe, type LinkMitglied,
} from "../_lib/meinLink";
import type { MitgliederErgebnis } from "../_lib/mitgliederAnzeige";
import { requireGemeinschaftHostAktion } from "../_lib/zugang";

/*
 * Die Actions des persönlichen Links (`/mein/<link>`), ohne Anmeldung. JEDER Aufruf prüft den Host und löst das
 * Mitglied neu aus dem Link-Code auf (`mitgliedZuLink`: Form, dann Datenbank) — ein inzwischen erneuerter Link
 * ändert also nichts mehr. Welche Aufgabe das Mitglied ändern darf, entscheidet `_lib/meinLink.ts` gegen die
 * Datenbank; die Aufgabe-ID aus dem Client ist nur der Wunsch.
 */

const UNGUELTIG_LINK = "Dieser Link gilt nicht mehr. Frag bei der Leitung der Gemeinschaft nach einem neuen.";

/** Wer über den Link handelt: das Mitglied, ohne Konto. Name nur für die Lesbarkeit im Protokoll der Suite. */
function mitgliedAkteur(m: LinkMitglied): AuditActor {
  return { kind: "user", id: `gemeinschaft:mitglied:${m.id}`, name: m.name.slice(0, 256) };
}

async function ueberLink(link: unknown, schreiben: (db: GemeinschaftSchreiber, m: LinkMitglied, jetzt: number) => void): Promise<MitgliederErgebnis> {
  await requireGemeinschaftHostAktion();
  const db = getDb();
  const m = typeof link === "string" ? mitgliedZuLink(db, link) : null;
  if (!m) {
    auditDenied("gemeinschaft");
    return { ok: false, fehler: UNGUELTIG_LINK, linkUngueltig: true };
  }
  return withAuditContext({ actor: mitgliedAkteur(m) }, async (): Promise<MitgliederErgebnis> => {
    try {
      db.transaction((tx) => schreiben(tx, m, Date.now()));
    } catch (e) {
      if (e instanceof AufgabeAbgelehnt) return { ok: false, fehler: e.message };
      throw e;
    }
    revalidatePath("/m/gemeinschaft", "layout");
    return { ok: true };
  });
}

/** Abhaken (`erledigt = true`) oder wieder öffnen — nur eine eigene Aufgabe. */
export async function meineAufgabeErledigtAction(link: string, aufgabeId: string, erledigt: boolean): Promise<MitgliederErgebnis> {
  return ueberLink(link, (db, m, jetzt) => setzeErledigt(db, m.id, aufgabeId, erledigt === true, jetzt));
}

/** „Schaffe ich doch nicht“. */
export async function meineAufgabeAbgebenAction(link: string, aufgabeId: string): Promise<MitgliederErgebnis> {
  return ueberLink(link, (db, m, jetzt) => gebeAufgabeAb(db, m.id, aufgabeId, jetzt));
}

/** „Ich mach’s“ — nur für eine offene Aufgabe ohne Zuständige. */
export async function aufgabeUebernehmenAction(link: string, aufgabeId: string): Promise<MitgliederErgebnis> {
  return ueberLink(link, (db, m, jetzt) => uebernehmeAufgabe(db, m.id, aufgabeId, jetzt));
}
