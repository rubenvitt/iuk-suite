import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import { getDb } from "./_db/client";
import { isoTag } from "./_lib/datum";
import { aufgabenNav } from "./_lib/nav";
import { personFuerSeite } from "./_lib/zugang";
import s from "./_ui/aufgaben.module.css";

/**
 * `.modul` liegt AUSSERHALB der Shell, wie `VerwaltungsRahmen` im Lagerbuch: so
 * tragen auch die Teile der Shell, die Modulinhalt umschliessen, die
 * --auf-*-Variablen. Innerhalb waere der Traeger ein Nachfahre der Kopfzeile,
 * und dort fehlten sie.
 *
 * DIE ROLLENABHAENGIGE MODULNAVIGATION SEIT AUFGABE 16 (`_lib/nav.ts`) — baut ihre Eintraege aus
 * DENSELBEN Praedikaten, die die Routen selbst gaten (Spec §7), nicht aus einer zweiten
 * Rollenabfrage hier im Layout. Diese Datei loest dafuer nur die Person auf und reicht sie durch;
 * `_lib/nav.test.ts` bewacht die Ableitung selbst end-to-end.
 *
 * OHNE `personen`-ZEILE (Modulzugang, aber noch nicht eingetragen — Spec-Nachtrag 2026-08-14) GIBT
 * ES KEINE NAVIGATION: `NichtEingetragenSeite` traegt ohnehin keinen Link, den eine Navigation
 * ergaenzen muesste, und ein Eintrag, der auf eine Seite zeigt, die noch niemand freigeschaltet
 * hat, waere schlimmer als keiner (Vorbild `portal/layout.tsx`s `navFuerPortal`).
 *
 * ZWEI AUFLOESUNGEN VON PERSON/SITZUNG JE ANFRAGE (hier UND in jeder Seite darunter) SIND KEINE
 * REGRESSION DIESER AUFGABE: Next.js rendert Layout und Seite unabhaengig, und jede bisherige
 * Seite des Moduls ruft `personFuerSeite`/`isoTag(new Date())` bereits selbst auf (Vorbild
 * `portal/layout.tsx`s `canAdminModule`-Aufruf, unabhaengig von jeder Kind-Seite).
 */
export default async function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("aufgaben");
  const db = getDb();
  const person = await personFuerSeite(db);
  const heute = isoTag(new Date());
  const nav = person ? aufgabenNav(person, heute) : [];

  return (
    <div className={s.modul}>
      <Shell variant={mod.shell} moduleKey={mod.key} nav={nav}>
        {children}
      </Shell>
    </div>
  );
}
