/**
 * Die fachsemantische Palette des Lernbereichs — modul-eigen, nach Vorbild
 * `feedback/_lib/noten.ts`.
 *
 * ⛔ KEIN SUITE-ROT. `colorError === colorPrimary === #c8000f`: ein rotes "falsch" saehe
 * aus wie eine Primaeraktion, und auf einer Flaeche, auf der Rot fachliche Bedeutung
 * traegt, gehoert die Markenfarbe nicht auf eine Datenflaeche (Falle 3).
 *
 * ⛔ BEDEUTUNG NIE ALLEIN UEBER FARBE. Die Oberflaeche setzt WORT zuerst ("Richtig" /
 * "Nicht ganz"), ZEICHEN zweitens, Farbe zuletzt.
 */
export const LERNFARBEN = {
  richtig:   { hell: "#1f7a4d", dunkel: "#4ec98a" },
  falsch:    { hell: "#8a5a00", dunkel: "#e0a34a" },
  gefestigt: { hell: "#14603c", dunkel: "#3fae76" },
  offen:     { hell: "#5c6470", dunkel: "#9aa4b2" },
} as const;

export type Lernzustand = keyof typeof LERNFARBEN;
