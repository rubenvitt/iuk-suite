"use client";

import { Space, Tooltip } from "antd";
import { Chip } from "./Chip";

/**
 * DRK-297, Aufgabe 11 — DIE VERTEILUNG einer Charge: „Schrank 1: 5 · RTW 1: 7".
 *
 * "use client": sie steht in `ChargenTabelle`, deren `columns[].render`
 * bereits eine Client-Insel ist (Falle 9) — sie liest antds `Tooltip`, der in
 * einer Server Component ohnehin nicht liefe.
 *
 * Ein Ort mit `zugangshinweis` bekommt zusaetzlich ein Hinweiszeichen und
 * einen `Tooltip`. Der Hinweistext steht DANEBEN auch als natives `title` am
 * Chip — Ruling A15 (`Chip.tsx`) — damit er ohne Zeigegeraet (Tastatur,
 * Touch ohne Long-Press) erreichbar bleibt; ein `Tooltip` allein waere nur
 * per Hover zu erreichen.
 *
 * Die REIHENFOLGE der `orte` ist bereits die richtige (Handlager-Bereich vor
 * Fahrzeugen, dann `sortierung`, dann Name) — sie kommt fertig sortiert aus
 * `_actions/detail.ts` an; diese Insel sortiert nicht erneut.
 */
export function OrtVerteilung({
  orte,
  einheit,
}: {
  orte: { id: string; name: string; menge: number; zugangshinweis: string | null }[];
  einheit: string;
}) {
  if (orte.length === 0) return <span>–</span>;

  return (
    <Space size={[4, 4]} wrap>
      {orte.map((ort) => {
        const chip = (
          <Chip
            key={ort.id}
            ton="grau"
            zeichen={ort.zugangshinweis ? "info" : undefined}
            title={ort.zugangshinweis ?? undefined}
          >
            {ort.name}: {ort.menge} {einheit}
          </Chip>
        );
        return ort.zugangshinweis ? (
          <Tooltip key={ort.id} title={ort.zugangshinweis}>
            {chip}
          </Tooltip>
        ) : chip;
      })}
    </Space>
  );
}
