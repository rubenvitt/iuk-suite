"use client";

/**
 * DIE ZELLEN DES REITERS „Bestand" — Ist (±, Feld), „Stimmt"/Abweichung und
 * Verfall. Tabelle (`BestandReiter`) und Karte (`BestandKarte`) benutzen
 * DIESELBEN Bauteile: zwei Fassungen derselben Grenzen und Beschriftungen
 * liefen auseinander, und weil nie beide zu sehen sind, fiele es niemandem auf
 * (Vorbild `inventur/InventurZellen.tsx`).
 *
 * ⚠️ JEDE ZELLE BEKOMMT NUR IHRE WERTE (`ist`, `verfall`), nicht den ganzen
 * Zählstand, und ist `memo`: das Tippen im Kommentarfeld der Leiste ändert den
 * Zählstand, aber keine dieser Zahlen — dann rendert keine Zeile nach.
 *
 * ⚠️ DIE BESCHRIFTUNG TRÄGT ARTIKEL UND FACH („Mullbinde, Fach 1"): ein Artikel
 * steht in mehreren Fächern, und „Ist Mullbinde" träfe zwei Felder.
 */

import dayjs, { type Dayjs } from "dayjs";
import { memo, useState } from "react";
import { Button, Flex, InputNumber } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { obergrenze } from "../../../../../_lib/domain/sollBereich";
import { verfallStatus, type VerfallSchwellen } from "../../../../../_lib/domain/verfall";
import { ampelTon, chargeText } from "../../../../../_lib/format";
import { MONAT_REGEX } from "../../../../../_lib/konstanten";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { ZaehlZustand } from "../../../../../_lib/verwaltungscheck";
import { Chip } from "../../../../../_ui/Chip";
import { Ikone } from "../../../../../_ui/ikonen";
import { keinMonat, monatAusPicker } from "../../../../../_ui/monat";
import { MonatsFeld } from "../../../../../_ui/MonatsFeld";
import s from "../../../../../_ui/verwaltung.module.css";
import type { Aendere } from "./reiter";

/** Obergrenze je Fach wie im Schema der Action (`positionen[].ist`). */
const IST_MAX = 99_999;

/** Eine Zeile des Reiters = eine Soll-Position, mit Anzeigetexten. */
export type BestandZeile = VerwaltungscheckDaten["positionen"][number] & {
  /** „Fach 1" bzw. „ohne Fach" — Anzeige UND Filterwert (Spaltenkopf und Schmalfilter). */
  fach: string;
  /** „Mullbinde, Fach 1" — Kern jeder Beschriftung. */
  benannt: string;
  /** „im Lagerbuch: 12 Stk" (je Artikel, Spec 6.3), ggf. „in 3 Fächern zusammen". */
  buchstand: string;
  /** Der Verfall VOR der Eingabe — Vorgabe des Felds (Spec 6.3). */
  verfallVorher: string | null;
};

function mitIst(z: ZaehlZustand, id: string, wert: number | null): ZaehlZustand {
  const ist = { ...z.ist };
  // Ein geleertes Feld heißt „nicht gezählt" — so lässt sich eine Zählung zurücknehmen.
  if (wert === null) delete ist[id];
  else ist[id] = wert;
  return { ...z, ist };
}

type ZellenProps = { zeile: BestandZeile; ist: number | undefined; aendere: Aendere; gesperrt: boolean };

/**
 * Der Stepper. Ohne Vorgabe (Spec 6.3): ungezählt steht das Feld leer, „+"
 * beginnt bei 1, „Stimmt" setzt das Soll. KEIN `size` (Falle 4).
 */
export const IstZelle = memo(function IstZelle({ zeile, ist, aendere, gesperrt, className }: ZellenProps & {
  /** Die Karte stellt den Stepper über die volle Breite; ohne Angabe die rechtsbündige Tabellenzelle. */
  className?: string;
}) {
  const setze = (wert: number | null) => aendere((z) => mitIst(z, zeile.id, wert));
  const bedienung = (
    <>
      <Button
        disabled={gesperrt || ist === undefined || ist <= 0}
        aria-label={`${zeile.benannt} verringern`}
        onClick={() => setze((ist ?? 0) - 1)}
        icon={<Ikone name="minus" groesse={14} />}
      />
      <InputNumber<number>
        min={0}
        max={IST_MAX}
        precision={0}
        disabled={gesperrt}
        aria-label={`Ist ${zeile.benannt}`}
        value={ist ?? null}
        onChange={(wert) => setze(typeof wert === "number" ? wert : null)}
      />
      <Button
        disabled={gesperrt || (ist ?? 0) >= IST_MAX}
        aria-label={`${zeile.benannt} erhöhen`}
        onClick={() => setze((ist ?? 0) + 1)}
        icon={<Ikone name="plus" groesse={14} />}
      />
    </>
  );
  if (className) return <div className={className} data-rolle="stepper">{bedienung}</div>;
  return <Flex gap={SPACE.xs} align="center" justify="flex-end">{bedienung}</Flex>;
});

