/**
 * Der Standort je Monitor (IDA-333): Jeder Zugang ist ein Monitor und hat seinen eigenen Ort. Meldet über den Zugang
 * ein Fahrzeug (`fahrzeug.zugangId`, `_lib/fahrzeuge.ts`), steht der Monitor dort, wo dessen GPS ihn zuletzt sah;
 * sonst an einem festen Ort mit eigenem taktischen Zeichen, etwa der Online-Monitor an der Unterkunft. Feste Orte
 * stehen wie Fahrzeuge auf allen Monitoren (`festeOrte`).
 *
 * Vorher galt ein Ort für alle Monitore (Spalten `standort_*` an der Anzeige); `0009_standort_je_zugang.sql` hat
 * ihn an jeden vorhandenen Zugang kopiert.
 */
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { LagemonitorDb } from "../_db/client";
import { fahrzeug, zugang } from "../_db/schema";
import { POSITION_HOECHSTALTER_MS, QUELLEN, sicher, type Quellen, type Vehicle } from "./fahrzeuge";
import { STANDORT_VORGABE, type Vertrag } from "./konfiguration";

/** Ein fester Ort im Drahtformat: `id` mit eigenem Präfix, damit sie nie mit einer Fahrzeug-ID zusammenfällt. */
export const ORT_PRAEFIX = "ort-";

type ZugangZeile = typeof zugang.$inferSelect;

function hatOrt(z: ZugangZeile): z is ZugangZeile & { ortName: string; ortBreite: number; ortLaenge: number } {
  return z.ortName !== null && z.ortBreite !== null && z.ortLaenge !== null;
}

/**
 * Wo der Monitor dieses Zugangs steht, für `location` im Drahtformat. Mit Fahrzeug die letzte gemeldete Position
 * (der Monitor nimmt den eigenen Fix, sobald er einen hat), ohne Position der eingestellte Ort; fehlt auch der, die
 * Vorgabe. Der Name ist immer der eingestellte.
 */
export function standortFuer(db: LagemonitorDb, zugangId: string, jetzt = new Date()): Vertrag["location"] {
  const z = db.select().from(zugang).where(eq(zugang.id, zugangId)).get();
  if (!z) return { ...STANDORT_VORGABE };
  const label = z.ortName ?? z.bezeichnung;
  const f = db.select().from(fahrzeug).where(eq(fahrzeug.zugangId, zugangId)).get();
  if (f && f.breite !== null && f.laenge !== null && f.gemeldetAm && jetzt.getTime() - f.gemeldetAm.getTime() <= POSITION_HOECHSTALTER_MS) {
    return { lat: f.breite, lon: f.laenge, label };
  }
  if (z.ortBreite !== null && z.ortLaenge !== null) return { lat: z.ortBreite, lon: z.ortLaenge, label };
  return { ...STANDORT_VORGABE, label };
}

/**
 * Die festen Orte als Einträge in `vehicles`: jeder Zugang ohne Fahrzeug, mit Ort und Zeichen. `at` ist der Zeitpunkt
 * des Anlegens, nicht jetzt: sonst änderte jede Abholung den Körper, und der ETag (`_lib/etag.ts`) liefe ins Leere.
 */
export function festeOrte(db: LagemonitorDb, zugangId: string | null, q: Quellen = QUELLEN): Vehicle[] {
  const zeilen = db.select({ z: zugang, fahrzeugId: fahrzeug.id }).from(zugang).leftJoin(fahrzeug, eq(fahrzeug.zugangId, zugang.id)).all()
    .filter((r) => r.fahrzeugId === null && r.z.ortZeichen !== null && hatOrt(r.z)).map((r) => r.z);
  if (zeilen.length === 0) return [];
  const bilder = sicher(() => q.svg(zeilen.map((z) => z.ortZeichen!)), {});
  return zeilen.flatMap((z) => {
    const symbol = bilder[z.ortZeichen!];
    if (!symbol || !hatOrt(z)) return [];
    return [{ id: `${ORT_PRAEFIX}${z.id}`, callSign: z.ortName, symbol, lat: z.ortBreite, lon: z.ortLaenge, at: z.angelegtAm.toISOString(), own: z.id === zugangId, fixed: true }];
  });
}

/** Was die Verwaltung je Zugang zeigt. */
export interface StandortDTO {
  art: "gps" | "fest";
  name: string | null;
  breite: number | null;
  laenge: number | null;
  zeichen: string | null;
  /** Vorschau des Zeichens: beim GPS das des Fahrzeugs, sonst das eigene; `null`, wenn kommplan es nicht kennt. */
  svg: string | null;
  fahrzeugId: string | null;
  /** Funkrufname des Fahrzeugs; `null` ohne Fahrzeug oder wenn die Fahrzeugverwaltung es nicht mehr kennt. */
  fahrzeugName: string | null;
}

export interface StandortAuswahl {
  /** Alle Fahrzeuge auf der Karte, mit dem Zugang, über den sie schon melden. */
  fahrzeuge: { id: string; funkrufname: string; zugangId: string | null }[];
  zeichen: { schluessel: string; titel: string }[];
}

