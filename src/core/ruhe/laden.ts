import type { Figur } from "./figuren";

/**
 * DIE FIGUREN WERDEN NACHGELADEN, je eine als eigener Chunk. Das Paket bringt alle 33 Figuren in
 * EINER Datei (rund 42 kB gzip); eine Figur allein ist rund 6 kB. Ein Ruhezustand ist selten und
 * nie zeitkritisch — er soll keine Seite schwerer machen, die gerade Daten zeigt.
 *
 * Kein `"use client"`: eine reine Tabelle von Ladern. Der Import passiert im Effekt der Insel.
 */
export type Montiere = (
  ziel: HTMLElement,
  optionen: { intensity?: number; play?: boolean; label?: string },
) => { destroy: () => void; update: (o: { play?: boolean }) => void };

export const LADER: Record<Figur, () => Promise<{ default: Montiere }>> = {
  basket: () => import("./figuren/basket"),
  cabinet: () => import("./figuren/cabinet"),
  dish: () => import("./figuren/dish"),
  drawer: () => import("./figuren/drawer"),
  format: () => import("./figuren/format"),
  hub: () => import("./figuren/hub"),
  keyboard: () => import("./figuren/keyboard"),
  lockers: () => import("./figuren/lockers"),
  padlock: () => import("./figuren/padlock"),
  plot: () => import("./figuren/plot"),
  query: () => import("./figuren/query"),
  rail: () => import("./figuren/rail"),
  relay: () => import("./figuren/relay"),
  router: () => import("./figuren/router"),
  settle: () => import("./figuren/settle"),
  slow: () => import("./figuren/slow"),
  stack: () => import("./figuren/stack"),
  terminal: () => import("./figuren/terminal"),
  terrain: () => import("./figuren/terrain"),
};
