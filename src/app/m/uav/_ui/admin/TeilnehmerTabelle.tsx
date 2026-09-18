"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Progress, Select, Tag, type TableProps } from "antd";
import {
  angezeigteZeilen,
  Datentabelle,
  filterAktiv,
  nachDatum,
  nachJaNein,
  nachText,
  nachZahl,
  NurSchmal,
  Schmalkarten,
  zustandsFilter,
  type FilterZustand,
  type SortZustand,
} from "@/core/tabelle";
import { datumKurz, datumZeit } from "../../_lib/datum";
import type { ParticipantProgressDTO } from "../../_lib/typen";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import k from "./teilnehmerkarte.module.css";

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
/**
 * DER ZEILENLINK — EINE FORM, ZWEI DARSTELLUNGEN (DRK-421).
 *
 * ⚠️ ALS INLINE-STIL UND NICHT ALS KLASSE, und das ist hier ausnahmsweise die
 * bessere Wahl. Die beiden Zusagen daran sind geprueft: `color: inherit` gegen
 * Suite-Rot auf einer Datenflaeche (Falle 3) und `minHeight: 44` gegen die
 * Untergrenze der Arbeitsdichte (WCAG 2.5.5) — beides haelt
 * `(admin)/admin/page.test.tsx` fest. **In einem CSS-Modul koennte dieser Test
 * sie nicht sehen:** jsdom wendet Stylesheets nicht an, `style.color` stuende
 * leer, und die Zusicherung waere lautlos blind. Genau das ist beim ersten
 * Anlauf passiert, als die Karte ihre eigene Klasse trug.
 *
 * ⚠️ UND DESHALB EINE KONSTANTE STATT ZWEIER ABSCHRIFTEN. Die Karte und die
 * Tabellenzelle zeigen denselben Link; zwei Stellen mit denselben zwei Zahlen
 * liefen beim ersten Umbau auseinander, und geprueft waere nur die eine.
 */
const ZEILENLINK: React.CSSProperties = {
  color: "inherit",
  textDecoration: "underline",
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
};

/**
 * DIE BEIDEN ZUSTAENDE DER STATUSSPALTE — EINMAL, fuer den Spaltenkopf UND fuer
 * die Leiste ueber den Karten. Zwei Listen mit denselben zwei Woertern liefen
 * beim ersten Umbenennen auseinander, und dann boete die schmale Darstellung
 * einen Filter an, den die Tabelle nicht kennt.
 */
const STATUS_ZUSTAENDE = [
  { wert: "aktiv", text: "aktiv", trifft: (zeile: TeilnehmerZeile) => zeile.participant.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile: TeilnehmerZeile) => !zeile.participant.aktiv },
];

