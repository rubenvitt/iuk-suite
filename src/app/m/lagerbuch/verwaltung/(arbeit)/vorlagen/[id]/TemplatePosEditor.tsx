"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Alert,
  Button,
  Checkbox,
  InputNumber,
  Popconfirm,
  type TableProps,
} from "antd";
import { Kartentabelle, useEntprellt } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import {
  templatePositionEntfernen,
  templatePositionSetzen,
} from "../../../../_actions/templates";
import type { ActionAusgang } from "../../../../_lib/actionErgebnis";
import type { TemplatePositionZeile } from "../../../../_lib/lesepfade/fahrzeuge";
import {
  artikelOptionen,
  nachFachGruppieren,
  OFFEN_BIS_POSITIONEN,
} from "../../../../_lib/positionen";
import { SCHRIFT } from "../../../../_lib/schrift";
import { sollText } from "../../../../_lib/domain/sollBereich";
import { Chip } from "../../../../_ui/Chip";
import {
  FachgruppenListe,
  NeuePosition,
  PositionenLeiste,
  useFachgruppen,
  type NeuePositionWerte,
} from "../../../../_ui/Fachgruppen";
import { Ikone } from "../../../../_ui/ikonen";

export { fachFilter, type ArtikelOption } from "../../../../_lib/positionen";

const SOLL_DEBOUNCE_MS = 400;
const SPEICHER_FEHLER = "Vorlagenposition konnte nicht gespeichert werden.";
const ENTFERNEN_FEHLER = "Vorlagenposition konnte nicht entfernt werden.";

/**
 * ⚠️ FESTE BREITEN, DAMIT DIE TABELLEN DER FÄCHER UNTEREINANDER FLUCHTEN —
 * dieselbe Begründung wie am Soll der Einheit (`fahrzeuge/[id]/SollEditor.tsx`).
 */
const BREITE = {
  artikelMindestens: 280,
  soll: 120,
  sollMax: 120,
  immerZaehlen: 120,
  aktion: 80,
} as const;

/**
 * DIE POSITIONEN EINER VORLAGE — seit IDA-239 nach dem Muster des Solls einer
 * Einheit: Lesemodus mit Schalter „Bearbeiten", je Fach ein aufklappbarer
 * Abschnitt, Suche über Artikel und Fach.
 *
 * Vorher stand jede Position als Zeile mit offenem Mengenfeld, Kästchen und
 * rotem Löschknopf in EINER Tabelle; bei 210 Positionen war die Seite rund
 * 15 000 px hoch, und die Aktionen der Vorlage standen darunter. Das Speichern
 * selbst ist unverändert: entprellt je Feld, mit vorgezogenem Schreiben beim
 * Verlassen des Feldes und beim Verlassen des Bearbeitens.
 */
