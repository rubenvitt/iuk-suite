/**
 * DAS PROFIL IN DER HÜLLE (IDA-391): sein Pfad und die Farben des Avatars. Hier und nicht im Portal:
 * Nutzermenü und Ort-Knopf der Hülle brauchen beides, die Profilseite des Portals den Avatar auch.
 * KEIN `"use client"`: reine Werte, auf beiden Seiten lesbar (Falle 6).
 */

/** Pfad der Profilseite auf dem Portal-Host. */
export const PROFIL_PFAD = "/profil";

/**
 * Farben des Avatars ohne Bild. antds Vorgabe ist Weiß auf Hellgrau (1,9:1); hier Tinte auf der
 * Linienfarbe, beides Suite-Variablen mit eigenem Dunkelwert (Falle 2). Den Kontrast in beiden
 * Themen rechnet `profil.test.ts` aus `globals.css` nach.
 */
export const AVATAR_FARBEN = {
  backgroundColor: "var(--iuk-linie)",
  color: "var(--iuk-tinte)",
} as const;
