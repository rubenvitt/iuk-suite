import { z } from "zod";

// 1:1 aus uav-praxis/server/routes/sync.ts:19-36 kopiert.

export const SYNC_MAX_MUTATIONS = 100;

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
  executions: z.array(executionSchema).max(SYNC_MAX_MUTATIONS),
  taskStatus: z.array(taskStatusSchema).max(SYNC_MAX_MUTATIONS),
}).superRefine((value, ctx) => {
  const executionIds = new Set<string>();
  value.executions.forEach((entry, index) => {
    if (executionIds.has(entry.id)) ctx.addIssue({ code: "custom", path: ["executions", index], message: "Doppelte ID im Sync-Body" });
    executionIds.add(entry.id);
  });
  const taskIds = new Set<string>();
  value.taskStatus.forEach((entry, index) => {
    if (taskIds.has(entry.taskId)) ctx.addIssue({ code: "custom", path: ["taskStatus", index], message: "Doppelte ID im Sync-Body" });
    taskIds.add(entry.taskId);
  });
});
