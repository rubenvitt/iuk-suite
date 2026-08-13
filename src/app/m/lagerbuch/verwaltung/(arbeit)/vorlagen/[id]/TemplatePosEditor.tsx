"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  Button,
  Flex,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Table,
  type TableProps,
} from "antd";
import { SPACE } from "@/core/theme/tokens";
import {
  templatePositionEntfernen,
  templatePositionSetzen,
} from "../../../../_actions/templates";
import type { ActionAusgang } from "../../../../_lib/actionErgebnis";
import type { TemplatePositionZeile } from "../../../../_lib/lesepfade/fahrzeuge";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Ikone } from "../../../../_ui/ikonen";
import s from "../../../../_ui/verwaltung.module.css";

const SOLL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "Vorlagenposition konnte nicht gespeichert werden.";
const ENTFERNEN_FEHLER = "Vorlagenposition konnte nicht entfernt werden.";

export type ArtikelOption = {
  value: string;
  label: string;
  keywords: string;
};

/** Sucht neben dem Artikelnamen ausdrücklich auch im Handlager-Fach. */
export function fachFilter(eingabe: string, option?: ArtikelOption): boolean {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`
    .toLocaleLowerCase("de")
    .includes(eingabe.trim().toLocaleLowerCase("de"));
}

export function TemplatePosEditor({
  templateId,
  positionen,
  artikel,
}: {
  templateId: string;
  positionen: TemplatePositionZeile[];
  artikel: { id: string; name: string; fach: string }[];
}) {
  const [neuFach, setNeuFach] = useState("");
  const [neuArtikel, setNeuArtikel] = useState<string>();
  const [neuSoll, setNeuSoll] = useState<number | null>(1);
  const [spiegel, setSpiegel] = useState<Record<string, number>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  // Zum Timer gehoert sein Rumpf: nur so kann `onBlur` den ausstehenden
  // Schreibvorgang VORZIEHEN, statt ihn nur abzuraeumen. Ohne das verliert das
  // Verlassen der Seite innerhalb der Entprellzeit die Eingabe stillschweigend.
  const timer = useRef<Record<string, {
    id: ReturnType<typeof setTimeout>;
    sofort: () => void;
  }>>({});

  const optionen = useMemo<ArtikelOption[]>(() => artikel.map((eintrag) => ({
    value: eintrag.id,
    label: eintrag.name,
    keywords: eintrag.fach,
  })), [artikel]);

  function timerLoeschen(id: string): void {
    clearTimeout(timer.current[id]?.id);
    delete timer.current[id];
  }

  /**
   * Zieht einen entprellten Schreibvorgang beim Verlassen des Feldes vor.
   *
   * Ohne das ist jede Aenderung verloren, die innerhalb der Entprellzeit von
   * einem Klick auf den `zurueck`-Weg im Seitenkopf oder einem Seitenwechsel
   * gefolgt wird — der Aufraeumer in `useEffect` loescht den Timer, ohne ihn
   * auszufuehren, und es gibt keinen Hinweis darauf. Form aus
   * `bz/[id]/ReferenzEditor.tsx`.
   */
  function timerVorziehen(id: string): void {
    const ausstehend = timer.current[id];
    if (ausstehend === undefined) return;
    clearTimeout(ausstehend.id);
    ausstehend.sofort();
  }

  useEffect(() => () => {
    for (const ausstehend of Object.values(timer.current)) clearTimeout(ausstehend.id);
    timer.current = {};
  }, []);

  /**
   * `ActionAusgang` statt `{ ok: boolean }`: die Actions
   * unterscheiden ihre Fehlgruende, und nur der Satz aus der Action sagt der
   * Person, ob neu laden, erneut versuchen oder etwas anderes eintragen hilft.
   * Der Konstantentext bleibt Rueckfall fuer den Wurf — dort ist `e.message`
   * in Produktion Framework-Englisch (siehe `_lib/actionErgebnis`).
   */
  async function sicherAusfuehren(
    aktion: () => Promise<ActionAusgang>,
    fehlerText: string,
  ): Promise<boolean> {
    try {
      const ergebnis = await aktion();
      if (!ergebnis.ok) {
        setFehler(ergebnis.fehler);
        return false;
      }
      setFehler(null);
      return true;
    } catch {
      setFehler(fehlerText);
      return false;
    }
  }

  function sollGeaendert(position: TemplatePositionZeile, wert: number | null): void {
    if (wert === null) return;
    setSpiegel((vorher) => ({ ...vorher, [position.id]: wert }));
    timerLoeschen(position.id);
    const payload = {
      id: position.id,
      templateId,
      fachLabel: position.fachLabel,
      artikelId: position.artikelId,
      soll: wert,
      sort: position.sort,
    };
    const sofort = () => {
      delete timer.current[position.id];
      void sicherAusfuehren(
        () => templatePositionSetzen(payload),
        SPEICHER_FEHLER,
      );
    };
    timer.current[position.id] = {
      id: setTimeout(sofort, SOLL_DEBOUNCE_MS),
      sofort,
    };
  }

  const spalten: TableProps<TemplatePositionZeile>["columns"] = [
    {
      title: <span style={SCHRIFT.feldname}>Fach</span>,
      dataIndex: "fachLabel",
      key: "fach",
      render: (fachLabel: string) => <span className={s.fach}>{fachLabel}</span>,
    },
    {
      title: <span style={SCHRIFT.feldname}>Artikel</span>,
      dataIndex: "artikelName",
      key: "artikel",
      render: (artikelName: string, position) => (
        // 2 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
        // Zweizeiler aus Artikelname und Bestandstext, keine Geschwisterzeile
        // in diesem Zuschnitt, die einen Skalenwert nahelegen wuerde.
        <div style={{ display: "grid", gap: 2 }}>
          <strong>{artikelName}</strong>
          <span style={SCHRIFT.neben}>
            Handlager {position.handlagerFach} · {position.einheit}
          </span>
        </div>
      ),
    },
    {
      title: <span style={SCHRIFT.feldname}>Soll</span>,
      dataIndex: "soll",
      key: "soll",
      align: "right",
      render: (wert: number, position) => (
        // KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
        // docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
        // ist hier bereits die volle wie die halbe Bediendichte, "small"
        // unterbietet die Mindesttapflaeche (WCAG 2.5.8).
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={spiegel[position.id] ?? wert}
          onChange={(neu) => sollGeaendert(position, neu)}
          onBlur={() => timerVorziehen(position.id)}
          aria-label={`Soll für ${position.artikelName}`}
        />
      ),
    },
    {
      title: "",
      dataIndex: "id",
      key: "aktion",
      render: (_id: string, position) => (
        // KEIN size="small" an der Zeilenaktion, s. o.
        <Popconfirm
          title="Position entfernen?"
          okText="Entfernen"
          cancelText="Abbrechen"
          onConfirm={() => new Promise<void>((fertig) => {
            timerLoeschen(position.id);
            startTransition(async () => {
              await sicherAusfuehren(
                () => templatePositionEntfernen({ id: position.id }),
                ENTFERNEN_FEHLER,
              );
              fertig();
            });
          })}
        >
          <Button
            danger
            loading={laeuft}
            icon={<Ikone name="papierkorb" groesse={14} />}
            aria-label={`${position.artikelName} aus Fach ${position.fachLabel} entfernen`}
          />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: SPACE.md }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      <Table<TemplatePositionZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Vorlagen-Positionen"
        dataSource={positionen}
        locale={{ emptyText: "Noch keine Position. Lege unten die erste an." }}
        columns={spalten}
      />
      <Flex gap={SPACE.sm} wrap align="center">
        <Input
          placeholder="Fach"
          aria-label="Fach"
          value={neuFach}
          onChange={(ereignis) => setNeuFach(ereignis.target.value)}
          style={{ minWidth: 160, width: "auto" }}
        />
        <Select<string, ArtikelOption>
          showSearch
          filterOption={fachFilter}
          value={neuArtikel}
          onChange={setNeuArtikel}
          placeholder="Artikel"
          aria-label="Artikel"
          style={{ minWidth: 240 }}
          options={optionen}
        />
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={neuSoll}
          onChange={setNeuSoll}
          aria-label="Soll"
        />
        <Button
          type="primary"
          icon={<Ikone name="plus" groesse={16} />}
          loading={laeuft}
          disabled={!neuFach.trim() || !neuArtikel || !neuSoll || laeuft}
          onClick={() => {
            const payload = {
              templateId,
              fachLabel: neuFach.trim(),
              artikelId: neuArtikel!,
              soll: neuSoll!,
            };
            startTransition(async () => {
              const erfolgreich = await sicherAusfuehren(
                () => templatePositionSetzen(payload),
                SPEICHER_FEHLER,
              );
              if (erfolgreich) {
                setNeuArtikel(undefined);
                setNeuSoll(1);
              }
            });
          }}
        >
          Position hinzufügen
        </Button>
      </Flex>
    </div>
  );
}
