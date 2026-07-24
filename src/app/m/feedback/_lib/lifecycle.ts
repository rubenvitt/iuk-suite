export type SurveyStatus = "draft" | "active" | "closed" | "archived";

export const DEFAULT_CLOSE_AFTER_HOURS = 48;

export function computeClosesAt(activatedAt: Date, closeAfterHours: number): Date {
  return new Date(activatedAt.getTime() + closeAfterHours * 3600_000);
}

export function isExpired(closesAt: Date | null, now: Date): boolean {
  if (closesAt === null) return false;
  return now.getTime() >= closesAt.getTime();
}

/**
 * Lazy Auto-Close (Spec Entscheidung 3): eine aktive, abgelaufene Umfrage gilt
 * beim nächsten Zugriff als geschlossen. Alle anderen Zustände bleiben. Rein —
 * das Persistieren übernimmt der Aufrufer (Repo/Action), auf GET UND Submit.
 */
export function nextStatusOnAccess(
  status: SurveyStatus,
  closesAt: Date | null,
  now: Date,
): SurveyStatus {
  if (status === "active" && isExpired(closesAt, now)) return "closed";
  return status;
}
