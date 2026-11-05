/**
 * Umsysteme des Einsatztagebuchs (IDA-359), heute nur Suchlage. Die Suite hält die Verbindung
 * (Adresse und Großbild-Token, Tabelle `umsystem`) und fragt die Einsätze für die Rechner ab
 * (`api/umsysteme`). Das Token verlässt die Suite nie: Weder der Browser der Verwaltung noch ein
 * Rechner bekommen es zu sehen.
 *
 * Ein Einsatz gehört zu höchstens einem Eintrag: Sobald ein versiegelter Block ihn nennt
 * (`umsystem_verknuepfung`, gemeldet mit dem Anker), fehlt er in der Auswahl, und die Suite meldet
 * ihn Suchlage, das ihn daraufhin nicht mehr löschen lässt (`gibVerknuepfungenWeiter`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { suchlageLinkAus } from "@/core/suchlage/link";
import { umsystem, umsystemVerknuepfung } from "../_db/schema";
import { zeitpunktInZone } from "./anbindung/stammdatenpaket";
import type { UmsystemEinsatzAuswahl } from "./anbindung/vertrag";
import type { Db } from "./stammdaten/daten";

export const SUCHLAGE = "suchlage";

/** Was die Verwaltung von der Verbindung sieht: die Adresse, nie das Token. */
export interface SuchlageVerbindung {
  adresse: string;
  aktualisiertAm: Date;
  aktualisiertVon: string;
  /** Suchlage lehnt das Sperren ab: Der Link ist ein reiner Anzeige-Zugang. */
  sperreAbgelehnt: boolean;
}

export function leseSuchlage(db: Db): SuchlageVerbindung | null {
  const zeile = db.select().from(umsystem).where(eq(umsystem.system, SUCHLAGE)).get();
  return zeile
    ? { adresse: zeile.adresse, aktualisiertAm: zeile.aktualisiertAm, aktualisiertVon: zeile.aktualisiertVon, sperreAbgelehnt: zeile.sperreAbgelehntAm !== null }
    : null;
}

export const suchlageEingabe = z.object({
  link: z
    .string()
    .trim()
    .max(500)
    .refine((t) => suchlageLinkAus(t) !== null, "Das ist kein Großbild-Link aus Suchlage.")
    // Das Token geht bei jedem Abruf als Bearer mit, über http also im Klartext.
    .refine((t) => suchlageLinkAus(t)?.adresse.startsWith("https://") !== false, "Der Großbild-Link muss mit https:// beginnen."),
}).strict();

/** Verbindet mit dem Großbild-Link aus Suchlage (`https://…/kiosk#<token>`); ersetzt eine bestehende Verbindung. */
export function verbindeSuchlage(db: Db, link: string, von: string, jetzt: Date): SuchlageVerbindung {
  const teile = suchlageLinkAus(link);
  if (!teile) throw new Error("kein Großbild-Link");
  const zeile = { system: SUCHLAGE, adresse: teile.adresse, token: teile.token, aktualisiertAm: jetzt, aktualisiertVon: von, sperreAbgelehntAm: null };
  db.insert(umsystem).values(zeile)
    .onConflictDoUpdate({ target: umsystem.system, set: { adresse: zeile.adresse, token: zeile.token, aktualisiertAm: jetzt, aktualisiertVon: von, sperreAbgelehntAm: null } })
    .run();
  return { adresse: teile.adresse, aktualisiertAm: jetzt, aktualisiertVon: von, sperreAbgelehnt: false };
}

export function trenneSuchlage(db: Db): void {
  db.delete(umsystem).where(eq(umsystem.system, SUCHLAGE)).run();
}

/** Antwort von Suchlage, `GET /api/einsatztagebuch/v1/einsaetze` (`src/contract/einsatztagebuch.rs` dort). */
const suchlageAntwort = z.object({
  api_version: z.literal(1),
  missions: z.array(z.object({
    id: z.number().int(),
    name: z.string(),
    location: z.string().nullable(),
    state: z.enum(["running", "closed"]),
    started_at_ms: z.number().int().nullable(),
    closed_at_ms: z.number().int().nullable(),
  })),
});

export type Abruf = (url: string, init: RequestInit) => Promise<Response>;
const standardAbruf: Abruf = (url, init) => fetch(url, init);

export type Einsatzliste =
  | { ok: true; einsaetze: UmsystemEinsatzAuswahl[] }
  | { ok: false; grund: "nicht_verbunden" | "nicht_erreichbar" | "abgelehnt" };

const ZEITLIMIT_MS = 10_000;
/** Die Grenzen des Readers (`einsatzSchema`, `umsysteme`): Ein längerer Name würde beim Versiegeln abgelehnt. */
const NAME_HOECHSTENS = 200;

/**
 * Fragt die laufenden und kürzlich abgeschlossenen Suchlage-Einsätze ab (Zeitraum: Vorgabe von
 * Suchlage, 7 Tage). Ein Fehler wird zum Grund, nie zur Ausnahme: Der Rechner zeigt dann nur, dass
 * Suchlage gerade nicht antwortet.
 */
