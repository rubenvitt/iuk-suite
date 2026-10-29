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
import { alsPublicLinks, type PublicLink } from "./links";
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

/** Verkehrslage auf der Karte. Fluss und Baustellen kommen von TomTom und brauchen den Schlüssel. */
export interface Verkehr {
  fluss: boolean;
  baustellen: boolean;
  /** Feste Blitzer aus OpenStreetMap; der Monitor im FüKw zeigt sie nie, nur der Online-Monitor. */
  blitzer: boolean;
}

/** TomTom-Schlüssel sind Buchstaben und Ziffern (heute 32 Zeichen); so prüft auch der Lagemonitor. */
export const TOMTOM_SCHLUESSEL = /^[A-Za-z0-9]{16,64}$/;

/** Zoomstufe der Karte ohne Einsatz (maplibre). Der Lagemonitor rückt Werte außerhalb auf den Rand. */
export const KARTEN_ZOOM = { min: 5, max: 16, vorgabe: 9 } as const;

export const MITMACHEN_TEXT_VORGABE = "Lust mitzuhelfen? Werde Teil der Bereitschaft.";
export const MITMACHEN_MAX_ZEICHEN = 60;

/** Was die Seite sieht. Das Großbild-Token bleibt auf dem Server; die Seite erfährt nur, ob eins da ist. */
export interface KonfigurationDTO {
  standortName: string;
  standortBreite: number;
  standortLaenge: number;
  kartenZoom: number;
  regionArs: string;
  regionName: string;
  warnschwelle: Warnschwelle;
  module: Module;
  suchlageAdresse: string | null;
  suchlageVerbunden: boolean;
  suchlage: SuchlageTeile;
  mitmachen: Mitmachen;
  verkehr: Verkehr;
  /** Ob ein TomTom-Schlüssel hinterlegt ist. Den Schlüssel selbst bekommt die Seite nie. */
  tomtomHinterlegt: boolean;
  /** `null`, solange noch niemand gespeichert hat (dann gelten die Vorgaben). */
  aktualisiertAm: string | null;
  aktualisiertVon: string | null;
}

/** Vorgabe bis zum ersten Speichern: Uelzen, alles außer Suchlage an — wie der Lagemonitor ohne Suite. */
export const VORGABE: KonfigurationDTO = {
  standortName: "Uelzen",
  standortBreite: 52.9656,
  standortLaenge: 10.5594,
  kartenZoom: KARTEN_ZOOM.vorgabe,
  regionArs: "033600000000",
  regionName: "Landkreis Uelzen",
  warnschwelle: "Severe",
  module: { wetter: true, radar: true, warngebiete: true, warnliste: true, suchlage: false },
  suchlageAdresse: null,
  suchlageVerbunden: false,
  suchlage: { flugspuren: true, gebiete: true, drohnenbild: true },
  mitmachen: { an: false, adresse: "", text: MITMACHEN_TEXT_VORGABE },
  verkehr: { fluss: false, baustellen: false, blitzer: false },
  tomtomHinterlegt: false,
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
    kartenZoom: z
      .number({ error: "Bitte eine Zahl angeben." })
      .min(KARTEN_ZOOM.min, `Zwischen ${KARTEN_ZOOM.min} und ${KARTEN_ZOOM.max}.`)
      .max(KARTEN_ZOOM.max, `Zwischen ${KARTEN_ZOOM.min} und ${KARTEN_ZOOM.max}.`)
      .default(KARTEN_ZOOM.vorgabe),
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
    verkehr: z.object({ fluss: schalter, baustellen: schalter, blitzer: schalter }).default({ fluss: false, baustellen: false, blitzer: false }),
    /** Leer: der bisherige Schlüssel bleibt. Sonst ein neuer TomTom-Schlüssel. */
    tomtomSchluessel: z.string().trim().max(200).default(""),
    /** Entfernt den hinterlegten Schlüssel. */
    tomtomEntfernen: z.boolean().default(false),
  })
  .superRefine((e, ctx) => {
    if (e.mitmachen.an && !istWebadresse(e.mitmachen.adresse)) {
      ctx.addIssue({ code: "custom", path: ["mitmachen", "adresse"], message: "Bitte eine Webadresse angeben, die mit https:// beginnt." });
    }
    if (e.mitmachen.an && e.mitmachen.text === "") {
      ctx.addIssue({ code: "custom", path: ["mitmachen", "text"], message: "Bitte einen kurzen Satz neben den Code schreiben." });
    }
    if (e.tomtomSchluessel !== "" && !TOMTOM_SCHLUESSEL.test(e.tomtomSchluessel)) {
      ctx.addIssue({
        code: "custom",
        path: ["tomtomSchluessel"],
        message: "Das ist kein TomTom-Schlüssel. Er besteht nur aus Buchstaben und Ziffern, meist 32 Zeichen (developer.tomtom.com unter Keys).",
      });
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
    kartenZoom: z.kartenZoom,
    regionArs: z.regionArs,
    regionName: z.regionName,
    warnschwelle: z.warnschwelle as Warnschwelle,
    module: { wetter: z.wetter, radar: z.radar, warngebiete: z.warngebiete, warnliste: z.warnliste, suchlage: z.suchlage },
    suchlageAdresse: z.suchlageAdresse,
    suchlageVerbunden: z.suchlageAdresse !== null && z.suchlageToken !== null,
    suchlage: { flugspuren: z.suchlageFlugspuren, gebiete: z.suchlageGebiete, drohnenbild: z.suchlageDrohnenbild },
    mitmachen: { an: z.mitmachen, adresse: z.mitmachenAdresse ?? "", text: z.mitmachenText ?? MITMACHEN_TEXT_VORGABE },
    verkehr: { fluss: z.verkehrFluss, baustellen: z.verkehrBaustellen, blitzer: z.verkehrBlitzer },
    tomtomHinterlegt: z.tomtomSchluessel !== null,
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
    kartenZoom: e.kartenZoom,
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
    verkehrFluss: e.verkehr.fluss,
    verkehrBaustellen: e.verkehr.baustellen,
    verkehrBlitzer: e.verkehr.blitzer,
    tomtomSchluessel: e.tomtomEntfernen ? null : e.tomtomSchluessel !== "" ? e.tomtomSchluessel : (alt?.tomtomSchluessel ?? null),
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
  /** Links für Rechner ohne Anmeldung (`_lib/links.ts`), nur als Hash. Ältere Monitore übergehen das Feld. */
  publicLinks: PublicLink[];
  /** Verkehrslage; der Schlüssel geht nur hier hinaus. Ältere Monitore übergehen das Feld. */
  traffic: { tomtomKey: string | null; flow: boolean; incidents: boolean; speedCameras: boolean };
  /** Kartenausschnitt ohne Einsatz. Ältere Monitore übergehen das Feld und bleiben bei Zoom 9. */
  map: { zoom: number };
}

export function alsVertrag(db: LagemonitorDb, jetzt = new Date()): Vertrag {
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
    notices: alsNotices(db, jetzt),
    publicLinks: alsPublicLinks(db),
    traffic: {
      tomtomKey: z?.tomtomSchluessel ?? null,
      flow: k.verkehr.fluss,
      incidents: k.verkehr.baustellen,
      speedCameras: k.verkehr.blitzer,
    },
    map: { zoom: k.kartenZoom },
  };
}
