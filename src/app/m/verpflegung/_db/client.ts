import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("verpflegung", schema);
export type VerpflegungDb = ReturnType<typeof getDb>;
export type VerpflegungSchreiber = VerpflegungDb | Parameters<Parameters<VerpflegungDb["transaction"]>[0]>[0];
