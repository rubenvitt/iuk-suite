import { MINDEST } from "./masse";

/**
 * SKYLINE-KONTUREN für das Packen von Teilbäumen (Reingold-Tilford mit gierigem Links-Packen).
 * Eine Kontur ist links wie rechts eine Stufenfunktion über y; Vereinigen und Verschieben sind
 * lineare Durchläufe. Koordinaten werden auf 1e-6 gerundet, damit Fließkomma-Reste keine
 * Splitterstufen erzeugen.
 */
export interface Stufe { y0: number; y1: number; x: number }
export interface Kontur { readonly links: readonly Stufe[]; readonly rechts: readonly Stufe[] }

const EPS = 1e-6;
const rund = (v: number) => Math.round(v * 1e6) / 1e6;
export const LEER: Kontur = { links: [], rechts: [] };
export const LINIEN_LUFT = 0.5;
/** Höhenabstand, unter dem zwei Stufen als überlappend gelten (Mindestabstand der Prüfung, Task 11). */
export const LUFT_Y = MINDEST.kasten;

export function istLeer(k: Kontur): boolean {
  return k.links.length === 0;
}

export function rechteck(x: number, y: number, b: number, h: number): Kontur {
  if (!(h > EPS)) return LEER;
  const y0 = rund(y), y1 = rund(y + h);
  return { links: [{ y0, y1, x: rund(x) }], rechts: [{ y0, y1, x: rund(x + b) }] };
}

export function strecke(x1: number, y1: number, x2: number, y2: number): Kontur {
  const h = LINIEN_LUFT / 2;
  return rechteck(Math.min(x1, x2) - h, Math.min(y1, y2) - h, Math.abs(x2 - x1) + LINIEN_LUFT, Math.abs(y2 - y1) + LINIEN_LUFT);
}

function verschmelze(a: readonly Stufe[], b: readonly Stufe[], waehle: (p: number, q: number) => number): Stufe[] {
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];
  const punkte = [...new Set([...a, ...b].flatMap((s) => [s.y0, s.y1]))].sort((p, q) => p - q);
  const aus: Stufe[] = [];
  let i = 0, j = 0;
  for (let k = 0; k < punkte.length - 1; k++) {
    const y0 = punkte[k], y1 = punkte[k + 1], mitte = (y0 + y1) / 2;
    while (i < a.length && a[i].y1 <= mitte) i++;
    while (j < b.length && b[j].y1 <= mitte) j++;
    const va = i < a.length && a[i].y0 <= mitte ? a[i].x : undefined;
    const vb = j < b.length && b[j].y0 <= mitte ? b[j].x : undefined;
    const v = va === undefined ? vb : vb === undefined ? va : waehle(va, vb);
    if (v === undefined) continue;
    const letzte = aus[aus.length - 1];
    if (letzte && Math.abs(letzte.y1 - y0) < EPS && Math.abs(letzte.x - v) < EPS) letzte.y1 = y1;
    else aus.push({ y0, y1, x: v });
  }
  return aus;
}

export function vereinige(a: Kontur, b: Kontur): Kontur {
  return { links: verschmelze(a.links, b.links, Math.min), rechts: verschmelze(a.rechts, b.rechts, Math.max) };
}

export function verschiebe(k: Kontur, dx: number, dy: number): Kontur {
  const f = (s: Stufe) => ({ y0: rund(s.y0 + dy), y1: rund(s.y1 + dy), x: rund(s.x + dx) });
  return { links: k.links.map(f), rechts: k.rechts.map(f) };
}

/**
 * Paarweise statt im Reißverschluss: mit `LUFT_Y` zählen auch Stufen, die sich NICHT überlappen,
 * und die überspringt ein Reißverschluss-Durchlauf. Konturen haben Dutzende Stufen, nicht Tausende.
 */
export function abstand(links: Kontur, rechts: Kontur, luecke: number): number {
  let bedarf = -Infinity;
  for (const a of links.rechts) for (const b of rechts.links) {
    const ueber = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ueber > EPS - LUFT_Y) bedarf = Math.max(bedarf, a.x - b.x + luecke);
  }
  return bedarf;
}

export const minX = (k: Kontur) => Math.min(...k.links.map((s) => s.x));
export const maxX = (k: Kontur) => Math.max(...k.rechts.map((s) => s.x));

export function nebeneinander(links: Kontur, rechts: Kontur, luecke: number): number {
  const d = abstand(links, rechts, luecke);
  return d === -Infinity ? maxX(links) + luecke - minX(rechts) : d;
}
