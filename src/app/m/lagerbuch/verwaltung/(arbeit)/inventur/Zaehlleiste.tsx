"use client";

/**
 * DRK-421 — DIE LEISTE UEBER DER TABELLE: Suche, „Alle/Offen", Zaehlort,
 * Sperrhinweis, Verwerfen, Trefferanzeige.
 *
 * IDA-237 — SUCHE UND „OFFEN" STEHEN HIER, NICHT IM SPALTENKOPF, und zwar auf
 * jeder Breite: die schmale Darstellung hat keine Spaltenkoepfe, und die Suche
 * ist der schnellste Weg zum Artikel vor dem Regal. Der Suchtext lebt in DIESER
 * Leiste und geht erst entprellt hinauf — ein Tastendruck darin weckte sonst
 * das Formular und mit ihm die Tabelle (dieselbe Lawine wie beim Kommentarfeld,
 * Kopf von `zaehlspeicher.ts`).
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

import { useEffect, useState } from "react";
import { Button, Flex, Segmented, Select } from "antd";
import { useEntprellt } from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { ZaehlOrt } from "../../../_lib/inventurOrt";
import { zaehlOrtWert } from "../../../_lib/inventurOrt";
import { Suchfeld } from "../../../_ui/Suchfeld";
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
  onSuche,
  onSucheEnter,
  nurOffen,
  onNurOffen,
}: {
  ortId: string | null;
  orte: readonly ZaehlOrt[];
  speicher: Zaehlspeicher;
  /** Absenden oder Ortswechsel laeuft — alles Bedienbare ist gesperrt. */
  laeuft: boolean;
  onOrtWechsel: (schluessel: string) => void;
  gezeigt: number;
  gesamt: number;
  /** Der ENTPRELLTE Suchbegriff — das Formular filtert danach. */
  onSuche: (begriff: string) => void;
  /** Enter im Suchfeld, mit dem Begriff, wie er GERADE dasteht (nicht entprellt). */
  onSucheEnter: (begriff: string) => void;
  nurOffen: boolean;
  onNurOffen: (nurOffen: boolean) => void;
}) {
  const stand = useZaehlstand(speicher);
  const gezaehlt = Object.keys(stand).length;
  const [suche, setSuche] = useState("");
  const sucheNachlauf = useEntprellt(suche);
  // Hinauf geht nur der Nachlauf. `onSuche` ist ein `setState` des Formulars
  // und damit referenzstabil; ein gleicher Wert rendert dort nichts neu.
  useEffect(() => { onSuche(sucheNachlauf); }, [sucheNachlauf, onSuche]);

  return (
    <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
      {/* Der Mantel waechst mit, damit das Feld auf dem Telefon die ganze
          Zeile nimmt; am Schreibtisch deckelt `breite`. */}
      <div style={{ flex: "1 1 240px", maxWidth: 360 }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Artikel oder Fach suchen…"
          breite={360}
          onEnter={onSucheEnter}
        />
      </div>
      {/* ⚠️ „Offen" IST EIN SCHNAPPSCHUSS, kein laufender Filter — die
          Begruendung steht bei `offenStand` im Formular. */}
      <Segmented<"alle" | "offen">
        aria-label="Zeilen"
        value={nurOffen ? "offen" : "alle"}
        onChange={(wert) => onNurOffen(wert === "offen")}
        options={[{ value: "alle", label: "Alle" }, { value: "offen", label: "Offen" }]}
      />
      <Select<string>
        value={zaehlOrtWert(ortId)}
        aria-label="Zählort"
        // ⚠️ GESPERRT, SOBALD ETWAS GEZAEHLT IST. Der Wechsel steigt die Insel
        // neu ein (`key` in `page.tsx`) und verwirft damit den Zaehlstand —
        // das darf nicht unter der Hand passieren, waehrend jemand vor einem
        // Schrank steht. Der Knopf daneben ist der ausdrueckliche Weg.
        disabled={laeuft || gezaehlt > 0}
        onChange={onOrtWechsel}
        // Waechst und schrumpft mit, damit „Alle/Offen" und der Ort auf dem
        // Telefon eine Zeile teilen (IDA-237).
        style={{ flex: "1 1 200px", maxWidth: 280 }}
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
            {/* IDA-237 — die Zahl steht jetzt unten in der Abschlussleiste
                („x von y erfasst"); hier bleibt nur der Grund der Sperre. */}
            Zählort festgelegt, solange gezählt ist.
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
