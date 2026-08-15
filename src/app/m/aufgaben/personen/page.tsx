import Link from "next/link";
import { notFound } from "next/navigation";
import { canAdminModule } from "@/core/auth/guards";
import { getDb, type DB } from "../_db/client";
import { allePersonen } from "../_db/queries";
import { isoTag } from "../_lib/datum";
import { akteurFuerSeite, darfPersonenVerwalten, istAktiv, subFuerSitzung } from "../_lib/zugang";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { PersonenFormular } from "../_ui/PersonenFormular";
import { PersonenTabelle, type PersonenZeile } from "../_ui/PersonenTabelle";
import { SeitenKopf } from "../_ui/SeitenKopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

export const dynamic = "force-dynamic";

/*
 * `/personen` — DIE PERSONENVERWALTUNG (Spec §4, §7, §9.9, Aufgabe 14). Gatet ueber
 * `darfPersonenVerwalten` (`_lib/zugang.ts`) — MIT EINEM NOTAUSGANG fuer den Suite-Admin (Fix-Runde
 * 1, Betreiberentscheidung 2026-08-14): Spec §4 verlangt woertlich "plus der Suite-Admin
 * (isModuleAdmin aus core/groups)", und `darfPersonenVerwalten` deckte damals nur die erste Haelfte
 * (die `koordination`-Rolle aus der `personen`-Tabelle). Ohne den Notausgang gaebe es KEINEN Weg zur
 * allerersten `koordination`-Zeile in einer frischen Datenbank, und eine versehentlich beendete
 * einzige Koordinationsperson sperrte auch den Betreiber selbst aus — s. Bericht.
 *
 * SEIT DEM QUELLENWECHSEL (2026-08-15) IST DIESER NOTAUSGANG KEINE AUSNAHME MEHR, SONDERN DIESELBE
 * REGEL WIE IM GANZEN MODUL: `darfPersonenVerwalten` fragt inzwischen `akteur.istKoordination`, und
 * das kommt aus derselben Quelle wie hier — `canAdminModule("aufgaben")` (`_lib/zugang.ts`s
 * `akteurFuer`). Was am 2026-08-14 fuer EINE Route entschieden wurde, gilt jetzt fuer alle.
 *
 * ER BLEIBT TROTZDEM STEHEN, UND ZWAR FUER GENAU EINEN FALL: eine Koordinationsperson OHNE eigene
 * `personen`-Zeile. `akteurFuerSeite` liefert dafuer heute noch `null` (die Zeile fehlt), also
 * bekaeme sie ohne diesen vorgezogenen Riegel die Erklaerseite statt der Personenverwaltung — und
 * damit weiterhin keinen Weg zur allerersten Zeile in einer frischen Datenbank. Erst die JIT-Zeile
 * (Aufgabe 4 des Plans) entschaerft das; bis dahin traegt dieser Notausgang den Erstbetrieb.
 *
 * ZWEITE FOLGE, AUSGESCHRIEBEN: weil er VOR jeder Personen-Zeilen-Frage steht, erreicht eine
 * Koordinationsperson mit `aktivBis` in der Vergangenheit diese Route trotzdem — die Gruppe traegt
 * die Rolle, nicht `aktivBis` (Entwurf §5). Auf `/verteilen` und `/freigaben` gilt das noch NICHT:
 * dort endet das Praedikat weiterhin auf `&& istAktiv(...)`, und dort steht kein Notausgang. Diese
 * Ungleichheit ist bekannt und wird mit Aufgabe 4 aufgeloest, nicht hier still.
 *
 * DER RIEGEL SITZT AUF DER ROUTE (`canAdminModule`, `core/auth/guards.ts`), NICHT IM PRAEDIKAT —
 * und das gilt WEITER: `darfPersonenVerwalten` bleibt synchron und rein, weil
 * `_lib/lebenszyklus.ts` und jeder bestehende Aufrufer (`actions.ts`) diese Signatur teilen. Die
 * Gruppenfrage wird EINMAL beim Aufloesen des `Akteur` gestellt (`akteurFuer`) und als fertiges
 * Boolean weitergereicht; wer sie stattdessen IN das Praedikat zieht, macht es asynchron oder
 * verlangt einen `groups`-Parameter, den keiner der bestehenden Aufrufer mitfuehrt.
 *
 * `personenInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) — kein
 * `akteurFuerSeite`/`darfPersonenVerwalten`/`canAdminModule`-Aufruf darin, `page.test.tsx` ruft sie
 * direkt.
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
  const heute = isoTag(new Date());
  // DER NOTAUSGANG ZUERST, VOR JEDER PERSONEN-ZEILEN-FRAGE: ein Suite-Admin (oder eine Person in
  // der modul-eigenen Admin-Gruppe) kommt hinein, AUCH OHNE eigene `personen`-Zeile — das ist genau
  // der Fall, der den Erstbetrieb ueberhaupt loest (Fix-Runde 1, s. Kopfkommentar). Wuerde zuerst
  // `akteurFuerSeite` gefragt und bei `null` sofort die Erklaerseite gerendert, faenge sie einen
  // Suite-Admin ab, der (noch) keine `personen`-Zeile hat — genau den Fall, den dieser Notausgang
  // beheben soll.
  if (await canAdminModule("aufgaben")) {
    const { bearbeiten } = await searchParams;
    return personenInhalt(db, heute, bearbeiten);
  }

  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE: `EinstiegKoordination.tsx`s Fusszeilen-Verweis auf
  // `/personen` erscheint nur fuer `koordination` (die einzige Rolle, die diesen Einstieg je sieht)
  // — dieselbe Bedingung, die diese Route hier durchsetzt.
  if (!darfPersonenVerwalten(akteur, heute)) notFound();
  const { bearbeiten } = await searchParams;
  return personenInhalt(db, heute, bearbeiten);
}
