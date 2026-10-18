"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Flex, Input, Modal, type TableProps } from "antd";
import {
  Kartentabelle,
  type FilterZustand,
  filterAktiv,
  nachText,
  nachZahl,
  trifftWert,
  useEntprellt,
  wendeFilterAn,
  werteAlsFilter,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { markiereBestellt } from "../../../_actions/bestellung";
import { blatt } from "@/core/export";
import { xlsxHerunterladen } from "@/core/export/client";
import {
  BESTELL_BLATTNAME, BESTELL_DATEINAME, BESTELL_FEHLERTEXT, BESTELL_SPALTEN,
} from "../../../_lib/bestellExport";
import { bestellListeText } from "../../../_lib/bestellText";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { Chip } from "../../../_ui/Chip";
import { auswahlZelle } from "../../../_ui/auswahlZelle";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
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

/**
 * Die drei Zustaende der Statusspalte sind genau die drei Faelle aus
 * `statusChip` — der Filter fragt dieselbe Funktion, damit Chip und Filter
 * nicht auseinanderlaufen koennen.
 */
const STATUS_FILTER = zustandsFilter<BestellAnzeigeZeile>([
  { wert: "offen", text: "offen", trifft: (z) => statusChip(z).ton === "rot" },
  { wert: "bestellt", text: "bestellt", trifft: (z) => statusChip(z).ton === "ok" },
  {
    wert: "eingetroffen",
    text: "Ware offenbar eingetroffen",
    trifft: (z) => statusChip(z).ton === "gelb",
  },
]);

/** Suche ueber Artikelname und Fach — das, was auf der Zeile zu lesen ist. */
export function sucheTrifft(z: BestellAnzeigeZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === "" || falte(`${z.name} ${z.fach}`).includes(suche);
}

export function BestellListe({ zeilen }: { zeilen: BestellAnzeigeZeile[] }) {
  const [laeuft, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [abschriftOffen, setAbschriftOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const sucheNachlauf = useEntprellt(suche);
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  /**
   * IDA-238 — DIE AUSWAHL ERSETZT DEN RUNDEN KNOPF JE ZEILE. Er war
   * unbeschriftet, und jede Zeile war ein eigener Server-Roundtrip; zehn
   * Positionen einer Bestellung hiessen zehn Klicks und zehn Anfragen. Den
   * Zustand jeder Zeile sagt jetzt allein die Statusspalte, in Worten.
   *
   * Die Auswahl ueberlebt Suche und Filter und wird gegen `zeilen` aufgeloest,
   * nie gegen die angezeigte Menge — dieselbe Regel wie in der Artikelliste.
   */
  const [auswahl, setAuswahl] = useState<string[]>([]);

  const gefiltert = useMemo(
    () => zeilen.filter((z) => sucheTrifft(z, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );
  const ausgewaehlt = useMemo(() => {
    const menge = new Set(auswahl);
    return zeilen.filter((z) => menge.has(z.id));
  }, [zeilen, auswahl]);
  const zuMarkieren = ausgewaehlt.filter((z) => !z.bestellt);
  const zuruecknehmbar = ausgewaehlt.filter((z) => z.bestellt);

  /**
   * ZWISCHENABLAGE (Spec §9.3, Entscheidung 9-D).
   *
   * NUR DIE OFFENEN ZEILEN — die Mappe nimmt alle. Die beiden Wege duerfen
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
   * EXCEL (Spec §9.2, seit DRK-186 eine Mappe statt einer CSV). ALLE Zeilen,
   * auch die bereits als bestellt markierten.
   *
   * ⚠️ DER WEG BLEIBT IM BROWSER, und das ist keine Altlast: die Bibliothek wird
   * ERST BEIM KLICK nachgeladen (`xlsxHerunterladen`), damit sie nicht im
   * Seiten-Bundle jeder Verwaltungsseite liegt. Der Aufbau des Blattes selbst
   * steht in `_lib/bestellExport.ts` und trägt kein "use client" — dort ist er
   * ohne DOM prüfbar.
   *
   * Der Dateiname ist konstant und traegt kein Datum — wiederholte Downloads
   * kollidieren dadurch im Ablageordner. Ein datierter Name waere eine
   * Verbesserung UND eine zweite Aenderung; siehe `bestellExport.ts`.
   */
  function excelLaden(): void {
    setFehler(null);
    void xlsxHerunterladen(BESTELL_DATEINAME, [
      blatt(
        BESTELL_BLATTNAME,
        BESTELL_SPALTEN,
        zeilen.map((z) => ({
          name: z.name, bestand: z.bestand, mindestbestand: z.mindestbestand,
          vorschlag: z.vorschlag, einheit: z.einheit, bestellt: z.bestellt,
        })),
      ),
    ]).catch(() => setFehler(BESTELL_FEHLERTEXT));
  }

  /**
   * EINE ANFRAGE FUER DIE GANZE AUSWAHL. Geschickt werden nur die Zeilen, die
   * die Aenderung betrifft; die Action laesst die uebrigen ohnehin stehen
   * (ein schon markierter Artikel behaelt sein Datum), aber die Zahl in der
   * Meldung soll sagen, was geschehen ist.
   *
   * ⚠️ KEIN OPTIMISMUS: die Zeilen aendern sich erst, wenn die Seite neu
   * gerechnet zurueckkommt. Eine vorab umgefaerbte Statusspalte zeigte bei
   * einem Fehler einen Zustand, den es nicht gibt.
   */
  function markierungAendern(bestellt: boolean): void {
    const ziele = bestellt ? zuMarkieren : zuruecknehmbar;
    if (ziele.length === 0) return;
    start(async () => {
      setFehler(null);
      setMeldung(null);
      try {
        const ergebnis = await markiereBestellt({
          artikelIds: ziele.map((z) => z.id),
          bestellt,
        });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        setAuswahl([]);
        const n = ergebnis.wert.betroffen;
        const artikelText = n === 1 ? "1 Artikel" : `${n} Artikel`;
        setMeldung(bestellt
          ? `${artikelText} als bestellt markiert.`
          : `Markierung an ${artikelText} zurückgenommen.`);
      } catch {
        setFehler("Bestellmarkierung konnte nicht gespeichert werden.");
      }
    });
  }

  // Den Spaltenkopf-Kicker setzt `Datentabelle` selbst, sobald `title` eine
  // Zeichenkette ist.
  //
  // ⚠️ KEIN DURCHSTREICHEN BESTELLTER ZEILEN MEHR (IDA-238): es sagte
  // dasselbe wie die Statusspalte daneben, nur ohne Datum und ohne den Fall
  // „Ware offenbar eingetroffen". Eine Aussage steht einmal, in Worten.
  const spalten: TableProps<BestellAnzeigeZeile>["columns"] = [
    {
      title: "Artikel",
      dataIndex: "name",
      key: "name",
      sorter: nachText<BestellAnzeigeZeile>((z) => z.name),
      render: (name: string) => <span style={{ fontWeight: 600 }}>{name}</span>,
    },
    {
      title: "Fach",
      dataIndex: "fach",
      key: "fach",
      sorter: nachText<BestellAnzeigeZeile>((z) => z.fach),
      filters: werteAlsFilter(zeilen, (z) => z.fach),
      onFilter: trifftWert<BestellAnzeigeZeile>((z) => z.fach),
      render: (fach: string) => <span className={s.fach}>{fach}</span>,
    },
    {
      title: "Bestand / Min.",
      dataIndex: "bestand",
      key: "bestand",
      // Gezeigt wird „3 / min. 10", sortiert wird ueber die nackte Zahl.
      sorter: nachZahl<BestellAnzeigeZeile>((z) => z.bestand),
      render: (bestand: number, z) => (
        <span style={SCHRIFT.neben}>
          {bestand} / min. {z.mindestbestand}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "bestellt",
      key: "status",
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (_bestellt: boolean, z) => {
        const status = statusChip(z);
        return <Chip ton={status.ton}>{status.text}</Chip>;
      },
    },
    {
      title: "Vorschlag",
      dataIndex: "vorschlag",
      key: "vorschlag",
      align: "right",
      sorter: nachZahl<BestellAnzeigeZeile>((z) => z.vorschlag),
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

  const angezeigt = wendeFilterAn(gefiltert, spalten, spaltenFilter);
  const sucheAktiv = sucheNachlauf.trim() !== "";

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld wert={suche} onWert={setSuche} platzhalter="Artikel oder Fach suchen…" />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
        <Button
          data-testid="lb-kopieren"
          icon={<Ikone name="kopieren" groesse={16} />}
          onClick={kopieren}
        >
          Liste kopieren (nur offene)
        </Button>
        <Button
          data-testid="lb-excel"
          icon={<Ikone name="herunterladen" groesse={16} />}
          onClick={excelLaden}
        >
          Excel (alle Zeilen)
        </Button>
      </Flex>

      {ausgewaehlt.length > 0 ? (
        <Flex
          gap={SPACE.md}
          align="center"
          wrap
          data-testid="bestell-sammelleiste"
          style={{ marginBlockEnd: SPACE.md }}
        >
          <span style={SCHRIFT.feldname}>{ausgewaehlt.length} ausgewählt</span>
          {/* Die Zahl im Knopf sagt, wie viele Zeilen die Aktion WIRKLICH
              aendert — eine schon markierte Zeile in der Auswahl zaehlt beim
              Markieren nicht mit. */}
          <Button
            type="primary"
            loading={laeuft}
            disabled={zuMarkieren.length === 0}
            onClick={() => markierungAendern(true)}
          >
            Als bestellt markieren ({zuMarkieren.length})
          </Button>
          <Button
            disabled={laeuft || zuruecknehmbar.length === 0}
            onClick={() => markierungAendern(false)}
          >
            Markierung zurücknehmen ({zuruecknehmbar.length})
          </Button>
          <Button type="link" style={{ padding: 0 }} onClick={() => setAuswahl([])}>
            Auswahl aufheben
          </Button>
        </Flex>
      ) : null}

      {meldung ? (
        <Alert
          type="success"
          showIcon={false}
          title={meldung}
          closable
          onClose={() => setMeldung(null)}
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

      <Kartentabelle<BestellAnzeigeZeile>
        rowKey="id"
        aria-label="Bestellvorschlag"
        dataSource={gefiltert}
        filter={spaltenFilter}
        onFilter={setSpaltenFilter}
        leer={{
          nichts: "Kein Unterbestand und keine offene Bestellmarkierung.",
          gefiltert: "Kein Vorschlag passt zu Suche und Filter.",
          aktiv: sucheAktiv || filterAktiv(spaltenFilter),
        }}
        columns={spalten}
        karte={{ titel: "name", kennzeichen: ["status"] }}
        rowSelection={{
          selectedRowKeys: auswahl,
          // 44 px Trefferflaeche plus Zellenrand (`auswahlZelle`).
          columnWidth: 60,
          renderCell: auswahlZelle,
          preserveSelectedRowKeys: true,
          onChange: (schluessel) => {
            setAuswahl(schluessel.map(String));
            // „3 Artikel als bestellt markiert." neben einer frisch begonnenen
            // Auswahl liest sich wie eine Meldung ueber DIESE Auswahl.
            setMeldung(null);
          },
        }}
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
