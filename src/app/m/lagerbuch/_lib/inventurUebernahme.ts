/**
 * IDA-276 — DIE UEBERNAHME AUS „NICHT ZUGEORDNET" ALS REINE RECHNUNG. Kein
 * "use client": die Action rechnet damit, was sie bucht, und die Inventur-Insel
 * rechnet damit, was sie als Abweichung zeigt. Zwei Fassungen derselben Regel
 * liefen beim ersten Sonderfall auseinander, und dann stuende im Verlauf eine
 * andere Abweichung als vorher auf dem Schirm.
 *
 * DER ANLASS: der Handlager hatte lange keine Schraenke, aller Bestand steht
 * deshalb auf der Wurzel („Nicht zugeordnet"). Wer jetzt Schrank fuer Schrank
 * zaehlt, findet dort Ware, die buchhalterisch noch auf der Wurzel liegt. Ohne
 * Uebernahme entstand daraus ein ZWEITER Bestand im Schrank, waehrend der alte
 * auf der Wurzel stehen blieb — die Summe des Handlagers wuchs um genau das,
 * was jemand gerade nur einsortiert hatte.
 *
 * DIE REGEL je gezaehlter Charge an einem Schrank:
 *
 *   1. Was ueber die Erwartung DES SCHRANKS hinaus gezaehlt wurde, kommt zuerst
 *      von der Wurzel — als Umlagerung, hoechstens so viel, wie dort liegt.
 *   2. Ein Rest darueber hinaus ist echter Mehrbestand (Inventurdifferenz am
 *      Schrank, wie bisher).
 *   3. `ausbuchen`: was danach auf der Wurzel bleibt, geht als Inventurdifferenz
 *      ab — „Nicht zugeordnet" steht fuer diese Charge danach auf 0. Ohne den
 *      Schalter bleibt der Rest dort, etwa weil ein Teil in einem anderen
 *      Schrank liegt, der noch gezaehlt wird.
 *
 * `erwartet` ist die Zahl fuer die gespeicherte Position: Schrank plus das,
 * was aus der Wurzel hierher gehoert (umgelagert oder ausgebucht). Damit ist
 * `abweichung` genau die Veraenderung des Handlager-Bestands, die diese Zeile
 * bucht — eine reine Umlagerung weicht nicht ab.
 */
export type Uebernahme = {
  /** Von der Wurzel in den Schrank. */
  umlagern: number;
  /** Auf der Wurzel als Differenz ausgebucht. */
  ausbuchen: number;
  /** Erwartung fuer die gespeicherte Position. */
  erwartet: number;
  /** `ist - erwartet` — die Bestandsaenderung im Handlager. */
  abweichung: number;
};

export function uebernahme(
  hier: number, ungeordnet: number, ist: number, ausbuchen: boolean,
): Uebernahme {
  const wurzel = Math.max(ungeordnet, 0);
  const umlagern = Math.min(Math.max(ist - hier, 0), wurzel);
  const ausgebucht = ausbuchen ? wurzel - umlagern : 0;
  const erwartet = hier + umlagern + ausgebucht;
  return { umlagern, ausbuchen: ausgebucht, erwartet, abweichung: ist - erwartet };
}
