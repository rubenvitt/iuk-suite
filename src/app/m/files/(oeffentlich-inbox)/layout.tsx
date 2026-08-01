import { headers } from "next/headers";
import { requireRolle } from "../_lib/hostRolle";
import { OeffentlicherRahmen } from "../_ui/OeffentlicherRahmen";

/**
 * DAS LAYOUT DER OEFFENTLICHEN ABGABE — `/u/<token>` und `/u` (Spec §2.1, §8.1).
 *
 * Rolle `inbox`, und das ist die EINZIGE Zusicherung dieses Layouts: die Abgabe
 * ist anonym, ein Zugriffsriegel waere hier ein Widerspruch zum Zweck. Wer
 * schreiben darf, entscheidet allein der Token (§8.4) — geprueft in der Seite und
 * im Route Handler, nicht hier.
 *
 * DIE ROLLENSPERRE IST DIE HAELFTE DER ZWEI-HOST-ZUSAGE. Ohne sie waere
 * `/u/<token>` auch unter dem Verwaltungs-Host erreichbar, und das Modul haette
 * zwei Adressen fuer denselben anonymen Schreibzugang — eine davon in keinem
 * gedruckten Code, also auch von niemandem beobachtet. `e2e/files-hosts.spec.ts`
 * Punkt 6 haelt genau das fest (`files.…/u` → 404, `drop.…/u` → 200).
 *
 * Route Handler unter `api/u/` erreicht dieses Layout NICHT — Handler haben kein
 * Layout und loesen die Rolle selbst auf, als erste Anweisung (§3.2). Das ist die
 * dritte Verankerung, die man vergisst.
 */
export default async function FilesOeffentlichInboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireRolle("inbox", await headers());

  return <OeffentlicherRahmen kicker="Dateiabgabe">{children}</OeffentlicherRahmen>;
}
