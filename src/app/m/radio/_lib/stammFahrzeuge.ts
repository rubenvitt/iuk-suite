/**
 * IDA-259 — DIE FAHRZEUGE DER FAHRZEUGVERWALTUNG (Modul fahrzeuge) ALS ORTE DER FUNKGERÄTE. Die Quelle ist
 * `fahrzeuge/_lib/bereitstellung.ts` — die eine Datei, die das Modul fahrzeuge für andere Module
 * veröffentlicht; seine Datenbank liest das Funkgerätemodul nie. Bauform wie der Abgleich im Lagerbuch
 * (`lagerbuch/_lib/stammAbgleich.ts`).
 *
 * ⛔ DER ORT BLEIBT DAS FELD, NACH DEM ALLES GRUPPIERT. Update-Modus (`updateFahrzeuge`), Ausleihe und
 * Filter lesen weiter `devices.location`; ein Fahrzeug ist dort der Name aus der Fahrzeugverwaltung
 * (`kurzname`). Daneben steht `devices.fahrzeug_id`, der Verweis: der Server setzt ihn beim Speichern,
 * wenn der Ort genau der Name eines aktiven Fahrzeugs ist (`fahrzeugVerweis`), und der Abgleich zieht
 * den Ort nach, wenn sich der Name dort ändert. Orte, die kein Fahrzeug sind („Lager“), bleiben frei.
 */
import { bereitgestellteFahrzeuge, kurzname, type Fahrzeugbereitstellung } from "@/app/m/fahrzeuge/_lib/bereitstellung";

/**
 * Name → ID der aktiven Fahrzeuge. Ist die Fahrzeugverwaltung nicht lesbar, ist die Karte leer: ein
 * Ausfall dort legt das Speichern eines Funkgeräts nicht lahm, das Gerät verliert nur den Verweis, und
 * der nächste Abgleich findet ihn über den Namen wieder.
 */
export function stammOrte(lesen: () => Fahrzeugbereitstellung = bereitgestellteFahrzeuge): Map<string, string> {
  try {
    return new Map(lesen().fahrzeuge.filter((s) => s.aktiv).map((s) => [kurzname(s), s.id]));
  } catch {
    return new Map();
  }
}

/** Der Verweis zu einem Ort: die ID des Fahrzeugs, dessen Name er ist, sonst `null`. */
export function fahrzeugVerweis(orte: Map<string, string>, ort: string | null | undefined): string | null {
  const t = ort?.trim();
  return t ? (orte.get(t) ?? null) : null;
}

/** Die Ortsvorschläge im Formular: was in den Geräten steht und die Namen der aktiven Fahrzeuge. */
export function mitStammOrten(vorhanden: string[], orte: Map<string, string>): string[] {
  return [...new Set([...vorhanden, ...orte.keys()])].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
}

export type OrtKlasse = "verknuepfen" | "umbenennen" | "unveraendert" | "offen";

export interface OrtVorschauzeile {
  schluessel: string;
  /** Der Ort heute. */
  bisher: string;
  /** Der Ort danach. */
  name: string;
  geraete: number;
  klasse: OrtKlasse;
  hinweis: string | null;
}

export interface Ortaenderung {
  id: string;
  alt: string | null;
  location: string;
  fahrzeugId: string;
}

export interface OrtPlan {
  stand: string | null;
  zeilen: OrtVorschauzeile[];
  aenderungen: Ortaenderung[];
}

export interface Geraetzeile {
  id: string;
  location: string | null;
  fahrzeugId: string | null;
}

/**
 * @param zuordnung Ort → Stammfahrzeug-ID (`null` = „kein Fahrzeug“), aus dem Erstimport der
 *   Fahrzeugverwaltung (`zuordnungenFuer("funkgeraete")`); fehlt ein Ort, gilt der Name.
 */
export function planeOrtAbgleich(b: Fahrzeugbereitstellung, zuordnung: Record<string, string | null>, geraete: Geraetzeile[]): OrtPlan {
  const stamm = new Map(b.fahrzeuge.map((s) => [s.id, s]));
  const nachName = new Map(b.fahrzeuge.filter((s) => s.aktiv).map((s) => [kurzname(s), s]));
  const gruppen = new Map<string, OrtVorschauzeile & { ids: Geraetzeile[]; ziel: string | null }>();
  const aufnehmen = (g: Geraetzeile, z: Omit<OrtVorschauzeile, "schluessel" | "geraete">, ziel: string | null) => {
    const schluessel = `${z.klasse}\u0000${z.bisher}\u0000${ziel ?? ""}`;
    const gruppe = gruppen.get(schluessel) ?? { ...z, schluessel, geraete: 0, ids: [], ziel };
    gruppe.geraete++;
    gruppe.ids.push(g);
    gruppen.set(schluessel, gruppe);
  };

  for (const g of geraete) {
    const ort = g.location?.trim() ?? "";
    if (g.fahrzeugId) {
      const s = stamm.get(g.fahrzeugId);
      if (!s) {
        aufnehmen(g, { bisher: ort, name: ort, klasse: "offen", hinweis: "Das Fahrzeug fehlt in der Fahrzeugverwaltung" }, null);
        continue;
      }
      const name = kurzname(s);
      aufnehmen(g, { bisher: ort, name, klasse: name === ort ? "unveraendert" : "umbenennen", hinweis: s.aktiv ? null : "In der Fahrzeugverwaltung außer Dienst" }, s.id);
      continue;
    }
    if (!ort) continue;
    const entschieden = zuordnung[ort];
    if (entschieden === null) continue;
    const s = entschieden ? stamm.get(entschieden) : nachName.get(ort);
    // Ohne Entscheidung und ohne gleichnamiges Fahrzeug ist ein Ort meist keins („Lager“): er bleibt still.
    if (!s) {
      if (entschieden) aufnehmen(g, { bisher: ort, name: ort, klasse: "offen", hinweis: "Das Fahrzeug fehlt in der Fahrzeugverwaltung" }, null);
      continue;
    }
    aufnehmen(g, { bisher: ort, name: kurzname(s), klasse: "verknuepfen", hinweis: s.aktiv ? null : "In der Fahrzeugverwaltung außer Dienst" }, s.id);
  }

  const zeilen: OrtVorschauzeile[] = [];
  const aenderungen: Ortaenderung[] = [];
  for (const { ids, ziel, ...z } of gruppen.values()) {
    zeilen.push(z);
    if (ziel && (z.klasse === "verknuepfen" || z.klasse === "umbenennen")) {
      for (const g of ids) aenderungen.push({ id: g.id, alt: g.location, location: z.name, fahrzeugId: ziel });
    }
  }
  const ordnung: Record<OrtKlasse, number> = { verknuepfen: 0, umbenennen: 1, offen: 2, unveraendert: 3 };
  zeilen.sort((x, y) => ordnung[x.klasse] - ordnung[y.klasse] || x.name.localeCompare(y.name, "de", { numeric: true }));
  return { stand: b.stand, zeilen, aenderungen };
}