export function listeStandorte(db: LagemonitorDb, q: Quellen = QUELLEN): { je: Record<string, StandortDTO>; auswahl: StandortAuswahl } {
  const zugaenge = db.select().from(zugang).all();
  const fahrzeuge = db.select().from(fahrzeug).all();
  const namen = new Map(sicher(q.stamm, []).map((s) => [s.id, s.funkrufname]));
  const bilder = sicher(() => q.svg([...zugaenge.flatMap((z) => (z.ortZeichen ? [z.ortZeichen] : [])), ...fahrzeuge.map((f) => f.zeichen)]), {});
  const je: Record<string, StandortDTO> = {};
  for (const z of zugaenge) {
    const f = fahrzeuge.find((x) => x.zugangId === z.id);
    je[z.id] = {
      art: f ? "gps" : "fest",
      name: z.ortName,
      breite: z.ortBreite,
      laenge: z.ortLaenge,
      zeichen: z.ortZeichen,
      svg: (f ? bilder[f.zeichen] : z.ortZeichen ? bilder[z.ortZeichen] : null) ?? null,
      fahrzeugId: f?.id ?? null,
      fahrzeugName: f ? (namen.get(f.stammId) ?? null) : null,
    };
  }
  return {
    je,
    auswahl: {
      fahrzeuge: fahrzeuge.map((f) => ({ id: f.id, funkrufname: namen.get(f.stammId) ?? "Fahrzeug fehlt in der Fahrzeugverwaltung", zugangId: f.zugangId }))
        .sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de", { numeric: true })),
      zeichen: sicher(q.zeichen, []),
    },
  };
}

const koordinate = (grenze: number) =>
  z.number({ error: "Bitte eine Zahl angeben." }).min(-grenze, `Zwischen -${grenze} und ${grenze}.`).max(grenze, `Zwischen -${grenze} und ${grenze}.`);

const gemeinsam = {
  zugangId: z.string().min(1).max(64),
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(60, "Höchstens 60 Zeichen."),
};

export const standortEingabe = z.discriminatedUnion("art", [
  z.object({
    ...gemeinsam,
    art: z.literal("gps"),
    fahrzeugId: z.string({ error: "Bitte ein Fahrzeug wählen." }).min(1, "Bitte ein Fahrzeug wählen.").max(64),
    breite: koordinate(90).nullable(),
    laenge: koordinate(180).nullable(),
  }).strict(),
  z.object({
    ...gemeinsam,
    art: z.literal("fest"),
    breite: koordinate(90),
    laenge: koordinate(180),
    zeichen: z.string({ error: "Bitte ein Zeichen wählen." }).min(1, "Bitte ein Zeichen wählen.").max(80),
  }).strict(),
]);
export type StandortEingabe = z.infer<typeof standortEingabe>;

/**
 * Setzt den Standort eines Zugangs. GPS hängt das gewählte Fahrzeug an den Zugang (und ein anderes, das bisher über
 * ihn meldete, ab); fest löst das Fahrzeug. Alles wird gegen die Datenbank und kommplan geprüft, nichts kommt
 * ungeprüft aus dem Formular.
 */
export function setzeStandort(db: LagemonitorDb, e: StandortEingabe, q: Quellen = QUELLEN): { ok: true } | { ok: false; fehler: string } {
  if (!db.select({ id: zugang.id }).from(zugang).where(eq(zugang.id, e.zugangId)).get()) return { ok: false, fehler: "Diesen Zugang gibt es nicht mehr." };
  if (e.art === "gps") {
    const f = db.select().from(fahrzeug).where(eq(fahrzeug.id, e.fahrzeugId)).get();
    if (!f) return { ok: false, fehler: "Dieses Fahrzeug steht nicht (mehr) auf der Karte." };
    if (f.zugangId !== null && f.zugangId !== e.zugangId) return { ok: false, fehler: "Dieses Fahrzeug meldet schon über einen anderen Zugang." };
    db.transaction((tx) => {
      tx.update(fahrzeug).set({ zugangId: null }).where(and(eq(fahrzeug.zugangId, e.zugangId), ne(fahrzeug.id, f.id))).run();
      tx.update(fahrzeug).set({ zugangId: e.zugangId }).where(and(eq(fahrzeug.id, f.id), or(isNull(fahrzeug.zugangId), eq(fahrzeug.zugangId, e.zugangId)))).run();
      // Ohne Zeichen: fällt das Fahrzeug später weg, wird der Ort bis zum ersten Fix nicht zum festen Ort auf allen Monitoren.
      tx.update(zugang).set({ ortName: e.name, ortBreite: e.breite, ortLaenge: e.laenge, ortZeichen: null }).where(eq(zugang.id, e.zugangId)).run();
    });
    return { ok: true };
  }
  if (!sicher(() => q.svg([e.zeichen]), {})[e.zeichen]) return { ok: false, fehler: "Dieses Zeichen gibt es nicht (mehr)." };
  db.transaction((tx) => {
    tx.update(fahrzeug).set({ zugangId: null }).where(eq(fahrzeug.zugangId, e.zugangId)).run();
    tx.update(zugang).set({ ortName: e.name, ortBreite: e.breite, ortLaenge: e.laenge, ortZeichen: e.zeichen }).where(eq(zugang.id, e.zugangId)).run();
  });
  return { ok: true };
}
