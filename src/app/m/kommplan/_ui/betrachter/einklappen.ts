"use client";

import { useState } from "react";

/**
 * EINKLAPPEN IST ANSICHTSZUSTAND (Spec §5.4), in Betrachter und Editor gleich: eine Menge eingeklappter Stellen und
 * `umschalten` für den Knopf an der Karte. „Alle ausklappen" setzt die leere Menge. Ein Hook statt zweier Kopien
 * (Abnahme kommplan); der Editor setzt die Menge zusätzlich selbst (eine gewählte Stelle bleibt sichtbar).
 */
export function useEingeklappt() {
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  return { eingeklappt, setEingeklappt, umschalten };
}
