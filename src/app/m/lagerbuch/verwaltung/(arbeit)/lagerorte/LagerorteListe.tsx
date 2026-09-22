"use client";

/**
 * DRK-297, Aufgabe 9 — die Client-Insel der Seite „Verwaltung → Lagerorte".
 *
 * ⚠️ DIE SPALTEN LEBEN HIER UND NICHT IN DER SERVER COMPONENT (Falle 9): ein
 * `columns[].render`, das in `page.tsx` entstuende, waere eine gewoehnliche
 * Funktion und liesse sich nicht ueber die RSC-Grenze reichen. `page.tsx`
 * reicht ausschliesslich das serialisierbare `LagerortZeile[]` herein.
 *
 * `size` steht an KEINEM Bedienelement (Falle 4) — die Bediendichte 44px kommt
 * aus dem Theme.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Flex, Form, Input, InputNumber, Modal, type TableProps } from "antd";
import { Kartentabelle, nachText, nachZahl, Zellentext } from "@/core/tabelle";
import { SCHRIFT as KICKER_SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { setSchrankAktiv, updateSchrank } from "../../../_actions/lagerorte";
import { loescheElement, pruefeLoeschbar } from "../../../_actions/loeschen";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { LoeschButton } from "../../../_ui/LoeschButton";
import { NeuSchrank } from "./NeuSchrank";
import { istFormFeld, leereFormFehler, type SchrankWerte } from "./schrankWerte";

/**
 * Die Client-Insel erhaelt ausschliesslich JSON-sichere Skalare — keine
 * Klasse, kein `Date`, keine Funktion.
 */
export type LagerortZeile = {
  id: string;
  name: string;
  zugangshinweis: string | null;
  sortierung: number;
  aktiv: boolean;
  bestandsposten: number;
};

/**
 * Das Bearbeiten-Formular — eigenes Modal statt Wiederverwendung von
 * `NeuSchrank`: die Werte kommen aus der Zeile (nicht aus einem leeren
 * Formular), und die Aktion ist `updateSchrank`, nicht `createSchrank`.
 */
function SchrankBearbeiten({
  zeile,
  onSchliessen,
}: {
  zeile: LagerortZeile;
  onSchliessen: () => void;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const laeuftRef = useRef(false);
  const [form] = Form.useForm<SchrankWerte>();
  const router = useRouter();

  function schliessen(): void {
    if (laeuftRef.current) return;
    setFehler(null);
    onSchliessen();
  }

  function speichern(werte: SchrankWerte): void {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    form.setFields(leereFormFehler());

    start(async () => {
      try {
        const ergebnis = await updateSchrank({ id: zeile.id, ...werte });
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof SchrankWerte, string] => (
                istFormFeld(eintrag[0])
              ))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }

        setFehler(null);
        onSchliessen();
        router.refresh();
      } catch {
        setFehler("Schrank konnte nicht gespeichert werden.");
      } finally {
        laeuftRef.current = false;
      }
    });
  }

  return (
    <Modal
      open
      title="Schrank bearbeiten"
      okText="Speichern"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      closable={!laeuft}
      keyboard={!laeuft}
      mask={{ closable: !laeuft }}
      onCancel={schliessen}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form<SchrankWerte>
        form={form}
        layout="vertical"
        disabled={laeuft}
        onFinish={speichern}
        initialValues={{
          name: zeile.name,
          zugangshinweis: zeile.zugangshinweis ?? undefined,
          sortierung: zeile.sortierung,
        }}
        data-rolle="schrank-bearbeiten"
      >
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
        >
          <Input aria-label="Name" autoComplete="off" />
        </Form.Item>
        <Form.Item name="zugangshinweis" label="Zugangshinweis">
          <Input aria-label="Zugangshinweis" autoComplete="off" />
        </Form.Item>
        <Form.Item name="sortierung" label="Reihenfolge">
          <InputNumber aria-label="Reihenfolge" style={{ width: "100%" }} />
        </Form.Item>
      </Form>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </Modal>
  );
}

const PRUEF_FEHLER = "Löschbarkeit konnte nicht geprüft werden.";
const LOESCH_FEHLER = "Schrank konnte nicht gelöscht werden.";
const STILLLEGE_FEHLER = "Schrank konnte nicht stillgelegt werden.";

