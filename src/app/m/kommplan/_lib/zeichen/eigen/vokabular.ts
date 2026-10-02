import {
  ADMIN_LEVEL_LABELS,
  ALL_PICTOGRAMS,
  ORGANIZATION_LABELS,
  SPEC_FIELD_VALUES,
  STRENGTH_LABELS,
  TECHNICAL_BODY_MARK_LABELS,
  TECHNICAL_HEAD_MARK_LABELS,
  UNIT_GROUPING_LABELS,
  VEHICLE_CATEGORY_LABELS,
  functionRole,
  symbolKindLabel,
  vocabulary,
} from "@einsatzzeichen/core";
import type { SymbolSpec } from "@einsatzzeichen/schema";

/**
 * DIE ACHSEN DES BAUKASTENS (Vorbild: der Baukasten des früheren Moduls `zeichen`, DRK-465, dort
 * `_ui/baukasten/vokabular.ts`). Nur der Baukasten im Browser lädt diese Datei (`grenze.test.ts`).
 *
 * Gemessen trug im Katalog 1.1.0 nur 0,4 % aller Kombinationen der Hauptachsen (M16) — der Baukasten SPERRT
 * deshalb, statt hinterher zu meckern. Welche Werte passen, sagt seit core 3.0.0 das Paket selbst
 * (`vocabulary`: jeder Kandidat wird gezeichnet); die frühere Eigenbau-Probe entfällt.
 *
 * ⛔ EIN BEDIENFELD JE ACHSE, NICHT JE SPEC-FELD. Drei Achsen bündeln Felder, die sich denselben Platz teilen:
 * Zugehörigkeit (`organization`/`technicalFill`, technical-fill-organization-conflict), Kopfzone (Stärke,
 * Verwaltungsstufe, technische Kopfmarke, Verband — head-zone-conflict) und der Streifen unter dem Körper
 * (`vehicleCategory`/`designation`, chassis-foot-conflict). Drei Felder nebeneinander luden dazu ein, zwei zu setzen.
 *
 * NICHT IM BAUKASTEN: Zustände und Tendenz (Lagedarstellung, nicht Kommunikationsplan) und die weiße
 * Innenkontur (Anhang E). Eine Spec, die sie trägt, zeichnet trotzdem — sie entsteht nur hier nicht.
 */
export type WahlFeld =
  | "kind" | "organization" | "technicalFill" | "strength" | "administrativeLevel" | "technicalHeadMark" | "unitGrouping"
  | "functionRole" | "bodyVariant" | "vehicleCategory" | "capabilities" | "bodyMarks";

export interface Achse {
  key: string;
  titel: string;
  felder: readonly WahlFeld[];
  hilfe: string;
  /** `mehrfach`: Liste zum Anhängen (Körpermarken); `einzeln`: ein Wert aus allen Quellen der Achse. */
  art: "einzeln" | "mehrfach";
}

export const ACHSEN: readonly Achse[] = [
  { key: "grundzeichen", titel: "Grundzeichen", felder: ["kind"], art: "einzeln", hilfe: "Die Form. Sie entscheidet, was es darunter überhaupt gibt." },
  { key: "zugehoerigkeit", titel: "Organisation oder Füllung", felder: ["organization", "technicalFill"], art: "einzeln", hilfe: "Die Farbe des Körpers — Organisation oder technische Füllung, nicht beides." },
  { key: "kopfzone", titel: "Über dem Körper", felder: ["strength", "administrativeLevel", "technicalHeadMark", "unitGrouping"], art: "einzeln", hilfe: "Stärke, Verwaltungsstufe, Kopfmarke oder Verband — sie teilen sich den Platz." },
  { key: "funktion", titel: "Funktion", felder: ["functionRole"], art: "einzeln", hilfe: "Führungs- und Funktionszeichen mit festem Kürzel." },
  { key: "koerperform", titel: "Körperform", felder: ["bodyVariant"], art: "einzeln", hilfe: "Eine zweite, belegte Zeichnung desselben Grundzeichens." },
  { key: "unten", titel: "Unter dem Körper", felder: ["vehicleCategory"], art: "einzeln", hilfe: "Fahrzeugkategorie — oder unten ein eigener Text." },
  { key: "faehigkeit", titel: "Fähigkeit", felder: ["capabilities"], art: "einzeln", hilfe: "Ein Piktogramm im Körper." },
  { key: "koerpermarken", titel: "Körpermarken", felder: ["bodyMarks"], art: "mehrfach", hilfe: "Mehrere möglich." },
];

