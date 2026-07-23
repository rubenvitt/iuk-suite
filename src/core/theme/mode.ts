import type { ThemeMode } from "@/core/theme/theme";

export type { ThemeMode };

export const THEME_COOKIE = "iuk-theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Der Modus steckt in einem Cookie, nicht im localStorage. Grund ist die
 * Multi-Host-Architektur: localStorage ist pro Origin, die Einstellung auf
 * `qr.iuk-ue.de` gälte auf `iuk-ue.de` also nicht. Ein Cookie auf
 * `.iuk-ue.de` gilt überall — und der Server kann es lesen und damit schon
 * den ersten Render im richtigen Modus ausliefern.
 */
export function parseThemeMode(raw: string | undefined | null): ThemeMode {
  return raw === "dark" ? "dark" : "light";
}

export function themeCookieString(mode: ThemeMode, domain?: string): string {
  const parts = [`${THEME_COOKIE}=${mode}`, "Path=/", `Max-Age=${ONE_YEAR}`, "SameSite=Lax"];
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

/**
 * Läuft als Inline-Script im `<head>`.
 *
 * Es verhindert KEIN Flackern — das tut das serverseitig gelesene Cookie.
 * Seine einzige Aufgabe ist, beim allerersten Besuch die OS-Präferenz ins
 * Cookie zu schreiben, damit sie ab dem nächsten Seitenaufruf greift. Wer das
 * hier anfasst, soll nicht die next-themes-Denkweise ("Blocking-Script gegen
 * FOUC") hineinlesen: die trägt in dieser Architektur nicht.
 */
export function themeInitScript(domain?: string): string {
  const domainPart = domain ? `;Domain=${domain}` : "";
  return (
    `(function(){try{` +
    `if(document.cookie.indexOf('${THEME_COOKIE}=')>-1)return;` +
    `var m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';` +
    `document.cookie='${THEME_COOKIE}='+m+';Path=/;Max-Age=${ONE_YEAR};SameSite=Lax${domainPart}';` +
    `}catch(e){}})()`
  );
}
