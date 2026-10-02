import { PIKTOGRAMME, type Symbolquelle } from "../../_lib/zeichen/grundlagen";

export type Symbolsatz = Readonly<Record<string, Symbolquelle>>;

export function symbolId(schluessel: string): string {
  return `kp-${schluessel.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/**
 * Jedes Zeichen EINMAL als <symbol>, referenziert per <use> — löst Befund M11 (doppelte IDs) ohne
 * Präfix je Instanz. Inhalt: Generat oder serverseitig gezeichnete eigene Zeichen (`eigen/zeichne.ts`), nie Nutzer-Markup.
 */
export function SymbolDefs({ symbole }: { symbole: Symbolsatz }) {
  const alle = { ...symbole, ...PIKTOGRAMME };
  return (
    <defs>
      {Object.keys(alle).sort().map((k) => (
        <symbol key={k} id={symbolId(k)} viewBox={alle[k].viewBox} dangerouslySetInnerHTML={{ __html: alle[k].inhalt }} />
      ))}
    </defs>
  );
}
