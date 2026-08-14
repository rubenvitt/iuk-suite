import { notFound } from "next/navigation";
import { getDb, type DB } from "../../_db/client";
import { allePersonen, aufgabe, nachweiseFuer, verlaufFuer } from "../../_db/queries";
import type { AufgabeRow, PersonRow } from "../../_db/schema";
import { aktionsOptionen } from "../../_lib/aktionsOptionen";
import { EREIGNIS_TEXT, NACHWEIS_ART_TEXT, namenMap } from "../../_lib/anzeige";
import { fmtTagKurz, fmtZeitpunkt, isoTag } from "../../_lib/datum";
import { darfAufgabeSehen, darfNachweisSehen, personFuerSeite, subFuerSitzung } from "../../_lib/zugang";
import { AktionsZone } from "../../_ui/AktionsZone";
import { PrioritaetChip, StatusChip } from "../../_ui/Chip";
import { Ikone } from "../../_ui/ikonen";
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
 * DIE AKTIONSZONE ENTSCHEIDET NICHTS SELBST: `aktionsOptionen(task, person, heute)` (`_lib/`,
 * ruft `uebergang()` je Aktion) laeuft HIER, in der Server Component — `_ui/AktionsZone.tsx`
 * ("use client") importiert weder `_lib/zugang.ts` noch `_lib/lebenszyklus.ts` (beide zoegen
 * `@/core/auth` ins Client-Bundle).
 *
 * NACHWEISE SIND ENGER ALS DIE AUFGABE (`darfNachweisSehen`, Spec §2: „Leistungsnachweise sind
 * kein Aushang") — ein BuFDi, der die Aufgabe wegen `darfAufgabeSehen`s Peer-Klausel sehen darf,
 * sieht deshalb noch lange nicht ihre Nachweise.
 *
 * `aufgabeInhalt` IST DIE REINE, EXPORTIERTE INHALTSFUNKTION (Vorbild `routinenInhalt`) —
 * `page.test.tsx` ruft sie direkt, mit bereits aufgeloester Aufgabe und Person.
 */
export function aufgabeInhalt(db: DB, person: PersonRow, task: AufgabeRow, heute: string) {
  const namen = namenMap(allePersonen(db));
  const erstellerName = namen[task.erstellerId] ?? "—";
  const zugewiesenName =
    task.zugewiesenAn !== null ? (namen[task.zugewiesenAn] ?? "—") : "Noch nicht verteilt";
  const pruefName = task.prueferId !== null ? (namen[task.prueferId] ?? "—") : "—";

  const nachweisSichtbar = darfNachweisSehen(person, task);
  const nachweisListe = nachweisSichtbar ? nachweiseFuer(db, task.id) : [];
  const verlaufListe = verlaufFuer(db, task.id);
  const optionen = aktionsOptionen(task, person, heute);

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: task.titel }]}
        titel={task.titel}
        kontext={`Erstellt von ${erstellerName} · Frist ${fmtTagKurz(task.faelligAm)}`}
      />

      <div
        style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm, marginBlockEnd: SPACE.md }}
      >
        <StatusChip status={task.status} />
        <PrioritaetChip prioritaet={task.prioritaet} />
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
              {nachweisListe.map((n) => (
                <li key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: SPACE.xs }}>
                  {n.art === "text" ? (
                    <>
                      <Ikone name="nachweis-text" />
                      <span style={SCHRIFT.text}>{n.text}</span>
                    </>
                  ) : (
                    <>
                      <Ikone name="nachweis-bild" />
                      {/* Auslieferung folgt erst mit Aufgabe 19 (core/av/scanner.ts, Ablage-Warteschlange). */}
                      <span style={SCHRIFT.text}>Bildnachweis — Anzeige folgt (Aufgabe 19).</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p style={SCHRIFT.neben}>
            Nachweise sind nur fuer Koordination, Ersteller, Zugewiesene und den eingetragenen Prüfer sichtbar.
          </p>
        )}
      </section>

      <section id="aktion" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Aktion</h2>
        <AktionsZone aufgabe={task} optionen={optionen} />
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
  // `personFuerSeite` statt `personFuerSession`: Modulzugang ohne `personen`-Zeile ist die eigene
  // Erklaerseite, nicht `notFound()` (Spec-Nachtrag 2026-08-14). Erst DANACH die Objekt-Id aufloesen
  // — eine unbekannte oder unsichtbare Aufgabe bleibt `notFound()` (Grenze der Ausnahme).
  const person = await personFuerSeite(db);
  if (!person) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;

  const { id } = await params;
  const task = aufgabe(db, id);
  if (!task) notFound();
  if (!darfAufgabeSehen(person, task)) notFound();

  const heute = isoTag(new Date());
  return aufgabeInhalt(db, person, task, heute);
}
