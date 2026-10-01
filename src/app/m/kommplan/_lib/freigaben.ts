import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan, planFreigabe } from "../_db/schema";
import { feldFehlerAus } from "./angaben";
import type { FreigabeErgebnis } from "./ergebnis";
import {
  ablaufFuer, ausstellenSchema, FREIGABE_GRENZE, freigabeStatus, istTokenForm, widerrufenSchema,
  type FreigabeZeile,
} from "./freigabe/regeln";
import { ladePlanLesend, type LesbarerPlan } from "./plaene";
import { PLAN_WEG } from "./planverwaltung";
import type { Bearbeiter } from "./speichern";

/**
 * TOKEN-LINKS IN DER DATENBANK (Spec §8.2; Umsetzungsplan Phase 5, Entscheidungen 1–3, 6, 10) — nur Server.
 * Ein Link wird immer über (Link-ID, Plan-ID) gefunden, nie über die Link-ID allein (IDOR). Ausstellen und
 * Widerrufen sind je eine Audit-Zeile über die Trigger von `plan_freigabe`; die Abrufzähler sind im Katalog
 * `unauditedColumns`. Alles synchron (better-sqlite3): zwischen Zählen und Anlegen liegt kein `await`, also
 * kein zweiter Aufruf dazwischen.
 */
export const neuesToken = (): string => randomBytes(32).toString("base64url");

const UNGUELTIG = { ok: false, fehler: "Ungültige Anfrage.", feldFehler: {} } as const;
const ms = (d: Date | null): number | null => (d === null ? null : d.getTime());

export function freigabenFuer(db: KommplanDb, planId: string, jetzt: number): FreigabeZeile[] {
  const zeilen = db.select().from(planFreigabe).where(eq(planFreigabe.planId, planId))
    .orderBy(desc(planFreigabe.erstelltAm), desc(planFreigabe.id)).all()
    .map((z): FreigabeZeile => {
      const roh = { ablauf: ms(z.ablauf), widerrufenAm: ms(z.widerrufenAm) };
      return {
        id: z.id, token: z.token, notiz: z.notiz, ...roh, erstelltAm: z.erstelltAm.getTime(), erstelltVon: z.erstelltVon,
        zuletztAbgerufen: ms(z.zuletztAbgerufen), abrufe: z.abrufe, status: freigabeStatus(roh, jetzt),
      };
    });
  // stabil: innerhalb der Gruppen bleibt „neueste zuerst"
  return [...zeilen.filter((z) => z.status === "gueltig"), ...zeilen.filter((z) => z.status !== "gueltig")];
}

const istAktiv = (db: KommplanDb, id: string) =>
  db.select({ id: plan.id }).from(plan).where(and(eq(plan.id, id), isNull(plan.archiviertAm))).get() !== undefined;

export function stelleFreigabeAus(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): FreigabeErgebnis {
  const r = ausstellenSchema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: feldFehlerAus(r.error) };
  const { planId, dauer, notiz } = r.data;
  if (!istAktiv(db, planId)) return { ok: false, fehler: PLAN_WEG, feldFehler: {} };
  const gueltig = freigabenFuer(db, planId, jetzt).filter((f) => f.status === "gueltig").length;
  if (gueltig >= FREIGABE_GRENZE.gueltigJePlan) {
    return { ok: false, fehler: `Höchstens ${FREIGABE_GRENZE.gueltigJePlan} gültige Links je Plan. Widerrufe zuerst einen, den niemand mehr braucht.`, feldFehler: {} };
  }
  const id = randomUUID();
  const ablauf = ablaufFuer(dauer, jetzt);
  db.insert(planFreigabe).values({
    id, planId, token: neuesToken(), notiz: notiz === "" ? null : notiz, ablauf: ablauf === null ? null : new Date(ablauf),
    erstelltAm: new Date(jetzt), erstelltVon: wer.name,
  }).run();
  return { ok: true, neu: id, freigaben: freigabenFuer(db, planId, jetzt) };
}

export function widerrufeFreigabe(db: KommplanDb, eingabe: unknown, jetzt: number): FreigabeErgebnis {
  const r = widerrufenSchema.safeParse(eingabe);
  if (!r.success) return UNGUELTIG;
  const { planId, freigabeId } = r.data;
  const da = db.select({ widerrufenAm: planFreigabe.widerrufenAm }).from(planFreigabe)
    .where(and(eq(planFreigabe.id, freigabeId), eq(planFreigabe.planId, planId))).get();
  if (!da) return { ok: false, fehler: "Diesen Link gibt es nicht.", feldFehler: {} };
  if (da.widerrufenAm === null) {
    db.update(planFreigabe).set({ widerrufenAm: new Date(jetzt) })
      .where(and(eq(planFreigabe.id, freigabeId), eq(planFreigabe.planId, planId), isNull(planFreigabe.widerrufenAm))).run();
  }
  return { ok: true, neu: null, freigaben: freigabenFuer(db, planId, jetzt) };
}

export interface TokenTreffer { freigabeId: string; token: string; plan: LesbarerPlan }

/** Gültig = nicht widerrufen, nicht abgelaufen (`ablauf > jetzt`), Plan nicht archiviert. Sonst null — in jedem Fall gleich. */
export function loeseToken(db: KommplanDb, token: string, jetzt: number): TokenTreffer | null {
  if (!istTokenForm(token)) return null;
  const z = db.select({ freigabeId: planFreigabe.id, planId: planFreigabe.planId }).from(planFreigabe)
    .innerJoin(plan, eq(plan.id, planFreigabe.planId))
    .where(and(
      eq(planFreigabe.token, token), isNull(planFreigabe.widerrufenAm),
      or(isNull(planFreigabe.ablauf), gt(planFreigabe.ablauf, new Date(jetzt))), isNull(plan.archiviertAm),
    )).get();
  if (!z) return null;
  const p = ladePlanLesend(db, z.planId);
  return p && p.archiviertAm === null ? { freigabeId: z.freigabeId, token, plan: p } : null;
}

/** Ein Statement, kein Lesen davor, kein Audit (Entscheidung 6). Den Entpreller hält `tokenZugang.ts`. */
export function zaehleAbruf(db: KommplanDb, freigabeId: string, jetzt: number): void {
  db.update(planFreigabe).set({ abrufe: sql`${planFreigabe.abrufe} + 1`, zuletztAbgerufen: new Date(jetzt) })
    .where(eq(planFreigabe.id, freigabeId)).run();
}

