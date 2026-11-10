/**
 * DIE INHALTE DES LAGERBUCHS FÜR „SPRINGEN ZU" (IDA-380) — Artikel und Einheiten, damit „Kompressen"
 * oder „RTW" im Menü direkt auf ihre Seite führen und nicht erst über die suiteweite Suche.
 *
 * KEIN "use client": die Verwaltungs-Layout-Datei (Server Component) liest das hier und reicht es an
 * die Shell (Falle 6).
 *
 * ⚠️ ZUGANG: gelesen wird erst NACH `requireLagerbuchAdmin` im Layout von `verwaltung/(arbeit)`. Die
 * Liste trägt nichts, was die Verwaltungsseiten derselben Person nicht ohnehin zeigen, und jedes Ziel
 * führt in die Verwaltung — dieselbe Regel wie `suiteSuche.ts` („dorthin führt jeder Treffer").
 *
 * NUR AKTIVE: eine ausgemusterte Einheit oder ein ausgelisteter Artikel ist kein Ziel, zu dem jemand
 * springen will; die suiteweite Suche findet beide weiterhin, mit „inaktiv" gekennzeichnet.
 *
 * Die Felder sind Anzeige-DTOs (Falle 9): Zeichenketten, nichts sonst.
 */
import { eq } from "drizzle-orm";
import type { Sprungziel } from "@/core/shell/types";
import { artikel, lagerorte } from "../_db/schema";
import { einheitNomen, istEntnahmebox } from "./konstanten";
import type { Leser } from "./lesepfade/bestand";
import { verwaltungDetailPfad } from "./verwaltungPfad";

const ohneLeere = (werte: (string | null | undefined)[]): string[] =>
  werte.filter((w): w is string => !!w && w.trim() !== "");

export function lagerbuchSprungziele(db: Leser): Sprungziel[] {
  const artikelZiele = db
    .select({ id: artikel.id, name: artikel.name, kategorie: artikel.kategorie, fach: artikel.fach })
    .from(artikel)
    .where(eq(artikel.aktiv, true))
    .orderBy(artikel.name)
    .all()
    .map((a): Sprungziel => ({
      key: `artikel:${a.id}`,
      titel: a.name,
      hinweis: "Artikel",
      href: `/verwaltung/artikel?artikel=${encodeURIComponent(a.id)}`,
      stichworte: ohneLeere([a.kategorie, a.fach]),
    }));

  const ortZiele = db
    .select({
      id: lagerorte.id, name: lagerorte.name, typ: lagerorte.typ,
      kennung: lagerorte.kennung, einheitenart: lagerorte.einheitenart,
    })
    .from(lagerorte)
    .where(eq(lagerorte.aktiv, true))
    .orderBy(lagerorte.name)
    .all()
    .map((o): Sprungziel => {
      if (o.typ === "fahrzeug") {
        return {
          key: `ort:${o.id}`,
          titel: o.name,
          hinweis: einheitNomen(o.einheitenart),
          href: verwaltungDetailPfad("fahrzeuge", o.id),
          stichworte: ohneLeere([o.kennung]),
        };
      }
      return {
        key: `ort:${o.id}`,
        titel: o.name,
        hinweis: "Lagerort",
        // Die Box hat ihre eigene Seite (DRK-314); die Schränke des Handlagers stehen gesammelt.
        href: istEntnahmebox(o.id) ? "/verwaltung/entnahmebox" : "/verwaltung/lagerorte",
        stichworte: ohneLeere([o.kennung]),
      };
    });

  // Einheiten zuerst: sie sind wenige, und ein Kennzeichen-Treffer („RTW") soll nicht hinter acht
  // Artikeln mit „rtw" im Fach verschwinden (`SPRUNGZIELE_MAX`).
  return [...ortZiele, ...artikelZiele];
}
