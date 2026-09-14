"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Flex, Input, InputNumber, Select, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { inventurKorrektur, type InventurNutzlast } from "../../../_actions/inventur";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import {
  LEERER_INVENTUR_FILTER,
  fachOptionen,
  filterIstLeer,
  inventurTrifft,
  type InventurFilter,
} from "../../../_lib/inventurFilter";
import { INVENTUR_ABWEISUNGEN, INVENTUR_TEXTE } from "../../../_lib/inventurTexte";
import { kategorieOptionen } from "../../../_lib/kategorie";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";
import { ChargenZaehlung } from "./ChargenZaehlung";
import {
  abweichungenIn,
  artikelSetzen,
  ausgeblendetGezaehlt,
  positionenAus,
  summeFuer,
  type ZaehlStand,
} from "./inventurZustand";

export function InventurForm({ zeilen }: { zeilen: InventurZeile[] }) {
  const [stand, setStand] = useState<ZaehlStand>({});
  const [filter, setFilter] = useState<InventurFilter>(LEERER_INVENTUR_FILTER);
  const [kommentar, setKommentar] = useState("");
  const [meldung, setMeldung] = useState<ReactNode>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  const absendenLaeuft = useRef(false);

  const kategorien = useMemo(() => kategorieOptionen(zeilen.map((z) => z.kategorie)), [zeilen]);
  const faecher = useMemo(() => fachOptionen(zeilen), [zeilen]);

  const positionen = positionenAus(stand);
  const abweichungen = abweichungenIn(zeilen, stand);
  const ausgeblendet = ausgeblendetGezaehlt(zeilen, stand, filter);
  const sichtbar = zeilen.filter((zeile) => inventurTrifft(zeile, filter));

  function wertSetzen(id: string, wert: number | null): void {
    setStand((aktuell) => artikelSetzen(aktuell, id, wert ?? 0));
    setFehler(null);
    setMeldung(null);
  }

  function kommentarSetzen(wert: string): void {
    setKommentar(wert);
    setFehler(null);
    setMeldung(null);
  }

  function abschliessen(): void {
    if (absendenLaeuft.current || !kommentar.trim() || positionen.length === 0) return;
    absendenLaeuft.current = true;
    // Der Umfang ist BESCHREIBEND und bleibt im append-only Verlauf stehen: er
    // traegt die LABELS, nie die gefalteten Schluessel des Filters.
    const labelJeSchluessel = new Map(kategorien.map((o) => [o.schluessel, o.label]));
    const nutzlast: InventurNutzlast = {
      kommentar: kommentar.trim(),
      umfang: filterIstLeer(filter)
        ? null
        : {
            kategorien: filter.kategorien.map((k) => labelJeSchluessel.get(k) ?? k),
            faecher: [...filter.faecher],
          },
      positionen,
    };
    startTransition(async () => {
      try {
        const ergebnis = await inventurKorrektur(nutzlast);
        if (!ergebnis.ok) {
          setFehler(INVENTUR_ABWEISUNGEN.has(ergebnis.fehler)
            ? ergebnis.fehler
            : INVENTUR_TEXTE.buchungsFehler);
          return;
        }
        const { korrigiert, inventurId } = ergebnis.wert;
        setFehler(null);
        setMeldung(
          <>
            {`Inventur gebucht — ${korrigiert} ${korrigiert === 1 ? "Position" : "Positionen"} korrigiert. `}
            <Link href={`/verwaltung/inventur/verlauf/${inventurId}`}>Im Verlauf ansehen</Link>
          </>,
        );
        // Der Filter bleibt stehen: wer fachweise zaehlt, zaehlt das naechste Fach.
        setStand({});
        setKommentar("");
      } catch {
        setFehler(INVENTUR_TEXTE.buchungsFehler);
      } finally {
        absendenLaeuft.current = false;
      }
    });
  }

  return (
    <>
      <Flex gap={SPACE.sm} wrap style={{ marginBlockEnd: SPACE.md }}>
        <Select<string[]>
          mode="multiple"
          allowClear
          aria-label="Nach Kategorie filtern"
          placeholder="Alle Kategorien"
          style={{ minWidth: 220 }}
          value={[...filter.kategorien]}
          onChange={(werte) => setFilter((f) => ({ ...f, kategorien: werte }))}
          options={kategorien.map((o) => ({ value: o.schluessel, label: o.label }))}
        />
        <Select<string[]>
          mode="multiple"
          allowClear
          aria-label="Nach Fach filtern"
          placeholder="Alle Fächer"
          style={{ minWidth: 220 }}
          value={[...filter.faecher]}
          onChange={(werte) => setFilter((f) => ({ ...f, faecher: werte }))}
          options={faecher.map((f) => ({ value: f, label: f }))}
        />
      </Flex>
      <Table<InventurZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Inventur"
        dataSource={sichtbar}
        // Spec §B: JEDE Zeile ist aufklappbar — auch ohne Charge, dort bleibt die
        // Ergaenzen-Zeile. Deshalb kein `rowExpandable`.
        expandable={{
          expandedRowRender: (zeile) => (
            <ChargenZaehlung
              zeile={zeile}
              zaehlung={stand[zeile.id]}
              gesperrt={laeuft}
              onAendern={(umbau) => { setStand(umbau); setFehler(null); setMeldung(null); }}
            />
          ),
          // antds Standard-Aufklappknopf misst ~17px und unterschreitet die
          // Arbeitsdichte (Falle 4). Ein `Button` OHNE `size` traegt die 44px.
          expandIcon: ({ expanded, onExpand, record }) => (
            <Button
              aria-label={expanded ? `Chargen ${record.name} ausblenden` : `Chargen ${record.name} anzeigen`}
              aria-expanded={expanded}
              onClick={(e) => onExpand(record, e)}
              icon={<Ikone name={expanded ? "zuklappen" : "aufklappen"} groesse={14} />}
            />
          ),
        }}
        // Punkt 5 der Pruefliste: der Leertext nennt den naechsten Schritt.
        locale={{
          emptyText: zeilen.length === 0
            ? "Keine Artikel vorhanden. Lege sie zuerst unter Artikel & Bestand an."
            : "Kein Artikel passt zum Filter.",
        }}
        // Spaltenkoepfe tragen die Kicker-Rolle ueber `title`, nie ueber CSS
        // gegen `.ant-table-thead` (docs/design/README.md).
        columns={[
          {
            title: <span style={SCHRIFT.feldname}>Artikel</span>,
            dataIndex: "name",
            render: (wert: string) => <span style={{ fontWeight: 600 }}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>Fach</span>,
            dataIndex: "fach",
            render: (wert: string) => <span className={s.fach}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>MHD</span>,
            dataIndex: "chargen",
            // `chargen[0]` ist FEFO-naechste Handlager-Charge. `2099-12` („ohne
            // Verfall") zeigt wie die Artikelliste schlicht `fmtVerfall` — dort
            // gibt es keinen Sonderfall, hier auch nicht.
            render: (_wert: unknown, zeile) => {
              const naechste = zeile.chargen[0];
              return naechste
                ? <Chip ton={ampelTon(naechste.ampel)}>{fmtVerfall(naechste.verfall)}</Chip>
                : "—";
            },
          },
          {
            title: <span style={SCHRIFT.feldname}>Min.</span>,
            dataIndex: "mindestbestand",
            align: "right",
            render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>Bestand</span>,
            dataIndex: "bestand",
            align: "right",
            render: (wert: number, zeile) => (
              <span style={SCHRIFT.mono}>{wert} {zeile.einheit}</span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Abweichung</span>,
            dataIndex: "id",
            render: (_wert: string, zeile) => {
              if (!(zeile.id in stand)) return null;
              const differenz = summeFuer(zeile, stand[zeile.id]) - zeile.bestand;
              if (differenz === 0) return null;
              return (
                <Chip ton={differenz < 0 ? "rot" : "gelb"}>
                  {differenz > 0 ? `+${differenz}` : `${differenz}`}
                </Chip>
              );
            },
          },
          {
            title: <span style={SCHRIFT.feldname}>Ist</span>,
            dataIndex: "id",
            align: "right",
            render: (_wert: string, zeile) => {
              // Einmal berechnet, von Minus-Knopf, Feld und Plus-Knopf gelesen --
              // zwei Ableitungen desselben Werts liefen sonst auseinander.
              const aktuell = summeFuer(zeile, stand[zeile.id]);
              // Im Chargenmodus ist das Feld nur die Summe (Spec §B).
              const nurSumme = stand[zeile.id]?.art === "chargen";
              return (
                // KEIN size="small" an den drei Bedienelementen: die alte
                // Zeilenaktions-Ausnahme (Falle 4, docs/design/README.md) ist
                // mit der Arbeitsdichte gefallen -- 44px ist hier bereits die
                // volle wie die halbe Bediendichte, "small" unterbietet die
                // Mindesttapflaeche (WCAG 2.5.5). e2e/lagerbuch-mobil.spec.ts:312
                // misst das heute nur auf /verwaltung/bestellung -- diese Seite
                // ist (noch) nicht im Testpfad, die Regel gilt trotzdem.
                <Flex gap={SPACE.xs} align="center" justify="flex-end">
                  {nurSumme ? <Chip ton="grau">je Charge</Chip> : null}
                  <Button
                    disabled={laeuft || nurSumme || aktuell <= 0}
                    aria-label={`Ist-Bestand ${zeile.name} verringern`}
                    onClick={() => wertSetzen(zeile.id, aktuell - 1)}
                    icon={<Ikone name="minus" groesse={14} />}
                  />
                  <InputNumber<number>
                    min={0}
                    max={9999}
                    disabled={laeuft || nurSumme}
                    aria-label={`Ist-Bestand ${zeile.name}`}
                    value={aktuell}
                    onChange={(wert) => wertSetzen(zeile.id, wert)}
                  />
                  <Button
                    disabled={laeuft || nurSumme || aktuell >= 9999}
                    aria-label={`Ist-Bestand ${zeile.name} erhöhen`}
                    onClick={() => wertSetzen(zeile.id, aktuell + 1)}
                    icon={<Ikone name="plus" groesse={14} />}
                  />
                </Flex>
              );
            },
          },
        ]}
      />
      <Flex vertical gap={SPACE.sm} style={{ marginBlockStart: SPACE.md }}>
        <Input
          aria-label="Kommentar"
          placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026"
          disabled={laeuft}
          value={kommentar}
          onChange={(ereignis) => kommentarSetzen(ereignis.target.value)}
        />
        {ausgeblendet > 0 ? (
          // Der Filter blendet aus, er verwirft nicht (Spec §A): ohne diesen
          // Hinweis buchte der Knopf etwas, das man nicht sieht.
          <Alert
            type="info"
            showIcon={false}
            data-rolle="ausgeblendet-hinweis"
            title={`${ausgeblendet} gezählte ${
              ausgeblendet === 1 ? "Position ist ausgeblendet und wird" : "Positionen sind ausgeblendet und werden"
            } mitgebucht.`}
          />
        ) : null}
        <Button
          type="primary"
          data-rolle="abschluss"
          loading={laeuft}
          disabled={laeuft || !kommentar.trim() || positionen.length === 0}
          onClick={abschliessen}
        >
          Inventur abschließen ({abweichungen} Abweichung{abweichungen === 1 ? "" : "en"})
        </Button>
        {meldung ? (
          <Alert type="success" showIcon={false} title={meldung} />
        ) : null}
        {fehler ? (
          <Alert type="warning" showIcon={false} title={fehler} />
        ) : null}
      </Flex>
    </>
  );
}
