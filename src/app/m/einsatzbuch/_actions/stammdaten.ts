"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionAusgang, type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { fahrzeugEingabe, personEingabeMit, qualifikationEingabe, stichwortEingabe } from "../_lib/stammdaten/schemas";
import {
  NichtGefunden, QualiFehler, SchonVergeben, listeQualifikationen, setzeAktiv, speichereFahrzeug, speicherePerson, speichereStichwort,
} from "../_lib/stammdaten/daten";
import { entferneQualifikation, speichereQualifikation } from "../_lib/stammdaten/qualifikationen";
import { planeImport, type Vorschauzeile } from "../_lib/stammdaten/csv";
import { bestandFuerImport, ImportUeberholt, wendeImportAn } from "../_lib/stammdaten/import";
import { bereitgestellteHelfer } from "@/app/m/helfer/_lib/bereitstellung";
import { planeGegenBestand, wendeHelferAbgleichAn, type HelferErgebnis, type HelferPlan } from "../_lib/stammdaten/helferAbgleich";
import { qualiRegelnSchema, schreibeQualiRegeln } from "../_lib/stammdaten/qualiZuordnung";
import { bereitgestellteFahrzeuge, zuordnungenFuer } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { planeFahrzeugeGegenBestand, wendeFahrzeugAbgleichAn, type FahrzeugErgebnis, type FahrzeugPlan } from "../_lib/stammdaten/fahrzeugAbgleich";
import { STAMMDATENARTEN, type FahrzeugDTO, type PersonDTO, type QualifikationDTO, type Stammdatenart, type StichwortDTO } from "../_lib/stammdaten/typen";

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
    if (e instanceof NichtGefunden || e instanceof ImportUeberholt || e instanceof QualiFehler) return { ok: false, fehler: e.message };
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
    alsErgebnis(() => {
      const db = getDb();
      return speicherePerson(db, id, personEingabeMit(listeQualifikationen(db).map((q) => q.kurz)).parse(eingabe));
    }));
}
export async function stichwortSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<StichwortDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speichereStichwort(getDb(), id, stichwortEingabe.parse(eingabe))));
}
/** Anlegen und Ändern einer Qualifikation (IDA-282); eine neue Kurzform zieht das Personal mit. */
export async function qualifikationSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<QualifikationDTO>> {
  const viewer = await requireEinsatzbuchAktion();
  if (id !== null && typeof id !== "string") return { ok: false, fehler: "Eintrag nicht gefunden" };
  return withAuditContext({ actor: auditActor(viewer) }, async () =>
    alsErgebnis(() => speichereQualifikation(getDb(), id, qualifikationEingabe.parse(eingabe))));
}
/** Entfernt eine Qualifikation, die niemand im Personal trägt. */
export async function qualifikationEntfernenAction(id: string): Promise<ActionAusgang> {
  const viewer = await requireEinsatzbuchAktion();
  if (typeof id !== "string") return { ok: false, fehler: "Eintrag nicht gefunden" };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const e = alsErgebnis(() => entferneQualifikation(getDb(), id));
    return e.ok ? { ok: true } : e;
  });
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
/**
 * Vorschau des Abgleichs mit dem Helferverzeichnis (Modul helfer): liest dessen veröffentlichte
 * Bereitstellung und plant gegen das Personal. Schreibt nichts.
 */
export async function helferVorschauAction(): Promise<ActionErgebnis<HelferPlan>> {
  await requireEinsatzbuchAktion();
  return { ok: true, wert: planeGegenBestand(getDb(), bereitgestellteHelfer()) };
}
/** Plant neu (beide Seiten können sich seit der Vorschau geändert haben) und schreibt. */
export async function helferUebernehmenAction(): Promise<ActionErgebnis<HelferErgebnis>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    return alsErgebnis(() => wendeHelferAbgleichAn(db, planeGegenBestand(db, bereitgestellteHelfer())));
  });
}
/**
 * Speichert die Zuordnung „HiOrg-Qualifikation → Kürzel“ (ersetzt alle Regeln) und liefert die neue
 * Vorschau. Am Personal ändert das nichts, bis jemand übernimmt.
 */
export async function qualiZuordnungSpeichernAction(regeln: unknown): Promise<ActionErgebnis<HelferPlan>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    return alsErgebnis(() => {
      schreibeQualiRegeln(db, qualiRegelnSchema.parse(regeln));
      return planeGegenBestand(db, bereitgestellteHelfer());
    });
  });
}
/**
 * Vorschau des Abgleichs mit der Fahrzeugverwaltung (Modul fahrzeuge): liest deren veröffentlichte
 * Bereitstellung samt Zuordnungen aus dem Erstimport und plant gegen die Fahrzeuge. Schreibt nichts.
 */
export async function stammfahrzeugeVorschauAction(): Promise<ActionErgebnis<FahrzeugPlan>> {
  await requireEinsatzbuchAktion();
  return { ok: true, wert: planeFahrzeugeGegenBestand(getDb(), bereitgestellteFahrzeuge(), zuordnungenFuer("einsatzbuch")) };
}
/** Plant neu (beide Seiten können sich seit der Vorschau geändert haben) und schreibt. */
export async function stammfahrzeugeUebernehmenAction(): Promise<ActionErgebnis<FahrzeugErgebnis>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    return alsErgebnis(() => wendeFahrzeugAbgleichAn(db, planeFahrzeugeGegenBestand(db, bereitgestellteFahrzeuge(), zuordnungenFuer("einsatzbuch"))));
  });
}