export const FELDTITEL: Record<WahlFeld, string> = {
  kind: "Grundzeichen", organization: "Organisation", technicalFill: "Technische Füllung", strength: "Stärke",
  administrativeLevel: "Verwaltungsstufe", technicalHeadMark: "Kopfmarke", unitGrouping: "Verband", functionRole: "Funktion",
  bodyVariant: "Körperform", vehicleCategory: "Fahrzeugkategorie", capabilities: "Fähigkeit", bodyMarks: "Körpermarke",
};

export const LISTENFELDER: readonly WahlFeld[] = ["capabilities", "bodyMarks"];

/** Die fünf Beschriftungszonen im Körper. */
export const ZONEN = ["center", "topLeft", "bottomLeft", "bottomCenter", "bottomRight"] as const;
export type Zone = (typeof ZONEN)[number];
export const ZONENNAMEN: Record<Zone, string> = {
  center: "Mitte", topLeft: "Oben links", bottomLeft: "Unten links", bottomCenter: "Unten mittig", bottomRight: "Unten rechts",
};

/**
 * Deutsche Wörter für die Farbtoken. Das Paket führt dafür kein Register; ein Token wie `funktionslauf-kontrast`
 * hat in einer Auswahl nichts verloren (`vokabular.test.ts` hält die Liste gegen den Wertevorrat).
 */
export const FARBWORTE: Record<string, string> = {
  schwarz: "Schwarz", "funktionslauf-kontrast": "Schwarz (Funktionslauf)", "koerperlauf-kontrast": "Schwarz (Körperlauf)",
  weiss: "Weiß", rot: "Rot", blau: "Blau", gelb: "Gelb", gruen: "Grün", hellgruen: "Hellgrün", orange: "Orange",
  braun: "Braun", grau: "Grau", hellgrau: "Hellgrau", hellblau: "Hellblau",
};

/** Körperformen: das Paket exportiert keine Namen (Liste aus dem früheren Modul `zeichen`, `_lib/bezeichnungen.ts`). */
export const KOERPERFORMEN: Record<string, string> = {
  "raised-hull": "Angehobener Rumpf",
  "inset-hull": "Eingesenkter Rumpf",
  "foot-band": "Fußband",
  "plain-wheel-pair": "Radpaar ohne Zusatz",
  "raised-gable": "Kreis mit Giebel",
  "inverted-hull-track": "Umgekehrter Rumpf mit Kette",
  "fixed-wing-hull": "Starrflügelrumpf",
  "raised-circle-1mm": "Um 1 mm angehobener Kreis",
  "compact-person-diamond-26mm": "Kompakte Personenraute 26 mm",
  "compact-person-diamond-26mm-lowered-2mm": "Kompakte Personenraute 26 mm, 2 mm tiefer",
};

const PIKTOGRAMMTITEL = new Map<string, string>(ALL_PICTOGRAMS.filter((p) => p.variant === "primary").map((p) => [p.id, p.title]));

/** Der Wertevorrat eines Feldes, wie `parseSpec` ihn annimmt. */
export function kandidaten(feld: WahlFeld): readonly string[] {
  return (SPEC_FIELD_VALUES[feld] as { values: readonly string[] }).values;
}

/** Deutscher Name eines Wertes; Rückfall auf die rohe Kennung statt eines Wurfs. */
export function bezeichnung(feld: WahlFeld, id: string): string {
  const aus = (o: Readonly<Record<string, string>>) => o[id] ?? id;
  switch (feld) {
    case "kind": return symbolKindLabel(id as never) ?? id;
    case "organization": return aus(ORGANIZATION_LABELS);
    case "technicalFill": return FARBWORTE[id] ?? id;
    case "strength": return aus(STRENGTH_LABELS);
    case "administrativeLevel": return aus(ADMIN_LEVEL_LABELS);
    case "technicalHeadMark": return aus(TECHNICAL_HEAD_MARK_LABELS);
    case "unitGrouping": return aus(UNIT_GROUPING_LABELS);
    case "vehicleCategory": return aus(VEHICLE_CATEGORY_LABELS);
    case "bodyVariant": return KOERPERFORMEN[id] ?? id;
    case "capabilities": return PIKTOGRAMMTITEL.get(`capability.${id}`) ?? id;
    case "functionRole":
      try { return functionRole(id as never).title; } catch { return id; }
    case "bodyMarks":
      return (TECHNICAL_BODY_MARK_LABELS as Readonly<Record<string, string>>)[id] ?? PIKTOGRAMMTITEL.get(`capability.${id}`) ?? id;
  }
}

export interface Wertbefund { wert: string; frei: boolean; grund?: string }

