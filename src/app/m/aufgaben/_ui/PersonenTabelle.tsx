"use client";

import { useRef } from "react";
import { Button, Popconfirm } from "antd";
import {
  Kartentabelle,
  nachDatum,
  nachJaNein,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  zustandsFilter,
} from "@/core/tabelle";
import { personBeendenAction } from "../actions";
import type { PersonRow } from "../_db/schema";
import { ROLLE_TEXT, fmtStunden } from "../_lib/anzeige";
import { fmtTagKurz } from "../_lib/datum";
import s from "./aufgaben.module.css";

/*
 * DIE PERSONENVERWALTUNG ALS TABELLE (Aufgabe 14, Spec §4). Vorbild `_ui/RoutinenTabelle.tsx` —
 * eigene `"use client"`-Komponente, nur serialisierbare Daten als Prop, Server Actions direkt
 * importiert (Falle 3: `<Table columns={[{render: fn}]}>` geht nicht aus einer Server Component).
 *
 * `istAktivHeute` KOMMT FERTIG BERECHNET HEREIN, KEIN `_lib/zugang.ts`-IMPORT HIER: `zugang.ts`
 * importiert `auth()` aus `@/core/auth` (next-auth) — ein Wert- oder Funktionsimport aus diesem
 * Modul in eine Client-Insel wuerde next-auths serverseitigen Code ins Client-Bundle ziehen, selbst
 * wenn nur `istAktiv` (eine reine Funktion ohne eigene Abhaengigkeit zu `auth()`) tatsaechlich
 * aufgerufen wird — der Import steht am Modul, nicht an der einzelnen Funktion. Die Server Component
 * (`personen/page.tsx`) berechnet `istAktiv(person, heute)` deshalb VORHER und reicht nur das
 * Ergebnis als Wert durch.
 *
 * ES GIBT KEINE LOESCHEN-AKTION, UND DAS IST ABSICHT (Brief, Spec §4) — s. `actions.ts`s
 * Kopfkommentar zu Aufgabe 14. Wer hier eine vermisst: nicht ergaenzen, das ist die Fachlichkeit.
 *
 * `pagination={false}` UND `scroll={{ x: "max-content" }}` STEHEN SEIT DER UMSTELLUNG AUF
 * `@/core/tabelle` NICHT MEHR HIER — beides ist die Vorgabe der `Datentabelle`, ebenso der
 * Spaltenkopf-Kicker.
 *
 * ⚠️ SORTIERT WIRD UEBER DEN ROHWERT, NIE UEBER DEN ANZEIGETEXT. Die Soll-Zeit steht als
 * „7,8 Std./Tag" auf dem Schirm — mit Dezimalkomma, als Zeichenkette also falsch geordnet;
 * verglichen wird `sollMinutenTag`. Die beiden Datumsspalten zeigen `fmtTagKurz` („14.09."),
 * verglichen wird `aktivVon`/`aktivBis` als ISO-Tag. Beide Rohwerte liegen bereits in `PersonRow`;
 * ein zusaetzliches Feld war nicht noetig.
 *
 * „BEENDEN" IST BESTAETIGUNGSPFLICHTIG (Spec §9.9 nennt „Person deaktivieren" ausdruecklich) —
 * Vorbild `files/_ui/ShareDetailAktionen.tsx`: `Popconfirm` plus ein `ref` aufs Formular, `onConfirm`
 * loest `requestSubmit()` aus, statt das Formular selbst zum Bestaetigungsdialog zu machen.
 */

export interface PersonenZeile {
  person: PersonRow;
  /** `istAktiv(person, heute)`, server-seitig berechnet — s. Kopfkommentar. */
  istAktivHeute: boolean;
}

