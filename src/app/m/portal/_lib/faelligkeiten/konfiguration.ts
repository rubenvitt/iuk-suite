/**
 * DER PUSH FÜR „WAS STEHT AN" — ein eigenes Thema auf dem eigenen ntfy-Container (IDA-297), und die
 * Vorgabe ist AUS. Ohne `SUITE_FAELLIG_NTFY_URL` gibt es keinen Abo-Abschnitt; ohne Token wird nichts
 * gesendet.
 *
 * ⚠️ BEWUSST NICHT DAS THEMA DER SERVERWARTUNG UND NICHT NTFY.SH. Die Wartung braucht einen Server, der
 * weiterläuft, wenn der Suite-Server ausfällt (`serverwartung.ts`). Für eine Erinnerung an Fristen ist
 * das unkritisch: fällt der Server aus, kommt sie einen Tag später.
 *
 * ⚠️ SCHREIBEN NUR MIT TOKEN. Der Container läuft mit `deny-all` als Vorgabe; die Suite sendet als
 * eigener ntfy-Benutzer mit Token, alle anderen dürfen das Thema höchstens lesen (Runbook
 * `docs/runbooks/faelligkeiten-ntfy.md`). Anders als beim Wartungsthema kann also niemand, der den
 * Namen kennt, an alle Abonnenten senden. Lesen kann er trotzdem, deshalb steht im Push kein Klarname
 * (`core/faelligkeiten.ts`, Feld `person`).
 *
 * ⚠️ SERVERSEITIG, NICHT `NEXT_PUBLIC_*` — dieselbe Begründung wie in `serverwartung.ts`.
 * Kein `"use client"` (Falle 6).
 */
import { FAELLIG_ANZEIGENAME, ntfyAboAus, type NtfyAbo } from "@/app/m/portal/_lib/ntfy";

type EnvLike = Record<string, string | undefined>;

/** Die öffentliche Abo-Adresse, z. B. `https://ntfy.iuk-ue.de/<thema>`. */
export const FAELLIG_NTFY_ENV = "SUITE_FAELLIG_NTFY_URL";
/** Das Token des ntfy-Benutzers, mit dem die Suite sendet (`tk_…`). */
export const FAELLIG_TOKEN_ENV = "SUITE_FAELLIG_NTFY_TOKEN";
/**
 * Optional: die Adresse, über die die Suite den Container erreicht (`http://ntfy` im Compose-Netz).
 * Ohne sie geht der Versand an den Server aus `SUITE_FAELLIG_NTFY_URL`.
 */
export const FAELLIG_INTERN_ENV = "SUITE_FAELLIG_NTFY_INTERN";

export { FAELLIG_ANZEIGENAME };

export interface SendeZiel {
  /** Wohin gepostet wird: die Wurzel des ntfy-Servers, ohne Schrägstrich am Ende. */
  basis: string;
  thema: string;
  token: string;
}

let schonGewarnt = false;

/** Nur für Tests: die Warnsperre zurücknehmen. */
export function _warnsperreZuruecksetzen(): void {
  schonGewarnt = false;
}

function warneEinmal(meldung: string, warnen: (m: string) => void): void {
  if (schonGewarnt) return;
  schonGewarnt = true;
  warnen(meldung);
}

/** Das Abo für die Anleitung — oder `null` für „nicht eingerichtet". Die Warnung nennt den Wert nicht. */
export function faelligkeitenAbo(env: EnvLike = process.env, warnen: (m: string) => void = console.warn): NtfyAbo | null {
  const roh = env[FAELLIG_NTFY_ENV]?.trim();
  if (!roh) return null;
  const abo = ntfyAboAus(roh, FAELLIG_ANZEIGENAME);
  if (!abo) {
    warneEinmal(`${FAELLIG_NTFY_ENV} ist gesetzt, aber keine ntfy-Abo-Adresse der Form https://<server>/<thema> — der Push für „Was steht an" bleibt aus.`, warnen);
  }
  return abo;
}

/** Wohin und womit gesendet wird — oder `null`, dann sendet der wöchentliche Takt nichts. */
export function sendeZiel(env: EnvLike = process.env, warnen: (m: string) => void = console.warn): SendeZiel | null {
  const abo = faelligkeitenAbo(env, warnen);
  if (!abo) return null;
  const token = env[FAELLIG_TOKEN_ENV]?.trim();
  if (!token) {
    warneEinmal(`${FAELLIG_NTFY_ENV} ist gesetzt, ${FAELLIG_TOKEN_ENV} fehlt — der Push für „Was steht an" bleibt aus.`, warnen);
    return null;
  }
  const intern = env[FAELLIG_INTERN_ENV]?.trim();
  let basis = abo.serverUrl;
  if (intern) {
    try {
      const u = new URL(intern);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Protokoll");
      basis = `${u.protocol}//${u.host}`;
    } catch {
      warneEinmal(`${FAELLIG_INTERN_ENV} ist keine http(s)-Adresse — gesendet wird an den öffentlichen Server.`, warnen);
    }
  }
  return { basis, thema: abo.thema, token };
}