/**
 * Welche Werte eines Feldes zur übrigen Auswahl passen — `vocabulary` zeichnet jeden Kandidaten. Bei einer Achse mit
 * EINEM Wert wird gegen die Spec OHNE diese Achse geprobt (gefragt ist „ersetzen", nicht „dazu"); bei den
 * Körpermarken gegen die volle Liste („anhängen"). Der gesetzte Wert wird nie gesperrt, sonst ließe er sich nicht
 * mehr abwählen. Für `kind` fragt das Paket, welche Grundform die übrige Auswahl trägt.
 *
 * ⛔ GEPROBT WIRD OHNE FREIE TEXTE (`ohneTexte`): ein zu langer Text ließe sonst jede Probe mit `label-too-wide`
 * scheitern, und jede Achse stünde gesperrt — wegen eines Tippfehlers im Textfeld. Der Textverstoß gehört an das
 * Textfeld; dorthin bringt ihn `zeichneEigenes` mit der vollen Spec.
 */
export function befunde(spec: SymbolSpec, achse: Achse, feld: WahlFeld): Wertbefund[] {
  const ohne = ohneTexte(spec);
  const probe = achse.art === "einzeln" && feld !== "kind" ? setze(ohne, achse.felder.map((f) => [f, undefined] as const)) : ohne;
  const jetzt = gewaehlt(spec, achse);
  const liste = LISTENFELDER.includes(feld) ? ((spec as unknown as Record<string, unknown>)[feld] as string[] | undefined) ?? [] : [];
  try {
    return vocabulary(probe as never, feld as never).map((o) => {
      const wert = String(o.value);
      if (o.status === "allowed" || jetzt === `${feld}:${wert}` || liste.includes(wert)) return { wert, frei: true };
      return { wert, frei: false, grund: o.reason === "rule" ? (o.issues[0]?.title ?? "Passt hier nicht") : "Nicht vermessen" };
    });
  } catch {
    // Ein Programmfehler beim Zeichnen eines Kandidaten (das Paket wirft dann): lieber alles anbieten und die
    // Vorschau urteilen lassen, als die Achse leer zu zeigen.
    return kandidaten(feld).map((wert) => ({ wert, frei: true }));
  }
}

export function ohneTexte(spec: SymbolSpec): SymbolSpec {
  const rest: Record<string, unknown> = { ...spec };
  delete rest.designation;
  delete rest.labels;
  return rest as unknown as SymbolSpec;
}

/**
 * Ein Feld setzen oder entfernen. Leerer Text, leere Liste und `undefined` heißen „nicht gesetzt": ein
 * `designation: ""` wäre eine LEERE Beschriftung statt keiner.
 */
export function setze(spec: SymbolSpec, paare: readonly (readonly [string, unknown])[]): SymbolSpec {
  const neu: Record<string, unknown> = { ...spec };
  for (const [feld, wert] of paare) {
    if (wert === undefined || wert === "" || (Array.isArray(wert) && wert.length === 0)) delete neu[feld];
    else neu[feld] = wert;
  }
  return neu as unknown as SymbolSpec;
}

/** Eine Beschriftungszone setzen oder leeren. */
export function setzeZone(spec: SymbolSpec, zone: Zone, text: string): SymbolSpec {
  const labels: Record<string, unknown> = { ...(spec.labels ?? {}) };
  if (text.trim() === "") delete labels[zone];
  else labels[zone] = text;
  return setze(spec, [["labels", Object.keys(labels).length ? labels : undefined]]);
}

/**
 * Eine Achse auf einen Wert setzen: die übrigen Quellen derselben Achse in DEMSELBEN Schritt leeren — zwei
 * aufeinanderfolgende Setzungen rechneten vom selben Stand aus, und das konkurrierende Feld bliebe stehen.
 */
export function setzeAchse(spec: SymbolSpec, achse: Achse, feld: WahlFeld | null, wert: string | null): SymbolSpec {
  const paare: [string, unknown][] = achse.felder.filter((f) => f !== feld).map((f) => [f, undefined]);
  if (achse.key === "unten" && feld !== null) paare.push(["designation", undefined]);
  if (feld !== null && wert !== null) paare.push([feld, LISTENFELDER.includes(feld) ? [wert] : wert]);
  else if (feld !== null) paare.push([feld, undefined]);
  return setze(spec, paare);
}

/** Der gesetzte Wert einer Achse als `feld:wert`, oder `null`. */
export function gewaehlt(spec: SymbolSpec, achse: Achse): string | null {
  for (const feld of achse.felder) {
    const wert = (spec as unknown as Record<string, unknown>)[feld];
    if (typeof wert === "string" && wert !== "") return `${feld}:${wert}`;
    if (Array.isArray(wert) && wert.length > 0) return `${feld}:${String(wert[0])}`;
  }
  return null;
}

/** Erklärtexte des Pakets ohne Sätze mit Feldnamen in Backticks („Setze `technicalFill` …") — die sagen Anwendern nichts. */
export function ohneFeldnamen(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter((s) => !s.includes("`")).join(" ");
}
