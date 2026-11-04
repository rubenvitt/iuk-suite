"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDirectory, type DirectoryResult } from "@/core/directory";
import { getDb } from "../_db/client";
import { geraet } from "../_db/schema";
import { ladeMangel, ladeUnterlage } from "../_lib/daten";
import {
  artEingabe, erledigtEingabe, feldFehlerAus, geraetEingabe, gruppeEingabe, idSchema, inhaltEingabe, verwalterEingabe,
} from "../_lib/eingabe";
import {
  SUCHE_MAX_TREFFER, SUCHE_MIN_ZEICHEN, verwalterEntfernen, verwalterHinzufuegen, vorschlaege,
} from "../_lib/personen";
import { heute } from "../_lib/heute";
import {
  Abgelehnt, artLoeschen, artSpeichern, erledigtEintragen, geraetAendern, geraetAktiv, geraetAnlegen, gruppeLoeschen,
  gruppeSpeichern, inhaltSpeichern, mangelBeheben, unterlageLoeschen, unterlageVerschieben,
} from "../_lib/schreiben";
import { entferneUnterlage } from "../_lib/unterlagen";
import type { Ergebnis, PersonVorschlag } from "../_lib/typen";
import { anzeigename, requireAktion, verwaltetGruppe, type Rechte, type Stufe, type Viewer } from "../_lib/zugang";

/*
 * Die Schreibwege der Verwaltung. Jede Action prüft Host, Sitzung und Stufe selbst (`requireAktion`) und die
 * Gruppe des Geräts aus der Datenbank, nie aus der Eingabe (IDOR). Geschrieben wird im Audit-Kontext der
 * angemeldeten Person; eine erwartbare Ablehnung wird zum Satz am Bildschirm.
 */

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";
const NICHT_DEINE = "Dieses Gerät gehört zu einer Gruppe, die du nicht verwaltest.";

async function schreibe(
  stufe: Stufe,
  arbeit: (z: { viewer: Viewer; rechte: Rechte }) => Ergebnis | void,
): Promise<Ergebnis> {
  const z = await requireAktion(stufe);
  return withAuditContext({ actor: auditActor(z.viewer) }, async (): Promise<Ergebnis> => {
    let r: Ergebnis | void;
    try {
      r = arbeit(z);
    } catch (e) {
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message, feldFehler: e.feld ? { [e.feld]: e.message } : undefined };
      throw e;
    }
    revalidatePath("/m/wartung", "layout");
    return r ?? { ok: true };
  });
}

function geprueft<T>(schema: z.ZodType<T>, eingabe: unknown):
  { ok: true; wert: T } | { ok: false; ergebnis: Ergebnis } {
  const r = schema.safeParse(eingabe);
  if (r.success) return { ok: true, wert: r.data };
  return { ok: false, ergebnis: { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: feldFehlerAus(r.error) } };
}

function gruppeDesGeraets(id: string): string | null {
  return getDb().select({ g: geraet.gruppeId }).from(geraet).where(eq(geraet.id, id)).get()?.g ?? null;
}

function kontext(viewer: Viewer) {
  return { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer) };
}

// ---------------------------------------------------------------- Geräte

export async function geraetAnlegenAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(geraetEingabe, eingabe);
  if (!e.ok) { await requireAktion("verwalter"); return e.ergebnis; }
  return schreibe("verwalter", ({ rechte }) => {
    if (!verwaltetGruppe(rechte, e.wert.gruppeId)) throw new Abgelehnt("Diese Gruppe verwaltest du nicht.", "gruppeId");
    return { ok: true, id: geraetAnlegen(getDb(), e.wert, Date.now()) };
  });
}

export async function geraetAendernAction(id: string, eingabe: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(geraetEingabe, eingabe);
  if (!e.ok) { await requireAktion("verwalter"); return e.ergebnis; }
  return schreibe("verwalter", ({ rechte }) => {
    const alt = gruppeDesGeraets(id);
    if (!alt) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    if (!verwaltetGruppe(rechte, alt)) throw new Abgelehnt(NICHT_DEINE);
    if (!verwaltetGruppe(rechte, e.wert.gruppeId)) throw new Abgelehnt("Diese Gruppe verwaltest du nicht.", "gruppeId");
    geraetAendern(getDb(), id, e.wert, Date.now());
  });
}

/** Ausmustern (aktiv = false) und zurückholen. */
export async function geraetAktivAction(id: string, aktiv: boolean): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success || typeof aktiv !== "boolean") return { ok: false, fehler: UNGUELTIG };
  return schreibe("verwalter", ({ rechte }) => {
    const g = gruppeDesGeraets(id);
    if (!g) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    if (!verwaltetGruppe(rechte, g)) throw new Abgelehnt(NICHT_DEINE);
    geraetAktiv(getDb(), id, aktiv, Date.now());
  });
}

export async function erledigtEintragenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(geraetId).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(erledigtEingabe, eingabe);
  if (!e.ok) { await requireAktion("verwalter"); return e.ergebnis; }
  return schreibe("verwalter", ({ viewer, rechte }) => {
    const g = gruppeDesGeraets(geraetId);
    if (!g) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    if (!verwaltetGruppe(rechte, g)) throw new Abgelehnt(NICHT_DEINE);
    erledigtEintragen(getDb(), geraetId, e.wert, kontext(viewer));
  });
}

