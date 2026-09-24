/**
 * Server-seitiges Anwenden eines geprüften Importplans (Vorschau kommt aus `csv.ts`, das
 * ohne Node-API auch im Browser läuft). Nur „neu“ und „geändert“ schreiben; der Import
 * deaktiviert nichts (Spec §5.1, Entscheidung 7 im gemeinsamen Kontext).
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { fahrzeug, person, stichwort } from "../../_db/schema";
import { listeFahrzeuge, listePersonal, listeStichworte, type Db } from "./daten";
import type { Importbestand, Importplan, Vorschauzeile } from "./csv";

export function bestandFuerImport(db: Db): Importbestand {
  return { fahrzeuge: listeFahrzeuge(db), personal: listePersonal(db), stichworte: listeStichworte(db) };
}

/**
 * Schreibt einen geprüften Plan in EINER Transaktion. Je Art ein eigener Zweig statt einer
 * generischen Tabellenweiche: Drizzle kennt die Spalten von `fahrzeug`/`person`/`stichwort`
 * dann exakt, ganz ohne `as never`.
 */
export function wendeImportAn(db: Db, plan: Extract<Importplan, { ok: true }>) {
  const zaehler = { neu: 0, geaendert: 0, unveraendert: 0, fehler: 0 };
  db.transaction((tx) => {
    for (const z of plan.zeilen) {
      zaehler[z.klasse]++;
      if (z.klasse !== "neu" && z.klasse !== "geaendert") continue;
      const istNeu = z.klasse === "neu";
      if (plan.art === "fahrzeuge") {
        const werte = { typ: z.werte.typ, kennung: z.werte.kennung, ruf: z.werte.ruf, standort: z.werte.standort, aktiv: true };
        if (istNeu) tx.insert(fahrzeug).values({ id: nanoid(), ...werte }).run();
        else tx.update(fahrzeug).set(werte).where(eq(fahrzeug.id, idVon(z))).run();
      } else if (plan.art === "personal") {
        const werte = { name: z.werte.name, quali: z.werte.quali, ov: z.werte.ov, aktiv: true };
        if (istNeu) tx.insert(person).values({ id: nanoid(), ...werte }).run();
        else tx.update(person).set(werte).where(eq(person.id, idVon(z))).run();
      } else {
        const werte = { gruppe: z.werte.gruppe, name: z.werte.name, reihenfolge: Number(z.werte.reihenfolge), aktiv: true };
        if (istNeu) tx.insert(stichwort).values({ id: nanoid(), ...werte }).run();
        else tx.update(stichwort).set(werte).where(eq(stichwort.id, idVon(z))).run();
      }
    }
  });
  return zaehler;
}

/** `planeImport` liefert bei `klasse === "geaendert"` immer eine `id` — hier nur noch belegt. */
function idVon(z: Vorschauzeile): string {
  if (!z.id) throw new Error(`Vorschauzeile ${z.zeile} ist „geändert“ ohne id`);
  return z.id;
}
