import { auth } from "@/core/auth";
import { leseAnsprechpartner } from "@/app/m/portal/_lib/einstellungen";
import { canAccess, einstiegFuerHost, moduleForHost, visibleSwitcherModules } from "@/core/registry";

/**
 * WAS DIE RANDSEITEN (404, 403, Fehlergrenze) ÜBER DIE PERSON WISSEN DÜRFEN (IDA-392).
 *
 * Kein `"use client"`: die Werte gehen an Server Components (Falle 6). Die Fehlergrenze selbst ist ein
 * Client-Modul und liest von hier nur, was das Root-Layout als `data-portal` an `<html>` stempelt.
 */

type EnvLike = Record<string, string | undefined>;

export { portalUrl } from "./portal";

/**
 * Führt `/` auf diesem Host auf eine Seite, die diese Person sehen darf?
 *
 * Auf dem Suite-Host ist `/` das Portal, das jede angemeldete Person sieht. Auf einem Modul-Host ist `/`
 * die Modulwurzel, und die riegeln viele Module erst im Modul (`requiresAuth: false`, Gruppe in
 * `_lib/zugang.ts`) — mit `notFound()`. Ein 404 mit „Zur Startseite" führte dann im Kreis.
 *
 * Maßstab ist dieselbe Sichtbarkeit wie im App-Umschalter (`visibleSwitcherModules`): was dort steht,
 * öffnet für diese Person. Module ohne Umschalter-Eintrag kennen keinen zweiten Riegel an der Wurzel;
 * dort genügt `canAccess`. Ein Einstiegshost ist ein öffentlicher Pfadraum (IDA-340).
 */
export function modulWurzelOffen(host: string, gruppen: string[], env: EnvLike = process.env): boolean {
  if (einstiegFuerHost(host, env)) return true;
  const modul = moduleForHost(host, env);
  if (!modul || modul.key === "portal") return true;
  if (!canAccess(modul, gruppen, env)) return false;
  if (!modul.showInSwitcher) return true;
  return visibleSwitcherModules(gruppen, env).some((m) => m.key === modul.key);
}

export interface Zugangsauskunft {
  /** `null` = nicht angemeldet. */
  gruppen: string[] | null;
  /** Wie sich die Person angemeldet hat: E-Mail, sonst Name. */
  konto: string | null;
  /** Der „Ansprechpartner für Zugänge" aus der Portal-Verwaltung. */
  ansprechpartner: string | null;
}

/**
 * Sitzung und Ansprechpartner, ohne je zu werfen: eine Randseite, die selbst fehlschlägt, wäre die
 * schlechteste Antwort auf einen Fehler. Kein Auffrischen hier — `auth()` aus einer Server Component
 * liest nur (Zugriffsschutz in `CLAUDE.md`).
 */
export async function leseZugangsauskunft(): Promise<Zugangsauskunft> {
  let gruppen: string[] | null = null;
  let konto: string | null = null;
  try {
    const sitzung = await auth();
    if (sitzung?.user) {
      gruppen = sitzung.user.groups ?? [];
      konto = sitzung.user.email?.trim() || sitzung.user.name?.trim() || null;
    }
  } catch {
    gruppen = null;
  }
  if (gruppen === null) return { gruppen: null, konto: null, ansprechpartner: null };

  let ansprechpartner: string | null = null;
  try {
    ansprechpartner = await leseAnsprechpartner();
  } catch {
    ansprechpartner = null;
  }
  return { gruppen, konto, ansprechpartner };
}