/** Bearbeiten-, Status- und Loeschknopf einer Zeile. Stilllegen nimmt keinen
 *  Bestand weg (`_actions/lagerorte.ts`) — deshalb ohne Rueckfrage, wie ein
 *  einfacher Statuswechsel. Loeschen dagegen fragt zurueck: derselbe
 *  `LoeschButton` wie an Fahrzeug, Artikel, Geraet, BZ-Geraet und O₂-Flasche. */
function SchrankAktionen({ zeile }: { zeile: LagerortZeile }) {
  const [bearbeitenOffen, setBearbeitenOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const laeuftRef = useRef(false);
  const router = useRouter();

  function statusUmschalten(): void {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await setSchrankAktiv({ id: zeile.id, aktiv: !zeile.aktiv });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        router.refresh();
      } catch {
        setFehler("Status konnte nicht geändert werden.");
      } finally {
        laeuftRef.current = false;
      }
    });
  }

  /*
   * ⚠️ DER DIALOG BRAUCHT EINEN WURF, KEIN ERGEBNISOBJEKT. `LoeschDialog`
   * unterscheidet Erfolg und Fehlschlag allein daran, ob die uebergebene
   * Funktion wirft (`actionAusfuehren` faengt sie); ein zurueckgegebenes
   * `{ ok: false }` schloesse den Dialog als waere alles gut. Dieselbe Form
   * wie in `fahrzeuge/[id]/FahrzeugAktivToggle.tsx`.
   */
  async function loeschen(): Promise<void> {
    try {
      const ergebnis = await loescheElement("lagerort", zeile.id);
      if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
    } catch {
      throw new Error(LOESCH_FEHLER);
    }
    router.refresh();
  }

  async function stilllegen(): Promise<void> {
    try {
      const ergebnis = await setSchrankAktiv({ id: zeile.id, aktiv: false });
      if (!ergebnis.ok) throw new Error(STILLLEGE_FEHLER);
    } catch {
      throw new Error(STILLLEGE_FEHLER);
    }
    router.refresh();
  }

  return (
    <>
      <Flex gap={SPACE.sm} wrap>
        <Button
          icon={<Ikone name="stift" groesse={16} />}
          onClick={() => setBearbeitenOffen(true)}
        >
          Bearbeiten
        </Button>
        <Button
          icon={<Ikone name={zeile.aktiv ? "archiv" : "erneut"} groesse={16} />}
          loading={laeuft}
          disabled={laeuft}
          onClick={statusUmschalten}
        >
          {zeile.aktiv ? "Stilllegen" : "Wieder aufnehmen"}
        </Button>
        {/*
         * DER KNOPF STEHT IMMER DA, AUCH WO NICHT GELOESCHT WERDEN KANN
         * (DRK-349, offene Frage 1). Ihn nur an leeren Schraenken zu zeigen
         * hiesse, ihn an der Spalte „Posten" aufzuhaengen — und die zaehlt
         * etwas anderes als die Pruefung: Posten sind Chargen mit Rest > 0,
         * abgelehnt wird aber auch wegen Soll-Positionen, Checks, Geraeten,
         * BZ-Geraeten, O₂-Flaschen, Zugangs-Codes und Kindern. Der Knopf
         * verschwaende also bei Posten 0 nicht und erschiene bei Posten 0,
         * wo trotzdem abgelehnt wird — ein Knopf, der aus unsichtbaren
         * Gruenden mal da ist und mal nicht. Mit dem Dialog bekommt die
         * verwaltende Person stattdessen den Grund IN WORTEN und gleich
         * daneben den zweiten Ausgang „Stilllegen".
         */}
        <LoeschButton
          name={zeile.name}
          typLabel="Schrank"
          label="Löschen"
          deaktivierenLabel="Stilllegen"
          pruefen={async () => {
            try {
              const ergebnis = await pruefeLoeschbar("lagerort", zeile.id);
              if (ergebnis.ok) return ergebnis.wert;
            } catch {
              // Der feste, nicht loeschbare Zustand folgt direkt darunter.
            }
            return { loeschbar: false, grund: PRUEF_FEHLER, kannDeaktivieren: false };
          }}
          onLoeschen={loeschen}
          // Einem bereits stillgelegten Schrank denselben Ausgang noch einmal
          // anzubieten waere ein Knopf, der nichts aendert.
          onDeaktivieren={zeile.aktiv ? stilllegen : undefined}
        />
      </Flex>
      {/*
       * DIE MELDUNG STEHT IN DER ZEILE, NICHT IN EINEM DIALOG: der Statusknopf
       * hat keinen — ein Fehler nach dem Klick braucht trotzdem eine Stelle, an
       * der die verwaltende Person ihn tatsaechlich sieht, und das ist direkt
       * unter dem Knopf, den sie gerade gedrueckt hat, nicht irgendwo global
       * ausserhalb der Tabelle. Denselben Aufbau (kein `type="error"`, Falle 3:
       * `colorError === colorPrimary`) nutzt `SchrankBearbeiten` oben in
       * dieser Datei.
       */}
      {fehler ? (
        <div style={{ marginBlockStart: SPACE.sm }}>
          <Alert type="warning" showIcon={false} title={fehler} />
        </div>
      ) : null}
      {bearbeitenOffen ? (
        <SchrankBearbeiten zeile={zeile} onSchliessen={() => setBearbeitenOffen(false)} />
      ) : null}
    </>
  );
}

