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
import {
  abweichungFuer, artikelBestaetigen, bestaetigungZuruecknehmen, istSetzen, stepperCharge, summeFuer,
} from "./inventurZustand";
import { useZaehlung, type Zaehlspeicher } from "./zaehlspeicher";

/** Serverseitige Obergrenze der Artikelzaehlung (`_actions/inventur.ts`). */
const IST_MAX_ARTIKEL = 9999;
/** Im Chargenmodus ist das Feld nur die Summe und darf hoeher stehen. */
const IST_MAX_SUMME = 99_999;

type ZellenProps = {
  zeile: InventurZeile;
  speicher: Zaehlspeicher;
};

/** Die beiden Fassungen von „Stimmt" — Begruendung am Knopf unten. */
const STIMMT_OFFEN = { paddingInline: SPACE.sm } as const;
const STIMMT_GEDRUECKT = {
  paddingInline: SPACE.sm,
  color: "var(--lb-ampel-ok-text)",
  background: "var(--lb-ampel-ok-flaeche)",
  borderColor: "var(--lb-ampel-ok-text)",
} as const;

/**
 * Die Abweichung dieser Zeile — und, solange keine da ist, der Knopf „Stimmt"
 * (IDA-237). Die Abweichung selbst unveraendert in der Sache: Minus rot, Plus
 * gelb, ASCII-Vorzeichen im Text.
 *
 * ⚠️ „STIMMT" STEHT IN DER SPALTE „Abweichung", NICHT IN DER „Ist"-ZELLE. Die
 * Frage dieser Spalte ist „weicht es ab?" — „Stimmt" ist ihre Antwort fuer den
 * haeufigsten Fall, und sobald eine Zahl abweicht, nimmt der Chip den Platz
 * ein. In der Ist-Zelle waere er ein viertes Bedienelement neben dem Stepper,
 * und die Spalte haette nicht mehr in eine Tabletbreite gepasst.
 *
 * ⚠️ ZURUECKNEHMBAR, ABER NUR DIE BESTAETIGUNG (`bestaetigungZuruecknehmen`).
 * Ein Fehltipp auf „Stimmt" bucht sonst eine Zeile als gezaehlt, die niemand
 * gezaehlt hat; der zweite Tipp hebt das auf. Eine Zeile im Chargenmodus ohne
 * Abweichung zeigt dagegen nur den Haken — „zurueck" verwarf dort gezaehlte
 * Chargen, und dafuer gibt es in der Chargenliste den ausdruecklichen Knopf.
 *
 * ⚠️ `aria-pressed` UND DER HAKEN TRAGEN DEN ZUSTAND, nicht allein die Farbe
 * (dieselbe Zusage wie die Chips in `CheckFlow.tsx`).
 */
export const AbweichungsZelle = memo(function AbweichungsZelle({ zeile, speicher, gesperrt }: ZellenProps & {
  gesperrt: boolean;
}) {
  const zaehlung = useZaehlung(speicher, zeile.id);
  // IDA-276 — die gebuchte Abweichung: eine Uebernahme aus „Nicht zugeordnet"
  // ist keine, ein dort ausgebuchter Rest schon.
  const differenz = abweichungFuer(zeile, zaehlung);
  if (differenz !== 0) {
    return (
      <Chip ton={differenz < 0 ? "rot" : "gelb"}>
        {differenz > 0 ? `+${differenz}` : `${differenz}`}
      </Chip>
    );
  }
  if (zaehlung?.art === "chargen") return <Chip ton="ok" zeichen="haken">erfasst</Chip>;
  const bestaetigt = zaehlung !== undefined;
  return (
    <Button
      aria-pressed={bestaetigt}
      aria-label={`Ist-Bestand ${zeile.name} stimmt`}
      data-rolle="stimmt"
      disabled={gesperrt}
      icon={bestaetigt ? <Ikone name="haken" groesse={14} /> : undefined}
      // ⚠️ SCHMALERES POLSTER ALS ANTDS VORGABE, damit Haken und Wort in die
      // 112px der Spalte passen (`BREITE.abweichung`); die Hoehe bleibt die
      // Arbeitsdichte (Falle 4). Gedrueckt in den Farben des Ampel-Chips „ok"
      // — antds `color="green"` traegt hellgruene Schrift auf hellgruenem
      // Grund (#52c41a auf #f6ffed, nachgerechnet 2,2:1, unter WCAG AA). ROT bleibt der Abweichung
      // vorbehalten (Falle 3). Inline, weil es gegen antds Klassen sonst still
      // verliert (Falle 5); die Werte sind die Modul-Variablen, also auch dunkel
      // richtig.
      style={bestaetigt ? STIMMT_GEDRUECKT : STIMMT_OFFEN}
      onClick={() => speicher.aendere((stand) => (bestaetigt
        ? bestaetigungZuruecknehmen(stand, zeile)
        : artikelBestaetigen(stand, zeile)))}
    >
      Stimmt
    </Button>
  );
});

