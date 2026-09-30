import { anzeigereihenfolge } from "../layout/gruppen";
import { baueBaum, nachkommen } from "./baum";
import { gueltig, leereStelle, loescheStelle, naechsteReihenfolge, PlanFehler, stelleOder } from "./operationen";
import { GRENZE, type Lage, type PlanInhalt, type Stelle } from "./schema";

/**
 * DIE GLIEDERUNG ALS REINE OPERATIONEN (Spec §6.5, §6.6; Umsetzungsplan Phase 3, Entscheidungen 4–8).
 * Diagramm und Gliederung zeigen dieselbe Reihenfolge: Geschwister in ANZEIGEREIHENFOLGE — Busgruppen
 * zusammenhängend, wie `anzeigereihenfolge` sie dem Layout vorgibt. Wo eine Operation die Folge
 * ändert, nummeriert sie die ganze Reihe in der neuen Folge durch (`mitFolge`); so bleibt jede Gruppe
 * zusammen und die Gruppenfolge = Folge des ersten Vorkommens.
 */
export const MELDUNG = {
  ersteEinruecken: "Die erste Stelle einer Ebene lässt sich nicht einrücken.",
  wurzelAusruecken: "Eine Stelle der obersten Ebene lässt sich nicht ausrücken.",
  seiteEbene: "Eine Seitenstelle wechselt ihre Ebene nicht in der Gliederung — dafür „Details“ → „Untersteht“.",
  nichtLeer: "Diese Zeile hat Unter- oder Seitenstellen — löschen über „Aktionen“ → „Stelle löschen“.",
  mitTitel: "Nur eine Zeile ohne Titel wird so gelöscht.",
  inSeitenstelle: "In eine Seitenstelle lässt sich keine Gliederung einfügen — sie trägt keine Unterstellen.",
  erstTitel: "Erst einen Titel eingeben — auf der obersten Ebene und an einer Seitenstelle rückt Enter nicht aus.",
  ohneVerbindung: "Diese Stelle hat selbst keine Verbindung zur Elternstelle.",
  keineGeschwister: "Alle Geschwister haben schon eine Verbindung.",
} as const;
export const zuVieleStellen = (zahl: number) => `Höchstens ${GRENZE.stellen} Stellen je Plan — hier wären es ${zahl}.`;

export function pruefeAnzahl(inhalt: PlanInhalt, dazu: number): void {
  const zahl = inhalt.stellen.length + dazu;
  if (zahl > GRENZE.stellen) throw new PlanFehler(zuVieleStellen(zahl));
}

/** Geschwister derselben Lage in Anzeigereihenfolge; Wurzeln und Seitenstellen ohne Busgruppen (wie das Layout). */
export function reihe(inhalt: PlanInhalt, eltern: string | null, lage: Lage): Stelle[] {
  const baum = baueBaum(inhalt);
  if (lage !== "unter") return eltern === null ? [] : baum.seiten(eltern)[lage];
  return eltern === null ? baum.wurzeln : anzeigereihenfolge(baum.unter(eltern));
}

/** `reihenfolge` 0, 1, 2 … in der Folge `folge`; unveränderte Stellen bleiben dasselbe Objekt. */
function mitFolge(stellen: readonly Stelle[], folge: readonly string[]): Stelle[] {
  const nr = new Map(folge.map((id, i) => [id, i]));
  return stellen.map((s) => { const r = nr.get(s.id); return r === undefined || r === s.reihenfolge ? s : { ...s, reihenfolge: r }; });
}

export interface GliederungsZeile { stelle: Stelle; ebene: number; seite: "links" | "rechts" | null; eltern: Stelle | null }

export function gliederungsZeilen(inhalt: PlanInhalt): GliederungsZeile[] {
  const baum = baueBaum(inhalt);
  const aus: GliederungsZeile[] = [];
  const besuche = (s: Stelle, ebene: number, eltern: Stelle | null) => {
    aus.push({ stelle: s, ebene, seite: null, eltern });
    const seiten = baum.seiten(s.id);
    for (const x of seiten.links) aus.push({ stelle: x, ebene: ebene + 1, seite: "links", eltern: s });
    for (const x of seiten.rechts) aus.push({ stelle: x, ebene: ebene + 1, seite: "rechts", eltern: s });
    for (const k of anzeigereihenfolge(baum.unter(s.id))) besuche(k, ebene + 1, s);
  };
  baum.wurzeln.forEach((w) => besuche(w, 0, null));
  return aus;
}

export function nachbarZeile(zeilen: readonly GliederungsZeile[], id: string, richtung: "hoch" | "runter"): string | null {
  const i = zeilen.findIndex((z) => z.stelle.id === id);
  if (i < 0) return null;
  return zeilen[richtung === "hoch" ? i - 1 : i + 1]?.stelle.id ?? null;
}

export interface ZeilenAktionen { einruecken: boolean; ausruecken: boolean; hoch: boolean; runter: boolean; unterstelle: boolean; seitenstelle: boolean; uebernehmen: boolean }

export function zeilenAktionen(inhalt: PlanInhalt, id: string): ZeilenAktionen {
  const s = stelleOder(inhalt, id);
  const r = reihe(inhalt, s.eltern, s.lage);
  const i = r.findIndex((x) => x.id === id);
  const unter = s.lage === "unter";
  const uebernehmen = unter && s.eltern !== null && s.verbindungId !== null && r.some((x) => x.id !== id && x.verbindungId === null);
  return { einruecken: unter && i > 0, ausruecken: unter && s.eltern !== null, hoch: i > 0, runter: i < r.length - 1, unterstelle: unter, seitenstelle: unter, uebernehmen };
}

