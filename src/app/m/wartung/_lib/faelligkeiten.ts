/**
 * DIE FÄLLIGKEITEN DER GERÄTEWARTUNG FÜR „WAS STEHT AN“ IM PORTAL (IDA-312). Das Portal liest weder diese
 * Datenbank noch ihr Schema, nur was hier herausgegeben wird (Muster `lagerbuch/_lib/faelligkeiten.ts`).
 *
 * HIER WIRD NICHTS NEU GERECHNET: die Fristen kommen aus `ladeGeraete` → `fristen.ts`, derselbe Weg wie die
 * Übersicht des Moduls.
 *
 * Was herausgegeben wird:
 *   * jede Frist, die nicht im Plan ist (überfällig oder in den nächsten 30 Tagen bzw. 20 Betriebsstunden);
 *     endet sie heute, ist sie „fällig“ (IDA-402);
 *   * jedes Gerät, das nicht einsatzbereit ist → überfällig; neue „nicht einsatzbereit“-Mängel gehen außerdem
 *     sofort als Push hinaus (`wartungSofortmeldungen`), nicht erst am Montag;
 *   * jede einsatzbereite Materialkiste, in der beim Durchzählen etwas fehlte (IDA-335) → bald.
 * Jeder Eintrag trägt `sichtbarFuer`: die Personenschlüssel der Verwalter seiner Gruppe (`personSchluessel`,
 * IDA-337) und die Admin-Gruppen. So sehen die Verwalter von Technik nur Technik (Entscheidung 2026-11-03 an
 * IDA-307).
 */
import { adminGroupsFor } from "@/core/groups";
import { getModule } from "@/core/registry";
import { personSchluessel, type Faelligkeit, type Sofortmeldung } from "@/core/faelligkeiten";
import { getDb, type WartungDb } from "../_db/client";
import { verwalter } from "../_db/schema";
import { ladeGeraete } from "./daten";
import type { Wer } from "./fristen";
import { tagInZone } from "./heute";
import { ungepushteAusfaelle, vermerkeGepusht } from "./schreiben";
import { hatWartungZugang } from "./zugang";

export const WARTUNG_FAELLIGKEITS_ARTEN = ["Prüfung am Gerät", "Wartung", "Elektroprüfung", "Nicht einsatzbereit", "Kiste unvollständig"] as const;
type WartungFaelligkeit = Faelligkeit & { art: (typeof WARTUNG_FAELLIGKEITS_ARTEN)[number] };

const ART_JE_WER: Record<Wer, WartungFaelligkeit["art"]> = {
  intern: "Prüfung am Gerät",
  fachfirma: "Wartung",
  elektrofachkraft: "Elektroprüfung",
};

type Leser = Pick<WartungDb, "select">;

/** Je Gruppe die Personenschlüssel ihrer Verwalter. */
function verwalterJeGruppe(db: Leser): Map<string, string[]> {
  const aus = new Map<string, string[]>();
  for (const v of db.select({ g: verwalter.gruppeId, n: verwalter.nutzer }).from(verwalter).all()) {
    aus.set(v.g, [...(aus.get(v.g) ?? []), personSchluessel(v.n)]);
  }
  return aus;
}

/**
 * Sieht diese Person überhaupt Fristen der Gerätewartung? Admin-Gruppen des Moduls OHNE den Suite-Admin-
 * Kurzschluss (wie das Lagerbuch) oder Verwalter einer Gruppe mit Modulzugang. `groups` sind die
 * Sichtschlüssel des Portals (`sichtSchluessel`). Welche Einträge, sagt danach `sichtbarFuer`.
 * Eine nicht lesbare Datenbank heißt „nein“ — sonst risse sie die Startseite des Portals mit.
 */
export function darfWartungFaelligkeitenSehen(groups: readonly string[] | null | undefined, db?: Leser): boolean {
  if (!groups || groups.length === 0) return false;
  if (adminGroupsFor(getModule("wartung")).some((g) => groups.includes(g))) return true;
  try {
    if (!hatWartungZugang(groups)) return false;
    return [...verwalterJeGruppe(db ?? getDb()).values()].flat().some((p) => groups.includes(p));
  } catch {
    return false;
  }
}

export function wartungFaelligkeiten(jetzt: Date, db: Leser = getDb()): Faelligkeit[] {
  const admins = adminGroupsFor(getModule("wartung"));
  const je = verwalterJeGruppe(db);
  const fuer = (gruppeId: string) => [...(je.get(gruppeId) ?? []), ...admins];
  const heute = tagInZone(jetzt.getTime());
  const geraete = ladeGeraete(db, { gruppen: null, heute });

  const ausfaelle = geraete.filter((g) => g.zustand === "defekt").map((g): WartungFaelligkeit => ({
    id: `defekt:${g.id}`,
    art: "Nicht einsatzbereit",
    titel: g.name,
    wo: g.ort,
    zustand: "nicht einsatzbereit",
    dringlichkeit: "ueberfaellig",
    sortierung: "",
    pfad: `/geraete/${g.id}`,
    sichtbarFuer: fuer(g.gruppeId),
  }));
  const fristen = geraete.flatMap((g) => g.staende.filter((f) => f.stufe !== "ok").map((f): WartungFaelligkeit => ({
    id: `frist:${g.id}:${f.vorlage.id}`,
    art: ART_JE_WER[f.vorlage.wer],
    titel: `${f.vorlage.name} · ${g.name}`,
    wo: g.ort,
    zustand: f.text,
    dringlichkeit: f.stufe === "ueberfaellig" ? "ueberfaellig" : f.faelligAm === heute ? "faellig" : "bald",
    sortierung: f.faelligAm ?? "",
    pfad: `/geraete/${g.id}`,
    sichtbarFuer: fuer(g.gruppeId),
  })));
  const unvollstaendig = geraete.filter((g) => g.fehlend > 0 && g.zustand !== "defekt").map((g): WartungFaelligkeit => ({
    id: `fehlt:${g.id}`,
    art: "Kiste unvollständig",
    titel: g.name,
    wo: g.ort,
    zustand: g.fehlend === 1 ? "1 Position fehlt" : `${g.fehlend} Positionen fehlen`,
    dringlichkeit: "bald",
    sortierung: "",
    pfad: `/geraete/${g.id}`,
    sichtbarFuer: fuer(g.gruppeId),
  }));
  return [...ausfaelle, ...unvollstaendig, ...fristen];
}

/** Neue „nicht einsatzbereit“-Meldungen für den Sofort-Push — ohne Freitext und ohne Namen. */
export function wartungSofortmeldungen(seit: Date, db: Leser = getDb()): Sofortmeldung[] {
  const admins = adminGroupsFor(getModule("wartung"));
  const je = verwalterJeGruppe(db);
  return ungepushteAusfaelle(db, seit.getTime()).map((m) => ({
    id: m.id,
    art: "Nicht einsatzbereit",
    titel: `Nicht einsatzbereit: ${m.geraetName}`,
    zeilen: [m.ort, m.foto ? "Mangel mit Foto gemeldet" : "Mangel gemeldet"],
    pfad: `/geraete/${m.geraetId}`,
    sichtbarFuer: [...(je.get(m.gruppeId) ?? []), ...admins],
  }));
}

export function vermerkeWartungSofortmeldungen(ids: readonly string[], jetzt: Date, db: WartungDb = getDb()): void {
  vermerkeGepusht(db, ids, jetzt.getTime());
}
