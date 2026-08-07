import type { Dayjs } from "dayjs";

/** Hält den Dayjs-Wert des antd-Pickers an einer directive-freien Grenze. */
export function monatAusPicker(wert: Dayjs | null | undefined): string | undefined {
  return wert?.format("YYYY-MM");
}
