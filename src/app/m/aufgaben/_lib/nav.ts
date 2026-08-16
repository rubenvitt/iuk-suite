import type { SuiteNavItem } from "@/core/shell/types";
import {
  darfFreigabenSehen,
  darfPersonenVerwalten,
  darfRoutinenVerwalten,
  darfVerteilen,
  type Akteur,
} from "./zugang";

/*
 * DIE MODULNAVIGATION JE AKTEUR (Aufgabe 16, Spec §7) — `layout.tsx` reicht das Ergebnis als
 * `nav`-Prop an `<Shell>` durch (`Shell`-Signatur, `SuiteNavItem[]`). Bis hierhin trug das Modul
 * KEINE Navigation (Aufgabe 1, ausdruecklich vermerkt).
 *
 * DIE REGEL AUS SPEC §7 IST HIER DIE GANZE ARBEIT (woertlich): „kein Navigationseintrag und kein
 * Knopf darf auf eine Seite zeigen, die fuer die klickende Person 404 ist — weil Oberflaeche und
 * Riegel dieselben Funktionen aufrufen, ist das strukturell ausgeschlossen." Diese Funktion baut
 * ihre bedingten Eintraege deshalb aus DENSELBEN Praedikaten, die die jeweilige Route selbst gatet
 * (`darfVerteilen` in `verteilen/page.tsx`, `darfFreigabenSehen` in `freigaben/page.tsx`,
 * `darfRoutinenVerwalten` in `routinen/page.tsx`, `darfPersonenVerwalten` in `personen/page.tsx`)
 * — NICHT aus einer zweiten, hier nachgebauten Rollenabfrage. `nav.test.ts` ruft dafuer die
 * echten Seiten-Default-Exporte auf (nicht nur diese Ableitung gegen sich selbst): eine
 * Konsistenzpruefung allein gegen die importierten Praedikate waere keine ausreichende
 * Gegenprobe, weil `darfVerteilen` und `darfPersonenVerwalten` fuer die Koordination HEUTE
 * extensional identisch sind (`_lib/zugang.ts`) — ein vertauschter Aufruf bliebe unbemerkt, ein
 * echter Seitenabruf nicht.
 *
 * `/neu` UND `/archiv` TRAGEN KEIN PRAEDIKAT UND STEHEN DESHALB BEDINGUNGSLOS: keine der beiden
 * Routen gatet rollengebunden. `neu/page.tsx` (Spec §8): „jede Rolle darf zumindest fuer sich
 * selbst einstellen" (`anfangsZustand()` entscheidet, nicht ein Routen-Gate). `archiv/page.tsx`
 * (Spec §8): „fuer alle, gefiltert auf Sichtrecht" — die Einschraenkung liegt in der ANGEZEIGTEN
 * LISTE (`darfAufgabeSehen`), nicht im Zugang zur Seite selbst.
 *
 * DIE AEUSZERE PFADFORM (`/verteilen`, nicht `/m/aufgaben/verteilen") — dieselbe Form wie
 * `files/_lib/nav.ts`/`feedback/(admin)/layout.tsx`, weil ein Modul der Suite unter seinem eigenen
 * Host an der Wurzel haengt.
 *
 * KEIN `ikon`: `NavIkonName` (`core/shell/types.ts`) ist eine geschlossene Union, die heute nur
 * die Namen von `lagerbuch/_ui/navIkonen.tsx` fuehrt. Sie um aufgaben-eigene Namen zu erweitern
 * ist nicht Teil dieser Aufgabe (Brief nennt es nicht) — `ikon` bleibt optional, Vorbild
 * `files/_lib/nav.ts`, das ebenfalls ohne auskommt.
 */
export function aufgabenNav(akteur: Akteur, heute: string): SuiteNavItem[] {
  const eintraege: SuiteNavItem[] = [{ key: "start", title: "Aufgaben", href: "/" }];

  eintraege.push({ key: "neu", title: "Aufgabe einstellen", href: "/neu" });

  if (darfVerteilen(akteur, heute)) {
    eintraege.push({ key: "verteilen", title: "Verteilen", href: "/verteilen" });
  }
  if (darfFreigabenSehen(akteur, heute)) {
    eintraege.push({ key: "freigaben", title: "Freigaben", href: "/freigaben" });
  }
  if (darfRoutinenVerwalten(akteur, heute)) {
    eintraege.push({ key: "routinen", title: "Routinen", href: "/routinen" });
  }
  if (darfPersonenVerwalten(akteur, heute)) {
    eintraege.push({ key: "personen", title: "Personen", href: "/personen" });
  }

  eintraege.push({ key: "archiv", title: "Archiv", href: "/archiv" });

  /*
   * `/hilfe` STEHT ZULETZT UND BEDINGUNGSLOS — die Bedienungsanleitung (`_lib/hilfe.ts`).
   *
   * KEIN PRAEDIKAT: die Route gatet selbst keines (sie liest keine Aufgabe, keine Person, keinen
   * Nachweis, sondern zeigt Text ueber Flaechen), und die Auswahl der KAPITEL geschieht IN der
   * Seite — `hilfeSichten` filtert ueber dieselben Praedikate wie diese Datei. Ein Gate hier waere
   * also nicht strenger, nur an der falschen Stelle: es naehme die Anleitung genau der Person weg,
   * die am wenigsten Kapitel hat und die Erklaerung am ehesten braucht.
   *
   * ZULETZT UND NICHT ZUERST, weil die Navigation nach Arbeitshaeufigkeit sortiert ist: eine
   * Anleitung wird einmal gelesen und danach gesucht, nicht taeglich geklickt.
   */
  eintraege.push({ key: "hilfe", title: "Anleitung", href: "/hilfe" });

  return eintraege;
}
