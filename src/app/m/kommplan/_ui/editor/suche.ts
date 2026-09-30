import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";

const norm = (s: string) => s.toLocaleLowerCase("de").normalize("NFC");

/** Alle Wörter müssen in Titel oder Suchtext stehen; Titelanfang vor Titelmitte vor Suchtext, dann nach Titel. */
export function sucheZeichen(index: readonly ZeichenIndexEintrag[], anfrage: string, max = 24): ZeichenIndexEintrag[] {
  const woerter = norm(anfrage).split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return [];
  const rang = (e: ZeichenIndexEintrag) => (norm(e.titel).startsWith(woerter[0]) ? 0 : norm(e.titel).includes(woerter[0]) ? 1 : 2);
  return index
    .filter((e) => { const t = `${norm(e.titel)} ${norm(e.suchtext)}`; return woerter.every((w) => t.includes(w)); })
    .sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1))
    .slice(0, max);
}
