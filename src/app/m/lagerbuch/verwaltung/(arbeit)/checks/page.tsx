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
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ChecksFilter } from "./ChecksFilter";
import {
  ChecksTabelle,
  type CheckAnzeigeZeile,
  type CheckErgebnisChip,
} from "./ChecksTabelle";
import { deckelText } from "./checksFilterLogik";

export const dynamic = "force-dynamic";

type CheckSuchparameter = {
  fz?: string;
  von?: string;
  bis?: string;
};

function ergebnisChips(zeile: CheckHistorieZeile): CheckErgebnisChip[] {
  const chips: CheckErgebnisChip[] = [];
  if (zeile.nachgefuellt > 0) {
    chips.push({
      schluessel: "nachgefuellt",
      text: `${zeile.nachgefuellt} aus Handlager nachgefüllt`,
      ton: "rot",
      zeichen: null,
    });
  }
  if (zeile.korrigiert > 0) {
    chips.push({
      schluessel: "korrigiert",
      text: `${zeile.korrigiert} korrigiert`,
      ton: "gelb",
      zeichen: null,
    });
  }
  if (zeile.offen > 0) {
    chips.push({
      schluessel: "offen",
      text: `${zeile.offen} fehlt weiterhin`,
      ton: "rot",
      zeichen: "warnung",
    });
  }
  if (zeile.geraeteAuffaellig > 0) {
    chips.push({
      schluessel: "geraete",
      text: `${zeile.geraeteAuffaellig} Gerät(e) auffällig`,
      ton: "rot",
      zeichen: null,
    });
  }
  if (zeile.flaschenAuffaellig > 0) {
    chips.push({
      schluessel: "flaschen",
      text: `${zeile.flaschenAuffaellig} Flasche(n) niedrig`,
      ton: "rot",
      zeichen: "sauerstoff",
    });
  }
  if (chips.length === 0) {
    chips.push({
      schluessel: "vollstaendig",
      text: "vollständig",
      ton: "ok",
      zeichen: null,
    });
  }
  return chips;
}

function anzeigeZeile(zeile: CheckHistorieZeile): CheckAnzeigeZeile {
  return {
    id: zeile.id,
    detailHref: `/verwaltung/checks/${zeile.id}`,
    fahrzeugName: zeile.fahrzeugName,
    abgeschlossenText: zeile.completedAt?.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
    }) ?? "—",
    ergebnisChips: ergebnisChips(zeile),
    /**
     * §11.5:10332 wörtlich: „die **Zeile** wird als ‚Ergebnis unlesbar'
     * gekennzeichnet statt als ‚0 Positionen'". Für einen zerstörten Datensatz
     * ist die Zahl selbst das Irreführende — sie sieht aus wie ein Check, bei
     * dem nichts zu tun war, und die Übersicht ist die Fläche, auf der jemand
     * nach Auffälligkeiten sucht.
     *
     * ⚠️ SCHLICHTER TEXT, kein Chip, kein Rot, kein Symbol: `colorError` ist
     * `colorPrimary` (§6.6.5), und Rot gehört in diesem Modul nie auf eine
     * Datenfläche. Die Warnung mit Begründung steht auf der Detailseite.
     *
     * ⚠️ Die Entscheidung fällt HIER, serverseitig. Über die RSC-Naht geht nur
     * der fertige Text — `CheckAnzeigeZeile` bekommt kein `unlesbar`-Flag, die
     * DTO-Zusicherung der Seite bleibt damit unverändert.
     */
    positionenText: zeile.unlesbar ? "unlesbar" : String(zeile.positionen),
  };
}

/**
 * REGIME B: URL-Filter werden vor der begrenzten Datenbankabfrage ausgewertet.
 * Die Client-Insel erhält ausschließlich rekursiv JSON-sichere Anzeige-DTOs.
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
      <ChecksTabelle
        zeilen={zeilen}
        leertext={hatFilter
          ? "Kein Check passt zu Fahrzeug und Zeitraum."
          : "Noch kein abgeschlossener Fahrzeug-Check."}
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
