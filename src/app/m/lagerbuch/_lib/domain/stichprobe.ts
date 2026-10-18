/**
 * Die Stichprobe des Kurzchecks (IDA-222). Kein "use client", kein
 * Datenbankzugriff: die Seite sammelt die Kandidaten, diese Funktion waehlt.
 *
 * WAS SIE LEISTET: aus der Soll-Bestueckung einer Einheit eine kleine Menge
 * ziehen, die (a) nichts liegen laesst, (b) dort hinschaut, wo sich etwas
 * geaendert haben kann, und (c) nicht vorhersagbar ist.
 *
 *   (a) GARANTIE — was laenger als `garantieTage` nicht gezaehlt wurde (oder
 *       noch nie), kommt zuerst, die aeltesten vorn. Reicht der Umfang nicht
 *       fuer alle, ruecken die uebrigen beim naechsten Mal nach vorn.
 *   (b) GEWICHT — der Rest wird gewichtet gezogen: je laenger ungezaehlt, desto
 *       schwerer; seit der letzten Zaehlung entnommen ×3; Verfall bald ×2.
 *   (c) ZUFALL — das Ziehen laeuft ueber einen Seed. Gleicher Seed, gleiche
 *       Lage → gleiche Auswahl: ein Neuladen wuerfelt nicht neu, man kann sich
 *       also keine leichte Stichprobe „erladen".
 *
 * Davor steht der PFLICHTKERN (IDA-223): was die Verwaltung „immer zaehlen"
 * markiert hat, kommt jedes Mal dazu und zaehlt NICHT in den Umfang. Sonst
 * fraesse ein grosser Pflichtkern die Stichprobe auf, und der Rest der
 * Bestueckung kaeme nie mehr dran.
 *
 * ⚠️ DIE EINHEIT DES ZIEHENS IST DER ARTIKEL, NICHT DIE POSITION. Der Abschluss
 * gleicht den Fahrzeugbestand JE ARTIKEL ab (`_actions/check.ts`): die Summe
 * der gezaehlten Positionen wird der neue Bestand. Steht derselbe Artikel in
 * zwei Faechern und nur eines wird gezaehlt, buchte der Abschluss das andere
 * still auf null. Deshalb zieht diese Funktion Artikel und liefert immer ALLE
 * ihre Positionen; der Server prueft dieselbe Bedingung noch einmal.
 */

/** Eine Soll-Position, wie die Stichprobe sie sieht. */
export type StichprobenKandidat = {
  id: string;
  artikelId: string;
  /** Tage seit der letzten echten Zaehlung; `null` = noch nie gezaehlt. */
  tageSeitZaehlung: number | null;
  /** Seit der letzten Zaehlung wurde aus der Einheit entnommen. */
  verbraucht: boolean;
  /** Der gemeldete Verfall ist nicht mehr gruen. */
  verfallBald: boolean;
  /** IDA-223: in jedem Kurzcheck dran, ausserhalb des Umfangs. */
  immerZaehlen?: boolean;
};

/** Warum eine Position heute dran ist — die Helferin liest das als Satz. */
export type StichprobenGrund =
  "pflicht" | "nie" | "ueberfaellig" | "verbraucht" | "verfall" | "zufall";

export type StichprobenTreffer = { id: string; grund: StichprobenGrund; tage: number | null };

/** Vorschlag aus dem Prototyp; die Betreiberfrage dazu steht in IDA-222. */
export const STICHPROBE_UMFANG = 18;
export const STICHPROBE_GARANTIE_TAGE = 28;

type Gruppe = {
  artikelId: string;
  ids: string[];
  tage: number | null;
  verbraucht: boolean;
  verfallBald: boolean;
  immerZaehlen: boolean;
};

