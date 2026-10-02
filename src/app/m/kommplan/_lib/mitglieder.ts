import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DirectoryResult } from "@/core/directory";
import type { KommplanDb } from "../_db/client";
import { kommplanPerson, plan, planMitglied } from "../_db/schema";
import { PLAN_WEG } from "./planverwaltung";
import { NICHT_ERLAUBT, rechteAn, type Person } from "./rechte";
import type { Bearbeiter } from "./speichern";

/**
 * TEILEN IN DER ORGANISATION UND EINLADEN (`_lib/rechte.ts`) — nur Server. Jede Funktion löst Plan und Recht selbst
 * gegen die Datenbank auf (IDOR); die Actions in `_actions/teilen.ts` prüfen davor nur den Modulzugang.
 *
 * - TEILEN IST EINE EINBAHNSTRASSE: privat → organisation. Zurück ginge nur, indem man allen, die ihn inzwischen
 *   kennen, still den Plan wegnimmt — dafür gibt es Archivieren. Teilen darf nur der Eigentümer (ein privater Plan
 *   hat keinen anderen Verwalter).
 * - EINLADEN gibt einer Person das Bearbeiten eines GETEILTEN Plans. Ein privater Plan hat keine Eingeladenen: privat
 *   heißt „nur ich". Einladen dürfen Eigentümer und Modul-Admins (verwalten).
 * - GESPEICHERT WIRD DIE KENNUNG (`sub`), der Name nur zum Anzeigen. Die Kennung muss das Modul oder das
 *   Personenverzeichnis kennen — eine frei getippte würde nie greifen. Wer das Modul nie geöffnet hat und nicht im
 *   Verzeichnis steht, ist nicht einladbar; Modulzugang braucht er ohnehin, sonst nützt ihm die Einladung nichts.
 */
export interface Mitglied { nutzer: string; name: string; eingeladenAm: number }
export interface PersonVorschlag { nutzer: string; name: string; email: string | null }
export type TeilenErgebnis = { ok: true; mitglieder: Mitglied[] } | { ok: false; fehler: string };

/** Wie bei `feedback` (`_lib/personen.ts`): ab zwei Zeichen, höchstens zwanzig Treffer je Anschlag — nie der Abzug. */
export const SUCHE_MIN_ZEICHEN = 2;
export const SUCHE_MAX_TREFFER = 20;
/** Mehr Eingeladene hat kein Plan nötig; die Grenze hält die Liste im Flyin lesbar. */
export const MITGLIEDER_GRENZE = 50;

const ID = z.string().min(1).max(64);
const NUTZER = z.string().trim().min(1).max(200);
const UNGUELTIG = { ok: false, fehler: "Ungültige Anfrage." } as const;

export function mitgliederVon(db: KommplanDb, planId: string): Mitglied[] {
  return db.select().from(planMitglied).where(eq(planMitglied.planId, planId)).orderBy(asc(planMitglied.name), planMitglied.nutzer).all()
    .map((z) => ({ nutzer: z.nutzer, name: z.name, eingeladenAm: z.eingeladenAm.getTime() }));
}

/**
 * Wer das Modul mit Zugang öffnet, steht danach in `kommplan_person` (`(intern)/layout.tsx`). Geschrieben wird nur
 * bei neuem oder geändertem Namen — die Seite ruft das bei jedem Aufbau. Ohne echten Namen nichts (wie
 * `bearbeiterAus`: E-Mail oder Kennung wären in der Einladungsliste ein personenbezogenes Datum).
 */
export function merkePerson(db: KommplanDb, nutzer: string | null, name: string | null | undefined): void {
  const n = name?.trim() ?? "";
  if (nutzer === null || n === "") return;
  const da = db.select({ name: kommplanPerson.name }).from(kommplanPerson).where(eq(kommplanPerson.nutzer, nutzer)).get();
  if (da?.name === n) return;
  db.insert(kommplanPerson).values({ nutzer, name: n }).onConflictDoUpdate({ target: kommplanPerson.nutzer, set: { name: n } }).run();
}

/**
 * Die Vorschläge der Einladungs-Suche: Verzeichnis (falls eingerichtet) und bekannte Personen, nach Kennung vereint,
 * ohne Eigentümer und schon Eingeladene. Vorne, wessen Name mit dem Begriff beginnt (Vorbild `core/directory`).
 */
