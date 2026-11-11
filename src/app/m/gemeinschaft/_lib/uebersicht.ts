/**
 * Die Übersicht der Leitung (POC `Uebersicht`): vier Kacheln, „Als Nächstes“ und „Hier fehlt noch jemand“.
 * Die Bar-Zahlen liest sie mit eigener kleiner Abfrage aus den Tabellen der Vermietung.
 */
import { and, count, eq, gt, ne, type SQL } from "drizzle-orm";
import type { GemeinschaftSchreiber } from "../_db/client";
import { anfrage } from "../_db/schema";
import { ladeBestand } from "./vorhaben";
import { istVorbei, type VorhabenArt } from "./vorhabenTypen";
import { tagInZone } from "./zeit";

export type Vertragsstand = "offen" | "verschickt" | "unterschrieben";

export type Termin =
  | { art: "event"; id: string; von: number; bis: number; titel: string; unter: string; ohneZustaendige: number }
  | { art: "anmietung"; id: string; von: number; bis: number; titel: string; unter: string; vertrag: Vertragsstand };

export type Luecke = { aufgabeId: string; titel: string; vorhabenId: string; vorhabenArt: VorhabenArt; vorhabenTitel: string; faellig: string | null; von: number | null };

export type UebersichtDTO = {
  /** Offene Bar-Anfragen. */
  anfragen: number;
  /** Zusagen, die noch nicht vorbei sind und deren Vertrag nicht unterschrieben ist. */
  vertraege: number;
  projekte: number;
  termine: Termin[];
  luecken: Luecke[];
};

/** Wie viele Termine „Als Nächstes“ zeigt. */
export const TERMINE_MAX = 6;

const zaehle = (db: GemeinschaftSchreiber, wo: SQL | undefined) => db.select({ n: count() }).from(anfrage).where(wo).get()?.n ?? 0;

export function ladeUebersicht(db: GemeinschaftSchreiber, jetzt = Date.now()): UebersichtDTO {
  const b = ladeBestand(db);
  const anfragen = zaehle(db, and(eq(anfrage.raum, "bar"), eq(anfrage.status, "angefragt")));
  const zusagen = db.select({ id: anfrage.id, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, person: anfrage.person, vertrag: anfrage.vertrag })
    .from(anfrage).where(and(eq(anfrage.raum, "bar"), eq(anfrage.status, "zugesagt"), gt(anfrage.bis, jetzt))).all();
  const vertraege = zaehle(db, and(eq(anfrage.raum, "bar"), eq(anfrage.status, "zugesagt"), gt(anfrage.bis, jetzt), ne(anfrage.vertrag, "unterschrieben")));

  const aktiv = b.vorhaben.filter((v) => !istVorbei(v, jetzt));
  const termine: Termin[] = [
    ...aktiv.filter((v) => v.art === "event").map((v): Termin => {
      const name = v.verantwortlichId ? b.mitglieder.get(v.verantwortlichId)?.name : undefined;
      return {
        art: "event", id: v.id, von: v.von!, bis: v.bis!, titel: v.titel,
        unter: [v.ort, name ? `verantwortlich ${name}` : ""].filter(Boolean).join(" · "),
        ohneZustaendige: (b.aufgaben.get(v.id) ?? []).filter((a) => !a.erledigt && a.zustaendig.length === 0).length,
      };
    }),
    ...zusagen.map((a): Termin => ({ art: "anmietung", id: a.id, von: a.von, bis: a.bis, titel: `Bar vermietet: ${a.anlass}`, unter: a.person, vertrag: a.vertrag })),
  ].sort((x, y) => x.von - y.von).slice(0, TERMINE_MAX);

  const luecken: Luecke[] = aktiv.flatMap((v) => (b.aufgaben.get(v.id) ?? []).filter((a) => !a.erledigt && a.zustaendig.length === 0)
    .map((a) => ({ aufgabeId: a.id, titel: a.titel, vorhabenId: v.id, vorhabenArt: v.art, vorhabenTitel: v.titel, faellig: a.faellig, von: v.von })));
  const schluessel = (l: Luecke) => l.faellig ?? (l.von !== null ? tagInZone(l.von) : "9999");
  luecken.sort((x, y) => schluessel(x).localeCompare(schluessel(y)) || x.vorhabenTitel.localeCompare(y.vorhabenTitel, "de"));

  return { anfragen, vertraege, projekte: b.vorhaben.filter((v) => v.art === "projekt").length, termine, luecken };
}
