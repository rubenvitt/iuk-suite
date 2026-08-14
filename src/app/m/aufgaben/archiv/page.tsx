import { getDb, type DB } from "../_db/client";
import { archiv } from "../_db/queries";
import { PRIORITAETEN, type PersonRow, type Prioritaet } from "../_db/schema";
import { isoTag } from "../_lib/datum";
import { darfAufgabeSehen, personFuerSeite, subFuerSitzung } from "../_lib/zugang";
import { ArchivFilter } from "../_ui/ArchivFilter";
import { AufgabenListe } from "../_ui/AufgabenListe";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * `/archiv` — ABGESCHLOSSENE AUFGABEN, FILTERBAR (Spec §8: „für alle, gefiltert auf Sichtrecht").
 * KEIN ROLLENGEBUNDENES GATE AN DER ROUTE SELBST — jede Person mit einer `personen`-Zeile erreicht
 * `/archiv` (deshalb steht die Route in `_lib/nav.ts`s Navigation OHNE ein Praedikat); die
 * Einschraenkung liegt in der ANGEZEIGTEN LISTE.
 *
 * DAS SICHTRECHT IST `darfAufgabeSehen` (`_lib/zugang.ts`, neu in dieser Aufgabe) — DIESELBE
 * FUNKTION WIE `/a/<id>`s Riegel: eine Aufgabe, die auf dieser Liste nicht erscheint, waere auch
 * beim Anklicken `notFound()`, und umgekehrt. Die Filterung liegt HIER, SERVERSEITIG, VOR jeder
 * Rueckgabe an die Client-Insel (`_ui/ArchivFilter.tsx`) — eine Liste, die im Browser filtert,
 * haette die fremden Zeilen vorher schon ausgeliefert.
 *
 * DIE PRIORITAET IST DER FILTER (Betreiberentscheidung, Spec nennt keine Dimension): ein Archiv
 * blickt zurueck, „wer hat was erledigt" ist eine Frage, die `/personen`/Zeitplaene schon
 * beantworten, „was war besonders dringend" nicht. Ein ungueltiger oder unbekannter
 * Suchparameter wird STILL IGNORIERT (kein Wurf) — ein URL-Parameter ist kein Formularfeld, das
 * eine Ablehnung verdient (Vorbild `_lib/datum.ts`s `montagAusParam`-Kopfkommentar).
 *
 * `archivInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) —
 * `page.test.tsx` ruft sie direkt, ohne eine Sitzung zu stellen.
 */
function alsPrioritaetsFilter(wert: string | undefined): Prioritaet | "" {
  if (wert !== undefined && (PRIORITAETEN as readonly string[]).includes(wert)) return wert as Prioritaet;
  return "";
}

export function archivInhalt(db: DB, person: PersonRow, heute: string, prioritaetParam?: string) {
  const sichtbar = archiv(db).filter((a) => darfAufgabeSehen(person, a));
  const prioritaet = alsPrioritaetsFilter(prioritaetParam);
  const gefiltert = prioritaet === "" ? sichtbar : sichtbar.filter((a) => a.prioritaet === prioritaet);

  const kontext =
    sichtbar.length === 0
      ? "Noch keine abgeschlossene Aufgabe."
      : `${sichtbar.length} abgeschlossene Aufgabe${sichtbar.length === 1 ? "" : "n"}.`;

  const leerText =
    sichtbar.length === 0
      ? "Noch keine abgeschlossene Aufgabe."
      : "Keine abgeschlossene Aufgabe mit dieser Priorität.";

  return (
    <>
      <SeitenKopf brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Archiv" }]} titel="Archiv" kontext={kontext} />
      <ArchivFilter prioritaet={prioritaet} />
      <AufgabenListe zeilen={gefiltert.map((a) => ({ aufgabe: a }))} heute={heute} leerText={leerText} />
    </>
  );
}

export default async function ArchivPage({
  searchParams,
}: {
  searchParams: Promise<{ prioritaet?: string }>;
}) {
  const db = getDb();
  // `personFuerSeite` statt `personFuerSession`: Modulzugang ohne `personen`-Zeile ist die eigene
  // Erklaerseite, nicht `notFound()` (Spec-Nachtrag 2026-08-14).
  const person = await personFuerSeite(db);
  if (!person) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  const { prioritaet } = await searchParams;
  return archivInhalt(db, person, heute, prioritaet);
}
