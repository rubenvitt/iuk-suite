import { notFound } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { freigabeDaten } from "../_db/queries";
import type { PersonRow } from "../_db/schema";
import { isoTag } from "../_lib/datum";
import { darfFreigabenSehen, personFuerSeite, subFuerSitzung } from "../_lib/zugang";
import { FreigabeZone } from "../_ui/FreigabeZone";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";

export const dynamic = "force-dynamic";

/*
 * `/freigaben` — DIE FREIGABE-WARTESCHLANGE ALS EIGENE, ADRESSIERBARE ROUTE (Spec §8, Aufgabe 15).
 * Fuer `auftrag`/`koordination` (`darfFreigabenSehen`, `_lib/zugang.ts` — EIN EIGENES, benanntes
 * Praedikat, KEIN Alias auf `darfEinstellenFuerAndere`, obwohl beide heute denselben Ausdruck
 * auswerten: s. dessen Kopfkommentar fuer die Begruendung).
 *
 * DIESELBE `FreigabeZone`-KOMPONENTE UND DIESELBE `freigabeDaten(db, person, heute)`-LADEFUNKTION
 * WIE `_ui/EinstiegAuftrag.tsx`s INLINE-ABSCHNITT (Vorbild `VerteilenTabelle`/`verteilDaten`,
 * Aufgabe 14) — diese Route ist die adressierbare Flaeche aus Spec §8s Tabelle, die inline-Sektion
 * bleibt die Auftraggeber-Ansicht auf derselben Datengrundlage. Keine zweite Fassung, die
 * auseinanderlaufen koennte.
 *
 * `freigabenInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `verteilenInhalt`) —
 * `page.test.tsx` ruft sie direkt, ohne eine Sitzung zu stellen.
 */
export function freigabenInhalt(db: DB, person: PersonRow, heute: string) {
  const { meine, vertretung } = freigabeDaten(db, person, heute);
  const anzahl = meine.length + vertretung.length;
  const kontext =
    anzahl === 0
      ? "Keine Freigabe offen."
      : `${anzahl} Aufgabe${anzahl === 1 ? "" : "n"} warten auf Freigabe.`;

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Freigaben" }]}
        titel="Freigaben"
        kontext={kontext}
      />
      <FreigabeZone meine={meine} vertretung={vertretung} heute={heute} />
    </>
  );
}

export default async function FreigabenPage() {
  const db = getDb();
  const person = await personFuerSeite(db);
  if (!person) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE: `EinstiegAuftrag.tsx`s eigene Freigabe-Warteschlange
  // erscheint nur fuer `auftrag`, `EinstiegKoordination.tsx`s nur fuer `koordination` — dieselbe
  // Bedingung, zusammengefasst, durchsetzt diese Route.
  if (!darfFreigabenSehen(person, heute)) notFound();
  return freigabenInhalt(db, person, heute);
}
