import {
  ADMIN_LEVEL_LABELS,
  ALL_PICTOGRAMS,
  BODY_VARIANT_LABELS,
  LARGE_CENTER_CAP_HEIGHT_MM,
  ORGANIZATION_LABELS,
  SPEC_FIELD_VALUES,
  STRENGTH_LABELS,
  TECHNICAL_BODY_MARK_LABELS,
  TECHNICAL_HEAD_MARK_LABELS,
  UNIT_GROUPING_LABELS,
  VEHICLE_CATEGORY_LABELS,
  checkSpec,
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
 * (`vocabulary`: jeder Kandidat wird gezeichnet). Seit core 4.0.0 leitet es ab statt abzulehnen (DRK-507): eine
 * Fähigkeit oder Körpermarke ohne vermessene Fassung an dieser Körperform überträgt es und meldet `derived`.
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
  { key: "faehigkeit", titel: "Fähigkeiten", felder: ["capabilities"], art: "mehrfach", hilfe: "Piktogramme im Körper, mehrere stehen nebeneinander." },
  { key: "koerpermarken", titel: "Körpermarken", felder: ["bodyMarks"], art: "mehrfach", hilfe: "Mehrere möglich." },
];

export const FELDTITEL: Record<WahlFeld, string> = {
  kind: "Grundzeichen", organization: "Organisation", technicalFill: "Technische Füllung", strength: "Stärke",
  administrativeLevel: "Verwaltungsstufe", technicalHeadMark: "Kopfmarke", unitGrouping: "Verband", functionRole: "Funktion",
  bodyVariant: "Körperform", vehicleCategory: "Fahrzeugkategorie", capabilities: "Fähigkeit", bodyMarks: "Körpermarke",
};

export const LISTENFELDER: readonly WahlFeld[] = ["capabilities", "bodyMarks"];

/**
 * Die Beschriftungszonen, wie der Einsatzzeichen-Baukasten sie anbietet (`builder-state.ts`, `LABEL_ZONES`): fünf im
 * Körper, vier außerhalb. Die Lage leitet das Paket ab; was nicht passt, meldet die Vorschau.
 */
export const ZONEN_IM_KOERPER = ["center", "topLeft", "bottomLeft", "bottomCenter", "bottomRight"] as const;
export const ZONEN_AUSSEN = ["aboveLeft", "belowRight", "surfaceBelowLeft", "surfaceBelowRight"] as const;
export const ZONEN = [...ZONEN_IM_KOERPER, ...ZONEN_AUSSEN] as const;
export type Zone = (typeof ZONEN)[number];
export const ZONENNAMEN: Record<Zone, string> = {
  center: "Mitte", topLeft: "Oben links", bottomLeft: "Unten links", bottomCenter: "Unten mittig", bottomRight: "Unten rechts",
  aboveLeft: "Über dem Zeichen links", belowRight: "Unter dem Zeichen rechts", surfaceBelowLeft: "Darunter links", surfaceBelowRight: "Darunter rechts",
};

/**
 * GRÖSSE DES MITTIGEN TEXTES (core 4.2.0): keine freie Zahl, sondern die belegten Stufen. „Normal" setzt nichts (Normhöhe
 * 4,87 mm), „Groß" die Versalhöhe 7,3 mm der Ortszeichen D.2.3 bis D.2.5 („LtS" an der Leitstelle).
 */
export const MITTELGROESSEN = [
  { wert: "normal", name: "Normal", hoehe: undefined },
  { wert: "gross", name: "Groß", hoehe: LARGE_CENTER_CAP_HEIGHT_MM },
] as const;
export type Mittelgroesse = (typeof MITTELGROESSEN)[number]["wert"];

/** Die Stufe der Spec; eine fremde Höhe (aus einem Rezept) zählt als „Normal", sie wird beim Umschalten ersetzt. */
export function mittelgroesse(spec: SymbolSpec): Mittelgroesse {
  return spec.labels?.centerCapHeightMm === LARGE_CENTER_CAP_HEIGHT_MM ? "gross" : "normal";
}

export function setzeMittelgroesse(spec: SymbolSpec, groesse: Mittelgroesse): SymbolSpec {
  const hoehe = MITTELGROESSEN.find((g) => g.wert === groesse)?.hoehe;
  const labels: Record<string, unknown> = { ...(spec.labels ?? {}) };
  if (hoehe === undefined) delete labels.centerCapHeightMm;
  else labels.centerCapHeightMm = hoehe;
  return setze(spec, [["labels", Object.keys(labels).length ? labels : undefined]]);
}

