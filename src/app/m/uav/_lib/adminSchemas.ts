import { z } from "zod";

// Zod aus uav-praxis/server/routes/admin.ts kopiert.

export const teilnehmerAnlegenSchema = z.object({
  name: z.string().min(1),
  beginn: z.string().nullable().optional(),
});

export const teilnehmerPatchSchema = z.object({
  name: z.string().min(1).optional(),
  aktiv: z.boolean().optional(),
  beginn: z.string().nullable().optional(),
  codeNeu: z.boolean().optional(),
});

const teilSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const taskAnlegenSchema = z.object({
  id: z.string().min(1).optional(),
  teil: teilSchema,
  nummer: z.string().min(1),
  titel: z.string().min(1),
  lernziel: z.string().default(""),
  schritte: z.array(z.string()).default([]),
  durchfuehrungshinweise: z.array(z.string()).default([]),
  sicherheitshinweise: z.array(z.string()).default([]),
  zielanzahlDefault: z.number().int().positive().default(1),
  sortOrder: z.number().int().optional(),
  aktiv: z.boolean().default(true),
  // Relativer Pfad oder absolute URL — daher kein .url(); leerer String wird
  // von den Handlern zu null normalisiert.
  bildUrl: z.string().nullable().optional(),
});

export const taskPatchSchema = z.object({
  teil: teilSchema.optional(),
  nummer: z.string().min(1).optional(),
  titel: z.string().min(1).optional(),
  lernziel: z.string().optional(),
  schritte: z.array(z.string()).optional(),
  durchfuehrungshinweise: z.array(z.string()).optional(),
  sicherheitshinweise: z.array(z.string()).optional(),
  zielanzahlDefault: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  aktiv: z.boolean().optional(),
  bildUrl: z.string().nullable().optional(),
});

export const reorderSchema = z.object({ ids: z.array(z.string().min(1)) });
