import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { beantworte } from "../../../actions";
import { getDb } from "../../../_db/client";
import { baueRundenfrage, idsAusSet } from "../../../_db/lernen";
import { QuizInsel } from "../../../_ui/QuizInsel";
import s from "../../../_ui/zeichen.module.css";

/**
 * DIE RUNDE — eine Server Component, die genau EINE Frage baut und sie an die
 * `"use client"`-Insel `QuizInsel` reicht (Falle 9: `beantworte` ist eine Server Action
 * und darf als einzige Funktion die Grenze ueberqueren, direkt importiert, nie als
 * Prop einer weiteren Client-Komponente durchgereicht).
 *
 * DAS ZUSAMMENSETZEN VON KARTE UND FRAGE STEHT IN `_db/lernen.ts`
 * (`baueRundenfrage`), NICHT MEHR HIER — Fix-Runde 1, Befund W2: als Logik dieser
 * Seite war sie fuer Vitest unerreichbar, und ausgerechnet der kritische Teil
 * (Distraktoren IMMER aus `fragbareZeichen()` ohne Argument, auch bei gewaehltem
 * Set) hing nur an dieser einen ungetesteten Zeile.
 *
 * `set` WIRD UNVERAENDERT AN `QuizInsel` DURCHGEREICHT (Fix-Runde 1, Befund W1): der
 * „Naechstes Zeichen"-Link haengte vorher fest auf `/m/zeichen/lernen/runde` ohne
 * `?set=` — ab der zweiten Frage einer Lernset-Runde uebte die Seite dann still im
 * ganzen Bestand, obwohl `/lernen` mit gewaehltem Set gestartet wurde.
 *
 * `force-dynamic`, WEIL DIE SEITE SESSION UND LERNSTAND LIEST — dieselbe Begruendung
 * wie `/lernen`.
 */
export const dynamic = "force-dynamic";

export default async function RundeSeite(props: { searchParams: Promise<{ set?: string }> }) {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const { set } = await props.searchParams;
  const db = getDb();
  const nur = set ? idsAusSet(db, set) : undefined;
  const heute = new Date().toISOString().slice(0, 10);
  const ergebnis = baueRundenfrage(db, sub, heute, nur);

  if (!ergebnis) {
    return (
      <div className={s.modul}>
        <p data-testid="lernen-runde-leer">
          Für heute ist alles wiederholt. Schau morgen wieder vorbei.
        </p>
      </div>
    );
  }

  return <QuizInsel frage={ergebnis.frage} svg={ergebnis.svg} beantworte={beantworte} set={set} />;
}
