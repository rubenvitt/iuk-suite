import { notFound } from "next/navigation";
import { getDb, type DB } from "../../_db/client";
import { aufgabenFuerPerson, personNachId, rangGrenzen, routinenFuer } from "../../_db/queries";
import type { PersonRow } from "../../_db/schema";
import { fmtStunden, tagesBudget, wartetAufEinplanung } from "../../_lib/anzeige";
import { ausgewaehlterTag, isoTag, montagAusParam, wochenTage } from "../../_lib/datum";
import {
  akteurFuerSeite,
  darfPlanAendern,
  darfPlanSehen,
  subFuerSitzung,
  type Akteur,
} from "../../_lib/zugang";
import { EinplanenFormular } from "../../_ui/EinplanenFormular";
import { NichtEingetragenSeite } from "../../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import { TagesWaehler } from "../../_ui/TagesWaehler";
import { WochenWaehler } from "../../_ui/WochenWaehler";
import { Wochenplan } from "../../_ui/Wochenplan";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

export const dynamic = "force-dynamic";

/*
 * DER ZEITPLAN EINER PERSON (Spec §7, §8, §8.5, Aufgabe 13) — eigener änderbar, fremder lesend.
 *
 * ZWEI VERSCHIEDENE DINGE, DIE EIN MECHANISCHER UMBAU LEICHT ZUSAMMENZIEHT: `betrachter` ist der
 * `Akteur` (er stellt die Rechtefragen), `ziel` bleibt eine reine `PersonRow` — es ist das ANGEZEIGTE
 * Objekt und speist `Wochenplan`/`tagesBudget`, nicht ein Praedikat.
 *
 * `planInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) — sie bekommt
 * `betrachter`/`ziel` bereits aufgeloest und braucht keine Sitzung; nur der Default-Export loest
 * den Akteur auf und schlaegt `personId` gegen die Datenbank nach.
 *
 * DIE ZUGEHOERIGKEIT KOMMT AUS DER DATENBANK, NIE AUS DEM URL-PARAMETER (Spec §7): `personId`
 * wird ueber `personNachId` aufgeloest; gibt es die Person nicht, `notFound()` — sonst waere
 * `/plan/17` ein IDOR. `darfPlanSehen` ist fuer ALLE wahr (Spec: BuFDis sehen die Zeitplaene der
 * anderen lesend, `koordination`/`auftrag` ohnehin), wird aber TROTZDEM aufgerufen — dieselbe
 * Quelle wie ueberall im Modul, nicht eine implizite Zusage, die nirgends mehr geprueft wird.
 *
 * `darfPlanAendern` ENTSCHEIDET, OB AKTIONEN ERSCHEINEN — nur der eigene Plan ist aenderbar, auch
 * fuer die Koordination nicht (`_lib/zugang.ts`-Kommentar zu `darfPlanAendern`). DASSELBE
 * PRAEDIKAT STEUERT DREI DINGE ZUGLEICH, NICHT DREI NACHGEBAUTE BEDINGUNGEN: das
 * "Einzuplanen"-Formular unten, `Wochenplan`s `zeigeAktionen`/`rang` (RangKnoepfe) UND den
 * Hinweistext im Lesefall — ein Knopf, der hier erschiene, waere serverseitig ohnehin abgelehnt,
 * und umgekehrt darf keiner FEHLEN, wo die Action ihn erlaubt (Spec §7's Massstab).
 */
