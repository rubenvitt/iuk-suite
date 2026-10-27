import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("lagemonitor", schema);
export type LagemonitorDb = ReturnType<typeof getDb>;
