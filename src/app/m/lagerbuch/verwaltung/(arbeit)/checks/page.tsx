import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { zeitraumAus } from "../../../_lib/format";
import { CHECK_GRENZE } from "../../../_lib/grenzen";
import {
  checkHistorie,
  type CheckHistorieZeile,
} from "../../../_lib/lesepfade/checks";
import { fahrzeugListe } from "../../../_lib/lesepfade/fahrzeuge";
import { requireLagerbuchAdmin } from "../../../_lib/zugang";
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
  /**
   * DRK-196 — „auch laufende Checks zeigen". `"1"` oder nichts; jeder andere
   * Wert zaehlt als nichts. Eine Zeichenkette und kein Boolescher Wert, weil
   * der Filter ueber die Adresszeile laeuft (`useUrlFilter`).
   */
  offen?: string;
};

function ergebnisChips(zeile: CheckHistorieZeile): CheckErgebnisChip[] {
  /*
   * ⛔ EIN LAUFENDER CHECK IST NICHT „vollständig" (DRK-196, Codex-Review zu
   * PR #210, P2). Ohne diesen Zweig faellt er durch die ganze Kette: alle
   * Zaehler sind 0, kein einziger Chip wird geschoben, und der Rueckfall unten
   * setzt den GRUENEN „vollständig"-Chip. Die Zeile saegte dann in der einen
   * Spalte „läuft noch" und in der naechsten gruen „vollständig" — derselbe
   * Widerspruch wie auf der Detailseite, nur eine Ebene hoeher.
   *
   * ⚠️ `zeile.completedAt`, NICHT `zeile.offen`: letzteres ist eine ZAHL (die
   * weiterhin fehlenden Teile), kein Merkmal des Zustands. Die Namensgleichheit
   * ist eine Falle, und sie steht hier ausgeschrieben, damit niemand sie stellt.
   *
   * ⚠️ `grau`, nicht `gelb`: ein laufender Check ist kein Befund, dem jemand
   * nachgeht — dieselbe Entscheidung wie beim `info`-Ton der Detailseite.
   */
  if (zeile.completedAt === null) {
    return [{ schluessel: "laeuft", text: "läuft noch", ton: "grau", zeichen: null }];
  }
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
      // „wechseln", nicht „niedrig" (DRK-308): dieselbe Bedingung heisst seit
      // dem konfigurierbaren Grenzwert ueberall gleich — Flaschenliste, Kachel,
      // Check und Druckbogen. Zwei Woerter fuer eine Lage laesst offen, ob es
      // zwei Lagen sind.
      text: `${zeile.flaschenAuffaellig} Flasche(n) wechseln`,
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
    fahrzeugId: zeile.fahrzeugId,
    fahrzeugName: zeile.fahrzeugName,
    fahrzeugKennung: zeile.fahrzeugKennung,
    fahrzeugEinheitenart: zeile.fahrzeugEinheitenart,
    /*
     * ⚠️ „läuft noch" STATT EINES GEDANKENSTRICHS (DRK-196). Ein Strich liest
     * sich wie ein fehlender Wert — als haette jemand vergessen, das Datum zu
     * erfassen. Der Zustand ist aber ein anderer: der Check hat noch KEIN
     * Ergebnis (`ergebnis IS NULL`, §4.4), und das ist vom Schema vorgesehen.
     *
     * ⛔ NICHT „unvollständig" UND NICHT „fehlerhaft": das sind die Woerter der
     * beiden ANDEREN Ursachen (`altFormat`, „unlesbar"), und drei Lagen unter
     * zwei Woertern zu fuehren ist genau die Vermischung, die der Vorgang
     * verhindern soll. Die Zeile erscheint ohnehin nur mit eingeschaltetem
     * Schalter, ist hier also nie eine Ueberraschung.
     */
    abgeschlossenText: zeile.completedAt?.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
    }) ?? "läuft noch",
    /**
     * ⚠️ DER ROHWERT REIST MIT, WEIL DIE SPALTE DANACH SORTIERT.
     * `abgeschlossenText` ist „14.9.2026, 08:12:00" und ordnete als Zeichenkette
     * den 2. Oktober vor den 14. September. Leer bleibt leer: eine Zeile ohne
     * Abschluss traegt `null` und landet aufsteigend hinten.
     */
    abgeschlossenIso: zeile.completedAt?.toISOString() ?? null,
    /**
     * DRK-311 — WER DEN CHECK ERFASST HAT. Die Aufloesung von Kennung zu Name
     * faellt im Lesepfad (`lesepfade/checks.ts`); ueber die RSC-Naht geht nur
     * der fertige Text. Ein leerer Wert ist unmoeglich — der Aufloeser faellt
     * im schlechtesten Fall auf die rohe Kennung zurueck.
     */
    werText: zeile.wer,
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
    /*
     * ⚠️ DREI FAELLE, DREI TEXTE. Eine `0` ist eine Aussage — sie behauptet,
     * gezaehlt worden zu sein. Fuer `unlesbar` stand das Wort hier schon; fuer
     * den laufenden Check fehlte es (Codex-Review zu PR #210, P2).
     */
    positionenText: zeile.completedAt === null
      ? "noch keine"
      : zeile.unlesbar ? "unlesbar" : String(zeile.positionen),
  };
}

