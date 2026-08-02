import { headers } from "next/headers";
import { requireFilesAccess } from "../_lib/access";
import { requireRolle } from "../_lib/hostRolle";
import { FILES_NAV } from "../_lib/nav";
import { VerwaltungsRahmen } from "../_ui/VerwaltungsRahmen";

/**
 * DAS LAYOUT DER VERWALTUNGSSEITEN — GENAU EINE ROLLENZUSICHERUNG UND DER
 * ZUGRIFFSRIEGEL (Spec §2.1, §3.5).
 *
 * Diese Route-Group traegt `/shares/*`, `/posteingang` und `/zugangslinks`. Die
 * Modulwurzel `/` gehoert NICHT dazu: sie muss beide Rollen bedienen und liegt
 * deshalb als `page.tsx` auszerhalb aller Groups (dort stehen Riegel und Rahmen
 * ein zweites Mal — „EINE Stelle, zwei Layouts", `feedback`s Muster). Eine
 * `(verwaltung)/page.tsx` gibt es nicht: sie und `page.tsx` loesten beide auf
 * `/m/files` auf, und `next build` bricht dann ab.
 *
 * ZWEI RIEGEL, ZWEI VERSCHIEDENE FRAGEN, und beide gehoeren hierher:
 *
 * 1. `requireRolle("verwaltung", …)` — „ist das der richtige HOST fuer diesen
 *    Pfad?" Ohne sie waere jede Verwaltungsseite auch unter der Inbox-Domain
 *    erreichbar. Das ist Dauerzustand, keine Uebergangsregel: `drop`s
 *    Empfaenger kennen nur `drop.…`, und ein dort erreichbares `/shares/neu`
 *    waere ein zweiter Weg in die Verwaltung, den niemand ueberwacht.
 * 2. `requireFilesAccess()` — „darf DIESE Person das Modul verwalten?" Das Modul
 *    ist `requiresAuth: false` (sonst liefe jeder anonyme `/s/<id>`- und
 *    `/u/<token>`-Aufruf in den Login, `routing.ts:71-73`), und `canAccess`
 *    steigt fuer solche Module frueh aus — die Middleware gatet hier also NICHT.
 *    Ohne diese Zeile waere die Verwaltung fuer jeden Eingeloggten offen.
 *
 * Die Reihenfolge ist nicht beliebig: erst der Host, dann die Person. Andernfalls
 * schickte ein anonymer Aufruf auf dem FALSCHEN Host erst in den Login und
 * antwortete dann mit 404 — der Login waere eine Sackgasse, und die
 * Rollentrennung haette einen Umweg, der die Existenz des Pfades verraet.
 *
 * KEINE Server Action verlaesst sich auf dieses Layout: eine Seiten- oder
 * Layout-Pruefung erstreckt sich nicht auf die Actions darunter, jede ruft
 * `requireFilesAccess()` selbst (§2.4).
 */
export default async function FilesVerwaltungsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  requireRolle("verwaltung", await headers());
  await requireFilesAccess();

  return <VerwaltungsRahmen nav={FILES_NAV}>{children}</VerwaltungsRahmen>;
}
