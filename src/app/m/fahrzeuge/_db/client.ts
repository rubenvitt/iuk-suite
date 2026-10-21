import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("fahrzeuge", schema);
export type FahrzeugeDb = ReturnType<typeof getDb>;
