/**
 * Was der Lagemonitor im FüKw zeigt: lesen, prüfen, speichern und als Drahtformat ausgeben. Das
 * Drahtformat (`alsVertrag`) liest der Lagemonitor in `src/sources/suite.rs` (Repo `lagemonitor`);
 * ein neues Feld darf dazukommen (ältere Monitore übergehen es), Umbenennen oder Weglassen ist eine
 * neue `version`.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { LagemonitorDb } from "../_db/client";
import { anzeige } from "../_db/schema";
import { alsNotices, type Notice } from "./meldungen";

export const VERTRAG_VERSION = 1;
const ZEILE = "anzeige";

/** Die vier Stufen von NINA/DWD, aufsteigend. Ab der gewählten Stufe bekommt eine Warnung das Band. */
export const WARNSCHWELLEN = [
  { wert: "Minor", text: "Wetterwarnung", erklaerung: "Schon die einfache Wetterwarnung bekommt das Band." },
  { wert: "Moderate", text: "Markante Warnung", erklaerung: "Ab markantem Wetter, etwa Sturmböen oder Dauerregen." },
  { wert: "Severe", text: "Unwetterwarnung", erklaerung: "Erst ab Unwetter. Leichtere Warnungen stehen nur in der Liste." },
  { wert: "Extreme", text: "Extremes Unwetter", erklaerung: "Nur bei extremem Unwetter. Alles darunter steht nur in der Liste." },
] as const;
export type Warnschwelle = (typeof WARNSCHWELLEN)[number]["wert"];
const SCHWELLEN_WERTE = WARNSCHWELLEN.map((s) => s.wert) as [Warnschwelle, ...Warnschwelle[]];

/** Rang einer Stufe (0 = Minor); die Vorschau vergleicht damit wie der Lagemonitor in `selectLayout.ts`. */
export function rang(s: Warnschwelle): number {
  return SCHWELLEN_WERTE.indexOf(s);
}

export interface Module {
  wetter: boolean;
  radar: boolean;
  warngebiete: boolean;
  warnliste: boolean;
  suchlage: boolean;
}

export interface SuchlageTeile {
  flugspuren: boolean;
  gebiete: boolean;
  drohnenbild: boolean;
}

/** QR-Code fürs Ehrenamt: wer am Bildschirm vorbeikommt, findet darüber zur Bereitschaft. */
export interface Mitmachen {
  an: boolean;
  adresse: string;
  text: string;
}

export const MITMACHEN_TEXT_VORGABE = "Lust mitzuhelfen? Werde Teil der Bereitschaft.";
export const MITMACHEN_MAX_ZEICHEN = 60;

/** Was die Seite sieht. Das Großbild-Token bleibt auf dem Server; die Seite erfährt nur, ob eins da ist. */
export interface KonfigurationDTO {
  standortName: string;
  standortBreite: number;
  standortLaenge: number;
  regionArs: string;
  regionName: string;
  warnschwelle: Warnschwelle;
  module: Module;
  suchlageAdresse: string | null;
  suchlageVerbunden: boolean;
  suchlage: SuchlageTeile;
  mitmachen: Mitmachen;
  /** `null`, solange noch niemand gespeichert hat (dann gelten die Vorgaben). */
  aktualisiertAm: string | null;
  aktualisiertVon: string | null;
}

/** Vorgabe bis zum ersten Speichern: Uelzen, alles außer Suchlage an — wie der Lagemonitor ohne Suite. */
export const VORGABE: KonfigurationDTO = {
  standortName: "Uelzen",
  standortBreite: 52.9656,
  standortLaenge: 10.5594,
  regionArs: "033600000000",
  regionName: "Landkreis Uelzen",
  warnschwelle: "Severe",
  module: { wetter: true, radar: true, warngebiete: true, warnliste: true, suchlage: false },
  suchlageAdresse: null,
  suchlageVerbunden: false,
  suchlage: { flugspuren: true, gebiete: true, drohnenbild: true },
  mitmachen: { an: false, adresse: "", text: MITMACHEN_TEXT_VORGABE },
  aktualisiertAm: null,
  aktualisiertVon: null,
};

/**
 * Der Großbild-Link aus Suchlage (Verwaltung → Großbild): `https://suchlage.example/kiosk#<64 hex>`.
 * Daraus werden Adresse (alles vor `/kiosk`) und Token. `null`, wenn der Text kein solcher Link ist.
 */
