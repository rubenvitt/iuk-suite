import { linkBasisAus } from "./mitglieder";

/**
 * Die volle Adresse der öffentlichen Bar-Anfrage (`/bar`) auf dem Host, unter dem die Leitung gerade arbeitet —
 * dieselbe Herleitung wie der persönliche Link der Mitglieder (`linkBasisAus`). Kein `"use client"`: Seite und
 * Route Handler lesen diese Datei.
 */
export const BAR_PFAD = "/bar";

export function barAnfrageLink(headers: Headers): string {
  return `${linkBasisAus(headers).replace(/\/+$/, "")}${BAR_PFAD}`;
}
