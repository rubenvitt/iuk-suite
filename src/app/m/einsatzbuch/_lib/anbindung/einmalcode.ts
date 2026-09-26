/**
 * Einmalcode der Anmeldung (Spec §12, PKCE mit S256): Die Anmeldeseite gibt ihn über den
 * Loopback-Rückruf an die App, die App tauscht ihn mit ihrem Verifier gegen eine Sitzung
 * (`api/anmelden/tausch`). Er gilt 60 Sekunden und genau einmal; gespeichert ist nur sein Hash.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { einmalcode } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";
import { raeumeAnbindungAuf } from "./aufraeumen";
import { gleich, hashVon, neuesGeheimnis, s256 } from "./token";

export const CODE_GUELTIG_MS = 60_000;

/** Die in der App gewählte Einrichtung (Entscheidung 1), unterwegs in Code und Sitzung. */
export type Einrichtungswunsch = { art: "echt" | "test"; name: string; ersetzen: boolean };

export function erzeugeCode(
  db: Db,
  o: { challenge: string; sub: string; name: string; jetzt: Date; einrichtung: Einrichtungswunsch | null },
): string {
  // Aufräumen bei Zugriff (Entscheidung 10, `./aufraeumen.ts`): abgelaufene Codes und Sitzungen
  // verschwinden, ohne auf den Zehn-Minuten-Takt zu warten.
  raeumeAnbindungAuf(db, o.jetzt);
  const code = neuesGeheimnis();
  db.insert(einmalcode).values({
    codeHash: hashVon(code),
    challenge: o.challenge,
    sub: o.sub,
    name: o.name,
    ablauf: new Date(o.jetzt.getTime() + CODE_GUELTIG_MS),
    einrichtungArt: o.einrichtung?.art ?? null,
    rechnerName: o.einrichtung?.name ?? null,
    ersetzen: o.einrichtung?.ersetzen ?? false,
  }).run();
  return code;
}

export type Einloesung =
  | { ok: true; sub: string; name: string; einrichtung: Einrichtungswunsch | null }
  | { ok: false; code: "code_ungueltig" | "verifier_falsch" };

/**
 * Löst `code` ein. Der Code wird in JEDEM Fall verbraucht, auch bei falschem Verifier: Wer den
 * Code abgefangen hat, bekommt keinen zweiten Versuch. Das bedingte `UPDATE … WHERE eingeloest_am
 * IS NULL AND ablauf > jetzt` entscheidet einen Wettlauf zweier Tausche: Nur einer ändert die Zeile.
 */
export function loeseEin(db: Db, code: string, verifier: string, jetzt: Date): Einloesung {
  const challenge = s256(verifier);
  const verbraucht = db.update(einmalcode)
    .set({ eingeloestAm: jetzt })
    .where(and(eq(einmalcode.codeHash, hashVon(code)), isNull(einmalcode.eingeloestAm), gt(einmalcode.ablauf, jetzt)))
    .returning()
    .all();
  if (verbraucht.length !== 1) return { ok: false, code: "code_ungueltig" };
  const z = verbraucht[0];
  if (!gleich(challenge, z.challenge)) return { ok: false, code: "verifier_falsch" };
  return {
    ok: true,
    sub: z.sub,
    name: z.name,
    einrichtung: z.einrichtungArt && z.rechnerName !== null ? { art: z.einrichtungArt, name: z.rechnerName, ersetzen: z.ersetzen } : null,
  };
}