export function suchlageLinkAus(text: string): { adresse: string; token: string } | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const token = url.hash.slice(1);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const pfad = url.pathname.replace(/\/+$/, "");
  if (!pfad.endsWith("/kiosk")) return null;
  return { adresse: url.origin + pfad.slice(0, -"/kiosk".length), token };
}

const schalter = z.boolean();

/** Nur `https://` mit Host: ein QR-Code, der auf `http://` oder etwas anderes zeigt, landet nicht am Monitor. */
export function istWebadresse(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

export const konfigurationEingabe = z
  .object({
    standortName: z.string().trim().min(1, "Bitte einen Namen angeben.").max(60, "Höchstens 60 Zeichen."),
    standortBreite: z.number({ error: "Bitte eine Zahl angeben." }).min(-90, "Zwischen -90 und 90.").max(90, "Zwischen -90 und 90."),
    standortLaenge: z.number({ error: "Bitte eine Zahl angeben." }).min(-180, "Zwischen -180 und 180.").max(180, "Zwischen -180 und 180."),
    regionArs: z.string().trim().regex(/^\d{12}$/, "Der Regionalschlüssel hat genau 12 Ziffern."),
    regionName: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80, "Höchstens 80 Zeichen."),
    warnschwelle: z.enum(SCHWELLEN_WERTE),
    module: z.object({ wetter: schalter, radar: schalter, warngebiete: schalter, warnliste: schalter, suchlage: schalter }),
    suchlage: z.object({ flugspuren: schalter, gebiete: schalter, drohnenbild: schalter }),
    mitmachen: z
      .object({
        an: schalter,
        adresse: z.string().trim().max(300, "Höchstens 300 Zeichen.").default(""),
        text: z.string().trim().max(MITMACHEN_MAX_ZEICHEN, `Höchstens ${MITMACHEN_MAX_ZEICHEN} Zeichen.`).default(""),
      })
      .default({ an: false, adresse: "", text: "" }),
    /** Leer: der bisherige Link bleibt. Sonst ein neuer Großbild-Link. */
    suchlageLink: z.string().max(500).default(""),
    /** Trennt die Verbindung zu Suchlage (Adresse und Token weg). */
    suchlageTrennen: z.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    if (e.mitmachen.an && !istWebadresse(e.mitmachen.adresse)) {
      ctx.addIssue({ code: "custom", path: ["mitmachen", "adresse"], message: "Bitte eine Webadresse angeben, die mit https:// beginnt." });
    }
    if (e.mitmachen.an && e.mitmachen.text === "") {
      ctx.addIssue({ code: "custom", path: ["mitmachen", "text"], message: "Bitte einen kurzen Satz neben den Code schreiben." });
    }
    if (e.suchlageLink.trim() !== "" && !suchlageLinkAus(e.suchlageLink)) {
      ctx.addIssue({
        code: "custom",
        path: ["suchlageLink"],
        message: "Das ist kein Großbild-Link. Er sieht so aus: https://…/kiosk#… (in Suchlage unter Großbild).",
      });
    }
  });
export type KonfigurationEingabe = z.infer<typeof konfigurationEingabe>;

type Zeile = typeof anzeige.$inferSelect;

function dtoAus(z: Zeile): KonfigurationDTO {
  return {
    standortName: z.standortName,
    standortBreite: z.standortBreite,
    standortLaenge: z.standortLaenge,
    regionArs: z.regionArs,
    regionName: z.regionName,
    warnschwelle: z.warnschwelle as Warnschwelle,
    module: { wetter: z.wetter, radar: z.radar, warngebiete: z.warngebiete, warnliste: z.warnliste, suchlage: z.suchlage },
    suchlageAdresse: z.suchlageAdresse,
    suchlageVerbunden: z.suchlageAdresse !== null && z.suchlageToken !== null,
    suchlage: { flugspuren: z.suchlageFlugspuren, gebiete: z.suchlageGebiete, drohnenbild: z.suchlageDrohnenbild },
    mitmachen: { an: z.mitmachen, adresse: z.mitmachenAdresse ?? "", text: z.mitmachenText ?? MITMACHEN_TEXT_VORGABE },
    aktualisiertAm: z.aktualisiertAm.toISOString(),
    aktualisiertVon: z.aktualisiertVon,
  };
}

