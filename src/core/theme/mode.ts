import type { ThemeMode, ThemePreference } from "@/core/theme/theme";

export type { ThemeMode, ThemePreference };

/**
 * Der Modus steckt in Cookies, nicht im localStorage. Grund ist die
 * Multi-Host-Architektur: localStorage ist pro Origin, die Einstellung auf
 * `qr.iuk-ue.de` gälte auf `iuk-ue.de` also nicht. Ein Cookie auf
 * `.iuk-ue.de` gilt überall — und der Server kann es lesen und damit schon
 * den ersten Render im richtigen Modus ausliefern.
 *
 * ZWEI Cookies, und das ist der Kern des Auto-Modus: der Server sieht
 * `prefers-color-scheme` nicht, die Medienabfrage existiert nur im Browser.
 * `iuk-theme-pref` trägt die WAHL (auch `auto`), `iuk-theme-system` den
 * zuletzt vom Client beobachteten OS-Wert. Erst beide zusammen ergeben den
 * Modus, den `<html data-theme>` stempeln darf.
 */
export const THEME_PREF_COOKIE = "iuk-theme-pref";
export const THEME_SYSTEM_COOKIE = "iuk-theme-system";

/**
 * Der Vorgänger, der Wahl UND Auflösung in einem Wert führte. Er wird nicht
 * mehr gelesen — und genau DAS ist die Migration: unter dem neuen Schlüssel
 * hat niemand einen Wert, also gilt `auto` für alle. Das Init-Script räumt ihn
 * ab, damit er nicht ein Jahr lang mitgeschickt wird.
 *
 * Nötig war der Namenswechsel, weil `iuk-theme` bei jedem Bestandsnutzer
 * gesetzt ist — vom alten Init-Script automatisch geschrieben und von einer
 * bewussten Wahl nicht unterscheidbar.
 */
export const LEGACY_THEME_COOKIE = "iuk-theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Liest das SYSTEM-Cookie: `dark` heißt dunkel, alles andere hell. Ein
 * fehlender oder kaputter Wert darf die Seite nicht in einen dritten Zustand
 * kippen.
 */
export function parseThemeMode(raw: string | undefined | null): ThemeMode {
  return raw === "dark" ? "dark" : "light";
}

/**
 * Liest das PRÄFERENZ-Cookie. Alles, was keine ausdrückliche Wahl ist — auch
 * ein kaputter Wert —, ist `auto`. Das ist die Vorgabe der Suite.
 */
export function parseThemePreference(raw: string | undefined | null): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "auto";
}

/**
 * Die einzige Stelle, an der aus zwei Cookies ein Modus wird.
 *
 * Rein und ohne React, damit `layout.tsx` (Server Component) und
 * `AntdProvider` (Client) dieselbe Rechnung benutzen — zwei Auflösungen liefen
 * auseinander, ohne dass ein Test rot würde.
 */
export function resolveThemeMode(pref: ThemePreference, system: ThemeMode): ThemeMode {
  return pref === "auto" ? system : pref;
}

function cookieString(name: string, wert: string, domain?: string): string {
  const parts = [`${name}=${wert}`, "Path=/", `Max-Age=${ONE_YEAR}`, "SameSite=Lax"];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

export function themePreferenceCookieString(pref: ThemePreference, domain?: string): string {
  return cookieString(THEME_PREF_COOKIE, pref, domain);
}

export function themeSystemCookieString(mode: ThemeMode, domain?: string): string {
  return cookieString(THEME_SYSTEM_COOKIE, mode, domain);
}

/**
 * @deprecated Übergang. Schreibt noch den Altschlüssel und hat genau eine
 * Aufruferin: `AntdProvider`, das erst in Task 3 auf die getrennten Cookies
 * umgestellt wird. Fällt mit dieser Umstellung weg — beides zusammen, damit
 * der Baum nach jedem Commit übersetzt.
 */
export function themeCookieString(mode: ThemeMode, domain?: string): string {
  return cookieString(LEGACY_THEME_COOKIE, mode, domain);
}

/**
 * Läuft als Inline-Script im `<head>`.
 *
 * Es verhindert KEIN Flackern — das tut das serverseitig gelesene Cookie.
 * Seine Aufgabe ist, den Betriebssystem-Wert ins Cookie zu schreiben, damit
 * der NÄCHSTE Seitenaufruf serverseitig richtig auflöst. Wer das hier anfasst,
 * soll nicht die next-themes-Denkweise ("Blocking-Script gegen FOUC")
 * hineinlesen: die trägt in dieser Architektur nicht.
 *
 * ES STEMPELT BEWUSST KEIN `data-theme`. Das wäre der naheliegende Fix für das
 * Aufblitzen beim allerersten Besuch und ist schlimmer als das Problem: antd
 * wählt seinen Algorithmus aus React-State, den dieses Script nicht erreicht.
 * Das Attribut zeigte dann dunkel, während antd hell rendert — ein DAUERHAFT
 * inkonsistenter Zustand statt eines einmaligen Aufblitzens.
 *
 * Es ist NICHT durch den `matchMedia`-Effekt in `AntdProvider` ersetzbar,
 * obwohl beide dasselbe Cookie schreiben: dieses Script läuft vor dem ersten
 * Paint und unabhängig von der Hydration, der Effekt erst danach. Wer die
 * Seite verlässt, bevor React übernimmt, hätte sonst beim nächsten Besuch
 * wieder keinen Systemwert. Der Effekt kann dafür, was dieses Script nicht
 * kann: auf einen Wechsel WÄHREND der Sitzung reagieren.
 */
export function themeInitScript(domain?: string): string {
  const domainPart = domain ? `;Domain=${domain}` : "";
  const optionen = `;Path=/;Max-Age=${ONE_YEAR};SameSite=Lax${domainPart}`;
  return (
    `(function(){try{` +
    `var m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';` +
    `var c=document.cookie;` +
    // Vergleichen, dann schreiben: der unveraenderte Normalfall fasst
    // `document.cookie` gar nicht erst an.
    `if(c.indexOf('${THEME_SYSTEM_COOKIE}='+m)===-1){` +
    `document.cookie='${THEME_SYSTEM_COOKIE}='+m+'${optionen}';}` +
    // Der Altschluessel. Zweimal, weil Loeschen Domain und Pfad treffen muss
    // und beide Formen im Umlauf sind (mit AUTH_COOKIE_DOMAIN und ohne).
    `if(c.indexOf('${LEGACY_THEME_COOKIE}=')>-1){` +
    `document.cookie='${LEGACY_THEME_COOKIE}=;Path=/;Max-Age=0;SameSite=Lax${domainPart}';` +
    `document.cookie='${LEGACY_THEME_COOKIE}=;Path=/;Max-Age=0;SameSite=Lax';}` +
    `}catch(e){}})()`
  );
}
