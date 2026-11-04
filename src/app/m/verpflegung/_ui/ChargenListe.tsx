"use client";

import { useState } from "react";
import { Button } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText, nachZahl, trifftWert, werteAlsFilter } from "@/core/tabelle";
import { datumLang, mengeText } from "../_lib/mhd";
import type { ChargeSicht } from "../_lib/typen";
import { AussondernDialog } from "./AussondernDialog";
import { AmpelChip } from "./teile";
import s from "./verpflegung.module.css";

type Sicht = "alle" | "abgelaufen" | "kritisch" | "bald";
const SICHTEN: { wert: Sicht; label: string }[] = [
  { wert: "alle", label: "Alle" },
  { wert: "abgelaufen", label: "Abgelaufen" },
  { wert: "kritisch", label: "Kritisch" },
  { wert: "bald", label: "Bald" },
];

function passt(c: ChargeSicht, sicht: Sicht): boolean {
  if (sicht === "abgelaufen") return c.status.abgelaufen;
  if (sicht === "kritisch") return !c.status.abgelaufen && c.status.ampel === "rot";
  if (sicht === "bald") return c.status.ampel === "gelb";
  return true;
}

/**
 * Chargen als Liste: der Bestand (alle) oder die MHD-Kontrolle (nur was rot oder gelb ist, mit Wahl nach Stufe).
 * Nach MHD sortiert — wer von oben abarbeitet, arbeitet nach FEFO.
 */
export function ChargenListe({ titel, chargen, kontrolle }: { titel: string; chargen: ChargeSicht[]; kontrolle?: boolean }) {
  const [sicht, setSicht] = useState<Sicht>("alle");
  const [raus, setRaus] = useState<ChargeSicht | null>(null);
  const basis = kontrolle ? chargen.filter((c) => c.status.ampel !== "ok") : chargen;
  const zeilen = basis.filter((c) => passt(c, sicht));
  return (
    <>
      <Seitenkopf
        titel={titel}
        aktionen={kontrolle ? <Filterchips<Sicht> aria-label="Stufe" wert={sicht} onChange={setSicht} optionen={SICHTEN} /> : undefined}
      />
      <Kartentabelle<ChargeSicht>
        rowKey="id"
        aria-label={titel}
        dataSource={zeilen}
        leer={{
          nichts: kontrolle ? "Nichts läuft in den nächsten Wochen ab." : "Noch nichts eingelagert.",
          gefiltert: "Keine Charge passt zur Auswahl.",
          aktiv: sicht !== "alle" ? true : undefined,
        }}
        karte={{ titel: "artikel", kennzeichen: ["ampel"] }}
        columns={[
          {
            title: "Artikel", key: "artikel", sorter: nachText<ChargeSicht>((c) => c.artikelName),
            filters: werteAlsFilter(basis, (c) => c.kategorie), onFilter: trifftWert<ChargeSicht>((c) => c.kategorie),
            render: (_: unknown, c: ChargeSicht) => <><strong>{c.artikelName}</strong> <span className={s.neben}>· {c.kategorie}</span></>,
          },
          {
            title: "Ort", key: "ort", filters: werteAlsFilter(basis, (c) => c.ortKurz), onFilter: trifftWert<ChargeSicht>((c) => c.ortKurz),
            render: (_: unknown, c: ChargeSicht) => c.ortKurz,
          },
          {
            title: "MHD", key: "mhd", defaultSortOrder: "ascend", sorter: nachText<ChargeSicht>((c) => c.mhd),
            render: (_: unknown, c: ChargeSicht) => <span className={s.mhd}>{datumLang(c.mhd)}</span>,
          },
          { title: "Ampel", key: "ampel", render: (_: unknown, c: ChargeSicht) => <AmpelChip status={c.status} /> },
          {
            title: "Menge", key: "menge", align: "right", sorter: nachZahl<ChargeSicht>((c) => c.menge),
            render: (_: unknown, c: ChargeSicht) => <span className={s.ziffern}>{mengeText(c.menge, c.einheit)}</span>,
          },
          { title: "Aktion", key: "aktion", render: (_: unknown, c: ChargeSicht) => <Button onClick={() => setRaus(c)}>Aussondern</Button> },
        ]}
      />
      <AussondernDialog charge={raus} onClose={() => setRaus(null)} />
    </>
  );
}
