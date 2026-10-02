import { and, eq, inArray, or } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan, planMitglied } from "../_db/schema";

/**
 * RECHTE AN EINEM PLAN — die eine Stelle, an der entschieden wird, wer einen Plan sehen, bearbeiten und verwalten
 * darf. Rein bis auf die zwei Lader unten; jede Seite, jede Action und die Planliste fragen hier.
 *
 * - PRIVAT (Vorgabe beim Anlegen, Import, Duplizieren): nur der Eigentümer — auch kein Modul-Admin. Für jeden
 *   anderen ist der Plan ein 404, nie ein „kein Zugriff": sonst verriete die Antwort, dass es ihn gibt.
 * - ORGANISATION: sehen und drucken alle mit Modulzugang (den prüft `requireKommplanZugang` vorher); bearbeiten
 *   Eigentümer, Modul-Admins und die eingeladenen Bearbeitenden (`plan_mitglied`); verwalten — teilen, Links
 *   ausstellen, einladen, archivieren — nur Eigentümer und Modul-Admins.
 * - ALTBESTAND ohne Eigentümer ist geteilt und gehört den Modul-Admins (Migration 0003).
 *
 * Ein Token-Link ist davon unabhängig: wer ihn hat, sieht den Plan ohne Anmeldung, auch einen privaten — das ist
 * das „Veröffentlichen über einen Link", und ausstellen darf ihn nur, wer verwaltet.
 */
export const SICHTBARKEITEN = ["privat", "organisation"] as const;
export type Sichtbarkeit = (typeof SICHTBARKEITEN)[number];

/** Wer fragt: die Kennung (`sub`) und ob er das Modul administriert (`darfKommplanBearbeiten`). */
export interface Person { nutzer: string | null; admin: boolean }
export interface Besitz { sichtbarkeit: Sichtbarkeit; eigentuemer: string | null; mitglied: boolean }
export interface PlanRechte { sehen: boolean; bearbeiten: boolean; verwalten: boolean }
export const KEINE_RECHTE: PlanRechte = { sehen: false, bearbeiten: false, verwalten: false };

export function rechteFuer(b: Besitz, wer: Person): PlanRechte {
  const eigen = wer.nutzer !== null && b.eigentuemer === wer.nutzer;
  if (b.sichtbarkeit === "privat") return { sehen: eigen, bearbeiten: eigen, verwalten: eigen };
  const verwalten = eigen || wer.admin;
  return { sehen: true, bearbeiten: verwalten || b.mitglied, verwalten };
}

/** Was `wer` sehen darf: die geteilten und die eigenen privaten — als SQL, für Listen und Prüfungen. */
export const sichtbarFuer = (wer: Person) => (wer.nutzer === null ? eq(plan.sichtbarkeit, "organisation")
  : or(eq(plan.sichtbarkeit, "organisation"), eq(plan.eigentuemer, wer.nutzer))!);

/** Wer einen geteilten Plan sieht, aber das nicht darf (die Oberfläche bietet es dann gar nicht an). */
export const NICHT_ERLAUBT = "Das dürfen bei diesem Plan nur sein Eigentümer und die Modul-Admins.";

/** Die Pläne, in die diese Person eingeladen ist — einmal je Liste, nicht je Zeile. */
export function mitgliedIn(db: KommplanDb, nutzer: string | null, planIds?: readonly string[]): Set<string> {
  if (nutzer === null || planIds?.length === 0) return new Set();
  const wo = planIds ? and(eq(planMitglied.nutzer, nutzer), inArray(planMitglied.planId, [...planIds])) : eq(planMitglied.nutzer, nutzer);
  return new Set(db.select({ planId: planMitglied.planId }).from(planMitglied).where(wo).all().map((z) => z.planId));
}

/** Die Rechte an EINEM Plan, aus der Datenbank aufgelöst (IDOR: nie aus der Anfrage). Unbekannt → keine. */
export function rechteAn(db: KommplanDb, planId: string, wer: Person): PlanRechte {
  const z = db.select({ sichtbarkeit: plan.sichtbarkeit, eigentuemer: plan.eigentuemer }).from(plan).where(eq(plan.id, planId)).get();
  if (!z) return KEINE_RECHTE;
  return rechteFuer({ ...z, mitglied: mitgliedIn(db, wer.nutzer, [planId]).has(planId) }, wer);
}
