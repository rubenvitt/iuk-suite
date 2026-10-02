import type { KommplanDb } from "../../_db/client";
import { eigeneSpecs, eigeneTitel } from "../eigeneZeichenDb";
import type { PlanInhalt } from "../plan/schema";
import { eigeneId, eigenerSchluessel } from "./eigen/schluessel";
import { zeichneEigenes } from "./eigen/zeichne";
import type { Symbolquelle, ZeichenIndexEintrag } from "./grundlagen";
import { symboleFuerSchluessel, zeichenIndex, type SymbolOptionen } from "./zeichen";

/**
 * KATALOG UND EIGENE ZEICHEN ZUSAMMEN — nur Server. Jede Fläche, die Symbole an einen Betrachter, Editor oder Druck
 * gibt, nimmt diese Funktionen statt der reinen Katalogfassungen aus `zeichen.ts`: sonst stünde ein eigenes Zeichen im
 * Editor und fehlte im Freigabe-Link. Eigene Zeichen werden bei jedem Abruf aus ihrer Zusammenstellung gezeichnet
 * (`eigen/zeichne.ts`); die letzten Bilder bleiben im Prozess gemerkt, Schlüssel ist die Spec selbst.
 */
const GEMERKT = 128;
const bilder = new Map<string, Symbolquelle | null>();
function gezeichnet(id: string, specJson: string, spec: Parameters<typeof zeichneEigenes>[0], schwarzweiss: boolean): Symbolquelle | null {
  const k = `${id}|${schwarzweiss ? "sw" : "f"}|${specJson}`;
  if (bilder.has(k)) return bilder.get(k)!;
  const r = zeichneEigenes(spec, `kpe-${id}`, { schwarzweiss });
  const quelle = r.ok ? r.quelle : null;
  bilder.set(k, quelle);
  if (bilder.size > GEMERKT) bilder.delete(bilder.keys().next().value!);
  return quelle;
}

export function schluesselIn(inhalt: PlanInhalt): string[] {
  return inhalt.stellen.flatMap((s) => [s.zeichen, ...s.einheiten.map((e) => e.zeichen)]).filter((k): k is string => k !== null);
}

export function symboleMitEigenen(db: Pick<KommplanDb, "select">, schluessel: readonly string[], optionen: SymbolOptionen = {}): Record<string, Symbolquelle> {
  const ids = [...new Set(schluessel.map(eigeneId).filter((i): i is string => i !== null))];
  const eigene: [string, Symbolquelle][] = [];
  for (const [id, z] of eigeneSpecs(db, ids)) {
    if (!z.spec.ok) continue;
    const q = gezeichnet(id, JSON.stringify(z.spec.spec), z.spec.spec, optionen.schwarzweiss ?? false);
    if (q) eigene.push([eigenerSchluessel(id), q]);
  }
  return { ...symboleFuerSchluessel(schluessel, optionen), ...Object.fromEntries(eigene.sort(([a], [b]) => (a < b ? -1 : 1))) };
}

export function symboleFuerPlan(db: Pick<KommplanDb, "select">, inhalt: PlanInhalt, optionen: SymbolOptionen = {}): Record<string, Symbolquelle> {
  return symboleMitEigenen(db, schluesselIn(inhalt), optionen);
}

/** Der Such-Index: eigene Zeichen VOR dem Katalog (sie sind der Grund, warum es sie gibt), je nach Titel sortiert. */
export function zeichenIndexMitEigenen(db: Pick<KommplanDb, "select">): ZeichenIndexEintrag[] {
  const eigene = eigeneTitel(db)
    .map((z) => ({ schluessel: eigenerSchluessel(z.id), titel: z.titel, suchtext: `${z.titel} eigenes zeichen`.toLocaleLowerCase("de-DE") }))
    .sort((a, b) => a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1));
  return [...eigene, ...zeichenIndex()];
}