/** Entscheidung 12: ausdrücklich, nie geraten — die Verbindung der Stelle für alle Geschwister ohne Verbindung. */
export function setzeVerbindungFuerGeschwister(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.lage !== "unter" || s.eltern === null || s.verbindungId === null) throw new PlanFehler(MELDUNG.ohneVerbindung);
  const ziele = new Set(reihe(inhalt, s.eltern, "unter").filter((x) => x.id !== id && x.verbindungId === null).map((x) => x.id));
  if (ziele.size === 0) throw new PlanFehler(MELDUNG.keineGeschwister);
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((x) => (ziele.has(x.id) ? { ...x, verbindungId: s.verbindungId } : x)) });
}

/** Entscheidung 5. Eine Wurzel bekommt keine Verbindung (die verbindungId einer Wurzel ist kein Weg). */
export function fuegeGeschwisterEin(inhalt: PlanInhalt, nachId: string, id: string): PlanInhalt {
  const s = stelleOder(inhalt, nachId);
  pruefeAnzahl(inhalt, 1);
  const folge = reihe(inhalt, s.eltern, s.lage).map((x) => x.id);
  folge.splice(folge.indexOf(nachId) + 1, 0, id);
  const neu = leereStelle(id, s.eltern, s.lage, 0, s.eltern === null ? null : s.verbindungId);
  return gueltig({ ...inhalt, stellen: mitFolge([...inhalt.stellen, neu], folge) });
}

/** Entscheidung 6: letzte Unterstelle der vorigen Geschwisterstelle, am Bus ihrer bisher letzten Unterstelle. */
export function rueckeEin(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.lage !== "unter") throw new PlanFehler(MELDUNG.seiteEbene);
  const folge = reihe(inhalt, s.eltern, "unter");
  const i = folge.findIndex((x) => x.id === id);
  if (i <= 0) throw new PlanFehler(MELDUNG.ersteEinruecken);
  const eltern = folge[i - 1];
  const verbindungId = reihe(inhalt, eltern.id, "unter").at(-1)?.verbindungId ?? null;
  const reihenfolge = naechsteReihenfolge(inhalt, eltern.id, "unter");
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: eltern.id, reihenfolge, verbindungId } : x)) });
}

/** Entscheidung 6: direkt hinter die Elternstelle, in deren Busgruppe; spätere Geschwister bleiben. */
export function rueckeAus(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.lage !== "unter") throw new PlanFehler(MELDUNG.seiteEbene);
  if (s.eltern === null) throw new PlanFehler(MELDUNG.wurzelAusruecken);
  const eltern = stelleOder(inhalt, s.eltern);
  const folge = reihe(inhalt, eltern.eltern, "unter").map((x) => x.id);
  folge.splice(folge.indexOf(eltern.id) + 1, 0, id);
  const verbindungId = eltern.eltern === null ? null : eltern.verbindungId;
  const stellen = inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: eltern.eltern, verbindungId } : x));
  return gueltig({ ...inhalt, stellen: mitFolge(stellen, folge) });
}

/** Busgruppen einer Reihe als zusammenhängende Läufe gleicher Verbindung (die Anzeigereihenfolge hält sie zusammen). */
function laeufe(folge: readonly Stelle[], gruppiert: boolean): Stelle[][] {
  if (!gruppiert) return folge.map((s) => [s]);
  const aus: Stelle[][] = [];
  for (const s of folge) {
    const letzte = aus.at(-1);
    if (letzte && (letzte[0].verbindungId ?? null) === (s.verbindungId ?? null)) letzte.push(s); else aus.push([s]);
  }
  return aus;
}

/** Entscheidung 7: in der Gruppe tauschen; am Gruppenrand wandert die ganze Gruppe; am Reihenende dasselbe Objekt. */
export function verschiebeInReihe(inhalt: PlanInhalt, id: string, richtung: "hoch" | "runter"): PlanInhalt {
  const s = stelleOder(inhalt, id);
  const gruppen = laeufe(reihe(inhalt, s.eltern, s.lage), s.lage === "unter" && s.eltern !== null);
  const g = gruppen.findIndex((gr) => gr.some((x) => x.id === id));
  const i = gruppen[g].findIndex((x) => x.id === id);
  const d = richtung === "hoch" ? -1 : 1;
  if (gruppen[g][i + d]) [gruppen[g][i], gruppen[g][i + d]] = [gruppen[g][i + d], gruppen[g][i]];
  else if (gruppen[g + d]) [gruppen[g], gruppen[g + d]] = [gruppen[g + d], gruppen[g]];
  else return inhalt;
  return gueltig({ ...inhalt, stellen: mitFolge(inhalt.stellen, gruppen.flat().map((x) => x.id)) });
}

/** Entscheidung 8: nur eine Zeile ohne Titel und ohne Unter- oder Seitenstellen. */
export function loescheLeereZeile(inhalt: PlanInhalt, id: string): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.titel.trim() !== "") throw new PlanFehler(MELDUNG.mitTitel);
  if (nachkommen(baueBaum(inhalt), id).length > 0) throw new PlanFehler(MELDUNG.nichtLeer);
  return loescheStelle(inhalt, id).inhalt;
}
