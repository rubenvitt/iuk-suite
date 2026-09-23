/**
 * Der Titel eines Geraets — fuer die Akte (`admin/(arbeit)/geraete/[id]/page.tsx`) UND ihre
 * Aenderungshistorie (`…/[id]/ereignisse/page.tsx`), aus EINER Stelle (DRK-455).
 *
 * ⛔ KEIN `"use client"` — Falle 6 (`CLAUDE.md`, Punkt 6). Beide Aufrufer sind Server
 * Components und brauchen den WERT.
 *
 * Die Rueckfallkette ist 1:1 aus `radio-admin/client/src/features/devices/DeviceDetailDrawer.tsx:61`
 * — mit `||` und nicht mit `??`, weil Rufname und OPTA Freitext sind und die LEERE
 * Zeichenkette weiterfallen soll.
 *
 * ⛔ `issiNeben` IST `null`, WENN DER TITEL SELBST SCHON DIE ISSI IST. Bis DRK-455 fuehrte die
 * Historie die Kette zum zweiten Mal selbst und haengte die ISSI unbedingt in Klammern an;
 * ein Geraet ohne Rufname und OPTA (im lokalen Seed jedes zweite) stand dort als
 * „Änderungen: 1000008 (1000008)". Die Akte hatte denselben Fehler mit DRK-462 schon
 * verloren — die zweite Stelle war der Grund, dass er auf der anderen Seite stehen blieb.
 */
export function geraetTitel(akte: {
  issi: string;
  rufname: string | null;
  opta: string | null;
}): { titel: string; issiNeben: string | null } {
  const titel = akte.rufname || akte.opta || akte.issi;
  return { titel, issiNeben: titel === akte.issi ? null : akte.issi };
}
