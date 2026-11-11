import { check, choices } from "@einsatzzeichen/core";
import type { BodySign, SignChoiceField, SignText } from "@einsatzzeichen/schema";

/**
 * DIE ABSCHNITTE DES BAUKASTENS — auf der Beschreibung (`Sign`, Einsatzzeichen 7; IDA-408), nach dem Vorbild des
 * Einsatzzeichen-Baukastens (ESZ-150). Nur der Baukasten im Browser lädt diese Datei (`grenze.test.ts`).
 *
 * Welche Werte passen, sagt das Paket selbst: `choices(zeichen, feld)` setzt jeden Wert in die Beschreibung und prüft
 * sie streng, mit deutschem Namen, Gruppe und Grund. Die Sperrlogik über den Bauplan (`vocabulary`, `checkSpec`) und
 * die eigenen Namenstabellen sind damit weg.
 *
 * ⛔ EIN BEDIENFELD JE ABSCHNITT. „Organisation oder Farbe“ bündelt zwei Felder, die sich ausschließen; das Paket
 * ersetzt das eine durch das andere, der Baukasten leert es im selben Schritt (`setzeAbschnitt`). Die Kopfzone ist in
 * der Beschreibung schon EIN Feld (`head`: Stärke, Verband, Verwaltungsstufe oder Kopfmarke).
 *
 * FACHAUFGABEN statt Fähigkeiten und Körpermarken: ob eine Aufgabe randbündig oder in der Box steht, wählt das Paket.
 * Technische Körpermarken, Fassungen und Messwerte trägt die Beschreibung unter `exact`; der Baukasten bietet sie nicht
 * an, behält sie aber, wenn ein Zeichen sie schon hat (alte Baupläne, die `parse` über `fromExact` liest).
 *
 * NICHT IM BAUKASTEN: Zustände und Tendenz (Lagedarstellung, nicht Kommunikationsplan) und die weiße Innenkontur
 * (Anhang E, nur über `exact`). Eine Beschreibung, die sie trägt, zeichnet trotzdem — sie entsteht nur hier nicht.
 */
export type WahlFeld = Exclude<SignChoiceField, "states">;

export interface Abschnitt {
  key: string;
  titel: string;
  felder: readonly WahlFeld[];
  /** `mehrfach`: Liste zum Anhängen (Fachaufgaben); `einzeln`: ein Wert aus allen Feldern des Abschnitts. */
  art: "einzeln" | "mehrfach";
}

export const ABSCHNITTE: readonly Abschnitt[] = [
  { key: "grundzeichen", titel: "Grundzeichen", felder: ["kind"], art: "einzeln" },
  { key: "zugehoerigkeit", titel: "Organisation oder Farbe", felder: ["organization", "color"], art: "einzeln" },
  { key: "kopf", titel: "Über dem Körper", felder: ["head"], art: "einzeln" },
  { key: "funktion", titel: "Funktion", felder: ["role"], art: "einzeln" },
  { key: "koerperform", titel: "Körperform", felder: ["variant"], art: "einzeln" },
  { key: "fahrwerk", titel: "Fahrwerk", felder: ["chassis"], art: "einzeln" },
  { key: "fachaufgaben", titel: "Fachaufgaben", felder: ["tasks"], art: "mehrfach" },
];

/** Die Abschnitte, die der Baukasten bei jeder Änderung sofort prüft; die Fachaufgaben kosten ~0,4 s und warten aufs Öffnen. */
export const SOFORT_GEPRUEFT: readonly WahlFeld[] = ["kind", "organization", "color", "head", "role", "variant", "chassis"];

export const FELDTITEL: Record<WahlFeld, string> = {
  kind: "Grundzeichen", organization: "Organisation", color: "Farbe", head: "Über dem Körper", role: "Funktion",
  variant: "Körperform", chassis: "Fahrwerk", tasks: "Fachaufgaben",
};

/**
 * Die Textzonen, wie der Einsatzzeichen-Baukasten sie anbietet: fünf im Körper, dazu außerhalb die Fußzone unter dem
 * Körper (`below`, im Bauplan `designation`) und vier weitere. Die Lage leitet das Paket ab; was nicht passt, meldet die Vorschau.
 */
