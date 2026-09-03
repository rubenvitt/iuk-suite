import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { beantworte } from "../../../actions";
import { getDb } from "../../../_db/client";
import { idsAusSet, naechsteKarte } from "../../../_db/lernen";
import { baueFrage, fragbareZeichen, richtungFuer } from "../../../_lib/lernen/fragen";
import { seedAus } from "../../../_lib/lernen/zufall";
import { QuizInsel } from "../../../_ui/QuizInsel";
import s from "../../../_ui/zeichen.module.css";

/**
 * DIE RUNDE — eine Server Component, die genau EINE Frage baut und sie an die
 * `"use client"`-Insel `QuizInsel` reicht (Falle 9: `beantworte` ist eine Server Action
 * und darf als einzige Funktion die Grenze ueberqueren, direkt importiert, nie als
 * Prop einer weiteren Client-Komponente durchgereicht).
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
  const karte = naechsteKarte(db, sub, heute, nur);

  if (!karte) {
    return (
      <div className={s.modul}>
        <p data-testid="lernen-runde-leer">
          Für heute ist alles wiederholt. Schau morgen wieder vorbei.
        </p>
      </div>
    );
  }

  /*
   * DER SEED HAENGT AN (sub, zeichenId, Fragetyp) — nicht an der Uhr. Damit wuerfelt die
   * Frage bei einem Rerender nicht neu, und derselbe Testfall ergibt zweimal dasselbe.
   * DIE DISTRAKTOREN KOMMEN AUS DEM GANZEN BESTAND, auch bei gewaehltem Set: sonst
   * verriete ein Set mit 15 Zeichen bei der vierten Frage die Loesung.
   */
  const typ = richtungFuer(karte.zeichen, karte.stufe, seedAus(sub, karte.zeichen.id, "richtung"));
  const frage = baueFrage(karte.zeichen, typ, fragbareZeichen(), seedAus(sub, karte.zeichen.id, typ));

  return <QuizInsel frage={frage} svg={karte.zeichen.svg} beantworte={beantworte} />;
}
