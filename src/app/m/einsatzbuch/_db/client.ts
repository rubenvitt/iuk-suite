import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("einsatzbuch", schema);
export type EinsatzbuchDb = ReturnType<typeof getDb>;
