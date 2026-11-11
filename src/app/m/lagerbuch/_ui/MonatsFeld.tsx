"use client";

import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useRef, type FocusEvent } from "react";
import { DatePicker, type DatePickerProps, type FormInstance, type FormRule } from "antd";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import { keinMonat, MONAT_FORMATE, monatAusPicker, monatAusText } from "./monat";

type MonatsFeldProps = Omit<
  DatePickerProps,
  "picker" | "format" | "onBlur" | "onChange" | "value" | "preserveInvalidOnBlur"
> & {
  value?: Dayjs | null;
  onChange?: (wert: Dayjs | null) => void;
  /**
   * Der getippte Text, wenn er beim Verlassen KEIN Monat ist — sonst `null`.
   * Der Aufrufer macht daraus die Feldmeldung (ein `validator` am `Form.Item`).
   */
  onUngueltig: (text: string | null) => void;
};

/**
 * IDA-378 — DAS MONATSFELD, DAS NICHTS STILL VERWIRFT.
 *
 * antds Picker nimmt nur die Schreibweisen aus `format` an und setzt alles
 * andere beim Verlassen kommentarlos auf den alten Wert zurueck: „01/2020"
 * gegen `format="YYYY-MM"` verschwand einfach. Jetzt:
 *
 *  - `MONAT_FORMATE` (MM/JJJJ, M/JJJJ, MM.JJJJ, M.JJJJ, JJJJ-MM) werden
 *    angenommen, angezeigt wird MM/JJJJ.
 *  - `preserveInvalidOnBlur` laesst einen ungueltigen Text stehen, und
 *    `onUngueltig` meldet ihn — der Aufrufer zeigt die Meldung am Feld.
 *  - Ein geleertes Feld leert auch den Wert (der Picker selbst behielte ihn).
 */
export function MonatsFeld({ value, onChange, onUngueltig, ...rest }: MonatsFeldProps) {
  function verlassen(e: FocusEvent<HTMLElement>): void {
    const text = ((e.target as HTMLInputElement).value ?? "").trim();
    if (text === "") {
      onUngueltig(null);
      if (value) onChange?.(null);
      return;
    }
    const monat = monatAusText(text);
    if (!monat) {
      onUngueltig(text);
      return;
    }
    onUngueltig(null);
    if (monatAusPicker(value) !== monat) onChange?.(dayjs(`${monat}-01`));
  }

  return (
    <DatePicker
      popupAlign={WAEHLER_IM_BILD}
      placeholder="MM/JJJJ"
      style={{ width: "100%" }}
      {...rest}
      value={value ?? null}
      picker="month"
      format={MONAT_FORMATE}
      preserveInvalidOnBlur
      // `DatePickerProps` traegt auch den Mehrfachmodus; dieses Feld nie.
      onChange={(wert: Dayjs | Dayjs[] | null) => {
        onUngueltig(null);
        onChange?.(Array.isArray(wert) ? (wert[0] ?? null) : wert);
      }}
      onBlur={verlassen}
    />
  );
}

/**
 * IDA-403 — DIE FELDREGEL ZUM MONATSFELD in einem antd-Formular. Das Feld
 * meldet den ungueltigen Text (`onUngueltig`), die Regel macht daraus die
 * Meldung am Feld und haelt das Absenden auf.
 *
 * `pflicht` ersetzt `required: true` — beide Regeln nebeneinander zeigten zu
 * einem Nicht-Monat zwei Saetze. Das Pflichtzeichen setzt der Aufrufer dann
 * selbst (`required` am `Form.Item`).
 *
 * `vergessen` gehoert neben jedes `resetFields`: der getippte Text haengt nicht
 * am Formularspeicher.
 */
export function useMonatsPruefung(
  form: FormInstance,
  name: string,
  pflicht?: string,
): { onUngueltig: (text: string | null) => void; regel: FormRule; vergessen: () => void } {
  const ungueltig = useRef<string | null>(null);
  // Stabil, damit `vergessen` in Effekt-Abhaengigkeiten stehen darf.
  return useMemo(() => ({
    onUngueltig(text: string | null) {
      const vorher = ungueltig.current;
      ungueltig.current = text;
      // Auch beim Verschwinden neu pruefen: sonst bliebe die Meldung stehen,
      // wenn der korrigierte Monat derselbe ist wie der alte Wert.
      if (text || vorher) void form.validateFields([name]).catch(() => undefined);
    },
    regel: {
      validator: async (_regel, wert: Dayjs | null | undefined) => {
        const text = ungueltig.current;
        if (text) throw new Error(keinMonat(text));
        if (pflicht && !wert) throw new Error(pflicht);
      },
    },
    vergessen() {
      ungueltig.current = null;
    },
  }), [form, name, pflicht]);
}
