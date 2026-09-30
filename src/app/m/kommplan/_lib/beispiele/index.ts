import type { PlanInhalt } from "../plan/schema";
import { EINSATZ_20260222 } from "./einsatz20260222";
import { FERNMELDESKIZZE_STAB } from "./fernmeldeskizzeStab";
import { GROSSE_STABSLAGE } from "./grosseStabslage";
import { LABEL } from "./label";
import { OPENR_20220701 } from "./openr20220701";

export interface Beispiel {
  id: string; titel: string; typ: "kommunikationsplan" | "fernmeldeskizze";
  anlass: string | null; datum: string | null; istVorlage: boolean;
  stand: string; bearbeiter: string; inhalt: PlanInhalt;
}

/** Die Beispielpläne — Seed, Golden-Tests, Vorschau und e2e lesen genau diese Liste. */
export const BEISPIELE: readonly Beispiel[] = [EINSATZ_20260222, OPENR_20220701, LABEL, FERNMELDESKIZZE_STAB, GROSSE_STABSLAGE];
