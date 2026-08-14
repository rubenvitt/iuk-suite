import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { allePersonen } from "../_db/queries";
import { isoTag } from "../_lib/datum";
import { darfPersonenVerwalten, istAktiv, personFuerSeite, subFuerSitzung } from "../_lib/zugang";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { PersonenFormular } from "../_ui/PersonenFormular";
import { PersonenTabelle, type PersonenZeile } from "../_ui/PersonenTabelle";
import { SeitenKopf } from "../_ui/SeitenKopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

export const dynamic = "force-dynamic";

/*
 * `/personen` — DIE PERSONENVERWALTUNG (Spec §4, §7, §9.9, Aufgabe 14). Gatet ueber
 * `darfPersonenVerwalten` (`_lib/zugang.ts`) — s. Bericht fuer die offene Frage, die dieses
 * Praedikat NICHT beantwortet (Spec §4s "plus der Suite-Admin").
 *
 * `personenInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) — kein
 * `personFuerSession`/`darfPersonenVerwalten`-Aufruf darin, `page.test.tsx` ruft sie direkt.
 *
 * `istAktiv` WIRD HIER, SERVERSEITIG, JE ZEILE BERECHNET (nicht in `_ui/PersonenTabelle.tsx`) —
 * s. deren Kopfkommentar: ein Import aus `_lib/zugang.ts` in eine Client-Insel wuerde next-auths
 * `auth()` ins Client-Bundle ziehen.
 */
export function personenInhalt(db: DB, heute: string, bearbeitenId?: string) {
  const personenListe = allePersonen(db);
  const bearbeiten = bearbeitenId
    ? (personenListe.find((p) => p.id === bearbeitenId) ?? null)
    : null;

  const anzahl = personenListe.length;
  const aktiveAnzahl = personenListe.filter((p) => istAktiv(p, heute)).length;
  const kontext = `${anzahl} Person${anzahl === 1 ? "" : "en"} im Modul, davon ${aktiveAnzahl} aktiv.`;

  const zeilen: PersonenZeile[] = personenListe.map((person) => ({
    person,
    istAktivHeute: istAktiv(person, heute),
  }));

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Personenverwaltung" }]}
        titel="Personenverwaltung"
        kontext={kontext}
      />

      <section id="person-formular" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>
          {bearbeiten ? `Person „${bearbeiten.name}“ ändern` : "Neue Person anlegen"}
        </h2>
        <PersonenFormular person={bearbeiten ?? undefined} key={bearbeiten?.id ?? "neu"} />
        {bearbeiten ? (
          <Link href="/personen" style={{ display: "inline-block", marginBlockStart: SPACE.sm }}>
            Abbrechen
          </Link>
        ) : null}
      </section>

      <PersonenTabelle zeilen={zeilen} />
    </>
  );
}

export default async function PersonenPage({
  searchParams,
}: {
  searchParams: Promise<{ bearbeiten?: string }>;
}) {
  const db = getDb();
  const person = await personFuerSeite(db);
  if (!person) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const heute = isoTag(new Date());
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE: `EinstiegKoordination.tsx`s Fusszeilen-Verweis auf
  // `/personen` erscheint nur fuer `koordination` (die einzige Rolle, die diesen Einstieg je sieht)
  // — dieselbe Bedingung, die diese Route hier durchsetzt.
  if (!darfPersonenVerwalten(person, heute)) notFound();
  const { bearbeiten } = await searchParams;
  return personenInhalt(db, heute, bearbeiten);
}
