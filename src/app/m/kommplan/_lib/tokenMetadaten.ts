import type { Metadata } from "next";

/**
 * Statische Metadaten JEDER Token-Seite (Entscheidung 7): kein Plantitel im <title> (Verlauf, Lesezeichen,
 * Vorschaukarten in Messengern), noindex auch als Meta-Element, Referrer aus. KEIN generateMetadata — das liefe
 * parallel zum Riegel und dürfte die Datenbank nicht anfassen.
 */
export const TOKEN_METADATEN: Metadata = {
  title: "Kommunikationspläne",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};
