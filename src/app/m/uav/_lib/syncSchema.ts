import { z } from "zod";

// 1:1 aus uav-praxis/server/routes/sync.ts:19-36 kopiert.

export const executionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  datum: z.string().min(1),
  drohnensteuerer: z.string().default(""),
  luftraumbeobachter: z.string().default(""),
  deletedAt: z.string().nullable().optional(),
});

export const taskStatusSchema = z.object({
  taskId: z.string().min(1),
  zielanzahl: z.number().int().nullable(),
  nichtAnwendbar: z.boolean(),
  updatedAt: z.string().min(1),
});

export const syncSchema = z.object({
  since: z.string().nullable(),
  executions: z.array(executionSchema),
  taskStatus: z.array(taskStatusSchema),
});
