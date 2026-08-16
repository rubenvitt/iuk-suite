import { notFound } from "next/navigation";
import { getDb, type DB } from "../../_db/client";
import {
  allePersonen,
  aufgabe,
  mitDatei,
  nachweiseFuer,
  verlaufFuer,
  verteilDaten,
} from "../../_db/queries";
import type { AufgabeRow } from "../../_db/schema";
import { NACHWEIS_MAX_BYTES } from "../../_lib/ablage";
import { aktionsOptionen } from "../../_lib/aktionsOptionen";
import { EREIGNIS_TEXT, NACHWEIS_ART_TEXT, namenMap } from "../../_lib/anzeige";
import { fmtTagKurz, fmtZeitpunkt, isoTag } from "../../_lib/datum";
import {
  akteurFuerSeite,
  darfAufgabeSehen,
  darfNachweisSehen,
  subFuerSitzung,
  type Akteur,
} from "../../_lib/zugang";
import { AktionsZone } from "../../_ui/AktionsZone";
import { PrioritaetChip, StatusChip } from "../../_ui/Chip";
import { Frist } from "../../_ui/Frist";
import { Ikone } from "../../_ui/ikonen";
import { NachweisBild } from "../../_ui/NachweisBild";
import { NichtEingetragenSeite } from "../../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "../../_ui/aufgaben.module.css";

export const dynamic = "force-dynamic";

/*
 * `/a/<id>` — DAS AUFGABENDETAIL (Spec §8.4, Aufgabe 16). Titel · Chip-Zeile (Zustand, Prioritaet,
 * Nachweispflicht) · die Erklaerung UNGEKUERZT · ein Metablock (Auftraggeber, Zugewiesen, Frist,
 * Dauerschaetzung, Pruefer) · der Nachweisbereich · die Aktionszone · der Verlauf als Journal.
 *
 * DAS SICHTRECHT (Spec §7, Brief): eine unbekannte Id bleibt `notFound()` — die Grenze der
 * Erklaerseiten-Ausnahme aus dem Spec-Nachtrag vom 2026-08-14 gilt NUR fuer die eigene, fehlende
 * `personen`-Zeile, nicht fuer ein unbekanntes OBJEKT. Wer die Aufgabe nicht sehen darf
 * (`darfAufgabeSehen`, `_lib/zugang.ts` — neu in dieser Aufgabe, s. Bericht), bekommt ebenfalls
 * `notFound()`, NICHT 403: dieselbe Suite-Linie wie ueberall sonst im Modul.
 *
 * DIE AKTIONSZONE ENTSCHEIDET NICHTS SELBST: `aktionsOptionen(task, akteur, heute)` (`_lib/`,
 * ruft `uebergang()` je Aktion) laeuft HIER, in der Server Component — `_ui/AktionsZone.tsx`
 * ("use client") importiert weder `_lib/zugang.ts` noch `_lib/lebenszyklus.ts` (beide zoegen
 * `@/core/auth` ins Client-Bundle).
 *
 * NACHWEISE SIND ENGER ALS DIE AUFGABE (`darfNachweisSehen`, Spec §2: „Leistungsnachweise sind
 * kein Aushang") — ein BuFDi, der die Aufgabe wegen `darfAufgabeSehen`s Peer-Klausel sehen darf,
 * sieht deshalb noch lange nicht ihre Nachweise.
 *
 * `aufgabeInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) —
 * `page.test.tsx` ruft sie direkt, mit bereits aufgeloester Aufgabe und aufgeloestem Akteur.
 */
