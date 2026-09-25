import type { EinsatzbuchDb } from "../_db/client";
import { fahrzeug, person, stichwort } from "../_db/schema";
import { ausBase64 } from "./kern/bytes";
import { ENTWICKLUNGS_KEK, KEK_VARIABLE } from "./schluessel/kek";
import { echtesPaar, legePaarAn } from "./schluessel/paar";
import { VORLAGE_FAHRZEUGE, VORLAGE_PERSONAL, VORLAGE_STICHWORTE } from "./stammdaten/vorlage";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag einsatzbuch): ein Seed in einer
 * Generalprobe (SUITE_SEED=1) legte ein bekanntes Schlüsselpaar an. Idempotent PRO ENTITÄT über feste
 * IDs und `onConflictDoNothing`, additiv (ändert nichts Vorhandenes).
 */
export async function seedLokalEinsatzbuch(db: EinsatzbuchDb, env: Record<string, string | undefined> = process.env): Promise<string[]> {
  const zaehle = (werte: { changes: number }[]) => werte.reduce((n, r) => n + r.changes, 0);
  const fz = zaehle(VORLAGE_FAHRZEUGE.map((f) => db.insert(fahrzeug).values(f).onConflictDoNothing().run()));
  const pe = zaehle(VORLAGE_PERSONAL.map((p) => db.insert(person).values(p).onConflictDoNothing().run()));
  const sw = zaehle(VORLAGE_STICHWORTE.map((s) => db.insert(stichwort).values(s).onConflictDoNothing().run()));
  const zeilen = [`einsatzbuch: ${fz} Fahrzeuge angelegt, ${pe} Personen angelegt, ${sw} Stichworte angelegt`];

  const kekUmgebung = env[KEK_VARIABLE]?.trim();
  if (echtesPaar(db)) zeilen.push("einsatzbuch: Schlüsselpaar vorhanden");
  else if (kekUmgebung && kekUmgebung !== ENTWICKLUNGS_KEK) zeilen.push(`einsatzbuch: Schlüsselpaar übersprungen (${KEK_VARIABLE} ist gesetzt und nicht der Entwicklungs-KEK; erzeugen mit pnpm einsatzbuch:schluessel erzeugen)`);
  else {
    const neu = await legePaarAn(db, { art: "echt", rechnerId: null, kek: ausBase64(ENTWICKLUNGS_KEK), jetzt: new Date() });
    zeilen.push(`einsatzbuch: Entwicklungs-Schlüsselpaar ${neu.schluesselId} angelegt — ${KEK_VARIABLE}=${ENTWICKLUNGS_KEK} in .env.local setzen`);
  }
  return zeilen;
}