export function TeilnehmerTabelle({ zeilen }: { zeilen: TeilnehmerZeile[] }) {
  const [kopiert, setKopiert] = useState<string | null>(null);
  /**
   * ⚠️ GEMERKT WIRD DER ZUSTAND DER SPALTENKOEPFE, NIE DIE LISTE DARAUS
   * (Falle 15). `onChange` feuert nur bei Bedienung DER TABELLE; laedt die Seite
   * daneben einen neuen Serverstand, filtert antd zwar korrekt neu, meldet es
   * aber nicht — ein gemerkter Stand waere dann still veraltet. Die Kartenliste
   * folgt deshalb aus diesem Zustand, statt gemerkt zu werden.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  const [sortierung, setSortierung] = useState<SortZustand>({});

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

  /**
   * DIE SCHMALE DARSTELLUNG (DRK-421) — und sie ist hier kein Zusatz, sondern
   * die Einlösung eines Versprechens, das ein paar Zeilen weiter unten als
   * Entschuldigung stand.
   *
   * ⚠️ DER „Details"-KNOPF WAR EIN WORKAROUND FUER GENAU DIESES PROBLEM. Seine
   * Begruendung lautete woertlich: „auf dem Telefon ist die Zeile waagerecht
   * gescrollt, und wer am rechten Ende der Zeile steht, kaeme sonst nur ueber
   * ein Zurueckscrollen zum Ziel." Acht Spalten mit drei Bedienelementen —
   * Namenslink, „Link kopieren", „Details" — sind genau der Fall, den
   * `docs/design/README.md` NICHT mehr waagerecht scrollen lassen will: die
   * Leseregel („eine umgebrochene Zeile ist unlesbarer als eine gescrollte")
   * gilt fuer eine Tabelle, die man LIEST, und der eigentliche Arbeitsvorgang
   * dieser Seite ist das Weitergeben des Zugangs.
   *
   * ⚠️ DER KNOPF BLEIBT TROTZDEM. Auf dem Telefon braucht ihn niemand mehr,
   * aber die Tabelle beginnt schon bei 768px und scrollt auf einem Tablet im
   * Hochformat weiterhin waagerecht. Ihn hier zu entfernen hiesse, den
   * Zwischenbereich gegen eine Annahme einzutauschen — und der ist laut
   * `docs/design/README.md` der Ort, an dem die Fehler sitzen, die an beiden
   * Enden unsichtbar sind.
   */
  function karte(zeile: TeilnehmerZeile): ReactNode {
    const markierung = `link-${zeile.participant.id}`;
    return (
      <article className={k.karte}>
        <div className={k.kopf}>
          <Link
            href={`/admin/teilnehmer/${zeile.participant.id}`}
            className={k.name}
            style={ZEILENLINK}
          >
            {zeile.participant.name}
          </Link>
          <Tag color={zeile.participant.aktiv ? "green" : "default"}>
            {zeile.participant.aktiv ? "aktiv" : "inaktiv"}
          </Tag>
        </div>
        <p className={k.zeile}>
          <span style={SCHRIFT.mono}>{zeile.participant.loginCode}</span>
          <span>{`Beginn ${datumKurz(zeile.participant.beginn) || "—"}`}</span>
        </p>
        <div className={k.fortschritt}>
          <Progress percent={Math.round(zeile.quote * 100)} />
          <span>{zeile.erledigt}/{zeile.gesamt}</span>
        </div>
        {/* „zuletzt" statt „Letzte Aktivität": in der Tabelle erklaert der
            Spaltenkopf die Zahl, hier muss das Wort daneben es tun. */}
        <p className={k.zeile}>{`zuletzt ${datumZeit(zeile.participant.lastSeen) || "—"}`}</p>
        <Button onClick={() => kopieren(zeile.magicLink, markierung)}>
          {kopiert === markierung ? "Kopiert" : "Link kopieren"}
        </Button>
      </article>
    );
  }

  /**
   * ⚠️ DIE SPALTEN STEHEN IN EINEM `useMemo`, WEIL SIE SEIT DRK-421 ZWEI
   * LESER HABEN: die Tabelle UND `angezeigteZeilen`, das die Kartenliste
   * daraus ableitet. Ein zweites Praedikat fuer dieselbe Frage liefe beim
   * ersten Umbau auseinander — dann zeigte die schmale Darstellung eine
   * andere Menge als die breite, und geprueft waere nur die eine.
   */
  const spalten = useMemo<TableProps<TeilnehmerZeile>["columns"]>(() => [
      {
        title: "Name",
        key: "name",
        sorter: nachText<TeilnehmerZeile>((zeile) => zeile.participant.name),
        render: (_: unknown, zeile: TeilnehmerZeile) => (
          <Link href={`/admin/teilnehmer/${zeile.participant.id}`} style={ZEILENLINK}>
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
        ...zustandsFilter<TeilnehmerZeile>(STATUS_ZUSTAENDE),
        /*
         * ⚠️ GESTEUERT SEIT DRK-421 — sonst gaebe es diesen Filter auf dem
         * Telefon gar nicht. Ungesteuert fuehrt antd den Stand allein; die
         * Leiste ueber den Karten koennte ihn nicht setzen, und die beiden
         * Darstellungen zeigten verschiedene Mengen.
         */
        filteredValue: spaltenFilter.status ?? null,
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
  ], [spaltenFilter, kopiert]);

  /**
   * WAS DIE KARTEN ZEIGEN — ABGELEITET AUS DEMSELBEN ZUSTAND WIE DIE
   * TABELLE (Codex-Befund P2 zu PR #208).
   *
   * ⚠️ OHNE DAS WAERE DER STATUSFILTER AUF DEM TELEFON VERSCHWUNDEN. Er
   * sitzt im Spaltenkopf, und unter 768px ist die Tabelle samt Kopf
   * ausgeblendet — wer vorher „nur die Aktiven" sehen wollte, kam ueber die
   * waagerecht gescrollte Zeile noch an den Trichter; nach der Umstellung
   * gar nicht mehr. Dieselbe Luecke wie bei der Inventur, und dieselbe
   * Antwort: ein eigenes Bedienelement dort, wo es keine Spaltenkoepfe gibt,
   * das in DENSELBEN Zustand schreibt.
   *
   * ⚠️ `angezeigteZeilen` UND KEINE EIGENE RECHNUNG: es liest die `onFilter`
   * und `sorter` DER SPALTEN. Damit zeigen beide Darstellungen garantiert
   * dieselbe Menge in derselben Ordnung — auch dann noch, wenn jemand spaeter
   * eine Spalte filterbar macht und die Karten vergisst.
   */
  const sichtbar = useMemo(
    () => angezeigteZeilen(zeilen, spalten ?? [], spaltenFilter, sortierung),
    [zeilen, spalten, spaltenFilter, sortierung],
  );

  // „nichts angelegt" und „nichts passt" sind zwei verschiedene Saetze, und
  // der falsche laedt zum Anlegen von jemandem ein, den es laengst gibt.
  const leertext = filterAktiv(spaltenFilter)
    ? "Kein Teilnehmer passt zum Filter."
    : "Noch keine Teilnehmer angelegt.";

  return (
    <>
      {/* Nur in der schmalen Darstellung — dort gibt es keine Spaltenkoepfe. */}
      <NurSchmal data-rolle="teilnehmer-schmalfilter">
        <Select<string[]>
          mode="multiple"
          aria-label="Status filtern"
          placeholder="Status"
          style={{ minWidth: 200, marginBlockEnd: SPACE.md }}
          value={(spaltenFilter.status ?? []).map(String)}
          // ⚠️ LEER HEISST `null`, NICHT `[]` — ein leeres Feld waere ein
          // gesetzter Filter ohne Werte, und `filterAktiv` spraeche dann von
          // einer Auswahl, die niemand getroffen hat.
          onChange={(werte) => setSpaltenFilter((vorher) => ({
            ...vorher,
            status: werte.length > 0 ? werte : null,
          }))}
          options={STATUS_ZUSTAENDE.map((z) => ({ value: z.wert, label: z.text }))}
          virtual={false}
        />
      </NurSchmal>
      <Schmalkarten<TeilnehmerZeile>
        zeilen={sichtbar}
        schluessel={(zeile) => zeile.participant.id}
        aria-label="Teilnehmer"
        leertext={leertext}
        kartenHoehe={230}
        karte={karte}
      >
        <Datentabelle<TeilnehmerZeile>
          rowKey={(zeile) => zeile.participant.id}
          dataSource={zeilen}
          locale={{ emptyText: leertext }}
          // NUR der Zustand wird gemerkt, nie die Liste (Falle 15).
          onChange={(_blaettern, neueFilter, neueSortierung) => {
            setSpaltenFilter(neueFilter as FilterZustand);
            const eine = Array.isArray(neueSortierung) ? neueSortierung[0] : neueSortierung;
            setSortierung({
              spalte: eine?.columnKey ?? (eine?.field as string | undefined),
              richtung: eine?.order ?? null,
            });
          }}
          columns={spalten}
        />
      </Schmalkarten>
    </>
  );
}
