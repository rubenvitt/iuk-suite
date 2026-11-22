"use client";

/**
 * EINE SOLL-POSITION ALS KARTE — der Reiter „Bestand" auf dem Telefon.
 *
 * Gezeigt wird, was an der Einheit gebraucht wird: der Artikel zuerst, darunter
 * Fach, Soll und Buchstand als eine Zeile Merkmale, der Stepper über die volle
 * Breite mit „Stimmt" unter demselben Daumen, dann der Verfall. Dieselben Zellen
 * wie in der Tabelle (`BestandZellen.tsx`); Vorbild `inventur/InventurKarte.tsx`.
 */

import type { VerfallSchwellen } from "../../../../../_lib/domain/verfall";
import { sollText } from "../../../../../_lib/domain/sollBereich";
import s from "../../../../../_ui/verwaltung.module.css";
import { IstZelle, StimmtZelle, VerfallZelle, type BestandZeile } from "./BestandZellen";
import type { Aendere } from "./reiter";
import k from "./zaehlen.module.css";

export function BestandKarte({ zeile, ist, verfall, aendere, gesperrt, schwellen }: {
  zeile: BestandZeile;
  ist: number | undefined;
  verfall: string | null;
  aendere: Aendere;
  gesperrt: boolean;
  schwellen: VerfallSchwellen;
}) {
  return (
    <article className={k.karte}>
      <span className={k.name}>{zeile.artikelName}</span>
      <p className={k.merkmale}>
        <span className={s.fach}>{zeile.fach}</span>
        <span>{`Soll ${sollText(zeile.soll, zeile.sollMax)} ${zeile.einheit}`}</span>
        <span data-rolle="buchstand">{zeile.buchstand}</span>
      </p>
      <div className={k.zaehlzeile}>
        <IstZelle zeile={zeile} ist={ist} aendere={aendere} gesperrt={gesperrt} className={k.stepper} />
        <StimmtZelle zeile={zeile} ist={ist} aendere={aendere} gesperrt={gesperrt} />
      </div>
      <div className={k.verfall}>
        {/* Spec 6.3: gemeint ist der Verfall, der NACH dem Ausgleich im Fach liegt. */}
        <span className={k.verfallTitel}>Verfall nach dem Ausgleich</span>
        <VerfallZelle
          zeile={zeile}
          wert={verfall}
          gezaehlt={ist !== undefined}
          aendere={aendere}
          gesperrt={gesperrt}
          schwellen={schwellen}
        />
      </div>
    </article>
  );
}
