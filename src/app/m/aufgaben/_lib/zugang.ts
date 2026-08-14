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
 * Sitzung → Person, ODER `null` (Spec-Nachtrag 2026-08-14, `1d36008`, Aufgabe 13 Fix-Runde 1).
 * `session.user.id` ist der Pocket-ID-`sub` (`core/auth/config.ts` setzt `session.user.id =
 * token.sub`), und `personen.sub` ist genau darauf indiziert.
 *
 * OHNE SITZUNG → weiterhin `notFound()`: die Middleware laesst diesen Pfad nur mit gueltiger
 * Sitzung UND Zugangsgruppe durch (`core/routing.ts`); ein Aufruf ohne `sub` waere ein Zustand,
 * den es im Betrieb nicht geben sollte, kein realer Nutzungsfall, der eine eigene Seite verdient.
 *
 * KEINE `personen`-ZEILE → `null`, NICHT `notFound()`: die Zugangsgruppe allein beweist, dass die
 * Person Modulzugang hat (die Middleware hat sie schon geprueft) — ihr fehlt nur die lokale
 * Personen-Zeile, z. B. eine frisch in Pocket ID freigeschaltete BuFDi, die die Koordination noch
 * nicht angelegt hat. `notFound()` gaebe ihr nichts, womit sie weiterkaeme, und die Begruendung
 * fuer 404 in Spec §7 ("die Existenz einer Seite nicht verraten") traegt hier nicht: die Person
 * HAT den Zugang, es gibt vor ihr nichts zu verbergen. Diese Funktion RENDERT NICHTS SELBST — sie
 * liefert nur `null`, jede Seite waehlt selbst die Form (heute einheitlich `NichtEingetragenSeite`,
 * s. `_ui/NichtEingetragenSeite.tsx`), weil sie ihren eigenen Aufrufpfad kennt.
 *
 * DIE GRENZE DIESER AUSNAHME, DAMIT SIE NICHT VERALLGEMEINERT WIRD: das gilt NUR fuer die
 * Sitzungsperson selbst. Eine unbekannte OBJEKT-Id in der URL (`/plan/<personId>`, kuenftig
 * `/a/<id>`) bleibt `notFound()` — dort geht es um ein Objekt, das es geben koennte oder nicht,
 * nicht um die eigene, noch fehlende Personen-Zeile.
 */
export async function personFuerSeite(db: DB): Promise<PersonRow | null> {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) notFound();
  return db.select().from(personen).where(eq(personen.sub, sub)).get() ?? null;
}

/**
 * DER `sub` DER SITZUNGSPERSON, ISOLIERT AUS `personFuerSeite` (Aufgabe 14) — der Ausgang aus
 * `NichtEingetragenSeite`: eine Person mit Modulzugang, aber ohne `personen`-Zeile, kann ihren
 * eigenen `sub` NIRGENDS sonst nachschlagen (er ist kein Feld, das die Koordination raten dürfte,
 * s. `_ui/PersonenFormular.tsx`s Kopfkommentar), aber die Seite, die genau diesen Fall zeigt, kennt
 * ihn bereits — `personFuerSeite` liest ihn, wirft ihn aber weg, sobald `personen` keine Zeile hat.
 *
 * KEINE AENDERUNG AN `personFuerSeite` SELBST: drei bestehende Aufrufer (`page.tsx`,
 * `plan/[personId]/page.tsx`, `routinen/page.tsx`) sind bereits getestet und sollen bei diesem
 * Zusatzbedarf unveraendert bleiben. Diese Funktion dupliziert nur den `auth()`-Aufruf (billig, kein
 * Datenbankzugriff), nicht die Grenzentscheidung — die bleibt allein bei `personFuerSeite`.
 *
 * `null` OHNE SITZUNG: dieselbe Lage wie in `personFuerSeite`, aber diese Funktion wirft nicht,
 * weil sie nur ergaenzend neben einem bereits geworfenen/aufgeloesten `personFuerSeite`-Aufruf
 * steht — ein zweiter `notFound()` an derselben Stelle waere kein zweiter Fehlerpfad, nur derselbe
 * doppelt ausgeloest.
 */
