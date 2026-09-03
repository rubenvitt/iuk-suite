"use client";

import type { SymbolSpec } from "@einsatzzeichen/schema";
import {
  ADMIN_LEVEL_LABELS,
  ALL_PICTOGRAMS,
  BODY_MARK_IDS,
  BODY_VARIANT_IDS,
  FUNCTION_ROLE_DEFINITIONS,
  ORGANIZATION_LABELS,
  PALETTE,
  STRENGTH_LABELS,
  SYMBOL_KINDS,
  TECHNICAL_BODY_MARK_LABELS,
  TECHNICAL_HEAD_MARK_LABELS,
  VEHICLE_CATEGORY_LABELS,
  functionRole,
  pictogram,
  symbolKindLabel,
} from "./paket";
import { koerperformName } from "../../_lib/bezeichnungen";

/**
 * DIE NEUN ACHSEN DES BAUKASTENS, in der von den Daten erzwungenen Reihenfolge.
 *
 * Gemessen tragen von 225.720 aufgezaehlten Kombinationen der fuenf Hauptachsen
 * 894 — 0,4 % (M16). Sechs unabhaengige Auswahlfelder produzierten also in
 * 99,6 % der Faelle Unsinn: der Baukasten MUSS sperren, nicht hinterher meckern.
 *
 * Drei Achsen fassen mehrere Spec-Felder zu EINEM Bedienfeld zusammen, und jede
 * hat ihren gemessenen Grund:
 *   - Zugehoerigkeit: `organization` und `technicalFill` schliessen sich aus
 *     (`technical-fill-organization-conflict`).
 *   - Kopfzone: `strength`, `administrativeLevel` und `technicalHeadMark` teilen
 *     sich den Platz ueber dem Koerper — als drei Felder erzeugte jeder zweite
 *     Klick `head-zone-conflict`.
 *   - Unter dem Koerper: `vehicleCategory` und `designation` belegen denselben
 *     Streifen (`chassis-foot-conflict`).
 *
 * ⛔ EIN BEDIENFELD JE ACHSE, NICHT JE SPEC-FELD (Korrektur 3 des Auftrags).
 * `AchsenFelder.tsx` rendert deshalb EIN `<select>` je Achse; die Quellen laufen
 * darin als `<optgroup>` zusammen. Drei nebeneinanderstehende Auswahlfelder fuer
 * dieselbe Zone laden dazu ein, zwei davon zu setzen — und genau das ist der
 * Konflikt, den die Buendelung verhindert.
 *
 * NICHT IN DER OBERFLAECHE: die elf Metrikfelder in `BodyLabels`. Das sind
 * Quellenvermessungen, kein Nutzerregler. Stammt eine Spec aus einem Rezept,
 * werden sie unveraendert DURCHGEREICHT — ein Verwerfen aenderte das Bild.
 */
export interface Achse {
  key: string;
  titel: string;
  /** Die Spec-Felder, die dieses eine Bedienfeld setzt. */
  felder: readonly (keyof SymbolSpec)[];
  art: "kacheln" | "wahl" | "mehrfach" | "fussstreifen" | "beschriftung";
  hilfe: string;
}

export const ACHSEN: readonly Achse[] = [
  {
    key: "grundzeichenart",
    titel: "Grundzeichenart",
    felder: ["kind"],
    art: "kacheln",
    hilfe: "Entscheidet, welche weiteren Felder es überhaupt gibt.",
  },
  {
    key: "zugehoerigkeit",
    titel: "Zugehörigkeit",
    felder: ["organization", "technicalFill"],
    art: "wahl",
    hilfe: "Organisation oder technische Füllung — beides zusammen geht nicht.",
  },
  {
    key: "kopfzone",
    titel: "Kopfzone",
    felder: ["strength", "administrativeLevel", "technicalHeadMark"],
    art: "wahl",
    hilfe: "Stärke, Verwaltungsstufe oder technische Kopfmarke — sie teilen sich den Platz.",
  },
  {
    key: "funktion",
    titel: "Funktion",
    felder: ["functionRole"],
    art: "wahl",
    hilfe: "Führungs- und Funktionszeichen aus den Anhängen D.1, D.3 und D.4.",
  },
  {
    key: "fussstreifen",
    titel: "Unter dem Körper",
    felder: ["vehicleCategory", "designation"],
    art: "fussstreifen",
    hilfe: "Fahrzeugkategorie oder eigener Text — derselbe Streifen.",
  },
  {
    key: "koerperform",
    titel: "Körperform",
    felder: ["bodyVariant"],
    art: "wahl",
    hilfe: "Zweite belegte Zeichnung derselben Grundzeichenart.",
  },
  {
    key: "faehigkeit",
    titel: "Fähigkeit",
    felder: ["capabilities"],
    art: "wahl",
    hilfe: "Eine Fähigkeit. Mehrere landen in derselben Box und überlagern sich.",
  },
  {
    key: "koerpermarken",
    titel: "Körpermarken",
    felder: ["bodyMarks"],
    art: "mehrfach",
    hilfe: "Mehrere möglich.",
  },
  {
    key: "beschriftung",
    titel: "Beschriftung",
    felder: ["labels"],
    art: "beschriftung",
    hilfe: "Fünf Zonen im Körper. Lange Texte laufen aus ihrer Zone.",
  },
];

/**
 * Der Name einer QUELLE innerhalb einer Achse — die Beschriftung der `<optgroup>`.
 * Er steht nur dort, wo eine Achse mehrere Quellen hat; bei einer einzigen waere
 * er eine Wiederholung des Achsentitels.
 */
