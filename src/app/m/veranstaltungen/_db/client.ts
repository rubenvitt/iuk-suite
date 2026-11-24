import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("veranstaltungen", schema);
export type VeranstaltungenDb = ReturnType<typeof getDb>;
