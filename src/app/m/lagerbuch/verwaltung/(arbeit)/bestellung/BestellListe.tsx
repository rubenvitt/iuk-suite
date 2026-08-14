"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Flex, Input, Modal, Table, type TableProps } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { markiereBestellt } from "../../../_actions/bestellung";
import { baueBestellCsv, BESTELL_CSV_DATEINAME } from "../../../_lib/csvBestellung";
import { bestellListeText } from "../../../_lib/bestellText";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";

/**
 * Serialisierbarer Vertrag der Client-Insel. Der Datenbankzeitpunkt wird auf
 * der RSC-Seite formatiert; insbesondere gelangt kein `Date` ueber die
 * Server/Client-Grenze.
 */
export type BestellAnzeigeZeile = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
  mindestbestand: number;
  vorschlag: number;
  bestellt: boolean;
  bestelltSeitText: string | null;
  wareOffenbarDa: boolean;
};

export function statusChip(
  z: BestellAnzeigeZeile,
): { ton: "rot" | "gelb" | "ok"; text: string } {
  // „Offenbar" ist absichtlich vorsichtig: belegt ist nur eine weiterhin
  // stehende Markierung bei inzwischen gedecktem Bestand, nicht die Ursache.
  if (z.wareOffenbarDa) {
    return { ton: "gelb", text: "Ware offenbar eingetroffen" };
  }
  if (z.bestellt) {
    return z.bestelltSeitText
      ? { ton: "ok", text: `bestellt seit ${z.bestelltSeitText}` }
      : { ton: "ok", text: "bestellt" };
  }
  return { ton: "rot", text: "offen" };
}

