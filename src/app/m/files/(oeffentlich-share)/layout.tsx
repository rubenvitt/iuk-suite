import { headers } from "next/headers";
import { requireRolle } from "../_lib/hostRolle";
import { OeffentlicherRahmen } from "../_ui/OeffentlicherRahmen";

/**
 * DAS LAYOUT DER OEFFENTLICHEN FREIGABE-ANSICHT `/s/<id>` — Rolle `verwaltung`,
 * aber ohne Login und ohne Shell (Spec §2.1, §7.4).
 *
 * ZWEI DINGE, DIE ZUSAMMEN UEBERRASCHEND AUSSEHEN und beide richtig sind:
 *
 * - Die Rolle ist `verwaltung`, denn die Share-Links tragen den
 *   Verwaltungs-Host (`fileshare.iuk-ue.de/s/<id>`, gedruckt und verteilt). Sie
 *   sind trotzdem ANONYM erreichbar — `requireFilesAccess()` steht hier deshalb
 *   NICHT. Wer Bytes bekommt, entscheidet die Prüfkette aus §7.4 (Ablauf, Limit,
 *   Passwort-Cookie, AV-Freigabe), nicht eine Gruppenmitgliedschaft.
 * - Es gibt eine eigene Route-Group dafuer, obwohl `(verwaltung)` dieselbe Rolle
 *   zusichert: `(verwaltung)` bringt Shell UND Zugriffsriegel mit, und beides
 *   waere hier falsch.
 *
 * WARUM DREI GROUPS UND NICHT ZWEI: ein Layout bekommt `children` und `params`,
 * aber KEINEN pathname. Eine gemeinsame Group `(oeffentlich)` fuer `/s/<id>` und
 * `/u/<token>` koennte ihre Rolle deshalb nicht „je Pfad" pruefen — und die
 * beiden Pfade gehoeren zu VERSCHIEDENEN Rollen. Je Layout genau EINE
 * Rollenzusicherung.
 *
 * Der Rahmen bringt `files-public.css` mit; ein Layout, das das Stylesheet selbst
 * importierte, waere die zweite Stelle, an der man es vergessen kann.
 */
export default async function FilesOeffentlichShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireRolle("verwaltung", await headers());

  return <OeffentlicherRahmen kicker="Dateifreigabe">{children}</OeffentlicherRahmen>;
}
