import type { ImportZeile } from "./csv";
import { vergleichsform, type BibEinheit } from "./typen";

/** Vorschau vor der Übernahme (Entscheidung 12): Status je Zeile, übernommen wird nur „neu". Rein. */
export type VorschauStatus = "neu" | "vorhanden" | "doppelt";
export const STATUS_TEXT: Record<VorschauStatus, string> = { neu: "neu", vorhanden: "schon in der Bibliothek", doppelt: "doppelt in der Liste" };
export interface VorschauZeile extends ImportZeile { status: VorschauStatus }

export function importVorschau(zeilen: readonly ImportZeile[], vorhanden: readonly BibEinheit[]): { zeilen: VorschauZeile[]; neu: ImportZeile[] } {
  const bekannt = new Set(vorhanden.map((e) => vergleichsform(e.rufname)));
  const gesehen = new Set<string>();
  const aus = zeilen.map((z): VorschauZeile => {
    const k = vergleichsform(z.rufname);
    const status: VorschauStatus = bekannt.has(k) ? "vorhanden" : gesehen.has(k) ? "doppelt" : "neu";
    gesehen.add(k);
    return { ...z, status };
  });
  return { zeilen: aus, neu: aus.filter((z) => z.status === "neu").map((z) => ({ zeile: z.zeile, typ: z.typ, rufname: z.rufname, notiz: z.notiz })) };
}
