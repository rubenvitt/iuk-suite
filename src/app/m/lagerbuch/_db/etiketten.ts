import { eq } from "drizzle-orm";
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
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

export async function etikettenDaten(db: DB): Promise<EtikettenDaten> {
  /**
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
  const roh = moduleUrl("lagerbuch");
  if (!roh) throw new EtikettenBasisFehlt();
  const basis = roh.replace(/\/$/, "");

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
