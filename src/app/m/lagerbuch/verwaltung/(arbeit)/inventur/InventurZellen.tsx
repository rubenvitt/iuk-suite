"use client";

/**
 * DRK-421 — DIE DREI FLAECHEN DER INVENTUR, DIE AM ZAEHLSTAND HAENGEN, als
 * eigene Bauteile: die „Abweichung"-Zelle, die „Ist"-Zelle und die aufgeklappte
 * Chargenliste.
 *
 * ⚠️ SIE SIND NICHT DER SCHOENHEIT WEGEN HERAUSGELOEST. Solange sie als
 * `render`-Funktionen im Rumpf von `InventurForm` standen, schlossen sie ueber
 * dessen `useState` ab — und damit rendert JEDE Zeile neu, sobald IRGENDETWAS
 * im Formular sich aendert, bis hin zum Tippen im Kommentarfeld. Die Messung
 * steht im Kopf von `zaehlspeicher.ts`. Als eigene Bauteile horchen sie auf
 * GENAU IHREN Artikel; die Spaltendefinition bleibt referenzgleich, und antds
 * `Cell` (selbst `React.memo`) reicht die Zelle unveraendert durch.
 *
 * ⚠️ `memo` UND DIE HORCHER SIND EIN PAAR, KEINE ZWEI MASSNAHMEN. Ohne `memo`
 * renderte das Bauteil trotzdem mit, sobald die Zeile neu gerendert wird; ohne
 * Horcher bekaeme es die eigene Aenderung nicht mit. Beides zusammen ergibt:
 * „rendert genau dann, wenn sich dieser Artikel aendert".
 */

import { memo } from "react";
import { Button, Flex, InputNumber } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { ChargenZaehlung } from "./ChargenZaehlung";
import { artikelSetzen, summeFuer } from "./inventurZustand";
import { useZaehlung, type Zaehlspeicher } from "./zaehlspeicher";

/** Serverseitige Obergrenze der Artikelzaehlung (`_actions/inventur.ts`). */
const IST_MAX_ARTIKEL = 9999;
/** Im Chargenmodus ist das Feld nur die Summe und darf hoeher stehen. */
const IST_MAX_SUMME = 99_999;

type ZellenProps = {
  zeile: InventurZeile;
  speicher: Zaehlspeicher;
};

/**
 * Die Abweichung dieser Zeile — leer, solange niemand sie angefasst hat.
 * Unveraendert in der Sache: Minus rot, Plus gelb, ASCII-Vorzeichen im Text.
 */
export const AbweichungsZelle = memo(function AbweichungsZelle({ zeile, speicher }: ZellenProps) {
  const zaehlung = useZaehlung(speicher, zeile.id);
  if (!zaehlung) return null;
  const differenz = summeFuer(zeile, zaehlung) - zeile.bestand;
  if (differenz === 0) return null;
  return (
    <Chip ton={differenz < 0 ? "rot" : "gelb"}>
      {differenz > 0 ? `+${differenz}` : `${differenz}`}
    </Chip>
  );
});

/**
 * Der Stepper. KEIN `size="small"` an den drei Bedienelementen: die alte
 * Zeilenaktions-Ausnahme (Falle 4, `docs/design/README.md`) ist mit der
 * Arbeitsdichte gefallen — 44px ist hier bereits die volle wie die halbe
 * Bediendichte, `small` unterbietet die Mindesttapflaeche (WCAG 2.5.5).
 */
export const IstZelle = memo(function IstZelle({ zeile, speicher, gesperrt }: ZellenProps & {
  gesperrt: boolean;
}) {
  const zaehlung = useZaehlung(speicher, zeile.id);
  // Einmal berechnet, von Minus-Knopf, Feld und Plus-Knopf gelesen — zwei
  // Ableitungen desselben Werts liefen sonst auseinander.
  const aktuell = summeFuer(zeile, zaehlung);
  // Im Chargenmodus ist das Feld nur die Summe (Spec §B).
  const nurSumme = zaehlung?.art === "chargen";

  function wertSetzen(wert: number | null): void {
    speicher.aendere((stand) => artikelSetzen(stand, zeile.id, wert ?? 0));
  }

  return (
    <Flex gap={SPACE.xs} align="center" justify="flex-end">
      {nurSumme ? <Chip ton="grau">je Charge</Chip> : null}
      <Button
        disabled={gesperrt || nurSumme || aktuell <= 0}
        aria-label={`Ist-Bestand ${zeile.name} verringern`}
        onClick={() => wertSetzen(aktuell - 1)}
        icon={<Ikone name="minus" groesse={14} />}
      />
      <InputNumber<number>
        min={0}
        max={nurSumme ? IST_MAX_SUMME : IST_MAX_ARTIKEL}
        disabled={gesperrt || nurSumme}
        aria-label={`Ist-Bestand ${zeile.name}`}
        value={aktuell}
        onChange={(wert) => wertSetzen(wert)}
      />
      <Button
        disabled={gesperrt || nurSumme || aktuell >= IST_MAX_ARTIKEL}
        aria-label={`Ist-Bestand ${zeile.name} erhöhen`}
        onClick={() => wertSetzen(aktuell + 1)}
        icon={<Ikone name="plus" groesse={14} />}
      />
    </Flex>
  );
});

/**
 * Die aufgeklappte Zeile. ⚠️ EIN MANTEL, KEIN UMBAU VON `ChargenZaehlung`:
 * jene Komponente haelt bewusst keinen Zaehlzustand und bekommt ihn als Prop
 * (Spec §B, „nur Angefasstes wird gesendet"). Der Mantel ist genau die Stelle,
 * an der das Horchen sitzt — so bleibt die Regel dort, wo sie geprueft ist.
 */
export const ChargenZelle = memo(function ChargenZelle({ zeile, speicher, gesperrt, ortText }: ZellenProps & {
  gesperrt: boolean;
  ortText: string;
}) {
  const zaehlung = useZaehlung(speicher, zeile.id);
  return (
    <ChargenZaehlung
      zeile={zeile}
      zaehlung={zaehlung}
      gesperrt={gesperrt}
      ortText={ortText}
      onAendern={(umbau) => speicher.aendere(umbau)}
    />
  );
});
