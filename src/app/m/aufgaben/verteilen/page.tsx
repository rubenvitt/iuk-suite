import { notFound } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { verteilDaten } from "../_db/queries";
import { isoTag } from "../_lib/datum";
import { akteurFuerSeite, darfVerteilen, subFuerSitzung } from "../_lib/zugang";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";
import { VerteilenTabelle } from "../_ui/VerteilenDialog";

export const dynamic = "force-dynamic";

/*
 * `/verteilen` — POSTEINGANG UND VERTEILUNG (Spec §8, §8.2, §8.3, Aufgabe 14). Dieselbe Tabelle wie
 * `_ui/EinstiegKoordination.tsx`s Posteingang-Abschnitt (`_ui/VerteilenDialog.tsx`s
 * `VerteilenTabelle`, s. deren Kopfkommentar fuer die Begruendung der geteilten Komponente) — diese
 * Seite ist die ADRESSIERBARE Route aus Spec §8's Tabelle, mit dem 404-Riegel aus Spec §8.3.
 *
 * `verteilenInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) — sie
 * bekommt `heute` bereits aufgeloest und braucht keine Sitzung; `page.test.tsx` ruft sie direkt.
 *
 * `verteilDaten(db, heute)` (`_db/queries.ts`, Fix-Runde 1) IST DIE EINE LADEFUNKTION FUER DEN
 * POSTEINGANG — `_ui/EinstiegKoordination.tsx` ruft dieselbe Funktion, nicht eine zweite Fassung
 * desselben Ladeblocks (s. deren Kopfkommentar fuer die Review-Begruendung).
 */
export function verteilenInhalt(db: DB, heute: string) {
  const { posteingang: zuVerteilenListe, erstellerNamen, bufdis: bufdisListe, auslastung, tage } =
    verteilDaten(db, heute);

  const kontext =
    zuVerteilenListe.length === 0
      ? "Posteingang leer — alles verteilt."
      : `${zuVerteilenListe.length} Aufgabe${zuVerteilenListe.length === 1 ? "" : "n"} zu verteilen.`;

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Verteilen" }]}
        titel="Verteilen"
        kontext={kontext}
      />
      <VerteilenTabelle
        posteingang={zuVerteilenListe}
        erstellerNamen={erstellerNamen}
        bufdis={bufdisListe}
        auslastung={auslastung}
        tage={tage}
        heute={heute}
        // AUF DIESER EIGENEN ROUTE IMMER `true`: `darfVerteilen(akteur, heute)` hat den
        // Default-Export bereits ueber `notFound()` durchgesetzt (s. unten) — wer hier ankommt, IST
        // eine aktive Koordinationsperson.
        darfVerteilen
      />
    </>
  );
}

export default async function VerteilenPage() {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE (Spec §8.3, Brief): "/verteilen antwortet einer
  // auftrag-Person mit 404, und der Weg dorthin existiert in ihrer Oberflaeche nicht. Beides prueft
  // dasselbe Praedikat aus derselben Quelle." — `darfVerteilen` ist genau das Praedikat, das auch
  // `verteilenAction` (`actions.ts`, ueber `uebergang()`) durchsetzt.
  if (!darfVerteilen(akteur, heute)) notFound();
  return verteilenInhalt(db, heute);
}
