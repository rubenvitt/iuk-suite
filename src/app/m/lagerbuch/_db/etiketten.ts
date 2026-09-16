import { eq } from "drizzle-orm";
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { standortMeta } from "../_lib/konstanten";
import { etikettOrte } from "../_lib/lesepfade/ortEtiketten";
import type { DB } from "./client";
import { artikel, tokens } from "./schema";

/**
 * DIE DATEN DES ETIKETTENBOGENS (Spec §8.4).
 *
 * Sie liegt unter `_db/`, obwohl `_db/` keine Fachabfrage haelt — eine von zwei
 * benannten Ausnahmen (neben quelle.ts, §2.1). Der Grund ist bei beiden
 * derselbe: sie kennt KEINE Seite, sondern nur eine Zeilenform. Waechst hier
 * etwas heran, das eine Seite kennt, ist es am falschen Ort.
 */

/**
 * WARUM EINE EIGENE KLASSE UND KEIN `new Error(...)`: die Seite muss diesen
 * Zustand von einem Datenbankfehler unterscheiden koennen. Mit einem generischen
 * Error bliebe nur ein Textvergleich als Kontrollfluss — und der bricht beim
 * ersten Umformulieren, still. Alles ausser dieser Klasse faellt bewusst an
 * error.tsx durch (§11.5, Zustaende 23 und 38).
 */
export class EtikettenBasisFehlt extends Error {
  constructor() {
    super(
      "Fuer lagerbuch ist keine oeffentliche Domain konfiguriert (SUITE_HOST_LAGERBUCH).",
    );
    this.name = "EtikettenBasisFehlt";
  }
}

export type ArtikelEtikett = { id: string; name: string; fach: string; url: string; qr: string };
export type TokenEtikett = { code: string; label: string; url: string; qr: string };
export type EtikettenDaten = {
  /** Die tatsaechlich verwendete Basis. Die Seite schreibt sie ueber den Bogen
   *  (Klasse `lb-nichtDrucken`) — der EINZIGE Weg, eine Umsortierung von
   *  SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken (§8.1, 8-B). */
  basis: string;
  artikel: ArtikelEtikett[];
  tokens: TokenEtikett[];
};

/**
 * DIE EINE HERLEITUNG DER DRUCKBASIS — sie steht als Funktion da, weil seit
 * DRK-312 ZWEI Etikettenflaechen sie brauchen (der Bogen und die A7-Karten).
 * Zwei Abschriften waeren zwei Orte fuer dieselbe Aenderung, und die zweite
 * faellt erst auf, wenn jemand ein GEKLEBTES Etikett scannt.
 *
 * `moduleUrl` liest ueber `prodHostsFor()` und damit aus SUITE_HOST_LAGERBUCH —
 * dieselbe Wahrheit, die auch das Routing benutzt (8-B).
 *
 * NICHT `resolveHost(headers)`: der Wert kommt aus `x-forwarded-host`, ist
 * faelschbar und garantiert nicht den Modul-Host. Ein manipulierter Kopf
 * druckte einen ganzen Bogen auf eine fremde Domain — und der Fehler zeigte
 * sich erst, wenn jemand ein GEKLEBTES Etikett scannt.
 *
 * NICHT `APP_BASE_URL`: das waere eine sechste Wahrheit neben
 * SUITE_HOST_LAGERBUCH, mit der Gefahr, dass beide auseinanderlaufen. Die
 * Variable faellt beim Port ersatzlos (§10.2).
 */
function etikettenBasis(): string {
  const roh = moduleUrl("lagerbuch");
  if (!roh) throw new EtikettenBasisFehlt();
  return roh.replace(/\/$/, "");
}

