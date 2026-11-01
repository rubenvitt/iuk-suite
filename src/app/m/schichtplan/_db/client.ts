import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("schichtplan", schema);
export type SchichtplanDb = ReturnType<typeof getDb>;
export type SchichtplanSchreiber = SchichtplanDb | Parameters<Parameters<SchichtplanDb["transaction"]>[0]>[0];
