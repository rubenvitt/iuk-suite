/**
 * DIE FRISTEN DES VERPFLEGUNGSLAGERS FÜR „WAS STEHT AN“ IM PORTAL (IDA-316). Das Portal liest weder diese Datenbank
 * noch ihr Schema, nur was hier herausgegeben wird (Muster `lagerbuch/_lib/faelligkeiten.ts`).
 *
 * Herausgegeben wird jede Charge mit roter Ampel: abgelaufen → überfällig, läuft heute ab → fällig (IDA-402),
 * sonst bald. Die Schwellen stehen am
 * Artikel; gerechnet wird wie in den MHD-Stufen des Bestands (`ladeChargen` → `mhd.ts`).
 *
 * TAGESMELDUNG (Entscheidung 2026-11-04 an IDA-316): montags reicht für Konserven, aber nicht für Brot, Joghurt
 * oder Würstchen. Ab 07:00 in der Suite-Zone geht deshalb einmal am Tag eine Sofortmeldung hinaus, wenn heute etwas
 * abläuft oder ein Verbrauchsdatum morgen endet. Kommt nichts, wird nichts gesendet; `vermerk` hält den Tag fest.
 * Kein Freitext und kein Name in der Meldung: das Thema steht auf fremden Sperrbildschirmen.
 */
import { adminGroupsFor, hasAnyGroup } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";
import type { Faelligkeit, Sofortmeldung } from "@/core/faelligkeiten";
import { getDb, type VerpflegungDb } from "../_db/client";
import { ladeArtikel, ladeChargen, ladeOrte } from "./daten";
import { stundeInZone, tagInZone } from "./heute";
import { stufeVon } from "./bestand";
import { mengeText, restText } from "./mhd";
import { vermerke, vermerkt } from "./schreiben";

export const VERPFLEGUNG_FAELLIGKEITS_ARTEN = ["MHD", "Verbrauchsdatum", "MHD heute"] as const;
type Art = (typeof VERPFLEGUNG_FAELLIGKEITS_ARTEN)[number];
type Leser = Pick<VerpflegungDb, "select">;

/** Ab dieser Stunde (Suite-Zone) geht die Tagesmeldung hinaus. */
export const TAGESMELDUNG_AB_STUNDE = 7;

/**
 * Sieht diese Person die Fristen? Zugangs- oder Admin-Gruppen des Moduls, OHNE den Suite-Admin-Kurzschluss (wie das
 * Lagerbuch): wer das Lager nicht betreut, bekommt auch keine Pushs dazu.
 */
export function darfVerpflegungFaelligkeitenSehen(groups: readonly string[] | null | undefined): boolean {
  if (!groups || groups.length === 0) return false;
  const mod = getModule("verpflegung");
  return hasAnyGroup(groups, [...requiredGroupsFor(mod), ...adminGroupsFor(mod)]);
}

export function verpflegungFaelligkeiten(jetzt: Date, db: Leser = getDb()): Faelligkeit[] {
  const heute = tagInZone(jetzt.getTime());
  const arts = ladeArtikel(db);
  const je = new Map(arts.map((a) => [a.id, a]));
  const orte = new Map(ladeOrte(db).map((o) => [o.id, o]));
  return ladeChargen(db, heute, arts).filter((c) => c.status.ampel === "rot").map((c) => {
    const a = je.get(c.artikelId)!;
    const art: Art = a.mhdArt === "verbrauch" ? "Verbrauchsdatum" : "MHD";
    return {
      id: `charge:${c.id}`,
      art,
      titel: `${a.name} · ${mengeText(c.menge, a.einheit)}`,
      wo: orte.get(c.ortId)?.kurz ?? null,
      zustand: c.status.gesperrt ? `${restText(c.status.tage)}, gesperrt` : restText(c.status.tage),
      dringlichkeit: c.status.abgelaufen ? "ueberfaellig" : c.status.tage === 0 ? "faellig" : "bald",
      sortierung: c.mhd,
      // IDA-382: auf die Stufe des Bestands, in der diese Charge steht.
      pfad: `/bestand?stufe=${stufeVon(c)}`,
    };
  });
}

/** Was heute in die Tagesmeldung gehört: läuft heute ab, oder Verbrauchsdatum endet morgen. */
export function heuteFaellig(db: Leser, heute: string) {
  const arts = ladeArtikel(db);
  const je = new Map(arts.map((a) => [a.id, a]));
  const orte = new Map(ladeOrte(db).map((o) => [o.id, o]));
  return ladeChargen(db, heute, arts)
    .filter((c) => c.status.tage === 0 || (je.get(c.artikelId)!.mhdArt === "verbrauch" && c.status.tage === 1))
    .map((c) => ({ c, a: je.get(c.artikelId)!, ort: orte.get(c.ortId)?.kurz ?? "" }));
}

export function verpflegungSofortmeldungen(jetzt: Date, db: Leser = getDb()): Sofortmeldung[] {
  if (stundeInZone(jetzt.getTime()) < TAGESMELDUNG_AB_STUNDE) return [];
  const heute = tagInZone(jetzt.getTime());
  const id = `tag:${heute}`;
  if (vermerkt(db, [id]).has(id)) return [];
  const liste = heuteFaellig(db, heute);
  if (liste.length === 0) return [];
  const zeilen = liste.slice(0, 4).map(({ c, a, ort }) => `${a.name} · ${mengeText(c.menge, a.einheit)} (${ort}) – ${restText(c.status.tage)}`);
  if (liste.length > 4) zeilen.push(`… und ${liste.length - 4} weitere`);
  return [{
    id,
    art: "MHD heute",
    titel: `MHD heute: ${liste.length} ${liste.length === 1 ? "Charge" : "Chargen"}`,
    zeilen,
    pfad: "/bestand?stufe=kritisch",
  }];
}

export function vermerkeVerpflegungSofortmeldungen(ids: readonly string[], jetzt: Date, db: VerpflegungDb = getDb()): void {
  vermerke(db, ids, jetzt.getTime());
}
