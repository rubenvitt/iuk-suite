import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("kommplan", schema);
export type KommplanDb = ReturnType<typeof getDb>;