const STIMMT_OFFEN = { paddingInline: SPACE.sm } as const;
// Gedrückt in den Farben des Ampel-Chips „ok" — Begründung bei `inventur/InventurZellen.tsx`, `AbweichungsZelle`.
const STIMMT_GEDRUECKT = {
  paddingInline: SPACE.sm,
  color: "var(--lb-ampel-ok-text)",
  background: "var(--lb-ampel-ok-flaeche)",
  borderColor: "var(--lb-ampel-ok-text)",
} as const;

/**
 * „Stimmt" — solange die Zahl nicht abweicht; sonst die Abweichung als Chip
 * (unter Soll rot mit Minus, über „OK bis" gelb mit Plus, Bedeutung nie allein
 * über Farbe).
 *
 * ⚠️ ZURÜCKNEHMBAR NUR, WENN IST = SOLL: ein zweiter Tipp nimmt die Zählung
 * zurück. Ein Ist innerhalb von Soll bis „OK bis", aber ungleich Soll, ist eine
 * echte Zählung — der Knopf ginge dort verloren; er zeigt dann nur den Haken.
 */
export const StimmtZelle = memo(function StimmtZelle({ zeile, ist, aendere, gesperrt }: ZellenProps) {
  if (ist !== undefined) {
    const grenze = obergrenze(zeile.soll, zeile.sollMax);
    const abweichung = ist < zeile.soll ? ist - zeile.soll : ist > grenze ? ist - grenze : 0;
    if (abweichung !== 0) {
      return <Chip ton={abweichung < 0 ? "rot" : "gelb"}>{abweichung > 0 ? `+${abweichung}` : `${abweichung}`}</Chip>;
    }
    if (ist !== zeile.soll) return <Chip ton="ok" zeichen="haken">im Soll</Chip>;
  }
  const bestaetigt = ist !== undefined;
  return (
    <Button
      aria-pressed={bestaetigt}
      aria-label={`${zeile.benannt} stimmt`}
      data-rolle="stimmt"
      disabled={gesperrt}
      icon={bestaetigt ? <Ikone name="haken" groesse={14} /> : undefined}
      style={bestaetigt ? STIMMT_GEDRUECKT : STIMMT_OFFEN}
      onClick={() => aendere((z) => mitIst(z, zeile.id, bestaetigt ? null : zeile.soll))}
    >
      Stimmt
    </Button>
  );
});

/**
 * Der Wert des Monatsfelds für den Zählstand: `YYYY-MM`, `null` (geleert) oder
 * `undefined` — ein ungültiges Datum, das NICHT in den Zählstand gehört (es
 * fiele erst in `baueNutzlast` still heraus, und bis dahin rechnete die Ampel damit).
 */
export function verfallAusPicker(wert: Dayjs | null | undefined): string | null | undefined {
  if (!wert) return null;
  const monat = monatAusPicker(wert);
  return monat !== undefined && MONAT_REGEX.test(monat) ? monat : undefined;
}

/**
 * Der Verfall NACH dem Ausgleich (Spec 6.3) — `MonatsFeld`, gesperrt, solange
 * die Position nicht gezählt ist (Spec 6.12.2: nur Fächer gezählter Positionen
 * gehen auf die Leitung).
 *
 * ⚠️ IN DEN ZÄHLSTAND KOMMT NUR EIN GÜLTIGER MONAT (`YYYY-MM`) ODER `null`: das
 * Feld meldet einen getippten Nicht-Monat über `onUngueltig`, der Wert bleibt
 * dann der alte. Die Meldung steht am Feld (docs/design/README.md, Formulare).
 */
export const VerfallZelle = memo(function VerfallZelle({ zeile, wert, gezaehlt, aendere, gesperrt, schwellen }: {
  zeile: BestandZeile;
  /** Was nach der Eingabe gilt: der eingegebene Wert, sonst der vorherige. */
  wert: string | null;
  gezaehlt: boolean;
  aendere: Aendere;
  gesperrt: boolean;
  schwellen: VerfallSchwellen;
}) {
  const [ungueltig, setUngueltig] = useState<string | null>(null);
  const gueltig = wert !== null && MONAT_REGEX.test(wert) ? wert : null;
  const status = gueltig ? verfallStatus(gueltig, schwellen, new Date()) : null;
  return (
    <Flex vertical gap={SPACE.xs}>
      <Flex gap={SPACE.xs} align="center">
        <MonatsFeld
          aria-label={`Verfall ${zeile.benannt}`}
          disabled={gesperrt || !gezaehlt}
          placeholder={gezaehlt ? "MM/JJJJ" : "erst zählen"}
          value={gueltig ? dayjs(`${gueltig}-01`) : null}
          onChange={(neu) => {
            const monat = verfallAusPicker(neu);
            if (monat !== undefined) aendere((z) => ({ ...z, verfall: { ...z.verfall, [zeile.id]: monat } }));
          }}
          onUngueltig={setUngueltig}
        />
        {status && gueltig && status.ampel !== "gruen" ? (
          <Chip ton={ampelTon(status.ampel)}>{chargeText(status, gueltig)}</Chip>
        ) : null}
      </Flex>
      {ungueltig ? <span className={s.footnote} data-rolle="verfall-fehler">{keinMonat(ungueltig)}</span> : null}
    </Flex>
  );
});
