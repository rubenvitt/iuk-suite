import Link from "next/link";
import { getDb } from "../_db/client";
import { isoTag } from "../_lib/datum";
import { FADEN, ROLLEN, hilfeSichten, zielHref, type HilfeSicht } from "../_lib/hilfe";
import { akteurFuerSeite, subFuerSitzung, type Akteur } from "../_lib/zugang";
import { NichtEingetragenSeite } from "../_ui/NichtEingetragenSeite";
import { SeitenKopf } from "../_ui/SeitenKopf";
import { Mechanikbild } from "../_ui/hilfe/Bilder";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "../_ui/aufgaben.module.css";

export const dynamic = "force-dynamic";

/*
 * `/hilfe` — DIE UEBERSICHT DER BEDIENUNGSANLEITUNG.
 *
 * ══ SIE ZEIGT NUR DIE KAPITEL DIESER PERSON. Die Auswahl kommt aus `hilfeSichten` und damit aus
 *    denselben Praedikaten wie die Modulnavigation (`_lib/zugang.ts`, Spec §7). Eine vollstaendige
 *    Kapitelliste waere fuer eine BuFDi ein Inhaltsverzeichnis, dessen halbe Eintraege auf Seiten
 *    zeigen, die ihr mit 404 antworten — und fuer eine Anleitung ist das schlimmer als eine
 *    Luecke: sie beschriebe Wege, die es fuer sie nicht gibt.
 *
 * ══ DAS LEBENSZYKLUSBILD STEHT HIER UND NICHT NUR IM KAPITEL `aufgabe`: es ist das gemeinsame
 *    Vokabular aller Rollen. „Freigabe offen", „zurueckgewiesen", „verteilt" stehen in jeder Liste
 *    des Moduls; wer sie einmal im Zusammenhang gesehen hat, braucht die Erklaerung nicht in jeder
 *    Zeile noch einmal.
 *
 * ══ OHNE `personen`-ZEILE DIESELBE ANTWORT WIE JEDE ANDERE MODULSEITE (`NichtEingetragenSeite`):
 *    die Rollenfrage ist dann unbeantwortbar, und alle Kapitel beschrieben Flaechen, die dieser
 *    Person heute ohnehin die Erklaerseite zeigen. Die Erklaerseite selbst sagt, was zu tun ist —
 *    das ist die Anleitung, die in dieser Lage traegt.
 */
export function hilfeInhalt(akteur: Akteur, heute: string) {
  const sichten = hilfeSichten(akteur, heute);
  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben", href: "/" }, { label: "Anleitung" }]}
        titel="Anleitung"
        kontext={`${sichten.length} Kapitel — je eines für die Sichten, die dir offenstehen.`}
      />

      <p style={{ ...SCHRIFT.text, maxWidth: 640, marginBlockEnd: SPACE.xl }}>
        Jedes Kapitel beschreibt <strong>eine Sicht</strong>: wie sie aufgebaut ist, was du dort in
        welcher Reihenfolge tust, und was dort bewusst nicht geht. Von jeder Seite des Moduls führt
        der Verweis <em>Anleitung</em> oben direkt in das passende Kapitel.
      </p>

      {/*
       * DIE ROLLEN UND DER DURCHGEHENDE FALL STEHEN VOR DEM INHALTSVERZEICHNIS, und das ist die
       * Reihenfolge der Fragen: „wer bin ich hier und wer sind die anderen" kommt vor „welche
       * Seiten gibt es". Wer den Ablauf einmal als Ganzes gesehen hat, versteht danach jede
       * einzelne Flaeche schneller — und wer nur eine bestimmte Sicht sucht, scrollt daran vorbei.
       */}
      <section style={{ marginBlockEnd: SPACE.xxl }}>
        <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
          Drei Rollen, ein Ablauf
        </h2>
        <div className={s.hilfeGitter} style={{ marginBlockEnd: SPACE.xl }}>
          {ROLLEN.map((rolle) => (
            <article key={rolle.name} className={s.hilfeKarte}>
              <h3 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>{rolle.name}</h3>
              <p style={{ ...SCHRIFT.text, margin: `${SPACE.sm}px 0 0` }}>{rolle.satz}</p>
              <p style={{ ...SCHRIFT.neben, margin: `${SPACE.sm}px 0 0`, color: "var(--auf-stahl)" }}>
                {rolle.imModul}
              </p>
            </article>
          ))}
        </div>

        <div className={s.hilfeBilder}>
          <Mechanikbild name="rollen" />
          <div>
            <h3 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>
              Ein Auftrag, vier Schritte
            </h3>
            <p style={{ ...SCHRIFT.text, margin: `0 0 ${SPACE.md}px` }}>
              Derselbe Fall taucht in den Kapiteln wieder auf — der Beamer im Schulungsraum:
            </p>
            <ol className={s.hilfeSchritte}>
              {FADEN.map((schritt) => (
                <li key={schritt.rolle}>
                  <strong>{schritt.rolle}</strong>
                  <span>{schritt.tut}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section style={{ marginBlockEnd: SPACE.xxl }}>
        <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
          Deine Kapitel
        </h2>
        <div className={s.hilfeGitter}>
          {sichten.map((sicht) => (
            <Kapitelkarte key={sicht.schluessel} sicht={sicht} akteur={akteur} />
          ))}
        </div>
      </section>

      <section>
        <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.md}px` }}>
          Die Wörter, die überall stehen
        </h2>
        <p style={{ ...SCHRIFT.text, maxWidth: 640, marginBlockEnd: SPACE.lg }}>
          „Verteilt“, „in Arbeit“, „Freigabe offen“ — jede Aufgabe durchläuft dieselben Zustände,
          und sie stehen als Marke in jeder Liste, jeder Tagesspalte und auf jeder Karte. Einmal im
          Zusammenhang gesehen, liest man sie danach überall.
        </p>
        <Mechanikbild name="lebenszyklus" />
      </section>
    </>
  );
}

function Kapitelkarte({ sicht, akteur }: { sicht: HilfeSicht; akteur: Akteur }) {
  const ziel = zielHref(sicht, akteur);
  return (
    <article className={s.hilfeKarte}>
      <h3 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>
        <Link href={`/hilfe/${sicht.schluessel}`}>{sicht.titel}</Link>
      </h3>
      <p className={s.hilfeMarke}>Für {sicht.fuer}</p>
      <p style={{ ...SCHRIFT.text, margin: `${SPACE.sm}px 0 0` }}>{sicht.wofuer}</p>
      {ziel ? (
        <p style={{ margin: `${SPACE.md}px 0 0` }}>
          <Link href={ziel} className={s.leiseLink}>
            Sicht öffnen
          </Link>
        </p>
      ) : null}
    </article>
  );
}

export default async function HilfePage() {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  return hilfeInhalt(akteur, isoTag(new Date()));
}
