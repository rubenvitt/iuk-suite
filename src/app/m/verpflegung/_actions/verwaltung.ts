"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import {
  artikelEingabe, ausgabeEingabe, aussonderEingabe, eanSchema, eingangEingabe, feldFehlerAus, idSchema, linkEingabe,
  ortEingabe,
} from "../_lib/eingabe";
import { heute } from "../_lib/heute";
import { schlageNach } from "../_lib/lebensmittel";
import { datumLang, mengeText } from "../_lib/mhd";
import {
  Abgelehnt, artikelAendern, artikelAktiv, artikelAnlegen, ausgabe, aussondern, eingang, linkAnlegen, linkSperren, ortAendern,
  ortAktiv, ortAnlegen,
} from "../_lib/schreiben";
import type { Ergebnis, Fund } from "../_lib/typen";
import { anzeigename, requireAktion, type Stufe, type Viewer } from "../_lib/zugang";

/*
 * Die Schreibwege der Verwaltung. Jede Action prüft Host, Sitzung und Stufe selbst (`requireAktion`). Geschrieben
 * wird im Audit-Kontext der angemeldeten Person; eine erwartbare Ablehnung wird zum Satz am Bildschirm.
 */

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

async function schreibe(stufe: Stufe, arbeit: (viewer: Viewer) => Ergebnis | void): Promise<Ergebnis> {
  const { viewer } = await requireAktion(stufe);
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<Ergebnis> => {
    let r: Ergebnis | void;
    try {
      r = arbeit(viewer);
    } catch (e) {
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message, feldFehler: e.feld ? { [e.feld]: e.message } : undefined };
      throw e;
    }
    revalidatePath("/m/verpflegung", "layout");
    return r ?? { ok: true };
  });
}

function geprueft<T>(schema: z.ZodType<T>, eingabe: unknown): { ok: true; wert: T } | { ok: false; ergebnis: Ergebnis } {
  const r = schema.safeParse(eingabe);
  if (r.success) return { ok: true, wert: r.data };
  return { ok: false, ergebnis: { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: feldFehlerAus(r.error) } };
}

// ---------------------------------------------------------------- Artikel

export async function artikelAnlegenAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(artikelEingabe, eingabe);
  if (!e.ok) { await requireAktion("zugang"); return e.ergebnis; }
  return schreibe("zugang", () => ({ ok: true, id: artikelAnlegen(getDb(), e.wert, Date.now()) }));
}

export async function artikelAendernAction(id: string, eingabe: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(artikelEingabe, eingabe);
  if (!e.ok) { await requireAktion("zugang"); return e.ergebnis; }
  return schreibe("zugang", () => artikelAendern(getDb(), id, e.wert, Date.now()));
}

export async function artikelAktivAction(id: string, aktiv: boolean): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success || typeof aktiv !== "boolean") return { ok: false, fehler: UNGUELTIG };
  return schreibe("zugang", () => artikelAktiv(getDb(), id, aktiv, Date.now()));
}

/** Nachschlagen in der Lebensmitteldatenbank — nur lesen, aber hinter dem Modulzugang. */
export async function nachschlagenAction(ean: string): Promise<Fund | null> {
  await requireAktion("zugang");
  if (!eanSchema.safeParse(ean).success) return null;
  return schlageNach(ean.trim());
}

// ---------------------------------------------------------------- Bestand

export async function aussondernAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(aussonderEingabe, eingabe);
  if (!e.ok) { await requireAktion("zugang"); return e.ergebnis; }
  return schreibe("zugang", (viewer) => {
    const r = aussondern(getDb(), e.wert, { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer), linkId: null });
    return { ok: true, text: `${mengeText(r.menge, r.einheit)} ${r.name} ausgesondert.` };
  });
}

/** IDA-382: Eingang am Schreibtisch, dieselbe Buchung wie am Telefon unter dem Namen der angemeldeten Person. */
export async function eingangAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(eingangEingabe, eingabe);
  if (!e.ok) { await requireAktion("zugang"); return e.ergebnis; }
  return schreibe("zugang", (viewer) => {
    eingang(getDb(), e.wert, { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer), linkId: null });
    return { ok: true, text: `Eingebucht (MHD ${datumLang(e.wert.mhd)}).` };
  });
}

/** IDA-382: Ausgabe am Schreibtisch, auf die gewählte Charge. */
export async function ausgabeAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(ausgabeEingabe, eingabe);
  if (!e.ok) { await requireAktion("zugang"); return e.ergebnis; }
  return schreibe("zugang", (viewer) => {
    const r = ausgabe(getDb(), e.wert, { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer), linkId: null });
    return { ok: true, text: `${mengeText(r.menge, r.einheit)} ${r.name} ausgegeben.` };
  });
}

// ---------------------------------------------------------------- Lagerorte und Helfer-Links (Admin)

export async function ortAnlegenAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(ortEingabe, eingabe);
  if (!e.ok) { await requireAktion("admin"); return e.ergebnis; }
  return schreibe("admin", () => ({ ok: true, id: ortAnlegen(getDb(), e.wert, Date.now()) }));
}

export async function ortAendernAction(id: string, eingabe: unknown): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = geprueft(ortEingabe, eingabe);
  if (!e.ok) { await requireAktion("admin"); return e.ergebnis; }
  return schreibe("admin", () => ortAendern(getDb(), id, e.wert, Date.now()));
}

export async function ortAktivAction(id: string, aktiv: boolean): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success || typeof aktiv !== "boolean") return { ok: false, fehler: UNGUELTIG };
  return schreibe("admin", () => ortAktiv(getDb(), id, aktiv, Date.now()));
}

export async function linkAnlegenAction(eingabe: unknown): Promise<Ergebnis> {
  const e = geprueft(linkEingabe, eingabe);
  if (!e.ok) { await requireAktion("admin"); return e.ergebnis; }
  return schreibe("admin", (viewer) => ({ ok: true, id: linkAnlegen(getDb(), e.wert, Date.now(), anzeigename(viewer)).id }));
}

export async function linkSperrenAction(id: string): Promise<Ergebnis> {
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return schreibe("admin", () => linkSperren(getDb(), id));
}
