"use client";

/**
 * DIE CHARGEN IM HANDLAGER ALS TABELLE (IDA-238) — mit Suche, Statusfilter und
 * einer Sammelaktion „Ausgewählte aussondern".
 *
 * ⚠️ HIER STAND BIS IDA-238 EINE KARTENLISTE (`ul`/`li`, `VerfallItem`), und
 * ihre Begruendung war: „eine Arbeitsliste am Regal, Zeile fuer Zeile; eine
 * Tabelle mit Filtern waere im Weg". Das hat nicht getragen, sobald die Liste
 * laenger wurde: jede abgelaufene Charge brachte einen eigenen roten Knopf mit
 * eigener Rueckfrage, und zehn Chargen aus einer Kiste waren zehn Durchgaenge.
 * Was von der Arbeitsliste bleibt, bleibt absichtlich:
 *
 *  - DIE REIHENFOLGE NACH DRINGLICHKEIT (DRK-339). Die Tabelle uebernimmt die
 *    Reihenfolge von `verfallListe` und setzt keine Anfangssortierung.
 *  - DIE LIEGEPLAETZE IN DER ZEILE (DRK-339), samt Zugangshinweis.
 *  - DER EINZELKNOPF MIT ORTSWAHL (`AussondernRow`). Nur er kann EINEN Schrank
 *    ausraeumen; die Sammelaktion raeumt je Charge alle gezeigten Liegeplaetze.
 *    ⚠️ DESHALB STEHT ER NUR NOCH AN CHARGEN MIT MEHR ALS EINEM LIEGEPLATZ.
 *    Liegt eine Charge an einem Ort, kann er nichts, was „ankreuzen →
 *    Ausgewählte aussondern" nicht auch kann — und zwoelf gleiche Knoepfe
 *    untereinander waren genau die Wand, die IDA-238 abbaut. Am Tablet
 *    (1024 px, Seitenleiste offen) schob die Spalte die Tabelle zudem ueber
 *    den Rand.
 *
 * ⚠️ DIE AMPEL STEHT EINMAL, ALS CHIP MIT TEXT. Die Plakette daneben trug
 * dieselbe Farbe ein zweites Mal und ohne eigenen Text; die Tabelle darunter
 * („An Einheiten … gemeldet") zeigt ihren Status genauso.
 *
 * ⚠️ AUSWAEHLBAR IST NUR, WAS SICH AUSSONDERN LAESST: abgelaufene Chargen. Die
 * Sammelaktion schickt je Charge die Orte, die auf dem Schirm stehen, nie eine
 * Menge — dieselbe Regel wie der Einzelknopf (Begruendung bei `gemeinterOrt`
 * in `AussondernRow.tsx`).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { Alert, Button, Flex, Modal, type TableProps } from "antd";
import {
  Kartentabelle,
  type FilterZustand,
  nachText,
  useEntprellt,
  wendeFilterAn,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { aussondernSammel } from "../../../_actions/aussondern";
import type { AmpelTon } from "../../../_lib/format";
import type { VerfallOrt } from "../../../_lib/lesepfade/verfall";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { auswahlZelle } from "../../../_ui/auswahlZelle";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import s from "../../../_ui/verwaltung.module.css";
import { AussondernRow } from "./AussondernRow";

/**
 * Serialisierbarer Vertrag der Insel. Der Ampelton ist schon aufgeloest
 * (`ampelTon` auf dem Server, Falle 6).
 */
export type HandlagerVerfallZeile = {
  chargeId: string;
  chargenNr: string;
  artikelName: string;
  /** "YYYY-MM" — sortiert wird hierueber, nie ueber `verfallText`. */
  verfall: string;
  verfallText: string;
  statusTon: AmpelTon;
  statusText: string;
  abgelaufen: boolean;
  rest: number;
  einheit: string;
  orte: VerfallOrt[];
};

export function bezeichnung(zeile: Pick<HandlagerVerfallZeile, "chargenNr" | "artikelName">): string {
  return `${zeile.chargenNr} · ${zeile.artikelName}`;
}

export function sucheTrifft(zeile: HandlagerVerfallZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === ""
    || falte([zeile.artikelName, zeile.chargenNr, ...zeile.orte.map((ort) => ort.name)].join(" "))
      .includes(suche);
}

const STATUS_FILTER = zustandsFilter<HandlagerVerfallZeile>([
  { wert: "abgelaufen", text: "abgelaufen", trifft: (zeile) => zeile.abgelaufen },
  { wert: "laeuftAb", text: "läuft ab", trifft: (zeile) => !zeile.abgelaufen },
]);

function liegeplaetze(zeile: HandlagerVerfallZeile): string {
  return zeile.orte.map((ort) => `${ort.name}: ${ort.menge} ${zeile.einheit}`).join(", ");
}