export function PersonenTabelle({ zeilen }: { zeilen: PersonenZeile[] }) {
  return (
    <Kartentabelle<PersonenZeile>
      rowKey={(zeile) => zeile.person.id}
      aria-label="Personen"
      dataSource={zeilen}
      leer={{ nichts: "Noch keine Personen angelegt.", gefiltert: "Keine Person passt zum Filter." }}
      columns={[
        {
          title: "Name",
          key: "name",
          sorter: nachText<PersonenZeile>((zeile) => zeile.person.name),
          render: (_: unknown, zeile: PersonenZeile) => zeile.person.name,
        },
        {
          title: "Rolle",
          key: "rolle",
          /*
           * Die Rolle ist der Musterfall fuer `werteAlsFilter`: wenige wiederkehrende Werte, und
           * die Liste entsteht aus den GELADENEN Zeilen — im Filter steht damit nie eine Rolle,
           * die keine Zeile traegt. Gefiltert und sortiert wird ueber DENSELBEN Anzeigetext
           * (`ROLLE_TEXT`), den auch die Zelle zeigt: der Schluessel `auftrag`/`bufdi` stuende
           * sonst im Filter, waehrend daneben „Auftraggeber"/„BuFDi" in der Tabelle steht.
           */
          sorter: nachText<PersonenZeile>((zeile) => ROLLE_TEXT[zeile.person.rolle]),
          filters: werteAlsFilter(zeilen, (zeile) => ROLLE_TEXT[zeile.person.rolle]),
          onFilter: trifftWert<PersonenZeile>((zeile) => ROLLE_TEXT[zeile.person.rolle]),
          render: (_: unknown, zeile: PersonenZeile) => ROLLE_TEXT[zeile.person.rolle],
        },
        {
          title: "Soll-Zeit",
          key: "soll",
          sorter: nachZahl<PersonenZeile>((zeile) => zeile.person.sollMinutenTag),
          render: (_: unknown, zeile: PersonenZeile) =>
            `${fmtStunden(zeile.person.sollMinutenTag)} Std./Tag`,
        },
        {
          title: "Aktiv von",
          key: "aktivVon",
          sorter: nachDatum<PersonenZeile>((zeile) => zeile.person.aktivVon),
          render: (_: unknown, zeile: PersonenZeile) => fmtTagKurz(zeile.person.aktivVon),
        },
        {
          title: "Aktiv bis",
          key: "aktivBis",
          // `null` heisst „unbefristet" und steht aufsteigend hinten — dort, wo
          // auch das spaeteste Datum steht. Genau die richtige Nachbarschaft.
          sorter: nachDatum<PersonenZeile>((zeile) => zeile.person.aktivBis),
          render: (_: unknown, zeile: PersonenZeile) =>
            zeile.person.aktivBis === null ? "unbefristet" : fmtTagKurz(zeile.person.aktivBis),
        },
        {
          title: "Status",
          key: "status",
          /*
           * „Nur die Aktiven" ist ein Praedikat ueber der Zeile, also ein Spaltenfilter statt einer
           * Knopfleiste darueber. `zustandsFilter` und nicht `werteAlsFilter`: `istAktivHeute` ist
           * ein Wahrheitswert, den die Seite berechnet — die zwei Woerter stehen in keinem Feld.
           * `nachJaNein` stellt `true` nach vorn: wer noch da ist, steht oben.
           */
          sorter: nachJaNein<PersonenZeile>((zeile) => zeile.istAktivHeute),
          ...zustandsFilter<PersonenZeile>([
            { wert: "aktiv", text: "Aktiv", trifft: (zeile) => zeile.istAktivHeute },
            { wert: "ausgeschieden", text: "Ausgeschieden", trifft: (zeile) => !zeile.istAktivHeute },
          ]),
          render: (_: unknown, zeile: PersonenZeile) => (
            <span
              className={`${s.chip} ${zeile.istAktivHeute ? s.tonOk : s.tonGrau}`}
            >
              {zeile.istAktivHeute ? "Aktiv" : "Ausgeschieden"}
            </span>
          ),
        },
        {
          title: "Aktionen",
          key: "aktionen",
          render: (_: unknown, zeile: PersonenZeile) => <ZeilenAktionen zeile={zeile} />,
        },
      ]}
    />
  );
}

function ZeilenAktionen({ zeile }: { zeile: PersonenZeile }) {
  const formular = useRef<HTMLFormElement>(null);

  return (
    <div className={s.knopfzeile}>
      <Button href={`/personen?bearbeiten=${encodeURIComponent(zeile.person.id)}`}>
        Ändern
      </Button>
      {zeile.istAktivHeute ? (
        <form action={personBeendenAction} ref={formular}>
          <input type="hidden" name="personId" value={zeile.person.id} />
          <Popconfirm
            title="Person beenden?"
            description={`„${zeile.person.name}“ verschwindet danach aus Verteillisten und ` +
              `Plan-Navigation. Aufgaben, Nachweise und Verlaufszeilen bleiben lesbar.`}
            okText="Beenden"
            cancelText="Abbrechen"
            onConfirm={() => formular.current?.requestSubmit()}
          >
            <Button danger>
              Beenden
            </Button>
          </Popconfirm>
        </form>
      ) : null}
    </div>
  );
}