export function TemplatePosEditor({
  templateId,
  positionen,
  artikel,
}: {
  templateId: string;
  positionen: TemplatePositionZeile[];
  artikel: { id: string; name: string; fach: string }[];
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [suche, setSuche] = useState("");
  const sucheNachlauf = useEntprellt(suche);
  const [neuOffen, setNeuOffen] = useState(false);
  const [spiegel, setSpiegel] = useState<Record<string, number>>({});
  const [spiegelMax, setSpiegelMax] = useState<Record<string, number | null>>({});
  const [pflicht, setPflicht] = useState<Record<string, boolean>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  // Zum Timer gehoert sein Rumpf: nur so kann `onBlur` den ausstehenden
  // Schreibvorgang VORZIEHEN, statt ihn nur abzuraeumen. Ohne das verliert das
  // Verlassen der Seite innerhalb der Entprellzeit die Eingabe stillschweigend.
  const timer = useRef<Record<string, {
    id: ReturnType<typeof setTimeout>;
    sofort: () => void;
  }>>({});

  const gruppen = useMemo(() => nachFachGruppieren(positionen), [positionen]);
  const optionen = useMemo(() => artikelOptionen(artikel), [artikel]);
  const fach = useFachgruppen(gruppen, sucheNachlauf, positionen.length <= OFFEN_BIS_POSITIONEN);

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
   * auszufuehren, und es gibt keinen Hinweis darauf.
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

  const maxWert = (position: TemplatePositionZeile): number | null =>
    position.id in spiegelMax ? spiegelMax[position.id] : position.sollMax;

  function sollGeaendert(position: TemplatePositionZeile, wert: number | null): void {
    if (wert === null) return;
    setSpiegel((vorher) => ({ ...vorher, [position.id]: wert }));
    zeileSpeichern(position, wert, maxWert(position));
  }

  /** IDA-247: „OK bis". Ein leeres Feld heisst „kein Bereich" und speichert `null`. */
  function maxGeaendert(position: TemplatePositionZeile, wert: number | null): void {
    setSpiegelMax((vorher) => ({ ...vorher, [position.id]: wert }));
    zeileSpeichern(position, spiegel[position.id] ?? position.soll, wert);
  }

  /** Ein Schreibvorgang je Zeile fuer beide Werte — Begruendung am Soll der Einheit. */
  function zeileSpeichern(
    position: TemplatePositionZeile,
    soll: number,
    sollMax: number | null,
  ): void {
    timerLoeschen(position.id);
    const payload = {
      id: position.id,
      templateId,
      fachLabel: position.fachLabel,
      artikelId: position.artikelId,
      soll,
      sollMax,
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

  /**
   * IDA-223. Sofort, nicht entprellt: ein Klick ist eine Entscheidung. Das
   * Soll reist aus dem Spiegel mit, damit ein noch entprelltes Soll nicht vom
   * gespeicherten Wert ueberholt wird.
   */
  function pflichtGeaendert(position: TemplatePositionZeile, wert: boolean): void {
    setPflicht((vorher) => ({ ...vorher, [position.id]: wert }));
    void sicherAusfuehren(
      () => templatePositionSetzen({
        id: position.id,
        templateId,
        fachLabel: position.fachLabel,
        artikelId: position.artikelId,
        soll: spiegel[position.id] ?? position.soll,
        sort: position.sort,
        immerZaehlen: wert,
      }),
      SPEICHER_FEHLER,
    ).then((ok) => {
      if (!ok) setPflicht((vorher) => ({ ...vorher, [position.id]: !wert }));
    });
  }

  /**
   * Beim Verlassen des Bearbeitens verschwinden die Felder — und mit ihnen
   * jedes `onBlur`. Was noch entprellt wartet, wird deshalb HIER vorgezogen.
   */
  function bearbeitenUmschalten(an: boolean): void {
    if (!an) {
      for (const positionId of Object.keys(timer.current)) timerVorziehen(positionId);
    }
    setBearbeiten(an);
  }

  function hinzufuegen(werte: NeuePositionWerte): Promise<boolean> {
    return new Promise((fertig) => {
      startTransition(async () => {
        const erfolgreich = await sicherAusfuehren(
          () => templatePositionSetzen({ templateId, ...werte }),
          SPEICHER_FEHLER,
        );
        // Das Fach der neuen Position aufklappen — sonst landete sie
        // unsichtbar in einer zugeklappten Gruppe.
        if (erfolgreich) fach.oeffnen(werte.fachLabel);
        fertig(erfolgreich);
      });
    });
  }

  const artikelSpalte: NonNullable<TableProps<TemplatePositionZeile>["columns"]>[number] = {
    title: "Artikel",
    dataIndex: "artikelName",
    key: "artikel",
    render: (artikelName: string, position) => (
      // 2 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
      // Zweizeiler aus Artikelname und Handlagertext, keine Geschwisterzeile
      // in diesem Zuschnitt, die einen Skalenwert nahelegen wuerde.
      <div style={{ display: "grid", gap: 2 }}>
        <span>
          {artikelName}{" "}
          {/* Im Lesemodus steht „immer zählen" als Kennzeichen am Namen; beim
              Bearbeiten übernimmt die eigene Spalte mit dem Kästchen. */}
          {!bearbeiten && (pflicht[position.id] ?? position.immerZaehlen)
            ? <Chip ton="grau">immer zählen</Chip>
            : null}
        </span>
        <span style={SCHRIFT.neben}>
          Handlager {position.handlagerFach} · {position.einheit}
        </span>
      </div>
    ),
  };

  const lesen: TableProps<TemplatePositionZeile>["columns"] = [
    artikelSpalte,
    {
      title: "Soll",
      dataIndex: "soll",
      key: "soll",
      align: "right",
      width: BREITE.soll,
      render: (wert: number, position) => (
        <span data-rolle="soll" style={{ whiteSpace: "nowrap" }}>
          {sollText(spiegel[position.id] ?? wert, maxWert(position))}{" "}
          <span style={SCHRIFT.neben}>{position.einheit}</span>
        </span>
      ),
    },
  ];

  const schreiben: TableProps<TemplatePositionZeile>["columns"] = [
    artikelSpalte,
    {
      title: "Soll",
      dataIndex: "soll",
      key: "soll",
      align: "right",
      width: BREITE.soll,
      render: (wert: number, position) => (
        // KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
        // docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
        // ist hier bereits die volle wie die halbe Bediendichte, "small"
        // unterbietet die Mindesttapflaeche (WCAG 2.5.5).
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={spiegel[position.id] ?? wert}
          onChange={(neu) => sollGeaendert(position, neu)}
          onBlur={() => timerVorziehen(position.id)}
          aria-label={`Soll für ${position.artikelName}`}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      // IDA-247: optional, dieselbe Bedeutung wie am Soll der Einheit.
      title: "OK bis",
      dataIndex: "sollMax",
      key: "sollMax",
      align: "right",
      width: BREITE.sollMax,
      render: (_wert: number | null, position) => (
        <InputNumber
          min={(spiegel[position.id] ?? position.soll) + 1}
          max={9999}
          precision={0}
          value={maxWert(position)}
          placeholder="–"
          onChange={(neu) => maxGeaendert(position, neu)}
          onBlur={() => timerVorziehen(position.id)}
          aria-label={`OK bis für ${position.artikelName}`}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      // IDA-223: kommt in jeden Kurzcheck, ausserhalb der Stichprobe.
      title: "Immer zählen",
      dataIndex: "immerZaehlen",
      key: "immerZaehlen",
      align: "center",
      width: BREITE.immerZaehlen,
      render: (wert: boolean, position) => (
        <Checkbox
          checked={pflicht[position.id] ?? wert}
          onChange={(e) => pflichtGeaendert(position, e.target.checked)}
          aria-label={`${position.artikelName} in jedem Kurzcheck zählen`}
        />
      ),
    },
    {
      title: "Aktion",
      dataIndex: "id",
      key: "aktion",
      width: BREITE.aktion,
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
          {/* KEIN `danger`: Rot ist in diesem Modul fachlich belegt (Falle 3),
              und das Entfernen fragt ohnehin noch einmal nach. */}
          <Button
            loading={laeuft}
            icon={<Ikone name="papierkorb" groesse={14} />}
            aria-label={`${position.artikelName} aus Fach ${position.fachLabel} entfernen`}
          />
        </Popconfirm>
      ),
    },
  ];

  const spalten = bearbeiten ? schreiben : lesen;
  const breite = BREITE.artikelMindestens + (bearbeiten
    ? BREITE.soll + BREITE.sollMax + BREITE.immerZaehlen + BREITE.aktion
    : BREITE.soll);

  return (
    // `minmax(0, 1fr)` STATT DER IMPLIZITEN `auto`-SPALTE — sonst waechst die
    // Spalte auf die Mindestbreite der Tabelle, und `scroll.x` kommt nie zum
    // Zug (DRK-315, gemessen am Soll der Einheit).
    <div
      data-rolle="vorlagen-positionen"
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.md }}
    >
      <PositionenLeiste
        suche={suche}
        onSuche={setSuche}
        mehrereGruppen={fach.sichtbare.length > 1}
        alleOffen={fach.alleOffen}
        onAlleUmschalten={fach.alleUmschalten}
        bearbeiten={bearbeiten}
        onBearbeiten={bearbeitenUmschalten}
        neuOffen={neuOffen}
        onNeu={() => setNeuOffen(true)}
      />

      {neuOffen ? (
        <NeuePosition
          faecher={gruppen.map((gruppe) => gruppe.fach)}
          artikel={optionen}
          laeuft={laeuft}
          onHinzufuegen={hinzufuegen}
          onSchliessen={() => setNeuOffen(false)}
        />
      ) : null}

      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      {gruppen.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>
          Noch keine Position. Lege oben die erste an.
        </p>
      ) : fach.sichtbare.length === 0 ? (
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>Keine Position passt zur Suche.</p>
      ) : (
        <FachgruppenListe
          gruppen={fach.sichtbare}
          offene={fach.offene}
          onOffene={fach.setOffene}
          inhalt={(gruppe) => (
            <Kartentabelle<TemplatePositionZeile>
              rowKey="id"
              aria-label={`Vorlagen-Positionen ${gruppe.fach}`}
              dataSource={gruppe.positionen}
              tableLayout="fixed"
              scroll={{ x: breite }}
              karte={{ titel: "artikel" }}
              kartenHoehe={bearbeiten ? 240 : 150}
              leer={{ nichts: "Keine Position in diesem Fach." }}
              columns={spalten}
            />
          )}
        />
      )}
    </div>
  );
}
