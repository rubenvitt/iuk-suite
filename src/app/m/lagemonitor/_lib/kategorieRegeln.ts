/**
 * Die Regeln einer Meldekategorie ohne Datenbank: Farben, Zeichen, Vorlauf und die Eingabe. Eigene
 * Datei, weil auch die Verwaltung im Browser sie braucht (Auswahl und Vorschau); `kategorien.ts`
 * zieht Drizzle mit.
 *
 * FARBEN SIND EINE FESTE PALETTE, KEIN FARBWÄHLER: der Monitor läuft im Tag- und im Nachtmodus, und
 * jede Farbe hat dort zwei abgestimmte Töne (Repo `lagemonitor`, `frontend/src/monitor/monitor.css`,
 * „Meldekategorien“). Übers Draht geht deshalb nur der Schlüssel (`draht`), nie ein Farbwert. Rot
 * fehlt mit Absicht: am Monitor gehört Rot den Unwetterwarnungen.
 */
import { z } from "zod";
import type { Icons8Name } from "@/core/ikonen/katalog";

export const FARBEN = [
  { wert: "blau", text: "Blau", draht: "blue", ton: "#154e84" },
  { wert: "tuerkis", text: "Türkis", draht: "teal", ton: "#0b6a6a" },
  { wert: "gruen", text: "Grün", draht: "green", ton: "#1c6640" },
  { wert: "ocker", text: "Ocker", draht: "ochre", ton: "#7a5200" },
  { wert: "orange", text: "Orange", draht: "orange", ton: "#a34700" },
  { wert: "violett", text: "Violett", draht: "purple", ton: "#5b3a9e" },
  { wert: "grau", text: "Grau", draht: "grey", ton: "#4a525b" },
] as const;
export type Farbe = (typeof FARBEN)[number]["wert"];
export type FarbeDraht = (typeof FARBEN)[number]["draht"];
const FARB_WERTE = FARBEN.map((f) => f.wert) as [Farbe, ...Farbe[]];

export function farbe(wert: string): (typeof FARBEN)[number] {
  return FARBEN.find((f) => f.wert === wert) ?? FARBEN[0];
}

/** Die Zeichen zur Auswahl, alle aus dem Icons8-Katalog der Suite (`core/ikonen/katalog.ts`). */
export const ZEICHEN = [
  "clipboard",
  "info",
  "megaphone",
  "comment",
  "meeting",
  "people",
  "walkie-talkie",
  "phone",
  "clock",
  "calendar",
  "swap",
  "cutlery",
  "truck",
  "drone",
  "marker",
  "target",
  "warning",
  "fire",
  "wind",
  "sun",
  "moon",
  "heart-pulse",
  "flashlight",
  "wrench",
  "checklist",
  "document",
] as const satisfies readonly Icons8Name[];
export type Zeichen = (typeof ZEICHEN)[number];

/** Wie ein Zeichen vorgelesen wird; die Auswahl zeigt nur das Zeichen. */
export const ZEICHEN_TEXT: Record<Zeichen, string> = {
  clipboard: "Klemmbrett",
  info: "Info",
  megaphone: "Megafon",
  comment: "Sprechblase",
  meeting: "Besprechung",
  people: "Personen",
  "walkie-talkie": "Funkgerät",
  phone: "Telefon",
  clock: "Uhr",
  calendar: "Kalender",
  swap: "Wechsel",
  cutlery: "Besteck",
  truck: "Fahrzeug",
  drone: "Drohne",
  marker: "Ort",
  target: "Ziel",
  warning: "Achtung",
  fire: "Flamme",
  wind: "Wind",
  sun: "Sonne",
  moon: "Mond",
  "heart-pulse": "Herzschlag",
  flashlight: "Taschenlampe",
  wrench: "Werkzeug",
  checklist: "Checkliste",
  document: "Dokument",
};

/** Wie viele Minuten vor der Countdown-Uhrzeit die Meldung blinkt; `null` blinkt nie. */
export const VORLAEUFE = [
  { minuten: null, text: "Nie" },
  { minuten: 2, text: "2 min vorher" },
  { minuten: 5, text: "5 min vorher" },
  { minuten: 10, text: "10 min vorher" },
  { minuten: 15, text: "15 min vorher" },
  { minuten: 30, text: "30 min vorher" },
] as const;
const VORLAUF_WERTE = VORLAEUFE.map((v) => v.minuten) as (number | null)[];

/**
 * Wie lange eine Meldung nach der Uhrzeit weiterblinkt. Danach zeigt sie ruhig „seit 12 min“: wer es
 * bis dahin nicht gesehen hat, sieht es auch blinkend nicht mehr, und ein Dauerblinken stumpft ab.
 */
export const NACHLAUF_MINUTEN = 10;

export const KATEGORIE_NAME_MAX = 24;
/** Mehr passt nicht übersichtlich in die Auswahl beim Anlegen einer Meldung. */
export const KATEGORIEN_MAX = 12;

export interface KategorieDTO {
  id: string;
  name: string;
  zeichen: Zeichen;
  farbe: Farbe;
  vorlaufMinuten: number | null;
}

export const kategorieEingabe = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte einen Namen angeben, etwa „Lagemeldung“.")
    .max(KATEGORIE_NAME_MAX, `Höchstens ${KATEGORIE_NAME_MAX} Zeichen, sonst passt es nicht vor die Meldung.`),
  zeichen: z.enum(ZEICHEN, { message: "Bitte ein Zeichen wählen." }),
  farbe: z.enum(FARB_WERTE, { message: "Bitte eine Farbe wählen." }),
  vorlaufMinuten: z
    .number()
    .nullable()
    .refine((n) => VORLAUF_WERTE.includes(n), "Bitte wählen, wann die Meldung blinkt."),
});
export type KategorieEingabe = z.input<typeof kategorieEingabe>;

/**
 * Blinkt eine Meldung gerade? Ab `vorlaufMinuten` vor der Uhrzeit bis `NACHLAUF_MINUTEN` danach, wie
 * der Lagemonitor (Repo `lagemonitor`, `frontend/src/monitor/countdown.ts`, `isDue`).
 */
export function istFaellig(zielMs: number | null, vorlaufMinuten: number | null, jetztMs: number): boolean {
  if (zielMs === null || vorlaufMinuten === null) return false;
  return jetztMs >= zielMs - vorlaufMinuten * 60_000 && jetztMs < zielMs + NACHLAUF_MINUTEN * 60_000;
}
