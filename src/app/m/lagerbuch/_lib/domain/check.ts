/**
 * Fahrzeug-Check: Fehlmengen und die EINE Summenrechnung.
 * Kein "use client", kein Datenbankzugriff.
 */
import { parseCheckErgebnis } from "../checkErgebnis";
import { o2Status } from "./o2";
import { ZUSTAND_DEFEKT } from "../konstanten";

/**
 * Fehlmengen einer Ist-Erfassung gegen Soll: `fehlt = max(0, soll − ist)`, nur
 * Eintraege mit `fehlt > 0`.
 *
 * GENERISCH ueber `T extends { soll, ist }`, damit Aufrufer ihre
 * Positions-Identitaet (`sollPositionId`, `artikelId`) durchreichen koennen —
 * 1:1 aus `lagerbuch/src/lib/domain/check.ts:3-5`.
 */
export function fehlmengen<T extends { soll: number; ist: number }>(
  positionen: T[],
): (T & { fehlt: number })[] {
  return positionen
    .map((p) => ({ ...p, fehlt: Math.max(0, p.soll - p.ist) }))
    .filter((p) => p.fehlt > 0);
}

/**
 * DIE EINE `offen`-Formel: `max(0, soll − ist − nachgefuellt)`, JE ARTIKEL geklemmt.
 *
 * ⚠️ SIE STEHT HIER UND NUR HIER. Vorher rechnete sie zweimal woertlich — einmal
 * je Detailzeile (`_lib/lesepfade/checks.ts`) und einmal in der Summe (unten).
 * Genau diese Verdopplung ist der Bruch, gegen den §5.8.3 ueberhaupt existiert:
 * die Alt-Anwendung rechnete dieselbe Zahl an zwei Stellen UND lief beim
 * Nennfuelldruck bereits auseinander. Laeuft eine der Stellen weg, zeigt die
 * Detailseite Zeilen, deren `offen` sich nicht zur ausgewiesenen Summe addiert —
 * auf einem Fahrzeug-Check-Nachweis.
 *
 * `checks.test.ts` haelt beide Aufrufstellen mit
 * `sum(zeilen.offen) === summe.offen` gegeneinander.
 */
export function offenJeArtikel(a: {
  sollSumme?: number | null; istSumme?: number | null; nachfuellGebucht?: number | null;
}): number {
  return Math.max(0, (a.sollSumme ?? 0) - (a.istSumme ?? 0) - (a.nachfuellGebucht ?? 0));
}

export type CheckSummen = {
  positionen: number;
  nachgefuellt: number;
  /** BETRAG, nicht Summe mit Vorzeichen — sonst hoeben sich +3 und −3 auf. */
  korrigiert: number;
  /** Nach dem Check noch fehlend, JE ARTIKEL geklemmt. */
  offen: number;
  geraeteAuffaellig: number;
  flaschenAuffaellig: number;
  /** NEU (§5.12): Flaschen ohne bekannten Nennfuelldruck ODER ohne gemessenen
   *  Druck. Sie zaehlen NICHT als auffaellig — eine unbekannte Groesse auf einer
   *  der beiden Seiten erzeugt keine Zahl. */
  nichtBewertbar: number;
  /** Altformat (V1) ohne Positionsdetails. Die Detailseite SAGT es (§11.5, 26). */
  altFormat: boolean;
  /**
   * §11.5, Zustand 27: der Rohwert war nicht lesbar. **Alle Zaehler oben sind
   * dann 0 — aber nicht, weil nichts zu melden war.**
   *
   * ⚠️ NICHT DASSELBE WIE `altFormat` (Zustand 26). Ein Altcheck ist LESBAR und
   * traegt echte Zahlen; hier ist der Datensatz kaputt. Zwei Ursachen, zwei
   * Felder — wer sie zusammenlegt, verliert genau die Unterscheidung, die ueber
   * Datenrettung entscheidet.
   *
   * ⚠️ Es steht hier, weil es BEIDE Leser brauchen (§5.8.3): die Detailseite
   * fuer ihre Warnung und die Uebersicht fuer die Positionen-Spalte, die sonst
   * eine ruhige `0` zeigt. Solange nur die Detailseite las, lag es bewusst
   * NICHT hier (T176a1, Commit 748e63c) — ein Feld ohne Leser ist die naechste
   * Halbwahrheit. Mit dem zweiten Leser dreht dieselbe Begruendung um: eine
   * zweite Herleitung derselben Wahrheit waere schlimmer.
   */
  unlesbar: boolean;
};