/** Deterministischer Zufall: FNV-1a als Seed, mulberry32 als Generator. */
export function zufallAus(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gruppiere(kandidaten: StichprobenKandidat[]): Gruppe[] {
  const map = new Map<string, Gruppe>();
  for (const k of kandidaten) {
    const g = map.get(k.artikelId);
    if (!g) {
      map.set(k.artikelId, {
        artikelId: k.artikelId, ids: [k.id], tage: k.tageSeitZaehlung,
        verbraucht: k.verbraucht, verfallBald: k.verfallBald,
        immerZaehlen: k.immerZaehlen ?? false,
      });
      continue;
    }
    g.ids.push(k.id);
    // Der Artikel ist so alt wie seine aelteste Position; „nie" schlaegt jede Zahl.
    g.tage = g.tage === null || k.tageSeitZaehlung === null
      ? null
      : Math.max(g.tage, k.tageSeitZaehlung);
    g.verbraucht ||= k.verbraucht;
    g.verfallBald ||= k.verfallBald;
    // Eine markierte Position zieht den ganzen Artikel (Kopf, ⚠️).
    g.immerZaehlen ||= k.immerZaehlen ?? false;
  }
  return [...map.values()];
}

function grundFuer(g: Gruppe, garantieTage: number, ausGarantie: boolean): StichprobenGrund {
  if (g.immerZaehlen) return "pflicht";
  if (ausGarantie) return g.tage === null ? "nie" : "ueberfaellig";
  if (g.verbraucht) return "verbraucht";
  if (g.verfallBald) return "verfall";
  if (g.tage === null) return "nie";
  if (g.tage >= garantieTage) return "ueberfaellig";
  return "zufall";
}

const gewicht = (g: Gruppe, garantieTage: number) =>
  (1 + (g.tage ?? garantieTage) / 7) * (g.verbraucht ? 3 : 1) * (g.verfallBald ? 2 : 1);

/**
 * Waehlt die Stichprobe. Der Umfang zaehlt POSITIONEN; ein Artikel mit
 * mehreren Positionen darf ihn um seine uebrigen Positionen ueberschreiten,
 * weil er nur ganz gezogen werden kann (Kopf). Der Pflichtkern kommt obendrauf.
 */
export function waehleStichprobe(
  kandidaten: StichprobenKandidat[],
  opt: { seed: string; umfang?: number; garantieTage?: number },
): StichprobenTreffer[] {
  const umfang = opt.umfang ?? STICHPROBE_UMFANG;
  const garantieTage = opt.garantieTage ?? STICHPROBE_GARANTIE_TAGE;
  const zufall = zufallAus(opt.seed);

  // Vorab gemischt, damit Gleichstaende (z. B. „noch nie gezaehlt" beim ersten
  // Kurzcheck) nicht an der Reihenfolge der Bestueckung haengen.
  const gruppen = gruppiere(kandidaten)
    .map((g) => ({ g, r: zufall() }))
    .sort((x, y) => x.r - y.r)
    .map(({ g }) => g);

  // Pflichtkern zuerst — ohne `anzahl` zu erhoehen.
  const gewaehlt: { g: Gruppe; ausGarantie: boolean }[] = gruppen
    .filter((g) => g.immerZaehlen)
    .map((g) => ({ g, ausGarantie: false }));
  let anzahl = 0;
  const voll = () => anzahl >= umfang;

  const faellig = gruppen
    .filter((g) => !g.immerZaehlen && (g.tage === null || g.tage >= garantieTage))
    // stabil: „nie" vor jeder Zahl, sonst die aeltesten zuerst
    .sort((x, y) => (y.tage ?? Infinity) - (x.tage ?? Infinity));
  for (const g of faellig) {
    if (voll()) break;
    gewaehlt.push({ g, ausGarantie: true });
    anzahl += g.ids.length;
  }

  let rest = gruppen.filter((g) => !gewaehlt.some((w) => w.g === g));
  while (!voll() && rest.length > 0) {
    const summe = rest.reduce((s, g) => s + gewicht(g, garantieTage), 0);
    let wurf = zufall() * summe;
    let idx = rest.length - 1;
    for (let i = 0; i < rest.length; i++) {
      wurf -= gewicht(rest[i], garantieTage);
      if (wurf < 0) { idx = i; break; }
    }
    const g = rest[idx];
    gewaehlt.push({ g, ausGarantie: false });
    anzahl += g.ids.length;
    rest = rest.filter((_, i) => i !== idx);
  }

  return gewaehlt.flatMap(({ g, ausGarantie }) => {
    const grund = grundFuer(g, garantieTage, ausGarantie);
    return g.ids.map((id) => ({ id, grund, tage: g.tage }));
  });
}

/** Der Satz zur Begruendung, so wie er auf der Karte steht. */
export function grundText(t: { grund: StichprobenGrund; tage: number | null }): string {
  switch (t.grund) {
    case "pflicht": return "Wird jedes Mal gezählt";
    case "nie": return "Noch nie gezählt";
    case "ueberfaellig": return `Seit ${t.tage} Tagen nicht gezählt`;
    case "verbraucht": return "Seit der letzten Zählung entnommen";
    case "verfall": return "Verfall bald";
    case "zufall": return "Zufällig gezogen";
  }
}
