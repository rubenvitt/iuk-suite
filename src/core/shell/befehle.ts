import type { LauncherEintrag, SuiteNavItem } from "@/core/shell/types";

/**
 * DIE EINTRÄGE DER BEFEHLSPALETTE (Strg+K / ⌘K, IDA-303) — als reine Funktion, damit sie ohne
 * Rendering prüfbar ist. KEIN `"use client"`: sie hat weder Zustand noch DOM, und so bleibt sie
 * auch für eine Server Component lesbar (Falle 6).
 *
 * Die Palette erfindet KEINE Rechte. Sie zeigt nur, was die Kopfzeile ohnehin schon gefiltert hat:
 * die Launcher-Einträge (`launcherEintraege`, nach Gruppen) und die Navigation des aktuellen Moduls
 * (die jedes Modul-Layout nach seinen Rechten baut). Der letzte Eintrag führt in die suiteweite
 * Suche des Portals, die ihre Rechte in den Modulen prüft (IDA-301).
 */
export type BefehlsGruppe = "Seiten" | "Apps & Dienste" | "Suche";

export interface Befehl {
  key: string;
  titel: string;
  /** Zweite Zeile, z. B. der Abschnitt der Navigation. */
  hinweis?: string;
  gruppe: BefehlsGruppe;
  href: string;
  extern: boolean;
}

/** Für den Vergleich: klein, ohne Leerraum-Unterschiede. */
const falte = (s: string) => s.toLocaleLowerCase("de").replace(/\s+/g, " ").trim();

/** Jedes Wort der Eingabe muss irgendwo im Titel oder Hinweis vorkommen („ver art“ findet „Verwaltung · Artikel“). */
function passt(nadel: string, ...felder: (string | undefined)[]): boolean {
  if (nadel === "") return true;
  const heuhaufen = falte(felder.filter(Boolean).join(" "));
  return nadel.split(" ").every((wort) => heuhaufen.includes(wort));
}

export function befehle({
  eingabe,
  nav,
  eintraege,
  suchHref,
}: {
  eingabe: string;
  nav: SuiteNavItem[];
  eintraege: LauncherEintrag[];
  /** `…/suche` auf dem Portal-Host, oder `null`, wenn das Portal keine Adresse hat. */
  suchHref: string | null;
}): Befehl[] {
  const nadel = falte(eingabe);
  const seiten: Befehl[] = nav
    .filter((n) => passt(nadel, n.title, n.abschnitt))
    .map((n) => ({ key: `nav:${n.key}`, titel: n.title, hinweis: n.abschnitt, gruppe: "Seiten", href: n.href, extern: false }));
  const apps: Befehl[] = eintraege
    .filter((e) => passt(nadel, e.title, e.beschreibung, e.abschnitt))
    .map((e) => ({ key: `app:${e.key}`, titel: e.title, hinweis: e.abschnitt, gruppe: "Apps & Dienste", href: e.href, extern: e.extern }));
  const suche: Befehl[] =
    suchHref && eingabe.trim().length >= 2
      ? [{
          key: "suche",
          titel: `In allen Modulen nach „${eingabe.trim()}“ suchen`,
          gruppe: "Suche",
          href: `${suchHref}?q=${encodeURIComponent(eingabe.trim())}`,
          extern: false,
        }]
      : [];
  return [...seiten, ...apps, ...suche];
}

/** Strg+K, unter macOS ⌘K. Ohne Shift/Alt, damit andere Kürzel frei bleiben. */
export function istPalettenKuerzel(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k";
}
