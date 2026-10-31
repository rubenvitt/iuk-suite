/**
 * EINE NTFY-ABO-ADRESSE ZERLEGEN — geteilt von „Serverwartung" (`serverwartung.ts`, ntfy.sh) und
 * „Was steht an" (`faelligkeiten/konfiguration.ts`, eigener ntfy-Container, IDA-297).
 *
 * Kein `"use client"` (Falle 6): Layout und Seiten lesen sie als Server Components.
 */

/** So heißen die Abos in der Android-App (`?display=` des `ntfy://`-Links). Hier, weil keine Abhängigkeit. */
export const WARTUNG_ANZEIGENAME = "I&K Serverwartung";
export const FAELLIG_ANZEIGENAME = "I&K Was steht an";

export interface NtfyAbo {
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
 * Server nicht an — der Fehler fiele erst auf, wenn die erste Nachricht
 * niemanden erreicht.
 */
const THEMA = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `https://<server>/<thema>` → das Abo, sonst `null`. `anzeigename` ist der Name
 * des Abos in der Android-App (`?display=` des `ntfy://`-Links).
 */
export function ntfyAboAus(roh: string, anzeigename: string): NtfyAbo | null {
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
  const display = `display=${encodeURIComponent(anzeigename)}`;
  return {
    url: `${adresse.protocol}//${server}/${thema}`,
    server,
    serverUrl: `${adresse.protocol}//${server}`,
    standardServer: sicher && server === "ntfy.sh",
    thema,
    appLink: `ntfy://${server}/${thema}?${display}${sicher ? "" : "&secure=false"}`,
  };
}
