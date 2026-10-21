/**
 * Die Fahrzeugzeilen der drei Apps als `Kandidat`en. Gelesen wird nur über die je eine Datei, die jede App
 * dafür veröffentlicht (`<modul>/_lib/fahrzeugbestand.ts`) — nie ihre Datenbank oder ihr Schema.
 *
 * Die Umrechnungen sind eigene Funktionen ohne Datenbank, damit `quellen.test.ts` sie prüfen kann.
 */
import { einsatzbuchFahrzeuge, type EinsatzbuchFahrzeug } from "@/app/m/einsatzbuch/_lib/fahrzeugbestand";
import { lagerbuchFahrzeuge, type LagerbuchFahrzeug } from "@/app/m/lagerbuch/_lib/fahrzeugbestand";
import { funkgeraeteOrte, type FunkgeraeteOrt } from "@/app/m/radio/_lib/fahrzeugbestand";
import { kennerAus, type Kandidat } from "./plan";

export function ausEinsatzbuch(f: EinsatzbuchFahrzeug): Kandidat {
  return {
    quelle: "einsatzbuch", quellId: f.id, anzeige: `${f.typ} ${f.kennung}`, typ: f.typ, funkrufname: f.ruf,
    funkkenner: kennerAus(f.kennung) ?? f.kennung, kennzeichen: null, standort: f.standort, aktiv: f.aktiv,
    hinweis: f.aktiv ? null : "im Einsatzbuch deaktiviert",
  };
}

export function ausLagerbuch(f: LagerbuchFahrzeug): Kandidat {
  const hinweise = [!f.aktiv && "im Lagerbuch deaktiviert", f.einheitenart === null && "im Lagerbuch nicht als Fahrzeug oder Tasche zugeordnet"].filter(Boolean);
  return {
    quelle: "lagerbuch", quellId: f.id, anzeige: f.name, typ: null, funkrufname: null,
    funkkenner: kennerAus(f.name), kennzeichen: f.kennung, standort: null, aktiv: f.aktiv,
    hinweis: hinweise.length ? hinweise.join(", ") : null,
  };
}

export function ausFunkgeraeten(o: FunkgeraeteOrt): Kandidat {
  return {
    quelle: "funkgeraete", quellId: o.ort, anzeige: o.ort, typ: null, funkrufname: null,
    funkkenner: kennerAus(o.ort), kennzeichen: null, standort: null, aktiv: true,
    hinweis: o.geraete === 1 ? "1 Funkgerät" : `${o.geraete} Funkgeräte`,
  };
}

/** Alle Kandidaten der drei Apps. Fällt eine Quelle aus, fehlen ihre Zeilen und `fehler` nennt sie. */
export function leseKandidaten(): { kandidaten: Kandidat[]; fehler: string[] } {
  const kandidaten: Kandidat[] = [];
  const fehler: string[] = [];
  const lies = (name: string, lesen: () => Kandidat[]) => {
    try {
      kandidaten.push(...lesen());
    } catch {
      fehler.push(name);
    }
  };
  lies("Einsatzbuch", () => einsatzbuchFahrzeuge().map(ausEinsatzbuch));
  lies("Lagerbuch", () => lagerbuchFahrzeuge().map(ausLagerbuch));
  lies("Funkgeräte", () => funkgeraeteOrte().map(ausFunkgeraeten));
  return { kandidaten, fehler };
}
