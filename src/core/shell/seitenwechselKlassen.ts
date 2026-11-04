/**
 * Die Klassen des Seitenwechsels (`Seitenwechsel.tsx`) und der Name, unter dem das Menü beim
 * Wechsel stillsteht. Die Regeln dazu stehen in `globals.css` unter „SEITENWECHSEL";
 * `seitenwechsel.test.tsx` hält beide Seiten gleich. Reine Werte, kein "use client" (Falle 6).
 */
export const SEITENWECHSEL = {
  /** `view-transition-class` des neuen Inhalts. */
  ein: "iuk-seite-ein",
  /** `view-transition-class` des alten Inhalts. */
  aus: "iuk-seite-aus",
  /** `view-transition-name` des Menüs (Kopfzeile am Telefon, Seitenleiste am Desktop). */
  menue: "iuk-menue",
  /** `view-transition-name` des Menüblatts am Telefon, solange es sich schließt. */
  blatt: "iuk-menueblatt",
} as const;
