/**
 * GIBT ES DAS OBJEKT EINER DETAILROUTE? (DRK-480) Kein "use client" — die
 * Schutz-Layouts der sieben Detailrouten rufen das aus einer Server Component
 * (Falle 6, `CLAUDE.md`).
 *
 * ⛔ WARUM ES DAS NEBEN DEN LESEPFADEN GIBT: unter einer `loading.tsx` kommt
 * ein `notFound()` der Seite als HTTP 200 an (Falle 23) — der Ladezustand ist
 * schon gestreamt. Das Layout des Segments rendert oberhalb der Grenze und
 * fragt deshalb hier, ob die Seite darunter etwas findet.
 *
 * ⚠️ DIESELBE BEDINGUNG WIE DIE SEITE, NICHT EINE AEHNLICHE. Laesst das Layout
 * etwas durch, das die Seite ablehnt, ist der Status wieder 200; lehnt es
 * etwas ab, das die Seite zeigen wuerde, ist die Seite weg. Deshalb je Route
 * genau die Zeile, an der der Lesepfad `null` liefert — und beim Fahrzeug
 * dessen Typpruefung dazu (eine bekannte Lager-ID ist noch kein Fahrzeug).
 * `vorhanden.test.ts` haelt beide Seiten gegeneinander.
 *
 * ⚠️ NUR EIN PRIMAERSCHLUESSEL-ZUGRIFF: das Layout laeuft auch beim
 * Vorabladen, und das soll so schnell bleiben, wie DRK-201 es gemessen hat.
 */
import { eq } from "drizzle-orm";
import {
  bzGeraete, checks, fahrzeugTemplates, geraete, inventuren, lagerorte, o2Flaschen,
} from "../../_db/schema";
import type { Leser } from "./bestand";

export type Detailroute =
  | "bz" | "check" | "fahrzeug" | "geraet" | "inventurlauf" | "sauerstoff" | "vorlage";

export function detailVorhanden(db: Leser, route: Detailroute, id: string): boolean {
  switch (route) {
    case "bz":
      return db.select({ id: bzGeraete.id }).from(bzGeraete).where(eq(bzGeraete.id, id)).get() !== undefined;
    case "check":
      return db.select({ id: checks.id }).from(checks).where(eq(checks.id, id)).get() !== undefined;
    case "fahrzeug":
      return db.select({ typ: lagerorte.typ }).from(lagerorte).where(eq(lagerorte.id, id)).get()?.typ === "fahrzeug";
    case "geraet":
      return db.select({ id: geraete.id }).from(geraete).where(eq(geraete.id, id)).get() !== undefined;
    case "inventurlauf":
      return db.select({ id: inventuren.id }).from(inventuren).where(eq(inventuren.id, id)).get() !== undefined;
    case "sauerstoff":
      return db.select({ id: o2Flaschen.id }).from(o2Flaschen).where(eq(o2Flaschen.id, id)).get() !== undefined;
    case "vorlage":
      return db.select({ id: fahrzeugTemplates.id }).from(fahrzeugTemplates)
        .where(eq(fahrzeugTemplates.id, id)).get() !== undefined;
  }
}