/** Die Inhaltsliste einer Materialkiste (IDA-335) — Verwalter ihrer Gruppe, auch am Telefon in der Halle. */
export async function inhaltSpeichernAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(geraetId).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(inhaltEingabe, eingabe);
  if (!e.ok) { await requireAktion("verwalter"); return e.ergebnis; }
  return schreibe("verwalter", ({ rechte }) => {
    const g = gruppeDesGeraets(geraetId);
    if (!g) throw new Abgelehnt("Dieses Gerät gibt es nicht mehr.");
    if (!verwaltetGruppe(rechte, g)) throw new Abgelehnt(NICHT_DEINE);
    inhaltSpeichern(getDb(), geraetId, e.wert);
  });
}

export async function mangelBehebenAction(id: string): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return schreibe("verwalter", ({ viewer, rechte }) => {
    const m = ladeMangel(getDb(), id);
    if (!m) throw new Abgelehnt("Diesen Mangel gibt es nicht mehr.");
    if (!verwaltetGruppe(rechte, m.gruppeId)) throw new Abgelehnt(NICHT_DEINE);
    mangelBeheben(getDb(), id, kontext(viewer));
  });
}

// ---------------------------------------------------------------- Unterlagen (IDA-300; Hochladen: Route `geraete/[id]/unterlagen`)

/** Die Unterlage, wenn die aufrufende Person die Gruppe ihres Geräts verwaltet — Gruppe aus der Datenbank. */
function eigeneUnterlage(rechte: Rechte, id: string) {
  const u = ladeUnterlage(getDb(), id);
  if (!u) throw new Abgelehnt("Diese Unterlage gibt es nicht mehr.");
  if (!verwaltetGruppe(rechte, u.gruppeId)) throw new Abgelehnt(NICHT_DEINE);
  return u;
}

export async function unterlageLoeschenAction(id: string): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  let weg: { id: string; typ: "pdf" | "bild" } | null = null;
  const r = await schreibe("verwalter", ({ rechte }) => {
    const u = eigeneUnterlage(rechte, id);
    unterlageLoeschen(getDb(), u.id);
    weg = { id: u.id, typ: u.typ };
  });
  // Erst der Eintrag, dann die Datei: bricht es dazwischen, bleibt höchstens eine Datei ohne Verweis liegen. Der Pfad
  // entsteht aus der ID, wie sie in der Datenbank steht, nicht aus der Eingabe.
  const datei = weg as { id: string; typ: "pdf" | "bild" } | null;
  if (r.ok && datei) await entferneUnterlage(datei.id, datei.typ);
  return r;
}

export async function unterlageVerschiebenAction(id: string, richtung: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success || (richtung !== -1 && richtung !== 1)) return { ok: false, fehler: UNGUELTIG };
  return schreibe("verwalter", ({ rechte }) => {
    eigeneUnterlage(rechte, id);
    unterlageVerschieben(getDb(), id, richtung);
  });
}

// ---------------------------------------------------------------- Gerätearten (jeder Verwalter)

export async function artSpeichernAction(id: string | null, eingabe: unknown): Promise<Ergebnis> {
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(artEingabe, eingabe);
  if (!e.ok) { await requireAktion("verwalter"); return e.ergebnis; }
  return schreibe("verwalter", () => ({ ok: true, id: artSpeichern(getDb(), id, e.wert, Date.now()) }));
}

export async function artLoeschenAction(id: string): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return schreibe("verwalter", () => artLoeschen(getDb(), id));
}

// ---------------------------------------------------------------- Gruppen (nur Admins)

export async function gruppeSpeichernAction(id: string | null, eingabe: unknown): Promise<Ergebnis> {
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(gruppeEingabe, eingabe);
  if (!e.ok) { await requireAktion("admin"); return e.ergebnis; }
  return schreibe("admin", () => ({ ok: true, id: gruppeSpeichern(getDb(), id, e.wert, Date.now()) }));
}

export async function gruppeLoeschenAction(id: string): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return schreibe("admin", () => gruppeLoeschen(getDb(), id));
}

// ---------------------------------------------------------------- Verwalter einer Gruppe (nur Admins, IDA-337)

const KEIN_VERZEICHNIS: DirectoryResult = { status: "error", people: [] };
/** `core/directory` wirft nie; die Zeile überlebt einen Austausch gegen einen Client, der es doch tut. */
async function verzeichnis(abruf: () => Promise<DirectoryResult>): Promise<DirectoryResult> {
  try { return await abruf(); } catch { return KEIN_VERZEICHNIS; }
}

export async function verwalterHinzufuegenAction(eingabe: unknown): Promise<Ergebnis> {
  const e = verwalterEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: UNGUELTIG };
  // Erst das Recht, dann das Verzeichnis: dessen Antwort ist ein Ausschnitt der ganzen Organisation.
  await requireAktion("admin");
  const v = await verzeichnis(() => getDirectory().list());
  return schreibe("admin", () => verwalterHinzufuegen(getDb(), e.data.gruppeId, e.data.nutzer, Date.now(), v));
}

export async function verwalterEntfernenAction(eingabe: unknown): Promise<Ergebnis> {
  const e = verwalterEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: UNGUELTIG };
  return schreibe("admin", () => verwalterEntfernen(getDb(), e.data.gruppeId, e.data.nutzer));
}

/** Lesend: höchstens `SUCHE_MAX_TREFFER` Vorschläge ab `SUCHE_MIN_ZEICHEN` Zeichen. */
export async function suchePersonenAction(gruppeId: unknown, begriff: unknown): Promise<PersonVorschlag[]> {
  await requireAktion("admin");
  const id = idSchema.safeParse(gruppeId);
  const q = z.string().max(100).safeParse(begriff);
  if (!id.success || !q.success || q.data.trim().length < SUCHE_MIN_ZEICHEN) return [];
  const v = await verzeichnis(() => getDirectory().search(q.data.trim(), SUCHE_MAX_TREFFER));
  return vorschlaege(getDb(), id.data, q.data, v);
}