export const ZONEN_IM_KOERPER = ["center", "topLeft", "bottomLeft", "bottomCenter", "bottomRight"] as const;
export const ZONEN_AUSSEN = ["below", "aboveLeft", "belowRight", "surfaceBelowLeft", "surfaceBelowRight"] as const;
export type Zone = (typeof ZONEN_IM_KOERPER)[number] | (typeof ZONEN_AUSSEN)[number];
export const ZONENNAMEN: Record<Zone, string> = {
  center: "Mitte", topLeft: "Oben links", bottomLeft: "Unten links", bottomCenter: "Unten mittig", bottomRight: "Unten rechts",
  below: "Unter dem Körper", aboveLeft: "Über dem Zeichen links", belowRight: "Unter dem Zeichen rechts",
  surfaceBelowLeft: "Darunter links", surfaceBelowRight: "Darunter rechts",
};

/** Größe des mittigen Textes: die belegten Stufen der Beschreibung, „Groß“ ist die Versalhöhe der Ortszeichen D.2.3 bis D.2.5. */
export const MITTELGROESSEN = [
  { wert: "normal", name: "Normal" },
  { wert: "large", name: "Groß" },
] as const;
export type Mittelgroesse = (typeof MITTELGROESSEN)[number]["wert"];

export function mittelgroesse(zeichen: BodySign): Mittelgroesse {
  return zeichen.text?.centerSize === "large" ? "large" : "normal";
}

function mitText(zeichen: BodySign, text: Record<string, unknown>): BodySign {
  return setze(zeichen, [["text", Object.keys(text).length ? text : undefined]]);
}

export function setzeMittelgroesse(zeichen: BodySign, groesse: Mittelgroesse): BodySign {
  const text: Record<string, unknown> = { ...(zeichen.text ?? {}) };
  if (groesse === "normal") delete text.centerSize;
  else text.centerSize = groesse;
  return mitText(zeichen, text);
}

/**
 * Eine Textzone setzen oder leeren. Mit dem mittigen Text fällt auch seine Größe weg; ein Text unter dem Körper
 * verdrängt das Fahrwerk, das denselben Platz braucht (chassis-foot-conflict).
 */
export function setzeText(zeichen: BodySign, zone: Zone, wert: string): BodySign {
  const text: Record<string, unknown> = { ...(zeichen.text ?? {}) };
  if (wert.trim() === "") {
    delete text[zone];
    if (zone === "center") delete text.centerSize;
  } else text[zone] = wert;
  const neu = mitText(zeichen, text);
  return zone === "below" && wert.trim() !== "" ? setze(neu, [["chassis", undefined]]) : neu;
}

export function textIn(zeichen: BodySign, zone: Zone): string {
  return ((zeichen.text as SignText | undefined)?.[zone] as string | undefined) ?? "";
}

/** Ein Wert eines Feldes mit Namen und Befund. `abgeleitet`: frei, aber an keinem Original vermessen. */
export interface Wertbefund { wert: string; name: string; gruppe?: string; frei: boolean; grund?: string; abgeleitet?: true }

/** Ohne Texte geprobt: ein zu langer Text ließe sonst jeden Wert scheitern. Der Textbefund gehört an die Vorschau. */
export function ohneTexte(zeichen: BodySign): BodySign {
  return setze(zeichen, [["text", undefined]]);
}

function abgeleitet(zeichen: BodySign): boolean {
  try {
    const r = check(zeichen);
    return r.ok && r.fidelity === "derived";
  } catch {
    return false;
  }
}

/**
 * Welche Werte eines Feldes zur übrigen Beschreibung passen. Einzelwerte ersetzen den gesetzten Wert, Fachaufgaben
 * hängen an — so fragt `choices` selbst. Der gesetzte Wert wird nie gesperrt, sonst ließe er sich nicht mehr abwählen.
 * `abgeleitet` markiert nur Werte, die die Ableitung selbst auslösen: ist die Probe ohne Kandidat schon abgeleitet,
 * trüge sonst jeder Kandidat die Marke.
 */
