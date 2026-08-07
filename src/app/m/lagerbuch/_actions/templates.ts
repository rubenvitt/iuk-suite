"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import {
  fahrzeugTemplates,
  lagerorte,
  newId,
  sollPositionen,
  templatePositionen,
} from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import {
  syncFahrzeugTemplate,
  type SyncErgebnis,
} from "../_lib/schreibpfade/templateSync";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/** Eine geordnete Pfadliste fuer alle elf Actions. */
function revalidate(fahrzeugId?: string) {
  revalidatePath("/m/lagerbuch/verwaltung/vorlagen");
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  if (fahrzeugId) {
    revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${fahrzeugId}`);
  }
}

type FehlerErgebnis = Extract<ActionErgebnis, { ok: false }>;

function validierungsFehler(e: unknown): FehlerErgebnis {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: "Bitte die markierten Felder prüfen.",
    ...(feldFehler ? { feldFehler } : {}),
  };
}

function festerFehler(fehler: string): FehlerErgebnis {
  return { ok: false, fehler };
}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Bleibt modul-intern: Eine Transaktion ist kein serialisierbarer
 * Server-Action-Parameter. Grabsteine verlieren ohne Vorlagenverknuepfung ihre
 * Bedeutung; alle uebrigen materialisierten Zeilen behalten ihre Identitaet.
 */
function loeseFahrzeugVonTemplate(tx: Tx, fahrzeugId: string) {
  tx.delete(sollPositionen)
    .where(and(
      eq(sollPositionen.fahrzeugId, fahrzeugId),
      eq(sollPositionen.entfernt, true),
    ))
    .run();
  tx.update(sollPositionen)
    .set({ templatePositionId: null, ueberschrieben: false })
    .where(and(
      eq(sollPositionen.fahrzeugId, fahrzeugId),
      isNotNull(sollPositionen.templatePositionId),
    ))
    .run();
  tx.update(lagerorte)
    .set({ templateId: null })
    .where(eq(lagerorte.id, fahrzeugId))
    .run();
}

const TemplateSchema = z.object({
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
});

export async function createTemplate(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  const geparst = TemplateSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  const id = newId();
  try {
    db.insert(fahrzeugTemplates).values({
      id,
      name: geparst.data.name,
      aktiv: true,
      createdAt: new Date(),
    }).run();
  } catch {
    return festerFehler("Vorlage konnte nicht angelegt werden.");
  }

  revalidate();
  return { ok: true, wert: { id } };
}

const RenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
});

export async function renameTemplate(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = RenameSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  try {
    db.update(fahrzeugTemplates)
      .set({ name: geparst.data.name })
      .where(eq(fahrzeugTemplates.id, geparst.data.id))
      .run();
  } catch {
    return festerFehler("Vorlage konnte nicht umbenannt werden.");
  }

  revalidate();
  return { ok: true };
}

const TemplateAktivSchema = z.object({
  id: z.string().min(1),
  aktiv: z.boolean(),
});

export async function setTemplateAktiv(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = TemplateAktivSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  try {
    db.update(fahrzeugTemplates)
      .set({ aktiv: geparst.data.aktiv })
      .where(eq(fahrzeugTemplates.id, geparst.data.id))
      .run();
  } catch {
    return festerFehler("Vorlagenstatus konnte nicht geändert werden.");
  }

  revalidate();
  return { ok: true };
}

const DeleteTemplateSchema = z.object({ id: z.string().min(1) });

export async function deleteTemplate(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = DeleteTemplateSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  try {
    db.transaction((tx) => {
      const fahrzeuge = tx.select().from(lagerorte)
        .where(eq(lagerorte.templateId, geparst.data.id)).all();
      for (const fahrzeug of fahrzeuge) {
        loeseFahrzeugVonTemplate(tx, fahrzeug.id);
      }
      tx.delete(templatePositionen)
        .where(eq(templatePositionen.templateId, geparst.data.id)).run();
      tx.delete(fahrzeugTemplates)
        .where(eq(fahrzeugTemplates.id, geparst.data.id)).run();
    });
  } catch {
    return festerFehler("Vorlage konnte nicht gelöscht werden.");
  }

  revalidate();
  return { ok: true };
}

const TemplatePosSchema = z.object({
  id: z.string().min(1).optional(),
  templateId: z.string().min(1),
  fachLabel: z.string().trim().min(1, "Fach darf nicht leer sein"),
  artikelId: z.string().min(1, "Artikel wählen"),
  soll: z.coerce.number().int().positive("Soll muss größer als 0 sein"),
  sort: z.coerce.number().int().default(0),
});

export async function templatePositionSetzen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  const geparst = TemplatePosSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);
  const v = geparst.data;
  const id = v.id ?? newId();
  const felder = {
    templateId: v.templateId,
    fachLabel: v.fachLabel,
    artikelId: v.artikelId,
    soll: v.soll,
    sort: v.sort,
  };

  try {
    if (v.id) {
      db.update(templatePositionen)
        .set(felder)
        .where(eq(templatePositionen.id, v.id))
        .run();
    } else {
      db.insert(templatePositionen).values({ id, ...felder }).run();
    }
  } catch {
    return festerFehler("Vorlagenposition konnte nicht gespeichert werden.");
  }

  revalidate();
  return { ok: true, wert: { id } };
}

const TemplatePosEntfernenSchema = z.object({ id: z.string().min(1) });

export async function templatePositionEntfernen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = TemplatePosEntfernenSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  try {
    db.transaction((tx) => {
      const referenzierend = tx.select().from(sollPositionen)
        .where(eq(sollPositionen.templatePositionId, geparst.data.id)).all();
      for (const row of referenzierend) {
        if (row.ueberschrieben) {
          tx.update(sollPositionen)
            .set({ templatePositionId: null, ueberschrieben: false })
            .where(eq(sollPositionen.id, row.id))
            .run();
        } else {
          tx.delete(sollPositionen).where(eq(sollPositionen.id, row.id)).run();
        }
      }
      tx.delete(templatePositionen)
        .where(eq(templatePositionen.id, geparst.data.id)).run();
    });
  } catch {
    return festerFehler("Vorlagenposition konnte nicht entfernt werden.");
  }

  revalidate();
  return { ok: true };
}

const ZuweisenSchema = z.object({
  fahrzeugId: z.string().min(1),
  templateId: z.string().min(1),
});

export async function fahrzeugTemplateZuweisen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<SyncErgebnis>> {
  await requireLagerbuchAdmin();

  const geparst = ZuweisenSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  let ergebnis: SyncErgebnis;
  try {
    ergebnis = db.transaction((tx) => {
      tx.update(lagerorte)
        .set({ templateId: geparst.data.templateId })
        .where(eq(lagerorte.id, geparst.data.fahrzeugId))
        .run();
      return syncFahrzeugTemplate(tx, geparst.data.fahrzeugId);
    });
  } catch {
    return festerFehler("Vorlage konnte dem Fahrzeug nicht zugewiesen werden.");
  }

  revalidate(geparst.data.fahrzeugId);
  return { ok: true, wert: ergebnis };
}

const SyncSchema = z.object({ fahrzeugId: z.string().min(1) });

export async function fahrzeugTemplateSync(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<SyncErgebnis>> {
  await requireLagerbuchAdmin();

  const geparst = SyncSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  let ergebnis: SyncErgebnis;
  try {
    ergebnis = db.transaction((tx) =>
      syncFahrzeugTemplate(tx, geparst.data.fahrzeugId));
  } catch {
    return festerFehler("Fahrzeugvorlage konnte nicht synchronisiert werden.");
  }

  revalidate(geparst.data.fahrzeugId);
  return { ok: true, wert: ergebnis };
}

const SyncAlleSchema = z.object({ templateId: z.string().min(1) });

export async function templateAufFahrzeugeSyncen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<SyncErgebnis & { fahrzeuge: number }>> {
  await requireLagerbuchAdmin();

  const geparst = SyncAlleSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  let ergebnis: SyncErgebnis & { fahrzeuge: number };
  try {
    ergebnis = db.transaction((tx) => {
      const fahrzeuge = tx.select().from(lagerorte)
        .where(eq(lagerorte.templateId, geparst.data.templateId)).all();
      const summe: SyncErgebnis = {
        hinzugefuegt: 0,
        aktualisiert: 0,
        uebersprungen: 0,
        entfernt: 0,
        losgeloest: 0,
      };
      for (const fahrzeug of fahrzeuge) {
        const sync = syncFahrzeugTemplate(tx, fahrzeug.id);
        summe.hinzugefuegt += sync.hinzugefuegt;
        summe.aktualisiert += sync.aktualisiert;
        summe.uebersprungen += sync.uebersprungen;
        summe.entfernt += sync.entfernt;
        summe.losgeloest += sync.losgeloest;
      }
      return { fahrzeuge: fahrzeuge.length, ...summe };
    });
  } catch {
    return festerFehler("Vorlage konnte nicht synchronisiert werden.");
  }

  revalidate();
  return { ok: true, wert: ergebnis };
}

const LoesenSchema = z.object({ fahrzeugId: z.string().min(1) });

export async function fahrzeugTemplateLoesen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = LoesenSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);

  try {
    db.transaction((tx) =>
      loeseFahrzeugVonTemplate(tx, geparst.data.fahrzeugId));
  } catch {
    return festerFehler("Vorlagenverknüpfung konnte nicht gelöst werden.");
  }

  revalidate(geparst.data.fahrzeugId);
  return { ok: true };
}

const AusFahrzeugSchema = z.object({
  fahrzeugId: z.string().min(1),
  name: z.string().trim().min(1, "Name darf nicht leer sein"),
  verknuepfen: z.boolean().default(true),
});

export async function templateAusFahrzeug(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  await requireLagerbuchAdmin();

  const geparst = AusFahrzeugSchema.safeParse(eingabe);
  if (!geparst.success) return validierungsFehler(geparst.error);
  const v = geparst.data;
  const templateId = newId();

  try {
    db.transaction((tx) => {
      tx.insert(fahrzeugTemplates).values({
        id: templateId,
        name: v.name,
        aktiv: true,
        createdAt: new Date(),
      }).run();
      const rows = tx.select().from(sollPositionen)
        .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all()
        .filter((row) => !row.entfernt);

      for (const row of rows) {
        const templatePositionId = newId();
        tx.insert(templatePositionen).values({
          id: templatePositionId,
          templateId,
          fachLabel: row.fachLabel,
          sort: row.sort,
          artikelId: row.artikelId,
          soll: row.soll,
        }).run();
        if (v.verknuepfen) {
          tx.update(sollPositionen)
            .set({ templatePositionId, ueberschrieben: false })
            .where(eq(sollPositionen.id, row.id))
            .run();
        }
      }

      if (v.verknuepfen) {
        tx.update(lagerorte)
          .set({ templateId })
          .where(eq(lagerorte.id, v.fahrzeugId))
          .run();
      }
    });
  } catch {
    return festerFehler("Vorlage konnte nicht aus dem Fahrzeug erstellt werden.");
  }

  revalidate(v.fahrzeugId);
  return { ok: true, wert: { id: templateId } };
}
