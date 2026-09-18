"use client";

/**
 * DRK-421 — DIE LEISTE UEBER DER TABELLE: Zaehlort, Sperrhinweis, Verwerfen,
 * Trefferanzeige.
 *
 * ⚠️ HERAUSGELOEST AUS DEMSELBEN GRUND WIE DIE ABSCHLUSSLEISTE. Sie muss
 * wissen, ob schon etwas gezaehlt ist (der Zaehlort ist dann festgelegt) —
 * horchte das Formular darauf, renderte jeder Zaehlschritt alle Zeilen neu.
 * Hier kostet dasselbe Horchen ein Dutzend Knoten.
 *
 * ⚠️ DIE ORTSAUSWAHL STEHT BEWUSST NICHT IM SPALTENKOPF wie Kategorie und Fach
 * (DRK-333). Der Unterschied ist fachlich: jene beiden BLENDEN Zeilen aus, die
 * gezaehlten Werte bleiben und werden mitgebucht. Der Ort dagegen bestimmt,
 * WOGEGEN gerechnet wird — jede Erwartungszahl und jede Korrektur haengt daran.
 * Ein Filter, der die Bedeutung der Zahlen daneben aendert, gehoert ueber die
 * Tabelle, nicht in ihren Kopf.
 */

import { Button, Flex, Select } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { ZaehlOrt } from "../../../_lib/inventurOrt";
import { zaehlOrtWert } from "../../../_lib/inventurOrt";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { useZaehlstand, type Zaehlspeicher } from "./zaehlspeicher";

export function Zaehlleiste({
  ortId,
  orte,
  speicher,
  laeuft,
  onOrtWechsel,
  gezeigt,
  gesamt,
}: {
  ortId: string | null;
  orte: readonly ZaehlOrt[];
  speicher: Zaehlspeicher;
  /** Absenden oder Ortswechsel laeuft — alles Bedienbare ist gesperrt. */
  laeuft: boolean;
  onOrtWechsel: (schluessel: string) => void;
  gezeigt: number;
  gesamt: number;
}) {
  const stand = useZaehlstand(speicher);
  const gezaehlt = Object.keys(stand).length;

  return (
    <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
      <Select<string>
        value={zaehlOrtWert(ortId)}
        aria-label="Zählort"
        // ⚠️ GESPERRT, SOBALD ETWAS GEZAEHLT IST. Der Wechsel steigt die Insel
        // neu ein (`key` in `page.tsx`) und verwirft damit den Zaehlstand —
        // das darf nicht unter der Hand passieren, waehrend jemand vor einem
        // Schrank steht. Der Knopf daneben ist der ausdrueckliche Weg.
        disabled={laeuft || gezaehlt > 0}
        onChange={onOrtWechsel}
        style={{ minWidth: 240 }}
        // ⚠️ `o.schluessel` UND NICHT `o.id` (DRK-371): die rohe Kennung stuende
        // im selben Wertebereich wie der Waechter, und ein Schrank namens
        // `alle` waere nicht mehr waehlbar — sein Klick zaehlte den ganzen
        // Handlager, samt der Korrekturen, die daraus folgen. Derselbe Wert
        // haelt auch doppelte Beschriftungen auseinander (`eindeutigeLabels`);
        // ihn hier nachzurechnen waere eine zweite Quelle fuer dieselbe Sache.
        options={orte.map((o) => ({ value: o.schluessel, label: o.label }))}
        virtual={false}
      />
      {gezaehlt > 0 ? (
        <>
          <span data-rolle="ort-gesperrt">
            {`${gezaehlt} ${gezaehlt === 1 ? "Position ist" : "Positionen sind"} gezählt — der Zählort ist bis zum Abschluss festgelegt.`}
          </span>
          <Button
            disabled={laeuft}
            data-rolle="zaehlung-verwerfen"
            onClick={() => speicher.leeren()}
          >
            Zählung verwerfen
          </Button>
        </>
      ) : null}
      {/* ⚠️ DER ZAEHLER STEHT IN DERSELBEN LEISTE, nicht in einer zweiten
          darunter: seit DRK-337 steht hier IMMER etwas, und zwei Leisten
          uebereinander trugen ihren Aussenabstand zweimal. Er erscheint
          weiterhin nur, wenn wirklich gefiltert ist — „2 von 2" waere Laerm. */}
      <Trefferanzeige gezeigt={gezeigt} gesamt={gesamt} />
    </Flex>
  );
}
