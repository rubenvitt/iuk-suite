import { Flex, Table, type TableProps } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "../../../_db/client";
import { zeitraumAus } from "../../../_lib/format";
import { CHECK_GRENZE } from "../../../_lib/grenzen";
import type { Leser } from "../../../_lib/lesepfade/bestand";
import {
  checkHistorie,
  type CheckHistorieZeile,
} from "../../../_lib/lesepfade/checks";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import s from "../../../_ui/verwaltung.module.css";
import { ChecksFilter } from "./ChecksFilter";
import { deckelText } from "./checksFilterLogik";

export const dynamic = "force-dynamic";

type CheckSuchparameter = {
  fz?: string;
  von?: string;
  bis?: string;
};

type CheckAnzeigeZeile = {
  id: string;
  fahrzeug: ReactNode;
  abgeschlossen: ReactNode;
  ergebnis: ReactNode;
  positionen: ReactNode;
};

const SPALTEN = [
  { title: "Fahrzeug", dataIndex: "fahrzeug", key: "fahrzeug" },
  { title: "Abgeschlossen", dataIndex: "abgeschlossen", key: "abgeschlossen" },
  { title: "Ergebnis", dataIndex: "ergebnis", key: "ergebnis" },
  {
    title: "Positionen",
    dataIndex: "positionen",
    key: "positionen",
    align: "right" as const,
  },
] satisfies TableProps<CheckAnzeigeZeile>["columns"];

function ergebnisZelle(zeile: CheckHistorieZeile): ReactNode {
  const anzahlAuffaellig = zeile.nachgefuellt
    + zeile.korrigiert
    + zeile.offen
    + zeile.geraeteAuffaellig
    + zeile.flaschenAuffaellig;

  return (
    <Flex gap={6} wrap>
      {zeile.nachgefuellt > 0 ? (
        <Chip ton="rot">{zeile.nachgefuellt} aus Handlager nachgefüllt</Chip>
      ) : null}
      {zeile.korrigiert > 0 ? (
        <Chip ton="gelb">{zeile.korrigiert} korrigiert</Chip>
      ) : null}
      {zeile.offen > 0 ? (
        <Chip ton="rot" zeichen="warnung">{zeile.offen} fehlt weiterhin</Chip>
      ) : null}
      {zeile.geraeteAuffaellig > 0 ? (
        <Chip ton="rot">{zeile.geraeteAuffaellig} Gerät(e) auffällig</Chip>
      ) : null}
      {zeile.flaschenAuffaellig > 0 ? (
        <Chip ton="rot" zeichen="sauerstoff">
          {zeile.flaschenAuffaellig} Flasche(n) niedrig
        </Chip>
      ) : null}
      {anzahlAuffaellig === 0 ? <Chip ton="ok">vollständig</Chip> : null}
    </Flex>
  );
}

function anzeigeZeile(zeile: CheckHistorieZeile): CheckAnzeigeZeile {
  return {
    id: zeile.id,
    fahrzeug: (
      <Link
        href={`/verwaltung/checks/${zeile.id}`}
        style={{ fontWeight: 600 }}
      >
        {zeile.fahrzeugName}
      </Link>
    ),
    abgeschlossen: (
      <span className={s.jts}>
        {zeile.completedAt?.toLocaleString("de-DE", {
          timeZone: "Europe/Berlin",
        }) ?? "—"}
      </span>
    ),
    ergebnis: ergebnisZelle(zeile),
    positionen: <span style={SCHRIFT.mono}>{zeile.positionen}</span>,
  };
}

/**
 * REGIME B: URL-Filter werden vor der begrenzten Datenbankabfrage ausgewertet.
 * Die Anzeigezeilen enthalten keine Dates und keine Tabellenfunktionen.
 */
export function checksInhalt(
  db: Leser,
  suchparameter: CheckSuchparameter,
): ReactNode {
  const fahrzeuge = fahrzeugListe(db)
    .map((fahrzeug) => ({
      id: fahrzeug.id,
      name: fahrzeug.name,
      kennung: fahrzeug.kennung,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const fz = fahrzeuge.some((fahrzeug) => fahrzeug.id === suchparameter.fz)
    ? suchparameter.fz ?? ""
    : "";
  const zeitraum = zeitraumAus(suchparameter.von, suchparameter.bis);
  const von = zeitraum.von ? suchparameter.von?.trim() ?? "" : "";
  const bis = zeitraum.bis ? suchparameter.bis?.trim() ?? "" : "";
  const historie = checkHistorie(db, {
    fahrzeugId: fz || undefined,
    von: zeitraum.von,
    bis: zeitraum.bis,
    grenze: CHECK_GRENZE,
  });
  const zeilen = historie.zeilen.map(anzeigeZeile);
  const hatFilter = Boolean(fz || von || bis);

  return (
    <>
      <SeitenKopf
        titel="Fahrzeug-Checks"
        beschreibung={deckelText(zeilen.length, historie.mehrVorhanden)}
      />
      <ChecksFilter
        fz={fz}
        von={von}
        bis={bis}
        fahrzeuge={fahrzeuge}
        hinweise={zeitraum.hinweise}
      />
      <Table<CheckAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Fahrzeug-Checks"
        dataSource={zeilen}
        locale={{
          emptyText: hatFilter
            ? "Kein Check passt zu Fahrzeug und Zeitraum."
            : "Noch kein abgeschlossener Fahrzeug-Check.",
        }}
        columns={SPALTEN}
      />
    </>
  );
}

export default async function ChecksSeite({
  searchParams,
}: {
  searchParams: Promise<CheckSuchparameter>;
}) {
  return checksInhalt(getDb(), await searchParams);
}
