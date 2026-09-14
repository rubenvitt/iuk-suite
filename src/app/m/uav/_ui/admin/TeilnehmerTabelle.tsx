"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Progress, Tag } from "antd";
import {
  Datentabelle,
  nachDatum,
  nachJaNein,
  nachText,
  nachZahl,
  zustandsFilter,
} from "@/core/tabelle";
import { datumKurz, datumZeit } from "../../_lib/datum";
import type { ParticipantProgressDTO } from "../../_lib/typen";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * Eine Übersichtszeile plus den fertigen Magic-Link-String (Fix-Runde 1,
 * Parität mit `uav-praxis/src/admin/ParticipantsPage.tsx:133-146`, das
 * Login-Code UND Link-Kopieren je Zeile zeigt). Der Link wird IMMER
 * serverseitig gebaut (`_lib/magicLink.ts`, Aufgabe 16) — `(admin)/admin/
 * page.tsx` reicht ihn fertig herein, diese Client-Komponente ruft `magicLink()`
 * selbst nie auf.
 */
export interface TeilnehmerZeile extends ParticipantProgressDTO {
  magicLink: string;
}

/*
 * DIE TEILNEHMER-ÜBERSICHT ALS TABELLE (Aufgabe 15). Eigene `"use client"`-
 * Komponente mit nur serialisierbaren Daten als Prop (Falle 9 — `<Table
 * columns={[{render}]}>` geht nicht direkt aus einer Server Component),
 * Vorbild `aufgaben/_ui/PersonenTabelle.tsx`.
 *
 * `Progress` OHNE `status="exception"` und `Tag` OHNE `color="red"` — CLAUDE.md
 * Falle 3: Suite-Rot ist fachlich reserviert, „inaktiv" ist hier keine
 * Fehlermeldung.
 *
 * DER NAME IST EIN `next/link` MIT GEERBTER FARBE, UND BEIDES AUS EINEM EIGENEN
 * GRUND. Vorher stand dort ein nacktes `<a href>`:
 *
 * 1. Ein `<a>` warf die ganze Anwendung weg und lud sie neu, obwohl das Ziel im
 *    selben Modul liegt — dieselbe Begründung, aus der `core/shell/SuiteNav.tsx`
 *    und `core/shell/Seitenkopf.tsx` `next/link` benutzen.
 * 2. Ein unbehandelter Anker trägt antds `colorLink`, und das ist in dieser Suite
 *    Suite-Rot: `colorError === colorPrimary === #c8000f` (Falle 3). Zwei
 *    Teilnehmernamen leuchteten rot in einer Tabelle, in der nichts fehlerhaft war
 *    — Rot gehört auf Chrome, nie auf eine Datenfläche. `color: "inherit"` plus
 *    Unterstreichung: die Bedeutung „das ist ein Weg" trägt damit die Form, nicht
 *    die Farbe (`docs/design/README.md`, „Bedeutung nie allein über Farbe").
 *
 * `minHeight: 44` AM ZEILENLINK (WCAG 2.5.5, `ARBEITSDICHTE`): der Link ist rohes
 * Markup außerhalb jeder antd-Steuerung und erbt die 44px nicht — dieselbe Lage und
 * dieselbe Antwort wie am Rückweg in `core/shell/Seitenkopf.tsx`.
 *
 * DIE SPALTENKÖPFE TRAGEN IHRE ROLLE IN `columns[].title` UND NICHT IN CSS
 * (`docs/design/README.md`, „Spaltenköpfe einer antd-`Table`"): antd bietet für den
 * Kopf allein keine Typo-Token an — `cellFontSize` & Co. treffen Kopf UND Rumpf —,
 * und eine Regel gegen `.ant-table-thead th` koppelte an einen antd-internen
 * Klassennamen, den ein Major still bricht. Ohne diesen Griff unterscheidet sich der
 * Kopf vom Zelleninhalt allein durch das Schriftgewicht. DEN `<span style={SCHRIFT.kicker}>`
 * SETZT SEIT DER UMSTELLUNG AUF `@/core/tabelle` DIE `Datentabelle` SELBST — `title` ist
 * hier deshalb eine nackte Zeichenkette, und `pagination={false}`/`scroll={{ x:
 * "max-content" }}` sind dort die Vorgabe und stehen nicht mehr in dieser Datei.
 *
 * ⚠️ SORTIERT WIRD ÜBER DEN ROHWERT, NIE ÜBER DEN ANZEIGETEXT. „14.09.2026" sortierte als
 * Zeichenkette den 2. Oktober vor den 14. September, und „3/12" ist kein Bruch, sondern
 * Text. Verglichen werden deshalb `beginn`/`lastSeen` (beide ISO in `ParticipantDTO`) und
 * `quote` — alle drei liegen bereits als Rohwert in der Zeile, ein zusätzliches Feld war
 * nicht nötig. Die Spalten „Magic-Link" und „Aktionen" tragen keinen `sorter`: in ihnen
 * steht ein Knopf, kein Wert.
 */