export async function etikettenDaten(db: DB): Promise<EtikettenDaten> {
  // Warum die Basis so und nicht anders entsteht, steht an `etikettenBasis`.
  const basis = etikettenBasis();

  // 1:1 aus etiketten.ts:16-17: hart auf `aktiv`. Ein deaktivierter Artikel ist
  // unter /a/<id> weiterhin bebuchbar, aber nie wieder nachdruckbar (Falle 26) —
  // die Luecke ist bewusst uebernommen und steht als R32 im Runbook.
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const toks = db.select().from(tokens).where(eq(tokens.aktiv, true)).all();

  /**
   * EIN Promise.all, keine Schleife mit vergessenem `await`: `qrSvg` ist async
   * (core/qr/index.ts:37-40), und ein fehlendes `await` ergaebe hier keine
   * Fehlermeldung, sondern `[object Promise]` als Markup (8-I, Punkt 1).
   */
  const [artikelEtiketten, tokenEtiketten] = await Promise.all([
    Promise.all(
      arts.map(async (a) => {
        const url = `${basis}/a/${a.id}`;
        return { id: a.id, name: a.name, fach: a.fach, url, qr: await qrSvg(url) };
      }),
    ),
    Promise.all(
      toks.map(async (t) => {
        // Der Bindestrich ist Teil des gespeicherten Wertes (§4.7) und wandert
        // ungefiltert in die Pixel.
        const url = `${basis}/t/${t.code}`;
        return { code: t.code, label: t.label, url, qr: await qrSvg(url) };
      }),
    ),
  ]);

  return { basis, artikel: artikelEtiketten, tokens: tokenEtiketten };
}

/**
 * DIE DATEN DER A7-ORTSETIKETTEN — DRK-312.
 *
 * Ein Etikett je Handlager bzw. Einheit, nicht je Produkt. Es traegt einen
 * grossen QR auf `/o/<id>`; die Weiche dort schickt in den Kontext, der zu
 * diesem Ort gehoert (`_lib/ortZiel.ts`).
 */
export type OrtEtikett = {
  id: string;
  /** „Handlager", „RTW 1", „Sanitätstasche 1". */
  name: string;
  /** Die Beizeile: „Lager" · „Fahrzeug · HN-DRK-1101" · „Tasche". */
  meta: string;
  /** Die volle, abtippbare Adresse — sie steht im Fuss der Karte. */
  url: string;
  qr: string;
};

export type OrtEtikettenDaten = { basis: string; orte: OrtEtikett[] };

/**
 * ⚠️ DIE MENGE STEHT NICHT HIER, SONDERN IN `_lib/lesepfade/ortEtiketten.ts`,
 * und das ist die tragende Zeile dieser Funktion: die Weiche `o/[ortId]` loest
 * gegen DIESELBE Menge auf. Eine eigene `where`-Klausel an dieser Stelle waere
 * die Vorlage fuer den teuersten stillen Ausgang des Tickets — ein gedrucktes
 * Etikett, dessen Ziel die Weiche nicht kennt, oder umgekehrt. Warum die Menge
 * genau der Handlager plus die aktiven Einheiten ist (und ausdruecklich NICHT
 * `parent_id IS NULL`), steht dort und in `_lib/ortZiel.ts`.
 *
 * ⚠️ NUR AKTIVE, und hier faellt die Luecke des Regaletiketts (Falle 26, R32)
 * NICHT an: ein stillgelegtes Fahrzeug ist kein Buchungsziel mehr
 * (`istAktivesFahrzeug`), sein Etikett fuehrte also in eine Fahrzeugwahl ohne
 * dieses Fahrzeug. Nicht nachdruckbar ist hier das Richtige.
 */
export async function ortEtikettenDaten(db: DB): Promise<OrtEtikettenDaten> {
  const basis = etikettenBasis();
  const zeilen = etikettOrte(db);

  /**
   * EIN Promise.all, keine Schleife mit vergessenem `await` — dieselbe Falle
   * wie oben (8-I, Punkt 1): `qrSvg` ist async, und ein fehlendes `await`
   * ergaebe `[object Promise]` als Markup statt einer Fehlermeldung.
   */
  const orte = await Promise.all(zeilen.map(async (o) => {
    const url = `${basis}/o/${o.id}`;
    return {
      id: o.id,
      name: o.name,
      // `standortMeta` und nicht `einheitMeta`: fuer die Lagerzeile ist
      // `einheitenart` gegenstandslos, nicht „noch nicht zugeordnet" — sonst
      // laese sich der Handlager als Einheit, bei der jemand die Zuordnung
      // vergessen hat (DRK-309).
      meta: standortMeta(o),
      url,
      qr: await qrSvg(url),
    };
  }));

  return { basis, orte };
}
