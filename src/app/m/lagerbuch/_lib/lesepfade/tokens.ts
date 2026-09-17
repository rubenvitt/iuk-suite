import { desc } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { artikel, lagerorte, tokens } from "../../_db/schema";
import type { Einheitenart } from "../konstanten";

/**
 * Der Lesepfad entsteht in T126. T126 hat hier eine Erweiterung durch T160
 * angekuendigt; T160 hat die Datei geprueft und BEWUSST nicht geaendert:
 *
 * Die drei Zusicherungen aus §8.3 (Alphabet, Laenge, Kollision gegen ALLE
 * Zeilen) haengen samt und sonders am Schreibpfad `_actions/tokens.ts`. Die
 * einzige §8.3-nahe Eigenschaft DIESER Datei — `tokenListe` liest ohne
 * `aktiv`-Bedingung, ein gesperrter Code bleibt also sichtbar und belegt — ist
 * unten bereits gebaut und in `_actions/tokens.test.ts` geprueft („listet auch
 * inaktive Tokens …"). Entscheidung 8-F verschaerft das nicht, sie stuetzt sich
 * darauf. Eine Aenderung haette hier nichts zu tun gehabt.
 *
 * Zielnamen werden serverseitig aufgeloest. Auch gesperrte Tokens und spaeter
 * deaktivierte Ziele bleiben in der Liste lesbar.
 *
 * ⚠️ DRK-406 — SEIT DIESEM TICKET TRAEGT DIE ZEILE ZWEI VERSCHIEDENE DINGE, und
 * sie zu verwechseln ist der teuerste Fehlgriff dieser Datei: `ziel*` sagt, WO
 * JEMAND LANDET, `ort*` sagt, AN WELCHER KARTE DER CODE KLEBT. Fuer eine
 * Einheit fallen sie zusammen, fuer den Handlager nicht — dessen Code hat
 * `ortName: "Handlager"` und gar kein Ziel. Die Verwaltung zeigt beides
 * nebeneinander, weil die Frage „welchen Code hat das RTW?" und die Frage „wo
 * komme ich damit raus?" verschiedene sind.
 *
 * ⚠️ DER ORTSNAME IST DER VON HEUTE, `label` DER VON DAMALS. Das ist kein
 * Widerspruch, sondern die Arbeitsteilung: `label` ist der Anzeigename im
 * JOURNAL und soll den Namen tragen, unter dem eine Buchung entstanden ist;
 * diese Liste soll zeigen, an welcher Karte der Code heute haengt. Wer eine
 * Tasche umbenennt, sieht hier sofort den neuen Namen und im Journal weiter
 * den alten.
 */
export type TokenZeile = {
  id: string;
  code: string;
  label: string;
  aktiv: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  zielTyp: "fahrzeug" | "artikel" | null;
  zielId: string | null;
  zielName: string | null;
  /**
   * ⚠️ DIE ART DES ZIELS, UND SIE IST NICHT `zielTyp` (DRK-309, Reviewrunde 6).
   * `tokens.ziel_typ` kennt nur „fahrzeug" und „artikel" — ein Kaertchen an
   * einer Tasche traegt dort „fahrzeug" wie jedes andere. Ohne dieses Feld
   * zeigt die Liste der Codes fuer eine Tasche das Lastwagensymbol und findet
   * sie ueber „tasche" nicht; und zwei gleich benannte Ziele (Namen sind in
   * `lagerorte` nicht eindeutig) sind beim Sperren nicht zu unterscheiden.
   * `null` heisst hier zweierlei — Ziel ist kein Lagerort, oder die Art ist
   * noch nicht zugeordnet; die Anzeige behandelt beide gleich und nennt
   * nichts, wo sie nichts weiss.
   */
  zielKennung: string | null;
  zielEinheitenart: Einheitenart | null;
  /** DRK-406: der Ort, dem der Code gehoert. `null` = Altbestand. */
  ortId: string | null;
  /**
   * Der HEUTIGE Name dieses Ortes. `null` heisst „Altbestand"; eine `ortId`
   * ohne Namen kann es nicht geben, weil ein Fremdschluessel darauf steht.
   */
  ortName: string | null;
  ortTyp: "lager" | "fahrzeug" | null;
  ortKennung: string | null;
  ortEinheitenart: Einheitenart | null;
};

export function tokenListe(db: DB): TokenZeile[] {
  const zeilen = db.select().from(tokens)
    .orderBy(desc(tokens.createdAt), desc(tokens.id))
    .all();
  /**
   * ⚠️ ALLE ORTE, NICHT NUR DIE EINHEITEN (DRK-406). Bis hierher las die
   * Abfrage `where typ = "fahrzeug"`, weil ein Ziel nur eine Einheit sein
   * konnte. Ein ORTSCODE haengt aber auch am Handlager (`typ = "lager"`) —
   * mit der alten Bedingung bliebe dessen Zeile ohne Ortsnamen, und die
   * Verwaltung zeigte fuer den wichtigsten Code der Suite „—".
   *
   * Der Zielname liest weiter aus DERSELBEN Map und filtert dabei selbst auf
   * `zielTyp === "fahrzeug"`; ein Lagerort kann als ZIEL gar nicht vorkommen.
   */
  const orte = new Map(
    db.select({
      id: lagerorte.id, name: lagerorte.name, typ: lagerorte.typ,
      kennung: lagerorte.kennung, einheitenart: lagerorte.einheitenart,
    })
      .from(lagerorte)
      .all()
      .map((ort) => [ort.id, ort] as const),
  );
  const artikelNamen = new Map(
    db.select({ id: artikel.id, name: artikel.name })
      .from(artikel)
      .all()
      .map((zeile) => [zeile.id, zeile.name] as const),
  );

  return zeilen.map((zeile) => ({
    id: zeile.id,
    code: zeile.code,
    label: zeile.label,
    aktiv: zeile.aktiv,
    lastUsedAt: zeile.lastUsedAt,
    createdAt: zeile.createdAt,
    zielTyp: zeile.zielTyp,
    zielId: zeile.zielId,
    zielName: zeile.zielTyp === "fahrzeug"
      ? orte.get(zeile.zielId ?? "")?.name ?? null
      : zeile.zielTyp === "artikel"
        ? artikelNamen.get(zeile.zielId ?? "") ?? null
        : null,
    zielKennung: zeile.zielTyp === "fahrzeug"
      ? orte.get(zeile.zielId ?? "")?.kennung ?? null
      : null,
    zielEinheitenart: zeile.zielTyp === "fahrzeug"
      ? orte.get(zeile.zielId ?? "")?.einheitenart ?? null
      : null,
    ortId: zeile.ortId,
    ortName: zeile.ortId ? orte.get(zeile.ortId)?.name ?? null : null,
    ortTyp: zeile.ortId ? orte.get(zeile.ortId)?.typ ?? null : null,
    ortKennung: zeile.ortId ? orte.get(zeile.ortId)?.kennung ?? null : null,
    ortEinheitenart: zeile.ortId ? orte.get(zeile.ortId)?.einheitenart ?? null : null,
  }));
}
