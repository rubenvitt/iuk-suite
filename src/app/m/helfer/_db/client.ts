import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("helfer", schema);
export type HelferDb = ReturnType<typeof getDb>;
/** Die Verbindung oder eine laufende Transaktion darauf — für Schreibpfade, die beides bedienen. */
export type HelferSchreiber = HelferDb | Parameters<Parameters<HelferDb["transaction"]>[0]>[0];
