import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("aufgaben", schema);
export type DB = ReturnType<typeof getDb>;
