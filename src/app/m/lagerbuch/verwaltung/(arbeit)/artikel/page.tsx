import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { artikelListenFilterAus } from "../../../_lib/artikelFilter";
import { verfallStatus, verfallSchwellen } from "../../../_lib/domain/verfall";
import { chargeText } from "../../../_lib/format";
import { artikelListe } from "../../../_lib/lesepfade/artikel";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { ausgeblendeteKategorienVon } from "../../../_lib/lesepfade/kategorien";
import { einWert } from "../../../_lib/suchparameter";
import { requireLagerbuchAdmin } from "../../../_lib/zugang";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ArtikelTable, type ArtikelAnzeigeZeile } from "./ArtikelTable";

export const dynamic = "force-dynamic";

function artikelAnzeigeZeilen(db: DB, jetzt: Date): ArtikelAnzeigeZeile[] {
  const schwellen = verfallSchwellen();
  return artikelListe(db, { inklInaktiv: true }, jetzt).map((zeile) => {
    const status = zeile.naechsteCharge
      ? verfallStatus(zeile.naechsteCharge.verfall, schwellen, jetzt)
      : null;
    return {
      ...zeile,
      naechsteAmpel: status?.ampel ?? null,
      naechsteAblaufText: status && zeile.naechsteCharge
        ? chargeText(status, zeile.naechsteCharge.verfall)
        : null,
    };
  });
}

/**
 * `userId` ist `viewer.sub` aus der Sitzung (DRK-294) — die ausgeblendeten
 * Kategorien gehoeren dem Konto, das die Seite aufruft, und keinem anderen.
 */
export type ArtikelSeitenParameter = {
  artikel?: string | string[];
  filter?: string | string[];
};

/**
 * IDA-239 — DIE ADRESSE KANN EINEN ARTIKEL ÖFFNEN UND EINEN FILTER SETZEN.
 *
 * `?artikel=<id>` öffnet die Schublade dieses Artikels (Links aus der
 * Übersicht, dem Journal …); eine unbekannte Kennung öffnet nichts, statt eine
 * leere Schublade zu zeigen. `?filter=unter-mindest|charge-kritisch` setzt den
 * passenden Spaltenfilter vor (`_lib/artikelFilter.ts`).
 */
export function artikelSeitenInhalt(
  db: DB,
  jetzt: Date,
  userId: string,
  parameter: ArtikelSeitenParameter = {},
): ReactNode {
  const fahrzeuge = fahrzeugListe(db)
    .filter((fahrzeug) => fahrzeug.aktiv)
    .map((fahrzeug) => ({
      id: fahrzeug.id,
      name: fahrzeug.name,
      kennung: fahrzeug.kennung,
      // DRK-309: macht die Zielwahl nach „tasche" durchsuchbar.
      einheitenart: fahrzeug.einheitenart,
    }));

  const zeilen = artikelAnzeigeZeilen(db, jetzt);
  const gewuenscht = einWert(parameter.artikel);
  const startArtikel = gewuenscht !== undefined && zeilen.some((zeile) => zeile.id === gewuenscht)
    ? gewuenscht
    : undefined;

  return (
    <>
      <SeitenKopf
        titel="Artikel & Bestand"
        beschreibung={
          "Handlager · Klick auf eine Zeile öffnet Chargen, Buchung und Stammdaten. "
          + "Kreuze mehrere an, um sie gemeinsam zu bearbeiten."
        }
      />
      <ArtikelTable
        zeilen={zeilen}
        startArtikel={startArtikel}
        startFilter={artikelListenFilterAus(einWert(parameter.filter))}
        fahrzeuge={fahrzeuge}
        ausgeblendeteKategorien={ausgeblendeteKategorienVon(db, userId)}
      />
    </>
  );
}

export default async function ArtikelSeite({
  searchParams,
}: {
  searchParams: Promise<ArtikelSeitenParameter>;
}) {
  const viewer = await requireLagerbuchAdmin();
  return artikelSeitenInhalt(getDb(), new Date(), viewer.sub, await searchParams);
}
