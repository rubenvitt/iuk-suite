/**
 * Der Abgleich zwischen Quelle (HiOrg oder Demo) und Bestand: erst planen (schreibt nichts, Vorschau),
 * dann anwenden (EINE Transaktion). Die Quelle ist die Wahrheit — wer dort nicht mehr durch den
 * Filter kommt, wird hier GELÖSCHT, nicht deaktiviert (Speicherbegrenzung, Art. 5 Abs. 1 lit. e
 * DSGVO). Versiegelte Einsätze behalten ihren eigenen Schnappschuss; im Einsatzbuch wird die Person
 * beim nächsten Abgleich dort deaktiviert.
 *
 * Wer am Filter scheitert, taucht im Plan nur als Zahl je Grund auf — kein Name.
 */
import { and, eq, lt, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { HelferDb } from "../_db/client";
import { helfer, importlauf } from "../_db/schema";
import { AUSSCHLUSSGRUENDE, ausschlussgrund, type Ausschlussgrund, type Importfilter } from "./filter";
import type { Qualifikation, QuellPerson } from "./hiorg/person";
import type { Quelle } from "./einstellungen";

export type Abgleichklasse = "neu" | "geaendert" | "unveraendert" | "entfaellt";

export interface Abgleichzeile {
  quellId: string;
  vorname: string;
  nachname: string;
  status: string;
  gruppen: string[];
  qualifikationen: Qualifikation[];
  klasse: Abgleichklasse;
  /** Die eigene Kennung, wenn die Person schon im Bestand ist. */
  id: string | null;
}

export interface Abgleichplan {
  quelle: Quelle;
  gelesen: number;
  unlesbar: number;
  ausgefiltert: Record<Ausschlussgrund, number>;
  /** Gruppennamen aller gelesenen Personen mit Anzahl — Hilfe beim Einstellen des Filters, ohne Namen. */
  gruppen: { name: string; anzahl: number }[];
  zeilen: Abgleichzeile[];
}

/** Stabile Reihenfolge, damit eine bloß umsortierte Antwort nicht als Änderung zählt. */
function kanonisch(p: Pick<QuellPerson, "gruppen" | "qualifikationen">): { gruppen: string[]; qualifikationen: Qualifikation[] } {
  const de = (a: string, b: string) => a.localeCompare(b, "de");
  return {
    gruppen: [...p.gruppen].sort(de),
    qualifikationen: [...p.qualifikationen].sort((a, b) => de(a.liste, b.liste) || de(a.name, b.name) || de(a.kurz, b.kurz)),
  };
}

type Bestandszeile = typeof helfer.$inferSelect;

export function planeAbgleich(
  gelesen: { personen: QuellPerson[]; unlesbar: number },
  bestand: Bestandszeile[],
  filter: Importfilter,
  heute: string,
  quelle: Quelle,
): Abgleichplan {
  const ausgefiltert = Object.fromEntries(AUSSCHLUSSGRUENDE.map((g) => [g, 0])) as Record<Ausschlussgrund, number>;
  const gruppen = new Map<string, number>();
  const nachQuelle = new Map(bestand.filter((b) => b.herkunft === quelle).map((b) => [b.quellId, b]));
  const gesehen = new Set<string>();
  const zeilen: Abgleichzeile[] = [];

  for (const p of gelesen.personen) {
    if (gesehen.has(p.quellId)) continue;
    gesehen.add(p.quellId);
    for (const g of new Set(p.gruppen)) gruppen.set(g, (gruppen.get(g) ?? 0) + 1);
    const grund = ausschlussgrund(p, filter, heute);
    if (grund) {
      ausgefiltert[grund]++;
      continue;
    }
    const k = kanonisch(p);
    const alt = nachQuelle.get(p.quellId);
    const klasse: Abgleichklasse = !alt ? "neu"
      : alt.vorname !== p.vorname || alt.nachname !== p.nachname || alt.status !== p.status
        || alt.gruppen !== JSON.stringify(k.gruppen) || alt.qualifikationen !== JSON.stringify(k.qualifikationen)
        ? "geaendert" : "unveraendert";
    zeilen.push({ quellId: p.quellId, vorname: p.vorname, nachname: p.nachname, status: p.status, ...k, klasse, id: alt?.id ?? null });
  }
  const bleiben = new Set(zeilen.map((z) => z.quellId));
  for (const b of nachQuelle.values()) {
    if (bleiben.has(b.quellId)) continue;
    zeilen.push({
      quellId: b.quellId, vorname: b.vorname, nachname: b.nachname, status: b.status,
      gruppen: JSON.parse(b.gruppen) as string[], qualifikationen: JSON.parse(b.qualifikationen) as Qualifikation[],
      klasse: "entfaellt", id: b.id,
    });
  }
  const reihe: Record<Abgleichklasse, number> = { neu: 0, geaendert: 1, entfaellt: 2, unveraendert: 3 };
  zeilen.sort((a, b) => reihe[a.klasse] - reihe[b.klasse] || a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"));
  return {
    quelle,
    gelesen: gesehen.size,
    unlesbar: gelesen.unlesbar,
    ausgefiltert,
    gruppen: [...gruppen].map(([name, anzahl]) => ({ name, anzahl })).sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de")),
    zeilen,
  };
}

export interface Abgleichergebnis { neu: number; geaendert: number; entfernt: number; unveraendert: number }

/** Wie lange das Abgleichprotokoll Läufe behält. Es enthält keine Helfernamen, nur wer abgeglichen hat. */
export const PROTOKOLL_TAGE = 365;

export function wendeAbgleichAn(
  db: HelferDb,
  plan: Abgleichplan,
  optionen: { neueFreigeben: boolean; von: { name: string; sub: string }; jetzt?: Date },
): Abgleichergebnis {
  const jetzt = optionen.jetzt ?? new Date();
  const e: Abgleichergebnis = { neu: 0, geaendert: 0, entfernt: 0, unveraendert: 0 };
  db.transaction((tx) => {
    // Eine zweite Quelle darf nie liegen bleiben (Wechsel Demo ↔ HiOrg löscht sie schon; das hier ist der Riegel).
    e.entfernt += tx.delete(helfer).where(ne(helfer.herkunft, plan.quelle)).run().changes;
    for (const z of plan.zeilen) {
      const werte = {
        vorname: z.vorname, nachname: z.nachname, status: z.status,
        gruppen: JSON.stringify(z.gruppen), qualifikationen: JSON.stringify(z.qualifikationen),
      };
      if (z.klasse === "neu") {
        tx.insert(helfer).values({
          id: nanoid(), herkunft: plan.quelle, quellId: z.quellId, ...werte,
          fuerEinsatzbuch: optionen.neueFreigeben, importiertAm: jetzt, aktualisiertAm: jetzt,
        }).run();
        e.neu++;
      } else if (z.klasse === "geaendert") {
        tx.update(helfer).set({ ...werte, aktualisiertAm: jetzt }).where(and(eq(helfer.herkunft, plan.quelle), eq(helfer.quellId, z.quellId))).run();
        e.geaendert++;
      } else if (z.klasse === "entfaellt") {
        e.entfernt += tx.delete(helfer).where(and(eq(helfer.herkunft, plan.quelle), eq(helfer.quellId, z.quellId))).run().changes;
      } else {
        e.unveraendert++;
      }
    }
    tx.insert(importlauf).values({
      id: nanoid(), zeitpunkt: jetzt, quelle: plan.quelle, vonName: optionen.von.name.slice(0, 120), vonSub: optionen.von.sub,
      gelesen: plan.gelesen, neu: e.neu, geaendert: e.geaendert, entfernt: e.entfernt,
      ausgefiltert: JSON.stringify(plan.ausgefiltert),
    }).run();
    tx.delete(importlauf).where(lt(importlauf.zeitpunkt, new Date(jetzt.getTime() - PROTOKOLL_TAGE * 86_400_000))).run();
  });
  return e;
}
