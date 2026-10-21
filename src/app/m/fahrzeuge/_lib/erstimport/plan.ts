/**
 * DER ERSTIMPORT ALS REINE FUNKTION (IDA-256): aus den Fahrzeugzeilen der drei Apps und dem Bestand
 * Vorschläge bauen. Schreibt nichts und liest nichts — die Quellen holt `quellen.ts`, das Anwenden macht
 * `anwenden.ts`. Getestet in `plan.test.ts`.
 *
 * ZUSAMMEN GEHÖRT, WAS EINEN SCHLÜSSEL TEILT: den Funkkenner (aus der Kennung des Einsatzbuchs, aus einem
 * Lagerbuch-Namen wie „RTW 11/83-1“, aus einem Funkgeräte-Ort wie „11-83-1 RTW“), das Kennzeichen oder den
 * Namen (Lagerbuch „RTW 1“ = Funkgeräte-Ort „RTW 1“).
 * Die Gruppen bildet eine Vereinigung über diese Schlüssel; zwei Zeilen ohne gemeinsamen Schlüssel werden
 * nie geraten zusammengelegt. Was keinen Partner und nicht genug Angaben für ein neues Fahrzeug hat, steht
 * als „offen“ da und bekommt in der Vorschau eine Auswahl.
 */
import type { Fahrzeugquelle } from "../bereitstellung";
import type { Art } from "../eingabe";

export type Quelle = Fahrzeugquelle;

export const QUELL_NAMEN: Record<Quelle, string> = {
  einsatzbuch: "Einsatzbuch",
  lagerbuch: "Lagerbuch",
  funkgeraete: "Funkgeräte",
};

/** Eine Fahrzeugzeile einer App, auf die gemeinsamen Felder gebracht. Was die Quelle nicht kennt, ist `null`. */
export interface Kandidat {
  quelle: Quelle;
  quellId: string;
  /** Was die App selbst anzeigt („RTW 1“, „Rotkreuz Uelzen 11-83-1“, der Ort). */
  anzeige: string;
  typ: string | null;
  funkrufname: string | null;
  funkkenner: string | null;
  kennzeichen: string | null;
  standort: string | null;
  aktiv: boolean;
  /** Ein Zusatz für die Vorschau („4 Geräte“, „im Lagerbuch nicht als Fahrzeug zugeordnet“). */
  hinweis: string | null;
}

/** Ein Stammfahrzeug, soweit der Plan es braucht. */
export interface Bestandsfahrzeug {
  id: string;
  funkrufname: string;
  funkkenner: string | null;
  kennzeichen: string | null;
}

/** Die Felder eines neuen Stammfahrzeugs, wie sie `fahrzeugEingabe` annimmt. */
export interface NeuesFahrzeug {
  art: Art;
  typ: string;
  funkrufname: string;
  funkkenner: string;
  kennzeichen: string;
  standort: string;
  bemerkung: string;
  aktiv: boolean;
}

export type Ziel =
  | { art: "bestand"; stammId: string; anzeige: string }
  | { art: "neu"; fahrzeug: NeuesFahrzeug }
  | { art: "offen"; grund: string };

export interface Vorschlag {
  /** Stabil über zwei Planläufe mit denselben Quellen: die sortierten Kandidatenschlüssel. */
  schluessel: string;
  kandidaten: Kandidat[];
  ziel: Ziel;
}

export interface Erstimportplan {
  vorschlaege: Vorschlag[];
  /** Zeilen, die schon zugeordnet (oder als „kein Fahrzeug“ entschieden) sind, je Quelle. */
  schonZugeordnet: Record<Quelle, number>;
}

export const kandidatSchluessel = (k: Pick<Kandidat, "quelle" | "quellId">): string => `${k.quelle}:${k.quellId}`;

/**
 * Der Funkkenner aus einem beliebigen Text: drei Zahlengruppen, getrennt durch Bindestrich, Schrägstrich
 * oder Leerzeichen („11-83-1“, „11/83-1“, „11 83 1“). Führende Nullen fallen weg. `null`, wenn keiner drinsteht.
 */
export function kennerAus(text: string | null | undefined): string | null {
  const m = text?.match(/(?:^|\D)(\d{1,2})\s*[-/ ]\s*(\d{1,2})\s*[-/ ]\s*(\d{1,3})(?!\d)/);
  return m ? [m[1], m[2], m[3]].map((z) => String(Number(z))).join("-") : null;
}

/** Vergleichsform eines Kennzeichens: nur Buchstaben und Ziffern, groß. */
export function kennzeichenSchluessel(text: string | null | undefined): string | null {
  const s = text?.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, "") ?? "";
  return s.length >= 3 ? s : null;
}

/** Vergleichsform eines Namens („RTW 1“ = „rtw-1“): nur Buchstaben und Ziffern, klein. */
export function namensSchluessel(text: string | null | undefined): string | null {
  const s = text?.toLowerCase().replace(/[^a-z0-9äöüß]/g, "") ?? "";
  return s.length >= 3 ? s : null;
}

/**
 * Die Schlüssel, über die ein Kandidat mit anderen zusammenfällt. Der Name zählt nur, wo er das Fahrzeug
 * benennt: im Lagerbuch („RTW 1“), bei den Funkgeräten (der Ort) und im Bestand (der Funkrufname). Der
 * Anzeigetext des Einsatzbuchs ist „Typ Kenner“ und trägt nichts über den Kenner hinaus.
 */