/**
 * REGIME B: URL-Filter werden vor der begrenzten Datenbankabfrage ausgewertet.
 * Die Client-Insel erhält ausschließlich rekursiv JSON-sichere Anzeige-DTOs.
 */
export function checksInhalt(
  db: DB,
  suchparameter: CheckSuchparameter,
): ReactNode {
  const fahrzeuge = fahrzeugListe(db)
    .map((fahrzeug) => ({
      id: fahrzeug.id,
      name: fahrzeug.name,
      kennung: fahrzeug.kennung,
      // DRK-309: macht die Zielwahl nach „tasche" durchsuchbar.
      einheitenart: fahrzeug.einheitenart,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const fz = fahrzeuge.some((fahrzeug) => fahrzeug.id === suchparameter.fz)
    ? suchparameter.fz ?? ""
    : "";
  const zeitraum = zeitraumAus(suchparameter.von, suchparameter.bis);
  const von = zeitraum.von ? suchparameter.von?.trim() ?? "" : "";
  const bis = zeitraum.bis ? suchparameter.bis?.trim() ?? "" : "";
  // DRK-196: genau `"1"`, nicht „irgendein Wert ist wahr" — ein `?offen=0` aus
  // einem kopierten Link setzte den Schalter sonst, statt ihn zu loeschen.
  const mitOffenen = suchparameter.offen === "1";
  const historie = checkHistorie(db, {
    fahrzeugId: fz || undefined,
    von: zeitraum.von,
    bis: zeitraum.bis,
    grenze: CHECK_GRENZE,
    mitOffenen,
  });
  const zeilen = historie.zeilen.map(anzeigeZeile);
  /*
   * ⚠️ DER SCHALTER ZAEHLT HIER NICHT MIT (DRK-196). `hatFilter` entscheidet
   * allein den Leertext „passt zu Einheit und Zeitraum" — und ein eingeschalteter
   * Offen-Schalter schraenkt nichts ein, er WEITET. Zaehlte er mit, stuende bei
   * leerer Liste „Kein Check passt zu Einheit und Zeitraum", obwohl weder das
   * eine noch das andere gesetzt ist.
   */
  const hatFilter = Boolean(fz || von || bis);

  return (
    <>
      <SeitenKopf
        titel="Checks an Fahrzeugen und Taschen"
        beschreibung={deckelText(zeilen.length, historie.mehrVorhanden)}
      />
      <ChecksFilter
        fz={fz}
        von={von}
        bis={bis}
        mitOffenen={mitOffenen}
        fahrzeuge={fahrzeuge}
        hinweise={zeitraum.hinweise}
      />
      <ChecksTabelle
        zeilen={zeilen}
        /*
          DRK-309: NEUTRAL. Beide Leertexte sprechen ueber die ganze Liste,
          nicht ueber eine bestimmte Einheit — und die Liste mischt Fahrzeuge
          und Taschen. „Noch kein abgeschlossener Fahrzeug-Check" waere unter
          einem gesetzten Taschenfilter sogar nachweislich falsch.
        */
        leertext={hatFilter
          ? "Kein Check passt zu Einheit und Zeitraum."
          : "Noch kein abgeschlossener Check."}
      />
    </>
  );
}

export default async function ChecksSeite({
  searchParams,
}: {
  searchParams: Promise<CheckSuchparameter>;
}) {
  await requireLagerbuchAdmin();
  return checksInhalt(getDb(), await searchParams);
}