function zeile(db: LagemonitorDb): Zeile | undefined {
  return db.select().from(anzeige).where(eq(anzeige.id, ZEILE)).get();
}

export function leseKonfiguration(db: LagemonitorDb): KonfigurationDTO {
  const z = zeile(db);
  return z ? dtoAus(z) : VORGABE;
}

/** Speichert die ganze Anzeige (eine Zeile, Upsert). */
export function speichereKonfiguration(db: LagemonitorDb, e: KonfigurationEingabe, von: string, jetzt = new Date()): KonfigurationDTO {
  const alt = zeile(db);
  const neu = e.suchlageLink.trim() === "" ? null : suchlageLinkAus(e.suchlageLink);
  const verbindung = e.suchlageTrennen
    ? { suchlageAdresse: null, suchlageToken: null }
    : neu
      ? { suchlageAdresse: neu.adresse, suchlageToken: neu.token }
      : { suchlageAdresse: alt?.suchlageAdresse ?? null, suchlageToken: alt?.suchlageToken ?? null };
  const werte = {
    standortName: e.standortName,
    standortBreite: e.standortBreite,
    standortLaenge: e.standortLaenge,
    regionArs: e.regionArs,
    regionName: e.regionName,
    warnschwelle: e.warnschwelle,
    ...e.module,
    ...verbindung,
    suchlageFlugspuren: e.suchlage.flugspuren,
    suchlageGebiete: e.suchlage.gebiete,
    suchlageDrohnenbild: e.suchlage.drohnenbild,
    // Ausgeschaltet bleiben Adresse und Text stehen, damit das Wiedereinschalten sie nicht neu verlangt.
    mitmachen: e.mitmachen.an,
    mitmachenAdresse: e.mitmachen.adresse === "" ? null : e.mitmachen.adresse,
    mitmachenText: e.mitmachen.text === "" ? null : e.mitmachen.text,
    aktualisiertAm: jetzt,
    aktualisiertVon: von,
  };
  db.insert(anzeige).values({ id: ZEILE, ...werte }).onConflictDoUpdate({ target: anzeige.id, set: werte }).run();
  return leseKonfiguration(db);
}

/** Das Drahtformat für den Lagemonitor (`GET api/konfiguration`). Englisch und camelCase, wie dort. */
export interface Vertrag {
  version: number;
  changedAt: string | null;
  location: { lat: number; lon: number; label: string };
  region: { ars: string; name: string };
  warnThreshold: Warnschwelle;
  modules: { weather: boolean; radar: boolean; warningAreas: boolean; warningList: boolean; suchlage: boolean };
  /** `null`, solange keine Verbindung zu Suchlage eingetragen ist — auch wenn das Modul an ist. */
  suchlage: { url: string; token: string; tracks: boolean; areas: boolean; video: boolean } | null;
  /** QR-Code fürs Ehrenamt; `null`, wenn aus. Ältere Monitore übergehen das Feld. */
  recruitment: { url: string; text: string } | null;
  /** Laufende Meldungen fürs Band (`_lib/meldungen.ts`); seit dem Meldungsband, ältere Monitore übergehen sie. */
  notices: Notice[];
}

export function alsVertrag(db: LagemonitorDb): Vertrag {
  const z = zeile(db);
  const k = z ? dtoAus(z) : VORGABE;
  return {
    version: VERTRAG_VERSION,
    changedAt: k.aktualisiertAm,
    location: { lat: k.standortBreite, lon: k.standortLaenge, label: k.standortName },
    region: { ars: k.regionArs, name: k.regionName },
    warnThreshold: k.warnschwelle,
    modules: {
      weather: k.module.wetter,
      radar: k.module.radar,
      warningAreas: k.module.warngebiete,
      warningList: k.module.warnliste,
      suchlage: k.module.suchlage,
    },
    suchlage:
      z?.suchlageAdresse && z.suchlageToken
        ? { url: z.suchlageAdresse, token: z.suchlageToken, tracks: k.suchlage.flugspuren, areas: k.suchlage.gebiete, video: k.suchlage.drohnenbild }
        : null,
    recruitment: k.mitmachen.an && istWebadresse(k.mitmachen.adresse) ? { url: k.mitmachen.adresse, text: k.mitmachen.text } : null,
    notices: alsNotices(db),
  };
}