function schluesselVon(k: { funkkenner: string | null; kennzeichen: string | null; name: string | null }): string[] {
  const s: string[] = [];
  const kenner = kennerAus(k.funkkenner);
  if (kenner) s.push(`k:${kenner}`);
  const zeichen = kennzeichenSchluessel(k.kennzeichen);
  if (zeichen) s.push(`z:${zeichen}`);
  const name = namensSchluessel(k.name);
  if (name) s.push(`n:${name}`);
  return s;
}
const kandidatNamen = (k: Kandidat) => ({ ...k, name: k.quelle === "einsatzbuch" ? null : k.anzeige });
const bestandNamen = (b: Bestandsfahrzeug) => ({ ...b, name: b.funkrufname });

/** Vorrang der Quellen beim Befüllen eines neuen Fahrzeugs: das Einsatzbuch hat die vollständigsten Stammdaten. */
const VORRANG: Record<Quelle, number> = { einsatzbuch: 0, lagerbuch: 1, funkgeraete: 2 };

function erstes<T>(kandidaten: Kandidat[], feld: (k: Kandidat) => T | null): T | null {
  for (const k of kandidaten) {
    const w = feld(k);
    if (w !== null && w !== "") return w;
  }
  return null;
}

export function planeErstimport(
  kandidaten: Kandidat[],
  bestand: Bestandsfahrzeug[],
  zugeordnet: ReadonlySet<string>,
): Erstimportplan {
  const schonZugeordnet: Record<Quelle, number> = { einsatzbuch: 0, lagerbuch: 0, funkgeraete: 0 };
  const offen = kandidaten.filter((k) => {
    if (!zugeordnet.has(kandidatSchluessel(k))) return true;
    schonZugeordnet[k.quelle] += 1;
    return false;
  });

  // Vereinigung über die Schlüssel: jeder Schlüssel zeigt auf den ersten Kandidaten, der ihn trug.
  const eltern = offen.map((_, i) => i);
  const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
  const erster = new Map<string, number>();
  offen.forEach((k, i) => {
    for (const s of schluesselVon(kandidatNamen(k))) {
      const j = erster.get(s);
      if (j === undefined) erster.set(s, i);
      else eltern[wurzel(i)] = wurzel(j);
    }
  });
  const gruppen = new Map<number, Kandidat[]>();
  offen.forEach((k, i) => gruppen.set(wurzel(i), [...(gruppen.get(wurzel(i)) ?? []), k]));

  const bestandNachSchluessel = new Map<string, Bestandsfahrzeug>();
  for (const b of bestand) for (const s of schluesselVon(bestandNamen(b))) bestandNachSchluessel.set(s, b);

  const vorschlaege = [...gruppen.values()].map((gruppe): Vorschlag => {
    const sortiert = [...gruppe].sort((a, b) => VORRANG[a.quelle] - VORRANG[b.quelle] || a.anzeige.localeCompare(b.anzeige, "de"));
    const schluessel = sortiert.map(kandidatSchluessel).sort().join("|");
    return { schluessel, kandidaten: sortiert, ziel: zielFuer(sortiert, bestandNachSchluessel) };
  });

  const RANG: Record<Ziel["art"], number> = { bestand: 0, neu: 1, offen: 2 };
  vorschlaege.sort((a, b) => RANG[a.ziel.art] - RANG[b.ziel.art] || a.kandidaten[0].anzeige.localeCompare(b.kandidaten[0].anzeige, "de", { numeric: true }));
  return { vorschlaege, schonZugeordnet };
}

function zielFuer(gruppe: Kandidat[], bestandNachSchluessel: Map<string, Bestandsfahrzeug>): Ziel {
  const treffer = new Map<string, Bestandsfahrzeug>();
  for (const k of gruppe) for (const s of schluesselVon(kandidatNamen(k))) {
    const b = bestandNachSchluessel.get(s);
    if (b) treffer.set(b.id, b);
  }
  if (treffer.size === 1) {
    const [b] = treffer.values();
    return { art: "bestand", stammId: b.id, anzeige: b.funkrufname };
  }
  if (treffer.size > 1) return { art: "offen", grund: "passt zu mehreren Fahrzeugen im Bestand" };

  if (gruppe.every((k) => k.quelle === "funkgeraete")) {
    return { art: "offen", grund: "nur ein Ort bei den Funkgeräten — ist das ein Fahrzeug?" };
  }
  const typ = erstes(gruppe, (k) => k.typ);
  const funkrufname = erstes(gruppe, (k) => k.funkrufname);
  const standort = erstes(gruppe, (k) => k.standort);
  if (!typ || !funkrufname || !standort) {
    const fehlt = [!typ && "Typ", !funkrufname && "Funkrufname", !standort && "Standort"].filter(Boolean).join(", ");
    return { art: "offen", grund: `für ein neues Fahrzeug fehlt: ${fehlt}` };
  }
  return {
    art: "neu",
    fahrzeug: {
      art: "fahrzeug",
      typ: typ.slice(0, 20),
      funkrufname: funkrufname.slice(0, 80),
      funkkenner: erstes(gruppe, (k) => kennerAus(k.funkkenner)) ?? "",
      kennzeichen: erstes(gruppe, (k) => k.kennzeichen) ?? "",
      standort: standort.slice(0, 60),
      bemerkung: "",
      aktiv: gruppe.some((k) => k.aktiv),
    },
  };
}