export async function suchlageEinsaetze(db: Db, abruf: Abruf = standardAbruf): Promise<Einsatzliste> {
  const zeile = db.select().from(umsystem).where(eq(umsystem.system, SUCHLAGE)).get();
  if (!zeile) return { ok: false, grund: "nicht_verbunden" };
  await gibVerknuepfungenWeiter(db, abruf);
  let antwort: Response;
  try {
    antwort = await abruf(`${zeile.adresse}/api/einsatztagebuch/v1/einsaetze`, {
      headers: { Authorization: `Bearer ${zeile.token}`, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(ZEITLIMIT_MS),
    });
  } catch {
    return { ok: false, grund: "nicht_erreichbar" };
  }
  if (antwort.status === 401) return { ok: false, grund: "abgelehnt" };
  if (!antwort.ok) return { ok: false, grund: "nicht_erreichbar" };
  let roh: unknown;
  try {
    roh = await antwort.json();
  } catch {
    return { ok: false, grund: "nicht_erreichbar" };
  }
  const geprueft = suchlageAntwort.safeParse(roh);
  if (!geprueft.success) return { ok: false, grund: "nicht_erreichbar" };
  // Auch, was Suchlage noch nicht bestätigt hat: Vergeben ist ein Einsatz ab der Meldung hier.
  const vergeben = new Set(
    db.select({ id: umsystemVerknuepfung.einsatzId }).from(umsystemVerknuepfung)
      .where(eq(umsystemVerknuepfung.system, SUCHLAGE)).all().map((v) => v.id),
  );
  return {
    ok: true,
    einsaetze: geprueft.data.missions.filter((m) => !vergeben.has(String(m.id))).slice(0, 200).map((m) => ({
      system: SUCHLAGE,
      id: String(m.id),
      name: m.name.slice(0, NAME_HOECHSTENS),
      ort: m.location ? m.location.slice(0, 200) : null,
      beginn: m.started_at_ms === null ? null : zeitpunktInZone(new Date(m.started_at_ms)),
      ende: m.closed_at_ms === null ? null : zeitpunktInZone(new Date(m.closed_at_ms)),
    })),
  };
}

/** Höchstens so viele Meldungen je Lauf; der nächste Lauf nimmt den Rest. */
const WEITERGABE_JE_LAUF = 50;

/**
 * Meldet Suchlage die Einsätze, die ein versiegelter Block nennt und die Suchlage noch nicht
 * bestätigt hat (`POST /api/einsatztagebuch/v1/einsaetze/{id}/verknuepfung`). Suchlage lässt sie
 * danach nicht mehr löschen. Ein 204 oder 404 (den Einsatz gibt es nicht mehr, es ist nichts zu
 * sperren) erledigt die Meldung; jede andere Antwort und jeder Netzfehler beendet den Lauf, die
 * Meldung bleibt offen für den nächsten (Anker-Meldung, Abfrage der Liste). Ein 403 heißt: Der
 * Link ist ein reiner Anzeige-Zugang ohne „Für die IUK-Suite“; die Verwaltung sieht das an der
 * Verbindung (`sperreAbgelehnt`), bis ein Sperren gelingt. Ohne Verbindung bleiben alle offen.
 * Wirft nie.
 */
export async function gibVerknuepfungenWeiter(db: Db, abruf: Abruf = standardAbruf, jetzt: () => Date = () => new Date()): Promise<void> {
  const zeile = db.select().from(umsystem).where(eq(umsystem.system, SUCHLAGE)).get();
  if (!zeile) return;
  const offen = db.select({ id: umsystemVerknuepfung.einsatzId }).from(umsystemVerknuepfung)
    .where(and(eq(umsystemVerknuepfung.system, SUCHLAGE), isNull(umsystemVerknuepfung.weitergegebenAm)))
    .limit(WEITERGABE_JE_LAUF).all();
  for (const { id } of offen) {
    let status: number;
    try {
      const antwort = await abruf(`${zeile.adresse}/api/einsatztagebuch/v1/einsaetze/${encodeURIComponent(id)}/verknuepfung`, {
        method: "POST",
        headers: { Authorization: `Bearer ${zeile.token}` },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(ZEITLIMIT_MS),
      });
      status = antwort.status;
    } catch {
      return;
    }
    if (status === 403) {
      db.update(umsystem).set({ sperreAbgelehntAm: jetzt() }).where(eq(umsystem.system, SUCHLAGE)).run();
      return;
    }
    if (status !== 204 && status !== 404) return;
    if (zeile.sperreAbgelehntAm !== null) {
      db.update(umsystem).set({ sperreAbgelehntAm: null }).where(eq(umsystem.system, SUCHLAGE)).run();
      zeile.sperreAbgelehntAm = null;
    }
    db.update(umsystemVerknuepfung).set({ weitergegebenAm: jetzt() })
      .where(and(eq(umsystemVerknuepfung.system, SUCHLAGE), eq(umsystemVerknuepfung.einsatzId, id))).run();
  }
}
