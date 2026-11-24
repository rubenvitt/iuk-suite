/**
 * Die Eingaben des Formulars, geprüft auf dem Server (jede Action parst neu, nie dem Client glauben).
 * Zeiten sind Millisekunden in der Suite-Zone.
 */
import { z } from "zod";
import { MINUTE, RASTER_MIN } from "@/app/m/schichtplan/_lib/typen";
import { ARTEN, MAX_DAUER_MS, STATUS } from "./typen";

const text = (max: number, meldung = "Bitte ausfüllen.") => z.string().trim().min(1, meldung).max(max, `Höchstens ${max} Zeichen.`);
const frei = (max: number) => z.string().trim().max(max, `Höchstens ${max} Zeichen.`);

const zeitpunkt = z.number().int().refine((ms) => ms % (RASTER_MIN * MINUTE) === 0, `Bitte auf ${RASTER_MIN} Minuten genau angeben.`);

export const veranstaltungEingabe = z.object({
  name: text(120, "Bitte einen Namen eingeben."),
  art: z.enum(ARTEN),
  status: z.enum(STATUS),
  ort: frei(120).default(""),
  veranstalter: frei(120).default(""),
  // Dasselbe Raster wie die Schichtplanung: eine Planung übernimmt Beginn und Ende unverändert.
  von: zeitpunkt,
  bis: zeitpunkt,
  bemerkung: frei(2000).default(""),
}).superRefine((v, ctx) => {
  if (v.bis <= v.von) ctx.addIssue({ code: "custom", path: ["bis"], message: "Das Ende muss nach dem Beginn liegen." });
  else if (v.bis - v.von > MAX_DAUER_MS) ctx.addIssue({ code: "custom", path: ["bis"], message: "Höchstens 14 Tage." });
});
export type VeranstaltungEingabe = z.infer<typeof veranstaltungEingabe>;

export const idSchema = z.string().min(1).max(64);
