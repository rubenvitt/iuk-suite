import { Button } from "antd";
import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import {
  ZAEHLORT_ALLE,
  zaehlOrtAus,
  zaehlOrtBeschreibung,
  zaehlOrtLabel,
  type ZaehlOrt,
} from "../../../_lib/inventurOrt";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import { inventurZeilen } from "../../../_lib/lesepfade/inventur";
import { handlagerSchraenke, zaehlBereich } from "../../../_lib/lesepfade/orte";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

/**
 * ⚠️ `string[]` STEHT HIER MIT ABSICHT (Codex-Befund zu DRK-337). Nexts
 * `SearchParams` ist `string | string[] | undefined`; ein enger Typ an dieser
 * Stelle waere eine Behauptung ueber die Laufzeit, die `?ort=a&ort=b` widerlegt
 * — und zwar mit HTTP 500, ohne dass `typecheck` oder `build` etwas melden.
 * Was daraus folgt, entscheidet `zaehlOrtAus`.
 */
type InventurSuchparameter = { ort?: string | string[] };

export function inventurSeitenInhalt(
  db: DB, now: Date = new Date(), suchparameter: InventurSuchparameter = {},
): ReactNode {
  /*
   * DRK-337 — DER GEWAEHLTE ORT STEHT IN DER URL, nicht im Zustand der Insel.
   * Die Erwartungszahl jeder Zeile kommt aus der Datenbank; eine Auswahl, die
   * nur im Browser stuende, muesste sie nachladen oder raten. `force-dynamic`
   * steht ohnehin schon oben.
   */
  const gewuenscht = zaehlOrtAus(suchparameter.ort);
  const bereich = zaehlBereich(db, gewuenscht);
  /*
   * ⚠️ EIN UNBEKANNTER ORT FAELLT AUF DEN GANZEN HANDLAGER ZURUECK, wie
   * `checks/page.tsx` mit einem unbekannten Fahrzeug. Die Alternative — eine
   * Fehlerseite — nuetzte niemandem: die haeufigste Ursache ist ein Schrank,
   * den jemand inzwischen umgehaengt hat, und dann ist die Vorgabe richtig.
   * DIE ACTION IST DABEI STRENGER (`ortUnbekannt`): dort wuerde still gegen
   * einen anderen Bestand gebucht als den gezaehlten.
   */
  const ortId = bereich ? gewuenscht : null;
  const schraenke = handlagerSchraenke(db);
  const ortName = ortId === null ? undefined : schraenke.find((o) => o.id === ortId)?.name;
  /*
   * ⚠️ STILLGELEGTE SCHRAENKE STEHEN NICHT IN DER AUSWAHL — ABER DER GERADE
   * GEWAEHLTE SCHON. „Inaktiv" heisst allein „taucht in der Zugangsauswahl nicht
   * mehr auf" (`lesepfade/orte.ts`); Bestand liegt dort weiter und will gezaehlt
   * werden, etwa beim Ausraeumen. Faellt der gewaehlte Ort aus den Optionen,
   * zeigte antds `Select` einen Wert ohne Beschriftung — die Seite behauptete
   * dann einen anderen Ort, als sie zaehlt.
   */
  const waehlbar = schraenke.filter((o) => o.aktiv || o.id === ortId);
  const orte: ZaehlOrt[] = [
    { id: ZAEHLORT_ALLE, label: zaehlOrtLabel(null, undefined) },
    { id: HANDLAGER_ID, label: zaehlOrtLabel(HANDLAGER_ID, undefined) },
    ...waehlbar.map((o) => ({ id: o.id, label: zaehlOrtLabel(o.id, o.name) })),
  ];

  return (
    <>
      <SeitenKopf
        titel="Inventur"
        beschreibung={`${zaehlOrtBeschreibung(ortId, ortName)} Nur angefasste Zeilen und Chargen werden gebucht — der Server rechnet gegen den Live-Bestand, nicht gegen den Stand dieser Seite.`}
        // Wie `BzListe` und `ChecklisteKnopf`: ein antd-`Button` mit `href`, kein
        // `size` (Falle 4). Aeussere Pfadform wie in der Navigation.
        aktionen={<Button href="/verwaltung/inventur/verlauf">Verlauf</Button>}
      />
      {/*
        ⚠️ `key` IST HIER KEINE FORMSACHE, SONDERN DER RIEGEL GEGEN EINE FALSCHE
        BUCHUNG. Der Zaehlstand lebt als `useState` in der Insel; ein Wechsel des
        Orts laedt nur neue Props nach, React behaelt den Zustand. Ohne `key`
        wanderten in Schrank 1 gezaehlte Werte in die Buchung fuer Schrank 2 —
        gegen dessen Erwartungszahlen, und niemand saehe es. Mit `key` steigt die
        Insel neu ein: leerer Stand, leerer Kommentar.
      */}
      <InventurForm
        key={ortId ?? ZAEHLORT_ALLE}
        ortId={ortId}
        orte={orte}
        zeilen={inventurZeilen(db, now, bereich ?? undefined)}
      />
    </>
  );
}

export default async function InventurSeite({
  searchParams,
}: {
  searchParams: Promise<InventurSuchparameter>;
}) {
  return inventurSeitenInhalt(getDb(), new Date(), await searchParams);
}
