/**
 * GLEICHE HERKUNFT für Route Handler (Umsetzungsplan Phase 4, Entscheidung 3). Server Actions vergleichen
 * `Origin` mit `Host`/`X-Forwarded-Host` selbst (`server-actions.md`, „CSRF check"); ein Route Handler tut
 * das nicht. Die Sitzung der Suite gilt für alle `*.iuk-ue.de` — „gleiche Site" reicht also nicht, eine
 * Seite auf einem anderen Modul-Host dürfte sonst mit der Sitzung der Nutzerin hochladen. Ohne `Origin`
 * (ein Browser schickt ihn bei jedem POST mit `fetch`) gilt die Anfrage als fremd. Rein: kein `next/*`.
 */
export function gleicheHerkunft(kopf: Headers): boolean {
  const origin = kopf.get("origin");
  const host = (kopf.get("x-forwarded-host") ?? kopf.get("host"))?.split(",")[0]?.trim();
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
