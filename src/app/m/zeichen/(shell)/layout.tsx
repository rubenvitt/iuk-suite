import { canAdminModule } from "@/core/auth/guards";
import { Shell } from "@/core/shell/Shell";
import { zeichenSwAn } from "../_lib/boot";
import { zeichenNav } from "../_lib/nav";
import { MerklisteSpiegel } from "../_ui/MerklisteSpiegel";

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
      {/* Spiegelt die Merkliste bei JEDEM Online-Aufruf aufs Geraet (Spec §7.5)
          und rendert nichts. Hier und nicht auf `/offline`: dort gibt es weder
          Sitzung noch Datenbank, und ein `auth()`-Aufruf traege den Klarnamen
          ins HTML — genau das, was der Inhaltsriegel des Workers ablehnt.

          ⛔ NUR BEI EINGESCHALTETER PWA, und das ist eine Korrektur aus der
          Abschlussreview (W2). Spec §7.5 gibt die Zusage „auf dem Geraet liegt
          nichts Personenbezogenes" auf und setzt DREI Dinge an ihre Stelle: den
          Logout-Haken (lebt im Service Worker), den Hinweistext und den
          Loeschknopf (leben in `MerklisteGeraet` auf `/offline`). Alle drei
          haengen an `ZEICHEN_SW=1` — der Worker registriert sonst nichts, und
          nach `/offline` fuehrt repo-weit kein Link, nur `start_url` und der
          Navigationsrueckfall des Workers. Unbedingt gerendert schrieb der
          Spiegel die Titel also auch dort aufs geteilte Tablet, wo es die
          Gegenleistung gar nicht gibt: ueber den Logout hinaus, ohne Offenlegung
          und ohne erreichbaren Loeschweg — und ohne jeden Nutzen, denn ohne
          Worker liest sie niemand wieder.

          `zeichenSwAn` LIEST `process.env` UND KOMMT AUS EINEM MODUL OHNE
          "use client" (Falle 6): aus einem Client-Modul kaeme hier eine
          Client-Referenz statt des Wertes, und die ist immer wahrheitswertig —
          der Riegel waere still wirkungslos. */}
      {zeichenSwAn(process.env) && <MerklisteSpiegel />}
      {children}
    </Shell>
  );
}
