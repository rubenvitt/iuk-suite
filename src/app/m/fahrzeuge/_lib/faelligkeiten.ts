/**
 * DIE FÄLLIGKEITEN DER FAHRZEUGAKTE FÜR „WAS STEHT AN“ IM PORTAL (IDA-299). Das Portal liest weder diese
 * Datenbank noch ihr Schema, nur was hier herausgegeben wird (Muster `wartung/_lib/faelligkeiten.ts`).
 *
 * HIER WIRD NICHTS NEU GERECHNET: die Stände kommen aus `akte/regeln.ts`, derselbe Weg wie Tafel und Akte.
 *
 * Was herausgegeben wird, je aktivem Fahrzeug:
 *   * jede Prüfung, die überfällig ist oder bald ansteht (30 Tage bzw. 1.000 km); endet der Termin heute,
 *     ist sie „fällig“ (IDA-402). „Nicht erfasst“ steht nicht hier — das zeigt die Tafel des Moduls;
 *   * die Reifen, bis zu zwei Einträge: der Wechsel zur Saison und das Alter des aufgezogenen Satzes.
 * Kein `sichtbarFuer`: die Quelle geht ohnehin nur an die Admin-Gruppen des Moduls.
 */
import { adminGroupsFor } from "@/core/groups";
import { getModule } from "@/core/registry";
import type { Faelligkeit } from "@/core/faelligkeiten";
import { getDb, type FahrzeugeDb } from "../_db/client";
import { ladeAkten } from "./akte/daten";
import { tagInZone } from "./akte/heute";
import { auswerten, datum, dotDatum, plusMonate, reifenGrenzen, saisonWechsel, tageBis, GELB_TAGE } from "./akte/regeln";
import type { AkteDTO, PruefStand, Stufe } from "./akte/typen";

/** Die Arten, die diese Datei herausgibt — Grundlage der Auswahl im Portal. */
export const FAHRZEUGE_FAELLIGKEITS_ARTEN = ["HU", "UVV", "Service", "Reifen", "Prüfung"] as const;
type FahrzeugeFaelligkeit = Faelligkeit & { art: (typeof FAHRZEUGE_FAELLIGKEITS_ARTEN)[number] };

/**
 * Nur die Admin-Gruppen des Moduls, OHNE den Suite-Admin-Kurzschluss (Entscheidung an IDA-299, wie
 * `darfRadioFaelligkeitenSehen`): die Termine gehen an die, die die Fahrzeuge verwalten.
 */
export function darfFahrzeugeFaelligkeitenSehen(groups: readonly string[] | null | undefined): boolean {
  if (!groups) return false;
  const erlaubt = adminGroupsFor(getModule("fahrzeuge"));
  return groups.some((g) => erlaubt.includes(g));
}

const meldet = (s: Stufe) => s === "ueberfaellig" || s === "bald";

/** Der Zustand einer Prüfung in Worten; bei „Weitere“ steht der Name vorn, weil die Art nur „Prüfung“ sagt. */
function zustand(s: PruefStand, heute: string): string {
  const vorn = s.pruefung.art === "Weitere" ? `${s.pruefung.name}: ` : "";
  if (s.stufe === "ueberfaellig" || !s.faelligAm) return vorn + s.text;
  const rest = tageBis(s.faelligAm, heute);
  if (rest === 0) return vorn + s.text; // „heute fällig“
  // Die Kilometer kommen zuerst: der Termin steht dahinter, damit niemand ihn für den Anlass hält.
  if (rest > GELB_TAGE) return `${vorn}${s.text}, Termin ${datum(s.faelligAm)}`;
  return `${vorn}fällig ${s.text} (${datum(s.faelligAm)})`;
}

/** Der reine Kern: aus Akten und dem Kalendertag die Einträge. Die Reihenfolge legt das Portal fest. */
export function ausAkten(akten: readonly AkteDTO[], heute: string): Faelligkeit[] {
  return akten.flatMap((akte): FahrzeugeFaelligkeit[] => {
    const fz = akte.fahrzeug;
    const a = auswerten(akte, heute);
    const gemeinsam = {
      titel: `${fz.typ} ${fz.funkkenner || fz.kennzeichen || ""}`.trim(),
      wo: fz.standort || null,
      pfad: `/fahrzeug/${fz.id}`,
    };
    const aus: FahrzeugeFaelligkeit[] = a.pruefungen.filter((s) => meldet(s.stufe)).map((s) => ({
      ...gemeinsam,
      id: `pruefung:${s.pruefung.id}`,
      art: s.pruefung.art === "Weitere" ? "Prüfung" : s.pruefung.art,
      zustand: zustand(s, heute),
      dringlichkeit: s.stufe === "ueberfaellig" ? "ueberfaellig" : s.faelligAm === heute ? "faellig" : "bald",
      sortierung: s.faelligAm ?? "",
    }));
    if (a.reifen) {
      const { saison, alter, satz } = a.reifen;
      if (meldet(saison.stufe)) {
        aus.push({
          ...gemeinsam, id: `reifen:${fz.id}:saison`, art: "Reifen", zustand: saison.text,
          dringlichkeit: saison.stufe === "ueberfaellig" ? "ueberfaellig" : "bald",
          sortierung: saisonWechsel(heute).start,
        });
      }
      if (meldet(alter.stufe)) {
        const ab = dotDatum(satz.dot);
        aus.push({
          ...gemeinsam, id: `reifen:${fz.id}:alter`, art: "Reifen", zustand: alter.text,
          dringlichkeit: alter.stufe === "ueberfaellig" ? "ueberfaellig" : "bald",
          // Der Tag, an dem der Satz die Altersgrenze erreicht.
          sortierung: ab ? plusMonate(ab, reifenGrenzen(akte.technik.besonderheiten).rot * 12) : "",
        });
      }
    }
    return aus;
  });
}

/**
 * Wirft, wenn die Datenbank nicht lesbar ist — wie die anderen Quellen: `sammle`
 * (`portal/_lib/faelligkeiten/sammeln.ts`) fängt es je Quelle und meldet „nicht lesbar“, statt die
 * Startseite mitzureißen. Ein leeres Ergebnis hier hieße fälschlich „nichts fällig“.
 */
export function fahrzeugeFaelligkeiten(jetzt: Date, db: FahrzeugeDb = getDb()): Faelligkeit[] {
  return ausAkten(ladeAkten(db), tagInZone(jetzt.getTime()));
}