/**
 * Deutsche Wörter für die Farbtoken. Das Paket führt dafür kein Register; ein Token wie `funktionslauf-kontrast`
 * hat in einer Auswahl nichts verloren (`vokabular.test.ts` hält die Liste gegen den Wertevorrat).
 */
export const FARBWORTE: Record<string, string> = {
  schwarz: "Schwarz", weiss: "Weiß", rot: "Rot", blau: "Blau", gelb: "Gelb", gruen: "Grün", hellgruen: "Hellgrün", orange: "Orange",
  braun: "Braun", grau: "Grau", hellgrau: "Hellgrau", hellblau: "Hellblau",
};

/** Körperformen: seit core 4.2.0 benennt das Paket sie selbst (dieselben Wörter wie im Einsatzzeichen-Baukasten). */
export const KOERPERFORMEN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BODY_VARIANT_LABELS as Readonly<Record<string, string>>).map(([id, name]) => [id, name.charAt(0).toUpperCase() + name.slice(1)]),
);

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

/** `abgeleitet`: frei, aber an keinem Original vermessen — das Paket hat eine Nachbarfassung übertragen (core 4.0.0). */
export interface Wertbefund { wert: string; frei: boolean; grund?: string; abgeleitet?: true }

/**
 * Welche Werte eines Feldes zur übrigen Auswahl passen — `vocabulary` zeichnet jeden Kandidaten. Bei einer Achse mit
 * EINEM Wert wird gegen die Spec OHNE diese Achse geprobt (gefragt ist „ersetzen", nicht „dazu"); bei den
 * Fähigkeiten und Körpermarken gegen die volle Liste („anhängen"). Der gesetzte Wert wird nie gesperrt, sonst ließe er sich nicht
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
  // `derived` gilt der ganzen Zeichnung: ist schon die Probe ohne Kandidat abgeleitet, trüge JEDER Kandidat die Marke.
  const vorher = abgeleitet(probe);
  try {
    return vocabulary(probe as never, feld as never).map((o) => {
      const wert = String(o.value);
      if (o.status === "allowed") return o.derived && !vorher ? { wert, frei: true, abgeleitet: true } : { wert, frei: true };
      if (jetzt === `${feld}:${wert}` || liste.includes(wert)) return { wert, frei: true };
      return { wert, frei: false, grund: o.reason === "rule" ? (o.issues[0]?.title ?? "Passt hier nicht") : "Nicht vermessen" };
    });
  } catch {
    // Ein Programmfehler beim Zeichnen eines Kandidaten (das Paket wirft dann): lieber alles anbieten und die
    // Vorschau urteilen lassen, als die Achse leer zu zeigen.
    return kandidaten(feld).map((wert) => ({ wert, frei: true }));
  }
}

function abgeleitet(spec: SymbolSpec): boolean {
  try {
    const r = checkSpec(spec);
    return r.ok && (r.drawing.derivations?.length ?? 0) > 0;
  } catch {
    return false;
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

/** Eine Beschriftungszone setzen oder leeren. Mit dem mittigen Text fällt auch seine Größe weg (sonst lehnt das Paket ab). */
export function setzeZone(spec: SymbolSpec, zone: Zone, text: string): SymbolSpec {
  const labels: Record<string, unknown> = { ...(spec.labels ?? {}) };
  if (text.trim() === "") {
    delete labels[zone];
    if (zone === "center") delete labels.centerCapHeightMm;
  } else labels[zone] = text;
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

/**
 * Die abgeleiteten Teile einer Zeichnung (`Zeichnung.abgeleitet`) in Wörtern vom Bildschirm. Das Paket schreibt die
 * Dimension mal als Spec-Feld (`bodyMarks`), mal als Kebab (`body-marks`), Texte als `labels.<zone>`.
 */
export function abgeleiteteTeile(dimensionen: readonly string[]): string[] {
  const namen = dimensionen.map((d) => {
    if (d === "label" || d.startsWith("labels")) return "Beschriftung";
    if (d === "head") return "Über dem Körper";
    const feld = d.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()) as WahlFeld;
    return feld in FELDTITEL ? FELDTITEL[feld] : "Weitere Teile";
  });
  return [...new Set(namen)];
}

/** Erklärtexte des Pakets ohne Sätze mit Feldnamen in Backticks („Setze `technicalFill` …") — die sagen Anwendern nichts. */
export function ohneFeldnamen(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter((s) => !s.includes("`")).join(" ");
}
