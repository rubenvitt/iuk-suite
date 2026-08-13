import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import type { DB } from "../_db/client";
import { personen, type AufgabeRow, type PersonRow } from "../_db/schema";

/*
 * ZUGRIFFSSCHUTZ — die EINE Quelle (Spec §7). ALLE Seiten und ALLE Server-Actions rufen dieselben
 * Praedikate; das ist die Bedingung dafuer, dass Oberflaeche und Riegel nicht auseinanderlaufen.
 * KEIN "use client", KEIN Import aus `@ant-design/icons` (Fallen 6 und 7).
 *
 * `heute` kommt ueberall als ISO-Tagesstring HEREIN und wird NIE hier selbst ermittelt — die
 * Zeitzone steht ausschliesslich in `_lib/datum.ts` (`isoTag`), und ein zweiter Ort dafuer wäre
 * genau der Fehler, den Aufgabe 3 vermieden hat.
 *
 * ZWEI GRUPPEN VON PRAEDIKATEN, UND DIE GRENZE IST KEINE STILFRAGE:
 *
 * HANDLUNGSPRAEDIKATE (`darfVerteilen`, `darfEinstellenFuerAndere`, `darfPersonenVerwalten`,
 * `darfPlanAendern`, `darfFreigeben`) pruefen `istAktiv` JEDES FUER SICH, statt sich auf ein
 * vorgeschaltetes Gate zu verlassen. Ein Gate wird genau einmal vergessen, und dann ist es der
 * Fall, den niemand testet — die Pruefung gehoert also IN jedes einzelne Praedikat.
 *
 * SICHTPRAEDIKATE (`darfPlanSehen`, `darfNachweisSehen`) pruefen `istAktiv` NICHT. Eine
 * ausgeschiedene Person liest ihre Geschichte, bewegt aber nichts (Spec §7) — deshalb tragen
 * genau die Handlungspraedikate ein `heute`-Argument, die beiden Sichtpraedikate nicht.
 */

/**
 * Sitzung → Person. `session.user.id` ist der Pocket-ID-`sub` (`core/auth/config.ts` setzt
 * `session.user.id = token.sub`), und `personen.sub` ist genau darauf indiziert.
 *
 * KEIN TREFFER → `notFound()`, NICHT 403 — genauso ohne Sitzung. Mehrere Riegel der Suite werfen
 * absichtlich 404, damit die Existenz einer Seite nicht verraten wird (Spec §7); ein 403 verriete
 * "es gibt hier etwas, du darfst nur nicht", ein 404 nicht.
 */
export async function personFuerSession(db: DB): Promise<PersonRow> {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) notFound();
  const person = db.select().from(personen).where(eq(personen.sub, sub)).get();
  if (!person) notFound();
  return person;
}

/**
 * `aktivBis` ist ein EINSCHLIESSENDES Ende. Am Enddatum selbst ist die Person noch aktiv — sonst
 * kann jemand an seinem letzten Diensttag nichts mehr abgeben. `null` heisst unbefristet.
 * `aktivVon` in der Zukunft (noch nicht angetreten) gilt ebenfalls als nicht aktiv.
 */
export function istAktiv(p: PersonRow, heute: string): boolean {
  if (p.aktivVon > heute) return false;
  if (p.aktivBis !== null && p.aktivBis < heute) return false;
  return true;
}

/** Nur die Koordination verteilt Aufgaben aus dem Posteingang. */
export function darfVerteilen(p: PersonRow, heute: string): boolean {
  return p.rolle === "koordination" && istAktiv(p, heute);
}

/**
 * `auftrag` ODER `koordination` duerfen Aufgaben FUER ANDERE einstellen. Fuer sich selbst darf
 * jede Rolle einstellen — das ist kein Praedikat, sondern der Normalfall (Spec §5.2, Zeile
 * "einstellen, fuer sich selbst"), und gehoert deshalb nicht hierher.
 */
export function darfEinstellenFuerAndere(p: PersonRow, heute: string): boolean {
  return (p.rolle === "auftrag" || p.rolle === "koordination") && istAktiv(p, heute);
}

/** `rolle === "koordination"` oeffnet die Personenverwaltung (Spec §4). */
export function darfPersonenVerwalten(p: PersonRow, heute: string): boolean {
  return p.rolle === "koordination" && istAktiv(p, heute);
}

/**
 * AUCH DIE KOORDINATION AENDERT KEINE FREMDEN PLAENE. Die Koordination *schlaegt vor*
 * (`vorschlag_datum`), sie setzt nicht (`plan_datum`) — die Gestaltungshoheit ueber den eigenen
 * Tag liegt beim BuFDi (Anforderung 3 des Auftraggebers). Also ausschliesslich die Zielperson
 * selbst, und aktiv.
 */
export function darfPlanAendern(p: PersonRow, zielPersonId: string, heute: string): boolean {
  return p.id === zielPersonId && istAktiv(p, heute);
}

