"use client";

import { useMemo, useRef, useState } from "react";
import { Alert, Button, Flex, Form, Table, type TableProps } from "antd";
import { importArtikelCsv } from "../../../_actions/csv";
import { parseArtikelCsv, type CsvZeile } from "../../../_lib/csv";
import { SCHRIFT } from "../../../_lib/schrift";
import s from "../../../_ui/verwaltung.module.css";

export type CsvVorschauZeile = CsvZeile & { zeile: number };

type ImportErgebnis = {
  angelegt: number;
  fehler: string[];
};

const IMPORT_LAUFZEITFEHLER =
  "Der CSV-Import konnte nicht abgeschlossen werden. Bitte erneut versuchen.";
const DATEI_LESEFEHLER =
  "Die CSV-Datei konnte nicht gelesen werden. Bitte erneut versuchen.";

/**
 * Die Vorschau verwendet bewusst denselben browser-sicheren Parser wie die
 * Server Action. Die Metadaten-Variante ergänzt nur die physische Zeilennummer,
 * damit auch zwei fachlich identische Zeilen verschiedene Tabellenidentitäten
 * behalten.
 */
export function vorschauAus(
  text: string,
): { rows: CsvVorschauZeile[]; fehler: string[] } {
  const { rows, errors } = parseArtikelCsv(text, { mitMetadaten: true });
  return {
    rows: rows.map(({ row, zeile }) => ({ ...row, zeile })),
    fehler: errors,
  };
}

const VORSCHAU_SPALTEN = [
  {
    title: "Artikel",
    dataIndex: "name",
    key: "artikel",
    render: (wert: string) => <span style={{ fontWeight: 600 }}>{wert}</span>,
  },
  {
    title: "Fach",
    dataIndex: "fach",
    key: "fach",
    render: (wert: string) => <span className={s.fach}>{wert}</span>,
  },
  {
    title: "Einheit",
    dataIndex: "einheit",
    key: "einheit",
  },
  {
    title: "Mindestbestand",
    dataIndex: "mindestbestand",
    key: "mindestbestand",
    align: "right",
    render: (wert: number) => <span style={SCHRIFT.zahl}>{wert}</span>,
  },
  {
    title: "Startbestand",
    dataIndex: "startbestand",
    key: "startbestand",
    align: "right",
    render: (wert: number) => <span style={SCHRIFT.zahl}>{wert}</span>,
  },
] satisfies TableProps<CsvVorschauZeile>["columns"];

export function VorschauTabelle({ rows }: { rows: CsvVorschauZeile[] }) {
  return (
    <Table<CsvVorschauZeile>
      rowKey="zeile"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Vorschau"
      locale={{ emptyText: "Keine gültige Zeile in der Datei." }}
      dataSource={rows}
      columns={VORSCHAU_SPALTEN}
    />
  );
}

export function Fehlerbericht({ fehler }: { fehler: string[] }) {
  if (fehler.length === 0) return null;

  const titel = fehler.length === 1
    ? "1 Zeile wird übersprungen"
    : `${fehler.length} Zeilen werden übersprungen`;

  return (
    <Alert
      type="warning"
      showIcon={false}
      title={titel}
      description={
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {fehler.map((eintrag, index) => (
            <li key={`${index}-${eintrag}`} style={SCHRIFT.mono}>{eintrag}</li>
          ))}
        </ul>
      }
    />
  );
}

export function ImportForm() {
  const [text, setText] = useState("");
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);
  const [warnung, setWarnung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const dateifeld = useRef<HTMLInputElement>(null);
  const leseGeneration = useRef(0);
  const importLaeuft = useRef(false);
  const vorschau = useMemo(() => vorschauAus(text), [text]);

  const dateiLesen = async (datei: File | undefined) => {
    const generation = ++leseGeneration.current;
    setErgebnis(null);
    setWarnung(null);
    setText("");
    if (!datei) return;

    try {
      const inhalt = await datei.text();
      if (leseGeneration.current === generation) setText(inhalt);
    } catch {
      if (leseGeneration.current === generation) setWarnung(DATEI_LESEFEHLER);
    }
  };

  const importieren = async () => {
    if (importLaeuft.current || vorschau.rows.length === 0) return;
    importLaeuft.current = true;
    setLaeuft(true);
    setErgebnis(null);
    setWarnung(null);

    try {
      const antwort = await importArtikelCsv(text);
      if (!antwort.ok) {
        setWarnung(antwort.fehler);
        return;
      }

      setErgebnis(antwort.wert);
      if (antwort.wert.fehler.length === 0) {
        setText("");
        if (dateifeld.current) dateifeld.current.value = "";
      }
    } catch {
      setWarnung(IMPORT_LAUFZEITFEHLER);
    } finally {
      importLaeuft.current = false;
      setLaeuft(false);
    }
  };

  return (
    <Form layout="vertical" onFinish={importieren}>
      <Flex vertical gap={12}>
        <Form.Item label="CSV-Datei">
          <input
            ref={dateifeld}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV-Datei wählen"
            disabled={laeuft}
            onChange={(ereignis) => {
              void dateiLesen(ereignis.currentTarget.files?.[0]);
            }}
          />
        </Form.Item>

        <VorschauTabelle rows={vorschau.rows} />
        <Fehlerbericht fehler={vorschau.fehler} />

        <Button
          type="primary"
          htmlType="submit"
          data-rolle="import"
          loading={laeuft}
          disabled={laeuft || vorschau.rows.length === 0}
        >
          Importieren
        </Button>

        {ergebnis ? (
          <Alert
            type="success"
            showIcon={false}
            title={`${ergebnis.angelegt} Artikel angelegt.`}
          />
        ) : null}
        {ergebnis ? <Fehlerbericht fehler={ergebnis.fehler} /> : null}
        {warnung ? <Alert type="warning" showIcon={false} title={warnung} /> : null}
      </Flex>
    </Form>
  );
}
