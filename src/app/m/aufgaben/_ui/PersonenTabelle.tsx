"use client";

import { useRef } from "react";
import { Button, Popconfirm, Table } from "antd";
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
    <Table<PersonenZeile>
      rowKey={(zeile) => zeile.person.id}
      dataSource={zeilen}
      pagination={false}
      // OHNE `scroll`, BRICHT DIE TABELLE AUF 390PX (Spec §9.5).
      scroll={{ x: "max-content" }}
      columns={[
        {
          title: "Name",
          key: "name",
          render: (_: unknown, zeile: PersonenZeile) => zeile.person.name,
        },
        {
          title: "Rolle",
          key: "rolle",
          render: (_: unknown, zeile: PersonenZeile) => ROLLE_TEXT[zeile.person.rolle],
        },
        {
          title: "Soll-Zeit",
          key: "soll",
          render: (_: unknown, zeile: PersonenZeile) =>
            `${fmtStunden(zeile.person.sollMinutenTag)} Std./Tag`,
        },
        {
          title: "Aktiv von",
          key: "aktivVon",
          render: (_: unknown, zeile: PersonenZeile) => fmtTagKurz(zeile.person.aktivVon),
        },
        {
          title: "Aktiv bis",
          key: "aktivBis",
          render: (_: unknown, zeile: PersonenZeile) =>
            zeile.person.aktivBis === null ? "unbefristet" : fmtTagKurz(zeile.person.aktivBis),
        },
        {
          title: "Status",
          key: "status",
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
      <Button
        size="small"
        href={`/personen?bearbeiten=${encodeURIComponent(zeile.person.id)}`}
      >
        Ändern
      </Button>
      {zeile.istAktivHeute ? (
        <form action={personBeendenAction} ref={formular}>
          <input type="hidden" name="personId" value={zeile.person.id} />
          <Popconfirm
            title="Person beenden?"
            description={`„${zeile.person.name}" verschwindet danach aus Verteillisten und ` +
              `Plan-Navigation. Aufgaben, Nachweise und Verlaufszeilen bleiben lesbar.`}
            okText="Beenden"
            cancelText="Abbrechen"
            onConfirm={() => formular.current?.requestSubmit()}
          >
            <Button size="small" danger>
              Beenden
            </Button>
          </Popconfirm>
        </form>
      ) : null}
    </div>
  );
}
