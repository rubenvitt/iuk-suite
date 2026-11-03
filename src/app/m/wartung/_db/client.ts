import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("wartung", schema);
export type WartungDb = ReturnType<typeof getDb>;
export type WartungSchreiber = WartungDb | Parameters<Parameters<WartungDb["transaction"]>[0]>[0];
