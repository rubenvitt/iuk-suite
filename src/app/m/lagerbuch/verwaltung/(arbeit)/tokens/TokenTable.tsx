"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  nachDatum,
  nachJaNein,
  nachText,
  useEntprellt,
  zustandsFilter,
  type Filterwert,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { setTokenAktiv } from "../../../_actions/tokens";
import { falte } from "../../../_lib/suche";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";

const STATUS_FEHLER = "Zugangs-Code-Status konnte nicht geändert werden.";

export type ZielFilter = "fahrzeug" | "artikel" | "liste";

export type TokenAnzeigeZeile = {
  id: string;
  code: string;
  label: string;
  aktiv: boolean;
  lastUsedText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  lastUsedIso: string | null;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
  zielName: string | null;
};

export function zielVon(z: TokenAnzeigeZeile): ZielFilter {
  return z.zielTyp ?? "liste";
}

/** SUCHFELDMENGE 6 VON 6: Code · Label · Zielname. */
export function sucheTrifft(z: TokenAnzeigeZeile, begriff: string): boolean {
  const nadel = falte(begriff.trim());
  return !nadel || falte(`${z.code} ${z.label} ${z.zielName ?? ""}`).includes(nadel);
}

const ZIEL_TEXT: Record<ZielFilter, string> = {
  fahrzeug: "Fahrzeug",
  artikel: "Artikel",
  liste: "Artikel-Liste",
};

/**
 * DER HAKEN „gesperrt" UND DIE ZIEL-`Checkbox.Group` SIND SPALTENFILTER
 * GEWORDEN. Beides waren Praedikate ueber der Zeile, und ein Praedikat ueber
 * der Zeile ist ein Spaltenfilter; sie sitzen jetzt im Kopf der Spalte, deren
 * Chip sie meinen.
 */
const STATUS_FILTER = zustandsFilter<TokenAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "gesperrt", text: "gesperrt", trifft: (zeile) => !zeile.aktiv },
]);

/**
 * ENTSCHEIDUNG 8-F (§8.3): Der Namensraum der Zugangs-Codes ist gesperrt — ein
 * Code kann nur noch gesperrt, nie mehr gelöscht werden. Hier stand bis T160
 * ein `LoeschButton art="token"` samt Adaptern auf `pruefeLoeschbar`,
 * `loescheElement` und `deaktiviereElement`. Der AUFRUF ist entfallen; übrig
 * bleibt der Knopf „Sperren" / „Reaktivieren" auf `setTokenAktiv`.
 *
 * ⚠️ NICHT der Dialog: `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx`
 * bleiben unangetastet und tragen weiterhin Artikel, Fahrzeuge, BZ-Geräte,
 * O₂-Flaschen, Geräte und Vorlagen.
 *
 * ⚠️ Ankündigungspflicht (Runbook R34): Wer heute einen versehentlich
 * angelegten Code löscht, findet den Knopf nicht mehr. `pruefeLoeschbar`
 * lehnt serverseitig weiterhin benannt ab und nennt das Sperren als Weg
 * (`_lib/tokenForm.ts`, `TOKEN_LOESCHGRUND`) — diese Seite fragt nur nicht
 * mehr danach.
 */
