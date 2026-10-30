/**
 * DAS ABO FÜR DIE SERVERWARTUNG — ein ntfy-Thema, und seine Vorgabe ist AUS.
 *
 * Wartungsfenster und Ausfälle des Suite-Servers kündigt der Betrieb über ntfy
 * an. Diese Datei beantwortet zwei Fragen: ist das Abo eingerichtet, und wer
 * darf es sehen? Ohne die Variable lautet die erste Antwort `null`, und dann
 * gibt es weder Seite noch Menüeintrag.
 *
 * ⚠️ DER LINK IST EIN GEHEIMNIS, UND DAS REPO IST ÖFFENTLICH. Ein ntfy-Thema
 * hat kein Passwort: wer den Namen kennt, liest mit und kann selbst an alle
 * Abonnenten senden. Der Wert steht deshalb nur in der Server-`.env`, nie im
 * Quelltext, in Tests, Screenshots oder Release Notes — die Tests hier nehmen
 * ausgedachte Themen.
 *
 * ⚠️ WARUM NTFY.SH UND KEIN EIGENER SERVER AUF DEM SUITE-SERVER: der eigene
 * schwiege genau dann, wenn der Suite-Server in Wartung ist oder ausfällt —
 * also im einzigen Fall, um den es geht. Ein Wechsel auf einen anderen Server
 * ist eine Zeile in der `.env`, der Code nimmt jeden Host.
 *
 * ⚠️ KEIN `"use client"` (Falle 6, `CLAUDE.md`): das Portal-Layout und die
 * Seite lesen beide Funktionen als Server Components.
 *
 * ⚠️ SERVERSEITIG, NICHT `NEXT_PUBLIC_*`: ein `NEXT_PUBLIC_`-Wert würde zur
 * Bauzeit in das öffentliche Image eingebacken — und stünde damit in jedem
 * ausgelieferten Bundle, auch für Personen ohne Recht.
 */

import { hasAnyGroup, suiteAdminGroup } from "@/core/groups";

/** Wie in `registry.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/** Die vollständige Abo-Adresse, z. B. `https://ntfy.sh/<thema>`. */
export const WARTUNG_NTFY_ENV = "SUITE_WARTUNG_NTFY_URL";

/**
 * Zusätzliche Gruppen (kommagetrennt), die das Abo sehen dürfen. Die
 * Suite-Admin-Gruppe (`ADMIN_GROUP`, „Suite: Betrieb") darf es immer.
 *
 * ⚠️ BEWUSST NICHT `SUITE_ACCESS_GROUP_*` ODER `SUITE_ADMIN_GROUP_*`: beide
 * Präfixe prüft `validateGroupConfig` gegen die Modulliste, und eine
 * „Serverwartung" ist kein Modul — der Start bräche mit einem Tippfehler-Befund
 * ab, der keiner ist.
 */
export const WARTUNG_GRUPPEN_ENV = "SUITE_WARTUNG_GROUPS";

/** So heißt das Abo in der Android-App (`?display=` des `ntfy://`-Links). */
export const WARTUNG_ANZEIGENAME = "I&K Serverwartung";

export interface WartungsAbo {
  /** Die Adresse aus der `.env`, normalisiert (ohne Schrägstrich am Ende). */
  readonly url: string;
  /** Host samt Port, so wie man ihn in der App als Server einträgt. */
  readonly server: string;
  /** `https://<server>` — für „Anderen Server verwenden" in der App. */
  readonly serverUrl: string;
  /** ntfy.sh ist in den Apps die Vorgabe; dann entfällt der Server-Schritt. */
  readonly standardServer: boolean;
  readonly thema: string;
  /** `ntfy://`-Link: öffnet die Android-App und abonniert direkt. */
  readonly appLink: string;
}

/**
 * ntfys eigene Regel für Themennamen. Ein Thema mit anderen Zeichen nimmt der
 * Server nicht an — der Fehler fiele erst auf, wenn die erste Wartung
 * niemanden erreicht.
 */
const THEMA = /^[A-Za-z0-9_-]{1,64}$/;

let schonGewarnt = false;

/** Nur für Tests: die Warnsperre zurücknehmen. */
export function _warnsperreZuruecksetzen(): void {
  schonGewarnt = false;
}

/**
 * Das Abo — oder `null` für „nicht eingerichtet". Ein gesetzter, aber
 * unbrauchbarer Wert bricht den Start nicht ab (wie beim Rückmeldeweg), er
 * schreibt einmal je Prozess eine Warnung ins Serverlog. Die Warnung nennt den
 * Wert NICHT: er ist ein Geheimnis und hätte im Log nichts verloren.
 */
export function wartungsAbo(
  env: EnvLike = process.env,
  warnen: (meldung: string) => void = console.warn,
): WartungsAbo | null {
  const roh = env[WARTUNG_NTFY_ENV]?.trim();
  if (!roh) return null;

  const abo = zerlege(roh);
  if (!abo && !schonGewarnt) {
    schonGewarnt = true;
    warnen(
      `${WARTUNG_NTFY_ENV} ist gesetzt, aber keine ntfy-Abo-Adresse der Form ` +
        `https://<server>/<thema> — die Seite „Serverwartung" bleibt aus.`,
    );
  }
  return abo;
}

function zerlege(roh: string): WartungsAbo | null {
  let adresse: URL;
  try {
    adresse = new URL(roh);
  } catch {
    return null;
  }
  // Nur http(s): der Wert landet als `href`, und `javascript:` wäre dort eine
  // Skriptausführung mit den Rechten der Suite.
  if (adresse.protocol !== "https:" && adresse.protocol !== "http:") return null;
  if (adresse.search || adresse.hash || adresse.username || adresse.password) return null;

  const thema = adresse.pathname.replace(/^\/+|\/+$/g, "");
  if (!THEMA.test(thema)) return null;

  const sicher = adresse.protocol === "https:";
  const server = adresse.host;
  const display = `display=${encodeURIComponent(WARTUNG_ANZEIGENAME)}`;
  return {
    url: `${adresse.protocol}//${server}/${thema}`,
    server,
    serverUrl: `${adresse.protocol}//${server}`,
    standardServer: sicher && server === "ntfy.sh",
    thema,
    appLink: `ntfy://${server}/${thema}?${display}${sicher ? "" : "&secure=false"}`,
  };
}

/** Die Gruppen, die das Abo sehen dürfen: immer der Suite-Betrieb, dazu die aus der `.env`. */
export function wartungsGruppen(env: EnvLike = process.env): string[] {
  const zusaetzlich = (env[WARTUNG_GRUPPEN_ENV] ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  return [...new Set([suiteAdminGroup(env), ...zusaetzlich])];
}

/**
 * Darf diese Person das Abo sehen? `null` heißt „nicht angemeldet" und darf
 * nie. Bewusst nicht `isModuleAdmin("portal")`: wer das Portal verwalten darf,
 * muss nicht zum Betrieb gehören, und wer zum Betrieb gehört, muss das Portal
 * nicht verwalten.
 */
export function darfWartungSehen(
  groups: readonly string[] | null | undefined,
  env: EnvLike = process.env,
): boolean {
  return hasAnyGroup(groups, wartungsGruppen(env));
}
