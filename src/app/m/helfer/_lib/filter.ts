/**
 * Der Importfilter: wer überhaupt in die Suite kommt. Wer hier durchfällt, wird nur gezählt —
 * nie gespeichert, nie angezeigt (Datensparsamkeit: kein Name einer Person, die die Suite nicht
 * braucht, verlässt `abgleich.ts`).
 *
 * Feste Regeln, nicht abschaltbar: gesperrte Konten und Ausgetretene (Austrittsdatum heute oder
 * früher) kommen nie hinein. Einstellbar: welche Kontostatus zählen (Vorgabe nur „aktiv“), Gruppen,
 * von denen mindestens eine vorliegen muss, und Gruppen, die ausschließen (z. B. „Passive“,
 * „Fördermitglieder“). HiOrg kennt keinen Mitgliedschaftsstatus „passiv“ — wo eine Gliederung
 * Passive führt, dann als Gruppe.
 *
 * Gruppennamen werden ohne Groß-/Kleinschreibung und ohne Rand-Leerraum verglichen.
 */
import { z } from "zod";
import type { QuellPerson } from "./hiorg/person";

/** Wählbare Kontostatus. „gesperrt“ fehlt absichtlich: gesperrte Konten kommen nie hinein. */
export const WAEHLBARE_STATUS = ["aktiv", "eingeschraenkt", "extern"] as const;
export const STATUS_TEXT: Record<string, string> = {
  aktiv: "aktiv", eingeschraenkt: "eingeschränkt", extern: "extern", gesperrt: "gesperrt",
};

export const filterSchema = z.object({
  status: z.array(z.enum(WAEHLBARE_STATUS)).min(1, "Mindestens einen Kontostatus wählen").max(WAEHLBARE_STATUS.length),
  gruppenEin: z.array(z.string().trim().min(1).max(80)).max(50),
  gruppenAus: z.array(z.string().trim().min(1).max(80)).max(50),
});
export type Importfilter = z.infer<typeof filterSchema>;

export const STANDARD_FILTER: Importfilter = { status: ["aktiv"], gruppenEin: [], gruppenAus: [] };

export const AUSSCHLUSSGRUENDE = ["status", "gesperrt", "ausgetreten", "gruppe_fehlt", "gruppe_ausgeschlossen"] as const;
export type Ausschlussgrund = (typeof AUSSCHLUSSGRUENDE)[number];

export const GRUND_TEXT: Record<Ausschlussgrund, string> = {
  status: "Kontostatus nicht gewählt",
  gesperrt: "Konto gesperrt",
  ausgetreten: "ausgetreten",
  gruppe_fehlt: "in keiner der gewählten Gruppen",
  gruppe_ausgeschlossen: "in einer ausgeschlossenen Gruppe",
};

const norm = (g: string) => g.trim().toLocaleLowerCase("de");

/**
 * `null` heißt „kommt hinein“, sonst der erste zutreffende Grund in fester Reihenfolge — damit die
 * Zählung je Grund stabil bleibt, auch wenn mehrere zutreffen.
 * `heute` ist der Kalendertag in der Suite-Zone als `YYYY-MM-DD` (Aufrufer: `heuteInZone`).
 */
export function ausschlussgrund(p: QuellPerson, filter: Importfilter, heute: string): Ausschlussgrund | null {
  if (p.gesperrt || p.status === "gesperrt") return "gesperrt";
  if (p.austritt !== null && p.austritt <= heute) return "ausgetreten";
  if (!(filter.status as readonly string[]).includes(p.status)) return "status";
  const gruppen = new Set(p.gruppen.map(norm));
  if (filter.gruppenAus.some((g) => gruppen.has(norm(g)))) return "gruppe_ausgeschlossen";
  if (filter.gruppenEin.length > 0 && !filter.gruppenEin.some((g) => gruppen.has(norm(g)))) return "gruppe_fehlt";
  return null;
}

/** Der Filter für die Anfrage an HiOrg selbst (`filter[status]`): schon dort nur die gewählten Status. */
export function statusParameter(filter: Importfilter): string {
  return [...new Set(filter.status)].join(",");
}