export function TeilnehmerTabelle({ zeilen }: { zeilen: TeilnehmerZeile[] }) {
  const [kopiert, setKopiert] = useState<string | null>(null);

  function kopieren(text: string, markierung: string): void {
    navigator.clipboard?.writeText(text).then(
      () => {
        setKopiert(markierung);
        window.setTimeout(() => setKopiert((m) => (m === markierung ? null : m)), 1800);
      },
      () => {
        /* Zwischenablage ohne Berechtigung — Text bleibt in der Zeile sichtbar. */
      },
    );
  }

  return (
    <Datentabelle<TeilnehmerZeile>
      rowKey={(zeile) => zeile.participant.id}
      dataSource={zeilen}
      locale={{ emptyText: "Noch keine Teilnehmer angelegt." }}
      columns={[
        {
          title: "Name",
          key: "name",
          sorter: nachText<TeilnehmerZeile>((zeile) => zeile.participant.name),
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Link
              href={`/admin/teilnehmer/${zeile.participant.id}`}
              style={{
                color: "inherit",
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
              }}
            >
              {zeile.participant.name}
            </Link>
          ),
        },
        {
          title: "Code",
          key: "code",
          sorter: nachText<TeilnehmerZeile>((zeile) => zeile.participant.loginCode),
          render: (_: unknown, zeile: TeilnehmerZeile) => <span style={SCHRIFT.mono}>{zeile.participant.loginCode}</span>,
        },
        {
          title: "Magic-Link",
          key: "magicLink",
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Button onClick={() => kopieren(zeile.magicLink, `link-${zeile.participant.id}`)}>
              {kopiert === `link-${zeile.participant.id}` ? "Kopiert" : "Link kopieren"}
            </Button>
          ),
        },
        {
          title: "Beginn",
          key: "beginn",
          // Ohne eingetragenen Beginn steht „—"; `null` landet aufsteigend hinten.
          sorter: nachDatum<TeilnehmerZeile>((zeile) => zeile.participant.beginn),
          render: (_: unknown, zeile: TeilnehmerZeile) => datumKurz(zeile.participant.beginn) || "—",
        },
        {
          title: "Fortschritt",
          key: "fortschritt",
          // Der ANTEIL, nicht die erledigten Aufgaben: 3 von 4 ist weiter als 5 von 20.
          sorter: nachZahl<TeilnehmerZeile>((zeile) => zeile.quote),
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, minWidth: 160 }}>
              <Progress percent={Math.round(zeile.quote * 100)} style={{ flex: 1 }} />
              <span>{zeile.erledigt}/{zeile.gesamt}</span>
            </div>
          ),
        },
        {
          title: "Letzte Aktivität",
          key: "letzteAktivitaet",
          // Wer nie da war, traegt `null` und steht aufsteigend hinten — absteigend
          // also vorn, und genau danach sucht man hier: wer meldet sich nicht mehr.
          sorter: nachDatum<TeilnehmerZeile>((zeile) => zeile.participant.lastSeen),
          render: (_: unknown, zeile: TeilnehmerZeile) => datumZeit(zeile.participant.lastSeen) || "—",
        },
        {
          title: "Status",
          key: "status",
          /*
           * „Nur die Aktiven" ist ein Prädikat über der Zeile und gehört deshalb in den
           * Spaltenkopf, nicht in eine Knopfleiste darüber. `zustandsFilter` und nicht
           * `werteAlsFilter`: `aktiv` ist ein Wahrheitswert, die zwei Wörter daneben sind
           * Anzeige. Sortiert wird über `aktiv`, nicht über das Wort — „aktiv" steht
           * alphabetisch zufällig richtig vor „inaktiv", und das bliebe bei einer
           * Umbenennung still falsch.
           */
          sorter: nachJaNein<TeilnehmerZeile>((zeile) => zeile.participant.aktiv),
          ...zustandsFilter<TeilnehmerZeile>([
            { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.participant.aktiv },
            { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.participant.aktiv },
          ]),
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Tag color={zeile.participant.aktiv ? "green" : "default"}>
              {zeile.participant.aktiv ? "aktiv" : "inaktiv"}
            </Tag>
          ),
        },
        {
          title: "Aktionen",
          key: "aktionen",
          /*
           * Der Farbeinwand von oben trifft diesen Weg NICHT: ein `Button` traegt
           * antds Knopffarben, nicht `colorLink`. Er steht neben dem Namenslink und
           * ist keine Doppelung ohne Zweck — auf dem Telefon ist die Zeile
           * waagerecht gescrollt, und wer am rechten Ende der Zeile steht, kaeme
           * sonst nur ueber ein Zurueckscrollen zum Ziel.
           */
          render: (_: unknown, zeile: TeilnehmerZeile) => (
            <Button href={`/admin/teilnehmer/${zeile.participant.id}`}>Details</Button>
          ),
        },
      ]}
    />
  );
}
