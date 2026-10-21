/**
 * IDA-258 — Name und Kennzeichen der Fahrzeuge aus der Fahrzeugverwaltung (Modul fahrzeuge):
 * planen (Vorschau, schreibt nichts), dann anwenden (EINE Transaktion). Die Quelle ist
 * `fahrzeuge/_lib/bereitstellung.ts` — die eine Datei, die das Modul fahrzeuge für andere Module
 * veröffentlicht; seine Datenbank liest das Lagerbuch nie. Bauform wie der Helferabgleich des
 * Einsatzbuchs (`einsatzbuch/_lib/stammdaten/helferAbgleich.ts`).
 *
 * WELCHE EINHEIT ZU WELCHEM STAMMFAHRZEUG GEHÖRT, steht in `lagerorte.stamm_id`. Leer ist sie bis zum
 * ersten Abgleich; dann kommt sie aus dem Erstimport der Fahrzeugverwaltung (`zuordnungenFuer`). Neue
 * Fahrzeuge legt „Neue Einheit“ gleich mit Verweis an.
 *
 * ⚠️ NUR NAME, KENNZEICHEN UND STATUS ZIEHEN UM. Soll, Bestand, Checks, Plomben und Schränke hängen an
 * der `id` der Einheit, und die ändert sich nie. Taschen bleiben ganz lokal.
 */
import { eq } from "drizzle-orm";
import { bereitgestellteFahrzeuge, type BereitgestelltesFahrzeug, type Fahrzeugbereitstellung } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import type { DB } from "../_db/client";
import { lagerorte } from "../_db/schema";
import { lagerbuchFahrzeuge } from "./fahrzeugbestand";

/** Der Name einer Einheit aus ihrem Stammfahrzeug: kurz fürs Handy, eindeutig über den Funkkenner. */
export function einheitName(s: Pick<BereitgestelltesFahrzeug, "typ" | "funkkenner" | "funkrufname">): string {
  return s.funkkenner ? `${s.typ} ${s.funkkenner}` : s.funkrufname;
}

export type StammKlasse = "verknuepfen" | "geaendert" | "unveraendert" | "deaktivieren" | "nicht_verknuepft" | "doppelt";

export interface StammVorschauzeile {
  /** Die ID der Einheit im Lagerbuch. */
  id: string;
  /** Der Name heute. */
  bisher: string;
  name: string;
  kennung: string | null;
  aktiv: boolean;
  stammId: string | null;
  klasse: StammKlasse;
  hinweis: string | null;
}

export interface StammPlan {
  stand: string | null;
  zeilen: StammVorschauzeile[];
  /** Aktive Stammfahrzeuge, die im Lagerbuch noch keine Einheit haben — anlegen über „Neue Einheit“. */
  ohneEinheit: number;
}

export interface Einheitzeile {
  id: string;
  name: string;
  kennung: string | null;
  aktiv: boolean;
  stammId: string | null;
}

/**
 * @param zuordnung Lagerbuch-ID → Stammfahrzeug-ID (`null` = „kein Fahrzeug“), aus dem Erstimport.
 * @param einheiten Die Fahrzeuge des Lagerbuchs ohne Taschen (`lagerbuchFahrzeuge`).
 */
