/**
 * Die Aktionsspalte einer Tabelle (IDA-393): Schlüssel `aktionen`, rechts angeheftet.
 * `Datentabelle` heftet eine Spalte mit diesem Schlüssel ohnehin rechts an; die Funktion spart
 * nur das Abschreiben von Titel und Schlüssel.
 *
 * KEIN "use client" (Falle 6): ein Wert aus einem Client-Modul käme in einer Server Component
 * als Client-Referenz an.
 */
import type { ReactNode } from "react";

/** Die Schlüssel, an denen `Datentabelle` eine Aktionsspalte erkennt und rechts anheftet. */
export const AKTIONS_SCHLUESSEL: readonly string[] = ["aktion", "aktionen"];

export function aktionsSpalte<T>(
  render: (zeile: T, index: number) => ReactNode,
  titel = "Aktionen",
) {
  return {
    title: titel,
    key: "aktionen",
    fixed: "right" as const,
    render: (_: unknown, zeile: T, index: number) => render(zeile, index),
  };
}
