/**
 * VERLASSEN-SPERRE (IDA-357): ein Modul meldet hier, dass ein Weg aus der Seite etwas kostet —
 * im Kommplan-Editor ein offener Speicherkonflikt, dessen lokale Fassung sonst verloren ist. Das
 * Menü (`Navigator.tsx`) und der Rückweg im `Seitenkopf` fragen vor dem Verlassen nach
 * (`useVerlassenWache`, `verlassenWache.ts`).
 *
 * Ohne `"use client"` (Falle 6): der Speicher ist reiner Modulzustand, den Client-Komponenten
 * verschiedener Module teilen. Gesetzt wird er nur im Browser (Effekte); auf dem Server bleibt er leer.
 *
 * `bestaetigt` gilt, bis sich die Sperren ändern: nach „Trotzdem verlassen" läuft der Klick ein
 * zweites Mal durch die Wache, und ein Ziel außerhalb der App (harter Seitenwechsel) soll danach
 * nicht noch einmal die `beforeunload`-Frage des Browsers stellen. Ein weicher Seitenwechsel baut
 * die sperrende Komponente ab, und mit ihrer Sperre fällt auch die Bestätigung.
 */
export interface VerlassenSperre {
  titel: string;
  text: string;
}

const sperren: VerlassenSperre[] = [];
let bestaetigt = false;

/** Meldet eine Sperre an; die Rückgabe hebt genau diese wieder auf. */
export function sperreVerlassen(sperre: VerlassenSperre): () => void {
  const eintrag = { ...sperre };
  sperren.push(eintrag);
  bestaetigt = false;
  return () => {
    const i = sperren.indexOf(eintrag);
    if (i === -1) return;
    sperren.splice(i, 1);
    bestaetigt = false;
  };
}

/** Die jüngste Sperre, oder `null`, wenn nichts sperrt oder das Verlassen schon bestätigt ist. */
export function offeneSperre(): VerlassenSperre | null {
  return bestaetigt ? null : (sperren.at(-1) ?? null);
}

export function bestaetigeVerlassen(): void {
  bestaetigt = true;
}

/** Für die `beforeunload`-Hörer der Module: nach „Trotzdem verlassen" nicht noch einmal fragen. */
export function verlassenBestaetigt(): boolean {
  return bestaetigt;
}
