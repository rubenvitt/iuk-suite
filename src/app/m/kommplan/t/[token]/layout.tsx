import { headers } from "next/headers";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { tokenPlanOder404 } from "@/app/m/kommplan/_lib/tokenZugang";

/**
 * FALLE 23 FÜR DIE TOKEN-ANSICHT (Spec §8.2; Umsetzungsplan Phase 5, Entscheidung 4): unbekannt, falsch geformt,
 * abgelaufen, widerrufen oder Plan archiviert ist hier ein echtes 404 — oberhalb jeder künftigen `loading.tsx`,
 * sonst wäre es still ein HTTP 200. Kein Anmelde-Riegel: der Token IST der Riegel. Die Seiten darunter prüfen
 * selbst noch einmal; `tokenPlanOder404` ist je Anfrage gecacht, gebucht wird einmal.
 */
export default async function TokenSchutz({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  requireKommplanHost(await headers());
  await tokenPlanOder404((await params).token);
  return children;
}