export const FELDTITEL: Record<string, string> = {
  organization: "Organisation",
  technicalFill: "Technische Füllung",
  strength: "Stärke",
  administrativeLevel: "Verwaltungsstufe",
  technicalHeadMark: "Technische Kopfmarke",
  functionRole: "Funktion",
  vehicleCategory: "Fahrzeugkategorie",
  bodyVariant: "Körperform",
  capabilities: "Fähigkeit",
  bodyMarks: "Körpermarke",
  designation: "Eigener Text",
  kind: "Grundzeichenart",
  labels: "Beschriftung",
};

/**
 * Deutsche Woerter fuer die dreizehn Farbtoken. Das Paket exportiert dafuer kein
 * Register (`COLOR_WORDS` liegt in `packages/website`, `"private": true`), und
 * ein Token wie `funktionslauf-kontrast` hat in einem Auswahlfeld nichts verloren,
 * das auch jemand ohne Technikbezug bedient. `vokabular.test.ts` haelt die Liste
 * gegen `PALETTE`.
 */
export const FARBWORTE: Record<string, string> = {
  schwarz: "Schwarz",
  "funktionslauf-kontrast": "Schwarz (Funktionslauf)",
  weiss: "Weiß",
  rot: "Rot",
  blau: "Blau",
  gelb: "Gelb",
  gruen: "Grün",
  hellgruen: "Hellgrün",
  orange: "Orange",
  braun: "Braun",
  grau: "Grau",
  hellgrau: "Hellgrau",
  hellblau: "Hellblau",
};

const KAPABILITAETEN = ALL_PICTOGRAMS.filter(
  (p) => p.variant === "primary" && p.id.startsWith("capability."),
).map((p) => ({ id: p.id.slice("capability.".length), titel: p.title }));

const KAPABILITAET_TITEL = new Map(KAPABILITAETEN.map((e) => [e.id, e.titel]));

/**
 * Die Kandidaten einer Spec-Achse. Ein unbekanntes Feld hat keine — kein Wurf.
 *
 * ⚠️ `bodyMarks` LIEFERT DIE LISTE DES PAKETS (`BODY_MARK_IDS`, gemessen 64: 44
 * technische Marken plus 20 randbuendige Faehigkeitspiktogramme) UND NICHT die
 * Vereinigung aus technischen Marken und ALLEN 88 Faehigkeiten. Letztere waeren
 * 132 Eintraege, von denen 68 gar keine Koerpermarke des Katalogs sind: sie
 * stuenden dauerhaft ausgegraut in der Liste und behaupteten eine
 * Vermessungsluecke, wo schlicht kein Wert existiert.
 */
export function kandidaten(feld: keyof SymbolSpec | string): readonly string[] {
  switch (feld) {
    case "kind":
      return SYMBOL_KINDS;
    case "organization":
      return Object.keys(ORGANIZATION_LABELS);
    case "technicalFill":
      return Object.keys(PALETTE);
    case "strength":
      return Object.keys(STRENGTH_LABELS);
    case "administrativeLevel":
      return Object.keys(ADMIN_LEVEL_LABELS);
    case "technicalHeadMark":
      return Object.keys(TECHNICAL_HEAD_MARK_LABELS);
    case "functionRole":
      return Object.keys(FUNCTION_ROLE_DEFINITIONS);
    case "vehicleCategory":
      return Object.keys(VEHICLE_CATEGORY_LABELS);
    case "bodyVariant":
      return BODY_VARIANT_IDS;
    case "capabilities":
      return KAPABILITAETEN.map((e) => e.id);
    case "bodyMarks":
      return BODY_MARK_IDS;
    default:
      return [];
  }
}

/**
 * Die deutsche Bezeichnung eines Wertes.
 *
 * RUECKFALL AUF DIE ROHE ID STATT EINES WURFS: eine Spec aus einem geteilten Link
 * kann einen Wert tragen, den das Paket nicht mehr fuehrt — die Kennung zu zeigen
 * ist dann die ehrlichere Auskunft als eine leere Stelle. Dass der Rueckfall nicht
 * zum Normalfall wird, sichert `vokabular.test.ts` ab.
 */
export function bezeichnung(feld: keyof SymbolSpec | string, id: string): string {
  switch (feld) {
    case "kind":
      return symbolKindLabel(id as never) ?? id;
    case "organization":
      return ORGANIZATION_LABELS[id as never] ?? id;
    case "technicalFill":
      return FARBWORTE[id] ?? id;
    case "strength":
      return STRENGTH_LABELS[id as never] ?? id;
    case "administrativeLevel":
      return ADMIN_LEVEL_LABELS[id as never] ?? id;
    case "technicalHeadMark":
      return TECHNICAL_HEAD_MARK_LABELS[id as never] ?? id;
    case "functionRole":
      return sicherFunktionstitel(id);
    case "vehicleCategory":
      return VEHICLE_CATEGORY_LABELS[id as never] ?? id;
    case "bodyVariant":
      return koerperformName(id);
    case "capabilities":
      return KAPABILITAET_TITEL.get(id) ?? id;
    case "bodyMarks":
      return koerpermarkeName(id);
    default:
      return id;
  }
}

function sicherFunktionstitel(id: string): string {
  try {
    return functionRole(id as never).title;
  } catch {
    return id;
  }
}

/**
 * Koerpermarken sind zweierlei: rein geometrische technische Marken mit eigenem
 * Vorlesetext, und Faehigkeitspiktogramme in ihrer randbuendigen Fassung. Fuer die
 * zweite Gruppe traegt `pictogram('capability.<id>')` den Titel — und wirft bei
 * einer unbekannten ID, deshalb der try/catch.
 */
function koerpermarkeName(id: string): string {
  const technisch = (TECHNICAL_BODY_MARK_LABELS as Record<string, string>)[id];
  if (technisch !== undefined) return technisch;
  try {
    return pictogram(`capability.${id}` as never).title;
  } catch {
    return id;
  }
}