function spalten(): NonNullable<TableProps<LagerortZeile>["columns"]> {
  return [
    {
      title: "Name",
      dataIndex: "name",
      sorter: nachText<LagerortZeile>((zeile) => zeile.name),
      render: (wert: string, zeile) => (
        <span>
          {wert}
          {!zeile.aktiv ? (
            <span style={{ marginInlineStart: SPACE.sm }}>
              <Chip ton="grau">Stillgelegt</Chip>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      /*
       * ⚠️ FREITEXT BRAUCHT EINE BREITE (DRK-372). `lagerorte.zugangshinweis`
       * hat keine Laengengrenze („Schluessel beim Wachhabenden, Schrank steht
       * hinter der Tuer rechts …"), und die Tabelle faehrt `scroll.x:
       * "max-content"` — ein Satz schoebe die Spalten dahinter aus dem Bild.
       * Ohne `zeilen`: diese Liste ist die einzige Flaeche, auf der der Hinweis
       * steht.
       */
      title: "Zugangshinweis",
      dataIndex: "zugangshinweis",
      render: (wert: string | null) => wert ? (
        <Zellentext text={wert} />
      ) : (
        <span style={SCHRIFT.neben}>—</span>
      ),
    },
    {
      // Eigener Kicker-Wrapper statt eines Zeichenkettentitels: `Datentabelle`
      // umwickelt nur String-Titel automatisch mit der Kicker-Rolle
      // (`mitKicker`), ein ReactNode-Titel ginge sonst unveraendert durch und
      // saehe neben den anderen Spaltenkoepfen anders aus.
      title: (
        <span
          data-rolle="spaltenkopf"
          style={KICKER_SCHRIFT.kicker}
          title="kleiner heißt: wird zuerst gegriffen"
        >
          Reihenfolge
        </span>
      ),
      dataIndex: "sortierung",
      align: "right",
      sorter: nachZahl<LagerortZeile>((zeile) => zeile.sortierung),
      defaultSortOrder: "ascend",
      render: (wert: number) => <span style={SCHRIFT.neben}>{wert}</span>,
    },
    {
      title: "Posten",
      dataIndex: "bestandsposten",
      sorter: nachZahl<LagerortZeile>((zeile) => zeile.bestandsposten),
      render: (wert: number) => <span style={SCHRIFT.neben}>{wert}</span>,
    },
    {
      title: "Aktionen",
      key: "aktionen",
      // Ohne `dataIndex` ist der ERSTE Parameter der ganze Datensatz, nicht
      // `undefined` — `zeile` traegt also den kompletten `LagerortZeile`, und
      // ein zweiter Parameter waere nur eine Kopie desselben Werts.
      render: (zeile: LagerortZeile) => <SchrankAktionen zeile={zeile} />,
    },
  ];
}

export function LagerorteListe({ zeilen }: { zeilen: LagerortZeile[] }) {
  const spaltenliste = useMemo(() => spalten(), []);

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <NeuSchrank />
      </Flex>

      <Kartentabelle<LagerortZeile>
        rowKey="id"
        aria-label="Lagerorte"
        dataSource={zeilen}
        leer={{ nichts: "Noch keine Schränke. Lege oben den ersten an." }}
        columns={spaltenliste}
      />
    </>
  );
}
