/**
 * SPÄTER FOKUS NACH EINER ÖFFNUNGSANIMATION (Abnahme kommplan, „Fokusraub"): `afterOpenChange` einer Schublade läuft
 * erst nach der Animation, unter Last eine halbe Sekunde später. Hat die Bearbeitende bis dahin selbst in ein Feld DIESER
 * Schublade geklickt (Telefon, Vorlage-Auswahl …), bleibt der Fokus dort — sonst landete das weiter Getippte im Titel,
 * und eine aufgeklappte Auswahl klappte wieder zu. Steht der Fokus woanders (Fläche, Zeile, Container der Schublade),
 * geht er wie bisher in das Ziel. Kein antd-Klassenname: die Schublade ist `[role="dialog"]` (rc-drawer).
 */
const FELD = 'input, textarea, select, button, [contenteditable="true"], [role="combobox"]';

export function fokussiereWennFrei(ziel: HTMLElement | null | undefined): void {
  if (!ziel) return;
  const rahmen = ziel.closest('[role="dialog"]');
  const aktiv = typeof document === "undefined" ? null : document.activeElement;
  if (rahmen && aktiv instanceof HTMLElement && aktiv !== ziel && rahmen.contains(aktiv) && aktiv.matches(FELD)) return;
  ziel.focus();
}

/**
 * Für die Flyins des Editors: keine Fokus-Rückgabe der Schublade nach dem Schließen. rc-drawer gäbe den Fokus sonst
 * synchron an das Element zurück, das beim Öffnen fokussiert war — auch wenn die Bearbeitende inzwischen eine andere
 * Zeile angeklickt hat. Den Rückweg entscheidet allein `nachSchliessen` im Editor.
 */
export const OHNE_FOKUSRUECKGABE = { focusTriggerAfterClose: false } as const;
