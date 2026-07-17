import { getModuleDb } from "@/core/db";
import * as schema from "./schema";
export const getDb = () => getModuleDb("portal", schema);
