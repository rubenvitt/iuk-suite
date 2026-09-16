/**
 * WELCHE ORTE EIN ETIKETT BEKOMMEN — DRK-312. Kein "use client", kein
 * Icon-Import (Fallen 6 und 7).
 *
 * ⚠️ DIESE DATEI IST DIE EINE MENGENDEFINITION, UND SIE HAT ZWEI LESER, DIE
 * SICH SONST AUSEINANDERENTWICKELN: der Etikettenbogen
 * (`_db/etiketten.ts#ortEtikettenDaten`) druckt sie, und die Weiche
 * `o/[ortId]/page.tsx` loest gegen sie auf. Zwei getrennte Abfragen waeren die
 * Vorlage fuer den teuersten stillen Ausgang dieses Tickets: ein Etikett, das
 * gedruckt wird und dessen Ziel die Weiche nicht kennt — oder umgekehrt eine
 * Adresse, die antwortet, obwohl kein Etikett zu ihr gehoert.
 *
 * DIE MENGE: die feste Handlager-Zeile und jede AKTIVE Einheit
 * (`typ = "fahrzeug"`, also Fahrzeuge UND Taschen). Ausdruecklich NICHT die
 * Schraenke und NICHT ein zweites Lager; die Begruendung steht in
 * `_lib/ortZiel.ts` und am Etikettenbogen.
 */
import { and, eq, or } from "drizzle-orm";
import { lagerorte } from "../../_db/schema";
import { HANDLAGER_ID, type Einheitenart } from "../konstanten";
import type { Leser } from "./bestand";

/**
 * Genau die Felder, die Etikett und Weiche brauchen. `typ` traegt die
 * Zielentscheidung, `kennung` und `einheitenart` die Beizeile — ohne sie sind
 * zwei gleichnamige Taschen auf Papier nicht zu unterscheiden, und
 * `lagerorte.name` ist fuer Einheiten ausdruecklich NICHT eindeutig
 * (`idx_lagerorte_name_je_parent` steht unter `parent_id IS NOT NULL`).
 */
export type EtikettOrtZeile = {
  id: string;
  name: string;
  typ: "lager" | "fahrzeug";
  kennung: string | null;
  einheitenart: Einheitenart | null;
};

/**
 * ⚠️ DER HANDLAGER STEHT VORN, nicht alphabetisch irgendwo: er ist der Ort, an
 * dem gedruckt und geklebt wird, und ein Bogen, dessen erste Karte man suchen
 * muss, wird zweimal durchgeblaettert. Die Einheiten danach nach Namen, mit
 * `de` — `localeCompare` ohne Sprache sortiert „Ü" hinter „Z".
 */
export function etikettOrte(db: Leser): EtikettOrtZeile[] {
  return db.select().from(lagerorte)
    .where(and(
      eq(lagerorte.aktiv, true),
      or(eq(lagerorte.id, HANDLAGER_ID), eq(lagerorte.typ, "fahrzeug")),
    ))
    .all()
    .map((o) => ({
      id: o.id, name: o.name, typ: o.typ,
      kennung: o.kennung, einheitenart: o.einheitenart,
    }))
    .sort((a, b) => {
      if (a.id === HANDLAGER_ID) return -1;
      if (b.id === HANDLAGER_ID) return 1;
      return a.name.localeCompare(b.name, "de");
    });
}

/**
 * Ein einzelnes Etikettenziel, oder `null`.
 *
 * ⚠️ `null` HEISST „ZU DIESER ADRESSE GEHOERT HEUTE KEIN ETIKETT" UND IST KEIN
 * FEHLER. Drei reale Faelle fallen zusammen hier heraus: eine unbekannte Id,
 * ein stillgelegtes Fahrzeug (das laminierte Kaertchen haengt noch dran) und
 * ein Schrank, fuer den es nie eins gab. Die Weiche macht daraus `/helfer`
 * statt einer 404 — die Begruendung steht dort.
 *
 * ⚠️ UEBER `etikettOrte`, NICHT UEBER EINE ZWEITE `where`-KLAUSEL. Eine eigene
 * Abfrage hier waere genau die zweite Wahrheit, gegen die der Kopf dieser Datei
 * geschrieben ist — `lagerorte` ist winzig (dieselbe Begruendung wie in
 * `lesepfade/orte.ts`), die Ersparnis waere keine.
 */
export function etikettOrt(db: Leser, id: string): EtikettOrtZeile | null {
  return etikettOrte(db).find((o) => o.id === id) ?? null;
}
