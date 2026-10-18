/**
 * POSITIONSLISTEN NACH FACH — das Gemeinsame von Soll-Bestückung einer Einheit
 * (`fahrzeuge/[id]/SollEditor.tsx`) und Positionsliste einer Vorlage
 * (`vorlagen/[id]/TemplatePosEditor.tsx`), IDA-239.
 *
 * Kein "use client", kein Icon-Import (Fallen 6 und 7): reine Funktionen, die
 * beide Inseln und ihre Tests lesen. Die Bedienteile dazu stehen in
 * `_ui/Fachgruppen.tsx`.
 *
 * ⚠️ HIER STEHT NUR, WAS BEIDE WÖRTLICH GLEICH MEINEN. Grabsteine („entfernt")
 * kennt nur das Soll einer Einheit; die Gruppierung zählt sie deshalb nur, wenn
 * der Aufrufer sagt, woran man sie erkennt.
 */

export type ArtikelOption = {
  value: string;
  label: string;
  keywords: string;
};

/** Die Artikelwahl beim Hinzufügen: Name als Text, Handlager-Fach als Suchwort. */
export function artikelOptionen(
  artikel: readonly { id: string; name: string; fach: string }[],
): ArtikelOption[] {
  return artikel.map((eintrag) => ({
    value: eintrag.id,
    label: eintrag.name,
    keywords: eintrag.fach,
  }));
}

/** `showSearch` findet damit neben dem Namen auch das Handlager-Fach. */
export function fachFilter(eingabe: string, option?: ArtikelOption): boolean {
  return `${option?.label ?? ""} ${option?.keywords ?? ""}`
    .toLocaleLowerCase("de")
    .includes(eingabe.trim().toLocaleLowerCase("de"));
}

/** Was eine Position mindestens trägt, um nach Fach geordnet zu werden. */
export type PositionsKern = {
  id: string;
  fachLabel: string;
  sort: number;
  artikelName: string;
  handlagerFach: string;
};

export type FachGruppe<T> = {
  fach: string;
  positionen: T[];
  /** Positionen, die gelten — ohne Grabsteine. */
  aktiv: number;
  entfernt: number;
};

/**
 * Bis zu so vielen geltenden Positionen stehen alle Fächer beim Öffnen offen.
 * Darüber beginnt die Liste zugeklappt — zehn Fachköpfe mit ihren Zählern sind
 * dann die Übersicht, und eine große Liste rendert nicht 200 Zeilen auf
 * einmal (IDA-232, gemessen mit 210 Positionen in 10 Fächern).
 */
export const OFFEN_BIS_POSITIONEN = 40;

/**
 * Gruppiert nach Fach — Fächer alphabetisch, innerhalb nach `sort`, dann `id`.
 * Arbeitet auf einer Kopie; die Eingabe bleibt unberührt.
 *
 * ⚠️ DIE FACHÜBERSCHRIFT STEHT ÜBER IHRER GRUPPE, NICHT IN EINER ZUSAMMEN-
 * GEFASSTEN ZELLE (IDA-232). Eine erste Spalte mit dem Fach als `rowSpan` stand
 * bei 21 Zeilen rund 600px unter dem Gruppenanfang, und jede Sortierung auf
 * einer anderen Spalte machte die Spannweiten falsch. Mit einer Tabelle je Fach
 * gibt es keine Spannweite, die falsch werden kann.
 */
export function nachFachGruppieren<T extends PositionsKern>(
  positionen: readonly T[],
  istEntfernt: (position: T) => boolean = () => false,
): FachGruppe<T>[] {
  const sortiert = [...positionen].sort((a, b) =>
    a.fachLabel.localeCompare(b.fachLabel, "de")
    || a.sort - b.sort
    || a.id.localeCompare(b.id, "de"));
  const gruppen = new Map<string, FachGruppe<T>>();
  for (const position of sortiert) {
    const gruppe = gruppen.get(position.fachLabel)
      ?? { fach: position.fachLabel, positionen: [], aktiv: 0, entfernt: 0 };
    gruppe.positionen.push(position);
    if (istEntfernt(position)) gruppe.entfernt += 1;
    else gruppe.aktiv += 1;
    gruppen.set(position.fachLabel, gruppe);
  }
  return [...gruppen.values()];
}

/** Die Suche über Artikelname, Fach der Liste und Handlager-Fach. */
export function positionTrifft(position: PositionsKern, suche: string): boolean {
  const muster = suche.trim().toLocaleLowerCase("de");
  if (!muster) return true;
  return `${position.artikelName} ${position.fachLabel} ${position.handlagerFach}`
    .toLocaleLowerCase("de")
    .includes(muster);
}

/** „3 Positionen" · „1 Position · 2 entfernt" — der Zähler im Fachkopf. */
export function fachZaehltext(gruppe: Pick<FachGruppe<unknown>, "aktiv" | "entfernt">): string {
  const aktiv = `${gruppe.aktiv} ${gruppe.aktiv === 1 ? "Position" : "Positionen"}`;
  return gruppe.entfernt > 0 ? `${aktiv} · ${gruppe.entfernt} entfernt` : aktiv;
}
