/**
 * DER FACHLICHE VORBEHALT (Spec §5.6) — EINE QUELLE FUER ZWEI FLAECHEN.
 *
 * Gemessen ist `review.domain.status` bei 544 von 544 Zeilen des Quellprojekts `"pending"` —
 * kein einziges `approved`. Der AFKzV hat die vorlaeufige Anwendung der Empfehlungen am
 * 13./14.03.2025 aufgehoben, die Verbreitung ist ausgesetzt.
 *
 * ⛔ DASS DER KASTEN DASTEHT, IST KEINE OPTION (Spec §5.6). Er steht auf der Modul-Startseite
 * UND auf `/lernen` ueber dem ersten Startknopf. Beide lesen DIESE Konstante; zwei Abschriften
 * liefen auseinander, und kein Tor saehe es. Der Wortlaut ist Betreibersache (§9, E2) — wer ihn
 * aendert, aendert ihn hier, einmal.
 *
 * ⛔ DARGESTELLT ALS `Alert type="warning"`, NIE `type="error"` (Falle 3):
 * `colorError === colorPrimary === #c8000f` — ein Fehlerkasten saehe aus wie eine
 * Primaeraktion, und in einem Modul, in dem Rot die Farbe einer Organisation ist, traegt Rot
 * auf einer Datenflaeche eine falsche Aussage.
 *
 * KEIN "use client" (Falle 6): Server Components lesen diesen Wert.
 */
export const VORBEHALT: { titel: string; text: string } = {
  titel: "Die Bedeutungen in dieser App folgen einem Entwurf, dessen fachliche Prüfung noch läuft.",
  text:
    "Zum Üben der Systematik taugt er; für eine verbindliche Auskunft gilt die " +
    "Dienstvorschrift deiner Organisation.",
};
