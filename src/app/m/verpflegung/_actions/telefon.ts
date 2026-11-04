"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { ausgabeEingabe, aussonderEingabe, eanSchema, eingangEingabe, feldFehlerAus, vorlaeufigEingabe } from "../_lib/eingabe";
import { heute } from "../_lib/heute";
import { schlageNach } from "../_lib/lebensmittel";
import { datumLang, KATEGORIEN, mengeText } from "../_lib/mhd";
import { Abgelehnt, artikelVorlaeufig, ausgabe, aussondern, eingang, type Wer } from "../_lib/schreiben";
import type { Ergebnis, Fund } from "../_lib/typen";
import { requireTelefonAktion, telefonAuditActor, type TelefonZugang } from "../_lib/zugang";

/*
 * Die Schreibwege am Telefon: per Helfer-Link ohne Anmeldung oder angemeldet mit Zugang (`requireTelefonAktion`).
 * Die Buchung trägt den Namen des Links bzw. der Person; im Audit-Log steht der Link, nie ein getippter Name.
 */

async function bucheAm(eingabe: unknown, schema: z.ZodType, arbeit: (wert: never, w: Wer) => Ergebnis): Promise<Ergebnis> {
  const z = await requireTelefonAktion();
  const r = schema.safeParse(eingabe);
  if (!r.success) return { ok: false, fehler: "Bitte die Angaben prüfen.", feldFehler: feldFehlerAus(r.error) };
  return withAuditContext({ actor: telefonAuditActor(z) }, async (): Promise<Ergebnis> => {
    try {
      const e = arbeit(r.data as never, wer(z));
      revalidatePath("/m/verpflegung", "layout");
      return e;
    } catch (e) {
      if (e instanceof Abgelehnt) return { ok: false, fehler: e.message, feldFehler: e.feld ? { [e.feld]: e.message } : undefined };
      throw e;
    }
  });
}

const wer = (z: TelefonZugang): Wer => ({ jetzt: Date.now(), heute: heute(), wer: z.wer, linkId: z.linkId });

export async function einbuchenAction(eingabe: unknown): Promise<Ergebnis> {
  return bucheAm(eingabe, eingangEingabe, (e: z.output<typeof eingangEingabe>, w) => {
    eingang(getDb(), e, w);
    return { ok: true, text: `eingebucht (MHD ${datumLang(e.mhd)})` };
  });
}

export async function ausgebenAction(eingabe: unknown): Promise<Ergebnis> {
  return bucheAm(eingabe, ausgabeEingabe, (e: z.output<typeof ausgabeEingabe>, w) => {
    const r = ausgabe(getDb(), e, w);
    return { ok: true, text: `${mengeText(r.menge, r.einheit)} ${r.name} ausgegeben (MHD ${datumLang(r.mhd)})` };
  });
}

export async function aussondernAmTelefonAction(eingabe: unknown): Promise<Ergebnis> {
  return bucheAm(eingabe, aussonderEingabe, (e: z.output<typeof aussonderEingabe>, w) => {
    const r = aussondern(getDb(), e, w);
    return { ok: true, text: `${mengeText(r.menge, r.einheit)} ${r.name} ausgesondert (${e.grund})` };
  });
}

/** Unbekannte Packung vorläufig anlegen; die Verwaltung prüft sie danach. */
export async function vorlaeufigAnlegenAction(eingabe: unknown, kategorie: string | null): Promise<Ergebnis> {
  return bucheAm(eingabe, vorlaeufigEingabe, (e: z.output<typeof vorlaeufigEingabe>, w) => (
    { ok: true, id: artikelVorlaeufig(getDb(), { ...e, kategorie: (KATEGORIEN as readonly unknown[]).includes(kategorie) ? kategorie : null }, w.jetzt) }
  ));
}

export async function nachschlagenAmTelefonAction(ean: string): Promise<Fund | null> {
  await requireTelefonAktion();
  if (!eanSchema.safeParse(ean).success) return null;
  return schlageNach(ean.trim());
}
