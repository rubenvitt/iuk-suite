"use client";

import { useEffect } from "react";
import { schreibeMerkliste, type MerkEintrag } from "../_lib/merkgeraet";

/**
 * Die duenne Client-Haelfte des Spiegels: sie schreibt und rendert nichts.
 *
 * Sie bekommt AUSSCHLIESSLICH serialisierbare Daten als Prop — kein
 * Datenbankobjekt, keine Funktion (Falle 9: eine Funktion ueber die
 * RSC-Grenze lehnt React ab, und `build` sieht das nicht).
 *
 * `JSON.stringify` in der Abhaengigkeitsliste, nicht das Array selbst: der
 * Server erzeugt bei jedem Rendern ein NEUES Array mit gleichem Inhalt, und
 * ohne diesen Vergleich schriebe der Effekt bei jeder Navigation erneut.
 */
export function MerklisteSpiegelInsel({ eintraege }: { eintraege: readonly MerkEintrag[] }) {
  const kennung = JSON.stringify(eintraege);
  useEffect(() => {
    void schreibeMerkliste(JSON.parse(kennung) as MerkEintrag[]);
  }, [kennung]);
  return null;
}