export function aufgabeInhalt(db: DB, akteur: Akteur, task: AufgabeRow, heute: string) {
  const namen = namenMap(allePersonen(db));
  const erstellerName = namen[task.erstellerId] ?? "—";
  const zugewiesenName =
    task.zugewiesenAn !== null ? (namen[task.zugewiesenAn] ?? "—") : "Noch nicht verteilt";
  const pruefName = task.prueferId !== null ? (namen[task.prueferId] ?? "—") : "—";

  const nachweisSichtbar = darfNachweisSehen(akteur, task);
  const nachweisListe = nachweisSichtbar ? mitDatei(db, nachweiseFuer(db, task.id)) : [];
  const verlaufListe = verlaufFuer(db, task.id);
  const optionen = aktionsOptionen(task, akteur, heute);
  /*
   * DIE ZIELE FUER „ANDERS ZUWEISEN" (Oberflaechen-Spec 2026-08-16 §7 Nr. 3, Schritt 6) — GELADEN
   * NUR, WENN DIE AKTION UEBERHAUPT ERLAUBT IST. `optionen.umverteilen` ist
   * `uebergang(task, "umverteilen", akteur, heute).erlaubt` und traegt damit BEIDES: den Zustand
   * (`verteilt`) und `darfVerteilen`. Ein zweites, hier geschriebenes `akteur.istKoordination`
   * waere genau der Nachbau, den §11.3 verbietet — und die Abfrage liefe fuer jede BuFDi auf jeder
   * Detailseite mit, ohne je gebraucht zu werden.
   *
   * `verteilDaten` IST DIESELBE LADEFUNKTION WIE AUF `/verteilen` UND IM EINSTIEG — die Zielliste
   * kommt daraus aus `bufdis()`, nicht aus `aktivePersonen()`. Eine ausgeschiedene Person ist kein
   * Verteilziel, und dieser Riegel bleibt woertlich (§11.3).
   */
  const verteilZiele = optionen.umverteilen ? verteilDaten(db, heute) : null;

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: task.titel }]}
        titel={task.titel}
        hilfe="aufgabe"
        kontext={`Erstellt von ${erstellerName} · Frist ${fmtTagKurz(task.faelligAm)}`}
      />

      <div
        style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm, marginBlockEnd: SPACE.md }}
      >
        <StatusChip status={task.status} />
        <PrioritaetChip prioritaet={task.prioritaet} />
        {/*
         * DIE FRIST STEHT SEIT DER OBERFLAECHEN-SPEC (§7 Nr. 1) IN DER CHIP-ZEILE, in der festen
         * Reihenfolge Zustand · Prioritaet · Frist · Nachweispflicht. Vorher stand sie
         * AUSSCHLIESSLICH im Metablock darunter — die wichtigste Zahl der Seite also je nach
         * Ansicht an unterschiedlichen Orten, und ueberfaellig sah dort aus wie jedes andere Datum.
         * Der Metablock behaelt seinen Eintrag, weil er als einziger die Uhrzeit traegt.
         */}
        <Frist aufgabe={task} heute={heute} />
        <span style={SCHRIFT.neben}>
          Nachweispflicht: {task.nachweisPflicht ? `Ja (${NACHWEIS_ART_TEXT[task.nachweisArt]})` : "Nein"}
        </span>
      </div>

      <p style={{ ...SCHRIFT.text, marginBlockEnd: SPACE.lg, maxWidth: 640 }}>{task.beschreibung}</p>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: SPACE.sm,
          margin: `0 0 ${SPACE.xl}px`,
          maxWidth: 720,
        }}
      >
        <MetaEintrag label="Auftraggeber" wert={erstellerName} />
        <MetaEintrag label="Zugewiesen" wert={zugewiesenName} />
        <MetaEintrag label="Frist" wert={fmtTagKurz(task.faelligAm) + (task.faelligUhrzeit ? `, ${task.faelligUhrzeit}` : "")} />
        <MetaEintrag label="Dauerschätzung" wert={`${task.dauerMinuten} Min.`} />
        <MetaEintrag label="Prüfer" wert={task.istSelbst ? "— (Selbstaufgabe)" : pruefName} />
      </dl>

      <section id="nachweis" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Nachweis</h2>
        {nachweisSichtbar ? (
          nachweisListe.length === 0 ? (
            <p style={SCHRIFT.text}>Noch kein Nachweis hinterlegt.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: SPACE.xs }}>
              {nachweisListe.map(({ nachweis: n, datei, freigegeben }) => (
                <li key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: SPACE.xs }}>
                  {n.art === "text" ? (
                    <>
                      <Ikone name="nachweis-text" />
                      <span style={SCHRIFT.text}>{n.text}</span>
                    </>
                  ) : (
                    <NachweisBild
                      aufgabeId={task.id}
                      nachweisId={n.id}
                      datei={datei}
                      freigegeben={freigegeben}
                    />
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p style={SCHRIFT.neben}>
            Nachweise sind nur für Koordination, Ersteller, Zugewiesene und den eingetragenen Prüfer sichtbar.
          </p>
        )}
      </section>

      <section id="aktion" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Aktion</h2>
        <AktionsZone
          aufgabe={task}
          optionen={optionen}
          nachweisMaxBytes={NACHWEIS_MAX_BYTES}
          verteilen={
            verteilZiele === null
              ? null
              : {
                  bufdis: verteilZiele.bufdis,
                  auslastung: verteilZiele.auslastung,
                  tage: verteilZiele.tage,
                }
          }
        />
      </section>

      <section id="verlauf">
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Verlauf</h2>
        <ul className={s.journal} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {verlaufListe.map((v) => (
            <li key={v.id}>
              <span className={s.jts}>{fmtZeitpunkt(v.ts)}</span>{" "}
              <strong>{namen[v.akteurId] ?? "—"}</strong> —{" "}
              {(EREIGNIS_TEXT as Record<string, string>)[v.ereignis] ?? v.ereignis}
              {v.notiz ? <>: {v.notiz}</> : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function MetaEintrag({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <dt style={{ ...SCHRIFT.neben, margin: 0 }}>{label}</dt>
      <dd style={{ ...SCHRIFT.text, margin: 0 }}>{wert}</dd>
    </div>
  );
}

export default async function AufgabeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  // `akteurFuerSeite` statt `akteurFuerSession`: Modulzugang ohne `personen`-Zeile ist die eigene
  // Erklaerseite, nicht `notFound()` (Spec-Nachtrag 2026-08-14). Erst DANACH die Objekt-Id aufloesen
  // — eine unbekannte oder unsichtbare Aufgabe bleibt `notFound()` (Grenze der Ausnahme).
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;

  const { id } = await params;
  const task = aufgabe(db, id);
  if (!task) notFound();
  if (!darfAufgabeSehen(akteur, task)) notFound();

  const heute = isoTag(new Date());
  return aufgabeInhalt(db, akteur, task, heute);
}
