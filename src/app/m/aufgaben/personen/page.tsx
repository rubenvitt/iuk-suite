import Link from "next/link";
import { notFound } from "next/navigation";
import { canAdminModule } from "@/core/auth/guards";
import { isDirectoryConfigured } from "@/core/directory";
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
 * ER BLEIBT TROTZDEM STEHEN, OBWOHL DIE JIT-ZEILE (`_lib/zugang.ts`s `akteurFuerSeite`, seit dem
 * 2026-08-15) SEINEN HAUPTFALL UEBERNOMMEN HAT: eine Koordinationsperson OHNE eigene `personen`-
 * Zeile bekommt sie dort beim ersten Seitenaufbau, `akteurFuerSeite` liefert ihr also kein `null`
 * mehr. Was bleibt, ist die REIHENFOLGE als Zusage: dieser Riegel entscheidet die Zugangsfrage
 * VOR jeder Personen-Zeilen-Frage und haengt damit an nichts, was in der Modultabelle stehen oder
 * fehlen koennte. Wer ihn "vereinfacht", macht den Erstbetrieb wieder davon abhaengig, dass die
 * Zeilenanlage an genau der richtigen Stelle vorher gelaufen ist.
 *
 * ZWEITE FOLGE, AUSGESCHRIEBEN: eine Koordinationsperson mit `aktivBis` in der Vergangenheit
 * erreicht diese Route — die Gruppe traegt die Rolle, nicht `aktivBis` (Entwurf §5). Das gilt seit
 * dem 2026-08-15 auch fuer `/verteilen` und `/freigaben`: `darfVerteilen`/`darfPersonenVerwalten`
 * messen die Koordination nicht mehr an `istAktiv`. Die frueher hier ausgeschriebene Ungleichheit
 * zwischen dieser Route und den anderen ist damit aufgeloest, nicht bloss verschoben.
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
export function personenInhalt(
  db: DB,
  heute: string,
  bearbeitenId?: string,
  /**
   * Ist ein Personenverzeichnis hinterlegt? Reine Env-Frage (`isDirectoryConfigured`), KEIN Abruf —
   * `/personen` braucht die Nutzerliste nicht, es braucht nur die Entscheidung, welches Eingabefeld
   * die Anlage bekommt. Ein `getDirectory().list()` bloss zur Feldwahl haengte das Gesamtbudget des
   * Verzeichnisses (15 s) an jeden Seitenaufbau. `feedback`s Cockpit-Seite fragt aus einem anderen
   * Grund den echten `status` ab: sie laedt das Verzeichnis ohnehin, um Namen aufzuloesen.
   *
   * DIE ERSETZUNG IST TREU, UND DARAUF BERUHT DER RUECKFALLWEG: `createDirectory` setzt intern
   * `konfiguriert = baseUrl !== "" && apiKey !== ""` — dieselben zwei Env-Werte, dieselbe
   * Bedingung wie `isDirectoryConfigured`. `verzeichnisAktiv === false` heisst deshalb genau: jede
   * `search()` LIEFERTE `status: "unconfigured"`.
   */
  verzeichnisAktiv = false,
) {
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
        <PersonenFormular
          person={bearbeiten ?? undefined}
          verzeichnisAktiv={verzeichnisAktiv}
          key={bearbeiten?.id ?? "neu"}
        />
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
  // BEIDE RUECKGABEWEGE UNTEN BRAUCHEN IHN — und der ERSTE ist der, den eine koordinierende Person
  // tatsaechlich nimmt (der Notausgang kehrt vor `akteurFuerSeite` zurueck). Ihn dort zu vergessen
  // machte das Autofill fuer genau die Menschen unsichtbar, fuer die es gebaut ist, ohne dass ein
  // Test rot wuerde.
  const verzeichnisAktiv = isDirectoryConfigured();
  // DER NOTAUSGANG ZUERST, VOR JEDER PERSONEN-ZEILEN-FRAGE: ein Suite-Admin (oder eine Person in
  // der modul-eigenen Admin-Gruppe) kommt hinein, AUCH OHNE eigene `personen`-Zeile — das ist genau
  // der Fall, der den Erstbetrieb ueberhaupt loest (Fix-Runde 1, s. Kopfkommentar). Wuerde zuerst
  // `akteurFuerSeite` gefragt und bei `null` sofort die Erklaerseite gerendert, faenge sie einen
  // Suite-Admin ab, der (noch) keine `personen`-Zeile hat — genau den Fall, den dieser Notausgang
  // beheben soll.
  if (await canAdminModule("aufgaben")) {
    // EINE KOSMETISCHE FOLGE, AUSGESCHRIEBEN STATT ENTDECKT (Review-Runde zum Quellenwechsel):
    // dieser Zweig kehrt VOR `akteurFuerSeite` zurueck, legt die JIT-Zeile also nicht selbst an.
    // Das tut `layout.tsx`, und Next rendert Layout und Seite im selben Request nebenlaeufig —
    // ob die frisch koordinierende Person ihre EIGENE Zeile schon in der Liste unter dem Formular
    // sieht, ist beim allerersten `/personen`-Aufruf deshalb nicht garantiert. Beim naechsten
    // Aufruf steht sie da. Bewusst NICHT durch einen zweiten Anlegepfad hier geheilt: ein zweiter
    // Schreibort fuer dieselbe Zeile waere teurer als die eine fehlende Zeile in einer Liste.
    const { bearbeiten } = await searchParams;
    return personenInhalt(db, heute, bearbeiten, verzeichnisAktiv);
  }

  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  // DASSELBE PRAEDIKAT WIE DIE OBERFLAECHE: `EinstiegKoordination.tsx`s Fusszeilen-Verweis auf
  // `/personen` erscheint nur fuer die Koordination (die einzigen Menschen, die diesen Einstieg je
  // sehen) — dieselbe Bedingung, die diese Route hier durchsetzt.
  if (!darfPersonenVerwalten(akteur, heute)) notFound();
  const { bearbeiten } = await searchParams;
  return personenInhalt(db, heute, bearbeiten, verzeichnisAktiv);
}
