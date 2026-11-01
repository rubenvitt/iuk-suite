import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("gemeinschaft", schema);
export type GemeinschaftDb = ReturnType<typeof getDb>;
export type GemeinschaftSchreiber = GemeinschaftDb | Parameters<Parameters<GemeinschaftDb["transaction"]>[0]>[0];