export function TokenTable({ zeilen }: { zeilen: TokenAnzeigeZeile[] }) {
  const [suche, setSuche] = useState("");
  // Das FELD bleibt unentprellt, entprellt wird die Ableitung.
  const sucheNachlauf = useEntprellt(suche);
  const [spaltenFilterAktiv, setSpaltenFilterAktiv] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [sucheNachlauf, zeilen],
  );

  const hatFilter = sucheNachlauf.trim() !== "" || spaltenFilterAktiv;

  function statusAendern(zeile: TokenAnzeigeZeile): void {
    setFehler(null);
    startTransition(async () => {
      try {
        const ergebnis = await setTokenAktiv({ id: zeile.id, aktiv: !zeile.aktiv });
        if (!ergebnis.ok) setFehler(STATUS_FEHLER);
      } catch {
        setFehler(STATUS_FEHLER);
      }
    });
  }

  const spalten: TableProps<TokenAnzeigeZeile>["columns"] = [
    {
      title: "Code",
      dataIndex: "code",
      sorter: nachText<TokenAnzeigeZeile>((zeile) => zeile.code),
      render: (code: string) => (
        <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{code}</span>
      ),
    },
    {
      title: "Bezeichnung",
      dataIndex: "label",
      sorter: nachText<TokenAnzeigeZeile>((zeile) => zeile.label),
    },
    {
      title: "Ziel",
      dataIndex: "zielTyp",
      // Die Zielart ist fachlich fest (drei Werte) und stammt deshalb
      // ausnahmsweise nicht aus den Daten.
      filters: [
        { text: ZIEL_TEXT.fahrzeug, value: "fahrzeug" },
        { text: ZIEL_TEXT.artikel, value: "artikel" },
        { text: ZIEL_TEXT.liste, value: "liste" },
      ],
      onFilter: (wert: Filterwert, zeile: TokenAnzeigeZeile) =>
        zielVon(zeile) === wert,
      render: (_wert: unknown, zeile) => {
        const ziel = zielVon(zeile);
        return (
          <Chip
            ton="grau"
            zeichen={ziel === "fahrzeug"
              ? "fahrzeug"
              : ziel === "artikel" ? "objekt" : "liste"}
          >
            {ziel === "liste" ? ZIEL_TEXT.liste : (zeile.zielName ?? "—")}
          </Chip>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "aktiv",
      sorter: nachJaNein<TokenAnzeigeZeile>((zeile) => zeile.aktiv),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (aktiv: boolean) => (
        <Chip ton={aktiv ? "ok" : "rot"}>{aktiv ? "aktiv" : "gesperrt"}</Chip>
      ),
    },
    {
      title: "Zuletzt benutzt",
      dataIndex: "lastUsedText",
      // ⚠️ Ueber `lastUsedIso`, nie ueber den Anzeigetext — Begruendung an der
      // Zeilenquelle (`tokens/page.tsx`).
      sorter: nachDatum<TokenAnzeigeZeile>((zeile) => zeile.lastUsedIso),
      render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
    },
    {
      title: "",
      key: "aktionen",
      render: (_wert: unknown, zeile) => (
        <Flex gap={SPACE.sm} align="center">
          {/* KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
              docs/design/README.md) ist mit der Arbeitsdichte gefallen --
              44px ist hier bereits die volle wie die halbe Bediendichte,
              "small" unterbietet die Mindesttapflaeche (WCAG 2.5.5). */}
          {/* EINSTEIGEN: derselbe Weg wie der gescannte QR (`t/[code]/route.ts`),
              also echte Einloesung mit Helfer-Sitzung, `lastUsedAt` und
              Protokollzeile. Neuer Tab, damit die Verwaltung offen bleibt.
              Nur fuer AKTIVE Codes: ein gesperrter landete am Gate und
              buchte einen Fehlversuch in den geteilten Eimer. */}
          {zeile.aktiv ? (
            <Button
              href={`/t/${encodeURIComponent(zeile.code)}`}
              target="_blank"
              rel="noopener noreferrer"
              icon={<Ikone name="pfeil-rechts" groesse={16} />}
            >
              Einsteigen
            </Button>
          ) : null}
          <Button
            disabled={laeuft}
            onClick={() => statusAendern(zeile)}
          >
            {zeile.aktiv ? "Sperren" : "Reaktivieren"}
          </Button>
        </Flex>
      ),
    },
  ];

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Code, Bezeichnung oder Ziel suchen…"
        />
        {/* Zaehlt die Freitextsuche, nicht die Spaltenfilter. */}
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
      </Flex>

      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}

      <Datentabelle<TokenAnzeigeZeile>
        rowKey="id"
        aria-label="Zugangs-Codes"
        dataSource={gefiltert}
        onChange={(_seite, filter) => {
          setSpaltenFilterAktiv(
            Object.values(filter).some((werte) => (werte?.length ?? 0) > 0),
          );
        }}
        locale={{
          emptyText: hatFilter
            ? "Kein Code passt zu Suche und Filter."
            : "Noch keine Codes. Lege oben den ersten an.",
        }}
        columns={spalten}
      />
    </>
  );
}