export function planInhalt(
  db: DB,
  betrachter: Akteur,
  ziel: PersonRow,
  heute: string,
  searchParams: { woche?: string; tag?: string },
) {
  // `darfPlanSehen` ist heute immer wahr — der Aufruf bleibt trotzdem stehen (Kopfkommentar).
  if (!darfPlanSehen(betrachter, ziel.id)) notFound();
  const darfAendern = darfPlanAendern(betrachter, ziel.id, heute);

  const montag = montagAusParam(searchParams.woche, heute);
  const tage = wochenTage(montag);
  const mobilTag = ausgewaehlterTag(tage, heute, searchParams.tag);

  const aufgaben = aufgabenFuerPerson(db, ziel.id);
  const routinen = routinenFuer(db, ziel.id);
  const rang = darfAendern ? rangGrenzen(db, ziel.id, tage) : undefined;

  const budgets = tage.map((tag) => tagesBudget(aufgaben, routinen, ziel, tag));
  const verplantMinuten = budgets.reduce((summe, b) => summe + b.verplantMinuten, 0);
  const sollMinuten = budgets.reduce((summe, b) => summe + b.sollMinuten, 0);
  const kontext = `Diese Woche: ${fmtStunden(verplantMinuten)} von ${fmtStunden(sollMinuten)} Std. verplant.`;

  // NUR DER EIGENE PLAN ZEIGT DEN "EINZUPLANEN"-ABSCHNITT — dieselbe Ableitung wie die
  // Posteingang-Kachel/Liste in `EinstiegBufdi.tsx` (`wartetAufEinplanung`, `_lib/anzeige.ts`),
  // nicht neu gerechnet.
  const nochEinzuplanen = darfAendern ? aufgaben.filter(wartetAufEinplanung) : [];

  const eigenerPlan = betrachter.person.id === ziel.id;

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }]}
        titel={eigenerPlan ? "Mein Zeitplan" : `Zeitplan von ${ziel.name}`}
        kontext={kontext}
      />

      <div style={{ marginBlockEnd: SPACE.lg }}>
        <WochenWaehler montag={montag} heute={heute} />
      </div>

      {darfAendern && nochEinzuplanen.length > 0 ? (
        <section style={{ marginBlockEnd: SPACE.xl }}>
          <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Einzuplanen</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
            {/*
             * `idPrefix={ep-<id>}` (Gegenprobe-Fund, Aufgabe 13): diese Schleife kann MEHR als
             * eine Aufgabe rendern. `EinplanenFormular`s alter fester Praefix "ep-" haette bei
             * zwei Formularen dieselben Feld-Ids erzeugt — jedes `label[for]` haette auf das
             * ERSTE Formular gezeigt. Der zweite Zeilentest in `page.test.tsx` haelt das mit
             * ZWEI einzuplanenden Aufgaben fest (Lektion: Listen mit Zeilen-Formularen/-Aktionen
             * brauchen einen Test mit mindestens zwei Zeilen).
             */}
            {nochEinzuplanen.map((a) => (
              <div key={a.id} id={`einplanen-${a.id}`}>
                <h3 style={{ ...SCHRIFT.text, fontWeight: 600, margin: `0 0 ${SPACE.xs}px` }}>
                  {a.titel}
                </h3>
                <EinplanenFormular task={a} idPrefix={`ep-${a.id}`} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <TagesWaehler tage={tage} ausgewaehlterTag={mobilTag} />

      <Wochenplan
        aufgaben={aufgaben}
        routinen={routinen}
        person={ziel}
        montag={montag}
        heute={heute}
        mobilTag={mobilTag}
        zeigeAktionen={darfAendern}
        rang={rang}
      />

      {/*
       * DER LESEFALL BEKOMMT EINEN SATZ, KEINE STILLE ABWESENHEIT — sonst sieht eine Person, die
       * einen fremden Plan zum ersten Mal oeffnet, nicht, WARUM hier nichts anklickbar ist.
       */}
      {!darfAendern ? (
        <p style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.lg }}>
          Dieser Zeitplan gehört {ziel.name} — nur {ziel.name} kann ihn ändern.
        </p>
      ) : null}
    </>
  );
}

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ woche?: string; tag?: string }>;
}) {
  const db = getDb();
  // `akteurFuerSeite` statt `akteurFuerSession`: Modulzugang ohne `personen`-Zeile ist die eigene
  // Erklaerseite, nicht `notFound()` (Spec-Nachtrag 2026-08-14, `_lib/zugang.ts`). Erst DANACH die
  // Ziel-Id aufloesen — eine unbekannte Objekt-Id bleibt `notFound()` (Grenze der Ausnahme).
  const betrachter = await akteurFuerSeite(db);
  if (!betrachter) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const { personId } = await params;
  const ziel = personNachId(db, personId);
  if (!ziel) notFound();
  const heute = isoTag(new Date());
  const sp = await searchParams;
  return planInhalt(db, betrachter, ziel, heute, sp);
}