export async function subFuerSitzung(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Wie `personFuerSeite`, aber fuer Server-Actions: eine Aktion hat keine Seite, auf der sie eine
 * Erklaerung anzeigen koennte, und eine Schreiboperation ohne zurechenbare Personen-Zeile darf
 * ohnehin nicht stattfinden — deshalb bleibt hier der Wurf die richtige Antwort, unveraendert seit
 * Aufgabe 4. Jede Seite dagegen ruft `personFuerSeite` (s. dort).
 */
export async function personFuerSession(db: DB): Promise<PersonRow> {
  const person = await personFuerSeite(db);
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
 * `/routinen` IST LAUT SPEC §8 "für bufdi" (Aufgabe 13, offener Punkt aus Aufgabe 11: die Route
 * trug bis hierhin nur `darfPlanAendern`, also "nur die eigene Person", ohne Ruecksicht auf die
 * Rolle). ENTSCHEIDUNG (Aufgabe 13, s. Bericht): die Route bekommt DIESES Gate direkt, statt sich
 * auf einen kuenftigen Navigationseintrag zu verlassen, der (noch) nicht existiert — Aufgabe 13
 * baut keine Modulnavigation, nur den EINEN Fusszeilen-Verweis "Routinen verwalten" in
 * `EinstiegBufdi.tsx`, und der zeigt ohnehin nur BuFDis. Ohne ein Gate an der Route selbst waere
 * `/routinen` fuer `koordination`/`auftrag` trotzdem per direkter URL erreichbar — praktisch
 * harmlos (Aufgabe 11: eine Koordinationsperson verwaltete allenfalls ihre eigenen Zeitbloecke),
 * aber Spec §8 nennt die Route ausdruecklich rollengebunden, und dieselbe Suite-Regel wie ueberall
 * sonst gilt auch hier: dieselbe Bedingung an EINER Stelle, nicht implizit "niemand verlinkt
 * dorthin". `istAktiv` PLUS `rolle === "bufdi"` — dieselbe Form wie jedes andere
 * Handlungspraedikat dieser Datei (Kopfkommentar: "HANDLUNGSPRAEDIKATE pruefen istAktiv JEDES FUER
 * SICH").
 */
export function darfRoutinenVerwalten(p: PersonRow, heute: string): boolean {
  return p.rolle === "bufdi" && istAktiv(p, heute);
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
 * Verfasserin, `koordination`, der Ersteller der Aufgabe, ODER der eingetragene Pruefer — NICHT
 * jeder BuFDi. "Leistungsnachweise sind kein Aushang" (Spec §2). Kein `istAktiv`: dieselbe
 * Begruendung wie bei `darfPlanSehen` — Einsicht in die eigene Geschichte bleibt bestehen.
 *
 * Liest „Verfasser" als „aktuell Zugewiesener" (`a.zugewiesenAn`), nicht als
 * `nachweise.erstelltVon` — die `AufgabeRow` allein kennt Letzteres nicht. Heute deckungsgleich,
 * weil `umverteilen` nur aus `verteilt` erlaubt ist (Spec §5.2) und ein Nachweis fruehestens beim
 * Fertigmelden aus `in_arbeit` entsteht: eine Aufgabe mit Nachweis kann die zugewiesene Person
 * also nicht mehr gewechselt haben. Diese Uebereinstimmung haengt an Aufgabe 8 (der
 * Uebergangstabelle) und muesste dort erneut geprueft werden, falls sich das je aendert.
 *
 * DIE PRUEFER-KLAUSEL IST NEU (Aufgabe 16, Widerspruch — s. Bericht): Spec §7 nennt woertlich nur
 * „Koordination, Ersteller, Zugewiesener", aber `_db/queries.ts`s `freigabeDaten` haengt jeder
 * `FreigabeZeile` ihre Nachweise an, OHNE `darfNachweisSehen` zu pruefen — sie filtert nur ueber
 * `freigabenFuer`/`darfFreigeben`, die den Pruefer einschliesst. Ohne diese Klausel saehe der
 * eingetragene Pruefer den Nachweis auf `/freigaben` (`FreigabeZone.tsx`), aber nicht auf
 * `/a/<id>` (Aufgabe 16, `darfNachweisSehen`-gestuetzter Nachweisbereich) — dieselbe Person, dieselbe
 * Aufgabe, zwei verschiedene Antworten auf dieselbe Frage. Und fachlich ist die Klausel ohnehin
 * richtig: „wer freigibt, muss sehen, was er freigibt" (`FreigabeZone.tsx`s Kopfkommentar) waere
 * sonst nur die halbe Wahrheit. `prueferId` zeigt nie auf eine `bufdi`-Zeile (nur `auftrag`/
 * `koordination` duerfen fremd einstellen und werden dabei zum Pruefer, `anfangsZustand()`) — die
 * Erweiterung oeffnet also keinen Nachweis fuer „jeden BuFDi", die Kernzusage aus Spec §2 bleibt.
 *
 * BEWUSST KEIN `istAktiv` AUCH IN DIESER KLAUSEL — BETREIBERENTSCHEIDUNG NACH FIX-RUNDE 1: ein
 * AUSGESCHIEDENER Pruefer sieht den Nachweis auf `/a/<id>` DESHALB WEITERHIN, obwohl er ihn auf
 * `/freigaben` nie sah (dort filtert `freigabenFuer`/`darfFreigeben`, und `darfFreigeben` endet auf
 * `&& istAktiv(p, heute)` — ein ausgeschiedener Pruefer stand dort also nie). Zwei Haelften, beide
 * gehoeren hierher:
 *  1. WARUM ER SEHEN DARF: er muss beurteilen koennen, was er (oder in Vertretung die Koordination)
 *     freigegeben hat — dieselbe Begruendung wie bei der Klausel selbst, „wer freigibt, muss sehen,
 *     was er freigibt", gilt fuer die BEENDETE Amtszeit genauso wie fuer die laufende: eine
 *     Leistungsdokumentation, die dem einstigen Pruefer nach seinem Ausscheiden die eigene
 *     Pruefgeschichte entzieht, waere keine Dokumentation mehr.
 *  2. WARUM KEIN `istAktiv`-GEFAELLE: dieses Praedikat ist ein SICHTPRAEDIKAT (Kopfkommentar dieser
 *     Datei: „SICHTPRAEDIKATE pruefen `istAktiv` NICHT"), `istAktiv` in eine einzelne Klausel zu
 *     ziehen braeche genau die Symmetrie, die Aufgabe 4 aufgestellt hat, und verlangte ein `heute` in
 *     der Signatur an jeder Aufrufstelle. Die Handlungsseite bleibt trotzdem geschuetzt: `aktionsOptionen`
 *     (`_lib/aktionsOptionen.ts`) ruft `uebergang()`, dessen `TABELLE`-Zeilen fuer „freigeben"/
 *     „zurueckweisen" `darfFreigeben` verlangen — eine ausgeschiedene Pruefer-Person SIEHT den
 *     Nachweis also, bekommt aber KEINE Freigabe-Aktion mehr angeboten. Sehen ohne Handeln ist hier
 *     die Zusage, nicht die Luecke.
 */
export function darfNachweisSehen(p: PersonRow, a: AufgabeRow): boolean {
  return (
    p.rolle === "koordination" ||
    p.id === a.erstellerId ||
    p.id === a.zugewiesenAn ||
    p.id === a.prueferId
  );
}

/**
 * SICHTPRAEDIKAT FUER `/a/<id>` UND `/archiv` (Aufgabe 16) — Spec §7 nennt dafuer keinen eigenen
 * Namen; diese Funktion ist die Uebersetzung von "wer die Aufgabe nicht sehen darf, bekommt
 * `notFound()`" in ein Praedikat, wie jedes andere hier.
 *
 * `rolle === "bufdi"` SIEHT JEDE AUFGABE — DAS SPIEGELBILD ZU `darfPlanSehen` (dort: jeder BuFDi
 * sieht jeden BuFDi-Zeitplan lesend, "Vertretungsabsprachen ohne die Koordination als
 * Nadeloehr", Spec §2). Eine Aufgabe ist der Dateninhalt genau des Zeitplans, den `darfPlanSehen`
 * schon oeffnet — diese Klausel macht nur ausdruecklich, was ueber die Zeitplan-Sicht ohnehin
 * einsehbar waere.
 *
 * `auftrag` BLEIBT ENGER: Spec §2 gewaehrt nur BuFDis das lesende Sehen der anderen: ein
 * Auftraggeber sieht fremde Auftraege nicht automatisch. Fuer `auftrag` bleibt die Sicht also auf
 * `erstellerId`/`prueferId` beschraenkt — praktisch dasselbe Feld, weil `prueferId === erstellerId`
 * fuer jede heute ueber die Oberflaeche eingestellte Fremdaufgabe gilt (`aufgabeEinstellenAction`);
 * die Pruefer-Klausel bleibt trotzdem eigens benannt, falls das je auseinanderlaeuft (`umverteilen`
 * ruehrt `prueferId` nicht an, s. `verteilenGemeinsam` in `actions.ts`).
 *
 * KEIN `istAktiv` — SICHTPRAEDIKAT (Kopfkommentar dieser Datei): eine ausgeschiedene Person liest
 * ihre eigene Geschichte weiter (Spec §7).
 */
export function darfAufgabeSehen(p: PersonRow, a: AufgabeRow): boolean {
  return (
    p.rolle === "koordination" ||
    p.rolle === "bufdi" ||
    p.id === a.erstellerId ||
    p.id === a.zugewiesenAn ||
    p.id === a.prueferId
  );
}

/**
 * GATE FUER DIE ROUTE `/freigaben` (Aufgabe 15, Spec §8: „für auftrag, koordination"). Trifft
 * HEUTE denselben Ausdruck wie `darfEinstellenFuerAndere` — und wird trotzdem NICHT dorthin
 * umgeleitet oder als Alias darauf gebaut: die beiden Fragen sind verschieden ("darf diese Person
 * die Warteschlange SEHEN" vs. "darf sie eine Aufgabe FUER JEMAND ANDEREN erstellen"), und nur der
 * heutige Rollenzuschnitt laesst sie zusammenfallen. Ein Nachbau ueber die falsche Naht war schon
 * einmal der Fehler in dieser Datei (s. `darfPlanAendern`s Kopfkommentar, Entscheidung 3) — eine
 * kuenftige Aenderung an EINER der beiden Fragen (z. B. eine Person, die nur noch freigeben, aber
 * nicht mehr einstellen darf) duerfte die andere nicht versehentlich mitziehen.
 *
 * `freigabenFuer` (`_db/queries.ts`) filtert ohnehin serverseitig auf `darfFreigeben` je Aufgabe —
 * eine `bufdi`-Person saehe die Warteschlange auch OHNE dieses Gate strukturell leer, weil
 * `prueferId` nie auf eine `bufdi`-Zeile zeigt (nur `auftrag`/`koordination` duerfen fremd
 * einstellen und werden damit zu `prueferId`, s. `anfangsZustand`). Das Gate hier ist trotzdem
 * kein Sicherheitstheater: Spec §8 nennt die Route ausdruecklich rollengebunden, dieselbe Suite-
 * Regel wie bei `/routinen`/`/verteilen`/`/personen` gilt auch hier — ein leerer Bildschirm ist
 * kein 404, und ohne ein Gate an der Route selbst waere `/freigaben` fuer eine ausgeschiedene oder
 * fachlich falsche Rolle trotzdem per direkter URL "erreichbar" (mit einer leeren Liste, aber
 * eben 200 statt 404).
 */
export function darfFreigabenSehen(p: PersonRow, heute: string): boolean {
  return (p.rolle === "auftrag" || p.rolle === "koordination") && istAktiv(p, heute);
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