/**
 * Der Stepper. KEIN `size="small"` an den drei Bedienelementen: die alte
 * Zeilenaktions-Ausnahme (Falle 4, `docs/design/README.md`) ist mit der
 * Arbeitsdichte gefallen — 44px ist hier bereits die volle wie die halbe
 * Bediendichte, `small` unterbietet die Mindesttapflaeche (WCAG 2.5.5).
 */
export const IstZelle = memo(function IstZelle({ zeile, speicher, gesperrt, className }: ZellenProps & {
  gesperrt: boolean;
  /**
   * Die schmale Darstellung stellt den Stepper anders: linksbündig, über die
   * volle Kartenbreite (`inventurkarte.module.css`). Ohne Angabe bleibt es die
   * rechtsbündige Zelle der Tabelle.
   *
   * ⚠️ EIN LAYOUT-HAKEN, KEIN ZWEITES BAUTEIL. Ein eigener Karten-Stepper wäre
   * eine zweite Stelle mit denselben Grenzen, denselben Beschriftungen und
   * derselben Sperrlogik — und die erste Abweichung fiele niemandem auf, weil
   * beide Fassungen nie gleichzeitig zu sehen sind.
   */
  className?: string;
}) {
  const zaehlung = useZaehlung(speicher, zeile.id);
  // Einmal berechnet, von Minus-Knopf, Feld und Plus-Knopf gelesen — zwei
  // Ableitungen desselben Werts liefen sonst auseinander.
  const aktuell = summeFuer(zeile, zaehlung);
  /*
   * Im Chargenmodus ist das Feld nur die Summe (Spec §B). IDA-276: liegt der
   * Artikel noch auf „Nicht zugeordnet", zaehlt der Stepper GENAU EINE Charge
   * (`stepperCharge`) — bei mehreren wird in der aufgeklappten Zeile gezaehlt,
   * denn eine Artikelzahl liesse offen, welche Charge umgelagert wird.
   */
  const einzeln = stepperCharge(zeile);
  const nurSumme = einzeln
    ? zaehlung?.art === "chargen" && zaehlung.neu.length > 0
    : zaehlung?.art === "chargen" || zeile.ungeordnet > 0;

  function wertSetzen(wert: number | null): void {
    speicher.aendere((stand) => istSetzen(stand, zeile, wert ?? 0));
  }

  // ⚠️ EINMAL HINGESCHRIEBEN, ZWEIMAL EINGERAHMT. Zwei Fassungen der drei
  // Bedienelemente waeren zwei Stellen mit denselben Grenzen, denselben
  // Beschriftungen und derselben Sperrlogik — und die erste Abweichung faellt
  // niemandem auf, weil nie beide gleichzeitig zu sehen sind.
  const bedienung = (
    <>
      {/* ⚠️ IM CHARGENMODUS OHNE ±-KNOEPFE (IDA-237). Sie waren dort ohnehin
          gesperrt — gezaehlt wird in der aufgeklappten Zeile — und standen mit
          dem Chip zusammen breiter als die Spalte (`BREITE.ist`). */}
      {nurSumme ? <Chip ton="grau">je Charge</Chip> : (
        <Button
          disabled={gesperrt || aktuell <= 0}
          aria-label={`Ist-Bestand ${zeile.name} verringern`}
          onClick={() => wertSetzen(aktuell - 1)}
          icon={<Ikone name="minus" groesse={14} />}
        />
      )}
      <InputNumber<number>
        min={0}
        max={nurSumme ? IST_MAX_SUMME : IST_MAX_ARTIKEL}
        disabled={gesperrt || nurSumme}
        aria-label={`Ist-Bestand ${zeile.name}`}
        // IDA-237 — der Griff, an dem die Suche das Zaehlfeld fokussiert. Die
        // Kennung und nicht der Name: zwei Artikel duerfen gleich heissen.
        data-ist-artikel={zeile.id}
        value={aktuell}
        onChange={(wert) => wertSetzen(wert)}
      />
      {nurSumme ? null : (
        <Button
          disabled={gesperrt || aktuell >= IST_MAX_ARTIKEL}
          aria-label={`Ist-Bestand ${zeile.name} erhöhen`}
          onClick={() => wertSetzen(aktuell + 1)}
          icon={<Ikone name="plus" groesse={14} />}
        />
      )}
    </>
  );

  if (className) return <div className={className}>{bedienung}</div>;

  return (
    <Flex gap={SPACE.xs} align="center" justify="flex-end">
      {bedienung}
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