export function planeStammAbgleich(
  b: Fahrzeugbereitstellung,
  zuordnung: Record<string, string | null>,
  einheiten: Einheitzeile[],
): StammPlan {
  const stamm = new Map(b.fahrzeuge.map((s) => [s.id, s]));
  const vergeben = new Set<string>();
  const zeilen: StammVorschauzeile[] = [];
  // Wer seinen Verweis schon trägt, kommt zuerst — er gewinnt gegen einen zweiten aus dem Erstimport.
  const reihe = [...einheiten].sort((x, y) => Number(y.stammId !== null) - Number(x.stammId !== null) || x.id.localeCompare(y.id));
  for (const e of reihe) {
    const stammId = e.stammId ?? zuordnung[e.id] ?? null;
    const s = stammId ? stamm.get(stammId) : undefined;
    const basis = { id: e.id, bisher: e.name, name: e.name, kennung: e.kennung, aktiv: e.aktiv, stammId: e.stammId };
    if (!s) {
      if (e.aktiv) {
        zeilen.push({
          ...basis, klasse: "nicht_verknuepft",
          hinweis: zuordnung[e.id] === null
            ? "In der Fahrzeugverwaltung als „kein Fahrzeug“ vermerkt — als Tasche zuordnen oder stilllegen"
            : "Keinem Fahrzeug der Fahrzeugverwaltung zugeordnet — dort im Erstimport zuordnen",
        });
      }
      continue;
    }
    if (vergeben.has(s.id)) {
      zeilen.push({ ...basis, klasse: "doppelt", hinweis: `Eine andere Einheit gehört schon zu ${einheitName(s)} — eine davon stilllegen` });
      continue;
    }
    vergeben.add(s.id);
    const ziel = { name: einheitName(s), kennung: s.kennzeichen, aktiv: s.aktiv, stammId: s.id };
    const gleich = e.name === ziel.name && e.kennung === ziel.kennung && e.aktiv === ziel.aktiv;
    const klasse: StammKlasse = e.stammId === null ? "verknuepfen" : gleich ? "unveraendert" : e.aktiv && !ziel.aktiv ? "deaktivieren" : "geaendert";
    const hinweis = klasse === "deaktivieren" || (klasse === "verknuepfen" && e.aktiv && !ziel.aktiv)
      ? "In der Fahrzeugverwaltung außer Dienst"
      : !e.aktiv && ziel.aktiv ? "wird wieder aktiv" : null;
    zeilen.push({ ...basis, ...ziel, klasse, hinweis });
  }
  const ordnung: Record<StammKlasse, number> = { verknuepfen: 0, geaendert: 1, deaktivieren: 2, doppelt: 3, nicht_verknuepft: 4, unveraendert: 5 };
  zeilen.sort((x, y) => ordnung[x.klasse] - ordnung[y.klasse] || x.name.localeCompare(y.name, "de", { numeric: true }));
  const ohneEinheit = b.fahrzeuge.filter((s) => s.aktiv && !vergeben.has(s.id)).length;
  return { stand: b.stand, zeilen, ohneEinheit };
}

export interface StammErgebnis { verknuepft: number; geaendert: number; deaktiviert: number }

export function wendeStammAbgleichAn(db: DB, plan: StammPlan): StammErgebnis {
  const e: StammErgebnis = { verknuepft: 0, geaendert: 0, deaktiviert: 0 };
  db.transaction((tx) => {
    for (const z of plan.zeilen) {
      if (z.klasse !== "verknuepfen" && z.klasse !== "geaendert" && z.klasse !== "deaktivieren") continue;
      tx.update(lagerorte)
        .set({ name: z.name, kennung: z.kennung, aktiv: z.aktiv, stammId: z.stammId, einheitenart: "fahrzeug" })
        .where(eq(lagerorte.id, z.id))
        .run();
      e[z.klasse === "verknuepfen" ? "verknuepft" : z.klasse === "geaendert" ? "geaendert" : "deaktiviert"]++;
    }
  });
  return e;
}

/** Plan gegen den aktuellen Bestand — Vorschau und Übernahme planen beide frisch. */
export function planeStammGegenBestand(db: DB, b: Fahrzeugbereitstellung, zuordnung: Record<string, string | null>): StammPlan {
  const verweise = new Map(db.select({ id: lagerorte.id, stammId: lagerorte.stammId }).from(lagerorte).all().map((z) => [z.id, z.stammId]));
  return planeStammAbgleich(b, zuordnung, lagerbuchFahrzeuge(db).map((f) => ({ ...f, stammId: verweise.get(f.id) ?? null })));
}

/** Ein Stammfahrzeug für „Neue Einheit“ — `undefined`, wenn es fehlt. */
export function stammFahrzeug(id: string): BereitgestelltesFahrzeug | undefined {
  return bereitgestellteFahrzeuge().fahrzeuge.find((s) => s.id === id);
}

export interface StammAuswahl {
  id: string;
  name: string;
  kennzeichen: string | null;
}

/**
 * Die aktiven Stammfahrzeuge, die im Lagerbuch noch keine Einheit haben — die Auswahl in „Neue
 * Einheit“. Ist die Fahrzeugverwaltung nicht lesbar, ist die Liste leer und der Dialog fällt auf
 * freie Felder zurück: ein Ausfall dort legt das Lagerbuch nicht lahm.
 */
export function stammAuswahl(db: DB): StammAuswahl[] {
  try {
    const vergeben = new Set(db.select({ stammId: lagerorte.stammId }).from(lagerorte).all().map((z) => z.stammId));
    return bereitgestellteFahrzeuge().fahrzeuge
      .filter((s) => s.aktiv && !vergeben.has(s.id))
      .map((s) => ({ id: s.id, name: einheitName(s), kennzeichen: s.kennzeichen }))
      .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
  } catch {
    return [];
  }
}
