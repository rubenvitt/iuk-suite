export type AuditEntscheid = "einzeln" | "gedrosselt" | "still";

/**
 * Obergrenze für Audit-Zeilen wiederholter anonymer Ablehnungen — Herkunft UAV-Anmeldung
 * (DRK-447, `uav/_lib/anmeldeSchranke.ts`), seit IDA-263 auch `auditLoginRequired`.
 *
 * Je Minutenfenster höchstens `max` einzelne Zeilen, danach EINE Markierung (`gedrosselt`,
 * geschrieben als `access_throttled`) und bis zum nächsten Fenster nichts mehr. Die Markierung
 * ist die Spur eines Scans — ganz verwerfen hieße, genau den Angriff unsichtbar zu machen.
 *
 * `buendelMs` (optional): eine Ablehnung so kurz nach der letzten EINZELN geschriebenen ist
 * derselbe Seitenaufruf (Layout- und Seitenriegel, parallele Abrufe eines Tabs) und bleibt
 * still, ohne das Budget zu belasten.
 *
 * Festes Fenster: für die Markierung zählt, ob sie in DIESEM Fenster schon geschrieben ist.
 * Prozessspeicher — nach einem Neustart beginnt ein frisches Fenster.
 */
export class AblehnungsDrossel {
  private fensterStart = -Infinity;
  private geschrieben = 0;
  private markiert = false;
  private letzteZeile = -Infinity;
  constructor(private readonly opts: { max: number; windowMs: number; buendelMs?: number; now?: () => number }) {}
  /** Was soll für DIESE Ablehnung ins Audit? Bucht zugleich. */
  entscheiden(): AuditEntscheid {
    const t = (this.opts.now ?? Date.now)();
    if (t - this.fensterStart >= this.opts.windowMs) { this.fensterStart = t; this.geschrieben = 0; this.markiert = false; }
    if (this.opts.buendelMs && t - this.letzteZeile < this.opts.buendelMs) return "still";
    if (this.geschrieben < this.opts.max) { this.geschrieben++; this.letzteZeile = t; return "einzeln"; }
    if (!this.markiert) { this.markiert = true; return "gedrosselt"; }
    return "still";
  }
}
