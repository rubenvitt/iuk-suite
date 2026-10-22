/**
 * DER MONATSWAEHLER BLEIBT IN DER SICHTFLAECHE (IDA-242). Gehoert als `popupAlign` an jeden
 * antd-`DatePicker` mit `picker="month"` im Modul.
 *
 * rc-pickers Vorgabe (`@rc-component/picker`, `PickerTrigger/index.js`) kennt fuer das Fenster nur
 * `adjustX`: es klappt nach links oder rechts um, wenn es auf seiner Seite nicht passt. Auf einem
 * 375px-Telefon passt es oft auf KEINER Seite des Felds — gemessen ragte es auf dem Fahrzeugblatt
 * 172px, im Aussondern-Dialog 40px links hinaus. `shiftX` schiebt es dann an den Rand der
 * Sichtflaeche zurueck. Das reicht nur, weil das Fenster selbst schmaler ist als das Telefon: dafuer
 * sorgt `WAEHLER_ZELLE` in `core/theme/theme.ts`. Gegenprobe mit der schmaleren Breite, aber ohne
 * `shiftX`: das Fenster begann weiter 133px bzw. 1px links ausserhalb.
 *
 * `overflow` ERSETZT antds Eintrag, es ergaenzt ihn nicht (`@rc-component/trigger`,
 * `hooks/useAlign.js` mischt `popupAlign` flach ueber die Platzierung) — deshalb steht `adjustX`
 * und `adjustY` hier noch einmal.
 *
 * Bewusst OHNE `"use client"`: ein reiner Wert, den jede Client-Insel importiert (Falle 6).
 */
export const MONATSWAEHLER_IM_BILD = {
  overflow: { adjustX: 1, adjustY: 1, shiftX: true },
} as const;