/**
 * DIE EINE Summenrechnung fuer Uebersicht UND Detail (§5.8.3).
 *
 * ⚠️ WARUM SIE EXISTIERT. Die Alt-Anwendung rechnet dieselben Summen an ZWEI
 * Stellen getrennt (`queries.ts:374-380` gegen `:496-501`). Sie koennen
 * auseinanderlaufen, und beim Nennfuelldruck TUN sie es bereits: das Detail faellt
 * zwei Glieder weit zurueck, die Historie nur eins — und die Historie ist genau
 * die Ansicht, die `flaschenAuffaellig` je Check zaehlt. Ein Altcheck ueber
 * 300-bar-Flaschen meldet dort systematisch zu wenige auffaellige Flaschen.
 *
 * ⚠️ DIESE FUNKTION KENNT DEN FLASCHENSTAMM NICHT. Sie sieht nur das JSON; ein
 * fehlender Snapshot zaehlt hier IMMER als „nicht bewertbar". Das zweite Glied der
 * Kette (`f?.nennfuelldruckBar`) liegt in `_lib/lesepfade/checks.ts`, wo der Stamm
 * vorliegt — und es wird dort fuer BEIDE Leser gleich eingebaut. Die Zusage
 * „dieselben Summen" gilt fuer genau diese Funktion.
 *
 * ⚠️ `geraeteAuffaellig` ist beim ANZEIGEN TOLERANT (§5.8.2): ein unbekannter
 * Altwert in `zustand` zaehlt NICHT als auffaellig. Streng ist nur das SCHREIBEN
 * (`z.enum(ZUSTAENDE)` ab Teil 4).
 */
export function summiereCheckErgebnis(roh: string | null): CheckSummen {
  const e = parseCheckErgebnis(roh);

  if (e.version === 1) {
    return {
      positionen: e.eintraege.length,
      nachgefuellt: e.eintraege.reduce((s, x) => s + (x.gebucht ?? 0), 0),
      korrigiert: 0, // das Altformat kennt keine Korrektur
      offen: e.eintraege.reduce((s, x) => s + Math.max(0, (x.fehlt ?? 0) - (x.gebucht ?? 0)), 0),
      geraeteAuffaellig: 0,
      flaschenAuffaellig: 0,
      nichtBewertbar: 0,
      altFormat: true,
      // V1 ist LESBAR — es traegt nur keine Positionsdetails.
      unlesbar: false,
    };
  }

  let flaschenAuffaellig = 0;
  let nichtBewertbar = 0;
  for (const f of e.flaschen) {
    const nenn = f.nennfuelldruckBar;
    // `undefined` (Snapshot fehlt) UND `null` (ausdruecklich unbekannt) sind
    // beide „nicht bewertbar". `0` ist BEWERTBAR: eine Flasche mit Nennfuelldruck
    // 0 ist fehlkonfiguriert, nicht unbekannt — sie gehoert angesehen.
    if (nenn === undefined || nenn === null) {
      nichtBewertbar += 1;
      continue;
    }
    // ⚠️ EIN FEHLENDER DRUCK IST GENAUSO „NICHT BEWERTBAR" WIE EIN FEHLENDER
    // NENNDRUCK. Ein `?? 0` machte daraus still „0 bar → 0 % → rot → niedrig":
    // die Zeile behauptete auf einem Nachweis eine LEERE Flasche, die niemand
    // gemessen hat, und `flaschenAuffaellig` stiege. Historisches JSON ist beim
    // Cutover der Regelfall, nicht die Ausnahme — der Fall kommt mit den
    // Altdaten herein.
    const druck = f.druckBar ?? null;
    if (druck === null) {
      nichtBewertbar += 1;
      continue;
    }
    if (o2Status(druck, nenn).niedrig) flaschenAuffaellig += 1;
  }

  return {
    positionen: e.positionen.length,
    nachgefuellt: e.artikel.reduce((s, a) => s + (a.nachfuellGebucht ?? 0), 0),
    korrigiert: e.artikel.reduce((s, a) => s + Math.abs(a.korrektur ?? 0), 0),
    // JE ARTIKEL geklemmt, nicht erst in der Summe — sonst fraesse ein
    // ueberfuellter Artikel die Fehlmenge eines anderen auf. Die Formel steht in
    // `offenJeArtikel` und NUR dort; die Detailzeilen rufen dieselbe Funktion.
    offen: e.artikel.reduce((s, a) => s + offenJeArtikel(a), 0),
    geraeteAuffaellig: e.geraete.filter((g) => !g.vorhanden || g.zustand === ZUSTAND_DEFEKT).length,
    flaschenAuffaellig,
    nichtBewertbar,
    altFormat: false,
    // Der Grund kommt aus dem Parser und wird hier nur durchgereicht — die
    // Zaehlung selbst kann ihn nicht kennen.
    unlesbar: e.unlesbar === true,
  };
}