const SPALTEN: NonNullable<TableProps<HandlagerVerfallZeile>["columns"]> = [
  /*
   * ⚠️ VIER SPALTEN, NICHT SECHS. Charge und Monat standen erst je in einer
   * eigenen Spalte; am Tablet (1024 px, Seitenleiste offen) schob das
   * Liegeplatz und Knopf aus dem Bild, und die Tabelle scrollte waagerecht.
   * Die Charge steht jetzt unter dem Namen (gesucht wird sie trotzdem), der
   * Monat neben dem Status — dort, wo er die Ampel begruendet.
   */
  {
    title: "Artikel",
    dataIndex: "artikelName",
    key: "artikel",
    sorter: nachText<HandlagerVerfallZeile>((zeile) => zeile.artikelName),
    render: (name: string, zeile) => (
      // Gedeckelt wie `Zellentext`: ein langer Name bricht um, statt alle
      // Spalten dahinter aus dem Bild zu schieben.
      <span style={{ display: "inline-flex", flexDirection: "column", gap: SPACE.xs, maxWidth: "28ch" }}>
        <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{name}</span>
        <span className={s.fach} style={{ alignSelf: "flex-start" }}>{zeile.chargenNr}</span>
      </span>
    ),
  },
  {
    title: "Status",
    dataIndex: "statusText",
    key: "status",
    // Sortiert ueber den Monat ("YYYY-MM"), nie ueber den Anzeigetext.
    sorter: nachText<HandlagerVerfallZeile>((zeile) => zeile.verfall),
    filters: STATUS_FILTER.filters,
    onFilter: STATUS_FILTER.onFilter,
    render: (text: string, zeile) => (
      // 6 liegt nicht auf der SPACE-Skala; bleibt Literal.
      <Flex gap={6} wrap align="center">
        <Chip ton={zeile.statusTon} zeichen={zeile.abgelaufen ? "warnung" : "verfall"}>
          {text}
        </Chip>
        {/* Nur bei „abgelaufen" — die anderen Texte nennen den Monat schon
            („fällig 11/26"), ein zweites Mal waere er Rauschen. */}
        {zeile.abgelaufen ? <span style={SCHRIFT.mono}>{zeile.verfallText}</span> : null}
      </Flex>
    ),
  },
  {
    title: "Liegeplatz",
    dataIndex: "orte",
    key: "orte",
    render: (orte: VerfallOrt[], zeile) => (
      // ⚠️ TEXT JE ZEILE, KEINE GRAUEN CHIPS MEHR (IDA-238): ein Chip bricht
      // nicht um (`white-space: nowrap`) und lief auf dem Telefon ueber den
      // Kartenrand; und neben dem Status-Chip war er eine zweite Pille ohne
      // zweite Bedeutung. Der Zugangshinweis bleibt am Ort, als natives
      // `title` mit Zeichen (Ruling A15, wie zuvor am Chip).
      <span style={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 280 }}>
        {orte.map((ort) => (
          <span
            key={ort.id}
            title={ort.zugangshinweis ?? undefined}
            style={{ overflowWrap: "anywhere" }}
          >
            {ort.name}: {ort.menge} {zeile.einheit}
            {ort.zugangshinweis ? (
              <span style={{ marginInlineStart: SPACE.xs, verticalAlign: "middle" }}>
                <Ikone name="info" groesse={12} />
              </span>
            ) : null}
          </span>
        ))}
        {/* ⚠️ DIE SUMME NUR, WENN SIE ETWAS HINZUFUEGT (DRK-339). Bei EINEM
            Liegeplatz nennt die Zeile dieselbe Zahl schon, mit dem Ort dazu. */}
        {orte.length > 1 ? (
          <span style={SCHRIFT.neben}>Rest {zeile.rest} {zeile.einheit}</span>
        ) : null}
      </span>
    ),
  },
  {
    title: "",
    key: "aktion",
    render: (_wert: unknown, zeile) => (zeile.abgelaufen && zeile.orte.length > 1 ? (
      <AussondernRow
        chargeId={zeile.chargeId}
        bezeichnung={bezeichnung(zeile)}
        orte={zeile.orte}
        einheit={zeile.einheit}
      />
    ) : null),
  },
];

