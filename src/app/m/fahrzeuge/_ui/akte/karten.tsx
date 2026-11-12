"use client";

import type { ReactNode } from "react";
import type { TableProps } from "antd";
import { kartenaufbau, Spaltenkarte, type KartenSpalte, type Kartenwunsch } from "@/core/tabelle";

/**
 * Die Karte einer Zeile unter 768px, aus EIGENEN Spalten gebaut (IDA-299). `Kartentabelle` leitet die Karte
 * sonst aus den Spalten der Tabelle ab; hier weichen beide ab: die Tabelle legt bei 1280px zwei Angaben in
 * eine Zelle, damit sie ohne Scrollen passt, die Karte hat untereinander Platz und führt sie einzeln.
 * Gebaut wird mit denselben Teilen wie dort (`kartenaufbau`, `Spaltenkarte`), nur mit anderer Spaltenliste.
 */
export function karteAus<T>(spalten: NonNullable<TableProps<T>["columns"]>, wunsch: Kartenwunsch, name: (zeile: T) => string): (zeile: T, index: number) => ReactNode {
  const aufbau = kartenaufbau<T>(spalten as readonly KartenSpalte<T>[], wunsch);
  return function Karte(zeile, index) {
    return <Spaltenkarte<T> aufbau={aufbau} zeile={zeile} index={index} name={name(zeile)} />;
  };
}
