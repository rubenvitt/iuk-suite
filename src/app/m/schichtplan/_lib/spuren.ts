/**
 * Wo Schichten in einer Zeile des Rasters liegen (IDA-385). Rein und ohne Datenbank, damit es ohne
 * Browser testbar ist. Überschneidungen bleiben erlaubt (IDA-373 meldet sie unter „Prüfen“) — aber
 * keine Schicht darf eine andere verdecken, und „Schicht anlegen“ legt nie blind über eine bestehende.
 */

export interface Zeitraum { von: number; bis: number }

/** Spur einer Schicht innerhalb ihrer Gruppe sich überschneidender Schichten: `spur` von `spuren`. */
export interface Lage { spur: number; spuren: number }

/**
 * Verteilt die Schichten einer Zeile auf übereinanderliegende Spuren: jede Schicht nimmt die oberste
 * Spur, die zu ihrem Beginn frei ist. Eine Gruppe sich (auch über Dritte) überschneidender Schichten
 * teilt sich die Höhe der Zeile; eine Schicht ohne Überschneidung behält die ganze Höhe.
 */
export function verteileSpuren<T extends Zeitraum & { id: string }>(schichten: readonly T[]): Map<string, Lage> {
  const sortiert = [...schichten].sort((a, b) => a.von - b.von || a.bis - b.bis || a.id.localeCompare(b.id));
  const lage = new Map<string, Lage>();
  let gruppe: { id: string; spur: number }[] = [];
  let spurEnde: number[] = [];
  let gruppeEnde = -Infinity;
  const schliessen = () => {
    for (const g of gruppe) lage.set(g.id, { spur: g.spur, spuren: spurEnde.length });
    gruppe = [];
    spurEnde = [];
  };
  for (const s of sortiert) {
    if (s.von >= gruppeEnde) schliessen();
    let spur = spurEnde.findIndex((ende) => ende <= s.von);
    if (spur === -1) spur = spurEnde.push(s.bis) - 1;
    else spurEnde[spur] = s.bis;
    gruppe.push({ id: s.id, spur });
    gruppeEnde = Math.max(gruppeEnde, s.bis);
  }
  schliessen();
  return lage;
}

/** Größte Zahl gleichzeitig nötiger Spuren in einer Zeile. */
export function spurenZahl(lage: ReadonlyMap<string, Lage>): number {
  let n = 1;
  for (const l of lage.values()) n = Math.max(n, l.spuren);
  return n;
}

/**
 * Wohin „Schicht anlegen“ eine neue Schicht legt: hinter die letzte, wenn dort Platz ist, sonst in die
 * erste freie Lücke der Zeile. Erst wird eine Lücke für die volle `laenge` gesucht, dann eine kürzere
 * ab `mindestens`. Ist die Zeile im ganzen Zeitraum belegt, `null`.
 */
export function freieLuecke(belegt: readonly Zeitraum[], rahmen: Zeitraum, laenge: number, mindestens: number): Zeitraum | null {
  const sortiert = [...belegt].sort((a, b) => a.von - b.von);
  const luecken: Zeitraum[] = [];
  let ab = rahmen.von;
  for (const b of sortiert) {
    if (b.von > ab) luecken.push({ von: ab, bis: Math.min(b.von, rahmen.bis) });
    ab = Math.max(ab, b.bis);
  }
  const hinten = ab < rahmen.bis ? { von: ab, bis: rahmen.bis } : null;
  const reihenfolge = [...(hinten ? [hinten] : []), ...luecken].filter((l) => l.bis > l.von);
  const passt = reihenfolge.find((l) => l.bis - l.von >= laenge) ?? reihenfolge.find((l) => l.bis - l.von >= mindestens);
  return passt ? { von: passt.von, bis: Math.min(passt.von + laenge, passt.bis) } : null;
}
