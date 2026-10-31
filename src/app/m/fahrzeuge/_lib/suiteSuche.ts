/**
 * Die Treffer der Fahrzeugverwaltung für die suiteweite Suche (IDA-301, Vertrag in `core/suche`).
 *
 * Zugang wie die Seiten des Moduls: `hatFahrzeugeZugang` aus `_lib/zugang.ts`. Wer das Modul nicht
 * öffnen darf, bekommt `null` und sieht es in der Suche gar nicht.
 *
 * Gesucht wird in Funkrufname, Funkkenner, Kennzeichen, Typ und Standort — nicht in der Bemerkung,
 * die eine Notiz der Verwaltung ist (dieselbe Grenze wie `bereitstellung.ts`). Der Bestand ist klein
 * (ein paar Dutzend Zeilen), deshalb vergleicht JavaScript statt `LIKE`: so finden „ü“ und „Ü“
 * einander, was SQLites `LIKE` nur für ASCII tut.
 *
 * Die Liste kennt keine Einzelseite je Fahrzeug, der Treffer führt deshalb auf die Liste.
 */
import type { Session } from "next-auth";
import { falte, kappe, merkmale, trifft, type SuchAntwort } from "@/core/suche";
import { getDb, type FahrzeugeDb } from "../_db/client";
import { stammfahrzeug } from "../_db/schema";
import { hatFahrzeugeZugang } from "./zugang";

export function suiteSuche(begriff: string, sitzung: Session | null, db?: FahrzeugeDb): SuchAntwort | null {
  if (!sitzung?.user || !hatFahrzeugeZugang(sitzung.user.groups)) return null;
  const nadel = falte(begriff);
  const zeilen = (db ?? getDb()).select({
    id: stammfahrzeug.id, art: stammfahrzeug.art, typ: stammfahrzeug.typ, funkrufname: stammfahrzeug.funkrufname,
    funkkenner: stammfahrzeug.funkkenner, kennzeichen: stammfahrzeug.kennzeichen, standort: stammfahrzeug.standort,
    aktiv: stammfahrzeug.aktiv,
  }).from(stammfahrzeug).orderBy(stammfahrzeug.funkrufname).all();

  return kappe(
    zeilen
      .filter((f) => trifft(nadel, f.funkrufname, f.funkkenner, f.kennzeichen, f.typ, f.standort))
      .map((f) => ({
        id: f.id,
        art: f.art === "anhaenger" ? "Anhänger" : "Fahrzeug",
        titel: f.funkrufname,
        merkmale: merkmale(
          ["Typ", f.typ],
          ["Funkkenner", f.funkkenner],
          ["Kennzeichen", f.kennzeichen],
          ["Standort", f.standort],
          ["Status", f.aktiv ? null : "außer Dienst"],
        ),
        pfad: "/",
      })),
  );
}
