import { canAdminModule } from "@/core/auth/guards";
import { Shell } from "@/core/shell/Shell";
import { zeichenNav } from "../_lib/nav";

/**
 * DIE HUELLE DER ARBEITSFLAECHEN — Startseite, Katalog, Merkliste, Baukasten, Meine Zeichen,
 * Ueben und die Lernset-Verwaltung. GESCHWISTER-SEGMENT der Routengruppe `(rahmenlos)`, die
 * Aufgabe 9 anlegt und die bewusst OHNE `<Shell>` laeuft (Spec §2: jede Seite unter
 * `SuiteRahmen` traegt Klarnamen und gruppenabhaengige App-Liste im Flight-Payload, und genau
 * das darf auf der gecachten Offline-Seite nicht liegen). Vorbild fuer die Aufteilung:
 * `uav/(admin)/layout.tsx` neben `uav/(teilnehmer)/layout.tsx`.
 *
 * `variant="full"` ALS LITERAL: siehe `layout.test.tsx`. `FullShell` legt damit `ARBEITSDICHTE`
 * (44/48) um den Inhalt — an keinem antd-Bedienelement dieses Moduls steht ein `size` (Falle 4).
 *
 * ⛔ HIER STEHT KEIN ZUGRIFFSRIEGEL, UND DAS IST RICHTIG: `zeichen` traegt `requiresAuth: true`
 * mit leerem `requiredGroups` — den ganzen Modulzugang haelt das generische Middleware-Gate
 * (`core/routing.ts`), es gibt keinen anonymen Teilpfad und damit nichts modulintern
 * nachzudurchsetzen. Die EINE gruppenabhaengige Flaeche ist die Lernset-Verwaltung; sie traegt
 * `moduleAdminPageOrNotFound("zeichen")` als erste Anweisung ihrer eigenen Seite (Aufgabe 8).
 * Eine Routengruppe ist Bequemlichkeit, keine Sicherheitsgrenze.
 *
 * `canAdminModule("zeichen")` ENTSCHEIDET NUR UEBER DIE SICHTBARKEIT DES EINTRAGS — dasselbe
 * Praedikat, das die Route gatet (Spec §2). Es wirft nicht: wer nicht verwalten darf, sieht die
 * Leiste ohne den Abschnitt „Verwaltung" und sonst alles.
 */
export default async function ZeichenShellLayout({ children }: { children: React.ReactNode }) {
  const darfVerwalten = await canAdminModule("zeichen");

  return (
    <Shell variant="full" moduleKey="zeichen" nav={zeichenNav(darfVerwalten)}>
      {children}
    </Shell>
  );
}
