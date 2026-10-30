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
 * DIE MENGE: die feste Handlager-Zeile, jeder AKTIVE Schrank im Handlager, die
 * Entnahmebox und jede AKTIVE Einheit (`typ = "fahrzeug"`, also Fahrzeuge UND
 * Taschen). Ausdruecklich NICHT ein zweites Lager; die Begruendung steht in
 * `_lib/ortZiel.ts` und am Etikettenbogen.
 *
 * ⚠️ DIE SCHRAENKE KAMEN MIT IDA-295 DAZU (Betreiberentscheidung 30.10.2026:
 * „Helfer scannen keine Artikel-QR-Codes, nur Ortsetiketten"). Bis dahin galt
 * „ein Schrank hat kein eigenes Ziel" — seither hat er eins: `/helfer?ort=<id>`,
 * die Artikelliste mit dem Bestand DIESES Schranks (`helfer/page.tsx`), und die
 * Entnahme von dort bucht zuerst aus ihm. Ein zweites Lager bleibt draussen, aus
 * demselben Grund wie bisher: fuer seinen Bestand gibt es im Helfer-Ast keinen
 * Schirm.
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
import { handlagerSchraenke } from "./orte";

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
  /**
   * IDA-295 — ein Schrank im Handlager. `typ` allein sagt es nicht: der
   * Handlager, die Entnahmebox und jeder Schrank sind alle `typ: "lager"`, und
   * die Zielwahl (`ortZielPfad`) braucht genau diesen Unterschied.
   */
  schrank: boolean;
};

/**
 * ⚠️ DIE BEIDEN FESTEN ORTE STEHEN VORN, nicht alphabetisch irgendwo: dort wird
 * gedruckt und geklebt, und ein Bogen, dessen erste Karte man suchen muss, wird
 * zweimal durchgeblaettert. Die Einheiten danach nach Namen, mit `de` —
 * `localeCompare` ohne Sprache sortiert „Ü" hinter „Z".
 */
export function etikettOrte(db: Leser): EtikettOrtZeile[] {
  const feste = db.select().from(lagerorte)
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
      kennung: o.kennung, einheitenart: o.einheitenart, schrank: false,
      sortierung: o.sortierung,
    }));
  /*
   * ⚠️ DIE SCHRAENKE UEBER `handlagerSchraenke` UND NICHT UEBER
   * `parent_id = 'handlager'` HIER. Jene Funktion ist die Definition von „im
   * Handlager" (`teilbaum`), an der auch Abbuchung und Inventur haengen — eine
   * eigene Bedingung hier liesse Bogen und Buchung auseinanderlaufen, sobald
   * ein Schrank einmal tiefer haengt.
   */
  const schraenke = handlagerSchraenke(db, true).map((o) => ({
    id: o.id, name: o.name, typ: o.typ,
    kennung: o.kennung, einheitenart: o.einheitenart, schrank: true,
    sortierung: o.sortierung,
  }));
  return [...feste, ...schraenke]
    .sort((a, b) => {
      /*
       * ⚠️ HANDLAGER, DANN SEINE SCHRAENKE, DANN ENTNAHMEBOX, DANN DIE
       * EINHEITEN. Die festen Orte stehen im Haus, die Einheiten fahren weg; wer
       * den Bogen in die Hand nimmt, um eine Karte nachzukleben, sucht fast
       * immer eine aus dem Haus. Die Schraenke stehen direkt hinter dem
       * Handlager, weil sie dort auch kleben.
       *
       * ⚠️ DER VERGLEICH IST EIN RANG UND KEINE KETTE AUS `if`s. Mit mehreren
       * Sonderfaellen wird die Form „a vorne, sonst b vorne" unvollstaendig,
       * und `Array.prototype.sort` ist mit einem inkonsistenten Vergleicher
       * nicht bloss ungenau, sondern beliebig.
       *
       * Die Schraenke untereinander nach ihrer `sortierung` — derselben
       * Reihenfolge wie in der Verwaltung —, bei Gleichstand nach Namen.
       */
      const rang = (o: { id: string; schrank: boolean }) =>
        o.id === HANDLAGER_ID ? 0 : o.schrank ? 1 : o.id === ENTNAHMEBOX_ID ? 2 : 3;
      const d = rang(a) - rang(b);
      if (d !== 0) return d;
      if (a.schrank && a.sortierung !== b.sortierung) return a.sortierung - b.sortierung;
      return a.name.localeCompare(b.name, "de");
    })
    .map(({ sortierung: _s, ...o }) => o);
}

/**
 * Ein einzelnes Etikettenziel, oder `null`.
 *
 * ⚠️ `null` HEISST „ZU DIESER ADRESSE GEHOERT HEUTE KEIN ETIKETT" UND IST KEIN
 * FEHLER. Drei reale Faelle fallen zusammen hier heraus: eine unbekannte Id,
 * ein stillgelegtes Fahrzeug oder ein stillgelegter Schrank (das laminierte
 * Kaertchen haengt noch dran) und ein zweites Lager, fuer das es nie eins gab. Die Weiche macht daraus `/helfer`
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