export function BestellListe({ zeilen }: { zeilen: BestellAnzeigeZeile[] }) {
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [abschriftOffen, setAbschriftOffen] = useState(false);

  /**
   * ZWISCHENABLAGE (Spec §9.3, Entscheidung 9-D).
   *
   * NUR DIE OFFENEN ZEILEN — die CSV nimmt alle. Die beiden Wege duerfen
   * auseinanderlaufen und tun es; 9-A laesst den Umfang und beschriftet ihn
   * stattdessen ueber die Knopfbeschriftungen.
   *
   * `navigator.clipboard` wird auf VORHANDENSEIN geprueft, nicht angenommen: es
   * verlangt einen secure context, und Browser bewerten dafuer die
   * HOSTZEICHENKETTE (localhost, *.localhost, 127.0.0.1) — nicht die aufgeloeste
   * Adresse. `lagerbuch.localtest.me` ist keines von beidem, und ohne diese
   * Pruefung meldete die Oberflaeche in Dev und E2E „Kopieren fehlgeschlagen".
   */
  function kopieren(): void {
    setFehler(null);
    setMeldung(null);
    const text = bestellListeText(zeilen);
    const schreiben = navigator.clipboard?.writeText;
    if (!schreiben) {
      setAbschriftOffen(true);
      return;
    }
    schreiben.call(navigator.clipboard, text)
      .then(() => setMeldung("Bestellliste kopiert"))
      .catch(() => setFehler("Kopieren fehlgeschlagen"));
  }

  /**
   * CSV (Spec §9.2). ALLE Zeilen, auch die bereits als bestellt markierten.
   * Der Dateiname ist konstant und traegt kein Datum — wiederholte Downloads
   * kollidieren dadurch im Download-Ordner. Ein datierter Name waere eine
   * Verbesserung UND eine Formataenderung; 1:1-Pflicht 28 laesst ihn.
   */
  function csvLaden(): void {
    const inhalt = baueBestellCsv(
      zeilen.map((z) => ({
        name: z.name, bestand: z.bestand, mindestbestand: z.mindestbestand,
        vorschlag: z.vorschlag, einheit: z.einheit, bestellt: z.bestellt,
      })),
    );
    const blob = new Blob([inhalt], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = BESTELL_CSV_DATEINAME;
    a.click();
    URL.revokeObjectURL(url);
  }

  function markierungAendern(z: BestellAnzeigeZeile): void {
    start(async () => {
      setFehler(null);
      try {
        const ergebnis = await markiereBestellt({
          artikelId: z.id,
          bestellt: !z.bestellt,
        });
        if (!ergebnis.ok) setFehler(ergebnis.fehler);
      } catch {
        setFehler("Bestellmarkierung konnte nicht gespeichert werden.");
      }
    });
  }

  // Spaltenkoepfe tragen die Kicker-Rolle ueber `title`, nie ueber CSS gegen
  // `.ant-table-thead` (docs/design/README.md). Die Markierungsspalte bleibt
  // ohne Titeltext -- ein Kicker haette hier nichts zu beschriften.
  const spalten: TableProps<BestellAnzeigeZeile>["columns"] = [
    {
      title: "",
      dataIndex: "bestellt",
      key: "markierung",
      width: 48,
      render: (_bestellt: boolean, z) => (
        // KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
        // docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
        // ist hier bereits die volle wie die halbe Bediendichte. "small"
        // unterbietet die Mindesttapflaeche und wird von
        // e2e/lagerbuch-mobil.spec.ts:312 geprueft (misst ALLE
        // a[href]/button/input/textarea/select auf 44px breit UND hoch).
        <Button
          shape="circle"
          disabled={laeuft}
          aria-label={
            z.bestellt ? "Bestellung zurücknehmen" : "Als bestellt markieren"
          }
          icon={z.bestellt ? <Ikone name="haken" groesse={15} /> : undefined}
          onClick={() => markierungAendern(z)}
        />
      ),
    },
    {
      title: <span style={SCHRIFT.feldname}>Artikel</span>,
      dataIndex: "name",
      key: "name",
      render: (name: string, z) => (
        <span
          style={
            z.bestellt
              ? { textDecoration: "line-through", ...SCHRIFT.neben }
              : { fontWeight: 600 }
          }
        >
          {name}
        </span>
      ),
    },
    {
      title: <span style={SCHRIFT.feldname}>Fach</span>,
      dataIndex: "fach",
      key: "fach",
      render: (fach: string) => <span className={s.fach}>{fach}</span>,
    },
    {
      title: <span style={SCHRIFT.feldname}>Bestand / Min.</span>,
      dataIndex: "bestand",
      key: "bestand",
      render: (bestand: number, z) => (
        <span style={SCHRIFT.neben}>
          {bestand} / min. {z.mindestbestand}
        </span>
      ),
    },
    {
      title: <span style={SCHRIFT.feldname}>Status</span>,
      dataIndex: "bestellt",
      key: "status",
      render: (_bestellt: boolean, z) => {
        const status = statusChip(z);
        return <Chip ton={status.ton}>{status.text}</Chip>;
      },
    },
    {
      title: <span style={SCHRIFT.feldname}>Vorschlag</span>,
      dataIndex: "vorschlag",
      key: "vorschlag",
      align: "right",
      render: (vorschlag: number, z) => (
        <span style={SCHRIFT.zahl}>
          {vorschlag}
          <span style={{ ...SCHRIFT.neben, marginInlineStart: SPACE.xs }}>
            {z.einheit}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      {meldung ? (
        <Alert
          type="success"
          showIcon={false}
          title={meldung}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}

      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Button
          data-testid="lb-kopieren"
          icon={<Ikone name="kopieren" groesse={16} />}
          onClick={kopieren}
        >
          Liste kopieren (nur offene)
        </Button>
        <Button
          data-testid="lb-csv"
          icon={<Ikone name="herunterladen" groesse={16} />}
          onClick={csvLaden}
        >
          CSV (alle Zeilen)
        </Button>
      </Flex>

      <Table<BestellAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Bestellvorschlag"
        dataSource={zeilen}
        locale={{ emptyText: "Kein Unterbestand und keine offene Bestellmarkierung." }}
        columns={spalten}
      />

      <Modal
        open={abschriftOffen}
        onCancel={() => setAbschriftOffen(false)}
        footer={null}
        title="Bestellliste kopieren"
      >
        <p>Diese Umgebung erlaubt keinen Zugriff auf die Zwischenablage. Text markieren und kopieren.</p>
        {/* Der Vertrag ist der TEXTINHALT, nicht der Transportweg: zeichengleich
            derselbe String wie im Erfolgsfall (§9.3). */}
        <Input.TextArea
          readOnly
          autoFocus
          rows={8}
          value={bestellListeText(zeilen)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Modal>
    </>
  );
}
