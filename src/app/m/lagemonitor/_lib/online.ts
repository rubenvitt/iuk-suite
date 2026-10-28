/**
 * Adresse des Online-Lagemonitors (Cloud-Instanz neben der Suite), z. B.
 * `https://lagemonitor.iuk-ue.de/monitor`. Nur die Links für Rechner ohne Anmeldung brauchen sie;
 * ohne Eintrag zeigt die Verwaltung den Bereich mit einem Hinweis statt eines Formulars.
 */
export function onlineAdresse(env: Record<string, string | undefined> = process.env): string | null {
  const roh = env.LAGEMONITOR_ONLINE_URL?.trim();
  if (!roh) return null;
  try {
    const u = new URL(roh);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