export function vorschlaege(db: KommplanDb, planId: string, begriff: string, verzeichnis: DirectoryResult): PersonVorschlag[] {
  const q = begriff.trim().toLowerCase();
  if (q.length < SUCHE_MIN_ZEICHEN) return [];
  const p = db.select({ eigentuemer: plan.eigentuemer }).from(plan).where(eq(plan.id, planId)).get();
  const weg = new Set([...(p?.eigentuemer ? [p.eigentuemer] : []), ...mitgliederVon(db, planId).map((m) => m.nutzer)]);
  const aus = new Map<string, PersonVorschlag>();
  for (const v of verzeichnis.people) {
    if (v.name && !weg.has(v.userId)) aus.set(v.userId, { nutzer: v.userId, name: v.name, email: v.email });
  }
  for (const b of db.select().from(kommplanPerson).all()) {
    if (!weg.has(b.nutzer) && !aus.has(b.nutzer) && b.name.toLowerCase().includes(q)) aus.set(b.nutzer, { nutzer: b.nutzer, name: b.name, email: null });
  }
  const rang = (v: PersonVorschlag) => (v.name.toLowerCase().startsWith(q) || (v.email ?? "").toLowerCase().startsWith(q) ? 0 : 1);
  return [...aus.values()].sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, "de")).slice(0, SUCHE_MAX_TREFFER);
}

/** Der Name zu einer Kennung: erst die bekannten Personen, dann das Verzeichnis. Unbekannt → `null`. */
export function nameZu(db: KommplanDb, nutzer: string, verzeichnis: DirectoryResult): string | null {
  const b = db.select({ name: kommplanPerson.name }).from(kommplanPerson).where(eq(kommplanPerson.nutzer, nutzer)).get();
  return b?.name ?? verzeichnis.people.find((v) => v.userId === nutzer)?.name ?? null;
}

function pruefe(db: KommplanDb, planId: string, person: Person): { ok: false; fehler: string } | null {
  const r = rechteAn(db, planId, person);
  if (!r.verwalten) return { ok: false, fehler: r.sehen ? NICHT_ERLAUBT : PLAN_WEG };
  const p = db.select({ archiviertAm: plan.archiviertAm }).from(plan).where(eq(plan.id, planId)).get();
  return p && p.archiviertAm === null ? null : { ok: false, fehler: PLAN_WEG };
}

/** Privat → organisation. Nur der Eigentümer (bei einem privaten Plan ist er der einzige, der verwaltet). */
export function teileInOrganisation(db: KommplanDb, eingabe: unknown, person: Person): TeilenErgebnis {
  const id = ID.safeParse(eingabe);
  if (!id.success) return UNGUELTIG;
  const nein = pruefe(db, id.data, person);
  if (nein) return nein;
  db.update(plan).set({ sichtbarkeit: "organisation" }).where(and(eq(plan.id, id.data), eq(plan.sichtbarkeit, "privat"))).run();
  return { ok: true, mitglieder: mitgliederVon(db, id.data) };
}

const einladenSchema = z.object({ planId: ID, nutzer: NUTZER }).strict();

export function ladeEin(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, person: Person, jetzt: number, verzeichnis: DirectoryResult): TeilenErgebnis {
  const e = einladenSchema.safeParse(eingabe);
  if (!e.success) return UNGUELTIG;
  const { planId, nutzer } = e.data;
  const nein = pruefe(db, planId, person);
  if (nein) return nein;
  const p = db.select({ sichtbarkeit: plan.sichtbarkeit, eigentuemer: plan.eigentuemer }).from(plan).where(eq(plan.id, planId)).get()!;
  if (p.sichtbarkeit === "privat") return { ok: false, fehler: "Ein privater Plan hat keine Eingeladenen. Teile ihn zuerst in der Organisation." };
  if (nutzer === p.eigentuemer) return { ok: false, fehler: "Wem der Plan gehört, der bearbeitet ihn ohnehin." };
  const mitglieder = mitgliederVon(db, planId);
  if (mitglieder.some((m) => m.nutzer === nutzer)) return { ok: true, mitglieder };
  if (mitglieder.length >= MITGLIEDER_GRENZE) return { ok: false, fehler: `Höchstens ${MITGLIEDER_GRENZE} Eingeladene je Plan.` };
  const name = nameZu(db, nutzer, verzeichnis);
  if (name === null) return { ok: false, fehler: "Diese Person ist unbekannt. Sie muss die Kommunikationspläne einmal geöffnet haben." };
  db.insert(planMitglied).values({ planId, nutzer, name, eingeladenAm: new Date(jetzt), eingeladenVon: wer.name }).onConflictDoNothing().run();
  return { ok: true, mitglieder: mitgliederVon(db, planId) };
}

export function entferneMitglied(db: KommplanDb, eingabe: unknown, person: Person): TeilenErgebnis {
  const e = einladenSchema.safeParse(eingabe);
  if (!e.success) return UNGUELTIG;
  const nein = pruefe(db, e.data.planId, person);
  if (nein) return nein;
  db.delete(planMitglied).where(and(eq(planMitglied.planId, e.data.planId), eq(planMitglied.nutzer, e.data.nutzer))).run();
  return { ok: true, mitglieder: mitgliederVon(db, e.data.planId) };
}
