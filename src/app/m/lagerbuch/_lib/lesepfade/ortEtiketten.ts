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
 * DIE MENGE: die feste Handlager-Zeile, die Entnahmebox und jede AKTIVE Einheit
 * (`typ = "fahrzeug"`, also Fahrzeuge UND Taschen). Ausdruecklich NICHT die
 * Schraenke und NICHT ein zweites Lager; die Begruendung steht in
 * `_lib/ortZiel.ts` und am Etikettenbogen.
 *
 * ⚠️ DIE ENTNAHMEBOX KAM MIT DRK-417 DAZU, und sie ist der Grund, warum die
 * Ausnahme fuer ein „zweites Lager" bestehen bleibt und trotzdem nicht gilt:
 * die Begruendung dort lautet, ein Etikett brauche ein ZIEL, das von ihm
 * handelt. Fuer die Box gibt es seit DRK-314 eines — `/helfer/box` —, fuer
 * einen beliebigen weiteren Lagerort weiterhin nicht.
 *
 * ⚠️ UND DIESE MENGE IST ZUGLEICH DIE MENGE DER REICHWEITEN. `reichweiteAus`
 * (`_lib/helferBereich.ts`) liest „alles, was weder Handlager noch Entnahmebox
 * ist, ist eine Einheit" — das stimmt genau so lange, wie hier nichts anderes
 * hineinkommt. `helferBereich.test.ts` haelt beide Seiten zusammen.
 */
import { and, eq, or } from "drizzle-orm";
import { lagerorte } from "../../_db/schema";
import { ENTNAHMEBOX_ID, HANDLAGER_ID, type Einheitenart } from "../konstanten";
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
 * ⚠️ DIE BEIDEN FESTEN ORTE STEHEN VORN, nicht alphabetisch irgendwo: dort wird
 * gedruckt und geklebt, und ein Bogen, dessen erste Karte man suchen muss, wird
 * zweimal durchgeblaettert. Die Einheiten danach nach Namen, mit `de` —
 * `localeCompare` ohne Sprache sortiert „Ü" hinter „Z".
 */
export function etikettOrte(db: Leser): EtikettOrtZeile[] {
  return db.select().from(lagerorte)
    .where(and(
      eq(lagerorte.aktiv, true),
      or(
        eq(lagerorte.id, HANDLAGER_ID),
        eq(lagerorte.id, ENTNAHMEBOX_ID),
        eq(lagerorte.typ, "fahrzeug"),
      ),
    ))
    .all()
    .map((o) => ({
      id: o.id, name: o.name, typ: o.typ,
      kennung: o.kennung, einheitenart: o.einheitenart,
    }))
    .sort((a, b) => {
      /*
       * ⚠️ HANDLAGER, DANN ENTNAHMEBOX, DANN DIE EINHEITEN — und die zweite
       * Stelle ist dieselbe Ueberlegung wie die erste: die beiden festen Orte
       * stehen im Haus, die Einheiten fahren weg. Wer den Bogen in die Hand
       * nimmt, um eine Karte nachzukleben, sucht fast immer eine der beiden.
       *
       * ⚠️ DER VERGLEICH IST EIN RANG UND KEINE KETTE AUS `if`s. Mit zwei
       * Sonderfaellen wird die alte Form („a vorne, sonst b vorne") unvollstaendig:
       * sie beantwortet Handlager-gegen-Box richtig und Box-gegen-Handlager
       * nicht mehr, und `Array.prototype.sort` ist mit einem inkonsistenten
       * Vergleicher nicht bloss ungenau, sondern beliebig.
       */
      const rang = (id: string) => (id === HANDLAGER_ID ? 0 : id === ENTNAHMEBOX_ID ? 1 : 2);
      const d = rang(a.id) - rang(b.id);
      return d !== 0 ? d : a.name.localeCompare(b.name, "de");
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