export function HandlagerVerfallTabelle({ zeilen }: { zeilen: HandlagerVerfallZeile[] }) {
  const [suche, setSuche] = useState("");
  const sucheNachlauf = useEntprellt(suche);
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [rueckfrageOffen, setRueckfrageOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  // Verriegelt zwei schnelle Bestaetigungen, bevor React den Pending-Zustand
  // sichtbar gemacht hat — dieselbe Bauform wie `AussondernRow`.
  const sammelLaeuft = useRef(false);

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );
  const angezeigt = wendeFilterAn(gefiltert, SPALTEN, spaltenFilter);

  /**
   * Die Auswahl gegen `zeilen` aufgeloest, nie gegen die angezeigte Menge: sie
   * ueberlebt Suche und Filter. Eine Charge, die inzwischen ausgesondert ist,
   * steht nach dem Neuladen nicht mehr in `zeilen` und faellt so von selbst
   * heraus — die Rueckfrage nennt nur, was noch dasteht.
   */
  const ausgewaehlt = useMemo(() => {
    const menge = new Set(auswahl);
    return zeilen.filter((zeile) => zeile.abgelaufen && menge.has(zeile.chargeId));
  }, [zeilen, auswahl]);

  function sammelBestaetigen(): void {
    if (sammelLaeuft.current || ausgewaehlt.length === 0) return;
    sammelLaeuft.current = true;
    setFehler(null);
    setMeldung(null);
    // Die Namen VOR dem Aufruf festhalten: nach dem Neuladen stehen die
    // ausgesonderten Zeilen nicht mehr in `zeilen`.
    const namen = new Map(ausgewaehlt.map((zeile) => [zeile.chargeId, bezeichnung(zeile)]));
    const chargenAuftrag = ausgewaehlt.map((zeile) => ({
      chargeId: zeile.chargeId,
      lagerortIds: zeile.orte.map((ort) => ort.id),
    }));
    start(async () => {
      try {
        const ergebnis = await aussondernSammel({ chargen: chargenAuftrag });
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        const { ausgesondert, uebersprungen } = ergebnis.wert;
        setRueckfrageOffen(false);
        setAuswahl([]);
        if (ausgesondert.length > 0) {
          setMeldung(ausgesondert.length === 1
            ? "1 Charge ausgesondert."
            : `${ausgesondert.length} Chargen ausgesondert.`);
        }
        if (uebersprungen.length > 0) {
          setFehler(`Nicht ausgesondert: ${uebersprungen
            .map((u) => `${namen.get(u.chargeId) ?? u.chargeId} (${u.grund})`)
            .join("; ")}`);
        }
      } catch {
        setFehler("Die Chargen konnten nicht ausgesondert werden.");
      } finally {
        sammelLaeuft.current = false;
      }
    });
  }

  const anzahlText = ausgewaehlt.length === 1 ? "1 Charge" : `${ausgewaehlt.length} Chargen`;

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld wert={suche} onWert={setSuche} platzhalter="Artikel, Charge oder Ort suchen…" />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
      </Flex>

      {ausgewaehlt.length > 0 ? (
        <Flex
          gap={SPACE.md}
          align="center"
          wrap
          data-testid="verfall-sammelleiste"
          style={{ marginBlockEnd: SPACE.md }}
        >
          <span style={SCHRIFT.feldname}>{anzahlText} ausgewählt</span>
          <Button type="primary" onClick={() => setRueckfrageOffen(true)}>
            Ausgewählte aussondern
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
        // `warning`, nicht `error`: Rot ist in diesem Modul fachlich belegt
        // (Falle 3).
        <Alert type="warning" showIcon={false} title={fehler} style={{ marginBlockEnd: SPACE.md }} />
      ) : null}

      <Kartentabelle<HandlagerVerfallZeile>
        rowKey="chargeId"
        aria-label="Chargen im Handlager"
        dataSource={gefiltert}
        columns={SPALTEN}
        filter={spaltenFilter}
        onFilter={setSpaltenFilter}
        // Der Status steht auf der Karte als Merkmal, nicht oben rechts: dort
        // nahm er dem Namen die halbe Breite, und der brach Silbe fuer Silbe um.
        karte={{ titel: "artikel", aktionen: "aktion" }}
        leer={{
          nichts: "Keine auffällige Charge im Handlager.",
          gefiltert: "Keine Charge passt zu Suche und Filter.",
          aktiv: sucheNachlauf.trim() !== "" || Object.values(spaltenFilter).some((w) => w?.length),
        }}
        rowSelection={{
          selectedRowKeys: auswahl,
          // 44 px Trefferflaeche plus Zellenrand (`auswahlZelle`).
          columnWidth: 60,
          renderCell: auswahlZelle,
          preserveSelectedRowKeys: true,
          onChange: (schluessel) => {
            setAuswahl(schluessel.map(String));
            setMeldung(null);
          },
          getCheckboxProps: (zeile) => ({
            disabled: !zeile.abgelaufen,
            "aria-label": `${bezeichnung(zeile)} auswählen`,
          }),
        }}
      />

      <Modal
        open={rueckfrageOffen}
        title={`${anzahlText} aussondern?`}
        okText={`${anzahlText} aussondern`}
        cancelText="Abbrechen"
        okButtonProps={{ loading: laeuft, disabled: ausgewaehlt.length === 0 }}
        onOk={sammelBestaetigen}
        onCancel={() => setRueckfrageOffen(false)}
      >
        {/* ⚠️ „Aussonderung", NICHT „Korrektur" (DRK-344) — im Journal steht
            dieses Wort, und dort sucht man die eigene Buchung. */}
        <p>Bucht den Handlager-Rest dieser Chargen als Aussonderung aus — je Charge eine eigene Buchung im Journal:</p>
        <ul data-testid="verfall-sammelliste" style={{ margin: 0, paddingInlineStart: SPACE.lg }}>
          {ausgewaehlt.map((zeile) => (
            <li key={zeile.chargeId}>
              <strong>{bezeichnung(zeile)}</strong>
              <span style={SCHRIFT.neben}> — {liegeplaetze(zeile)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
