import { getModuleDb } from "@/core/db";
import * as schema from "./schema";
export const getDb = () => getModuleDb("uav", schema);
export type UavDb = ReturnType<typeof getDb>;
