"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Flex, Input, InputNumber, Table } from "antd";
import { inventurKorrektur } from "../../../_actions/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";

export type InventurZeile = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
};

const BUCHUNGS_FEHLER = "Inventur konnte nicht gebucht werden.";

/**
 * Nur tatsächlich gezählte Positionen. Eine berührte Zeile bleibt auch dann
 * enthalten, wenn ihr Wert dem Seitenladebestand entspricht: Der Server
 * vergleicht sie mit dem Live-Bestand und verhindert damit Lost Updates.
 */
export function positionenAus(
  beruehrt: Readonly<Record<string, number>>,
): { artikelId: string; ist: number }[] {
  return Object.entries(beruehrt).map(([artikelId, ist]) => ({ artikelId, ist }));
}

export function InventurForm({ zeilen }: { zeilen: InventurZeile[] }) {
  const [beruehrt, setBeruehrt] = useState<Record<string, number>>({});
  const [kommentar, setKommentar] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  const absendenLaeuft = useRef(false);

  const positionen = positionenAus(beruehrt);
  const abweichungen = zeilen.filter(
    (zeile) => zeile.id in beruehrt && beruehrt[zeile.id] !== zeile.bestand,
  ).length;

  function wertSetzen(id: string, wert: number | null): void {
    setBeruehrt((aktuell) => ({ ...aktuell, [id]: wert ?? 0 }));
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
    const nutzlast = {
      kommentar: kommentar.trim(),
      positionen,
    };
    startTransition(async () => {
      try {
        const ergebnis = await inventurKorrektur(nutzlast);
        if (!ergebnis.ok) {
          setFehler(BUCHUNGS_FEHLER);
          return;
        }
        setFehler(null);
        setMeldung(
          `Inventur gebucht — ${ergebnis.wert.korrigiert} ${
            ergebnis.wert.korrigiert === 1 ? "Position" : "Positionen"
          } korrigiert.`,
        );
        setBeruehrt({});
        setKommentar("");
      } catch {
        setFehler(BUCHUNGS_FEHLER);
      } finally {
        absendenLaeuft.current = false;
      }
    });
  }

  return (
    <>
      <Table<InventurZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Inventur"
        dataSource={zeilen}
        locale={{ emptyText: "Keine Artikel vorhanden." }}
        columns={[
          {
            title: "Artikel",
            dataIndex: "name",
            render: (wert: string) => <span style={{ fontWeight: 600 }}>{wert}</span>,
          },
          {
            title: "Fach",
            dataIndex: "fach",
            render: (wert: string) => <span className={s.fach}>{wert}</span>,
          },
          {
            title: "Bestand",
            dataIndex: "bestand",
            align: "right",
            render: (wert: number, zeile) => (
              <span style={SCHRIFT.mono}>{wert} {zeile.einheit}</span>
            ),
          },
          {
            title: "Abweichung",
            dataIndex: "id",
            render: (_wert: string, zeile) => {
              if (!(zeile.id in beruehrt)) return null;
              const differenz = beruehrt[zeile.id]! - zeile.bestand;
              if (differenz === 0) return null;
              return (
                <Chip ton={differenz < 0 ? "rot" : "gelb"}>
                  {differenz > 0 ? `+${differenz}` : `${differenz}`}
                </Chip>
              );
            },
          },
          {
            title: "Ist",
            dataIndex: "id",
            align: "right",
            render: (_wert: string, zeile) => {
              // Einmal berechnet, von Minus-Knopf, Feld und Plus-Knopf gelesen --
              // zwei Ableitungen desselben Werts liefen sonst auseinander.
              const aktuell = zeile.id in beruehrt ? beruehrt[zeile.id]! : zeile.bestand;
              return (
                <Flex gap={4} align="center" justify="flex-end">
                  <Button
                    size="small"
                    disabled={laeuft || aktuell <= 0}
                    aria-label={`Ist-Bestand ${zeile.name} verringern`}
                    onClick={() => wertSetzen(zeile.id, aktuell - 1)}
                    icon={<Ikone name="minus" groesse={14} />}
                  />
                  <InputNumber<number>
                    size="small"
                    min={0}
                    max={9999}
                    disabled={laeuft}
                    aria-label={`Ist-Bestand ${zeile.name}`}
                    value={aktuell}
                    onChange={(wert) => wertSetzen(zeile.id, wert)}
                  />
                  <Button
                    size="small"
                    disabled={laeuft || aktuell >= 9999}
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
      <Flex vertical gap={8} style={{ marginBlockStart: 12 }}>
        <Input
          aria-label="Kommentar"
          placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026"
          disabled={laeuft}
          value={kommentar}
          onChange={(ereignis) => kommentarSetzen(ereignis.target.value)}
        />
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
