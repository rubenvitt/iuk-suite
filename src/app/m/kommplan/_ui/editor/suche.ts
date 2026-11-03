import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";

const norm = (s: string) => s.toLocaleLowerCase("de").normalize("NFC");

/**
 * Ausgeschriebene Namen für Zeichen, die der Katalog nur als Abkürzung betitelt (Review Phase 2:
 * „Rettungswagen“ fand nichts). Nur Zeichen, die es im Generat gibt; typische Einsatzmittel bringen
 * ihre Langformen als Aliase selbst mit. `suche.test.ts` prüft jeden Schlüssel gegen den echten Index.
 */
export const LANGFORMEN: Readonly<Record<string, string>> = {
  "rezept:F.2.1": "krankentransportwagen",
  "rezept:F.2.2": "notfallkrankentransportwagen",
  "rezept:F.2.3": "rettungswagen",
  "rezept:F.2.4": "notarzteinsatzfahrzeug",
  "rezept:F.2.5": "notarztwagen",
};

/** Die Beispiele im Platzhalter der Suche — jedes muss etwas finden (`suche.test.ts`). */
export const SUCHBEISPIELE = ["Einsatzleitung", "Rettungswagen", "D.1.4"] as const;

/**
 * Alle Wörter müssen in Titel, Suchtext oder Langform stehen. Rang: ganzer Name (Titel oder Langform) vor Namensanfang
 * vor Namensmitte vor Suchtext, dann nach Titel — sonst stünde „RTW“ bei „Rettungswagen“ hinter den typischen
 * Sonderformen (Großraum-, Infektionsrettungswagen …), die das Wort im Titel tragen.
 */
export function sucheZeichen(index: readonly ZeichenIndexEintrag[], anfrage: string, max = 24): ZeichenIndexEintrag[] {
  const woerter = norm(anfrage).split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return [];
  const ganz = woerter.join(" ");
  const rang = (e: ZeichenIndexEintrag) => {
    const namen = [norm(e.titel), LANGFORMEN[e.schluessel] ?? ""].filter(Boolean);
    if (namen.includes(ganz)) return 0;
    return namen.some((n) => n.startsWith(woerter[0])) ? 1 : namen.some((n) => n.includes(woerter[0])) ? 2 : 3;
  };
  return index
    .filter((e) => { const t = `${norm(e.titel)} ${norm(e.suchtext)} ${LANGFORMEN[e.schluessel] ?? ""}`; return woerter.every((w) => t.includes(w)); })
    .sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1))
    .slice(0, max);
}
