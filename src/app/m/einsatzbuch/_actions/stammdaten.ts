"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionAusgang, type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "../_lib/stammdaten/schemas";
import {
  NichtGefunden, SchonVergeben, setzeAktiv, speichereFahrzeug, speicherePerson, speichereStichwort,
} from "../_lib/stammdaten/daten";
import { planeImport, type Vorschauzeile } from "../_lib/stammdaten/csv";
import { bestandFuerImport, wendeImportAn } from "../_lib/stammdaten/import";
import { STAMMDATENARTEN, type FahrzeugDTO, type PersonDTO, type Stammdatenart, type StichwortDTO } from "../_lib/stammdaten/typen";

/** Nach jeder Schreibaktion: die Übersicht und die Stammdatenseite laufen mit neuem Bestand. */
function neuLaden() {
  revalidatePath("/m/einsatzbuch/stammdaten");
  revalidatePath("/m/einsatzbuch");
}

/**
 * Führt `tun` aus, lädt bei Erfolg neu und übersetzt bekannte Fehler in ein `ActionErgebnis`.
 * `T` bleibt bei den Aufrufstellen hier immer konkret (nie `undefined`), daher greift der
 * `wert`-Zweig des Typs zuverlässig.
 */
function alsErgebnis<T>(tun: () => T): ActionErgebnis<T> {
  try {
    const wert = tun();
    neuLaden();
    return { ok: true, wert } as ActionErgebnis<T>;
  } catch (e) {
    const feldFehler = zodFehler(e);
    if (feldFehler) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler };
    if (e instanceof SchonVergeben) return { ok: false, fehler: e.message, feldFehler: { [e.feld]: e.message } };
    if (e instanceof NichtGefunden) return { ok: false, fehler: e.message };
    throw e;
  }
}

export async function fahrzeugSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<FahrzeugDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speichereFahrzeug(getDb(), id, fahrzeugEingabe.parse(eingabe))));
}
export async function personSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<PersonDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speicherePerson(getDb(), id, personEingabe.parse(eingabe))));
}
export async function stichwortSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<StichwortDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speichereStichwort(getDb(), id, stichwortEingabe.parse(eingabe))));
}
export async function aktivSetzenAction(art: Stammdatenart, id: string, aktiv: boolean): Promise<ActionAusgang> {
  const viewer = await requireEinsatzbuchAktion();
  if (!STAMMDATENARTEN.includes(art) || typeof id !== "string" || typeof aktiv !== "boolean") return { ok: false, fehler: "Unbekannte Art" };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const e = alsErgebnis(() => setzeAktiv(getDb(), art, id, aktiv));
    return e.ok ? { ok: true } : e;
  });
}
/** Probelauf: plant gegen den aktuellen Bestand und schreibt nichts. */
export async function csvVorschauAction(art: Stammdatenart, text: string): Promise<ActionErgebnis<Vorschauzeile[]>> {
  await requireEinsatzbuchAktion();
  if (!STAMMDATENARTEN.includes(art) || typeof text !== "string") return { ok: false, fehler: "Unbekannte Art" };
  const plan = planeImport(art, text, bestandFuerImport(getDb()));
  return plan.ok ? { ok: true, wert: plan.zeilen } : { ok: false, fehler: plan.fehler };
}
/** Plant serverseitig neu (der Bestand kann sich seit der Vorschau geändert haben) und schreibt. */
export async function csvUebernehmenAction(art: Stammdatenart, text: string): Promise<ActionErgebnis<{ neu: number; geaendert: number; unveraendert: number; fehler: number }>> {
  const viewer = await requireEinsatzbuchAktion();
  if (!STAMMDATENARTEN.includes(art) || typeof text !== "string") return { ok: false, fehler: "Unbekannte Art" };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    const plan = planeImport(art, text, bestandFuerImport(db));
    if (!plan.ok) return { ok: false, fehler: plan.fehler };
    return alsErgebnis(() => wendeImportAn(db, plan));
  });
}
