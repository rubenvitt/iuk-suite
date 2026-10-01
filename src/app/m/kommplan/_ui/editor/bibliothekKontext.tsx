"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { LEERE_BIBLIOTHEK, type BibEinheit, type BibStelle, type BibVerbindung, type Bibliothek } from "../../_lib/bibliothek/typen";

/**
 * DIE BIBLIOTHEK IM EDITOR (Umsetzungsplan Phase 4, Entscheidung 13): ein Kontext statt Props durch Flyin,
 * Einheitenliste und Gliederung. Der Wert ändert sich nur, wenn die Bibliothek sich ändert (eine Übernahme
 * per `merke`) — die `memo`-gebundenen Gliederungszeilen rendern beim Tippen deshalb nicht mit (Phase 3,
 * Entscheidung 2; `GliederungLast.test.tsx`). Ohne Anbieter: `aktiv: false`, leere Bibliothek — die neuen
 * Felder erscheinen nicht, kein Absturz.
 */
export interface BibTeil { stellen?: readonly BibStelle[]; einheiten?: readonly BibEinheit[]; verbindungen?: readonly BibVerbindung[] }
export interface BibliothekImEditor { aktiv: boolean; bib: Bibliothek; merke(teil: BibTeil): void }
export const BibliothekKontext = createContext<BibliothekImEditor>({ aktiv: false, bib: LEERE_BIBLIOTHEK, merke: () => {} });
export const useBibliothek = () => useContext(BibliothekKontext);

const de = (a: string, b: string) => a.localeCompare(b, "de");
/** Neue oder geänderte Einträge nach ID ersetzen bzw. ergänzen, sortiert wie `ladeBibliothek`. */
function fuegeZu<T extends { id: string }>(alt: T[], neu: readonly T[] | undefined, ordnung: (a: T, b: T) => number): T[] {
  if (!neu || neu.length === 0) return alt;
  const ids = new Set(neu.map((n) => n.id));
  return [...alt.filter((x) => !ids.has(x.id)), ...neu].sort(ordnung);
}

export function BibliothekAnbieter({ start, children }: { start: Bibliothek; children: ReactNode }) {
  const [bib, setBib] = useState(start);
  const wert = useMemo<BibliothekImEditor>(() => ({
    aktiv: true,
    bib,
    merke: (t) => setBib((b) => ({
      stellen: fuegeZu(b.stellen, t.stellen, (x, y) => de(x.titel, y.titel)),
      einheiten: fuegeZu(b.einheiten, t.einheiten, (x, y) => de(x.typ, y.typ) || de(x.rufname, y.rufname)),
      verbindungen: fuegeZu(b.verbindungen, t.verbindungen, (x, y) => de(x.bezeichnung, y.bezeichnung) || de(x.art, y.art)),
    })),
  }), [bib]);
  return <BibliothekKontext.Provider value={wert}>{children}</BibliothekKontext.Provider>;
}