/**
 * FUER SELBSTAUFGABEN IMMER `false` — AUCH FUER DIE KOORDINATION. Das ist bewusst die erste
 * Zeile: ohne sie stimmten `prueferId === null` (Selbstaufgaben haben keinen Pruefer) und
 * `rolle === "koordination"` je fuer sich, und die Koordination bekaeme einen Freigabeknopf fuer
 * die eigene Aufgabe eines BuFDi — die gar keine Freigabestufe hat (Spec §5.2: Selbstaufgaben
 * gehen `in_arbeit` → `abgeschlossen`, ohne `freigabe_offen`).
 *
 * DIE KOORDINATION GIBT AUCH IHRE EIGENE FREMDAUFGABE NICHT FREI (Betreiberentscheidung
 * 2026-08-13): sie verteilt, sie arbeitet nicht mit. Ohne diese Klausel gaebe es einen
 * begehbaren Pfad, auf dem die Koordination eine fremd eingestellte Aufgabe an sich selbst
 * verteilt (`istSelbst` bleibt dabei `false`, weil `erstellerId !== zugewiesenAn`) und am Ende
 * ihre eigene Arbeit freigibt — das Vier-Augen-Prinzip faellt fuer genau diesen Fall aus, obwohl
 * es mit dem Ersteller einen regulaeren Pruefer gaebe. Verteillisten speisen sich deshalb aus
 * `bufdis()`, NICHT aus `aktivePersonen()` — sonst stuende die Koordination selbst darin, und der
 * Pfad waere wieder offen.
 *
 * Sonst: der eingetragene Pruefer ODER die Koordination, und aktiv.
 */
export function darfFreigeben(p: PersonRow, a: AufgabeRow, heute: string): boolean {
  if (a.istSelbst) return false;
  if (p.id === a.zugewiesenAn) return false;
  return (p.id === a.prueferId || p.rolle === "koordination") && istAktiv(p, heute);
}

/**
 * FUER ALLE WAHR. BuFDis sehen die Zeitplaene der anderen lesend — Vertretungsabsprachen ohne die
 * Koordination als Nadeloehr —, `koordination` und `auftrag` sehen ohnehin alle. Kein `istAktiv`:
 * ein ausgeschiedener BuFDi liest weiterhin, was war.
 *
 * Die Parameter bleiben Teil der Signatur, obwohl das Ergebnis nicht von ihnen abhaengt: Aufrufer
 * stehen neben `darfPlanAendern(p, zielPersonId, heute)` und sollen dieselbe Form nutzen, statt an
 * dieser einen Stelle einen Sonderfall ohne Argumente zu pflegen.
 */
export function darfPlanSehen(p: PersonRow, zielPersonId: string): boolean {
  void p;
  void zielPersonId;
  return true;
}

/**
 * Verfasserin, `koordination`, oder der Ersteller der Aufgabe — NICHT jeder BuFDi.
 * "Leistungsnachweise sind kein Aushang" (Spec §2). Kein `istAktiv`: dieselbe Begruendung wie bei
 * `darfPlanSehen` — Einsicht in die eigene Geschichte bleibt bestehen.
 *
 * Liest „Verfasser" als „aktuell Zugewiesener" (`a.zugewiesenAn`), nicht als
 * `nachweise.erstelltVon` — die `AufgabeRow` allein kennt Letzteres nicht. Heute deckungsgleich,
 * weil `umverteilen` nur aus `verteilt` erlaubt ist (Spec §5.2) und ein Nachweis fruehestens beim
 * Fertigmelden aus `in_arbeit` entsteht: eine Aufgabe mit Nachweis kann die zugewiesene Person
 * also nicht mehr gewechselt haben. Diese Uebereinstimmung haengt an Aufgabe 8 (der
 * Uebergangstabelle) und muesste dort erneut geprueft werden, falls sich das je aendert.
 */
export function darfNachweisSehen(p: PersonRow, a: AufgabeRow): boolean {
  return p.rolle === "koordination" || p.id === a.erstellerId || p.id === a.zugewiesenAn;
}

/**
 * Wahr, wenn die Koordination freigibt, OHNE der eingetragene Pruefer zu sein. Aufgabe 10 schreibt
 * daraus die Verlaufszeile "Freigegeben von X in Vertretung fuer Y" — der Kern der
 * Leistungsdokumentation. Wird ausschliesslich NACH einem bereits bejahten `darfFreigeben`
 * aufgerufen; Selbstaufgaben (kein Pruefer) erreichen diese Stelle deshalb praktisch nie.
 *
 * `&& a.prueferId !== null` macht die Invariante „eine Fremdaufgabe hat immer einen Pruefer"
 * LOKAL: ohne die Klausel ergaebe eine Fremdaufgabe ohne eingetragenen Pruefer `true`, und
 * Aufgabe 10 schriebe daraus "Freigegeben von X in Vertretung fuer —". Kein heutiger Pfad erzeugt
 * diesen Fall (der Seed setzt `prueferId` auf jeder Fremdaufgabe), aber die Funktion soll sich
 * nicht auf eine Zusage verlassen, die anderswo gehalten werden muss.
 */
export function istVertretungsfreigabe(p: PersonRow, a: AufgabeRow): boolean {
  return p.rolle === "koordination" && p.id !== a.prueferId && a.prueferId !== null;
}
