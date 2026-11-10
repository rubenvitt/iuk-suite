import type { FormProps } from "antd";

type Pruefmeldungen = NonNullable<FormProps["validateMessages"]>;

const UNGUELTIG = "${label} ist so nicht gültig.";

/**
 * PRÜFMELDUNGEN DER SUITE FÜR JEDES antd-`Form` (IDA-394). antds `de_DE` siezt („Bitte geben Sie
 * ${label} an“) und spricht in Fachwörtern („${type} erwartet“); die Suite duzt und sagt, was
 * fehlt — wie Fahrzeuge („Typ fehlt.“). Überschrieben ist nur, was siezt oder technisch klingt;
 * die Zahlen- und Längenmeldungen aus `de_DE` bleiben (sie sind neutral formuliert). Eine
 * `message` an der einzelnen Regel geht weiter vor.
 */
export const PRUEFMELDUNGEN: Pruefmeldungen = {
  default: UNGUELTIG,
  required: "${label} fehlt.",
  enum: "${label}: bitte einen der Werte wählen.",
  whitespace: "${label} fehlt.",
  date: {
    format: "${label} ist kein gültiges Datum.",
    parse: "${label} ist kein gültiges Datum.",
    invalid: "${label} ist kein gültiges Datum.",
  },
  types: {
    string: UNGUELTIG,
    method: UNGUELTIG,
    array: UNGUELTIG,
    object: UNGUELTIG,
    number: "${label} muss eine Zahl sein.",
    date: "${label} ist kein gültiges Datum.",
    boolean: UNGUELTIG,
    integer: "${label} muss eine ganze Zahl sein.",
    float: "${label} muss eine Zahl sein.",
    regexp: UNGUELTIG,
    email: "${label} ist keine gültige E-Mail-Adresse.",
    url: "${label} ist keine gültige Adresse.",
    hex: UNGUELTIG,
  },
  pattern: { mismatch: UNGUELTIG },
};

/**
 * Vorgaben für jedes antd-`Form` der Suite, gesetzt im `ConfigProvider` (`AntdProvider`); innere
 * `ConfigProvider` (Dichten, Kiosk) erben sie.
 *
 * `scrollToFirstError`: schlägt das Absenden fehl, springt die Seite zum ersten Feld mit Meldung
 * und setzt den Fokus hinein. Das ist die Hälfte der Regel „Hauptknopf bleibt aktiv“
 * (`docs/design/README.md`, Formulare): wer nicht sperrt, muss zeigen, wo es hakt — auch wenn die
 * Meldung 1800 px weiter oben steht.
 *
 * Bewusst ohne `"use client"` (Falle 6): ein reiner Wert.
 */
export const FORMULAR_VORGABEN = {
  validateMessages: PRUEFMELDUNGEN,
  scrollToFirstError: { block: "center", focus: true },
} as const satisfies Pick<FormProps, "validateMessages" | "scrollToFirstError">;
