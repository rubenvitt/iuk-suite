import { getModule, requiredGroupsFor } from "@/core/registry";
import { isFeedbackAdmin, type Viewer } from "../access";
import { istEhrlichLeser, leserGruppe } from "./zugang";

/**
 * Liest diese Person NUR „Ehrlich gesagt"? Dann hat sie keine andere Zugangsgruppe des Moduls, ist nicht
 * Feedback-Admin und leitet keine Gruppe über den `fachgruppen`-Claim. Eine Zuordnung über `user_groups`
 * ohne Modulgruppe gewährt ohnehin nichts (`hatFeedbackVerwaltungszugang`).
 */
export function nurEhrlichLeser(viewer: Viewer): boolean {
  if (!istEhrlichLeser(viewer.groups) || isFeedbackAdmin(viewer) || viewer.fachgruppen.length > 0) return false;
  const leser = leserGruppe();
  const andere = requiredGroupsFor(getModule("feedback")).filter((g) => g !== leser);
  return !viewer.groups.some((g) => andere.includes(g));
}
