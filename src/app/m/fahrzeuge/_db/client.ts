import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("fahrzeuge", schema);
export type FahrzeugeDb = ReturnType<typeof getDb>;
/** Die Verbindung oder eine laufende Transaktion darauf — für Schreibpfade, die beides bedienen. */
export type FahrzeugeSchreiber = FahrzeugeDb | Parameters<Parameters<FahrzeugeDb["transaction"]>[0]>[0];