export function befunde(zeichen: BodySign, feld: WahlFeld): Wertbefund[] {
  const probe = ohneTexte(zeichen);
  const vorher = abgeleitet(probe);
  try {
    return choices(probe, feld).map((c) => {
      const basis = { wert: c.value, name: c.label, ...(c.group ? { gruppe: c.group } : {}) };
      if (c.selected) return { ...basis, frei: true };
      if (c.status === "blocked") return { ...basis, frei: false, grund: c.why ?? "Passt hier nicht" };
      return c.status === "derived" && !vorher ? { ...basis, frei: true, abgeleitet: true } : { ...basis, frei: true };
    });
  } catch {
    // Ein Programmfehler im Paket: lieber nur den gesetzten Wert anbieten und die Vorschau urteilen lassen.
    return gesetzt(zeichen, feld).map((wert) => ({ wert, name: wert, frei: true }));
  }
}

/** Ein Abschnitt erscheint, wenn wenigstens ein Wert passt oder einer gesetzt ist (ESZ-150): am Fahrzeug keine Funktion. */
export function sichtbar(zeichen: BodySign, abschnitt: Abschnitt, befund: ReadonlyMap<WahlFeld, readonly Wertbefund[]>): boolean {
  return abschnitt.felder.some((f) => gesetzt(zeichen, f).length > 0 || !befund.has(f) || befund.get(f)!.some((b) => b.frei));
}

/** Die gesetzten Werte eines Feldes (bei Fachaufgaben alle, sonst höchstens einer). */
export function gesetzt(zeichen: BodySign, feld: WahlFeld): string[] {
  const wert = (zeichen as unknown as Record<string, unknown>)[feld];
  if (Array.isArray(wert)) return wert.map(String);
  return typeof wert === "string" && wert !== "" ? [wert] : [];
}

/**
 * Ein Feld setzen oder entfernen. Leerer Text, leere Liste und `undefined` heißen „nicht gesetzt“.
 */
export function setze(zeichen: BodySign, paare: readonly (readonly [string, unknown])[]): BodySign {
  const neu: Record<string, unknown> = { ...zeichen };
  for (const [feld, wert] of paare) {
    if (wert === undefined || wert === "" || (Array.isArray(wert) && wert.length === 0)) delete neu[feld];
    else neu[feld] = wert;
  }
  return neu as unknown as BodySign;
}

/**
 * Einen Abschnitt auf einen Wert setzen: die übrigen Felder desselben Abschnitts in DEMSELBEN Schritt leeren — zwei
 * aufeinanderfolgende Setzungen rechneten vom selben Stand aus, und das konkurrierende Feld bliebe stehen. Ein
 * Fahrwerk verdrängt den Text unter dem Körper.
 */
export function setzeAbschnitt(zeichen: BodySign, abschnitt: Abschnitt, feld: WahlFeld | null, wert: string | null): BodySign {
  const paare: [string, unknown][] = abschnitt.felder.filter((f) => f !== feld).map((f) => [f, undefined]);
  if (feld !== null) paare.push([feld, wert === null ? undefined : feld === "tasks" ? [wert] : wert]);
  const neu = setze(zeichen, paare);
  if (feld === "chassis" && wert !== null && neu.text?.below) {
    const text: Record<string, unknown> = { ...neu.text };
    delete text.below;
    return mitText(neu, text);
  }
  return neu;
}

/** Der gesetzte Wert eines Abschnitts als `feld:wert`, oder `null`. */
export function gewaehlt(zeichen: BodySign, abschnitt: Abschnitt): string | null {
  for (const feld of abschnitt.felder) {
    const [wert] = gesetzt(zeichen, feld);
    if (wert !== undefined) return `${feld}:${wert}`;
  }
  return null;
}

/** Ein weggelassenes Feld (`tasks`, `head`, `text.center`, `exact.labels` …) in Wörtern vom Bildschirm. */
export function feldname(pfad: string): string {
  const [kopf, rest] = pfad.split(".");
  if (kopf === "text") return rest && rest in ZONENNAMEN ? `Text „${ZONENNAMEN[rest as Zone]}“` : "Text";
  if (kopf in FELDTITEL) return FELDTITEL[kopf as WahlFeld];
  return "Weitere Angaben";
}

/** Erklärtexte des Pakets ohne Sätze mit Feldnamen in Backticks („Setze `technicalFill` …") — die sagen Anwendern nichts. */
export function ohneFeldnamen(text: string): string {
  return text.split(/(?<=[.!?])\s+/).filter((s) => !s.includes("`")).join(" ");
}
