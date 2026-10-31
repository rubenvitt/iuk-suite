/**
 * Die Treffer der Funkgeräte für die suiteweite Suche (IDA-301, Vertrag in `core/suche`).
 *
 * Zugang: nur die VERWALTUNG (Admin oder Updater, `istRadioVerwaltung` aus `_lib/zugang.ts`) —
 * dieselbe Stufe, die `admin/(arbeit)/` riegelt, und dorthin führt jeder Treffer. Die anonyme
 * Ausleihe sucht nicht mit: Seriennummer und Zuordnung gehören nicht vor jemanden, der nur ein
 * Gerät ausleihen will.
 *
 * Gesucht wird mit der Geräteliste der Verwaltung selbst (`geraeteListe`) über ALLE ihre
 * Suchfelder — Rufname, ISSI, TEI, Seriennummer, OPTA, Lagerort usw. —, damit die Suite dasselbe
 * findet wie die Liste im Modul.
 */
import type { Session } from "next-auth";
import { kappe, merkmale, TREFFER_JE_MODUL, type SuchAntwort } from "@/core/suche";
import { getDb, type DB } from "../_db/client";
import { SUCHFELDER } from "./geraeteFelder";
import { geraeteListe } from "./lesepfade/geraete";
import { istRadioVerwaltung, viewerAusSession } from "./zugang";

export function suiteSuche(begriff: string, sitzung: Session | null, db?: DB): SuchAntwort | null {
  if (!istRadioVerwaltung(viewerAusSession(sitzung))) return null;
  const seite = geraeteListe(db ?? getDb(), {
    q: begriff,
    suchfelder: [...SUCHFELDER],
    sortierung: "rufname:asc",
    seitenGroesse: TREFFER_JE_MODUL,
  });
  const antwort = kappe(
    seite.zeilen.map((g) => ({
      id: g.id,
      art: "Funkgerät",
      titel: g.rufname ?? `ISSI ${g.issi}`,
      merkmale: merkmale(
        ["ISSI", g.issi],
        ["Seriennummer", g.seriennummer],
        ["OPTA", g.opta],
        ["Typ", g.geraeteTyp],
        ["Lagerort", g.lagerort],
      ),
      pfad: `/admin/geraete/${encodeURIComponent(g.id)}`,
    })),
  );
  return { ...antwort, mehr: seite.gesamt > antwort.treffer.length };
}
