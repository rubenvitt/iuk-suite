/**
 * Brücke zwischen antds Datumsfeldern und der Suite-Zone. Ein `Dayjs` rechnet in der Zone des
 * Browsers; wir benutzen ihn nur als Wanduhr („Sa 14.11. 08:00“) und rechnen über `_lib/zeit.ts` in
 * Millisekunden der Suite-Zone um. So zeigt ein Browser in einer anderen Zone dieselben Uhrzeiten.
 */
import dayjs, { type Dayjs } from "dayjs";
import { ausWanduhr, wanduhr } from "../_lib/zeit";

export function alsDayjs(ms: number): Dayjs {
  const w = wanduhr(ms);
  return dayjs(new Date(w.jahr, w.monat - 1, w.tag, w.stunde, w.minute));
}

export function ausDayjs(d: Dayjs): number {
  return ausWanduhr({ jahr: d.year(), monat: d.month() + 1, tag: d.date(), stunde: d.hour(), minute: d.minute() });
}
